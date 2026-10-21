import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, Phase } from '@whoami/shared';
import { aid, startHarness, type Harness, type TestClient } from './netHelpers.js';

let h: Harness;
afterEach(async () => {
  await h?.stop();
});

const items = Array.from({ length: 12 }, (_, i) => `ZQitem${String(i).padStart(2, '0')}x`);

async function startedRoom(names: string[], overrides = {}) {
  h = await startHarness({ revealDurationMs: 60_000, ...overrides });
  const { code, clients } = await h.room(names);
  const host = clients[0]!;
  host.emit('update_room_settings', { list: { kind: 'custom', name: 'Test', items } });
  await vi.waitFor(() => expect(host.snapshot.list?.count).toBe(12));
  host.emit('start_game');
  await vi.waitFor(() => expect(clients.every((c) => c.snapshot.phase === Phase.ASKING)).toBe(true));
  return { code, clients, host };
}

const activeOf = (clients: TestClient[]) => {
  const id = clients[0]!.snapshot.round!.activeId;
  return clients.find((c) => c.id === id)!;
};
const phaseIs = (clients: TestClient[], phase: string) =>
  vi.waitFor(() => expect(clients.every((c) => c.snapshot.phase === phase)).toBe(true));

describe('question → answers → reveal over sockets', () => {
  it('runs a full turn with private answers revealed together', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const asker = activeOf(clients);
    const [x, y] = clients.filter((c) => c !== asker) as [TestClient, TestClient];

    asker.emit('submit_question', { text: '  Am I a person?  ' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    for (const c of clients) {
      expect(c.last('question_submitted')).toEqual({ askerId: asker.id, text: 'Am I a person?' });
      expect(c.snapshot.pending).toMatchObject({ askerId: asker.id, text: 'Am I a person?', answeredBy: [] });
      expect(c.snapshot.pending!.required.sort()).toEqual([x.id, y.id].sort());
    }

    await asker.expectError('submit_answer', { answer: 'YES' }, ErrorCode.NOT_ALLOWED);
    x.emit('submit_answer', { answer: 'NO' });
    await vi.waitFor(() => expect(y.snapshot.pending!.answeredBy).toEqual([x.id]));

    // x's answer is invisible to everyone but x until the last answer arrives
    for (const c of [asker, y]) expect(c.transcript()).not.toContain('"NO"');
    expect(x.snapshot.pending!.yourAnswer).toBe('NO');
    expect(y.snapshot.pending!.yourAnswer).toBeNull();

    y.emit('submit_answer', { answer: 'NOT_SURE' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    for (const c of clients) {
      const reveal = c.last('answers_revealed');
      expect(reveal.askerId).toBe(asker.id);
      expect(reveal.answers).toEqual(
        expect.arrayContaining([
          { playerId: x.id, answer: 'NO', auto: false },
          { playerId: y.id, answer: 'NOT_SURE', auto: false },
        ]),
      );
      expect(c.snapshot.history.at(-1)).toMatchObject({ kind: 'question', text: 'Am I a person?' });
      expect(c.snapshot.pending).toBeNull();
    }
  });

  it('does not advance until the reveal is continued; only asker or host may continue', async () => {
    const { clients, host } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Am I big?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: 'YES' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);

    const bystander = clients.find((c) => c !== asker && c !== host)!;
    if (bystander) {
      await bystander.expectError('next_turn', {}, ErrorCode.NOT_ALLOWED);
      await bystander.expectError('submit_question', { text: 'sneaky?' }, ErrorCode.WRONG_PHASE);
    }
    expect(asker.snapshot.phase).toBe(Phase.SHOWING_ANSWERS);

    asker.emit('next_turn');
    await phaseIs(clients, Phase.ASKING);
    const next = activeOf(clients);
    expect(next.id).not.toBe(asker.id);
    for (const c of clients) expect(c.last('turn_changed')).toMatchObject({ activeId: next.id, turn: 2 });
  });

  it('auto-advances exactly once after the reveal delay', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob'], { revealDurationMs: 120 });
    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Am I alive?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    clients.find((c) => c !== asker)!.emit('submit_answer', { answer: 'YES' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    await phaseIs(clients, Phase.ASKING);
    await new Promise((r) => setTimeout(r, 350));
    for (const c of clients) {
      expect(c.snapshot.phase).toBe(Phase.ASKING);
      expect(c.snapshot.round!.activeId).not.toBe(asker.id);
      expect(c.count('turn_changed')).toBe(2); // start + one advance, no double advance
    }
  });

  it('a manual next_turn cancels the pending auto-advance (no double advance)', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara'], { revealDurationMs: 250 });
    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Am I a toy?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: 'NO' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    asker.emit('next_turn');
    await phaseIs(clients, Phase.ASKING);
    const active = activeOf(clients).id;
    await new Promise((r) => setTimeout(r, 500));
    expect(clients[0]!.snapshot.round!.activeId).toBe(active);
    expect(clients[0]!.count('turn_changed')).toBe(2);
  });

  it('rotates through every player in order across a full cycle', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const order = clients[0]!.snapshot.round!.order;
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const asker = activeOf(clients);
      seen.push(asker.id);
      asker.emit('submit_question', { text: `Question ${i}?` });
      await phaseIs(clients, Phase.COLLECTING_ANSWERS);
      for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: 'YES' });
      await phaseIs(clients, Phase.SHOWING_ANSWERS);
      asker.emit('next_turn');
      await phaseIs(clients, Phase.ASKING);
    }
    expect(seen).toEqual([...order, ...order]);
    expect(clients[0]!.snapshot.history.filter((e) => e.kind === 'question')).toHaveLength(6);
  });

  it('only the active player may ask; phase and input are enforced', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const asker = activeOf(clients);
    const other = clients.find((c) => c !== asker)!;
    await other.expectError('submit_question', { text: 'my turn?' }, ErrorCode.NOT_YOUR_TURN);
    await other.expectError('submit_answer', { answer: 'YES' }, ErrorCode.WRONG_PHASE);
    await asker.expectError('submit_question', { text: '   ' }, ErrorCode.PAYLOAD_INVALID);
    await asker.expectError('submit_question', { text: 'q'.repeat(201) }, ErrorCode.PAYLOAD_INVALID);
    await asker.expectError('submit_answer', { answer: 'MAYBE' }, ErrorCode.PAYLOAD_INVALID);
    expect(asker.snapshot.phase).toBe(Phase.ASKING);
  });

  it('ignores duplicate actionIds (double clicks, retries)', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const asker = activeOf(clients);
    const qid = aid();
    asker.socket.emit('submit_question', { actionId: qid, text: 'Am I real?' });
    asker.socket.emit('submit_question', { actionId: qid, text: 'Am I real?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    const [x, y] = clients.filter((c) => c !== asker) as [TestClient, TestClient];
    const aId = aid();
    x.socket.emit('submit_answer', { actionId: aId, answer: 'YES' });
    x.socket.emit('submit_answer', { actionId: aId, answer: 'YES' });
    await vi.waitFor(() => expect(y.snapshot.pending!.answeredBy).toEqual([x.id]));
    await new Promise((r) => setTimeout(r, 100));
    expect(asker.count('question_submitted')).toBe(1);
    expect(asker.errors()).toHaveLength(0);
    expect(x.errors()).toHaveLength(0);
    // a genuinely new second answer is a real error
    await x.expectError('submit_answer', { answer: 'NO' }, ErrorCode.ALREADY_ANSWERED);
  });

  it('host skip controls resolve stalls; non-hosts are rejected', async () => {
    const { clients, host } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const other = clients.find((c) => c !== host)!;
    await other.expectError('skip_turn', {}, ErrorCode.NOT_HOST);
    await host.expectError('skip_answer', {}, ErrorCode.WRONG_PHASE);

    const stalled = activeOf(clients);
    host.emit('skip_turn');
    await vi.waitFor(() => expect(activeOf(clients).id).not.toBe(stalled.id));
    expect(host.snapshot.history.at(-1)).toMatchObject({ kind: 'skip', playerId: stalled.id, reason: 'HOST' });

    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Am I tall?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    await other.expectError('skip_answer', {}, ErrorCode.NOT_HOST);
    host.emit('skip_answer');
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    const answers = host.last('answers_revealed').answers as { answer: string; auto: boolean }[];
    expect(answers.filter((a) => a.auto).every((a) => a.answer === 'NOT_SURE')).toBe(true);
    expect(answers.some((a) => a.auto)).toBe(true);
  });

  it('never leaks anyone their own identity through questions, answers, history or reveals', async () => {
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    for (let i = 0; i < 3; i++) {
      const asker = activeOf(clients);
      asker.emit('submit_question', { text: `Q${i}: am I from a game?` });
      await phaseIs(clients, Phase.COLLECTING_ANSWERS);
      for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: 'NOT_SURE' });
      await phaseIs(clients, Phase.SHOWING_ANSWERS);
      asker.emit('next_turn');
      await phaseIs(clients, Phase.ASKING);
    }
    const assignments = h.server.registry.get(code)!.state.round!.assignments;
    for (const c of clients) expect(c.transcript()).not.toContain(assignments[c.id]!);
  });
});
