import { PALETTE as P, skinFor, withAlpha, seededRandom } from '../art/palette.js';
import { roundRect } from './sprites.js';

// Local, decorative feedback. Everything here is derived by diffing consecutive server
// snapshots; nothing is ever sent back and nothing influences collision or scoring. If a
// snapshot is missed the effects simply do not fire, and gameplay is unaffected.
const MAX_PARTICLES = 220;
const TRAIL_LENGTH = 14;

export class Effects {
  constructor(calm = false) {
    this.calm = calm;
    this.particles = [];
    this.floaters = [];
    this.rings = [];
    this.trails = new Map();
    this.motion = new Map();
    const rnd = seededRandom(991);
    this.motes = Array.from({ length: calm ? 14 : 34 }, () => ({
      x: rnd() * 1000, y: rnd() * 1000, r: 0.9 + rnd() * 2.1,
      drift: 4 + rnd() * 12, sway: 14 + rnd() * 30, phase: rnd() * Math.PI * 2,
      alpha: 0.12 + rnd() * 0.3
    }));
    this.ambient = Array.from({ length: calm ? 3 : 8 }, () => ({
      x: rnd() * 1000, y: 120 + rnd() * 760, r: 2.2 + rnd() * 2.4,
      speed: 9 + rnd() * 16, phase: rnd() * Math.PI * 2, amp: 30 + rnd() * 70,
      hue: rnd() > 0.65 ? P.lime : P.mint
    }));
  }

