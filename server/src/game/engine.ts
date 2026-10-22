import {
  AFK_SKIP_THRESHOLD,
  Answer,
  DISCONNECT_GRACE_MS,
  DEFAULT_SETTINGS,
  ErrorCode,
  ListSelectionSchema,
  MAX_GUESS_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_QUESTION_LENGTH,
  MIN_PLAYERS,
  PLAYER_COLORS,
  Phase,
  REVEAL_DURATION_MS,
  RoundEndReason,
  SettingsPatchSchema,
  SettingsSchema,
  SkipReason,
  TimeoutAction,
  TimerKind,
  type RoundResults,
} from '@whoami/shared';
import { cleanItems, resolveSelection, validateItems } from './lists.js';
import { guessMatches, normalizeGuess } from './normalize.js';
import { shuffle } from './roomCode.js';
import type {
  Action,
  Ctx,
  GameEvent,
  GameState,
  PlayerState,
  Result,
  RoundState,
} from './types.js';

const SEEN_LIMIT = 300;
const IN_ROUND = new Set<Phase>([Phase.ASKING, Phase.COLLECTING_ANSWERS, Phase.SHOWING_ANSWERS]);

class GameError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new GameError(code, message);
};

// ---------------------------------------------------------------- creation

export function createRoom(args: {
  code: string;
  hostId: string;
  hostName: string;
  hostToken: string;
  now: number;
  graceMs?: number;
}): GameState {
  const state: GameState = {
    code: args.code,
    hostId: args.hostId,
    players: [],
    phase: Phase.LOBBY,
    pausedFrom: null,
    settings: { ...DEFAULT_SETTINGS },
    list: null,
    seating: [],
    starterIdx: 0,
    roundNumber: 0,
    totals: {},
    round: null,
    timer: null,
    seq: 0,
    seen: [],
    lastActivity: args.now,
    graceMs: args.graceMs ?? DISCONNECT_GRACE_MS,
  };
  addPlayer(state, args.hostId, args.hostName, args.hostToken);
  return state;
}

// ----------------------------------------------------------------- reducer

/** Pure transition: never mutates `state`. Rejected actions leave state untouched. */
export function reduce(state: GameState, action: Action, ctx: Ctx): Result {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  try {
    const key = 'actionId' in action ? `${'playerId' in action ? action.playerId : ''}:${action.actionId}` : null;
    if (key && draft.seen.includes(key)) return { ok: true, state, events: [], duplicate: true };

    if ('playerId' in action && action.type !== 'join') player(draft, action.playerId);
    handle(draft, action, ctx, events);
    sweep(draft, ctx, events);

    if (key) {
      draft.seen.push(key);
      if (draft.seen.length > SEEN_LIMIT) draft.seen.splice(0, draft.seen.length - SEEN_LIMIT);
    }
    draft.lastActivity = ctx.now;
    return { ok: true, state: draft, events, duplicate: false };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: { code: e.code, message: e.message } };
    throw e;
  }
}

/** Earliest epoch ms at which the server must call back (timer expiry or disconnect grace). */
export function nextDeadline(state: GameState): number | null {
  const times: number[] = [];
  if (state.timer?.deadline != null) times.push(state.timer.deadline);
  for (const p of state.players) {
    if (!p.connected && p.disconnectedAt !== null) times.push(p.disconnectedAt + state.graceMs);
  }
  return times.length ? Math.min(...times) : null;
}

