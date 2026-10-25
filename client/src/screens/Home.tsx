import { useState } from 'react';
import { MAX_NAME_LENGTH, type GameType } from '@whoami/shared';
import { storedName } from '../lib/gameClient';
import { useGame } from '../lib/store';
import { normalizeRoomCode, roomFromUrl } from '../lib/view';
import { Spinner } from '../components/ui';

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

  const createButton = (
    <div>
      <button
        type="button"
        className={`${invite ? 'btn-secondary' : 'btn-primary'} w-full text-base py-3 shadow-[0_4px_0_0_var(--color-shadow)]`}
        disabled={!canCreate}
        onClick={() => client.createRoom(trimmed, selectedGame)}
      >
        {state.pending ? 'Creating room…' : 'Create a room'}
      </button>
    </div>
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
      <button
        type="submit"
        className={`${invite ? 'btn-primary' : 'btn-secondary'} px-6`}
        disabled={!canJoin}
      >
        Join
      </button>
    </form>
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-20 pt-8 sm:pt-14">
      {/* Hero Banner */}
      <header className="text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-surface-subtle px-3.5 py-1 text-xs font-black tracking-wider text-ink-soft uppercase shadow-sm">
          Instant Browser Multiplayer
        </div>
        <h1 className="mt-4 text-6xl font-black tracking-tight sm:text-8xl">
          PLAY<span className="text-coral">DECK</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-ink-soft leading-relaxed">
          Zero accounts, zero setup. Pick a game, create a private room, and share the link with your friends.
        </p>
      </header>

      {/* Server wake status */}
      {waking ? (
        <div role="status" className="card mx-auto w-full max-w-xl flex items-start gap-3 border-amber bg-amber/15 text-ink">
          <Spinner className="mt-1" />
          <div>
            <p className="font-extrabold">Waking up the server…</p>
            <p className="text-xs text-ink-soft mt-0.5">
              Hosting sleeps when inactive to save energy. First connection can take up to a minute.
            </p>
          </div>
        </div>
      ) : (
        <p role="status" className="text-center text-xs font-black tracking-wider text-emerald-600 dark:text-emerald-400 uppercase -mt-4">
          ● Server ready
        </p>
      )}

      {/* Primary Action Card: Player Setup & Room Launch */}
      <section className="card mx-auto w-full max-w-xl bg-surface p-6 sm:p-8" aria-label="Start playing">
        <div>
          <label className="label text-xs uppercase tracking-wider font-black text-ink-soft" htmlFor="name">
            Your name
          </label>
          <div className="relative flex items-center">
            <input
              id="name"
              className="field pl-3.5 pr-10 text-base font-bold"
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

        {/* Game Mode Selector (When not directly invited to a room) */}
        {!invite && (
          <div className="mt-5">
            <label className="label text-xs uppercase tracking-wider font-black text-ink-soft">
              Choose game to host
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                className={`flex flex-col items-center justify-center rounded-xl border-2 py-3 px-2 text-xs font-black transition-all ${
                  selectedGame === 'battleship'
                    ? 'border-sky bg-sky/20 text-ink shadow-[0_3px_0_0_var(--color-shadow)] ring-2 ring-sky/60'
                    : 'border-border/50 bg-surface-subtle text-ink-soft hover:bg-surface hover:text-ink'
                }`}
                onClick={() => setSelectedGame('battleship')}
              >
                <span>Battleship</span>
                <span className="text-[10px] font-bold text-ink-soft/80 mt-0.5">2–4 Players</span>
              </button>

              <button
                type="button"
                className={`flex flex-col items-center justify-center rounded-xl border-2 py-3 px-2 text-xs font-black transition-all ${
                  selectedGame === 'barricade'
                    ? 'border-amber bg-amber/20 text-ink shadow-[0_3px_0_0_var(--color-shadow)] ring-2 ring-amber/60'
                    : 'border-border/50 bg-surface-subtle text-ink-soft hover:bg-surface hover:text-ink'
                }`}
                onClick={() => setSelectedGame('barricade')}
              >
                <span>Barricade</span>
                <span className="text-[10px] font-bold text-ink-soft/80 mt-0.5">2–4 Players</span>
              </button>

              <button
                type="button"
                className={`flex flex-col items-center justify-center rounded-xl border-2 py-3 px-2 text-xs font-black transition-all ${
                  selectedGame === 'blindspot'
                    ? 'border-coral bg-coral/20 text-ink shadow-[0_3px_0_0_var(--color-shadow)] ring-2 ring-coral/60'
                    : 'border-border/50 bg-surface-subtle text-ink-soft hover:bg-surface hover:text-ink'
                }`}
                onClick={() => setSelectedGame('blindspot')}
              >
                <span>Blindspot</span>
                <span className="text-[10px] font-bold text-ink-soft/80 mt-0.5">2–8 Players</span>
              </button>
            </div>
          </div>
        )}

        {/* Buttons / Actions */}
        <div className={`mt-6 grid gap-4 ${invite ? '' : 'sm:grid-cols-2'}`}>
          {invite ? joinForm : createButton}
          {invite ? createButton : joinForm}
        </div>

        {invite && (
          <p className="mt-3.5 text-center text-xs font-bold text-ink-soft">
            You were invited to room <span className="font-mono font-black text-coral">{invite}</span>. Enter your name and click Join.
          </p>
        )}

        {state.formError && (
          <p role="alert" className="mt-4 rounded-xl border-2 border-rose-500 bg-rose-500/15 p-3 text-xs font-black text-rose-600 dark:text-rose-400">
            {state.formError}
          </p>
        )}
      </section>

      {/* Featured Games Showcase */}
      <section aria-label="Game Catalog" className="pt-4">
        <div className="flex items-center justify-between mb-5 border-b-2 border-border/60 pb-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Game Catalog</h2>
            <p className="text-xs font-bold text-ink-soft mt-0.5">Click any card to select game</p>
          </div>
          <span className="text-xs font-black text-coral uppercase tracking-wider">
            {selectedGame.toUpperCase()} SELECTED
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Game 1: Battleship */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedGame('battleship')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSelectedGame('battleship');
            }}
            className={`card flex flex-col justify-between border-2 transition-all cursor-pointer p-0 overflow-hidden ${
              selectedGame === 'battleship'
                ? 'border-sky bg-surface shadow-[0_8px_0_0_var(--color-shadow)] ring-2 ring-sky'
                : 'border-border bg-surface hover:shadow-[0_4px_0_0_var(--color-shadow)]'
            }`}
          >
            <div className="p-5">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h3 className="text-xl font-black tracking-tight">Battleship</h3>
                <span className="rounded-full bg-sky/20 border border-sky/40 px-2.5 py-0.5 text-xs font-black text-sky-600 dark:text-sky-300">
                  2–4 Players
                </span>
              </div>

              <p className="mt-3 text-xs text-ink-soft leading-relaxed">
                Secret fleet deployment with multi-target combat radar. Target enemy ocean coordinates and sink rival warships in an epic free-for-all naval arena.
              </p>

              <div className="mt-4 rounded-xl border border-border/60 bg-surface-subtle p-3 space-y-1.5 text-xs text-ink-soft">
                <p className="font-black text-ink text-[11px] uppercase tracking-wider">How to play:</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>Deploy 5 warships (Carrier, Battleship, Cruiser, Sub, Destroyer).</li>
                  <li>Multi-target radar lets you aim at any opponent.</li>
                  <li>Last admiral standing wins the sea.</li>
                </ul>
              </div>
            </div>

            <div className={`px-5 py-2.5 text-center text-xs font-black border-t-2 border-border/40 ${
              selectedGame === 'battleship'
                ? 'bg-sky text-white'
                : 'bg-surface-subtle text-ink-soft'
            }`}>
              {selectedGame === 'battleship' ? '✓ Selected to Host' : 'Click to select'}
            </div>
          </div>

          {/* Game 2: Barricade */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedGame('barricade')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSelectedGame('barricade');
            }}
            className={`card flex flex-col justify-between border-2 transition-all cursor-pointer p-0 overflow-hidden ${
              selectedGame === 'barricade'
                ? 'border-amber bg-surface shadow-[0_8px_0_0_var(--color-shadow)] ring-2 ring-amber'
                : 'border-border bg-surface hover:shadow-[0_4px_0_0_var(--color-shadow)]'
            }`}
          >
            <div className="p-5">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h3 className="text-xl font-black tracking-tight">Barricade</h3>
                <span className="rounded-full bg-amber/20 border border-amber/40 px-2.5 py-0.5 text-xs font-black text-amber-600 dark:text-amber-300">
                  2–4 Players
                </span>
              </div>

              <p className="mt-3 text-xs text-ink-soft leading-relaxed">
                Tactical king-of-the-hill race on a 9x9 board. Move toward the center crown and place wall barricades to divert rivals into dead ends.
              </p>

              <div className="mt-4 rounded-xl border border-border/60 bg-surface-subtle p-3 space-y-1.5 text-xs text-ink-soft">
                <p className="font-black text-ink text-[11px] uppercase tracking-wider">How to play:</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>Step 1 cell or jump over adjacent pawns.</li>
                  <li>Place 2-unit walls to reroute competitors.</li>
                  <li>First pawn to step on the center crown wins.</li>
                </ul>
              </div>
            </div>

            <div className={`px-5 py-2.5 text-center text-xs font-black border-t-2 border-border/40 ${
              selectedGame === 'barricade'
                ? 'bg-amber text-ink'
                : 'bg-surface-subtle text-ink-soft'
            }`}>
              {selectedGame === 'barricade' ? '✓ Selected to Host' : 'Click to select'}
            </div>
          </div>

          {/* Game 3: Blindspot */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedGame('blindspot')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSelectedGame('blindspot');
            }}
            className={`card flex flex-col justify-between border-2 transition-all cursor-pointer p-0 overflow-hidden ${
              selectedGame === 'blindspot'
                ? 'border-coral bg-surface shadow-[0_8px_0_0_var(--color-shadow)] ring-2 ring-coral'
                : 'border-border bg-surface hover:shadow-[0_4px_0_0_var(--color-shadow)]'
            }`}
          >
            <div className="p-5">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h3 className="text-xl font-black tracking-tight">Blindspot</h3>
                <span className="rounded-full bg-coral/20 border border-coral/40 px-2.5 py-0.5 text-xs font-black text-coral">
                  2–8 Players
                </span>
              </div>

              <p className="mt-3 text-xs text-ink-soft leading-relaxed">
                Everyone can see who you are, except you. Take turns asking Yes/No questions or taking a guess to deduce your secret identity.
              </p>

              <div className="mt-4 rounded-xl border border-border/60 bg-surface-subtle p-3 space-y-1.5 text-xs text-ink-soft">
                <p className="font-black text-ink text-[11px] uppercase tracking-wider">How to play:</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>Ask 1 question or make 1 guess per turn.</li>
                  <li>Other players answer Yes, No, or Not Sure.</li>
                  <li>First to crack their identity earns top score.</li>
                </ul>
              </div>
            </div>

            <div className={`px-5 py-2.5 text-center text-xs font-black border-t-2 border-border/40 ${
              selectedGame === 'blindspot'
                ? 'bg-coral text-white'
                : 'bg-surface-subtle text-ink-soft'
            }`}>
              {selectedGame === 'blindspot' ? '✓ Selected to Host' : 'Click to select'}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
