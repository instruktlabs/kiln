const meta = { name: 'Crescent Cove thatched shelter', role: 'hero' };

// Crescent Cove beach shelter (Holodeck world tropical-island): the shaded stop by the jetty. A deep, shaggy hip
// thatch in dry straw tones on six heavy round posts, a picnic table (0.75 m) with two benches in its shade, and a
// low plank floor bedded in the sand. Frame: metres, +X forward (toward the lagoon and the jetty), +Y up, +Z right;
// origin on the sand at the shelter centre, so a placement's y is the pad height.
// Bible: eaves 2.2-2.5 m (underside 2.38 m, fringe to about 2.25 m); table 0.75 m; silver-brown weathered timber;
// thatch in dry straw tones. The floor top sits 0.045 m above the sand: the walker is carried by the terrain
// (Holodeck support is terrain-only), so the floor must not be raised.
// Thatch: five overlapping courses around the hip roof, each thicker at its butt, with a ragged sawtooth butt
// edge; a darker underside on the rafters and battens; a bound ridge roll.

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
const XP = 1.35;                 // post lines at x = +-XP
const ZP = 1.75;                 // posts at z = -ZP, 0, +ZP
const POST_TOP = 2.49;
const PLATE = [2.49, 2.65];      // wall plates and tie beams (bottom, top)
const TAN_P = 0.78;              // roof pitch, about 38 degrees
const SIN_P = TAN_P / Math.hypot(1, TAN_P);
const COS_P = 1 / Math.hypot(1, TAN_P);
const YP = 2.85;                 // thatch underside over the post lines
const OH = 0.6;                  // eave overhang beyond the posts
const XE = XP + OH;
const ZE = ZP + OH;
const YE = YP - OH * TAN_P;      // underside at the eave line: 2.382
const RISE = XE * TAN_P;
const YR = YE + RISE;            // underside at the ridge: 3.903
const ZR = ZE - XE;              // ridge half-length: 0.4
const SLOPE = XE / COS_P;        // eave-to-ridge length along a face
const COURSES = [-0.035, 0.19, 0.39, 0.57, 0.75]; // course butt levels (0 = eave line, 1 = ridge)
const T_EAVE = 0.34;             // thatch thickness at the eave course's butt
const T_BUTT = 0.3;              // at the other courses' butts
const T_TOP = 0.24;              // and where a course tucks under the next one (steps of about 0.04 m)
const N_FB = 56;                 // perimeter samples on the front and back faces (about 0.1 m at the eaves)
const N_LR = 46;                 // and on the hip ends
const RU = 0.5;                  // thatch metres per texture repeat across the fibres
const RV = 0.6;                  // and along them (down the slope)
const PLANK_T = 0.05;
const TABLE = { len: 1.6, width: 0.75, top: 0.75 };
const BENCH = { len: 1.6, x: 0.66, seat: 0.45, width: 0.28 };
const FLOOR = { x: 1.6, z: 2.0, top: 0.045, pitch: 0.19 };

// ---------------------------------------------------------------- materials
const AREA = { x: 0, y: 0, width: 256, height: 256 };

