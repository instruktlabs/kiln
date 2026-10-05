const meta = { name: 'Ion implanter' };

// ------------------------------------------------------------ switches
const SHOW_LOD1 = true;       // false builds a detailed-only review variant (lod1 is exported visible and hides window views)
const SHOW_ENCLOSURE = true;  // false builds the enclosure-hidden review variant

// ------------------------------------------------------------ layout (metres, +X is the operator face, beamline along Z)
const X_FRONT = 2.25;
const X_BACK = -2.25;
const Z_MIN = -4.25;
const Z_TERM = -2.0;
const Z_END = 2.25;
const Z_MAX = 4.25;
const H_TERM = 2.8;
const H_TERM_BODY = 2.55;
const H_BEAM = 2.2;           // top of the roof ribs
const H_ROOF = 2.165;         // flat roof and upper wall top
const H_END = 2.4;
const PLINTH = 0.12;
const WALL = 0.05;
const BAND_LO = 1.9;
const BAND_HI = 2.0;
const STRIPE_OUT = 0.005;
const STRIPE_IN = 0.001;

// source terminal
const TERM_FRONT_X0 = 1.5;
const WIN_Z0 = -4.05;
const WIN_Z1 = -3.45;
const WIN_Y0 = 1.05;
const WIN_Y1 = 1.75;
const DOOR_Z0 = -3.25;
const DOOR_Z1 = -2.35;
const DOOR_Y1 = 2.2;
const DOOR_GAP = 0.015;
const DOOR_OPEN_DEG = 100;
const SOURCE_Y = 1.4;
const SOURCE_Z = -3.75;

// beamline
const TUBE_X = -0.5;
const TUBE_Y = 1.3;
const TUBE_R = 0.125;
const TUBE_Z0 = -2.2;
const TUBE_Z1 = 2.6;
const YOKE_Z0 = -2.0;
const YOKE_Z1 = -0.4;
const YOKE_X0 = -1.35;
const YOKE_X1 = 0.35;
const YOKE_Y0 = 0.6;
const YOKE_Y1 = 2.0;
const YOKE_BAR = 0.25;
const SPINE_X1 = -1.05;
const POLE_R = 0.34;
const POLE_Z = -1.2;
const GAP_Y0 = 1.1;
const GAP_Y1 = 1.5;
const COIL_TUBE = 0.11;
const RING_COUNT = 8;
const RING_Z0 = -0.257;
const RING_PITCH = 0.352;
const RING_R = 0.34;
const RING_TUBE = 0.05;
const ENC_X0 = -1.55;
const ENC_WIN_Y0 = 0.72;
const ENC_WIN_Y1 = 1.78;
const RACK_COUNT = 6;
const RACK_PITCH = 0.7;
const RACK_TOP = 2.05;

// end station
const ES_WIN_Y0 = 1.5;
const ES_WIN_Y1 = 1.85;
const ES_WIN_Z0 = 2.35;
const ES_WIN_Z1 = 4.15;
const CHAMBER_X = -0.5;
const CHAMBER_Z = 3.3;
const CHAMBER_R = 0.75;
const ROBOT_POS = [1.0, 0.2, 3.3];
const LP_Z = [2.9975, 3.5025];

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
    accent: surface('accent-implant', 0xC4553A, 0.50, 0.0),
    copper: surface('copper', 0xB8733D, 0.35, 1.0),
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

function axisZ(name, material, parent, r, z0, z1, seg, x, y) {
  return createPart(name, cylinderGeo(r, r, z1 - z0, seg), material,
    { position: [x, y, (z0 + z1) / 2], rotation: [90, 0, 0], parent: parent });
}

function axisX(name, material, parent, r, x0, x1, seg, y, z) {
  return createPart(name, cylinderGeo(r, r, x1 - x0, seg), material,
    { position: [(x0 + x1) / 2, y, z], rotation: [0, 0, 90], parent: parent });
}

