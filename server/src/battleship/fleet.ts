import {
  BATTLESHIP_FLEET_DEF,
  BATTLESHIP_GRID_SIZE,
  type BattleshipShipPlacement,
  type Position,
} from '@whoami/shared';

export function getShipCells(ship: BattleshipShipPlacement): Position[] {
  const cells: Position[] = [];
  for (let i = 0; i < ship.size; i++) {
    cells.push({
      x: ship.orientation === 'h' ? ship.x + i : ship.x,
      y: ship.orientation === 'v' ? ship.y + i : ship.y,
    });
  }
  return cells;
}

export function isValidFleetPlacement(
  ships: readonly BattleshipShipPlacement[],
  gridSize = BATTLESHIP_GRID_SIZE,
): { valid: boolean; reason?: string } {
  // Check ship count
  if (ships.length !== BATTLESHIP_FLEET_DEF.length) {
    return { valid: false, reason: `Must place all ${BATTLESHIP_FLEET_DEF.length} ships.` };
  }

  // Check each ship matches fleet definition
  for (const def of BATTLESHIP_FLEET_DEF) {
    const found = ships.find((s) => s.id === def.id && s.size === def.size);
    if (!found) {
      return { valid: false, reason: `Missing ship ${def.name} of size ${def.size}.` };
    }
  }

  const occupied = new Set<string>();

  for (const ship of ships) {
    const cells = getShipCells(ship);
    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= gridSize || cell.y < 0 || cell.y >= gridSize) {
        return { valid: false, reason: `${ship.name} goes outside the grid boundary.` };
      }
      const key = `${cell.x},${cell.y}`;
      if (occupied.has(key)) {
        return { valid: false, reason: `Ships cannot overlap each other.` };
      }
      occupied.add(key);
    }
  }

  return { valid: true };
}

export function generateRandomFleet(gridSize = BATTLESHIP_GRID_SIZE): BattleshipShipPlacement[] {
  const ships: BattleshipShipPlacement[] = [];
  const occupied = new Set<string>();

  for (const def of BATTLESHIP_FLEET_DEF) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 500) {
      attempts++;
      const orientation: 'h' | 'v' = Math.random() < 0.5 ? 'h' : 'v';
      const maxX = orientation === 'h' ? gridSize - def.size : gridSize - 1;
      const maxY = orientation === 'v' ? gridSize - def.size : gridSize - 1;
      const x = Math.floor(Math.random() * (maxX + 1));
      const y = Math.floor(Math.random() * (maxY + 1));

      const candidate: BattleshipShipPlacement = {
        id: def.id,
        name: def.name,
        size: def.size,
        x,
        y,
        orientation,
      };

      const cells = getShipCells(candidate);
      const overlaps = cells.some((c) => occupied.has(`${c.x},${c.y}`));

      if (!overlaps) {
        for (const c of cells) {
          occupied.add(`${c.x},${c.y}`);
        }
        ships.push(candidate);
        placed = true;
      }
    }
  }

  return ships;
}

export function checkHit(
  targetShips: readonly BattleshipShipPlacement[],
  x: number,
  y: number,
): { hit: boolean; ship?: BattleshipShipPlacement } {
  for (const ship of targetShips) {
    const cells = getShipCells(ship);
    if (cells.some((c) => c.x === x && c.y === y)) {
      return { hit: true, ship };
    }
  }
  return { hit: false };
}

export function isShipSunk(
  ship: BattleshipShipPlacement,
  shotsReceived: readonly { x: number; y: number; result: string }[],
): boolean {
  const cells = getShipCells(ship);
  return cells.every((c) =>
    shotsReceived.some((s) => s.x === c.x && s.y === c.y && s.result === 'hit'),
  );
}
