// OHT vehicle (overhead hoist transport). Metres. +X = travel / front, +Y up, +Z = load side (right).
// Origin = rail centreline at the track underside (Y = 0). Trolley above (0..+0.18), everything else hangs below.
const meta = { name: 'oht-vehicle' };

// ---------- envelope (brief: 0.95 x 1.18 x 0.60) ----------
const HOOD_TOP = -0.05;
const HOOD_BOT = -1.00;
const HOOD_H = HOOD_TOP - HOOD_BOT;          // 0.95
const HOOD_MID = (HOOD_TOP + HOOD_BOT) / 2;
const SKIN_HZ = 0.297;                       // cover / skirt half width; the orange band adds 3 mm -> 0.300
const BAND_T = 0.003;
const COVER_IN = 0.255;                      // inner face of front / rear covers (|x|)
const NOSE_X = 0.463;                        // front cover nose (bumper stands proud to 0.475)
const REAR_X = 0.472;                        // rear cover back face (band adds 3 mm -> 0.475)
const R_FRONT = 0.070;
const R_REAR = 0.030;
const BULK_T = 0.020;                        // bulkheads inside the covers: bay half length 0.235
const SKIRT_IN = 0.260;                      // skirt inner face (|z|): bay half width
const ROOF_T = 0.080;
const WINCH_HX = 0.200;
const WINCH_BOT = -0.35;                     // belt top attachment
const NOTCH_TOP = -0.74;                     // skirts are cut away below this so a carried FOUP shows from the side
const NOTCH_HX_BOT = 0.215;
const NOTCH_HX_TOP = 0.175;
const BAND_Y0 = -0.62;
const BAND_Y1 = -0.52;
const BAND_H = BAND_Y1 - BAND_Y0;
const BAND_CY = (BAND_Y0 + BAND_Y1) / 2;

// ---------- rail-side parts ----------
const NECK_X = 0.200;
const NECK_Z = 0.040;                        // 60 mm rail slot
const TROLLEY_TOP = 0.180;

// ---------- front cover details ----------
const LAMP_X = 0.370;
const BUMP_CY = -0.80;
const WIN_W = 0.262;
const WIN_H = 0.060;
const WIN_T = 0.008;
const SUR_W = 0.300;
const SUR_H = 0.100;
const SUR_T = 0.012;                         // nose 0.463 + 0.012 = 0.475

// ---------- hoist / belts / fingers ----------
const HOIST_STOW_Y = -0.565;                 // hoist origin = FOUP top-flange plane
const HOIST_TOP = 0.075;                     // top face of the hoist plate above its origin
const DROP = 3.10;
const CLIP_S = 5;
const EASE_S = 0.3;
const BELT_TOP_Y = -0.35;
const BELT_EMBED = 0.002;                    // strap bottoms sink into the hoist plate so no gap can open during the clip
const BELT_TOP_EMBED = 0;                    // strap tops stop exactly at the winch box underside (scale origin)
const BELT_L0 = BELT_TOP_Y - (HOIST_STOW_Y + HOIST_TOP - BELT_EMBED);   // 0.145 at rest
const BELT_W = 0.030;
const BELT_T = 0.006;
const BELT_X = 0.130;
const BELT_Z = 0.085;
const HINGE_Y = 0.038;
const HINGE_Z = 0.065;
const FING_W = 0.044;
const ARM_T = 0.008;
const ARM_TOP = 0.006;
const ARM_BOT = -0.059;
const TAB_T = 0.008;
const TAB_CY = -0.055;
const TAB_L = 0.038;
const PIN_R = 0.006;
const PIN_LEN = 0.048;
const OPEN_DEG = 30;

// ---------- lod1 proxy (inset inside every detailed surface) ----------
const LZ = 0.285;
const LF = 0.425;
const LR = -0.460;
const LBOT = -0.995;
const LTOP = -0.056;

