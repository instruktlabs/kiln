// Wafer prober with tester: prober cabinet with window, wafer chuck, test head on a hinged manipulator, tester mainframe.
const meta = { name: 'Wafer prober with tester', role: 'prop' };

// Layout (m). +X = load-port face, +Y up, +Z right, origin at the footprint centre on the floor.
const SHOW_LOD1 = true;
const XF = 1.8;            // prober front face = load-port mounting plane
const XB = -0.2;           // prober back face = mainframe front face
const XM = -1.8;           // mainframe back
const HW = 1.3;            // prober half width
const HWM = 1.0;           // mainframe half width
const H_BODY = 1.3;        // prober roof
const H_MAIN = 2.0;        // mainframe top
const T = 0.05;            // prober wall
const PL = 0.10;           // plinth
const BAND0 = 1.9;         // family band on the mainframe, Y 1.9 to 2.0
const BODY_BAND0 = 1.2;    // family band at the prober top edge
const HEAD_X = 0.6;        // test head centre X
const HEAD_S = 0.9;        // test head X and Z size
const HEAD_GAP = 0.002;    // seal gap between the docked head and the roof
const HEAD_H = 0.5;        // test head height
const HEAD_Y0 = H_BODY + HEAD_GAP;
const HEAD_Y1 = HEAD_Y0 + HEAD_H;
const HY = 1.8;            // hinge height
const HZ = 1.1;            // hinge Z
const CHUCK_X = 0.6;
const OPEN_DEG = 90;
const OPEN_SECONDS = 4;
const INDEX_SECONDS = 1;
const INDEX_DROP = 0.005;
const INDEX_STEP = 0.03;
const HINGE = [HEAD_X, HY, HZ];
const CHUCK_O = [CHUCK_X, 0, 0];
const ZERO = [0, 0, 0];
const WIN = { x0: 0.05, x1: 1.15, y0: 0.55, y1: 1.15 };

function mat(name, hex, roughness, metalness, extra) {
  const m = gameMaterial(hex, Object.assign({ roughness, metalness, flatShading: false }, extra || {}));
  m.name = name;
  return m;
}

function materials() {
  const glass = mat('glass-smoked', 0x5E6A73, 0.10, 0.0);
  glass.transparent = true;
  glass.opacity = 0.6;
  return {
    white: mat('tool-shell-white', 0xE8EBEE, 0.55, 0.0),
    grey: mat('tool-panel-grey', 0xC5CBD1, 0.60, 0.0),
    graphite: mat('trim-graphite', 0x3B4148, 0.50, 0.1),
    steel: mat('stainless', 0xB9BEC3, 0.35, 1.0),
    accent: mat('accent-test', 0x56657A, 0.50, 0.0),
    rubber: mat('rubber-black', 0x1E2226, 0.90, 0.0),
    glass,
    screen: mat('screen-glow', 0x9FD3F5, 0.30, 0.0, { emissive: 0x9FD3F5, emissiveIntensity: 1.0 }),
  };
}

function group(name, parent, pos) {
  const g = createPivot(name, pos || [0, 0, 0], parent);
  g.name = name;
  return g;
}

function part(name, geo, m, parent, pos, rot) {
  const p = createPart(name, geo, m, rot ? { position: pos, rotation: rot, parent } : { position: pos, parent });
  p.name = name;
  return p;
}

