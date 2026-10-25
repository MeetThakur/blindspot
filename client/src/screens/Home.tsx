import { useState } from 'react';
import { MAX_NAME_LENGTH } from '@whoami/shared';
import { storedName } from '../lib/gameClient';
import { useGame } from '../lib/store';
import { normalizeRoomCode, roomFromUrl } from '../lib/view';
import { Spinner } from '../components/ui';

export function Home() {
  const { state, client } = useGame();
  const invite = roomFromUrl(window.location.search);
  const [name, setName] = useState(storedName);
  const [code, setCode] = useState(invite);
  const waking = !state.everConnected;
  const trimmed = name.trim();
  const canCreate = !waking && !state.pending && trimmed.length > 0;
  const canJoin = canCreate && code.length >= 4;

  const createButton = (
    <div>
      <button
        type="button"
        className={`${invite ? 'btn-secondary' : 'btn-primary'} w-full`}
        disabled={!canCreate}
        onClick={() => client.createRoom(trimmed, 'blindspot')}
      >
        {state.pending ? 'Working…' : 'Create a room'}
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
          className="field text-center font-extrabold uppercase tracking-[0.3em]"
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
      <button type="submit" className={invite ? 'btn-primary' : 'btn-secondary'} disabled={!canJoin}>
        Join
      </button>
    </form>
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-8 sm:pt-12">
      {/* Portal Hero Banner */}
      <header className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-amber/30 px-3 py-1 text-xs font-black tracking-wider text-ink mb-3 shadow-[0_2px_0_0_var(--color-shadow)]">
          🎮 MULTIPLAYER GAME DECK
        </div>
        <h1 className="text-5xl font-black tracking-tight sm:text-7xl">
          PLAY<span className="inline-block -rotate-3 rounded-2xl border-2 border-border bg-coral px-3 text-white shadow-[0_4px_0_0_var(--color-shadow)]">DECK</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Instant multiplayer games with your friends and family. Choose a game, create a private room, and jump in!
        </p>
      </header>

      {/* Server wake status */}
      {waking ? (
        <div role="status" className="card flex items-start gap-3 border-amber bg-amber/20 text-ink">
          <Spinner className="mt-1" />
          <div>
            <p className="font-extrabold">Waking up the server…</p>
            <p className="text-sm text-ink-soft">
              Free hosting naps when nobody is around, so the first visit can take up to a minute. You can already type your name.
            </p>
          </div>
        </div>
      ) : (
        <p role="status" className="text-center text-sm font-bold text-ink-soft">
          Server ready.
        </p>
      )}

      {/* Player Setup & Quick Join Card */}
      <section className="card mx-auto w-full max-w-xl bg-surface" aria-label="Start playing">
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          className="field"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          placeholder="e.g. Maya"
          onChange={(e) => {
            setName(e.target.value);
            client.clearFormError();
          }}
        />

        <div className={`mt-4 grid gap-4 ${invite ? '' : 'sm:grid-cols-2'}`}>
          {invite ? joinForm : createButton}
          {invite ? createButton : joinForm}
        </div>

        {invite && (
          <p className="mt-3 text-sm text-ink-soft">
            You were invited to room <strong>{invite}</strong>. Enter your name and hit Join.
          </p>
        )}

        {state.formError && (
          <p role="alert" className="mt-3 rounded-xl border-2 border-ink bg-blush px-3 py-2 font-bold text-sm">
            {state.formError}
          </p>
        )}
      </section>

      {/* Featured Games Catalog */}
      <section aria-label="Game Catalog">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black tracking-tight">Game Catalog</h2>
          <span className="text-xs font-bold text-ink-soft">Pick a game mode</span>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Game 1: Battleship (2-4 Players) */}
          <div className="card flex flex-col justify-between border-2 border-border bg-surface transition-all hover:shadow-[0_6px_0_0_var(--color-shadow)]">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl">🚢</span>
                  <div>
                    <h3 className="text-lg font-black leading-tight">Battleship</h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full bg-sky px-2 py-0.5 text-[10px] font-black text-white uppercase">
                        ⚓ NEW
                      </span>
                      <span className="rounded-full bg-surface-subtle border border-border px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                        2–4 Players
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-ink-soft leading-relaxed">
                Deploy your secret fleet, scan enemy ocean grids, and fire missiles! Multi-target radar lets 2 to 4 admirals battle in an epic free-for-all naval arena.
              </p>

              <div className="mt-3 rounded-xl border border-border bg-surface-subtle p-2.5 text-xs text-ink-soft space-y-1">
                <p className="font-bold text-ink">Rules & Highlights:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>Deploy 5 warships (1-click Randomize available).</li>
                  <li>Target any rival player's radar on your turn.</li>
                  <li>Last surviving fleet wins the sea 🏆</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t-2 border-border">
              <button
                type="button"
                className="btn-primary w-full text-sm py-2.5"
                disabled={!canCreate}
                onClick={() => client.createRoom(trimmed, 'battleship')}
              >
                {state.pending ? 'Creating…' : '🚢 Host Battleship'}
              </button>
            </div>
          </div>

          {/* Game 2: Barricade (King of the Hill) */}
          <div className="card flex flex-col justify-between border-2 border-border bg-surface transition-all hover:shadow-[0_6px_0_0_var(--color-shadow)]">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl">🏰</span>
                  <div>
                    <h3 className="text-lg font-black leading-tight">Barricade</h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full bg-amber px-2 py-0.5 text-[10px] font-black text-ink uppercase">
                        ⭐ NEW
                      </span>
                      <span className="rounded-full bg-surface-subtle border border-border px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                        2–4 Players
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-ink-soft leading-relaxed">
                Race your pawn to claim the center crown on a 9x9 tactical board. Place wall barricades to block rivals — but no player can ever be completely sealed off!
              </p>

              <div className="mt-3 rounded-xl border border-border bg-surface-subtle p-2.5 text-xs text-ink-soft space-y-1">
                <p className="font-bold text-ink">Rules & Highlights:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>Move 1 step orthogonally or jump over opponents.</li>
                  <li>Place 2-segment walls to reroute competitors.</li>
                  <li>First pawn to step onto (4, 4) wins the crown 👑</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t-2 border-border">
              <button
                type="button"
                className="btn-secondary w-full text-sm py-2.5"
                disabled={!canCreate}
                onClick={() => client.createRoom(trimmed, 'barricade')}
              >
                {state.pending ? 'Creating…' : '🏰 Host Barricade'}
              </button>
            </div>
          </div>

          {/* Game 3: Blindspot (Who Am I?) */}
          <div className="card flex flex-col justify-between border-2 border-border bg-surface transition-all hover:shadow-[0_6px_0_0_var(--color-shadow)]">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl">🎭</span>
                  <div>
                    <h3 className="text-lg font-black leading-tight">Blindspot</h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full bg-coral px-2 py-0.5 text-[10px] font-black text-white uppercase">
                        Party Classic
                      </span>
                      <span className="rounded-full bg-surface-subtle border border-border px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                        2–8 Players
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-ink-soft leading-relaxed">
                Everyone gets a secret identity card on their forehead. You see everyone's identity except your own! Take turns asking Yes/No questions to deduce who you are.
              </p>

              <div className="mt-3 rounded-xl border border-border bg-surface-subtle p-2.5 text-xs text-ink-soft space-y-1">
                <p className="font-bold text-ink">Rules & Highlights:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>Ask 1 question or make 1 guess per turn.</li>
                  <li>All other players answer simultaneously.</li>
                  <li>First to crack their identity earns top points 🏆</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t-2 border-border">
              <button
                type="button"
                className="btn-secondary w-full text-sm py-2.5"
                disabled={!canCreate}
                onClick={() => client.createRoom(trimmed, 'blindspot')}
              >
                {state.pending ? 'Creating…' : '🎭 Host Blindspot'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