function makeMaterials() {
  // timber recipe shared with the jetty: silver-brown, grain along U, checks and knots
  const timber = pbrMaterial({
    albedo: proceduralTexture({
      schemaVersion: 3, width: 256, height: 256, usage: 'albedo', name: 'WeatheredTimber',
      operations: [
        { op: 'legacy-v2', spec: { schemaVersion: 2, size: 256, usage: 'albedo', layers: [
          { op: 'solid', color: 0x968e82 },
          { op: 'stripes', colorA: 0xa49d91, colorB: 0x817a6f, count: 10, angleDeg: 90, blend: 'normal', opacity: 0.45 },
          { op: 'stripes', colorA: 0xaea89c, colorB: 0x726c63, count: 34, angleDeg: 90, blend: 'overlay', opacity: 0.3 },
          { op: 'noise', colorA: 0x66615a, colorB: 0xbdb7ac, scale: 5, octaves: 4, seed: 7, blend: 'overlay', opacity: 0.5 },
          { op: 'noise', colorA: 0x4e4a44, colorB: 0xc8c3b8, scale: 24, octaves: 3, seed: 19, blend: 'overlay', opacity: 0.3 },
        ] } },
        { op: 'stamps', shape: { kind: 'line', from: [0, 0], to: [72, 1], width: 1 }, rgba: [56, 52, 47, 255], count: 12, seed: 3, area: AREA, periodic: true, opacity: 190 },
        { op: 'stamps', shape: { kind: 'line', from: [0, 0], to: [40, 0], width: 1 }, rgba: [206, 201, 192, 255], count: 9, seed: 5, area: AREA, periodic: true, opacity: 120 },
        { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 10, height: 5 }, rgba: [56, 52, 47, 255], count: 3, seed: 9, area: AREA, periodic: true, opacity: 170 },
      ],
    }),
    roughness: 0.9, metalness: 0,
  });
  timber.name = 'WeatheredTimber';
  // straw: fibres run along V (down the slope), so stripes vary across U (angle 0)
  const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const straw = (name, base, fA, fB, pA, pB, light, dark) => proceduralTexture({
    schemaVersion: 3, width: 256, height: 256, usage: 'albedo', name,
    operations: [
      { op: 'legacy-v2', spec: { schemaVersion: 2, size: 256, usage: 'albedo', layers: [
        { op: 'solid', color: base },
        { op: 'stripes', colorA: fA, colorB: fB, count: 22, angleDeg: 0, blend: 'normal', opacity: 0.35 },
        { op: 'stripes', colorA: fA, colorB: fB, count: 96, angleDeg: 0, blend: 'overlay', opacity: 0.4 },
        { op: 'noise', colorA: pA, colorB: pB, scale: 6, octaves: 4, seed: 41, blend: 'overlay', opacity: 0.5 },
        { op: 'noise', colorA: dark, colorB: light, scale: 30, octaves: 2, seed: 43, blend: 'overlay', opacity: 0.25 },
      ] } },
      { op: 'stamps', shape: { kind: 'line', from: [0, 0], to: [1, 34], width: 1 }, rgba: [...hex(light), 255], count: 14, seed: 45, area: AREA, periodic: true, opacity: 150 },
      { op: 'stamps', shape: { kind: 'line', from: [0, 0], to: [0, 26], width: 1 }, rgba: [...hex(dark), 255], count: 12, seed: 47, area: AREA, periodic: true, opacity: 150 },
    ],
  });
  const thatch = pbrMaterial({
    // dry straw, weathered toward grey-tan as in the approved eye-level view
    albedo: straw('DryThatch', 0x9e9078, 0xbeb094, 0x70644e, 0x8a857a, 0xb3a382, 0xd2c7ae, 0x5a5044),
    roughness: 0.95, metalness: 0,
  });
  thatch.name = 'DryThatch';
  const under = pbrMaterial({
    albedo: straw('ThatchUnderside', 0x74684f, 0x8e8164, 0x50463a, 0x625a4c, 0x897a5e, 0xa09276, 0x3c342b),
    roughness: 0.95, metalness: 0,
  });
  under.name = 'ThatchUnderside';
  const iron = pbrMaterial({
    albedo: proceduralTexture({
      schemaVersion: 3, width: 4, height: 4, usage: 'albedo', name: 'RustyIron', background: [64, 52, 42, 255],
      operations: [{ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 2, height: 2 }, rgba: [92, 62, 42, 255] }],
    }),
    roughness: 0.75, metalness: 0.25,
  });
  iron.name = 'RustyIron';
  return { timber, thatch, under, iron };
}

