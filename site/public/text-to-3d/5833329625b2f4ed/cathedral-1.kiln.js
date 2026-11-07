// Gothic cathedral: parametric High Gothic church, true scale, metres.
// +X = west front (entrance) , -X = apse, +Y up, +Z = north.
const meta = { name: 'Gothic Cathedral', role: 'wonder' };

// ==================================================================================
// PARAMETERS: change these and the whole design follows.
// ==================================================================================
const P = {
  preview: 'all',          // 'all', or 'stats' (size report), 'textures' (map payload), 'unique' (no instances), 'statues' (test row)
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
  storyWindows: 3, clerestoryWindows: 3, // unique window cartoons (more = richer, larger GLB)
  // Glass
  glassGlow: 1.2, glassOuterGlow: 0.2, sunShear: [0.34, 0.86],
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
  constructor(tile = 1) { this.P = []; this.N = []; this.UV = []; this.C = []; this.I = []; this.tile = tile; this.setM(M.I()); this.sh = 1; this.rgb = [1, 1, 1]; this.fn = null; this.geo = null; }
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
    let sh = s * this.sh;
    if (this.fn) sh *= this.fn(wx, wy, wz, ax, ay, az, this);
    sh = clamp(sh);
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
      let uLen = 0;
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
const TILE = { ashlar: 4, fine: 2, lead: 4, pave: 2.4, oak: 1.2, iron: 0.8, gold: 1, carved: 1.6 };

function ashlarOps(rng, S, tone, joint, stains) {
  // Irregular coursed blocks; shared between albedo and height by replaying the same rng seed
  const ops = [], rows = 6, rowH = Math.round(S / rows);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH; let x = Math.round(rng() * S / 5) % S;
    const n = 3 + Math.floor(rng() * 2), widths = [];
    for (let i = 0; i < n; i++) widths.push(0.7 + rng() * 0.6);
    const tot = widths.reduce((a, c) => a + c, 0);
    for (let i = 0; i < n; i++) {
      const w = Math.round(widths[i] / tot * S), dv = rng();
      const col = dv > 0.5 ? tone[0] : tone[1];
      const x0 = x % S, wr = Math.min(w, S - x0);
      ops.push({ op: 'paint', shape: { kind: 'rectangle', x: x0, y: y0, width: wr, height: rowH }, rgba: [col[0], col[1], col[2], 255], opacity: Math.round(8 + rng() * 22) });
      if (wr < w) ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: y0, width: w - wr, height: rowH }, rgba: [col[0], col[1], col[2], 255], opacity: 24 });
      x += w;
      ops.push({ op: 'paint', shape: { kind: 'line', from: [x % S, y0], to: [x % S, y0 + rowH], width: joint.w }, rgba: joint.rgba, opacity: joint.op });
    }
    ops.push({ op: 'paint', shape: { kind: 'line', from: [0, y0], to: [S, y0], width: joint.w }, rgba: joint.rgba, opacity: joint.op });
  }
  return ops.slice(0, 56).concat(stains || []);
}

async function makeMaterials() {
  const S = 512;
  const noise = (a, b, scale, oct, seed, opacity, blend) => ({ op: 'noise', colorA: a, colorB: b, scale, octaves: oct, seed, opacity, blend: blend || 'normal' });
  const v3 = (usage, base, ops, size = S) => proceduralTexture({ schemaVersion: 3, width: size, height: size, usage, operations: [{ op: 'legacy-v2', spec: { schemaVersion: 2, size, usage, layers: base } }, ...ops] });
  const stamps = (w, h, rgba, count, seed, opacity, size = S) => ({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: w, height: h }, rgba, count, seed, area: { x: 0, y: 0, width: size, height: size }, opacity });

  // Weathered ashlar limestone: irregular coursed blocks, pitting, rain stains
  const ashA = v3('albedo', [{ op: 'solid', color: 0xd6ccb4 }, noise(0xb4a98f, 0xe6decb, 3, 3, 11, 0.85), noise(0x8f8671, 0xdcd3bf, 19, 3, 12, 0.45)], ashlarOps(mkRng(77), S, [[92, 84, 68], [242, 234, 214]], { w: 2, rgba: [96, 88, 74, 255], op: 215 }, [
    stamps(26, 40, [84, 80, 68, 255], 30, 5, 22), stamps(5, 4, [86, 80, 66, 255], 90, 6, 44), stamps(2, 2, [70, 64, 54, 255], 130, 7, 70),
  ]));
  const ashH = v3('albedo', [{ op: 'solid', color: 0xb8b8b8 }, noise(0x8a8a8a, 0xd8d8d8, 5, 3, 21, 0.75), noise(0x707070, 0xd0d0d0, 34, 4, 22, 0.6)], ashlarOps(mkRng(77), S, [[110, 110, 110], [235, 235, 235]], { w: 3, rgba: [18, 18, 18, 255], op: 255 }, [
    stamps(5, 4, [84, 84, 84, 255], 86, 8, 96), stamps(2, 2, [64, 64, 64, 255], 160, 9, 130),
  ]));
  MAT.ashlar = pbrMaterial({ albedo: ashA, normal: normalMapFromHeight(ashH, { strength: 3.2 }), roughness: 0.93, metalness: 0, name: 'Limestone_Ashlar' });

  // Fine dressed limestone (mouldings, tracery, figures): no joints, weathered pits
  const finA = v3('albedo', [{ op: 'solid', color: 0xd9d0ba }, noise(0xbcb29a, 0xe9e2d0, 4, 3, 31, 0.8), noise(0x9d9480, 0xe4dcc8, 23, 3, 32, 0.4)], [
    stamps(2, 2, [112, 104, 90, 255], 170, 33, 40), stamps(20, 30, [106, 100, 86, 255], 30, 34, 18),
  ]);
  const finH = v3('albedo', [{ op: 'solid', color: 0xb0b0b0 }, noise(0x8c8c8c, 0xd4d4d4, 9, 3, 35, 0.7), noise(0x787878, 0xd8d8d8, 44, 4, 36, 0.65)], [
    stamps(4, 4, [96, 96, 96, 255], 50, 37, 90), stamps(2, 2, [80, 80, 80, 255], 200, 38, 120),
  ]);
  MAT.fine = pbrMaterial({ albedo: finA, normal: normalMapFromHeight(finH, { strength: 1.5 }), roughness: 0.9, metalness: 0, name: 'Limestone_Dressed' });

  // Patinated lead: pale bloom over blue-grey, standing seams and lapped sheets, streaks
  const leadOps = (seam, lap, base) => { const ops = []; for (let i = 0; i < 4; i++) ops.push({ op: 'paint', shape: { kind: 'line', from: [i * S / 4 + 20, 0], to: [i * S / 4 + 20, S], width: seam.w }, rgba: seam.rgba, opacity: seam.op }); for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { const y = ((k * S / 4 + (i % 2) * S / 8) | 0) + 16; ops.push({ op: 'paint', shape: { kind: 'line', from: [i * S / 4 + 20, y], to: [Math.min(S, i * S / 4 + 20 + S / 4), y], width: lap.w }, rgba: lap.rgba, opacity: lap.op }); } return ops; };
  const leadA = v3('albedo', [{ op: 'solid', color: 0x7f8a8e }, noise(0x5e6a70, 0xaab4b4, 4, 4, 41, 0.9), noise(0x6b7a7a, 0xc9d1cc, 14, 3, 42, 0.5)], [...leadOps({ w: 3, rgba: [58, 64, 68, 255], op: 170 }, { w: 2, rgba: [66, 72, 76, 255], op: 120 }), stamps(16, 90, [205, 212, 206, 255], 28, 43, 34), stamps(14, 80, [40, 48, 52, 255], 26, 44, 40)]);
  const leadH = v3('albedo', [{ op: 'solid', color: 0x9a9a9a }, noise(0x8a8a8a, 0xb0b0b0, 7, 3, 45, 0.8)], leadOps({ w: 7, rgba: [244, 244, 244, 255], op: 255 }, { w: 3, rgba: [60, 60, 60, 255], op: 200 }));
  MAT.lead = pbrMaterial({ albedo: leadA, normal: normalMapFromHeight(leadH, { strength: 3.4 }), roughness: 0.56, metalness: 0.42, name: 'Lead_Patinated' });

  // Gilding: slight wear so highlights break up
  const gldA = v3('albedo', [{ op: 'solid', color: 0xe4b64a }, noise(0xb5862c, 0xf3cf6a, 12, 3, 51, 0.6)], [], 128);
  const gldH = v3('albedo', [{ op: 'solid', color: 0xa0a0a0 }, noise(0x808080, 0xc0c0c0, 22, 3, 52, 0.8)], [], 128);
  MAT.gold = pbrMaterial({ albedo: gldA, normal: normalMapFromHeight(gldH, { strength: 1 }), roughness: 0.27, metalness: 1, name: 'Gilding' });

  // Aged oak and forged iron from the approved scanned sets
  MAT.oak = pbrMaterial({ albedo: await loadApprovedTexture('kiln.texture.oak-veneer-albedo.v1'), normal: await loadApprovedTexture('kiln.texture.oak-veneer-normal.v1'), metallicRoughness: await loadApprovedTexture('kiln.texture.oak-veneer-arm.v1'), name: 'Oak_Aged' });
  MAT.iron = pbrMaterial({ albedo: await loadApprovedTexture('kiln.texture.rusted-metal-albedo.v1'), normal: await loadApprovedTexture('kiln.texture.rusted-metal-normal.v1'), metallicRoughness: await loadApprovedTexture('kiln.texture.rusted-metal-arm.v1'), name: 'Iron_Forged' });

  // Polished paving: chequered limestone and dark marble
  const pavA = proceduralTexture({ schemaVersion: 2, size: 512, usage: 'albedo', layers: [{ op: 'checker', colorA: 0xd2cab6, colorB: 0x8c8678, squares: 4 }, noise(0x7c766a, 0xe0dac8, 9, 3, 61, 0.42), { op: 'bricks', brick: 0xffffff, mortar: 0x5a564e, rows: 4, cols: 4, mortarWidth: 0.018, stagger: 0, blend: 'multiply' }] });
  const pavH = proceduralTexture({ schemaVersion: 2, size: 512, usage: 'albedo', layers: [{ op: 'solid', color: 0xc8c8c8 }, noise(0xb0b0b0, 0xdcdcdc, 15, 3, 62, 0.5), { op: 'bricks', brick: 0xffffff, mortar: 0x202020, rows: 4, cols: 4, mortarWidth: 0.018, stagger: 0, blend: 'multiply' }] });
  MAT.pave = pbrMaterial({ albedo: pavA, normal: normalMapFromHeight(pavH, { strength: 1.8 }), roughness: 0.38, metalness: 0, name: 'Paving_Polished' });

  // Carved limestone: a lozenge diaper of quatrefoils, its relief carried in the normal map
  const carvedOps = (hi, lo, mid, deep) => {
    const T = 512, ops = [], paint = (shape, rgba, opacity) => ops.push({ op: 'paint', shape, rgba: [rgba, rgba, rgba, 255].map((v, i) => (i === 3 ? 255 : v)), opacity });
    const lat = (a, c) => { paint({ kind: 'line', from: a, to: c, width: 16 }, mid, 255); paint({ kind: 'line', from: a, to: c, width: 7 }, hi, 255); };
    lat([0, 0], [T, T]); lat([T, 0], [0, T]); lat([0, T / 2], [T / 2, 0]); lat([T / 2, T], [T, T / 2]); lat([0, T / 2], [T / 2, T]); lat([T / 2, 0], [T, T / 2]);
    for (const [cx, cy] of [[T / 4, T / 2], [3 * T / 4, T / 2], [T / 2, T / 4], [T / 2, 3 * T / 4]]) {
      const lobe = 44, off = 34;
      for (const [dx, dy] of [[-off, 0], [off, 0], [0, -off], [0, off]]) paint({ kind: 'ellipse', x: cx + dx - lobe, y: cy + dy - lobe, width: lobe * 2, height: lobe * 2 }, mid, 255);
      for (const [dx, dy] of [[-off, 0], [off, 0], [0, -off], [0, off]]) paint({ kind: 'ellipse', x: cx + dx - lobe + 9, y: cy + dy - lobe + 9, width: lobe * 2 - 18, height: lobe * 2 - 18 }, lo, 255);
      paint({ kind: 'ellipse', x: cx - 22, y: cy - 22, width: 44, height: 44 }, hi, 255);
      paint({ kind: 'ellipse', x: cx - 11, y: cy - 11, width: 22, height: 22 }, deep, 255);
    }
    return ops.slice(0, 60);
  };
  const carH = proceduralTexture({ schemaVersion: 3, width: 512, height: 512, usage: 'albedo', background: [120, 120, 120, 255], operations: carvedOps(236, 96, 176, 60) });
  // The albedo only hints at the pattern (dust in the cuts); the relief itself lives in the normals
  const carAlb = proceduralTexture({ schemaVersion: 3, width: 512, height: 512, usage: 'albedo', background: [198, 190, 170, 255], operations: carvedOps(214, 178, 204, 150).map((op) => { const g = op.rgba[0]; return Object.assign({}, op, { rgba: [g, Math.round(g * 0.955), Math.round(g * 0.86), 255] }); }) });
  MAT.carved = pbrMaterial({ albedo: carAlb, normal: normalMapFromHeight(carH, { strength: 4.5 }), roughness: 0.92, metalness: 0, name: 'Limestone_Carved' });

  for (const k of ['ashlar', 'fine', 'carved', 'oak', 'iron', 'pave']) MAT[k].vertexColors = true;

  // Pot-metal glass palette: one texture of hand-mixed colours with streaks and seeds.
  // Panes carry UVs into their swatch, so every window shares a single material.
  const palOps = (usage) => {
    const n = PALETTE_COLS, cell = Math.floor(PAL_SIZE / n), ops = [];
    PALETTE.forEach((p, i) => ops.push({ op: 'paint', shape: { kind: 'rectangle', x: (i % n) * cell, y: Math.floor(i / n) * cell, width: cell, height: cell }, rgba: [p[1], p[2], p[3], 255] }));
    return ops;
  };
  const palStreaks = [];
  const srng = mkRng(4242);
  for (let i = 0; i < 16; i++) { // horizontal streaks: pot metal is never one flat colour
    const y = Math.floor(srng() * PAL_SIZE), dark = srng() > 0.42;
    palStreaks.push({ op: 'paint', shape: { kind: 'line', from: [0, y], to: [PAL_SIZE, Math.min(PAL_SIZE, y + Math.floor(srng() * 26))], width: 3 + Math.floor(srng() * 7) }, rgba: dark ? [0, 0, 0, 255] : [255, 255, 255, 255], opacity: dark ? 40 + Math.floor(srng() * 50) : 16 + Math.floor(srng() * 26) });
  }
  for (let i = 0; i < 12; i++) { // and vertical ones, so each pane samples a different tone
    const x = Math.floor(srng() * PAL_SIZE), dark = srng() > 0.4;
    palStreaks.push({ op: 'paint', shape: { kind: 'line', from: [x, 0], to: [Math.min(PAL_SIZE, x + Math.floor(srng() * 18)), PAL_SIZE], width: 2 + Math.floor(srng() * 6) }, rgba: dark ? [0, 0, 0, 255] : [255, 255, 255, 255], opacity: dark ? 34 + Math.floor(srng() * 44) : 14 + Math.floor(srng() * 22) });
  }
  palStreaks.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 3, height: 3 }, rgba: [255, 255, 255, 255], count: 110, seed: 71, area: { x: 0, y: 0, width: PAL_SIZE, height: PAL_SIZE }, opacity: 34 });
  const palSpec = (usage) => ({ schemaVersion: 3, width: PAL_SIZE, height: PAL_SIZE, usage, background: [10, 10, 12, 255], operations: [...palOps(usage), ...palStreaks] });
  const palE = proceduralTexture(palSpec('emissive')), palA = proceduralTexture(palSpec('albedo'));
  MAT.glassIn = pbrMaterial({ emissive: palE, emissiveIntensity: P.glassGlow, roughness: 0.62, metalness: 0, name: 'StainedGlass_Interior' });
  MAT.glassIn.color.setRGB(0.012, 0.012, 0.012);
  // From outside, stained glass by day is deep and glossy, its colours held back
  MAT.glassOut = pbrMaterial({ albedo: palA, emissive: palE, emissiveIntensity: P.glassOuterGlow, roughness: 0.14, metalness: 0, name: 'StainedGlass_Exterior' });
  MAT.glassOut.color.setRGB(0.62, 0.62, 0.66);
  MAT.pool = pbrMaterial({ emissive: palE, emissiveIntensity: 0.9, roughness: 0.9, metalness: 0, alphaMode: 'blend', name: 'StainedGlass_LightPool' });
  MAT.pool.color.setRGB(0.01, 0.01, 0.01);
  MAT.pool.opacity = 0.27;
  MAT.pool.depthWrite = false;
  // Statues indoors share their geometry with those outside, under a dimmer stone
  MAT.fineDim = copyMaterial(MAT.fine);
  MAT.fineDim.name = 'Limestone_Dressed_Interior';
  MAT.fineDim.color.setRGB(0.58, 0.55, 0.5);
  MAT.fineDim.vertexColors = true;
}

