const meta = {
  name: 'Farm trailer',
  role: 'vehicle',
};

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

  // === 1. BED STRUCTURE (Static, attached to root) ===
  // Bed floor: 2.96m long by 1.54m wide, top at Y = 0.57m
  createPart('Bed_Floor', boxGeo(2.96, 0.04, 1.54), honeyWood, {
    position: [0, 0.55, 0],
    parent: root,
  });

  // Bed floor underside transverse cross-ribs
  const battensX = [-1.25, -0.65, 0, 0.65, 1.25];
  for (let i = 0; i < battensX.length; i++) {
    createPart(`Bed_Batten_${i}`, boxGeo(0.08, 0.04, 1.50), honeyWood, {
      position: [battensX[i], 0.51, 0],
      parent: root,
    });
  }

  // Horizontal wall planks (3 planks high: bottom, middle, top)
  // Middle plank is slightly inset (2mm) to give clean readable seam grooves without open holes!
  const plankTiers = [
    { y: 0.645, h: 0.15, zThick: 0.060, xThick: 0.060 },
    { y: 0.795, h: 0.15, zThick: 0.056, xThick: 0.056 },
    { y: 0.945, h: 0.15, zThick: 0.060, xThick: 0.060 },
  ];

  // Side walls (Left at Z = -0.74, Right at Z = +0.74)
  for (let p = 0; p < plankTiers.length; p++) {
    const { y, h, zThick } = plankTiers[p];
    createPart(`Bed_Plank_L_${p}`, boxGeo(2.96, h, zThick), honeyWood, {
      position: [0, y, -0.74],
      parent: root,
    });
    createPart(`Bed_Plank_R_${p}`, boxGeo(2.96, h, zThick), honeyWood, {
      position: [0, y, 0.74],
      parent: root,
    });
  }

  // End walls (Front at X = +1.45, Rear at X = -1.45)
  for (let p = 0; p < plankTiers.length; p++) {
    const { y, h, xThick } = plankTiers[p];
    createPart(`Bed_Plank_F_${p}`, boxGeo(xThick, h, 1.42), honeyWood, {
      position: [1.45, y, 0],
      parent: root,
    });
    createPart(`Bed_Plank_B_${p}`, boxGeo(xThick, h, 1.42), honeyWood, {
      position: [-1.45, y, 0],
      parent: root,
    });
  }

  // 4 Corner Posts (square timber posts with chamfered caps)
  const cornerPositions = [
    { name: 'FL', x: 1.45, z: -0.74 },
    { name: 'FR', x: 1.45, z: 0.74 },
    { name: 'BL', x: -1.45, z: -0.74 },
    { name: 'BR', x: -1.45, z: 0.74 },
  ];

  for (const cp of cornerPositions) {
    createPart(`Bed_Post_${cp.name}`, boxGeo(0.11, 0.52, 0.11), honeyWood, {
      position: [cp.x, 0.79, cp.z],
      parent: root,
    });
    // Chamfered cap
    createPart(`Bed_Cap_${cp.name}`, boxGeo(0.13, 0.03, 0.13), honeyWood, {
      position: [cp.x, 1.065, cp.z],
      parent: root,
    });
    // Carriage bolts on corner posts
    createPart(`Bolt_${cp.name}_Top`, cylinderZGeo(0.016, 0.016, 0.13, 6), brushedHardware, {
      position: [cp.x, 0.945, cp.z],
      parent: root,
    });
    createPart(`Bolt_${cp.name}_Bot`, cylinderZGeo(0.016, 0.016, 0.13, 6), brushedHardware, {
      position: [cp.x, 0.645, cp.z],
      parent: root,
    });
  }

  // Side center upright posts
  createPart('Bed_SidePost_L', boxGeo(0.09, 0.50, 0.04), honeyWood, {
    position: [0, 0.78, -0.78],
    parent: root,
  });
  createPart('Bed_SidePost_R', boxGeo(0.09, 0.50, 0.04), honeyWood, {
    position: [0, 0.78, 0.78],
    parent: root,
  });
  // Center post bolts
  createPart('Bolt_Side_L', cylinderZGeo(0.016, 0.016, 0.08, 6), brushedHardware, {
    position: [0, 0.795, -0.78],
    parent: root,
  });
  createPart('Bolt_Side_R', cylinderZGeo(0.016, 0.016, 0.08, 6), brushedHardware, {
    position: [0, 0.795, 0.78],
    parent: root,
  });

  // End center upright posts
  createPart('Bed_EndPost_F', boxGeo(0.04, 0.50, 0.09), honeyWood, {
    position: [1.49, 0.78, 0],
    parent: root,
  });
  createPart('Bed_EndPost_B', boxGeo(0.04, 0.50, 0.09), honeyWood, {
    position: [-1.49, 0.78, 0],
    parent: root,
  });

  // Outer sill rails under the bed sides (black steel angles framing the box bottom)
  createPart('Chassis_Sill_L', boxGeo(2.96, 0.04, 0.04), darkChassisMetal, {
    position: [0, 0.52, -0.75],
    parent: root,
  });
  createPart('Chassis_Sill_R', boxGeo(2.96, 0.04, 0.04), darkChassisMetal, {
    position: [0, 0.52, 0.75],
    parent: root,
  });

  // === 2. CHASSIS / SUBFRAME (Static, attached to root) ===
  // Longitudinal Frame Rails
  createPart('Chassis_Rail_L', boxGeo(2.70, 0.08, 0.06), darkChassisMetal, {
    position: [0, 0.48, -0.42],
    parent: root,
  });
  createPart('Chassis_Rail_R', boxGeo(2.70, 0.08, 0.06), darkChassisMetal, {
    position: [0, 0.48, 0.42],
    parent: root,
  });

  // Cross members
  const crossX = [-1.30, -0.85, 0.0, 1.05, 1.30];
  for (let i = 0; i < crossX.length; i++) {
    createPart(`Chassis_Cross_${i}`, boxGeo(0.06, 0.06, 0.90), darkChassisMetal, {
      position: [crossX[i], 0.48, 0],
      parent: root,
    });
  }

  // Rear Axle Assembly (Fixed at X = -0.85m, Y = 0.39m)
  createPart('RearAxle_Beam', boxGeo(0.07, 0.07, 1.56), darkChassisMetal, {
    position: [-0.85, 0.39, 0],
    parent: root,
  });
  // Axle mounts / bolster blocks to chassis
  createPart('RearAxle_Mount_L', boxGeo(0.12, 0.04, 0.08), darkChassisMetal, {
    position: [-0.85, 0.44, -0.42],
    parent: root,
  });
  createPart('RearAxle_Mount_R', boxGeo(0.12, 0.04, 0.08), darkChassisMetal, {
    position: [-0.85, 0.44, 0.42],
    parent: root,
  });
  // Spindles
  createPart('RearAxle_Spindle_L', cylinderZGeo(0.035, 0.035, 0.16, 8), darkChassisMetal, {
    position: [-0.85, 0.39, -0.84],
    parent: root,
  });
  createPart('RearAxle_Spindle_R', cylinderZGeo(0.035, 0.035, 0.16, 8), darkChassisMetal, {
    position: [-0.85, 0.39, 0.84],
    parent: root,
  });

  // Upper Turntable Bolster (at X = 1.05m, Y = 0.44m)
  createPart('Turntable_Upper', cylinderGeo(0.22, 0.22, 0.02, 16), darkChassisMetal, {
    position: [1.05, 0.44, 0],
    parent: root,
  });
  createPart('Turntable_KingpinBoss', cylinderGeo(0.06, 0.06, 0.04, 12), darkChassisMetal, {
    position: [1.05, 0.41, 0],
    parent: root,
  });

  // Rear Wheel Pivots & Wheels (at Z = ±0.91m)
  const pivotRL = createPivot('Wheel_RL', [-0.85, 0.39, -0.91], root);
  const pivotRR = createPivot('Wheel_RR', [-0.85, 0.39, 0.91], root);

  buildWheel('RL', pivotRL, darkRubber, rimWood, darkChassisMetal, brushedHardware, -1);
  buildWheel('RR', pivotRR, darkRubber, rimWood, darkChassisMetal, brushedHardware, 1);

  // === 3. FRONT STEERABLE ASSEMBLY (Joint_Steer at [1.05, 0.39, 0]) ===
  const jointSteer = createPivot('Steer', [1.05, 0.39, 0], root);

  // Lower Turntable Plate
  createPart('Turntable_Lower', cylinderGeo(0.22, 0.22, 0.02, 16), darkChassisMetal, {
    position: [0, 0.04, 0],
    parent: jointSteer,
  });

  // Front Axle Beam
  createPart('FrontAxle_Beam', boxGeo(0.07, 0.07, 1.56), darkChassisMetal, {
    position: [0, 0, 0],
    parent: jointSteer,
  });
  // Spindles
  createPart('FrontAxle_Spindle_L', cylinderZGeo(0.035, 0.035, 0.16, 8), darkChassisMetal, {
    position: [0, 0, -0.84],
    parent: jointSteer,
  });
  createPart('FrontAxle_Spindle_R', cylinderZGeo(0.035, 0.035, 0.16, 8), darkChassisMetal, {
    position: [0, 0, 0.84],
    parent: jointSteer,
  });

  // Front Wheel Pivots (at local Z = ±0.91m)
  const pivotFL = createPivot('Wheel_FL', [0, 0, -0.91], jointSteer);
  const pivotFR = createPivot('Wheel_FR', [0, 0, 0.91], jointSteer);

  buildWheel('FL', pivotFL, darkRubber, rimWood, darkChassisMetal, brushedHardware, -1);
  buildWheel('FR', pivotFR, darkRubber, rimWood, darkChassisMetal, brushedHardware, 1);

  // Tow Bar A-Frame
  beamBetween('TowBar_Diagonal_L', [0, 0.01, -0.34], [0.65, 0.05, 0], 0.038, darkChassisMetal, {
    parent: jointSteer,
    segments: 8,
  });
  beamBetween('TowBar_Diagonal_R', [0, 0.01, 0.34], [0.65, 0.05, 0], 0.038, darkChassisMetal, {
    parent: jointSteer,
    segments: 8,
  });
  beamBetween('TowBar_CrossBrace', [0.32, 0.03, -0.17], [0.32, 0.03, 0.17], 0.025, darkChassisMetal, {
    parent: jointSteer,
    segments: 8,
  });

  // Center Drawbar Tongue
  createPart('TowBar_Tongue', boxGeo(0.70, 0.07, 0.09), darkChassisMetal, {
    position: [0.98, 0.075, 0],
    parent: jointSteer,
  });
  // Hitch Neck extension
  createPart('TowBar_Neck', boxGeo(0.16, 0.06, 0.07), darkChassisMetal, {
    position: [1.33, 0.10, 0],
    parent: jointSteer,
  });

  // Joint_Hitch at world [2.45, 0.50, 0] -> local to jointSteer is [1.40, 0.11, 0]
  const jointHitch = createPivot('Hitch', [1.40, 0.11, 0], jointSteer);

  // Towing Eye / Ring Loop at hitch tip (centered at Joint_Hitch)
  createPart('Hitch_Ring', torusGeo(0.06, 0.02, 8, 16), brushedHardware, {
    position: [0, 0, 0],
    rotation: [90, 0, 0],
    parent: jointHitch,
  });
  createPart('Hitch_Collar', boxGeo(0.05, 0.05, 0.06), brushedHardware, {
    position: [-0.045, 0, 0],
    parent: jointHitch,
  });

  return root;
}

