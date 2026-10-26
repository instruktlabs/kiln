/** Which jetty module to build: 'deck', 'platform', 'stair', or 'lineup' to review all three as assembled. */
const VARIANT = 'deck';
const meta = {
  name: VARIANT === 'lineup' ? 'Crescent Cove jetty lineup' : `Crescent Cove jetty ${VARIANT}`,
  role: 'fill',
};

// Crescent Cove timber jetty (Holodeck world tropical-island): a low, weathered jetty on round posts that steps
// from dry sand into knee-deep water. Three modules chain along the jetty line: deck modules, a wide end platform
// and a three-step stair down into the water. Frame: metres, +X seaward along the jetty, +Y up, +Z to the right
// looking seaward. The origin is on the deck top: at the module centre for the deck and platform, at the top edge
// for the stair, so a placement's y is the deck height (0.65 m above the rest water level in this world).
// Each deck module owns the post pair at its landward end with a headstock on each face of it; stringers stop
// 0.13 m short of each post line and rest on those headstocks, so modules chain without doubled posts. The
// platform owns three post pairs. Posts reach 1.65 m below the deck so they stay buried where the sand rises.
// Materials: silver-brown weathered timber with grain along each piece (through its UVs), darker algae-stained
// timber below the splash line, and rusty iron for bolts and nail heads. Bible: silver-brown, cracked, weathered
// driftwood planks with visible gaps and bolts.

const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

