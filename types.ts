
export enum DiscussionState {
  MONITORING = "monitoring",
  IMBALANCE = "imbalanceDetected",
  NUDGE = "nudge",
  STRUCTURED = "structuredTurnTaking",
  PAUSE = "reflectionPause",
  CHECKIN = "checkIn",
}

export interface EngineContext {
  speakers: string[];
  activeSpeaker: string | null;

  /** Manually selected quiet speaker (or auto-assigned when auto mode needs one). */
  quietSpeaker: string | null;

  talkTime: Record<string, number>;
  totalSeconds: number;
  silenceSeconds: number;
  
  /** Total duration of all talking activity (sum of all speech), used as denominator in Dominance Score. */
  totalTalkTime: number;

  /** Current continuous talk duration for the current active speaker. Resets on change/silence. */
  currentMonologueSeconds: number;

  /** If true, the engine will advance states automatically on each TICK. */
  autoMode: boolean;

  /** If true, imbalance detection is paused and score is forced to 0. */
  quietMode: boolean;

  imbalanceScoreThreshold: number;
  imbalanceHoldSeconds: number;
  nudgeHoldSeconds: number;

  /** Seconds per speaker in STRUCTURED mode before auto-advancing to next turn (auto mode only). */
  turnHoldSeconds: number;

  imbalanceSince: number | null;
  nudgeSince: number | null;
  
  /** Timestamp when current state started. */
  stateSince: number;
  /** Timestamp when current structured turn started. */
  turnSince: number;

  turnOrder: string[];
  turnIndex: number;

  dominanceScore: number;
  imbalanceFlag: boolean;
}

export type DiscussionEvent =
  | { type: 'SPEAKER_SET', name: string }
  | { type: 'SILENCE' }
  | { type: 'TICK', seconds: number }
  | { type: 'NEXT_TURN' }
  | { type: 'SET_QUIET_SPEAKER', name: string | null }
  | { type: 'SET_AUTO_MODE', enabled: boolean }
  | { type: 'SET_QUIET_MODE', enabled: boolean }
  | { type: 'TURNS_COMPLETE' }
  | { type: 'PAUSE_DONE' }
  | { type: 'CHECKIN', canContinue: boolean }
  | { type: 'ADD_SPEAKER', name: string }
  | { type: 'REMOVE_SPEAKER', name: string }
  | { type: 'SET_TALK_TIME', name: string, seconds: number }
  | { type: 'SET_SILENCE', seconds: number }
  | { type: 'FORCE_STATE', state: DiscussionState };
