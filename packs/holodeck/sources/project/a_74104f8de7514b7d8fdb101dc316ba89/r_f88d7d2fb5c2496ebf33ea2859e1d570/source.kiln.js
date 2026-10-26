// ---------------------------------------------------------------- tree-olive
// Old olive tree (Olea europaea) for the courtyard plaza.
// Asset frame: metres, +X forward, +Y up, bole centred at the origin, ground at Y=0.
// Gnarled bole splitting into twisting stems, open silvery canopy ~4 m across, ~4.3 m tall.
// Leaves: alpha-cut spray cards in leaves_0..leaves_7 (one primitive each);
// TEXCOORD_0.y = 0 at each card's twig attachment, 1 at its tip.
const meta = { name: 'tree-olive', role: 'prop' };

const P = {
  seed: 23,
  canopyC: [0, 3.0, 0],
  canopyR: [1.88, 1.25, 1.88],
  stems: 3,
  secondaries: 34,
  leafGroups: 2,
  cardLen: [0.15, 0.3],
  clumpCards: [14, 21],
  clumpR: 0.16,
};

function ellipsoidExit(S, d, C, R) {
  const o = [(S[0] - C[0]) / R[0], (S[1] - C[1]) / R[1], (S[2] - C[2]) / R[2]];
  const k = [d[0] / R[0], d[1] / R[1], d[2] / R[2]];
  const a = V.dot(k, k);
  const b = 2 * V.dot(o, k);
  const c = V.dot(o, o) - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 0;
  return Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
}
function canopyNormal(p) {
  const C = P.canopyC;
  const R = P.canopyR;
  return V.norm([(p[0] - C[0]) / (R[0] * R[0]), (p[1] - C[1]) / (R[1] * R[1]), (p[2] - C[2]) / (R[2] * R[2])]);
}

function makeLeafTexture() {
  // Three 256x256 spray variants. Row 0 = uv.y 0 = twig attachment.
  const rnd = makeRandom(41);
  const ops = [];
  const top = hexRGB(0x7f8f60);
  const silver = [176, 184, 156];
  for (let variant = 0; variant < 3; variant++) {
    const ox = variant * 256 + 128;
    const sway = [-14, 10, 4][variant];
    const tw = (t) => [ox + sway * Math.sin(t * 2.2), 2 + t * 236];
    ops.push(lineOp(tw(0), tw(0.55), 4, [96, 88, 72, 255]));
    ops.push(lineOp(tw(0.55), tw(0.95), 3, [104, 98, 80, 255]));
    const n = 18;
    for (let i = 0; i < n; i++) {
      const t = 0.1 + (i / (n - 1)) * 0.86;
      const a0 = tw(t);
      const s = i % 2 ? 1 : -1;
      const ang = i === n - 1 ? rad(90) : rad(90 - s * (28 + rnd() * 34));
      const L = lerp(70, 52, t) * (0.8 + 0.35 * rnd());
      const tip = [a0[0] + Math.cos(ang) * L, a0[1] + Math.sin(ang) * L];
      const under = rnd() < 0.38;
      const col = under ? mixRGB(silver, [200, 204, 186], rnd() * 0.5) : shadeRGB(mixRGB(top, [110, 124, 84], rnd() * 0.6), lerp(0.82, 1.12, rnd()));
      ops.push(lineOp([a0[0] + Math.cos(ang) * 4, a0[1] + Math.sin(ang) * 4], tip, lerp(8, 10, rnd()), col));
    }
  }
  return proceduralTexture({ schemaVersion: 3, width: 768, height: 256, usage: 'albedo', name: 'OliveSprays', background: [128, 138, 104, 1], operations: ops });
}

function makeBarkTexture() {
  return proceduralTexture({
    schemaVersion: 2, size: 256, usage: 'albedo', name: 'OliveBark',
    layers: [
      { op: 'solid', color: 0x86847d },
      { op: 'noise', colorA: 0x55544f, colorB: 0xa6a49c, scale: 6, octaves: 5, seed: 9, blend: 'overlay', opacity: 0.9 },
      { op: 'stripes', colorA: 0x55504a, colorB: 0x8f897d, count: 22, angleDeg: 8, blend: 'multiply', opacity: 0.35 },
      { op: 'noise', colorA: 0x6c675d, colorB: 0xa8a294, scale: 30, octaves: 2, seed: 2, blend: 'overlay', opacity: 0.45 },
    ],
  });
}

