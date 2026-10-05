// tool-front-robot-arm: Foundry Floor tool-front robot arm. Metres, +X forward (toward the load port), +Y up, +Z right.
// Rest pose = home. Rotation about +Z lifts a link in its plane (+X -> +Y); base yaw +90 about +Y turns the arm plane toward -Z (AMR side).
const meta = { name: 'tool-front-robot-arm' };

// ---- constants ----
const PED = { half: 0.20, h: 0.80, chamfer: 0.02 };
const BAND = { y0: 0.60, y1: 0.70, half: 0.205 };
const SCREEN = { y0: 0.30, y1: 0.55, w: 0.30, proud: 0.01, embed: 0.004 };
const LAMP = { x: -0.15, z: -0.15, r: 0.028, h: 0.030, sink: 0.002 };
const TURRET = { r: 0.12, h: 0.15, bevel: 0.015 };
const L1 = 0.60, L2 = 0.65, GRIP_DROP = 0.25;
const SH_Y = PED.h + TURRET.h;
const UPPER = { w: 0.12, r0: 0.060, r1: 0.034 };
const FORE = { w: 0.10, r0: 0.029, r1: 0.029 };
const JOINT = {
  shoulder: { r: 0.066, half: 0.066, bootR: 0.050 },
  elbow: { r: 0.075, half: 0.065, bootR: 0.062 },
  wrist: { r: 0.050, half: 0.055, bootR: 0.038 },
};
const BOOT_T = 0.010, BOOT_EMBED = 0.002, AXLE_R = 0.018;
const FLANGE = { r: 0.030, len: 0.10 };
const GRIPPER = { x: 0.16, y: 0.10, z: 0.12, chamfer: 0.008, centerY: 0.085 }; // housing above the declared flange contact plane
const RAIL = { x: 0.10, y: 0.012, z: 0.20, embed: 0.002 };
const FINGER = { x: 0.10, y: 0.052, t: 0.014 };
const FING = { open: 0.08, closed: 0.055 }; // actual FOUP flange is 0.110 m wide
const SEG = { turret: 40, housing: 32, boot: 24, shaft: 24, lamp: 20 };
const LOD_INSET = 0.002;
const LOCATORS = { deckPark: [-0.23, 0, -0.65], seatRef: [0.65, 0.90, 0] };

// ---- helpers ----
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);

function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
const ccw = (pts) => (area(pts) < 0 ? pts.slice().reverse() : pts);

function put(parent, name, geo, mat, opts) {
  const m = createPart(name, geo, mat, Object.assign({ parent }, opts || {}));
  m.name = name;
  return m;
}

function group(parent, name) {
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  return g;
}

function mat(name, color, o) {
  const m = gameMaterial(color, Object.assign({ flatShading: false }, o));
  m.name = name;
  return m;
}

function makeMaterials() {
  const M = {
    grey: mat('tool-panel-grey', 0xC5CBD1, { roughness: 0.60, metalness: 0 }),
    orange: mat('accent-amhs', 0xE07B22, { roughness: 0.50, metalness: 0 }),
    white: mat('tool-shell-white', 0xE8EBEE, { roughness: 0.55, metalness: 0 }),
    graphite: mat('trim-graphite', 0x3B4148, { roughness: 0.50, metalness: 0.1 }),
    steel: mat('stainless', 0xB9BEC3, { roughness: 0.35, metalness: 1 }),
    rubber: mat('rubber-black', 0x1E2226, { roughness: 0.90, metalness: 0 }),
    glass: mat('glass-smoked', 0x5E6A73, { roughness: 0.10, metalness: 0 }),
    green: mat('status-green', 0x22B14C, { roughness: 0.40, metalness: 0, emissive: 0x22B14C, emissiveIntensity: 0.8 }),
  };
  M.glass.transparent = true;
  M.glass.opacity = 0.6;
  return M;
}

// ---- kinematics (elbow-up two-link planar solution; gripper stays vertical: th3 = -(th1 + th2)) ----
// r: radial distance of gripCentre from the base axis along the arm plane; gy: gripCentre height.
function solveArm(r, gy) {
  const wx = r, wy = gy + GRIP_DROP - SH_Y;
  const d = Math.hypot(wx, wy), ux = wx / d, uy = wy / d;
  const reach = Math.min(d, L1 + L2 - 1e-6);
  const a = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ex = a * ux - h * uy, ey = a * uy + h * ux;
  const th1 = deg(Math.atan2(ey, ex));
  const th12 = deg(Math.atan2(uy * reach - ey, ux * reach - ex));
  return { th1, th2: th12 - th1, th3: -th12, need: d, reach };
}
function makePoses() {
  const mk = (yaw, r, gy, gyaw) => Object.assign({ yaw, r, gy, gyaw }, solveArm(r, gy));
  return {
    home: mk(0, 0.35, 1.10, 0),
    homeClear: mk(0, 0.35, 1.450, 0), // retract beyond the seated FOUP before lowering the open jaws
    deck: mk(90, 0.65, 1.635, 180),
    deckLifted: mk(90, 0.65, 1.735, 180),
    seatAbove: mk(0, 0.65, 1.335, 0),
    transferAbove: mk(0, 0.55, 1.450, 0), // retract 100 mm during loaded rotation; align before approaching the frame
    seat: mk(0, 0.65, 1.235, 0),
  };
}
const POSES = makePoses();

