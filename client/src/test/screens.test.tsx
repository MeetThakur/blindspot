import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { GameProvider } from '../lib/store';
import { gameSnapshot, makeClient, player, snapshot } from './factory';

function setup(snap?: ReturnType<typeof snapshot>, connected = true) {
  const ctx = makeClient();
  if (connected) act(() => ctx.socket.trigger('connect'));
  if (snap) act(() => ctx.socket.trigger('room_updated', snap));
  render(
    <GameProvider client={ctx.client}>
      <App />
    </GameProvider>,
  );
  return ctx;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('Home', () => {
  it('shows the waking-up state and disables actions until the server answers', () => {
    const { socket } = setup(undefined, false);
    expect(screen.getByText(/Waking up the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a room/i })).toBeDisabled();
    act(() => socket.trigger('connect'));
    expect(screen.queryByText(/Waking up the server/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Server ready/i)).toBeInTheDocument();
  });

  it('creates a room with the entered name', async () => {
    const { socket } = setup();
    const user = userEvent.setup();
    const create = screen.getByRole('button', { name: /create a room/i });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText('Your name'), 'Maya');
    await user.click(create);
    expect(socket.last('create_room')).toMatchObject({ name: 'Maya' });
  });

  it('an invite link prefills the code so joining is one click after typing a name', async () => {
    window.history.replaceState({}, '', '/?room=abcde');
    const { socket } = setup();
    const user = userEvent.setup();
    expect(screen.getByLabelText('Room code')).toHaveValue('ABCDE');
    expect(screen.getByText(/You were invited/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your name'), 'Leo');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(socket.last('join_room')).toMatchObject({ roomCode: 'ABCDE', name: 'Leo' });
  });

  it('shows server errors inline', async () => {
    const { socket } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your name'), 'Leo');
    await user.type(screen.getByLabelText('Room code'), 'zzzzz');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    act(() => socket.trigger('game_error', { code: 'ROOM_NOT_FOUND', message: 'Room not found. Check the code and try again.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Room not found');
  });
});

describe('Lobby', () => {
  it('host sees editable settings, invite link and a disabled Start until a category is chosen', async () => {
    const { socket } = setup(snapshot());
    const user = userEvent.setup();
    expect(screen.getByTestId('room-code')).toHaveTextContent('ABCDE');
    expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Animals' }));
    expect(socket.last('update_room_settings')).toMatchObject({ list: { kind: 'category', id: 'animals' } });
    await user.selectOptions(screen.getByLabelText('Turn time limit'), '60');
    expect(socket.last('update_room_settings')).toMatchObject({ settings: { turnTimeoutSec: 60 } });
  });

  it('enables Start once ready and sends start_game', async () => {
    const { socket } = setup(snapshot({ list: { name: 'Animals', count: 24 } }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(socket.last('start_game')).toBeTruthy();
  });

  it('non-hosts see read-only settings and a waiting message', () => {
    setup(snapshot({ youId: 'b' }));
    expect(screen.getByText(/Waiting for the host to start/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Animals' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Turns per player')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('settings-summary')).getByText(/turns each/)).toBeInTheDocument();
  });

  it('renders hostile names as plain text', () => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    setup(snapshot({ players: [player({ id: 'a', name: evil, isHost: true }), player({ id: 'b', name: '<b>bold</b>' })] }));
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(screen.getByText('<b>bold</b>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('Game', () => {
  it('hides your own identity, shows everyone else\'s', () => {
    setup(gameSnapshot());
    expect(within(screen.getByTestId('player-Ann')).getByText('Your identity is hidden from you.')).toBeInTheDocument();
    expect(within(screen.getByTestId('player-Bob')).getByText('Shrek')).toBeInTheDocument();
    expect(within(screen.getByTestId('player-Cara')).getByText('Batman')).toBeInTheDocument();
  });

  it('on your turn offers ask / guess and sends the right events', async () => {
    const { socket } = setup(gameSnapshot());
    const user = userEvent.setup();
    expect(screen.getByTestId('status')).toHaveTextContent('Your turn!');
    const ask = screen.getByRole('button', { name: 'Ask' });
    expect(ask).toBeDisabled();
    await user.type(screen.getByLabelText(/Your question/), 'Am I alive?');
    await user.click(ask);
    expect(socket.last('submit_question')).toMatchObject({ text: 'Am I alive?' });

  });

  it('guess mode sends submit_guess', async () => {
    const { socket } = setup(gameSnapshot());
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Make a guess' }));
    await user.type(screen.getByLabelText(/Who or what/), 'Pikachu');
    await user.click(screen.getByRole('button', { name: 'Guess' }));
    expect(socket.last('submit_guess')).toMatchObject({ text: 'Pikachu' });
  });

  it('off-turn players cannot ask or guess and see who is playing', () => {
    setup(gameSnapshot({ youId: 'b' }));
    expect(screen.getByTestId('status')).toHaveTextContent("Ann's turn");
    expect(screen.queryByRole('button', { name: 'Ask' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Make a guess' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Host controls')).not.toBeInTheDocument();
  });

  it('answerers get Yes / No / Not sure; the choice locks in', async () => {
    const pending = { askerId: 'a', text: 'Am I a toy?', required: ['b', 'c'], answeredBy: [], timedOut: false, yourAnswer: null };
    const { socket } = setup(gameSnapshot({ youId: 'b', phase: 'COLLECTING_ANSWERS', pending }));
    const user = userEvent.setup();
    expect(screen.getByTestId('question')).toHaveTextContent('Am I a toy?');
    await user.click(screen.getByRole('button', { name: 'Not sure' }));
    expect(socket.last('submit_answer')).toMatchObject({ answer: 'NOT_SURE' });
  });

  it('the questioner sees progress but no answer buttons', () => {
    const pending = { askerId: 'a', text: 'Am I a toy?', required: ['b', 'c'], answeredBy: ['b'], timedOut: false, yourAnswer: null };
    setup(gameSnapshot({ phase: 'COLLECTING_ANSWERS', pending }));
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
    expect(screen.getByText(/Answered: 1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting on Cara/)).toBeInTheDocument();
  });

  it('host controls: skip, and ending the round needs confirmation (no alert())', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { socket } = setup(gameSnapshot({ youId: 'a' }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Skip turn' }));
    expect(socket.last('skip_turn')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Skip answer/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'End round' }));
    expect(socket.last('end_round')).toBeUndefined();
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'End round' }));
    expect(socket.last('end_round')).toMatchObject({ confirm: true });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows reveals with names, a Next turn button for the asker and host only', () => {
    const reveal = {
      askerId: 'b',
      text: 'Am I big?',
      answers: [
        { playerId: 'a', answer: 'YES' as const, auto: false },
        { playerId: 'c', answer: 'NOT_SURE' as const, auto: true },
      ],
    };
    const view = setup(gameSnapshot({ youId: 'c', phase: 'SHOWING_ANSWERS', reveal }));
    const panel = screen.getByLabelText('Revealed answers');
    expect(within(panel).getByText('Yes')).toBeInTheDocument();
    expect(within(panel).getByText('Not sure (auto)')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Next turn' })).not.toBeInTheDocument();
    act(() => view.socket.trigger('room_updated', gameSnapshot({ youId: 'a', phase: 'SHOWING_ANSWERS', reveal })));
    expect(within(screen.getByLabelText('Revealed answers')).getByRole('button', { name: 'Next turn' })).toBeInTheDocument();
  });

  it('shows the timer only when enabled and a paused banner when the host is away', () => {
    const view = setup(gameSnapshot({ timer: { kind: 'turn', deadline: Date.now() + 30_000, paused: false } }));
    expect(screen.getByRole('timer')).toBeInTheDocument();
    act(() => view.socket.trigger('room_updated', gameSnapshot({ youId: 'b', phase: 'PAUSED', pausedFrom: 'ASKING' })));
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('Game paused');
    expect(screen.queryByRole('tab', { name: 'Make a guess' })).not.toBeInTheDocument();
  });

  it('renders history entries as plain text', () => {
    const history = [
      { kind: 'guess' as const, turn: 1, playerId: 'b', text: '<script>alert(1)</script>', correct: false },
    ];
    setup(gameSnapshot({ history }));
    expect(within(screen.getByTestId('history')).getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script:not([src])')).toBeNull();
  });

  it('filters questions of each player separately', async () => {
    const user = userEvent.setup();
    const history = [
      {
        kind: 'question' as const,
        turn: 1,
        askerId: 'a',
        text: 'Am I a human?',
        answers: [{ playerId: 'b', answer: 'YES' as const, auto: false }],
      },
      {
        kind: 'question' as const,
        turn: 2,
        askerId: 'b',
        text: 'Am I an animal?',
        answers: [{ playerId: 'a', answer: 'NO' as const, auto: false }],
      },
      {
        kind: 'guess' as const,
        turn: 3,
        playerId: 'a',
        text: 'Einstein',
        correct: true,
      },
    ];
    setup(gameSnapshot({
      youId: 'a',
      players: [
        player({ id: 'a', name: 'Ann', questionsAsked: 1 }),
        player({ id: 'b', name: 'Bob', questionsAsked: 1 }),
      ],
      history,
    }));

    // Initially "All" shows questions from both Ann and Bob
    expect(screen.getByText('“Am I a human?”')).toBeInTheDocument();
    expect(screen.getByText('“Am I an animal?”')).toBeInTheDocument();

    // Filter to Ann's questions
    await user.click(screen.getByTestId('history-filter-Ann'));
    expect(screen.getByText('“Am I a human?”')).toBeInTheDocument();
    expect(screen.queryByText('“Am I an animal?”')).not.toBeInTheDocument();
    expect(screen.getByText(/Your questions & clues/)).toBeInTheDocument();

    // Filter to Bob's questions
    await user.click(screen.getByTestId('history-filter-Bob'));
    expect(screen.getByText('“Am I an animal?”')).toBeInTheDocument();
    expect(screen.queryByText('“Am I a human?”')).not.toBeInTheDocument();
    expect(screen.getByText(/Bob’s questions/)).toBeInTheDocument();

    // Reset back to All
    await user.click(screen.getByTestId('history-filter-all'));
    expect(screen.getByText('“Am I a human?”')).toBeInTheDocument();
    expect(screen.getByText('“Am I an animal?”')).toBeInTheDocument();
  });
});

describe('Results', () => {
  const results = {
    reason: 'ONE_REMAINING' as const,
    players: [
      { id: 'a', identity: 'Pikachu', solved: true, questionsAsked: 3, guessesMade: 1, wrongGuesses: 0, roundScore: 1, totalScore: 3 },
      { id: 'b', identity: 'Shrek', solved: false, questionsAsked: 4, guessesMade: 2, wrongGuesses: 2, roundScore: 0, totalScore: 1 },
    ],
  };

  it('reveals identities and a leaderboard; the host can play again or go back', async () => {
    const { socket } = setup(gameSnapshot({ phase: 'ROUND_RESULTS', results, players: [player({ id: 'a', name: 'Ann', isHost: true }), player({ id: 'b', name: 'Bob' })] }));
    const user = userEvent.setup();
    expect(within(screen.getByTestId('result-Bob')).getByText('Shrek')).toBeInTheDocument();
    expect(within(screen.getByTestId('result-Ann')).getByText('Solved')).toBeInTheDocument();
    expect(screen.getByText('Round ended with one player remaining.')).toBeInTheDocument();
    const board = screen.getByRole('heading', { name: 'Leaderboard' }).closest('section')!;
    expect(within(board).getAllByRole('listitem')[0]).toHaveTextContent('Ann');
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(socket.last('restart_round')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to lobby' }));
    expect(socket.last('return_to_lobby')).toBeTruthy();
  });

  it('non-hosts wait', () => {
    setup(gameSnapshot({ youId: 'b', phase: 'ROUND_RESULTS', results, players: [player({ id: 'a', name: 'Ann', isHost: true }), player({ id: 'b', name: 'Bob' })] }));
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host to start the next round/)).toBeInTheDocument();
  });

  it('displays questions asked by each player separately in results', () => {
    const history = [
      {
        kind: 'question' as const,
        turn: 1,
        askerId: 'a',
        text: 'Am I electric type?',
        answers: [{ playerId: 'b', answer: 'YES' as const, auto: false }],
      },
      {
        kind: 'question' as const,
        turn: 2,
        askerId: 'b',
        text: 'Am I green?',
        answers: [{ playerId: 'a', answer: 'YES' as const, auto: false }],
      },
    ];
    setup(
      gameSnapshot({
        phase: 'ROUND_RESULTS',
        results,
        history,
        players: [player({ id: 'a', name: 'Ann', isHost: true }), player({ id: 'b', name: 'Bob' })],
      }),
    );
    expect(within(screen.getByTestId('result-Ann')).getByText('“Am I electric type?”')).toBeInTheDocument();
    expect(within(screen.getByTestId('result-Bob')).getByText('“Am I green?”')).toBeInTheDocument();
  });
});
