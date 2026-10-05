const meta = { name: 'Vertical batch furnace', role: 'prop' };

// ---- layout (metres; +X = load-port face, +Y up, +Z right) ----
const XF = 2.25;                 // front face
const XP = 0.5;                  // front section / back tower boundary
const XB = -2.25;                // back face
const HW = 1.0;                  // half width (Z)
const T = 0.05;                  // wall thickness
const H_FRONT = 2.4;             // front section roof
const H_TOWER = 1.9;             // boat-area walls and deck top
const DECK_Y0 = 1.86;            // deck underside
const BAND0 = 1.9, BAND1 = 2.0;  // family stripe
const H_ROOF = 3.76;             // jacket roof top (gas lines reach 3.80)
const AX = -0.75;                // tube and boat axis (X)
const STBY_X = -1.65, STBY_Y = 0.8;
const BOAT_H = 1.0, BOAT_R = 0.175, BOAT_Y = 0.9;
const HOLE = 0.23;              // half width of the deck opening
const LIFT = 1.2, LOAD_SECONDS = 8, EASE_STEPS = 20;
const TUBE_RI = 0.235, TUBE_RO = 0.255, TUBE_Y0 = 2.0, TUBE_Y1 = 3.6;
const N_WAFERS = 7, N_WAFERS_STANDBY = 4;
const REVIEW_LIFT = 0;           // review switch: static elevator lift (shipping value 0)
const SHOW_JACKET = true;        // review switch (shipping value true)
const SHOW_LOD1 = true;          // review switch: false leaves the empty lod1 node (shipping value true)

function mat(name, hex, roughness, metalness, extra) {
  const m = gameMaterial(hex, Object.assign({ roughness, metalness, flatShading: false }, extra || {}));
  m.name = name;
  return m;
}
function materials() {
  const quartz = mat('quartz', 0xE6EEF0, 0.10, 0.0);
  quartz.transparent = true; quartz.opacity = 0.5;
  const glass = mat('glass-smoked', 0x5E6A73, 0.10, 0.0);
  glass.transparent = true; glass.opacity = 0.6;
  return {
    white: mat('tool-shell-white', 0xE8EBEE, 0.55, 0.0),
    grey: mat('tool-panel-grey', 0xC5CBD1, 0.60, 0.0),
    graphite: mat('trim-graphite', 0x3B4148, 0.50, 0.1),
    steel: mat('stainless', 0xB9BEC3, 0.35, 1.0),
    accent: mat('accent-thermal', 0xC8642D, 0.50, 0.0),
    quartz, glass,
    screen: mat('screen-glow', 0x9FD3F5, 0.30, 0.0, { emissive: 0x9FD3F5, emissiveIntensity: 1.0 }),
  };
}

function group(name, parent, pos) {
  const g = createPivot(name, pos || [0, 0, 0], parent);
  g.name = name;
  return g;
}
function box(name, parent, m, x0, x1, y0, y1, z0, z1) {
  return createPart(name, boxGeo(x1 - x0, y1 - y0, z1 - z0), m,
    { position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], parent });
}
function cyl(name, parent, m, r, y0, y1, seg, cx, cz) {
  return createPart(name, cylinderGeo(r, r, y1 - y0, seg), m,
    { position: [cx || 0, (y0 + y1) / 2, cz || 0], parent });
}
function pipeX(name, parent, m, r, x0, x1, y, z, seg) {
  return createPart(name, cylinderGeo(r, r, x1 - x0, seg), m,
    { position: [(x0 + x1) / 2, y, z], rotation: [0, 0, 90], parent });
}
function pipeZ(name, parent, m, r, z0, z1, x, y, seg) {
  return createPart(name, cylinderGeo(r, r, z1 - z0, seg), m,
    { position: [x, y, (z0 + z1) / 2], rotation: [90, 0, 0], parent });
}

