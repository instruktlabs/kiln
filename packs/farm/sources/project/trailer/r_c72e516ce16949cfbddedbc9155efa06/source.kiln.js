const meta = {
  name: 'Farm trailer',
  role: 'vehicle',
};

function combineGeometries(items) {
  const allPositions = [];
  const allNormals = [];
  const allUVs = [];
  const allIndices = [];
  let vertexOffset = 0;

  for (const item of items) {
    const g = item.geo.clone();
    if (item.rot) {
      if (item.rot[0]) g.rotateX((item.rot[0] * Math.PI) / 180);
      if (item.rot[1]) g.rotateY((item.rot[1] * Math.PI) / 180);
      if (item.rot[2]) g.rotateZ((item.rot[2] * Math.PI) / 180);
    }
    if (item.pos) {
      g.translate(item.pos[0], item.pos[1], item.pos[2]);
    }

    const pos = g.attributes.position.array;
    const norm = g.attributes.normal ? g.attributes.normal.array : null;
    const uv = g.attributes.uv ? g.attributes.uv.array : null;
    const count = g.attributes.position.count;

    for (let i = 0; i < pos.length; i++) allPositions.push(pos[i]);
    if (norm) {
      for (let i = 0; i < norm.length; i++) allNormals.push(norm[i]);
    }
    if (uv) {
      for (let i = 0; i < uv.length; i++) allUVs.push(uv[i]);
    } else {
      for (let i = 0; i < count; i++) {
        allUVs.push(0, 0);
      }
    }

    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) {
        allIndices.push(idx[i] + vertexOffset);
      }
    } else {
      for (let i = 0; i < count; i++) {
        allIndices.push(i + vertexOffset);
      }
    }
    vertexOffset += count;
  }

  return meshGeo({
    positions: allPositions,
    indices: allIndices,
    normals: allNormals.length === allPositions.length ? allNormals : undefined,
    uvs: allUVs.length === (allPositions.length / 3) * 2 ? allUVs : undefined,
  });
}

function beamGeo(start, end, radius, segments = 8) {
  const p1 = new THREE.Vector3(...start);
  const p2 = new THREE.Vector3(...end);
  const v = new THREE.Vector3().subVectors(p2, p1);
  const len = v.length();
  const dir = v.clone().normalize();
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

  const geo = cylinderGeo(radius, radius, len, segments).clone();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(mat);
  return geo;
}

