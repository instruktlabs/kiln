// Metrology and inspection tool: EFEM, measurement enclosure, electron-beam column or optical head, electronics rack.
const meta = { name: 'Metrology and inspection tool', role: 'prop' };

// Layout (m). +X = load-port face, +Y up, +Z right, origin at the footprint centre on the floor.
const XF = 1.5;            // EFEM front face = load-port mounting plane
const XE = 0.8;            // EFEM / enclosure interface
const XR = -1.08;          // enclosure back face = rack front
const XB = -1.5;           // rack back
const HW = 1.2;            // half width of EFEM, enclosure and rack
const T = 0.05;            // enclosure wall
const PL_E = 0.10;         // EFEM and rack plinth
const PL_C = 0.28;         // enclosure isolation plinth
const RAIL = 0.38;         // enclosure shell starts
const H_ENC = 1.8;
const H_TOP = 2.3;         // fan filter top and column top
const H_RACK = 2.05;
const BAND0 = 1.9;
const BAND1 = 2.0;
const CX = -0.3;           // column, optical head and stage axis
const WX0 = -0.95;         // +Z window opening
const WX1 = 0.35;
const WY0 = 0.70;
const WY1 = 1.50;
const SCAN = 0.15;
const SCAN_SECONDS = 4;

// Review switches (shipping values are all true).
const SHOW_LOD1 = true;
const SHOW_COLUMN = true;
const SHOW_OPTICAL = true;

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
    accent: mat('accent-metrology', 0x9C4D8E, 0.50, 0.0),
    glass,
    screen: mat('screen-glow', 0x9FD3F5, 0.30, 0.0, { emissive: 0x9FD3F5, emissiveIntensity: 1.0 }),
  };
}

function group(name, parent, pos) {
  const g = createPivot(name, pos || [0, 0, 0], parent);
  g.name = name;
  return g;
}

function box(name, parent, m, x0, x1, y0, y1, z0, z1) {
  const p = createPart(name, boxGeo(x1 - x0, y1 - y0, z1 - z0), m, {
    position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    parent,
  });
  p.name = name;
  return p;
}

function cone(name, parent, m, rTop, rBot, y0, y1, seg, cx, cz) {
  const p = createPart(name, cylinderGeo(rTop, rBot, y1 - y0, seg), m, {
    position: [cx || 0, (y0 + y1) / 2, cz || 0],
    parent,
  });
  p.name = name;
  return p;
}

function cyl(name, parent, m, r, y0, y1, seg, cx, cz) {
  return cone(name, parent, m, r, r, y0, y1, seg, cx, cz);
}

// Z range [lo, hi] on side s (+1 / -1) from absolute distances a < b.
const zr = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]);

function louvres(name, parent, m, n, x0, x1, y0, pitch, h, z0, z1) {
  for (let i = 0; i < n; i++) box(name + i, parent, m, x0, x1, y0 + i * pitch, y0 + i * pitch + h, z0, z1);
}

