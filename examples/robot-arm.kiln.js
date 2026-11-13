// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// A six-axis industrial robot arm.
//
// Authored by: Claude Opus 5, via Claude Code. Every part below was written by
// the model itself, looking at its own renders through the Kiln tools and
// revising. Not a line of it is hand-authored.
//
// This is the ANIMATION example, and the reason it is an arm rather than
// something with one moving part is that a robot is the case where the rig is
// the asset. Six joints, each one hanging off the last, and the only thing the
// animation says is what angle each joint is at. Every position in the clip
// below falls out of that chain -- there is not one world-space coordinate in
// `animate()`, because there cannot be: the tool flange's position is whatever
// five joints upstream of it decided, and if a link length changes here the
// whole cycle still works.
//
// That is the difference between a rig and a set of moving parts. The beam
// engine this replaced solved its linkage numerically and then drove five parts
// with five separate answers; break one and the mechanism comes apart on
// screen. Here the parts cannot come apart, because none of them knows where it
// is.
//
// The chain, shoulder outward, is the standard 6R wrist-partitioned layout:
//
//   J1 waist    about Y   the whole robot swings
//   J2 shoulder about Z   upper arm pitches
//   J3 elbow    about Z   forearm pitches
//   J4 roll     about Y   forearm rotates about its own axis
//   J5 wrist    about Z   tool pitches
//   J6 flange   about Y   tool rotates about its own axis
//
// Axes alternate perpendicular / parallel in exactly that pattern on every
// articulated arm ever built, because it is what puts three axes through one
// point at the wrist and makes the inverse kinematics solvable in closed form.
// Nothing here solves IK, but getting the axis assignment right is what makes
// the motion read as a robot instead of as a puppet.
//
// Proportions are off a mid-size floor-standing arm in the 1.5 m / 20 kg class
// -- a Fanuc M-20 or an ABB IRB 1600. The tell on those is not the arm, it is
// the COUNTERWEIGHT: a mass hung behind the shoulder so J2 is not fighting the
// whole arm at every angle. Robots that do not have it look like toys, and the
// first pass of this file did not have it and did.
//
// Verified by walking the clip and reading the tool flange's world position
// rather than by looking at it, because "the arm reaches down" is exactly the
// kind of claim a 3/4 render will let you get away with being wrong about. It
// was: the first pass's pick pose put the flange at y = 1.231 against a home of
// y = 1.088, so the robot reached UP to pick and the six-frame filmstrip looked
// entirely convincing doing it. Corrected, the cycle now reads
//
//   home 1.088 -> pick 0.616 -> lift 1.214 -> traverse 1.251
//        -> place 0.661 -> withdraw 1.214 -> home 1.088
//
// and returns to (1.109, 1.088, 0.135) at t = DUR, bit for bit the pose it
// started in, so the clip loops without a jump. All 8 tracks bind.
//
// Known limit: the dress pack is rigid. On a real arm the cable loop between
// the base and the upper arm flexes through the whole cycle, and doing that
// properly needs the conduit re-solved per keyframe. Everything that moves here
// is parented to exactly one link, so the loop lives on the forearm where one
// link's motion carries it honestly, and the base cable stops at the turret.
const meta = { name: 'RobotArm', category: 'prop', role: 'hero' };

// Link geometry. `animate()` poses the same chain `build()` assembled, so the
// numbers that define it live at module scope rather than inside either one.
const PLINTH_Y = 0.178; // top of the cast pedestal, where J1 sits
const SHOULDER = [0, 0.455, 0.135]; // J2, relative to J1
const L_UPPER = 0.72; // J2 to J3
const L_FORE = 0.60; // J3 to J5
const L_WRIST = 0.135; // J5 to the tool flange
const JAW_OPEN = 0.062; // jaw centres, fully open
const JAW_SHUT = 0.031;
const JAW_Y = 0.150; // jaw centres above the flange face