async function build() {
  const root = createRoot('Trailer');

  // Honey wood material from approved farm project pin
  const honeyWood = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Farm honey wood (subdued grain derivative)',
    baseColor: 16777215,
    roughness: 1,
    metalness: 0,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: {
        kind: 'resource',
        resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.base-color',
      },
      normal: {
        kind: 'resource',
        resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.normal',
      },
      metallicRoughness: {
        kind: 'resource',
        resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.metallic-roughness',
      },
    },
  });

  // Dielectric and metallic materials
  const darkRubber = gameMaterial(0x282926, { roughness: 0.92, metalness: 0, flatShading: true });
  const darkChassisMetal = gameMaterial(0x323330, { roughness: 0.65, metalness: 0.35, flatShading: true });
  const brushedHardware = gameMaterial(0x787a77, { roughness: 0.45, metalness: 0.85, flatShading: true });
  const rimWood = gameMaterial(0xc08a4a, { roughness: 0.75, metalness: 0, flatShading: true });

  // === 1. BED STRUCTURE (Consolidated Static Honey Wood) ===
  const bedWoodItems = [];

  // Bed floor: 2.96m long by 1.54m wide, top at Y = 0.57m
  bedWoodItems.push({ geo: boxGeo(2.96, 0.04, 1.54), pos: [0, 0.55, 0] });

  // Bed floor underside transverse cross-ribs
  const battensX = [-1.25, -0.65, 0, 0.65, 1.25];
  for (let i = 0; i < battensX.length; i++) {
    bedWoodItems.push({ geo: boxGeo(0.08, 0.04, 1.50), pos: [battensX[i], 0.51, 0] });
  }

  // Horizontal wall planks (3 planks high: bottom, middle, top)
  const plankTiers = [
    { y: 0.645, h: 0.15, zThick: 0.060, xThick: 0.060 },
    { y: 0.795, h: 0.15, zThick: 0.056, xThick: 0.056 },
    { y: 0.945, h: 0.15, zThick: 0.060, xThick: 0.060 },
  ];

  // Side walls (Left at Z = -0.74, Right at Z = +0.74)
  for (let p = 0; p < plankTiers.length; p++) {
    const { y, h, zThick } = plankTiers[p];
    bedWoodItems.push({ geo: boxGeo(2.96, h, zThick), pos: [0, y, -0.74] });
    bedWoodItems.push({ geo: boxGeo(2.96, h, zThick), pos: [0, y, 0.74] });
  }

  // End walls (Front at X = +1.45, Rear at X = -1.45)
  for (let p = 0; p < plankTiers.length; p++) {
    const { y, h, xThick } = plankTiers[p];
    bedWoodItems.push({ geo: boxGeo(xThick, h, 1.42), pos: [1.45, y, 0] });
    bedWoodItems.push({ geo: boxGeo(xThick, h, 1.42), pos: [-1.45, y, 0] });
  }

  // 4 Corner Posts & Caps
  const cornerPositions = [
    { name: 'FL', x: 1.45, z: -0.74 },
    { name: 'FR', x: 1.45, z: 0.74 },
    { name: 'BL', x: -1.45, z: -0.74 },
    { name: 'BR', x: -1.45, z: 0.74 },
  ];

  for (const cp of cornerPositions) {
    bedWoodItems.push({ geo: boxGeo(0.11, 0.52, 0.11), pos: [cp.x, 0.79, cp.z] });
    bedWoodItems.push({ geo: boxGeo(0.13, 0.03, 0.13), pos: [cp.x, 1.065, cp.z] });
  }

  // Side center upright posts
  bedWoodItems.push({ geo: boxGeo(0.09, 0.50, 0.04), pos: [0, 0.78, -0.78] });
  bedWoodItems.push({ geo: boxGeo(0.09, 0.50, 0.04), pos: [0, 0.78, 0.78] });

  // End center upright posts
  bedWoodItems.push({ geo: boxGeo(0.04, 0.50, 0.09), pos: [1.49, 0.78, 0] });
  bedWoodItems.push({ geo: boxGeo(0.04, 0.50, 0.09), pos: [-1.49, 0.78, 0] });

  createPart('Bed_Wood', combineGeometries(bedWoodItems), honeyWood, { parent: root });

  // === 2. STATIC BED HARDWARE (Bolts) ===
  const bedHardwareItems = [];
  for (const cp of cornerPositions) {
    bedHardwareItems.push({ geo: cylinderZGeo(0.016, 0.016, 0.13, 6), pos: [cp.x, 0.945, cp.z] });
    bedHardwareItems.push({ geo: cylinderZGeo(0.016, 0.016, 0.13, 6), pos: [cp.x, 0.645, cp.z] });
  }
  bedHardwareItems.push({ geo: cylinderZGeo(0.016, 0.016, 0.08, 6), pos: [0, 0.795, -0.78] });
  bedHardwareItems.push({ geo: cylinderZGeo(0.016, 0.016, 0.08, 6), pos: [0, 0.795, 0.78] });

  createPart('Bed_Hardware', combineGeometries(bedHardwareItems), brushedHardware, { parent: root });

  // === 3. STATIC CHASSIS METAL ===
  const chassisMetalItems = [];
  // Outer sill rails
  chassisMetalItems.push({ geo: boxGeo(2.96, 0.04, 0.04), pos: [0, 0.52, -0.75] });
  chassisMetalItems.push({ geo: boxGeo(2.96, 0.04, 0.04), pos: [0, 0.52, 0.75] });

  // Longitudinal Frame Rails
  chassisMetalItems.push({ geo: boxGeo(2.70, 0.08, 0.06), pos: [0, 0.48, -0.42] });
  chassisMetalItems.push({ geo: boxGeo(2.70, 0.08, 0.06), pos: [0, 0.48, 0.42] });

  // Cross members
  const crossX = [-1.30, -0.85, 0.0, 1.05, 1.30];
  for (let i = 0; i < crossX.length; i++) {
    chassisMetalItems.push({ geo: boxGeo(0.06, 0.06, 0.90), pos: [crossX[i], 0.48, 0] });
  }

  // Rear Axle Assembly (Fixed at X = -0.85m, Y = 0.39m)
  // Axle beam extended to 1.74m to cleanly support matched 2.00m track
  chassisMetalItems.push({ geo: boxGeo(0.07, 0.07, 1.74), pos: [-0.85, 0.39, 0] });
  chassisMetalItems.push({ geo: boxGeo(0.12, 0.04, 0.08), pos: [-0.85, 0.44, -0.42] });
  chassisMetalItems.push({ geo: boxGeo(0.12, 0.04, 0.08), pos: [-0.85, 0.44, 0.42] });
  // Rear Spindles (length 0.18m at Z = ±0.93m, solidly bridging axle beam to wheel hubs)
  chassisMetalItems.push({ geo: cylinderZGeo(0.035, 0.035, 0.18, 8), pos: [-0.85, 0.39, -0.93] });
  chassisMetalItems.push({ geo: cylinderZGeo(0.035, 0.035, 0.18, 8), pos: [-0.85, 0.39, 0.93] });

  // Upper Turntable Bolster
  chassisMetalItems.push({ geo: cylinderGeo(0.22, 0.22, 0.02, 16), pos: [1.05, 0.44, 0] });
  chassisMetalItems.push({ geo: cylinderGeo(0.06, 0.06, 0.04, 12), pos: [1.05, 0.41, 0] });

  createPart('Chassis_Metal', combineGeometries(chassisMetalItems), darkChassisMetal, { parent: root });

  // Rear Wheel Pivots & Wheels (at Z = ±1.00m, wheel track 2.00m)
  const pivotRL = createPivot('Wheel_RL', [-0.85, 0.39, -1.00], root);
  const pivotRR = createPivot('Wheel_RR', [-0.85, 0.39, 1.00], root);

  buildConsolidatedWheel('RL', pivotRL, darkRubber, rimWood, darkChassisMetal, brushedHardware, -1);
  buildConsolidatedWheel('RR', pivotRR, darkRubber, rimWood, darkChassisMetal, brushedHardware, 1);

  // === 4. FRONT STEERABLE ASSEMBLY (Joint_Steer at [1.05, 0.39, 0]) ===
  const jointSteer = createPivot('Steer', [1.05, 0.39, 0], root);

  const steerFrameItems = [];
  // Lower Turntable Plate
  steerFrameItems.push({ geo: cylinderGeo(0.22, 0.22, 0.02, 16), pos: [0, 0.04, 0] });
  // Front Axle Beam (length 1.74m, extending to Z = ±0.87m)
  steerFrameItems.push({ geo: boxGeo(0.07, 0.07, 1.74), pos: [0, 0, 0] });
  // Front Spindles (length 0.18m centered at Z = ±0.93m, extending from ±0.84 to ±1.02m)
  steerFrameItems.push({ geo: cylinderZGeo(0.035, 0.035, 0.18, 8), pos: [0, 0, -0.93] });
  steerFrameItems.push({ geo: cylinderZGeo(0.035, 0.035, 0.18, 8), pos: [0, 0, 0.93] });

  // Tow Bar A-Frame
  steerFrameItems.push({ geo: beamGeo([0, 0.01, -0.34], [0.65, 0.05, 0], 0.038, 8) });
  steerFrameItems.push({ geo: beamGeo([0, 0.01, 0.34], [0.65, 0.05, 0], 0.038, 8) });
  steerFrameItems.push({ geo: beamGeo([0.32, 0.03, -0.17], [0.32, 0.03, 0.17], 0.025, 8) });

  // Center Drawbar Tongue (length 0.60m from X=0.65 to X=1.25)
  steerFrameItems.push({ geo: boxGeo(0.60, 0.07, 0.09), pos: [0.95, 0.075, 0] });

  // Hitch Neck extension terminating cleanly at local X = 1.335
  steerFrameItems.push({ geo: boxGeo(0.13, 0.06, 0.07), pos: [1.27, 0.10, 0] });

  createPart('Steer_Frame', combineGeometries(steerFrameItems), darkChassisMetal, { parent: jointSteer });

  // Front Wheel Pivots (at Z = ±1.00m, wheel track 2.00m, providing generous steering clearance)
  const pivotFL = createPivot('Wheel_FL', [0, 0, -1.00], jointSteer);
  const pivotFR = createPivot('Wheel_FR', [0, 0, 1.00], jointSteer);

  buildConsolidatedWheel('FL', pivotFL, darkRubber, rimWood, darkChassisMetal, brushedHardware, -1);
  buildConsolidatedWheel('FR', pivotFR, darkRubber, rimWood, darkChassisMetal, brushedHardware, 1);

  // === 5. HITCH ASSEMBLY (Joint_Hitch at world [2.45, 0.50, 0] -> local [1.40, 0.11, 0]) ===
  const jointHitch = createPivot('Hitch', [1.40, 0.11, 0], jointSteer);

  // Hitch collar and towing eye ring
  const hitchItems = [
    { geo: torusGeo(0.06, 0.02, 8, 16), rot: [90, 0, 0], pos: [0, 0, 0] },
    { geo: boxGeo(0.03, 0.05, 0.06), pos: [-0.065, 0, 0] },
  ];
  createPart('Hitch_Ring_Assembly', combineGeometries(hitchItems), brushedHardware, { parent: jointHitch });

  return root;
}

