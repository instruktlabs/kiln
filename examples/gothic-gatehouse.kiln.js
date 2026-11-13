// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'GothicGatehouse', category: 'architecture', role: 'building' };

function build() {
  const root = createRoot('GothicGatehouse');

  // ==========================================
  // MATERIALS (High quality PBR palette, 5 materials)
  // ==========================================
  const stoneAshlar = gameMaterial(0x8e887d, { roughness: 0.88 }); // Main masonry
  const stoneDressing = gameMaterial(0x6e685f, { roughness: 0.84 }); // Trim, voussoirs, corbels, copings
  const stoneDark = gameMaterial(0x32302c, { roughness: 0.95 }); // Arrow slits, murder holes, reveals
  const oakWood = gameMaterial(0x56402a, { roughness: 0.78 }); // Drawbridge planks, cleats, gates
  const wroughtIron = gameMaterial(0x242426, { roughness: 0.52, metalness: 0.85 }); // Chains, portcullis, spikes, straps

  // ==========================================
  // DIMENSIONS & SPATIAL ANCHORS (+X forward, +Y up, +Z right)
  // ==========================================
  const towerRadius = 2.4;
  const towerHeight = 12.6;
  const towerX = 0.6; // Towers project forward for flanking fire
  const towerZ = 3.7; // +/- 3.7 along Z

  const wallDepth = 4.4; // Extends from X = -2.2 to X = +2.2
  const wallWidth = 4.6; // Spans between towers from Z = -2.3 to Z = +2.3
  const wallHeight = 8.8; // Central curtain wall height
  const passageFloorY = 0.7; // Raised ground/passage level above ditch

  // ==========================================
  // 1. FOUNDATIONS & SUBSTRUCTURE (Sitting on Y = 0)
  // ==========================================
  // Central gatehouse foundation block
  createPart('GatehouseFoundation', boxGeo(wallDepth + 0.3, passageFloorY, wallWidth + 0.2), stoneDressing, {
    position: [0, passageFloorY / 2, 0],
    parent: root
  });

  // Flagstone floor inside passage
  createPart('PassageFloor', boxGeo(wallDepth + 0.2, 0.1, 2.4), stoneAshlar, {
    position: [0, passageFloorY + 0.05, 0],
    parent: root
  });

  // ==========================================
  // 2. CENTRAL GATEHOUSE BLOCK & WALLS
  // ==========================================
  // Left and Right jamb walls
  const jambThickZ = 1.1;
  createPart('GateJambL', boxGeo(wallDepth, 3.2, jambThickZ), stoneAshlar, {
    position: [0, passageFloorY + 1.6, -1.75],
    parent: root
  });
  createPart('GateJambR', boxGeo(wallDepth, 3.2, jambThickZ), stoneAshlar, {
    position: [0, passageFloorY + 1.6, 1.75],
    parent: root
  });

  // Dressed stone jamb quoins (front entrance)
  for (let y = passageFloorY + 0.3; y <= passageFloorY + 3.2; y += 0.6) {
    createPart('JambQuoinL_' + y.toFixed(1), boxGeo(0.5, 0.26, 0.22), stoneDressing, {
      position: [wallDepth / 2 + 0.02, y, -1.2],
      parent: root
    });
    createPart('JambQuoinR_' + y.toFixed(1), boxGeo(0.5, 0.26, 0.22), stoneDressing, {
      position: [wallDepth / 2 + 0.02, y, 1.2],
      parent: root
    });
  }

  // Upper gatehouse wall (above arch springing)
  const upperWallH = wallHeight - (passageFloorY + 3.2);
  createPart('WallUpper', boxGeo(wallDepth, upperWallH, wallWidth), stoneAshlar, {
    position: [0, passageFloorY + 3.2 + upperWallH / 2, 0],
    parent: root
  });

  // Front spandrel infill above arch
  createPart('FrontSpandrel', boxGeo(0.4, 2.2, 2.5), stoneAshlar, {
    position: [wallDepth / 2 - 0.2, passageFloorY + 4.6, 0],
    parent: root
  });

  // Rear wall opening spandrel
  createPart('RearSpandrel', boxGeo(0.4, 2.2, 2.5), stoneAshlar, {
    position: [-wallDepth / 2 + 0.2, passageFloorY + 4.6, 0],
    parent: root
  });

  // Horizontal string-course mouldings on central block
  createPart('CentStringCourse1', boxGeo(wallDepth + 0.15, 0.18, wallWidth + 0.1), stoneDressing, {
    position: [0, passageFloorY + 3.3, 0],
    parent: root
  });
  createPart('CentStringCourse2', boxGeo(wallDepth + 0.15, 0.18, wallWidth + 0.1), stoneDressing, {
    position: [0, wallHeight - 0.1, 0],
    parent: root
  });

  // ==========================================
  // 3. POINTED GOTHIC ARCHWAY & PORTAL
  // ==========================================
  // Equilateral pointed arch:
  // Springing points at Z = +/-1.2, Y = passageFloorY + 3.2 = 3.9
  // Apex at Z = 0, Y = 3.9 + 2.08 = 5.98
  const archSpringY = passageFloorY + 3.2;
  const archSpan = 2.4;
  const archR = archSpan;
  const voussoirsPerSide = 7;

  // Outer arch voussoirs (Front portal & Rear portal)
  for (let side = -1; side <= 1; side += 2) {
    const centerZ = side * (archSpan / 2);
    for (let i = 0; i < voussoirsPerSide; i++) {
      const theta = ((i + 0.5) / voussoirsPerSide) * (Math.PI / 3);
      const zLocal = -side * archR * Math.cos(theta);
      const yLocal = archR * Math.sin(theta);
      const vz = centerZ + zLocal;
      const vy = archSpringY + yLocal;
      const rotX = side * (theta * (180 / Math.PI) - 90);

      createPart('VoussoirF_' + side + '_' + i, boxGeo(0.45, 0.32, 0.26), stoneDressing, {
        position: [wallDepth / 2 + 0.05, vy, vz],
        rotation: [rotX, 0, 0],
        parent: root
      });
      createPart('VoussoirB_' + side + '_' + i, boxGeo(0.45, 0.32, 0.26), stoneDressing, {
        position: [-wallDepth / 2 - 0.05, vy, vz],
        rotation: [rotX, 0, 0],
        parent: root
      });
    }
  }

  // Pointed arch hood moulding (dripstone) above front arch
  for (let side = -1; side <= 1; side += 2) {
    const centerZ = side * (archSpan / 2);
    for (let i = 0; i < 5; i++) {
      const theta = ((i + 0.5) / 5) * (Math.PI / 3);
      const vz = centerZ - side * (archR + 0.2) * Math.cos(theta);
      const vy = archSpringY + (archR + 0.2) * Math.sin(theta);
      const rotX = side * (theta * (180 / Math.PI) - 90);

      createPart('HoodMould_' + side + '_' + i, boxGeo(0.18, 0.15, 0.2), stoneDressing, {
        position: [wallDepth / 2 + 0.16, vy, vz],
        rotation: [rotX, 0, 0],
        parent: root
      });
    }
  }

  // Vault ribs inside the gate passage ceiling
  for (let side = -1; side <= 1; side += 2) {
    const centerZ = side * (archSpan / 2);
    for (let i = 0; i < 4; i++) {
      const theta = ((i + 0.5) / 4) * (Math.PI / 3);
      const vz = centerZ - side * (archR - 0.05) * Math.cos(theta);
      const vy = archSpringY + (archR - 0.05) * Math.sin(theta);
      const rotX = side * (theta * (180 / Math.PI) - 90);

      createPart('VaultRib_' + side + '_' + i, boxGeo(wallDepth - 0.6, 0.22, 0.35), stoneAshlar, {
        position: [0, vy, vz],
        rotation: [rotX, 0, 0],
        parent: root
      });
    }
  }

  // ==========================================
  // 4. PORTCULLIS IN RECESSED GROOVES (RAISED)
  // ==========================================
  const portX = 0.9;
  // Left and right vertical stone grooves in the arch jambs
  createPart('PortGrooveL', boxGeo(0.2, 3.8, 0.14), stoneDark, {
    position: [portX, passageFloorY + 2.0, -1.18],
    parent: root
  });
  createPart('PortGrooveR', boxGeo(0.2, 3.8, 0.14), stoneDark, {
    position: [portX, passageFloorY + 2.0, 1.18],
    parent: root
  });

  // Raised portcullis frame (bottom sits at Y = passageFloorY + 2.4 = 3.1)
  const portBaseY = passageFloorY + 2.4;
  const portHeight = 2.6;
  const portHalfW = 1.05;

  // Vertical wooden stiles with iron shoes and sharp spikes
  const numPortV = 7;
  for (let i = 0; i < numPortV; i++) {
    const pz = -portHalfW + (i / (numPortV - 1)) * (portHalfW * 2);

    createPart('PortBarV_' + i, boxGeo(0.08, portHeight, 0.08), oakWood, {
      position: [portX, portBaseY + portHeight / 2, pz],
      parent: root
    });

    createPart('PortSpike_' + i, coneYGeo(0.05, 0.35, 4), wroughtIron, {
      position: [portX, portBaseY - 0.16, pz],
      rotation: [180, 0, 0], // Pointing down
      parent: root
    });
  }

  // Horizontal oak bars & iron reinforcement straps
  const numPortH = 5;
  for (let j = 0; j < numPortH; j++) {
    const py = portBaseY + 0.3 + j * 0.52;
    createPart('PortBarH_' + j, boxGeo(0.1, 0.08, portHalfW * 2 + 0.1), oakWood, {
      position: [portX, py, 0],
      parent: root
    });
    createPart('PortBandH_' + j, boxGeo(0.11, 0.03, portHalfW * 2 + 0.1), wroughtIron, {
      position: [portX, py, 0],
      parent: root
    });
  }

  // Top suspension shackles
  createPart('PortShackleL', torusGeo(0.08, 0.02, 5, 8), wroughtIron, {
    position: [portX, portBaseY + portHeight + 0.05, -0.6],
    rotation: [0, 90, 0],
    parent: root
  });
  createPart('PortShackleR', torusGeo(0.08, 0.02, 5, 8), wroughtIron, {
    position: [portX, portBaseY + portHeight + 0.05, 0.6],
    rotation: [0, 90, 0],
    parent: root
  });

  // Inner heavy oak gate doors (swung OPEN against jamb walls, welcoming visitors across lowered drawbridge)
  createPart('InnerGatePostL', boxGeo(0.2, 3.2, 0.2), oakWood, {
    position: [-0.6, passageFloorY + 1.6, -1.1],
    parent: root
  });
  createPart('InnerGatePostR', boxGeo(0.2, 3.2, 0.2), oakWood, {
    position: [-0.6, passageFloorY + 1.6, 1.1],
    parent: root
  });
  // Gate leaves folded open flat against passage walls
  createPart('GateLeafL', boxGeo(0.95, 2.9, 0.1), oakWood, {
    position: [-0.15, passageFloorY + 1.5, -1.05],
    parent: root
  });
  createPart('GateLeafR', boxGeo(0.95, 2.9, 0.1), oakWood, {
    position: [-0.15, passageFloorY + 1.5, 1.05],
    parent: root
  });
  // Iron strap hinges on open gates
  for (let gy = passageFloorY + 0.6; gy <= passageFloorY + 2.5; gy += 1.4) {
    createPart('GateHingeL_' + gy.toFixed(1), boxGeo(0.8, 0.08, 0.12), wroughtIron, {
      position: [-0.15, gy, -1.03],
      parent: root
    });
    createPart('GateHingeR_' + gy.toFixed(1), boxGeo(0.8, 0.08, 0.12), wroughtIron, {
      position: [-0.15, gy, 1.03],
      parent: root
    });
  }

  // ==========================================
  // 5. UPPER GUARD ROOM WINDOWS (Gothic Tracery)
  // ==========================================
  const winY = passageFloorY + 5.6;
  createPart('WinRecessF', boxGeo(0.3, 1.7, 1.2), stoneDark, {
    position: [wallDepth / 2 - 0.05, winY, 0],
    parent: root
  });
  createPart('WinSillF', boxGeo(0.45, 0.16, 1.4), stoneDressing, {
    position: [wallDepth / 2 + 0.05, winY - 0.9, 0],
    parent: root
  });
  createPart('WinMullionF', boxGeo(0.35, 1.5, 0.12), stoneDressing, {
    position: [wallDepth / 2 + 0.02, winY - 0.05, 0],
    parent: root
  });
  createPart('WinArchL_F', boxGeo(0.32, 0.12, 0.45), stoneDressing, {
    position: [wallDepth / 2 + 0.02, winY + 0.72, -0.26],
    rotation: [-25, 0, 0],
    parent: root
  });
  createPart('WinArchR_F', boxGeo(0.32, 0.12, 0.45), stoneDressing, {
    position: [wallDepth / 2 + 0.02, winY + 0.72, 0.26],
    rotation: [25, 0, 0],
    parent: root
  });

  // Rear central window
  createPart('WinRecessB', boxGeo(0.3, 1.7, 1.2), stoneDark, {
    position: [-wallDepth / 2 + 0.05, winY, 0],
    parent: root
  });
  createPart('WinSillB', boxGeo(0.45, 0.16, 1.4), stoneDressing, {
    position: [-wallDepth / 2 - 0.05, winY - 0.9, 0],
    parent: root
  });
  createPart('WinMullionB', boxGeo(0.35, 1.5, 0.12), stoneDressing, {
    position: [-wallDepth / 2 - 0.02, winY - 0.05, 0],
    parent: root
  });

  // ==========================================
  // 6. TWIN DRUM TOWERS (Mass, Batters, Storeys)
  // ==========================================
  [-towerZ, towerZ].forEach((tz, tIdx) => {
    const side = tz < 0 ? 'L' : 'R';
    const sideSign = tz < 0 ? -1 : 1;

    // A. Battered plinth / talus foundation (Y = 0 to 2.2)
    createPart('TowerPlinth_' + side, taperConeGeo(towerRadius + 0.65, towerRadius + 0.1, 2.2, 'y', 20), stoneDressing, {
      position: [towerX, 1.1, tz],
      parent: root
    });
    // Plinth drip mould
    createPart('PlinthMould_' + side, cylinderGeo(towerRadius + 0.16, towerRadius + 0.16, 0.2, 20), stoneDressing, {
      position: [towerX, 2.2, tz],
      parent: root
    });

    // B. Lower Tower Drum (Stage 1: Y = 2.2 to 6.2)
    createPart('TowerDrumLower_' + side, cylinderGeo(towerRadius, towerRadius, 4.0, 20), stoneAshlar, {
      position: [towerX, 4.2, tz],
      parent: root
    });

    // Mid-height string course belt
    createPart('TowerBeltCourse_' + side, cylinderGeo(towerRadius + 0.14, towerRadius + 0.14, 0.28, 20), stoneDressing, {
      position: [towerX, 6.2, tz],
      parent: root
    });

    // C. Upper Tower Drum (Stage 2: Y = 6.2 to 11.2)
    createPart('TowerDrumUpper_' + side, cylinderGeo(towerRadius, towerRadius, 5.0, 20), stoneAshlar, {
      position: [towerX, 8.7, tz],
      parent: root
    });

    // D. Cornice belt below machicolation corbels
    createPart('TowerSubCorbelBelt_' + side, cylinderGeo(towerRadius + 0.08, towerRadius + 0.08, 0.25, 20), stoneDressing, {
      position: [towerX, 11.2, tz],
      parent: root
    });

    // E. Machicolations: Stepped corbel brackets around the drum tower
    const numTowerCorbels = 14;
    const corbelBaseY = 11.35;
    for (let c = 0; c < numTowerCorbels; c++) {
      const angle = (c / numTowerCorbels) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const rotY = -(angle * 180) / Math.PI;

      // Triple-stepped stone corbel bracket
      const r1 = towerRadius + 0.12;
      createPart('Corbel1_' + side + '_' + c, boxGeo(0.24, 0.24, 0.22), stoneDressing, {
        position: [towerX + cosA * r1, corbelBaseY + 0.12, tz + sinA * r1],
        rotation: [0, rotY, 0],
        parent: root
      });
      const r2 = towerRadius + 0.26;
      createPart('Corbel2_' + side + '_' + c, boxGeo(0.28, 0.24, 0.24), stoneDressing, {
        position: [towerX + cosA * r2, corbelBaseY + 0.36, tz + sinA * r2],
        rotation: [0, rotY, 0],
        parent: root
      });
      const r3 = towerRadius + 0.42;
      createPart('Corbel3_' + side + '_' + c, boxGeo(0.34, 0.26, 0.26), stoneDressing, {
        position: [towerX + cosA * r3, corbelBaseY + 0.61, tz + sinA * r3],
        rotation: [0, rotY, 0],
        parent: root
      });

      // Recessed murder hole chute between corbels
      const midAngle = angle + (Math.PI / numTowerCorbels);
      const midCos = Math.cos(midAngle);
      const midSin = Math.sin(midAngle);
      createPart('ChuteHole_' + side + '_' + c, boxGeo(0.2, 0.08, 0.2), stoneDark, {
        position: [towerX + midCos * (towerRadius + 0.35), corbelBaseY + 0.72, tz + midSin * (towerRadius + 0.35)],
        rotation: [0, -(midAngle * 180) / Math.PI, 0],
        parent: root
      });
    }

    // Projecting parapet floor ring supported by corbels
    createPart('TowerGalleryRing_' + side, cylinderGeo(towerRadius + 0.58, towerRadius + 0.58, 0.32, 20), stoneDressing, {
      position: [towerX, 12.18, tz],
      parent: root
    });

    // Gallery wall walk floor
    createPart('TowerWalkFloor_' + side, cylinderGeo(towerRadius + 0.35, towerRadius + 0.35, 0.05, 20), stoneAshlar, {
      position: [towerX, 12.35, tz],
      parent: root
    });

    // F. Crenellated Parapet (Merlons and Coping Caps)
    const numMerlons = 10;
    const parapetY = 12.35;
    for (let m = 0; m < numMerlons; m++) {
      const angle = (m / numMerlons) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const rotY = -(angle * 180) / Math.PI;
      const mRad = towerRadius + 0.48;

      createPart('Merlon_' + side + '_' + m, boxGeo(0.32, 1.05, 0.85), stoneAshlar, {
        position: [towerX + cosA * mRad, parapetY + 0.52, tz + sinA * mRad],
        rotation: [0, rotY, 0],
        parent: root
      });

      createPart('MerlonCap_' + side + '_' + m, boxGeo(0.38, 0.14, 0.9), stoneDressing, {
        position: [towerX + cosA * mRad, parapetY + 1.11, tz + sinA * mRad],
        rotation: [0, rotY, 0],
        parent: root
      });

      if (cosA > -0.2) {
        createPart('MerlonSlit_' + side + '_' + m, boxGeo(0.34, 0.55, 0.08), stoneDark, {
          position: [towerX + cosA * mRad, parapetY + 0.55, tz + sinA * mRad],
          rotation: [0, rotY, 0],
          parent: root
        });
      }
    }

    // Doorway from wall-walk into tower chamber
    createPart('TowerDoorway_' + side, boxGeo(0.3, 1.8, 0.75), stoneDark, {
      position: [towerX - 0.8, wallHeight + 1.0, tz - sideSign * (towerRadius - 0.4)],
      rotation: [0, sideSign * 45, 0],
      parent: root
    });

    // G. Arrow Loops in Tower Faces (3 Storeys of authentic cruciform balistraria)
    // Tier 1
    const loopAnglesTier1 = [10, 45, -25];
    loopAnglesTier1.forEach((deg, lIdx) => {
      const rad = (deg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad) * sideSign;
      const lx = towerX + cosA * (towerRadius + 0.02);
      const lz = tz + sinA * (towerRadius + 0.02);
      const rotY = -deg * sideSign;
      const ly = 3.6;

      createPart('LoopSurround1_' + side + '_' + lIdx, boxGeo(0.12, 1.5, 0.45), stoneDressing, {
        position: [lx, ly, lz],
        rotation: [0, rotY, 0],
        parent: root
      });
      createPart('LoopV1_' + side + '_' + lIdx, boxGeo(0.14, 1.25, 0.09), stoneDark, {
        position: [lx + 0.012 * cosA, ly, lz + 0.012 * sinA],
        rotation: [0, rotY, 0],
        parent: root
      });
      createPart('LoopH1_' + side + '_' + lIdx, boxGeo(0.14, 0.09, 0.32), stoneDark, {
        position: [lx + 0.012 * cosA, ly + 0.2, lz + 0.012 * sinA],
        rotation: [0, rotY, 0],
        parent: root
      });
    });

    // Tier 2
    const loopAnglesTier2 = [0, 35, 70, -35];
    loopAnglesTier2.forEach((deg, lIdx) => {
      const rad = (deg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad) * sideSign;
      const lx = towerX + cosA * (towerRadius + 0.02);
      const lz = tz + sinA * (towerRadius + 0.02);
      const rotY = -deg * sideSign;
      const ly = 8.0;

      createPart('LoopSurround2_' + side + '_' + lIdx, boxGeo(0.12, 1.5, 0.45), stoneDressing, {
        position: [lx, ly, lz],
        rotation: [0, rotY, 0],
        parent: root
      });
      createPart('LoopV2_' + side + '_' + lIdx, boxGeo(0.14, 1.25, 0.09), stoneDark, {
        position: [lx + 0.012 * cosA, ly, lz + 0.012 * sinA],
        rotation: [0, rotY, 0],
        parent: root
      });
      createPart('LoopH2_' + side + '_' + lIdx, boxGeo(0.14, 0.09, 0.32), stoneDark, {
        position: [lx + 0.012 * cosA, ly + 0.2, lz + 0.012 * sinA],
        rotation: [0, rotY, 0],
        parent: root
      });
    });

    // Tier 3
    const loopAnglesTier3 = [15, 55, -20];
    loopAnglesTier3.forEach((deg, lIdx) => {
      const rad = (deg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad) * sideSign;
      const lx = towerX + cosA * (towerRadius + 0.02);
      const lz = tz + sinA * (towerRadius + 0.02);
      const rotY = -deg * sideSign;
      const ly = 10.3;

      createPart('LoopV3_' + side + '_' + lIdx, boxGeo(0.12, 1.1, 0.08), stoneDark, {
        position: [lx, ly, lz],
        rotation: [0, rotY, 0],
        parent: root
      });
    });
  });

  // Watch turret / Cap-house on Right Tower
  createPart('TurretDrum', cylinderGeo(1.0, 1.0, 2.2, 16), stoneAshlar, {
    position: [towerX + 0.6, towerHeight + 0.7, towerZ + 0.6],
    parent: root
  });
  createPart('TurretConicalRoof', coneGeo(1.2, 1.4, 16), stoneDressing, {
    position: [towerX + 0.6, towerHeight + 2.4, towerZ + 0.6],
    parent: root
  });
  createPart('TurretFinial', cylinderGeo(0.04, 0.04, 0.6, 6), wroughtIron, {
    position: [towerX + 0.6, towerHeight + 3.3, towerZ + 0.6],
    parent: root
  });

  // ==========================================
  // 7. CENTRAL MACHICOLATIONS & PARAPET
  // ==========================================
  const centCorbelY = wallHeight;

  // Corbel table across front and rear central walls
  const corbelZPositions = [-1.8, -1.2, -0.6, 0.0, 0.6, 1.2, 1.8];
  corbelZPositions.forEach((cz, cIdx) => {
    // Front corbel brackets
    createPart('CentCorbel1_F_' + cIdx, boxGeo(0.24, 0.22, 0.22), stoneDressing, {
      position: [wallDepth / 2 + 0.12, centCorbelY + 0.11, cz],
      parent: root
    });
    createPart('CentCorbel2_F_' + cIdx, boxGeo(0.38, 0.22, 0.25), stoneDressing, {
      position: [wallDepth / 2 + 0.25, centCorbelY + 0.33, cz],
      parent: root
    });
    createPart('CentCorbel3_F_' + cIdx, boxGeo(0.52, 0.24, 0.28), stoneDressing, {
      position: [wallDepth / 2 + 0.38, centCorbelY + 0.56, cz],
      parent: root
    });

    // Rear corbel brackets
    createPart('CentCorbel1_B_' + cIdx, boxGeo(0.24, 0.22, 0.22), stoneDressing, {
      position: [-wallDepth / 2 - 0.12, centCorbelY + 0.11, cz],
      parent: root
    });
    createPart('CentCorbel2_B_' + cIdx, boxGeo(0.38, 0.22, 0.25), stoneDressing, {
      position: [-wallDepth / 2 - 0.25, centCorbelY + 0.33, cz],
      parent: root
    });
    createPart('CentCorbel3_B_' + cIdx, boxGeo(0.52, 0.24, 0.28), stoneDressing, {
      position: [-wallDepth / 2 - 0.38, centCorbelY + 0.56, cz],
      parent: root
    });

    // Murder hole slots between front and rear corbels
    if (cIdx < corbelZPositions.length - 1) {
      const midZ = (cz + corbelZPositions[cIdx + 1]) / 2;
      createPart('CentChute_F_' + cIdx, boxGeo(0.25, 0.08, 0.25), stoneDark, {
        position: [wallDepth / 2 + 0.38, centCorbelY + 0.64, midZ],
        parent: root
      });
      createPart('CentChute_B_' + cIdx, boxGeo(0.25, 0.08, 0.25), stoneDark, {
        position: [-wallDepth / 2 - 0.38, centCorbelY + 0.64, midZ],
        parent: root
      });
    }
  });

  // Projecting gallery floor slab
  createPart('CentGalleryFloor', boxGeo(wallDepth + 1.2, 0.28, wallWidth + 0.2), stoneDressing, {
    position: [0, centCorbelY + 0.76, 0],
    parent: root
  });

  // Central roof / wall-walk floor
  createPart('CentWalkFloor', boxGeo(wallDepth + 0.6, 0.06, wallWidth), stoneAshlar, {
    position: [0, centCorbelY + 0.92, 0],
    parent: root
  });

  // Central Merlons & Crenellations (Front and Rear)
  const centMerlonZ = [-1.8, -0.9, 0.0, 0.9, 1.8];
  centMerlonZ.forEach((mz, mIdx) => {
    // Front merlons
    createPart('CentMerlon_F_' + mIdx, boxGeo(0.3, 0.95, 0.54), stoneAshlar, {
      position: [wallDepth / 2 + 0.52, centCorbelY + 1.4, mz],
      parent: root
    });
    createPart('CentMerlonCap_F_' + mIdx, boxGeo(0.36, 0.12, 0.58), stoneDressing, {
      position: [wallDepth / 2 + 0.52, centCorbelY + 1.93, mz],
      parent: root
    });
    createPart('CentMerlonSlit_F_' + mIdx, boxGeo(0.32, 0.5, 0.07), stoneDark, {
      position: [wallDepth / 2 + 0.52, centCorbelY + 1.4, mz],
      parent: root
    });

    // Rear merlons
    createPart('CentMerlon_B_' + mIdx, boxGeo(0.3, 0.95, 0.54), stoneAshlar, {
      position: [-wallDepth / 2 - 0.52, centCorbelY + 1.4, mz],
      parent: root
    });
    createPart('CentMerlonCap_B_' + mIdx, boxGeo(0.36, 0.12, 0.58), stoneDressing, {
      position: [-wallDepth / 2 - 0.52, centCorbelY + 1.93, mz],
      parent: root
    });
  });

  // Low crenel sills (leaves deep, clear embrasure gaps for archers)
  for (let e = 0; e < centMerlonZ.length - 1; e++) {
    const ez = (centMerlonZ[e] + centMerlonZ[e + 1]) / 2;
    createPart('CentCrenelSill_F_' + e, boxGeo(0.3, 0.12, 0.36), stoneDressing, {
      position: [wallDepth / 2 + 0.52, centCorbelY + 0.98, ez],
      parent: root
    });
    createPart('CentCrenelSill_B_' + e, boxGeo(0.3, 0.12, 0.36), stoneDressing, {
      position: [-wallDepth / 2 - 0.52, centCorbelY + 0.98, ez],
      parent: root
    });
  }

  // ==========================================
  // 8. TIMBER DRAWBRIDGE & STONE ABUTMENT
  // ==========================================
  const bridgeStartX = wallDepth / 2 - 0.3; // X = 1.9 (gate threshold)
  const bridgeLength = 4.4;
  const bridgeEndX = bridgeStartX + bridgeLength; // X = 6.3
  const bridgeWidth = 2.4;
  const bridgeThick = 0.22;
  const deckY = passageFloorY + 0.12;

  // A. Stone Abutment (Pier across the moat)
  const abutmentLength = 3.6;
  const abutmentCenterX = bridgeEndX + abutmentLength / 2; // X = 8.1

  // Abutment battered foundation & body (sitting on Y = 0)
  createPart('AbutmentPlinth', taperConeGeo(bridgeWidth / 2 + 0.8, bridgeWidth / 2 + 0.5, deckY, 'y', 16), stoneDressing, {
    position: [abutmentCenterX, deckY / 2, 0],
    parent: root
  });
  createPart('AbutmentBody', boxGeo(abutmentLength, deckY, bridgeWidth + 0.8), stoneAshlar, {
    position: [abutmentCenterX, deckY / 2, 0],
    parent: root
  });
  // Abutment forward cutwater buttress
  createPart('AbutmentButtress', boxGeo(0.6, deckY, 1.4), stoneDressing, {
    position: [bridgeEndX + abutmentLength + 0.2, deckY / 2, 0],
    parent: root
  });
  // Abutment road surface
  createPart('AbutmentRoad', boxGeo(abutmentLength + 0.1, 0.08, bridgeWidth + 0.6), stoneDressing, {
    position: [abutmentCenterX, deckY + 0.04, 0],
    parent: root
  });
  // Timber landing curb/bumper where the lowered drawbridge rests
  createPart('AbutmentBumper', boxGeo(0.24, 0.16, bridgeWidth + 0.2), oakWood, {
    position: [bridgeEndX + 0.12, deckY + 0.08, 0],
    parent: root
  });
  // Abutment stone parapets with coping
  createPart('AbutmentParapetL', boxGeo(abutmentLength - 0.4, 0.65, 0.35), stoneAshlar, {
    position: [abutmentCenterX + 0.2, deckY + 0.38, -bridgeWidth / 2 - 0.3],
    parent: root
  });
  createPart('AbutmentParapetR', boxGeo(abutmentLength - 0.4, 0.65, 0.35), stoneAshlar, {
    position: [abutmentCenterX + 0.2, deckY + 0.38, bridgeWidth / 2 + 0.3],
    parent: root
  });
  createPart('AbutmentParapetCapL', boxGeo(abutmentLength - 0.3, 0.1, 0.42), stoneDressing, {
    position: [abutmentCenterX + 0.2, deckY + 0.74, -bridgeWidth / 2 - 0.3],
    parent: root
  });
  createPart('AbutmentParapetCapR', boxGeo(abutmentLength - 0.3, 0.1, 0.42), stoneDressing, {
    position: [abutmentCenterX + 0.2, deckY + 0.74, bridgeWidth / 2 + 0.3],
    parent: root
  });

  // B. Timber Drawbridge Structure (Lowered)
  const bridgeCenterX = (bridgeStartX + bridgeEndX) / 2;
  const numPlanks = 6;
  const plankW = (bridgeWidth - 0.1) / numPlanks;
  for (let p = 0; p < numPlanks; p++) {
    const pz = -bridgeWidth / 2 + plankW / 2 + 0.05 + p * plankW;
    createPart('BridgePlank_' + p, boxGeo(bridgeLength - 0.1, bridgeThick, plankW - 0.02), oakWood, {
      position: [bridgeCenterX, deckY, pz],
      parent: root
    });
  }

  // Transverse wood cleats (traction bars every 0.6m)
  const numCleats = 7;
  for (let c = 1; c < numCleats; c++) {
    const cx = bridgeStartX + (c / numCleats) * bridgeLength;
    createPart('DeckCleat_' + c, boxGeo(0.1, 0.06, bridgeWidth - 0.12), oakWood, {
      position: [cx, deckY + bridgeThick / 2 + 0.03, 0],
      parent: root
    });
    createPart('CleatSpikeL_' + c, boxGeo(0.04, 0.02, 0.04), wroughtIron, {
      position: [cx, deckY + bridgeThick / 2 + 0.065, -0.9],
      parent: root
    });
    createPart('CleatSpikeR_' + c, boxGeo(0.04, 0.02, 0.04), wroughtIron, {
      position: [cx, deckY + bridgeThick / 2 + 0.065, 0.9],
      parent: root
    });
  }

  // Heavy wrought-iron edge binding straps
  createPart('BridgeStrapL', boxGeo(bridgeLength, 0.04, 0.08), wroughtIron, {
    position: [bridgeCenterX, deckY + bridgeThick / 2 + 0.02, -bridgeWidth / 2 + 0.05],
    parent: root
  });
  createPart('BridgeStrapR', boxGeo(bridgeLength, 0.04, 0.08), wroughtIron, {
    position: [bridgeCenterX, deckY + bridgeThick / 2 + 0.02, bridgeWidth / 2 - 0.05],
    parent: root
  });

  // Heavy hinge pintles and barrels at gate threshold
  createPart('HingeBarrelL', cylinderZGeo(0.1, 0.1, 0.32, 10), wroughtIron, {
    position: [bridgeStartX + 0.08, deckY, -1.05],
    parent: root
  });
  createPart('HingeBarrelR', cylinderZGeo(0.1, 0.1, 0.32, 10), wroughtIron, {
    position: [bridgeStartX + 0.08, deckY, 1.05],
    parent: root
  });
  createPart('HingeBracketL', boxGeo(0.4, 0.12, 0.1), wroughtIron, {
    position: [bridgeStartX - 0.05, deckY, -1.05],
    parent: root
  });
  createPart('HingeBracketR', boxGeo(0.4, 0.12, 0.1), wroughtIron, {
    position: [bridgeStartX - 0.05, deckY, 1.05],
    parent: root
  });

  // Heavy lifting eyes / ring brackets at outer nose of drawbridge
  const eyeX = bridgeEndX - 0.15;
  const eyeZ = 1.05;
  createPart('LiftingEyePlateL', boxGeo(0.3, 0.06, 0.18), wroughtIron, {
    position: [eyeX, deckY + bridgeThick / 2 + 0.03, -eyeZ],
    parent: root
  });
  createPart('LiftingEyePlateR', boxGeo(0.3, 0.06, 0.18), wroughtIron, {
    position: [eyeX, deckY + bridgeThick / 2 + 0.03, eyeZ],
    parent: root
  });
  createPart('LiftingRingL', torusGeo(0.1, 0.026, 6, 10), wroughtIron, {
    position: [eyeX, deckY + bridgeThick / 2 + 0.14, -eyeZ],
    rotation: [0, 90, 45],
    parent: root
  });
  createPart('LiftingRingR', torusGeo(0.1, 0.026, 6, 10), wroughtIron, {
    position: [eyeX, deckY + bridgeThick / 2 + 0.14, eyeZ],
    rotation: [0, 90, -45],
    parent: root
  });

  // ==========================================
  // 9. WINCH HOUSINGS & BALANCED CHAINS
  // ==========================================
  const winchY = passageFloorY + 5.2; // Y = 5.9
  const winchX = wallDepth / 2 + 0.22; // X = 2.42
  const winchZ = 1.05;

  [-winchZ, winchZ].forEach((wz, wIdx) => {
    const wSide = wz < 0 ? 'L' : 'R';

    // Stone housing block
    createPart('WinchHousing_' + wSide, boxGeo(0.65, 0.85, 0.55), stoneAshlar, {
      position: [winchX, winchY, wz],
      parent: root
    });
    // Corbel support beneath housing
    createPart('WinchCorbel_' + wSide, boxGeo(0.5, 0.35, 0.45), stoneDressing, {
      position: [winchX - 0.05, winchY - 0.55, wz],
      parent: root
    });
    // Sloped weather coping on housing top
    createPart('WinchCoping_' + wSide, boxGeo(0.72, 0.16, 0.62), stoneDressing, {
      position: [winchX, winchY + 0.48, wz],
      parent: root
    });
    // Dark chain aperture slit into wall
    createPart('WinchAperture_' + wSide, boxGeo(0.2, 0.36, 0.16), stoneDark, {
      position: [winchX + 0.26, winchY - 0.05, wz],
      parent: root
    });
    // Iron guide roller
    createPart('WinchRoller_' + wSide, cylinderZGeo(0.08, 0.08, 0.2, 8), wroughtIron, {
      position: [winchX + 0.22, winchY - 0.05, wz],
      parent: root
    });
  });

  // Wrought Iron Chains running from winch housings down to drawbridge lifting rings
  // Budget-optimized interlocking torus links (5x8 = 80 tris per link, 14 links = 1120 tris per chain)
  [-winchZ, winchZ].forEach((wz, cIdx) => {
    const cSide = wz < 0 ? 'L' : 'R';
    const startPt = [winchX + 0.28, winchY - 0.05, wz];
    const endPt = [eyeX, deckY + bridgeThick / 2 + 0.16, wz];

    const dx = endPt[0] - startPt[0];
    const dy = endPt[1] - startPt[1];
    const dz = endPt[2] - startPt[2];

    const pitchDeg = Math.atan2(dy, Math.hypot(dx, dz)) * (180 / Math.PI);
    const yawDeg = -Math.atan2(dz, dx) * (180 / Math.PI);

    // A chain is interlocking links, not beads on a string, and the difference
    // is arithmetic. A torus link is 2 * (R + tube) long, so consecutive centres
    // have to sit closer together than that or the rings stop touching. This run
    // is 5.88 m from winch to lifting ring and it was being divided into a fixed
    // 13 steps, which put the centres 0.20 m apart and the links only 0.194 m
    // long: 24 separated rings, a floating-part warning on every one of them,
    // and a chain that read as a dotted line.
    //
    // So the pitch is chosen first, at a link size that suits a drawbridge, and
    // the count follows from the span. Keeping tube at 0.29 R makes each link
    // 1.29 pitches long, which is 0.29 of a pitch of overlap at every joint --
    // enough to read as engaged from any angle. The tessellation drops to 4 x 6
    // because there are now thirty links a side and none of them is ever more
    // than a few pixels across.
    const pitch = 0.193;
    const linkR = pitch / 2;
    const linkTube = linkR * 0.29;
    const span = Math.hypot(dx, dy, dz);
    const numLinks = Math.max(2, Math.round(span / pitch));
    for (let l = 0; l <= numLinks; l++) {
      const t = l / numLinks;
      const sag = Math.sin(t * Math.PI) * 0.08;
      const lx = startPt[0] + dx * t;
      const ly = startPt[1] + dy * t - sag;
      const lz = startPt[2] + dz * t;

      const rollDeg = (l % 2 === 0) ? 0 : 90;

      createPart('ChainLink_' + cSide + '_' + l, torusGeo(linkR, linkTube, 4, 6), wroughtIron, {
        position: [lx, ly, lz],
        rotation: [rollDeg, yawDeg, pitchDeg],
        parent: root
      });
    }

    // Terminal iron shackle / clevis at drawbridge ring
    createPart('ChainShackle_' + cSide, boxGeo(0.12, 0.08, 0.08), wroughtIron, {
      position: [endPt[0] - 0.08, endPt[1] + 0.04, wz],
      parent: root
    });
  });

  return root;
}
