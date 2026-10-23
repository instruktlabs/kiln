/** Which rock to build: one of the KIT keys, or 'lineup' to review every variant together. */
const VARIANT = 'outcrop_a';
const meta = {
  name: VARIANT === 'lineup' ? 'Crescent Cove limestone kit lineup' : `Crescent Cove limestone ${VARIANT}`,
  role: 'prop',
};

// Weathered coral limestone kit for Crescent Cove (Holodeck world tropical-island).
// Asset frame: metres, +Y up, +X is the face that looks out (seaward / downhill),
// Y=0 is the expected ground or waterline contact and everything below it is meant to be buried.
// Shape language from the board's limestone kit and eye-level references: bulbous, pointed lumps
// packed into clusters with clefts between them, solution holes, pale grey-cream above and a
// darker wet base.
// Each lump is a closed blob (a subdivided cube projected to a superellipsoid, optionally tapered),
// lightly faceted by local plane cuts, then weathered along the surface normal: solution pockets,
// vertical joints and flutes, a wave-cut notch and noise kept coarser than the vertex spacing.
// Faces are split by quad into two parts: `rock` (dry library limestone) and `rock_wet` (darker
// wet-base library limestone). Normals keep only sharp creases; UVs are box-projected per face at
// the materials' 1.5 m physical repeat.

const SAMPLER = { minFilter: 'linear-mipmap-linear', magFilter: 'linear', wrapS: 'repeat', wrapT: 'repeat' };
const libraryTextures = (hash) => ({
  baseColor: { kind: 'resource', resourceId: `kiln.library.${hash}.base-color`, sampler: SAMPLER },
  normal: { kind: 'resource', resourceId: `kiln.library.${hash}.normal`, sampler: SAMPLER },
  metallicRoughness: { kind: 'resource', resourceId: `kiln.library.${hash}.metallic-roughness`, sampler: SAMPLER },
});
const DRY_SPEC = {
  schemaVersion: 3, model: 'pbrMetallicRoughness', name: 'LimestoneDry', roughness: 1, metalness: 0,
  textures: libraryTextures('e6ae86875b15133a65a6981e1dcc070d58be29121c13f72fe8741fb797f67cdf'),
};
const WET_SPEC = {
  schemaVersion: 3, model: 'pbrMetallicRoughness', name: 'LimestoneWet', roughness: 1, metalness: 0,
  textures: libraryTextures('01b70efc92418bb0d5fb886d678fd80bede9a5bd42ec8e6a5fb1c5f6cc03fad6'),
};
const SAND_SPEC = {
  schemaVersion: 3, model: 'pbrMetallicRoughness', name: 'ReviewSand', roughness: 1, metalness: 0,
  textures: libraryTextures('ebba050eb4413a171f9ecade01346f3c3fe1a91d97136944b64600416c5264fb'),
};
const TEXTURE_REPEAT = 1.5;

