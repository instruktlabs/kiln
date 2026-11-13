// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Mechanical Dragonfly with Unfolding Copper Wings',
  category: 'character',
  role: 'prop'
};

function build() {
  const root = createRoot('MechanicalDragonfly');

  // --- Materials ---
  const matCopper = gameMaterial(0xcd683d, { metalness: 0.88, roughness: 0.28 });
  const matBrightCopper = gameMaterial(0xdf7a4a, { metalness: 0.92, roughness: 0.20 });
  const matBrass = gameMaterial(0xd4af37, { metalness: 0.85, roughness: 0.30 });
  const matGunmetal = gameMaterial(0x282a30, { metalness: 0.80, roughness: 0.42 });
  const matSteel = gameMaterial(0x9ca3af, { metalness: 0.92, roughness: 0.18 });
  const matObsidianEye = gameMaterial(0x161e26, { metalness: 0.82, roughness: 0.12 });
  const matGlowAmber = gameMaterial(0xd9822b, { metalness: 0.35, roughness: 0.25, emissive: 0x8a4510, emissiveIntensity: 0.8 });
  const matPowerCore = gameMaterial(0x38bdf8, { metalness: 0.20, roughness: 0.20, emissive: 0x0284c7, emissiveIntensity: 1.5 });
  const matCopperFoil = gameMaterial(0xc25e36, { metalness: 0.88, roughness: 0.32 });
  const matCopperVane = gameMaterial(0xd86f3e, { metalness: 0.92, roughness: 0.22 });

  // --- 1. Head & Cephalon ---
  const headPos = [0.22, 0.175, 0];
  const headGroup = createPivot('Head_Mount', headPos, root);

  // Skull casing
  createPart('Head_Casing', capsuleGeo(0.028, 0.032, 12), matGunmetal, {
    rotation: [0, 0, 90],
    parent: headGroup
  });
  // Frontal brow plate & cowl
  createPart('Head_Brow', boxGeo(0.032, 0.016, 0.048), matBrass, {
    position: [0.018, 0.008, 0],
    parent: headGroup
  });
  createPart('Head_FacePlate', taperConeGeo(0.024, 0.012, 0.028, 'x', 8), matCopper, {
    position: [0.028, -0.008, 0],
    parent: headGroup
  });

  // Large Compound Eyes (Left & Right)
  for (const s of [1, -1]) {
    const eyeZ = s * 0.034;
    // Main faceted compound eye hemisphere
    createPart(`Eye_${s > 0 ? 'R' : 'L'}`, sphereGeo(0.026, 16, 12), matObsidianEye, {
      position: [0.008, 0.008, eyeZ],
      scale: [1.1, 1.0, 0.85],
      parent: headGroup
    });
    // Brass ocular bezel / retaining collar
    createPart(`EyeBezel_${s > 0 ? 'R' : 'L'}`, torusGeo(0.026, 0.0032, 8, 20), matBrass, {
      position: [0.008, 0.008, eyeZ * 0.88],
      rotation: [0, s * 25, 0],
      parent: headGroup
    });
    // Ocular gear teeth ring
    const eyeGear = gearGeo({ teeth: 18, rootRadius: 0.025, tipRadius: 0.029, boreRadius: 0.022, height: 0.004 });
    createPart(`EyeGear_${s > 0 ? 'R' : 'L'}`, eyeGear, matBrightCopper, {
      position: [0.008, 0.008, eyeZ * 0.82],
      rotation: [90, 0, s * 25],
      parent: headGroup
    });

    // Articulated Antenna
    const antRoot = [0.030, 0.022, s * 0.014];
    beamBetween(`Antenna_Base_${s > 0 ? 'R' : 'L'}`, antRoot, [antRoot[0] + 0.025, antRoot[1] + 0.020, s * 0.024], 0.0018, matBrass, { parent: headGroup });
    beamBetween(`Antenna_Tip_${s > 0 ? 'R' : 'L'}`, [antRoot[0] + 0.025, antRoot[1] + 0.020, s * 0.024], [antRoot[0] + 0.048, antRoot[1] + 0.028, s * 0.030], 0.0012, matCopper, { parent: headGroup });
    createPart(`Antenna_Orb_${s > 0 ? 'R' : 'L'}`, sphereGeo(0.0035, 8, 6), matGlowAmber, {
      position: [antRoot[0] + 0.048, antRoot[1] + 0.028, s * 0.030],
      parent: headGroup
    });

    // Mandibles / Mouthparts
    beamBetween(`Mandible_${s > 0 ? 'R' : 'L'}`, [0.030, -0.020, s * 0.012], [0.044, -0.030, s * 0.004], 0.0025, matSteel, { parent: headGroup });
    createPart(`Mandible_Tip_${s > 0 ? 'R' : 'L'}`, coneGeo(0.003, 0.010, 6), matBrass, {
      position: [0.044, -0.030, s * 0.004],
      rotation: [0, 0, -60],
      parent: headGroup
    });
  }

  // 3 Dorsal Ocelli (sensory eyes)
  createPart('Ocellus_Center', sphereGeo(0.0045, 8, 6), matGlowAmber, {
    position: [0.016, 0.030, 0],
    parent: headGroup
  });
  createPart('Ocellus_R', sphereGeo(0.0035, 8, 6), matGlowAmber, {
    position: [0.010, 0.028, 0.010],
    parent: headGroup
  });
  createPart('Ocellus_L', sphereGeo(0.0035, 8, 6), matGlowAmber, {
    position: [0.010, 0.028, -0.010],
    parent: headGroup
  });

  // Neck Gimbal Collar
  createPart('Neck_Ring', torusGeo(0.022, 0.004, 8, 16), matBrass, {
    position: [0.188, 0.175, 0],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('Neck_Joint', sphereGeo(0.018, 10, 8), matSteel, {
    position: [0.188, 0.175, 0],
    parent: root
  });

  // --- 2. Thorax (Chassis & Clockwork Engine Room) ---
  const thoraxCenter = [0.05, 0.170, 0];

  // Main Dorsal Carapace Shield
  createPart('Thorax_DorsalCarapace', capsuleGeo(0.040, 0.14, 12), matGunmetal, {
    position: thoraxCenter,
    rotation: [0, 0, 90],
    scale: [1.0, 0.95, 1.1],
    parent: root
  });
  // Copper Spine Crest (Split with open clockwork gearbox bay)
  createPart('Thorax_SpineCrest_Front', boxGeo(0.045, 0.010, 0.012), matBrightCopper, {
    position: [thoraxCenter[0] + 0.055, thoraxCenter[1] + 0.042, 0],
    parent: root
  });
  createPart('Thorax_SpineCrest_Aft', boxGeo(0.040, 0.010, 0.012), matBrightCopper, {
    position: [thoraxCenter[0] - 0.055, thoraxCenter[1] + 0.042, 0],
    parent: root
  });
  // Gearbox bay filigree rim / brass housing
  createPart('Gearbox_Rim', boxGeo(0.065, 0.006, 0.030), matBrass, {
    position: [thoraxCenter[0] + 0.002, thoraxCenter[1] + 0.040, 0],
    parent: root
  });
  // Arched brass protective rib cage over exposed gears
  for (let g = -1; g <= 1; g++) {
    createPart(`Gearbox_Arch_${g}`, torusGeo(0.018, 0.0018, 6, 16), matBrass, {
      position: [thoraxCenter[0] + 0.002 + g * 0.020, thoraxCenter[1] + 0.040, 0],
      rotation: [0, 90, 0],
      parent: root
    });
  }

  // Animated Clockwork Gears inside Thorax (Prominently exposed in central bay)
  // Main Drive Gear (brass)
  const gearPivotMain = createPivot('Gear_Main', [thoraxCenter[0] + 0.018, thoraxCenter[1] + 0.024, 0], root);
  const mainGearMesh = gearGeo({ teeth: 16, rootRadius: 0.026, tipRadius: 0.032, boreRadius: 0.008, height: 0.010 });
  createPart('Gear_Main_Mesh', mainGearMesh, matBrass, {
    rotation: [90, 0, 0],
    parent: gearPivotMain
  });

  // Secondary Reduction Gear (copper, meshing with main gear)
  const gearPivotSec = createPivot('Gear_Sec', [thoraxCenter[0] - 0.020, thoraxCenter[1] + 0.028, 0], root);
  const secGearMesh = gearGeo({ teeth: 10, rootRadius: 0.014, tipRadius: 0.019, boreRadius: 0.005, height: 0.008 });
  createPart('Gear_Sec_Mesh', secGearMesh, matCopper, {
    rotation: [90, 0, 0],
    parent: gearPivotSec
  });

  // Transverse brass drive shafts linking gearbox to wing saddles
  beamBetween('Gear_Shaft_Fore',
    [thoraxCenter[0] + 0.018, thoraxCenter[1] + 0.024, -0.036],
    [thoraxCenter[0] + 0.018, thoraxCenter[1] + 0.024,  0.036],
    0.003, matSteel, { parent: root });
  beamBetween('Gear_Shaft_Aft',
    [thoraxCenter[0] - 0.020, thoraxCenter[1] + 0.028, -0.034],
    [thoraxCenter[0] - 0.020, thoraxCenter[1] + 0.028,  0.034],
    0.0025, matSteel, { parent: root });

  // Side Pressure Gauge (Port side)
  createPart('PressureGauge_Body', cylinderGeo(0.012, 0.012, 0.006, 12), matBrass, {
    position: [thoraxCenter[0] + 0.010, thoraxCenter[1] + 0.015, 0.046],
    rotation: [90, 0, 0],
    parent: root
  });
  createPart('PressureGauge_Face', cylinderGeo(0.009, 0.009, 0.007, 12), matGlowAmber, {
    position: [thoraxCenter[0] + 0.010, thoraxCenter[1] + 0.015, 0.048],
    rotation: [90, 0, 0],
    parent: root
  });
  // Starboard Escapement Wheel
  createPart('Escapement_Body', cylinderGeo(0.010, 0.010, 0.006, 10), matBrass, {
    position: [thoraxCenter[0] - 0.015, thoraxCenter[1] + 0.015, -0.046],
    rotation: [90, 0, 0],
    parent: root
  });

  // Twin Steam Exhaust Funnels on Dorsal Carapace
  for (const s of [1, -1]) {
    createPart(`Steam_Funnel_${s > 0 ? 'R' : 'L'}`, cylinderGeo(0.0045, 0.003, 0.022, 10), matBrass, {
      position: [thoraxCenter[0] - 0.045, thoraxCenter[1] + 0.045, s * 0.020],
      rotation: [s * 15, 0, -25],
      parent: root
    });
    createPart(`Steam_Rim_${s > 0 ? 'R' : 'L'}`, torusGeo(0.005, 0.0012, 6, 12), matBrightCopper, {
      position: [thoraxCenter[0] - 0.050, thoraxCenter[1] + 0.054, s * 0.024],
      rotation: [s * 15, 0, -25],
      parent: root
    });
  }

  // Wing Saddle Mounts on Dorsal Carapace
  for (const s of [1, -1]) {
    // Forewing Mount Block
    createPart(`Forewing_Saddle_${s > 0 ? 'R' : 'L'}`, boxGeo(0.022, 0.014, 0.016), matBrass, {
      position: [0.08, 0.210, s * 0.038],
      parent: root
    });
    // Hindwing Mount Block
    createPart(`Hindwing_Saddle_${s > 0 ? 'R' : 'L'}`, boxGeo(0.022, 0.014, 0.016), matBrass, {
      position: [-0.01, 0.205, s * 0.036],
      parent: root
    });
  }

  // --- 3. 10-Segmented Abdomen & Caudal Claspers ---
  const abdomenStart = -0.05;
  const numSegments = 10;
  const segLength = 0.044;
  let curX = abdomenStart;

  for (let seg = 1; seg <= numSegments; seg++) {
    const t = (seg - 1) / (numSegments - 1);
    const rFront = 0.024 * (1 - 0.65 * t);
    const rBack = 0.024 * (1 - 0.65 * (t + 1 / numSegments));
    const centerX = curX - segLength * 0.5;

    // Segment Body Shell
    createPart(`Abdomen_S${seg}_Shell`, taperConeGeo(rBack, rFront, segLength, 'x', 8), matGunmetal, {
      position: [centerX, 0.165 - t * 0.025, 0],
      parent: root
    });

    // Brass Joint Ring between segments
    createPart(`Abdomen_S${seg}_Ring`, torusGeo(rFront * 1.05, 0.0022, 6, 16), matBrass, {
      position: [curX, 0.165 - t * 0.025, 0],
      rotation: [0, 90, 0],
      parent: root
    });

    // Longitudinal Dorsal Spine Conduit
    beamBetween(`Abdomen_S${seg}_Spine`,
      [curX, 0.165 - t * 0.025 + rFront * 1.05, 0],
      [curX - segLength, 0.165 - (t + 1 / numSegments) * 0.025 + rBack * 1.05, 0],
      0.0020, matBrightCopper, { parent: root });

    // Lateral copper rivet studs
    for (const s of [1, -1]) {
      createPart(`Abdomen_S${seg}_Stud_${s > 0 ? 'R' : 'L'}`, sphereGeo(0.0022, 6, 4), matCopper, {
        position: [centerX, 0.165 - t * 0.025, s * (rFront + rBack) * 0.5],
        parent: root
      });
    }

    curX -= segLength;
  }

  // S10 Tip & Tail Claspers (Cerci)
  const tipX = curX;
  const tipY = 0.140;
  createPart('Caudal_Base', cylinderGeo(0.008, 0.006, 0.016, 8), matBrass, {
    position: [tipX, tipY, 0],
    rotation: [0, 0, 90],
    parent: root
  });
  // Upper dual forceps / claspers
  for (const s of [1, -1]) {
    beamBetween(`Clasper_Upper_${s > 0 ? 'R' : 'L'}`,
      [tipX - 0.008, tipY + 0.003, s * 0.004],
      [tipX - 0.038, tipY + 0.012, s * 0.012],
      0.0016, matSteel, { parent: root });
    beamBetween(`Clasper_Tip_${s > 0 ? 'R' : 'L'}`,
      [tipX - 0.038, tipY + 0.012, s * 0.012],
      [tipX - 0.052, tipY + 0.008, s * 0.002],
      0.0012, matBrightCopper, { parent: root });
  }
  // Lower ventral clasper prong
  beamBetween('Clasper_Lower',
    [tipX - 0.008, tipY - 0.004, 0],
    [tipX - 0.040, tipY - 0.010, 0],
    0.0016, matSteel, { parent: root });

  // --- 4. 6 Articulated Mechanical Legs (Ground Contact at Y = 0) ---
  // Legs: Forelegs, Midlegs, Hindlegs
  const legDefs = [
    { name: 'Foreleg', rootX: 0.12, rootY: 0.13, rootZ: 0.042, knee: [0.17, 0.19, 0.095], ankle: [0.16, 0.05, 0.120], foot: [0.17, 0.0, 0.135] },
    { name: 'Midleg',  rootX: 0.04, rootY: 0.12, rootZ: 0.045, knee: [0.04, 0.18, 0.125], ankle: [0.02, 0.05, 0.150], foot: [0.02, 0.0, 0.165] },
    { name: 'Hindleg', rootX: -0.04, rootY: 0.12, rootZ: 0.045, knee: [-0.08, 0.19, 0.135], ankle: [-0.13, 0.06, 0.160], foot: [-0.15, 0.0, 0.175] }
  ];

  for (const def of legDefs) {
    for (const s of [1, -1]) {
      const pRoot = [def.rootX, def.rootY, s * def.rootZ];
      const pKnee = [def.knee[0], def.knee[1], s * def.knee[2]];
      const pAnkle = [def.ankle[0], def.ankle[1], s * def.ankle[2]];
      const pFoot = [def.foot[0], def.foot[1], s * def.foot[2]];
      const prefix = `${def.name}_${s > 0 ? 'R' : 'L'}`;

      // Coxa mounting ball & socket
      createPart(`${prefix}_Coxa`, sphereGeo(0.008, 8, 8), matBrass, {
        position: pRoot,
        parent: root
      });
      // Femur strut (Coxa to Knee)
      beamBetween(`${prefix}_Femur`, pRoot, pKnee, 0.0035, matGunmetal, { parent: root });
      // Copper hydraulic line along femur
      beamBetween(`${prefix}_FemurTube`,
        [pRoot[0], pRoot[1] + 0.004, pRoot[2]],
        [pKnee[0], pKnee[1] + 0.004, pKnee[2]],
        0.0015, matCopper, { parent: root });

      // Knee hinge disc
      createPart(`${prefix}_KneeDisc`, cylinderGeo(0.007, 0.007, 0.006, 10), matBrass, {
        position: pKnee,
        rotation: [0, 0, 90],
        parent: root
      });

      // Tibia strut (Knee to Ankle) with classic dragonfly spines
      beamBetween(`${prefix}_Tibia`, pKnee, pAnkle, 0.0028, matSteel, { parent: root });

      // 3 Tibial spines
      for (let sp = 1; sp <= 3; sp++) {
        const u = sp / 4;
        const spBase = [
          pKnee[0] + u * (pAnkle[0] - pKnee[0]),
          pKnee[1] + u * (pAnkle[1] - pKnee[1]),
          pKnee[2] + u * (pAnkle[2] - pKnee[2])
        ];
        const spTip = [spBase[0] + 0.003, spBase[1] - 0.006, spBase[2] + s * 0.004];
        beamBetween(`${prefix}_Spine_${sp}`, spBase, spTip, 0.0010, matBrightCopper, { parent: root });
      }

      // Tarsal Joint / Ankle knuckle
      createPart(`${prefix}_Ankle`, sphereGeo(0.0045, 8, 6), matBrass, {
        position: pAnkle,
        parent: root
      });

      // Tarsus / Claws reaching firmly down to Y = 0
      beamBetween(`${prefix}_Tarsus`, pAnkle, pFoot, 0.0022, matSteel, { parent: root });
      // Sharp curved gripping claw touching Y = 0
      createPart(`${prefix}_ClawOuter`, coneGeo(0.0028, 0.010, 6), matBrightCopper, {
        position: [pFoot[0], pFoot[1] + 0.003, pFoot[2]],
        rotation: [s * 20, 0, -45],
        parent: root
      });
      createPart(`${prefix}_ClawInner`, coneGeo(0.0028, 0.010, 6), matBrightCopper, {
        position: [pFoot[0] - 0.004, pFoot[1] + 0.003, pFoot[2] - s * 0.003],
        rotation: [s * 10, 0, -50],
        parent: root
      });
    }
  }

  // --- 5. Unfolding Copper Wings (Forewings & Hindwings) ---
  // Helper to build an intricate folding wing
  function createFoldingWing(wingId, isHind, side, mountPos) {
    const s = side; // +1 = Right (+Z), -1 = Left (-Z)
    const sideKey = s > 0 ? 'R' : 'L';
    const tag = `${wingId}_${sideKey}`;

    // Root Pivot: receives rotation tracks in animation
    const rootPivot = createPivot(`${tag}_Root`, mountPos, root);

    // Root swivel clevis & actuator piston
    createPart(`${tag}_Clevis`, boxGeo(0.014, 0.012, 0.012), matBrass, {
      position: [0, 0, 0],
      parent: rootPivot
    });
    // Miniature hydraulic pushrod pylon
    beamBetween(`${tag}_Actuator`, [-0.010, -0.015, 0], [0, 0, s * 0.015], 0.0025, matSteel, { parent: rootPivot });

    // Inner Wing Dimensions
    const innerSpan = isHind ? 0.14 : 0.16;
    const baseChord = isHind ? 0.070 : 0.052;
    const midChord = isHind ? 0.065 : 0.048;

    // --- Inner Wing Assembly (attached to rootPivot) ---
    // Leading tubular copper spar
    beamBetween(`${tag}_Inner_LeadSpar`, [0, 0, 0], [0, 0, s * innerSpan], 0.0035, matBrightCopper, { parent: rootPivot });
    // Subcostal spar
    beamBetween(`${tag}_Inner_SubSpar`, [-0.012, -0.001, s * 0.015], [-0.010, -0.001, s * innerSpan], 0.0022, matCopper, { parent: rootPivot });

    // Inner venation ribs & braces
    const numInnerRibs = 5;
    for (let r = 1; r <= numInnerRibs; r++) {
      const u = r / numInnerRibs;
      const zPos = s * innerSpan * u;
      const chord = baseChord * (1 - u) + midChord * u;
      // Cross vein from leading spar back to trailing edge
      beamBetween(`${tag}_Inner_Rib_${r}`, [0, 0, zPos], [-chord, -0.001, zPos], 0.0014, matCopper, { parent: rootPivot });
      // Diagonal cross-truss
      if (r > 1) {
        const prevZ = s * innerSpan * ((r - 1) / numInnerRibs);
        beamBetween(`${tag}_Inner_Truss_${r}`, [-0.010, -0.001, prevZ], [-chord * 0.7, -0.001, zPos], 0.0010, matBrass, { parent: rootPivot });
      }
    }
    // Trailing edge copper framing wire
    beamBetween(`${tag}_Inner_TrailWire`, [-baseChord, -0.001, s * 0.010], [-midChord, -0.001, s * innerSpan], 0.0016, matBrightCopper, { parent: rootPivot });

    // Inner Wing Translucent Copper Membrane (meshGeo)
    // Triangle strip from leading edge to trailing edge
    const innerPositions = [];
    const innerIndices = [];
    for (let r = 0; r <= numInnerRibs; r++) {
      const u = r / numInnerRibs;
      const zPos = s * innerSpan * u;
      const chord = baseChord * (1 - u) + midChord * u;
      innerPositions.push(0, 0, zPos);          // front vertex
      innerPositions.push(-chord, 0, zPos);     // back vertex
    }
    for (let r = 0; r < numInnerRibs; r++) {
      const i0 = r * 2;
      const i1 = r * 2 + 1;
      const i2 = (r + 1) * 2;
      const i3 = (r + 1) * 2 + 1;
      // Two triangles per quad cell (both clockwise and CCW for double-sided visibility)
      innerIndices.push(i0, i1, i2,  i2, i1, i3);
      innerIndices.push(i2, i1, i0,  i3, i1, i2);
    }
    const innerMembraneGeo = meshGeo({ positions: innerPositions, indices: innerIndices });
    createPart(`${tag}_Inner_Membrane`, innerMembraneGeo, matCopperFoil, {
      position: [0, -0.0005, 0],
      parent: rootPivot
    });

    // Elbow Hinge Joint (Nodus / Folding Elbow Mechanism)
    const elbowPos = [0, 0, s * innerSpan];
    createPart(`${tag}_ElbowKnuckle`, cylinderGeo(0.006, 0.006, 0.008, 12), matBrass, {
      position: elbowPos,
      rotation: [90, 0, 0],
      parent: rootPivot
    });
    // Miniature spur gear linking inner & outer wing
    const elbowGear = gearGeo({ teeth: 12, rootRadius: 0.006, tipRadius: 0.0085, boreRadius: 0.0025, height: 0.004 });
    createPart(`${tag}_ElbowGear`, elbowGear, matBrightCopper, {
      position: [elbowPos[0], elbowPos[1] + 0.003, elbowPos[2]],
      rotation: [0, 0, 90],
      parent: rootPivot
    });

    // --- Mid Pivot: outer wing unfolds from here! ---
    const midPivot = createPivot(`${tag}_Mid`, elbowPos, rootPivot);

    // Outer Wing Dimensions
    const outerSpan = isHind ? 0.16 : 0.18;
    const tipChord = 0.015;

    // Outer leading copper spar
    beamBetween(`${tag}_Outer_LeadSpar`, [0, 0, 0], [-0.006, 0, s * outerSpan], 0.0030, matBrightCopper, { parent: midPivot });
    // Outer subcostal spar
    beamBetween(`${tag}_Outer_SubSpar`, [-0.010, -0.001, 0], [-0.010, -0.001, s * outerSpan * 0.75], 0.0018, matCopper, { parent: midPivot });

    // Outer venation ribs
    const numOuterRibs = 6;
    for (let r = 1; r <= numOuterRibs; r++) {
      const u = r / numOuterRibs;
      const zPos = s * outerSpan * u;
      const chord = midChord * (1 - u) + tipChord * u;
      const frontX = -0.006 * u;
      // Cross rib
      beamBetween(`${tag}_Outer_Rib_${r}`, [frontX, 0, zPos], [frontX - chord, -0.001, zPos], 0.0012, matCopper, { parent: midPivot });
      // Venation diagonals
      if (r > 1) {
        const prevZ = s * outerSpan * ((r - 1) / numOuterRibs);
        const prevFrontX = -0.006 * ((r - 1) / numOuterRibs);
        beamBetween(`${tag}_Outer_Truss_${r}`, [prevFrontX - 0.008, -0.001, prevZ], [frontX - chord * 0.6, -0.001, zPos], 0.0009, matBrass, { parent: midPivot });
      }
    }
    // Trailing edge wire for outer wing
    beamBetween(`${tag}_Outer_TrailWire`, [-midChord, -0.001, 0], [-0.006 - tipChord, -0.001, s * outerSpan], 0.0015, matBrightCopper, { parent: midPivot });

    // Pterostigma (Aerodynamic counterweight plate near wing tip)
    const pteroZ = s * outerSpan * 0.82;
    createPart(`${tag}_Pterostigma`, boxGeo(0.008, 0.0025, 0.024), matBrass, {
      position: [-0.008, 0.001, pteroZ],
      parent: midPivot
    });
    createPart(`${tag}_Pterostigma_Trim`, boxGeo(0.005, 0.0035, 0.018), matBrightCopper, {
      position: [-0.008, 0.001, pteroZ],
      parent: midPivot
    });

    // Outer Wing Translucent Copper Membrane (meshGeo)
    const outerPositions = [];
    const outerIndices = [];
    for (let r = 0; r <= numOuterRibs; r++) {
      const u = r / numOuterRibs;
      const zPos = s * outerSpan * u;
      const chord = midChord * (1 - u) + tipChord * u;
      const frontX = -0.006 * u;
      outerPositions.push(frontX, 0, zPos);             // front vertex
      outerPositions.push(frontX - chord, 0, zPos);     // back vertex
    }
    for (let r = 0; r < numOuterRibs; r++) {
      const i0 = r * 2;
      const i1 = r * 2 + 1;
      const i2 = (r + 1) * 2;
      const i3 = (r + 1) * 2 + 1;
      outerIndices.push(i0, i1, i2,  i2, i1, i3);
      outerIndices.push(i2, i1, i0,  i3, i1, i2);
    }
    const outerMembraneGeo = meshGeo({ positions: outerPositions, indices: outerIndices });
    createPart(`${tag}_Outer_Membrane`, outerMembraneGeo, matCopperFoil, {
      position: [0, -0.0005, 0],
      parent: midPivot
    });

    // Wing Tip Filigree Finial
    createPart(`${tag}_TipFinial`, sphereGeo(0.0035, 8, 6), matBrightCopper, {
      position: [-0.006, 0, s * outerSpan],
      parent: midPivot
    });

    // --- Trailing Edge Deployable Copper Fan Vane (Flap) ---
    // Pivots to fan out the rear chord when unfolding
    const flapPivot = createPivot(`${tag}_Flap`, [-baseChord * 0.45, 0, s * 0.02], rootPivot);
    const flapWidth = isHind ? 0.030 : 0.020;
    const flapLength = innerSpan * 0.72;
    // Flat, thin, filigree copper fan blade
    const flapPositions = [
      0, 0, 0,
      -flapWidth, 0, s * flapLength * 0.35,
      -flapWidth * 0.8, 0, s * flapLength,
      0, 0, s * flapLength
    ];
    const flapIndices = [
      0, 1, 2,  0, 2, 3,
      2, 1, 0,  3, 2, 0
    ];
    const flapGeo = meshGeo({ positions: flapPositions, indices: flapIndices });
    createPart(`${tag}_FlapVane`, flapGeo, matCopperVane, {
      position: [0, -0.0008, 0],
      parent: flapPivot
    });
    beamBetween(`${tag}_FlapRib1`, [0, 0, 0], [-flapWidth, -0.0008, s * flapLength * 0.35], 0.0012, matBrightCopper, { parent: flapPivot });
    beamBetween(`${tag}_FlapRib2`, [0, 0, 0], [-flapWidth * 0.8, -0.0008, s * flapLength], 0.0012, matBrightCopper, { parent: flapPivot });
  }

  // Instantiate the 4 Wings (Forewings and Hindwings, Right and Left)
  createFoldingWing('WingF', false,  1, [0.08, 0.220,  0.038]);  // Forewing Right
  createFoldingWing('WingF', false, -1, [0.08, 0.220, -0.038]);  // Forewing Left
  createFoldingWing('WingH', true,   1, [-0.01, 0.215,  0.036]); // Hindwing Right
  createFoldingWing('WingH', true,  -1, [-0.01, 0.215, -0.036]); // Hindwing Left

  return root;
}

function animate(root) {
  // Total duration: 5.0 seconds for a majestic, slow unfolding sequence
  const tracks = [];

  // 1. Clockwork Gears in Thorax
  tracks.push(rotationTrack('Joint_Gear_Main', [
    { time: 0.0, rotation: [0, 0, 0] },
    { time: 1.0, rotation: [0, 0, 90] },
    { time: 2.5, rotation: [0, 0, 220] },
    { time: 4.0, rotation: [0, 0, 360] },
    { time: 5.0, rotation: [0, 0, 360] }
  ]));

  tracks.push(rotationTrack('Joint_Gear_Sec', [
    { time: 0.0, rotation: [0, 0, 0] },
    { time: 1.0, rotation: [0, 0, -144] },
    { time: 2.5, rotation: [0, 0, -352] },
    { time: 4.0, rotation: [0, 0, -576] },
    { time: 5.0, rotation: [0, 0, -576] }
  ]));

  // 2. Right Forewing
  // Root Pivot: yaw sweeps from folded back (-76 deg) to flight stance (+3 deg)
  tracks.push(rotationTrack('Joint_WingF_R_Root', [
    { time: 0.0, rotation: [-10, -76, 12] },
    { time: 0.8, rotation: [-8,  -68, 10] },
    { time: 2.0, rotation: [-4,  -35,  6] },
    { time: 3.2, rotation: [-1,   -6,  2] },
    { time: 4.2, rotation: [ 0,    3,  1] },
    { time: 4.6, rotation: [ 1,    3,  3] },
    { time: 5.0, rotation: [ 0,    3,  2] }
  ]));
  // Mid Pivot (Elbow): hinges open from folded (+135 deg) to straight (0 deg)
  tracks.push(rotationTrack('Joint_WingF_R_Mid', [
    { time: 0.0, rotation: [0, 135, 0] },
    { time: 1.0, rotation: [0, 125, 0] },
    { time: 2.2, rotation: [0,  70, 0] },
    { time: 3.4, rotation: [0,  18, 0] },
    { time: 4.2, rotation: [0,   0, 0] },
    { time: 5.0, rotation: [0,   0, 0] }
  ]));
  // Trailing Flap: fans open
  tracks.push(rotationTrack('Joint_WingF_R_Flap', [
    { time: 0.0, rotation: [0, 35, 0] },
    { time: 1.5, rotation: [0, 30, 0] },
    { time: 3.0, rotation: [0, 12, 0] },
    { time: 4.2, rotation: [0,  0, 0] },
    { time: 5.0, rotation: [0,  0, 0] }
  ]));

  // 3. Left Forewing (Symmetric)
  tracks.push(rotationTrack('Joint_WingF_L_Root', [
    { time: 0.0, rotation: [-10,  76, -12] },
    { time: 0.8, rotation: [-8,   68, -10] },
    { time: 2.0, rotation: [-4,   35,  -6] },
    { time: 3.2, rotation: [-1,    6,  -2] },
    { time: 4.2, rotation: [ 0,   -3,  -1] },
    { time: 4.6, rotation: [ 1,   -3,  -3] },
    { time: 5.0, rotation: [ 0,   -3,  -2] }
  ]));
  tracks.push(rotationTrack('Joint_WingF_L_Mid', [
    { time: 0.0, rotation: [0, -135, 0] },
    { time: 1.0, rotation: [0, -125, 0] },
    { time: 2.2, rotation: [0,  -70, 0] },
    { time: 3.4, rotation: [0,  -18, 0] },
    { time: 4.2, rotation: [0,    0, 0] },
    { time: 5.0, rotation: [0,    0, 0] }
  ]));
  tracks.push(rotationTrack('Joint_WingF_L_Flap', [
    { time: 0.0, rotation: [0, -35, 0] },
    { time: 1.5, rotation: [0, -30, 0] },
    { time: 3.0, rotation: [0, -12, 0] },
    { time: 4.2, rotation: [0,   0, 0] },
    { time: 5.0, rotation: [0,   0, 0] }
  ]));

  // 4. Right Hindwing (Slightly delayed for realistic organic mechanical stagger)
  tracks.push(rotationTrack('Joint_WingH_R_Root', [
    { time: 0.0, rotation: [-8, -78, 10] },
    { time: 1.0, rotation: [-8, -74, 10] },
    { time: 2.3, rotation: [-4, -42,  6] },
    { time: 3.5, rotation: [-1, -12,  2] },
    { time: 4.4, rotation: [ 0,  -4,  1] },
    { time: 4.7, rotation: [ 1,  -4,  2.5] },
    { time: 5.0, rotation: [ 0,  -4,  1.5] }
  ]));
  tracks.push(rotationTrack('Joint_WingH_R_Mid', [
    { time: 0.0, rotation: [0, 130, 0] },
    { time: 1.2, rotation: [0, 120, 0] },
    { time: 2.5, rotation: [0,  65, 0] },
    { time: 3.6, rotation: [0,  15, 0] },
    { time: 4.4, rotation: [0,   0, 0] },
    { time: 5.0, rotation: [0,   0, 0] }
  ]));
  tracks.push(rotationTrack('Joint_WingH_R_Flap', [
    { time: 0.0, rotation: [0, 32, 0] },
    { time: 1.6, rotation: [0, 28, 0] },
    { time: 3.2, rotation: [0, 10, 0] },
    { time: 4.4, rotation: [0,  0, 0] },
    { time: 5.0, rotation: [0,  0, 0] }
  ]));

  // 5. Left Hindwing (Symmetric)
  tracks.push(rotationTrack('Joint_WingH_L_Root', [
    { time: 0.0, rotation: [-8,  78, -10] },
    { time: 1.0, rotation: [-8,  74, -10] },
    { time: 2.3, rotation: [-4,  42,  -6] },
    { time: 3.5, rotation: [-1,  12,  -2] },
    { time: 4.4, rotation: [ 0,   4,  -1] },
    { time: 4.7, rotation: [ 1,   4,  -2.5] },
    { time: 5.0, rotation: [ 0,   4,  -1.5] }
  ]));
  tracks.push(rotationTrack('Joint_WingH_L_Mid', [
    { time: 0.0, rotation: [0, -130, 0] },
    { time: 1.2, rotation: [0, -120, 0] },
    { time: 2.5, rotation: [0,  -65, 0] },
    { time: 3.6, rotation: [0,  -15, 0] },
    { time: 4.4, rotation: [0,    0, 0] },
    { time: 5.0, rotation: [0,    0, 0] }
  ]));
  tracks.push(rotationTrack('Joint_WingH_L_Flap', [
    { time: 0.0, rotation: [0, -32, 0] },
    { time: 1.6, rotation: [0, -28, 0] },
    { time: 3.2, rotation: [0, -10, 0] },
    { time: 4.4, rotation: [0,   0, 0] },
    { time: 5.0, rotation: [0,   0, 0] }
  ]));

  return [createClip('Unfold', 5.0, tracks)];
}
