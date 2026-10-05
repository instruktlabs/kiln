const meta = { name: 'cleanroom-wall-kit' };

// ---- constants (metres). Each variant root sits at Y = 0, centred on the panel length and on the panel centreplane. ----
const LEN = 3.6;
const HL = LEN / 2;
const HT = 0.05;                 // half of the 0.1 m panel thickness
const TALL = 6.0;                // floor to FFU face
const FZ = 0.045;                // sandwich face plane, 5 mm behind the frame plane
const END_W = 0.025;             // end bars are half width so butted panels show one 50 mm bar
const RAIL_H = 0.05;
const COVE_H = 0.1;              // floor cove band, kept inside the 0.1 m envelope (5 mm chamfer)
const KICK_H = 0.02;             // rubber kick at the floor
const FX = HL - END_W;
const FY0 = COVE_H;
const FY1 = TALL - RAIL_H;
const SPACING = 4.0;             // variants laid out 4 m apart along X
const WIN_W = 3.0;
const WIN_H = 2.0;
const SILL = 1.0;
const WIN_FRAME = 0.04;
const DOOR_W = 1.8;
const DOOR_H = 2.2;
const OX = DOOR_W / 2;
const JAMB_W = 0.05;
const HEAD_H = 0.1;
const LEAF_W = 0.9;
const LEAF_Y0 = 0.03;            // leaves hang 10 mm above the kick and 10 mm below the head track
const LEAF_Y1 = 2.19;
const POCKET_Z = -0.01;          // leaves occupy Z -0.05..-0.01 and slide in front of the 0.06 m side sections
const VISION = { x: 0.15, y0: 1.2, y1: 1.8 };
const SLIDE = 0.9;
const CLIP_SECONDS = 2;
const EASE_STEPS = 8;
const POST = 0.1;
const POST_CHAMFER = 0.015;
const GLASS_NAME = 'glass-clear';
const GLASS_HEX = '#CFE3EA';
const GLASS_OPACITY = 0.25;
const COVE_N = [0, 0.0624, 0.998];   // 5 mm chamfer normal; z is mirrored for the -Z side

const PALETTE = {
  'tool-panel-grey': [0xC5CBD1, 0.60, 0.0],
  'aluminium-extrusion': [0xA8AEB4, 0.45, 1.0],
  'rubber-black': [0x1E2226, 0.90, 0.0],
};

// ---- helpers ----
function makeMesh() {
  const pos = [], nor = [], idx = [];
  function quad(a, b, c, d, n) {
    let q = [a, b, c, d];
    let ns = Array.isArray(n[0]) ? n : [n, n, n, n];
    const f = [0, 1, 2].map((i) => ns[0][i] + ns[1][i] + ns[2][i] + ns[3][i]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * f[0] + cy * f[1] + cz * f[2] < 0) { q = [a, d, c, b]; ns = [ns[0], ns[3], ns[2], ns[1]]; }
    const base = pos.length / 3;
    q.forEach((p, i) => { pos.push(p[0], p[1], p[2]); nor.push(ns[i][0], ns[i][1], ns[i][2]); });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    quad,
    up(x0, x1, z0, z1, y) { quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]); },
    down(x0, x1, z0, z1, y) { quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0]); },
    wallX(x, z0, z1, y0, y1, nx) { quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [nx, 0, 0]); },
    wallZ(z, x0, x1, y0, y1, nz) { quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, nz]); },
    geo() { return meshGeo({ positions: pos, indices: idx, normals: nor }); },
    tris() { return idx.length / 3; },
  };
}

async function makeMaterials() {
  const out = {};
  for (const [name, [hex, rough, metal]] of Object.entries(PALETTE)) {
    const m = gameMaterial(hex, { roughness: rough, metalness: metal, flatShading: false });
    m.name = name;
    out[name] = m;
  }
  const glass = await materialRecipe('kiln.material.glass.v1', { baseColor: GLASS_HEX, roughness: 0.05, opacity: GLASS_OPACITY, doubleSided: true });
  glass.name = GLASS_NAME;
  out[GLASS_NAME] = glass;
  return out;
}

function makeGroup(name, parent) {
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  return g;
}

function addNode(parent, name, geometry, material) {
  const node = new THREE.Mesh(geometry, material);
  node.name = name;
  parent.add(node);
  return node;
}

