import {
  BARRICADE_CENTER,
  BARRICADE_GRID_SIZE,
  BARRICADE_MAX_PLAYERS,
  BARRICADE_MIN_PLAYERS,
  BarricadePhase,
  DEFAULT_BARRICADE_SETTINGS,
  ErrorCode,
  type Position,
  type Wall,
} from '@whoami/shared';
import {
  canAllReachGoal,
  getValidMoves,
  isValidWallPlacement,
} from './pathfinding.js';
import type {
  BarricadeAction,
  BarricadeCtx,
  BarricadeGameEvent,
  BarricadeGameState,
  BarricadePlayerInternal,
  BarricadeResult,
} from './types.js';

const PLAYER_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B'] as const;

export function getStartingPositions(playerCount: number): Position[] {
  if (playerCount <= 2) {
    return [
      { x: BARRICADE_CENTER, y: BARRICADE_GRID_SIZE - 1 }, // P0: Bottom (4, 8)
      { x: BARRICADE_CENTER, y: 0 },                        // P1: Top (4, 0)
    ];
  }
  if (playerCount === 3) {
    return [
      { x: BARRICADE_CENTER, y: BARRICADE_GRID_SIZE - 1 }, // P0: Bottom (4, 8)
      { x: 0, y: BARRICADE_CENTER },                        // P1: Left (0, 4)
      { x: BARRICADE_GRID_SIZE - 1, y: BARRICADE_CENTER }, // P2: Right (8, 4)
    ];
  }
  return [
    { x: BARRICADE_CENTER, y: BARRICADE_GRID_SIZE - 1 }, // P0: Bottom (4, 8)
    { x: 0, y: BARRICADE_CENTER },                        // P1: Left (0, 4)
    { x: BARRICADE_CENTER, y: 0 },                        // P2: Top (4, 0)
    { x: BARRICADE_GRID_SIZE - 1, y: BARRICADE_CENTER }, // P3: Right (8, 4)
  ];
}

export function createBarricadeRoom(params: {
  code: string;
  hostId: string;
  hostName: string;
  hostToken: string;
  now: number;
  graceMs: number;
}): BarricadeGameState {
  const host: BarricadePlayerInternal = {
    id: params.hostId,
    name: params.hostName,
    color: PLAYER_COLORS[0],
    token: params.hostToken,
    connected: true,
    disconnectedAt: null,
    afk: false,
    position: { x: BARRICADE_CENTER, y: BARRICADE_GRID_SIZE - 1 },
    startPosition: { x: BARRICADE_CENTER, y: BARRICADE_GRID_SIZE - 1 },
    barricadesRemaining: DEFAULT_BARRICADE_SETTINGS.barricadesPerPlayer,
    wallsPlaced: 0,
    movesCount: 0,
    score: 0,
  };

  return {
    code: params.code,
    hostId: params.hostId,
    phase: BarricadePhase.LOBBY,
    pausedFrom: null,
    settings: { ...DEFAULT_BARRICADE_SETTINGS },
    players: [host],
    activeId: null,
    turnCount: 0,
    walls: [],
    winnerId: null,
    timer: null,
    seen: [],
    lastActivity: params.now,
    graceMs: params.graceMs,
  };
}

function nextActivePlayerId(state: BarricadeGameState, fromId?: string): string | null {
  const connected = state.players.filter((p) => p.connected);
  if (connected.length === 0) return null;
  const currentId = fromId ?? state.activeId;
  const idx = connected.findIndex((p) => p.id === currentId);
  if (idx === -1) {
    const first = connected[0];
    return first ? first.id : null;
  }
  const next = connected[(idx + 1) % connected.length];
  return next ? next.id : null;
}