// ---------------------------------------------------------------- mesh builder
function makeMesh() {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const pos = (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
  return {
    vert(q, nor, t) {
      p.push(q[0], q[1], q[2]);
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
    /** Quad wound to face `want` (judged by the cross of its diagonals, robust to collapsed corners). */
    oquad(a, b, c, d, want) {
      const nq = V.cross(V.sub(pos(c), pos(a)), V.sub(pos(d), pos(b)));
      if (V.dot(nq, want) >= 0) idx.push(a, b, c, a, c, d);
      else idx.push(a, c, b, a, d, c);
    },
    otri(a, b, c, want) {
      const nt = V.cross(V.sub(pos(b), pos(a)), V.sub(pos(c), pos(a)));
      if (V.dot(nt, want) >= 0) idx.push(a, b, c);
      else idx.push(a, c, b);
    },
    triangles: () => idx.length / 3,
    empty: () => idx.length === 0,
    geometry: () => meshGeo({ positions: p, normals: n, uvs: uv, indices: idx }),
  };
}

/** Flat-shaded prism: a convex profile, counter-clockwise in (v, w), extruded along u for len metres around c. */
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
const plankSection = (t, b, e) => [[-t / 2, -b / 2], [t / 2 - e, -b / 2], [t / 2, -b / 2 + e], [t / 2, b / 2 - e], [t / 2 - e, b / 2], [-t / 2, b / 2]];

/** Box: s = [along u (grain), along v, along u x v]. */
function block(m, o) {
  prism(m, { c: o.c, u: o.u, v: o.v, len: o.s[0], profile: rect(o.s[1], o.s[2]), ru: o.ru || 1.4, rv: o.rv || 0.25, uv: o.uv });
}

/** Plank lying flat: top face at c[1] + PLANK_T / 2, length along u, width across. */
function plank(m, o) {
  prism(m, { c: o.c, u: o.u, v: o.v || [0, 1, 0], len: o.len, profile: plankSection(PLANK_T, o.width, 0.008), ru: 1.4, rv: 0.25, uv: o.uv });
}

/** Round piece from a to b with radial weathering; caps optional, chamfered top when bevel > 0. */
function tube(m, o) {
  const axis = V.norm(V.sub(o.b, o.a));
  const len = V.len(V.sub(o.b, o.a));
  const e1 = V.norm(V.cross(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const e2 = V.cross(axis, e1);
  const rand = makeRandom(o.seed);
  const wob = Array.from({ length: o.segs }, () => 1 + (rand() - 0.5) * 2 * o.rough);
  const rk = (i, t) => wob[i % o.segs] * (1 + (o.rough > 0 ? 0.04 : 0) * Math.sin((3 * TAU * i) / o.segs + 7 * t + o.seed));
  const rings = [];
  for (let j = 0; j <= o.rings; j++) {
    const t = j / o.rings;
    const centre = V.add(o.a, V.mul(axis, len * t));
    const r = o.r0 + (o.r1 - o.r0) * t;
    const ring = [];
    for (let i = 0; i <= o.segs; i++) {
      const ang = (i / o.segs) * TAU;
      const dir = V.add(V.mul(e1, Math.cos(ang)), V.mul(e2, Math.sin(ang)));
      ring.push(m.vert(V.add(centre, V.mul(dir, r * rk(i, t))), dir, [(len * t) / o.ru + o.uv[0], (ang * r) / o.rv + o.uv[1]]));
    }
    rings.push({ ring, centre, r, t });
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
      ring.push(m.vert(V.add(V.add(end.centre, V.mul(axis, lift)), V.mul(dir, r * rk(i, end.t))), N,
        [o.uv[0] + 0.5 + (Math.cos(ang) * r) / o.rv, o.uv[1] + 0.5 + (Math.sin(ang) * r) / o.rv]));
    }
    if (bevel > 0) {
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
    for (let i = 0; i < o.segs; i++) {
      if (dirSign > 0) m.tri(c, ring[i], ring[i + 1]);
      else m.tri(c, ring[i + 1], ring[i]);
    }
  };
  if (o.capTop) cap(rings[rings.length - 1], 1, o.bevel || 0);
  if (o.capBottom) cap(rings[0], -1, 0);
}

const pole = (m, a, b, r, seed, segs = 8) => tube(m, { a, b, r0: r, r1: r * 0.92, segs, rings: 2, rough: 0.06, seed, ru: 1.2, rv: 0.25,
  uv: [seed * 0.37, seed * 0.11], capTop: true, capBottom: true });

function bolt(m, c, nrm, r, h, sides) {
  tube(m, { a: V.sub(c, V.mul(nrm, 0.004)), b: V.add(c, V.mul(nrm, h)), r0: r, r1: r * 0.92, segs: sides, rings: 1, rough: 0, seed: 1,
    ru: 0.1, rv: 0.1, uv: [0, 0], capTop: true, capBottom: false });
}
const nail = (m, c) => bolt(m, c, [0, 1, 0], 0.012, 0.005, 4);
const hexBolt = (m, c, nrm) => bolt(m, c, nrm, 0.022, 0.016, 6);

// ---------------------------------------------------------------- roof geometry
// The thatch underside is a hip roof: level h in [0, 1] is a rectangle of half-sizes a = XE (1 - h), b = ZE - XE h
// at height YE + RISE h. Sides in order: front (+X), right (+Z), back (-X), left (-Z); f runs 0..1 along a side.
const SIDES = [
  { n: [SIN_P, COS_P, 0], d: [COS_P, -SIN_P, 0] },
  { n: [0, COS_P, SIN_P], d: [0, -SIN_P, COS_P] },
  { n: [-SIN_P, COS_P, 0], d: [-COS_P, -SIN_P, 0] },
  { n: [0, COS_P, -SIN_P], d: [0, -SIN_P, -COS_P] },
];

function basePoint(h, s, f) {
  const a = XE * (1 - h);
  const b = ZE - XE * h;
  const y = YE + RISE * h;
  if (s === 0) return [a, y, -b + 2 * b * f];
  if (s === 1) return [a - 2 * a * f, y, b];
  if (s === 2) return [-a, y, b - 2 * b * f];
  return [-a + 2 * a * f, y, -b];
}

/** Offset direction for thickness t (mitred at the hips), shading normal and butt-face normal for a sample. */
function frameAt(q) {
  const S = SIDES[q.s];
  if (q.f > 0) return { m: S.n, n: S.n, nb: V.norm(V.add(S.d, [0, -0.35, 0])) };
  const P = SIDES[(q.s + 3) % 4];
  const c = V.dot(P.n, S.n);
  return {
    m: V.mul(V.add(P.n, S.n), 1 / (1 + c)),
    n: V.norm(V.add(P.n, S.n)),
    nb: V.norm(V.add(V.add(P.d, S.d), [0, -0.7, 0])),
  };
}

function courseRows(k) {
  const hb = COURSES[k];
  const ht = k + 1 < COURSES.length ? COURSES[k + 1] + 0.1 : 0.97;
  const tb = k === 0 ? T_EAVE : T_BUTT;
  return { h: [hb, (hb + ht) / 2, ht], t: [tb, (tb + T_TOP) / 2 + 0.015, T_TOP] };
}

/** Outer-surface thickness of course k at level h (without its noise). */
function courseT(k, h) {
  const { h: H, t: T } = courseRows(k);
  if (h <= H[1]) return T[0] + ((T[1] - T[0]) * (h - H[0])) / (H[1] - H[0]);
  return T[1] + ((T[2] - T[1]) * (h - H[1])) / (H[2] - H[1]);
}

function thatchRoof(M, rand) {
  const samples = [];
  [N_FB, N_LR, N_FB, N_LR].forEach((N, s) => {
    for (let j = 0; j < N; j++) samples.push({ s, f: j / N });
  });
  const NS = samples.length;
  const U = [];
  let acc = 0;
  for (let i = 0; i <= NS; i++) {
    U.push(acc / RU);
    const q0 = samples[i % NS];
    const q1 = samples[(i + 1) % NS];
    acc += V.len(V.sub(basePoint(0, q1.s, q1.f), basePoint(0, q0.s, q0.f)));
  }
  const frames = samples.map(frameAt);
  COURSES.forEach((_, k) => {
    const { h: H, t: T } = courseRows(k);
    // ragged butts: a random drop plus a sawtooth; the eave course hangs shaggier
    const jit = samples.map((q, i) => ({
      dh: k === 0 ? -(0.01 + 0.035 * rand()) - (i % 2 ? 0.02 : 0) : -(0.006 + 0.022 * rand()) - (i % 2 ? 0.012 : 0),
      dt: (rand() - 0.5) * (k === 0 ? 0.08 : 0.06),
      dm: (rand() - 0.5) * 0.035,
    }));
    const grid = H.map((h, r) => {
      const ids = [];
      for (let i = 0; i <= NS; i++) {
        const q = samples[i % NS];
        const J = jit[i % NS];
        const F = frames[i % NS];
        const hh = r === 0 ? h + J.dh : h;
        const tt = T[r] + (r === 0 ? J.dt : r === 1 ? J.dm : 0);
        ids.push(M.thatch.vert(V.add(basePoint(hh, q.s, q.f), V.mul(F.m, tt)), F.n, [U[i], (hh * SLOPE) / RV]));
      }
      return ids;
    });
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < NS; i++) M.thatch.oquad(grid[r][i], grid[r][i + 1], grid[r + 1][i + 1], grid[r + 1][i], SIDES[samples[i].s].n);
    }
    // butt face: from the ragged outer edge back to the underside (eave course) or into the course below
    const hi = H[0] + (k === 0 ? 0.012 : 0.02);
    const ti = k === 0 ? 0 : courseT(k - 1, hi) - 0.03;
    const outer = [];
    const inner = [];
    for (let i = 0; i <= NS; i++) {
      const q = samples[i % NS];
      const J = jit[i % NS];
      const F = frames[i % NS];
      outer.push(M.thatch.vert(V.add(basePoint(H[0] + J.dh, q.s, q.f), V.mul(F.m, T[0] + J.dt)), F.nb, [U[i], 0]));
      inner.push(M.thatch.vert(V.add(basePoint(hi, q.s, q.f), V.mul(F.m, ti)), F.nb, [U[i], 0.12]));
    }
    for (let i = 0; i < NS; i++) {
      const S = SIDES[samples[i].s];
      M.thatch.oquad(outer[i], outer[i + 1], inner[i + 1], inner[i], V.add(S.d, [0, -0.35, 0]));
    }
  });
  // underside: four planar faces on the rafters, seen from beneath
  const h0 = COURSES[0];
  for (let s = 0; s < 4; s++) {
    const want = V.mul(SIDES[s].n, -1);
    const A = basePoint(h0, s, 0);
    const B = basePoint(h0, s, 1);
    const C = basePoint(1, s, 1);
    const D = basePoint(1, s, 0);
    const edge = V.len(V.sub(B, A));
    const dir = V.norm(V.sub(B, A));
    const uvOf = (P) => [V.dot(V.sub(P, A), dir) / RU, ((P[1] - A[1]) / SIN_P) / RV];
    const ia = M.under.vert(A, want, uvOf(A));
    const ib = M.under.vert(B, want, uvOf(B));
    const ic = M.under.vert(C, want, uvOf(C));
    if (s % 2 === 0) M.under.oquad(ia, ib, ic, M.under.vert(D, want, uvOf(D)), want);
    else M.under.otri(ia, ib, ic, want);
    void edge;
  }
  ridgeRoll(M, rand);
}

/** Bound ridge roll along Z over the ridge: flattened, rounded at the ends, three darker bindings. */
function ridgeRoll(M, rand) {
  const R = 0.2;
  const SY = 0.82;
  const yc = YR + 0.13;
  const half = ZR + 0.24;
  const prof = [[0, 0.2], [0.03, 0.58], [0.08, 0.82], [0.16, 0.96], [0.3, 1], [0.5, 1.02], [0.7, 1], [0.84, 0.96], [0.92, 0.82], [0.97, 0.58], [1, 0.2]];
  const segs = 16;
  const ring = (m, z, k, uvV, grow = 1) => {
    const ids = [];
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * TAU;
      const r = R * k * grow * (1 + 0.04 * Math.sin(5 * ang + z * 9));
      const P = [Math.cos(ang) * r, yc + Math.sin(ang) * r * SY, z];
      ids.push(m.vert(P, V.norm([Math.cos(ang), Math.sin(ang) / SY, 0]), [(ang * R) / RU, uvV]));
    }
    return ids;
  };
  const rings = prof.map(([t, k]) => ({ z: -half + 2 * half * t, ids: ring(M.thatch, -half + 2 * half * t, k, (2 * half * t) / RV) }));
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < segs; i++) {
      const want = [Math.cos(((i + 0.5) / segs) * TAU), Math.sin(((i + 0.5) / segs) * TAU), 0];
      M.thatch.oquad(rings[j].ids[i], rings[j].ids[i + 1], rings[j + 1].ids[i + 1], rings[j + 1].ids[i], want);
    }
  }
  for (const [end, sgn] of [[rings[0], -1], [rings[rings.length - 1], 1]]) {
    const c = M.thatch.vert([0, yc, end.z + sgn * 0.01], [0, 0, sgn], [0, 0]);
    for (let i = 0; i < segs; i++) M.thatch.otri(c, end.ids[i], end.ids[i + 1], [0, 0, sgn]);
  }
  for (const z of [-0.36, 0, 0.36]) {
    const a = ring(M.under, z - 0.03, 1.02, 0, 1.06);
    const b = ring(M.under, z + 0.03, 1.02, 0.1, 1.06);
    for (let i = 0; i < segs; i++) {
      const want = [Math.cos(((i + 0.5) / segs) * TAU), Math.sin(((i + 0.5) / segs) * TAU), 0];
      M.under.oquad(a[i], a[i + 1], b[i + 1], b[i], want);
    }
  }
  void rand;
}