/** Deterministic mulberry32 stream. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- dimensions
const PLANK_T = 0.05;            // plank thickness
const GAP = 0.02;                // gap between planks
const STRINGER = [0.075, 0.2];   // width (Z), depth
const HEAD = [0.15, 0.22];       // headstock width (X), depth
const POST_R = [0.13, 0.115];    // bottom, top radius
const POST_BELOW = 1.65;
const WET_Y = -0.5;              // splash line: 0.15 m above the rest water level
const BEAR = 0.13;               // stringer ends stop this far from a post line, over a headstock
const HEAD_OFF = 0.19;           // headstock centre from its post line
const Y_STRINGER = -PLANK_T - STRINGER[1] / 2;
const Y_HEAD = -PLANK_T - STRINGER[1] - HEAD[1] / 2;
const MODULES = {
  deck: { len: 3.0, width: 1.8, planks: 15, stringersZ: [-0.86, 0, 0.86], postZ: 1.03,
    lines: [{ x: -1.5, above: [0.42, 0.34], faces: [-1, 1] }], seed: 11 },
  platform: { len: 3.0, width: 3.0, planks: 15, stringersZ: [-1.46, -0.73, 0, 0.73, 1.46], postZ: 1.63,
    lines: [{ x: -1.5, above: [0.46, 0.38], faces: [-1, 1] }, { x: 0, above: [0, 0], faces: [-1] },
      { x: 1.5, above: [0.36, 0.48], faces: [-1] }], seed: 23 },
  stair: { width: 1.1, steps: 3, rise: 0.2875, run: 0.3, seed: 37 },
};

// ---------------------------------------------------------------- materials
const AREA = { x: 0, y: 0, width: 256, height: 256 };

function timberTexture(name, base, layers, crack) {
  return proceduralTexture({
    schemaVersion: 3, width: 256, height: 256, usage: 'albedo', name,
    operations: [
      { op: 'legacy-v2', spec: { schemaVersion: 2, size: 256, usage: 'albedo', layers: [{ op: 'solid', color: base }, ...layers] } },
      // checks and splits along the grain (image x is U, the length of every piece)
      { op: 'stamps', shape: { kind: 'line', from: [0, 0], to: [72, 1], width: 1 }, rgba: crack, count: 12, seed: 3, area: AREA, periodic: true, opacity: 190 },
      { op: 'stamps', shape: { kind: 'line', from: [0, 0], to: [40, 0], width: 1 }, rgba: [206, 201, 192, 255], count: 9, seed: 5, area: AREA, periodic: true, opacity: 120 },
      { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 10, height: 5 }, rgba: crack, count: 3, seed: 9, area: AREA, periodic: true, opacity: 170 },
    ],
  });
}

function makeMaterials() {
  const timber = pbrMaterial({
    // silver-brown: grey with a little warmth, as the approved eye-level view and the kit sheet
    albedo: timberTexture('WeatheredTimber', 0x968e82, [
      { op: 'stripes', colorA: 0xa49d91, colorB: 0x817a6f, count: 10, angleDeg: 90, blend: 'normal', opacity: 0.45 },
      { op: 'stripes', colorA: 0xaea89c, colorB: 0x726c63, count: 34, angleDeg: 90, blend: 'overlay', opacity: 0.3 },
      { op: 'noise', colorA: 0x66615a, colorB: 0xbdb7ac, scale: 5, octaves: 4, seed: 7, blend: 'overlay', opacity: 0.5 },
      { op: 'noise', colorA: 0x4e4a44, colorB: 0xc8c3b8, scale: 24, octaves: 3, seed: 19, blend: 'overlay', opacity: 0.3 },
    ], [56, 52, 47, 255]),
    roughness: 0.9, metalness: 0,
  });
  timber.name = 'WeatheredTimber';
  const wet = pbrMaterial({
    albedo: timberTexture('WetTimber', 0x5a5544, [
      { op: 'stripes', colorA: 0x625c4a, colorB: 0x4c483a, count: 10, angleDeg: 90, blend: 'normal', opacity: 0.4 },
      { op: 'noise', colorA: 0x3a3c2c, colorB: 0x7a7458, scale: 4, octaves: 4, seed: 29, blend: 'overlay', opacity: 0.6 },
      { op: 'noise', colorA: 0x40462e, colorB: 0x8c8a6a, scale: 20, octaves: 3, seed: 31, blend: 'overlay', opacity: 0.35 },
    ], [34, 32, 25, 255]),
    roughness: 0.8, metalness: 0,
  });
  wet.name = 'WetTimber';
  const iron = pbrMaterial({
    albedo: proceduralTexture({
      schemaVersion: 3, width: 4, height: 4, usage: 'albedo', name: 'RustyIron', background: [64, 52, 42, 255],
      operations: [{ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 2, height: 2 }, rgba: [92, 62, 42, 255] }],
    }),
    roughness: 0.75, metalness: 0.25,
  });
  iron.name = 'RustyIron';
  return { timber, wet, iron };
}

// ---------------------------------------------------------------- mesh builder
function makeMesh() {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  return {
    vert(pos, nor, t) {
      p.push(pos[0], pos[1], pos[2]);
      n.push(nor[0], nor[1], nor[2]);
      uv.push(t[0], t[1]);
      return p.length / 3 - 1;
    },
    tri(a, b, c) {
      idx.push(a, b, c);
    },
    quad(a, b, c, d) {
      idx.push(a, b, c, a, c, d);
    },
    triangles: () => idx.length / 3,
    empty: () => idx.length === 0,
    geometry: () => meshGeo({ positions: p, normals: n, uvs: uv, indices: idx }),
  };
}

/**
 * Flat-shaded prism: a convex profile, counter-clockwise in (v, w), extruded along u for len metres around c.
 * U runs along u (ru metres per repeat, the grain), V around the profile (rv metres per repeat).
 */
function prism(m, o) {
  const u = V.norm(o.u);
  const v = V.norm(V.sub(o.v, V.mul(u, V.dot(o.v, u))));
  const w = V.cross(u, v);
  const P = o.profile;
  const n = P.length;
  const at = (k, s) => V.add(V.add(o.c, V.mul(u, (s * o.len) / 2)), V.add(V.mul(v, P[k][0]), V.mul(w, P[k][1])));
  const u0 = -o.len / 2 / o.ru + o.uv[0];
  const u1 = o.len / 2 / o.ru + o.uv[0];
  let per = 0;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const dv = P[k2][0] - P[k][0];
    const dw = P[k2][1] - P[k][1];
    const el = Math.hypot(dv, dw);
    const N = V.norm(V.sub(V.mul(v, dw), V.mul(w, dv)));
    const v0 = per / o.rv + o.uv[1];
    const v1 = (per + el) / o.rv + o.uv[1];
    m.quad(m.vert(at(k, -1), N, [u0, v0]), m.vert(at(k2, -1), N, [u0, v1]), m.vert(at(k2, 1), N, [u1, v1]), m.vert(at(k, 1), N, [u1, v0]));
    per += el;
  }
  for (const s of [1, -1]) {
    const N = V.mul(u, s);
    const ids = P.map((q, k) => m.vert(at(k, s), N, [q[0] / o.rv + o.uv[0] + 0.37, q[1] / o.rv + o.uv[1]]));
    for (let k = 1; k + 1 < n; k++) {
      if (s > 0) m.tri(ids[0], ids[k], ids[k + 1]);
      else m.tri(ids[0], ids[k + 1], ids[k]);
    }
  }
}

