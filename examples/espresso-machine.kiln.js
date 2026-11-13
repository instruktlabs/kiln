// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opencode-go/glm-5.3-flash, via opencode.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

// Commercial Three-Group Lever Espresso Machine
// A classic Italian commercial spring-lever espresso machine with 3 massive lever groups,
// twin steam wands, hot water dispenser, dual manometers, boiler level sight glass,
// perforated drip tray with staging stands, and heated cup storage on top.

const meta = {
  name: 'CommercialLeverEspressoMachine',
  category: 'prop',
  role: 'prop',
};

async function build() {
  const root = createRoot('CommercialLeverEspressoMachine');

  // ---------- Materials ----------
  // Polished mirror chrome / stainless steel (bodywork, group bodies, levers, wands, rails)
  const chromeMat = gameMaterial(0xf2f5f8, { metalness: 0.96, roughness: 0.14 });
  // Heavy cast chassis / dark trim / rubber feet & grip sleeves
  const darkChassisMat = gameMaterial(0x181a1d, { metalness: 0.35, roughness: 0.55 });
  // Rich turned walnut / rosewood (lever handles, portafilter handles, steam knobs)
  const richWoodMat = gameMaterial(0x3e1f10, { metalness: 0.05, roughness: 0.30 });
  // Polished golden brass (accents, sight glass cage, manometer bezels, ferrules, badges)
  const brassMat = gameMaterial(0xd8b046, { metalness: 0.92, roughness: 0.22 });
  // Gloss ceramic white (cups, saucers, manometer dials)
  const ceramicMat = gameMaterial(0xfbfbfa, { metalness: 0.05, roughness: 0.10 });
  // Ruby indicator lamp / power jewel
  const jewelRedMat = gameMaterial(0xff2211, {
    emissive: 0xee1100,
    emissiveIntensity: 2.5,
    roughness: 0.25,
  });

  // ---------- Reusable Geometries ----------
  // Feet
  const footRubberGeo = cylinderGeo(0.034, 0.038, 0.016, 14);
  const footChromeGeo = cylinderGeo(0.026, 0.034, 0.034, 14);

  // Group Head Geometries
  const groupNeckGeo = cylinderXGeo(0.032, 0.032, 0.065, 14);
  const groupCylinderGeo = cylinderGeo(0.043, 0.043, 0.130, 18);
  const groupRingGeo = torusGeo(0.044, 0.0035, 8, 18);
  const groupTopCapGeo = cylinderGeo(0.047, 0.047, 0.016, 18);
  const groupBellGeo = cylinderGeo(0.043, 0.050, 0.036, 18);
  const bayonetRingGeo = cylinderGeo(0.052, 0.052, 0.012, 18);
  const bayonetBrassGeo = torusGeo(0.053, 0.0035, 8, 18);
  const showerScreenGeo = cylinderGeo(0.036, 0.036, 0.004, 14);

  // Portafilter Geometries
  const filterBowlGeo = cylinderGeo(0.042, 0.038, 0.028, 18);
  const spoutManifoldGeo = cylinderXGeo(0.012, 0.012, 0.024, 12);
  const spoutTipGeo = cylinderGeo(0.0045, 0.0035, 0.032, 8);
  const portafilterFerruleGeo = cylinderXGeo(0.013, 0.010, 0.018, 12);
  const portafilterWoodGeo = lathe([
    [0.010, 0.000],
    [0.011, 0.015],
    [0.015, 0.045],
    [0.017, 0.075],
    [0.016, 0.095],
    [0.013, 0.115],
    [0.008, 0.125],
    [0.000, 0.125],
  ], 14);
  const portafilterCapGeo = cylinderXGeo(0.009, 0.009, 0.008, 12);

  // Lever Mechanism Geometries
  const pistonShaftGeo = cylinderGeo(0.012, 0.012, 0.038, 12);
  const forkArmGeo = boxGeo(0.038, 0.052, 0.008);
  const pivotPinGeo = cylinderZGeo(0.007, 0.007, 0.050, 10);
  const pinNutGeo = cylinderZGeo(0.010, 0.010, 0.005, 10);
  const leverRodGeo = cylinderGeo(0.0075, 0.0085, 0.360, 12);
  const leverGripGeo = lathe([
    [0.008, -0.055],
    [0.011, -0.042],
    [0.016, -0.015],
    [0.022, 0.010],
    [0.024, 0.030],
    [0.018, 0.048],
    [0.011, 0.055],
    [0.000, 0.055],
  ], 16);
  const leverFerruleGeo = cylinderGeo(0.012, 0.010, 0.016, 12);
  const leverCrownNutGeo = cylinderGeo(0.010, 0.012, 0.012, 12);
  const leverFinialGeo = sphereGeo(0.010, 10, 8);

  // Cups & Saucers Geometries
  const saucerGeo = lathe([
    [0.000, 0.000],
    [0.032, 0.001],
    [0.050, 0.005],
    [0.054, 0.009],
    [0.048, 0.008],
    [0.030, 0.003],
    [0.000, 0.002],
  ], 14);
  const cupGeo = lathe([
    [0.000, 0.000],
    [0.022, 0.000],
    [0.024, 0.008],
    [0.030, 0.025],
    [0.035, 0.042],
    [0.033, 0.042],
    [0.028, 0.025],
    [0.020, 0.006],
    [0.000, 0.006],
  ], 14);
  const cupHandleGeo = torusGeo(0.011, 0.0032, 8, 10);
  const coffeeFillGeo = cylinderGeo(0.028, 0.028, 0.003, 12);

  // ==========================================
  // 1. FEET & LOWER PLINTH (Grounding at Y=0)
  // ==========================================
  const footPositions = [
    [0.17, -0.40],
    [0.17, 0.40],
    [-0.17, -0.40],
    [-0.17, 0.40],
  ];
  for (let i = 0; i < footPositions.length; i++) {
    const [fx, fz] = footPositions[i];
    // Rubber foot touching Y = 0.000
    createPart(`FootRubber_${i}`, footRubberGeo, darkChassisMat, {
      position: [fx, 0.008, fz],
      parent: root,
    });
    // Polished chrome upper foot cone
    createPart(`FootChrome_${i}`, footChromeGeo, chromeMat, {
      position: [fx, 0.033, fz],
      parent: root,
    });
  }

  // Dark structural chassis plinth
  createPart('ChassisPlinth', boxGeo(0.38, 0.06, 0.88), darkChassisMat, {
    position: [-0.02, 0.08, 0],
    parent: root,
  });

  // ==========================================
  // 2. DRIP TRAY & GRATE
  // ==========================================
  createPart('DripTrayBasin', boxGeo(0.18, 0.08, 0.86), darkChassisMat, {
    position: [0.26, 0.09, 0],
    parent: root,
  });
  createPart('DripTrayRimFront', boxGeo(0.015, 0.080, 0.88), chromeMat, {
    position: [0.352, 0.093, 0],
    parent: root,
  });
  createPart('DripTrayRimLeft', boxGeo(0.185, 0.080, 0.015), chromeMat, {
    position: [0.262, 0.093, -0.435],
    parent: root,
  });
  createPart('DripTrayRimRight', boxGeo(0.185, 0.080, 0.015), chromeMat, {
    position: [0.262, 0.093, 0.435],
    parent: root,
  });

  // Stainless steel drip grate main plate
  createPart('DripGratePlate', boxGeo(0.165, 0.006, 0.84), chromeMat, {
    position: [0.26, 0.134, 0],
    parent: root,
  });

  // Laser-cut slotted drain bars
  const slotCount = 19;
  for (let s = 0; s < slotCount; s++) {
    const sz = -0.38 + s * (0.76 / (slotCount - 1));
    createPart(`DripSlot_${s}`, boxGeo(0.125, 0.008, 0.012), darkChassisMat, {
      position: [0.26, 0.136, sz],
      parent: root,
    });
  }

  // 3 Staging discs / cup support stands directly below each group head
  const groupZ = [-0.28, 0.0, 0.28];
  for (let g = 0; g < 3; g++) {
    const gz = groupZ[g];
    createPart(`CupStandRim_${g}`, torusGeo(0.062, 0.004, 8, 20), brassMat, {
      position: [0.245, 0.141, gz],
      rotation: [90, 0, 0],
      parent: root,
    });
    createPart(`CupStandMesh_${g}`, cylinderGeo(0.060, 0.060, 0.005, 16), chromeMat, {
      position: [0.245, 0.140, gz],
      parent: root,
    });
  }

  // ==========================================
  // 3. MAIN BODY & ENCLOSURE
  // ==========================================
  createPart('FrontSplashback', boxGeo(0.015, 0.21, 0.86), chromeMat, {
    position: [0.170, 0.245, 0],
    parent: root,
  });

  createPart('GroupMountDeck', boxGeo(0.16, 0.12, 0.88), chromeMat, {
    position: [0.10, 0.41, 0],
    parent: root,
  });
  createPart('GroupDeckBrassTrim', boxGeo(0.02, 0.010, 0.885), brassMat, {
    position: [0.181, 0.350, 0],
    parent: root,
  });

  createPart('MainCarcass', boxGeo(0.24, 0.36, 0.86), darkChassisMat, {
    position: [-0.09, 0.29, 0],
    parent: root,
  });

  for (const side of [-1, 1]) {
    const sz = side * 0.445;
    const sName = side < 0 ? 'L' : 'R';
    createPart(`SidePanelMain_${sName}`, boxGeo(0.42, 0.38, 0.016), chromeMat, {
      position: [0.00, 0.30, sz],
      parent: root,
    });
    for (let r = 0; r < 4; r++) {
      createPart(`SideStreak_${sName}_${r}`, boxGeo(0.28, 0.008, 0.022), brassMat, {
        position: [-0.02, 0.22 + r * 0.035, sz],
        parent: root,
      });
    }
  }

  createPart('BackMirrorPanel', boxGeo(0.015, 0.356, 0.88), chromeMat, {
    position: [-0.215, 0.288, 0],
    parent: root,
  });
  for (let v = 0; v < 8; v++) {
    createPart(`BackVent_${v}`, boxGeo(0.022, 0.010, 0.64), darkChassisMat, {
      position: [-0.218, 0.18 + v * 0.028, 0],
      parent: root,
    });
  }
  createPart('BackBrandPlate', boxGeo(0.012, 0.065, 0.28), brassMat, {
    position: [-0.224, 0.41, 0],
    parent: root,
  });
  createPart('BackBrandCrest', cylinderXGeo(0.022, 0.022, 0.018, 16), chromeMat, {
    position: [-0.225, 0.41, 0],
    parent: root,
  });

  createPart('FrontBrandBadge', boxGeo(0.010, 0.036, 0.20), brassMat, {
    position: [0.186, 0.445, 0],
    parent: root,
  });
  createPart('FrontBrandWings', boxGeo(0.014, 0.010, 0.26), chromeMat, {
    position: [0.187, 0.445, 0],
    parent: root,
  });

  // ==========================================
  // 4. TOP CUP WARMER TRAY & RAILING
  // ==========================================
  createPart('CupWarmerTray', boxGeo(0.32, 0.012, 0.86), chromeMat, {
    position: [-0.04, 0.476, 0],
    parent: root,
  });
  for (let k = 0; k < 12; k++) {
    createPart(`WarmerSlot_${k}`, boxGeo(0.24, 0.015, 0.012), darkChassisMat, {
      position: [-0.04, 0.480, -0.36 + k * 0.065],
      parent: root,
    });
  }

  createPart('GuardRailRear', cylinderZGeo(0.005, 0.005, 0.84, 10), chromeMat, {
    position: [-0.19, 0.525, 0],
    parent: root,
  });
  createPart('GuardRailLeft', cylinderXGeo(0.005, 0.005, 0.30, 10), chromeMat, {
    position: [-0.04, 0.525, -0.42],
    parent: root,
  });
  createPart('GuardRailRight', cylinderXGeo(0.005, 0.005, 0.30, 10), chromeMat, {
    position: [-0.04, 0.525, 0.42],
    parent: root,
  });

  const stanchionCoords = [
    [-0.19, -0.42],
    [-0.19, -0.14],
    [-0.19, 0.14],
    [-0.19, 0.42],
    [0.10, -0.42],
    [0.10, 0.42],
  ];
  for (let p = 0; p < stanchionCoords.length; p++) {
    const [sx, sz] = stanchionCoords[p];
    createPart(`RailPost_${p}`, cylinderGeo(0.0055, 0.0055, 0.048, 10), chromeMat, {
      position: [sx, 0.501, sz],
      parent: root,
    });
    createPart(`RailFinial_${p}`, sphereGeo(0.007, 8, 6), brassMat, {
      position: [sx, 0.528, sz],
      parent: root,
    });
  }

  const cupGrid = [
    [-0.12, -0.28],
    [-0.12, -0.10],
    [-0.12, 0.10],
    [-0.12, 0.28],
    [0.02, -0.28],
    [0.02, -0.10],
    [0.02, 0.10],
    [0.02, 0.28],
  ];
  for (let c = 0; c < cupGrid.length; c++) {
    const [cx, cz] = cupGrid[c];
    createPart(`Saucer_${c}`, saucerGeo, ceramicMat, {
      position: [cx, 0.482, cz],
      parent: root,
    });
    createPart(`Cup_${c}`, cupGeo, ceramicMat, {
      position: [cx, 0.485, cz],
      parent: root,
    });
    createPart(`CupHandle_${c}`, cupHandleGeo, ceramicMat, {
      position: [cx + 0.032, 0.505, cz],
      rotation: [0, 90, 0],
      parent: root,
    });
    if (c % 2 === 0) {
      createPart(`Coffee_${c}`, coffeeFillGeo, richWoodMat, {
        position: [cx, 0.510, cz],
        parent: root,
      });
    }
  }

  // ==========================================
  // 5. THE THREE SPRING-LEVER GROUPS
  // ==========================================
  for (let g = 0; g < 3; g++) {
    const gz = groupZ[g];
    const prefix = `Group_${g}`;

    createPart(`${prefix}_Neck`, groupNeckGeo, chromeMat, {
      position: [0.20, 0.42, gz],
      parent: root,
    });
    createPart(`${prefix}_NeckFlange`, boxGeo(0.045, 0.075, 0.075), brassMat, {
      position: [0.183, 0.42, gz],
      parent: root,
    });

    createPart(`${prefix}_Cylinder`, groupCylinderGeo, chromeMat, {
      position: [0.235, 0.435, gz],
      parent: root,
    });
    createPart(`${prefix}_RingLower`, groupRingGeo, brassMat, {
      position: [0.235, 0.395, gz],
      rotation: [90, 0, 0],
      parent: root,
    });
    createPart(`${prefix}_RingUpper`, groupRingGeo, brassMat, {
      position: [0.235, 0.470, gz],
      rotation: [90, 0, 0],
      parent: root,
    });
    createPart(`${prefix}_TopCap`, groupTopCapGeo, chromeMat, {
      position: [0.235, 0.508, gz],
      parent: root,
    });

    createPart(`${prefix}_Bell`, groupBellGeo, chromeMat, {
      position: [0.235, 0.355, gz],
      parent: root,
    });
    createPart(`${prefix}_Bayonet`, bayonetRingGeo, chromeMat, {
      position: [0.235, 0.332, gz],
      parent: root,
    });
    createPart(`${prefix}_BayonetBrass`, bayonetBrassGeo, brassMat, {
      position: [0.235, 0.332, gz],
      rotation: [90, 0, 0],
      parent: root,
    });
    createPart(`${prefix}_ShowerScreen`, showerScreenGeo, darkChassisMat, {
      position: [0.235, 0.324, gz],
      parent: root,
    });

    createPart(`${prefix}_PortaBowl`, filterBowlGeo, chromeMat, {
      position: [0.235, 0.312, gz],
      parent: root,
    });
    createPart(`${prefix}_SpoutManifold`, spoutManifoldGeo, chromeMat, {
      position: [0.235, 0.294, gz],
      parent: root,
    });
    createPart(`${prefix}_SpoutLeft`, spoutTipGeo, chromeMat, {
      position: [0.235, 0.272, gz - 0.013],
      rotation: [0, 0, 14],
      parent: root,
    });
    createPart(`${prefix}_SpoutRight`, spoutTipGeo, chromeMat, {
      position: [0.235, 0.272, gz + 0.013],
      rotation: [0, 0, -14],
      parent: root,
    });
    createPart(`${prefix}_PortaFerrule`, portafilterFerruleGeo, brassMat, {
      position: [0.282, 0.312, gz],
      parent: root,
    });
    createPart(`${prefix}_PortaWood`, portafilterWoodGeo, richWoodMat, {
      position: [0.292, 0.312, gz],
      rotation: [0, 0, -90],
      parent: root,
    });
    createPart(`${prefix}_PortaCap`, portafilterCapGeo, brassMat, {
      position: [0.420, 0.312, gz],
      parent: root,
    });

    createPart(`${prefix}_Shaft`, pistonShaftGeo, chromeMat, {
      position: [0.235, 0.530, gz],
      parent: root,
    });
    createPart(`${prefix}_ForkL`, forkArmGeo, chromeMat, {
      position: [0.235, 0.540, gz - 0.018],
      parent: root,
    });
    createPart(`${prefix}_ForkR`, forkArmGeo, chromeMat, {
      position: [0.235, 0.540, gz + 0.018],
      parent: root,
    });
    createPart(`${prefix}_PivotPin`, pivotPinGeo, chromeMat, {
      position: [0.235, 0.550, gz],
      parent: root,
    });
    createPart(`${prefix}_PinNutL`, pinNutGeo, brassMat, {
      position: [0.235, 0.550, gz - 0.026],
      parent: root,
    });
    createPart(`${prefix}_PinNutR`, pinNutGeo, brassMat, {
      position: [0.235, 0.550, gz + 0.026],
      parent: root,
    });

    const rad12 = (12 * Math.PI) / 180;
    const sin12 = Math.sin(rad12);
    const cos12 = Math.cos(rad12);

    const rodCenterX = 0.235 + 0.18 * sin12;
    const rodCenterY = 0.550 + 0.18 * cos12;
    createPart(`${prefix}_LeverRod`, leverRodGeo, chromeMat, {
      position: [rodCenterX, rodCenterY, gz],
      rotation: [0, 0, -12],
      parent: root,
    });

    const ferrX = 0.235 + 0.33 * sin12;
    const ferrY = 0.550 + 0.33 * cos12;
    createPart(`${prefix}_GripFerrule`, leverFerruleGeo, brassMat, {
      position: [ferrX, ferrY, gz],
      rotation: [0, 0, -12],
      parent: root,
    });

    const gripX = 0.235 + 0.39 * sin12;
    const gripY = 0.550 + 0.39 * cos12;
    createPart(`${prefix}_GripWood`, leverGripGeo, richWoodMat, {
      position: [gripX, gripY, gz],
      rotation: [0, 0, -12],
      parent: root,
    });

    const nutX = 0.235 + 0.45 * sin12;
    const nutY = 0.550 + 0.45 * cos12;
    createPart(`${prefix}_GripNut`, leverCrownNutGeo, chromeMat, {
      position: [nutX, nutY, gz],
      rotation: [0, 0, -12],
      parent: root,
    });
    const finX = 0.235 + 0.46 * sin12;
    const finY = 0.550 + 0.46 * cos12;
    createPart(`${prefix}_Finial`, leverFinialGeo, brassMat, {
      position: [finX, finY, gz],
      parent: root,
    });

    createPart(`${prefix}_FeedPipe`, pipeAlongPath([
      [0.180, 0.455, gz],
      [0.210, 0.455, gz + 0.024],
      [0.230, 0.420, gz + 0.038],
    ], 0.004, { bendRadius: 0.015, tubularSegments: 12, radialSegments: 8 }), brassMat, {
      parent: root,
    });
  }

  // ==========================================
  // 6. STEAM & HOT WATER DELIVERY SYSTEMS
  // ==========================================
  const wandLPath = [
    [0.175, 0.365, -0.380],
    [0.230, 0.340, -0.400],
    [0.285, 0.230, -0.410],
    [0.270, 0.165, -0.385],
  ];
  createPart('SteamWandBall_L', sphereGeo(0.014, 10, 8), brassMat, {
    position: [0.175, 0.365, -0.380],
    parent: root,
  });
  createPart('SteamWandPipe_L', pipeAlongPath(wandLPath, 0.0055, {
    bendRadius: 0.03,
    tubularSegments: 16,
    radialSegments: 8,
  }), chromeMat, {
    parent: root,
  });
  createPart('SteamGrip_L', cylinderGeo(0.008, 0.008, 0.045, 10), darkChassisMat, {
    position: [0.260, 0.280, -0.405],
    rotation: [20, 0, 15],
    parent: root,
  });
  createPart('SteamTip_L', cylinderGeo(0.006, 0.004, 0.018, 10), chromeMat, {
    position: [0.270, 0.165, -0.385],
    rotation: [15, 0, 0],
    parent: root,
  });

  const wandRPath = [
    [0.175, 0.365, 0.380],
    [0.230, 0.340, 0.400],
    [0.285, 0.230, 0.410],
    [0.270, 0.165, 0.385],
  ];
  createPart('SteamWandBall_R', sphereGeo(0.014, 10, 8), brassMat, {
    position: [0.175, 0.365, 0.380],
    parent: root,
  });
  createPart('SteamWandPipe_R', pipeAlongPath(wandRPath, 0.0055, {
    bendRadius: 0.03,
    tubularSegments: 16,
    radialSegments: 8,
  }), chromeMat, {
    parent: root,
  });
  createPart('SteamGrip_R', cylinderGeo(0.008, 0.008, 0.045, 10), darkChassisMat, {
    position: [0.260, 0.280, 0.405],
    rotation: [-20, 0, 15],
    parent: root,
  });
  createPart('SteamTip_R', cylinderGeo(0.006, 0.004, 0.018, 10), chromeMat, {
    position: [0.270, 0.165, 0.385],
    rotation: [-15, 0, 0],
    parent: root,
  });

  for (const side of [-1, 1]) {
    const vz = side * 0.380;
    const vName = side < 0 ? 'L' : 'R';
    createPart(`SteamValveEscutcheon_${vName}`, cylinderXGeo(0.024, 0.024, 0.010, 14), brassMat, {
      position: [0.185, 0.420, vz],
      parent: root,
    });
    createPart(`SteamValveKnob_${vName}`, cylinderXGeo(0.022, 0.026, 0.035, 14), richWoodMat, {
      position: [0.205, 0.420, vz],
      parent: root,
    });
    createPart(`SteamValveCap_${vName}`, cylinderXGeo(0.010, 0.010, 0.006, 12), brassMat, {
      position: [0.224, 0.420, vz],
      parent: root,
    });
  }

  const waterSpoutPath = [
    [0.175, 0.355, -0.140],
    [0.235, 0.330, -0.140],
    [0.265, 0.260, -0.140],
    [0.265, 0.200, -0.140],
  ];
  createPart('WaterSpoutPipe', pipeAlongPath(waterSpoutPath, 0.006, {
    bendRadius: 0.03,
    tubularSegments: 14,
    radialSegments: 8,
  }), chromeMat, {
    parent: root,
  });
  createPart('WaterDiffuserTip', cylinderGeo(0.009, 0.006, 0.018, 12), chromeMat, {
    position: [0.265, 0.192, -0.140],
    parent: root,
  });
  createPart('WaterValveEscutcheon', cylinderXGeo(0.020, 0.020, 0.010, 14), brassMat, {
    position: [0.185, 0.420, -0.140],
    parent: root,
  });
  createPart('WaterValveKnob', cylinderXGeo(0.018, 0.022, 0.032, 14), richWoodMat, {
    position: [0.203, 0.420, -0.140],
    parent: root,
  });

  // ==========================================
  // 7. GAUGES, SIGHT GLASS & INSTRUMENTATION
  // ==========================================
  const gaugeDefs = [
    { name: 'BoilerPressure', y: 0.280, label: '0-3 bar' },
    { name: 'PumpPressure', y: 0.205, label: '0-16 bar' },
  ];
  for (let i = 0; i < gaugeDefs.length; i++) {
    const g = gaugeDefs[i];
    createPart(`${g.name}_Bezel`, torusGeo(0.032, 0.004, 8, 20), brassMat, {
      position: [0.177, g.y, 0.380],
      rotation: [0, 90, 0],
      parent: root,
    });
    createPart(`${g.name}_Body`, cylinderXGeo(0.032, 0.032, 0.010, 18), chromeMat, {
      position: [0.1745, g.y, 0.380],
      parent: root,
    });
    createPart(`${g.name}_Dial`, cylinderXGeo(0.028, 0.028, 0.002, 16), ceramicMat, {
      position: [0.180, g.y, 0.380],
      parent: root,
    });
    createPart(`${g.name}_Needle`, boxGeo(0.002, 0.018, 0.002), jewelRedMat, {
      position: [0.182, g.y + 0.005, 0.380],
      rotation: [0, 0, 35],
      parent: root,
    });
    createPart(`${g.name}_Rivet`, cylinderXGeo(0.0035, 0.0035, 0.004, 8), brassMat, {
      position: [0.183, g.y, 0.380],
      parent: root,
    });
  }

  createPart('SightGlassTube', cylinderGeo(0.008, 0.008, 0.105, 12), ceramicMat, {
    position: [0.185, 0.245, -0.380],
    parent: root,
  });
  createPart('SightGlassMountTop', boxGeo(0.028, 0.022, 0.028), brassMat, {
    position: [0.182, 0.303, -0.380],
    parent: root,
  });
  createPart('SightGlassMountBot', boxGeo(0.028, 0.022, 0.028), brassMat, {
    position: [0.182, 0.187, -0.380],
    parent: root,
  });
  for (let r = 0; r < 3; r++) {
    const ang = (r * 120 * Math.PI) / 180;
    const rx = 0.185 + 0.014 * Math.cos(ang);
    const rz = -0.380 + 0.014 * Math.sin(ang);
    createPart(`SightRod_${r}`, cylinderGeo(0.002, 0.002, 0.110, 6), brassMat, {
      position: [rx, 0.245, rz],
      parent: root,
    });
  }
  createPart('SightDrainCock', cylinderZGeo(0.003, 0.003, 0.024, 8), brassMat, {
    position: [0.198, 0.178, -0.380],
    parent: root,
  });

  createPart('PowerSwitchBezel', cylinderXGeo(0.016, 0.016, 0.006, 12), darkChassisMat, {
    position: [0.177, 0.155, 0.380],
    parent: root,
  });
  createPart('PowerSwitchKnob', boxGeo(0.016, 0.024, 0.008), brassMat, {
    position: [0.183, 0.155, 0.380],
    rotation: [0, 0, 45],
    parent: root,
  });

  createPart('LampHeatingBezel', cylinderXGeo(0.009, 0.009, 0.005, 12), chromeMat, {
    position: [0.177, 0.335, 0.380],
    parent: root,
  });
  createPart('LampHeatingJewel', sphereGeo(0.006, 10, 8), jewelRedMat, {
    position: [0.180, 0.335, 0.380],
    parent: root,
  });

  createPart('LampPowerBezel', cylinderXGeo(0.009, 0.009, 0.005, 12), chromeMat, {
    position: [0.177, 0.335, 0.355],
    parent: root,
  });
  createPart('LampPowerJewel', sphereGeo(0.006, 10, 8), brassMat, {
    position: [0.180, 0.335, 0.355],
    parent: root,
  });

  return root;
}