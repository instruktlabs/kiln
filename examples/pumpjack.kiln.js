// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 7 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'Pumpjack', category: 'prop' };

async function build() {
  const root = createRoot('Pumpjack');

  // ==========================================
  // MATERIALS (Authentic industrial oilfield palette)
  // ==========================================
  // Industrial pumpjack painted steel (classic oilfield dark spruce green)
  const matBeamSteel = gameMaterial(0x244636, { metalness: 0.55, roughness: 0.45 });
  // Heavy structural dark steel (skid runners, brackets, gearbox casing)
  const matDarkSteel = gameMaterial(0x222527, { metalness: 0.7, roughness: 0.4 });
  // High-visibility safety orange (counterweights, moving hazard warnings)
  const matHazardOrange = gameMaterial(0xd35b1d, { metalness: 0.35, roughness: 0.45 });
  // Safety yellow (ladder, handrails, belt guard, handwheels)
  const matSafetyYellow = gameMaterial(0xdaa224, { metalness: 0.25, roughness: 0.4 });
  // Polished chrome / stainless steel (polished rod, wrist/crank pins, valve stems)
  const matPolishedSteel = gameMaterial(0xe2e4e8, { metalness: 0.95, roughness: 0.12 });
  // Multi-strand wire rope / steel cables
  const matWireCable = gameMaterial(0x404346, { metalness: 0.7, roughness: 0.45 });
  // Wellhead red oxide primer (casing head, valves, flow tee)
  const matWellhead = gameMaterial(0x782c24, { metalness: 0.4, roughness: 0.5 });
  // Reinforced concrete footings
  const matConcrete = gameMaterial(0x86847e, { metalness: 0.08, roughness: 0.92 });
  // Crushed gravel foundation pad
  const matGravel = gameMaterial(0x6e6a62, { metalness: 0.05, roughness: 0.98 });
  // Cast iron (rough gearbox hubs, motor mounts)
  const matCastIron = gameMaterial(0x2f3235, { metalness: 0.5, roughness: 0.65 });
  // Brass / bronze (stuffing box gland, pressure gauge)
  const matBrass = gameMaterial(0xb58f44, { metalness: 0.8, roughness: 0.3 });

  // Shared bolt and rivet geometries
  const boltHexY = cylinderYGeo(0.024, 0.024, 0.035, 6);
  const boltHexX = cylinderXGeo(0.022, 0.022, 0.035, 6);
  const boltHexZ = cylinderZGeo(0.022, 0.022, 0.035, 6);

  // ==========================================
  // 1. GRAVEL PAD & CONCRETE FOUNDATION PIERS
  // ==========================================
  // Main gravel bed (ground rests at Y=0)
  createPart('GravelPad', boxGeo(8.6, 0.12, 3.8), matGravel, {
    position: [-0.3, 0.06, 0],
    parent: root,
  });

  // Perimeter retaining timbers
  createPart('BorderTimber_Front', boxGeo(0.16, 0.14, 3.804), matDarkSteel, {
    position: [4.0, 0.07, 0],
    parent: root,
  });
  createPart('BorderTimber_Back', boxGeo(0.16, 0.14, 3.804), matDarkSteel, {
    position: [-4.6, 0.07, 0],
    parent: root,
  });
  createPart('BorderTimber_Left', boxGeo(8.604, 0.14, 0.16), matDarkSteel, {
    position: [-0.3, 0.07, -1.9],
    parent: root,
  });
  createPart('BorderTimber_Right', boxGeo(8.604, 0.14, 0.16), matDarkSteel, {
    position: [-0.3, 0.07, 1.9],
    parent: root,
  });

  // Concrete foundation blocks resting on gravel
  createPart('ConcreteFooting_Front', boxGeo(1.6, 0.14, 2.2), matConcrete, {
    position: [0.75, 0.19, 0],
    parent: root,
  });
  createPart('ConcreteFooting_Mid', boxGeo(1.4, 0.14, 2.2), matConcrete, {
    position: [-0.65, 0.19, 0],
    parent: root,
  });
  createPart('ConcreteFooting_Rear', boxGeo(2.6, 0.14, 2.2), matConcrete, {
    position: [-2.55, 0.19, 0],
    parent: root,
  });
  createPart('ConcreteFooting_Wellhead', boxGeo(1.1, 0.14, 1.1), matConcrete, {
    position: [3.3, 0.19, 0],
    parent: root,
  });

  // ==========================================
  // 2. HEAVY STEEL SKID FRAME (OILFIELD RUNNERS)
  // ==========================================
  const skidY = 0.36;
  const skidHeight = 0.22;
  const skidWidth = 0.2;
  const skidLength = 7.0;

  for (const zSide of [-0.75, 0.75]) {
    const sideName = zSide < 0 ? 'L' : 'R';
    createPart(`SkidRunner_${sideName}`, boxGeo(skidLength, skidHeight, skidWidth), matDarkSteel, {
      position: [-0.5, skidY, zSide],
      parent: root,
    });
    createPart(`SkidRunner_TFlange_${sideName}`, boxGeo(skidLength, 0.021, skidWidth + 0.08), matDarkSteel, {
      position: [-0.5, skidY + skidHeight / 2 + 0.010, zSide],
      parent: root,
    });
    createPart(`SkidRunner_BFlange_${sideName}`, boxGeo(skidLength, 0.025, skidWidth + 0.08), matDarkSteel, {
      position: [-0.5, skidY - skidHeight / 2 - 0.012, zSide],
      parent: root,
    });

    // Angled sled noses (turned up for truck winching)
    createPart(`SkidNose_F_${sideName}`, boxGeo(0.5, skidHeight, skidWidth), matDarkSteel, {
      position: [3.18, skidY + 0.09, zSide],
      rotation: [0, 0, 24],
      parent: root,
    });
    createPart(`SkidNose_R_${sideName}`, boxGeo(0.5, skidHeight, skidWidth), matDarkSteel, {
      position: [-4.18, skidY + 0.09, zSide],
      rotation: [0, 0, -24],
      parent: root,
    });

    // Towing eyes / lifting shackle lugs
    createPart(`TowEye_F_${sideName}`, torusGeo(0.08, 0.022, 8, 14), matDarkSteel, {
      position: [3.42, skidY + 0.18, zSide],
      rotation: [0, 90, 0],
      parent: root,
    });
    createPart(`TowEye_R_${sideName}`, torusGeo(0.08, 0.022, 8, 14), matDarkSteel, {
      position: [-4.42, skidY + 0.18, zSide],
      rotation: [0, 90, 0],
      parent: root,
    });
  }

  // Cross-members connecting runners
  const crossXPositions = [-3.8, -3.0, -2.0, -0.65, 0.75, 2.0, 2.85];
  for (let i = 0; i < crossXPositions.length; i++) {
    const cx = crossXPositions[i];
    createPart(`SkidCross_${i}`, boxGeo(0.2, 0.2, 1.3), matDarkSteel, {
      position: [cx, skidY, 0],
      parent: root,
    });
    createPart(`SkidGusset_${i}_L`, boxGeo(0.18, 0.02, 0.18), matDarkSteel, {
      position: [cx, skidY + 0.11, -0.65],
      parent: root,
    });
    createPart(`SkidGusset_${i}_R`, boxGeo(0.18, 0.02, 0.18), matDarkSteel, {
      position: [cx, skidY + 0.11, 0.65],
      parent: root,
    });
  }

  // Anchor hold-down clamps bolting skid to concrete piers
  const clampXPositions = [-3.5, -2.4, -0.65, 0.75, 2.4];
  for (let i = 0; i < clampXPositions.length; i++) {
    const clx = clampXPositions[i];
    for (const zSide of [-0.92, 0.92]) {
      createPart(`SkidClamp_${i}_${zSide > 0 ? 'R' : 'L'}`, boxGeo(0.12, 0.15, 0.14), matDarkSteel, {
        position: [clx, 0.28, zSide],
        parent: root,
      });
      createPart(`SkidBolt_${i}_${zSide > 0 ? 'R' : 'L'}`, boltHexY, matDarkSteel, {
        position: [clx, 0.36, zSide],
        parent: root,
      });
    }
  }

  // ==========================================
  // 3. SAMSON POST (4-LEG PYRAMID TRUSS TOWER)
  // ==========================================
  const samsonTopY = 3.3;
  const postShoeY = skidY + 0.12;

  const legCoords = [
    { name: 'FL', base: [0.75, postShoeY, -0.65], top: [0.08, samsonTopY, -0.24] },
    { name: 'FR', base: [0.75, postShoeY, 0.65], top: [0.08, samsonTopY, 0.24] },
    { name: 'BL', base: [-0.65, postShoeY, -0.65], top: [-0.04, samsonTopY, -0.24] },
    { name: 'BR', base: [-0.65, postShoeY, 0.65], top: [-0.04, samsonTopY, 0.24] },
  ];

  for (const leg of legCoords) {
    createPart(`LegShoe_${leg.name}`, boxGeo(0.28, 0.04, 0.28), matDarkSteel, {
      position: [leg.base[0], leg.base[1] + 0.01, leg.base[2]],
      parent: root,
    });
    for (const dx of [-0.09, 0.09]) {
      for (const dz of [-0.09, 0.09]) {
        createPart(`LegShoeBolt_${leg.name}_${dx}_${dz}`, boltHexY, matDarkSteel, {
          position: [leg.base[0] + dx, leg.base[1] + 0.035, leg.base[2] + dz],
          parent: root,
        });
      }
    }
    beamBetween(`LegColumn_${leg.name}`, leg.base, leg.top, 0.065, matBeamSteel, { parent: root });
  }

  // Horizontal perimeter ring struts
  const strutTiers = [
    { y: 1.25, name: 'Tier1' },
    { y: 2.25, name: 'Tier2' },
  ];

  for (const tier of strutTiers) {
    const t = (tier.y - postShoeY) / (samsonTopY - postShoeY);
    const flX = 0.75 + t * (0.08 - 0.75);
    const flZ = -0.65 + t * (-0.24 - -0.65);
    const frX = 0.75 + t * (0.08 - 0.75);
    const frZ = 0.65 + t * (0.24 - 0.65);
    const blX = -0.65 + t * (-0.04 - -0.65);
    const blZ = -0.65 + t * (-0.24 - -0.65);
    const brX = -0.65 + t * (-0.04 - -0.65);
    const brZ = 0.65 + t * (0.24 - 0.65);

    beamBetween(`Strut_F_${tier.name}`, [flX, tier.y, flZ], [frX, tier.y, frZ], 0.04, matBeamSteel, { parent: root });
    beamBetween(`Strut_B_${tier.name}`, [blX, tier.y, blZ], [brX, tier.y, brZ], 0.04, matBeamSteel, { parent: root });
    beamBetween(`Strut_L_${tier.name}`, [blX, tier.y, blZ], [flX, tier.y, flZ], 0.04, matBeamSteel, { parent: root });
    beamBetween(`Strut_R_${tier.name}`, [brX, tier.y, brZ], [frX, tier.y, frZ], 0.04, matBeamSteel, { parent: root });
  }

  // Cross diagonal lattice bracing on all 4 faces
  beamBetween('Diag_L1_A', [-0.65, postShoeY, -0.65], [0.38, 1.25, -0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_L1_B', [0.75, postShoeY, -0.65], [-0.32, 1.25, -0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_L2_A', [-0.32, 1.25, -0.42], [0.18, 2.25, -0.3], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_L2_B', [0.38, 1.25, -0.42], [-0.15, 2.25, -0.3], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_L3', [-0.15, 2.25, -0.3], [0.08, samsonTopY, -0.24], 0.032, matBeamSteel, { parent: root });

  beamBetween('Diag_R1_A', [-0.65, postShoeY, 0.65], [0.38, 1.25, 0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_R1_B', [0.75, postShoeY, 0.65], [-0.32, 1.25, 0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_R2_A', [-0.32, 1.25, 0.42], [0.18, 2.25, 0.3], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_R2_B', [0.38, 1.25, 0.42], [-0.15, 2.25, 0.3], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_R3', [-0.15, 2.25, 0.3], [0.08, samsonTopY, 0.24], 0.032, matBeamSteel, { parent: root });

  beamBetween('Diag_F1_A', [0.75, postShoeY, -0.65], [0.38, 1.25, 0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_F1_B', [0.75, postShoeY, 0.65], [0.38, 1.25, -0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_F2_A', [0.38, 1.25, -0.42], [0.18, 2.25, 0.3], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_F2_B', [0.38, 1.25, 0.42], [0.18, 2.25, -0.3], 0.032, matBeamSteel, { parent: root });

  beamBetween('Diag_B1_A', [-0.65, postShoeY, -0.65], [-0.32, 1.25, 0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_B1_B', [-0.65, postShoeY, 0.65], [-0.32, 1.25, -0.42], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_B2_A', [-0.32, 1.25, -0.42], [-0.15, 2.25, 0.3], 0.032, matBeamSteel, { parent: root });
  beamBetween('Diag_B2_B', [-0.32, 1.25, 0.42], [-0.15, 2.25, -0.3], 0.032, matBeamSteel, { parent: root });

  // ==========================================
  // 4. SAMSON HEAD, CENTER SADDLE BEARING & SIDE PLATFORM
  // ==========================================
  const platX = 0.02;
  const platY = samsonTopY + 0.02;

  // Center Saddle Bearing Structure
  // Left pillow block
  createPart('SaddlePillow_L', boxGeo(0.36, 0.24, 0.14), matDarkSteel, {
    position: [platX, platY + 0.12, -0.22],
    parent: root,
  });
  createPart('SaddleCap_L', cylinderXGeo(0.1, 0.1, 0.14, 14), matDarkSteel, {
    position: [platX, platY + 0.24, -0.22],
    parent: root,
  });
  // Right pillow block
  createPart('SaddlePillow_R', boxGeo(0.36, 0.24, 0.14), matDarkSteel, {
    position: [platX, platY + 0.12, 0.22],
    parent: root,
  });
  createPart('SaddleCap_R', cylinderXGeo(0.1, 0.1, 0.14, 14), matDarkSteel, {
    position: [platX, platY + 0.24, 0.22],
    parent: root,
  });

  // Saddle center trunnion shaft along Z
  const pivotCenterY = platY + 0.24;
  createPart('SaddleCenterShaft', cylinderZGeo(0.08, 0.08, 0.76, 16), matPolishedSteel, {
    position: [platX, pivotCenterY, 0],
    parent: root,
  });

  // SIDE MAINTENANCE PLATFORM (Mounted strictly on the +Z / ladder side!)
  // Leaves the center open so the walking beam never intersects the handrail!
  const platPosZ = 0.56;
  const platWidthZ = 0.54;
  const platLengthX = 0.92;

  createPart('SamsonPlatform', boxGeo(platLengthX, 0.05, platWidthZ), matDarkSteel, {
    position: [platX, platY, platPosZ],
    parent: root,
  });
  // Platform support brackets extending from Samson post legs
  beamBetween('PlatSupport_F', [0.08, samsonTopY, 0.24], [platX + 0.42, platY - 0.03, platPosZ + 0.2], 0.035, matDarkSteel, { parent: root });
  beamBetween('PlatSupport_B', [-0.04, samsonTopY, 0.24], [platX - 0.42, platY - 0.03, platPosZ + 0.2], 0.035, matDarkSteel, { parent: root });

  // Toe boards (kickplates) on platform perimeter
  createPart('ToeBoard_Outer', boxGeo(platLengthX + 0.004, 0.1, 0.025), matSafetyYellow, {
    position: [platX, platY + 0.05, platPosZ + platWidthZ / 2 - 0.010],
    parent: root,
  });
  createPart('ToeBoard_Front', boxGeo(0.025, 0.1, platWidthZ + 0.004), matSafetyYellow, {
    position: [platX + platLengthX / 2 - 0.010, platY + 0.05, platPosZ],
    parent: root,
  });
  createPart('ToeBoard_Back', boxGeo(0.025, 0.1, platWidthZ + 0.004), matSafetyYellow, {
    position: [platX - platLengthX / 2 + 0.010, platY + 0.05, platPosZ],
    parent: root,
  });

  // Service Ladder climbing up to the platform on the +Z side
  const ladderBottom = [-0.65, skidY + 0.14, 0.85];
  const ladderTop = [-0.15, platY, platPosZ + 0.15];

  createLadder('SamsonLadder', {
    bottom: ladderBottom,
    top: ladderTop,
    width: 0.38,
    rungCount: 11,
    railRadius: 0.022,
    rungRadius: 0.016,
    material: matSafetyYellow,
    parent: root,
  });

  // Mounting standoff brackets securing ladder to the Samson post legs
  beamBetween('LadderStandoff_Bot', [-0.65, 0.8, 0.65], [-0.65, 0.8, 0.85], 0.025, matDarkSteel, { parent: root });
  beamBetween('LadderStandoff_Mid', [-0.35, 1.8, 0.45], [-0.35, 1.8, 0.72], 0.025, matDarkSteel, { parent: root });
  beamBetween('LadderStandoff_Top', [-0.15, 2.9, 0.32], [-0.15, 2.9, 0.66], 0.025, matDarkSteel, { parent: root });

  // Safety Handrail System (3-sided around platform: Back, Outer Right, Front)
  // Completely clear of the walking beam center!
  const railH = 0.95;
  const rZ_outer = platPosZ + platWidthZ / 2 - 0.02;
  const rZ_inner = platPosZ - platWidthZ / 2 + 0.04;
  const rX_back = platX - platLengthX / 2 + 0.03;
  const rX_mid = platX;
  const rX_front = platX + platLengthX / 2 - 0.03;

  // Vertical stanchion posts
  beamBetween('RailPost_BR', [rX_back, platY, rZ_outer], [rX_back, platY + railH, rZ_outer], 0.022, matSafetyYellow, { parent: root });
  beamBetween('RailPost_MR', [rX_mid, platY, rZ_outer], [rX_mid, platY + railH, rZ_outer], 0.022, matSafetyYellow, { parent: root });
  beamBetween('RailPost_FR', [rX_front, platY, rZ_outer], [rX_front, platY + railH, rZ_outer], 0.022, matSafetyYellow, { parent: root });
  beamBetween('RailPost_BI', [rX_back, platY, rZ_inner], [rX_back, platY + railH, rZ_inner], 0.022, matSafetyYellow, { parent: root });
  beamBetween('RailPost_FI', [rX_front, platY, rZ_inner], [rX_front, platY + railH, rZ_inner], 0.022, matSafetyYellow, { parent: root });

  // Outer top and mid rails
  beamBetween('RailTop_Outer', [rX_back, platY + railH, rZ_outer], [rX_front, platY + railH, rZ_outer], 0.022, matSafetyYellow, { parent: root });
  beamBetween('RailMid_Outer', [rX_back, platY + railH * 0.5, rZ_outer], [rX_front, platY + railH * 0.5, rZ_outer], 0.018, matSafetyYellow, { parent: root });

  // Back top and mid rails
  beamBetween('RailTop_Back', [rX_back, platY + railH, rZ_inner], [rX_back, platY + railH, rZ_outer], 0.022, matSafetyYellow, { parent: root });
  beamBetween('RailMid_Back', [rX_back, platY + railH * 0.5, rZ_inner], [rX_back, platY + railH * 0.5, rZ_outer], 0.018, matSafetyYellow, { parent: root });

  // Front top and mid rails
  beamBetween('RailTop_Front', [rX_front, platY + railH, rZ_inner], [rX_front, platY + railH, rZ_outer], 0.022, matSafetyYellow, { parent: root });
  beamBetween('RailMid_Front', [rX_front, platY + railH * 0.5, rZ_inner], [rX_front, platY + railH * 0.5, rZ_outer], 0.018, matSafetyYellow, { parent: root });

  // ==========================================
  // 5. WALKING BEAM (MID-STROKE PIVOTED ASSEMBLY)
  // ==========================================
  const tiltDeg = -9.5;
  const tiltRad = (tiltDeg * Math.PI) / 180;

  const walkingBeamGroup = new THREE.Group();
  walkingBeamGroup.position.set(platX, pivotCenterY, 0);
  walkingBeamGroup.rotation.z = tiltRad;
  root.add(walkingBeamGroup);

  // Center saddle clamp housing
  createPart('SaddleCenterHousing', boxGeo(0.65, 0.28, 0.44), matDarkSteel, {
    position: [0, -0.06, 0],
    parent: walkingBeamGroup,
  });
  for (const bx of [-0.24, 0.24]) {
    for (const bz of [-0.17, 0.17]) {
      createPart(`SaddleClampBolt_${bx}_${bz}`, boltHexY, matDarkSteel, {
        position: [bx, 0.09, bz],
        parent: walkingBeamGroup,
      });
    }
  }

  // Walking Beam I-beam profile (Length: 5.6m total)
  const beamLength = 5.6;
  const beamLocalCenterX = 0.2;
  const webH = 0.44;
  const webThick = 0.08;
  const flangeW = 0.38;
  const flangeThick = 0.035;

  createPart('WalkingBeam_Web', boxGeo(beamLength, webH, webThick), matBeamSteel, {
    position: [beamLocalCenterX, 0.22, 0],
    parent: walkingBeamGroup,
  });
  createPart('WalkingBeam_TopFlange', boxGeo(beamLength, flangeThick, flangeW), matBeamSteel, {
    position: [beamLocalCenterX, 0.22 + webH / 2 + flangeThick / 2, 0],
    parent: walkingBeamGroup,
  });
  createPart('WalkingBeam_BotFlange', boxGeo(beamLength, flangeThick, flangeW), matBeamSteel, {
    position: [beamLocalCenterX, 0.22 - webH / 2 - flangeThick / 2, 0],
    parent: walkingBeamGroup,
  });

  // Vertical web stiffener plates
  const stiffenerPositions = [-2.4, -1.8, -1.1, -0.4, 0.4, 1.1, 1.8, 2.5];
  const stiffGeo = boxGeo(0.025, webH - 0.01, 0.14);
  for (let i = 0; i < stiffenerPositions.length; i++) {
    const sx = stiffenerPositions[i];
    createPart(`BeamStiff_L_${i}`, stiffGeo, matBeamSteel, {
      position: [sx, 0.22, -0.1],
      parent: walkingBeamGroup,
    });
    createPart(`BeamStiff_R_${i}`, stiffGeo, matBeamSteel, {
      position: [sx, 0.22, 0.1],
      parent: walkingBeamGroup,
    });
  }

  // ==========================================
  // 6. HORSEHEAD ASSEMBLY (FRONT +X END OF BEAM)
  // ==========================================
  const horseHeadGroup = new THREE.Group();
  horseHeadGroup.position.set(2.65, 0.22, 0);
  walkingBeamGroup.add(horseHeadGroup);

  // Top mount collar / socket to walking beam
  createPart('HorseHead_MountSaddle', boxGeo(0.55, 0.52, 0.42), matDarkSteel, {
    position: [-0.15, 0, 0],
    parent: horseHeadGroup,
  });

  // Structural cheek plates (gussets)
  const cheekThick = 0.025;
  const cheekSpacing = 0.28;
  for (const side of [-1, 1]) {
    const sName = side < 0 ? 'L' : 'R';
    const cz = (side * cheekSpacing) / 2;

    createPart(`HorseCheek_Upper_${sName}`, boxGeo(0.75, 0.7, cheekThick), matBeamSteel, {
      position: [0.25, 0.35, cz],
      rotation: [0, 0, 18],
      parent: horseHeadGroup,
    });
    createPart(`HorseCheek_Lower_${sName}`, boxGeo(0.75, 0.8, cheekThick), matBeamSteel, {
      position: [0.22, -0.42, cz],
      rotation: [0, 0, -22],
      parent: horseHeadGroup,
    });
    createPart(`HorseCheek_Mid_${sName}`, boxGeo(0.85, 0.75, cheekThick), matBeamSteel, {
      position: [0.28, -0.05, cz],
      parent: horseHeadGroup,
    });
  }

  // Cross stiffener plates between cheek plates
  for (let dy = -0.6; dy <= 0.6; dy += 0.3) {
    createPart(`HorseCrossStiff_${dy.toFixed(1)}`, boxGeo(0.2, 0.03, cheekSpacing), matBeamSteel, {
      position: [0.25, dy, 0],
      parent: horseHeadGroup,
    });
  }

  // Horsehead Curved Arc Track (Perimeter cable track)
  const arcSegments = 16;
  const arcMinDeg = -46;
  const arcMaxDeg = 46;
  const arcStep = (arcMaxDeg - arcMinDeg) / (arcSegments - 1);
  const arcRadius = 0.75;
  const arcCenter = [-0.1, -0.05];

  let topArcX = 0;
  let topArcY = 0;

  for (let i = 0; i < arcSegments; i++) {
    const deg = arcMinDeg + i * arcStep;
    const rad = (deg * Math.PI) / 180;
    const ax = arcCenter[0] + Math.cos(rad) * arcRadius;
    const ay = arcCenter[1] + Math.sin(rad) * arcRadius * 1.35;

    if (i === arcSegments - 1) {
      topArcX = ax;
      topArcY = ay;
    }

    createPart(`HorseArcFace_${i}`, boxGeo(0.04, 0.16, 0.38), matBeamSteel, {
      position: [ax, ay, 0],
      rotation: [0, 0, -deg],
      parent: horseHeadGroup,
    });
    createPart(`HorseArcRim_L_${i}`, boxGeo(0.06, 0.15, 0.03), matDarkSteel, {
      position: [ax + 0.01, ay, -0.18],
      rotation: [0, 0, -deg],
      parent: horseHeadGroup,
    });
    createPart(`HorseArcRim_R_${i}`, boxGeo(0.06, 0.15, 0.03), matDarkSteel, {
      position: [ax + 0.01, ay, 0.18],
      rotation: [0, 0, -deg],
      parent: horseHeadGroup,
    });
    createPart(`HorseArcDivider_${i}`, boxGeo(0.05, 0.15, 0.025), matDarkSteel, {
      position: [ax + 0.01, ay, 0],
      rotation: [0, 0, -deg],
      parent: horseHeadGroup,
    });
  }

  // Solid top cap plate bridging cheek plates and top arc
  createPart('HorseTopCap', boxGeo(0.25, 0.05, 0.38), matDarkSteel, {
    position: [topArcX - 0.06, topArcY - 0.02, 0],
    parent: horseHeadGroup,
  });

  // Top cable keeper horns / anchor brackets (firmly anchored to top cap plate)
  createPart('HorseCableHorn_L', cylinderXGeo(0.04, 0.04, 0.14, 10), matDarkSteel, {
    position: [topArcX - 0.04, topArcY + 0.03, -0.1],
    parent: horseHeadGroup,
  });
  createPart('HorseCableHorn_R', cylinderXGeo(0.04, 0.04, 0.14, 10), matDarkSteel, {
    position: [topArcX - 0.04, topArcY + 0.03, 0.1],
    parent: horseHeadGroup,
  });

  // ==========================================
  // 7. EQUALIZER BEAM & BEARINGS (REAR OF WALKING BEAM)
  // ==========================================
  const eqLocalX = -2.48;
  const eqLocalY = 0.12;

  createPart('EqualizerTrunnionHousing', boxGeo(0.4, 0.3, 0.36), matDarkSteel, {
    position: [eqLocalX, eqLocalY - 0.12, 0],
    parent: walkingBeamGroup,
  });
  createPart('EqualizerTrunnionShaft', cylinderXGeo(0.07, 0.07, 0.36, 12), matPolishedSteel, {
    position: [eqLocalX, eqLocalY - 0.22, 0],
    parent: walkingBeamGroup,
  });

  // Equalizer Beam (transverse crossbar spanning across Z)
  const eqBarSpan = 1.48;
  createPart('EqualizerCrossBeam', boxGeo(0.18, 0.22, eqBarSpan), matBeamSteel, {
    position: [eqLocalX, eqLocalY - 0.22, 0],
    parent: walkingBeamGroup,
  });
  createPart('Equalizer_TFlange', boxGeo(0.24, 0.02, eqBarSpan), matBeamSteel, {
    position: [eqLocalX, eqLocalY - 0.1, 0],
    parent: walkingBeamGroup,
  });
  createPart('Equalizer_BFlange', boxGeo(0.24, 0.02, eqBarSpan), matBeamSteel, {
    position: [eqLocalX, eqLocalY - 0.34, 0],
    parent: walkingBeamGroup,
  });

  for (const side of [-1, 1]) {
    const sName = side < 0 ? 'L' : 'R';
    const ez = side * 0.72;
    createPart(`EqBearingHousing_${sName}`, cylinderZGeo(0.09, 0.09, 0.14, 12), matDarkSteel, {
      position: [eqLocalX, eqLocalY - 0.22, ez],
      parent: walkingBeamGroup,
    });
    createPart(`EqWristPin_${sName}`, cylinderZGeo(0.05, 0.05, 0.18, 12), matPolishedSteel, {
      position: [eqLocalX, eqLocalY - 0.22, ez],
      parent: walkingBeamGroup,
    });
  }

  // ==========================================
  // 8. WELLHEAD & BRIDLE CABLE SUSPENSION
  // ==========================================
  const wellheadX = 3.3;

  createPart('Wellhead_BaseFlange', cylinderYGeo(0.38, 0.42, 0.16, 16), matDarkSteel, {
    position: [wellheadX, 0.34, 0],
    parent: root,
  });
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    createPart(`WellheadBaseBolt_${a}`, boltHexY, matDarkSteel, {
      position: [wellheadX + Math.cos(ang) * 0.34, 0.43, Math.sin(ang) * 0.34],
      parent: root,
    });
  }

  createPart('Wellhead_CasingSpool', cylinderYGeo(0.22, 0.26, 0.35, 14), matWellhead, {
    position: [wellheadX, 0.58, 0],
    parent: root,
  });
  createPart('Wellhead_Flange1', cylinderYGeo(0.32, 0.32, 0.08, 16), matWellhead, {
    position: [wellheadX, 0.78, 0],
    parent: root,
  });

  // Master gate valve
  createPart('Wellhead_MasterValve', boxGeo(0.36, 0.32, 0.36), matWellhead, {
    position: [wellheadX, 0.98, 0],
    parent: root,
  });
  createPart('Wellhead_ValveBonnet', cylinderXGeo(0.08, 0.08, 0.18, 10), matWellhead, {
    position: [wellheadX + 0.24, 0.98, 0],
    parent: root,
  });
  createPart('Wellhead_HandwheelRim', torusGeo(0.14, 0.02, 8, 16), matSafetyYellow, {
    position: [wellheadX + 0.34, 0.98, 0],
    rotation: [0, 90, 0],
    parent: root,
  });
  createPart('Wellhead_HandwheelSpoke1', cylinderYGeo(0.012, 0.012, 0.28, 6), matSafetyYellow, {
    position: [wellheadX + 0.34, 0.98, 0],
    parent: root,
  });
  createPart('Wellhead_HandwheelSpoke2', cylinderZGeo(0.012, 0.012, 0.28, 6), matSafetyYellow, {
    position: [wellheadX + 0.34, 0.98, 0],
    parent: root,
  });

  // Flow Tee
  createPart('Wellhead_FlowTee', cylinderYGeo(0.16, 0.16, 0.34, 12), matWellhead, {
    position: [wellheadX, 1.28, 0],
    parent: root,
  });

  // Horizontal production flow line exiting to right (+Z)
  createPart('Wellhead_FlowLineSpool', cylinderZGeo(0.07, 0.07, 0.45, 10), matWellhead, {
    position: [wellheadX, 1.28, 0.3],
    parent: root,
  });
  createPart('Wellhead_FlowValve', boxGeo(0.2, 0.2, 0.2), matWellhead, {
    position: [wellheadX, 1.28, 0.58],
    parent: root,
  });
  // Valve stem connecting valve body to handwheel (resolves QA warning)
  createPart('Wellhead_FlowValveStem', cylinderYGeo(0.016, 0.016, 0.14, 8), matPolishedSteel, {
    position: [wellheadX, 1.35, 0.58],
    parent: root,
  });
  createPart('Wellhead_FlowHandwheel', torusGeo(0.09, 0.015, 8, 14), matSafetyYellow, {
    position: [wellheadX, 1.42, 0.58],
    rotation: [90, 0, 0],
    parent: root,
  });
  createPart('Wellhead_FlowPipeExit', cylinderZGeo(0.05, 0.05, 0.5, 8), matDarkSteel, {
    position: [wellheadX, 1.28, 0.9],
    parent: root,
  });

  // Pressure gauge
  createPart('PressureGaugeStem', cylinderYGeo(0.016, 0.016, 0.12, 6), matBrass, {
    position: [wellheadX, 1.5, -0.1],
    parent: root,
  });
  createPart('PressureGaugeBody', cylinderZGeo(0.07, 0.07, 0.035, 12), matBrass, {
    position: [wellheadX, 1.6, -0.1],
    parent: root,
  });
  createPart('PressureGaugeDial', cylinderZGeo(0.062, 0.062, 0.038, 12), matPolishedSteel, {
    position: [wellheadX, 1.6, -0.09],
    parent: root,
  });

  // Stuffing Box / Packing Gland
  createPart('StuffingBox', cylinderYGeo(0.13, 0.13, 0.32, 14), matBrass, {
    position: [wellheadX, 1.58, 0],
    parent: root,
  });
  createPart('PackingGlandCap', cylinderYGeo(0.15, 0.15, 0.08, 14), matDarkSteel, {
    position: [wellheadX, 1.76, 0],
    parent: root,
  });

  // Polished Rod
  createPart('PolishedRod', cylinderYGeo(0.024, 0.024, 1.8, 16), matPolishedSteel, {
    position: [wellheadX, 2.5, 0],
    parent: root,
  });

  // Carrier Bar holding the polished rod clamp
  const carrierY = 2.45;
  createPart('CarrierBarBody', boxGeo(0.16, 0.1, 0.56), matDarkSteel, {
    position: [wellheadX, carrierY, 0],
    parent: root,
  });
  createPart('PolishedRodClamp', boxGeo(0.14, 0.12, 0.14), matDarkSteel, {
    position: [wellheadX, carrierY + 0.11, 0],
    parent: root,
  });
  createPart('ClampBolt1', boltHexX, matPolishedSteel, {
    position: [wellheadX + 0.08, carrierY + 0.11, -0.04],
    parent: root,
  });
  createPart('ClampBolt2', boltHexX, matPolishedSteel, {
    position: [wellheadX + 0.08, carrierY + 0.11, 0.04],
    parent: root,
  });

  createPart('CarrierSocket_L', cylinderYGeo(0.035, 0.035, 0.12, 10), matDarkSteel, {
    position: [wellheadX, carrierY, -0.2],
    parent: root,
  });
  createPart('CarrierSocket_R', cylinderYGeo(0.035, 0.035, 0.12, 10), matDarkSteel, {
    position: [wellheadX, carrierY, 0.2],
    parent: root,
  });

  // Bridle wire ropes running from carrier bar sockets straight up tangentially to horsehead arc
  const bridleTopY = 3.52;
  beamBetween('BridleWire_L', [wellheadX, carrierY + 0.06, -0.2], [wellheadX, bridleTopY, -0.2], 0.012, matWireCable, { parent: root });
  beamBetween('BridleWire_R', [wellheadX, carrierY + 0.06, 0.2], [wellheadX, bridleTopY, 0.2], 0.012, matWireCable, { parent: root });

  createPart('BridleSpreader', boxGeo(0.03, 0.03, 0.44), matDarkSteel, {
    position: [wellheadX, 3.0, 0],
    parent: root,
  });

  // ==========================================
  // 9. GEAR REDUCER (DOUBLE REDUCTION GEARBOX)
  // ==========================================
  const reducerX = -1.85;
  const reducerBaseY = skidY + 0.12;

  createPart('ReducerSubBase_L', boxGeo(1.4, 0.12, 0.22), matDarkSteel, {
    position: [reducerX, reducerBaseY + 0.06, -0.55],
    parent: root,
  });
  createPart('ReducerSubBase_R', boxGeo(1.4, 0.12, 0.22), matDarkSteel, {
    position: [reducerX, reducerBaseY + 0.06, 0.55],
    parent: root,
  });

  createPart('Reducer_LowerSump', boxGeo(1.25, 0.52, 0.94), matDarkSteel, {
    position: [reducerX, reducerBaseY + 0.38, 0],
    parent: root,
  });
  createPart('Reducer_SplitFlange', boxGeo(1.36, 0.04, 1.04), matDarkSteel, {
    position: [reducerX, reducerBaseY + 0.64, 0],
    parent: root,
  });
  createPart('Reducer_UpperCover', boxGeo(1.15, 0.44, 0.86), matDarkSteel, {
    position: [reducerX, reducerBaseY + 0.88, 0],
    parent: root,
  });
  createPart('Reducer_Hatch', boxGeo(0.5, 0.03, 0.45), matDarkSteel, {
    position: [reducerX, reducerBaseY + 1.11, 0],
    parent: root,
  });
  createPart('Reducer_Breather', cylinderYGeo(0.02, 0.02, 0.14, 8), matDarkSteel, {
    position: [reducerX + 0.35, reducerBaseY + 1.17, 0.15],
    parent: root,
  });
  createPart('Reducer_BreatherCap', cylinderYGeo(0.045, 0.045, 0.04, 8), matDarkSteel, {
    position: [reducerX + 0.35, reducerBaseY + 1.25, 0.15],
    parent: root,
  });

  const crankShaftY = reducerBaseY + 0.64;

  createPart('ReducerBearingHub_L', cylinderZGeo(0.24, 0.24, 0.14, 16), matDarkSteel, {
    position: [reducerX, crankShaftY, -0.522],
    parent: root,
  });
  createPart('ReducerBearingHub_R', cylinderZGeo(0.24, 0.24, 0.14, 16), matDarkSteel, {
    position: [reducerX, crankShaftY, 0.52],
    parent: root,
  });

  for (let b = 0; b < 6; b++) {
    const bang = (b * Math.PI) / 3;
    createPart(`ReducerBolt_L_${b}`, boltHexZ, matDarkSteel, {
      position: [reducerX + Math.cos(bang) * 0.18, crankShaftY + Math.sin(bang) * 0.18, -0.58],
      parent: root,
    });
    createPart(`ReducerBolt_R_${b}`, boltHexZ, matDarkSteel, {
      position: [reducerX + Math.cos(bang) * 0.18, crankShaftY + Math.sin(bang) * 0.18, 0.58],
      parent: root,
    });
  }

  createPart('SlowSpeedCrankshaft', cylinderZGeo(0.1, 0.1, 1.48, 16), matDarkSteel, {
    position: [reducerX, crankShaftY, 0],
    parent: root,
  });

  // ==========================================
  // 10. CRANKS, SAFETY ORANGE COUNTERWEIGHTS & PITMAN ARMS
  // ==========================================
  const crankAngleDeg = 50;
  const crankRad = (crankAngleDeg * Math.PI) / 180;
  const strokeRadius = 0.66;

  const pinX = reducerX + Math.cos(crankRad) * strokeRadius;
  const pinY = crankShaftY + Math.sin(crankRad) * strokeRadius;

  const eqRelX = eqLocalX;
  const eqRelY = eqLocalY - 0.22;
  const eqWorldX = platX + eqRelX * Math.cos(tiltRad) - eqRelY * Math.sin(tiltRad);
  const eqWorldY = pivotCenterY + eqRelX * Math.sin(tiltRad) + eqRelY * Math.cos(tiltRad);

  for (const side of [-1, 1]) {
    const sName = side < 0 ? 'L' : 'R';
    const crankZ = side * 0.72;

    createPart(`CrankHub_${sName}`, cylinderZGeo(0.18, 0.18, 0.12, 16), matDarkSteel, {
      position: [reducerX, crankShaftY, crankZ],
      parent: root,
    });

    const crankArmLen = 1.6;
    createPart(`CrankArm_${sName}`, boxGeo(crankArmLen, 0.24, 0.09), matDarkSteel, {
      position: [reducerX, crankShaftY, crankZ],
      rotation: [0, 0, crankAngleDeg],
      parent: root,
    });

    // 3 stroke adjustment holes
    for (const rHole of [0.48, 0.66, 0.84]) {
      const hx = reducerX + Math.cos(crankRad) * rHole;
      const hy = crankShaftY + Math.sin(crankRad) * rHole;
      createPart(`StrokeHoleRing_${sName}_${rHole}`, cylinderZGeo(0.065, 0.065, 0.095, 12), matDarkSteel, {
        position: [hx, hy, crankZ],
        parent: root,
      });
    }

    // Active Crank Pin
    const pinZ = crankZ + side * 0.08;
    createPart(`ActiveCrankPin_${sName}`, cylinderZGeo(0.055, 0.055, 0.18, 14), matPolishedSteel, {
      position: [pinX, pinY, pinZ],
      parent: root,
    });
    createPart(`CrankPinNut_${sName}`, cylinderZGeo(0.075, 0.075, 0.04, 8), matDarkSteel, {
      position: [pinX, pinY, pinZ + side * 0.09],
      parent: root,
    });

    // HIGH-VISIBILITY SAFETY HAZARD COUNTERWEIGHTS
    // Bold safety orange finish ensures high visual read on both sides!
    const cwAngleDeg = crankAngleDeg + 180;
    const cwRad = (cwAngleDeg * Math.PI) / 180;
    const cwCenterX = reducerX + Math.cos(cwRad) * 0.52;
    const cwCenterY = crankShaftY + Math.sin(cwRad) * 0.52;

    // Main heavy counterweight body (safety hazard orange)
    createPart(`CounterWeight_Main_${sName}`, boxGeo(0.9, 0.64, 0.224), matHazardOrange, {
      position: [cwCenterX, cwCenterY, crankZ],
      rotation: [0, 0, crankAngleDeg],
      parent: root,
    });
    // Auxiliary bolted segment (safety hazard orange)
    createPart(`CounterWeight_Aux_${sName}`, boxGeo(0.82, 0.52, 0.16), matHazardOrange, {
      position: [cwCenterX + Math.cos(cwRad) * 0.18, cwCenterY + Math.sin(cwRad) * 0.18, crankZ + side * 0.12],
      rotation: [0, 0, crankAngleDeg],
      parent: root,
    });
    // Heavy clamping plate (contrasting dark steel)
    createPart(`CounterWeight_Clamp_${sName}`, boxGeo(0.4, 0.14, 0.28), matDarkSteel, {
      position: [cwCenterX, cwCenterY, crankZ],
      rotation: [0, 0, crankAngleDeg],
      parent: root,
    });
    // Clamping bolts
    for (const d of [-0.25, 0.25]) {
      const bx = cwCenterX + Math.cos(cwRad + Math.PI / 2) * d;
      const by = cwCenterY + Math.sin(cwRad + Math.PI / 2) * d;
      createPart(`CounterWeightBolt_${sName}_${d}`, cylinderZGeo(0.03, 0.03, 0.32, 8), matDarkSteel, {
        position: [bx, by, crankZ],
        parent: root,
      });
    }

    // PITMAN ARMS
    const eqWorldZ = side * 0.72;
    const pitmanBottomZ = pinZ;

    createPart(`PitmanBigEnd_${sName}`, cylinderZGeo(0.09, 0.09, 0.14, 14), matDarkSteel, {
      position: [pinX, pinY, pitmanBottomZ],
      parent: root,
    });
    createPart(`PitmanSmallEnd_${sName}`, cylinderZGeo(0.08, 0.08, 0.14, 14), matDarkSteel, {
      position: [eqWorldX, eqWorldY, eqWorldZ],
      parent: root,
    });

    beamBetween(`PitmanArmColumn_${sName}`, [pinX, pinY, pitmanBottomZ], [eqWorldX, eqWorldY, eqWorldZ], 0.055, matBeamSteel, { parent: root });
    beamBetween(`PitmanRib1_${sName}`, [pinX + 0.03, pinY, pitmanBottomZ], [eqWorldX + 0.03, eqWorldY, eqWorldZ], 0.025, matBeamSteel, { parent: root });
    beamBetween(`PitmanRib2_${sName}`, [pinX - 0.03, pinY, pitmanBottomZ], [eqWorldX - 0.03, eqWorldY, eqWorldZ], 0.025, matBeamSteel, { parent: root });
  }

  // ==========================================
  // 11. PRIME MOVER (ELECTRIC MOTOR) & BELT DRIVE
  // ==========================================
  const motorX = -3.25;
  const motorBaseY = skidY + 0.12;

  createPart('MotorSlideRail_L', boxGeo(0.9, 0.08, 0.12), matDarkSteel, {
    position: [motorX, motorBaseY + 0.04, -0.45],
    parent: root,
  });
  createPart('MotorSlideRail_R', boxGeo(0.9, 0.08, 0.12), matDarkSteel, {
    position: [motorX, motorBaseY + 0.04, 0.15],
    parent: root,
  });
  createPart('MotorTensionScrew_L', cylinderXGeo(0.016, 0.016, 0.35, 8), matPolishedSteel, {
    position: [motorX - 0.48, motorBaseY + 0.04, -0.45],
    parent: root,
  });
  createPart('MotorTensionScrew_R', cylinderXGeo(0.016, 0.016, 0.35, 8), matPolishedSteel, {
    position: [motorX - 0.48, motorBaseY + 0.04, 0.15],
    parent: root,
  });

  createPart('MotorCradle', boxGeo(0.72, 0.116, 0.65), matDarkSteel, {
    position: [motorX, motorBaseY + 0.138, -0.15],
    parent: root,
  });

  const motorCenterY = motorBaseY + 0.46;
  const motorCenterZ = -0.15;
  createPart('MotorStatorBody', cylinderXGeo(0.26, 0.26, 0.64, 18), matBeamSteel, {
    position: [motorX, motorCenterY, motorCenterZ],
    parent: root,
  });

  for (let f = 0; f < 10; f++) {
    const fang = (f * Math.PI) / 5;
    const fx = motorX;
    const fy = motorCenterY + Math.cos(fang) * 0.27;
    const fz = motorCenterZ + Math.sin(fang) * 0.27;
    createPart(`MotorFin_${f}`, boxGeo(0.56, 0.02, 0.03), matBeamSteel, {
      position: [fx, fy, fz],
      rotation: [(-fang * 180) / Math.PI, 0, 0],
      parent: root,
    });
  }

  createPart('MotorEndBell_Front', cylinderXGeo(0.24, 0.24, 0.08, 16), matDarkSteel, {
    position: [motorX + 0.34, motorCenterY, motorCenterZ],
    parent: root,
  });
  createPart('MotorEndBell_Rear', cylinderXGeo(0.24, 0.24, 0.08, 16), matDarkSteel, {
    position: [motorX - 0.34, motorCenterY, motorCenterZ],
    parent: root,
  });
  createPart('MotorFanCowl', cylinderXGeo(0.25, 0.25, 0.12, 16), matDarkSteel, {
    position: [motorX - 0.42, motorCenterY, motorCenterZ],
    parent: root,
  });

  createPart('MotorJunctionBox', boxGeo(0.18, 0.2, 0.16), matSafetyYellow, {
    position: [motorX + 0.1, motorCenterY + 0.25, motorCenterZ + 0.18],
    parent: root,
  });

  createPart('MotorDriveShaft', cylinderZGeo(0.045, 0.045, 0.38, 12), matPolishedSteel, {
    position: [motorX, motorCenterY, motorCenterZ - 0.38],
    parent: root,
  });
  createPart('MotorPulley', cylinderZGeo(0.16, 0.16, 0.14, 16), matDarkSteel, {
    position: [motorX, motorCenterY, -0.48],
    parent: root,
  });

  const inputSheaveX = reducerX - 0.35;
  const inputSheaveY = crankShaftY - 0.12;
  createPart('ReducerInputSheave', cylinderZGeo(0.36, 0.36, 0.14, 18), matDarkSteel, {
    position: [inputSheaveX, inputSheaveY, -0.48],
    parent: root,
  });

  // ==========================================
  // 12. BELT GUARD ENCLOSURE
  // ==========================================
  const bgCenterX = (motorX + inputSheaveX) / 2;
  const bgCenterY = (motorCenterY + inputSheaveY) / 2;
  const bgZ = -0.48;

  createPart('BeltGuard_MainCase', boxGeo(1.48, 0.82, 0.22), matSafetyYellow, {
    position: [bgCenterX, bgCenterY, bgZ],
    parent: root,
  });
  createPart('BeltGuard_FrontCap', cylinderYGeo(0.41, 0.41, 0.22, 14), matSafetyYellow, {
    position: [bgCenterX + 0.74, bgCenterY, bgZ],
    rotation: [90, 0, 0],
    parent: root,
  });
  createPart('BeltGuard_RearCap', cylinderYGeo(0.41, 0.41, 0.22, 14), matSafetyYellow, {
    position: [bgCenterX - 0.74, bgCenterY, bgZ],
    rotation: [90, 0, 0],
    parent: root,
  });

  createPart('BeltGuard_TopRim', boxGeo(1.5, 0.04, 0.25), matSafetyYellow, {
    position: [bgCenterX, bgCenterY + 0.42, bgZ],
    parent: root,
  });
  createPart('BeltGuard_BotRim', boxGeo(1.5, 0.04, 0.25), matSafetyYellow, {
    position: [bgCenterX, bgCenterY - 0.42, bgZ],
    parent: root,
  });

  createPart('BeltGuard_VentPanel', boxGeo(1.2, 0.58, 0.02), matDarkSteel, {
    position: [bgCenterX, bgCenterY, bgZ - 0.115],
    parent: root,
  });

  beamBetween('BeltGuardSupport_F', [inputSheaveX, skidY + 0.12, -0.65], [inputSheaveX, bgCenterY - 0.2, bgZ], 0.03, matDarkSteel, { parent: root });
  beamBetween('BeltGuardSupport_R', [motorX, skidY + 0.12, -0.65], [motorX, bgCenterY - 0.2, bgZ], 0.03, matDarkSteel, { parent: root });

  createPart('SafetyWarningPlate', boxGeo(0.24, 0.16, 0.02), matSafetyYellow, {
    position: [bgCenterX, bgCenterY, bgZ - 0.13],
    parent: root,
  });

  return root;
}