const rect = (a, b) => [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
// plank section: thickness along v (top at +t/2), width along w, chamfered top edges
const plankSection = (t, b, e) => [[-t / 2, -b / 2], [t / 2 - e, -b / 2], [t / 2, -b / 2 + e], [t / 2, b / 2 - e], [t / 2 - e, b / 2], [-t / 2, b / 2]];

/** Box: s = [along u (grain), along v, along u x v]. */
function block(m, o) {
  prism(m, { c: o.c, u: o.u, v: o.v, len: o.s[0], profile: rect(o.s[1], o.s[2]), ru: o.ru, rv: o.rv, uv: o.uv });
}

/** Plank lying flat: top face at c[1] + PLANK_T / 2, length along u, width across. */
function plank(m, o) {
  prism(m, { c: o.c, u: o.u, v: o.v || [0, 1, 0], len: o.len, profile: plankSection(PLANK_T, o.width, 0.008), ru: 1.4, rv: 0.25, uv: o.uv });
}

/**
 * Round piece from a (bottom) to b (top) with radial weathering. o: { a, b, r0, r1, segs, rings, rough, seed,
 * ru, rv, uv, capTop, capBottom, bevel (top edge radius fraction), tr: [t0, t1] (share of a longer piece) }.
 */
function tube(m, o) {
  const axis = V.norm(V.sub(o.b, o.a));
  const len = V.len(V.sub(o.b, o.a));
  const e1 = V.norm(V.cross(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const e2 = V.cross(axis, e1);
  const rand = makeRandom(o.seed);
  const wob = Array.from({ length: o.segs }, () => 1 + (rand() - 0.5) * 2 * o.rough);
  const [t0, t1] = o.tr || [0, 1];
  const rk = (i, t) => wob[i % o.segs] * (1 + (o.rough > 0 ? 0.04 : 0) * Math.sin((3 * TAU * i) / o.segs + 7 * t + o.seed));
  const rings = [];
  for (let j = 0; j <= o.rings; j++) {
    const t = j / o.rings;
    const tg = t0 + (t1 - t0) * t;
    const centre = V.add(o.a, V.mul(axis, len * t));
    const r = o.r0 + (o.r1 - o.r0) * t;
    const ring = [];
    for (let i = 0; i <= o.segs; i++) {
      const ang = (i / o.segs) * TAU;
      const dir = V.add(V.mul(e1, Math.cos(ang)), V.mul(e2, Math.sin(ang)));
      ring.push(m.vert(V.add(centre, V.mul(dir, r * rk(i, tg))), dir, [(len * t) / o.ru + o.uv[0], (ang * r) / o.rv + o.uv[1]]));
    }
    rings.push({ ring, centre, r, t: tg });
  }
  for (let j = 0; j < o.rings; j++) {
    for (let i = 0; i < o.segs; i++) m.quad(rings[j].ring[i], rings[j].ring[i + 1], rings[j + 1].ring[i + 1], rings[j + 1].ring[i]);
  }
  const cap = (end, dirSign, bevel) => {
    const N = V.mul(axis, dirSign);
    const r = end.r * (1 - bevel);
    const lift = dirSign * end.r * bevel * 0.6;
    const c = m.vert(V.add(end.centre, V.mul(axis, lift)), N, [o.uv[0] + 0.5, o.uv[1] + 0.5]);
    const ring = [];
    for (let i = 0; i <= o.segs; i++) {
      const ang = (i / o.segs) * TAU;
      const dir = V.add(V.mul(e1, Math.cos(ang)), V.mul(e2, Math.sin(ang)));
      const q = V.add(V.add(end.centre, V.mul(axis, lift)), V.mul(dir, r * rk(i, end.t)));
      ring.push(m.vert(q, N, [o.uv[0] + 0.5 + (Math.cos(ang) * r) / o.rv, o.uv[1] + 0.5 + (Math.sin(ang) * r) / o.rv]));
    }
    if (bevel > 0) {
      // chamfer between the side and the cap: the side's end ring and the cap ring with a slanted normal
      const outer = [];
      const inner = [];
      for (let i = 0; i <= o.segs; i++) {
        const ang = (i / o.segs) * TAU;
        const dir = V.add(V.mul(e1, Math.cos(ang)), V.mul(e2, Math.sin(ang)));
        const nb = V.norm(V.add(dir, N));
        outer.push(m.vert(V.add(end.centre, V.mul(dir, end.r * rk(i, end.t))), nb, [o.uv[0] + i / o.segs, o.uv[1]]));
        inner.push(m.vert(V.add(V.add(end.centre, V.mul(axis, lift)), V.mul(dir, r * rk(i, end.t))), nb, [o.uv[0] + i / o.segs, o.uv[1] + 0.05]));
      }
      for (let i = 0; i < o.segs; i++) {
        if (dirSign > 0) m.quad(outer[i], outer[i + 1], inner[i + 1], inner[i]);
        else m.quad(outer[i + 1], outer[i], inner[i], inner[i + 1]);
      }
    }
    // e1 x e2 = axis, so counter-clockwise ring order faces +axis
    for (let i = 0; i < o.segs; i++) {
      if (dirSign > 0) m.tri(c, ring[i], ring[i + 1]);
      else m.tri(c, ring[i + 1], ring[i]);
    }
  };
  if (o.capTop) cap(rings[rings.length - 1], 1, o.bevel || 0);
  if (o.capBottom) cap(rings[0], -1, 0);
}

/** Round post from y0 to y1 at (x, z): algae-stained below WET_Y, weathered above, chamfered top. */
function post(M, x, z, y0, y1, r0, r1, seed, uv) {
  const rAt = (y) => r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  const ys = Math.min(Math.max(WET_Y, y0 + 0.05), y1 - 0.05);
  const tS = (ys - y0) / (y1 - y0);
  const base = { segs: 14, rough: 0.05, seed, ru: 1.2, rv: 0.25, uv };
  tube(M.wet, { ...base, a: [x, y0, z], b: [x, ys, z], r0, r1: rAt(ys), rings: 3, tr: [0, tS], capTop: false, capBottom: true });
  tube(M.timber, { ...base, a: [x, ys, z], b: [x, y1, z], r0: rAt(ys), r1, rings: 6, tr: [tS, 1], capTop: true, capBottom: false, bevel: 0.2 });
  return rAt;
}

/** Hex bolt head (or a square nail head with sides 4) on a surface with outward normal nrm. */
function bolt(m, c, nrm, r, h, sides) {
  tube(m, { a: V.sub(c, V.mul(nrm, 0.004)), b: V.add(c, V.mul(nrm, h)), r0: r, r1: r * 0.92, segs: sides, rings: 1, rough: 0, seed: 1,
    ru: 0.1, rv: 0.1, uv: [0, 0], capTop: true, capBottom: false });
}
const nail = (m, c) => bolt(m, c, [0, 1, 0], 0.013, 0.006, 4);
const hexBolt = (m, c, nrm) => bolt(m, c, nrm, 0.022, 0.016, 6);

// ---------------------------------------------------------------- pieces
function plankDeck(M, rand, mod) {
  const pitch = mod.len / mod.planks;
  for (let i = 0; i < mod.planks; i++) {
    const x = -mod.len / 2 + pitch * (i + 0.5) + (rand() - 0.5) * 0.008;
    const w = pitch - GAP - rand() * 0.012;
    const L = mod.width + 0.03 + (rand() - 0.5) * 0.05;
    const z0 = (rand() - 0.5) * 0.04;
    const top = -rand() * 0.006;
    const yaw = (rand() - 0.5) * rad(1.2);
    const roll = (rand() - 0.5) * rad(1.0);
    const u = [Math.sin(yaw), 0, Math.cos(yaw)];
    const v = [Math.sin(roll), Math.cos(roll), 0];
    if (rand() < 0.15) {
      // a plank split along its length
      const w1 = w * (0.35 + rand() * 0.3);
      plank(M.timber, { c: [x - (w - w1) / 2, top - PLANK_T / 2, z0], u, v, len: L, width: w1 - 0.003, uv: [rand() * 9, rand() * 9] });
      plank(M.timber, { c: [x + w1 / 2, top - PLANK_T / 2 - 0.003, z0], u, v, len: L, width: w - w1 - 0.003, uv: [rand() * 9, rand() * 9] });
    } else {
      plank(M.timber, { c: [x, top - PLANK_T / 2, z0], u, v, len: L, width: w, uv: [rand() * 9, rand() * 9] });
    }
    mod.stringersZ.forEach((z, k) => nail(M.iron, [x + ((i + k) % 2 ? 0.035 : -0.035), top, z + (rand() - 0.5) * 0.02]));
  }
}

function frame(M, rand, mod) {
  const xs0 = -mod.len / 2 + BEAR;
  const xs1 = mod.len / 2 - BEAR;
  for (const z of mod.stringersZ) {
    block(M.timber, { c: [(xs0 + xs1) / 2, Y_STRINGER, z], u: [1, 0, 0], v: [0, 1, 0], s: [xs1 - xs0, STRINGER[1], STRINGER[0]],
      ru: 1.6, rv: 0.25, uv: [rand() * 9, rand() * 9] });
  }
  const zHead = mod.postZ + POST_R[0] + 0.1;
  mod.lines.forEach((line, li) => {
    for (const f of line.faces) {
      const xh = line.x + f * HEAD_OFF;
      block(M.timber, { c: [xh, Y_HEAD, 0], u: [0, 0, 1], v: [0, 1, 0], s: [2 * zHead, HEAD[1], HEAD[0]], ru: 1.6, rv: 0.25, uv: [rand() * 9, rand() * 9] });
      for (const sz of [1, -1]) {
        for (const dy of [0.05, -0.05]) hexBolt(M.iron, [xh + (f * HEAD[0]) / 2, Y_HEAD + dy, sz * mod.postZ], [f, 0, 0]);
      }
    }
    [-1, 1].forEach((sz, k) => {
      const rAt = post(M, line.x, sz * mod.postZ, -POST_BELOW, line.above[k], POST_R[0], POST_R[1], mod.seed + 13 * li + 5 * k, [rand() * 9, rand() * 9]);
      hexBolt(M.iron, [line.x, Y_STRINGER, sz * (mod.postZ + rAt(Y_STRINGER))], [0, 0, sz]);
    });
    // X braces between the post pair, on its seaward faces below the headstocks
    const [y0, y1] = [-1.35, -0.55];
    [[[y0, -1], [y1, 1]], [[y0, 1], [y1, -1]]].forEach(([[ya, sa], [yb, sb]], j) => {
      const xb = line.x + POST_R[0] + 0.03 + j * 0.055;
      const a = [xb, ya, sa * mod.postZ];
      const b = [xb, yb, sb * mod.postZ];
      const d = V.sub(b, a);
      const m = ya < WET_Y && yb < WET_Y ? M.wet : M.timber;
      block(m, { c: V.add(a, V.mul(d, 0.5)), u: d, v: [1, 0, 0], s: [V.len(d) + 0.12, 0.05, 0.13], ru: 1.4, rv: 0.25, uv: [rand() * 9, rand() * 9] });
      hexBolt(M.iron, [xb + 0.026, ya + 0.04, sa * (mod.postZ - 0.04)], [1, 0, 0]);
      hexBolt(M.iron, [xb + 0.026, yb - 0.04, sb * (mod.postZ - 0.04)], [1, 0, 0]);
    });
  });
}

function deckOrPlatform(M, key) {
  const mod = MODULES[key];
  const rand = makeRandom(mod.seed);
  plankDeck(M, rand, mod);
  frame(M, rand, mod);
}

function stair(M) {
  const s = MODULES.stair;
  const rand = makeRandom(s.seed);
  const half = s.width / 2;
  const foot = [s.run * s.steps + 0.25, -s.rise * (s.steps + 1)];
  for (let k = 1; k <= s.steps; k++) {
    const y = -k * s.rise;
    const xc = (k - 0.5) * s.run + 0.02;
    const m = y - PLANK_T < WET_Y - 0.1 ? M.wet : M.timber;
    for (const dx of [-0.075, 0.075]) {
      plank(m, { c: [xc + dx, y - PLANK_T / 2 - rand() * 0.004, (rand() - 0.5) * 0.01], u: [0, 0, 1], len: s.width - 0.01, width: 0.13 - rand() * 0.01,
        uv: [rand() * 9, rand() * 9] });
      for (const sz of [-1, 1]) nail(M.iron, [xc + dx, y, sz * (half - 0.04)]);
    }
    for (const sz of [-1, 1]) {
      for (const dx of [-0.07, 0.07]) hexBolt(M.iron, [xc + dx, y - 0.1, sz * (half + 0.05)], [0, 0, sz]);
    }
  }
  // stringers from under the platform edge down into the seabed, their top edges along the tread nosings
  const top = [-0.1, -0.06];
  const d = V.norm([foot[0] - top[0], foot[1] - top[1], 0]);
  const lenS = Math.hypot(foot[0] - top[0], foot[1] - top[1]) + 0.35;
  const w = [d[1], -d[0], 0];
  for (const sz of [-1, 1]) {
    const c0 = V.add([top[0], top[1], sz * (half + 0.025)], V.mul(w, 0.13)); // upper end of the centreline
    const ts = (WET_Y - c0[1]) / d[1];
    [[0, ts, M.timber], [ts, lenS, M.wet]].forEach(([ta, tb, m]) => {
      block(m, { c: V.add(c0, V.mul(d, (ta + tb) / 2)), u: d, v: [0, 0, 1], s: [tb - ta, 0.05, 0.26], ru: 1.4, rv: 0.25, uv: [rand() * 9, rand() * 9] });
    });
  }
  // two posts as in the kit: a short one at the top on the left, a taller one further down on the right
  const pz = half + 0.05 + 0.11;
  const rL = post(M, 0.06, -pz, -POST_BELOW, 0.3, 0.115, 0.1, 91, [rand() * 9, rand() * 9]);
  const rR = post(M, 0.42, pz, -POST_BELOW - 0.3, 0.52, 0.115, 0.1, 92, [rand() * 9, rand() * 9]);
  hexBolt(M.iron, [0.06, -0.3, -(pz + rL(-0.3))], [0, 0, -1]);
  hexBolt(M.iron, [0.42, -0.52, pz + rR(-0.52)], [0, 0, 1]);
}

// ---------------------------------------------------------------- assembly
function addModule(parent, key, position, prefix, mats) {
  const M = { timber: makeMesh(), wet: makeMesh(), iron: makeMesh() };
  if (key === 'stair') stair(M);
  else deckOrPlatform(M, key);
  const counts = {};
  for (const [k, mesh] of Object.entries(M)) {
    if (mesh.empty()) continue;
    const part = createPart(prefix + k, mesh.geometry(), mats[k], { parent, position });
    part.name = prefix + k;
    markOpenShell(part, k === 'iron'
      ? 'Bolt and nail heads are capped prisms whose open bases sit in the timber.'
      : 'Closed timber pieces that touch or interpenetrate at joints; post feet sit below the seabed.');
    counts[k] = mesh.triangles();
  }
  return counts;
}

async function build() {
  const mats = makeMaterials();
  const root = createRoot(VARIANT === 'lineup' ? 'JettyLineup' : 'JettyModule');
  const modules = {};
  if (VARIANT === 'lineup') {
    // as placed: three deck modules from the root on the sand, the platform, then the stair off its seaward edge
    const d = MODULES.deck.len;
    [0, 1, 2].forEach((i) => { modules['deck_' + i] = addModule(root, 'deck', [d * (i + 0.5), 0, 0], `deck${i}_`, mats); });
    modules.platform = addModule(root, 'platform', [3 * d + MODULES.platform.len / 2, 0, 0], 'platform_', mats);
    modules.stair = addModule(root, 'stair', [3 * d + MODULES.platform.len, 0, 0], 'stair_', mats);
  } else {
    modules[VARIANT] = addModule(root, VARIANT, [0, 0, 0], '', mats);
  }
  root.userData = { jettyVariant: VARIANT, modules };
  return root;
}
