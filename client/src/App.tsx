import { Phase } from '@whoami/shared';
import { useGame } from './lib/store';
import { ConnectionBanner, ThemeToggle, Toasts } from './components/ui';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';
import { Results } from './screens/Results';
import { BarricadeScreen } from './screens/barricade/BarricadeGame';

export function App() {
  const { state } = useGame();
  const s = state.snapshot;

  let screen;
  if (!s) {
    screen = <Home />;
  } else if (s.gameType === 'barricade') {
    screen = <BarricadeScreen snapshot={s} />;
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
            <span className="text-xl font-black tracking-tight select-none">
              PARTY<span className="rounded-lg bg-coral px-1.5 py-0.5 text-white">SPOT</span>
            </span>
            {s && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full border border-border bg-amber/20 px-2.5 py-0.5 text-xs font-black tracking-wider text-ink uppercase">
                  {s.gameType === 'barricade' ? '🏰 BARRICADE' : '🎭 BLINDSPOT'}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-black tracking-wider text-ink">
                  ROOM {s.code}
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