// The pose the asset is stored in, and the pose the cycle starts and ends at.
// Reaching forward and slightly down, elbow well bent -- a robot parked at any
// angle looks broken, and a robot standing straight up looks like a lamp post.
const HOME = { j1: 0, j2: -34, j3: -62, j4: 0, j5: -30, j6: 0 };

async function build() {
  const root = createRoot('RobotArm');
  const uv = (g) => autoUnwrap(g, { resolution: 1024 });
  const RAD = Math.PI / 180;

  // ---------- Materials ----------
  // The body enamel. A painted machine is a DIELECTRIC with a clearcoat: the
  // gloss comes from low roughness, not from metalness. Run an orange body at
  // metalness 0.8 and it stops being orange and starts being a mirror that
  // happens to be tinted, which is how a robot ends up looking like a toy made
  // of foil. Metalness stays at zero and the paint stays paint.
  const enamelAlbedo = proceduralTexture({
    schemaVersion: 2, size: 1024, usage: 'albedo', name: 'Enamel',
    layers: [
      { op: 'solid', color: 0xc4550f },
      { op: 'gradient', from: 0xd66a1c, to: 0x97400b, angleDeg: 90, blend: 'overlay', opacity: 0.42 },
      // Orange peel. Real machine enamel is sprayed, not poured, and the very
      // fine texture is most of what stops a large flat casting reading as
      // plastic under a hard light.
      { op: 'noise', colorA: 0xb24c0e, colorB: 0xd2601a, scale: 220, octaves: 4, seed: 7, blend: 'overlay', opacity: 0.28 },
    ],
  });
  const enamel = pbrMaterial({
    albedo: enamelAlbedo,
    normal: normalMapFromHeight(enamelAlbedo, { strength: 0.35 }),
    roughness: 0.43, metalness: 0.0,
  });

  // Machined aluminium: the joint housings, bearing covers and the flange. This
  // one IS metal, and it is the contrast that tells the reader which parts are
  // structure and which are skin.
  const alloyAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Alloy',
    layers: [
      { op: 'solid', color: 0x9aa0a6 },
      { op: 'noise', colorA: 0x848a90, colorB: 0xb2b8be, scale: 130, octaves: 4, seed: 19, blend: 'overlay', opacity: 0.35 },
    ],
  });
  const alloy = pbrMaterial({
    albedo: alloyAlbedo,
    normal: normalMapFromHeight(alloyAlbedo, { strength: 1.1 }),
    roughness: 0.44, metalness: 0.88,
  });

  const steel = gameMaterial(0x6f757b, { roughness: 0.32, metalness: 0.95 });
  // Rubber boots and cable. Dielectric, and rough enough that it never picks up
  // a highlight -- black plastic that shines reads as wet.
  const rubber = gameMaterial(0x232527, { roughness: 0.88, metalness: 0.0 });
  const chainMat = gameMaterial(0x33383d, { roughness: 0.62, metalness: 0.0 });
  const darkTrim = gameMaterial(0x2c2f33, { roughness: 0.55, metalness: 0.1 });
  const beacon = gameMaterial(0xffbe4d, {
    emissive: 0xff9b1a, emissiveIntensity: 2.4, roughness: 0.35,
  });

  // Hazard banding on the pedestal skirt. Real cells put it exactly here, at
  // the height a person walks into.
  const hazard = pbrMaterial({
    albedo: proceduralTexture({
      schemaVersion: 2, size: 512, usage: 'albedo', name: 'Hazard',
      layers: [
        { op: 'solid', color: 0xf0c419 },
        { op: 'stripes', colorA: 0xf0c419, colorB: 0x1b1c1e, count: 22, angleDeg: 52 },
      ],
    }),
    roughness: 0.55, metalness: 0.0,
  });

  const box = async (name, w, h, d, position, mat, opts = {}) =>
    createPart(name, await uv(await roundedBoxGeo(w, h, d, opts.r ?? 0.008), opts.res ?? 512), mat, {
      position, rotation: opts.rotation, parent: opts.parent ?? root,
    });
  const plain = (name, geo, mat, position, parent, rotation) =>
    createPart(name, geo, mat, { position, rotation, parent });

  // A ring of fasteners round a bearing cover. Every joint on a real arm has
  // one, and their absence is the single loudest thing about an untextured
  // robot: the housings look moulded rather than bolted.
  const boltCircle = (name, count, radius, z, mat, parent, y = 0) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      plain(`${name}_${i}`, cylinderZGeo(0.010, 0.010, 0.012, 6), mat,
        [Math.cos(a) * radius, y + Math.sin(a) * radius, z], parent);
    }
  };

  // ---------- Base ----------
  // Anchor plate, pedestal casting and the connector box, all static.
  await box('AnchorPlate', 0.56, 0.030, 0.56, [0, 0.015, 0], darkTrim, { r: 0.010 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      plain(`Anchor_${sx}${sz}`, cylinderGeo(0.020, 0.020, 0.048, 6), steel,
        [sx * 0.235, 0.038, sz * 0.235], root);
    }
  }
  // The base is a SQUAT DRUM, not a taper. The first pass revolved a smooth
  // cone from the anchor plate to the turret and the whole machine read as a
  // traffic cone with an arm on it. A real base is nearly cylindrical, sits on
  // a cast flange, and gets its shape from ribs rather than from draft.
  createPart('Pedestal', await uv(await revolveProfile([
    [0.000, 0.026], [0.266, 0.026], [0.266, 0.050], [0.216, 0.074],
    [0.206, 0.092], [0.204, 0.178], [0.000, 0.178],
  ], { segments: 44, axis: 'y', smooth: true })), enamel, { position: [0, 0, 0], parent: root });
  // Cast ribs round the flange. Six of them, which is what carries the moment
  // out to the anchor bolts and what stops the drum reading as a bucket.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    await box(`BaseRib_${i}`, 0.090, 0.048, 0.026,
      [Math.cos(a) * 0.208, 0.052, Math.sin(a) * 0.208], enamel,
      { r: 0.008, res: 256, rotation: [0, -(a * 180) / Math.PI, 0] });
  }
  // Black skirt at the parting line. Two-tone at the base is the cheapest
  // value break on the whole machine and the one a photograph always shows.
  plain('BaseSkirt', cylinderGeo(0.270, 0.270, 0.030, 44), darkTrim, [0, 0.037, 0], root);
  plain('HazardBand', cylinderGeo(0.208, 0.208, 0.038, 44), hazard, [0, 0.126, 0], root);
  // Controller umbilical: connector panel on the back with cable glands, and
  // the trunk cable running out of frame the way it does in a real cell.
  await box('ConnectorBox', 0.16, 0.17, 0.26, [-0.212, 0.104, 0], darkTrim, { r: 0.014 });
  await box('ConnectorFace', 0.020, 0.13, 0.21, [-0.296, 0.104, 0], steel, { r: 0.005 });
  for (const cz of [-0.072, 0, 0.072]) {
    plain(`Gland_${cz.toFixed(2)}`, cylinderXGeo(0.028, 0.028, 0.062, 12), steel,
      [-0.312, 0.104, cz], root);
    plain(`GlandNut_${cz.toFixed(2)}`, cylinderXGeo(0.034, 0.034, 0.018, 6), alloy,
      [-0.322, 0.104, cz], root);
  }
  plain('Umbilical', capsuleXGeo(0.034, 0.22, 10), rubber, [-0.430, 0.104, 0], root);
  // Corrugation on the trunk, so it reads as flexible conduit and not as pipe.
  for (let i = 0; i < 9; i++) {
    plain(`UmbRib_${i}`, torusGeo(0.036, 0.006, 6, 14), rubber,
      [-0.348 - i * 0.024, 0.104, 0], root, [0, 90, 0]);
  }

  // ---------- J1: waist ----------
  const waist = createPivot('Waist', [0, PLINTH_Y, 0], root);
  // A DRUM, not a cone. The first two passes revolved a continuous taper from
  // the anchor plate to the shoulder, and the whole lower half read as a
  // traffic cone: the eye sees one uninterrupted draft angle and stops
  // believing there is a rotating joint anywhere in it. A real J1 housing is
  // near-cylindrical and the shape comes from the STEP where it meets the base.
  createPart('Turret', await uv(await revolveProfile([
    [0.000, 0.000], [0.198, 0.000], [0.198, 0.226], [0.190, 0.262],
    [0.164, 0.294], [0.000, 0.300],
  ], { segments: 44, axis: 'y', smooth: true })), enamel, { position: [0, 0, 0], parent: waist });
  // The J1 gearbox seam. A turret with no visible joint line looks turned from
  // one billet; the seam is what says it rotates.
  plain('WaistSeam', cylinderGeo(0.206, 0.206, 0.018, 44), darkTrim, [0, 0.006, 0], waist);
  // Cable riser up the back of the turret. It stops at the turret because that
  // is the last link it can be rigidly parented to without lying about how a
  // dress pack behaves across a joint.
  plain('Riser', capsuleGeo(0.030, 0.20, 10), rubber, [-0.176, 0.150, -0.058], waist, [0, 0, -4]);
  for (let i = 0; i < 7; i++) {
    plain(`RiserRib_${i}`, torusGeo(0.032, 0.005, 6, 12), rubber,
      [-0.178 + i * 0.0022, 0.062 + i * 0.030, -0.058], waist, [90, 0, 4]);
  }
  await box('RiserClamp', 0.048, 0.030, 0.052, [-0.174, 0.258, -0.058], alloy,
    { r: 0.006, parent: waist, res: 256 });
  // Shoulder yoke: the casting that carries J2 up and out to one side. The
  // offset is the whole reason a robot can fold its arm past its own base.
  await box('Yoke', 0.30, 0.30, 0.20, [0, 0.360, 0.020], enamel,
    { r: 0.045, parent: waist, res: 1024 });
  plain('YokeBoss', cylinderZGeo(0.118, 0.118, 0.110, 28), darkTrim, [0, 0.455, 0.008], waist);
  boltCircle('YokeBolt', 8, 0.086, 0.066, steel, waist, 0.455);
  // The step where the housing narrows into its top cap. Without a crisp ring
  // here the drum blends into the yoke and the turret reads as one blob.
  plain('TurretStep', cylinderGeo(0.202, 0.202, 0.012, 44), darkTrim, [0, 0.228, 0], waist);
  // Maker's plate. Blank, because proceduralTexture has no text op -- but a
  // machine with nowhere for a serial number to live looks like a render.
  await box('NamePlate', 0.004, 0.052, 0.100, [0.196, 0.150, 0.030], steel,
    { r: 0.001, parent: waist, res: 128 });
  plain('Beacon', sphereGeo(0.040, 14, 8), beacon, [-0.086, 0.318, -0.076], waist);
  plain('BeaconBase', cylinderGeo(0.034, 0.040, 0.030, 12), darkTrim, [-0.086, 0.296, -0.076], waist);

  // ---------- J2: upper arm ----------
  const shoulder = createPivot('Shoulder', SHOULDER, waist);
  shoulder.rotation.z = HOME.j2 * RAD;
  // The casting, as a side silhouette extruded across. An arm modelled as a box
  // reads as scaffolding; what makes it read as a casting is that the section
  // narrows toward the joint it has less load at.
  createPart('UpperArm', await uv(await extrudeProfile([
    [-0.165, -0.070], [0.150, -0.070], [0.132, 0.100], [0.106, 0.380],
    [0.086, L_UPPER], [-0.086, L_UPPER], [-0.106, 0.380], [-0.140, 0.100],
  ], { depth: 0.170, axis: 'z', bevel: 0.016 })), enamel, { position: [0, 0, 0], parent: shoulder });
  // Ribs. Two raised strips down the outer face, which is what a real casting
  // uses instead of thickness.
  for (const sz of [-1, 1]) {
    for (const rx of [-0.054, 0.054]) {
      await box(`ArmRib_${sz}_${rx.toFixed(3)}`, 0.034, 0.58, 0.016, [rx, 0.340, sz * 0.086], enamel,
        { r: 0.007, parent: shoulder, res: 256 });
    }
  }
  plain('ShoulderCover', cylinderZGeo(0.112, 0.112, 0.182, 28), alloy, [0, 0, 0], shoulder);
  boltCircle('ShoulderBolt', 8, 0.082, 0.094, steel, shoulder);
  // The counterweight. Without it the arm is a lever with nothing on the short
  // end and the machine reads as underbuilt -- but hung off the casting as a
  // separate dark brick, as the first pass had it, it reads as luggage. It is
  // part of the SAME casting: enamel body continuous with the arm, and only the
  // machined ballast plates on the back face are a different material.
  await box('CounterHousing', 0.20, 0.185, 0.176, [-0.168, -0.030, 0], enamel,
    { r: 0.026, parent: shoulder, res: 512 });
  for (const px of [-0.252, -0.268]) {
    await box(`Ballast_${px.toFixed(3)}`, 0.016, 0.150, 0.150, [px, -0.030, 0], steel,
      { r: 0.004, parent: shoulder, res: 256 });
  }
  plain('CounterBolt', cylinderXGeo(0.016, 0.016, 0.070, 8), alloy, [-0.282, -0.030, 0], shoulder);

  // ---------- J3: elbow, and J4: forearm roll ----------
  const elbow = createPivot('Elbow', [0, L_UPPER, 0], shoulder);
  elbow.rotation.z = HOME.j3 * RAD;
  plain('ElbowCover', cylinderZGeo(0.100, 0.100, 0.192, 28), darkTrim, [0, 0, 0], elbow);
  boltCircle('ElbowBolt', 8, 0.072, 0.098, steel, elbow);

  const roll = createPivot('Roll', [0, 0, 0], elbow);
  // The J4 barrel. It is a plain cylinder on purpose: a rotating section reads
  // as rotating only if it is a surface of revolution about its own axis, and
  // any feature on it that is not would give the roll away as a cheat.
  plain('RollBarrel', cylinderGeo(0.092, 0.092, 0.180, 28), darkTrim, [0, 0.075, 0], roll);
  plain('RollCollar', cylinderGeo(0.100, 0.100, 0.022, 24), darkTrim, [0, 0.164, 0], roll);
  createPart('ForearmA', await uv(await extrudeProfile([
    [-0.128, 0.170], [0.128, 0.170], [0.116, 0.250], [0.100, 0.360],
    [-0.100, 0.360], [-0.116, 0.250],
  ], { depth: 0.152, axis: 'z', bevel: 0.014 })), enamel, { position: [0, 0, 0], parent: roll });
  createPart('ForearmB', await uv(await extrudeProfile([
    [-0.100, 0.352], [0.100, 0.352], [0.078, 0.480], [0.070, L_FORE],
    [-0.070, L_FORE], [-0.078, 0.480],
  ], { depth: 0.104, axis: 'z', bevel: 0.012 })), enamel, { position: [0, 0, 0], parent: roll });
  for (const sz of [-1, 1]) {
    await box(`ForeRib_${sz}`, 0.026, 0.185, 0.014, [-0.040, 0.262, sz * 0.076], enamel,
      { r: 0.005, parent: roll, res: 256 });
    await box(`ForeRib2_${sz}`, 0.022, 0.210, 0.012, [-0.030, 0.470, sz * 0.052], enamel,
      { r: 0.004, parent: roll, res: 256 });
  }
  // Dress pack: an energy chain clipped along the top of the forearm. Sixteen
  // discrete links rather than a tube, because the thing that makes a cable
  // carrier recognisable is that it is made of repeated rigid links.
  for (let i = 0; i < 16; i++) {
    const f = i / 15;
    const y = 0.190 + f * 0.400;
    const x = 0.118 + Math.sin(f * Math.PI) * 0.022;
    await box(`Chain_${i}`, 0.044, 0.026, 0.070, [x, y, -0.020], chainMat,
      { r: 0.005, parent: roll, res: 256, rotation: [0, 0, -6] });
  }
  plain('ChainAnchor', cylinderZGeo(0.026, 0.026, 0.086, 10), darkTrim, [0.124, 0.180, -0.020], roll);

  // ---------- J5: wrist, J6: flange ----------
  const wrist = createPivot('Wrist', [0, L_FORE, 0], roll);
  wrist.rotation.z = HOME.j5 * RAD;
  await box('WristHousing', 0.142, 0.150, 0.128, [0, 0.028, 0], alloy,
    { r: 0.022, parent: wrist, res: 512 });
  for (const sz of [-1, 1]) {
    plain(`WristBoss_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.058, 0.058, 0.024, 20), alloy,
      [0, 0, sz * 0.062], wrist);
  }
  plain('WristBoot', cylinderGeo(0.062, 0.070, 0.040, 20), rubber, [0, 0.108, 0], wrist);

  const flange = createPivot('Flange', [0, L_WRIST, 0], wrist);
  plain('Flange', cylinderGeo(0.056, 0.056, 0.020, 24), steel, [0, 0.010, 0], flange);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    plain(`FlangeBolt_${i}`, cylinderGeo(0.007, 0.007, 0.026, 6), darkTrim,
      [Math.cos(a) * 0.040, 0.014, Math.sin(a) * 0.040], flange);
  }
  // Tool: a two-finger parallel gripper. In a hero shot the eye lands on the
  // end of the arm and stops there, so the tool carries proportionally more
  // detail than anything else on the machine. The first pass gave it a 98 mm
  // body and it read as a stub -- a real gripper on a 20 kg arm is a fist-sized
  // block with a visible actuator, hoses and hard-anodised fingers.
  plain('ToolChanger', cylinderGeo(0.052, 0.052, 0.046, 24), alloy, [0, 0.043, 0], flange);
  plain('ToolCollar', cylinderGeo(0.058, 0.058, 0.012, 24), steel, [0, 0.062, 0], flange);
  await box('GripperBody', 0.116, 0.092, 0.168, [0, 0.116, 0], alloy,
    { r: 0.014, parent: flange, res: 512 });
  // Pneumatic actuator across the back of the body, and the two hoses that
  // drive it. Fittings are what stop a gripper reading as a moulded blob.
  plain('GripCyl', cylinderZGeo(0.030, 0.030, 0.150, 20), darkTrim, [-0.052, 0.116, 0], flange);
  for (const sz of [-1, 1]) {
    plain(`GripFitting_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.010, 0.010, 0.026, 8), steel,
      [-0.052, 0.116, sz * 0.086], flange);
    plain(`GripHose_${sz > 0 ? 'R' : 'L'}`, capsuleXGeo(0.008, 0.075, 6), rubber,
      [-0.086, 0.086, sz * 0.086], flange, [0, 0, 42]);
  }
  // Sensor block: the little inductive switch that tells the cell the jaws
  // closed. Small, and the kind of thing only present when someone looked.
  await box('GripSensor', 0.024, 0.030, 0.036, [0.062, 0.140, 0.052], darkTrim,
    { r: 0.004, parent: flange, res: 256 });
  plain('GripLed', sphereGeo(0.008, 8, 6), beacon, [0.072, 0.152, 0.052], flange);
  plain('GripRail', cylinderZGeo(0.012, 0.012, 0.172, 14), steel, [0.034, 0.164, 0], flange);
  plain('GripRail2', cylinderZGeo(0.012, 0.012, 0.172, 14), steel, [-0.030, 0.164, 0], flange);

  for (const [nm, sz] of [['JawA', 1], ['JawB', -1]]) {
    const jaw = createPivot(nm, [0, JAW_Y, sz * JAW_OPEN], flange);
    await box(`${nm}_Carriage`, 0.092, 0.052, 0.040, [0, 0.008, 0], alloy,
      { r: 0.007, parent: jaw });
    await box(`${nm}_Finger`, 0.058, 0.112, 0.028, [0, 0.086, sz * -0.008], darkTrim,
      { r: 0.006, parent: jaw });
    // Stepped jaw. A flat finger grips nothing; the step is the part that
    // actually locates a workpiece, and it is the silhouette that says so.
    await box(`${nm}_Step`, 0.040, 0.034, 0.020, [0.006, 0.128, sz * -0.024], darkTrim,
      { r: 0.004, parent: jaw, res: 256 });
    await box(`${nm}_Pad`, 0.044, 0.070, 0.008, [0, 0.078, sz * -0.026], rubber,
      { r: 0.003, parent: jaw, res: 256 });
  }

  return root;
}

