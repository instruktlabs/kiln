const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function curve(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

function newBuf() { return { pos: [], idx: [] }; }

function geoOf(b, angle) {
  return creaseNormals(meshGeo({ positions: b.pos, indices: b.idx }), { angle: angle || 50 });
}

function addPart(name, buf, mat, parent, angle) {
  if (!buf || buf.idx.length === 0) return null;
  return createPart(name, geoOf(buf, angle), mat, { parent });
}

function makeRing(half) {
  const n = half.length, r = [];
  for (let k = 0; k < n; k++) r.push(half[k]);
  for (let k = n - 2; k >= 1; k--) r.push([-half[k][0], half[k][1]]);
  return r;
}

function gridFrom(xs, halves) {
  return halves.map((h, i) => makeRing(h).map(p => [xs[i], p[1], p[0]]));
}

function emitLoft(P, cls, capS, capE, sink) {
  const NS = P.length, NR = P[0].length, out = {};
  const B = k => out[k] || (out[k] = { pos: [], idx: [], map: new Map() });
  const V = (b, key, p) => {
    let v = b.map.get(key);
    if (v === undefined) { v = b.pos.length / 3; b.pos.push(p[0], p[1], p[2]); b.map.set(key, v); }
    return v;
  };
  const tri = (b, ka, pa, kb, pb, kc, pc) => {
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-12) return;
    b.idx.push(V(b, ka, pa), V(b, kb, pb), V(b, kc, pc));
    if (sink) sink.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], pc[0], pc[1], pc[2]);
  };
  for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR; j++) {
    const k = cls(i, j);
    if (!k) continue;
    const j2 = (j + 1) % NR, b = B(k);
    const A = P[i][j], Bp = P[i][j2], C = P[i + 1][j2], D = P[i + 1][j];
    const kA = i * NR + j, kB = i * NR + j2, kC = (i + 1) * NR + j2, kD = (i + 1) * NR + j;
    tri(b, kA, A, kD, D, kC, C);
    tri(b, kA, A, kC, C, kB, Bp);
  }
  const cap = (i, key, front) => {
    if (!key) return;
    const b = B(key), ring = P[i], c = [0, 0, 0];
    for (const p of ring) { c[0] += p[0] / NR; c[1] += p[1] / NR; c[2] += p[2] / NR; }
    for (let j = 0; j < NR; j++) {
      const j2 = (j + 1) % NR;
      if (front) tri(b, -1 - i, c, i * NR + j2, ring[j2], i * NR + j, ring[j]);
      else tri(b, -1 - i, c, i * NR + j, ring[j], i * NR + j2, ring[j2]);
    }
  };
  cap(0, capS, false);
  cap(NS - 1, capE, true);
  return out;
}

function convexBuf(buf, pts, faces) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
  const base = buf.pos.length / 3;
  for (const p of pts) buf.pos.push(p[0], p[1], p[2]);
  for (const f of faces) {
    const a = pts[f[0]], b = pts[f[1]], d = pts[f[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const out = nx * (a[0] - c[0]) + ny * (a[1] - c[1]) + nz * (a[2] - c[2]) > 0;
    for (let k = 1; k < f.length - 1; k++) {
      if (out) buf.idx.push(base + f[0], base + f[k], base + f[k + 1]);
      else buf.idx.push(base + f[0], base + f[k + 1], base + f[k]);
    }
  }
}

const BOX_FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
function boxBuf(buf, cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  convexBuf(buf, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], BOX_FACES);
}

function revolve(b, prof, seg) {
  const base = b.pos.length / 3, np = prof.length;
  for (let s = 0; s < seg; s++) {
    const t = 2 * Math.PI * s / seg, c = Math.cos(t), sn = Math.sin(t);
    for (const p of prof) b.pos.push(p[0] * c, p[0] * sn, p[1]);
  }
  for (let s = 0; s < seg; s++) {
    const s2 = (s + 1) % seg;
    for (let p = 0; p < np - 1; p++) {
      const A = base + s * np + p, Bq = base + s2 * np + p, C = base + s2 * np + p + 1, D = base + s * np + p + 1;
      b.idx.push(A, Bq, C, A, C, D);
    }
  }
}

