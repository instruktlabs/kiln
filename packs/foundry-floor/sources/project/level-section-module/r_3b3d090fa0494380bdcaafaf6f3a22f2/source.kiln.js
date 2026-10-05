const meta = { name: 'level-section-module', role: 'building' };

// Datum: Y 0 = cleanroom walking surface. Footprint X -1.2..1.2 (cut face = +X), Z -3.6..3.6 (7.2 m pitch).
const XB = -1.2, XF = 1.2, ZA = -3.6, ZB = 3.6;
const BAND = {
  slabBot: -8.0, slabTop: -7.5, subTop: -1.5, plateTop: -0.6, floor: 0.0,
  ffuBot: 6.0, ffuTop: 6.4, intTop: 13.4, roofTop: 14.0,
};
const WAFFLE = { soffit: -1.5, plateBot: -0.85, plateTop: -0.6, rib: 0.15 };
const ZRIB = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => ZA + 0.9 * k);
const XRIB = [-1.2, -0.3, 0.6];
const TILE_T = 0.04, TILE_GAP = 0.01, FFU_GAP = 0.02, FFU_PACK = 0.2;

function zSpans(centres, half, gap) {
  return centres.map((c) => [Math.max(c - half + gap / 2, ZA), Math.min(c + half - gap / 2, ZB)]);
}
function xSpans(gap) {
  const e = [-1.2, -0.6, 0, 0.6, 1.2];
  return [0, 1, 2, 3].map((i) => [e[i] + (i > 0 ? gap / 2 : 0), e[i + 1] - (i < 3 ? gap / 2 : 0)]);
}
const TILE_Z = zSpans([-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((j) => 0.6 * j), 0.3, TILE_GAP);
const FFU_Z = zSpans([0, 1, 2, 3, 4, 5, 6].map((k) => ZA + 1.2 * k), 0.6, FFU_GAP);

function ribSpan(c) {
  return [Math.max(c - WAFFLE.rib, ZA), Math.min(c + WAFFLE.rib, ZB)];
}
// side faces of a member: back (x) always, cut side (X) only when it stops short of the plane, Z ends only inside the module
function sides(x1, z0, z1) {
  return 'x' + (x1 < XF - 1e-9 ? 'X' : '') + (z0 > ZA + 1e-9 ? 'z' : '') + (z1 < ZB - 1e-9 ? 'Z' : '');
}

function makeMaterials() {
  const m = (name, hex, roughness, metalness) => {
    const x = gameMaterial(hex, { roughness, metalness });
    x.name = name;
    return x;
  };
  return {
    concrete: m('concrete', 0x9c9a94, 0.95, 0),
    tile: m('floor-tile-grey', 0xd3d7da, 0.7, 0),
    stainless: m('stainless', 0xb9bec3, 0.35, 1),
    galv: m('galvanized-duct', 0xa3a8ab, 0.5, 0.8),
    graphite: m('trim-graphite', 0x3b4148, 0.5, 0.1),
    white: m('ffu-filter-white', 0xf1f3f4, 0.9, 0),
    pvc: m('pvc-grey', 0x8d9399, 0.7, 0),
    yellow: m('safety-yellow', 0xe9b824, 0.6, 0),
  };
}

function acc() {
  return { p: [], n: [], u: [], i: [] };
}
// one flat quad, counter-clockwise seen from outside (a,b,c,d in order); normal from the winding
function quad(g, a, b, c, d) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const k = g.p.length / 3;
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  for (const q of [a, b, c, d]) {
    g.p.push(q[0], q[1], q[2]);
    g.n.push(nx, ny, nz);
    if (ax >= ay && ax >= az) g.u.push(q[2], q[1]);
    else if (ay >= az) g.u.push(q[0], q[2]);
    else g.u.push(q[0], q[1]);
  }
  g.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
}
// same, but flips the winding so the normal points away from ref (convex solids)
function quadO(g, a, b, c, d, ref) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - ref[0];
  const my = (a[1] + b[1] + c[1] + d[1]) / 4 - ref[1];
  const mz = (a[2] + b[2] + c[2] + d[2]) / 4 - ref[2];
  if (nx * mx + ny * my + nz * mz < 0) quad(g, d, c, b, a);
  else quad(g, a, b, c, d);
}
// axis-aligned box; f lists the faces to emit: x/X = -X/+X, y/Y = bottom/top, z/Z = -Z/+Z
function box(g, x0, x1, y0, y1, z0, z1, f) {
  f = f || 'xXyYzZ';
  if (f.includes('X')) quad(g, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  if (f.includes('x')) quad(g, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
  if (f.includes('Y')) quad(g, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
  if (f.includes('y')) quad(g, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  if (f.includes('Z')) quad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  if (f.includes('z')) quad(g, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
}
// convex quadrilateral [y,z] outline extruded along X
function prismX(g, P, xa, xb) {
  const ref = [(xa + xb) / 2, (P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4];
  const at = (x, p) => [x, p[0], p[1]];
  quadO(g, at(xb, P[0]), at(xb, P[1]), at(xb, P[2]), at(xb, P[3]), ref);
  quadO(g, at(xa, P[0]), at(xa, P[1]), at(xa, P[2]), at(xa, P[3]), ref);
  for (let s = 0; s < 4; s++) {
    const a = P[s], b = P[(s + 1) % 4];
    quadO(g, at(xa, a), at(xa, b), at(xb, b), at(xb, a), ref);
  }
}
// slanted member with vertical end cuts: centreline (y0,z0)-(y1,z1), vertical thickness t
function diag(g, y0, z0, y1, z1, t, xa, xb) {
  prismX(g, [[y0 - t / 2, z0], [y0 + t / 2, z0], [y1 + t / 2, z1], [y1 - t / 2, z1]], xa, xb);
}
// convex [x,z] outline extruded along Y, side walls only
function prismY(g, P, y0, y1) {
  let cx = 0, cz = 0;
  for (const p of P) { cx += p[0]; cz += p[1]; }
  const ref = [cx / P.length, (y0 + y1) / 2, cz / P.length];
  for (let s = 0; s < P.length; s++) {
    const a = P[s], b = P[(s + 1) % P.length];
    quadO(g, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], ref);
  }
}
// open-ended tube along Z with smooth normals and no end caps
function tubeZ(g, cx, cy, r, z0, z1, seg) {
  const k = g.p.length / 3;
  for (let s = 0; s < seg; s++) {
    const a = (2 * Math.PI * s) / seg, c = Math.cos(a), sn = Math.sin(a);
    for (const z of [z0, z1]) {
      g.p.push(cx + r * c, cy + r * sn, z);
      g.n.push(c, sn, 0);
      g.u.push(s / seg, z);
    }
  }
  for (let s = 0; s < seg; s++) {
    const s2 = (s + 1) % seg;
    g.i.push(k + 2 * s, k + 2 * s2, k + 2 * s2 + 1, k + 2 * s, k + 2 * s2 + 1, k + 2 * s + 1);
  }
}
// open-ended vertical tube with smooth normals
function tubeY(g, cx, cz, r, y0, y1, seg) {
  const k = g.p.length / 3;
  for (let s = 0; s < seg; s++) {
    const a = (-2 * Math.PI * s) / seg, c = Math.cos(a), sn = Math.sin(a);
    for (const y of [y0, y1]) {
      g.p.push(cx + r * c, y, cz + r * sn);
      g.n.push(c, 0, sn);
      g.u.push(s / seg, y);
    }
  }
  for (let s = 0; s < seg; s++) {
    const s2 = (s + 1) % seg;
    g.i.push(k + 2 * s, k + 2 * s2, k + 2 * s2 + 1, k + 2 * s, k + 2 * s2 + 1, k + 2 * s + 1);
  }
}
function emit(parent, name, g, material) {
  const mesh = createPart(name, meshGeo({ positions: g.p, indices: g.i, normals: g.n, uvs: g.u }), material, { parent });
  mesh.name = name;
  return mesh;
}
function group(parent, name) {
  const node = new THREE.Group();
  node.name = name;
  parent.add(node);
  return node;
}

const CAP = { concrete: acc(), tile: acc(), white: acc(), housing: acc() };
// flat cap on the cut plane X = XF, facing +X, covering [y0,y1] x [z0,z1]
function capQuad(g, y0, y1, z0, z1) {
  quad(g, [XF, y0, z0], [XF, y1, z0], [XF, y1, z1], [XF, y0, z1]);
}

function buildFloorSlab(root, M) {
  const g = acc();
  box(g, XB, XF, BAND.slabBot, BAND.slabTop, ZA, ZB, 'xyY');
  emit(root, 'floorSlab', g, M.concrete);
  capQuad(CAP.concrete, BAND.slabBot, BAND.slabTop, ZA, ZB);
}

function buildRoofSlab(root, M) {
  const g = acc();
  box(g, XB, XF, BAND.intTop, BAND.roofTop, ZA, ZB, 'xyY');
  emit(root, 'roofSlab', g, M.concrete);
  capQuad(CAP.concrete, BAND.intTop, BAND.roofTop, ZA, ZB);
}

// 0.8 x 0.8 chamfered column at Z -3.6..-2.8 (centre -3.2), from the floor slab to the waffle soffit
function buildColumn(root, M) {
  const g = acc();
  const c = 0.08, h = 0.4, zc = -3.2;
  const P = [
    [-h + c, zc - h], [h - c, zc - h], [h, zc - h + c], [h, zc + h - c],
    [h - c, zc + h], [-h + c, zc + h], [-h, zc + h - c], [-h, zc - h + c],
  ];
  prismY(g, P, BAND.slabTop, BAND.subTop);
  emit(root, 'subfabColumns', g, M.concrete);
}

function buildWaffle(root, M) {
  const wf = group(root, 'waffleSlab');
  const g = acc(), gp = acc();
  const yb = WAFFLE.plateBot, yt = WAFFLE.plateTop, ys = WAFFLE.soffit;
  box(g, XB, XF, yb, yt, ZA, ZB, 'xyY');
  quad(g, [XB, ys, ZA], [XB, ys, ZB], [XB, yb, ZB], [XB, yb, ZA]);
  const zr = ZRIB.map(ribSpan);
  const xr = XRIB.map((c) => [Math.max(c - WAFFLE.rib, XB), Math.min(c + WAFFLE.rib, XF)]);
  for (const [z0, z1] of zr) box(g, XB, XF, ys, ys, z0, z1, 'y');
  for (const [x0, x1] of xr) {
    for (let j = 0; j < zr.length - 1; j++) box(g, x0, x1, ys, ys, zr[j][1], zr[j + 1][0], 'y');
  }
  for (let i = 0; i < xr.length; i++) {
    const px0 = xr[i][1], px1 = i + 1 < xr.length ? xr[i + 1][0] : XF;
    const open = i + 1 >= xr.length;
    for (let j = 0; j < zr.length - 1; j++) {
      const z0 = zr[j][1], z1 = zr[j + 1][0];
      quad(gp, [px0, ys, z0], [px0, yb, z0], [px0, yb, z1], [px0, ys, z1]);
      if (!open) quad(gp, [px1, ys, z0], [px1, ys, z1], [px1, yb, z1], [px1, yb, z0]);
      quad(gp, [px0, ys, z0], [px1, ys, z0], [px1, yb, z0], [px0, yb, z0]);
      quad(gp, [px0, ys, z1], [px0, yb, z1], [px1, yb, z1], [px1, ys, z1]);
    }
  }
  emit(wf, 'waffleSlab_concrete', g, M.concrete);
  emit(wf, 'waffleSlab_pockets', gp, M.graphite);
  capQuad(CAP.concrete, yb, yt, ZA, ZB);
  for (const [z0, z1] of zr) capQuad(CAP.concrete, ys, yb, z0, z1);
}

// raised floor: seam-centred 0.6 m tiles on pedestals; ends are half tiles with no Z faces
function buildRaisedFloor(root, M) {
  const rf = group(root, 'raisedFloor');
  const tiles = acc();
  for (const [x0, x1] of xSpans(TILE_GAP)) {
    for (const [z0, z1] of TILE_Z) {
      box(tiles, x0, x1, -TILE_T, 0, z0, z1, 'Yy' + sides(x1, z0, z1));
    }
  }
  emit(rf, 'raisedFloor_tiles', tiles, M.tile);
  capQuad(CAP.tile, -TILE_T, 0, ZA, ZB);

  const ped = acc();
  for (const x of [-0.6, 0, 0.6]) {
    for (let m = 0; m < 6; m++) {
      for (const s of [-1, 1]) {
        const z = s * (0.3 + 0.6 * m);
        tubeY(ped, x, z, 0.02, -0.56, -0.05, 8);
        box(ped, x - 0.06, x + 0.06, -0.6, -0.56, z - 0.06, z + 0.06, 'xXzZY');
        box(ped, x - 0.05, x + 0.05, -0.05, -0.04, z - 0.05, z + 0.05, 'xXzZy');
      }
    }
  }
  emit(rf, 'raisedFloor_pedestals', ped, M.galv);
}

// FFU ceiling: two rows in X, seam-centred 1.2 m units in Z; cut by the plane (caps in cutFaceCaps)
function buildFfuPlenum(root, M) {
  const ff = group(root, 'ffuPlenum');
  const pack = acc(), hous = acc();
  const xs = [[XB, -FFU_GAP / 2], [FFU_GAP / 2, XF]];
  const yp = BAND.ffuBot + FFU_PACK;
  for (const [x0, x1] of xs) {
    for (const [z0, z1] of FFU_Z) {
      const s = sides(x1, z0, z1);
      box(pack, x0, x1, BAND.ffuBot, yp, z0, z1, 'y' + s);
      box(hous, x0, x1, yp, BAND.ffuTop, z0, z1, 'Y' + s);
      if (x1 > XF - 1e-9) {
        capQuad(CAP.white, BAND.ffuBot, yp, z0, z1);
        capQuad(CAP.housing, yp, BAND.ffuTop, z0, z1);
      }
    }
  }
  emit(ff, 'ffuPlenum_packs', pack, M.white);
  emit(ff, 'ffuPlenum_housings', hous, M.galv);
}

const TR = { fA: [0.9, 1.1], fB: [-1.05, -0.85], deckX: [-0.85, 0.9], pw: 0.1 };
const TR_NODES = [0, 1, 2, 3, 4, 5, 6].map((k) => ZA + 1.2 * k);
const TR_Y = { b0: 6.4, b1: 6.7, m0: 9.775, m1: 10.025, t0: 13.1, t1: 13.4 };

function trussFrame(g, xa, xb) {
  for (const [y0, y1] of [[TR_Y.b0, TR_Y.b1], [TR_Y.m0, TR_Y.m1], [TR_Y.t0, TR_Y.t1]]) {
    box(g, xa, xb, y0, y1, ZA, ZB, 'xXyY');
  }
  TR_NODES.forEach((z, k) => {
    const z0 = Math.max(z - TR.pw, ZA), z1 = Math.min(z + TR.pw, ZB);
    const f = 'xX' + (k === 0 ? 'Z' : k === TR_NODES.length - 1 ? 'z' : '');
    box(g, xa, xb, TR_Y.b1, TR_Y.m0, z0, z1, f);
    box(g, xa, xb, TR_Y.m1, TR_Y.t0, z0, z1, f);
  });
  for (let k = 0; k < TR_NODES.length - 1; k++) {
    const za = TR_NODES[k] + TR.pw, zb = TR_NODES[k + 1] - TR.pw;
    for (const [y0, y1] of [[TR_Y.b1, TR_Y.m0], [TR_Y.m1, TR_Y.t0]]) {
      diag(g, y0, za, y1, zb, 0.12, xa, xb);
      diag(g, y1, za, y0, zb, 0.12, xa, xb);
    }
  }
}

function fanUnit(g, gv, zc) {
  box(g, -0.5, 0.5, 6.7, 7.9, zc - 0.5, zc + 0.5, 'xXYzZ');
  tubeY(g, 0, zc, 0.36, 7.9, 8.1, 24);
  tubeY(g, 0, zc, 0.09, 7.9, 8.0, 12);
  for (let b = 0; b < 3; b++) {
    const a = (Math.PI * b) / 3, c = Math.cos(a) * 0.34, s = Math.sin(a) * 0.34;
    quad(gv, [-c, 7.95, zc - s], [c, 7.95, zc + s], [c + 0.02 * s, 7.96, zc - 0.02 * c + s], [-c + 0.02 * s, 7.96, zc - 0.02 * c - s]);
  }
}

function buildTruss(root, M) {
  const tr = group(root, 'interstitialTruss');
  const st = acc(), dk = acc(), gv = acc(), yl = acc(), hub = acc();
  trussFrame(st, TR.fA[0], TR.fA[1]);
  trussFrame(st, TR.fB[0], TR.fB[1]);
  box(dk, TR.deckX[0], TR.deckX[1], 6.62, 6.7, ZA, ZB, 'xXyY');
  TR_NODES.forEach((z, k) => {
    const z0 = Math.max(z - 0.1, ZA), z1 = Math.min(z + 0.1, ZB);
    const f = 'xXy' + (k === 0 ? 'Z' : k === TR_NODES.length - 1 ? 'z' : 'zZ');
    box(dk, TR.deckX[0], TR.deckX[1], 6.4, 6.62, z0, z1, f);
    box(dk, TR.deckX[0], TR.deckX[1], 13.2, TR_Y.t1, z0, z1, f);
  });
  for (const x of [-0.7, 0.7]) {
    box(dk, x - 0.02, x + 0.02, 7.2, 7.23, ZA, ZB, 'xXyY');
    box(dk, x - 0.02, x + 0.02, 7.72, 7.76, ZA, ZB, 'xXyY');
    for (let j = -6; j <= 6; j++) {
      const z = 0.6 * j, z0 = Math.max(z - 0.02, ZA), z1 = Math.min(z + 0.02, ZB);
      box(dk, x - 0.02, x + 0.02, 6.7, 7.72, z0, z1, 'xXY' + (j === -6 ? 'Z' : j === 6 ? 'z' : 'zZ'));
    }
  }
  for (let k = -3; k <= 3; k++) {
    const z = 1.2 * k, z0 = Math.max(z - 0.45, ZA), z1 = Math.min(z + 0.45, ZB);
    const f = 'xXY' + (z0 > ZA ? 'z' : '') + (z1 < ZB ? 'Z' : '');
    box(yl, 0.78, 0.88, 6.7, 6.705, z0, z1, f);
    box(yl, -0.85, -0.75, 6.7, 6.705, z0, z1, f);
  }
  fanUnit(gv, hub, -1.6);
  fanUnit(gv, hub, 1.6);
  emit(tr, 'interstitialTruss_steel', st, M.galv);
  emit(tr, 'interstitialTruss_deck', dk, M.graphite);
  emit(tr, 'interstitialTruss_fans', gv, M.galv);
  emit(tr, 'interstitialTruss_fanBlades', hub, M.graphite);
  emit(tr, 'interstitialTruss_stripes', yl, M.yellow);
}

function buildBackWalls(root, M) {
  const bw = group(root, 'backWalls');
  const g = acc();
  for (const [y0, y1] of [[BAND.slabTop, BAND.subTop], [BAND.ffuTop, BAND.intTop]]) {
    box(g, XB, XB + 0.05, y0, y1, ZA, ZB, 'xX');
    for (let k = -3; k <= 3; k++) {
      const z = 1.2 * k, z0 = Math.max(z - 0.03, ZA), z1 = Math.min(z + 0.03, ZB);
      box(g, XB + 0.05, XB + 0.07, y0, y1, z0, z1, 'X' + (z0 > ZA ? 'z' : '') + (z1 < ZB ? 'Z' : ''));
    }
  }
  emit(bw, 'backWalls_panels', g, M.graphite);
}

const FLOOR_Y = BAND.slabTop;
// wall rack: one stacked column against the back wall panel (face X -1.13), pipe Y -7.17..-5.63
const RACK_X = -0.85, WALL_FACE = XB + 0.07;
const MAINS = (() => {
  const out = []; let y = -7.17;
  for (const d of [0.36, 0.32, 0.32, 0.30]) { out.push({ x: RACK_X, d, cy: y + d / 2, lat: null }); y += d + 0.08; }
  return out;
})();
MAINS[0].lat = [[-2.25, -0.86], [2.25, -0.86]];
MAINS[1].lat = [[-1.35, -0.86], [1.35, -0.86]];
MAINS[2].lat = [[-0.45, -0.86], [0.45, -0.86]];
MAINS[3].lat = [[-1.8, -1.45], [1.8, -1.45]];
const LAT_X = -0.58;
const BRACKET_Z = [-2.4, 0, 2.4];
const SHAFT = { x: 0.8, z0: 2.6, z1: 3.4, y0: -6.6, y1: 11.4, inset: 0.02, flanges: [-6.6, -4.0, 2.0, 8.0, 11.3] };

function buildMains(root, M) {
  const mp = group(root, 'mainsPipes');
  const pipes = acc(), brackets = acc();
  for (const { x, d, cy } of MAINS) {
    const r = d / 2;
    tubeZ(pipes, x, cy, r, ZA, ZB, 24);
    for (const z of [-1.2, 1.2]) {
      box(pipes, x - r - 0.03, x + r + 0.03, cy - r - 0.03, cy + r + 0.03, z - 0.03, z + 0.03, 'xXyYzZ');
    }
  }
  for (const z of BRACKET_Z) {
    box(brackets, WALL_FACE, WALL_FACE + 0.02, -7.2, -5.6, z - 0.07, z + 0.07, 'XyYzZ');
    for (const { x, d, cy } of MAINS) {
      box(brackets, WALL_FACE + 0.02, x, cy - d / 2 - 0.03, cy - d / 2 + 0.005, z - 0.05, z + 0.05, 'xXyYzZ');
    }
  }
  emit(mp, 'mainsPipes_pipes', pipes, M.stainless);
  emit(mp, 'mainsPipes_brackets', brackets, M.graphite);
}

function buildLaterals(root, M) {
  const g = acc();
  for (const { x, cy, lat } of MAINS) {
    for (const [z, top] of lat) {
      tubeY(g, LAT_X, z, 0.06, cy, top, 8);
      box(g, x, LAT_X, cy - 0.04, cy + 0.04, z - 0.04, z + 0.04, 'xXyYzZ');
    }
  }
  emit(root, 'lateralPipes', g, M.pvc);
}

function buildShaft(root, M) {
  const g = acc();
  const S = SHAFT, i = S.inset;
  box(g, -S.x + i, S.x - i, S.y0, S.y1, S.z0 + i, S.z1 - i, 'xXzZ');
  for (const y of S.flanges) box(g, -S.x, S.x, y, y + 0.1, S.z0, S.z1, 'xXyYzZ');
  for (const x of [-0.3, 0.3]) {
    for (const z of [2.75, 3.25]) box(g, x - 0.04, x + 0.04, FLOOR_Y, S.y0, z - 0.04, z + 0.04, 'xXzZ');
  }
  emit(root, 'returnAirShaft', g, M.galv);
}

function buildLocator(root) {
  const loc = new THREE.Object3D();
  loc.name = 'subfabKitMount';
  loc.position.set(0.35, FLOOR_Y, 0);
  root.add(loc);
}

function buildCaps(root, M) {
  const cf = group(root, 'cutFaceCaps');
  emit(cf, 'cutFaceCaps_concrete', CAP.concrete, M.concrete);
  emit(cf, 'cutFaceCaps_raisedFloor', CAP.tile, M.tile);
  emit(cf, 'cutFaceCaps_ffuWhite', CAP.white, M.white);
  emit(cf, 'cutFaceCaps_ffuHousing', CAP.housing, M.galv);
}

function build() {
  const root = createRoot('LevelSectionModule');
  const M = makeMaterials();
  buildFloorSlab(root, M);
  buildColumn(root, M);
  buildWaffle(root, M);
  buildRaisedFloor(root, M);
  buildFfuPlenum(root, M);
  buildTruss(root, M);
  buildShaft(root, M);
  buildMains(root, M);
  buildLaterals(root, M);
  buildRoofSlab(root, M);
  buildBackWalls(root, M);
  buildLocator(root);
  buildCaps(root, M);
  return root;
}
