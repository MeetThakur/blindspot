import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BARRICADE_CENTER,
  BARRICADE_GRID_SIZE,
  BARRICADE_MAX_PLAYERS,
  BARRICADE_MIN_PLAYERS,
  BARRICADE_WALL_OPTIONS,
  BARRICADE_TURN_TIMEOUT_OPTIONS,
  type BarricadePlayer,
  type BarricadeSnapshot,
  type Position,
  type RoomSnapshot,
  type Wall,
} from '@whoami/shared';
import { useGame } from '../../lib/store';
import { CopyButton } from '../../components/ui';
import { inviteLink } from '../../lib/view';

// -------------------------------------------------------------
// Helper: local valid moves calculation for instantaneous UI
// -------------------------------------------------------------
function isWallBlockedLocal(from: Position, to: Position, walls: readonly Wall[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 1) {
    return walls.some((w) => w.orientation === 'h' && w.y === from.y && (w.x === from.x || w.x === from.x - 1));
  }
  if (dx === 0 && dy === -1) {
    return walls.some((w) => w.orientation === 'h' && w.y === from.y - 1 && (w.x === from.x || w.x === from.x - 1));
  }
  if (dy === 0 && dx === 1) {
    return walls.some((w) => w.orientation === 'v' && w.x === from.x && (w.y === from.y || w.y === from.y - 1));
  }
  if (dy === 0 && dx === -1) {
    return walls.some((w) => w.orientation === 'v' && w.x === from.x - 1 && (w.y === from.y || w.y === from.y - 1));
  }
  return false;
}

function inBounds(p: Position): boolean {
  return p.x >= 0 && p.x < BARRICADE_GRID_SIZE && p.y >= 0 && p.y < BARRICADE_GRID_SIZE;
}

function getValidMovesLocal(
  playerPos: Position,
  players: readonly BarricadePlayer[],
  walls: readonly Wall[],
): Position[] {
  const occupied = new Set(players.map((p) => `${p.position.x},${p.position.y}`));
  const moves: Position[] = [];

  const orthogonal = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  for (const step of orthogonal) {
    const next = { x: playerPos.x + step.x, y: playerPos.y + step.y };
    if (!inBounds(next)) continue;
    if (isWallBlockedLocal(playerPos, next, walls)) continue;

    if (!occupied.has(`${next.x},${next.y}`)) {
      moves.push(next);
    } else {
      // Jump
      const straight = { x: next.x + step.x, y: next.y + step.y };
      const straightBlocked =
        !inBounds(straight) ||
        isWallBlockedLocal(next, straight, walls) ||
        occupied.has(`${straight.x},${straight.y}`);

      if (!straightBlocked) {
        moves.push(straight);
      } else {
        const sideSteps =
          step.x === 0
            ? [{ x: -1, y: 0 }, { x: 1, y: 0 }]
            : [{ x: 0, y: -1 }, { x: 0, y: 1 }];

        for (const side of sideSteps) {
          const diag = { x: next.x + side.x, y: next.y + side.y };
          if (!inBounds(diag)) continue;
          if (isWallBlockedLocal(next, diag, walls)) continue;
          if (occupied.has(`${diag.x},${diag.y}`)) continue;
          moves.push(diag);
        }
      }
    }
  }

  return moves;
}

// -------------------------------------------------------------
// Barricade Screen (Lobby vs Board)
// -------------------------------------------------------------
export function BarricadeScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const barricade = snapshot.barricade;
  if (!barricade) return null;

  if (barricade.phase === 'LOBBY') {
    return <BarricadeLobby snapshot={snapshot} barricade={barricade} />;
  }

  return <BarricadeBoard snapshot={snapshot} barricade={barricade} />;
}

