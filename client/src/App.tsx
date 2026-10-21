import { Phase } from '@whoami/shared';
import { useGame } from './lib/store';
import { ConnectionBanner, Toasts } from './components/ui';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';
import { Results } from './screens/Results';

export function App() {
  const { state } = useGame();
  const s = state.snapshot;

  let screen;
  if (!s) screen = <Home />;
  else if (s.phase === Phase.LOBBY) screen = <Lobby snapshot={s} />;
  else if (s.phase === Phase.ROUND_RESULTS && s.results) screen = <Results snapshot={s} />;
  else if (s.round) screen = <Game snapshot={s} />;
  else screen = <Home />;

  return (
    <>
      <ConnectionBanner />
      <Toasts />
      {screen}
    </>
  );
}
