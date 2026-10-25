import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import {
  ErrorCode,
  clientEventSchemas,
  type ClientEventName,
  type ClientEventPayload,
  type SessionPayload,
} from '@whoami/shared';
import { defaultConfig, type ServerConfig } from './config.js';
import {
  createBarricadeRoom,
  nextBarricadeDeadline,
  reduceBarricade,
  snapshotForBarricade,
  type BarricadeAction,
  type BarricadeGameEvent,
} from './barricade/index.js';
import {
  createRoom,
  nextDeadline,
  reduce,
  snapshotFor,
  type Action,
  type GameState,
  type GameEvent,
} from './game/index.js';
import { RateLimiter } from './rateLimiter.js';
import { RoomRegistry, newPlayerId, newReconnectToken, type Room } from './rooms.js';

interface Session {
  roomCode: string;
  playerId: string;
}
interface SocketData {
  session?: Session;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameSocket = Socket<any, any, any, SocketData>;

class Rejection extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const reject = (code: string, message: string): never => {
  throw new Rejection(code, message);
};

export interface GameServer {
  httpServer: HttpServer;
  io: Server;
  registry: RoomRegistry;
  config: ServerConfig;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
  /** Drops rooms empty longer than the TTL and old rate-limit history. */
  sweep(): string[];
}

function clientIp(socket: GameSocket, hops: number): string {
  if (hops > 0) {
    const xff = socket.handshake.headers['x-forwarded-for'];
    const parts = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
    // The proxy appends the address it saw, so count from the right; anything left of that is client-supplied.
    const ip = parts[parts.length - hops];
    if (ip) return ip;
  }
  return socket.handshake.address;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createGameServer(overrides: Partial<ServerConfig> = {}, clock: () => number = Date.now): GameServer {
  const config: ServerConfig = { ...defaultConfig(), ...overrides };
  const registry = new RoomRegistry(config.maxRooms, config.maxRoomsPerIp, config.roomEmptyTtlMs);
  const createLimiter = new RateLimiter(config.createLimit.max, config.createLimit.windowMs, clock);
  const joinLimiter = new RateLimiter(config.joinLimit.max, config.joinLimit.windowMs, clock);
  const invalidLimiter = new RateLimiter(config.invalidLimit.max, config.invalidLimit.windowMs, clock);
  const rng = Math.random;

  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (req, res) => {
    const origin = req.headers.origin;
    if (origin && config.clientOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.json({ ok: true });
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: config.maxPayloadBytes,
    // Browsers always send Origin on WebSocket handshakes; refuse other sites. Non-browser clients send none.
    allowRequest: (req: IncomingMessage, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || config.clientOrigins.includes(origin));
    },
  });

  registry.onRemove = (room) => {
    if (room.wake) clearTimeout(room.wake);
    room.wake = null;
  };

  const ctx = () => ({ now: clock(), rng, revealMs: config.revealDurationMs, timerScale: config.timerScale });

  // ------------------------------------------------------------ emit helpers

  const socketOf = (id: string) => io.sockets.sockets.get(id) as GameSocket | undefined;

  function emitToRoom(room: Room, name: string, payload: unknown): void {
    for (const sid of room.sockets.values()) io.to(sid).emit(name, payload);
  }

  function sendError(socket: GameSocket, code: string, message: string, actionId?: string): void {
    invalidLimiter.record(socket.id);
    socket.emit('game_error', { code, message, ...(actionId ? { actionId } : {}) });
  }

  function broadcastSnapshots(room: Room, skipSocket?: string): void {
    if (room.gameType === 'barricade' && room.barricadeState) {
      for (const [playerId, sid] of room.sockets) {
        if (sid !== skipSocket) io.to(sid).emit('room_updated', snapshotForBarricade(room.barricadeState, playerId, clock()));
      }
      return;
    }
    if (!room.state) return;
    for (const [playerId, sid] of room.sockets) {
      if (sid !== skipSocket) io.to(sid).emit('room_updated', snapshotFor(room.state, playerId, clock()));
    }
  }

  function emitBarricadeEvents(room: Room, events: BarricadeGameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'game_started':
        case 'barricade_moved':
        case 'barricade_wall_placed':
        case 'barricade_turn_changed':
        case 'barricade_game_over':
        case 'player_disconnected':
        case 'player_reconnected': {
          const { type, ...payload } = e;
          emitToRoom(room, type, payload);
          break;
        }
        default:
          break;
      }
    }
  }

  function emitGameEvents(room: Room, events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'game_started':
        case 'turn_changed':
        case 'question_submitted':
        case 'answer_progress':
        case 'answers_revealed':
        case 'guess_result':
        case 'player_solved':
        case 'round_ended':
        case 'player_disconnected':
        case 'player_reconnected': {
          const { type, ...payload } = e;
          emitToRoom(room, type, payload);
          break;
        }
        default:
          break; // covered by room_updated
      }
    }
  }

  function unbind(room: Room, playerId: string, notify?: { code: string; message: string }): void {
    const sid = room.sockets.get(playerId);
    room.sockets.delete(playerId);
    if (!sid) return;
    const sock = socketOf(sid);
    if (sock) {
      sock.data.session = undefined;
      if (notify) sock.emit('game_error', notify);
    }
  }

  function touchEmpty(room: Room): void {
    room.emptySince = room.sockets.size === 0 ? (room.emptySince ?? clock()) : null;
  }

  /** Serialized state minus bookkeeping, to tell whether a sweep actually changed anything. */
  const quiet = (st: GameState): string => JSON.stringify({ ...st, lastActivity: 0, seen: [] });

  /** Runs one reducer step for a room and fans the result out. Returns false if rejected. */
  function dispatch(room: Room, action: Action, socket?: GameSocket, skipSocket?: string): boolean {
    if (!room.state) return false;
    const res = reduce(room.state, action, ctx());
    if (!res.ok) {
      if (socket) sendError(socket, res.error.code, res.error.message, 'actionId' in action ? action.actionId : undefined);
      return false;
    }
    if (res.duplicate) return true;
    const unchanged = action.type === 'sweep' && res.events.length === 0 && quiet(room.state) === quiet(res.state);
    room.state = res.state;
    if (unchanged) {
      schedule(room);
      return true;
    }
    for (const e of res.events) {
      if (e.type !== 'player_removed') continue;
      const selfInitiated = action.type === 'leave' && action.playerId === e.playerId;
      unbind(
        room,
        e.playerId,
        selfInitiated ? undefined : { code: ErrorCode.KICKED, message: 'You were removed from the room.' },
      );
    }
    emitGameEvents(room, res.events);
    broadcastSnapshots(room, skipSocket);
    if (room.state.players.length === 0) registry.delete(room.code);
    else {
      touchEmpty(room);
      schedule(room);
    }
    return true;
  }

  /** Keeps exactly one timeout armed for the room's earliest deadline; the server owns all timers. */
  function schedule(room: Room): void {
    if (room.wake) clearTimeout(room.wake);
    room.wake = null;
    if (!room.state) return;
    const at = nextDeadline(room.state);
    if (at === null) return;
    // An already-overdue deadline that a sweep could not resolve (e.g. nobody left to inherit host)
    // is retried slowly instead of spinning.
    const lead = at - clock();
    const delay = lead <= 0 ? 1000 : lead + 5;
    room.wake = setTimeout(() => {
      room.wake = null;
      if (!registry.get(room.code) || !room.state) return;
      const t = room.state.timer;
      if (t && t.deadline !== null && clock() >= t.deadline) {
        dispatch(room, { type: 'expire', kind: t.kind, seq: t.seq });
      }
      // Always re-dispatch a sweep: it handles grace periods and re-arms the next wake-up.
      dispatch(room, { type: 'sweep' });
    }, delay);
  }

  function scheduleBarricade(room: Room): void {
    if (room.wake) clearTimeout(room.wake);
    room.wake = null;
    if (!room.barricadeState) return;
    const at = nextBarricadeDeadline(room.barricadeState);
    if (at === null) return;
    const lead = at - clock();
    const delay = lead <= 0 ? 1000 : lead + 5;
    room.wake = setTimeout(() => {
      room.wake = null;
      if (!registry.get(room.code) || !room.barricadeState) return;
      const t = room.barricadeState.timer;
      if (t && t.deadline !== null && clock() >= t.deadline) {
        dispatchBarricade(room, { type: 'expire', seq: t.seq });
      }
      dispatchBarricade(room, { type: 'sweep' });
    }, delay);
  }

  function dispatchBarricade(
    room: Room,
    action: BarricadeAction,
    socket?: GameSocket,
    skipSocket?: string,
  ): boolean {
    if (!room.barricadeState) return false;
    const res = reduceBarricade(room.barricadeState, action, {
      now: clock(),
      timerScale: config.timerScale,
    });
    if (!res.ok) {
      if (socket) sendError(socket, res.error.code, res.error.message, 'actionId' in action ? action.actionId : undefined);
      return false;
    }
    if (res.duplicate) return true;
    room.barricadeState = res.state;
    for (const e of res.events) {
      if (e.type !== 'player_removed') continue;
      const selfInitiated = action.type === 'leave' && action.playerId === e.playerId;
      unbind(
        room,
        e.playerId,
        selfInitiated ? undefined : { code: ErrorCode.KICKED, message: 'You were removed from the room.' },
      );
    }
    emitBarricadeEvents(room, res.events);
    broadcastSnapshots(room, skipSocket);
    if (room.barricadeState.players.length === 0) registry.delete(room.code);
    else {
      touchEmpty(room);
      scheduleBarricade(room);
    }
    return true;
  }

  function bind(room: Room, socket: GameSocket, playerId: string): void {
    room.sockets.set(playerId, socket.id);
    room.emptySince = null;
    socket.data.session = { roomCode: room.code, playerId };
  }

  function sessionPayload(room: Room, playerId: string): SessionPayload {
    if (room.gameType === 'barricade' && room.barricadeState) {
      const token = room.barricadeState.players.find((p) => p.id === playerId)!.token;
      return { playerId, reconnectToken: token, snapshot: snapshotForBarricade(room.barricadeState, playerId, clock()) };
    }
    const token = room.state!.players.find((p) => p.id === playerId)!.token;
    return { playerId, reconnectToken: token, snapshot: snapshotFor(room.state!, playerId, clock()) };
  }

  // ---------------------------------------------------------------- sockets

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as GameSocket;
    const ip = clientIp(socket, config.trustProxyHops);

    const current = (): { room: Room; playerId: string } => {
      const s = socket.data.session;
      const room = s && registry.get(s.roomCode);
      if (!s || !room) return reject(ErrorCode.NOT_IN_ROOM, 'You are not in a room.');
      return { room, playerId: s.playerId };
    };

    function on<K extends ClientEventName>(name: K, handler: (p: ClientEventPayload<K>) => void): void {
      socket.on(name as string, (raw: unknown) => {
        if (invalidLimiter.isLimited(socket.id)) {
          socket.emit('game_error', { code: ErrorCode.RATE_LIMITED, message: 'Slow down a little.' });
          return;
        }
        const parsed = clientEventSchemas[name].safeParse(raw);
        if (!parsed.success) {
          const actionId = (raw as { actionId?: unknown } | null)?.actionId;
          sendError(socket, ErrorCode.PAYLOAD_INVALID, 'That request was not valid.', typeof actionId === 'string' ? actionId.slice(0, 64) : undefined);
          return;
        }
        try {
          handler(parsed.data as ClientEventPayload<K>);
        } catch (e) {
          if (e instanceof Rejection) {
            sendError(socket, e.code, e.message, (parsed.data as { actionId?: string }).actionId);
          } else {
            console.error(`handler ${name} failed`, e instanceof Error ? e.message : 'unknown error');
            sendError(socket, 'INTERNAL', 'Something went wrong.');
          }
        }
      });
    }

    on('create_room', (p) => {
      if (socket.data.session) reject(ErrorCode.ALREADY_IN_ROOM, 'Leave your current room first.');
      if (!createLimiter.take(ip)) reject(ErrorCode.RATE_LIMITED, 'Too many rooms created. Please wait a few minutes.');
      const why = registry.canCreate(ip);
      if (why) reject(ErrorCode.RATE_LIMITED, why);

      const code = registry.allocateCode();
      const playerId = newPlayerId();
      const gameType = p.gameType ?? 'blindspot';

      if (gameType === 'barricade') {
        const barricadeState = createBarricadeRoom({
          code,
          hostId: playerId,
          hostName: p.name.replace(/\s+/g, ' '),
          hostToken: newReconnectToken(),
          now: clock(),
          graceMs: config.disconnectGraceMs,
        });
        const room: Room = { code, gameType: 'barricade', barricadeState, creatorIp: ip, sockets: new Map(), emptySince: null, wake: null };
        registry.add(room);
        bind(room, socket, playerId);
        socket.emit('room_created', sessionPayload(room, playerId));
      } else {
        const state = createRoom({
          code,
          hostId: playerId,
          hostName: p.name.replace(/\s+/g, ' '),
          hostToken: newReconnectToken(),
          now: clock(),
          graceMs: config.disconnectGraceMs,
        });
        const room: Room = { code, gameType: 'blindspot', state, creatorIp: ip, sockets: new Map(), emptySince: null, wake: null };
        registry.add(room);
        bind(room, socket, playerId);
        socket.emit('room_created', sessionPayload(room, playerId));
      }
    });

    on('join_room', (p) => {
      if (socket.data.session) reject(ErrorCode.ALREADY_IN_ROOM, 'Leave your current room first.');
      if (!joinLimiter.take(ip)) reject(ErrorCode.RATE_LIMITED, 'Too many join attempts. Please wait a minute.');
      const room = registry.get(p.roomCode) ?? reject(ErrorCode.ROOM_NOT_FOUND, 'Room not found. Check the code and try again.');
      const playerId = newPlayerId();
      const ok = room.gameType === 'barricade'
        ? dispatchBarricade(
            room,
            { type: 'join', actionId: p.actionId, playerId, name: p.name, token: newReconnectToken() },
            socket,
            socket.id,
          )
        : dispatch(
            room,
            { type: 'join', actionId: p.actionId, playerId, name: p.name, token: newReconnectToken() },
            socket,
            socket.id,
          );
      if (!ok) return;
      bind(room, socket, playerId);
      socket.emit('room_joined', sessionPayload(room, playerId));
    });

    on('resume_session', (p) => {
      if (socket.data.session) reject(ErrorCode.ALREADY_IN_ROOM, 'Leave your current room first.');
      if (!joinLimiter.take(ip)) reject(ErrorCode.RATE_LIMITED, 'Too many attempts. Please wait a minute.');
      const room = registry.get(p.roomCode) ?? reject(ErrorCode.ROOM_NOT_FOUND, 'That room no longer exists.');
      const players = room.gameType === 'barricade' ? room.barricadeState?.players ?? [] : room.state?.players ?? [];
      const player = players.find((x) => safeEqual(x.token, p.reconnectToken));
      if (!player) return reject(ErrorCode.SESSION_INVALID, 'Your session has expired. Please rejoin.');
      const old = room.sockets.get(player.id);
      if (old && old !== socket.id) {
        unbind(room, player.id, { code: ErrorCode.SESSION_INVALID, message: 'You signed in from another tab.' });
      }
      bind(room, socket, player.id);
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'reconnect', playerId: player.id }, socket, socket.id);
      } else {
        dispatch(room, { type: 'reconnect', playerId: player.id }, socket, socket.id);
      }
      socket.emit('room_joined', sessionPayload(room, player.id));
    });

    on('update_room_settings', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'update_settings', actionId: p.actionId, playerId, settings: p.settings, list: p.list }, socket);
    });

    on('start_game', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'start_game', actionId: p.actionId, playerId }, socket);
      } else {
        dispatch(room, { type: 'start_game', actionId: p.actionId, playerId }, socket);
      }
    });

    on('update_barricade_settings', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'update_barricade_settings', actionId: p.actionId, playerId, settings: p.settings }, socket);
      }
    });

    on('barricade_move', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'barricade_move', actionId: p.actionId, playerId, x: p.x, y: p.y }, socket);
      }
    });

    on('barricade_place_wall', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'barricade_place_wall', actionId: p.actionId, playerId, orientation: p.orientation, x: p.x, y: p.y }, socket);
      }
    });

    on('submit_question', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'submit_question', actionId: p.actionId, playerId, text: p.text }, socket);
    });

    on('submit_answer', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'submit_answer', actionId: p.actionId, playerId, answer: p.answer }, socket);
    });

    on('next_turn', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'next_turn', actionId: p.actionId, playerId }, socket);
    });

    on('skip_answer', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'skip_answer', actionId: p.actionId, playerId, targetId: p.playerId }, socket);
    });

    on('skip_turn', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'skip_turn', actionId: p.actionId, playerId }, socket);
    });

    on('submit_guess', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'submit_guess', actionId: p.actionId, playerId, text: p.text }, socket);
    });

    on('accept_guess', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'accept_guess', actionId: p.actionId, playerId, targetId: p.playerId }, socket);
    });

    on('end_round', (p) => {
      const { room, playerId } = current();
      dispatch(room, { type: 'end_round', actionId: p.actionId, playerId }, socket);
    });

    on('restart_round', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'restart_game', actionId: p.actionId, playerId }, socket);
      } else {
        dispatch(room, { type: 'restart_round', actionId: p.actionId, playerId }, socket);
      }
    });

    on('return_to_lobby', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'return_to_lobby', actionId: p.actionId, playerId }, socket);
      } else {
        dispatch(room, { type: 'return_to_lobby', actionId: p.actionId, playerId }, socket);
      }
    });

    on('leave_room', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'leave', actionId: p.actionId, playerId }, socket);
      } else {
        dispatch(room, { type: 'leave', actionId: p.actionId, playerId }, socket);
      }
    });

    on('kick_player', (p) => {
      const { room, playerId } = current();
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'kick', actionId: p.actionId, playerId, targetId: p.playerId }, socket);
      } else {
        dispatch(room, { type: 'kick', actionId: p.actionId, playerId, targetId: p.playerId }, socket);
      }
    });

    socket.on('disconnect', () => {
      invalidLimiter.forget(socket.id);
      const s = socket.data.session;
      const room = s && registry.get(s.roomCode);
      if (!s || !room || room.sockets.get(s.playerId) !== socket.id) return;
      room.sockets.delete(s.playerId);
      if (room.gameType === 'barricade') {
        dispatchBarricade(room, { type: 'disconnect', playerId: s.playerId });
      } else {
        dispatch(room, { type: 'disconnect', playerId: s.playerId });
      }
      touchEmpty(room);
    });
  });

  const sweep = (): string[] => {
    createLimiter.prune();
    joinLimiter.prune();
    invalidLimiter.prune();
    return registry.expireEmpty(clock());
  };
  const timer = setInterval(sweep, 60_000);
  timer.unref();

  return {
    httpServer,
    io,
    registry,
    config,
    sweep,
    listen: (port = config.port) =>
      new Promise((resolve) => httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port))),
    close: () =>
      new Promise((resolve) => {
        clearInterval(timer);
        for (const room of [...registry.all()]) registry.delete(room.code);
        void io.close(() => resolve());
      }),
  };
}
