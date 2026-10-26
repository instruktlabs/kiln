// ---------------------------------------------------------------- shrub-box
// Clipped boxwood ball / mound for the courtyard plaza planting.
// Asset frame: metres, +X forward, +Y up, centred at the origin, ground at Y=0.
// About 0.9 m tall and 1.1 m wide. A solid, static LeafMass gives the clipped shape;
// small sprig cards over it break the silhouette and sway gently as one node, leaves_0
// (one primitive), TEXCOORD_0.y = 0 where a sprig leaves the mass, 1 at its tip.
const meta = { name: 'shrub-box', role: 'prop' };

const P = {
  seed: 3,
  rx: 0.46,
  ry: 0.38,
  cy: 0.385,
  sprigs: 1000,
};

const lumpS = (th, ph) => 1 + 0.035 * Math.sin(5 * th + 3 * ph) * Math.sin(4 * ph - 2 * th) + 0.02 * Math.sin(11 * th + 7 * ph);
/** Point on the clipped mass for azimuth th and polar angle ph (0 = top), flattened at the ground. */
function massPoint(th, ph, scale = 1) {
  const l = lumpS(th, ph) * scale;
  const y = Math.max(0.015, P.cy + Math.cos(ph) * P.ry * l);
  const sp = Math.sin(ph) * l;
  // slightly squarer shoulders read as clipped
  const sq = 1 + 0.06 * Math.pow(Math.sin(2 * ph), 2);
  return [Math.cos(th) * sp * P.rx * sq, y, Math.sin(th) * sp * P.rx * sq];
}

function makeMassTexture() {
  // Dense small leaves, tiling, fully opaque.
  return proceduralTexture({
    schemaVersion: 3, width: 128, height: 128, usage: 'albedo', name: 'BoxLeafMass',
    background: [44, 66, 32, 255],
    operations: [
      { op: 'legacy-v2', spec: { schemaVersion: 2, size: 128, usage: 'albedo', layers: [
        { op: 'solid', color: 0x2c4220 },
        { op: 'noise', colorA: 0x1d2c15, colorB: 0x48663a, scale: 18, octaves: 3, seed: 6, blend: 'normal', opacity: 0.9 },
      ] } },
      { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 7, height: 5 }, rgba: [72, 102, 50, 255], count: 14, seed: 3, area: { x: 0, y: 0, width: 128, height: 128 }, periodic: true },
      { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 5, height: 7 }, rgba: [92, 124, 60, 255], count: 12, seed: 9, area: { x: 0, y: 0, width: 128, height: 128 }, periodic: true },
    ],
  });
}

function makeSprigTexture() {
  // Two 128x128 sprig variants; row 0 = uv.y 0 = where the sprig leaves the mass.
  const rnd = makeRandom(13);
  const ops = [];
  for (let variant = 0; variant < 2; variant++) {
    const ox = variant * 128 + 64;
    ops.push(lineOp([ox, 0], [ox + (variant ? 6 : -6), 112], 3, [86, 84, 52, 255]));
    const n = 13;
    for (let i = 0; i < n; i++) {
      const t = 0.14 + (i / (n - 1)) * 0.8;
      const a = [ox + (variant ? 6 : -6) * t, t * 112];
      const s = i % 2 ? 1 : -1;
      const ang = i === n - 1 ? rad(90) : rad(90 - s * (40 + rnd() * 25));
      const L = lerp(22, 14, t);
      const young = t > 0.7 && rnd() < 0.6;
      const col = young ? [112, 146, 62, 255] : shadeRGB([62, 92, 42], lerp(0.85, 1.25, rnd()));
      ops.push(lineOp([a[0] + Math.cos(ang) * 3, a[1] + Math.sin(ang) * 3], [a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L], 10, col));
    }
  }
  return proceduralTexture({ schemaVersion: 3, width: 256, height: 128, usage: 'albedo', name: 'BoxSprigs', background: [52, 78, 38, 1], operations: ops });
}

