import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, Phase } from '@whoami/shared';
import { startHarness, type Harness, type TestClient } from './netHelpers.js';

let h: Harness;
afterEach(async () => {
  await h?.stop();
});

const items = Array.from({ length: 14 }, (_, i) => `ZQthing${String(i).padStart(2, '0')}x`);
const until = (fn: () => void) => vi.waitFor(fn, { timeout: 5000, interval: 25 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Timers are scaled by 1/100 (30s -> 300ms) and the disconnect grace is 300ms. */
async function startedRoom(names: string[], settings: object = {}) {
  h = await startHarness({ revealDurationMs: 60_000, timerScale: 0.01, disconnectGraceMs: 300 });
  const { code, clients } = await h.room(names);
  const host = clients[0]!;
  host.emit('update_room_settings', { list: { kind: 'custom', name: 'T', items }, settings });
  await until(() => expect(host.snapshot.list?.count).toBe(14));
  host.emit('start_game');
  await until(() => expect(clients.every((c) => c.snapshot.phase === Phase.ASKING)).toBe(true));
  return { code, clients, host };
}

const activeOf = (clients: TestClient[]) => clients.find((c) => c.id === clients[0]!.snapshot.round!.activeId)!;
const phaseIs = (clients: TestClient[], phase: string) =>
  until(() => expect(clients.every((c) => c.snapshot.phase === phase)).toBe(true));
const live = (clients: TestClient[]) => clients.filter((c) => c.connected);
const identityOf = (code: string, c: TestClient) => h.server.registry.get(code)!.state.round!.assignments[c.id]!;

describe('timers off', () => {
  it('sends no deadlines and never acts on its own', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    expect(clients[0]!.snapshot.timer).toBeNull();
    const asker = activeOf(clients);
    await sleep(700);
    expect(activeOf(clients).id).toBe(asker.id);
    asker.emit('submit_question', { text: 'Still here?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    expect(clients[0]!.snapshot.timer).toBeNull();
    await sleep(700);
    expect(clients[0]!.snapshot.phase).toBe(Phase.COLLECTING_ANSWERS);
    expect(clients[0]!.snapshot.history).toHaveLength(0);
  });
});

describe('turn timer', () => {
  it('sends only a deadline, skips the turn on expiry and restarts the timer', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara'], { turnTimeoutSec: 30 });
    const first = activeOf(clients);
    const t = clients[0]!.snapshot.timer!;
    expect(t).toEqual({ kind: 'turn', deadline: expect.any(Number), paused: false });
    expect(Math.abs(t.deadline! - clients[0]!.snapshot.serverTime - 300)).toBeLessThan(150);
    await until(() => expect(activeOf(clients).id).not.toBe(first.id));
    for (const c of clients) {
      expect(c.snapshot.history[0]).toMatchObject({ kind: 'skip', playerId: first.id, reason: 'TIMEOUT' });
      expect(c.snapshot.timer!.deadline).toBeGreaterThan(t.deadline!);
    }
    expect(first.snapshot.players.find((p) => p.id === first.id)!.questionsAsked).toBe(0);
  });

  it('flags a player AFK after 3 consecutive skips and clears it when they act', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob'], { turnTimeoutSec: 30, maxTurnsPerPlayer: 30 });
    await until(() => expect(clients[0]!.snapshot.players.every((p) => p.afk)).toBe(true));
    const target = activeOf(clients);
    target.emit('submit_guess', { text: 'something wrong' });
    await until(() => expect(clients[0]!.snapshot.players.find((p) => p.id === target.id)!.afk).toBe(false));
  });
});

describe('answer timer', () => {
  it('AUTO_NOT_SURE fills missing answers on expiry and reveals them', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara'], { answerTimeoutSec: 15, timeoutAction: 'AUTO_NOT_SURE' });
    const asker = activeOf(clients);
    const [x, y] = clients.filter((c) => c !== asker) as [TestClient, TestClient];
    asker.emit('submit_question', { text: 'Am I tiny?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    expect(asker.snapshot.timer).toMatchObject({ kind: 'answer', paused: false });
    x.emit('submit_answer', { answer: 'NO' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    const answers = asker.snapshot.reveal!.answers;
    expect(answers).toEqual(
      expect.arrayContaining([
        { playerId: x.id, answer: 'NO', auto: false },
        { playerId: y.id, answer: 'NOT_SURE', auto: true },
      ]),
    );
  });

  it('HOST_DECIDES waits for the host once time is up', async () => {
    const { clients, host } = await startedRoom(['Ann', 'Bob', 'Cara'], { answerTimeoutSec: 15 });
    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Am I tiny?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    await until(() => expect(clients.every((c) => c.snapshot.pending?.timedOut)).toBe(true));
    expect(clients[0]!.snapshot.timer).toBeNull();
    await sleep(400);
    expect(clients[0]!.snapshot.phase).toBe(Phase.COLLECTING_ANSWERS);
    host.emit('skip_answer');
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
  });

  it('answering in time cancels the timer: nothing fires after the old deadline', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara'], { answerTimeoutSec: 30, timeoutAction: 'AUTO_NOT_SURE', turnTimeoutSec: 30 });
    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Am I quick?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: 'YES' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    const turns = asker.count('turn_changed');
    await sleep(700); // well past the 300ms answer and turn windows
    expect(asker.snapshot.phase).toBe(Phase.SHOWING_ANSWERS);
    expect(asker.count('turn_changed')).toBe(turns);
    expect(asker.snapshot.reveal!.answers.every((a) => !a.auto)).toBe(true);
    expect(asker.snapshot.history.filter((e) => e.kind === 'skip')).toHaveLength(0);
  });
});

describe('disconnects', () => {
  it('a vanished answerer counts as Not sure after the grace period', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const asker = activeOf(clients);
    const [x, y] = clients.filter((c) => c !== asker) as [TestClient, TestClient];
    // keep the host connected so the game is not paused
    const away = x === clients[0] ? y : x;
    const other = away === x ? y : x;
    asker.emit('submit_question', { text: 'Am I wet?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    other.emit('submit_answer', { answer: 'YES' });
    away.close();
    await phaseIs(live(clients), Phase.SHOWING_ANSWERS);
    expect(asker.snapshot.reveal!.answers.find((a) => a.playerId === away.id)).toEqual({ playerId: away.id, answer: 'NOT_SURE', auto: true });
    expect(asker.snapshot.players.find((p) => p.id === away.id)!.connected).toBe(false);
  });

  it('a player who reconnects within the grace period still answers normally', async () => {
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const asker = activeOf(clients);
    const away = clients.find((c) => c !== asker && c !== clients[0])!;
    const token = away.session!.reconnectToken;
    asker.emit('submit_question', { text: 'Am I wet?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    away.close();
    const back = await h.connect();
    back.emit('resume_session', { roomCode: code, reconnectToken: token });
    await until(() => expect(back.session?.playerId).toBe(away.id));
    await sleep(500); // longer than the grace period: the reconnect cancelled it
    expect(asker.snapshot.pending!.answeredBy).not.toContain(away.id);
    back.emit('submit_answer', { answer: 'NO' });
    await until(() => expect(asker.snapshot.pending?.answeredBy ?? [away.id]).toContain(away.id));
    expect(back.snapshot.players.find((p) => p.id === away.id)!.connected).toBe(true);
  });

  it('a vanished questioner has the question cancelled and the turn skipped', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    // pick a non-host asker (skip the host's turn if needed)
    while (activeOf(clients).id === clients[0]!.id) {
      const before = activeOf(clients).id;
      clients[0]!.emit('skip_turn');
      await until(() => expect(activeOf(clients).id).not.toBe(before));
    }
    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Will I vanish?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    asker.close();
    await phaseIs(live(clients), Phase.ASKING);
    const snap = clients[0]!.snapshot;
    expect(snap.round!.activeId).not.toBe(asker.id);
    expect(snap.history.map((e) => e.kind)).toContain('question_cancelled');
    expect(snap.pending).toBeNull();
  });

  it('host disconnect pauses the game and its timer; returning resumes it', async () => {
    const { code, clients, host } = await startedRoom(['Ann', 'Bob'], { turnTimeoutSec: 120 });
    const bob = clients[1]!;
    const token = host.session!.reconnectToken;
    const active = activeOf(clients);
    host.close();
    await phaseIs([bob], Phase.PAUSED);
    expect(bob.snapshot.pausedFrom).toBe(Phase.ASKING);
    expect(bob.snapshot.timer).toMatchObject({ kind: 'turn', deadline: null, paused: true });
    await bob.expectError('submit_guess', { text: 'nope' }, ErrorCode.WRONG_PHASE);

    const back = await h.connect();
    back.emit('resume_session', { roomCode: code, reconnectToken: token });
    await until(() => expect(back.session?.playerId).toBe(host.id));
    await phaseIs([bob, back], Phase.ASKING);
    expect(bob.snapshot.round!.activeId).toBe(active.id);
    expect(bob.snapshot.timer!.deadline).toBeGreaterThan(bob.snapshot.serverTime);
    expect(bob.snapshot.hostId).toBe(host.id);
  });

  it('hands the host role to the next connected player if the host does not return', async () => {
    const { clients, host } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const [, bob, cara] = clients as [TestClient, TestClient, TestClient];
    host.close();
    await phaseIs([bob, cara], Phase.PAUSED);
    await until(() => expect(bob.snapshot.hostId).toBe(bob.id));
    await phaseIs([bob, cara], Phase.ASKING);
    expect(cara.snapshot.hostId).toBe(bob.id);
    // the new host has host powers; the old one is just an offline player
    bob.emit('skip_turn');
    await until(() => expect(bob.snapshot.history.at(-1)).toMatchObject({ kind: 'skip', reason: 'HOST' }));
    await cara.expectError('skip_turn', {}, ErrorCode.NOT_HOST);
  });

  it('removes an absent lobby player after the grace period, freeing the seat', async () => {
    h = await startHarness({ disconnectGraceMs: 300 });
    const { clients } = await h.room(['Ann', 'Bob', 'Cara']);
    clients[2]!.close();
    await until(() => expect(clients[0]!.snapshot.players.map((p) => p.name)).toEqual(['Ann', 'Bob']));
  });

  it('a returning player keeps their seat, score and view, and sees no private data', async () => {
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const guesser = activeOf(clients);
    guesser.emit('submit_guess', { text: identityOf(code, guesser) });
    await until(() => expect(clients[0]!.snapshot.players.find((p) => p.id === guesser.id)!.solved).toBe(true));
    const token = guesser.session!.reconnectToken;
    guesser.close();
    const back = await h.connect();
    back.emit('resume_session', { roomCode: code, reconnectToken: token });
    await until(() => expect(back.session?.playerId).toBe(guesser.id));
    const me = back.session!.snapshot.players.find((p) => p.id === guesser.id)!;
    expect(me).toMatchObject({ solved: true, roundScore: 3, identity: identityOf(code, guesser) });

    const other = clients.find((c) => c !== guesser && c.connected && c !== clients[0])!;
    const otherToken = other.session!.reconnectToken;
    other.close();
    const back2 = await h.connect();
    back2.emit('resume_session', { roomCode: code, reconnectToken: otherToken });
    await until(() => expect(back2.session?.playerId).toBe(other.id));
    expect(back2.transcript()).not.toContain(identityOf(code, other));
    expect(back2.transcript()).not.toContain(guesser.session!.reconnectToken);
  });
});
