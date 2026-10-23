// ---------------------------------------------------------------- tree-cypress
// Italian cypress (Cupressus sempervirens 'Stricta') for the courtyard plaza.
// Asset frame: metres, +X forward, +Y up, trunk centred at the origin, ground at Y=0.
// Narrow columnar flame ~6.6 m tall, ~1.3 m wide, short visible trunk at the base.
// A dense, static CrownCore carries the dark mass; layered spray cards over it sway in
// leaves_0 and leaves_1 (one primitive each), TEXCOORD_0.y = 0 at the spray's base inside
// the crown, 1 at its tip. leaves_0 = inner/lower sprays, leaves_1 = outer/upper sprays.
const meta = { name: 'tree-cypress', role: 'prop' };

const P = {
  seed: 19,
  height: 6.6,
  crownBase: 0.5,
  rMax: 0.56,
  sprays: 2600,
  leafGroups: 2,
};

/** Crown radius at height y: widest about a third up, tapering to a flame tip. */
function crownR(y) {
  const h = clamp((y - P.crownBase) / (P.height - P.crownBase), 0, 1);
  return P.rMax * (0.55 + 0.45 * smoothstep(0, 0.16, h)) * Math.pow(Math.max(0, 1 - Math.pow(h, 2.1)), 0.9);
}

function makeSprayTexture() {
  // Two 256x256 spray variants. Row 0 = uv.y 0 = the spray's base inside the crown.
  const rnd = makeRandom(5);
  const ops = [];
  const base = hexRGB(0x3f5a2c);
  for (let variant = 0; variant < 2; variant++) {
    const ox = variant * 256 + 128;
    const axis = (t) => [ox + (variant ? 10 : -10) * Math.sin(t * 2.6), 4 + t * 244];
    const dark = shadeRGB(base, 0.62);
    ops.push(lineOp(axis(0), axis(0.5), 9, shadeRGB(base, 0.55)));
    ops.push(lineOp(axis(0.5), axis(0.97), 8, shadeRGB(base, 0.7)));
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = 0.14 + (i / (n - 1)) * 0.78;
      const a0 = axis(t);
      const s = i % 2 ? 1 : -1;
      const reach = lerp(96, 46, t) * (0.85 + 0.3 * rnd());
      const ang = rad(90 - s * (34 + rnd() * 16));
      const tip = [a0[0] + Math.cos(ang) * reach, a0[1] + Math.sin(ang) * reach];
      const col = shadeRGB(base, lerp(0.78, 1.18, rnd()));
      ops.push(lineOp(a0, tip, lerp(15, 10, t), col));
      // two sub-sprays forking toward the tip
      const mid = V.lerp([...a0, 0], [...tip, 0], 0.5);
      const ang2 = ang + s * rad(-30);
      ops.push(lineOp([mid[0], mid[1]], [mid[0] + Math.cos(ang2) * reach * 0.45, mid[1] + Math.sin(ang2) * reach * 0.45], 10, shadeRGB(col, 1.12)));
      ops.push(lineOp([tip[0] - Math.cos(ang) * 8, tip[1] - Math.sin(ang) * 8], [tip[0] + Math.cos(ang + 0.5) * 10, tip[1] + Math.sin(ang + 0.5) * 12], 6, shadeRGB(col, 1.3)));
    }
    ops.push(lineOp(axis(0.8), axis(1.0), 12, shadeRGB(base, 1.15)));
    ops.push(lineOp(axis(0.3), axis(0.7), 4, dark, 160));
  }
  return proceduralTexture({ schemaVersion: 3, width: 512, height: 256, usage: 'albedo', name: 'CypressSprays', background: [52, 74, 38, 1], operations: ops });
}

function makeCoreTexture() {
  return proceduralTexture({
    schemaVersion: 2, size: 128, usage: 'albedo', name: 'CypressCore',
    layers: [
      { op: 'solid', color: 0x30462a },
      { op: 'noise', colorA: 0x1e2c18, colorB: 0x4f6a38, scale: 14, octaves: 4, seed: 12, blend: 'normal', opacity: 0.85 },
      { op: 'noise', colorA: 0x26361e, colorB: 0x5a7440, scale: 40, octaves: 2, seed: 4, blend: 'overlay', opacity: 0.5 },
    ],
  });
}

