// Gothic cathedral: parametric High Gothic church, true scale, metres.
// +X = west front (entrance) , -X = apse, +Y up, +Z = north.
const meta = { name: 'Gothic Cathedral', role: 'wonder' };

// ==================================================================================
// PARAMETERS: change these and the whole design follows.
// ==================================================================================
const P = {
  preview: 'all',          // 'all', or 'size' (true buffer bytes, fast), 'stats' (per-mesh list), 'textures' (map payload), 'unique' (no instances), 'statues' (test row)
  // Plan
  naveBays: 9, bay: 6.6, naveSpan: 13, aisleSpan: 6.6,
  xWest: 62,               // west face of the towers
  towerDepth: 14, towerWidth: 14,
  choirBays: 3, transeptBays: 2,
  apseSides: 7,
  // Elevation
  pierTop: 15, aisleCrown: 21, triforiumSill: 21.8, triforiumTop: 26.6,
  vaultSpring: 26.6, vaultCrown: 39.6, eaves: 41.4, roofPitch: 1.6,
  aisleWallTop: 23, aisleRoofHigh: 26.2,
  towerTop: 72, spireTip: 80,
  flecheTip: 74,
  // Detail
  jambStatues: 5, kings: 16, seed: 1163,
  archFigureTris: 720, statueTest: ['apostle', 'bishop', 'king', 'queen', 'angel', 'virgin'],
  storyWindows: 3, clerestoryWindows: 3, // unique window cartoons (more = richer, larger GLB)
  // Glass
  glassGlow: 1.05, glassOuterGlow: 0.12, sunShear: [0.34, 0.86],
  sun: [0.62, 0.45, -0.64], lightVariantBytes: 250000, wallTessellation: 5, // baked low sun from the south-west; bytes allowed for per-side vertex light; metres between lit wall vertices
  chapelFacets: 5,
};

// ==================================================================================
// MATH
// ==================================================================================
const PI = Math.PI, TAU = PI * 2, rad = (d) => d * PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = (x, y = 0) => Math.exp(-(x * x + y * y));
function mkRng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function keyLin(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i], f = (t - a[0]) / (b[0] - a[0]);
    return a.slice(1).map((v, k) => lerp(v, b[k + 1], f));
  }
  return keys[keys.length - 1].slice(1);
}
function keyf(keys, t, w = 0.03) { // smoothed keyframes [[t,v...],...]: no plateaus or kinks at the keys
  const a = keyLin(keys, t - w), b = keyLin(keys, t), c = keyLin(keys, t + w);
  return b.map((v, k) => (a[k] + 2 * v + c[k]) / 4);
}
const M = {
  I: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  T: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z],
  S: (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0],
  Rx: (d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; },
  Ry: (d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; },
  Rz: (d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; },
  mul: (a, b) => [
    a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
    a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
    a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
  ],
  of: (...ms) => ms.reduce((a, b) => M.mul(a, b)),
};
function normalMat(m) { // inverse transpose of the 3x3, up to scale (cofactors)
  return [
    m[5] * m[10] - m[6] * m[9], m[6] * m[8] - m[4] * m[10], m[4] * m[9] - m[5] * m[8],
    m[2] * m[9] - m[1] * m[10], m[0] * m[10] - m[2] * m[8], m[1] * m[8] - m[0] * m[9],
    m[1] * m[6] - m[2] * m[5], m[2] * m[4] - m[0] * m[6], m[0] * m[5] - m[1] * m[4],
  ];
}
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);

// ==================================================================================
// MESH KIT: one Batch = one mesh with one material; metric UVs, baked shading in COLOR_0
// ==================================================================================
class Batch {
  constructor(tile = 1) { this.P = []; this.N = []; this.UV = []; this.C = []; this.I = []; this.tile = tile; this.setM(M.I()); this.sh = 1; this.rgb = [1, 1, 1]; this.geo = null; }
  setM(m) { this.m = m; this.nm = normalMat(m); this.det = det3(m); }
  at(m, f) { const old = this.m; this.setM(M.mul(old, m)); f(this); this.setM(old); return this; }
  shade(s, f) { const o = this.sh; this.sh = o * s; f(this); this.sh = o; return this; }
  tint(rgb, f) { const o = this.rgb; this.rgb = rgb; f(this); this.rgb = o; return this; }
  get count() { return this.P.length / 3; }
  v(x, y, z, nx, ny, nz, u, v, s = 1) {
    const m = this.m, n = this.nm;
    const wx = m[0] * x + m[1] * y + m[2] * z + m[3], wy = m[4] * x + m[5] * y + m[6] * z + m[7], wz = m[8] * x + m[9] * y + m[10] * z + m[11];
    let ax = n[0] * nx + n[1] * ny + n[2] * nz, ay = n[3] * nx + n[4] * ny + n[5] * nz, az = n[6] * nx + n[7] * ny + n[8] * nz;
    const l = Math.hypot(ax, ay, az);
    if (l < 1e-10) { ax = 0; ay = 1; az = 0; } else { ax /= l; ay /= l; az /= l; }
    if (this.det < 0) { ax = -ax; ay = -ay; az = -az; }
    if (u === undefined || u === null) {
      const fx = Math.abs(ax), fy = Math.abs(ay), fz = Math.abs(az);
      if (fy > 0.75) { u = wx; v = wz; } else if (fx > fz) { u = wz; v = wy; } else { u = wx; v = wy; }
    }
    const sh = clamp(s * this.sh); // all light is added later by bakeLight
    const rgb = this.rgb;
    this.P.push(wx, wy, wz); this.N.push(ax, ay, az); this.UV.push(u / this.tile, v / this.tile);
    this.C.push(Math.round(255 * sh * rgb[0]), Math.round(255 * sh * rgb[1]), Math.round(255 * sh * rgb[2]));
    return this.P.length / 3 - 1;
  }
  tri(a, b, c) { if (this.det < 0) this.I.push(a, c, b); else this.I.push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  // flat polygon from 3D points (CCW seen from the front); convex fan
  face(pts, s = 1) {
    const a = pts[0], b = pts[1], c = pts[pts.length - 1];
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (pts.length > 3 && Math.hypot(nx, ny, nz) < 1e-9) { const d = pts[2]; nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]); ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]); nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]); }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const ids = pts.map((p) => this.v(p[0], p[1], p[2], nx, ny, nz, undefined, undefined, p[3] === undefined ? s : p[3]));
    for (let i = 1; i < ids.length - 1; i++) this.tri(ids[0], ids[i], ids[i + 1]);
    return this;
  }
  box(x0, x1, y0, y1, z0, z1, o = {}) {
    const s = o.s === undefined ? 1 : o.s, sb = o.sb === undefined ? s * 0.62 : o.sb, st = o.st === undefined ? s : o.st;
    const tx = o.taper || 0;
    const X0 = x0 + tx, X1 = x1 - tx, Z0 = z0 + (o.taperZ === undefined ? tx : o.taperZ), Z1 = z1 - (o.taperZ === undefined ? tx : o.taperZ);
    this.face([[x1, y0, z1, s], [x1, y0, z0, s], [X1, y1, Z0, st], [X1, y1, Z1, st]]); // +X
    this.face([[x0, y0, z0, s], [x0, y0, z1, s], [X0, y1, Z1, st], [X0, y1, Z0, st]]); // -X
    this.face([[x0, y0, z1, s], [x1, y0, z1, s], [X1, y1, Z1, st], [X0, y1, Z1, st]]); // +Z
    this.face([[x1, y0, z0, s], [x0, y0, z0, s], [X0, y1, Z0, st], [X1, y1, Z0, st]]); // -Z
    if (!o.noTop) this.face([[X0, y1, Z1, st], [X1, y1, Z1, st], [X1, y1, Z0, st], [X0, y1, Z0, st]]);
    if (!o.noBot) this.face([[x0, y0, z0, sb], [x1, y0, z0, sb], [x1, y0, z1, sb], [x0, y0, z1, sb]]);
    return this;
  }
  // Surface of revolution about Y. prof: [[r,y],...] bottom to top. o.sides, o.faceted, o.crease, o.flat
  lathe(prof, n = 12, o = {}) {
    const a0 = o.phase || 0, cr = Math.cos(rad(o.crease === undefined ? 55 : o.crease));
    const s = o.s === undefined ? 1 : o.s;
    const segs = [];
    for (let j = 0; j < prof.length - 1; j++) {
      const dr = prof[j + 1][0] - prof[j][0], dy = prof[j + 1][1] - prof[j][1], l = Math.hypot(dr, dy) || 1;
      segs.push([dy / l, -dr / l, l]);
    }
    if (o.faceted) { // hard-edged polygon of revolution
      for (let i = 0; i < n; i++) {
        const t0 = a0 + TAU * i / n, t1 = a0 + TAU * (i + 1) / n, tm = (t0 + t1) / 2;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1), cm = Math.cos(tm), sm = Math.sin(tm);
        let vv = 0;
        for (let j = 0; j < segs.length; j++) {
          const [nr, ny, l] = segs[j];
          const p0 = prof[j], p1 = prof[j + 1];
          const w0 = p0[0] * Math.hypot(c1 - c0, s1 - s0), w1 = p1[0] * Math.hypot(c1 - c0, s1 - s0);
          const sA = p0[2] === undefined ? s : p0[2], sB = p1[2] === undefined ? s : p1[2];
          const a = this.v(p0[0] * c0, p0[1], p0[0] * s0, nr * cm, ny, nr * sm, -w0 / 2, vv, sA);
          const b = this.v(p1[0] * c0, p1[1], p1[0] * s0, nr * cm, ny, nr * sm, -w1 / 2, vv + l, sB);
          const c = this.v(p1[0] * c1, p1[1], p1[0] * s1, nr * cm, ny, nr * sm, w1 / 2, vv + l, sB);
          const d = this.v(p0[0] * c1, p0[1], p0[0] * s1, nr * cm, ny, nr * sm, w0 / 2, vv, sA);
          this.quad(a, b, c, d); vv += l;
        }
      }
      return this;
    }
    // smooth around, creased along the profile when the section turns sharply
    let vv = 0;
    for (let j = 0; j < segs.length; j++) {
      const [nr, ny, l] = segs[j];
      const prev = segs[j - 1], next = segs[j + 1];
      let n0r = nr, n0y = ny, n1r = nr, n1y = ny;
      if (prev && prev[0] * nr + prev[1] * ny > cr) { n0r = prev[0] + nr; n0y = prev[1] + ny; }
      if (next && next[0] * nr + next[1] * ny > cr) { n1r = next[0] + nr; n1y = next[1] + ny; }
      const base = this.count, p0 = prof[j], p1 = prof[j + 1];
      const circ = Math.max(p0[0], p1[0]) * TAU, uScale = Math.max(1, Math.round(circ)) / n;
      const sA = p0[2] === undefined ? s : p0[2], sB = p1[2] === undefined ? s : p1[2];
      for (let i = 0; i <= n; i++) {
        const t = a0 + TAU * i / n, c = Math.cos(t), sn = Math.sin(t);
        this.v(p0[0] * c, p0[1], p0[0] * sn, n0r * c, n0y, n0r * sn, i * uScale, vv, sA);
        this.v(p1[0] * c, p1[1], p1[0] * sn, n1r * c, n1y, n1r * sn, i * uScale, vv + l, sB);
      }
      for (let i = 0; i < n; i++) this.quad(base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2);
      vv += l;
    }
    return this;
  }
  // Sweep a closed section (a,b CCW; a along in-plane left normal, b along +Z) along a path in the XY plane.
  sweep(path, sec, o = {}) {
    const closedPath = !!o.closed, cr = Math.cos(rad(o.crease === undefined ? 50 : o.crease)), z0 = o.z || 0, s = o.s === undefined ? 1 : o.s;
    const n = path.length, E = [];
    const segCount = closedPath ? n : n - 1;
    for (let i = 0; i < segCount; i++) { const p = path[i], q = path[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1e-6; E.push([dx / l, dy / l, l]); }
    // section normals
    const K = sec.length, SN = [];
    for (let j = 0; j < K; j++) { const a = sec[j], b = sec[(j + 1) % K]; const da = b[0] - a[0], db = b[1] - a[1], l = Math.hypot(da, db) || 1e-6; SN.push([db / l, -da / l, l]); }
    const rings = []; let dist = 0;
    for (let i = 0; i < segCount; i++) {
      const e = E[i], ePrev = closedPath ? E[(i - 1 + segCount) % segCount] : (E[i - 1] || e), eNext = closedPath ? E[(i + 1) % segCount] : (E[i + 1] || e);
      const p = path[i], q = path[(i + 1) % n];
      const miter = (A, B) => { let bx = -(A[1] + B[1]), by = A[0] + B[0]; const l = Math.hypot(bx, by) || 1; bx /= l; by /= l; const nlx = -B[1], nly = B[0]; const c = Math.max(0.35, bx * nlx + by * nly); return [bx / c, by / c]; };
      const m0 = miter(ePrev, e), m1 = miter(e, eNext);
      const smooth0 = ePrev[0] * e[0] + ePrev[1] * e[1] > cr, smooth1 = e[0] * eNext[0] + e[1] * eNext[1] > cr;
      const nl = [-e[1], e[0]];
      const n0 = smooth0 ? [-(e[1] + ePrev[1]), e[0] + ePrev[0]] : nl, n1 = smooth1 ? [-(e[1] + eNext[1]), e[0] + eNext[0]] : nl;
      const ln0 = Math.hypot(n0[0], n0[1]) || 1, ln1 = Math.hypot(n1[0], n1[1]) || 1;
      let perim = 0;
      for (let j = 0; j < K; j++) {
        const A = sec[j], B = sec[(j + 1) % K], sn = SN[j], pv = SN[(j - 1 + K) % K], nx = SN[(j + 1) % K];
        const sA = sn[0] * pv[0] + sn[1] * pv[1] > cr, sB = sn[0] * nx[0] + sn[1] * nx[1] > cr;
        const nA = sA ? [sn[0] + pv[0], sn[1] + pv[1]] : sn, nB = sB ? [sn[0] + nx[0], sn[1] + nx[1]] : sn;
        const norm = (na, nb, nv, ln) => { const l = Math.hypot(na, nb) || 1; const a = na / l, b = nb / l; return [a * nv[0] / ln, a * nv[1] / ln, b]; };
        const na0 = norm(nA[0], nA[1], n0, ln0), nb0 = norm(nB[0], nB[1], n0, ln0), na1 = norm(nA[0], nA[1], n1, ln1), nb1 = norm(nB[0], nB[1], n1, ln1);
        const shA = A[2] === undefined ? s : A[2] * s, shB = B[2] === undefined ? s : B[2] * s;
        const a = this.v(p[0] + A[0] * m0[0], p[1] + A[0] * m0[1], z0 + A[1], na0[0], na0[1], na0[2], dist, perim, shA);
        const b = this.v(p[0] + B[0] * m0[0], p[1] + B[0] * m0[1], z0 + B[1], nb0[0], nb0[1], nb0[2], dist, perim + sn[2], shB);
        const c = this.v(q[0] + B[0] * m1[0], q[1] + B[0] * m1[1], z0 + B[1], nb1[0], nb1[1], nb1[2], dist + e[2], perim + sn[2], shB);
        const d = this.v(q[0] + A[0] * m1[0], q[1] + A[0] * m1[1], z0 + A[1], na1[0], na1[1], na1[2], dist + e[2], perim, shA);
        this.quad(a, b, c, d);
        perim += sn[2];
      }
      dist += e[2];
      rings.push(m0);
    }
    if (!closedPath && o.caps !== false) {
      const capAt = (p, nv, e, flip) => {
        const pts = sec.map((A) => [p[0] + A[0] * nv[0], p[1] + A[0] * nv[1], z0 + A[1]]);
        const idx = triangulate(sec.map((A) => [A[0], A[1]]));
        const ids = pts.map((q) => this.v(q[0], q[1], q[2], flip * e[0], flip * e[1], 0, q[0], q[2], s * 0.8));
        for (const t of idx) { if (flip > 0) this.tri(ids[t[0]], ids[t[2]], ids[t[1]]); else this.tri(ids[t[0]], ids[t[1]], ids[t[2]]); }
      };
      capAt(path[0], rings[0], E[0], -1);
      const lastE = E[segCount - 1]; capAt(path[n - 1], [-lastE[1], lastE[0]], lastE, 1);
    }
    return this;
  }
  // Generic tube along a 3D path with parallel transport. radii: number|array|fn(t) -> [ra, rb]; ring: fn(angle,t) multiplier
  tube(path, radii, n = 8, o = {}) {
    const N = path.length, s = o.s === undefined ? 1 : o.s;
    let T = [], U = o.up ? [...o.up] : null;
    for (let i = 0; i < N; i++) {
      const p = path[Math.max(0, i - 1)], q = path[Math.min(N - 1, i + 1)];
      let tx = q[0] - p[0], ty = q[1] - p[1], tz = q[2] - p[2]; const l = Math.hypot(tx, ty, tz) || 1; T.push([tx / l, ty / l, tz / l]);
    }
    if (!U) U = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const base = this.count; const rowLen = n + 1; let dist = 0;
    for (let i = 0; i < N; i++) {
      const t = T[i];
      let d = U[0] * t[0] + U[1] * t[1] + U[2] * t[2];
      let ux = U[0] - d * t[0], uy = U[1] - d * t[1], uz = U[2] - d * t[2]; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul; U = [ux, uy, uz];
      const vx = t[1] * uz - t[2] * uy, vy = t[2] * ux - t[0] * uz, vz = t[0] * uy - t[1] * ux;
      const f = i / (N - 1);
      const rr = typeof radii === 'function' ? radii(f) : (Array.isArray(radii) ? radii[i] : radii);
      const ra = Array.isArray(rr) ? rr[0] : rr, rb = Array.isArray(rr) ? rr[1] : rr;
      if (i > 0) dist += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
      for (let k = 0; k <= n; k++) {
        const a = TAU * k / n, c = Math.cos(a), sn = Math.sin(a);
        const mod = o.ring ? o.ring(a, f) : 1;
        const shade = o.ringS ? o.ringS(a, f) : 1;
        const px = path[i][0] + (ux * c * ra + vx * sn * rb) * mod, py = path[i][1] + (uy * c * ra + vy * sn * rb) * mod, pz = path[i][2] + (uz * c * ra + vz * sn * rb) * mod;
        const nx = ux * c / (ra || 1) + vx * sn / (rb || 1), ny = uy * c / (ra || 1) + vy * sn / (rb || 1), nz = uz * c / (ra || 1) + vz * sn / (rb || 1);
        this.v(px, py, pz, nx, ny, nz, k / n * Math.max(ra, rb) * TAU, dist, s * shade);
      }
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < n; k++) {
      const a = base + i * rowLen + k, b = a + 1, c = a + rowLen + 1, d = a + rowLen;
      this.quad(a, b, c, d);
    }
    if (o.capEnd !== false) { const c = this.v(path[N - 1][0], path[N - 1][1], path[N - 1][2], T[N - 1][0], T[N - 1][1], T[N - 1][2], 0, 0, s); const b2 = base + (N - 1) * rowLen; const ids = []; for (let k = 0; k < n; k++) ids.push(b2 + k); for (let k = 0; k < n; k++) this.tri(c, ids[k], b2 + k + 1); }
    if (o.capStart) { const c = this.v(path[0][0], path[0][1], path[0][2], -T[0][0], -T[0][1], -T[0][2], 0, 0, s); for (let k = 0; k < n; k++) this.tri(c, base + k + 1, base + k); }
    return this;
  }
  // parametric grid: fn(u,v) -> [x,y,z, shade?]; winding u x v = front. Smooth normals from the grid.
  grid(fn, nu, nv, o = {}) {
    const pts = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pts.push(fn(i / nu, j / nv));
    const id = (i, j) => j * (nu + 1) + i, base = this.count, flip = o.flip ? -1 : 1, s = o.s === undefined ? 1 : o.s;
    const wrapU = !!o.wrapU;
    let vLen = 0;
    for (let j = 0; j <= nv; j++) {
      if (j > 0) { const a = pts[id(0, j - 1)], b = pts[id(0, j)]; vLen += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
      // o.metric: measure across from the middle of each row, so a converging surface keeps true scale instead of a fan of streaks
      let uLen = 0;
      if (o.metric) { let total = 0; for (let i = 1; i <= nu; i++) { const a = pts[id(i - 1, j)], b = pts[id(i, j)]; total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); } uLen = -total / 2; }
      for (let i = 0; i <= nu; i++) {
        if (i > 0) { const a = pts[id(i - 1, j)], b = pts[id(i, j)]; uLen += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
        const iP = wrapU ? (i === 0 ? nu - 1 : i - 1) : Math.max(0, i - 1), iN = wrapU ? (i === nu ? 1 : i + 1) : Math.min(nu, i + 1);
        const A = pts[id(iP, j)], B = pts[id(iN, j)], C = pts[id(i, Math.max(0, j - 1))], D = pts[id(i, Math.min(nv, j + 1))];
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = D[0] - C[0], vy = D[1] - C[1], vz = D[2] - C[2];
        const p = pts[id(i, j)];
        const uvU = o.boxUV ? undefined : uLen, uvV = o.boxUV ? undefined : vLen;
        this.v(p[0], p[1], p[2], flip * (uy * vz - uz * vy), flip * (uz * vx - ux * vz), flip * (ux * vy - uy * vx), uvU, uvV, s * (p[3] === undefined ? 1 : p[3]));
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + id(i, j), b = base + id(i + 1, j), c = base + id(i + 1, j + 1), d = base + id(i, j + 1);
      if (flip > 0) this.quad(a, b, c, d); else this.quad(a, d, c, b);
    }
    return this;
  }
  // 2D outline with holes, extruded along Z from z0 to z1 (front +Z). Reveal sides included.
  slab(outline, holes = [], z0 = 0, z1 = 0.1, o = {}) {
    const so = area2(outline) > 0 ? outline : outline.slice().reverse();
    const hs = holes.map((h) => (area2(h) < 0 ? h : h.slice().reverse()));
    const tris = triangulate(so, hs);
    const all = so.concat(...hs);
    const sf = o.sf === undefined ? 1 : o.sf, sb = o.sb === undefined ? 1 : o.sb, sr = o.sr === undefined ? 0.72 : o.sr;
    if (!o.noFront) { const ids = all.map((p) => this.v(p[0], p[1], z1, 0, 0, 1, undefined, undefined, sf)); for (const t of tris) this.tri(ids[t[0]], ids[t[1]], ids[t[2]]); }
    if (!o.noBack) { const ids = all.map((p) => this.v(p[0], p[1], z0, 0, 0, -1, undefined, undefined, sb)); for (const t of tris) this.tri(ids[t[0]], ids[t[2]], ids[t[1]]); }
    const side = (loop, s) => {
      const L = loop.length; if (o.noSides) return;
      for (let i = 0; i < L; i++) {
        const p = loop[i], q = loop[(i + 1) % L]; const dx = q[0] - p[0], dy = q[1] - p[1];
        const l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l;
        const a = this.v(p[0], p[1], z0, nx, ny, 0, undefined, undefined, s), b = this.v(q[0], q[1], z0, nx, ny, 0, undefined, undefined, s), c = this.v(q[0], q[1], z1, nx, ny, 0, undefined, undefined, s), d = this.v(p[0], p[1], z1, nx, ny, 0, undefined, undefined, s);
        this.quad(a, b, c, d);
      }
    };
    if (!o.noOuterSides) side(so, o.so === undefined ? 0.85 : o.so);
    hs.forEach((h) => side(h, sr));
    return this;
  }
  // Vertical prism from an (x,z) polygon
  prism(pts, y0, y1, o = {}) {
    let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
    const L = A > 0 ? pts : pts.slice().reverse(), s = o.s === undefined ? 1 : o.s, st = o.st === undefined ? s : o.st, n = L.length, k = o.topScale === undefined ? 1 : o.topScale;
    let cx = 0, cz = 0; for (const p of L) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    const top = L.map((p) => [cx + (p[0] - cx) * k, cz + (p[1] - cz) * k]);
    for (let i = 0; i < n; i++) {
      const p = L[i], q = L[(i + 1) % n], P2 = top[i], Q2 = top[(i + 1) % n];
      this.face([[q[0], y0, q[1], s], [p[0], y0, p[1], s], [P2[0], y1, P2[1], st], [Q2[0], y1, Q2[1], st]]);
    }
    if (!o.noTop && k > 1e-4) { const c = top.map((p) => this.v(p[0], y1, p[1], 0, 1, 0, undefined, undefined, st)); for (let i = 1; i < n - 1; i++) this.tri(c[0], c[i + 1], c[i]); }
    if (o.bot) { const c = L.map((p) => this.v(p[0], y0, p[1], 0, -1, 0, undefined, undefined, s * 0.6)); for (let i = 1; i < n - 1; i++) this.tri(c[0], c[i], c[i + 1]); }
    return this;
  }
  // Welds vertices that agree in every attribute: sweeps and lathes otherwise export many duplicates
  // Split every edge longer than L. The rule depends only on the edge, so neighbours split alike and no crack opens.
  // Long walls need vertices for the baked light to land on.
  tess(L) {
    this.weld();
    const L2 = L * L, { P: p, N: nn, UV: uv, C: c } = this;
    for (let pass = 0; pass < 7; pass++) {
      const mid = new Map(), I2 = [], I0 = this.I; let changed = false;
      const long = (a, b) => { const x = p[a * 3] - p[b * 3], y = p[a * 3 + 1] - p[b * 3 + 1], z = p[a * 3 + 2] - p[b * 3 + 2]; return x * x + y * y + z * z > L2; };
      const midOf = (a, b) => {
        const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * 4194304 + hi; let m = mid.get(key);
        if (m === undefined) {
          m = p.length / 3; mid.set(key, m);
          p.push((p[lo * 3] + p[hi * 3]) / 2, (p[lo * 3 + 1] + p[hi * 3 + 1]) / 2, (p[lo * 3 + 2] + p[hi * 3 + 2]) / 2);
          let nx = nn[lo * 3] + nn[hi * 3], ny = nn[lo * 3 + 1] + nn[hi * 3 + 1], nz = nn[lo * 3 + 2] + nn[hi * 3 + 2]; const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nn.push(nx / l, ny / l, nz / l);
          uv.push((uv[lo * 2] + uv[hi * 2]) / 2, (uv[lo * 2 + 1] + uv[hi * 2 + 1]) / 2);
          c.push((c[lo * 3] + c[hi * 3]) >> 1, (c[lo * 3 + 1] + c[hi * 3 + 1]) >> 1, (c[lo * 3 + 2] + c[hi * 3 + 2]) >> 1);
        }
        return m;
      };
      for (let t = 0; t < I0.length; t += 3) {
        const a = I0[t], b = I0[t + 1], d = I0[t + 2], ab = long(a, b), bd = long(b, d), da = long(d, a);
        if (!ab && !bd && !da) { I2.push(a, b, d); continue; }
        changed = true;
        const m1 = ab ? midOf(a, b) : -1, m2 = bd ? midOf(b, d) : -1, m3 = da ? midOf(d, a) : -1;
        if (ab && bd && da) I2.push(a, m1, m3, m1, b, m2, m3, m2, d, m1, m2, m3);
        else if (ab && bd) I2.push(a, m1, d, m1, m2, d, m1, b, m2);
        else if (bd && da) I2.push(b, m2, a, m2, m3, a, m2, d, m3);
        else if (da && ab) I2.push(d, m3, b, m3, m1, b, m3, a, m1);
        else if (ab) I2.push(a, m1, d, m1, b, d);
        else if (bd) I2.push(b, m2, a, m2, d, a);
        else I2.push(d, m3, b, m3, a, b);
      }
      this.I = I2;
      if (!changed) break;
    }
    this.geo = null;
    return this;
  }
  weld() {
    if (this.welded) return this;
    const n = this.count, map = new Map(), remap = new Int32Array(n), P2 = [], N2 = [], U2 = [], C2 = [];
    const { P: p, N: nn, UV: uv, C: c } = this, col = !this.noColor;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, i2 = i * 2;
      const key = Math.round(p[i3] * 4000) + ',' + Math.round(p[i3 + 1] * 4000) + ',' + Math.round(p[i3 + 2] * 4000) + ',' + Math.round(nn[i3] * 90) + ',' + Math.round(nn[i3 + 1] * 90) + ',' + Math.round(nn[i3 + 2] * 90) + ',' + Math.round(uv[i2] * 800) + ',' + Math.round(uv[i2 + 1] * 800) + (col ? ',' + c[i3] + ',' + c[i3 + 1] + ',' + c[i3 + 2] : '');
      let k = map.get(key);
      if (k === undefined) { k = P2.length / 3; map.set(key, k); P2.push(p[i3], p[i3 + 1], p[i3 + 2]); N2.push(nn[i3], nn[i3 + 1], nn[i3 + 2]); U2.push(uv[i2], uv[i2 + 1]); C2.push(c[i3], c[i3 + 1], c[i3 + 2]); }
      remap[i] = k;
    }
    const I2 = [];
    for (let t = 0; t < this.I.length; t += 3) {
      const a = remap[this.I[t]], b = remap[this.I[t + 1]], d = remap[this.I[t + 2]];
      if (a !== b && b !== d && a !== d) I2.push(a, b, d);
    }
    this.P = P2; this.N = N2; this.UV = U2; this.C = C2; this.I = I2; this.welded = true;
    return this;
  }
  toGeo() {
    if (this.geo) return this.geo;
    this.weld();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.UV), 2));
    if (!this.noColor) g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.C), 3, true));
    g.setIndex(new THREE.BufferAttribute(this.count > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
    this.geo = g;
    return g;
  }
}
function area2(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
function triangulate(contour, holes = []) {
  const V = (p) => new THREE.Vector2(p[0], p[1]);
  const tris = THREE.ShapeUtils.triangulateShape(contour.map(V), holes.map((h) => h.map(V)));
  const all = contour.concat(...holes);
  return tris.map((t) => {
    const a = all[t[0]], b = all[t[1]], c = all[t[2]];
    const s = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return s >= 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]];
  });
}

// ---- 2D curves -------------------------------------------------------------------
// Two-centred pointed arc: span w, rise h, base y=0 centred at x=0, from left spring to right spring
function pointedArc(w, h, n = 8) {
  const c = (h * h - w * w / 4) / w, r = c + w / 2, pts = [];
  const a0 = PI, a1 = Math.atan2(h, -c);
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([c + r * Math.cos(a), r * Math.sin(a)]); }
  for (let i = n - 1; i >= 0; i--) { const a = lerp(a0, a1, i / n); pts.push([-(c + r * Math.cos(a)), r * Math.sin(a)]); }
  pts[n][0] = 0;
  return pts;
}
// CCW outline of a pointed opening: width w, sill y0, spring ys, rise h
function archOutline(w, y0, ys, h, n = 8) {
  const arc = pointedArc(w, h, n).map((p) => [p[0], p[1] + ys]);
  arc.reverse(); // right spring -> apex -> left spring (CCW)
  return [[-w / 2, y0], [w / 2, y0], ...arc];
}
const ringPts = (cx, cy, r, n = 24, ph = 0) => { const a = []; for (let i = 0; i < n; i++) { const t = ph + TAU * i / n; a.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return a; };
const ofsY = (pts, dy) => pts.map((p) => [p[0], p[1] + dy]);
const ofsXY = (pts, dx, dy) => pts.map((p) => [p[0] + dx, p[1] + dy]);

// ---- Sections (a, b, shade?) closed CCW ------------------------------------------
// Moulded arch section with convex rolls: a=0 at the soffit, grows outward; symmetric in b.
function rollSection(w, d, rolls = 3, amp = 0.07, seg = 3) {
  const half = [];
  const A = [w, d / 2], B = [0, d * 0.12], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
  for (let k = 0; k < rolls; k++) for (let i = 0; i < seg; i++) {
    const t = (k + i / seg) / rolls, ph = i / seg;
    const off = amp * Math.pow(Math.sin(PI * ph), 0.7), sh = 0.68 + 0.32 * Math.sin(PI * ph);
    half.push([lerp(A[0], B[0], t) + off * dy / l, lerp(A[1], B[1], t) - off * dx / l, sh]);
  }
  half.push([B[0], B[1], 0.8]);
  const back = half.slice().reverse().map((p) => [p[0], -p[1], p[2]]);
  return [[w, -d / 2, 1], ...half, ...back.slice(0, -1)];
}
// Cheapest moulded bar: a hexagon, smooth enough to read as a roll at distance
function hexBar(w, d) { const a = w / 2, b = d / 2; return [[a, -b * 0.5], [a, b * 0.5], [0, b], [-a, b * 0.5], [-a, -b * 0.5], [0, -b]]; }
// Simple chamfered bar centred on the path, width w (in plane), depth d
function barSection(w, d, ch = 0.25) {
  const a = w / 2, b = d / 2, c = Math.min(a, b) * ch * 2;
  return [[-a, -b + c], [-a + c, -b], [a - c, -b], [a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c]];
}
// Tracery bar with a roll on the front and back faces
function traceryBar(w, d) {
  const a = w / 2, b = d / 2, s = [];
  for (let i = 0; i <= 4; i++) { const t = PI * i / 4; s.push([a * Math.cos(t), b * 0.62 + b * 0.38 * Math.sin(t)]); }
  for (let i = 0; i <= 4; i++) { const t = PI * i / 4; s.push([-a * Math.cos(t), -b * 0.62 - b * 0.38 * Math.sin(t)]); }
  return s;
}
// String course / cornice projecting along +b from the wall at b=0, height h (a)
function stringSection(h = 0.3, out = 0.25) {
  return [[-h / 2, 0], [-h / 2, out * 0.3, 0.55], [-h * 0.25, out * 0.62, 0.7], [-h * 0.02, out * 0.72, 0.85], [h * 0.12, out, 1], [h * 0.2, out * 0.98, 1], [h / 2, out * 0.05, 1], [h / 2, 0]].reverse();
}

const spline = (pts, sub = 4) => { // Catmull-Rom through 3D points
  const out = [], n = pts.length, g = (i) => pts[clamp(i, 0, n - 1)];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sub; k++) {
    const t = k / sub, p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), v = [];
    for (let c = 0; c < 3; c++) v.push(0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t * t));
    out.push(v);
  }
  out.push(pts[n - 1]);
  return out;
};
const blob = (b, c, r, nu = 8, nv = 6, sh = 1) => b.grid((u, v) => {
  const ph = -PI + TAU * u, la = -PI / 2 + PI * v;
  return [c[0] + r[0] * Math.cos(la) * Math.cos(ph), c[1] + r[1] * Math.sin(la), c[2] + r[2] * Math.cos(la) * Math.sin(ph), sh];
}, nu, nv, { flip: true, wrapU: true });

// ==================================================================================
// MATERIALS: procedural PBR, with height-derived normals
// ==================================================================================
const MAT = {};
const TILE = { ashlar: 8, fine: 2, lead: 4, pave: 2.4, oak: 1.2, iron: 0.8, gold: 1 };

function ashlarOps(rng, S, tone, joint, stains) {
  // Irregular coursed blocks; shared between albedo and height by replaying the same rng seed
  const ops = [], rows = 7, rowH = Math.floor(S / rows);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH; let x = Math.round(rng() * S / 5) % S;
    const n = 3 + Math.floor(rng() * 2), widths = [];
    for (let i = 0; i < n; i++) widths.push(0.7 + rng() * 0.6);
    const tot = widths.reduce((a, c) => a + c, 0);
    for (let i = 0; i < n; i++) {
      const w = Math.round(widths[i] / tot * S), dv = rng(), a = rng();
      const col = tone[Math.floor(dv * tone.length)];
      const x0 = x % S, wr = Math.min(w, S - x0), op = Math.round(10 + a * 34);
      ops.push({ op: 'paint', shape: { kind: 'rectangle', x: x0, y: y0, width: wr, height: rowH }, rgba: [col[0], col[1], col[2], 255], opacity: op });
      if (wr < w) ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: y0, width: w - wr, height: rowH }, rgba: [col[0], col[1], col[2], 255], opacity: op });
      x += w;
      ops.push({ op: 'paint', shape: { kind: 'line', from: [x % S, y0], to: [x % S, y0 + rowH], width: joint.w }, rgba: joint.rgba, opacity: joint.op });
    }
    ops.push({ op: 'paint', shape: { kind: 'line', from: [0, y0], to: [S, y0], width: joint.w }, rgba: joint.rgba, opacity: joint.op });
  }
  return ops.slice(0, 58).concat(stains || []);
}

// Regions of the decal sheet as fractions [u0, v0, u1, v1]; a streak's top edge is at v0
const DECAL_UV = { streak: [0, 0, 0.5, 0.5], soft: [0.5, 0, 1, 0.25], soot: [0.5, 0.25, 1, 0.5], ground: [0, 0.5, 0.5, 1], lichen: [0.75, 0.5, 1, 0.75], drip: [0.5, 0.75, 1, 1] };
async function makeMaterials() {
  const S = 512, repeat = { minFilter: 'linear-mipmap-linear', magFilter: 'linear', wrapS: 'repeat', wrapT: 'repeat' };
  const noise = (a, b, scale, oct, seed, opacity, blend) => ({ op: 'noise', colorA: a, colorB: b, scale, octaves: oct, seed, opacity, blend: blend || 'normal' });
  const spec3 = (usage, base, ops, size = S) => ({ schemaVersion: 3, width: size, height: size, usage, operations: [{ op: 'legacy-v2', spec: { schemaVersion: 2, size, usage, layers: base } }, ...ops] });
  const v3 = (usage, base, ops, size = S) => proceduralTexture(spec3(usage, base, ops, size));
  const stamps = (shape, rgba, count, seed, opacity, area) => ({ op: 'stamps', shape, rgba, count, seed, area: area || { x: 0, y: 0, width: S, height: S }, opacity });
  const ell = (w, h) => ({ kind: 'ellipse', x: 0, y: 0, width: w, height: h });
  const tool = (dx, dy, w = 1) => ({ kind: 'line', from: [0, 0], to: [dx, dy], width: w }); // a stroke of the claw chisel

  // ---- Weathered ashlar: 8 m repeat, every block its own stone. Colour varies by block, chisel marks
  // in the relief instead of round pits, rain and soot already sunk into the surface ----
  const quads = [[0, 0], [S, 0], [0, S], [S, S]];
  const ashAlbedo = (q, seed) => spec3('albedo', [{ op: 'solid', color: 0xb9ad96 }, noise(0x968b76, 0xcdc3ad, 3, 2, seed + 1, 0.85), noise(0x7f7666, 0xc6bca6, 17, 2, seed + 2, 0.4)],
    ashlarOps(mkRng(seed), S, [[78, 72, 60], [226, 216, 190], [158, 132, 92], [122, 128, 124]], { w: 2, rgba: [70, 64, 54, 255], op: 225 }, [
      stamps(ell(20, 70), [70, 66, 56, 255], 26, seed + 3, 24), stamps(ell(40, 26), [52, 56, 46, 255], 16, seed + 4, 20), stamps(tool(11, 6), [96, 88, 74, 255], 110, seed + 5, 34),
    ]));
  const ashHeight = (q, seed) => spec3('albedo', [{ op: 'solid', color: 0xb4b4b4 }, noise(0x8c8c8c, 0xd0d0d0, 11, 2, seed + 6, 0.7)],
    ashlarOps(mkRng(seed), S, [[126, 126, 126], [214, 214, 214], [170, 170, 170], [150, 150, 150]], { w: 3, rgba: [12, 12, 12, 255], op: 255 }, [
      stamps(tool(14, 8), [86, 86, 86, 255], 120, seed + 8, 90), stamps(tool(-12, 9), [226, 226, 226, 255], 110, seed + 9, 70),
    ]));
  const atlasOf = async (usage, make, seeds) => textureAtlas({ schemaVersion: 1, width: 2 * S, height: 2 * S, pack: { edge: 2048, gutter: 0 }, usage, sampler: repeat, regions: quads.map((p, i) => ({ name: 'q' + i, content: { x: p[0], y: p[1], width: S, height: S }, gutter: 0, source: { kind: 'procedural', spec: make(p, seeds[i]) } })) });
  const ashA = await atlasOf('albedo', ashAlbedo, [77, 131, 211, 307]);
  const ashH = await atlasOf('albedo', ashHeight, [77, 131, 211, 307]);
  MAT.ashlar = pbrMaterial({ albedo: ashA, normal: normalMapFromHeight(ashH, { strength: 2.6 }), roughness: 0.94, metalness: 0, name: 'Limestone_Ashlar' });

  // Dressed stone: no joints; chisel strokes and mottling live in the colour, because a normal map here would
  // add 16 bytes of tangent to every vertex of every moulding
  const finA = v3('albedo', [{ op: 'solid', color: 0xc2b7a0 }, noise(0xb5ab95, 0xcdc4af, 5, 3, 31, 0.8), noise(0xa79d88, 0xcbc2ad, 23, 3, 32, 0.34)], [
    stamps(tool(9, 5), [120, 112, 96, 255], 130, 33, 34), stamps(tool(-7, 6), [214, 206, 188, 255], 80, 34, 30),
  ]);
  MAT.fine = pbrMaterial({ albedo: finA, roughness: 0.92, metalness: 0, name: 'Limestone_Dressed' });
  const figTone = (name, r, g, b) => { const m = pbrMaterial({ albedo: finA, roughness: 0.92, metalness: 0, name }); m.color.setRGB(r, g, b); m.vertexColors = true; return m; };
  MAT.figure = figTone('Sculpture_Sunlit', 0.86, 0.8, 0.68);       // figures take the same stone under different light
  MAT.figureHalf = figTone('Sculpture_HalfShade', 0.5, 0.49, 0.47);
  MAT.figureDeep = figTone('Sculpture_DeepShade', 0.3, 0.31, 0.34);
  MAT.figureIn = figTone('Sculpture_Interior', 0.62, 0.53, 0.42);

  // ---- Patinated lead: 1 m sheets lapped every 2.5 m, each sheet its own tone, runoff streaks and white bloom ----
  const LS = 512, leadOps = (tones, lapOp, seamOp, rngSeed) => {
    const r = mkRng(rngSeed), ops = [], cols = 4, W = LS / cols, H = LS / 2.5 | 0;
    for (let c = 0; c < cols; c++) {
      const off = c % 2 ? H / 2 | 0 : 0;
      for (let k = -1; k < 3; k++) {
        const y = Math.max(0, k * H + off), yb = Math.min(LS, (k + 1) * H + off);
        if (yb <= y) continue;
        const t = tones[Math.floor(r() * tones.length)];
        ops.push({ op: 'paint', shape: { kind: 'rectangle', x: c * W, y, width: W, height: yb - y }, rgba: [t[0], t[1], t[2], 255], opacity: 40 + Math.floor(r() * 90) });
        if (yb < LS) ops.push({ op: 'paint', shape: { kind: 'line', from: [c * W, yb], to: [(c + 1) * W, yb], width: lapOp.w }, rgba: lapOp.rgba, opacity: lapOp.op });
      }
      ops.push({ op: 'paint', shape: { kind: 'line', from: [c * W, 0], to: [c * W, LS], width: seamOp.w }, rgba: seamOp.rgba, opacity: seamOp.op });
    }
    return ops;
  };
  const leadArea = { x: 0, y: 0, width: LS, height: LS };
  const leadA = v3('albedo', [{ op: 'solid', color: 0x6f7a7e }, noise(0x566166, 0x8d9896, 5, 2, 41, 0.75)], [
    ...leadOps([[86, 98, 102], [118, 130, 130], [66, 76, 82], [140, 150, 146], [100, 104, 100]], { w: 2, rgba: [36, 42, 46, 255], op: 220 }, { w: 2, rgba: [40, 46, 50, 255], op: 180 }, 44),
    stamps({ kind: 'rectangle', x: 0, y: 0, width: 5, height: 85 }, [208, 214, 206, 255], 90, 45, 30, leadArea), stamps({ kind: 'rectangle', x: 0, y: 0, width: 3, height: 130 }, [34, 40, 44, 255], 80, 46, 42, leadArea), stamps(ell(23, 15), [176, 186, 176, 255], 60, 47, 24, leadArea),
  ], LS);
  const leadH = v3('albedo', [{ op: 'solid', color: 0x8c8c8c }, noise(0x848484, 0x989898, 9, 2, 48, 0.8)], [
    ...leadOps([[140, 140, 140], [132, 132, 132], [148, 148, 148]], { w: 3, rgba: [232, 232, 232, 255], op: 255 }, { w: 5, rgba: [250, 250, 250, 255], op: 255 }, 44),
    stamps(ell(17, 11), [116, 116, 116, 255], 110, 49, 60, leadArea),
  ], LS);
  MAT.lead = pbrMaterial({ albedo: leadA, normal: normalMapFromHeight(leadH, { strength: 3 }), roughness: 0.6, metalness: 0.5, name: 'Lead_Patinated' });

  // ---- Gold leaf: a bright warm metal that still reads as gold where the environment is dull ----
  const gldA = v3('albedo', [{ op: 'solid', color: 0xffc644 }, noise(0xf0a830, 0xffd764, 14, 2, 51, 0.6)], [stamps(ell(5, 4), [176, 110, 30, 255], 60, 52, 90, { x: 0, y: 0, width: 128, height: 128 })], 128);
  MAT.gold = pbrMaterial({ albedo: gldA, roughness: 0.25, metalness: 1, name: 'Gilding' });
  MAT.gold.emissive.setRGB(1, 0.6, 0.14); MAT.gold.emissiveIntensity = 0.13;

  // Aged oak and forged iron from the approved scanned sets
  MAT.oak = pbrMaterial({ albedo: await loadApprovedTexture('kiln.texture.oak-veneer-albedo.v1'), normal: await loadApprovedTexture('kiln.texture.oak-veneer-normal.v1'), metallicRoughness: await loadApprovedTexture('kiln.texture.oak-veneer-arm.v1'), name: 'Oak_Aged' });
  MAT.iron = pbrMaterial({ albedo: await loadApprovedTexture('kiln.texture.rusted-metal-albedo.v1'), metallicRoughness: await loadApprovedTexture('kiln.texture.rusted-metal-arm.v1'), name: 'Iron_Forged' });

  // Paving: worn limestone and grey marble, polished by seven centuries of feet
  const pavA = proceduralTexture({ schemaVersion: 2, size: 512, usage: 'albedo', layers: [{ op: 'checker', colorA: 0xd2cab6, colorB: 0x8c8678, squares: 4 }, noise(0x7c766a, 0xe0dac8, 9, 3, 61, 0.42), { op: 'bricks', brick: 0xffffff, mortar: 0x5a564e, rows: 4, cols: 4, mortarWidth: 0.018, stagger: 0, blend: 'multiply' }] });
  const pavH = proceduralTexture({ schemaVersion: 2, size: 512, usage: 'albedo', layers: [{ op: 'solid', color: 0xc8c8c8 }, noise(0xb0b0b0, 0xdcdcdc, 15, 3, 62, 0.5), { op: 'bricks', brick: 0xffffff, mortar: 0x202020, rows: 4, cols: 4, mortarWidth: 0.018, stagger: 0, blend: 'multiply' }] });
  MAT.pave = pbrMaterial({ albedo: pavA, normal: normalMapFromHeight(pavH, { strength: 1.8 }), roughness: 0.42, metalness: 0, name: 'Paving_Worn' });
  for (const k of ['ashlar', 'fine', 'oak', 'iron', 'pave', 'lead']) MAT[k].vertexColors = true;

  // ---- Weathering decals: rain streaks, soot, ground damp and moss, cast shadow. Alpha-blended overlays
  // give crisp detail on walls that have very few vertices ----
  const DS = 256, rd = mkRng(99), polyStreak = (x, y0, L, w, rgb, op) => ({ op: 'paint', shape: { kind: 'polygon', points: [[x, y0], [x + w, y0], [x + w * 0.8 + 1, y0 + L * 0.45], [x + w * 0.55 + 1, y0 + L * 0.8], [x + w * 0.45, y0 + L], [x + w * 0.3, y0 + L * 0.75], [x + w * 0.15, y0 + L * 0.4]].map((p) => [Math.round(p[0]), Math.round(p[1])]) }, rgba: [rgb[0], rgb[1], rgb[2], 255], opacity: op });
  const streakOps = [], dripOps = [];
  for (let i = 0; i < 44; i++) { const x = Math.floor(rd() * (DS - 9)), dark = rd() > 0.26, L = 65 + Math.floor(rd() * 185), w = 2 + Math.floor(rd() * 7); streakOps.push(polyStreak(x, 0, Math.min(L, DS - 2), w, dark ? [44, 40, 34] : [176, 170, 150], dark ? 40 + Math.floor(rd() * 70) : 26 + Math.floor(rd() * 30))); }
  for (let i = 0; i < 12; i++) streakOps.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: DS, height: 3 + i * 2 }, rgba: [34, 32, 28, 255], opacity: 12 });
  for (let i = 0; i < 38; i++) { const x = Math.floor(rd() * (DS - 8)), L = 20 + Math.floor(rd() * 100), w = 1 + Math.floor(rd() * 6); dripOps.push(polyStreak(x, 0, Math.min(L, 125), w, [38, 36, 30], 44 + Math.floor(rd() * 70))); }
  for (let i = 0; i < 10; i++) dripOps.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: DS, height: 2 + i * 2 }, rgba: [28, 26, 24, 255], opacity: 16 });
  const softOps = []; for (let i = 0; i < 30; i++) softOps.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: DS, height: Math.max(1, Math.round(128 * Math.pow(1 - i / 30, 1.5))) }, rgba: [18, 18, 24, 255], opacity: 15 });
  const dampOps = [];
  for (let i = 0; i < 18; i++) { const h = Math.round(DS * Math.pow((i + 1) / 18, 1.6)); dampOps.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: DS - h, width: DS, height: h }, rgba: i % 3 ? [38, 42, 28, 255] : [50, 58, 34, 255], opacity: 13 }); }
  dampOps.push(stamps(ell(13, 8), [66, 84, 42, 255], 110, 71, 46, { x: 0, y: 120, width: DS, height: 134 }), stamps(ell(5, 28), [30, 32, 24, 255], 80, 72, 64, { x: 0, y: 60, width: DS, height: 190 }), stamps(ell(3, 3), [120, 132, 76, 255], 60, 73, 90, { x: 0, y: 100, width: DS, height: 150 }));
  const clear = [0, 0, 0, 0];
  const dreg = (name, x, y, w, h, ops, bg) => ({ name, content: { x, y, width: w, height: h }, gutter: 0, source: { kind: 'procedural', spec: { schemaVersion: 3, width: w, height: h, usage: 'albedo', background: bg || clear, operations: ops } } });
  const decalTex = await textureAtlas({ schemaVersion: 1, width: 512, height: 512, usage: 'albedo', regions: [
    dreg('streak', 0, 0, DS, DS, streakOps.slice(0, 64)),
    dreg('soft', 256, 0, DS, 128, softOps),
    dreg('soot', 256, 128, DS, 128, [stamps(ell(35, 27), [24, 22, 20, 255], 150, 74, 20, { x: 20, y: 15, width: 200, height: 90 }), stamps(ell(13, 11), [18, 16, 14, 255], 90, 75, 36, { x: 45, y: 25, width: 160, height: 75 })]),
    dreg('ground', 0, 256, DS, DS, dampOps),
    dreg('lichen', 384, 256, 128, 128, [stamps(ell(7, 5), [172, 164, 92, 255], 110, 76, 90, { x: 5, y: 5, width: 115, height: 115 }), stamps(ell(4, 3), [176, 120, 54, 255], 80, 77, 96, { x: 5, y: 5, width: 115, height: 115 })]),
    dreg('drip', 256, 384, DS, 128, dripOps.slice(0, 64)),
  ] });
  MAT.decal = pbrMaterial({ albedo: decalTex, roughness: 1, metalness: 0, alphaMode: 'blend', name: 'Weathering_Decals' });
  MAT.decal.depthWrite = false;

  await makeGlassMaterials();

  // ---- The light of the windows on the floor: a soft shape, painted very small and enlarged, so its edges melt ----
  const poolOps = [], PW = 32, PH = 64, poolCols = [[196, 40, 36], [60, 74, 176], [206, 150, 50], [176, 34, 34], [216, 170, 80], [176, 44, 50]];
  poolCols.forEach((c, i) => poolOps.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 5, height: 7 }, rgba: [c[0], c[1], c[2], 255], count: 34, seed: 5150 + i * 7, area: { x: 0, y: 0, width: PW, height: PH }, opacity: 150 }));
  // window silhouette: pointed head at the top of the image, a shadow down the middle where the mullion stands
  const silh = pointedArc(PW - 4, 20, 6).map((p) => [Math.round(p[0] + PW / 2), Math.round(21 - p[1])]);
  poolOps.push({ op: 'mask', shape: { kind: 'polygon', points: [[2, PH - 1], ...silh, [PW - 2, PH - 1]] } });
  poolOps.push({ op: 'mask', shape: { kind: 'rectangle', x: PW / 2 - 1, y: 8, width: 2, height: PH - 8 }, invert: true });
  const poolSpec = (usage) => ({ schemaVersion: 3, width: PW, height: PH, usage, background: [120, 32, 44, 180], operations: poolOps });
  MAT.pool = pbrMaterial({ albedo: proceduralTexture(poolSpec('albedo')), emissive: proceduralTexture(poolSpec('emissive')), emissiveIntensity: 0.7, roughness: 0.9, metalness: 0, alphaMode: 'blend', name: 'StainedGlass_LightPool' });
  MAT.pool.opacity = 0.3;
  MAT.pool.depthWrite = false;
}

// ---- Atlas of the glass painter: pot-metal colours, painted drapery, drawn faces, ornament ------
const GL = { w: 1536, h: 1280, cell: 256, small: 128, fam: {}, tile: {}, face: {}, orn: {}, ground: {} };
// [name, base, light, dark]: real pot-metal glass is deep, and no two sheets match
const GLASS_FAMILIES = [
  ['ruby', [118, 6, 14], [172, 14, 22], [66, 3, 10]], ['cobalt', [10, 20, 104], [20, 44, 160], [5, 10, 62]], ['azure', [16, 54, 128], [36, 90, 170], [8, 32, 88]], ['emerald', [6, 62, 38], [14, 96, 54], [3, 38, 24]],
  ['green', [42, 74, 24], [74, 106, 34], [24, 48, 14]], ['gold', [178, 116, 16], [218, 158, 36], [130, 78, 8]], ['amber', [146, 72, 10], [186, 106, 20], [98, 44, 6]], ['purple', [58, 14, 80], [90, 26, 114], [34, 6, 50]],
  ['flesh', [186, 140, 104], [206, 164, 128], [156, 110, 80]], ['white', [146, 150, 122], [182, 184, 154], [112, 118, 94]], ['brown', [70, 40, 18], [100, 58, 28], [46, 24, 12]],
  ['teal', [8, 62, 70], [16, 92, 100], [5, 38, 46]], ['night', [5, 8, 40], [10, 16, 62], [2, 4, 24]],
];
const GLASS_ALIAS = { rubyLt: 'ruby', crimson: 'ruby', rose: 'ruby', sky: 'azure', pale: 'white', pearl: 'white', bone: 'white', grey: 'white', yellow: 'gold', tan: 'amber', fleshDk: 'flesh', violet: 'purple', olive: 'green', forest: 'emerald', hair: 'brown', paint: 'lead' };
// Mosaic grounds, each a square of painted lozenges: [name, colour A, colour B, jewel]
const GLASS_GROUNDS = [['rc', 'ruby', 'cobalt', 'gold'], ['cr', 'cobalt', 'ruby', 'white'], ['eg', 'emerald', 'ruby', 'gold'], ['pr', 'purple', 'cobalt', 'gold'], ['tc', 'teal', 'ruby', 'white']];
function groundOps(A, B, J, seed) { // lozenges 64 px across, a lead round each, a jewel on some crossings
  const r = mkRng(seed * 19 + 5), ops = [], cl = (v) => Math.max(0, Math.min(256, v));
  for (let b = 0; b <= 8; b++) for (let a = 0; a <= 8; a++) {
    if ((a + b) % 2 === 0) continue;
    const f = b % 2 ? A : B, x = a * 32, y = b * 32, t = r(), c = t < 0.45 ? f[1] : t < 0.8 ? f[2] : f[3];
    ops.push({ op: 'paint', shape: { kind: 'polygon', points: [[cl(x), cl(y - 32)], [cl(x + 32), cl(y)], [cl(x), cl(y + 32)], [cl(x - 32), cl(y)]] }, rgba: [c[0], c[1], c[2], 255], opacity: 255 });
  }
  for (let k = -3; k <= 3; k++) { const q = k * 64; ops.push({ op: 'paint', shape: { kind: 'line', from: [Math.max(0, -q), Math.max(0, q)], to: [Math.min(256, 256 - q), Math.min(256, 256 + q)], width: 4 }, rgba: [4, 4, 5, 255] }); }
  for (let k = 1; k <= 7; k++) { const q = k * 64; ops.push({ op: 'paint', shape: { kind: 'line', from: [Math.max(0, q - 256), Math.min(256, q)], to: [Math.min(256, q), Math.max(0, q - 256)], width: 4 }, rgba: [4, 4, 5, 255] }); }
  for (let i = 0; i < 6; i++) { const x = 32 + (i % 3) * 96, y = 32 + (i % 2) * 96 + (i > 2 ? 64 : 0); ops.push(paintEll(x, y, 17, 17, 255, [4, 4, 5])); ops.push(paintEll(x, y, 11, 11, 255, J[1])); }
  return ops.slice(0, 64);
}
const DRAPE_OF = { ruby: 'ruby', rubyLt: 'ruby', crimson: 'ruby', rose: 'ruby', cobalt: 'cobalt', azure: 'cobalt', sky: 'cobalt', night: 'cobalt', emerald: 'emerald', green: 'emerald', teal: 'emerald', forest: 'emerald', olive: 'emerald', gold: 'gold', amber: 'gold', yellow: 'gold', tan: 'gold', brown: 'gold', white: 'white', pale: 'white', pearl: 'white', bone: 'white', grey: 'white', purple: 'purple', violet: 'purple' };
const GROUND_OF = { ruby: 'rc', rubyLt: 'rc', crimson: 'rc', cobalt: 'cr', azure: 'cr', sky: 'cr', emerald: 'eg', green: 'eg', violet: 'pr', purple: 'pr', teal: 'tc' };
const PAINT = [36, 20, 10];
const paintLine = (a, b, w, op = 235) => ({ op: 'paint', shape: { kind: 'line', from: [Math.round(a[0]), Math.round(a[1])], to: [Math.round(b[0]), Math.round(b[1])], width: w }, rgba: [PAINT[0], PAINT[1], PAINT[2], 255], opacity: op });
const paintPoly = (pts, op, rgb) => ({ op: 'paint', shape: { kind: 'polygon', points: pts.map((p) => [Math.round(p[0]), Math.round(p[1])]) }, rgba: rgb ? [rgb[0], rgb[1], rgb[2], 255] : [PAINT[0], PAINT[1], PAINT[2], 255], opacity: op });
const paintEll = (x, y, w, h, op, rgb) => ({ op: 'paint', shape: { kind: 'ellipse', x: Math.round(x - w / 2), y: Math.round(y - h / 2), width: Math.round(w), height: Math.round(h) }, rgba: rgb ? [rgb[0], rgb[1], rgb[2], 255] : [PAINT[0], PAINT[1], PAINT[2], 255], opacity: op });

function familyOps(f, seed) { // one sheet of pot-metal: streaks, clouds, seeds, a thicker edge
  const r = mkRng(seed * 7 + 3), ops = [], C = GL.small, clampE = (x, w) => Math.max(w / 2, Math.min(C - w / 2, x));
  for (let i = 0; i < 10; i++) { const c = r() > 0.5 ? f[2] : f[3], w = 24 + Math.floor(r() * 60), h = 18 + Math.floor(r() * 44); ops.push(paintEll(clampE(r() * C, w), clampE(r() * C, h), w, h, 60 + Math.floor(r() * 90), c)); }
  for (let i = 0; i < 9; i++) { const c = r() > 0.5 ? f[2] : f[3], y = Math.floor(r() * C); ops.push({ op: 'paint', shape: { kind: 'line', from: [0, y], to: [C, Math.max(0, Math.min(C, y + Math.floor((r() - 0.5) * 30)))], width: 2 + Math.floor(r() * 4) }, rgba: [c[0], c[1], c[2], 255], opacity: 70 + Math.floor(r() * 80) }); }
  ops.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 2, height: 2 }, rgba: [f[2][0], f[2][1], f[2][2], 255], count: 40, seed: seed + 11, area: { x: 0, y: 0, width: C, height: C }, opacity: 180 });
  return ops;
}
function drapeOps(f, seed) { // brown paint on coloured glass: long folds, each with a soft wash beside its trace line
  const r = mkRng(seed * 13 + 1), ops = [], W = 256, H = 512, dk = [Math.round(f[1][0] * 0.3), Math.round(f[1][1] * 0.3), Math.round(f[1][2] * 0.3)];
  for (let i = 0; i < 13; i++) {
    const x = 18 + i * 18 + (r() - 0.5) * 10, sw = (r() - 0.5) * 42, y0 = 4 + r() * 120, y1 = H - r() * 90, ym = (y0 + y1) / 2, wash = 9 + r() * 12;
    ops.push(paintPoly([[x, y0], [x + wash, y0 + 10], [x + sw * 0.6 + wash * 1.4, ym], [x + sw + wash, y1 - 10], [x + sw, y1], [x + sw * 0.6, ym]], 62 + Math.floor(r() * 36), PAINT));
    ops.push(paintLine([x, y0], [x + sw * 0.6, ym], 3)); ops.push(paintLine([x + sw * 0.6, ym], [x + sw, y1], 2));
    if (i % 3 === 0) ops.push(paintLine([x + sw * 0.6 + wash * 1.6, ym - 40], [x + sw + wash * 1.6, y1 - 60], 3, 150));
  }
  for (let i = 0; i < 4; i++) { const y = 60 + i * 110 + r() * 40; ops.push(paintPoly([[0, y], [W, y + 26 * (r() - 0.5)], [W, y + 22], [0, y + 18]], 40, PAINT)); }
  return ops.slice(0, 62);
}
// A drawn medieval head, 256 x 256, centred: trace lines in brown over a flesh pane, with washes for the modelling
function faceOps(kind) {
  const ops = [], c = 128, mir = (p) => [256 - p[0], p[1]], both = (fn) => { fn((p) => p); fn(mir); };
  const hairC = kind === 'elder' ? [150, 146, 122] : kind === 'angel' ? [150, 96, 30] : [66, 40, 18];
  // washes: the side of the face and temple, under the brow, beside the nose, under the lip
  both((m) => {
    ops.push(paintPoly([m([18, 84]), m([52, 74]), m([46, 150]), m([72, 214]), m([34, 196])], 78));
    ops.push(paintEll(m([88, 104])[0], 106, 58, 20, 64));
    ops.push(paintPoly([m([122, 118]), m([112, 160]), m([102, 172]), m([118, 172])], 58));
  });
  ops.push(paintEll(c, 200, 52, 11, 58));
  // hair
  if (kind !== 'virgin') {
    ops.push(paintPoly([[6, 118], [14, 56], [60, 10], [128, 0], [196, 10], [242, 56], [250, 118], [222, 96], [206, 56], [160, 42], [128, 54], [96, 42], [50, 56], [34, 96]], 255, hairC));
    for (let i = 0; i < 7; i++) { const a = 28 + i * 16; ops.push(paintLine([a, 94 - i * 7], [a + 36, 12 + i * 2], 3, 190)); ops.push(paintLine([256 - a, 94 - i * 7], [256 - a - 36, 12 + i * 2], 3, 190)); }
  } else {
    ops.push(paintPoly([[0, 150], [2, 56], [50, 8], [128, 0], [206, 8], [254, 56], [256, 150], [226, 118], [214, 66], [128, 46], [42, 66], [30, 118]], 255, [214, 216, 186]));
    ops.push(paintLine([38, 124], [50, 62], 4)); ops.push(paintLine([50, 62], [128, 44], 4)); ops.push(paintLine([128, 44], [206, 62], 4)); ops.push(paintLine([206, 62], [218, 124], 4));
  }
  // brows, lids, eyes
  both((m) => {
    ops.push(paintLine(m([60, 96]), m([84, 84]), 5)); ops.push(paintLine(m([84, 84]), m([116, 92]), 5));
    ops.push(paintLine(m([64, 116]), m([84, 104]), 4)); ops.push(paintLine(m([84, 104]), m([112, 116]), 4));
    ops.push(paintLine(m([66, 118]), m([90, 126]), 2)); ops.push(paintLine(m([90, 126]), m([112, 116]), 2));
    ops.push(paintEll(m([88, 115])[0], 115, 15, 15, 255));
  });
  // nose, nostril, mouth, chin
  ops.push(paintLine([120, 92], [114, 150], 4)); ops.push(paintLine([114, 150], [106, 166], 4)); ops.push(paintLine([106, 166], [124, 174], 3)); ops.push(paintLine([136, 172], [150, 166], 3));
  ops.push(paintLine([98, 192], [128, 187], 4)); ops.push(paintLine([128, 187], [158, 192], 4));
  ops.push(paintLine([112, 202], [144, 202], 2, 170));
  if (kind === 'elder' || kind === 'christ' || kind === 'king') {
    const bc = kind === 'elder' ? [168, 164, 138] : [76, 46, 20];
    ops.push(paintPoly([[40, 158], [66, 184], [94, 196], [128, 206], [162, 196], [190, 184], [216, 158], [206, 226], [160, 256], [96, 256], [50, 226]], 255, bc));
    for (let i = 0; i < 7; i++) { const x = 64 + i * 21; ops.push(paintLine([x, 192 + Math.abs(i - 3) * -3], [x + (i - 3) * 3, 252], 3, 210)); }
    ops.push(paintLine([78, 180], [120, 176], 4)); ops.push(paintLine([178, 180], [136, 176], 4));
  } else {
    ops.push(paintLine([100, 226], [128, 236], 3, 170)); ops.push(paintLine([128, 236], [156, 226], 3, 170));
  }
  return ops.slice(0, 64);
}
function ornOps(f, kind, seed) { // painted ornament for borders: a running stem with leaves, scratched out of a dark ground
  const ops = [], C = GL.small;
  ops.push(paintPoly([[0, 0], [C, 0], [C, C], [0, C]], 210));
  const lit = f[2];
  for (let i = 0; i < 5; i++) {
    const y = 13 + i * 26, s = i % 2 ? 1 : -1;
    ops.push(paintPoly([[C / 2, y - 11], [C / 2 + s * 36, y - 6], [C / 2 + s * 46, y + 7], [C / 2 + s * 23, y + 11], [C / 2, y + 13]], 255, lit));
    ops.push(paintLine([C / 2 + s * 4, y - 3], [C / 2 + s * 37, y + 4], 2));
    ops.push(paintLine([C / 2 + s * 4, y + 5], [C / 2 + s * 28, y + 6], 1));
  }
  ops.push({ op: 'paint', shape: { kind: 'line', from: [C / 2, 0], to: [C / 2, C], width: 7 }, rgba: [lit[0], lit[1], lit[2], 255] });
  return ops;
}
async function makeGlassMaterials() {
  const regions = [], C = GL.cell, Sm = GL.small;
  const addR = (name, x, y, w, h, bg, ops) => regions.push({ name, content: { x, y, width: w, height: h }, gutter: 0, source: { kind: 'procedural', spec: { schemaVersion: 3, width: w, height: h, usage: 'emissive', background: [bg[0], bg[1], bg[2], 255], operations: ops } } });
  // Layout: two rows of small cells (pot-metals, then ornament), then drapery, faces and mosaic grounds
  GLASS_FAMILIES.forEach((f, i) => { const x = (i % 12) * Sm, y = Math.floor(i / 12) * Sm; GL.fam[f[0]] = [x, y]; addR('fam_' + f[0], x, y, Sm, Sm, f[1], familyOps(f, i + 1)); });
  [['gold', 'gold'], ['white', 'white']].forEach((q, i) => { const f = GLASS_FAMILIES.find((v) => v[0] === q[0]), x = (i + 2) * Sm, y = Sm; GL.orn[q[1]] = [x, y]; addR('orn_' + q[1], x, y, Sm, Sm, f[1], ornOps(f, q[1], i + 90)); });
  // painted drapery, one tall tile per colour
  ['ruby', 'cobalt', 'emerald', 'gold', 'white', 'purple'].forEach((n, i) => { const f = GLASS_FAMILIES.find((q) => q[0] === n), x = i * C, y = C; GL.tile[n] = [x, y, C, 2 * C]; addR('drape_' + n, x, y, C, 2 * C, f[1], drapeOps(f, i + 40)); });
  // faces
  ['youth', 'elder', 'christ', 'king', 'virgin', 'angel'].forEach((n, i) => { const x = i * C, y = 3 * C; GL.face[n] = [x, y]; addR('face_' + n, x, y, C, C, n === 'virgin' ? [202, 162, 128] : [192, 148, 112], faceOps(n)); });
  // mosaic grounds
  GLASS_GROUNDS.forEach((q, i) => { const fam = (n) => GLASS_FAMILIES.find((v) => v[0] === n), x = i * C, y = 4 * C; GL.ground[q[0]] = [x, y]; addR('ground_' + q[0], x, y, C, C, fam(q[1])[3], groundOps(fam(q[1]), fam(q[2]), fam(q[3]), i + 3)); });
  GL.fam.lead = [1400, 140]; // the empty part of the sheet is black, and the came needs no pixels of its own
  const atlas = await textureAtlas({ schemaVersion: 1, usage: 'emissive', width: GL.w, height: GL.h, pack: { edge: 2048, gutter: 0 }, regions });
  // Seen from inside the glass is the only light: a black pane that shines
  MAT.glassIn = pbrMaterial({ emissive: atlas, emissiveIntensity: P.glassGlow, roughness: 1, metalness: 0, name: 'StainedGlass_Interior' });
  MAT.glassIn.color.setRGB(0, 0, 0);
  // Seen from outside by day it is nearly black, a dull sheen and the colour only hinting through.
  // A rough surface keeps grazing angles from washing out to a pale reflection of the sky.
  MAT.glassOut = pbrMaterial({ emissive: atlas, emissiveIntensity: P.glassOuterGlow, roughness: 0.82, metalness: 0, name: 'StainedGlass_Exterior' });
  MAT.glassOut.color.setRGB(0.008, 0.009, 0.012);
}

// Hierarchy helper: every mesh gets a unique role name; geometry is shared between placements.
let ROOT = null; const NAMES = new Map();
function uniq(n) { const c = (NAMES.get(n) || 0) + 1; NAMES.set(n, c); return c === 1 ? n : n + '_' + c; }
const STAT = new Map();
// Exporter costs measured on this host: pos+normal+uv 32 B, COLOR_0 written as 12 B floats
function batchBytes(b) { b.weld(); return b.count * (32 + (b.noColor ? 0 : 12)) + b.I.length * (b.count > 65535 ? 4 : 2); }
function place(name, batch, mat, o = {}) {
  if (!batch || !batch.I.length) return null;
  if (mat === MAT.gold) batch.noColor = true; // metal needs no baked shading: saves 12 B a vertex
  if (P.preview === 'unique' && batch.geo) return null; // size test: every geometry once, no instances
  if (mat === MAT.ashlar && !batch.tessellated && !batch.geo) { batch.tess(P.wallTessellation); batch.tessellated = true; }
  if (P.preview === 'stats') {
    const e = STAT.get(batch) || { name, n: 0, normalMapped: mat === MAT.ashlar || mat === MAT.lead || mat === MAT.pave || mat === MAT.oak };
    e.n++; STAT.set(batch, e);
    return null;
  }
  const part = createPart(uniq(name), batch.toGeo(), mat, { position: o.pos || [0, 0, 0], rotation: o.rot || [0, 0, 0], scale: o.scale || [1, 1, 1], parent: o.parent || ROOT });
  PLACED.push({ part, batch, mat });
  return part;
}
const PLACED = [];
function group(name, parent) { const g = new THREE.Group(); g.name = uniq(name); (parent || ROOT).add(g); return g; }

// ==================================================================================
// SCULPTURE: robed figures with carved drapery. A figure is a full surface, not a block:
// S-curve stance, tube folds breaking at the hem, swags across the body, sleeves, hands,
// modelled faces, hair and beards, and the attributes each saint carries.
// ==================================================================================
// Every figure is a signed-distance volume: a long column of cloth with deep pleats, a mantle
// laid over it, arms under the cloth, and a separately resolved head and hands. A surface-net
// pass extracts the skin, the simplifier keeps the carving and drops the rest, and ambient
// occlusion from the field itself is baked into the valleys of the folds.
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const sdEll = (x, y, z, rx, ry, rz) => { const a = x / rx, b = y / ry, c = z / rz, k0 = Math.sqrt(a * a + b * b + c * c), d = a / rx, e = b / ry, f = c / rz, k1 = Math.sqrt(d * d + e * e + f * f); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz); };
// Rounded cone between two points: the workhorse of fingers, locks, lids and sleeves
function sdCone(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const t = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz));
  return len3(px - dx * t, py - dy * t, pz - dz * t) - (r1 + (r2 - r1) * t);
}
// Surface nets over a sparse grid: only cells near the surface are ever evaluated
function polygonize(F, box, cell, bandK = 1.75) {
  const [x0, y0, z0, x1, y1, z1] = box, nx = Math.ceil((x1 - x0) / cell) + 2, ny = Math.ceil((y1 - y0) / cell) + 2, nz = Math.ceil((z1 - z0) / cell) + 2;
  const N = nx * ny * nz, val = new Float32Array(N), seen = new Uint8Array(N), cellV = new Int32Array(N).fill(-1);
  const b4 = 3.46 * cell * bandK, b2 = 1.73 * cell * bandK, active = [];
  const at = (i, j, k) => { const q = i + nx * (j + ny * k); if (!seen[q]) { seen[q] = 1; val[q] = F(x0 + i * cell, y0 + j * cell, z0 + k * cell); } return val[q]; };
  // Two-level descent: a coarse block, then its octants, then cells, so the field is only asked near its surface
  for (let kc = 0; kc < nz - 1; kc += 4) for (let jc = 0; jc < ny - 1; jc += 4) for (let ic = 0; ic < nx - 1; ic += 4) {
    if (Math.abs(F(x0 + (ic + 2) * cell, y0 + (jc + 2) * cell, z0 + (kc + 2) * cell)) >= b4) continue;
    for (let k2 = kc; k2 < Math.min(kc + 4, nz - 1); k2 += 2) for (let j2 = jc; j2 < Math.min(jc + 4, ny - 1); j2 += 2) for (let i2 = ic; i2 < Math.min(ic + 4, nx - 1); i2 += 2) {
      if (Math.abs(F(x0 + (i2 + 1) * cell, y0 + (j2 + 1) * cell, z0 + (k2 + 1) * cell)) >= b2) continue;
      for (let k = k2; k < Math.min(k2 + 2, nz - 1); k++) for (let j = j2; j < Math.min(j2 + 2, ny - 1); j++) for (let i = i2; i < Math.min(i2 + 2, nx - 1); i++) active.push(i, j, k);
    }
  }
  const P = [], I = [], E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], v = new Float64Array(8);
  for (let a = 0; a < active.length; a += 3) {
    const i = active[a], j = active[a + 1], k = active[a + 2];
    let mask = 0;
    for (let c = 0; c < 8; c++) { const d = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1)); v[c] = d; if (d < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const c0 = E[e][0], c1 = E[e][1], d0 = v[c0], d1 = v[c1];
      if ((d0 < 0) === (d1 < 0)) continue;
      const t = d0 / (d0 - d1);
      sx += lerp(c0 & 1, c1 & 1, t); sy += lerp((c0 >> 1) & 1, (c1 >> 1) & 1, t); sz += lerp((c0 >> 2) & 1, (c1 >> 2) & 1, t); n++;
    }
    cellV[i + nx * (j + ny * k)] = P.length / 3;
    P.push(x0 + (i + sx / n) * cell, y0 + (j + sy / n) * cell, z0 + (k + sz / n) * cell);
  }
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) I.push(a, c, b, a, d, c); else I.push(a, b, c, a, c, d); };
  const cv = (i, j, k) => (i < 0 || j < 0 || k < 0 ? -1 : cellV[i + nx * (j + ny * k)]);
  for (let a = 0; a < active.length; a += 3) {
    const i = active[a], j = active[a + 1], k = active[a + 2];
    const s0 = at(i, j, k) < 0;
    if (s0 !== (at(i + 1, j, k) < 0)) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), !s0);
    if (s0 !== (at(i, j + 1, k) < 0)) quad(cv(i - 1, j, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i - 1, j, k), s0);
    if (s0 !== (at(i, j, k + 1) < 0)) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), !s0);
  }
  return { P, I };
}
function meshToGeo(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.P), 3));
  g.setIndex(new THREE.BufferAttribute(m.P.length / 3 > 65535 ? new Uint32Array(m.I) : new Uint16Array(m.I), 1));
  g.computeVertexNormals();
  return g;
}
const AO_STEPS = [0.016, 0.05, 0.13];
// Extract, simplify, and write into a batch with field normals and field ambient occlusion
async function carveInto(b, F, box, cell, tris, xf, occ, opt = {}) {
  const raw = polygonize(F, box, cell);
  if (!raw.I.length) return;
  if (opt.cull) { // drop a region that a finer pass will carve instead
    const I2 = [], used = new Int32Array(raw.P.length / 3).fill(-1), P2 = [], mapV = (v) => { if (used[v] < 0) { used[v] = P2.length / 3; P2.push(raw.P[v * 3], raw.P[v * 3 + 1], raw.P[v * 3 + 2]); } return used[v]; };
    for (let t = 0; t < raw.I.length; t += 3) {
      const a = raw.I[t], c = raw.I[t + 1], e = raw.I[t + 2], mx = (raw.P[a * 3] + raw.P[c * 3] + raw.P[e * 3]) / 3, my = (raw.P[a * 3 + 1] + raw.P[c * 3 + 1] + raw.P[e * 3 + 1]) / 3, mz = (raw.P[a * 3 + 2] + raw.P[c * 3 + 2] + raw.P[e * 3 + 2]) / 3;
      if (!opt.cull(mx, my, mz)) I2.push(mapV(a), mapV(c), mapV(e));
    }
    raw.P = P2; raw.I = I2;
  }
  let g = meshToGeo(raw);
  if (raw.I.length / 3 > tris) g = await simplifyGeometry(g, { targetTriangles: tris });
  const pos = g.attributes.position, idx = g.index, base = b.count, h = cell * (opt.smooth || 0.6), aoK = opt.ao === undefined ? 0.5 : opt.ao, aoMin = opt.aoMin === undefined ? 0.16 : opt.aoMin;
  b.at(xf || M.I(), () => {
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const f0 = F(x, y, z), g0 = F(x + h, y, z) - F(x - h, y, z), g1 = F(x, y + h, z) - F(x, y - h, z), g2 = F(x, y, z + h) - F(x, y, z - h), l = len3(g0, g1, g2) || 1;
      const nx = g0 / l, ny = g1 / l, nz = g2 / l;
      // settle the vertex onto the true surface: this is what keeps fold valleys crisp
      x -= nx * f0; y -= ny * f0; z -= nz * f0;
      const O = occ || F;
      const wx = b.m[0] * x + b.m[1] * y + b.m[2] * z + b.m[3], wy = b.m[4] * x + b.m[5] * y + b.m[6] * z + b.m[7], wz = b.m[8] * x + b.m[9] * y + b.m[10] * z + b.m[11];
      const nm = b.nm, ax = nm[0] * nx + nm[1] * ny + nm[2] * nz, ay = nm[3] * nx + nm[4] * ny + nm[5] * nz, az = nm[6] * nx + nm[7] * ny + nm[8] * nz, al = len3(ax, ay, az) || 1;
      let o = 0, w = 1;
      for (let q = 0; q < 3; q++) { const d = AO_STEPS[q]; o += w * Math.max(0, d - O(wx + ax / al * d, wy + ay / al * d, wz + az / al * d)) / d; w *= 0.66; }
      const ao = clamp(1 - o * aoK, aoMin, 1);
      // UV by a slanted planar projection: no seam on a figure, the grain runs up the stone
      b.v(x, y, z, nx, ny, nz, wz * 0.8 + wx * 0.6, wy, ao);
    }
    for (let t = 0; t < idx.count; t += 3) b.tri(base + idx.getX(t), base + idx.getX(t + 1), base + idx.getX(t + 2));
  });
}

// ---- The head: a real skull, brow, eyes with lids, nose, lips, chin, hair, beard -------------
const LID_U = [[0.0795, 0.0035, 0.0165, 0.003], [0.0848, 0.0112, 0.0238, 0.0038], [0.0866, 0.0152, 0.0338, 0.0043], [0.0838, 0.0122, 0.0438, 0.0036], [0.0755, 0.0062, 0.052, 0.0024]];
const LID_L = [[0.0795, 0.0035, 0.0165, 0.0022], [0.0836, -0.0012, 0.0245, 0.0028], [0.0852, -0.0032, 0.034, 0.003], [0.0822, -0.0006, 0.044, 0.0026], [0.0755, 0.0062, 0.052, 0.0022]];
function headField(o) {
  const sm = o.smile || 0, cheek = o.gaunt ? 0.5 : 1, up = sm * 0.0065;
  const locks = [], rng = mkRng(o.seed * 37 + 11);
  // Long locks fall from the temples and the back of the head to the shoulders
  if (o.hair === 'long' || o.hair === 'curled') {
    const nL = o.hair === 'curled' ? 7 : 9;
    for (let i = 0; i < nL; i++) {
      const f = i / (nL - 1), a = lerp(1.05, 2.95, f), r0 = 0.092, wob = 0.012 + rng() * 0.008, dr = o.hair === 'curled' ? -0.165 : -0.235;
      for (const s of [-1, 1]) {
        const p0 = [r0 * Math.cos(a) - 0.012, 0.02 + rng() * 0.02, s * r0 * Math.sin(a) * 0.9];
        const p1 = [p0[0] * 1.14 - 0.008, p0[1] + dr * 0.5, p0[2] * 1.18 + s * wob];
        const p2 = [p0[0] * 1.02 - 0.03 * (1 - f * 0.5), p0[1] + dr, p0[2] * (1.28 - f * 0.3) - s * wob];
        locks.push([p0, p1, 0.02, 0.016], [p1, p2, 0.016, o.hair === 'curled' ? 0.012 : 0.007]);
      }
    }
  }
  if (o.hair === 'curls') { // rolled waves that frame the face: the smiling angel, the Child
    for (let i = 0; i < 11; i++) { const f = i / 10 - 0.5, a = f * 2.5, p0 = [0.104 * Math.cos(a) * 0.72 + 0.006, 0.094 - f * f * 0.11, 0.088 * Math.sin(a)], p1 = [p0[0] + 0.012, p0[1] - 0.03 - Math.abs(f) * 0.03, p0[2] * 1.16]; locks.push([p0, p1, 0.0165, 0.0115]); }
    for (let i = 0; i < 12; i++) { const a = 1.5 + i * 0.29, s = i % 2 ? 1 : -1, p0 = [0.09 * Math.cos(a) - 0.012, 0.0, s * 0.09 * Math.sin(a)], p1 = [p0[0] * 1.1, -0.062, p0[2] * 1.14]; locks.push([p0, p1, 0.019, 0.013]); }
  }
  const beardL = [];
  if (o.beard) {
    const nB = 7, L = o.beard === 2 ? 0.17 : 0.09;
    for (let i = 0; i < nB; i++) {
      const f = i / (nB - 1) - 0.5, z0 = f * 0.098, x0 = 0.078 - Math.abs(f) * 0.05, wob = (i % 2 ? 1 : -1) * 0.005;
      // separate locks with grooves between them; each one twists and tapers to a point
      beardL.push([[x0, -0.07 - Math.abs(f) * 0.012, z0], [x0 + 0.006, -0.07 - L * 0.6 - Math.abs(f) * 0.015, z0 * 0.92 + wob], 0.0102, 0.0098]);
      beardL.push([[x0 + 0.006, -0.07 - L * 0.6 - Math.abs(f) * 0.015, z0 * 0.92 + wob], [x0 - 0.006 + (o.beard === 2 ? 0.008 : 0), -0.07 - L - Math.abs(f) * 0.012, z0 * 0.5], 0.0098, 0.0035]);
    }
  }
  // Each lock is skipped outright when the query point is beyond its bounding sphere
  const sphere = (L) => { const dx = L[0][0] - L[1][0], dy = L[0][1] - L[1][1], dz = L[0][2] - L[1][2], R = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2 + Math.max(L[2], L[3]) + 0.03; return [(L[0][0] + L[1][0]) / 2, (L[0][1] + L[1][1]) / 2, (L[0][2] + L[1][2]) / 2, R * R]; };
  const lockB = locks.map(sphere), beardB = beardL.map(sphere);
  const nearS = (S, x, y, z) => { const a = x - S[0], b = y - S[1], c = z - S[2]; return a * a + b * b + c * c < S[3]; };
  return (x, y, z) => {
    const az = Math.abs(z);
    let d = sdEll(x + 0.012, y - 0.03, z, 0.098, 0.098, 0.08);                 // cranium
    d = smin(d, sdEll(x - 0.018, y + 0.022, z, 0.074, 0.094, 0.0655), 0.02);    // face mass
    d = smin(d, sdEll(x - 0.03, y + 0.076, z, 0.056, 0.046, 0.05 * (o.gaunt ? 0.93 : 1)), 0.018); // jaw
    d = smin(d, sdEll(x - 0.0675, y + 0.1, z, 0.019, 0.0175, 0.02), 0.012);      // chin
    d = smin(d, sdCone(x, y, az, 0.0745, 0.031, 0, 0.066, 0.033, 0.05, 0.0118, 0.0088), 0.012); // brow ridge
    d = smin(d, sdEll(x - 0.054, y + 0.018 - up, az - 0.044, 0.026, 0.017 + sm * 0.003, 0.02), 0.015 * cheek); // cheekbone
    if (o.gaunt) d = smax(d, -sdEll(x - 0.05, y + 0.058, az - 0.058, 0.03, 0.022, 0.012), 0.012);
    if (x > 0.04 && y > -0.03 && y < 0.05 && az < 0.082) {
      d = smax(d, -sdEll(x - 0.0875, y - 0.0075, az - 0.034, 0.0225, 0.0118, 0.0215), 0.008);  // eye socket
      d = smin(d, len3(x - 0.0655, y - 0.0065, az - 0.034) - 0.0178, 0.0018);      // eyeball
      d = smax(d, -(len3(x - 0.0862, y - 0.0065, az - 0.034) - 0.0052), 0.0016);    // the drilled pupil
      // lids: a carved almond, the upper rim heavier, meeting at the corners
      for (let i = 0; i < 4; i++) { const a = LID_U[i], c = LID_U[i + 1]; d = smin(d, sdCone(x, y, az, a[0], a[1], a[2], c[0], c[1], c[2], a[3], c[3]), 0.0026); }
      for (let i = 0; i < 4; i++) { const a = LID_L[i], c = LID_L[i + 1]; d = smin(d, sdCone(x, y, az, a[0], a[1], a[2], c[0], c[1], c[2], a[3], c[3]), 0.0022); }
    }
    if (x > 0.055 && y > -0.105 && y < 0.045 && az < 0.055) {
      // nose: bridge to tip, wings, nostrils
      d = smin(d, sdCone(x, y, z, 0.0835, 0.0225, 0, 0.105, -0.021, 0, 0.0058, 0.0092), 0.0085);
      d = smin(d, len3(x - 0.0925, y + 0.0295, az - 0.0108) - 0.0064, 0.005);
      d = smax(d, -(len3(x - 0.0975, y + 0.0355, az - 0.0062) - 0.0033), 0.002);
      // philtrum
      d = smax(d, -sdCone(x, y, z, 0.0975, -0.042, 0, 0.0965, -0.052, 0, 0.0028, 0.0034), 0.0035);
      // lips: upper in two wings, a fuller lower, a cut between; corners lift for a smile
      const my = -0.0615;
      d = smin(d, sdCone(x, y, az, 0.0925, my + 0.004, 0, 0.0815, my + 0.001 + up, 0.0215 + sm * 0.003, 0.0058, 0.0026), 0.005);
      d = smin(d, sdCone(x, y, az, 0.0915, my - 0.0085, 0, 0.0825, my - 0.003 + up, 0.0185 + sm * 0.003, 0.0072, 0.0028), 0.005);
      d = smax(d, -sdCone(x, y, az, 0.0965, my - 0.002, 0, 0.0825, my + up * 1.15, 0.0235 + sm * 0.004, 0.0017, 0.0021), 0.0022);
      d = smax(d, -sdEll(x - 0.0915, y + 0.0845, z, 0.012, 0.0055, 0.02), 0.006);   // hollow under the lip
    }
    if (sm) d = smin(d, sdEll(x - 0.07, y + 0.044 - up * 2, az - 0.038, 0.02, 0.015, 0.016), 0.012); // the raised cheek of a smile
    // ear
    d = smin(d, sdEll(x + 0.012, y - 0.002, az - 0.08, 0.016, 0.03, 0.0085), 0.004);
    // neck, into the shoulders
    d = smin(d, sdCone(x, y, z, -0.01, -0.075, 0, -0.022, -0.215, 0, 0.041, 0.052), 0.018);
    // ---- hair ----
    if (o.hair && o.hair !== 'none') {
      const faceOpen = sdEll(x - 0.094, y + 0.012, z, 0.08, o.hair === 'curls' ? 0.106 : 0.118, 0.073);
      let h = sdEll(x + 0.014, y - 0.034, z, 0.104, 0.104, 0.09);
      if (o.hair === 'tonsure') h = smax(h, -sdEll(x + 0.012, y - 0.135, z, 0.075, 0.045, 0.062), 0.006);
      const an = Math.atan2(z, x + 0.014);
      if (o.hair !== 'curls') {
        const part = Math.exp(-(z * z) / 0.00007) * sstep(0.03, 0.11, y);
        h += 0.0028 * Math.sin(an * 22 + y * 34) + 0.007 * part;
      } else {
        h += 0.006 * Math.sin(an * 11 + y * 22) * Math.sin(y * 27 + an * 3);
      }
      for (let i = 0; i < locks.length; i++) { if (!nearS(lockB[i], x, y, z)) continue; const L = locks[i]; h = smin(h, sdCone(x, y, z, L[0][0], L[0][1], L[0][2], L[1][0], L[1][1], L[1][2], L[2], L[3]), 0.0055); }
      h = smax(h, -faceOpen, 0.0055);
      d = smin(d, h, 0.0025);
    }
    // ---- beard and moustache ----
    if (o.beard) {
      for (let i = 0; i < beardL.length; i++) { if (!nearS(beardB[i], x, y, z)) continue; const L = beardL[i]; d = smin(d, sdCone(x, y, z, L[0][0], L[0][1], L[0][2], L[1][0], L[1][1], L[1][2], L[2], L[3]), 0.0022); }
      d = smin(d, sdCone(x, y, az, 0.0955, -0.0475, 0.002, 0.081, -0.0625, 0.031, 0.0046, 0.003), 0.0025);
      d = smin(d, sdEll(x - 0.05, y + 0.058, az - 0.058, 0.022, 0.03, 0.012), 0.008); // sideburn into the jaw
    }
    // ---- veil: falls from the crown to the shoulders, cut open round the face ----
    if (o.veil) {
      // A soft hood: close to the skull, widening over the shoulders, its hem falling in loose folds
      const an = Math.atan2(z, x + 0.02);
      let w = smin(sdEll(x + 0.012, y - 0.032, z, 0.11, 0.108, 0.094), sdCone(x, y, z, -0.022, -0.05, 0, -0.038, -0.3, 0, 0.09, 0.158), 0.05);
      w -= 0.012 * (Math.sqrt(Math.abs(Math.sin(an * 4.5 + y * 2.2))) - 0.55) * sstep(-0.01, -0.16, y);
      w = smax(w, -0.325 + 0.022 * Math.sin(an * 5) - y, 0.008);
      const open = sdEll(x - 0.104, y + 0.016, z, 0.1, 0.116, 0.0715);
      d = smin(d, smax(w, -open, 0.004), 0.0015);
    }
    // ---- mitre: two high peaks of stiff cloth, the bands left proud ----
    if (o.mitre) {
      // seen from the front a pointed arch, wide at the brow; seen from the side, two thin peaks
      const px = x + 0.012, py = y - 0.058, f = clamp(py / 0.27), w0 = 0.098 * (1 - Math.pow(f, 1.9)), dp = 0.102 * (1 - f * 0.86), lens = Math.abs(px) + az * 0.2;
      let m = Math.max(lens - dp, az - w0, -py);
      m = Math.max(m, py - 0.272);
      const band = Math.exp(-((py - 0.018) * (py - 0.018)) / 0.00016);
      m -= 0.0045 * band + 0.0038 * Math.exp(-(z * z) / 0.00012);
      d = smin(d, m, 0.004);
    }
    return d * 0.92;
  };
}

// ---- The hand: palm and jointed fingers that actually close on what they hold -------------
const HAND_POSES = {
  // [curl1, curl2, curl3] per finger (index..little), thumb [x,y,z of tip, spread]
  grip: { f: [[68, 88, 62], [72, 92, 64], [76, 92, 64], [80, 88, 62]], t: 'over' },
  support: { f: [[10, 18, 12], [12, 20, 14], [14, 22, 14], [18, 24, 16]], t: 'open' },
  edge: { f: [[46, 40, 26], [48, 42, 26], [50, 44, 28], [54, 44, 28]], t: 'open' },
  bless: { f: [[6, 8, 6], [8, 10, 8], [62, 90, 60], [68, 92, 60]], t: 'over' },
  rest: { f: [[28, 40, 26], [32, 42, 28], [36, 44, 28], [40, 46, 28]], t: 'open' },
};
function handField(pose, thumb = 1) {
  const P0 = HAND_POSES[pose], kn = [[0.078, 0.003, -0.027], [0.083, 0.004, -0.009], [0.08, 0.003, 0.009], [0.073, 0.001, 0.026]], segL = [[0.036, 0.024, 0.019], [0.04, 0.027, 0.02], [0.037, 0.025, 0.019], [0.029, 0.019, 0.016]], segs = [];
  for (let f = 0; f < 4; f++) {
    let ang = 0, p = kn[f].slice();
    for (let s = 0; s < 3; s++) {
      ang += rad(P0.f[f][s]);
      const q = [p[0] + Math.cos(ang) * segL[f][s], p[1] - Math.sin(ang) * segL[f][s], p[2]];
      segs.push([p, q, s === 0 ? 0.0098 : s === 1 ? 0.0088 : 0.0078, s === 2 ? 0.0066 : s === 0 ? 0.0088 : 0.0078]);
      p = q;
    }
  }
  const tb = [0.022, -0.006, thumb * 0.03], tm = P0.t === 'over' ? [0.052, -0.03, thumb * 0.033] : [0.05, -0.012, thumb * 0.054], tt = P0.t === 'over' ? [0.078, -0.044, thumb * 0.012] : [0.082, -0.016, thumb * 0.056];
  return (x, y, z) => {
    let d = Math.max(Math.abs(x - 0.04) - 0.043, Math.abs(y) - 0.0125, Math.abs(z) - 0.036) - 0.006; // palm, gently rounded
    d = smin(d, sdCone(x, y, z, -0.02, 0, 0, 0.02, 0, 0, 0.026, 0.033), 0.012);                     // wrist heel
    for (let i = 0; i < segs.length; i++) { const S = segs[i]; d = smin(d, sdCone(x, y, z, S[0][0], S[0][1], S[0][2], S[1][0], S[1][1], S[1][2], S[2], S[3]), 0.0022); }
    d = smin(d, sdCone(x, y, z, tb[0], tb[1], tb[2], tm[0], tm[1], tm[2], 0.0145, 0.0098), 0.006);
    d = smin(d, sdCone(x, y, z, tm[0], tm[1], tm[2], tt[0], tt[1], tt[2], 0.0098, 0.0078), 0.002);
    return d;
  };
}
// Heads are shared meshes placed on their own node: the same face can turn and tilt per figure at no byte cost.
const HEAD_MESH = {};
const HEADS = {
  bearded: { hair: 'long', beard: 1, seed: 2 },
  mitred: { hair: 'curled', mitre: 1, gaunt: 1, seed: 4 },
  royal: { hair: 'curled', beard: 2, seed: 10 },
  veiled: { veil: 1, smile: 0.25, seed: 8 },
  angelic: { hair: 'curls', smile: 1, seed: 13 },
};
async function headBatch(key) {
  if (HEAD_MESH[key]) return HEAD_MESH[key];
  const hO = HEADS[key], b = new Batch(TILE.fine), hF = headField(hO);
  const hB = [-0.19, hO.veil ? -0.36 : -0.26, -0.2, 0.17, hO.mitre ? 0.36 : 0.16, 0.2];
  // Hair and skull at a working grid, then the face alone on the finest grid with most of the triangles
  const FB = [0.024, -0.13, -0.08, 0.128, 0.088, 0.08];
  const inFace = (x, y, z) => x > FB[0] + 0.003 && y > FB[1] + 0.003 && y < FB[4] - 0.003 && z > FB[2] + 0.003 && z < FB[5] - 0.003;
  await carveInto(b, hF, hB, 0.0048, hO.veil ? 1300 : hO.beard ? 1900 : 1700, null, hF, { smooth: 1.4, ao: 0.34, aoMin: 0.3, cull: inFace });
  await carveInto(b, hF, FB, 0.0024, hO.beard ? 2500 : 2700, null, hF, { smooth: 0.9, ao: 0.3, aoMin: 0.34 });
  b.isFigure = true;
  HEAD_MESH[key] = b;
  return b;
}
const HAND_MESH = {};
async function handBatch(pose, thumb) { // hands are cached: a grip is a grip, whoever's it is
  const key = pose + thumb;
  if (!HAND_MESH[key]) { const b = new Batch(TILE.fine), F = handField(pose, thumb); await carveInto(b, F, [-0.05, -0.1, -0.1, 0.16, 0.05, 0.1], 0.0034, 520); HAND_MESH[key] = b; }
  return HAND_MESH[key];
}
function copyBatch(dst, src, m, shadeFn) { // transform a finished batch into another
  const base = dst.count;
  dst.at(m, () => {
    for (let i = 0; i < src.count; i++) { const i3 = i * 3, i2 = i * 2; dst.v(src.P[i3], src.P[i3 + 1], src.P[i3 + 2], src.N[i3], src.N[i3 + 1], src.N[i3 + 2], src.UV[i2] * src.tile, src.UV[i2 + 1] * src.tile, (src.C[i3] / 255) * (shadeFn ? shadeFn(src.P[i3], src.P[i3 + 1], src.P[i3 + 2]) : 1)); }
    for (let t = 0; t < src.I.length; t += 3) dst.tri(base + src.I[t], base + src.I[t + 1], base + src.I[t + 2]);
  });
}
const frameOf = (p, X, Y) => { // rigid frame: origin p, local X and Y given, Z = X x Y
  const lx = len3(X[0], X[1], X[2]), xn = [X[0] / lx, X[1] / lx, X[2] / lx], d = Y[0] * xn[0] + Y[1] * xn[1] + Y[2] * xn[2];
  let yy = [Y[0] - d * xn[0], Y[1] - d * xn[1], Y[2] - d * xn[2]]; const ly = len3(yy[0], yy[1], yy[2]); yy = yy.map((c) => c / ly);
  const z = [xn[1] * yy[2] - xn[2] * yy[1], xn[2] * yy[0] - xn[0] * yy[2], xn[0] * yy[1] - xn[1] * yy[0]];
  return [xn[0], yy[0], z[0], p[0], xn[1], yy[1], z[1], p[1], xn[2], yy[2], z[2], p[2]];
};
const invRigid = (m) => (x, y, z) => { const a = x - m[3], b = y - m[7], c = z - m[11]; return [m[0] * a + m[4] * b + m[8] * c, m[1] * a + m[5] * b + m[9] * c, m[2] * a + m[6] * b + m[10] * c]; };

// ---- The people. Bodies are long columns of cloth; each differs in dress, stance, head, gesture ----
const FIGURES = {
  apostle: { seed: 2, sway: 0.018, dress: 'mantle', headKey: 'bearded', head: { hair: 'long', beard: 1, seed: 2 }, hold: 'key' },
  bishop: { seed: 4, sway: 0.008, dress: 'chasuble', headKey: 'mitred', head: { hair: 'curled', mitre: 1, gaunt: 1, seed: 4 }, hold: 'crozier' },
  king: { seed: 10, sway: 0.022, dress: 'royal', headKey: 'royal', head: { hair: 'curled', beard: 2, crown: 1, seed: 10 }, hold: 'sceptre' },
  queen: { seed: 5, sway: 0.03, dress: 'royal', slim: 0.93, headKey: 'veiled', head: { veil: 1, crown: 1, seed: 5, turn: 8 }, hold: 'mantle' },
  angel: { seed: 13, sway: 0.05, dress: 'angel', slim: 0.94, wings: 1, headKey: 'angelic', head: { hair: 'curls', smile: 1, seed: 13, tilt: 11, turn: 15 }, hold: 'scroll' },
  virgin: { seed: 8, sway: 0.062, dress: 'mantle', slim: 0.95, headKey: 'veiled', head: { veil: 1, crown: 1, smile: 0.35, seed: 8, tilt: 9, turn: -16 }, hold: 'child' },
};
const FIG_ALIAS = { peter: 'apostle', paul: 'apostle', prophet: 'apostle', deacon: 'apostle', martyr: 'queen', kingA: 'king', kingB: 'king', kingC: 'king', christ: 'seated' };

function bodyField(o) {
  const yN = 1.7, rng = mkRng(o.seed * 991 + 7), ph = []; for (let i = 0; i < 8; i++) ph.push(rng() * TAU);
  const sw = o.sway || 0, sl = o.slim || 1, L = 256;
  const keys = [[0, 0.178, 0.205, 0.218], [0.05, 0.165, 0.192, 0.204], [0.3, 0.138, 0.165, 0.172], [0.52, 0.124, 0.15, 0.158], [0.66, 0.112, 0.128, 0.146], [0.8, 0.116, 0.12, 0.15], [0.885, 0.108, 0.112, 0.15], [0.94, 0.09, 0.094, 0.13], [0.975, 0.066, 0.07, 0.09], [1, 0.044, 0.046, 0.05]];
  const Af = new Float32Array(L), Ab = new Float32Array(L), Bs = new Float32Array(L), Cx = new Float32Array(L), Cz = new Float32Array(L), Amp = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1), k = keyf(keys, t);
    Af[i] = k[0]; Ab[i] = k[1]; Bs[i] = k[2] * sl;
    Cx[i] = 0.014 * Math.sin(t * PI);
    Cz[i] = sw * (Math.sin(t * PI * 0.92) * 1.15 - 0.62 * Math.sin(t * PI * 2));
    // pleats deepest over the shins, gathered at the belt, slight in the bodice
    Amp[i] = t < 0.645 ? lerp(0.05, 0.03, sstep(0, 0.6, t)) : lerp(0.014, 0.004, sstep(0.66, 0.9, t));
  }
  const n1 = o.dress === 'chasuble' ? 16 : 14, n2 = 25, yB = 0.655 * yN;
  const dress = o.dress, zc = Cz[Math.round(0.86 * (L - 1))], cxS = Cx[Math.round(0.86 * (L - 1))];
  const Rs = 0.142 * sl;
  const arms = armPose(o, Rs, zc, cxS);
  // Feet: pointed medieval shoes emerge from the hem
  const foot = (x, y, z) => { const az = Math.abs(z - Cz[0]); let d = sdCone(x, y, az, 0.02, 0.042, 0.082, 0.2, 0.024, 0.098, 0.05, 0.024); d = smin(d, sdCone(x, y, az, 0.0, 0.05, 0.082, 0.02, 0.2, 0.07, 0.044, 0.04), 0.02); d = smax(d, -sdEll(x - 0.11, y + 0.01, az - 0.09, 0.08, 0.02, 0.1), 0.004); return Math.max(d, -y); };
  return {
    arms,
    F: (x, y, z) => {
      const t = clamp(y / yN), i = (t * (L - 1)) | 0, px = x - Cx[i], pz = z - Cz[i], rho = Math.sqrt(px * px + pz * pz) + 1e-6, c = px / rho, s = pz / rho, a = c > 0 ? Af[i] : Ab[i], b = Bs[i];
      const R = 1 / Math.sqrt((c * c) / (a * a) + (s * s) / (b * b)), th = Math.atan2(pz, px);
      // ---- the tunic: tube pleats with valleys you could put a finger in ----
      const u1 = th * n1 * 0.5 + ph[0] + y * 0.5 * Math.sign(sw || 1), u2 = th * n2 * 0.5 + ph[1] - y * 0.9;
      const p1 = Math.sqrt(Math.abs(Math.sin(u1))), p2 = Math.sqrt(Math.abs(Math.sin(u2)));
      let r = R + Amp[i] * (p1 * 0.76 + p2 * 0.24 - 0.64);
      r += sstep(0.14, 0, y) * (0.018 + 0.016 * Math.sin(th * 7 + ph[4])); // the skirt spreads and breaks at the foot
      r += 0.008 * Math.exp(-((y - yB) * (y - yB)) / 0.00018);               // belt
      r -= 0.012 * sstep(0.03, 0, Math.abs(y - yB) - 0.012) * 0.2;
      r += 0.006 * Math.exp(-((y - yN + 0.075) * (y - yN + 0.075)) / 0.00012); // collar
      let d = rho - r;
      const hem = 0.055 + 0.038 * p1 * (c > -0.2 ? 1 : 0.4);
      d = smax(d, hem - y, 0.006);
      // ---- the over-garment ----
      if (dress === 'mantle') {
        const up = 0.78 * yN + 0.2 * yN * Math.max(0, Math.sin(-th * Math.sign(sw || 1) + 0.5)) + 0.25 * sstep(1.2, 2.6, Math.abs(th)), low = 0.33 * yN - 0.18 * yN * sstep(0.5, 2.8, Math.abs(th)) + 0.02 * Math.sin(th * 11 + ph[5]) + 0.012 * Math.sin(th * 23);
        const reg = Math.max(low - y, y - up);
        // Folds pulled on the diagonal from the held hip to the far shoulder: two scales, never in step
        const th0 = 0.25 * Math.sign(sw || 1), q = y + 0.15 * th * Math.sign(sw || 1) + 0.055 * (th - th0) * (th - th0);
        const swag = 0.62 * Math.sqrt(Math.abs(Math.sin(q * 12.5 + ph[6]))) + 0.38 * Math.sqrt(Math.abs(Math.sin(q * 27 + ph[7]))), back = Math.sqrt(Math.abs(Math.sin(th * 5 + ph[3])));
        const fr = sstep(1.9, 1.1, Math.abs(th));
        const rm = R + 0.03 + 0.04 * lerp(back - 0.6, swag - 0.58, fr) * sstep(up + 0.01, up - 0.08, y);
        d = smin(d, smax(rho - rm, reg, 0.007), 0.002);
      } else if (dress === 'chasuble') {
        // alb to the feet, dalmatic to the shin, the bell of the chasuble hanging from the arms in U folds
        const dal = Math.max(0.3 * yN + 0.012 * Math.sin(th * 9) - y, y - 0.86 * yN);
        d = smin(d, smax(rho - (R + 0.016 + 0.012 * (Math.sqrt(Math.abs(Math.sin(th * 6 + ph[2]))) - 0.5)), dal, 0.005), 0.0015);
        const lowC = (0.42 + 0.26 * sstep(0.2, 1.5, Math.abs(th)) - 0.2 * sstep(1.7, 3.0, Math.abs(th))) * yN + 0.012 * Math.sin(th * 13);
        const swag = 0.65 * Math.sqrt(Math.abs(Math.sin((y + 0.2 * th * th) * 27 + ph[6]))) + 0.35 * Math.sqrt(Math.abs(Math.sin((y + 0.13 * th * th) * 44 + ph[7])));
        const rc = R + 0.03 * sstep(yN, 0.9 * yN, y) + 0.022 * (swag - 0.58) * sstep(0.84 * yN, 0.74 * yN, y) * (1 - 0.6 * sstep(0, 0.2, 0.2 - Math.abs(th)));
        d = smin(d, smax(rho - rc, lowC - y, 0.007), 0.003);
        // the orphrey: a Y-band across the breast and down the front, left proud
        const py = y - 0.79 * yN;
        if (Math.abs(th) < 1.2 && y > lowC - 0.01 && y < 0.94 * yN) d = smin(d, Math.max(rho - rc - 0.011, py > 0 ? Math.abs(Math.abs(th) - py * 4.2) - 0.085 : Math.abs(th) - 0.09), 0.003);
      } else if (dress === 'royal') {
        // a heavy mantle open down the front, thrown back over the shoulders, deep folds to the floor
        const open = lerp(0.72, 0.28, sstep(0.05, 0.86, t)) + 0.05 * Math.sin(y * 19 + ph[2]);
        const reg = Math.max(open - Math.abs(th - 0.05), 0.05 - y);
        const hv = Math.sqrt(Math.abs(Math.sin(th * 4 + ph[3] + y * 0.3)));
        const collar = 0.022 * Math.exp(-((y - 0.915 * yN) * (y - 0.915 * yN)) / 0.0012); // a soft roll at the neck
        const rm = R + 0.03 * sstep(yN, 0.9 * yN, y) + collar + sstep(0.84 * yN, 0.5 * yN, y) * 0.056 * (hv - 0.62);
        d = smin(d, smax(rho - rm, reg, 0.006), 0.004);
      } else if (dress === 'angel') {
        // a girdled tunic blown a little to one side: fine folds and a bloused top
        const blouse = 0.018 * Math.exp(-((y - yB - 0.06) * (y - yB - 0.06)) / 0.003);
        d -= blouse;
        const low = 0.74 * yN + 0.02 * Math.sin(th * 7) - y;
        d = smin(d, smax(rho - (R + 0.016 * sstep(yN, 0.9 * yN, y) + 0.012 * (Math.sqrt(Math.abs(Math.sin(th * 7 + ph[2]))) - 0.5) * sstep(0.9 * yN, 0.8 * yN, y)), low, 0.005), 0.003);
      }
      // ---- shoulders and sleeves ----
      const yS = yN - 0.155;
      for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1; d = smin(d, sdEll(x - cxS, y - yS, z - zc - sg * Rs * 0.98, 0.07, 0.078, 0.058), 0.05); }
      for (let k = 0; k < arms.length; k++) {
        const A = arms[k];
        let ad = sdCone(x, y, z, A.S[0], A.S[1], A.S[2], A.E[0], A.E[1], A.E[2], 0.056, 0.05);
        // forearm in a sleeve that widens to the cuff, with a roll of cloth at the wrist
        const fx = A.W[0] - A.E[0], fy = A.W[1] - A.E[1], fz = A.W[2] - A.E[2], fl = fx * fx + fy * fy + fz * fz, ft = clamp(((x - A.E[0]) * fx + (y - A.E[1]) * fy + (z - A.E[2]) * fz) / fl);
        const qx = x - A.E[0] - fx * ft, qy = y - A.E[1] - fy * ft, qz = z - A.E[2] - fz * ft, ql = len3(qx, qy, qz);
        const rr = lerp(0.05, 0.062, ft) + 0.006 * Math.sin(ft * 15 + k) * (1 - ft) + 0.008 * Math.exp(-((ft - 0.97) * (ft - 0.97)) / 0.002);
        ad = smin(ad, ql - rr, 0.018);
        // the cloth that falls from under the forearm: a hanging curtain of pleats
        // longest under the wrist, thinning as it falls, its lower edge never straight
        if (A.drape) {
          const h = A.E[1] + fy * ft - y;
          if (h > -0.04 && h < A.drape * 1.1) {
            const fall = clamp(h / A.drape), crv = lerp(0.044, 0.016, fall) + 0.014 * (Math.sqrt(Math.abs(Math.sin(ft * 12 + h * 2.5 + k))) - 0.5);
            const curtain = len3(qx * 0.72, 0, qz) - crv;
            const edge = h - A.drape * (0.28 + 0.72 * ft) - 0.022 * Math.sin(ft * 11 + k * 2);
            ad = smin(ad, smax(curtain, edge, 0.012), 0.018);
          }
        }
        d = smin(d, ad, 0.014);
      }
      // ---- feet ----
      d = smin(d, foot(x, y, z), 0.006);
      return Math.max(d, y - yN - 0.03);
    },
  };
}
// Where the arms go, and what the hands do when they get there
function armPose(o, Rs, zc, cx) {
  const y = 1.55, shR = [cx, y, zc + Rs], shL = [cx, y, zc - Rs], arm = (S, E, W, drape) => ({ S, E, W, drape });
  switch (o.hold) {
    case 'key': return [arm(shR, [0.03, 1.2, zc + Rs + 0.05], [0.17, 1.32, zc + 0.12], 0.32), arm(shL, [0.03, 1.2, zc - Rs - 0.05], [0.17, 1.14, zc - 0.07], 0.34)];
    case 'crozier': return [arm(shR, [0.04, 1.2, zc + Rs + 0.06], [0.2, 1.3, zc + 0.14], 0.3), arm(shL, [0.05, 1.22, zc - Rs - 0.03], [0.2, 1.42, zc - 0.05], 0.3)];
    case 'sceptre': return [arm(shR, [0.04, 1.18, zc + Rs + 0.06], [0.2, 1.28, zc + 0.15], 0.34), arm(shL, [0.03, 1.2, zc - Rs - 0.03], [0.17, 1.18, zc - 0.05], 0.3)];
    case 'mantle': return [arm(shR, [0.04, 1.14, zc + Rs + 0.05], [0.18, 1.2, zc + 0.04], 0.34), arm(shL, [0.03, 1.2, zc - Rs - 0.05], [0.15, 1.4, zc - 0.1], 0.26)];
    case 'scroll': return [arm(shR, [0.05, 1.2, zc + Rs + 0.04], [0.2, 1.34, zc + 0.1], 0.28), arm(shL, [0.05, 1.2, zc - Rs - 0.04], [0.2, 1.22, zc - 0.08], 0.28)];
    case 'child': return [arm(shR, [0.05, 1.14, zc + Rs + 0.04], [0.2, 1.24, zc + 0.03], 0.32), arm(shL, [0.05, 1.14, zc - Rs - 0.02], [0.2, 1.18, zc - 0.13], 0.3)];
    case 'bless': return [arm(shR, [0.07, 1.22, zc + Rs + 0.09], [0.19, 1.5, zc + 0.15], 0.3), arm(shL, [0.03, 1.2, zc - Rs - 0.04], [0.17, 1.2, zc - 0.07], 0.34)];
    default: return [arm(shR, [0.02, 1.12, zc + Rs + 0.04], [0.15, 1.05, zc + 0.08], 0.3), arm(shL, [0.02, 1.12, zc - Rs - 0.04], [0.15, 1.05, zc - 0.08], 0.3)];
  }
}
// ---- Things held: real objects, modelled at the scale of the hands that grip them ---------
function addBook(b, m, o = {}) {
  b.at(m, () => {
    const w = o.w || 0.082, h = o.h || 0.112, th = o.th || 0.027;
    b.box(-h, h, -th, -th + 0.009, -w, w, { s: 0.85 }); b.box(-h, h, th - 0.009, th, -w, w, { s: 1 }); // boards
    b.box(-h + 0.006, h - 0.006, -th + 0.009, th - 0.009, -w + 0.006, w - 0.004, { s: 0.62 });          // pages
    b.box(-h, h, -th, th, -w - 0.009, -w, { s: 0.8 });                                                    // spine
    for (const i of [-1, 1]) for (const k of [-1, 1]) b.at(M.T(i * (h - 0.026), th, k * (w - 0.026)), () => b.lathe([[0.016, 0], [0.012, 0.007], [0.0, 0.009]], 6));
    b.at(M.T(0, th, 0), () => b.lathe([[0.03, 0], [0.024, 0.006], [0.0, 0.009]], 8));
  });
}
function addAttrs(fig, o, arms) {
  const { stone: b, gold: g } = fig, R = arms[0], Lf = arms[1];
  switch (o.hold) {
    case 'key': {
      // The great key of Peter held upright in the fist, the book against the left forearm
      const hp = [R.W[0] + 0.085, R.W[1] - 0.005, R.W[2] - 0.01];
      b.tube([[hp[0], hp[1] - 0.15, hp[2]], [hp[0], hp[1] + 0.2, hp[2]]], 0.0125, 8, { capStart: true });
      b.at(M.T(hp[0], hp[1] + 0.245, hp[2]), () => b.at(M.Rx(90), () => { b.lathe([[0.04, -0.01], [0.05, 0], [0.04, 0.01], [0.026, 0.01], [0.02, 0], [0.026, -0.01], [0.04, -0.01]], 14); }));
      b.box(hp[0] - 0.01, hp[0] + 0.01, hp[1] - 0.15, hp[1] - 0.075, hp[2], hp[2] + 0.07, { s: 0.9 });
      b.box(hp[0] - 0.012, hp[0] + 0.012, hp[1] - 0.112, hp[1] - 0.1, hp[2] + 0.03, hp[2] + 0.048, { s: 0.3 });
      addBook(b, M.of(M.T(Lf.W[0] + 0.1, Lf.W[1] + 0.03, Lf.W[2] + 0.0), M.Rz(-64), M.Ry(8)));
      break;
    }
    case 'crozier': {
      const hp = [R.W[0] + 0.085, R.W[1] - 0.005, R.W[2] - 0.01], top = 2.02;
      b.tube([[hp[0], 0.04, hp[2]], [hp[0], top, hp[2]]], 0.0145, 8, { capStart: true });
      for (const yK of [hp[1] + 0.22, top - 0.05]) b.at(M.T(hp[0], yK, hp[2]), () => b.lathe([[0.016, -0.03], [0.034, 0], [0.016, 0.03]], 8));
      const vol = []; for (let i = 0; i <= 20; i++) { const t = i / 20, a = -PI * 0.5 + t * PI * 2.5, r = lerp(0.115, 0.036, t); vol.push([hp[0] + r * Math.cos(a) * 1.0 + 0.0, top + 0.12 + r * Math.sin(a), hp[2]]); }
      g.tube(vol, (t) => lerp(0.02, 0.012, t), 7, { capStart: true });
      for (let i = 2; i < 16; i += 3) { const p = vol[i]; addCrocket(g, M.of(M.T(p[0], p[1], p[2]), M.Rz((i / 20) * 400 - 90)), 0.06, 0); }
      break;
    }
    case 'sceptre': {
      const hp = [R.W[0] + 0.085, R.W[1] - 0.005, R.W[2] - 0.01], top = 1.95;
      b.tube([[hp[0], hp[1] - 0.2, hp[2]], [hp[0], top, hp[2]]], 0.0125, 8, { capStart: true });
      g.at(M.T(hp[0], top, hp[2]), () => {
        g.lathe([[0.0125, 0], [0.03, 0.022], [0.038, 0.05], [0.026, 0.078], [0.01, 0.086]], 10);
        for (let i = 0; i < 3; i++) { const a = i * 120 + 90; g.at(M.Ry(a), () => g.tube(spline([[0, 0.07, 0], [0.038, 0.1, 0], [0.042, 0.15, 0], [0.018, 0.17, 0]], 2), (t) => [lerp(0.016, 0.003, t), lerp(0.024, 0.004, t)], 6)); }
      });
      break;
    }
    case 'scroll': {
      const p = [Lf.W[0] + 0.07, Lf.W[1], Lf.W[2]];
      const path = []; for (let i = 0; i <= 14; i++) { const t = i / 14; path.push([R.W[0] + 0.09 + 0.02 * Math.sin(t * 5), R.W[1] - t * 0.7 + 0.03, lerp(R.W[2] - 0.03, Lf.W[2] + 0.05, sstep(0, 0.5, t)) + 0.02 * Math.sin(t * 7)]); }
      const sheet = (off, flip) => b.grid((u, v) => { const k = u * 14, i = Math.min(13, Math.floor(k)), f = k - i, q = path[i], w = path[i + 1]; return [lerp(q[0], w[0], f) + off, lerp(q[1], w[1], f), lerp(q[2], w[2], f) + (v - 0.5) * 0.15, 0.96]; }, 14, 1, { flip });
      sheet(0, false); sheet(-0.004, true);
      b.at(M.of(M.T(path[14][0], path[14][1] - 0.015, path[14][2]), M.Rx(90)), () => b.lathe([[0.022, -0.085], [0.024, -0.08], [0.024, 0.08], [0.022, 0.085]], 8));
      break;
    }
    case 'bless': {
      addBook(b, M.of(M.T(Lf.W[0] + 0.1, Lf.W[1] + 0.03, Lf.W[2]), M.Rz(-64), M.Ry(4)));
      break;
    }
    default: break;
  }
}
const CROWN_FLEURS = 8;
function addCrown(g, m, R0, tall = 1) {
  g.at(m, () => {
    g.lathe([[R0, 0], [R0 + 0.009, 0.004], [R0 + 0.009, 0.028], [R0 + 0.015, 0.038], [R0 + 0.006, 0.042], [R0 - 0.004, 0.034], [R0 - 0.004, 0]], 26);
    // jewels set in the band
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; blob(g, [(R0 + 0.013) * Math.cos(a), 0.02, (R0 + 0.013) * Math.sin(a)], [0.0072, 0.0072, 0.0072], 5, 3); }
    // Fleurs-de-lis cut from sheet: flat plates set on the rim, the way a goldsmith makes them
    const h = 0.05 * tall, fl = [[-0.03, 0], [0.03, 0], [0.024, h * 0.2], [0.04, h * 0.42], [0.031, h * 0.62], [0.017, h * 0.42], [0.009, h * 0.5], [0.012, h * 0.76], [0, h * 1.1], [-0.012, h * 0.76], [-0.009, h * 0.5], [-0.017, h * 0.42], [-0.031, h * 0.62], [-0.04, h * 0.42], [-0.024, h * 0.2]];
    for (let i = 0; i < CROWN_FLEURS; i++) {
      const a = (i + 0.5) * 360 / CROWN_FLEURS;
      g.at(M.of(M.Ry(90 - a), M.T(0, 0.03, R0 + 0.004)), () => g.slab(fl, [], -0.004, 0.004, { so: 1, sr: 1 }));
    }
  });
}

const figF = {}; // fields kept while a figure is carved
const yNeck = 1.7;
async function makeFigure(kind) {
  const o = FIGURES[kind], stone = new Batch(TILE.fine), gold = new Batch(TILE.gold);
  const body = bodyField(o), arms = body.arms, hO = Object.assign({ seed: o.seed }, o.head);
  // Head frame: gently inclined, sitting on the neck above the centre of the shoulders
  const zc = arms[0].S[2] - (0.142 * (o.slim || 1)), cx = arms[0].S[0];
  const headM = M.of(M.T(cx + 0.024, yNeck + 0.116, zc + (o.sway || 0) * 0.3), M.Ry(hO.turn || 0), M.Rx(hO.tilt || 0), M.Rz(-5));
  const hF = headField(hO), toHead = invRigid(headM);
  const headW = (x, y, z) => { const q = toHead(x, y, z); return hF(q[0], q[1], q[2]); };
  // Hands: frames derived from the sleeve so that the wrist always leaves the cuff
  const hands = [];
  const handFor = (A, side, pose) => {
    const X0 = [A.W[0] - A.E[0], A.W[1] - A.E[1], A.W[2] - A.E[2]];
    let Y0;
    if (pose === 'support') Y0 = [0.2, -1, 0];                                      // palm up under a book
    else if (pose === 'bless') Y0 = [0, 0.1, side];                                 // palm turned forward, two fingers raised
    else Y0 = [0, 0, side];                                                          // back of the hand outward
    const X = pose === 'bless' ? [0.25, 1, 0.05] : X0;
    return { m: frameOf(A.W, X, Y0), pose, thumb: pose === 'grip' || pose === 'edge' || pose === 'rest' ? -side : side };
  };
  const handsCfg = { key: ['grip', 'support'], crozier: ['grip', 'rest'], sceptre: ['grip', 'rest'], mantle: ['rest', 'rest'], scroll: ['edge', 'rest'], child: ['rest', 'support'], bless: ['bless', 'support'] }[o.hold] || ['rest', 'rest'];
  hands.push(handFor(arms[0], 1, handsCfg[0]), handFor(arms[1], -1, handsCfg[1]));
  const handFs = hands.map((h) => { const f = handField(h.pose, h.thumb), inv = invRigid(h.m); return (x, y, z) => { const q = inv(x, y, z); return f(q[0], q[1], q[2]); }; });
  // The Child: a real little person on the Virgin's arm, turning to her
  let childF = null, childM = null;
  if (o.hold === 'child') {
    const A = arms[1];
    // sits in the crook of her left arm, turned towards her, one small hand raised to her veil
    childM = M.of(M.T(A.W[0] - 0.015, A.W[1] + 0.082, A.W[2] - 0.0), M.Ry(-34), M.Rz(4));
    const cH = headField({ hair: 'curls', seed: 21, smile: 0.6 }), inv = invRigid(childM), k = 0.47;
    childF = (x, y, z) => {
      const q = inv(x, y, z), X = q[0], Y = q[1], Z = q[2];
      // A seated child in a long shift: torso, thighs across her arm, shins and small feet hanging
      let d = sdCone(X, Y, Z, 0, 0, 0, 0, 0.165, 0, 0.066, 0.05);
      for (const s of [-1, 1]) {
        d = smin(d, sdCone(X, Y, Z, 0.0, 0.0, s * 0.034, 0.125, -0.012, s * 0.04, 0.038, 0.03), 0.018);   // thigh
        d = smin(d, sdCone(X, Y, Z, 0.125, -0.012, s * 0.04, 0.142, -0.135, s * 0.038, 0.03, 0.022), 0.012); // shin
        d = smin(d, sdCone(X, Y, Z, 0.142, -0.15, s * 0.038, 0.19, -0.17, s * 0.04, 0.02, 0.013), 0.006);   // foot
      }
      d -= 0.005 * Math.sqrt(Math.abs(Math.sin(Math.atan2(Z, X) * 6 + Y * 4))) * sstep(0.12, 0.0, Y) * sstep(-0.1, 0.0, Y);
      d = smin(d, sdCone(X, Y, Z, 0.005, 0.135, -0.052, 0.06, 0.07, -0.05, 0.02, 0.016), 0.012);          // one arm holds an orb on his knee
      d = smin(d, len3(X - 0.1, Y - 0.052, Z + 0.042) - 0.03, 0.003);
      d = smin(d, len3(X - 0.074, Y - 0.056, Z + 0.054) - 0.015, 0.004);
      d = smin(d, sdCone(X, Y, Z, 0.0, 0.145, 0.05, -0.005, 0.2, 0.094, 0.02, 0.015), 0.012);             // the other reaches back to touch her veil
      d = smin(d, len3(X + 0.007, Y - 0.214, Z - 0.104) - 0.0155, 0.005);
      d = smin(d, cH((X - 0.008) / k, (Y - 0.262) / k, Z / k) * k, 0.012);
      return d;
    };
  }
  const allF = (x, y, z) => {
    let d = body.F(x, y, z);
    d = Math.min(d, headW(x, y, z));
    for (let i = 0; i < handFs.length; i++) d = Math.min(d, handFs[i](x, y, z));
    if (childF) d = Math.min(d, childF(x, y, z));
    return d;
  };
  // ---- carve ----
  await carveInto(stone, body.F, [-0.42, -0.005, -0.52, 0.42, yNeck + 0.04, 0.52], 0.0105, o.wings ? 3800 : 4400, null, allF);
  const head = await headBatch(o.headKey);
  for (let i = 0; i < hands.length; i++) {
    const hb = await handBatch(hands[i].pose, hands[i].thumb);
    const base = stone.count;
    copyBatch(stone, hb, hands[i].m);
  }
  if (childF) await carveInto(stone, childF, [arms[1].W[0] - 0.24, arms[1].W[1] - 0.2, arms[1].W[2] - 0.26, arms[1].W[0] + 0.3, arms[1].W[1] + 0.56, arms[1].W[2] + 0.26], 0.0042, 3200, null, allF, { smooth: 1, ao: 0.34, aoMin: 0.3 });
  addAttrs({ stone, gold }, o, arms);
  // Crown, nimbus and wings
  if (o.head.crown) addCrown(gold, M.of(headM, M.T(-0.012, o.head.veil ? 0.088 : 0.096, 0)), o.head.veil ? 0.088 : 0.084);
  if (o.nimbus) gold.at(M.of(headM, M.T(-0.16, 0.03, 0), M.Ry(90)), () => { gold.slab(ringPts(0, 0, 0.235, 28), [], -0.014, 0.014, { sb: 0.8 }); });
  if (o.wings) {
    // Feathers in overlapping tiers, carved on a blade that rises from the shoulders and falls to the calf
    const W = (side) => (x, y, z) => {
      const zz = z * side - 0.12 - zc * side, X = x + 0.085 + zz * 0.18, u = clamp((1.86 - y) / 1.32), wid = 0.27 * Math.pow(Math.sin(PI * Math.pow(u, 0.6)), 0.65) * (1 - 0.3 * u);
      const v = zz - 0.03 - u * 0.1 + 0.015;
      let d = Math.abs(X + 0.05 * u) - 0.026 + 0.012 * u;
      d = Math.max(d, Math.abs(v - wid * 0.5) - wid * 0.5, y - 1.87, 0.53 - y);
      // Tiers of feathers: short and scaled over the shoulder, long pointed quills towards the tip
      const row = Math.abs(Math.sin(u * 14 + v * 6)), bars = Math.abs(Math.sin(v * 26 + u * 7));
      d -= 0.015 * Math.sqrt(row) * sstep(0.45, 0.2, u) + 0.016 * Math.sqrt(bars) * sstep(0.2, 0.42, u);
      return d * 0.8;
    };
    for (const side of [-1, 1]) await carveInto(stone, W(side), [-0.3, 0.5, side > 0 ? zc + 0.05 : zc - 0.72, 0.1, 1.9, side > 0 ? zc + 0.72 : zc - 0.05], 0.0105, 900, null, allF);
  }
  stone.isFigure = true;
  return { stone, gold, head, headM };
}
// ---- Seated and kneeling figures for the tympana: same people, other postures -------------
function poseField(kind) {
  if (kind === 'seated') return (x, y, z) => {
    // A figure enthroned: knees forward, the robe falling from them in a curtain to the feet
    const th = Math.atan2(z, x);
    let d = sdCone(x, y, z, -0.04, 0.72, 0, -0.03, 1.38, 0, 0.17, 0.13);
    d = smin(d, sdEll(x, y - 1.46, z, 0.09, 0.12, 0.17), 0.03);
    for (const s of [-1, 1]) {
      d = smin(d, sdCone(x, y, z, -0.03, 0.7, s * 0.1, 0.27, 0.68, s * 0.11, 0.1, 0.09), 0.03);
      const cur = sdCone(x, y, z, 0.27, 0.64, s * 0.11, 0.31, 0.04, s * 0.1, 0.09, 0.12);
      d = smin(d, cur - 0.012 * Math.sqrt(Math.abs(Math.sin(z * 34 + x * 4))), 0.03);
    }
    d = smin(d, sdCone(x, y, z, 0.16, 0.45, 0, 0.27, 0.04, 0, 0.11, 0.16) - 0.014 * Math.sqrt(Math.abs(Math.sin(z * 30 + 1))), 0.03);
    // the lap folds run across, the bodice is drawn up
    d -= 0.012 * Math.sqrt(Math.abs(Math.sin((y + 0.12 * z * z * 40) * 28))) * sstep(0.95, 0.7, y) * sstep(0.45, 0.62, y);
    d -= 0.009 * Math.sqrt(Math.abs(Math.sin(th * 7 + y * 2))) * sstep(0.8, 1.0, y);
    return Math.max(d, -y);
  };
  return (x, y, z) => {
    // Kneeling in prayer, turned to the centre
    const th = Math.atan2(z, x);
    let d = sdCone(x, y, z, -0.1, 0.4, 0, 0.03, 1.04, 0, 0.16, 0.12);
    d = smin(d, sdEll(x - 0.05, y - 1.12, z, 0.08, 0.1, 0.15), 0.03);
    d = smin(d, sdCone(x, y, z, -0.14, 0.18, 0, 0.24, 0.13, 0, 0.2, 0.13), 0.05);
    d -= 0.018 * Math.sqrt(Math.abs(Math.sin(th * 6 + y * 1.5))) * sstep(0.72, 0.28, y);
    d -= 0.008 * Math.sqrt(Math.abs(Math.sin(th * 8 - y * 2))) * sstep(0.5, 0.8, y);
    return Math.max(d, -y);
  };
}
async function makePosed(kind, spec) {
  const stone = new Batch(TILE.fine), gold = new Batch(TILE.gold), bF = poseField(kind), hO = Object.assign({ seed: 3 }, spec.head);
  const hy = kind === 'seated' ? 1.74 : 1.36, hx = kind === 'seated' ? -0.01 : 0.075;
  const headM = M.of(M.T(hx, hy, 0), M.Ry(hO.turn || 0), M.Rx(hO.tilt || 0), M.Rz(hO.nod || -6));
  const allF = bF, head = await headBatch(spec.headKey);
  stone.isFigure = true;
  await carveInto(stone, bF, [-0.42, -0.005, -0.42, 0.56, kind === 'seated' ? 1.62 : 1.26, 0.42], 0.0145, 2600, null, allF);
  if (hO.crown) addCrown(gold, M.of(headM, M.T(-0.014, 0.1, 0)), hO.veil ? 0.106 : 0.098);
  // Forearms and hands: joined in prayer when kneeling, one raised when enthroned
  const hand = await handBatch(kind === 'seated' ? 'bless' : 'support', 1);
  if (kind === 'seated') {
    const A = spec.bless === false ? null : { W: [0.2, 1.32, 0.17] };
    const armF = (x, y, z) => { let d = sdCone(x, y, z, -0.02, 1.42, 0.17, 0.06, 1.02, 0.23, 0.066, 0.055); d = smin(d, sdCone(x, y, z, 0.06, 1.02, 0.23, 0.2, 1.3, 0.17, 0.055, 0.058), 0.02); d = Math.min(d, smin(sdCone(x, y, z, -0.02, 1.42, -0.17, 0.05, 1.02, -0.22, 0.066, 0.055), sdCone(x, y, z, 0.05, 1.02, -0.22, 0.27, 0.92, -0.08, 0.055, 0.058), 0.02)); return d; };
    await carveInto(stone, armF, [-0.12, 0.84, -0.34, 0.36, 1.52, 0.34], 0.0125, 700, null, allF);
    copyBatch(stone, hand, frameOf([0.2, 1.3, 0.17], [0.25, 1, 0.05], [0, 0.1, 1]));
    addBook(stone, M.of(M.T(0.36, 0.92, -0.08), M.Rz(-78)), { w: 0.11, h: 0.15 });
  } else {
    const armF = (x, y, z) => { let d = 1e9; for (const s of [-1, 1]) d = Math.min(d, smin(sdCone(x, y, z, 0.03, 1.03, s * 0.15, 0.1, 0.8, s * 0.17, 0.062, 0.05), sdCone(x, y, z, 0.1, 0.8, s * 0.17, 0.25, 0.97, s * 0.04, 0.05, 0.055), 0.02)); return d; };
    await carveInto(stone, armF, [-0.08, 0.68, -0.3, 0.34, 1.12, 0.3], 0.0125, 600, null, allF);
    for (const s of [-1, 1]) copyBatch(stone, hand, frameOf([0.25, 0.97, s * 0.04], [0.5, 1, -s * 0.05], [1, -0.4, s * 0.9]));
  }
  return { stone, gold, head, headM };
}

// Cache of finished figures. Lower-detail copies for the arches come from the same sculpture.
const FIG_CACHE = {};
async function lightCopy(src, tris) { // the same surface with fewer triangles, keeping its uvs and carved occlusion
  const g = await simplifyGeometry(src.toGeo(), { targetTriangles: tris });
  const T = src.tile, b = new Batch(T), p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color, idx = g.index;
  for (let i = 0; i < p.count; i++) b.v(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), u.getX(i) * T, u.getY(i) * T, c ? c.getX(i) : 1);
  for (let t = 0; t < idx.count; t += 3) b.tri(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
  return b;
}
async function lowDetail(src, tris) {
  const b = await lightCopy(src.stone, tris);
  b.isFigure = true;
  // A figure high in the arches carries a light copy of its head inside its own mesh: fewer draws, fewer triangles
  if (!src.head.low) src.head.low = await lightCopy(src.head, 420);
  copyBatch(b, src.head.low, src.headM);
  return { stone: b, gold: new Batch(TILE.gold) };
}
async function prepareFigures(kinds) {
  for (const k of kinds) FIG_CACHE[k + '|1'] = await makeFigure(k);
  if (P.preview !== 'statues') {
    for (const k of ['apostle', 'king', 'angel', 'bishop', 'queen']) if (FIG_CACHE[k + '|1']) FIG_CACHE[k + '|0'] = await lowDetail(FIG_CACHE[k + '|1'], P.archFigureTris);
    for (let k = 0; k < 3; k++) GARGOYLES[k] = await lightCopy(makeGargoyle(k), 800);
    FIG_CACHE['seated|1'] = await makePosed('seated', { headKey: 'bearded', head: { hair: 'long', beard: 1, seed: 9, nod: -2 } });
    FIG_CACHE['seatedVirgin|1'] = await makePosed('seated', { headKey: 'veiled', head: { veil: 1, crown: 1, smile: 0.35, seed: 8, turn: -14, tilt: 4 } });
    FIG_CACHE['kneel|1'] = await makePosed('kneel', { headKey: 'veiled', head: { veil: 1, seed: 8, tilt: 0, nod: 8 } });
    FIG_CACHE['kneel|0'] = await lowDetail(FIG_CACHE['kneel|1'], P.archFigureTris);
  }
}
function figure(name, lod = 1) {
  const k = FIG_ALIAS[name] || name;
  return FIG_CACHE[k + '|' + lod] || FIG_CACHE[k + '|1'];
}
// Body and head are separate nodes: lod 0 lightens the body only, a head costs its bytes once however often it appears
function placeFigure(name, kind, o = {}) {
  const f = figure(kind, o.lod === undefined ? 1 : o.lod);
  if (!f) return null;
  const s = o.scale || 1, sc = o.mirror ? [s, s, -s] : [s, s, s];
  const mat = o.indoor ? MAT.figureIn : o.deep ? MAT.figureDeep : o.half ? MAT.figureHalf : MAT.figure;
  const stone = place(name, f.stone, mat, { pos: o.pos, rot: o.rot, scale: sc, parent: o.parent });
  place(name + '_Gilt', f.gold, MAT.gold, { pos: o.pos, rot: o.rot, scale: sc, parent: o.parent });
  let headPart = null;
  if (f.head) {
    const m = f.headM, e = eulerFromBasis([m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]);
    headPart = place(name + '_Head', f.head, mat, { pos: [m[3], m[7], m[11]], rot: e, parent: stone || undefined });
  }
  if (stone && !o.indoor && !o.deep && !o.half) FIG_PLACED.push({ part: stone, head: headPart });
  return stone;
}
const FIG_PLACED = [];

// ---- Foliage and crockets ----------------------------------------------------------
// One carved leaf curling at the tip; local +Y up the surface, +X outward from the host
function addLeaf(b, m, size = 1, o = {}) {
  b.at(m, () => {
    const nu = o.coarse ? 2 : 4, nv = o.coarse ? 3 : 4;
    b.grid((u, v) => {
      const s = (u - 0.5) * 2, W = 0.5 * Math.sin(PI * Math.pow(v, 0.72)) * (1 - 0.35 * v);
      const curl = Math.pow(v, 2.2);
      const lobes = 1 + 0.18 * Math.sin(v * 16) * Math.abs(s);
      const rib = 0.05 * (1 - Math.abs(s));
      return [size * (rib + 0.3 * curl - 0.42 * curl * curl * curl + 0.12 * s * s), size * (v - 0.3 * curl * v), size * (s * W * lobes), 0.72 + 0.28 * (1 - Math.abs(s)) + 0.1 * curl];
    }, nu, nv, { flip: true });
  });
}
// A crocket: a bud of curled foliage that sits on an arris. Local +X away from the arris, +Y up the slope.
function addCrocket(b, m, size = 1, lod = 1) {
  b.at(m, () => {
    const path = [];
    const N = lod ? 5 : 3;
    for (let i = 0; i <= N; i++) { const t = i / N, a = -0.9 + t * 3.8, r = lerp(0.3, 0.12, t) * size; path.push([size * 0.16 + r * Math.cos(a) * 0.95, size * 0.1 + r * Math.sin(a) * 0.9, 0]); }
    b.tube(path, (t) => [lerp(0.14, 0.05, t) * size, lerp(0.17, 0.07, t) * size], lod ? 5 : 3, { capStart: false, capEnd: false, ringS: (a) => 0.8 + 0.2 * Math.cos(a) });
    if (lod) for (const s of [-1, 1]) b.tube([[0.02 * size, 0.02 * size, 0], [0.2 * size, 0.1 * size, s * 0.22 * size], [0.34 * size, 0.26 * size, s * 0.3 * size]], (t) => [lerp(0.07, 0.015, t) * size, lerp(0.05, 0.02, t) * size], 3, { capEnd: false });
  });
}
function addFinial(b, h = 1, lod = 1) { // cross-shaped foliate finial, base at y=0
  b.lathe([[0.12 * h, 0], [0.1 * h, 0.05 * h], [0.14 * h, 0.09 * h], [0.08 * h, 0.14 * h], [0.05 * h, 0.5 * h], [0.09 * h, 0.56 * h], [0.05 * h, 0.62 * h], [0.02 * h, 0.98 * h], [0, h]], lod ? 8 : 5);
  for (let i = 0; i < 4; i++) {
    const a = i * 90 + 45;
    addLeaf(b, M.of(M.T(0, 0.14 * h, 0), M.Ry(a), M.T(0.05 * h, 0, 0)), 0.4 * h, { coarse: 1 });
    if (lod) addLeaf(b, M.of(M.T(0, 0.58 * h, 0), M.Ry(a + 45), M.T(0.03 * h, 0, 0)), 0.3 * h, { coarse: 1 });
  }
}
// Crockets up an edge from p to q (3D), with `dir` the outward direction in the frame
function crocketsAlong(b, p, q, n, size, out, lod = 1) {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d);
  const dn = d.map((c) => c / L);
  let ox = out[0], oy = out[1], oz = out[2]; const od = ox * dn[0] + oy * dn[1] + oz * dn[2]; ox -= od * dn[0]; oy -= od * dn[1]; oz -= od * dn[2];
  const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
  const zx = ox * 0, side = [dn[1] * oz - dn[2] * oy, dn[2] * ox - dn[0] * oz, dn[0] * oy - dn[1] * ox];
  // columns: X = out, Y = along edge, Z = side
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, pz = [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
    const m = [ox, dn[0], -side[0], pz[0], oy, dn[1], -side[1], pz[1], oz, dn[2], -side[2], pz[2]];
    addCrocket(b, m, size * lerp(1, 0.78, t), lod);
  }
}

// Crocketed pinnacle: square shaft with gablets, a spirelet with crockets and a finial.
function addPinnacle(b, w, h, o = {}) {
  const hw = w / 2, shaftH = h * 0.42, gableH = w * 0.95, lod = o.lod === undefined ? 1 : o.lod;
  if (o.simple) { // far-away pinnacle: faceted shaft, spirelet, a few crockets, finial
    b.lathe([[hw * 1.414, 0], [hw * 1.414, shaftH], [hw * 1.6, shaftH + w * 0.06], [hw * 1.3, shaftH + w * 0.12], [hw * 0.1, h * 0.86]], 4, { faceted: true, phase: PI / 4 });
    for (let i = 0; i < 4; i++) { const a = rad(i * 90 + 45), c = Math.cos(a), s = Math.sin(a), bR = hw * 1.3 * 1.0; crocketsAlong(b, [c * bR, shaftH + w * 0.14, s * bR], [c * hw * 0.14, h * 0.84, s * hw * 0.14], 2, w * 0.46, [c, 0.15, s], 0); }
    b.at(M.T(0, h * 0.84, 0), () => addFinial(b, h * 0.16, 0));
    return;
  }
  // Shaft with moulded base and blind lancet panels
  b.lathe([[hw * 1.44, 0], [hw * 1.44, w * 0.06], [hw * 1.3, w * 0.12], [hw * 1.3, w * 0.2], [hw * 1.26, w * 0.24]], 4, { faceted: true, phase: PI / 4 });
  b.lathe([[hw * 1.414, w * 0.2], [hw * 1.414, shaftH]], 4, { faceted: true, phase: PI / 4, s: 0.95 });
  for (let i = 0; i < 4; i++) b.at(M.Ry(i * 90), () => {
    const pw = w * 0.62, y0 = w * 0.35, ys = shaftH - w * 0.5;
    b.at(M.T(hw + 0.004, 0, 0), () => b.at(M.Ry(90), () => { // panel recessed look: shaded inset lancet with moulded frame
      b.sweep(ofsXY(pointedArc(pw, pw * 0.85, 3), 0, ys), hexBar(w * 0.07, w * 0.08), { caps: false, s: 0.92 });
      b.sweep([[-pw / 2, y0], [-pw / 2, ys]], hexBar(w * 0.07, w * 0.08), { caps: false, s: 0.92 });
      b.sweep([[pw / 2, y0], [pw / 2, ys]], hexBar(w * 0.07, w * 0.08), { caps: false, s: 0.92 });
      b.face([[-pw / 2, y0, -0.002, 0.5], [pw / 2, y0, -0.002, 0.5], [pw / 2, ys, -0.002, 0.5], [0, ys + pw * 0.8, -0.002, 0.45], [-pw / 2, ys, -0.002, 0.5]]);
    }));
    // Gablet on each face with crockets
    b.at(M.T(hw * 0.96, shaftH, 0), () => {
      b.slabX = true;
      b.at(M.Ry(90), () => b.slab([[-hw * 1.04, 0], [hw * 1.04, 0], [0, gableH]], [], 0, w * 0.08, { sf: 1, sb: 0.8 }));
      crocketsAlong(b, [0.02, 0.02, -hw * 0.98], [0.02, gableH * 0.96, 0], lod ? 2 : 1, w * 0.26, [0.1, 1, -1], 0);
      crocketsAlong(b, [0.02, 0.02, hw * 0.98], [0.02, gableH * 0.96, 0], lod ? 2 : 1, w * 0.26, [0.1, 1, 1], 0);
      b.at(M.T(0.04, gableH * 0.94, 0), () => addFinial(b, w * 0.34, 0));
    });
  });
  // Cornice ring and spirelet
  b.at(M.T(0, shaftH, 0), () => {
    b.lathe([[hw * 1.414, 0], [hw * 1.6, w * 0.06], [hw * 1.6, w * 0.1], [hw * 1.414, w * 0.14]], 4, { faceted: true, phase: PI / 4 });
    const sh = h - shaftH - w * 0.1;
    b.at(M.T(0, w * 0.12, 0), () => {
      b.lathe([[hw * 1.3, 0], [hw * 0.09, sh * 0.82]], 8, { faceted: true, phase: PI / 8 });
      const n = lod ? 5 : 3;
      for (let i = 0; i < 4; i++) {
        const a = rad(i * 90 + 22.5 + 22.5 * 0);
        const c = Math.cos(a + rad(22.5)), s = Math.sin(a + rad(22.5));
        const bR = hw * 1.3 * Math.cos(rad(0)), tR = hw * 0.09;
        crocketsAlong(b, [c * bR, sh * 0.04, s * bR], [c * tR, sh * 0.8, s * tR], n, w * 0.36, [c, 0.12, s], lod);
      }
      b.at(M.T(0, sh * 0.8, 0), () => (o.finial || b) === b ? addFinial(b, sh * 0.22 + w * 0.1, lod) : null);
    });
  });
}

// ---- Gargoyle ------------------------------------------------------------------------
// A crouching beast thrusting out from the wall along +X, root at the origin. About 2.3 m long.
function makeGargoyle(kind = 0) {
  const b = new Batch(TILE.fine), rng = mkRng(kind * 17 + 5);
  const ridge = (kind === 1 ? 0.3 : 0.22);
  const headY = kind === 2 ? 0.1 : 0.34;
  const spine = spline([[-0.3, -0.05, 0], [0.22, 0.2, 0], [0.75, 0.3, 0], [1.2, 0.2, 0], [1.56, headY, 0]], 5);
  b.tube(spine, (t) => { const r = keyf([[0, 0.34, 0.3], [0.25, 0.36, 0.34], [0.55, 0.22, 0.24], [0.82, 0.16, 0.17], [1, 0.19, 0.2]], t); return [r[0], r[1]]; }, 16, {
    capStart: true,
    up: [0, 1, 0],
    ring: (a, t) => 1 + ridge * Math.pow(Math.max(Math.cos(a), 0), 10) * Math.abs(Math.sin(t * 26)) + 0.05 * Math.abs(Math.sin(a * 5 + t * 11)),
    ringS: (a, t) => 0.74 + 0.26 * Math.abs(Math.sin(a * 5 + t * 11)),
  });
  // Skull, snout, gaping jaws
  const hx = 1.56, hy = headY;
  blob(b, [hx + 0.05, hy + 0.03, 0], [0.22, 0.19, 0.2], 14, 10, 0.92);
  b.tube(spline([[hx + 0.1, hy + 0.06, 0], [hx + 0.34, hy + 0.05, 0], [hx + 0.56, hy + 0.1, 0]], 3), (t) => [lerp(0.14, 0.07, t), lerp(0.15, 0.085, t)], 10, { capStart: true, up: [0, 1, 0], ring: (a, t) => 1 + 0.2 * Math.pow(Math.max(Math.cos(a), 0), 6) * Math.abs(Math.sin(t * 9)) });
  b.shade(0.9, () => b.tube(spline([[hx + 0.05, hy - 0.1, 0], [hx + 0.28, hy - 0.2, 0], [hx + 0.5, hy - 0.2, 0]], 3), (t) => [lerp(0.09, 0.045, t), lerp(0.125, 0.07, t)], 10, { capStart: true, up: [0, 1, 0] }));
  b.shade(0.34, () => blob(b, [hx + 0.2, hy - 0.06, 0], [0.16, 0.085, 0.095], 8, 5));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const f = i / 3.5;
    b.tube([[hx + 0.26 + f * 0.27, hy + 0.0 + f * 0.075, s * lerp(0.1, 0.06, f)], [hx + 0.27 + f * 0.27, hy - 0.08 + f * 0.075, s * lerp(0.1, 0.06, f)]], (t) => lerp(0.018, 0.002, t), 4, { capStart: true });
    b.tube([[hx + 0.22 + f * 0.27, hy - 0.15, s * lerp(0.1, 0.05, f)], [hx + 0.22 + f * 0.27, hy - 0.08, s * lerp(0.1, 0.05, f)]], (t) => lerp(0.016, 0.002, t), 4, { capStart: true });
  }
  // Brow, eyes, ears or horns
  for (const s of [-1, 1]) {
    b.tube(spline([[hx + 0.02, hy + 0.2, s * 0.03], [hx + 0.17, hy + 0.17, s * 0.1], [hx + 0.24, hy + 0.12, s * 0.15]], 2), (t) => lerp(0.03, 0.02, t), 5, { capStart: true });
    b.shade(0.38, () => blob(b, [hx + 0.21, hy + 0.09, s * 0.11], [0.05, 0.04, 0.045], 6, 4));
    blob(b, [hx + 0.235, hy + 0.09, s * 0.115], [0.024, 0.022, 0.022], 6, 4);
    if (kind === 1) b.tube(spline([[hx - 0.05, hy + 0.14, s * 0.11], [hx - 0.1, hy + 0.3, s * 0.18], [hx - 0.25, hy + 0.42, s * 0.2], [hx - 0.42, hy + 0.42, s * 0.15]], 3), (t) => lerp(0.05, 0.005, t), 6, { capStart: true });
    else b.grid((u, v) => { const L = 0.3, W = 0.09 * Math.sin(PI * u); return [hx - 0.08 - u * L * 0.5, hy + 0.13 + u * L * 0.7, s * (0.13 + u * 0.09 + (v - 0.5) * W * 2), 0.7 + 0.3 * Math.abs(v - 0.5) * 2]; }, 4, 2, { flip: s > 0 });
    if (kind === 1) { /* also add jowls */ blob(b, [hx + 0.1, hy - 0.04, s * 0.13], [0.09, 0.06, 0.05], 6, 4, 0.9); }
    // Fore leg gripping the ledge
    const sh = [0.5, 0.12, s * 0.3], el = [0.68, -0.28, s * 0.42], wr = [0.98, -0.42, s * 0.3];
    b.tube(spline([sh, el, wr], 4), (t) => keyf([[0, 0.16], [0.4, 0.105], [1, 0.07]], t)[0], 10, { capStart: true, ring: (a, t) => 1 + 0.08 * Math.abs(Math.sin(a * 3 + t * 8)) });
    blob(b, wr, [0.1, 0.06, 0.09], 8, 5);
    for (let i = -1; i <= 1; i++) b.tube(spline([[wr[0] + 0.03, wr[1], wr[2] + i * 0.05], [wr[0] + 0.14, wr[1] - 0.02, wr[2] + i * 0.08], [wr[0] + 0.21, wr[1] - 0.11, wr[2] + i * 0.09]], 2), (t) => lerp(0.032, 0.004, t), 5);
    // Folded wing
    const span = kind === 0 ? 0.95 : 0.7;
    const wingFn = (off) => (u, v) => {
      const L = u * span, W = 0.44 * Math.sin(PI * Math.pow(u, 0.7));
      const memb = Math.abs(Math.sin(v * 7.5 + u * 1.2)) * 0.05 * u;
      return [0.42 - L + (off), 0.3 + 0.48 * Math.sin(u * 1.25) * (1 - v * 0.9) - v * W * 0.75 + memb, s * (0.27 + 0.2 * u + v * W * 0.5), 0.68 + 0.32 * (memb / 0.05)];
    };
    b.grid(wingFn(0), 7, 5, { flip: s < 0 });
    b.grid(wingFn(-0.02), 7, 5, { flip: s > 0 });
  }
  return b;
}
const GARGOYLES = [];
function gargoyle(kind) { if (!GARGOYLES[kind]) GARGOYLES[kind] = makeGargoyle(kind); return GARGOYLES[kind]; }

// ==================================================================================
// STAINED GLASS: a tiny vector-art engine producing real leaded panes.
// Every shape is a pane of pot-metal colour with a came (lead strip) around it; large
// figures get painted grisaille lines. Windows are geometry, so they stay crisp at any distance.
// ==================================================================================
function offsetPoly(pts, d) {
  const n = pts.length, s = area2(pts) >= 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    let ax = b[0] - a[0], ay = b[1] - a[1], cx = c[0] - b[0], cy = c[1] - b[1];
    const la = Math.hypot(ax, ay) || 1, lc = Math.hypot(cx, cy) || 1; ax /= la; ay /= la; cx /= lc; cy /= lc;
    let nx = (ay + cy) * s, ny = -(ax + cx) * s; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const k = clamp(1 / Math.max(0.35, Math.abs(nx * ay * s - ny * ax * s)), 1, 2.4);
    out.push([b[0] + nx * d * k, b[1] + ny * d * k]);
  }
  return out;
}
function clipConvex(poly, clip) {
  let out = poly; const sgn = area2(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], inp = out; out = [];
    const side = (p) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([lerp(p[0], q[0], t), lerp(p[1], q[1], t)]); }
    }
  }
  return out;
}
function isConvex(p) { let sign = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length]; const s = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(s) < 1e-9) continue; if (!sign) sign = Math.sign(s); else if (Math.sign(s) !== sign) return false; } return true; }

class Glass {
  constructor(seed = 1) { this.b = new Batch(1); this.b.noColor = true; this.r = mkRng(seed * 13 + 3); this.clip = null; this.xf = [1, 0, 0, 1, 0, 0]; this.came = 0.022; }
  xform(a, b, c, d, e, f) { const m = this.xf; return [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
  withXf(rotDeg, tx, ty, s, fn) { const o = this.xf, c = Math.cos(rad(rotDeg)) * s, sn = Math.sin(rad(rotDeg)) * s; this.xf = this.xform(c, sn, -sn, c, tx, ty); fn(this); this.xf = o; }
  withClip(pts, fn) { const o = this.clip; const m = this.xf; this.clip = pts.map((p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]); fn(this); this.clip = o; }
  toLocal(p) { const m = this.xf, det = m[0] * m[3] - m[1] * m[2], x = p[0] - m[4], y = p[1] - m[5]; return [(m[3] * x - m[2] * y) / det, (-m[1] * x + m[0] * y) / det]; }
  // Writes one flat polygon. map(worldPoint) -> [u,v] in atlas pixels; otherwise a window on the sheet of its colour
  raw(pts, color, layer, jitter = 1, map = null) {
    if (layer === -0.4 && !this.b.outline) this.b.outline = pts; // the first polygon of a window is its whole outline
    const name = GLASS_ALIAS[color] || color, fam = GL.fam[name] || GL.fam.lead, z = 0.002 + layer * 0.0035, C = GL.small;
    // Every pane is cut from a different part of the sheet, so no two panes match;
    // 200 pixels of sheet to the metre, so the streaks and clouds of the pot-metal show in the pane
    const ox = fam[0] + 44 + this.r() * (C - 88), oy = fam[1] + 44 + this.r() * (C - 88), rot = this.r() * 6.28, cr = Math.cos(rot) * 200, sr = Math.sin(rot) * 200;
    let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
    const ids = pts.map((p) => {
      let u, v;
      if (map) { const q = map(p); u = q[0]; v = q[1]; } else {
        const dx = clamp(p[0] - mx, -0.2, 0.2), dy = clamp(p[1] - my, -0.2, 0.2);
        u = ox + (dx * cr - dy * sr) * jitter; v = oy + (dx * sr + dy * cr) * jitter;
      }
      return this.b.v(p[0], p[1], z, 0, 0, 1, u / GL.w, v / GL.h, 1);
    });
    if (isConvex(pts)) { const flip = area2(pts) < 0; for (let i = 1; i < ids.length - 1; i++) { if (flip) this.b.tri(ids[0], ids[i + 1], ids[i]); else this.b.tri(ids[0], ids[i], ids[i + 1]); } } else { const t = triangulate(pts); for (const k of t) this.b.tri(ids[k[0]], ids[k[1]], ids[k[2]]); }
  }
  // a pane: colour polygon + lead came. o.tile paints drapery across it, o.orn ornament.
  poly(pts, color, layer = 1, o = {}) {
    const m = this.xf; let P2 = pts.map((p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]);
    if (area2(P2) < 0) P2 = P2.slice().reverse();
    const came = o.came === undefined ? this.came : o.came;
    if (came > 0) {
      let C = offsetPoly(P2, came);
      if (this.clip) C = clipConvex(C, this.clip);
      if (C.length >= 3 && Math.abs(area2(C)) > 1e-5) this.raw(C, 'lead', layer - 0.5, 0);
    } else if (came < 0) P2 = offsetPoly(P2, came); // over a lead backing: inset instead of a second polygon
    if (this.clip) P2 = clipConvex(P2, this.clip);
    if (P2.length < 3 || Math.abs(area2(P2)) <= 1e-5) return this;
    let map = o.map || null;
    if (o.tile && GL.tile[o.tile]) { // planar mapping of the painted tile over the local box
      const T = GL.tile[o.tile], B = o.box, f = o.flipU ? -1 : 1;
      map = (p) => { const q = this.toLocal(p), a = (q[0] - B[0]) / (B[2] - B[0]), c = (q[1] - B[1]) / (B[3] - B[1]); return [T[0] + 2 + (f > 0 ? a : 1 - a) * (T[2] - 4), T[1] + 2 + (1 - c) * (T[3] - 4)]; };
    } else if (o.orn && GL.orn[o.orn]) {
      const T = GL.orn[o.orn], B = o.box;
      map = (p) => { const q = this.toLocal(p), a = (q[0] - B[0]) / (B[2] - B[0]), c = (q[1] - B[1]) / (B[3] - B[1]); return [T[0] + 2 + a * (GL.small - 4), T[1] + 2 + (1 - c) * (GL.small - 4)]; };
    }
    this.raw(P2, color, layer, o.jitter === undefined ? 1 : o.jitter, map);
    return this;
  }
  disc(cx, cy, r, color, layer = 1, n = 12, o) { return this.poly(ringPts(cx, cy, r, n), color, layer, o); }
  // a head drawn by the glass painter: an oval pane mapped onto a face from the atlas
  face(cx, cy, rx, ry, kind, layer, flip) {
    const F = GL.face[kind] || GL.face.youth, C = GL.cell, pts = []; for (let i = 0; i < 12; i++) { const a = i * TAU / 12; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return this.poly(pts, 'flesh', layer, { came: 0.012, map: (p) => { const q = this.toLocal(p), a = ((q[0] - cx) / rx) * (flip ? -1 : 1), c = (q[1] - cy) / ry; return [F[0] + C / 2 + clamp(a, -1, 1) * (C / 2 - 3), F[1] + C / 2 - clamp(c, -1, 1) * (C / 2 - 3)]; } });
  }
  // painted line (grisaille): a thin dark ribbon along a polyline
  line(pts, w = 0.02, color = 'lead', layer = 5) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx *= w / 2 / l; dy *= w / 2 / l;
      this.poly([[a[0] - dy, a[1] + dx], [a[0] + dy, a[1] - dx], [b[0] + dy, b[1] - dx], [b[0] - dy, b[1] + dx]], color, layer, { came: 0, jitter: 0 });
    }
    return this;
  }
}

// Diapered mosaic background: lozenges of two deep colours, a jewel at each crossing
// (one painted square of leaded lozenges laid down repeatedly: fine as real mosaic, cheap as two triangles a square)
function gDiaper(g, x0, y0, x1, y1, cell, c1, c2, c3, layer = 0) {
  const T = 0.72, G = GL.ground[GROUND_OF[c1] || 'rc'], C = GL.cell;
  for (let y = Math.floor(y0 / T) * T; y < y1; y += T) for (let x = Math.floor(x0 / T) * T; x < x1; x += T) {
    const qx = x, qy = y, map = (p) => [G[0] + 2 + clamp((p[0] - qx) / T) * (C - 4), G[1] + 2 + clamp((p[1] - qy) / T) * (C - 4)];
    g.poly([[x, y], [x + T, y], [x + T, y + T], [x, y + T]], c1, layer, { came: 0, map });
  }
}

// A figure in glass: long Gothic proportions, robes painted in brown, the head drawn by hand. (x,y) = feet.
function gFigure(g, x, y, h, o = {}) {
  const sx = o.sx || 0.82, hTot = h; h = hTot * sx;
  const f = o.flip ? -1 : 1, L = (u, v) => [x + f * u * h, y + (v <= 0.76 ? v / 0.76 * (hTot - 0.24 * h) : hTot - (1 - v) * h)], PS = (a) => a.map((p) => L(p[0], p[1]));
  const robe = o.robe || 'white', mantle = o.mantle || 'cobalt', skin = o.skin || 'flesh', big = hTot > 2.2, layer = o.layer === undefined ? 2 : o.layer;
  const sit = o.pose === 'sit', kneel = o.pose === 'kneel';
  const hy = kneel ? 0.67 : sit ? 0.86 : 0.875, hr = 0.066, hx = kneel ? 0.04 : 0;
  // Box in world units for tile mapping, in the local frame of the Glass object
  const bx = [x - h * 0.34, y, x + h * 0.34, y + hTot * 0.86], tR = DRAPE_OF[robe] || 'white', tM = DRAPE_OF[mantle] || 'cobalt';
  const pane = (pts, col, lay, tile, opt) => g.poly(PS(pts), col, lay, Object.assign({ tile, box: bx, flipU: !!o.flip }, opt || {}));
  const brk = (pts, c1, lay, tile) => { // a robe is many pieces of glass: cut it across with lead
    const P3 = PS(pts); let y0 = 1e9, y1 = -1e9; for (const q of P3) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const n = big ? 4 : (hTot > 0.9 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const a = lerp(y0, y1, i / n), c = lerp(y0, y1, (i + 1) / n), sl = big ? 0.12 * h * (i % 2 ? 1 : -1) * 0.5 : 0;
      const piece = clipConvex(clipConvex(P3, [[-1e4, a - sl * 0], [1e4, a + sl], [1e4, 1e4], [-1e4, 1e4]]), [[-1e4, -1e4], [1e4, -1e4], [1e4, c + sl], [-1e4, c - sl * 0]]);
      if (piece.length >= 3) g.poly(piece, c1, lay, { tile, box: bx, flipU: !!o.flip, came: 0.016 });
    }
  };
  if (o.wings) {
    pane([[-0.08, hy - 0.1], [-0.3, hy + 0.1], [-0.4, hy - 0.08], [-0.34, 0.4], [-0.24, 0.2], [-0.1, 0.42]], o.wings, layer - 0.2, null);
    pane([[0.08, hy - 0.1], [0.3, hy + 0.1], [0.4, hy - 0.08], [0.34, 0.4], [0.24, 0.2], [0.1, 0.42]], o.wings, layer - 0.2, null);
    if (hTot > 1) for (const s of [-1, 1]) { g.line(PS([[s * 0.1, hy - 0.08], [s * 0.3, 0.52]]), h * 0.01, 'lead', layer); g.line(PS([[s * 0.2, hy - 0.02], [s * 0.34, 0.42]]), h * 0.008, 'lead', layer); }
  }
  if (o.halo !== false) {
    const c = L(hx, hy);
    g.disc(c[0], c[1], h * 0.116, o.halo || 'gold', layer - 0.1, big ? 18 : 12);
    if (o.cross) { for (let i = 0; i < 3; i++) { const a = i * PI / 2; g.poly([[c[0] + h * 0.116 * Math.cos(a - 0.26), c[1] + h * 0.116 * Math.sin(a - 0.26)], [c[0] + h * 0.116 * Math.cos(a + 0.26), c[1] + h * 0.116 * Math.sin(a + 0.26)], c], 'ruby', layer, { came: 0.008 }); } }
  }
  // ---- body ----
  if (sit) {
    brk([[-0.12, 0.72], [0.12, 0.72], [0.19, 0.44], [0.26, 0.4], [0.27, 0.08], [0.22, 0.0], [-0.22, 0.0], [-0.2, 0.3], [-0.14, 0.44]], robe, layer, tR);
    brk([[-0.13, 0.74], [0.05, 0.74], [0.17, 0.46], [0.24, 0.4], [0.2, 0.18], [-0.06, 0.1], [-0.2, 0.3], [-0.14, 0.46]], mantle, layer + 0.5, tM);
  } else if (kneel) {
    brk([[-0.08, 0.56], [0.13, 0.56], [0.16, 0.26], [0.26, 0.1], [0.26, 0], [-0.26, 0], [-0.2, 0.12]], robe, layer, tR);
    brk([[-0.09, 0.57], [0.08, 0.57], [0.13, 0.28], [0.1, 0.1], [-0.2, 0.05], [-0.16, 0.24]], mantle, layer + 0.5, tM);
  } else {
    const c = o.sway === undefined ? 0.02 : o.sway;
    brk([[-0.1 + c, 0.75], [0.1 + c, 0.75], [0.115, 0.46], [0.14, 0.2], [0.2, 0.03], [0.15, 0.0], [0.05, 0.022], [-0.05, 0.0], [-0.16, 0.012], [-0.2, 0.04], [-0.14, 0.22], [-0.115, 0.46]], robe, layer, tR);
    brk([[-0.11 + c, 0.76], [0.03 + c, 0.76], [0.12, 0.5], [0.135, 0.3], [0.09, 0.15], [-0.06, 0.11], [-0.165, 0.22], [-0.125, 0.46]], mantle, layer + 0.5, tM);
    pane([[-0.09, 0.03], [-0.02, 0.03], [-0.02, -0.012], [-0.115, -0.012]], o.shoe || 'brown', layer + 0.2, null, { came: 0.008 });
    pane([[0.02, 0.03], [0.09, 0.03], [0.115, -0.012], [0.02, -0.012]], o.shoe || 'brown', layer + 0.2, null, { came: 0.008 });
  }
  // ---- arms and hands ----
  const by = kneel ? 0.5 : 0.68, armPose = o.arm || 'hold';
  const ribbon = (a, b, w, col, tile) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2; g.poly(PS([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]), col, layer + 1, { came: 0.012, tile, box: bx }); };
  const hand = (p) => { const c = L(p[0], p[1]); g.poly([[c[0] - h * 0.026, c[1] - h * 0.018], [c[0] + h * 0.018, c[1] - h * 0.022], [c[0] + h * 0.03, c[1] + h * 0.016], [c[0] + h * 0.006, c[1] + h * 0.03], [c[0] - h * 0.02, c[1] + h * 0.018]], skin, layer + 1.3, { came: 0.008 }); };
  const arms = { hold: [[0.13, by - 0.12], [0.03, by - 0.18], [-0.13, by - 0.12], [-0.03, by - 0.2]], up: [[0.17, by - 0.03], [0.27, by + 0.18], [-0.12, by - 0.12], [-0.03, by - 0.22]], out: [[0.19, by - 0.08], [0.32, by - 0.06], [-0.19, by - 0.08], [-0.32, by - 0.06]], pray: [[0.1, by - 0.14], [0.12, by - 0.03], [-0.04, by - 0.14], [0.1, by - 0.03]], point: [[0.17, by - 0.08], [0.33, by + 0.04], [-0.12, by - 0.12], [-0.04, by - 0.2]], orant: [[0.2, by + 0.0], [0.27, by + 0.14], [-0.2, by + 0.0], [-0.27, by + 0.14]] };
  const A = arms[armPose] || arms.hold;
  ribbon([0.095, by], A[0], 0.07, mantle, tM); ribbon(A[0], A[1], 0.056, robe, tR); hand(A[1]);
  ribbon([-0.095, by], A[2], 0.07, mantle, tM); ribbon(A[2], A[3], 0.056, robe, tR); hand(A[3]);
  // ---- attributes ----
  const at = o.attr;
  if (at === 'book') { g.poly(PS([[A[1][0] - 0.1, A[1][1] - 0.02], [A[1][0] + 0.02, A[1][1] - 0.02], [A[1][0] + 0.02, A[1][1] + 0.12], [A[1][0] - 0.1, A[1][1] + 0.12]]), 'ruby', layer + 1.5, { came: 0.01 }); g.poly(PS([[A[1][0] - 0.07, A[1][1] + 0.03], [A[1][0] - 0.01, A[1][1] + 0.03], [A[1][0] - 0.01, A[1][1] + 0.09], [A[1][0] - 0.07, A[1][1] + 0.09]]), 'gold', layer + 1.6, { came: 0 }); }
  else if (at === 'staff' || at === 'cross') { const sxx = A[1][0]; g.poly(PS([[sxx - 0.012, 0], [sxx + 0.012, 0], [sxx + 0.012, 1.08], [sxx - 0.012, 1.08]]), 'gold', layer + 0.9, { came: 0.008 }); if (at === 'cross') g.poly(PS([[sxx - 0.07, 0.95], [sxx + 0.07, 0.95], [sxx + 0.07, 0.98], [sxx - 0.07, 0.98]]), 'gold', layer + 0.9, { came: 0.008 }); else g.poly(ringPts(sxx + 0.03, 1.1, 0.045, 8).map((p) => L(p[0], p[1])), 'gold', layer + 0.9, { came: 0.008 }); }
  else if (at === 'sword') { const sxx = A[1][0]; g.poly(PS([[sxx - 0.012, by - 0.08], [sxx + 0.012, by - 0.08], [sxx, 1.02]]), 'white', layer + 0.9, { came: 0.008 }); g.poly(PS([[sxx - 0.05, by - 0.08], [sxx + 0.05, by - 0.08], [sxx + 0.05, by - 0.05], [sxx - 0.05, by - 0.05]]), 'gold', layer + 1, { came: 0.008 }); }
  else if (at === 'key') { const sxx = A[1][0]; g.poly(PS([[sxx - 0.01, by - 0.14], [sxx + 0.01, by - 0.14], [sxx + 0.01, by + 0.2], [sxx - 0.01, by + 0.2]]), 'gold', layer + 1, { came: 0.006 }); g.poly(ringPts(sxx, by + 0.23, 0.035, 6).map((p) => L(p[0], p[1])), 'gold', layer + 1, { came: 0.006 }); g.poly(PS([[sxx, by - 0.14], [sxx + 0.05, by - 0.14], [sxx + 0.05, by - 0.1], [sxx, by - 0.1]]), 'gold', layer + 1, { came: 0.006 }); }
  else if (at === 'lily') { const sxx = A[1][0]; g.line(PS([[sxx, by - 0.22], [sxx + 0.01, by + 0.2]]), h * 0.012, 'green', layer + 1); for (let i = 0; i < 3; i++) { const yy = by + 0.08 + i * 0.07; const q = L(sxx + 0.02 * (i % 2 ? 1 : -1), yy); g.disc(q[0], q[1], h * 0.024, 'white', layer + 1.1, 5, { came: 0.006 }); } }
  // ---- head: drawn, not a disc ----
  const hc = L(hx, hy);
  const kind = o.face || (o.wings ? 'angel' : o.veil ? 'virgin' : o.crown && o.beard ? 'king' : o.cross ? 'christ' : o.beard === 2 || o.beardCol ? 'elder' : o.beard ? 'christ' : 'youth');
  const nkA = L(hx - 0.02, hy - 0.11), nkB = L(hx + 0.02, hy - 0.11), nkC = L(hx + 0.02, hy - 0.04), nkD = L(hx - 0.02, hy - 0.04);
  g.poly([nkA, nkB, nkC, nkD], skin, layer + 1.5, { came: 0.008 });
  g.face(hc[0], hc[1], h * hr * 1.02, h * hr * 1.24, kind, layer + 1.8, !!o.flip);
  if (o.crown) g.poly(PS([[hx - 0.066, hy + 0.05], [hx + 0.066, hy + 0.05], [hx + 0.08, hy + 0.13], [hx + 0.04, hy + 0.095], [hx, hy + 0.14], [hx - 0.04, hy + 0.095], [hx - 0.08, hy + 0.13]]), 'gold', layer + 2.2, { came: 0.01 });
  if (o.mitre) g.poly(PS([[hx - 0.056, hy + 0.05], [hx + 0.056, hy + 0.05], [hx + 0.048, hy + 0.15], [hx, hy + 0.215], [hx - 0.048, hy + 0.15]]), o.mitre, layer + 2.2, { came: 0.01 });
}
// ---- Narrative scenes, composed inside a circle of radius r at the origin ---------
const SCENES = {
  annunciation(g, r) { // Angel greets the Virgin; lily between them, dove above
    gFigure(g, -r * 0.46, -r * 0.72, r * 1.34, { robe: 'white', mantle: 'emerald', wings: 'rubyLt', arm: 'point', attr: null, hair: 'amber' });
    gFigure(g, r * 0.46, -r * 0.72, r * 1.3, { flip: 1, robe: 'white', mantle: 'cobalt', veil: 'azure', arm: 'pray', halo: 'gold' });
    g.poly([[-0.1, -r * 0.72], [0.1, -r * 0.72], [0.06, -r * 0.5], [-0.06, -r * 0.5]], 'gold', 3, { came: 0.012 });
    g.line([[0, -r * 0.5], [0, r * 0.05]], 0.025, 'green', 3.2);
    [0.05, -0.1, -0.24].forEach((v, i) => g.disc((i % 2 ? 1 : -1) * r * 0.05, r * v, r * 0.05, 'white', 3.3, 5, { came: 0.008 }));
    g.disc(0, r * 0.62, r * 0.07, 'white', 3, 6, { came: 0.01 }); g.poly([[-r * 0.14, r * 0.66], [0, r * 0.6], [r * 0.14, r * 0.66], [0, r * 0.7]], 'pearl', 2.8, { came: 0.01 });
  },
  nativity(g, r) { // Virgin, Child in the crib, Joseph, the star, the ox and ass
    g.poly([[-r * 0.8, -r * 0.9], [r * 0.8, -r * 0.9], [r * 0.8, -r * 0.62], [-r * 0.8, -r * 0.62]], 'brown', 1.5);
    gFigure(g, -r * 0.42, -r * 0.62, r * 1.05, { pose: 'sit', robe: 'white', mantle: 'cobalt', veil: 'azure', arm: 'out' });
    gFigure(g, r * 0.56, -r * 0.62, r * 1.1, { robe: 'tan', mantle: 'emerald', beard: 1, hair: 'grey', beardCol: 'pearl', arm: 'hold', attr: 'staff', flip: 1, halo: 'yellow' });
    g.poly([[-r * 0.1, -r * 0.62], [r * 0.3, -r * 0.62], [r * 0.34, -r * 0.34], [-r * 0.14, -r * 0.34]], 'amber', 2, { came: 0.014 });
    g.poly([[-r * 0.07, -r * 0.34], [r * 0.27, -r * 0.34], [r * 0.27, -r * 0.22], [-r * 0.07, -r * 0.22]], 'white', 2.5, { came: 0.012 });
    g.disc(r * 0.02, -r * 0.24, r * 0.065, 'gold', 2.5, 8, { came: 0.008 }); g.disc(r * 0.02, -r * 0.24, r * 0.043, 'flesh', 3, 7, { came: 0.008 });
    star(g, 0, r * 0.68, r * 0.13, 'yellow', 3);
    g.poly([[-r * 0.4, r * 0.22], [0, r * 0.52], [r * 0.4, r * 0.22], [r * 0.36, r * 0.14], [0, r * 0.4], [-r * 0.36, r * 0.14]], 'bone', 1.5);
  },
  magi(g, r) { // Three crowned kings bring gifts to the enthroned Virgin
    gFigure(g, r * 0.56, -r * 0.8, r * 1.2, { pose: 'sit', flip: 1, robe: 'white', mantle: 'cobalt', veil: 'azure', arm: 'hold' });
    g.disc(r * 0.4, -r * 0.1, r * 0.06, 'gold', 4, 8, { came: 0.008 });
    gFigure(g, -r * 0.05, -r * 0.8, r * 1.18, { pose: 'kneel', robe: 'emerald', mantle: 'ruby', crown: 1, beard: 2, hair: 'grey', beardCol: 'pearl', arm: 'point', halo: false });
    gFigure(g, -r * 0.42, -r * 0.8, r * 1.32, { robe: 'violet', mantle: 'gold', crown: 1, beard: 1, arm: 'point', halo: false });
    gFigure(g, -r * 0.74, -r * 0.8, r * 1.3, { robe: 'teal', mantle: 'rubyLt', crown: 1, arm: 'hold', halo: false });
    star(g, -r * 0.1, r * 0.72, r * 0.11, 'yellow', 3);
  },
  crucifixion(g, r) { // Christ on the cross, the Virgin and Saint John, sun and moon
    g.poly([[-0.09 * r, -r * 0.92], [0.09 * r, -r * 0.92], [0.09 * r, r * 0.76], [-0.09 * r, r * 0.76]], 'emerald', 1.5, { came: 0.016 });
    g.poly([[-r * 0.58, r * 0.28], [r * 0.58, r * 0.28], [r * 0.58, r * 0.45], [-r * 0.58, r * 0.45]], 'emerald', 1.5, { came: 0.016 });
    gFigure(g, 0, -r * 0.84, r * 1.42, { robe: 'white', mantle: 'white', cross: 1, arm: 'out', halo: 'gold', hair: 'hair', beard: 1, sway: 0 });
    gFigure(g, -r * 0.62, -r * 0.88, r * 1.1, { robe: 'white', mantle: 'cobalt', veil: 'azure', arm: 'pray' });
    gFigure(g, r * 0.62, -r * 0.88, r * 1.1, { flip: 1, robe: 'white', mantle: 'rubyLt', arm: 'hold', attr: 'book' });
    g.disc(-r * 0.68, r * 0.66, r * 0.11, 'gold', 2, 8); g.poly([[r * 0.59, r * 0.74], [r * 0.76, r * 0.6], [r * 0.71, r * 0.76]], 'pearl', 2);
  },
  resurrection(g, r) { // Christ rises from the tomb holding the banner; soldiers sleep below
    g.poly([[-r * 0.72, -r * 0.84], [r * 0.72, -r * 0.84], [r * 0.72, -r * 0.42], [-r * 0.72, -r * 0.42]], 'bone', 2);
    g.line([[-r * 0.72, -r * 0.56], [r * 0.72, -r * 0.56]], 0.02, 'lead', 3); [-0.4, 0, 0.4].forEach((k) => g.disc(r * k, -r * 0.68, r * 0.09, 'purple', 3, 8, { came: 0.01 }));
    gFigure(g, 0, -r * 0.42, r * 1.25, { robe: 'white', mantle: 'rubyLt', cross: 1, arm: 'up', hair: 'hair', beard: 1, halo: 'gold' });
    g.poly([[r * 0.34, r * 0.72], [r * 0.34, r * 0.92], [r * 0.7, r * 0.84], [r * 0.34, r * 0.72]], 'white', 3, { came: 0.01 }); g.line([[r * 0.34, r * 0.92], [r * 0.34, -r * 0.1]], 0.02, 'gold', 3.2);
    for (const s of [-1, 1]) { g.disc(s * r * 0.82, -r * 0.5, r * 0.07, 'flesh', 3, 7, { came: 0.01 }); g.poly([[s * r * 0.6, -r * 0.86], [s * r * 0.92, -r * 0.86], [s * r * 0.9, -r * 0.54], [s * r * 0.7, -r * 0.54]], s > 0 ? 'emerald' : 'cobalt', 2.6); }
  },
  supper(g, r) { // The Last Supper: Christ at the centre of a laid table
    [-0.62, -0.31, 0.31, 0.62].forEach((k, i) => gBust(g, r * k, -r * 0.05, r * 0.92, { robe: ['emerald', 'ruby', 'amber', 'violet'][i], beard: i % 2 ? 1 : 0, hair: i === 3 ? 'grey' : 'hair' }));
    gBust(g, 0, -r * 0.02, r * 1.04, { robe: 'rubyLt', beard: 1, cross: 1 });
    g.poly([[-r * 0.92, -r * 0.5], [r * 0.92, -r * 0.5], [r * 0.92, -r * 0.2], [-r * 0.92, -r * 0.2]], 'white', 4);
    g.poly([[-r * 0.86, -r * 0.5], [r * 0.86, -r * 0.5], [r * 0.82, -r * 0.92], [-r * 0.82, -r * 0.92]], 'brown', 3.6);
    [-0.58, -0.2, 0.2, 0.58].forEach((k) => g.disc(r * k, -r * 0.3, r * 0.055, 'gold', 4.5, 6, { came: 0.008 }));
  },
  noah(g, r) { // The Ark on the waters, the dove returning
    [-0.82, -0.56].forEach((v, i) => g.poly([[-r, r * v], [r, r * v], [r, r * (v + 0.22)], [-r, r * (v + 0.18)]], i ? 'azure' : 'cobalt', 2));
    g.poly([[-r * 0.7, -r * 0.4], [r * 0.7, -r * 0.4], [r * 0.5, -r * 0.7], [-r * 0.5, -r * 0.7]], 'brown', 2.5);
    g.poly([[-r * 0.46, -r * 0.4], [r * 0.46, -r * 0.4], [r * 0.46, r * 0.02], [-r * 0.46, r * 0.02]], 'tan', 3);
    g.poly([[-r * 0.56, r * 0.0], [0, r * 0.32], [r * 0.56, r * 0.0]], 'ruby', 3.2);
    [-0.2, 0.2].forEach((k) => g.disc(r * k, -r * 0.18, r * 0.1, 'night', 3.4, 7, { came: 0.012 }));
    gBust(g, r * 0.2, -r * 0.3, r * 0.42, { robe: 'emerald', beard: 2, hair: 'grey', beardCol: 'pearl', layer: 3.6 });
    g.disc(-r * 0.54, r * 0.64, r * 0.07, 'white', 3, 6, { came: 0.01 }); g.poly([[-r * 0.72, r * 0.72], [-r * 0.54, r * 0.62], [-r * 0.36, r * 0.74], [-r * 0.54, r * 0.7]], 'pearl', 2.8, { came: 0.01 });
  },
  shepherd(g, r) { // The Good Shepherd carries the lamb; a flock in green pasture
    g.poly([[-r, -r], [r, -r], [r, -r * 0.5], [-r, -r * 0.62]], 'green', 1.5);
    gFigure(g, 0, -r * 0.82, r * 1.5, { robe: 'white', mantle: 'ruby', cross: 1, beard: 1, arm: 'hold', attr: 'staff' });
    g.disc(0, r * 0.26, r * 0.11, 'white', 4.5, 8, { came: 0.01 }); g.disc(r * 0.13, r * 0.3, r * 0.05, 'pearl', 4.8, 6, { came: 0.008 });
    for (const [x, y] of [[-0.68, -0.64], [0.66, -0.62], [-0.46, -0.78]]) { g.disc(r * x, r * y, r * 0.11, 'white', 3, 7, { came: 0.01 }); g.disc(r * x + r * 0.12, r * y + r * 0.05, r * 0.05, 'grey', 3.2, 5, { came: 0.008 }); }
  },
  david(g, r) { // King David with his harp
    gFigure(g, -r * 0.14, -r * 0.82, r * 1.42, { pose: 'sit', robe: 'violet', mantle: 'ruby', crown: 1, beard: 1, arm: 'out', halo: false });
    g.poly([[r * 0.26, -r * 0.6], [r * 0.7, r * 0.2], [r * 0.7, r * 0.46], [r * 0.16, -r * 0.36]], 'gold', 3, { came: 0.012 });
    g.line([[r * 0.2, -r * 0.4], [r * 0.2, r * 0.4]], 0.018, 'gold', 3.1); [0.3, 0.4, 0.5, 0.6].forEach((k) => g.line([[r * k, -r * 0.42 + r * (k - 0.2)], [r * k, r * 0.34]], 0.008, 'white', 3.2));
    g.poly([[-r * 0.86, -r * 0.84], [r * 0.5, -r * 0.84], [r * 0.5, -r * 0.7], [-r * 0.86, -r * 0.7]], 'tan', 1.8);
  },
};
function star(g, x, y, r, c, layer) { const p = []; for (let i = 0; i < 16; i++) { const a = i * PI / 8 + PI / 2, q = i % 2 ? r * 0.38 : r * (i % 4 ? 0.7 : 1); p.push([x + q * Math.cos(a), y + q * Math.sin(a)]); } g.poly(p, c, layer, { came: 0.01 }); }
function gBust(g, x, y, h, o = {}) { // head and shoulders, the head drawn by the painter
  const L = o.layer || 2, bx = [x - h * 0.22, y - h * 0.32, x + h * 0.22, y + h * 0.46], t = DRAPE_OF[o.robe || 'ruby'] || 'ruby';
  if (o.halo !== false) g.disc(x, y + h * 0.58, h * 0.17, o.halo || 'gold', L - 0.1, 10);
  g.poly([[x - h * 0.2, y - h * 0.3], [x + h * 0.2, y - h * 0.3], [x + h * 0.17, y + h * 0.3], [x + h * 0.06, y + h * 0.42], [x - h * 0.06, y + h * 0.42], [x - h * 0.17, y + h * 0.3]], o.robe || 'ruby', L, { tile: t, box: bx });
  const kind = o.face || (o.crown && o.beard ? 'king' : o.cross ? 'christ' : o.beard === 2 || o.beardCol ? 'elder' : o.beard ? 'christ' : 'youth');
  g.face(x, y + h * 0.58, h * 0.108, h * 0.132, kind, L + 0.5, false);
  if (o.crown) g.poly([[x - h * 0.1, y + h * 0.66], [x + h * 0.1, y + h * 0.66], [x + h * 0.12, y + h * 0.78], [x + h * 0.05, y + h * 0.72], [x, y + h * 0.8], [x - h * 0.05, y + h * 0.72], [x - h * 0.12, y + h * 0.78]], 'gold', L + 0.7, { came: 0.008 });
  if (o.cross) for (let i = 0; i < 3; i++) { const a = i * PI / 2; g.poly([[x + h * 0.17 * Math.cos(a - 0.24), y + h * 0.58 + h * 0.17 * Math.sin(a - 0.24)], [x + h * 0.17 * Math.cos(a + 0.24), y + h * 0.58 + h * 0.17 * Math.sin(a + 0.24)], [x, y + h * 0.58]], 'ruby', L + 0.2, { came: 0.008 }); }
}
// A jewelled ring of short leaded segments
function gRim(g, cx, cy, r0, r1, cols, n, layer) {
  g.disc(cx, cy, r1 + 0.02, 'lead', layer - 0.3, Math.max(10, n), { came: 0, jitter: 0 });
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n, b = (i + 1) * TAU / n;
    g.poly([[cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)], [cx + r1 * Math.cos(b), cy + r1 * Math.sin(b)], [cx + r0 * Math.cos(b), cy + r0 * Math.sin(b)]], cols[i % cols.length], layer, { came: -0.01 });
  }
}
// A lancet told as a stack of medallions over a diapered ground, with a jewelled border
function gLancetStory(g, x, w, y0, ys, rise, scenes, o = {}) {
  const c1 = o.c1 || 'ruby', c2 = o.c2 || 'cobalt', edge = o.edge || ['gold', 'ruby', 'white', 'cobalt'];
  const arc = pointedArc(w, rise, 8).map((p) => [x + p[0], ys + p[1]]);
  const outline = [[x - w / 2, y0], [x + w / 2, y0], ...arc.slice().reverse().slice(0)];
  g.withClip(outline, () => {
    gDiaper(g, x - w / 2, y0, x + w / 2, ys + rise, o.cell || 0.6, c1, c2, 'gold');
    const H = ys + rise * 0.5 - y0, N = scenes.length, step = H / N, R = Math.min(w * 0.44, step * 0.47);
    scenes.forEach((nm, i) => {
      const cy = y0 + step * (i + 0.5);
      const ground = (i % 2) ? (o.g1 || 'cobalt') : (o.g2 || 'ruby');
      gRim(g, x, cy, R, R * 1.055, ['gold', 'ruby', 'gold', 'cobalt'], 22, 1);
      g.disc(x, cy, R, ground, 1.3, 18, { came: 0 });
      g.withClip(ringPts(x, cy, R, 14), () => g.withXf(0, x, cy, 1, () => SCENES[nm](g, R)));
      if (i < N - 1) { const yy = y0 + step * (i + 1); for (const s of [-1, 1]) { g.disc(x + s * w * 0.3, yy, w * 0.058, 'gold', 1.2, 8, { came: 0.012 }); g.disc(x + s * w * 0.3, yy, w * 0.032, 'ruby', 1.5, 6, { came: 0.008 }); } }
    });
    // Border bricks follow the outline: thin, and each brick painted with a stem of leaves
    const bw = w * 0.062, stepB = 0.34;
    const stripe = (x0, y1, y2) => { let k = 0; g.poly([[x0, y1], [x0 + bw, y1], [x0 + bw, y2], [x0, y2]], 'lead', 3.5, { came: 0, jitter: 0 }); for (let y = y1; y < y2; y += stepB) { const c = edge[k++ % edge.length]; g.poly([[x0, y], [x0 + bw, y], [x0 + bw, y + stepB], [x0, y + stepB]], c, 3.8, { came: -0.012, orn: c === 'gold' ? 'gold' : c === 'white' ? 'white' : null, box: [x0, y, x0 + bw, y + stepB] }); } };
    stripe(x - w / 2, y0, ys + rise * 0.1); stripe(x + w / 2 - bw, y0, ys + rise * 0.1);
    // Saddle bars (iron armature)
    for (let y = y0 + 1.1; y < ys + rise * 0.6; y += 1.1) g.poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + 0.045], [x - w / 2, y + 0.045]], 'lead', 7, { came: 0, jitter: 0 });
  });
}
// A lancet filled by one monumental standing figure under a painted canopy (reads from the floor)
function gLancetSaint(g, x, w, y0, ys, rise, fig, o = {}) {
  const arc = pointedArc(w, rise, 8).map((p) => [x + p[0], ys + p[1]]);
  const outline = [[x - w / 2, y0], [x + w / 2, y0], ...arc.slice().reverse()];
  const gnd = o.ground || 'cobalt';
  g.withClip(outline, () => {
    const figY = y0 + 1.05, figH = (ys + rise * 0.1 - figY) * 0.84;
    gDiaper(g, x - w / 2, y0, x + w / 2, ys + rise, 0.8, gnd, o.ground2 || 'ruby', null);
    // Pedestal with an inscription band
    g.poly([[x - w * 0.42, y0], [x + w * 0.42, y0], [x + w * 0.42, y0 + 0.62], [x - w * 0.42, y0 + 0.62]], 'bone', 1.5);
    g.poly([[x - w * 0.46, y0 + 0.62], [x + w * 0.46, y0 + 0.62], [x + w * 0.46, y0 + 1.02], [x - w * 0.46, y0 + 1.02]], 'gold', 1.6, { orn: 'gold', box: [x - w * 0.46, y0 + 0.62, x + w * 0.46, y0 + 1.02] });
    for (let i = 0; i < 6; i++) g.line([[x - w * 0.34 + i * w * 0.13, y0 + 0.28], [x - w * 0.3 + i * w * 0.13, y0 + 0.44]], 0.035, 'paint', 2);
    // Canopy: gable, pinnacles, little windows
    const cy = figY + figH + 0.02, cH = ys + rise * 0.86 - cy;
    g.poly([[x - w * 0.48, cy], [x + w * 0.48, cy], [x + w * 0.48, cy + cH * 0.36], [x - w * 0.48, cy + cH * 0.36]], 'white', 1.6, { orn: 'white', box: [x - w * 0.48, cy, x + w * 0.48, cy + cH * 0.36] });
    g.poly([[x - w * 0.42, cy + cH * 0.34], [x + w * 0.42, cy + cH * 0.34], [x, cy + cH]], 'yellow', 1.7, { orn: 'gold', box: [x - w * 0.42, cy + cH * 0.34, x + w * 0.42, cy + cH] });
    g.poly([[x - w * 0.2, cy + cH * 0.38], [x + w * 0.2, cy + cH * 0.38], [x, cy + cH * 0.72]], 'ruby', 1.9, { came: 0.016 });
    for (const s of [-1, 1]) { g.poly([[x + s * w * 0.28, cy + cH * 0.02], [x + s * w * 0.42, cy + cH * 0.02], [x + s * w * 0.42, cy + cH * 0.3], [x + s * w * 0.28, cy + cH * 0.3]], 'night', 1.8, { came: 0.014 }); g.poly([[x + s * w * 0.3, cy + cH * 0.36], [x + s * w * 0.46, cy + cH * 0.36], [x + s * w * 0.38, cy + cH * 0.85]], 'white', 1.8); }
    gFigure(g, x, figY, figH, Object.assign({ layer: 2.5, sx: Math.min(1, w * 1.72 / figH) }, fig));
    for (let y = y0 + 1.5; y < ys + rise * 0.6; y += 1.5) g.poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + 0.05], [x - w / 2, y + 0.05]], 'lead', 9, { came: 0, jitter: 0 });
  });
}
function gOculus(g, cx, cy, r, o = {}) { // head of the window: a sexfoil with an angel or Christ
  g.withClip(ringPts(cx, cy, r, 20), () => {
    g.disc(cx, cy, r, o.ground || 'cobalt', 1, 20);
    for (let i = 0; i < 6; i++) { const a = i * PI / 3 + PI / 6; g.disc(cx + r * 0.68 * Math.cos(a), cy + r * 0.68 * Math.sin(a), r * 0.27, i % 2 ? 'ruby' : 'gold', 1.4, 8); }
    g.disc(cx, cy, r * 0.56, o.inner || 'rubyLt', 1.8, 14);
    g.withXf(0, cx, cy, 1, () => { if (o.bust) gBust(g, 0, -r * 0.45, r * 0.95, o.bust); else gFigure(g, 0, -r * 0.5, r * 0.98, { wings: 'gold', robe: 'white', mantle: 'emerald', arm: 'orant' }); });
  });
}

// A complete two-light window: lancets, oculus, base field. Local plane z=0, +Z = interior.
function makeWindowGlass(w, y0, ys, rise, seed, fill) {
  const g = new Glass(seed);
  const outline = archOutline(w, y0, ys, rise, 8);
  g.raw(outline.slice(), 'lead', -0.4, 0);
  g.withClip(outline, () => gDiaper(g, -w / 2, ys, w / 2, ys + rise, 0.55, 'cobalt', 'ruby', 'gold', 0));
  const lw = (w - 0.32) / 2, lx = lw / 2 + 0.08, lr = lw * 0.96;
  const syl = ys + rise * 0.02;
  fill.light(g, -lx, lw, y0, syl, lr, 0); fill.light(g, lx, lw, y0, syl, lr, 1);
  const oc = windowHead(w, ys, rise);
  gOculus(g, 0, oc.y, oc.r + 0.03, fill.oculus || {});
  return g.b;
}
function windowHead(w, ys, rise) { const r = w * 0.225; return { r, y: ys + rise * 0.62 }; }

// ==================================================================================
// STONE TRACERY for a two-light window (plane z=0, bars deep along Z)
// ==================================================================================
function addTracery(b, w, y0, ys, rise, o = {}) {
  const bw = o.bar || 0.26, bd = o.depth || 0.42, sec = traceryBar(bw, bd), secT = hexBar(bw * 0.62, bd * 0.8);
  const lw = (w - 0.32) / 2, lx = lw / 2 + 0.08, lr = lw * 0.96, syl = ys + rise * 0.02;
  // Central mullion with shaft ring and capital
  b.at(M.T(0, 0, 0), () => {
    b.sweep([[0, y0 - 0.05], [0, syl]], sec, {});
    b.at(M.T(0, syl, 0), () => b.lathe([[bw * 0.52, -0.3], [bw * 0.56, -0.2], [bw * 0.9, 0.02], [bw * 0.5, 0.06]], 6));
  });
  for (const s of [-1, 1]) {
    const arc = pointedArc(lw, lr, 5).map((p) => [s * lx + p[0], syl + p[1]]);
    b.sweep(arc, sec, {});
    // cusped trefoil head inside each lancet
    const cr = lw * 0.3, cy = syl + lr * 0.34;
    const cusp = []; for (let i = 0; i <= 8; i++) { const a = rad(-30 + i * 240 / 8); const R = cr * (0.86 + 0.22 * Math.abs(Math.sin(a * 1.5 + 0.4))); cusp.push([s * lx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    b.sweep(cusp, secT, { caps: false });
    b.sweep([[s * (lx + lw / 2), cy - cr * 0.4], cusp[0]], secT, { caps: false });
    b.sweep([[s * (lx - lw / 2), cy - cr * 0.4], cusp[8]], secT, { caps: false });
  }
  // Oculus with six foils
  const oc = windowHead(w, ys, rise);
  b.sweep(ringPts(0, oc.y, oc.r, 14), sec, { closed: true });
  const foils = []; for (let i = 0; i < 18; i++) { const a = i * TAU / 18; const R = oc.r * (0.62 + 0.3 * Math.pow(Math.abs(Math.cos(a * 3)), 0.8)); foils.push([R * Math.cos(a), oc.y + R * Math.sin(a)]); }
  b.sweep(foils, secT, { closed: true, crease: 40 });
}

// ==================================================================================
// PIERCED PARAPET with quatrefoil panels
// ==================================================================================
function quatrefoil(cx, cy, r, n = 16) { const p = []; for (let i = 0; i < n; i++) { const a = i * TAU / n; const R = r * (0.72 + 0.28 * Math.abs(Math.cos(2 * a))); p.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } return p; }
function addParapet(b, x0, x1, y, h, th, o = {}) {
  const n = Math.max(1, Math.round((x1 - x0) / (o.pitch || 1.05))), holes = [];
  const r = Math.min(h * 0.34, (x1 - x0) / n * 0.4);
  for (let i = 0; i < n; i++) holes.push(quatrefoil(x0 + (i + 0.5) * (x1 - x0) / n, y + h * 0.5, r, o.nh || 12));
  b.slab([[x0, y], [x1, y], [x1, y + h], [x0, y + h]], holes, -th / 2, th / 2, { sr: 0.6 });
  const cap = barSection(0.14, th + 0.14);
  b.sweep([[x0, y + h + 0.04], [x1, y + h + 0.04]], cap, {});
  b.sweep([[x0, y - 0.02], [x1, y - 0.02]], barSection(0.1, th + 0.1), { s: 0.8 });
}

// A wimperg: gable over a window with crockets, finial and a blind trefoil
function addGable(b, w, h, z0, th, y, o = {}) {
  const lod = o.lod === undefined ? 1 : o.lod;
  const holes = o.solid ? [] : [ringPts(0, y + h * 0.36, Math.min(w * 0.13, h * 0.2), 14)];
  if (!o.noField) b.slab([[-w / 2, y], [w / 2, y], [0, y + h]], holes, z0, z0 + th, { sf: 1, sb: 0.8 });
  const rake = barSection(0.18, th + 0.14);
  b.sweep([[-w / 2 - 0.06, y - 0.02], [0, y + h + 0.05]], rake, { z: z0 + th / 2 });
  b.sweep([[0, y + h + 0.05], [w / 2 + 0.06, y - 0.02]], rake, { z: z0 + th / 2 });
  const n = o.crockets === undefined ? Math.max(2, Math.round(Math.hypot(w / 2, h) / 1.05)) : o.crockets, sz = o.size || 0.46;
  const zc = z0 + th / 2;
  crocketsAlong(b, [-w / 2, y + 0.05, zc], [-0.03, y + h * 0.97, zc], n, sz, [-h, w / 2, 0], lod);
  crocketsAlong(b, [w / 2, y + 0.05, zc], [0.03, y + h * 0.97, zc], n, sz, [h, w / 2, 0], lod);
  b.at(M.T(0, y + h * 0.98, zc), () => addFinial(b, o.finial || 0.95, lod));
}
// A small blind trefoil-headed arcade on a wall face (plane z=0, moulding stands proud +Z)
function addBlindArcade(b, x0, x1, y0, ys, n, o = {}) {
  const w = (x1 - x0) / n, sec = hexBar(o.bar || 0.12, o.depth || 0.16), rise = w * 0.95;
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * w;
    b.sweep(pointedArc(w * 0.9, rise, 4).map((p) => [x + p[0], ys + p[1]]), sec, { z: 0.04, caps: false });
  }
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * w;
    b.at(M.T(x, 0, 0.06), () => b.lathe([[0.1, y0], [0.065, y0 + 0.18], [0.065, ys - 0.14], [0.13, ys], [0.08, ys + 0.04]], 5));
  }
}

// ==================================================================================
// RIBBED VAULT: pointed-arc ribs, curved webs, carved or gilded boss.
// ==================================================================================
function arcH(L, H, f) { // height of a two-centred arc of span L, rise H at fraction f
  const c = (H * H - L * L / 4) / L, r = c + L / 2, d = Math.abs(f - 0.5) * L;
  return Math.sqrt(Math.max(0, r * r - (d + c) * (d + c)));
}
function addRib(b, A, B, yS, rise, sec, n = 8, half = false) { // rib between plan points A,B in their vertical plane
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx) * 180 / PI;
  const pts = [];
  if (half) for (let i = 0; i <= n; i++) { const t = i / n; pts.push([t * L, yS + arcH(L * 2, rise, t / 2)]); }
  else for (let i = 0; i <= n; i++) { const t = i / n; pts.push([t * L, yS + arcH(L, rise, t)]); }
  // plane: local X along A->B, local Y up
  b.at(M.of(M.T(A[0], 0, A[1]), M.Ry(-ang)), () => b.sweep(pts, sec, { caps: false }));
}
// One curved web between a side arc a-b and the crown c, faces downward whichever way the plan runs
function addVaultCell(A, a, b, c, yS, yC, sideRiseV, nS = 8, nT = 6) {
  const La = Math.hypot(c[0] - a[0], c[1] - a[1]), Lb = Math.hypot(c[0] - b[0], c[1] - b[1]), Lab = Math.hypot(b[0] - a[0], b[1] - a[1]), rise = yC - yS;
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  A.grid((s, t) => {
    const px = lerp(a[0], c[0], t) * (1 - s) + lerp(b[0], c[0], t) * s, pz = lerp(a[1], c[1], t) * (1 - s) + lerp(b[1], c[1], t) * s;
    const ruled = lerp(yS + arcH(Lab, sideRiseV, s), yC, t);
    const dA = arcH(La * 2, rise, t / 2) - rise * t, dB = arcH(Lb * 2, rise, t / 2) - rise * t;
    const y = ruled + (1 - s) * (1 - s) * dA + s * s * dB;
    return [px, y, pz, 0.72 + 0.28 * t];
  }, nS, nT, { flip: cross < 0, metric: true });
}
function addRibVault(F, A, corners, yS, yC, o = {}) {
  // corners: 4 plan points in order; web cells between each side and the crown
  const c0 = corners, cx = (c0[0][0] + c0[1][0] + c0[2][0] + c0[3][0]) / 4, cz = (c0[0][1] + c0[1][1] + c0[2][1] + c0[3][1]) / 4;
  const crown = [cx, yC, cz], nS = o.nS || 8, nT = o.nT || 6, rise = yC - yS;
  const sideRise = o.sideRise || ((i) => rise * 0.94);
  for (let k = 0; k < 4; k++) {
    if (o.skipSide && o.skipSide[k]) continue;
    addVaultCell(A, c0[k], c0[(k + 1) % 4], [cx, cz], yS, yC, sideRise(k), nS, nT);
  }
  const sec = o.ribSec || rollSection(0.32, 0.42, 2, 0.04, 2);
  for (const c of c0) addRib(F, c, [cx, cz], yS, rise, sec, 8, true);
  for (let k = 0; k < 4; k++) if (!(o.skipRib && o.skipRib[k])) addRib(F, c0[k], c0[(k + 1) % 4], yS, sideRiseRib(o, k, rise), o.sideRibSec || sec, 8);
  return crown;
}
const sideRiseRib = (o, k, rise) => (o.sideRise ? o.sideRise(k) : rise * 0.94);
function addBoss(G, F, c, r = 0.42) { // carved foliate boss with gilding
  G.at(M.T(c[0], c[1] - 0.02, c[2]), () => {
    G.lathe([[r * 0.25, -r * 0.54], [r * 0.6, -r * 0.5], [r * 0.95, -r * 0.3], [r, -r * 0.08], [r * 0.7, r * 0.05]], 10);
    for (let i = 0; i < 8; i++) addLeaf(G, M.of(M.T(0, -r * 0.22, 0), M.Ry(i * 45), M.T(r * 0.72, 0, 0), M.Rz(160)), r * 0.72);
  });
}

// ==================================================================================
// CLUSTERED PIER: a lobed section of shafts around a core, with bases and foliate capitals
// ==================================================================================
function lobedRing(core, shafts, n = 64) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = TAU * i / n, c = Math.cos(a), s = Math.sin(a);
    let best = core, nx = c, nz = s;
    for (const sh of shafts) {
      // ray from the origin against each shaft circle
      const b = c * sh[0] + s * sh[1], disc = b * b - (sh[0] * sh[0] + sh[1] * sh[1] - sh[2] * sh[2]);
      if (disc >= 0) { const t = b + Math.sqrt(disc); if (t > best) { best = t; nx = (t * c - sh[0]) / sh[2]; nz = (t * s - sh[1]) / sh[2]; } }
    }
    out.push([best * c, best * s, nx, nz]);
  }
  return out;
}
function addExtrudedRing(b, ring, y0, y1, o = {}) {
  const s0 = o.s0 === undefined ? 1 : o.s0, s1 = o.s1 === undefined ? 1 : o.s1, k0 = o.k0 || 1, k1 = o.k1 || 1, N = ring.length;
  const base = b.count; let perim = 0;
  for (let i = 0; i <= N; i++) {
    const r = ring[i % N], rp = ring[(i + N - 1) % N];
    if (i > 0) perim += Math.hypot(r[0] - rp[0], r[1] - rp[1]);
    const shade = 0.5 + 0.5 * Math.pow(Math.abs(r[2] * r[0] + r[3] * r[1]) / (Math.hypot(r[0], r[1]) || 1), 2);
    b.v(r[0] * k0, y0, r[1] * k0, r[2], 0, r[3], perim, y0, s0 * shade);
    b.v(r[0] * k1, y1, r[1] * k1, r[2], 0, r[3], perim, y1, s1 * shade);
  }
  for (let i = 0; i < N; i++) b.quad(base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2);
}
function addCapital(b, ring, y, h, k, o = {}) { // bell with crocket leaves on each shaft, moulded abacus
  const N = ring.length;
  addExtrudedRing(b, ring, y, y + h * 0.1, { k0: 1.0, k1: 1.03, s0: 0.8 });
  addExtrudedRing(b, ring, y + h * 0.1, y + h * 0.82, { k0: 1.03, k1: k, s0: 0.62, s1: 0.86 });
  addExtrudedRing(b, ring, y + h * 0.82, y + h * 0.9, { k0: k, k1: k + 0.1, s0: 0.86 });
  addExtrudedRing(b, ring, y + h * 0.9, y + h, { k0: k + 0.1, k1: k + 0.12, s0: 0.95 });
  const top = ring.map((r) => [r[0] * (k + 0.12), r[1] * (k + 0.12)]);
  const ids = top.map((p) => b.v(p[0], y + h, p[1], 0, 1, 0, undefined, undefined, 0.9)); for (let i = 1; i < N - 1; i++) b.tri(ids[0], ids[i + 1], ids[i]);
  const leaves = o.leaves || 12;
  for (let i = 0; i < leaves; i++) {
    const a = i * 360 / leaves + (o.phase || 0), idx = Math.round(i / leaves * N) % N, r = ring[idx], R = Math.hypot(r[0], r[1]);
    addLeaf(b, M.of(M.T(0, y + h * 0.1, 0), M.Ry(-a), M.T(R * 1.02, 0, 0)), h * (i % 2 ? 0.72 : 0.56), { coarse: 1 });
  }
}

// The bay plan shared by every straight module (+Z side of the axis)
const zn = P.naveSpan / 2, zaw = zn + P.aisleSpan, BAY = P.bay;
// Window openings follow the bay, so changing the bay length re-proportions the glass and tracery
const WIN = {
  aW: BAY - 1.95, aSill: 4.3, aSp: P.pierTop - 1, aRise: 5.6 * (BAY - 1.95) / 4.65,
  cW: BAY - 1.55, cSill: P.triforiumTop + 0.45, cSp: P.vaultSpring + 4.8, cRise: 6.7 * (BAY - 1.55) / 5.05,
};
const windowArgs = { aisle: [WIN.aW, WIN.aSill, WIN.aSp, WIN.aRise], clere: [WIN.cW, WIN.cSill, WIN.cSp, WIN.cRise] };
const mkBatches = () => { const D = new Batch(1); D.noColor = true; return { A: new Batch(TILE.ashlar), F: new Batch(TILE.fine), L: new Batch(TILE.lead), G: new Batch(TILE.gold), O: new Batch(TILE.oak), I: new Batch(TILE.iron), D }; };
// A stain hanging from a ledge on a wall facing local +z: runoff, drips, soft shadow or rising damp. Few vertices, crisp detail.
const STAIN_RNG = mkRng(4242);
function addStain(D, x0, x1, y, z, drop, kind = 'streak') {
  const R = DECAL_UV[kind], n = Math.max(1, Math.round((x1 - x0) / 4)), w = R[2] - R[0];
  for (let i = 0; i < n; i++) {
    const a = lerp(x0, x1, i / n), c = lerp(x0, x1, (i + 1) / n), span = w * Math.min(1, (c - a) / 5), u0 = R[0] + 0.002 + STAIN_RNG() * (w - span - 0.004);
    const q = [D.v(a, y, z, 0, 0, 1, u0, R[1], 1), D.v(a, y - drop, z, 0, 0, 1, u0, R[3], 1), D.v(c, y - drop, z, 0, 0, 1, u0 + span, R[3], 1), D.v(c, y, z, 0, 0, 1, u0 + span, R[1], 1)];
    D.quad(q[0], q[1], q[2], q[3]);
  }
}
// A real recess in a wall facing local +z, whose slab already has the opening cut: back plate, moulded frame, a sill
function addRecess(A, F, outline, depth) {
  const o = area2(outline) > 0 ? outline : outline.slice().reverse();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9; for (const p of o) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); }
  A.face(o.map((p) => [p[0], p[1], -depth]));
  F.sweep(o, rollSection(0.1, 0.22, 1, 0.03, 2), { closed: true, crease: 40, z: -0.02 });
  F.sweep([[x0 - 0.16, y0 - 0.06], [x1 + 0.16, y0 - 0.06]], stringSection(0.16, 0.14), {});
}
function placeSet(name, set, pos, rot, parent, extra = {}) {
  const o = { pos, rot: [0, rot, 0], parent, scale: extra.scale };
  place(name + '_Ashlar', set.A, MAT.ashlar, o);
  place(name + '_Stone', set.F, MAT.fine, o);
  place(name + '_Lead', set.L, MAT.lead, o);
  place(name + '_Gilt', set.G, MAT.gold, o);
  place(name + '_Oak', set.O, MAT.oak, o);
  place(name + '_Iron', set.I, MAT.iron, o);
  if (set.D) place(name + '_Weathering', set.D, MAT.decal, o);
}
// Glass pair: interior face + the same panes mirrored as the exterior face
function placeGlass(name, batch, pos, rotY, parent, keepOutside, k = 1) {
  place(name + '_In', batch, MAT.glassIn, { pos, rot: [0, rotY, 0], scale: [k, k, 1], parent });
  place(name + '_Out', keepOutside ? batch : glassOutside(batch), MAT.glassOut, { pos, rot: [0, rotY, 0], scale: [k, k, -1], parent });
}
// By day a window is dark from outside and the story cannot be read, so its outer skin is only the
// window's outline over a mosaic of pot-metals: the colour hints through for a few triangles.
function glassOutside(batch) {
  if (batch.outer) return batch.outer;
  if (!batch.outline) return batch;
  const g = new Glass(7), o = batch.outline;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of o) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  g.raw(o, 'lead', -0.4, 0);
  g.withClip(o, () => gDiaper(g, x0, y0, x1, y1, 0, batch.count % 2 ? 'ruby' : 'cobalt', null, null, 0));
  batch.outer = g.b;
  return g.b;
}

function buildNaveBay(o = {}) {
  const set = o.into || mkBatches(), { A, F, L, G } = set;
  const B = o.B || BAY, ww = o.ww || BAY - 2.1, sp = P.pierTop, archRise = o.archRise || 5.1, thick = 0.85;
  const zw = o.zw === undefined ? zn : o.zw;
  if (o.part !== 'aisle') {
  // ---- Arcade wall with the moulded pointed arch ----
  const arc = pointedArc(ww, archRise, 7).map((p) => [p[0], p[1] + sp]);
  A.at(M.T(0, 0, zw), () => {
    A.slab([[-B / 2, sp], [-ww / 2, sp], ...arc, [ww / 2, sp], [B / 2, sp], [B / 2, P.triforiumSill], [-B / 2, P.triforiumSill]], [], -thick / 2, thick / 2, { noOuterSides: true });
  });
  F.at(M.T(0, 0, zw), () => { F.sweep(arc, rollSection(0.82, thick + 0.25, 2, 0.08, 3), {}); });
  // Hood mould over the arch on the nave side, with carved label stops
  F.at(M.of(M.T(0, 0, zw - thick / 2), M.Ry(180)), () => {
    const hood = pointedArc(ww + 1.9, archRise + 1.0, 6).map((p) => [p[0], p[1] + sp]);
    F.sweep(hood, stringSection(0.16, 0.14), {});
  });
  // ---- Triforium: string course, four cusped arches, dark wall passage ----
  const yT = P.triforiumSill, yT2 = P.triforiumTop, nT = o.nT || 4, tw = o.tw || (BAY - 1.72) / 4, ty = yT + 0.62, tspr = yT2 - 1.5, gapT = nT > 2 ? 0.08 : 0;
  const trfX = (i) => (i + 0.5 - nT / 2) * tw + (i < nT / 2 ? -gapT : gapT);
  F.at(M.of(M.T(0, 0, zw - thick / 2), M.Ry(180)), () => {
    F.sweep([[-B / 2, yT], [B / 2, yT]], stringSection(0.34, 0.3), {});
    F.sweep([[-B / 2, yT2], [B / 2, yT2]], stringSection(0.3, 0.26), {});
    // Colonnette arcade standing in the openings
    for (let i = 0; i < nT; i++) {
      const x = trfX(i);
      const a = pointedArc(tw * 0.92, 0.98, 4).map((p) => [x + p[0], tspr + p[1]]);
      F.sweep(a, hexBar(0.13, 0.26), { z: 0.05 });
      F.sweep(ringPts(x, tspr + 0.32, 0.17, 6), hexBar(0.05, 0.1), { z: 0.05, closed: true, s: 0.9 });
    }
    for (let i = 0; i <= nT; i++) {
      const mid = i === nT / 2;
      const x = (i - nT / 2) * tw + (i < nT / 2 ? -gapT : (mid ? 0 : gapT));
      const r = mid ? 0.14 : 0.085;
      F.at(M.T(x, 0, 0.05), () => F.lathe([[r * 1.7, ty - 0.02], [r, ty + 0.2], [r, tspr - 0.2], [r * 1.9, tspr - 0.01], [r * 1.5, tspr + 0.03]], 6));
    }
  });
  const holes = []; // openings through the inner skin
  for (let i = 0; i < nT; i++) { const x = trfX(i); holes.push(archOutline(tw * 0.92, ty, tspr, 0.98, 6).map((p) => [x + p[0], p[1]])); }
  A.at(M.T(0, 0, zw - thick / 2 + 0.22), () => A.slab([[-B / 2, yT], [B / 2, yT], [B / 2, yT2], [-B / 2, yT2]], holes, -0.22, 0.22, { noOuterSides: true, sf: 0.45, sr: 0.5 }));
  // Passage back wall and floor: seen only through the arcade, kept dark
  A.shade(0.34, () => {
    A.face([[B / 2, yT, zw + 0.92], [-B / 2, yT, zw + 0.92], [-B / 2, yT2 + 0.5, zw + 0.92], [B / 2, yT2 + 0.5, zw + 0.92]]);
    A.face([[-B / 2, yT + 0.02, zw + 0.92], [B / 2, yT + 0.02, zw + 0.92], [B / 2, yT + 0.02, zw - thick / 2 + 0.44], [-B / 2, yT + 0.02, zw - thick / 2 + 0.44]]);
    A.face([[-B / 2, yT2 + 0.2, zw - thick / 2 + 0.44], [B / 2, yT2 + 0.2, zw - thick / 2 + 0.44], [B / 2, yT2 + 0.2, zw + 0.92], [-B / 2, yT2 + 0.2, zw + 0.92]]);
  });
  // ---- Clerestory wall, window hole, tracery ----
  const cw = o.cw || WIN.cW, cSill = WIN.cSill, cSp = WIN.cSp, cRise = o.cRise || WIN.cRise;
  const yE = P.eaves;
  A.at(M.T(0, 0, zw), () => A.slab([[-B / 2, yT2], [B / 2, yT2], [B / 2, yE], [-B / 2, yE]], [archOutline(cw, cSill, cSp, cRise, 9)], -0.42, 0.42, { noOuterSides: true, sr: 0.66 }));
  F.at(M.T(0, 0, zw), () => {
    if (o.lights === 1) addLancetTracery(F, cw, cSill, cSp, cRise);
    else addTracery(F, cw, cSill, cSp, cRise, { bar: 0.26, depth: 0.44 });
    F.sweep(archOutline(cw, cSill, cSp, cRise, 9).slice(0), rollSection(0.14, 0.86, 1, 0.03, 2), { closed: true, s: 0.92, crease: 40 });
  });
  // Exterior: hood mould, wimperg gable, cornice, pierced parapet, corbel table
  set.D.at(M.T(0, 0, zw + 0.42), () => addStain(set.D, -B / 2, B / 2, yE - 0.66, 0.02, 3.6));
  F.at(M.T(0, 0, zw + 0.42), () => {
    F.sweep(pointedArc(cw + 0.5, cRise + 0.3, 6).map((p) => [p[0], p[1] + cSp]), hexBar(0.22, 0.26), {});
    addGable(F, Math.min(cw + 0.9, B * 0.96), 3.4, 0.02, 0.2, cSp + cRise * 0.52, { size: 0.44, finial: 0.8, lod: 0, crockets: 3 });
    F.sweep([[-B / 2, yT2 - 0.02], [B / 2, yT2 - 0.02]], stringSection(0.3, 0.2), {});
    F.sweep([[-B / 2, yE - 0.12], [B / 2, yE - 0.12]], stringSection(0.34, 0.38), {});
    const nCorb = Math.round(B / 1.1);
    for (let i = 0; i < nCorb; i++) { const x = -B / 2 + (i + 0.5) * B / nCorb; F.box(x - 0.13, x + 0.13, yE - 0.62, yE - 0.32, 0, 0.26, { s: 0.85, sb: 0.5 }); }
  });
  F.at(M.T(0, 0, zw + 0.3), () => addParapet(F, -B / 2, B / 2, yE, 1.1, 0.24, { pitch: 1.3, nh: 8 }));
  // Upper wall top closing the gutter
  A.face([[-B / 2, yE, zw + 0.42], [B / 2, yE, zw + 0.42], [B / 2, yE, zw - 0.42], [-B / 2, yE, zw - 0.42]], 0.7);
  }
  if (o.part !== 'upper') {
  // ---- Aisle roof (lean-to in lead) ----
  if (!o.noAisleRoof) {
    const z0 = zn + 0.42, z1 = zaw + 1.05, y0r = P.aisleRoofHigh, y1r = P.aisleWallTop - 0.2;
    L.face([[-B / 2, y0r, z0], [-B / 2, y1r, z1], [B / 2, y1r, z1], [B / 2, y0r, z0]]);
  }
  if (!o.open) {
    // ---- Aisle wall ----
    const wa = WIN.aW, sill = WIN.aSill, aSp = WIN.aSp, aRise = WIN.aRise, zOut = zaw + 0.45;
    A.at(M.T(0, 0, zOut), () => A.slab([[-B / 2, 0], [B / 2, 0], [B / 2, P.aisleWallTop], [-B / 2, P.aisleWallTop]], [archOutline(wa, sill, aSp, aRise, 9)], -0.45, 0.45, { noOuterSides: true, sr: 0.7 }));
    F.at(M.T(0, 0, zOut), () => {
      addTracery(F, wa, sill, aSp, aRise, { bar: 0.25, depth: 0.42 });
      F.sweep(archOutline(wa, sill, aSp, aRise, 9), rollSection(0.13, 0.92, 1, 0.03, 2), { closed: true, s: 0.9, crease: 40 });
    });
    // Exterior of the aisle wall
    set.D.at(M.T(0, 0, zaw + 0.9), () => {
      addStain(set.D, -B / 2, B / 2, P.aisleWallTop - 0.42, 0.02, 4.4);
      addStain(set.D, -B / 2, B / 2, sill - 0.42, 0.02, 2.6, 'drip');
      addStain(set.D, -B / 2, B / 2, sill - 0.42, 0.03, 0.7, 'soft');
      addStain(set.D, -B / 2, B / 2, P.aisleWallTop - 0.42, 0.03, 0.9, 'soft');
      addStain(set.D, -B / 2, B / 2, 5.2, 0.03, 5.2, 'ground');
      addStain(set.D, -B / 2, B / 2, 2.2, 0.04, 1.9, 'lichen');
    });
    F.at(M.T(0, 0, zaw + 0.9), () => {
      F.sweep([[-B / 2, sill - 0.2], [B / 2, sill - 0.2]], stringSection(0.34, 0.3), {});
      F.sweep(pointedArc(wa + 0.46, aRise + 0.28, 6).map((p) => [p[0], p[1] + aSp]), hexBar(0.22, 0.26), {});
      addGable(F, wa + 0.8, 3.1, 0.02, 0.2, aSp + 2.95, { size: 0.44, finial: 0.8, crockets: 4 });
      F.sweep([[-B / 2, P.aisleWallTop - 0.12], [B / 2, P.aisleWallTop - 0.12]], stringSection(0.32, 0.34), {});
      // Plinth with a chamfered weathering
      F.sweep([[-B / 2, 0.55], [B / 2, 0.55]], stringSection(0.4, 0.42), {});
      F.sweep([[-B / 2, 1.3], [B / 2, 1.3]], stringSection(0.2, 0.2), {});
      addBlindArcade(F, -B / 2 + 0.9, B / 2 - 0.9, 1.45, 2.65, 4, { bar: 0.1, depth: 0.12 });
    });
    F.at(M.T(0, 0, zaw + 0.72), () => addParapet(F, -B / 2, B / 2, P.aisleWallTop, 1.0, 0.24, { pitch: 1.3 }));
    A.face([[-B / 2, P.aisleWallTop, zaw + 0.9], [B / 2, P.aisleWallTop, zaw + 0.9], [B / 2, P.aisleWallTop, zaw], [-B / 2, P.aisleWallTop, zaw]], 0.7);
    // Interior dado: blind arcade with a niche for a statue
    F.at(M.of(M.T(0, 0, zaw), M.Ry(180)), () => {
      F.sweep([[-B / 2, sill - 0.14], [B / 2, sill - 0.14]], stringSection(0.26, 0.22), {});
      addBlindArcade(F, -B / 2 + 0.5, -1.05, 0.6, 2.6, 2, { bar: 0.1, depth: 0.14 });
      addBlindArcade(F, 1.05, B / 2 - 0.5, 0.6, 2.6, 2, { bar: 0.1, depth: 0.14 });
      F.sweep([[-B / 2, 0.42], [B / 2, 0.42]], stringSection(0.4, 0.34), {});
      // Niche canopy over the statue
      addNicheFrame(F, 0, 0.6, 3.9, 1.05);
    });
  }
  // ---- Aisle vault ----
  if (!o.noAisleVault) {
    const z0 = zn + thick / 2, z1 = zaw;
    const crown = addRibVault(F, A, [[-B / 2, z0], [B / 2, z0], [B / 2, z1], [-B / 2, z1]], sp, P.aisleCrown - 0.3, { sideRise: (k) => (k % 2 === 0 ? (k === 0 ? archRise + 0.1 : 5.0) : 5.2), nS: 6, nT: 4, ribSec: rollSection(0.26, 0.34, 2, 0.03, 2) });
    addBoss(G, F, crown, 0.32);
  }
  }
  return set;
}
// Canopied niche frame: moulded opening, gablet with crockets. Statue placed separately.
function addNicheFrame(F, x, y0, yTop, w) {
  F.at(M.T(x, 0, 0), () => {
    F.shade(0.5, () => F.face([[-w / 2, y0, -0.005], [w / 2, y0, -0.005], [w / 2, yTop - 0.75, -0.005], [0, yTop - 0.1, -0.005], [-w / 2, yTop - 0.75, -0.005]]));
    F.box(-w / 2 - 0.05, w / 2 + 0.05, y0 - 0.14, y0 + 0.08, 0, 0.5, { s: 0.92 });
    F.sweep(archOutline(w, y0, yTop - 0.82, 0.72, 5).slice(2), barSection(0.11, 0.2), { z: 0.08 });
    for (const s of [-1, 1]) { F.at(M.T(s * w / 2, 0, 0.1), () => F.lathe([[0.07, y0 + 0.05], [0.05, y0 + 0.12], [0.05, yTop - 0.9], [0.09, yTop - 0.82], [0.05, yTop - 0.78]], 6)); }
    addGable(F, w + 0.24, 0.92, 0.06, 0.1, yTop - 0.98, { size: 0.19, crockets: 2, finial: 0.32, solid: true, lod: 0 });
  });
}

// Clustered nave pier with the vault shafts rising to the springing, on +Z = nave... shafts toward -Z
function buildPier() {
  const set = mkBatches(), { F, A, G } = set;
  const core = 0.8, big = 0.25, small = 0.14;
  const shafts = [];
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; shafts.push([(core + 0.1) * Math.cos(a), (core + 0.1) * Math.sin(a), big]); }
  for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4; shafts.push([(core + 0.02) * Math.cos(a), (core + 0.02) * Math.sin(a), small]); }
  const ring = lobedRing(core, shafts, 48);
  const yB = 1.15, yC = P.pierTop - 1.05;
  // moulded base: octagonal plinth, roll, scotia, then the lobed shaft
  F.lathe([[1.7, 0], [1.7, 0.56], [1.58, 0.62]], 8, { faceted: true, phase: PI / 8, s: 0.85 });
  addExtrudedRing(F, ring, 0.62, 0.86, { k0: 1.24, k1: 1.27 });
  addExtrudedRing(F, ring, 0.86, yB, { k0: 1.27, k1: 1.0, s0: 0.75, s1: 0.72 });
  addExtrudedRing(F, ring, yB, yC, { s0: 0.8 });
  addCapital(F, ring, yC, 1.05, 1.2, { leaves: 14 });
  // The vault shafts rising from the capital up the nave wall (toward -Z)
  const upper = [[0, -(core + 0.1), big], [-0.5, -(core - 0.04), small], [0.5, -(core - 0.04), small]];
  for (const u of upper) {
    F.at(M.T(u[0], 0, u[1] + 0.44), () => {
      const r = u[2], yS = P.vaultSpring;
      F.lathe([[r * 1.5, P.pierTop], [r, P.pierTop + 0.25], [r, P.triforiumSill - 0.1], [r * 1.5, P.triforiumSill + 0.06], [r, P.triforiumSill + 0.22], [r, yS - 0.85], [r * 1.5, yS - 0.8], [r * 1.14, yS - 0.7], [r * 2.2, yS]], 8);
      for (let i = 0; i < 4; i++) addLeaf(F, M.of(M.T(0, yS - 0.72, 0), M.Ry(i * 90 + 45), M.T(r * 1.1, 0, 0)), 0.56, { coarse: 1 });
    });
  }
  // Statue stage on the nave face: corbel below, canopy above (the figure is placed separately)
  const zF = -(core + 0.34);
  F.at(M.T(0, 0, zF), () => {
    F.lathe([[0.1, 5.0], [0.28, 5.25], [0.44, 5.6], [0.5, 5.72], [0.44, 5.78]], 8, { s: 0.85 });
    for (let i = 0; i < 6; i++) addLeaf(F, M.of(M.T(0, 5.04, 0), M.Ry(i * 60), M.T(0.14, 0, 0)), 0.66, { coarse: 1 });
    // Canopy over the statue: three arched gablets and a little spire
    F.at(M.T(0, 8.25, 0), () => {
      F.lathe([[0.5, -0.02], [0.54, 0.06], [0.42, 0.12], [0.3, 0.6], [0.02, 2.0]], 6, { faceted: true, phase: PI / 6 });
      for (let i = 0; i < 3; i++) F.at(M.of(M.Ry(-60 + i * 60 + 180), M.T(0, 0, 0.44)), () => addGable(F, 0.62, 0.62, -0.03, 0.06, 0.02, { size: 0.15, crockets: 1, finial: 0.2, solid: true, lod: 0 }));
    });
  });
  return set;
}
// The hemicycle's pier: the nave pier's family, slimmer, with one vault shaft running up to the springing
function buildApsePier() {
  const set = mkBatches(), { F } = set, core = 0.5, big = 0.15, small = 0.09, shafts = [];
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; shafts.push([(core + 0.06) * Math.cos(a), (core + 0.06) * Math.sin(a), big]); }
  for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; shafts.push([(core + 0.01) * Math.cos(a), (core + 0.01) * Math.sin(a), small]); }
  const ring = lobedRing(core, shafts, 32), yB = 0.86, yC = P.pierTop - 0.82;
  F.lathe([[1.02, 0], [1.02, 0.46], [0.94, 0.52]], 8, { faceted: true, phase: PI / 8 });
  addExtrudedRing(F, ring, 0.52, yB, { k0: 1.26, k1: 1.0 });
  addExtrudedRing(F, ring, yB, yC, {});
  addCapital(F, ring, yC, 0.82, 1.22, { leaves: 10 });
  F.at(M.T(0, 0, -(core + 0.06) + 0.24), () => {
    const r = big, yS = P.vaultSpring;
    F.lathe([[r * 1.5, P.pierTop], [r, P.pierTop + 0.25], [r, yS - 0.5], [r * 1.5, yS - 0.42], [r * 2.1, yS]], 8);
  });
  return set;
}
// Flying buttress unit at a bay boundary: massive pier, two arched flyers, tabernacle and pinnacles
const flyerRise = (yA, yB, t) => yA + (yB - yA) * lerp(t, Math.sin(t * PI / 2), 0.6);
function flyerShape(zA, yA, zB, yB, thick) { // A at the pier (outer), B at the wall (inner); returns polygon points in (z,y)
  const N = 12, under = [], top = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = lerp(zA, zB, t), y = flyerRise(yA, yB, t);
    under.push([z, y]);
  }
  // The coping is a straight line clear above the arch: deep over the pier, close over the wall, the lights open between
  const topA = [zA - 0.05, yA + 2.5], topB = [zB, yB + 0.72];
  return { under, topA, topB };
}
function buildButtress() {
  const set = mkBatches(), { A, F, G } = set;
  const hw = 0.88, z0 = zaw + 0.9, zB = 19.2;
  const tiers = [[0, 10, zB], [10, 17.5, zB - 0.5], [17.5, 23.4, zB - 0.9]];
  tiers.forEach((t, i) => {
    const w = hw - i * 0.08;
    A.box(-w, w, t[0], t[1], z0 - 0.05, t[2], { noBot: true });
    if (i < 2) {
      // sloped weathering set-off to the next stage
      const zt = tiers[i + 1][2], w2 = hw - (i + 1) * 0.08;
      A.face([[-w, t[1], t[2]], [w, t[1], t[2]], [w2, t[1] + 1.2, zt], [-w2, t[1] + 1.2, zt]], 1.0);
      F.at(M.of(M.T(0, 0, t[2]), M.Rx(0)), () => F.sweep([[-w - 0.04, t[1] - 0.14], [w + 0.04, t[1] - 0.14]], stringSection(0.26, 0.2), {}));
    }
  });
  // Moulded plinth around the base
  F.at(M.T(0, 0, zB), () => { F.sweep([[-hw - 0.2, 0.75], [hw + 0.2, 0.75]], stringSection(0.5, 0.42), {}); F.box(-hw - 0.3, hw + 0.3, 0, 0.52, -0.02, 0.32, { s: 0.75 }); });
  for (const s of [-1, 1]) F.at(M.of(M.T(s * hw, 0, 0), M.Ry(s * 90)), () => {
    const a = s > 0 ? -zB - 0.2 : z0, c = s > 0 ? -z0 : zB + 0.2;
    F.sweep([[a, 0.75], [c, 0.75]], stringSection(0.5, 0.42), {}); F.box(a, c, 0, 0.52, -0.02, 0.32, { s: 0.75 });
  });
  set.D.at(M.T(0, 0, zB), () => { addStain(set.D, -hw, hw, 9.84, 0.02, 3.2); addStain(set.D, -hw, hw, 5, 0.34, 4.4, 'ground'); });
  // Blind tracery on the front of the lower stages
  F.at(M.T(0, 0, zB), () => {
    addBlindArcade(F, -hw + 0.1, hw - 0.1, 2.0, 6.6, 1, { bar: 0.12, depth: 0.14 });
    addGable(F, hw * 1.7, 1.4, 0.02, 0.14, 8.0, { size: 0.3, crockets: 2, finial: 0.5, solid: true, lod: 0 });
  });
  F.at(M.T(0, 0, zB - 0.5), () => { addBlindArcade(F, -hw + 0.16, hw - 0.16, 11.6, 14.6, 1, { bar: 0.12, depth: 0.14 }); });
  // The rear of the pier rises higher to take the flyers, ending in a sloped weathering
  const zStack = 16.25, yStack = 30.6;
  A.box(-hw + 0.14, hw - 0.14, 23.3, yStack, z0 - 0.05, zStack, { noBot: true, noTop: true });
  A.face([[-hw + 0.14, yStack, zStack], [hw - 0.14, yStack, zStack], [hw - 0.14, yStack + 1.1, z0 - 0.05], [-hw + 0.14, yStack + 1.1, z0 - 0.05]]);
  F.at(M.T(0, 0, zStack), () => F.sweep([[-hw + 0.1, yStack - 0.1], [hw - 0.1, yStack - 0.1]], stringSection(0.24, 0.2), {}));
  // Tabernacle of colonnettes at the top of the pier holding an angel
  const zT = 17.3, yT0 = 23.4, yT1 = 28.4;
  F.box(-hw, hw, yT0 - 0.02, yT0 + 0.1, zStack - 0.02, zB - 0.9 + 0.02, { s: 0.95 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.at(M.T(sx * 0.72, 0, zT + sz * 0.72), () => F.lathe([[0.2, yT0], [0.14, yT0 + 0.12], [0.1, yT0 + 0.2], [0.1, yT1 - 0.22], [0.14, yT1 - 0.15], [0.22, yT1]], 8));
  // Canopy: arched, gabled and crowned by the crocketed pinnacle
  for (let i = 0; i < 4; i++) F.at(M.of(M.T(0, 0, zT), M.Ry(i * 90), M.T(0, 0, 0.72)), () => {
    F.sweep(pointedArc(1.3, 1.25, 6).map((p) => [p[0], yT1 - 1.25 + p[1] - 0.02]), traceryBar(0.1, 0.16), {});
    addGable(F, 1.7, 1.25, -0.06, 0.12, yT1, { size: 0.28, crockets: 2, finial: 0.48, lod: 0, solid: true });
  });
  F.box(-0.92, 0.92, yT1 - 0.06, yT1 + 0.18, zT - 0.92, zT + 0.92, { s: 0.9 });
  F.at(M.T(0, yT1 + 0.18, zT), () => addPinnacle(F, 1.42, 8.4, { lod: 1 }));
  // Two flyers, each a true arch: a moulded rib springing from the pier, a thin plate pierced by a row of
  // pointed lights standing on it, and a straight sloped coping with a gabled top shedding the rain
  const fly = (zA, yA, zB, yB, th) => {
    const { under, topA, topB } = flyerShape(zA, yA, zB, yB, th);
    const band = 0.34, upper = under.map((p) => [p[0], p[1] + band]);
    const onTop = (z) => lerp(topA[1], topB[1], (z - topA[0]) / (topB[0] - topA[0]));
    const onRib = (t) => flyerRise(yA, yB, t) + band;
    const holes = [], N = 6;
    for (let i = 0; i < N; i++) {
      const t0 = (i + 0.16) / N, t1 = (i + 0.84) / N, z0 = lerp(zA, zB, t0), z1 = lerp(zA, zB, t1), u0 = onRib(t0) + 0.04, u1 = onRib(t1) + 0.04, a0 = onTop(z0) - 0.1, a1 = onTop(z1) - 0.1, h = Math.min(a0 - u0, a1 - u1);
      if (h < 0.22) continue;
      const r = Math.min(h * 0.42, Math.abs(z1 - z0) * 0.8), hole = [[z0, u0], [z1, u1], [z1, a1 - r], [(z0 + z1) / 2, (a0 + a1) / 2], [z0, a0 - r]];
      holes.push(area2(hole) > 0 ? hole : hole.slice().reverse());
    }
    F.at(M.Ry(-90), () => {
      F.slab([...upper, topB, topA], holes, -0.12, 0.12, { sr: 0.7, so: 0.8 });
      F.slab([...under, ...upper.slice().reverse()], [], -0.27, 0.27, {});
      F.sweep(under, rollSection(0.12, 0.34, 1, 0.03, 2), { caps: false });
    });
    const ye = -0.03, yr = 0.17, we = 0.33, a = [topA[1], topA[0]], c = [topB[1], topB[0]];
    F.face([[-we, a[0] + ye, a[1]], [0, a[0] + yr, a[1]], [0, c[0] + yr, c[1]], [-we, c[0] + ye, c[1]]]);
    F.face([[0, a[0] + yr, a[1]], [we, a[0] + ye, a[1]], [we, c[0] + ye, c[1]], [0, c[0] + yr, c[1]]]);
    F.face([[-we, c[0] + ye, c[1]], [we, c[0] + ye, c[1]], [we, a[0] + ye, a[1]], [-we, a[0] + ye, a[1]]]);
    const n = Math.round(Math.hypot(topA[0] - topB[0], topA[1] - topB[1]) / 1.4);
    crocketsAlong(F, [0, topA[1] + 0.14, topA[0]], [0, topB[1] + 0.14, topB[0]], n, 0.5, [0, 1, 0], 0);
  };
  fly(zStack - 0.1, 28.0, zn + 1.12, 35.6, 0.48);
  fly(zStack - 0.1, 22.0, zn + 1.12, 28.6, 0.54);
  // Upper pier on the clerestory wall where the flyers land, with its own pinnacle above the parapet
  const yE = P.eaves;
  A.box(-0.62, 0.62, P.aisleRoofHigh - 1, yE + 1.2, zn + 0.42, zn + 1.14, { s: 0.98, noBot: true });
  A.face([[-0.62, yE + 1.2, zn + 1.14], [0.62, yE + 1.2, zn + 1.14], [0.62, yE + 1.95, zn + 0.42], [-0.62, yE + 1.95, zn + 0.42]]);
  F.at(M.T(0, yE + 1.2, zn + 0.74), () => addPinnacle(F, 0.9, 6.4, { simple: 1 }));
  F.at(M.T(0, 0, zn + 1.14), () => { F.lathe([[0.16, 31.2], [0.1, 31.4], [0.1, 40.5], [0.17, 40.8]], 8); });
  // Interior respond on the aisle wall: a small cluster carrying the aisle vault
  const ringR = lobedRing(0.32, [[0, -0.44, 0.17], [-0.34, -0.26, 0.11], [0.34, -0.26, 0.11]], 26);
  F.at(M.T(0, 0, zaw), () => {
    addExtrudedRing(F, ringR, 0.4, P.pierTop - 0.8, { s0: 0.8 });
    addCapital(F, ringR, P.pierTop - 0.8, 0.8, 1.2, { leaves: 6 });
    F.lathe([[0.62, 0], [0.62, 0.42], [0.42, 0.5]], 8, { faceted: true, phase: PI / 8, s: 0.85 });
  });
  // Spout from the aisle gutter
  return set;
}

function addLancetTracery(b, w, y0, ys, rise) { // single-light frame with a cusped head
  const secT = traceryBar(0.13, 0.3), cr = w * 0.32, cy = ys + rise * 0.34, cusp = [];
  for (let i = 0; i <= 12; i++) { const a = rad(-30 + i * 240 / 12), R = cr * (0.86 + 0.22 * Math.abs(Math.sin(a * 1.5 + 0.4))); cusp.push([R * Math.cos(a), cy + R * Math.sin(a)]); }
  b.sweep(cusp, secT, {});
  b.sweep([[w / 2, cy - cr * 0.4], cusp[0]], secT, {});
  b.sweep([[-w / 2, cy - cr * 0.4], cusp[12]], secT, {});
}
function makeLancetGlass(w, y0, ys, rise, seed, fig, o) {
  const g = new Glass(seed);
  g.raw(archOutline(w, y0, ys, rise, 8), 'lead', -0.4, 0);
  gLancetSaint(g, 0, w, y0, ys, rise, fig, o || {});
  return g.b;
}

// ==================================================================================
// PLAN: everything is derived from the parameters at the top of the file.
// ==================================================================================
const LAY = (() => {
  const xW = P.xWest, xTowerE = xW - P.towerDepth, xNaveE = xTowerE - P.naveBays * BAY, xc = xNaveE - zn, xChoirW = xc - zn, xa = xChoirW - P.choirBays * BAY;
  const ridge = P.eaves + (zn + 1) * P.roofPitch;
  return { xW, xTowerE, xNaveE, xc, xChoirW, xa, ridge };
})();
// A rigid module frame: rotation about Y at an origin on the ground
const frame = (th, ox, oz) => {
  const c = Math.cos(rad(th)), s = Math.sin(rad(th));
  return { th, ox, oz, pos: (x, y, z) => [ox + x * c + z * s, y, oz - x * s + z * c], rot: (d = 0) => [0, th + d, 0] };
};
const SAINTS = ['apostle', 'peter', 'paul', 'bishop', 'prophet', 'martyr', 'paul', 'apostle', 'bishop', 'prophet'];

// Baked floor light: dim towards the walls and the corners

function buildVaultNave() {
  const s = mkBatches();
  const crown = addRibVault(s.F, s.A, [[-BAY / 2, -zn + 0.42], [BAY / 2, -zn + 0.42], [BAY / 2, zn - 0.42], [-BAY / 2, zn - 0.42]], P.vaultSpring, P.vaultCrown, { sideRise: (k) => (P.vaultCrown - P.vaultSpring) * (k % 2 === 0 ? 0.86 : 0.99), nS: 10, nT: 8 });
  addBoss(s.G, s.F, crown, 0.55);
  return s;
}

// ---- Chevet: hemicycle, ambulatory and a radiating chapel per sector ----------------
const CHEV = (() => {
  const d = 180 / P.apseSides, h = rad(d / 2), Ra = zn * Math.cos(h), hs = zn * Math.sin(h), Ro = zaw * Math.cos(h), hso = zaw * Math.sin(h);
  const Rc = 2.5, zc = Ro + 3.0;
  return { d, h, Ra, hs, Ro, hso, Rc, zc };
})();
function buildChevetSector() {
  const set = mkBatches(), { A, F, L, G } = set, { Ra, hs, Ro, hso, Rc, zc } = CHEV;
  buildNaveBay({ into: set, part: 'upper', B: 2 * hs, zw: Ra, ww: 1.62, archRise: 5.0, nT: 2, tw: 1.05, cw: 2.05, cRise: 4.3, lights: 1 });
  // Hemicycle vault: one web from this side up to the crown over the apse centre
  const yS = P.vaultSpring, yC = P.vaultCrown;
  addVaultCell(A, [-hs + 0.0, Ra - 0.42], [hs, Ra - 0.42], [0, 0], yS, yC, 9.6, 7, 8);
  const sec = rollSection(0.32, 0.42, 2, 0.04, 2);
  addRib(F, [-hs, Ra - 0.42], [hs, Ra - 0.42], yS, 9.6, sec, 6);
  addRib(F, [-zn * Math.sin(CHEV.h), (zn - 0.42) * Math.cos(CHEV.h)], [0, 0], yS, yC - yS, sec, 9, true);
  // Ambulatory vault (trapezoid)
  const c2 = addRibVault(F, A, [[-hs, Ra + 0.42], [hs, Ra + 0.42], [hso, Ro], [-hso, Ro]], P.pierTop, P.aisleCrown - 0.3, { sideRise: (k) => (k === 0 ? 5.1 : k === 2 ? 5.2 : 5.1), nS: 6, nT: 4, ribSec: rollSection(0.24, 0.32, 2, 0.03, 2) });
  addBoss(G, F, c2, 0.3);
  // Outer wall with the arched chapel mouth
  const yW = P.aisleWallTop, mw = 3.55, mS = 8.6, mR = 4.8;
  const mouth = pointedArc(mw, mR, 8).map((p) => [p[0], p[1] + mS]);
  A.at(M.T(0, 0, Ro + 0.3), () => A.slab([[-hso, 0], [-mw / 2, 0], [-mw / 2, mS], ...mouth, [mw / 2, mS], [mw / 2, 0], [hso, 0], [hso, yW], [-hso, yW]], [], -0.3, 0.3, { noOuterSides: true, sr: 0.7 }));
  // The moulding fills the whole wall thickness: it is also the soffit of the opening
  F.at(M.T(0, 0, Ro + 0.3), () => F.sweep(mouth, rollSection(0.42, 0.96, 2, 0.05, 2), {}));
  F.at(M.T(0, 0, Ro + 0.6), () => { F.sweep([[-hso, yW - 0.12], [hso, yW - 0.12]], stringSection(0.3, 0.3), {}); addParapet(F, -hso, hso, yW, 1.0, 0.24, { pitch: 1.1 }); });
  A.face([[-hso, yW, Ro + 0.6], [hso, yW, Ro + 0.6], [hso, yW, Ro], [-hso, yW, Ro]], 0.7);
  // Ambulatory lean-to roof
  const zR0 = Ra + 0.42, hsR0 = (zR0 / Ra) * hs, zR1 = Ro + 0.9, hsR1 = (zR1 / Ro) * hso;
  L.face([[-hsR0, P.aisleRoofHigh, zR0], [-hsR1, yW - 0.2, zR1], [hsR1, yW - 0.2, zR1], [hsR0, P.aisleRoofHigh, zR0]]);
  // Hipped roof over the hemicycle
  const yE = P.eaves + 0.15, Re = zn + 0.72, hRe = Re * Math.sin(CHEV.h), aRe = Re * Math.cos(CHEV.h);
  L.grid((u, v) => [lerp(-hRe, hRe, u) * (1 - v), lerp(yE, LAY.ridge, v), aRe * (1 - v)], 2, 2, { flip: false });
  // Radiating chapel: five faceted walls, each with a tall lancet, rib vault, conical lead roof
  const nF = P.chapelFacets, span = 216, yC1 = 16.2, dF = span / nF, ap = Rc * Math.cos(rad(dF / 2)), halfF = Rc * Math.sin(rad(dF / 2)), lw = 1.3, sill = 3.2, lSp = 9.9, lR = 2.5;
  const verts = [];
  for (let i = 0; i <= nF; i++) { const f = rad(-span / 2 + i * dF); verts.push([Rc * Math.sin(f), zc + Rc * Math.cos(f)]); }
  for (let i = 0; i < nF; i++) {
    const fm = -span / 2 + (i + 0.5) * dF;
    const m = M.of(M.T(0, 0, zc), M.Ry(fm), M.T(0, 0, ap));
    A.at(m, () => A.slab([[-halfF, 0], [halfF, 0], [halfF, yC1], [-halfF, yC1]], [archOutline(lw, sill, lSp, lR, 7)], 0, 0.5, { noOuterSides: true, sr: 0.68 }));
    F.at(m, () => {
      addLancetTracery(F, lw, sill, lSp, lR);
      F.sweep(archOutline(lw, sill, lSp, lR, 5), hexBar(0.12, 0.56), { closed: true, z: 0.25, s: 0.9, crease: 40 });
    });
    F.at(M.of(m, M.T(0, 0, 0.5)), () => {
      F.sweep([[-halfF - 0.1, sill - 0.14], [halfF + 0.1, sill - 0.14]], stringSection(0.24, 0.2), { caps: false });
      F.sweep([[-halfF - 0.1, 0.5], [halfF + 0.1, 0.5]], stringSection(0.36, 0.3), { caps: false });
      F.sweep([[-halfF - 0.1, yC1 - 0.1], [halfF + 0.1, yC1 - 0.1]], stringSection(0.3, 0.3), { caps: false });
      addGable(F, lw + 0.9, 2.4, 0.01, 0.14, lSp + 2.15, { size: 0.32, crockets: 2, finial: 0.56, lod: 0 });
      addParapet(F, -halfF, halfF, yC1, 0.82, 0.18, { pitch: 1.3, nh: 8 });
    });
    addVaultCell(A, verts[i], verts[i + 1], [0, zc], 9.2, 14.6, 3.6, 5, 4);
    addRib(F, verts[i], verts[i + 1], 9.2, 3.6, rollSection(0.16, 0.22, 1, 0.02, 2), 5);
  }
  addVaultCell(A, verts[nF], verts[0], [0, zc], 9.2, 14.6, 4.2, 5, 4);
  for (let i = 0; i <= nF; i++) {
    addRib(F, verts[i], [0, zc], 9.2, 5.4, rollSection(0.17, 0.24, 1, 0.02, 2), 6, true);
    // Exterior angle buttress and little pinnacle; interior wall shaft
    const f = -span / 2 + i * dF, ve = verts[i];
    F.at(M.of(M.T(ve[0], 0, ve[1]), M.Ry(f)), () => {
      A.at(M.of(M.T(ve[0], 0, ve[1]), M.Ry(f)), () => A.box(-0.24, 0.24, 0, 14.2, 0.26, 1.02, { s: 0.98, noBot: true, taperZ: 0.3 }));
      F.at(M.T(0, 14.18, 0.62), () => addPinnacle(F, 0.62, 3.9, { simple: 1 }));
      F.lathe([[0.17, 0], [0.09, 0.6], [0.09, 9.1], [0.17, 9.2]], 5);
    });
  }
  // The neck joining the chapel to the ambulatory: side walls, a pointed barrel vault, a lead cap
  const zN0 = Ro + 0.6, zN1 = verts[0][1], hN0 = mw / 2, hN1 = Math.abs(verts[0][0]);
  for (const s of [-1, 1]) A.prism([[s * hN0, zN0 - 0.05], [s * hN1, zN1 + 0.05], [s * (hN1 + 0.5), zN1 + 0.05], [s * (hN0 + 0.5), zN0 - 0.05]], 0, yC1);
  // Same subdivision as the chapel's last web so the seam has no cracks; a rib covers the joint
  A.grid((u, v) => { const hw = lerp(hN0, hN1, v); return [lerp(-hw, hw, u), 9.2 + arcH(2 * hw, 4.2, u), lerp(Ro + 0.3, zN1 + 0.02, v), 0.8]; }, 5, 1, { flip: false }); // starts under the arch moulding, so no ray can pass above it
  addRib(F, verts[nF], verts[0], 9.2, 4.2, rollSection(0.16, 0.26, 1, 0.02, 2), 5);
  L.face([[-(hN0 + 0.5), yC1 + 0.03, zN1 + 0.1], [hN0 + 0.5, yC1 + 0.03, zN1 + 0.1], [hN0 + 0.5, yC1 + 0.03, zN0 - 0.1], [-(hN0 + 0.5), yC1 + 0.03, zN0 - 0.1]]);
  // Lead cone
  L.at(M.T(0, 0, zc), () => { const n = 10, rb = Rc + 0.5; L.grid((u, v) => { const a = -PI + TAU * u, r = rb * (1 - v), y = lerp(yC1 + 0.05, yC1 + 7.4, v); return [r * Math.sin(a), y, r * Math.cos(a)]; }, n, 2, { flip: false, wrapU: true }); });
  G.at(M.T(0, yC1 + 7.3, zc), () => addFinial(G, 1.25, 1));
  return set;
}

// ---- Lead roofs with metric UVs so the seams run down the slope ----------------------
function addRoofRun(L, x0, x1, half, yE, yR) {
  const slope = Math.hypot(half, yR - yE);
  for (const s of [-1, 1]) {
    const a = L.v(x0, yE, s * half, 0, half, s * (yR - yE), x0, 0, 1), b = L.v(x1, yE, s * half, 0, half, s * (yR - yE), x1, 0, 1);
    const c = L.v(x1, yR, 0, 0, half, s * (yR - yE), x1, slope, 1), d = L.v(x0, yR, 0, 0, half, s * (yR - yE), x0, slope, 1);
    if (s > 0) L.quad(a, b, c, d); else L.quad(b, a, d, c);
  }
}
function buildCresting(len) { // gilded fleur-de-lis cresting for a length of ridge
  const G = new Batch(TILE.gold), n = Math.round(len / 0.9);
  G.box(-len / 2, len / 2, -0.04, 0.05, -0.05, 0.05, {});
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * len / n;
    G.at(M.T(x, 0.05, 0), () => {
      G.tube([[0, 0, 0], [0, 0.34, 0], [0, 0.62, 0]], (t) => [lerp(0.05, 0.005, t), lerp(0.035, 0.005, t)], 4);
      for (const s of [-1, 1]) G.tube(spline([[0, 0.14, 0], [s * 0.15, 0.26, 0], [s * 0.2, 0.42, 0], [s * 0.1, 0.46, 0]], 1), (t) => lerp(0.035, 0.008, t), 4);
      G.box(-0.08, 0.08, 0.12, 0.17, -0.03, 0.03, {});
    });
  }
  return G;
}

// ---- Crossing: four great piers, four arches, a gilded boss, the fleche above ----------
function buildCrossingPier() {
  const set = mkBatches(), { F } = set;
  const core = 1.08, sh = [];
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; sh.push([(core + 0.12) * Math.cos(a), (core + 0.12) * Math.sin(a), i % 2 ? 0.2 : 0.3]); }
  for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4; sh.push([(core + 0.02) * Math.cos(a), (core + 0.02) * Math.sin(a), 0.13]); }
  const ring = lobedRing(core, sh, 80), yC = P.vaultSpring - 1.1;
  F.lathe([[2.05, 0], [2.05, 0.6], [1.9, 0.68]], 8, { faceted: true, phase: PI / 8, s: 0.85 });
  addExtrudedRing(F, ring, 0.68, 0.94, { k0: 1.2, k1: 1.23 });
  addExtrudedRing(F, ring, 0.94, 1.25, { k0: 1.23, k1: 1, s0: 0.75, s1: 0.75 });
  addExtrudedRing(F, ring, 1.25, yC, { s0: 0.8 });
  addCapital(F, ring, yC, 1.1, 1.14, { leaves: 16 });
  return set;
}
function buildAislePier() {
  const set = mkBatches(), { F } = set;
  const sh = []; for (let i = 0; i < 4; i++) { const a = i * PI / 2; sh.push([0.62 * Math.cos(a), 0.62 * Math.sin(a), 0.2]); }
  const ring = lobedRing(0.54, sh, 40);
  F.lathe([[1.15, 0], [1.15, 0.5], [1.02, 0.56]], 8, { faceted: true, phase: PI / 8, s: 0.85 });
  addExtrudedRing(F, ring, 0.56, 0.86, { k0: 1.28, k1: 1, s0: 0.75 });
  addExtrudedRing(F, ring, 0.86, P.pierTop - 0.9, { s0: 0.8 });
  addCapital(F, ring, P.pierTop - 0.9, 0.9, 1.18, { leaves: 8 });
  return set;
}
function buildFleche(parent, x, z) {
  const L = new Batch(TILE.lead), G = new Batch(TILE.gold), F = new Batch(TILE.fine);
  const y0 = LAY.ridge - 2.5, yB = LAY.ridge + 7, yT = P.flecheTip - 3.2, R = 2.9, n = 8;
  // Octagonal base and open arcaded lantern
  L.lathe([[R + 0.4, y0], [R + 0.25, y0 + 2.8], [R + 0.5, y0 + 3], [R + 0.5, y0 + 3.3], [R, y0 + 3.5]], n, { faceted: true, phase: PI / 8 });
  L.lathe([[R * 0.78, y0 + 3.5], [R * 0.78, yB + 0.3]], n, { faceted: true, phase: PI / 8, s: 0.34 });
  for (let i = 0; i < n; i++) {
    const a = i * 45, ap = R * Math.cos(rad(22.5)), side = 2 * R * Math.sin(rad(22.5));
    L.at(M.of(M.Ry(a + 22.5), M.T(0, 0, ap)), () => {
      for (const s of [-1, 1]) L.tube([[s * side * 0.5, y0 + 3.5, 0], [s * side * 0.5, yB, 0]], 0.13, 6, {});
      const arc = pointedArc(side * 0.92, 2.2, 6).map((p) => [p[0], yB - 2.45 + p[1]]);
      L.sweep(arc, traceryBar(0.13, 0.2), {});
      G.at(M.of(M.Ry(a + 22.5), M.T(0, 0, ap + 0.1)), () => addGable(G, side * 1.04, 1.6, -0.05, 0.08, yB - 0.24, { size: 0.26, crockets: 2, finial: 0.44, lod: 0, solid: true }));
    });
  }
  L.lathe([[R + 0.2, yB - 0.05], [R + 0.34, yB + 0.1], [R + 0.2, yB + 0.26]], n, { faceted: true, phase: PI / 8 });
  // The spire, its ribs and gilded crockets
  L.lathe([[R * 0.98, yB + 0.26], [R * 0.72, yB + 3.2], [0.1, yT]], n, { faceted: true, phase: PI / 8 });
  for (let i = 0; i < n; i++) {
    const a = rad(i * 45 + 22.5 + 22.5), c = Math.cos(a), s = Math.sin(a);
    const pts = [[R * 0.98 * c * 1.0, yB + 0.3, R * 0.98 * s], [R * 0.72 * c, yB + 3.2, R * 0.72 * s], [0.14 * c, yT - 0.2, 0.14 * s]];
    G.tube(pts, (t) => lerp(0.1, 0.03, t), 5);
    crocketsAlong(G, pts[1], pts[2], 7, 0.66, [c, 0.1, s], 0);
  }
  G.at(M.T(0, yT - 0.15, 0), () => {
    G.lathe([[0.14, 0], [0.3, 0.28], [0.34, 0.5], [0.22, 0.72], [0.06, 0.9], [0.05, 3.2]], 10);
    G.box(-0.06, 0.06, 2.2, 3.35, -0.06, 0.06, {}); G.box(-0.6, 0.6, 2.56, 2.72, -0.06, 0.06, {});
  });
  place('Fleche_Lead', L, MAT.lead, { pos: [x, 0, z], parent });
  place('Fleche_Gilt', G, MAT.gold, { pos: [x, 0, z], parent });
}

// Coloured light thrown onto the paving by the south aisle windows (sun from the south-west)
function buildLightPools(xs) {
  // A single soft image of the two-light window, thrown through the south aisle windows and sheared across the floor
  const b = new Batch(1); b.noColor = true;
  const sill = WIN.aSill, top = WIN.aSp + WIN.aRise, w = WIN.aW, P0 = (uu, vv) => [xw_ + uu + vv * P.sunShear[0], 0.035, -zaw + vv * P.sunShear[1]];
  let xw_ = 0;
  xs.forEach((xw, i) => {
    xw_ = xw;
    const f = i % 2 ? 1 : 0, u0 = f, u1 = 1 - f;
    const ids = [[-w / 2, sill, u0, 1], [w / 2, sill, u1, 1], [w / 2, top, u1, 0], [-w / 2, top, u0, 0]].map((q) => { const p = P0(q[0], q[1]); return b.v(p[0], p[1], p[2], 0, 1, 0, q[2], q[3], 1); });
    b.quad(ids[0], ids[3], ids[2], ids[1]);
  });
  return b;
}

function storyWindows() { // the narrative aisle windows
  const sets = [
    [['annunciation', 'nativity', 'magi', 'shepherd', 'supper'], ['crucifixion', 'resurrection', 'david', 'noah', 'annunciation']],
    [['noah', 'david', 'annunciation', 'nativity', 'magi'], ['shepherd', 'supper', 'crucifixion', 'resurrection', 'david']],
    [['magi', 'supper', 'noah', 'crucifixion', 'shepherd'], ['nativity', 'david', 'resurrection', 'annunciation', 'supper']],
    [['resurrection', 'shepherd', 'crucifixion', 'david', 'nativity'], ['supper', 'annunciation', 'magi', 'noah', 'resurrection']],
  ];
  const grounds = [['ruby', 'cobalt'], ['cobalt', 'ruby'], ['emerald', 'ruby'], ['violet', 'cobalt']];
  return sets.slice(0, P.storyWindows).map((s, n) => makeWindowGlass(...windowArgs.aisle, 40 + n, {
    light: (g, x, w, y0, ys, r, i) => gLancetStory(g, x, w, y0, ys, r, s[i].slice(0, 4), { c1: grounds[n][0], c2: grounds[n][1], g1: grounds[(n + 1) % 4][1], g2: grounds[n][0], cell: 0.86 }),
    oculus: { ground: grounds[n][1], inner: grounds[n][0] },
  }));
}
const CLERE_SAINTS = [
  [{ robe: 'white', mantle: 'ruby', beard: 1, attr: 'book' }, { robe: 'emerald', mantle: 'gold', crown: 1, beard: 2, attr: 'cross', arm: 'point', halo: false }],
  [{ robe: 'pale', mantle: 'cobalt', veil: 'azure', arm: 'pray' }, { robe: 'violet', mantle: 'white', mitre: 'white', attr: 'staff', arm: 'up' }],
  [{ robe: 'gold', mantle: 'emerald', beard: 2, hair: 'grey', beardCol: 'pearl', attr: 'key', arm: 'point' }, { robe: 'white', mantle: 'purple', beard: 1, attr: 'sword', arm: 'point' }],
  [{ robe: 'rubyLt', mantle: 'teal', crown: 1, attr: 'lily', arm: 'point', halo: false }, { robe: 'white', mantle: 'rubyLt', arm: 'orant', wings: 'gold' }],
];
function clereWindows() {
  return CLERE_SAINTS.slice(0, P.clerestoryWindows).map((pair, n) => makeWindowGlass(...windowArgs.clere, 60 + n, {
    light: (g, x, w, y0, ys, r, i) => gLancetSaint(g, x, w, y0, ys, r, pair[i], (i + n) % 2 ? { ground: 'ruby', ground2: 'cobalt' } : { ground: 'cobalt', ground2: 'ruby' }),
    oculus: { bust: { robe: 'rubyLt', beard: 1, cross: 1 }, ground: 'cobalt', inner: 'gold' },
  }));
}

function buildBody() {
  const { xTowerE, xNaveE, xc, xChoirW, xa, ridge } = LAY;
  const gNave = group('Nave'), gChoir = group('Choir'), gTN = group('Transept_North'), gTS = group('Transept_South'), gX = group('Crossing'), gApse = group('Apse_Chevet'), gRoof = group('Roofs');
  // The upper elevation is shared by every straight bay; aisles come in full and open-corner versions
  const bayUp = buildNaveBay({ part: 'upper' }), aisleFull = buildNaveBay({ part: 'aisle' }), aisleOpen = buildNaveBay({ part: 'aisle', open: true });
  const vault = buildVaultNave(), pier = buildPier(), but = buildButtress();
  const stories = storyWindows(), cleres = clereWindows();
  SHARED.stories = stories; SHARED.cleres = cleres;
  let counter = 0;
  const statue = (fr, lx, y, lz, kind, faceDeg, scale, parent, indoor = true) => placeFigure('Statue_' + kind + '_' + (counter++), kind, { pos: fr.pos(lx, y, lz), rot: fr.rot(faceDeg), scale, parent, indoor, lod: 0 });
  const garg = (fr, lx, y, lz, k, sc, parent) => place('Gargoyle_' + (counter++), gargoyle(k), MAT.fine, { pos: fr.pos(lx, y, lz), rot: fr.rot(-90), scale: [sc, sc, sc], parent });

  // One side of a straight bay: module, vault-side glass, statues, gargoyles
  const placeBay = (name, fr, parent, o = {}) => {
    placeSet(name + '_Upper', bayUp, [fr.ox, 0, fr.oz], fr.th, parent);
    if (!o.noVault) placeSet(name + '_Aisle', o.open ? aisleOpen : aisleFull, [fr.ox, 0, fr.oz], fr.th, parent);
    const c = cleres[(o.i || 0) % cleres.length];
    placeGlass(name + '_Clerestory', c, fr.pos(0, 0, zn), fr.th + 180, parent);
    if (!o.open) {
      placeGlass(name + '_AisleWindow', stories[(o.i || 0) % stories.length], fr.pos(0, 0, zaw + 0.45), fr.th + 180, parent);
      if ((o.i || 0) % 2 === 0) statue(fr, 0, 0.7, zaw - 0.3, SAINTS[(o.i || 0) % SAINTS.length], 90, 0.86, parent);
      if (!o.inTower) garg(fr, 0, 22.5, zaw + 1.05, (o.i || 0) % 3, 0.72, parent);
    }
    if (!o.noUpperGarg) garg(fr, 0, P.eaves - 0.2, zn + 0.62, ((o.i || 0) + 1) % 3, 0.66, parent);
  };
  const placeButtress = (name, fr, parent, i) => {
    placeSet(name, but, [fr.ox, 0, fr.oz], fr.th, parent);
    statue(fr, 0, 23.5, 17.3, 'angel', -90, 1.9, parent, false);
    garg(fr, 0, 16.8, 18.55, i % 3, 1.0, parent);
  };
  const placePier = (name, lfr, parent, kind) => {
    placeSet(name, pier, [lfr.ox, 0, lfr.oz], lfr.th, parent);
    if (kind) statue(lfr, 0, 5.78, -1.14, kind, 90, 1.15, parent);
  };

  // ---- Two more bays carry the nave between the towers to the inner face of the west wall ----
  for (let t = 0; t < 2; t++) {
    const x = xTowerE + (t + 0.5) * BAY;
    placeBay('TowerBay' + t + '_N', frame(0, x, 0), gNave, { i: t + 2, noUpperGarg: true, inTower: true });
    placeBay('TowerBay' + t + '_S', frame(180, x, 0), gNave, { i: t, noUpperGarg: true, inTower: true });
    placeSet('TowerVault' + t, vault, [x, 0, 0], 0, gNave);
    if (t === 0) { placePier('TowerPier_N', frame(0, x + BAY / 2, zn), gNave, SAINTS[6]); placePier('TowerPier_S', frame(180, x + BAY / 2, -zn), gNave, SAINTS[7]); }
  }
  // ---- Nave ----
  for (let i = 0; i < P.naveBays; i++) {
    const x = xTowerE - (i + 0.5) * BAY, isOpen = i === P.naveBays - 1;
    placeBay('NaveBay' + i + '_N', frame(0, x, 0), gNave, { i, open: isOpen });
    placeBay('NaveBay' + i + '_S', frame(180, x, 0), gNave, { i: i + 2, open: isOpen });
    placeSet('NaveVault' + i, vault, [x, 0, 0], 0, gNave);
  }
  for (let k = 0; k <= P.naveBays - 1; k++) {
    const x = xTowerE - k * BAY;
    placePier('NavePier' + k + '_N', frame(0, x, zn), gNave, k ? SAINTS[k % SAINTS.length] : null);
    placePier('NavePier' + k + '_S', frame(180, x, -zn), gNave, k ? SAINTS[(k + 3) % SAINTS.length] : null);
    if (k >= 1 && k < P.naveBays - 1) { placeButtress('NaveButtress' + k + '_N', frame(0, x, 0), gNave, k); placeButtress('NaveButtress' + k + '_S', frame(180, x, 0), gNave, k + 1); }
  }
  // ---- Choir ----
  for (let j = 0; j < P.choirBays; j++) {
    const x = xChoirW - (j + 0.5) * BAY, isOpen = j === 0;
    placeBay('ChoirBay' + j + '_N', frame(0, x, 0), gChoir, { i: j + 1, open: isOpen });
    placeBay('ChoirBay' + j + '_S', frame(180, x, 0), gChoir, { i: j + 3, open: isOpen });
    placeSet('ChoirVault' + j, vault, [x, 0, 0], 0, gChoir);
  }
  for (let k = 1; k <= P.choirBays; k++) {
    const x = xChoirW - k * BAY;
    placePier('ChoirPier' + k + '_N', frame(0, x, zn), gChoir, SAINTS[(k + 5) % SAINTS.length]);
    placePier('ChoirPier' + k + '_S', frame(180, x, -zn), gChoir, SAINTS[(k + 1) % SAINTS.length]);
    placeButtress('ChoirButtress' + k + '_N', frame(0, x, 0), gChoir, k);
    placeButtress('ChoirButtress' + k + '_S', frame(180, x, 0), gChoir, k + 1);
  }
  // ---- Transept arms: the same bay, turned through 90 degrees ----
  for (const s of [1, -1]) {
    const gT = s > 0 ? gTN : gTS, tag = s > 0 ? 'N' : 'S';
    for (let q = 0; q < P.transeptBays + 1; q++) {
      const zc = s * (zn + (q + 0.5) * BAY), isOpen = q === 0;
      placeBay('Transept' + tag + q + '_W', frame(90 * s, xc, zc), gT, { i: q + 1, open: isOpen, noVault: isOpen });
      placeBay('Transept' + tag + q + '_E', frame(-90 * s, xc, zc), gT, { i: q + 3, open: isOpen, noVault: isOpen });
      placeSet('TranseptVault' + tag + q, vault, [xc, 0, zc], 90, gT);
    }
    for (let q = 1; q <= P.transeptBays; q++) { // the last bay ends in the front wall, which needs no free pier
      const zz = s * (zn + q * BAY);
      placePier('TranseptPier' + tag + q + '_W', frame(90, xc + zn, zz), gT, q <= P.transeptBays ? SAINTS[(q + 2) % SAINTS.length] : null);
      placePier('TranseptPier' + tag + q + '_E', frame(-90, xc - zn, zz), gT, q <= P.transeptBays ? SAINTS[(q + 4) % SAINTS.length] : null);
      if (q === P.transeptBays) { placeButtress('TranseptButtress' + tag + '_W', frame(90 * s, xc, zz), gT, q); placeButtress('TranseptButtress' + tag + '_E', frame(-90 * s, xc, zz), gT, q + 1); }
    }
  }
  // ---- Crossing ----
  const xPier = buildCrossingPier(), aPier = buildAislePier(), xVault = mkBatches();
  const sp = zn - 0.3;
  const crossCrown = addRibVault(xVault.F, xVault.A, [[-sp, -sp], [sp, -sp], [sp, sp], [-sp, sp]], P.vaultSpring, P.vaultCrown + 0.5, { sideRise: () => 12.9, nS: 12, nT: 10 });
  addBoss(xVault.G, xVault.F, crossCrown, 0.95);
  // Great transverse arches and the walls above them
  const arch = pointedArc(2 * (zn - 0.5), 12.9, 7);
  for (let i = 0; i < 4; i++) xVault.F.at(M.of(M.Ry(i * 90), M.T(0, P.vaultSpring, zn - 0.05)), () => xVault.F.sweep(arch, rollSection(0.9, 1.2, 2, 0.09, 3), { caps: false }));
  placeSet('CrossingVault', xVault, [xc, 0, 0], 0, gX);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    placeSet('CrossingPier', xPier, [xc + a * zn, 0, b * zn], 0, gX);
    placeSet('AngleAislePier', aPier, [xc + a * zaw, 0, b * zaw], 0, gX);
  }
  // ---- Chevet ----
  const sector = buildChevetSector(), apsePier = buildApsePier();
  const apseSaints = [{ robe: 'gold', mantle: 'cobalt', crown: 1, veil: 'pale', arm: 'pray' }, { robe: 'white', mantle: 'ruby', beard: 2, attr: 'key', arm: 'point' }, { robe: 'white', mantle: 'emerald', beard: 1, attr: 'book' }, { robe: 'white', mantle: 'rubyLt', beard: 1, cross: 1, arm: 'up' }];
  const hemi = apseSaints.slice(0, 3).map((f, i) => makeLancetGlass(2.05, P.triforiumTop + 0.45, P.vaultSpring + 4.8, 4.3, 70 + i, f, i % 2 ? { ground: 'ruby', ground2: 'cobalt' } : { ground: 'cobalt', ground2: 'ruby' }));
  const chapelGlass = ['annunciation', 'crucifixion'].map((nm, i) => { const g = new Glass(80 + i); g.raw(archOutline(1.3, 3.2, 9.9, 2.5, 7), 'lead', -0.4, 0); gLancetStory(g, 0, 1.3, 3.2, 9.9, 2.5, [nm, ['supper', 'magi'][i], ['magi', 'resurrection'][i]], { cell: 0.6, c1: i ? 'cobalt' : 'ruby', c2: i ? 'ruby' : 'cobalt' }); return g.b; });
  for (let k = 0; k < P.apseSides; k++) {
    const th = -(k + 0.5) * CHEV.d, fr = frame(th, xa, 0), gS = group('ChevetSector' + k, gApse);
    placeSet('Sector' + k, sector, [xa, 0, 0], th, gS);
    placeGlass('HemicycleWindow' + k, hemi[(k + (k > 3 ? 1 : 0)) % hemi.length], fr.pos(0, 0, CHEV.Ra), th + 180, gS);
    const nF = P.chapelFacets, dF = 216 / nF, ap = CHEV.Rc * Math.cos(rad(dF / 2));
    for (let i = 0; i < nF; i++) {
      const fm = -108 + (i + 0.5) * dF, lx = ap * Math.sin(rad(fm)), lz = CHEV.zc + ap * Math.cos(rad(fm));
      placeGlass('ChapelWindow' + k + '_' + i, chapelGlass[(i + k) % chapelGlass.length], fr.pos(lx, 0, lz + 0.0), th + fm + 180, gS);
    }
    statue(fr, 0, 0.5, CHEV.zc + CHEV.Rc * 0.55, k === 3 ? 'virgin' : SAINTS[k], 90, 0.92, gS);
    garg(frame(th - 10, xa, 0), 0, 15.5, CHEV.zc + 1.2, k % 3, 0.7, gS);
    if (k >= 1) {
      const bt = -k * CHEV.d;
      placeButtress('ChevetButtress' + k, frame(bt, xa, 0), gS, k);
      // A slim clustered pier at each angle of the hemicycle: the arches now spring from something
      placeSet('ApsePier' + k, apsePier, frame(bt, xa, 0).pos(0, 0, zn), bt, gS);
    }
  }
  // ---- Roofs, ridge cresting, floor ----
  const Lr = new Batch(TILE.lead);
  const yE = P.eaves + 0.15, half = zn + 0.72;
  addRoofRun(Lr, xa, LAY.xW - 1.2, half, yE, ridge);
  Lr.at(M.T(xc, 0, 0), () => Lr.at(M.Ry(90), () => addRoofRun(Lr, -(zn + (P.transeptBays + 1) * BAY + 0.4), zn + (P.transeptBays + 1) * BAY + 0.4, half, yE, ridge)));
  place('MainRoof_Lead', Lr, MAT.lead, { parent: gRoof });
  const crest = buildCresting(BAY);
  const nCrest = Math.floor((LAY.xW - 2 - xa) / BAY);
  for (let i = 0; i < nCrest; i++) place('RidgeCresting' + i, crest, MAT.gold, { pos: [xa + (i + 0.5) * BAY, ridge, 0], parent: gRoof });
  for (const s of [1, -1]) for (let q = 0; q < P.transeptBays + 2; q++) { const zz = s * (0.5 + (q + 0.5) * BAY + 3); if (Math.abs(zz) < zn + (P.transeptBays + 1) * BAY) place('TranseptCresting' + (s > 0 ? 'N' : 'S') + q, crest, MAT.gold, { pos: [xc, ridge, zz], rot: [0, 90, 0], parent: gRoof }); }
  buildFleche(gRoof, xc, 0);
  const fl = new Batch(TILE.pave);
  const R13 = zaw + 0.1;
  fl.face([[xa, 0, R13], [LAY.xW - WF.wallT + 0.1, 0, R13], [LAY.xW - WF.wallT + 0.1, 0, -R13], [xa, 0, -R13]]);
  const tz = zn + (P.transeptBays + 1) * BAY + 1;
  fl.face([[xc - R13, 0, tz], [xc + R13, 0, tz], [xc + R13, 0, -tz], [xc - R13, 0, -tz]]);
  for (let k = 0; k < P.apseSides; k++) { const th = rad(-(k + 0.5) * CHEV.d), f = frame(-(k + 0.5) * CHEV.d, xa, 0), rr = CHEV.zc + CHEV.Rc + 0.2, hh = rr * Math.tan(CHEV.h); fl.face([f.pos(0, 0, 0), f.pos(-hh, 0, rr), f.pos(hh, 0, rr)]); }
  place('Paving', fl, MAT.pave, { parent: ROOT });
  // ---- Stained light on the floor from the south aisle ----
  const xs = []; for (let i = 0; i < P.naveBays - 1; i++) xs.push(xTowerE - (i + 0.5) * BAY);
  place('StainedLight_Floor', buildLightPools(xs), MAT.pool, { parent: gNave });
}

// ==================================================================================
// THE GREAT ROSE: real stone tracery, and glass depicting Christ among apostles and angels
// ==================================================================================
const ROSE = { r0: 1.15, rs1: 2.35, r1: 3.05, rs2: 4.05, r2: 4.72, n1: 12, n2: 24 };
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
function addRoseTracery(F, R) {
  const k = R / 5.5, heavy = traceryBar(0.3 * k, 0.5), mid = hexBar(0.2 * k, 0.42), thin = hexBar(0.14 * k, 0.34);
  const dia = [[0.07 * k, 0], [0, 0.17], [-0.07 * k, 0], [0, -0.17]]; // lightest bar, for the little roundels
  const { r0, rs1, r1, rs2, r2, n1, n2 } = ROSE;
  F.sweep(ringPts(0, 0, R, 36), heavy, { closed: true });
  F.sweep(ringPts(0, 0, r0 * k, 14), mid, { closed: true });
  F.sweep(ringPts(0, 0, r2 * k, 36), mid, { closed: true });
  F.sweep(ringPts(0, 0, r1 * k, 24), mid, { closed: true });
  // Inner wheel: colonnette spokes, each light closed by a pointed trefoil head
  const head = (n, rs, re, a, bar) => {
    const da = PI / n * 0.98, pts = [], N = 6;
    for (let i = 0; i <= N; i++) { const t = -1 + 2 * i / N, h = Math.pow(1 - Math.pow(Math.abs(t), 1.5), 0.72); pts.push(pol((rs + (re - rs) * h) * k, a + t * da)); }
    F.sweep(pts, bar, { caps: false });
    return pts;
  };
  for (let i = 0; i < n1; i++) {
    const a = i * TAU / n1, am = a + PI / n1;
    F.sweep([pol(r0 * k, a), pol(rs1 * k, a)], mid, { caps: false });
    head(n1, rs1, r1 * 0.985, am, thin);
    // the cusp hanging inside the head
    const c = pol((rs1 + 0.34) * k, am); F.sweep(ringPts(c[0], c[1], 0.26 * k, 6), dia, { closed: true, s: 0.95, crease: 80 });
  }
  // Outer wheel of twenty-four lights
  for (let i = 0; i < n2; i++) {
    const a = i * TAU / n2, am = a + PI / n2;
    F.sweep([pol(r1 * k, a), pol(rs2 * k, a)], thin, { caps: false });
    head(n2, rs2, r2 * 0.99, am, thin);
    // Quatrefoil roundels in the outer band
    const c = pol((R / k + r2) / 2 * k, a);
    F.sweep(ringPts(c[0], c[1], 0.3 * k, 6), dia, { closed: true, crease: 80 });
  }
}
const SHARED = {};
// Rose tracery is one mesh, scaled for the smaller transept roses; bright outside, dim inside
function roseTracery() {
  if (!SHARED.rose) { const b = new Batch(TILE.fine); addRoseTracery(b, WF.roseR); SHARED.rose = b; }
  return SHARED.rose;
}
function largePinnacle() {
  if (!SHARED.pin) { const b = new Batch(TILE.fine); addPinnacle(b, 2, 10, { lod: 1 }); SHARED.pin = b; }
  return SHARED.pin;
}
function makeRoseGlass(R, seed, o = {}) {
  const g = new Glass(seed), k = R / 5.5, { r0, rs1, r1, rs2, r2, n1, n2 } = ROSE, inner = o.inner || ['ruby', 'cobalt'], outer = o.outer || ['cobalt', 'ruby', 'emerald'];
  g.raw(ringPts(0, 0, R + 0.08, 48), 'lead', -0.4, 0);
  // A light is never one flat sheet: lay the painted mosaic across it, clipped to its shape
  const ground = (pts, col, layer) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } g.withClip(pts, () => gDiaper(g, x0, y0, x1, y1, 0, col, null, null, layer)); };
  // The band of roundels: jewels in a ring, deep colours set off by small sparks of gold
  for (let i = 0; i < n2; i++) {
    const a = i * TAU / n2, b = (i + 1) * TAU / n2;
    ground([pol(r2 * k, a), pol(R, a), pol(R, b), pol(r2 * k, b)], i % 2 ? 'ruby' : 'cobalt', 0);
    const c = pol((R / k + r2) / 2 * k, a); g.disc(c[0], c[1], 0.27 * k, i % 2 ? 'emerald' : 'ruby', 0.6, 10, { came: 0.016 }); g.disc(c[0], c[1], 0.12 * k, 'gold', 1, 8, { came: 0.01 });
  }
  // Outer lights: angels and elders turning about the centre
  for (let i = 0; i < n2; i++) {
    const am = (i + 0.5) * TAU / n2, da = PI / n2 * 0.97, col = outer[i % outer.length];
    const wedge = [pol(r1 * k, am - da), pol(r2 * k, am - da * 0.9), pol(r2 * k, am + da * 0.9), pol(r1 * k, am + da)];
    ground(wedge, col, 0);
    g.withClip(wedge, () => g.withXf(am * 180 / PI - 90, ((r1 + 0.15) * k) * Math.cos(am), ((r1 + 0.15) * k) * Math.sin(am), k, () => {
      const f = i % 3;
      if (f === 0) gFigure(g, 0, 0, 1.28, { wings: 'gold', robe: 'white', mantle: 'rubyLt', arm: 'orant', hair: 'amber' });
      else if (f === 1) gBust(g, 0, 0.1, 1.2, { robe: 'emerald', beard: 1, crown: 1, halo: 'gold' });
      else gFigure(g, 0, 0, 1.26, { robe: 'gold', mantle: 'violet', beard: 2, hair: 'grey', beardCol: 'pearl', arm: 'hold', attr: 'book' });
    }));
  }
  // Inner lights: the twelve apostles enthroned
  const scheme = o.figs || [{ robe: 'white', mantle: 'ruby', beard: 1, attr: 'key', arm: 'point' }, { robe: 'emerald', mantle: 'white', beard: 2, attr: 'book' }, { robe: 'gold', mantle: 'cobalt', beard: 1, attr: 'sword', arm: 'point' }, { robe: 'white', mantle: 'violet', attr: 'book' }];
  for (let i = 0; i < n1; i++) {
    const am = (i + 0.5) * TAU / n1, da = PI / n1 * 0.97, col = inner[i % inner.length];
    const wedge = [pol(r0 * k, am - da), pol(r1 * k, am - da * 0.92), pol(r1 * k, am + da * 0.92), pol(r0 * k, am + da)];
    ground(wedge, col, 0);
    g.withClip(wedge, () => {
      // each apostle in his own roundel: a thin jewelled rim round a deep field
      const mid = pol((r0 + r1) / 2 * k, am);
      gRim(g, mid[0], mid[1], 0.78 * k, 0.86 * k, ['gold', 'ruby', 'gold', 'cobalt'], 14, 0.8);
      g.disc(mid[0], mid[1], 0.78 * k, i % 2 ? 'cobalt' : 'ruby', 1, 14, { came: 0 });
      g.withXf(am * 180 / PI - 90, (r0 + 0.2) * k * Math.cos(am), (r0 + 0.2) * k * Math.sin(am), k, () => gFigure(g, 0, 0, 1.56, Object.assign({ pose: 'sit' }, scheme[i % scheme.length])));
    });
  }
  // The centre: Christ in Majesty in a gilded mandorla, the four-square cross behind
  g.disc(0, 0, r0 * k + 0.06, 'lead', 2.6, 16, { came: 0, jitter: 0 });
  ground(ringPts(0, 0, r0 * k, 16), o.centre || 'cobalt', 3);
  g.withClip(ringPts(0, 0, r0 * k, 14), () => g.withXf(0, 0, -0.98 * k, k, () => {
    const m = []; for (let i = 0; i < 16; i++) { const t = i * TAU / 16; m.push([0.62 * Math.cos(t) * Math.pow(Math.abs(Math.sin(t)) * 0.3 + 0.7, 1), 1 + 0.96 * Math.sin(t)]); }
    g.poly(m, 'gold', 3.3, { came: 0.02 });
    g.poly(m.map((p) => [p[0] * 0.8, 1 + (p[1] - 1) * 0.88]), 'rubyLt', 3.5, { came: 0.012 });
    gFigure(g, 0, 0.22, 1.62, o.majesty || { pose: 'sit', robe: 'white', mantle: 'ruby', cross: 1, beard: 1, arm: 'up', attr: null, layer: 4 });
  }));
  return g.b;
}

// ==================================================================================
// WEST FRONT. Local frame: x across the facade, y up, +z out towards the viewer, z=0 the wall.
// ==================================================================================
const WF = { halfW: 21.5, topY: 47, roseY: 31.8, roseR: 5.5, kingY: 20.2, kingTop: 25.3, galY: 40.6, galTop: 46.2, wallT: 0.8, portalC: { x: 0, w0: 4.3, orders: P.jambStatues, dx: 0.58, dz: 0.62, ys: 7.5 }, portalS: { x: 13.5, w0: 3.7, orders: P.jambStatues - 1, dx: 0.6, dz: 0.66, ys: 7.2 } };
// Aged oak door leaf with forged straps, studs and a ring. Hung at x=0, spans to x=w, h high, front +z.
function addDoorLeaf(set, x0, w, h, flip) {
  const { O, I } = set, planks = 6, pw = w / planks, d = flip ? -1 : 1;
  for (let i = 0; i < planks; i++) {
    const a = x0 + d * i * pw, c = x0 + d * (i + 0.97) * pw, xa = Math.min(a, c), xc = Math.max(a, c), tone = 0.46 + 0.16 * Math.abs(Math.sin(i * 2.4 + x0 * 3));
    O.at(M.Ry(0), () => O.box(xa, xc, 0.02, h, -0.05, 0.05, { s: tone }));
  }
  // Oak grain runs up each plank: remap planes with u across and v up is the default box projection
  const strapY = [0.72, h * 0.36, h * 0.64, h - 0.7];
  for (const y of strapY) {
    const reach = w * 0.94, xEnd = x0 + d * reach;
    I.shade(0.34, () => {
      I.box(Math.min(x0, xEnd), Math.max(x0, xEnd), y - 0.075, y + 0.075, 0.05, 0.085, {});
      // scrolled fleur at the strap end
      for (const s of [-1, 1]) I.tube(spline([[xEnd, y, 0.07], [xEnd + d * 0.12, y + s * 0.12, 0.07], [xEnd + d * 0.05, y + s * 0.24, 0.07], [xEnd - d * 0.07, y + s * 0.17, 0.07]], 2), (t) => lerp(0.03, 0.012, t), 4, {});
      for (let k = 0; k < 4; k++) { const sx = x0 + d * (k + 0.5) * reach / 4; I.box(sx - 0.03, sx + 0.03, y - 0.03, y + 0.03, 0.08, 0.115, { taper: 0.012 }); }
    });
  }
  // Ring handle
  I.shade(0.4, () => I.at(M.of(M.T(x0 + d * (w - 0.3), h * 0.42, 0.11), M.Ry(0)), () => {
    const rg = []; for (let i = 0; i <= 12; i++) { const t = i * TAU / 12; rg.push([0.1 * Math.cos(t), 0.1 * Math.sin(t) - 0.1, 0]); }
    I.tube(rg, 0.018, 5, { capEnd: false }); I.box(-0.05, 0.05, -0.05, 0.05, -0.05, 0, {});
  }));
}
function buildPortal(cfg, kinds, tymp) {
  const set = mkBatches(), { A, F, G, O, I } = set, { w0, orders: N, dx, dz, ys } = cfg;
  // Every order is concentric: the same two arc centres with the radius growing by one step
  const r0 = w0 * 0.86, c0 = (r0 * r0 - w0 * w0 / 4) / w0, wT = (i) => w0 + 2 * i * dx, zT = (i) => i * dz;
  const riseI = (i) => Math.sqrt(Math.pow(c0 + w0 / 2 + i * dx, 2) - c0 * c0);
  const riseOf = (w) => riseI((w - w0) / (2 * dx));
  const figs = [], zF = N * dz, outerW = wT(N), apex = ys + riseOf(outerW), lintelH = 1.2, doorH = ys - lintelH;
  const statueY = 1.5, statueK = 1.22, canopyY = statueY + 2.15 * statueK + 0.54; // the tallest head clears its canopy
  // ---- Solid stepped jambs, each order with a dado of carved blind arches ----
  for (let i = 0; i < N; i++) {
    for (const s of [-1, 1]) {
      const xa = s * wT(i) / 2, xb = s * wT(i + 1) / 2, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), zf = zT(i + 1);
      A.box(x0, x1, 0, ys, -0.1, zf, { noBot: true });
      // The dado: a plinth, a blind trefoil head on two colonnettes, a moulded table for the statues above
      F.box(x0 - 0.01, x1 + 0.01, 0, 0.26, zf, zf + 0.05, {});
      F.at(M.T((x0 + x1) / 2, 0, zf), () => {
        const w = x1 - x0 - 0.12, y0 = 0.26, ya = 0.86, r = 0.32;
        F.sweep(pointedArc(w, r, 4).map((p) => [p[0], p[1] + ya]), hexBar(0.05, 0.09), { caps: false, z: 0.03 });
        for (const t of [-1, 1]) F.box(t * w / 2 - 0.03, t * w / 2 + 0.03, y0, ya, 0, 0.06, {});
        F.sweep([[-(x1 - x0) / 2, 1.3], [(x1 - x0) / 2, 1.3]], stringSection(0.16, 0.1), { caps: false });
      });
      // Colonnette on the arris, with a foliate capital; the saint stands against it
      const cx = s * (wT(i) / 2 + 0.02), cz = zT(i) + 0.32;
      F.at(M.T(cx, 0, cz), () => {
        F.lathe([[0.2, 1.3], [0.2, 1.42], [0.11, 1.54], [0.11, ys - 0.5], [0.14, ys - 0.46], [0.11, ys - 0.42], [0.26, ys - 0.04], [0.3, ys]], 8);
        for (let l = 0; l < 4; l++) addLeaf(F, M.of(M.T(0, ys - 0.42, 0), M.Ry(l * 90 + 45), M.T(0.1, 0, 0)), 0.38, { coarse: 1 });
      });
      // Carved base under the feet, canopy with room above the head
      const sx = s * (wT(i) / 2 - 0.13), sz = zT(i) + 0.56;
      F.at(M.T(sx, 0, sz), () => {
        F.lathe([[0.3, 1.25], [0.34, 1.32], [0.24, 1.38], [0.3, 1.44], [0.33, statueY]], 8);
        for (let l = 0; l < 2; l++) addLeaf(F, M.of(M.T(0, 1.36, 0), M.Ry(l * 90 + (s > 0 ? -60 : 150)), M.T(0.24, 0, 0)), 0.2, { coarse: 1 });
        F.at(M.T(0, canopyY + 0.28, 0), () => {
          // A canopy like a tiny carved building: vaulted soffit, a drum of gablets, thin spirelet
          F.lathe([[0.05, -0.14], [0.27, -0.06], [0.33, 0], [0.33, 0.1], [0.28, 0.14], [0.17, 0.17], [0.17, 0.5], [0.22, 0.54], [0.15, 0.58], [0.07, 0.64], [0.01, 1.02]], 6, { phase: PI / 6, faceted: true });
          const face = s > 0 ? -60 : 60;
          for (const l of [-1, 0, 1]) F.at(M.of(M.Ry(face + l * 60), M.T(0, 0, 0.27)), () => {
            F.face([[-0.16, 0.11, 0.02], [0.16, 0.11, 0.02], [0, 0.42, 0.02]]);
            crocketsAlong(F, [-0.16, 0.13, 0.02], [0, 0.4, 0.02], 1, 0.1, [-1, 0.6, 0], 0);
            crocketsAlong(F, [0.16, 0.13, 0.02], [0, 0.4, 0.02], 1, 0.1, [1, 0.6, 0], 0);
            F.shade(0.5, () => F.face([[-0.08, 0.14, 0.03], [0.08, 0.14, 0.03], [0, 0.28, 0.03]]));
          });
        });
      });
      const dirX = -s * dz, dirZ = dx * 1.5, l = Math.hypot(dirX, dirZ), th = Math.atan2(-dirZ / l, dirX / l) * 180 / PI;
      figs.push({ kind: kinds[(i + (s > 0 ? 0 : kinds.length >> 1)) % kinds.length], pos: [cfg.x + sx, statueY, sz], rot: [0, th, 0], scale: statueK, mirror: s < 0 });
    }
  }
  // ---- Archivolts: each order a hollow, each hollow a procession of small figures, every one on a console under a canopy ----
  const ARCH_KINDS = ['apostle', 'king', 'angel', 'bishop', 'queen'], ak = 0.62;
  for (let i = 0; i < N; i++) {
    const w = wT(i), r = riseI(i), arc = pointedArc(w, r, 8).map((p) => [p[0], p[1] + ys]);
    F.sweep(arc, [[0, -0.1], [dx, -0.1], [dx, dz], [0, 0]], { z: zT(i), caps: false, crease: 30 });
    F.at(M.T(0, 0, zT(i + 1) - 0.02), () => F.sweep(pointedArc(wT(i + 1), riseI(i + 1), 8).map((p) => [p[0], p[1] + ys]), hexBar(0.2, 0.22), { caps: false }));
    const pts = pointedArc(w + dx, riseI(i + 0.5), 16).map((p) => [p[0], p[1] + ys]);
    let len = 0; const seg = []; for (let k = 0; k < pts.length - 1; k++) { const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); seg.push(l); len += l; }
    const n = Math.max(4, Math.round(len / 1.52));
    for (let q = 0; q < n; q++) {
      const d = (q + 0.5) / n * len; let acc = 0, k = 0; while (k < seg.length - 1 && acc + seg[k] < d) { acc += seg[k]; k++; }
      const f = (d - acc) / seg[k], px = lerp(pts[k][0], pts[k + 1][0], f), py = lerp(pts[k][1], pts[k + 1][1], f);
      const tx0 = (pts[k + 1][0] - pts[k][0]) / seg[k], ty0 = (pts[k + 1][1] - pts[k][1]) / seg[k], rx = -ty0, ry = tx0;
      const up = d > len / 2 ? -1 : 1, Y = [tx0 * up, ty0 * up, 0];
      // sits on the splay, looking out towards the opening and the viewer
      const nl = Math.hypot(dz, dx), X = [-rx * dz / nl, -ry * dz / nl, dx / nl];
      const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
      const pos = [px + X[0] * 0.17 - Y[0] * 0.62, py + X[1] * 0.17 - Y[1] * 0.62, zT(i) + dz * 0.5 + X[2] * 0.17];
      figs.push({ kind: ARCH_KINDS[(i + q) % ARCH_KINDS.length], lod: 0, pos: [cfg.x + pos[0], pos[1], pos[2]], basis: { X, Y, Z }, scale: ak });
      F.at(frameOf(pos, X, Y), () => {
        F.lathe([[0.03, -0.24], [0.2, -0.02], [0.22, 0.02]], 5);
        F.lathe([[0.02, 1.25], [0.2, 1.33], [0.2, 1.4], [0.02, 1.62]], 5, { faceted: true });
      });
    }
  }
  // ---- Outer hood with gable and crockets ----
  const hood = pointedArc(outerW + 0.1, riseOf(outerW) + 0.1, 9).map((p) => [p[0], p[1] + ys]);
  F.at(M.T(0, 0, zF), () => F.sweep(hood, rollSection(0.34, 0.44, 2, 0.05, 2), { caps: false }));
  // The gable springs from the arch springing: plain coursed stone, its carving is real and stands proud of it
  const gw = outerW + 1.5, gy = ys, gTop = WF.kingY - 0.7, gH = gTop - gy;
  const archCut = pointedArc(outerW + 0.1, riseOf(outerW) + 0.1, 9).map((p) => [p[0], p[1] + ys]);
  const field = [[-gw / 2, gy], [-(outerW + 0.1) / 2, gy], ...archCut.slice(1, -1), [(outerW + 0.1) / 2, gy], [gw / 2, gy], [0, gTop]];
  A.at(M.T(0, 0, zF - 0.1), () => A.slab(field, [], -0.1, 0, { noOuterSides: true, noBack: true }));
  A.at(M.T(0, 0, zF - 0.2), () => A.slab(field, [], -zF + 0.3, 0, { noOuterSides: false, noFront: true, noBack: true, so: 0.7 }));
  F.at(M.T(0, 0, zF - 0.14), () => {
    addGable(F, gw, gH, 0, 0.24, gy, { size: 0.72, finial: 0.1, crockets: 6, noField: true, lod: 1 });
    const yc = apex + (gTop - apex) * 0.36, rc = Math.min(0.92, (gTop - yc) * 0.42);
    F.sweep(ringPts(0, yc, rc, 16), traceryBar(0.18, 0.24), { closed: true, z: 0.04 });
    const foil = []; for (let i = 0; i < 15; i++) { const a = PI / 2 + i * TAU / 15, R = rc * (0.56 + 0.34 * Math.pow(Math.abs(Math.cos(a * 1.5 - PI * 0.75)), 0.8)); foil.push([R * Math.cos(a), yc + R * Math.sin(a)]); }
    F.sweep(foil, hexBar(0.09, 0.18), { closed: true, z: 0.04, crease: 40 });
  });
  G.at(M.T(0, gTop + 0.1, zF - 0.02), () => addFinial(G, 1.5, 1));
  // ---- Tympanum: plain stone behind a carved scene ----
  const tw = w0 + 0.04, tr = riseOf(w0), k = w0 / 4.3, floorZ = 0.42;
  F.at(M.T(0, 0, 0.0), () => F.slab(archOutline(tw, ys - 0.05, ys, tr, 9), [], -0.1, 0, { noOuterSides: true, noBack: true }));
  // A shelf for the scene to stand on, thrown forward so the people have depth to overlap in
  F.box(-tw / 2 - 0.02, tw / 2 + 0.02, ys - 0.02, ys + 0.1, -0.08, floorZ + 0.04, {});
  F.at(M.T(0, 0, floorZ + 0.04), () => F.sweep([[-tw / 2 - 0.02, ys + 0.03], [tw / 2 + 0.02, ys + 0.03]], stringSection(0.14, 0.1), { caps: false }));
  // Lintel: a recessed frieze, deep enough to hold its people, cornice and sill standing forward of it
  F.box(-tw / 2 - 0.02, tw / 2 + 0.02, doorH, ys - 0.02, -0.08, -0.02, {});
  F.box(-tw / 2 - 0.02, tw / 2 + 0.02, doorH, doorH + 0.12, -0.08, 0.42, {});
  F.at(M.T(0, 0, 0.42), () => F.sweep([[-tw / 2 - 0.02, doorH + 0.06], [tw / 2 + 0.02, doorH + 0.06]], stringSection(0.12, 0.06), { caps: false }));
  const nL = Math.round(w0 / 0.37), frieze = ['apostle', 'queen', 'apostle', 'king', 'bishop', 'apostle'];
  for (let i = 0; i < nL; i++) {
    // two ranks, every other figure a step forward: they overlap and each one turns to the middle of the door
    const x = -w0 / 2 + (i + 0.5) * w0 / nL, side = x < 0 ? 1 : -1, deep = i % 2;
    figs.push({ kind: frieze[i % frieze.length], lod: 0, pos: [cfg.x + x, doorH + 0.12, deep ? 0.1 : 0.27], rot: [0, -90 + side * (16 + 10 * (i % 3)), 0], scale: 0.43 });
  }
  // The central figure enthroned in a gilded vesica
  const mY = ys + 0.1, mH = tr * 0.84, mW = tw * 0.17, mand = [], nM = 8;
  // A true vesica: two arcs meeting in a point above and below
  for (let i = 0; i < nM; i++) { const v = i / nM; mand.push([mW * (1 - Math.pow(2 * v - 1, 2)), mY + mH * v]); }
  for (let i = 0; i < nM; i++) { const v = 1 - i / nM; mand.push([-mW * (1 - Math.pow(2 * v - 1, 2)), mY + mH * v]); }
  G.at(M.T(0, 0, 0.14), () => G.sweep(mand, hexBar(0.05, 0.06), { closed: true, crease: 50 }));
  figs.push({ kind: tymp.main, half: 1, pos: [cfg.x, mY, 0.1], rot: [0, -90, 0], scale: 1.08 * k });
  // Worshippers on their knees and angels crowding behind them, every head turned to the throne
  for (const s of [-1, 1]) {
    figs.push({ kind: 'kneel', half: 1, pos: [cfg.x + s * 1.02 * k, mY, 0.24], rot: [0, -90 + s * 55, 0], scale: 0.86 * k, mirror: s < 0 });
    figs.push({ kind: tymp.side[0], half: 1, pos: [cfg.x + s * 1.46 * k, mY, 0.03], rot: [0, -90 + s * 38, 0], scale: 0.74 * k, mirror: s < 0 });
    figs.push({ kind: tymp.side[1], half: 1, lod: 0, pos: [cfg.x + s * 1.86 * k, mY, 0.2], rot: [0, -90 + s * 60, 0], scale: 0.46 * k, mirror: s < 0 });
    // and two flying in from the point of the arch, arms towards the head of the throne
    const fy = mY + mH * 0.6, ca = Math.cos(rad(58)), sa = Math.sin(rad(58));
    figs.push({ kind: 'angel', half: 1, lod: 0, pos: [cfg.x + s * 1.0 * k, fy, 0.12], basis: { X: [0, 0, 1], Y: [-s * sa, ca, 0], Z: [-ca, -s * sa, 0] }, scale: 0.42 * k });
  }
  // Trumeau with its statue, on a carved base, under a canopy
  A.box(-0.32, 0.32, 0, doorH, -0.1, 0.34, { noBot: true });
  const tK = tymp.trumeauScale || 1.3, tBase = 1.06, tCanopy = tBase + 2.15 * tK + 0.46;
  F.at(M.T(0, 0, 0.5), () => {
    F.lathe([[0.42, 0], [0.42, 0.42], [0.3, 0.56], [0.25, 0.78], [0.34, 0.92], [0.36, tBase]], 8, { faceted: true, phase: PI / 8 });
    for (let l = 0; l < 6; l++) addLeaf(F, M.of(M.T(0, 0.82, 0), M.Ry(l * 60 + 15), M.T(0.27, 0, 0)), 0.24, { coarse: 1 });
    F.at(M.T(0, tCanopy + 0.2, 0), () => F.lathe([[0.06, -0.2], [0.33, -0.08], [0.42, 0], [0.42, 0.14], [0.35, 0.18], [0.22, 0.22], [0.22, 0.58], [0.28, 0.62], [0.2, 0.66], [0.09, 0.72], [0.02, 1.1]], 6, { phase: PI / 6, faceted: true }));
  });
  figs.push({ kind: tymp.trumeau, pos: [cfg.x, tBase, 0.5], rot: [0, -90, 0], scale: tK });
  // Doors: two leaves either side of the trumeau, recessed in the wall
  const leaf = w0 / 2 - 0.34;
  O.at(M.T(0, 0, -0.14), () => { const set2 = set; I.at(M.T(0, 0, -0.14), () => { addDoorLeaf(set2, w0 / 2 - 0.02, leaf, doorH - 0.04, true); addDoorLeaf(set2, -w0 / 2 + 0.02, leaf, doorH - 0.04, false); }); });
  return { set, figs, apex, zF, outerW };
}
function placePortal(gWest, name, cfg, pr, opt = {}) {
  placeSet(name, pr.set, [cfg.x, 0, 0], 0, gWest);
  const gF = group(name + '_Figures', gWest); // the people of one door, as one group of nodes
  pr.figs.forEach((f, i) => {
    const rot = f.rot || eulerFromBasis(f.basis.X, f.basis.Y, f.basis.Z);
    const pos = [f.pos[0] + (cfg.x - pr.baseX), f.pos[1], f.pos[2]];
    // Full sculpture where people stand next to it; opt.light keeps a door's overhead scene, or the whole door, to the lighter copies
    const far = opt.light === 'all' || (opt.light === 'scene' && f.pos[1] > 4);
    placeFigure(name + '_Fig' + i, f.kind, { pos, rot, scale: f.scale, parent: gF, lod: far ? 0 : f.lod, mirror: f.mirror, half: f.half });
  });
}
function eulerFromBasis(X, Y, Z) { // degrees, three.js 'XYZ' order
  const m13 = clamp(Z[0], -1, 1), y = Math.asin(m13);
  let x, z;
  if (Math.abs(m13) < 0.9999) { x = Math.atan2(-Z[1], Z[2]); z = Math.atan2(-Y[0], X[0]); } else { x = Math.atan2(Y[2], Y[1]); z = 0; }
  return [x * 180 / PI, y * 180 / PI, z * 180 / PI];
}
// One niche of the Gallery of Kings, shared along the facade
function buildKingNiche(pitch) {
  const set = mkBatches(), { F, A } = set, h = WF.kingTop - WF.kingY, y0 = WF.kingY;
  A.face([[-pitch / 2, y0, 0.02], [pitch / 2, y0, 0.02], [pitch / 2, y0 + h, 0.02], [-pitch / 2, y0 + h, 0.02]]);
  F.box(-pitch / 2, pitch / 2, y0 - 0.5, y0, 0, 1.3, { s: 0.9 });
  F.at(M.T(0, 0, 1.3), () => F.sweep([[-pitch / 2, y0 - 0.38], [pitch / 2, y0 - 0.38]], stringSection(0.3, 0.26), { caps: false }));
  // Colonnettes and a cusped arch with a gablet over each king
  const ys = y0 + 3.15, rise = 1.3;
  for (const s of [-1, 1]) F.at(M.T(s * pitch / 2, 0, 0.95), () => F.lathe([[0.17, y0], [0.09, y0 + 0.16], [0.09, ys - 0.2], [0.2, ys]], 8));
  F.at(M.T(0, 0, 0.95), () => {
    const arc = pointedArc(pitch - 0.1, rise, 6).map((p) => [p[0], p[1] + ys]);
    F.sweep(arc, rollSection(0.14, 0.36, 1, 0.03, 2), { caps: false });
    // solid spandrel
    A.at(M.T(0, 0, 0.95), () => A.slab([[-pitch / 2, ys], [-(pitch - 0.1) / 2, ys], ...arc, [(pitch - 0.1) / 2, ys], [pitch / 2, ys], [pitch / 2, y0 + h], [-pitch / 2, y0 + h]], [], -0.1, 0.1, { noOuterSides: true }));
    addGable(F, pitch * 0.96, 1.12, 0.1, 0.1, ys + 0.46, { size: 0.26, crockets: 2, finial: 0.34, solid: true, lod: 0 });
  });
  // The roof of the gallery behind the arcade
  F.box(-pitch / 2, pitch / 2, y0 + h - 0.02, y0 + h + 0.12, 0, 1.28, { s: 0.85 });
  return set;
}
// One bay of the open arcade above the rose and the tower windows
function buildGalleryBay(pitch) {
  const set = mkBatches(), { F, A } = set, y0 = WF.galY, y1 = WF.galTop, ys = y0 + 3.3;
  F.shade(0.4, () => F.face([[-pitch / 2, y0, 0.03], [pitch / 2, y0, 0.03], [pitch / 2, y1, 0.03], [-pitch / 2, y1, 0.03]]));
  const arc = pointedArc(pitch * 0.92, 1.5, 5).map((p) => [p[0], p[1] + ys]);
  F.at(M.T(0, 0, 0.5), () => {
    F.sweep(arc, traceryBar(0.16, 0.36), { caps: false });
    for (const s of [-1, 1]) F.at(M.T(s * pitch / 2, 0, 0), () => F.lathe([[0.2, y0], [0.1, y0 + 0.2], [0.1, ys - 0.22], [0.22, ys]], 8));
    F.sweep(ringPts(0, ys + 0.6, 0.26, 7), hexBar(0.07, 0.14), { closed: true });
  });
  A.at(M.T(0, 0, 0.5), () => A.slab([[-pitch / 2, ys], [-pitch * 0.46, ys], ...arc, [pitch * 0.46, ys], [pitch / 2, ys], [pitch / 2, y1], [-pitch / 2, y1]], [], -0.18, 0.18, { noOuterSides: true }));
  F.box(-pitch / 2, pitch / 2, y0 - 0.2, y0 + 0.02, 0, 0.72, { s: 0.92 });
  F.at(M.T(0, 0, 0.72), () => { F.sweep([[-pitch / 2, y0 - 0.1], [pitch / 2, y0 - 0.1]], stringSection(0.26, 0.22), { caps: false }); F.sweep([[-pitch / 2, y1], [pitch / 2, y1]], stringSection(0.3, 0.3), { caps: false }); });
  F.at(M.T(0, 0, 0.72), () => addParapet(F, -pitch / 2, pitch / 2, y1 + 0.12, 1.05, 0.2, { pitch: 1.1, nh: 8 }));
  return set;
}
// One face of a belfry stage, shared by all eight faces of the two towers
function buildBelfryFace() {
  const set = mkBatches(), { A, F, L } = set, hw = 7, zf = 7, y0 = WF.topY, yT = P.towerTop - 2.6;
  const lw = 3.05, lx = 3.3, sill = y0 + 4.2, ys = y0 + 13.6, rise = 4.1, holes = [];
  for (const s of [-1, 1]) holes.push(archOutline(lw, sill, ys, rise, 7).map((p) => [s * lx + p[0], p[1]]));
  A.at(M.T(0, 0, zf), () => A.slab([[-hw, y0], [hw, y0], [hw, yT], [-hw, yT]], holes, -0.9, 0, { noOuterSides: true, noBack: true, sr: 0.66 }));
  // The bell chamber: a floor behind the openings, and a bell hanging on each side of the frame
  F.box(-hw + 0.8, hw - 0.8, sill - 0.5, sill - 0.2, zf - 5, zf - 0.8, {});
  set.I.at(M.T(0, sill + 3.2, zf - 2.5), () => set.I.lathe([[0.06, 1.72], [0.36, 1.62], [0.5, 1.12], [0.56, 0.7], [0.84, 0.12], [0.92, 0]], 10));
  // Behind the bells the oak frame that carries them closes the view, so no sky shows through the tower
  set.O.face([[-4.2, sill - 0.3, zf - 4], [4.2, sill - 0.3, zf - 4], [4.2, yT, zf - 4], [-4.2, yT, zf - 4]]);
  for (const s of [-1, 1]) {
    F.at(M.T(s * lx, 0, zf - 0.45), () => {
      F.sweep(pointedArc(lw, rise, 6).map((p) => [p[0], p[1] + ys]), rollSection(0.2, 0.7, 1, 0.04, 2), { caps: false });
      F.sweep([[0, sill - 0.05], [0, ys + 0.1]], traceryBar(0.2, 0.42), {});
      const lw2 = (lw - 0.1) / 2;
      for (const t of [-1, 1]) F.sweep(pointedArc(lw2, lw2 * 0.9, 4).map((p) => [t * lw2 / 2 + p[0], ys + 0.1 + p[1]]), hexBar(0.14, 0.34), { caps: false });
      F.sweep(ringPts(0, ys + rise * 0.62, 0.48, 10), hexBar(0.14, 0.34), { closed: true });
    });
    // Louvres: lead-clad boards set across the opening and tilted to throw the rain outward, dark air between them
    L.at(M.T(s * lx, 0, zf - 0.45), () => {
      const slope = 0.42;
      for (let y = sill + 0.2; y < ys + rise * 0.3; y += 0.5) {
        const h = y <= ys ? lw / 2 : (lw / 2) * Math.sqrt(Math.max(0, 1 - Math.pow((y - ys) / rise, 2)));
        L.face([[-h, y, 0.3], [h, y, 0.3], [h, y + slope, -0.3], [-h, y + slope, -0.3]]);
        L.face([[h, y - 0.05, 0.3], [-h, y - 0.05, 0.3], [-h, y + slope - 0.05, -0.3], [h, y + slope - 0.05, -0.3]]);
      }
    });
    F.at(M.T(s * lx, 0, zf), () => {
      F.sweep(pointedArc(lw + 0.5, rise + 0.3, 6).map((p) => [p[0], p[1] + ys]), hexBar(0.24, 0.28), { caps: false });
      addGable(F, lw + 0.9, 3.1, 0.03, 0.18, ys + rise * 0.5, { size: 0.42, finial: 0.8, crockets: 3, lod: 0 });
    });
  }
  F.at(M.T(0, 0, zf), () => {
    F.sweep([[-hw, y0 + 0.2], [hw, y0 + 0.2]], stringSection(0.42, 0.36), { caps: false });
    F.sweep([[-hw, sill - 0.3], [hw, sill - 0.3]], stringSection(0.32, 0.28), { caps: false });
    F.sweep([[-hw, yT - 0.2], [hw, yT - 0.2]], stringSection(0.4, 0.44), { caps: false });
    for (let i = 0; i < 12; i++) { const x = -hw + (i + 0.5) * 2 * hw / 12; F.box(x - 0.14, x + 0.14, yT - 0.78, yT - 0.42, 0, 0.3, { s: 0.85, sb: 0.5 }); }
  });
  F.at(M.T(0, 0, zf - 0.2), () => addParapet(F, -hw, hw, yT, 1.2, 0.28, { pitch: 1.4, nh: 8 }));
  return set;
}
// Octagonal corner turret and its great pinnacle, reaching the full height of the tower
function buildTowerCorner() {
  const set = mkBatches(), { A, F } = set, y0 = WF.topY, yT = P.towerTop - 1.3, R = 1.72;
  A.lathe([[R, y0 - 1], [R, yT]], 8, { faceted: true, phase: PI / 8 });
  for (let i = 0; i < 8; i++) {
    const a = i * 45 + 22.5, ap = R * Math.cos(rad(22.5)), side = 2 * R * Math.sin(rad(22.5));
    F.at(M.of(M.Ry(a), M.T(0, 0, ap)), () => {
      if (i % 2 === 0) for (const k of [0, 1]) {
        const yb = y0 + 1 + k * 11;
        F.sweep(pointedArc(side * 0.72, 0.9, 4).map((p) => [p[0], p[1] + yb + 8.2]), hexBar(0.1, 0.12), { caps: false });
        for (const s of [-1, 1]) F.sweep([[s * side * 0.36, yb], [s * side * 0.36, yb + 8.2]], hexBar(0.1, 0.12), { caps: false });
        F.shade(0.55, () => F.face([[-side * 0.36, yb, 0.01], [side * 0.36, yb, 0.01], [side * 0.36, yb + 8.2, 0.01], [0, yb + 9.05, 0.01], [-side * 0.36, yb + 8.2, 0.01]]));
      }
    });
  }
  F.lathe([[R, y0 + 12.3], [R + 0.28, y0 + 12.5], [R + 0.28, y0 + 12.66], [R, y0 + 12.82]], 8, { faceted: true, phase: PI / 8 });
  F.lathe([[R, yT - 0.2], [R + 0.36, yT], [R + 0.36, yT + 0.26], [R, yT + 0.42]], 8, { faceted: true, phase: PI / 8 });
  return set;
}
function buildWestFront() {
  const gWest = group('West_Front');
  gWest.position.set(LAY.xW, 0, 0); gWest.rotation.y = rad(90);
  const set = mkBatches(), { A, F, L, G, D } = set, hw = WF.halfW, yTop = WF.topY, tcx = 14.5;
  // Real recessed lights flanking the tower windows, cut through the face of the wall
  const towerRecess = [];
  for (const s of [-1, 1]) for (const d of [-1, 1]) towerRecess.push(archOutline(1.5, WIN.cSill + 0.6, WIN.cSp - 0.6, 1.8, 6).map((p) => [s * tcx + d * 3.55 + p[0], p[1]]));
  // ---- The great wall with real openings: doors and rose ----
  const cP = WF.portalC, sP = WF.portalS;
  const doorHole = (x, w, h) => [[x - w / 2, 0.02], [x + w / 2, 0.02], [x + w / 2, h], [x - w / 2, h]];
  const wallOutline = [[-hw, 0], [-sP.x - sP.w0 / 2, 0], [-sP.x - sP.w0 / 2, sP.ys - 0.9], [-sP.x + sP.w0 / 2, sP.ys - 0.9], [-sP.x + sP.w0 / 2, 0], [-cP.w0 / 2, 0], [-cP.w0 / 2, cP.ys - 0.9], [cP.w0 / 2, cP.ys - 0.9], [cP.w0 / 2, 0], [sP.x - sP.w0 / 2, 0], [sP.x - sP.w0 / 2, sP.ys - 0.9], [sP.x + sP.w0 / 2, sP.ys - 0.9], [sP.x + sP.w0 / 2, 0], [hw, 0], [hw, yTop], [-hw, yTop]];
  A.slab(wallOutline, [ringPts(0, WF.roseY, WF.roseR, 40), ...towerRecess], -WF.wallT, 0, { noOuterSides: true, sr: 0.62 });
  towerRecess.forEach((o) => addRecess(A, F, o, 0.5));
  // Seven centuries of rain under every ledge of the front, damp rising from the ground
  addStain(D, -6.6, 6.6, WF.roseY - 6.9, 0.02, 3.2);
  addStain(D, -hw, hw, WF.kingY - 0.56, 0.02, 3.6);
  addStain(D, -hw, hw, WF.galY - 0.42, 0.02, 3.4);
  addStain(D, -hw, hw, WF.kingTop + 0.02, 0.02, 2.6, 'drip');
  // damp on the wall only: the door openings are left clear
  for (const span of [[-hw, -sP.x - sP.w0 / 2], [-sP.x + sP.w0 / 2, -cP.w0 / 2], [cP.w0 / 2, sP.x - sP.w0 / 2], [sP.x + sP.w0 / 2, hw]]) addStain(D, span[0], span[1], 5.2, 0.03, 5.2, 'ground');
  // Each ledge throws a soft shadow on the wall just below it; soot gathers where the rain cannot reach
  addStain(D, -6.6, 6.6, WF.roseY - 6.9, 0.03, 0.8, 'soft');
  addStain(D, -hw, hw, WF.kingY - 0.56, 0.03, 1.2, 'soft');
  addStain(D, -hw, hw, WF.galY - 0.42, 0.03, 1.0, 'soft');
  addStain(D, -hw, hw, WF.kingY - 0.62, 0.04, 2.4, 'soot');
  for (const s of [-1, 1]) addStain(D, s * tcx - WIN.cW / 2 - 0.4, s * tcx + WIN.cW / 2 + 0.4, WIN.cSill - 0.12, 0.02, 3.4);
  // ---- Rose: moulded ring, tracery, spandrels, relieving arch ----
  place('Great_Rose_Tracery', roseTracery(), MAT.fine, { pos: [0, WF.roseY, -0.4], parent: gWest });
  F.at(M.T(0, WF.roseY, 0), () => {
    F.at(M.T(0, 0, 0), () => {
      const ring = traceryBar(0.46, 0.58);
      F.sweep(ringPts(0, 0, WF.roseR + 0.32, 40), ring, { closed: true, z: 0.14 });
      F.sweep(ringPts(0, 0, WF.roseR + 0.78, 44), rollSection(0.2, 0.3, 1, 0.04, 2), { closed: true, z: 0.1 });
      const ndt = 32; for (let i = 0; i < ndt; i++) { const a = i * 360 / ndt; addCrocket(F, M.of(M.Rz(a), M.T(WF.roseR + 0.98, 0, 0.22)), 0.42, 0); }
    });
  });
  F.at(M.T(0, 0, 0.03), () => {
    // spandrels round the rose: plain stone, each with a real pierced roundel carved in its corner
    const R2 = WF.roseR + 0.72, ry = WF.roseY, sq = 6.6;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      // corner of the square -> along its edge -> round the rose -> along the other edge
      const arcPts = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI / 2; arcPts.push([sx * R2 * Math.cos(a), sy * R2 * Math.sin(a)]); }
      const poly = [[sx * sq, sy * sq], [sx * sq, 0], ...arcPts, [0, sy * sq]].map((p) => [p[0], p[1] + ry]);
      F.slab(area2(poly) > 0 ? poly : poly.slice().reverse(), [], -0.04, 0, { noOuterSides: true, noBack: true });
      const cx = sx * (sq - 1.02), cy = ry + sy * (sq - 1.02);
      F.sweep(ringPts(cx, cy, 0.76, 14), traceryBar(0.13, 0.2), { closed: true, z: 0.05 });
      const foil = []; for (let i = 0; i < 16; i++) { const a = i * TAU / 16, R = 0.68 * (0.62 + 0.32 * Math.abs(Math.cos(a * 2))); foil.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
      F.sweep(foil, hexBar(0.07, 0.14), { closed: true, z: 0.05, crease: 40 });
    }
  });
  F.at(M.T(0, 0, 0.14), () => { F.sweep([[-6.6, WF.roseY - 6.6], [6.6, WF.roseY - 6.6]], stringSection(0.3, 0.26), { caps: false }); F.sweep([[-6.6, WF.roseY + 6.6], [6.6, WF.roseY + 6.6]], stringSection(0.3, 0.26), { caps: false }); });
  // ---- Tower lower stages: paired windows with hood and gable, string courses ----
  const cw = WIN.cW, cSill = WIN.cSill, cSp = WIN.cSp, cRise = WIN.cRise;
  for (const s of [-1, 1]) {
    F.at(M.T(s * tcx, 0, 0.32), () => {
      addTracery(F, cw, cSill, cSp, cRise, { bar: 0.26, depth: 0.32 });
      F.sweep(archOutline(cw, cSill, cSp, cRise, 8), rollSection(0.24, 0.5, 1, 0.04, 2), { closed: true, crease: 40, z: -0.14 });
      F.sweep(pointedArc(cw + 0.8, cRise + 0.4, 7).map((p) => [p[0], p[1] + cSp]), hexBar(0.26, 0.3), { z: 0.1, caps: false });
      addGable(F, cw + 1.4, 3.3, -0.16, 0.2, cSp + cRise * 0.5, { size: 0.46, finial: 0.8, crockets: 4, lod: 0 });
    });
    F.at(M.T(s * tcx, 0, 0.02), () => { F.sweep([[-6.1, WF.kingTop + 0.24], [6.1, WF.kingTop + 0.24]], stringSection(0.3, 0.22), { caps: false }); });
  }
  // ---- Buttresses: stepped, with statues in tabernacles and pinnacled set-offs ----
  const xB = [-20.6, -7.5, 7.5, 20.6], xLow = [-20.3, -6.5, 6.5, 20.3];
  xLow.forEach((x, i) => {
    const hwb = 1.3;
    A.box(x - hwb, x + hwb, 0, 18.4, -0.02, 3.6, { noBot: true });
    A.face([[x - hwb, 18.4, 3.6], [x + hwb, 18.4, 3.6], [x + hwb, 19.95, 1.0], [x - hwb, 19.95, 1.0]]);
    F.at(M.T(x, 0, 3.6), () => {
      F.sweep([[-hwb - 0.1, 0.75], [hwb + 0.1, 0.75]], stringSection(0.5, 0.36), {});
      F.sweep([[-hwb - 0.04, 5.4], [hwb + 0.04, 5.4]], stringSection(0.26, 0.2), {});
      F.sweep([[-hwb - 0.04, 11.3], [hwb + 0.04, 11.3]], stringSection(0.26, 0.2), {});
      // statue niche in the lower stage
      addNicheFrame(F, 0, 6.1, 11.0, 1.42);
      addBlindArcade(F, -hwb + 0.1, hwb - 0.1, 1.2, 3.6, 2, { bar: 0.1, depth: 0.12 });
    });
    F.at(M.T(x, 0, 3.6), () => addBlindArcade(F, -hwb + 0.1, hwb - 0.1, 11.7, 16.4, 2, { bar: 0.12, depth: 0.14 }));
    D.at(M.T(x, 0, 3.6), () => { addStain(D, -hwb, hwb, 18.3, 0.02, 4.8); addStain(D, -hwb, hwb, 11.1, 0.02, 2.2, 'drip'); addStain(D, -hwb, hwb, 5.2, 0.02, 2.4, 'drip'); addStain(D, -hwb, hwb, 4.6, 0.03, 4.6, 'ground'); addStain(D, -hwb, hwb, 5.25, 0.03, 0.7, 'soft'); addStain(D, -hwb, hwb, 11.15, 0.03, 0.7, 'soft'); addStain(D, -hwb, hwb, 2.6, 0.04, 2.1, 'lichen'); });
    placeFigure('Buttress_Saint' + i, SAINTS[i + 3], { pos: [x, 6.2, 3.98], rot: [0, -90, 0], scale: 1.42, parent: gWest });
    place('Facade_Gargoyle' + i, gargoyle(i % 3), MAT.fine, { pos: [x, 17.0, 3.5], rot: [0, -90, 0], scale: [0.95, 0.95, 0.95], parent: gWest });
  });
  xB.forEach((x, i) => {
    const hwb = 0.92, z = 1.5;
    A.box(x - hwb, x + hwb, WF.kingTop + 0.05, yTop, -0.02, z, { noBot: true });
    F.at(M.T(x, 0, z), () => {
      F.sweep([[-hwb - 0.05, 30.0], [hwb + 0.05, 30.0]], stringSection(0.24, 0.2), {});
      addNicheFrame(F, 0, 31, 37.4, 1.3);
      F.sweep([[-hwb - 0.05, 38.6], [hwb + 0.05, 38.6]], stringSection(0.24, 0.2), {});
    });
    placeFigure('Upper_Saint' + i, SAINTS[i + 5], { pos: [x, 31.1, 1.86], rot: [0, -90, 0], scale: 1.32, parent: gWest, lod: 0 });
  });
  placeSet('West_Wall', set, [0, 0, 0], 0, gWest);
  // ---- Glass ----
  const roseWest = makeRoseGlass(WF.roseR, 101);
  SHARED.roseGlass = roseWest;
  placeGlass('Great_Rose', roseWest, [0, WF.roseY, -0.4], 180, gWest, true);
  const twinGlass = SHARED.cleres;
  for (const s of [-1, 1]) place('TowerWindow_Out' + s, glassOutside(twinGlass[s > 0 ? 0 : 1]), MAT.glassOut, { pos: [s * tcx, 0, 0.14], rot: [0, 180, 0], parent: gWest, scale: [1, 1, -1] });
  // ---- Three portals: a bishop, a crowned king, a veiled queen, an apostle with his key, a smiling angel;
  // the Virgin and Child on the central door post, Christ enthroned above her ----
  const pC = buildPortal(cP, ['apostle', 'bishop', 'queen', 'king', 'apostle', 'king', 'angel', 'bishop', 'queen', 'apostle'], { main: 'seated', side: ['angel', 'queen'], trumeau: 'virgin', trumeauScale: 1.4 });
  const pS = buildPortal(Object.assign({}, sP, { x: 0 }), ['queen', 'bishop', 'apostle', 'king', 'angel', 'apostle', 'king', 'queen'], { main: 'seatedVirgin', side: ['angel', 'apostle'], trumeau: 'bishop', trumeauScale: 1.24 });
  pC.baseX = cP.x; pS.baseX = 0; SHARED.sidePortal = pS;
  placePortal(gWest, 'Portal_Central', cP, pC);
  placePortal(gWest, 'Portal_South', Object.assign({}, sP, { x: -sP.x }), pS, { light: 'scene' });
  placePortal(gWest, 'Portal_North', Object.assign({}, sP, { x: sP.x }), pS, { light: 'scene' });
  // ---- Gallery of Kings ----
  const nK = P.kings, pitch = 2 * hw / nK, niche = buildKingNiche(pitch), kinds = ['kingA', 'kingB'];
  for (let i = 0; i < nK; i++) {
    const x = (i + 0.5 - nK / 2) * pitch;
    placeSet('King_Niche' + i, niche, [x, 0, 0], 0, gWest);
    placeFigure('King' + i, kinds[i % 2], { pos: [x, WF.kingY + 0.04, 0.5], rot: [0, -90 + (i % 4 - 1.5) * 7, 0], scale: 1.42, parent: gWest, lod: 0, mirror: i % 2 === 1 });
  }
  // ---- High gallery ----
  const nG = 20, gp = 2 * hw / nG, gb = buildGalleryBay(gp);
  for (let i = 0; i < nG; i++) placeSet('Gallery' + i, gb, [(i + 0.5 - nG / 2) * gp, 0, 0], 0, gWest);
  // ---- Central gable rising over the gallery, closing the nave roof ----
  const front = mkBatches(), yG0 = yTop + 1.2, yR = LAY.ridge + 1.2, gW = 2 * (zn + 1.5);
  front.A.at(M.T(0, 0, -1.2), () => front.A.slab([[-gW / 2, yG0 - 2], [gW / 2, yG0 - 2], [gW / 2, yG0], [0, yR + 1.6], [-gW / 2, yG0]], [ringPts(0, yG0 + 1.8, 1.25, 12)], -0.5, 0.5, { sr: 0.5 }));
  front.F.at(M.T(0, 0, -0.7), () => {
    addGable(front.F, gW + 0.2, yR + 1.6 - yG0, 0.04, 0.26, yG0, { size: 0.86, finial: 0.1, crockets: 7, noField: true, lod: 1 });
    front.F.sweep(ringPts(0, yG0 + 1.8, 1.32, 14), traceryBar(0.26, 0.44), { closed: true });
    // Blind arcade stepping up under the rake
    const nA = 7; for (let i = 0; i < nA; i++) { const x = (i - (nA - 1) / 2) * 1.72, top = yG0 + 0.3 + (gW / 2 - Math.abs(x) - 1) * (yR + 1.6 - yG0) / (gW / 2) * 0.7; if (Math.abs(x) < 1.7) continue; front.F.sweep([[x - 0.62, yG0], [x - 0.62, top], [x, top + 0.75], [x + 0.62, top], [x + 0.62, yG0]], hexBar(0.14, 0.16), { caps: false, crease: 20 }); }
  });
  // Pinnacles crowning the upper buttresses either side of the gable
  for (const x of [-20.6, -7.5, 7.5, 20.6]) place('Facade_Pinnacle', largePinnacle(), MAT.fine, { pos: [x, yTop, 0.75], scale: [0.72, 0.74, 0.72], parent: gWest });
  front.G.at(M.T(0, yR + 1.62, -0.5), () => addFinial(front.G, 2.2, 1));
  placeSet('West_Gable', front, [0, 0, 0], 0, gWest);
  place('West_Gable_Glass', makeLancetRoundel(1.25), MAT.glassOut, { pos: [0, yG0 + 1.8, -0.75], parent: gWest });
  // ---- Towers: shell, belfry faces, corner turrets, lead cap ----
  // One tower shell (side and rear walls of the lower stages), built outward towards +x; the other tower mirrors it
  const shell = mkBatches(), tw = 7;
  // The outer side of the tower: real recessed arcades in two tiers, either side of its windows
  const sideM = M.of(M.T(0, 0, -tw), M.Ry(90), M.T(0, 0, tw)), sideRecess = [];
  for (const d of [-1, 1]) {
    sideRecess.push(archOutline(2.0, 3.4, 15.6, 2.4, 6).map((p) => [d * 4.45 + p[0], p[1]]));
    sideRecess.push(archOutline(2.0, 26.4, 36.6, 2.4, 6).map((p) => [d * 4.45 + p[0], p[1]]));
  }
  shell.A.at(sideM, () => shell.A.slab([[-tw, 0], [tw, 0], [tw, yTop], [-tw, yTop]], sideRecess, -0.8, 0, { noOuterSides: true, noBack: true, sr: 0.62 }));
  shell.A.at(sideM, () => shell.F.at(sideM, () => sideRecess.forEach((o) => addRecess(shell.A, shell.F, o, 0.52))));
  shell.D.at(sideM, () => { for (const y of [19.2, WF.kingTop - 0.34, WF.galY - 0.34]) { addStain(shell.D, -tw, tw, y, 0.02, 3.2); addStain(shell.D, -tw, tw, y, 0.03, 0.8, 'soft'); } addStain(shell.D, -tw, tw, 5.2, 0.03, 5.2, 'ground'); });
  shell.A.at(M.of(M.T(0, 0, -tw), M.Ry(180), M.T(0, 0, tw)), () => shell.A.slab([[-tw, 0], [tw, 0], [tw, yTop], [-tw, yTop]], [], -0.8, 0, { noOuterSides: true, noBack: true }));
  shell.A.at(M.of(M.T(0, 0, -tw), M.Ry(-90), M.T(0, 0, tw)), () => shell.A.slab([[-tw, 0], [tw, 0], [tw, yTop], [-tw, yTop]], [], -0.8, 0, { noOuterSides: true, noBack: true }));
  // string courses and tall blind windows on the outer side
  shell.F.at(M.of(M.T(0, 0, -tw), M.Ry(90), M.T(0, 0, tw)), () => {
    for (const y of [1.0, 19.6, WF.kingTop, WF.galY]) shell.F.sweep([[-tw, y], [tw, y]], stringSection(0.3, 0.26), { caps: false });
    addTracery(shell.F, cw, cSill, cSp, cRise, { bar: 0.26, depth: 0.32 });
    shell.F.sweep(archOutline(cw, cSill, cSp, cRise, 8), hexBar(0.24, 0.5), { closed: true, crease: 40, z: -0.14 });
    addGable(shell.F, cw + 1.4, 3.3, -0.16, 0.2, cSp + cRise * 0.5, { size: 0.46, finial: 0.8, crockets: 3, lod: 0 });
    addTracery(shell.F, ...windowArgs.aisle, { bar: 0.25, depth: 0.3 });
    shell.F.sweep(archOutline(...windowArgs.aisle, 8), hexBar(0.24, 0.5), { closed: true, crease: 40, z: -0.14 });
  });
  shell.A.box(tw - 0.9, tw + 0.9, 0, yTop, -tw - 0.9, -tw + 0.9, {}); // outer angle buttress up the tower side
  for (const s of [-1, 1]) {
    const cx = s * tcx;
    placeSet('Tower_Shell', shell, [cx, 0, 0], 0, gWest, { scale: [s, 1, 1] });
    // Set just proud of the wall face: these towers are solid here, so the glass is seen from outside only
    place('Tower_SideGlass_High' + s, glassOutside(twinGlass[2]), MAT.glassOut, { pos: [cx + s * (tw + 0.02), 0, -tw], rot: [0, s * 90 + 180, 0], parent: gWest, scale: [1, 1, -1] });
    place('Tower_SideGlass_Low' + s, glassOutside(SHARED.stories[1]), MAT.glassOut, { pos: [cx + s * (tw + 0.02), 0, -tw], rot: [0, s * 90 + 180, 0], parent: gWest, scale: [1, 1, -1] });
  }
  const face = buildBelfryFace(), corner = buildTowerCorner();
  const cap = new Batch(TILE.lead), capG = new Batch(TILE.gold);
  cap.lathe([[5.9, P.towerTop - 2.5], [0.2, P.towerTop + 4.8]], 8, { faceted: true, phase: PI / 8 });
  capG.at(M.T(0, P.towerTop + 4.7, 0), () => addFinial(capG, 2.4, 1));
  for (const s of [-1, 1]) {
    const gT = group('Tower_' + (s > 0 ? 'North' : 'South'), gWest), cx = s * tcx, cz = -tw;
    for (let i = 0; i < 4; i++) {
      placeSet('Belfry_Face' + i, face, [cx, 0, cz], i * 90, gT);
      const ax = cx + (i === 0 || i === 3 ? 1 : -1) * tw, az = cz + (i < 2 ? 1 : -1) * tw;
      placeSet('Tower_Turret' + i, corner, [ax, 0, az], i * 90, gT);
      // the great corner pinnacles carry the tower to its full height
      const yT = P.towerTop - 1.3 + 0.4, hP = P.spireTip - yT;
      place('Tower_Pinnacle' + i, largePinnacle(), MAT.fine, { pos: [ax, yT, az], scale: [1.16, hP / 10, 1.16], parent: gT });
    }
    place('Tower_Cap_Lead', cap, MAT.lead, { pos: [cx, 0, cz], parent: gT });
    place('Tower_Cap_Gilt', capG, MAT.gold, { pos: [cx, 0, cz], parent: gT });
  }
  // ---- The parvis: a low paved forecourt that seats the front on the ground ----
  const parvis = new Batch(TILE.pave);
  parvis.face([[-hw - 2, 0.015, 5.2], [hw + 2, 0.015, 5.2], [hw + 2, 0.015, -0.1], [-hw - 2, 0.015, -0.1]]);
  place('Parvis_Paving', parvis, MAT.pave, { parent: gWest });
  // ---- Inner face: blind niches with statues, a gallery, the back of the doors ----
  const inner = mkBatches();
  inner.F.at(M.of(M.T(0, 0, -WF.wallT), M.Ry(180)), () => {
    inner.F.sweep([[-13.1, 10.2], [13.1, 10.2]], stringSection(0.34, 0.34), { caps: false });
    inner.F.sweep([[-6.5, P.triforiumSill], [6.5, P.triforiumSill]], stringSection(0.34, 0.3), { caps: false });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) addNicheFrame(inner.F, s * (3.65 + i * 1.5), 3.2 + 0, 8.8, 1.2);
    inner.F.sweep(ringPts(0, WF.roseY, WF.roseR + 0.3, 32), traceryBar(0.42, 0.5), { closed: true });
    addBlindArcade(inner.F, -6.5, 6.5, 11, 15.2, 8, { bar: 0.14, depth: 0.2 });
  });
  placeSet('West_InnerFace', inner, [0, 0, 0], 0, gWest);
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) placeFigure('Inner_Saint_' + (s > 0 ? 'N' : 'S') + i, SAINTS[i + (s > 0 ? 1 : 6)], { pos: [s * (3.65 + i * 1.5), 3.25, -WF.wallT - 0.28], rot: [0, 90, 0], scale: 1.32, parent: gWest, indoor: true });
}
function makeLancetRoundel(r) { const g = new Glass(55); g.raw(ringPts(0, 0, r + 0.05, 20), 'lead', -0.4, 0); gOculus(g, 0, 0, r, { ground: 'cobalt', inner: 'gold' }); return g.b; }

// ---- Transept fronts: one portal, a smaller rose, lancets, gable, corner turrets ----------
function buildTransFront(gT, s) {
  const fr = frame(s > 0 ? 0 : 180, LAY.xc, 0), hw = zaw + 1.1, zEnd = zn + (P.transeptBays + 1) * BAY, yTop = P.eaves;
  const set = TRANS.set || (TRANS.set = (() => {
    const q = mkBatches();
    const { A, F, G } = q, rY = 28.6, R = 4.5, w0 = WF.portalS.w0, dh = WF.portalS.ys - 0.9;
    const at = M.T(0, 0, zEnd);
    A.at(M.of(at, M.T(0, 0, 0.9)), () => A.slab([[-hw, 0], [-w0 / 2, 0], [-w0 / 2, dh], [w0 / 2, dh], [w0 / 2, 0], [hw, 0], [hw, yTop], [-hw, yTop]], [ringPts(0, rY, R, 32)], -0.9, 0, { noOuterSides: true, sr: 0.62 }));
    F.at(M.of(at, M.T(0, rY, 0.9)), () => { F.sweep(ringPts(0, 0, R + 0.3, 32), traceryBar(0.4, 0.5), { closed: true }); F.sweep(ringPts(0, 0, R + 0.72, 36), rollSection(0.18, 0.26, 1, 0.03, 2), { closed: true }); });
    q.D.at(M.of(at, M.T(0, 0, 0.9)), () => { addStain(q.D, -hw, hw, 17.2, 0.02, 3.2); addStain(q.D, -hw, hw, 22.6, 0.02, 2.8, 'drip'); addStain(q.D, -hw, -w0 / 2, 5.2, 0.03, 5.2, 'ground'); addStain(q.D, w0 / 2, hw, 5.2, 0.03, 5.2, 'ground'); });
    // Row of lancets beneath the rose
    F.at(M.of(at, M.T(0, 0, 0.9)), () => {
      F.sweep([[-hw, 0.8], [hw, 0.8]], stringSection(0.42, 0.36), { caps: false });
      F.sweep([[-hw, 17.4], [hw, 17.4]], stringSection(0.34, 0.3), { caps: false });
      F.sweep([[-hw, 22.8], [hw, 22.8]], stringSection(0.3, 0.26), { caps: false });
      addBlindArcade(F, -8, 8, 18, 20.8, 8, { bar: 0.16, depth: 0.2 });
      for (const x of [-9.6, 9.6]) F.at(M.T(x, 0, 0.1), () => { addTracery(F, ...windowArgs.aisle, { bar: 0.25, depth: 0.3 }); F.sweep(archOutline(...windowArgs.aisle, 7), hexBar(0.22, 0.42), { closed: true, crease: 40, z: -0.1 }); });
    });
    // The inner face of the end wall: tiers of blind arcading and string courses
    F.at(M.of(at, M.Ry(180)), () => {
      F.sweep([[-zaw, 11], [zaw, 11]], stringSection(0.3, 0.26), { caps: false });
      F.sweep([[-zaw, 16.8], [zaw, 16.8]], stringSection(0.3, 0.26), { caps: false });
      addBlindArcade(F, -5.6, 5.6, 1.2, 7.8, 5, { bar: 0.16, depth: 0.2 });
      addBlindArcade(F, -zn, zn, 11.2, 14.8, 8, { bar: 0.12, depth: 0.16 });
      addBlindArcade(F, -zn, zn, 17, 20.6, 8, { bar: 0.12, depth: 0.16 });
    });
    // Gable closing the arm's roof, in front of the lead
    const yG = yTop, gW = 2 * (zn + 1.6), yR = LAY.ridge + 1;
    A.at(M.of(at, M.T(0, 0, 0.9)), () => A.slab([[-gW / 2, yG], [gW / 2, yG], [0, yR]], [ringPts(0, yG + 3.4, 1.5, 12)], -0.9, 0, { noOuterSides: true, sr: 0.5 }));
    F.at(M.of(at, M.T(0, 0, 0.9)), () => { addGable(F, gW + 0.2, yR - yG, 0.02, 0.24, yG, { size: 0.82, finial: 0.1, crockets: 7, noField: true, lod: 1 }); F.sweep(ringPts(0, yG + 3.4, 1.55, 14), traceryBar(0.24, 0.42), { closed: true }); });
    G.at(M.of(at, M.T(0, yR, 1.12)), () => addFinial(G, 2.0, 1));
    F.at(M.of(at, M.T(0, 0, 1.0)), () => addParapet(F, -hw, hw, yTop - 0.1, 1.1, 0.24, { pitch: 1.3, nh: 8 }));
    // Corner buttresses rising to pinnacles
    for (const sx of [-1, 1]) {
      A.box(sx * hw - 1.15, sx * hw + 1.15, 0, yTop + 1, zEnd - 1, zEnd + 2.3, { noBot: true });
      F.at(M.T(sx * hw, 0, zEnd + 2.3), () => { F.sweep([[-1.25, 0.8], [1.25, 0.8]], stringSection(0.5, 0.36), {}); addNicheFrame(F, 0, 16, 22, 1.5); });
    }
    return q;
  })());
  placeSet('Transept_Front', set, [fr.ox, 0, fr.oz], fr.th, gT);
  // Portal (the same carving as the west side portals), statue niches, glass
  const gPortal = group('Transept_Portal', gT);
  gPortal.position.set(...fr.pos(0, 0, zEnd + 0.9)); gPortal.rotation.y = rad(fr.th);
  placePortal(gPortal, 'Portal_Transept', { x: 0 }, SHARED.sidePortal, { light: 'all' });
  place('Transept_Rose_Tracery', roseTracery(), MAT.fine, { pos: fr.pos(0, 28.6, zEnd + 0.45), rot: fr.rot(0), scale: [4.5 / WF.roseR, 4.5 / WF.roseR, 1], parent: gT });
  for (const sx of [-1, 1]) place('Transept_Pinnacle', largePinnacle(), MAT.fine, { pos: fr.pos(sx * hw, yTop + 1, zEnd + 0.9), scale: [1.05, 1.1, 1.05], parent: gT });
  placeGlass('Transept_Rose', SHARED.roseGlass, fr.pos(0, 28.6, zEnd + 0.45), fr.th + 180, gT, false, 4.5 / WF.roseR);
  const low = SHARED.stories[0];
  for (const sx of [-1, 1]) {
    // Aisle-end windows: the same panes on the inner and outer faces of the end wall
    place('Transept_EndWindow_In', low, MAT.glassIn, { pos: fr.pos(sx * 9.6, 0, zEnd - 0.01), rot: fr.rot(180), parent: gT });
    place('Transept_EndWindow_Out', low, MAT.glassOut, { pos: fr.pos(sx * 9.6, 0, zEnd + 0.92), rot: fr.rot(180), scale: [1, 1, -1], parent: gT });
    placeFigure('Transept_Corner_Saint' + sx, SAINTS[sx > 0 ? 2 : 4], { pos: fr.pos(sx * hw, 16.05, zEnd + 2.62), rot: fr.rot(-90), scale: 1.42, parent: gT, lod: 0 });
  }
}
const TRANS = {};

// ---- The east end: raised sanctuary, high altar with a gilded retable, oak choir stalls ------
function buildSanctuary() {
  const g = group('Sanctuary'), set = mkBatches(), { F, G, O } = set, { xa, xChoirW } = LAY;
  // Three broad steps and the altar, all moulded
  for (let i = 0; i < 3; i++) { const r = 5 - i * 0.7; F.at(M.T(xa + 1, 0, 0), () => F.lathe([[r, i * 0.2], [r, (i + 1) * 0.2], [0.01, (i + 1) * 0.2]], 14, { faceted: true, phase: PI / 14 })); }
  const y0 = 0.6, ax = xa + 1;
  F.at(M.T(ax, y0, 0), () => {
    F.box(-0.8, 0.8, 0, 1.0, -1.7, 1.7, {});
    F.box(-0.92, 0.92, 1.0, 1.12, -1.84, 1.84, { sb: 0.5 });
    for (const s of [-1, 1]) for (const t of [-1, 0, 1]) F.at(M.T(s * 0.82, 0, t * 1.1), () => F.lathe([[0.12, 0], [0.07, 0.12], [0.07, 0.88], [0.13, 1.0]], 6));
  });
  // A carved retable behind the altar: five stone niches under gables, each with its figure, only the arches gilded
  const retM = M.of(M.T(ax - 1.0, y0 + 1.12, 0), M.Ry(90));
  F.at(retM, () => {
    F.box(-2.46, 2.46, -0.26, 0, -0.2, 0.14, {});
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.96, h = i === 0 ? 2.2 : 1.56;
      F.box(x - 0.47, x + 0.47, 0, h - 0.3, -0.2, -0.1, {});
      addGable(F, 0.96, i === 0 ? 0.8 : 0.66, 0.04, 0.06, h - 0.32, { size: 0.15, crockets: 2, finial: 0.24, solid: true, lod: 0 });
      F.at(M.T(x - 0.48, 0, 0), () => F.lathe([[0.075, 0], [0.05, 0.08], [0.05, h - 0.42], [0.08, h - 0.32]], 6));
      if (i === 2) F.at(M.T(x + 0.48, 0, 0), () => F.lathe([[0.075, 0], [0.05, 0.08], [0.05, h - 0.42], [0.08, h - 0.32]], 6));
      F.at(M.T(x - 0.48, h - 0.32, 0), () => addPinnacle(F, 0.13, 0.78, { simple: 1 }));
      if (i === 2) F.at(M.T(x + 0.48, h - 0.32, 0), () => addPinnacle(F, 0.13, 0.78, { simple: 1 }));
    }
  });
  G.at(retM, () => { for (let i = -2; i <= 2; i++) { const x = i * 0.96, h = i === 0 ? 2.2 : 1.56; G.sweep(pointedArc(0.82, 0.52, 4).map((p) => [x + p[0], h - 0.84 + p[1]]), hexBar(0.04, 0.05), { z: 0.03, caps: false }); } });
  const altarSaints = [['apostle', 0.56], ['bishop', 0.56], ['seatedVirgin', 0.74], ['king', 0.56], ['queen', 0.56]];
  altarSaints.forEach((q, n) => placeFigure('Retable_Figure' + n, q[0], { pos: [ax - 1.04, y0 + 1.14, -(n - 2) * 0.96], rot: [0, 0, 0], scale: q[1], parent: g, indoor: true, lod: q[0] === 'seatedVirgin' ? 1 : 0 }));
  // Candlesticks
  for (const t of [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5]) G.at(M.T(ax - 0.2, y0 + 1.12, t), () => { G.lathe([[0.1, 0], [0.04, 0.06], [0.025, 0.42], [0.06, 0.46], [0.03, 0.5]], 6); F.at(M.T(ax - 0.2, y0 + 1.62, t), () => F.lathe([[0.022, 0], [0.022, 0.34], [0.002, 0.36]], 5, { s: 1.6 })); });
  // Choir stalls: stepped oak benches, moulded backs and a carved canopy rail
  const x0 = xa + 5.5, x1 = xChoirW - 1.2;
  for (const s of [-1, 1]) {
    const z0 = s * 5.0;
    O.box(x0, x1, 0, 0.32, z0 - 0.9, z0 + 0.9, { s: 0.42 });
    O.box(x0, x1, 0.32, 0.5, z0 + (s > 0 ? 0.0 : -0.9), z0 + (s > 0 ? 0.9 : 0), { s: 0.46 });
    O.box(x0, x1, 0, 2.7, z0 + (s > 0 ? 0.8 : -0.9), z0 + (s > 0 ? 0.9 : -0.8), { s: 0.4 });
    const n = Math.floor((x1 - x0) / 1.5);
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * (x1 - x0) / n;
      O.box(x - 0.045, x + 0.045, 0, 0.98, z0 + (s > 0 ? 0 : -0.9), z0 + (s > 0 ? 0.9 : 0), { s: 0.5 });
      O.box(x - 0.03, x + 0.03, 0.98, 2.72, z0 + (s > 0 ? 0.74 : -0.8), z0 + (s > 0 ? 0.8 : -0.74), { s: 0.48 });
      O.box(x - 0.08, x + 0.08, 2.72, 3.28, z0 + (s > 0 ? 0.56 : -0.86), z0 + (s > 0 ? 0.86 : -0.56), { s: 0.46, taper: 0.05 });
    }
    O.box(x0, x1, 2.7, 2.84, z0 + (s > 0 ? 0.3 : -0.9), z0 + (s > 0 ? 0.9 : -0.3), { s: 0.44 });
  }
  placeSet('Sanctuary', set, [0, 0, 0], 0, g);
}

function buildCathedral() {
  buildBody();
  buildWestFront();
  const gTN = ROOT.children.find((c) => c.name === 'Transept_North'), gTS = ROOT.children.find((c) => c.name === 'Transept_South');
  buildTransFront(gTN, 1);
  buildTransFront(gTS, -1);
  buildSanctuary();
}

function previewStatues() {
  const names = P.statueTest;
  names.forEach((n, i) => placeFigure('Fig_' + n, n, { pos: [0, 0, (i - (names.length - 1) / 2) * 1.0] }));
  const base = new Batch(TILE.ashlar); base.box(-3, 3, -0.4, 0, -6, 6, { s: 0.8 }); place('Ground', base, MAT.ashlar);
}

// ==================================================================================
// BAKED LIGHT. The viewer casts no shadows, so the shadows are computed here. Every opaque surface is voxelized
// into the world, then each vertex looks at the sun, the sky and the rain:
//  - rays towards the sun give the low raking light and the cast shadows;
//  - rays over the hemisphere give the depth of portals and galleries, and tell inside from outside;
//  - a ray straight up finds what the rain never reaches, where seven centuries of soot have stayed.
// A batch placed many times can have one set of vertex colours per side of the building, within a byte budget.
// Sets beyond the budget share the sunniest colours under a darker material.
// ==================================================================================
const SKY_RAYS = (() => {
  const r = [[0, 1, 0, 1]];
  for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4, e = rad(42); r.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 1]); }
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + 0.1, e = rad(9); r.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0]); }
  return r;
})();
// Large meshes of moulding keep their shape with a quarter fewer triangles: the bytes are better spent up close
async function reduceBatches(share = 0.74, repeatedShare = 0.62, minTris = 2000) {
  const seen = new Map(), uses = new Map();
  for (const e of PLACED) uses.set(e.batch, (uses.get(e.batch) || 0) + 1);
  for (const e of PLACED) {
    const m = e.mat;
    if (e.batch.isFigure || m.transparent || m === MAT.glassIn || m === MAT.glassOut || m === MAT.ashlar || m === MAT.oak || m === MAT.iron || m === MAT.pave) continue;
    let nb = seen.get(e.batch);
    if (nb === undefined) {
      const tris = e.batch.I.length / 3, s = uses.get(e.batch) >= 8 ? repeatedShare : share; // a mesh repeated down the whole building costs the most
      nb = tris > minTris ? await lightCopy(e.batch, Math.round(tris * s)) : null;
      if (nb) nb.noColor = e.batch.noColor;
      seen.set(e.batch, nb);
    }
    if (nb) { e.batch = nb; e.part.geometry = nb.toGeo(); }
  }
}
function samplesOf(b) {
  if (b.samples) return b.samples;
  const P0 = b.P, out = [], lim = 0.32;
  for (let i = 0; i < P0.length; i++) out.push(P0[i]);
  for (let t = 0; t < b.I.length; t += 3) {
    const a = b.I[t] * 3, c = b.I[t + 1] * 3, d = b.I[t + 2] * 3;
    const e1 = len3(P0[a] - P0[c], P0[a + 1] - P0[c + 1], P0[a + 2] - P0[c + 2]), e2 = len3(P0[c] - P0[d], P0[c + 1] - P0[d + 1], P0[c + 2] - P0[d + 2]), e3 = len3(P0[d] - P0[a], P0[d + 1] - P0[a + 1], P0[d + 2] - P0[a + 2]), m = Math.max(e1, e2, e3);
    if (m <= lim) continue;
    const n = Math.ceil(m / lim);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n, w = 1 - u - v; out.push(P0[a] * u + P0[c] * v + P0[d] * w, P0[a + 1] * u + P0[c + 1] * v + P0[d + 1] * w, P0[a + 2] * u + P0[c + 2] * v + P0[d + 2] * w); }
  }
  b.samples = new Float32Array(out);
  return b.samples;
}
function bakeLight() {
  ROOT.updateMatrixWorld(true);
  const CELL = 0.4, X0 = -72, Y0 = -2, Z0 = -36, NX = 365, NY = 220, NZ = 180, CK = 8, CX = (NX >> 3) + 1, CY = (NY >> 3) + 1, CZ = (NZ >> 3) + 1;
  const grid = new Uint8Array(NX * NY * NZ), coarse = new Uint8Array(CX * CY * CZ);
  const SUN = (() => { const v = P.sun, l = len3(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  const SUN2 = [[SUN[0] + 0.06, SUN[1], SUN[2] + 0.05], [SUN[0] - 0.05, SUN[1] + 0.05, SUN[2] - 0.05]].map((v) => { const l = len3(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  for (const e of PLACED) {
    if (e.mat.transparent) continue;
    const S = samplesOf(e.batch), m = e.part.matrixWorld.elements;
    for (let i = 0; i < S.length; i += 3) {
      const x = S[i], y = S[i + 1], z = S[i + 2], gi = ((m[0] * x + m[4] * y + m[8] * z + m[12] - X0) / CELL) | 0, gj = ((m[1] * x + m[5] * y + m[9] * z + m[13] - Y0) / CELL) | 0, gk = ((m[2] * x + m[6] * y + m[10] * z + m[14] - Z0) / CELL) | 0;
      if (gi >= 0 && gi < NX && gj >= 0 && gj < NY && gk >= 0 && gk < NZ) { grid[gi + NX * (gj + NY * gk)] = 1; coarse[(gi >> 3) + CX * ((gj >> 3) + CY * (gk >> 3))] = 1; }
    }
  }
  // Distance to the first hit, or 1e9 if the ray leaves the world; capped rays return their cap
  const march = (ox, oy, oz, dx, dy, dz, cap) => {
    let t = 0; const st = CELL * 0.8, far = CELL * CK * 0.6;
    while (t < cap) {
      const i = ((ox + dx * t - X0) / CELL) | 0, j = ((oy + dy * t - Y0) / CELL) | 0, k = ((oz + dz * t - Z0) / CELL) | 0;
      if (i < 0 || i >= NX || j < 0 || j >= NY || k < 0 || k >= NZ) return 1e9;
      if (!coarse[(i >> 3) + CX * ((j >> 3) + CY * (k >> 3))]) { t += far; continue; }
      if (grid[i + NX * (j + NY * k)]) return t;
      t += st;
    }
    return cap;
  };
  const solidAt = (x, y, z) => { const i = ((x - X0) / CELL) | 0, j = ((y - Y0) / CELL) | 0, k = ((z - Z0) / CELL) | 0; return i >= 0 && i < NX && j >= 0 && j < NY && k >= 0 && k < NZ && grid[i + NX * (j + NY * k)] === 1; };
  // A vertex's light: [r,g,b] multipliers, plus how much of it was outdoors
  const light = { r: 1, g: 1, b: 1, out: 0, ndl: 0 };
  let sootFloor = 0.56, dampK = 1, indoorK = 1;
  const lightAt = (x, y, z, nx, ny, nz) => {
    // leave the voxels of the surface itself, then look around
    let ox = x + nx * CELL * 1.2, oy = y + ny * CELL * 1.2, oz = z + nz * CELL * 1.2, buried = false;
    if (solidAt(ox, oy, oz)) { ox = x + nx * CELL * 2.4; oy = y + ny * CELL * 2.4; oz = z + nz * CELL * 2.4; if (solidAt(ox, oy, oz)) { ox = x + nx * CELL * 3.6; oy = y + ny * CELL * 3.6; oz = z + nz * CELL * 3.6; buried = solidAt(ox, oy, oz); } }
    let esc = 0, skyW = 0, sky = 0, near = 0, nearN = 0, zen = 1e9;
    if (!buried) for (let q = 0; q < SKY_RAYS.length; q++) {
      const R = SKY_RAYS[q], up = R[3] === 1, d = march(ox, oy, oz, R[0], R[1], R[2], up ? 200 : 14);
      if (q === 0) zen = d;
      const w = Math.max(0.12, R[0] * nx + R[1] * ny + R[2] * nz + 0.35);
      skyW += w; if (d >= 1e9) { sky += w; if (up) esc++; } else if (!up && d >= 14) sky += w * 0.6;
      near += Math.min(d, 5) / 5; nearN++;
    }
    const ao = nearN ? near / nearN : 0.3, vis = skyW ? sky / skyW : 0, outdoors = esc >= 1 || vis > 0.22;
    let r, g, b;
    if (outdoors) {
      const ndl = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
      let sunV = 0;
      if (ndl > 0 && !buried) {
        if (march(ox, oy, oz, SUN[0], SUN[1], SUN[2], 200) >= 1e9) sunV += 0.5;
        if (march(ox, oy, oz, SUN2[0][0], SUN2[0][1], SUN2[0][2], 200) >= 1e9) sunV += 0.25;
        if (march(ox, oy, oz, SUN2[1][0], SUN2[1][1], SUN2[1][2], 200) >= 1e9) sunV += 0.25;
      }
      const amb = 0.2 + 0.44 * vis * (0.55 + 0.45 * ao), s = sunV * Math.max(0, ndl) * 1.02;
      r = amb * 0.84 + s * 1.0; g = amb * 0.88 + s * 0.88; b = amb * 0.98 + s * 0.68;
      // What the rain never touches keeps its soot; what it washes stays pale. Gentle on long walls, whose
      // few vertices would smear it: the crisp streaks under their ledges are decals.
      const shelter = zen < 6 ? 1 - zen / 6 : 0, soot = lerp(1, sootFloor, shelter * (1 - Math.max(0, ny)));
      r *= soot; g *= soot * 0.985; b *= soot * 0.96;
      // Rising damp: darker and greener towards the ground, a slow mottling over the height of the wall
      const damp = lerp(1, sstep(0, 9, y), dampK), mot = 0.93 + 0.07 * Math.sin(x * 0.53 + y * 0.31) * Math.sin(z * 0.47 - y * 0.23);
      r *= lerp(0.56, 1, damp) * mot; g *= lerp(0.64, 1, damp) * mot; b *= lerp(0.46, 1, damp) * mot;
      light.out = 1; light.ndl = ndl;
    } else {
      // Inside: warm stone, dark low in the aisles, lifting into the vault
      const aisle = Math.abs(z) > P.naveSpan / 2 + 0.4 && y < P.aisleCrown + 1 ? 0.76 : 1, s = lerp(0.32, 0.86, sstep(0.5, 34, y)) * lerp(0.5, 1, ao) * aisle * indoorK;
      r = s * 1.06; g = s * 0.87; b = s * 0.64;
      light.out = 0; light.ndl = 0;
    }
    light.r = r; light.g = g; light.b = b;
    return light;
  };
  // ---- group placements of each batch by which way they face the sun ----
  const perBatch = new Map();
  for (const e of PLACED) { if (e.batch.noColor || e.batch.isFigure || e.mat.transparent) continue; let l = perBatch.get(e.batch); if (!l) { l = []; perBatch.set(e.batch, l); } l.push(e); }
  const entries = [];
  for (const [b, list] of perBatch) {
    const groups = new Map();
    for (const e of list) {
      const m = e.part.matrixWorld.elements, sx = len3(m[0], m[1], m[2]) || 1, sy = len3(m[4], m[5], m[6]) || 1, sz = len3(m[8], m[9], m[10]) || 1;
      // the sun in this placement's own frame (mirror included)
      const lx = (m[0] * SUN[0] + m[1] * SUN[1] + m[2] * SUN[2]) / (sx * sx), ly = (m[4] * SUN[0] + m[5] * SUN[1] + m[6] * SUN[2]) / (sy * sy), lz = (m[8] * SUN[0] + m[9] * SUN[1] + m[10] * SUN[2]) / (sz * sz);
      const key = Math.round(lx * 3) + ',' + Math.round(ly * 3) + ',' + Math.round(lz * 3);
      let g = groups.get(key); if (!g) { g = { key, list: [], L: [lx, ly, lz] }; groups.set(key, g); } g.list.push(e);
    }
    const gl = [...groups.values()];
    for (const g of gl) { // how much sun this side receives, by area of normals
      let s = 0; const nn = b.N; for (let i = 0; i < nn.length; i += 3) s += Math.max(0, nn[i] * g.L[0] + nn[i + 1] * g.L[1] + nn[i + 2] * g.L[2]);
      g.expo = s / Math.max(1, nn.length / 3);
    }
    gl.sort((a, c) => c.expo - a.expo);
    entries.push({ b, gl, wall: list[0].mat === MAT.ashlar ? 0 : 1 });
  }
  // Long walls get their own light for each side first: they carry the sense of sun and shade from a distance
  entries.sort((a, c) => a.wall - c.wall || a.b.count - c.b.count);
  let spent = 0, variants = 0, tinted = 0, vbaked = 0;
  const TINTS = new Map();
  const tintOf = (mat, tier) => {
    const key = mat.uuid + '|' + tier; let m = TINTS.get(key);
    if (!m) { m = mat.clone(); m.name = mat.name + (tier === 1 ? '_ShadeSide' : '_DeepShadeSide'); m.color.setRGB(tier === 1 ? 0.84 : 0.68, tier === 1 ? 0.84 : 0.68, tier === 1 ? 0.85 : 0.7); TINTS.set(key, m); }
    return m;
  };
  const bakeGroup = (b, g) => {
    const rep = g.list[Math.floor(g.list.length / 2)], m = rep.part.matrixWorld.elements, n = b.count, out = new Uint8Array(n * 3), PP = b.P, NN = b.N, CC = b.C;
    let outdoor = 0;
    sootFloor = rep.mat === MAT.ashlar ? 0.84 : rep.mat === MAT.oak || rep.mat === MAT.iron || rep.mat === MAT.lead ? 0.9 : 0.56;
    dampK = rep.mat === MAT.oak || rep.mat === MAT.iron || rep.mat === MAT.lead ? 0 : 1;
    indoorK = rep.mat === MAT.oak ? 2.2 : 1; // the oak was given its own dark tone when it was built
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, x = PP[i3], y = PP[i3 + 1], z = PP[i3 + 2], a = NN[i3], c = NN[i3 + 1], d = NN[i3 + 2];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      let nx = m[0] * a + m[4] * c + m[8] * d, ny = m[1] * a + m[5] * c + m[9] * d, nz = m[2] * a + m[6] * c + m[10] * d; const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
      const L = lightAt(wx, wy, wz, nx, ny, nz);
      outdoor += L.out;
      out[i3] = Math.min(255, CC[i3] * L.r); out[i3 + 1] = Math.min(255, CC[i3 + 1] * L.g); out[i3 + 2] = Math.min(255, CC[i3 + 2] * L.b);
    }
    // Each vertex is one noisy sample of light: blend neighbours on the same surface so no sample can smear a dark
    // triangle across the stone. Edges between planes keep their contrast.
    {
      const sum = new Float32Array(n * 3), w = new Float32Array(n), I = b.I, passes = rep.mat === MAT.ashlar ? 3 : 2;
      const link = (p, q) => { if (NN[p * 3] * NN[q * 3] + NN[p * 3 + 1] * NN[q * 3 + 1] + NN[p * 3 + 2] * NN[q * 3 + 2] < 0.8) return; w[p]++; w[q]++; for (let c = 0; c < 3; c++) { sum[p * 3 + c] += out[q * 3 + c]; sum[q * 3 + c] += out[p * 3 + c]; } };
      for (let pass = 0; pass < passes; pass++) {
        sum.fill(0); w.fill(0);
        for (let t = 0; t < I.length; t += 3) { link(I[t], I[t + 1]); link(I[t + 1], I[t + 2]); link(I[t + 2], I[t]); }
        for (let i = 0; i < n; i++) if (w[i]) for (let c = 0; c < 3; c++) out[i * 3 + c] = out[i * 3 + c] * 0.4 + 0.6 * sum[i * 3 + c] / w[i];
      }
    }
    vbaked += n;
    return { colors: out, outdoor: outdoor / Math.max(1, n) };
  };
  for (const { b, gl } of entries) {
    const base = b.toGeo(), cost = (gl.length - 1) * b.count * 12, full = gl.length === 1 || spent + cost <= P.lightVariantBytes;
    if (full) spent += cost;
    gl.forEach((g, gi) => {
      if (gi === 0 || full) {
        const R = bakeGroup(b, g);
        g.outdoor = R.outdoor;
        if (gi === 0) { base.setAttribute('color', new THREE.BufferAttribute(R.colors, 3, true)); return; }
        const v = new THREE.BufferGeometry();
        v.setAttribute('position', base.attributes.position); v.setAttribute('normal', base.attributes.normal); v.setAttribute('uv', base.attributes.uv);
        v.setAttribute('color', new THREE.BufferAttribute(R.colors, 3, true));
        if (base.attributes.tangent) v.setAttribute('tangent', base.attributes.tangent);
        v.setIndex(base.index);
        for (const e of g.list) e.part.geometry = v;
        variants++;
      } else {
        // over budget: same colours, a darker stone. Skipped for batches that are mostly indoors
        tinted++;
        if (gl[0].outdoor < 0.3) return;
        const ratio = g.expo / Math.max(1e-3, gl[0].expo);
        if (ratio >= 0.78) return;
        const tier = ratio >= 0.45 ? 1 : 2;
        for (const e of g.list) e.part.material = tintOf(e.mat, tier);
      }
    });
  }
  // ---- figures keep their carved occlusion; the niche they stand in decides how much daylight reaches them ----
  let figN = 0;
  for (const f of FIG_PLACED) {
    const m = f.part.matrixWorld.elements, s = len3(m[0], m[1], m[2]) || 1, fx = m[0] / s, fy = m[1] / s, fz = m[2] / s;
    let ox = m[12] + m[4] * 1.3, oy = m[13] + m[5] * 1.3, oz = m[14] + m[6] * 1.3;
    for (let i = 0; i < 12 && solidAt(ox, oy, oz); i++) { ox += fx * CELL; oy += fy * CELL; oz += fz * CELL; }
    const L = lightAt(ox - fx * 0.05, oy - fy * 0.05, oz - fz * 0.05, fx, fy, fz);
    let mat = MAT.figureIn;
    if (L.out) { const lum = (L.r + L.g + L.b) / 3, facing = fx * SUN[0] + fy * SUN[1] + fz * SUN[2]; mat = lum > 0.56 ? MAT.figure : lum > 0.3 ? MAT.figureHalf : MAT.figureDeep; if (facing < -0.3 && mat === MAT.figure) mat = MAT.figureHalf; }
    f.part.material = mat; if (f.head) f.head.material = mat;
    figN++;
  }
  return { vertices: vbaked, variants, tinted, extraKB: Math.round(spent / 1024), figures: figN };
}

// <<ORNAMENT>>

// <<BUILD>>
async function build() {
  ROOT = createRoot('Cathedral');
  await makeMaterials();
  await prepareFigures(P.preview === 'statues' ? P.statueTest : Object.keys(FIGURES));
  if (P.preview === 'statues') { previewStatues(); return ROOT; }
  if (P.preview === 'all' || P.preview === 'unique') {
    buildCathedral();
    await reduceBatches();
    bakeLight();
    return ROOT;
  }
  if (P.preview === 'size') { // builds and bakes everything, then reports bytes as part names, and exports only a probe: fast
    buildCathedral();
    await reduceBatches();
    const baked = bakeLight(), report = ['bake_variants' + baked.variants + '_tinted' + baked.tinted + '_extraKB' + baked.extraKB];
    // Real buffer sizes, each attribute counted once: pos/normal 12, uv 8, colour 12, tangent 16 a vertex where normal-mapped
    const seenAttr = new Set(), seenTan = new Set(), byMat = {}; let bytes = 0, tris = 0;
    const add = (attr, per, key) => { if (!attr || seenAttr.has(attr)) return; seenAttr.add(attr); const b = attr.count * per; bytes += b; byMat[key] = (byMat[key] || 0) + b; };
    for (const e of PLACED) {
      const g = e.part.geometry, key = e.mat.name, a = g.attributes, m = e.part.material;
      tris += g.index.count / 3;
      add(a.position, 12, key); add(a.normal, 12, key); add(a.uv, 8, key); add(a.color, 12, key);
      add(g.index, g.index.array.BYTES_PER_ELEMENT, key);
      if (m && m.normalMap && !seenTan.has(a.position)) { seenTan.add(a.position); bytes += a.position.count * 16; byMat[key] = (byMat[key] || 0) + a.position.count * 16; }
    }
    report.push('geomKB' + Math.round(bytes / 1024) + '_meshes' + PLACED.length + '_rendered' + Math.round(tris));
    Object.keys(byMat).sort((p, q) => byMat[q] - byMat[p]).forEach((k) => report.push(k + '_KB' + Math.round(byMat[k] / 1024)));
    ROOT.clear();
    createPart('SizeProbe', boxGeo(1, 1, 1), gameMaterial(0x888888), { parent: ROOT });
    report.forEach((d) => group('SIZE_' + d));
    return ROOT;
  }
  if (P.preview === 'textures') { // measures the texture payload on its own
    Object.keys(MAT).forEach((k, i) => createPart('Swatch_' + k, boxGeo(1, 1, 1), MAT[k], { position: [i * 1.2, 0.5, 0], parent: ROOT }));
    return ROOT;
  }
  if (P.preview === 'stats') {
    buildCathedral();
    const list = [...STAT.entries()].map(([b, e]) => ({ name: e.name, n: e.n, tris: b.I.length / 3, kb: Math.round((batchBytes(b) + (e.normalMapped ? b.count * 16 : 0)) / 1024) })).sort((a, c) => c.kb - a.kb);
    let total = 0, draws = 0, rendered = 0; for (const e of list) { total += e.kb; draws += e.n; rendered += e.n * e.tris; }
    createPart('StatProbe', boxGeo(1, 1, 1), gameMaterial(0x888888), { parent: ROOT });
    group('STAT_TOTAL_kb_' + total + '_draws_' + draws + '_rendered_' + rendered + '_unique_' + list.length);
    list.slice(0, 40).forEach((e, i) => group('STAT_' + String(i).padStart(2, '0') + '_K' + Math.round(e.n * e.tris / 1000) + '_' + e.name + '_x' + e.n + '_tris' + e.tris + '_kb' + e.kb));
    return ROOT;
  }
  return ROOT;
}
