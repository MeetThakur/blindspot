import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, Phase } from '@whoami/shared';
import { aid, sleep, startHarness, type Harness } from './netHelpers.js';

let h: Harness;
afterEach(async () => {
  await h?.stop();
});

const items = Array.from({ length: 12 }, (_, i) => `ZQitem${String(i).padStart(2, '0')}x`);
const customList = { kind: 'custom', name: 'Test', items };

async function startedRoom(names: string[]) {
  const { code, clients } = await h.room(names);
  const host = clients[0]!;
  host.emit('update_room_settings', { list: customList });
  await vi.waitFor(() => expect(host.snapshot.list?.count).toBe(12));
  host.emit('start_game');
  await vi.waitFor(() => expect(clients.every((c) => c.snapshot.phase === Phase.ASKING)).toBe(true));
  return { code, clients, host };
}

describe('http', () => {
  it('serves /health with CORS only for the configured origin', async () => {
    h = await startHarness();
    const ok = await fetch(`${h.url}/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(await ok.json()).toEqual({ ok: true });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const bad = await fetch(`${h.url}/health`, { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    expect((await fetch(`${h.url}/nope`)).status).toBe(404);
  });

  it('refuses websocket connections from other origins', async () => {
    h = await startHarness();
    const evil = await (async () => {
      const { TestClient } = await import('./netHelpers.js');
      const c = new TestClient(h.url, { origin: 'https://evil.example' });
      h.clients.push(c);
      return c;
    })();
    await sleep(300);
    expect(evil.connected).toBe(false);
    const good = await h.connect({ origin: 'http://localhost:5173' });
    expect(good.connected).toBe(true);
  });
});

describe('create & join', () => {
  it('creates a room with an unambiguous code, a reconnect token and a filtered snapshot', async () => {
    h = await startHarness();
    const host = await h.connect();
    host.emit('create_room', { name: '  Ann  ' });
    await vi.waitFor(() => expect(host.session).not.toBeNull());
    const s = host.session!;
    expect(s.snapshot.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    expect(s.snapshot.hostId).toBe(s.playerId);
    expect(s.snapshot.players[0]).toMatchObject({ name: 'Ann', isHost: true, connected: true });
    expect(s.reconnectToken.length).toBeGreaterThanOrEqual(24);
    expect(JSON.stringify(s.snapshot)).not.toContain(s.reconnectToken);
    expect(h.server.registry.size).toBe(1);
  });

  it('lets friends join by code (case-insensitive) and everyone sees the roster', async () => {
    h = await startHarness();
    const { code, clients } = await h.room(['Ann', 'Bob']);
    const [ann, bob] = clients as [any, any];
    const cara = await h.connect();
    cara.emit('join_room', { roomCode: ` ${code.toLowerCase()} `, name: 'Cara' });
    await vi.waitFor(() => expect(cara.session).not.toBeNull());
    await vi.waitFor(() => {
      for (const c of [ann, bob, cara]) expect(c.snapshot.players.map((p: any) => p.name)).toEqual(['Ann', 'Bob', 'Cara']);
    });
    expect(cara.snapshot.youId).toBe(cara.id);
    expect(bob.snapshot.youId).toBe(bob.id);
    // nobody receives another player's reconnect token
    for (const c of [ann, bob, cara]) {
      for (const other of [ann, bob, cara].filter((x) => x !== c)) {
        expect(c.transcript()).not.toContain(other.session.reconnectToken);
      }
    }
  });

  it('reports bad codes, duplicate names, full rooms and invalid payloads', async () => {
    h = await startHarness();
    const { code, clients } = await h.room(['Ann', 'Bob', 'Cara', 'Dan', 'Eve']);
    const late = await h.connect();
    await late.expectError('join_room', { roomCode: code, name: 'Frank' }, ErrorCode.ROOM_FULL);
    await late.expectError('join_room', { roomCode: 'ZZZZZ', name: 'Frank' }, ErrorCode.ROOM_NOT_FOUND);
    await late.expectError('join_room', { roomCode: code }, ErrorCode.PAYLOAD_INVALID);
    await late.expectError('join_room', { roomCode: code, name: 'x'.repeat(21) }, ErrorCode.PAYLOAD_INVALID);
    late.socket.emit('join_room', 'not an object');
    late.socket.emit('create_room', null);
    await vi.waitFor(() => expect(late.errors().length).toBeGreaterThanOrEqual(5));
    expect(clients[0]!.snapshot.players).toHaveLength(5);
  });

  it('rejects duplicate names case-insensitively', async () => {
    h = await startHarness();
    const { code } = await h.room(['Ann']);
    const c = await h.connect();
    await c.expectError('join_room', { roomCode: code, name: ' ANN ' }, ErrorCode.NAME_TAKEN);
  });

  it('echoes the actionId on errors', async () => {
    h = await startHarness();
    const c = await h.connect();
    c.socket.emit('join_room', { actionId: 'my-id', roomCode: 'ZZZZZ', name: 'x' });
    await vi.waitFor(() => expect(c.errors()).toHaveLength(1));
    expect(c.last('game_error')).toMatchObject({ code: ErrorCode.ROOM_NOT_FOUND, actionId: 'my-id' });
  });

  it('refuses a second room or join while already in one', async () => {
    h = await startHarness();
    const { code, clients } = await h.room(['Ann']);
    await clients[0]!.expectError('create_room', { name: 'Ann2' }, ErrorCode.ALREADY_IN_ROOM);
    await clients[0]!.expectError('join_room', { roomCode: code, name: 'Ann3' }, ErrorCode.ALREADY_IN_ROOM);
  });

  it('requires a room for room actions', async () => {
    h = await startHarness();
    const c = await h.connect();
    await c.expectError('start_game', {}, ErrorCode.NOT_IN_ROOM);
  });
});

describe('host permissions', () => {
  it('only the host can change settings, start or kick', async () => {
    h = await startHarness();
    const { clients } = await h.room(['Ann', 'Bob', 'Cara']);
    const [ann, bob, cara] = clients as [any, any, any];
    await bob.expectError('update_room_settings', { settings: { turnTimeoutSec: 60 } }, ErrorCode.NOT_HOST);
    await bob.expectError('start_game', {}, ErrorCode.NOT_HOST);
    await bob.expectError('kick_player', { playerId: cara.id }, ErrorCode.NOT_HOST);

    ann.emit('update_room_settings', { settings: { turnTimeoutSec: 60 } });
    await vi.waitFor(() => expect(cara.snapshot.settings).toMatchObject({ turnTimeoutSec: 60 }));
  });

  it('validates settings and lists on the server', async () => {
    h = await startHarness();
    const { clients } = await h.room(['Ann', 'Bob']);
    const ann = clients[0]!;
    await ann.expectError('update_room_settings', { settings: { turnTimeoutSec: 45 } }, ErrorCode.PAYLOAD_INVALID);
    await ann.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: ['a', 'b'] } }, ErrorCode.LIST_INVALID);
    await ann.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: ['a'.repeat(61)] } }, ErrorCode.PAYLOAD_INVALID);
    await ann.expectError('update_room_settings', { list: { kind: 'category', id: 'nope' } }, ErrorCode.LIST_INVALID);
    await ann.expectError('start_game', {}, ErrorCode.LIST_INVALID);
    ann.emit('update_room_settings', { list: { kind: 'category', id: 'animals' } });
    await vi.waitFor(() => expect(ann.snapshot.list).toEqual({ name: 'Animals', count: 24 }));
  });

  it('kicks a player, who is told and unbound but can rejoin', async () => {
    h = await startHarness();
    const { code, clients } = await h.room(['Ann', 'Bob', 'Cara']);
    const [ann, bob, cara] = clients as [any, any, any];
    ann.emit('kick_player', { playerId: bob.id });
    await vi.waitFor(() => expect(bob.errors().some((e: any) => e.code === ErrorCode.KICKED)).toBe(true));
    await vi.waitFor(() => expect(cara.snapshot.players.map((p: any) => p.name)).toEqual(['Ann', 'Cara']));
    await bob.expectError('start_game', {}, ErrorCode.NOT_IN_ROOM);
    bob.session = null;
    bob.emit('join_room', { roomCode: code, name: 'Bob' });
    await vi.waitFor(() => expect(bob.session).not.toBeNull());
    await ann.expectError('kick_player', { playerId: ann.id }, ErrorCode.INVALID_INPUT);
  });

  it('host leaving hands the room to the next player; last leaver deletes the room', async () => {
    h = await startHarness();
    const { clients } = await h.room(['Ann', 'Bob']);
    const [ann, bob] = clients as [any, any];
    ann.emit('leave_room');
    await vi.waitFor(() => expect(bob.snapshot.hostId).toBe(bob.id));
    expect(bob.snapshot.players).toHaveLength(1);
    bob.emit('leave_room');
    await vi.waitFor(() => expect(h.server.registry.size).toBe(0));
  });
});

describe('starting a game: identity privacy', () => {
  it('assigns unique identities and never sends a player their own', async () => {
    h = await startHarness();
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara', 'Dan', 'Eve']);
    const assignments = h.server.registry.get(code)!.state.round!.assignments;
    const mine = new Map(clients.map((c) => [c, assignments[c.id]!]));
    expect(new Set(mine.values()).size).toBe(5);

    for (const c of clients) {
      const own = mine.get(c)!;
      expect(c.transcript()).not.toContain(own);
      const snap = c.snapshot;
      for (const p of snap.players) {
        if (p.id === c.id) expect(p.identity).toBeNull();
        else expect(p.identity).toBe(assignments[p.id]);
      }
      expect(snap.round!.order).toHaveLength(5);
      expect(snap.round!.activeId).toBe(snap.round!.order[0]);
    }
    for (const c of clients) {
      expect(c.count('game_started')).toBe(1);
      expect(c.count('turn_changed')).toBe(1);
    }
  });

  it('rejects mid-round settings changes, restarts and late joins over the wire', async () => {
    h = await startHarness();
    const { code, host } = await startedRoom(['Ann', 'Bob']);
    await host.expectError('update_room_settings', { settings: { turnTimeoutSec: 60 } }, ErrorCode.WRONG_PHASE);
    await host.expectError('start_game', {}, ErrorCode.WRONG_PHASE);
    const late = await h.connect();
    await late.expectError('join_room', { roomCode: code, name: 'Late' }, ErrorCode.GAME_IN_PROGRESS);
  });

  it('ignores duplicate actionIds', async () => {
    h = await startHarness();
    const { clients } = await h.room(['Ann', 'Bob']);
    const [ann] = clients as [any];
    const id = aid();
    ann.socket.emit('update_room_settings', { actionId: id, list: customList });
    await vi.waitFor(() => expect(ann.snapshot.list?.count).toBe(12));
    const updates = ann.count('room_updated');
    ann.socket.emit('update_room_settings', { actionId: id, list: customList });
    ann.socket.emit('start_game', { actionId: aid() });
    await vi.waitFor(() => expect(ann.snapshot.phase).toBe(Phase.ASKING));
    ann.socket.emit('start_game', { actionId: 'start-1' });
    await vi.waitFor(() => expect(ann.errors().some((e: any) => e.code === ErrorCode.WRONG_PHASE)).toBe(true));
    expect(ann.count('room_updated')).toBe(updates + 1); // duplicate settings emitted nothing; start emitted one
    expect(ann.errors().filter((e: any) => e.code !== ErrorCode.WRONG_PHASE)).toHaveLength(0);
  });
});

describe('connection lifecycle', () => {
  it('marks players disconnected and lets them resume with their token', async () => {
    h = await startHarness();
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const [ann, bob] = clients as [any, any, any];
    const { playerId, reconnectToken } = bob.session;
    const assignment = h.server.registry.get(code)!.state.round!.assignments[playerId]!;
    bob.close();
    await vi.waitFor(() => expect(ann.snapshot.players.find((p: any) => p.id === playerId).connected).toBe(false));
    expect(ann.count('player_disconnected')).toBe(1);

    const back = await h.connect();
    await back.expectError('resume_session', { roomCode: code, reconnectToken: 'x'.repeat(30) }, ErrorCode.SESSION_INVALID);
    back.emit('resume_session', { roomCode: code, reconnectToken });
    await vi.waitFor(() => expect(back.session?.playerId).toBe(playerId));
    await vi.waitFor(() => expect(ann.snapshot.players.find((p: any) => p.id === playerId).connected).toBe(true));
    expect(back.session!.snapshot.phase).toBe(Phase.ASKING);
    expect(back.transcript()).not.toContain(assignment);
    expect(back.session!.snapshot.players.find((p) => p.id === playerId)!.identity).toBeNull();
    expect(back.session!.snapshot.players.filter((p) => p.identity)).toHaveLength(2);
  });

  it('a second tab with the same token takes over the session', async () => {
    h = await startHarness();
    const { code, clients } = await h.room(['Ann', 'Bob']);
    const bob = clients[1]!;
    const { playerId, reconnectToken } = bob.session!;
    const tab2 = await h.connect();
    tab2.emit('resume_session', { roomCode: code, reconnectToken });
    await vi.waitFor(() => expect(tab2.session?.playerId).toBe(playerId));
    await vi.waitFor(() => expect(bob.errors().some((e) => e.code === ErrorCode.SESSION_INVALID)).toBe(true));
    // closing the stale tab must not mark the player disconnected
    bob.close();
    await sleep(150);
    expect(clients[0]!.snapshot.players.find((p) => p.id === playerId)!.connected).toBe(true);
  });

  it('a disconnected host pauses a running game', async () => {
    h = await startHarness();
    const { clients, host } = await startedRoom(['Ann', 'Bob']);
    host.close();
    await vi.waitFor(() => expect(clients[1]!.snapshot.phase).toBe(Phase.PAUSED));
    expect(clients[1]!.snapshot.pausedFrom).toBe(Phase.ASKING);
  });
});

describe('abuse protection', () => {
  it('rate-limits room creation per IP', async () => {
    h = await startHarness({ createLimit: { max: 2, windowMs: 60_000 }, maxRoomsPerIp: 100 });
    for (let i = 0; i < 2; i++) {
      const c = await h.connect();
      c.emit('create_room', { name: 'x' + i });
      await vi.waitFor(() => expect(c.session).not.toBeNull());
    }
    const c = await h.connect();
    await c.expectError('create_room', { name: 'x3' }, ErrorCode.RATE_LIMITED);
    expect(h.server.registry.size).toBe(2);
  });

  it('caps active rooms per IP and frees the slot when a room is deleted', async () => {
    h = await startHarness({ maxRoomsPerIp: 1 });
    const a = await h.connect();
    a.emit('create_room', { name: 'a' });
    await vi.waitFor(() => expect(a.session).not.toBeNull());
    const b = await h.connect();
    await b.expectError('create_room', { name: 'b' }, ErrorCode.RATE_LIMITED);
    a.emit('leave_room');
    await vi.waitFor(() => expect(h.server.registry.size).toBe(0));
    b.emit('create_room', { name: 'b' });
    await vi.waitFor(() => expect(b.session).not.toBeNull());
  });

  it('rate-limits join attempts per IP (slows code guessing)', async () => {
    h = await startHarness({ joinLimit: { max: 3, windowMs: 60_000 } });
    const c = await h.connect();
    for (let i = 0; i < 3; i++) await c.expectError('join_room', { roomCode: 'ZZZZ' + i, name: 'x' }, ErrorCode.ROOM_NOT_FOUND);
    await c.expectError('join_room', { roomCode: 'ZZZZ9', name: 'x' }, ErrorCode.RATE_LIMITED);
  });

  it('throttles a socket that keeps sending invalid actions', async () => {
    h = await startHarness({ invalidLimit: { max: 5, windowMs: 60_000 } });
    const c = await h.connect();
    for (let i = 0; i < 5; i++) c.emit('start_game');
    await vi.waitFor(() => expect(c.errors().length).toBe(5));
    c.emit('create_room', { name: 'legit' });
    await vi.waitFor(() => expect(c.lastError()!.code).toBe(ErrorCode.RATE_LIMITED));
    expect(c.session).toBeNull();
  });

  it('uses the proxy-supplied client IP only when configured', async () => {
    h = await startHarness({ maxRoomsPerIp: 1, trustProxyHops: 1 });
    const mk = async (ip: string) => {
      const { io } = await import('socket.io-client');
      const { TestClient } = await import('./netHelpers.js');
      const c = new TestClient(h.url);
      c.socket.close();
      c.socket = io(h.url, { transports: ['websocket'], forceNew: true, extraHeaders: { 'x-forwarded-for': `6.6.6.6, ${ip}` } });
      c.socket.onAny((name, payload) => {
        c.log.push({ name, payload });
        if (name === 'room_created') c.session = payload;
      });
      h.clients.push(c);
      return c.ready();
    };
    const a = await mk('1.1.1.1');
    const b = await mk('2.2.2.2');
    a.emit('create_room', { name: 'a' });
    b.emit('create_room', { name: 'b' });
    await vi.waitFor(() => expect(a.session && b.session).toBeTruthy());
    const a2 = await mk('1.1.1.1');
    await a2.expectError('create_room', { name: 'a2' }, ErrorCode.RATE_LIMITED);
  });
});

describe('room expiry', () => {
  it('deletes rooms empty for 30 minutes and frees the IP slot', async () => {
    let now = 1_000_000;
    h = await startHarness({ maxRoomsPerIp: 1 }, () => now);
    const { code, clients } = await h.room(['Ann', 'Bob']);
    clients.forEach((c) => c.close());
    await vi.waitFor(() => expect(h.server.registry.get(code)!.emptySince).not.toBeNull());

    now += 29 * 60_000;
    expect(h.server.sweep()).toEqual([]);
    expect(h.server.registry.get(code)).toBeDefined();
    now += 60_000;
    expect(h.server.sweep()).toEqual([code]);

    const c = await h.connect();
    await c.expectError('join_room', { roomCode: code, name: 'Late' }, ErrorCode.ROOM_NOT_FOUND);
    c.emit('create_room', { name: 'New' });
    await vi.waitFor(() => expect(c.session).not.toBeNull());
  });

  it('does not expire a room someone returns to', async () => {
    let now = 1_000_000;
    h = await startHarness({}, () => now);
    const { code, clients } = await h.room(['Ann', 'Bob']);
    const { reconnectToken } = clients[1]!.session!;
    clients.forEach((c) => c.close());
    await vi.waitFor(() => expect(h.server.registry.get(code)!.emptySince).not.toBeNull());
    now += 20 * 60_000;
    const back = await h.connect();
    back.emit('resume_session', { roomCode: code, reconnectToken });
    await vi.waitFor(() => expect(back.session).not.toBeNull());
    expect(h.server.registry.get(code)!.emptySince).toBeNull();
    now += 60 * 60_000;
    expect(h.server.sweep()).toEqual([]);
  });
});
