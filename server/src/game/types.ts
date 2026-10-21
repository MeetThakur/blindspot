import type {
  Answer,
  HistoryEntry,
  Phase,
  RoundEndReason,
  RoundResults,
  Settings,
  SkipReason,
  TimerKind,
} from '@whoami/shared';
import type { IdentityList } from './lists.js';
import type { Rng } from './roomCode.js';

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  /** Secret used to resume a session. Never included in snapshots or events. */
  token: string;
  connected: boolean;
  disconnectedAt: number | null;
  afk: boolean;
  consecutiveSkips: number;
}

export interface PendingQuestion {
  askerId: string;
  text: string;
  required: string[];
  answers: Record<string, { answer: Answer; auto: boolean }>;
  /** Answer timer expired under HOST_DECIDES: waiting for the host. */
  timedOut: boolean;
}

export interface RevealState {
  askerId: string;
  text: string;
  answers: { playerId: string; answer: Answer; auto: boolean }[];
}

export interface PlayerStats {
  questionsAsked: number;
  guessesMade: number;
  wrongGuesses: number;
  /** Unfloored; the reported round score is max(0, rawScore). */
  rawScore: number;
}

export interface RoundState {
  /** Clockwise turn order for this round. */
  order: string[];
  turnPos: number;
  cyclesCompleted: number;
  /** 1-based index of the current turn, used in history. */
  turnCount: number;
  /** Private: playerId -> identity. Never leaves the server except through filtered snapshots. */
  assignments: Record<string, string>;
  solved: string[];
  stats: Record<string, PlayerStats>;
  history: HistoryEntry[];
  pending: PendingQuestion | null;
  reveal: RevealState | null;
  results: RoundResults | null;
}

export interface TimerState {
  kind: TimerKind;
  /** Monotonic id; expiry events carrying an older seq are stale and ignored. */
  seq: number;
  /** Epoch ms; null while paused. */
  deadline: number | null;
  remainingMs: number | null;
}

export interface GameState {
  code: string;
  hostId: string;
  players: PlayerState[];
  phase: Phase;
  pausedFrom: Phase | null;
  settings: Settings;
  list: IdentityList | null;
  /** Ring order fixed for the game; the starter rotates each round. */
  seating: string[];
  starterIdx: number;
  roundNumber: number;
  totals: Record<string, number>;
  round: RoundState | null;
  timer: TimerState | null;
  seq: number;
  /** Recently processed `${playerId}:${actionId}` keys, for idempotency. */
  seen: string[];
  lastActivity: number;
  /** Disconnect grace period for this room. */
  graceMs: number;
}

export interface Ctx {
  now: number;
  rng: Rng;
  /** Override for the fixed reveal display time (tests, tuning). */
  revealMs?: number;
  /** Multiplies configurable timer lengths (tests only; 1 in production). */
  timerScale?: number;
}

export type GameEvent =
  | { type: 'game_started'; round: number }
  | { type: 'turn_changed'; activeId: string; turn: number }
  | { type: 'question_submitted'; askerId: string; text: string }
  | { type: 'question_cancelled'; askerId: string }
  | { type: 'answer_progress'; answeredBy: string[]; required: string[] }
  | { type: 'answers_revealed'; askerId: string; text: string; answers: RevealState['answers'] }
  | { type: 'guess_result'; playerId: string; text: string; correct: boolean }
  | { type: 'player_solved'; playerId: string }
  | { type: 'turn_skipped'; playerId: string; reason: SkipReason }
  | { type: 'round_ended'; reason: RoundEndReason }
  | { type: 'player_disconnected'; playerId: string }
  | { type: 'player_reconnected'; playerId: string }
  | { type: 'player_removed'; playerId: string }
  | { type: 'host_changed'; hostId: string }
  | { type: 'paused' }
  | { type: 'resumed' };

type WithAction<T> = T & { actionId: string };

export type Action =
  | WithAction<{ type: 'join'; playerId: string; name: string; token: string }>
  | WithAction<{ type: 'leave'; playerId: string }>
  | WithAction<{ type: 'kick'; playerId: string; targetId: string }>
  | WithAction<{ type: 'update_settings'; playerId: string; settings?: unknown; list?: unknown }>
  | WithAction<{ type: 'start_game'; playerId: string }>
  | WithAction<{ type: 'submit_question'; playerId: string; text: string }>
  | WithAction<{ type: 'submit_answer'; playerId: string; answer: Answer }>
  | WithAction<{ type: 'submit_guess'; playerId: string; text: string }>
  | WithAction<{ type: 'next_turn'; playerId: string }>
  | WithAction<{ type: 'skip_answer'; playerId: string; targetId?: string }>
  | WithAction<{ type: 'skip_turn'; playerId: string }>
  | WithAction<{ type: 'end_round'; playerId: string }>
  | WithAction<{ type: 'restart_round'; playerId: string }>
  | WithAction<{ type: 'return_to_lobby'; playerId: string }>
  | { type: 'disconnect'; playerId: string }
  | { type: 'reconnect'; playerId: string }
  | { type: 'expire'; kind: TimerKind; seq: number }
  | { type: 'sweep' };

export interface GameError {
  code: string;
  message: string;
}

export type Result =
  | { ok: true; state: GameState; events: GameEvent[]; duplicate: boolean }
  | { ok: false; error: GameError };
