// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'DeepSeaDiver', category: 'character' };

async function build() {
  const root = createRoot('DeepSeaDiver');

  // =========================================================================
  // MATERIALS
  // Authentic historical standard diving dress palette
  // =========================================================================
  // Spun copper bonnet and corselet bib
  const copper = gameMaterial(0xc26842, { metalness: 0.85, roughness: 0.32 });
  // Polished cast brass for viewports, neck ring, valves, scabbard, buckles
  const brass = gameMaterial(0xd8b248, { metalness: 0.90, roughness: 0.25 });
  // Heavy vulcanized double-twill canvas diving dress (weathered buff/khaki)
  const canvas = gameMaterial(0xcdbe9e, { roughness: 0.92, metalness: 0.04 });
  // Darker canvas for reinforced knee patches, seams, and folds
  const canvasDark = gameMaterial(0xb2a280, { roughness: 0.95, metalness: 0.04 });
  // Heavy vulcanized black rubber for wrist cuffs, collar gaskets, boot tops
  const rubber = gameMaterial(0x232528, { roughness: 0.80, metalness: 0.12 });
  // Dull cast lead for weighted breastplate, back counterweight, boot soles
  const lead = gameMaterial(0x4f545a, { roughness: 0.65, metalness: 0.55 });
  // Oiled harness leather for belt, weight harness, boot straps
  const leather = gameMaterial(0x482b18, { roughness: 0.84, metalness: 0.08 });
  // Tempered bullseye glass for helmet viewing ports
  const glass = glassMaterial(0x9fd0e8, { opacity: 0.55, roughness: 0.08, metalness: 0.15 });
  // Braided manila hemp rope for lifeline
  const rope = gameMaterial(0xc4af85, { roughness: 0.96, metalness: 0.02 });

  // =========================================================================
  // 1. BOOTS & LEGS (Grounded at Y = 0)
  // Anatomical lead-soled diving boots, contoured brass toe caps,
  // double instep buckles, baggy canvas trousers with knee reinforcements.
  // =========================================================================
  for (const side of [-1, 1]) {
    const z = side * 0.22;
    const sideSuffix = side === 1 ? 'R' : 'L';

    // --- Lead Sole (touching Y = 0) ---
    // Forward sole slab: length 0.22, height 0.045, width 0.15, resting on ground [0 .. 0.045]
    createPart(`SoleFore_${sideSuffix}`, await roundedBoxGeo(0.22, 0.045, 0.15, 0.01, { segments: 3 }), lead, {
      position: [0.08, 0.0225, z],
      parent: root,
    });
    // Raised heel block: length 0.12, height 0.055, width 0.14, resting on ground [0 .. 0.055]
    createPart(`SoleHeel_${sideSuffix}`, await roundedBoxGeo(0.12, 0.055, 0.14, 0.01, { segments: 3 }), lead, {
      position: [-0.07, 0.0275, z],
      parent: root,
    });
    // Brass sole welt / securing flange
    createPart(`SoleWelt_${sideSuffix}`, boxGeo(0.31, 0.012, 0.155), brass, {
      position: [0.025, 0.05, z],
      parent: root,
    });

    // --- Brass Toe Cap (curved shield over the toe) ---
    createPart(`ToeCap_${sideSuffix}`, cylinderGeo(0.075, 0.075, 0.096, 14), brass, {
      position: [0.138, 0.085, z],
      rotation: [0, 0, 90],
      parent: root,
    });
    createPart(`ToeCapTip_${sideSuffix}`, sphereGeo(0.074, 10, 8), brass, {
      position: [0.19, 0.085, z],
      scale: [0.35, 0.9, 0.9],
      parent: root,
    });

    // --- Boot Body (Heavy oiled leather upper) ---
    createPart(`BootBody_${sideSuffix}`, await roundedBoxGeo(0.24, 0.15, 0.13, 0.015, { segments: 3 }), leather, {
      position: [0.01, 0.135, z],
      parent: root,
    });
    // Boot tongue / instep curve
    createPart(`BootVamp_${sideSuffix}`, cylinderGeo(0.065, 0.060, 0.16, 10), leather, {
      position: [0.07, 0.15, z],
      rotation: [-20, 0, 0],
      parent: root,
    });
    // Vulcanized rubber ankle gaiter
    createPart(`BootGaiter_${sideSuffix}`, cylinderGeo(0.090, 0.082, 0.09, 14), rubber, {
      position: [-0.01, 0.24, z],
      parent: root,
    });

    // Leather instep straps & brass buckles securing boot
    createPart(`InstepStrap1_${sideSuffix}`, boxGeo(0.025, 0.035, 0.145), leather, {
      position: [0.05, 0.11, z],
      parent: root,
    });
    createPart(`InstepBuckle1_${sideSuffix}`, boxGeo(0.030, 0.022, 0.035), brass, {
      position: [0.05, 0.125, z + side * 0.070],
      parent: root,
    });
    createPart(`InstepStrap2_${sideSuffix}`, boxGeo(0.025, 0.035, 0.140), leather, {
      position: [-0.01, 0.17, z],
      parent: root,
    });
    createPart(`InstepBuckle2_${sideSuffix}`, boxGeo(0.030, 0.022, 0.035), brass, {
      position: [-0.01, 0.19, z + side * 0.068],
      parent: root,
    });

    // --- Lower Leg / Shin (Heavy canvas diving suit trousers) ---
    createPart(`ShinLower_${sideSuffix}`, cylinderGeo(0.102, 0.090, 0.20, 14), canvas, {
      position: [-0.01, 0.37, z],
      parent: root,
    });
    createPart(`ShinUpper_${sideSuffix}`, cylinderGeo(0.118, 0.102, 0.20, 14), canvas, {
      position: [0.00, 0.54, z],
      parent: root,
    });

    // Calf anti-ballooning cinch strap (keeps air from pooling in feet)
    createPart(`CalfStrap_${sideSuffix}`, cylinderGeo(0.110, 0.110, 0.035, 14), leather, {
      position: [0.0, 0.46, z],
      parent: root,
    });
    createPart(`CalfBuckle_${sideSuffix}`, boxGeo(0.035, 0.040, 0.020), brass, {
      position: [0.0, 0.46, z + side * 0.108],
      parent: root,
    });

    // --- Knee Joint & Heavy Reinforcement Patch ---
    createPart(`KneeJoint_${sideSuffix}`, sphereGeo(0.115, 12, 10), canvasDark, {
      position: [0.02, 0.70, z],
      scale: [1.08, 1.0, 0.95],
      parent: root,
    });
    // Stitched canvas/leather knee patch
    createPart(`KneePad_${sideSuffix}`, await roundedBoxGeo(0.07, 0.15, 0.16, 0.015, { segments: 3 }), canvasDark, {
      position: [0.10, 0.70, z],
      parent: root,
    });
    createPart(`KneeBorder_${sideSuffix}`, boxGeo(0.015, 0.16, 0.17), leather, {
      position: [0.07, 0.70, z],
      parent: root,
    });

    // --- Thigh (Bulky canvas tapering into pelvis) ---
    createPart(`ThighLower_${sideSuffix}`, cylinderGeo(0.135, 0.118, 0.22, 14), canvas, {
      position: [0.01, 0.83, z * 0.96],
      parent: root,
    });
    createPart(`ThighUpper_${sideSuffix}`, cylinderGeo(0.150, 0.135, 0.22, 14), canvas, {
      position: [0.00, 0.99, z * 0.92],
      parent: root,
    });
  }

  // =========================================================================
  // 2. PELVIS, TORSO, BELT & KNIFE SCABBARD (Y = 1.05 to 1.55)
  // Bulky canvas suit, leather diver's belt, brass scabbard, and crotch strap.
  // =========================================================================
  createPart('PelvisLower', cylinderGeo(0.23, 0.20, 0.15, 16), canvas, {
    position: [0.0, 1.08, 0],
    parent: root,
  });
  createPart('PelvisUpper', cylinderGeo(0.255, 0.23, 0.15, 16), canvas, {
    position: [0.0, 1.17, 0],
    parent: root,
  });

  // Torso / Suit body
  createPart('TorsoMid', cylinderGeo(0.275, 0.255, 0.18, 18), canvas, {
    position: [0.01, 1.29, 0],
    parent: root,
  });
  createPart('TorsoUpper', cylinderGeo(0.285, 0.275, 0.18, 18), canvas, {
    position: [0.01, 1.42, 0],
    parent: root,
  });

  // Diver's wide leather waist belt
  createPart('BeltBand', cylinderGeo(0.272, 0.272, 0.085, 20), leather, {
    position: [0.0, 1.16, 0],
    parent: root,
  });
  // Cast brass buckle
  createPart('BeltBuckleFrame', await roundedBoxGeo(0.035, 0.10, 0.12, 0.01, { segments: 3 }), brass, {
    position: [0.275, 1.16, 0],
    parent: root,
  });
  createPart('BeltBuckleProng', cylinderGeo(0.007, 0.007, 0.08, 8), brass, {
    position: [0.285, 1.16, 0],
    parent: root,
  });
  createPart('BeltTongue', boxGeo(0.07, 0.07, 0.018), leather, {
    position: [0.255, 1.16, 0.07],
    parent: root,
  });

  // Crotch strap (jock strap)
  createPart('CrotchStrapFront', boxGeo(0.035, 0.22, 0.07), leather, {
    position: [0.20, 1.05, 0],
    rotation: [-14, 0, 0],
    parent: root,
  });
  createPart('CrotchStrapBack', boxGeo(0.035, 0.22, 0.07), leather, {
    position: [-0.20, 1.05, 0],
    rotation: [14, 0, 0],
    parent: root,
  });

  // --- Diver's Knife & Brass Scabbard (Forward-right hip, clearly visible) ---
  // Belt frog / attachment bracket
  createPart('ScabbardBracket', boxGeo(0.035, 0.09, 0.04), leather, {
    position: [0.20, 1.16, 0.20],
    rotation: [0, 40, 0],
    parent: root,
  });
  // Cast brass threaded mouth
  createPart('ScabbardMouth', cylinderGeo(0.030, 0.028, 0.05, 12), brass, {
    position: [0.22, 1.12, 0.21],
    rotation: [8, 25, -12],
    parent: root,
  });
  // Brass sheath tube angled along upper right leg
  createPart('ScabbardTube', cylinderGeo(0.026, 0.018, 0.34, 12), brass, {
    position: [0.26, 0.94, 0.25],
    rotation: [8, 25, -12],
    parent: root,
  });
  createPart('ScabbardTip', sphereGeo(0.019, 8, 6), brass, {
    position: [0.30, 0.76, 0.29],
    parent: root,
  });
  // Knife hilt (turned brass / ribbed grip with pommel ring)
  createPart('KnifeGuard', cylinderGeo(0.032, 0.032, 0.012, 10), brass, {
    position: [0.21, 1.16, 0.20],
    rotation: [8, 25, -12],
    parent: root,
  });
  createPart('KnifeGrip', cylinderGeo(0.017, 0.015, 0.13, 10), brass, {
    position: [0.19, 1.23, 0.19],
    rotation: [8, 25, -12],
    parent: root,
  });
  createPart('KnifePommel', sphereGeo(0.020, 8, 6), brass, {
    position: [0.17, 1.30, 0.18],
    parent: root,
  });
  createPart('KnifePommelRing', torusGeo(0.014, 0.003, 6, 10), brass, {
    position: [0.16, 1.32, 0.175],
    rotation: [0, 60, 0],
    parent: root,
  });

  // =========================================================================
  // 3. WEIGHTED BREASTPLATE / CORSELET (Y = 1.35 to 1.62)
  // Spun copper corselet collar, brass brails, 12 bolted collar studs,
  // heavy lead chest weight and back weight with suspension lanyards.
  // =========================================================================
  // Copper corselet body (flared bell collar)
  createPart('CorseletBell', cylinderGeo(0.21, 0.30, 0.22, 18), copper, {
    position: [0.0, 1.48, 0],
    parent: root,
  });
  // Front bib plate
  createPart('CorseletBibFront', await roundedBoxGeo(0.10, 0.24, 0.38, 0.03, { segments: 3 }), copper, {
    position: [0.17, 1.42, 0],
    parent: root,
  });
  // Back bib plate
  createPart('CorseletBibBack', await roundedBoxGeo(0.10, 0.24, 0.38, 0.03, { segments: 3 }), copper, {
    position: [-0.17, 1.42, 0],
    parent: root,
  });

  // Brass brails (4 curved clamping bands)
  createPart('BrailFront', boxGeo(0.025, 0.025, 0.34), brass, {
    position: [0.225, 1.34, 0],
    parent: root,
  });
  createPart('BrailBack', boxGeo(0.025, 0.025, 0.34), brass, {
    position: [-0.225, 1.34, 0],
    parent: root,
  });
  for (const side of [-1, 1]) {
    createPart(`BrailSide_${side === 1 ? 'R' : 'L'}`, boxGeo(0.34, 0.025, 0.025), brass, {
      position: [0.0, 1.45, side * 0.25],
      parent: root,
    });
  }

  // Heavy Lead Chest Weight (hung from corselet studs)
  createPart('ChestWeightMain', await roundedBoxGeo(0.065, 0.24, 0.26, 0.015, { segments: 3 }), lead, {
    position: [0.255, 1.36, 0],
    parent: root,
  });
  createPart('ChestWeightBevel', boxGeo(0.015, 0.16, 0.18), lead, {
    position: [0.29, 1.36, 0],
    parent: root,
  });
  for (const side of [-1, 1]) {
    createPart(`WeightLugFront_${side === 1 ? 'R' : 'L'}`, torusGeo(0.022, 0.005, 6, 10), brass, {
      position: [0.26, 1.49, side * 0.09],
      rotation: [0, 90, 0],
      parent: root,
    });
  }

  // Matching Lead Back Weight
  createPart('BackWeightMain', await roundedBoxGeo(0.065, 0.24, 0.26, 0.015, { segments: 3 }), lead, {
    position: [-0.255, 1.36, 0],
    parent: root,
  });
  for (const side of [-1, 1]) {
    createPart(`WeightLugBack_${side === 1 ? 'R' : 'L'}`, torusGeo(0.022, 0.005, 6, 10), brass, {
      position: [-0.26, 1.49, side * 0.09],
      rotation: [0, 90, 0],
      parent: root,
    });
  }

  // Leather suspension straps across shoulders
  for (const side of [-1, 1]) {
    createPart(`WeightStrap_${side === 1 ? 'R' : 'L'}`, boxGeo(0.52, 0.022, 0.040), leather, {
      position: [0.0, 1.55, side * 0.11],
      parent: root,
    });
    createPart(`WeightStrapBuckle_${side === 1 ? 'R' : 'L'}`, boxGeo(0.025, 0.030, 0.045), brass, {
      position: [0.14, 1.51, side * 0.11],
      parent: root,
    });
  }

  // --- Bolted Neck Ring Flange ---
  createPart('NeckRingBase', cylinderGeo(0.205, 0.22, 0.035, 20), brass, {
    position: [0.0, 1.58, 0],
    parent: root,
  });
  createPart('NeckRingRim', torusGeo(0.21, 0.012, 6, 20), brass, {
    position: [0.0, 1.60, 0],
    rotation: [90, 0, 0],
    parent: root,
  });

  // 12 Neck Ring Hex Bolts
  const neckBolt = createPart('SampleNeckBolt', cylinderGeo(0.011, 0.011, 0.030, 6), brass, {
    position: [0.21, 1.61, 0],
    parent: root,
  });
  arrayRadial('NeckBolt', neckBolt, 12, 'y', root);

  // =========================================================================
  // 4. SPUN COPPER HELMET & 4 BULLSEYE PORTS (Y = 1.60 to 1.95)
  // Spun copper dome, front faceplate with 4-bar guard, 2 side ports with 3 bars,
  // top port with 2 bars, spitcock, regulating exhaust valve, and air fittings.
  // =========================================================================
  // Spun copper helmet bonnet
  createPart('BonnetDome', sphereGeo(0.22, 20, 16), copper, {
    position: [0.0, 1.75, 0],
    scale: [1.02, 1.05, 1.0],
    parent: root,
  });
  // Crown ring
  createPart('BonnetCrown', torusGeo(0.075, 0.010, 6, 16), copper, {
    position: [0.0, 1.97, 0],
    rotation: [90, 0, 0],
    parent: root,
  });

  // ----------------------------------------------------
  // PORT 1: FRONT FACEPLATE (Main Bullseye, +X)
  // ----------------------------------------------------
  createPart('FrontPortFrame', cylinderXGeo(0.095, 0.095, 0.045, 20), brass, {
    position: [0.205, 1.75, 0],
    parent: root,
  });
  createPart('FrontPortBezel', torusGeo(0.092, 0.010, 8, 20), brass, {
    position: [0.228, 1.75, 0],
    rotation: [0, 90, 0],
    parent: root,
  });
  createPart('FrontPortGlass', cylinderXGeo(0.080, 0.080, 0.025, 18), glass, {
    position: [0.213, 1.75, 0],
    parent: root,
  });
  // Faceplate hinge & wing-latch
  createPart('FrontPortHinge', cylinderGeo(0.014, 0.014, 0.06, 8), brass, {
    position: [0.205, 1.75, -0.10],
    parent: root,
  });
  createPart('FrontPortLatch', boxGeo(0.025, 0.035, 0.025), brass, {
    position: [0.205, 1.75, 0.10],
    parent: root,
  });
  // 4-Bar Protective Cross Grille
  createPart('FrontBarH', cylinderZGeo(0.006, 0.006, 0.17, 8), brass, {
    position: [0.236, 1.75, 0],
    parent: root,
  });
  createPart('FrontBarV', cylinderGeo(0.006, 0.006, 0.17, 8), brass, {
    position: [0.236, 1.75, 0],
    parent: root,
  });
  createPart('FrontBarD1', cylinderGeo(0.005, 0.005, 0.17, 8), brass, {
    position: [0.235, 1.75, 0],
    rotation: [0, 0, 45],
    parent: root,
  });
  createPart('FrontBarD2', cylinderGeo(0.005, 0.005, 0.17, 8), brass, {
    position: [0.235, 1.75, 0],
    rotation: [0, 0, -45],
    parent: root,
  });

  // ----------------------------------------------------
  // PORT 2: RIGHT SIDE BULLSEYE (+Z)
  // ----------------------------------------------------
  createPart('RightPortFrame', cylinderZGeo(0.075, 0.075, 0.045, 18), brass, {
    position: [0.02, 1.75, 0.205],
    parent: root,
  });
  createPart('RightPortBezel', torusGeo(0.073, 0.009, 6, 18), brass, {
    position: [0.02, 1.75, 0.228],
    parent: root,
  });
  createPart('RightPortGlass', cylinderZGeo(0.063, 0.063, 0.025, 16), glass, {
    position: [0.02, 1.75, 0.213],
    parent: root,
  });
  // 3 Horizontal Protective Bars
  for (const dy of [-0.030, 0.0, 0.030]) {
    createPart(`RightBar_${dy}`, cylinderXGeo(0.005, 0.005, 0.13, 8), brass, {
      position: [0.02, 1.75 + dy, 0.236],
      parent: root,
    });
  }

  // ----------------------------------------------------
  // PORT 3: LEFT SIDE BULLSEYE (-Z)
  // ----------------------------------------------------
  createPart('LeftPortFrame', cylinderZGeo(0.075, 0.075, 0.045, 18), brass, {
    position: [0.02, 1.75, -0.205],
    parent: root,
  });
  createPart('LeftPortBezel', torusGeo(0.073, 0.009, 6, 18), brass, {
    position: [0.02, 1.75, -0.228],
    parent: root,
  });
  createPart('LeftPortGlass', cylinderZGeo(0.063, 0.063, 0.025, 16), glass, {
    position: [0.02, 1.75, -0.213],
    parent: root,
  });
  // 3 Horizontal Protective Bars
  for (const dy of [-0.030, 0.0, 0.030]) {
    createPart(`LeftBar_${dy}`, cylinderXGeo(0.005, 0.005, 0.13, 8), brass, {
      position: [0.02, 1.75 + dy, -0.236],
      parent: root,
    });
  }

  // ----------------------------------------------------
  // PORT 4: TOP VIEWPORT (Angled upward & forward at +X/+Y)
  // ----------------------------------------------------
  createPart('TopPortFrame', cylinderGeo(0.070, 0.070, 0.045, 16), brass, {
    position: [0.11, 1.92, 0],
    rotation: [0, 0, -36],
    parent: root,
  });
  createPart('TopPortBezel', torusGeo(0.068, 0.008, 6, 16), brass, {
    position: [0.125, 1.938, 0],
    rotation: [0, 0, -36],
    parent: root,
  });
  createPart('TopPortGlass', cylinderGeo(0.058, 0.058, 0.025, 14), glass, {
    position: [0.115, 1.926, 0],
    rotation: [0, 0, -36],
    parent: root,
  });
  // 2 Protective Bars
  createPart('TopBar1', cylinderGeo(0.005, 0.005, 0.12, 6), brass, {
    position: [0.132, 1.950, -0.022],
    rotation: [0, 0, -36],
    parent: root,
  });
  createPart('TopBar2', cylinderGeo(0.005, 0.005, 0.12, 6), brass, {
    position: [0.132, 1.950, 0.022],
    rotation: [0, 0, -36],
    parent: root,
  });

  // ----------------------------------------------------
  // HELMET FITTINGS
  // ----------------------------------------------------
  // Spitcock valve on lower front-left
  createPart('SpitcockBody', cylinderGeo(0.014, 0.014, 0.045, 8), brass, {
    position: [0.18, 1.67, -0.10],
    rotation: [45, 30, 0],
    parent: root,
  });
  createPart('SpitcockLever', cylinderGeo(0.005, 0.003, 0.045, 6), brass, {
    position: [0.20, 1.65, -0.11],
    rotation: [0, 0, 90],
    parent: root,
  });

  // Regulating exhaust valve on right-rear (+Z, -X)
  createPart('ExhaustMount', cylinderGeo(0.035, 0.035, 0.035, 12), brass, {
    position: [-0.07, 1.73, 0.19],
    rotation: [25, 45, 0],
    parent: root,
  });
  createPart('ExhaustWheel', cylinderGeo(0.038, 0.038, 0.015, 10), brass, {
    position: [-0.09, 1.74, 0.22],
    rotation: [25, 45, 0],
    parent: root,
  });
  createPart('ExhaustDeflector', cylinderGeo(0.022, 0.032, 0.05, 10), copper, {
    position: [-0.12, 1.70, 0.18],
    rotation: [45, 0, -60],
    parent: root,
  });

  // Telephone / comms cup on left-rear (-Z, -X)
  createPart('CommsCup', cylinderGeo(0.028, 0.028, 0.025, 10), brass, {
    position: [-0.09, 1.79, -0.18],
    rotation: [-25, -45, 0],
    parent: root,
  });

  // Lifting eyes on top of helmet
  for (const side of [-1, 1]) {
    createPart(`LiftEye_${side === 1 ? 'R' : 'L'}`, torusGeo(0.020, 0.004, 6, 10), brass, {
      position: [0.0, 1.96, side * 0.11],
      rotation: [0, 90, 0],
      parent: root,
    });
  }

  // =========================================================================
  // 5. ARMS & DIVER'S MITTENS (Natural relaxed stance at sides)
  // Sleeves hang naturally slightly away from hips to prevent interpenetration.
  // =========================================================================
  for (const side of [-1, 1]) {
    const zSign = side;
    const sideSuffix = side === 1 ? 'R' : 'L';

    // Shoulder cloth bulge
    createPart(`ShoulderJoint_${sideSuffix}`, sphereGeo(0.13, 12, 10), canvasDark, {
      position: [0.0, 1.49, zSign * 0.34],
      parent: root,
    });

    // Upper arm (hanging down with 12° outward tilt, slight forward slant)
    createPart(`UpperArmTop_${sideSuffix}`, cylinderGeo(0.108, 0.098, 0.17, 12), canvas, {
      position: [0.01, 1.39, zSign * 0.38],
      rotation: [0, 0, zSign * 12],
      parent: root,
    });
    createPart(`UpperArmBot_${sideSuffix}`, cylinderGeo(0.098, 0.090, 0.17, 12), canvas, {
      position: [0.02, 1.25, zSign * 0.41],
      rotation: [0, 0, zSign * 12],
      parent: root,
    });

    // Elbow joint
    createPart(`ElbowJoint_${sideSuffix}`, sphereGeo(0.095, 10, 8), canvasDark, {
      position: [0.03, 1.14, zSign * 0.43],
      parent: root,
    });

    // Forearm (slanted slightly forward 8° and outward)
    createPart(`ForearmTop_${sideSuffix}`, cylinderGeo(0.090, 0.082, 0.15, 12), canvas, {
      position: [0.05, 1.03, zSign * 0.44],
      rotation: [-8 * zSign, 0, 8],
      parent: root,
    });
    createPart(`ForearmBot_${sideSuffix}`, cylinderGeo(0.082, 0.075, 0.15, 12), canvas, {
      position: [0.07, 0.90, zSign * 0.45],
      rotation: [-8 * zSign, 0, 8],
      parent: root,
    });

    // Heavy vulcanized rubber wrist cuff (seals gauntlet)
    createPart(`RubberCuffFlare_${sideSuffix}`, cylinderGeo(0.088, 0.078, 0.07, 14), rubber, {
      position: [0.09, 0.81, zSign * 0.455],
      rotation: [-8 * zSign, 0, 8],
      parent: root,
    });
    createPart(`RubberCuffRing_${sideSuffix}`, torusGeo(0.084, 0.008, 6, 14), rubber, {
      position: [0.095, 0.78, zSign * 0.46],
      rotation: [0, 90, 0],
      parent: root,
    });

    // Diver's 3-finger mitten
    createPart(`GlovePalm_${sideSuffix}`, await roundedBoxGeo(0.060, 0.10, 0.080, 0.012, { segments: 3 }), rubber, {
      position: [0.11, 0.71, zSign * 0.46],
      rotation: [0, 0, 6],
      parent: root,
    });
    createPart(`GloveFingers_${sideSuffix}`, cylinderGeo(0.035, 0.030, 0.08, 10), rubber, {
      position: [0.12, 0.63, zSign * 0.46],
      rotation: [0, 0, 6],
      parent: root,
    });
    createPart(`GloveThumb_${sideSuffix}`, cylinderGeo(0.018, 0.014, 0.06, 8), rubber, {
      position: [0.13, 0.70, zSign * 0.425],
      rotation: [25 * zSign, 0, -15],
      parent: root,
    });
  }

  // =========================================================================
  // 6. AIR HOSE & LIFELINE (Coiled gracefully behind helmet at -X)
  // Inlet elbow, lifeline bridle shackle, ribbed air hose and braided rope.
  // =========================================================================
  createPart('AirInletValve', cylinderGeo(0.028, 0.028, 0.07, 10), brass, {
    position: [-0.20, 1.76, -0.06],
    rotation: [0, 0, 90],
    parent: root,
  });
  createPart('AirInletElbow', cylinderGeo(0.024, 0.024, 0.045, 10), brass, {
    position: [-0.24, 1.74, -0.06],
    rotation: [0, 45, 90],
    parent: root,
  });

  createPart('LifelineShackle', torusGeo(0.020, 0.005, 6, 12), brass, {
    position: [-0.22, 1.67, 0.06],
    rotation: [0, 90, 0],
    parent: root,
  });

  // Supply air hose: smooth hanging loop descending from inlet into coiled turns
  const airHoseSpline = [
    [-0.25, 1.74, -0.06],
    [-0.32, 1.67, -0.08],
    [-0.36, 1.52, -0.11],
    [-0.35, 1.35, -0.15],
    [-0.31, 1.20, -0.20],
    [-0.25, 1.08, -0.24],
    [-0.18, 1.00, -0.22],
    [-0.17, 0.91, -0.17],
    [-0.22, 0.85, -0.12],
    [-0.29, 0.84, -0.11],
    [-0.34, 0.89, -0.14],
    [-0.35, 0.98, -0.20],
    [-0.31, 1.06, -0.26],
    [-0.23, 1.08, -0.27],
    [-0.17, 1.02, -0.24],
    [-0.16, 0.94, -0.18],
    [-0.21, 0.88, -0.13],
    [-0.27, 0.86, -0.10],
  ];
  const airHoseGeo = curveToMesh(airHoseSpline, 0.019, 36, 8);
  createPart('AirHose', airHoseGeo, rubber, { parent: root });

  // Lifeline rope: manila hemp line bundled alongside hose
  const lifelineSpline = [
    [-0.23, 1.67, 0.06],
    [-0.30, 1.57, 0.07],
    [-0.34, 1.40, 0.04],
    [-0.33, 1.25, -0.01],
    [-0.28, 1.13, -0.06],
    [-0.21, 1.03, -0.10],
    [-0.18, 0.95, -0.09],
    [-0.21, 0.88, -0.06],
    [-0.27, 0.86, -0.04],
    [-0.32, 0.90, -0.06],
    [-0.34, 0.98, -0.11],
    [-0.29, 1.05, -0.16],
    [-0.23, 1.06, -0.18],
    [-0.18, 1.00, -0.16],
    [-0.17, 0.93, -0.13],
    [-0.22, 0.87, -0.08],
    [-0.28, 0.85, -0.06],
  ];
  const lifelineGeo = curveToMesh(lifelineSpline, 0.012, 32, 6);
  createPart('LifelineRope', lifelineGeo, rope, { parent: root });

  // Leather binding lashings
  createPart('HoseLash1', torusGeo(0.040, 0.007, 6, 12), leather, {
    position: [-0.33, 0.93, -0.15],
    rotation: [25, 40, 0],
    parent: root,
  });
  createPart('HoseLash2', torusGeo(0.038, 0.007, 6, 12), leather, {
    position: [-0.19, 0.95, -0.18],
    rotation: [-20, 50, 0],
    parent: root,
  });

  return root;
}