function castRay(tris, ox, oy, oz, dx, dy, dz) {
  let bt = Infinity, bn = null;
  for (let k = 0; k < tris.length; k += 9) {
    const ax = tris[k], ay = tris[k + 1], az = tris[k + 2];
    const e1x = tris[k + 3] - ax, e1y = tris[k + 4] - ay, e1z = tris[k + 5] - az;
    const e2x = tris[k + 6] - ax, e2y = tris[k + 7] - ay, e2z = tris[k + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < bt) {
      bt = t;
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
      bn = [nx, ny, nz];
    }
  }
  return bn ? { t: bt, n: bn } : null;
}

const RAY_DIRS = { F: [-1, 0, 0], B: [1, 0, 0], R: [0, 0, -1], L: [0, 0, 1], T: [0, -1, 0] };
function decalBuf(buf, tris, dir, a0, a1, lo, hi, na, nb, lift) {
  const d = RAY_DIRS[dir], H = [];
  for (let r = 0; r <= nb; r++) {
    H.push([]);
    for (let c = 0; c <= na; c++) {
      const a = lerp(a0, a1, c / na), b = lerp(lo(a), hi(a), r / nb);
      const o = dir === 'F' ? [10, b, a] : dir === 'B' ? [-10, b, a] : dir === 'R' ? [a, b, 10] : dir === 'L' ? [a, b, -10] : [a, 10, b];
      const h = castRay(tris, o[0], o[1], o[2], d[0], d[1], d[2]);
      H[r].push(h ? [o[0] + d[0] * h.t + h.n[0] * lift, o[1] + d[1] * h.t + h.n[1] * lift, o[2] + d[2] * h.t + h.n[2] * lift] : null);
    }
  }
  const base = buf.pos.length / 3, id = [];
  for (let r = 0; r <= nb; r++) {
    id.push([]);
    for (let c = 0; c <= na; c++) {
      const p = H[r][c];
      if (p) { id[r].push(buf.pos.length / 3); buf.pos.push(p[0], p[1], p[2]); } else id[r].push(-1);
    }
  }
  for (let r = 0; r < nb; r++) for (let c = 0; c < na; c++) {
    const i0 = id[r][c], i1 = id[r][c + 1], i2 = id[r + 1][c + 1], i3 = id[r + 1][c];
    if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0) continue;
    const p0 = H[r][c], p1 = H[r][c + 1], p2 = H[r + 1][c + 1];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const facing = (uy * vz - uz * vy) * d[0] + (uz * vx - ux * vz) * d[1] + (ux * vy - uy * vx) * d[2];
    if (facing <= 0) buf.idx.push(i0, i1, i2, i0, i2, i3);
    else buf.idx.push(i0, i2, i1, i0, i3, i2);
  }
}

function flatPoly(buf, pts, z, side) {
  const c = [0, 0];
  for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; }
  const base = buf.pos.length / 3;
  buf.pos.push(c[0], c[1], z);
  for (const p of pts) buf.pos.push(p[0], p[1], z);
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = base + 1 + k, b = base + 1 + (k + 1) % n;
    if (side > 0) buf.idx.push(base, a, b); else buf.idx.push(base, b, a);
  }
}

function append(dst, src) {
  const base = dst.pos.length / 3;
  for (let k = 0; k < src.pos.length; k++) dst.pos.push(src.pos[k]);
  for (let k = 0; k < src.idx.length; k++) dst.idx.push(base + src.idx[k]);
}

const segOf = (j, NR) => (j <= NR / 2 - 1 ? j : NR - 1 - j);