// ---- geometry ----
function pedProfile(g) {
  const k = Math.SQRT2 - 1, s = Math.SQRT2;
  return [
    [0, g], [(PED.half - g) * s, g],
    [(PED.half - g) * s, PED.h - PED.chamfer - g * k],
    [(PED.half - PED.chamfer - g * k) * s, PED.h - g],
    [0, PED.h - g],
  ];
}
async function pedestalGeo(g) {
  const geo = await revolveProfile(pedProfile(g), { segments: 4, axis: 'y', smooth: false });
  geo.rotateY(Math.PI / 4);
  return geo;
}
async function turretGeo() {
  const b = TURRET.bevel;
  const prof = [[0, 0], [TURRET.r, 0], [TURRET.r, TURRET.h - b], [TURRET.r - b, TURRET.h], [0, TURRET.h]];
  return creaseNormals(await revolveProfile(prof, { segments: SEG.turret, axis: 'y', smooth: false }), { angle: 35 });
}
async function lampGeo() {
  const r = LAMP.r, h = LAMP.h;
  const prof = [[0, 0], [r, 0], [r * 0.9, h * 0.35], [r * 0.6, h * 0.75], [r * 0.25, h * 0.95], [0, h]];
  return creaseNormals(await revolveProfile(prof, { segments: SEG.lamp, axis: 'y', smooth: false }), { angle: 50 });
}
async function linkGeo(L, w, r0, r1) {
  const t = Math.acos((r0 - r1) / L), n1 = 18, n0 = 20, pts = [];
  for (let i = 0; i <= n1; i++) { const a = -t + 2 * t * i / n1; pts.push([L + r1 * Math.cos(a), r1 * Math.sin(a)]); }
  for (let i = 0; i <= n0; i++) { const a = t + (2 * Math.PI - 2 * t) * i / n0; pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]); }
  const g = await extrudeProfile(ccw(pts), { depth: w, axis: 'z', center: true });
  return creaseNormals(g, { angle: 35 });
}
async function spoolGeo(J) {
  const zi = J.half - BOOT_EMBED, zo = J.half + BOOT_T, rf = J.bootR, ra = AXLE_R;
  const prof = [[0, -zo], [rf, -zo], [rf, -zi], [ra, -zi], [ra, zi], [rf, zi], [rf, zo], [0, zo]];
  return creaseNormals(await revolveProfile(prof, { segments: SEG.boot, axis: 'y', smooth: false }), { angle: 35 });
}
function alongZ(g) { g.rotateX(Math.PI / 2); return g; }

