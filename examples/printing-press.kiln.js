// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools, and cut off
// mid-run rather than finished -- by a provider limit, or by the
// dispatch deadline. The program below is what was on disk when the
// session ended; how many times it had looked at its own contact sheet
// by then is not recorded, so this one does not make the claim the
// others do.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'PrintingPress', category: 'prop' };

async function build() {
  const root = createRoot('PrintingPress');

  // ==========================================
  // MATERIALS PALETTE (12 PBR Materials)
  // ==========================================
  const oakDark = gameMaterial(0x382618, { roughness: 0.88 });        // Heavy structural timbers (cheeks, beams, feet)
  const oakMedium = gameMaterial(0x523b26, { roughness: 0.82 });      // Secondary woodwork (rails, carriage, table)
  const oakLight = gameMaterial(0x6e5136, { roughness: 0.78 });       // Furniture, tympan frame, hose
  const woodTurned = gameMaterial(0x694628, { roughness: 0.65 });     // Turned grips, finials, ink ball handles
  const ironWrought = gameMaterial(0x1a1c1e, { metalness: 0.84, roughness: 0.40 }); // Screw, lever, crank, bolts, straps
  const ironCast = gameMaterial(0x282a2d, { metalness: 0.76, roughness: 0.52 });    // Chase frame, platen iron plate
  const typeLead = gameMaterial(0x4a4d52, { metalness: 0.70, roughness: 0.42 });    // Cast lead movable type
  const brass = gameMaterial(0x9c7934, { metalness: 0.88, roughness: 0.30 });        // Thread collar nut, platen boss, tacks
  const stoneMarble = gameMaterial(0x2a2c2e, { roughness: 0.88 });    // Polished bed stone & inking slab
  const printerInk = gameMaterial(0x0a0a0c, { metalness: 0.12, roughness: 0.25 });   // Viscous black printer's ink
  const leather = gameMaterial(0x26170e, { roughness: 0.74 });        // Sheepskin balls, rounce girth straps
  const parchment = gameMaterial(0xe8ddc5, { roughness: 0.92 });      // Tympan vellum, frisket mask, paper stack

  // Shared Geometries for instancing / efficient draw calls
  const boltHeadGeo = cylinderGeo(0.018, 0.018, 0.02, 6);
  const pegGeo = cylinderGeo(0.012, 0.012, 0.03, 8);
  const tackGeo = sphereGeo(0.005, 8, 6);
  const ironStrapCornerGeo = boxGeo(0.055, 0.075, 0.055);

  // ==========================================
  // 1. MAIN TIMBER FRAME (CHEEKS, FEET, BEAMS, BRACES)
  // ==========================================
  const cheekZ = 0.41;
  const cheekH = 1.88;
  const cheekW_X = 0.20;
  const cheekW_Z = 0.16;

  // Base feet (skid runners on Y=0)
  // Main foot body
  const footL = createPart('FootL', boxGeo(0.92, 0.12, 0.20), oakDark, { position: [0, 0.06, -cheekZ], parent: root });
  const footR = createPart('FootR', boxGeo(0.92, 0.12, 0.20), oakDark, { position: [0, 0.06, cheekZ], parent: root });
  // Beveled toes at the ends of the feet
  createPart('FootL_ToeF', boxGeo(0.08, 0.08, 0.20), oakDark, { position: [0.48, 0.04, -cheekZ], parent: root });
  createPart('FootL_ToeB', boxGeo(0.08, 0.08, 0.20), oakDark, { position: [-0.48, 0.04, -cheekZ], parent: root });
  createPart('FootR_ToeF', boxGeo(0.08, 0.08, 0.20), oakDark, { position: [0.48, 0.04, cheekZ], parent: root });
  createPart('FootR_ToeB', boxGeo(0.08, 0.08, 0.20), oakDark, { position: [-0.48, 0.04, cheekZ], parent: root });

  // Upright Cheeks (vertical posts)
  createPart('CheekL', boxGeo(cheekW_X, cheekH, cheekW_Z), oakDark, { position: [0, 0.12 + cheekH / 2, -cheekZ], parent: root });
  createPart('CheekR', boxGeo(cheekW_X, cheekH, cheekW_Z), oakDark, { position: [0, 0.12 + cheekH / 2, cheekZ], parent: root });

  // 4 Diagonal Knee Braces (bracing feet to cheeks)
  beamBetween('KneeBraceL_Fwd', [0.36, 0.12, -cheekZ], [0.10, 0.50, -cheekZ], 0.038, oakDark, { segments: 8, parent: root });
  beamBetween('KneeBraceL_Aft', [-0.36, 0.12, -cheekZ], [-0.10, 0.50, -cheekZ], 0.038, oakDark, { segments: 8, parent: root });
  beamBetween('KneeBraceR_Fwd', [0.36, 0.12, cheekZ], [0.10, 0.50, cheekZ], 0.038, oakDark, { segments: 8, parent: root });
  beamBetween('KneeBraceR_Aft', [-0.36, 0.12, cheekZ], [-0.10, 0.50, cheekZ], 0.038, oakDark, { segments: 8, parent: root });

  // Base Tie / Summer Beam near floor
  createPart('SummerBeam', boxGeo(0.18, 0.14, cheekZ * 2 - cheekW_Z), oakDark, { position: [0, 0.20, 0], parent: root });
  // Treenails pinning summer beam into cheeks
  createPart('SummerPegL', pegGeo, oakLight, { position: [0, 0.20, -cheekZ - 0.085], rotation: [90, 0, 0], parent: root });
  createPart('SummerPegR', pegGeo, oakLight, { position: [0, 0.20, cheekZ + 0.085], rotation: [90, 0, 0], parent: root });

  // Winter Beam (massive beam at Y=0.72)
  createPart('WinterBeam', boxGeo(0.25, 0.20, cheekZ * 2 + 0.04), oakDark, { position: [0, 0.72, 0], parent: root });
  // Through-tenon mortise keys projecting through cheek outsides
  createPart('WinterKeyL', boxGeo(0.08, 0.07, 0.05), oakLight, { position: [0, 0.72, -cheekZ - 0.095], parent: root });
  createPart('WinterKeyR', boxGeo(0.08, 0.07, 0.05), oakLight, { position: [0, 0.72, cheekZ + 0.095], parent: root });
  // Supporting Corbel Brackets under winter beam inside cheeks
  createPart('WinterCorbelL', boxGeo(0.16, 0.10, 0.06), oakDark, { position: [0, 0.58, -cheekZ + 0.10], parent: root });
  createPart('WinterCorbelR', boxGeo(0.16, 0.10, 0.06), oakDark, { position: [0, 0.58, cheekZ - 0.10], parent: root });

  // Till Shelf at Y=1.16 (with square center cutout for hose)
  createPart('TillShelfFront', boxGeo(0.08, 0.04, cheekZ * 2 - cheekW_Z), oakMedium, { position: [0.09, 1.16, 0], parent: root });
  createPart('TillShelfBack', boxGeo(0.08, 0.04, cheekZ * 2 - cheekW_Z), oakMedium, { position: [-0.09, 1.16, 0], parent: root });

  // Head Beam (massive beam at Y=1.58 containing screw nut)
  createPart('HeadBeam', boxGeo(0.25, 0.23, cheekZ * 2 + 0.04), oakDark, { position: [0, 1.58, 0], parent: root });
  createPart('HeadKeyL', boxGeo(0.08, 0.07, 0.05), oakLight, { position: [0, 1.58, -cheekZ - 0.095], parent: root });
  createPart('HeadKeyR', boxGeo(0.08, 0.07, 0.05), oakLight, { position: [0, 1.58, cheekZ + 0.095], parent: root });
  // Corbel Brackets under head beam
  createPart('HeadCorbelL', boxGeo(0.16, 0.10, 0.06), oakDark, { position: [0, 1.43, -cheekZ + 0.10], parent: root });
  createPart('HeadCorbelR', boxGeo(0.16, 0.10, 0.06), oakDark, { position: [0, 1.43, cheekZ - 0.10], parent: root });

  // Cap Beam (top beam at Y=2.00)
  createPart('CapBeam', boxGeo(0.28, 0.12, 1.14), oakDark, { position: [0, 2.00, 0], parent: root });

  // Turned Acorn Finials above cheeks
  createPart('FinialL_Base', cylinderGeo(0.05, 0.065, 0.05, 14), woodTurned, { position: [0, 2.085, -cheekZ], parent: root });
  createPart('FinialL_Ball', sphereGeo(0.045, 14, 10), woodTurned, { position: [0, 2.14, -cheekZ], parent: root });
  createPart('FinialR_Base', cylinderGeo(0.05, 0.065, 0.05, 14), woodTurned, { position: [0, 2.085, cheekZ], parent: root });
  createPart('FinialR_Ball', sphereGeo(0.045, 14, 10), woodTurned, { position: [0, 2.14, cheekZ], parent: root });

  // Heavy Iron Cap Bolts with square nuts
  createPart('CapBoltL1', boltHeadGeo, ironWrought, { position: [0.07, 2.07, -cheekZ], parent: root });
  createPart('CapBoltL2', boltHeadGeo, ironWrought, { position: [-0.07, 2.07, -cheekZ], parent: root });
  createPart('CapBoltR1', boltHeadGeo, ironWrought, { position: [0.07, 2.07, cheekZ], parent: root });
  createPart('CapBoltR2', boltHeadGeo, ironWrought, { position: [-0.07, 2.07, cheekZ], parent: root });

  // ==========================================
  // 2. SCREW MECHANISM, HOSE, LEVER & PLATEN
  // ==========================================
  // Brass Nut Collars in Head Beam
  createPart('BrassNutTop', cylinderGeo(0.082, 0.092, 0.04, 16), brass, { position: [0, 1.70, 0], parent: root });
  createPart('BrassNutBottom', cylinderGeo(0.092, 0.082, 0.04, 16), brass, { position: [0, 1.46, 0], parent: root });

  // Threaded Iron Screw Spindle
  createPart('SpindleShaft', cylinderGeo(0.052, 0.052, 0.56, 16), ironWrought, { position: [0, 1.46, 0], parent: root });
  // Screw thread coils
  const threadRingGeo = torusGeo(0.056, 0.009, 8, 16);
  for (let i = 0; i < 9; i++) {
    createPart(`Thread_${i}`, threadRingGeo, ironWrought, { position: [0, 1.38 + i * 0.033, 0], rotation: [90, 0, 0], parent: root });
  }

  // Spindle Eye Collar (hub for lever bar) at Y=1.31
  createPart('SpindleEyeCollar', cylinderGeo(0.078, 0.078, 0.11, 16), ironWrought, { position: [0, 1.31, 0], parent: root });
  createPart('SpindleEyeRimT', torusGeo(0.078, 0.01, 8, 16), ironWrought, { position: [0, 1.36, 0], rotation: [90, 0, 0], parent: root });
  createPart('SpindleEyeRimB', torusGeo(0.078, 0.01, 8, 16), ironWrought, { position: [0, 1.26, 0], rotation: [90, 0, 0], parent: root });

  // Wooden Hose Sleeve (box guide)
  createPart('HoseBox', boxGeo(0.16, 0.19, 0.16), oakLight, { position: [0, 1.20, 0], parent: root });
  createPart('HosePlateTop', boxGeo(0.17, 0.015, 0.17), ironWrought, { position: [0, 1.295, 0], parent: root });
  createPart('HosePlateBottom', boxGeo(0.17, 0.015, 0.17), ironWrought, { position: [0, 1.105, 0], parent: root });
  // 4 Iron Suspension Cleats on Hose
  createPart('HoseCleatFL', cylinderGeo(0.008, 0.008, 0.03, 8), ironWrought, { position: [0.07, 1.12, -0.07], parent: root });
  createPart('HoseCleatFR', cylinderGeo(0.008, 0.008, 0.03, 8), ironWrought, { position: [0.07, 1.12, 0.07], parent: root });
  createPart('HoseCleatBL', cylinderGeo(0.008, 0.008, 0.03, 8), ironWrought, { position: [-0.07, 1.12, -0.07], parent: root });
  createPart('HoseCleatBR', cylinderGeo(0.008, 0.008, 0.03, 8), ironWrought, { position: [-0.07, 1.12, 0.07], parent: root });

  // Long Iron Lever Bar ("Devil's Tail")
  // Inserted into SpindleEye at [0, 1.31, 0] and swept out towards pressman's hand at +Z
  beamBetween('LeverBarInner', [0.05, 1.31, 0.05], [0.26, 1.31, 0.26], 0.020, ironWrought, { segments: 10, parent: root });
  beamBetween('LeverBarOuter', [0.26, 1.31, 0.26], [0.46, 1.31, 0.46], 0.017, ironWrought, { segments: 10, parent: root });
  // Turned wooden handle grip
  beamBetween('LeverGrip', [0.46, 1.31, 0.46], [0.68, 1.31, 0.68], 0.033, woodTurned, { segments: 14, parent: root });
  createPart('LeverPommel', sphereGeo(0.042, 14, 10), woodTurned, { position: [0.69, 1.31, 0.69], parent: root });

  // Platen Assembly
  const platenY = 0.99;
  createPart('PlatenOak', boxGeo(0.46, 0.07, 0.38), oakDark, { position: [0, platenY + 0.035, 0], parent: root });
  createPart('PlatenPlate', boxGeo(0.44, 0.012, 0.36), ironCast, { position: [0, platenY, 0], parent: root });
  // Central brass boss (cup receiving spindle steel toe)
  createPart('PlatenBoss', cylinderGeo(0.052, 0.062, 0.03, 16), brass, { position: [0, platenY + 0.08, 0], parent: root });

  // 4 Iron Corner Straps and Suspension Rigging on Platen
  createPart('PlatenCornerFL', ironStrapCornerGeo, ironWrought, { position: [0.21, platenY + 0.04, -0.17], parent: root });
  createPart('PlatenCornerFR', ironStrapCornerGeo, ironWrought, { position: [0.21, platenY + 0.04, 0.17], parent: root });
  createPart('PlatenCornerBL', ironStrapCornerGeo, ironWrought, { position: [-0.21, platenY + 0.04, -0.17], parent: root });
  createPart('PlatenCornerBR', ironStrapCornerGeo, ironWrought, { position: [-0.21, platenY + 0.04, 0.17], parent: root });

  beamBetween('PlatenCord_FL', [0.18, platenY + 0.07, -0.15], [0.07, 1.11, -0.07], 0.005, leather, { parent: root });
  beamBetween('PlatenCord_FR', [0.18, platenY + 0.07, 0.15], [0.07, 1.11, 0.07], 0.005, leather, { parent: root });
  beamBetween('PlatenCord_BL', [-0.18, platenY + 0.07, -0.15], [-0.07, 1.11, -0.07], 0.005, leather, { parent: root });
  beamBetween('PlatenCord_BR', [-0.18, platenY + 0.07, 0.15], [-0.07, 1.11, 0.07], 0.005, leather, { parent: root });

  // ==========================================
  // 3. RIBS (CRADLE RAILS) & FORESTAY
  // ==========================================
  const railZ = 0.22;
  const railH = 0.08;
  const railW = 0.07;
  const railY = 0.82;
  const railL = 1.62;

  // Longitudinal Oak Rails
  createPart('RailL', boxGeo(railL, railH, railW), oakMedium, { position: [0.37, railY, -railZ], parent: root });
  createPart('RailR', boxGeo(railL, railH, railW), oakMedium, { position: [0.37, railY, railZ], parent: root });
  // Polished Iron Track Plates on Rails
  createPart('IronTrackL', boxGeo(railL, 0.008, 0.036), ironWrought, { position: [0.37, railY + railH / 2 + 0.004, -railZ], parent: root });
  createPart('IronTrackR', boxGeo(railL, 0.008, 0.036), ironWrought, { position: [0.37, railY + railH / 2 + 0.004, railZ], parent: root });

  // Cross Transoms (ribs tying rails together)
  const transomW = railZ * 2 - railW;
  createPart('TransomRear', boxGeo(0.06, 0.06, transomW), oakMedium, { position: [-0.36, railY - 0.01, 0], parent: root });
  createPart('TransomMid', boxGeo(0.06, 0.06, transomW), oakMedium, { position: [0.37, railY - 0.01, 0], parent: root });
  createPart('TransomFront', boxGeo(0.06, 0.06, transomW), oakMedium, { position: [1.14, railY - 0.01, 0], parent: root });

  // Forestay (Front Trestle Legs at X=1.14)
  const foreLegH = railY - railH / 2;
  createPart('ForeLegL', boxGeo(0.075, foreLegH, 0.075), oakDark, { position: [1.14, foreLegH / 2, -railZ], parent: root });
  createPart('ForeLegR', boxGeo(0.075, foreLegH, 0.075), oakDark, { position: [1.14, foreLegH / 2, railZ], parent: root });
  // Forestay lower stretcher rail
  createPart('ForeLegCross', boxGeo(0.06, 0.06, railZ * 2 - 0.075), oakDark, { position: [1.14, 0.18, 0], parent: root });
  // Forestay diagonal angle struts
  beamBetween('ForeBraceL', [1.14, 0.22, -railZ], [0.84, railY - 0.04, -railZ], 0.026, oakDark, { segments: 8, parent: root });
  beamBetween('ForeBraceR', [1.14, 0.22, railZ], [0.84, railY - 0.04, railZ], 0.026, oakDark, { segments: 8, parent: root });

  // Rear Carriage Gallows (Upright slanting stay frame at rear of rails for tympan)
  beamBetween('GallowsLegL', [-0.36, railY + 0.04, -railZ + 0.02], [-0.44, railY + 0.40, -railZ + 0.02], 0.024, oakMedium, { segments: 8, parent: root });
  beamBetween('GallowsLegR', [-0.36, railY + 0.04, railZ - 0.02], [-0.44, railY + 0.40, railZ - 0.02], 0.024, oakMedium, { segments: 8, parent: root });
  createPart('GallowsCross', boxGeo(0.03, 0.03, railZ * 2 - 0.04), oakMedium, { position: [-0.44, railY + 0.40, 0], parent: root });

  // ==========================================
  // 4. COFFIN CARRIAGE, BED & CHASE
  // ==========================================
  // Coffin rolled forward along X to X=0.42
  const coffinX = 0.42;
  const coffinY = railY + railH / 2 + 0.04; // Y=0.90
  const coffinL = 0.72;
  const coffinW = 0.48;

  // Outer Coffin Box
  createPart('CoffinSideL', boxGeo(coffinL, 0.08, 0.05), oakMedium, { position: [coffinX, coffinY, -coffinW / 2 + 0.025], parent: root });
  createPart('CoffinSideR', boxGeo(coffinL, 0.08, 0.05), oakMedium, { position: [coffinX, coffinY, coffinW / 2 - 0.025], parent: root });
  createPart('CoffinEndFront', boxGeo(0.05, 0.08, coffinW), oakMedium, { position: [coffinX + coffinL / 2 - 0.025, coffinY, 0], parent: root });
  createPart('CoffinEndBack', boxGeo(0.05, 0.08, coffinW), oakMedium, { position: [coffinX - coffinL / 2 + 0.025, coffinY, 0], parent: root });
  createPart('CoffinFloor', boxGeo(coffinL - 0.08, 0.016, coffinW - 0.08), oakLight, { position: [coffinX, coffinY - 0.028, 0], parent: root });

  // Wrought Iron Corner Straps on Coffin
  createPart('CoffinBracketFL', ironStrapCornerGeo, ironWrought, { position: [coffinX + coffinL / 2 - 0.025, coffinY, -coffinW / 2 + 0.025], parent: root });
  createPart('CoffinBracketFR', ironStrapCornerGeo, ironWrought, { position: [coffinX + coffinL / 2 - 0.025, coffinY, coffinW / 2 - 0.025], parent: root });
  createPart('CoffinBracketBL', ironStrapCornerGeo, ironWrought, { position: [coffinX - coffinL / 2 + 0.025, coffinY, -coffinW / 2 + 0.025], parent: root });
  createPart('CoffinBracketBR', ironStrapCornerGeo, ironWrought, { position: [coffinX - coffinL / 2 + 0.025, coffinY, coffinW / 2 - 0.025], parent: root });

  // Polished Stone Bed (Marble / granite bed)
  createPart('MarbleBed', boxGeo(0.60, 0.03, 0.36), stoneMarble, { position: [coffinX, coffinY + 0.01, 0], parent: root });

  // Wrought Iron Chase (Locking frame)
  createPart('ChaseFrame', boxGeo(0.50, 0.018, 0.30), ironCast, { position: [coffinX, coffinY + 0.028, 0], parent: root });
  // Wooden Furniture (Spacers)
  createPart('FurnitureT', boxGeo(0.46, 0.016, 0.028), oakLight, { position: [coffinX, coffinY + 0.03, 0.116], parent: root });
  createPart('FurnitureB', boxGeo(0.46, 0.016, 0.028), oakLight, { position: [coffinX, coffinY + 0.03, -0.116], parent: root });
  createPart('FurnitureL', boxGeo(0.028, 0.016, 0.20), oakLight, { position: [coffinX - 0.216, coffinY + 0.03, 0], parent: root });
  createPart('FurnitureR', boxGeo(0.028, 0.016, 0.20), oakLight, { position: [coffinX + 0.216, coffinY + 0.03, 0], parent: root });
  // Wooden Quoins (Wedges locking the type)
  createPart('Quoin1', boxGeo(0.03, 0.018, 0.015), oakDark, { position: [coffinX + 0.19, coffinY + 0.032, 0.116], parent: root });
  createPart('Quoin2', boxGeo(0.03, 0.018, 0.015), oakDark, { position: [coffinX - 0.19, coffinY + 0.032, 0.116], parent: root });

  // Movable Type Columns (Inked lead type pages)
  createPart('TypeCol1', boxGeo(0.36, 0.018, 0.08), typeLead, { position: [coffinX, coffinY + 0.032, -0.05], parent: root });
  createPart('TypeCol2', boxGeo(0.36, 0.018, 0.08), typeLead, { position: [coffinX, coffinY + 0.032, 0.05], parent: root });
  // Inked text lines on type form
  const ruleGeo = boxGeo(0.34, 0.003, 0.011);
  for (let c = 0; c < 4; c++) {
    createPart(`Rule1_${c}`, ruleGeo, printerInk, { position: [coffinX, coffinY + 0.042, -0.08 + c * 0.02], parent: root });
    createPart(`Rule2_${c}`, ruleGeo, printerInk, { position: [coffinX, coffinY + 0.042, 0.02 + c * 0.02], parent: root });
  }

  // ==========================================
  // 5. HINGED TYMPAN & FRISKET (FOLDED OVER BED)
  // ==========================================
  const tympanY = coffinY + 0.05;
  // Outer Wooden Tympan Frame
  createPart('TympanSideL', boxGeo(0.56, 0.015, 0.03), oakLight, { position: [coffinX, tympanY, -0.17], parent: root });
  createPart('TympanSideR', boxGeo(0.56, 0.015, 0.03), oakLight, { position: [coffinX, tympanY, 0.17], parent: root });
  createPart('TympanEndF', boxGeo(0.03, 0.015, 0.34), oakLight, { position: [coffinX + 0.265, tympanY, 0], parent: root });
  createPart('TympanEndB', boxGeo(0.03, 0.015, 0.34), oakLight, { position: [coffinX - 0.265, tympanY, 0], parent: root });
  // Tympan parchment skin
  createPart('TympanVellum', boxGeo(0.50, 0.004, 0.32), parchment, { position: [coffinX, tympanY + 0.005, 0], parent: root });
  // Leather pull-ears on sides of tympan
  createPart('TympanEarL', boxGeo(0.04, 0.003, 0.03), leather, { position: [coffinX, tympanY + 0.008, -0.19], parent: root });
  createPart('TympanEarR', boxGeo(0.04, 0.003, 0.03), leather, { position: [coffinX, tympanY + 0.008, 0.19], parent: root });

  // Iron Hinges between Tympan and Coffin
  createPart('TympanHingeL', cylinderGeo(0.008, 0.008, 0.05, 8), ironWrought, { position: [coffinX - 0.28, tympanY, -0.12], rotation: [0, 0, 90], parent: root });
  createPart('TympanHingeR', cylinderGeo(0.008, 0.008, 0.05, 8), ironWrought, { position: [coffinX - 0.28, tympanY, 0.12], rotation: [0, 0, 90], parent: root });

  // Frisket Frame (Iron perimeter frame folded flat over tympan)
  const frisketY = tympanY + 0.012;
  createPart('FrisketIronFrame', boxGeo(0.52, 0.008, 0.32), ironWrought, { position: [coffinX, frisketY, 0], parent: root });
  // Paper aperture mask on frisket
  createPart('FrisketPaperMask', boxGeo(0.48, 0.004, 0.28), parchment, { position: [coffinX, frisketY + 0.004, 0], parent: root });
  // Cutout page apertures exposing the type columns below
  createPart('FrisketWindow1', boxGeo(0.32, 0.006, 0.07), printerInk, { position: [coffinX, frisketY + 0.007, -0.05], parent: root });
  createPart('FrisketWindow2', boxGeo(0.32, 0.006, 0.07), printerInk, { position: [coffinX, frisketY + 0.007, 0.05], parent: root });

  // ==========================================
  // 6. ROUNCE MECHANISM (WINCH, LEATHER STRAPS, CRANK)
  // ==========================================
  const spitY = 0.74;
  // Wooden Rounce Spit (Winch roller under rails)
  createPart('RounceSpitBarrel', cylinderZGeo(0.040, 0.040, railZ * 2 + 0.08, 16), woodTurned, { position: [coffinX, spitY, 0], parent: root });
  // Iron Journals / Axle Pins
  createPart('SpitJournalR', cylinderZGeo(0.014, 0.014, 0.12, 12), ironWrought, { position: [coffinX, spitY, railZ + 0.06], parent: root });

  // Leather Girth Straps
  beamBetween('LeatherGirthFwd', [coffinX, spitY, 0], [coffinX + coffinL / 2 - 0.05, coffinY - 0.02, 0], 0.045, leather, { segments: 8, parent: root });
  beamBetween('LeatherGirthAft', [coffinX, spitY, 0], [coffinX - coffinL / 2 + 0.05, coffinY - 0.02, 0], 0.045, leather, { segments: 8, parent: root });

  // Rounce Crank Handle on Right side (+Z)
  const crankZ = railZ + 0.11;
  createPart('RounceCrankHub', cylinderZGeo(0.026, 0.026, 0.03, 14), ironWrought, { position: [coffinX, spitY, crankZ], parent: root });
  // Angled forged crank arm
  beamBetween('RounceCrankArm', [coffinX, spitY, crankZ], [coffinX + 0.04, spitY + 0.14, crankZ], 0.013, ironWrought, { segments: 8, parent: root });
  // Iron crank spindle pin
  createPart('RounceCrankPin', cylinderZGeo(0.009, 0.009, 0.12, 10), ironWrought, { position: [coffinX + 0.04, spitY + 0.14, crankZ + 0.06], parent: root });
  // Ergonomically turned wooden handle grip
  createPart('RounceGrip', cylinderZGeo(0.023, 0.018, 0.10, 16), woodTurned, { position: [coffinX + 0.04, spitY + 0.14, crankZ + 0.06], parent: root });

  // ==========================================
  // 7. SIDE TABLE (BANK / INKING BENCH)
  // ==========================================
  const tableX = 0.44;
  const tableZ = -0.74;
  const tableH = 0.78;
  const tableL = 0.56;
  const tableW = 0.44;

  // Sturdy Tabletop (thick oak planks)
  createPart('TableTop', boxGeo(tableL, 0.045, tableW), oakMedium, { position: [tableX, tableH, tableZ], parent: root });
  // Planks grooved seam
  createPart('TableSeam', boxGeo(tableL, 0.004, 0.005), oakDark, { position: [tableX, tableH + 0.022, tableZ], parent: root });

  // 4 Chamfered Table Legs resting on Y=0
  const legH = tableH - 0.045;
  const tLegGeo = boxGeo(0.05, legH, 0.05);
  const legOffX = tableL / 2 - 0.045;
  const legOffZ = tableW / 2 - 0.045;
  createPart('TableLegFL', tLegGeo, oakDark, { position: [tableX + legOffX, legH / 2, tableZ - legOffZ], parent: root });
  createPart('TableLegFR', tLegGeo, oakDark, { position: [tableX + legOffX, legH / 2, tableZ + legOffZ], parent: root });
  createPart('TableLegBL', tLegGeo, oakDark, { position: [tableX - legOffX, legH / 2, tableZ - legOffZ], parent: root });
  createPart('TableLegBR', tLegGeo, oakDark, { position: [tableX - legOffX, legH / 2, tableZ + legOffZ], parent: root });

  // Perimeter Lower Stretchers
  const strXGeo = boxGeo(tableL - 0.09, 0.04, 0.035);
  const strZGeo = boxGeo(0.035, 0.04, tableW - 0.09);
  createPart('TableStrFront', strZGeo, oakDark, { position: [tableX + legOffX, 0.14, tableZ], parent: root });
  createPart('TableStrBack', strZGeo, oakDark, { position: [tableX - legOffX, 0.14, tableZ], parent: root });
  createPart('TableStrOuter', strXGeo, oakDark, { position: [tableX, 0.14, tableZ - legOffZ], parent: root });
  createPart('TableStrInner', strXGeo, oakDark, { position: [tableX, 0.14, tableZ + legOffZ], parent: root });

  // Joinery ties locking Table to Press Frame (Guarantees full part connectivity)
  beamBetween('TableTieFloor', [tableX, 0.14, tableZ + legOffZ], [tableX, 0.12, -railZ], 0.024, oakDark, { segments: 8, parent: root });
  beamBetween('TableTieRail', [tableX, tableH - 0.02, tableZ + legOffZ], [tableX, railY, -railZ], 0.028, oakDark, { segments: 8, parent: root });

  // ==========================================
  // 8. INKING EQUIPMENT & PAPER SHEETS
  // ==========================================
  // Inking Stone (Porphyry / Marble slab bordered in oak)
  const stoneX = tableX - 0.06;
  const stoneZ = tableZ;
  createPart('InkStoneBase', boxGeo(0.28, 0.025, 0.26), oakDark, { position: [stoneX, tableH + 0.03, stoneZ], parent: root });
  createPart('InkStoneMarble', boxGeo(0.25, 0.02, 0.23), stoneMarble, { position: [stoneX, tableH + 0.045, stoneZ], parent: root });
  createPart('InkPool', boxGeo(0.18, 0.005, 0.16), printerInk, { position: [stoneX, tableH + 0.056, stoneZ], parent: root });

  // Stone Ink Muller (Conical stone grinder used to work the ink)
  createPart('InkMullerBase', cylinderGeo(0.035, 0.045, 0.04, 16), stoneMarble, { position: [stoneX + 0.08, tableH + 0.065, stoneZ + 0.07], parent: root });
  createPart('InkMullerGrip', cylinderGeo(0.016, 0.026, 0.07, 14), stoneMarble, { position: [stoneX + 0.08, tableH + 0.12, stoneZ + 0.07], parent: root });
  createPart('InkMullerTop', sphereGeo(0.022, 12, 10), stoneMarble, { position: [stoneX + 0.08, tableH + 0.16, stoneZ + 0.07], parent: root });

  // Iron Ink Slice (Palette spatula for spreading ink)
  createPart('InkSliceBlade', boxGeo(0.11, 0.003, 0.028), ironWrought, { position: [stoneX + 0.14, tableH + 0.026, stoneZ - 0.10], rotation: [0, 25, 0], parent: root });
  createPart('InkSliceHandle', cylinderXGeo(0.008, 0.008, 0.08, 10), woodTurned, { position: [stoneX + 0.22, tableH + 0.032, stoneZ - 0.13], rotation: [0, 25, 0], parent: root });

  // Clean Paper Stack (Quires of handmade paper with wooden weight on top)
  const paperX = tableX + 0.14;
  const paperZ = tableZ + 0.08;
  createPart('PaperStack', boxGeo(0.18, 0.035, 0.14), parchment, { position: [paperX, tableH + 0.04, paperZ], parent: root });
  createPart('PaperWeight', boxGeo(0.14, 0.012, 0.08), oakDark, { position: [paperX, tableH + 0.064, paperZ], parent: root });

  // ==========================================
  // 9. INK BALLS (PELOTTES / DABBERS)
  // ==========================================
  // Ink Ball 1: Resting upright on the ink stone, loaded with ink
  const b1X = stoneX - 0.03;
  const b1Z = stoneZ - 0.02;
  const b1Y = tableH + 0.058;
  createPart('InkBall1_Skin', sphereGeo(0.062, 18, 14), leather, { position: [b1X, b1Y + 0.035, b1Z], scale: [1, 0.65, 1], parent: root });
  createPart('InkBall1_InkedFace', cylinderGeo(0.055, 0.058, 0.012, 18), printerInk, { position: [b1X, b1Y + 0.006, b1Z], parent: root });
  createPart('InkBall1_Stock', cylinderGeo(0.035, 0.055, 0.04, 16), woodTurned, { position: [b1X, b1Y + 0.075, b1Z], parent: root });
  // Ring of brass tack rivets
  for (let t = 0; t < 10; t++) {
    const angle = (t / 10) * Math.PI * 2;
    createPart(`Ball1Tack_${t}`, tackGeo, brass, { position: [b1X + Math.cos(angle) * 0.052, b1Y + 0.06, b1Z + Math.sin(angle) * 0.052], parent: root });
  }
  // Ergonomically turned handle and pommel
  beamBetween('InkBall1_Grip', [b1X, b1Y + 0.095, b1Z], [b1X, b1Y + 0.22, b1Z], 0.016, woodTurned, { segments: 14, parent: root });
  createPart('InkBall1_Pommel', sphereGeo(0.024, 12, 10), woodTurned, { position: [b1X, b1Y + 0.23, b1Z], parent: root });

  // Ink Ball 2: Resting tilted beside the stone on the table
  const b2X = tableX - 0.05;
  const b2Z = tableZ - 0.12;
  const b2Y = tableH + 0.025;
  createPart('InkBall2_Skin', sphereGeo(0.062, 18, 14), leather, { position: [b2X, b2Y + 0.035, b2Z], scale: [1, 0.65, 1], parent: root });
  createPart('InkBall2_InkedFace', cylinderGeo(0.055, 0.058, 0.012, 18), printerInk, { position: [b2X, b2Y + 0.006, b2Z], parent: root });
  createPart('InkBall2_Stock', cylinderGeo(0.035, 0.055, 0.04, 16), woodTurned, { position: [b2X, b2Y + 0.075, b2Z], parent: root });
  // Ring of brass tack rivets
  for (let t = 0; t < 10; t++) {
    const angle = (t / 10) * Math.PI * 2;
    createPart(`Ball2Tack_${t}`, tackGeo, brass, { position: [b2X + Math.cos(angle) * 0.052, b2Y + 0.06, b2Z + Math.sin(angle) * 0.052], parent: root });
  }
  // Tilted handle
  beamBetween('InkBall2_Grip', [b2X, b2Y + 0.095, b2Z], [b2X - 0.06, b2Y + 0.21, b2Z - 0.045], 0.016, woodTurned, { segments: 14, parent: root });
  createPart('InkBall2_Pommel', sphereGeo(0.024, 12, 10), woodTurned, { position: [b2X - 0.065, b2Y + 0.22, b2Z - 0.05], parent: root });

  return root;
}