function handle(d: GameState, a: Action, ctx: Ctx, ev: GameEvent[]): void {
  switch (a.type) {
    case 'join':
      return join(d, a.playerId, a.name, a.token);
    case 'leave':
      return removePlayer(d, a.playerId, ctx, ev);
    case 'kick': {
      requireHost(d, a.playerId);
      if (a.targetId === a.playerId) fail(ErrorCode.INVALID_INPUT, 'Use leave to remove yourself.');
      player(d, a.targetId);
      return removePlayer(d, a.targetId, ctx, ev);
    }
    case 'update_settings':
      return updateSettings(d, a.playerId, a.settings, a.list);
    case 'start_game':
      return startGame(d, a.playerId, ctx, ev);
    case 'submit_question':
      return submitQuestion(d, a.playerId, a.text, ctx, ev);
    case 'submit_answer':
      return submitAnswer(d, a.playerId, a.answer, ctx, ev);
    case 'submit_guess':
      return submitGuess(d, a.playerId, a.text, ctx, ev);
    case 'next_turn': {
      requirePhase(d, Phase.SHOWING_ANSWERS);
      if (a.playerId !== d.hostId && a.playerId !== d.round!.reveal?.askerId) {
        fail(ErrorCode.NOT_ALLOWED, 'Only the host or the questioner can continue.');
      }
      return advanceTurn(d, ctx, ev);
    }
    case 'skip_answer':
      return skipAnswer(d, a.playerId, a.targetId, ctx, ev);
    case 'skip_turn': {
      requireHost(d, a.playerId);
      requirePhase(d, Phase.ASKING);
      return skipActiveTurn(d, SkipReason.HOST, ctx, ev);
    }
    case 'end_round': {
      requireHost(d, a.playerId);
      if (!IN_ROUND.has(d.phase)) fail(ErrorCode.WRONG_PHASE, 'There is no round in progress to end.');
      return endRound(d, RoundEndReason.HOST_ENDED, ctx, ev);
    }
    case 'restart_round': {
      requireHost(d, a.playerId);
      requirePhase(d, Phase.ROUND_RESULTS);
      return beginRound(d, ctx, ev);
    }
    case 'return_to_lobby': {
      requireHost(d, a.playerId);
      requirePhase(d, Phase.ROUND_RESULTS);
      d.phase = Phase.LOBBY;
      d.round = null;
      return;
    }
    case 'disconnect':
      return disconnect(d, a.playerId, ctx, ev);
    case 'reconnect':
      return reconnect(d, a.playerId, ctx, ev);
    case 'expire':
      return expire(d, a.kind, a.seq, ctx, ev);
    case 'sweep':
      return;
  }
}

// ----------------------------------------------------------------- helpers

function player(d: GameState, id: string): PlayerState {
  return d.players.find((p) => p.id === id) ?? fail(ErrorCode.UNKNOWN_PLAYER, 'You are not in this room.');
}

function requireHost(d: GameState, id: string): void {
  if (d.hostId !== id) fail(ErrorCode.NOT_HOST, 'Only the host can do that.');
}

function requirePhase(d: GameState, ...phases: Phase[]): void {
  if (!phases.includes(d.phase)) fail(ErrorCode.WRONG_PHASE, 'That is not possible right now.');
}

/** The phase the game is "really" in, looking through PAUSED. */
function livePhase(d: GameState): Phase {
  return d.phase === Phase.PAUSED ? (d.pausedFrom ?? Phase.PAUSED) : d.phase;
}

function setPhase(d: GameState, p: Phase): void {
  if (d.phase === Phase.PAUSED) d.pausedFrom = p;
  else d.phase = p;
}

function activeId(r: RoundState): string {
  return r.order[r.turnPos]!;
}

function isExpired(d: GameState, p: PlayerState, now: number): boolean {
  return !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= d.graceMs;
}

function addPlayer(d: GameState, id: string, name: string, token: string): void {
  const used = new Set(d.players.map((p) => p.color));
  const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
  d.players.push({
    id, name, color, token,
    connected: true, disconnectedAt: null, afk: false, consecutiveSkips: 0,
  });
  d.totals[id] = 0;
}

// ------------------------------------------------------------------ timers

function clearTimer(d: GameState): void {
  d.timer = null;
  d.seq++;
}

function startTimer(d: GameState, kind: TimerKind, ms: number, now: number): void {
  d.seq++;
  const paused = d.phase === Phase.PAUSED;
  d.timer = { kind, seq: d.seq, deadline: paused ? null : now + ms, remainingMs: paused ? ms : null };
}

