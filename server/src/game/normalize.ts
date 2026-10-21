import { normalizeGuess } from '@whoami/shared';

export { normalizeGuess };

export function guessMatches(guess: string, identity: string): boolean {
  const g = normalizeGuess(guess);
  return g.length > 0 && g === normalizeGuess(identity);
}
