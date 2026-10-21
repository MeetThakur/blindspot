import { describe, expect, it } from 'vitest';
import { CATEGORIES, cleanItems, resolveSelection, validateItems } from '../src/game/index.js';

const many = (n: number) => Array.from({ length: n }, (_, i) => `thing ${i}`);

describe('custom lists', () => {
  it('trims, drops blanks and dedupes case/diacritic-insensitively', () => {
    expect(cleanItems(['  Pikachu ', '', 'pikachu', 'PIKACHU', '   ', 'Pokémon', 'pokemon'])).toEqual(['Pikachu', 'Pokémon']);
  });

  it('requires at least 10 unique items', () => {
    expect(validateItems(many(9), 2)).toMatch(/at least 10/);
    expect(validateItems(many(10), 2)).toBeNull();
  });

  it('rejects more than 500 items', () => {
    expect(validateItems(many(501), 2)).toMatch(/maximum/);
    expect(validateItems(many(500), 2)).toBeNull();
  });

  it('rejects items over 60 chars and oversized payloads', () => {
    const long = resolveSelection({ kind: 'custom', name: 'x', items: ['a'.repeat(61)] });
    expect(long.ok).toBe(false);
    const huge = resolveSelection({ kind: 'custom', name: 'x', items: Array(1000).fill('a'.repeat(60)) });
    expect(huge.ok).toBe(false);
  });

  it('built-in categories are valid for 5 players', () => {
    for (const c of CATEGORIES) {
      expect(validateItems(cleanItems(c.items), 5)).toBeNull();
      expect(cleanItems(c.items)).toHaveLength(c.items.length);
    }
  });
});

describe('category options', () => {
  it('shared CATEGORY_OPTIONS match the server categories', async () => {
    const { CATEGORY_OPTIONS } = await import('@whoami/shared');
    expect(CATEGORY_OPTIONS.map((c) => [c.id, c.name])).toEqual(CATEGORIES.map((c) => [c.id, c.name]));
  });
});
