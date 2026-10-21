import { afterEach, describe, expect, it, vi } from 'vitest';
import { Phase } from '@whoami/shared';
import { startHarness, type Harness, type TestClient } from './netHelpers.js';

let h: Harness;
afterEach(async () => {
  await h?.stop();
});

const items = Array.from({ length: 30 }, (_, i) => `ZQcharacter${String(i).padStart(2, '0')}x`);
const until = (fn: () => void) => vi.waitFor(fn, { timeout: 8000, interval: 20 });

async function lobby(names: string[], settings: object = {}) {
  h = await startHarness({ revealDurationMs: 40 });
  const { code, clients } = await h.room(names);
  const host = clients[0]!;
  host.emit('update_room_settings', { list: { kind: 'custom', name: 'Soak', items }, settings });
  await until(() => expect(host.snapshot.list?.count).toBe(30));
  return { code, clients, host };
}

const activeOf = (clients: TestClient[]) => clients.find((c) => c.id === clients[0]!.snapshot.round!.activeId)!;

/**
 * Plays one round like a table of friends would: everyone asks two questions (answered by
 * the others at random), then solves their identity in turn order until the round ends.
 */
async function playRound(code: string, clients: TestClient[], marks: Map<TestClient, number>) {
  const answers = ['YES', 'NO', 'NOT_SURE'];
  let n = 0;
  const guard = Date.now() + 20_000;
  while (clients[0]!.snapshot.phase !== Phase.ROUND_RESULTS) {
    if (Date.now() > guard) throw new Error('round did not finish');
    await until(() => expect([Phase.ASKING, Phase.ROUND_RESULTS]).toContain(clients[0]!.snapshot.phase));
    if (clients[0]!.snapshot.phase === Phase.ROUND_RESULTS) break;
    const asker = activeOf(clients);
    const me = asker.snapshot.players.find((p) => p.id === asker.id)!;
    const turn = asker.snapshot.history.length;

    if (me.questionsAsked < 2) {
      asker.emit('submit_question', { text: `Question ${n++}?` });
      await until(() => expect(clients[0]!.snapshot.phase).toBe(Phase.COLLECTING_ANSWERS));
      for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: answers[n % 3] });
    } else {
      const secret = h.server.registry.get(code)!.state.round!.assignments[asker.id]!;
      // Hidden right up to the correct guess. Only this round's traffic counts: the previous round's
      // results legitimately revealed every identity, which may be reused in this one.
      expect(JSON.stringify(asker.log.slice(marks.get(asker)!))).not.toContain(secret);
      asker.emit('submit_guess', { text: secret });
    }
    await until(() => expect(clients[0]!.snapshot.history.length).toBeGreaterThan(turn));
  }
}

describe.each([2, 3, 5])('a complete game with %i players', (count) => {
  it('plays two rounds start to finish with consistent scores and no leaks', async () => {
    const names = ['Ann', 'Bob', 'Cara', 'Dan', 'Eve'].slice(0, count);
    const { code, clients, host } = await lobby(names);
    host.emit('start_game');
    await until(() => expect(clients.every((c) => c.snapshot.phase === Phase.ASKING)).toBe(true));

    const marks = new Map<TestClient, number>(clients.map((c) => [c, 0]));
    const starters: string[] = [];
    let expectedTotal = 0;
    for (let round = 1; round <= 2; round++) {
      starters.push(clients[0]!.snapshot.round!.activeId!);
      const identities = Object.values(h.server.registry.get(code)!.state.round!.assignments);
      expect(new Set(identities).size).toBe(count);

      await playRound(code, clients, marks);

      for (const c of clients) {
        const r = c.snapshot.results!;
        expect(r.players).toHaveLength(count);
        expect(r.reason).toBe('ONE_REMAINING');
        expect(r.players.filter((p) => p.solved)).toHaveLength(count - 1);
        for (const p of r.players) expect(p.identity).toBe(h.server.registry.get(code)!.state.round!.assignments[p.id]);
      }
      expectedTotal += clients[0]!.snapshot.results!.players.reduce((s, p) => s + p.roundScore, 0);
      expect(clients[0]!.snapshot.results!.players.reduce((s, p) => s + p.totalScore, 0)).toBe(expectedTotal);

      if (round === 1) {
        clients.forEach((c) => marks.set(c, c.log.length));
        host.emit('restart_round');
        await until(() => expect(clients.every((c) => c.snapshot.phase === Phase.ASKING && c.snapshot.roundNumber === 2)).toBe(true));
      }
    }
    expect(starters[1]).not.toBe(starters[0]); // the starting player rotates
  });
});

describe('concurrency', () => {
  it('runs many rooms side by side without cross-talk', async () => {
    h = await startHarness({ revealDurationMs: 40 });
    const rooms = await Promise.all(Array.from({ length: 8 }, (_, i) => h.room([`A${i}`, `B${i}`])));
    for (const { clients } of rooms) {
      clients[0]!.emit('update_room_settings', { list: { kind: 'category', id: 'animals' } });
    }
    await until(() => expect(rooms.every((r) => r.clients[0]!.snapshot.list?.count === 24)).toBe(true));
    rooms.forEach((r) => r.clients[0]!.emit('start_game'));
    await until(() => expect(rooms.every((r) => r.clients.every((c) => c.snapshot.phase === Phase.ASKING))).toBe(true));
    for (const { code, clients } of rooms) {
      for (const c of clients) {
        expect(c.snapshot.code).toBe(code);
        expect(c.snapshot.players.map((p) => p.id).sort()).toEqual(clients.map((x) => x.id).sort());
      }
    }
    expect(new Set(rooms.map((r) => r.code)).size).toBe(8);
  });
});
