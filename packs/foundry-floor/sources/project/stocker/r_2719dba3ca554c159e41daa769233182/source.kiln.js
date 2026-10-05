// Foundry Floor stocker: automated FOUP warehouse with a stacker crane behind a long window.
// Metres. +X forward (ports and window face), +Y up, +Z right. Root at footprint centre on the floor.

const meta = { name: 'stocker' };

// ---------------- constants ----------------
const ENC = { x: 1.5, z: 6.0, h: 5.4 };            // half-extents X and Z, height (enclosure envelope)
const PLATE = 0.012;                               // trim plates stand this proud of the wall core
const WALL_T = 0.10, FLOOR_T = 0.10, ROOF_T = 0.10;
const CX = ENC.x - PLATE, CZ = ENC.z - PLATE;      // wall core outer faces
const ZW = CZ - WALL_T;                            // front/back wall core spans Z +-ZW
const WIN = { y0: 1.6, y1: 4.8, z: 5.4, x: 1.44 }; // window band on the front face; glass plane at X
const BAND = { y0: 4.95, y1: 5.25 };               // orange (accent-amhs) band near the top
const FOUP = { z: 0.416, x: 0.333, y: 0.335 };    // reference envelope, base at local Y 0

const COLS = 21, LEVELS = 6, PITCH_Z = 0.5, PITCH_Y = 0.8;
const SLOT_ORIGIN = [-0.95, 0.4, -5.0];
const RACK_LINE = 0.95;
const SPINE = { w: 0.10, t: 0.04 };                // shelf spine under each FOUP; tines pass beside it
const POST = { z: 0.04, y0: FLOOR_T, y1: 5.0 };
const BACK_X = 0.06;                               // rack back-frame depth (wall side)

const OHT_Z = [-4.8, -3.6, 3.6, 4.8];
const MANUAL_Z = 0.0;
const PORTS_Z = [...OHT_Z, MANUAL_Z].sort((a, b) => a - b);
const SEAT_Y = 0.9;
const OPEN = { hw: 0.25, y0: 0.85, y1: 1.30 };     // clear pass-through 0.50 x 0.45
const HOLE = { hw: 0.27, y0: 0.83, y1: 1.32 };     // wall hole; graphite liner fills the 0.02 margin
const SHELF = { xEnd: 2.25, t: 0.04 };

const CLIP = { name: 'CraneCycle', duration: 12 };
const MAST_Z0 = -4.0, CAR_Y0 = 0.4;                // rest pose = first clip sample

const slotZ = (i) => SLOT_ORIGIN[2] + PITCH_Z * i;
const slotY = (j) => SLOT_ORIGIN[1] + PITCH_Y * j;
const DISPLACED = new Set();                       // front-rack level-1 columns taken by the inner seats
for (let i = 0; i < COLS; i++) for (const p of PORTS_Z) if (Math.abs(slotZ(i) - p) < FOUP.z) DISPLACED.add(i);

// ---------------- geometry helpers ----------------
function newAcc() { return { p: [], n: [], i: [] }; }