function buildShrub(root) {
  const rnd = makeRandom(P.seed);
  const massMat = pbrMaterial({ albedo: makeMassTexture(), roughness: 0.7, metalness: 0 });
  massMat.name = 'BoxLeafMass';
  const sprigMat = pbrMaterial({ albedo: makeSprigTexture(), roughness: 0.78, metalness: 0, alphaMode: 'mask', alphaCutoff: 0.45, doubleSided: true });
  sprigMat.name = 'BoxSprig';

  // Mass: lat-long grid over the flattened lumpy ellipsoid.
  const mass = meshBuilder();
  const nTh = 28;
  const nPh = 16;
  for (let j = 0; j <= nPh; j++) {
    const ph = (j / nPh) * Math.PI;
    for (let k = 0; k <= nTh; k++) {
      const th = (k / nTh) * Math.PI * 2;
      const p = massPoint(th, ph);
      const pa = massPoint(th + 0.01, ph);
      const pb = massPoint(th, ph + 0.01);
      let n = V.norm(V.cross(V.sub(pa, p), V.sub(pb, p)));
      if (j === 0) n = [0, 1, 0];
      if (p[1] <= 0.016) n = [0, -1, 0];
      mass.vert(p, n, (k / nTh) * 4, (j / nPh) * 3);
    }
  }
  for (let j = 0; j < nPh; j++) {
    for (let k = 0; k < nTh; k++) {
      const a = j * (nTh + 1) + k;
      const c = a + nTh + 1;
      mass.tri(a, a + 1, c);
      mass.tri(a + 1, c + 1, c);
    }
  }

  // Sprigs: short cards lying close along the clipped surface.
  const sprigs = meshBuilder();
  for (let i = 0; i < P.sprigs; i++) {
    // uniform over the sphere, skip the flattened underside
    const ph = Math.acos(1 - 2 * rnd()) * 0.92;
    const th = rnd() * Math.PI * 2;
    const p = massPoint(th, ph, 0.94);
    if (p[1] < 0.06) continue;
    const pOut = massPoint(th, ph, 1.04);
    const out = V.norm(V.sub(pOut, massPoint(th, ph, 0.9)));
    const tang = rotateAbout(perpendicular(out), out, rnd() * Math.PI * 2);
    const dir = V.norm(V.add(V.mul(out, 0.55 + 0.25 * rnd()), V.mul(tang, 0.8)));
    const len = lerp(0.12, 0.17, rnd());
    const v = rnd() < 0.5 ? 0 : 1;
    const sd = Math.abs(V.norm(V.cross(dir, out))[1]) * len * 0.45;
    if (Math.min(p[1], p[1] + dir[1] * len) - sd < 0.005) continue; // keep sprigs above the ground plane
    emitCard(sprigs, {
      base: p, dir, side: V.cross(dir, out), len, width: len * 0.9,
      u0: v * 0.5 + 0.03, u1: v * 0.5 + 0.47, rows: 1, facing: out, shadeN: out, shadeMix: 0.7,
    });
  }

  const massPart = createPart('LeafMass', mass.geometry(), massMat, { parent: root });
  massPart.name = 'LeafMass';
  markOpenShell(massPart, 'Closed lat-long leaf mass; pole rows collapse to points, so it is not measured as a solid.');
  const leaves = createPart('leaves_0', sprigs.geometry(), sprigMat, { parent: root });
  leaves.name = 'leaves_0';
  markOpenShell(leaves, 'Single-sheet alpha-cut boxwood sprig cards; double-sided foliage.');
  root.userData = { windNodes: ['leaves_0'], windWeight: 'TEXCOORD_0.y: 0 where a sprig leaves the mass, 1 at its tip' };
}

function build() {
  const root = createRoot('ShrubBox');
  buildShrub(root);
  return root;
}
// ---------------------------------------------------------------- shared helpers (trees family)
// Foliage wind contract: each swaying node is ONE mesh with ONE primitive, lit material,
// TEXCOORD_0.y = 0 where a leaf card meets its branch and 1 at its tip.

const UP = [0, 1, 0];
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

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
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
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

/** Any unit vector perpendicular to d. */
function perpendicular(d) {
  const a = Math.abs(d[1]) < 0.9 ? UP : [1, 0, 0];
  return V.norm(V.cross(d, a));
}

/** Rotate v about unit axis k by angle (radians). */
function rotateAbout(v, k, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const kv = V.cross(k, v);
  const kd = V.dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** A direction at polar angle `tilt` from `d`, rotated `spin` about it. */
function deviate(d, tilt, spin) {
  const p = rotateAbout(perpendicular(d), d, spin);
  return V.norm(V.add(V.mul(d, Math.cos(tilt)), V.mul(p, Math.sin(tilt))));
}

function meshBuilder() {
  return {
    p: [],
    n: [],
    uv: [],
    idx: [],
    vert(pos, nor, u, v) {
      this.p.push(pos[0], pos[1], pos[2]);
      this.n.push(nor[0], nor[1], nor[2]);
      this.uv.push(u, v);
      return this.p.length / 3 - 1;
    },
    tri(a, b, c) {
      this.idx.push(a, b, c);
    },
    get triangles() {
      return this.idx.length / 3;
    },
    geometry() {
      return meshGeo({ positions: this.p, indices: this.idx, normals: this.n, uvs: this.uv });
    },
  };
}

/**
 * Tube along a polyline with one radius per station, parallel-transport frames.
 * opts: radial, vScale (metres per texture tile along length), uScale (tiles around),
 * rmul(s, theta, i) radius multiplier, v0 starting v, capEnd.
 */
function emitTube(mb, pts, radii, opts = {}) {
  const radial = opts.radial || 8;
  const vScale = opts.vScale || 1;
  const uScale = opts.uScale || 1;
  const n = pts.length;
  const T = pts.map((_, i) => V.norm(V.sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N = opts.normal0 ? V.norm(opts.normal0) : perpendicular(T[0]);
  const first = mb.p.length / 3;
  let s = opts.v0 || 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += V.len(V.sub(pts[i], pts[i - 1]));
    const t = T[i];
    N = V.norm(V.sub(N, V.mul(t, V.dot(N, t))));
    const B = V.cross(t, N);
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const dir = V.add(V.mul(N, Math.cos(th)), V.mul(B, Math.sin(th)));
      const r = radii[i] * (opts.rmul ? opts.rmul(s, th, i) : 1);
      mb.vert(V.add(pts[i], V.mul(dir, r)), dir, (k / radial) * uScale, s / vScale);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = first + i * (radial + 1) + k;
      const c = a + radial + 1;
      mb.tri(a, a + 1, c);
      mb.tri(a + 1, c + 1, c);
    }
  }
  if (opts.capEnd) {
    const tip = mb.vert(V.add(pts[n - 1], V.mul(T[n - 1], radii[n - 1] * 0.6)), T[n - 1], 0.5, s / vScale);
    const last = first + (n - 1) * (radial + 1);
    for (let k = 0; k < radial; k++) mb.tri(last + k, last + k + 1, tip);
  }
  return { length: s, endTangent: T[n - 1] };
}

/** Points along a polyline at fractions; returns {p, t} by arc length. */
function sampleAlong(pts, f) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.len(V.sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1];
  const s = f * total;
  let j = 0;
  while (j < pts.length - 2 && cum[j + 1] < s) j++;
  const t = clamp((s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]), 0, 1);
  return { p: V.lerp(pts[j], pts[j + 1], t), t: V.norm(V.sub(pts[j + 1], pts[j])), total };
}