// ------------------------------------------------------------ source terminal (tallest part, -Z end)
function buildTerminal(root) {
  const g = group('sourceTerminal', [0, 0, 0], root);
  const fx = TERM_FRONT_X0;
  slab('termPlinth', M.graphite, g, X_BACK, X_FRONT, 0, PLINTH, Z_MIN, Z_TERM);
  slab('termMass', M.white, g, X_BACK, fx, PLINTH, H_TERM_BODY, Z_MIN, Z_TERM);
  slab('termFrontEnd', M.white, g, fx, X_FRONT, PLINTH, H_TERM_BODY, Z_MIN, WIN_Z0);
  slab('termFrontSill', M.white, g, fx, X_FRONT, PLINTH, WIN_Y0, WIN_Z0, WIN_Z1);
  slab('termFrontHead', M.white, g, fx, X_FRONT, WIN_Y1, H_TERM_BODY, WIN_Z0, WIN_Z1);
  slab('termFrontMid', M.white, g, fx, X_FRONT, PLINTH, H_TERM_BODY, WIN_Z1, DOOR_Z0);
  slab('termFrontLintel', M.white, g, fx, X_FRONT, DOOR_Y1, H_TERM_BODY, DOOR_Z0, DOOR_Z1);
  slab('termFrontRight', M.white, g, fx, X_FRONT, PLINTH, H_TERM_BODY, DOOR_Z1, Z_TERM);
  slab('termWindowBack', M.graphite, g, fx - 0.01, fx + 0.01, WIN_Y0 - 0.01, WIN_Y1 + 0.01, WIN_Z0 - 0.01, WIN_Z1 + 0.01);
  slab('termDoorBack', M.graphite, g, fx - 0.01, fx + 0.01, PLINTH - 0.01, DOOR_Y1 + 0.01, DOOR_Z0 - 0.01, DOOR_Z1 + 0.01);
  slab('termWindowGlass', M.glass, g, 2.215, 2.225, WIN_Y0 - 0.01, WIN_Y1 + 0.01, WIN_Z0 - 0.01, WIN_Z1 + 0.01);
  axisX('sourceHousing', M.steel, g, 0.2, fx + 0.005, 2.02, 20, SOURCE_Y, SOURCE_Z);
  axisX('sourceFlangeA', M.steel, g, 0.27, 1.6, 1.66, 20, SOURCE_Y, SOURCE_Z);
  axisX('sourceFlangeB', M.steel, g, 0.27, 1.9, 1.96, 20, SOURCE_Y, SOURCE_Z);
  slab('termCabinet', M.grey, g, fx + 0.01, 1.95, PLINTH, 1.3, -3.2, -2.75);
  drum('termColumn', M.steel, g, 0.11, PLINTH, 1.9, 16, 1.75, -2.55);
  slab('termBusbar', M.graphite, g, fx + 0.01, 1.75, 1.75, 1.8, -3.2, -2.55);
  slab('termCapLow', M.grey, g, -2.05, 1.95, H_TERM_BODY, 2.68, Z_MIN + 0.05, Z_TERM - 0.05);
  slab('termCapHigh', M.grey, g, -1.6, 1.5, 2.68, H_TERM, -3.9, -2.35);
  for (let i = 0; i < 5; i++) {
    slab('termVent' + (i + 1), M.graphite, g, X_BACK - STRIPE_OUT, X_BACK + STRIPE_IN, 0.8 + 0.1 * i, 0.83 + 0.1 * i, -3.9, -2.35);
  }
  slab('termStripeFront', M.accent, g, X_FRONT - STRIPE_IN, X_FRONT + STRIPE_OUT, BAND_LO, BAND_HI, Z_MIN, DOOR_Z0 - 0.012);
  slab('termStripeRight', M.accent, g, X_FRONT - STRIPE_IN, X_FRONT + STRIPE_OUT, BAND_LO, BAND_HI, DOOR_Z1, Z_TERM);
  slab('termStripeEnd', M.accent, g, X_BACK, X_FRONT, BAND_LO, BAND_HI, Z_MIN - STRIPE_OUT, Z_MIN + STRIPE_IN);
}

// hinge on the -Z edge of the opening, axis vertical; positive Y rotation swings the leaf outward (+X)
function buildDoor(root) {
  const g = group('serviceDoor', [X_FRONT, 0, DOOR_Z0], root);
  const w = DOOR_Z1 - DOOR_Z0 - DOOR_GAP;
  slab('doorLeaf', M.grey, g, -WALL, 0, PLINTH + 0.005, DOOR_Y1 - 0.005, 0.005, w);
  slab('doorStripe', M.accent, g, -STRIPE_IN, STRIPE_OUT, BAND_LO, BAND_HI, 0.005, w);
  slab('doorHandle', M.graphite, g, -0.001, 0.03, 0.95, 1.3, w - 0.1, w - 0.07);
  for (let i = 0; i < 4; i++) {
    slab('doorVent' + (i + 1), M.graphite, g, -0.001, 0.004, 1.5 + 0.06 * i, 1.525 + 0.06 * i, 0.15, 0.7);
  }
  drum('doorHingeLow', M.steel, g, 0.02, 0.3, 0.6, 12, 0, 0.021);
  drum('doorHingeHigh', M.steel, g, 0.02, 1.4, 1.7, 12, 0, 0.021);
}

