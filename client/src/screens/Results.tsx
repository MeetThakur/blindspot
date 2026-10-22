import type { RoomSnapshot } from '@whoami/shared';
import { useGame } from '../lib/store';
import { nameOf, playerById, reasonText } from '../lib/view';
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
          return (
            <article key={r.id} className="card" data-testid={`result-${nameOf(s, r.id)}`}>
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