function pauseTimer(d: GameState, now: number): void {
  if (d.timer?.deadline != null) {
    d.timer.remainingMs = Math.max(0, d.timer.deadline - now);
    d.timer.deadline = null;
  }
}

function resumeTimer(d: GameState, now: number): void {
  if (d.timer && d.timer.deadline === null && d.timer.remainingMs !== null) {
    d.seq++;
    d.timer = { ...d.timer, seq: d.seq, deadline: now + d.timer.remainingMs, remainingMs: null };
  }
}

function startTurnTimer(d: GameState, now: number, scale = 1): void {
  const sec = d.settings.turnTimeoutSec;
  if (sec) startTimer(d, TimerKind.TURN, sec * 1000 * scale, now);
  else clearTimer(d);
}

// ------------------------------------------------------------------- lobby

function join(d: GameState, id: string, rawName: string, token: string): void {
  if (d.phase !== Phase.LOBBY && d.phase !== Phase.ROUND_RESULTS) {
    fail(ErrorCode.GAME_IN_PROGRESS, 'A round is in progress. Ask the host to invite you after it ends.');
  }
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_NAME_LENGTH) {
    fail(ErrorCode.INVALID_INPUT, `Names must be 1-${MAX_NAME_LENGTH} characters.`);
  }
  if (d.players.length >= MAX_PLAYERS) fail(ErrorCode.ROOM_FULL, 'This room is full.');
  if (d.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    fail(ErrorCode.NAME_TAKEN, 'That name is already taken in this room.');
  }
  if (d.players.some((p) => p.id === id)) fail(ErrorCode.INVALID_INPUT, 'Already in this room.');
  addPlayer(d, id, name, token);
}

function updateSettings(d: GameState, by: string, patch: unknown, list: unknown): void {
  requireHost(d, by);
  requirePhase(d, Phase.LOBBY, Phase.ROUND_RESULTS);
  if (patch !== undefined) {
    const p = SettingsPatchSchema.safeParse(patch);
    if (!p.success) fail(ErrorCode.INVALID_INPUT, 'Invalid settings.');
    const merged = SettingsSchema.safeParse({ ...d.settings, ...p.data });
    if (!merged.success) fail(ErrorCode.INVALID_INPUT, 'Invalid settings.');
    d.settings = merged.data!;
  }
  if (list !== undefined) {
    const sel = ListSelectionSchema.safeParse(list);
    if (!sel.success) fail(ErrorCode.LIST_INVALID, 'Invalid list.');
    const res = resolveSelection(sel.data!);
    if (!res.ok) return fail(ErrorCode.LIST_INVALID, res.message);
    const problem = validateItems(res.list.items, d.players.length);
    if (problem) fail(ErrorCode.LIST_INVALID, problem);
    d.list = res.list;
  }
}

function startGame(d: GameState, by: string, ctx: Ctx, ev: GameEvent[]): void {
  requireHost(d, by);
  requirePhase(d, Phase.LOBBY);
  beginRound(d, ctx, ev);
}

// ------------------------------------------------------------------- round

function beginRound(d: GameState, ctx: Ctx, ev: GameEvent[]): void {
  if (d.players.length < MIN_PLAYERS) fail(ErrorCode.NOT_ENOUGH_PLAYERS, 'You need at least 2 players.');
  const list = d.list ?? fail(ErrorCode.LIST_INVALID, 'Pick a category or paste a custom list first.');
  const items = cleanItems(list.items);
  const problem = validateItems(items, d.players.length);
  if (problem) fail(ErrorCode.LIST_INVALID, problem);

  const ids = d.players.map((p) => p.id);
  if (d.seating.length === 0) {
    d.seating = shuffle(ids, ctx.rng);
    d.starterIdx = 0;
  } else {
    d.seating = d.seating.filter((id) => ids.includes(id)).concat(ids.filter((id) => !d.seating.includes(id)));
    d.starterIdx = (d.starterIdx + 1) % d.seating.length;
  }
  const order = d.seating.slice(d.starterIdx).concat(d.seating.slice(0, d.starterIdx));

  const picked = shuffle(items, ctx.rng).slice(0, ids.length);
  const assignments: Record<string, string> = {};
  const stats: RoundState['stats'] = {};
  ids.forEach((id, i) => {
    assignments[id] = picked[i]!;
    stats[id] = { questionsAsked: 0, guessesMade: 0, wrongGuesses: 0, rawScore: 0 };
  });
  for (const p of d.players) {
    p.afk = false;
    p.consecutiveSkips = 0;
  }

  d.roundNumber++;
  d.round = {
    order, turnPos: 0, cyclesCompleted: 0, turnCount: 1,
    assignments, solved: [], stats, history: [], pending: null, reveal: null, results: null,
  };
  d.phase = Phase.ASKING;
  d.pausedFrom = null;
  startTurnTimer(d, ctx.now, ctx.timerScale);
  ev.push({ type: 'game_started', round: d.roundNumber });
  ev.push({ type: 'turn_changed', activeId: order[0]!, turn: 1 });
}