// ---------------------------------------------------------------- kit definitions
// blobs: radii [x,y,z], centre, superellipsoid exponent p, vertex spacing, optional yaw (deg) and taper.
// cuts: count, face (half-angle around +X in degrees; 180 = any side), tilt (normal elevation range),
//   depth (plane offset as a fraction of the blob's support), reach (in-plane falloff radius as a
//   fraction of support), shift (sideways jitter of the cut centre).
// wetLine/wetJitter: wet-material line; dark: pocket depth (m) whose interior also takes the wet
// material, used only where pockets span several vertices; cull: drop triangles entirely below this
// height (always buried).
const L = (radii, center, extra) => Object.assign({ radii, center, p: 2.6 }, extra);
const KIT = {
  cliff_a: {
    seed: 101, wetLine: 0.9, wetJitter: 0.22, dark: 0.4, cull: -1.2, shear: -0.06,
    blobs: [
      L([2.0, 3.6, 6.8], [-1.4, 2.4, 0.6], { p: 3, spacing: 0.6, taper: 0.1 }),
      L([2.6, 4.4, 2.9], [0.4, 3.2, -4.0], { spacing: 0.44, taper: 0.15, yaw: 10 }),
      L([2.8, 3.9, 2.8], [0.8, 2.7, -0.6], { spacing: 0.44, taper: 0.2, yaw: -8 }),
      L([2.5, 4.8, 2.6], [0.1, 3.8, 2.8], { spacing: 0.44, taper: 0.2, yaw: 15 }),
      L([2.2, 2.6, 2.3], [1.0, 1.4, 5.8], { spacing: 0.44, taper: 0.15, yaw: -20 }),
    ],
    cuts: [{ count: 3, face: 70, tilt: [-10, 20], depth: [0.84, 0.95], reach: 0.9, shift: 0.6 }],
    fbm: [0.5, 2.4], ridge: [0.28, 1.4],
    flutes: { width: 1.8, depth: 0.18 },
    joints: { count: 2, depth: 0.55, width: 0.9, spread: 25, across: 'z', wiggle: 0.3 },
    notch: { y: 0.55, depth: 0.55, width: 0.75 },
    pockets: { cell: 1.7, chance: 0.35, radius: 1.05, depth: 0.75 },
  },
  cliff_b: {
    seed: 202, wetLine: 0.9, wetJitter: 0.2, dark: 0.38, cull: -1.2, shear: -0.05,
    blobs: [
      L([1.8, 4.2, 4.2], [-1.2, 3.4, 0], { p: 3, spacing: 0.6, taper: 0.15 }),
      L([2.5, 5.4, 2.6], [0, 4.4, -1.3], { spacing: 0.42, taper: 0.2 }),
      L([2.2, 4.2, 2.3], [0.5, 3.4, 1.7], { spacing: 0.42, taper: 0.3, yaw: 20 }),
      L([1.8, 2.4, 2.0], [1.2, 1.3, -3.6], { spacing: 0.42, taper: 0.15, yaw: -15 }),
    ],
    cuts: [{ count: 3, face: 70, tilt: [-10, 20], depth: [0.84, 0.95], reach: 0.9, shift: 0.6 }],
    fbm: [0.5, 2.4], ridge: [0.28, 1.4],
    flutes: { width: 1.7, depth: 0.18 },
    joints: { count: 2, depth: 0.55, width: 0.85, spread: 25, across: 'z', wiggle: 0.3 },
    notch: { y: 0.55, depth: 0.5, width: 0.72 },
    pockets: { cell: 1.6, chance: 0.35, radius: 1.0, depth: 0.7 },
  },
  cliff_c: {
    seed: 303, wetLine: 0.7, wetJitter: 0.18, dark: 0.34, cull: -1.0, shear: 0,
    blobs: [
      L([2.6, 2.4, 2.8], [0, 1.6, -3.4], { p: 2.8, spacing: 0.38, taper: 0.1 }),
      L([2.8, 2.9, 2.9], [0.3, 2.0, 0], { p: 2.8, spacing: 0.38, taper: 0.15 }),
      L([2.3, 2.0, 2.5], [0.5, 1.3, 3.4], { p: 2.8, spacing: 0.38, taper: 0.1 }),
    ],
    cuts: [{ count: 3, face: 70, tilt: [-10, 25], depth: [0.84, 0.95], reach: 0.9, shift: 0.6 }],
    fbm: [0.4, 2.0], ridge: [0.24, 1.2],
    flutes: { width: 1.5, depth: 0.14 },
    joints: { count: 1, depth: 0.45, width: 0.75, spread: 25, across: 'z', wiggle: 0.25 },
    notch: { y: 0.65, depth: 0.7, width: 0.8 },
    pockets: { cell: 1.5, chance: 0.35, radius: 0.95, depth: 0.65 },
  },
  outcrop_a: {
    seed: 404, wetLine: 0.2, wetJitter: 0.1, dark: 0.26, cull: -0.6, shear: 0,
    blobs: [
      L([1.8, 2.8, 1.7], [0, 2.2, 0], { p: 2.4, spacing: 0.3, taper: 0.6 }),
      L([1.5, 2.1, 1.4], [1.4, 1.4, 1.6], { p: 2.4, spacing: 0.3, taper: 0.55, yaw: 30 }),
      L([1.4, 1.9, 1.5], [-1.5, 1.2, -1.2], { p: 2.4, spacing: 0.3, taper: 0.5, yaw: -20 }),
      L([1.2, 1.4, 1.1], [1.6, 0.8, -1.7], { p: 2.4, spacing: 0.3, taper: 0.5, yaw: 50 }),
      L([1.0, 1.1, 1.0], [-1.2, 0.6, 2.0], { p: 2.4, spacing: 0.3, taper: 0.45, yaw: 10 }),
      L([0.7, 0.6, 0.7], [2.8, 0.25, 0.2], { p: 2.4, spacing: 0.3, taper: 0.3 }),
    ],
    cuts: [{ count: 2, face: 180, tilt: [-10, 60], depth: [0.82, 0.94], reach: 1.2, shift: 0.5 }],
    fbm: [0.35, 1.6], ridge: [0.26, 1.0],
    flutes: { width: 1.2, depth: 0.1 },
    pockets: { cell: 1.0, chance: 0.45, radius: 0.62, depth: 0.46 },
  },
  outcrop_b: {
    seed: 505, wetLine: 0.12, wetJitter: 0.06, dark: 0.19, cull: -0.3, shear: 0,
    blobs: [
      L([1.4, 1.2, 1.3], [0, 0.9, 0], { p: 2.5, spacing: 0.2, taper: 0.35 }),
      L([1.2, 1.0, 1.1], [-0.4, 0.6, 2.1], { p: 2.5, spacing: 0.2, taper: 0.4, yaw: 25 }),
      L([1.0, 0.85, 1.0], [1.5, 0.5, -1.2], { p: 2.5, spacing: 0.2, taper: 0.4, yaw: -35 }),
      L([0.45, 0.35, 0.4], [2.2, 0.15, 1.2], { p: 2.5, spacing: 0.16, taper: 0.3, yaw: 60 }),
      L([0.35, 0.3, 0.35], [-1.6, 0.12, -0.9], { p: 2.5, spacing: 0.16, taper: 0.3 }),
      L([0.3, 0.22, 0.3], [0.9, 0.08, 2.9], { p: 2.5, spacing: 0.16, taper: 0.3, yaw: -40 }),
    ],
    cuts: [{ count: 6, face: 180, tilt: [-20, 70], depth: [0.76, 0.9], reach: 2.5, shift: 0.3 }],
    fbm: [0.2, 1.2], ridge: [0.16, 0.7],
    pockets: { cell: 0.8, chance: 0.5, radius: 0.46, depth: 0.32 },
  },
  boulder_a: {
    seed: 606, wetLine: 0.12, wetJitter: 0.06, cull: -0.12, shear: 0,
    blobs: [
      L([0.9, 0.75, 0.8], [0, 0.5, 0], { p: 2.5, spacing: 0.15, taper: 0.3 }),
      L([0.55, 0.5, 0.5], [0.45, 0.35, 0.45], { p: 2.5, spacing: 0.15, taper: 0.3, yaw: 30 }),
    ],
    cuts: [{ count: 5, face: 180, tilt: [-25, 75], depth: [0.76, 0.92], reach: 2.5, shift: 0.3 }],
    fbm: [0.12, 0.9], ridge: [0.11, 0.45],
    pockets: { cell: 0.36, chance: 0.5, radius: 0.26, depth: 0.2 },
  },
  boulder_b: {
    seed: 707, wetLine: 0.1, wetJitter: 0.05, cull: -0.12, shear: 0,
    blobs: [
      L([0.8, 0.8, 0.7], [0, 0.2, 0], { p: 2.4, spacing: 0.15, taper: 0.6 }),
      L([0.5, 0.5, 0.45], [1.1, 0.05, 0.6], { p: 2.4, spacing: 0.15, taper: 0.55, yaw: 40 }),
    ],
    cuts: [{ count: 4, face: 180, tilt: [-20, 70], depth: [0.78, 0.92], reach: 2.5, shift: 0.3 }],
    fbm: [0.11, 0.8], ridge: [0.1, 0.45],
    pockets: { cell: 0.34, chance: 0.5, radius: 0.24, depth: 0.18 },
  },
  boulder_c: {
    seed: 808, wetLine: 0.05, wetJitter: 0.03, cull: -0.08, shear: 0,
    scatter: { count: 7, radius: 1.5, size: [0.12, 0.32], spacing: 0.1 },
    blobs: [],
    cuts: [{ count: 4, face: 180, tilt: [-20, 70], depth: [0.75, 0.9], reach: 3, shift: 0.2 }],
    fbm: [0.03, 0.4], ridge: [0.02, 0.2],
    pockets: { cell: 0.25, chance: 0.4, radius: 0.07, depth: 0.035 },
  },
  beach_a: {
    seed: 909, wetLine: 0.42, wetJitter: 0.1, cull: -0.5, shear: 0, flatTop: 0.55,
    blobs: [
      L([1.5, 0.8, 1.6], [0, 0.05, -0.7], { p: 3, spacing: 0.22 }),
      L([1.2, 0.7, 1.3], [0.3, 0, 1.2], { p: 3, spacing: 0.22, yaw: 25 }),
    ],
    cuts: [{ count: 4, face: 180, tilt: [-12, 25], depth: [0.8, 0.94], reach: 1.2, shift: 0.5 }],
    fbm: [0.14, 1.1], ridge: [0.14, 0.6],
    notch: { y: 0.25, depth: 0.3, width: 0.3 },
    pockets: { cell: 0.5, chance: 0.5, radius: 0.36, depth: 0.22 },
  },
  beach_b: {
    seed: 1010, wetLine: 0.4, wetJitter: 0.1, cull: -0.4, shear: 0,
    blobs: [
      L([0.85, 0.65, 0.75], [0, 0.25, 0], { p: 2.6, spacing: 0.15, taper: 0.3 }),
      L([0.6, 0.5, 0.6], [1.05, 0.15, 0.6], { p: 2.6, spacing: 0.15, taper: 0.3, yaw: 25 }),
      L([0.5, 0.4, 0.45], [-0.75, 0.1, 0.85], { p: 2.6, spacing: 0.15, taper: 0.3, yaw: -20 }),
    ],
    cuts: [{ count: 4, face: 180, tilt: [-15, 60], depth: [0.78, 0.92], reach: 2, shift: 0.3 }],
    fbm: [0.12, 0.9], ridge: [0.12, 0.5],
    notch: { y: 0.2, depth: 0.16, width: 0.22 },
    pockets: { cell: 0.4, chance: 0.5, radius: 0.26, depth: 0.17 },
  },
  reef_a: {
    seed: 1111, wetLine: 1.3, wetJitter: 0.12, cull: -0.6, shear: 0,
    blobs: [L([1.3, 1.05, 1.15], [0, 0.15, 0], { p: 2.4, spacing: 0.18, taper: 0.2 })],
    cuts: [{ count: 4, face: 180, tilt: [-10, 60], depth: [0.8, 0.94], reach: 1.6, shift: 0.4 }],
    fbm: [0.16, 0.9], ridge: [0.2, 0.55],
    notch: { y: 0.5, depth: 0.42, width: 0.3 },
    pockets: { cell: 0.42, chance: 0.45, radius: 0.2, depth: 0.15 },
  },
  reef_b: {
    seed: 1212, wetLine: 0.6, wetJitter: 0.1, cull: -0.4, shear: 0, flatTop: 0.32,
    blobs: [
      L([1.4, 0.45, 1.2], [0, -0.05, 0], { p: 3, spacing: 0.2 }),
      L([1.0, 0.35, 0.9], [1.6, -0.1, -0.8], { p: 3, spacing: 0.2, yaw: 35 }),
      L([0.8, 0.3, 0.7], [-1.3, -0.1, 1.0], { p: 3, spacing: 0.2, yaw: -25 }),
    ],
    cuts: [{ count: 3, face: 180, tilt: [-10, 40], depth: [0.82, 0.94], reach: 1.4, shift: 0.4 }],
    fbm: [0.08, 1.2], ridge: [0.12, 0.8],
    pockets: { cell: 0.5, chance: 0.45, radius: 0.2, depth: 0.12 },
  },
};

