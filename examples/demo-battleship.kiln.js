// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Kiln Battleship: Detailed battleship with triple gun turrets and a wooden deck
const meta = {
  name: 'Battleship',
  category: 'vehicle',
  role: 'vehicle'
};

/**
 * Procedural Battleship Model
 * Dimensions: ~160m LOA, 24m Beam, 40m Masthead Height
 * Orientation: +X Forward (Bow), +Y Up, +Z Right (Starboard)
 */
async function build() {
  const root = createRoot('Battleship');

  // --- Materials ---
  const mats = {
    steelHull: gameMaterial(0x6c7986, { roughness: 0.65, metalness: 0.3 }),
    steelSuper: gameMaterial(0x82919e, { roughness: 0.55, metalness: 0.25 }),
    steelArmor: gameMaterial(0x56626d, { roughness: 0.6, metalness: 0.35 }),
    darkSteel: gameMaterial(0x2a2e33, { roughness: 0.45, metalness: 0.65 }),
    blackMetal: gameMaterial(0x16181a, { roughness: 0.8, metalness: 0.3 }),
    redHull: gameMaterial(0x862c24, { roughness: 0.72, metalness: 0.15 }),
    waterlineBoot: gameMaterial(0x1a1c1e, { roughness: 0.85, metalness: 0.2 }),
    woodDeck: gameMaterial(0xc49c6d, { roughness: 0.88, metalness: 0.04 }),
    woodMargin: gameMaterial(0x9e7344, { roughness: 0.9, metalness: 0.04 }),
    turretRoofRed: gameMaterial(0x8a1c1c, { roughness: 0.65, metalness: 0.25 }),
    canvasBag: gameMaterial(0xded7c8, { roughness: 0.95, metalness: 0.02 }),
    glass: gameMaterial(0x2b4557, { roughness: 0.12, metalness: 0.85 }),
    brass: gameMaterial(0xd4af37, { roughness: 0.32, metalness: 0.85 }),
    bronzeProp: gameMaterial(0xb07d42, { roughness: 0.35, metalness: 0.8 }),
    white: gameMaterial(0xe8ebed, { roughness: 0.5, metalness: 0.1 }),
    navyBlue: gameMaterial(0x2a3e50, { roughness: 0.45, metalness: 0.25 }),
    ensignRed: gameMaterial(0xb82626, { roughness: 0.7, metalness: 0.1 }),
    ensignWhite: gameMaterial(0xf0f0f0, { roughness: 0.7, metalness: 0.1 }),
    ensignBlue: gameMaterial(0x1e305e, { roughness: 0.7, metalness: 0.1 }),
  };

  // --- Hull Stations Profile ---
  const xStations = [
    -72, -70, -67, -63, -58, -52, -45, -38, -30, -22, -14, -6,
    0, 6, 14, 22, 30, 38, 45, 52, 58, 64, 70, 75, 79, 83, 86, 88
  ];

  function getHullProfile(x) {
    let yd = 8.6;
    if (x < -38) {
      const t = (x - (-72)) / 34;
      yd = 8.0 + 0.6 * Math.sin(t * Math.PI / 2);
    } else if (x > 30) {
      const t = (x - 30) / 58;
      yd = 8.6 + 3.6 * Math.pow(t, 1.7);
    }

    let wd = 12.0;
    if (x < -30) {
      const t = (x - (-72)) / 42;
      wd = 0.6 + 11.4 * (3 * t * t - 2 * t * t * t);
    } else if (x > 30) {
      const t = (88 - x) / 58;
      wd = 0.25 + 11.75 * Math.pow(t, 1.35);
    }

    let wb = wd;
    if (x >= -35 && x <= 25) {
      wb = 12.4;
    } else if (x < -35) {
      const t = (x - (-72)) / 37;
      wb = Math.max(0.4, 0.5 + 11.9 * Math.pow(t, 1.2));
    } else if (x > 25) {
      const t = (88 - x) / 63;
      wb = Math.max(0.2, 0.2 + 12.2 * Math.pow(t, 1.5));
    }

    let yk = 0.5;
    if (x < -48) {
      const t = (x - (-48)) / (-24);
      yk = 0.5 + 4.2 * (t * t);
    } else if (x > 70) {
      const t = (x - 70) / 18;
      yk = 0.5 + 1.2 * (t * t);
    }

    return { yd, wd, wb, yk };
  }

  // --- 1. Lower Hull (Red Anti-Fouling Paint) ---
  {
    const positions = [];
    const indices = [];
    const numPts = 7;

    for (let i = 0; i < xStations.length; i++) {
      const x = xStations[i];
      const { yk, wb } = getHullProfile(x);
      positions.push(
        x, 4.0, -wb,
        x, yk + (4.0 - yk) * 0.7, -wb * 0.94,
        x, yk + (4.0 - yk) * 0.28, -wb * 0.65,
        x, yk, 0,
        x, yk + (4.0 - yk) * 0.28, wb * 0.65,
        x, yk + (4.0 - yk) * 0.7, wb * 0.94,
        x, 4.0, wb
      );
    }

    for (let i = 0; i < xStations.length - 1; i++) {
      const rowA = i * numPts;
      const rowB = (i + 1) * numPts;
      for (let p = 0; p < numPts - 1; p++) {
        const a0 = rowA + p;
        const a1 = rowA + p + 1;
        const b0 = rowB + p;
        const b1 = rowB + p + 1;
        indices.push(a0, b0, b1, a0, b1, a1);
      }
    }

    // Caps
    const s0 = 0;
    indices.push(s0, s0 + 1, s0 + 3, s0 + 1, s0 + 2, s0 + 3, s0 + 3, s0 + 4, s0 + 5, s0 + 3, s0 + 5, s0 + 6);
    const bEnd = (xStations.length - 1) * numPts;
    indices.push(bEnd + 3, bEnd + 1, bEnd, bEnd + 3, bEnd + 2, bEnd + 1, bEnd + 5, bEnd + 4, bEnd + 3, bEnd + 6, bEnd + 5, bEnd + 3);

    createPart('LowerHull', meshGeo({ positions, indices }), mats.redHull, { parent: root });
  }

  // --- 2. Waterline Boot-Topping Stripe (Dark Charcoal) ---
  {
    const positions = [];
    const indices = [];
    const numPts = 4;

    for (let i = 0; i < xStations.length; i++) {
      const x = xStations[i];
      const { wb } = getHullProfile(x);
      positions.push(
        x, 3.8, -wb * 0.99,
        x, 4.3, -wb,
        x, 3.8, wb * 0.99,
        x, 4.3, wb
      );
    }

    for (let i = 0; i < xStations.length - 1; i++) {
      const rowA = i * numPts;
      const rowB = (i + 1) * numPts;
      // Port:
      indices.push(rowA, rowA + 1, rowB + 1, rowA, rowB + 1, rowB);
      // Starboard:
      indices.push(rowA + 2, rowB + 2, rowB + 3, rowA + 2, rowB + 3, rowA + 3);
    }

    createPart('WaterlineStripe', meshGeo({ positions, indices }), mats.waterlineBoot, { parent: root });
  }

  // --- 3. Upper Hull (Naval Haze Gray) ---
  {
    const positions = [];
    const indices = [];
    const numPts = 8;

    for (let i = 0; i < xStations.length; i++) {
      const x = xStations[i];
      const { yd, wd, wb } = getHullProfile(x);
      const bulwarkH = x > 30 ? 1.1 : 0.8;
      positions.push(
        x, 4.3, -wb,
        x, 4.3 + (yd - 4.3) * 0.5, -(wb * 0.45 + wd * 0.55),
        x, yd, -wd,
        x, yd + bulwarkH, -wd,
        x, 4.3, wb,
        x, 4.3 + (yd - 4.3) * 0.5, (wb * 0.45 + wd * 0.55),
        x, yd, wd,
        x, yd + bulwarkH, wd
      );
    }

    for (let i = 0; i < xStations.length - 1; i++) {
      const rowA = i * numPts;
      const rowB = (i + 1) * numPts;
      for (let p = 0; p < 3; p++) {
        const a0 = rowA + p;
        const a1 = rowA + p + 1;
        const b0 = rowB + p;
        const b1 = rowB + p + 1;
        indices.push(a0, a1, b1, a0, b1, b0);
      }
      for (let p = 4; p < 7; p++) {
        const a0 = rowA + p;
        const a1 = rowA + p + 1;
        const b0 = rowB + p;
        const b1 = rowB + p + 1;
        indices.push(a0, b0, b1, a0, b1, a1);
      }
    }

    // Stern transom closure
    indices.push(
      0, 4, 5, 0, 5, 1,
      1, 5, 6, 1, 6, 2,
      2, 6, 7, 2, 7, 3
    );

    createPart('UpperHull', meshGeo({ positions, indices }), mats.steelHull, { parent: root });
  }

  // --- 4. Main Wooden Deck (Teak Planking) ---
  {
    const positions = [];
    const indices = [];
    const zFracs = [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0];
    const numCols = zFracs.length;

    for (let i = 0; i < xStations.length; i++) {
      const x = xStations[i];
      const { yd, wd } = getHullProfile(x);
      for (let j = 0; j < numCols; j++) {
        const f = zFracs[j];
        const z = f * wd;
        const camber = 0.22 * (1.0 - f * f);
        positions.push(x, yd + camber, z);
      }
    }

    for (let i = 0; i < xStations.length - 1; i++) {
      const rowA = i * numCols;
      const rowB = (i + 1) * numCols;
      for (let j = 0; j < numCols - 1; j++) {
        const a0 = rowA + j;
        const a1 = rowA + j + 1;
        const b0 = rowB + j;
        const b1 = rowB + j + 1;
        indices.push(a0, a1, b1, a0, b1, b0);
      }
    }

    createPart('WoodenDeck', meshGeo({ positions, indices }), mats.woodDeck, { parent: root });
  }

  // --- 5. Main Armor Belt (Citadel Bulge) ---
  {
    createPart('ArmorBeltPort', boxGeo(72, 3.2, 0.4), mats.steelArmor, {
      position: [-2, 5.8, -12.35],
      parent: root
    });
    createPart('ArmorBeltStbd', boxGeo(72, 3.2, 0.4), mats.steelArmor, {
      position: [-2, 5.8, 12.35],
      parent: root
    });
  }

  // --- 6. Triple Gun Turret Generator ---
  function buildTripleTurret(name, cfg, parent) {
    const { x, yDeck, barbetteHeight, turretElevation, facingAngle } = cfg;
    const turretPivot = createPivot(name, [x, yDeck, 0], parent);

    // 1. Cylindrical Armored Barbette
    const barbetteRadius = 5.3;
    createPart(`${name}_Barbette`, cylinderGeo(barbetteRadius, barbetteRadius, barbetteHeight - 0.004, 32), mats.steelArmor, {
      position: [0, barbetteHeight / 2 + 0.002, 0],
      parent: turretPivot
    });

    createPart(`${name}_BarbetteRing`, cylinderGeo(barbetteRadius + 0.35, barbetteRadius + 0.35, 0.2, 32), mats.steelSuper, {
      position: [0, 0.1, 0],
      parent: turretPivot
    });

    // 2. Rotating Turret Assembly
    const gunhousePivot = createPivot(`${name}_Gunhouse`, [0, barbetteHeight, 0], turretPivot);
    gunhousePivot.rotation.y = (facingAngle * Math.PI) / 180;

    createPart(`${name}_GunhouseBase`, boxGeo(11.2, 1.8, 8.8), mats.steelSuper, {
      position: [0.6, 0.9, 0],
      parent: gunhousePivot
    });

    createPart(`${name}_SlopedFrontArmor`, boxGeo(5.2, 1.8, 8.4), mats.steelSuper, {
      position: [3.8, 2.35, 0],
      rotation: [0, 0, -38],
      parent: gunhousePivot
    });

    createPart(`${name}_GunhouseRoof`, boxGeo(7.8, 1.2, 8.4), mats.turretRoofRed, {
      position: [-1.2, 2.65, 0],
      parent: gunhousePivot
    });

    createPart(`${name}_RearOverhang`, boxGeo(3.2, 1.4, 8.2), mats.steelArmor, {
      position: [-4.6, 1.6, 0],
      parent: gunhousePivot
    });

    createPart(`${name}_RangefinderBeam`, cylinderGeo(0.32, 0.32, 11.2, 16), mats.steelSuper, {
      position: [-3.8, 2.7, 0],
      rotation: [90, 0, 0],
      parent: gunhousePivot
    });
    createPart(`${name}_RangefinderEarPort`, boxGeo(0.9, 0.7, 0.8), mats.darkSteel, {
      position: [-3.8, 2.7, -5.6],
      parent: gunhousePivot
    });
    createPart(`${name}_RangefinderEarStbd`, boxGeo(0.9, 0.7, 0.8), mats.darkSteel, {
      position: [-3.8, 2.7, 5.6],
      parent: gunhousePivot
    });

    createPart(`${name}_PeriscopePort`, cylinderGeo(0.2, 0.2, 0.6, 12), mats.brass, {
      position: [-1.0, 3.4, -2.0],
      parent: gunhousePivot
    });
    createPart(`${name}_PeriscopeStbd`, cylinderGeo(0.2, 0.2, 0.6, 12), mats.brass, {
      position: [-1.0, 3.4, 2.0],
      parent: gunhousePivot
    });
    createPart(`${name}_VentCowl`, cylinderGeo(0.35, 0.25, 0.35, 12), mats.darkSteel, {
      position: [-2.6, 3.35, 0],
      parent: gunhousePivot
    });

    // 3. Three 16-inch Gun Barrels
    const barrelZ = [-2.4, 0.0, 2.4];
    const elevRad = (turretElevation * Math.PI) / 180;

    for (let b = 0; b < barrelZ.length; b++) {
      const bz = barrelZ[b];
      const gunMount = createPivot(`${name}_GunMount_${b}`, [4.2, 1.6, bz], gunhousePivot);
      gunMount.rotation.z = elevRad;

      createPart(`${name}_BlastBag_${b}`, cylinderXGeo(0.72, 0.82, 1.8, 16), mats.canvasBag, {
        position: [0.8, 0, 0],
        parent: gunMount
      });

      createPart(`${name}_SlideSleeve_${b}`, cylinderXGeo(0.52, 0.56, 4.4, 16), mats.steelSuper, {
        position: [3.4, 0, 0],
        parent: gunMount
      });

      createPart(`${name}_BarrelTube_${b}`, cylinderXGeo(0.34, 0.50, 11.5, 16), mats.darkSteel, {
        position: [11.2, 0, 0],
        parent: gunMount
      });

      createPart(`${name}_MuzzleRing_${b}`, cylinderXGeo(0.38, 0.38, 0.6, 16), mats.darkSteel, {
        position: [17.1, 0, 0],
        parent: gunMount
      });

      createPart(`${name}_MuzzleBore_${b}`, cylinderXGeo(0.22, 0.22, 0.25, 12), mats.blackMetal, {
        position: [17.3, 0, 0],
        parent: gunMount
      });
    }

    if (cfg.hasRoofAA) {
      createPart(`${name}_RoofAATub`, cylinderGeo(1.8, 1.8, 0.8, 16), mats.steelSuper, {
        position: [-0.6, 3.65, 0],
        parent: gunhousePivot
      });
      createPart(`${name}_RoofAAGuns`, boxGeo(2.4, 0.4, 0.9), mats.darkSteel, {
        position: [0.3, 3.8, 0],
        parent: gunhousePivot
      });
    }

    return turretPivot;
  }

  // --- 7. Main Armament: Triple Gun Turrets 1, 2, 3 ---
  buildTripleTurret('Turret_1', {
    x: 48,
    yDeck: 9.35,
    barbetteHeight: 0.9,
    turretElevation: 5,
    facingAngle: 0,
    hasRoofAA: false
  }, root);

  buildTripleTurret('Turret_2', {
    x: 31,
    yDeck: 8.75,
    barbetteHeight: 4.8,
    turretElevation: 7,
    facingAngle: 0,
    hasRoofAA: true
  }, root);

  buildTripleTurret('Turret_3', {
    x: -38,
    yDeck: 8.25,
    barbetteHeight: 1.1,
    turretElevation: 6,
    facingAngle: 180,
    hasRoofAA: true
  }, root);

  // --- 8. Forecastle Equipment & Details ---
  {
    createPart('BreakwaterPort', boxGeo(8.5, 1.2, 0.18), mats.steelSuper, {
      position: [59.0, 10.6, -3.4],
      rotation: [0, 36, 12],
      parent: root
    });
    createPart('BreakwaterStbd', boxGeo(8.5, 1.2, 0.18), mats.steelSuper, {
      position: [59.0, 10.6, 3.4],
      rotation: [0, -36, 12],
      parent: root
    });

    createPart('HawsePipePort', cylinderGeo(0.65, 0.65, 1.2, 12), mats.darkSteel, {
      position: [81.5, 11.2, -1.8],
      rotation: [45, 0, 30],
      parent: root
    });
    createPart('AnchorPortFluke', boxGeo(1.6, 1.4, 0.3), mats.darkSteel, {
      position: [81.2, 10.8, -1.9],
      rotation: [0, 15, 35],
      parent: root
    });
    createPart('HawsePipeStbd', cylinderGeo(0.65, 0.65, 1.2, 12), mats.darkSteel, {
      position: [81.5, 11.2, 1.8],
      rotation: [-45, 0, 30],
      parent: root
    });
    createPart('AnchorStbdFluke', boxGeo(1.6, 1.4, 0.3), mats.darkSteel, {
      position: [81.2, 10.8, 1.9],
      rotation: [0, -15, 35],
      parent: root
    });

    createPart('CapstanPort', cylinderGeo(0.85, 0.95, 1.4, 16), mats.darkSteel, {
      position: [74.0, 11.8, -2.0],
      parent: root
    });
    createPart('CapstanStbd', cylinderGeo(0.85, 0.95, 1.4, 16), mats.darkSteel, {
      position: [74.0, 11.8, 2.0],
      parent: root
    });
    createPart('CapstanHeadPort', cylinderGeo(0.5, 0.5, 0.25, 16), mats.brass, {
      position: [74.0, 12.55, -2.0],
      parent: root
    });
    createPart('CapstanHeadStbd', cylinderGeo(0.5, 0.5, 0.25, 16), mats.brass, {
      position: [74.0, 12.55, 2.0],
      parent: root
    });

    createPart('ChainPort', boxGeo(8.0, 0.16, 0.28), mats.darkSteel, {
      position: [77.5, 11.6, -1.9],
      rotation: [0, 2, 0],
      parent: root
    });
    createPart('ChainStbd', boxGeo(8.0, 0.16, 0.28), mats.darkSteel, {
      position: [77.5, 11.6, 1.9],
      rotation: [0, -2, 0],
      parent: root
    });

    createPart('Jackstaff', cylinderGeo(0.06, 0.12, 6.5, 8), mats.steelSuper, {
      position: [87.5, 15.5, 0],
      parent: root
    });
  }

  // --- 9. Superstructure & Bridge Tower ---
  {
    const superGroup = createPivot('Superstructure', [0, 0, 0], root);

    createPart('DeckhouseTier1', boxGeo(45, 3.8, 14.0), mats.steelSuper, {
      position: [-1.0, 10.6, 0],
      parent: superGroup
    });
    createPart('DeckhouseFwdRound', cylinderGeo(7.0, 7.0, 3.8, 24), mats.steelSuper, {
      position: [21.5, 10.6, 0],
      parent: superGroup
    });

    createPart('DeckhouseTier2', boxGeo(38, 3.2, 11.6), mats.steelSuper, {
      position: [-1.5, 14.1, 0],
      parent: superGroup
    });

    createPart('ConningTower', cylinderGeo(3.6, 3.9, 3.2, 24), mats.steelArmor, {
      position: [15.5, 17.2, 0],
      parent: superGroup
    });
    createPart('ConningSlits', cylinderGeo(3.7, 3.7, 0.35, 24), mats.blackMetal, {
      position: [15.5, 17.5, 0],
      parent: superGroup
    });

    createPart('NavBridgeHouse', boxGeo(6.8, 2.8, 8.2), mats.steelSuper, {
      position: [14.0, 20.1, 0],
      parent: superGroup
    });
    createPart('BridgeWindowsFwd', boxGeo(0.2, 1.1, 7.6), mats.glass, {
      position: [17.45, 20.3, 0],
      parent: superGroup
    });
    createPart('BridgeWindowsPort', boxGeo(4.2, 1.1, 0.2), mats.glass, {
      position: [15.2, 20.3, -4.15],
      parent: superGroup
    });
    createPart('BridgeWindowsStbd', boxGeo(4.2, 1.1, 0.2), mats.glass, {
      position: [15.2, 20.3, 4.15],
      parent: superGroup
    });

    createPart('BridgeWingPort', boxGeo(3.2, 2.2, 5.0), mats.steelSuper, {
      position: [14.0, 19.8, -6.6],
      parent: superGroup
    });
    createPart('BridgeWingStbd', boxGeo(3.2, 2.2, 5.0), mats.steelSuper, {
      position: [14.0, 19.8, 6.6],
      parent: superGroup
    });
    createPart('PelorusPort', cylinderGeo(0.18, 0.18, 1.0, 12), mats.brass, {
      position: [14.5, 21.4, -8.6],
      parent: superGroup
    });
    createPart('PelorusStbd', cylinderGeo(0.18, 0.18, 1.0, 12), mats.brass, {
      position: [14.5, 21.4, 8.6],
      parent: superGroup
    });

    createPart('CommandPlatform', boxGeo(5.2, 0.8, 6.4), mats.steelSuper, {
      position: [13.2, 21.8, 0],
      parent: superGroup
    });
    createPart('WindscreenRim', boxGeo(5.4, 0.9, 6.6), mats.brass, {
      position: [13.2, 22.5, 0],
      parent: superGroup
    });

    createPart('DirectorTowerPedestal', cylinderGeo(2.4, 2.8, 4.8, 16), mats.steelSuper, {
      position: [11.0, 24.6, 0],
      parent: superGroup
    });
    const fwdDirector = createPivot('Mk38DirectorFwd', [11.0, 26.9, 0], superGroup);
    createPart('DirectorHouse', boxGeo(3.2, 2.0, 3.4), mats.steelArmor, {
      position: [0, 1.0, 0],
      parent: fwdDirector
    });
    createPart('DirectorArm', cylinderGeo(0.35, 0.35, 9.2, 16), mats.steelSuper, {
      position: [0, 1.1, 0],
      rotation: [90, 0, 0],
      parent: fwdDirector
    });
    createPart('DirectorHoodPort', boxGeo(0.8, 0.7, 0.8), mats.darkSteel, {
      position: [0, 1.1, -4.6],
      parent: fwdDirector
    });
    createPart('DirectorHoodStbd', boxGeo(0.8, 0.7, 0.8), mats.darkSteel, {
      position: [0, 1.1, 4.6],
      parent: fwdDirector
    });
    createPart('RadarBracket', cylinderGeo(0.16, 0.16, 0.4, 8), mats.darkSteel, {
      position: [0.2, 2.0, 0],
      parent: fwdDirector
    });
    createPart('RadarMk8Mesh', boxGeo(1.8, 0.9, 3.2), mats.darkSteel, {
      position: [0.2, 2.35, 0],
      parent: fwdDirector
    });

    createPart('ForemastTrunk', cylinderGeo(0.35, 0.65, 14.0, 12), mats.steelSuper, {
      position: [8.5, 33.5, 0],
      parent: superGroup
    });
    createPart('TripodLegPort', cylinderGeo(0.22, 0.35, 11.5, 8), mats.steelSuper, {
      position: [6.8, 30.5, -2.4],
      rotation: [16, 0, 12],
      parent: superGroup
    });
    createPart('TripodLegStbd', cylinderGeo(0.22, 0.35, 11.5, 8), mats.steelSuper, {
      position: [6.8, 30.5, 2.4],
      rotation: [-16, 0, 12],
      parent: superGroup
    });
    createPart('LowerYardarm', cylinderGeo(0.12, 0.12, 13.5, 8), mats.steelSuper, {
      position: [8.5, 33.0, 0],
      rotation: [90, 0, 0],
      parent: superGroup
    });
    createPart('UpperYardarm', cylinderGeo(0.08, 0.08, 8.5, 8), mats.steelSuper, {
      position: [8.5, 36.8, 0],
      rotation: [90, 0, 0],
      parent: superGroup
    });
    createPart('SGRadarPlatform', cylinderGeo(1.2, 1.2, 0.2, 12), mats.steelSuper, {
      position: [8.5, 35.0, 0],
      parent: superGroup
    });
    createPart('SGRadarDish', cylinderGeo(0.6, 0.6, 0.3, 12), mats.darkSteel, {
      position: [8.5, 35.4, 0],
      rotation: [0, 30, 90],
      parent: superGroup
    });
    createPart('SCRadarAntenna', boxGeo(1.6, 2.4, 2.4), mats.darkSteel, {
      position: [8.5, 41.2, 0],
      parent: superGroup
    });
  }

  // --- 10. Smokestacks / Funnels & Machinery Casings ---
  {
    const f1Group = createPivot('Funnel_1', [4.5, 15.6, 0], root);
    f1Group.rotation.z = (-5 * Math.PI) / 180;

    createPart('Funnel1Body', cylinderGeo(2.4, 2.8, 7.8, 24), mats.steelSuper, {
      position: [0, 3.9, 0],
      scale: [1.35, 1.0, 0.85],
      parent: f1Group
    });
    createPart('Funnel1Cap', cylinderGeo(2.45, 2.45, 1.2, 24), mats.blackMetal, {
      position: [0, 7.8, 0],
      scale: [1.35, 1.0, 0.85],
      parent: f1Group
    });
    createPart('SteamPipe1', cylinderGeo(0.18, 0.18, 7.5, 8), mats.brass, {
      position: [3.3, 3.8, 0],
      parent: f1Group
    });

    const f2Group = createPivot('Funnel_2', [-7.5, 15.6, 0], root);
    f2Group.rotation.z = (-5 * Math.PI) / 180;

    createPart('Funnel2Body', cylinderGeo(2.3, 2.7, 7.4, 24), mats.steelSuper, {
      position: [0, 3.7, 0],
      scale: [1.35, 1.0, 0.85],
      parent: f2Group
    });
    createPart('Funnel2Cap', cylinderGeo(2.35, 2.35, 1.2, 24), mats.blackMetal, {
      position: [0, 7.4, 0],
      scale: [1.35, 1.0, 0.85],
      parent: f2Group
    });
    createPart('SteamPipe2', cylinderGeo(0.18, 0.18, 7.2, 8), mats.brass, {
      position: [3.2, 3.6, 0],
      parent: f2Group
    });

    createPart('SearchlightDeck', boxGeo(5.0, 0.8, 10.5), mats.steelSuper, {
      position: [-1.5, 17.2, 0],
      parent: root
    });
    const sPositions = [
      [-1.5, 17.6, -4.2],
      [-1.5, 17.6, 4.2],
      [-1.5, 17.6, -1.8],
      [-1.5, 17.6, 1.8]
    ];
    for (let s = 0; s < sPositions.length; s++) {
      const [sx, sy, sz] = sPositions[s];
      const sPivot = createPivot(`Searchlight_${s}`, [sx, sy, sz], root);
      createPart(`SearchlightPedestal_${s}`, cylinderGeo(0.2, 0.25, 0.7, 12), mats.steelSuper, {
        position: [0, 0.35, 0],
        parent: sPivot
      });
      createPart(`SearchlightDrum_${s}`, cylinderXGeo(0.6, 0.6, 0.8, 16), mats.brass, {
        position: [0, 0.85, 0],
        parent: sPivot
      });
      createPart(`SearchlightLens_${s}`, cylinderXGeo(0.52, 0.52, 0.15, 16), mats.glass, {
        position: [0.38, 0.85, 0],
        parent: sPivot
      });
    }

    const boatPositions = [
      [-1.5, 15.7, -6.8],
      [-1.5, 15.7, 6.8]
    ];
    for (let b = 0; b < boatPositions.length; b++) {
      const [bx, by, bz] = boatPositions[b];
      const boat = createPivot(`MotorLaunch_${b}`, [bx, by, bz], root);
      createPart(`LaunchHull_${b}`, boxGeo(9.5, 1.4, 2.8), mats.white, {
        position: [0, 0.7, 0],
        parent: boat
      });
      createPart(`LaunchCabin_${b}`, boxGeo(4.2, 1.1, 2.0), mats.woodMargin, {
        position: [-0.6, 1.7, 0],
        parent: boat
      });
      createPart(`LaunchChockFwd_${b}`, boxGeo(0.4, 0.5, 3.2), mats.steelSuper, {
        position: [2.5, 0.25, 0],
        parent: boat
      });
      createPart(`LaunchChockAft_${b}`, boxGeo(0.4, 0.5, 3.2), mats.steelSuper, {
        position: [-2.5, 0.25, 0],
        parent: boat
      });
    }

    const cranePivot = createPivot('MidshipsCrane', [-13.0, 15.6, 0], root);
    createPart('CranePillar', cylinderGeo(0.7, 0.85, 5.0, 16), mats.steelSuper, {
      position: [0, 2.5, 0],
      parent: cranePivot
    });
    createPart('MidshipsCraneBoom', boxGeo(11.0, 0.5, 0.6), mats.steelSuper, {
      position: [-4.5, 4.9, 0],
      rotation: [0, 0, 18],
      parent: cranePivot
    });
  }

  // --- 11. Secondary Battery: Twin 5-inch/38-Caliber Turrets ---
  {
    const secPositions = [
      { x: 10.0, z: 8.4, facing: 45 },
      { x: -1.5, z: 8.6, facing: 90 },
      { x: -13.0, z: 8.4, facing: 135 },
      { x: 10.0, z: -8.4, facing: -45 },
      { x: -1.5, z: -8.6, facing: -90 },
      { x: -13.0, z: -8.4, facing: -135 },
    ];

    for (let i = 0; i < secPositions.length; i++) {
      const { x, z, facing } = secPositions[i];
      const secPivot = createPivot(`SecTurret_${i}`, [x, 12.5, z], root);
      secPivot.rotation.y = (facing * Math.PI) / 180;

      createPart(`SecMountRing_${i}`, cylinderGeo(1.8, 1.8, 0.4, 16), mats.steelArmor, {
        position: [0, 0.2, 0],
        parent: secPivot
      });
      createPart(`SecGunhouse_${i}`, boxGeo(3.2, 1.8, 2.8), mats.steelSuper, {
        position: [0, 1.2, 0],
        parent: secPivot
      });
      createPart(`SecBarrelL_${i}`, cylinderXGeo(0.14, 0.18, 4.4, 12), mats.darkSteel, {
        position: [2.8, 1.3, -0.55],
        parent: secPivot
      });
      createPart(`SecBarrelR_${i}`, cylinderXGeo(0.14, 0.18, 4.4, 12), mats.darkSteel, {
        position: [2.8, 1.3, 0.55],
        parent: secPivot
      });
    }
  }

  // --- 12. Anti-Aircraft Batteries (40mm Bofors Quad Mounts) ---
  {
    const aaPositions = [
      { x: 23.0, y: 12.4, z: 7.2 },
      { x: 23.0, y: 12.4, z: -7.2 },
      { x: 4.5, y: 15.6, z: 7.5 },
      { x: 4.5, y: 15.6, z: -7.5 },
      { x: -20.0, y: 12.4, z: 5.6 },
      { x: -20.0, y: 12.4, z: -5.6 },
    ];

    for (let i = 0; i < aaPositions.length; i++) {
      const { x, y, z } = aaPositions[i];
      const aaTub = createPivot(`BoforsTub_${i}`, [x, y, z], root);
      createPart(`BoforsTubWall_${i}`, cylinderGeo(1.9, 1.9, 1.1, 16), mats.steelSuper, {
        position: [0, 0.55, 0],
        parent: aaTub
      });
      createPart(`BoforsCarriage_${i}`, boxGeo(1.2, 0.8, 1.1), mats.darkSteel, {
        position: [0, 0.9, 0],
        parent: aaTub
      });
      createPart(`BoforsBarrels_${i}`, boxGeo(2.6, 0.35, 0.8), mats.darkSteel, {
        position: [0.6, 1.2, 0],
        rotation: [0, 0, 15],
        parent: aaTub
      });
    }
  }

  // --- 13. Aft Superstructure, Mainmast & Secondary Director ---
  {
    const aftGroup = createPivot('AftSuperstructure', [-20.0, 12.4, 0], root);

    createPart('AftDeckhouse', boxGeo(8.5, 2.8, 7.8), mats.steelSuper, {
      position: [0, 1.4, 0],
      parent: aftGroup
    });

    const aftDir = createPivot('Mk38DirectorAft', [1.5, 2.8, 0], aftGroup);
    createPart('AftDirHouse', boxGeo(2.8, 1.8, 3.0), mats.steelArmor, {
      position: [0, 1.0, 0],
      parent: aftDir
    });
    createPart('AftDirArm', cylinderGeo(0.32, 0.32, 8.4, 16), mats.steelSuper, {
      position: [0, 1.1, 0],
      rotation: [90, 0, 0],
      parent: aftDir
    });

    createPart('MainmastTrunk', cylinderGeo(0.3, 0.5, 14.0, 12), mats.steelSuper, {
      position: [-2.8, 9.8, 0],
      parent: aftGroup
    });
    createPart('MainmastYardarm', cylinderGeo(0.09, 0.09, 9.5, 8), mats.steelSuper, {
      position: [-2.8, 13.2, 0],
      rotation: [90, 0, 0],
      parent: aftGroup
    });
    createPart('EnsignGaff', cylinderGeo(0.06, 0.08, 4.2, 8), mats.steelSuper, {
      position: [-4.2, 14.5, 0],
      rotation: [0, 0, -42],
      parent: aftGroup
    });
  }

  // --- 14. Fantail / Quarterdeck Equipment & Reconnaissance Floatplane ---
  {
    const catPivot = createPivot('AircraftCatapult', [-63.5, 8.1, 0], root);
    catPivot.rotation.y = (-50 * Math.PI) / 180;

    createPart('CatapultTurntable', cylinderGeo(1.8, 2.0, 0.8, 16), mats.steelArmor, {
      position: [0, 0.4, 0],
      parent: catPivot
    });
    createPart('LaunchRail', boxGeo(16.5, 0.8, 1.2), mats.steelSuper, {
      position: [3.5, 1.2, 0],
      parent: catPivot
    });

    const plane = createPivot('Floatplane', [2.5, 2.2, 0], catPivot);
    createPart('PlaneFuselage', boxGeo(6.8, 1.2, 1.2), mats.navyBlue, {
      position: [0, 0.6, 0],
      parent: plane
    });
    createPart('PlaneEngineCowl', cylinderXGeo(0.6, 0.6, 0.9, 16), mats.darkSteel, {
      position: [3.7, 0.6, 0],
      parent: plane
    });
    createPart('PlanePropeller', boxGeo(0.1, 1.8, 0.22), mats.blackMetal, {
      position: [4.2, 0.6, 0],
      parent: plane
    });
    createPart('PlaneCanopy', boxGeo(2.6, 0.6, 0.8), mats.glass, {
      position: [0.8, 1.35, 0],
      parent: plane
    });
    createPart('PlaneWings', boxGeo(1.6, 0.16, 10.5), mats.navyBlue, {
      position: [0.8, 0.65, 0],
      parent: plane
    });
    createPart('PlaneTailFin', boxGeo(1.1, 1.2, 0.12), mats.navyBlue, {
      position: [-3.0, 1.3, 0],
      parent: plane
    });
    createPart('PlaneTailPlane', boxGeo(0.9, 0.12, 3.2), mats.navyBlue, {
      position: [-3.0, 0.8, 0],
      parent: plane
    });
    createPart('MainFloat', boxGeo(6.2, 0.7, 1.0), mats.steelSuper, {
      position: [0.4, -0.65, 0],
      parent: plane
    });
    createPart('FloatStrutFwd', boxGeo(0.12, 0.8, 0.12), mats.darkSteel, {
      position: [1.8, -0.15, 0],
      parent: plane
    });
    createPart('FloatStrutAft', boxGeo(0.12, 0.8, 0.12), mats.darkSteel, {
      position: [-1.2, -0.15, 0],
      parent: plane
    });
    createPart('WingtipFloatL', boxGeo(1.2, 0.3, 0.35), mats.steelSuper, {
      position: [0.8, -0.2, -4.8],
      parent: plane
    });
    createPart('WingtipFloatR', boxGeo(1.2, 0.3, 0.35), mats.steelSuper, {
      position: [0.8, -0.2, 4.8],
      parent: plane
    });

    const sternCrane = createPivot('SternCrane', [-69.5, 8.0, 0], root);
    createPart('SternCraneBase', cylinderGeo(0.5, 0.65, 3.2, 12), mats.steelSuper, {
      position: [0, 1.6, 0],
      parent: sternCrane
    });
    createPart('SternCraneBoom', boxGeo(8.5, 0.35, 0.4), mats.steelSuper, {
      position: [2.5, 3.1, 0],
      rotation: [0, 0, -25],
      parent: sternCrane
    });

    const ensignStaff = createPivot('EnsignStaff', [-71.5, 8.0, 0], root);
    createPart('StaffPole', cylinderGeo(0.05, 0.09, 5.2, 8), mats.steelSuper, {
      position: [0, 2.6, 0],
      parent: ensignStaff
    });
    createPart('EnsignFlag', boxGeo(2.4, 1.4, 0.04), mats.ensignRed, {
      position: [-1.25, 4.2, 0.05],
      rotation: [0, 10, 0],
      parent: ensignStaff
    });

    const bollardX = [-48, -54, -60, -66];
    for (let b = 0; b < bollardX.length; b++) {
      const bx = bollardX[b];
      createPart(`BollardPort_${b}`, cylinderGeo(0.22, 0.22, 0.65, 8), mats.darkSteel, {
        position: [bx, 8.4, -9.5 + b * 1.5],
        parent: root
      });
      createPart(`BollardStbd_${b}`, cylinderGeo(0.22, 0.22, 0.65, 8), mats.darkSteel, {
        position: [bx, 8.4, 9.5 - b * 1.5],
        parent: root
      });
    }

    // Wooden Deck Companionways & Hatches
    createPart('FwdHatchCoaming', boxGeo(2.4, 0.45, 1.8), mats.woodMargin, {
      position: [67.0, 11.2, 0],
      parent: root
    });
    createPart('FwdHatchTop', boxGeo(2.2, 0.15, 1.6), mats.woodDeck, {
      position: [67.0, 11.45, 0],
      parent: root
    });
    createPart('FwdHatchBrass', boxGeo(0.2, 0.25, 1.2), mats.brass, {
      position: [67.0, 11.55, 0],
      parent: root
    });

    createPart('AftHatchCoaming', boxGeo(2.2, 0.4, 1.6), mats.woodMargin, {
      position: [-51.0, 8.35, 0],
      parent: root
    });
    createPart('AftHatchTop', boxGeo(2.0, 0.12, 1.4), mats.woodDeck, {
      position: [-51.0, 8.58, 0],
      parent: root
    });
  }

  // --- 15. Underwater Keel, Propellers & Rudders ---
  {
    createPart('BilgeKeelPort', boxGeo(48, 0.2, 1.1), mats.steelArmor, {
      position: [-2.0, 1.4, -11.6],
      rotation: [0, 0, 0],
      parent: root
    });
    createPart('BilgeKeelStbd', boxGeo(48, 0.2, 1.1), mats.steelArmor, {
      position: [-2.0, 1.4, 11.6],
      rotation: [0, 0, 0],
      parent: root
    });

    const shaftPositions = [
      { name: 'ShaftInPort', x: -54, y: 2.2, z: -2.8, rotZ: 3.5 },
      { name: 'ShaftInStbd', x: -54, y: 2.2, z: 2.8, rotZ: 3.5 },
      { name: 'ShaftOutPort', x: -51, y: 2.6, z: -5.6, rotZ: 5 },
      { name: 'ShaftOutStbd', x: -51, y: 2.6, z: 5.6, rotZ: 5 },
    ];

    for (let s = 0; s < shaftPositions.length; s++) {
      const { name, x, y, z, rotZ } = shaftPositions[s];
      createPart(name, cylinderXGeo(0.25, 0.25, 14.0, 12), mats.darkSteel, {
        position: [x, y, z],
        rotation: [0, 0, rotZ],
        parent: root
      });
      const screwX = x - 7.0;
      createPart(`${name}_Hub`, cylinderXGeo(0.55, 0.55, 1.2, 16), mats.bronzeProp, {
        position: [screwX, y - 0.35, z],
        parent: root
      });
      for (let blade = 0; blade < 3; blade++) {
        const bladePivot = createPivot(`${name}_Blade_${blade}`, [screwX, y - 0.35, z], root);
        bladePivot.rotation.x = (blade * 120 * Math.PI) / 180;
        createPart(`${name}_Blade_${blade}_Mesh`, boxGeo(0.12, 1.3, 0.42), mats.bronzeProp, {
          position: [0, 0.65, 0],
          rotation: [25, 0, 0],
          parent: bladePivot
        });
      }
    }

    createPart('RudderPort', boxGeo(4.2, 2.8, 0.35), mats.steelArmor, {
      position: [-65.0, 2.4, -2.6],
      parent: root
    });
    createPart('RudderStbd', boxGeo(4.2, 2.8, 0.35), mats.steelArmor, {
      position: [-65.0, 2.4, 2.6],
      parent: root
    });
  }

  return root;
}
