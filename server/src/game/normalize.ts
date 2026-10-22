import { normalizeGuess } from '@whoami/shared';

export { normalizeGuess };

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[] = [];
  for (let i = 0; i <= b.length; i++) d[i] = i;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = d[j]!;
      if (a[i - 1] === b[j - 1]) {
        d[j] = prev;
      } else {
        d[j] = Math.min(prev + 1, d[j]! + 1, d[j - 1]! + 1);
      }
      prev = temp;
    }
  }
  return d[b.length]!;
}

export function guessMatches(guess: string, identity: string): boolean {
  const g = normalizeGuess(guess);
  const id = normalizeGuess(identity);
  if (!g || !id) return false;

  // 1. Exact normalized match
  if (g === id) return true;

  // 2. Typo tolerance on full string
  if (id.length >= 5 && levenshtein(g, id) <= (id.length >= 8 ? 2 : 1)) {
    return true;
  }

  // 3. Multi-word name / Surname matching
  const parts = id.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const surname = parts[parts.length - 1]!;
    if (surname.length >= 3) {
      if (g === surname) return true;
      if (surname.length >= 5 && levenshtein(g, surname) <= (surname.length >= 7 ? 2 : 1)) return true;
    }

    const firstName = parts[0]!;
    if (firstName.length >= 4 && (g === firstName || (firstName.length >= 6 && levenshtein(g, firstName) <= (firstName.length >= 8 ? 2 : 1)))) {
      return true;
    }
  }

  return false;
}
