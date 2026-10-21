import { describe, expect, it } from 'vitest';
import { Phase, ErrorCode } from '@whoami/shared';
import { Sim } from './helpers.js';

describe('identity assignment & privacy', () => {
  it('assigns a distinct identity to each player, only from the list', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = new Sim(['a', 'b', 'c', 'd', 'e'], seed);
      s.start();
      const ids = s.ids.map((i) => s.identity(i));
      expect(new Set(ids).size).toBe(5);
      ids.forEach((i) => expect(s.state.list!.items).toContain(i));
    }
  });

  it('never sends a player their own identity or any tokens', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ask();
    for (const viewer of s.ids) {
      const snap = s.snap(viewer);
      const json = JSON.stringify(snap);
      expect(json).not.toContain(s.identity(viewer));
      expect(json).not.toContain('t-' + viewer);
      expect(snap.players.find((p) => p.id === viewer)!.identity).toBeNull();
      for (const o of s.others(viewer)) {
        expect(snap.players.find((p) => p.id === o)!.identity).toBe(s.identity(o));
      }
    }
  });

  it('reveals your identity to you only once you solve it, and everyone at round end', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const first = s.active;
    s.rightGuess();
    expect(s.snap(first).players.find((p) => p.id === first)!.identity).toBe(s.identity(first));
    const other = s.others(first)[0]!;
    expect(JSON.stringify(s.snap(other))).not.toContain(s.identity(other));
    s.ok({ type: 'end_round', playerId: s.host });
    expect(s.snap(other).players.find((p) => p.id === other)!.identity).toBe(s.identity(other));
  });
});

describe('turns', () => {
  it('only the active player can ask or guess', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const other = s.others(s.active)[0]!;
    s.err({ type: 'submit_question', playerId: other, text: 'hi?' }, ErrorCode.NOT_YOUR_TURN);
    s.err({ type: 'submit_guess', playerId: other, text: 'x' }, ErrorCode.NOT_YOUR_TURN);
  });

  it('rotates clockwise through the order and wraps', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const order = [...s.round.order];
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(s.active);
      s.fullQuestionTurn();
    }
    expect(seen).toEqual([...order, ...order]);
  });

  it('rejects empty and over-long questions and guesses', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.err({ type: 'submit_question', playerId: s.active, text: '   ' }, ErrorCode.INVALID_INPUT);
    s.err({ type: 'submit_question', playerId: s.active, text: 'q'.repeat(201) }, ErrorCode.INVALID_INPUT);
    s.err({ type: 'submit_guess', playerId: s.active, text: '  ' }, ErrorCode.INVALID_INPUT);
    s.err({ type: 'submit_guess', playerId: s.active, text: '?!' }, ErrorCode.INVALID_INPUT);
    expect(s.phase).toBe(Phase.ASKING);
  });

  it('ignores duplicate actionIds (no double turn, no double penalty)', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const asker = s.active;
    const q = { type: 'submit_question', playerId: asker, text: 'Am I alive?', actionId: 'dup1' } as const;
    s.ok(q);
    const again = s.ok(q);
    expect(again.duplicate).toBe(true);
    expect(s.round.stats[asker]!.questionsAsked).toBe(1);

    s.answerAll();
    s.ok({ type: 'next_turn', playerId: s.host });
    const guesser = s.active;
    const g = { type: 'submit_guess', playerId: guesser, text: 'nope', actionId: 'dup2' } as const;
    s.ok(g);
    s.ok(g);
    expect(s.round.stats[guesser]!.wrongGuesses).toBe(1);
    expect(s.round.stats[guesser]!.rawScore).toBe(-1);
  });
});

describe('answers', () => {
  it('questioner cannot answer; answers are hidden until all are in, then revealed together', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const asker = s.active;
    const [x, y] = s.others(asker) as [string, string];
    s.ask('Am I fictional?');
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    s.err({ type: 'submit_answer', playerId: asker, answer: 'YES' }, ErrorCode.NOT_ALLOWED);

    s.ok({ type: 'submit_answer', playerId: x, answer: 'NO' });
    expect(s.phase).toBe(Phase.COLLECTING_ANSWERS);
    s.err({ type: 'submit_answer', playerId: x, answer: 'YES' }, ErrorCode.ALREADY_ANSWERED);
    // others (and the asker) see only progress, never the content
    const snap = s.snap(y);
    expect(snap.pending!.answeredBy).toEqual([x]);
    expect(snap.pending!.yourAnswer).toBeNull();
    expect(JSON.stringify(s.snap(asker))).not.toContain('"NO"');
    expect(s.snap(x).pending!.yourAnswer).toBe('NO');

    s.ok({ type: 'submit_answer', playerId: y, answer: 'NOT_SURE' });
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
    const reveal = s.snap(asker).reveal!;
    expect(reveal.answers).toEqual([
      { playerId: x, answer: 'NO', auto: false },
      { playerId: y, answer: 'NOT_SURE', auto: false },
    ]);
    expect(s.snap(asker).history.at(-1)).toMatchObject({ kind: 'question', text: 'Am I fictional?' });
  });

  it('does not advance until the reveal completes; only asker or host may continue', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const asker = s.active;
    s.ask();
    s.answerAll();
    s.err({ type: 'submit_question', playerId: s.others(asker)[0]!, text: 'x?' }, ErrorCode.WRONG_PHASE);
    const stranger = s.others(asker).find((i) => i !== s.host)!;
    if (stranger !== asker) s.err({ type: 'next_turn', playerId: stranger }, ErrorCode.NOT_ALLOWED);
    s.ok({ type: 'next_turn', playerId: asker });
    expect(s.phase).toBe(Phase.ASKING);
    expect(s.active).not.toBe(asker);
  });

  it('auto-advances after the fixed reveal delay', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    const asker = s.active;
    s.ask();
    s.answerAll();
    expect(s.state.timer!.kind).toBe('reveal');
    s.fireTimer();
    expect(s.phase).toBe(Phase.ASKING);
    expect(s.active).not.toBe(asker);
  });

  it('solved players still answer', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const first = s.active;
    s.rightGuess();
    expect(s.round.solved).toEqual([first]);
    // skip to a turn where someone else asks
    s.ask();
    expect(s.state.round!.pending!.required).toContain(first);
    s.answerAll();
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
    expect(s.round.reveal!.answers.some((a) => a.playerId === first)).toBe(true);
  });

  it('skips solved players as askers', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const first = s.active;
    s.rightGuess();
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      seen.add(s.active);
      s.fullQuestionTurn();
    }
    expect(seen.has(first)).toBe(false);
  });
});