// ---------------------------------------------------------------- timber frame
function roofFrame(M, rand) {
  const T = M.timber;
  const uv = () => [rand() * 9, rand() * 9];
  // wall plates along Z, tie beams along X (lapped at the post tops)
  const yc = (PLATE[0] + PLATE[1]) / 2;
  const dz = PLATE[1] - PLATE[0];
  for (const sx of [-1, 1]) block(T, { c: [sx * XP, yc, 0], u: [0, 0, 1], v: [0, 1, 0], s: [2 * ZP + 0.2, dz, 0.16], uv: uv() });
  for (const z of [-ZP, 0, ZP]) block(T, { c: [0, yc + 0.002, z], u: [1, 0, 0], v: [0, 1, 0], s: [2 * XP + 0.2, dz, 0.14], uv: uv() });
  // rafters on the plates, 0.11 m under the thatch underside (centre), battens across them
  const tR = -0.11;
  const onFace = (s, h, c0) => {
    const y = YE + RISE * h;
    if (s === 0) return [XE * (1 - h), y, c0];
    if (s === 2) return [-XE * (1 - h), y, c0];
    if (s === 1) return [c0, y, ZE - XE * h];
    return [c0, y, -(ZE - XE * h)];
  };
  let seed = 101;
  const h0 = 0.02;
  for (const s of [0, 2]) {
    for (const z0 of [-1.3, -0.65, 0, 0.65, 1.3]) {
      const h1 = Math.abs(z0) > ZR ? (ZE - Math.abs(z0)) / XE : 1;
      const n = SIDES[s].n;
      pole(T, V.add(onFace(s, h0, z0), V.mul(n, tR)), V.add(onFace(s, h1, z0), V.mul(n, tR)), 0.05, seed++);
    }
  }
  for (const s of [1, 3]) {
    for (const x0 of [-0.7, 0, 0.7]) {
      const h1 = 1 - Math.abs(x0) / XE;
      const n = SIDES[s].n;
      pole(T, V.add(onFace(s, h0, x0), V.mul(n, tR)), V.add(onFace(s, h1, x0), V.mul(n, tR)), 0.05, seed++);
    }
  }
  for (let s = 0; s < 4; s++) {
    const F = frameAt({ s, f: 0 });
    pole(T, V.add(basePoint(h0, s, 0), V.mul(F.m, tR)), V.add(basePoint(1, s, 0), V.mul(F.m, tR)), 0.06, seed++, 10);
  }
  const yRidge = YR + tR / COS_P;
  pole(T, [0, yRidge, -ZR - 0.12], [0, yRidge, ZR + 0.12], 0.065, seed++, 10);
  pole(T, [0, PLATE[1], 0], [0, yRidge - 0.05, 0], 0.07, seed++, 10); // king post on the middle tie beam
  for (const hb of [0.22, 0.45, 0.68]) {
    for (let s = 0; s < 4; s++) {
      const F0 = frameAt({ s, f: 0 });
      const F1 = frameAt({ s: (s + 1) % 4, f: 0 });
      pole(M.timber, V.add(basePoint(hb, s, 0), V.mul(F0.m, -0.035)), V.add(basePoint(hb, s, 1), V.mul(F1.m, -0.035)), 0.026, seed++, 6);
    }
  }
}