// ------------------------------------------------------------ beamline
function buildTube(root) {
  const g = group('beamTube', [0, 0, 0], root);
  axisZ('tubeBody', M.steel, g, TUBE_R, TUBE_Z0, TUBE_Z1, 20, TUBE_X, TUBE_Y);
  [-1.94, -0.38, 2.19].forEach(function (z, i) {
    axisZ('tubeFlange' + (i + 1), M.steel, g, 0.2, z - 0.03, z + 0.03, 20, TUBE_X, TUBE_Y);
  });
}

function buildMagnet(root) {
  const g = group('analyzerMagnet', [0, 0, 0], root);
  slab('yokeSpine', M.accent, g, YOKE_X0, SPINE_X1, YOKE_Y0, YOKE_Y1, YOKE_Z0, YOKE_Z1);
  slab('yokeTop', M.accent, g, YOKE_X0, YOKE_X1, YOKE_Y1 - YOKE_BAR, YOKE_Y1, YOKE_Z0, YOKE_Z1);
  slab('yokeBottom', M.accent, g, YOKE_X0, YOKE_X1, YOKE_Y0, YOKE_Y0 + YOKE_BAR, YOKE_Z0, YOKE_Z1);
  drum('poleLower', M.accent, g, POLE_R, YOKE_Y0 + YOKE_BAR - 0.01, GAP_Y0, 24, TUBE_X, POLE_Z);
  drum('poleUpper', M.accent, g, POLE_R, GAP_Y1, YOKE_Y1 - YOKE_BAR + 0.01, 24, TUBE_X, POLE_Z);
  slab('yokeFootA', M.graphite, g, -1.25, 0.25, 0, YOKE_Y0 + 0.01, -1.95, -1.55);
  slab('yokeFootB', M.graphite, g, -1.25, 0.25, 0, YOKE_Y0 + 0.01, -0.85, -0.45);
}

function buildCoils(root) {
  const g = group('magnetCoils', [0, 0, 0], root);
  const r = POLE_R + COIL_TUBE - 0.005;
  createPart('coilLower', torusGeo(r, COIL_TUBE, 8, 24), M.copper,
    { position: [TUBE_X, YOKE_Y0 + YOKE_BAR + COIL_TUBE - 0.005, POLE_Z], rotation: [90, 0, 0], parent: g });
  createPart('coilUpper', torusGeo(r, COIL_TUBE, 8, 24), M.copper,
    { position: [TUBE_X, YOKE_Y1 - YOKE_BAR - COIL_TUBE + 0.005, POLE_Z], rotation: [90, 0, 0], parent: g });
}

function buildRings(root) {
  const g = group('acceleratorRings', [0, 0, 0], root);
  for (let i = 0; i < RING_COUNT; i++) {
    const z = RING_Z0 + i * RING_PITCH;
    createPart('ring' + (i + 1), torusGeo(RING_R, RING_TUBE, 6, 20), M.steel,
      { position: [TUBE_X, TUBE_Y, z], parent: g });
    slab('ringPost' + (i + 1), M.graphite, g, TUBE_X - 0.035, TUBE_X + 0.035, 0, TUBE_Y - RING_R - RING_TUBE + 0.01, z - 0.035, z + 0.035);
  }
}

