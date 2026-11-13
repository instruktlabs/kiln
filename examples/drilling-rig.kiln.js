// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'DrillingRig', category: 'prop' };

function build() {
  const root = createRoot('DrillingRig');

  // Shared Materials (8 consistent PBR materials for optimal instanceability and draw-call batching)
  const mastYellow = gameMaterial(0xd97724, { metalness: 0.5, roughness: 0.4 }); // Industrial derrick orange/yellow
  const galvSteel = gameMaterial(0x8e969d, { metalness: 0.75, roughness: 0.35 }); // Galvanized structural steel
  const darkSteel = gameMaterial(0x272c33, { metalness: 0.85, roughness: 0.4 }); // Dark iron machinery & skids
  const pipeSteel = gameMaterial(0x4c555e, { metalness: 0.9, roughness: 0.25 }); // Machined alloy drill pipe
  const mudTankTeal = gameMaterial(0x1e4f60, { metalness: 0.45, roughness: 0.55 }); // Oilfield equipment teal
  const doghouseWhite = gameMaterial(0xcbd2d8, { metalness: 0.25, roughness: 0.65 }); // Painted sheet steel
  const cableBlack = gameMaterial(0x181a1c, { metalness: 0.8, roughness: 0.5 }); // Greased wire rope / hose
  const safetyRed = gameMaterial(0xb32821, { metalness: 0.5, roughness: 0.4, emissive: 0x330606 }); // Beacon / emergency

  // Helper: Railing with guaranteed vertical posts (no floating geometry)
  function createRailing(prefix, start, end, height, postCount, mat, parent) {
    const [x1, y1, z1] = start;
    const [x2, y2, z2] = end;
    // Top rail
    beamBetween(`${prefix}_Top`, [x1, y1 + height, z1], [x2, y2 + height, z2], 0.022, mat, { parent });
    // Mid rail
    beamBetween(`${prefix}_Mid`, [x1, y1 + height * 0.5, z1], [x2, y2 + height * 0.5, z2], 0.018, mat, { parent });
    // Vertical stanchions
    for (let i = 0; i <= postCount; i++) {
      const t = i / postCount;
      const px = x1 + t * (x2 - x1);
      const py = y1 + t * (y2 - y1);
      const pz = z1 + t * (z2 - z1);
      beamBetween(`${prefix}_Post_${i}`, [px, py, pz], [px, py + height, pz], 0.022, mat, { parent });
    }
  }

  // =========================================================================
  // 1. SUBSTRUCTURE & CELLAR (Y = 0 to 2.5m)
  // =========================================================================
  const subWidth = 5.2;   // Z span (-2.6 to +2.6)
  const subLength = 6.4;  // X span (-3.2 to +3.2)
  const floorY = 2.4;     // Top of drill floor deck

  // Heavy foundation skid runners on ground (Y = 0.0 to 0.3)
  createPart('SkidBaseL', boxGeo(subLength + 0.8, 0.3, 0.45), darkSteel, { position: [0, 0.15, -subWidth / 2], parent: root });
  createPart('SkidBaseR', boxGeo(subLength + 0.8, 0.3, 0.45), darkSteel, { position: [0, 0.15, subWidth / 2], parent: root });
  createPart('SkidBaseM1', boxGeo(subLength + 0.8, 0.3, 0.35), darkSteel, { position: [0, 0.15, -1.1], parent: root });
  createPart('SkidBaseM2', boxGeo(subLength + 0.8, 0.3, 0.35), darkSteel, { position: [0, 0.15, 1.1], parent: root });
  // Cross skid spreaders
  createPart('SkidSpreaderRear', boxGeo(0.45, 0.3, subWidth + 0.45), darkSteel, { position: [-subLength / 2, 0.15, 0], parent: root });
  createPart('SkidSpreaderFront', boxGeo(0.45, 0.3, subWidth + 0.45), darkSteel, { position: [subLength / 2, 0.15, 0], parent: root });
  createPart('SkidSpreaderCenter', boxGeo(0.35, 0.3, subWidth), darkSteel, { position: [0, 0.15, 0], parent: root });

  // Substructure vertical support columns
  const subColumns = [
    [-subLength / 2, -subWidth / 2],
    [-subLength / 2, subWidth / 2],
    [subLength / 2, -subWidth / 2],
    [subLength / 2, subWidth / 2],
    [0, -subWidth / 2],
    [0, subWidth / 2],
    [-subLength / 2, -1.1],
    [-subLength / 2, 1.1],
    [subLength / 2, -1.1],
    [subLength / 2, 1.1],
  ];
  const colHeight = floorY - 0.3;
  for (let i = 0; i < subColumns.length; i++) {
    const [cx, cz] = subColumns[i];
    createPart(`SubCol_${i}`, boxGeo(0.28, colHeight, 0.28), galvSteel, {
      position: [cx, 0.3 + colHeight / 2, cz],
      parent: root,
    });
  }

  // Substructure diagonal truss braces (both sides)
  beamBetween('SubTruss_L1', [-subLength / 2, 0.3, -subWidth / 2], [0, floorY, -subWidth / 2], 0.065, galvSteel, { parent: root });
  beamBetween('SubTruss_L2', [0, 0.3, -subWidth / 2], [-subLength / 2, floorY, -subWidth / 2], 0.065, galvSteel, { parent: root });
  beamBetween('SubTruss_L3', [0, 0.3, -subWidth / 2], [subLength / 2, floorY, -subWidth / 2], 0.065, galvSteel, { parent: root });
  beamBetween('SubTruss_L4', [subLength / 2, 0.3, -subWidth / 2], [0, floorY, -subWidth / 2], 0.065, galvSteel, { parent: root });

  beamBetween('SubTruss_R1', [-subLength / 2, 0.3, subWidth / 2], [0, floorY, subWidth / 2], 0.065, galvSteel, { parent: root });
  beamBetween('SubTruss_R2', [0, 0.3, subWidth / 2], [-subLength / 2, floorY, subWidth / 2], 0.065, galvSteel, { parent: root });
  beamBetween('SubTruss_R3', [0, 0.3, subWidth / 2], [subLength / 2, floorY, subWidth / 2], 0.065, galvSteel, { parent: root });
  beamBetween('SubTruss_R4', [subLength / 2, 0.3, subWidth / 2], [0, floorY, subWidth / 2], 0.065, galvSteel, { parent: root });

  // Rear substructure X-brace
  beamBetween('SubTruss_Rear1', [-subLength / 2, 0.3, -subWidth / 2], [-subLength / 2, floorY, subWidth / 2], 0.06, galvSteel, { parent: root });
  beamBetween('SubTruss_Rear2', [-subLength / 2, 0.3, subWidth / 2], [-subLength / 2, floorY, -subWidth / 2], 0.06, galvSteel, { parent: root });

  // Cellar Wellhead & Blowout Preventer (BOP) Stack directly under drill floor
  createPart('WellheadFlange', cylinderGeo(0.5, 0.55, 0.35, 10), darkSteel, { position: [0, 0.175, 0], parent: root });
  createPart('BopPipeRam', cylinderGeo(0.42, 0.42, 0.5, 10), darkSteel, { position: [0, 0.6, 0], parent: root });
  createPart('BopBonnetL', boxGeo(1.4, 0.3, 0.35), darkSteel, { position: [0, 0.6, 0], parent: root });
  createPart('BopBlindRam', cylinderGeo(0.42, 0.42, 0.5, 10), darkSteel, { position: [0, 1.15, 0], parent: root });
  createPart('BopBonnetR', boxGeo(0.35, 0.3, 1.4), darkSteel, { position: [0, 1.15, 0], parent: root });
  createPart('BopAnnular', cylinderGeo(0.52, 0.44, 0.6, 10), darkSteel, { position: [0, 1.7, 0], parent: root });
  createPart('BellNipple', cylinderGeo(0.35, 0.35, 0.4, 10), darkSteel, { position: [0, 2.15, 0], parent: root });

  // Mud return flowline exiting below drill floor to mud tank
  beamBetween('MudFlowline1', [0, 2.1, 0.3], [0, 1.6, 2.6], 0.09, darkSteel, { parent: root });

  // Drill Floor Main Platform Deck
  createPart('DrillFloorDeck', boxGeo(subLength + 0.4, 0.18, subWidth + 0.4), darkSteel, {
    position: [0, floorY + 0.09, 0],
    parent: root,
  });
  // Floor perimeter toe-boards (kickplates)
  createPart('ToeBoardRear', boxGeo(0.04, 0.15, subWidth + 0.4), galvSteel, { position: [-subLength / 2 - 0.18, floorY + 0.25, 0], parent: root });
  createPart('ToeBoardL', boxGeo(subLength + 0.4, 0.15, 0.04), galvSteel, { position: [0, floorY + 0.25, -subWidth / 2 - 0.18], parent: root });
  createPart('ToeBoardR', boxGeo(subLength + 0.4, 0.15, 0.04), galvSteel, { position: [0, floorY + 0.25, subWidth / 2 + 0.18], parent: root });

  // Drill Floor Handrails (fully stanchioned)
  const deckY = floorY + 0.18;
  createRailing('Rail_Rear', [-subLength / 2 - 0.18, deckY, -subWidth / 2 - 0.18], [-subLength / 2 - 0.18, deckY, subWidth / 2 + 0.18], 1.0, 4, galvSteel, root);
  createRailing('Rail_SideL', [-subLength / 2 - 0.18, deckY, -subWidth / 2 - 0.18], [subLength / 2 + 0.18, deckY, -subWidth / 2 - 0.18], 1.0, 4, galvSteel, root);
  createRailing('Rail_SideR', [-subLength / 2 - 0.18, deckY, subWidth / 2 + 0.18], [subLength / 2 + 0.18, deckY, subWidth / 2 + 0.18], 1.0, 4, galvSteel, root);
  // Front rails leaving opening for V-door ramp (center open between Z = -0.9 and +0.9)
  createRailing('Rail_FrontL', [subLength / 2 + 0.18, deckY, -subWidth / 2 - 0.18], [subLength / 2 + 0.18, deckY, -0.9], 1.0, 2, galvSteel, root);
  createRailing('Rail_FrontR', [subLength / 2 + 0.18, deckY, 0.9], [subLength / 2 + 0.18, deckY, subWidth / 2 + 0.18], 1.0, 2, galvSteel, root);

  // =========================================================================
  // 2. DRILL FLOOR EQUIPMENT
  // =========================================================================
  // Rotary Table & Master Bushing
  createPart('RotaryTableBase', cylinderGeo(0.85, 0.9, 0.12, 12), galvSteel, {
    position: [0, deckY + 0.06, 0],
    parent: root,
  });
  createPart('RotaryTableRing', cylinderGeo(0.6, 0.6, 0.14, 12), darkSteel, {
    position: [0, deckY + 0.07, 0],
    parent: root,
  });
  createPart('MasterBushing', boxGeo(0.5, 0.16, 0.5), darkSteel, {
    position: [0, deckY + 0.08, 0],
    parent: root,
  });
  createPart('KellyDriveBushing', cylinderGeo(0.2, 0.2, 0.18, 6), galvSteel, {
    position: [0, deckY + 0.12, 0],
    parent: root,
  });

  // Iron Roughneck (Hydraulic pipe makeup / breakout wrench unit)
  const irX = 0.9;
  const irZ = -0.9;
  createPart('IronRoughneckPedestal', boxGeo(0.4, 0.8, 0.4), darkSteel, {
    position: [irX, deckY + 0.4, irZ],
    parent: root,
  });
  createPart('IronRoughneckArm', boxGeo(0.6, 0.35, 0.35), mastYellow, {
    position: [irX - 0.25, deckY + 0.9, irZ + 0.25],
    parent: root,
  });
  createPart('IronRoughneckJaw', cylinderGeo(0.18, 0.18, 0.4, 8), darkSteel, {
    position: [irX - 0.5, deckY + 0.9, irZ + 0.5],
    parent: root,
  });

  // Massive Drawworks Winch System (at rear of drill floor behind mast)
  const dwX = -2.1;
  const dwZ = 0.2;
  createPart('DrawworksBase', boxGeo(1.8, 0.35, 2.6), darkSteel, {
    position: [dwX, deckY + 0.175, dwZ],
    parent: root,
  });
  createPart('DrawworksHousing', boxGeo(1.4, 1.1, 2.3), mastYellow, {
    position: [dwX, deckY + 0.85, dwZ],
    parent: root,
  });
  // Winch drum & spooled drilling line
  createPart('WinchDrumWire', cylinderZGeo(0.42, 0.42, 1.4, 10), cableBlack, {
    position: [dwX + 0.2, deckY + 0.95, dwZ],
    parent: root,
  });
  createPart('WinchFlangeL', cylinderZGeo(0.62, 0.62, 0.08, 10), darkSteel, {
    position: [dwX + 0.2, deckY + 0.95, dwZ - 0.72],
    parent: root,
  });
  createPart('WinchFlangeR', cylinderZGeo(0.62, 0.62, 0.08, 10), darkSteel, {
    position: [dwX + 0.2, deckY + 0.95, dwZ + 0.72],
    parent: root,
  });
  // Electric drive motors behind drawworks
  createPart('DrawworksMotor1', cylinderXGeo(0.32, 0.32, 1.0, 8), darkSteel, {
    position: [dwX - 0.7, deckY + 0.6, dwZ - 0.6],
    parent: root,
  });
  createPart('DrawworksMotor2', cylinderXGeo(0.32, 0.32, 1.0, 8), darkSteel, {
    position: [dwX - 0.7, deckY + 0.6, dwZ + 0.6],
    parent: root,
  });

  // Driller's Console & Controls
  createPart('DrillerConsole', boxGeo(0.6, 0.9, 1.0), darkSteel, {
    position: [-0.6, deckY + 0.45, -1.8],
    parent: root,
  });
  createPart('BrakeLever', cylinderGeo(0.02, 0.02, 0.7, 6), galvSteel, {
    position: [-0.6, deckY + 0.95, -1.5],
    rotation: [15, 0, -20],
    parent: root,
  });

  // =========================================================================
  // 3. DOGHOUSE (Driller's Cabin on Floor)
  // =========================================================================
  const dogL = 2.4;
  const dogW = 1.8;
  const dogH = 2.2;
  const dogX = -1.4;
  const dogZ = -subWidth / 2 + dogW / 2 + 0.2; // -1.7
  const dogBaseY = deckY;

  createPart('DoghouseBody', boxGeo(dogL, dogH, dogW), doghouseWhite, {
    position: [dogX, dogBaseY + dogH / 2, dogZ],
    parent: root,
  });
  createPart('DoghouseRoof', boxGeo(dogL + 0.2, 0.08, dogW + 0.2), darkSteel, {
    position: [dogX, dogBaseY + dogH + 0.04, dogZ],
    parent: root,
  });
  createPart('DoghouseDoor', boxGeo(0.04, 1.8, 0.75), darkSteel, {
    position: [dogX + dogL / 2 + 0.02, dogBaseY + 0.9, dogZ + 0.2],
    parent: root,
  });
  createPart('DoghouseDoorHandle', boxGeo(0.06, 0.12, 0.04), galvSteel, {
    position: [dogX + dogL / 2 + 0.05, dogBaseY + 0.9, dogZ + 0.45],
    parent: root,
  });
  // Door rain awning & grab rail
  createPart('DoghouseAwning', boxGeo(0.45, 0.04, 0.95), darkSteel, {
    position: [dogX + dogL / 2 + 0.24, dogBaseY + 1.85, dogZ + 0.2],
    parent: root,
  });
  createPart('DogGrabStandoff1', boxGeo(0.08, 0.03, 0.03), galvSteel, {
    position: [dogX + dogL / 2 + 0.03, dogBaseY + 0.5, dogZ + 0.65],
    parent: root,
  });
  createPart('DogGrabStandoff2', boxGeo(0.08, 0.03, 0.03), galvSteel, {
    position: [dogX + dogL / 2 + 0.03, dogBaseY + 1.4, dogZ + 0.65],
    parent: root,
  });
  beamBetween('DogDoorGrabRail', [dogX + dogL / 2 + 0.06, dogBaseY + 0.5, dogZ + 0.65], [dogX + dogL / 2 + 0.06, dogBaseY + 1.4, dogZ + 0.65], 0.02, galvSteel, { parent: root });

  // Windows looking onto the drill floor (+Z side)
  createPart('DogWindowFrame1', boxGeo(0.8, 0.7, 0.04), darkSteel, {
    position: [dogX - 0.45, dogBaseY + 1.25, dogZ + dogW / 2 + 0.02],
    parent: root,
  });
  createPart('DogWindowGlass1', boxGeo(0.72, 0.62, 0.02), galvSteel, {
    position: [dogX - 0.45, dogBaseY + 1.25, dogZ + dogW / 2 + 0.032],
    parent: root,
  });
  createPart('DogWindowFrame2', boxGeo(0.8, 0.7, 0.04), darkSteel, {
    position: [dogX + 0.45, dogBaseY + 1.25, dogZ + dogW / 2 + 0.02],
    parent: root,
  });
  createPart('DogWindowGlass2', boxGeo(0.72, 0.62, 0.02), galvSteel, {
    position: [dogX + 0.45, dogBaseY + 1.25, dogZ + dogW / 2 + 0.032],
    parent: root,
  });
  // Roof A/C unit
  createPart('DoghouseAC', boxGeo(0.7, 0.45, 0.6), darkSteel, {
    position: [dogX - 0.5, dogBaseY + dogH + 0.25, dogZ],
    parent: root,
  });

  // =========================================================================
  // 4. DERRICK / MAST LATTICE STRUCTURE (Y = 2.5 to 19.5m)
  // =========================================================================
  const mastBaseY = deckY;
  const mastTopY = mastBaseY + 16.5; // Y = 19.08m
  const bHalfX = 1.7; // Base footprint half-extents
  const bHalfZ = 1.7;
  const tHalfX = 0.72; // Top footprint half-extents
  const tHalfZ = 0.72;
  const mastLegRad = 0.075;

  // Mast A-frame mounting shoes / pins on floor
  createPart('MastShoeFL', boxGeo(0.4, 0.3, 0.4), darkSteel, { position: [bHalfX, mastBaseY + 0.15, -bHalfZ], parent: root });
  createPart('MastShoeFR', boxGeo(0.4, 0.3, 0.4), darkSteel, { position: [bHalfX, mastBaseY + 0.15, bHalfZ], parent: root });
  createPart('MastShoeBL', boxGeo(0.4, 0.3, 0.4), darkSteel, { position: [-bHalfX, mastBaseY + 0.15, -bHalfZ], parent: root });
  createPart('MastShoeBR', boxGeo(0.4, 0.3, 0.4), darkSteel, { position: [-bHalfX, mastBaseY + 0.15, bHalfZ], parent: root });

  // 4 Main corner legs
  beamBetween('MastLeg_FL', [bHalfX, mastBaseY, -bHalfZ], [tHalfX, mastTopY, -tHalfZ], mastLegRad, mastYellow, { parent: root });
  beamBetween('MastLeg_FR', [bHalfX, mastBaseY, bHalfZ], [tHalfX, mastTopY, tHalfZ], mastLegRad, mastYellow, { parent: root });
  beamBetween('MastLeg_BL', [-bHalfX, mastBaseY, -bHalfZ], [-tHalfX, mastTopY, -tHalfZ], mastLegRad, mastYellow, { parent: root });
  beamBetween('MastLeg_BR', [-bHalfX, mastBaseY, bHalfZ], [-tHalfX, mastTopY, tHalfZ], mastLegRad, mastYellow, { parent: root });

  // Mast tiers: 7 panels of horizontal girths and cross-bracing
  const panels = 7;
  for (let p = 0; p <= panels; p++) {
    const t = p / panels;
    const py = mastBaseY + t * (mastTopY - mastBaseY);
    const px = bHalfX + t * (tHalfX - bHalfX);
    const pz = bHalfZ + t * (tHalfZ - bHalfZ);

    // Horizontal girth beams
    if (p > 0) {
      beamBetween(`Girth_B_${p}`, [-px, py, -pz], [-px, py, pz], 0.045, mastYellow, { parent: root });
      beamBetween(`Girth_L_${p}`, [-px, py, -pz], [px, py, -pz], 0.045, mastYellow, { parent: root });
      beamBetween(`Girth_R_${p}`, [-px, py, pz], [px, py, pz], 0.045, mastYellow, { parent: root });
      // Front face: lower 2 panels remain open for V-door pipe ramp entry
      if (p >= 2) {
        beamBetween(`Girth_F_${p}`, [px, py, -pz], [px, py, pz], 0.045, mastYellow, { parent: root });
      }
    }

    // Panel diagonal lattice trusses
    if (p < panels) {
      const tNext = (p + 1) / panels;
      const ny = mastBaseY + tNext * (mastTopY - mastBaseY);
      const nx = bHalfX + tNext * (tHalfX - bHalfX);
      const nz = bHalfZ + tNext * (tHalfZ - bHalfZ);

      // Back face X-braces
      beamBetween(`Diag_B1_${p}`, [-px, py, -pz], [-nx, ny, nz], 0.032, mastYellow, { parent: root });
      beamBetween(`Diag_B2_${p}`, [-px, py, pz], [-nx, ny, -nz], 0.032, mastYellow, { parent: root });

      // Left face X-braces
      beamBetween(`Diag_L1_${p}`, [-px, py, -pz], [nx, ny, -nz], 0.032, mastYellow, { parent: root });
      beamBetween(`Diag_L2_${p}`, [px, py, -pz], [-nx, ny, -nz], 0.032, mastYellow, { parent: root });

      // Right face X-braces
      beamBetween(`Diag_R1_${p}`, [-px, py, pz], [nx, ny, nz], 0.032, mastYellow, { parent: root });
      beamBetween(`Diag_R2_${p}`, [px, py, pz], [-nx, ny, nz], 0.032, mastYellow, { parent: root });

      // Front face X-braces (upper panels only)
      if (p >= 2) {
        beamBetween(`Diag_F1_${p}`, [px, py, -pz], [nx, ny, nz], 0.032, mastYellow, { parent: root });
        beamBetween(`Diag_F2_${p}`, [px, py, pz], [nx, ny, -nz], 0.032, mastYellow, { parent: root });
      }
    }
  }

  // Vertical climbing ladder up rear-left mast leg
  createLadder('MastLadder_Low', {
    bottom: [-bHalfX - 0.08, deckY, -bHalfZ + 0.3],
    top: [-1.15, mastBaseY + 9.5, -1.15 + 0.3],
    width: 0.42,
    rungCount: 18,
    material: galvSteel,
    parent: root,
  });
  createLadder('MastLadder_High', {
    bottom: [-1.15, mastBaseY + 9.5, -1.15 + 0.3],
    top: [-tHalfX - 0.08, mastTopY, -tHalfZ + 0.3],
    width: 0.42,
    rungCount: 16,
    material: galvSteel,
    parent: root,
  });

  // Standpipe and Gooseneck on front-right leg
  createPart('Standpipe', cylinderGeo(0.06, 0.06, 10.5, 8), darkSteel, {
    position: [bHalfX - 0.15, mastBaseY + 5.25, bHalfZ + 0.1],
    parent: root,
  });
  createPart('StandpipeGooseneck', torusGeo(0.18, 0.05, 6, 10), darkSteel, {
    position: [bHalfX - 0.15, mastBaseY + 10.5, bHalfZ + 0.1],
    rotation: [0, 0, 90],
    parent: root,
  });

  // Flexible Kelly Hose looping gracefully from standpipe down and up to Top Drive
  const hosePoints = [
    [bHalfX - 0.15, mastBaseY + 10.4, bHalfZ + 0.1],
    [bHalfX - 0.2, mastBaseY + 8.5, bHalfZ - 0.2],
    [0.6, mastBaseY + 6.0, 0.8],
    [0.2, mastBaseY + 6.8, 0.5],
    [0.0, mastBaseY + 8.6, 0.3],
  ];
  const hoseGeo = pipeAlongPath(hosePoints, 0.045, { bendRadius: 0.5, tubularSegments: 24, radialSegments: 6 });
  createPart('KellyHose', hoseGeo, cableBlack, { parent: root });

  // =========================================================================
  // 5. MONKEY BOARD & FINGERBOARD (PIPE RACKING)
  // =========================================================================
  const monkeyY = mastBaseY + 9.8;
  const mbW = 1.4;
  const mbD = 0.9;
  const mbX = -0.7;
  const mbZ = -0.2;

  // Derrickman racking board platform
  createPart('MonkeyBoardDeck', boxGeo(mbD, 0.06, mbW), galvSteel, {
    position: [mbX, monkeyY, mbZ],
    parent: root,
  });
  createRailing('MonkeyRailB', [mbX - mbD / 2, monkeyY, mbZ - mbW / 2], [mbX - mbD / 2, monkeyY, mbZ + mbW / 2], 1.0, 2, galvSteel, root);
  createRailing('MonkeyRailL', [mbX - mbD / 2, monkeyY, mbZ - mbW / 2], [mbX + mbD / 2, monkeyY, mbZ - mbW / 2], 1.0, 2, galvSteel, root);

  // Fingerboard tines (slotted steel racks holding pipe stands)
  const tineL = 1.1;
  createPart('FingerboardBeam', boxGeo(0.08, 0.12, 1.2), galvSteel, {
    position: [mbX + mbD / 2 + 0.05, monkeyY + 0.4, mbZ],
    parent: root,
  });
  for (let f = -2; f <= 2; f++) {
    createPart(`FingerTine_${f}`, boxGeo(tineL, 0.05, 0.03), galvSteel, {
      position: [mbX + mbD / 2 + tineL / 2 + 0.05, monkeyY + 0.4, mbZ + f * 0.22],
      parent: root,
    });
  }

  // Racked Drill Pipes standing in fingerboard setback area on drill floor
  const pipeStandH = monkeyY - mastBaseY + 0.8;
  const pipeRadius = 0.045;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      const px = -0.35 - row * 0.18;
      const pz = -0.45 + col * 0.18;
      createPart(`RackedPipe_${row}_${col}`, cylinderGeo(pipeRadius, pipeRadius, pipeStandH, 6), pipeSteel, {
        position: [px, mastBaseY + pipeStandH / 2, pz],
        parent: root,
      });
    }
  }
  // Drill Collars (heavier 8" diameter drill collars in rear rack)
  for (let dc = 0; dc < 3; dc++) {
    createPart(`DrillCollar_${dc}`, cylinderGeo(0.07, 0.07, pipeStandH, 6), darkSteel, {
      position: [-0.85, mastBaseY + pipeStandH / 2, -0.25 + dc * 0.25],
      parent: root,
    });
  }

  // =========================================================================
  // 6. CROWN BLOCK & WATER TABLE (MAST TOP)
  // =========================================================================
  const crownFrameY = mastTopY;
  createPart('CrownDeck', boxGeo(tHalfX * 2 + 0.6, 0.15, tHalfZ * 2 + 0.6), darkSteel, {
    position: [0, crownFrameY + 0.075, 0],
    parent: root,
  });
  const crW = tHalfZ + 0.28;
  const crL = tHalfX + 0.28;
  const crDeckY = crownFrameY + 0.15;
  createRailing('CrownRail_F', [crL, crDeckY, -crW], [crL, crDeckY, crW], 0.9, 2, galvSteel, root);
  createRailing('CrownRail_B', [-crL, crDeckY, -crW], [-crL, crDeckY, crW], 0.9, 2, galvSteel, root);
  createRailing('CrownRail_L', [-crL, crDeckY, -crW], [crL, crDeckY, -crW], 0.9, 2, galvSteel, root);
  createRailing('CrownRail_R', [-crL, crDeckY, crW], [crL, crDeckY, crW], 0.9, 2, galvSteel, root);

  // Crown sheave housing / arch
  createPart('CrownSheaveArchL', boxGeo(0.9, 1.0, 0.12), darkSteel, { position: [0, crDeckY + 0.5, -0.4], parent: root });
  createPart('CrownSheaveArchR', boxGeo(0.9, 1.0, 0.12), darkSteel, { position: [0, crDeckY + 0.5, 0.4], parent: root });
  createPart('CrownCenterShaft', cylinderZGeo(0.07, 0.07, 0.8, 8), darkSteel, { position: [0, crDeckY + 0.65, 0], parent: root });

  // 6 Main crown sheaves (pulleys)
  for (let s = -2; s <= 3; s++) {
    createPart(`CrownSheave_${s}`, cylinderZGeo(0.38, 0.38, 0.06, 10), galvSteel, {
      position: [0, crDeckY + 0.65, s * 0.11 - 0.05],
      parent: root,
    });
  }

  // Crown protective hood with support posts solidly welded to sheave arches
  createPart('CrownHoodPostL', boxGeo(0.08, 0.18, 0.08), darkSteel, { position: [0, crDeckY + 1.0, -0.35], parent: root });
  createPart('CrownHoodPostR', boxGeo(0.08, 0.18, 0.08), darkSteel, { position: [0, crDeckY + 1.0, 0.35], parent: root });
  createPart('CrownGuardHood', boxGeo(1.0, 0.1, 0.8), mastYellow, {
    position: [0, crDeckY + 1.08, 0],
    parent: root,
  });

  // Aviation obstruction warning beacon & lightning rod on crown top
  createPart('CrownBeaconStem', cylinderGeo(0.03, 0.03, 0.35, 6), darkSteel, {
    position: [0, crDeckY + 1.28, 0],
    parent: root,
  });
  createPart('CrownBeaconLight', cylinderGeo(0.08, 0.08, 0.16, 8), safetyRed, {
    position: [0, crDeckY + 1.5, 0],
    parent: root,
  });
  createPart('LightningRod', cylinderGeo(0.015, 0.015, 0.6, 6), galvSteel, {
    position: [-0.3, crDeckY + 1.35, -0.3],
    parent: root,
  });

  // =========================================================================
  // 7. TRAVELLING BLOCK & TOP DRIVE SYSTEM
  // =========================================================================
  const tbY = mastBaseY + 8.8;

  // Vertical torque guide rails in mast for top drive carriage
  beamBetween('TorqueRailL', [-0.45, mastBaseY, -0.3], [-0.3, mastTopY, -0.2], 0.035, galvSteel, { parent: root });
  beamBetween('TorqueRailR', [-0.45, mastBaseY, 0.3], [-0.3, mastTopY, 0.2], 0.035, galvSteel, { parent: root });

  // Travelling Block body
  createPart('TravBlockBody', boxGeo(0.55, 1.3, 0.65), mastYellow, {
    position: [0, tbY + 0.85, 0],
    parent: root,
  });
  createPart('TravBlockPlateL', boxGeo(0.6, 1.25, 0.06), darkSteel, { position: [0, tbY + 0.85, -0.34], parent: root });
  createPart('TravBlockPlateR', boxGeo(0.6, 1.25, 0.06), darkSteel, { position: [0, tbY + 0.85, 0.34], parent: root });

  // Top Drive System (integrated below travelling block)
  createPart('TopDriveMainBody', boxGeo(0.7, 0.85, 0.65), darkSteel, {
    position: [0, tbY - 0.2, 0],
    parent: root,
  });
  createPart('TopDriveMotor', cylinderGeo(0.24, 0.24, 0.7, 8), mastYellow, {
    position: [-0.15, tbY + 0.3, 0],
    parent: root,
  });
  createPart('TopDriveDolly', boxGeo(0.3, 0.9, 0.85), darkSteel, {
    position: [-0.4, tbY - 0.1, 0],
    parent: root,
  });

  // Pipe elevator links (bails) hanging below top drive
  beamBetween('ElevatorBailL', [0.05, tbY - 0.6, -0.25], [0.05, tbY - 1.4, -0.2], 0.03, galvSteel, { parent: root });
  beamBetween('ElevatorBailR', [0.05, tbY - 0.6, 0.25], [0.05, tbY - 1.4, 0.2], 0.03, galvSteel, { parent: root });
  createPart('ElevatorClamp', boxGeo(0.3, 0.2, 0.45), darkSteel, {
    position: [0.05, tbY - 1.4, 0],
    parent: root,
  });

  // Active drill pipe / quill passing through rotary table
  createPart('ActiveDrillPipe', cylinderGeo(0.06, 0.06, 8.5, 8), pipeSteel, {
    position: [0, mastBaseY + 4.25, 0],
    parent: root,
  });

  // Drilling Lines
  beamBetween('CableLine1', [-0.15, crDeckY + 0.65, -0.18], [-0.15, tbY + 1.5, -0.18], 0.016, cableBlack, { parent: root });
  beamBetween('CableLine2', [-0.15, crDeckY + 0.65, 0.18], [-0.15, tbY + 1.5, 0.18], 0.016, cableBlack, { parent: root });
  beamBetween('CableLine3', [0.15, crDeckY + 0.65, -0.18], [0.15, tbY + 1.5, -0.18], 0.016, cableBlack, { parent: root });
  beamBetween('CableLine4', [0.15, crDeckY + 0.65, 0.18], [0.15, tbY + 1.5, 0.18], 0.016, cableBlack, { parent: root });
  beamBetween('FastlineCable', [0, crDeckY + 0.65, 0.35], [dwX + 0.2, deckY + 1.0, dwZ + 0.5], 0.018, cableBlack, { parent: root });

  // =========================================================================
  // 8. MUD TANKS & SOLIDS CONTROL SYSTEM (+Z ground side)
  // =========================================================================
  const tankL = 4.8;
  const tankW = 2.0;
  const tankH = 1.4;
  const tankX = 0.2;
  const tankZ = subWidth / 2 + tankW / 2 + 0.6; // 4.2

  // Steel skid runners connecting Mud Tanks to main Substructure Base skids (rigid bridge)
  createPart('MudSkidTieL', boxGeo(0.3, 0.25, 1.2), darkSteel, {
    position: [-1.5, 0.125, subWidth / 2 + 0.5],
    parent: root,
  });
  createPart('MudSkidTieR', boxGeo(0.3, 0.25, 1.2), darkSteel, {
    position: [1.5, 0.125, subWidth / 2 + 0.5],
    parent: root,
  });

  // Mud Tanks Skid Base
  createPart('MudTankSkid1', boxGeo(tankL + 0.6, 0.25, 0.35), darkSteel, { position: [tankX, 0.125, tankZ - tankW / 2], parent: root });
  createPart('MudTankSkid2', boxGeo(tankL + 0.6, 0.25, 0.35), darkSteel, { position: [tankX, 0.125, tankZ + tankW / 2], parent: root });

  // Dual Compartment Mud Tanks (Active Tank & Suction Tank)
  createPart('MudTankComp1', boxGeo(tankL / 2 - 0.05, tankH - 0.2, tankW), mudTankTeal, {
    position: [tankX - tankL / 4, 0.25 + (tankH - 0.2) / 2, tankZ],
    parent: root,
  });
  createPart('MudTankComp2', boxGeo(tankL / 2 - 0.05, tankH - 0.2, tankW), mudTankTeal, {
    position: [tankX + tankL / 4, 0.25 + (tankH - 0.2) / 2, tankZ],
    parent: root,
  });
  // Equalizer connection pipe between compartments
  createPart('TankEqualizerPipe', cylinderXGeo(0.08, 0.08, 0.4, 8), darkSteel, {
    position: [tankX, 0.6, tankZ],
    parent: root,
  });

  // Top Walkway Grating
  createPart('MudTankDeck', boxGeo(tankL + 0.2, 0.08, tankW + 0.1), darkSteel, {
    position: [tankX, tankH + 0.04, tankZ],
    parent: root,
  });
  // Mud Tank Handrails with vertical stanchions directly into deck
  const mtDeckY = tankH + 0.08;
  createRailing('MTRail_Outer', [tankX - tankL / 2, mtDeckY, tankZ + tankW / 2], [tankX + tankL / 2, mtDeckY, tankZ + tankW / 2], 0.9, 4, galvSteel, root);
  createRailing('MTRail_Inner', [tankX - tankL / 2, mtDeckY, tankZ - tankW / 2], [tankX + tankL / 2, mtDeckY, tankZ - tankW / 2], 0.9, 4, galvSteel, root);
  createRailing('MTRail_EndL', [tankX - tankL / 2, mtDeckY, tankZ - tankW / 2], [tankX - tankL / 2, mtDeckY, tankZ + tankW / 2], 0.9, 2, galvSteel, root);

  // Shale Shaker Unit mounted on Tank 1 (+X end)
  const ssX = tankX + tankL / 2 - 0.6;
  const ssY = tankH + 0.1;
  createPart('ShakerFrame', boxGeo(1.3, 0.4, 1.2), darkSteel, {
    position: [ssX, ssY + 0.2, tankZ],
    parent: root,
  });
  createPart('ShakerScreen', boxGeo(1.1, 0.1, 1.0), galvSteel, {
    position: [ssX + 0.1, ssY + 0.4, tankZ],
    rotation: [0, 0, -12],
    parent: root,
  });
  createPart('ShakerMotor', cylinderXGeo(0.14, 0.14, 0.8, 8), mastYellow, {
    position: [ssX - 0.3, ssY + 0.6, tankZ],
    parent: root,
  });
  // Cuttings discharge chute sloping down from shaker
  createPart('ShakerChute', boxGeo(0.6, 0.06, 0.9), darkSteel, {
    position: [ssX + 0.7, ssY + 0.15, tankZ],
    rotation: [0, 0, -35],
    parent: root,
  });

  // Flowline connection from BOP to Shale Shaker header box
  beamBetween('MudFlowline2', [0, 1.6, 2.6], [ssX - 0.4, ssY + 0.6, tankZ], 0.09, darkSteel, { parent: root });

  // Mud Agitator Motors on top of tanks
  for (let m = -1; m <= 0; m++) {
    const ax = tankX + m * 1.3 - 0.4;
    createPart(`AgitatorMotor_${m}`, cylinderGeo(0.2, 0.2, 0.4, 8), darkSteel, {
      position: [ax, mtDeckY + 0.3, tankZ],
      parent: root,
    });
    createPart(`AgitatorGearbox_${m}`, boxGeo(0.35, 0.2, 0.35), darkSteel, {
      position: [ax, mtDeckY + 0.1, tankZ],
      parent: root,
    });
  }

  // Low pressure mud manifold pipe rigidly welded via mounting brackets to tank skid
  createPart('MudManifoldBracket1', boxGeo(0.12, 0.25, 0.3), darkSteel, {
    position: [tankX - 1.5, 0.35, tankZ - tankW / 2 - 0.1],
    parent: root,
  });
  createPart('MudManifoldBracket2', boxGeo(0.12, 0.25, 0.3), darkSteel, {
    position: [tankX + 1.5, 0.35, tankZ - tankW / 2 - 0.1],
    parent: root,
  });
  createPart('MudManifoldPipe', cylinderXGeo(0.08, 0.08, tankL, 8), darkSteel, {
    position: [tankX, 0.45, tankZ - tankW / 2 - 0.2],
    parent: root,
  });

  // Mud tank access ladder from ground (resting at Y=0.01)
  createLadder('MudTankLadder', {
    bottom: [tankX - tankL / 2 - 0.15, 0.01, tankZ],
    top: [tankX - tankL / 2 - 0.15, mtDeckY, tankZ],
    width: 0.4,
    rungCount: 5,
    material: galvSteel,
    parent: root,
  });

  // =========================================================================
  // 9. STAIRWAY TO DRILL FLOOR (+X Front Approach)
  // =========================================================================
  createStairs('FloorStairs', galvSteel, {
    steps: 12,
    totalRise: floorY + 0.178,
    totalRun: 3.2,
    width: 0.85,
    axis: 'x',
    parent: root,
  });
  const stairObj = root.getObjectByName('FloorStairs');
  if (stairObj) {
    stairObj.position.set(subLength / 2 + 3.2, 0, 1.6);
    stairObj.rotation.y = Math.PI;
  }

  // Stair railings with vertical stanchions into stringers
  const stairStartX = subLength / 2 + 3.2;
  const stairEndX = subLength / 2;
  const stairZ = 1.6;
  const stairW = 0.85;
  createRailing('StairRail_L', [stairStartX, 0, stairZ - stairW / 2], [stairEndX, deckY, stairZ - stairW / 2], 0.9, 4, galvSteel, root);
  createRailing('StairRail_R', [stairStartX, 0, stairZ + stairW / 2], [stairEndX, deckY, stairZ + stairW / 2], 0.9, 4, galvSteel, root);

  // =========================================================================
  // 10. V-DOOR PIPE RAMP & CATWALK SYSTEM (+X forward)
  // =========================================================================
  const rampTopX = subLength / 2;
  const rampTopY = deckY;
  const rampBottomX = 5.6;
  const rampBottomY = 0.35;
  const rampSpacing = 0.7;

  // Sloping structural stringers (lowest point remains safely above Y=0)
  beamBetween('PipeRampStringerL', [rampTopX, rampTopY, -rampSpacing], [rampBottomX, rampBottomY, -rampSpacing], 0.06, darkSteel, { parent: root });
  beamBetween('PipeRampStringerR', [rampTopX, rampTopY, rampSpacing], [rampBottomX, rampBottomY, rampSpacing], 0.06, darkSteel, { parent: root });

  // Sloped steel slide plate between stringers
  const rampMidX = (rampTopX + rampBottomX) / 2;
  const rampMidY = (rampTopY + rampBottomY) / 2;
  const rampAngleDeg = Math.atan2(rampTopY - rampBottomY, rampBottomX - rampTopX) * (180 / Math.PI);
  const rampLength = Math.hypot(rampBottomX - rampTopX, rampTopY - rampBottomY);
  createPart('PipeSlidePlate', boxGeo(rampLength, 0.04, rampSpacing * 2), darkSteel, {
    position: [rampMidX, rampMidY, 0],
    rotation: [0, 0, rampAngleDeg],
    parent: root,
  });

  // Catwalk Platform (Long horizontal runway for pipe handling, X = 5.4 to 10.8)
  const cwL = 5.4;
  const cwW = 1.6;
  const cwH = 0.35;
  const cwX = 5.5 + cwL / 2; // X = 8.2

  createPart('CatwalkDeck', boxGeo(cwL, cwH, cwW), darkSteel, {
    position: [cwX, cwH / 2, 0],
    parent: root,
  });
  createPart('CatwalkGrating', boxGeo(cwL, 0.04, cwW), galvSteel, {
    position: [cwX, cwH + 0.02, 0],
    parent: root,
  });
  // Catwalk connection tie to substructure skid (ensures continuous connected graph)
  createPart('CatwalkSkidTie', boxGeo(2.4, 0.25, 0.4), darkSteel, {
    position: [4.4, 0.125, 0],
    parent: root,
  });

  // Transverse pipe rack support skids connecting directly under catwalk (welds pipe racks to catwalk!)
  createPart('PipeRackTransverseSkid1', boxGeo(0.3, 0.25, 4.8), darkSteel, {
    position: [6.5, 0.125, 0],
    parent: root,
  });
  createPart('PipeRackTransverseSkid2', boxGeo(0.3, 0.25, 4.8), darkSteel, {
    position: [9.5, 0.125, 0],
    parent: root,
  });

  // Pipe Racks on both sides of Catwalk (storing horizontal drill pipe/casing)
  for (let side of [-1, 1]) {
    const rz = side * (cwW / 2 + 1.2);
    // Triangular steel rack supports resting directly on transverse skids
    createPart(`PipeRackFrame_${side}_1`, boxGeo(0.3, 0.4, 2.2), darkSteel, { position: [6.5, 0.2, rz], parent: root });
    createPart(`PipeRackFrame_${side}_2`, boxGeo(0.3, 0.4, 2.2), darkSteel, { position: [9.5, 0.2, rz], parent: root });

    // Casing pipes lying horizontally in racks
    for (let p = 0; p < 4; p++) {
      const pOffsetZ = rz - 0.65 + p * 0.42;
      createPart(`StoredPipe_${side}_${p}`, cylinderXGeo(0.1, 0.1, 4.2, 8), pipeSteel, {
        position: [8.0, 0.48, pOffsetZ],
        parent: root,
      });
    }
  }

  return root;
}
