// Meridian Sanctuary sky statue: a humpback-like whale carved in white veined marble, gently
// arched mid-swim (head lifted, flukes curving up), floating above the courts with no plinth.
// One closed mesh with one material: the stone kit's white veined marble (marbleSpec and the
// marble roughness of stone-kit.kiln.js / architecture.kiln.js), so the whale is from the same
// quarry. Frame: length along Z, swimming toward +Z, belly toward -Y, about 12 m long, its
// bounding box centred on the origin.
// Every component (body, pectoral fins, flukes, dorsal fin, eyes) is a closed loft with fan caps,
// oriented outward by its signed volume; normals are smoothed across welded positions so the
// UV seams do not show in the shading.
const meta = { name: 'Meridian statue whale', role: 'wonder' };

// ---------------------------------------------------------------- parameters
const LENGTH = 12;   // final Z extent in metres (snout to fluke tips)
const LB = 10.6;     // body length before scaling, snout to the peduncle end
const NR = 112;      // body ring segments (the 44-sample throat sector holds 11 grooves of 4)
const NS = 100;      // body stations
const NF = 28;       // airfoil loop points for fins and flukes
const VEIN_TILE = 8; // metres of fin or fluke per marble tile

// Body profile: half-width, half-height above and below the centreline, by s (0 snout, 1 peduncle)
const PS = [0, 0.05, 0.12, 0.22, 0.33, 0.45, 0.58, 0.70, 0.80, 0.88, 0.94, 1.0];
const PW = [0.42, 0.62, 0.85, 1.08, 1.25, 1.28, 1.12, 0.82, 0.52, 0.30, 0.20, 0.18];
const PT = [0.28, 0.43, 0.60, 0.83, 1.06, 1.16, 1.08, 0.88, 0.64, 0.44, 0.28, 0.15];
const PB = [0.40, 0.62, 0.90, 1.15, 1.30, 1.30, 1.10, 0.80, 0.52, 0.33, 0.22, 0.13];

// Pectoral fins (humpback flippers, about a third of the length), raised like wings
const FIN = { s: 0.31, theta: 116, bury: 0.38, length: 4.1, rootChord: 1.08, tipChord: 0.42,
  sweep0: 26, sweep1: 50, dihedral0: 12, dihedral1: 24, tubercles: 9, stations: 60 };
// Flukes: tip-to-tip span, upward curl of the blade aft of the stock (per metre squared)
const FLUKE = { span: 4.6, curl: 0.15, stations: 61 };
const DORSAL = { s: 0.655, length: 0.78, chord: 0.95, lean: 52, stations: 14 };
const EYE = { s: 0.255, theta: 82 };

// ---------------------------------------------------------------- small maths
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const rad = (d) => (d * Math.PI) / 180;

// Monotone cubic (Fritsch-Carlson) interpolation through control points: no overshoot.
function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const fW = monotone(PS, PW), fT = monotone(PS, PT), fB = monotone(PS, PB);

// ---------------------------------------------------------------- body frame
// Centreline in the YZ plane: the head lifts a little, the tail stock curves up toward the flukes.
function centre(s) {
  const y = s < 0.4 ? 0.45 * (1 - s / 0.4) ** 2 : 1.6 * ((s - 0.4) / 0.6) ** 2.4;
  return [0, y, 6 - LB * s];
}
function frame(s) {
  const e = 1e-3, T = nrm(sub(centre(Math.min(1, s + e)), centre(Math.max(0, s - e)))); // toward the tail
  return { C: centre(s), T, U: [0, -T[2], T[1]], X: [1, 0, 0] };
}
// Elliptical end caps so the snout and the peduncle end close round, not pointed.
function capFactor(s) {
  const a0 = 0.06, a1 = 0.06;
  let f = 1;
  if (s < a0) f = Math.sqrt(Math.max(0.02, 1 - ((a0 - s) / a0) ** 2));
  if (s > 1 - a1) f = Math.min(f, Math.sqrt(Math.max(0.02, 1 - ((s - (1 - a1)) / a1) ** 2)));
  return f;
}
const thetaSide = (deg) => (deg <= 180 ? deg : 360 - deg); // 0 top, 90 flank, 180 belly, both sides

