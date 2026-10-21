# Manual test checklist

Automated tests cover the rules, the socket protocol, timers and disconnects. This list is for what they can't:
real browsers, real devices and real networks. Run it against `npm run dev` first, then against your deployed site.

Tip: each browser tab keeps its own session (`sessionStorage`), so two tabs in one browser are two players.
Saved lists and the remembered name live in `localStorage`, which tabs share. Use a private window or a second
browser if you want a player with separate saved lists.

## Setup
- [ ] `npm run dev`, open http://localhost:5173
- [ ] For phones on the same Wi-Fi: run the client with `npm run dev -w @whoami/client -- --host`, set the server's
      `CLIENT_ORIGIN` to `http://<your-ip>:5173` and the client's `VITE_SERVER_URL` to `http://<your-ip>:3001`.

## 2 players (2 browser tabs)
- [ ] Tab A creates a room, tab B joins from the **invite link** (`/?room=CODE`): one click after typing a name.
- [ ] A wrong code, a duplicate name (try different capitalisation) and a full room each show a clear message.
- [ ] Host picks Animals and starts. Each tab sees the other's identity and "Your identity is hidden from you." on its own card.
- [ ] The active player asks a question, the other answers, the reveal shows names, the next turn starts (automatically or via **Next turn**).
- [ ] Wrong guess: "Not quite! Keep investigating.", the turn passes, the identity stays hidden, the score never shows below 0.
- [ ] Correct guess: your identity appears on your card only; the round ends with results (2-player endgame, nothing gets stuck).
- [ ] **Play again** starts a new round with new identities and the *other* player starting. Scores accumulate.
- [ ] **Back to lobby** works; the host can change settings and start again.

## 3 players
- [ ] A solved player keeps answering others' questions and is skipped as asker.
- [ ] The round ends when only one unsolved player remains.
- [ ] Host **Skip turn**, **Skip answer** and **End round** (a confirmation dialog, not a browser alert) work; non-host tabs don't show them.
- [ ] The host removes a player in the lobby; the removed tab is told and returns to Home; they can rejoin.

## 5 players
- [ ] Five tabs fill the room; a sixth is refused with "This room is full."
- [ ] A full cycle of questions reads clearly; the status banner always says whose turn it is and what you should do.
- [ ] Turn limit: set **Turns per player** to 3 and play it out; the round ends only after everyone has had 3 turns.

## Timers
- [ ] Timers off: no countdown anywhere; nothing happens on its own however long you wait (apart from the short reveal pause).
- [ ] Turn limit 30s: a countdown shows, an idle player is skipped, three skips in a row show **AFK** and the host can remove them.
- [ ] Answer limit 15s + **Host decides**: after time-up the host sees the prompt and uses **Skip answer**.
- [ ] Answer limit 15s + **Auto "Not sure"**: missing answers are filled automatically and marked `(auto)`.
- [ ] Set one device's clock a few minutes wrong: its countdown still matches the others (the server's clock is used).
- [ ] Settings can't be changed mid-round (the lobby controls are gone once the game starts).

## Disconnects and reconnection
- [ ] Reload a player's tab mid-round: they land back in the same seat with the same score, still not seeing their own identity.
- [ ] Close a player's tab for under 60s, then reopen: normal. Over 60s while they owe an answer: counted as Not sure.
- [ ] Close the **host** tab: the others see "Game paused". Reopen within 60s: play resumes and timers continue where they were.
- [ ] Keep the host away for over 60s: the next player becomes host, the game resumes, and they have the host controls.
- [ ] Open the same session in a second tab (duplicate the tab): the older tab is told it was signed out.
- [ ] Stop the server mid-game and restart it: clients show "Reconnecting…", then "Your previous room has ended".

## Custom lists
- [ ] Paste a list with blank lines and duplicates: the count ignores them and says how many.
- [ ] Fewer than 10 items, fewer items than players, an item over 60 characters, and 501+ items each give a helpful message and block **Use this list**.
- [ ] Save a list, reload the page, find it on Home and in the lobby; delete it with the confirmation dialog.
- [ ] Export JSON and text, import both back; a broken JSON file shows an error.
- [ ] Use a name or list item like `<img src=x onerror=alert(1)>`: it appears as plain text everywhere (lobby, cards, history, results) and nothing runs.

## Mobile (real phones, portrait and landscape)
- [ ] Home, lobby, game and results fit without horizontal scrolling at 360px width.
- [ ] Tap targets are comfortable; Yes / No / Not sure are easy to hit.
- [ ] The on-screen keyboard doesn't hide the question input; copying the invite link works (or degrades gracefully).
- [ ] Switching apps (for example to Discord) and back reconnects without losing the seat.

## Throttled or flaky network
- [ ] Chrome DevTools → Network → **Slow 4G**: create, join and play a turn; buttons give instant feedback and nothing double-submits.
- [ ] **Offline** for a few seconds mid-turn, then back online: the banner appears and clears and the game catches up.
- [ ] Double-click **Ask**, **Guess** and **Yes**: only one action is recorded.
- [ ] First load against a sleeping free-tier server shows **Waking up the server…** and enables the form when it is ready.

## Public-site checks (deployed)
- [ ] The frontend works over HTTPS and connects with `wss://` (no mixed-content errors in the console).
- [ ] `https://<server>/health` returns `{"ok":true}`; a page on another origin can't open a WebSocket to the server.
- [ ] Creating several rooms quickly hits the rate-limit message instead of succeeding forever.
