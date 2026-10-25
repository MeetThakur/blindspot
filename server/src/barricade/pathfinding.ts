import type { Position, Wall } from '@whoami/shared';
import { BARRICADE_GRID_SIZE } from '@whoami/shared';

export const posKey = (p: Position): string => `${p.x},${p.y}`;

export function inBounds(p: Position, size = BARRICADE_GRID_SIZE): boolean {
  return p.x >= 0 && p.x < size && p.y >= 0 && p.y < size;
}

/**
 * Checks if a direct 1-step move from `from` to `to` is blocked by any wall.
 * Assumes `from` and `to` are orthogonal neighbors.
 */
export function isWallBlocked(from: Position, to: Position, walls: readonly Wall[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 1) {
    // Moving DOWN: from (x, y) to (x, y + 1)
    // Blocked if a horizontal wall is placed at (x, y) or (x - 1, y)
    return walls.some((w) => w.orientation === 'h' && w.y === from.y && (w.x === from.x || w.x === from.x - 1));
  }
  if (dx === 0 && dy === -1) {
    // Moving UP: from (x, y) to (x, y - 1)
    // Blocked if a horizontal wall is placed at (x, y - 1) or (x - 1, y - 1)
    return walls.some((w) => w.orientation === 'h' && w.y === from.y - 1 && (w.x === from.x || w.x === from.x - 1));
  }
  if (dy === 0 && dx === 1) {
    // Moving RIGHT: from (x, y) to (x + 1, y)
    // Blocked if a vertical wall is placed at (x, y) or (x, y - 1)
    return walls.some((w) => w.orientation === 'v' && w.x === from.x && (w.y === from.y || w.y === from.y - 1));
  }
  if (dy === 0 && dx === -1) {
    // Moving LEFT: from (x, y) to (x - 1, y)
    // Blocked if a vertical wall is placed at (x - 1, y) or (x - 1, y - 1)
    return walls.some((w) => w.orientation === 'v' && w.x === from.x - 1 && (w.y === from.y || w.y === from.y - 1));
  }

  return false;
}

/**
 * Validates wall geometry and collision against existing walls.
 */
export function isValidWallPlacement(
  newWall: Wall,
  existingWalls: readonly Wall[],
  size = BARRICADE_GRID_SIZE,
): { valid: boolean; reason?: string } {
  // Walls slots are 0 .. size - 2
  if (newWall.x < 0 || newWall.x >= size - 1 || newWall.y < 0 || newWall.y >= size - 1) {
    return { valid: false, reason: 'Wall is out of bounds.' };
  }

  for (const w of existingWalls) {
    // Cross intersection at the same slot
    if (w.x === newWall.x && w.y === newWall.y) {
      return { valid: false, reason: 'Wall overlaps or intersects with an existing wall.' };
    }

    // Horizontal overlap: wall is 2 units wide, so it conflicts if same orientation & row & within 1 column
    if (newWall.orientation === 'h' && w.orientation === 'h' && w.y === newWall.y) {
      if (Math.abs(w.x - newWall.x) <= 1) {
        return { valid: false, reason: 'Wall overlaps with an existing horizontal wall.' };
      }
    }

    // Vertical overlap: wall is 2 units tall, so it conflicts if same orientation & col & within 1 row
    if (newWall.orientation === 'v' && w.orientation === 'v' && w.x === newWall.x) {
      if (Math.abs(w.y - newWall.y) <= 1) {
        return { valid: false, reason: 'Wall overlaps with an existing vertical wall.' };
      }
    }
  }

  return { valid: true };
}

/**
 * Calculates all legal move destinations for a player.
 */
export function getValidMoves(
  playerPos: Position,
  allPlayers: readonly { id: string; position: Position }[],
  walls: readonly Wall[],
  size = BARRICADE_GRID_SIZE,
): Position[] {
  const occupied = new Set(allPlayers.map((p) => posKey(p.position)));
  const moves: Position[] = [];

  const orthogonal = [
    { x: 0, y: -1 }, // Up
    { x: 0, y: 1 },  // Down
    { x: -1, y: 0 }, // Left
    { x: 1, y: 0 },  // Right
  ];

  for (const step of orthogonal) {
    const next: Position = { x: playerPos.x + step.x, y: playerPos.y + step.y };
    if (!inBounds(next, size)) continue;
    if (isWallBlocked(playerPos, next, walls)) continue;

    if (!occupied.has(posKey(next))) {
      moves.push(next);
    } else {
      // An opponent is on this adjacent square: try jumping over them
      const straight: Position = { x: next.x + step.x, y: next.y + step.y };
      const straightBlocked =
        !inBounds(straight, size) ||
        isWallBlocked(next, straight, walls) ||
        occupied.has(posKey(straight));

      if (!straightBlocked) {
        moves.push(straight);
      } else {
        // Wall or boundary behind opponent: try diagonal jumps to sides of the opponent
        const sideSteps =
          step.x === 0
            ? [{ x: -1, y: 0 }, { x: 1, y: 0 }]
            : [{ x: 0, y: -1 }, { x: 0, y: 1 }];

        for (const side of sideSteps) {
          const diag: Position = { x: next.x + side.x, y: next.y + side.y };
          if (!inBounds(diag, size)) continue;
          if (isWallBlocked(next, diag, walls)) continue;
          if (occupied.has(posKey(diag))) continue;
          moves.push(diag);
        }
      }
    }
  }

  return moves;
}

/**
 * Breadth-First Search to verify if a path exists from `from` to `to`.
 */
export function hasPath(
  from: Position,
  to: Position,
  walls: readonly Wall[],
  size = BARRICADE_GRID_SIZE,
): boolean {
  if (from.x === to.x && from.y === to.y) return true;

  const queue: Position[] = [from];
  const visited = new Set<string>([posKey(from)]);

  const steps = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.x === to.x && curr.y === to.y) return true;

    for (const step of steps) {
      const next: Position = { x: curr.x + step.x, y: curr.y + step.y };
      if (!inBounds(next, size)) continue;
      const k = posKey(next);
      if (visited.has(k)) continue;
      if (isWallBlocked(curr, next, walls)) continue;

      visited.add(k);
      queue.push(next);
    }
  }

  return false;
}

/**
 * Checks whether all given players can reach the goal given the walls.
 */
export function canAllReachGoal(
  players: readonly { position: Position }[],
  goal: Position,
  walls: readonly Wall[],
  size = BARRICADE_GRID_SIZE,
): boolean {
  for (const p of players) {
    if (!hasPath(p.position, goal, walls, size)) {
      return false;
    }
  }
  return true;
}
