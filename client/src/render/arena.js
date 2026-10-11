import { PALETTE as P, seededRandom, withAlpha } from '../art/palette.js';

// The arena is a 1000x1000 game-unit square: a woodland clearing at twilight, with sky in
// the upper third and the clearing floor below. Everything in here is static, so it is
// painted once into an offscreen canvas and then blitted each frame. Decoration is kept to
// the edges and to a narrow contrast range so fireflies, dewdrops and rain stay readable
// in the middle of the arena, where the game is actually played.
const UNITS = 1000;
const HORIZON = 318;

function leaf(ctx, x, y, len, wide, angle, fill, edge) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(wide, len * 0.42, 0, len);
  ctx.quadraticCurveTo(-wide, len * 0.42, 0, 0);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(0, len - 4);
  ctx.stroke();
  ctx.restore();
}

function grassTuft(ctx, x, y, height, color, lean) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let b = -1; b <= 1; b++) {
    ctx.lineWidth = 3.4 - Math.abs(b) * 0.9;
    ctx.beginPath();
    ctx.moveTo(x + b * 5, y);
    ctx.quadraticCurveTo(x + b * 8 + lean * 6, y - height * 0.62, x + b * 11 + lean * 15, y - height);
    ctx.stroke();
  }
}

function mushroom(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#e6c7a0';
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.goldDeep;
  ctx.beginPath();
  ctx.ellipse(0, -8, 13, 9.5, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(P.cream, 0.75);
  for (const [dx, dy, r] of [[-5, -10, 2], [4, -12, 1.7], [7, -8.5, 1.4]]) {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function flower(ctx, x, y, color, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = P.grassFront;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(3, -9, 1, -17);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(1 + Math.cos(a) * 4.6, -17 + Math.sin(a) * 4.6, 3.3, 3.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = P.cream;
  ctx.beginPath();
  ctx.arc(1, -17, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function treeline(ctx, rnd, baseY, color, minH, maxH, step) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-40, baseY + 60);
  for (let x = -40; x <= UNITS + 40; x += step) {
    const h = minH + rnd() * (maxH - minH);
    // A soft conifer silhouette: up to a point, then back down.
    ctx.lineTo(x, baseY - h * 0.25);
    ctx.lineTo(x + step * 0.5, baseY - h);
    ctx.lineTo(x + step, baseY - h * 0.2);
  }
  ctx.lineTo(UNITS + 40, baseY + 60);
  ctx.closePath();
  ctx.fill();
}

/** Paint the static clearing into an offscreen canvas at `pixels` square. */
export function buildArena(pixels) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pixels;
  const ctx = canvas.getContext('2d');
  const s = pixels / UNITS;
  ctx.scale(s, s);
  const rnd = seededRandom(20240711);

  // --- Sky -------------------------------------------------------------------
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 90);
  sky.addColorStop(0, P.nightDeep);
  sky.addColorStop(0.45, P.night);
  sky.addColorStop(0.82, '#152a4d');
  sky.addColorStop(1, P.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, UNITS, HORIZON + 90);

  // Stars, thinning out towards the horizon.
  for (let i = 0; i < 150; i++) {
    const x = rnd() * UNITS;
    const y = rnd() * (HORIZON + 20);
    const fade = 1 - y / (HORIZON + 60);
    ctx.globalAlpha = (0.12 + rnd() * 0.5) * fade;
    ctx.fillStyle = rnd() > 0.82 ? P.lavender : P.cream;
    ctx.beginPath();
    ctx.arc(x, y, rnd() * 1.5 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // A low moon with a soft halo.
  const moon = { x: 812, y: 96 };
  const moonGlow = ctx.createRadialGradient(moon.x, moon.y, 6, moon.x, moon.y, 150);
  moonGlow.addColorStop(0, withAlpha(P.cream, 0.3));
  moonGlow.addColorStop(0.4, withAlpha(P.mist, 0.12));
  moonGlow.addColorStop(1, withAlpha(P.mist, 0));
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(P.cream, 0.82);
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, 26, 0, Math.PI * 2);
  ctx.fill();

  // --- Distant woodland ------------------------------------------------------
  ctx.globalAlpha = 0.5;
  treeline(ctx, rnd, HORIZON - 26, withAlpha(P.treeFar, 0.95), 48, 132, 46);
  ctx.globalAlpha = 0.85;
  treeline(ctx, rnd, HORIZON + 4, P.treeNear, 36, 104, 34);
  ctx.globalAlpha = 1;

  // Mist pooling along the treeline.
  const mist = ctx.createLinearGradient(0, HORIZON - 46, 0, HORIZON + 58);
  mist.addColorStop(0, withAlpha(P.mist, 0));
  mist.addColorStop(0.5, withAlpha(P.mist, 0.17));
  mist.addColorStop(1, withAlpha(P.mist, 0));
  ctx.fillStyle = mist;
  ctx.fillRect(0, HORIZON - 46, UNITS, 104);

  // --- Clearing floor --------------------------------------------------------
  const floor = ctx.createLinearGradient(0, HORIZON - 10, 0, UNITS);
  floor.addColorStop(0, '#11443c');
  floor.addColorStop(0.35, P.ground);
  floor.addColorStop(1, P.groundDeep);
  ctx.fillStyle = floor;
  ctx.fillRect(0, HORIZON - 10, UNITS, UNITS - HORIZON + 10);

  // Mottled ground patches, low contrast so they read as texture, not obstacles.
  for (let i = 0; i < 46; i++) {
    const x = rnd() * UNITS;
    const y = HORIZON + 10 + rnd() * (UNITS - HORIZON - 10);
    ctx.globalAlpha = 0.05 + rnd() * 0.06;
    ctx.fillStyle = rnd() > 0.5 ? '#1d6b52' : '#07202a';
    ctx.beginPath();
    ctx.ellipse(x, y, 42 + rnd() * 92, 16 + rnd() * 34, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // A pool of moonlight in the centre, which also lifts contrast where play happens.
  const pool = ctx.createRadialGradient(500, 560, 40, 500, 580, 470);
  pool.addColorStop(0, withAlpha('#2a7d6b', 0.22));
  pool.addColorStop(1, withAlpha('#2a7d6b', 0));
  ctx.fillStyle = pool;
  ctx.fillRect(0, HORIZON - 10, UNITS, UNITS - HORIZON + 10);

  // --- Grass along the treeline ---------------------------------------------
  for (let i = 0; i < 74; i++) {
    const x = rnd() * (UNITS + 40) - 20;
    grassTuft(ctx, x, HORIZON + 16 + rnd() * 22, 26 + rnd() * 30, withAlpha(P.grassBack, 0.85), rnd() - 0.5);
  }

  // --- Edge planting ---------------------------------------------------------
  // Big leaves, ferns, flowers and mushrooms live in a border band so the middle of the
  // arena stays clear.
  const inBorder = (x, y) => x < 190 || x > UNITS - 190 || y > UNITS - 170 || (y > HORIZON && y < HORIZON + 86);
  for (let i = 0; i < 54; i++) {
    const x = rnd() * UNITS;
    const y = HORIZON + 30 + rnd() * (UNITS - HORIZON - 30);
    if (!inBorder(x, y)) continue;
    const scale = 0.7 + rnd() * 0.75;
    const roll = rnd();
    if (roll < 0.42) {
      leaf(ctx, x, y, (46 + rnd() * 54) * scale, (16 + rnd() * 16) * scale, (rnd() - 0.5) * 2.4, withAlpha(P.leaf, 0.72), withAlpha(P.leafDark, 0.6));
    } else if (roll < 0.62) {
      mushroom(ctx, x, y, scale * 0.95);
    } else if (roll < 0.84) {
      flower(ctx, x, y, rnd() > 0.5 ? P.lavender : withAlpha(P.cream, 0.9), scale);
    } else {
      grassTuft(ctx, x, y, (34 + rnd() * 36) * scale, withAlpha(P.grassFront, 0.9), rnd() - 0.5);
    }
  }

  // Oversized corner leaves, framing the clearing.
  const corners = [
    [-14, UNITS + 26, 1.9], [92, UNITS + 40, 2.5], [UNITS + 10, UNITS + 30, -1.9],
    [UNITS - 96, UNITS + 44, -2.5], [-20, HORIZON + 150, 2.5], [UNITS + 22, HORIZON + 170, -2.5]
  ];
  for (const [x, y, angle] of corners) {
    leaf(ctx, x, y, 210, 74, angle, withAlpha(P.leafDark, 0.82), withAlpha('#0a2b26', 0.7));
  }

  // --- Front grass fringe ----------------------------------------------------
  for (let i = 0; i < 86; i++) {
    const x = rnd() * (UNITS + 60) - 30;
    grassTuft(ctx, x, UNITS + 14, 32 + rnd() * 52, withAlpha(P.grassFront, 0.92), rnd() - 0.5);
  }

  // --- Vignette --------------------------------------------------------------
  const vignette = ctx.createRadialGradient(500, 520, 230, 500, 520, 720);
  vignette.addColorStop(0, 'rgba(4,10,22,0)');
  vignette.addColorStop(1, 'rgba(4,10,22,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, UNITS, UNITS);

  return canvas;
}

/**
 * The drifting cloud bank the rain falls from. Drawn each frame above the background and
 * below the gameplay, at low contrast so it never hides a raindrop.
 */
export function drawClouds(ctx, time, raining) {
  const drift = (time * 0.006) % UNITS;
  ctx.save();
  ctx.globalAlpha = raining ? 0.5 : 0.26;
  for (let layer = 0; layer < 2; layer++) {
    const y = 16 + layer * 34;
    const scale = 1 - layer * 0.25;
    ctx.fillStyle = withAlpha(layer ? P.cloud : '#1b3358', 0.9);
    for (let i = -1; i < 5; i++) {
      const x = ((i * 280 + drift * (layer ? 0.6 : 1)) % (UNITS + 420)) - 210;
      ctx.beginPath();
      ctx.ellipse(x, y, 150 * scale, 40 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 90 * scale, y + 10 * scale, 104 * scale, 30 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 86 * scale, y + 12 * scale, 92 * scale, 26 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export const ARENA_UNITS = UNITS;
export const ARENA_HORIZON = HORIZON;
