# Firefly Feast

A real-time browser multiplayer family game. React + Canvas client, Node.js + WebSockets authoritative server. Up to eight players per room; no accounts or installs.

## Project structure

```
server.js                  Express + ws game server (authoritative state, 20Hz snapshots)
index.html                 Vite entry
client/src/
  main.jsx                 App, screens (home / lobby / play / results), connection handling
  GameCanvas.jsx           The arena: rAF render loop, touch + keyboard input
  styles.css               Design tokens and every screen style
  art/palette.js           Colour palette and the eight player skins (shared with CSS tokens)
  art/firefly.js           The firefly character sheet + the canvas drawing routine
  art/Firefly.jsx          The same character as SVG, for menus and results
  render/arena.js          The woodland clearing, pre-baked once to an offscreen canvas
  render/sprites.js        Dewdrops, stars, raindrops, fireflies
  render/effects.js        Local-only feedback: sparkles, splashes, trails, score popups
  fonts/                   Self-hosted Nunito + Fraunces (OFL, see fonts/LICENSE.md)
```

Two rules hold this together:

1. **The server owns the game.** Movement, collisions, scoring, rounds and match points are
   all computed in `server.js` and sent to every client 20 times a second. Nothing in
   `client/src/render/` can change them — the effects layer only *reads* snapshots and
   diffs them to decide which sparkle to draw.
2. **Snapshots do not re-render React.** The arena reads the latest snapshot from a ref on
   every animation frame, while the HUD commits at most every 150ms, and only when a value
   it displays actually changed.

## Requirements

- Node.js 20+ (Node 22 recommended)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. To test multiple players on one computer, open separate browser profiles or private windows. For testing phones on the same Wi-Fi, open the Vite dev-server URL using your computer's LAN IP (the terminal/network must allow inbound connections); for a reliable cross-network test, deploy the app and use its public HTTPS URL.

Production build and server:

```bash
npm run build
npm start
```

The Node server serves the built frontend and the WebSocket endpoint from the same origin. `GET /health` returns a small health response.

## Deploy it so your family can play

Firefly Feast is **one Node app**. The same server hands out the web page *and* runs the
WebSocket game at `/ws` on one port, because the rooms, scores and timers live in that
server's memory. That is why it cannot run on serverless functions: every request would
land on a different copy with no memory of your room. You need one always-on server.

Render's free Web Service is exactly that, and the steps below are the whole job.

### Step 1 — Put the code on GitHub

If you have never done this, run these in the project folder, one line at a time:

```bash
git init
git add .
git commit -m "Firefly Feast"
```

Then make an empty repository on GitHub (github.com/new — no README, no .gitignore) and
copy the two commands GitHub shows you under "push an existing repository". They look like:

```bash
git remote add origin https://github.com/YOUR-USERNAME/firefly-feast.git
git push -u origin main
```

### Step 2 — Create the Render service

1. Sign up at **render.com** (the free plan needs no credit card).
2. Click **New +** → **Web Service**.
3. Click **Build and deploy from a Git repository** → **Next**, then connect your GitHub
   account and pick the `firefly-feast` repository.
4. Fill in the form:
   - **Name:** `firefly-feast` (this becomes your web address)
   - **Language / Runtime:** `Node`
   - **Branch:** `main`
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Leave everything else alone. You do **not** need to set a `PORT` — Render provides it
   and the server reads it automatically.
6. Click **Deploy Web Service** and wait. The first build takes a few minutes. You are
   done when the log says `Firefly Feast server listening on …` and the page shows **Live**.

`render.yaml` in this project already holds all of those settings, so if you prefer you can
instead use **New +** → **Blueprint**, pick the repository, and Render fills the form in
for you.

> The build command must be `npm install --include=dev`. Render sets `NODE_ENV=production`,
> and plain `npm install` would then skip Vite, which is what builds the web page.

### Step 3 — Check it works

Render gives you an address like `https://firefly-feast.onrender.com`.

1. Open `https://YOUR-NAME.onrender.com/health` — it should say `ok`.
2. Open `https://YOUR-NAME.onrender.com` on your phone. Create a game, and open the invite
   link on a second phone.

That is the whole game, hosted free. **Share this Render address with your family.**

### Good to know about the free plan

A free Render service goes to sleep after about 15 minutes with nobody on it, and takes
roughly a minute to wake up. So the *first* tap after a quiet spell can show
"Can't reach the game server" — tap **Try again** and it will come up. Opening the
`/health` address first is a good way to wake it before game night. Sleeping also clears
any rooms in progress, which is fine between sessions.

### Optional — keep the Vercel front-end

If you want to keep `https://firefly-feast-w1zu.vercel.app` as the address you share,
Vercel can serve the web page while Render runs the game:

1. In Vercel, open the project → **Settings** → **Environment Variables**.
2. Add **Name** `VITE_SERVER_URL`, **Value** `https://YOUR-NAME.onrender.com`
   (your Render address — no `/ws` needed, the app adds it).
3. Apply it to **Production**, then **Deployments** → **Redeploy**.

`VITE_SERVER_URL` is baked into the web page when it builds, so after changing it you must
redeploy for it to take effect. With nothing set, the app talks to whatever host served the
page — which is what makes the plain Render deploy work with no configuration at all.

Keeping both means two places to deploy. The Render address alone is simpler, and works
just as well.

### Hosting caveats

Rooms, scores and match state live in server memory. A restart, a new deploy, or a free
instance going to sleep clears any room in progress; ordinary player drop-outs are handled
by the 30-second seat-reclaim window, but that cannot survive a server restart. This
assumes a single server instance — do not scale to several without adding shared state.

## How to test on two phones

Open the deployed address on both phones (not the local dev server).

- [ ] **Phone A** taps *Start a new game* and sees a 4-letter room code.
- [ ] **Phone B** joins by typing that code.
- [ ] **Phone B** leaves the room, then joins again using the invite link instead
      (*Copy invite link* on Phone A, send it over, tap it).
- [ ] Typing a code that does not exist shows a friendly error, not a dead button.
- [ ] Only Phone A (the host) sees *Start match*; Phone B sees "Waiting for host to start…".
- [ ] During a round, both phones show the same firefly positions, the same scores and the
      same countdown.
- [ ] Turn Phone B's Wi-Fi off for 10 seconds, then back on: a "Reconnecting…" banner shows
      while it is off, disappears when it comes back, and Phone B still has its score and seat.
- [ ] After 3 rounds, the match winner screen appears on both phones.

Also worth a look: the *How to play* link on the home screen, and the same rules in the
lobby, should list dewdrops, stars, rain, dash/boop and the 3-round scoring.

## Current implementation notes

- Four-character room codes use A–Z excluding I and O.
- The server simulates movement and scoring at 20 Hz and sends snapshots to all connected room members.
- Round results allow a host to start the next round; the final results allow a fresh match or return to the lobby.
- Match points: 1st 3, 2nd 2, 3rd 1. Tied positions share their position's points and later positions are skipped. After Round 3, match points decide the winner; cumulative round dewdrops break a match-point tie, otherwise co-champions are declared.
