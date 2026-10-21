import { io, type Socket } from 'socket.io-client';
import { vi } from 'vitest';
import type { RoomSnapshot, SessionPayload } from '@whoami/shared';
import { createGameServer, type GameServer } from '../src/gameServer.js';
import type { ServerConfig } from '../src/config.js';

export interface Received {
  name: string;
  payload: any;
}

let counter = 0;
export const aid = () => `act-${++counter}`;

export class TestClient {
  socket: Socket;
  log: Received[] = [];
  session: SessionPayload | null = null;

  constructor(url: string, opts: { origin?: string } = {}) {
    this.socket = io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: opts.origin ? { origin: opts.origin } : undefined,
    });
    this.socket.onAny((name, payload) => {
      this.log.push({ name, payload });
      if ((name === 'room_created' || name === 'room_joined') && payload?.playerId) this.session = payload;
    });
  }

  get connected() {
    return this.socket.connected;
  }

  async ready() {
    await vi.waitFor(() => {
      if (!this.socket.connected) throw new Error('not connected');
    });
    return this;
  }

  emit(name: string, payload: Record<string, unknown> = {}) {
    this.socket.emit(name, { actionId: aid(), ...payload });
  }

  all(name: string): Received[] {
    return this.log.filter((l) => l.name === name);
  }
  last(name: string): any {
    return this.all(name).at(-1)?.payload;
  }
  count(name: string): number {
    return this.all(name).length;
  }
  errors(): { code: string; message: string }[] {
    return this.all('game_error').map((e) => e.payload);
  }
  lastError() {
    return this.errors().at(-1);
  }

  get snapshot(): RoomSnapshot {
    const lastUpdate = this.last('room_updated') as RoomSnapshot | undefined;
    return (lastUpdate ?? this.session!.snapshot) as RoomSnapshot;
  }

  get id(): string {
    return this.session!.playerId;
  }

  /** Emits and waits for the next game_error (or a state change) to settle. */
  async expectError(name: string, payload: Record<string, unknown>, code: string) {
    const before = this.errors().length;
    this.emit(name, payload);
    await vi.waitFor(() => {
      if (this.errors().length <= before) throw new Error('no error yet');
    });
    return this.errors().at(-1)!.code === code ? undefined : Promise.reject(new Error(`expected ${code}, got ${this.errors().at(-1)!.code}`));
  }

  /** Every string the server has ever sent this client, for leak checks. */
  transcript(): string {
    return JSON.stringify(this.log);
  }

  close() {
    this.socket.close();
  }
}

export interface Harness {
  server: GameServer;
  url: string;
  clients: TestClient[];
  connect(opts?: { origin?: string }): Promise<TestClient>;
  /** Creates a room with the first client as host and joins the rest. */
  room(names: string[]): Promise<{ code: string; clients: TestClient[] }>;
  stop(): Promise<void>;
}

export async function startHarness(
  overrides: Partial<ServerConfig> = {},
  clock?: () => number,
): Promise<Harness> {
  const server = createGameServer(
    { clientOrigins: ['http://localhost:5173'], createLimit: { max: 1000, windowMs: 60_000 }, joinLimit: { max: 1000, windowMs: 60_000 }, maxRoomsPerIp: 1000, ...overrides },
    clock,
  );
  const port = await server.listen(0);
  const url = `http://localhost:${port}`;
  const clients: TestClient[] = [];
  const h: Harness = {
    server,
    url,
    clients,
    async connect(opts) {
      const c = new TestClient(url, opts);
      clients.push(c);
      return c.ready();
    },
    async room(names) {
      const out: TestClient[] = [];
      const host = await h.connect();
      host.emit('create_room', { name: names[0] });
      await vi.waitFor(() => {
        if (!host.session) throw new Error('no room yet');
      });
      const code = host.session!.snapshot.code;
      out.push(host);
      for (const name of names.slice(1)) {
        const c = await h.connect();
        c.emit('join_room', { roomCode: code, name });
        await vi.waitFor(() => {
          if (!c.session) throw new Error(`${name} not joined: ${JSON.stringify(c.errors())}`);
        });
        out.push(c);
      }
      await vi.waitFor(() => {
        if (host.snapshot.players.length !== names.length) throw new Error('host snapshot behind');
      });
      return { code, clients: out };
    },
    async stop() {
      clients.forEach((c) => c.close());
      await server.close();
    },
  };
  return h;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
