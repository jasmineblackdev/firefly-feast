import React, { useEffect, useRef } from 'react';
import { buildArena, drawClouds, ARENA_UNITS } from './render/arena.js';
import { drawDewdrop, drawStar, drawRaindrop, drawFirefly } from './render/sprites.js';
import { Effects } from './render/effects.js';
import { PALETTE as P, skinFor, withAlpha } from './art/palette.js';

const INPUT_INTERVAL_MS = 100;
const MOVE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

/**
 * The arena. Reads the authoritative snapshot straight out of `stateRef` on every animation
 * frame, so the 20 snapshots a second never re-render React. Input is sent with exactly the
 * message shapes the server already expects.
 */
export default function GameCanvas({ stateRef, meId, send, calm }) {
  const canvasRef = useRef(null);
  const inputRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef(null);
  const keysRef = useRef(new Set());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const effects = new Effects(calm);
    let alive = true;
    let raf = 0;
    let arena = null;
    let arenaPx = 0;
    let lastFrame = performance.now();
    let lastSnapshot = null;
    let goFlash = 0;

    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio = dpr();
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Re-bake the static woodland only when the size really changed, since it is the
      // one expensive draw in here.
      const wanted = Math.max(600, Math.min(1600, Math.round(Math.min(rect.width, rect.height) * ratio)));
      if (!arena || Math.abs(wanted - arenaPx) / arenaPx > 0.2) {
        arena = buildArena(wanted);
        arenaPx = wanted;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const frame = now => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const state = stateRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!state || !w || !h) return;

      if (state !== lastSnapshot) {
        effects.sync(state, lastSnapshot);
        if (lastSnapshot && lastSnapshot.phase === 'countdown' && state.phase === 'playing') goFlash = 1;
        lastSnapshot = state;
      }
      effects.update(dt, state);
      if (goFlash > 0) goFlash = Math.max(0, goFlash - dt * 0.85);

      // Letterbox the square arena inside whatever space the layout gives us.
      const side = Math.min(w, h);
      const ox = (w - side) / 2;
      const oy = (h - side) / 2;
      const scale = side / ARENA_UNITS;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = P.nightDeep;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(ox, oy);
      if (arena) ctx.drawImage(arena, 0, 0, side, side);
      ctx.scale(scale, scale);

      effects.drawAmbient(ctx, now);
      drawClouds(ctx, now, state.rain.length > 0);

      for (const d of state.dewdrops) drawDewdrop(ctx, d, now, calm);
      if (state.star) drawStar(ctx, state.star, now, state.serverNow, calm);

      effects.drawTrails(ctx, state);

      // Depth: fireflies lower on screen draw in front.
      const cast = [...state.players].filter(p => p.connected).sort((a, b) => a.y - b.y);
      for (const p of cast) {
        drawFirefly(ctx, p, effects.motionFor(p), now, {
          calm,
          isMe: p.id === meId,
          label: p.id === meId ? 'You' : p.name
        });
      }

      // Rain falls in front of the fireflies so a hazard is never hidden behind one.
      for (const r of state.rain) drawRaindrop(ctx, r);

      effects.drawFront(ctx);

      if (pointerRef.current) drawStick(ctx, pointerRef.current, state, meId);
      if (state.phase === 'countdown') drawCountdown(ctx, state, now, calm);
      if (goFlash > 0) drawGo(ctx, goFlash);

      ctx.restore();
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [stateRef, meId, calm]);

  // Steering is sent on a fixed cadence, exactly as before.
  useEffect(() => {
    const id = window.setInterval(() => send({ type: 'input', ...inputRef.current }), INPUT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [send]);

  // Keyboard controls. Key state lives in a ref so nothing leaks between mounts.
  useEffect(() => {
    const keys = keysRef.current;
    const apply = () => {
      let x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      let y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      inputRef.current = { x: x / len, y: y / len };
    };
    const down = e => {
      const key = e.key.toLowerCase();
      if (key === ' ' || e.code === 'Space') { e.preventDefault(); send({ type: 'dash' }); return; }
      if (!MOVE_KEYS.has(key)) return;
      e.preventDefault();
      keys.add(key);
      apply();
    };
    const up = e => {
      const key = e.key.toLowerCase();
      if (!MOVE_KEYS.has(key)) return;
      keys.delete(key);
      apply();
    };
    const blur = () => { keys.clear(); apply(); };
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      keys.clear();
    };
  }, [send]);

  const toArena = e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height);
    const ox = (rect.width - side) / 2;
    const oy = (rect.height - side) / 2;
    return { x: ((e.clientX - rect.left - ox) * ARENA_UNITS) / side, y: ((e.clientY - rect.top - oy) * ARENA_UNITS) / side };
  };
  const onDown = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    const pt = toArena(e);
    pointerRef.current = { startX: pt.x, startY: pt.y, dx: 0, dy: 0, id: e.pointerId };
    inputRef.current = { x: 0, y: 0 };
  };
  const onMove = e => {
    const stick = pointerRef.current;
    if (!stick || stick.id !== e.pointerId) return;
    e.preventDefault();
    const pt = toArena(e);
    let dx = pt.x - stick.startX;
    let dy = pt.y - stick.startY;
    const len = Math.hypot(dx, dy);
    const max = 100;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    stick.dx = dx / max;
    stick.dy = dy / max;
    inputRef.current = { x: stick.dx, y: stick.dy };
  };
  const onUp = e => {
    if (pointerRef.current?.id !== e.pointerId) return;
    pointerRef.current = null;
    inputRef.current = { x: 0, y: 0 };
    send({ type: 'input', x: 0, y: 0 });
  };

  return (
    <div className="arena-frame">
      <canvas
        ref={canvasRef}
        className="arena-canvas"
        aria-label="Game arena. Drag to steer your firefly."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
}