// Hand-mixed glass colours: [name, r, g, b]
const PALETTE = [
  ['ruby', 176, 16, 28], ['rubyLt', 214, 44, 40], ['cobalt', 16, 38, 158], ['azure', 28, 92, 200], ['sky', 92, 156, 224], ['pale', 178, 212, 234],
  ['emerald', 14, 116, 60], ['green', 64, 148, 62], ['olive', 128, 136, 40], ['gold', 242, 178, 36], ['amber', 222, 130, 26], ['yellow', 252, 222, 96],
  ['white', 240, 234, 206], ['pearl', 208, 208, 190], ['flesh', 240, 194, 152], ['fleshDk', 208, 152, 116], ['violet', 96, 38, 146], ['purple', 140, 48, 124],
  ['rose', 212, 84, 122], ['brown', 112, 64, 34], ['tan', 176, 122, 70], ['grey', 124, 124, 118], ['teal', 18, 112, 124], ['lead', 10, 10, 12],
  ['paint', 34, 22, 16], ['night', 10, 18, 66], ['crimson', 122, 10, 24], ['forest', 8, 72, 40], ['hair', 72, 46, 24], ['bone', 228, 218, 182],
];
const PALETTE_COLS = 6, PAL_SIZE = 252;
const PAL = {}; PALETTE.forEach((p, i) => { PAL[p[0]] = i; });

// Hierarchy helper: every mesh gets a unique role name; geometry is shared between placements.
let ROOT = null; const NAMES = new Map();
function uniq(n) { const c = (NAMES.get(n) || 0) + 1; NAMES.set(n, c); return c === 1 ? n : n + '_' + c; }
const STAT = new Map();
// Exporter costs measured on this host: pos+normal+uv 32 B, COLOR_0 written as 12 B floats
function batchBytes(b) { b.weld(); return b.count * (32 + (b.noColor ? 0 : 12)) + b.I.length * (b.count > 65535 ? 4 : 2); }
function place(name, batch, mat, o = {}) {
  if (!batch || !batch.I.length) return null;
  if (mat === MAT.lead || mat === MAT.gold) batch.noColor = true; // no baked shading needed: saves 12 B a vertex
  if (P.preview === 'unique' && batch.geo) return null; // size test: every geometry once, no instances
  if (P.preview === 'stats') {
    const e = STAT.get(batch) || { name, n: 0 };
    e.n++; STAT.set(batch, e);
    return null;
  }
  return createPart(uniq(name), batch.toGeo(), mat, { position: o.pos || [0, 0, 0], rotation: o.rot || [0, 0, 0], scale: o.scale || [1, 1, 1], parent: o.parent || ROOT });
}
function group(name, parent) { const g = new THREE.Group(); g.name = uniq(name); (parent || ROOT).add(g); return g; }

// ==================================================================================
// SCULPTURE: robed figures with carved drapery. A figure is a full surface, not a block:
// S-curve stance, tube folds breaking at the hem, swags across the body, sleeves, hands,
// modelled faces, hair and beards, and the attributes each saint carries.
// ==================================================================================
const FIGURES = {
  apostle: { beard: 1, hold: 'book', sway: 1, seed: 1 },
  peter: { beard: 1, hold: 'key', sway: -1, seed: 2, bald: 1 },
  paul: { beard: 2, hold: 'sword', sway: 1, seed: 3 },
  bishop: { beard: 0, hold: 'crozier', sway: -1, seed: 4, mitre: 1 },
  martyr: { veil: 1, hold: 'palm', sway: 1, seed: 5, slim: 0.92 },
  deacon: { beard: 0, hold: 'bookOpen', sway: -1, seed: 6, curls: 1 },
  prophet: { beard: 2, hold: 'scroll', sway: 1, seed: 7, cap: 1 },
  virgin: { veil: 1, crown: 1, hold: 'child', sway: 1, seed: 8, slim: 0.94 },
  christ: { beard: 1, hold: 'bless', sway: -1, seed: 9, nimbus: 1 },
  kingA: { beard: 1, crown: 1, hold: 'sceptre', sway: 1, seed: 10, broad: 1.06 },
  kingB: { beard: 2, crown: 1, hold: 'orb', sway: -1, seed: 11, broad: 1.06 },
  kingC: { beard: 0, crown: 1, hold: 'sceptre', sway: -1, seed: 12, broad: 1.04, curls: 1 },
  angel: { beard: 0, hold: 'censer', sway: 1, seed: 13, wings: 1, curls: 1, slim: 0.95 },
};

function addHead(b, o, lod) {
  const nu = lod ? 22 : 8, nv = lod ? 17 : 5;
  b.grid((u, v) => {
    const su = 2 * u - 1, sv = 2 * v - 1;
    // samples crowd towards the face, where the carving is
    const phi = lod ? PI * Math.sign(su) * Math.pow(Math.abs(su), 1.55) : PI * su;
    const lam = lod ? -0.1 + (sv < 0 ? 1.44 : 1.64) * Math.sign(sv) * Math.pow(Math.abs(sv), 1.35) : (PI / 2 - 0.03) * sv;
    const a = Math.abs(phi);
    let d = 0, sh = 1, dy = 0;
    d += 0.034 * gauss(phi / 0.12, (lam + 0.04) / 0.19);         // nose
    d += 0.016 * gauss(phi / 0.62, (lam - 0.25) / 0.075);        // brow
    d -= 0.015 * gauss((a - 0.42) / 0.16, (lam - 0.1) / 0.08);   // sockets
    d += 0.006 * gauss((a - 0.42) / 0.09, (lam - 0.08) / 0.04);  // eyeballs
    d += 0.009 * gauss((a - 0.72) / 0.24, (lam + 0.12) / 0.16);  // cheekbones
    d -= 0.007 * gauss(phi / 0.27, (lam + 0.4) / 0.028);         // mouth
    d += 0.006 * gauss(phi / 0.22, (lam + 0.33) / 0.045);        // upper lip
    d += 0.006 * gauss(phi / 0.18, (lam + 0.47) / 0.045);        // lower lip
    d += 0.014 * gauss(phi / 0.26, (lam + 0.74) / 0.13);         // chin
    sh -= 0.3 * gauss((a - 0.42) / 0.17, (lam - 0.14) / 0.05);   // shadow under the brow
    sh -= 0.42 * gauss((a - 0.42) / 0.11, (lam - 0.085) / 0.026); // lid line
    sh -= 0.32 * gauss(phi / 0.25, (lam + 0.4) / 0.022);
    sh -= 0.18 * gauss((a - 0.17) / 0.06, (lam + 0.1) / 0.09);   // beside the nose
    sh -= 0.12 * gauss(phi / 0.3, (lam + 0.6) / 0.05);           // under the lip
    // Hair
    const line = o.bald ? 0.85 - 1.55 * (1 - Math.cos(phi)) / 2 : 0.56 - 1.2 * (1 - Math.cos(phi)) / 2;
    const hair = sstep(-0.03, 0.06, lam - line) * (o.bald && lam > 0.95 ? 0 : 1);
    const strands = Math.abs(Math.sin(phi * (o.curls ? 11 : 16) + lam * (o.curls ? 9 : 3)));
    d += hair * ((o.curls ? 0.024 : 0.016) + (o.curls ? 0.012 : 0.006) * strands);
    sh -= hair * 0.34 * (1 - strands);
    // Beard: a modelled mass that falls below the chin
    if (o.beard) {
      // starts below the lower lip at the centre, climbs the jaw to the ears; the mouth stays clear
      const startLam = lerp(-0.56, -0.12, sstep(0.25, 1.15, a));
      const bm = sstep(startLam + 0.06, startLam - 0.08, lam) * sstep(1.65, 1.25, a);
      const len = o.beard === 2 ? 0.11 : 0.05;
      const rid = Math.abs(Math.sin(phi * 13 + lam * 1.6));
      d += bm * (0.012 + 0.008 * rid);
      dy -= bm * sstep(-0.5, -1.25, lam) * len;
      sh -= bm * 0.1 * (1 - rid);
    }
    const cl = Math.cos(lam), sl = Math.sin(lam);
    const x = (0.098 + d) * cl * Math.cos(phi), y = (0.122 + d * 0.8) * sl + dy, z = (0.082 + d * 0.9) * cl * Math.sin(phi);
    return [x, y, z, clamp(sh, 0.3, 1)];
  }, nu, nv, { flip: true, wrapU: true });
}

function addVeil(b, lod) { // a hood falling to the shoulders
  const nu = lod ? 24 : 10, nv = lod ? 12 : 5;
  b.grid((u, v) => {
    const a = lerp(0.95, TAU - 0.95, u), t = v; // open at the front (a=0)
    const lam = lerp(-1.25, 1.45, t), cl = Math.cos(lam);
    const fold = Math.abs(Math.sin(a * 5 + t)) * (1 - t);
    const k = 1 + 0.25 * (1 - t) + 0.05 * fold;
    return [(0.125 * k) * cl * Math.cos(a) - 0.012, (0.15 + 0.02 * (1 - t)) * Math.sin(lam) + (t < 0.4 ? -(0.4 - t) * 0.1 : 0), 0.105 * k * cl * Math.sin(a), 0.62 + 0.38 * fold * (1 - t) + 0.38 * t];
  }, nu, nv, { flip: false });
}

