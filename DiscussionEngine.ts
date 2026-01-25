
import { DiscussionState, EngineContext, DiscussionEvent } from './types';

export function calculateDominance(talkTime: Record<string, number>, speakers: string[]): number {
  const times = speakers.map(s => talkTime[s] || 0);
  const total = times.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const max = Math.max(...times);
  const mean = total / (speakers.length || 1);
  return (max - mean) / (total + 1e-6);
}

export class DiscussionEngine {
  private ctx: EngineContext;
  private state: DiscussionState = DiscussionState.MONITORING;

  constructor(speakers: string[], thresholds: Partial<EngineContext> = {}) {
    const talkTime: Record<string, number> = {};
    speakers.forEach(s => talkTime[s] = 0);

    this.ctx = {
      speakers: [...speakers],
      activeSpeaker: null,
      quietSpeaker: null,
      talkTime,
      totalSeconds: 0,
      silenceSeconds: 0,

      autoMode: thresholds.autoMode ?? true,
      imbalanceScoreThreshold: thresholds.imbalanceScoreThreshold ?? 0.35,
      imbalanceHoldSeconds: thresholds.imbalanceHoldSeconds ?? 15,
      nudgeHoldSeconds: thresholds.nudgeHoldSeconds ?? 10,
      turnHoldSeconds: 60, // Fixed 60s

      imbalanceSince: null,
      nudgeSince: null,
      stateSince: 0,
      turnSince: 0,

      turnOrder: [],
      turnIndex: 0,

      dominanceScore: 0,
      imbalanceFlag: false,
    };
  }

  private computeQuietSpeaker(): string | null {
    const speakers = this.ctx.speakers;
    if (!speakers.length) return null;
    let minSpeaker = speakers[0];
    let minTime = this.ctx.talkTime[minSpeaker] ?? Infinity;
    for (const s of speakers) {
      const t = this.ctx.talkTime[s] ?? 0;
      if (t < minTime) {
        minTime = t;
        minSpeaker = s;
      }
    }
    return minSpeaker;
  }

  private setState(next: DiscussionState) {
    const prevState = this.state;
    if (prevState === next) return;
    this.state = next;
    this.ctx.stateSince = this.ctx.totalSeconds;

    if (this.state === DiscussionState.MONITORING) {
      if (prevState === DiscussionState.CHECKIN) {
        const resetTalkTime: Record<string, number> = {};
        this.ctx.speakers.forEach(s => resetTalkTime[s] = 0);
        this.ctx.talkTime = resetTalkTime;
        this.ctx.dominanceScore = 0;
        this.ctx.imbalanceFlag = false;
        this.ctx.imbalanceSince = null;
        this.ctx.quietSpeaker = null;
      }
      this.ctx.activeSpeaker = null;
    } else if (this.state === DiscussionState.STRUCTURED) {
      // User requested to always start from the first speaker regardless of who was last or quiet.
      const order = [...this.ctx.speakers];

      this.ctx.turnOrder = order;
      this.ctx.turnIndex = 0;
      this.ctx.activeSpeaker = order[0] || null;
      this.ctx.turnSince = this.ctx.totalSeconds;
    } else if (this.state === DiscussionState.PAUSE) {
      this.ctx.activeSpeaker = null;
      this.ctx.silenceSeconds = 0;
    } else if (this.state === DiscussionState.CHECKIN) {
      this.ctx.activeSpeaker = null;
    }
    
    this.updateMetrics();
  }

  private autoAdvanceIfNeeded() {
    if (!this.ctx.autoMode) return;
    const now = this.ctx.totalSeconds;

    switch (this.state) {
      case DiscussionState.MONITORING: {
        if (this.ctx.imbalanceFlag) {
          if (this.ctx.imbalanceSince === null) this.ctx.imbalanceSince = now;
          if (now - this.ctx.imbalanceSince >= this.ctx.imbalanceHoldSeconds) {
            this.ctx.imbalanceSince = null;
            this.setState(DiscussionState.IMBALANCE);
          }
        } else {
          this.ctx.imbalanceSince = null;
        }
        break;
      }
      case DiscussionState.IMBALANCE: {
        // Changed from 4s to 10s per user request
        if (now - this.ctx.stateSince >= 10) this.setState(DiscussionState.NUDGE);
        break;
      }
      case DiscussionState.NUDGE: {
        if (now - this.ctx.stateSince >= this.ctx.nudgeHoldSeconds) this.setState(DiscussionState.STRUCTURED);
        break;
      }
      case DiscussionState.STRUCTURED: {
        const turnElapsed = now - this.ctx.turnSince;
        if (this.ctx.turnOrder.length > 0 && turnElapsed >= this.ctx.turnHoldSeconds) {
          this.nextTurn();
        }
        break;
      }
      case DiscussionState.PAUSE: {
        if (now - this.ctx.stateSince >= 20) this.setState(DiscussionState.CHECKIN);
        break;
      }
      case DiscussionState.CHECKIN: {
        if (now - this.ctx.stateSince >= 20) this.setState(DiscussionState.MONITORING);
        break;
      }
    }
  }

