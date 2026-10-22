import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, Phase } from '@whoami/shared';
import { aid, startHarness, type Harness, type TestClient } from './netHelpers.js';

let h: Harness;
afterEach(async () => {
  await h?.stop();
});

const items = Array.from({ length: 14 }, (_, i) => `ZQthing${String(i).padStart(2, '0')}x`);

async function startedRoom(names: string[], settings: object = {}) {
  h = await startHarness({ revealDurationMs: 60_000 });
  const { code, clients } = await h.room(names);
  const host = clients[0]!;
  host.emit('update_room_settings', { list: { kind: 'custom', name: 'Test', items }, settings });
  await vi.waitFor(() => expect(host.snapshot.list?.count).toBe(14));
  host.emit('start_game');
  await vi.waitFor(() => expect(clients.every((c) => c.snapshot.phase === Phase.ASKING)).toBe(true));
  return { code, clients, host };
}

const activeOf = (clients: TestClient[]) =>
  clients.find((c) => c.id === clients[0]!.snapshot.round!.activeId)!;
const phaseIs = (clients: TestClient[], phase: string) =>
  vi.waitFor(() => expect(clients.every((c) => c.snapshot.phase === phase)).toBe(true));
const identityOf = (code: string, c: TestClient) => h.server.registry.get(code)!.state.round!.assignments[c.id]!;
const waitTurnChange = (clients: TestClient[], from: string) =>
  vi.waitFor(() => expect(activeOf(clients).id).not.toBe(from));

async function questionTurn(clients: TestClient[]) {
  const asker = activeOf(clients);
  asker.emit('submit_question', { text: 'Am I a thing?' });
  await phaseIs(clients, Phase.COLLECTING_ANSWERS);
  for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: 'YES' });
  await phaseIs(clients, Phase.SHOWING_ANSWERS);
  asker.emit('next_turn');
  await phaseIs(clients, Phase.ASKING);
}

describe('guessing', () => {
  it('a wrong guess costs the turn and a point, and reveals nothing', async () => {
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const g = activeOf(clients);
    g.emit('submit_guess', { text: 'definitely wrong' });
    await waitTurnChange(clients, g.id);
    for (const c of clients) {
      expect(c.last('guess_result')).toEqual({ playerId: g.id, text: 'definitely wrong', correct: false });
      expect(c.snapshot.history.at(-1)).toMatchObject({ kind: 'guess', playerId: g.id, correct: false });
      const me = c.snapshot.players.find((p) => p.id === g.id)!;
      expect(me.solved).toBe(false);
      expect(me.wrongGuesses).toBe(1);
      expect(me.roundScore).toBe(0); // -1 floored at 0
    }
    expect(g.transcript()).not.toContain(identityOf(code, g));
    expect(g.snapshot.players.find((p) => p.id === g.id)!.identity).toBeNull();
  });

  it('a correct guess reveals the identity to the guesser only, and scores +1', async () => {
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const g = activeOf(clients);
    const others = clients.filter((c) => c !== g);
    const secret = identityOf(code, g);
    expect(g.transcript()).not.toContain(secret);
    g.emit('submit_guess', { text: secret.toLowerCase() });
    await waitTurnChange(clients, g.id);
    expect(g.snapshot.players.find((p) => p.id === g.id)).toMatchObject({ solved: true, identity: secret, roundScore: 3 });
    for (const c of clients) expect(c.count('player_solved')).toBe(1);
    // the other players' own identities remain hidden from them
    for (const c of others) {
      expect(c.transcript().includes(identityOf(code, c))).toBe(false);
      expect(c.snapshot.players.find((p) => p.id === c.id)!.identity).toBeNull();
    }
  });

  it('rejects guesses off-turn, empty, or in the wrong phase', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob']);
    const g = activeOf(clients);
    const other = clients.find((c) => c !== g)!;
    await other.expectError('submit_guess', { text: 'x' }, ErrorCode.NOT_YOUR_TURN);
    await g.expectError('submit_guess', { text: '   ' }, ErrorCode.PAYLOAD_INVALID);
    await g.expectError('submit_guess', { text: '?!' }, ErrorCode.INVALID_INPUT);
    g.emit('submit_question', { text: 'q?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    await g.expectError('submit_guess', { text: 'late' }, ErrorCode.WRONG_PHASE);
  });

  it('ignores a duplicate guess actionId (no double penalty or double turn)', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const g = activeOf(clients);
    const id = aid();
    g.socket.emit('submit_guess', { actionId: id, text: 'nope' });
    g.socket.emit('submit_guess', { actionId: id, text: 'nope' });
    await waitTurnChange(clients, g.id);
    await new Promise((r) => setTimeout(r, 100));
    expect(g.count('guess_result')).toBe(1);
    expect(g.errors()).toHaveLength(0);
    expect(g.snapshot.players.find((p) => p.id === g.id)!.wrongGuesses).toBe(1);
  });
});

