// Visitor gallery segment: one tileable 7.2 m bay of the public viewing corridor. Metres, +X along the corridor,
// +Y up, +Z toward the cleanroom glazing line (the glazing itself is not part of the asset), -Z is the solid exterior wall.
// The slab underside is the Y=0 datum. Every long part runs exactly from X=-3.6 (open, no face) to X=+3.6 (one flat cap),
// so copies placed 7.2 m apart meet plane to plane with one face per part at each seam and never double an end cap.
const meta = { name: 'Visitor gallery segment' };

const HALF = 3.6, H = 3.0;
const Z_OUT = -1.8, Z_GLASS = 1.8;
const WALL_T = 0.12, Z_IN = Z_OUT + WALL_T;
const BASE_T = 0.04, SLAB_T = 0.05, WALK_T = 0.045, WALK_Z0 = -0.9, WALK_Z1 = 0.9;
const TILE_PITCH = 0.9, GROUT = 0.006, TILE_LOW = 0.035;
const SKIRT_H = 0.12, SKIRT_T = 0.015;
const JOINT_XS = [-1.8, 0, 1.8], JOINT_W = 0.02;
const CEIL_T = 0.04, CEIL_Y0 = H - CEIL_T;
const LIGHT_W = 0.4, LIGHT_Y0 = CEIL_Y0 - 0.015, LIGHT_Y1 = CEIL_Y0;
const RAIL_Z = Z_GLASS - 0.15, RAIL_TOP = 1.1, RAIL_R = 0.03, KNEE_Y = 0.55, KNEE_R = 0.018;
const POST_R = 0.025, POST_XS = [-2.7, -0.9, 0.9, 2.7], FLANGE_R = 0.07, FLANGE_Y0 = 0.03, FLANGE_H = 0.03;
const KIOSK_X = -2.4, KIOSK_W = 0.5, KIOSK_Z0 = 1.0, KIOSK_Z1 = 1.4, KIOSK_LOW = 1.0, KIOSK_TOP = 1.2;
const SCREEN_W = 0.36, SCREEN_L = 0.30, SCREEN_T = 0.008, SCREEN_LIFT = 0.002;
const BENCH_X0 = 0.6, BENCH_X1 = 3.0, BENCH_SEAT_Y = 0.45, BENCH_T = 0.06, BENCH_D = 0.42;
const FOOT = 0.002;
const SLOPE = Math.atan2(KIOSK_TOP - KIOSK_LOW, KIOSK_Z1 - KIOSK_Z0);

