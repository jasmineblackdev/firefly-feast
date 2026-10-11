# Firefly Feast

A real-time browser multiplayer family game. React + Canvas client, Node.js + WebSockets authoritative server. Up to eight players per room; no accounts or installs.

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

## Deploy the frontend to Vercel and the WebSocket server to Render

**Recommended production architecture:** Vercel hosts the React/Vite website; Render runs the persistent Node.js WebSocket server. Standard Vercel serverless functions are not a drop-in host for this persistent WebSocket server.

### 1. Deploy the WebSocket server on Render

1. Push this project to a GitHub repository.
2. In Render, choose **New + → Web Service** and connect the repository.
3. Set **Runtime** to Node.
4. Set **Build Command** to `npm install && npm run build`.
5. Set **Start Command** to `npm start`.
6. Deploy, then copy the service URL, for example `https://firefly-feast-server.onrender.com`.
7. Check `https://YOUR-RENDER-SERVICE.onrender.com/health`; it should return JSON indicating the service is healthy.

### 2. Deploy the website on Vercel

1. In Vercel, choose **Add New → Project** and import the same GitHub repository.
2. Set **Framework Preset** to **Vite**.
3. Set **Root Directory** to the repository root (the folder containing `package.json`).
4. Use `npm run build` as the build command and `dist` as the output directory. The install command can remain `npm install`.
5. Under **Project Settings → Environment Variables**, add:
   - Name: `VITE_WS_URL`
   - Value: `wss://YOUR-RENDER-SERVICE.onrender.com/ws` (replace the hostname with your real Render service URL; use `wss://`, not `https://`).
6. Apply the variable to Production (and Preview if desired), then deploy or redeploy the project.
7. Open the Vercel HTTPS URL on your devices. The website will connect to the Render WebSocket server automatically.

`VITE_WS_URL` is embedded into the frontend at build time. If you change it, trigger a new Vercel deployment. Do not include secrets in `VITE_` variables.

### Local development

No `VITE_WS_URL` is needed locally: Vite proxies `/ws` to `ws://localhost:3001`. Run `npm install` and `npm run dev`, then open `http://localhost:5173`.

### Hosting caveats

Rooms and match state live in Render server memory. A server restart/deploy or sleeping free instance clears active rooms. Free-tier availability and sleep behavior can change by provider policy. A single server instance is assumed; do not scale to multiple instances without adding shared state/pub-sub. Vercel deploys only the frontend in this setup; the multiplayer server remains on Render.

### Hosting caveats

Rooms and match state live in memory. A server restart/deploy or sleeping free instance clears all active rooms. The app handles ordinary player disconnects with a 30-second seat-reclaim window, but that cannot survive a server restart. A single server instance is assumed; do not scale to multiple instances without adding shared state/pub-sub. Free-tier availability and sleep behavior can change by provider policy.

## How to test

1. Open the public URL in one browser and create a room.
2. Copy the invite link or room code and open it on several phones/laptops.
3. Join with different names; verify the same player list and colors appear on every screen.
4. Test touch dragging on a phone and WASD/arrow keys plus Space on a keyboard.
5. Confirm dewdrop/star scores, rain knockback, dropped dewdrops, dash boops, and blinking protection.
6. Start a match and verify the 3-2-1 countdown, 60-second round, results, Next round, and final three-round match ranking.
7. Refresh a joined player's page and return within 30 seconds to test seat recovery. Close the host browser and verify host migration.
8. Try a wrong room code and a full room (8 players) to test friendly errors.

## Current implementation notes

- Four-character room codes use A–Z excluding I and O.
- The server simulates movement and scoring at 20 Hz and sends snapshots to all connected room members.
- Round results allow a host to start the next round; the final results allow a fresh match or return to the lobby.
- Match points: 1st 3, 2nd 2, 3rd 1. Tied positions share their position's points and later positions are skipped. After Round 3, match points decide the winner; cumulative round dewdrops break a match-point tie, otherwise co-champions are declared.
