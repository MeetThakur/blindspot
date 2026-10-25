import {
  BATTLESHIP_GRID_SIZE,
  BattleshipPhase,
  DEFAULT_SETTINGS,
  type RoomSnapshot,
} from '@whoami/shared';
import type { BattleshipGameState } from './types.js';

export function snapshotForBattleship(
  s: BattleshipGameState,
  viewerId: string,
  now: number = Date.now(),
): RoomSnapshot {
  const over = s.phase === BattleshipPhase.GAME_OVER;

  return {
    code: s.code,
    gameType: 'battleship',
    phase: s.phase,
    pausedFrom: s.pausedFrom,
    hostId: s.hostId,
    youId: viewerId,
    serverTime: now,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      isHost: p.id === s.hostId,
      afk: p.afk,
      solved: s.winnerId === p.id,
      identity: null,
      questionsAsked: 0,
      wrongGuesses: 0,
      roundScore: 0,
      totalScore: p.score,
    })),
    settings: DEFAULT_SETTINGS,
    list: null,
    roundNumber: 1,
    round: null,
    pending: null,
    reveal: null,
    history: [],
    timer: null,
    results: null,
    battleship: {
      phase: s.phase,
      gridSize: BATTLESHIP_GRID_SIZE,
      players: s.players.map((p) => {
        const isSelf = p.id === viewerId;
        const showShips = isSelf || over;
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          connected: p.connected,
          isHost: p.id === s.hostId,
          afk: p.afk,
          ready: p.ready,
          alive: p.alive,
          score: p.score,
          shipsRemaining: p.ships.length - p.sunkShips.length,
          sunkShips: [...p.sunkShips],
          ships: showShips ? p.ships.map((ship) => ({ ...ship })) : undefined,
          shotsReceived: p.shotsReceived.map((shot) => ({ ...shot })),
        };
      }),
      activeId: s.activeId,
      turnCount: s.turnCount,
      winnerId: s.winnerId,
      settings: { ...s.settings },
      lastShot: s.lastShot ? { ...s.lastShot } : null,
      timer: s.timer
        ? {
            deadline: s.timer.deadline,
            paused: s.timer.deadline === null,
          }
        : null,
    },
  };
}