// +Z side wall with a real window opening, frame and smoked pane.
function sideWall(parent, M, tag, x0, x1, y0, y1, w) {
  const za = HW - T, zb = HW, f = 0.03, zm = (za + zb) / 2;
  box(tag + 'WallLeft', parent, M.white, x0, w.x0, y0, y1, za, zb);
  box(tag + 'WallRight', parent, M.white, w.x1, x1, y0, y1, za, zb);
  box(tag + 'WallSill', parent, M.white, w.x0, w.x1, y0, w.y0, za, zb);
  box(tag + 'WallLintel', parent, M.white, w.x0, w.x1, w.y1, y1, za, zb);
  box(tag + 'FrameBottom', parent, M.graphite, w.x0, w.x1, w.y0, w.y0 + f, za, zb);
  box(tag + 'FrameTop', parent, M.graphite, w.x0, w.x1, w.y1 - f, w.y1, za, zb);
  box(tag + 'FrameLeft', parent, M.graphite, w.x0, w.x0 + f, w.y0 + f, w.y1 - f, za, zb);
  box(tag + 'FrameRight', parent, M.graphite, w.x1 - f, w.x1, w.y0 + f, w.y1 - f, za, zb);
  box(tag + 'Glass', parent, M.glass, w.x0 + f, w.x1 - f, w.y0 + f, w.y1 - f, zm - 0.004, zm + 0.004);
}

// boat pieces built into group g, base at height y0; pre keeps node names unique
function buildBoat(pre, g, M, y0, n) {
  cyl(pre + 'BasePlate', g, M.quartz, BOAT_R, y0, y0 + 0.03, 12);
  cyl(pre + 'TopPlate', g, M.quartz, BOAT_R, y0 + BOAT_H - 0.03, y0 + BOAT_H, 12);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    cyl(pre + 'Rod' + i, g, M.quartz, 0.012, y0 + 0.03, y0 + BOAT_H - 0.03, 6, 0.16 * Math.cos(a), 0.16 * Math.sin(a));
  }
  for (let i = 0; i < n; i++) {
    const y = y0 + 0.12 + i * (0.76 / (n - 1));
    cyl(pre + 'Wafer' + i, g, M.steel, 0.15, y - 0.004, y + 0.004, 10);
  }
}