function buildEnclosure(root) {
  const g = group('shieldingEnclosure', [0, 0, 0], root);
  const fx0 = X_FRONT - WALL;
  const z0 = Z_TERM;
  const z1 = Z_END;
  slab('encKick', M.graphite, g, fx0, X_FRONT, 0, PLINTH, z0, z1);
  slab('encSkirt', M.white, g, fx0, X_FRONT, PLINTH, 0.65, z0, z1);
  slab('encSill', M.grey, g, fx0, X_FRONT, 0.65, ENC_WIN_Y0, z0, z1);
  slab('encHead', M.grey, g, fx0, X_FRONT, ENC_WIN_Y1, 1.85, z0, z1);
  slab('encUpper', M.white, g, fx0, X_FRONT, 1.85, H_ROOF, z0, z1);
  [-1.97, -0.3, 0.6, 1.5, 2.22].forEach(function (z, i) {
    slab('encPost' + (i + 1), M.grey, g, fx0, X_FRONT, ENC_WIN_Y0, ENC_WIN_Y1, z - 0.03, z + 0.03);
  });
  slab('encGlass', M.glass, g, 2.215, 2.225, ENC_WIN_Y0 - 0.01, ENC_WIN_Y1 + 0.01, z0 + 0.04, z1 - 0.04);
  slab('encRoof', M.white, g, ENC_X0, fx0, H_ROOF - WALL, H_ROOF, z0, z1);
  [-0.3, 0.6, 1.5].forEach(function (z, i) {
    slab('encRib' + (i + 1), M.grey, g, ENC_X0 + 0.05, fx0 - 0.05, H_ROOF - 0.001, H_BEAM, z - 0.03, z + 0.03);
  });
  slab('encBackCap', M.white, g, ENC_X0, ENC_X0 + WALL, RACK_TOP, H_ROOF - WALL, z0, z1);
  slab('encStripe', M.accent, g, X_FRONT - STRIPE_IN, X_FRONT + STRIPE_OUT, BAND_LO, BAND_HI, z0, z1);
}

function buildRacks(root) {
  const g = group('controlRacks', [0, 0, 0], root);
  slab('rackPlinth', M.graphite, g, X_BACK, ENC_X0, 0, PLINTH, Z_TERM, Z_END);
  for (let i = 0; i < RACK_COUNT; i++) {
    const n = i + 1;
    const z0 = Z_TERM + 0.035 + i * RACK_PITCH;
    const z1 = z0 + RACK_PITCH - 0.02;
    const zc = (z0 + z1) / 2;
    slab('rack' + n, M.white, g, X_BACK, ENC_X0, PLINTH, RACK_TOP, z0, z1);
    slab('rackDoor' + n, M.grey, g, ENC_X0 - 0.001, ENC_X0 + 0.004, 0.3, 1.85, zc - 0.29, zc + 0.29);
    slab('rackHandle' + n, M.graphite, g, ENC_X0 - 0.001, ENC_X0 + 0.03, 0.95, 1.25, zc + 0.21, zc + 0.235);
    slab('rackVentA' + n, M.graphite, g, X_BACK - STRIPE_OUT, X_BACK + STRIPE_IN, 1.6, 1.63, zc - 0.25, zc + 0.25);
    slab('rackVentB' + n, M.graphite, g, X_BACK - STRIPE_OUT, X_BACK + STRIPE_IN, 1.7, 1.73, zc - 0.25, zc + 0.25);
  }
}

// ------------------------------------------------------------ end station (+Z end)
function buildEndStation(root) {
  const g = group('endStation', [0, 0, 0], root);
  const fx0 = X_FRONT - WALL;
  const z0 = Z_END;
  const z1 = Z_MAX;
  slab('esPlinth', M.graphite, g, X_BACK, X_FRONT, 0, PLINTH, z0, z1);
  slab('esFrontLow', M.white, g, fx0, X_FRONT, PLINTH, 1.45, z0, z1);
  slab('esSill', M.grey, g, fx0, X_FRONT, 1.45, ES_WIN_Y0, z0, z1);
  slab('esPostNear', M.white, g, fx0, X_FRONT, ES_WIN_Y0, ES_WIN_Y1, z0, ES_WIN_Z0);
  slab('esPostFar', M.white, g, fx0, X_FRONT, ES_WIN_Y0, ES_WIN_Y1, ES_WIN_Z1, z1);
  slab('esFrontHigh', M.white, g, fx0, X_FRONT, ES_WIN_Y1, H_END - WALL, z0, z1);
  slab('esGlass', M.glass, g, 2.215, 2.225, ES_WIN_Y0 - 0.01, ES_WIN_Y1 + 0.01, ES_WIN_Z0 - 0.01, ES_WIN_Z1 + 0.01);
  slab('esBack', M.white, g, X_BACK, X_BACK + WALL, PLINTH, H_END - WALL, z0, z1);
  slab('esWallNear', M.white, g, X_BACK + WALL, fx0, PLINTH, H_END - WALL, z0, z0 + WALL);
  slab('esWallFar', M.white, g, X_BACK + WALL, fx0, PLINTH, H_END - WALL, z1 - WALL, z1);
  slab('esRoof', M.white, g, X_BACK, X_FRONT, H_END - WALL, H_END, z0, z1);
  slab('esFloor', M.grey, g, X_BACK + WALL, fx0, PLINTH - 0.01, 0.2, z0 + WALL, z1 - WALL);
  drum('esChamber', M.steel, g, CHAMBER_R, 0.2, 1.75, 32, CHAMBER_X, CHAMBER_Z);
  drum('esChamberCap', M.graphite, g, CHAMBER_R + 0.05, 1.75, 1.85, 32, CHAMBER_X, CHAMBER_Z);
  for (let i = 0; i < 4; i++) {
    slab('esVent' + (i + 1), M.graphite, g, X_BACK - STRIPE_OUT, X_BACK + STRIPE_IN, 0.9 + 0.1 * i, 0.93 + 0.1 * i, 2.6, 3.9);
  }
  slab('esStripeFront', M.accent, g, X_FRONT - STRIPE_IN, X_FRONT + STRIPE_OUT, BAND_LO, BAND_HI, z0, z1);
  slab('esStripeEnd', M.accent, g, X_BACK, X_FRONT, BAND_LO, BAND_HI, z1 - STRIPE_IN, z1 + STRIPE_OUT);
}

