import { Phase, type RoomSnapshot } from '@whoami/shared';
import type { GameState } from './types.js';

/**
 * Builds the view of the room that `viewerId` is allowed to see. Fields are copied
 * explicitly (never spread from state) so secrets cannot leak by accident:
 * no reconnect tokens, no own identity until solved/round over, no private answers before reveal.
 */
export function snapshotFor(d: GameState, viewerId: string, now: number = Date.now()): RoomSnapshot {
  const r = d.round;
  const over = d.phase === Phase.ROUND_RESULTS;
  const pending = r?.pending ?? null;

  return {
    code: d.code,
    gameType: 'blindspot',
    phase: d.phase,
    pausedFrom: d.pausedFrom,
    hostId: d.hostId,
    youId: viewerId,
    serverTime: now,
    players: d.players.map((p) => {
      const stats = r?.stats[p.id];
      const solved = r?.solved.includes(p.id) ?? false;
      const roundScore = stats ? Math.max(0, stats.rawScore) : 0;
      const showIdentity = r && (p.id !== viewerId || solved || over);
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        isHost: p.id === d.hostId,
        afk: p.afk,
        solved,
        identity: showIdentity ? (r.assignments[p.id] ?? null) : null,
        questionsAsked: stats?.questionsAsked ?? 0,
        wrongGuesses: stats?.wrongGuesses ?? 0,
        roundScore,
        totalScore: (d.totals[p.id] ?? 0) + (r && !over ? roundScore : 0),
      };
    }),
    settings: { ...d.settings },
    list: d.list ? { name: d.list.name, count: d.list.items.length } : null,
    roundNumber: d.roundNumber,
    round: r
      ? {
          order: [...r.order],
          activeId: over ? null : (r.order[r.turnPos] ?? null),
          cyclesCompleted: r.cyclesCompleted,
          maxCycles: d.settings.maxTurnsPerPlayer,
        }
      : null,
    pending: pending
      ? {
          askerId: pending.askerId,
          text: pending.text,
          required: [...pending.required],
          answeredBy: Object.keys(pending.answers),
          timedOut: pending.timedOut,
          yourAnswer: pending.answers[viewerId]?.answer ?? null,
        }
      : null,
    reveal: r?.reveal
      ? { askerId: r.reveal.askerId, text: r.reveal.text, answers: r.reveal.answers.map((a) => ({ ...a })) }
      : null,
    history: r ? r.history.map((h) => structuredClone(h)) : [],
    timer: d.timer ? { kind: d.timer.kind, deadline: d.timer.deadline, paused: d.timer.deadline === null } : null,
    results: over && r?.results ? structuredClone(r.results) : null,
  };
}
