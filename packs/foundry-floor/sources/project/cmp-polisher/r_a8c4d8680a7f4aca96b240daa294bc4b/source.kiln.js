const meta = { name: 'CMP polisher' };

// ------------------------------------------------------------ switches
const SHOW_LOD1 = true; // false builds a detailed-only review variant (lod1 is exported visible and would hide window views)

// ------------------------------------------------------------ layout (metres, +X is the load-port face)
const X_FRONT = 2.5;
const X_EFEM_BACK = 1.7;
const X_CLEAN_BACK = 0.1;
const X_BACK = -2.5;
const HALF_EFEM = 1.65;
const HALF_CLEAN = 1.45;
const HALF_POLISH = 1.7;
const PLINTH = 0.15;
const DECK = 0.55;
const WALL = 0.05;
const ROOF_T = 0.05;
const BAND_LO = 1.9;
const BAND_HI = 2.0;
const H_EFEM = 2.3;
const H_FFU = 2.4;
const H_CLEAN = 2.1;
const H_POLISH = 2.2;
const ROOF_X0 = -2.36;
const ROOF_X1 = -0.1;
const ROOF_HALF_Z = 1.3;
const SIDE_X0 = -2.2;
const SIDE_X1 = -0.3;
const SIDE_Y0 = 0.75;
const SIDE_Y1 = 1.75;

const CAROUSEL_X = -1.2;
const PLATEN_POS = [[-1.2, -0.75], [-1.95, 0], [-1.2, 0.75]];
const PLATEN_R = 0.4;
const PAD_TOP = 0.9;
const CUP_X = -0.45;
const HEAD_ORBIT = 0.75;
const HEAD_R = 0.2;
const HEAD_BOTTOM = 0.97;
const ARM_TOP = 0.95;
const CONDITIONER = [
  { post: [-1.2, -1.47], len: 0.39, dir: [0, 1] },
  { post: [-1.95, -0.72], len: 0.39, dir: [0, 1] },
  { post: [-1.2, 1.47], len: 0.39, dir: [0, -1] },
];
const SLURRY = [
  { stand: [-1.75, -1.45], nozzle: [-1.45, -1.0] },
  { stand: [-2.35, 0.9], nozzle: [-2.22, 0.22] },
  { stand: [-1.75, 1.45], nozzle: [-1.45, 1.0] },
];

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
    accent: surface('accent-cmp', 0x4E8F4A, 0.50, 0.0),
    pad: surface('cmp-pad', 0xCDBB8E, 0.80, 0.0),
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

