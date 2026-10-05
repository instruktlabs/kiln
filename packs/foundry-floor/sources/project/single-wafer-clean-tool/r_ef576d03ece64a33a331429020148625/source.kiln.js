const meta = { name: 'Single-wafer clean tool' };

// ------------------------------------------------------------ switches
const SHOW_LOD1 = true;       // false builds a detailed-only review variant (lod1 is exported visible)

// ------------------------------------------------------------ layout (metres, +X is the load-port face)
const X_FRONT = 2.5;          // load-port plane (grey port panel)
const EFEM_X0 = 1.7;
const EFEM_FACE = 2.49;       // white front face, 10 mm behind the port plane
const EFEM_H = 2.4;
const FAN_H = 2.8;
const CAB_X0 = -2.45;         // cabinet body back face; doors sit outside it
const DOOR_OUT = -2.48;
const CAB_H = 2.4;
const TOWER_X = 1.7;          // towers span X -1.7..+1.7
const CORRIDOR = 0.5;         // corridor half width (1.0 m corridor)
const SIDE = 1.792;           // outer face of covers and panels; windows reach 1.800
const PLINTH = 0.1;
const TIER = 0.55;
const TIERS = 5;
const TOWER_TOP = PLINTH + TIER * TIERS;   // 2.85
const COVER_TOP = 2.9;
const DUCT_TOP = 3.2;
const BAND_LO = 1.9;
const BAND_HI = 2.0;
const STRIPE_OUT = 0.005;
const STRIPE_IN = 0.005;
const WIN_DY = 0.38;          // window centre above the tier floor
const ROBOT_REST = [1.0, 0, 0];   // EFEM hand-off
const ROBOT_PICK = [-0.9, 1.1, 0]; // third tier of the rear chambers
const LP_Z = [-0.7575, -0.2525, 0.2525, 0.7575];

// ------------------------------------------------------------ helpers
let M;

function surface(name, hex, roughness, metalness, glow) {
  const opts = { roughness: roughness, metalness: metalness, flatShading: false };
  if (glow) { opts.emissive = hex; opts.emissiveIntensity = glow; }
  const m = gameMaterial(hex, opts);
  m.name = name;
  return m;
}

function makeMaterials() {
  const glass = glassMaterial(0x5E6A73, { opacity: 0.6, roughness: 0.1, metalness: 0 });
  glass.name = 'glass-smoked';
  return {
    white: surface('tool-shell-white', 0xE8EBEE, 0.55, 0.0),
    grey: surface('tool-panel-grey', 0xC5CBD1, 0.60, 0.0),
    graphite: surface('trim-graphite', 0x3B4148, 0.50, 0.1),
    steel: surface('stainless', 0xB9BEC3, 0.35, 1.0),
    accent: surface('accent-clean', 0x3A9FC6, 0.50, 0.0),
    pvc: surface('pvc-grey', 0x8D9399, 0.70, 0.0),
    glass: glass,
    screen: surface('screen-glow', 0x9FD3F5, 0.30, 0.0, 0.8),
  };
}

function group(name, position, parent) {
  const g = createPivot(name, position, parent);
  g.name = name;
  return g;
}

function slab(name, material, parent, x0, x1, y0, y1, z0, z1) {
  return createPart(name, boxGeo(x1 - x0, y1 - y0, z1 - z0), material,
    { position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], parent: parent });
}

function drum(name, material, parent, r, y0, y1, seg, x, z) {
  return createPart(name, cylinderGeo(r, r, y1 - y0, seg), material,
    { position: [x, (y0 + y1) / 2, z], parent: parent });
}

function axisX(name, material, parent, r, x0, x1, seg, y, z) {
  return createPart(name, cylinderGeo(r, r, x1 - x0, seg), material,
    { position: [(x0 + x1) / 2, y, z], rotation: [0, 0, 90], parent: parent });
}

