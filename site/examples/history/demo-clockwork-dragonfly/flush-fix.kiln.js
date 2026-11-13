// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = { name: 'Mechanical Dragonfly', category: 'prop', role: 'prop' };

function build() {
  const root = createRoot('MechanicalDragonfly');

  // Materials
  const brass = gameMaterial(0xc9973f, { metalness: 0.9, roughness: 0.32 });
  const darkBrass = gameMaterial(0x7a5a28, { metalness: 0.85, roughness: 0.45 });
  const copper = gameMaterial(0xa66a3a, { metalness: 0.9, roughness: 0.35 });
  const darkSteel = gameMaterial(0x3a3f44, { metalness: 0.8, roughness: 0.5 });
  const emeraldGlass = glassMaterial(0x1fd47a, { opacity: 0.5, roughness: 0.15 });
  const emeraldSolid = gameMaterial(0x0fae5f, { metalness: 0.3, roughness: 0.3, emissive: 0x0a5c34, emissiveIntensity: 0.6 });
  const eyeMat = gameMaterial(0x0fd67c, { metalness: 0.2, roughness: 0.2, emissive: 0x0bd86e, emissiveIntensity: 0.9 });

  const bodyY = 0.6;

  // Thorax — main brass barrel along X
  createPart('Thorax', capsuleGeo(0.14, 0.28, 8), brass, {
    position: [0.15, bodyY, 0], rotation: [0, 0, 90], parent: root
  });
  // Thorax top housing / wing motor case
  createPart('WingCase', boxGeo(0.34, 0.1, 0.2), darkBrass, {
    position: [0.12, bodyY + 0.12, 0], parent: root
  });
  // Thorax belly plate
  createPart('BellyPlate', boxGeo(0.3, 0.04, 0.12), copper, {
    position: [0.15, bodyY - 0.13, 0], parent: root
  });
  // Thorax front collar
  createPart('Collar', torusGeo(0.11, 0.025, 8, 20), copper, {
    position: [0.34, bodyY, 0], rotation: [0, 90, 0], parent: root
  });

  // Head
  createPart('Head', sphereGeo(0.105, 16, 12), darkBrass, {
    position: [0.5, bodyY + 0.02, 0], parent: root
  });
  createPart('EyeR', sphereGeo(0.058, 14, 10), eyeMat, {
    position: [0.55, bodyY + 0.07, 0.07], parent: root
  });
  createPart('EyeL', sphereGeo(0.058, 14, 10), eyeMat, {
    position: [0.55, bodyY + 0.07, -0.07], parent: root
  });
  // Mandibles / snout
  createPart('Snout', cylinderGeo(0.035, 0.055, 0.12, 10), brass, {
    position: [0.6, bodyY - 0.01, 0], rotation: [0, 0, -90], parent: root
  });
  // Antennae
  beamBetween('AntennaR', [0.57, bodyY + 0.09, 0.03], [0.78, bodyY + 0.22, 0.1], 0.008, darkSteel, { parent: root });
  beamBetween('AntennaL', [0.57, bodyY + 0.09, -0.03], [0.78, bodyY + 0.22, -0.1], 0.008, darkSteel, { parent: root });
  createPart('AntennaTipR', sphereGeo(0.015, 8, 6), emeraldSolid, { position: [0.78, bodyY + 0.22, 0.1], parent: root });
  createPart('AntennaTipL', sphereGeo(0.015, 8, 6), emeraldSolid, { position: [0.78, bodyY + 0.22, -0.1], parent: root });

  // Abdomen — 6 tapering segments along -X
  const segX = [-0.08, -0.22, -0.36, -0.49, -0.61, -0.72];
  const segR = [0.095, 0.085, 0.073, 0.06, 0.047, 0.035];
  for (let i = 0; i < segX.length; i++) {
    const x = segX[i];
    const r = segR[i];
    createPart('AbdomenSeg' + i, cylinderGeo(r * 0.92, r, 0.14, 14), i % 2 === 0 ? brass : copper, {
      position: [x, bodyY - 0.01 - i * 0.008, 0], rotation: [0, 0, 90], parent: root
    });
    // segment ring
    createPart('AbdomenRing' + i, torusGeo(r, 0.012, 6, 18), darkBrass, {
      position: [x + 0.064, bodyY - 0.01 - i * 0.008, 0], rotation: [0, 90, 0], parent: root
    });
  }
  // Tail tip stinger
  createPart('TailTip', coneGeo(0.032, 0.12, 12), darkSteel, {
    position: [-0.83, bodyY - 0.06, 0], rotation: [0, 0, 90], parent: root
  });
  createPart('TailJewel', sphereGeo(0.022, 10, 8), emeraldSolid, {
    position: [-0.74, bodyY + 0.005, 0], parent: root
  });

  // Exposed brass gears on both flanks
  function sideGears(side) {
    const z = 0.14 * side;
    const pivMain = createPivot('GearR_Main_' + (side > 0 ? 'R' : 'L'), [0.14, bodyY, z], root);
    createPart('GearMain_' + (side > 0 ? 'R' : 'L'),
      gearGeo({ teeth: 18, rootRadius: 0.085, tipRadius: 0.105, boreRadius: 0.02, height: 0.03 }),
      brass, { rotation: [90, 0, 0], parent: pivMain });
    createPart('GearHub_' + (side > 0 ? 'R' : 'L'), cylinderGeo(0.022, 0.022, 0.055, 10), darkSteel, {
      rotation: [90, 0, 0], parent: pivMain
    });

    const pivA = createPivot('GearR_Aft_' + (side > 0 ? 'R' : 'L'), [-0.03, bodyY + 0.02, z], root);
    createPart('GearAft_' + (side > 0 ? 'R' : 'L'),
      gearGeo({ teeth: 14, rootRadius: 0.058, tipRadius: 0.072, boreRadius: 0.014, height: 0.028 }),
      copper, { rotation: [90, 0, 0], parent: pivA });

    const pivS = createPivot('GearR_Small_' + (side > 0 ? 'R' : 'L'), [0.28, bodyY - 0.02, z * 0.95], root);
    createPart('GearSmall_' + (side > 0 ? 'R' : 'L'),
      gearGeo({ teeth: 10, rootRadius: 0.038, tipRadius: 0.05, boreRadius: 0.01, height: 0.026 }),
      brass, { rotation: [90, 0, 0], parent: pivS });
    return { pivMain, pivA, pivS };
  }
  sideGears(1);
  sideGears(-1);

  // Emerald wings — 4 panels
  function makeWing(name, px, pz, span, rootChord, tipChord, sweep, mirror) {
    const pivot = createPivot(name, [px, bodyY + 0.17, pz], root);
    const geo = wingGeo({ span: span, rootChord: rootChord, tipChord: tipChord, sweep: sweep, thickness: 0.008, dihedral: 0.04 });
    // mirror left wings across Z
    const rot = mirror ? [180, 0, 0] : [0, 0, 0];
    createPart(name + 'Panel', geo, emeraldGlass, { rotation: rot, parent: pivot });
    // brass leading-edge spar + 2 veins lying on the panel top surface
    const dir = mirror ? -1 : 1;
    const leadRootX = 0.0, leadTipX = -sweep;
    beamBetween(name + 'Spar', [leadRootX, 0.008, 0.01 * dir], [leadTipX, 0.012, (span - 0.01) * dir], 0.009, brass, { parent: pivot });
    beamBetween(name + 'VeinA', [-rootChord * 0.3, 0.007, 0.08 * dir], [leadTipX - 0.03, 0.01, span * 0.8 * dir], 0.0045, darkBrass, { parent: pivot });
    beamBetween(name + 'VeinB', [-rootChord * 0.55, 0.007, 0.06 * dir], [leadTipX - 0.05, 0.01, span * 0.62 * dir], 0.0045, darkBrass, { parent: pivot });
    // rounded emerald tip cap with brass rim (broad rounded tip)
    const tipR = tipChord / 2;
    const tipCX = -sweep;
    const tipCZ = (span - tipR * 0.3) * dir;
    createPart(name + 'TipCap', cylinderGeo(tipR, tipR, 0.007, 20), emeraldGlass, {
      position: [tipCX, 0.009, tipCZ], parent: pivot
    });
    createPart(name + 'TipRim', torusGeo(tipR, 0.006, 6, 24), brass, {
      position: [tipCX, 0.009, tipCZ], rotation: [90, 0, 0], parent: pivot
    });
    // wing root cap
    createPart(name + 'Root', boxGeo(0.1, 0.025, 0.06), brass, {
      position: [0, 0, 0.02 * dir], parent: pivot
    });
    return pivot;
  }
  makeWing('WingFrontR', 0.22, 0.09, 0.68, 0.32, 0.2, 0.22, false);
  makeWing('WingFrontL', 0.22, -0.09, 0.68, 0.32, 0.2, 0.22, true);
  makeWing('WingRearR', 0.0, 0.09, 0.58, 0.28, 0.17, 0.18, false);
  makeWing('WingRearL', 0.0, -0.09, 0.58, 0.28, 0.17, 0.18, true);

  // Six brass legs down to ground
  function leg(name, hipX, side, kneeSpread, footSpread, hipY) {
    const hx = hipX, hz = 0.08 * side;
    const kx = hipX - 0.05, ky = 0.32, kz = (0.08 + kneeSpread) * side;
    const fx = hipX - 0.02, fy = 0.016, fz = (0.08 + footSpread) * side;
    beamBetween(name + 'Upper', [hx, hipY, hz], [kx, ky, kz], 0.014, brass, { parent: root });
    beamBetween(name + 'Lower', [kx, ky, kz], [fx, fy, fz], 0.01, darkBrass, { parent: root });
    createPart(name + 'Hip', sphereGeo(0.025, 10, 8), copper, { position: [hx, hipY, hz], parent: root });
    createPart(name + 'Knee', sphereGeo(0.018, 8, 6), copper, { position: [kx, ky, kz], parent: root });
    createPart(name + 'Foot', sphereGeo(0.016, 8, 6), darkSteel, { position: [fx, fy, fz], parent: root });
  }
  leg('LegFrontR', 0.3, 1, 0.12, 0.2, bodyY - 0.1);
  leg('LegFrontL', 0.3, -1, 0.12, 0.2, bodyY - 0.1);
  leg('LegMidR', 0.14, 1, 0.16, 0.26, bodyY - 0.12);
  leg('LegMidL', 0.14, -1, 0.16, 0.26, bodyY - 0.12);
  leg('LegRearR', -0.02, 1, 0.15, 0.24, bodyY - 0.11);
  leg('LegRearL', -0.02, -1, 0.15, 0.24, bodyY - 0.11);

  // Legs provide ground contact via feet near Y=0
  return root;
}

