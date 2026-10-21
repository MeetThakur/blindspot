import { describe, expect, it } from 'vitest';
import { formatClock, inviteLink, normalizeRoomCode, roomFromUrl, statusFor } from '../lib/view';
import { gameSnapshot } from './factory';

describe('status text', () => {
  it('tells the active player it is their turn, others who is playing', () => {
    expect(statusFor(gameSnapshot()).title).toBe('Your turn!');
    expect(statusFor(gameSnapshot({ youId: 'b' }))).toMatchObject({ tone: 'wait', title: "Ann's turn" });
  });

  it('distinguishes asking, waiting for answers, answering and reviewing', () => {
    const pending = { askerId: 'a', text: 'q?', required: ['b', 'c'], answeredBy: ['b'], timedOut: false, yourAnswer: null };
    const collecting = gameSnapshot({ phase: 'COLLECTING_ANSWERS', pending });
    expect(statusFor(collecting)).toMatchObject({ title: 'Waiting for answers' });
    expect(statusFor({ ...collecting, youId: 'c' })).toMatchObject({ tone: 'you', title: "Answer Ann's question" });
    expect(statusFor({ ...collecting, youId: 'b', pending: { ...pending, yourAnswer: 'YES' } })).toMatchObject({ title: 'Answer locked in' });
    expect(statusFor(gameSnapshot({ phase: 'SHOWING_ANSWERS' })).title).toBe('Reviewing answers');
  });

  it('says so when paused', () => {
    expect(statusFor(gameSnapshot({ phase: 'PAUSED', pausedFrom: 'ASKING' })).tone).toBe('paused');
  });
});

describe('helpers', () => {
  it('normalizes room codes and reads invites', () => {
    expect(normalizeRoomCode(' ab-c d2 ')).toBe('ABCD2');
    expect(roomFromUrl('?room=abcde')).toBe('ABCDE');
    expect(roomFromUrl('')).toBe('');
    expect(inviteLink('https://x.app', 'ABCDE')).toBe('https://x.app/?room=ABCDE');
  });
  it('formats countdowns', () => {
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(1)).toBe('0:01');
  });
});