// Lighter headland rocks (Holodeck turn 9). LOD multiplies a rock's vertex spacing; the noise octaves stay those of
// the authored spacing (SP in shapeRock), so the weathered surface is the same field sampled more coarsely. Faces of a
// lump that lie wholly inside another lump of the same rock can never be seen and are dropped (buriedFaces).
const LOD = { cliff_a: 1.3, cliff_b: 1.35, cliff_c: 1.3, outcrop_a: 1.3, outcrop_b: 1.4, boulder_a: 1.25, boulder_b: 1.25 };
/** LOD never coarsens a lump past 0.6 m, the kit's widest authored spacing (the cliffs' back slabs keep theirs). */
const lodSpacing = (spacing, lod) => Math.max(spacing, Math.min(spacing * lod, 0.6));

/** Noise octaves whose finest wavelength stays above 2.5 vertex spacings (avoids aliased spikes). */
const octavesFor = (scale, spacing) => Math.max(1, Math.min(4, Math.floor(Math.log2(scale / (2.5 * spacing))) + 1));

// ---------------------------------------------------------------- math helpers
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Deterministic mulberry32 stream. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer lattice hash in [0, 1). */
function hash4(i, j, k, s) {
  let n = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ Math.imul(s, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Seeded 3D gradient noise in about [-1, 1]. */
function makeNoise(seed) {
  const rand = makeRandom(seed);
  const p = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = p.concat(p);
  const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => {
    const g = G[h % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };
  const l = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const X = fx & 255;
    const Y = fy & 255;
    const Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    return l(
      l(l(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
        l(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      l(l(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        l(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  };
}

function fbm(noise, x, y, z, octaves) {
  let sum = 0;
  let amp = 1;
  let f = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, z * f);
    total += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / total;
}

/** Sparse solution pockets: a seeded share of grid cells holds one bowl of random size. Returns depth (m). */
function makePockets(seed, cfg) {
  const cell = cfg.cell;
  return (x, y, z) => {
    const ci = Math.floor(x / cell);
    const cj = Math.floor(y / cell);
    const ck = Math.floor(z / cell);
    let best = 0;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (let c = -1; c <= 1; c++) {
          const i = ci + a;
          const j = cj + b;
          const k = ck + c;
          if (hash4(i, j, k, seed + 3) > cfg.chance) continue;
          const r = cfg.radius * (0.4 + 0.9 * hash4(i, j, k, seed + 4));
          const px = (i + hash4(i, j, k, seed)) * cell;
          const py = (j + hash4(i, j, k, seed + 1)) * cell;
          const pz = (k + hash4(i, j, k, seed + 2)) * cell;
          const d = Math.hypot(x - px, y - py, z - pz);
          if (d < r) best = Math.max(best, (1 - (d / r) ** 2) ** 2 * (r / cfg.radius));
        }
      }
    }
    return best * cfg.depth;
  };
}

// ---------------------------------------------------------------- blob topology
/** Closed grid on the faces of a cube, welded along its edges; per-axis resolution. Triangles come in quad pairs. */
function cubeGrid(nx, ny, nz) {
  const N = [nx, ny, nz];
  const verts = [];
  const lookup = new Map();
  const vid = (i, j, k) => {
    const key = i + ',' + j + ',' + k;
    let id = lookup.get(key);
    if (id === undefined) {
      id = verts.length;
      verts.push([(2 * i) / nx - 1, (2 * j) / ny - 1, (2 * k) / nz - 1]);
      lookup.set(key, id);
    }
    return id;
  };
  const tris = [];
  const AX = [[1, 2], [2, 0], [0, 1]];
  for (let a = 0; a < 3; a++) {
    const [b, c] = AX[a];
    for (const s of [1, -1]) {
      const at = (uu, vv) => {
        const ijk = [0, 0, 0];
        ijk[a] = s > 0 ? N[a] : 0;
        ijk[b] = uu;
        ijk[c] = vv;
        return vid(ijk[0], ijk[1], ijk[2]);
      };
      for (let u = 0; u < N[b]; u++) {
        for (let v = 0; v < N[c]; v++) {
          const v00 = at(u, v);
          const v10 = at(u + 1, v);
          const v11 = at(u + 1, v + 1);
          const v01 = at(u, v + 1);
          if (s > 0) tris.push([v00, v10, v11], [v00, v11, v01]);
          else tris.push([v00, v11, v10], [v00, v01, v11]);
        }
      }
    }
  }
  return { verts, tris };
}

// ---------------------------------------------------------------- shaping features
/** Vertical joint planes; 'z' joints cut across the width of the face (normal near +Z). */
function makeJoints(rand, cfg, extent, mid) {
  if (!cfg) return [];
  const planes = [];
  for (let i = 0; i < cfg.count; i++) {
    const spread = (cfg.spread * Math.PI) / 180;
    const theta = (cfg.across === 'z' ? 0 : rand() * Math.PI) + (rand() - 0.5) * spread;
    const n = [Math.sin(theta), 0, Math.cos(theta)];
    const p = cfg.across === 'z'
      ? [mid[0], 0, mid[2] + (rand() - 0.5) * 1.6 * extent[2]]
      : [mid[0] + (rand() - 0.5) * 1.6 * extent[0], 0, mid[2] + (rand() - 0.5) * 1.6 * extent[2]];
    planes.push({
      n, p, key: rand() * 50,
      depth: cfg.depth * (0.6 + 0.6 * rand()),
      width: cfg.width * (0.7 + 0.6 * rand()),
      wiggle: cfg.wiggle || 0,
    });
  }
  return planes;
}

/** Support distance of a superellipsoid with exponent p along a unit direction in its own frame. */
function supportDistance(radii, p, n) {
  const q = p / (p - 1);
  return Math.pow(Math.pow(Math.abs(radii[0] * n[0]), q) + Math.pow(Math.abs(radii[1] * n[1]), q)
    + Math.pow(Math.abs(radii[2] * n[2]), q), 1 / q);
}

/** Local planar facets: each cut flattens the cap beyond its plane, fading out with in-plane distance. */
function makeCuts(rand, b, cfgs) {
  const cuts = [];
  const yaw = ((b.yaw || 0) * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  for (const cfg of cfgs || []) {
    for (let i = 0; i < cfg.count; i++) {
      const az = ((rand() - 0.5) * 2 * cfg.face * Math.PI) / 180;
      const el = ((cfg.tilt[0] + rand() * (cfg.tilt[1] - cfg.tilt[0])) * Math.PI) / 180;
      const n = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      // Support measured in the blob's own (unyawed) frame.
      const nl = [n[0] * cy - n[2] * sy, n[1], n[0] * sy + n[2] * cy];
      const support = supportDistance(b.radii, b.p, nl);
      const k = cfg.depth[0] + rand() * (cfg.depth[1] - cfg.depth[0]);
      let t = [-n[2], 0, n[0]];
      if (Math.hypot(t[0], t[2]) < 1e-3) t = [1, 0, 0];
      t = norm(t);
      const u = norm(cross(n, t));
      const s1 = (rand() - 0.5) * 2 * cfg.shift * support;
      const s2 = (rand() - 0.5) * cfg.shift * support;
      const o = [0, 1, 2].map((j) => b.center[j] + n[j] * support * k + t[j] * s1 + u[j] * s2);
      cuts.push({ n, o, reach: cfg.reach * support });
    }
  }
  return cuts;
}

function applyCuts(p, cuts) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of cuts) {
      const dx = p[0] - c.o[0];
      const dy = p[1] - c.o[1];
      const dz = p[2] - c.o[2];
      const d = dx * c.n[0] + dy * c.n[1] + dz * c.n[2];
      if (d <= 0) continue;
      const r = Math.hypot(dx - c.n[0] * d, dy - c.n[1] * d, dz - c.n[2] * d);
      const w = 1 - smoothstep(0.6 * c.reach, c.reach, r);
      if (w <= 0) continue;
      p[0] -= c.n[0] * d * w;
      p[1] -= c.n[1] * d * w;
      p[2] -= c.n[2] * d * w;
    }
  }
}

function vertexNormals(P, T) {
  const N = P.map(() => [0, 0, 0]);
  for (const [a, b, c] of T) {
    const fn = cross(sub(P[b], P[a]), sub(P[c], P[a]));
    for (const i of [a, b, c]) {
      N[i][0] += fn[0];
      N[i][1] += fn[1];
      N[i][2] += fn[2];
    }
  }
  return N.map(norm);
}

// ---------------------------------------------------------------- rock assembly
/** Faces of one lump buried inside another lump of the same rock (by generalised winding number). */
function buriedFaces(P, T, lumps) {
  const winding = (lump, q) => {
    let w = 0;
    for (let f = lump.t0; f < lump.t1; f++) {
      const a = sub(P[T[f][0]], q);
      const b = sub(P[T[f][1]], q);
      const c = sub(P[T[f][2]], q);
      const la = Math.hypot(a[0], a[1], a[2]);
      const lb = Math.hypot(b[0], b[1], b[2]);
      const lc = Math.hypot(c[0], c[1], c[2]);
      const bc = cross(b, c);
      const num = a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2];
      const den = la * lb * lc + (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * lc
        + (a[0] * c[0] + a[1] * c[1] + a[2] * c[2]) * lb + (b[0] * c[0] + b[1] * c[1] + b[2] * c[2]) * la;
      w += 2 * Math.atan2(num, den);
    }
    return Math.abs(w) / (4 * Math.PI);
  };
  for (const lump of lumps) {
    lump.lo = [1e9, 1e9, 1e9];
    lump.hi = [-1e9, -1e9, -1e9];
    for (let i = lump.v0; i < lump.v1; i++) {
      for (let k = 0; k < 3; k++) {
        lump.lo[k] = Math.min(lump.lo[k], P[i][k]);
        lump.hi[k] = Math.max(lump.hi[k], P[i][k]);
      }
    }
  }
  const inside = (lump, q) => q[0] > lump.lo[0] && q[0] < lump.hi[0] && q[1] > lump.lo[1] && q[1] < lump.hi[1]
    && q[2] > lump.lo[2] && q[2] < lump.hi[2] && winding(lump, q) > 0.5;
  // Bit j of mask[i]: vertex i lies inside lump j (never its own lump).
  const mask = new Uint32Array(P.length);
  lumps.forEach((own, o) => {
    for (let i = own.v0; i < own.v1; i++) {
      lumps.forEach((lump, j) => {
        if (j !== o && inside(lump, P[i])) mask[i] |= 1 << j;
      });
    }
  });
  const faceLump = new Int32Array(T.length);
  lumps.forEach((lump, j) => faceLump.fill(j, lump.t0, lump.t1));
  const hidden = new Uint8Array(T.length);
  for (let f = 0; f < T.length; f++) {
    const [a, b, c] = T[f];
    const m = mask[a] & mask[b] & mask[c];
    if (!m) continue;
    // The corners, edge midpoints and centroid, lifted off the face by a fifth of its lump's vertex spacing,
    // must all be inside that lump too, so a face just under a dent or a thin edge of that lump stays.
    const A = P[a];
    const B = P[b];
    const C = P[c];
    const n = cross(sub(B, A), sub(C, A));
    const s = (0.2 * lumps[faceLump[f]].spacing) / (Math.hypot(n[0], n[1], n[2]) || 1);
    const lift = (q) => [q[0] + n[0] * s, q[1] + n[1] * s, q[2] + n[2] * s];
    const probes = [A, B, C, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2, (B[2] + C[2]) / 2],
      [(C[0] + A[0]) / 2, (C[1] + A[1]) / 2, (C[2] + A[2]) / 2], [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3]].map(lift);
    for (let j = 0; j < lumps.length && !hidden[f]; j++) {
      if ((m & (1 << j)) && probes.every((q) => inside(lumps[j], q))) hidden[f] = 1;
    }
  }
  return hidden;
}

/** Positions, triangles and per-vertex cavity depth for one variant in asset space. */
function shapeRock(def) {
  const rand = makeRandom(def.seed);
  const lod = def.lod || 1;
  const noise = makeNoise(def.seed * 7 + 1);
  const pockets = def.pockets ? makePockets(def.seed * 13 + 5, def.pockets) : null;
  let blobs = def.blobs;
  if (def.scatter) {
    const sc = def.scatter;
    blobs = [];
    for (let i = 0; i < sc.count; i++) {
      const r = sc.size[0] + rand() * (sc.size[1] - sc.size[0]);
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * sc.radius;
      const ry = r * (0.55 + 0.25 * rand());
      blobs.push({ radii: [r * (0.9 + 0.3 * rand()), ry, r], center: [Math.cos(a) * d, ry * 0.3, Math.sin(a) * d],
        p: 2.3 + rand() * 0.6, spacing: sc.spacing, yaw: rand() * 360, taper: 0.4 * rand() });
    }
  }
  const lo = [1e9, 1e9, 1e9];
  const hi = [-1e9, -1e9, -1e9];
  for (const b of blobs) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], b.center[i] - b.radii[i]);
      hi[i] = Math.max(hi[i], b.center[i] + b.radii[i]);
    }
  }
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const extent = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
  const joints = makeJoints(rand, def.joints, extent, mid);
  const fluteCount = def.flutes ? Math.max(6, Math.round((Math.PI * (extent[0] + extent[2])) / def.flutes.width)) : 0;

  // 1. Base lumps and facets.
  const P = [];
  const T = [];
  const SP = [];
  const lumps = [];
  for (const b of blobs) {
    const [rx, ry, rz] = b.radii;
    const grid = cubeGrid(
      Math.max(3, Math.round((2 * rx) / lodSpacing(b.spacing, lod))),
      Math.max(3, Math.round((2 * ry) / lodSpacing(b.spacing, lod))),
      Math.max(3, Math.round((2 * rz) / lodSpacing(b.spacing, lod))));
    const yaw = ((b.yaw || 0) * Math.PI) / 180;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cuts = makeCuts(rand, b, def.cuts);
    const first = P.length;
    for (const s of grid.verts) {
      const pn = Math.pow(Math.pow(Math.abs(s[0]), b.p) + Math.pow(Math.abs(s[1]), b.p) + Math.pow(Math.abs(s[2]), b.p), 1 / b.p);
      const q = [s[0] / pn, s[1] / pn, s[2] / pn];
      const narrow = b.taper ? 1 - b.taper * Math.pow((q[1] + 1) / 2, 1.5) : 1;
      const local = [q[0] * rx * narrow, q[1] * ry, q[2] * rz * narrow];
      // Yaw about +Y (three.js convention) and move to the blob centre.
      const p = [local[0] * cy + local[2] * sy + b.center[0], local[1] + b.center[1], -local[0] * sy + local[2] * cy + b.center[2]];
      applyCuts(p, cuts);
      P.push(p);
      SP.push(b.spacing);
    }
    const t0 = T.length;
    for (const t of grid.tris) T.push([t[0] + first, t[1] + first, t[2] + first]);
    lumps.push({ v0: first, v1: P.length, t0, t1: T.length, spacing: lodSpacing(b.spacing, lod) });
  }

  // 2. Weathering along the faceted surface normal.
  const N1 = vertexNormals(P, T);
  const out = [];
  const cav = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const n = N1[i];
    const hLen = Math.hypot(n[0], n[2]);
    const h = hLen > 1e-6 ? [n[0] / hLen, 0, n[2] / hLen] : [0, 0, 0];
    const lump = def.fbm[1];
    const crisp = def.ridge[1];
    let dn = def.fbm[0] * fbm(noise, p[0] / lump, p[1] / lump, p[2] / lump, octavesFor(lump, SP[i]));
    const crest = 1 - Math.abs(fbm(noise, p[0] / crisp + 17.1, p[1] / crisp, p[2] / crisp, Math.min(3, octavesFor(crisp, SP[i]))));
    dn += def.ridge[0] * (crest * crest - 0.5);
    if (def.flutes) {
      const s = (Math.atan2(p[2] - mid[2], p[0] - mid[0]) / (2 * Math.PI)) * fluteCount
        + 0.35 * noise(p[0] * 0.5 + 9.1, p[1] * 0.12, p[2] * 0.5);
      const rib = Math.pow(Math.abs(Math.sin(Math.PI * s)), 0.5);
      const mask = smoothstep(0.6, 0.9, hLen) * smoothstep(-0.25, 0.25, noise(p[0] * 0.18 + 3.3, p[1] * 0.25, p[2] * 0.18))
        * smoothstep(def.wetLine, def.wetLine + 0.8, p[1]);
      dn -= def.flutes.depth * (1 - rib) * mask;
    }
    for (const j of joints) {
      const along = (p[0] - j.p[0]) * j.n[0] + (p[2] - j.p[2]) * j.n[2] + j.wiggle * noise(p[1] * 0.35 + j.key, 0.5, 0.5);
      const d = Math.abs(along);
      if (d >= j.width) continue;
      dn -= j.depth * (0.7 + 0.3 * noise(p[1] * 0.6 + 3.3, j.key, 0.5)) * Math.pow(1 - d / j.width, 1.5);
    }
    // Pocket depth also feeds the dark-interior material split.
    const cv = pockets ? pockets(p[0], p[1], p[2]) : 0;
    dn -= cv;
    let dh = 0;
    if (def.notch) dh -= def.notch.depth * Math.exp(-(((p[1] - def.notch.y) / def.notch.width) ** 2));
    dh *= hLen;
    const q = [p[0] + n[0] * dn + h[0] * dh, p[1] + n[1] * dn, p[2] + n[2] * dn + h[2] * dh];
    // Lean the whole rock back into the slope and flatten shelf tops.
    q[0] += def.shear * Math.max(0, q[1]);
    if (def.flatTop !== undefined && q[1] > def.flatTop) q[1] = def.flatTop + (q[1] - def.flatTop) * 0.18;
    out.push(q);
    cav.push(cv);
  }
  // 3. Faces buried inside another lump of this rock can never be seen.
  const hidden = buriedFaces(out, T, lumps);
  return { P: out, T: T.filter((_, f) => !hidden[f]), cav, noise };
}