// Carved relief, as a signed offset along the section normal (metres, before scaling).
function relief(s, deg, j) {
  const ts = thetaSide(deg);
  let d = 0;
  // ventral grooves from the chin to the navel: 11 channels over the 44 samples j = 34..78
  if (j !== undefined && j >= 34 && j <= 78) {
    const q = (j - 34) / 44;
    const along = smooth(0.015, 0.07, s) * (1 - smooth(0.34, 0.5, s));
    const edge = smooth(0, 0.16, q) * smooth(0, 0.16, 1 - q);
    d -= 0.075 * Math.sin(Math.PI * 11 * q) ** 2 * along * edge;
  }
  // mouth line: from the snout back along the lower flank, arching down, ending below the eye
  if (s < 0.25) {
    const tm = 93 + 10 * Math.sin((Math.PI * s) / 0.235); // clear of the groove sector (from 109 degrees)
    const fade = smooth(0.0, 0.02, s) * (1 - smooth(0.215, 0.245, s));
    d -= 0.08 * Math.exp(-(((ts - tm) / 7) ** 2)) * fade;
  }
  // keel along the top of the tail stock, from behind the dorsal fin to the flukes
  d += 0.06 * Math.exp(-((ts / 9) ** 2)) * smooth(0.69, 0.76, s) * (1 - smooth(0.95, 1.0, s));
  return d;
}

// A body surface point, with its section normal. deg: 0 top, 90 the +X flank, 180 the belly.
function bodyPoint(s, deg, j) {
  const F = frame(s), cf = capFactor(s);
  const hump = 0.1 * Math.exp(-(((s - DORSAL.s) / 0.05) ** 2));
  const W = fW(s) * cf, HT = (fT(s) + hump) * cf, HB = fB(s) * cf;
  const th = rad(deg), sn = Math.sin(th), cs = Math.cos(th);
  const e = 2 / 2.25; // a slightly full superellipse, flatter on top of the head
  const eTop = 2 / lerp(2.6, 2.25, smooth(0.05, 0.3, s));
  const H = cs >= 0 ? HT : HB;
  const x = W * spow(sn, e), y = H * spow(cs, cs >= 0 ? eTop : e);
  const n2 = nrm([x / (W * W + 1e-9), y / (H * H + 1e-9), 0]);
  const d = relief(s, deg, j);
  const lx = x + n2[0] * d, ly = y + n2[1] * d;
  const p = add(F.C, add(mul(F.X, lx), mul(F.U, ly)));
  const n = nrm(add(mul(F.X, n2[0]), mul(F.U, n2[1])));
  return { p, n, F };
}

// ---------------------------------------------------------------- mesh builder
function makeBuilder() {
  const P = [], UV = [], I = [];
  let start = 0;
  const v = (p, uv) => { P.push(p[0], p[1], p[2]); UV.push(uv[0], uv[1]); return P.length / 3 - 1; };
  return {
    P, UV, I,
    begin() { start = I.length; },
    // Orient this closed component outward by the sign of its volume.
    end() {
      let vol = 0;
      for (let t = start; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        vol += dot([P[a], P[a + 1], P[a + 2]], crs([P[b], P[b + 1], P[b + 2]], [P[c], P[c + 1], P[c + 2]]));
      }
      if (vol < 0) for (let t = start; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
    },
    // Closed loft through rings of equal point count, fan-capped at both ends. A ring's seam
    // vertex is duplicated for the UV wrap; positions match, so topology checks weld it.
    loft(rings, uvOf, tipStart, tipEnd) {
      const n = rings[0].length, rows = [];
      rings.forEach((ring, i) => {
        const row = [];
        for (let j = 0; j <= n; j++) row.push(v(ring[j % n], uvOf(i, j / n)));
        rows.push(row);
      });
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], b = rows[i + 1];
        for (let j = 0; j < n; j++) I.push(a[j], b[j], b[j + 1], a[j], b[j + 1], a[j + 1]);
      }
      const t0 = v(tipStart, uvOf(0, 0.5)), t1 = v(tipEnd, uvOf(rows.length - 1, 0.5));
      const a = rows[0], b = rows[rows.length - 1];
      for (let j = 0; j < n; j++) I.push(t0, a[j], a[j + 1], t1, b[j + 1], b[j]);
    },
  };
}
const centroid = (ring) => mul(ring.reduce((acc, p) => add(acc, p), [0, 0, 0]), 1 / ring.length);

