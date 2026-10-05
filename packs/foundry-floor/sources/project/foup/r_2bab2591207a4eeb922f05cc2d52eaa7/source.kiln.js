// FOUP (front-opening unified pod). Metres. +X = door face, +Y up, +Z right.
// Origin = centre of the base (kinematic-coupling plane) at Y = 0.
const meta = { name: 'foup' };

// ---------- envelope (brief: 0.333 x 0.335 x 0.416) ----------
const DEPTH_X = 0.333;
const HEIGHT_Y = 0.335;
const FRONT_X = DEPTH_X / 2;           // door + frame front plane (0.1665)
const BACK_X = -DEPTH_X / 2;

// ---------- base plate (dark) with three V-grooves underneath ----------
const BASE_H = 0.014;
const BASE_X = 0.300;
const BASE_Z = 0.372;
const BASE_CHAMFER = 0.010;
const GROOVE_R = 0.085;                // radius from base centre
const GROOVE_ANGLES = [0, 120, 240];   // degrees from +X toward +Z
const GROOVE_LEN = 0.048;
const GROOVE_HALF_W = 0.010;           // half width at the cutter base (slightly below Y=0)
const GROOVE_DEPTH = 0.007;

// ---------- shell (amber) ----------
const SHELL_Y0 = BASE_H;
const SHELL_Y1 = 0.300;                // roof top
const SHELL_H = SHELL_Y1 - SHELL_Y0;
const SHELL_CY = (SHELL_Y0 + SHELL_Y1) / 2;
const SHELL_Z = 0.400;                 // handles add 0.008 each side -> 0.416
const SHELL_R = 0.010;
const WALL = 0.008;

// ---------- door ----------
const DOOR_T = 0.020;
const OPEN_Y = 0.254;                  // front opening in the frame
const OPEN_Z = 0.352;
const DOOR_Y = OPEN_Y - 0.002;         // 1 mm seam all round
const DOOR_Z = OPEN_Z - 0.002;
const DOOR_CX = FRONT_X - DOOR_T / 2;  // 0.1565: outer face flush with the frame
const DOOR_CY = SHELL_CY;
const KEY_R = 0.016;
const KEY_DEPTH = 0.010;
const KEY_Z = 0.100;
const LOD_INSET = 0.0005;

// cavity behind the frame lip
const CAV_X0 = BACK_X + WALL;
const CAV_X1 = FRONT_X - DOOR_T;
const CAV_Y = SHELL_H - 2 * WALL;
const CAV_Z = SHELL_Z - 2 * WALL;

// ---------- side handles (dark slotted plates) ----------
const HANDLE_X = 0.120;
const HANDLE_Y = 0.040;
const HANDLE_T = 0.008;
const HANDLE_CY = 0.215;
const SLOT_X = 0.080;
const SLOT_Y = 0.014;

// ---------- top robotic flange ----------
const NECK_W = 0.050;
const NECK_TOP = 0.325;                // buried 2 mm into the plate for a clean union
const PLATE_W = 0.110;
const PLATE_T = 0.012;
const PLATE_Y0 = HEIGHT_Y - PLATE_T;   // 0.323
const PLATE_CHAMFER = 0.006;

// ---------- wafer stack (hidden by default) ----------
const WAFER_COUNT = 25;
const WAFER_R = 0.150;                 // 300 mm diameter
const WAFER_T = 0.002;
const WAFER_PITCH = 0.010;
const WAFER_SEGS = 8;
const WAFER_CX = (CAV_X0 + CAV_X1) / 2;
const WAFER_Y0 = SHELL_CY - ((WAFER_COUNT - 1) * WAFER_PITCH) / 2;

// ---------- door travel (matches load-port DoorOpen) ----------
const DOOR_OUT = 0.08;
const DOOR_DOWN = 0.40;

const chamferedRect = (w, h, c) => {
  const x = w / 2, y = h / 2;
  return [[-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c]];
};
const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

