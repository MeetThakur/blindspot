import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { GameType } from '@whoami/shared';
import type { BarricadeGameState } from './barricade/index.js';
import { type GameState, generateRoomCode } from './game/index.js';

export interface Room {
  code: string;
  gameType: GameType;
  state?: GameState;
  barricadeState?: BarricadeGameState;
  creatorIp: string;
  /** playerId -> socket id of the player's current connection. */
  sockets: Map<string, string>;
  /** When the last connected player left; null while anyone is connected. */
  emptySince: number | null;
  /** Pending server timeout for the room's next deadline (timer expiry / grace period). */
  wake: NodeJS.Timeout | null;
}

const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export const newPlayerId = (): string => randomUUID();
export const newReconnectToken = (): string => randomBytes(24).toString('base64url');

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private byIp = new Map<string, Set<string>>();
  /** Called whenever a room is removed, so owners can release timers. */
  onRemove: (room: Room) => void = () => undefined;

  constructor(
    private readonly maxRooms: number,
    private readonly maxRoomsPerIp: number,
    private readonly emptyTtlMs: number,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  /** Returns a reason string if this IP may not create another room. */
  canCreate(ip: string): string | null {
    if (this.rooms.size >= this.maxRooms) return 'The server is busy. Try again in a few minutes.';
    if ((this.byIp.get(ip)?.size ?? 0) >= this.maxRoomsPerIp) {
      return 'You already have the maximum number of active rooms.';
    }
    return null;
  }

  allocateCode(): string {
    return generateRoomCode(rng, new Set(this.rooms.keys()));
  }

  add(room: Room): void {
    this.rooms.set(room.code, room);
    let set = this.byIp.get(room.creatorIp);
    if (!set) this.byIp.set(room.creatorIp, (set = new Set()));
    set.add(room.code);
  }

  delete(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    this.onRemove(room);
    const set = this.byIp.get(room.creatorIp);
    set?.delete(code);
    if (set && set.size === 0) this.byIp.delete(room.creatorIp);
  }

  /** Removes rooms that have been empty longer than the TTL; returns their codes. */
  expireEmpty(now: number): string[] {
    const gone: string[] = [];
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && now - room.emptySince >= this.emptyTtlMs) gone.push(room.code);
    }
    gone.forEach((c) => this.delete(c));
    return gone;
  }

  all(): IterableIterator<Room> {
    return this.rooms.values();
  }
}