function posts(M, rand) {
  let k = 0;
  for (const sx of [-1, 1]) {
    for (const z of [-ZP, 0, ZP]) {
      const x = sx * XP;
      tube(M.timber, { a: [x, -0.5, z], b: [x, POST_TOP, z], r0: 0.13, r1: 0.118, segs: 14, rings: 8, rough: 0.05, seed: 61 + 7 * k,
        ru: 1.2, rv: 0.25, uv: [rand() * 9, rand() * 9], capTop: true, capBottom: true, bevel: 0 });
      // bolts through the wall plate into the post top
      for (const dy of [0.04, -0.04]) hexBolt(M.iron, [x + sx * 0.08, (PLATE[0] + PLATE[1]) / 2 + dy, z + 0.03 * (dy > 0 ? 1 : -1)], [sx, 0, 0]);
      // knee braces along the wall plate toward the shelter's middle
      const dirs = z === 0 ? [-1, 1] : [-Math.sign(z)];
      for (const dz of dirs) {
        const a = [x, 1.92, z + dz * 0.1];
        const b = [x, PLATE[0] - 0.01, z + dz * 0.62];
        const d = V.sub(b, a);
        block(M.timber, { c: V.add(a, V.mul(d, 0.5)), u: d, v: [1, 0, 0], s: [V.len(d) + 0.06, 0.09, 0.1], uv: [rand() * 9, rand() * 9] });
        hexBolt(M.iron, [x + sx * 0.05, a[1] + 0.06, a[2] + dz * 0.03], [sx, 0, 0]);
      }
      k++;
    }
  }
}

