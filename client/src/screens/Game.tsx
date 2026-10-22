import { useEffect, useState } from 'react';
import { Answer, MAX_GUESS_LENGTH, MAX_QUESTION_LENGTH, Phase, TimerKind, type HistoryEntry, type PlayerSnapshot, type RoomSnapshot } from '@whoami/shared';
import { useGame } from '../lib/store';
import { colorHex, nameOf, playerById, statusFor } from '../lib/view';
import { Avatar, Badge, ConfirmButton, Countdown } from '../components/ui';

export function Game({ snapshot: s }: { snapshot: RoomSnapshot }) {
  const { client } = useGame();
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
              <PlayerCard key={p.id} p={p} s={s} isHost={isHost} />
            ))}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {isHost && <HostControls s={s} />}
          <History s={s} />
        </aside>
      </div>
    </main>
  );
}

function PlayerCard({ p, s, isHost }: { p: PlayerSnapshot; s: RoomSnapshot; isHost: boolean }) {
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

const ANSWER_LABEL: Record<string, string> = { YES: 'Yes', NO: 'No', NOT_SURE: 'Not sure' };
const ANSWER_BG: Record<string, string> = { YES: 'bg-lime text-[#12301c]', NO: 'bg-coral text-white', NOT_SURE: 'bg-amber text-[#241f3d]' };

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

function HostControls({ s }: { s: RoomSnapshot }) {
  const { client } = useGame();
  const live = s.phase === Phase.PAUSED ? s.pausedFrom : s.phase;
  const paused = s.phase === Phase.PAUSED;
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

function History({ s }: { s: RoomSnapshot }) {
  const items = [...s.history].reverse();
  return (
    <section className="card" aria-label="History">
      <h2 className="text-lg font-extrabold">History</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Questions and guesses will show up here.</p>
      ) : (
        <ol className="mt-2 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1" data-testid="history">
          {items.map((h, i) => {
            const d = describe(h, s);
            return (
              <li key={`${h.turn}-${items.length - i}`} className={`rounded-xl border-2 border-ink px-3 py-2 ${d.tone}`}>
                <p className="text-xs font-extrabold text-ink-soft">
                  {d.who} · turn {h.turn}
                </p>
                {d.body}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