// The cycle: pick left, traverse right, place, come home. Written as joint
// angles at times, which is the only thing a rig should ever be given -- the
// tool never appears in this function, because where the tool goes is an
// OUTPUT of the chain, not an input to it. Which is also why the poses below
// have to be checked by reading the flange back out of the posed scene: you
// cannot tell from a column of angles whether the arm is reaching down.
function animate() {
  const DUR = 7.2;

  // Each row is one pose of the whole arm. Reading down a column shows one
  // joint's motion; reading across a row shows the robot at one instant, which
  // is the view that catches a pose that collides with the machine's own base.
  //         t     j1    j2    j3    j4    j5    j6   jaw
  const POSE = [
    [0.00, HOME.j1, HOME.j2, HOME.j3, HOME.j4, HOME.j5, HOME.j6, JAW_OPEN],
    [0.80, -52, -38, -56, 0, -28, -20, JAW_OPEN], // swing over the pick, arm high
    [1.45, -52, -46, -84, 0, -36, -20, JAW_OPEN], // descend onto it
    [1.90, -52, -46, -84, 0, -36, -20, JAW_SHUT], // close
    [2.55, -52, -30, -58, 0, -30, -20, JAW_SHUT], // lift clear
    [3.60, 46, -32, -56, 74, -28, 40, JAW_SHUT], // traverse, rolling the part over
    [4.35, 46, -46, -84, 74, -36, 40, JAW_SHUT], // set down
    [4.80, 46, -46, -84, 74, -36, 40, JAW_OPEN], // release
    [5.45, 46, -30, -58, 74, -30, 40, JAW_OPEN], // withdraw
    [6.50, 8, -34, -60, 12, -30, 6, JAW_OPEN], // sweep back
    [DUR, HOME.j1, HOME.j2, HOME.j3, HOME.j4, HOME.j5, HOME.j6, JAW_OPEN],
  ];

  const at = (col, axis) => POSE.map((p) => ({
    time: p[0],
    rotation: axis === 'y' ? [0, p[col], 0] : [0, 0, p[col]],
  }));

  return [createClip('PickAndPlace', DUR, [
    rotationTrack('Joint_Waist', at(1, 'y')),
    rotationTrack('Joint_Shoulder', at(2, 'z')),
    rotationTrack('Joint_Elbow', at(3, 'z')),
    rotationTrack('Joint_Roll', at(4, 'y')),
    rotationTrack('Joint_Wrist', at(5, 'z')),
    rotationTrack('Joint_Flange', at(6, 'y')),
    // The jaws are the one thing driven by position rather than angle, and the
    // track carries the FULL local position, not an offset from where the pivot
    // was created -- a position track replaces the pivot's transform outright.
    positionTrack('Joint_JawA', POSE.map((p) => ({ time: p[0], position: [0, JAW_Y, p[7]] }))),
    positionTrack('Joint_JawB', POSE.map((p) => ({ time: p[0], position: [0, JAW_Y, -p[7]] }))),
  ])];
}