// ---------------------------------------------------------------- table, benches and floor
function furniture(M, rand) {
  const T = M.timber;
  const uv = () => [rand() * 9, rand() * 9];
  // table top: five planks along Z
  const tp = TABLE.width / 5;
  for (let i = 0; i < 5; i++) {
    const x = -TABLE.width / 2 + tp * (i + 0.5);
    plank(T, { c: [x + (rand() - 0.5) * 0.006, TABLE.top - PLANK_T / 2 - rand() * 0.004, (rand() - 0.5) * 0.02], u: [0, 0, 1], len: TABLE.len, width: tp - 0.012, uv: uv() });
    for (const z of [-0.6, 0.6]) nail(M.iron, [x, TABLE.top, z]);
  }
  // trestles: splayed legs, a cleat under the top, a stretcher between them
  for (const z of [-0.6, 0.6]) {
    block(T, { c: [0, TABLE.top - PLANK_T - 0.035, z], u: [1, 0, 0], v: [0, 1, 0], s: [TABLE.width - 0.04, 0.07, 0.06], uv: uv() });
    for (const sx of [-1, 1]) {
      const a = [sx * 0.33, 0.0, z];
      const b = [sx * 0.1, TABLE.top - PLANK_T - 0.07, z];
      const d = V.sub(b, a);
      block(T, { c: V.add(a, V.mul(d, 0.5)), u: d, v: [0, 0, 1], s: [V.len(d), 0.06, 0.09], uv: uv() });
    }
    hexBolt(M.iron, [0, TABLE.top - 0.12, z + 0.03 * Math.sign(z)], [0, 0, Math.sign(z)]);
  }
  block(T, { c: [0, 0.28, 0], u: [0, 0, 1], v: [0, 1, 0], s: [1.26, 0.08, 0.06], uv: uv() });
  // benches either side
  for (const sx of [-1, 1]) {
    const xb = sx * BENCH.x;
    for (const dx of [-0.07, 0.07]) {
      plank(T, { c: [xb + dx, BENCH.seat - PLANK_T / 2 - rand() * 0.004, (rand() - 0.5) * 0.02], u: [0, 0, 1], len: BENCH.len, width: 0.13, uv: uv() });
      for (const z of [-0.6, 0.6]) nail(M.iron, [xb + dx, BENCH.seat, z]);
    }
    for (const z of [-0.6, 0.6]) {
      block(T, { c: [xb, (BENCH.seat - PLANK_T) / 2, z], u: [0, 1, 0], v: [1, 0, 0], s: [BENCH.seat - PLANK_T, 0.24, 0.07], uv: uv() });
    }
    block(T, { c: [xb, 0.16, 0], u: [0, 0, 1], v: [0, 1, 0], s: [1.26, 0.07, 0.05], uv: uv() });
  }
}