// NACA-style half-thickness (unit chord, max 0.5 at x 0.3) plus a blunt carved trailing edge.
const naca = (x) => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
// One airfoil ring: le the leading-edge point, c the chord direction (toward the trailing edge),
// n the thickness direction; half the maximum thickness is half.
function airfoil(le, c, n, chord, half, tmin) {
  const ring = [];
  for (let k = 0; k < NF; k++) {
    const phi = (2 * Math.PI * k) / NF, xc = 0.5 * (1 + Math.cos(phi)), sg = Math.sin(phi);
    const yt = half * 2 * naca(xc) + tmin * xc;
    ring.push(add(add(le, mul(c, xc * chord)), mul(n, Math.abs(sg) < 1e-9 ? 0 : Math.sign(sg) * yt)));
  }
  return ring;
}

// ---------------------------------------------------------------- components
function body(B) {
  const rings = [], arc = [0];
  const ss = [];
  for (let i = 0; i <= NS; i++) { const t = i / NS; ss.push(0.6 * t + 0.4 * 0.5 * (1 - Math.cos(Math.PI * t))); }
  for (const s of ss) {
    const ring = [];
    for (let j = 0; j < NR; j++) ring.push(bodyPoint(s, (360 * j) / NR, j).p);
    rings.push(ring);
  }
  for (let i = 1; i < ss.length; i++) arc.push(arc[i - 1] + Math.hypot(...sub(centre(ss[i]), centre(ss[i - 1]))));
  const F0 = frame(0), F1 = frame(1);
  B.begin();
  // texture U along the body, so the veins run with its length rather than ringing the girth
  B.loft(rings, (i, u) => [arc[i] / LB, u], add(centroid(rings[0]), mul(F0.T, -0.012)), add(centroid(rings[NS]), mul(F1.T, 0.006)));
  B.end();
}

// Right pectoral fin as rings along a swept spine; the left one is its mirror.
function pectoralRings() {
  const root = bodyPoint(FIN.s, FIN.theta);
  let P = sub(root.p, mul(root.n, FIN.bury));
  const rings = [], n = FIN.stations, spans = [];
  let span = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 0.7 * t + 0.3 * Math.sin((Math.PI * t) / 2);
    const sw = rad(lerp(FIN.sweep0, FIN.sweep1, u * u)), dh = rad(lerp(FIN.dihedral0, FIN.dihedral1, u));
    const d = [Math.cos(dh) * Math.cos(sw), Math.sin(dh), -Math.cos(dh) * Math.sin(sw)];
    if (i > 0) {
      const tp = (i - 1) / n, up = 0.7 * tp + 0.3 * Math.sin((Math.PI * tp) / 2), step = (u - up) * FIN.length;
      P = add(P, mul(d, step)); span += step;
    }
    const Uh = [-Math.sin(dh), Math.cos(dh), 0];
    const c = nrm(crs(Uh, d)), nn = nrm(crs(d, c));
    let chord = lerp(FIN.rootChord, FIN.tipChord, u);
    if (u > 0.8) chord *= Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2));
    chord = Math.max(chord, 0.05);
    // tubercles: rounded knobs along the leading edge, the humpback's scalloped flipper
    const tq = (u - 0.12) / 0.8;
    const tub = tq > 0 && tq < 1 ? 0.075 * Math.sin(Math.PI * FIN.tubercles * tq) ** 2 * (1 - 0.5 * tq) : 0;
    const full = chord + tub;
    const le = sub(P, mul(c, 0.3 * chord + tub));
    const half = Math.max(0.035, 0.13 * full * lerp(1, 0.75, u));
    rings.push(airfoil(le, c, nn, full, half, 0.018));
    spans.push(span);
  }
  return { rings, spans };
}