function armTurnTimer(state: BarricadeGameState, ctx: BarricadeCtx): void {
  const timeoutSec = state.settings.turnTimeoutSec;
  if (!timeoutSec) {
    state.timer = null;
    return;
  }
  const scale = ctx.timerScale ?? 1;
  const seq = (state.timer?.seq ?? 0) + 1;
  state.timer = {
    seq,
    deadline: ctx.now + timeoutSec * 1000 * scale,
    remainingMs: timeoutSec * 1000 * scale,
  };
}

export function reduceBarricade(
  state: BarricadeGameState,
  action: BarricadeAction,
  ctx: BarricadeCtx,
): BarricadeResult {
  if ('actionId' in action) {
    const key = `${action.playerId}:${action.actionId}`;
    if (state.seen.includes(key)) {
      return { ok: true, state, events: [], duplicate: true };
    }
  }

  const s = structuredClone(state);
  s.lastActivity = ctx.now;

  const remember = () => {
    if ('actionId' in action) {
      s.seen = [...s.seen.slice(-99), `${action.playerId}:${action.actionId}`];
    }
  };

  switch (action.type) {
    case 'join': {
      if (s.phase !== BarricadePhase.LOBBY) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Game has already started.' } };
      }
      if (s.players.length >= BARRICADE_MAX_PLAYERS) {
        return { ok: false, error: { code: ErrorCode.ROOM_FULL, message: 'Room is full.' } };
      }
      const existing = s.players.find((p) => p.id === action.playerId);
      if (existing) {
        existing.connected = true;
        existing.disconnectedAt = null;
        remember();
        return { ok: true, state: s, events: [], duplicate: false };
      }
      const color = PLAYER_COLORS[s.players.length % PLAYER_COLORS.length] ?? '#3B82F6';
      const newPlayer: BarricadePlayerInternal = {
        id: action.playerId,
        name: action.name.trim(),
        color,
        token: action.token,
        connected: true,
        disconnectedAt: null,
        afk: false,
        position: { x: 0, y: 0 },
        startPosition: { x: 0, y: 0 },
        barricadesRemaining: s.settings.barricadesPerPlayer,
        wallsPlaced: 0,
        movesCount: 0,
        score: 0,
      };
      s.players.push(newPlayer);
      remember();
      return { ok: true, state: s, events: [], duplicate: false };
    }

    case 'leave': {
      const idx = s.players.findIndex((p) => p.id === action.playerId);
      if (idx === -1) {
        return { ok: false, error: { code: ErrorCode.NOT_IN_ROOM, message: 'Player not in room.' } };
      }
      const isHost = s.hostId === action.playerId;
      const leavingActive = s.activeId === action.playerId;
      s.players.splice(idx, 1);
      const events: BarricadeGameEvent[] = [
        { type: 'player_removed', playerId: action.playerId },
      ];

      if (isHost && s.players.length > 0) {
        const nextHost = s.players.find((p) => p.connected) ?? s.players[0];
        if (nextHost) {
          s.hostId = nextHost.id;
          events.push({ type: 'host_changed', hostId: nextHost.id });
        }
      }

      if (s.phase === BarricadePhase.PLAYING) {
        const connected = s.players.filter((p) => p.connected);
        if (connected.length < BARRICADE_MIN_PLAYERS) {
          s.phase = BarricadePhase.LOBBY;
          s.activeId = null;
          s.timer = null;
        } else if (leavingActive) {
          s.activeId = nextActivePlayerId(s, action.playerId);
          s.turnCount += 1;
          armTurnTimer(s, ctx);
          if (s.activeId) {
            events.push({ type: 'barricade_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
          }
        }
      }
      remember();
      return { ok: true, state: s, events, duplicate: false };
    }

    case 'kick': {
      if (s.hostId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_HOST, message: 'Only the host can kick players.' } };
      }
      if (s.phase !== BarricadePhase.LOBBY) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Cannot kick during a game.' } };
      }
      const targetIdx = s.players.findIndex((p) => p.id === action.targetId);
      if (targetIdx === -1) {
        return { ok: false, error: { code: ErrorCode.INVALID_INPUT, message: 'Player not found.' } };
      }
      s.players.splice(targetIdx, 1);
      remember();
      return {
        ok: true,
        state: s,
        events: [{ type: 'player_removed', playerId: action.targetId }],
        duplicate: false,
      };
    }

    case 'update_barricade_settings': {
      if (s.hostId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_HOST, message: 'Only the host can change settings.' } };
      }
      if (s.phase !== BarricadePhase.LOBBY) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Settings locked while playing.' } };
      }
      s.settings = { ...s.settings, ...action.settings };
      for (const p of s.players) {
        p.barricadesRemaining = s.settings.barricadesPerPlayer;
      }
      remember();
      return { ok: true, state: s, events: [], duplicate: false };
    }

    case 'start_game': {
      if (s.hostId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_HOST, message: 'Only the host can start the game.' } };
      }
      if (s.phase !== BarricadePhase.LOBBY) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Game already started.' } };
      }
      const connected = s.players.filter((p) => p.connected);
      if (connected.length < BARRICADE_MIN_PLAYERS) {
        return {
          ok: false,
          error: {
            code: ErrorCode.NOT_ENOUGH_PLAYERS,
            message: `At least ${BARRICADE_MIN_PLAYERS} players are required to start Barricade.`,
          },
        };
      }

      // Initialize starting positions
      const starts = getStartingPositions(s.players.length);
      for (let i = 0; i < s.players.length; i++) {
        const player = s.players[i];
        const start = starts[i];
        if (player && start) {
          player.position = { x: start.x, y: start.y };
          player.startPosition = { x: start.x, y: start.y };
          player.barricadesRemaining = s.settings.barricadesPerPlayer;
          player.wallsPlaced = 0;
          player.movesCount = 0;
        }
      }

      s.phase = BarricadePhase.PLAYING;
      s.pausedFrom = null;
      s.walls = [];
      s.winnerId = null;
      const firstPlayer = s.players[0];
      s.activeId = firstPlayer ? firstPlayer.id : null;
      s.turnCount = 1;

      armTurnTimer(s, ctx);
      remember();
      return {
        ok: true,
        state: s,
        events: s.activeId ? [{ type: 'game_started', activeId: s.activeId }] : [],
        duplicate: false,
      };
    }

    case 'barricade_move': {
      if (s.phase !== BarricadePhase.PLAYING) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Game is not in playing phase.' } };
      }
      if (s.activeId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_YOUR_TURN, message: 'Not your turn.' } };
      }
      const player = s.players.find((p) => p.id === action.playerId);
      if (!player) {
        return { ok: false, error: { code: ErrorCode.NOT_IN_ROOM, message: 'Player not found.' } };
      }

      const validMoves = getValidMoves(player.position, s.players, s.walls);
      const isLegal = validMoves.some((m) => m.x === action.x && m.y === action.y);
      if (!isLegal) {
        return { ok: false, error: { code: ErrorCode.INVALID_MOVE, message: 'Illegal move destination.' } };
      }

      player.position = { x: action.x, y: action.y };
      player.movesCount += 1;
      const targetPos = { x: action.x, y: action.y };

      const events: BarricadeGameEvent[] = [
        { type: 'barricade_moved', playerId: player.id, to: targetPos },
      ];

      // Check win condition (reaching center 4,4)
      if (action.x === BARRICADE_CENTER && action.y === BARRICADE_CENTER) {
        s.phase = BarricadePhase.GAME_OVER;
        s.winnerId = player.id;
        player.score += 1;
        s.timer = null;
        events.push({ type: 'barricade_game_over', winnerId: player.id });
      } else {
        // Next turn
        s.activeId = nextActivePlayerId(s);
        s.turnCount += 1;
        armTurnTimer(s, ctx);
        if (s.activeId) {
          events.push({ type: 'barricade_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
        }
      }

      remember();
      return { ok: true, state: s, events, duplicate: false };
    }

    case 'barricade_place_wall': {
      if (s.phase !== BarricadePhase.PLAYING) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Game is not in playing phase.' } };
      }
      if (s.activeId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_YOUR_TURN, message: 'Not your turn.' } };
      }
      const player = s.players.find((p) => p.id === action.playerId);
      if (!player) {
        return { ok: false, error: { code: ErrorCode.NOT_IN_ROOM, message: 'Player not found.' } };
      }
      if (player.barricadesRemaining <= 0) {
        return {
          ok: false,
          error: { code: ErrorCode.NO_BARRICADES_LEFT, message: 'You have no barricades remaining.' },
        };
      }

      const wall: Wall = { orientation: action.orientation, x: action.x, y: action.y };
      const placement = isValidWallPlacement(wall, s.walls);
      if (!placement.valid) {
        return {
          ok: false,
          error: { code: ErrorCode.WALL_OVERLAP, message: placement.reason ?? 'Invalid wall placement.' },
        };
      }

      // Check if wall seals off any player from center
      const testWalls = [...s.walls, wall];
      const goal = { x: BARRICADE_CENTER, y: BARRICADE_CENTER };
      const allCanReach = canAllReachGoal(
        s.players.filter((p) => p.connected),
        goal,
        testWalls,
      );
      if (!allCanReach) {
        return {
          ok: false,
          error: {
            code: ErrorCode.WALL_TRAPS_PLAYER,
            message: 'A barricade cannot completely seal off a player from the center!',
          },
        };
      }

      // Commit wall
      s.walls.push(wall);
      player.barricadesRemaining -= 1;
      player.wallsPlaced += 1;

      // Next turn
      s.activeId = nextActivePlayerId(s);
      s.turnCount += 1;
      armTurnTimer(s, ctx);

      const events: BarricadeGameEvent[] = [
        { type: 'barricade_wall_placed', playerId: player.id, wall },
      ];
      if (s.activeId) {
        events.push({ type: 'barricade_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
      }

      remember();
      return { ok: true, state: s, events, duplicate: false };
    }

    case 'restart_game': {
      if (s.phase !== BarricadePhase.GAME_OVER && s.phase !== BarricadePhase.PLAYING) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Cannot restart right now.' } };
      }
      const starts = getStartingPositions(s.players.length);
      for (let i = 0; i < s.players.length; i++) {
        const player = s.players[i];
        const start = starts[i];
        if (player && start) {
          player.position = { x: start.x, y: start.y };
          player.startPosition = { x: start.x, y: start.y };
          player.barricadesRemaining = s.settings.barricadesPerPlayer;
          player.wallsPlaced = 0;
          player.movesCount = 0;
        }
      }
      s.phase = BarricadePhase.PLAYING;
      s.pausedFrom = null;
      s.walls = [];
      s.winnerId = null;
      const firstPlayer = s.players[0];
      s.activeId = firstPlayer ? firstPlayer.id : null;
      s.turnCount = 1;
      armTurnTimer(s, ctx);
      remember();
      return {
        ok: true,
        state: s,
        events: s.activeId ? [{ type: 'game_started', activeId: s.activeId }] : [],
        duplicate: false,
      };
    }

    case 'return_to_lobby': {
      if (s.hostId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_HOST, message: 'Only the host can return to lobby.' } };
      }
      s.phase = BarricadePhase.LOBBY;
      s.pausedFrom = null;
      s.walls = [];
      s.winnerId = null;
      s.activeId = null;
      s.timer = null;
      for (const p of s.players) {
        p.barricadesRemaining = s.settings.barricadesPerPlayer;
      }
      remember();
      return { ok: true, state: s, events: [], duplicate: false };
    }

    case 'disconnect': {
      const p = s.players.find((x) => x.id === action.playerId);
      if (!p) return { ok: true, state: s, events: [], duplicate: false };
      p.connected = false;
      p.disconnectedAt = ctx.now;
      const events: BarricadeGameEvent[] = [
        { type: 'player_disconnected', playerId: p.id },
      ];

      // If playing and the active player disconnected, pass turn
      if (s.phase === BarricadePhase.PLAYING && s.activeId === p.id) {
        s.activeId = nextActivePlayerId(s, p.id);
        s.turnCount += 1;
        armTurnTimer(s, ctx);
        if (s.activeId) {
          events.push({ type: 'barricade_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
        }
      }

      // If host disconnected, pause game
      if (s.hostId === p.id && s.phase === BarricadePhase.PLAYING) {
        s.pausedFrom = s.phase;
        s.phase = BarricadePhase.PAUSED;
        if (s.timer && s.timer.deadline !== null) {
          s.timer.remainingMs = Math.max(0, s.timer.deadline - ctx.now);
          s.timer.deadline = null;
        }
        events.push({ type: 'paused' });
      }

      return { ok: true, state: s, events, duplicate: false };
    }

    case 'reconnect': {
      const p = s.players.find((x) => x.id === action.playerId);
      if (!p) return { ok: true, state: s, events: [], duplicate: false };
      p.connected = true;
      p.disconnectedAt = null;
      const events: BarricadeGameEvent[] = [
        { type: 'player_reconnected', playerId: p.id },
      ];

      // If host reconnected and room was paused, resume
      if (s.hostId === p.id && s.phase === BarricadePhase.PAUSED && s.pausedFrom) {
        s.phase = s.pausedFrom;
        s.pausedFrom = null;
        if (s.timer && s.timer.remainingMs !== null) {
          s.timer.deadline = ctx.now + s.timer.remainingMs;
        }
        events.push({ type: 'resumed' });
      }

      return { ok: true, state: s, events, duplicate: false };
    }

    case 'expire': {
      if (!s.timer || s.timer.seq !== action.seq) {
        return { ok: true, state: s, events: [], duplicate: false };
      }
      if (s.phase !== BarricadePhase.PLAYING) {
        return { ok: true, state: s, events: [], duplicate: false };
      }
      // Turn timeout: advance turn
      s.activeId = nextActivePlayerId(s);
      s.turnCount += 1;
      armTurnTimer(s, ctx);
      const events: BarricadeGameEvent[] = [];
      if (s.activeId) {
        events.push({ type: 'barricade_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
      }
      return { ok: true, state: s, events, duplicate: false };
    }

    case 'sweep': {
      const events: BarricadeGameEvent[] = [];
      // Remove players who exceeded grace period while disconnected
      const kept: BarricadePlayerInternal[] = [];
      for (const p of s.players) {
        if (!p.connected && p.disconnectedAt !== null && ctx.now - p.disconnectedAt >= s.graceMs) {
          events.push({ type: 'player_removed', playerId: p.id });
        } else {
          kept.push(p);
        }
      }
      s.players = kept;

      // Migrate host if host was removed
      if (!s.players.some((p) => p.id === s.hostId) && s.players.length > 0) {
        const nextHost = s.players.find((p) => p.connected) ?? s.players[0];
        if (nextHost) {
          s.hostId = nextHost.id;
          events.push({ type: 'host_changed', hostId: nextHost.id });
        }
      }

      return { ok: true, state: s, events, duplicate: false };
    }

    default:
      return { ok: true, state: s, events: [], duplicate: false };
  }
}

export function nextBarricadeDeadline(state: BarricadeGameState): number | null {
  const times: number[] = [];
  if (state.timer && state.timer.deadline !== null) {
    times.push(state.timer.deadline);
  }
  for (const p of state.players) {
    if (!p.connected && p.disconnectedAt !== null) {
      times.push(p.disconnectedAt + state.graceMs);
    }
  }
  if (times.length === 0) return null;
  return Math.min(...times);
}
