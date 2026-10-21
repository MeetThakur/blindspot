import type { PlayerSnapshot, RoomSnapshot } from '@whoami/shared';
import { DEFAULT_SETTINGS } from '@whoami/shared';
import { GameClient, type SocketLike } from '../lib/gameClient';

export class FakeSocket implements SocketLike {
  connected = false;
  emitted: { event: string; payload: any }[] = [];
  private handlers = new Map<string, ((...a: any[]) => void)[]>();
  on(event: string, handler: (...a: any[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }
  emit(event: string, payload?: any) {
    this.emitted.push({ event, payload });
  }
  trigger(event: string, ...args: any[]) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    (this.handlers.get(event) ?? []).forEach((h) => h(...args));
  }
  last(event: string) {
    return this.emitted.filter((e) => e.event === event).at(-1)?.payload;
  }
}

export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

export function makeClient() {
  const socket = new FakeSocket();
  const storage = memoryStorage();
  const client = new GameClient(socket, storage);
  return { socket, storage, client };
}

export function player(over: Partial<PlayerSnapshot> & { id: string; name: string }): PlayerSnapshot {
  return {
    color: 'sky',
    connected: true,
    isHost: false,
    afk: false,
    solved: false,
    identity: null,
    questionsAsked: 0,
    wrongGuesses: 0,
    roundScore: 0,
    totalScore: 0,
    ...over,
  };
}

export function snapshot(over: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    code: 'ABCDE',
    phase: 'LOBBY',
    pausedFrom: null,
    hostId: 'a',
    youId: 'a',
    serverTime: Date.now(),
    players: [player({ id: 'a', name: 'Ann', isHost: true }), player({ id: 'b', name: 'Bob', color: 'lime' })],
    settings: { ...DEFAULT_SETTINGS },
    list: null,
    roundNumber: 0,
    round: null,
    pending: null,
    reveal: null,
    history: [],
    timer: null,
    results: null,
    ...over,
  };
}

/** A running-game snapshot where `youId` is viewing; Bob and Cara's identities are visible, yours is hidden. */
export function gameSnapshot(over: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return snapshot({
    phase: 'ASKING',
    roundNumber: 1,
    youId: 'a',
    players: [
      player({ id: 'a', name: 'Ann', isHost: true, identity: null }),
      player({ id: 'b', name: 'Bob', color: 'lime', identity: 'Shrek' }),
      player({ id: 'c', name: 'Cara', color: 'violet', identity: 'Batman' }),
    ],
    round: { order: ['a', 'b', 'c'], activeId: 'a', cyclesCompleted: 0, maxCycles: 10 },
    ...over,
  });
}