// ------------------------------------------------------------ base frame, covers, family stripe
function buildFrame(root) {
  const g = group('frame', [0, 0, 0], root);
  slab('plinth', M.graphite, g, -2.48, 2.48, 0, PLINTH, -1.77, 1.77);
  slab('topCover', M.grey, g, -TOWER_X, TOWER_X, TOWER_TOP, COVER_TOP, -SIDE, SIDE);
  slab('railPlateP', M.steel, g, -1.62, 1.62, 0.12, 2.82, CORRIDOR - 0.003, CORRIDOR + 0.003);
  slab('railPlateM', M.steel, g, -1.62, 1.62, 0.12, 2.82, -CORRIDOR - 0.003, -CORRIDOR + 0.003);
  slab('stripeFront', M.accent, g, EFEM_FACE - STRIPE_IN, EFEM_FACE + STRIPE_OUT, BAND_LO, BAND_HI, -(SIDE - STRIPE_IN), SIDE - STRIPE_IN);
  slab('stripeP', M.accent, g, CAB_X0, EFEM_FACE + STRIPE_OUT, BAND_LO, BAND_HI, SIDE - STRIPE_IN, SIDE + STRIPE_OUT);
  slab('stripeM', M.accent, g, CAB_X0, EFEM_FACE + STRIPE_OUT, BAND_LO, BAND_HI, -(SIDE + STRIPE_OUT), -(SIDE - STRIPE_IN));
}

// ------------------------------------------------------------ EFEM with mini fan filter
function buildEfem(root) {
  const g = group('efem', [0, 0, 0], root);
  slab('efemBody', M.white, g, EFEM_X0, EFEM_FACE, PLINTH, EFEM_H, -SIDE, SIDE);
  slab('efemPortPanel', M.grey, g, EFEM_FACE - 0.01, X_FRONT, PLINTH, 1.5, -1.1, 1.1);
  slab('fanFilter', M.grey, g, 1.78, 2.42, EFEM_H, FAN_H, -1.7, 1.7);
  for (let i = 0; i < 9; i++) {
    const z = -1.2 + 0.3 * i;
    slab('fanSlat' + (i + 1), M.graphite, g, 1.9, 2.3, FAN_H, FAN_H + 0.015, z - 0.03, z + 0.03);
  }
  for (let i = 0; i < 5; i++) {
    const y = 0.45 + 0.09 * i;
    slab('efemVentP' + (i + 1), M.graphite, g, 1.85, 2.35, y, y + 0.03, SIDE - 0.002, SIDE + 0.004);
    slab('efemVentM' + (i + 1), M.graphite, g, 1.85, 2.35, y, y + 0.03, -(SIDE + 0.004), -(SIDE - 0.002));
  }
}

// ------------------------------------------------------------ two towers, 2 chambers long x 5 tiers, 20 windows
function buildTowers(root) {
  const g = group('chamberTowers', [0, 0, 0], root);
  [1, -1].forEach(function (s) {
    const tag = s > 0 ? 'P' : 'M';
    const zCore = SIDE - 0.032;
    slab('towerCore' + tag, M.graphite, g, -TOWER_X, TOWER_X, PLINTH, TOWER_TOP,
      s > 0 ? CORRIDOR : -zCore, s > 0 ? zCore : -CORRIDOR);
    for (let k = 0; k < TIERS; k++) {
      const yb = PLINTH + TIER * k;
      const yc = yb + WIN_DY;
      for (let c = 0; c < 2; c++) {
        const cx = c === 0 ? 0.85 : -0.85;
        const cn = tag + (k + 1) + (c === 0 ? 'F' : 'R');
        slab('panel' + cn, M.white, g, cx - 0.83, cx + 0.83, yb + 0.02, yb + 0.53,
          s > 0 ? SIDE - 0.06 : -SIDE, s > 0 ? SIDE : -(SIDE - 0.06));
        slab('bezel' + cn, M.graphite, g, cx - 0.31, cx + 0.31, yc - 0.11, yc + 0.11,
          s > 0 ? SIDE - 0.01 : -(SIDE + 0.005), s > 0 ? SIDE + 0.005 : -(SIDE - 0.01));
        slab('win' + cn, M.glass, g, cx - 0.28, cx + 0.28, yc - 0.09, yc + 0.09,
          s > 0 ? SIDE + 0.004 : -(SIDE + 0.008), s > 0 ? SIDE + 0.008 : -(SIDE + 0.004));
        drum('handle' + cn, M.steel, g, 0.008, yb + 0.28, yb + 0.48, 8, c === 0 ? 1.5 : -1.5, s * (SIDE - 0.002));
      }
    }
  });
}