function mats() {
  const M = (name, o) => { const m = pbrMaterial(o); m.name = name; return m; };
  return {
    Paint: M('Paint', { albedo: 0xebebeb, roughness: 0.3, metalness: 0 }),
    Trim: M('Trim', { albedo: 0x1e1e20, roughness: 0.7, metalness: 0 }),
    Glass: M('Glass', { albedo: 0x12161a, roughness: 0.05, metalness: 0 }),
    Chrome: M('Chrome', { albedo: 0xd8dade, roughness: 0.2, metalness: 1 }),
    Tyre: M('Tyre', { albedo: 0x222222, roughness: 0.9, metalness: 0 }),
    Rim: M('Rim', { albedo: 0xb9bcc0, roughness: 0.4, metalness: 1 }),
    Headlight: M('Headlight', { albedo: 0xdfe6ea, roughness: 0.2, metalness: 0, emissive: 0xffffff }),
    Taillight: M('Taillight', { albedo: 0x7a0c0c, roughness: 0.3, metalness: 0, emissive: 0x890808 }),
    BrakeLight: M('BrakeLight', { albedo: 0xc01818, roughness: 0.3, metalness: 0, emissive: 0xff2020 }),
    Plate: M('Plate', { albedo: 0xe6e6e0, roughness: 0.5, metalness: 0 })
  };
}

function prep(S) {
  S.fyt = curve(S.yt); S.fhw = curve(S.hw); S.fyb = curve(S.yb);
  S.fhh = curve(S.gh.hh); S.fgw = curve(S.gh.wb);
  return S;
}

function wheelGeos(S) {
  const R = S.R, rr = S.rr, sw = R - rr, h = S.tw / 2, SEG = 16;
  const t = newBuf(), r = newBuf(), s = newBuf();
  revolve(t, [[rr, -0.83 * h], [rr + 0.45 * sw, -h], [R - 0.02, -0.72 * h], [R, -0.4 * h], [R, 0.4 * h], [R - 0.02, 0.72 * h], [rr + 0.45 * sw, h], [rr, 0.83 * h]], SEG);
  revolve(r, [[0.16 * rr, -0.62 * h], [0.84 * rr, -0.68 * h], [rr, -0.83 * h]], SEG);
  revolve(r, [[rr, 0.83 * h], [0.84 * rr, 0.68 * h], [0.16 * rr, 0.62 * h]], SEG);
  const a0 = 10 * Math.PI / 180, a1 = 18 * Math.PI / 180, r0 = 0.30 * rr, r1 = 0.80 * rr;
  for (const side of [1, -1]) for (let k = 0; k < 5; k++) {
    const f = (72 * k + 36) * Math.PI / 180;
    const P = (rad, a) => [rad * Math.cos(f + a), rad * Math.sin(f + a)];
    flatPoly(s, [P(r0, -a0), P(r1, -a1), P(r1, a1), P(r0, a0)], side * 0.69 * h, side);
  }
  return { tyre: geoOf(t, 60), rim: geoOf(r, 60), slots: geoOf(s, 60) };
}

function bulkheads(S, buf) {
  const r = S.Ra + 0.01;
  for (const xw of [S.xa, -S.xa]) for (const side of [1, -1]) {
    const b0 = S.bk || 0.16, pts = [[xw - r, b0], [xw + r, b0]];
    for (let d = 0; d <= 180; d += 20) pts.push([xw + r * Math.cos(d * Math.PI / 180), S.yc + r * Math.sin(d * Math.PI / 180)]);
    flatPoly(buf, pts, side * 0.30, side);
  }
}

function bodyHalf(S, x, yl) {
  const hw = S.fhw(x), yt = S.fyt(x), ys = yt - 0.04, H = ys - yl;
  const p3y = yl + Math.min(0.04, 0.28 * H), p5y = ys - Math.min(0.035, 0.2 * H);
  return [
    [0, yl], [hw - 0.10, yl], [hw - 0.03, yl + Math.min(0.02, 0.12 * H)], [hw, p3y],
    [hw, p3y + 0.55 * (p5y - p3y)], [hw - 0.028, p5y], [hw - 0.09, ys], [0.5 * (hw - 0.09), yt - 0.010], [0, yt]
  ];
}

