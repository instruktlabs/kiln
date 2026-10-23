// ---------------------------------------------------------------- tree-plane
// London plane / sycamore-type shade tree for the courtyard plaza.
// Asset frame: metres, +X forward, +Y up, trunk centred at the origin, ground at Y=0.
// Clear trunk forks at ~2.4 m; broad rounded canopy ~6 m across, ~7.5 m tall.
// Leaves: clustered alpha-cut leaf cards in leaves_0..leaves_7 (one primitive each);
// TEXCOORD_0.y = 0 at each card's twig attachment, 1 at its tip (Holodeck wind weight).
const meta = { name: 'tree-plane', role: 'prop' };

const P = {
  seed: 7,
  forkY: 2.4,
  trunkR: 0.22, // radius above the flare
  canopyC: [0, 4.85, 0],
  canopyR: [2.7, 2.4, 2.7],
  limbs: 4,
  secondaries: 36,
  leafGroups: 2,
  cardLen: [0.25, 0.4],
  clumpCards: [10, 15],
  clumpR: 0.22,
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
function canopyDepth(p) {
  const C = P.canopyC;
  const R = P.canopyR;
  return Math.hypot((p[0] - C[0]) / R[0], (p[1] - C[1]) / R[1], (p[2] - C[2]) / R[2]);
}

// ---------------------------------------------------------------- textures
function palmateLeaf(cx, cy, R, axis, rnd) {
  // Five pointed lobes (main, two side, two basal) with shallow sinuses; petiole notch at the back.
  const lobes = [
    [0, 1.0],
    [rad(50), 0.86],
    [-rad(50), 0.86],
    [rad(100), 0.5],
    [-rad(100), 0.5],
  ];
  const w = rad(30);
  const pts = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const th = -Math.PI + (i / N) * Math.PI * 2;
    let r = 0.44;
    for (const [phi, L] of lobes) {
      let dx = Math.abs(th - phi);
      r = Math.max(r, L * (1 - dx / w) + 0.44 * (dx / w) * (dx < w ? 1 : 0));
    }
    // petiole notch
    r *= 1 - 0.45 * Math.exp(-Math.pow((Math.abs(th) - Math.PI) / 0.35, 2));
    r *= 0.96 + 0.08 * rnd();
    const a = axis + th;
    pts.push([cx + Math.cos(a) * r * R, cy + Math.sin(a) * r * R]);
  }
  return pts;
}

function makeLeafTexture() {
  // Two 256x256 cluster variants side by side. Image row 0 is uv.y = 0: the twig enters at the
  // top-centre of each region (the card's attachment) and leaves alternate along it.
  const rnd = makeRandom(31);
  const W = 512;
  const H = 256;
  const ops = [];
  const base = hexRGB(0x6f8a3e);
  const twigC = [104, 92, 64, 255];
  for (let variant = 0; variant < 2; variant++) {
    const ox = variant * 256;
    const bend = variant ? 14 : -12;
    const tw = (h) => [ox + 128 + bend * Math.sin((h / 236) * Math.PI * 0.9), h];
    ops.push(lineOp(tw(0), tw(80), 5, twigC));
    ops.push(lineOp(tw(80), tw(160), 4, twigC));
    ops.push(lineOp(tw(160), tw(222), 3, twigC));
    const n = 6;
    const leaves = [];
    for (let i = 0; i < n; i++) {
      const top = i === n - 1;
      const h = top ? 200 : lerp(52, 180, i / (n - 2)) + (rnd() - 0.5) * 10;
      const sideSign = (i + variant) % 2 ? 1 : -1;
      const ang = top ? rad(90 + (rnd() - 0.5) * 16) : rad(90 - sideSign * (52 + rnd() * 22));
      const R = top ? 54 : lerp(50, 60, rnd()) * (0.88 + 0.2 * (i / n));
      const pet = top ? 10 : 18 + rnd() * 10;
      const a0 = tw(h);
      const notch = [a0[0] + Math.cos(ang) * pet, a0[1] + Math.sin(ang) * pet];
      let cx = notch[0] + Math.cos(ang) * R * 0.42;
      let cy = notch[1] + Math.sin(ang) * R * 0.42;
      cx = clamp(cx, ox + R * 0.95, ox + 256 - R * 0.95);
      cy = clamp(cy, R * 0.8, H - R * 0.95);
      leaves.push({ cx, cy, R, ang, notch, a0, depth: rnd() });
    }
    leaves.sort((p, q) => p.depth - q.depth);
    for (const L of leaves) {
      const shade = lerp(0.74, 1.14, L.depth);
      const col = mixRGB(shadeRGB(base, shade), [170, 172, 76], rnd() * 0.18);
      ops.push(lineOp(L.a0, L.notch, 3, [122, 120, 70, 255]));
      ops.push(polyOp(palmateLeaf(L.cx, L.cy, L.R, L.ang, rnd), col));
      ops.push(lineOp(L.notch, [L.cx + Math.cos(L.ang) * L.R * 0.8, L.cy + Math.sin(L.ang) * L.R * 0.8], 2, shadeRGB(col, 1.22), 150));
    }
  }
  return proceduralTexture({ schemaVersion: 3, width: W, height: H, usage: 'albedo', name: 'PlaneLeafClusters', background: [92, 112, 52, 1], operations: ops });
}

