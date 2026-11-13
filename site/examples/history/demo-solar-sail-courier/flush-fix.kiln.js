// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Solar sail courier',
  category: 'vehicle',
  role: 'vehicle',
};

function makeFoilFacet(positions, indices) {
  const doubleIndices = [...indices];
  for (let i = 0; i < indices.length; i += 3) {
    doubleIndices.push(indices[i], indices[i + 2], indices[i + 1]);
  }
  return meshGeo({ positions, indices: doubleIndices });
}

async function build() {
  const root = createRoot('SolarCourier');

  // Materials palette
  const ivoryHull = gameMaterial(0xf6f3ea, { roughness: 0.28, metalness: 0.08 });
  const ivoryDarkTrim = gameMaterial(0x23272e, { roughness: 0.5, metalness: 0.6 });
  const copperSail = gameMaterial(0xd97543, { roughness: 0.22, metalness: 0.92 });
  const goldSail = gameMaterial(0xf5be38, { roughness: 0.18, metalness: 0.95 });
  const carbonSpar = gameMaterial(0x181a1f, { roughness: 0.45, metalness: 0.3 });
  const titaniumFitting = gameMaterial(0x9da7b3, { roughness: 0.3, metalness: 0.85 });
  const amberSensor = gameMaterial(0xff9911, { emissive: 0xff7700, emissiveIntensity: 0.85, roughness: 0.15 });
  const cyanBeacon = gameMaterial(0x38e1b0, { emissive: 0x12b886, emissiveIntensity: 1.0 });
  const plasmaBlue = gameMaterial(0x66d9e8, { emissive: 0x339af0, emissiveIntensity: 1.2 });
  const solarCellDark = gameMaterial(0x162130, { roughness: 0.2, metalness: 0.7 });

  // -------------------------------------------------------------
  // 1. COMPACT IVORY CARGO POD
  // -------------------------------------------------------------
  const podCenter = [0, 1.38, 0];
  const podBody = createPivot('PodBody', podCenter, root);

  // Main Cargo Bay Capsule
  const mainHullGeo = await roundedBoxGeo(1.3, 0.58, 0.68, 0.09);
  createPart('MainHull', mainHullGeo, ivoryHull, { position: [0, 0, 0], parent: podBody });

  // Dorsal Equipment Spine Fairing
  const spineGeo = await roundedBoxGeo(1.4, 0.12, 0.38, 0.04);
  createPart('DorsalSpine', spineGeo, ivoryHull, { position: [0.05, 0.32, 0], parent: podBody });

  // Photovoltaic power strip on spine
  createPart('SolarStrip', boxGeo(1.1, 0.015, 0.22), solarCellDark, { position: [0.05, 0.39, 0], parent: podBody });

  // High-gain communications dish & mast
  createPart('CommMast', cylinderGeo(0.018, 0.018, 0.14, 8), titaniumFitting, { position: [0.35, 0.45, 0], parent: podBody });
  createPart('CommDish', coneGeo(0.12, 0.05, 16), goldSail, { position: [0.38, 0.54, 0], rotation: [0, 0, -45], parent: podBody });
  createPart('CommFeed', cylinderGeo(0.006, 0.006, 0.08, 6), titaniumFitting, { position: [0.42, 0.58, 0], rotation: [0, 0, -45], parent: podBody });

  // Lateral Cargo Access Hatches (Port & Starboard)
  for (const side of [-1, 1]) {
    const zPos = side * 0.345;
    createPart(`CargoDoor_${side > 0 ? 'Stbd' : 'Port'}`, boxGeo(0.65, 0.36, 0.02), ivoryDarkTrim, { position: [-0.05, 0, zPos], parent: podBody });
    createPart(`CargoLatchA_${side > 0 ? 'Stbd' : 'Port'}`, boxGeo(0.04, 0.08, 0.03), titaniumFitting, { position: [-0.32, 0, zPos + side * 0.01], parent: podBody });
    createPart(`CargoLatchB_${side > 0 ? 'Stbd' : 'Port'}`, boxGeo(0.04, 0.08, 0.03), titaniumFitting, { position: [0.22, 0, zPos + side * 0.01], parent: podBody });
    createPart(`StatusLight_${side > 0 ? 'Stbd' : 'Port'}`, boxGeo(0.55, 0.025, 0.02), cyanBeacon, { position: [-0.05, 0.16, zPos + side * 0.012], parent: podBody });
  }

  // Fore Avionics & Sensor Nose Module
  const noseCowlGeo = await roundedBoxGeo(0.44, 0.52, 0.60, 0.07);
  createPart('NoseCowl', noseCowlGeo, ivoryHull, { position: [0.72, 0, 0], parent: podBody });

  // Aerodynamic nose cap
  createPart('NoseCap', cylinderXGeo(0.24, 0.09, 0.28, 16), ivoryHull, { position: [0.98, 0, 0], parent: podBody });

  // Optical LIDAR / Navigation Sensor Eye
  createPart('SensorHousing', cylinderXGeo(0.12, 0.12, 0.084, 16), ivoryDarkTrim, { position: [1.082, 0, 0], parent: podBody });
  createPart('SensorLens', sphereGeo(0.09, 16, 12), amberSensor, { position: [1.11, 0, 0], parent: podBody });

  // Twin Star-Tracker Pods on upper nose
  for (const side of [-1, 1]) {
    createPart(`StarTracker_${side > 0 ? 'R' : 'L'}`, cylinderGeo(0.035, 0.04, 0.1, 8), ivoryDarkTrim, { position: [0.78, 0.25, side * 0.18], rotation: [side * 20, 0, 0], parent: podBody });
    createPart(`TrackerLens_${side > 0 ? 'R' : 'L'}`, sphereGeo(0.03, 8, 6), amberSensor, { position: [0.78, 0.3, side * 0.2], parent: podBody });
  }

  // Forward RCS Thruster Quads
  for (const side of [-1, 1]) {
    const sideKey = side > 0 ? 'R' : 'L';
    const rcsBase = createPivot(`RCS_Fwd_${sideKey}`, [0.82, 0, side * 0.32], podBody);
    createPart(`RcsHub_${sideKey}`, sphereGeo(0.035, 8, 6), titaniumFitting, { parent: rcsBase });
    createPart(`RcsNozzle_Up_${sideKey}`, coneGeo(0.02, 0.04, 8), titaniumFitting, { position: [0, 0.04, 0], parent: rcsBase });
    createPart(`RcsNozzle_Dn_${sideKey}`, coneGeo(0.02, 0.04, 8), titaniumFitting, { position: [0, -0.04, 0], rotation: [180, 0, 0], parent: rcsBase });
    createPart(`RcsNozzle_Out_${sideKey}`, coneGeo(0.02, 0.04, 8), titaniumFitting, { position: [0, 0, side * 0.04], rotation: [0, 0, side * 90], parent: rcsBase });
  }

  // Aft Service & Propulsion Collar
  const aftTaperGeo = cylinderXGeo(0.33, 0.27, 0.45, 16);
  createPart('AftHullTaper', aftTaperGeo, ivoryHull, { position: [-0.75, 0, 0], parent: podBody });

  // Sail Deployment Collar Ring
  createPart('DeploymentCollar', torusGeo(0.42, 0.045, 12, 24), titaniumFitting, { position: [-0.55, 0, 0], rotation: [0, 90, 0], parent: podBody });
  createPart('CollarCore', cylinderXGeo(0.38, 0.38, 0.14, 16), ivoryDarkTrim, { position: [-0.55, 0, 0], parent: podBody });

  // Main Ion Engine Bell & Grapple Ring
  createPart('EngineShroud', cylinderXGeo(0.26, 0.22, 0.22, 16), ivoryDarkTrim, { position: [-1.02, 0, 0], parent: podBody });
  createPart('IonEngineBell', cylinderXGeo(0.14, 0.24, 0.28, 16), titaniumFitting, { position: [-1.16, 0, 0], parent: podBody });
  createPart('IonNozzleRim', torusGeo(0.24, 0.015, 10, 20), titaniumFitting, { position: [-1.30, 0, 0], rotation: [0, 90, 0], parent: podBody });
  createPart('IonPlasmaCore', sphereGeo(0.12, 12, 8), plasmaBlue, { position: [-1.12, 0, 0], parent: podBody });
  createPart('DockingRing', torusGeo(0.25, 0.025, 10, 20), titaniumFitting, { position: [-0.94, 0, 0], rotation: [0, 90, 0], parent: podBody });

  // Retractable Landing Struts (touching ground at Y=0)
  const landingLegs = [
    { name: 'Leg_FL', top: [0.45, -0.22, -0.32], foot: [0.65, -1.36, -0.52] },
    { name: 'Leg_FR', top: [0.45, -0.22, 0.32], foot: [0.65, -1.36, 0.52] },
    { name: 'Leg_RL', top: [-0.45, -0.22, -0.32], foot: [-0.65, -1.36, -0.52] },
    { name: 'Leg_RR', top: [-0.45, -0.22, 0.32], foot: [-0.65, -1.36, 0.52] },
  ];
  for (const leg of landingLegs) {
    beamBetween(leg.name, leg.top, leg.foot, 0.022, titaniumFitting, { parent: podBody });
    createPart(`${leg.name}_Foot`, boxGeo(0.22, 0.035, 0.12), titaniumFitting, { position: [leg.foot[0], leg.foot[1] + 0.018, leg.foot[2]], parent: podBody });
  }

  // -------------------------------------------------------------
  // 2. DELICATE STRUCTURAL SPARS (4 Radial Booms)
  // -------------------------------------------------------------
  const sparAngles = [45, 135, 225, 315];
  for (let k = 0; k < 4; k++) {
    const angleDeg = sparAngles[k];
    const angleRad = (angleDeg * Math.PI) / 180;

    // Fixed base mount for spar k on the deployment collar
    const sparMount = createPivot(`SparMount_${k}`, [-0.55, 0, 0], podBody);
    sparMount.rotation.x = angleRad;

    // Gimbal mounting bracket on collar
    createPart(`GimbalBracket_${k}`, boxGeo(0.14, 0.12, 0.14), titaniumFitting, { position: [0, 0.44, 0], parent: sparMount });

    // Articulated Root Hinge: Joint_SparRoot_k
    // Initial folded pose: rotated back along pod hull (rotation.z = -78 deg)
    const sparRoot = createPivot(`SparRoot_${k}`, [0, 0.44, 0], sparMount);
    sparRoot.rotation.z = (-78 * Math.PI) / 180;

    // Hinge pin
    createPart(`HingePin_${k}`, cylinderZGeo(0.024, 0.024, 0.14, 10), titaniumFitting, { parent: sparRoot });

    // Inner Spar Truss: twin carbon chords and diagonal lattice lacing
    const chordLen = 2.1;
    createPart(`ChordA_${k}`, cylinderGeo(0.016, 0.016, chordLen, 8), carbonSpar, { position: [0, chordLen / 2, -0.035], parent: sparRoot });
    createPart(`ChordB_${k}`, cylinderGeo(0.016, 0.016, chordLen, 8), carbonSpar, { position: [0, chordLen / 2, 0.035], parent: sparRoot });

    // Cross-truss battens along inner spar
    for (let s = 1; s <= 5; s++) {
      const yBatten = s * 0.35;
      createPart(`Batten_${k}_${s}`, boxGeo(0.018, 0.014, 0.08), titaniumFitting, { position: [0, yBatten, 0], parent: sparRoot });
      beamBetween(`Brace_${k}_${s}`, [0, yBatten - 0.16, -0.035], [0, yBatten + 0.16, 0.035], 0.007, titaniumFitting, { parent: sparRoot });
    }

    // Articulated Elbow Hinge: Joint_SparElbow_k at tip of inner spar (Y = 2.1)
    // Initial folded pose: folded back along inner spar (rotation.z = +152 deg)
    const sparElbow = createPivot(`SparElbow_${k}`, [0, chordLen, 0], sparRoot);
    sparElbow.rotation.z = (152 * Math.PI) / 180;

    // Elbow knuckle & spreader strut
    createPart(`ElbowKnuckle_${k}`, boxGeo(0.08, 0.12, 0.09), titaniumFitting, { parent: sparElbow });
    createPart(`SpreaderStrut_${k}`, cylinderGeo(0.008, 0.008, 0.18, 6), titaniumFitting, { position: [0, 0.05, 0.1], rotation: [90, 0, 0], parent: sparElbow });
    createPart(`SpreaderPulley_${k}`, torusGeo(0.022, 0.006, 8, 12), goldSail, { position: [0, 0.05, 0.19], parent: sparElbow });

    // Outer Spar Boom: tapered carbon lattice boom
    const outerLen = 2.3;
    createPart(`OuterBoom_${k}`, cylinderGeo(0.012, 0.02, outerLen, 8), carbonSpar, { position: [0, outerLen / 2, 0], parent: sparElbow });

    // Outer Spar Battens
    for (let s = 1; s <= 4; s++) {
      const yOut = s * 0.45;
      createPart(`OuterBatten_${k}_${s}`, boxGeo(0.014, 0.012, 0.045), titaniumFitting, { position: [0, yOut, 0], parent: sparElbow });
    }

    // Spar Tip Assembly at Y = outerLen
    const sparTip = createPivot(`SparTip_${k}`, [0, outerLen, 0], sparElbow);
    createPart(`TipFitting_${k}`, boxGeo(0.05, 0.08, 0.05), titaniumFitting, { parent: sparTip });
    createPart(`TipTensioner_${k}`, torusGeo(0.025, 0.006, 8, 12), goldSail, { position: [0, 0.04, 0], parent: sparTip });
    createPart(`TipBeacon_${k}`, sphereGeo(0.022, 8, 6), cyanBeacon, { position: [0, 0.07, 0], parent: sparTip });

    // -------------------------------------------------------------
    // 3. FOLDED COPPER-AND-GOLD SAILS (Dual-Wing Origami Facets)
    // -------------------------------------------------------------
    // Inner Sail Package: Joint_SailFold_k_Inner attached to sparRoot
    const sailInner = createPivot(`SailFold_${k}_Inner`, [0, 0, 0], sparRoot);
    sailInner.rotation.x = (60 * Math.PI) / 180;
    sailInner.rotation.z = (-32 * Math.PI) / 180;
    sailInner.scale.set(0.12, 0.95, 0.12);

    // Starboard Wing (towards +Z)
    createPart(`Sail_Cu_InnerA_${k}`, makeFoilFacet([
      0, 0.15, 0,
      0, 1.1, 0,
      -0.05, 0.85, 0.65,
      -0.03, 0.2, 0.25
    ], [0, 1, 2, 0, 2, 3]), copperSail, { parent: sailInner });

    createPart(`Sail_Au_InnerA_${k}`, makeFoilFacet([
      0, 1.1, 0,
      0, 2.05, 0,
      -0.08, 1.6, 1.35,
      -0.05, 0.85, 0.65
    ], [0, 1, 2, 0, 2, 3]), goldSail, { parent: sailInner });

    // Port Wing (towards -Z)
    createPart(`Sail_Cu_InnerB_${k}`, makeFoilFacet([
      0, 0.15, 0,
      0, 1.1, 0,
      -0.05, 0.85, -0.65,
      -0.03, 0.2, -0.25
    ], [0, 1, 2, 0, 2, 3]), copperSail, { parent: sailInner });

    createPart(`Sail_Au_InnerB_${k}`, makeFoilFacet([
      0, 1.1, 0,
      0, 2.05, 0,
      -0.08, 1.6, -1.35,
      -0.05, 0.85, -0.65
    ], [0, 1, 2, 0, 2, 3]), goldSail, { parent: sailInner });

    // Outer Sail Package: Joint_SailFold_k_Outer attached to sparElbow
    const sailOuter = createPivot(`SailFold_${k}_Outer`, [0, 0, 0], sparElbow);
    sailOuter.rotation.x = (-55 * Math.PI) / 180;
    sailOuter.rotation.z = (30 * Math.PI) / 180;
    sailOuter.scale.set(0.12, 0.95, 0.12);

    // Outer Starboard Wing (towards +Z)
    createPart(`Sail_Cu_OuterA_${k}`, makeFoilFacet([
      0, 0.02, 0,
      0, 1.15, 0,
      -0.10, 0.85, 1.85,
      -0.08, 0.02, 1.35
    ], [0, 1, 2, 0, 2, 3]), copperSail, { parent: sailOuter });

    createPart(`Sail_Au_OuterA_${k}`, makeFoilFacet([
      0, 1.15, 0,
      0, 2.25, 0,
      -0.12, 1.75, 2.45,
      -0.10, 0.85, 1.85
    ], [0, 1, 2, 0, 2, 3]), goldSail, { parent: sailOuter });

    beamBetween(`SailEdgeA_${k}`, [0, 2.25, 0], [-0.12, 1.75, 2.45], 0.007, carbonSpar, { parent: sailOuter });

    // Outer Port Wing (towards -Z)
    createPart(`Sail_Cu_OuterB_${k}`, makeFoilFacet([
      0, 0.02, 0,
      0, 1.15, 0,
      -0.10, 0.85, -1.85,
      -0.08, 0.02, -1.35
    ], [0, 1, 2, 0, 2, 3]), copperSail, { parent: sailOuter });

    createPart(`Sail_Au_OuterB_${k}`, makeFoilFacet([
      0, 1.15, 0,
      0, 2.25, 0,
      -0.12, 1.75, -2.45,
      -0.10, 0.85, -1.85
    ], [0, 1, 2, 0, 2, 3]), goldSail, { parent: sailOuter });

    beamBetween(`SailEdgeB_${k}`, [0, 2.25, 0], [-0.12, 1.75, -2.45], 0.007, carbonSpar, { parent: sailOuter });
  }

  return root;
}

