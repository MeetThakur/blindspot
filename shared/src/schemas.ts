import { z } from 'zod';
import {
  ANSWER_TIMEOUT_OPTIONS,
  BARRICADE_GRID_SIZE,
  BARRICADE_GRID_SIZE_OPTIONS,
  BARRICADE_TURN_TIMEOUT_OPTIONS,
  BARRICADE_WALL_OPTIONS,
  BATTLESHIP_GRID_SIZE,
  BATTLESHIP_TURN_TIMEOUT_OPTIONS,
  MAX_GUESS_LENGTH,
  MAX_ITEM_LENGTH,
  MAX_LIST_NAME_LENGTH,
  MAX_LIST_PAYLOAD_CHARS,
  MAX_NAME_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_RAW_LIST_LINES,
  TURN_TIMEOUT_OPTIONS,
} from './constants.js';
import {
  Answer,
  BarricadePhase,
  BattleshipPhase,
  GameType,
  Phase,
  RoundEndReason,
  SkipReason,
  TimeoutAction,
  TimerKind,
} from './phases.js';

const values = <T extends Record<string, string>>(o: T) =>
  Object.values(o) as [T[keyof T], ...T[keyof T][]];

export const PhaseSchema = z.enum(values(Phase));
export const AnswerSchema = z.enum(values(Answer));
export const TimeoutActionSchema = z.enum(values(TimeoutAction));
export const RoundEndReasonSchema = z.enum(values(RoundEndReason));
export const SkipReasonSchema = z.enum(values(SkipReason));
export const TimerKindSchema = z.enum(values(TimerKind));
export const GameTypeSchema = z.enum(values(GameType)).default('blindspot');
export const BarricadePhaseSchema = z.enum(values(BarricadePhase));
export const BattleshipPhaseSchema = z.enum(values(BattleshipPhase));
export const AnyPhaseSchema = z.union([PhaseSchema, BarricadePhaseSchema, BattleshipPhaseSchema]);

const literalUnion = <T extends readonly (number | null)[]>(opts: T) =>
  z.union(opts.map((o) => z.literal(o)) as unknown as [z.ZodLiteral<number | null>, ...z.ZodLiteral<number | null>[]]);

const actionId = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);

// ---------- Settings ----------

export const ModeSchema = z.enum(['text', 'voice']);
export type GameMode = z.infer<typeof ModeSchema>;

export const SettingsSchema = z.object({
  mode: ModeSchema.default('text'),
  maxTurnsPerPlayer: z.number().int().min(1).max(50),
  answerTimeoutSec: literalUnion(ANSWER_TIMEOUT_OPTIONS),
  turnTimeoutSec: literalUnion(TURN_TIMEOUT_OPTIONS),
  timeoutAction: TimeoutActionSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;
export const SettingsPatchSchema = SettingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

// ---------- Barricade Settings & Game Schemas ----------

export const BarricadeSettingsSchema = z.object({
  gridSize: literalUnion(BARRICADE_GRID_SIZE_OPTIONS).default(11),
  barricadesPerPlayer: z.number().int().min(5).max(10),
  turnTimeoutSec: literalUnion(BARRICADE_TURN_TIMEOUT_OPTIONS),
});
export type BarricadeSettings = z.infer<typeof BarricadeSettingsSchema>;
// The patch must not inherit `.default()`s: zod 4 applies them inside `.partial()`, which silently resets omitted fields.
export const BarricadeSettingsPatchSchema = z
  .object({
    gridSize: literalUnion(BARRICADE_GRID_SIZE_OPTIONS),
    barricadesPerPlayer: z.number().int().min(5).max(10),
    turnTimeoutSec: literalUnion(BARRICADE_TURN_TIMEOUT_OPTIONS),
  })
  .partial()
  .strict();
export type BarricadeSettingsPatch = z.infer<typeof BarricadeSettingsPatchSchema>;

export const DEFAULT_BARRICADE_SETTINGS: BarricadeSettings = {
  gridSize: 11,
  barricadesPerPlayer: 6,
  turnTimeoutSec: 30,
};

export const PositionSchema = z.object({
  x: z.number().int().min(0).max(15),
  y: z.number().int().min(0).max(15),
});
export type Position = z.infer<typeof PositionSchema>;

export const WallSchema = z.object({
  orientation: z.enum(['h', 'v']),
  x: z.number().int().min(0).max(14),
  y: z.number().int().min(0).max(14),
  placedBy: z.string().optional(),
});
export type Wall = z.infer<typeof WallSchema>;

export const BarricadePlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  connected: z.boolean(),
  isHost: z.boolean(),
  afk: z.boolean(),
  position: PositionSchema,
  startPosition: PositionSchema,
  barricadesRemaining: z.number().int(),
  wallsPlaced: z.number().int(),
  movesCount: z.number().int(),
  score: z.number().int().default(0),
});
export type BarricadePlayer = z.infer<typeof BarricadePlayerSchema>;

