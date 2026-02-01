
import { DiscussionState, EngineContext, DiscussionEvent } from './types';

/**
 * Calculates Dominance Score based on the formula:
 * Dominance Score = (MaxTalkTime - MeanTalkTime) / (TotalTalkTime + 10^-6)
 */
export function calculateDominance(talkTime: Record<string, number>, speakers: string[], totalTalkTime: number): number {
  if (speakers.length === 0 || totalTalkTime <= 0) return 0;
  
  const times = speakers.map(s => talkTime[s] || 0);
  const max = Math.max(...times);
  const mean = totalTalkTime / speakers.length;
  
  return (max - mean) / (totalTalkTime + 1e-6);
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
      totalTalkTime: 0,
      currentMonologueSeconds: 0,

      autoMode: thresholds.autoMode ?? true,
      quietMode: false,
      imbalanceScoreThreshold: thresholds.imbalanceScoreThreshold ?? 0.35,
      imbalanceHoldSeconds: 15, // 15s warning in Monitoring
      nudgeHoldSeconds: 15,     // 15s in Nudge mode

      turnHoldSeconds: 60,

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

  private setState(next: DiscussionState) {
    const prevState = this.state;
    if (prevState === next) return;
    this.state = next;

    if (this.state === DiscussionState.MONITORING) {
      if (prevState === DiscussionState.CHECKIN) {
        this.ctx.totalSeconds = 0;
        this.ctx.totalTalkTime = 0;
        this.ctx.currentMonologueSeconds = 0;
        this.ctx.silenceSeconds = 0;
        this.ctx.imbalanceSince = null;
        this.ctx.imbalanceFlag = false;
        this.ctx.dominanceScore = 0;
        
        const resetTalkTime: Record<string, number> = {};
        this.ctx.speakers.forEach(s => resetTalkTime[s] = 0);
        this.ctx.talkTime = resetTalkTime;
      }
      this.ctx.activeSpeaker = null;
    } else if (this.state === DiscussionState.STRUCTURED) {
      const order = [...this.ctx.speakers];
      this.ctx.turnOrder = order;
      this.ctx.turnIndex = 0;
      this.ctx.activeSpeaker = order[0] || null;
      this.ctx.turnSince = this.ctx.totalSeconds;
      this.ctx.currentMonologueSeconds = 0;
    } else if (this.state === DiscussionState.PAUSE) {
      this.ctx.activeSpeaker = null;
      this.ctx.silenceSeconds = 0;
      this.ctx.currentMonologueSeconds = 0;
    } else if (this.state === DiscussionState.CHECKIN) {
      this.ctx.activeSpeaker = null;
      this.ctx.currentMonologueSeconds = 0;
    }

    this.ctx.stateSince = this.ctx.totalSeconds;
    this.updateMetrics();
  }

  private autoAdvanceIfNeeded() {
    if (!this.ctx.autoMode) return;
    const now = this.ctx.totalSeconds;

    switch (this.state) {
      case DiscussionState.MONITORING: {
        if (this.ctx.quietMode) {
          this.ctx.imbalanceSince = null;
          break;
        }

        // Only process imbalance if the flag is active (handles Grace Period and restored balance)
        if (this.ctx.imbalanceFlag) {
          if (this.ctx.imbalanceSince === null) this.ctx.imbalanceSince = now;
          if (now - this.ctx.imbalanceSince >= this.ctx.imbalanceHoldSeconds) {
            this.ctx.imbalanceSince = null;
            this.setState(DiscussionState.IMBALANCE);
          }
        } else {
          // Reset the timer if balance is restored or speaker changed
          this.ctx.imbalanceSince = null;
        }
        break;
      }
      case DiscussionState.IMBALANCE: {
        if (now - this.ctx.stateSince >= 15) this.setState(DiscussionState.NUDGE);
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
      this.ctx.currentMonologueSeconds = 0;
    }
  }

  private updateMetrics() {
    // Basic metrics calculation
    this.ctx.dominanceScore = calculateDominance(this.ctx.talkTime, this.ctx.speakers, this.ctx.totalTalkTime);
    
    // Requested: Grace Period of 15 seconds at the start of the discussion.
    const isGracePeriod = this.ctx.totalSeconds < 15;

    if (this.state === DiscussionState.STRUCTURED || 
        this.state === DiscussionState.PAUSE || 
        this.state === DiscussionState.NUDGE || 
        this.state === DiscussionState.CHECKIN ||
        this.ctx.quietMode ||
        isGracePeriod) { // Added isGracePeriod check
      this.ctx.imbalanceFlag = false;
    } else {
      const isScoreImbalanced = this.ctx.dominanceScore >= this.ctx.imbalanceScoreThreshold;
      const isMonologueImbalanced = this.ctx.currentMonologueSeconds >= 15;
      this.ctx.imbalanceFlag = isScoreImbalanced || isMonologueImbalanced;
    }
  }

  public send(event: DiscussionEvent) {
    switch (event.type) {
      case 'SPEAKER_SET':
        if (this.ctx.activeSpeaker !== event.name) {
          this.ctx.currentMonologueSeconds = 0;
        }
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
      case 'SET_QUIET_MODE':
        this.ctx.quietMode = event.enabled;
        this.updateMetrics();
        break;
      case 'SILENCE':
        this.ctx.activeSpeaker = null;
        this.ctx.currentMonologueSeconds = 0;
        break;
      case 'TICK': {
        const dt = event.seconds;
        this.ctx.totalSeconds += dt;
        if (this.ctx.activeSpeaker && this.ctx.talkTime[this.ctx.activeSpeaker] !== undefined) {
          this.ctx.talkTime = {
            ...this.ctx.talkTime,
            [this.ctx.activeSpeaker]: (this.ctx.talkTime[this.ctx.activeSpeaker] || 0) + dt
          };
          this.ctx.totalTalkTime += dt;
          this.ctx.currentMonologueSeconds += dt;
          this.ctx.silenceSeconds = 0;
        } else {
          this.ctx.silenceSeconds += dt;
          this.ctx.currentMonologueSeconds = 0;
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
        const removedTime = newTalkTime[event.name] || 0;
        delete newTalkTime[event.name];
        this.ctx.talkTime = newTalkTime;
        this.ctx.totalTalkTime = Math.max(0, this.ctx.totalTalkTime - removedTime);
        
        if (this.ctx.activeSpeaker === event.name) {
          this.ctx.activeSpeaker = null;
          this.ctx.currentMonologueSeconds = 0;
        }
        if (this.ctx.quietSpeaker === event.name) this.ctx.quietSpeaker = null;
        this.updateMetrics();
        break;
      case 'SET_TALK_TIME':
        if (this.ctx.talkTime[event.name] !== undefined) {
          const oldVal = this.ctx.talkTime[event.name];
          this.ctx.talkTime = { ...this.ctx.talkTime, [event.name]: Math.max(0, event.seconds) };
          this.ctx.totalTalkTime = this.ctx.totalTalkTime - oldVal + Math.max(0, event.seconds);
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