async function buildOlive(root) {
  const rnd = makeRandom(P.seed);
  const barkNormal = await loadApprovedTexture('kiln.texture.bark-brown-01-normal.v1');
  const bark = pbrMaterial({ albedo: makeBarkTexture(), normal: barkNormal, roughness: 0.92, metalness: 0 });
  bark.name = 'OliveBark';
  const leaf = pbrMaterial({ albedo: makeLeafTexture(), roughness: 0.6, metalness: 0, alphaMode: 'mask', alphaCutoff: 0.45, doubleSided: true });
  leaf.name = 'OliveLeaf';

  const woodMb = meshBuilder();
  const groups = Array.from({ length: P.leafGroups }, () => meshBuilder());
  const C = P.canopyC;
  const R = P.canopyR;
  const clusters = [];
  const addCluster = (p, along, size) => clusters.push({ p, along, size });

  // Bole: a squat, buttressed stump that the stems grow out of.
  const bolePts = catmullRomPath([[0, -0.25, 0], [0, 0.15, 0], [0.03, 0.55, 0.02]], 4);
  const boleR = bolePts.map((p) => 0.26 + 0.13 * Math.exp(-Math.max(0, p[1]) / 0.2) - 0.06 * clamp(p[1] / 0.55, 0, 1));
  emitTube(woodMb, bolePts, boleR, {
    radial: 16, vScale: 0.7, capEnd: true,
    rmul: (s, th) => 1 + 0.16 * Math.pow(Math.max(0, Math.cos(3 * th + 0.4)), 2) + 0.05 * Math.sin(7 * th + s * 4),
  });

  // Stems twist around one another, then lean out into gnarled limbs.
  const stemAz0 = rnd() * Math.PI * 2;
  const limbEnds = [];
  for (let si = 0; si < P.stems; si++) {
    const phi0 = stemAz0 + (si / P.stems) * Math.PI * 2;
    const twist = 1.1 + 0.3 * rnd();
    const ctrl = [];
    const nC = 7;
    const topY = 1.35 + 0.35 * rnd();
    for (let j = 0; j < nC; j++) {
      const t = j / (nC - 1);
      const y = lerp(0.1, topY, t);
      const rho = lerp(0.07, 0.36, Math.pow(t, 1.3));
      const phi = phi0 + twist * t * Math.PI;
      ctrl.push([Math.cos(phi) * rho + (rnd() - 0.5) * 0.06, y, Math.sin(phi) * rho + (rnd() - 0.5) * 0.06]);
    }
    const pts = catmullRomPath(ctrl, 4);
    const radii = pts.map((_, i) => lerp(0.16, 0.1, i / (pts.length - 1)));
    emitTube(woodMb, pts, radii, {
      radial: 12, vScale: 0.7, capEnd: true,
      rmul: (s, th) => 1 + 0.2 * Math.pow(Math.max(0, Math.sin(2 * th + s * 2.5)), 3) + 0.08 * Math.sin(5 * th - s * 6),
    });
    // Each stem divides into two crooked limbs.
    const top = pts[pts.length - 1];
    const outAz = Math.atan2(top[2], top[0]);
    for (let li = 0; li < 2; li++) {
      const az = outAz + (li ? 0.55 : -0.55) + (rnd() - 0.5) * 0.3;
      const tilt = rad(42 + rnd() * 18);
      const d = [Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)];
      const start = V.add(top, [0, -0.12, 0]);
      const len = Math.min(1.7, 0.8 * ellipsoidExit(start, d, C, R));
      const kinks = [start];
      for (let k = 1; k <= 4; k++) {
        const base = V.add(start, V.mul(d, (len * k) / 4));
        kinks.push(V.add(base, [(rnd() - 0.5) * 0.22, (rnd() - 0.3) * 0.12, (rnd() - 0.5) * 0.22]));
      }
      const lp = catmullRomPath(kinks, 3);
      const lr = lp.map((_, i) => lerp(0.085, 0.03, i / (lp.length - 1)));
      emitTube(woodMb, lp, lr, { radial: 9, vScale: 0.5, capEnd: true, rmul: (s, th) => 1 + 0.12 * Math.sin(3 * th + s * 7) });
      limbEnds.push({ pts: lp, end: lp[lp.length - 1] });
      addCluster(lp[lp.length - 1], V.norm(V.add(d, canopyNormal(lp[lp.length - 1]))), 1.1);
    }
  }

  // Secondary branches toward clumped targets over the dome (olive crowns are open and tufted).
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let j = 0; j < P.secondaries; j++) {
    const yN = lerp(1.0, -0.5, (j + 0.5) / P.secondaries);
    const ring = Math.sqrt(1 - yN * yN);
    const th = j * golden + stemAz0;
    const shell = 0.62 + 0.33 * rnd();
    const target = [C[0] + Math.cos(th) * ring * R[0] * shell, C[1] + yN * R[1] * shell, C[2] + Math.sin(th) * ring * R[2] * shell];
    let best = null;
    for (const L of limbEnds) {
      for (let f = 0.15; f <= 0.97; f += 0.07) {
        const at = sampleAlong(L.pts, f);
        const dv = V.sub(target, at.p);
        const dist = V.len(dv);
        if (dist < 0.4) continue;
        const cosA = V.dot(V.mul(dv, 1 / dist), at.t);
        if (cosA < 0.1) continue;
        const score = dist * (1.6 - cosA);
        if (!best || score < best.score) best = { score, at, f, dist };
      }
    }
    if (!best) continue;
    const start = best.at.p;
    const sLen = Math.min(1.6, best.dist);
    const d = V.norm(V.sub(target, start));
    const sEnd = V.add(start, V.mul(d, sLen));
    const sMid = V.add(V.lerp(start, sEnd, 0.5), [(rnd() - 0.5) * 0.15, 0.06, (rnd() - 0.5) * 0.15]);
    const secPts = catmullRomPath([start, sMid, sEnd], 3);
    const secR = secPts.map((_, i) => lerp(0.032, 0.01, i / (secPts.length - 1)));
    emitTube(woodMb, secPts, secR, { radial: 5, vScale: 0.4, capEnd: true });
    const nTw = Math.max(3, Math.round(sLen * 3.2));
    for (let ti = 0; ti < nTw; ti++) {
      const g = 0.3 + (ti / Math.max(1, nTw - 1)) * 0.68;
      const ta = sampleAlong(secPts, g);
      const out2 = canopyNormal(ta.p);
      let td = deviate(ta.t, rad(30 + rnd() * 30), rnd() * Math.PI * 2);
      td = V.norm(V.add(td, V.mul(out2, 0.5)));
      const tLen = Math.min(0.7, 0.9 * ellipsoidExit(ta.p, td, C, R)) * (0.7 + 0.3 * rnd());
      if (tLen < 0.2) {
        addCluster(ta.p, V.norm(V.add(ta.t, out2)), 0.9);
        continue;
      }
      const tEnd = V.add(ta.p, V.mul(td, tLen));
      emitTube(woodMb, [ta.p, V.lerp(ta.p, tEnd, 0.5), tEnd], [0.011, 0.008, 0.005], { radial: 3, vScale: 0.3 });
      for (let ci = 0; ci < 3; ci++) {
        const cp = V.lerp(ta.p, tEnd, 0.35 + ci * 0.32);
        addCluster(cp, V.norm(V.add(td, V.mul(canopyNormal(cp), 0.7))), 1);
      }
    }
    addCluster(sEnd, V.norm(V.add(d, canopyNormal(sEnd))), 1.05);
  }

  // Spray clumps: many small narrow-leaf cards per twig point, uneven clumps with gaps.
  // leaves_0 = inner/lower clumps, leaves_1 = outer/upper clumps (split at the median score).
  const depth = (p) => Math.hypot((p[0] - C[0]) / R[0], (p[1] - C[1]) / R[1], (p[2] - C[2]) / R[2]);
  const score = (p) => depth(p) + 0.35 * (p[1] - C[1]) / R[1];
  const sorted = clusters.map((c) => score(c.p)).sort((a, b) => a - b);
  const split = sorted[Math.floor(sorted.length / 2)];
  const clumpOpts = {
    nMin: P.clumpCards[0], nMax: P.clumpCards[1], clumpR: P.clumpR, len: P.cardLen, aspect: 0.68,
    variants: [[0.03, 0.303], [0.363, 0.636], [0.697, 0.97]], outward: 0.5, up: -0.05, shadeMix: 0.5,
  };
  let cards = 0;
  for (const cl of clusters) {
    if (rnd() < 0.22) continue;
    const c = { p: cl.p, size: cl.size * (0.7 + 0.8 * Math.pow(rnd(), 1.5)) };
    cards += emitClump(groups[score(cl.p) >= split ? 1 : 0], c, canopyNormal(cl.p), clumpOpts, rnd);
  }

  const trunk = createPart('Trunk', woodMb.geometry(), bark, { parent: root });
  trunk.name = 'Trunk';
  markOpenShell(trunk, 'Bole, twisting stems, limbs, branches and twigs in one bark mesh; bole flare buried below ground.');
  const names = [];
  groups.forEach((mb, g) => {
    const name = 'leaves_' + g;
    const part = createPart(name, mb.geometry(), leaf, { parent: root });
    part.name = name;
    markOpenShell(part, 'Single-sheet alpha-cut olive spray cards; double-sided foliage.');
    names.push(name);
  });
  root.userData = { windNodes: names, windWeight: 'TEXCOORD_0.y: 0 at spray twig attachment, 1 at card tip', leafCards: cards };
}

async function build() {
  const root = createRoot('TreeOlive');
  await buildOlive(root);
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
