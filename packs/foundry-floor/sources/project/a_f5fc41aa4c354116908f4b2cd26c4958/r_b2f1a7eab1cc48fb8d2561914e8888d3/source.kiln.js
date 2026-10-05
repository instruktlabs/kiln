// Foundry Floor S3 cross-pass link, review-2 revision: V-shaped enclosed bridge, arms 60 wide (contract revision 3: edge-lit strip on top of the parapet plus the plinth-top strip).
const armWidth = 60;
const R = 30, NA = 16, EXT = 10, STOP = 4;

const meta = { name: 's3-link' };

const H = 30, WT = 0.6, PLH = 3, GY0 = 8, GY1 = 14, REC = 0.3, RY0 = 21.7, RY1 = 22.3, RP = 0.3, PLP = 0.2, PARH = 1.2, DK0 = 29.4;

function mkMat(name, color, rough, metal, emissive) {
  const o = { roughness: rough, metalness: metal, flatShading: false };
  if (emissive !== undefined) { o.emissive = emissive; o.emissiveIntensity = 1; }
  const m = gameMaterial(color, o);
  m.name = name;
  return m;
}
const MAT = {
  cs: mkMat('cladding-steel', 0xC9CDD1, 0.30, 1.0),
  pg: mkMat('plinth-graphite', 0x1C2128, 0.60, 0.3),
  rs: mkMat('roof-steel', 0xBFC4C9, 0.40, 1.0),
  gd: mkMat('glazing-dark', 0x1E2A33, 0.15, 0),
  tg: mkMat('trim-graphite', 0x3B4148, 0.50, 0.1),
  el: mkMat('edge-lit', 0xFFE7C2, 0.40, 0, 0xFFE7C2),
};

const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vNeg = a => [-a[0], -a[1], -a[2]];
const vUnit = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

