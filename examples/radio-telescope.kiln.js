// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.

const meta = { name: 'RadioTelescope', category: 'prop' };

function build() {
  const root = createRoot('RadioTelescope');

  // Materials
  const concreteMat = gameMaterial(0x828585, { roughness: 0.95, metalness: 0.05 });
  const dishWhiteMat = gameMaterial(0xededec, { roughness: 0.55, metalness: 0.15 });
  const dishRearMat = gameMaterial(0xc5cad1, { roughness: 0.65, metalness: 0.25 });
  const steelMountMat = gameMaterial(0x526173, { roughness: 0.45, metalness: 0.65 });
  const steelTrussMat = gameMaterial(0x8da0b8, { roughness: 0.4, metalness: 0.55 });
  const machineryDarkMat = gameMaterial(0x273142, { roughness: 0.35, metalness: 0.8 });
  const accentYellowMat = gameMaterial(0xd97706, { roughness: 0.4, metalness: 0.15 });
  const goldMat = gameMaterial(0xd4af37, { roughness: 0.25, metalness: 0.9 });

  // ---------------------------------------------------------------------------
  // 1. STATIONARY PEDESTAL & FOUNDATION (Y = 0 to Y = 2.20m)
  // ---------------------------------------------------------------------------

  // Concrete foundation pad (sitting directly on Y = 0)
  createPart('PadBase', cylinderGeo(5.0, 5.2, 0.15, 12), concreteMat, {
    position: [0, 0.075, 0],
    parent: root,
  });
  createPart('PadOctagon', cylinderGeo(4.5, 4.5, 0.25, 12), concreteMat, {
    position: [0, 0.275, 0],
    parent: root,
  });

  // 8 radial foundation anchor piers with bolt fixtures
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const fx = Math.cos(angle) * 3.5;
    const fz = Math.sin(angle) * 3.5;
    createPart(`AnchorFoot_${i}`, boxGeo(0.7, 0.22, 0.7), machineryDarkMat, {
      position: [fx, 0.45, fz],
      parent: root,
    });
    createPart(`AnchorBolt_${i}`, cylinderGeo(0.04, 0.04, 0.1, 6), steelMountMat, {
      position: [fx, 0.6, fz],
      parent: root,
    });
  }

  // Circular azimuth rail track ring
  const azRailGeo = torusGeo(2.4, 0.06, 12, 48);
  createPart('AzimuthTrack', azRailGeo, machineryDarkMat, {
    position: [0, 0.42, 0],
    rotation: [90, 0, 0],
    parent: root,
  });

  // Stationary pedestal column (tapered 12-sided structural tower)
  createPart('PedestalBaseFlange', cylinderGeo(2.35, 2.45, 0.15, 12), machineryDarkMat, {
    position: [0, 0.475, 0],
    parent: root,
  });
  createPart('PedestalColumn', cylinderGeo(1.95, 2.25, 1.55, 12), steelMountMat, {
    position: [0, 1.325, 0],
    parent: root,
  });
  createPart('PedestalTopFlange', cylinderGeo(2.15, 1.95, 0.15, 12), machineryDarkMat, {
    position: [0, 2.15, 0],
    parent: root,
  });

  // Pedestal maintenance access door on -X side
  createPart('PedestalDoorFrame', boxGeo(0.08, 1.25, 0.75), machineryDarkMat, {
    position: [-2.05, 1.2, 0],
    parent: root,
  });
  createPart('PedestalDoor', boxGeo(0.04, 1.15, 0.65), accentYellowMat, {
    position: [-2.072, 1.2, 0],
    parent: root,
  });

  // 4 stationary azimuth drive units
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const mx = Math.cos(ang) * 2.38;
    const mz = Math.sin(ang) * 2.38;
    createPart(`AzDriveMotor_${i}`, cylinderGeo(0.22, 0.22, 0.5, 8), machineryDarkMat, {
      position: [mx, 0.65, mz],
      parent: root,
    });
    createPart(`AzDriveGear_${i}`, cylinderGeo(0.26, 0.26, 0.16, 12), accentYellowMat, {
      position: [mx, 0.45, mz],
      parent: root,
    });
  }

  // Rotary cable festoon guide on pedestal below turntable
  const cableGuide = torusGeo(2.1, 0.04, 8, 24);
  createPart('AzCableGuide', cableGuide, machineryDarkMat, {
    position: [0, 2.05, 0],
    rotation: [90, 0, 0],
    parent: root,
  });

  // Exterior ground-to-turntable access ladder
  createLadder('GroundLadder', {
    bottom: [-2.42, 0.4, 0.7],
    top: [-2.42, 2.2, 0.7],
    width: 0.45,
    rungCount: 6,
    material: machineryDarkMat,
    parent: root,
  });

  // ---------------------------------------------------------------------------
  // 2. AZIMUTH MOUNT & YOKE (Joint_Azimuth, Y = 2.20m)
  // ---------------------------------------------------------------------------
  const azPivotPos = [0, 2.20, 0];
  const azDeckGeo = cylinderGeo(2.55, 2.55, 0.22, 36);
  const jointAzimuth = createPart('Azimuth', azDeckGeo, steelMountMat, {
    position: azPivotPos,
    pivot: azPivotPos,
    parent: root,
  });
  jointAzimuth.name = 'Joint_Azimuth';

  // Turntable deck perimeter trim
  createPart('DeckRim', torusGeo(2.55, 0.05, 8, 36), machineryDarkMat, {
    position: [0, 0.08, 0],
    rotation: [90, 0, 0],
    parent: jointAzimuth,
  });

  // Perimeter handrail (open in front sector for dish swing clearance)
  const railRadius = 2.46;
  const numRailPosts = 16;
  for (let i = 0; i < numRailPosts; i++) {
    const a1 = (i / numRailPosts) * Math.PI * 2;
    const a2 = ((i + 1) / numRailPosts) * Math.PI * 2;
    const midAngle = (a1 + a2) / 2;
    const isFrontSector = Math.abs(midAngle) < 0.4 || Math.abs(midAngle - Math.PI * 2) < 0.4;

    const px = Math.cos(a1) * railRadius;
    const pz = Math.sin(a1) * railRadius;
    const nx = Math.cos(a2) * railRadius;
    const nz = Math.sin(a2) * railRadius;

    createPart(`RailPost_${i}`, cylinderGeo(0.022, 0.022, 0.95, 6), machineryDarkMat, {
      position: [px, 0.58, pz],
      parent: jointAzimuth,
    });

    if (!isFrontSector) {
      beamBetween(`RailTop_${i}`, [px, 1.05, pz], [nx, 1.05, nz], 0.022, machineryDarkMat, {
        segments: 6,
        parent: jointAzimuth,
      });
      beamBetween(`RailMid_${i}`, [px, 0.55, pz], [nx, 0.55, nz], 0.018, machineryDarkMat, {
        segments: 6,
        parent: jointAzimuth,
      });
    }
  }

  // Equipment / Machinery cabin on turntable deck (-X)
  createPart('EquipCabin', boxGeo(1.6, 1.45, 1.9), steelMountMat, {
    position: [-1.15, 0.82, 0],
    parent: jointAzimuth,
  });
  createPart('CabinDoor', boxGeo(0.04, 1.25, 0.7), machineryDarkMat, {
    position: [-0.33, 0.72, 0],
    parent: jointAzimuth,
  });
  createPart('CabinHvac', boxGeo(0.7, 0.4, 0.9), machineryDarkMat, {
    position: [-1.15, 1.75, 0],
    parent: jointAzimuth,
  });
  createPart('CabinHvacFan', cylinderYGeo(0.25, 0.25, 0.06, 12), accentYellowMat, {
    position: [-1.15, 1.98, 0],
    parent: jointAzimuth,
  });

  // Twin A-frame Stanchion Towers
  const towerZ = 2.15;
  const towerHeight = 4.90; // World Y = 7.10m for complete dish clearance
  [-towerZ, towerZ].forEach((tz, idx) => {
    const side = idx === 0 ? 'L' : 'R';

    // Front main column
    beamBetween(`TowerFront_${side}`, [0.95, 0.1, tz], [0, towerHeight, tz], 0.15, steelMountMat, {
      segments: 8,
      parent: jointAzimuth,
    });
    // Rear main column
    beamBetween(`TowerRear_${side}`, [-0.95, 0.1, tz], [0, towerHeight, tz], 0.15, steelMountMat, {
      segments: 8,
      parent: jointAzimuth,
    });
    // Horizontal cross ties
    beamBetween(`TowerCrossLow_${side}`, [0.65, 1.6, tz], [-0.65, 1.6, tz], 0.08, steelMountMat, {
      segments: 6,
      parent: jointAzimuth,
    });
    beamBetween(`TowerCrossHigh_${side}`, [0.35, 3.3, tz], [-0.35, 3.3, tz], 0.08, steelMountMat, {
      segments: 6,
      parent: jointAzimuth,
    });
    // Lattice X-braces
    beamBetween(`TowerDiagA_${side}`, [0.65, 1.6, tz], [-0.35, 3.3, tz], 0.05, steelTrussMat, {
      segments: 6,
      parent: jointAzimuth,
    });
    beamBetween(`TowerDiagB_${side}`, [-0.65, 1.6, tz], [0.35, 3.3, tz], 0.05, steelTrussMat, {
      segments: 6,
      parent: jointAzimuth,
    });

    // Top bearing block
    createPart(`BearingBlock_${side}`, boxGeo(0.8, 0.65, 0.45), steelMountMat, {
      position: [0, towerHeight, tz],
      parent: jointAzimuth,
    });
    createPart(`BearingCap_${side}`, cylinderZGeo(0.32, 0.32, 0.5, 16), machineryDarkMat, {
      position: [0, towerHeight, tz],
      parent: jointAzimuth,
    });
  });

  // Cross tie beams connecting Left and Right towers across back (-X)
  beamBetween('TowerTieLow', [-0.75, 1.6, -towerZ], [-0.75, 1.6, towerZ], 0.11, steelMountMat, {
    segments: 8,
    parent: jointAzimuth,
  });
  beamBetween('TowerTieHigh', [-0.4, 3.3, -towerZ], [-0.4, 3.3, towerZ], 0.11, steelMountMat, {
    segments: 8,
    parent: jointAzimuth,
  });
  beamBetween('TowerTieDiagA', [-0.75, 1.6, -towerZ], [-0.4, 3.3, towerZ], 0.06, steelTrussMat, {
    segments: 6,
    parent: jointAzimuth,
  });
  beamBetween('TowerTieDiagB', [-0.75, 1.6, towerZ], [-0.4, 3.3, -towerZ], 0.06, steelTrussMat, {
    segments: 6,
    parent: jointAzimuth,
  });

  // Tower ladder on Left tower up to elevation bearing platform
  createLadder('TowerLadderL', {
    bottom: [-0.95, 0.2, -towerZ - 0.22],
    top: [0, towerHeight - 0.4, -towerZ - 0.22],
    width: 0.4,
    rungCount: 14,
    material: machineryDarkMat,
    parent: jointAzimuth,
  });
  // Bearing maintenance platform on Left tower
  createPart('TowerPlatformL', boxGeo(0.8, 0.06, 0.8), machineryDarkMat, {
    position: [0, towerHeight - 0.35, -towerZ - 0.4],
    parent: jointAzimuth,
  });

  // Elevation drive motor and gearbox mounted on Right tower
  createPart('ElevDriveBox', boxGeo(0.55, 0.65, 0.45), machineryDarkMat, {
    position: [0.35, towerHeight - 0.55, towerZ - 0.3],
    parent: jointAzimuth,
  });
  createPart('ElevPinion', cylinderZGeo(0.18, 0.18, 0.3, 12), accentYellowMat, {
    position: [0.35, towerHeight - 0.55, towerZ - 0.62],
    parent: jointAzimuth,
  });

  // ---------------------------------------------------------------------------
  // 3. ELEVATION ASSEMBLY (Joint_Elevation, pivot at [0, towerHeight, 0])
  // ---------------------------------------------------------------------------
  const elPivotPos = [0, towerHeight, 0];
  const elAxleGeo = cylinderZGeo(0.24, 0.24, 4.3, 16);
  const jointElevation = createPart('Elevation', elAxleGeo, machineryDarkMat, {
    position: elPivotPos,
    pivot: elPivotPos,
    parent: jointAzimuth,
  });
  jointElevation.name = 'Joint_Elevation';

  // Semicircular Elevation Bull Gear Sector
  const gearZ = towerZ - 0.62;
  const gearR = 1.35;
  const gearSegments = 16;
  for (let g = 0; g < gearSegments; g++) {
    const a1 = -0.6 + (g / gearSegments) * 2.1;
    const a2 = -0.6 + ((g + 1) / gearSegments) * 2.1;
    const gx1 = Math.sin(a1) * gearR;
    const gy1 = -Math.cos(a1) * gearR;
    const gx2 = Math.sin(a2) * gearR;
    const gy2 = -Math.cos(a2) * gearR;

    beamBetween(`GearRim_${g}`, [gx1, gy1, gearZ], [gx2, gy2, gearZ], 0.08, machineryDarkMat, {
      segments: 6,
      parent: jointElevation,
    });
    if (g % 3 === 0) {
      beamBetween(`GearSpoke_${g}`, [0, 0, gearZ], [gx1, gy1, gearZ], 0.05, steelMountMat, {
        segments: 6,
        parent: jointElevation,
      });
    }
    createPart(`GearTooth_${g}`, boxGeo(0.08, 0.05, 0.12), accentYellowMat, {
      position: [gx1, gy1, gearZ],
      rotation: [0, 0, (a1 * 180) / Math.PI],
      parent: jointElevation,
    });
  }

  // Heavy Boxed Counterweight System
  const cwZ = 1.55;
  [-cwZ, cwZ].forEach((cz, idx) => {
    const side = idx === 0 ? 'L' : 'R';
    beamBetween(`CwArm_${side}`, [0, 0, cz], [-1.8, -0.5, cz], 0.22, steelMountMat, {
      segments: 6,
      parent: jointElevation,
    });
    beamBetween(`CwBrace_${side}`, [0.5, 0, cz * 0.7], [-1.8, -0.5, cz], 0.09, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
  });

  // Main transverse counterweight ballast block
  createPart('CwBallastMain', boxGeo(0.9, 0.9, 3.4), machineryDarkMat, {
    position: [-1.8, -0.5, 0],
    parent: jointElevation,
  });
  createPart('CwBallastEndL', boxGeo(0.92, 0.92, 0.35), accentYellowMat, {
    position: [-1.8, -0.5, -1.6],
    parent: jointElevation,
  });
  createPart('CwBallastEndR', boxGeo(0.92, 0.92, 0.35), accentYellowMat, {
    position: [-1.8, -0.5, 1.6],
    parent: jointElevation,
  });

  // Central Torque Box / Dish Hub Cradle
  createPart('DishHubDrum', cylinderXGeo(1.25, 1.35, 0.85, 16), steelMountMat, {
    position: [0.5, 0, 0],
    parent: jointElevation,
  });
  createPart('DishHubFrontPlate', cylinderXGeo(1.4, 1.4, 0.12, 16), machineryDarkMat, {
    position: [0.92, 0, 0],
    parent: jointElevation,
  });

  // Structural cradle gussets between torque axle and hub
  [-1.2, 1.2].forEach((gz, gIdx) => {
    createPart(`HubGusset_${gIdx}`, boxGeo(0.6, 0.3, 0.08), steelMountMat, {
      position: [0.35, 0.2, gz],
      rotation: [0, 0, -25],
      parent: jointElevation,
    });
  });

  // ---------------------------------------------------------------------------
  // 4. PARABOLIC DISH REFLECTOR (Facing +X forward)
  // ---------------------------------------------------------------------------
  const dishVertexX = 0.92;
  const f4 = 11.2;
  const dishRadius = 3.8;
  const numRadSteps = 16;
  const dishProfile = [];

  for (let i = 0; i <= numRadSteps; i++) {
    const r = 0.25 + (dishRadius - 0.25) * (i / numRadSteps);
    const x = dishVertexX + (r * r) / f4;
    dishProfile.push([r, x]);
  }
  const rimX = dishVertexX + (dishRadius * dishRadius) / f4;
  dishProfile.push([dishRadius + 0.06, rimX]);
  dishProfile.push([dishRadius + 0.06, rimX - 0.08]);

  for (let i = numRadSteps; i >= 0; i--) {
    const r = 0.45 + (dishRadius - 0.45) * (i / numRadSteps);
    const x = dishVertexX + (r * r) / f4 - 0.08;
    dishProfile.push([r, x]);
  }
  dishProfile.push([0.45, dishVertexX - 0.06]);

  const dishGeo = revolveGeo(dishProfile, { axis: [1, 0, 0], segments: 48 });
  createPart('ParabolicDish', dishGeo, dishWhiteMat, {
    parent: jointElevation,
  });

  createPart('VertexCone', coneXGeo(0.28, 0.28, 16), machineryDarkMat, {
    position: [dishVertexX + 0.14, 0, 0],
    parent: jointElevation,
  });

  // 16 radial panel seams on front face
  const numSeams = 16;
  for (let i = 0; i < numSeams; i++) {
    const ang = (i / numSeams) * Math.PI * 2;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const p1 = [dishVertexX + 0.02, cosA * 0.32, sinA * 0.32];
    const p2 = [rimX + 0.01, cosA * (dishRadius - 0.02), sinA * (dishRadius - 0.02)];
    beamBetween(`DishSeam_${i}`, p1, p2, 0.012, machineryDarkMat, {
      segments: 5,
      parent: jointElevation,
    });
  }

  // ---------------------------------------------------------------------------
  // 5. BACK-UP STRUCTURE (BUS) SPACE FRAME TRUSS
  // ---------------------------------------------------------------------------
  const busHubR = 1.2;
  const busHubX = 0.45;
  const busMidR = 2.45;
  const busMidX = dishVertexX + (busMidR * busMidR) / f4 - 0.45;
  const busRimR = 3.65;
  const busRimX = dishVertexX + (busRimR * busRimR) / f4 - 0.25;

  for (let i = 0; i < numSeams; i++) {
    const ang = (i / numSeams) * Math.PI * 2;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);

    const nHub = [busHubX, cosA * busHubR, sinA * busHubR];
    const nMidFront = [dishVertexX + (busMidR * busMidR) / f4 - 0.08, cosA * busMidR, sinA * busMidR];
    const nRimFront = [dishVertexX + (busRimR * busRimR) / f4 - 0.08, cosA * busRimR, sinA * busRimR];
    const nMidRear = [busMidX, cosA * busMidR, sinA * busMidR];
    const nRimRear = [busRimX, cosA * busRimR, sinA * busRimR];

    beamBetween(`BusRearChordInner_${i}`, nHub, nMidRear, 0.055, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
    beamBetween(`BusRearChordOuter_${i}`, nMidRear, nRimRear, 0.045, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });

    beamBetween(`BusFrontChordInner_${i}`, [dishVertexX + 0.05, cosA * busHubR, sinA * busHubR], nMidFront, 0.045, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
    beamBetween(`BusFrontChordOuter_${i}`, nMidFront, nRimFront, 0.04, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });

    beamBetween(`BusWebMid_${i}`, nMidFront, nMidRear, 0.04, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
    beamBetween(`BusWebRim_${i}`, nRimFront, nRimRear, 0.035, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
    beamBetween(`BusWebDiagInner_${i}`, [dishVertexX + 0.05, cosA * busHubR, sinA * busHubR], nMidRear, 0.035, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
    beamBetween(`BusWebDiagOuter_${i}`, nMidFront, nRimRear, 0.035, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });

    const nextAng = ((i + 1) / numSeams) * Math.PI * 2;
    const nextCos = Math.cos(nextAng);
    const nextSin = Math.sin(nextAng);
    const nextMidRear = [busMidX, nextCos * busMidR, nextSin * busMidR];
    const nextRimRear = [busRimX, nextCos * busRimR, nextSin * busRimR];

    beamBetween(`BusRingMid_${i}`, nMidRear, nextMidRear, 0.045, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
    beamBetween(`BusRingRim_${i}`, nRimRear, nextRimRear, 0.04, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
  }

  // ---------------------------------------------------------------------------
  // 6. SYMMETRICAL LATTICE FEED TRIPOD & APEX RECEIVER
  // ---------------------------------------------------------------------------
  const focalX = dishVertexX + 2.80;
  const feedApexX = focalX + 0.28;

  // 3 tripod legs: Top (0°), Bottom-Right (120°), Bottom-Left (240°)
  const tripodPhis = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  const legRimR = 3.65;
  const legRimX = dishVertexX + (legRimR * legRimR) / f4;
  const apexR = 0.32;
  const numLacingBays = 6;

  tripodPhis.forEach((phi, legIdx) => {
    const tag = ['Top', 'BotR', 'BotL'][legIdx];
    const ry = Math.cos(phi);
    const rz = Math.sin(phi);
    const ty = -Math.sin(phi);
    const tz = Math.cos(phi);

    const chordSpreadBase = 0.28;
    const chordSpreadApex = 0.10;

    const pOuterBase = [
      legRimX,
      ry * legRimR + ty * chordSpreadBase,
      rz * legRimR + tz * chordSpreadBase,
    ];
    const pInnerBase = [
      legRimX,
      ry * legRimR - ty * chordSpreadBase,
      rz * legRimR - tz * chordSpreadBase,
    ];
    const pOuterApex = [
      feedApexX - 0.12,
      ry * apexR + ty * chordSpreadApex,
      rz * apexR + tz * chordSpreadApex,
    ];
    const pInnerApex = [
      feedApexX - 0.12,
      ry * apexR - ty * chordSpreadApex,
      rz * apexR - tz * chordSpreadApex,
    ];

    beamBetween(`LegChordOuter_${tag}`, pOuterBase, pOuterApex, 0.045, steelTrussMat, {
      segments: 8,
      parent: jointElevation,
    });
    beamBetween(`LegChordInner_${tag}`, pInnerBase, pInnerApex, 0.045, steelTrussMat, {
      segments: 8,
      parent: jointElevation,
    });

    createPart(`LegFoot_${tag}`, boxGeo(0.2, 0.2, 0.38), machineryDarkMat, {
      position: [legRimX - 0.04, ry * legRimR, rz * legRimR],
      rotation: [0, 0, (phi * 180) / Math.PI],
      parent: jointElevation,
    });

    for (let b = 0; b < numLacingBays; b++) {
      const t0 = b / numLacingBays;
      const t1 = (b + 1) / numLacingBays;

      const o0 = [
        pOuterBase[0] + (pOuterApex[0] - pOuterBase[0]) * t0,
        pOuterBase[1] + (pOuterApex[1] - pOuterBase[1]) * t0,
        pOuterBase[2] + (pOuterApex[2] - pOuterBase[2]) * t0,
      ];
      const i0 = [
        pInnerBase[0] + (pInnerApex[0] - pInnerBase[0]) * t0,
        pInnerBase[1] + (pInnerApex[1] - pInnerBase[1]) * t0,
        pInnerBase[2] + (pInnerApex[2] - pInnerBase[2]) * t0,
      ];
      const o1 = [
        pOuterBase[0] + (pOuterApex[0] - pOuterBase[0]) * t1,
        pOuterBase[1] + (pOuterApex[1] - pOuterBase[1]) * t1,
        pOuterBase[2] + (pOuterApex[2] - pOuterBase[2]) * t1,
      ];
      const i1 = [
        pInnerBase[0] + (pInnerApex[0] - pInnerBase[0]) * t1,
        pInnerBase[1] + (pInnerApex[1] - pInnerBase[1]) * t1,
        pInnerBase[2] + (pInnerApex[2] - pInnerBase[2]) * t1,
      ];

      beamBetween(`LegSpacer_${tag}_${b}`, o0, i0, 0.022, steelTrussMat, {
        segments: 6,
        parent: jointElevation,
      });
      if (b % 2 === 0) {
        beamBetween(`LegDiag_${tag}_${b}`, o0, i1, 0.022, steelTrussMat, {
          segments: 6,
          parent: jointElevation,
        });
      } else {
        beamBetween(`LegDiag_${tag}_${b}`, i0, o1, 0.022, steelTrussMat, {
          segments: 6,
          parent: jointElevation,
        });
      }
    }

    // Subreflector apex mounting struts connecting hub to subreflector rim
    beamBetween(`SubrefStrut_${tag}`, [feedApexX - 0.1, ry * apexR, rz * apexR], [focalX + 0.05, ry * 0.45, rz * 0.45], 0.025, steelTrussMat, {
      segments: 6,
      parent: jointElevation,
    });
  });

  // Apex feed support collar
  createPart('ApexHubCollar', cylinderXGeo(0.48, 0.45, 0.25, 12), machineryDarkMat, {
    position: [feedApexX - 0.1, 0, 0],
    parent: jointElevation,
  });

  // Cassegrain Subreflector (hyperbolic dish facing backward -X)
  const subrefProfile = [
    [0.02, focalX - 0.04],
    [0.2, focalX - 0.03],
    [0.4, focalX],
    [0.48, focalX + 0.06],
    [0.5, focalX + 0.08],
    [0.48, focalX + 0.10],
    [0.2, focalX + 0.11],
    [0.02, focalX + 0.12],
  ];
  const subrefGeo = revolveGeo(subrefProfile, { axis: [1, 0, 0], segments: 32 });
  createPart('Subreflector', subrefGeo, dishWhiteMat, {
    parent: jointElevation,
  });

  // Cryogenic receiver dewar / electronics package behind subreflector
  createPart('ReceiverCanister', cylinderXGeo(0.28, 0.28, 0.45, 16), machineryDarkMat, {
    position: [focalX + 0.35, 0, 0],
    parent: jointElevation,
  });
  createPart('ReceiverEndCap', cylinderXGeo(0.3, 0.28, 0.08, 16), accentYellowMat, {
    position: [focalX + 0.60, 0, 0],
    parent: jointElevation,
  });

  // Gold primary feed horn at center of main dish
  createPart('FeedHornBase', cylinderXGeo(0.14, 0.14, 0.25, 16), machineryDarkMat, {
    position: [dishVertexX + 0.24, 0, 0],
    parent: jointElevation,
  });
  createPart('FeedHornCone', coneXGeo(0.24, 0.4, 16), goldMat, {
    position: [dishVertexX + 0.56, 0, 0],
    parent: jointElevation,
  });
  createPart('FeedHornFlare', torusGeo(0.24, 0.03, 8, 24), goldMat, {
    position: [dishVertexX + 0.76, 0, 0],
    rotation: [0, 90, 0],
    parent: jointElevation,
  });

  // 3 tension guy wires anchoring apex to dish rim
  tripodPhis.forEach((phi, idx) => {
    const ry = Math.cos(phi) * (dishRadius - 0.3);
    const rz = Math.sin(phi) * (dishRadius - 0.3);
    beamBetween(`GuyWire_${idx}`, [focalX, 0, 0], [legRimX - 0.1, ry, rz], 0.008, machineryDarkMat, {
      segments: 4,
      parent: jointElevation,
    });
  });

  return root;
}

function animate() {
  return [
    createClip('Scan', 8, [
      rotationTrack('Joint_Azimuth', [
        { time: 0, rotation: [0, 0, 0] },
        { time: 2, rotation: [0, 30, 0] },
        { time: 4, rotation: [0, 0, 0] },
        { time: 6, rotation: [0, -30, 0] },
        { time: 8, rotation: [0, 0, 0] },
      ]),
      rotationTrack('Joint_Elevation', [
        { time: 0, rotation: [0, 0, 10] },
        { time: 2, rotation: [0, 0, 35] },
        { time: 4, rotation: [0, 0, 60] },
        { time: 6, rotation: [0, 0, 35] },
        { time: 8, rotation: [0, 0, 10] },
      ]),
    ]),
  ];
}