function ghHalf(S, x) {
  const yB = S.fyt(x) - 0.04, yT = yB + S.fhh(x), wb = S.fgw(x), wt = wb - S.gh.k * (yT - yB);
  return [
    [0, yB - 0.02], [wb, yB - 0.02], [wb - 0.005, yB + 0.022],
    [wb + 0.93 * (wt - wb), yB + 0.93 * (yT - yB)], [wt - 0.04, yT - 0.008], [0, yT]
  ];
}

function bodyStations(S, C) {
  const arches = C.arch === false ? [] : [S.xa, -S.xa], st = [];
  const inArch = x => arches.some(a => x > a - S.Ra + 1e-6 && x < a + S.Ra - 1e-6);
  C.bx.forEach(x => { if (!inArch(x)) st.push({ x, yl: S.fyb(x) }); });
  for (const a of arches) {
    const x0 = a - S.Ra, x1 = a + S.Ra;
    st.push({ x: x0, yl: S.fyb(x0) }, { x: x0, yl: S.yc });
    for (let th = 180 - C.th; th > 1; th -= C.th) {
      const t = th * Math.PI / 180;
      st.push({ x: a + S.Ra * Math.cos(t), yl: S.yc + S.Ra * Math.sin(t) });
    }
    st.push({ x: x1, yl: S.yc }, { x: x1, yl: S.fyb(x1) });
  }
  return st.sort((p, q) => p.x - q.x);
}

function buildLod(S, lod, M, parent) {
  const C = S.lods[lod], bufs = {}, tris = [];
  const B = k => bufs[k] || (bufs[k] = newBuf());
  const merge = out => { for (const k in out) append(B(k), out[k]); };
  const st = bodyStations(S, C), xs = st.map(s => s.x);
  const P = gridFrom(xs, st.map(s => { const h = bodyHalf(S, s.x, s.yl); return C.pick.map(k => h[k]); }));
  const NR = P[0].length;
  merge(emitLoft(P, (i, j) => (xs[i] === xs[i + 1] || C.lab[segOf(j, NR)] === 'T') ? 'Trim' : 'Paint', 'Paint', 'Paint', tris));
  if (C.bulk) bulkheads(S, B('Trim'));
  const gx = C.gx, gz = S.gh;
  const G = gridFrom(gx, gx.map(x => { const h = ghHalf(S, x); return C.gpick.map(k => h[k]); }));
  const NG = G[0].length, inR = (x, r) => x > r[0] && x < r[1];
  merge(emitLoft(G, (i, j) => {
    const lab = C.glab[segOf(j, NG)], xm = (gx[i] + gx[i + 1]) / 2;
    if (lab === 'hid') return null;
    if (lab === 'strip') return inR(xm, gz.strip) ? 'Chrome' : 'Paint';
    if (lab === 'side') return gz.side.some(r => inR(xm, r)) ? 'Glass' : 'Paint';
    if (lab === 'top') return inR(xm, gz.top) ? 'Paint' : 'Glass';
    return 'Paint';
  }, null, null, tris));
  if (S.mirror && C.mir) {
    const m = S.mirror;
    for (const s of [1, -1]) {
      boxBuf(B('Paint'), m.x, m.y, s * m.z, m.sx, m.sy, m.sz);
      boxBuf(B('Paint'), m.x + 0.02, m.y - m.sy / 2 + 0.02, s * (m.z - m.sz / 2 - 0.03), 0.05, 0.03, 0.09);
      if (C.mir > 1) boxBuf(B('Glass'), m.x - m.sx / 2 - 0.003, m.y, s * m.z, 0.006, m.sy * 0.8, m.sz * 0.85);
    }
  }
  const dl = [0.004, 0.008, 0.012][lod], fn = v => (typeof v === 'function' ? v : () => v);
  const d = (mat, dir, a0, a1, lo, hi, na, nb, lm) => decalBuf(B(mat), tris, dir, a0, a1, fn(lo), fn(hi), na, nb, dl * (lm || 1));
  const dm = (mat, dir, a0, a1, lo, hi, na, nb, lm) => {
    const f = fn(lo), g = fn(hi);
    if (dir === 'F' || dir === 'B') { d(mat, dir, a0, a1, f, g, na, nb, lm); d(mat, dir, -a0, -a1, a => f(-a), a => g(-a), na, nb, lm); }
    else if (dir === 'R') { d(mat, 'R', a0, a1, f, g, na, nb, lm); d(mat, 'L', a0, a1, f, g, na, nb, lm); }
    else { d(mat, 'T', a0, a1, f, g, na, nb, lm); d(mat, 'T', a0, a1, a => -g(a), a => -f(a), na, nb, lm); }
  };
  S.decals(d, dm, lod);
  for (const k in bufs) addPart(k + '_L' + lod, bufs[k], M[k], parent, 50);
}