function buildEfem(root, M) {
  const g = group('efem', root);
  const F = XF - 0.05;
  box('EfemPlinth', g, M.graphite, XE, XF, 0, PL_E, -HW, HW);
  box('EfemBody', g, M.white, XE, F, PL_E, BAND0, -HW, HW);
  box('EfemFrontLeft', g, M.white, F, XF, PL_E, BAND0, -HW, -0.56);
  box('EfemFrontRight', g, M.white, F, XF, PL_E, BAND0, 0.56, HW);
  box('EfemFrontTop', g, M.white, F, XF, 1.55, BAND0, -0.56, 0.56);
  box('EfemPortPanel', g, M.grey, F, XF, PL_E, 1.55, -0.56, 0.56);
  box('EfemBand', g, M.accent, XE, XF, BAND0, BAND1, -HW, HW);
  // raised front panels stay outside the load-port zone (|Z| < 0.5025)
  box('EfemFrontPanelR', g, M.grey, XF - 0.001, XF + 0.003, 0.30, 1.75, 0.62, 1.14);
  box('EfemFrontPanelL', g, M.grey, XF - 0.001, XF + 0.003, 0.30, 1.75, -1.14, -0.62);
  louvres('EfemVentL', g, M.graphite, 8, XF + 0.002, XF + 0.008, 0.45, 0.05, 0.02, -1.06, -0.70);
  box('EfemStatusBezel', g, M.graphite, XF + 0.002, XF + 0.011, 1.12, 1.58, 0.76, 1.12);
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'Pos' : 'Neg';
    box('EfemSidePanel' + tag, g, M.grey, 0.92, 1.38, 0.30, 1.75, ...zr(s, HW - 0.001, HW + 0.004));
    louvres('EfemSideVent' + tag, g, M.graphite, 5, 0.98, 1.32, 1.35, 0.05, 0.02, ...zr(s, HW + 0.003, HW + 0.009));
  }
  // mini fan filter
  const fx0 = XE + 0.02;
  const fx1 = XF - 0.02;
  const fz = HW - 0.02;
  box('FfuHousing', g, M.white, fx0, fx1, BAND1, 2.26, -fz, fz);
  box('FfuLid', g, M.grey, XE + 0.05, XF - 0.05, 2.258, H_TOP, -(HW - 0.05), HW - 0.05);
  louvres('FfuVentFront', g, M.graphite, 5, fx1 - 0.002, fx1 + 0.006, 2.05, 0.04, 0.02, -0.8, 0.8);
  for (const s of [1, -1]) {
    louvres('FfuVentSide' + (s > 0 ? 'Pos' : 'Neg'), g, M.graphite, 5, 0.9, 1.4, 2.05, 0.04, 0.02, ...zr(s, fz - 0.002, fz + 0.006));
  }
  return g;
}

function buildEnclosure(root, M) {
  const g = group('enclosure', root);
  const X0 = XR;
  const X1 = XE;
  const YT = H_ENC - T;
  box('EncPlinth', g, M.graphite, XR + 0.03, X1, 0, PL_C, -HW + 0.03, HW - 0.03);
  box('EncRail', g, M.grey, X0, X1, PL_C, RAIL, -HW, HW);
  box('EncFloor', g, M.white, X0 + T, X1 - T, RAIL, RAIL + T, -HW + T, HW - T);
  box('EncWallNeg', g, M.white, X0, X1, RAIL, YT, -HW, -HW + T);
  box('EncWallBack', g, M.white, X0, X0 + T, RAIL, YT, -HW + T, HW - T);
  box('EncWallFront', g, M.white, X1 - T, X1, RAIL, YT, -HW + T, HW - T);
  box('EncRoof', g, M.white, X0, X1, YT, H_ENC, -HW, HW);
  box('EncWallPosLeft', g, M.white, WX1, X1, RAIL, YT, HW - T, HW);
  box('EncWallPosRight', g, M.white, X0, WX0, RAIL, YT, HW - T, HW);
  box('EncWallPosSill', g, M.white, WX0, WX1, RAIL, WY0, HW - T, HW);
  box('EncWallPosLintel', g, M.white, WX0, WX1, WY1, YT, HW - T, HW);
  box('EncLinerBack', g, M.graphite, X0 + T, X0 + T + 0.006, RAIL + T, YT, -HW + T, HW - T);
  box('EncLinerNeg', g, M.graphite, X0 + T + 0.006, X1 - T, RAIL + T, YT, -HW + T, -HW + T + 0.006);
  box('StageBase', g, M.graphite, -1.0, 0.4, RAIL + T, 0.85, -0.7, 0.7);
  cyl('MountPad', g, M.graphite, 0.27, H_ENC - 0.005, 1.83, 32, CX, 0);
  box('RoofHatchBack', g, M.grey, -1.0, -0.62, H_ENC - 0.002, H_ENC + 0.004, -0.55, 0.55);
  box('RoofHatchFront', g, M.grey, 0.25, 0.70, H_ENC - 0.002, H_ENC + 0.004, -0.5, 0.5);
  [0.45, -0.15, -0.75].forEach((c, i) => {
    box('EncPanelNeg' + i, g, M.grey, c - 0.25, c + 0.25, 0.55, 1.65, -HW - 0.004, -HW + 0.001);
  });
  box('EncPanelPos', g, M.grey, 0.42, 0.75, 0.55, 1.65, HW - 0.001, HW + 0.004);
  return g;
}

