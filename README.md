# Playdeck

*Real-time multiplayer browser party games for friends, game nights, and Discord calls.*

Playdeck is an open-source real-time multiplayer party portal featuring 3 distinct games built with zero accounts, zero databases, and instant room code sharing.

### 🎮 Featured Games
1. **Blindspot** (2–5 Players): *Everyone can see who you are, except you.* Ask questions, make guesses, and deduce your secret identity.
2. **Barricade** (2–4 Players): *King of the Hill Tactical Maze.* Race your pawn to the crown at the center of the grid, roll dice, and strategically deploy barricades to block rivals.
3. **Battleship** (2–4 Players): *Free-for-All Naval Warfare.* Deploy your 5-warship fleet secretly, then track and fire artillery across multiple opponent radar screens simultaneously.

- No accounts, no database, no paid services. Rooms live in memory, joined with a short code or an invite link (`/?room=ABCDE`).
- Server-authoritative: the server verifies moves, validates collisions/bounds, owns timers, and enforces fog-of-war privacy snapshots.

## Contents
[How it plays](#how-it-plays) · [Repo layout](#repo-layout) · [Setup](#setup) · [Develop](#develop) · [Test](#test) · [Configuration](#configuration) · [Deploy](#deploy) · [Known limitations](#known-limitations) · [Security notes](#security-notes)

## How it plays

Playdeck features 3 distinct multiplayer games within a unified room lobby and real-time WebSocket protocol:

### 1. Blindspot (2–5 Players)
*Deduce who you are before everyone else.*
- **Setup:** The host selects a built-in category (Pop Culture, Animals, History, Video Games, etc.) or creates a custom list.
- **Identity Assignment:** Each player is secretly assigned a character or object that *everyone else can see except them*.
- **The Turn:** Ask a question (e.g., *"Am I fictional?"*) or attempt a direct guess (never both). Other players answer simultaneously with private responses that reveal together once everyone responds.
- **Scoring & Endgame:** Correct guesses earn points (+1, plus optional speed bonuses). Wrong guesses forfeit the turn and apply a small penalty. Solved players remain as judges so rounds never stall.

### 2. Barricade (2–4 Players)
*King of the Hill tactical race and maze builder.*
- **Objective:** First pawn to step onto the golden crown at coordinate **F6 (5, 5)** wins the match.
- **Board & Movement:** 11×11 grid (121 tiles). On your turn, choose between moving your pawn 1 orthogonal step (jumping over adjacent opponents is allowed) or placing a 2-segment barricade.
- **Wall Strategy:** Place customizable barricades (configurable from **5 to 10 walls per player** with up/down stepper or direct numeric entry). Walls span between tile intersections horizontally or vertically (`R` or `Space` to rotate).
- **Fairness Guarantee:** The server enforces pathfinding validation (BFS) to guarantee that placed walls never completely trap any player from reaching the crown.

### 3. Battleship (2–4 Players)
*Multiplayer naval radar combat with real-time fog of war.*
- **Fleet Deployment:** Deploy your 5-warship armada across a 10×10 oceanic grid:
  - Carrier (5 cells), Battleship (4 cells), Cruiser (3 cells), Submarine (3 cells), Destroyer (2 cells).
  - Intuitive controls: Click/drag with live green/red ghost preview, instant rotation via <kbd>R</kbd>, <kbd>Space</kbd>, right-click, or on-board ship click, plus quick randomize.
- **Multi-Target Radar Warfare:** Switch between opponents' radar screens using dedicated target tabs. Call artillery strikes on enemy grids with instant hit/miss and ship-sunk feedback.
- **Turn Rotation & Elimination:** When a fleet is entirely sunk, that player is eliminated from firing but can spectate remaining warfare until the last fleet stands.

---

### Universal Platform Features
- **No accounts or signups:** Rooms live strictly in memory; join instantly with a 5-letter code or invite link (`/?room=ABCDE`).
- **Resilient reconnects:** Seamless automatic reconnection tokens preserve your seat, active turns, and game states across browser refreshes or network hiccups.
- **Timers & host controls:** Host-configurable timers (off / 15s / 30s / 45s / 60s) with automatic skip and AFK protection to keep party games moving smoothly.
- **Privacy & security:** Server-authoritative engine verifies every move and sends fog-of-war filtered snapshots so secret identities and hidden warships can never be inspected in client network logs.

## Repo layout

```
shared/   Zod schemas, event payload types, phase enums, snapshot types (single source of truth for the protocol)
server/   Node + TypeScript + Socket.IO (Express only serves /health)
  src/game/      pure game state machine: reduce(state, action, ctx) -> new state + events (no networking, no clocks)
  src/gameServer.ts   sockets, sessions, rate limits, per-room timer scheduling
client/   React 19 + TypeScript + Vite 7 + Tailwind CSS 4
docs/MANUAL_TESTING.md   checklist for real browsers, phones and bad networks
render.yaml              Render blueprint for the server
```

Tailwind **v4** is used with the `@tailwindcss/vite` plugin (no `tailwind.config.js`; theme tokens live in `client/src/index.css`).

## Setup

Requires Node **22.9+** (see `.nvmrc`) and npm 10+.

```bash
npm install
```

## Develop

```bash
npm run dev
```

This builds `shared`, then starts the server on <http://localhost:3001> and the client on <http://localhost:5173>. Open the client in two tabs
(each tab is its own player) to try it. Defaults work with no configuration; copy `server/.env.example` to `server/.env` and `client/.env.example` to
`client/.env` to change them. `server/.env` is loaded by `npm run dev`; the client reads `VITE_*` variables at build/dev time.

## Test

```bash
npm run build   # shared -> server -> client (typecheck + production bundle)
npm run test    # shared build, then server and client test suites
```

- `server/test/*.test.ts`: the pure game engine (rules, scoring, timers, disconnects, privacy) and **Socket.IO integration tests** that use
  `socket.io-client` to simulate 2–5 players, including full multi-round games, rate limits, room expiry, reconnects and leak checks.
  Time-based tests run on a shortened clock (`timerScale`, `disconnectGraceMs` config knobs that stay at 1 / 60 s in production).
- `client/src/test`: the client store (sessions, resume, errors), screens and the list editor, with React Testing Library.
- Real devices and networks: follow [`docs/MANUAL_TESTING.md`](docs/MANUAL_TESTING.md).

There is no linter configured, so there is no `npm run lint`.

## Configuration

### Server (`server/`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Port to listen on (hosts usually inject this). |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed frontend origin(s), comma separated, no trailing slash. **Required when `NODE_ENV=production`** (the server refuses to start without it). Used for CORS on `/health` and to reject WebSocket handshakes from other sites. |
| `TRUST_PROXY_HOPS` | `0` | Number of trusted reverse proxies in front of the server (Render/Railway/Fly: `1`). Used to find the real client IP for rate limits. Don't set it higher than the truth. |
| `MAX_ROOMS_PER_IP` | `3` | Active rooms one IP may have created. |
| `MAX_ROOMS` | `2000` | Total rooms the server will hold. |
| `CREATE_ROOM_LIMIT` | `5` | Rooms one IP may create per 10 minutes. |
| `JOIN_LIMIT_PER_MIN` | `30` | Join/resume attempts per IP per minute (also slows code guessing). |

Fixed in code: rooms are deleted after 30 minutes with nobody connected, max message size 64 KB, 60 s disconnect grace.

### Client (`client/`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERVER_URL` | `http://localhost:3001` | URL of the game server (HTTPS in production, no trailing slash). Baked in at build time. |

## Deploy

The frontend is a static site; the backend needs a host that supports WebSockets and keeps **one** long-lived Node process
(rooms are in memory, so don't scale to more than one instance). Deploy the server first so you know its URL.

### 1. Backend (Render, Railway or Fly)

**Render** (blueprint included): create a new *Blueprint* from this repo, or a *Web Service* with:

- Build command: `npm ci && npm run build -w @whoami/shared && npm run build -w @whoami/server`
- Start command: `npm run start -w @whoami/server`
- Health check path: `/health`
- Environment: `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, `CLIENT_ORIGIN=https://<your-frontend-domain>`, Node 22+
- Instances: exactly **1**

**Railway:** same build/start commands, add the same variables, expose the service publicly (it provides `PORT`).
**Fly.io:** needs a `Dockerfile` (not included): build with the same commands, run `node server/dist/index.js`, one machine, set `TRUST_PROXY_HOPS=1`.

Check it: `curl https://<server>/health` → `{"ok":true}`.

### 2. Frontend (Vercel, Netlify or Cloudflare Pages)

Connect the repo, with the **repository root** as the project root (it's an npm workspace), and set:

| Setting | Value |
|---|---|
| Install command | `npm ci` |
| Build command | `npm run build -w @whoami/client` |
| Output directory | `client/dist` |
| Environment variable | `VITE_SERVER_URL=https://<your-server-domain>` |

The app is a single page driven by the `?room=CODE` query string, so no rewrite rules are needed.
Then put the frontend's final URL into the server's `CLIENT_ORIGIN` (exact origin, e.g. `https://blindspot.pages.dev`, no path) and redeploy the server.
Use HTTPS for both so the browser connects over `wss://`.

### 3. Smoke test

Open the site in two browsers, create a room in one and join from the invite link in the other, then work through [`docs/MANUAL_TESTING.md`](docs/MANUAL_TESTING.md).

## Known limitations

- **Rooms live in memory.** A server restart or redeploy ends every game; players see "Your previous room has ended". Only one server instance is supported.
- **Answers are on the honor system.** The people answering see your identity (that's the game). Nothing stops a friend on Discord from blurting it out,
  and the server can't know whether "Yes" was true.
- **Free-tier cold starts.** Free hosts sleep when idle; the first visit can take up to a minute. The home screen shows "Waking up the server…" while it connects.
- **Saved lists are per browser.** They live in `localStorage` and don't sync across devices (export a file to move one). Clearing site data deletes them.
- **No accounts.** Your seat is tied to a token kept in that browser tab (`sessionStorage`); closing the tab for good means rejoining with a new name.
- **Rate limits are per IP.** Players sharing one network (a school, an office) share the room-creation and join budgets.
- **Only built-in categories have server-side lists;** the hand-written built-in lists are small (24 items each).
- Late joiners can't enter a round in progress; they can join between rounds.

## Security notes

This is a small hobby project, not a hardened service. What it does: validates every incoming event with shared Zod schemas, never trusts client-supplied
IDs/turns/scores/host status, binds each socket to a server-held session, sends per-player filtered snapshots, compares reconnect tokens in constant time, restricts
CORS and WebSocket origins, rate-limits room creation, joins and repeated invalid actions per IP, caps message and list sizes, and renders all user text as plain text.
What it doesn't do: authenticate people (anyone with a room code can join), encrypt beyond what your host's HTTPS provides, or survive a determined attacker.
Don't reuse any of it for anything sensitive.