const beltScale = (y) => (BELT_TOP_Y - (y + HOIST_TOP - BELT_EMBED)) / BELT_L0;

const rectPts = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

// plan outline of an end cover (x, z) with rounded outer corners, mapped to the profile (x, -z)
function endOutline(sign, nose, R, x0, hz, off = 0, n = 6) {
  const r = R + off;
  const cx = nose - R;
  const cz = hz - R;
  const pts = [[x0, -(hz + off)]];
  for (let i = 0; i <= n; i++) {
    const a = ((-90 + (90 * i) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), -cz + r * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = (((90 * i) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  pts.push([x0, hz + off]);
  return pts.map(([x, z]) => [sign * x, -z]);
}

// 3 mm orange skin that wraps a cover's outline without overlapping it (C-shaped ring open at the body side)
function endBand(sign, nose, R, x0, hz, n) {
  return [...endOutline(sign, nose, R, x0, hz, BAND_T, n), ...endOutline(sign, nose, R, x0, hz, 0, n).reverse()];
}

// bake a mesh's own transform into its geometry so the node sits at the origin
function bake(mesh) {
  mesh.updateMatrix();
  mesh.geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
  return mesh;
}

async function build() {
  const root = createRoot('oht-vehicle');

  const M = (name, hex, r, m) => {
    const x = gameMaterial(hex, { roughness: r, metalness: m });
    x.name = name;
    return x;
  };
  const white = M('tool-shell-white', 0xE8EBEE, 0.55, 0.0);
  const accent = M('accent-amhs', 0xE07B22, 0.50, 0.0);
  const graphite = M('trim-graphite', 0x3B4148, 0.50, 0.1);
  const rubber = M('rubber-black', 0x1E2226, 0.90, 0.0);
  const steel = M('stainless', 0xB9BEC3, 0.35, 1.0);
  const green = M('status-green', 0x22B14C, 0.40, 0.0);

  const mesh = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
  };
  const part = (name, m, parent = root) => {
    m.name = name;
    parent.add(m);
    return m;
  };

  // ---------- neck (through the rail slot) ----------
  part('neck', mesh(boxGeo(NECK_X, 0.05, NECK_Z), graphite, 0, -0.025, 0));

  // ---------- trolley: drive block, running wheels, guide wheels (all inside the 0.30 x 0.20 rail profile) ----------
  const tParts = [
    mesh(boxGeo(0.20, 0.032, 0.04), graphite, 0, 0.016, 0),
    mesh(await roundedBoxGeo(0.34, 0.11, 0.15, 0.010, { style: 'round', segments: 2 }), graphite, 0, 0.085, 0),
    mesh(boxGeo(0.28, 0.042, 0.18), graphite, 0, 0.159, 0),
  ];
  const runG = cylinderGeo(0.030, 0.030, 0.030, 16);
  const guideG = cylinderGeo(0.020, 0.020, 0.040, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      tParts.push(mesh(runG, graphite, sx * 0.13, 0.05, sz * 0.0895, Math.PI / 2, 0, 0));
      tParts.push(mesh(guideG, graphite, sx * 0.15, 0.121, sz * 0.105));
    }
  }
  const trolley = await boolUnion('trolley', ...tParts);
  trolley.material = graphite;
  part('trolley', bake(trolley));

  // ---------- body: roof deck, winch box, two bulkheads (hood housing, open underneath) ----------
  const roofBot = HOOD_TOP - ROOF_T;
  const winchH = (roofBot + 0.01) - WINCH_BOT;
  const bulkH = (roofBot + 0.01) - HOOD_BOT;
  const bulkX = COVER_IN - BULK_T / 2;
  const bodyParts = [
    mesh(boxGeo(2 * COVER_IN, ROOF_T, 2 * SKIRT_IN), white, 0, HOOD_TOP - ROOF_T / 2, 0),
    mesh(await roundedBoxGeo(2 * WINCH_HX, winchH, 2 * WINCH_HX, 0.012, { style: 'round', segments: 2 }), white, 0, WINCH_BOT + winchH / 2, 0),
    mesh(boxGeo(BULK_T, bulkH, 2 * SKIRT_IN), white, bulkX, HOOD_BOT + bulkH / 2, 0),
    mesh(boxGeo(BULK_T, bulkH, 2 * SKIRT_IN), white, -bulkX, HOOD_BOT + bulkH / 2, 0),
  ];
  const body = await boolUnion('body', ...bodyParts);
  body.material = white;
  part('body', bake(body));

  // ---------- covers (white) with their orange bands as child meshes ----------
  const frontCover = mesh(await extrudeProfile(endOutline(1, NOSE_X, R_FRONT, COVER_IN, SKIN_HZ), { depth: HOOD_H, axis: 'y' }), white, 0, HOOD_MID, 0);
  part('frontCover', bake(frontCover));
  const frontBand = mesh(await extrudeProfile(endBand(1, NOSE_X, R_FRONT, COVER_IN, SKIN_HZ, 6), { depth: BAND_H, axis: 'y' }), accent, 0, BAND_CY, 0);
  part('frontCoverBand', bake(frontBand), frontCover);

  const rearCover = mesh(await extrudeProfile(endOutline(-1, REAR_X, R_REAR, COVER_IN, SKIN_HZ, 0, 3), { depth: HOOD_H, axis: 'y' }), white, 0, HOOD_MID, 0);
  part('rearCover', bake(rearCover));
  const rearBand = mesh(await extrudeProfile(endBand(-1, REAR_X, R_REAR, COVER_IN, SKIN_HZ, 3), { depth: BAND_H, axis: 'y' }), accent, 0, BAND_CY, 0);
  part('rearCoverBand', bake(rearBand), rearCover);

  // ---------- side covers: two skirts with a shallow notch so a carried FOUP shows ----------
  const skirtPoly = [
    [-COVER_IN, HOOD_BOT], [-NOTCH_HX_BOT, HOOD_BOT], [-NOTCH_HX_TOP, NOTCH_TOP], [NOTCH_HX_TOP, NOTCH_TOP],
    [NOTCH_HX_BOT, HOOD_BOT], [COVER_IN, HOOD_BOT], [COVER_IN, HOOD_TOP], [-COVER_IN, HOOD_TOP],
  ];
  const skirtG = await extrudeProfile(skirtPoly, { depth: SKIN_HZ - SKIRT_IN, axis: 'z' });
  const skirtZ = (SKIN_HZ + SKIRT_IN) / 2;
  const sideCovers = await boolUnion('sideCovers', mesh(skirtG, white, 0, 0, skirtZ), mesh(skirtG, white, 0, 0, -skirtZ));
  sideCovers.material = white;
  part('sideCovers', bake(sideCovers));
  const stripG = boxGeo(2 * COVER_IN, BAND_H, BAND_T);
  const stripZ = SKIN_HZ + BAND_T / 2;
  const sideBands = await boolUnion('sideCoverBands', mesh(stripG, accent, 0, BAND_CY, stripZ), mesh(stripG, accent, 0, BAND_CY, -stripZ));
  sideBands.material = accent;
  part('sideCoverBands', bake(sideBands), sideCovers);

  // ---------- status lamp (top of the front cover) ----------
  const statusLamp = await boolUnion(
    'statusLamp',
    mesh(cylinderGeo(0.022, 0.026, 0.012, 12), green, LAMP_X, HOOD_TOP + 0.006, 0),
    mesh(cylinderGeo(0.012, 0.022, 0.012, 12), green, LAMP_X, HOOD_TOP + 0.017, 0),
  );
  statusLamp.material = green;
  part('statusLamp', bake(statusLamp));

  // ---------- bumper sensor: dark window with an orange surround ----------
  const bumper = mesh(boxGeo(WIN_T, WIN_H, WIN_W), graphite, NOSE_X + WIN_T / 2, BUMP_CY, 0);
  part('bumperSensor', bake(bumper));
  const surround = mesh(
    await extrudeProfile(rectPts(SUR_W, SUR_H), { depth: SUR_T, holes: [rectPts(WIN_W, WIN_H)], axis: 'x' }),
    accent, NOSE_X + SUR_T / 2, BUMP_CY, 0,
  );
  part('bumperSurround', bake(surround), bumper);

  // ---------- hoist: gripper frame, origin at the FOUP top-flange plane ----------
  const hoistParts = [
    mesh(await roundedBoxGeo(0.28, 0.055, 0.11, 0.008, { style: 'round', segments: 2 }), graphite, 0, 0.0275, 0),
    mesh(await roundedBoxGeo(0.32, 0.023, 0.23, 0.006, { style: 'round', segments: 2 }), graphite, 0, 0.0635, 0),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) hoistParts.push(mesh(boxGeo(0.010, 0.031, 0.025), graphite, sx * 0.029, 0.0425, sz * 0.0625));
  }
  const hoist = await boolUnion('hoist', ...hoistParts);
  hoist.material = graphite;
  bake(hoist);
  hoist.position.set(0, HOIST_STOW_Y, 0);
  part('hoist', hoist);

  // gripper fingers: two hooks, each hinged on the hoist about an axis parallel to X
  const fingers = new THREE.Group();
  part('gripperFingers', fingers, hoist);
  for (const s of [1, -1]) {
    const arm = mesh(boxGeo(FING_W, ARM_TOP - ARM_BOT, ARM_T), steel, 0, (ARM_TOP + ARM_BOT) / 2, 0);
    const tab = mesh(boxGeo(FING_W, TAB_T, TAB_L), steel, 0, TAB_CY, -s * (TAB_L / 2 - ARM_T / 2));
    const pin = mesh(cylinderGeo(PIN_R, PIN_R, PIN_LEN, 12), steel, 0, 0, 0, 0, 0, Math.PI / 2);
    const name = s > 0 ? 'gripperFingerRight' : 'gripperFingerLeft';
    const f = await boolUnion(name, arm, tab, pin);
    f.material = steel;
    bake(f);
    f.position.set(0, HINGE_Y, s * HINGE_Z);
    part(name, f, fingers);
  }

  // locator: FOUP top-flange point (child of the hoist)
  const foupGrip = new THREE.Object3D();
  part('foupGrip', foupGrip, hoist);

  // ---------- belts: four straps, origin at the top attachment, scaled along Y ----------
  const strapG = boxGeo(BELT_W, BELT_TOP_EMBED + BELT_L0, BELT_T);
  const straps = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    straps.push(mesh(strapG, rubber, sx * BELT_X, (BELT_TOP_EMBED - BELT_L0) / 2, sz * BELT_Z, 0, Math.atan2(sx, sz), 0));
  }
  const belts = await boolUnion('belts', ...straps);
  belts.material = rubber;
  bake(belts);
  belts.position.set(0, BELT_TOP_Y, 0);
  part('belts', belts);

  // ---------- lod1: white box (open below) with the orange band and a trolley block, inset inside the detailed surfaces ----------
  const lod1 = new THREE.Group();
  lod1.name = 'lod1';
  lod1.userData.hideable = true;
  root.add(lod1);
  const slabPoly = [
    [LR, LBOT], [-NOTCH_HX_BOT - 0.002, LBOT], [-NOTCH_HX_TOP - 0.002, NOTCH_TOP + 0.002], [NOTCH_HX_TOP + 0.002, NOTCH_TOP + 0.002],
    [NOTCH_HX_BOT + 0.002, LBOT], [LF, LBOT], [LF, LTOP], [LR, LTOP],
  ];
  const slabG = await extrudeProfile(slabPoly, { depth: 0.002, axis: 'z' });
  createPart('lod1SideR', slabG, white, { position: [0, 0, LZ], parent: lod1 });
  createPart('lod1SideL', slabG, white, { position: [0, 0, -LZ], parent: lod1 });
  const lodH = LTOP - LBOT;
  const lodCY = (LTOP + LBOT) / 2;
  createPart('lod1Front', planeGeo(2 * LZ, lodH), white, { position: [LF, lodCY, 0], rotation: [0, 90, 0], parent: lod1 });
  createPart('lod1Rear', planeGeo(2 * LZ, lodH), white, { position: [LR, lodCY, 0], rotation: [0, -90, 0], parent: lod1 });
  createPart('lod1Roof', planeGeo(LF - LR, 2 * LZ), white, { position: [(LF + LR) / 2, LTOP, 0], rotation: [-90, 0, 0], parent: lod1 });
  createPart('lod1BandFront', planeGeo(2 * LZ, BAND_H), accent, { position: [LF + 0.001, BAND_CY, 0], rotation: [0, 90, 0], parent: lod1 });
  createPart('lod1BandRear', planeGeo(2 * LZ, BAND_H), accent, { position: [LR - 0.001, BAND_CY, 0], rotation: [0, -90, 0], parent: lod1 });
  createPart('lod1BandR', planeGeo(LF - LR, BAND_H), accent, { position: [(LF + LR) / 2, BAND_CY, LZ + 0.0015], parent: lod1 });
  createPart('lod1BandL', planeGeo(LF - LR, BAND_H), accent, { position: [(LF + LR) / 2, BAND_CY, -(LZ + 0.0015)], rotation: [0, 180, 0], parent: lod1 });
  createPart('lod1Trolley', boxGeo(0.33, 0.10, 0.14), graphite, { position: [0, 0.085, 0], parent: lod1 });
  createPart('lod1Neck', boxGeo(0.18, 0.101, 0.03), graphite, { position: [0, -0.0055, 0], parent: lod1 });
  lod1.visible = false;

  return root;
}