export const BarricadeSnapshotSchema = z.object({
  phase: BarricadePhaseSchema,
  gridSize: z.number().int().default(BARRICADE_GRID_SIZE),
  goal: PositionSchema,
  players: z.array(BarricadePlayerSchema),
  activeId: z.string().nullable(),
  turnCount: z.number().int(),
  walls: z.array(WallSchema),
  winnerId: z.string().nullable(),
  settings: BarricadeSettingsSchema,
  timer: z
    .object({ deadline: z.number().nullable(), paused: z.boolean() })
    .nullable(),
});
export type BarricadeSnapshot = z.infer<typeof BarricadeSnapshotSchema>;

// ---------- Battleship schemas ----------

export const BattleshipShipPlacementSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number().int().min(2).max(5),
  x: z.number().int().min(0).max(9),
  y: z.number().int().min(0).max(9),
  orientation: z.enum(['h', 'v']),
});
export type BattleshipShipPlacement = z.infer<typeof BattleshipShipPlacementSchema>;

export const BattleshipShotSchema = z.object({
  attackerId: z.string(),
  targetId: z.string(),
  x: z.number().int().min(0).max(9),
  y: z.number().int().min(0).max(9),
  result: z.enum(['hit', 'miss']),
  sunkShip: z.string().optional(),
  turn: z.number().int(),
});
export type BattleshipShot = z.infer<typeof BattleshipShotSchema>;

export const BattleshipSettingsSchema = z.object({
  turnTimeoutSec: literalUnion(BATTLESHIP_TURN_TIMEOUT_OPTIONS).default(30),
  extraShotOnHit: z.boolean().default(false),
});
export type BattleshipSettings = z.infer<typeof BattleshipSettingsSchema>;

export const DEFAULT_BATTLESHIP_SETTINGS: BattleshipSettings = {
  turnTimeoutSec: 30,
  extraShotOnHit: false,
};

// No `.default()`s here: zod 4 applies them inside `.partial()`, so toggling one setting would reset the others.
export const BattleshipSettingsPatchSchema = z
  .object({
    turnTimeoutSec: literalUnion(BATTLESHIP_TURN_TIMEOUT_OPTIONS),
    extraShotOnHit: z.boolean(),
  })
  .partial();
export type BattleshipSettingsPatch = z.infer<typeof BattleshipSettingsPatchSchema>;

export const BattleshipPlayerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  connected: z.boolean(),
  isHost: z.boolean(),
  afk: z.boolean(),
  ready: z.boolean(),
  alive: z.boolean(),
  score: z.number().int(),
  shipsRemaining: z.number().int(),
  sunkShips: z.array(z.string()),
  /** Revealed only for viewer's own ship during game, or for all players on GAME_OVER! */
  ships: z.array(BattleshipShipPlacementSchema).optional(),
  /** Shots fired by any opponent AT this player */
  shotsReceived: z.array(BattleshipShotSchema),
});
export type BattleshipPlayerSnapshot = z.infer<typeof BattleshipPlayerSnapshotSchema>;

export const BattleshipSnapshotSchema = z.object({
  phase: BattleshipPhaseSchema,
  gridSize: z.number().int().default(BATTLESHIP_GRID_SIZE),
  players: z.array(BattleshipPlayerSnapshotSchema),
  activeId: z.string().nullable(),
  turnCount: z.number().int(),
  winnerId: z.string().nullable(),
  settings: BattleshipSettingsSchema,
  lastShot: BattleshipShotSchema.nullable().optional(),
  timer: z
    .object({ deadline: z.number().nullable(), paused: z.boolean() })
    .nullable(),
});
export type BattleshipSnapshot = z.infer<typeof BattleshipSnapshotSchema>;

// ---------- Lists ----------

export const ListSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('category'), id: z.string().min(1).max(40) }),
  z.object({
    kind: z.literal('custom'),
    name: z.string().trim().min(1).max(MAX_LIST_NAME_LENGTH),
    items: z.array(z.string().max(MAX_ITEM_LENGTH)).max(MAX_RAW_LIST_LINES),
  }),
]).superRefine((v, ctx) => {
  if (v.kind === 'custom') {
    const total = v.items.reduce((n, s) => n + s.length, 0);
    if (total > MAX_LIST_PAYLOAD_CHARS) {
      ctx.addIssue({ code: 'custom', message: 'List is too large' });
    }
  }
});
export type ListSelection = z.infer<typeof ListSelectionSchema>;

