// The firefly character sheet. Every number here is in "character units": a 100-unit-wide
// space centred on the body. Both renderers below consume these same constants, so the
// SVG fireflies in the menus and the canvas fireflies in the arena are the same character.
export const FIREFLY = {
  body: { cx: 0, cy: 4, rx: 22, ry: 29 },
  head: { cy: -14 },
  eye: { dx: 8.4, cy: -11, r: 4.3, shine: 1.7 },
  smile: { dx: 6.2, cy: 1.5, drop: 3.4 },
  antenna: { dx: 7, top: -28, tipX: 17, tipY: -46, tipR: 2.6 },
  wing: { dx: 20, cy: -13, rx: 25, ry: 14.5, tilt: 26 },
  lantern: { cy: 23, rx: 14, ry: 15.5 },
  // The arena draws the same sheet at this fraction of a character unit, which keeps the
  // firefly's on-screen size close to the server's collision radii.
  arenaScale: 0.42
};

// Canvas gradients are cached per colour. They live in the character's local coordinate
// space, which never changes, so one gradient per colour lasts the whole session.
const gradientCache = new Map();

function bodyGradients(ctx, skin) {
  let cached = gradientCache.get(skin.base);
  if (cached) return cached;
  const { body, lantern } = FIREFLY;

  const shell = ctx.createRadialGradient(body.cx - 9, body.cy - 14, 2, body.cx, body.cy, body.ry + 8);
  shell.addColorStop(0, skin.light);
  shell.addColorStop(0.45, skin.base);
  shell.addColorStop(1, skin.dark);

  const lamp = ctx.createRadialGradient(0, lantern.cy, 1, 0, lantern.cy, lantern.ry + 4);
  lamp.addColorStop(0, '#ffffff');
  lamp.addColorStop(0.32, '#f2ffcf');
  lamp.addColorStop(0.68, '#c3f36d');
  lamp.addColorStop(1, 'rgba(195, 243, 109, 0)');

  const halo = ctx.createRadialGradient(0, lantern.cy - 2, 4, 0, lantern.cy - 2, 78);
  halo.addColorStop(0, `${skin.glow}66`);
  halo.addColorStop(0.5, `${skin.glow}1f`);
  halo.addColorStop(1, `${skin.glow}00`);

  cached = { shell, lamp, halo };
  gradientCache.set(skin.base, cached);
  return cached;
}

function wingPath(ctx, side, flap) {
  const { wing } = FIREFLY;
  ctx.save();
  ctx.translate(wing.dx * side, wing.cy);
  ctx.rotate((side * (wing.tilt + flap * 13) * Math.PI) / 180);
  ctx.beginPath();
  ctx.ellipse(wing.rx * 0.5 * side, 0, wing.rx, wing.ry * (1 - flap * 0.22), 0, 0, Math.PI * 2);
  ctx.restore();
}

/**
 * Draw one firefly in character units. The caller sets up translate/scale/alpha.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} skin   from skinFor()
 * @param {object} opts   { flap, lantern, dashing, stunned, calm }
 */
export function drawFireflyBody(ctx, skin, opts = {}) {
  const { body, eye, smile, antenna, lantern } = FIREFLY;
  const flap = opts.calm ? 0.25 : (opts.flap ?? 0);
  const lanternPower = opts.lantern ?? 1;
  const { shell, lamp, halo } = bodyGradients(ctx, skin);

  // Light the firefly casts on the clearing.
  ctx.globalAlpha *= 0.85;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, lantern.cy - 2, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.85;

  // Translucent wings, behind the body.
  ctx.save();
  ctx.globalAlpha *= 0.42;
  ctx.fillStyle = '#eaf6ff';
  for (const side of [-1, 1]) { wingPath(ctx, side, flap); ctx.fill(); }
  ctx.globalAlpha /= 0.42;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(214, 240, 255, 0.5)';
  for (const side of [-1, 1]) { wingPath(ctx, side, flap); ctx.stroke(); }
  ctx.restore();

  // Antennae.
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = skin.dark;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(antenna.dx * side, antenna.top);
    ctx.quadraticCurveTo(antenna.tipX * 1.15 * side, antenna.top - 10, antenna.tipX * side, antenna.tipY);
    ctx.stroke();
    ctx.fillStyle = skin.light;
    ctx.beginPath();
    ctx.arc(antenna.tipX * side, antenna.tipY, antenna.tipR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body shell.
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.ellipse(body.cx, body.cy, body.rx, body.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = skin.dark;
  ctx.stroke();

  // Rim light along the upper left.
  ctx.save();
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = skin.light;
  ctx.beginPath();
  ctx.ellipse(body.cx, body.cy, body.rx - 2.6, body.ry - 2.6, 0, Math.PI * 1.08, Math.PI * 1.62);
  ctx.stroke();
  ctx.restore();

  // Glowing lantern at the tail.
  ctx.save();
  ctx.globalAlpha *= 0.4 + 0.6 * lanternPower;
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.ellipse(0, lantern.cy, lantern.rx + 4, lantern.ry + 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Face: two eyes with a highlight, and a soft smile.
  ctx.fillStyle = '#0a1a2e';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(eye.dx * side, eye.cy, eye.r, eye.r * (opts.stunned ? 0.35 : 1.06), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!opts.stunned) {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(eye.dx * side - 1.4, eye.cy - 1.5, eye.shine, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(10, 26, 46, .75)';
  ctx.beginPath();
  if (opts.stunned) {
    ctx.moveTo(-smile.dx * 0.7, smile.cy + 1.5);
    ctx.quadraticCurveTo(0, smile.cy - smile.drop * 0.8, smile.dx * 0.7, smile.cy + 1.5);
  } else {
    ctx.moveTo(-smile.dx, smile.cy);
    ctx.quadraticCurveTo(0, smile.cy + smile.drop, smile.dx, smile.cy);
  }
  ctx.stroke();
}
