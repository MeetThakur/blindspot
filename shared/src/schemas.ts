import { z } from 'zod';
import {
  ANSWER_TIMEOUT_OPTIONS,
  MAX_GUESS_LENGTH,
  MAX_ITEM_LENGTH,
  MAX_LIST_NAME_LENGTH,
  MAX_LIST_PAYLOAD_CHARS,
  MAX_NAME_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_RAW_LIST_LINES,
  TURN_TIMEOUT_OPTIONS,
} from './constants.js';
import { Answer, Phase, RoundEndReason, SkipReason, TimeoutAction, TimerKind } from './phases.js';

const values = <T extends Record<string, string>>(o: T) =>
  Object.values(o) as [T[keyof T], ...T[keyof T][]];

export const PhaseSchema = z.enum(values(Phase));
export const AnswerSchema = z.enum(values(Answer));
export const TimeoutActionSchema = z.enum(values(TimeoutAction));
export const RoundEndReasonSchema = z.enum(values(RoundEndReason));
export const SkipReasonSchema = z.enum(values(SkipReason));
export const TimerKindSchema = z.enum(values(TimerKind));

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

export const CreateRoomSchema = z.object({ actionId, name: displayName });
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
  phase: PhaseSchema,
  pausedFrom: PhaseSchema.nullable(),
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