function addAttribute(b, g, kind, lod, H) {
  const B = 0.075; // hand scale
  const rod = (p, q, r, n = 6) => b.tube([p, q], r, lod ? n : 4, { capStart: true });
  switch (kind) {
    case 'book': case 'bookOpen': {
      b.at(M.of(M.T(0.24, 1.3, 0.03), M.Rz(-58), M.Ry(10)), () => {
        b.box(-0.015, 0.015, -0.13, 0.13, -0.09, 0.09, { s: 0.85 });
        b.box(0.015, 0.03, -0.122, 0.122, -0.086, 0.086, { s: 1 });
        if (lod) for (let i = -1; i <= 1; i += 2) for (let k = -1; k <= 1; k += 2) b.box(-0.022, 0.022, i * 0.1 - 0.012, i * 0.1 + 0.012, k * 0.065 - 0.012, k * 0.065 + 0.012, { s: 0.7 });
      });
      break;
    }
    case 'key': {
      const y0 = 1.38;
      rod([0.25, y0 - 0.42, 0.12], [0.25, y0 + 0.28, 0.12], 0.016);
      b.at(M.T(0.25, y0 + 0.3, 0.12), () => { b.at(M.Rx(90), () => b.lathe([[0.05, -0.012], [0.06, 0], [0.05, 0.012], [0.03, 0.012], [0.02, 0], [0.03, -0.012], [0.05, -0.012]], lod ? 12 : 6)); });
      b.box(0.24, 0.26, y0 - 0.42, y0 - 0.33, 0.12, 0.2, { s: 0.9 });
      b.box(0.24, 0.26, y0 - 0.3, y0 - 0.26, 0.12, 0.17, { s: 0.9 });
      break;
    }
    case 'sword': {
      rod([0.27, 0.32, 0.17], [0.27, 1.32, 0.17], 0.018, 4);
      b.at(M.T(0.27, 1.33, 0.17), () => { b.box(-0.022, 0.022, -0.0, 0.03, -0.11, 0.11, { s: 0.9 }); b.lathe([[0.01, 0.03], [0.02, 0.08], [0.03, 0.12], [0.02, 0.15], [0, 0.16]], 6); });
      break;
    }
    case 'crozier': {
      rod([0.3, 0.02, 0.2], [0.3, 2.05, 0.2], 0.018);
      const volute = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = -PI * 0.5 + t * PI * 2.4, r = lerp(0.11, 0.03, t); volute.push([0.3 + (r * Math.cos(a) + r * 0.1), 2.14 + r * Math.sin(a), 0.2]); }
      (g || b).tube(volute, (t) => lerp(0.022, 0.012, t), lod ? 6 : 4, { capStart: true });
      blob(g || b, [0.3, 2.02, 0.2], [0.036, 0.036, 0.036], 6, 4);
      break;
    }
    case 'palm': {
      const stem = []; for (let i = 0; i <= 8; i++) { const t = i / 8; stem.push([0.25 + 0.03 * Math.sin(t * 2), 1.15 + t * 0.85, 0.15 - 0.03 * t]); }
      b.tube(stem, (t) => lerp(0.012, 0.004, t), 4);
      if (lod) for (let i = 2; i < 8; i++) for (let s = -1; s <= 1; s += 2) { const p = stem[i], L = 0.13 * (1 - i / 11); b.tube([p, [p[0] + 0.01, p[1] + L * 0.4, p[2] + s * L * 0.8], [p[0] + 0.015, p[1] + L * 0.2, p[2] + s * L * 1.25]], (t) => lerp(0.01, 0.002, t), 3); }
      break;
    }
    case 'scroll': {
      const path = []; for (let i = 0; i <= 12; i++) { const t = i / 12; path.push([0.25 + 0.03 * Math.sin(t * 5), 1.42 - t * 0.85, 0.08 * Math.sin(t * 3) - 0.04]); }
      b.grid((u, v) => { const k = u * 12, i = Math.min(11, Math.floor(k)), f = k - i, p = path[i], q = path[i + 1]; return [lerp(p[0], q[0], f), lerp(p[1], q[1], f), lerp(p[2], q[2], f) + (v - 0.5) * 0.17, 0.9]; }, lod ? 12 : 4, 1, { flip: false });
      b.grid((u, v) => { const k = u * 12, i = Math.min(11, Math.floor(k)), f = k - i, p = path[i], q = path[i + 1]; return [lerp(p[0], q[0], f) - 0.003, lerp(p[1], q[1], f), lerp(p[2], q[2], f) + (v - 0.5) * 0.17, 0.75]; }, lod ? 12 : 4, 1, { flip: true });
      b.at(M.of(M.T(0.25, 1.44, -0.04), M.Rx(90)), () => b.lathe([[0.024, -0.1], [0.026, 0.1]], 6));
      break;
    }
    case 'sceptre': {
      rod([0.27, 0.95, 0.19], [0.27, 2.0, 0.19], 0.016);
      const c = g || b;
      blob(c, [0.27, 2.03, 0.19], [0.042, 0.042, 0.042], 8, 6);
      for (let i = 0; i < 4; i++) { const a = i * PI / 2; c.tube([[0.27, 2.04, 0.19], [0.27 + 0.05 * Math.cos(a), 2.09, 0.19 + 0.05 * Math.sin(a)], [0.27 + 0.03 * Math.cos(a), 2.14, 0.19 + 0.03 * Math.sin(a)]], (t) => lerp(0.014, 0.003, t), 4); }
      break;
    }
    case 'orb': {
      const c = g || b;
      blob(c, [0.27, 1.34, 0.14], [0.08, 0.08, 0.08], 12, 8);
      c.box(0.262, 0.278, 1.41, 1.52, 0.132, 0.148, { s: 1 }); c.box(0.262, 0.278, 1.46, 1.48, 0.1, 0.18, { s: 1 });
      break;
    }
    case 'child': {
      // The Christ child on the left arm, a small swaddled figure with its own head
      const c = [0.21, 1.3, -0.12];
      b.tube([[c[0] - 0.02, c[1] - 0.16, c[2]], [c[0], c[1], c[2] + 0.02], [c[0] + 0.02, c[1] + 0.18, c[2]]], (t) => [lerp(0.06, 0.075, Math.sin(t * PI)), lerp(0.055, 0.075, Math.sin(t * PI))], lod ? 10 : 5, { capStart: true });
      b.at(M.of(M.T(c[0] + 0.03, c[1] + 0.27, c[2]), M.S(0.56)), () => addHead(b, { curls: 1 }, 0));
      break;
    }
    case 'censer': {
      const c = g || b;
      blob(c, [0.32, 0.78, 0.13], [0.06, 0.055, 0.06], 8, 6);
      c.tube([[0.32, 0.83, 0.13], [0.3, 1.2, 0.13]], 0.005, 3);
      break;
    }
    default: break;
  }
}

function addWing(b, side, lod) {
  const nu = lod ? 12 : 5, nv = lod ? 6 : 2;
  const fn = (off) => (u, v) => {
    const len = lerp(0.1, 1.42, u), wid = 0.34 * Math.sin(PI * Math.pow(u, 0.62)) * (1 - 0.25 * u);
    const feather = Math.abs(Math.sin(v * 7 + u * 6)) * 0.018 + Math.abs(Math.sin(u * 22)) * 0.008 * (1 - v);
    const x = -0.12 - 0.17 * u - v * wid * 0.72 + off, y = 1.72 + 0.22 * Math.sin(u * 1.6) - len * 0.9 * u - v * wid * 0.25, z = side * (0.17 + 0.2 * u + v * wid * 0.42) ;
    return [x + feather, y, z, 0.68 + 7 * feather];
  };
  b.grid(fn(0), nu, nv, { flip: side > 0 });
  b.grid(fn(-0.03), nu, nv, { flip: side < 0 });
}

// Builds one figure; returns { stone, gold }. Local frame: faces +X, feet at y=0, about 2.05 m high.
function makeFigure(spec, lod = 1) {
  const o = typeof spec === 'string' ? FIGURES[spec] : spec;
  const stone = new Batch(TILE.fine), gold = new Batch(TILE.gold);
  const rng = mkRng(o.seed * 991 + 7), ph = []; for (let i = 0; i < 8; i++) ph.push(rng() * TAU);
  const yN = 1.7, nv = lod ? 26 : 8, nu = lod ? 44 : 12;
  const sw = o.sway || 1, slim = o.slim || 1, broad = o.broad || 1;
  const keys = [[0, 0.205, 0.235, 0.25], [0.05, 0.185, 0.215, 0.228], [0.3, 0.15, 0.178, 0.186], [0.52, 0.13, 0.158, 0.166], [0.68, 0.118, 0.135, 0.158], [0.8, 0.122, 0.128, 0.17], [0.875, 0.114, 0.118, 0.172], [0.925, 0.094, 0.098, 0.15], [0.965, 0.066, 0.07, 0.098], [1, 0.048, 0.05, 0.05]];
  const center = (t) => [0.018 * Math.sin(t * PI) * 1.3, sw * (0.055 * Math.sin(t * PI * 0.9) - 0.028 * Math.sin(t * PI * 2))];
  stone.grid((u, v) => {
    const th = -PI + TAU * u, t = 1 - Math.pow(1 - v, 1.35);
    const [af, ab, bs] = keyf(keys, t);
    const front = Math.cos(th) > 0, a = front ? af : ab;
    const c = Math.cos(th), s = Math.sin(th);
    const R = 1 / Math.sqrt((c * c) / (a * a) + (s * s) / (bs * bs * slim * slim * broad * broad));
    // ---- drapery ----
    const lower = sstep(0.72, 0.02, t);
    const f1 = Math.abs(Math.sin(th * 4 + ph[0] + t * 0.8 * sw)), f2 = Math.abs(Math.sin(th * 7 + ph[1] - t * 1.2)), f3 = 0.5;
    let d = lower * (0.052 * (f1 - 0.55) + 0.02 * (f2 - 0.55));
    const backF = sstep(0.6, -0.6, c) * sstep(1.0, 0.75, t);
    d += backF * 0.016 * (Math.abs(Math.sin(th * 5 + ph[3])) - 0.5);
    // hem breaking on the ground
    d += sstep(0.09, 0, t) * (0.03 * Math.sin(th * 7 + ph[4]) + 0.012 * Math.sin(th * 15 + ph[5]));
    // swags: U-shaped folds hanging across the front of the body
    const arc = (th - 0.25 * sw) / 1.05, swagW = gauss(arc * 0.86) * sstep(0.24, 0.42, t) * sstep(0.82, 0.68, t);
    const swag = Math.abs(Math.sin((t + 0.34 * arc * arc) * 30 + ph[6]));
    d += swagW * 0.034 * (swag - 0.45);
    // mantle edge: a diagonal step where the cloak overlaps the tunic
    const edge = 0.5 + 0.26 * Math.sin(th * sw + 0.9) - 0.1 * Math.cos(th * 2);
    const mant = sstep(-0.012, 0.012, t - edge);
    d += mant * 0.014 * (t < 0.92 ? 1 : (1 - t) / 0.08);
    const lip = gauss((t - edge) / 0.012) * 0.006;
    d += lip;
    // belt
    if (!o.noBelt) { const beltBand = gauss((t - 0.655) / 0.012); d += beltBand * 0.006 * (1 - mant); }
    const r = R + d;
    const cc = center(t);
    // baked cavity: the valleys of the folds hold shadow
    const foldH = Math.pow(f1, 0.7) * 0.72 + f2 * 0.28;
    const cav = clamp((0.5 + 0.5 * lerp(1, foldH, lower)) * (1 - swagW * 0.4 * (1 - swag)) - gauss((t - edge) / 0.016) * 0.26 + backF * 0.0, 0.3, 1);
    return [cc[0] + r * c, t * yN, cc[1] + r * s, cav * (0.78 + 0.22 * sstep(0, 0.16, t))];
  }, nu, nv, { flip: true, wrapU: true, boxUV: true });

  const top = center(1);
  // Neck and head with a gentle incline
  const hx = top[0] + 0.02, hz = top[1] + sw * 0.018, hy = yN + 0.135;
  stone.tube([[top[0] - 0.005, yN - 0.06, top[1]], [hx - 0.006, yN + 0.06, hz]], (t) => lerp(0.052, 0.046, t), lod ? 10 : 5, { capEnd: false });
  const headM = M.of(M.T(hx, hy, hz), M.Rx(sw * 7), M.Rz(-6), M.Ry(sw * 9));
  stone.at(headM, () => {
    addHead(stone, o, lod);
    if (o.veil) addVeil(stone, lod);
    if (o.cap) stone.at(M.T(0, 0.11, 0), () => stone.lathe([[0.086, -0.005, 0.8], [0.09, 0.0], [0.075, 0.05], [0.03, 0.095], [0.0, 0.1]], lod ? 14 : 6));
    if (o.mitre) { // pointed mitre, with gilded bands
      stone.grid((u, v) => { const a = -PI + TAU * u, w = 0.094 * (1 - v * 0.62), h = lerp(0.03, 0.27, v) * (1 - 0.32 * Math.abs(Math.sin(a)) * v) ; return [(0.1 - 0.012 * v) * Math.cos(a) * (1 - v * 0.3), 0.075 + h, w * Math.sin(a) * 0.9]; }, lod ? 18 : 8, lod ? 6 : 3, { flip: true, wrapU: true });
      gold.at(M.T(0, 0.095, 0), () => gold.lathe([[0.1, -0.012], [0.104, 0], [0.1, 0.018]], lod ? 18 : 8));
    }
    if (o.crown) { // gilded crown with fleurons
      gold.at(M.T(0, 0.075, 0), () => {
        const n = lod ? 24 : 8, R0 = o.veil ? 0.122 : 0.098;
        gold.lathe([[R0, 0], [R0 + 0.012, 0.004], [R0 + 0.012, 0.032], [R0 + 0.022, 0.05], [R0 + 0.01, 0.052], [R0 - 0.006, 0.04], [R0 - 0.006, 0]], n);
        if (lod) for (let i = 0; i < 8; i++) { const a = i * PI / 4, cx = (R0 + 0.014) * Math.cos(a), cz = (R0 + 0.014) * Math.sin(a); gold.tube([[cx, 0.04, cz], [cx * 1.03, 0.085, cz * 1.03], [cx * 1.1, 0.13, cz * 1.1]], (t) => [lerp(0.024, 0.003, t), lerp(0.024, 0.003, t) * 0.5], 5, { capStart: false }); blob(gold, [cx * 1.11, 0.135, cz * 1.11], [0.011, 0.011, 0.011], 5, 3); }
      });
    }
    if (o.nimbus) { // gilded disc behind the head of Christ
      gold.at(M.of(M.T(-0.13, 0.02, 0), M.Ry(90)), () => gold.slab(ringPts(0, 0, 0.21, lod ? 28 : 12), [], -0.012, 0.012, { sb: 0.8 }));
    }
  });

  // ---- arms ----
  const Rshoulder = 0.145 * slim * broad;
  const arm = (side, pts, cuff = 0.074) => {
    const path = spline(pts, lod ? 3 : 1);
    stone.tube(path, (t) => { const r = lerp(0.048, cuff, sstep(0.1, 0.85, t)) * (t > 0.93 ? lerp(1, 0.62, (t - 0.93) / 0.07) : 1); return [r * lerp(1, 1.28, sstep(0.3, 0.9, t)), r]; }, lod ? 10 : 5, {
      capStart: false,
      capEnd: true,
      ring: (a, t) => 1 + 0.13 * Math.abs(Math.sin(a * 2.5 + t * 4 + side)) * sstep(0.1, 0.5, t),
      ringS: (a, t) => (0.7 + 0.3 * Math.abs(Math.sin(a * 2.5 + t * 4 + side))) * (t > 0.96 ? 0.6 : 1),
    });
    return path[path.length - 1];
  };
  const hand = (p, r = 0.8) => {
    blob(stone, [p[0] + 0.02, p[1], p[2]], [0.05 * r, 0.032 * r, 0.05 * r], lod ? 6 : 4, lod ? 4 : 2);
    if (lod) for (let i = -1; i <= 1; i++) stone.tube([[p[0] + 0.045 * r, p[1], p[2] + i * 0.016 * r], [p[0] + 0.1 * r, p[1] - 0.018 * r, p[2] + i * 0.02 * r]], (t) => lerp(0.013, 0.008, t) * r, 3);
  };
  const y = yN - 0.17;
  const sR = [top[0], y, top[1] + Rshoulder], sL = [top[0], y, top[1] - Rshoulder];
  switch (o.hold) {
    case 'book': case 'bookOpen': {
      const eR = [0.04, 1.19, Rshoulder + 0.07], eL = [0.03, 1.15, -Rshoulder - 0.08];
      hand(arm(1, [sR, eR, [0.2, 1.3, 0.11]]));
      hand(arm(-1, [sL, eL, [0.2, 1.24, -0.07]]));
      break;
    }
    case 'key': hand(arm(1, [sR, [0.03, 1.14, Rshoulder + 0.08], [0.21, 1.37, 0.12]])); hand(arm(-1, [sL, [0.0, 1.06, -Rshoulder - 0.05], [0.14, 0.86, -Rshoulder - 0.03]])); break;
    case 'sword': hand(arm(1, [sR, [0.04, 1.12, Rshoulder + 0.06], [0.22, 1.28, 0.16]])); hand(arm(-1, [sL, [0.03, 1.16, -Rshoulder - 0.07], [0.2, 1.3, -0.08]])); stone.at(M.of(M.T(0.2, 1.36, -0.1), M.Rz(-50)), () => stone.box(-0.012, 0.012, -0.11, 0.11, -0.08, 0.08, { s: 0.85 })); break;
    case 'crozier': case 'sceptre': hand(arm(1, [sR, [0.05, 1.18, Rshoulder + 0.09], [0.24, 1.26, 0.19]])); hand(arm(-1, [sL, [0.02, 1.13, -Rshoulder - 0.06], [0.17, 1.12, -0.05]])); break;
    case 'palm': hand(arm(1, [sR, [0.03, 1.1, Rshoulder + 0.06], [0.21, 1.14, 0.15]])); hand(arm(-1, [sL, [0.03, 1.14, -Rshoulder - 0.06], [0.2, 1.22, -0.06]])); break;
    case 'scroll': hand(arm(1, [sR, [0.04, 1.2, Rshoulder + 0.05], [0.21, 1.4, 0.0]])); hand(arm(-1, [sL, [0.04, 1.02, -Rshoulder - 0.06], [0.22, 0.88, -0.06]])); break;
    case 'orb': hand(arm(1, [sR, [0.05, 1.12, Rshoulder + 0.08], [0.23, 1.22, 0.14]])); hand(arm(-1, [sL, [0.02, 1.13, -Rshoulder - 0.06], [0.17, 1.12, -0.05]])); break;
    case 'child': hand(arm(-1, [sL, [0.06, 1.14, -Rshoulder - 0.04], [0.21, 1.16, -0.09]])); hand(arm(1, [sR, [0.05, 1.12, Rshoulder + 0.03], [0.22, 1.3, 0.04]])); break;
    case 'bless': hand(arm(1, [sR, [0.08, 1.22, Rshoulder + 0.09], [0.21, 1.56, 0.17]])); hand(arm(-1, [sL, [0.04, 1.13, -Rshoulder - 0.07], [0.22, 1.2, -0.06]])); stone.at(M.of(M.T(0.27, 1.24, -0.06), M.Rz(-58)), () => stone.box(-0.015, 0.015, -0.12, 0.12, -0.085, 0.085, { s: 0.85 })); break;
    case 'censer': hand(arm(1, [sR, [0.04, 1.1, Rshoulder + 0.05], [0.26, 1.22, 0.13]])); hand(arm(-1, [sL, [0.03, 1.08, -Rshoulder - 0.05], [0.22, 1.2, -0.12]])); break;
    default: hand(arm(1, [sR, [0.02, 1.08, Rshoulder + 0.05], [0.12, 0.86, Rshoulder - 0.04]])); hand(arm(-1, [sL, [0.02, 1.08, -Rshoulder - 0.05], [0.12, 0.86, -Rshoulder + 0.04]])); break;
  }
  addAttribute(stone, gold, o.hold, lod, yN);
  if (o.wings) { addWing(stone, 1, lod); addWing(stone, -1, lod); }
  // Feet emerge beneath the hem
  if (lod) { for (const s of [-1, 1]) stone.at(M.T(0.2, 0.04, s * 0.085), () => stone.at(M.Rz(-6), () => blob(stone, [0, 0, 0], [0.105, 0.05, 0.05], 8, 5, 0.86))); }
  return { stone, gold };
}