  spawn(particle) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push(particle);
  }

  burst(x, y, color, count = 9, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const v = (70 + Math.random() * 120) * power;
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 1, decay: 1.8 + Math.random(), r: 2 + Math.random() * 3, color, kind: 'spark' });
    }
    this.rings.push({ x, y, r: 6, max: 34 * power, life: 1, decay: 2.8, color, width: 2.6 });
  }

  splash(x, y, color = P.rain) {
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI + Math.random() * Math.PI;
      const v = 80 + Math.random() * 150;
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, life: 1, decay: 2.1, r: 1.8 + Math.random() * 2.6, color, kind: 'drop' });
    }
    this.rings.push({ x, y, r: 8, max: 52, life: 1, decay: 2.4, color, width: 3.2 });
  }

  shockwave(x, y, color) {
    this.rings.push({ x, y, r: 10, max: 78, life: 1, decay: 2, color, width: 4.4 });
    this.rings.push({ x, y, r: 4, max: 46, life: 1, decay: 3.2, color: P.cream, width: 2 });
  }

  float(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 1, decay: 0.85, vy: -46 });
  }

  /** Per-player locally derived velocity and animation phase, for squash/stretch and bob. */
  motionFor(player) {
    let m = this.motion.get(player.id);
    if (!m) {
      m = { vx: 0, vy: 0, x: player.x, y: player.y, phase: (parseInt(player.id.slice(0, 4), 16) || 0) % 628 / 100 };
      this.motion.set(player.id, m);
    }
    return m;
  }

  /** Diff two snapshots and raise the matching effects. */
  sync(state, prev) {
    if (!state) return;

    // Track locally-derived velocity for every player.
    for (const p of state.players) {
      const m = this.motionFor(p);
      const dt = Math.max(16, state.serverNow - (prev?.serverNow || state.serverNow - 50)) / 1000;
      m.vx = (p.x - m.x) / dt;
      m.vy = (p.y - m.y) / dt;
      m.x = p.x;
      m.y = p.y;
    }
    for (const id of [...this.motion.keys()]) {
      if (!state.players.some(p => p.id === id)) { this.motion.delete(id); this.trails.delete(id); }
    }

    if (!prev) return;

    // A dewdrop that vanished next to a player was collected by them.
    const liveDrops = new Set(state.dewdrops.map(d => d.id));
    for (const d of prev.dewdrops) {
      if (liveDrops.has(d.id)) continue;
      const taker = nearest(state.players, d);
      if (taker && dist(taker, d) < 46) this.burst(d.x, d.y, d.dropped ? P.gold : P.mint, 9);
    }

    // A raindrop that vanished before reaching the ground hit somebody.
    const liveRain = new Set(state.rain.map(r => r.id));
    const rainHits = [];
    for (const r of prev.rain) {
      if (liveRain.has(r.id) || r.y > 940) continue;
      rainHits.push(r);
      this.splash(r.x, r.y);
    }

    // The star being taken.
    if (prev.star && !state.star) {
      const taker = nearest(state.players, prev.star);
      if (taker && dist(taker, prev.star) < 70) {
        this.burst(prev.star.x, prev.star.y, P.gold, 16, 1.5);
        this.rings.push({ x: prev.star.x, y: prev.star.y, r: 10, max: 108, life: 1, decay: 1.7, color: P.gold, width: 4 });
      }
    }

    const prevById = new Map(prev.players.map(p => [p.id, p]));
    for (const p of state.players) {
      const was = prevById.get(p.id);
      if (!was) {
        // Somebody new arrived: a soft welcome ripple.
        this.rings.push({ x: p.x, y: p.y, r: 6, max: 96, life: 1, decay: 1.5, color: skinFor(p.color).glow, width: 3.4 });
        continue;
      }
      const delta = p.score - was.score;
      if (delta >= 5) this.float(p.x, p.y - 44, `+${delta}`, P.gold);
      else if (delta > 0) this.float(p.x, p.y - 44, `+${delta}`, P.mint);
      else if (delta < 0) {
        // Spilled drops: blue if the rain did it, a colour-matched shockwave if a friend did.
        const splashedByRain = rainHits.some(r => dist(r, p) < 90);
        this.float(p.x, p.y - 44, `${delta}`, splashedByRain ? P.rain : P.lavender);
        if (!splashedByRain) this.shockwave(p.x, p.y, skinFor(p.color).glow);
      }
      // Dash take-off.
      if (p.dashing && !was.dashing) {
        this.rings.push({ x: p.x, y: p.y, r: 8, max: 58, life: 1, decay: 3, color: skinFor(p.color).glow, width: 3 });
      }
    }
  }

  update(dt, state) {
    // Dash trails: sample positions while dashing, then let them fade.
    if (state) {
      for (const p of state.players) {
        let trail = this.trails.get(p.id);
        if (p.dashing) {
          if (!trail) { trail = []; this.trails.set(p.id, trail); }
          trail.push({ x: p.x, y: p.y, life: 1 });
          if (trail.length > TRAIL_LENGTH) trail.shift();
        }
        if (trail) {
          for (const node of trail) node.life -= dt * 2.6;
          while (trail.length && trail[0].life <= 0) trail.shift();
          if (!trail.length && !p.dashing) this.trails.delete(p.id);
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt * q.decay;
      if (q.life <= 0) { this.particles.splice(i, 1); continue; }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += (q.kind === 'drop' ? 420 : 110) * dt;
      q.vx *= 0.97;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= dt * ring.decay;
      if (ring.life <= 0) { this.rings.splice(i, 1); continue; }
      ring.r += (ring.max - ring.r) * Math.min(1, dt * 7);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt * f.decay;
      if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= 0.94;
    }
  }

  /** Atmosphere that sits behind the gameplay. */
  drawAmbient(ctx, time) {
    ctx.save();
    for (const m of this.motes) {
      const y = this.calm ? m.y : (m.y - (time * m.drift) / 1000) % 1040;
      const x = m.x + (this.calm ? 0 : Math.sin(time / 2400 + m.phase) * m.sway);
      const twinkle = this.calm ? 1 : 0.6 + 0.4 * Math.sin(time / 700 + m.phase * 3);
      ctx.globalAlpha = m.alpha * twinkle;
      ctx.fillStyle = P.cream;
      ctx.beginPath();
      ctx.arc(x, y < -20 ? y + 1040 : y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const a of this.ambient) {
      const x = (a.x + (this.calm ? 0 : (time * a.speed) / 1000)) % 1040 - 20;
      const y = a.y + (this.calm ? 0 : Math.sin(time / 1800 + a.phase) * a.amp);
      const pulse = this.calm ? 0.5 : 0.35 + 0.45 * Math.abs(Math.sin(time / 900 + a.phase));
      const glow = ctx.createRadialGradient(x, y, 0, x, y, a.r * 7);
      glow.addColorStop(0, withAlpha(a.hue, 0.55 * pulse));
      glow.addColorStop(1, withAlpha(a.hue, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, a.r * 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(a.hue, 0.8 * pulse);
      ctx.beginPath();
      ctx.arc(x, y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Dash trails, drawn under the fireflies. */
  drawTrails(ctx, state) {
    if (this.calm) return;
    ctx.save();
    for (const p of state.players) {
      const trail = this.trails.get(p.id);
      if (!trail?.length) continue;
      const skin = skinFor(p.color);
      for (let i = 0; i < trail.length; i++) {
        const node = trail[i];
        const t = (i + 1) / trail.length;
        ctx.globalAlpha = Math.max(0, node.life) * 0.4 * t;
        const r = 6 + 13 * t;
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r);
        glow.addColorStop(0, withAlpha(skin.light, 0.9));
        glow.addColorStop(0.5, withAlpha(skin.glow, 0.55));
        glow.addColorStop(1, withAlpha(skin.glow, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Sparks, rings and score numbers, drawn over the gameplay. */
  drawFront(ctx) {
    ctx.save();
    for (const ring of this.rings) {
      ctx.globalAlpha = Math.max(0, ring.life) * 0.7;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * Math.max(0.3, ring.life);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life);
      ctx.fillStyle = q.color;
      if (q.kind === 'drop') {
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, q.r * 0.7, q.r * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r * Math.max(0.2, q.life), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.font = '800 25px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const alpha = Math.min(1, f.life * 1.6);
      const width = ctx.measureText(f.text).width;
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = 'rgba(5, 14, 30, .8)';
      roundRect(ctx, f.x - width / 2 - 8, f.y - 15, width + 16, 30, 13);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y + 1);
    }
    ctx.restore();
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function nearest(players, point) {
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    if (!p.connected) continue;
    const d = dist(p, point);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