// Extents are given in world coordinates minus the group origin o.
function box(name, parent, m, x0, x1, y0, y1, z0, z1) {
  return part(name, boxGeo(x1 - x0, y1 - y0, z1 - z0), m, parent, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
}
function cyl(name, parent, m, r, y0, y1, seg, cx, cz) {
  return part(name, cylinderGeo(r, r, y1 - y0, seg), m, parent, [cx || 0, (y0 + y1) / 2, cz || 0]);
}
function boxO(o, name, parent, m, x0, x1, y0, y1, z0, z1) {
  return box(name, parent, m, x0 - o[0], x1 - o[0], y0 - o[1], y1 - o[1], z0 - o[2], z1 - o[2]);
}
function cylO(o, name, parent, m, r, y0, y1, seg, cx, cz) {
  return cyl(name, parent, m, r, y0 - o[1], y1 - o[1], seg, cx - o[0], cz - o[2]);
}
function cylXO(o, name, parent, m, r, x0, x1, seg, cy, cz) {
  return part(name, cylinderGeo(r, r, x1 - x0, seg), m, parent, [(x0 + x1) / 2 - o[0], cy - o[1], cz - o[2]], [0, 0, 90]);
}
function cylZO(o, name, parent, m, r, z0, z1, seg, cx, cy) {
  return part(name, cylinderGeo(r, r, z1 - z0, seg), m, parent, [cx - o[0], cy - o[1], (z0 + z1) / 2 - o[2]], [90, 0, 0]);
}
function ringXO(o, name, parent, m, rIn, rOut, x0, x1, seg, cy, cz) {
  const L = (x1 - x0) / 2;
  const prof = [[rIn, L], [rOut, L], [rOut, -L], [rIn, -L], [rIn, L]];
  return part(name, lathe(prof, seg), m, parent, [(x0 + x1) / 2 - o[0], cy - o[1], cz - o[2]], [0, 0, 90]);
}
function ringYO(o, name, parent, m, rIn, rOut, y0, y1, seg, cx, cz) {
  const prof = [[rIn, y1 - o[1]], [rOut, y1 - o[1]], [rOut, y0 - o[1]], [rIn, y0 - o[1]], [rIn, y1 - o[1]]];
  return part(name, lathe(prof, seg), m, parent, [cx - o[0], 0, cz - o[2]]);
}
const zr = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]);
function louvres(name, parent, m, n, x0, x1, y0, pitch, h, z0, z1) {
  for (let i = 0; i < n; i++) box(name + i, parent, m, x0, x1, y0 + i * pitch, y0 + i * pitch + h, z0, z1);
}

// ---------------- proberBody ----------------
function buildBody(root, M) {
  const g = group('proberBody', root);
  const zi = HW - T;
  const yc = H_BODY;
  box('BodyPlinth', g, M.graphite, XB + T, XF - T, 0, PL, -zi, zi);
  box('FrontWallLow', g, M.white, XF - T, XF, PL, BODY_BAND0, -HW, HW);
  box('FrontWallUp', g, M.white, XF - T, XF - 0.003, BODY_BAND0, yc, -HW, HW);
  box('FrontBand', g, M.accent, XF - 0.003, XF, BODY_BAND0, yc, -HW, HW);
  box('BackWall', g, M.white, XB, XB + T, PL, yc, -HW, HW);
  box('SideNeg', g, M.white, XB + T, XF - T, PL, yc, -HW, -zi);
  box('SideLow', g, M.white, XB + T, XF - T, PL, WIN.y0, zi, HW);
  box('SideTop', g, M.white, XB + T, XF - T, WIN.y1, yc, zi, HW);
  box('SideLeft', g, M.white, XB + T, WIN.x0, WIN.y0, WIN.y1, zi, HW);
  box('SideRight', g, M.white, WIN.x1, XF - T, WIN.y0, WIN.y1, zi, HW);
  box('Roof', g, M.white, XB + T, XF - T, yc - T, yc, -zi, zi);
  for (const s of [1, -1]) {
    box('SideBand' + (s > 0 ? 'Pos' : 'Neg'), g, M.accent, XB, XF, BODY_BAND0, yc, ...zr(s, HW, HW + 0.003));
  }
  // window on the +Z side; the glass sits proud of the wall so the low-detail boxes never cover it
  const fz1 = HW + 0.010;
  box('WinFrameBottom', g, M.graphite, WIN.x0 - 0.03, WIN.x1 + 0.03, WIN.y0 - 0.03, WIN.y0, HW, fz1);
  box('WinFrameTop', g, M.graphite, WIN.x0 - 0.03, WIN.x1 + 0.03, WIN.y1, WIN.y1 + 0.03, HW, fz1);
  box('WinFrameLeft', g, M.graphite, WIN.x0 - 0.03, WIN.x0, WIN.y0, WIN.y1, HW, fz1);
  box('WinFrameRight', g, M.graphite, WIN.x1, WIN.x1 + 0.03, WIN.y0, WIN.y1, HW, fz1);
  box('WinGlass', g, M.glass, WIN.x0 - 0.01, WIN.x1 + 0.01, WIN.y0 - 0.01, WIN.y1 + 0.01, HW + 0.002, HW + 0.008);
  // front face: vent grille and screen bezel outside the load-port zone (|Z| > 0.45)
  louvres('FrontVent', g, M.graphite, 8, XF, XF + 0.006, 0.25, 0.05, 0.025, -1.15, -0.45);
  box('ScreenBezel', g, M.graphite, XF, XF + 0.006, 0.70, 1.10, 0.55, 1.05);
  // side panels
  box('DoorPanelNeg', g, M.grey, 0.2, 1.6, 0.2, 0.95, -HW - 0.003, -HW);
  louvres('VentNeg', g, M.graphite, 5, 0.4, 1.4, 1.0, 0.035, 0.02, -HW - 0.006, -HW);
  box('DoorPanelPos', g, M.grey, 0.2, 1.6, 0.15, 0.5, HW, HW + 0.003);
  // roof panels (clear of the docked head and the manipulator)
  box('RoofPanelA', g, M.grey, 1.15, 1.7, yc, yc + 0.003, -1.1, -0.3);
  box('RoofPanelB', g, M.grey, 1.15, 1.7, yc, yc + 0.003, 0.3, 0.8);
  // interior seen through the window
  box('InnerBackPanel', g, M.graphite, WIN.x0, WIN.x1, 0.3, 1.2, -zi, -zi + 0.005);
  box('StageBase', g, M.graphite, 0.25, 0.95, PL, 0.30, -0.6, 0.6);
  box('StageRailPos', g, M.steel, 0.30, 0.90, 0.30, 0.34, 0.40, 0.48);
  box('StageRailNeg', g, M.steel, 0.30, 0.90, 0.30, 0.34, -0.48, -0.40);
  box('StageCarriage', g, M.graphite, 0.42, 0.78, 0.34, 0.62, -0.25, 0.25);
  ringYO(ZERO, 'ChuckCollar', g, M.steel, 0.14, 0.18, 0.62, 0.76, 24, CHUCK_X, 0);
  ringYO(ZERO, 'HeadRing', g, M.graphite, 0.30, 0.46, 0.96, yc - T, 24, HEAD_X, 0);
  cyl('ProbeCard', g, M.grey, 0.30, 0.955, 0.975, 24, HEAD_X, 0);
  return g;
}

