import { describe, expect, it } from 'vitest';
import {
  canAllReachGoal,
  getValidMoves,
  hasPath,
  isWallBlocked,
  isValidWallPlacement,
} from '../src/barricade/pathfinding.js';
import {
  createBarricadeRoom,
  reduceBarricade,
} from '../src/barricade/engine.js';
import { BarricadePhase, ErrorCode } from '@whoami/shared';

describe('Barricade Pathfinding & Wall Rules', () => {
  it('detects wall blocking between adjacent cells', () => {
    // Horizontal wall at (4, 4) blocks (4, 4) <-> (4, 5) and (5, 4) <-> (5, 5)
    const walls = [{ orientation: 'h' as const, x: 4, y: 4 }];

    expect(isWallBlocked({ x: 4, y: 4 }, { x: 4, y: 5 }, walls)).toBe(true);
    expect(isWallBlocked({ x: 4, y: 5 }, { x: 4, y: 4 }, walls)).toBe(true);
    expect(isWallBlocked({ x: 5, y: 4 }, { x: 5, y: 5 }, walls)).toBe(true);
    expect(isWallBlocked({ x: 5, y: 5 }, { x: 5, y: 4 }, walls)).toBe(true);

    // Should not block horizontal movement
    expect(isWallBlocked({ x: 4, y: 4 }, { x: 5, y: 4 }, walls)).toBe(false);
    // Should not block row 3 to 4
    expect(isWallBlocked({ x: 4, y: 3 }, { x: 4, y: 4 }, walls)).toBe(false);
  });

  it('detects vertical wall blocking', () => {
    // Vertical wall at (2, 2) blocks (2, 2) <-> (3, 2) and (2, 3) <-> (3, 3)
    const walls = [{ orientation: 'v' as const, x: 2, y: 2 }];

    expect(isWallBlocked({ x: 2, y: 2 }, { x: 3, y: 2 }, walls)).toBe(true);
    expect(isWallBlocked({ x: 3, y: 2 }, { x: 2, y: 2 }, walls)).toBe(true);
    expect(isWallBlocked({ x: 2, y: 3 }, { x: 3, y: 3 }, walls)).toBe(true);
    expect(isWallBlocked({ x: 3, y: 3 }, { x: 2, y: 3 }, walls)).toBe(true);

    // Does not block vertical movement
    expect(isWallBlocked({ x: 2, y: 2 }, { x: 2, y: 3 }, walls)).toBe(false);
  });

  it('validates wall placement collisions and cross intersections', () => {
    const existing = [{ orientation: 'h' as const, x: 2, y: 2 }];

    // Identical
    expect(isValidWallPlacement({ orientation: 'h', x: 2, y: 2 }, existing).valid).toBe(false);
    // Overlapping horizontal wall (within 1 col)
    expect(isValidWallPlacement({ orientation: 'h', x: 1, y: 2 }, existing).valid).toBe(false);
    expect(isValidWallPlacement({ orientation: 'h', x: 3, y: 2 }, existing).valid).toBe(false);
    // Intersection cross at same coordinate
    expect(isValidWallPlacement({ orientation: 'v', x: 2, y: 2 }, existing).valid).toBe(false);

    // Non-conflicting wall
    expect(isValidWallPlacement({ orientation: 'h', x: 4, y: 2 }, existing).valid).toBe(true);
    expect(isValidWallPlacement({ orientation: 'v', x: 3, y: 3 }, existing).valid).toBe(true);
  });

  it('calculates valid moves and jumps over adjacent opponents', () => {
    const p1 = { id: 'p1', position: { x: 4, y: 4 } };
    const p2 = { id: 'p2', position: { x: 4, y: 3 } }; // opponent directly above

    const moves = getValidMoves(p1.position, [p1, p2], []);

    // Left (3, 4), Right (5, 4), Down (4, 5)
    // Straight jump over p2 to (4, 2)
    expect(moves).toEqual(
      expect.arrayContaining([
        { x: 3, y: 4 },
        { x: 5, y: 4 },
        { x: 4, y: 5 },
        { x: 4, y: 2 }, // straight jump!
      ]),
    );
    expect(moves.some((m) => m.x === 4 && m.y === 3)).toBe(false); // cannot land on opponent
  });

  it('verifies BFS pathfinding and prevents trapping players', () => {
    const start = { x: 4, y: 8 };
    const goal = { x: 4, y: 4 };

    expect(hasPath(start, goal, [])).toBe(true);

    // Complete box trapping player at (4, 8)
    // (4, 8) has neighbors: (4, 7), (3, 8), (5, 8)
    // Horizontal walls above row 8: (3, 7) and (4, 7) block (3, 7)-(3, 8), (4, 7)-(4, 8), (5, 7)-(5, 8)
    // Vertical wall to left of col 4: (3, 7) blocks (3, 8)-(4, 8)
    // Vertical wall to right of col 4: (4, 7) blocks (4, 8)-(5, 8)
    const trapWalls = [
      { orientation: 'h' as const, x: 3, y: 7 },
      { orientation: 'v' as const, x: 3, y: 7 },
      { orientation: 'v' as const, x: 4, y: 7 },
    ];

    expect(canAllReachGoal([{ position: start }], goal, trapWalls)).toBe(false);
  });
});

