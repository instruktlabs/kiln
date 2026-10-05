// Foundry Floor S2 hall half, review-1 revision (contract rev 3). Only these three constants differ between exports.
const hand = 'E';   // 'W' or 'E' (E negates every Z in the construction)
const bays = 36;     // 36 for the full hall, 4 for the review export
const far = false;  // true builds the far shell

const meta = { name: 's2-hall-' + hand + (far ? '-far' : '') + (bays === 36 ? '' : '-b' + bays) };

const SZ = hand === 'E' ? -1 : 1;
const L = 72 * bays;       // straight hall length
const XE = L + 180;        // flat inner end
const HW = 190;            // half width
const DECK = 46;
const NS = 48;             // segments along the swept end
const TH8 = Math.tan(8 * Math.PI / 180), CO8 = Math.cos(8 * Math.PI / 180);

// emissive intensity is baked into the emissive colour (linear-light multiply), exported at intensity 1
const s2l = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = l => (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
function bakeEmissive(hex, k) {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(v => Math.round(255 * l2s(s2l(v / 255) * k)));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}
function mkMat(name, color, rough, metal, emissive, k) {
  const o = { roughness: rough, metalness: metal, flatShading: false };
  if (emissive !== undefined) { o.emissive = bakeEmissive(emissive, k); o.emissiveIntensity = 1; }
  const m = gameMaterial(color, o);
  m.name = name;
  return m;
}
const MAT = {
  cs: mkMat('cladding-steel', 0xC9CDD1, 0.30, 1.0),
  rs: mkMat('roof-steel', 0xBFC4C9, 0.40, 1.0),
  pg: mkMat('plinth-graphite', 0x1C2128, 0.60, 0.3),
  tg: mkMat('trim-graphite', 0x3B4148, 0.50, 0.1),
  rw: mkMat('rooflight-warm', 0xFFE7C2, 0.40, 0, 0xFFE7C2, 0.6),
  pl: mkMat('port-lit', 0xFFF1DC, 0.50, 0, 0xFFF1DC, 0.8),
  el: mkMat('edge-lit', 0xFFE7C2, 0.40, 0, 0xFFE7C2, 1.0),
  sl: mkMat('soffit-lit', 0xF4F1EA, 0.60, 0, 0xF4F1EA, 0.8),
  co: mkMat('concrete', 0x9C9A94, 0.95, 0),
  ft: mkMat('floor-tile-grey', 0xD3D7DA, 0.70, 0),
  fw: mkMat('ffu-filter-white', 0xF1F3F4, 0.90, 0),
};

const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vNeg = a => [-a[0], -a[1], -a[2]];
const vUnit = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const pad2 = n => (n < 10 ? '0' : '') + n;

// ---- geometry accumulator: everything is authored in hand W and mirrored on emit ----
function newPart() { return { b: {} }; }
function emitPoly(P, k, pts, nrm) {
  const B = P.b[k] || (P.b[k] = { p: [], n: [], i: [] });
  const base = B.p.length / 3;
  for (let j = 0; j < pts.length; j++) {
    B.p.push(pts[j][0], pts[j][1], pts[j][2] * SZ);
    B.n.push(nrm[j][0], nrm[j][1], nrm[j][2] * SZ);
  }
  const t = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
  for (let j = 0; j < t.length; j += 3) {
    if (SZ > 0) B.i.push(base + t[j], base + t[j + 1], base + t[j + 2]);
    else B.i.push(base + t[j], base + t[j + 2], base + t[j + 1]);
  }
}
function addQuad(P, k, pts, hint, sn) {
  const n = vCross(vSub(pts[1], pts[0]), vSub(pts[2], pts[0]));
  const rev = vDot(n, hint) < 0;
  const ord = rev ? [0, 3, 2, 1] : [0, 1, 2, 3];
  const fn = vUnit(rev ? vNeg(n) : n);
  emitPoly(P, k, ord.map(j => pts[j]), ord.map(j => (sn ? sn[j] : fn)));
}
function addTri(P, k, a, b, c, hint) {
  const n = vCross(vSub(b, a), vSub(c, a));
  const rev = vDot(n, hint) < 0;
  const fn = vUnit(rev ? vNeg(n) : n);
  emitPoly(P, k, rev ? [a, c, b] : [a, b, c], [fn, fn, fn]);
}
function addBox(P, k, x0, x1, y0, y1, z0, z1, skip) {
  const s = skip || '';
  const has = t => s.indexOf(t) >= 0;
  if (!has('nx')) addQuad(P, k, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0]);
  if (!has('px')) addQuad(P, k, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
  if (!has('ny')) addQuad(P, k, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  if (!has('py')) addQuad(P, k, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
  if (!has('nz')) addQuad(P, k, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
  if (!has('pz')) addQuad(P, k, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
}

// ---- exterior perimeter path (x,z): outer wall, swept end, flat end, split wall ----
function bezPt(t) {
  const u = 1 - t;
  return [u * u * L + 2 * u * t * XE + t * t * XE, -HW * (u * u + 2 * u * t)];
}
const path = [];
path.push({ x: 0, z: -HW, mx: 0, mz: -1, ni: [0, 0, -1], no: [0, 0, -1] });
for (let i = 0; i <= NS; i++) {
  const t = i / NS, u = 1 - t, c = bezPt(t);
  const tx = 360 * u, tz = 380 * t, tl = Math.hypot(tx, tz);
  const ox = tz / tl, oz = -tx / tl;
  path.push({ x: c[0], z: c[1], mx: ox, mz: oz, ni: [ox, 0, oz], no: [ox, 0, oz] });
}
path.push({ x: XE, z: HW, mx: 1, mz: 1, ni: [1, 0, 0], no: [0, 0, 1] });
path.push({ x: 0, z: HW, mx: 0, mz: 1, ni: [0, 0, 1], no: [0, 0, 1] });
// segments: 0 outer wall, 1..NS swept end, NS+1 flat end, NS+2 split wall
const NSEG = path.length - 1;

// band along the perimeter between outward offsets dO (outer) and dI (inner); faces: o i t b
function addRibbon(P, k, dO, dI, y0, y1, faces, s0, s1) {
  const has = t => faces.indexOf(t) >= 0;
  for (let s = s0; s < s1; s++) {
    const A = path[s], B = path[s + 1];
    const oa = [A.x + dO * A.mx, A.z + dO * A.mz], ob = [B.x + dO * B.mx, B.z + dO * B.mz];
    const ia = [A.x + dI * A.mx, A.z + dI * A.mz], ib = [B.x + dI * B.mx, B.z + dI * B.mz];
    const nA = A.no, nB = B.ni;
    if (has('o')) addQuad(P, k, [[oa[0], y0, oa[1]], [ob[0], y0, ob[1]], [ob[0], y1, ob[1]], [oa[0], y1, oa[1]]], nA, [nA, nB, nB, nA]);
    if (has('i')) addQuad(P, k, [[ia[0], y0, ia[1]], [ib[0], y0, ib[1]], [ib[0], y1, ib[1]], [ia[0], y1, ia[1]]], vNeg(nA), [vNeg(nA), vNeg(nB), vNeg(nB), vNeg(nA)]);
    if (has('t')) addQuad(P, k, [[oa[0], y1, oa[1]], [ob[0], y1, ob[1]], [ib[0], y1, ib[1]], [ia[0], y1, ia[1]]], [0, 1, 0]);
    if (has('b')) addQuad(P, k, [[oa[0], y0, oa[1]], [ob[0], y0, ob[1]], [ib[0], y0, ib[1]], [ia[0], y0, ia[1]]], [0, -1, 0]);
  }
}
const polyOf = off => path.map(v => [v.x - off * v.mx, v.z - off * v.mz]);
function addPrism(P, k, poly, y0, y1, sides, bottom) {
  const n = poly.length;
  let cx = 0, cz = 0;
  poly.forEach(p => { cx += p[0]; cz += p[1]; });
  cx /= n; cz /= n;
  for (let i = 1; i + 1 < n; i++) {
    addTri(P, k, [poly[0][0], y1, poly[0][1]], [poly[i][0], y1, poly[i][1]], [poly[i + 1][0], y1, poly[i + 1][1]], [0, 1, 0]);
    if (bottom) addTri(P, k, [poly[0][0], y0, poly[0][1]], [poly[i][0], y0, poly[i][1]], [poly[i + 1][0], y0, poly[i + 1][1]], [0, -1, 0]);
  }
  if (sides) {
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      addQuad(P, k, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [(a[0] + b[0]) / 2 - cx, 0, (a[1] + b[1]) / 2 - cz]);
    }
  }
}

// outer skin of one wall segment cut into panels; each 12 m seam is a recessed groove (0.1 wide, 0.05 deep) whose floor and returns go to PG
function addWallSkin(P, PG, s, cutList) {
  const A = path[s], B = path[s + 1];
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz), d = [dx / len, dz / len], n = [d[1], -d[0]];
  const pt = t => [A.x + d[0] * t, A.z + d[1] * t];
  const nrm = t => vUnit([A.no[0] + (B.ni[0] - A.no[0]) * t / len, 0, A.no[2] + (B.ni[2] - A.no[2]) * t / len]);
  const panel = (t0, t1) => {
    const a = pt(t0), b = pt(t1), na = nrm(t0), nb = nrm(t1);
    addQuad(P, 'cs', [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], DECK, b[1]], [a[0], DECK, a[1]]], A.no, [na, nb, nb, na]);
  };
  let t = 0;
  cutList.forEach(c0 => {
    const c = Math.min(Math.max(c0, 0.06), len - 0.06);
    const e0 = pt(c - 0.05), e1 = pt(c + 0.05);
    const f0 = [e0[0] - n[0] * 0.05, e0[1] - n[1] * 0.05], f1 = [e1[0] - n[0] * 0.05, e1[1] - n[1] * 0.05];
    panel(t, c - 0.05);
    addQuad(PG, 'tg', [[f0[0], 0, f0[1]], [f1[0], 0, f1[1]], [f1[0], DECK, f1[1]], [f0[0], DECK, f0[1]]], [n[0], 0, n[1]]);
    addQuad(PG, 'tg', [[e0[0], 0, e0[1]], [f0[0], 0, f0[1]], [f0[0], DECK, f0[1]], [e0[0], DECK, e0[1]]], [d[0], 0, d[1]]);
    addQuad(PG, 'tg', [[e1[0], 0, e1[1]], [f1[0], 0, f1[1]], [f1[0], DECK, f1[1]], [e1[0], DECK, e1[1]]], [-d[0], 0, -d[1]]);
    t = c + 0.05;
  });
  panel(t, len);
}

function partMesh(name, P) {
  const keys = Object.keys(P.b);
  if (!keys.length) return null;
  const pos = [], nrm = [], idx = [], rng = [], mats = [];
  let base = 0;
  keys.forEach((k, mi) => {
    const B = P.b[k], start = idx.length;
    for (let j = 0; j < B.p.length; j++) { pos.push(B.p[j]); nrm.push(B.n[j]); }
    for (let j = 0; j < B.i.length; j++) idx.push(B.i[j] + base);
    rng.push([start, idx.length - start, mi]);
    base += B.p.length / 3;
    mats.push(MAT[k]);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  if (keys.length > 1) rng.forEach(r => g.addGroup(r[0], r[1], r[2]));
  const mesh = new THREE.Mesh(g, keys.length > 1 ? mats : mats[0]);
  mesh.name = name;
  return mesh;
}
function mkGroup(name, parent) { const o = new THREE.Object3D(); o.name = name; parent.add(o); return o; }
function put(parent, mesh) { if (mesh) parent.add(mesh); return mesh; }
function addLoc(parent, name, x, y, z) { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z * SZ); parent.add(o); }

// ---- tables from the contract, truncated to the straight hall length (a pod is built only when its whole X extent lies within 0..L) ----
const outerPodSpan = [];
for (let k = 0; k < 18; k++) { const x0 = 25 + 144 * k, e = k === 17 ? 2515 : x0 + 70; if (e > L) break; outerPodSpan.push([x0, e]); }
const splitPodSpan = [];
for (let k = 0; k < 17; k++) { const x0 = 65 + 144 * k, e = x0 + 50; if (e > L) break; splitPodSpan.push([x0, e]); }
const bandSpan = [];
for (let k = 0; k < 7; k++) { const x0 = 35 + 370 * k, e = k === 6 ? 2495 : x0 + 250; if (e > L) break; bandSpan.push([x0, e]); }

// seam positions (distance from each segment start): X = 12 j from the seam plane on the long faces (not under a bay fin), every 12 m of arc on the swept face, every 12 m from the swept corner on the flat end
const cuts = {};
const addCut = (s, t) => { (cuts[s] || (cuts[s] = [])).push(t); };
if (!far) {
  for (let j = 1; 12 * j < L; j++) if ((12 * j) % 72 !== 0) addCut(0, 12 * j);
  const cum = [0];
  for (let s = 1; s <= NS; s++) cum.push(cum[s - 1] + Math.hypot(path[s + 1].x - path[s].x, path[s + 1].z - path[s].z));
  for (let a = 12; a < cum[NS] - 3; a += 12) { let s = 1; while (cum[s] <= a) s++; addCut(s, a - cum[s - 1]); }
  for (let j = 1; 12 * j < 187; j++) addCut(NS + 1, 12 * j);
  for (let j = Math.floor((XE - 3) / 12); j >= 1; j--) { const X = 12 * j; if (X % 72 === 0 && X <= L) continue; addCut(NS + 2, XE - X); }
}

// port pod: steel box, graphite plinth band, roof-steel top, recessed lit loading panel (Y 3 to 2 m below the top), tilted canopy wing
function buildPod(name, x0, x1, zw, s, proj, h) {
  const P = newPart();
  const zf = zw + s * proj, yt = h - 2;
  const zlo = Math.min(zw, zf), zhi = Math.max(zw, zf);
  const backSkip = s < 0 ? 'pz' : 'nz';
  if (far) {
    addBox(P, 'cs', x0, x1, 0, h, zlo, zhi, 'ny py ' + backSkip);
    addQuad(P, 'rs', [[x0, h, zlo], [x1, h, zlo], [x1, h, zhi], [x0, h, zhi]], [0, 1, 0]);
    return partMesh(name, P);
  }
  const zp = zf - s * 0.3, xa = x0 + 1, xb = x1 - 1, fz = [0, 0, s];
  addQuad(P, 'pg', [[x0, 0, zw], [x0, 3, zw], [x0, 3, zf], [x0, 0, zf]], [-1, 0, 0]);
  addQuad(P, 'pg', [[x1, 0, zw], [x1, 3, zw], [x1, 3, zf], [x1, 0, zf]], [1, 0, 0]);
  addQuad(P, 'pg', [[x0, 0, zf], [x1, 0, zf], [x1, 3, zf], [x0, 3, zf]], fz);
  addQuad(P, 'pg', [[xa, 3, zp], [xb, 3, zp], [xb, 3, zf], [xa, 3, zf]], [0, 1, 0]);
  addQuad(P, 'cs', [[x0, 3, zw], [x0, h, zw], [x0, h, zf], [x0, 3, zf]], [-1, 0, 0]);
  addQuad(P, 'cs', [[x1, 3, zw], [x1, h, zw], [x1, h, zf], [x1, 3, zf]], [1, 0, 0]);
  addQuad(P, 'rs', [[x0, h, zw], [x1, h, zw], [x1, h, zf], [x0, h, zf]], [0, 1, 0]);
  addQuad(P, 'cs', [[x0, 3, zf], [xa, 3, zf], [xa, h, zf], [x0, h, zf]], fz);
  addQuad(P, 'cs', [[xb, 3, zf], [x1, 3, zf], [x1, h, zf], [xb, h, zf]], fz);
  addQuad(P, 'cs', [[xa, yt, zf], [xb, yt, zf], [xb, h, zf], [xa, h, zf]], fz);
  addQuad(P, 'cs', [[xa, 3, zf], [xa, yt, zf], [xa, yt, zp], [xa, 3, zp]], [1, 0, 0]);
  addQuad(P, 'cs', [[xb, 3, zf], [xb, yt, zf], [xb, yt, zp], [xb, 3, zp]], [-1, 0, 0]);
  addQuad(P, 'cs', [[xa, yt, zf], [xb, yt, zf], [xb, yt, zp], [xa, yt, zp]], [0, -1, 0]);
  addQuad(P, 'pl', [[xa, 3, zp], [xb, 3, zp], [xb, yt, zp], [xa, yt, zp]], fz);
  const mesh = partMesh(name, P);
  const Q = newPart();
  const tv = 1.2 / CO8, ye = h + 12 * TH8, ze = zf + s * 12;
  addQuad(Q, 'rs', [[x0, h, zf], [x1, h, zf], [x1, ye, ze], [x0, ye, ze]], [0, 1, 0]);
  addQuad(Q, 'sl', [[x0, h - tv, zf], [x1, h - tv, zf], [x1, ye - tv, ze], [x0, ye - tv, ze]], [0, -1, 0]);
  addQuad(Q, 'rs', [[x0, ye - tv, ze], [x1, ye - tv, ze], [x1, ye, ze], [x0, ye, ze]], [0, 0, s]);
  addQuad(Q, 'rs', [[x0, h - tv, zf], [x0, h, zf], [x0, ye, ze], [x0, ye - tv, ze]], [-1, 0, 0]);
  addQuad(Q, 'rs', [[x1, h - tv, zf], [x1, h, zf], [x1, ye, ze], [x1, ye - tv, ze]], [1, 0, 0]);
  mesh.add(partMesh('podCanopy', Q));
  return mesh;
}

// raised roof monitor on the centreline: lit clerestory in the drawn 250 m rhythm between graphite, steel top, steel end face, open at X = 0
function buildMonitor() {
  const P = newPart();
  if (far) {
    addQuad(P, 'rw', [[0, DECK, -30], [L, DECK, -30], [L, 52, -30], [0, 52, -30]], [0, 0, -1]);
    addQuad(P, 'rw', [[0, DECK, 30], [L, DECK, 30], [L, 52, 30], [0, 52, 30]], [0, 0, 1]);
  } else {
    const xs = [0];
    bandSpan.forEach(sp => { xs.push(sp[0], sp[1]); });
    xs.push(L);
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1];
      if (xb <= xa) continue;
      const isLit = bandSpan.some(sp => sp[0] === xa && sp[1] === xb);
      [[-30, -1], [30, 1]].forEach(zs => {
        [[DECK, 47, 'tg'], [47, 51, isLit ? 'rw' : 'tg'], [51, 52, 'tg']].forEach(r => {
          addQuad(P, r[2], [[xa, r[0], zs[0]], [xb, r[0], zs[0]], [xb, r[1], zs[0]], [xa, r[1], zs[0]]], [0, 0, zs[1]]);
        });
      });
    }
  }
  addQuad(P, 'rs', [[0, 52, -30], [L, 52, -30], [L, 52, 30], [0, 52, 30]], [0, 1, 0]);
  addQuad(P, 'cs', [[L, DECK, -30], [L, DECK, 30], [L, 52, 30], [L, 52, -30]], [1, 0, 0]);
  return partMesh('roofMonitor', P);
}