// ---------------- chuck ----------------
function buildChuck(root, M) {
  const g = group('chuck', root, CHUCK_O);
  cylO(CHUCK_O, 'ChuckPlaten', g, M.steel, 0.17, 0.80, 0.84, 32, CHUCK_X, 0);
  cylO(CHUCK_O, 'ChuckWafer', g, M.grey, 0.15, 0.84, 0.845, 32, CHUCK_X, 0);
  cylO(CHUCK_O, 'ChuckSkirt', g, M.graphite, 0.10, 0.68, 0.80, 20, CHUCK_X, 0);
  return g;
}

// ---------------- testHead (pivot on the manipulator hinge axis) ----------------
function buildHead(root, M) {
  const g = group('testHead', root, HINGE);
  const H = HINGE;
  const x0 = HEAD_X - HEAD_S / 2, x1 = HEAD_X + HEAD_S / 2;
  const z0 = -HEAD_S / 2, z1 = HEAD_S / 2;
  const y0 = HEAD_Y0, y1 = HEAD_Y1;
  boxO(H, 'HeadBody', g, M.graphite, x0, x1, y0 + 0.08, y1 - 0.03, z0, z1);
  boxO(H, 'HeadCap', g, M.grey, x0 + 0.02, x1 - 0.02, y1 - 0.03, y1, z0 + 0.02, z1 - 0.02);
  // docking rim and probe-card interface in the underside
  boxO(H, 'HeadRimBack', g, M.graphite, x0, x0 + 0.12, y0, y0 + 0.08, z0, z1);
  boxO(H, 'HeadRimFront', g, M.graphite, x1 - 0.12, x1, y0, y0 + 0.08, z0, z1);
  boxO(H, 'HeadRimNeg', g, M.graphite, x0 + 0.12, x1 - 0.12, y0, y0 + 0.08, z0, z0 + 0.12);
  boxO(H, 'HeadRimPos', g, M.graphite, x0 + 0.12, x1 - 0.12, y0, y0 + 0.08, z1 - 0.12, z1);
  cylO(H, 'HeadDockDisc', g, M.steel, 0.26, y0 + 0.06, y0 + 0.08, 24, HEAD_X, 0);
  // ribs, hatch and handle
  [-0.30, -0.10, 0.10, 0.30].forEach((zc, i) => {
    boxO(H, 'HeadRibFront' + i, g, M.grey, x1, x1 + 0.008, 1.42, 1.74, zc - 0.02, zc + 0.02);
  });
  [0.35, 0.60, 0.85].forEach((xc, i) => {
    boxO(H, 'HeadRibNeg' + i, g, M.grey, xc - 0.03, xc + 0.03, 1.42, 1.74, z0 - 0.008, z0);
  });
  boxO(H, 'HeadBackHatch', g, M.grey, x0 - 0.003, x0, 1.42, 1.74, -0.36, 0.36);
  cylZO(H, 'HeadHandleBar', g, M.steel, 0.014, -0.28, 0.28, 12, x1 + 0.065, 1.62);
  boxO(H, 'HeadHandleLegNeg', g, M.steel, x1, x1 + 0.065, 1.605, 1.635, -0.295, -0.265);
  boxO(H, 'HeadHandleLegPos', g, M.steel, x1, x1 + 0.065, 1.605, 1.635, 0.265, 0.295);
  // yoke arms out to the hinge, with lug rings around the fixed shaft
  [['Rear', 0.20, 0.32], ['Front', 0.88, 1.00]].forEach(([nm, ax0, ax1]) => {
    boxO(H, 'HeadArm' + nm, g, M.graphite, ax0, ax1, 1.60, 1.74, z1 - 0.01, HZ);
    ringXO(H, 'HeadLug' + nm, g, M.steel, 0.045, 0.08, ax0, ax1, 16, HY, HZ);
  });
  return g;
}

