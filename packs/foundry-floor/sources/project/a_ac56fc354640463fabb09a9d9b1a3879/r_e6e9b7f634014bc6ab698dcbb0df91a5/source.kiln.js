// Foundry Floor S4: winged arrival canopy. Own frame per structures-contract.md:
// origin on the campus axis at the plane of the heads' front faces, at grade;
// +X toward the buildings, +Y up, +Z across the split. The canopy lies at X <= 0.
// Variant constants (working method shared with S1). S4 ships one export: hand 'W', far false.
const hand = 'W'; // 'E' negates every Z (the plan is symmetric, so E builds the same canopy)
const far = false; // true: roof slab and 8-segment legs only, no footings or kerb

const meta = { name: 's4-canopy' + (hand === 'E' ? '-E' : '') + (far ? '-far' : ''), role: 'building' };

const S = hand === 'E' ? -1 : 1;

// ---- Brief dimensions (metres) ----
// Roof plan polygon (X, Z) as drawn, in order around the outline.
const PLAN = [[0, -60], [-80, -150], [-150, -150], [-100, -40], [-100, 40], [-150, 150], [-80, 150], [0, 60]];
const EDGE_LIT_H = 0.3;                                     // lit strip: the lower 0.3 m of the 2.5 m edge band
const ROOF_T = 2.5;                                         // roof slab and fascia height
function soffitY(x) { return 14 + 8 * (-x) / 150; }        // single inclined plane: 14 at X = 0, 22 at X = -150
const LEG_D = 1.5, LEG_SEG = far ? 8 : 24, LEG_SPREAD = 6;  // V legs 6 m apart at the soffit
const LEG_START = 0.15, LEG_INTO_ROOF = 1.0;                 // legs start inside the footing and end inside the slab
const FOOT = 4, FOOT_H = 0.3;
// column01..column08 base points (X, Z)
const COLUMNS = [[-55, -100], [-55, 100], [-100, -60], [-100, 60], [-95, -140], [-95, 140], [-135, -135], [-135, 135]];
const KERB_H = 0.3, KERB_W = 1.0, KERB_X0 = -100, KERB_Z = 60;

// ---- Mesh construction in hand-W coordinates; hand E negates Z and reverses winding ----
function makePart(name, mats) {
  const pos = [];
  const idx = mats.map(() => []);
  const api = {};
  const push = (slot, a, b, cc) => {
    if (S > 0) idx[slot].push(a, b, cc); else idx[slot].push(a, cc, b);
  };
  // Convex polygon of [x, y, z] points; n is the intended outward normal.
  api.poly = (slot, pts, n) => {
    let q = [];
    for (const p of pts) {
      const l = q[q.length - 1];
      if (!l || Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]) > 1e-6) q.push(p);
    }
    if (q.length > 2) {
      const f = q[0], l = q[q.length - 1];
      if (Math.hypot(f[0] - l[0], f[1] - l[1], f[2] - l[2]) <= 1e-6) q.pop();
    }
    if (q.length < 3) return;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (nx * n[0] + ny * n[1] + nz * n[2] < 0) q = [q[0]].concat(q.slice(1).reverse());
    const base = pos.length / 3;
    for (const p of q) pos.push(p[0], p[1], S * p[2]);
    for (let i = 1; i + 1 < q.length; i++) {
      const a = q[0], b = q[i], d = q[i + 1];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (area > 1e-9) push(slot, base, base + i, base + i + 1);
    }
  };
  // origin (hand-W [x, y, z]) places the node there with geometry relative to it.
  api.emit = (parent, origin) => {
    const all = [], used = [], groups = [];
    idx.forEach((I, s) => {
      if (!I.length) return;
      groups.push([all.length, I.length, used.length]);
      for (const v of I) all.push(v);
      used.push(mats[s]);
    });
    if (!all.length) return null;
    const geo = meshGeo({ positions: pos, indices: all });
    let mesh;
    if (used.length === 1) mesh = new THREE.Mesh(geo, used[0]);
    else {
      for (const g of groups) geo.addGroup(g[0], g[1], g[2]);
      mesh = new THREE.Mesh(geo, used);
    }
    mesh.name = name;
    if (origin) {
      geo.translate(-origin[0], -origin[1], -S * origin[2]);
      mesh.position.set(origin[0], origin[1], S * origin[2]);
    }
    parent.add(mesh);
    return mesh;
  };
  return api;
}

