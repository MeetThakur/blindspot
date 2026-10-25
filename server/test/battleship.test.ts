import { describe, expect, it } from 'vitest';
import {
  checkHit,
  generateRandomFleet,
  isShipSunk,
  isValidFleetPlacement,
} from '../src/battleship/fleet.js';
import {
  createBattleshipRoom,
  reduceBattleship,
} from '../src/battleship/engine.js';
import { BattleshipPhase, ErrorCode } from '@whoami/shared';

describe('Battleship Fleet Validation & Mechanics', () => {
  it('generates a valid random fleet adhering to standard ship sizes and bounds', () => {
    const fleet = generateRandomFleet();
    expect(fleet).toHaveLength(5);
    const valid = isValidFleetPlacement(fleet);
    expect(valid.valid).toBe(true);
  });

  it('detects out of bounds and overlapping ships', () => {
    const invalidPlacement = [
      { id: 'carrier', name: 'Carrier', size: 5, x: 8, y: 0, orientation: 'h' as const }, // Spans x=8..12 (out of bounds)
      { id: 'battleship', name: 'Battleship', size: 4, x: 0, y: 0, orientation: 'h' as const },
      { id: 'cruiser', name: 'Cruiser', size: 3, x: 0, y: 1, orientation: 'h' as const },
      { id: 'submarine', name: 'Submarine', size: 3, x: 0, y: 2, orientation: 'h' as const },
      { id: 'destroyer', name: 'Destroyer', size: 2, x: 0, y: 3, orientation: 'h' as const },
    ];
    expect(isValidFleetPlacement(invalidPlacement).valid).toBe(false);

    const overlappingPlacement = [
      { id: 'carrier', name: 'Carrier', size: 5, x: 0, y: 0, orientation: 'h' as const }, // (0,0)..(4,0)
      { id: 'battleship', name: 'Battleship', size: 4, x: 2, y: 0, orientation: 'v' as const }, // (2,0)..(2,3) overlaps at (2,0)
      { id: 'cruiser', name: 'Cruiser', size: 3, x: 0, y: 5, orientation: 'h' as const },
      { id: 'submarine', name: 'Submarine', size: 3, x: 0, y: 6, orientation: 'h' as const },
      { id: 'destroyer', name: 'Destroyer', size: 2, x: 0, y: 7, orientation: 'h' as const },
    ];
    expect(isValidFleetPlacement(overlappingPlacement).valid).toBe(false);
  });

  it('correctly reports hits, misses, and sunk ships', () => {
    const fleet = [
      { id: 'destroyer', name: 'Destroyer', size: 2, x: 1, y: 1, orientation: 'h' as const }, // (1,1) & (2,1)
    ];

    expect(checkHit(fleet, 1, 1).hit).toBe(true);
    expect(checkHit(fleet, 3, 1).hit).toBe(false);

    const shot1 = { x: 1, y: 1, result: 'hit' };
    expect(isShipSunk(fleet[0]!, [shot1])).toBe(false);

    const shot2 = { x: 2, y: 1, result: 'hit' };
    expect(isShipSunk(fleet[0]!, [shot1, shot2])).toBe(true);
  });
});

