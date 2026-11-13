// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Sculptural Tea Pavilion',
  category: 'architecture',
  role: 'building'
};

/**
 * Evaluates the sweeping asymmetrical roof surface at normalized coordinates (u, v).
 * u in [0, 1] runs longitudinally from low eaves (X = -3.4) to the soaring curl tip (X = 3.8).
 * v in [0, 1] runs transversely from Z = -2.4 to Z = +2.4.
 */
function evalRoofSurface(u, v) {
  const xMin = -3.4;
  const xMax = 4.0;
  const x = xMin + u * (xMax - xMin);

  // Transverse parameter zn in [-1, 1]
  const zn = (v - 0.5) * 2.0;

  // Longitudinal spine height: low eaves at u=0 (y=2.05m),
  // arch peak at u=0.42 (y=3.35m), and soaring upward curl toward u=1.0 (y=4.45m).
  const spineY = 2.05 + 1.25 * Math.sin(Math.min(1.0, u * 2.1) * Math.PI * 0.5) +
                 1.35 * Math.pow(Math.max(0, u - 0.32) / 0.68, 2.6);

  // Vault camber: highest in center, dropping toward edges
  const vaultCamber = -0.36 * (zn * zn);

  // Asymmetrical flare and 3D ribbon twist at the curling end
  const ribbonTwist = 0.52 * Math.pow(u, 2.2) * zn;

  const y = spineY + vaultCamber + ribbonTwist;

  // Flaring transverse width: expands dynamically toward the soaring open curl
  const widthScale = 1.0 + 0.28 * Math.pow(u, 2.0);
  const z = zn * 2.45 * widthScale;

  return [x, y, z];
}