// frame plane at |z| = HT, faces recessed to |z| = FZ; end bars, top rail, 5 mm reveals and the cove chamfer
function panelFrame(f, s) {
  const z = s * HT, zf = s * FZ;
  f.wallZ(z, -HL, -FX, COVE_H, TALL, s);
  f.wallZ(z, FX, HL, COVE_H, TALL, s);
  f.wallZ(z, -FX, FX, FY1, TALL, s);
  f.wallX(-FX, zf, z, FY0, FY1, 1);
  f.wallX(FX, zf, z, FY0, FY1, -1);
  f.down(-FX, FX, zf, z, FY1);
  f.quad([-HL, KICK_H, z], [HL, KICK_H, z], [HL, COVE_H, zf], [-HL, COVE_H, zf], [0, COVE_N[1], s * COVE_N[2]]);
}

function panelCaps(f) {
  f.wallX(-HL, -HT, HT, KICK_H, TALL, -1);
  f.wallX(HL, -HT, HT, KICK_H, TALL, 1);
  f.up(-HL, HL, -HT, HT, TALL);
}

function panelSeal(sl) {
  for (const s of [1, -1]) sl.wallZ(s * HT, -HL, HL, 0, KICK_H, s);
  sl.wallX(-HL, -HT, HT, 0, KICK_H, -1);
  sl.wallX(HL, -HT, HT, 0, KICK_H, 1);
}

// ---- variants ----
function addSolid(parent, M) {
  const g = makeGroup('wallPanelSolid', parent);
  const faces = makeMesh(), frame = makeMesh(), seal = makeMesh();
  for (const s of [1, -1]) {
    faces.wallZ(s * FZ, -FX, FX, FY0, FY1, s);
    panelFrame(frame, s);
  }
  panelCaps(frame);
  panelSeal(seal);
  addNode(g, 'wallPanelSolidFaces', faces.geo(), M['tool-panel-grey']);
  addNode(g, 'wallPanelSolidFrame', frame.geo(), M['aluminium-extrusion']);
  addNode(g, 'wallPanelSolidSeal', seal.geo(), M['rubber-black']);
  return g;
}

function addGlazed(parent, M) {
  const g = makeGroup('wallPanelGlazed', parent);
  const faces = makeMesh(), frame = makeMesh(), seal = makeMesh(), glass = makeMesh();
  const wx = WIN_W / 2, y0 = SILL, y1 = SILL + WIN_H, w = WIN_FRAME;
  for (const s of [1, -1]) {
    const zf = s * FZ, z = s * HT;
    faces.wallZ(zf, -FX, -wx, FY0, FY1, s);
    faces.wallZ(zf, wx, FX, FY0, FY1, s);
    faces.wallZ(zf, -wx, wx, FY0, y0, s);
    faces.wallZ(zf, -wx, wx, y1, FY1, s);
    panelFrame(frame, s);
    frame.wallZ(z, -wx - w, -wx, y0 - w, y1 + w, s);
    frame.wallZ(z, wx, wx + w, y0 - w, y1 + w, s);
    frame.wallZ(z, -wx, wx, y0 - w, y0, s);
    frame.wallZ(z, -wx, wx, y1, y1 + w, s);
    frame.wallX(-wx - w, zf, z, y0 - w, y1 + w, -1);
    frame.wallX(wx + w, zf, z, y0 - w, y1 + w, 1);
    frame.down(-wx - w, wx + w, zf, z, y0 - w);
    frame.up(-wx - w, wx + w, zf, z, y1 + w);
  }
  panelCaps(frame);
  panelSeal(seal);
  seal.wallX(-wx, -HT, HT, y0, y1, 1);
  seal.wallX(wx, -HT, HT, y0, y1, -1);
  seal.up(-wx, wx, -HT, HT, y0);
  seal.down(-wx, wx, -HT, HT, y1);
  glass.wallZ(0, -wx, wx, y0, y1, 1);
  addNode(g, 'wallPanelGlazedFaces', faces.geo(), M['tool-panel-grey']);
  addNode(g, 'wallPanelGlazedFrame', frame.geo(), M['aluminium-extrusion']);
  addNode(g, 'wallPanelGlazedSeal', seal.geo(), M['rubber-black']);
  addNode(g, 'glazing', glass.geo(), M[GLASS_NAME]);
  return g;
}