/**
 * Buried-face culling, crease normals, box-projected UVs and the dry/wet split. The wet field is
 * positive below the jittered wet line or inside deep pockets and joints; triangles crossing its zero
 * set are cut along it, so the wet line and the dark hole interiors follow smooth curves.
 */
function buildGeometries(rock, def, uvOffset) {
  const { P, T, cav, noise } = rock;
  const FN = T.map(([a, b, c]) => cross(sub(P[b], P[a]), sub(P[c], P[a])));
  const FU = FN.map(norm);
  const adj = P.map(() => []);
  T.forEach((t, f) => {
    adj[t[0]].push(f);
    adj[t[1]].push(f);
    adj[t[2]].push(f);
  });
  const cosCrease = Math.cos(((def.crease || 50) * Math.PI) / 180);
  const wetField = P.map((p, i) => {
    const line = def.wetLine + def.wetJitter * (noise(p[0] * 0.6 + 41.7, 0.5, p[2] * 0.6) + 0.35 * noise(p[0] * 1.3, 7.7, p[2] * 1.3));
    const below = line - p[1];
    return def.dark !== undefined ? Math.max(below, cav[i] - def.dark) : below;
  });
  const groups = [0, 1].map(() => ({ p: [], n: [], uv: [], idx: [], map: new Map() }));
  const nkey = (n) => Math.round(n[0] * 400) + ',' + Math.round(n[1] * 400) + ',' + Math.round(n[2] * 400);
  const emit = (g, v, axis) => {
    let id = g.map.get(v.key);
    if (id === undefined) {
      id = g.p.length / 3;
      g.map.set(v.key, id);
      g.p.push(v.pos[0], v.pos[1], v.pos[2]);
      g.n.push(v.n[0], v.n[1], v.n[2]);
      const uv = axis === 0 ? [v.pos[2], v.pos[1]] : axis === 1 ? [v.pos[0], v.pos[2]] : [v.pos[0], v.pos[1]];
      g.uv.push(uv[0] / TEXTURE_REPEAT + uvOffset[0], uv[1] / TEXTURE_REPEAT + uvOffset[1]);
    }
    g.idx.push(id);
  };
  for (let f = 0; f < T.length; f++) {
    const tri = T[f];
    if (def.cull !== undefined && P[tri[0]][1] < def.cull && P[tri[1]][1] < def.cull && P[tri[2]][1] < def.cull) continue;
    const fu = FU[f];
    const ax = Math.abs(fu[0]);
    const ay = Math.abs(fu[1]);
    const az = Math.abs(fu[2]);
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const corners = tri.map((i) => {
      // Blend only the neighbouring faces that bend less than the crease angle.
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const o of adj[i]) {
        const u = FU[o];
        if (u[0] * fu[0] + u[1] * fu[1] + u[2] * fu[2] >= cosCrease) {
          nx += FN[o][0];
          ny += FN[o][1];
          nz += FN[o][2];
        }
      }
      const n = norm([nx, ny, nz]);
      return { i, pos: P[i], n, w: wetField[i], key: i + '|' + axis + '|' + nkey(n) };
    });
    const side = corners.map((c) => (c.w >= 0 ? 1 : 0));
    if (side[0] === side[1] && side[1] === side[2]) {
      for (const c of corners) emit(groups[side[0]], c, axis);
      continue;
    }
    // Rotate the corner whose side differs to the front, keeping the winding, and cut both of its edges.
    const lone = side[0] === side[1] ? 2 : side[0] === side[2] ? 1 : 0;
    const A = corners[lone];
    const B = corners[(lone + 1) % 3];
    const C = corners[(lone + 2) % 3];
    const cut = (u, v) => {
      const t = Math.min(0.98, Math.max(0.02, u.w / (u.w - v.w)));
      const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const n = norm(lerp(u.n, v.n));
      return { pos: lerp(u.pos, v.pos), n, key: 'e' + Math.min(u.i, v.i) + '_' + Math.max(u.i, v.i) + '|' + axis + '|' + nkey(n) };
    };
    const AB = cut(A, B);
    const CA = cut(C, A);
    const own = groups[side[lone]];
    const rest = groups[1 - side[lone]];
    for (const v of [A, AB, CA]) emit(own, v, axis);
    for (const v of [AB, B, C, AB, C, CA]) emit(rest, v, axis);
  }
  return groups.map((g) => (g.idx.length ? meshGeo({ positions: g.p, normals: g.n, uvs: g.uv, indices: g.idx }) : null));
}

