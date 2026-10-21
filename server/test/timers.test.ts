import { describe, expect, it } from 'vitest';
import { ErrorCode, Phase } from '@whoami/shared';
import { Sim } from './helpers.js';

describe('timers off', () => {
  it('sets no deadlines and takes no automatic action', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    expect(s.state.timer).toBeNull();
    expect(s.deadline()).toBeNull();
    const first = s.active;
    s.advance(24 * 3600_000);
    s.ok({ type: 'sweep' });
    s.ok({ type: 'expire', kind: 'turn', seq: s.state.seq });
    expect(s.active).toBe(first);
    s.ask();
    expect(s.state.timer).toBeNull();
    s.advance(24 * 3600_000);
    s.ok({ type: 'sweep' });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
  });

  it('host "Skip turn" resolves a stalled ASKING phase', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const stuck = s.active;
    s.ok({ type: 'skip_turn', playerId: s.host });
    expect(s.active).not.toBe(stuck);
    expect(s.round.history.at(-1)).toMatchObject({ kind: 'skip', playerId: stuck, reason: 'HOST' });
  });

  it('host "Skip answer" resolves a stalled COLLECTING phase as Not sure', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ask();
    const [x, y] = s.others(s.active) as [string, string];
    s.ok({ type: 'submit_answer', playerId: x, answer: 'YES' });
    s.ok({ type: 'skip_answer', playerId: s.host });
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
    expect(s.round.reveal!.answers.find((a) => a.playerId === y)).toEqual({ playerId: y, answer: 'NOT_SURE', auto: true });
  });

  it('host can skip a single named player', () => {
    const s = new Sim(['a', 'b', 'c', 'd']);
    s.start();
    s.ask();
    const [x] = s.others(s.active) as [string];
    s.ok({ type: 'skip_answer', playerId: s.host, targetId: x });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    expect(s.round.pending!.answers[x]!.answer).toBe('NOT_SURE');
    s.err({ type: 'skip_answer', playerId: s.host, targetId: x }, ErrorCode.INVALID_INPUT);
  });

  it('non-host skips are rejected', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.err({ type: 'skip_turn', playerId: 'b' }, ErrorCode.NOT_HOST);
    s.ask();
    s.err({ type: 'skip_answer', playerId: 'b' }, ErrorCode.NOT_HOST);
    s.err({ type: 'skip_answer', playerId: s.active }, s.active === 'a' ? ErrorCode.WRONG_PHASE : ErrorCode.NOT_HOST);
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
  });

  it('skip controls are phase-checked', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.err({ type: 'skip_answer', playerId: 'a' }, ErrorCode.WRONG_PHASE);
    s.ask();
    s.err({ type: 'skip_turn', playerId: 'a' }, ErrorCode.WRONG_PHASE);
  });
});