function makeBarkTexture() {
  const rnd = makeRandom(77);
  // Plane bark sheds in irregular jigsaw flakes: cream and pale olive inner bark under grey-brown.
  const flake = (r) => {
    const pts = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.5 + 0.6 * rnd());
      pts.push([r * 1.2 + Math.cos(a) * rr * 0.95, r * 1.5 + Math.sin(a) * rr * 1.3]);
    }
    return pts.map(([x, y]) => [PX(x), PX(y)]);
  };
  const stamp = (r, rgba, count, seed, opacity) => ({
    op: 'stamps', shape: { kind: 'polygon', points: flake(r) }, rgba, count, seed,
    area: { x: 0, y: 0, width: 256, height: 256 }, periodic: true, opacity,
  });
  return proceduralTexture({
    schemaVersion: 3, width: 256, height: 256, usage: 'albedo', name: 'PlaneBarkMottle',
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2, size: 256, usage: 'albedo',
          layers: [
            { op: 'solid', color: 0x8a8670 },
            { op: 'noise', colorA: 0x6a6552, colorB: 0xa8a48a, scale: 5, octaves: 4, seed: 3, blend: 'overlay', opacity: 0.85 },
            { op: 'noise', colorA: 0x7a7660, colorB: 0x9c987e, scale: 24, octaves: 2, seed: 8, blend: 'overlay', opacity: 0.5 },
          ],
        },
      },
      stamp(34, [118, 110, 88, 255], 3, 5, 200),
      stamp(30, [204, 198, 162, 255], 3, 11, 230),
      stamp(26, [176, 176, 124, 255], 3, 23, 215),
      stamp(22, [100, 100, 80, 255], 3, 41, 190),
      stamp(20, [222, 214, 186, 255], 3, 57, 235),
      stamp(16, [160, 164, 112, 255], 3, 63, 220),
      stamp(12, [196, 186, 150, 255], 3, 71, 230),
      stamp(10, [92, 86, 70, 255], 3, 83, 180),
    ],
  });
}