// ---------- Client -> server events ----------

const displayName = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const roomCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/);

export const CreateRoomSchema = z.object({
  actionId,
  name: displayName,
  gameType: GameTypeSchema.optional(),
});
export const JoinRoomSchema = z.object({ actionId, roomCode, name: displayName });
export const ResumeSessionSchema = z.object({
  actionId,
  roomCode,
  reconnectToken: z.string().min(16).max(128),
});
export const UpdateRoomSettingsSchema = z.object({
  actionId,
  settings: SettingsPatchSchema.optional(),
  list: ListSelectionSchema.optional(),
});
export const UpdateBarricadeSettingsSchema = z.object({
  actionId,
  settings: BarricadeSettingsPatchSchema,
});
export const BarricadeMoveSchema = z.object({
  actionId,
  x: z.number().int().min(0).max(14),
  y: z.number().int().min(0).max(14),
});
export const BarricadePlaceWallSchema = z.object({
  actionId,
  orientation: z.enum(['h', 'v']),
  x: z.number().int().min(0).max(13),
  y: z.number().int().min(0).max(13),
});
export const UpdateBattleshipSettingsSchema = z.object({
  actionId,
  settings: BattleshipSettingsPatchSchema,
});
export const BattleshipPlaceShipsSchema = z.object({
  actionId,
  ships: z.array(BattleshipShipPlacementSchema).min(1).max(5),
});
export const BattleshipFireSchema = z.object({
  actionId,
  targetId: z.string().min(1).max(64),
  x: z.number().int().min(0).max(9),
  y: z.number().int().min(0).max(9),
});
export const StartGameSchema = z.object({ actionId });
export const SubmitQuestionSchema = z.object({
  actionId,
  text: z.string().trim().min(1).max(MAX_QUESTION_LENGTH).default('(Voice question)'),
});
export const SubmitAnswerSchema = z.object({ actionId, answer: AnswerSchema });
export const SubmitGuessSchema = z.object({ actionId, text: text(MAX_GUESS_LENGTH) });
export const NextTurnSchema = z.object({ actionId });
export const RestartRoundSchema = z.object({ actionId });
export const ReturnToLobbySchema = z.object({ actionId });
export const LeaveRoomSchema = z.object({ actionId });
export const KickPlayerSchema = z.object({ actionId, playerId: z.string().min(1).max(64) });
export const EndRoundSchema = z.object({ actionId, confirm: z.literal(true) });
export const SkipAnswerSchema = z.object({
  actionId,
  /** Omit to skip every missing answer. */
  playerId: z.string().min(1).max(64).optional(),
});
export const SkipTurnSchema = z.object({ actionId });
export const AcceptGuessSchema = z.object({
  actionId,
  playerId: z.string().min(1).max(64),
});

export const clientEventSchemas = {
  create_room: CreateRoomSchema,
  join_room: JoinRoomSchema,
  resume_session: ResumeSessionSchema,
  update_room_settings: UpdateRoomSettingsSchema,
  update_barricade_settings: UpdateBarricadeSettingsSchema,
  barricade_move: BarricadeMoveSchema,
  barricade_place_wall: BarricadePlaceWallSchema,
  update_battleship_settings: UpdateBattleshipSettingsSchema,
  battleship_place_ships: BattleshipPlaceShipsSchema,
  battleship_fire: BattleshipFireSchema,
  start_game: StartGameSchema,
  submit_question: SubmitQuestionSchema,
  submit_answer: SubmitAnswerSchema,
  submit_guess: SubmitGuessSchema,
  next_turn: NextTurnSchema,
  restart_round: RestartRoundSchema,
  return_to_lobby: ReturnToLobbySchema,
  leave_room: LeaveRoomSchema,
  kick_player: KickPlayerSchema,
  end_round: EndRoundSchema,
  skip_answer: SkipAnswerSchema,
  skip_turn: SkipTurnSchema,
  accept_guess: AcceptGuessSchema,
} as const;
export type ClientEventName = keyof typeof clientEventSchemas;
export type ClientEventPayload<K extends ClientEventName> = z.infer<(typeof clientEventSchemas)[K]>;

// ---------- Snapshot (server -> client, already filtered per viewer) ----------