function mat(name, hex, roughness, metalness, emissive, emissiveIntensity) {
  const opts = { roughness, metalness };
  if (emissive !== undefined) { opts.emissive = emissive; opts.emissiveIntensity = emissiveIntensity; }
  const m = gameMaterial(hex, opts);
  m.name = name;
  // The GLB exporter drops emissiveIntensity, so carry it in the emissive factor (core glTF: colour x strength).
  if (emissive !== undefined) { m.emissive.multiplyScalar(m.emissiveIntensity); m.emissiveIntensity = 1; }
  return m;
}

// Convex pieces of the winged plan: -Z wing, centre, +Z wing (shared edges, no T-junctions).
const PIECES = [[PLAN[0], PLAN[1], PLAN[2], PLAN[3]], [PLAN[0], PLAN[3], PLAN[4], PLAN[7]], [PLAN[4], PLAN[5], PLAN[6], PLAN[7]]];

// One leg of a V: a 24-sided cylinder on the line from the base point (xb, 0, zb) to the soffit
// point (xb, soffit, zb + side * 3), from inside the footing to 1 m past the soffit.
function leg(part, xb, zb, side) {
  const s = soffitY(xb), dz = side * LEG_SPREAD / 2, L = Math.hypot(s, dz);
  const u = [0, s / L, dz / L];                   // axis direction
  const e1 = [0, -dz / L, s / L], e2 = [1, 0, 0]; // ring frame
  const t0 = LEG_START * L / s, t1 = L + LEG_INTO_ROOF, r = LEG_D / 2;
  const ring = (t) => {
    const out = [];
    for (let k = 0; k < LEG_SEG; k++) {
      const a = k * 2 * Math.PI / LEG_SEG;   // vertices on whole segments: facet normals sit at half segments, none faces exactly +-X
      const c = Math.cos(a) * r, sn = Math.sin(a) * r;
      out.push([xb + u[0] * t + e1[0] * c + e2[0] * sn, u[1] * t + e1[1] * c + e2[1] * sn, zb + u[2] * t + e1[2] * c + e2[2] * sn]);
    }
    return out;
  };
  const lo = ring(t0), hi = ring(t1);
  for (let k = 0; k < LEG_SEG; k++) {
    const k2 = (k + 1) % LEG_SEG, am = (k + 0.5) * 2 * Math.PI / LEG_SEG;
    const n = [e1[0] * Math.cos(am) + e2[0] * Math.sin(am), e1[1] * Math.cos(am) + e2[1] * Math.sin(am), e1[2] * Math.cos(am) + e2[2] * Math.sin(am)];
    part.poly(0, [lo[k], lo[k2], hi[k2], hi[k]], n);
  }
  part.poly(0, lo, [-u[0], -u[1], -u[2]]);
  part.poly(0, hi, u);
}