// ---------------------------------------------------------------- structure
function buildPlane(root) {
  const rnd = makeRandom(P.seed);
  const barkTex = makeBarkTexture();
  const leafTex = makeLeafTexture();
  const bark = pbrMaterial({ albedo: barkTex, roughness: 0.88, metalness: 0 });
  bark.name = 'PlaneBark';
  const leaf = pbrMaterial({ albedo: leafTex, roughness: 0.72, metalness: 0, alphaMode: 'mask', alphaCutoff: 0.45, doubleSided: true });
  leaf.name = 'PlaneLeaf';

  const trunkMb = meshBuilder();
  const groups = Array.from({ length: P.leafGroups }, () => meshBuilder());
  const C = P.canopyC;
  const R = P.canopyR;

  // Trunk: slight sinuous lean, root flare buried below ground.
  const fork = [0.06, P.forkY, -0.04];
  const trunkCtrl = [[0, -0.25, 0], [0, 0.4, 0], [0.04, 1.3, 0.02], [0.02, 2.0, -0.03], fork, [0.07, P.forkY + 0.32, -0.04]];
  const trunkPts = catmullRomPath(trunkCtrl, 5);
  const trunkR = trunkPts.map((p) => {
    const h = Math.max(0, p[1]);
    let r = P.trunkR * (1 + 0.08 * (1 - Math.min(1, h / P.forkY))) + 0.16 * Math.exp(-h / 0.32);
    r *= 1 + 0.12 * smoothstep(P.forkY - 0.7, P.forkY - 0.15, h); // swelling below the fork
    r *= 1 - 0.62 * smoothstep(P.forkY - 0.1, P.forkY + 0.32, h); // closes between the limbs
    return r;
  });
  emitTube(trunkMb, trunkPts, trunkR, {
    radial: 18, vScale: 1.4, capEnd: true,
    rmul: (s, th) => 1 + 0.06 * Math.pow(Math.max(0, Math.cos(5 * th + 0.6)), 3) * Math.exp(-s / 0.7) + 0.015 * Math.sin(3 * th + s * 2),
  });

  const clusters = [];
  const addCluster = (p, along, size) => clusters.push({ p, along, size });

  // Limbs: a near-vertical leader plus three spreading limbs at even azimuths.
  const limbAz0 = rnd() * Math.PI * 2;
  const limbs = [];
  for (let li = 0; li < P.limbs; li++) {
    const az = limbAz0 + ((li === 0 ? 0.5 : li) / (P.limbs - 1)) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
    const tilt = rad(li === 0 ? 12 : 40 + rnd() * 10);
    const d0 = [Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)];
    const start = V.add(fork, [d0[0] * 0.04, -0.42, d0[2] * 0.04]);
    const len = Math.min(3.9, 0.9 * ellipsoidExit(start, d0, C, R)) * (0.92 + 0.1 * rnd());
    const mid = V.add(V.add(start, V.mul(d0, len * 0.5)), [Math.cos(az) * 0.25, -0.1, Math.sin(az) * 0.25]);
    const end = V.add(V.add(start, V.mul(d0, len)), [0, 0.2, 0]);
    const limbPts = catmullRomPath([start, V.add(start, V.mul(d0, 0.4)), mid, end], 4);
    const limbR = limbPts.map((_, i) => lerp(0.165, 0.045, Math.pow(i / (limbPts.length - 1), 0.85)));
    emitTube(trunkMb, limbPts, limbR, { radial: 12, vScale: 1.0, capEnd: true });
    limbs.push({ pts: limbPts, d0, end, az });
    addCluster(end, V.norm(V.add(d0, canopyNormal(end))), 1.1);
  }

  // Secondary branches aim at targets spread evenly over the dome (Fibonacci shell),
  // each served by the limb whose path passes closest to it.
  const nTargets = P.secondaries;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let j = 0; j < nTargets; j++) {
    const yN = lerp(1.0, -0.5, (j + 0.5) / nTargets); // normalised height on the shell
    const ring = Math.sqrt(1 - yN * yN);
    const th = j * golden + limbAz0;
    const shell = 0.84 + 0.1 * rnd();
    const target = [C[0] + Math.cos(th) * ring * R[0] * shell, C[1] + yN * R[1] * shell, C[2] + Math.sin(th) * ring * R[2] * shell];
    let best = null;
    for (const L of limbs) {
      for (let f = 0.2; f <= 0.95; f += 0.05) {
        const at = sampleAlong(L.pts, f);
        const dv = V.sub(target, at.p);
        const dist = V.len(dv);
        if (dist < 0.6) continue;
        const cosA = V.dot(V.mul(dv, 1 / dist), at.t);
        if (cosA < 0.05) continue; // branches leave forward of their limb
        const score = dist * (1.6 - cosA);
        if (!best || score < best.score) best = { score, at, f, dist };
      }
    }
    if (!best) continue;
    const start = best.at.p;
    const sLen = Math.min(2.8, best.dist);
    let d = V.norm(V.sub(target, start));
    const sEnd = V.add(start, V.mul(d, sLen));
    const sMid = V.add(V.lerp(start, sEnd, 0.5), [0, 0.1 + 0.08 * rnd(), 0]);
    const secPts = catmullRomPath([start, sMid, sEnd], 3);
    const r0 = lerp(0.075, 0.042, best.f);
    const secR = secPts.map((_, i) => lerp(r0, 0.014, i / (secPts.length - 1)));
    emitTube(trunkMb, secPts, secR, { radial: 6, vScale: 0.6, capEnd: true });

    // Twigs along the secondary, each carrying leaf clusters.
    const nTw = Math.max(4, Math.round(sLen * 3.4));
    for (let ti = 0; ti < nTw; ti++) {
      const g = 0.15 + (ti / (nTw - 1)) * 0.83;
      const ta = sampleAlong(secPts, g);
      const out2 = canopyNormal(ta.p);
      let td = deviate(ta.t, rad(35 + rnd() * 25), rnd() * Math.PI * 2);
      td = V.norm(V.add(td, V.mul(out2, 0.6)));
      const tLen = Math.min(1.15, 0.92 * ellipsoidExit(ta.p, td, C, R)) * (0.75 + 0.3 * rnd());
      if (tLen < 0.25) {
        addCluster(ta.p, V.norm(V.add(ta.t, out2)), 1);
        continue;
      }
      const tEnd = V.add(V.add(ta.p, V.mul(td, tLen)), [0, -0.06 * tLen, 0]);
      const twPts = [ta.p, V.lerp(ta.p, tEnd, 0.5), tEnd];
      emitTube(trunkMb, twPts, [lerp(0.016, 0.011, g), 0.009, 0.005], { radial: 3, vScale: 0.4 });
      const nC = tLen > 0.75 ? 3 : 2;
      for (let ci = 0; ci < nC; ci++) {
        const h = 0.3 + (ci / (nC - 1)) * 0.7;
        const cp = V.lerp(ta.p, tEnd, h);
        addCluster(cp, V.norm(V.add(td, V.mul(canopyNormal(cp), 0.8))), 1);
      }
    }
    addCluster(sEnd, V.norm(V.add(d, canopyNormal(sEnd))), 1.1);
  }

  // Leaf clumps: many small cards per twig point, denser toward the clump centre.
  // leaves_0 = inner/lower clumps, leaves_1 = outer/upper clumps (split at the median score).
  const score = (p) => canopyDepth(p) + 0.35 * (p[1] - C[1]) / R[1];
  const sorted = clusters.map((c) => score(c.p)).sort((a, b) => a - b);
  const split = sorted[Math.floor(sorted.length / 2)];
  const clumpOpts = {
    nMin: P.clumpCards[0], nMax: P.clumpCards[1], clumpR: P.clumpR, len: P.cardLen, aspect: 0.62,
    variants: [[0.095, 0.405], [0.595, 0.905]], outward: 0.7, up: 0.15, shadeMix: 0.55,
  };
  let cardCount = 0;
  for (const cl of clusters) {
    // Clumpy crown: drop some twig points for gaps, make the rest bigger and uneven.
    if (rnd() < 0.2) continue;
    const c = { p: cl.p, size: cl.size * (0.75 + 0.75 * Math.pow(rnd(), 1.5)) };
    cardCount += emitClump(groups[score(cl.p) >= split ? 1 : 0], c, canopyNormal(cl.p), clumpOpts, rnd);
  }

  const trunk = createPart('Trunk', trunkMb.geometry(), bark, { parent: root });
  trunk.name = 'Trunk';
  markOpenShell(trunk, 'Trunk, limb, branch and twig tubes in one bark mesh; root flare buried, thin ends open inside parents.');
  const names = [];
  groups.forEach((mb, g) => {
    const name = 'leaves_' + g;
    const part = createPart(name, mb.geometry(), leaf, { parent: root });
    part.name = name;
    markOpenShell(part, 'Single-sheet alpha-cut leaf cards; double-sided foliage.');
    names.push(name);
  });
  root.userData = {
    windNodes: names,
    windWeight: 'TEXCOORD_0.y: 0 at leaf-card base, 1 at card tip',
    leafCards: cardCount,
    clusters: clusters.length,
  };
}

function build() {
  const root = createRoot('TreePlane');
  buildPlane(root);
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