function buildConsolidatedWheel(tag, parentJoint, rubberMat, rimMat, hubMat, hardwareMat, sideSign) {
  // 1. Rubber Tire (3 cylinders: main tread + 2 bevels)
  const rubberItems = [
    { geo: cylinderZGeo(0.39, 0.39, 0.14, 16), pos: [0, 0, 0] },
    { geo: cylinderZGeo(0.39, 0.365, 0.02, 16), pos: [0, 0, sideSign * 0.075] },
    { geo: cylinderZGeo(0.365, 0.39, 0.02, 16), pos: [0, 0, -sideSign * 0.075] },
  ];
  createPart(`Wheel_Rubber_${tag}`, combineGeometries(rubberItems), rubberMat, { parent: parentJoint });

  // 2. Ochre Rim Wood (outer rim, rim bowl, inner rim)
  const rimItems = [
    { geo: cylinderZGeo(0.25, 0.25, 0.016, 16), pos: [0, 0, sideSign * 0.082] },
    { geo: cylinderZGeo(0.22, 0.22, 0.02, 16), pos: [0, 0, sideSign * 0.090] },
    { geo: cylinderZGeo(0.24, 0.24, 0.016, 16), pos: [0, 0, -sideSign * 0.082] },
  ];
  createPart(`Wheel_Rim_${tag}`, combineGeometries(rimItems), rimMat, { parent: parentJoint });

  // 3. Central Axle Hub
  const hubItems = [
    { geo: cylinderZGeo(0.085, 0.085, 0.025, 12), pos: [0, 0, sideSign * 0.100] },
    { geo: cylinderZGeo(0.08, 0.08, 0.025, 12), pos: [0, 0, -sideSign * 0.095] },
  ];
  createPart(`Wheel_Hub_${tag}`, combineGeometries(hubItems), hubMat, { parent: parentJoint });

  // 4. Hardware (Axle nut + 5 lug nuts)
  const hardwareItems = [
    { geo: cylinderZGeo(0.045, 0.045, 0.03, 6), pos: [0, 0, sideSign * 0.120] },
  ];
  const lugCount = 5;
  const boltCircleR = 0.15;
  for (let i = 0; i < lugCount; i++) {
    const angle = (i * 2 * Math.PI) / lugCount;
    const lx = Math.cos(angle) * boltCircleR;
    const ly = Math.sin(angle) * boltCircleR;
    hardwareItems.push({ geo: cylinderZGeo(0.015, 0.015, 0.02, 6), pos: [lx, ly, sideSign * 0.102] });
  }
  createPart(`Wheel_Hardware_${tag}`, combineGeometries(hardwareItems), hardwareMat, { parent: parentJoint });
}

