import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { GameProvider } from './lib/store';
import { createGameClient } from './lib/gameClient';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:3001';
const client = createGameClient(SERVER_URL);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider client={client}>
      <App />
    </GameProvider>
  </StrictMode>,
);
