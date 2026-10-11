import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const app = express();
app.use(express.static(path.join(__dirname, 'dist')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'Firefly Feast' }));
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), err => { if (err) res.status(404).send('Build the client first with npm run build.'); });
});
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
const COLORS = ['#65F6D0','#FFB45E','#C5A4FF','#FF7FA8','#7ED7FF','#F6E96B','#A8F078','#FF927A'];
const MAX_PLAYERS = 8;
const TICK_MS = 50;
const ARENA = 1000;

function code4() {
  let code;
  do { code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(code));
  return code;
}
function token() { return randomBytes(24).toString('hex'); }
function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function safeName(value) { return String(value || 'Firefly').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 18) || 'Firefly'; }
function send(ws, data) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function broadcast(room, data) { const packet = JSON.stringify(data); for (const p of room.players.values()) if (p.ws?.readyState === WebSocket.OPEN) p.ws.send(packet); }
function announce(room, text, kind = 'pop') {
  room.events.push({ id: randomUUID(), text, kind, at: Date.now() });
  if (room.events.length > 5) room.events.shift();
}
function getPlayer(room, id) { return room?.players.get(id); }
function isHost(room, player) { return !!room && !!player && room.hostId === player.id; }
function makeDewdrop() { return { id: randomUUID(), x: rand(65, 935), y: rand(75, 925), r: 10 }; }
function createRoom() { return { code: code4(), players: new Map(), hostId: null, phase: 'lobby', round: 0, deadline: 0, countdownEnd: 0, nextStarAt: 0, star: null, dewdrops: Array.from({ length: 25 }, makeDewdrop), rain: [], events: [], createdAt: Date.now(), lastTick: Date.now(), lastSnapshot: 0 }; }
function publicPlayer(p) {
  return { id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, score: p.score, matchPoints: p.matchPoints, totalScore: p.totalScore, place: p.place, connected: p.connected, isHost: false, stunned: p.stunnedUntil > Date.now(), invulnerable: p.invulnUntil > Date.now(), dashing: p.dashUntil > Date.now(), dashReady: p.dashCooldownUntil <= Date.now() };
}
function snapshot(room, viewerId) {
  const players = [...room.players.values()].map(p => ({ ...publicPlayer(p), isHost: p.id === room.hostId }));
  return { type: 'state', room: room.code, phase: room.phase, round: room.round, maxRounds: 3, deadline: room.deadline, countdownEnd: room.countdownEnd, serverNow: Date.now(), hostId: room.hostId, me: viewerId, players, dewdrops: room.dewdrops, rain: room.rain, star: room.star, events: room.events.slice(-4), maxPlayers: MAX_PLAYERS };
}
function pushState(room) {
  for (const p of room.players.values()) send(p.ws, snapshot(room, p.id));
}
function assignHost(room) {
  const next = [...room.players.values()].find(p => p.connected);
  room.hostId = next?.id || null;
  if (next) announce(room, `👑 ${next.name} is the new host!`);
}
function resetRound(room, newRound) {
  room.round = newRound;
  room.phase = 'lobby';
  room.deadline = 0; room.countdownEnd = 0;
  room.dewdrops = Array.from({ length: 25 }, makeDewdrop);
  room.rain = []; room.star = null; room.nextStarAt = Date.now() + 7000;
  for (const p of room.players.values()) {
    p.score = 0; p.x = rand(150, 850); p.y = rand(200, 850); p.vx = 0; p.vy = 0;
    p.input = { x: 0, y: 0 }; p.dashUntil = 0; p.dashCooldownUntil = 0; p.stunnedUntil = 0; p.invulnUntil = 0; p.lastBoopAt = 0;
  }
}
function beginCountdown(room) {
  if (room.phase !== 'lobby' || [...room.players.values()].filter(p => p.connected).length < 1) return;
  room.phase = 'countdown'; room.countdownEnd = Date.now() + 3000;
  room.deadline = room.countdownEnd + 60000;
  room.dewdrops = Array.from({ length: 25 }, makeDewdrop); room.rain = []; room.star = null; room.nextStarAt = room.countdownEnd + 7000;
  for (const p of room.players.values()) { p.score = 0; p.x = rand(150, 850); p.y = rand(200, 850); p.vx = 0; p.vy = 0; p.input = { x: 0, y: 0 }; p.dashUntil = 0; p.dashCooldownUntil = 0; p.stunnedUntil = 0; p.invulnUntil = 0; }
  announce(room, `Round ${room.round} is starting!`, 'system');
}
function dropDewdrops(room, p, count = 2) {
  for (let i = 0; i < count; i++) {
    room.dewdrops.push({ id: randomUUID(), x: clamp(p.x + rand(-25, 25), 25, 975), y: clamp(p.y + rand(-25, 25), 25, 975), r: 9, dropped: true });
  }
  while (room.dewdrops.length > 40) room.dewdrops.shift();
}
function knockback(target, fromX, fromY, strength = 300) {
  let dx = target.x - fromX, dy = target.y - fromY;
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  target.vx = dx * strength; target.vy = dy * strength;
  target.stunnedUntil = Date.now() + 550;
  target.invulnUntil = Date.now() + 1500;
}
function finishRound(room) {
  room.phase = room.round >= 3 ? 'matchResults' : 'roundResults';
  room.deadline = 0; room.star = null; room.rain = [];
  const ordered = [...room.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let place = 1;
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && ordered[i].score < ordered[i - 1].score) place = i + 1;
    ordered[i].place = place;
    ordered[i].totalScore += ordered[i].score;
  }
  // Shared placements share the points for the occupied positions; the next occupied place is skipped.
  for (const p of ordered) p.matchPoints += p.place === 1 ? 3 : p.place === 2 ? 2 : p.place === 3 ? 1 : 0;
  announce(room, room.phase === 'matchResults' ? '🏆 Match complete!' : `Round ${room.round} complete!`, 'system');
}
function processInput(room, p, msg) {
  if (msg.type === 'input') {
    let x = Number(msg.x), y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.input = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  } else if (msg.type === 'dash') {
    const now = Date.now();
    if (room.phase !== 'playing' || now < p.dashCooldownUntil || now < p.stunnedUntil) return;
    p.dashUntil = now + 280;
    p.dashCooldownUntil = now + 1600;
  }
}
function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', message: 'That message did not make sense. Please try again.' }); }
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'create') {
    const name = safeName(msg.name); const room = createRoom(); const id = randomUUID(); const reconnectToken = token();
    const p = makePlayer(id, reconnectToken, name, ws, room);
    room.players.set(id, p); room.hostId = id; rooms.set(room.code, room);
    ws.meta = { room: room.code, playerId: id };
    send(ws, { type: 'welcome', room: room.code, playerId: id, token: reconnectToken, isHost: true }); pushState(room); return;
  }
  if (msg.type === 'join' || msg.type === 'resume') {
    const code = String(msg.room || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); const room = rooms.get(code);
    if (!room) return send(ws, { type: 'error', message: 'We couldn’t find that room. Check the 4-letter code and try again.' });
    let p;
    if (msg.type === 'resume') {
      p = [...room.players.values()].find(candidate => candidate.token === msg.token && candidate.id === msg.playerId);
      if (!p || (p.disconnectedAt && Date.now() - p.disconnectedAt > 30000)) return send(ws, { type: 'error', message: 'Your seat expired. Please join the room again.' });
      if (p.ws && p.ws !== ws) try { p.ws.close(); } catch {}
      p.ws = ws; p.connected = true; p.disconnectedAt = 0; p.name = safeName(msg.name || p.name);
      announce(room, `✨ ${p.name} is back!`);
    } else {
      if (room.players.size >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'This room is full (8 fireflies). Try another room.' });
      const id = randomUUID(); p = makePlayer(id, token(), safeName(msg.name), ws, room);
      room.players.set(id, p); if (!room.hostId) room.hostId = id;
      announce(room, `✨ ${p.name} joined the garden!`);
    }
    ws.meta = { room: code, playerId: p.id };
    send(ws, { type: 'welcome', room: code, playerId: p.id, token: p.token, isHost: p.id === room.hostId }); pushState(room); return;
  }
  const room = rooms.get(ws.meta?.room); const p = getPlayer(room, ws.meta?.playerId);
  if (!room || !p) return;
  if (msg.type === 'input' || msg.type === 'dash') processInput(room, p, msg);
  if (msg.type === 'start' && isHost(room, p) && room.phase === 'lobby') {
    if (room.round === 0) { for (const player of room.players.values()) { player.matchPoints = 0; player.totalScore = 0; } room.round = 1; }
    beginCountdown(room);
  }
  if (msg.type === 'nextRound' && isHost(room, p) && room.phase === 'roundResults') {
    resetRound(room, room.round + 1); announce(room, `Ready for round ${room.round}?`, 'system');
  }
  if (msg.type === 'backLobby' && isHost(room, p) && (room.phase === 'roundResults' || room.phase === 'matchResults' || room.phase === 'lobby')) {
    room.round = 0; room.phase = 'lobby'; room.deadline = 0; room.countdownEnd = 0; room.star = null; room.rain = []; room.dewdrops = Array.from({ length: 25 }, makeDewdrop);
    for (const player of room.players.values()) { player.score = 0; player.matchPoints = 0; player.totalScore = 0; player.place = null; player.input = { x: 0, y: 0 }; }
    announce(room, 'Back in the lobby. Ready for a new match?', 'system');
  }
  if (msg.type === 'playAgain' && isHost(room, p) && room.phase === 'matchResults') {
    for (const player of room.players.values()) { player.score = 0; player.matchPoints = 0; player.totalScore = 0; player.place = null; }
    room.round = 0; room.phase = 'lobby'; room.deadline = 0; room.star = null; room.rain = []; room.dewdrops = Array.from({ length: 25 }, makeDewdrop);
    announce(room, 'A fresh match is ready!', 'system');
  }
  pushState(room);
}
function makePlayer(id, reconnectToken, name, ws, room) {
  const usedColors = new Set([...(room?.players.values() || [])].map(player => player.color));
  const availableColor = COLORS.find(color => !usedColors.has(color));
  return { id, token: reconnectToken, name, color: availableColor || COLORS[(Math.random() * COLORS.length) | 0], x: rand(150, 850), y: rand(150, 850), vx: 0, vy: 0, input: { x: 0, y: 0 }, score: 0, matchPoints: 0, totalScore: 0, place: null, connected: true, disconnectedAt: 0, ws, dashUntil: 0, dashCooldownUntil: 0, stunnedUntil: 0, invulnUntil: 0, lastBoopAt: 0 };
}
function tickRoom(room, now) {
  // Lobby warm-up: movement is live, but there are no points, hazards, or collisions.
  if (room.phase === 'lobby') {
    const dt = TICK_MS / 1000;
    for (const p of room.players.values()) {
      if (!p.connected) continue;
      const ix = p.input.x, iy = p.input.y, len = Math.hypot(ix, iy) || 1;
      p.vx += (ix / len * 210 - p.vx) * 0.25;
      p.vy += (iy / len * 210 - p.vy) * 0.25;
      p.x = clamp(p.x + p.vx * dt, 24, 976); p.y = clamp(p.y + p.vy * dt, 24, 976);
    }
  }
  if (room.phase === 'countdown' && now >= room.countdownEnd) { room.phase = 'playing'; room.deadline = now + 60000; announce(room, '✨ GO! Collect those dewdrops!', 'system'); }
  if (room.phase === 'playing') {
    if (now >= room.deadline) { finishRound(room); return; }
    const elapsed = 60 - Math.max(0, room.deadline - now) / 1000;
    if (!room.star && now >= room.nextStarAt) { room.star = { x: rand(100, 900), y: rand(100, 900), bornAt: now, expiresAt: now + 6000 }; room.nextStarAt = now + 7000; }
    if (room.star && now >= room.star.expiresAt) room.star = null;
    const rainRate = 0.025 + Math.min(0.12, elapsed * 0.0017);
    if (Math.random() < rainRate) room.rain.push({ id: randomUUID(), x: rand(25, 975), y: -20, speed: rand(155, 220) + elapsed * 2.5, r: rand(9, 14) });
    const dt = TICK_MS / 1000;
    for (const p of room.players.values()) {
      if (!p.connected) continue;
      const nowDashing = now < p.dashUntil;
      const stunned = now < p.stunnedUntil;
      const baseSpeed = nowDashing ? 540 : 245;
      if (!stunned) {
        const ix = p.input.x, iy = p.input.y; const il = Math.hypot(ix, iy) || 1;
        p.vx += (ix / il * baseSpeed - p.vx) * (nowDashing ? 0.48 : 0.28);
        p.vy += (iy / il * baseSpeed - p.vy) * (nowDashing ? 0.48 : 0.28);
      } else { p.vx *= 0.91; p.vy *= 0.91; }
      p.x = clamp(p.x + p.vx * dt, 24, 976); p.y = clamp(p.y + p.vy * dt, 24, 976);
      if (nowDashing && now - p.lastBoopAt > 300) {
        for (const other of room.players.values()) {
          if (other.id === p.id || !other.connected || now < other.invulnUntil) continue;
          if (distance(p, other) < 32) { knockback(other, p.x, p.y, 370); dropDewdrops(room, other, Math.min(2, other.score)); other.score = Math.max(0, other.score - Math.min(2, other.score)); p.lastBoopAt = now; announce(room, `💥 ${p.name} booped ${other.name}!`); break; }
        }
      }
      if (!nowDashing && now >= p.invulnUntil && !stunned) {
        const hit = room.rain.find(r => distance(p, r) < r.r + 13);
        if (hit) { room.rain = room.rain.filter(r => r.id !== hit.id); knockback(p, p.x, p.y - 35, 300); dropDewdrops(room, p, Math.min(2, p.score)); p.score = Math.max(0, p.score - Math.min(2, p.score)); announce(room, `🌧️ ${p.name} got splashed!`); }
      }
      for (let i = room.dewdrops.length - 1; i >= 0; i--) {
        const d = room.dewdrops[i];
        if (distance(p, d) < 24) { room.dewdrops.splice(i, 1); p.score += 1; announce(room, `✨ ${p.name} grabbed a dewdrop!`, 'collect'); }
      }
      if (room.star && distance(p, room.star) < 28) { p.score += 5; room.star = null; room.nextStarAt = now + 7000; announce(room, `⭐ ${p.name} grabbed the star!`); }
    }
    room.rain = room.rain.filter(r => { r.y += r.speed * dt; return r.y < 1030; });
    while (room.dewdrops.length < 25) room.dewdrops.push(makeDewdrop());
  }
  // A disconnected seat is held for 30 seconds, then removed.
  for (const [id, p] of room.players) {
    if (!p.connected && now - p.disconnectedAt > 30000) { room.players.delete(id); if (room.hostId === id) assignHost(room); announce(room, `${p.name} left the garden.`); }
  }
  if (room.players.size === 0 && now - room.createdAt > 60000) { rooms.delete(room.code); return; }
  if (now - room.lastSnapshot >= TICK_MS) { room.lastSnapshot = now; pushState(room); }
}
wss.on('connection', ws => {
  ws.meta = null;
  ws.on('message', raw => handleMessage(ws, raw));
  ws.on('close', () => {
    const room = rooms.get(ws.meta?.room); const p = getPlayer(room, ws.meta?.playerId);
    if (!p || p.ws !== ws) return;
    p.connected = false; p.disconnectedAt = Date.now(); p.input = { x: 0, y: 0 };
    announce(room, `📴 ${p.name} is away. They have 30 seconds to return.`);
    if (room.hostId === p.id) assignHost(room);
    pushState(room);
  });
  ws.on('error', () => {});
});
setInterval(() => { const now = Date.now(); for (const room of rooms.values()) tickRoom(room, now); }, TICK_MS);
server.listen(PORT, '0.0.0.0', () => console.log(`Firefly Feast server listening on ${PORT}`));