/**
 * Leaf card: a bent quad strip from `base` along `dir`, `rows` segments.
 * UV: u across [u0,u1], v = 0 at the base (attachment) to 1 at the tip.
 * The card front faces `facing` (winding chosen so); vertex normals blend the card
 * normal toward `shadeN` (outward canopy normal) by `shadeMix`.
 */
function emitCard(mb, c) {
  const rows = c.rows || 2;
  const dir = V.norm(c.dir);
  let side = V.norm(V.sub(c.side, V.mul(dir, V.dot(c.side, dir))));
  let nrm = V.cross(side, dir);
  if (c.facing && V.dot(nrm, c.facing) < 0) {
    side = V.mul(side, -1);
    nrm = V.mul(nrm, -1);
  }
  const shadeN = c.shadeN ? V.norm(V.add(V.mul(c.shadeN, c.shadeMix ?? 0.6), V.mul(nrm, 1 - (c.shadeMix ?? 0.6)))) : nrm;
  const droop = c.droop || 0;
  const curl = c.curl || 0;
  const first = mb.p.length / 3;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const centre = V.add(V.add(c.base, V.mul(dir, c.len * t)), V.add(V.mul(UP, -droop * c.len * t * t), V.mul(nrm, curl * c.len * t * t)));
    const w = c.width * (c.taper ? lerp(1, c.taper, t) : 1);
    for (let k = 0; k <= 1; k++) {
      const sgn = k === 0 ? -1 : 1;
      // UV x: k=0 -> u0 (left of the image), k=1 -> u1.
      mb.vert(V.add(centre, V.mul(side, sgn * w * 0.5)), shadeN, k === 0 ? c.u0 : c.u1, t);
    }
  }
  for (let r = 0; r < rows; r++) {
    const a = first + r * 2;
    // Front (counterclockwise seen from +nrm): side x dir = nrm, so (a, a+1, a+2) with
    // a at -side, a+1 at +side, a+2 further along dir.
    mb.tri(a, a + 1, a + 3);
    mb.tri(a, a + 3, a + 2);
  }
}

/** Pixel helpers for proceduralTexture V3 (integer pixel edges). */
const PX = (x) => Math.round(x);
function polyOp(points, rgba, opacity) {
  const op = { op: 'paint', shape: { kind: 'polygon', points: points.map(([x, y]) => [PX(x), PX(y)]) }, rgba };
  if (opacity !== undefined) op.opacity = opacity;
  return op;
}
function lineOp(from, to, width, rgba, opacity) {
  const op = { op: 'paint', shape: { kind: 'line', from: [PX(from[0]), PX(from[1])], to: [PX(to[0]), PX(to[1])], width: Math.max(1, PX(width)) }, rgba };
  if (opacity !== undefined) op.opacity = opacity;
  return op;
}
function ellipseOp(cx, cy, rx, ry, rgba, opacity) {
  const op = { op: 'paint', shape: { kind: 'ellipse', x: PX(cx - rx), y: PX(cy - ry), width: Math.max(1, PX(2 * rx)), height: Math.max(1, PX(2 * ry)) }, rgba };
  if (opacity !== undefined) op.opacity = opacity;
  return op;
}
const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const shadeRGB = (c, f, a = 255) => [clamp(Math.round(c[0] * f), 0, 255), clamp(Math.round(c[1] * f), 0, 255), clamp(Math.round(c[2] * f), 0, 255), a];
const mixRGB = (a, b, t, alpha = 255) => [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t)), alpha];
