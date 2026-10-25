import { useState, useEffect, useMemo } from 'react';
import {
  BATTLESHIP_FLEET_DEF,
  BATTLESHIP_GRID_SIZE,
  BATTLESHIP_MAX_PLAYERS,
  BATTLESHIP_MIN_PLAYERS,
  BATTLESHIP_TURN_TIMEOUT_OPTIONS,
  type BattleshipPlayerSnapshot,
  type BattleshipShipPlacement,
  type BattleshipSnapshot,
  type Position,
  type RoomSnapshot,
} from '@whoami/shared';
import { useGame } from '../../lib/store';
import { CopyButton } from '../../components/ui';
import { inviteLink } from '../../lib/view';

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

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
            <span className="text-2xl font-black">🚢 BATTLESHIP</span>
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
                : 'Fleet ready'}
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
                      ⚓{idx + 1}
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
                {players.length < BATTLESHIP_MIN_PLAYERS
                  ? `Waiting for players (${players.length}/${BATTLESHIP_MIN_PLAYERS})`
                  : 'Start Fleet Deployment ⚓'}
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
                  {t === null ? 'No timer' : `⏱ ${t}s`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Hit Bonus Rule
            </label>
            <div className="mt-2 flex items-center justify-between rounded-xl border-2 border-border p-2.5 bg-surface">
              <span className="text-xs font-bold text-ink">Extra shot on Hit 🔥</span>
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
              If enabled, scoring a hit gives you another missile shot immediately!
            </p>
          </div>

          <div className="rounded-xl border border-border bg-sky/20 p-3 text-xs text-ink-soft mt-auto">
            <p className="font-bold text-ink">⚓ Fleet Composition (5 Ships):</p>
            <ul className="mt-1 space-y-0.5 pl-2 text-[11px]">
              <li>🛳️ <strong>Carrier</strong>: 5 cells</li>
              <li>🚢 <strong>Battleship</strong>: 4 cells</li>
              <li>🛥️ <strong>Cruiser</strong>: 3 cells</li>
              <li>🚤 <strong>Submarine</strong>: 3 cells</li>
              <li>⛵ <strong>Destroyer</strong>: 2 cells</li>
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
  };

  const handleCellClick = (x: number, y: number) => {
    if (you?.ready) return;
    if (selectedShipIndex === null) return;
    const def = BATTLESHIP_FLEET_DEF[selectedShipIndex];
    if (!def) return;

    // Check bounds
    const maxX = orientation === 'h' ? BATTLESHIP_GRID_SIZE - def.size : BATTLESHIP_GRID_SIZE - 1;
    const maxY = orientation === 'v' ? BATTLESHIP_GRID_SIZE - def.size : BATTLESHIP_GRID_SIZE - 1;
    if (x > maxX || y > maxY) return;

    const candidate: BattleshipShipPlacement = {
      id: def.id,
      name: def.name,
      size: def.size,
      x,
      y,
      orientation,
    };
    const newCells = getShipCells(candidate);

    // Check overlap with other placed ships
    const otherShips = ships.filter((s) => s.id !== def.id);
    const otherOccupied = new Set(
      otherShips.flatMap((s) => getShipCells(s).map((c) => `${c.x},${c.y}`)),
    );

    if (newCells.some((c) => otherOccupied.has(`${c.x},${c.y}`))) {
      return;
    }

    setShips([...otherShips, candidate]);
    // Move to next unplaced ship or deselect
    setSelectedShipIndex(null);
  };

  const isShipPlaced = (defId: string) => ships.some((s) => s.id === defId);

  const lockInFleet = () => {
    if (ships.length === BATTLESHIP_FLEET_DEF.length) {
      client.battleshipPlaceShips(ships);
    }
  };

  // Occupied cells map for rendering
  const placedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ship of ships) {
      for (const c of getShipCells(ship)) {
        map.set(`${c.x},${c.y}`, ship.name);
      }
    }
    return map;
  }, [ships]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      {/* Top Banner */}
      <div className="card flex flex-wrap items-center justify-between gap-4 bg-surface p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black">⚓ DEPLOY YOUR FLEET</span>
            <span className="rounded-full bg-amber/30 px-2.5 py-0.5 text-xs font-black uppercase text-ink">
              Secret Placement
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Position your 5 warships on your ocean grid. Opponents cannot see where you hide your fleet!
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={you?.ready}
            onClick={randomize}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            🎲 Randomize Fleet
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
            {you?.ready ? '✓ FLEET READY!' : 'Ready for Battle ⚓'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* 10x10 Placement Grid */}
        <div className="card bg-surface p-3 sm:p-5 flex flex-col items-center">
          <div className="relative aspect-square w-full max-w-[440px] rounded-xl border-4 border-border bg-[#0B2447] p-2 select-none shadow-inner">
            {/* 10x10 Grid */}
            <div
              className="grid h-full w-full gap-1"
              style={{
                gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
                gridTemplateRows: 'repeat(10, minmax(0, 1fr))',
              }}
            >
              {Array.from({ length: 100 }).map((_, idx) => {
                const x = idx % 10;
                const y = Math.floor(idx / 10);
                const shipName = placedMap.get(`${x},${y}`);

                return (
                  <div
                    key={`place-${x}-${y}`}
                    onClick={() => handleCellClick(x, y)}
                    className={`relative flex items-center justify-center rounded border transition-all text-[10px] font-black ${
                      shipName
                        ? 'border-border bg-slate-300 dark:bg-slate-700 text-ink shadow'
                        : 'border-sky-900/40 bg-sky-950/60 hover:bg-sky-800/60 cursor-pointer'
                    }`}
                  >
                    {shipName && <span className="opacity-80">{shipName.slice(0, 1)}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs font-bold text-ink-soft">
            <span>Orientation: <strong>{orientation === 'h' ? '↔ Horizontal' : '↕ Vertical'}</strong></span>
            <button
              type="button"
              disabled={you?.ready}
              onClick={() => setOrientation((prev) => (prev === 'h' ? 'v' : 'h'))}
              className="font-black text-coral hover:underline"
            >
              Rotate (Press R)
            </button>
          </div>
        </div>

        {/* Fleet Roster & Opponents Ready Status */}
        <div className="flex flex-col gap-4">
          <div className="card bg-surface p-4">
            <h3 className="font-black text-sm border-b-2 border-border pb-2">Warships ({ships.length}/5)</h3>
            <div className="mt-3 space-y-2">
              {BATTLESHIP_FLEET_DEF.map((def, idx) => {
                const placed = isShipPlaced(def.id);
                const isSelected = selectedShipIndex === idx;
                return (
                  <button
                    key={def.id}
                    type="button"
                    disabled={you?.ready}
                    onClick={() => setSelectedShipIndex(idx)}
                    className={`w-full flex items-center justify-between rounded-xl border-2 border-border p-2.5 text-xs font-black transition-all ${
                      isSelected
                        ? 'bg-amber/30 ring-2 ring-coral'
                        : placed
                          ? 'bg-surface-subtle text-ink'
                          : 'bg-surface text-ink-soft border-dashed'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{placed ? '🛳️' : '⚪'}</span>
                      <span>{def.name}</span>
                    </div>
                    <span className="rounded bg-surface border border-border px-1.5 py-0.5 text-[10px]">
                      {def.size} cells
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-ink-soft">
              Click a ship above, then click any cell on the ocean to position it.
            </p>
          </div>

          {/* Opponents Status */}
          <div className="card bg-surface p-4">
            <h3 className="font-black text-sm border-b-2 border-border pb-2">Captains Ready Status</h3>
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
                    {p.ready ? '✓ READY' : 'Deploying…'}
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:py-6">
      {/* Top Banner */}
      <div className="card flex flex-wrap items-center justify-between gap-3 bg-surface p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border bg-sky-600 text-xl text-white shadow-[0_2px_0_0_var(--color-shadow)]">
            🎯
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black sm:text-lg">
                {isYourTurn ? (
                  <span className="text-coral animate-pulse">👉 YOUR TURN TO FIRE!</span>
                ) : (
                  <span>{activePlayer?.name}'s Turn</span>
                )}
              </span>
              <span className="text-xs font-bold text-ink-soft">Turn #{battleship.turnCount}</span>
            </div>
            <p className="text-xs text-ink-soft">
              {isYourTurn
                ? `Pick an uncharted coordinate on ${targetPlayer?.name}'s radar grid to fire!`
                : `Waiting for ${activePlayer?.name} to fire…`}
            </p>
          </div>
        </div>

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
            Grid: 10x10
          </span>
        </div>
      </div>

      {/* Last Shot Alert */}
      {battleship.lastShot && (
        <div
          className={`rounded-xl border-2 border-border px-3 py-2 text-xs font-black shadow-[0_2px_0_0_var(--color-shadow)] animate-in fade-in ${
            battleship.lastShot.result === 'hit'
              ? 'bg-blush/20 text-blush border-blush'
              : 'bg-sky/20 text-ink border-sky-400'
          }`}
        >
          {battleship.lastShot.result === 'hit'
            ? `🔥 HIT! Missile struck target at (${COLS[battleship.lastShot.x]}${battleship.lastShot.y + 1})${
                battleship.lastShot.sunkShip ? ` and SANK the ${battleship.lastShot.sunkShip}! 💥` : '!'
              }`
            : `🌊 Splash! Torpedo missed at (${COLS[battleship.lastShot.x]}${battleship.lastShot.y + 1}).`}
        </div>
      )}

      {/* Target Selector Tabs (Essential for 2 to 4 Players!) */}
      {opponents.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 bg-surface p-2.5">
          <span className="text-xs font-black uppercase tracking-wider text-ink-soft mr-1">
            Target Fleet:
          </span>
          {opponents.map((opp) => {
            const isSelected = opp.id === targetId;
            return (
              <button
                key={opp.id}
                type="button"
                onClick={() => setTargetId(opp.id)}
                className={`flex items-center gap-2 rounded-xl border-2 border-border px-3 py-1.5 text-xs font-black transition-all ${
                  isSelected
                    ? 'bg-coral text-white shadow-[0_2px_0_0_var(--color-shadow)]'
                    : 'bg-surface hover:bg-surface-subtle text-ink'
                } ${!opp.alive ? 'opacity-40 line-through' : ''}`}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full border border-ink"
                  style={{ backgroundColor: opp.color }}
                />
                <span>{opp.name}</span>
                <span className="rounded bg-black/20 px-1 text-[10px]">
                  {opp.alive ? `🚢 ${opp.shipsRemaining} left` : '☠️ SUNK'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Dual Grids: Radar (Offense) & Your Ocean (Defense) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Radar: Targeting Opponent Waters */}
        <div className="card bg-surface p-3 sm:p-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-between pb-2 border-b-2 border-border mb-3">
            <h3 className="font-black text-sm text-coral flex items-center gap-1.5">
              <span>🎯 TARGETING RADAR</span>
              <span className="text-ink-soft">({targetPlayer?.name})</span>
            </h3>
            <span className="text-[11px] font-bold text-ink-soft">
              {targetPlayer?.alive ? `${targetPlayer.shipsRemaining} Ships Remaining` : 'Fleet Destroyed'}
            </span>
          </div>

          {/* 10x10 Radar Grid */}
          <div className="relative aspect-square w-full max-w-[380px] rounded-xl border-4 border-border bg-[#0B2447] p-1.5 select-none shadow-inner">
            <div
              className="grid h-full w-full gap-0.5 sm:gap-1"
              style={{
                gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
                gridTemplateRows: 'repeat(10, minmax(0, 1fr))',
              }}
            >
              {Array.from({ length: 100 }).map((_, idx) => {
                const x = idx % 10;
                const y = Math.floor(idx / 10);
                const shot = targetShotsMap.get(`${x},${y}`);
                const isTargetCell = !shot && isYourTurn && targetPlayer?.alive;

                return (
                  <div
                    key={`target-${x}-${y}`}
                    onClick={() => handleFire(x, y)}
                    className={`relative flex items-center justify-center rounded border transition-all text-xs font-black ${
                      shot?.result === 'hit'
                        ? 'border-red-600 bg-red-600/80 text-white shadow-lg animate-in zoom-in'
                        : shot?.result === 'miss'
                          ? 'border-sky-700 bg-sky-800/40 text-sky-200'
                          : isTargetCell
                            ? 'border-sky-900/60 bg-sky-950/60 hover:bg-coral/30 hover:border-coral cursor-crosshair'
                            : 'border-sky-900/40 bg-sky-950/40'
                    }`}
                  >
                    {shot?.result === 'hit' && '🔥'}
                    {shot?.result === 'miss' && '•'}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            {isYourTurn
              ? 'Click any open coordinate to fire a missile.'
              : 'Radar scans active.'}
          </p>
        </div>

        {/* Defense: Your Fleet Ocean */}
        <div className="card bg-surface p-3 sm:p-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-between pb-2 border-b-2 border-border mb-3">
            <h3 className="font-black text-sm text-sky-600 flex items-center gap-1.5">
              <span>🛡️ YOUR FLEET DEFENSE</span>
              <span className="text-ink-soft">(Your Waters)</span>
            </h3>
            <span className="text-[11px] font-bold text-ink-soft">
              {you ? `${you.shipsRemaining} Ships Alive` : ''}
            </span>
          </div>

          {/* 10x10 Defense Grid */}
          <div className="relative aspect-square w-full max-w-[380px] rounded-xl border-4 border-border bg-[#0B2447] p-1.5 select-none shadow-inner">
            <div
              className="grid h-full w-full gap-0.5 sm:gap-1"
              style={{
                gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
                gridTemplateRows: 'repeat(10, minmax(0, 1fr))',
              }}
            >
              {Array.from({ length: 100 }).map((_, idx) => {
                const x = idx % 10;
                const y = Math.floor(idx / 10);
                const hasShip = yourShipsMap.has(`${x},${y}`);
                const received = yourReceivedMap.get(`${x},${y}`);

                return (
                  <div
                    key={`defense-${x}-${y}`}
                    className={`relative flex items-center justify-center rounded border transition-all text-xs font-black ${
                      received === 'hit'
                        ? 'border-red-600 bg-red-700 text-white'
                        : received === 'miss'
                          ? 'border-sky-700 bg-sky-800/40 text-sky-300'
                          : hasShip
                            ? 'border-border bg-slate-300 dark:bg-slate-700 text-ink shadow'
                            : 'border-sky-900/40 bg-sky-950/60'
                    }`}
                  >
                    {received === 'hit' ? '💥' : received === 'miss' ? '•' : hasShip ? '⚓' : ''}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            Incoming attacks on your fleet are tracked above.
          </p>
        </div>
      </div>

      {/* Victory / Defeat Modal */}
      {battleship.phase === 'GAME_OVER' && winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="card mx-auto w-full max-w-md text-center bg-surface shadow-2xl border-4 border-coral">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-border bg-coral text-4xl shadow-[0_4px_0_0_var(--color-shadow)] text-white">
              🏆
            </div>
            <h2 className="mt-4 text-3xl font-black">NAVAL SUPREMACY!</h2>
            <p className="mt-2 text-lg">
              <strong className="text-coral" style={{ color: winner.color }}>
                {winner.name}
              </strong>{' '}
              sank all enemy fleets and conquered the ocean!
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {isHost ? (
                <>
                  <button
                    type="button"
                    className="btn-primary w-full"
                    onClick={() => client.restartRound()}
                  >
                    Play Again (Rematch) ⚓
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
                    Waiting for the host to restart match…
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
