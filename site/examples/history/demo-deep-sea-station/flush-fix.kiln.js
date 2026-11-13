// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Deep-Sea Research Station',
  category: 'architecture',
  role: 'building'
};

function build() {
  const root = createRoot('DeepSeaStation');
  const d2r = (deg) => deg * Math.PI / 180;

  // --- Materials ---
  const hullWhite = gameMaterial(0xdce5ea, { roughness: 0.35, metalness: 0.3 });
  const hullDark = gameMaterial(0x1a232b, { roughness: 0.6, metalness: 0.7 });
  const frameworkDark = gameMaterial(0x12171d, { roughness: 0.7, metalness: 0.85 });
  const safetyYellow = gameMaterial(0xf4a900, { roughness: 0.35, metalness: 0.2 });
  const podFrameOrange = gameMaterial(0xf55a10, { roughness: 0.35, metalness: 0.2 });
  const jointBlack = gameMaterial(0x181a1e, { roughness: 0.8, metalness: 0.3 });
  const chromeMetal = gameMaterial(0xd4d8dc, { roughness: 0.15, metalness: 0.95 });
  const glass = glassMaterial(0x4dc0f5, { opacity: 0.32, roughness: 0.06, metalness: 0.1 });
  const floodLight = gameMaterial(0xffffff, { emissive: 0xffffff, emissiveIntensity: 3.5 });
  const cyanGlow = gameMaterial(0x00e5ff, { emissive: 0x00e5ff, emissiveIntensity: 2.5 });
  const amberBeacon = gameMaterial(0xff6600, { emissive: 0xff6600, emissiveIntensity: 2.2 });
  const interiorDeck = gameMaterial(0x242e38, { roughness: 0.85, metalness: 0.2 });
  const interiorPanel = gameMaterial(0x384754, { roughness: 0.5, metalness: 0.4 });
  const tankGas = gameMaterial(0xedf2f7, { roughness: 0.4, metalness: 0.2 });
  const tankStripe = gameMaterial(0x009e73, { roughness: 0.5, metalness: 0.2 });

  // ==========================================
  // 1. CENTRAL PRESSURE HULL & DOCKING CORE
  // ==========================================
  // Lower Machinery Ring
  createPart('Hull_LowerCollar', cylinderGeo(2.4, 2.3, 0.6, 24), frameworkDark, { position: [0, 2.2, 0], parent: root });
  createPart('Hull_MachineryBelt', cylinderGeo(2.5, 2.4, 1.2, 24), hullWhite, { position: [0, 3.1, 0], parent: root });
  
  // Mid Corridor Hub Belt
  createPart('Hull_MidBelt', cylinderGeo(2.65, 2.65, 0.6, 24), hullDark, { position: [0, 4.0, 0], parent: root });
  createPart('Hull_UpperSection', cylinderGeo(2.35, 2.55, 1.2, 24), hullWhite, { position: [0, 4.9, 0], parent: root });
  
  // Upper Taper & Observation Ring
  createPart('Hull_UpperTaper', cylinderGeo(1.8, 2.35, 1.0, 24), hullDark, { position: [0, 6.0, 0], parent: root });
  createPart('Hull_UpperDeckRim', cylinderGeo(1.95, 1.95, 0.25, 24), safetyYellow, { position: [0, 6.6, 0], parent: root });

  // Submersible Docking Hatch (Aft top)
  createPart('Docking_Collar', cylinderGeo(1.0, 1.1, 0.4, 18), hullDark, { position: [-0.4, 6.9, 0], parent: root });
  createPart('Docking_Hatch', cylinderGeo(0.9, 0.9, 0.1, 18), safetyYellow, { position: [-0.4, 7.15, 0], parent: root });
  createPart('Docking_LightFwd', sphereGeo(0.06, 8, 6), floodLight, { position: [0.5, 7.15, 0], parent: root });
  createPart('Docking_LightAft', sphereGeo(0.06, 8, 6), floodLight, { position: [-1.3, 7.15, 0], parent: root });
  createPart('Docking_LightStbd', sphereGeo(0.06, 8, 6), floodLight, { position: [-0.4, 7.15, 0.9], parent: root });
  createPart('Docking_LightPort', sphereGeo(0.06, 8, 6), floodLight, { position: [-0.4, 7.15, -0.9], parent: root });

  // Sensor & Communications Mast
  createPart('Mast_Base', cylinderGeo(0.2, 0.25, 0.296, 12), frameworkDark, { position: [0.6, 6.852, 0], parent: root });
  createPart('Mast_Pylon', cylinderGeo(0.1, 0.16, 2.2, 10), frameworkDark, { position: [0.6, 8.1, 0], parent: root });
  createPart('Mast_SonarDome', sphereGeo(0.4, 14, 10), hullDark, { position: [0.6, 9.3, 0], parent: root });
  createPart('Mast_AcousticBoom', cylinderGeo(0.04, 0.04, 1.3, 8), frameworkDark, { position: [0.6, 8.8, 0], rotation: [90, 0, 0], parent: root });
  createPart('Mast_TransducerL', cylinderGeo(0.08, 0.05, 0.18, 8), safetyYellow, { position: [0.6, 8.8, 0.65], rotation: [90, 0, 0], parent: root });
  createPart('Mast_TransducerR', cylinderGeo(0.08, 0.05, 0.18, 8), safetyYellow, { position: [0.6, 8.8, -0.65], rotation: [-90, 0, 0], parent: root });
  createPart('Mast_Beacon', sphereGeo(0.1, 10, 8), amberBeacon, { position: [0.6, 9.75, 0], parent: root });
  createPart('Mast_AntennaSpire', cylinderGeo(0.015, 0.03, 1.4, 6), chromeMetal, { position: [0.6, 10.5, 0], parent: root });

  // Aft Power Reactor / Engineering Pod (-X)
  createPart('Reactor_Corridor', cylinderGeo(0.7, 0.7, 1.2, 16), hullDark, { position: [-2.8, 3.8, 0], rotation: [0, 0, 90], parent: root });
  createPart('Reactor_Hull', cylinderGeo(1.35, 1.45, 1.8, 20), hullWhite, { position: [-4.2, 3.8, 0], rotation: [0, 0, 90], parent: root });
  createPart('Reactor_EndCap', sphereGeo(1.35, 16, 12), hullDark, { position: [-5.1, 3.8, 0], parent: root });
  createPart('Reactor_VaneTop', boxGeo(1.6, 0.4, 0.12), frameworkDark, { position: [-4.2, 4.7, 0], parent: root });
  createPart('Reactor_VaneStbd', boxGeo(1.6, 0.12, 0.4), frameworkDark, { position: [-4.2, 3.8, 1.5], parent: root });
  createPart('Reactor_VanePort', boxGeo(1.6, 0.12, 0.4), frameworkDark, { position: [-4.2, 3.8, -1.5], parent: root });

  // ==========================================
  // 2. SEAFLOOR ANCHORAGE & 4 LANDING LEGS
  // ==========================================
  const legAngles = [45, 135, 225, 315];
  for (let i = 0; i < 4; i++) {
    const deg = legAngles[i];
    const rad = d2r(deg);
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const fx = 5.0 * cosA;
    const fz = 5.0 * sinA;
    const fy = 0.1;

    const hx = 2.2 * cosA;
    const hz = 2.2 * sinA;
    const hy = 2.2;

    const prefix = 'Leg_' + deg;

    // Footpad resting on seabed (Y=0 to Y=0.2)
    createPart(prefix + '_Foot', cylinderGeo(0.8, 0.95, 0.2, 16), hullDark, { position: [fx, fy, fz], parent: root });
    createPart(prefix + '_BallastRing', cylinderGeo(0.65, 0.65, 0.15, 14), safetyYellow, { position: [fx, fy + 0.15, fz], parent: root });
    createPart(prefix + '_AnkleBall', sphereGeo(0.28, 12, 10), jointBlack, { position: [fx, fy + 0.32, fz], parent: root });

    // Telescoping heavy strut
    const midX = (fx + hx) * 0.5;
    const midY = (fy + 0.32 + hy) * 0.5;
    const midZ = (fz + hz) * 0.5;

    beamBetween(prefix + '_LowerStrut', [fx, fy + 0.32, fz], [midX, midY, midZ], 0.15, frameworkDark, { parent: root });
    beamBetween(prefix + '_ChromePiston', [fx * 0.4 + hx * 0.6, (fy + 0.32) * 0.4 + hy * 0.6, fz * 0.4 + hz * 0.6], [hx, hy, hz], 0.11, chromeMetal, { parent: root });
    beamBetween(prefix + '_UpperCollar', [midX, midY, midZ], [hx, hy, hz], 0.16, frameworkDark, { parent: root });

    // Diagonal knee brace to underbelly
    const kx = 0.8 * cosA;
    const kz = 0.8 * sinA;
    const ky = 1.9;
    beamBetween(prefix + '_KneeBrace', [midX, midY, midZ], [kx, ky, kz], 0.08, frameworkDark, { parent: root });
  }

  // Underside Gas / Life-Support Storage Tanks
  const tankAngles = [30, 90, 150, 210, 270, 330];
  for (let t = 0; t < tankAngles.length; t++) {
    const tRad = d2r(tankAngles[t]);
    const tx = 1.75 * Math.cos(tRad);
    const tz = 1.75 * Math.sin(tRad);
    createPart('Tank_' + t, capsuleGeo(0.22, 1.0, 8), tankGas, { position: [tx, 2.3, tz], parent: root });
    createPart('TankBand_' + t, cylinderGeo(0.23, 0.23, 0.25, 12), tankStripe, { position: [tx, 2.3, tz], parent: root });
    createPart('TankValve_' + t, cylinderGeo(0.07, 0.07, 0.12, 8), jointBlack, { position: [tx, 2.9, tz], parent: root });
  }

  // Maneuvering Station-Keeping Thrusters
  const thrusterAngles = [0, 90, 180, 270];
  for (let th = 0; th < 4; th++) {
    const a = d2r(thrusterAngles[th]);
    const thX = 2.8 * Math.cos(a);
    const thZ = 2.8 * Math.sin(a);
    const rotY = -thrusterAngles[th];

    beamBetween('ThPylon_' + th, [2.2 * Math.cos(a), 2.5, 2.2 * Math.sin(a)], [thX, 2.5, thZ], 0.12, frameworkDark, { parent: root });
    createPart('ThDuct_' + th, cylinderGeo(0.35, 0.35, 0.4, 14), safetyYellow, { position: [thX, 2.5, thZ], rotation: [90, rotY, 0], parent: root });
    createPart('ThCore_' + th, cylinderGeo(0.12, 0.12, 0.44, 10), jointBlack, { position: [thX, 2.5, thZ], rotation: [90, rotY, 0], parent: root });
  }

  // ==========================================
  // 3. GLASS HABITAT PODS WITH INTERIORS
  // ==========================================
  
  // Helper for Pod Corridors
  function buildCorridor(name, start, end) {
    beamBetween(name + '_Tube', start, end, 0.72, hullWhite, { parent: root });
    const mid = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, (start[2] + end[2]) * 0.5];
    const dx = end[0] - start[0];
    const dz = end[2] - start[2];
    const angleY = Math.atan2(dz, dx) * 180 / Math.PI;

    createPart(name + '_Ring1', cylinderGeo(0.82, 0.82, 0.16, 18), hullDark, {
      position: [start[0] + dx * 0.35, start[1], start[2] + dz * 0.35],
      rotation: [0, -angleY, 90],
      parent: root
    });
    createPart(name + '_Ring2', cylinderGeo(0.82, 0.82, 0.16, 18), hullDark, {
      position: [start[0] + dx * 0.75, start[1], start[2] + dz * 0.75],
      rotation: [0, -angleY, 90],
      parent: root
    });

    // Subsea conduit piping along corridor underside
    const p1 = [start[0], start[1] - 0.75, start[2]];
    const p2 = [end[0], end[1] - 0.75, end[2]];
    const pipeGeo = pipeAlongPath([p1, p2], 0.05, { bendRadius: 0.1 });
    createPart(name + '_UnderPipe', pipeGeo, jointBlack, { parent: root });
  }

  // Pod 1: Forward Science / Deep Bio-Lab Pod
  buildCorridor('Corridor_Fwd', [2.3, 3.8, 0], [4.4, 3.8, 0]);
  const fwdPodCenter = [5.3, 3.8, 0];
  const podR = 1.55;

  // Glass Spheres
  createPart('Pod_Fwd_Glass', sphereGeo(podR, 24, 18), glass, { position: fwdPodCenter, parent: root });
  createPart('Pod_Fwd_EqFrame', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: fwdPodCenter, rotation: [90, 0, 0], parent: root });
  createPart('Pod_Fwd_MeridFrame1', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: fwdPodCenter, rotation: [0, 90, 0], parent: root });
  createPart('Pod_Fwd_MeridFrame2', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: fwdPodCenter, rotation: [0, 0, 0], parent: root });
  createPart('Pod_Fwd_NoseCap', cylinderGeo(0.18, 0.1, 0.16, 12), safetyYellow, { position: [fwdPodCenter[0] + podR, fwdPodCenter[1], fwdPodCenter[2]], rotation: [0, 0, -90], parent: root });
  createPart('Pod_Fwd_Beacon', sphereGeo(0.08, 8, 6), amberBeacon, { position: [fwdPodCenter[0] + podR + 0.14, fwdPodCenter[1], fwdPodCenter[2]], parent: root });

  // Forward Pod Interior
  createPart('Pod_Fwd_Floor', cylinderGeo(1.38, 1.38, 0.08, 20), interiorDeck, { position: [5.3, 3.0, 0], parent: root });
  createPart('Pod_Fwd_SpecimenTable', cylinderGeo(0.42, 0.42, 0.55, 12), interiorPanel, { position: [5.3, 3.32, 0], parent: root });
  createPart('Pod_Fwd_HoloSphere', sphereGeo(0.16, 12, 10), cyanGlow, { position: [5.3, 3.75, 0], parent: root });
  createPart('Pod_Fwd_ConsoleDesk', boxGeo(0.4, 0.7, 0.8), interiorPanel, { position: [5.9, 3.4, 0.4], parent: root });
  createPart('Pod_Fwd_ConsoleScreen', boxGeo(0.04, 0.35, 0.65), cyanGlow, { position: [5.7, 3.65, 0.4], parent: root });
  createPart('Pod_Fwd_Rack', boxGeo(0.35, 0.8, 0.7), interiorPanel, { position: [5.9, 3.45, -0.4], parent: root });

  // Pod 2: Starboard Habitat & Living Pod (+Z)
  buildCorridor('Corridor_Stbd', [0, 3.8, 2.3], [0, 3.8, 4.4]);
  const stbdPodCenter = [0, 3.8, 5.3];

  createPart('Pod_Stbd_Glass', sphereGeo(podR, 24, 18), glass, { position: stbdPodCenter, parent: root });
  createPart('Pod_Stbd_EqFrame', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: stbdPodCenter, rotation: [90, 0, 0], parent: root });
  createPart('Pod_Stbd_MeridFrame1', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: stbdPodCenter, rotation: [0, 0, 0], parent: root });
  createPart('Pod_Stbd_MeridFrame2', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: stbdPodCenter, rotation: [0, 90, 0], parent: root });
  createPart('Pod_Stbd_Cap', cylinderGeo(0.18, 0.1, 0.16, 12), safetyYellow, { position: [0, 3.8, 5.3 + podR], rotation: [90, 0, 0], parent: root });
  createPart('Pod_Stbd_Beacon', sphereGeo(0.08, 8, 6), amberBeacon, { position: [0, 3.8, 5.3 + podR + 0.14], parent: root });

  // Starboard Pod Interior
  createPart('Pod_Stbd_Floor', cylinderGeo(1.38, 1.38, 0.08, 20), interiorDeck, { position: [0, 3.0, 5.3], parent: root });
  createPart('Pod_Stbd_NavTable', cylinderGeo(0.45, 0.45, 0.55, 12), interiorPanel, { position: [0, 3.32, 5.3], parent: root });
  createPart('Pod_Stbd_NavDisplay', cylinderGeo(0.35, 0.35, 0.04, 12), cyanGlow, { position: [0, 3.62, 5.3], parent: root });
  createPart('Pod_Stbd_StationDesk', boxGeo(0.8, 0.7, 0.35), interiorPanel, { position: [0.4, 3.4, 5.9], parent: root });
  createPart('Pod_Stbd_StationScreen', boxGeo(0.65, 0.35, 0.04), cyanGlow, { position: [0.4, 3.65, 5.7], parent: root });

  // Pod 3: Port Oceanographic / Sensor Pod (-Z)
  buildCorridor('Corridor_Port', [0, 3.8, -2.3], [0, 3.8, -4.4]);
  const portPodCenter = [0, 3.8, -5.3];

  createPart('Pod_Port_Glass', sphereGeo(podR, 24, 18), glass, { position: portPodCenter, parent: root });
  createPart('Pod_Port_EqFrame', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: portPodCenter, rotation: [90, 0, 0], parent: root });
  createPart('Pod_Port_MeridFrame1', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: portPodCenter, rotation: [0, 0, 0], parent: root });
  createPart('Pod_Port_MeridFrame2', torusGeo(podR + 0.02, 0.05, 8, 28), podFrameOrange, { position: portPodCenter, rotation: [0, 90, 0], parent: root });
  createPart('Pod_Port_Cap', cylinderGeo(0.18, 0.1, 0.16, 12), safetyYellow, { position: [0, 3.8, -5.3 - podR], rotation: [-90, 0, 0], parent: root });
  createPart('Pod_Port_Beacon', sphereGeo(0.08, 8, 6), amberBeacon, { position: [0, 3.8, -5.3 - podR - 0.14], parent: root });

  // Port Pod Interior
  createPart('Pod_Port_Floor', cylinderGeo(1.38, 1.38, 0.08, 20), interiorDeck, { position: [0, 3.0, -5.3], parent: root });
  createPart('Pod_Port_Mainframe', boxGeo(0.7, 1.1, 0.4), interiorPanel, { position: [-0.3, 3.6, -5.9], parent: root });
  createPart('Pod_Port_ServerGlow', boxGeo(0.6, 0.9, 0.04), cyanGlow, { position: [-0.3, 3.6, -5.68], parent: root });
  createPart('Pod_Port_AnalysisDesk', boxGeo(0.8, 0.7, 0.35), interiorPanel, { position: [0.3, 3.4, -5.9], parent: root });

  // Pod 4: Top Command Vista Cupola
  createPart('Cupola_DeckRim', cylinderGeo(1.2, 1.25, 0.2, 20), hullDark, { position: [0, 6.7, 0], parent: root });
  createPart('Cupola_Glass', sphereGeo(1.1, 20, 14), glass, { position: [0, 6.85, 0], parent: root });
  createPart('Cupola_FrameArch1', torusGeo(1.12, 0.04, 8, 24), podFrameOrange, { position: [0, 6.85, 0], rotation: [0, 0, 0], parent: root });
  createPart('Cupola_FrameArch2', torusGeo(1.12, 0.04, 8, 24), podFrameOrange, { position: [0, 6.85, 0], rotation: [0, 90, 0], parent: root });
  createPart('Cupola_Floor', cylinderGeo(1.0, 1.0, 0.06, 18), interiorDeck, { position: [0, 6.75, 0], parent: root });
  createPart('Cupola_CommandOrb', sphereGeo(0.18, 12, 8), cyanGlow, { position: [0, 7.15, 0], parent: root });

  // ==========================================
  // 4. YELLOW ROBOTIC MANIPULATOR ARMS
  // ==========================================
  
  function buildArticulatedArm(armName, mountPos, yawDeg, pitch1Deg, pitch2Deg, pitch3Deg, rollDeg, gripClosed, hasScanner) {
    // 0. Reinforced Sponson Outrigger from Hull
    beamBetween(armName + '_Sponson', [2.1, 2.4, mountPos[2] * 0.65], mountPos, 0.18, frameworkDark, { parent: root });
    createPart(armName + '_BaseMount', cylinderGeo(0.42, 0.45, 0.25, 16), hullDark, {
      position: mountPos,
      parent: root
    });

    // 1. Shoulder Joint Pivot
    const shoulderPivot = createPivot(armName + '_ShoulderYaw', [mountPos[0], mountPos[1] + 0.16, mountPos[2]], root);
    shoulderPivot.rotation.y = d2r(yawDeg);

    // Turret Yoke & Rotary Table
    createPart(armName + '_YokeBase', cylinderGeo(0.38, 0.38, 0.12, 16), safetyYellow, {
      position: [0, 0.06, 0],
      parent: shoulderPivot
    });
    createPart(armName + '_YokeArmL', boxGeo(0.14, 0.55, 0.28), safetyYellow, {
      position: [0, 0.3, 0.22],
      parent: shoulderPivot
    });
    createPart(armName + '_YokeArmR', boxGeo(0.14, 0.55, 0.28), safetyYellow, {
      position: [0, 0.3, -0.22],
      parent: shoulderPivot
    });
    createPart(armName + '_ShoulderPin', cylinderGeo(0.13, 0.13, 0.52, 14), jointBlack, {
      position: [0, 0.48, 0],
      rotation: [90, 0, 0],
      parent: shoulderPivot
    });

    // 2. Shoulder Pitch Pivot
    const shoulderPitch = createPivot(armName + '_ShoulderPitch', [0, 0.48, 0], shoulderPivot);
    shoulderPitch.rotation.z = d2r(pitch1Deg);

    // Heavy Upper Arm Boom (length 2.3)
    const L1 = 2.3;
    createPart(armName + '_BoomMain', boxGeo(L1, 0.32, 0.3), safetyYellow, {
      position: [L1 * 0.5, 0, 0],
      parent: shoulderPitch
    });
    createPart(armName + '_BoomPlateT', boxGeo(L1 * 0.85, 0.04, 0.26), jointBlack, {
      position: [L1 * 0.5, 0.16, 0],
      parent: shoulderPitch
    });
    createPart(armName + '_BoomPlateB', boxGeo(L1 * 0.85, 0.04, 0.26), jointBlack, {
      position: [L1 * 0.5, -0.16, 0],
      parent: shoulderPitch
    });

    // Dual Hydraulic Lift Cylinders (Top and Bottom)
    createPart(armName + '_BoomHydrCylTop', cylinderGeo(0.06, 0.06, L1 * 0.55, 10), safetyYellow, {
      position: [L1 * 0.35, 0.24, 0],
      rotation: [0, 0, 90],
      parent: shoulderPitch
    });
    createPart(armName + '_BoomHydrRodTop', cylinderGeo(0.036, 0.036, L1 * 0.5, 10), chromeMetal, {
      position: [L1 * 0.75, 0.24, 0],
      rotation: [0, 0, 90],
      parent: shoulderPitch
    });

    // Hydraulic supply conduits along upper arm
    const upperHose = pipeAlongPath([[0, -0.22, 0.14], [L1 * 0.5, -0.24, 0.14], [L1 * 0.9, -0.22, 0.14]], 0.028, { bendRadius: 0.08 });
    createPart(armName + '_UpperHose', upperHose, jointBlack, { parent: shoulderPitch });

    // 3. Elbow Pitch Pivot
    const elbowPitch = createPivot(armName + '_ElbowPitch', [L1, 0, 0], shoulderPitch);
    elbowPitch.rotation.z = d2r(pitch2Deg);

    createPart(armName + '_ElbowHinge', cylinderGeo(0.15, 0.15, 0.38, 14), jointBlack, {
      position: [0, 0, 0],
      rotation: [90, 0, 0],
      parent: elbowPitch
    });

    // Forearm Boom (length 2.0)
    const L2 = 2.0;
    createPart(armName + '_ForearmMain', boxGeo(L2, 0.26, 0.26), safetyYellow, {
      position: [L2 * 0.5, 0, 0],
      parent: elbowPitch
    });
    // Hazard Stripes on forearm
    createPart(armName + '_HazardStripe1', boxGeo(0.22, 0.28, 0.28), jointBlack, {
      position: [L2 * 0.35, 0, 0],
      parent: elbowPitch
    });
    createPart(armName + '_HazardStripe2', boxGeo(0.22, 0.28, 0.28), jointBlack, {
      position: [L2 * 0.85, 0, 0],
      parent: elbowPitch
    });

    // Forearm Hydraulic Pitch Cylinder
    createPart(armName + '_ForeHydrCyl', cylinderGeo(0.05, 0.05, L2 * 0.5, 10), safetyYellow, {
      position: [L2 * 0.35, 0.2, 0],
      rotation: [0, 0, 90],
      parent: elbowPitch
    });
    createPart(armName + '_ForeHydrRod', cylinderGeo(0.03, 0.03, L2 * 0.45, 10), chromeMetal, {
      position: [L2 * 0.72, 0.2, 0],
      rotation: [0, 0, 90],
      parent: elbowPitch
    });

    // Flexible conduit hose on forearm
    const foreHose = pipeAlongPath([[0, -0.16, 0.12], [L2 * 0.5, -0.18, 0.12], [L2 * 0.9, -0.16, 0.12]], 0.025, { bendRadius: 0.06 });
    createPart(armName + '_ForeHose', foreHose, jointBlack, { parent: elbowPitch });

    // Arm-mounted Deep-Sea Heavy LED Work Spotlight
    createPart(armName + '_SpotHousing', cylinderGeo(0.09, 0.12, 0.22, 12), hullDark, {
      position: [L2 * 0.65, -0.22, 0],
      rotation: [0, 0, -90],
      parent: elbowPitch
    });
    createPart(armName + '_SpotLens', cylinderGeo(0.085, 0.085, 0.03, 12), floodLight, {
      position: [L2 * 0.65 + 0.12, -0.22, 0],
      rotation: [0, 0, -90],
      parent: elbowPitch
    });

    // 4. Wrist Assembly
    const wristPivot = createPivot(armName + '_Wrist', [L2, 0, 0], elbowPitch);
    wristPivot.rotation.x = d2r(rollDeg);
    wristPivot.rotation.z = d2r(pitch3Deg);

    createPart(armName + '_WristRotator', cylinderGeo(0.15, 0.15, 0.2, 14), safetyYellow, {
      position: [0.1, 0, 0],
      rotation: [0, 0, -90],
      parent: wristPivot
    });
    createPart(armName + '_WristFlange', cylinderGeo(0.17, 0.17, 0.06, 14), jointBlack, {
      position: [0.22, 0, 0],
      rotation: [0, 0, -90],
      parent: wristPivot
    });

    // 5. Tool / Manipulator End-Effector
    const clawBaseX = 0.25;

    if (hasScanner) {
      // Oceanographic Multispectral Scanner Tool Head
      createPart(armName + '_ScannerShaft', cylinderGeo(0.08, 0.08, 0.35, 12), chromeMetal, {
        position: [clawBaseX + 0.18, 0, 0],
        rotation: [0, 0, -90],
        parent: wristPivot
      });
      createPart(armName + '_ScannerHead', cylinderGeo(0.18, 0.14, 0.24, 14), safetyYellow, {
        position: [clawBaseX + 0.42, 0, 0],
        rotation: [0, 0, -90],
        parent: wristPivot
      });
      createPart(armName + '_ScannerLens', sphereGeo(0.12, 14, 10), cyanGlow, {
        position: [clawBaseX + 0.54, 0, 0],
        parent: wristPivot
      });
      createPart(armName + '_ScannerRing', torusGeo(0.19, 0.03, 8, 20), jointBlack, {
        position: [clawBaseX + 0.44, 0, 0],
        rotation: [0, 90, 0],
        parent: wristPivot
      });
    }

    // Heavy 3-Finger Articulated Gripper Claws
    const gripFactor = gripClosed ? 0.35 : 0.9;
    for (let f = 0; f < 3; f++) {
      const phi = (f * 120) * Math.PI / 180;
      const fy = Math.cos(phi) * 0.12;
      const fz = Math.sin(phi) * 0.12;

      // Base knuckle
      createPart(armName + '_FingerKnuckle_' + f, boxGeo(0.1, 0.06, 0.06), safetyYellow, {
        position: [clawBaseX + 0.05, fy, fz],
        parent: wristPivot
      });

      // Proximal heavy phalanx
      beamBetween(armName + '_FingerProx_' + f,
        [clawBaseX + 0.08, fy, fz],
        [clawBaseX + 0.28, fy * 1.15, fz * 1.15],
        0.03, safetyYellow, { parent: wristPivot }
      );

      // Distal hardened chrome claw prong curved inward
      beamBetween(armName + '_FingerDist_' + f,
        [clawBaseX + 0.28, fy * 1.15, fz * 1.15],
        [clawBaseX + 0.48, fy * gripFactor, fz * gripFactor],
        0.022, chromeMetal, { parent: wristPivot }
      );
    }
  }

  // Starboard Heavy Robotic Arm: Posed reaching down toward seabed mineral sample
  buildArticulatedArm('Arm_Stbd', [2.5, 2.5, 1.6], -20, -36, 46, -10, 22, true, false);

  // Port Heavy Robotic Arm: Posed hovering over forward specimen collection basket with active scanner
  buildArticulatedArm('Arm_Port', [2.5, 2.5, -1.6], 30, -18, 34, -16, -28, false, true);

  // ==========================================
  // 5. SEABED BENTHIC BASKET & WORKSTATION
  // ==========================================
  
  // Forward Specimen Collection Basket [4.1, 0.35, 0]
  createPart('Basket_Base', boxGeo(1.4, 0.08, 0.95), frameworkDark, { position: [4.1, 0.08, 0], parent: root });
  createPart('Basket_FrontRail', boxGeo(1.4, 0.05, 0.05), safetyYellow, { position: [4.1, 0.48, 0.47], parent: root });
  createPart('Basket_RearRail', boxGeo(1.4, 0.05, 0.05), safetyYellow, { position: [4.1, 0.48, -0.47], parent: root });
  createPart('Basket_LeftRail', boxGeo(0.05, 0.05, 0.95), safetyYellow, { position: [4.8, 0.48, 0], parent: root });
  createPart('Basket_RightRail', boxGeo(0.05, 0.05, 0.95), safetyYellow, { position: [3.4, 0.48, 0], parent: root });
  
  // Basket Corner Posts
  createPart('Basket_Post1', boxGeo(0.06, 0.4, 0.06), safetyYellow, { position: [4.77, 0.28, 0.44], parent: root });
  createPart('Basket_Post2', boxGeo(0.06, 0.4, 0.06), safetyYellow, { position: [4.77, 0.28, -0.44], parent: root });
  createPart('Basket_Post3', boxGeo(0.06, 0.4, 0.06), safetyYellow, { position: [3.43, 0.28, 0.44], parent: root });
  createPart('Basket_Post4', boxGeo(0.06, 0.4, 0.06), safetyYellow, { position: [3.43, 0.28, -0.44], parent: root });

  // Sturdy Deployment Support Struts Connecting Basket to Station Lower Hull
  beamBetween('Basket_StrutL', [2.3, 2.2, 0.6], [3.5, 0.45, 0.4], 0.08, frameworkDark, { parent: root });
  beamBetween('Basket_StrutR', [2.3, 2.2, -0.6], [3.5, 0.45, -0.4], 0.08, frameworkDark, { parent: root });

  // Core Sample Canisters inside Basket
  createPart('Canister_1', cylinderGeo(0.09, 0.09, 0.45, 12), chromeMetal, { position: [3.9, 0.32, 0.2], parent: root });
  createPart('Canister_1_Cap', cylinderGeo(0.095, 0.095, 0.07, 12), cyanGlow, { position: [3.9, 0.56, 0.2], parent: root });

  createPart('Canister_2', cylinderGeo(0.09, 0.09, 0.45, 12), safetyYellow, { position: [4.3, 0.32, 0.18], parent: root });
  createPart('Canister_2_Cap', cylinderGeo(0.095, 0.095, 0.07, 12), jointBlack, { position: [4.3, 0.56, 0.18], parent: root });

  createPart('Canister_3', cylinderGeo(0.09, 0.09, 0.45, 12), chromeMetal, { position: [3.8, 0.32, -0.2], parent: root });
  createPart('Canister_3_Cap', cylinderGeo(0.095, 0.095, 0.07, 12), amberBeacon, { position: [3.8, 0.56, -0.2], parent: root });

  // Seabed Hydrothermal Mineral Chimney Spire near Starboard Arm Claw
  createPart('Hydro_Mound', cylinderGeo(0.35, 0.55, 0.25, 12), frameworkDark, { position: [4.3, 0.125, 1.3], parent: root });
  createPart('Hydro_Spire', cylinderGeo(0.14, 0.28, 0.68, 12), hullDark, { position: [4.3, 0.57, 1.3], parent: root });
  createPart('Hydro_VentGlow', sphereGeo(0.09, 10, 8), amberBeacon, { position: [4.3, 0.92, 1.3], parent: root });

  // Oceanographic Subsea Sensor Tether Cable Connecting Chimney to Station Hull
  const hydroTether = pipeAlongPath([[2.2, 2.2, 1.2], [3.2, 0.3, 1.3], [4.3, 0.15, 1.3]], 0.035, { bendRadius: 0.15 });
  createPart('Hydro_SensorTether', hydroTether, jointBlack, { parent: root });

  // ==========================================
  // 6. EXTERIOR FLOODLIGHTS & UMBILICALS
  // ==========================================
  
  // Dual Forward Heavy LED Floodlight Pods aimed at seabed sampling
  createPart('Flood_FwdL_Bracket', boxGeo(0.1, 0.1, 0.2), frameworkDark, { position: [2.5, 3.2, 0.85], parent: root });
  createPart('Flood_FwdL_Housing', cylinderGeo(0.16, 0.22, 0.32, 12), hullDark, {
    position: [2.7, 3.1, 0.85],
    rotation: [-22, 15, 0],
    parent: root
  });
  createPart('Flood_FwdL_Lens', cylinderGeo(0.15, 0.15, 0.03, 12), floodLight, {
    position: [2.82, 3.05, 0.88],
    rotation: [-22, 15, 0],
    parent: root
  });

  createPart('Flood_FwdR_Bracket', boxGeo(0.1, 0.1, 0.2), frameworkDark, { position: [2.5, 3.2, -0.85], parent: root });
  createPart('Flood_FwdR_Housing', cylinderGeo(0.16, 0.22, 0.32, 12), hullDark, {
    position: [2.7, 3.1, -0.85],
    rotation: [-22, -15, 0],
    parent: root
  });
  createPart('Flood_FwdR_Lens', cylinderGeo(0.15, 0.15, 0.03, 12), floodLight, {
    position: [2.82, 3.05, -0.88],
    rotation: [-22, -15, 0],
    parent: root
  });

  return root;
}