// ------------------------------------------------------------ chemical cabinet at the back
function buildCabinet(root) {
  const g = group('chemicalCabinet', [0, 0, 0], root);
  slab('cabBody', M.white, g, CAB_X0, -TOWER_X, PLINTH, CAB_H, -SIDE, SIDE);
  slab('cabDoorP', M.grey, g, DOOR_OUT, CAB_X0, 0.25, 2.25, 0.02, 1.70);
  slab('cabDoorM', M.grey, g, DOOR_OUT, CAB_X0, 0.25, 2.25, -1.70, -0.02);
  slab('cabSeam', M.graphite, g, DOOR_OUT + 0.001, CAB_X0 + 0.001, 0.24, 2.26, -0.02, 0.02);
  drum('cabHandleP', M.steel, g, 0.012, 0.95, 1.45, 8, -2.485, 0.12);
  drum('cabHandleM', M.steel, g, 0.012, 0.95, 1.45, 8, -2.485, -0.12);
  for (let i = 0; i < 7; i++) {
    const z = -1.2 + 0.4 * i;
    slab('cabVent' + (i + 1), M.graphite, g, -2.35, -1.95, CAB_H, CAB_H + 0.015, z - 0.05, z + 0.05);
  }
}

// ------------------------------------------------------------ grey plastic lines: cabinet top -> tower tops
function buildLines(root) {
  const g = group('chemicalLines', [0, 0, 0], root);
  [1, -1].forEach(function (s) {
    [0, 1].forEach(function (j) {
      const z = s * (1.5 + 0.16 * j);
      const tag = (s > 0 ? 'P' : 'M') + (j + 1);
      drum('lineRiser' + tag, M.pvc, g, 0.03, CAB_H, 2.96, 12, -1.73, z);
      axisX('lineRun' + tag, M.pvc, g, 0.03, -1.73, 1.45, 12, 2.93, z);
      [-1.1, -0.3, 0.5, 1.2].forEach(function (x, i) {
        slab('lineBlock' + tag + (i + 1), M.pvc, g, x - 0.06, x + 0.06, COVER_TOP, 2.99, z - 0.05, z + 0.05);
      });
    });
  });
}

// ------------------------------------------------------------ exhaust ducts on the tower tops
function buildDucts(root) {
  const g = group('exhaustDucts', [0, 0, 0], root);
  [1, -1].forEach(function (s) {
    const tag = s > 0 ? 'P' : 'M';
    const z = s * 1.15;
    drum('ductFlange' + tag, M.steel, g, 0.19, COVER_TOP, COVER_TOP + 0.04, 16, -0.6, z);
    drum('ductBody' + tag, M.steel, g, 0.15, COVER_TOP, DUCT_TOP - 0.02, 16, -0.6, z);
    drum('ductCap' + tag, M.graphite, g, 0.17, DUCT_TOP - 0.02, DUCT_TOP, 16, -0.6, z);
  });
}

// ------------------------------------------------------------ central robot: wall-sliding carriage, origin at the hand-off
function buildRobot(root) {
  const g = group('centralRobot', ROBOT_REST, root);
  slab('robotPadP', M.graphite, g, -0.15, 0.15, 0.14, 0.64, 0.456, 0.496);
  slab('robotPadM', M.graphite, g, -0.15, 0.15, 0.14, 0.64, -0.496, -0.456);
  slab('robotCrossbar', M.graphite, g, -0.08, 0.08, 0.30, 0.44, -0.456, 0.456);
  slab('robotColumn', M.graphite, g, -0.07, 0.07, 0.44, 0.58, -0.07, 0.07);
  drum('robotTurret', M.steel, g, 0.09, 0.58, 0.64, 12, 0, 0);
  slab('robotWrist', M.steel, g, 0.0, 0.12, 0.44, 0.47, -0.10, 0.10);
  slab('robotForkP', M.steel, g, 0.06, 0.52, 0.44, 0.452, 0.04, 0.09);
  slab('robotForkM', M.steel, g, 0.06, 0.52, 0.44, 0.452, -0.09, -0.04);
}

// ------------------------------------------------------------ status screen on the EFEM front (outside the port zone)
function buildStatusScreen(root) {
  const g = group('statusScreen', [0, 0, 0], root);
  slab('screenBezel', M.graphite, g, EFEM_FACE - 0.005, EFEM_FACE + 0.007, 1.42, 1.78, -1.64, -1.16);
  slab('screenPanel', M.screen, g, EFEM_FACE + 0.004, EFEM_FACE + 0.0085, 1.45, 1.75, -1.61, -1.19);
}