// ---------------- cables (child of testHead; leaves the back of the head, ends on the hinge axis) ----------------
function buildCables(head, M) {
  const g = group('cables', head);
  const P = (x, y, z) => [x - HINGE[0], y - HINGE[1], z - HINGE[2]];
  const path = [P(0.22, 1.60, 0.16), P(-0.03, 1.60, 0.16), P(-0.03, 1.60, 0.80), P(-0.03, 1.80, 1.10)];
  part('CableBundle', pipeAlongPath(path, 0.055, { bendRadius: 0.12, tubularSegments: 28, radialSegments: 8 }), M.rubber, g, [0, 0, 0]);
  cylXO(HINGE, 'CableCuff', g, M.graphite, 0.075, -0.09, 0.03, 16, HY, HZ);
  cylXO(HINGE, 'CableBoot', g, M.graphite, 0.075, 0.09, 0.17, 16, 1.60, 0.16);
  boxO(HINGE, 'CableClampA', g, M.graphite, -0.10, 0.04, 1.53, 1.67, 0.33, 0.39);
  boxO(HINGE, 'CableClampB', g, M.graphite, -0.10, 0.04, 1.53, 1.67, 0.58, 0.64);
  return g;
}

// ---------------- manipulator (fixed posts, hinge shaft, back plate) ----------------
function buildManipulator(root, M) {
  const g = group('manipulator', root);
  [['Rear', 0.03, 0.15], ['Front', 1.05, 1.17]].forEach(([nm, x0, x1]) => {
    box('Post' + nm, g, M.grey, x0, x1, H_BODY, 1.75, 1.01, 1.21);
    box('PostBase' + nm, g, M.graphite, x0 - 0.03, x1 + 0.03, H_BODY, H_BODY + 0.04, 0.94, 1.28);
    cylXO(ZERO, 'PostBoss' + nm, g, M.steel, 0.09, x0, x1, 20, HY, HZ);
  });
  cylXO(ZERO, 'HingeShaft', g, M.steel, 0.04, 0.05, 1.15, 16, HY, HZ);
  box('BackPlate', g, M.grey, 0.15, 1.05, H_BODY + 0.04, 1.70, 1.19, 1.25);
  box('ControlBox', g, M.graphite, 0.4, 0.8, 1.36, 1.6, 1.25, 1.29);
  return g;
}

// ---------------- testerMainframe ----------------
function buildMainframe(root, M) {
  const g = group('testerMainframe', root);
  box('MfPlinth', g, M.graphite, XM + 0.05, XB - 0.05, 0, PL, -(HWM - 0.05), HWM - 0.05);
  box('MfShell', g, M.white, XM, XB, PL, H_MAIN, -HWM, HWM);
  box('MfBandFront', g, M.accent, XB, XB + 0.004, BAND0, H_MAIN, -HWM, HWM);
  box('MfBackPanel', g, M.grey, XM - 0.003, XM, 0.2, 1.6, -0.8, 0.8);
  for (const s of [1, -1]) {
    const nm = s > 0 ? 'Pos' : 'Neg';
    box('MfBand' + nm, g, M.accent, XM, XB, BAND0, H_MAIN, ...zr(s, HWM, HWM + 0.003));
    box('MfDoor' + nm, g, M.grey, -1.55, -0.45, 0.2, 1.5, ...zr(s, HWM, HWM + 0.003));
    louvres('MfVent' + nm, g, M.graphite, 8, -1.45, -0.55, 1.55, 0.04, 0.02, ...zr(s, HWM, HWM + 0.006));
    cyl('MfHandle' + nm, g, M.steel, 0.011, 0.75, 1.05, 8, -0.62, s * (HWM + 0.012));
    louvres('MfFrontVent' + nm, g, M.graphite, 5, XB, XB + 0.005, 1.4, 0.05, 0.025, ...zr(s, 0.55, 0.95));
  }
  for (let i = 0; i < 6; i++) {
    box('MfTopVent' + i, g, M.graphite, -1.55 + i * 0.16, -1.55 + i * 0.16 + 0.06, H_MAIN, H_MAIN + 0.004, -0.6, 0.6);
  }
  return g;
}

