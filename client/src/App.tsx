import { Phase } from '@whoami/shared';
import { useGame } from './lib/store';
import { ConnectionBanner, ThemeToggle, Toasts } from './components/ui';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';
import { Results } from './screens/Results';
import { BarricadeScreen } from './screens/barricade/BarricadeGame';
import { BattleshipScreen } from './screens/battleship/BattleshipGame';

export function App() {
  const { state } = useGame();
  const s = state.snapshot;

  let screen;
  if (!s) {
    screen = <Home />;
  } else if (s.gameType === 'barricade') {
    screen = <BarricadeScreen snapshot={s} />;
  } else if (s.gameType === 'battleship') {
    screen = <BattleshipScreen snapshot={s} />;
  } else if (s.phase === Phase.LOBBY) {
    screen = <Lobby snapshot={s} />;
  } else if (s.phase === Phase.ROUND_RESULTS && s.results) {
    screen = <Results snapshot={s} />;
  } else if (s.round) {
    screen = <Game snapshot={s} />;
  } else {
    screen = <Home />;
  }

  return (
    <div className="min-h-screen bg-paper text-ink transition-colors flex flex-col">
      <ConnectionBanner />
      <Toasts />
      <header className="sticky top-0 z-30 w-full border-b-2 border-border bg-surface/90 backdrop-blur-md transition-colors">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-2xl font-black tracking-tight select-none">
              PLAY<span className="text-coral">DECK</span>
            </span>
            {s && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-border/80 bg-surface-subtle px-3 py-0.5 text-xs font-black tracking-wider text-ink uppercase">
                  {s.gameType === 'barricade'
                    ? 'BARRICADE'
                    : s.gameType === 'battleship'
                      ? 'BATTLESHIP'
                      : 'BLINDSPOT'}
                </span>
                <span className="inline-flex items-center rounded-full border-2 border-border bg-amber px-3 py-0.5 text-xs font-black tracking-widest text-ink font-mono shadow-[0_2px_0_0_var(--color-shadow)]">
                  {s.code}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="flex-1">
        {screen}
      </div>
    </div>
  );
}