function endRound(d: GameState, reason: RoundResults['reason'], _ctx: Ctx, ev: GameEvent[]): void {
  const r = d.round!;
  for (const p of d.players) d.totals[p.id] = (d.totals[p.id] ?? 0) + Math.max(0, r.stats[p.id]?.rawScore ?? 0);
  r.results = {
    reason,
    players: d.players.map((p) => {
      const s = r.stats[p.id]!;
      return {
        id: p.id,
        identity: r.assignments[p.id]!,
        solved: r.solved.includes(p.id),
        questionsAsked: s.questionsAsked,
        guessesMade: s.guessesMade,
        wrongGuesses: s.wrongGuesses,
        roundScore: Math.max(0, s.rawScore),
        totalScore: d.totals[p.id] ?? 0,
      };
    }),
  };
  r.pending = null;
  r.reveal = null;
  d.phase = Phase.ROUND_RESULTS;
  d.pausedFrom = null;
  clearTimer(d);
  ev.push({ type: 'round_ended', reason });
}

/** Moves to the next unsolved player, or ends the round. Call after a turn is fully consumed. */
function advanceTurn(d: GameState, ctx: Ctx, ev: GameEvent[]): void {
  const r = d.round!;
  r.pending = null;
  r.reveal = null;
  const unsolved = r.order.filter((id) => !r.solved.includes(id));
  if (r.order.length < MIN_PLAYERS) return endRound(d, RoundEndReason.NOT_ENOUGH_PLAYERS, ctx, ev);
  if (unsolved.length === 0) return endRound(d, RoundEndReason.ALL_SOLVED, ctx, ev);

  let pos = r.turnPos;
  do {
    pos++;
    if (pos >= r.order.length) {
      pos = 0;
      r.cyclesCompleted++;
      // Limit is checked only at a cycle boundary so everyone gets equal turns.
      if (r.cyclesCompleted >= d.settings.maxTurnsPerPlayer) {
        return endRound(d, RoundEndReason.TURN_LIMIT, ctx, ev);
      }
    }
  } while (r.solved.includes(r.order[pos]!));
  r.turnPos = pos;
  r.turnCount++;
  setPhase(d, Phase.ASKING);
  startTurnTimer(d, ctx.now, ctx.timerScale);
  ev.push({ type: 'turn_changed', activeId: r.order[pos]!, turn: r.turnCount });
}

function skipActiveTurn(d: GameState, reason: SkipReason, ctx: Ctx, ev: GameEvent[]): void {
  const r = d.round!;
  const id = activeId(r);
  if (r.pending) {
    r.history.push({ kind: 'question_cancelled', turn: r.turnCount, askerId: id, text: r.pending.text });
    ev.push({ type: 'question_cancelled', askerId: id });
  }
  r.history.push({ kind: 'skip', turn: r.turnCount, playerId: id, reason });
  ev.push({ type: 'turn_skipped', playerId: id, reason });
  const p = d.players.find((x) => x.id === id);
  if (p) {
    p.consecutiveSkips++;
    if (p.consecutiveSkips >= AFK_SKIP_THRESHOLD) p.afk = true;
  }
  advanceTurn(d, ctx, ev);
}

