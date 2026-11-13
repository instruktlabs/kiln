// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {
  name: 'Intricate Brass Orrery',
  category: 'prop',
  role: 'prop'
};

function build() {
  const root = createRoot('Orrery');

  // --- Materials ---
  // Rich Dark Walnut Wood (deep polished espresso walnut)
  const walnutMat = gameMaterial(0x28160b, { roughness: 0.60, metalness: 0.04 });

  // Polished antique brasses & metals
  const brightBrass = gameMaterial(0xd8b248, { metalness: 0.90, roughness: 0.20 });
  const antiqueBrass = gameMaterial(0xb89238, { metalness: 0.85, roughness: 0.32 });
  const deepBronze = gameMaterial(0x8c6b28, { metalness: 0.82, roughness: 0.38 });
  const steelMat = gameMaterial(0x8e98a0, { metalness: 0.92, roughness: 0.28 });

  // Celestial sphere materials
  const sunMat = gameMaterial(0xffcc33, {
    metalness: 0.85,
    roughness: 0.15,
    emissive: 0xffaa00,
    emissiveIntensity: 0.35
  });
  const mercuryMat = gameMaterial(0x7a7470, { metalness: 0.65, roughness: 0.35 });
  const venusMat = gameMaterial(0xe8d8b0, { metalness: 0.45, roughness: 0.25 });
  const earthMat = gameMaterial(0x1d559c, { metalness: 0.30, roughness: 0.35 });
  const moonMat = gameMaterial(0xdddddd, { metalness: 0.25, roughness: 0.45 });
  const marsMat = gameMaterial(0xb84224, { metalness: 0.45, roughness: 0.40 });
  const jupiterMat = gameMaterial(0xcc9652, { metalness: 0.35, roughness: 0.35 });
  const saturnMat = gameMaterial(0xd8be82, { metalness: 0.40, roughness: 0.30 });
  const saturnRingMat = gameMaterial(0xc8a44e, { metalness: 0.85, roughness: 0.25 });

  // ==========================================
  // 1. WALNUT BASE & INLAID HORIZON DIAL
  // ==========================================
  // Four turned bun feet with brass leveling pads
  const footAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (let i = 0; i < 4; i++) {
    const angle = footAngles[i];
    const fx = Math.cos(angle) * 0.20;
    const fz = Math.sin(angle) * 0.20;
    // Brass levelling disc
    createPart('FootBrassPad' + i, cylinderGeo(0.024, 0.024, 0.004, 16), antiqueBrass, {
      position: [fx, 0.002, fz],
      parent: root
    });
    // Walnut turned bun foot
    createPart('FootWalnut' + i, cylinderGeo(0.018, 0.024, 0.018, 16), walnutMat, {
      position: [fx, 0.013, fz],
      parent: root
    });
    // Brass collar trim ring
    createPart('FootCollar' + i, torusGeo(0.018, 0.002, 8, 16), brightBrass, {
      position: [fx, 0.022, fz],
      rotation: [90, 0, 0],
      parent: root
    });
  }

  // Stepped Walnut Plinth (lathed stepped profile)
  const plinthProfile = [
    [0, 0.015],
    [0.235, 0.015],
    [0.235, 0.030],
    [0.228, 0.040],
    [0.228, 0.065],
    [0.220, 0.076],
    [0.215, 0.088],
    [0, 0.088]
  ];
  const plinthGeo = lathe(plinthProfile, 48);
  createPart('WalnutPlinth', plinthGeo, walnutMat, { parent: root });

  // Lower brass moulding trim ring around plinth
  createPart('PlinthBrassTrim', torusGeo(0.235, 0.0026, 8, 48), antiqueBrass, {
    position: [0, 0.018, 0],
    rotation: [90, 0, 0],
    parent: root
  });

  // Inlaid Brass Calendar & Zodiac Horizon Ring (Y = 0.089)
  createPart('ZodiacRingPlate', cylinderGeo(0.212, 0.212, 0.002, 48), antiqueBrass, {
    position: [0, 0.089, 0],
    parent: root
  });
  createPart('ZodiacOuterBezel', torusGeo(0.212, 0.0025, 8, 48), brightBrass, {
    position: [0, 0.090, 0],
    rotation: [90, 0, 0],
    parent: root
  });
  createPart('ZodiacInnerBezel', torusGeo(0.160, 0.0025, 8, 48), brightBrass, {
    position: [0, 0.090, 0],
    rotation: [90, 0, 0],
    parent: root
  });

  // Engraved radial graduation ticks on the horizon ring
  for (let i = 0; i < 24; i++) {
    const rad = (i / 24) * Math.PI * 2;
    const isMajor = i % 2 === 0;
    const rStart = isMajor ? 0.165 : 0.175;
    const rEnd = 0.207;
    const x0 = Math.cos(rad) * rStart;
    const z0 = Math.sin(rad) * rStart;
    const x1 = Math.cos(rad) * rEnd;
    const z1 = Math.sin(rad) * rEnd;
    beamBetween('Tick' + i, [x0, 0.091, z0], [x1, 0.091, z1], isMajor ? 0.0012 : 0.0008, brightBrass, { parent: root });
  }

  // Maker's Brass Cartouche on front face of plinth (+X)
  createPart('MakersPlate', boxGeo(0.003, 0.022, 0.065), brightBrass, {
    position: [0.229, 0.052, 0],
    parent: root
  });
  // Etched inscription center on plaque
  createPart('MakersPlateInlay', boxGeo(0.0035, 0.014, 0.050), deepBronze, {
    position: [0.230, 0.052, 0],
    parent: root
  });
  // 12 Zodiac / calendar boss studs around horizon ring
  for (let z = 0; z < 12; z++) {
    const zrad = (z / 12) * Math.PI * 2;
    createPart('ZodiacStud' + z, sphereGeo(0.0022, 8, 6), brightBrass, {
      position: [Math.cos(zrad) * 0.186, 0.091, Math.sin(zrad) * 0.186],
      parent: root
    });
  }
  // 4 corner mounting rivets on plate
  const rivetOffsets = [
    [0.008, 0.026],
    [-0.008, 0.026],
    [0.008, -0.026],
    [-0.008, -0.026]
  ];
  for (let r = 0; r < 4; r++) {
    createPart('PlateRivet' + r, sphereGeo(0.0015, 6, 6), steelMat, {
      position: [0.231, 0.052 + rivetOffsets[r][0], rivetOffsets[r][1]],
      parent: root
    });
  }

  // ==========================================
  // 2. CENTRAL PEDESTAL & GEARBOX HOUSING
  // ==========================================
  // Central turned brass pedestal base
  createPart('PedestalBaseDisc', cylinderGeo(0.082, 0.092, 0.010, 32), antiqueBrass, {
    position: [0, 0.095, 0],
    parent: root
  });
  createPart('PedestalBead', torusGeo(0.075, 0.006, 10, 32), brightBrass, {
    position: [0, 0.103, 0],
    rotation: [90, 0, 0],
    parent: root
  });
  createPart('PedestalSpool', cylinderGeo(0.050, 0.072, 0.016, 32), antiqueBrass, {
    position: [0, 0.114, 0],
    parent: root
  });
  createPart('PedestalFlange', cylinderGeo(0.060, 0.050, 0.010, 32), brightBrass, {
    position: [0, 0.126, 0],
    parent: root
  });

  // Gearbox lower and upper circular plates
  createPart('LowerGearPlate', cylinderGeo(0.092, 0.092, 0.003, 36), brightBrass, {
    position: [0, 0.133, 0],
    parent: root
  });
  createPart('LowerPlateRim', torusGeo(0.092, 0.0025, 8, 36), antiqueBrass, {
    position: [0, 0.133, 0],
    rotation: [90, 0, 0],
    parent: root
  });

  // Pierced open upper gear plate (outer ring, hub & 4 viewing quadrants)
  createPart('UpperPlateRim', torusGeo(0.092, 0.003, 8, 36), brightBrass, {
    position: [0, 0.215, 0],
    rotation: [90, 0, 0],
    parent: root
  });
  createPart('UpperPlateHub', cylinderGeo(0.026, 0.026, 0.003, 24), brightBrass, {
    position: [0, 0.215, 0],
    parent: root
  });
  // 4 Cross-arms connecting hub to rim
  for (let a = 0; a < 4; a++) {
    const armAng = (a / 4) * Math.PI * 2;
    const ax = Math.cos(armAng) * 0.058;
    const az = Math.sin(armAng) * 0.058;
    createPart('UpperPlateSpoke' + a, boxGeo(0.064, 0.003, 0.008), antiqueBrass, {
      position: [ax, 0.215, az],
      rotation: [0, -armAng * (180 / Math.PI), 0],
      parent: root
    });
  }

  // 4 Turned Brass Baluster Pillars connecting lower and upper plates
  const pillarAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (let p = 0; p < 4; p++) {
    const ang = pillarAngles[p];
    const px = Math.cos(ang) * 0.078;
    const pz = Math.sin(ang) * 0.078;
    // Lower foot
    createPart('PillarFoot' + p, cylinderGeo(0.006, 0.007, 0.008, 12), antiqueBrass, {
      position: [px, 0.138, pz],
      parent: root
    });
    // Baluster mid section
    createPart('PillarBody' + p, cylinderGeo(0.004, 0.0065, 0.060, 12), brightBrass, {
      position: [px, 0.174, pz],
      parent: root
    });
    // Turned ring bead
    createPart('PillarRing' + p, torusGeo(0.006, 0.002, 8, 12), brightBrass, {
      position: [px, 0.174, pz],
      rotation: [90, 0, 0],
      parent: root
    });
    // Upper head
    createPart('PillarHead' + p, cylinderGeo(0.007, 0.006, 0.008, 12), antiqueBrass, {
      position: [px, 0.210, pz],
      parent: root
    });
    // Acorn nut finial on top of upper plate
    createPart('PillarAcorn' + p, coneGeo(0.004, 0.008, 12), brightBrass, {
      position: [px, 0.220, pz],
      parent: root
    });
  }

  // Central Vertical Fixed Spindle (Sun shaft)
  createPart('CentralSpindle', cylinderGeo(0.006, 0.006, 0.250, 16), steelMat, {
    position: [0, 0.255, 0],
    parent: root
  });

  // ==========================================
  // 3. HAND CRANK & DRIVE ARBOR (Animated)
  // ==========================================
  // Bearing block on front of lower plate
  createPart('CrankBearingBlock', boxGeo(0.015, 0.016, 0.018), antiqueBrass, {
    position: [0.088, 0.142, 0],
    parent: root
  });

  // Animated Crank Pivot
  const jointCrank = createPivot('Crank', [0.060, 0.142, 0], root);
  // Horizontal drive shaft (along X)
  createPart('CrankShaft', cylinderGeo(0.0035, 0.0035, 0.090, 12), steelMat, {
    position: [0.045, 0, 0],
    rotation: [0, 0, 90],
    parent: jointCrank
  });
  // Bevel gear on crank shaft meshing with idler pinion
  createPart('CrankBevelGear', gearGeo({
    teeth: 14,
    rootRadius: 0.012,
    tipRadius: 0.016,
    boreRadius: 0.0035,
    height: 0.006
  }), antiqueBrass, {
    position: [0.005, 0, 0],
    rotation: [0, 0, 90],
    parent: jointCrank
  });
  // Brass crank boss & curved crank arm at outer end (X = 0.090 relative to joint)
  createPart('CrankBoss', cylinderGeo(0.007, 0.007, 0.008, 12), brightBrass, {
    position: [0.090, 0, 0],
    rotation: [0, 0, 90],
    parent: jointCrank
  });
  const crankArmGeo = pipeAlongPath([
    [0.090, 0, 0],
    [0.093, 0, 0],
    [0.093, 0.036, 0],
    [0.098, 0.038, 0]
  ], 0.0028, { bendRadius: 0.008 });
  createPart('CrankArmBar', crankArmGeo, brightBrass, { parent: jointCrank });
  // Turned dark walnut crank handle knob
  createPart('CrankHandle', cylinderGeo(0.006, 0.008, 0.032, 12), walnutMat, {
    position: [0.114, 0.038, 0],
    rotation: [0, 0, 90],
    parent: jointCrank
  });
  createPart('CrankHandleCap', sphereGeo(0.004, 8, 8), brightBrass, {
    position: [0.131, 0.038, 0],
    parent: jointCrank
  });

  // ==========================================
  // 4. IDLER ARBORS & COUNTER-GEARS (Animated)
  // ==========================================
  // Primary Idler Shaft (Offset at [0.052, 0, 0.030])
  const jointIdler1 = createPivot('IdlerArbor1', [0.052, 0, 0.030], root);
  // Steel shaft
  createPart('Idler1Shaft', cylinderGeo(0.003, 0.003, 0.080, 12), steelMat, {
    position: [0, 0.174, 0],
    parent: jointIdler1
  });
  // Stacked counter-pinions on Idler 1
  const idlerPinionData = [
    { y: 0.142, teeth: 18, root: 0.024, tip: 0.029 },
    { y: 0.154, teeth: 16, root: 0.020, tip: 0.025 },
    { y: 0.166, teeth: 14, root: 0.017, tip: 0.022 },
    { y: 0.178, teeth: 12, root: 0.014, tip: 0.019 },
    { y: 0.190, teeth: 10, root: 0.011, tip: 0.016 },
    { y: 0.202, teeth: 8,  root: 0.008, tip: 0.013 }
  ];
  for (let k = 0; k < idlerPinionData.length; k++) {
    const p = idlerPinionData[k];
    const g = gearGeo({
      teeth: p.teeth,
      rootRadius: p.root,
      tipRadius: p.tip,
      boreRadius: 0.003,
      height: 0.005
    });
    createPart('IdlerPinion' + k, g, deepBronze, {
      position: [0, p.y + 0.002, 0],
      parent: jointIdler1
    });
  }

  // Secondary Idler / Flywheel Shaft (Offset at [-0.048, 0, -0.032])
  const jointIdler2 = createPivot('IdlerArbor2', [-0.048, 0, -0.032], root);
  createPart('Idler2Shaft', cylinderGeo(0.003, 0.003, 0.080, 12), steelMat, {
    position: [0, 0.174, 0],
    parent: jointIdler2
  });
  // Transfer spur gear
  createPart('TransferGear', gearGeo({
    teeth: 26,
    rootRadius: 0.032,
    tipRadius: 0.038,
    boreRadius: 0.003,
    height: 0.005
  }), antiqueBrass, {
    position: [0, 0.150, 0],
    parent: jointIdler2
  });
  // Four-spoked brass flywheel with rim weights
  createPart('FlywheelRim', torusGeo(0.038, 0.0028, 8, 24), brightBrass, {
    position: [0, 0.188, 0],
    rotation: [90, 0, 0],
    parent: jointIdler2
  });
  createPart('FlywheelHub', cylinderGeo(0.007, 0.007, 0.007, 12), brightBrass, {
    position: [0, 0.188, 0],
    parent: jointIdler2
  });
  // 4 spokes and counterweights
  for (let s = 0; s < 4; s++) {
    const sang = (s / 4) * Math.PI * 2;
    const sx = Math.cos(sang) * 0.019;
    const sz = Math.sin(sang) * 0.019;
    createPart('Spoke' + s, cylinderGeo(0.0014, 0.0014, 0.036, 8), brightBrass, {
      position: [sx, 0.188, sz],
      rotation: [0, -sang * (180 / Math.PI), 90],
      parent: jointIdler2
    });
    const wx = Math.cos(sang) * 0.032;
    const wz = Math.sin(sang) * 0.032;
    createPart('Weight' + s, cylinderGeo(0.004, 0.004, 0.006, 10), antiqueBrass, {
      position: [wx, 0.188, wz],
      parent: jointIdler2
    });
  }

  // ==========================================
  // 5. SUN (Center Top)
  // ==========================================
  // Fluted capital supporting sun spindle
  createPart('SunCapital', cylinderGeo(0.016, 0.010, 0.018, 20), brightBrass, {
    position: [0, 0.370, 0],
    parent: root
  });
  createPart('SunNeckBead', torusGeo(0.014, 0.0025, 8, 20), brightBrass, {
    position: [0, 0.380, 0],
    rotation: [90, 0, 0],
    parent: root
  });
  createPart('SunSupportPin', cylinderGeo(0.004, 0.004, 0.024, 12), antiqueBrass, {
    position: [0, 0.395, 0],
    parent: root
  });
  // The Golden Sun
  createPart('SunSphere', sphereGeo(0.034, 24, 16), sunMat, {
    position: [0, 0.420, 0],
    parent: root
  });
  // Decorative solar meridian ring halo & radiant sun rays
  createPart('SunHaloRing', torusGeo(0.046, 0.002, 8, 32), brightBrass, {
    position: [0, 0.420, 0],
    rotation: [25, 30, 0],
    parent: root
  });
  // 8 Radiant solar rays
  for (let sr = 0; sr < 8; sr++) {
    const srad = (sr / 8) * Math.PI * 2;
    const rx = Math.cos(srad) * 0.042;
    const ry = Math.sin(srad) * 0.042;
    createPart('SunRay' + sr, coneGeo(0.0022, 0.014, 8), brightBrass, {
      position: [rx, 0.420 + ry, 0],
      rotation: [0, 0, -srad * (180 / Math.PI) - 90],
      parent: root
    });
  }

  // ==========================================
  // 6. PLANETARY ARMS, GEARS & SPHERES
  // ==========================================

  // --- MERCURY ---
  const jointMercury = createPivot('Mercury', [0, 0, 0], root);
  // Mercury Drive Gear (inside clockwork cage)
  createPart('MercuryGear', gearGeo({
    teeth: 16,
    rootRadius: 0.023,
    tipRadius: 0.028,
    boreRadius: 0.007,
    height: 0.005
  }), antiqueBrass, {
    position: [0, 0.142, 0],
    parent: jointMercury
  });
  // Concentric sleeve collar above cage
  createPart('MercuryCollar', cylinderGeo(0.022, 0.022, 0.012, 20), brightBrass, {
    position: [0, 0.224, 0],
    parent: jointMercury
  });
  createPart('MercuryCollarBead', torusGeo(0.023, 0.002, 8, 20), antiqueBrass, {
    position: [0, 0.228, 0],
    rotation: [90, 0, 0],
    parent: jointMercury
  });
  // Swept brass support arm
  const mercuryArmGeo = pipeAlongPath([
    [0.022, 0.226, 0],
    [0.045, 0.228, 0],
    [0.082, 0.270, 0],
    [0.082, 0.370, 0]
  ], 0.0022, { bendRadius: 0.020 });
  createPart('MercuryArm', mercuryArmGeo, brightBrass, { parent: jointMercury });
  // Planet cup & sphere
  createPart('MercuryCup', cylinderGeo(0.005, 0.003, 0.006, 12), brightBrass, {
    position: [0.082, 0.372, 0],
    parent: jointMercury
  });
  createPart('MercurySphere', sphereGeo(0.007, 14, 10), mercuryMat, {
    position: [0.082, 0.380, 0],
    parent: jointMercury
  });

  // --- VENUS ---
  const jointVenus = createPivot('Venus', [0, 0, 0], root);
  // Venus Drive Gear
  createPart('VenusGear', gearGeo({
    teeth: 22,
    rootRadius: 0.032,
    tipRadius: 0.038,
    boreRadius: 0.008,
    height: 0.005
  }), antiqueBrass, {
    position: [0, 0.154, 0],
    parent: jointVenus
  });
  // Collar
  createPart('VenusCollar', cylinderGeo(0.020, 0.020, 0.012, 20), brightBrass, {
    position: [0, 0.242, 0],
    parent: jointVenus
  });
  createPart('VenusCollarBead', torusGeo(0.021, 0.002, 8, 20), antiqueBrass, {
    position: [0, 0.246, 0],
    rotation: [90, 0, 0],
    parent: jointVenus
  });
  // Swept brass arm
  const venusArmGeo = pipeAlongPath([
    [0.020, 0.244, 0],
    [0.065, 0.246, 0],
    [0.135, 0.290, 0],
    [0.135, 0.370, 0]
  ], 0.0025, { bendRadius: 0.025 });
  createPart('VenusArm', venusArmGeo, brightBrass, { parent: jointVenus });
  // Cup & sphere
  createPart('VenusCup', cylinderGeo(0.006, 0.004, 0.007, 12), brightBrass, {
    position: [0.135, 0.372, 0],
    parent: jointVenus
  });
  createPart('VenusSphere', sphereGeo(0.011, 16, 12), venusMat, {
    position: [0.135, 0.385, 0],
    parent: jointVenus
  });

  // --- EARTH & MOON ---
  const jointEarth = createPivot('Earth', [0, 0, 0], root);
  // Earth Drive Gear
  createPart('EarthGear', gearGeo({
    teeth: 30,
    rootRadius: 0.042,
    tipRadius: 0.048,
    boreRadius: 0.009,
    height: 0.005
  }), antiqueBrass, {
    position: [0, 0.166, 0],
    parent: jointEarth
  });
  // Collar
  createPart('EarthCollar', cylinderGeo(0.018, 0.018, 0.012, 20), brightBrass, {
    position: [0, 0.260, 0],
    parent: jointEarth
  });
  createPart('EarthCollarBead', torusGeo(0.019, 0.002, 8, 20), antiqueBrass, {
    position: [0, 0.264, 0],
    rotation: [90, 0, 0],
    parent: jointEarth
  });
  // Swept brass arm
  const earthArmGeo = pipeAlongPath([
    [0.018, 0.262, 0],
    [0.080, 0.264, 0],
    [0.198, 0.300, 0],
    [0.198, 0.364, 0]
  ], 0.0028, { bendRadius: 0.030 });
  createPart('EarthArm', earthArmGeo, brightBrass, { parent: jointEarth });
  // Earth platform bracket
  createPart('EarthPlatform', cylinderGeo(0.010, 0.010, 0.004, 16), brightBrass, {
    position: [0.198, 0.366, 0],
    parent: jointEarth
  });
  // Tilted polar brass axis pin (23.5° axial tilt)
  createPart('EarthPolarAxis', cylinderGeo(0.0016, 0.0016, 0.036, 8), steelMat, {
    position: [0.198, 0.384, 0],
    rotation: [0, 0, 23.5],
    parent: jointEarth
  });
  // Earth globe
  createPart('EarthSphere', sphereGeo(0.013, 18, 12), earthMat, {
    position: [0.198, 0.384, 0],
    parent: jointEarth
  });

  // Animated Moon Sub-mechanism
  const jointMoon = createPivot('Moon', [0.198, 0.384, 0], jointEarth);
  // Miniature Moon ring gear underneath Earth
  createPart('MoonDriveGear', gearGeo({
    teeth: 12,
    rootRadius: 0.006,
    tipRadius: 0.0085,
    boreRadius: 0.002,
    height: 0.002
  }), antiqueBrass, {
    position: [0, -0.012, 0],
    parent: jointMoon
  });
  // Curved brass wire arm for the Moon
  const moonWireGeo = pipeAlongPath([
    [0, -0.012, 0],
    [0.018, -0.010, 0],
    [0.028, 0, 0]
  ], 0.0012, { bendRadius: 0.006 });
  createPart('MoonArmWire', moonWireGeo, brightBrass, { parent: jointMoon });
  // Pearl Moon
  createPart('MoonSphere', sphereGeo(0.0042, 10, 8), moonMat, {
    position: [0.028, 0, 0],
    parent: jointMoon
  });

  // --- MARS ---
  const jointMars = createPivot('Mars', [0, 0, 0], root);
  // Mars Drive Gear
  createPart('MarsGear', gearGeo({
    teeth: 38,
    rootRadius: 0.050,
    tipRadius: 0.057,
    boreRadius: 0.010,
    height: 0.005
  }), antiqueBrass, {
    position: [0, 0.178, 0],
    parent: jointMars
  });
  // Collar
  createPart('MarsCollar', cylinderGeo(0.016, 0.016, 0.012, 20), brightBrass, {
    position: [0, 0.278, 0],
    parent: jointMars
  });
  createPart('MarsCollarBead', torusGeo(0.017, 0.002, 8, 20), antiqueBrass, {
    position: [0, 0.282, 0],
    rotation: [90, 0, 0],
    parent: jointMars
  });
  // Swept brass arm
  const marsArmGeo = pipeAlongPath([
    [0.016, 0.280, 0],
    [0.095, 0.282, 0],
    [0.262, 0.310, 0],
    [0.262, 0.368, 0]
  ], 0.0030, { bendRadius: 0.035 });
  createPart('MarsArm', marsArmGeo, brightBrass, { parent: jointMars });
  // Cup & sphere
  createPart('MarsCup', cylinderGeo(0.005, 0.0035, 0.006, 12), brightBrass, {
    position: [0.262, 0.370, 0],
    parent: jointMars
  });
  createPart('MarsSphere', sphereGeo(0.009, 16, 12), marsMat, {
    position: [0.262, 0.381, 0],
    parent: jointMars
  });

  // --- JUPITER ---
  const jointJupiter = createPivot('Jupiter', [0, 0, 0], root);
  // Jupiter Drive Gear
  createPart('JupiterGear', gearGeo({
    teeth: 46,
    rootRadius: 0.058,
    tipRadius: 0.065,
    boreRadius: 0.011,
    height: 0.005
  }), antiqueBrass, {
    position: [0, 0.190, 0],
    parent: jointJupiter
  });
  // Collar
  createPart('JupiterCollar', cylinderGeo(0.014, 0.014, 0.012, 20), brightBrass, {
    position: [0, 0.296, 0],
    parent: jointJupiter
  });
  createPart('JupiterCollarBead', torusGeo(0.015, 0.002, 8, 20), antiqueBrass, {
    position: [0, 0.300, 0],
    rotation: [90, 0, 0],
    parent: jointJupiter
  });
  // Swept brass arm
  const jupiterArmGeo = pipeAlongPath([
    [0.014, 0.298, 0],
    [0.115, 0.300, 0],
    [0.332, 0.320, 0],
    [0.332, 0.362, 0]
  ], 0.0034, { bendRadius: 0.040 });
  createPart('JupiterArm', jupiterArmGeo, brightBrass, { parent: jointJupiter });
  // Cup & large sphere
  createPart('JupiterCup', cylinderGeo(0.009, 0.006, 0.008, 16), brightBrass, {
    position: [0.332, 0.365, 0],
    parent: jointJupiter
  });
  createPart('JupiterSphere', sphereGeo(0.022, 22, 16), jupiterMat, {
    position: [0.332, 0.392, 0],
    parent: jointJupiter
  });
  // Galilean moons bracket & 4 moon pins
  createPart('JupiterMoonBar', cylinderGeo(0.001, 0.001, 0.076, 8), brightBrass, {
    position: [0.332, 0.392, 0],
    rotation: [90, 0, 0],
    parent: jointJupiter
  });
  const moonOffsets = [-0.035, -0.024, 0.024, 0.035];
  for (let m = 0; m < 4; m++) {
    createPart('GalileanMoon' + m, sphereGeo(0.0022, 8, 6), brightBrass, {
      position: [0.332, 0.392, moonOffsets[m]],
      parent: jointJupiter
    });
  }

  // --- SATURN ---
  const jointSaturn = createPivot('Saturn', [0, 0, 0], root);
  // Saturn Drive Gear
  createPart('SaturnGear', gearGeo({
    teeth: 54,
    rootRadius: 0.066,
    tipRadius: 0.073,
    boreRadius: 0.012,
    height: 0.005
  }), antiqueBrass, {
    position: [0, 0.202, 0],
    parent: jointSaturn
  });
  // Collar
  createPart('SaturnCollar', cylinderGeo(0.012, 0.012, 0.012, 20), brightBrass, {
    position: [0, 0.314, 0],
    parent: jointSaturn
  });
  createPart('SaturnCollarBead', torusGeo(0.013, 0.002, 8, 20), antiqueBrass, {
    position: [0, 0.318, 0],
    rotation: [90, 0, 0],
    parent: jointSaturn
  });
  // Swept brass arm
  const saturnArmGeo = pipeAlongPath([
    [0.012, 0.316, 0],
    [0.130, 0.318, 0],
    [0.412, 0.330, 0],
    [0.412, 0.362, 0]
  ], 0.0036, { bendRadius: 0.045 });
  createPart('SaturnArm', saturnArmGeo, brightBrass, { parent: jointSaturn });
  // Cup, sphere & ring
  createPart('SaturnCup', cylinderGeo(0.008, 0.005, 0.008, 16), brightBrass, {
    position: [0.412, 0.365, 0],
    parent: jointSaturn
  });
  createPart('SaturnSphere', sphereGeo(0.018, 20, 14), saturnMat, {
    position: [0.412, 0.390, 0],
    parent: jointSaturn
  });
  // Concentric tilted brass rings
  createPart('SaturnRingMain', torusGeo(0.030, 0.0020, 8, 36), saturnRingMat, {
    position: [0.412, 0.390, 0],
    rotation: [22, 0, 15],
    parent: jointSaturn
  });
  createPart('SaturnRingOuter', torusGeo(0.036, 0.0010, 8, 36), saturnRingMat, {
    position: [0.412, 0.390, 0],
    rotation: [22, 0, 15],
    parent: jointSaturn
  });
  // Celestial initial epoch (planets distributed aesthetically around the Sun)
  jointMercury.rotation.y = (45 * Math.PI) / 180;
  jointVenus.rotation.y = (130 * Math.PI) / 180;
  jointEarth.rotation.y = (220 * Math.PI) / 180;
  jointMars.rotation.y = (315 * Math.PI) / 180;
  jointJupiter.rotation.y = (80 * Math.PI) / 180;
  jointSaturn.rotation.y = (170 * Math.PI) / 180;

  return root;
}

