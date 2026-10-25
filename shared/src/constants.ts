export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const MAX_NAME_LENGTH = 20;
export const MAX_QUESTION_LENGTH = 200;
export const MAX_GUESS_LENGTH = 100;
export const MAX_ITEM_LENGTH = 60;
export const MIN_LIST_ITEMS = 10;
export const MAX_LIST_ITEMS = 500;
/** Raw lines accepted before dedupe/blank removal. */
export const MAX_RAW_LIST_LINES = 1000;
/** Total characters across all submitted list items. */
export const MAX_LIST_PAYLOAD_CHARS = 40_000;
export const MAX_LIST_NAME_LENGTH = 40;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

export const PLAYER_COLORS = ['coral', 'sky', 'lime', 'violet', 'amber'] as const;

export const ANSWER_TIMEOUT_OPTIONS = [null, 15, 30, 45, 60] as const;
export const TURN_TIMEOUT_OPTIONS = [null, 30, 60, 90, 120] as const;

export const DEFAULT_MAX_TURNS_PER_PLAYER = 10;

// ---------- Barricade constants ----------
export const BARRICADE_MIN_PLAYERS = 2;
export const BARRICADE_MAX_PLAYERS = 4;
export const BARRICADE_GRID_SIZE = 9;
export const BARRICADE_CENTER = 4; // Center cell (4, 4) in 0-indexed 9x9 grid
export const BARRICADE_WALL_OPTIONS = [5, 6, 7, 8, 9, 10] as const;
export const DEFAULT_BARRICADES_PER_PLAYER = 6;
export const BARRICADE_TURN_TIMEOUT_OPTIONS = [null, 15, 30, 45, 60] as const;

/** How long a disconnected player is waited for before the game moves on. */
export const DISCONNECT_GRACE_MS = 60_000;
/** Fixed display time for revealed answers before the turn auto-advances. */
export const REVEAL_DURATION_MS = 6_000;
/** Consecutive skipped turns before a player is flagged AFK. */
export const AFK_SKIP_THRESHOLD = 3;

/** Built-in categories (items live on the server). Ids must match server/src/game/categories.ts. */
export const CATEGORY_OPTIONS = [
  { id: 'pokemon', name: 'Pokémon' },
  { id: 'anime', name: 'Anime characters' },
  { id: 'movie-tv', name: 'Movie & TV characters' },
  { id: 'superheroes', name: 'Superheroes' },
  { id: 'celebrities', name: 'Celebrities' },
  { id: 'animals', name: 'Animals' },
  { id: 'objects', name: 'Everyday objects' },
  { id: 'video-games', name: 'Video game characters' },
] as const;