function noteActivity(p: PlayerState): void {
  p.consecutiveSkips = 0;
  p.afk = false;
}

// --------------------------------------------------------- ask / answer / guess

function requireActive(d: GameState, id: string): RoundState {
  requirePhase(d, Phase.ASKING);
  const r = d.round!;
  if (activeId(r) !== id) fail(ErrorCode.NOT_YOUR_TURN, 'It is not your turn.');
  return r;
}

function submitQuestion(d: GameState, id: string, raw: string, ctx: Ctx, ev: GameEvent[]): void {
  const r = requireActive(d, id);
  let text = raw.trim();
  if (!text) {
    if (d.settings.mode === 'voice') {
      text = '(Voice question)';
    } else {
      fail(ErrorCode.INVALID_INPUT, `Questions must be 1-${MAX_QUESTION_LENGTH} characters.`);
    }
  }
  if (text.length > MAX_QUESTION_LENGTH) {
    fail(ErrorCode.INVALID_INPUT, `Questions must be 1-${MAX_QUESTION_LENGTH} characters.`);
  }
  noteActivity(player(d, id));
  r.stats[id]!.questionsAsked++;
  r.pending = {
    askerId: id,
    text,
    required: d.players.filter((p) => p.id !== id).map((p) => p.id),
    answers: {},
    timedOut: false,
  };
  d.phase = Phase.COLLECTING_ANSWERS;
  const sec = d.settings.answerTimeoutSec;
  if (sec) startTimer(d, TimerKind.ANSWER, sec * 1000 * (ctx.timerScale ?? 1), ctx.now);
  else clearTimer(d);
  ev.push({ type: 'question_submitted', askerId: id, text });
}

function submitAnswer(d: GameState, id: string, answer: Answer, ctx: Ctx, ev: GameEvent[]): void {
  requirePhase(d, Phase.COLLECTING_ANSWERS);
  const pend = d.round!.pending!;
  if (id === pend.askerId) fail(ErrorCode.NOT_ALLOWED, 'You cannot answer your own question.');
  if (!pend.required.includes(id)) fail(ErrorCode.NOT_ALLOWED, 'You are not part of this question.');
  if (pend.answers[id]) fail(ErrorCode.ALREADY_ANSWERED, 'You already answered.');
  pend.answers[id] = { answer, auto: false };
  ev.push({ type: 'answer_progress', answeredBy: Object.keys(pend.answers), required: pend.required });
  completeAnswersIfDone(d, ctx, ev);
}

function fillMissing(d: GameState, only?: string): void {
  const pend = d.round!.pending!;
  for (const id of pend.required) {
    if (!pend.answers[id] && (only === undefined || only === id)) {
      pend.answers[id] = { answer: Answer.NOT_SURE, auto: true };
    }
  }
}

function completeAnswersIfDone(d: GameState, ctx: Ctx, ev: GameEvent[]): void {
  const r = d.round!;
  const pend = r.pending;
  if (!pend || !pend.required.every((id) => pend.answers[id])) return;
  const answers = pend.required.map((playerId) => ({ playerId, ...pend.answers[playerId]! }));
  r.reveal = { askerId: pend.askerId, text: pend.text, answers };
  r.history.push({ kind: 'question', turn: r.turnCount, askerId: pend.askerId, text: pend.text, answers });
  r.pending = null;
  setPhase(d, Phase.SHOWING_ANSWERS);
  startTimer(d, TimerKind.REVEAL, ctx.revealMs ?? REVEAL_DURATION_MS, ctx.now);
  ev.push({ type: 'answers_revealed', askerId: pend.askerId, text: pend.text, answers });
}