function pectorals(B) {
  const { rings, spans } = pectoralRings();
  const uv = (i, u) => [spans[i] / VEIN_TILE + 0.3, u * 0.4];
  for (const side of [1, -1]) {
    const rs = rings.map((r) => r.map((p) => [p[0] * side, p[1], p[2]]));
    const tipDir = nrm(sub(centroid(rs[rs.length - 1]), centroid(rs[rs.length - 2])));
    const rootDir = nrm(sub(centroid(rs[0]), centroid(rs[1])));
    B.begin();
    B.loft(rs, uv, add(centroid(rs[0]), mul(rootDir, 0.05)), add(centroid(rs[rs.length - 1]), mul(tipDir, 0.03)));
    B.end();
  }
}

function flukes(B) {
  const F = frame(1), Fw = mul(F.T, -1), Uf = F.U;   // forward and up at the end of the tail stock
  const O = add(F.C, mul(F.T, -0.02));
  const S = FLUKE.span / 2, rings = [], xs = [];
  for (let i = 0; i < FLUKE.stations; i++) {
    const t = -1 + (2 * i) / (FLUKE.stations - 1);
    const x = S * Math.sin((Math.PI * t) / 2), q = Math.abs(x) / S;
    const mid = -0.82 * q ** 1.7;                                // swept back toward the tips
    const chord0 = Math.max(0.05, 0.98 * (1 - 0.55 * q) * Math.sqrt(Math.max(0, 1 - q ** 8)));
    const notch = 0.24 * Math.exp(-((x / 0.2) ** 2));             // the median notch
    const fillet = 0.6 * Math.exp(-((x / 0.32) ** 2));            // the root flares forward along the stock
    const serr = 0.025 * Math.sin(Math.PI * 6 * q) ** 2 * smooth(0.15, 0.3, q) * (1 - smooth(0.85, 1, q));
    const le = mid + 0.42 * chord0 + fillet, te = mid - 0.58 * chord0 + notch + serr;
    const lift = 0.14 * q * q;                                  // the span curves gently upward
    const half = 0.21 * (1 - q) ** 1.5 + 0.03;
    const leP = add(O, add(add(mul([1, 0, 0], x), mul(Uf, lift)), mul(Fw, le)));
    // the blade curls upward aft of the stock, so the tail reads as curving up
    rings.push(airfoil(leP, mul(Fw, -1), Uf, le - te, half, 0.014).map((p) => {
      const zl = dot(sub(p, O), Fw);
      return add(p, mul(Uf, FLUKE.curl * Math.max(0, -zl) ** 2));
    }));
    xs.push(x);
  }
  const tipA = nrm(sub(centroid(rings[0]), centroid(rings[1]))), tipB = nrm(sub(centroid(rings[rings.length - 1]), centroid(rings[rings.length - 2])));
  B.begin();
  B.loft(rings, (i, u) => [(xs[i] + S) / VEIN_TILE + 0.6, u * 0.3], add(centroid(rings[0]), mul(tipA, 0.025)), add(centroid(rings[rings.length - 1]), mul(tipB, 0.025)));
  B.end();
}