function buildWindow(root, M) {
  const w = group('enclosureWindow', root);
  const z0 = HW;
  const z1 = HW + 0.012;
  box('WinFrameBottom', w, M.graphite, WX0 - 0.04, WX1 + 0.04, WY0 - 0.04, WY0 + 0.01, z0, z1);
  box('WinFrameTop', w, M.graphite, WX0 - 0.04, WX1 + 0.04, WY1 - 0.01, WY1 + 0.04, z0, z1);
  box('WinFrameLeft', w, M.graphite, WX1 - 0.01, WX1 + 0.04, WY0 + 0.01, WY1 - 0.01, z0, z1);
  box('WinFrameRight', w, M.graphite, WX0 - 0.04, WX0 + 0.01, WY0 + 0.01, WY1 - 0.01, z0, z1);
  box('WinGlass', w, M.glass, WX0 - 0.005, WX1 + 0.005, WY0 - 0.005, WY1 + 0.005, HW + 0.002, HW + 0.006);
  return w;
}

function buildStage(root, M) {
  const st = group('stage', root, [CX, 0, 0]);
  box('StagePlate', st, M.graphite, -0.32, 0.32, 0.848, 0.91, -0.32, 0.32);
  box('StageSlide', st, M.steel, -0.26, 0.26, 0.908, 0.95, -0.26, 0.26);
  cyl('StageRiser', st, M.steel, 0.09, 0.948, 1.0, 20, 0, 0);
  cyl('StageChuck', st, M.steel, 0.17, 0.998, 1.04, 36, 0, 0);
  return st;
}

function buildColumn(root, M) {
  const g = group('column', root);
  cyl('ColCollar', g, M.steel, 0.175, 1.826, 1.87, 24, CX, 0);
  cyl('ColLower', g, M.white, 0.16, 1.87, 2.05, 24, CX, 0);
  cyl('ColRing1', g, M.steel, 0.175, 2.05, 2.09, 24, CX, 0);
  cyl('ColMid', g, M.grey, 0.15, 2.09, 2.20, 24, CX, 0);
  cyl('ColRing2', g, M.steel, 0.175, 2.20, 2.24, 24, CX, 0);
  cyl('ColTop', g, M.white, 0.13, 2.24, 2.27, 24, CX, 0);
  cyl('ColCap', g, M.steel, 0.09, 2.27, H_TOP, 16, CX, 0);
  cyl('ColSnout', g, M.steel, 0.06, 1.45, 1.78, 16, CX, 0);
  cone('ColTip', g, M.steel, 0.06, 0.025, 1.36, 1.45, 16, CX, 0);
  return g;
}

function buildOptical(root, M) {
  const g = group('opticalHead', root);
  box('OptTrim', g, M.graphite, CX - 0.30, CX + 0.30, H_ENC - 0.002, 1.87, -0.30, 0.30);
  box('OptBody', g, M.white, CX - 0.27, CX + 0.27, 1.87, 1.98, -0.27, 0.27);
  cyl('OptTube', g, M.steel, 0.10, 1.98, 2.10, 24, CX, 0);
  box('OptCamera', g, M.graphite, CX - 0.12, CX + 0.12, 2.10, 2.16, -0.12, 0.12);
  box('OptLamp', g, M.grey, CX + 0.265, CX + 0.42, 1.90, 1.98, -0.06, 0.06);
  cyl('OptSnout', g, M.steel, 0.05, 1.5, 1.78, 16, CX, 0);
  cone('OptTip', g, M.steel, 0.05, 0.03, 1.42, 1.5, 16, CX, 0);
  return g;
}