// Cache of shared figure geometry; figures placed on a parent frame
const FIG_CACHE = {};
function figure(name, lod = 1) { const k = name + '|' + lod; if (!FIG_CACHE[k]) FIG_CACHE[k] = makeFigure(name, lod); return FIG_CACHE[k]; }
function placeFigure(name, kind, o = {}) {
  const f = figure(kind, o.lod === undefined ? 1 : o.lod);
  const s = o.scale || 1, sc = [s, s, s];
  const stone = place(name, f.stone, o.indoor ? MAT.fineDim : MAT.fine, { pos: o.pos, rot: o.rot, scale: sc, parent: o.parent });
  place(name + '_Gilt', f.gold, MAT.gold, { pos: o.pos, rot: o.rot, scale: sc, parent: o.parent });
  return stone;
}

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
  raw(pts, color, layer, jitter = 1) {
    const idx = PAL[color], n = PALETTE_COLS, cell = 1 / n;
    const cu = ((idx % n) + 0.5) * cell, cv = (Math.floor(idx / n) + 0.5) * cell;
    const ou = (this.r() - 0.5) * cell * 0.55 * jitter, ov = (this.r() - 0.5) * cell * 0.55 * jitter, sc = cell * 0.09;
    const z = 0.002 + layer * 0.0035;
    let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
    // UVs stay inside the swatch: a small gradient across the pane, relative to its own centre
    const clampU = (d) => clamp(d * sc * 0.4, -cell * 0.14, cell * 0.14);
    const ids = pts.map((p) => this.b.v(p[0], p[1], z, 0, 0, 1, cu + ou + clampU(p[0] - mx), cv + ov + clampU(p[1] - my), 1));
    if (isConvex(pts)) { const flip = area2(pts) < 0; for (let i = 1; i < ids.length - 1; i++) { if (flip) this.b.tri(ids[0], ids[i + 1], ids[i]); else this.b.tri(ids[0], ids[i], ids[i + 1]); } } else { const t = triangulate(pts); for (const k of t) this.b.tri(ids[k[0]], ids[k[1]], ids[k[2]]); }
  }
  // a pane: colour polygon + lead came under it
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
    if (P2.length >= 3 && Math.abs(area2(P2)) > 1e-5) this.raw(P2, color, layer, o.jitter === undefined ? 1 : o.jitter);
    return this;
  }
  disc(cx, cy, r, color, layer = 1, n = 12, o) { return this.poly(ringPts(cx, cy, r, n), color, layer, o); }
  // painted line (grisaille): a thin dark ribbon along a polyline
  line(pts, w = 0.02, color = 'paint', layer = 5) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx *= w / 2 / l; dy *= w / 2 / l;
      this.poly([[a[0] - dy, a[1] + dx], [a[0] + dy, a[1] - dx], [b[0] + dy, b[1] - dx], [b[0] - dy, b[1] + dx]], color, layer, { came: 0, jitter: 0 });
    }
    return this;
  }
}

// Diapered mosaic background: lozenges alternating two colours with a jewel at each crossing
function gDiaper(g, x0, y0, x1, y1, cell, c1, c2, c3, layer = 0) {
  const h = cell / 2;
  let row = 0;
  for (let y = y0 - cell; y < y1 + cell; y += h) {
    const ofs = (row % 2) * h;
    for (let x = x0 - cell + ofs; x < x1 + cell; x += cell) {
      const col = (row % 4 < 2) ? c1 : c2;
      g.poly([[x, y - h], [x + h, y], [x, y + h], [x - h, y]], col, layer, { came: -0.016 });
      if (c3 && row % 4 === 0) g.poly([[x + h, y - h * 0.26], [x + h * 1.26, y], [x + h, y + h * 0.26], [x + h * 0.74, y]], c3, layer + 0.6, { came: 0.01 });
    }
    row++;
  }
}

