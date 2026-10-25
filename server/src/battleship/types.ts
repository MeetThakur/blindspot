import type {
  BattleshipPhase,
  BattleshipSettings,
  BattleshipSettingsPatch,
  BattleshipShipPlacement,
  BattleshipShot,
} from '@whoami/shared';

export interface BattleshipPlayerInternal {
  id: string;
  name: string;
  color: string;
  token: string;
  connected: boolean;
  disconnectedAt: number | null;
  afk: boolean;
  ready: boolean;
  alive: boolean;
  score: number;
  ships: BattleshipShipPlacement[];
  shotsReceived: BattleshipShot[];
  sunkShips: string[];
}

export interface BattleshipTimerState {
  seq: number;
  deadline: number | null;
  remainingMs: number | null;
}

export interface BattleshipGameState {
  code: string;
  hostId: string;
  phase: BattleshipPhase;
  pausedFrom: BattleshipPhase | null;
  settings: BattleshipSettings;
  players: BattleshipPlayerInternal[];
  activeId: string | null;
  turnCount: number;
  winnerId: string | null;
  lastShot: BattleshipShot | null;
  timer: BattleshipTimerState | null;
  seen: string[];
  lastActivity: number;
  graceMs: number;
}

export interface BattleshipCtx {
  now: number;
  timerScale?: number;
}

export type BattleshipGameEvent =
  | { type: 'game_started'; phase: BattleshipPhase }
  | { type: 'battleship_shot_result'; shot: BattleshipShot }
  | { type: 'battleship_ship_sunk'; targetId: string; shipName: string }
  | { type: 'battleship_player_eliminated'; playerId: string }
  | { type: 'battleship_turn_changed'; activeId: string; turnCount: number }
  | { type: 'battleship_game_over'; winnerId: string }
  | { type: 'player_disconnected'; playerId: string }
  | { type: 'player_reconnected'; playerId: string }
  | { type: 'player_removed'; playerId: string }
  | { type: 'host_changed'; hostId: string }
  | { type: 'paused' }
  | { type: 'resumed' };

export type BattleshipAction =
  | { type: 'join'; actionId: string; playerId: string; name: string; token: string }
  | { type: 'leave'; actionId: string; playerId: string }
  | { type: 'kick'; actionId: string; playerId: string; targetId: string }
  | { type: 'update_battleship_settings'; actionId: string; playerId: string; settings: BattleshipSettingsPatch }
  | { type: 'start_game'; actionId: string; playerId: string }
  | { type: 'battleship_place_ships'; actionId: string; playerId: string; ships: BattleshipShipPlacement[] }
  | { type: 'battleship_fire'; actionId: string; playerId: string; targetId: string; x: number; y: number }
  | { type: 'restart_game'; actionId: string; playerId: string }
  | { type: 'return_to_lobby'; actionId: string; playerId: string }
  | { type: 'disconnect'; playerId: string }
  | { type: 'reconnect'; playerId: string }
  | { type: 'expire'; seq: number }
  | { type: 'sweep' };

export interface BattleshipError {
  code: string;
  message: string;
}

export type BattleshipResult =
  | { ok: true; state: BattleshipGameState; events: BattleshipGameEvent[]; duplicate: boolean }
  | { ok: false; error: BattleshipError };