// -------------------------------------------------------------
// Barricade Lobby
// -------------------------------------------------------------
function BarricadeLobby({
  snapshot,
  barricade,
}: {
  snapshot: RoomSnapshot;
  barricade: BarricadeSnapshot;
}) {
  const { client } = useGame();
  const isHost = snapshot.hostId === snapshot.youId;
  const players = barricade.players;
  const canStart = isHost && players.length >= BARRICADE_MIN_PLAYERS;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      {/* Top Banner */}
      <div className="card flex flex-col items-center justify-between gap-4 sm:flex-row bg-surface">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black">🏰 BARRICADE</span>
            <span className="rounded-full bg-amber/30 px-2.5 py-0.5 text-xs font-black uppercase text-ink">
              King of the Hill
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            2–4 players race to reach the center crown at (4, 4). Place barricades to outmaneuver rivals!
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Room Code</p>
            <p className="font-mono text-2xl font-black tracking-widest text-coral">{snapshot.code}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <CopyButton text={snapshot.code} label="Copy code" className="btn-secondary py-1 text-xs" />
            <CopyButton
              text={inviteLink(window.location.origin, snapshot.code)}
              label="Copy invite link"
              className="btn-primary py-1 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Players List */}
        <div className="card md:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b-2 border-border">
            <h2 className="text-lg font-black">
              Players ({players.length}/{BARRICADE_MAX_PLAYERS})
            </h2>
            <span className="text-xs font-bold text-ink-soft">
              {players.length < BARRICADE_MIN_PLAYERS
                ? `Need ${BARRICADE_MIN_PLAYERS - players.length} more`
                : 'Ready to play'}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {players.map((p, idx) => {
              const isYou = p.id === snapshot.youId;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border-2 border-border p-3 shadow-[0_2px_0_0_var(--color-shadow)] bg-surface"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-border font-black text-white shadow-[0_2px_0_0_var(--color-shadow)]"
                      style={{ backgroundColor: p.color }}
                    >
                      P{idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 font-black">
                        <span>{p.name}</span>
                        {isYou && (
                          <span className="rounded bg-coral px-1 py-0.2 text-[10px] font-black text-white">
                            YOU
                          </span>
                        )}
                        {p.isHost && (
                          <span className="rounded bg-amber px-1 py-0.2 text-[10px] font-black text-ink">
                            HOST
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-soft">
                        {p.connected ? '🟢 Connected' : '⚪ Disconnected'}
                      </p>
                    </div>
                  </div>
                  {isHost && !isYou && (
                    <button
                      type="button"
                      className="text-xs font-bold text-blush hover:underline"
                      onClick={() => client.kick(p.id)}
                    >
                      Kick
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {isHost ? (
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={!canStart}
                onClick={() => client.startGame()}
              >
                {players.length < BARRICADE_MIN_PLAYERS
                  ? `Waiting for players (${players.length}/${BARRICADE_MIN_PLAYERS})`
                  : 'Start Barricade Game'}
              </button>
            ) : (
              <div className="flex-1 rounded-xl border-2 border-border bg-surface-subtle p-3 text-center text-sm font-bold text-ink-soft">
                Waiting for the host to start the match…
              </div>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => client.leave()}
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* Match Settings */}
        <div className="card flex flex-col gap-4">
          <h2 className="text-lg font-black border-b-2 border-border pb-2">Match Settings</h2>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Barricades per Player
            </label>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {BARRICADE_WALL_OPTIONS.map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={!isHost}
                  onClick={() => client.updateBarricadeSettings({ barricadesPerPlayer: num })}
                  className={`rounded-lg border-2 border-border py-1.5 text-xs font-black transition-all ${
                    barricade.settings.barricadesPerPlayer === num
                      ? 'bg-ink text-paper shadow-[0_2px_0_0_var(--color-shadow)]'
                      : 'bg-surface hover:bg-surface-subtle text-ink'
                  } ${!isHost ? 'cursor-default opacity-80' : ''}`}
                >
                  🧱 {num}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-soft">
              Each player gets this many walls to place during the race.
            </p>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Turn Timer
            </label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {BARRICADE_TURN_TIMEOUT_OPTIONS.map((t) => (
                <button
                  key={String(t)}
                  type="button"
                  disabled={!isHost}
                  onClick={() => client.updateBarricadeSettings({ turnTimeoutSec: t })}
                  className={`rounded-lg border-2 border-border py-1.5 text-xs font-black transition-all ${
                    barricade.settings.turnTimeoutSec === t
                      ? 'bg-ink text-paper shadow-[0_2px_0_0_var(--color-shadow)]'
                      : 'bg-surface hover:bg-surface-subtle text-ink'
                  } ${!isHost ? 'cursor-default opacity-80' : ''}`}
                >
                  {t === null ? 'No timer' : `⏱ ${t}s`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-amber/20 p-3 text-xs text-ink-soft mt-auto">
            <p className="font-bold text-ink">💡 Barricade Rules:</p>
            <ul className="mt-1 list-disc pl-4 space-y-1">
              <li>Move 1 step orthogonally or jump over opponents.</li>
              <li>Or place a 2-segment wall between grid lines.</li>
              <li>Walls cannot completely block any player from center.</li>
              <li>First pawn to step on the golden crown at (4, 4) wins!</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}

// -------------------------------------------------------------
// Barricade Tactical Board
// -------------------------------------------------------------
function BarricadeBoard({
  snapshot,
  barricade,
}: {
  snapshot: RoomSnapshot;
  barricade: BarricadeSnapshot;
}) {
  const { client } = useGame();
  const [mode, setMode] = useState<'move' | 'wall'>('move');
  const [wallOrientation, setWallOrientation] = useState<'h' | 'v'>('h');
  const [hoverGroove, setHoverGroove] = useState<Position | null>(null);

  const isYourTurn = barricade.activeId === snapshot.youId;
  const isHost = snapshot.hostId === snapshot.youId;
  const you = barricade.players.find((p) => p.id === snapshot.youId);
  const activePlayer = barricade.players.find((p) => p.id === barricade.activeId);
  const winner = barricade.winnerId
    ? barricade.players.find((p) => p.id === barricade.winnerId)
    : null;

  // Keybind to toggle wall orientation (R or Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
        if (mode === 'wall') {
          e.preventDefault();
          setWallOrientation((prev) => (prev === 'h' ? 'v' : 'h'));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  // Valid moves for viewer
  const validMoves = useMemo(() => {
    if (!isYourTurn || !you || barricade.phase !== 'PLAYING') return [];
    return getValidMovesLocal(you.position, barricade.players, barricade.walls);
  }, [isYourTurn, you, barricade.players, barricade.walls, barricade.phase]);

  // Turn timer countdown
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!barricade.timer?.deadline) {
      setTimeLeft(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((barricade.timer!.deadline! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [barricade.timer?.deadline]);

  // Handle cell click
  const handleCellClick = (x: number, y: number) => {
    if (!isYourTurn || barricade.phase !== 'PLAYING') return;
    if (mode === 'move') {
      const isLegal = validMoves.some((m) => m.x === x && m.y === y);
      if (isLegal) {
        client.barricadeMove(x, y);
      }
    }
  };

  // Handle groove click for wall placement
  const handleGrooveClick = (gx: number, gy: number) => {
    if (!isYourTurn || barricade.phase !== 'PLAYING' || mode !== 'wall') return;
    if (!you || you.barricadesRemaining <= 0) return;
    client.barricadePlaceWall(wallOrientation, gx, gy);
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:py-6">
      {/* Top Turn & Status Banner */}
      <div className="card flex flex-wrap items-center justify-between gap-3 bg-surface p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border bg-amber text-xl shadow-[0_2px_0_0_var(--color-shadow)]">
            👑
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black sm:text-lg">
                {isYourTurn ? (
                  <span className="text-coral animate-pulse">👉 YOUR TURN!</span>
                ) : (
                  <span>{activePlayer?.name}'s Turn</span>
                )}
              </span>
              <span className="text-xs font-bold text-ink-soft">Turn #{barricade.turnCount}</span>
            </div>
            <p className="text-xs text-ink-soft">
              {isYourTurn
                ? mode === 'move'
                  ? 'Click a highlighted neighbor tile to advance towards the center.'
                  : `Hover and click between tiles to place a ${wallOrientation === 'h' ? 'horizontal' : 'vertical'} wall.`
                : `Waiting for ${activePlayer?.name} to act...`}
            </p>
          </div>
        </div>

        {/* Turn countdown & game phase */}
        <div className="flex items-center gap-2">
          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1.5 rounded-full border-2 border-border px-3 py-1 font-mono text-xs font-black shadow-[0_2px_0_0_var(--color-shadow)] ${
                timeLeft <= 5 ? 'bg-blush text-white animate-bounce' : 'bg-surface text-ink'
              }`}
            >
              ⏱ {timeLeft}s
            </div>
          )}
          <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-bold">
            Goal: (4, 4)
          </span>
        </div>
      </div>

      {/* Players Barricade Inventory Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {barricade.players.map((p) => {
          const isActive = p.id === barricade.activeId;
          const isYou = p.id === snapshot.youId;
          return (
            <div
              key={p.id}
              className={`rounded-xl border-2 border-border p-2.5 transition-all shadow-[0_2px_0_0_var(--color-shadow)] ${
                isActive
                  ? 'bg-amber/20 ring-2 ring-coral scale-[1.02]'
                  : 'bg-surface'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-ink"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="truncate text-xs font-black">
                    {p.name} {isYou && '(You)'}
                  </span>
                </div>
                {p.score > 0 && (
                  <span className="text-[10px] font-black text-amber bg-surface px-1 rounded border border-border">
                    🏆 {p.score}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="font-bold text-ink-soft">Barricades</span>
                <span className="font-black text-ink">🧱 {p.barricadesRemaining}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Mode Toggle (When It's Your Turn) */}
      {isYourTurn && barricade.phase === 'PLAYING' && (
        <div className="card flex flex-wrap items-center justify-between gap-3 bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase text-ink-soft">Choose Action:</span>
            <div className="inline-flex rounded-xl border-2 border-border p-0.5 bg-surface-subtle">
              <button
                type="button"
                className={`rounded-lg px-3 py-1 text-xs font-black transition-all ${
                  mode === 'move'
                    ? 'bg-coral text-white shadow-[0_2px_0_0_var(--color-shadow)]'
                    : 'text-ink hover:text-coral'
                }`}
                onClick={() => setMode('move')}
              >
                🚶 Move Pawn
              </button>
              <button
                type="button"
                disabled={!you || you.barricadesRemaining <= 0}
                className={`rounded-lg px-3 py-1 text-xs font-black transition-all ${
                  mode === 'wall'
                    ? 'bg-coral text-white shadow-[0_2px_0_0_var(--color-shadow)]'
                    : 'text-ink hover:text-coral'
                } ${!you || you.barricadesRemaining <= 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => setMode('wall')}
              >
                🧱 Place Wall ({you?.barricadesRemaining ?? 0})
              </button>
            </div>
          </div>

          {mode === 'wall' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-soft">Orientation:</span>
              <button
                type="button"
                className="btn-secondary py-1 px-3 text-xs"
                onClick={() => setWallOrientation((prev) => (prev === 'h' ? 'v' : 'h'))}
              >
                {wallOrientation === 'h' ? '↔ Horizontal' : '↕ Vertical'}{' '}
                <span className="text-[10px] text-ink-soft">(Press 'R' to flip)</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 9x9 Tactical Grid Board */}
      <div className="card relative mx-auto w-full max-w-[480px] p-3 sm:p-4 bg-surface shadow-[0_6px_0_0_var(--color-shadow)]">
        {/* Board Container */}
        <div className="relative aspect-square w-full rounded-xl border-4 border-border bg-[#F8FAFC] dark:bg-[#0F172A] p-2 select-none">
          {/* 9x9 Grid Cells */}
          <div
            className="grid h-full w-full gap-1.5"
            style={{
              gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(9, minmax(0, 1fr))',
            }}
          >
            {Array.from({ length: 81 }).map((_, index) => {
              const x = index % 9;
              const y = Math.floor(index / 9);
              const isCenter = x === BARRICADE_CENTER && y === BARRICADE_CENTER;
              const isValidDest = validMoves.some((m) => m.x === x && m.y === y);
              const playerOnCell = barricade.players.find((p) => p.position.x === x && p.position.y === y);

              return (
                <div
                  key={`${x}-${y}`}
                  data-x={x}
                  data-y={y}
                  onClick={() => handleCellClick(x, y)}
                  className={`relative flex items-center justify-center rounded-lg border-2 transition-all ${
                    isCenter
                      ? 'border-amber bg-amber/30 shadow-inner'
                      : 'border-border/40 bg-surface'
                  } ${
                    isValidDest
                      ? 'cursor-pointer border-mint bg-mint/30 ring-2 ring-mint ring-offset-1 animate-pulse hover:bg-mint/50'
                      : ''
                  }`}
                >
                  {/* Center Crown 👑 */}
                  {isCenter && !playerOnCell && (
                    <span className="text-xl sm:text-2xl filter drop-shadow">👑</span>
                  )}

                  {/* Move destination dot */}
                  {isValidDest && !playerOnCell && (
                    <div className="h-2.5 w-2.5 rounded-full bg-mint shadow" />
                  )}

                  {/* Player Pawn */}
                  {playerOnCell && (
                    <div
                      className={`relative z-10 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border-2 border-border font-black text-white text-xs shadow-[0_2px_0_0_var(--color-shadow)] transition-transform ${
                        playerOnCell.id === barricade.activeId ? 'scale-110 ring-2 ring-coral' : ''
                      }`}
                      style={{ backgroundColor: playerOnCell.color }}
                      title={`${playerOnCell.name} (${x}, ${y})`}
                    >
                      {playerOnCell.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Render Placed Walls */}
          {barricade.walls.map((w, idx) => {
            // A horizontal wall at (x, y) sits between row y and y+1, spanning col x and col x+1
            // 9 columns each take (100% - 8 * gap) / 9
            // Using percentage coordinates:
            // x percent: (w.x / 9) * 100%
            // y percent: ((w.y + 1) / 9) * 100%
            const cellPercent = 100 / 9;
            if (w.orientation === 'h') {
              const left = w.x * cellPercent;
              const top = (w.y + 1) * cellPercent;
              const width = cellPercent * 2;
              return (
                <div
                  key={`wall-h-${idx}`}
                  className="absolute z-20 h-2 -translate-y-1 rounded border border-ink bg-[#1E293B] dark:bg-[#E2E8F0] shadow-[0_1px_2px_rgba(0,0,0,0.5)] pointer-events-none"
                  style={{
                    left: `calc(${left}% + 6px)`,
                    top: `${top}%`,
                    width: `calc(${width}% - 12px)`,
                  }}
                />
              );
            } else {
              const left = (w.x + 1) * cellPercent;
              const top = w.y * cellPercent;
              const height = cellPercent * 2;
              return (
                <div
                  key={`wall-v-${idx}`}
                  className="absolute z-20 w-2 -translate-x-1 rounded border border-ink bg-[#1E293B] dark:bg-[#E2E8F0] shadow-[0_1px_2px_rgba(0,0,0,0.5)] pointer-events-none"
                  style={{
                    left: `${left}%`,
                    top: `calc(${top}% + 6px)`,
                    height: `calc(${height}% - 12px)`,
                  }}
                />
              );
            }
          })}

          {/* Interactive Groove Overlay (For Placing Barricades) */}
          {isYourTurn && mode === 'wall' && barricade.phase === 'PLAYING' && (
            <div className="absolute inset-2 z-30 pointer-events-auto">
              {Array.from({ length: 64 }).map((_, idx) => {
                const gx = idx % 8;
                const gy = Math.floor(idx / 8);
                const cellPercent = 100 / 9;
                const left = (gx + 1) * cellPercent;
                const top = (gy + 1) * cellPercent;
                const isHovered = hoverGroove?.x === gx && hoverGroove?.y === gy;

                return (
                  <div
                    key={`groove-${gx}-${gy}`}
                    onMouseEnter={() => setHoverGroove({ x: gx, y: gy })}
                    onMouseLeave={() => setHoverGroove(null)}
                    onClick={() => handleGrooveClick(gx, gy)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 cursor-pointer flex items-center justify-center group"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                    }}
                  >
                    {/* Intersection marker */}
                    <div className="h-2 w-2 rounded-full bg-border/40 group-hover:bg-coral group-hover:scale-150 transition-all" />

                    {/* Ghost preview wall */}
                    {isHovered && (
                      <div
                        className={`absolute rounded border-2 border-dashed pointer-events-none ${
                          wallOrientation === 'h'
                            ? 'h-2.5 w-20 -translate-y-0.5 bg-amber/70 border-amber shadow-lg'
                            : 'w-2.5 h-20 -translate-x-0.5 bg-amber/70 border-amber shadow-lg'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="mt-3 flex items-center justify-between text-xs text-ink-soft">
          <span>Center Crown: <strong>(4, 4)</strong></span>
          <button
            type="button"
            className="font-bold text-coral hover:underline"
            onClick={() => client.leave()}
          >
            Leave Match
          </button>
        </div>
      </div>

      {/* Victory Modal */}
      {barricade.phase === 'GAME_OVER' && winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="card mx-auto w-full max-w-md text-center bg-surface shadow-2xl border-4 border-amber">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-border bg-amber text-4xl shadow-[0_4px_0_0_var(--color-shadow)]">
              👑
            </div>
            <h2 className="mt-4 text-3xl font-black">KING OF THE HILL!</h2>
            <p className="mt-2 text-lg">
              <strong className="text-coral" style={{ color: winner.color }}>
                {winner.name}
              </strong>{' '}
              reached the center first!
            </p>
            <p className="text-xs text-ink-soft mt-1">
              Completed in {winner.movesCount} moves with {winner.wallsPlaced} barricades placed.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {isHost ? (
                <>
                  <button
                    type="button"
                    className="btn-primary w-full"
                    onClick={() => client.restartRound()}
                  >
                    Play Again (Rematch)
                  </button>
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => client.returnToLobby()}
                  >
                    Return to Lobby
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-ink-soft">
                    Waiting for the host to restart or return to lobby…
                  </p>
                  <button
                    type="button"
                    className="btn-secondary w-full mt-2"
                    onClick={() => client.leave()}
                  >
                    Leave Room
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
