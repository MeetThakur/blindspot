import { useState } from 'react';
import { MAX_NAME_LENGTH, type GameType } from '@whoami/shared';
import { storedName } from '../lib/gameClient';
import { useGame } from '../lib/store';
import { normalizeRoomCode, roomFromUrl } from '../lib/view';
import { Spinner } from '../components/ui';

const GAMES: {
  id: GameType;
  name: string;
  players: string;
  pitch: string;
  howTo: string;
  selected: string;
}[] = [
  {
    id: 'battleship',
    name: 'Battleship',
    players: '2–4 players',
    pitch: 'Hide your fleet, sink your rivals.',
    howTo: 'Place 5 warships in secret, then fire at any rival’s radar. Last fleet afloat wins.',
    selected: 'border-sky bg-sky/15 ring-2 ring-sky/50',
  },
  {
    id: 'barricade',
    name: 'Barricade',
    players: '2–4 players',
    pitch: 'Race to the crown, block rivals with walls.',
    howTo: 'Step or jump toward the center crown and drop 2-unit walls to slow rivals. First to the crown wins.',
    selected: 'border-amber bg-amber/15 ring-2 ring-amber/50',
  },
  {
    id: 'blindspot',
    name: 'Blindspot',
    players: '2–5 players',
    pitch: 'Everyone sees who you are but you.',
    howTo: 'Ask one Yes / No question or make one guess per turn. First to crack their identity scores most.',
    selected: 'border-coral bg-coral/15 ring-2 ring-coral/50',
  },
];

export function Home() {
  const { state, client } = useGame();
  const invite = roomFromUrl(window.location.search);
  const [name, setName] = useState(storedName);
  const [code, setCode] = useState(invite);
  const [selectedGame, setSelectedGame] = useState<GameType>('battleship');
  const waking = !state.everConnected;
  const trimmed = name.trim();
  const canCreate = !waking && !state.pending && trimmed.length > 0;
  const canJoin = canCreate && code.length >= 4;
  const game = GAMES.find((g) => g.id === selectedGame)!;

  const createButton = (
    <button
      type="button"
      className={`${invite ? 'btn-secondary' : 'btn-primary'} w-full py-3 text-base`}
      disabled={!canCreate}
      onClick={() => client.createRoom(trimmed, selectedGame)}
    >
      {state.pending ? 'Creating room…' : 'Create a room'}
    </button>
  );

  const joinForm = (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canJoin) client.joinRoom(code, trimmed);
      }}
    >
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="code">
          Room code
        </label>
        <input
          id="code"
          className="field text-center font-mono text-lg font-black uppercase tracking-[0.3em]"
          placeholder="CODE"
          value={code}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Room code"
          onChange={(e) => {
            setCode(normalizeRoomCode(e.target.value));
            client.clearFormError();
          }}
        />
      </div>
      <button type="submit" className={`${invite ? 'btn-primary' : 'btn-secondary'} px-6`} disabled={!canJoin}>
        Join
      </button>
    </form>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-8 sm:pt-12">
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tight sm:text-6xl">
          PLAY<span className="text-coral">DECK</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md font-medium text-ink-soft">
          Pick a game, make a private room, send the link to your friends. No accounts, no setup.
        </p>
      </header>

      {waking && (
        <div role="status" className="card flex items-start gap-3 border-amber bg-amber/15 text-ink">
          <Spinner className="mt-1" />
          <div>
            <p className="font-extrabold">Waking up the server…</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Hosting sleeps when inactive to save energy. First connection can take up to a minute.
            </p>
          </div>
        </div>
      )}

      <section className="card flex flex-col gap-5 p-5 sm:p-7" aria-label="Start playing">
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <div className="relative flex items-center">
            <input
              id="name"
              className="field pl-3.5 pr-14 text-base font-bold"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              placeholder="Enter your nickname (e.g. Maya)"
              onChange={(e) => {
                setName(e.target.value);
                client.clearFormError();
              }}
            />
            {trimmed.length > 0 && (
              <span className="absolute right-3.5 text-xs font-black text-ink-soft opacity-60">
                {trimmed.length}/{MAX_NAME_LENGTH}
              </span>
            )}
          </div>
        </div>

        {!invite && (
          <div>
            <p className="label">Choose a game to host</p>
            <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Game">
              {GAMES.map((g) => {
                const on = g.id === selectedGame;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelectedGame(g.id)}
                    className={`flex flex-col gap-1 rounded-xl border-2 p-3 text-left transition-all ${
                      on
                        ? `${g.selected} shadow-[0_3px_0_0_var(--color-shadow)]`
                        : 'border-border/40 bg-surface-subtle hover:border-border hover:bg-surface'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-black">{g.name}</span>
                      <span className="text-[11px] font-bold text-ink-soft">{g.players}</span>
                    </span>
                    <span className="text-xs leading-snug text-ink-soft">{g.pitch}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-ink-soft" data-testid="how-to">
              <span className="font-black text-ink">How {game.name} works: </span>
              {game.howTo}
            </p>
          </div>
        )}

        <div className={`grid gap-3 ${invite ? '' : 'sm:grid-cols-2'}`}>
          {invite ? joinForm : createButton}
          {invite ? createButton : joinForm}
        </div>

        {invite && (
          <p className="text-center text-xs font-bold text-ink-soft">
            You were invited to room <span className="font-mono font-black text-coral">{invite}</span>. Enter your name and click Join.
          </p>
        )}

        {state.formError && (
          <p role="alert" className="rounded-xl border-2 border-rose-500 bg-rose-500/15 p-3 text-xs font-black text-rose-600 dark:text-rose-400">
            {state.formError}
          </p>
        )}

        {!waking && (
          <p role="status" className="text-center text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            ● Server ready
          </p>
        )}
      </section>
    </main>
  );
}
