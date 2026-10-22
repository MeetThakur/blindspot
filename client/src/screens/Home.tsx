import { useState } from 'react';
import { MAX_NAME_LENGTH } from '@whoami/shared';
import { storedName } from '../lib/gameClient';
import { useGame } from '../lib/store';
import { normalizeRoomCode, roomFromUrl } from '../lib/view';
import { Avatar, Spinner } from '../components/ui';
import { SavedListsManager } from '../components/SavedLists';

const SAMPLE = [
  { name: 'Maya', color: 'sky', identity: 'Pikachu' },
  { name: 'Leo', color: 'lime', identity: 'Shrek' },
  { name: 'Zoe', color: 'violet', identity: 'Batman' },
];

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
              onClick={() => client.createRoom(trimmed)}
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-8 sm:pt-12">
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tight sm:text-7xl">
          BLIND<span className="inline-block -rotate-3 rounded-2xl border-2 border-border bg-coral px-3 text-white shadow-[0_4px_0_0_var(--color-shadow)]">SPOT</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Everyone can see who you are… except you. Ask questions, crack your secret identity, and beat your friends to it.
        </p>
      </header>

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

      <section className="card mx-auto w-full max-w-xl" aria-label="Start playing">
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
          <p role="alert" className="mt-3 rounded-xl border-2 border-ink bg-blush px-3 py-2 font-bold">
            {state.formError}
          </p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card" aria-labelledby="how">
          <h2 id="how" className="text-xl font-extrabold">
            How to play
          </h2>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-ink-soft">
            <li>Everyone gets a secret identity. You see everyone's… but not your own.</li>
            <li>On your turn, ask one question about yourself, or take one guess.</li>
            <li>The others answer Yes, No or Not sure. Answers are revealed together.</li>
            <li>
              Guess right for <strong>+1 point</strong>. A wrong guess costs <strong>−1</strong> and your turn.
            </li>
          </ol>
          <p className="mt-3 text-sm text-ink-soft">2–5 players. Best with everyone on a voice call.</p>
        </section>

        <section className="card" aria-label="Game preview">
          <h2 className="text-xl font-extrabold">What you'll see</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {SAMPLE.map((p) => (
              <div key={p.name} className="rounded-xl border-2 border-border bg-surface-subtle p-3 shadow-[0_2px_0_0_var(--color-shadow)]">
                <div className="flex items-center gap-2">
                  <Avatar name={p.name} color={p.color} size={28} />
                  <span className="font-extrabold">{p.name}</span>
                </div>
                <p className="mt-2 text-lg font-black">{p.identity}</p>
              </div>
            ))}
            <div className="rounded-xl border-2 border-dashed border-border bg-amber/20 p-3 shadow-[0_2px_0_0_var(--color-shadow)]">
              <div className="flex items-center gap-2">
                <Avatar name="You" color="coral" size={28} />
                <span className="font-extrabold">You</span>
              </div>
              <p className="mt-2 text-lg font-black text-coral">???</p>
            </div>
          </div>
        </section>
      </div>
      <SavedListsManager />
    </main>
  );
}