function newPart() { return { b: {} }; }
function emitPoly(P, k, pts, nrm) {
  const B = P.b[k] || (P.b[k] = { p: [], n: [], i: [] });
  const base = B.p.length / 3;
  for (let j = 0; j < pts.length; j++) { B.p.push(pts[j][0], pts[j][1], pts[j][2]); B.n.push(nrm[j][0], nrm[j][1], nrm[j][2]); }
  const t = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
  for (let j = 0; j < t.length; j++) B.i.push(base + t[j]);
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
function partMesh(name, P) {
  const k = Object.keys(P.b)[0];
  const B = P.b[k];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
  g.setIndex(B.i);
  const mesh = new THREE.Mesh(g, MAT[k]);
  mesh.name = name;
  return mesh;
}

// ---- plan loop (x,z), clockwise seen with +x right and +z up; edge i runs from V[i] to V[i+1] ----
const hw = armWidth / 2;
const Lc = Math.hypot(271, 150), ux = 271 / Lc, uz = -150 / Lc, nx = -uz, nz = ux;
const tEnd = Lc + EXT, tG = tEnd - STOP;
const onArm = (t, off) => [t * ux + off * nx, t * uz + off * nz];
const mir = p => [-p[0], p[1]];
const thB = Math.atan2(nz, nx), thA = Math.PI - thB;
const czc = (hw - R) / ux;
const xa = R * Math.cos(thB);
const V = [];
// g: edge is glazed, s: edge carries the parapet, p: part (0 armA, 1 apex, 2 armB)
function vtx(pt, g, s, p) { V.push({ x: pt[0], z: pt[1], g, s, p }); }
vtx(mir(onArm(tEnd, hw)), false, true, 0);
vtx(mir(onArm(tG, hw)), true, true, 0);
for (let k = 0; k < NA; k++) { const a = thA - (thA - thB) * k / NA; vtx([R * Math.cos(a), czc + R * Math.sin(a)], true, true, 1); }
vtx([R * Math.cos(thB), czc + R * Math.sin(thB)], true, true, 2);
vtx(onArm(tG, hw), false, true, 2);
vtx(onArm(tEnd, hw), false, false, 2);
vtx(onArm(tEnd, -hw), false, true, 2);
vtx(onArm(tG, -hw), true, true, 2);
vtx(onArm((xa + hw * nx) / ux, -hw), true, true, 1);
vtx([0, -hw / ux], true, true, 1);
vtx(mir(onArm((xa + hw * nx) / ux, -hw)), true, true, 0);
vtx(mir(onArm(tG, -hw)), false, true, 0);
vtx(mir(onArm(tEnd, -hw)), false, false, 0);
const nV = V.length;
const dirs = [], nrms = [];
for (let i = 0; i < nV; i++) {
  const a = V[i], b = V[(i + 1) % nV];
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  dirs.push([dx / l, 0, dz / l]);
  nrms.push([-dz / l, 0, dx / l]);
}
const mit = [], vn = [], sm = [];
for (let i = 0; i < nV; i++) {
  const n0 = nrms[(i - 1 + nV) % nV], n1 = nrms[i];
  const d = 1 + vDot(n0, n1);
  mit.push([(n0[0] + n1[0]) / d, (n0[2] + n1[2]) / d]);
  vn.push(vUnit([n0[0] + n1[0], 0, n0[2] + n1[2]]));
  sm.push(vDot(n0, n1) > 0.978);
}
const off = (i, d) => [V[i].x + d * mit[i][0], V[i].z + d * mit[i][1]];

function ring(P, k, i, d0, d1, y0, y1, faces, flushA, flushB) {
  const j = (i + 1) % nV, n = nrms[i];
  const nA = sm[i] ? vn[i] : n, nB = sm[j] ? vn[j] : n;
  const at = (v, d, flush) => (flush ? [V[v].x + d * n[0], V[v].z + d * n[2]] : off(v, d));
  const oa = at(i, d0, flushA), ob = at(j, d0, flushB), ia = at(i, d1, flushA), ib = at(j, d1, flushB);
  if (faces.indexOf('o') >= 0) addQuad(P, k, [[oa[0], y0, oa[1]], [ob[0], y0, ob[1]], [ob[0], y1, ob[1]], [oa[0], y1, oa[1]]], n, [nA, nB, nB, nA]);
  if (faces.indexOf('i') >= 0) addQuad(P, k, [[ia[0], y0, ia[1]], [ib[0], y0, ib[1]], [ib[0], y1, ib[1]], [ia[0], y1, ia[1]]], vNeg(n), [vNeg(nA), vNeg(nB), vNeg(nB), vNeg(nA)]);
  if (faces.indexOf('t') >= 0) addQuad(P, k, [[oa[0], y1, oa[1]], [ob[0], y1, ob[1]], [ib[0], y1, ib[1]], [ia[0], y1, ia[1]]], [0, 1, 0]);
  if (faces.indexOf('b') >= 0) addQuad(P, k, [[oa[0], y0, oa[1]], [ob[0], y0, ob[1]], [ib[0], y0, ib[1]], [ia[0], y0, ia[1]]], [0, -1, 0]);
}
function earclip(pts) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1;
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cr(a, b, p) * sg >= -1e-9 && cr(b, c, p) * sg >= -1e-9 && cr(c, a, p) * sg >= -1e-9;
  const idx = pts.map((_, i) => i), out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let k = 0; k < idx.length && !cut; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const c0 = cr(pts[ia], pts[ib], pts[ic]) * sg;
      if (c0 < 1e-9) continue;
      let ok = true;
      for (let m = 0; m < idx.length; m++) {
        const q = idx[m];
        if (q === ia || q === ib || q === ic) continue;
        if (inTri(pts[q], pts[ia], pts[ib], pts[ic])) { ok = false; break; }
      }
      if (ok) { out.push([ia, ib, ic]); idx.splice(k, 1); cut = true; }
    }
    if (!cut) {
      for (let k = 0; k < idx.length && !cut; k++) {
        const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
        if (Math.abs(cr(pts[ia], pts[ib], pts[ic])) < 1e-9) { idx.splice(k, 1); cut = true; }
      }
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
function fill(P, k, pts, y, hint) {
  const tri = earclip(pts);
  tri.forEach(f => addTri(P, k, [pts[f[0]][0], y, pts[f[0]][1]], [pts[f[1]][0], y, pts[f[1]][1]], [pts[f[2]][0], y, pts[f[2]][1]], hint));
}
function vquad(P, k, i, d0, d1, y0, y1, hint) {
  const a = off(i, d0), b = off(i, d1);
  addQuad(P, k, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], hint);
}

