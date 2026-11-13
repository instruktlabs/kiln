// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'VictorianGreenhouse', category: 'architecture' };

function build() {
  const root = createRoot('VictorianGreenhouse');

  // ==========================================
  // MATERIALS
  // ==========================================
  const brickMat = gameMaterial(0x8f3c2c, { roughness: 0.88, metalness: 0.04 });
  const plinthBrickMat = gameMaterial(0x4e2c24, { roughness: 0.84, metalness: 0.06 });
  const stoneMat = gameMaterial(0xc6bead, { roughness: 0.78, metalness: 0.05 });
  const ironMat = gameMaterial(0xf4f6f3, { roughness: 0.35, metalness: 0.25 });
  const darkIronMat = gameMaterial(0x2a2e2b, { roughness: 0.55, metalness: 0.55 });
  const brassMat = gameMaterial(0xcba845, { roughness: 0.28, metalness: 0.85 });
  const woodMat = gameMaterial(0x563820, { roughness: 0.82, metalness: 0.05 });
  const glassMat = glassMaterial(0xaad8e6, { opacity: 0.30, roughness: 0.08, metalness: 0.1 });
  const potMat = gameMaterial(0xba582d, { roughness: 0.86, metalness: 0.04 });
  const compostMat = gameMaterial(0x2b1e16, { roughness: 0.95, metalness: 0.02 });
  const plantMat = gameMaterial(0x2e6926, { roughness: 0.72, metalness: 0.04 });
  const darkLeafMat = gameMaterial(0x1d4d18, { roughness: 0.75, metalness: 0.04 });
  const flowerRedMat = gameMaterial(0xd42424, { roughness: 0.55, metalness: 0.05 });
  const flowerWhiteMat = gameMaterial(0xf5f3ee, { roughness: 0.60, metalness: 0.05 });

  // ==========================================
  // CORE GEOMETRY & ARCHITECTURAL GRID
  // ==========================================
  const length = 6.0;   // along X: -3.0 to +3.0
  const width = 3.6;    // along Z: -1.8 to +1.8
  const halfL = length / 2;
  const halfW = width / 2;
  const numBays = 6;
  const baySize = length / numBays; // 1.0m per bay

  // Heights
  const plinthH = 0.14;    // dark brick base
  const wallH = 0.74;      // top of red brick
  const copingH = 0.08;    // stone coping
  const sillY = wallH + copingH; // 0.82m
  const eaveH = 2.22;      // underside of eave beam
  const vaultRise = 1.12;  // barrel vault rise
  const ridgeVaultCrown = eaveH + vaultRise; // 3.34m

  const wallThick = 0.18;
  const archHalfW = halfW - wallThick / 2; // 1.71m

  // Lantern dimensions
  const lanternW = 0.82;   // width along Z
  const lanternHalfW = lanternW / 2; // 0.41m
  const lanternH = 0.58;   // vertical height of lantern side walls
  const lanternEaveH = 3.26 + lanternH; // 3.84m
  const lanternPitchH = 0.28; // lantern ridge cap rise
  const lanternRidgeY = lanternEaveH + lanternPitchH; // 4.12m

  // Door opening
  const doorW = 1.30;
  const doorLeafW = doorW / 2 - 0.03;
  const doorTransomH = 2.06;

  // 1. Foundation & Floor
  createPart('FoundSlab', boxGeo(length + 0.36, 0.08, width + 0.36), stoneMat, {
    position: [0, 0.04, 0],
    parent: root,
  });
  createPart('InteriorFloor', boxGeo(length - 0.04, 0.03, width - 0.04), stoneMat, {
    position: [0, 0.085, 0],
    parent: root,
  });
  createPart('WalkwayBorderL', boxGeo(length - 0.1, 0.02, 0.06), stoneMat, {
    position: [0, 0.10, -0.48],
    parent: root,
  });
  createPart('WalkwayBorderR', boxGeo(length - 0.1, 0.02, 0.06), stoneMat, {
    position: [0, 0.10, 0.48],
    parent: root,
  });
  createPart('DoorStep_Exterior', boxGeo(0.36, 0.06, doorW + 0.16), stoneMat, {
    position: [halfL + 0.14, 0.03, 0],
    parent: root,
  });

  // 2. Brick Dwarf Wall with Plinth & Coping
  const wallBodyH = wallH - plinthH;
  const wallMidY = plinthH + wallBodyH / 2;

  // Left Long Wall
  const zLeft = -halfW + wallThick / 2;
  createPart('Plinth_Left', boxGeo(length, plinthH, wallThick + 0.04), plinthBrickMat, {
    position: [0, plinthH / 2, zLeft],
    parent: root,
  });
  createPart('Wall_Left', boxGeo(length, wallBodyH, wallThick), brickMat, {
    position: [0, wallMidY, zLeft],
    parent: root,
  });
  createPart('Coping_Left', boxGeo(length + 0.08, copingH, wallThick + 0.06), stoneMat, {
    position: [0, wallH + copingH / 2, zLeft],
    parent: root,
  });

  // Right Long Wall
  const zRight = halfW - wallThick / 2;
  createPart('Plinth_Right', boxGeo(length, plinthH, wallThick + 0.04), plinthBrickMat, {
    position: [0, plinthH / 2, zRight],
    parent: root,
  });
  createPart('Wall_Right', boxGeo(length, wallBodyH, wallThick), brickMat, {
    position: [0, wallMidY, zRight],
    parent: root,
  });
  createPart('Coping_Right', boxGeo(length + 0.08, copingH, wallThick + 0.06), stoneMat, {
    position: [0, wallH + copingH / 2, zRight],
    parent: root,
  });

  // Brick Piers under each post on Left and Right
  const pierGeo = boxGeo(0.20, wallBodyH, 0.03);
  const pierCapGeo = boxGeo(0.22, copingH + 0.01, 0.04);
  for (let b = 0; b <= numBays; b++) {
    const x = -halfL + b * baySize;
    createPart(`Pier_L_${b}`, pierGeo, brickMat, {
      position: [x, wallMidY, zLeft - wallThick / 2 - 0.015],
      parent: root,
    });
    createPart(`PierCap_L_${b}`, pierCapGeo, stoneMat, {
      position: [x, wallH + copingH / 2, zLeft - wallThick / 2 - 0.02],
      parent: root,
    });
    createPart(`Pier_R_${b}`, pierGeo, brickMat, {
      position: [x, wallMidY, zRight + wallThick / 2 + 0.015],
      parent: root,
    });
    createPart(`PierCap_R_${b}`, pierCapGeo, stoneMat, {
      position: [x, wallH + copingH / 2, zRight + wallThick / 2 + 0.02],
      parent: root,
    });
  }

  // Back Wall (Continuous)
  const backX = -halfL + wallThick / 2;
  createPart('Plinth_Back', boxGeo(wallThick + 0.04, plinthH, width - 2 * wallThick), plinthBrickMat, {
    position: [backX, plinthH / 2, 0],
    parent: root,
  });
  createPart('Wall_Back', boxGeo(wallThick, wallBodyH, width - 2 * wallThick), brickMat, {
    position: [backX, wallMidY, 0],
    parent: root,
  });
  createPart('Coping_Back', boxGeo(wallThick + 0.06, copingH, width), stoneMat, {
    position: [backX, wallH + copingH / 2, 0],
    parent: root,
  });

  // Front Wall (with door opening)
  const frontX = halfL - wallThick / 2;
  const frontSideW = (width - doorW) / 2 - wallThick;
  const frontZ_L = -doorW / 2 - frontSideW / 2;
  const frontZ_R = doorW / 2 + frontSideW / 2;

  createPart('Plinth_Front_L', boxGeo(wallThick + 0.04, plinthH, frontSideW), plinthBrickMat, {
    position: [frontX, plinthH / 2, frontZ_L],
    parent: root,
  });
  createPart('Wall_Front_L', boxGeo(wallThick, wallBodyH, frontSideW), brickMat, {
    position: [frontX, wallMidY, frontZ_L],
    parent: root,
  });
  createPart('Coping_Front_L', boxGeo(wallThick + 0.06, copingH, frontSideW + 0.03), stoneMat, {
    position: [frontX, wallH + copingH / 2, frontZ_L],
    parent: root,
  });

  createPart('Plinth_Front_R', boxGeo(wallThick + 0.04, plinthH, frontSideW), plinthBrickMat, {
    position: [frontX, plinthH / 2, frontZ_R],
    parent: root,
  });
  createPart('Wall_Front_R', boxGeo(wallThick, wallBodyH, frontSideW), brickMat, {
    position: [frontX, wallMidY, frontZ_R],
    parent: root,
  });
  createPart('Coping_Front_R', boxGeo(wallThick + 0.06, copingH, frontSideW + 0.03), stoneMat, {
    position: [frontX, wallH + copingH / 2, frontZ_R],
    parent: root,
  });

  // 3. White-Painted Cast-Iron Side Walls
  const sideWindowH = eaveH - sillY;
  const sideWindowMidY = sillY + sideWindowH / 2;

  createPart('SillBeam_L', boxGeo(length, 0.04, 0.06), ironMat, {
    position: [0, sillY + 0.02, zLeft],
    parent: root,
  });
  createPart('SillBeam_R', boxGeo(length, 0.04, 0.06), ironMat, {
    position: [0, sillY + 0.02, zRight],
    parent: root,
  });
  createPart('EavesBeam_L', boxGeo(length + 0.08, 0.07, 0.08), ironMat, {
    position: [0, eaveH + 0.035, zLeft],
    parent: root,
  });
  createPart('EavesBeam_R', boxGeo(length + 0.08, 0.07, 0.08), ironMat, {
    position: [0, eaveH + 0.035, zRight],
    parent: root,
  });

  const transomY = sillY + sideWindowH * 0.52;
  createPart('TransomRail_L', boxGeo(length, 0.03, 0.04), ironMat, {
    position: [0, transomY, zLeft],
    parent: root,
  });
  createPart('TransomRail_R', boxGeo(length, 0.03, 0.04), ironMat, {
    position: [0, transomY, zRight],
    parent: root,
  });

  // Vertical Posts & Spandrel Brackets
  const postGeo = cylinderGeo(0.032, 0.036, sideWindowH, 5);
  const shoeGeo = boxGeo(0.10, 0.04, 0.10);
  const capGeo = boxGeo(0.10, 0.05, 0.10);
  const spandrelGeo = torusGeo(0.08, 0.012, 3, 6);

  for (let b = 0; b <= numBays; b++) {
    const x = -halfL + b * baySize;
    createPart(`Post_L_${b}`, postGeo, ironMat, {
      position: [x, sideWindowMidY, zLeft],
      parent: root,
    });
    createPart(`Post_R_${b}`, postGeo, ironMat, {
      position: [x, sideWindowMidY, zRight],
      parent: root,
    });
    createPart(`PostShoe_L_${b}`, shoeGeo, ironMat, {
      position: [x, sillY + 0.02, zLeft],
      parent: root,
    });
    createPart(`PostShoe_R_${b}`, shoeGeo, ironMat, {
      position: [x, sillY + 0.02, zRight],
      parent: root,
    });
    createPart(`PostCap_L_${b}`, capGeo, ironMat, {
      position: [x, eaveH - 0.025, zLeft],
      parent: root,
    });
    createPart(`PostCap_R_${b}`, capGeo, ironMat, {
      position: [x, eaveH - 0.025, zRight],
      parent: root,
    });
    createPart(`Spandrel_L_${b}`, spandrelGeo, ironMat, {
      position: [x, eaveH + 0.06, zLeft + 0.08],
      rotation: [0, 90, 0],
      parent: root,
    });
    createPart(`Spandrel_R_${b}`, spandrelGeo, ironMat, {
      position: [x, eaveH + 0.06, zRight - 0.08],
      rotation: [0, 90, 0],
      parent: root,
    });
  }

  // Side glazing
  const lowerH = transomY - sillY - 0.04;
  const upperH = eaveH - transomY - 0.04;
  const lowerMidY = sillY + 0.02 + lowerH / 2;
  const upperMidY = transomY + 0.02 + upperH / 2;
  const paneW = baySize / 2 - 0.025;
  const muntinGeo = boxGeo(0.02, sideWindowH, 0.025);
  const glassLowGeo = boxGeo(paneW, lowerH, 0.008);
  const glassUpGeo = boxGeo(paneW, upperH, 0.008);

  for (let b = 0; b < numBays; b++) {
    const xMid = -halfL + (b + 0.5) * baySize;
    createPart(`SideMuntin_L_${b}`, muntinGeo, ironMat, {
      position: [xMid, sideWindowMidY, zLeft],
      parent: root,
    });
    createPart(`SideMuntin_R_${b}`, muntinGeo, ironMat, {
      position: [xMid, sideWindowMidY, zRight],
      parent: root,
    });

    for (let sub = 0; sub < 2; sub++) {
      const subX = -halfL + b * baySize + (sub + 0.5) * (baySize / 2);
      createPart(`Glass_L_Low_${b}_${sub}`, glassLowGeo, glassMat, {
        position: [subX, lowerMidY, zLeft],
        parent: root,
      });
      createPart(`Glass_L_Up_${b}_${sub}`, glassUpGeo, glassMat, {
        position: [subX, upperMidY, zLeft],
        parent: root,
      });
      createPart(`Glass_R_Low_${b}_${sub}`, glassLowGeo, glassMat, {
        position: [subX, lowerMidY, zRight],
        parent: root,
      });
      createPart(`Glass_R_Up_${b}_${sub}`, glassUpGeo, glassMat, {
        position: [subX, upperMidY, zRight],
        parent: root,
      });
    }
  }

  // ==========================================
  // 4. BARREL-VAULTED ROOF STRUCTURE
  // ==========================================
  const roof = createRoot('Roof');
  root.add(roof);

  function archY(z) {
    const ratio = Math.min(1.0, Math.max(-1.0, z / archHalfW));
    return eaveH + vaultRise * Math.sqrt(Math.max(0, 1 - ratio * ratio));
  }

  // Continuous Curved Iron Ribs across the vault at each bay
  const ribSegs = 14;
  const ribPts = [];
  for (let s = 0; s <= ribSegs; s++) {
    const theta = (s / ribSegs) * Math.PI;
    const z = -archHalfW * Math.cos(theta);
    const y = eaveH + vaultRise * Math.sin(theta);
    ribPts.push([0, y, z]);
  }
  const ribGeo = curveToMesh(ribPts, 0.028, 12, 4);

  for (let b = 0; b <= numBays; b++) {
    const x = -halfL + b * baySize;
    createPart(`Rib_${b}`, ribGeo, ironMat, {
      position: [x, 0, 0],
      parent: roof,
    });
    beamBetween(`TieRod_${b}`, [x, eaveH + 0.12, -archHalfW + 0.15], [x, eaveH + 0.12, archHalfW - 0.15], 0.012, ironMat, { segments: 4, parent: roof });
    beamBetween(`KingRod_${b}`, [x, eaveH + 0.12, 0], [x, ridgeVaultCrown - 0.04, 0], 0.010, ironMat, { segments: 4, parent: roof });
  }

  // Longitudinal purlins
  const purlinAngles = [0.44, 0.90, Math.PI - 0.90, Math.PI - 0.44];
  const purlinGeo = cylinderXGeo(0.02, 0.02, length + 0.04, 5);
  for (let p = 0; p < purlinAngles.length; p++) {
    const theta = purlinAngles[p];
    const pz = -archHalfW * Math.cos(theta);
    const py = eaveH + vaultRise * Math.sin(theta);
    createPart(`Purlin_${p}`, purlinGeo, ironMat, {
      position: [0, py, pz],
      parent: roof,
    });
  }

  // Roof Glazing Facets
  const thetaLantern = Math.acos(lanternHalfW / archHalfW);
  const roofSlopeSegs = 6;

  for (let b = 0; b < numBays; b++) {
    const xMid = -halfL + (b + 0.5) * baySize;

    // Left slope
    for (let s = 0; s < roofSlopeSegs; s++) {
      const t0 = (s / roofSlopeSegs) * thetaLantern;
      const t1 = ((s + 1) / roofSlopeSegs) * thetaLantern;
      const z0 = -archHalfW * Math.cos(t0);
      const z1 = -archHalfW * Math.cos(t1);
      const y0 = eaveH + vaultRise * Math.sin(t0);
      const y1 = eaveH + vaultRise * Math.sin(t1);

      const midZ = (z0 + z1) / 2;
      const midY = (y0 + y1) / 2;
      const dz = z1 - z0;
      const dy = y1 - y0;
      const chord = Math.sqrt(dz * dz + dy * dy);
      const angleDeg = -Math.atan2(dy, dz) * (180 / Math.PI);

      createPart(`RoofGlass_L_${b}_${s}`, boxGeo(baySize - 0.025, chord - 0.006, 0.008), glassMat, {
        position: [xMid, midY, midZ],
        rotation: [angleDeg, 0, 0],
        parent: roof,
      });
    }

    // Right slope
    for (let s = 0; s < roofSlopeSegs; s++) {
      const t0 = Math.PI - thetaLantern + (s / roofSlopeSegs) * thetaLantern;
      const t1 = Math.PI - thetaLantern + ((s + 1) / roofSlopeSegs) * thetaLantern;
      const z0 = -archHalfW * Math.cos(t0);
      const z1 = -archHalfW * Math.cos(t1);
      const y0 = eaveH + vaultRise * Math.sin(t0);
      const y1 = eaveH + vaultRise * Math.sin(t1);

      const midZ = (z0 + z1) / 2;
      const midY = (y0 + y1) / 2;
      const dz = z1 - z0;
      const dy = y1 - y0;
      const chord = Math.sqrt(dz * dz + dy * dy);
      const angleDeg = -Math.atan2(dy, dz) * (180 / Math.PI);

      createPart(`RoofGlass_R_${b}_${s}`, boxGeo(baySize - 0.025, chord - 0.006, 0.008), glassMat, {
        position: [xMid, midY, midZ],
        rotation: [angleDeg, 0, 0],
        parent: roof,
      });
    }
  }

  // ==========================================
  // 5. RIDGE LANTERN WITH PROPPED OPEN VENTS
  // ==========================================
  const lanternSillY = archY(lanternHalfW); // ~3.27m
  const lanternEaveY = lanternSillY + lanternH; // ~3.85m
  const lanternRidgeCapY = lanternEaveY + lanternPitchH; // ~4.13m

  createPart('LanternSill_L', boxGeo(length + 0.06, 0.06, 0.06), ironMat, {
    position: [0, lanternSillY + 0.03, -lanternHalfW],
    parent: roof,
  });
  createPart('LanternSill_R', boxGeo(length + 0.06, 0.06, 0.06), ironMat, {
    position: [0, lanternSillY + 0.03, lanternHalfW],
    parent: roof,
  });
  createPart('LanternEave_L', boxGeo(length + 0.06, 0.05, 0.06), ironMat, {
    position: [0, lanternEaveY - 0.025, -lanternHalfW],
    parent: roof,
  });
  createPart('LanternEave_R', boxGeo(length + 0.06, 0.05, 0.06), ironMat, {
    position: [0, lanternEaveY - 0.025, lanternHalfW],
    parent: roof,
  });
  createPart('LanternRidgeBeam', boxGeo(length + 0.08, 0.06, 0.05), ironMat, {
    position: [0, lanternRidgeCapY, 0],
    parent: roof,
  });

  const lantPostGeo = cylinderGeo(0.022, 0.022, lanternH, 4);
  for (let b = 0; b <= numBays; b++) {
    const x = -halfL + b * baySize;
    createPart(`LanternPost_L_${b}`, lantPostGeo, ironMat, {
      position: [x, lanternSillY + lanternH / 2, -lanternHalfW],
      parent: roof,
    });
    createPart(`LanternPost_R_${b}`, lantPostGeo, ironMat, {
      position: [x, lanternSillY + lanternH / 2, lanternHalfW],
      parent: roof,
    });
    beamBetween(`LanternRafter_L_${b}`, [x, lanternRidgeCapY, 0], [x, lanternEaveY, -lanternHalfW - 0.03], 0.018, ironMat, { segments: 4, parent: roof });
    beamBetween(`LanternRafter_R_${b}`, [x, lanternRidgeCapY, 0], [x, lanternEaveY, lanternHalfW + 0.03], 0.018, ironMat, { segments: 4, parent: roof });
  }

  const capChord = Math.sqrt(lanternHalfW * lanternHalfW + lanternPitchH * lanternPitchH);
  const capPitchDeg = Math.atan2(lanternPitchH, lanternHalfW) * (180 / Math.PI);
  const capGlassGeo = boxGeo(baySize - 0.025, capChord, 0.008);
  for (let b = 0; b < numBays; b++) {
    const xMid = -halfL + (b + 0.5) * baySize;
    createPart(`LanternCapGlass_L_${b}`, capGlassGeo, glassMat, {
      position: [xMid, (lanternEaveY + lanternRidgeCapY) / 2, -lanternHalfW / 2],
      rotation: [capPitchDeg, 0, 0],
      parent: roof,
    });
    createPart(`LanternCapGlass_R_${b}`, capGlassGeo, glassMat, {
      position: [xMid, (lanternEaveY + lanternRidgeCapY) / 2, lanternHalfW / 2],
      rotation: [-capPitchDeg, 0, 0],
      parent: roof,
    });
  }

  // Hinged Side Vents Propped Open (Bays 1, 3, 5)
  const ventW = baySize - 0.05;
  const ventH = lanternH - 0.07;
  const ventFrameGeo = boxGeo(ventW, ventH, 0.025);
  const ventGlassGeo = boxGeo(ventW - 0.06, ventH - 0.06, 0.008);
  const closedFrameGeo = boxGeo(ventW, ventH, 0.02);

  for (let b = 0; b < numBays; b++) {
    const xMid = -halfL + (b + 0.5) * baySize;
    const isOpen = (b % 2 === 1);

    if (isOpen) {
      const tiltDeg = -24;
      const pivotY = lanternEaveY - 0.03;
      const pivotZ = -lanternHalfW;
      const rad = tiltDeg * (Math.PI / 180);

      const vcY = pivotY - (ventH / 2) * Math.cos(rad);
      const vcZ = pivotZ + (ventH / 2) * Math.sin(rad);

      createPart(`VentFrame_L_${b}`, ventFrameGeo, ironMat, {
        position: [xMid, vcY, vcZ],
        rotation: [tiltDeg, 0, 0],
        parent: roof,
      });
      createPart(`VentGlass_L_${b}`, ventGlassGeo, glassMat, {
        position: [xMid, vcY, vcZ],
        rotation: [tiltDeg, 0, 0],
        parent: roof,
      });

      const bottomY = pivotY - ventH * Math.cos(rad);
      const bottomZ = pivotZ + ventH * Math.sin(rad);
      beamBetween(`VentStay_L1_${b}`, [xMid - 0.22, lanternSillY + 0.05, -lanternHalfW], [xMid - 0.22, bottomY, bottomZ], 0.007, brassMat, { segments: 4, parent: roof });
      beamBetween(`VentStay_L2_${b}`, [xMid + 0.22, lanternSillY + 0.05, -lanternHalfW], [xMid + 0.22, bottomY, bottomZ], 0.007, brassMat, { segments: 4, parent: roof });

      const tiltDegR = 24;
      const radR = tiltDegR * (Math.PI / 180);
      const vcYR = pivotY - (ventH / 2) * Math.cos(radR);
      const vcZR = lanternHalfW + (ventH / 2) * Math.sin(radR);

      createPart(`VentFrame_R_${b}`, ventFrameGeo, ironMat, {
        position: [xMid, vcYR, vcZR],
        rotation: [tiltDegR, 0, 0],
        parent: roof,
      });
      createPart(`VentGlass_R_${b}`, ventGlassGeo, glassMat, {
        position: [xMid, vcYR, vcZR],
        rotation: [tiltDegR, 0, 0],
        parent: roof,
      });

      const bottomYR = pivotY - ventH * Math.cos(radR);
      const bottomZR = lanternHalfW + ventH * Math.sin(radR);
      beamBetween(`VentStay_R1_${b}`, [xMid - 0.22, lanternSillY + 0.05, lanternHalfW], [xMid - 0.22, bottomYR, bottomZR], 0.007, brassMat, { segments: 4, parent: roof });
      beamBetween(`VentStay_R2_${b}`, [xMid + 0.22, lanternSillY + 0.05, lanternHalfW], [xMid + 0.22, bottomYR, bottomZR], 0.007, brassMat, { segments: 4, parent: roof });

    } else {
      const vcY = lanternSillY + lanternH / 2;
      createPart(`VentFrame_L_${b}`, closedFrameGeo, ironMat, {
        position: [xMid, vcY, -lanternHalfW],
        parent: roof,
      });
      createPart(`VentGlass_L_${b}`, ventGlassGeo, glassMat, {
        position: [xMid, vcY, -lanternHalfW],
        parent: roof,
      });
      createPart(`VentFrame_R_${b}`, closedFrameGeo, ironMat, {
        position: [xMid, vcY, lanternHalfW],
        parent: roof,
      });
      createPart(`VentGlass_R_${b}`, ventGlassGeo, glassMat, {
        position: [xMid, vcY, lanternHalfW],
        parent: roof,
      });
    }
  }

  // Lantern End Gables
  createPart('LanternEndGlass_Front', boxGeo(0.008, lanternH + lanternPitchH * 0.7, lanternW - 0.04), glassMat, {
    position: [halfL, lanternSillY + lanternH / 2 + lanternPitchH * 0.2, 0],
    parent: roof,
  });
  createPart('LanternEndGlass_Back', boxGeo(0.008, lanternH + lanternPitchH * 0.7, lanternW - 0.04), glassMat, {
    position: [-halfL, lanternSillY + lanternH / 2 + lanternPitchH * 0.2, 0],
    parent: roof,
  });
  createPart('LanternEndPost_F', boxGeo(0.03, lanternH + lanternPitchH, 0.03), ironMat, {
    position: [halfL, lanternSillY + (lanternH + lanternPitchH) / 2, 0],
    parent: roof,
  });
  createPart('LanternEndPost_B', boxGeo(0.03, lanternH + lanternPitchH, 0.03), ironMat, {
    position: [-halfL, lanternSillY + (lanternH + lanternPitchH) / 2, 0],
    parent: roof,
  });

  // ==========================================
  // 6. CAST-IRON CRESTING & FINIALS ALONG RIDGE
  // ==========================================
  const crestBaseY = lanternRidgeCapY + 0.03;
  createPart('CrestingBaseBar', boxGeo(length + 0.10, 0.02, 0.015), ironMat, {
    position: [0, crestBaseY, 0],
    parent: roof,
  });
  createPart('CrestingMidBar', boxGeo(length + 0.10, 0.015, 0.012), ironMat, {
    position: [0, crestBaseY + 0.09, 0],
    parent: roof,
  });

  // 17 ornate cresting modules (0.35m spacing)
  const crestPitch = 0.35;
  const crestNum = Math.floor(length / crestPitch);
  const crestRingGeo = torusGeo(0.035, 0.005, 3, 5);
  const crestSpikeGeo = coneGeo(0.015, 0.11, 4);
  const crestBeadGeo = sphereGeo(0.009, 3, 3);

  for (let c = 0; c <= crestNum; c++) {
    const x = -halfL + c * crestPitch;
    createPart(`CrestRing_${c}`, crestRingGeo, ironMat, {
      position: [x, crestBaseY + 0.045, 0],
      rotation: [0, 90, 0],
      parent: roof,
    });
    createPart(`CrestSpike_${c}`, crestSpikeGeo, ironMat, {
      position: [x, crestBaseY + 0.14, 0],
      rotation: [0, 45, 0],
      parent: roof,
    });
    createPart(`CrestBead_${c}`, crestBeadGeo, ironMat, {
      position: [x, crestBaseY + 0.09, 0],
      parent: roof,
    });
  }

  // Turned Victorian End Finials
  function makeRidgeFinial(name, xPos) {
    createPart(`${name}_BaseUrn`, cylinderGeo(0.032, 0.020, 0.08, 5), darkIronMat, {
      position: [xPos, crestBaseY + 0.04, 0],
      parent: roof,
    });
    createPart(`${name}_Orb`, sphereGeo(0.052, 5, 5), darkIronMat, {
      position: [xPos, crestBaseY + 0.12, 0],
      parent: roof,
    });
    createPart(`${name}_Girdle`, torusGeo(0.058, 0.010, 3, 6), darkIronMat, {
      position: [xPos, crestBaseY + 0.12, 0],
      rotation: [90, 0, 0],
      parent: roof,
    });
    createPart(`${name}_Spire`, coneGeo(0.022, 0.36, 4), darkIronMat, {
      position: [xPos, crestBaseY + 0.30, 0],
      parent: roof,
    });
  }
  makeRidgeFinial('Finial_Front', halfL);
  makeRidgeFinial('Finial_Back', -halfL);

  // ==========================================
  // 6. GLAZED GABLE SCREENS (BACK & FRONT)
  // ==========================================
  // Back Gable: Horizontal transom and mullions fitting elliptical vault
  createPart('GableTransom_Back', boxGeo(0.05, 0.05, archHalfW * 2), ironMat, {
    position: [-halfL, eaveH, 0],
    parent: root,
  });

  const backMullionsZ = [-1.20, -0.80, -0.40, 0.0, 0.40, 0.80, 1.20];
  for (let i = 0; i < backMullionsZ.length; i++) {
    const gz = backMullionsZ[i];
    createPart(`BackMullion_${i}`, boxGeo(0.035, eaveH - sillY, 0.035), ironMat, {
      position: [-halfL, sillY + (eaveH - sillY) / 2, gz],
      parent: root,
    });
  }

  // Back gable lower & upper glazing in 8 fitted bays
  const backBayCount = 8;
  const backBayW = (archHalfW * 2) / backBayCount; // ~0.427m
  for (let i = 0; i < backBayCount; i++) {
    const zPane = -archHalfW + (i + 0.5) * backBayW;
    createPart(`BackGlass_Low_${i}`, boxGeo(0.008, eaveH - sillY - 0.04, backBayW - 0.03), glassMat, {
      position: [-halfL, sillY + (eaveH - sillY) / 2, zPane],
      parent: root,
    });
    // Upper tympanum glass fitting smoothly under curved vault rib
    const zEdge = Math.abs(zPane) + backBayW * 0.45;
    const topY = archY(zEdge) - 0.03;
    const hTymp = Math.max(0.08, topY - eaveH);
    createPart(`BackGlass_Tymp_${i}`, boxGeo(0.008, hTymp, backBayW - 0.03), glassMat, {
      position: [-halfL, eaveH + hTymp / 2, zPane],
      parent: root,
    });
  }

  // Front Gable: Door Portal, Side Flanks, Transoms & Tympanum
  createPart('FrontTransom_L', boxGeo(0.05, 0.05, frontSideW), ironMat, {
    position: [halfL, eaveH, frontZ_L],
    parent: root,
  });
  createPart('FrontTransom_R', boxGeo(0.05, 0.05, frontSideW), ironMat, {
    position: [halfL, eaveH, frontZ_R],
    parent: root,
  });

  const flankPanes = [
    { name: 'L0', z: -1.45, w: 0.44 },
    { name: 'L1', z: -0.95, w: 0.44 },
    { name: 'R1', z: 0.95, w: 0.44 },
    { name: 'R0', z: 1.45, w: 0.44 },
  ];
  for (let i = 0; i < flankPanes.length; i++) {
    const fp = flankPanes[i];
    createPart(`FrontGlass_Low_${fp.name}`, boxGeo(0.008, eaveH - sillY - 0.04, fp.w - 0.03), glassMat, {
      position: [halfL, sillY + (eaveH - sillY) / 2, fp.z],
      parent: root,
    });
    const zEdge = Math.abs(fp.z) + fp.w * 0.45;
    const topY = archY(zEdge) - 0.03;
    const hTymp = Math.max(0.08, topY - eaveH);
    createPart(`FrontGlass_Tymp_${fp.name}`, boxGeo(0.008, hTymp, fp.w - 0.03), glassMat, {
      position: [halfL, eaveH + hTymp / 2, fp.z],
      parent: root,
    });
  }
  createPart('FrontMullion_L', boxGeo(0.04, eaveH - sillY, 0.044), ironMat, {
    position: [halfL, sillY + (eaveH - sillY) / 2, frontZ_L],
    parent: root,
  });
  createPart('FrontMullion_R', boxGeo(0.04, eaveH - sillY, 0.044), ironMat, {
    position: [halfL, sillY + (eaveH - sillY) / 2, frontZ_R],
    parent: root,
  });

  // Entrance Portal Jambs & Lintel
  const doorJambH = doorTransomH - 0.06;
  createPart('DoorJamb_L', boxGeo(0.06, doorJambH, 0.06), ironMat, {
    position: [halfL, 0.06 + doorJambH / 2, -doorW / 2],
    parent: root,
  });
  createPart('DoorJamb_R', boxGeo(0.06, doorJambH, 0.06), ironMat, {
    position: [halfL, 0.06 + doorJambH / 2, doorW / 2],
    parent: root,
  });
  createPart('DoorTransomBeam', boxGeo(0.06, 0.06, doorW + 0.06), ironMat, {
    position: [halfL, doorTransomH, 0],
    parent: root,
  });

  // Stone Threshold / Doorstep
  createPart('DoorThreshold', boxGeo(0.24, 0.06, doorW + 0.12), stoneMat, {
    position: [halfL + 0.08, 0.03, 0],
    parent: root,
  });

  // ==========================================
  // 7. ARCHED DOUBLE DOORS & FANLIGHT
  // ==========================================
  const leafW = doorLeafW;
  const leafMidH = doorJambH;
  const leafZ_L = -leafW / 2 - 0.015;
  const leafZ_R = leafW / 2 + 0.015;

  function makeDoorLeaf(side, zPos, handleZ) {
    createPart(`Door_Kick_${side}`, boxGeo(0.028, 0.74, leafW - 0.06), woodMat, {
      position: [halfL - 0.01, 0.06 + 0.37, zPos],
      parent: root,
    });
    createPart(`Door_Glass_${side}`, boxGeo(0.008, 1.04, leafW - 0.06), glassMat, {
      position: [halfL - 0.01, 0.94 + 0.52, zPos],
      parent: root,
    });
    createPart(`Door_Stile_O_${side}`, boxGeo(0.038, leafMidH, 0.038), woodMat, {
      position: [halfL - 0.01, 0.06 + leafMidH / 2, zPos + (side === 'L' ? -leafW / 2 + 0.02 : leafW / 2 - 0.02)],
      parent: root,
    });
    createPart(`Door_Stile_I_${side}`, boxGeo(0.038, leafMidH, 0.038), woodMat, {
      position: [halfL - 0.01, 0.06 + leafMidH / 2, zPos + (side === 'L' ? leafW / 2 - 0.02 : -leafW / 2 + 0.02)],
      parent: root,
    });
    createPart(`Door_Rail_Top_${side}`, boxGeo(0.038, 0.05, leafW - 0.04), woodMat, {
      position: [halfL - 0.01, 0.06 + leafMidH - 0.025, zPos],
      parent: root,
    });
    createPart(`Door_Rail_Mid_${side}`, boxGeo(0.038, 0.06, leafW - 0.04), woodMat, {
      position: [halfL - 0.01, 0.93, zPos],
      parent: root,
    });
    createPart(`Door_Rail_Bot_${side}`, boxGeo(0.038, 0.08, leafW - 0.04), woodMat, {
      position: [halfL - 0.01, 0.10, zPos],
      parent: root,
    });

    createPart(`Door_Handle_${side}`, sphereGeo(0.022, 5, 5), brassMat, {
      position: [halfL + 0.022, 0.96, handleZ],
      parent: root,
    });
    createPart(`Door_Plate_${side}`, boxGeo(0.008, 0.09, 0.024), brassMat, {
      position: [halfL + 0.012, 0.96, handleZ],
      parent: root,
    });
  }
  makeDoorLeaf('L', leafZ_L, -0.06);
  makeDoorLeaf('R', leafZ_R, 0.06);

  // Semicircular Fanlight Arch & Sunburst Tracery
  const fanRadius = doorW / 2;
  const fanPts = [];
  for (let i = 0; i <= 8; i++) {
    const th = (i / 8) * Math.PI;
    fanPts.push([halfL, doorTransomH + fanRadius * Math.sin(th), -fanRadius * Math.cos(th)]);
  }
  createPart('FanlightArchRing', curveToMesh(fanPts, 0.020, 8, 4), ironMat, { parent: root });

  const sunRayAngles = [30, 60, 90, 120, 150];
  for (let i = 0; i < sunRayAngles.length; i++) {
    const rad = sunRayAngles[i] * (Math.PI / 180);
    const endP = [halfL, doorTransomH + (fanRadius - 0.02) * Math.sin(rad), -(fanRadius - 0.02) * Math.cos(rad)];
    beamBetween(`FanRay_${i}`, [halfL, doorTransomH, 0], endP, 0.009, ironMat, { segments: 4, parent: root });
  }
  createPart('FanlightGlass', boxGeo(0.008, fanRadius, doorW - 0.04), glassMat, {
    position: [halfL, doorTransomH + fanRadius / 2, 0],
    parent: root,
  });

  // Central Tympanum above Fanlight Arch divided into 4 vertical fitted panes
  const fanTopY = doorTransomH + fanRadius;
  const centralTympW = doorW / 4; // ~0.325m
  for (let i = 0; i < 4; i++) {
    const cpZ = -doorW / 2 + (i + 0.5) * centralTympW;
    const zEdge = Math.abs(cpZ) + centralTympW * 0.45;
    const topY = archY(zEdge) - 0.03;
    const hCentral = Math.max(0.10, topY - fanTopY);
    createPart(`DoorTympGlass_${i}`, boxGeo(0.008, hCentral, centralTympW - 0.03), glassMat, {
      position: [halfL, fanTopY + hCentral / 2, cpZ],
      parent: root,
    });
  }
  // Central tympanum mullions
  for (let m = 1; m < 4; m++) {
    const mz = -doorW / 2 + m * centralTympW;
    const topY = archY(mz) - 0.03;
    const hm = topY - fanTopY;
    createPart(`DoorTympMullion_${m}`, boxGeo(0.03, hm, 0.03), ironMat, {
      position: [halfL, fanTopY + hm / 2, mz],
      parent: root,
    });
  }

  // ==========================================
  // 8. STAGING BENCHES & HOT-WATER HEATING PIPES
  // ==========================================
  const benchL = 4.8;
  const benchW = 0.72;
  const benchH = 0.85;
  const legXPositions = [-2.1, -0.7, 0.7, 2.1];
  const floorTopY = 0.10; // floor surface
  const legH = benchH - floorTopY; // 0.75m

  function makeBench(side, benchZ) {
    for (let i = 0; i < legXPositions.length; i++) {
      const lx = legXPositions[i];
      // Legs sit firmly atop the interior floor (overlapping floor by 0.01m)
      createPart(`BenchLeg_O_${side}_${i}`, boxGeo(0.035, legH + 0.01, 0.035), darkIronMat, {
        position: [lx, floorTopY + legH / 2 - 0.005, benchZ + (side === 'L' ? -benchW / 2 + 0.03 : benchW / 2 - 0.03)],
        parent: root,
      });
      createPart(`BenchLeg_I_${side}_${i}`, boxGeo(0.035, legH + 0.01, 0.035), darkIronMat, {
        position: [lx, floorTopY + legH / 2 - 0.005, benchZ + (side === 'L' ? benchW / 2 - 0.03 : -benchW / 2 + 0.03)],
        parent: root,
      });
      // Lower crossbar supporting lower shelf slats
      createPart(`BenchTie_Low_${side}_${i}`, boxGeo(0.035, 0.025, benchW - 0.02), darkIronMat, {
        position: [lx, 0.27, benchZ],
        parent: root,
      });
      // Upper crossbar supporting tabletop slats
      createPart(`BenchTie_Top_${side}_${i}`, boxGeo(0.035, 0.025, benchW - 0.02), darkIronMat, {
        position: [lx, benchH - 0.02, benchZ],
        parent: root,
      });
    }

    // Top slats resting on upper crossbars
    for (let s = 0; s < 4; s++) {
      const sz = benchZ - 0.27 + s * 0.18;
      createPart(`BenchSlat_${side}_${s}`, boxGeo(benchL, 0.024, 0.15), woodMat, {
        position: [0, benchH, sz],
        parent: root,
      });
    }

    // Lower shelf slats resting on lower crossbars
    for (let s = 0; s < 3; s++) {
      const sz = benchZ - 0.22 + s * 0.22;
      createPart(`BenchLowSlat_${side}_${s}`, boxGeo(benchL, 0.018, 0.18), woodMat, {
        position: [0, 0.29, sz],
        parent: root,
      });
    }

    // Retaining lips around bench perimeter
    createPart(`BenchLip_${side}`, boxGeo(benchL + 0.02, 0.04, 0.02), woodMat, {
      position: [0, benchH + 0.02, benchZ + (side === 'L' ? benchW / 2 : -benchW / 2)],
      parent: root,
    });
  }

  makeBench('L', -1.22);
  makeBench('R', 1.22);

  // Hot-water cast iron heating pipes along plinth perimeter
  createPart('HeatPipe_L_Low', cylinderXGeo(0.038, 0.038, 5.2, 5), darkIronMat, {
    position: [0, 0.20, -1.55],
    parent: root,
  });
  createPart('HeatPipe_L_High', cylinderXGeo(0.038, 0.038, 5.2, 5), darkIronMat, {
    position: [0, 0.35, -1.55],
    parent: root,
  });
  createPart('HeatPipe_R_Low', cylinderXGeo(0.038, 0.038, 5.2, 5), darkIronMat, {
    position: [0, 0.20, 1.55],
    parent: root,
  });
  createPart('HeatPipe_R_High', cylinderXGeo(0.038, 0.038, 5.2, 5), darkIronMat, {
    position: [0, 0.35, 1.55],
    parent: root,
  });

  // ==========================================
  // 9. POTTED SPECIMEN PLANTS ON BENCHES
  // ==========================================
  const potBaseGeo = cylinderGeo(0.075, 0.05, 0.13, 5);
  const potRimGeo = cylinderGeo(0.082, 0.082, 0.024, 5);
  const potSoilGeo = cylinderGeo(0.072, 0.072, 0.012, 5);

  const plantPositions = [
    { x: -2.0, z: -1.26, type: 'fern' },
    { x: -1.35, z: -1.18, type: 'geranium' },
    { x: -0.7, z: -1.26, type: 'palm' },
    { x: 0.0, z: -1.18, type: 'lily' },
    { x: 0.7, z: -1.26, type: 'fern' },
    { x: 1.35, z: -1.18, type: 'geranium' },
    { x: 2.0, z: -1.26, type: 'palm' },
    { x: -2.0, z: 1.26, type: 'palm' },
    { x: -1.35, z: 1.18, type: 'lily' },
    { x: -0.7, z: 1.26, type: 'fern' },
    { x: 0.0, z: 1.18, type: 'geranium' },
    { x: 0.7, z: 1.26, type: 'palm' },
    { x: 1.35, z: 1.18, type: 'lily' },
    { x: 2.0, z: 1.26, type: 'fern' },
  ];

  for (let i = 0; i < plantPositions.length; i++) {
    const p = plantPositions[i];
    const potY = benchH + 0.012;
    createPart(`Pot_Base_${i}`, potBaseGeo, potMat, {
      position: [p.x, potY + 0.065, p.z],
      parent: root,
    });
    createPart(`Pot_Rim_${i}`, potRimGeo, potMat, {
      position: [p.x, potY + 0.125, p.z],
      parent: root,
    });
    createPart(`Pot_Soil_${i}`, potSoilGeo, compostMat, {
      position: [p.x, potY + 0.12, p.z],
      parent: root,
    });

    const plantBaseY = potY + 0.13;
    if (p.type === 'fern') {
      for (let f = 0; f < 5; f++) {
        const fa = (f / 5) * 360;
        createPart(`Fern_${i}_${f}`, boxGeo(0.04, 0.005, 0.22), plantMat, {
          position: [p.x, plantBaseY + 0.05, p.z],
          rotation: [22, fa, 0],
          parent: root,
        });
      }
    } else if (p.type === 'palm') {
      createPart(`Palm_Stem_${i}`, cylinderGeo(0.012, 0.016, 0.20, 4), plantMat, {
        position: [p.x, plantBaseY + 0.10, p.z],
        parent: root,
      });
      for (let l = 0; l < 4; l++) {
        const la = l * 90 + 45;
        createPart(`Palm_Leaf_${i}_${l}`, boxGeo(0.10, 0.005, 0.16), darkLeafMat, {
          position: [p.x, plantBaseY + 0.20, p.z],
          rotation: [30, la, 0],
          parent: root,
        });
      }
    } else if (p.type === 'geranium') {
      createPart(`Geran_Dome_${i}`, sphereGeo(0.075, 4, 3), plantMat, {
        position: [p.x, plantBaseY + 0.06, p.z],
        parent: root,
      });
      for (let g = 0; g < 3; g++) {
        const ga = (g / 3) * Math.PI * 2;
        createPart(`Geran_Bloom_${i}_${g}`, sphereGeo(0.028, 3, 3), flowerRedMat, {
          position: [p.x + 0.05 * Math.cos(ga), plantBaseY + 0.12, p.z + 0.05 * Math.sin(ga)],
          parent: root,
        });
      }
    } else if (p.type === 'lily') {
      for (let l = 0; l < 4; l++) {
        const la = l * 90;
        createPart(`Lily_Leaf_${i}_${l}`, boxGeo(0.045, 0.005, 0.18), plantMat, {
          position: [p.x, plantBaseY + 0.04, p.z],
          rotation: [25, la, 0],
          parent: root,
        });
      }
      createPart(`Lily_Stem_${i}`, cylinderGeo(0.006, 0.008, 0.12, 4), plantMat, {
        position: [p.x, plantBaseY + 0.06, p.z],
        parent: root,
      });
      createPart(`Lily_Flower_${i}`, coneGeo(0.022, 0.07, 4), flowerWhiteMat, {
        position: [p.x, plantBaseY + 0.13, p.z],
        parent: root,
      });
    }
  }

  // ==========================================
  // 10. HANGING BASKETS (CONNECTED TO TIE RODS)
  // ==========================================
  const basketXs = [-1.0, 0.0, 1.0];
  const tieRodY = eaveH + 0.12; // exactly 2.34m
  const basketY = 1.82;

  for (let b = 0; b < basketXs.length; b++) {
    const bx = basketXs[b];
    // Vertical suspension chain directly connecting to TieRod at tieRodY
    beamBetween(`BasketChain_${b}`, [bx, basketY, 0], [bx, tieRodY, 0], 0.006, darkIronMat, { segments: 4, parent: root });

    createPart(`BasketBody_${b}`, coneGeo(0.15, 0.12, 5), darkIronMat, {
      position: [bx, basketY - 0.06, 0],
      rotation: [180, 0, 0],
      parent: root,
    });
    createPart(`BasketRim_${b}`, torusGeo(0.15, 0.008, 3, 6), darkIronMat, {
      position: [bx, basketY, 0],
      rotation: [90, 0, 0],
      parent: root,
    });
    createPart(`BasketMoss_${b}`, sphereGeo(0.13, 4, 3), compostMat, {
      position: [bx, basketY - 0.01, 0],
      parent: root,
    });

    // Trailing ivy tendrils
    for (let t = 0; t < 4; t++) {
      const ta = (t / 4) * Math.PI * 2;
      createPart(`BasketIvy_${b}_${t}`, boxGeo(0.022, 0.16, 0.008), plantMat, {
        position: [bx + 0.13 * Math.cos(ta), basketY - 0.10, 0.13 * Math.sin(ta)],
        rotation: [15 * Math.sin(ta), (t * 90), 15 * Math.cos(ta)],
        parent: root,
      });
    }
  }

  // ==========================================
  // 11. GARDENER'S ACCESSORIES
  // ==========================================
  // Vintage brass watering can in aisle
  const canX = 2.1;
  const canZ = 0.38;
  createPart('WateringCan_Body', cylinderGeo(0.08, 0.08, 0.16, 5), brassMat, {
    position: [canX, 0.08, canZ],
    parent: root,
  });
  beamBetween('WateringCan_Spout', [canX, 0.04, canZ], [canX + 0.16, 0.18, canZ], 0.010, brassMat, { segments: 4, parent: root });
  createPart('WateringCan_Rose', cylinderGeo(0.024, 0.012, 0.020, 4), brassMat, {
    position: [canX + 0.17, 0.19, canZ],
    rotation: [0, 0, -45],
    parent: root,
  });
  createPart('WateringCan_Handle', torusGeo(0.065, 0.007, 3, 6), brassMat, {
    position: [canX, 0.16, canZ],
    rotation: [0, 90, 0],
    parent: root,
  });

  return root;
}