function build() {
  const root = createRoot('s4Canopy');
  const M = {
    roof: mat('roof-steel', 0xBFC4C9, 0.40, 1.0),
    soffit: mat('soffit-lit', 0xF4F1EA, 0.60, 0.0, 0xF4F1EA, 0.8),
    trim: mat('trim-graphite', 0x3B4148, 0.50, 0.1),
    dark: mat('plinth-graphite', 0x1C2128, 0.60, 0.3),
    edgeLit: mat('edge-lit', 0xFFE7C2, 0.40, 0.0, 0xFFE7C2, 1.0),
  };
  const top = x => soffitY(x) + ROOF_T;

  // ---- Roof slab: upper surface, lit soffit and fascia band share edges only ----
  const roofTop = makePart('roofTop', [M.roof]);
  const soffit = makePart('soffit', [M.soffit]);
  for (const piece of PIECES) {
    roofTop.poly(0, piece.map(p => [p[0], top(p[0]), p[1]]), [0, 1, 0]);
    soffit.poly(0, piece.map(p => [p[0], soffitY(p[0]), p[1]]), [0, -1, 0]);
  }
  roofTop.emit(root);
  soffit.emit(root);
  const fascia = makePart('fascia', [M.trim]);
  const lights = makePart('edgeLights', [M.edgeLit]);
  const lit = x => soffitY(x) + EDGE_LIT_H;
  // the edge band is 2.5 tall: its lower 0.3 m is the lit strip (edgeLights), the rest trim-graphite (fascia);
  // outward normal of each plan edge, e.g. the back edge (0, 60) -> (0, -60) faces +X toward the buildings
  for (let i = 0; i < PLAN.length; i++) {
    const p = PLAN[i], q = PLAN[(i + 1) % PLAN.length], n = [-(q[1] - p[1]), 0, q[0] - p[0]];
    fascia.poly(0, [[p[0], lit(p[0]), p[1]], [q[0], lit(q[0]), q[1]], [q[0], top(q[0]), q[1]], [p[0], top(p[0]), p[1]]], n);
    lights.poly(0, [[p[0], soffitY(p[0]), p[1]], [q[0], soffitY(q[0]), q[1]], [q[0], lit(q[0]), q[1]], [p[0], lit(p[0]), p[1]]], n);
  }
  fascia.emit(root);
  lights.emit(root);

  // ---- Eight V-columns, each node at its base point ----
  const columns = new THREE.Group();
  columns.name = 'columns';
  root.add(columns);
  COLUMNS.forEach(([xb, zb], i) => {
    const col = makePart('column' + String(i + 1).padStart(2, '0'), [M.trim]);
    leg(col, xb, zb, -1);
    leg(col, xb, zb, 1);
    if (!far) {
      const h = FOOT / 2, x0 = xb - h, x1 = xb + h, z0 = zb - h, z1 = zb + h;
      col.poly(0, [[x0, FOOT_H, z0], [x1, FOOT_H, z0], [x1, FOOT_H, z1], [x0, FOOT_H, z1]], [0, 1, 0]);
      col.poly(0, [[x0, 0, z0], [x1, 0, z0], [x1, FOOT_H, z0], [x0, FOOT_H, z0]], [0, 0, -1]);
      col.poly(0, [[x0, 0, z1], [x1, 0, z1], [x1, FOOT_H, z1], [x0, FOOT_H, z1]], [0, 0, 1]);
      col.poly(0, [[x0, 0, z0], [x0, 0, z1], [x0, FOOT_H, z1], [x0, FOOT_H, z0]], [-1, 0, 0]);
      col.poly(0, [[x1, 0, z0], [x1, 0, z1], [x1, FOOT_H, z1], [x1, FOOT_H, z0]], [1, 0, 0]);
    }
    col.emit(columns, [xb, 0, zb]);
  });

  // ---- Drop-off kerbs along Z = +-60 from X = -100 to 0 ----
  if (!far) {
    const kerb = makePart('dropOffKerb', [M.dark]);
    const xFoot = KERB_X0 + FOOT / 2;   // the (-100, +-60) footings cover the kerb's first 2 m; its top starts at their edge
    for (const zc of [-KERB_Z, KERB_Z]) {
      const z0 = zc - KERB_W / 2, z1 = zc + KERB_W / 2;
      kerb.poly(0, [[xFoot, KERB_H, z0], [0, KERB_H, z0], [0, KERB_H, z1], [xFoot, KERB_H, z1]], [0, 1, 0]);
      kerb.poly(0, [[KERB_X0, 0, z0], [0, 0, z0], [0, KERB_H, z0], [KERB_X0, KERB_H, z0]], [0, 0, -1]);
      kerb.poly(0, [[KERB_X0, 0, z1], [0, 0, z1], [0, KERB_H, z1], [KERB_X0, KERB_H, z1]], [0, 0, 1]);
      kerb.poly(0, [[0, 0, z0], [0, 0, z1], [0, KERB_H, z1], [0, KERB_H, z0]], [1, 0, 0]);
    }
    kerb.emit(root);
  }

  // ---- Locators ----
  const loc = (name, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, S * z);
    root.add(o);
  };
  loc('axis', 0, 0, 0);
  loc('dropOff', -60, 0, 0);
  loc('wingTipA', -150, 22, -150);
  loc('wingTipB', -150, 22, 150);
  return root;
}
