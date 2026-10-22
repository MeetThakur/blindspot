import { describe, expect, it } from 'vitest';
import { ErrorCode, Phase } from '@whoami/shared';
import { Sim } from './helpers.js';

describe('guessing & scoring', () => {
  it('correct guess marks solved, +1, and consumes the turn', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const g = s.active;
    s.rightGuess();
    expect(s.round.solved).toContain(g);
    expect(s.round.stats[g]!.rawScore).toBe(3);
    expect(s.active).not.toBe(g);
    expect(s.phase).toBe(Phase.ASKING);
    expect(s.events.some((e) => e.type === 'player_solved' && e.playerId === g)).toBe(true);
  });

  it('wrong guess costs the turn and reveals nothing, shown in history without score penalty', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const g = s.active;
    s.wrongGuess();
    expect(s.round.solved).not.toContain(g);
    expect(s.round.stats[g]!.rawScore).toBe(0);
    expect(s.active).not.toBe(g);
    expect(s.snap(g).history.at(-1)).toMatchObject({ kind: 'guess', playerId: g, text: 'definitely wrong', correct: false });
    expect(JSON.stringify(s.snap(g))).not.toContain(s.identity(g));
  });

  it('matches guesses with normalization (Pokemon == Pokémon)', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.round.assignments[s.active] = 'The Pokémon';
    s.ok({ type: 'submit_guess', playerId: s.active, text: '  pokemon ' });
    expect(s.round.solved).toHaveLength(1);
  });

  it('floors the round score at 0 and the penalty can be 0', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ maxTurnsPerPlayer: 3 });
    const g = s.active;
    s.wrongGuess();
    expect(s.snap(g).players.find((p) => p.id === g)!.roundScore).toBe(0);
    s.ok({ type: 'end_round', playerId: s.host });
    expect(s.state.totals[g]).toBe(0);

    const z = new Sim(['a', 'b', 'c']);
    z.start({ wrongGuessPenalty: 0 });
    const h = z.active;
    z.wrongGuess();
    expect(z.round.stats[h]!.rawScore).toBe(0);
  });

  it('wrong guesses before a solve do not penalize the solve score', () => {
    const s = new Sim(['a', 'b', 'c', 'd']);
    s.start({ maxTurnsPerPlayer: 5 });
    const g = s.active;
    s.wrongGuess();
    s.wrongGuess();
    s.wrongGuess();
    s.wrongGuess();
    s.rightGuess(g);
    expect(s.round.stats[g]!.rawScore).toBe(4);
  });

  it('optional speed bonus rewards early solves', () => {
    const s = new Sim(['a', 'b', 'c', 'd']);
    s.start({ speedBonus: true });
    const g = s.active;
    s.rightGuess();
    expect(s.round.stats[g]!.rawScore).toBe(6);
  });

  it('host can accept an imperfect guess with accept_guess', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const g = s.active;
    s.wrongGuess();
    expect(s.round.solved).not.toContain(g);
    s.ok({ type: 'accept_guess', playerId: s.host, targetId: g });
    expect(s.round.solved).toContain(g);
    expect(s.round.stats[g]!.rawScore).toBe(3);
  });

  it('tracks questions asked and guesses made', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const q = s.active;
    s.fullQuestionTurn();
    s.wrongGuess();
    s.wrongGuess();
    s.ids.forEach(() => undefined);
    expect(s.round.stats[q]!.questionsAsked).toBe(1);
  });
});

describe('round completion', () => {
  it('continues until everyone solves their identity (3 players)', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.rightGuess();
    expect(s.phase).toBe(Phase.ASKING);
    s.rightGuess();
    expect(s.phase).toBe(Phase.ASKING);
    s.rightGuess();
    expect(s.phase).toBe(Phase.ROUND_RESULTS);
    expect(s.round.results!.reason).toBe('ALL_SOLVED');
    expect(s.round.results!.players.filter((p) => p.solved)).toHaveLength(3);
  });

  it('2-player endgame: both players can solve, no deadlock', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.fullQuestionTurn();
    s.fullQuestionTurn();
    s.rightGuess();
    expect(s.phase).toBe(Phase.ASKING);
    s.rightGuess();
    expect(s.phase).toBe(Phase.ROUND_RESULTS);
    expect(s.snap('a').results!.players).toHaveLength(2);
    // and the host can immediately start another round
    s.ok({ type: 'restart_round', playerId: s.host });
    expect(s.phase).toBe(Phase.ASKING);
  });

  it('endgame with solved players: they keep answering, so the game cannot deadlock', () => {
    const s = new Sim(['a', 'b', 'c', 'd']);
    s.start({ maxTurnsPerPlayer: 4 });
    s.rightGuess();
    s.rightGuess();
    expect(s.phase).toBe(Phase.ASKING);
    for (let i = 0; i < 20 && s.phase === Phase.ASKING; i++) s.fullQuestionTurn();
    expect(s.phase).toBe(Phase.ROUND_RESULTS);
  });

  it('turn limit only triggers at the end of a full cycle', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start({ maxTurnsPerPlayer: 2 });
    for (let i = 0; i < 5; i++) {
      expect(s.phase).toBe(Phase.ASKING);
      s.fullQuestionTurn();
    }
    // 5 of 6 turns done: the last player in the cycle still gets their turn.
    expect(s.phase).toBe(Phase.ASKING);
    s.ask();
    s.answerAll();
    s.ok({ type: 'next_turn', playerId: s.host });
    expect(s.phase).toBe(Phase.ROUND_RESULTS);
    expect(s.round.results!.reason).toBe('TURN_LIMIT');
    expect(s.round.results!.players.every((p) => p.questionsAsked === 2)).toBe(true);
  });

  it('defaults to 10 turns per player', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    expect(s.state.settings.maxTurnsPerPlayer).toBe(10);
    for (let i = 0; i < 19; i++) s.fullQuestionTurn();
    expect(s.phase).toBe(Phase.ASKING);
    s.fullQuestionTurn();
    expect(s.phase).toBe(Phase.ROUND_RESULTS);
  });

  it('host can end the round at any in-round phase; non-host cannot', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.err({ type: 'end_round', playerId: 'b' }, ErrorCode.NOT_HOST);
    s.ask();
    s.ok({ type: 'end_round', playerId: 'a' });
    expect(s.round.results!.reason).toBe('HOST_ENDED');
    expect(s.state.timer).toBeNull();
    s.err({ type: 'end_round', playerId: 'a' }, ErrorCode.WRONG_PHASE);
  });

  it('reveals every identity in results', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    s.ok({ type: 'end_round', playerId: 'a' });
    const results = s.snap('b').results!;
    for (const p of results.players) expect(p.identity).toBe(s.identity(p.id));
  });
});