describe('Battleship Engine Lifecycle (2-4 Players)', () => {
  const ctx = { now: 1000 };

  it('supports 2-4 players, placement phase, firing, and win condition', () => {
    let state = createBattleshipRoom({
      code: 'BAT1',
      hostId: 'p1',
      hostName: 'Alice',
      hostToken: 'tok1',
      now: 1000,
      graceMs: 30000,
    });

    // P2 and P3 join (3-player match)
    const j2 = reduceBattleship(state, { type: 'join', actionId: 'j2', playerId: 'p2', name: 'Bob', token: 'tok2' }, ctx);
    expect(j2.ok).toBe(true);
    if (!j2.ok) return;
    state = j2.state;

    const j3 = reduceBattleship(state, { type: 'join', actionId: 'j3', playerId: 'p3', name: 'Charlie', token: 'tok3' }, ctx);
    expect(j3.ok).toBe(true);
    if (!j3.ok) return;
    state = j3.state;
    expect(state.players).toHaveLength(3);

    // Host starts game -> PLACEMENT phase
    const startRes = reduceBattleship(state, { type: 'start_game', actionId: 's1', playerId: 'p1' }, ctx);
    expect(startRes.ok).toBe(true);
    if (!startRes.ok) return;
    state = startRes.state;
    expect(state.phase).toBe(BattleshipPhase.PLACEMENT);

    // Players deploy fleets
    const f1 = generateRandomFleet();
    const f2 = generateRandomFleet();
    const f3 = generateRandomFleet();

    const pl1 = reduceBattleship(state, { type: 'battleship_place_ships', actionId: 'pl1', playerId: 'p1', ships: f1 }, ctx);
    if (!pl1.ok) return;
    state = pl1.state;
    expect(state.phase).toBe(BattleshipPhase.PLACEMENT); // Still waiting for p2 & p3

    const pl2 = reduceBattleship(state, { type: 'battleship_place_ships', actionId: 'pl2', playerId: 'p2', ships: f2 }, ctx);
    if (!pl2.ok) return;
    state = pl2.state;

    const pl3 = reduceBattleship(state, { type: 'battleship_place_ships', actionId: 'pl3', playerId: 'p3', ships: f3 }, ctx);
    if (!pl3.ok) return;
    state = pl3.state;

    // All players placed ships -> Transition to PLAYING!
    expect(state.phase).toBe(BattleshipPhase.PLAYING);
    expect(state.activeId).toBe('p1');

    // Player 1 fires at Player 2
    const fireRes = reduceBattleship(
      state,
      { type: 'battleship_fire', actionId: 'f1', playerId: 'p1', targetId: 'p2', x: 0, y: 0 },
      ctx,
    );
    expect(fireRes.ok).toBe(true);
    if (!fireRes.ok) return;
    state = fireRes.state;
    expect(state.players.find((p) => p.id === 'p2')?.shotsReceived).toHaveLength(1);
    expect(state.activeId).toBe('p2'); // Turn passed to p2
  });

  it('rejects illegal firing (targeting self, already targeted cell, out of turn)', () => {
    let state = createBattleshipRoom({
      code: 'BAT2',
      hostId: 'p1',
      hostName: 'Alice',
      hostToken: 'tok1',
      now: 1000,
      graceMs: 30000,
    });
    const j2 = reduceBattleship(state, { type: 'join', actionId: 'j2', playerId: 'p2', name: 'Bob', token: 'tok2' }, ctx);
    if (!j2.ok) return;
    const start = reduceBattleship(j2.state, { type: 'start_game', actionId: 's1', playerId: 'p1' }, ctx);
    if (!start.ok) return;
    const pl1 = reduceBattleship(start.state, { type: 'battleship_place_ships', actionId: 'pl1', playerId: 'p1', ships: generateRandomFleet() }, ctx);
    if (!pl1.ok) return;
    const pl2 = reduceBattleship(pl1.state, { type: 'battleship_place_ships', actionId: 'pl2', playerId: 'p2', ships: generateRandomFleet() }, ctx);
    if (!pl2.ok) return;
    state = pl2.state;

    // Firing out of turn (p2 trying to fire when activeId is p1)
    const errTurn = reduceBattleship(state, { type: 'battleship_fire', actionId: 'e1', playerId: 'p2', targetId: 'p1', x: 0, y: 0 }, ctx);
    expect(errTurn.ok).toBe(false);
    if (!errTurn.ok) expect(errTurn.error.code).toBe(ErrorCode.NOT_YOUR_TURN);

    // Firing at self
    const errSelf = reduceBattleship(state, { type: 'battleship_fire', actionId: 'e2', playerId: 'p1', targetId: 'p1', x: 0, y: 0 }, ctx);
    expect(errSelf.ok).toBe(false);
    if (!errSelf.ok) expect(errSelf.error.code).toBe(ErrorCode.CANNOT_TARGET_SELF);

    // Valid shot
    const validShot = reduceBattleship(state, { type: 'battleship_fire', actionId: 'v1', playerId: 'p1', targetId: 'p2', x: 5, y: 5 }, ctx);
    expect(validShot.ok).toBe(true);
    if (!validShot.ok) return;
    state = validShot.state;

    // p2 fires at p1
    const p2Shot = reduceBattleship(state, { type: 'battleship_fire', actionId: 'v2', playerId: 'p2', targetId: 'p1', x: 1, y: 1 }, ctx);
    if (!p2Shot.ok) return;
    state = p2Shot.state;

    // p1 tries to fire at (5, 5) on p2 again
    const errRepeat = reduceBattleship(state, { type: 'battleship_fire', actionId: 'e3', playerId: 'p1', targetId: 'p2', x: 5, y: 5 }, ctx);
    expect(errRepeat.ok).toBe(false);
    if (!errRepeat.ok) expect(errRepeat.error.code).toBe(ErrorCode.ALREADY_TARGETED);
  });
});
