import {
  BATTLESHIP_GRID_SIZE,
  BATTLESHIP_MAX_PLAYERS,
  BATTLESHIP_MIN_PLAYERS,
  BattleshipPhase,
  DEFAULT_BATTLESHIP_SETTINGS,
  ErrorCode,
  type BattleshipShot,
} from '@whoami/shared';
import {
  checkHit,
  generateRandomFleet,
  isShipSunk,
  isValidFleetPlacement,
} from './fleet.js';
import type {
  BattleshipAction,
  BattleshipCtx,
  BattleshipGameEvent,
  BattleshipGameState,
  BattleshipPlayerInternal,
  BattleshipResult,
} from './types.js';

const PLAYER_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B'] as const;

export function createBattleshipRoom(params: {
  code: string;
  hostId: string;
  hostName: string;
  hostToken: string;
  now: number;
  graceMs: number;
}): BattleshipGameState {
  const host: BattleshipPlayerInternal = {
    id: params.hostId,
    name: params.hostName,
    color: PLAYER_COLORS[0],
    token: params.hostToken,
    connected: true,
    disconnectedAt: null,
    afk: false,
    ready: false,
    alive: true,
    score: 0,
    ships: [],
    shotsReceived: [],
    sunkShips: [],
  };

  return {
    code: params.code,
    hostId: params.hostId,
    phase: BattleshipPhase.LOBBY,
    pausedFrom: null,
    settings: { ...DEFAULT_BATTLESHIP_SETTINGS },
    players: [host],
    activeId: null,
    turnCount: 0,
    winnerId: null,
    lastShot: null,
    timer: null,
    seen: [],
    lastActivity: params.now,
    graceMs: params.graceMs,
  };
}

function nextActivePlayerId(state: BattleshipGameState, fromId?: string): string | null {
  const aliveConnected = state.players.filter((p) => p.connected && p.alive);
  if (aliveConnected.length === 0) return null;
  const currentId = fromId ?? state.activeId;
  const idx = aliveConnected.findIndex((p) => p.id === currentId);
  if (idx === -1) {
    const first = aliveConnected[0];
    return first ? first.id : null;
  }
  const next = aliveConnected[(idx + 1) % aliveConnected.length];
  return next ? next.id : null;
}