function dorsal(B) {
  const top = bodyPoint(DORSAL.s, 0), F = top.F, l = rad(DORSAL.lean);
  const d = nrm(add(mul(F.U, Math.cos(l)), mul(F.T, Math.sin(l))));
  const c = nrm(sub(F.T, mul(d, dot(F.T, d))));
  const base = sub(top.p, mul(F.U, 0.26)), rings = [];
  for (let i = 0; i <= DORSAL.stations; i++) {
    const u = i / DORSAL.stations;
    let chord = DORSAL.chord * (1 - 0.65 * u);
    if (u > 0.55) chord *= Math.sqrt(Math.max(0, 1 - ((u - 0.55) / 0.45) ** 2));
    chord = Math.max(chord, 0.04);
    const P = add(base, mul(d, u * DORSAL.length));
    rings.push(airfoil(sub(P, mul(c, 0.3 * chord)), c, [1, 0, 0], chord, Math.max(0.025, 0.15 * chord), 0.012));
  }
  const tip = nrm(sub(centroid(rings[rings.length - 1]), centroid(rings[rings.length - 2])));
  B.begin();
  B.loft(rings, (i, u) => [u * 0.2, i / 40 + 0.1], sub(centroid(rings[0]), mul(d, 0.04)), add(centroid(rings[rings.length - 1]), mul(tip, 0.02)));
  B.end();
}

// A small carved eye: a lidded almond boss set into the flank above the corner of the mouth.
function eyes(B) {
  for (const side of [1, -1]) {
    const sp = bodyPoint(EYE.s, side > 0 ? EYE.theta : 360 - EYE.theta), n = sp.n;
    const along = nrm(sub(sp.F.T, mul(n, dot(sp.F.T, n)))), across = nrm(crs(n, along));
    const ctr = sub(sp.p, mul(n, 0.055)), rings = [], NE = 12, NA = 16;
    for (let i = 1; i < NE; i++) {
      const a = (Math.PI * i) / NE, h = -Math.cos(a) * 0.12, r = Math.sin(a);
      const ring = [];
      for (let k = 0; k < NA; k++) {
        const b = (2 * Math.PI * k) / NA;
        ring.push(add(add(ctr, mul(n, h)), add(mul(along, 0.17 * r * Math.cos(b)), mul(across, 0.1 * r * Math.sin(b)))));
      }
      rings.push(ring);
    }
    B.begin();
    B.loft(rings, (i, u) => [u * 0.05, i * 0.004 + 0.8], sub(ctr, mul(n, 0.12)), add(ctr, mul(n, 0.12)));
    B.end();
  }
}

