import { ANSWER_TIMEOUT_OPTIONS, CATEGORY_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, TURN_TIMEOUT_OPTIONS, type RoomSnapshot, type SettingsPatch } from '@whoami/shared';
import { useState } from 'react';
import { useGame } from '../lib/store';
import { defaultStore, useSavedLists } from '../lib/savedLists';
import { ListEditor } from '../components/ListEditor';
import { inviteLink } from '../lib/view';
import { Avatar, Badge, ConfirmButton, CopyButton } from '../components/ui';

const optionLabel = (v: number | null, unit = 's') => (v === null ? 'Off' : `${v}${unit}`);

export function Lobby({ snapshot: s }: { snapshot: RoomSnapshot }) {
  const { client } = useGame();
  const isHost = s.hostId === s.youId;
  const link = inviteLink(window.location.origin, s.code);
  const enough = s.players.length >= MIN_PLAYERS;
  const hasList = s.list !== null;
  const startBlocker = !enough ? 'Waiting for at least 2 players' : !hasList ? 'Pick a category first' : null;
  const set = (patch: SettingsPatch) => client.updateSettings(patch);
  const [editorOpen, setEditorOpen] = useState(false);
  const { lists, refresh, store } = useSavedLists(defaultStore());
  const useList = (name: string, items: string[]) => {
    client.updateSettings(undefined, { kind: 'custom', name, items });
    setEditorOpen(false);
  };
  const currentCategory = CATEGORY_OPTIONS.find((c) => c.name === s.list?.name)?.id;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black">
          BLIND<span className="rounded-lg bg-coral px-2 text-white">SPOT</span>
        </h1>
        <button type="button" className="btn-secondary" onClick={() => client.leave()}>
          Leave room
        </button>
      </header>

      <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Invite friends">
        <div>
          <p className="label !mb-0">Room code</p>
          <p className="text-4xl font-black tracking-[0.25em]" data-testid="room-code">
            {s.code}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={s.code} label="Copy code" />
          <CopyButton text={link} label="Copy invite link" className="btn-primary" />
        </div>
        <p className="w-full break-all text-sm text-ink-soft sm:hidden">{link}</p>
      </section>

      <div className="grid gap-6 md:grid-cols-[1fr_1.3fr]">
        <section className="card" aria-labelledby="players-h">
          <h2 id="players-h" className="text-xl font-extrabold">
            Players ({s.players.length}/{MAX_PLAYERS})
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {s.players.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border-2 border-ink px-3 py-2">
                <Avatar name={p.name} color={p.color} />
                <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                {p.isHost && <Badge tone="host">Host</Badge>}
                {p.id === s.youId && <Badge tone="you">You</Badge>}
                {!p.connected && <Badge tone="warn">Offline</Badge>}
                {isHost && p.id !== s.youId && (
                  <ConfirmButton
                    label="Remove"
                    className="btn-danger !min-h-9 !px-2 !py-1 text-sm"
                    title={`Remove ${p.name}?`}
                    body="They will be taken out of the room, but can rejoin with the code."
                    confirmLabel="Remove"
                    onConfirm={() => client.kick(p.id)}
                  />
                )}
              </li>
            ))}
          </ul>
          {!enough && <p className="mt-3 text-sm text-ink-soft">Share the code or invite link. You need at least 2 players.</p>}
        </section>

        <section className="card" aria-labelledby="settings-h">
          <h2 id="settings-h" className="text-xl font-extrabold">
            Game settings
          </h2>
          {!isHost && <p className="text-sm text-ink-soft">Only the host can change these.</p>}

          <fieldset className="mt-3" disabled={!isHost}>
            <legend className="label">Category</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={currentCategory === c.id}
                  disabled={!isHost}
                  onClick={() => client.updateSettings(undefined, { kind: 'category', id: c.id })}
                  className={`rounded-full border-2 border-ink px-3 py-1.5 text-sm font-bold disabled:cursor-default ${
                    currentCategory === c.id ? 'bg-violet text-white' : 'bg-surface hover:bg-amber/30'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {isHost && (
              <div className="mt-3">
                <p className="label">Or play with your own list</p>
                <div className="flex flex-wrap gap-2">
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={s.list?.name === l.name && !currentCategory}
                      className={`rounded-full border-2 border-ink px-3 py-1.5 text-sm font-bold ${s.list?.name === l.name && !currentCategory ? 'bg-violet text-white' : 'bg-surface hover:bg-amber/30'}`}
                      onClick={() => useList(l.name, l.items)}
                    >
                      {l.name} ({l.items.length})
                    </button>
                  ))}
                  <button type="button" className="rounded-full border-2 border-dashed border-ink bg-paper px-3 py-1.5 text-sm font-bold hover:bg-amber/30" onClick={() => setEditorOpen((o) => !o)}>
                    {editorOpen ? 'Hide list editor' : '+ Paste or import a list'}
                  </button>
                </div>
              </div>
            )}
            {s.list && !currentCategory && (
              <p className="mt-2 text-sm text-ink-soft">
                Custom list: <strong>{s.list.name}</strong> ({s.list.count} items)
              </p>
            )}
          </fieldset>

          <fieldset className="mt-4" disabled={!isHost}>
            <legend className="label">Game Mode</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!isHost}
                onClick={() => set({ mode: 'text' })}
                className={`flex flex-col items-start rounded-xl border-2 border-ink p-3 text-left transition ${
                  s.settings.mode === 'text' ? 'bg-violet text-white shadow-[0_2px_0_0_var(--color-ink)]' : 'bg-surface hover:bg-amber/30'
                }`}
              >
                <span className="font-extrabold text-base">💬 Text mode</span>
                <span className={`text-xs mt-1 ${s.settings.mode === 'text' ? 'text-white/80' : 'text-ink-soft'}`}>
                  Type questions in the browser
                </span>
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => set({ mode: 'voice' })}
                className={`flex flex-col items-start rounded-xl border-2 border-ink p-3 text-left transition ${
                  s.settings.mode === 'voice' ? 'bg-violet text-white shadow-[0_2px_0_0_var(--color-ink)]' : 'bg-surface hover:bg-amber/30'
                }`}
              >
                <span className="font-extrabold text-base">🎙️ Voice mode</span>
                <span className={`text-xs mt-1 ${s.settings.mode === 'voice' ? 'text-white/80' : 'text-ink-soft'}`}>
                  Ask out loud in call, wait for Yes/No
                </span>
              </button>
            </div>
          </fieldset>

          <fieldset className="mt-4 grid gap-3 sm:grid-cols-2" disabled={!isHost}>
            <legend className="sr-only">Round rules</legend>
            <Setting label="Turns per player">
              <select className="field" value={s.settings.maxTurnsPerPlayer} onChange={(e) => set({ maxTurnsPerPlayer: Number(e.target.value) })}>
                {[3, 5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Setting>
            <Setting label="Wrong guess penalty">
              <select className="field" value={s.settings.wrongGuessPenalty} onChange={(e) => set({ wrongGuessPenalty: Number(e.target.value) })}>
                <option value={0}>None</option>
                <option value={-1}>−1 point</option>
                <option value={-2}>−2 points</option>
              </select>
            </Setting>
            <Setting label="Speed bonus (up to +2)">
              <select className="field" value={String(s.settings.speedBonus)} onChange={(e) => set({ speedBonus: e.target.value === 'true' })}>
                <option value="false">Off</option>
                <option value="true">On</option>
              </select>
            </Setting>
          </fieldset>

          <fieldset className="mt-4 grid gap-3 sm:grid-cols-2" disabled={!isHost}>
            <legend className="label mt-1">Timers</legend>
            <Setting label="Answer time limit">
              <select
                className="field"
                value={String(s.settings.answerTimeoutSec)}
                onChange={(e) => set({ answerTimeoutSec: e.target.value === 'null' ? null : (Number(e.target.value) as 15 | 30 | 45 | 60) })}
              >
                {ANSWER_TIMEOUT_OPTIONS.map((v) => (
                  <option key={String(v)} value={String(v)}>
                    {optionLabel(v)}
                  </option>
                ))}
              </select>
            </Setting>
            <Setting label="Turn time limit">
              <select
                className="field"
                value={String(s.settings.turnTimeoutSec)}
                onChange={(e) => set({ turnTimeoutSec: e.target.value === 'null' ? null : (Number(e.target.value) as 30 | 60 | 90 | 120) })}
              >
                {TURN_TIMEOUT_OPTIONS.map((v) => (
                  <option key={String(v)} value={String(v)}>
                    {optionLabel(v)}
                  </option>
                ))}
              </select>
            </Setting>
            <Setting label="When an answer is late">
              <select
                className="field"
                value={s.settings.timeoutAction}
                disabled={s.settings.answerTimeoutSec === null}
                onChange={(e) => set({ timeoutAction: e.target.value as 'AUTO_NOT_SURE' | 'HOST_DECIDES' })}
              >
                <option value="HOST_DECIDES">Host decides</option>
                <option value="AUTO_NOT_SURE">Auto "Not sure"</option>
              </select>
            </Setting>
          </fieldset>
          {s.settings.answerTimeoutSec === null && s.settings.turnTimeoutSec === null && (
            <p className="mt-2 text-sm text-ink-soft">Timers are off. The host can skip a stuck answer or turn at any time.</p>
          )}

          <div className="mt-4 rounded-xl border-2 border-ink bg-mint p-3 text-sm" aria-label="Scoring rules">
            <p className="font-extrabold">Scoring</p>
            <p>
              Correct guess +1{s.settings.speedBonus ? ' (+ up to 2 speed bonus)' : ''}. Wrong guess{' '}
              {s.settings.wrongGuessPenalty === 0 ? 'costs only your turn' : `${s.settings.wrongGuessPenalty} point${s.settings.wrongGuessPenalty === -1 ? '' : 's'} and your turn`}
              . A round score never goes below 0. Rounds end after {s.settings.maxTurnsPerPlayer} turns each.
            </p>
          </div>
        </section>
      </div>

      {isHost && editorOpen && (
        <ListEditor store={store} playerCount={s.players.length} onUse={useList} onSaved={refresh} onClose={() => setEditorOpen(false)} />
      )}

      <div className="flex flex-col items-center gap-2">
        {isHost ? (
          <>
            <button type="button" className="btn-primary px-8 text-lg" disabled={startBlocker !== null} onClick={client.startGame}>
              Start game
            </button>
            {startBlocker && <p className="text-sm text-ink-soft">{startBlocker}</p>}
          </>
        ) : (
          <p className="font-bold text-ink-soft" role="status">
            Waiting for the host to start the game…
          </p>
        )}
      </div>
    </main>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
