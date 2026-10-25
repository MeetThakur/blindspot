import { useState, useEffect, useMemo } from 'react';
import {
  BATTLESHIP_FLEET_DEF,
  BATTLESHIP_GRID_SIZE,
  BATTLESHIP_MAX_PLAYERS,
  BATTLESHIP_MIN_PLAYERS,
  BATTLESHIP_TURN_TIMEOUT_OPTIONS,
  type BattleshipShipPlacement,
  type BattleshipSnapshot,
  type Position,
  type RoomSnapshot,
} from '@whoami/shared';
import { useGame } from '../../lib/store';
import { CopyButton } from '../../components/ui';
import { inviteLink } from '../../lib/view';

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// -------------------------------------------------------------
// Helper: calculate cells occupied by a ship
// -------------------------------------------------------------
function getShipCells(ship: BattleshipShipPlacement): Position[] {
  const cells: Position[] = [];
  for (let i = 0; i < ship.size; i++) {
    cells.push({
      x: ship.orientation === 'h' ? ship.x + i : ship.x,
      y: ship.orientation === 'v' ? ship.y + i : ship.y,
    });
  }
  return cells;
}

// Helper: client-side random fleet generator
function generateLocalRandomFleet(): BattleshipShipPlacement[] {
  const ships: BattleshipShipPlacement[] = [];
  const occupied = new Set<string>();

  for (const def of BATTLESHIP_FLEET_DEF) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      attempts++;
      const orientation: 'h' | 'v' = Math.random() < 0.5 ? 'h' : 'v';
      const maxX = orientation === 'h' ? BATTLESHIP_GRID_SIZE - def.size : BATTLESHIP_GRID_SIZE - 1;
      const maxY = orientation === 'v' ? BATTLESHIP_GRID_SIZE - def.size : BATTLESHIP_GRID_SIZE - 1;
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
        cells.forEach((c) => occupied.add(`${c.x},${c.y}`));
        ships.push(candidate);
        placed = true;
      }
    }
  }
  return ships;
}

// -------------------------------------------------------------
// Main Battleship Screen Switcher
// -------------------------------------------------------------
export function BattleshipScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const battleship = snapshot.battleship;
  if (!battleship) return null;

  if (battleship.phase === 'LOBBY') {
    return <BattleshipLobby snapshot={snapshot} battleship={battleship} />;
  }
  if (battleship.phase === 'PLACEMENT') {
    return <BattleshipPlacement snapshot={snapshot} battleship={battleship} />;
  }
  return <BattleshipCombat snapshot={snapshot} battleship={battleship} />;
}

