export const Phase = {
  LOBBY: 'LOBBY',
  ASKING: 'ASKING',
  COLLECTING_ANSWERS: 'COLLECTING_ANSWERS',
  SHOWING_ANSWERS: 'SHOWING_ANSWERS',
  PAUSED: 'PAUSED',
  ROUND_RESULTS: 'ROUND_RESULTS',
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const TimeoutAction = {
  AUTO_NOT_SURE: 'AUTO_NOT_SURE',
  HOST_DECIDES: 'HOST_DECIDES',
} as const;
export type TimeoutAction = (typeof TimeoutAction)[keyof typeof TimeoutAction];

export const Answer = { YES: 'YES', NO: 'NO', NOT_SURE: 'NOT_SURE' } as const;
export type Answer = (typeof Answer)[keyof typeof Answer];

export const RoundEndReason = {
  ALL_SOLVED: 'ALL_SOLVED',
  ONE_REMAINING: 'ONE_REMAINING',
  TURN_LIMIT: 'TURN_LIMIT',
  HOST_ENDED: 'HOST_ENDED',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
} as const;
export type RoundEndReason = (typeof RoundEndReason)[keyof typeof RoundEndReason];

export const SkipReason = {
  TIMEOUT: 'TIMEOUT',
  HOST: 'HOST',
  DISCONNECTED: 'DISCONNECTED',
  LEFT: 'LEFT',
} as const;
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason];

export const TimerKind = { TURN: 'turn', ANSWER: 'answer', REVEAL: 'reveal' } as const;
export type TimerKind = (typeof TimerKind)[keyof typeof TimerKind];

export const ErrorCode = {
  WRONG_PHASE: 'WRONG_PHASE',
  NOT_HOST: 'NOT_HOST',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  NOT_ALLOWED: 'NOT_ALLOWED',
  INVALID_INPUT: 'INVALID_INPUT',
  ROOM_FULL: 'ROOM_FULL',
  NAME_TAKEN: 'NAME_TAKEN',
  GAME_IN_PROGRESS: 'GAME_IN_PROGRESS',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  LIST_INVALID: 'LIST_INVALID',
  UNKNOWN_PLAYER: 'UNKNOWN_PLAYER',
  ALREADY_ANSWERED: 'ALREADY_ANSWERED',
  RATE_LIMITED: 'RATE_LIMITED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  PAYLOAD_INVALID: 'PAYLOAD_INVALID',
  KICKED: 'KICKED',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  SESSION_INVALID: 'SESSION_INVALID',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