function makeBarkTexture() {
  return proceduralTexture({
    schemaVersion: 2, size: 128, usage: 'albedo', name: 'CypressBark',
    layers: [
      { op: 'solid', color: 0x6e5f50 },
      { op: 'stripes', colorA: 0x4f4338, colorB: 0x8c7c6a, count: 14, angleDeg: 0, blend: 'overlay', opacity: 0.7 },
      { op: 'noise', colorA: 0x55493e, colorB: 0x8d806f, scale: 10, octaves: 3, seed: 2, blend: 'overlay', opacity: 0.6 },
    ],
  });
}

function buildCypress(root) {
  const rnd = makeRandom(P.seed);
  const bark = pbrMaterial({ albedo: makeBarkTexture(), roughness: 0.9, metalness: 0 });
  bark.name = 'CypressBark';
  const coreMat = pbrMaterial({ albedo: makeCoreTexture(), roughness: 0.85, metalness: 0 });
  coreMat.name = 'CypressCore';
  const spray = pbrMaterial({ albedo: makeSprayTexture(), roughness: 0.78, metalness: 0, alphaMode: 'mask', alphaCutoff: 0.45, doubleSided: true });
  spray.name = 'CypressSpray';

  // Trunk: short visible flared base continuing as a hidden leader inside the crown.
  const trunkMb = meshBuilder();
  const tPts = catmullRomPath([[0, -0.2, 0], [0, 0.3, 0], [0.01, 1.0, 0], [0.0, 2.2, 0.01]], 4);
  const tR = tPts.map((p) => 0.1 + 0.07 * Math.exp(-Math.max(0, p[1]) / 0.18) - 0.035 * clamp(p[1] / 2.2, 0, 1));
  emitTube(trunkMb, tPts, tR, { radial: 12, vScale: 0.6, capEnd: true, rmul: (s, th) => 1 + 0.06 * Math.sin(6 * th + s * 3) });
  // A few stubby ascending limbs visible where the crown starts.
  for (let i = 0; i < 5; i++) {
    const az = i * 2.4 + 0.3;
    const y0 = 0.45 + i * 0.09;
    const d = V.norm([Math.cos(az) * 0.5, 1, Math.sin(az) * 0.5]);
    const a = [Math.cos(az) * 0.03, y0, Math.sin(az) * 0.03];
    emitTube(trunkMb, [a, V.add(a, V.mul(d, 0.25)), V.add(a, V.mul(d, 0.5))], [0.035, 0.026, 0.016], { radial: 5, vScale: 0.4 });
  }

  // Crown core: lumpy surface of revolution at ~80% of the crown radius.
  const coreMb = meshBuilder();
  const rows = 30;
  const radial = 18;
  const y0 = P.crownBase + 0.08;
  const y1 = P.height - 0.18;
  const lump = (y, th) => 1 + 0.1 * Math.sin(5 * th + 2.3 * y) * Math.sin(3.1 * y + 1.7 * th) + 0.05 * Math.sin(11 * th - 4.7 * y);
  for (let i = 0; i <= rows; i++) {
    const y = lerp(y0, y1, i / rows);
    const r = Math.max(0.02, crownR(y) * 0.8);
    const dr = (crownR(y + 0.05) - crownR(y - 0.05)) / 0.1;
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const rr = r * lump(y, th);
      const n = V.norm([Math.cos(th), -dr * 0.8, Math.sin(th)]);
      coreMb.vert([Math.cos(th) * rr, y, Math.sin(th) * rr], n, (k / radial) * 3, y / 1.1);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k;
      const c = a + radial + 1;
      coreMb.tri(a, c, a + 1);
      coreMb.tri(a + 1, c, c + 1);
    }
  }
  // close the bottom and tip
  const bot = coreMb.vert([0, y0 - 0.12, 0], [0, -1, 0], 0.5, 0);
  for (let k = 0; k < radial; k++) coreMb.tri(k, k + 1, bot);
  const top = coreMb.vert([0, y1 + 0.12, 0], [0, 1, 0], 0.5, 1);
  const last = rows * (radial + 1);
  for (let k = 0; k < radial; k++) coreMb.tri(last + k + 1, last + k, top);

  // Sprays: steeply ascending cards whose bases sit inside the core.
  const groups = Array.from({ length: P.leafGroups }, () => meshBuilder());
  for (let i = 0; i < P.sprays; i++) {
    // Area-weighted height sampling: more sprays where the crown is wider.
    let y;
    for (;;) {
      y = lerp(P.crownBase + 0.05, P.height - 0.1, rnd());
      if (rnd() < crownR(y) / P.rMax + 0.08) break;
    }
    const th = rnd() * Math.PI * 2;
    const rC = crownR(y);
    const out = [Math.cos(th), 0, Math.sin(th)];
    const baseR = rC * lerp(0.55, 0.85, rnd());
    const base = [out[0] * baseR, y, out[2] * baseR];
    const hN = (y - P.crownBase) / (P.height - P.crownBase);
    const outw = lerp(0.42, 0.22, hN) + (rnd() - 0.5) * 0.2;
    const dir = V.norm(V.add(V.add(V.mul(UP, 1), V.mul(out, outw)), [(rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25]));
    const len = lerp(0.36, 0.52, rnd()) * (hN > 0.85 ? 0.75 : 1);
    const tangent = [-out[2], 0, out[0]];
    const side = V.norm(V.add(V.mul(tangent, Math.cos(rnd() * 0.9 - 0.45)), V.mul(out, Math.sin(rnd() * 0.9 - 0.45))));
    const variant = rnd() < 0.5 ? 0 : 1;
    const shadeN = V.norm([out[0], 0.35 + hN * 0.4, out[2]]);
    // leaves_0 = inner/lower sprays, leaves_1 = outer/upper sprays.
    const outer = hN * 0.7 + (baseR / Math.max(1e-3, rC)) * 0.6 > 0.75 ? 1 : 0;
    emitCard(groups[outer], {
      base, dir, side, len, width: len * 0.58, u0: variant * 0.5 + 0.08, u1: variant * 0.5 + 0.42,
      rows: 2, curl: 0.06, facing: out, shadeN, shadeMix: 0.6,
    });
  }

  const trunk = createPart('Trunk', trunkMb.geometry(), bark, { parent: root });
  trunk.name = 'Trunk';
  markOpenShell(trunk, 'Trunk tube with buried root flare and open limb stubs inside the crown.');
  const core = createPart('CrownCore', coreMb.geometry(), coreMat, { parent: root });
  core.name = 'CrownCore';
  const names = [];
  groups.forEach((mb, g) => {
    const name = 'leaves_' + g;
    const part = createPart(name, mb.geometry(), spray, { parent: root });
    part.name = name;
    markOpenShell(part, 'Single-sheet alpha-cut cypress spray cards; double-sided foliage.');
    names.push(name);
  });
  root.userData = { windNodes: names, windWeight: 'TEXCOORD_0.y: 0 at spray base inside the crown, 1 at spray tip' };
}