function animate(root) {
  const v = DROP / (CLIP_S - EASE_S);
  const dist = (t) => {
    if (t <= EASE_S) return (v * t * t) / (2 * EASE_S);
    if (t <= CLIP_S - EASE_S) return (v * EASE_S) / 2 + v * (t - EASE_S);
    const r = CLIP_S - t;
    return DROP - (v * r * r) / (2 * EASE_S);
  };
  const times = [0, 0.075, 0.15, 0.225, 0.3, 4.7, 4.775, 4.85, 4.925, 5];
  const down = times.map((t) => ({ t, y: HOIST_STOW_Y - dist(t) }));
  const up = times.map((t) => ({ t, y: HOIST_STOW_Y - dist(CLIP_S - t) }));
  const posKeys = (arr) => arr.map(({ t, y }) => ({ time: t, position: [0, y, 0] }));
  const sclKeys = (arr) => arr.map(({ t, y }) => ({ time: t, scale: [1, beltScale(y), 1] }));
  const closeTo = (side) => [{ time: 0, rotation: [-side * OPEN_DEG, 0, 0] }, { time: 1, rotation: [0, 0, 0] }];
  const openTo = (side) => [{ time: 0, rotation: [0, 0, 0] }, { time: 1, rotation: [-side * OPEN_DEG, 0, 0] }];
  return [
    createClip('HoistDown', CLIP_S, [positionTrack('hoist', posKeys(down)), scaleTrack('belts', sclKeys(down))]),
    createClip('HoistUp', CLIP_S, [positionTrack('hoist', posKeys(up)), scaleTrack('belts', sclKeys(up))]),
    createClip('GripClose', 1, [rotationTrack('gripperFingerRight', closeTo(1)), rotationTrack('gripperFingerLeft', closeTo(-1))]),
    createClip('GripOpen', 1, [rotationTrack('gripperFingerRight', openTo(1)), rotationTrack('gripperFingerLeft', openTo(-1))]),
  ];
}