function addRock(parent, name, mats, offset, prefix) {
  const def = Object.assign({ lod: LOD[name] || 1 }, KIT[name]);
  const rand = makeRandom(def.seed + 99);
  const [dry, wet] = buildGeometries(shapeRock(def), def, [rand(), rand()]);
  const note = 'Cut along the wet line and hole rims into dry and wet parts; buried bottom faces and faces buried inside another lump culled. Parts are open along those seams; overlapping lumps are intentional.';
  if (dry) {
    const part = createPart(prefix + 'rock', dry, mats.dry, { parent, position: offset });
    part.name = prefix + 'rock';
    markOpenShell(part, note);
  }
  if (wet) {
    const part = createPart(prefix + 'rock_wet', wet, mats.wet, { parent, position: offset });
    part.name = prefix + 'rock_wet';
    markOpenShell(part, note);
  }
}

/** Review-only sand floor at the ground contact (lineup mode). */
function addLineupGround(parent, material) {
  const [x0, x1, z0, z1] = [-12, 14, -32, 70];
  const geo = meshGeo({
    positions: [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [x0, z0, x1, z0, x1, z1, x0, z1],
    indices: [0, 2, 1, 0, 3, 2],
  });
  const part = createPart('lineup_ground', geo, material, { parent });
  part.name = 'lineup_ground';
  markOpenShell(part, 'Single-sided review floor; not part of any saved rock.');
}

async function build() {
  const mats = {
    dry: await compilePortableMaterialSpecV3(DRY_SPEC),
    wet: await compilePortableMaterialSpecV3(WET_SPEC),
  };
  const root = createRoot(VARIANT === 'lineup' ? 'LimestoneKitLineup' : 'LimestoneRock');
  if (VARIANT === 'lineup') {
    const row = [['cliff_a', -22], ['cliff_b', -8], ['cliff_c', 4], ['outcrop_a', 16], ['outcrop_b', 25],
      ['boulder_a', 33], ['boulder_b', 37], ['boulder_c', 41.5], ['beach_a', 47.5], ['beach_b', 53], ['reef_a', 58], ['reef_b', 63.5]];
    for (const [n, z] of row) addRock(root, n, mats, [0, 0, z], n + '_');
    addLineupGround(root, await compilePortableMaterialSpecV3(SAND_SPEC));
  } else {
    addRock(root, VARIANT, mats, [0, 0, 0], '');
  }
  root.userData = { limestoneVariant: VARIANT, groundY: 0, faceDirection: '+X', materials: ['cove-limestone', 'cove-limestone-wet'] };
  return root;
}