export const HistoryEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('question'),
    turn: z.number().int(),
    askerId: z.string(),
    text: z.string(),
    answers: z.array(z.object({ playerId: z.string(), answer: AnswerSchema, auto: z.boolean() })),
  }),
  z.object({
    kind: z.literal('guess'),
    turn: z.number().int(),
    playerId: z.string(),
    text: z.string(),
    correct: z.boolean(),
  }),
  z.object({
    kind: z.literal('skip'),
    turn: z.number().int(),
    playerId: z.string(),
    reason: SkipReasonSchema,
  }),
  z.object({
    kind: z.literal('question_cancelled'),
    turn: z.number().int(),
    askerId: z.string(),
    text: z.string(),
  }),
]);
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const PlayerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  connected: z.boolean(),
  isHost: z.boolean(),
  afk: z.boolean(),
  solved: z.boolean(),
  /** Null for the viewer's own card until solved / round over. */
  identity: z.string().nullable(),
  questionsAsked: z.number().int(),
  wrongGuesses: z.number().int(),
  roundScore: z.number().int(),
  totalScore: z.number().int(),
});
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;

export const RoundResultsSchema = z.object({
  reason: RoundEndReasonSchema,
  players: z.array(
    z.object({
      id: z.string(),
      identity: z.string(),
      solved: z.boolean(),
      questionsAsked: z.number().int(),
      guessesMade: z.number().int(),
      wrongGuesses: z.number().int(),
      roundScore: z.number().int(),
      totalScore: z.number().int(),
    }),
  ),
});
export type RoundResults = z.infer<typeof RoundResultsSchema>;

export const RoomSnapshotSchema = z.object({
  code: z.string(),
  gameType: GameTypeSchema,
  phase: AnyPhaseSchema,
  pausedFrom: AnyPhaseSchema.nullable(),
  hostId: z.string(),
  youId: z.string(),
  /** Server clock at send time, so clients can correct countdowns for clock skew. */
  serverTime: z.number(),
  players: z.array(PlayerSnapshotSchema),
  settings: SettingsSchema,
  list: z.object({ name: z.string(), count: z.number().int() }).nullable(),
  roundNumber: z.number().int(),
  round: z
    .object({
      order: z.array(z.string()),
      activeId: z.string().nullable(),
      cyclesCompleted: z.number().int(),
      maxCycles: z.number().int(),
    })
    .nullable(),
  pending: z
    .object({
      askerId: z.string(),
      text: z.string(),
      required: z.array(z.string()),
      answeredBy: z.array(z.string()),
      timedOut: z.boolean(),
      yourAnswer: AnswerSchema.nullable(),
    })
    .nullable(),
  reveal: z
    .object({
      askerId: z.string(),
      text: z.string(),
      answers: z.array(z.object({ playerId: z.string(), answer: AnswerSchema, auto: z.boolean() })),
    })
    .nullable(),
  history: z.array(HistoryEntrySchema),
  timer: z
    .object({ kind: TimerKindSchema, deadline: z.number().nullable(), paused: z.boolean() })
    .nullable(),
  results: RoundResultsSchema.nullable(),
  barricade: BarricadeSnapshotSchema.nullable().optional(),
  battleship: BattleshipSnapshotSchema.nullable().optional(),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const serverEventNames = [
  'room_created',
  'room_joined',
  'room_updated',
  'game_started',
  'turn_changed',
  'question_submitted',
  'answer_progress',
  'answers_revealed',
  'guess_result',
  'player_solved',
  'round_ended',
  'game_error',
  'player_disconnected',
  'player_reconnected',
  'barricade_moved',
  'barricade_wall_placed',
  'barricade_turn_changed',
  'barricade_game_over',
  'battleship_shot_result',
  'battleship_ship_sunk',
  'battleship_player_eliminated',
  'battleship_turn_changed',
  'battleship_game_over',
] as const;
export type ServerEventName = (typeof serverEventNames)[number];

export const GameErrorSchema = z.object({ code: z.string(), message: z.string(), actionId: z.string().optional() });
export type GameErrorPayload = z.infer<typeof GameErrorSchema>;

export const DEFAULT_SETTINGS: Settings = {
  mode: 'text',
  maxTurnsPerPlayer: 10,
  answerTimeoutSec: null,
  turnTimeoutSec: null,
  timeoutAction: 'HOST_DECIDES',
};

// ---------- Server -> client payloads ----------

export const SessionPayloadSchema = z.object({
  playerId: z.string(),
  reconnectToken: z.string(),
  snapshot: RoomSnapshotSchema,
});
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;