const SPEC = {
  title: 'Generic SUV', root: 'SUV',
  R: 0.365, rr: 0.245, tw: 0.235, xa: 1.45, zt: 0.82, Ra: 0.40, yc: 0.365, bk: 0.235,
  yt: [[-2.49, 0.98], [-2.46, 1.08], [-2.40, 1.12], [-2.0, 1.13], [-1.0, 1.12], [0, 1.11], [0.6, 1.10], [1.0, 1.08], [1.5, 1.03], [1.9, 0.98], [2.2, 0.95], [2.34, 0.92], [2.40, 0.85]],
  hw: [[-2.49, 0.62], [-2.47, 0.72], [-2.42, 0.82], [-2.32, 0.895], [-2.15, 0.935], [-1.95, 0.94], [1.95, 0.94], [2.1, 0.93], [2.25, 0.90], [2.34, 0.84], [2.39, 0.76], [2.40, 0.62]],
  yb: [[-2.49, 0.52], [-2.47, 0.42], [-2.40, 0.34], [-2.25, 0.26], [-2.05, 0.23], [2.05, 0.23], [2.2, 0.27], [2.32, 0.32], [2.40, 0.40]],
  gh: {
    hh: [[-2.42, 0], [-2.40, 0.10], [-2.36, 0.30], [-2.30, 0.46], [-2.20, 0.58], [-2.05, 0.65], [-1.6, 0.675], [-0.5, 0.675], [0.1, 0.675], [0.4, 0.65], [0.7, 0.50], [1.0, 0.30], [1.25, 0.12], [1.38, 0.02]],
    wb: [[-2.42, 0.72], [-2.3, 0.80], [-1.9, 0.86], [-1.0, 0.87], [0, 0.87], [0.6, 0.86], [1.0, 0.83], [1.38, 0.78]],
    k: 0.3, side: [[0.24, 1.10], [-0.76, 0.16], [-2.28, -0.84]], top: [-2.30, 0.30], strip: [-2.28, 1.10]
  },
  mirror: { x: 1.0, y: 1.13, z: 0.925, sx: 0.15, sy: 0.09, sz: 0.09 },
  lods: [
    { th: 20, pick: [0, 1, 2, 3, 4, 5, 6, 7, 8], lab: 'TTTPPPPP', bulk: true, mir: 2,
      bx: [-2.49, -2.47, -2.42, -2.34, -2.22, -2.05, -1.92, -0.8, -0.4, 0, 0.4, 0.8, 1.92, 2.05, 2.18, 2.28, 2.35, 2.40],
      gx: [-2.42, -2.38, -2.34, -2.30, -2.28, -2.20, -2.05, -1.80, -1.50, -1.20, -0.84, -0.76, -0.45, -0.10, 0.16, 0.24, 0.30, 0.50, 0.70, 0.90, 1.10, 1.25, 1.38],
      gpick: [0, 1, 2, 3, 4, 5], glab: ['hid', 'strip', 'side', 'pillar', 'top'] },
    { th: 60, pick: [0, 2, 3, 4, 6, 8], lab: 'TTPPP', bulk: true, mir: 1,
      bx: [-2.49, -2.42, -2.22, -0.6, 0.6, 1.92, 2.28, 2.40],
      gx: [-2.42, -2.34, -2.28, -2.05, -1.5, -0.84, -0.76, 0.16, 0.24, 0.30, 0.70, 1.10, 1.38],
      gpick: [0, 2, 3, 4, 5], glab: ['hid', 'side', 'pillar', 'top'] },
    { arch: false, pick: [0, 3, 5, 8], lab: 'TPP', bulk: false, mir: 0,
      bx: [-2.49, -2.42, -2.05, -1.45, 1.45, 2.05, 2.34, 2.40],
      gx: [-2.42, -2.28, -0.84, -0.76, 0.16, 0.24, 1.10, 1.38],
      gpick: [0, 2, 3, 5], glab: ['hid', 'side', 'top'] }
  ],
  decals(d, dm, lod) {
    const c = k => Math.max(1, Math.round(k * [1, 0.5, 0.34][lod]));
    dm('Headlight', 'F', 0.50, 0.90, a => 0.70 + 0.03 * (a - 0.5) / 0.4, a => 0.80 - 0.02 * (a - 0.5) / 0.4, c(8), c(2));
    if (lod < 2) dm('Headlight', 'T', 2.12, 2.34, 0.52, a => SPEC.fhw(a) - 0.07, c(5), c(3), 1.2);
    dm('Taillight', 'B', 0.58, 0.90, 0.72, 1.00, c(6), c(3));
    dm('BrakeLight', 'B', 0.62, 0.86, 0.86, 0.92, c(5), 1, 1.6);
    d('Taillight', 'B', -0.58, 0.58, 0.88, 0.905, c(10), 1, 1.3);
    dm('BrakeLight', 'T', -2.26, -2.20, 0.0, 0.18, c(3), 1, 1.2);
    if (lod < 2) {
      d('Plate', 'F', -0.21, 0.21, 0.50, 0.60, c(4), c(2), 1.3);
      d('Plate', 'B', -0.21, 0.21, 0.62, 0.74, c(4), c(2), 1.3);
      d('Trim', 'F', -0.55, 0.55, 0.42, 0.48, c(8), 1);
      d('Trim', 'F', -0.46, 0.46, 0.64, 0.72, c(8), 1);
      d('Trim', 'B', -0.55, 0.55, 0.53, 0.60, c(8), 1);
    }
    if (lod === 0) {
      [[1.15, 0.80], [0.20, 0.30], [-0.80, 0.30]].forEach(([x, y0]) => dm('Trim', 'R', x - 0.004, x + 0.004, y0, 1.10, 1, 6));
      [0.30, -0.70].forEach(x => dm('Trim', 'R', x - 0.07, x + 0.07, 0.94, 0.96, 3, 1, 1.5));
    }
  }
};

const meta = { name: SPEC.title, role: 'vehicle' };

function build() {
  prep(SPEC);
  const M = mats(), root = createRoot(SPEC.root);
  for (let lod = 0; lod < 3; lod++) {
    const g = new THREE.Group();
    g.name = 'LOD' + lod;
    root.add(g);
    buildLod(SPEC, lod, M, g);
  }
  const W = wheelGeos(SPEC);
  [['FL', 1, -1], ['FR', 1, 1], ['RL', -1, -1], ['RR', -1, 1]].forEach(([n, fx, sz]) => {
    const g = new THREE.Group();
    g.name = 'Wheel_' + n;
    g.position.set(fx * SPEC.xa, SPEC.R, sz * SPEC.zt);
    root.add(g);
    createPart('Tyre_' + n, W.tyre, M.Tyre, { parent: g });
    createPart('Rim_' + n, W.rim, M.Rim, { parent: g });
    createPart('RimSlots_' + n, W.slots, M.Trim, { parent: g });
  });
  return root;
}
