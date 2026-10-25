import { io } from 'socket.io-client';
import {
  ErrorCode,
  type Answer,
  type BarricadeSettingsPatch,
  type GameType,
  type ListSelection,
  type RoomSnapshot,
  type SessionPayload,
  type SettingsPatch,
} from '@whoami/shared';

export interface Toast {
  id: number;
  kind: 'error' | 'info' | 'success';
  text: string;
}

export interface ClientState {
  conn: 'connecting' | 'connected' | 'reconnecting';
  everConnected: boolean;
  snapshot: RoomSnapshot | null;
  /** serverTime - Date.now() at the moment the latest snapshot arrived. */
  clockOffset: number;
  toasts: Toast[];
  /** A create/join request is in flight. */
  pending: boolean;
  formError: string | null;
}

/** The slice of a Socket.IO socket the client needs (lets tests inject a fake). */
export interface SocketLike {
  connected: boolean;
  on(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, ...args: any[]): unknown;
}

const SESSION_KEY = 'whoami.session';
const NAME_KEY = 'whoami.name';

interface StoredSession {
  roomCode: string;
  reconnectToken: string;
}

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const storedName = (): string => safe(() => localStorage.getItem(NAME_KEY) ?? '', '');

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class GameClient {
  private state: ClientState = {
    conn: 'connecting',
    everConnected: false,
    snapshot: null,
    clockOffset: 0,
    toasts: [],
    pending: false,
    formError: null,
  };
  private listeners = new Set<() => void>();
  private toastId = 0;
  private resuming = false;

  constructor(
    private readonly socket: SocketLike,
    private readonly storage: Storage | null = safe(() => sessionStorage, null),
  ) {
    const s = socket;
    s.on('connect', () => {
      this.set({ conn: 'connected', everConnected: true });
      const saved = this.loadSession();
      if (saved) {
        this.resuming = true;
        this.send("resume_session", { ...saved });
      }
    });
    s.on('disconnect', () => this.set({ conn: this.state.everConnected ? 'reconnecting' : 'connecting' }));
    s.on('connect_error', () => this.set({ conn: this.state.everConnected ? 'reconnecting' : 'connecting' }));
    const onSession = (p: SessionPayload) => {
      this.resuming = false;
      this.saveSession({ roomCode: p.snapshot.code, reconnectToken: p.reconnectToken });
      this.set({ pending: false, formError: null });
      this.applySnapshot(p.snapshot);
    };
    s.on('room_created', onSession);
    s.on('room_joined', onSession);
    s.on('room_updated', (snap: RoomSnapshot) => this.applySnapshot(snap));
    s.on('guess_result', (e: { playerId: string; correct: boolean }) => {
      if (e.playerId !== this.state.snapshot?.youId) return;
      if (e.correct) this.toast('success', 'You got it! Your identity is revealed to you.');
      else this.toast('info', 'Not quite! Keep investigating.');
    });
    s.on('game_error', (e: { code: string; message: string }) => this.onError(e));
  }

  // ---- store plumbing
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): ClientState => this.state;
  private set(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private applySnapshot(snapshot: RoomSnapshot): void {
    this.set({ snapshot, clockOffset: snapshot.serverTime - Date.now() });
  }

  // ---- persistence (per tab, so two tabs can be two players)
  private loadSession(): StoredSession | null {
    return safe(() => {
      const raw = this.storage?.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    }, null);
  }
  private saveSession(s: StoredSession): void {
    safe(() => this.storage?.setItem(SESSION_KEY, JSON.stringify(s)), undefined);
  }
  private clearSession(): void {
    safe(() => this.storage?.removeItem(SESSION_KEY), undefined);
  }

  // ---- toasts & errors
  toast(kind: Toast['kind'], text: string): void {
    const id = ++this.toastId;
    this.set({ toasts: [...this.state.toasts.slice(-3), { id, kind, text }] });
  }
  dismissToast = (id: number): void => this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) });

  private onError(e: { code: string; message: string }): void {
    if (e.code === ErrorCode.KICKED) {
      this.dropRoom();
      this.toast('error', e.message);
      return;
    }
    if (this.resuming && (e.code === ErrorCode.SESSION_INVALID || e.code === ErrorCode.ROOM_NOT_FOUND)) {
      this.resuming = false;
      this.dropRoom();
      this.toast('info', 'Your previous room has ended. Start or join a new one.');
      return;
    }
    if (e.code === ErrorCode.SESSION_INVALID) {
      this.dropRoom();
      this.toast('info', e.message);
      return;
    }
    if (this.state.pending) {
      this.set({ pending: false, formError: e.message });
      return;
    }
    this.toast('error', e.message);
  }

  private dropRoom(): void {
    this.clearSession();
    this.set({ snapshot: null, pending: false });
  }

  // ---- actions
  private send(event: string, payload: Record<string, unknown> = {}): void {
    this.socket.emit(event, { actionId: newId(), ...payload });
  }

  createRoom(name: string, gameType: GameType = 'blindspot'): void {
    safe(() => localStorage.setItem(NAME_KEY, name), undefined);
    this.set({ pending: true, formError: null });
    this.send('create_room', { name, gameType });
  }
  joinRoom(roomCode: string, name: string): void {
    safe(() => localStorage.setItem(NAME_KEY, name), undefined);
    this.set({ pending: true, formError: null });
    this.send('join_room', { roomCode, name });
  }
  clearFormError(): void {
    if (this.state.formError) this.set({ formError: null });
  }
  leave(): void {
    this.send('leave_room');
    this.dropRoom();
  }
  updateSettings(settings?: SettingsPatch, list?: ListSelection): void {
    this.send('update_room_settings', { ...(settings ? { settings } : {}), ...(list ? { list } : {}) });
  }
  updateBarricadeSettings(settings: BarricadeSettingsPatch): void {
    this.send('update_barricade_settings', { settings });
  }
  barricadeMove(x: number, y: number): void {
    this.send('barricade_move', { x, y });
  }
  barricadePlaceWall(orientation: 'h' | 'v', x: number, y: number): void {
    this.send('barricade_place_wall', { orientation, x, y });
  }
  startGame = (): void => this.send('start_game');
  ask = (text: string): void => this.send('submit_question', { text });
  answer = (answer: Answer): void => this.send('submit_answer', { answer });
  guess = (text: string): void => this.send('submit_guess', { text });
  acceptGuess = (playerId: string): void => this.send('accept_guess', { playerId });
  nextTurn = (): void => this.send('next_turn');
  skipAnswer = (playerId?: string): void => this.send('skip_answer', playerId ? { playerId } : {});
  skipTurn = (): void => this.send('skip_turn');
  endRound = (): void => this.send('end_round', { confirm: true });
  restartRound = (): void => this.send('restart_round');
  returnToLobby = (): void => this.send('return_to_lobby');
  kick = (playerId: string): void => this.send('kick_player', { playerId });

  /** Nudges a sleeping free-tier host awake with plain HTTP while the socket retries. */
  wake(url: string): () => void {
    let stopped = false;
    const ping = async () => {
      while (!stopped && !this.state.everConnected) {
        try {
          const res = await fetch(`${url}/health`, { cache: 'no-store' });
          if (res.ok) return;
        } catch {
          /* still asleep */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    void ping();
    return () => {
      stopped = true;
    };
  }
}

export function createGameClient(url: string): GameClient {
  const socket = io(url, { reconnectionDelayMax: 4000 });
  const client = new GameClient(socket);
  client.wake(url);
  return client;
}