function makeMat(name, hex, roughness, metalness, glow) {
  const o = { roughness: roughness, metalness: metalness, flatShading: false };
  if (glow) { o.emissive = hex; o.emissiveIntensity = 1; }
  const m = gameMaterial(hex, o);
  m.name = name;
  return m;
}
function group(name, parent, pos) {
  const g = createPivot(name, pos || [0, 0, 0], parent);
  g.name = name;
  return g;
}
function part(name, geo, m, parent, pos, rot) {
  const p = createPart(name, geo, m, { position: pos, rotation: rot || [0, 0, 0], parent: parent });
  p.name = name;
  return p;
}
function box(name, m, parent, w, h, d, x, y, z) {
  return part(name, boxGeo(w, h, d), m, parent, [x, y, z]);
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function quad(pos, idx, nor, ring, out) {
  let q = ring;
  if (dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), out) < 0) q = [q[0], q[3], q[2], q[1]];
  const n = cross(sub(q[1], q[0]), sub(q[2], q[0]));
  const l = Math.hypot(n[0], n[1], n[2]);
  const base = pos.length / 3;
  q.forEach(function (v) { pos.push(v[0], v[1], v[2]); nor.push(n[0] / l, n[1] / l, n[2] / l); });
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
// Four-sided prism along X with hard-edged faces: open at x0, one flat cap at x1.
function prism(name, m, parent, x0, x1, y0, y1, z0, z1) {
  const pos = [], idx = [], nor = [];
  quad(pos, idx, nor, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
  quad(pos, idx, nor, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  quad(pos, idx, nor, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]);
  quad(pos, idx, nor, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
  quad(pos, idx, nor, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
  return part(name, meshGeo({ positions: pos, indices: idx, normals: nor }), m, parent, [0, 0, 0]);
}
// Round bar along X: smooth sides, open at x0, flat disc cap at x1.
function tube(name, m, parent, r, n, y, z, x0, x1) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n, c = Math.cos(t), s = Math.sin(t);
    pos.push(x0, y + r * s, z + r * c, x1, y + r * s, z + r * c);
    nor.push(0, s, c, 0, s, c);
  }
  for (let i = 0; i < n; i++) {
    const a = 2 * i, b = a + 1, a2 = 2 * ((i + 1) % n), b2 = a2 + 1;
    idx.push(a, b, a2, b, b2, a2);
  }
  const ctr = pos.length / 3;
  pos.push(x1, y, z);
  nor.push(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n;
    pos.push(x1, y + r * Math.sin(t), z + r * Math.cos(t));
    nor.push(1, 0, 0);
  }
  for (let i = 0; i < n; i++) idx.push(ctr, ctr + 1 + (i + 1) % n, ctr + 1 + i);
  return part(name, meshGeo({ positions: pos, indices: idx, normals: nor }), m, parent, [0, 0, 0]);
}

async function build() {
  const graphite = makeMat('trim-graphite', 0x3B4148, 0.5, 0.1);
  const white = makeMat('tool-shell-white', 0xE8EBEE, 0.55, 0.0);
  const tile = makeMat('floor-tile-grey', 0xD3D7DA, 0.7, 0.0);
  const steel = makeMat('stainless', 0xB9BEC3, 0.35, 1.0);
  const lightMat = makeMat('light-strip-white', 0xF4F6F8, 0.5, 0.0, true);
  const screenMat = makeMat('screen-glow', 0x9FD3F5, 0.3, 0.0, true);

  const root = createRoot('VisitorGallerySegment');

  // floorSlab: graphite base with grout-spaced 0.9 m tiles either side of a recessed graphite walkway.
  const floor = group('floorSlab', root);
  prism('floorSlab_base', graphite, floor, -HALF, HALF, 0, BASE_T, Z_IN, Z_GLASS);
  prism('floorSlab_walkway', graphite, floor, -HALF, HALF, BASE_T, WALK_T, WALK_Z0, WALK_Z1);
  const rows = [['A', Z_IN + 0.01, WALK_Z0 - GROUT / 2], ['B', WALK_Z1 + GROUT / 2, Z_GLASS - GROUT / 2]];
  rows.forEach(function (r) {
    for (let i = 0; i < 8; i++) {
      const cx = -HALF + TILE_PITCH * (i + 0.5);
      box('floorSlab_tile' + r[0] + (i + 1), tile, floor, TILE_PITCH - GROUT, SLAB_T - TILE_LOW, r[2] - r[1],
        cx, (TILE_LOW + SLAB_T) / 2, (r[1] + r[2]) / 2);
    }
  });

  const wall = group('outerWall', root);
  prism('outerWall_panel', white, wall, -HALF, HALF, 0, H, Z_OUT, Z_IN);
  prism('outerWall_skirting', graphite, wall, -HALF, HALF, BASE_T, SKIRT_H, Z_IN, Z_IN + SKIRT_T);
  JOINT_XS.forEach(function (x, i) {
    box('outerWall_joint' + (i + 1), graphite, wall, JOINT_W, CEIL_Y0 + 0.01 - (SKIRT_H - 0.02), 0.006,
      x, (SKIRT_H - 0.02 + CEIL_Y0 + 0.01) / 2, Z_IN);
  });

  prism('ceilingPanel', white, root, -HALF, HALF, CEIL_Y0, H, Z_IN, Z_GLASS);
  prism('ceilingLight', lightMat, root, -HALF, HALF, LIGHT_Y0, LIGHT_Y1, -LIGHT_W / 2, LIGHT_W / 2);

  const rail = group('handrail', root);
  const railAxisY = RAIL_TOP - RAIL_R;
  tube('handrail_topRail', steel, rail, RAIL_R, 16, railAxisY, RAIL_Z, -HALF, HALF);
  tube('handrail_kneeRail', steel, rail, KNEE_R, 12, KNEE_Y, RAIL_Z, -HALF, HALF);
  POST_XS.forEach(function (x, i) {
    const h = railAxisY - FOOT;
    part('handrail_post' + (i + 1), cylinderGeo(POST_R, POST_R, h, 12), steel, rail, [x, FOOT + h / 2, RAIL_Z]);
    part('handrail_flange' + (i + 1), cylinderGeo(FLANGE_R, FLANGE_R, FLANGE_H, 16), steel, rail,
      [x, FLANGE_Y0 + FLANGE_H / 2, RAIL_Z]);
  });

  const kiosk = group('infoKiosk', root);
  const side = [[-KIOSK_Z0, FOOT], [-KIOSK_Z0, KIOSK_LOW], [-KIOSK_Z1, KIOSK_TOP], [-KIOSK_Z1, FOOT]];
  part('infoKiosk_body', await extrudeProfile(side, { depth: KIOSK_W, axis: 'x' }), graphite, kiosk, [KIOSK_X, 0, 0]);
  const midZ = (KIOSK_Z0 + KIOSK_Z1) / 2, midY = (KIOSK_LOW + KIOSK_TOP) / 2;
  part('infoKiosk_screen', boxGeo(SCREEN_W, SCREEN_T, SCREEN_L), screenMat, kiosk,
    [KIOSK_X, midY + Math.cos(SLOPE) * SCREEN_LIFT, midZ - Math.sin(SLOPE) * SCREEN_LIFT], [-SLOPE * 180 / Math.PI, 0, 0]);

  const bench = group('bench', root);
  const benchZ = Z_IN - 0.005 + BENCH_D / 2;
  const seatLen = BENCH_X1 - BENCH_X0, benchCx = (BENCH_X0 + BENCH_X1) / 2;
  part('bench_seat', await roundedBoxGeo(seatLen, BENCH_T, BENCH_D, 0.012), graphite, bench,
    [benchCx, BENCH_SEAT_Y - BENCH_T / 2, benchZ]);
  box('bench_back', graphite, bench, seatLen, 0.36, 0.04, benchCx, 0.62, Z_IN + 0.012);
  const legTop = BENCH_SEAT_Y - BENCH_T + 0.01;
  [BENCH_X0 + 0.15, benchCx, BENCH_X1 - 0.15].forEach(function (x, i) {
    box('bench_leg' + (i + 1), steel, bench, 0.06, legTop - FOOT, 0.30, x, FOOT + (legTop - FOOT) / 2, benchZ);
  });

  group('tourCamera', root, [0, 1.6, 0.8]);
  group('kioskScreen', root, [KIOSK_X, 1.1, 1.2]);
  return root;
}
