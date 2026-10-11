import { PALETTE as P, skinFor, withAlpha } from '../art/palette.js';
import { FIREFLY, drawFireflyBody } from '../art/firefly.js';

// Every sprite here draws in game units (the 1000x1000 arena space) with the canvas
// transform already applied by the caller. Nothing in this file touches game state: it is
// presentation only, so collision and scoring stay exactly as the server computes them.

function dropletPath(ctx, r) {
  const h = r * 1.55;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.bezierCurveTo(r * 0.92, -h * 0.22, r, r * 0.36, 0, r);
  ctx.bezierCurveTo(-r, r * 0.36, -r * 0.92, -h * 0.22, 0, -h);
  ctx.closePath();
}

export function drawDewdrop(ctx, d, time, calm) {
  const spilled = !!d.dropped;
  const r = (d.r || 10) * 0.96;
  // Gentle shimmer, offset per drop so they do not pulse in unison.
  const phase = (d.x + d.y) * 0.05;
  const pulse = calm ? 1 : 1 + Math.sin(time / 420 + phase) * 0.07;
  const tint = spilled ? P.gold : P.mint;
  const core = spilled ? '#fff3d0' : '#eafff9';

  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(pulse, pulse);

  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 3.4);
  glow.addColorStop(0, withAlpha(tint, 0.42));
  glow.addColorStop(1, withAlpha(tint, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.4, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(-r, -r, r * 0.6, r);
  body.addColorStop(0, core);
  body.addColorStop(0.55, tint);
  body.addColorStop(1, spilled ? P.goldDeep : P.mintDim);
  ctx.fillStyle = body;
  dropletPath(ctx, r);
  ctx.fill();

  ctx.strokeStyle = withAlpha(core, 0.75);
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Specular highlight.
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.5, r * 0.26, r * 0.36, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function starPath(ctx, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const next = a + (Math.PI * 2) / 5;
    const mid = a + Math.PI / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.quadraticCurveTo(Math.cos(mid) * inner * 1.04, Math.sin(mid) * inner * 1.04, Math.cos(next) * outer, Math.sin(next) * outer);
  }
  ctx.closePath();
}

export function drawStar(ctx, star, time, serverNow, calm) {
  const remain = star.expiresAt - serverNow;
  const age = serverNow - star.bornAt;
  // Smooth sine fade as it runs out, rather than a hard blink.
  const fade = remain < 1400 ? 0.45 + 0.55 * Math.abs(Math.sin(time / (calm ? 1e9 : 150))) : 1;
  const pop = Math.min(1, age / 220);
  const spin = calm ? 0 : time / 900;

  ctx.save();
  ctx.translate(star.x, star.y);
  ctx.globalAlpha *= fade;
  ctx.scale(pop, pop);

  const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 84);
  halo.addColorStop(0, withAlpha(P.gold, 0.5));
  halo.addColorStop(0.45, withAlpha(P.gold, 0.16));
  halo.addColorStop(1, withAlpha(P.gold, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 84, 0, Math.PI * 2);
  ctx.fill();

  // Sparkle cross behind the star.
  ctx.save();
  ctx.rotate(spin * 0.4);
  ctx.globalAlpha *= 0.5;
  ctx.strokeStyle = withAlpha(P.cream, 0.8);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (const a of [0, Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * -44, Math.sin(a) * -44);
    ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44);
    ctx.stroke();
  }
  ctx.restore();

  ctx.rotate(spin);
  const fill = ctx.createRadialGradient(-4, -6, 1, 0, 0, 28);
  fill.addColorStop(0, '#fffaea');
  fill.addColorStop(0.5, P.gold);
  fill.addColorStop(1, P.goldDeep);
  ctx.fillStyle = fill;
  starPath(ctx, 27, 12.5);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = withAlpha('#fff3cd', 0.9);
  ctx.stroke();
  ctx.restore();
}

export function drawRaindrop(ctx, r) {
  const len = 13 + r.speed * 0.055;
  ctx.save();
  ctx.translate(r.x, r.y);

  // Motion streak.
  const streak = ctx.createLinearGradient(0, -len * 1.9, 0, 0);
  streak.addColorStop(0, withAlpha(P.rain, 0));
  streak.addColorStop(1, withAlpha(P.rain, 0.4));
  ctx.strokeStyle = streak;
  ctx.lineWidth = r.r * 0.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -len * 1.9);
  ctx.lineTo(0, -len * 0.4);
  ctx.stroke();

  const body = ctx.createLinearGradient(-r.r * 0.5, -len, r.r * 0.5, r.r);
  body.addColorStop(0, '#dcefff');
  body.addColorStop(0.45, P.rain);
  body.addColorStop(1, P.rainDeep);
  ctx.fillStyle = body;
  ctx.scale(1, 1.18);
  dropletPath(ctx, r.r * 0.72);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath();
  ctx.ellipse(-r.r * 0.2, -r.r * 0.28, r.r * 0.16, r.r * 0.3, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw one firefly. `motion` carries locally-derived values (velocity, flap phase) that
 * exist purely for animation; the authoritative position always comes from the server.
 */
export function drawFirefly(ctx, player, motion, time, opts) {
  const skin = skinFor(player.color);
  const { calm, isMe, label } = opts;
  const speed = Math.min(1, Math.hypot(motion.vx, motion.vy) / 320);

  // Hover bob while idle, flattening out as the firefly picks up speed.
  const bob = calm ? 0 : Math.sin(time / 520 + motion.phase) * 3.2 * (1 - speed * 0.7);
  // Squash and stretch along the direction of travel.
  const stretch = calm ? 1 : 1 + speed * 0.16;
  const squash = calm ? 1 : 1 - speed * 0.12;
  const tilt = calm ? 0 : Math.max(-0.42, Math.min(0.42, motion.vx / 620)) + (player.stunned ? Math.sin(time / 60) * 0.22 : 0);
  const flap = calm ? 0.25 : Math.sin(time / (player.dashing ? 28 : 62) + motion.phase) * (player.dashing ? 1 : 0.72);

  ctx.save();
  ctx.translate(player.x, player.y + bob);

  // "Protected after a hit" reads as a soft pulse rather than a hard strobe, which is
  // easier on the eyes and still unmistakable.
  if (player.invulnerable) ctx.globalAlpha *= calm ? 0.65 : 0.52 + 0.33 * Math.abs(Math.sin(time / 190));

  if (isMe) {
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = withAlpha(P.cream, 0.85);
    ctx.lineWidth = 2.4;
    ctx.setLineDash([9, 9]);
    ctx.lineDashOffset = calm ? 0 : -time / 90;
    ctx.beginPath();
    ctx.arc(0, 2, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.rotate(tilt);
  ctx.scale(FIREFLY.arenaScale * squash, FIREFLY.arenaScale * stretch);
  drawFireflyBody(ctx, skin, {
    flap,
    lantern: player.dashing ? 1 : 0.72 + (calm ? 0.15 : Math.sin(time / 640 + motion.phase) * 0.18),
    dashing: player.dashing,
    stunned: player.stunned,
    calm
  });
  ctx.restore();

  // Name plate.
  if (label) {
    ctx.font = '600 18px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(label).width;
    const y = -40;
    ctx.fillStyle = 'rgba(6, 16, 32, .74)';
    roundRect(ctx, -width / 2 - 9, y - 11, width + 18, 23, 11);
    ctx.fill();
    ctx.strokeStyle = withAlpha(skin.base, 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = P.cream;
    ctx.fillText(label, 0, y + 1);
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