describe('timers on', () => {
  it('AUTO_NOT_SURE fills missing answers when the answer timer expires', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ answerTimeoutSec: 15, timeoutAction: 'AUTO_NOT_SURE' });
    s.ask();
    expect(s.state.timer).toMatchObject({ kind: 'answer', deadline: s.now + 15_000 });
    const [x, y] = s.others(s.active) as [string, string];
    s.ok({ type: 'submit_answer', playerId: x, answer: 'NO' });
    s.fireTimer();
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
    expect(s.round.reveal!.answers).toEqual([
      { playerId: x, answer: 'NO', auto: false },
      { playerId: y, answer: 'NOT_SURE', auto: true },
    ]);
  });

  it('HOST_DECIDES waits for the host after the answer timer expires', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ answerTimeoutSec: 30 });
    s.ask();
    s.fireTimer();
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    expect(s.snap('b').pending!.timedOut).toBe(true);
    expect(s.state.timer).toBeNull();
    s.ok({ type: 'skip_answer', playerId: s.host });
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
  });

  it('turn timeout skips the turn without recording a question or guess', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ turnTimeoutSec: 30 });
    const slow = s.active;
    expect(s.state.timer).toMatchObject({ kind: 'turn', deadline: s.now + 30_000 });
    s.fireTimer();
    expect(s.active).not.toBe(slow);
    expect(s.round.stats[slow]!.questionsAsked).toBe(0);
    expect(s.round.history).toEqual([{ kind: 'skip', turn: 1, playerId: slow, reason: 'TIMEOUT' }]);
    expect(s.state.timer).toMatchObject({ kind: 'turn' });
  });

  it('flags a player AFK after 3 consecutive skips and clears it when they act', () => {
    const s = new Sim(['a', 'b']);
    s.start({ turnTimeoutSec: 30, maxTurnsPerPlayer: 20 });
    const slow = s.active;
    for (let i = 0; i < 3; i++) {
      expect(s.active).toBe(slow);
      s.fireTimer();
      expect(s.state.players.find((p) => p.id === slow)!.afk).toBe(i === 2);
      s.wrongGuess();
    }
    expect(s.snap('b').players.find((p) => p.id === slow)!.afk).toBe(true);
    s.ask();
    expect(s.state.players.find((p) => p.id === slow)!.afk).toBe(false);
  });

  it('non-consecutive skips do not trigger AFK', () => {
    const s = new Sim(['a', 'b']);
    s.start({ turnTimeoutSec: 30, maxTurnsPerPlayer: 20 });
    const slow = s.active;
    for (let i = 0; i < 4; i++) {
      s.fireTimer();
      s.wrongGuess();
      if (i % 2 === 1) continue;
      s.wrongGuess(slow);
      s.wrongGuess();
    }
    expect(s.state.players.find((p) => p.id === slow)!.afk).toBe(false);
  });

  it('normal completion cancels timers: stale expiries never double-advance', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ answerTimeoutSec: 15, turnTimeoutSec: 30, timeoutAction: 'AUTO_NOT_SURE' });
    const turnTimer = s.state.timer!;
    s.ask();
    expect(s.state.timer!.seq).not.toBe(turnTimer.seq);
    const answerTimer = s.state.timer!;
    s.answerAll();
    expect(s.state.timer!.kind).toBe('reveal');

    // the cancelled answer timer fires late anyway
    s.advance(20_000);
    const before = s.state;
    s.ok({ type: 'expire', kind: 'answer', seq: answerTimer.seq });
    expect(s.phase).toBe(before.phase);
    expect(s.round.turnPos).toBe(before.round!.turnPos);

    // reveal advances once; a duplicate reveal expiry is ignored
    const revealTimer = s.state.timer!;
    s.ok({ type: 'expire', kind: 'reveal', seq: revealTimer.seq });
    const pos = s.round.turnPos;
    expect(s.phase).toBe(Phase.ASKING);
    s.ok({ type: 'expire', kind: 'reveal', seq: revealTimer.seq });
    s.ok({ type: 'expire', kind: 'turn', seq: turnTimer.seq });
    expect(s.round.turnPos).toBe(pos);
    expect(s.state.timer!.kind).toBe('turn');
  });

  it('a guess cancels the turn timer and starts the next one', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ turnTimeoutSec: 30 });
    const old = s.state.timer!;
    s.wrongGuess();
    expect(s.state.timer!.seq).not.toBe(old.seq);
    s.ok({ type: 'expire', kind: 'turn', seq: old.seq });
    expect(s.round.history.filter((h) => h.kind === 'skip')).toHaveLength(0);
  });

  it('ignores an expiry that arrives before its deadline', () => {
    const s = new Sim(['a', 'b']);
    s.start({ turnTimeoutSec: 30 });
    const t = s.state.timer!;
    s.advance(10_000);
    s.ok({ type: 'expire', kind: 'turn', seq: t.seq });
    expect(s.round.history).toHaveLength(0);
  });

  it('round end clears timers', () => {
    const s = new Sim(['a', 'b']);
    s.start({ turnTimeoutSec: 30 });
    s.ok({ type: 'end_round', playerId: 'a' });
    expect(s.state.timer).toBeNull();
  });

  it('pauses timers while the host is away and resumes with the remaining time', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ answerTimeoutSec: 30, timeoutAction: 'AUTO_NOT_SURE' });
    s.ask();
    s.advance(10_000);
    s.ok({ type: 'disconnect', playerId: 'a' });
    expect(s.phase).toBe(Phase.PAUSED);
    expect(s.state.timer).toMatchObject({ deadline: null, remainingMs: 20_000 });
    expect(s.snap('b').timer).toMatchObject({ paused: true });
    s.advance(30_000);
    s.ok({ type: 'sweep' });
    expect(s.phase).toBe(Phase.PAUSED);
    s.ok({ type: 'reconnect', playerId: 'a' });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    expect(s.state.timer!.deadline).toBe(s.now + 20_000);
    s.fireTimer();
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
  });
});