function armTurnTimer(state: BattleshipGameState, ctx: BattleshipCtx): void {
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

export function reduceBattleship(
  state: BattleshipGameState,
  action: BattleshipAction,
  ctx: BattleshipCtx,
): BattleshipResult {
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
      if (s.phase !== BattleshipPhase.LOBBY) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Game has already started.' } };
      }
      if (s.players.length >= BATTLESHIP_MAX_PLAYERS) {
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
      const newPlayer: BattleshipPlayerInternal = {
        id: action.playerId,
        name: action.name.trim(),
        color,
        token: action.token,
        connected: true,
        disconnectedAt: null,
        afk: false,
        ready: false,
        alive: true,
        score: 0,
        ships: [],
        shotsReceived: [],
        sunkShips: [],
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
      const events: BattleshipGameEvent[] = [
        { type: 'player_removed', playerId: action.playerId },
      ];

      if (isHost && s.players.length > 0) {
        const nextHost = s.players.find((p) => p.connected) ?? s.players[0];
        if (nextHost) {
          s.hostId = nextHost.id;
          events.push({ type: 'host_changed', hostId: nextHost.id });
        }
      }

      if (s.phase === BattleshipPhase.PLAYING || s.phase === BattleshipPhase.PLACEMENT) {
        const aliveConnected = s.players.filter((p) => p.connected && p.alive);
        if (aliveConnected.length < BATTLESHIP_MIN_PLAYERS) {
          if (s.phase === BattleshipPhase.PLAYING && aliveConnected.length === 1) {
            // Remaining player wins!
            const winner = aliveConnected[0]!;
            s.phase = BattleshipPhase.GAME_OVER;
            s.winnerId = winner.id;
            winner.score += 1;
            s.timer = null;
            events.push({ type: 'battleship_game_over', winnerId: winner.id });
          } else {
            s.phase = BattleshipPhase.LOBBY;
            s.activeId = null;
            s.timer = null;
          }
        } else if (leavingActive) {
          s.activeId = nextActivePlayerId(s, action.playerId);
          s.turnCount += 1;
          armTurnTimer(s, ctx);
          if (s.activeId) {
            events.push({ type: 'battleship_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
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
      if (s.phase !== BattleshipPhase.LOBBY) {
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

    case 'update_battleship_settings': {
      if (s.hostId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_HOST, message: 'Only the host can change settings.' } };
      }
      if (s.phase !== BattleshipPhase.LOBBY) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Settings locked during match.' } };
      }
      s.settings = { ...s.settings, ...action.settings };
      remember();
      return { ok: true, state: s, events: [], duplicate: false };
    }

    case 'start_game': {
      if (s.hostId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_HOST, message: 'Only the host can start the game.' } };
      }
      if (s.phase !== BattleshipPhase.LOBBY) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Game already started.' } };
      }
      const connected = s.players.filter((p) => p.connected);
      if (connected.length < BATTLESHIP_MIN_PLAYERS) {
        return {
          ok: false,
          error: {
            code: ErrorCode.NOT_ENOUGH_PLAYERS,
            message: `At least ${BATTLESHIP_MIN_PLAYERS} players are required to start Battleship.`,
          },
        };
      }

      // Enter ship deployment phase
      s.phase = BattleshipPhase.PLACEMENT;
      s.pausedFrom = null;
      s.winnerId = null;
      s.lastShot = null;
      s.activeId = null;
      s.turnCount = 0;
      s.timer = null;

      for (const p of s.players) {
        p.ready = false;
        p.alive = true;
        p.ships = [];
        p.shotsReceived = [];
        p.sunkShips = [];
      }

      remember();
      return {
        ok: true,
        state: s,
        events: [{ type: 'game_started', phase: s.phase }],
        duplicate: false,
      };
    }

    case 'battleship_place_ships': {
      if (s.phase !== BattleshipPhase.PLACEMENT) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Not in ship placement phase.' } };
      }
      const player = s.players.find((p) => p.id === action.playerId);
      if (!player) {
        return { ok: false, error: { code: ErrorCode.NOT_IN_ROOM, message: 'Player not found.' } };
      }

      const validation = isValidFleetPlacement(action.ships, BATTLESHIP_GRID_SIZE);
      if (!validation.valid) {
        return {
          ok: false,
          error: { code: ErrorCode.SHIP_OVERLAP, message: validation.reason ?? 'Invalid fleet placement.' },
        };
      }

      player.ships = structuredClone(action.ships);
      player.ready = true;

      const events: BattleshipGameEvent[] = [];

      // Check if all connected players are now ready
      const connected = s.players.filter((p) => p.connected);
      const allReady = connected.every((p) => p.ready);

      if (allReady && connected.length >= BATTLESHIP_MIN_PLAYERS) {
        s.phase = BattleshipPhase.PLAYING;
        const firstPlayer = connected[0];
        s.activeId = firstPlayer ? firstPlayer.id : null;
        s.turnCount = 1;
        armTurnTimer(s, ctx);
        events.push({ type: 'game_started', phase: s.phase });
        if (s.activeId) {
          events.push({ type: 'battleship_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
        }
      }

      remember();
      return { ok: true, state: s, events, duplicate: false };
    }

    case 'battleship_fire': {
      if (s.phase !== BattleshipPhase.PLAYING) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Combat phase is not active.' } };
      }
      if (s.activeId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_YOUR_TURN, message: 'Not your turn to fire.' } };
      }
      if (action.targetId === action.playerId) {
        return { ok: false, error: { code: ErrorCode.CANNOT_TARGET_SELF, message: 'You cannot target your own fleet.' } };
      }
      const attacker = s.players.find((p) => p.id === action.playerId);
      const target = s.players.find((p) => p.id === action.targetId);
      if (!attacker || !target) {
        return { ok: false, error: { code: ErrorCode.INVALID_INPUT, message: 'Target player not found.' } };
      }
      if (!target.alive) {
        return { ok: false, error: { code: ErrorCode.TARGET_ELIMINATED, message: 'Target fleet has already been eliminated.' } };
      }
      if (action.x < 0 || action.x >= BATTLESHIP_GRID_SIZE || action.y < 0 || action.y >= BATTLESHIP_GRID_SIZE) {
        return { ok: false, error: { code: ErrorCode.INVALID_INPUT, message: 'Target coordinate out of bounds.' } };
      }

      // Check if coordinate was already shot on target
      const alreadyShot = target.shotsReceived.some((s) => s.x === action.x && s.y === action.y);
      if (alreadyShot) {
        return { ok: false, error: { code: ErrorCode.ALREADY_TARGETED, message: 'Coordinates have already been targeted.' } };
      }

      // Check hit against target ships
      const { hit, ship: hitShip } = checkHit(target.ships, action.x, action.y);

      const shot: BattleshipShot = {
        attackerId: attacker.id,
        targetId: target.id,
        x: action.x,
        y: action.y,
        result: hit ? 'hit' : 'miss',
        turn: s.turnCount,
      };

      const events: BattleshipGameEvent[] = [];

      if (hit && hitShip) {
        // Check if ship is sunk
        const potentialShots = [...target.shotsReceived, shot];
        const sunk = isShipSunk(hitShip, potentialShots);
        if (sunk) {
          shot.sunkShip = hitShip.name;
          if (!target.sunkShips.includes(hitShip.name)) {
            target.sunkShips.push(hitShip.name);
            events.push({ type: 'battleship_ship_sunk', targetId: target.id, shipName: hitShip.name });
          }

          // Check if all ships of target are sunk
          if (target.sunkShips.length === target.ships.length) {
            target.alive = false;
            events.push({ type: 'battleship_player_eliminated', playerId: target.id });

            // Check if only 1 player remains alive
            const remainingAlive = s.players.filter((p) => p.alive);
            if (remainingAlive.length <= 1) {
              const winner = remainingAlive[0] ?? attacker;
              s.phase = BattleshipPhase.GAME_OVER;
              s.winnerId = winner.id;
              winner.score += 1;
              s.timer = null;
              events.push({ type: 'battleship_game_over', winnerId: winner.id });
            }
          }
        }
      }

      target.shotsReceived.push(shot);
      s.lastShot = shot;
      events.unshift({ type: 'battleship_shot_result', shot });

      // Advance turn if game is still in playing phase
      if (s.phase === BattleshipPhase.PLAYING) {
        const keepsTurn = s.settings.extraShotOnHit && hit && target.alive;
        if (!keepsTurn) {
          s.activeId = nextActivePlayerId(s);
          s.turnCount += 1;
        }
        armTurnTimer(s, ctx);
        if (s.activeId) {
          events.push({ type: 'battleship_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
        }
      }

      remember();
      return { ok: true, state: s, events, duplicate: false };
    }

    case 'restart_game': {
      if (s.phase !== BattleshipPhase.GAME_OVER && s.phase !== BattleshipPhase.PLAYING) {
        return { ok: false, error: { code: ErrorCode.WRONG_PHASE, message: 'Cannot restart right now.' } };
      }
      s.phase = BattleshipPhase.PLACEMENT;
      s.pausedFrom = null;
      s.winnerId = null;
      s.lastShot = null;
      s.activeId = null;
      s.turnCount = 0;
      s.timer = null;

      for (const p of s.players) {
        p.ready = false;
        p.alive = true;
        p.ships = [];
        p.shotsReceived = [];
        p.sunkShips = [];
      }

      remember();
      return {
        ok: true,
        state: s,
        events: [{ type: 'game_started', phase: s.phase }],
        duplicate: false,
      };
    }

    case 'return_to_lobby': {
      if (s.hostId !== action.playerId) {
        return { ok: false, error: { code: ErrorCode.NOT_HOST, message: 'Only the host can return to lobby.' } };
      }
      s.phase = BattleshipPhase.LOBBY;
      s.pausedFrom = null;
      s.winnerId = null;
      s.lastShot = null;
      s.activeId = null;
      s.turnCount = 0;
      s.timer = null;

      for (const p of s.players) {
        p.ready = false;
        p.alive = true;
        p.ships = [];
        p.shotsReceived = [];
        p.sunkShips = [];
      }

      remember();
      return { ok: true, state: s, events: [], duplicate: false };
    }

    case 'disconnect': {
      const p = s.players.find((x) => x.id === action.playerId);
      if (!p) return { ok: true, state: s, events: [], duplicate: false };
      p.connected = false;
      p.disconnectedAt = ctx.now;
      const events: BattleshipGameEvent[] = [
        { type: 'player_disconnected', playerId: p.id },
      ];

      // If playing and active player disconnected, pass turn
      if (s.phase === BattleshipPhase.PLAYING && s.activeId === p.id) {
        s.activeId = nextActivePlayerId(s, p.id);
        s.turnCount += 1;
        armTurnTimer(s, ctx);
        if (s.activeId) {
          events.push({ type: 'battleship_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
        }
      }

      // If host disconnected, pause game
      if (s.hostId === p.id && (s.phase === BattleshipPhase.PLAYING || s.phase === BattleshipPhase.PLACEMENT)) {
        s.pausedFrom = s.phase;
        s.phase = BattleshipPhase.PAUSED;
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
      const events: BattleshipGameEvent[] = [
        { type: 'player_reconnected', playerId: p.id },
      ];

      // If host reconnected and room was paused, resume
      if (s.hostId === p.id && s.phase === BattleshipPhase.PAUSED && s.pausedFrom) {
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
      if (s.phase === BattleshipPhase.PLACEMENT) {
        // Auto-place fleet for players who didn't finish in time
        for (const p of s.players) {
          if (!p.ready && p.connected) {
            p.ships = generateRandomFleet(BATTLESHIP_GRID_SIZE);
            p.ready = true;
          }
        }
        s.phase = BattleshipPhase.PLAYING;
        const firstPlayer = s.players[0];
        s.activeId = firstPlayer ? firstPlayer.id : null;
        s.turnCount = 1;
        armTurnTimer(s, ctx);
        const events: BattleshipGameEvent[] = [{ type: 'game_started', phase: s.phase }];
        if (s.activeId) {
          events.push({ type: 'battleship_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
        }
        return { ok: true, state: s, events, duplicate: false };
      }

      if (s.phase === BattleshipPhase.PLAYING) {
        // Turn timeout: pass turn to next player
        s.activeId = nextActivePlayerId(s);
        s.turnCount += 1;
        armTurnTimer(s, ctx);
        const events: BattleshipGameEvent[] = [];
        if (s.activeId) {
          events.push({ type: 'battleship_turn_changed', activeId: s.activeId, turnCount: s.turnCount });
        }
        return { ok: true, state: s, events, duplicate: false };
      }

      return { ok: true, state: s, events: [], duplicate: false };
    }

    case 'sweep': {
      const events: BattleshipGameEvent[] = [];
      // Remove players who exceeded grace period while disconnected
      const kept: BattleshipPlayerInternal[] = [];
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

export function nextBattleshipDeadline(state: BattleshipGameState): number | null {
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
