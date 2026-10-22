import { describe, expect, it } from 'vitest';
import { DISCONNECT_GRACE_MS, ErrorCode, Phase } from '@whoami/shared';
import { Sim } from './helpers.js';

const GRACE = DISCONNECT_GRACE_MS;

function nonHost(s: Sim, notIn: string[] = []) {
  return s.ids.filter((i) => i !== s.host && !notIn.includes(i));
}

describe('disconnects', () => {
  it('waits out the grace period, then counts a missing answerer as Not sure', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ask();
    const away = nonHost(s, [s.active])[0] ?? s.others(s.active).find((i) => i !== s.host)!;
    const others = s.others(s.active).filter((i) => i !== away);
    s.ok({ type: 'disconnect', playerId: away });
    for (const o of others) s.ok({ type: 'submit_answer', playerId: o, answer: 'YES' });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    expect(s.deadline()).toBe(s.now + GRACE);
    s.advance(GRACE - 1);
    s.ok({ type: 'sweep' });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    s.advance(1);
    s.ok({ type: 'sweep' });
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
    expect(s.round.reveal!.answers.find((a) => a.playerId === away)).toMatchObject({ answer: 'NOT_SURE', auto: true });
  });

  it('a player who returns within the grace period still answers', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ask();
    const away = s.others(s.active).find((i) => i !== s.host)!;
    s.ok({ type: 'disconnect', playerId: away });
    s.advance(GRACE - 1000);
    s.ok({ type: 'reconnect', playerId: away });
    s.advance(10_000);
    s.ok({ type: 'sweep' });
    s.ok({ type: 'submit_answer', playerId: away, answer: 'NO' });
    expect(s.round.pending!.answers[away]).toEqual({ answer: 'NO', auto: false });
  });

  it('auto-fills players who were already gone when the question is asked', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const away = s.ids.find((i) => i !== s.host && i !== s.active)!;
    s.ok({ type: 'disconnect', playerId: away });
    s.advance(GRACE + 1);
    s.ok({ type: 'sweep' });
    // if the asker is the absent one this already skipped; otherwise ask now
    if (s.active === away) return;
    s.ask();
    expect(s.round.pending!.answers[away]).toMatchObject({ answer: 'NOT_SURE', auto: true });
    s.answerAll();
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
  });

  it('cancels the pending question and skips the turn when the questioner is gone', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    // make a non-host the asker
    while (s.active === s.host) s.ok({ type: 'skip_turn', playerId: s.host });
    const asker = s.active;
    s.ask('Am I big?');
    s.ok({ type: 'disconnect', playerId: asker });
    s.advance(GRACE);
    s.ok({ type: 'sweep' });
    expect(s.phase).toBe(Phase.ASKING);
    expect(s.active).not.toBe(asker);
    const kinds = s.round.history.map((h) => h.kind);
    expect(kinds).toContain('question_cancelled');
    expect(s.round.pending).toBeNull();
  });

  it('skips an absent active player even if no question was asked', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    while (s.active === s.host) s.ok({ type: 'skip_turn', playerId: s.host });
    const gone = s.active;
    s.ok({ type: 'disconnect', playerId: gone });
    s.advance(GRACE);
    s.ok({ type: 'sweep' });
    expect(s.active).not.toBe(gone);
    expect(s.round.history.at(-1)).toMatchObject({ kind: 'skip', playerId: gone, reason: 'DISCONNECTED' });
  });

  it('host disconnect pauses the game and rejects actions', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const active = s.active;
    s.ok({ type: 'disconnect', playerId: s.host });
    expect(s.phase).toBe(Phase.PAUSED);
    expect(s.snap('b').pausedFrom).toBe(Phase.ASKING);
    s.err({ type: 'submit_question', playerId: active, text: 'hi?' }, ErrorCode.WRONG_PHASE);
    s.err({ type: 'submit_guess', playerId: active, text: 'x' }, ErrorCode.WRONG_PHASE);
    s.err({ type: 'end_round', playerId: s.host }, ErrorCode.WRONG_PHASE);
  });

  it('host returning resumes exactly where the game was', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ask();
    s.ok({ type: 'disconnect', playerId: 'a' });
    s.advance(5000);
    s.ok({ type: 'reconnect', playerId: 'a' });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    expect(s.host).toBe('a');
  });

  it('transfers host to the next connected player if they do not return, then resumes', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ok({ type: 'disconnect', playerId: 'a' });
    s.advance(GRACE);
    s.ok({ type: 'sweep' });
    expect(s.host).toBe('b');
    expect(s.phase).toBe(Phase.ASKING);
    s.ok({ type: 'skip_turn', playerId: 'b' });
    // old host coming back is just a player
    s.ok({ type: 'reconnect', playerId: 'a' });
    s.err({ type: 'skip_turn', playerId: 'a' }, ErrorCode.NOT_HOST);
  });

  it('skips disconnected players when picking the new host', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ok({ type: 'disconnect', playerId: 'b' });
    s.ok({ type: 'disconnect', playerId: 'a' });
    s.advance(GRACE);
    s.ok({ type: 'sweep' });
    expect(s.host).toBe('c');
  });

  it('give-grace-restarts after a pause so absent players are not punished for it', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ask();
    const away = s.others(s.active).find((i) => i !== s.host)!;
    s.ok({ type: 'disconnect', playerId: away });
    s.advance(GRACE - 5000);
    s.ok({ type: 'disconnect', playerId: 'a' });
    s.advance(20_000);
    s.ok({ type: 'reconnect', playerId: 'a' });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    expect(s.round.pending!.answers[away]).toBeUndefined();
  });

  it('host can remove an absent player at any time and the room unblocks', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ask();
    const away = s.others(s.active).find((i) => i !== s.host)!;
    s.ok({ type: 'disconnect', playerId: away });
    for (const o of s.others(s.active).filter((i) => i !== away)) {
      s.ok({ type: 'submit_answer', playerId: o, answer: 'YES' });
    }
    s.ok({ type: 'kick', playerId: s.host, targetId: away });
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
  });

  it('reconnecting keeps score and progress and leaks nothing new', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const g = s.active;
    s.rightGuess();
    s.ok({ type: 'disconnect', playerId: g });
    s.ok({ type: 'reconnect', playerId: g });
    const snap = s.snap(g);
    const me = snap.players.find((p) => p.id === g)!;
    expect(me.solved).toBe(true);
    expect(me.roundScore).toBe(3);
    expect(me.identity).toBe(s.identity(g));

    const other = s.others(g).find((i) => !s.round.solved.includes(i))!;
    s.ok({ type: 'disconnect', playerId: other });
    s.ok({ type: 'reconnect', playerId: other });
    const json = JSON.stringify(s.snap(other));
    expect(json).not.toContain(s.identity(other));
    expect(json).not.toContain('t-');
  });

  it('lobby: absent non-hosts are dropped after the grace period, freeing the slot', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.ok({ type: 'disconnect', playerId: 'c' });
    s.advance(GRACE);
    s.ok({ type: 'sweep' });
    expect(s.state.players.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('lobby: host handover when the host never returns', () => {
    const s = new Sim(['a', 'b']);
    s.ok({ type: 'disconnect', playerId: 'a' });
    s.advance(GRACE);
    s.ok({ type: 'sweep' });
    expect(s.host).toBe('b');
  });

  it('2-player game never deadlocks when the other player vanishes', () => {
    const s = new Sim(['a', 'b'], 4);
    s.start({ maxTurnsPerPlayer: 2 });
    s.ok({ type: 'disconnect', playerId: 'b' });
    s.advance(GRACE);
    s.ok({ type: 'sweep' });
    for (let i = 0; i < 10 && s.phase !== Phase.ROUND_RESULTS; i++) {
      if (s.phase === Phase.ASKING) {
        s.active === 'a' ? s.fullQuestionTurn() : s.ok({ type: 'sweep' });
      } else if (s.phase === Phase.SHOWING_ANSWERS) {
        s.ok({ type: 'next_turn', playerId: 'a' });
      }
    }
    expect(s.phase).toBe(Phase.ROUND_RESULTS);
  });

  it('nextDeadline reports the earliest grace or timer deadline', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ turnTimeoutSec: 120 });
    s.ok({ type: 'disconnect', playerId: 'c' });
    expect(s.deadline()).toBe(s.now + GRACE);
  });
});
