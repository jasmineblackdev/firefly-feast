// The single source of truth for colour used by canvas rendering. The CSS side of the
// same palette lives in styles.css as custom properties; keep the two in step.
export const PALETTE = {
  // Night and depth
  nightDeep: '#060b1c',
  night: '#0a1226',
  nightSoft: '#0e1a33',
  horizon: '#1b3a5c',
  mist: '#6e8fc4',
  lavender: '#9b96e0',

  // Woodland
  treeFar: '#132b45',
  treeNear: '#0d2236',
  foliageDeep: '#0d3a37',
  foliage: '#12514444',
  grassBack: '#17564e',
  grassFront: '#0e3f39',
  leaf: '#1a5c4a',
  leafDark: '#123f36',
  groundDeep: '#092428',
  ground: '#0d3134',

  // Light and reward
  lime: '#c3f36d',
  mint: '#7cf4d2',
  mintDim: '#4fcfae',
  gold: '#ffd264',
  goldDeep: '#f0a93c',
  cream: '#f7f2e6',

  // Hazard
  rain: '#8fc4ff',
  rainDeep: '#4f7cb8',
  cloud: '#15294a'
};

// The eight player colours, matched to the server's COLORS array order so a player's
// colour is identical on every screen. Each entry carries the shading the character art
// needs so all eight fireflies read as the same species.
export const PLAYER_SKINS = {
  '#65F6D0': { base: '#65F6D0', dark: '#1f8f78', light: '#c6fff0', glow: '#7cf4d2' },
  '#FFB45E': { base: '#FFB45E', dark: '#a85f1c', light: '#ffe2bd', glow: '#ffc87e' },
  '#C5A4FF': { base: '#C5A4FF', dark: '#6646a8', light: '#ebdfff', glow: '#cdb2ff' },
  '#FF7FA8': { base: '#FF7FA8', dark: '#a8365c', light: '#ffd4e1', glow: '#ff9cbb' },
  '#7ED7FF': { base: '#7ED7FF', dark: '#2a7ba8', light: '#d4f2ff', glow: '#9ae0ff' },
  '#F6E96B': { base: '#F6E96B', dark: '#9c8e1d', light: '#fdf8c4', glow: '#ffef84' },
  '#A8F078': { base: '#A8F078', dark: '#4b8f2b', light: '#ddfbc6', glow: '#bdf593' },
  '#FF927A': { base: '#FF927A', dark: '#a8412c', light: '#ffd8cd', glow: '#ffa892' }
};

const FALLBACK_SKIN = { base: '#8ad8ff', dark: '#2f6f96', light: '#d6f1ff', glow: '#9ae0ff' };

export function skinFor(color) {
  return PLAYER_SKINS[color] || PLAYER_SKINS[String(color || '').toUpperCase()] || FALLBACK_SKIN;
}

// Mulberry32: a tiny deterministic PRNG so the arena decoration is identical on every
// device and every reload instead of reshuffling.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
