import type {
  BarricadePhase,
  BarricadeSettings,
  BarricadeSettingsPatch,
  Position,
  Wall,
} from '@whoami/shared';

export interface BarricadePlayerInternal {
  id: string;
  name: string;
  color: string;
  token: string;
  connected: boolean;
  disconnectedAt: number | null;
  afk: boolean;
  position: Position;
  startPosition: Position;
  barricadesRemaining: number;
  wallsPlaced: number;
  movesCount: number;
  score: number;
}

export interface BarricadeTimerState {
  seq: number;
  deadline: number | null;
  remainingMs: number | null;
}

export interface BarricadeGameState {
  code: string;
  hostId: string;
  phase: BarricadePhase;
  pausedFrom: BarricadePhase | null;
  settings: BarricadeSettings;
  players: BarricadePlayerInternal[];
  activeId: string | null;
  turnCount: number;
  walls: Wall[];
  winnerId: string | null;
  timer: BarricadeTimerState | null;
  seen: string[];
  lastActivity: number;
  graceMs: number;
}

export interface BarricadeCtx {
  now: number;
  timerScale?: number;
}

export type BarricadeGameEvent =
  | { type: 'game_started'; activeId: string }
  | { type: 'barricade_moved'; playerId: string; to: Position }
  | { type: 'barricade_wall_placed'; playerId: string; wall: Wall }
  | { type: 'barricade_turn_changed'; activeId: string; turnCount: number }
  | { type: 'barricade_game_over'; winnerId: string }
  | { type: 'player_disconnected'; playerId: string }
  | { type: 'player_reconnected'; playerId: string }
  | { type: 'player_removed'; playerId: string }
  | { type: 'host_changed'; hostId: string }
  | { type: 'paused' }
  | { type: 'resumed' };

export type BarricadeAction =
  | { type: 'join'; actionId: string; playerId: string; name: string; token: string }
  | { type: 'leave'; actionId: string; playerId: string }
  | { type: 'kick'; actionId: string; playerId: string; targetId: string }
  | { type: 'update_barricade_settings'; actionId: string; playerId: string; settings: BarricadeSettingsPatch }
  | { type: 'start_game'; actionId: string; playerId: string }
  | { type: 'barricade_move'; actionId: string; playerId: string; x: number; y: number }
  | { type: 'barricade_place_wall'; actionId: string; playerId: string; orientation: 'h' | 'v'; x: number; y: number }
  | { type: 'restart_game'; actionId: string; playerId: string }
  | { type: 'return_to_lobby'; actionId: string; playerId: string }
  | { type: 'disconnect'; playerId: string }
  | { type: 'reconnect'; playerId: string }
  | { type: 'expire'; seq: number }
  | { type: 'sweep' };

export interface BarricadeError {
  code: string;
  message: string;
}

export type BarricadeResult =
  | { ok: true; state: BarricadeGameState; events: BarricadeGameEvent[]; duplicate: boolean }
  | { ok: false; error: BarricadeError };
