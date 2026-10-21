import { describe, expect, it } from 'vitest';
import { makeClient, snapshot } from './factory';

const session = (token = 'tok-123456789012345678') => ({ playerId: 'a', reconnectToken: token, snapshot: snapshot() });

describe('GameClient', () => {
  it('tracks connection, shows "waking" until first connect, then reconnecting after drops', () => {
    const { socket, client } = makeClient();
    expect(client.getState()).toMatchObject({ conn: 'connecting', everConnected: false });
    socket.trigger('connect');
    expect(client.getState()).toMatchObject({ conn: 'connected', everConnected: true });
    socket.trigger('disconnect');
    expect(client.getState().conn).toBe('reconnecting');
  });

  it('creates a room, stores the session per tab and exposes the snapshot', () => {
    const { socket, storage, client } = makeClient();
    socket.trigger('connect');
    client.createRoom('Ann');
    expect(socket.last('create_room')).toMatchObject({ name: 'Ann' });
    expect(socket.last('create_room').actionId).toBeTruthy();
    expect(client.getState().pending).toBe(true);
    socket.trigger('room_created', session());
    expect(client.getState()).toMatchObject({ pending: false });
    expect(client.getState().snapshot?.code).toBe('ABCDE');
    expect(JSON.parse(storage.getItem('whoami.session')!)).toEqual({ roomCode: 'ABCDE', reconnectToken: 'tok-123456789012345678' });
  });

  it('resumes a saved session on (re)connect', () => {
    const { socket, storage, client } = makeClient();
    storage.setItem('whoami.session', JSON.stringify({ roomCode: 'ABCDE', reconnectToken: 'tok-123456789012345678' }));
    socket.trigger('connect');
    expect(socket.last('resume_session')).toMatchObject({ roomCode: 'ABCDE', reconnectToken: 'tok-123456789012345678' });
    socket.trigger('room_joined', session());
    expect(client.getState().snapshot).not.toBeNull();
    socket.trigger('disconnect');
    socket.trigger('connect');
    expect(socket.emitted.filter((e) => e.event === 'resume_session')).toHaveLength(2);
  });

  it('drops a stale session with a friendly message', () => {
    const { socket, storage, client } = makeClient();
    storage.setItem('whoami.session', JSON.stringify({ roomCode: 'GONE2', reconnectToken: 'x'.repeat(24) }));
    socket.trigger('connect');
    socket.trigger('game_error', { code: 'ROOM_NOT_FOUND', message: 'That room no longer exists.' });
    expect(storage.getItem('whoami.session')).toBeNull();
    expect(client.getState().snapshot).toBeNull();
    expect(client.getState().toasts[0]?.text).toMatch(/ended/);
  });

  it('routes errors to the form while creating/joining and to toasts otherwise', () => {
    const { socket, client } = makeClient();
    socket.trigger('connect');
    client.joinRoom('ZZZZZ', 'Bob');
    socket.trigger('game_error', { code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    expect(client.getState()).toMatchObject({ formError: 'Room not found.', pending: false });
    expect(client.getState().toasts).toHaveLength(0);
    socket.trigger('game_error', { code: 'NOT_HOST', message: 'Only the host can do that.' });
    expect(client.getState().toasts.at(-1)).toMatchObject({ kind: 'error', text: 'Only the host can do that.' });
  });

  it('forgets the room when kicked', () => {
    const { socket, storage, client } = makeClient();
    socket.trigger('connect');
    socket.trigger('room_joined', session());
    socket.trigger('game_error', { code: 'KICKED', message: 'You were removed from the room.' });
    expect(client.getState().snapshot).toBeNull();
    expect(storage.getItem('whoami.session')).toBeNull();
  });

  it('corrects countdowns for client clock skew', () => {
    const { socket, client } = makeClient();
    socket.trigger('room_updated', snapshot({ serverTime: Date.now() + 60_000 }));
    expect(Math.abs(client.getState().clockOffset - 60_000)).toBeLessThan(500);
  });

  it('shows the "Not quite!" message only to the guesser', () => {
    const { socket, client } = makeClient();
    socket.trigger('room_joined', session());
    socket.trigger('guess_result', { playerId: 'b', text: 'x', correct: false });
    expect(client.getState().toasts).toHaveLength(0);
    socket.trigger('guess_result', { playerId: 'a', text: 'x', correct: false });
    expect(client.getState().toasts[0]?.text).toBe('Not quite! Keep investigating.');
  });

  it('every action carries an actionId', () => {
    const { socket, client } = makeClient();
    client.ask('hi?');
    client.answer('YES');
    client.guess('x');
    client.skipTurn();
    client.endRound();
    expect(socket.emitted.every((e) => typeof e.payload.actionId === 'string')).toBe(true);
    expect(new Set(socket.emitted.map((e) => e.payload.actionId)).size).toBe(5);
    expect(socket.last('end_round')).toMatchObject({ confirm: true });
  });

  it('leaving clears the saved session', () => {
    const { socket, storage, client } = makeClient();
    socket.trigger('room_joined', session());
    client.leave();
    expect(socket.last('leave_room')).toBeTruthy();
    expect(storage.getItem('whoami.session')).toBeNull();
    expect(client.getState().snapshot).toBeNull();
  });
});
