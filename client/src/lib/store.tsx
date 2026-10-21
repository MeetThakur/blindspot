import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { GameClient, ClientState } from './gameClient';

const Ctx = createContext<GameClient | null>(null);

export function GameProvider({ client, children }: { client: GameClient; children: ReactNode }) {
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useGame(): { state: ClientState; client: GameClient } {
  const client = useContext(Ctx);
  if (!client) throw new Error('GameProvider missing');
  const state = useSyncExternalStore(client.subscribe, client.getState);
  return { state, client };
}
