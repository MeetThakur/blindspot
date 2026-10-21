import { expect } from 'vitest';
import { Phase, type Answer } from '@whoami/shared';
import {
  createRoom,
  nextDeadline,
  reduce,
  snapshotFor,
  type Action,
  type GameEvent,
  type GameState,
  type RoundState,
} from '../src/game/index.js';

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Distribute<T> = T extends unknown ? Omit<T, 'actionId'> & { actionId?: string } : never;
export type LooseAction = Distribute<Action>;

/** Test driver: owns the state and a fake clock; every call goes through the pure reducer. */
export class Sim {
  state: GameState;
  now = 1_000_000;
  rng: () => number;
  events: GameEvent[] = [];
  private n = 0;

  constructor(public ids: string[], seed = 1) {
    this.rng = seeded(seed);
    this.state = createRoom({ code: 'ABCDE', hostId: ids[0]!, hostName: ids[0]!, hostToken: 't-' + ids[0], now: this.now });
    for (const id of ids.slice(1)) this.ok({ type: 'join', playerId: id, name: id, token: 't-' + id });
  }

  run(a: LooseAction) {
    const action = ('actionId' in a || !needsId(a) ? a : { ...a, actionId: `a${++this.n}` }) as Action;
    const res = reduce(this.state, action, { now: this.now, rng: this.rng });
    if (res.ok) {
      this.state = res.state;
      this.events.push(...res.events);
    }
    return res;
  }

  ok(a: LooseAction) {
    const res = this.run(a);
    if (!res.ok) throw new Error(`${a.type} rejected: ${res.error.code} ${res.error.message}`);
    return res;
  }

  err(a: LooseAction, code: string) {
    const res = this.run(a);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(code);
  }

  advance(ms: number) {
    this.now += ms;
  }

  /** Fires the pending timer (as the server would) if it is due. */
  fireTimer() {
    const t = this.state.timer;
    if (!t || t.deadline === null) return false;
    this.now = Math.max(this.now, t.deadline);
    return this.ok({ type: 'expire', kind: t.kind, seq: t.seq });
  }

  settings(patch: object, by = this.ids[0]!) {
    return this.ok({ type: 'update_settings', playerId: by, settings: patch });
  }

  useItems(n = 30) {
    const items = Array.from({ length: n }, (_, i) => `Item ${String(i + 1).padStart(2, '0')}`);
    return this.ok({ type: 'update_settings', playerId: this.ids[0]!, list: { kind: 'custom', name: 'T', items } });
  }

  start(settings: object = {}) {
    this.useItems();
    if (Object.keys(settings).length) this.settings(settings);
    return this.ok({ type: 'start_game', playerId: this.ids[0]! });
  }

  get round(): RoundState {
    return this.state.round!;
  }
  get active(): string {
    return this.round.order[this.round.turnPos]!;
  }
  get host(): string {
    return this.state.hostId;
  }
  identity(id: string): string {
    return this.round.assignments[id]!;
  }
  others(id: string): string[] {
    return this.ids.filter((x) => x !== id);
  }
  snap(viewer: string) {
    return snapshotFor(this.state, viewer);
  }
  get phase() {
    return this.state.phase;
  }
  deadline() {
    return nextDeadline(this.state);
  }

  ask(text = 'Am I a person?') {
    return this.ok({ type: 'submit_question', playerId: this.active, text });
  }
  answerAll(answer: Answer = 'YES') {
    for (const id of this.others(this.active)) {
      if (this.phase !== Phase.COLLECTING_ANSWERS) break;
      if (this.state.players.some((p) => p.id === id) && !this.round.pending?.answers[id]) {
        this.ok({ type: 'submit_answer', playerId: id, answer });
      }
    }
  }
  /** Ask, collect all answers, continue to next turn. */
  fullQuestionTurn() {
    this.ask();
    this.answerAll();
    this.ok({ type: 'next_turn', playerId: this.host });
  }
  wrongGuess(id = this.active) {
    return this.ok({ type: 'submit_guess', playerId: id, text: 'definitely wrong' });
  }
  rightGuess(id = this.active) {
    return this.ok({ type: 'submit_guess', playerId: id, text: this.identity(id) });
  }
}

function needsId(a: LooseAction): boolean {
  return !['disconnect', 'reconnect', 'expire', 'sweep'].includes(a.type);
}

export { Phase };