function build() {
  const root = createRoot('s2Hall');
  const PG = newPart();

  // exterior walls (0.6 thick, open at the seam, no caps at junctions)
  [['outerWall', 0, 1], ['sweptWall', 1, NS + 1], ['endWall', NS + 1, NS + 2], ['splitWall', NS + 2, NSEG]].forEach(w => {
    const P = newPart();
    if (far) addRibbon(P, 'cs', 0, -0.6, 0, DECK, 'oit', w[1], w[2]);
    else {
      addRibbon(P, 'cs', 0, -0.6, 0, DECK, 'it', w[1], w[2]);
      for (let s = w[1]; s < w[2]; s++) addWallSkin(P, PG, s, cuts[s] || []);
    }
    put(root, partMesh(w[0], P));
  });

  let P;
  if (!far) {
    P = newPart();
    addRibbon(P, 'pg', 0.2, 0, 0, 3, 'ot', 0, NSEG);
    put(root, partMesh('plinth', P));

    P = newPart();
    for (let k = 1; k <= bays; k++) {
      const x = 72 * k;
      addBox(P, 'tg', x - 0.6, x + 0.6, 3, DECK, -HW - 0.6, -HW, 'pz');
      addBox(P, 'tg', x - 0.6, x + 0.6, 3, DECK, HW, HW + 0.6, 'nz');
    }
    put(root, partMesh('bayFins', P));

    P = newPart();
    [22, 44].forEach(y => addRibbon(P, 'tg', 0.3, 0, y - 0.3, y + 0.3, 'otb', 0, NSEG));
    put(root, partMesh('levelReveals', P));
  }

  P = newPart();
  addPrism(P, 'rs', polyOf(0.6), 45.4, DECK, false, !far);
  put(root, partMesh('roofDeck', P));

  if (!far) {
    P = newPart();
    addRibbon(P, 'tg', 0, -0.6, DECK, DECK + 1.2, 'oit', 0, NSEG);
    put(root, partMesh('roofEdge', P));

    P = newPart();
    addRibbon(P, 'el', 0.05, 0, DECK + 0.9, DECK + 1.2, 'otb', 0, NSEG);
    put(root, partMesh('edgeLights', P));

    put(root, partMesh('panelSeams', PG));
  }

  put(root, buildMonitor());

  if (!far) {
    // transverse ribs at each bay line, cut where they meet the monitor, ending inside the parapet, clipped at the end of the straight hall
    P = newPart();
    for (let k = 1; k <= bays; k++) {
      const xa = 72 * k - 1, xb = Math.min(72 * k + 1, L);
      addBox(P, 'tg', xa, xb, DECK, DECK + 1.5, -HW + 0.3, -30, 'ny nz pz');
      addBox(P, 'tg', xa, xb, DECK, DECK + 1.5, 30, HW - 0.3, 'ny nz pz');
      // each outer end sits 0.3 inside the parapet; only the 0.3 above the parapet top is exposed
      addQuad(P, 'tg', [[xa, DECK + 1.2, -HW + 0.3], [xb, DECK + 1.2, -HW + 0.3], [xb, DECK + 1.5, -HW + 0.3], [xa, DECK + 1.5, -HW + 0.3]], [0, 0, -1]);
      addQuad(P, 'tg', [[xa, DECK + 1.2, HW - 0.3], [xb, DECK + 1.2, HW - 0.3], [xb, DECK + 1.5, HW - 0.3], [xa, DECK + 1.5, HW - 0.3]], [0, 0, 1]);
    }
    put(root, partMesh('roofRibs', P));

    // plant blocks, two per bay: odd numbers on the outer row, even on the split row
    const ru = mkGroup('roofUnits', root);
    for (let k = 1; k <= bays; k++) {
      const xc = 36 + 72 * (k - 1);
      [[-160, 'nz'], [160, 'pz']].forEach((r, ri) => {
        const zc = r[0], Q = newPart();
        addBox(Q, 'cs', xc - 6, xc + 6, DECK, DECK + 4, zc - 4, zc + 4, 'ny ' + r[1]);
        if (r[1] === 'nz') addQuad(Q, 'tg', [[xc + 6, DECK, zc - 4], [xc - 6, DECK, zc - 4], [xc - 6, DECK + 4, zc - 4], [xc + 6, DECK + 4, zc - 4]], [0, 0, -1]);
        else addQuad(Q, 'tg', [[xc - 6, DECK, zc + 4], [xc + 6, DECK, zc + 4], [xc + 6, DECK + 4, zc + 4], [xc - 6, DECK + 4, zc + 4]], [0, 0, 1]);
        put(ru, partMesh('roofUnit' + pad2(2 * k - 1 + ri), Q));
      });
    }
  }

  const op = mkGroup('outerPods', root);
  outerPodSpan.forEach((s, j) => put(op, buildPod('outerPod' + pad2(j + 1), s[0], s[1], -HW, -1, 70, 24)));
  const sp = mkGroup('splitPods', root);
  splitPodSpan.forEach((s, j) => put(sp, buildPod('splitPod' + pad2(j + 1), s[0], s[1], HW, 1, 50, 20)));

  if (!far) {
    [['floorSlab', 'co', 0, 0.5], ['waffleSlabL1', 'co', 6.5, 7.4], ['cleanFloorL1', 'ft', 7.4, 8.0],
     ['ffuCeilingL1', 'fw', 14.0, 14.4], ['slabL2', 'co', 21.4, 22.5], ['waffleSlabL2', 'co', 28.5, 29.4],
     ['cleanFloorL2', 'ft', 29.4, 30.0], ['ffuCeilingL2', 'fw', 36.0, 36.4], ['topSlab', 'co', 43.4, 44.0]
    ].forEach(sl => {
      const Q = newPart();
      addPrism(Q, sl[1], polyOf(0.3), sl[2], sl[3], true, sl[0].indexOf('cleanFloor') < 0);
      put(root, partMesh(sl[0], Q));
    });
  }

  addLoc(root, 'seam', 0, 0, 0);
  addLoc(root, 'endCentre', XE, 0, 95);
  for (let nn = 1; nn <= bays; nn++) {
    const x = 36 + 72 * (nn - 1);
    addLoc(root, 'bay' + pad2(nn) + 'L1', x, 8.0, 0);
    addLoc(root, 'bay' + pad2(nn) + 'L2', x, 30.0, 0);
  }
  return root;
}
