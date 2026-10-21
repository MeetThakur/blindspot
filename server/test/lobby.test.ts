import { describe, expect, it } from 'vitest';
import { Phase, ErrorCode } from '@whoami/shared';
import { Sim } from './helpers.js';

describe('lobby', () => {
  it('creates a room with the host as the only player', () => {
    const s = new Sim(['ann']);
    expect(s.state.phase).toBe(Phase.LOBBY);
    expect(s.state.hostId).toBe('ann');
    expect(s.state.players).toHaveLength(1);
  });

  it('allows up to 5 players and rejects the 6th', () => {
    const s = new Sim(['a', 'b', 'c', 'd', 'e']);
    expect(s.state.players).toHaveLength(5);
    s.err({ type: 'join', playerId: 'f', name: 'f', token: 'x' }, ErrorCode.ROOM_FULL);
  });

  it('rejects duplicate names case-insensitively and bad names', () => {
    const s = new Sim(['Ann']);
    s.err({ type: 'join', playerId: 'x', name: '  aNN ', token: 't' }, ErrorCode.NAME_TAKEN);
    s.err({ type: 'join', playerId: 'x', name: '   ', token: 't' }, ErrorCode.INVALID_INPUT);
    s.err({ type: 'join', playerId: 'x', name: 'n'.repeat(21), token: 't' }, ErrorCode.INVALID_INPUT);
  });

  it('needs 2 players and a list to start', () => {
    const solo = new Sim(['a']);
    solo.useItems();
    solo.err({ type: 'start_game', playerId: 'a' }, ErrorCode.NOT_ENOUGH_PLAYERS);
    const s = new Sim(['a', 'b']);
    s.err({ type: 'start_game', playerId: 'a' }, ErrorCode.LIST_INVALID);
  });

  it('only the host can start, change settings, or kick', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.useItems();
    s.err({ type: 'start_game', playerId: 'b' }, ErrorCode.NOT_HOST);
    s.err({ type: 'update_settings', playerId: 'b', settings: { speedBonus: true } }, ErrorCode.NOT_HOST);
    s.err({ type: 'kick', playerId: 'b', targetId: 'c' }, ErrorCode.NOT_HOST);
    s.ok({ type: 'kick', playerId: 'a', targetId: 'c' });
    expect(s.state.players.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('validates settings and list sizes with helpful errors', () => {
    const s = new Sim(['a', 'b']);
    s.err({ type: 'update_settings', playerId: 'a', settings: { turnTimeoutSec: 45 } }, ErrorCode.INVALID_INPUT);
    s.err({ type: 'update_settings', playerId: 'a', settings: { wrongGuessPenalty: 1 } }, ErrorCode.INVALID_INPUT);
    s.err({ type: 'update_settings', playerId: 'a', settings: { bogus: 1 } }, ErrorCode.INVALID_INPUT);
    const small = s.run({ type: 'update_settings', playerId: 'a', list: { kind: 'custom', name: 'x', items: ['a', 'b', 'c'] } });
    expect(small.ok).toBe(false);
    if (!small.ok) expect(small.error.message).toMatch(/at least 10/);
    s.ok({ type: 'update_settings', playerId: 'a', list: { kind: 'category', id: 'pokemon' } });
    expect(s.state.list?.name).toBe('Pokémon');
  });

  it('penalty is configurable to 0 and timers accept only allowed values', () => {
    const s = new Sim(['a', 'b']);
    s.settings({ wrongGuessPenalty: 0, answerTimeoutSec: 30, turnTimeoutSec: 90, timeoutAction: 'AUTO_NOT_SURE' });
    expect(s.state.settings).toMatchObject({ wrongGuessPenalty: 0, answerTimeoutSec: 30, turnTimeoutSec: 90 });
  });

  it('rejects settings changes and joins mid-round', () => {
    const s = new Sim(['a', 'b']);
    s.start();
    s.err({ type: 'update_settings', playerId: 'a', settings: { speedBonus: true } }, ErrorCode.WRONG_PHASE);
    s.err({ type: 'update_settings', playerId: 'a', list: { kind: 'category', id: 'animals' } }, ErrorCode.WRONG_PHASE);
    s.err({ type: 'join', playerId: 'z', name: 'z', token: 't' }, ErrorCode.GAME_IN_PROGRESS);
    s.err({ type: 'start_game', playerId: 'a' }, ErrorCode.WRONG_PHASE);
  });

  it('rejects unknown players', () => {
    const s = new Sim(['a', 'b']);
    s.err({ type: 'start_game', playerId: 'ghost' }, ErrorCode.UNKNOWN_PLAYER);
  });

  it('leaving transfers host', () => {
    const s = new Sim(['a', 'b', 'c']);
    s.ok({ type: 'leave', playerId: 'a' });
    expect(s.state.hostId).toBe('b');
  });
});