function buildWheel(tag, parentJoint, rubberMat, rimMat, hubMat, hardwareMat, sideSign) {
  // 1. Chunky faceted tire (outer radius 0.39m, width 0.18m, 16 facets)
  // Main tread band
  createPart(`Tire_${tag}`, cylinderZGeo(0.39, 0.39, 0.14, 16), rubberMat, {
    position: [0, 0, 0],
    parent: parentJoint,
  });
  // Chamfered shoulder rings (tapering to 0.37m radius)
  createPart(`TireBevel_Out_${tag}`, cylinderZGeo(0.39, 0.365, 0.02, 16), rubberMat, {
    position: [0, 0, sideSign * 0.075],
    parent: parentJoint,
  });
  createPart(`TireBevel_In_${tag}`, cylinderZGeo(0.365, 0.39, 0.02, 16), rubberMat, {
    position: [0, 0, -sideSign * 0.075],
    parent: parentJoint,
  });

  // 2. Honey-wood / ochre wheel rim (radius 0.25m)
  // Prominently placed on the outer face so it stands out proudly!
  createPart(`Rim_Out_${tag}`, cylinderZGeo(0.25, 0.25, 0.016, 16), rimMat, {
    position: [0, 0, sideSign * 0.082],
    parent: parentJoint,
  });
  createPart(`Rim_Bowl_${tag}`, cylinderZGeo(0.22, 0.22, 0.02, 16), rimMat, {
    position: [0, 0, sideSign * 0.090],
    parent: parentJoint,
  });
  // Inner rim disc
  createPart(`Rim_In_${tag}`, cylinderZGeo(0.24, 0.24, 0.016, 16), rimMat, {
    position: [0, 0, -sideSign * 0.082],
    parent: parentJoint,
  });

  // 3. Central axle hub
  createPart(`Hub_${tag}`, cylinderZGeo(0.085, 0.085, 0.025, 12), hubMat, {
    position: [0, 0, sideSign * 0.100],
    parent: parentJoint,
  });
  createPart(`Hub_In_${tag}`, cylinderZGeo(0.08, 0.08, 0.025, 12), hubMat, {
    position: [0, 0, -sideSign * 0.095],
    parent: parentJoint,
  });

  // 4. Large hexagonal axle nut
  createPart(`Nut_${tag}`, cylinderZGeo(0.045, 0.045, 0.03, 6), hardwareMat, {
    position: [0, 0, sideSign * 0.120],
    parent: parentJoint,
  });

  // 5. 5 Lug nuts on bolt circle radius 0.15m
  const lugCount = 5;
  const boltCircleR = 0.15;
  for (let i = 0; i < lugCount; i++) {
    const angle = (i * 2 * Math.PI) / lugCount;
    const lx = Math.cos(angle) * boltCircleR;
    const ly = Math.sin(angle) * boltCircleR;
    createPart(`Lug_${tag}_${i}`, cylinderZGeo(0.015, 0.015, 0.02, 6), hardwareMat, {
      position: [lx, ly, sideSign * 0.102],
      parent: parentJoint,
    });
  }
}

function animate(root) {
  // Implied travel speed calculation:
  // Wheel radius R = 0.39m.
  // Wheel circumference C = 2 * Math.PI * 0.39 = 2.450442m.
  // Clip duration = 2.0s.
  // Implied travel speed v = 2.450442 / 2.0 = 1.2252 m/s (~4.41 km/h).
  // Rolling forward along +X is negative rotation around Z axis.
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

  // Steer clip: smoothly traverses left (+10°), center (0°), right (-10°), returning to center (0°).
  // Y-axis yaw on Joint_Steer.
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