// pivot at the robot base centre, vertical axis; arm points +X at rest
function buildRobot(root) {
  const g = group('endStationRobot', ROBOT_POS, root);
  drum('robotBase', M.graphite, g, 0.28, 0, 0.08, 20, 0, 0);
  drum('robotColumn', M.graphite, g, 0.15, 0.07, 1.3, 16, 0, 0);
  drum('robotShoulder', M.steel, g, 0.19, 1.3, 1.4, 16, 0, 0);
  slab('robotLink1', M.graphite, g, 0, 0.4, 1.395, 1.48, -0.075, 0.075);
  drum('robotElbow', M.steel, g, 0.1, 1.4, 1.58, 16, 0.4, 0);
  slab('robotLink2', M.graphite, g, 0.4, 0.74, 1.5, 1.57, -0.055, 0.055);
  drum('robotWrist', M.steel, g, 0.07, 1.5, 1.62, 12, 0.74, 0);
  slab('robotPaddle', M.steel, g, 0.74, 0.88, 1.6, 1.62, -0.06, 0.06);
}

function buildStatusScreen(root) {
  const g = group('statusScreen', [0, 0, 0], root);
  slab('screenBezel', M.graphite, g, X_FRONT - 0.001, X_FRONT + 0.006, 1.01, 1.35, 2.36, 2.72);
  slab('screenPanel', M.screen, g, X_FRONT + 0.005, X_FRONT + 0.012, 1.03, 1.33, 2.38, 2.7);
}

function buildLocators(root) {
  group('lp1', [X_FRONT, 0, LP_Z[0]], root);
  group('lp2', [X_FRONT, 0, LP_Z[1]], root);
  group('signalTowerMount', [2.1, H_END, 4.1], root);
}