function addLeaf(parent, name, side, M) {
  const leaf = makeGroup(name, parent);
  leaf.position.set(side * LEAF_W / 2, 0, 0);
  const hw = LEAF_W / 2, zf = -HT, zb = POCKET_Z;
  const { x, y0, y1 } = VISION;
  const panel = makeMesh(), rim = makeMesh(), glass = makeMesh();
  for (const [z, n] of [[zf, -1], [zb, 1]]) {
    panel.wallZ(z, -hw, -x, LEAF_Y0, LEAF_Y1, n);
    panel.wallZ(z, x, hw, LEAF_Y0, LEAF_Y1, n);
    panel.wallZ(z, -x, x, LEAF_Y0, y0, n);
    panel.wallZ(z, -x, x, y1, LEAF_Y1, n);
  }
  panel.wallX(-hw, zf, zb, LEAF_Y0, LEAF_Y1, -1);
  panel.wallX(hw, zf, zb, LEAF_Y0, LEAF_Y1, 1);
  panel.up(-hw, hw, zf, zb, LEAF_Y1);
  panel.down(-hw, hw, zf, zb, LEAF_Y0);
  rim.wallX(-x, zf, zb, y0, y1, 1);
  rim.wallX(x, zf, zb, y0, y1, -1);
  rim.up(-x, x, zf, zb, y0);
  rim.down(-x, x, zf, zb, y1);
  glass.wallZ((zf + zb) / 2, -x, x, y0, y1, 1);
  addNode(leaf, name + 'Panel', panel.geo(), M['tool-panel-grey']);
  addNode(leaf, name + 'Frame', rim.geo(), M['aluminium-extrusion']);
  addNode(leaf, name + 'Glass', glass.geo(), M[GLASS_NAME]);
  return leaf;
}

function addDoor(parent, M) {
  const g = makeGroup('wallPanelDoor', parent);
  const faces = makeMesh(), frame = makeMesh(), seal = makeMesh();
  const jx = OX + JAMB_W, dh = DOOR_H, hh = DOOR_H + HEAD_H, PZ = POCKET_Z;
  // +Z side: faces recessed to FZ, frame plane at HT
  faces.wallZ(FZ, -FX, FX, hh, FY1, 1);
  faces.wallZ(FZ, -FX, -jx, FY0, dh, 1);
  faces.wallZ(FZ, jx, FX, FY0, dh, 1);
  frame.wallZ(HT, -HL, -FX, COVE_H, TALL, 1);
  frame.wallZ(HT, FX, HL, COVE_H, TALL, 1);
  frame.wallZ(HT, -FX, FX, FY1, TALL, 1);
  frame.wallZ(HT, -FX, FX, dh, hh, 1);
  frame.wallZ(HT, -jx, -OX, 0, dh, 1);
  frame.wallZ(HT, OX, jx, 0, dh, 1);
  frame.down(-FX, FX, FZ, HT, FY1);
  frame.wallX(-FX, FZ, HT, hh, FY1, 1);
  frame.wallX(FX, FZ, HT, hh, FY1, -1);
  frame.up(-FX, FX, FZ, HT, hh);
  frame.wallX(-FX, FZ, HT, FY0, dh, 1);
  frame.wallX(FX, FZ, HT, FY0, dh, -1);
  frame.down(-FX, -jx, FZ, HT, dh);
  frame.down(jx, FX, FZ, HT, dh);
  frame.wallX(-jx, FZ, HT, FY0, dh, -1);
  frame.wallX(jx, FZ, HT, FY0, dh, 1);
  for (const [xa, xb] of [[-HL, -jx], [jx, HL]]) {
    frame.quad([xa, KICK_H, HT], [xb, KICK_H, HT], [xb, COVE_H, FZ], [xa, COVE_H, FZ], [0, COVE_N[1], COVE_N[2]]);
  }
  // -Z side: header like the other panels, side sections recessed to the pocket plane where the leaves slide
  faces.wallZ(-FZ, -FX, FX, hh, FY1, -1);
  faces.wallZ(PZ, -HL, -OX, KICK_H, dh, -1);
  faces.wallZ(PZ, OX, HL, KICK_H, dh, -1);
  frame.wallZ(-HT, -HL, HL, dh, hh, -1);
  frame.wallZ(-HT, -HL, -FX, hh, TALL, -1);
  frame.wallZ(-HT, FX, HL, hh, TALL, -1);
  frame.wallZ(-HT, -FX, FX, FY1, TALL, -1);
  frame.down(-FX, FX, -HT, -FZ, FY1);
  frame.wallX(-FX, -HT, -FZ, hh, FY1, 1);
  frame.wallX(FX, -HT, -FZ, hh, FY1, -1);
  frame.up(-FX, FX, -HT, -FZ, hh);
  frame.down(-HL, -OX, -HT, PZ, dh);
  frame.down(OX, HL, -HT, PZ, dh);
  // opening reveals, head track underside, panel ends and top
  frame.wallX(-OX, PZ, HT, 0, dh, 1);
  frame.wallX(OX, PZ, HT, 0, dh, -1);
  frame.down(-OX, OX, -HT, HT, dh);
  frame.wallX(-HL, PZ, HT, KICK_H, dh, -1);
  frame.wallX(HL, PZ, HT, KICK_H, dh, 1);
  frame.wallX(-HL, -HT, HT, dh, TALL, -1);
  frame.wallX(HL, -HT, HT, dh, TALL, 1);
  frame.up(-HL, HL, -HT, HT, TALL);
  seal.wallZ(HT, -HL, -jx, 0, KICK_H, 1);
  seal.wallZ(HT, jx, HL, 0, KICK_H, 1);
  seal.wallZ(-HT, -HL, -OX, 0, KICK_H, -1);
  seal.wallZ(-HT, OX, HL, 0, KICK_H, -1);
  seal.up(-HL, -OX, -HT, PZ, KICK_H);
  seal.up(OX, HL, -HT, PZ, KICK_H);
  seal.wallX(-HL, -HT, HT, 0, KICK_H, -1);
  seal.wallX(HL, -HT, HT, 0, KICK_H, 1);
  addNode(g, 'wallPanelDoorFaces', faces.geo(), M['tool-panel-grey']);
  addNode(g, 'wallPanelDoorFrame', frame.geo(), M['aluminium-extrusion']);
  addNode(g, 'wallPanelDoorSeal', seal.geo(), M['rubber-black']);
  addLeaf(g, 'doorLeafLeft', -1, M);
  addLeaf(g, 'doorLeafRight', 1, M);
  return g;
}