function animate(root) {
  const tracks = [];
  const duration = 3.6;

  for (let k = 0; k < 4; k++) {
    // 1. Root Spar Rotation Track: sweeps outward from folded (-78 deg) to deployed (0 deg)
    tracks.push(rotationTrack(`Joint_SparRoot_${k}`, [
      { time: 0.0, rotation: [0, 0, -78] },
      { time: 0.8, rotation: [0, 0, -65] },
      { time: 2.0, rotation: [0, 0, -20] },
      { time: 2.8, rotation: [0, 0, 0] },
      { time: 3.2, rotation: [0, 0, 0.8] },
      { time: 3.6, rotation: [0, 0, 0] },
    ]));

    // 2. Elbow Spar Rotation Track: unfolds from folded (+152 deg) to straight (0 deg)
    tracks.push(rotationTrack(`Joint_SparElbow_${k}`, [
      { time: 0.0, rotation: [0, 0, 152] },
      { time: 0.6, rotation: [0, 0, 145] },
      { time: 1.8, rotation: [0, 0, 45] },
      { time: 2.8, rotation: [0, 0, 0] },
      { time: 3.2, rotation: [0, 0, -0.6] },
      { time: 3.6, rotation: [0, 0, 0] },
    ]));

    // 3. Inner Sail Package: expands from folded accordion pleat to full taut membrane
    tracks.push(rotationTrack(`Joint_SailFold_${k}_Inner`, [
      { time: 0.0, rotation: [60, 0, -32] },
      { time: 1.0, rotation: [42, 0, -20] },
      { time: 2.0, rotation: [18, 0, -8] },
      { time: 2.8, rotation: [0, 0, 0] },
      { time: 3.6, rotation: [0, 0, 0] },
    ]));
    tracks.push(scaleTrack(`Joint_SailFold_${k}_Inner`, [
      { time: 0.0, scale: [0.12, 0.95, 0.12] },
      { time: 1.0, scale: [0.35, 0.97, 0.35] },
      { time: 2.0, scale: [0.72, 1.0, 0.72] },
      { time: 2.8, scale: [1.0, 1.0, 1.0] },
      { time: 3.6, scale: [1.0, 1.0, 1.0] },
    ]));

    // 4. Outer Sail Package: unfurls outwards to full radial span
    tracks.push(rotationTrack(`Joint_SailFold_${k}_Outer`, [
      { time: 0.0, rotation: [-55, 0, 30] },
      { time: 1.0, rotation: [-38, 0, 18] },
      { time: 2.0, rotation: [-16, 0, 6] },
      { time: 2.8, rotation: [0, 0, 0] },
      { time: 3.6, rotation: [0, 0, 0] },
    ]));
    tracks.push(scaleTrack(`Joint_SailFold_${k}_Outer`, [
      { time: 0.0, scale: [0.12, 0.95, 0.12] },
      { time: 1.0, scale: [0.35, 0.97, 0.35] },
      { time: 2.0, scale: [0.72, 1.0, 0.72] },
      { time: 2.8, scale: [1.0, 1.0, 1.0] },
      { time: 3.6, scale: [1.0, 1.0, 1.0] },
    ]));
  }

  return [createClip('Deploy', duration, tracks)];
}
