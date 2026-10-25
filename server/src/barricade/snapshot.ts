import {
  BARRICADE_CENTER,
  BARRICADE_GRID_SIZE,
  DEFAULT_SETTINGS,
  type RoomSnapshot,
} from '@whoami/shared';
import type { BarricadeGameState } from './types.js';

export function snapshotForBarricade(
  s: BarricadeGameState,
  viewerId: string,
  now: number = Date.now(),
): RoomSnapshot {
  return {
    code: s.code,
    gameType: 'barricade',
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
    barricade: {
      phase: s.phase,
      gridSize: BARRICADE_GRID_SIZE,
      goal: { x: BARRICADE_CENTER, y: BARRICADE_CENTER },
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        isHost: p.id === s.hostId,
        afk: p.afk,
        position: { ...p.position },
        startPosition: { ...p.startPosition },
        barricadesRemaining: p.barricadesRemaining,
        wallsPlaced: p.wallsPlaced,
        movesCount: p.movesCount,
        score: p.score,
      })),
      activeId: s.activeId,
      turnCount: s.turnCount,
      walls: s.walls.map((w) => ({ ...w })),
      winnerId: s.winnerId,
      settings: { ...s.settings },
      timer: s.timer
        ? {
            deadline: s.timer.deadline,
            paused: s.timer.deadline === null,
          }
        : null,
    },
  };
}