async function build() {
  const root = createRoot('TeaPavilion');

  // ==========================================
  // PALETTE & MATERIALS (Restrained warm timber / ivory / charcoal)
  // ==========================================
  const matTimberRib = gameMaterial(0x9e633d, { roughness: 0.65 });
  const matTimberPost = gameMaterial(0x6e3c20, { roughness: 0.70 });
  const matTimberFine = gameMaterial(0xb2774a, { roughness: 0.55 });
  const matCanopyDeck = gameMaterial(0xa56d46, { roughness: 0.72 });
  const matBamboo = gameMaterial(0xb89d5c, { roughness: 0.58 });

  const matBasaltPlinth = gameMaterial(0x242629, { roughness: 0.88 });
  const matCharcoalStep = gameMaterial(0x1d1e21, { roughness: 0.85 });
  const matGravel = gameMaterial(0x18191b, { roughness: 0.92 });
  const matBlackSteel = gameMaterial(0x18191c, { roughness: 0.35, metalness: 0.75 });
  const matCastIron = gameMaterial(0x222326, { roughness: 0.50, metalness: 0.45 });

  const matIvoryDais = gameMaterial(0xdcd5c2, { roughness: 0.75 });
  const matIvoryPorcelain = gameMaterial(0xf4efe6, { roughness: 0.22 });
  const matIvoryLinen = gameMaterial(0xe5dcce, { roughness: 0.90 });
  const matTeaLiquor = gameMaterial(0x3e4822, { roughness: 0.15, metalness: 0.1 });
  const matWater = gameMaterial(0x182c33, { roughness: 0.08, metalness: 0.25 });
  const matLanternGlow = gameMaterial(0xffeedd, { emissive: 0xffd199, emissiveIntensity: 1.2, roughness: 0.3 });

  // ==========================================
  // 1. STONE PLINTH & FOUNDATIONS
  // ==========================================
  const plinthGroup = createPivot('PlinthGroup', [0, 0, 0], root);

  // Lower tier: dark basalt plinth (7.2m x 5.2m x 0.20m)
  createPart('BasaltPlinthLower', boxGeo(7.2, 0.20, 5.2), matBasaltPlinth, {
    position: [0.2, 0.10, 0], parent: plinthGroup
  });

  // Upper tier terrace (6.4m x 4.4m x 0.15m)
  createPart('BasaltPlinthUpper', boxGeo(6.4, 0.15, 4.4), matCharcoalStep, {
    position: [0.2, 0.275, 0], parent: plinthGroup
  });

  // Stepped approach at front (+Z)
  createPart('StepFront', boxGeo(2.4, 0.12, 0.6), matBasaltPlinth, {
    position: [0.2, 0.06, 2.8], parent: plinthGroup
  });

  // Stepped approach at low entrance (-X)
  createPart('StepEntry', boxGeo(0.6, 0.12, 1.8), matBasaltPlinth, {
    position: [-3.6, 0.06, 0], parent: plinthGroup
  });

  // Contemplation gravel tray (Karesansui margin at -Z)
  createPart('GravelMargin', boxGeo(5.6, 0.03, 0.65), matGravel, {
    position: [0.2, 0.36, -1.8], parent: plinthGroup
  });
  // Raked garden stones
  createPart('GardenStoneA', sphereGeo(0.16, 8, 6), matBasaltPlinth, {
    position: [-1.4, 0.42, -1.8], scale: [1.2, 0.7, 0.9], parent: plinthGroup
  });
  createPart('GardenStoneB', sphereGeo(0.22, 8, 6), matBasaltPlinth, {
    position: [0.6, 0.44, -1.78], scale: [1.3, 0.8, 1.0], parent: plinthGroup
  });
  createPart('GardenStoneC', sphereGeo(0.12, 8, 6), matBasaltPlinth, {
    position: [1.8, 0.40, -1.82], scale: [0.9, 0.6, 0.8], parent: plinthGroup
  });

  // Raised Honed Ivory Stone Dais for Tea Ceremony
  createPart('IvoryTeaDais', boxGeo(2.5, 0.08, 2.0), matIvoryDais, {
    position: [0.4, 0.39, 0.1], parent: plinthGroup
  });

  // ==========================================
  // 2. TIMBER STRUCTURAL FRAME (Columns, Shoes, Corbels, Girders)
  // ==========================================
  const frameGroup = createPivot('StructuralFrame', [0, 0, 0], root);

  const columnLocs = [
    { name: 'Col_LowRear', x: -2.0, z: -1.55, h: 2.22 },
    { name: 'Col_LowFront', x: -2.0, z: 1.55, h: 2.22 },
    { name: 'Col_HighRear', x: 1.9, z: -1.65, h: 3.20 },
    { name: 'Col_HighFront', x: 1.9, z: 1.65, h: 3.42 },
  ];

  for (const c of columnLocs) {
    // Blackened steel shoe base
    createPart(`${c.name}_Shoe`, boxGeo(0.26, 0.12, 0.26), matBlackSteel, {
      position: [c.x, 0.41, c.z], parent: frameGroup
    });
    // Main column timber shaft
    createPart(`${c.name}_Shaft`, boxGeo(0.20, c.h, 0.20), matTimberPost, {
      position: [c.x, 0.35 + c.h / 2, c.z], parent: frameGroup
    });
    // Corbel capital block (dougong bracket block)
    const capY = 0.35 + c.h + 0.06;
    createPart(`${c.name}_Capital`, boxGeo(0.32, 0.12, 0.32), matTimberRib, {
      position: [c.x, capY, c.z], parent: frameGroup
    });
    // Blackened steel joint bracket collar
    createPart(`${c.name}_JointCollar`, boxGeo(0.24, 0.04, 0.24), matBlackSteel, {
      position: [c.x, capY - 0.07, c.z], parent: frameGroup
    });
    // Transverse bracket arm
    createPart(`${c.name}_TransArm`, boxGeo(0.14, 0.10, 0.70), matTimberRib, {
      position: [c.x, capY + 0.08, c.z], parent: frameGroup
    });
    // Longitudinal bracket arm
    createPart(`${c.name}_LongArm`, boxGeo(0.70, 0.10, 0.14), matTimberRib, {
      position: [c.x, capY + 0.16, c.z], parent: frameGroup
    });
  }

  // Primary Longitudinal Girders (spanning across columns)
  createPart('GirderRear', boxGeo(5.2, 0.20, 0.16), matTimberPost, {
    position: [-0.05, 2.92, -1.60], rotation: [-4.5, 0, 0], parent: frameGroup
  });
  createPart('GirderFront', boxGeo(5.2, 0.20, 0.16), matTimberPost, {
    position: [-0.05, 3.02, 1.60], rotation: [-5.0, 0, 0], parent: frameGroup
  });
  // Cross Tie Beams
  createPart('TieBeamLow', boxGeo(0.16, 0.18, 3.4), matTimberPost, {
    position: [-2.0, 2.65, 0], parent: frameGroup
  });
  createPart('TieBeamHigh', boxGeo(0.16, 0.18, 3.6), matTimberPost, {
    position: [1.9, 3.62, 0], parent: frameGroup
  });

  // ==========================================
  // 3. SCULPTURAL TIMBER LAMELLA ROOF
  // ==========================================
  const roofGroup = createPivot('LamellaRoof', [0, 0, 0], root);

  // 3A. Longitudinal glulam sweeping ribs (17 ribs across width)
  const ribCount = 17;
  const ribProfile = [
    [-0.032, -0.065],
    [0.032, -0.065],
    [0.032, 0.065],
    [-0.032, 0.065]
  ];

  for (let i = 0; i < ribCount; i++) {
    const v = i / (ribCount - 1);
    const stations = [];
    const numSamples = 24;
    for (let s = 0; s < numSamples; s++) {
      const u = s / (numSamples - 1);
      stations.push(evalRoofSurface(u, v));
    }
    const ribGeo = sweepProfile(ribProfile, stations, { cap: true, up: [0, 1, 0] });
    createPart(`GlulamRib_${i}`, ribGeo, matTimberRib, { parent: roofGroup });
  }

  // 3B. Transverse curved arch ribs (13 cross ribs along length)
  const crossRibCount = 13;
  const crossProfile = [
    [-0.045, -0.028],
    [0.045, -0.028],
    [0.045, 0.028],
    [-0.045, 0.028]
  ];

  for (let j = 0; j < crossRibCount; j++) {
    const u = j / (crossRibCount - 1);
    const crossStations = [];
    const numZSamples = 20;
    for (let k = 0; k < numZSamples; k++) {
      const v = k / (numZSamples - 1);
      crossStations.push(evalRoofSurface(u, v));
    }
    const crossGeo = sweepProfile(crossProfile, crossStations, { cap: true, up: [0, 1, 0] });
    createPart(`CrossRib_${j}`, crossGeo, matTimberRib, { parent: roofGroup });
  }

  // 3C. Diagonal lamella lattice struts (diamond bracing)
  const diagSegments = 8;
  for (let d = 0; d < diagSegments; d++) {
    const u0 = d / diagSegments;
    const u1 = (d + 1) / diagSegments;
    for (let r = 0; r < 8; r++) {
      const v0 = r / 8;
      const v1 = (r + 1) / 8;
      const pA = evalRoofSurface(u0, v0);
      const pB = evalRoofSurface(u1, v1);
      const pC = evalRoofSurface(u0, v1);
      const pD = evalRoofSurface(u1, v0);
      beamBetween(`DiagLatticeA_${d}_${r}`, pA, pB, 0.016, matTimberRib, { parent: roofGroup });
      beamBetween(`DiagLatticeB_${d}_${r}`, pC, pD, 0.016, matTimberRib, { parent: roofGroup });
    }
  }

  // 3D. Sculptural Canopy Deck Shell (thin layered cedar skin atop the lattice)
  const canopyGeo = parametricSurface((u, v) => {
    const pt = evalRoofSurface(u, v);
    return [pt[0], pt[1] + 0.07, pt[2]];
  }, {
    u: [0, 1],
    v: [0, 1],
    uSegments: 52,
    vSegments: 26,
    orientation: 'uv'
  });
  matCanopyDeck.side = THREE.DoubleSide;
  createPart('CanopyDeck', canopyGeo, matCanopyDeck, { parent: roofGroup });

  // 3E. Sweeping edge fascia ribbon beams (curving edges)
  const fasciaProfile = [
    [-0.04, -0.12],
    [0.04, -0.12],
    [0.04, 0.12],
    [-0.04, 0.12]
  ];
  const leftFasciaPts = [];
  for (let s = 0; s < 30; s++) leftFasciaPts.push(evalRoofSurface(s / 29, 0));
  createPart('FasciaLeft', sweepProfile(fasciaProfile, leftFasciaPts, { cap: true, up: [0, 1, 0] }), matTimberPost, { parent: roofGroup });

  const rightFasciaPts = [];
  for (let s = 0; s < 30; s++) rightFasciaPts.push(evalRoofSurface(s / 29, 1));
  createPart('FasciaRight', sweepProfile(fasciaProfile, rightFasciaPts, { cap: true, up: [0, 1, 0] }), matTimberPost, { parent: roofGroup });

  const curlTipPts = [];
  for (let s = 0; s < 26; s++) curlTipPts.push(evalRoofSurface(1, s / 25));
  createPart('CurlingProwBeam', sweepProfile(fasciaProfile, curlTipPts, { cap: true, up: [0, 1, 0] }), matTimberPost, { parent: roofGroup });

  // ==========================================
  // 4. FLOATING BENCHES & MEDITATION SEATING
  // ==========================================
  const seatingGroup = createPivot('SeatingGroup', [0, 0, 0], root);

  createPart('BenchPier_0', boxGeo(0.35, 0.32, 0.42), matBasaltPlinth, {
    position: [-1.4, 0.51, -1.25], parent: seatingGroup
  });
  createPart('BenchPier_1', boxGeo(0.35, 0.32, 0.42), matBasaltPlinth, {
    position: [0.6, 0.51, -1.25], parent: seatingGroup
  });
  createPart('MainBenchPlank', boxGeo(2.8, 0.09, 0.50), matTimberFine, {
    position: [-0.4, 0.71, -1.25], parent: seatingGroup
  });
  createPart('MainBenchBackrest', boxGeo(2.6, 0.07, 0.05), matTimberFine, {
    position: [-0.4, 0.98, -1.46], parent: seatingGroup
  });
  createPart('BenchSupportSteel_0', cylinderGeo(0.015, 0.015, 0.28, 8), matBlackSteel, {
    position: [-1.2, 0.85, -1.45], parent: seatingGroup
  });
  createPart('BenchSupportSteel_1', cylinderGeo(0.015, 0.015, 0.28, 8), matBlackSteel, {
    position: [0.4, 0.85, -1.45], parent: seatingGroup
  });

  createPart('GardenBenchPlank', boxGeo(0.45, 0.08, 1.8), matTimberFine, {
    position: [-2.6, 0.62, 0], parent: seatingGroup
  });
  createPart('GardenBenchPier', boxGeo(0.35, 0.27, 1.4), matBasaltPlinth, {
    position: [-2.6, 0.485, 0], parent: seatingGroup
  });

  // ==========================================
  // 5. RESTRAINED TEA CEREMONY SETTING
  // ==========================================
  const teaGroup = createPivot('TeaSettingGroup', [0.4, 0.43, 0.1], root);

  createPart('TeaTable', boxGeo(1.30, 0.22, 0.55), matTimberPost, {
    position: [0, 0.11, 0], parent: teaGroup
  });
  createPart('TeaTableSurface', boxGeo(1.34, 0.03, 0.59), matTimberFine, {
    position: [0, 0.235, 0], parent: teaGroup
  });

  createPart('CushionMaster', boxGeo(0.48, 0.065, 0.48), matIvoryLinen, {
    position: [0.05, 0.033, 0.60], parent: teaGroup
  });
  createPart('CushionMasterTrim', boxGeo(0.49, 0.015, 0.49), matCharcoalStep, {
    position: [0.05, 0.01, 0.60], parent: teaGroup
  });
  createPart('CushionGuest', boxGeo(0.48, 0.065, 0.48), matIvoryLinen, {
    position: [0.05, 0.033, -0.60], parent: teaGroup
  });
  createPart('CushionGuestTrim', boxGeo(0.49, 0.015, 0.49), matCharcoalStep, {
    position: [0.05, 0.01, -0.60], parent: teaGroup
  });

  createPart('TeaTray', boxGeo(0.50, 0.025, 0.30), matBasaltPlinth, {
    position: [0.05, 0.262, 0], parent: teaGroup
  });
  createPart('TeaTrayInsert', boxGeo(0.46, 0.01, 0.26), matTimberFine, {
    position: [0.05, 0.275, 0], parent: teaGroup
  });
  // Slotted drainage slats on tea tray
  for (let s = -2; s <= 2; s++) {
    createPart(`TeaTraySlat_${s + 2}`, boxGeo(0.42, 0.005, 0.016), matCharcoalStep, {
      position: [0.05, 0.281, s * 0.045], parent: teaGroup
    });
  }

  createPart('KettleTrivet', cylinderGeo(0.09, 0.09, 0.015, 16), matBlackSteel, {
    position: [0.42, 0.257, 0.02], parent: teaGroup
  });
  createPart('KettleBody', cylinderGeo(0.075, 0.095, 0.12, 18), matCastIron, {
    position: [0.42, 0.325, 0.02], parent: teaGroup
  });
  createPart('KettleLid', cylinderGeo(0.055, 0.072, 0.02, 16), matCastIron, {
    position: [0.42, 0.395, 0.02], parent: teaGroup
  });
  createPart('KettleKnob', sphereGeo(0.015, 10, 8), matBlackSteel, {
    position: [0.42, 0.415, 0.02], parent: teaGroup
  });
  createPart('KettleSpout', cylinderGeo(0.012, 0.022, 0.09, 12), matCastIron, {
    position: [0.32, 0.35, 0.02], rotation: [0, 0, 40], parent: teaGroup
  });

  const handlePts = [
    [0.42, 0.38, -0.08],
    [0.42, 0.48, -0.06],
    [0.42, 0.51, 0.02],
    [0.42, 0.48, 0.10],
    [0.42, 0.38, 0.12]
  ];
  createPart('KettleHandle', pipeAlongPath(handlePts, 0.008, { bendRadius: 0.02 }), matBlackSteel, { parent: teaGroup });

  createPart('KyusuBody', sphereGeo(0.055, 16, 12), matIvoryPorcelain, {
    position: [0.12, 0.305, 0.02], scale: [1, 0.85, 1], parent: teaGroup
  });
  createPart('KyusuLid', cylinderGeo(0.038, 0.045, 0.015, 16), matIvoryPorcelain, {
    position: [0.12, 0.355, 0.02], parent: teaGroup
  });
  createPart('KyusuKnob', sphereGeo(0.009, 8, 6), matIvoryPorcelain, {
    position: [0.12, 0.368, 0.02], parent: teaGroup
  });
  createPart('KyusuSpout', cylinderGeo(0.008, 0.016, 0.045, 10), matIvoryPorcelain, {
    position: [0.06, 0.315, 0.02], rotation: [0, 0, 45], parent: teaGroup
  });
  createPart('KyusuHandle', cylinderGeo(0.010, 0.010, 0.065, 10), matTimberFine, {
    position: [0.12, 0.32, 0.09], rotation: [90, 0, 0], parent: teaGroup
  });

  const cupLocations = [
    { name: 'CupMaster', x: 0.02, z: 0.09 },
    { name: 'CupGuestA', x: 0.02, z: -0.07 },
    { name: 'CupGuestB', x: 0.16, z: -0.07 }
  ];
  for (const cup of cupLocations) {
    createPart(`${cup.name}_Bowl`, cylinderGeo(0.032, 0.020, 0.042, 16), matIvoryPorcelain, {
      position: [cup.x, 0.30, cup.z], parent: teaGroup
    });
    createPart(`${cup.name}_Tea`, cylinderGeo(0.028, 0.028, 0.006, 14), matTeaLiquor, {
      position: [cup.x, 0.312, cup.z], parent: teaGroup
    });
  }

  // Cast iron Incense Burner (Koro) on the tea altar
  createPart('KoroBowl', cylinderGeo(0.038, 0.025, 0.038, 14), matCastIron, {
    position: [-0.44, 0.27, -0.16], parent: teaGroup
  });
  createPart('KoroLid', coneGeo(0.036, 0.025, 12), matBlackSteel, {
    position: [-0.44, 0.30, -0.16], parent: teaGroup
  });

  createPart('ChashakuScoop', boxGeo(0.14, 0.004, 0.012), matBamboo, {
    position: [-0.18, 0.282, -0.04], rotation: [3, 12, 2], parent: teaGroup
  });

  createPart('KensuiBowl', cylinderGeo(0.075, 0.055, 0.08, 16), matCharcoalStep, {
    position: [-0.35, 0.29, 0.12], parent: teaGroup
  });

  // ==========================================
  // 6. ARCHITECTURAL ZEN ACCENTS (Basin & Lantern)
  // ==========================================
  const gardenGroup = createPivot('GardenAccents', [0, 0, 0], root);

  const basinBasePos = [2.6, 0.35, -1.8];
  createPart('TsukubaiStone', cylinderGeo(0.34, 0.38, 0.44, 12), matBasaltPlinth, {
    position: [basinBasePos[0], basinBasePos[1] + 0.22, basinBasePos[2]], parent: gardenGroup
  });
  createPart('TsukubaiWater', cylinderGeo(0.25, 0.25, 0.02, 16), matWater, {
    position: [basinBasePos[0], basinBasePos[1] + 0.432, basinBasePos[2]], parent: gardenGroup
  });
  createPart('KakehiUpright', cylinderGeo(0.025, 0.025, 0.70, 10), matBamboo, {
    position: [basinBasePos[0] + 0.28, basinBasePos[1] + 0.35, basinBasePos[2] - 0.25], parent: gardenGroup
  });
  createPart('KakehiSpout', cylinderGeo(0.020, 0.020, 0.42, 10), matBamboo, {
    position: [basinBasePos[0] + 0.18, basinBasePos[1] + 0.60, basinBasePos[2] - 0.16], rotation: [22, 40, 0], parent: gardenGroup
  });

  // Bamboo Water Ladle (Hishaku) resting on basin rim
  createPart('HishakuHandle', cylinderGeo(0.005, 0.005, 0.40, 8), matBamboo, {
    position: [basinBasePos[0], basinBasePos[1] + 0.46, basinBasePos[2]], rotation: [0, 30, 90], parent: gardenGroup
  });
  createPart('HishakuCup', cylinderGeo(0.026, 0.024, 0.035, 10), matBamboo, {
    position: [basinBasePos[0] - 0.16, basinBasePos[1] + 0.48, basinBasePos[2] - 0.09], parent: gardenGroup
  });

  const lanternPos = [-2.6, 0.35, 1.8];
  createPart('ToroBase', boxGeo(0.40, 0.14, 0.40), matBasaltPlinth, {
    position: [lanternPos[0], lanternPos[1] + 0.07, lanternPos[2]], parent: gardenGroup
  });
  createPart('ToroPost', cylinderGeo(0.10, 0.12, 0.25, 10), matCharcoalStep, {
    position: [lanternPos[0], lanternPos[1] + 0.265, lanternPos[2]], parent: gardenGroup
  });
  createPart('ToroPlatform', boxGeo(0.44, 0.08, 0.44), matBasaltPlinth, {
    position: [lanternPos[0], lanternPos[1] + 0.43, lanternPos[2]], parent: gardenGroup
  });
  createPart('ToroFireBox', boxGeo(0.24, 0.22, 0.24), matLanternGlow, {
    position: [lanternPos[0], lanternPos[1] + 0.58, lanternPos[2]], parent: gardenGroup
  });
  createPart('ToroRoofCap', coneGeo(0.38, 0.18, 4), matBasaltPlinth, {
    position: [lanternPos[0], lanternPos[1] + 0.78, lanternPos[2]], rotation: [0, 45, 0], parent: gardenGroup
  });

  return root;
}