function bar(name, material, parent, ax, az, bx, bz, y0, y1, thick) {
  const dx = bx - ax;
  const dz = bz - az;
  const yaw = Math.atan2(-dz, dx) * 180 / Math.PI;
  return createPart(name, boxGeo(Math.hypot(dx, dz), y1 - y0, thick), material,
    { position: [(ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2], rotation: [0, yaw, 0], parent: parent });
}

// ------------------------------------------------------------ modules
function buildEfem(root) {
  const g = group('efem', [0, 0, 0], root);
  const x0 = X_EFEM_BACK;
  const x1 = X_FRONT;
  const xs = X_FRONT - 0.04;
  const z = HALF_EFEM;
  slab('efemPlinth', M.graphite, g, x0, x1, 0, PLINTH, -z, z);
  slab('efemCoreLow', M.white, g, x0, xs, PLINTH, BAND_LO, -z, z);
  slab('efemBand', M.accent, g, x0, x1, BAND_LO, BAND_HI, -z, z);
  slab('efemCoreHigh', M.white, g, x0, x1, BAND_HI, H_EFEM, -z, z);
  slab('efemSkinLow', M.white, g, xs, x1, PLINTH, 1.5, -z, z);
  slab('efemSkinHigh', M.white, g, xs, x1, 1.86, BAND_LO, -z, z);
  slab('efemSkinLeft', M.white, g, xs, x1, 1.5, 1.86, -z, -0.42);
  slab('efemSkinRight', M.white, g, xs, x1, 1.5, 1.86, 0.42, z);
  slab('efemFan', M.grey, g, 1.78, 2.42, H_EFEM, H_FFU, -1.25, 1.25);
  slab('efemMount', M.graphite, g, 2.29, 2.41, H_EFEM, H_FFU, 1.49, 1.61);
  slab('efemDoorR', M.grey, g, 1.85, 2.35, 0.4, 1.6, z, z + 0.02);
  slab('efemDoorL', M.grey, g, 1.85, 2.35, 0.4, 1.6, -z - 0.02, -z);
  slab('efemHandleR', M.graphite, g, 2.24, 2.28, 0.95, 1.15, z + 0.02, z + 0.04);
  slab('efemHandleL', M.graphite, g, 2.24, 2.28, 0.95, 1.15, -z - 0.04, -z - 0.02);
}

function buildStatusScreen(root) {
  const g = group('statusScreen', [0, 0, 0], root);
  slab('screenFrame', M.graphite, g, X_FRONT - 0.04, X_FRONT - 0.03, 1.5, 1.86, -0.42, 0.42);
  slab('screenPanel', M.screen, g, X_FRONT - 0.03, X_FRONT - 0.015, 1.55, 1.81, -0.37, 0.37);
}

function buildCleaner(root) {
  const g = group('cleanerModule', [0, 0, 0], root);
  const x0 = X_CLEAN_BACK;
  const x1 = X_EFEM_BACK;
  const z = HALF_CLEAN;
  const roofY = H_CLEAN - ROOF_T;
  const winX = [[0.3, 0.85], [0.95, 1.5]];
  const winY0 = 0.75;
  const winY1 = 1.65;
  slab('cleanPlinth', M.graphite, g, x0, x1, 0, PLINTH, -z, z);
  slab('cleanDeck', M.graphite, g, x0, x1, PLINTH, 0.6, -z + WALL, z - WALL);
  slab('cleanRoof', M.white, g, x0, x1, roofY, H_CLEAN, -z, z);
  [-1, 1].forEach(function (s) {
    const n = s > 0 ? 'R' : 'L';
    const za = s > 0 ? z - WALL : -z;
    const zb = s > 0 ? z : -z + WALL;
    slab('cleanSill' + n, M.white, g, x0, x1, PLINTH, winY0, za, zb);
    slab('cleanPostA' + n, M.white, g, x0, winX[0][0], winY0, winY1, za, zb);
    slab('cleanPostB' + n, M.white, g, winX[0][1], winX[1][0], winY0, winY1, za, zb);
    slab('cleanPostC' + n, M.white, g, winX[1][1], x1, winY0, winY1, za, zb);
    slab('cleanLintel' + n, M.white, g, x0, x1, winY1, BAND_LO, za, zb);
    slab('cleanBand' + n, M.accent, g, x0, x1, BAND_LO, BAND_HI, za, zb);
    slab('cleanTop' + n, M.white, g, x0, x1, BAND_HI, roofY, za, zb);
    const gz0 = s > 0 ? z - 0.035 : -z + 0.015;
    winX.forEach(function (w, k) {
      slab('cleanGlass' + n + (k + 1), M.glass, g, w[0] - 0.02, w[1] + 0.02, winY0 - 0.02, winY1 + 0.02, gz0, gz0 + 0.02);
    });
  });
  // brush station: two rollers between two frame posts
  [0.36, 0.8].forEach(function (px, i) {
    slab('brushPost' + (i + 1), M.graphite, g, px - 0.03, px + 0.03, 0.6, 1.3, -0.06, 0.06);
  });
  [1.02, 1.18].forEach(function (py, i) {
    createPart('brushRoller' + (i + 1), cylinderGeo(0.06, 0.06, 0.44, 16), M.grey,
      { position: [0.58, py, 0], rotation: [0, 0, 90], parent: g });
  });
  // dryer station: spin bowl and a nozzle arm
  drum('dryBowl', M.steel, g, 0.22, 0.6, 0.95, 20, 1.225, 0);
  drum('dryPlate', M.graphite, g, 0.17, 0.95, 0.958, 20, 1.225, 0);
  drum('dryStand', M.steel, g, 0.02, 0.6, 1.25, 8, 1.225, 0.34);
  bar('dryArm', M.steel, g, 1.225, 0.34, 1.225, 0.02, 1.22, 1.25, 0.03);
  createPart('dryNozzle', cylinderGeo(0.02, 0.006, 0.12, 8), M.steel, { position: [1.225, 1.16, 0.02], parent: g });
}

function buildPolish(root) {
  const g = group('polishEnclosure', [0, 0, 0], root);
  const x0 = X_BACK;
  const x1 = X_CLEAN_BACK;
  const z = HALF_POLISH;
  const top = H_POLISH - ROOF_T;
  const ix0 = x0 + WALL;
  const ix1 = x1 - WALL;
  slab('polishPlinth', M.graphite, g, x0, x1, 0, PLINTH, -z, z);
  slab('polishDeck', M.graphite, g, ix0, ix1, PLINTH, DECK, -z + WALL, z - WALL);
  slab('polishBack', M.white, g, x0, ix0, PLINTH, top, -z, z);
  slab('polishPartition', M.white, g, ix1, x1, PLINTH, top, -z, z);
  slab('polishWallLowL', M.white, g, ix0, ix1, PLINTH, BAND_LO, -z, -z + WALL);
  slab('polishBandL', M.accent, g, ix0, ix1, BAND_LO, BAND_HI, -z, -z + WALL);
  slab('polishWallHighL', M.white, g, ix0, ix1, BAND_HI, top, -z, -z + WALL);
  slab('polishSill', M.white, g, ix0, ix1, PLINTH, SIDE_Y0, z - WALL, z);
  slab('polishPostBack', M.white, g, ix0, SIDE_X0, SIDE_Y0, SIDE_Y1, z - WALL, z);
  slab('polishPostFront', M.white, g, SIDE_X1, ix1, SIDE_Y0, SIDE_Y1, z - WALL, z);
  slab('polishLintel', M.white, g, ix0, ix1, SIDE_Y1, BAND_LO, z - WALL, z);
  slab('polishBandR', M.accent, g, ix0, ix1, BAND_LO, BAND_HI, z - WALL, z);
  slab('polishWallHighR', M.white, g, ix0, ix1, BAND_HI, top, z - WALL, z);
  slab('polishRoofBack', M.white, g, x0, ROOF_X0, top, H_POLISH, -z, z);
  slab('polishRoofFront', M.white, g, ROOF_X1, x1, top, H_POLISH, -z, z);
  slab('polishRoofLeft', M.white, g, ROOF_X0, ROOF_X1, top, H_POLISH, -z, -ROOF_HALF_Z);
  slab('polishRoofRight', M.white, g, ROOF_X0, ROOF_X1, top, H_POLISH, ROOF_HALF_Z, z);
  PLATEN_POS.forEach(function (p, i) {
    drum('polishPedestal' + (i + 1), M.graphite, g, 0.3, DECK, 0.7, 24, p[0], p[1]);
  });
}

function buildPolishWindows(root) {
  const g = group('polishWindows', [0, 0, 0], root);
  slab('polishRoofGlass', M.glass, g, ROOF_X0 - 0.02, ROOF_X1 + 0.02, H_POLISH - 0.035, H_POLISH - 0.015,
    -ROOF_HALF_Z - 0.02, ROOF_HALF_Z + 0.02);
  slab('polishSideGlass', M.glass, g, SIDE_X0 - 0.02, SIDE_X1 + 0.02, SIDE_Y0 - 0.02, SIDE_Y1 + 0.02,
    HALF_POLISH - 0.035, HALF_POLISH - 0.015);
}

// ------------------------------------------------------------ process hardware
function buildPlatens(root) {
  PLATEN_POS.forEach(function (p, i) {
    const n = i + 1;
    const g = group('platen' + n, [p[0], 0, p[1]], root);
    drum('platen' + n + 'Disc', M.steel, g, PLATEN_R - 0.005, 0.7, 0.86, 32, 0, 0);
    drum('platen' + n + 'Pad', M.pad, g, PLATEN_R, 0.86, PAD_TOP, 32, 0, 0);
    slab('platen' + n + 'Groove', M.graphite, g, 0.03, 0.37, PAD_TOP, PAD_TOP + 0.005, -0.025, 0.025);
    slab('platen' + n + 'Tick', M.graphite, g, 0.28, 0.33, PAD_TOP, PAD_TOP + 0.005, 0.025, 0.16);
  });
}

function buildLoadCup(root) {
  const g = group('loadCup', [CUP_X, 0, 0], root);
  drum('cupStem', M.graphite, g, 0.16, DECK, 0.68, 20, 0, 0);
  drum('cupBody', M.steel, g, 0.27, 0.68, 0.8, 24, 0, 0);
  drum('cupFloor', M.graphite, g, 0.215, 0.8, 0.805, 24, 0, 0);
  createPart('cupRim', torusGeo(0.245, 0.02, 5, 20), M.steel, { position: [0, 0.8, 0], rotation: [90, 0, 0], parent: g });
}

function buildCarousel(root) {
  const g = group('carousel', [CAROUSEL_X, 0, 0], root);
  drum('carouselHub', M.steel, g, 0.16, DECK, 1.52, 24, 0, 0);
  slab('carouselSpokeX', M.grey, g, -0.83, 0.83, 1.3, 1.44, -0.08, 0.08);
  slab('carouselSpokeZ', M.grey, g, -0.08, 0.08, 1.31, 1.43, -0.83, 0.83);
  [[1, 0], [0, -1], [-1, 0], [0, 1]].forEach(function (u, i) {
    const x = u[0] * HEAD_ORBIT;
    const z = u[1] * HEAD_ORBIT;
    const n = i + 1;
    drum('headQuill' + n, M.steel, g, 0.05, 1.13, 1.3, 12, x, z);
    drum('headBody' + n, M.steel, g, 0.19, HEAD_BOTTOM + 0.015, 1.13, 20, x, z);
    drum('headRing' + n, M.graphite, g, HEAD_R, HEAD_BOTTOM, HEAD_BOTTOM + 0.05, 20, x, z);
  });
}

function buildConditioners(root) {
  CONDITIONER.forEach(function (c, i) {
    const n = i + 1;
    const g = group('conditionerArm' + n, [c.post[0], 0, c.post[1]], root);
    const ex = c.dir[0] * c.len;
    const ez = c.dir[1] * c.len;
    drum('armPost' + n, M.graphite, g, 0.05, DECK, ARM_TOP + 0.01, 12, 0, 0);
    bar('armBeam' + n, M.graphite, g, 0, 0, ex, ez, 0.925, ARM_TOP, 0.05);
    drum('armDisc' + n, M.steel, g, 0.06, 0.908, 0.938, 16, ex, ez);
  });
}

function buildSlurry(root) {
  const g = group('slurryArms', [0, 0, 0], root);
  SLURRY.forEach(function (s, i) {
    const n = i + 1;
    drum('slurryStand' + n, M.steel, g, 0.02, DECK, 1.06, 8, s.stand[0], s.stand[1]);
    bar('slurryTube' + n, M.steel, g, s.stand[0], s.stand[1], s.nozzle[0], s.nozzle[1], 1.03, 1.06, 0.025);
    createPart('slurryNozzle' + n, cylinderGeo(0.022, 0.008, 0.09, 8), M.steel,
      { position: [s.nozzle[0], 0.995, s.nozzle[1]], parent: g });
  });
}

function buildLocators(root) {
  group('lp1', [X_FRONT, 0, -0.505], root);
  group('lp2', [X_FRONT, 0, 0], root);
  group('lp3', [X_FRONT, 0, 0.505], root);
  group('signalTowerMount', [2.35, 2.4, 1.55], root);
}

// lod1: the three modules as boxes inset 2 mm inside the detailed skins, with a dark roof window
function buildLod1(root) {
  const g = group('lod1', [0, 0, 0], root);
  const e = 0.002;
  const ex0 = X_EFEM_BACK + e;
  const ex1 = X_FRONT - e;
  const ez = HALF_EFEM - e;
  const rx = X_FRONT - 0.042;
  const rz = 0.42 + e;
  slab('lodEfemPlinth', M.graphite, g, ex0, ex1, e, PLINTH, -ez, ez);
  slab('lodEfemLow', M.white, g, ex0, ex1, PLINTH, 1.498, -ez, ez);
  slab('lodEfemMidL', M.white, g, ex0, ex1, 1.498, 1.862, -ez, -rz);
  slab('lodEfemMidR', M.white, g, ex0, ex1, 1.498, 1.862, rz, ez);
  slab('lodEfemMidC', M.white, g, ex0, rx, 1.498, 1.862, -rz, rz);
  slab('lodEfemSill', M.white, g, ex0, ex1, 1.862, BAND_LO, -ez, ez);
  slab('lodEfemBand', M.accent, g, ex0, ex1, BAND_LO, BAND_HI, -ez, ez);
  slab('lodEfemHigh', M.white, g, ex0, ex1, BAND_HI, H_EFEM - e, -ez, ez);
  slab('lodEfemFan', M.grey, g, 1.782, 2.418, H_EFEM - e, H_FFU - e, -1.248, 1.248);
  const cx0 = X_CLEAN_BACK - e;
  const cx1 = X_EFEM_BACK + e;
  const cz = HALF_CLEAN - e;
  slab('lodCleanPlinth', M.graphite, g, cx0, cx1, e, PLINTH, -cz, cz);
  slab('lodCleanLow', M.white, g, cx0, cx1, PLINTH, BAND_LO, -cz, cz);
  slab('lodCleanBand', M.accent, g, cx0, cx1, BAND_LO, BAND_HI, -cz, cz);
  slab('lodCleanHigh', M.white, g, cx0, cx1, BAND_HI, H_CLEAN - e, -cz, cz);
  const px0 = X_BACK + e;
  const px1 = X_CLEAN_BACK - e;
  const pz = HALF_POLISH - e;
  const top = H_POLISH - ROOF_T;
  const roof = H_POLISH - e;
  slab('lodPolishPlinth', M.graphite, g, px0, px1, e, PLINTH, -pz, pz);
  slab('lodPolishLow', M.white, g, px0, px1, PLINTH, BAND_LO, -pz, pz);
  slab('lodPolishBand', M.accent, g, px0, px1, BAND_LO, BAND_HI, -pz, pz);
  slab('lodPolishMid', M.white, g, px0, px1, BAND_HI, top, -pz, pz);
  slab('lodRoofBack', M.white, g, px0, ROOF_X0, top, roof, -pz, pz);
  slab('lodRoofFront', M.white, g, ROOF_X1, px1, top, roof, -pz, pz);
  slab('lodRoofLeft', M.white, g, ROOF_X0, ROOF_X1, top, roof, -pz, -ROOF_HALF_Z);
  slab('lodRoofRight', M.white, g, ROOF_X0, ROOF_X1, top, roof, ROOF_HALF_Z, pz);
  slab('lodRoofWindow', M.graphite, g, ROOF_X0, ROOF_X1, top, roof, -ROOF_HALF_Z, ROOF_HALF_Z);
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
  const root = createRoot('CmpPolisher');
  buildEfem(root);
  buildStatusScreen(root);
  buildCleaner(root);
  buildPolish(root);
  buildPolishWindows(root);
  buildPlatens(root);
  buildLoadCup(root);
  buildCarousel(root);
  buildConditioners(root);
  buildSlurry(root);
  buildLocators(root);
  if (SHOW_LOD1) buildLod1(root);
  return applyFoundryStandardLod(root);
}

// ------------------------------------------------------------ clips
function animate(root) {
  const spin = [];
  for (let i = 0; i <= 8; i++) spin.push({ time: i * 0.25, rotation: [0, i === 8 ? 0 : i * 45, 0] });
  const sweep = [];
  for (let i = 0; i <= 24; i++) {
    const t = (4 * i) / 24;
    sweep.push({ time: t, rotation: [0, -20 * Math.cos(2 * Math.PI * t / 4), 0] });
  }
  const index = [];
  for (let i = 0; i <= 12; i++) {
    const t = i * 0.25;
    index.push({ time: t, rotation: [0, 45 * (1 - Math.cos(Math.PI * t / 3)), 0] });
  }
  return [
    createClip('PlatenSpin', 2, ['platen1', 'platen2', 'platen3'].map(function (n) { return rotationTrack(n, spin); })),
    createClip('ArmSweep', 4, ['conditionerArm1', 'conditionerArm2', 'conditionerArm3'].map(function (n) { return rotationTrack(n, sweep); })),
    createClip('CarouselIndex', 3, [rotationTrack('carousel', index)]),
  ];
}