function build() {
  const M = materials();
  const root = createRoot('VerticalFurnace');
  const xs = XF - T, xa = XB + T, xb = XP - T, zi = HW - T;

  // ---------------- frontSection ----------------
  const front = group('frontSection', root);
  const winF = { x0: 0.62, x1: 2.05, y0: 0.60, y1: 1.75 };
  box('FrontPlinth', front, M.graphite, XP + 0.03, XF - 0.03, 0, 0.10, -HW + 0.03, HW - 0.03);
  box('FrontFloor', front, M.grey, XP + T, xs, 0.10, 0.14, -zi, zi);
  box('FrontWallLowerL', front, M.white, xs, XF, 0.10, BAND0, -HW, -0.52);
  box('FrontWallLowerR', front, M.white, xs, XF, 0.10, BAND0, 0.52, HW);
  box('FrontWallLowerBase', front, M.white, xs, XF, 0.10, 0.16, -0.52, 0.52);
  box('FrontWallLowerHead', front, M.white, xs, XF, 1.50, BAND0, -0.52, 0.52);
  box('FrontDoor1', front, M.grey, xs, XF, 0.16, 1.50, -0.52, -0.01);
  box('FrontDoorSeam', front, M.graphite, xs, XF, 0.16, 1.50, -0.01, 0.01);
  box('FrontDoor2', front, M.grey, xs, XF, 0.16, 1.50, 0.01, 0.52);
  box('FrontBand', front, M.accent, xs, XF, BAND0, BAND1, -HW, HW);
  box('FrontWallUpper', front, M.white, xs, XF, BAND1, H_FRONT - T, -HW, HW);
  box('FrontPartition', front, M.white, XP, XP + T, 0.10, H_FRONT - T, -zi, zi);
  box('FrontRoof', front, M.white, XP, XF, H_FRONT - T, H_FRONT, -HW, HW);
  sideWall(front, M, 'FrontPz', XP, xs, 0.10, BAND0, winF);
  box('FrontPzBand', front, M.accent, XP, xs, BAND0, BAND1, zi, HW);
  box('FrontPzWallUpper', front, M.white, XP, xs, BAND1, H_FRONT - T, zi, HW);
  box('FrontNzWallLower', front, M.white, XP, xs, 0.10, BAND0, -HW, -zi);
  box('FrontNzBand', front, M.accent, XP, xs, BAND0, BAND1, -HW, -zi);
  box('FrontNzWallUpper', front, M.white, XP, xs, BAND1, H_FRONT - T, -HW, -zi);
  box('FrontLinerNz', front, M.graphite, XP + T, xs, 0.14, BAND0, -zi, -zi + 0.01);
  box('FrontLinerEnd', front, M.graphite, xs - 0.01, xs, 0.14, BAND0, -zi + 0.01, zi);
  box('FrontLinerBack', front, M.graphite, XP + T, XP + T + 0.01, 0.14, BAND0, -zi + 0.01, zi);
  box('ScreenBezel', front, M.graphite, XF, XF + 0.02, 1.32, 1.68, 0.60, 0.94);
  const screen = box('statusScreen', root, M.screen, XF + 0.02, XF + 0.023, 1.36, 1.64, 0.64, 0.90);
  screen.name = 'statusScreen';
  const robot = group('transferRobot', front);
  box('RobotBase', robot, M.graphite, 1.0, 1.36, 0.14, 0.30, -0.33, 0.03);
  cyl('RobotColumn', robot, M.grey, 0.08, 0.30, 1.00, 12, 1.18, -0.15);
  box('RobotShoulder', robot, M.graphite, 1.08, 1.28, 1.00, 1.10, -0.25, -0.05);
  box('RobotLink1', robot, M.grey, 1.10, 1.26, 1.00, 1.08, -0.15, 0.32);
  box('RobotLink2', robot, M.grey, 1.10, 1.62, 1.08, 1.15, 0.20, 0.32);
  box('RobotFork', robot, M.steel, 1.62, 1.98, 1.15, 1.165, 0.22, 0.30);

  // ---------------- foupShelf ----------------
  const shelf = group('foupShelf', root);
  const tiers = [0.55, 1.05, 1.55];
  tiers.forEach((y, i) => box('ShelfTier' + i, shelf, M.grey, 0.60, 1.00, y, y + 0.03, -0.85, 0.85));
  [-0.85, 0.85].forEach((z, i) => box('ShelfUpright' + i, shelf, M.graphite, 0.60, 1.00, 0.14, 1.85, z - 0.03, z + 0.03));
  [-0.28, 0.28].forEach((z, i) => tiers.forEach((y, j) => box('ShelfDivider' + i + j, shelf, M.steel, 0.66, 0.94, y + 0.03, y + 0.11, z - 0.008, z + 0.008)));

  // ---------------- backTower (boat area) ----------------
  const tower = group('backTower', root);
  const winB = { x0: -1.95, x1: 0.20, y0: 0.25, y1: 1.84 };
  box('TowerPlinth', tower, M.graphite, XB + 0.03, XP + 0.03, 0, 0.10, -HW + 0.03, HW - 0.03);
  box('TowerFloor', tower, M.grey, xa, xb, 0.10, 0.14, -zi, zi);
  box('TowerBackWall', tower, M.white, XB, xa, 0.10, H_TOWER, -HW, HW);
  box('TowerFrontWall', tower, M.white, xb, XP, 0.10, H_TOWER, -HW, HW);
  sideWall(tower, M, 'TowerPz', xa, xb, 0.10, H_TOWER, winB);
  box('TowerNzWall', tower, M.white, xa, xb, 0.10, H_TOWER, -HW, -zi);
  box('DeckBack', tower, M.grey, xa, AX - HOLE, DECK_Y0, H_TOWER, -zi, zi);
  box('DeckFront', tower, M.grey, AX + HOLE, xb, DECK_Y0, H_TOWER, -zi, zi);
  box('DeckLeft', tower, M.grey, AX - HOLE, AX + HOLE, DECK_Y0, H_TOWER, HOLE, zi);
  box('DeckRight', tower, M.grey, AX - HOLE, AX + HOLE, DECK_Y0, H_TOWER, -zi, -HOLE);
  box('TowerLinerNz', tower, M.graphite, xa, xb, 0.14, DECK_Y0, -zi, -zi + 0.01);
  box('TowerLinerBack', tower, M.graphite, xa, xa + 0.01, 0.14, DECK_Y0, -zi + 0.01, zi);
  box('TowerLinerFront', tower, M.graphite, xb - 0.01, xb, 0.14, DECK_Y0, -zi + 0.01, zi);
  box('ElevatorRail', tower, M.steel, xb - 0.06, xb, 0.14, DECK_Y0, -0.05, 0.05);
  const rp = [[TUBE_RI, H_TOWER], [0.36, H_TOWER], [0.36, TUBE_Y0], [TUBE_RI, TUBE_Y0], [TUBE_RI, H_TOWER]];
  createPart('TubeBase', lathe(rp, 16), M.steel, { position: [AX, 0, 0], parent: tower });

  // ---------------- heaterJacket (hollow shell; carries the orange stripe on its lower rim) ----------------
  if (SHOW_JACKET) {
    const jack = group('heaterJacket', root);
    const yt = H_ROOF - T;
    box('JacketFrontBand', jack, M.accent, xb, XP, BAND0, BAND1, -HW, HW);
    box('JacketFront', jack, M.white, xb, XP, BAND1, yt, -HW, HW);
    box('JacketBackBand', jack, M.accent, XB, xa, BAND0, BAND1, -HW, HW);
    box('JacketBack', jack, M.white, XB, xa, BAND1, yt, -HW, HW);
    box('JacketPzBand', jack, M.accent, xa, xb, BAND0, BAND1, zi, HW);
    box('JacketPz', jack, M.white, xa, xb, BAND1, yt, zi, HW);
    box('JacketNzBand', jack, M.accent, xa, xb, BAND0, BAND1, -HW, -zi);
    box('JacketNz', jack, M.white, xa, xb, BAND1, yt, -HW, -zi);
    box('JacketRoof', jack, M.white, XB, XP, yt, H_ROOF, -HW, HW);
    [-1.7, -0.75, 0.15].forEach((x, i) => {
      box('JacketSeamPz' + i, jack, M.graphite, x - 0.015, x + 0.015, 2.15, 3.60, HW, HW + 0.004);
      box('JacketSeamNz' + i, jack, M.graphite, x - 0.015, x + 0.015, 2.15, 3.60, -HW - 0.004, -HW);
    });
    [-0.5, 0.5].forEach((z, i) => box('JacketSeamFront' + i, jack, M.graphite, XP, XP + 0.004, 2.45, 3.60, z - 0.015, z + 0.015));
    for (let i = 0; i < 4; i++) {
      const y = 3.0 + i * 0.10;
      box('JacketLouverPz' + i, jack, M.graphite, -1.25, -0.30, y, y + 0.03, HW, HW + 0.004);
      box('JacketLouverNz' + i, jack, M.graphite, -1.25, -0.30, y, y + 0.03, -HW - 0.004, -HW);
    }
  }

  // ---------------- quartzTube ----------------
  const tube = group('quartzTube', root);
  const tp = [[TUBE_RO, TUBE_Y0], [TUBE_RO, TUBE_Y1 - 0.07], [0.17, TUBE_Y1 - 0.02], [0, TUBE_Y1],
    [0.17, TUBE_Y1 - 0.035], [TUBE_RI, TUBE_Y1 - 0.085], [TUBE_RI, TUBE_Y0], [TUBE_RO, TUBE_Y0]];
  createPart('TubeWall', lathe(tp, 20), M.quartz, { position: [AX, 0, 0], parent: tube });

  // ---------------- boatElevator (+ quartzBoat) ----------------
  const elev = group('boatElevator', root, [AX, REVIEW_LIFT, 0]);
  cyl('ElevatorPlatform', elev, M.steel, 0.20, 0.85, BOAT_Y, 16);
  cyl('ElevatorColumn', elev, M.steel, 0.07, 0.14, 0.85, 10);
  box('ElevatorArm', elev, M.graphite, -0.07, 1.05, 0.50, 0.58, -0.07, 0.07);
  box('ElevatorCarriage', elev, M.graphite, 1.05, 1.14, 0.40, 0.62, -0.11, 0.11);
  const boat = group('quartzBoat', elev, [0, BOAT_Y, 0]);
  buildBoat('Boat', boat, M, 0, N_WAFERS);

  // ---------------- standbyBoat ----------------
  const stby = group('standbyBoat', root, [STBY_X, 0, 0]);
  cyl('StandbyColumn', stby, M.steel, 0.07, 0.14, STBY_Y - 0.05, 10);
  cyl('StandbyPlatform', stby, M.steel, 0.20, STBY_Y - 0.05, STBY_Y, 16);
  buildBoat('Standby', stby, M, STBY_Y, N_WAFERS_STANDBY);

  // ---------------- gasLines ----------------
  const gas = group('gasLines', root);
  const gy = H_ROOF + 0.015;
  cyl('GasRiser', gas, M.steel, 0.02, TUBE_Y1, gy, 8, AX, 0);
  pipeX('GasHeader', gas, M.steel, 0.02, -1.60, -0.10, gy, 0, 8);
  pipeZ('GasBranchA', gas, M.steel, 0.02, -0.40, 0.40, -1.45, gy, 8);
  pipeZ('GasBranchB', gas, M.steel, 0.02, -0.40, 0.40, -0.30, gy, 8);
  [[-1.45, -0.40], [-1.45, 0.40], [-0.30, -0.40], [-0.30, 0.40]].forEach(([x, z], i) => {
    box('GasValve' + i, gas, M.steel, x - 0.03, x + 0.03, H_ROOF, H_ROOF + 0.04, z - 0.03, z + 0.03);
  });

  // ---------------- locators ----------------
  group('lp1', root, [XF, 0, -0.2525]);
  group('lp2', root, [XF, 0, 0.2525]);
  group('signalTowerMount', root, [2.1, H_FRONT, 0.85]);

  // ---------------- lod1 (2 mm inside the detailed skins) ----------------
  const lod = group('lod1', root);
  const e = 0.002;
  if (SHOW_LOD1) {
    box('LodFrontLower', lod, M.white, XP + e, XF - e, e, BAND0, -HW + e, HW - e);
    box('LodFrontBand', lod, M.accent, XP + e, XF - e, BAND0, BAND1, -HW + e, HW - e);
    box('LodFrontUpper', lod, M.white, XP + e, XF - e, BAND1, H_FRONT - e, -HW + e, HW - e);
    box('LodTowerLower', lod, M.white, XB + e, XP - e, e, BAND0, -HW + e, HW - e);
    box('LodTowerBand', lod, M.accent, XB + e, XP - e, BAND0, BAND1, -HW + e, HW - e);
    box('LodTowerUpper', lod, M.white, XB + e, XP - e, BAND1, H_ROOF - e, -HW + e, HW - e);
  }

  return root;
}

function animate(root) {
  const keys = (forward) => {
    const out = [];
    for (let i = 0; i <= EASE_STEPS; i++) {
      const u = i / EASE_STEPS, s = forward ? u : 1 - u, ease = s * s * (3 - 2 * s);
      out.push({ time: LOAD_SECONDS * u, position: [AX, LIFT * ease, 0] });
    }
    return out;
  };
  return [
    createClip('BoatLoad', LOAD_SECONDS, [positionTrack('boatElevator', keys(true))]),
    createClip('BoatUnload', LOAD_SECONDS, [positionTrack('boatElevator', keys(false))]),
  ];
}