function animate(root) {
  return [
    createClip('GearSpin', 2, [
      rotationTrack('Joint_GearR_Main_R', [{ time: 0, rotation: [0, 0, 0] }, { time: 2, rotation: [0, 0, 360] }]),
      rotationTrack('Joint_GearR_Main_L', [{ time: 0, rotation: [0, 0, 0] }, { time: 2, rotation: [0, 0, -360] }]),
      rotationTrack('Joint_GearR_Aft_R', [{ time: 0, rotation: [0, 0, 0] }, { time: 2, rotation: [0, 0, -360] }]),
      rotationTrack('Joint_GearR_Aft_L', [{ time: 0, rotation: [0, 0, 0] }, { time: 2, rotation: [0, 0, 360] }]),
    ]),
    createClip('WingFlap', 1.2, [
      rotationTrack('Joint_WingFrontR', [{ time: 0, rotation: [0, 0, 0] }, { time: 0.3, rotation: [-18, 0, 0] }, { time: 0.6, rotation: [0, 0, 0] }, { time: 0.9, rotation: [-18, 0, 0] }, { time: 1.2, rotation: [0, 0, 0] }]),
      rotationTrack('Joint_WingFrontL', [{ time: 0, rotation: [0, 0, 0] }, { time: 0.3, rotation: [18, 0, 0] }, { time: 0.6, rotation: [0, 0, 0] }, { time: 0.9, rotation: [18, 0, 0] }, { time: 1.2, rotation: [0, 0, 0] }]),
      rotationTrack('Joint_WingRearR', [{ time: 0, rotation: [0, 0, 0] }, { time: 0.3, rotation: [-22, 0, 0] }, { time: 0.6, rotation: [0, 0, 0] }, { time: 0.9, rotation: [-22, 0, 0] }, { time: 1.2, rotation: [0, 0, 0] }]),
      rotationTrack('Joint_WingRearL', [{ time: 0, rotation: [0, 0, 0] }, { time: 0.3, rotation: [22, 0, 0] }, { time: 0.6, rotation: [0, 0, 0] }, { time: 0.9, rotation: [22, 0, 0] }, { time: 1.2, rotation: [0, 0, 0] }]),
    ])
  ];
}
