import { describe, expect, it } from 'vitest';
import { generateRoomCode, guessMatches, normalizeGuess, shuffle } from '../src/game/index.js';
import { ROOM_CODE_ALPHABET } from '@whoami/shared';
import { seeded } from './helpers.js';

describe('normalizeGuess', () => {
  it.each([
    ['Pokemon', 'Pokémon'],
    ['  pOKÉMON ', 'Pokémon'],
    ['the rock', 'The Rock'],
    ['Spider-Man', 'spiderman'],
    ['  Darth    Vader ', 'darth vader'],
    ['beyonce', 'Beyoncé'],
    ['ＰＩＫＡＣＨＵ', 'Pikachu'],
    ['Mr. Bean!', 'mr bean'],
  ])('%s matches %s', (guess, identity) => {
    expect(guessMatches(guess, identity)).toBe(true);
  });

  it('does not match different things or empty input', () => {
    expect(guessMatches('Pikachu', 'Raichu')).toBe(false);
    expect(guessMatches('!!!', '???')).toBe(false);
    expect(normalizeGuess('The')).toBe('the');
  });
});

describe('room codes', () => {
  it('uses only the unambiguous alphabet', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[O0I1]/);
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rng, new Set());
      expect(code).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{5}$`));
    }
  });

  it('avoids collisions with existing codes', () => {
    const rng = seeded(3);
    const taken = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = generateRoomCode(rng, taken);
      expect(taken.has(c)).toBe(false);
      taken.add(c);
    }
  });

  it('retries on collision even when the rng repeats', () => {
    let calls = 0;
    const rng = () => (calls++ < 5 ? 0 : 0.5);
    const first = 'A'.repeat(5);
    const code = generateRoomCode(rng, new Set([first]));
    expect(code).not.toBe(first);
  });

  it('shuffles without losing items', () => {
    const out = shuffle([1, 2, 3, 4, 5], seeded(1));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
