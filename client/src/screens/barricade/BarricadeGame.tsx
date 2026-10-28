import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BARRICADE_CENTER,
  BARRICADE_GRID_SIZE,
  BARRICADE_MAX_PLAYERS,
  BARRICADE_MIN_PLAYERS,
  BARRICADE_TURN_TIMEOUT_OPTIONS,
  type BarricadePlayer,
  type BarricadeSnapshot,
  type Position,
  type RoomSnapshot,
  type Wall,
} from '@whoami/shared';
import { useGame } from '../../lib/store';
import { HowToPlay, InviteCard, LobbyHeader, SettingsSummary } from '../../components/lobbyParts';

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
  const [wallsInput, setWallsInput] = useState(String(barricade.settings.barricadesPerPlayer));

  useEffect(() => {
    setWallsInput(String(barricade.settings.barricadesPerPlayer));
  }, [barricade.settings.barricadesPerPlayer]);

  const handleWallsChange = (valStr: string) => {
    setWallsInput(valStr);
    const n = parseInt(valStr, 10);
    if (!isNaN(n) && n >= 5 && n <= 10 && isHost) {
      client.updateBarricadeSettings({ barricadesPerPlayer: n });
    }
  };

  const handleWallsBlur = () => {
    const n = parseInt(wallsInput, 10);
    if (isNaN(n) || n < 5) {
      setWallsInput('5');
      if (isHost) client.updateBarricadeSettings({ barricadesPerPlayer: 5 });
    } else if (n > 10) {
      setWallsInput('10');
      if (isHost) client.updateBarricadeSettings({ barricadesPerPlayer: 10 });
    } else {
      setWallsInput(String(n));
      if (isHost) client.updateBarricadeSettings({ barricadesPerPlayer: n });
    }
  };

  const handleStepWalls = (delta: number) => {
    if (!isHost) return;
    const curr = barricade.settings.barricadesPerPlayer;
    const next = Math.max(5, Math.min(10, curr + delta));
    if (next !== curr) {
      client.updateBarricadeSettings({ barricadesPerPlayer: next });
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8">
      <LobbyHeader title="Barricade Lobby" onLeave={() => client.leave()} />
      <InviteCard code={snapshot.code} />

      <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
        {/* Players List */}
        <div className="card flex flex-col md:self-start">
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

          <div className="mt-4 grid gap-3">
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
                        {p.connected ? 'Online' : 'Reconnecting…'}
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
          <div className="mt-5 flex flex-col gap-2 border-t-2 border-border/30 pt-4">
            {isHost ? (
              <button
                type="button"
                className="btn-primary w-full py-3 text-lg"
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
          </div>
        </div>

        {/* Match Settings */}
        <div className="card flex flex-col gap-4 md:self-start">
          <h2 className="text-lg font-black border-b-2 border-border pb-2">Match Settings</h2>

          {!isHost && (
            <SettingsSummary
              rows={[
                ['Walls each', `${barricade.settings.barricadesPerPlayer}`],
                ['Turn timer', barricade.settings.turnTimeoutSec === null ? 'No timer' : `${barricade.settings.turnTimeoutSec}s`],
              ]}
            />
          )}

          {isHost && (
          <>
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Walls per player (5–10)
            </label>

            {/* Stepper with typed input */}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={!isHost || barricade.settings.barricadesPerPlayer <= 5}
                onClick={() => handleStepWalls(-1)}
                className="btn-secondary h-11 w-12 flex items-center justify-center text-xl font-black disabled:opacity-40"
                title="Decrease blocks"
              >
                −
              </button>
              <div className="relative flex-1">
                <input
                  type="number"
                  min={5}
                  max={10}
                  disabled={!isHost}
                  value={wallsInput}
                  onChange={(e) => handleWallsChange(e.target.value)}
                  onBlur={handleWallsBlur}
                  className="input-field text-center font-mono text-lg font-black h-11 w-full disabled:bg-surface-subtle"
                  placeholder="5-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft pointer-events-none">
                  walls
                </span>
              </div>
              <button
                type="button"
                disabled={!isHost || barricade.settings.barricadesPerPlayer >= 10}
                onClick={() => handleStepWalls(1)}
                className="btn-secondary h-11 w-12 flex items-center justify-center text-xl font-black disabled:opacity-40"
                title="Increase blocks"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink-soft">Each player starts with this many walls to block opponents.</p>
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
                  {t === null ? 'No timer' : `${t}s`}
                </button>
              ))}
            </div>
          </div>

          </>
          )}

          <HowToPlay>
            <ul className="list-disc space-y-1 pl-4">
              <li>Race to the golden crown at the center of the 11×11 board.</li>
              <li>Each turn: move 1 step (or jump over a neighbor), or place a 2-segment wall.</li>
              <li>Walls can never fully block anyone from the center.</li>
            </ul>
          </HowToPlay>
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
    <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:py-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(280px,1fr)] lg:items-start">
        <div className="order-2 lg:order-1">
      {/* 11x11 Tactical Grid Board */}
      <div className="card relative mx-auto w-full max-w-[520px] sm:max-w-[560px] p-3 sm:p-5 bg-surface shadow-[0_6px_0_0_var(--color-shadow)] border-3 border-border">
        {/* Column coordinate labels A - K */}
        <div className="grid grid-cols-11 pl-6 pr-1 text-center font-mono text-xs font-black text-ink-soft mb-1.5 select-none">
          {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((col, i) => (
            <span key={col} className={i === 5 ? 'text-amber font-black scale-110 inline-block' : ''}>
              {i === 5 ? 'F 👑' : col}
            </span>
          ))}
        </div>

        <div className="flex">
          {/* Row coordinate labels 1 - 11 */}
          <div className="grid grid-rows-11 pr-2 py-1 text-right font-mono text-xs font-black text-ink-soft select-none justify-center w-6">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].map((row, i) => (
              <span key={row} className={`flex items-center justify-end ${i === 5 ? 'text-amber font-black' : ''}`}>
                {row}
              </span>
            ))}
          </div>

          {/* Seamless Tactical Board */}
          <div className="relative aspect-square flex-1 rounded-2xl border-4 border-border overflow-hidden bg-[#F1F5F9] dark:bg-[#0B1120] select-none shadow-2xl">
            {/* 11x11 Grid Surface (Checkerboard style) */}
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: 'repeat(11, minmax(0, 1fr))',
                gridTemplateRows: 'repeat(11, minmax(0, 1fr))',
              }}
            >
              {Array.from({ length: 121 }).map((_, index) => {
                const x = index % 11;
                const y = Math.floor(index / 11);
                const isCenter = x === 5 && y === 5;
                const isEven = (x + y) % 2 === 0;
                const isValidDest = validMoves.some((m) => m.x === x && m.y === y);
                const playerOnCell = barricade.players.find((p) => p.position.x === x && p.position.y === y);
                const isYou = playerOnCell?.id === snapshot.youId;

                return (
                  <div
                    key={`${x}-${y}`}
                    data-x={x}
                    data-y={y}
                    onClick={() => handleCellClick(x, y)}
                    className={`relative flex items-center justify-center transition-colors border-r border-b border-border/20 last:border-r-0 ${
                      isCenter
                        ? 'bg-gradient-to-br from-amber/40 via-yellow-400/30 to-amber-600/30 ring-2 ring-inset ring-amber/70'
                        : isEven
                          ? 'bg-[#F8FAFC] dark:bg-[#1E293B]/70'
                          : 'bg-[#EDEFE9] dark:bg-[#141E33]/70'
                    } ${
                      isValidDest
                        ? 'cursor-pointer bg-mint/35 hover:bg-mint/55'
                        : ''
                    }`}
                  >
                    {/* Center Crown 👑 Tile */}
                    {isCenter && !playerOnCell && (
                      <div className="flex flex-col items-center justify-center pointer-events-none animate-pulse">
                        <span className="text-xl sm:text-2xl filter drop-shadow">👑</span>
                        <span className="text-[7px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                          GOAL
                        </span>
                      </div>
                    )}

                    {/* Move Destination Marker */}
                    {isValidDest && !playerOnCell && (
                      <div className="flex items-center justify-center pointer-events-none">
                        <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-mint/80 shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform group-hover:scale-125" />
                      </div>
                    )}

                    {/* Refined Player Pawn */}
                    {playerOnCell && (
                      <div className="relative flex items-center justify-center z-10 pointer-events-none">
                        <div
                          className={`relative flex h-7 w-7 sm:h-7.5 sm:w-7.5 items-center justify-center rounded-full border-2 border-white shadow-[0_2px_4px_rgba(0,0,0,0.4)] transition-all ${
                            playerOnCell.id === barricade.activeId
                              ? 'ring-2 ring-coral shadow-[0_0_10px_rgba(244,63,94,0.7)] scale-105'
                              : 'opacity-90'
                          }`}
                          style={{ backgroundColor: playerOnCell.color }}
                          title={`${playerOnCell.name} (${x}, ${y})`}
                        >
                          <span className="font-black text-[10px] sm:text-[11px] text-white tracking-tight drop-shadow">
                            {playerOnCell.name.slice(0, 2).toUpperCase()}
                          </span>

                          {/* Subtle "YOU" marker pip */}
                          {isYou && (
                            <div
                              className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-amber text-[7px] font-black text-ink shadow-sm"
                              title="Your pawn"
                            >
                              ★
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Placed Barricades (Rich Terracotta/Woodblock) */}
            <div className="absolute inset-0 pointer-events-none z-20">
              {barricade.walls.map((w, idx) => {
                const cellPercent = 100 / 11;
                if (w.orientation === 'h') {
                  const left = w.x * cellPercent;
                  const top = (w.y + 1) * cellPercent;
                  const width = cellPercent * 2;
                  return (
                    <div
                      key={`wall-h-${idx}`}
                      className="absolute h-3 sm:h-3.5 -translate-y-1/2 rounded-md border-2 border-amber-950 dark:border-amber-900 bg-amber-600 dark:bg-amber-500 shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
                      style={{
                        left: `calc(${left}% + 3px)`,
                        top: `${top}%`,
                        width: `calc(${width}% - 6px)`,
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
                      className="absolute w-3 sm:w-3.5 -translate-x-1/2 rounded-md border-2 border-amber-950 dark:border-amber-900 bg-amber-600 dark:bg-amber-500 shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
                      style={{
                        left: `${left}%`,
                        top: `calc(${top}% + 3px)`,
                        height: `calc(${height}% - 6px)`,
                      }}
                    />
                  );
                }
              })}
            </div>

            {/* Interactive Groove Intersections (10x10 = 100 points) */}
            {isYourTurn && mode === 'wall' && barricade.phase === 'PLAYING' && (
              <div className="absolute inset-0 z-30 pointer-events-auto">
                {Array.from({ length: 100 }).map((_, idx) => {
                  const gx = idx % 10;
                  const gy = Math.floor(idx / 10);
                  const cellPercent = 100 / 11;
                  const left = (gx + 1) * cellPercent;
                  const top = (gy + 1) * cellPercent;
                  const isHovered = hoverGroove?.x === gx && hoverGroove?.y === gy;

                  return (
                    <div
                      key={`groove-${gx}-${gy}`}
                      onMouseEnter={() => setHoverGroove({ x: gx, y: gy })}
                      onMouseLeave={() => setHoverGroove(null)}
                      onClick={() => handleGrooveClick(gx, gy)}
                      className="absolute -translate-x-1/2 -translate-y-1/2 h-8 w-8 sm:h-9 sm:w-9 cursor-pointer flex items-center justify-center group"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                      }}
                    >
                      {/* Subtle Intersection Crosshair */}
                      <div className="h-2 w-2 rounded-full bg-border/60 group-hover:bg-coral group-hover:scale-150 transition-all shadow" />

                      {/* Ghost Barricade Preview */}
                      {isHovered && (
                        <div
                          className={`absolute rounded-md border-2 border-dashed pointer-events-none z-40 ${
                            wallOrientation === 'h'
                              ? 'h-3 sm:h-3.5 -translate-y-1/2 bg-amber/80 border-amber-900 dark:border-amber-300 shadow-xl'
                              : 'w-3 sm:w-3.5 -translate-x-1/2 bg-amber/80 border-amber-900 dark:border-amber-300 shadow-xl'
                          }`}
                          style={
                            wallOrientation === 'h'
                              ? {
                                  left: 'calc(-50% - 2px)',
                                  width: `calc(${(200 / 11) * 4}px + 20px)`,
                                  minWidth: '55px',
                                }
                              : {
                                  top: 'calc(-50% - 2px)',
                                  height: `calc(${(200 / 11) * 4}px + 20px)`,
                                  minHeight: '55px',
                                }
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer info & controls */}
        <div className="mt-3 flex items-center justify-between text-xs text-ink-soft border-t border-border/40 pt-2">
          <div className="flex items-center gap-2">
            <span>Goal: Crown at <strong>F6 (5, 5)</strong></span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Grid: <strong>11×11 (121 tiles)</strong></span>
          </div>
          <button
            type="button"
            className="font-bold text-coral hover:underline"
            onClick={() => client.leave()}
          >
            Leave Match
          </button>
        </div>
      </div>

        </div>
        <div className="order-1 flex flex-col gap-3 lg:order-2 lg:sticky lg:top-20">
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
                  <span className="text-coral">Your turn</span>
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
              {timeLeft}s
            </div>
          )}
          <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-bold">
            Goal: F6 (5, 5)
          </span>
        </div>
      </div>

      {/* Players Barricade Inventory Cards */}
      <div className="grid grid-cols-2 gap-2">
        {barricade.players.map((p) => {
          const isActive = p.id === barricade.activeId;
          const isYou = p.id === snapshot.youId;
          return (
            <div
              key={p.id}
              className={`rounded-xl border-2 border-border p-2.5 transition-all shadow-[0_2px_0_0_var(--color-shadow)] ${
                isActive
                  ? 'bg-amber/20 ring-2 ring-coral'
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
                    {p.score} win{p.score === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="font-bold text-ink-soft">Walls left</span>
                <span className="font-black text-ink">{p.barricadesRemaining}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Mode Toggle (When It's Your Turn) */}
      {isYourTurn && barricade.phase === 'PLAYING' && (
        <div className="card flex flex-wrap items-center justify-between gap-3 bg-surface p-3.5 shadow-[0_3px_0_0_var(--color-shadow)] border-2 border-coral/40">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-ink-soft">Your action</span>
            <div className="inline-flex rounded-xl border-2 border-border p-1 bg-surface-subtle gap-1.5">
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-black transition-all whitespace-nowrap ${
                  mode === 'move'
                    ? 'bg-coral text-white shadow-[0_2px_0_0_var(--color-shadow)]'
                    : 'text-ink hover:text-coral'
                }`}
                onClick={() => setMode('move')}
              >
                Move pawn
              </button>
              <button
                type="button"
                disabled={!you || you.barricadesRemaining <= 0}
                className={`rounded-lg px-4 py-2 text-xs font-black transition-all whitespace-nowrap ${
                  mode === 'wall'
                    ? 'bg-coral text-white shadow-[0_2px_0_0_var(--color-shadow)]'
                    : 'text-ink hover:text-coral'
                } ${!you || you.barricadesRemaining <= 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => setMode('wall')}
              >
                Place wall ({you?.barricadesRemaining ?? 0} left)
              </button>
            </div>
          </div>

          {mode === 'wall' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-ink-soft">Orientation:</span>
              <div className="inline-flex rounded-lg border-2 border-border p-1 bg-surface-subtle gap-1.5">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-black transition-all whitespace-nowrap ${
                    wallOrientation === 'h' ? 'bg-amber text-ink shadow-[0_1px_0_0_var(--color-shadow)]' : 'text-ink'
                  }`}
                  onClick={() => setWallOrientation('h')}
                >
                  ↔ Horizontal
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-black transition-all whitespace-nowrap ${
                    wallOrientation === 'v' ? 'bg-amber text-ink shadow-[0_1px_0_0_var(--color-shadow)]' : 'text-ink'
                  }`}
                  onClick={() => setWallOrientation('v')}
                >
                  ↕ Vertical
                </button>
              </div>
              <span className="text-[11px] font-mono text-ink-soft bg-surface-subtle px-2 py-1 rounded border border-border whitespace-nowrap">
                Press <strong>R</strong> or <strong>Space</strong>
              </span>
            </div>
          )}
        </div>
      )}

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