function build() {
  const root = createRoot('TreeCypress');
  buildCypress(root);
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

/** Unit vector, roughly uniform on the sphere. */
function randomUnit(rnd) {
  const z = rnd() * 2 - 1;
  const a = rnd() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), z, s * Math.sin(a)];
}

/**
 * A clump of small leaf cards around a twig point: bases packed toward the clump
 * centre, cards radiating with varied orientation, fronts toward the canopy outside.
 * o: { nMin, nMax, clumpR, len:[a,b], aspect, variants:[[u0,u1],...], outward, up, shadeMix }
 */
function emitClump(mb, cl, nrmOut, o, rnd) {
  const n = Math.max(3, Math.round(lerp(o.nMin, o.nMax, rnd()) * cl.size));
  for (let i = 0; i < n; i++) {
    const u = randomUnit(rnd);
    const r = o.clumpR * cl.size * Math.pow(rnd(), 1.6);
    const base = V.add(cl.p, V.mul(u, r));
    const dir = V.norm(V.add(V.add(V.add(V.mul(randomUnit(rnd), 0.8), V.mul(u, 0.55)), V.mul(nrmOut, o.outward)), V.mul(UP, o.up)));
    const len = lerp(o.len[0], o.len[1], rnd());
    const side = rotateAbout(perpendicular(dir), dir, rnd() * Math.PI);
    const [u0, u1] = o.variants[Math.floor(rnd() * o.variants.length)];
    const shadeN = V.norm(V.add(V.mul(nrmOut, 0.75), V.mul(u, 0.35)));
    emitCard(mb, {
      base: V.sub(base, V.mul(dir, len * 0.06)), dir, side, len, width: len * o.aspect, u0, u1,
      rows: 1, facing: nrmOut, shadeN, shadeMix: o.shadeMix,
    });
  }
  return n;
}