  private nextTurn() {
    if (this.state !== DiscussionState.STRUCTURED) return;

    this.ctx.turnIndex += 1;

    if (this.ctx.turnIndex >= this.ctx.turnOrder.length) {
      this.setState(DiscussionState.PAUSE);
    } else {
      this.ctx.activeSpeaker = this.ctx.turnOrder[this.ctx.turnIndex];
      this.ctx.turnSince = this.ctx.totalSeconds;
    }
  }

  private updateMetrics() {
    if (this.state === DiscussionState.STRUCTURED || this.state === DiscussionState.PAUSE) {
      this.ctx.dominanceScore = 0;
      this.ctx.imbalanceFlag = false;
    } else {
      this.ctx.dominanceScore = calculateDominance(this.ctx.talkTime, this.ctx.speakers);
      this.ctx.imbalanceFlag = this.ctx.dominanceScore >= this.ctx.imbalanceScoreThreshold;
    }
  }

  public send(event: DiscussionEvent) {
    switch (event.type) {
      case 'SPEAKER_SET':
        if (this.state === DiscussionState.STRUCTURED) {
          const idx = this.ctx.turnOrder.indexOf(event.name);
          if (idx !== -1) {
            this.ctx.turnIndex = idx;
            this.ctx.activeSpeaker = event.name;
            this.ctx.turnSince = this.ctx.totalSeconds;
          }
        } else {
          this.ctx.activeSpeaker = event.name;
        }
        break;
      case 'SET_QUIET_SPEAKER':
        this.ctx.quietSpeaker = event.name;
        break;
      case 'SET_AUTO_MODE':
        this.ctx.autoMode = event.enabled;
        break;
      case 'SILENCE':
        this.ctx.activeSpeaker = null;
        break;
      case 'TICK': {
        const dt = event.seconds;
        this.ctx.totalSeconds += dt;
        if (this.ctx.activeSpeaker && this.ctx.talkTime[this.ctx.activeSpeaker] !== undefined) {
          this.ctx.talkTime = {
            ...this.ctx.talkTime,
            [this.ctx.activeSpeaker]: this.ctx.talkTime[this.ctx.activeSpeaker] + dt
          };
          this.ctx.silenceSeconds = 0;
        } else {
          this.ctx.silenceSeconds += dt;
        }
        this.updateMetrics();
        this.autoAdvanceIfNeeded();
        break;
      }
      case 'ADD_SPEAKER':
        if (!this.ctx.speakers.includes(event.name)) {
          this.ctx.speakers = [...this.ctx.speakers, event.name];
          this.ctx.talkTime = { ...this.ctx.talkTime, [event.name]: 0 };
          this.updateMetrics();
        }
        break;
      case 'REMOVE_SPEAKER':
        this.ctx.speakers = this.ctx.speakers.filter(s => s !== event.name);
        const newTalkTime = { ...this.ctx.talkTime };
        delete newTalkTime[event.name];
        this.ctx.talkTime = newTalkTime;
        if (this.ctx.activeSpeaker === event.name) this.ctx.activeSpeaker = null;
        if (this.ctx.quietSpeaker === event.name) this.ctx.quietSpeaker = null;
        this.updateMetrics();
        break;
      case 'SET_TALK_TIME':
        if (this.ctx.talkTime[event.name] !== undefined) {
          this.ctx.talkTime = { ...this.ctx.talkTime, [event.name]: Math.max(0, event.seconds) };
          this.updateMetrics();
        }
        break;
      case 'SET_SILENCE':
        this.ctx.silenceSeconds = Math.max(0, event.seconds);
        this.updateMetrics();
        break;
      case 'FORCE_STATE':
        this.setState(event.state);
        break;
      case 'NEXT_TURN':
        this.nextTurn();
        break;
    }
  }

  public snapshot() {
    return {
      state: this.state,
      context: { ...this.ctx }
    };
  }
}
