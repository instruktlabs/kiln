// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Art Deco Radio - Collectible 1930s Cathedral/Waterfall Tabletop Model
const meta = {
  name: 'Art Deco Radio',
  category: 'prop',
  role: 'prop'
};

async function build() {
  const root = createRoot('ArtDecoRadio');

  // Materials
  const walnutMat = gameMaterial(0x4a2a18, { roughness: 0.42, metalness: 0.06 });
  const darkWoodMat = gameMaterial(0x23140c, { roughness: 0.48, metalness: 0.04 });
  const brassMat = gameMaterial(0xd4af37, { roughness: 0.22, metalness: 0.88 });
  const antiqueBrassMat = gameMaterial(0x9e7b2c, { roughness: 0.35, metalness: 0.82 });
  const grilleClothMat = gameMaterial(0xc29b38, { roughness: 0.92, metalness: 0.02 });
  const dialFaceMat = gameMaterial(0xfcf5e5, { roughness: 0.55, emissive: 0xffd27d, emissiveIntensity: 0.32 });
  const dialGlassMat = glassMaterial(0xd8f0ff, { opacity: 0.32, roughness: 0.08 });
  const pointerMat = gameMaterial(0xd32f2f, { roughness: 0.30, metalness: 0.10 });
  const bakeliteMat = gameMaterial(0x1a120e, { roughness: 0.32, metalness: 0.08 });
  const pilotJewelMat = gameMaterial(0xdd1818, { roughness: 0.15, emissive: 0xff2200, emissiveIntensity: 0.75 });
  const backPanelMat = walnutMat;
  const dialTickMat = gameMaterial(0x2b1c11, { roughness: 0.6 });

  // 1. Stepped Plinth Base & Corner Feet
  const lowerPlinthGeo = await roundedBoxGeo(0.200, 0.015, 0.340, 0.004, { segments: 32 });
  createPart('LowerPlinth', lowerPlinthGeo, darkWoodMat, { position: [0, 0.0075, 0], parent: root });

  const plinthBrassGeo = boxGeo(0.194, 0.004, 0.330);
  createPart('PlinthBrassTrim', plinthBrassGeo, brassMat, { position: [0, 0.017, 0], parent: root });

  const upperPlinthGeo = await roundedBoxGeo(0.186, 0.014, 0.316, 0.0035, { segments: 32 });
  createPart('UpperPlinth', upperPlinthGeo, darkWoodMat, { position: [0, 0.026, 0], parent: root });

  const footPositions = [
    [0.075, 0.003, 0.140],
    [0.075, 0.003, -0.140],
    [-0.075, 0.003, 0.140],
    [-0.075, 0.003, -0.140]
  ];
  footPositions.forEach((pos, idx) => {
    const footGeo = cylinderYGeo(0.014, 0.011, 0.006, 32);
    createPart(`Foot_${idx + 1}`, footGeo, antiqueBrassMat, { position: pos, parent: root });
    const footRingGeo = cylinderYGeo(0.016, 0.016, 0.002, 32);
    createPart(`FootRing_${idx + 1}`, footRingGeo, brassMat, { position: [pos[0], 0.004, pos[2]], parent: root });
  });

  // 2. Stepped Silhouette Cabinet Body
  const wingGeo = await roundedBoxGeo(0.165, 0.200, 0.050, 0.014, { segments: 36 });
  createPart('LeftWing', wingGeo, walnutMat, { position: [0, 0.133, -0.125], parent: root });
  createPart('RightWing', wingGeo, walnutMat, { position: [0, 0.133, 0.125], parent: root });

  [-0.151, 0.151].forEach((zSide, sideIdx) => {
    [-0.03, 0, 0.03].forEach((yOffset, ribIdx) => {
      const ribGeo = cylinderXGeo(0.002, 0.002, 0.12, 16);
      createPart(`WingRib_${sideIdx}_${ribIdx}`, ribGeo, brassMat, {
        position: [0, 0.133 + yOffset, zSide],
        parent: root
      });
    });
  });

  const shoulderGeo = await roundedBoxGeo(0.172, 0.280, 0.026, 0.010, { segments: 36 });
  createPart('LeftShoulder', shoulderGeo, walnutMat, { position: [0, 0.173, -0.088], parent: root });
  createPart('RightShoulder', shoulderGeo, walnutMat, { position: [0, 0.173, 0.088], parent: root });

  // Reeded decorative wood pilasters on shoulders
  [-0.096, -0.088, -0.080, 0.080, 0.088, 0.096].forEach((zPos, pIdx) => {
    const reedGeo = cylinderYGeo(0.002, 0.002, 0.264, 16);
    createPart(`ShoulderReed_${pIdx}`, reedGeo, darkWoodMat, {
      position: [0.0865, 0.173, zPos],
      parent: root
    });
  });

  const centerTowerGeo = await roundedBoxGeo(0.178, 0.347, 0.150, 0.018, { segments: 42 });
  createPart('CenterTower', centerTowerGeo, walnutMat, { position: [0, 0.206, 0], parent: root });

  // Waterfall Top Brass Speed Ribbons
  [-0.038, 0, 0.038].forEach((zPos, rIdx) => {
    const topRibbonGeo = boxGeo(0.140, 0.003, 0.003);
    createPart(`WaterfallRibbon_${rIdx}`, topRibbonGeo, brassMat, {
      position: [0, 0.380, zPos],
      parent: root
    });
  });

  [-0.076, 0.076].forEach((zPos, idx) => {
    const pillarGeo = cylinderYGeo(0.0035, 0.0035, 0.276, 20);
    createPart(`DecoPillar_${idx + 1}`, pillarGeo, brassMat, { position: [0.088, 0.174, zPos], parent: root });
    const capGeo = boxGeo(0.010, 0.006, 0.010);
    createPart(`PillarCap_${idx + 1}`, capGeo, brassMat, { position: [0.088, 0.314, zPos], parent: root });
    const baseGeo = boxGeo(0.010, 0.006, 0.010);
    createPart(`PillarBase_${idx + 1}`, baseGeo, brassMat, { position: [0.088, 0.035, zPos], parent: root });
  });

  const crestTiers = [
    { size: [0.110, 0.005, 0.070], y: 0.382 },
    { size: [0.085, 0.005, 0.048], y: 0.387 },
    { size: [0.055, 0.005, 0.026], y: 0.392 }
  ];
  crestTiers.forEach((tier, idx) => {
    const tierGeo = boxGeo(tier.size[0], tier.size[1], tier.size[2]);
    createPart(`ApexCrest_${idx + 1}`, tierGeo, brassMat, { position: [0, tier.y, 0], parent: root });
  });

  // 3. Speaker Grille & Woven Geometric Fretwork
  // Open 4-piece stepped brass bezel frame around acoustic aperture (projects from X=0.088 to 0.096)
  const grilleFrameT = 0.008;
  const grilleTopBar = boxGeo(grilleFrameT, 0.010, 0.124);
  createPart('GrilleFrameTop', grilleTopBar, brassMat, { position: [0.092, 0.275 + 0.063, 0], parent: root });
  const grilleBotBar = boxGeo(grilleFrameT, 0.010, 0.124);
  createPart('GrilleFrameBot', grilleBotBar, brassMat, { position: [0.092, 0.275 - 0.063, 0], parent: root });
  const grilleLeftBar = boxGeo(grilleFrameT, 0.116, 0.010);
  createPart('GrilleFrameLeft', grilleLeftBar, brassMat, { position: [0.092, 0.275, -0.057], parent: root });
  const grilleRightBar = boxGeo(grilleFrameT, 0.116, 0.010);
  createPart('GrilleFrameRight', grilleRightBar, brassMat, { position: [0.092, 0.275, 0.057], parent: root });

  // Acoustic Fabric Backing (Woven golden cloth sitting cleanly in aperture at X = 0.0898)
  const clothGeo = boxGeo(0.002, 0.116, 0.104);
  createPart('GrilleCloth', clothGeo, grilleClothMat, { position: [0.0898, 0.275, 0], parent: root });

  // Woven cloth weave texture: interwoven vertical warp & horizontal weft bars
  [-0.045, -0.038, -0.031, -0.024, -0.017, -0.010, -0.003, 0.004, 0.011, 0.018, 0.025, 0.032, 0.039, 0.046].forEach((zPos, idx) => {
    const warpGeo = cylinderYGeo(0.0006, 0.0006, 0.114, 16);
    createPart(`GrilleWarp_${idx}`, warpGeo, darkWoodMat, { position: [0.0910, 0.275, zPos], parent: root });
  });

  [-0.050, -0.040, -0.030, -0.020, -0.010, 0, 0.010, 0.020, 0.030, 0.040, 0.050].forEach((yOff, idx) => {
    const weftGeo = cylinderZGeo(0.0006, 0.0006, 0.098, 16);
    createPart(`GrilleWeft_${idx}`, weftGeo, grilleClothMat, { position: [0.0916, 0.275 + yOff, 0], parent: root });
  });

  // Woven-look Chevron Fretwork in front of fabric
  const chevronTiers = [0.038, 0.014, -0.010, -0.034];
  chevronTiers.forEach((yOff, cIdx) => {
    const armGeoL = boxGeo(0.002, 0.0035, 0.048);
    createPart(`Chevron_L_${cIdx}`, armGeoL, darkWoodMat, {
      position: [0.0926, 0.275 + yOff, -0.024],
      rotation: [22, 0, 0],
      parent: root
    });
    const armGeoR = boxGeo(0.002, 0.0035, 0.048);
    createPart(`Chevron_R_${cIdx}`, armGeoR, darkWoodMat, {
      position: [0.0926, 0.275 + yOff, 0.024],
      rotation: [-22, 0, 0],
      parent: root
    });
  });

  // Vertical brass speedbars over the chevron fretwork
  [-0.022, 0, 0.022].forEach((zPos, idx) => {
    const barGeo = cylinderYGeo(0.0018, 0.0018, 0.114, 16);
    createPart(`GrilleCenterBar_${idx}`, barGeo, brassMat, { position: [0.0938, 0.275, zPos], parent: root });
  });

  // Brass Diamond Medallion in center of grille
  const medallionGeo = boxGeo(0.0035, 0.018, 0.018);
  createPart('GrilleMedallion', medallionGeo, brassMat, { position: [0.0948, 0.275, 0], rotation: [45, 0, 0], parent: root });

  // 4. Inset Glass Tuning Dial & Animated Pointer
  // Stepped brass bezel frame projecting from X = 0.089 to 0.098
  const dialFrameT = 0.009;
  const dialTopBar = boxGeo(dialFrameT, 0.010, 0.114);
  createPart('DialFrameTop', dialTopBar, brassMat, { position: [0.0935, 0.165 + 0.028, 0], parent: root });
  const dialBotBar = boxGeo(dialFrameT, 0.010, 0.114);
  createPart('DialFrameBot', dialBotBar, brassMat, { position: [0.0935, 0.165 - 0.028, 0], parent: root });
  const dialLeftBar = boxGeo(dialFrameT, 0.046, 0.011);
  createPart('DialFrameLeft', dialLeftBar, brassMat, { position: [0.0935, 0.165, -0.051], parent: root });
  const dialRightBar = boxGeo(dialFrameT, 0.046, 0.011);
  createPart('DialFrameRight', dialRightBar, brassMat, { position: [0.0935, 0.165, 0.051], parent: root });

  // Recessed Illuminated Dial Face Backplate (sitting cleanly at X = 0.0902)
  const dialFaceGeo = boxGeo(0.002, 0.046, 0.090);
  createPart('DialFace', dialFaceGeo, dialFaceMat, { position: [0.0902, 0.165, 0], parent: root });

  // Dial Frequency Scale Markings (crisp station bands)
  const scaleLineAM = boxGeo(0.001, 0.0018, 0.076);
  createPart('ScaleLineAM', scaleLineAM, dialTickMat, { position: [0.0920, 0.176, 0], parent: root });

  const scaleLineSW = boxGeo(0.001, 0.0018, 0.076);
  createPart('ScaleLineSW', scaleLineSW, dialTickMat, { position: [0.0920, 0.154, 0], parent: root });

  for (let t = -8; t <= 8; t++) {
    const isMajor = t % 2 === 0;
    const tickH = isMajor ? 0.006 : 0.0035;
    const tickGeo = boxGeo(0.001, tickH, 0.0012);
    createPart(`DialTick_${t + 8}`, tickGeo, dialTickMat, {
      position: [0.0920, 0.176 - (isMajor ? 0.0025 : 0.001), t * 0.0044],
      parent: root
    });
  }

  // Animated Tuning Pointer (mounted on Joint_TuningPointer, swinging at X = 0.0924)
  const pointerPivot = createPivot('TuningPointer', [0.0924, 0.144, 0], root);

  const needleArmGeo = boxGeo(0.0014, 0.034, 0.0018);
  createPart('NeedleArm', needleArmGeo, pointerMat, { position: [0, 0.017, 0], parent: pointerPivot });

  const needleTipGeo = cylinderYGeo(0.0006, 0.0018, 0.006, 12);
  createPart('NeedleTip', needleTipGeo, pointerMat, { position: [0, 0.034, 0], parent: pointerPivot });

  const pointerHubGeo = cylinderXGeo(0.004, 0.004, 0.0025, 24);
  createPart('NeedleHub', pointerHubGeo, brassMat, { position: [0, 0, 0], parent: pointerPivot });

  // Protective Inset Dial Glass (recessed inside bezel at X = 0.0945)
  const glassGeo = boxGeo(0.0015, 0.050, 0.094);
  createPart('DialGlass', glassGeo, dialGlassMat, { position: [0.0960, 0.165, 0], parent: root });

  // 5. Tactile Differentiated Knobs
  // Center Tuning Knob (with 18 flutes and brass cap, animated on Joint_TuningKnob)
  const tuningKnobPivot = createPivot('TuningKnob', [0.092, 0.076, 0], root);

  const centerBezelGeo = cylinderXGeo(0.017, 0.017, 0.003, 28);
  createPart('TuningKnobBezel', centerBezelGeo, brassMat, { position: [0.0015, 0, 0], parent: tuningKnobPivot });

  const centerBodyGeo = cylinderXGeo(0.0145, 0.0155, 0.014, 28);
  createPart('TuningKnobBody', centerBodyGeo, bakeliteMat, { position: [0.008, 0, 0], parent: tuningKnobPivot });

  const fluteCount = 24;
  for (let f = 0; f < fluteCount; f++) {
    const angle = (f * (360 / fluteCount)) * (Math.PI / 180);
    const fluteGeo = cylinderXGeo(0.0013, 0.0013, 0.012, 14);
    createPart(`TuningFlute_${f}`, fluteGeo, bakeliteMat, {
      position: [0.008, 0.0152 * Math.cos(angle), 0.0152 * Math.sin(angle)],
      parent: tuningKnobPivot
    });
  }

  const centerCapGeo = cylinderXGeo(0.009, 0.009, 0.002, 28);
  createPart('TuningCap', centerCapGeo, brassMat, { position: [0.015, 0, 0], parent: tuningKnobPivot });

  const tuningPipGeo = boxGeo(0.002, 0.003, 0.0015);
  createPart('TuningPip', tuningPipGeo, pointerMat, { position: [0.0158, 0.006, 0], parent: tuningKnobPivot });

  // Left Knob: Dual-Concentric Volume / Tone Knob
  const leftKnobBaseGeo = cylinderXGeo(0.013, 0.014, 0.008, 24);
  createPart('VolumeKnobBase', leftKnobBaseGeo, darkWoodMat, { position: [0.094, 0.076, -0.054], parent: root });

  const leftKnobBrassRim = cylinderXGeo(0.0142, 0.0142, 0.0025, 24);
  createPart('VolumeKnobRim', leftKnobBrassRim, brassMat, { position: [0.0985, 0.076, -0.054], parent: root });

  const leftKnobInnerGeo = cylinderXGeo(0.0075, 0.008, 0.015, 20);
  createPart('VolumeKnobInner', leftKnobInnerGeo, bakeliteMat, { position: [0.103, 0.076, -0.054], parent: root });

  const leftKnobCapGeo = cylinderXGeo(0.005, 0.005, 0.002, 20);
  createPart('VolumeKnobCap', leftKnobCapGeo, brassMat, { position: [0.111, 0.076, -0.054], parent: root });

  // Right Knob: Art Deco Teardrop Band Selector Knob
  const rightKnobHubGeo = cylinderXGeo(0.012, 0.0125, 0.009, 24);
  createPart('SelectorKnobHub', rightKnobHubGeo, bakeliteMat, { position: [0.094, 0.076, 0.054], parent: root });

  const rightPointerArm = boxGeo(0.007, 0.016, 0.005);
  createPart('SelectorPointerArm', rightPointerArm, bakeliteMat, {
    position: [0.097, 0.082, 0.058],
    rotation: [30, 0, 0],
    parent: root
  });

  const rightKnobCap = cylinderXGeo(0.006, 0.006, 0.002, 20);
  createPart('SelectorKnobCap', rightKnobCap, brassMat, { position: [0.101, 0.076, 0.054], parent: root });

  // 6. Fine Details
  const lampBezelGeo = cylinderXGeo(0.0055, 0.0055, 0.003, 16);
  createPart('PilotLampBezel', lampBezelGeo, brassMat, { position: [0.090, 0.114, 0], parent: root });

  const jewelGeo = cylinderXGeo(0.0035, 0.002, 0.003, 14);
  createPart('PilotJewel', jewelGeo, pilotJewelMat, { position: [0.092, 0.114, 0], parent: root });

  const plaqueGeo = boxGeo(0.002, 0.009, 0.042);
  createPart('BrandPlaque', plaqueGeo, brassMat, { position: [0.090, 0.048, 0], parent: root });

  const plaqueInlayGeo = boxGeo(0.001, 0.006, 0.036);
  createPart('BrandPlaqueInlay', plaqueInlayGeo, darkWoodMat, { position: [0.0912, 0.048, 0], parent: root });

  // Center rear panel fitting stepped cabinet silhouette
  const backBoardGeo = boxGeo(0.004, 0.298, 0.112);
  createPart('BackPanel', backBoardGeo, backPanelMat, { position: [-0.089, 0.1995, 0], parent: root });

  // Wing rear panels matching stepped flanks
  [-0.125, 0.125].forEach((zPos, idx) => {
    const wingBackGeo = boxGeo(0.004, 0.162, 0.020);
    createPart(`WingBack_${idx}`, wingBackGeo, backPanelMat, { position: [-0.0825, 0.133, zPos], parent: root });
  });

  for (let v = 0; v < 5; v++) {
    const louverGeo = boxGeo(0.002, 0.005, 0.100);
    createPart(`BackLouver_${v}`, louverGeo, darkWoodMat, { position: [-0.092, 0.230 - v * 0.018, 0], parent: root });
  }

  const grommetGeo = cylinderXGeo(0.006, 0.006, 0.004, 16);
  createPart('PowerGrommet', grommetGeo, bakeliteMat, { position: [-0.092, 0.062, 0.040], parent: root });

  return root;
}

function animate(root) {
  const pointerTrack = rotationTrack('Joint_TuningPointer', [
    { time: 0.0, rotation: [-24, 0, 0] },
    { time: 1.2, rotation: [10, 0, 0] },
    { time: 2.2, rotation: [26, 0, 0] },
    { time: 3.0, rotation: [-8, 0, 0] },
    { time: 4.0, rotation: [-24, 0, 0] }
  ]);

  const knobTrack = rotationTrack('Joint_TuningKnob', [
    { time: 0.0, rotation: [0, 0, 0] },
    { time: 1.2, rotation: [240, 0, 0] },
    { time: 2.2, rotation: [480, 0, 0] },
    { time: 3.0, rotation: [160, 0, 0] },
    { time: 4.0, rotation: [0, 0, 0] }
  ]);

  return [createClip('Tune', 4.0, [pointerTrack, knobTrack])];
}