describe('multiple rounds', () => {
  it('rotates the starting player, assigns fresh identities, and keeps scores', () => {
    const s = new Sim(['a', 'b', 'c']);
    const starters: string[] = [];
    const totalsAfter: number[] = [];
    s.start();
    for (let round = 1; round <= 3; round++) {
      starters.push(s.active);
      expect(s.state.roundNumber).toBe(round);
      s.rightGuess();
      s.ok({ type: 'end_round', playerId: s.host });
      totalsAfter.push(Object.values(s.state.totals).reduce((x, y) => x + y, 0));
      if (round < 3) s.ok({ type: 'restart_round', playerId: s.host });
    }
    expect(new Set(starters).size).toBe(3);
    expect(totalsAfter).toEqual([3, 6, 9]);
  });

  it('only the host restarts or returns to lobby, and only from results', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.err({ type: 'restart_round', playerId: 'a' }, ErrorCode.WRONG_PHASE);
    s.ok({ type: 'end_round', playerId: 'a' });
    s.err({ type: 'restart_round', playerId: 'b' }, ErrorCode.NOT_HOST);
    s.err({ type: 'return_to_lobby', playerId: 'b' }, ErrorCode.NOT_HOST);
    s.ok({ type: 'return_to_lobby', playerId: 'a' });
    expect(s.phase).toBe(Phase.LOBBY);
  });

  it('allows settings changes and joining between rounds', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.ok({ type: 'end_round', playerId: 'a' });
    s.settings({ speedBonus: true });
    s.ok({ type: 'join', playerId: 'c', name: 'c', token: 't' });
    s.ok({ type: 'restart_round', playerId: 'a' });
    expect(s.round.order).toHaveLength(3);
  });

  it('refuses to restart if the list is now too small for the players', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.ok({ type: 'end_round', playerId: 'a' });
    s.ok({ type: 'kick', playerId: 'a', targetId: 'b' });
    s.err({ type: 'restart_round', playerId: 'a' }, ErrorCode.NOT_ENOUGH_PLAYERS);
  });
});

describe('removing players mid-round', () => {
  it('kicking the active asker cancels the question and moves on', () => {
    const s = new Sim(['a', 'b', 'c', 'd']);
    s.start();
    const asker = s.active;
    s.ask();
    s.ok({ type: 'kick', playerId: s.host, targetId: asker === s.host ? 'b' : asker });
    if (asker !== s.host) {
      expect(s.phase).toBe(Phase.ASKING);
      expect(s.round.order).not.toContain(asker);
    }
  });

  it('kicking a pending answerer lets the question complete', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.start();
    const asker = s.active;
    const [x, y] = s.others(asker).filter((i) => i !== 'a').concat(s.others(asker)).slice(0, 2) as [string, string];
    s.ask();
    const victim = [x, y].find((i) => i !== 'a')!;
    const other = s.others(asker).find((i) => i !== victim)!;
    s.ok({ type: 'submit_answer', playerId: other, answer: 'YES' });
    s.ok({ type: 'kick', playerId: 'a', targetId: victim });
    expect(s.phase).toBe(Phase.SHOWING_ANSWERS);
  });

  it('ends the round if too few players remain', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.ok({ type: 'kick', playerId: 'a', targetId: 'b' });
    expect(s.phase).toBe(Phase.ROUND_RESULTS);
    expect(s.round.results!.reason).toBe('NOT_ENOUGH_PLAYERS');
  });
});