// A figure in glass. (x,y) = feet, h = height. Pose: 'stand' | 'sit' | 'kneel'.
function gFigure(g, x, y, h, o = {}) {
  // sx < 1 elongates the body in the Gothic manner: width scales down, the head keeps its proportion
  const sx = o.sx || 1, hTot = h; h = hTot * sx;
  const f = o.flip ? -1 : 1, L = (u, v) => [x + f * u * h, y + (v <= 0.76 ? v / 0.76 * (hTot - 0.24 * h) : hTot - (1 - v) * h)], PS = (a) => a.map((p) => L(p[0], p[1]));
  const robe = o.robe || 'white', mantle = o.mantle || 'cobalt', skin = o.skin || 'flesh', hair = o.hair || 'hair', big = hTot > 2.2, layer = o.layer === undefined ? 2 : o.layer;
  const sit = o.pose === 'sit', kneel = o.pose === 'kneel';
  const hy = kneel ? 0.67 : sit ? 0.86 : 0.875, hr = 0.066, hx = kneel ? 0.04 : 0;
  if (o.wings) {
    g.poly(PS([[-0.08, hy - 0.1], [-0.34, hy + 0.08], [-0.42, hy - 0.12], [-0.34, 0.34], [-0.1, 0.46]]), o.wings, layer - 0.2);
    g.poly(PS([[0.08, hy - 0.1], [0.3, hy + 0.1], [0.38, hy - 0.1], [0.3, 0.36], [0.1, 0.48]]), o.wings, layer - 0.2);
    if (h > 1) { g.line(PS([[-0.1, hy - 0.08], [-0.34, 0.5]]), h * 0.012); g.line(PS([[0.1, hy - 0.08], [0.31, 0.5]]), h * 0.012); }
  }
  if (o.halo !== false) {
    g.disc(L(hx, hy)[0], L(hx, hy)[1], h * 0.112, o.halo || 'gold', layer - 0.1, big ? 18 : 12);
    if (o.cross) { for (let i = 0; i < 3; i++) { const a = PI / 2 + i * PI / 2 - PI / 2 * 1; g.poly(PS([[hx + 0.112 * Math.cos(a - 0.26), hy + 0.112 * Math.sin(a - 0.26)], [hx + 0.112 * Math.cos(a + 0.26), hy + 0.112 * Math.sin(a + 0.26)], [hx, hy]]), 'ruby', layer, { came: 0.008 }); } }
  }
  // ---- body ----
  if (sit) {
    g.poly(PS([[-0.12, 0.72], [0.12, 0.72], [0.19, 0.44], [0.26, 0.4], [0.27, 0.08], [0.22, 0.0], [-0.22, 0.0], [-0.2, 0.3], [-0.14, 0.44]]), robe, layer);
    g.poly(PS([[-0.13, 0.74], [0.05, 0.74], [0.17, 0.46], [0.24, 0.4], [0.2, 0.18], [-0.06, 0.1], [-0.2, 0.3], [-0.14, 0.46]]), mantle, layer + 0.5);
    if (h > 0.9) g.line(PS([[-0.08, 0.66], [0.14, 0.4]]), h * 0.011), g.line(PS([[-0.14, 0.42], [0.2, 0.26]]), h * 0.011), g.line(PS([[-0.12, 0.3], [0.16, 0.16]]), h * 0.011);
  } else if (kneel) {
    g.poly(PS([[-0.08, 0.56], [0.13, 0.56], [0.16, 0.26], [0.26, 0.1], [0.26, 0], [-0.26, 0], [-0.2, 0.12]]), robe, layer);
    g.poly(PS([[-0.09, 0.57], [0.08, 0.57], [0.13, 0.28], [0.1, 0.1], [-0.2, 0.05], [-0.16, 0.24]]), mantle, layer + 0.5);
  } else {
    const c = o.sway === undefined ? 0.02 : o.sway;
    g.poly(PS([[-0.11 + c, 0.75], [0.11 + c, 0.75], [0.13, 0.46], [0.16, 0.2], [0.22, 0.03], [0.17, 0.0], [0.05, 0.02], [-0.05, 0.0], [-0.18, 0.01], [-0.22, 0.04], [-0.16, 0.22], [-0.13, 0.46]]), robe, layer);
    g.poly(PS([[-0.12 + c, 0.76], [0.03 + c, 0.76], [0.13, 0.5], [0.15, 0.28], [0.1, 0.14], [-0.06, 0.1], [-0.18, 0.2], [-0.14, 0.46]]), mantle, layer + 0.5);
    if (h > 0.9) { g.line(PS([[-0.07, 0.7], [0.1, 0.42]]), h * 0.009); g.line(PS([[-0.1, 0.5], [0.13, 0.28]]), h * 0.009); g.line(PS([[-0.13, 0.34], [0.05, 0.14]]), h * 0.009); g.line(PS([[0.17, 0.2], [0.15, 0.02]]), h * 0.008); g.line(PS([[-0.13, 0.2], [-0.15, 0.03]]), h * 0.008); }
    if (big) { g.line(PS([[0.06, 0.72], [0.12, 0.5]]), h * 0.008); g.line(PS([[-0.05, 0.45], [-0.09, 0.14]]), h * 0.008); g.line(PS([[0.04, 0.42], [0.05, 0.12]]), h * 0.008); g.line(PS([[-0.16, 0.1], [0.16, 0.08]]), h * 0.006, 'lead'); g.line(PS([[-0.13, 0.4], [0.14, 0.4]]), h * 0.006, 'lead'); g.line(PS([[-0.11, 0.6], [0.12, 0.6]]), h * 0.006, 'lead'); }
    g.poly(PS([[-0.1, 0.03], [-0.02, 0.03], [-0.02, -0.01], [-0.12, -0.01]]), o.shoe || 'brown', layer + 0.2, { came: 0.008 });
    g.poly(PS([[0.02, 0.03], [0.1, 0.03], [0.12, -0.01], [0.02, -0.01]]), o.shoe || 'brown', layer + 0.2, { came: 0.008 });
  }
  // ---- arms and hands ----
  const by = kneel ? 0.5 : 0.68, armPose = o.arm || 'hold';
  const ribbon = (a, b, w, col) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2; g.poly(PS([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]), col, layer + 1, { came: 0.012 }); };
  const hand = (p) => g.disc(L(p[0], p[1])[0], L(p[0], p[1])[1], h * 0.024, skin, layer + 1.3, 6, { came: 0.008 });
  const arms = { hold: [[0.13, by - 0.12], [0.03, by - 0.18], [-0.13, by - 0.12], [-0.03, by - 0.2]], up: [[0.17, by - 0.03], [0.27, by + 0.18], [-0.12, by - 0.12], [-0.03, by - 0.22]], out: [[0.19, by - 0.08], [0.32, by - 0.06], [-0.19, by - 0.08], [-0.32, by - 0.06]], pray: [[0.1, by - 0.14], [0.12, by - 0.03], [-0.04, by - 0.14], [0.1, by - 0.03]], point: [[0.17, by - 0.08], [0.33, by + 0.04], [-0.12, by - 0.12], [-0.04, by - 0.2]], orant: [[0.2, by + 0.0], [0.27, by + 0.14], [-0.2, by + 0.0], [-0.27, by + 0.14]] };
  const A = arms[armPose] || arms.hold;
  ribbon([0.1, by], A[0], 0.075, mantle); ribbon(A[0], A[1], 0.06, robe); hand(A[1]);
  ribbon([-0.1, by], A[2], 0.075, mantle); ribbon(A[2], A[3], 0.06, robe); hand(A[3]);
  // ---- attributes ----
  const at = o.attr;
  if (at === 'book') { g.poly(PS([[A[1][0] - 0.1, A[1][1] - 0.02], [A[1][0] + 0.02, A[1][1] - 0.02], [A[1][0] + 0.02, A[1][1] + 0.12], [A[1][0] - 0.1, A[1][1] + 0.12]]), 'ruby', layer + 1.5, { came: 0.01 }); g.poly(PS([[A[1][0] - 0.07, A[1][1] + 0.03], [A[1][0] - 0.01, A[1][1] + 0.03], [A[1][0] - 0.01, A[1][1] + 0.09], [A[1][0] - 0.07, A[1][1] + 0.09]]), 'gold', layer + 1.6, { came: 0 }); }
  else if (at === 'staff' || at === 'cross') { const sx = A[1][0]; g.poly(PS([[sx - 0.012, 0], [sx + 0.012, 0], [sx + 0.012, 1.08], [sx - 0.012, 1.08]]), 'gold', layer + 0.9, { came: 0.008 }); if (at === 'cross') g.poly(PS([[sx - 0.07, 0.95], [sx + 0.07, 0.95], [sx + 0.07, 0.98], [sx - 0.07, 0.98]]), 'gold', layer + 0.9, { came: 0.008 }); else g.poly(ringPts(sx + 0.03, 1.1, 0.045, 8).map((p) => L(p[0], p[1])), 'gold', layer + 0.9, { came: 0.008 }); }
  else if (at === 'sword') { const sx = A[1][0]; g.poly(PS([[sx - 0.012, by - 0.08], [sx + 0.012, by - 0.08], [sx, 1.02]]), 'pale', layer + 0.9, { came: 0.008 }); g.poly(PS([[sx - 0.05, by - 0.08], [sx + 0.05, by - 0.08], [sx + 0.05, by - 0.05], [sx - 0.05, by - 0.05]]), 'gold', layer + 1, { came: 0.008 }); }
  else if (at === 'key') { const sx = A[1][0]; g.poly(PS([[sx - 0.01, by - 0.14], [sx + 0.01, by - 0.14], [sx + 0.01, by + 0.2], [sx - 0.01, by + 0.2]]), 'gold', layer + 1, { came: 0.006 }); g.poly(ringPts(sx, by + 0.23, 0.035, 6).map((p) => L(p[0], p[1])), 'gold', layer + 1, { came: 0.006 }); g.poly(PS([[sx, by - 0.14], [sx + 0.05, by - 0.14], [sx + 0.05, by - 0.1], [sx, by - 0.1]]), 'gold', layer + 1, { came: 0.006 }); }
  else if (at === 'lily') { const sx = A[1][0]; g.line(PS([[sx, by - 0.22], [sx + 0.01, by + 0.2]]), h * 0.012, 'green', layer + 1); for (let i = 0; i < 3; i++) { const yy = by + 0.08 + i * 0.07; g.disc(L(sx + 0.02 * (i % 2 ? 1 : -1), yy)[0], L(0, yy)[1], h * 0.024, 'white', layer + 1.1, 5, { came: 0.006 }); } }
  // ---- head ----
  const hc = L(hx, hy);
  g.poly(PS([[hx - 0.022, hy - 0.12], [hx + 0.022, hy - 0.12], [hx + 0.022, hy - 0.04], [hx - 0.022, hy - 0.04]]), skin, layer + 1.5, { came: 0.008 });
  if (o.veil) g.poly(PS([[hx - 0.092, hy + 0.03], [hx - 0.05, hy + 0.09], [hx + 0.05, hy + 0.09], [hx + 0.09, hy + 0.03], [hx + 0.1, hy - 0.08], [hx + 0.06, hy - 0.15], [hx - 0.06, hy - 0.15], [hx - 0.1, hy - 0.08]]), o.veil, layer + 1.55, { came: 0.01 });
  g.disc(hc[0], hc[1], h * hr, skin, layer + 1.8, big ? 12 : 8, { came: 0.01 });
  if (!o.veil) g.poly(PS([[hx - 0.07, hy + 0.012], [hx - 0.05, hy + 0.06], [hx, hy + 0.078], [hx + 0.05, hy + 0.06], [hx + 0.07, hy + 0.012], [hx + 0.045, hy + 0.03], [hx - 0.045, hy + 0.03]]), hair, layer + 2, { came: 0.008 });
  if (o.beard) g.poly(PS([[hx - 0.056, hy - 0.02], [hx - 0.03, hy - 0.04], [hx + 0.03, hy - 0.04], [hx + 0.056, hy - 0.02], [hx + 0.03, hy - (o.beard === 2 ? 0.17 : 0.11)], [hx - 0.03, hy - (o.beard === 2 ? 0.17 : 0.11)]]), o.beardCol || hair, layer + 2, { came: 0.008 });
  if (o.crown) { g.poly(PS([[hx - 0.075, hy + 0.04], [hx + 0.075, hy + 0.04], [hx + 0.09, hy + 0.13], [hx + 0.04, hy + 0.09], [hx, hy + 0.14], [hx - 0.04, hy + 0.09], [hx - 0.09, hy + 0.13]]), 'gold', layer + 2.2, { came: 0.01 }); }
  if (o.mitre) g.poly(PS([[hx - 0.06, hy + 0.04], [hx + 0.06, hy + 0.04], [hx + 0.05, hy + 0.15], [hx, hy + 0.21], [hx - 0.05, hy + 0.15]]), o.mitre, layer + 2.2, { came: 0.01 });
  if (h > 0.75) { // grisaille face
    const lw = h * (big ? 0.0065 : 0.009);
    g.line(PS([[hx - 0.042, hy + 0.012], [hx - 0.012, hy + 0.012]]), lw); g.line(PS([[hx + 0.012, hy + 0.012], [hx + 0.042, hy + 0.012]]), lw);
    g.line(PS([[hx - 0.003, hy + 0.012], [hx + 0.006, hy - 0.022]]), lw * 0.8); g.line(PS([[hx - 0.018, hy - 0.038], [hx + 0.018, hy - 0.038]]), lw * 0.8);
    if (big) { g.line(PS([[hx - 0.044, hy + 0.024], [hx - 0.012, hy + 0.024]]), lw * 0.8); g.line(PS([[hx + 0.012, hy + 0.024], [hx + 0.044, hy + 0.024]]), lw * 0.8); }
  }
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
function gBust(g, x, y, h, o = {}) { // head and shoulders
  const L = o.layer || 2;
  if (o.halo !== false) g.disc(x, y + h * 0.56, h * 0.17, o.halo || 'gold', L - 0.1, 10);
  g.poly([[x - h * 0.2, y - h * 0.3], [x + h * 0.2, y - h * 0.3], [x + h * 0.17, y + h * 0.3], [x + h * 0.06, y + h * 0.42], [x - h * 0.06, y + h * 0.42], [x - h * 0.17, y + h * 0.3]], o.robe || 'ruby', L);
  g.disc(x, y + h * 0.56, h * 0.105, 'flesh', L + 0.4, 8, { came: 0.01 });
  g.poly([[x - h * 0.11, y + h * 0.57], [x - h * 0.07, y + h * 0.66], [x + h * 0.07, y + h * 0.66], [x + h * 0.11, y + h * 0.57], [x + h * 0.07, y + h * 0.6], [x - h * 0.07, y + h * 0.6]], o.hair || 'hair', L + 0.6, { came: 0.008 });
  if (o.beard) g.poly([[x - h * 0.08, y + h * 0.53], [x + h * 0.08, y + h * 0.53], [x + h * 0.05, y + h * 0.38], [x - h * 0.05, y + h * 0.38]], o.beardCol || o.hair || 'hair', L + 0.6, { came: 0.008 });
  if (o.cross) for (let i = 0; i < 3; i++) { const a = i * PI / 2; g.poly([[x + h * 0.17 * Math.cos(a - 0.24), y + h * 0.56 + h * 0.17 * Math.sin(a - 0.24)], [x + h * 0.17 * Math.cos(a + 0.24), y + h * 0.56 + h * 0.17 * Math.sin(a + 0.24)], [x, y + h * 0.56]], 'ruby', L + 0.2, { came: 0.008 }); }
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
  const c1 = o.c1 || 'ruby', c2 = o.c2 || 'cobalt', edge = o.edge || ['gold', 'white', 'rubyLt', 'white'];
  const arc = pointedArc(w, rise, 8).map((p) => [x + p[0], ys + p[1]]);
  const outline = [[x - w / 2, y0], [x + w / 2, y0], ...arc.slice().reverse().slice(0)];
  g.withClip(outline, () => {
    gDiaper(g, x - w / 2, y0, x + w / 2, ys + rise, o.cell || 0.6, c1, c2, 'gold');
    const H = ys + rise * 0.5 - y0, N = scenes.length, step = H / N, R = Math.min(w * 0.44, step * 0.47);
    scenes.forEach((nm, i) => {
      const cy = y0 + step * (i + 0.5);
      const ground = (i % 2) ? (o.g1 || 'cobalt') : (o.g2 || 'ruby');
      gRim(g, x, cy, R, R * 1.09, ['gold', 'white', 'rubyLt', 'white', 'azure', 'white'], 18, 1);
      g.disc(x, cy, R, ground, 1.3, 18, { came: 0 });
      g.withClip(ringPts(x, cy, R, 14), () => g.withXf(0, x, cy, 1, () => SCENES[nm](g, R)));
      if (i < N - 1) { const yy = y0 + step * (i + 1); for (const s of [-1, 1]) { g.disc(x + s * w * 0.31, yy, w * 0.1, 'gold', 1.2, 8); g.disc(x + s * w * 0.31, yy, w * 0.055, 'emerald', 1.5, 6, { came: 0.01 }); } }
    });
    // Border bricks follow the outline
    const bw = w * 0.085, stepB = 0.56;
    const stripe = (x0, y1, y2) => { let k = 0; g.poly([[x0, y1], [x0 + bw, y1], [x0 + bw, y2], [x0, y2]], 'lead', 3.5, { came: 0, jitter: 0 }); for (let y = y1; y < y2; y += stepB) g.poly([[x0, y], [x0 + bw, y], [x0 + bw, y + stepB], [x0, y + stepB]], edge[k++ % edge.length], 3.8, { came: -0.014 }); };
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
    g.poly([[x - w * 0.46, y0 + 0.62], [x + w * 0.46, y0 + 0.62], [x + w * 0.46, y0 + 1.02], [x - w * 0.46, y0 + 1.02]], 'gold', 1.6);
    for (let i = 0; i < 6; i++) g.line([[x - w * 0.34 + i * w * 0.13, y0 + 0.28], [x - w * 0.3 + i * w * 0.13, y0 + 0.44]], 0.035, 'paint', 2);
    // Canopy: gable, pinnacles, little windows
    const cy = figY + figH + 0.02, cH = ys + rise * 0.86 - cy;
    g.poly([[x - w * 0.48, cy], [x + w * 0.48, cy], [x + w * 0.48, cy + cH * 0.36], [x - w * 0.48, cy + cH * 0.36]], 'white', 1.6);
    g.poly([[x - w * 0.42, cy + cH * 0.34], [x + w * 0.42, cy + cH * 0.34], [x, cy + cH]], 'yellow', 1.7);
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
  }, nS, nT, { flip: cross < 0 });
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
function bayShade(x, y, z, nx, ny, nz, b) { // baked light: dim warm interior, weathered exterior
  const px = z + nz * 0.3, py = y + ny * 0.3;
  const inside = (py < P.aisleWallTop - 0.3 && px < zaw) || (px < zn && py < P.eaves + 0.5);
  if (inside) {
    b.rgb = [1, 0.965, 0.915];
    let s = 0.38 + 0.3 * sstep(0, 34, y);
    if (ny < -0.45) s *= 0.8;
    if (ny > 0.6) s *= 1.15;
    return s;
  }
  b.rgb = [1, 0.99, 0.965];
  let s = lerp(0.68, 1, sstep(0, 7, y));
  if (ny < -0.4) s *= 0.55;
  return s * (0.94 + 0.06 * Math.sin(x * 1.7 + y * 0.31));
}
const mkBatches = () => ({ A: new Batch(TILE.ashlar), F: new Batch(TILE.fine), L: new Batch(TILE.lead), G: new Batch(TILE.gold), C: new Batch(TILE.carved), O: new Batch(TILE.oak), I: new Batch(TILE.iron) });
function placeSet(name, set, pos, rot, parent, extra = {}) {
  const o = { pos, rot: [0, rot, 0], parent, scale: extra.scale };
  place(name + '_Ashlar', set.A, MAT.ashlar, o);
  place(name + '_Stone', set.F, MAT.fine, o);
  place(name + '_Carved', set.C, MAT.carved, o);
  place(name + '_Lead', set.L, MAT.lead, o);
  place(name + '_Gilt', set.G, MAT.gold, o);
  place(name + '_Oak', set.O, MAT.oak, o);
  place(name + '_Iron', set.I, MAT.iron, o);
}
// Glass pair: interior face + the same panes mirrored as the exterior face
function placeGlass(name, batch, pos, rotY, parent) {
  place(name + '_In', batch, MAT.glassIn, { pos, rot: [0, rotY, 0], parent });
  place(name + '_Out', batch, MAT.glassOut, { pos, rot: [0, rotY, 0], scale: [1, 1, -1], parent });
}

function buildNaveBay(o = {}) {
  const set = o.into || mkBatches(), { A, F, L, G } = set;
  const shadeFn = o.shade || bayShade;
  A.fn = shadeFn; F.fn = shadeFn; L.fn = (x, y) => 0.86 + 0.14 * sstep(20, 45, y);
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
  F.fn = bayShade; A.fn = bayShade;
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
// Flying buttress unit at a bay boundary: massive pier, two arched flyers, tabernacle and pinnacles
function flyerShape(zA, yA, zB, yB, thick) { // A at the pier (outer), B at the wall (inner); returns polygon points in (z,y)
  const N = 12, under = [], top = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = lerp(zA, zB, t), y = yA + (yB - yA) * Math.sin(t * PI / 2);
    under.push([z, y]);
  }
  const topA = [zA - 0.05, yA + thick * 2.05], topB = [zB, yB + thick * 0.6];
  return { under, topA, topB };
}
function buildButtress() {
  const set = mkBatches(), { A, F, G } = set;
  A.fn = bayShade; F.fn = bayShade;
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
  // Two flyers. Each is a pierced plate, with a coping and crockets along the top
  const fly = (zA, yA, zB, yB, th) => {
    const { under, topA, topB } = flyerShape(zA, yA, zB, yB, th);
    const outline = [...under, topB, topA];
    const holes = [];
    // Openwork roundels in the spandrel of each flyer
    [0.28, 0.46, 0.62].forEach((t) => { const z = lerp(zA, zB, t), yu = yA + (yB - yA) * Math.sin(t * PI / 2), yt = lerp(topA[1], topB[1], t), r = (yt - yu) * 0.26; if (r > 0.14) holes.push(ringPts(z, (yu + yt) / 2, r, 10)); });
    F.at(M.Ry(-90), () => {
      F.slab(outline, holes, -0.4, 0.4, { sr: 0.62, so: 0.7 });
      // Coping along the top with a channel, crockets marching up
      F.sweep([topA, topB], barSection(0.2, 1.0), { z: 0, s: 1.0 });
    });
    const n = Math.round(Math.hypot(topA[0] - topB[0], topA[1] - topB[1]) / 1.0);
    crocketsAlong(F, [0, topA[1] + 0.1, topA[0]], [0, topB[1] + 0.1, topB[0]], n, 0.62, [0, 1, 0], 0);
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
function floorShade(x, y, z, nx, ny, nz, b) { b.rgb = [1, 0.95, 0.88]; return 0.52; }

function buildVaultNave() {
  const s = mkBatches(); s.A.fn = bayShade; s.F.fn = bayShade;
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
function chevetShade(x, y, z, nx, ny, nz, b) {
  const px = x + nx * 0.3, py = y + ny * 0.3, pz = z + nz * 0.3, inHem = pz < CHEV.Ra && py < P.eaves + 0.5;
  const inAmb = pz < CHEV.Ro && py < P.aisleWallTop - 0.3;
  // the chapel itself, and the neck leading into it from the ambulatory
  const inCh = (Math.hypot(px, pz - CHEV.zc) < CHEV.Rc || (pz < CHEV.zc && pz >= CHEV.Ro && Math.abs(px) < 2.25)) && py < 15.8;
  if (inHem || inAmb || inCh) {
    b.rgb = [1, 0.95, 0.87];
    let s = 0.36 + 0.28 * sstep(0, 34, y);
    if (ny < -0.45) s *= 0.8;
    if (ny > 0.6) s *= 1.15;
    return s;
  }
  b.rgb = [1, 0.99, 0.965];
  let s = lerp(0.68, 1, sstep(0, 7, y));
  if (ny < -0.4) s *= 0.55;
  return s;
}
function buildChevetSector() {
  const set = mkBatches(), { A, F, L, G } = set, { Ra, hs, Ro, hso, Rc, zc } = CHEV;
  buildNaveBay({ into: set, part: 'upper', B: 2 * hs, zw: Ra, ww: 1.62, archRise: 5.0, nT: 2, tw: 1.05, cw: 2.05, cRise: 4.3, lights: 1, shade: chevetShade });
  A.fn = chevetShade; F.fn = chevetShade; L.fn = (x, y) => 0.86 + 0.14 * sstep(14, 45, y);
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
  const set = mkBatches(), { F } = set; F.fn = bayShade;
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
  const set = mkBatches(), { F } = set; F.fn = bayShade;
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
  L.fn = () => 0.9;
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
  const b = new Batch(1); b.noColor = true;
  const rng = mkRng(99), cols = ['ruby', 'cobalt', 'gold', 'rubyLt', 'azure', 'emerald', 'cobalt', 'ruby', 'white', 'amber'];
  const sill = WIN.aSill, sp = WIN.aSp, rise = WIN.aRise, w = WIN.aW, cw = 0.58, ch = 0.92;
  const c = pointedArc(w, rise, 6);
  const halfAt = (v) => { if (v <= sp) return w / 2; const t = (v - sp) / rise; return (w / 2) * Math.sqrt(Math.max(0, 1 - t * t)); };
  for (const xw of xs) {
    for (let v = sill; v < sp + rise; v += ch) {
      const h0 = halfAt(v), h1 = halfAt(v + ch);
      for (let u = -w / 2; u < w / 2 - 1e-3; u += cw) {
        if (Math.abs(u) > h0 || Math.abs(u + cw) > h0) continue;
        if (Math.abs(u + cw / 2) < 0.16) continue; // the mullion throws a shadow
        const col = cols[Math.floor(rng() * cols.length)], idx = PAL[col], n = PALETTE_COLS, cell = 1 / n;
        const cu = ((idx % n) + 0.5) * cell, cv = (Math.floor(idx / n) + 0.5) * cell;
        const P0 = (uu, vv) => [xw + uu + vv * P.sunShear[0], 0.035, -zaw + vv * P.sunShear[1]];
        const pts = [P0(u, v), P0(u, v + ch * 0.96), P0(u + cw * 0.96, v + ch * 0.96), P0(u + cw * 0.96, v)];
        const ids = pts.map((p) => b.v(p[0], p[1], p[2], 0, 1, 0, cu, cv, 1));
        b.quad(ids[0], ids[1], ids[2], ids[3]);
      }
    }
  }
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
  const statue = (fr, lx, y, lz, kind, faceDeg, scale, parent, indoor = true) => placeFigure('Statue_' + kind + '_' + (counter++), kind, { pos: fr.pos(lx, y, lz), rot: fr.rot(faceDeg), scale, parent, indoor });
  const garg = (fr, lx, y, lz, k, sc, parent) => place('Gargoyle_' + (counter++), gargoyle(k), MAT.fine, { pos: fr.pos(lx, y, lz), rot: fr.rot(-90), scale: [sc, sc, sc], parent });

  // One side of a straight bay: module, vault-side glass, statues, gargoyles
  const placeBay = (name, fr, parent, o = {}) => {
    placeSet(name + '_Upper', bayUp, [fr.ox, 0, fr.oz], fr.th, parent);
    if (!o.noVault) placeSet(name + '_Aisle', o.open ? aisleOpen : aisleFull, [fr.ox, 0, fr.oz], fr.th, parent);
    const c = cleres[(o.i || 0) % cleres.length];
    placeGlass(name + '_Clerestory', c, fr.pos(0, 0, zn), fr.th + 180, parent);
    if (!o.open) {
      placeGlass(name + '_AisleWindow', stories[(o.i || 0) % stories.length], fr.pos(0, 0, zaw + 0.45), fr.th + 180, parent);
      statue(fr, 0, 0.7, zaw - 0.3, SAINTS[(o.i || 0) % SAINTS.length], 90, 0.86, parent);
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
    for (let q = 1; q <= P.transeptBays + 1; q++) {
      const zz = s * (zn + q * BAY);
      placePier('TranseptPier' + tag + q + '_W', frame(90, xc + zn, zz), gT, q <= P.transeptBays ? SAINTS[(q + 2) % SAINTS.length] : null);
      placePier('TranseptPier' + tag + q + '_E', frame(-90, xc - zn, zz), gT, q <= P.transeptBays ? SAINTS[(q + 4) % SAINTS.length] : null);
      if (q === P.transeptBays) { placeButtress('TranseptButtress' + tag + '_W', frame(90 * s, xc, zz), gT, q); placeButtress('TranseptButtress' + tag + '_E', frame(-90 * s, xc, zz), gT, q + 1); }
    }
  }
  // ---- Crossing ----
  const xPier = buildCrossingPier(), aPier = buildAislePier(), xVault = mkBatches(); xVault.A.fn = bayShade; xVault.F.fn = bayShade;
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
  const sector = buildChevetSector();
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
    if (k >= 1) { const bt = -k * CHEV.d; placeButtress('ChevetButtress' + k, frame(bt, xa, 0), gS, k); }
  }
  // ---- Roofs, ridge cresting, floor ----
  const Lr = new Batch(TILE.lead); Lr.fn = (x, y) => 0.84 + 0.16 * sstep(40, 54, y);
  const yE = P.eaves + 0.15, half = zn + 0.72;
  addRoofRun(Lr, xa, LAY.xW - 1.2, half, yE, ridge);
  Lr.at(M.T(xc, 0, 0), () => Lr.at(M.Ry(90), () => addRoofRun(Lr, -(zn + (P.transeptBays + 1) * BAY + 0.4), zn + (P.transeptBays + 1) * BAY + 0.4, half, yE, ridge)));
  place('MainRoof_Lead', Lr, MAT.lead, { parent: gRoof });
  const crest = buildCresting(BAY);
  const nCrest = Math.floor((LAY.xW - 2 - xa) / BAY);
  for (let i = 0; i < nCrest; i++) place('RidgeCresting' + i, crest, MAT.gold, { pos: [xa + (i + 0.5) * BAY, ridge, 0], parent: gRoof });
  for (const s of [1, -1]) for (let q = 0; q < P.transeptBays + 2; q++) { const zz = s * (0.5 + (q + 0.5) * BAY + 3); if (Math.abs(zz) < zn + (P.transeptBays + 1) * BAY) place('TranseptCresting' + (s > 0 ? 'N' : 'S') + q, crest, MAT.gold, { pos: [xc, ridge, zz], rot: [0, 90, 0], parent: gRoof }); }
  buildFleche(gRoof, xc, 0);
  const fl = new Batch(TILE.pave); fl.fn = floorShade;
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
  if (!SHARED.rose) { const b = new Batch(TILE.fine); b.fn = (x, y, z, nx, ny, nz) => (nz < -0.25 ? 0.5 : 0.96); addRoseTracery(b, WF.roseR); SHARED.rose = b; }
  return SHARED.rose;
}
function largePinnacle() {
  if (!SHARED.pin) { const b = new Batch(TILE.fine); b.fn = (x, y, z, nx, ny) => (ny < -0.4 ? 0.6 : 1); addPinnacle(b, 2, 10, { lod: 1 }); SHARED.pin = b; }
  return SHARED.pin;
}
function makeRoseGlass(R, seed, o = {}) {
  const g = new Glass(seed), k = R / 5.5, { r0, rs1, r1, rs2, r2, n1, n2 } = ROSE, inner = o.inner || ['ruby', 'cobalt'], outer = o.outer || ['cobalt', 'ruby', 'emerald'];
  g.raw(ringPts(0, 0, R + 0.08, 48), 'lead', -0.4, 0);
  // The band of roundels
  for (let i = 0; i < n2; i++) {
    const a = i * TAU / n2, b = (i + 1) * TAU / n2;
    g.poly([pol(r2 * k, a), pol(R, a), pol(R, b), pol(r2 * k, b)], i % 2 ? 'ruby' : 'cobalt', 0, { came: -0.02 });
    const c = pol((R / k + r2) / 2 * k, a); g.disc(c[0], c[1], 0.3 * k, i % 2 ? 'gold' : 'emerald', 0.6, 8, { came: 0.012 }); g.disc(c[0], c[1], 0.15 * k, 'white', 1, 6, { came: 0.008 });
  }
  // Outer lights: angels and elders turning about the centre
  for (let i = 0; i < n2; i++) {
    const am = (i + 0.5) * TAU / n2, da = PI / n2 * 0.97, col = outer[i % outer.length];
    const wedge = [pol(r1 * k, am - da), pol(r2 * k, am - da * 0.9), pol(r2 * k, am + da * 0.9), pol(r1 * k, am + da)];
    g.poly(wedge, col, 0, { came: -0.02 });
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
    g.poly(wedge, col, 0, { came: -0.022 });
    g.withClip(wedge, () => {
      // a mosaic ring behind each figure
      const mid = pol((r0 + r1) / 2 * k, am);
      gRim(g, mid[0], mid[1], 0.74 * k, 0.86 * k, ['gold', 'white', 'rubyLt'], 12, 0.8);
      g.withXf(am * 180 / PI - 90, (r0 + 0.2) * k * Math.cos(am), (r0 + 0.2) * k * Math.sin(am), k, () => gFigure(g, 0, 0, 1.56, Object.assign({ pose: 'sit' }, scheme[i % scheme.length])));
    });
  }
  // The centre: Christ in Majesty in a gilded mandorla, the four-square cross behind
  g.disc(0, 0, r0 * k + 0.06, 'lead', 2.6, 16, { came: 0, jitter: 0 });
  g.disc(0, 0, r0 * k, o.centre || 'cobalt', 3, 16, { came: 0 });
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
function westShade(x, y, z, nx, ny, nz, b) {
  const pz = z + nz * 0.3;
  if (pz < -WF.wallT + 0.2 && y < 42 && Math.abs(x) < 13.3) { // the inner face of the west wall
    b.rgb = [1, 0.965, 0.915];
    let s = 0.38 + 0.3 * sstep(0, 34, y);
    if (ny < -0.45) s *= 0.8;
    return s;
  }
  b.rgb = [1, 0.99, 0.965];
  let s = lerp(0.72, 1, sstep(0, 6, y));
  if (ny < -0.4) s *= 0.55;
  return s;
}
function setShade(set, fn) { for (const k of ['A', 'F', 'C', 'O', 'I']) set[k].fn = fn; return set; }
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
      for (let k = 0; k < 7; k++) { const sx = x0 + d * (k + 0.5) * reach / 7; I.box(sx - 0.025, sx + 0.025, y - 0.025, y + 0.025, 0.08, 0.115, { taper: 0.012 }); }
    });
  }
  // Ring handle
  I.shade(0.4, () => I.at(M.of(M.T(x0 + d * (w - 0.3), h * 0.42, 0.11), M.Ry(0)), () => {
    const rg = []; for (let i = 0; i <= 12; i++) { const t = i * TAU / 12; rg.push([0.1 * Math.cos(t), 0.1 * Math.sin(t) - 0.1, 0]); }
    I.tube(rg, 0.018, 5, { capEnd: false }); I.box(-0.05, 0.05, -0.05, 0.05, -0.05, 0, {});
  }));
}
function buildPortal(cfg, kinds, tymp) {
  const set = setShade(mkBatches(), westShade), { A, F, C, G, O, I } = set, { w0, orders: N, dx, dz, ys } = cfg;
  // Every order is concentric: the same two arc centres with the radius growing by one step
  const r0 = w0 * 0.86, c0 = (r0 * r0 - w0 * w0 / 4) / w0, wT = (i) => w0 + 2 * i * dx, zT = (i) => i * dz;
  const riseI = (i) => Math.sqrt(Math.pow(c0 + w0 / 2 + i * dx, 2) - c0 * c0);
  const riseOf = (w) => riseI((w - w0) / (2 * dx));
  const figs = [], zF = N * dz, outerW = wT(N), apex = ys + riseOf(outerW), doorH = ys - 0.9;
  // ---- Solid stepped jambs ----
  for (let i = 0; i < N; i++) {
    const depthS = lerp(0.62, 1, i / N);
    for (const s of [-1, 1]) {
      const xa = s * wT(i) / 2, xb = s * wT(i + 1) / 2;
      A.shade(depthS, () => A.box(Math.min(xa, xb), Math.max(xa, xb), 0, ys, -0.1, zT(i + 1), { noBot: true }));
      // Carved socle under the saints
      C.shade(depthS, () => { const mx = (xa + xb) / 2; C.at(M.T(0, 0, zT(i + 1) + 0.012), () => C.face([[Math.min(xa, xb) + 0.03, 0.15, 0], [Math.max(xa, xb) - 0.03, 0.15, 0], [Math.max(xa, xb) - 0.03, 1.25, 0], [Math.min(xa, xb) + 0.03, 1.25, 0]])); });
      // Colonnette on the arris, with a foliate capital; the saint stands against it
      const cx = s * (wT(i) / 2 + 0.02), cz = zT(i) + 0.32;
      F.shade(depthS, () => F.at(M.T(cx, 0, cz), () => {
        F.lathe([[0.2, 1.3], [0.2, 1.42], [0.11, 1.54], [0.11, ys - 0.5], [0.14, ys - 0.46], [0.11, ys - 0.42], [0.26, ys - 0.04], [0.3, ys]], 8);
        for (let l = 0; l < 4; l++) addLeaf(F, M.of(M.T(0, ys - 0.42, 0), M.Ry(l * 90 + 45), M.T(0.1, 0, 0)), 0.38, { coarse: 1 });
      }));
      // Pedestal and canopy for the jamb statue
      const sx = s * (wT(i) / 2 - 0.13), sz = zT(i) + 0.56;
      F.shade(depthS, () => F.at(M.T(sx, 0, sz), () => {
        F.lathe([[0.3, 1.25], [0.32, 1.32], [0.22, 1.4], [0.27, 1.46], [0.24, 1.5]], 6);
        F.at(M.T(0, 4.12, 0), () => {
          // A canopy like a tiny carved building: vaulted soffit, a drum of gablets, thin spirelet
          F.lathe([[0.06, -0.28], [0.34, -0.1], [0.44, 0], [0.44, 0.14], [0.38, 0.18], [0.22, 0.22], [0.22, 0.56], [0.28, 0.6], [0.2, 0.64], [0.09, 0.7], [0.01, 1.02]], 6, { phase: PI / 6, faceted: true });
          const face = s > 0 ? -60 : 60;
          for (const l of [-1, 0, 1]) F.at(M.of(M.Ry(face + l * 60), M.T(0, 0, 0.36)), () => {
            F.face([[-0.2, 0.14, 0.02], [0.2, 0.14, 0.02], [0, 0.5, 0.02]]);
            crocketsAlong(F, [-0.2, 0.16, 0.02], [0, 0.47, 0.02], 1, 0.12, [-1, 0.6, 0], 0);
            crocketsAlong(F, [0.2, 0.16, 0.02], [0, 0.47, 0.02], 1, 0.12, [1, 0.6, 0], 0);
            F.shade(0.5, () => F.face([[-0.1, 0.17, 0.03], [0.1, 0.17, 0.03], [0, 0.34, 0.03]]));
          });
        });
      }));
      const dirX = -s * dz, dirZ = dx * 1.5, l = Math.hypot(dirX, dirZ), th = Math.atan2(-dirZ / l, dirX / l) * 180 / PI;
      figs.push({ kind: kinds[(i + (s > 0 ? 0 : kinds.length >> 1)) % kinds.length], pos: [cfg.x + sx, 1.5, sz], rot: [0, th, 0], scale: 1.27 });
    }
  }
  // ---- Archivolts: moulded orders, each filled with a procession of small figures ----
  for (let i = 0; i < N; i++) {
    const w = wT(i), r = riseI(i), depthS = lerp(0.52, 1, i / N), arc = pointedArc(w, r, 8).map((p) => [p[0], p[1] + ys]);
    // A splayed face stepping out to the next order: this is the hollow the figures stand in
    F.shade(depthS * 0.82, () => F.sweep(arc, [[0, -0.1], [dx, -0.1], [dx, dz], [0, 0]], { z: zT(i), caps: false, crease: 30 }));
    // A roll along the outer edge of each order
    F.shade(depthS + 0.1, () => F.at(M.T(0, 0, zT(i + 1) - 0.02), () => F.sweep(pointedArc(wT(i + 1), riseI(i + 1), 8).map((p) => [p[0], p[1] + ys]), hexBar(0.2, 0.22), { caps: false })));
    // Procession of little figures up each side towards the apex
    const pts = pointedArc(w + dx, riseI(i + 0.5), 16).map((p) => [p[0], p[1] + ys]);
    let len = 0; const seg = []; for (let k = 0; k < pts.length - 1; k++) { const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); seg.push(l); len += l; }
    const n = Math.max(6, Math.round(len / 1.32));
    for (let q = 0; q < n; q++) {
      const d = (q + 0.5) / n * len; let acc = 0, k = 0; while (k < seg.length - 1 && acc + seg[k] < d) { acc += seg[k]; k++; }
      const f = (d - acc) / seg[k], px = lerp(pts[k][0], pts[k + 1][0], f), py = lerp(pts[k][1], pts[k + 1][1], f);
      const tx0 = (pts[k + 1][0] - pts[k][0]) / seg[k], ty0 = (pts[k + 1][1] - pts[k][1]) / seg[k], rx = -ty0, ry = tx0; // rx,ry: away from the opening
      const up = d > len / 2 ? -1 : 1, Y = [tx0 * up, ty0 * up, 0];
      // faces out along the splay: towards the opening and the viewer
      const nl = Math.hypot(dz, dx), X = [-rx * dz / nl, -ry * dz / nl, dx / nl];
      const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
      figs.push({ kind: ['prophet', 'kingA', 'angel', 'apostle'][(i + q) % 4], lod: 0, pos: [cfg.x + px + X[0] * 0.06, py + X[1] * 0.06, zT(i) + dz * 0.5 + X[2] * 0.06], basis: { X, Y, Z }, scale: 0.5 });
    }
  }
  // ---- Outer hood with gable and crockets ----
  const hood = pointedArc(outerW + 0.1, riseOf(outerW) + 0.1, 9).map((p) => [p[0], p[1] + ys]);
  F.at(M.T(0, 0, zF), () => F.sweep(hood, rollSection(0.34, 0.44, 2, 0.05, 2), { caps: false }));
  // The gable springs from the arch springing; its field is a carved panel with the arch cut out of it
  const gw = outerW + 1.5, gy = ys, gTop = WF.kingY - 0.7, gH = gTop - gy;
  const archCut = pointedArc(outerW + 0.1, riseOf(outerW) + 0.1, 9).map((p) => [p[0], p[1] + ys]);
  const field = [[-gw / 2, gy], [-(outerW + 0.1) / 2, gy], ...archCut.slice(1, -1), [(outerW + 0.1) / 2, gy], [gw / 2, gy], [0, gTop]];
  C.at(M.T(0, 0, zF - 0.1), () => C.slab(field, [], -0.1, 0, { noOuterSides: true, noBack: true }));
  A.at(M.T(0, 0, zF - 0.2), () => A.slab(field, [], -zF + 0.3, 0, { noOuterSides: false, noFront: true, noBack: true, so: 0.7 }));
  F.at(M.T(0, 0, zF - 0.14), () => {
    addGable(F, gw, gH, 0, 0.24, gy, { size: 0.72, finial: 0.1, crockets: 6, noField: true, lod: 1 });
    // Trefoil in the gable field above the arch, standing proud of the carved diaper
    const yc = apex + (gTop - apex) * 0.36, rc = Math.min(0.92, (gTop - yc) * 0.42);
    F.sweep(ringPts(0, yc, rc, 16), traceryBar(0.18, 0.24), { closed: true, z: 0.04 });
    const foil = []; for (let i = 0; i < 15; i++) { const a = PI / 2 + i * TAU / 15, R = rc * (0.56 + 0.34 * Math.pow(Math.abs(Math.cos(a * 1.5 - PI * 0.75)), 0.8)); foil.push([R * Math.cos(a), yc + R * Math.sin(a)]); }
    F.sweep(foil, hexBar(0.09, 0.18), { closed: true, z: 0.04, crease: 40 });
  });
  G.at(M.T(0, gTop + 0.1, zF - 0.02), () => addFinial(G, 1.5, 1));
  // ---- Tympanum, lintel, trumeau and doors ----
  const tw = w0 + 0.04, tr = riseOf(w0);
  C.at(M.T(0, 0, 0.06), () => C.slab(archOutline(tw, ys - 0.05, ys, tr, 9), [], -0.1, 0, { noOuterSides: true, noBack: true }));
  // Lintel with its frieze of small figures
  F.box(-tw / 2 - 0.02, tw / 2 + 0.02, doorH, ys - 0.02, -0.08, 0.22, { s: 0.9 });
  F.at(M.T(0, 0, 0.22), () => F.sweep([[-tw / 2 - 0.02, ys - 0.02], [tw / 2 + 0.02, ys - 0.02]], stringSection(0.14, 0.12), {}));
  const nL = Math.round(w0 / 0.62);
  for (let i = 0; i < nL; i++) figs.push({ kind: ['apostle', 'prophet', 'kingA'][i % 3], lod: 0, pos: [cfg.x + (-w0 / 2 + (i + 0.5) * w0 / nL), doorH + 0.03, 0.14], rot: [0, -90, 0], scale: 0.4 });
  // Central figure in a gilded mandorla, flanked by angels in registers
  // A true vesica: two arcs meeting in a point above and below
  const mY = ys + 0.06, mH = tr * 0.88, mW = tw * 0.25, mand = [], nM = 8;
  for (let i = 0; i < nM; i++) { const v = i / nM; mand.push([mW * Math.pow(Math.sin(PI * v), 0.72), mY + mH * v]); }
  for (let i = 0; i < nM; i++) { const v = 1 - i / nM; mand.push([-mW * Math.pow(Math.sin(PI * v), 0.72), mY + mH * v]); }
  G.at(M.T(0, 0, 0.1), () => G.sweep(mand, hexBar(0.1, 0.1), { closed: true, crease: 50 }));
  figs.push({ kind: tymp.main, pos: [cfg.x, ys + 0.14, 0.16], rot: [0, -90, 0], scale: Math.min(1.45, mH / 2.25) });
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const xp = s * tw * (0.3 + i * 0.13), yp = ys + 0.1 + (i === 1 ? 0 : 0.05);
    figs.push({ kind: tymp.side[i % tymp.side.length], lod: 0, pos: [cfg.x + xp, yp, 0.14], rot: [0, -90, 0], scale: i === 0 ? 0.9 : 0.62 });
  }
  // Trumeau with its statue
  A.box(-0.32, 0.32, 0, doorH, -0.1, 0.34, { s: 0.85, noBot: true });
  F.at(M.T(0, 0, 0.5), () => {
    F.lathe([[0.42, 0], [0.42, 0.65], [0.28, 0.8], [0.34, 1.0], [0.32, 1.06]], 8, { s: 0.85 });
    F.at(M.T(0, doorH - 1.02, 0), () => F.lathe([[0.1, -0.36], [0.4, -0.1], [0.5, 0], [0.5, 0.16], [0.42, 0.2], [0.26, 0.24], [0.26, 0.62], [0.33, 0.66], [0.3, 0.7], [0.12, 0.74], [0.02, 1.0]], 6, { phase: PI / 6, faceted: true }));
  });
  figs.push({ kind: tymp.trumeau, pos: [cfg.x, 1.06, 0.5], rot: [0, -90, 0], scale: 1.5 });
  // Doors: two leaves either side of the trumeau, recessed in the wall
  const leaf = w0 / 2 - 0.34;
  O.at(M.T(0, 0, -0.14), () => { const set2 = set; I.at(M.T(0, 0, -0.14), () => { addDoorLeaf(set2, w0 / 2 - 0.02, leaf, doorH - 0.04, true); addDoorLeaf(set2, -w0 / 2 + 0.02, leaf, doorH - 0.04, false); }); });
  return { set, figs, apex, zF, outerW };
}
function placePortal(gWest, name, cfg, pr) {
  placeSet(name, pr.set, [cfg.x, 0, 0], 0, gWest);
  pr.figs.forEach((f, i) => {
    const rot = f.rot || eulerFromBasis(f.basis.X, f.basis.Y, f.basis.Z);
    const pos = [f.pos[0] + (cfg.x - pr.baseX), f.pos[1], f.pos[2]];
    placeFigure(name + '_Fig' + i, f.kind, { pos, rot, scale: f.scale, parent: gWest, lod: f.lod });
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
  const set = setShade(mkBatches(), westShade), { F, C, A } = set, h = WF.kingTop - WF.kingY, y0 = WF.kingY;
  C.shade(0.62, () => C.face([[-pitch / 2, y0, 0.02], [pitch / 2, y0, 0.02], [pitch / 2, y0 + h, 0.02], [-pitch / 2, y0 + h, 0.02]]));
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
  const set = setShade(mkBatches(), westShade), { F, C, A } = set, y0 = WF.galY, y1 = WF.galTop, ys = y0 + 3.3;
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
  const set = setShade(mkBatches(), westShade), { A, F, L } = set, hw = 7, zf = 7, y0 = WF.topY, yT = P.towerTop - 2.6;
  const lw = 3.05, lx = 3.3, sill = y0 + 4.2, ys = y0 + 13.6, rise = 4.1, holes = [];
  for (const s of [-1, 1]) holes.push(archOutline(lw, sill, ys, rise, 7).map((p) => [s * lx + p[0], p[1]]));
  A.at(M.T(0, 0, zf), () => A.slab([[-hw, y0], [hw, y0], [hw, yT], [-hw, yT]], holes, -0.9, 0, { noOuterSides: true, noBack: true, sr: 0.66 }));
  // Dark inside the bell chamber, louvres across the lower lights
  F.shade(0.12, () => F.face([[hw, y0, zf - 2.6], [-hw, y0, zf - 2.6], [-hw, yT, zf - 2.6], [hw, yT, zf - 2.6]].reverse()));
  for (const s of [-1, 1]) {
    F.at(M.T(s * lx, 0, zf - 0.45), () => {
      F.sweep(pointedArc(lw, rise, 6).map((p) => [p[0], p[1] + ys]), rollSection(0.2, 0.7, 1, 0.04, 2), { caps: false });
      F.sweep([[0, sill - 0.05], [0, ys + 0.1]], traceryBar(0.2, 0.42), {});
      const lw2 = (lw - 0.1) / 2;
      for (const t of [-1, 1]) F.sweep(pointedArc(lw2, lw2 * 0.9, 4).map((p) => [t * lw2 / 2 + p[0], ys + 0.1 + p[1]]), hexBar(0.14, 0.34), { caps: false });
      F.sweep(ringPts(0, ys + rise * 0.62, 0.48, 10), hexBar(0.14, 0.34), { closed: true });
      for (let k = 0; k < 7; k++) { const y = sill + 0.9 + k * 0.9; L.box(-lw / 2, lw / 2, y, y + 0.12, -0.3, 0.3, { taper: 0 }); }
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
  const set = setShade(mkBatches(), westShade), { A, F } = set, y0 = WF.topY, yT = P.towerTop - 1.3, R = 1.72;
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
  const set = setShade(mkBatches(), westShade), { A, F, C, L, G } = set, hw = WF.halfW, yTop = WF.topY, tcx = 14.5;
  // ---- The great wall with real openings: doors and rose ----
  const cP = WF.portalC, sP = WF.portalS;
  const doorHole = (x, w, h) => [[x - w / 2, 0.02], [x + w / 2, 0.02], [x + w / 2, h], [x - w / 2, h]];
  const wallOutline = [[-hw, 0], [-sP.x - sP.w0 / 2, 0], [-sP.x - sP.w0 / 2, sP.ys - 0.9], [-sP.x + sP.w0 / 2, sP.ys - 0.9], [-sP.x + sP.w0 / 2, 0], [-cP.w0 / 2, 0], [-cP.w0 / 2, cP.ys - 0.9], [cP.w0 / 2, cP.ys - 0.9], [cP.w0 / 2, 0], [sP.x - sP.w0 / 2, 0], [sP.x - sP.w0 / 2, sP.ys - 0.9], [sP.x + sP.w0 / 2, sP.ys - 0.9], [sP.x + sP.w0 / 2, 0], [hw, 0], [hw, yTop], [-hw, yTop]];
  A.slab(wallOutline, [ringPts(0, WF.roseY, WF.roseR, 40)], -WF.wallT, 0, { noOuterSides: true, sr: 0.62 });
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
  C.at(M.T(0, 0, 0.03), () => {
    // carved spandrels filling the square around the rose
    const R2 = WF.roseR + 0.72, ry = WF.roseY, sq = 6.6;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      // corner of the square -> along its edge -> round the rose -> along the other edge
      const arcPts = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI / 2; arcPts.push([sx * R2 * Math.cos(a), sy * R2 * Math.sin(a)]); }
      const poly = [[sx * sq, sy * sq], [sx * sq, 0], ...arcPts, [0, sy * sq]].map((p) => [p[0], p[1] + ry]);
      C.slab(area2(poly) > 0 ? poly : poly.slice().reverse(), [], -0.04, 0, { noOuterSides: true, noBack: true });
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
    C.at(M.T(x, 0, 3.61), () => C.face([[-hwb + 0.06, 11.6, 0], [hwb - 0.06, 11.6, 0], [hwb - 0.06, 18.1, 0], [-hwb + 0.06, 18.1, 0]]));
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
    placeFigure('Upper_Saint' + i, SAINTS[i + 5], { pos: [x, 31.1, 1.86], rot: [0, -90, 0], scale: 1.32, parent: gWest });
  });
  placeSet('West_Wall', set, [0, 0, 0], 0, gWest);
  // ---- Glass ----
  const roseWest = makeRoseGlass(WF.roseR, 101);
  placeGlass('Great_Rose', roseWest, [0, WF.roseY, -0.4], 180, gWest);
  const twinGlass = SHARED.cleres;
  for (const s of [-1, 1]) place('TowerWindow_Out' + s, twinGlass[s > 0 ? 0 : 1], MAT.glassOut, { pos: [s * tcx, 0, 0.14], rot: [0, 180, 0], parent: gWest, scale: [1, 1, -1] });
  // ---- Three portals ----
  const pC = buildPortal(cP, ['peter', 'apostle', 'prophet', 'martyr', 'bishop', 'paul', 'prophet', 'apostle', 'bishop', 'martyr'], { main: 'christ', side: ['angel', 'prophet'], trumeau: 'christ' });
  const pS = buildPortal(Object.assign({}, sP, { x: 0 }), ['martyr', 'bishop', 'paul', 'prophet', 'apostle', 'peter', 'kingA', 'martyr'], { main: 'virgin', side: ['angel', 'apostle'], trumeau: 'virgin' });
  pC.baseX = cP.x; pS.baseX = 0; SHARED.sidePortal = pS;
  placePortal(gWest, 'Portal_Central', cP, pC);
  placePortal(gWest, 'Portal_South', Object.assign({}, sP, { x: -sP.x }), pS);
  placePortal(gWest, 'Portal_North', Object.assign({}, sP, { x: sP.x }), pS);
  // ---- Gallery of Kings ----
  const nK = P.kings, pitch = 2 * hw / nK, niche = buildKingNiche(pitch), kinds = ['kingA', 'kingB'];
  for (let i = 0; i < nK; i++) {
    const x = (i + 0.5 - nK / 2) * pitch;
    placeSet('King_Niche' + i, niche, [x, 0, 0], 0, gWest);
    placeFigure('King' + i, kinds[i % 2], { pos: [x, WF.kingY + 0.04, 0.5], rot: [0, -90, 0], scale: 1.5, parent: gWest });
  }
  // ---- High gallery ----
  const nG = 20, gp = 2 * hw / nG, gb = buildGalleryBay(gp);
  for (let i = 0; i < nG; i++) placeSet('Gallery' + i, gb, [(i + 0.5 - nG / 2) * gp, 0, 0], 0, gWest);
  // ---- Central gable rising over the gallery, closing the nave roof ----
  const front = setShade(mkBatches(), westShade), yG0 = yTop + 1.2, yR = LAY.ridge + 1.2, gW = 2 * (zn + 1.5);
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
  const shell = setShade(mkBatches(), (x, y, z, nx, ny, nz, b) => { b.rgb = [1, 0.99, 0.965]; let v = lerp(0.72, 1, sstep(0, 6, y)); if (ny < -0.4) v *= 0.55; return v; }), tw = 7;
  shell.A.at(M.of(M.T(0, 0, -tw), M.Ry(90), M.T(0, 0, tw)), () => shell.A.slab([[-tw, 0], [tw, 0], [tw, yTop], [-tw, yTop]], [], -0.8, 0, { noOuterSides: true, noBack: true }));
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
    place('Tower_SideGlass_High' + s, twinGlass[2], MAT.glassOut, { pos: [cx + s * (tw + 0.02), 0, -tw], rot: [0, s * 90 + 180, 0], parent: gWest, scale: [1, 1, -1] });
    place('Tower_SideGlass_Low' + s, SHARED.stories[1], MAT.glassOut, { pos: [cx + s * (tw + 0.02), 0, -tw], rot: [0, s * 90 + 180, 0], parent: gWest, scale: [1, 1, -1] });
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
  const parvis = new Batch(TILE.pave); parvis.fn = (x, y, z) => 0.62;
  parvis.face([[-hw - 2, 0.015, 5.2], [hw + 2, 0.015, 5.2], [hw + 2, 0.015, -0.1], [-hw - 2, 0.015, -0.1]]);
  place('Parvis_Paving', parvis, MAT.pave, { parent: gWest });
  // ---- Inner face: blind niches with statues, a gallery, the back of the doors ----
  const inner = setShade(mkBatches(), westShade);
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
    const q = setShade(mkBatches(), (x, y, z, nx, ny, nz, b) => {
      if (z + nz * 0.3 < zEnd) { b.rgb = [1, 0.965, 0.915]; return (0.38 + 0.3 * sstep(0, 34, y)) * (ny < -0.45 ? 0.8 : 1); }
      b.rgb = [1, 0.99, 0.965]; let v = lerp(0.72, 1, sstep(0, 6, y)); if (ny < -0.4) v *= 0.55; return v;
    });
    const { A, F, C, G } = q, rY = 28.6, R = 4.5, w0 = WF.portalS.w0, dh = WF.portalS.ys - 0.9;
    const at = M.T(0, 0, zEnd);
    A.at(M.of(at, M.T(0, 0, 0.9)), () => A.slab([[-hw, 0], [-w0 / 2, 0], [-w0 / 2, dh], [w0 / 2, dh], [w0 / 2, 0], [hw, 0], [hw, yTop], [-hw, yTop]], [ringPts(0, rY, R, 32)], -0.9, 0, { noOuterSides: true, sr: 0.62 }));
    F.at(M.of(at, M.T(0, rY, 0.9)), () => { F.sweep(ringPts(0, 0, R + 0.3, 32), traceryBar(0.4, 0.5), { closed: true }); F.sweep(ringPts(0, 0, R + 0.72, 36), rollSection(0.18, 0.26, 1, 0.03, 2), { closed: true }); });
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
  placePortal(gPortal, 'Portal_Transept', { x: 0 }, SHARED.sidePortal);
  place('Transept_Rose_Tracery', roseTracery(), MAT.fine, { pos: fr.pos(0, 28.6, zEnd + 0.45), rot: fr.rot(0), scale: [4.5 / WF.roseR, 4.5 / WF.roseR, 1], parent: gT });
  for (const sx of [-1, 1]) place('Transept_Pinnacle', largePinnacle(), MAT.fine, { pos: fr.pos(sx * hw, yTop + 1, zEnd + 0.9), scale: [1.05, 1.1, 1.05], parent: gT });
  const rose = TRANS.rose || (TRANS.rose = makeRoseGlass(4.5, 103, { inner: ['cobalt', 'emerald'], outer: ['ruby', 'cobalt', 'violet'], centre: 'ruby', majesty: { pose: 'sit', robe: 'white', mantle: 'cobalt', veil: 'azure', crown: 1, arm: 'hold', layer: 4 } }));
  placeGlass('Transept_Rose', rose, fr.pos(0, 28.6, zEnd + 0.45), fr.th + 180, gT);
  const low = SHARED.stories[0];
  for (const sx of [-1, 1]) {
    // Aisle-end windows: the same panes on the inner and outer faces of the end wall
    place('Transept_EndWindow_In', low, MAT.glassIn, { pos: fr.pos(sx * 9.6, 0, zEnd - 0.01), rot: fr.rot(180), parent: gT });
    place('Transept_EndWindow_Out', low, MAT.glassOut, { pos: fr.pos(sx * 9.6, 0, zEnd + 0.92), rot: fr.rot(180), scale: [1, 1, -1], parent: gT });
    placeFigure('Transept_Corner_Saint' + sx, SAINTS[sx > 0 ? 2 : 4], { pos: fr.pos(sx * hw, 16.05, zEnd + 2.62), rot: fr.rot(-90), scale: 1.42, parent: gT });
  }
}
const TRANS = {};

// ---- The east end: raised sanctuary, high altar with a gilded retable, oak choir stalls ------
function buildSanctuary() {
  const g = group('Sanctuary'), set = mkBatches(), { F, G, O } = set, { xa, xChoirW } = LAY;
  const dim = (x, y, z, nx, ny, nz, b) => { b.rgb = [1, 0.965, 0.915]; return (ny > 0.6 ? 0.62 : 0.5) * (ny < -0.4 ? 0.7 : 1); };
  F.fn = dim; O.fn = dim;
  // Three broad steps and the altar, all moulded
  for (let i = 0; i < 3; i++) { const r = 5 - i * 0.7; F.at(M.T(xa + 1, 0, 0), () => F.lathe([[r, i * 0.2], [r, (i + 1) * 0.2], [0.01, (i + 1) * 0.2]], 14, { faceted: true, phase: PI / 14 })); }
  const y0 = 0.6, ax = xa + 1;
  F.at(M.T(ax, y0, 0), () => {
    F.box(-0.8, 0.8, 0, 1.0, -1.7, 1.7, {});
    F.box(-0.92, 0.92, 1.0, 1.12, -1.84, 1.84, { sb: 0.5 });
    for (const s of [-1, 1]) for (const t of [-1, 0, 1]) F.at(M.T(s * 0.82, 0, t * 1.1), () => F.lathe([[0.12, 0], [0.07, 0.12], [0.07, 0.88], [0.13, 1.0]], 6));
  });
  // Gilded retable: an arcaded screen with gables, on the east side of the altar
  G.at(M.of(M.T(ax - 1.0, y0 + 1.12, 0), M.Ry(90)), () => {
    G.box(-2.3, 2.3, 0, 1.5, -0.12, 0.12, {});
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.92; G.sweep(pointedArc(0.78, 0.6, 3).map((p) => [x + p[0], 0.65 + p[1]]), hexBar(0.07, 0.1), { z: 0.13, caps: false }); addGable(G, 0.88, 0.8, 0.08, 0.04, 1.42, { size: 0.16, crockets: 2, finial: 0.26, solid: true, lod: 0 }); }
    G.at(M.T(0, 2.2, 0), () => { G.box(-0.07, 0.07, 0, 2.1, -0.07, 0.07, {}); G.box(-0.62, 0.62, 1.3, 1.44, -0.07, 0.07, {}); });
  });
  // Candlesticks
  for (const t of [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5]) G.at(M.T(ax - 0.2, y0 + 1.12, t), () => { G.lathe([[0.1, 0], [0.04, 0.06], [0.025, 0.42], [0.06, 0.46], [0.03, 0.5]], 6); F.at(M.T(ax - 0.2, y0 + 1.62, t), () => F.lathe([[0.022, 0], [0.022, 0.34], [0.002, 0.36]], 5, { s: 1.6 })); });
  // Choir stalls: stepped oak benches, moulded backs and a carved canopy rail
  const x0 = xa + 5.5, x1 = xChoirW - 1.2;
  for (const s of [-1, 1]) {
    const z0 = s * 5.0;
    O.box(x0, x1, 0, 0.32, z0 - 0.9, z0 + 0.9, { s: 0.42 });
    O.box(x0, x1, 0.32, 0.5, z0 + (s > 0 ? 0.0 : -0.9), z0 + (s > 0 ? 0.9 : 0), { s: 0.46 });
    O.box(x0, x1, 0, 2.7, z0 + (s > 0 ? 0.8 : -0.9), z0 + (s > 0 ? 0.9 : -0.8), { s: 0.4 });
    const n = Math.floor((x1 - x0) / 0.85);
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
  const names = Object.keys(FIGURES);
  names.forEach((n, i) => placeFigure('Fig_' + n, n, { pos: [0, 0, (i - names.length / 2) * 0.95] }));
  placeFigure('FigLow', 'apostle', { lod: 0, pos: [1.6, 0, 0] });
  [0, 1, 2].forEach((k) => place('Garg' + k, gargoyle(k), MAT.fine, { pos: [0, 3, (k - 1) * 2] }));
  const pin = new Batch(TILE.fine); addPinnacle(pin, 1.1, 7); place('Pin', pin, MAT.fine, { pos: [-3, 0, 0] });
  const base = new Batch(TILE.ashlar); base.box(-6, 3, -0.4, 0, -8, 8, { s: 0.8 }); place('Ground', base, MAT.ashlar);
}

// <<ORNAMENT>>

// <<BUILD>>
async function build() {
  ROOT = createRoot('Cathedral');
  await makeMaterials();
  if (P.preview === 'statues') { previewStatues(); return ROOT; }
  if (P.preview === 'all' || P.preview === 'unique') { buildCathedral(); return ROOT; }
  if (P.preview === 'textures') { // measures the texture payload on its own
    Object.keys(MAT).forEach((k, i) => createPart('Swatch_' + k, boxGeo(1, 1, 1), MAT[k], { position: [i * 1.2, 0.5, 0], parent: ROOT }));
    return ROOT;
  }
  if (P.preview === 'stats') {
    buildCathedral();
    const list = [...STAT.entries()].map(([b, e]) => ({ name: e.name, n: e.n, tris: b.I.length / 3, kb: Math.round(batchBytes(b) / 1024) })).sort((a, c) => c.kb - a.kb);
    let total = 0, draws = 0, rendered = 0; for (const e of list) { total += e.kb; draws += e.n; rendered += e.n * e.tris; }
    createPart('StatProbe', boxGeo(1, 1, 1), gameMaterial(0x888888), { parent: ROOT });
    group('STAT_TOTAL_kb_' + total + '_draws_' + draws + '_rendered_' + rendered + '_unique_' + list.length);
    list.slice(0, 36).forEach((e, i) => group('STAT_' + String(i).padStart(2, '0') + '_' + e.name + '_x' + e.n + '_tris' + e.tris + '_kb' + e.kb));
    return ROOT;
  }
  return ROOT;
}
