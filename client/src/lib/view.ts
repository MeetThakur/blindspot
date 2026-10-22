import { Phase, type PlayerSnapshot, type RoomSnapshot } from '@whoami/shared';

export const COLOR_HEX: Record<string, string> = {
  coral: '#ff7a59',
  sky: '#46b3f2',
  lime: '#84cf55',
  violet: '#9d7dff',
  amber: '#ffc13b',
};
export const colorHex = (c: string): string => COLOR_HEX[c] ?? '#cccccc';

export const playerById = (s: RoomSnapshot, id: string | null | undefined): PlayerSnapshot | undefined =>
  s.players.find((p) => p.id === id);
export const nameOf = (s: RoomSnapshot, id: string | null | undefined): string => playerById(s, id)?.name ?? 'Someone';

export type StatusTone = 'you' | 'wait' | 'info' | 'paused';
export interface Status {
  tone: StatusTone;
  title: string;
  detail?: string;
}

/** One sentence that tells the viewer exactly what is going on and what (if anything) they should do. */
export function statusFor(s: RoomSnapshot): Status {
  const me = s.youId;
  const live = s.phase === Phase.PAUSED ? s.pausedFrom : s.phase;
  if (s.phase === Phase.PAUSED) {
    return {
      tone: 'paused',
      title: 'Game paused',
      detail: `Waiting for the host (${nameOf(s, s.hostId)}) to come back. The game picks up right where it left off.`,
    };
  }
  const active = s.round?.activeId ?? null;
  const isSolved = s.players.find((p) => p.id === me)?.solved;
  if (live === Phase.ASKING) {
    if (active === me) {
      return {
        tone: 'you',
        title: 'Your turn!',
        detail: s.settings.mode === 'voice'
          ? 'Ask one question out loud in your call, or make one guess.'
          : 'Ask one question about yourself, or make one guess.',
      };
    }
    return {
      tone: 'wait',
      title: `${nameOf(s, active)}'s turn`,
      detail: isSolved
        ? `You already solved! Listen for ${nameOf(s, active)} to ask or guess, and help by answering.`
        : s.settings.mode === 'voice'
          ? 'They are about to ask a question out loud or make a guess.'
          : 'They are about to ask a question or make a guess.',
    };
  }
  if (live === Phase.COLLECTING_ANSWERS && s.pending) {
    const done = s.pending.answeredBy.length;
    const total = s.pending.required.length;
    if (s.pending.askerId === me) {
      return { tone: 'wait', title: 'Waiting for answers', detail: `${done} of ${total} answered. Answers are revealed together.` };
    }
    if (s.pending.yourAnswer) {
      return { tone: 'wait', title: 'Answer locked in', detail: `${done} of ${total} answered. Waiting for the others.` };
    }
    return { tone: 'you', title: `Answer ${nameOf(s, s.pending.askerId)}'s question`, detail: 'Pick Yes, No or Not sure.' };
  }
  if (live === Phase.SHOWING_ANSWERS) {
    return { tone: 'info', title: 'Reviewing answers', detail: 'The next turn starts in a moment.' };
  }
  return { tone: 'info', title: 'Get ready' };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function reasonText(reason: string): string {
  switch (reason) {
    case 'ALL_SOLVED':
      return 'Everyone solved their identity!';
    case 'ONE_REMAINING':
      return 'Round ended with one player remaining.';
    case 'TURN_LIMIT':
      return 'The turn limit was reached.';
    case 'HOST_ENDED':
      return 'The host ended the round.';
    case 'NOT_ENOUGH_PLAYERS':
      return 'Not enough players were left to continue.';
    default:
      return 'The round is over.';
  }
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function roomFromUrl(search: string): string {
  return normalizeRoomCode(new URLSearchParams(search).get('room') ?? '');
}

export function inviteLink(origin: string, code: string): string {
  return `${origin}/?room=${code}`;
}