const PA = [newPart(), newPart(), newPart()];
const PG = newPart(), PP = newPart(), PR = newPart(), PF = newPart(), PE = newPart(), PL = newPart();
for (let i = 0; i < nV; i++) {
  const W = PA[V[i].p], j = (i + 1) % nV;
  ring(W, 'cs', i, 0, 0, PLH, GY0, 'o');
  if (V[i].g) {
    addQuad(W, 'cs', [[off(i, 0)[0], GY0, off(i, 0)[1]], [off(j, 0)[0], GY0, off(j, 0)[1]], [off(j, -REC)[0], GY0, off(j, -REC)[1]], [off(i, -REC)[0], GY0, off(i, -REC)[1]]], [0, 1, 0]);
    addQuad(W, 'cs', [[off(i, 0)[0], GY1, off(i, 0)[1]], [off(j, 0)[0], GY1, off(j, 0)[1]], [off(j, -REC)[0], GY1, off(j, -REC)[1]], [off(i, -REC)[0], GY1, off(i, -REC)[1]]], [0, -1, 0]);
    ring(PG, 'gd', i, -REC, -REC, GY0, GY1, 'o');
  } else {
    ring(W, 'cs', i, 0, 0, GY0, GY1, 'o');
  }
  ring(W, 'cs', i, 0, 0, GY1, RY0, 'o');
  ring(W, 'cs', i, 0, 0, RY1, H, 'o');
  ring(W, 'cs', i, -WT, -WT, 0, DK0, 'i');
  if (!V[i].s) ring(W, 'cs', i, 0, -WT, H, H, 't');
  ring(PP, 'pg', i, PLP, PLP, 0, PLH, 'o');
  ring(PP, 'pg', i, PLP, 0, PLH, PLH, 't');
  ring(PP, 'pg', i, PLP, -WT, 0, 0, 'b');
  ring(PL, 'el', i, PLP, 0, PLH, PLH + 0.1, 'ot');
  ring(PR, 'tg', i, RP, RP, RY0, RY1, 'o');
  ring(PR, 'tg', i, RP, 0, RY1, RY1, 't');
  ring(PR, 'tg', i, RP, 0, RY0, RY0, 'b');
  if (V[i].s) {
    ring(PE, 'tg', i, 0, 0, H, H + PARH, 'o');
    ring(PE, 'tg', i, -WT, -WT, H, H + PARH, 'i');
    ring(PE, 'tg', i, 0, -WT, H + PARH, H + PARH, 't');
    ring(PL, 'el', i, 0, -0.3, H + PARH, H + PARH + 0.1, 'oit');
    const p = (i - 1 + nV) % nV;
    if (!V[p].s) { vquad(PE, 'tg', i, 0, -WT, H, H + PARH, vNeg(dirs[i])); vquad(PL, 'el', i, 0, -0.3, H + PARH, H + PARH + 0.1, vNeg(dirs[i])); }
    if (!V[j].s) { vquad(PE, 'tg', j, 0, -WT, H, H + PARH, dirs[i]); vquad(PL, 'el', j, 0, -0.3, H + PARH, H + PARH + 0.1, dirs[i]); }
  }
  const q = (i - 1 + nV) % nV;
  if (V[q].g !== V[i].g) {
    const ge = V[i].g;
    vquad(PA[V[ge ? i : q].p], 'cs', i, 0, -REC, GY0, GY1, ge ? dirs[i] : vNeg(dirs[q]));
  }
}
const inner = V.map((_, i) => off(i, -WT));
fill(PF, 'rs', inner, H, [0, 1, 0]);
fill(PF, 'rs', inner, DK0, [0, -1, 0]);

function loc(name, x, y, z) { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); return o; }

function build() {
  const root = createRoot('s3Link');
  root.add(partMesh('armA', PA[0]));
  root.add(partMesh('armB', PA[2]));
  root.add(partMesh('apexBlock', PA[1]));
  root.add(partMesh('plinth', PP));
  root.add(partMesh('glazingBand', PG));
  root.add(partMesh('levelReveal', PR));
  root.add(partMesh('roof', PF));
  root.add(partMesh('roofEdge', PE));
  root.add(partMesh('edgeLights', PL));
  root.add(loc('apex', 0, 0, 0));
  root.add(loc('endA', -271, 0, -150));
  root.add(loc('endB', 271, 0, -150));
  return root;
}