// -------------------------------------------------------------
// Battleship Lobby
// -------------------------------------------------------------
function BattleshipLobby({
  snapshot,
  battleship,
}: {
  snapshot: RoomSnapshot;
  battleship: BattleshipSnapshot;
}) {
  const { client } = useGame();
  const isHost = snapshot.hostId === snapshot.youId;
  const players = battleship.players;
  const canStart = isHost && players.length >= BATTLESHIP_MIN_PLAYERS;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      {/* Top Banner */}
      <div className="card flex flex-col items-center justify-between gap-4 sm:flex-row bg-surface">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black">BATTLESHIP</span>
            <span className="rounded-full bg-sky/30 px-2.5 py-0.5 text-xs font-black uppercase text-ink">
              2–4 Players • Naval Combat
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Deploy your fleet secretly, target enemy ocean grids, and sink all rival warships to dominate the seas!
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
              Captains ({players.length}/{BATTLESHIP_MAX_PLAYERS})
            </h2>
            <span className="text-xs font-bold text-ink-soft">
              {players.length < BATTLESHIP_MIN_PLAYERS
                ? `Need ${BATTLESHIP_MIN_PLAYERS - players.length} more`
                : 'Ready to deploy'}
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {players.map((p) => {
              const isYou = p.id === snapshot.youId;
              const isRoomHost = p.id === snapshot.hostId;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border-2 border-border bg-surface p-3 shadow-[0_2px_0_0_var(--color-shadow)]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-xl border-2 border-ink flex items-center justify-center font-black text-sm text-white shadow"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm">{p.name}</span>
                        {isYou && (
                          <span className="rounded bg-surface-subtle border border-border px-1.5 py-0.2 text-[10px] font-black text-ink-soft">
                            YOU
                          </span>
                        )}
                        {isRoomHost && (
                          <span className="rounded bg-amber px-1.5 py-0.2 text-[10px] font-black text-ink">
                            HOST
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-ink-soft">
                        {p.connected ? 'Online' : 'Reconnecting…'}
                      </span>
                    </div>
                  </div>

                  {isHost && !isYou && (
                    <button
                      type="button"
                      onClick={() => client.kick(p.id)}
                      className="rounded-lg border border-border px-2 py-1 text-xs font-bold text-blush hover:bg-blush/10"
                    >
                      Kick
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {isHost ? (
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={!canStart}
                onClick={() => client.startGame()}
              >
                {players.length < BATTLESHIP_MIN_PLAYERS
                  ? `Waiting for players (${players.length}/${BATTLESHIP_MIN_PLAYERS})`
                  : 'Start Fleet Deployment'}
              </button>
            ) : (
              <div className="flex-1 rounded-xl border-2 border-border bg-surface-subtle p-3 text-center text-sm font-bold text-ink-soft">
                Waiting for the host to launch fleet deployment…
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
          <h2 className="text-lg font-black border-b-2 border-border pb-2">Naval Settings</h2>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Shot Turn Timer
            </label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {BATTLESHIP_TURN_TIMEOUT_OPTIONS.map((t) => (
                <button
                  key={String(t)}
                  type="button"
                  disabled={!isHost}
                  onClick={() => client.updateBattleshipSettings({ turnTimeoutSec: t })}
                  className={`rounded-lg border-2 border-border py-1.5 text-xs font-black transition-all ${
                    battleship.settings.turnTimeoutSec === t
                      ? 'bg-ink text-paper shadow-[0_2px_0_0_var(--color-shadow)]'
                      : 'bg-surface hover:bg-surface-subtle text-ink'
                  } ${!isHost ? 'cursor-default opacity-80' : ''}`}
                >
                  {t === null ? 'No timer' : `${t}s`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Hit Bonus Rule
            </label>
            <div className="mt-2 flex items-center justify-between rounded-xl border-2 border-border p-2.5 bg-surface">
              <span className="text-xs font-bold text-ink">Extra shot on Hit</span>
              <button
                type="button"
                disabled={!isHost}
                onClick={() =>
                  client.updateBattleshipSettings({
                    extraShotOnHit: !battleship.settings.extraShotOnHit,
                  })
                }
                className={`rounded-lg px-2.5 py-1 text-xs font-black border-2 border-border transition-all ${
                  battleship.settings.extraShotOnHit
                    ? 'bg-lime text-ink'
                    : 'bg-surface-subtle text-ink-soft'
                } ${!isHost ? 'opacity-70 cursor-default' : ''}`}
              >
                {battleship.settings.extraShotOnHit ? 'ENABLED' : 'OFF'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">
              If enabled, scoring a hit grants an immediate bonus missile salvo!
            </p>
          </div>

          <div className="rounded-xl border border-border bg-sky/20 p-3 text-xs text-ink-soft mt-auto">
            <p className="font-bold text-ink">Fleet Composition (5 Ships):</p>
            <ul className="mt-1 space-y-0.5 pl-2 text-[11px]">
              <li><strong>Carrier</strong>: 5 cells</li>
              <li><strong>Battleship</strong>: 4 cells</li>
              <li><strong>Cruiser</strong>: 3 cells</li>
              <li><strong>Submarine</strong>: 3 cells</li>
              <li><strong>Destroyer</strong>: 2 cells</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}

// -------------------------------------------------------------
// Battleship Placement Phase (Secret Fleet Deployment)
// -------------------------------------------------------------
function BattleshipPlacement({
  snapshot,
  battleship,
}: {
  snapshot: RoomSnapshot;
  battleship: BattleshipSnapshot;
}) {
  const { client } = useGame();
  const you = battleship.players.find((p) => p.id === snapshot.youId);
  const [ships, setShips] = useState<BattleshipShipPlacement[]>(() => generateLocalRandomFleet());
  const [selectedShipIndex, setSelectedShipIndex] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<'h' | 'v'>('h');
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);

  // Toggle orientation with R or Space
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
        e.preventDefault();
        setOrientation((prev) => (prev === 'h' ? 'v' : 'h'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const randomize = () => {
    setShips(generateLocalRandomFleet());
    setSelectedShipIndex(null);
  };

  const clearBoard = () => {
    setShips([]);
    setSelectedShipIndex(0);
  };

  // Preview cells for hover placement
  const activeDef = selectedShipIndex !== null ? BATTLESHIP_FLEET_DEF[selectedShipIndex] : null;
  const hoverPreview = useMemo(() => {
    if (!hoverCell || !activeDef || you?.ready) return null;
    const candidate: BattleshipShipPlacement = {
      id: activeDef.id,
      name: activeDef.name,
      size: activeDef.size,
      x: hoverCell.x,
      y: hoverCell.y,
      orientation,
    };
    const cells = getShipCells(candidate);
    const maxX = orientation === 'h' ? BATTLESHIP_GRID_SIZE - activeDef.size : BATTLESHIP_GRID_SIZE - 1;
    const maxY = orientation === 'v' ? BATTLESHIP_GRID_SIZE - activeDef.size : BATTLESHIP_GRID_SIZE - 1;
    const isOutOfBounds = hoverCell.x > maxX || hoverCell.y > maxY;

    const otherShips = ships.filter((s) => s.id !== activeDef.id);
    const otherOccupied = new Set(
      otherShips.flatMap((s) => getShipCells(s).map((c) => `${c.x},${c.y}`)),
    );
    const isOverlap = cells.some((c) => otherOccupied.has(`${c.x},${c.y}`));
    const valid = !isOutOfBounds && !isOverlap;

    return {
      cells,
      valid,
    };
  }, [hoverCell, activeDef, orientation, ships, you?.ready]);

  const handleCellClick = (x: number, y: number) => {
    if (you?.ready) return;

    // If no ship is selected from roster, clicking an already placed ship rotates it in place!
    if (selectedShipIndex === null) {
      const clickedShip = ships.find((s) => getShipCells(s).some((c) => c.x === x && c.y === y));
      if (clickedShip) {
        const nextOrientation = clickedShip.orientation === 'h' ? 'v' : 'h';
        const rotatedCandidate: BattleshipShipPlacement = {
          ...clickedShip,
          orientation: nextOrientation,
        };
        const maxX = nextOrientation === 'h' ? BATTLESHIP_GRID_SIZE - clickedShip.size : BATTLESHIP_GRID_SIZE - 1;
        const maxY = nextOrientation === 'v' ? BATTLESHIP_GRID_SIZE - clickedShip.size : BATTLESHIP_GRID_SIZE - 1;

        if (clickedShip.x <= maxX && clickedShip.y <= maxY) {
          const otherShips = ships.filter((s) => s.id !== clickedShip.id);
          const otherOccupied = new Set(
            otherShips.flatMap((s) => getShipCells(s).map((c) => `${c.x},${c.y}`)),
          );
          const candidateCells = getShipCells(rotatedCandidate);
          if (!candidateCells.some((c) => otherOccupied.has(`${c.x},${c.y}`))) {
            setShips([...otherShips, rotatedCandidate]);
            setOrientation(nextOrientation);
            return;
          }
        }
        // If it cannot rotate in place, select it so the player can place it elsewhere
        const idx = BATTLESHIP_FLEET_DEF.findIndex((d) => d.id === clickedShip.id);
        if (idx !== -1) {
          setSelectedShipIndex(idx);
          setOrientation(nextOrientation);
        }
      }
      return;
    }

    if (!activeDef) return;

    // Check bounds
    const maxX = orientation === 'h' ? BATTLESHIP_GRID_SIZE - activeDef.size : BATTLESHIP_GRID_SIZE - 1;
    const maxY = orientation === 'v' ? BATTLESHIP_GRID_SIZE - activeDef.size : BATTLESHIP_GRID_SIZE - 1;
    if (x > maxX || y > maxY) return;

    const candidate: BattleshipShipPlacement = {
      id: activeDef.id,
      name: activeDef.name,
      size: activeDef.size,
      x,
      y,
      orientation,
    };
    const newCells = getShipCells(candidate);

    // Check overlap with other placed ships
    const otherShips = ships.filter((s) => s.id !== activeDef.id);
    const otherOccupied = new Set(
      otherShips.flatMap((s) => getShipCells(s).map((c) => `${c.x},${c.y}`)),
    );

    if (newCells.some((c) => otherOccupied.has(`${c.x},${c.y}`))) {
      return;
    }

    const updatedShips = [...otherShips, candidate];
    setShips(updatedShips);

    // Move to next unplaced ship or deselect
    const nextUnplacedIndex = BATTLESHIP_FLEET_DEF.findIndex(
      (d) => !updatedShips.some((s) => s.id === d.id),
    );
    setSelectedShipIndex(nextUnplacedIndex !== -1 ? nextUnplacedIndex : null);
  };

  const isShipPlaced = (defId: string) => ships.some((s) => s.id === defId);

  const lockInFleet = () => {
    if (ships.length === BATTLESHIP_FLEET_DEF.length) {
      client.battleshipPlaceShips(ships);
    }
  };

  // Occupied cells map for rendering ship shapes
  const placedMap = useMemo(() => {
    const map = new Map<
      string,
      {
        ship: BattleshipShipPlacement;
        isHead: boolean;
        isTail: boolean;
      }
    >();
    for (const ship of ships) {
      const cells = getShipCells(ship);
      cells.forEach((c, i) => {
        map.set(`${c.x},${c.y}`, {
          ship,
          isHead: i === 0,
          isTail: i === cells.length - 1,
        });
      });
    }
    return map;
  }, [ships]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      {/* Top Banner */}
      <div className="card flex flex-wrap items-center justify-between gap-4 bg-surface p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black">DEPLOY FLEET</span>
            <span className="rounded-full bg-amber/30 px-2.5 py-0.5 text-xs font-black uppercase text-ink">
              Secret Placement
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Position all 5 warships on your ocean grid. Opponents cannot see your fleet!
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={you?.ready}
            onClick={clearBoard}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            Clear Board
          </button>
          <button
            type="button"
            disabled={you?.ready}
            onClick={randomize}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            Randomize Fleet
          </button>
          <button
            type="button"
            disabled={you?.ready || ships.length !== BATTLESHIP_FLEET_DEF.length}
            onClick={lockInFleet}
            className={`py-1.5 px-4 rounded-xl border-2 border-border font-black text-xs transition-all ${
              you?.ready
                ? 'bg-lime text-ink'
                : 'btn-primary shadow-[0_2px_0_0_var(--color-shadow)]'
            }`}
          >
            {you?.ready ? '✓ FLEET READY' : 'Ready for Battle'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* 10x10 Placement Grid with Coordinates */}
        <div className="card bg-surface p-3 sm:p-5 flex flex-col items-center">
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              if (!you?.ready) setOrientation((prev) => (prev === 'h' ? 'v' : 'h'));
            }}
            onMouseLeave={() => setHoverCell(null)}
            className="relative aspect-square w-full max-w-[460px] rounded-xl border-4 border-border bg-[#0a192f] p-2 select-none shadow-2xl"
          >
            {/* Coordinate Grid: 11x11 layout with A-J top and 1-10 left */}
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: '22px repeat(10, minmax(0, 1fr))',
                gridTemplateRows: '22px repeat(10, minmax(0, 1fr))',
                gap: '2px',
              }}
            >
              {/* Corner blank */}
              <div className="flex items-center justify-center font-mono text-[10px] text-sky-400/60 font-bold">
                ⚓
              </div>

              {/* Column Letters A-J */}
              {COLS.map((col) => (
                <div
                  key={`col-${col}`}
                  className="flex items-center justify-center font-mono text-xs font-black text-sky-300 select-none"
                >
                  {col}
                </div>
              ))}

              {/* Rows 1-10 */}
              {ROWS.map((rowNum, rIdx) => {
                const y = rIdx;
                return (
                  <div key={`row-wrap-${rowNum}`} className="contents">
                    {/* Row Number */}
                    <div className="flex items-center justify-center font-mono text-xs font-black text-sky-300 select-none">
                      {rowNum}
                    </div>

                    {/* 10 Cells in this row */}
                    {COLS.map((_, cIdx) => {
                      const x = cIdx;
                      const placedData = placedMap.get(`${x},${y}`);
                      const isHovered =
                        hoverPreview && hoverPreview.cells.some((c) => c.x === x && c.y === y);

                      // Style ship rounded caps for hull feel
                      let roundedClasses = 'rounded';
                      if (placedData) {
                        const { ship, isHead, isTail } = placedData;
                        if (ship.orientation === 'h') {
                          if (isHead) roundedClasses = 'rounded-l-lg';
                          else if (isTail) roundedClasses = 'rounded-r-lg';
                          else roundedClasses = 'rounded-none';
                        } else {
                          if (isHead) roundedClasses = 'rounded-t-lg';
                          else if (isTail) roundedClasses = 'rounded-b-lg';
                          else roundedClasses = 'rounded-none';
                        }
                      }

                      return (
                        <div
                          key={`cell-${x}-${y}`}
                          onMouseEnter={() => setHoverCell({ x, y })}
                          onClick={() => handleCellClick(x, y)}
                          title={
                            placedData
                              ? `${placedData.ship.name} (Click to rotate)`
                              : `Coordinate ${COLS[x]}${y + 1}`
                          }
                          className={`relative flex items-center justify-center border transition-all text-[11px] font-black ${roundedClasses} ${
                            isHovered
                              ? hoverPreview.valid
                                ? 'bg-emerald-500/80 border-emerald-300 text-white shadow-lg animate-pulse'
                                : 'bg-rose-500/80 border-rose-300 text-white shadow-lg'
                              : placedData
                                ? 'border-slate-800 bg-slate-300 text-slate-900 shadow-md hover:brightness-110 cursor-pointer'
                                : 'border-sky-950/60 bg-sky-950/40 hover:bg-sky-800/40 cursor-pointer'
                          }`}
                        >
                          {placedData && !isHovered && (
                            <span className="opacity-90">{placedData.ship.name.slice(0, 1)}</span>
                          )}
                          {isHovered && <span className="opacity-80">⚓</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Orientation & Quick Controls */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={you?.ready}
              onClick={() => setOrientation((prev) => (prev === 'h' ? 'v' : 'h'))}
              className="btn-secondary flex items-center gap-2 py-2 px-4 text-xs font-black shadow-[0_2px_0_0_var(--color-shadow)]"
            >
              <span>Rotate Ship:</span>
              <span className="rounded bg-paper border border-border px-2 py-0.5 text-coral uppercase tracking-wide">
                {orientation === 'h' ? '↔ Horizontal' : '↕ Vertical'}
              </span>
            </button>
            <span className="text-xs text-ink-soft">
              Press <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface font-mono font-bold">R</kbd> or <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface font-mono font-bold">Space</kbd> or Right-Click grid
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-soft text-center">
            Click any placed warship on the board to rotate it in place!
          </p>
        </div>

        {/* Fleet Roster & Opponents Ready Status */}
        <div className="flex flex-col gap-4">
          <div className="card bg-surface p-4">
            <div className="flex items-center justify-between border-b-2 border-border pb-2">
              <h3 className="font-black text-sm">Warships ({ships.length}/5)</h3>
              <span className="text-[11px] font-bold text-ink-soft">
                {selectedShipIndex !== null ? 'Selected' : 'Pick to place'}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {BATTLESHIP_FLEET_DEF.map((def, idx) => {
                const placed = isShipPlaced(def.id);
                const isSelected = selectedShipIndex === idx;
                return (
                  <button
                    key={def.id}
                    type="button"
                    disabled={you?.ready}
                    onClick={() => {
                      setSelectedShipIndex(isSelected ? null : idx);
                    }}
                    className={`w-full flex items-center justify-between rounded-xl border-2 border-border p-2.5 text-xs font-black transition-all ${
                      isSelected
                        ? 'bg-amber/30 ring-2 ring-coral shadow-[0_2px_0_0_var(--color-shadow)]'
                        : placed
                          ? 'bg-surface-subtle text-ink'
                          : 'bg-surface text-ink-soft border-dashed hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${placed ? 'bg-lime' : 'bg-ink-soft/40'}`} />
                      <span>{def.name}</span>
                    </div>
                    <span className="rounded bg-surface border border-border px-1.5 py-0.5 text-[10px]">
                      {def.size} cells
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-ink-soft leading-relaxed">
              Select a ship from the list, hover over the ocean to preview placement, and click to position it.
            </p>
          </div>

          {/* Opponents Status */}
          <div className="card bg-surface p-4">
            <h3 className="font-black text-sm border-b-2 border-border pb-2">Fleet Readiness</h3>
            <div className="mt-3 space-y-2">
              {battleship.players.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full border border-ink"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="font-bold">
                      {p.name} {p.id === snapshot.youId && '(You)'}
                    </span>
                  </div>
                  <span
                    className={`font-black text-[11px] ${
                      p.ready ? 'text-lime' : 'text-ink-soft'
                    }`}
                  >
                    {p.ready ? '✓ READY' : 'Positioning…'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// -------------------------------------------------------------
// Battleship Combat Phase (Targeting & Defense Ocean)
// -------------------------------------------------------------
function BattleshipCombat({
  snapshot,
  battleship,
}: {
  snapshot: RoomSnapshot;
  battleship: BattleshipSnapshot;
}) {
  const { client } = useGame();
  const you = battleship.players.find((p) => p.id === snapshot.youId);
  const isHost = snapshot.hostId === snapshot.youId;
  const isYourTurn = battleship.activeId === snapshot.youId;
  const activePlayer = battleship.players.find((p) => p.id === battleship.activeId);
  const winner = battleship.winnerId
    ? battleship.players.find((p) => p.id === battleship.winnerId)
    : null;

  // List of opponents
  const opponents = useMemo(
    () => battleship.players.filter((p) => p.id !== snapshot.youId),
    [battleship.players, snapshot.youId],
  );

  // Selected opponent target tab
  const [targetId, setTargetId] = useState<string>(() => {
    const firstAlive = opponents.find((p) => p.alive);
    return firstAlive ? firstAlive.id : opponents[0]?.id ?? '';
  });

  // Keep target valid
  useEffect(() => {
    const current = opponents.find((p) => p.id === targetId);
    if (!current || !current.alive) {
      const nextAlive = opponents.find((p) => p.alive);
      if (nextAlive) setTargetId(nextAlive.id);
    }
  }, [opponents, targetId]);

  const targetPlayer = opponents.find((p) => p.id === targetId);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!battleship.timer?.deadline) {
      setTimeLeft(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((battleship.timer!.deadline! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [battleship.timer?.deadline]);

  // Handle firing missile
  const handleFire = (x: number, y: number) => {
    if (!isYourTurn || battleship.phase !== 'PLAYING') return;
    if (!targetPlayer || !targetPlayer.alive) return;
    const alreadyShot = targetPlayer.shotsReceived.some((s) => s.x === x && s.y === y);
    if (alreadyShot) return;

    client.battleshipFire(targetId, x, y);
  };

  // Target radar shot map
  const targetShotsMap = useMemo(() => {
    const map = new Map<string, { result: 'hit' | 'miss'; sunkShip?: string }>();
    if (targetPlayer) {
      for (const s of targetPlayer.shotsReceived) {
        map.set(`${s.x},${s.y}`, { result: s.result, sunkShip: s.sunkShip });
      }
    }
    return map;
  }, [targetPlayer]);

  // Your defense ocean ship map
  const yourShipsMap = useMemo(() => {
    const map = new Map<string, string>();
    if (you?.ships) {
      for (const ship of you.ships) {
        for (const c of getShipCells(ship)) {
          map.set(`${c.x},${c.y}`, ship.name);
        }
      }
    }
    return map;
  }, [you?.ships]);

  // Shots received on your fleet
  const yourReceivedMap = useMemo(() => {
    const map = new Map<string, 'hit' | 'miss'>();
    if (you?.shotsReceived) {
      for (const s of you.shotsReceived) {
        map.set(`${s.x},${s.y}`, s.result);
      }
    }
    return map;
  }, [you?.shotsReceived]);

  const [hoveredCoordinate, setHoveredCoordinate] = useState<string | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:py-6">
      {/* Turn Status Banner - Highly intuitive! */}
      <div
        className={`card flex flex-wrap items-center justify-between gap-3 p-4 transition-all ${
          isYourTurn
            ? 'border-coral bg-coral/10 ring-4 ring-coral/20 shadow-[0_4px_0_0_var(--color-shadow)]'
            : 'border-border bg-surface'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border text-2xl font-black shadow-[0_2px_0_0_var(--color-shadow)] ${
              isYourTurn ? 'bg-coral text-white animate-pulse' : 'bg-surface text-ink'
            }`}
          >
            {isYourTurn ? '🎯' : '⏳'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-black sm:text-xl tracking-tight ${isYourTurn ? 'text-coral' : 'text-ink'}`}>
                {isYourTurn ? 'YOUR TURN TO FIRE' : `${activePlayer?.name}'s Turn`}
              </span>
              <span className="rounded-full bg-surface-subtle border border-border px-2 py-0.5 text-xs font-bold text-ink-soft">
                Turn #{battleship.turnCount}
              </span>
            </div>
            <p className="text-xs font-bold text-ink-soft mt-0.5">
              {isYourTurn
                ? `Pick an enemy coordinate on ${targetPlayer?.name}'s radar to launch missile strike!`
                : `Waiting for ${activePlayer?.name} to fire…`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hoveredCoordinate && isYourTurn && (
            <div className="rounded-lg bg-coral/20 border border-coral px-2.5 py-1 text-xs font-black text-coral animate-pulse">
              Aiming: {hoveredCoordinate}
            </div>
          )}
          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1.5 rounded-full border-2 border-border px-3 py-1 font-mono text-xs font-black shadow-[0_2px_0_0_var(--color-shadow)] ${
                timeLeft <= 5 ? 'bg-blush text-white animate-bounce' : 'bg-surface text-ink'
              }`}
            >
              ⏱ {timeLeft}s
            </div>
          )}
        </div>
      </div>

      {/* Last Shot Alert */}
      {battleship.lastShot && (
        <div
          className={`rounded-xl border-2 border-border px-4 py-2.5 text-xs font-black shadow-[0_2px_0_0_var(--color-shadow)] animate-in fade-in flex items-center justify-between ${
            battleship.lastShot.result === 'hit'
              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500'
              : 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-400'
          }`}
        >
          <span>
            {battleship.lastShot.result === 'hit'
              ? `DIRECT HIT! Strike landed at (${COLS[battleship.lastShot.x]}${battleship.lastShot.y + 1})${
                  battleship.lastShot.sunkShip ? ` and SANK the ${battleship.lastShot.sunkShip}!` : '!'
                }`
              : `Splash! Torpedo missed at (${COLS[battleship.lastShot.x]}${battleship.lastShot.y + 1}).`}
          </span>
          <span className="text-[10px] uppercase tracking-wider opacity-80">Last Attack</span>
        </div>
      )}

      {/* Target Selector Tabs (2 to 4 Players) */}
      {opponents.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 bg-surface p-3">
          <span className="text-xs font-black uppercase tracking-wider text-ink-soft mr-2">
            Target Fleet:
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            {opponents.map((opp) => {
              const isSelected = opp.id === targetId;
              const isOppTurn = opp.id === battleship.activeId;
              return (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => setTargetId(opp.id)}
                  className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-xs font-black transition-all ${
                    isSelected
                      ? 'border-coral bg-coral text-white shadow-[0_3px_0_0_var(--color-shadow)]'
                      : 'border-border bg-surface hover:bg-surface-subtle text-ink'
                  } ${!opp.alive ? 'opacity-40 line-through' : ''}`}
                >
                  <div
                    className="h-3 w-3 rounded-full border border-ink"
                    style={{ backgroundColor: opp.color }}
                  />
                  <span>{opp.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                      isSelected ? 'bg-black/25 text-white' : 'bg-surface-subtle text-ink-soft border border-border'
                    }`}
                  >
                    {opp.alive ? `${opp.shipsRemaining} ships left` : 'SUNK'}
                  </span>
                  {isOppTurn && (
                    <span className="rounded bg-amber px-1.5 py-0.2 text-[9px] text-ink font-black uppercase">
                      Firing
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dual Grids: Offense Radar & Defense Ocean */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Radar: Targeting Opponent Waters */}
        <div className="card bg-surface p-3 sm:p-5 flex flex-col items-center">
          <div className="w-full flex items-center justify-between pb-2 border-b-2 border-border mb-3">
            <h3 className="font-black text-sm text-coral flex items-center gap-1.5">
              <span>TARGETING RADAR</span>
              <span className="text-ink-soft">({targetPlayer?.name})</span>
            </h3>
            <span className="text-xs font-bold text-ink-soft">
              {targetPlayer?.alive ? `${targetPlayer.shipsRemaining} Ships Remaining` : 'Fleet Destroyed'}
            </span>
          </div>

          {/* 10x10 Radar Grid with Coordinates */}
          <div
            onMouseLeave={() => setHoveredCoordinate(null)}
            className="relative aspect-square w-full max-w-[420px] rounded-xl border-4 border-border bg-[#0a192f] p-2 select-none shadow-2xl"
          >
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: '20px repeat(10, minmax(0, 1fr))',
                gridTemplateRows: '20px repeat(10, minmax(0, 1fr))',
                gap: '2px',
              }}
            >
              {/* Corner */}
              <div className="flex items-center justify-center font-mono text-[9px] text-sky-400/60 font-bold">
                🎯
              </div>

              {/* A-J */}
              {COLS.map((col) => (
                <div
                  key={`radar-col-${col}`}
                  className="flex items-center justify-center font-mono text-[11px] font-black text-sky-300 select-none"
                >
                  {col}
                </div>
              ))}

              {/* Rows 1-10 */}
              {ROWS.map((rowNum, rIdx) => {
                const y = rIdx;
                return (
                  <div key={`radar-row-wrap-${rowNum}`} className="contents">
                    <div className="flex items-center justify-center font-mono text-[11px] font-black text-sky-300 select-none">
                      {rowNum}
                    </div>

                    {COLS.map((_, cIdx) => {
                      const x = cIdx;
                      const shot = targetShotsMap.get(`${x},${y}`);
                      const isTargetCell = !shot && isYourTurn && targetPlayer?.alive;

                      return (
                        <div
                          key={`target-${x}-${y}`}
                          onMouseEnter={() => setHoveredCoordinate(`${COLS[x]}${y + 1}`)}
                          onClick={() => handleFire(x, y)}
                          className={`relative flex items-center justify-center rounded border transition-all text-xs font-black ${
                            shot?.result === 'hit'
                              ? 'border-red-600 bg-red-600 text-white shadow-lg shadow-red-500/50'
                              : shot?.result === 'miss'
                                ? 'border-sky-800 bg-sky-900/50 text-sky-200'
                                : isTargetCell
                                  ? 'border-sky-900/80 bg-sky-950/60 hover:bg-coral/40 hover:border-coral cursor-crosshair'
                                  : 'border-sky-950/50 bg-sky-950/30'
                          }`}
                        >
                          {shot?.result === 'hit' && '💥'}
                          {shot?.result === 'miss' && <span className="h-2 w-2 rounded-full bg-sky-300" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-soft text-center">
            {isYourTurn
              ? 'Click any coordinate to fire your missile strike.'
              : `Waiting for ${activePlayer?.name}'s shot…`}
          </p>
        </div>

        {/* Defense: Your Fleet Ocean */}
        <div className="card bg-surface p-3 sm:p-5 flex flex-col items-center">
          <div className="w-full flex items-center justify-between pb-2 border-b-2 border-border mb-3">
            <h3 className="font-black text-sm text-sky-600 flex items-center gap-1.5">
              <span>YOUR FLEET DEFENSE</span>
              <span className="text-ink-soft">(Your Ocean)</span>
            </h3>
            <span className="text-xs font-bold text-ink-soft">
              {you ? `${you.shipsRemaining} Ships Alive` : ''}
            </span>
          </div>

          {/* 10x10 Defense Grid with Coordinates */}
          <div className="relative aspect-square w-full max-w-[420px] rounded-xl border-4 border-border bg-[#0a192f] p-2 select-none shadow-2xl">
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: '20px repeat(10, minmax(0, 1fr))',
                gridTemplateRows: '20px repeat(10, minmax(0, 1fr))',
                gap: '2px',
              }}
            >
              {/* Corner */}
              <div className="flex items-center justify-center font-mono text-[9px] text-sky-400/60 font-bold">
                🛡️
              </div>

              {/* A-J */}
              {COLS.map((col) => (
                <div
                  key={`def-col-${col}`}
                  className="flex items-center justify-center font-mono text-[11px] font-black text-sky-300 select-none"
                >
                  {col}
                </div>
              ))}

              {/* Rows 1-10 */}
              {ROWS.map((rowNum, rIdx) => {
                const y = rIdx;
                return (
                  <div key={`def-row-wrap-${rowNum}`} className="contents">
                    <div className="flex items-center justify-center font-mono text-[11px] font-black text-sky-300 select-none">
                      {rowNum}
                    </div>

                    {COLS.map((_, cIdx) => {
                      const x = cIdx;
                      const shipName = yourShipsMap.get(`${x},${y}`);
                      const received = yourReceivedMap.get(`${x},${y}`);

                      return (
                        <div
                          key={`defense-${x}-${y}`}
                          className={`relative flex items-center justify-center rounded border transition-all text-xs font-black ${
                            received === 'hit'
                              ? 'border-red-600 bg-red-700 text-white shadow-lg'
                              : received === 'miss'
                                ? 'border-sky-800 bg-sky-900/40 text-sky-300'
                                : shipName
                                  ? 'border-slate-800 bg-slate-300 text-slate-900 shadow'
                                  : 'border-sky-950/50 bg-sky-950/40'
                          }`}
                        >
                          {received === 'hit' ? (
                            '💥'
                          ) : received === 'miss' ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                          ) : shipName ? (
                            <span className="text-[10px] font-black opacity-80">
                              {shipName.slice(0, 1)}
                            </span>
                          ) : (
                            ''
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-soft text-center">
            Your ships are hidden from opponents until struck.
          </p>
        </div>
      </div>

      {/* Victory / Defeat Modal */}
      {battleship.phase === 'GAME_OVER' && winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in">
          <div className="card mx-auto w-full max-w-md text-center bg-surface shadow-2xl border-4 border-coral p-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-coral text-4xl text-white shadow">
              🏆
            </div>
            <h2 className="mt-4 text-2xl font-black">{winner.name} Wins the Sea!</h2>
            <p className="mt-2 text-sm text-ink-soft">
              {winner.id === snapshot.youId
                ? 'Congratulations! You sank all enemy fleets and dominated the naval battlefield!'
                : `${winner.name} is the last surviving admiral!`}
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {isHost && (
                <button
                  type="button"
                  onClick={() => client.restartRound()}
                  className="btn-primary w-full py-2.5 font-black"
                >
                  Play Another Battle
                </button>
              )}
              {isHost && (
                <button
                  type="button"
                  onClick={() => client.returnToLobby()}
                  className="btn-secondary w-full py-2.5 font-black"
                >
                  Return to Lobby
                </button>
              )}
              <button
                type="button"
                onClick={() => client.leave()}
                className="btn-secondary w-full py-2 font-bold text-xs"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
