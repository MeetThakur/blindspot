import type { RoomSnapshot } from '@whoami/shared';
import { useGame } from '../lib/store';
import { ANSWER_BG, ANSWER_LABEL, getHistoryPlayerId, nameOf, playerById, reasonText } from '../lib/view';
import { Avatar, Badge } from '../components/ui';

export function Results({ snapshot: s }: { snapshot: RoomSnapshot }) {
  const { client } = useGame();
  const isHost = s.hostId === s.youId;
  const results = s.results!;
  const ranked = [...results.players].sort((a, b) => b.totalScore - a.totalScore || b.roundScore - a.roundScore);
  const topRound = Math.max(...results.players.map((p) => p.roundScore));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-6">
      <header className="text-center">
        <p className="label">Round {s.roundNumber} results</p>
        <h1 className="text-4xl font-black sm:text-5xl">{reasonText(results.reason)}</h1>
      </header>

      <section aria-label="Identities" className="grid gap-3 sm:grid-cols-2">
        {results.players.map((r) => {
          const p = playerById(s, r.id);
          const playerHistory = s.history.filter((h) => getHistoryPlayerId(h) === r.id);
          const questionsOnly = playerHistory.filter((h) => h.kind === 'question');
          return (
            <article key={r.id} className="card flex flex-col justify-between" data-testid={`result-${nameOf(s, r.id)}`}>
              <div>
                <div className="flex items-center gap-2">
                  {p && <Avatar name={p.name} color={p.color} />}
                  <span className="min-w-0 flex-1 truncate text-lg font-extrabold">{nameOf(s, r.id)}</span>
                  {r.solved ? <Badge tone="good">Solved</Badge> : <Badge tone="warn">Not solved</Badge>}
                </div>
                <p className="mt-2 text-sm font-bold text-ink-soft">was</p>
                <p className="text-2xl font-black break-words">{r.identity}</p>
                <p className="mt-2 text-sm text-ink-soft">
                  {r.questionsAsked} question{r.questionsAsked === 1 ? '' : 's'} · {r.guessesMade} guess{r.guessesMade === 1 ? '' : 'es'} ({r.wrongGuesses} wrong) ·{' '}
                  <strong className="text-ink">+{r.roundScore} this round</strong>
                  {r.roundScore === topRound && topRound > 0 && ' · Round MVP'}
                </p>
              </div>

              {playerHistory.length > 0 && (
                <details className="group mt-3 rounded-xl border border-border bg-surface-subtle p-2 text-sm">
                  <summary className="flex cursor-pointer select-none items-center justify-between font-bold text-violet transition hover:underline">
                    <span>Questions & deductions ({questionsOnly.length})</span>
                    <span className="text-xs text-ink-soft transition-transform group-open:rotate-180" aria-hidden="true">▼</span>
                  </summary>
                  <ol className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto border-t border-border pr-1 pt-2">
                    {playerHistory.map((h, i) => (
                      <li key={i} className="rounded-lg border border-border bg-surface p-2 text-xs">
                        {h.kind === 'question' && (
                          <>
                            <div className="flex items-center justify-between font-bold text-ink-soft">
                              <span>Q #{questionsOnly.indexOf(h) + 1}</span>
                              <span>Turn {h.turn}</span>
                            </div>
                            <p className="mt-0.5 font-bold text-ink">“{h.text}”</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {h.answers.map((a) => (
                                <span
                                  key={a.playerId}
                                  className={`rounded-full border border-border px-1.5 py-0.2 text-[10px] font-bold ${ANSWER_BG[a.answer]}`}
                                >
                                  {nameOf(s, a.playerId)}: {ANSWER_LABEL[a.answer]}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                        {h.kind === 'guess' && (
                          <p className={h.correct ? 'font-bold text-lime-700 dark:text-lime-400' : 'font-bold text-coral'}>
                            Guessed “{h.text}” — {h.correct ? '🎉 Correct!' : '✗ Wrong'}
                          </p>
                        )}
                        {h.kind === 'skip' && (
                          <p className="italic text-ink-soft">Turn skipped ({h.reason})</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </article>
          );
        })}
      </section>

      <section className="card" aria-labelledby="board">
        <h2 id="board" className="text-xl font-extrabold">
          Leaderboard
        </h2>
        <ol className="mt-3 flex flex-col gap-2">
          {ranked.map((r, i) => {
            const p = playerById(s, r.id);
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border-2 border-border bg-surface px-3 py-2 shadow-[0_2px_0_0_var(--color-shadow)]">
                <span className="w-6 text-center text-lg font-black">{i + 1}</span>
                {p && <Avatar name={p.name} color={p.color} size={30} />}
                <span className="min-w-0 flex-1 truncate font-bold">
                  {nameOf(s, r.id)}
                  {r.id === s.youId && ' (you)'}
                </span>
                <span className="text-sm text-ink-soft">+{r.roundScore}</span>
                <span className="w-10 text-right text-xl font-black">{r.totalScore}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-col items-center gap-3">
        {isHost ? (
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="btn-primary px-8 text-lg" onClick={client.restartRound}>
              Play again
            </button>
            <button type="button" className="btn-secondary" onClick={client.returnToLobby}>
              Back to lobby
            </button>
          </div>
        ) : (
          <p className="font-bold text-ink-soft" role="status">
            Waiting for the host to start the next round…
          </p>
        )}
        <button type="button" className="text-sm font-bold text-ink-soft underline" onClick={() => client.leave()}>
          Leave room
        </button>
      </div>
    </main>
  );
}