// ---------------------------------------------------------------- material (as the stone kit)
function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function veinPolys(R, x, y, ang, steps, len, halfW, wiggle, seg = 6) {
  const left = [], right = [];
  for (let k = 0; k < steps; k++) {
    ang += (R() - 0.5) * wiggle;
    x += Math.cos(ang) * len; y += Math.sin(ang) * len;
    const t = k / (steps - 1);
    const w = Math.max(1, halfW * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.7 + 0.6 * R()));
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    left.push([Math.round(x + nx) + 0, Math.round(y + ny) + 0]);
    right.push([Math.round(x - nx) + 0, Math.round(y - ny) + 0]);
  }
  const polys = [];
  for (let a = 0; a < steps - 1; a += seg) {
    const b = Math.min(steps - 1, a + seg);
    const pts = left.slice(a, b + 1).concat(right.slice(a, b + 1).reverse())
      .filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
    if (pts.length >= 3) polys.push(pts);
  }
  return polys;
}
// White veined marble, identical to the kit's marbleSpec (turn 16 veins).
function marbleSpec(q, seed, baseAng) {
  const s = q / 512, R = rng(seed), ops = [];
  ops.push({ op: 'legacy-v2', spec: { schemaVersion: 2, size: q, usage: 'albedo', layers: [
    { op: 'noise', colorA: 0xf1efea, colorB: 0xfefdfb, scale: 3, octaves: 4, seed },
    { op: 'noise', colorA: 0xdcd6cc, colorB: 0xfaf8f4, scale: 10, octaves: 2, seed: seed + 5, blend: 'overlay', opacity: 0.25 },
  ] } });
  for (let i = 0; i < 2; i++) {
    const x = -0.05 * q, y = ((i + 0.25 + R() * 0.5) * q) / 2, ang = baseAng + (R() - 0.5) * 0.3, vs = Math.floor(R() * 1e9);
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 10 * s + 1, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [222, 216, 206, 255], opacity: 28 });
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 1.2 * s + 0.6, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [178, 172, 162, 255], opacity: 75 });
    const t = 0.3 + 0.3 * R(), ba = ang + (R() < 0.5 ? -1 : 1) * (0.4 + 0.3 * R());
    for (const p of veinPolys(R, x + t * q * Math.cos(ang), y + t * q * Math.sin(ang), ba, 13, q / 26, 0.9 * s + 0.5, 0.35)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [186, 180, 170, 255], opacity: 60 });
  }
  for (let i = 0; i < 5; i++) {
    const opacity = 30 + Math.floor(R() * 18);
    for (const p of veinPolys(R, R() * q, R() * q, baseAng + (R() - 0.5) * 0.9, 19, q / 30, 0.8 * s + 0.5, 0.5)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [200, 194, 186, 255], opacity });
  }
  return { schemaVersion: 3, width: q, height: q, usage: 'albedo', operations: ops };
}
// Marble roughness as the kit's marble patches: G 0x20..0x34 (about 0.13..0.2), metalness 0.
function ormSpec(oq, roughA, roughB, seed) {
  return { schemaVersion: 3, width: oq, height: oq, usage: 'metallicRoughness', operations: [{ op: 'legacy-v2', spec: { schemaVersion: 2, size: oq, usage: 'metallicRoughness', layers: [
    { op: 'noise', colorA: roughA << 8, colorB: roughB << 8, scale: 5, octaves: 3, seed }] } }] };
}
function marbleMaterial() {
  const albedo = proceduralTexture(marbleSpec(512, 101, 0.55));
  const orm = proceduralTexture(ormSpec(128, 0x20, 0x34, 5));
  const mat = pbrMaterial({ albedo, metallicRoughness: orm, roughness: 1, metalness: 1 });
  mat.name = 'meridian_marble';
  return mat;
}

// ---------------------------------------------------------------- assembly
// Scale to LENGTH along Z, centre the bounds on the origin, then smooth normals across
// welded positions (seam duplicates share their normal).
function finish(B) {
  const P = B.P, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  const sc = LENGTH / (hi[2] - lo[2]), mid = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) P[i + k] = (P[i + k] - mid[k]) * sc;
  const key = (i) => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
  const acc = new Map(), keys = [];
  for (let i = 0; i < P.length / 3; i++) { const k = key(i); keys.push(k); if (!acc.has(k)) acc.set(k, [0, 0, 0]); }
  const I = B.I;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const pa = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], pb = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], pc = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
    const fn = crs(sub(pb, pa), sub(pc, pa));
    for (const v of [a, b, c]) { const s = acc.get(keys[v]); s[0] += fn[0]; s[1] += fn[1]; s[2] += fn[2]; }
  }
  const N = [];
  for (let i = 0; i < P.length / 3; i++) { const n = nrm(acc.get(keys[i])); N.push(n[0], n[1], n[2]); }
  return meshGeo({ positions: P, normals: N, uvs: B.UV, indices: I });
}

function build() {
  const root = createRoot('statue-whale');
  const B = makeBuilder();
  body(B);
  pectorals(B);
  flukes(B);
  dorsal(B);
  eyes(B);
  const whale = createPart('statue_whale', finish(B), marbleMaterial(), { parent: root });
  requireSolid(whale);                                // closed, manifold, outward: it is seen from every side
  defineBudget({ triangles: 40000, draws: 1 }, root); // the brief's cap
  return root;
}