function floor(M, rand) {
  const n = Math.round((2 * FLOOR.z) / FLOOR.pitch);
  const pitch = (2 * FLOOR.z) / n;
  for (let i = 0; i < n; i++) {
    const z = -FLOOR.z + pitch * (i + 0.5);
    const L = 2 * FLOOR.x + (rand() - 0.5) * 0.06;
    const top = FLOOR.top - rand() * 0.006;
    plank(M.timber, { c: [(rand() - 0.5) * 0.04, top - PLANK_T / 2, z], u: [1, 0, 0], len: L, width: pitch - 0.018 - rand() * 0.01, uv: [rand() * 9, rand() * 9] });
    for (const x of [-1.0, 1.0]) nail(M.iron, [x + (rand() - 0.5) * 0.03, top, z + ((i % 2) - 0.5) * 0.06]);
  }
}

// ---------------------------------------------------------------- assembly
async function build() {
  const mats = makeMaterials();
  const root = createRoot('Shelter');
  const M = { timber: makeMesh(), thatch: makeMesh(), under: makeMesh(), iron: makeMesh() };
  const rand = makeRandom(7);
  thatchRoof(M, rand);
  roofFrame(M, rand);
  posts(M, rand);
  furniture(M, rand);
  floor(M, rand);
  const counts = {};
  for (const [k, mesh] of Object.entries(M)) {
    const part = createPart(k, mesh.geometry(), mats[k], { parent: root });
    part.name = k;
    markOpenShell(part, k === 'thatch' || k === 'under'
      ? 'Thatch courses are overlapping open sheets closed by the underside and the ridge roll.'
      : k === 'iron' ? 'Bolt and nail heads are capped prisms whose open bases sit in the timber.'
        : 'Closed timber pieces that touch or interpenetrate at joints; post feet sit below the sand.');
    counts[k] = mesh.triangles();
  }
  root.userData = { shelter: true, eaveUnderside: YE, ridgeUnderside: YR, tableTop: TABLE.top, floorTop: FLOOR.top, counts };
  return root;
}