// ==========================================
// 7. ANIMATION
// ==========================================
function makeSpinTrack(jointName, totalDuration, turns, axis = 'y', initialDeg = 0) {
  const stepsPerTurn = 4;
  const totalSteps = Math.max(4, Math.round(Math.abs(turns) * stepsPerTurn));
  const keyframes = [];
  for (let i = 0; i <= totalSteps; i++) {
    const fraction = i / totalSteps;
    const time = fraction * totalDuration;
    const deg = initialDeg + fraction * turns * 360;
    const rot = axis === 'y' ? [0, deg, 0] : axis === 'x' ? [deg, 0, 0] : [0, 0, deg];
    keyframes.push({ time, rotation: rot });
  }
  return rotationTrack(jointName, keyframes);
}

function animate(root) {
  const T = 24; // 24-second seamlessly looping clockwork cycle

  const tracks = [
    // Hand crank turns 24 times around X axis (1 turn/sec)
    makeSpinTrack('Joint_Crank', T, 24, 'x'),

    // Counter-gear idler arbors turn in sync with clockwork
    makeSpinTrack('Joint_IdlerArbor1', T, -12, 'y'),
    makeSpinTrack('Joint_IdlerArbor2', T, 24, 'y'),

    // Planetary orbits: harmonious integer/rational cycle counts with initial angles
    makeSpinTrack('Joint_Mercury', T, 8, 'y', 45),   // Mercury completes 8 orbits
    makeSpinTrack('Joint_Venus', T, 4, 'y', 130),    // Venus completes 4 orbits
    makeSpinTrack('Joint_Earth', T, 2, 'y', 220),    // Earth completes 2 orbits
    makeSpinTrack('Joint_Moon', T, 24, 'y', 0),      // Moon completes 24 orbits around Earth (12 per year)
    makeSpinTrack('Joint_Mars', T, 1, 'y', 315),     // Mars completes 1 orbit
    makeSpinTrack('Joint_Jupiter', T, 0.5, 'y', 80), // Jupiter completes 0.5 orbit
    makeSpinTrack('Joint_Saturn', T, 0.25, 'y', 170) // Saturn completes 0.25 orbit
  ];

  return [createClip('OrreryMotion', T, tracks)];
}
