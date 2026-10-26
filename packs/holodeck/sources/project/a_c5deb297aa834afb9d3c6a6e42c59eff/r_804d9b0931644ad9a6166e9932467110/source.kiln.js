// ---------------------------------------------------------------- plant-lavender
// Lavender clump for the courtyard plaza planting.
// Asset frame: metres, +X forward, +Y up, centred at the origin, ground at Y=0.
// About 0.6 m tall and 0.8 m wide: a mound of grey-green leaf tufts with a fountain of
// thin flower stems carrying purple spikes. One alpha-cut material (atlas) and ONE swaying
// primitive, leaves_0 (tufts + flower stems), with TEXCOORD_0.y = 0 at ground/crown attachment and 1 at the tip.
const meta = { name: 'plant-lavender', role: 'prop' };

const P = {
  seed: 29,
  tufts: 100,
  stems: 170,
  radius: 0.26,
};

function makeAtlas() {
  // 512x256: u 0..0.5 = foliage tuft, u 0.5..1 = four 64-px flower-stem variants.
  // Row 0 = uv.y 0 = attachment at the base.
  const rnd = makeRandom(17);
  const ops = [];
  const leafC = [124, 138, 108];
  for (let i = 0; i < 24; i++) {
    const a = rad(90 + (rnd() - 0.5) * 120);
    const L = lerp(150, 245, rnd()) * (1 - 0.35 * Math.abs(Math.cos(a)));
    const x0 = 128 + (rnd() - 0.5) * 30;
    const col = shadeRGB(mixRGB(leafC, [150, 164, 132], rnd()), lerp(0.8, 1.1, rnd()));
    ops.push(lineOp([x0, 2], [clamp(x0 + Math.cos(a) * L, 6, 250), clamp(2 + Math.sin(a) * L, 4, 252)], lerp(4, 6, rnd()), col));
  }
  const purple = [[118, 88, 168], [96, 68, 146], [140, 112, 190], [108, 80, 160]];
  for (let v = 0; v < 4; v++) {
    const cx = 256 + v * 64 + 32;
    const stemTop = 196 + v * 5;
    ops.push(lineOp([cx, 0], [cx + (v % 2 ? 2 : -2), stemTop], 3, [118, 132, 92, 255]));
    // spike: stacked whorls, slightly gappy at the bottom, tapering to the tip
    const n = 8;
    const y0 = stemTop - 6;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const y = y0 + t * (250 - y0);
      const w = lerp(14, 7, t) * (0.9 + 0.2 * rnd());
      const h = lerp(8, 11, t);
      const c = purple[(v + k) % 4];
      ops.push(ellipseOp(cx + (rnd() - 0.5) * 3, y, w * 0.5 + 2, h * 0.5 + (k === 0 ? 0 : 3), [...shadeRGB(c, lerp(0.85, 1.1, rnd())).slice(0, 3), 255]));
    }
  }
  return proceduralTexture({ schemaVersion: 3, width: 512, height: 256, usage: 'albedo', name: 'LavenderAtlas', background: [118, 128, 100, 1], operations: ops });
}

function buildLavender(root) {
  const rnd = makeRandom(P.seed);
  const mat = pbrMaterial({ albedo: makeAtlas(), roughness: 0.8, metalness: 0, alphaMode: 'mask', alphaCutoff: 0.45, doubleSided: true });
  mat.name = 'LavenderAtlas';
  // One swaying primitive for the whole clump: tufts and flower stems share the atlas.
  const tufts = meshBuilder();
  const stemsA = tufts;
  const stemsB = tufts;

  // Foliage tufts: a low dome of crossed cards from a common crown.
  let placedTufts = 0;
  for (let i = 0; i < P.tufts * 4 && placedTufts < P.tufts; i++) {
    const rr = Math.sqrt(rnd()) * P.radius * 0.7;
    const th = rnd() * Math.PI * 2;
    const out = [Math.cos(th), 0, Math.sin(th)];
    const base = [out[0] * rr, 0.03, out[2] * rr];
    const lean = 0.12 + (rr / (P.radius * 0.7)) * 0.55;
    const dir = V.norm(V.add(UP, V.mul(out, lean)));
    const len = lerp(0.24, 0.34, rnd()) * (1 - 0.25 * (rr / P.radius));
    const side = rotateAbout(V.norm([-out[2], 0, out[0]]), dir, (rnd() - 0.5) * 1.2);
    // keep the tuft card's drooping tip and lower corner above the ground plane
    const sideDrop = Math.abs(side[1]) * len * 0.5;
    if (base[1] + dir[1] * len - 0.12 * len - sideDrop < 0.01 || base[1] - sideDrop < 0) continue;
    emitCard(tufts, {
      base, dir, side, len, width: len * 0.95, u0: 0.01, u1: 0.49, rows: 2,
      droop: 0.12, facing: V.norm(V.add(out, [0, 0.5, 0])), shadeN: V.norm(V.add(out, [0, 0.9, 0])), shadeMix: 0.5,
    });
    placedTufts++;
  }

  // Flower stems: thin crossed cards fanning out from the crown.
  for (let i = 0; i < P.stems; i++) {
    const rr = Math.sqrt(rnd()) * P.radius * 0.55;
    const th = rnd() * Math.PI * 2;
    const out = [Math.cos(th), 0, Math.sin(th)];
    const base = [out[0] * rr, 0.06, out[2] * rr];
    const spread = rad(4 + (rr / (P.radius * 0.55)) * 24 + rnd() * 6);
    const dir = V.norm(V.add(V.mul(UP, Math.cos(spread)), V.mul(out, Math.sin(spread))));
    const len = lerp(0.44, 0.56, rnd()) * (1 - 0.15 * (rr / P.radius));
    const v = Math.floor(rnd() * 4);
    const u0 = 0.5 + v * 0.125 + 0.005;
    const u1 = u0 + 0.115;
    const mb = out[0] >= 0 ? stemsA : stemsB;
    const spin = rnd() * Math.PI;
    for (let k = 0; k < 2; k++) {
      const side = rotateAbout(perpendicular(dir), dir, spin + (k * Math.PI) / 2);
      emitCard(mb, {
        base, dir, side, len, width: len * 0.25 * 0.92, u0, u1, rows: 3, droop: 0.06 + 0.06 * rnd(),
        shadeN: V.norm(V.add(out, [0, 1.2, 0])), shadeMix: 0.5,
      });
    }
  }

  const names = ['leaves_0'];
  const part = createPart('leaves_0', tufts.geometry(), mat, { parent: root });
  part.name = 'leaves_0';
  markOpenShell(part, 'Single-sheet alpha-cut lavender leaf tuft and flower-stem cards.');
  root.userData = { windNodes: names, windWeight: 'TEXCOORD_0.y: 0 at the crown attachment, 1 at the tip' };
}

function build() {
  const root = createRoot('PlantLavender');
  buildLavender(root);
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
