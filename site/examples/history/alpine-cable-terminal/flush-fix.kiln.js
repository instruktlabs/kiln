// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Alpine Cable-Car Terminal',
  category: 'architecture',
  role: 'building'
};

async function build() {
  const root = createRoot('AlpineCableTerminal');

  // Materials
  const matPineRoof = gameMaterial(0x244f38, { roughness: 0.45, metalness: 0.15 });
  const matRoofTrim = gameMaterial(0x1a3828, { roughness: 0.55, metalness: 0.2 });
  const matWarmWood = gameMaterial(0x9a5d32, { roughness: 0.8, metalness: 0.05 });
  const matTimberBeam = gameMaterial(0x824c25, { roughness: 0.75, metalness: 0.05 });
  const matDeckWood = gameMaterial(0xb57848, { roughness: 0.85, metalness: 0.02 });
  const matConcrete = gameMaterial(0x85888a, { roughness: 0.9, metalness: 0.05 });
  const matSteelGantry = gameMaterial(0x353a40, { roughness: 0.45, metalness: 0.65 });
  const matSteelPulleys = gameMaterial(0x525a62, { roughness: 0.35, metalness: 0.75 });
  const matBullwheelSteel = gameMaterial(0x485058, { roughness: 0.35, metalness: 0.75 });
  const matCableSteel = gameMaterial(0x282b2f, { roughness: 0.3, metalness: 0.85 });
  const matGondolaRed = gameMaterial(0xc92222, { roughness: 0.3, metalness: 0.15 });
  const matGondolaTrim = gameMaterial(0x1e2022, { roughness: 0.6, metalness: 0.2 });
  const matGondolaHanger = gameMaterial(0x32373e, { roughness: 0.4, metalness: 0.7 });
  const matGondolaGlass = glassMaterial(0x88ccdd, { opacity: 0.4, roughness: 0.1, metalness: 0.15 });
  const matSafetyYellow = gameMaterial(0xdf9c24, { roughness: 0.45, metalness: 0.2 });

  // 1. Foundation & Boarding Platform
  // Concrete Base Plinth
  const plinthGeo = await roundedBoxGeo(7.0, 0.42, 4.8, 0.05);
  createPart('FoundationPlinth', plinthGeo, matConcrete, {
    position: [0.2, 0.21, 0],
    parent: root
  });

  // Access steps at the rear (-X)
  const step1 = boxGeo(0.6, 0.14, 2.2);
  createPart('AccessStep1', step1, matConcrete, { position: [-3.4, 0.07, 0], parent: root });
  const step2 = boxGeo(0.5, 0.28, 2.2);
  createPart('AccessStep2', step2, matConcrete, { position: [-3.05, 0.14, 0], parent: root });

  // Timber Boarding Platform Deck
  const deckMainGeo = boxGeo(5.8, 0.06, 4.2);
  createPart('BoardingDeck', deckMainGeo, matDeckWood, {
    position: [0.2, 0.45, 0],
    parent: root
  });

  // Platform deck planks
  for (let i = -10; i <= 10; i++) {
    const plankZ = i * 0.19;
    if (Math.abs(plankZ) <= 1.95) {
      const plankGeo = boxGeo(5.75, 0.015, 0.17);
      createPart(`DeckPlank_${i + 10}`, plankGeo, (i % 2 === 0) ? matDeckWood : matWarmWood, {
        position: [0.2, 0.485, plankZ],
        parent: root
      });
    }
  }

  // Yellow safety warning strip along the boarding edge
  const safetyLineGeo = boxGeo(5.2, 0.02, 0.08);
  createPart('PlatformSafetyLine', safetyLineGeo, matSafetyYellow, {
    position: [0.2, 0.495, -0.28],
    parent: root
  });

  // Perimeter Curb / Deck Border
  const curbGeoN = boxGeo(5.84, 0.08, 0.12);
  createPart('DeckCurb_Right', curbGeoN, matTimberBeam, { position: [0.2, 0.48, 2.05], parent: root });
  const curbGeoS = boxGeo(5.84, 0.08, 0.12);
  createPart('DeckCurb_Left', curbGeoS, matTimberBeam, { position: [0.2, 0.48, -2.05], parent: root });

  // Safety Railings on Right Side (+Z)
  const numPosts = 7;
  for (let i = 0; i < numPosts; i++) {
    const px = -2.6 + i * 0.9;
    const postGeo = boxGeo(0.08, 0.95, 0.08);
    createPart(`RailingPost_${i}`, postGeo, matWarmWood, {
      position: [px, 0.95, 2.0],
      parent: root
    });
  }
  const topRailGeo = boxGeo(5.5, 0.05, 0.1);
  createPart('RailingTopRail_Right', topRailGeo, matWarmWood, {
    position: [0.1, 1.4, 2.0],
    parent: root
  });
  const midRailGeo = boxGeo(5.5, 0.04, 0.04);
  createPart('RailingMidRail_Right', midRailGeo, matSteelGantry, {
    position: [0.1, 0.95, 2.0],
    parent: root
  });
  for (let i = 0; i < 26; i++) {
    const bx = -2.5 + i * 0.21;
    const spindleGeo = cylinderYGeo(0.012, 0.012, 0.85, 8);
    createPart(`RailingSpindle_${i}`, spindleGeo, matSteelGantry, {
      position: [bx, 0.95, 2.0],
      parent: root
    });
  }

  // 2. Timber Structural Frame & Bents
  const bentX = [-2.4, -1.0, 0.4, 2.4];
  bentX.forEach((bx, idx) => {
    const shoeL = boxGeo(0.24, 0.12, 0.24);
    createPart(`BentShoeL_${idx}`, shoeL, matSteelGantry, { position: [bx, 0.54, -1.9], parent: root });
    const shoeR = boxGeo(0.24, 0.12, 0.24);
    createPart(`BentShoeR_${idx}`, shoeR, matSteelGantry, { position: [bx, 0.54, 1.9], parent: root });

    const colGeo = boxGeo(0.2, 3.2, 0.2);
    createPart(`BentColL_${idx}`, colGeo, matWarmWood, { position: [bx, 2.15, -1.9], parent: root });
    createPart(`BentColR_${idx}`, colGeo, matWarmWood, { position: [bx, 2.15, 1.9], parent: root });

    const tieBeamGeo = boxGeo(0.18, 0.22, 4.0);
    createPart(`BentTieBeam_${idx}`, tieBeamGeo, matWarmWood, { position: [bx, 3.65, 0], parent: root });

    const braceGeo = boxGeo(0.12, 0.85, 0.12);
    createPart(`BentBraceL_${idx}`, braceGeo, matTimberBeam, {
      position: [bx, 3.35, -1.5],
      rotation: [0, 0, 45],
      parent: root
    });
    createPart(`BentBraceR_${idx}`, braceGeo, matTimberBeam, {
      position: [bx, 3.35, 1.5],
      rotation: [0, 0, -45],
      parent: root
    });

    // Curved Glulam Arch supporting roof (bents 0, 1, 2)
    if (idx < 3) {
      for (let s = 0; s < 10; s++) {
        const z0 = -2.1 + s * 0.42;
        const z1 = z0 + 0.42;
        const zm = (z0 + z1) * 0.5;
        const ym = 4.28 - 0.185 * zm * zm;
        const slope = -0.37 * zm;
        const angleDeg = Math.atan(slope) * (180 / Math.PI);
        const segLen = Math.hypot(0.42, slope * 0.42) * 1.02;
        const archSegGeo = boxGeo(0.16, 0.18, segLen);
        createPart(`GlulamArch_${idx}_${s}`, archSegGeo, matWarmWood, {
          position: [bx, ym - 0.09, zm],
          rotation: [-angleDeg, 0, 0],
          parent: root
        });
      }
    }
  });

  // Longitudinal Timber Purlins
  const purlinZ = [-1.8, -0.9, 0, 0.9, 1.8];
  purlinZ.forEach((pz, pIdx) => {
    const py = 4.25 - 0.185 * pz * pz;
    const purlinGeo = boxGeo(3.8, 0.12, 0.12);
    createPart(`Purlin_${pIdx}`, purlinGeo, matTimberBeam, {
      position: [-1.5, py - 0.06, pz],
      parent: root
    });
  });

  // 3. Curved Roof Canopy
  const roofTop = parametricSurface(
    (u, v) => [u, 4.45 - 0.185 * v * v + 0.03 * Math.cos(u * 0.8), v],
    { u: [-3.4, 0.4], v: [-2.45, 2.45], uSegments: 28, vSegments: 26, orientation: 'vu' }
  );
  createPart('RoofOuterShell', roofTop, matPineRoof, { parent: root });

  const roofSoffit = parametricSurface(
    (u, v) => [u, 4.32 - 0.185 * v * v + 0.03 * Math.cos(u * 0.8), v],
    { u: [-3.38, 0.38], v: [-2.42, 2.42], uSegments: 28, vSegments: 26, orientation: 'uv' }
  );
  createPart('RoofTimberSoffit', roofSoffit, matWarmWood, { parent: root });

  // Crafted End Gable Bargeboards
  [-3.4, 0.4].forEach((gx, gIdx) => {
    for (let s = 0; s < 12; s++) {
      const z0 = -2.4 + s * 0.4;
      const z1 = z0 + 0.4;
      const zm = (z0 + z1) * 0.5;
      const ym = 4.44 - 0.185 * zm * zm;
      const slope = -0.37 * zm;
      const angleDeg = Math.atan(slope) * (180 / Math.PI);
      const segLen = Math.hypot(0.4, slope * 0.4) * 1.04;
      const bargeGeo = boxGeo(0.08, 0.16, segLen);
      createPart(`GableArch_${gIdx}_${s}`, bargeGeo, matWarmWood, {
        position: [gx, ym - 0.06, zm],
        rotation: [-angleDeg, 0, 0],
        parent: root
      });
    }
  });

  // Fascia boards
  for (let s = 0; s < 9; s++) {
    const ux = -3.3 + s * 0.41;
    const uMid = ux + 0.205;
    const yL = 4.38 - 0.185 * 2.45 * 2.45 + 0.03 * Math.cos(uMid * 0.8);
    const fasciaL = boxGeo(0.42, 0.18, 0.08);
    createPart(`FasciaL_${s}`, fasciaL, matRoofTrim, {
      position: [uMid, yL, -2.46],
      parent: root
    });
    const fasciaR = boxGeo(0.42, 0.18, 0.08);
    createPart(`FasciaR_${s}`, fasciaR, matRoofTrim, {
      position: [uMid, yL, 2.46],
      parent: root
    });
  }

  // Standing Seam ribs
  const seamZ = [-2.0, -1.0, 0, 1.0, 2.0];
  seamZ.forEach((sz, sIdx) => {
    for (let k = 0; k < 6; k++) {
      const kx = -3.2 + k * 0.6;
      const kMid = kx + 0.3;
      const ky = 4.46 - 0.185 * sz * sz + 0.03 * Math.cos(kMid * 0.8);
      const seamGeo = boxGeo(0.61, 0.04, 0.03);
      createPart(`RoofSeam_${sIdx}_${k}`, seamGeo, matRoofTrim, {
        position: [kMid, ky + 0.02, sz],
        parent: root
      });
    }
  });

  // 4. Overhead Steel Machinery Gantry
  const gantryBeam1 = boxGeo(3.2, 0.22, 0.12);
  createPart('GantryBeam_Left', gantryBeam1, matSteelGantry, { position: [1.4, 3.5, -0.65], parent: root });
  const gantryBeam2 = boxGeo(3.2, 0.22, 0.12);
  createPart('GantryBeam_Right', gantryBeam2, matSteelGantry, { position: [1.4, 3.5, 0.65], parent: root });

  const crossGantry1 = boxGeo(0.174, 0.24, 2.6);
  createPart('GantryCross_Rear', crossGantry1, matSteelGantry, { position: [0.4, 3.52, 0], parent: root });
  const crossGantry2 = boxGeo(0.22, 0.26, 2.6);
  createPart('GantryCross_Center', crossGantry2, matSteelGantry, { position: [1.2, 3.52, 0], parent: root });
  const crossGantry3 = boxGeo(0.174, 0.24, 2.6);
  createPart('GantryCross_Front', crossGantry3, matSteelGantry, { position: [2.4, 3.52, 0], parent: root });

  const spindleMount = boxGeo(0.48, 0.32, 0.48);
  createPart('BullwheelSpindleMount', spindleMount, matSteelGantry, { position: [1.2, 3.36, 0], parent: root });

  // 5. Exposed Pulley Assembly & Bullwheel
  const bullwheelPivot = createPivot('Bullwheel', [1.2, 3.16, 0], root);

  const bwHub = cylinderYGeo(0.28, 0.32, 0.24, 24);
  createPart('BullwheelHub', bwHub, matBullwheelSteel, { position: [0, 0, 0], parent: bullwheelPivot });
  const bwBearingCap = cylinderYGeo(0.18, 0.22, 0.1, 20);
  createPart('BullwheelBearingCap', bwBearingCap, matSafetyYellow, { position: [0, 0.16, 0], parent: bullwheelPivot });

  const bwOuterRing = torusGeo(1.15, 0.055, 12, 36);
  createPart('BullwheelOuterRing', bwOuterRing, matBullwheelSteel, {
    position: [0, 0, 0],
    rotation: [90, 0, 0],
    parent: bullwheelPivot
  });
  const bwFlangeTop = cylinderYGeo(1.18, 1.18, 0.025, 36);
  createPart('BullwheelFlangeTop', bwFlangeTop, matBullwheelSteel, { position: [0, 0.04, 0], parent: bullwheelPivot });
  const bwFlangeBot = cylinderYGeo(1.18, 1.18, 0.025, 36);
  createPart('BullwheelFlangeBot', bwFlangeBot, matBullwheelSteel, { position: [0, -0.04, 0], parent: bullwheelPivot });

  for (let sp = 0; sp < 8; sp++) {
    const spAngle = sp * 45;
    const spokeGeo = boxGeo(0.86, 0.06, 0.08);
    createPart(`BullwheelSpoke_${sp}`, spokeGeo, matBullwheelSteel, {
      position: [0.58 * Math.cos(spAngle * Math.PI / 180), 0, 0.58 * Math.sin(spAngle * Math.PI / 180)],
      rotation: [0, -spAngle, 0],
      parent: bullwheelPivot
    });
  }

  const motorGeo = cylinderYGeo(0.22, 0.22, 0.45, 16);
  createPart('DriveMotor', motorGeo, matSteelGantry, { position: [1.2, 3.82, 0], parent: root });
  const motorBox = boxGeo(0.5, 0.25, 0.45);
  createPart('DriveGearbox', motorBox, matSteelGantry, { position: [1.2, 3.65, 0], parent: root });

  [-1.15, 1.15].forEach((sz, bIdx) => {
    const rockerBeam = boxGeo(1.1, 0.09, 0.08);
    createPart(`SheaveRocker_${bIdx}`, rockerBeam, matSteelGantry, { position: [2.4, 3.32, sz], parent: root });
    const hangerStrut = boxGeo(0.08, 0.22, 0.08);
    createPart(`SheaveHanger_${bIdx}`, hangerStrut, matSteelGantry, { position: [2.4, 3.44, sz], parent: root });

    for (let r = 0; r < 4; r++) {
      const rx = 2.05 + r * 0.24;
      const rollerGeo = cylinderZGeo(0.14, 0.14, 0.06, 16);
      createPart(`RollerSheave_${bIdx}_${r}`, rollerGeo, matSteelPulleys, {
        position: [rx, 3.2, sz],
        parent: root
      });
      const rollerHub = cylinderZGeo(0.04, 0.04, 0.09, 12);
      createPart(`RollerHub_${bIdx}_${r}`, rollerHub, matSafetyYellow, {
        position: [rx, 3.2, sz],
        parent: root
      });
    }
  });

  // Haul Rope
  const loopStations = [];
  for (let a = 0; a <= 18; a++) {
    const ang = Math.PI * 0.5 + (Math.PI * a / 18);
    loopStations.push([1.2 + 1.15 * Math.cos(ang), 3.16, 1.15 * Math.sin(ang)]);
  }
  const cableCircleProfile = [];
  for (let c = 0; c < 8; c++) {
    const ca = c * Math.PI / 4;
    cableCircleProfile.push([0.018 * Math.cos(ca), 0.018 * Math.sin(ca)]);
  }
  const cableLoopGeo = sweepProfile(cableCircleProfile, loopStations, { cap: false, up: [0, 1, 0] });
  createPart('CableReturnLoop', cableLoopGeo, matCableSteel, { parent: root });

  const leftCable = cylinderXGeo(0.018, 0.018, 4.2, 12);
  createPart('CableTrack_Left', leftCable, matCableSteel, { position: [3.3, 3.16, -1.15], parent: root });
  const rightCable = cylinderXGeo(0.018, 0.018, 4.2, 12);
  createPart('CableTrack_Right', rightCable, matCableSteel, { position: [3.3, 3.16, 1.15], parent: root });

  // 6. Suspended Red Alpine Gondola
  const gondolaPivot = createPivot('GondolaSuspension', [-0.9, 3.16, -1.15], root);

  const gripBody = boxGeo(0.32, 0.14, 0.14);
  createPart('GondolaGripBody', gripBody, matGondolaTrim, { position: [0, 0, 0], parent: gondolaPivot });
  const gripSpring = cylinderXGeo(0.05, 0.05, 0.22, 12);
  createPart('GripSpringBox', gripSpring, matSafetyYellow, { position: [0, 0.08, 0], parent: gondolaPivot });
  const gripRoller1 = cylinderZGeo(0.045, 0.045, 0.04, 12);
  createPart('GripGuideRoller1', gripRoller1, matSteelPulleys, { position: [-0.12, 0.06, 0.09], parent: gondolaPivot });
  const gripRoller2 = cylinderZGeo(0.045, 0.045, 0.04, 12);
  createPart('GripGuideRoller2', gripRoller2, matSteelPulleys, { position: [0.12, 0.06, 0.09], parent: gondolaPivot });

  const hangerPath = [
    [0, 0, 0],
    [0, -0.22, -0.06],
    [0, -0.65, -0.32],
    [0, -1.05, -0.22],
    [0, -1.12, 0]
  ];
  const hangerProfile = [
    [-0.035, -0.03],
    [0.035, -0.03],
    [0.035, 0.03],
    [-0.035, 0.03]
  ];
  const hangerArmGeo = sweepProfile(hangerProfile, hangerPath, { cap: true, up: [1, 0, 0] });
  createPart('GondolaHangerArm', hangerArmGeo, matGondolaHanger, { parent: gondolaPivot });

  const cabinMount = boxGeo(0.18, 0.12, 0.18);
  createPart('CabinRoofMount', cabinMount, matGondolaTrim, { position: [0, -1.12, 0], parent: gondolaPivot });

  const cabinBodyGeo = await roundedBoxGeo(1.68, 1.56, 1.34, 0.22, { style: 'round', segments: 16 });
  createPart('GondolaBody', cabinBodyGeo, matGondolaRed, { position: [0, -1.88, 0], parent: gondolaPivot });

  const winFrontGeo = boxGeo(0.03, 0.68, 1.06);
  createPart('GondolaWindow_Front', winFrontGeo, matGondolaGlass, { position: [0.83, -1.82, 0], parent: gondolaPivot });
  const winRearGeo = boxGeo(0.03, 0.68, 1.06);
  createPart('GondolaWindow_Rear', winRearGeo, matGondolaGlass, { position: [-0.83, -1.82, 0], parent: gondolaPivot });
  const winPlatGeo = boxGeo(1.24, 0.72, 0.03);
  createPart('GondolaWindow_Platform', winPlatGeo, matGondolaGlass, { position: [0, -1.82, 0.66], parent: gondolaPivot });
  const winOuterGeo = boxGeo(1.24, 0.72, 0.03);
  createPart('GondolaWindow_Outer', winOuterGeo, matGondolaGlass, { position: [0, -1.82, -0.66], parent: gondolaPivot });

  const bumperGeo = boxGeo(1.72, 0.08, 1.38);
  createPart('GondolaBumper', bumperGeo, matGondolaTrim, { position: [0, -2.18, 0], parent: gondolaPivot });

  const benchF = boxGeo(0.38, 0.36, 1.02);
  createPart('GondolaBench_Front', benchF, matWarmWood, { position: [0.5, -2.42, 0], parent: gondolaPivot });
  const benchR = boxGeo(0.38, 0.36, 1.02);
  createPart('GondolaBench_Rear', benchR, matWarmWood, { position: [-0.5, -2.42, 0], parent: gondolaPivot });
  const cabinFloor = boxGeo(1.4, 0.04, 1.1);
  createPart('GondolaFloor', cabinFloor, matGondolaTrim, { position: [0, -2.61, 0], parent: gondolaPivot });

  const skiRackFrame = boxGeo(0.8, 0.45, 0.12);
  createPart('GondolaSkiRack', skiRackFrame, matGondolaTrim, { position: [0, -2.25, -0.72], parent: gondolaPivot });
  const skiGeo = boxGeo(0.1, 1.3, 0.02);
  createPart('Skis_Pair1', skiGeo, matSafetyYellow, {
    position: [-0.18, -2.0, -0.74],
    rotation: [6, 0, 4],
    parent: gondolaPivot
  });
  createPart('Skis_Pair2', skiGeo, matPineRoof, {
    position: [0.18, -2.0, -0.74],
    rotation: [-5, 0, -4],
    parent: gondolaPivot
  });

  // 7. Animated Service Mechanism
  const craneBase = cylinderYGeo(0.12, 0.14, 0.2, 16);
  createPart('ServiceCraneBase', craneBase, matSteelGantry, { position: [1.2, 3.65, 0], parent: root });

  const craneArmPivot = createPivot('ServiceCraneArm', [1.2, 3.75, 0], root);

  const jibArmGeo = boxGeo(0.1, 0.14, 1.4);
  createPart('ServiceCraneJib', jibArmGeo, matSafetyYellow, {
    position: [0, 0.07, 0.65],
    parent: craneArmPivot
  });
  const jibBraceGeo = boxGeo(0.06, 0.06, 0.7);
  createPart('ServiceCraneJibBrace', jibBraceGeo, matSafetyYellow, {
    position: [0, 0.22, 0.35],
    rotation: [-35, 0, 0],
    parent: craneArmPivot
  });
  const trolleyGeo = boxGeo(0.2, 0.12, 0.22);
  createPart('ServiceCraneTrolley', trolleyGeo, matSteelGantry, {
    position: [0, 0.05, 1.05],
    parent: craneArmPivot
  });

  const hoistHookPivot = createPivot('ServiceHoistHook', [0, -0.05, 1.05], craneArmPivot);

  const hoistCableGeo = cylinderYGeo(0.008, 0.008, 0.45, 8);
  createPart('ServiceHoistCable', hoistCableGeo, matCableSteel, {
    position: [0, -0.225, 0],
    parent: hoistHookPivot
  });
  const hookBlockGeo = await roundedBoxGeo(0.12, 0.16, 0.1, 0.02);
  createPart('ServiceHookBlock', hookBlockGeo, matSafetyYellow, {
    position: [0, -0.5, 0],
    parent: hoistHookPivot
  });
  const hookLoopGeo = torusGeo(0.055, 0.015, 8, 16);
  createPart('ServiceHookLoop', hookLoopGeo, matSteelGantry, {
    position: [0, -0.62, 0],
    rotation: [0, 0, 90],
    parent: hoistHookPivot
  });

  return root;
}

function animate(root) {
  return [
    createClip('ServiceCycle', 4.0, [
      rotationTrack('Joint_Bullwheel', [
        { time: 0, rotation: [0, 0, 0] },
        { time: 2, rotation: [0, 180, 0] },
        { time: 4, rotation: [0, 360, 0] }
      ]),
      rotationTrack('Joint_ServiceCraneArm', [
        { time: 0, rotation: [0, -18, 0] },
        { time: 2, rotation: [0, 28, 0] },
        { time: 4, rotation: [0, -18, 0] }
      ]),
      positionTrack('Joint_ServiceHoistHook', [
        { time: 0, position: [0, 0, 0] },
        { time: 2, position: [0, -0.32, 0] },
        { time: 4, position: [0, 0, 0] }
      ])
    ])
  ];
}