function drawStick(ctx, stick, state, meId) {
  const me = state.players.find(p => p.id === meId);
  const skin = skinFor(me?.color || P.mint);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = withAlpha(P.cream, 0.6);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(stick.startX, stick.startY, 52, 0, Math.PI * 2);
  ctx.stroke();
  const kx = stick.startX + stick.dx * 38;
  const ky = stick.startY + stick.dy * 38;
  const glow = ctx.createRadialGradient(kx, ky, 1, kx, ky, 24);
  glow.addColorStop(0, withAlpha(skin.light, 0.95));
  glow.addColorStop(1, withAlpha(skin.glow, 0));
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(kx, ky, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCountdown(ctx, state, time, calm) {
  const remain = state.countdownEnd - Date.now();
  const n = Math.max(1, Math.ceil(remain / 1000));
  const withinSecond = 1 - ((remain % 1000) / 1000);
  const pop = calm ? 1 : 1 + Math.max(0, 0.35 - withinSecond) * 1.6;
  ctx.save();
  ctx.fillStyle = 'rgba(5, 12, 26, .46)';
  ctx.fillRect(0, 0, ARENA_UNITS, ARENA_UNITS);
  ctx.translate(ARENA_UNITS / 2, ARENA_UNITS / 2 - 20);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 230px Fraunces, Georgia, serif';
  const grad = ctx.createLinearGradient(0, -120, 0, 120);
  grad.addColorStop(0, P.cream);
  grad.addColorStop(1, P.gold);
  ctx.fillStyle = grad;
  ctx.fillText(String(n), 0, 0);
  ctx.font = '800 38px Nunito, system-ui, sans-serif';
  ctx.fillStyle = withAlpha(P.mint, 0.9);
  ctx.fillText('GET READY!', 0, 150);
  ctx.restore();
}

function drawGo(ctx, strength) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength);
  ctx.translate(ARENA_UNITS / 2, ARENA_UNITS / 2);
  ctx.scale(1 + (1 - strength) * 0.8, 1 + (1 - strength) * 0.8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 150px Fraunces, Georgia, serif';
  ctx.fillStyle = P.lime;
  ctx.fillText('GO!', 0, 0);
  ctx.restore();
}