// ---------------- lod1 (2 mm inside the detailed skins) ----------------
function buildLod(root, M) {
  const lod = group('lod1', root);
  if (!SHOW_LOD1) return lod;
  const e = 0.002;
  const h = HW - e;
  const hm = HWM - e;
  box('LodBodyLower', lod, M.white, XB + e, XF - e, e, BODY_BAND0, -h, h);
  box('LodWindow', lod, M.graphite, WIN.x0, WIN.x1, WIN.y0, WIN.y1, h - 0.001, h + 0.001);
  box('LodBodyBand', lod, M.accent, XB + e, XF - e, BODY_BAND0, H_BODY - e, -h, h);
  box('LodHead', lod, M.graphite, HEAD_X - HEAD_S / 2 + e, HEAD_X + HEAD_S / 2 - e, HEAD_Y0 + e, HEAD_Y1 - e, -HEAD_S / 2 + e, HEAD_S / 2 - e);
  box('LodPostRear', lod, M.grey, 0.03 + e, 0.15 - e, H_BODY + e, 1.75 - e, 1.01 + e, 1.21 - e);
  box('LodPostFront', lod, M.grey, 1.05 + e, 1.17 - e, H_BODY + e, 1.75 - e, 1.01 + e, 1.21 - e);
  box('LodBackPlate', lod, M.grey, 0.15 + e, 1.05 - e, H_BODY + 0.04 + e, 1.70 - e, 1.19 + e, 1.25 - e);
  box('LodMainframeLower', lod, M.white, XM + e, XB - e, e, BAND0, -hm, hm);
  box('LodMainframeBand', lod, M.accent, XM + e, XB - e, BAND0, H_MAIN - e, -hm, hm);
  return lod;
}

function build() {
  const root = createRoot('WaferProberTester');
  const M = materials();
  buildBody(root, M);
  box('statusScreen', root, M.screen, XF + 0.006, XF + 0.009, 0.74, 1.06, 0.59, 1.01);
  buildChuck(root, M);
  const head = buildHead(root, M);
  buildCables(head, M);
  buildManipulator(root, M);
  buildMainframe(root, M);
  group('lp1', root, [XF, 0, 0]);
  group('signalTowerMount', root, [1.6, H_BODY, HZ]);
  buildLod(root, M);
  return root;
}

// HeadOpen: smoothstep 0 -> 90 deg about the hinge (+X axis), HeadClose is its reverse.
// ChuckIndex: drop, step +X, rise, drop, step back, rise; every leg smoothstep-eased, ends in the start pose.
function animate(root) {
  const N = 32;
  const openKeys = [];
  const closeKeys = [];
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const s = u * u * (3 - 2 * u);
    openKeys.push({ time: OPEN_SECONDS * u, rotation: [OPEN_DEG * s, 0, 0] });
    closeKeys.push({ time: OPEN_SECONDS * u, rotation: [OPEN_DEG * (1 - s), 0, 0] });
  }
  const D = INDEX_DROP;
  const S = INDEX_STEP;
  const way = [[0, 0, 0], [0.12, 0, -D], [0.38, S, -D], [0.50, S, 0], [0.62, S, -D], [0.88, 0, -D], [INDEX_SECONDS, 0, 0]];
  const idx = [];
  for (let i = 0; i < way.length - 1; i++) {
    const [t0, x0, y0] = way[i];
    const [t1, x1, y1] = way[i + 1];
    for (let k = i === 0 ? 0 : 1; k <= 4; k++) {
      const u = k / 4;
      const e = u * u * (3 - 2 * u);
      idx.push({ time: t0 + (t1 - t0) * u, position: [CHUCK_X + x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, 0] });
    }
  }
  return [
    createClip('HeadOpen', OPEN_SECONDS, [rotationTrack('testHead', openKeys)]),
    createClip('HeadClose', OPEN_SECONDS, [rotationTrack('testHead', closeKeys)]),
    createClip('ChuckIndex', INDEX_SECONDS, [positionTrack('chuck', idx)]),
  ];
}
