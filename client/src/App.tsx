import { Phase } from '@whoami/shared';
import { useGame } from './lib/store';
import { ConnectionBanner, Toasts } from './components/ui';
import { HeaderNav } from './components/HeaderNav';
import { AuthModal } from './components/auth/AuthModal';
import { FriendsModal } from './components/friends/FriendsModal';
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
      <AuthModal />
      <FriendsModal />
      <header className="sticky top-0 z-30 w-full border-b-2 border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md transition-colors">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="/"
              className="flex items-center gap-2 select-none transition-transform hover:scale-[1.02] active:scale-[0.98]"
              title="Playdeck Home"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral border-2 border-border text-white shadow-[0_2px_0_0_var(--color-shadow)]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="3" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
                  <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                  <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" />
                  <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
                </svg>
              </div>
              <span className="hidden text-xl font-black tracking-tight sm:inline">
                PLAY<span className="text-coral">DECK</span>
              </span>
            </a>
            {s && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="hidden h-9 items-center rounded-xl border-2 border-border bg-surface-subtle px-2.5 sm:inline-flex text-xs font-black tracking-wider text-ink uppercase shadow-[0_2px_0_0_var(--color-shadow)]">
                  {s.gameType === 'barricade'
                    ? 'BARRICADE'
                    : s.gameType === 'battleship'
                      ? 'BATTLESHIP'
                      : 'BLINDSPOT'}
                </span>
                <span className="inline-flex h-9 items-center rounded-xl border-2 border-border bg-amber px-2.5 text-xs font-black tracking-widest text-ink font-mono shadow-[0_2px_0_0_var(--color-shadow)]">
                  {s.code}
                </span>
              </div>
            )}
          </div>
          <HeaderNav />
        </div>
      </header>
      <div className="flex-1">
        {screen}
      </div>
    </div>
  );
}