// lod1: terminal, beamline block (yoke colour and coil patches behind the window band) and end station as boxes, 2 mm inside the detailed skins
function buildLod1(root) {
  const g = group('lod1', [0, 0, 0], root);
  const e = 0.002;
  const xf = X_FRONT - e;
  const xb = X_BACK + e;
  const t0 = Z_MIN + e;
  const t1 = Z_TERM - e;
  slab('lodTermPlinth', M.graphite, g, xb, xf, e, PLINTH, t0, t1);
  slab('lodTermLow', M.white, g, xb, xf, PLINTH, BAND_LO, t0, t1);
  slab('lodTermBand', M.accent, g, xb, xf, BAND_LO, BAND_HI, t0, t1);
  slab('lodTermHigh', M.white, g, xb, xf, BAND_HI, H_TERM_BODY - e, t0, t1);
  slab('lodTermCapLow', M.grey, g, -2.05 + e, 1.95 - e, H_TERM_BODY - 2 * e, 2.68 - e, Z_MIN + 0.05 + e, Z_TERM - 0.05 - e);
  slab('lodTermCapHigh', M.grey, g, -1.6 + e, 1.5 - e, 2.68 - 2 * e, H_TERM - e, -3.9 + e, -2.35 - e);
  const b0 = Z_TERM + e;
  const b1 = Z_END - e;
  const front = 2.205;
  slab('lodBeamBase', M.graphite, g, xb, xf, e, PLINTH, b0, b1);
  slab('lodRacks', M.white, g, xb, ENC_X0 - e, PLINTH, RACK_TOP - e, b0, b1);
  slab('lodBeamSkirt', M.white, g, ENC_X0 - 0.01, xf, PLINTH, 0.65, b0, b1);
  slab('lodBeamYoke', M.accent, g, ENC_X0 + 0.05, front, 0.65, 1.85, b0, -0.33);
  slab('lodCoilLow', M.copper, g, 2.19, front + 0.005, 0.85, 1.07, -1.79, -0.61);
  slab('lodCoilHigh', M.copper, g, 2.19, front + 0.005, 1.53, 1.75, -1.79, -0.61);
  slab('lodBeamRings', M.graphite, g, ENC_X0 + 0.05, front, 0.65, 1.85, -0.33, b1);
  slab('lodBeamMid', M.white, g, ENC_X0 - 0.01, xf, 1.85, BAND_LO, b0, b1);
  slab('lodBeamBand', M.accent, g, ENC_X0 - 0.01, xf, BAND_LO, BAND_HI, b0, b1);
  slab('lodBeamHigh', M.white, g, ENC_X0 - 0.01, xf, BAND_HI, H_ROOF - e, b0, b1);
  const s0 = Z_END + e;
  const s1 = Z_MAX - e;
  slab('lodEsPlinth', M.graphite, g, xb, xf, e, PLINTH, s0, s1);
  slab('lodEsLow', M.white, g, xb, xf, PLINTH, ES_WIN_Y0 - 0.01, s0, s1);
  slab('lodEsWindow', M.graphite, g, xb, 2.213, ES_WIN_Y0 - 0.01, ES_WIN_Y1 + 0.01, s0, s1);
  slab('lodEsMid', M.white, g, xb, xf, ES_WIN_Y1 + 0.01, BAND_LO, s0, s1);
  slab('lodEsBand', M.accent, g, xb, xf, BAND_LO, BAND_HI, s0, s1);
  slab('lodEsHigh', M.white, g, xb, xf, BAND_HI, H_END - e, s0, s1);
}

// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing tool far distance (38 m),
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
  const coverage = Math.min(1, Math.PI * (radius / (2 * 38 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

function build() {
  M = makeMaterials();
  const root = createRoot('IonImplanter');
  buildTerminal(root);
  buildDoor(root);
  buildTube(root);
  buildMagnet(root);
  buildCoils(root);
  buildRings(root);
  if (SHOW_ENCLOSURE) buildEnclosure(root);
  buildRacks(root);
  buildEndStation(root);
  buildRobot(root);
  buildStatusScreen(root);
  buildLocators(root);
  if (SHOW_LOD1) buildLod1(root);
  return applyFoundryStandardLod(root);
}

// ------------------------------------------------------------ clips
function ease(u) { return (1 - Math.cos(Math.PI * u)) / 2; }

function animate(root) {
  const robot = [];
  [0, 0.25, 0.5, 0.75, 1.0].forEach(function (t) { robot.push({ time: t, rotation: [0, 90 * ease(t), 0] }); });
  robot.push({ time: 1.5, rotation: [0, 90, 0] });
  [1.75, 2.0, 2.25, 2.5].forEach(function (t) { robot.push({ time: t, rotation: [0, 90 * ease(2.5 - t), 0] }); });
  robot.push({ time: 3.0, rotation: [0, 0, 0] });
  const open = [];
  const close = [];
  for (let i = 0; i <= 12; i++) {
    const t = i * 0.25;
    open.push({ time: t, rotation: [0, DOOR_OPEN_DEG * ease(t / 3), 0] });
    close.push({ time: t, rotation: [0, DOOR_OPEN_DEG * ease(1 - t / 3), 0] });
  }
  return [
    createClip('EndStationRobot', 3, [rotationTrack('endStationRobot', robot)]),
    createClip('ServiceOpen', 3, [rotationTrack('serviceDoor', open)]),
    createClip('ServiceClose', 3, [rotationTrack('serviceDoor', close)]),
  ];
}