// ---- asset ----
async function buildArm(parent, opt) {
  const o = Object.assign({ pose: POSES.home, fingers: FING.open, foup: false, lod: true, tag: '', M: null }, opt || {});
  const M = o.M || makeMaterials();
  const P = o.pose, tag = o.tag;
  const add = (par, n, geo, m, opts) => put(par, n + tag, geo, m, opts);
  const grp = (par, n) => group(par, n + tag);

  add(parent, 'pedestal', await pedestalGeo(0), M.grey);
  add(parent, 'pedestalBand', boxGeo(2 * BAND.half, BAND.y1 - BAND.y0, 2 * BAND.half), M.orange, { position: [0, (BAND.y0 + BAND.y1) / 2, 0] });
  const st = SCREEN.proud + SCREEN.embed;
  add(parent, 'screen', await roundedBoxGeo(st, SCREEN.y1 - SCREEN.y0, SCREEN.w, 0.003, { style: 'chamfer' }), M.glass,
    { position: [-(PED.half + SCREEN.proud) + st / 2, (SCREEN.y0 + SCREEN.y1) / 2, 0] });
  add(parent, 'statusLamp', await lampGeo(), M.green, { position: [LAMP.x, PED.h - LAMP.sink, LAMP.z] });

  const base = add(parent, 'base', await turretGeo(), M.graphite, { position: [0, PED.h, 0], rotation: [0, P.yaw, 0] });
  add(base, 'shoulderBoot', alongZ(await spoolGeo(JOINT.shoulder)), M.rubber, { position: [0, TURRET.h, 0] });
  const upper = add(base, 'upperArm', await linkGeo(L1, UPPER.w, UPPER.r0, UPPER.r1), M.white, { position: [0, TURRET.h, 0], rotation: [0, 0, P.th1] });
  add(upper, 'upperArmHousingShoulder', alongZ(cylinderGeo(JOINT.shoulder.r, JOINT.shoulder.r, 2 * JOINT.shoulder.half, SEG.housing)), M.graphite);
  add(upper, 'upperArmHousingElbow', alongZ(cylinderGeo(JOINT.elbow.r, JOINT.elbow.r, 2 * JOINT.elbow.half, SEG.housing)), M.graphite, { position: [L1, 0, 0] });
  add(upper, 'elbowBoot', alongZ(await spoolGeo(JOINT.elbow)), M.rubber, { position: [L1, 0, 0] });
  const fore = add(upper, 'forearm', await linkGeo(L2, FORE.w, FORE.r0, FORE.r1), M.white, { position: [L1, 0, 0], rotation: [0, 0, P.th2] });
  add(fore, 'wristBoot', alongZ(await spoolGeo(JOINT.wrist)), M.rubber, { position: [L2, 0, 0] });
  const wrist = add(fore, 'wrist', alongZ(cylinderGeo(JOINT.wrist.r, JOINT.wrist.r, 2 * JOINT.wrist.half, SEG.housing)), M.graphite,
    { position: [L2, 0, 0], rotation: [0, 0, P.th3] });
  const flange = add(wrist, 'flange', cylinderGeo(FLANGE.r, FLANGE.r, FLANGE.len, SEG.shaft), M.graphite, { position: [0, -FLANGE.len / 2, 0] });
  const gripper = add(flange, 'gripper', (await roundedBoxGeo(GRIPPER.x, GRIPPER.y, GRIPPER.z, GRIPPER.chamfer, { style: 'chamfer' })).translate(0, GRIPPER.centerY, 0), M.graphite,
    { position: [0, -(GRIP_DROP - FLANGE.len / 2), 0], rotation: [0, P.gyaw, 0] });
  const gap = GRIP_DROP - FLANGE.len - GRIPPER.centerY - GRIPPER.y / 2;
  add(gripper, 'gripperStem', cylinderGeo(FLANGE.r, FLANGE.r, gap + 0.004, SEG.shaft), M.graphite, { position: [0, GRIPPER.centerY + GRIPPER.y / 2 + gap / 2, 0] });
  const railY = GRIPPER.centerY - GRIPPER.y / 2 - RAIL.y / 2 + RAIL.embed;
  add(gripper, 'gripperRail', boxGeo(RAIL.x, RAIL.y, RAIL.z), M.graphite, { position: [0, railY, 0] });
  const fingers = grp(gripper, 'gripperFingers');
  const fMid = railY - RAIL.y / 2 + 0.002 - FINGER.y / 2;
  for (const s of [-1, 1]) {
    const g = await roundedBoxGeo(FINGER.x, FINGER.y, FINGER.t, 0.004, { style: 'chamfer' });
    g.translate(0, fMid, s * FINGER.t / 2);
    add(fingers, s < 0 ? 'gripperFingerL' : 'gripperFingerR', g, M.steel, { position: [0, 0, s * o.fingers] });
  }
  const gc = grp(gripper, 'gripCentre');

  if (o.foup) {
    const amber = mat('review-amber', 0xE3A21A, { roughness: 0.6, metalness: 0 });
    const door = mat('review-door', 0x6B4E10, { roughness: 0.6, metalness: 0 });
    add(gc, 'foupBox', boxGeo(0.333, 0.335, 0.416), amber, { position: [0, -0.1675, 0] });
    add(gc, 'foupDoor', boxGeo(0.004, 0.30, 0.38), door, { position: [0.1685, -0.1675, 0] });
  }

  const dp = grp(parent, 'deckPark'); dp.position.set(...LOCATORS.deckPark);
  const sr = grp(parent, 'seatRef'); sr.position.set(...LOCATORS.seatRef);

  if (o.lod) {
    const g = LOD_INSET, lod = grp(parent, 'lod1'), H = POSES.home;
    add(lod, 'lod1Pedestal', await pedestalGeo(g), M.grey);
    add(lod, 'lod1Band', boxGeo(2 * (BAND.half - g), BAND.y1 - BAND.y0 - 2 * g, 2 * (BAND.half - g)), M.orange, { position: [0, (BAND.y0 + BAND.y1) / 2, 0] });
    const c1 = Math.cos(rad(H.th1)), s1 = Math.sin(rad(H.th1)), a12 = H.th1 + H.th2, c2 = Math.cos(rad(a12)), s2 = Math.sin(rad(a12));
    const ex = L1 * c1, ey = SH_Y + L1 * s1;
    add(lod, 'lod1UpperArm', boxGeo(L1, 2 * (UPPER.r1 - g), UPPER.w - 2 * g), M.white, { position: [L1 / 2 * c1, SH_Y + L1 / 2 * s1, 0], rotation: [0, 0, H.th1] });
    add(lod, 'lod1Forearm', boxGeo(L2, 2 * (FORE.r1 - g), FORE.w - 2 * g), M.white, { position: [ex + L2 / 2 * c2, ey + L2 / 2 * s2, 0], rotation: [0, 0, a12] });
  }
}

