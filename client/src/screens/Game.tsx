import { useEffect, useState } from 'react';
import { Answer, CATEGORIES, MAX_GUESS_LENGTH, MAX_QUESTION_LENGTH, Phase, TimerKind, type HistoryEntry, type PlayerSnapshot, type RoomSnapshot } from '@whoami/shared';
import { useGame } from '../lib/store';
import { ANSWER_BG, ANSWER_LABEL, colorHex, getHistoryPlayerId, nameOf, playerById, statusFor } from '../lib/view';
import { Avatar, Badge, ConfirmButton, Countdown } from '../components/ui';

export function Game({ snapshot: s }: { snapshot: RoomSnapshot }) {
  const { client } = useGame();
  const [filterPlayerId, setFilterPlayerId] = useState<string | 'all'>('all');
  const isHost = s.hostId === s.youId;
  const status = statusFor(s);
  const live = s.phase === Phase.PAUSED ? s.pausedFrom : s.phase;
  const timer = s.timer && s.timer.kind !== TimerKind.REVEAL ? s.timer : null;
  const round = s.round!;
  const turnNo = Math.min(round.cyclesCompleted + 1, round.maxCycles);

  const toneClass = {
    you: 'bg-coral text-white shadow-[0_4px_0_0_var(--color-shadow)]',
    wait: 'bg-surface text-ink',
    info: 'bg-sky/20 text-ink',
    paused: 'bg-amber text-[#241f3d]',
  }[status.tone];

  const handleSelectPlayer = (id: string | 'all') => {
    setFilterPlayerId(id);
    document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-16 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black">
            BLIND<span className="rounded-lg bg-coral px-2 text-white">SPOT</span>
          </h1>
          <Badge>Room {s.code}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Round {s.roundNumber}</Badge>
          <Badge>
            Turn cycle {turnNo}/{round.maxCycles}
          </Badge>
          {timer && <Countdown deadline={timer.deadline} paused={timer.paused} label={timer.kind === TimerKind.TURN ? 'Turn' : 'Answers'} />}
        </div>
      </header>

      <section
        className={`card ${toneClass}`}
        aria-live="polite"
        aria-label="Game status"
        data-testid="status"
        data-tone={status.tone}
      >
        <p className="text-2xl font-black">{status.title}</p>
        {status.detail && <p className={status.tone === 'you' ? 'text-white/90' : 'text-ink-soft'}>{status.detail}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {live === Phase.ASKING && round.activeId === s.youId && s.phase !== Phase.PAUSED && <TurnPanel s={s} key={`turn-${s.history.length}-${round.activeId}`} />}
          {live === Phase.COLLECTING_ANSWERS && s.pending && <AnswerPanel s={s} />}
          {live === Phase.SHOWING_ANSWERS && s.reveal && <RevealPanel s={s} />}
          <section aria-label="Players" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {s.players.map((p) => (
              <PlayerCard
                key={p.id}
                p={p}
                s={s}
                isHost={isHost}
                onSelectPlayer={handleSelectPlayer}
              />
            ))}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {(() => {
            const cat = CATEGORIES.find((c) => c.name === s.list?.name);
            return cat?.items && cat.items.length > 0 ? (
              <CandidateRoster items={cat.items} listName={cat.name} />
            ) : null;
          })()}
          {isHost && <HostControls s={s} />}
          <History
            s={s}
            filterPlayerId={filterPlayerId}
            onSelectPlayer={setFilterPlayerId}
          />
        </aside>
      </div>
    </main>
  );
}

function PlayerCard({
  p,
  s,
  isHost,
  onSelectPlayer,
}: {
  p: PlayerSnapshot;
  s: RoomSnapshot;
  isHost: boolean;
  onSelectPlayer: (id: string) => void;
}) {
  const { client } = useGame();
  const me = p.id === s.youId;
  const active = s.round?.activeId === p.id && s.phase !== Phase.PAUSED;
  const live = s.phase === Phase.PAUSED ? s.pausedFrom : s.phase;
  const answered = s.pending?.answeredBy.includes(p.id);
  const owes = live === Phase.COLLECTING_ANSWERS && s.pending?.required.includes(p.id) && !answered;
  return (
    <article
      className={`card relative overflow-hidden !p-0 ${active ? 'ring-4 ring-violet' : ''}`}
      aria-label={`${p.name}${me ? ' (you)' : ''}`}
      data-testid={`player-${p.name}`}
    >
      <div className="h-2" style={{ background: colorHex(p.color) }} />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Avatar name={p.name} color={p.color} size={32} />
          <span className="min-w-0 flex-1 truncate text-lg font-extrabold">{p.name}</span>
          {active && <Badge tone="host">Turn</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {me && <Badge tone="you">You</Badge>}
          {p.isHost && <Badge tone="host">Host</Badge>}
          {p.solved && <Badge tone="good">Solved</Badge>}
          {p.afk && <Badge tone="warn">AFK</Badge>}
          {!p.connected && <Badge tone="warn">Offline</Badge>}
          {owes && <Badge>Thinking…</Badge>}
          {answered && <Badge tone="good">Answered</Badge>}
        </div>

        <div className="mt-3 rounded-xl border-2 border-dashed border-ink bg-paper p-3 text-center">
          {me && !p.identity ? (
            <p className="font-bold text-ink-soft">Your identity is hidden from you.</p>
          ) : (
            <>
              {me && <p className="text-xs font-bold text-ink-soft">You figured it out!</p>}
              <p className="text-xl font-black break-words">{p.identity}</p>
            </>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-sm text-ink-soft">
          <span>
            Round <strong className="text-ink">{p.roundScore}</strong> · Total <strong className="text-ink">{p.totalScore}</strong>
          </span>
          <span>
            {p.questionsAsked}Q · {p.wrongGuesses}✗
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
          <button
            type="button"
            onClick={() => onSelectPlayer(p.id)}
            className="flex items-center gap-1.5 text-xs font-bold text-violet transition hover:underline"
            aria-label={`View questions asked by ${p.name}`}
          >
            <span>{me ? 'Your' : `${p.name}'s`} questions</span>
            <span className="rounded-full bg-violet/15 px-1.5 py-0.2 text-[11px] font-extrabold text-violet">
              {p.questionsAsked}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        {isHost && !me && !p.solved && p.wrongGuesses > 0 && (
          <button
            type="button"
            onClick={() => client.acceptGuess(p.id)}
            className="btn-secondary mt-2 w-full !min-h-9 !py-1 text-xs font-bold text-lime-700 dark:text-lime-400 border-lime-600/40 hover:bg-lime/20"
          >
            ✓ Close enough! (Accept guess)
          </button>
        )}

        {isHost && !me && (!p.connected || p.afk) && (
          <div className="mt-2">
            <ConfirmButton
              label="Remove player"
              className="btn-danger !min-h-9 w-full !py-1 text-sm"
              title={`Remove ${p.name}?`}
              body="They will be removed from the game. The round continues without them."
              confirmLabel="Remove"
              onConfirm={() => client.kick(p.id)}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function useBriefLock(): [boolean, () => void] {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!locked) return;
    const t = setTimeout(() => setLocked(false), 1500);
    return () => clearTimeout(t);
  }, [locked]);
  return [locked, () => setLocked(true)];
}

function TurnPanel({ s }: { s: RoomSnapshot }) {
  const { client } = useGame();
  const [mode, setMode] = useState<'ask' | 'guess'>('ask');
  const [text, setText] = useState('');
  const [locked, lock] = useBriefLock();
  const max = mode === 'ask' ? MAX_QUESTION_LENGTH : MAX_GUESS_LENGTH;
  const trimmed = text.trim();
  const isVoice = s.settings.mode === 'voice';

  const submit = () => {
    if (!trimmed || locked) return;
    lock();
    if (mode === 'ask') client.ask(trimmed);
    else client.guess(trimmed);
  };

  return (
    <section className="card" aria-label="Your turn">
      <div role="tablist" aria-label="Choose an action" className="mb-3 flex gap-2">
        {(['ask', 'guess'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            disabled={locked}
            onClick={() => {
              setMode(m);
              setText('');
            }}
            className={`flex-1 rounded-xl border-2 border-ink px-3 py-2 font-extrabold ${mode === m ? 'bg-violet text-white' : 'bg-surface'}`}
          >
            {m === 'ask' ? (isVoice ? '🎙️ Ask out loud' : 'Ask a question') : 'Make a guess'}
          </button>
        ))}
      </div>
      {isVoice && mode === 'ask' ? (
        <div className="flex flex-col gap-3 py-2">
          <p className="label !mb-0 text-base">
            Ask your question out loud in your Discord call, then click below to collect Yes / No answers:
          </p>
          <button
            type="button"
            className="btn-primary !min-h-14 text-lg font-black"
            disabled={locked}
            onClick={() => {
              lock();
              client.ask('(Voice question)');
            }}
          >
            🎙️ I asked out loud — Wait for Yes / No
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="label" htmlFor="turn-input">
            {mode === 'ask' ? 'Your question (the others answer Yes / No / Not sure)' : 'Who or what do you think you are? One shot, a wrong guess costs your turn.'}
          </label>
          <div className="flex gap-2">
            <input
              id="turn-input"
              className="field"
              value={text}
              maxLength={max}
              disabled={locked}
              autoComplete="off"
              placeholder={mode === 'ask' ? 'Am I a real person?' : 'I am…'}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={!trimmed || locked}>
              {mode === 'ask' ? 'Ask' : 'Guess'}
            </button>
          </div>
          <p className="mt-1 text-right text-xs text-ink-soft">
            {text.length}/{max}
          </p>
        </form>
      )}
    </section>
  );
}

function AnswerPanel({ s }: { s: RoomSnapshot }) {
  const { client } = useGame();
  const [locked, lock] = useBriefLock();
  const p = s.pending!;
  const owes = p.required.includes(s.youId);
  const mine = p.yourAnswer;
  const asker = nameOf(s, p.askerId);
  const missing = p.required.filter((id) => !p.answeredBy.includes(id));
  const isVoice = p.text === '(Voice question)' || s.settings.mode === 'voice';

  return (
    <section className="card" aria-label="Answers">
      <p className="label !mb-0">{isVoice ? `🎙️ ${asker} asked a question in call` : `${asker} asks`}</p>
      <p className="text-2xl font-black break-words" data-testid="question">
        {isVoice ? 'Listen to the question on your call and answer below:' : `“${p.text}”`}
      </p>
      {owes ? (
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Your answer">
          {([
            [Answer.YES, 'Yes', 'bg-lime'],
            [Answer.NO, 'No', 'bg-coral text-white'],
            [Answer.NOT_SURE, 'Not sure', 'bg-amber'],
          ] as const).map(([value, label, bg]) => (
            <button
              key={value}
              type="button"
              disabled={mine !== null || locked}
              aria-pressed={mine === value}
              onClick={() => {
                lock();
                client.answer(value);
              }}
              className={`btn ${bg} ${mine === value ? 'ring-4 ring-violet' : ''} ${mine !== null && mine !== value ? '!opacity-40' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-ink-soft">You asked this one. Sit tight while the others answer.</p>
      )}
      <p className="mt-3 text-sm text-ink-soft">
        Answered: {p.answeredBy.length}/{p.required.length}
        {missing.length > 0 && <> · Waiting on {missing.map((id) => nameOf(s, id)).join(', ')}</>}
      </p>
      {p.timedOut && (
        <p role="status" className="mt-2 rounded-xl border-2 border-ink bg-amber px-3 py-2 font-bold">
          Time's up! {s.hostId === s.youId ? 'Use "Skip answer" to count the missing answers as Not sure.' : 'The host decides what happens next.'}
        </p>
      )}
    </section>
  );
}

function RevealPanel({ s }: { s: RoomSnapshot }) {
  const { client } = useGame();
  const r = s.reveal!;
  const canContinue = s.youId === r.askerId || s.youId === s.hostId;
  const timer = s.timer?.kind === TimerKind.REVEAL ? s.timer : null;
  return (
    <section className="card" aria-label="Revealed answers">
      <p className="label !mb-0">{nameOf(s, r.askerId)} asked</p>
      <p className="text-2xl font-black break-words">
        {r.text === '(Voice question)' ? '🎙️ Voice question (asked in call)' : `“${r.text}”`}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {r.answers.map((a) => {
          const p = playerById(s, a.playerId);
          return (
            <li key={a.playerId} className="flex items-center gap-2 rounded-xl border-2 border-ink px-3 py-2">
              {p && <Avatar name={p.name} color={p.color} size={26} />}
              <span className="min-w-0 flex-1 truncate font-bold">{nameOf(s, a.playerId)}</span>
              <span className={`rounded-full border-2 border-ink px-2 py-0.5 text-sm font-extrabold ${ANSWER_BG[a.answer]}`}>
                {ANSWER_LABEL[a.answer]}
                {a.auto ? ' (auto)' : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canContinue && (
          <button type="button" className="btn-primary" onClick={client.nextTurn}>
            Next turn
          </button>
        )}
        {timer && <Countdown deadline={timer.deadline} paused={timer.paused} label="Next turn in" />}
      </div>
    </section>
  );
}

function CandidateRoster({ items, listName }: { items: string[]; listName: string }) {
  const [crossedOut, setCrossedOut] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(true);

  const toggle = (item: string) => {
    setCrossedOut((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const clearAll = () => setCrossedOut(new Set());

  const remainingCount = items.length - crossedOut.size;
  const filtered = items.filter((item) =>
    item.toLowerCase().includes(search.toLowerCase().trim()),
  );

  return (
    <section className="card flex flex-col gap-2.5" aria-label="Deduction Scratchpad">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold">Candidate Scratchpad</h2>
          <span className="rounded-full bg-violet/15 px-2 py-0.5 text-xs font-black text-violet">
            {remainingCount}/{items.length} remaining
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-bold text-violet transition hover:underline"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <>
          <p className="text-xs text-ink-soft">
            Tap names to cross them off as you rule them out in <strong>{listName}</strong>.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              placeholder="Search candidates..."
              onChange={(e) => setSearch(e.target.value)}
              className="field !py-1 text-xs"
            />
            {crossedOut.size > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="whitespace-nowrap text-xs font-bold text-coral transition hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="mt-1 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {filtered.map((item) => {
              const struck = crossedOut.has(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggle(item)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    struck
                      ? 'border-border bg-surface-subtle text-ink-soft/40 line-through opacity-50'
                      : 'border-border bg-surface text-ink hover:border-violet shadow-[0_1px_0_0_var(--color-shadow)]'
                  }`}
                  aria-pressed={struck}
                >
                  <span>{item}</span>
                  {struck && (
                    <span className="text-[10px] font-black text-coral" aria-hidden="true">✕</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function HostControls({ s }: { s: RoomSnapshot }) {
  const { client } = useGame();
  const live = s.phase === Phase.PAUSED ? s.pausedFrom : s.phase;
  const paused = s.phase === Phase.PAUSED;
  const guessers = s.players.filter((p) => !p.solved && p.wrongGuesses > 0);

  return (
    <section className="card" aria-label="Host controls">
      <h2 className="text-lg font-extrabold">Host controls</h2>
      <div className="mt-2 flex flex-col gap-2">
        <button type="button" className="btn-secondary" disabled={paused || live !== Phase.ASKING} onClick={client.skipTurn}>
          Skip turn
        </button>
        <button
          type="button"
          className={s.pending?.timedOut ? 'btn-primary' : 'btn-secondary'}
          disabled={paused || live !== Phase.COLLECTING_ANSWERS}
          onClick={() => client.skipAnswer()}
        >
          Skip answer (counts as Not sure)
        </button>
        <ConfirmButton
          label="End round"
          title="End this round?"
          body="Everyone's identity is revealed and the round ends now. Points scored so far are kept."
          confirmLabel="End round"
          disabled={paused}
          onConfirm={client.endRound}
        />
        {guessers.length > 0 && (
          <div className="mt-2 border-t border-border pt-2 flex flex-col gap-1.5">
            <p className="text-xs font-bold text-ink-soft">Accept previous guess ("Close enough"):</p>
            {guessers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => client.acceptGuess(p.id)}
                className="btn-secondary !py-1 text-xs font-bold text-lime-700 dark:text-lime-400 hover:bg-lime/20 border-lime-600/40"
              >
                ✓ Accept {p.name}'s guess
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function describe(h: HistoryEntry, s: RoomSnapshot): { who: string; body: React.ReactNode; tone: string } {
  switch (h.kind) {
    case 'question':
      return {
        who: nameOf(s, h.askerId),
        tone: 'bg-surface',
        body: (
          <>
            <p className="break-words font-bold">“{h.text}”</p>
            <p className="mt-1 flex flex-wrap gap-1">
              {h.answers.map((a) => (
                <span key={a.playerId} className={`rounded-full border-2 border-ink px-2 text-xs font-bold ${ANSWER_BG[a.answer]}`}>
                  {nameOf(s, a.playerId)}: {ANSWER_LABEL[a.answer]}
                </span>
              ))}
            </p>
          </>
        ),
      };
    case 'guess':
      return {
        who: nameOf(s, h.playerId),
        tone: h.correct ? 'bg-lime/40' : 'bg-blush',
        body: (
          <p className="break-words">
            Guessed <strong>“{h.text}”</strong> — {h.correct ? 'Correct!' : 'Not quite!'}
          </p>
        ),
      };
    case 'skip':
      return {
        who: nameOf(s, h.playerId),
        tone: 'bg-paper',
        body: (
          <p className="text-ink-soft">
            Turn skipped ({h.reason === 'TIMEOUT' ? 'ran out of time' : h.reason === 'HOST' ? 'skipped by host' : 'disconnected'}).
          </p>
        ),
      };
    case 'question_cancelled':
      return { who: nameOf(s, h.askerId), tone: 'bg-paper', body: <p className="text-ink-soft">Question cancelled: “{h.text}”</p> };
  }
}

function History({
  s,
  filterPlayerId,
  onSelectPlayer,
}: {
  s: RoomSnapshot;
  filterPlayerId: string | 'all';
  onSelectPlayer: (id: string | 'all') => void;
}) {
  const activePlayer = filterPlayerId === 'all' ? null : playerById(s, filterPlayerId);

  // If a player is selected, filter to actions where they are the primary actor (asker or guesser)
  const allReversed = [...s.history].reverse();
  const items = filterPlayerId === 'all'
    ? allReversed
    : allReversed.filter((h) => getHistoryPlayerId(h) === filterPlayerId);

  // Chronological questions for the active player to compute stats and numbering
  const playerQuestionsChronological = activePlayer
    ? s.history.filter((h) => h.kind === 'question' && h.askerId === activePlayer.id)
    : [];

  let yesCount = 0;
  let noCount = 0;
  let notSureCount = 0;
  if (activePlayer) {
    for (const q of playerQuestionsChronological) {
      if (q.kind === 'question') {
        for (const a of q.answers) {
          if (a.answer === 'YES') yesCount++;
          else if (a.answer === 'NO') noCount++;
          else if (a.answer === 'NOT_SURE') notSureCount++;
        }
      }
    }
  }

  const guessesCount = activePlayer
    ? s.history.filter((h) => h.kind === 'guess' && h.playerId === activePlayer.id).length
    : 0;

  return (
    <section id="history-section" className="card flex flex-col gap-3" aria-label="History">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Questions & History</h2>
        {filterPlayerId !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectPlayer('all')}
            className="text-xs font-bold text-violet transition hover:underline"
          >
            Show all
          </button>
        )}
      </div>

      {/* Filter Tabs per Player */}
      <div
        className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2.5"
        role="tablist"
        aria-label="Filter questions by player"
      >
        <button
          type="button"
          role="tab"
          data-testid="history-filter-all"
          aria-selected={filterPlayerId === 'all'}
          onClick={() => onSelectPlayer('all')}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            filterPlayerId === 'all'
              ? 'bg-violet text-white shadow-[0_2px_0_0_var(--color-shadow)]'
              : 'bg-surface hover:bg-surface-subtle text-ink border border-border'
          }`}
        >
          All ({s.history.length})
        </button>
        {s.players.map((p) => {
          const isYou = p.id === s.youId;
          const isSelected = filterPlayerId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              data-testid={`history-filter-${p.name}`}
              aria-selected={isSelected}
              onClick={() => onSelectPlayer(p.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                isSelected
                  ? 'bg-violet text-white shadow-[0_2px_0_0_var(--color-shadow)]'
                  : 'bg-surface hover:bg-surface-subtle text-ink border border-border'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorHex(p.color) }} />
              <span>{isYou ? 'You' : p.name}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-surface-subtle text-ink-soft'
                }`}
              >
                {p.questionsAsked}
              </span>
            </button>
          );
        })}
      </div>

      {/* Deduction Summary Card when a single player is selected */}
      {activePlayer && (
        <div className="rounded-xl border border-border bg-surface-subtle p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-ink">
              {activePlayer.id === s.youId ? 'Your questions & clues' : `${activePlayer.name}’s questions`}
            </span>
            {activePlayer.solved && <Badge tone="good">Solved!</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-ink-soft">
            <span><strong>{activePlayer.questionsAsked}</strong> asked</span>
            <span>·</span>
            <span className="font-bold text-lime-700 dark:text-lime-400">{yesCount} Yes</span>
            <span>·</span>
            <span className="font-bold text-coral">{noCount} No</span>
            <span>·</span>
            <span className="font-bold text-amber-700 dark:text-amber-400">{notSureCount} Not sure</span>
            {guessesCount > 0 && (
              <>
                <span>·</span>
                <span>{guessesCount} {guessesCount === 1 ? 'guess' : 'guesses'}</span>
              </>
            )}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-2 py-4 text-center text-sm text-ink-soft">
          {activePlayer
            ? activePlayer.id === s.youId
              ? "You haven't asked any questions yet."
              : `${activePlayer.name} hasn't asked any questions yet.`
            : 'Questions and guesses will show up here.'}
        </p>
      ) : (
        <ol className="mt-1 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1" data-testid="history">
          {items.map((h, i) => {
            const d = describe(h, s);
            const isQuestion = h.kind === 'question';
            const qNum = isQuestion && activePlayer ? playerQuestionsChronological.indexOf(h) + 1 : null;
            return (
              <li
                key={`${h.turn}-${items.length - i}`}
                className={`rounded-xl border-2 border-border px-3 py-2 shadow-[0_2px_0_0_var(--color-shadow)] ${d.tone}`}
              >
                <div className="flex items-center justify-between text-xs font-extrabold text-ink-soft">
                  <span>
                    {qNum !== null && qNum > 0 ? (
                      <span className="mr-1.5 rounded bg-violet/15 px-1 py-0.5 font-black text-violet">
                        Q #{qNum}
                      </span>
                    ) : null}
                    {d.who}
                  </span>
                  <span>Turn {h.turn}</span>
                </div>
                <div className="mt-1">{d.body}</div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