async function build() {
  const root = createRoot('foup');

  const amber = gameMaterial(0xC98B2E, { roughness: 0.35, metalness: 0.0 });
  amber.name = 'foup-amber-plastic';
  const dark = gameMaterial(0x2A2D31, { roughness: 0.40, metalness: 0.0 });
  dark.name = 'foup-dark-plastic';
  const silicon = gameMaterial(0x6E7FA3, { roughness: 0.15, metalness: 0.6 });
  silicon.name = 'wafer-silicon';

  // shell: rounded body, cavity behind the frame lip, front opening at +X
  const outer = new THREE.Mesh(await roundedBoxGeo(DEPTH_X, SHELL_H, SHELL_Z, SHELL_R, { style: 'round', segments: 2 }), amber);
  outer.position.set(0, SHELL_CY, 0);
  const cavity = new THREE.Mesh(boxGeo(CAV_X1 - CAV_X0, CAV_Y, CAV_Z), amber);
  cavity.position.set((CAV_X0 + CAV_X1) / 2, SHELL_CY, 0);
  const openLen = 0.060;
  const opening = new THREE.Mesh(boxGeo(openLen, OPEN_Y, OPEN_Z), amber);
  opening.position.set(CAV_X1 - 0.0065 + openLen / 2, SHELL_CY, 0);
  const shell = await boolDiff('shell', outer, cavity, opening);
  shell.name = 'shell';
  shell.material = amber;
  root.add(shell);

  // door: 20 mm plate with two latch-key recesses on the outer face
  const doorBody = new THREE.Mesh(boxGeo(DOOR_T, DOOR_Y, DOOR_Z), dark);
  doorBody.position.set(DOOR_CX, DOOR_CY, 0);
  const keyCutters = [-1, 1].map((s) => {
    const c = new THREE.Mesh(cylinderGeo(KEY_R, KEY_R, 2 * KEY_DEPTH, 8), dark);
    c.rotation.z = Math.PI / 2;
    c.position.set(FRONT_X, DOOR_CY, s * KEY_Z);
    return c;
  });
  const door = await boolDiff('door', doorBody, ...keyCutters);
  door.name = 'door';
  door.material = dark;
  root.add(door);

  // top flange: short neck + square plate, centred on X/Z
  const neck = new THREE.Mesh(boxGeo(NECK_W, NECK_TOP - SHELL_Y1, NECK_W), dark);
  neck.position.set(0, (SHELL_Y1 + NECK_TOP) / 2, 0);
  const plate = new THREE.Mesh(await extrudeProfile(chamferedRect(PLATE_W, PLATE_W, PLATE_CHAMFER), { depth: PLATE_T, axis: 'y' }), dark);
  plate.position.set(0, PLATE_Y0 + PLATE_T / 2, 0);
  const topFlange = await boolUnion('topFlange', neck, plate);
  topFlange.name = 'topFlange';
  topFlange.material = dark;
  root.add(topFlange);

  // handles: one slotted plate on each side face (one mesh, two islands)
  const handleGeo = await extrudeProfile(chamferedRect(HANDLE_X, HANDLE_Y, 0.008), { depth: HANDLE_T, holes: [rect(SLOT_X, SLOT_Y)], axis: 'z' });
  const handleP = new THREE.Mesh(handleGeo, dark);
  handleP.position.set(0, HANDLE_CY, SHELL_Z / 2 + HANDLE_T / 2);
  const handleN = new THREE.Mesh(handleGeo, dark);
  handleN.position.set(0, HANDLE_CY, -(SHELL_Z / 2 + HANDLE_T / 2));
  const handles = await boolUnion('handles', handleP, handleN);
  handles.name = 'handles';
  handles.material = dark;
  handles.userData.hideable = true;
  root.add(handles);

  // baseplate: dark plate with three radial V-grooves cut into the underside
  const baseBody = new THREE.Mesh(await extrudeProfile(chamferedRect(BASE_X, BASE_Z, BASE_CHAMFER), { depth: BASE_H, axis: 'y' }), dark);
  baseBody.position.set(0, BASE_H / 2, 0);
  const grooveGeo = await extrudeProfile([[-GROOVE_HALF_W, -0.001], [GROOVE_HALF_W, -0.001], [0, GROOVE_DEPTH]], { depth: GROOVE_LEN, axis: 'x' });
  const grooveCutters = GROOVE_ANGLES.map((deg) => {
    const a = (deg * Math.PI) / 180;
    const c = new THREE.Mesh(grooveGeo, dark);
    c.rotation.y = -a;
    c.position.set(GROOVE_R * Math.cos(a), 0, GROOVE_R * Math.sin(a));
    return c;
  });
  const baseplate = await boolDiff('baseplate', baseBody, ...grooveCutters);
  baseplate.name = 'baseplate';
  baseplate.material = dark;
  root.add(baseplate);

  // waferStack: one mesh of 25 disjoint discs at 10 mm pitch inside the shell (hidden by default)
  const waferGeo = cylinderGeo(WAFER_R, WAFER_R, WAFER_T, WAFER_SEGS);
  const discs = [];
  for (let i = 0; i < WAFER_COUNT; i++) {
    const d = new THREE.Mesh(waferGeo, silicon);
    d.position.set(WAFER_CX, WAFER_Y0 + i * WAFER_PITCH, 0);
    discs.push(d);
  }
  const waferStack = await boolUnion('waferStack', ...discs);
  waferStack.name = 'waferStack';
  waferStack.material = silicon;
  waferStack.userData.hideable = true;
  waferStack.visible = false;
  root.add(waferStack);

  // gripPoint locator: top of the flange
  const gripPoint = new THREE.Object3D();
  gripPoint.name = 'gripPoint';
  gripPoint.position.set(0, HEIGHT_Y, 0);
  root.add(gripPoint);

  // lod1 (38 tris): amber box, dark base, dark front face, flange block. Every face sits just inside
  // the detailed surfaces so the proxy does not show or z-fight if a viewer ignores its hidden flag.
  const lod1 = new THREE.Group();
  lod1.name = 'lod1';
  lod1.userData.hideable = true;
  root.add(lod1);
  const lodFrontX = FRONT_X - KEY_DEPTH;
  const lodBodyX0 = BACK_X + LOD_INSET;
  createPart('lod1Body', boxGeo(lodFrontX - lodBodyX0, SHELL_H - 2 * LOD_INSET, SHELL_Z - 2 * LOD_INSET), amber,
    { position: [(lodBodyX0 + lodFrontX) / 2, SHELL_CY, 0], parent: lod1 });
  const lodBaseY0 = GROOVE_DEPTH + LOD_INSET;
  createPart('lod1Base', boxGeo(BASE_X - 2 * LOD_INSET, BASE_H - LOD_INSET - lodBaseY0, BASE_Z - 2 * LOD_INSET), dark,
    { position: [0, (lodBaseY0 + BASE_H - LOD_INSET) / 2, 0], parent: lod1 });
  createPart('lod1Front', planeGeo(DOOR_Z - 0.002, DOOR_Y - 0.002), dark,
    { position: [lodFrontX + LOD_INSET, DOOR_CY, 0], rotation: [0, 90, 0], parent: lod1 });
  createPart('lod1Flange', boxGeo(PLATE_W - 2 * LOD_INSET, HEIGHT_Y - LOD_INSET - SHELL_Y1, PLATE_W - 2 * LOD_INSET), dark,
    { position: [0, (SHELL_Y1 + HEIGHT_Y - LOD_INSET) / 2, 0], parent: lod1 });
  lod1.visible = false;

  return root;
}

function animate(root) {
  const removePath = [
    { time: 0, position: [DOOR_CX, DOOR_CY, 0] },
    { time: 0.6, position: [DOOR_CX + DOOR_OUT, DOOR_CY, 0] },
    { time: 2, position: [DOOR_CX + DOOR_OUT, DOOR_CY - DOOR_DOWN, 0] },
  ];
  const replacePath = [
    { time: 0, position: [DOOR_CX + DOOR_OUT, DOOR_CY - DOOR_DOWN, 0] },
    { time: 1.4, position: [DOOR_CX + DOOR_OUT, DOOR_CY, 0] },
    { time: 2, position: [DOOR_CX, DOOR_CY, 0] },
  ];
  return [
    createClip('DoorRemove', 2, [positionTrack('door', removePath)]),
    createClip('DoorReplace', 2, [positionTrack('door', replacePath)]),
  ];
}