function addPost(parent, M) {
  const g = makeGroup('cornerPost', parent);
  const h = POST / 2, a = h - POST_CHAMFER;
  const prof = [[-a, -h], [a, -h], [h, -a], [h, a], [a, h], [-a, h], [-h, a], [-h, -a]];
  const body = makeMesh(), kick = makeMesh();
  for (let i = 0; i < prof.length; i++) {
    const [x0, z0] = prof[i], [x1, z1] = prof[(i + 1) % prof.length];
    const len = Math.hypot(x1 - x0, z1 - z0), n = [(z1 - z0) / len, 0, -(x1 - x0) / len];
    kick.quad([x0, 0, z0], [x1, 0, z1], [x1, KICK_H, z1], [x0, KICK_H, z0], n);
    body.quad([x0, KICK_H, z0], [x1, KICK_H, z1], [x1, TALL, z1], [x0, TALL, z0], n);
  }
  body.quad([-h, TALL, -a], [-a, TALL, -h], [a, TALL, -h], [h, TALL, -a], [0, 1, 0]);
  body.quad([-h, TALL, -a], [h, TALL, -a], [h, TALL, a], [-h, TALL, a], [0, 1, 0]);
  body.quad([-h, TALL, a], [h, TALL, a], [a, TALL, h], [-a, TALL, h], [0, 1, 0]);
  addNode(g, 'cornerPostBody', body.geo(), M['aluminium-extrusion']);
  addNode(g, 'cornerPostSeal', kick.geo(), M['rubber-black']);
  return g;
}

// ---- build ----
async function build() {
  const root = createRoot('cleanroom-wall-kit');
  const M = await makeMaterials();
  addSolid(root, M).position.x = -1.5 * SPACING;
  addGlazed(root, M).position.x = -0.5 * SPACING;
  addDoor(root, M).position.x = 0.5 * SPACING;
  addPost(root, M).position.x = 1.5 * SPACING;
  return root;
}

// ---- animation: leaves slide along X, eased in and out with extra keyframes; DoorClose is DoorOpen reversed in time ----
function smoothstep01(u) { return u * u * (3 - 2 * u); }

function animate() {
  const times = [], opening = [];
  for (let k = 0; k <= EASE_STEPS; k++) {
    const u = k / EASE_STEPS;
    times.push(u * CLIP_SECONDS);
    opening.push(smoothstep01(u) * SLIDE);
  }
  const closing = opening.map((_, k) => opening[EASE_STEPS - k]);
  const track = (name, sign, travel) => positionTrack(name, times.map((t, k) => ({ time: t, position: [sign * (LEAF_W / 2 + travel[k]), 0, 0] })));
  return [
    createClip('DoorOpen', CLIP_SECONDS, [track('doorLeafLeft', -1, opening), track('doorLeafRight', 1, opening)]),
    createClip('DoorClose', CLIP_SECONDS, [track('doorLeafLeft', -1, closing), track('doorLeafRight', 1, closing)]),
  ];
}