describe('Barricade Game Engine Integration', () => {
  const ctx = { now: 1000 };

  it('handles room lifecycle: lobby -> start -> move -> win', () => {
    let state = createBarricadeRoom({
      code: 'BAR1',
      hostId: 'h1',
      hostName: 'Alice',
      hostToken: 'tok-h1',
      now: 1000,
      graceMs: 30000,
    });

    // Join second player
    const joinRes = reduceBarricade(
      state,
      { type: 'join', actionId: 'j1', playerId: 'p2', name: 'Bob', token: 'tok-p2' },
      ctx,
    );
    expect(joinRes.ok).toBe(true);
    if (!joinRes.ok) return;
    state = joinRes.state;
    expect(state.players).toHaveLength(2);

    // Host starts game
    const startRes = reduceBarricade(state, { type: 'start_game', actionId: 's1', playerId: 'h1' }, ctx);
    expect(startRes.ok).toBe(true);
    if (!startRes.ok) return;
    state = startRes.state;
    expect(state.phase).toBe(BarricadePhase.PLAYING);
    expect(state.activeId).toBe('h1');
    expect(state.players[0].position).toEqual({ x: 4, y: 8 }); // Bottom
    expect(state.players[1].position).toEqual({ x: 4, y: 0 }); // Top

    // Player 1 moves Up towards center (4, 7)
    const moveRes = reduceBarricade(
      state,
      { type: 'barricade_move', actionId: 'm1', playerId: 'h1', x: 4, y: 7 },
      ctx,
    );
    expect(moveRes.ok).toBe(true);
    if (!moveRes.ok) return;
    state = moveRes.state;
    expect(state.players[0].position).toEqual({ x: 4, y: 7 });
    expect(state.activeId).toBe('p2'); // Turn passed to p2

    // Player 2 places a horizontal wall at (1, 1)
    const wallRes = reduceBarricade(
      state,
      { type: 'barricade_place_wall', actionId: 'w1', playerId: 'p2', orientation: 'h', x: 1, y: 1 },
      ctx,
    );
    expect(wallRes.ok).toBe(true);
    if (!wallRes.ok) return;
    state = wallRes.state;
    expect(state.walls).toHaveLength(1);
    expect(state.players[1].barricadesRemaining).toBe(5);
    expect(state.activeId).toBe('h1'); // Turn passed back to h1
  });

  it('rejects illegal wall that would trap a player', () => {
    let state = createBarricadeRoom({
      code: 'BAR2',
      hostId: 'h1',
      hostName: 'Alice',
      hostToken: 'tok-h1',
      now: 1000,
      graceMs: 30000,
    });
    const joinRes = reduceBarricade(
      state,
      { type: 'join', actionId: 'j1', playerId: 'p2', name: 'Bob', token: 'tok-p2' },
      ctx,
    );
    if (!joinRes.ok) return;
    const startRes = reduceBarricade(joinRes.state, { type: 'start_game', actionId: 's1', playerId: 'h1' }, ctx);
    if (!startRes.ok) return;
    state = startRes.state;

    // Place 2 walls boxing in Bottom player (4, 8)
    state.walls = [
      { orientation: 'h', x: 3, y: 7 },
      { orientation: 'v', x: 3, y: 7 },
    ];

    // Attempting to place the closing 3rd wall that seals them off completely
    const closeRes = reduceBarricade(
      state,
      { type: 'barricade_place_wall', actionId: 'w_trap', playerId: 'h1', orientation: 'v', x: 4, y: 7 },
      ctx,
    );
    expect(closeRes.ok).toBe(false);
    if (!closeRes.ok) {
      expect(closeRes.error.code).toBe(ErrorCode.WALL_TRAPS_PLAYER);
    }
  });
});