function addBox(a, x0, x1, y0, y1, z0, z1) {
  if (!(x1 > x0 && y1 > y0 && z1 > z0)) throw new Error('degenerate box ' + [x0, x1, y0, y1, z0, z1].join(' '));
  const F = [
    [[1, 0, 0], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
    [[-1, 0, 0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
    [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[0, 0, 1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]],
    [[0, 0, -1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
  ];
  for (const f of F) {
    const b = a.p.length / 3;
    for (let k = 1; k <= 4; k++) { a.p.push(f[k][0], f[k][1], f[k][2]); a.n.push(f[0][0], f[0][1], f[0][2]); }
    a.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}

function addQuadX(a, x, y0, y1, z0, z1) {
  const b = a.p.length / 3;
  a.p.push(x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z1);
  for (let k = 0; k < 4; k++) a.n.push(1, 0, 0);
  a.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
}

function attachMesh(parent, name, acc, material) {
  if (!acc.i.length) return null;
  const m = new THREE.Mesh(meshGeo({ positions: acc.p, indices: acc.i, normals: acc.n }), material);
  m.name = name;
  parent.add(m);
  return m;
}

function makeNode(name, parent, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x || 0, y || 0, z || 0);
  if (parent) parent.add(g);
  return g;
}

function addLocator(parent, name, x, y, z) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
}

function makeMat(name, hex, roughness, metalness, extra) {
  const m = gameMaterial(hex, Object.assign({ roughness, metalness }, extra || {}));
  m.name = name;
  return m;
}

// Z intervals [a,b] inside [lo,hi] left after removing +-half around each centre.
function spansWithout(lo, hi, centres, half) {
  const out = [];
  let z = lo;
  for (const c of centres) {
    if (c - half > z) out.push([z, c - half]);
    z = c + half;
  }
  if (hi > z) out.push([z, hi]);
  return out;
}

// ---------------- enclosure ----------------
function buildEnclosure(root, M) {
  const g = makeNode('enclosure', root);
  const W = newAcc(), G = newAcc(), O = newAcc(), K = newAcc();
  const y0 = FLOOR_T, y1 = ENC.h - ROOF_T;

  addBox(W, -ENC.x, ENC.x, 0, FLOOR_T, -ENC.z, ENC.z);                      // floor slab
  addBox(W, -ENC.x, ENC.x, ENC.h - ROOF_T, ENC.h, -ENC.z, ENC.z);            // roof slab
  addBox(W, -CX, -CX + WALL_T, y0, y1, -ZW, ZW);                             // back wall core
  addBox(W, -CX, CX, y0, y1, ZW, CZ);                                        // end wall cores
  addBox(W, -CX, CX, y0, y1, -CZ, -ZW);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                      // corner posts
    const xa = sx > 0 ? CX : -ENC.x, za = sz > 0 ? ZW : -ENC.z;
    addBox(W, xa, xa + PLATE, y0, y1, za, za + (ENC.z - ZW));
  }

  // front wall core with the window opening and five port holes
  const fx0 = CX - WALL_T, fx1 = CX;
  addBox(W, fx0, fx1, y0, HOLE.y0, -ZW, ZW);
  addBox(W, fx0, fx1, HOLE.y1, WIN.y0, -ZW, ZW);
  addBox(W, fx0, fx1, WIN.y1, y1, -ZW, ZW);
  addBox(W, fx0, fx1, WIN.y0, WIN.y1, -ZW, -WIN.z);
  addBox(W, fx0, fx1, WIN.y0, WIN.y1, WIN.z, ZW);
  for (const [a, b] of spansWithout(-ZW, ZW, PORTS_Z, HOLE.hw)) addBox(W, fx0, fx1, HOLE.y0, HOLE.y1, a, b);

  // front plates
  const nP = 8, gap = 0.06, pw = (2 * ZW - gap * (nP - 1)) / nP;
  for (let k = 0; k < nP; k++) {
    const a = -ZW + k * (pw + gap);
    addBox(G, CX, ENC.x, y0, 0.80, a, a + pw);                               // lower panels
  }
  addBox(W, CX, ENC.x, WIN.y0, WIN.y1, -ZW, -5.5);                           // window pillars
  addBox(W, CX, ENC.x, WIN.y0, WIN.y1, 5.5, ZW);
  addBox(O, CX, ENC.x, BAND.y0, BAND.y1, -ZW, ZW);                           // orange band
  addBox(K, CX, ENC.x, 1.52, WIN.y0, -5.5, 5.5);                             // window frame
  addBox(K, CX, ENC.x, WIN.y1, 4.88, -5.5, 5.5);
  addBox(K, CX, ENC.x, WIN.y0, WIN.y1, -5.5, -WIN.z);
  addBox(K, CX, ENC.x, WIN.y0, WIN.y1, WIN.z, 5.5);
  for (const c of [-2.7, 0, 2.7]) addBox(K, CX, ENC.x, WIN.y0, WIN.y1, c - 0.03, c + 0.03);

  // end and back plates
  for (const s of [-1, 1]) {
    const za = s > 0 ? CZ : -ENC.z, zb = za + PLATE;
    addBox(G, -CX, -0.03, y0, 0.80, za, zb);
    addBox(G, 0.03, CX, y0, 0.80, za, zb);
    addBox(O, -CX, CX, BAND.y0, BAND.y1, za, zb);
  }
  addBox(O, -ENC.x, -CX, BAND.y0, BAND.y1, -ZW, ZW);

  attachMesh(g, 'shellWhite', W, M.white);
  attachMesh(g, 'panelsGrey', G, M.grey);
  attachMesh(g, 'bandOrange', O, M.orange);
  attachMesh(g, 'frameGraphite', K, M.graphite);
  return g;
}

function buildWindowGlass(root, M) {
  const q = newAcc();
  addQuadX(q, WIN.x, WIN.y0, WIN.y1, -WIN.z, WIN.z);
  return attachMesh(root, 'windowGlass', q, M.glass);
}

// ---------------- racks ----------------
function buildRacks(root, M) {
  const g = makeNode('racks', root);
  const A = newAcc();
  for (const s of [-1, 1]) {
    const xc = s * RACK_LINE;
    const backA = s > 0 ? xc + 0.19 : xc - 0.25, backB = backA + BACK_X;
    const spA = s > 0 ? xc - 0.25 : xc - 0.19, spB = spA + 0.44;
    const front = s > 0;

    for (let k = 0; k <= COLS; k++) {                                         // uprights on column boundaries
      const zk = slotZ(0) - PITCH_Z / 2 + PITCH_Z * k;
      const cut = front && OHT_Z.some((p) => Math.abs(zk - p) < 0.24);
      if (cut) {
        addBox(A, backA, backB, POST.y0, 0.86, zk - POST.z / 2, zk + POST.z / 2);
        addBox(A, backA, backB, OPEN.y1, POST.y1, zk - POST.z / 2, zk + POST.z / 2);
      } else {
        addBox(A, backA, backB, POST.y0, POST.y1, zk - POST.z / 2, zk + POST.z / 2);
      }
    }

    const zLo = slotZ(0) - PITCH_Z / 2 + POST.z / 2 - POST.z / 2, zHi = slotZ(COLS - 1) + PITCH_Z / 2;
    for (let j = 0; j < LEVELS; j++) {                                        // back beams, one per level
      const y = slotY(j);
      const spans = front && j === 1 ? spansWithout(zLo, zHi, PORTS_Z, 0.24) : [[zLo, zHi]];
      for (const [a, b] of spans) addBox(A, backA, backB, y - SPINE.t, y, a, b);
    }
    addBox(A, backA, backB, POST.y1 - 0.04, POST.y1, zLo, zHi);               // top tie
    addBox(A, backA, backB, POST.y0, POST.y0 + 0.06, zLo, zHi);               // bottom tie

    for (let j = 0; j < LEVELS; j++) for (let i = 0; i < COLS; i++) {         // spines, one per slot
      if (front && j === 1 && DISPLACED.has(i)) continue;
      const zc = slotZ(i), y = slotY(j);
      addBox(A, spA, spB, y - SPINE.t, y, zc - SPINE.w / 2, zc + SPINE.w / 2);
    }
  }
  attachMesh(g, 'rackFrame', A, M.alu);
  return g;
}

// ---------------- crane rails ----------------
function buildRails(root, M) {
  const g = makeNode('craneRails', root);
  const A = newAcc();
  addBox(A, -0.06, 0.06, FLOOR_T, 0.20, -5.7, 5.7);                          // floor rail
  addBox(A, -0.06, 0.06, 5.16, ENC.h - ROOF_T, -5.7, 5.7);                   // ceiling rail
  for (const s of [-1, 1]) {
    const z0 = s > 0 ? 5.7 : -5.8;
    addBox(A, -0.12, 0.12, FLOOR_T, 0.40, z0, z0 + 0.1);                     // end stops
    addBox(A, -0.12, 0.12, 5.0, ENC.h - ROOF_T, z0, z0 + 0.1);
  }
  attachMesh(g, 'railBeams', A, M.alu);
  return g;
}

// ---------------- stacker crane: craneMast > craneCarriage > craneFork ----------------
function buildCrane(root, M) {
  const mast = makeNode('craneMast', root, 0, 0, MAST_Z0);
  const K = newAcc();
  for (const s of [-1, 1]) {
    const za = s > 0 ? 0.34 : -0.52;
    addBox(K, -0.09, 0.09, 0.36, 4.98, za, za + 0.18);                       // twin posts
    const zb = s > 0 ? 0.34 : -0.56;
    addBox(K, -0.18, 0.18, 0.20, 0.36, zb, zb + 0.22);                       // bogies on the floor rail
    addBox(K, s > 0 ? 0.07 : -0.12, s > 0 ? 0.12 : -0.07, 5.10, 5.28, -0.20, 0.20); // ceiling guides
  }
  addBox(K, -0.10, 0.10, 0.20, 0.27, -0.40, 0.40);                           // lower tie
  addBox(K, -0.10, 0.10, 4.98, 5.10, -0.52, 0.52);                           // top beam
  attachMesh(mast, 'mastFrame', K, M.graphite);

  const car = makeNode('craneCarriage', mast, 0, CAR_Y0, 0);
  const C = newAcc(), CA = newAcc();
  addBox(C, -0.50, 0.50, -0.11, -0.05, -0.30, 0.30);                         // platform
  for (const s of [-1, 1]) {
    const za = s > 0 ? 0.30 : -0.34;
    addBox(C, -0.15, 0.15, -0.11, 0.30, za, za + 0.04);                      // guide shoes on the posts
    addBox(CA, -0.15, 0.15, 0.30, 0.34, za, za + 0.04);                      // orange shoe caps
    const xa = s > 0 ? 0.50 : -0.512;
    addBox(CA, xa, xa + 0.012, -0.11, -0.05, -0.30, 0.30);                   // orange platform edges
  }
  addBox(CA, -0.28, 0.28, -0.05, 0.55, -0.26, 0.26);                         // orange operator cab, top clears the mast beam at Y 4.4
  attachMesh(car, 'carriageFrame', C, M.graphite);
  attachMesh(car, 'carriageAccent', CA, M.orange);

  const fork = makeNode('craneFork', car, 0, 0, 0);
  const F = newAcc();
  for (const s of [-1, 1]) {
    const za = s > 0 ? 0.10 : -0.16;
    addBox(F, -0.45, 0.45, -0.05, -0.02, za, za + 0.06);                     // tines, tips reach +-1.05 at full stroke
  }
  addBox(F, -0.06, 0.06, -0.05, 0.03, -0.10, 0.10);                          // drive block between the tines
  attachMesh(fork, 'forkBody', F, M.graphite);
  return mast;
}

// ---------------- ports ----------------
function portOpening(O, T, p) {
  addBox(O, CX, ENC.x, HOLE.y1, 1.38, p - 0.30, p + 0.30);                   // orange surround: header and jambs
  addBox(O, CX, ENC.x, HOLE.y0, HOLE.y1, p + HOLE.hw, p + 0.30);
  addBox(O, CX, ENC.x, HOLE.y0, HOLE.y1, p - 0.30, p - HOLE.hw);
  addBox(T, 1.21, ENC.x, HOLE.y0, OPEN.y0, p - HOLE.hw, p + HOLE.hw);        // dark tunnel liner: floor, roof, sides
  addBox(T, 1.21, ENC.x, OPEN.y1, HOLE.y1, p - HOLE.hw, p + HOLE.hw);
  addBox(T, 1.21, ENC.x, OPEN.y0, OPEN.y1, p + OPEN.hw, p + HOLE.hw);
  addBox(T, 1.21, ENC.x, OPEN.y0, OPEN.y1, p - HOLE.hw, p - OPEN.hw);
}

function buildIoPorts(root, M) {
  const g = makeNode('ioPorts', root);
  const S = newAcc(), O = newAcc(), T = newAcc();
  for (const p of OHT_Z) {
    const yb = SEAT_Y - SHELF.t;
    addBox(S, ENC.x, SHELF.xEnd - 0.02, yb, SEAT_Y, p - 0.30, p + 0.30);     // shelf, top face = seat height
    addBox(O, SHELF.xEnd - 0.02, SHELF.xEnd, yb, SEAT_Y, p - 0.30, p + 0.30);
    for (const s of [-1, 1]) addBox(S, 2.15, 2.21, FLOOR_T, yb, p + s * 0.25 - 0.03, p + s * 0.25 + 0.03);
    addBox(S, RACK_LINE - 0.25, RACK_LINE + 0.19, yb, SEAT_Y, p - SPINE.w / 2, p + SPINE.w / 2); // inner seat on the front rack line
    portOpening(O, T, p);
  }
  attachMesh(g, 'portShelves', S, M.grey);
  attachMesh(g, 'portTrim', O, M.orange);
  attachMesh(g, 'portTunnels', T, M.graphite);
  return g;
}

function buildManualPort(root, M) {
  const g = makeNode('manualPort', root);
  const S = newAcc(), O = newAcc(), T = newAcc();
  const p = MANUAL_Z, yb = SEAT_Y - SHELF.t;
  addBox(S, 1.30, 1.77, yb, SEAT_Y, p - OPEN.hw, p + OPEN.hw);               // shelf under the manual seat (X 1.6)
  addBox(O, 1.77, 1.80, yb, SEAT_Y, p - OPEN.hw, p + OPEN.hw);
  for (const s of [-1, 1]) addBox(S, 1.70, 1.76, FLOOR_T, yb, p + s * 0.18 - 0.03, p + s * 0.18 + 0.03);
  addBox(S, RACK_LINE - 0.25, RACK_LINE + 0.19, yb, SEAT_Y, p - SPINE.w / 2, p + SPINE.w / 2); // inner seat
  addBox(S, CX, 1.84, 1.38, 1.42, p - 0.30, p + 0.30);                       // small door, swung up as a hood
  addBox(O, 1.84, 1.87, 1.38, 1.42, p - 0.30, p + 0.30);
  portOpening(O, T, p);
  attachMesh(g, 'manualShelf', S, M.grey);
  attachMesh(g, 'manualTrim', O, M.orange);
  attachMesh(g, 'manualTunnel', T, M.graphite);
  return g;
}

function buildControlPanel(root, M) {
  const g = makeNode('controlPanel', root);
  const B = newAcc(), S = newAcc();
  addBox(B, CX, 1.62, 0.95, 1.48, 0.72, 1.28);
  addBox(S, 1.62, 1.624, 1.03, 1.42, 0.79, 1.21);
  attachMesh(g, 'panelBody', B, M.graphite);
  attachMesh(g, 'panelScreen', S, M.screen);
  return g;
}

// ---------------- lod1: silhouette shell buried inside the wall cores ----------------
// visible=false does not survive GLB export, so every box sits inside solid detailed volume
// (or the same-material orange plates) and never covers the window opening or a port hole.
function buildLod(root, M) {
  const g = makeNode('lod1', root);
  const W = newAcc(), K = newAcc(), O = newAcc();
  const e = 0.01;
  const fx0 = CX - 0.088, fx1 = CX - 0.008;                                   // front skin X 1.40..1.48
  const zs = ZW + 0.055;                                                      // skin half-length, overlaps the end cores
  const yT = ENC.h - ROOF_T - e;                                              // underside of the roof box
  addBox(W, fx0, fx1, FLOOR_T + e, OPEN.y0, -zs, zs);                         // below the port holes
  for (const [a, b] of spansWithout(-zs, zs, PORTS_Z, HOLE.hw)) addBox(W, fx0, fx1, HOLE.y0 + e, HOLE.y1 - e, a, b);
  addBox(W, fx0, fx1, OPEN.y1, WIN.y0 - e, -zs, zs);                          // above the port holes
  addBox(W, fx0, fx1, WIN.y0 - e, WIN.y1 + e, WIN.z + e, zs);                 // window pillars
  addBox(W, fx0, fx1, WIN.y0 - e, WIN.y1 + e, -zs, -WIN.z - e);
  addBox(W, fx0, fx1, WIN.y1 - e, yT, -zs, zs);                               // header
  addBox(W, -fx1, -fx0, FLOOR_T + e, yT, -zs, zs);                            // back skin
  addBox(K, -fx0 - 0.008, -fx0 + 0.004, WIN.y0, WIN.y1, -WIN.z, WIN.z);       // dark window-band panel, just inside the back core face
  addBox(W, -fx1, fx1, FLOOR_T + e, yT, CZ - 0.088, CZ - 0.008);              // end skins
  addBox(W, -fx1, fx1, FLOOR_T + e, yT, -CZ + 0.008, -CZ + 0.088);
  addBox(W, -ENC.x + e, ENC.x - e, ENC.h - ROOF_T + e, ENC.h - e, -ENC.z + e, ENC.z - e); // roof
  addBox(O, CX + 0.001, ENC.x - 0.001, BAND.y0 + e, BAND.y1 - e, -ZW + e, ZW - e);        // orange bands inside the detailed plates
  addBox(O, -ENC.x + 0.001, -CX - 0.001, BAND.y0 + e, BAND.y1 - e, -ZW + e, ZW - e);
  addBox(O, -CX + e, CX - e, BAND.y0 + e, BAND.y1 - e, CZ + 0.001, ENC.z - 0.001);
  addBox(O, -CX + e, CX - e, BAND.y0 + e, BAND.y1 - e, -ENC.z + 0.001, -CZ - 0.001);
  attachMesh(g, 'lodWhite', W, M.white);
  attachMesh(g, 'lodWindow', K, M.graphite);
  attachMesh(g, 'lodBand', O, M.orange);
  return g;
}

// ---------------- build / animate ----------------
// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing stocker far distance (44 m),
// at 50 degrees vertical FOV and 16:9. The final zero keeps the coarse tier.
function applyFoundryStandardLod(root) {
  const coarse = root.children.find((node) => node.name === 'lod1');
  if (!coarse) throw new Error('Expected one root-level lod1 branch');
  const detail = new THREE.Group(); detail.name = 'LOD0';
  const distant = new THREE.Group(); distant.name = 'LOD1';
  for (const child of [...root.children]) {
    if (child === coarse) continue;
    let hasMesh = false;
    child.traverse((node) => { if (node.isMesh) hasMesh = true; });
    if (hasMesh) detail.add(child);
  }
  // Older authors hid this overlapping proxy. Standard off-scene LOD membership
  // now controls its selection; all other authored visibility is preserved.
  coarse.visible = true;
  distant.add(coarse);
  root.add(detail, distant);
  root.updateMatrixWorld(true);
  const radius = new THREE.Box3().setFromObject(detail).getSize(new THREE.Vector3()).length() / 2;
  const coverage = Math.min(1, Math.PI * (radius / (2 * 44 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

function build() {
  const M = {
    white: makeMat('tool-shell-white', 0xE8EBEE, 0.55, 0.0),
    grey: makeMat('tool-panel-grey', 0xC5CBD1, 0.60, 0.0),
    graphite: makeMat('trim-graphite', 0x3B4148, 0.50, 0.1),
    alu: makeMat('aluminium-extrusion', 0xA8AEB4, 0.45, 1.0),
    orange: makeMat('accent-amhs', 0xE07B22, 0.50, 0.0),
    screen: makeMat('screen-glow', 0x9FD3F5, 0.30, 0.0, { emissive: 0x9FD3F5, emissiveIntensity: 1.0 }),
    glass: glassMaterial(0xCFE3EA, { opacity: 0.25, roughness: 0.05, metalness: 0.0 }),
  };
  M.glass.name = 'glass-clear';

  const root = createRoot('stocker');
  buildEnclosure(root, M);
  buildWindowGlass(root, M);
  buildRacks(root, M);
  buildRails(root, M);
  buildCrane(root, M);
  buildIoPorts(root, M);
  buildManualPort(root, M);
  buildControlPanel(root, M);
  buildLod(root, M);

  addLocator(root, 'port1', 2.1, 0.9, -4.8);
  addLocator(root, 'port2', 2.1, 0.9, -3.6);
  addLocator(root, 'port3', 2.1, 0.9, 3.6);
  addLocator(root, 'port4', 2.1, 0.9, 4.8);
  addLocator(root, 'manualPortSeat', 1.6, 0.9, 0.0);
  addLocator(root, 'slotOrigin', SLOT_ORIGIN[0], SLOT_ORIGIN[1], SLOT_ORIGIN[2]);
  addLocator(root, 'signalTowerMount', 1.4, 5.4, 5.6);
  return applyFoundryStandardLod(root);
}

function animate(root) {
  const mastZ = [[0, MAST_Z0], [4, 2.0], [6, 2.0], [11, MAST_Z0], [12, MAST_Z0]];
  const carY = [[0, CAR_Y0], [1, CAR_Y0], [4, 3.6], [6, 3.6], [11, CAR_Y0], [12, CAR_Y0]];
  const forkX = [[0, 0], [4, 0], [5, 0.6], [6, 0], [11, 0], [12, 0]];
  return [createClip(CLIP.name, CLIP.duration, [
    positionTrack('craneMast', mastZ.map(([time, z]) => ({ time, position: [0, 0, z] }))),
    positionTrack('craneCarriage', carY.map(([time, y]) => ({ time, position: [0, y, 0] }))),
    positionTrack('craneFork', forkX.map(([time, x]) => ({ time, position: [x, 0, 0] }))),
  ])];
}