function skipAnswer(d: GameState, by: string, target: string | undefined, ctx: Ctx, ev: GameEvent[]): void {
  requireHost(d, by);
  requirePhase(d, Phase.COLLECTING_ANSWERS);
  const pend = d.round!.pending!;
  if (target !== undefined && (!pend.required.includes(target) || pend.answers[target])) {
    fail(ErrorCode.INVALID_INPUT, 'That player has no answer to skip.');
  }
  fillMissing(d, target);
  completeAnswersIfDone(d, ctx, ev);
}

function submitGuess(d: GameState, id: string, raw: string, ctx: Ctx, ev: GameEvent[]): void {
  const r = requireActive(d, id);
  const text = raw.trim();
  if (!text || text.length > MAX_GUESS_LENGTH || !normalizeGuess(text)) {
    fail(ErrorCode.INVALID_INPUT, 'Enter a guess first.');
  }
  noteActivity(player(d, id));
  const s = r.stats[id]!;
  s.guessesMade++;
  const correct = guessMatches(text, r.assignments[id]!);
  if (correct) {
    r.solved.push(id);
    s.rawScore += 1 + (d.settings.speedBonus ? Math.max(0, 2 - r.cyclesCompleted) : 0);
  } else {
    s.wrongGuesses++;
    s.rawScore += d.settings.wrongGuessPenalty;
  }
  r.history.push({ kind: 'guess', turn: r.turnCount, playerId: id, text, correct });
  ev.push({ type: 'guess_result', playerId: id, text, correct });
  if (correct) ev.push({ type: 'player_solved', playerId: id });
  advanceTurn(d, ctx, ev);
}

// ------------------------------------------------------------------ timers fire

function expire(d: GameState, kind: TimerKind, seq: number, ctx: Ctx, ev: GameEvent[]): void {
  const t = d.timer;
  if (!t || t.seq !== seq || t.kind !== kind || t.deadline === null || ctx.now < t.deadline) return; // stale
  clearTimer(d);
  if (kind === TimerKind.TURN) return skipActiveTurn(d, SkipReason.TIMEOUT, ctx, ev);
  if (kind === TimerKind.REVEAL) return advanceTurn(d, ctx, ev);
  // answer timeout
  if (d.settings.timeoutAction === TimeoutAction.AUTO_NOT_SURE) {
    fillMissing(d);
    completeAnswersIfDone(d, ctx, ev);
  } else {
    d.round!.pending!.timedOut = true;
  }
}

// ------------------------------------------------------- disconnect / removal

function disconnect(d: GameState, id: string, ctx: Ctx, ev: GameEvent[]): void {
  const p = player(d, id);
  if (!p.connected) return;
  p.connected = false;
  p.disconnectedAt = ctx.now;
  ev.push({ type: 'player_disconnected', playerId: id });
  if (id === d.hostId && IN_ROUND.has(d.phase)) pause(d, ctx, ev);
}

function reconnect(d: GameState, id: string, ctx: Ctx, ev: GameEvent[]): void {
  const p = player(d, id);
  p.connected = true;
  p.disconnectedAt = null;
  ev.push({ type: 'player_reconnected', playerId: id });
  if (d.phase === Phase.PAUSED && id === d.hostId) resume(d, ctx, ev);
}

function pause(d: GameState, ctx: Ctx, ev: GameEvent[]): void {
  d.pausedFrom = d.phase;
  d.phase = Phase.PAUSED;
  pauseTimer(d, ctx.now);
  ev.push({ type: 'paused' });
}

function resume(d: GameState, ctx: Ctx, ev: GameEvent[]): void {
  d.phase = d.pausedFrom ?? Phase.ASKING;
  d.pausedFrom = null;
  resumeTimer(d, ctx.now);
  // Anyone still away gets a fresh grace period; the pause was not their fault.
  for (const p of d.players) if (!p.connected) p.disconnectedAt = ctx.now;
  ev.push({ type: 'resumed' });
}

function transferHost(d: GameState): boolean {
  const i = d.players.findIndex((p) => p.id === d.hostId);
  for (let k = 1; k <= d.players.length; k++) {
    const cand = d.players[(i + k) % d.players.length]!;
    if (cand.id !== d.hostId && cand.connected) {
      d.hostId = cand.id;
      return true;
    }
  }
  return false;
}