function buildRack(root, M) {
  const g = group('electronicsRack', root);
  box('RackPlinth', g, M.graphite, XB, XR, 0, PL_E, -HW, HW);
  box('RackBody', g, M.white, XB + 0.01, XR, PL_E, BAND0, -HW, HW);
  box('RackBand', g, M.accent, XB, XR, BAND0, BAND1, -HW, HW);
  box('RackCap', g, M.graphite, XB + 0.02, XR, BAND1, H_RACK, -HW + 0.02, HW - 0.02);
  [-0.8, 0, 0.8].forEach((c, i) => {
    box('RackDoor' + i, g, M.grey, XB, XB + 0.01, 0.20, 1.80, c - 0.37, c + 0.37);
    louvres('RackVent' + i + '_', g, M.graphite, 4, XB - 0.006, XB, 1.45, 0.06, 0.02, c - 0.30, c + 0.30);
    box('RackHandle' + i, g, M.steel, XB - 0.008, XB, 0.95, 1.15, c + 0.28, c + 0.31);
  });
  for (const s of [1, -1]) {
    louvres('RackSideVent' + (s > 0 ? 'Pos' : 'Neg'), g, M.graphite, 4, -1.4, -1.15, 1.5, 0.06, 0.02, ...zr(s, HW - 0.001, HW + 0.006));
  }
  return g;
}

function buildLod(root, M) {
  const lod = group('lod1', root);
  if (!SHOW_LOD1) return lod;
  const e = 0.002;
  const h = HW - e;
  // EFEM
  box('LodEfemLower', lod, M.white, XE + e, XF - e, e, BAND0, -h, h);
  box('LodEfemBand', lod, M.accent, XE + e, XF - e, BAND0, BAND1, -h, h);
  box('LodEfemFilter', lod, M.white, XE + 0.02 + e, XF - 0.02 - e, BAND1, H_TOP - e, -(HW - 0.02 - e), HW - 0.02 - e);
  // enclosure
  box('LodEncBase', lod, M.graphite, XR + 0.03 + e, XE + e, e, RAIL, -(HW - 0.03 - e), HW - 0.03 - e);
  box('LodEncShell', lod, M.white, XR + e, XE + e, RAIL, H_ENC - e, -h, h);
  // column stub (inside the 0.16 m radius body)
  box('LodColumn', lod, M.white, CX - 0.12, CX + 0.12, H_ENC, H_TOP - e, -0.12, 0.12);
  // rack
  box('LodRackLower', lod, M.white, XB + e, XR + e, e, BAND0, -h, h);
  box('LodRackBand', lod, M.accent, XB + e, XR + e, BAND0, BAND1, -h, h);
  box('LodRackCap', lod, M.graphite, XB + 0.02 + e, XR + e, BAND1, H_RACK - e, -(HW - 0.02 - e), HW - 0.02 - e);
  return lod;
}

function build() {
  const root = createRoot('MetrologyInspectionTool');
  const M = materials();
  buildEfem(root, M);
  box('statusScreen', root, M.screen, XF + 0.009, XF + 0.014, 1.15, 1.55, 0.79, 1.09);
  buildEnclosure(root, M);
  buildWindow(root, M);
  buildStage(root, M);
  if (SHOW_COLUMN) buildColumn(root, M); else group('column', root);
  if (SHOW_OPTICAL) buildOptical(root, M); else group('opticalHead', root);
  buildRack(root, M);
  group('lp1', root, [XF, 0, -0.2525]);
  group('lp2', root, [XF, 0, 0.2525]);
  group('signalTowerMount', root, [1.35, H_TOP, 1.05]);
  buildLod(root, M);
  return root;
}

// Raster: centre -> (-S,-S) -> (+S,-S) -> (+S,+S) -> (-S,+S) -> centre; each leg smoothstep-eased.
function animate(root) {
  const S = SCAN;
  const way = [[0, 0, 0], [0.5, -S, -S], [1.25, S, -S], [1.75, S, S], [2.5, -S, S], [SCAN_SECONDS, 0, 0]];
  const N = 8;
  const keys = [];
  for (let i = 0; i < way.length - 1; i++) {
    const [t0, x0, z0] = way[i];
    const [t1, x1, z1] = way[i + 1];
    for (let k = i === 0 ? 0 : 1; k <= N; k++) {
      const u = k / N;
      const ease = u * u * (3 - 2 * u);
      keys.push({ time: t0 + (t1 - t0) * u, position: [CX + x0 + (x1 - x0) * ease, 0, z0 + (z1 - z0) * ease] });
    }
  }
  return [createClip('StageScan', SCAN_SECONDS, [positionTrack('stage', keys)])];
}