describe('round completion over sockets', () => {
  it('2-player endgame: both players can solve, reveals everyone, and does not deadlock', async () => {
    const { code, clients } = await startedRoom(['Ann', 'Bob']);
    await questionTurn(clients);
    await questionTurn(clients);
    const g1 = activeOf(clients);
    g1.emit('submit_guess', { text: identityOf(code, g1) });
    await waitTurnChange(clients, g1.id);
    expect(clients[0]!.snapshot.phase).toBe(Phase.ASKING);
    const g2 = activeOf(clients);
    g2.emit('submit_guess', { text: identityOf(code, g2) });
    await phaseIs(clients, Phase.ROUND_RESULTS);
    for (const c of clients) {
      expect(c.last('round_ended')).toEqual({ reason: 'ALL_SOLVED' });
      const results = c.snapshot.results!;
      expect(results.players).toHaveLength(2);
      for (const p of results.players) expect(p.identity).toBe(identityOf(code, clients.find((x) => x.id === p.id)!));
      expect(results.players.find((p) => p.id === g1.id)).toMatchObject({ solved: true, roundScore: 2, totalScore: 2, guessesMade: 1 });
      expect(results.players.find((p) => p.id === g2.id)).toMatchObject({ solved: true, roundScore: 1, totalScore: 1, guessesMade: 1 });
      expect(c.snapshot.round!.activeId).toBeNull();
    }
  });

  it('solved players keep answering so a 3-player round cannot deadlock', async () => {
    const { code, clients } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const first = activeOf(clients);
    first.emit('submit_guess', { text: identityOf(code, first) });
    await waitTurnChange(clients, first.id);
    const asker = activeOf(clients);
    asker.emit('submit_question', { text: 'Am I old?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    expect(asker.snapshot.pending!.required).toContain(first.id);
    for (const c of clients.filter((c) => c !== asker)) c.emit('submit_answer', { answer: 'YES' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    asker.emit('next_turn');
    await phaseIs(clients, Phase.ASKING);
    expect(activeOf(clients).id).not.toBe(first.id); // solved players are skipped as askers
  });

  it('ends at the turn limit only after a full cycle', async () => {
    const { clients } = await startedRoom(['Ann', 'Bob', 'Cara'], { maxTurnsPerPlayer: 1 });
    await questionTurn(clients);
    await questionTurn(clients);
    expect(clients[0]!.snapshot.phase).toBe(Phase.ASKING);
    const last = activeOf(clients);
    last.emit('submit_question', { text: 'Am I last?' });
    await phaseIs(clients, Phase.COLLECTING_ANSWERS);
    for (const c of clients.filter((c) => c !== last)) c.emit('submit_answer', { answer: 'NO' });
    await phaseIs(clients, Phase.SHOWING_ANSWERS);
    last.emit('next_turn');
    await phaseIs(clients, Phase.ROUND_RESULTS);
    expect(clients[0]!.last('round_ended')).toEqual({ reason: 'TURN_LIMIT' });
    expect(clients[0]!.snapshot.results!.players.every((p) => p.questionsAsked === 1)).toBe(true);
  });

  it('the host can end a round (non-host cannot), after which identities are revealed', async () => {
    const { code, clients, host } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const other = clients.find((c) => c !== host)!;
    await other.expectError('end_round', { confirm: true }, ErrorCode.NOT_HOST);
    await host.expectError('end_round', {}, ErrorCode.PAYLOAD_INVALID); // confirmation required
    host.emit('end_round', { confirm: true });
    await phaseIs(clients, Phase.ROUND_RESULTS);
    expect(other.last('round_ended')).toEqual({ reason: 'HOST_ENDED' });
    expect(other.snapshot.players.find((p) => p.id === other.id)!.identity).toBe(identityOf(code, other));
    await host.expectError('end_round', { confirm: true }, ErrorCode.WRONG_PHASE);
  });
});

describe('multiple rounds', () => {
  it('restarts with new identities, rotates the starter and keeps cumulative scores', async () => {
    const { code, clients, host } = await startedRoom(['Ann', 'Bob', 'Cara']);
    const starters: string[] = [];
    for (let round = 1; round <= 3; round++) {
      expect(host.snapshot.roundNumber).toBe(round);
      const g = activeOf(clients);
      starters.push(g.id);
      g.emit('submit_guess', { text: identityOf(code, g) });
      await waitTurnChange(clients, g.id);
      host.emit('end_round', { confirm: true });
      await phaseIs(clients, Phase.ROUND_RESULTS);
      const total = host.snapshot.players.reduce((n, p) => n + p.totalScore, 0);
      expect(total).toBe(round * 3);
      if (round < 3) {
        host.emit('restart_round');
        await vi.waitFor(() => expect(clients.every((c) => c.snapshot.phase === Phase.ASKING && c.snapshot.roundNumber === round + 1)).toBe(true));
        // fresh round: nobody is solved, history cleared
        expect(host.snapshot.players.every((p) => !p.solved && p.roundScore === 0)).toBe(true);
        expect(host.snapshot.history).toHaveLength(0);
      }
    }
    expect(new Set(starters).size).toBe(3);
  });

  it('only the host restarts or returns to lobby, scores persist, settings can change between rounds', async () => {
    const { clients, host } = await startedRoom(['Ann', 'Bob']);
    const other = clients.find((c) => c !== host)!;
    await host.expectError('restart_round', {}, ErrorCode.WRONG_PHASE);
    host.emit('end_round', { confirm: true });
    await phaseIs(clients, Phase.ROUND_RESULTS);
    await other.expectError('restart_round', {}, ErrorCode.NOT_HOST);
    await other.expectError('return_to_lobby', {}, ErrorCode.NOT_HOST);

    host.emit('update_room_settings', { settings: { turnTimeoutSec: 60 }, list: { kind: 'category', id: 'animals' } });
    await vi.waitFor(() => expect(other.snapshot.settings).toMatchObject({ turnTimeoutSec: 60 }));
    expect(other.snapshot.list).toEqual({ name: 'Animals', count: 24 });

    host.emit('return_to_lobby');
    await phaseIs(clients, Phase.LOBBY);
    expect(other.snapshot.round).toBeNull();
    host.emit('start_game');
    await phaseIs(clients, Phase.ASKING);
    expect(other.snapshot.roundNumber).toBe(2);
  });

  it('a new player can join between rounds and plays the next one', async () => {
    const { code, clients, host } = await startedRoom(['Ann', 'Bob']);
    host.emit('end_round', { confirm: true });
    await phaseIs(clients, Phase.ROUND_RESULTS);
    const cara = await h.connect();
    cara.emit('join_room', { roomCode: code, name: 'Cara' });
    await vi.waitFor(() => expect(cara.session).not.toBeNull());
    host.emit('restart_round');
    const all = [...clients, cara];
    await phaseIs(all, Phase.ASKING);
    expect(cara.snapshot.round!.order).toHaveLength(3);
    expect(cara.snapshot.players.find((p) => p.id === cara.id)!.identity).toBeNull();
  });
});
