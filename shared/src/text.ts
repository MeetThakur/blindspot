import { MAX_ITEM_LENGTH, MAX_LIST_ITEMS, MIN_LIST_ITEMS } from './constants.js';

/**
 * Canonical form used to compare guesses with identities (and to dedupe list items):
 * lowercase, trim, NFKD, strip diacritics and punctuation, collapse whitespace,
 * drop a leading "the".
 */
export function normalizeGuess(input: string): string {
  const stripped = input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.replace(/^the\s+/, '');
}

/** Trim, collapse whitespace, drop blanks, dedupe case/diacritic-insensitively (first spelling wins). */
export function cleanItems(raw: readonly string[]): string[] {
  return analyzeItems(raw).items;
}

export interface ItemAnalysis {
  /** Unique, non-blank items in their original order. */
  items: string[];
  blanks: number;
  duplicates: number;
  /** Items longer than the per-item limit (still included in `items`). */
  tooLong: string[];
}

export function analyzeItems(raw: readonly string[]): ItemAnalysis {
  const seen = new Set<string>();
  const items: string[] = [];
  let blanks = 0;
  let duplicates = 0;
  for (const line of raw) {
    const item = line.trim().replace(/\s+/g, ' ');
    if (!item) {
      blanks++;
      continue;
    }
    const key = normalizeGuess(item);
    if (!key || seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    items.push(item);
  }
  return { items, blanks, duplicates, tooLong: items.filter((i) => i.length > MAX_ITEM_LENGTH) };
}

/** Human-readable reason the list cannot be used with this many players, or null if it is fine. */
export function validateItems(items: readonly string[], playerCount: number): string | null {
  const needed = Math.max(MIN_LIST_ITEMS, playerCount);
  if (items.length < needed) {
    return (
      `Your list has ${items.length} unique item${items.length === 1 ? '' : 's'}, but needs at least ${needed}` +
      (needed > MIN_LIST_ITEMS ? ' (one per player)' : '') +
      `. Add ${needed - items.length} more.`
    );
  }
  if (items.length > MAX_LIST_ITEMS) {
    return `Your list has ${items.length} items; the maximum is ${MAX_LIST_ITEMS}.`;
  }
  return null;
}