function buildLocators(root) {
  LP_Z.forEach(function (z, i) { group('lp' + (i + 1), [X_FRONT, 0, z], root); });
  group('signalTowerMount', [2.35, 2.8, 1.6], root);
}

// ------------------------------------------------------------ lod1: boxes 2 mm inside the detailed skins
function buildLod1(root) {
  const g = group('lod1', [0, 0, 0], root);
  const e = 0.002;
  slab('lodPlinth', M.graphite, g, -2.478, 2.478, e, PLINTH, -1.768, 1.768);
  slab('lodEfem', M.white, g, EFEM_X0, EFEM_FACE - e, PLINTH, EFEM_H - e, -(SIDE - e), SIDE - e);
  slab('lodFan', M.grey, g, 1.782, 2.418, EFEM_H, FAN_H - e, -1.698, 1.698);
  slab('lodTowerP', M.white, g, -(TOWER_X - e), TOWER_X - e, PLINTH, COVER_TOP - e, CORRIDOR + e, SIDE - e);
  slab('lodTowerM', M.white, g, -(TOWER_X - e), TOWER_X - e, PLINTH, COVER_TOP - e, -(SIDE - e), -(CORRIDOR + e));
  slab('lodRoof', M.grey, g, -(TOWER_X - e), TOWER_X - e, TOWER_TOP, COVER_TOP - e, -(CORRIDOR + e), CORRIDOR + e);
  slab('lodCabinet', M.white, g, CAB_X0 + e, -(TOWER_X + e), PLINTH, CAB_H - e, -(SIDE - e), SIDE - e);
  slab('lodCabDoors', M.grey, g, DOOR_OUT + e, CAB_X0 + e, 0.25 + e, 2.25 - e, -(1.7 - e), 1.7 - e);
  [1, -1].forEach(function (s) {
    slab('lodDuct' + (s > 0 ? 'P' : 'M'), M.steel, g, -0.74, -0.46, COVER_TOP, DUCT_TOP - e,
      s * 1.15 - 0.14, s * 1.15 + 0.14);
  });
  slab('lodStripeFront', M.accent, g, EFEM_FACE - STRIPE_IN + e, EFEM_FACE + STRIPE_OUT - e, BAND_LO + e, BAND_HI - e, -(SIDE - STRIPE_IN - e), SIDE - STRIPE_IN - e);
  slab('lodStripeP', M.accent, g, CAB_X0 + e, EFEM_FACE + STRIPE_OUT - e, BAND_LO + e, BAND_HI - e, SIDE - STRIPE_IN + e, SIDE + STRIPE_OUT - e);
  slab('lodStripeM', M.accent, g, CAB_X0 + e, EFEM_FACE + STRIPE_OUT - e, BAND_LO + e, BAND_HI - e, -(SIDE + STRIPE_OUT - e), -(SIDE - STRIPE_IN + e));
}

function build() {
  M = makeMaterials();
  const root = createRoot('SingleWaferCleanTool');
  buildFrame(root);
  buildEfem(root);
  buildTowers(root);
  buildCabinet(root);
  buildLines(root);
  buildDucts(root);
  buildRobot(root);
  buildStatusScreen(root);
  buildLocators(root);
  if (SHOW_LOD1) buildLod1(root);
  return root;
}

// ------------------------------------------------------------ clips
function ease(u) { return (1 - Math.cos(Math.PI * u)) / 2; }

function animate(root) {
  const at = function (u) {
    return [
      ROBOT_REST[0] + (ROBOT_PICK[0] - ROBOT_REST[0]) * u,
      ROBOT_REST[1] + (ROBOT_PICK[1] - ROBOT_REST[1]) * u,
      0,
    ];
  };
  const keys = [];
  for (let i = 0; i <= 12; i++) keys.push({ time: i * 0.1, position: at(ease(i / 12)) });
  keys.push({ time: 1.5, position: at(1) });
  for (let i = 1; i <= 12; i++) keys.push({ time: 1.5 + i * 0.1, position: at(ease(1 - i / 12)) });
  keys.push({ time: 3.0, position: at(0) });
  return [createClip('RobotTransfer', 3, [positionTrack('centralRobot', keys)])];
}