function removePlayer(d: GameState, id: string, ctx: Ctx, ev: GameEvent[]): void {
  const idx = d.players.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const wasHost = d.hostId === id;
  d.players.splice(idx, 1);
  delete d.totals[id];
  d.seating = d.seating.filter((x) => x !== id);
  ev.push({ type: 'player_removed', playerId: id });
  if (wasHost) {
    if (!d.players.some((p) => p.connected) || !transferHost(d)) d.hostId = d.players[0]?.id ?? '';
    else ev.push({ type: 'host_changed', hostId: d.hostId });
    if (d.phase === Phase.PAUSED && d.players.find((p) => p.id === d.hostId)?.connected) resume(d, ctx, ev);
  }
  if (!d.round || !IN_ROUND.has(livePhase(d))) return;

  const r = d.round;
  const pos = r.order.indexOf(id);
  if (pos < 0) return;
  const wasActive = pos === r.turnPos;
  r.order.splice(pos, 1);
  if (pos < r.turnPos || wasActive) r.turnPos--;
  r.solved = r.solved.filter((x) => x !== id);
  delete r.stats[id];
  delete r.assignments[id];

  const live = livePhase(d);
  if (r.order.length < MIN_PLAYERS) return endRound(d, RoundEndReason.NOT_ENOUGH_PLAYERS, ctx, ev);
  if (live === Phase.COLLECTING_ANSWERS && r.pending) {
    if (r.pending.askerId === id) {
      r.history.push({ kind: 'question_cancelled', turn: r.turnCount, askerId: id, text: r.pending.text });
      ev.push({ type: 'question_cancelled', askerId: id });
      return advanceTurn(d, ctx, ev);
    }
    r.pending.required = r.pending.required.filter((x) => x !== id);
    delete r.pending.answers[id];
    return completeAnswersIfDone(d, ctx, ev);
  }
  if (wasActive && live === Phase.ASKING) return advanceTurn(d, ctx, ev);
  // SHOWING_ANSWERS: turnPos already points before the successor; the pending advance fixes it.
  const unsolved = r.order.filter((x) => !r.solved.includes(x)).length;
  if (unsolved === 0) endRound(d, RoundEndReason.ALL_SOLVED, ctx, ev);
}

/** Applies every time-based consequence that is due: host handover, absent players. */
function sweep(d: GameState, ctx: Ctx, ev: GameEvent[]): void {
  const host = d.players.find((p) => p.id === d.hostId);
  if (host && isExpired(d, host, ctx.now) && transferHost(d)) {
    ev.push({ type: 'host_changed', hostId: d.hostId });
    if (d.phase === Phase.PAUSED) resume(d, ctx, ev);
  }
  if (d.phase === Phase.PAUSED) return;

  if (d.phase === Phase.LOBBY || d.phase === Phase.ROUND_RESULTS) {
    for (const p of [...d.players]) {
      if (p.id !== d.hostId && isExpired(d, p, ctx.now)) removePlayer(d, p.id, ctx, ev);
    }
    return;
  }

  for (let i = 0; i < 200 && d.round && IN_ROUND.has(d.phase); i++) {
    const r = d.round;
    const active = d.players.find((p) => p.id === activeId(r));
    if (r.pending && d.phase === Phase.COLLECTING_ANSWERS) {
      const gone = r.pending.required.filter(
        (id) => !r.pending!.answers[id] && isExpired(d, player(d, id), ctx.now),
      );
      if (gone.length && !(active && isExpired(d, active, ctx.now))) {
        for (const id of gone) fillMissing(d, id);
        completeAnswersIfDone(d, ctx, ev);
        continue;
      }
    }
    if (
      active &&
      isExpired(d, active, ctx.now) &&
      (d.phase === Phase.ASKING || d.phase === Phase.COLLECTING_ANSWERS)
    ) {
      skipActiveTurn(d, SkipReason.DISCONNECTED, ctx, ev);
      continue;
    }
    break;
  }
}
