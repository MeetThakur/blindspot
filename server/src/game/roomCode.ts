import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@whoami/shared';

export type Rng = () => number;

/** Picks a code not in `taken`; retries on collision and lengthens after repeated misses. */
export function generateRoomCode(rng: Rng, taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const length = ROOM_CODE_LENGTH + (attempt >= 100 ? 1 : 0);
    let code = '';
    for (let i = 0; i < length; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
    }
    if (!taken.has(code)) return code;
  }
  throw new Error('Could not allocate a room code');
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