function animate(root) {
  const wheelKeyframes = [
    { time: 0.0, rotation: [0, 0, 0] },
    { time: 0.5, rotation: [0, 0, -90] },
    { time: 1.0, rotation: [0, 0, -180] },
    { time: 1.5, rotation: [0, 0, -270] },
    { time: 2.0, rotation: [0, 0, -360] },
  ];

  const wheelsClip = createClip('Wheels', 2.0, [
    rotationTrack('Joint_Wheel_FL', wheelKeyframes),
    rotationTrack('Joint_Wheel_FR', wheelKeyframes),
    rotationTrack('Joint_Wheel_RL', wheelKeyframes),
    rotationTrack('Joint_Wheel_RR', wheelKeyframes),
  ]);

  const steerKeyframes = [
    { time: 0.0, rotation: [0, 0, 0] },
    { time: 0.5, rotation: [0, 7.1, 0] },
    { time: 1.0, rotation: [0, 10.0, 0] },
    { time: 1.5, rotation: [0, 7.1, 0] },
    { time: 2.0, rotation: [0, 0, 0] },
    { time: 2.5, rotation: [0, -7.1, 0] },
    { time: 3.0, rotation: [0, -10.0, 0] },
    { time: 3.5, rotation: [0, -7.1, 0] },
    { time: 4.0, rotation: [0, 0, 0] },
  ];

  const steerClip = createClip('Steer', 4.0, [
    rotationTrack('Joint_Steer', steerKeyframes),
  ]);

  return [wheelsClip, steerClip];
}