// ---- clips ----
function mixPose(a, b, u, cartesian) {
  if (!cartesian) return { yaw: lerp(a.yaw, b.yaw, u), gyaw: lerp(a.gyaw, b.gyaw, u), th1: lerp(a.th1, b.th1, u), th2: lerp(a.th2, b.th2, u), th3: lerp(a.th3, b.th3, u) };
  const r = lerp(a.r, b.r, u), gy = lerp(a.gy, b.gy, u);
  return Object.assign({ yaw: lerp(a.yaw, b.yaw, u), gyaw: lerp(a.gyaw, b.gyaw, u), r, gy }, solveArm(r, gy)); // straight vertical approach, not a joint-space bow into the frame
}
function segment(keys, t0, t1, a, b, fa, fb, steps, cartesian = false) {
  if (!keys.length) keys.push({ t: t0, pose: a, f: fa });
  for (let i = 1; i <= steps; i++) {
    const u = ease(i / steps);
    keys.push({ t: i === steps ? t1 : lerp(t0, t1, i / steps), pose: mixPose(a, b, u, cartesian), f: lerp(fa, fb, u) });
  }
}
function clipFrom(name, dur, keys) {
  const T = (fn) => keys.map((k) => fn(k));
  return createClip(name, dur, [
    rotationTrack('base', T((k) => ({ time: k.t, rotation: [0, k.pose.yaw, 0] }))),
    rotationTrack('upperArm', T((k) => ({ time: k.t, rotation: [0, 0, k.pose.th1] }))),
    rotationTrack('forearm', T((k) => ({ time: k.t, rotation: [0, 0, k.pose.th2] }))),
    rotationTrack('wrist', T((k) => ({ time: k.t, rotation: [0, 0, k.pose.th3] }))),
    rotationTrack('gripper', T((k) => ({ time: k.t, rotation: [0, k.pose.gyaw, 0] }))),
    positionTrack('gripperFingerL', T((k) => ({ time: k.t, position: [0, 0, -k.f] }))),
    positionTrack('gripperFingerR', T((k) => ({ time: k.t, position: [0, 0, k.f] }))),
  ]);
}
function armClips() {
  const P = POSES, O = FING.open, C = FING.closed;
  let k = [];
  segment(k, 0, 1, P.deck, P.deck, O, C, 8);
  segment(k, 1, 2, P.deck, P.deckLifted, C, C, 16);
  segment(k, 2, 6, P.deckLifted, P.transferAbove, C, C, 64, true);
  segment(k, 6, 7, P.transferAbove, P.seat, C, C, 16, true);
  segment(k, 7, 8, P.seat, P.seat, C, O, 8);
  const deckToSeat = clipFrom('DeckToSeat', 8, k);
  k = [];
  segment(k, 0, 1, P.seat, P.seat, O, C, 8);
  segment(k, 1, 2, P.seat, P.transferAbove, C, C, 16, true);
  segment(k, 2, 6, P.transferAbove, P.deckLifted, C, C, 64, true);
  segment(k, 6, 7, P.deckLifted, P.deck, C, C, 16);
  segment(k, 7, 8, P.deck, P.deck, C, O, 8);
  const seatToDeck = clipFrom('SeatToDeck', 8, k);
  k = [];
  segment(k, 0, 1, P.seat, P.seatAbove, O, O, 16);
  segment(k, 1, 3, P.seatAbove, P.homeClear, O, O, 32, true);
  segment(k, 3, 4, P.homeClear, P.home, O, O, 16, true);
  const seatToHome = clipFrom('SeatToHome', 4, k);
  k = [];
  segment(k, 0, 2, P.home, P.deckLifted, O, O, 32);
  segment(k, 2, 3, P.deckLifted, P.deck, O, O, 16);
  const homeToDeck = clipFrom('HomeToDeck', 3, k);
  return [deckToSeat, seatToDeck, seatToHome, homeToDeck];
}

// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing robot far distance (25 m),
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
  const coverage = Math.min(1, Math.PI * (radius / (2 * 25 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

async function build() {
  const root = createRoot('ToolFrontRobotArm');
  await buildArm(root, {});
  return applyFoundryStandardLod(root);
}
function animate(root) {
  return armClips();
}
