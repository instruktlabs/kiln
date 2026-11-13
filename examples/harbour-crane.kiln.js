// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'HarbourCrane', category: 'prop' };

function build() {
  const root = createRoot('HarbourCrane');

  // ==========================================
  // MATERIALS (Authentic Maritime Container Terminal PBR)
  // ==========================================
  const craneOrange  = gameMaterial(0xd34218, { roughness: 0.45, metalness: 0.25 });
  const craneWhite   = gameMaterial(0xf2f4f7, { roughness: 0.35, metalness: 0.15 });
  const darkSteel    = gameMaterial(0x24272d, { roughness: 0.55, metalness: 0.75 });
  const hazardYellow = gameMaterial(0xf6b200, { roughness: 0.4, metalness: 0.2 });
  const railingYellow= gameMaterial(0xebb312, { roughness: 0.5, metalness: 0.2 });
  const cableSteel   = gameMaterial(0x18191c, { roughness: 0.7, metalness: 0.85 });
  const concreteGrey = gameMaterial(0x5f636a, { roughness: 0.9, metalness: 0.05 });
  const glass        = glassMaterial(0x7dc2e8, { opacity: 0.45, roughness: 0.1, metalness: 0.1 });
  const cabInterior  = gameMaterial(0x1a1c20, { roughness: 0.8, metalness: 0.2 });
  const warningLight = gameMaterial(0xee1100, { roughness: 0.3, emissive: 0xee1100, emissiveIntensity: 0.9 });
  const statusGreen  = gameMaterial(0x22cc44, { roughness: 0.4, emissive: 0x11aa22, emissiveIntensity: 0.8 });

  // ==========================================
  // KEY DIMENSIONS & COORDINATES
  // +X forward (waterside outreach over docked container ship)
  // +Y up (ground dock rail level at Y = 0.0)
  // +Z asset right (quay wall & crane travel rails run along Z)
  // ==========================================
  const legX_WS = 7.0;     // Waterside legs at X = +7.0
  const legX_LS = -7.0;    // Landside legs at X = -7.0
  const legSpanZ = 7.5;    // Half-width along dock track: legs at Z = +/-7.5 (15m wheelbase along track)
  const portalH = 16.0;    // Clearance height for container trucks/trains driving along Z
  const boomH = 25.5;      // Main girder rail level
  const apexH = 37.0;      // Pylon apex sheave height

  // ==========================================
  // 1. DOCK RAILS & BOGIES (Grounding on Y=0)
  // Two ground crane rails embedded in dock at Y=0.0
  // ==========================================
  const railLengthZ = 22.0;
  const railHeight = 0.35;
  const railWidth = 0.30;
  const railGeo = boxGeo(railWidth, railHeight, railLengthZ);

  // Waterside and Landside crane rails sitting exactly on Y=0
  createPart('Rail_Waterside', railGeo, darkSteel, { position: [legX_WS, railHeight * 0.5, 0], parent: root });
  createPart('Rail_Landside',  railGeo, darkSteel, { position: [legX_LS, railHeight * 0.5, 0], parent: root });

  // Sill Beams along Z connecting the bogies on each rail
  const sillBeamLength = legSpanZ * 2 + 3.0; // 18m
  const sillBeamGeo = boxGeo(0.9, 0.9, sillBeamLength);
  createPart('SillBeam_Waterside', sillBeamGeo, craneOrange, { position: [legX_WS, 1.35, 0], parent: root });
  createPart('SillBeam_Landside',  sillBeamGeo, craneOrange, { position: [legX_LS, 1.35, 0], parent: root });

  // Bogie Assemblies at 4 corners
  // Wheels roll along Z: wheel axis is along X (cylinderXGeo)
  const wheelRadius = 0.40;
  const wheelY = railHeight + wheelRadius * 0.85; // tread rests on rail
  const wheelGeo = cylinderXGeo(wheelRadius, wheelRadius, 0.28, 12);
  const flangeGeo = cylinderXGeo(wheelRadius + 0.06, wheelRadius + 0.06, 0.05, 12);
  const subTruckGeo = boxGeo(0.7, 0.5, 2.2);
  const rockerGeo = boxGeo(0.8, 0.65, 3.8);
  const bogiePivotGeo = cylinderYGeo(0.45, 0.45, 0.8, 12);
  const railScraperGeo = boxGeo(0.45, 0.3, 0.35);

  const bogieCorners = [
    { name: 'WS_R', x: legX_WS, z: legSpanZ },
    { name: 'WS_L', x: legX_WS, z: -legSpanZ },
    { name: 'LS_R', x: legX_LS, z: legSpanZ },
    { name: 'LS_L', x: legX_LS, z: -legSpanZ },
  ];

  bogieCorners.forEach((c) => {
    // Central equalizer rocker
    createPart(`Rocker_${c.name}`, rockerGeo, darkSteel, { position: [c.x, 0.95, c.z], parent: root });
    createPart(`Pivot_${c.name}`, bogiePivotGeo, darkSteel, { position: [c.x, 1.35, c.z], parent: root });

    // Two 2-wheel sub-trucks per corner = 4 wheels per corner = 16 wheels total
    [-1.15, 1.15].forEach((dz, tIdx) => {
      const tz = c.z + dz;
      createPart(`Truck_${c.name}_${tIdx}`, subTruckGeo, darkSteel, { position: [c.x, 0.6, tz], parent: root });

      // Wheels
      [-0.6, 0.6].forEach((wz, wIdx) => {
        const posZ = tz + wz;
        createPart(`Wheel_${c.name}_${tIdx}_${wIdx}`, wheelGeo, darkSteel, { position: [c.x, wheelY, posZ], parent: root });
        // Wheel flange inside rail
        createPart(`Flange_${c.name}_${tIdx}_${wIdx}`, flangeGeo, darkSteel, { position: [c.x + (c.x > 0 ? -0.15 : 0.15), wheelY, posZ], parent: root });
      });

      // Rail safety scrapers / storm clamps
      createPart(`Scraper_${c.name}_${tIdx}`, railScraperGeo, hazardYellow, {
        position: [c.x, railHeight + 0.1, tz + (dz > 0 ? 1.05 : -1.05)],
        parent: root,
      });
    });
  });

  // Cable reel drum on the Landside-Right sill beam (trailing high-voltage cable)
  const reelDrumGeo = cylinderXGeo(1.3, 1.3, 0.9, 16);
  const reelCoreGeo = cylinderXGeo(0.55, 0.55, 1.0, 16);
  createPart('CableReelDrum', reelDrumGeo, hazardYellow, { position: [legX_LS - 0.75, 2.2, legSpanZ - 2.5], parent: root });
  createPart('CableReelCore', reelCoreGeo, darkSteel, { position: [legX_LS - 0.75, 2.2, legSpanZ - 2.5], parent: root });
  beamBetween('ReelBracket_A', [legX_LS, 1.35, legSpanZ - 2.5], [legX_LS - 0.75, 2.2, legSpanZ - 2.5], 0.09, darkSteel, { parent: root });
  beamBetween('ReelBracket_B', [legX_LS, 1.35, legSpanZ - 1.7], [legX_LS - 0.75, 2.2, legSpanZ - 2.5], 0.08, darkSteel, { parent: root });

  // ==========================================
  // 2. PORTAL TOWER & MASSIVE LEGS
  // 4 Legs: 2 Waterside legs at +X, 2 Landside legs at -X
  // Spanning across dock at portal deck Y = portalH
  // ==========================================
  const deckX = 4.6;
  const deckZ = 5.2;

  // 4 Heavy boxed legs
  const legNodes = [
    { id: 'WS_R', b: [legX_WS, 1.4, legSpanZ],   t: [deckX, portalH, deckZ] },
    { id: 'WS_L', b: [legX_WS, 1.4, -legSpanZ],  t: [deckX, portalH, -deckZ] },
    { id: 'LS_R', b: [legX_LS, 1.4, legSpanZ],   t: [-deckX, portalH, deckZ] },
    { id: 'LS_L', b: [legX_LS, 1.4, -legSpanZ],  t: [-deckX, portalH, -deckZ] },
  ];

  legNodes.forEach((leg) => {
    beamBetween(`Leg_${leg.id}`, leg.b, leg.t, 0.48, craneOrange, { parent: root });
  });

  // Waterside Portal Opening (at +X) and Landside Portal Opening (at -X)
  // Cross beam at portalH spanning between Left (-Z) and Right (+Z) legs
  const portalGantryBeamGeo = boxGeo(1.1, 1.5, deckZ * 2 + 1.4);
  createPart('PortalBeam_WS', portalGantryBeamGeo, craneOrange, { position: [deckX, portalH, 0], parent: root });
  createPart('PortalBeam_LS', portalGantryBeamGeo, craneOrange, { position: [-deckX, portalH, 0], parent: root });

  // Longitudinal tie beams connecting Waterside and Landside at portalH
  const portalSideTieGeo = boxGeo(deckX * 2, 1.1, 1.1);
  createPart('PortalSideTie_R', portalSideTieGeo, craneOrange, { position: [0, portalH, deckZ], parent: root });
  createPart('PortalSideTie_L', portalSideTieGeo, craneOrange, { position: [0, portalH, -deckZ], parent: root });

  // Side A-Frame Truss Bracing (between Waterside & Landside legs at +Z and -Z)
  [-1, 1].forEach((sZ) => {
    const sideName = sZ > 0 ? 'R' : 'L';
    const zBase = sZ * legSpanZ;
    const zTop = sZ * deckZ;
    const zMid = (zBase + zTop) * 0.5;
    const midH = 8.8;

    // Horizontal mid-strut
    beamBetween(`SideStrut_${sideName}`, [legX_WS * 0.72, midH, zMid], [legX_LS * 0.72, midH, zMid], 0.28, craneOrange, { parent: root });

    // Lower X-brace
    beamBetween(`SideX_Low1_${sideName}`, [legX_WS, 1.8, zBase], [legX_LS * 0.72, midH, zMid], 0.22, craneOrange, { parent: root });
    beamBetween(`SideX_Low2_${sideName}`, [legX_LS, 1.8, zBase], [legX_WS * 0.72, midH, zMid], 0.22, craneOrange, { parent: root });

    // Upper X-brace
    beamBetween(`SideX_Up1_${sideName}`, [legX_WS * 0.72, midH, zMid], [-deckX, portalH, zTop], 0.22, craneOrange, { parent: root });
    beamBetween(`SideX_Up2_${sideName}`, [legX_LS * 0.72, midH, zMid], [deckX, portalH, zTop], 0.22, craneOrange, { parent: root });
  });

  // Diagonal Knee Braces under Portal Cross Girders (arch clearance for container trucks)
  [-1, 1].forEach((sX) => {
    const pX = sX > 0 ? deckX : -deckX;
    [-1, 1].forEach((sZ) => {
      beamBetween(`KneeBrace_${sX > 0 ? 'WS' : 'LS'}_${sZ > 0 ? 'R' : 'L'}`,
        [pX, portalH - 0.7, sZ * (deckZ - 1.2)],
        [sX * (Math.abs(pX) + 0.8), portalH - 3.8, sZ * (deckZ + 0.4)],
        0.22, craneOrange, { parent: root });
    });
  });

  // Portal Deck Walkway Platform & Safety Handrails
  const portalDeckPlank = boxGeo(deckX * 2 + 0.8, 0.16, deckZ * 2 - 0.8);
  createPart('PortalDeck', portalDeckPlank, darkSteel, { position: [0, portalH + 0.65, 0], parent: root });

  // Portal Deck Handrails
  [-1, 1].forEach((sZ) => {
    const zR = sZ * (deckZ - 0.25);
    beamBetween(`PortalRailTop_${sZ > 0 ? 'R' : 'L'}`, [-deckX, portalH + 1.65, zR], [deckX, portalH + 1.65, zR], 0.035, railingYellow, { parent: root });
    beamBetween(`PortalRailMid_${sZ > 0 ? 'R' : 'L'}`, [-deckX, portalH + 1.15, zR], [deckX, portalH + 1.15, zR], 0.025, railingYellow, { parent: root });
    for (let x = -deckX + 0.6; x <= deckX - 0.4; x += 1.8) {
      beamBetween(`PortalRailPost_${sZ > 0 ? 'R' : 'L'}_${Math.round(x)}`, [x, portalH + 0.65, zR], [x, portalH + 1.65, zR], 0.035, railingYellow, { parent: root });
    }
  });

  // ==========================================
  // 3. UPPER TOWER & A-FRAME PYLON (APEX)
  // Columns rising from portal deck (Y=16) to boom level (Y=25.5)
  // and A-frame pylon up to apex (Y=37)
  // ==========================================
  const boomDeckX = 3.4;
  const boomDeckZ = 3.6;

  const towerCols = [
    { id: 'WS_R', b: [deckX, portalH, deckZ],   t: [boomDeckX, boomH, boomDeckZ] },
    { id: 'WS_L', b: [deckX, portalH, -deckZ],  t: [boomDeckX, boomH, -boomDeckZ] },
    { id: 'LS_R', b: [-deckX, portalH, deckZ],  t: [-boomDeckX, boomH, boomDeckZ] },
    { id: 'LS_L', b: [-deckX, portalH, -deckZ], t: [-boomDeckX, boomH, -boomDeckZ] },
  ];

  towerCols.forEach((col) => {
    beamBetween(`TowerCol_${col.id}`, col.b, col.t, 0.40, craneOrange, { parent: root });
  });

  // Upper Tower side diagonal bracing
  [-1, 1].forEach((sZ) => {
    const side = sZ > 0 ? 'R' : 'L';
    beamBetween(`TowerX1_${side}`, [deckX, portalH + 1.0, sZ * deckZ], [-boomDeckX, boomH - 0.2, sZ * boomDeckZ], 0.2, craneOrange, { parent: root });
    beamBetween(`TowerX2_${side}`, [-deckX, portalH + 1.0, sZ * deckZ], [boomDeckX, boomH - 0.2, sZ * boomDeckZ], 0.2, craneOrange, { parent: root });
  });

  // Upper boom support collar beams
  beamBetween('BoomCollar_WS', [boomDeckX, boomH, boomDeckZ], [boomDeckX, boomH, -boomDeckZ], 0.32, craneOrange, { parent: root });
  beamBetween('BoomCollar_LS', [-boomDeckX, boomH, boomDeckZ], [-boomDeckX, boomH, -boomDeckZ], 0.32, craneOrange, { parent: root });

  // A-Frame Pylon (Mast) rising above the boom to apexH (Y = 37.0)
  const apexX = 0.6;
  const apexZ = 1.4;

  beamBetween('Pylon_WS_R', [boomDeckX, boomH, boomDeckZ], [apexX, apexH, apexZ], 0.32, craneOrange, { parent: root });
  beamBetween('Pylon_WS_L', [boomDeckX, boomH, -boomDeckZ], [apexX, apexH, -apexZ], 0.32, craneOrange, { parent: root });
  beamBetween('Pylon_LS_R', [-boomDeckX, boomH, boomDeckZ], [apexX, apexH, apexZ], 0.32, craneOrange, { parent: root });
  beamBetween('Pylon_LS_L', [-boomDeckX, boomH, -boomDeckZ], [apexX, apexH, -apexZ], 0.32, craneOrange, { parent: root });

  // Apex Crosshead & Sheave Nest
  const apexCapGeo = boxGeo(1.8, 0.9, apexZ * 2 + 1.1);
  createPart('ApexCap', apexCapGeo, darkSteel, { position: [apexX, apexH + 0.35, 0], parent: root });

  const apexSheaveGeo = torusGeo(0.55, 0.08, 8, 16);
  createPart('ApexSheave_R', apexSheaveGeo, darkSteel, { position: [apexX, apexH + 0.6, apexZ], rotation: [0, 90, 0], parent: root });
  createPart('ApexSheave_L', apexSheaveGeo, darkSteel, { position: [apexX, apexH + 0.6, -apexZ], rotation: [0, 90, 0], parent: root });

  // Aircraft Warning Beacon at Apex (properly overlapping ApexCap)
  const beaconGeo = cylinderYGeo(0.14, 0.14, 0.45, 8);
  createPart('PylonBeacon', beaconGeo, warningLight, { position: [apexX, apexH + 0.85, 0], parent: root });

  // Pylon internal lacings
  const pylonMidH = (boomH + apexH) * 0.5;
  beamBetween('PylonMidStrut_R', [(boomDeckX + apexX) * 0.5, pylonMidH, (boomDeckZ + apexZ) * 0.5], [(-boomDeckX + apexX) * 0.5, pylonMidH, (boomDeckZ + apexZ) * 0.5], 0.18, craneOrange, { parent: root });
  beamBetween('PylonMidStrut_L', [(boomDeckX + apexX) * 0.5, pylonMidH, (-boomDeckZ - apexZ) * 0.5], [(-boomDeckX + apexX) * 0.5, pylonMidH, (-boomDeckZ - apexZ) * 0.5], 0.18, craneOrange, { parent: root });
  beamBetween('PylonMidTie', [(boomDeckX + apexX) * 0.5, pylonMidH, (boomDeckZ + apexZ) * 0.5], [(boomDeckX + apexX) * 0.5, pylonMidH, (-boomDeckZ - apexZ) * 0.5], 0.18, craneOrange, { parent: root });

  // ==========================================
  // 4. MAIN CANTILEVER BOOM & COUNTERWEIGHT BOOM
  // Reaching out along +X over the water (outreach tip at X = +33.0)
  // Counterweight boom reaching behind along -X (tip at X = -15.5)
  // Twin box girders at Z = +/-1.85
  // ==========================================
  const boomTipX = 33.0;
  const boomRearX = -15.5;
  const boomLength = boomTipX - boomRearX; // 48.5m
  const boomCenterX = (boomTipX + boomRearX) * 0.5; // 8.75m
  const girderZ = 1.85;
  const girderWidth = 0.65;
  const girderHeight = 2.3;

  // Twin main girders
  const girderGeo = boxGeo(boomLength, girderHeight, girderWidth);
  createPart('Girder_R', girderGeo, craneOrange, { position: [boomCenterX, boomH + 1.15, girderZ], parent: root });
  createPart('Girder_L', girderGeo, craneOrange, { position: [boomCenterX, boomH + 1.15, -girderZ], parent: root });

  // Trolley running rails underneath girders (Y = boomH - 0.05)
  const trolleyRailGeo = boxGeo(boomLength - 3.5, 0.14, 0.18);
  createPart('TrolleyRail_R', trolleyRailGeo, darkSteel, { position: [boomCenterX + 1.6, boomH - 0.05, girderZ], parent: root });
  createPart('TrolleyRail_L', trolleyRailGeo, darkSteel, { position: [boomCenterX + 1.6, boomH - 0.05, -girderZ], parent: root });

  // Transverse diaphragms connecting the twin girders
  const diaphragmGeo = boxGeo(0.4, 1.9, girderZ * 2 - girderWidth);
  for (let x = -13.5; x <= 31.0; x += 3.5) {
    createPart(`Diaphragm_${Math.round(x)}`, diaphragmGeo, craneOrange, { position: [x, boomH + 1.15, 0], parent: root });
  }

  // Boom maintenance catwalk & decking
  const walkwayGeo = boxGeo(boomLength - 0.8, 0.12, girderZ * 2 - girderWidth);
  createPart('BoomWalkway', walkwayGeo, darkSteel, { position: [boomCenterX, boomH + 2.32, 0], parent: root });

  // Boom yellow safety handrails along both outer girder edges
  [-1, 1].forEach((sZ) => {
    const zRail = sZ * (girderZ + 0.38);
    beamBetween(`BoomRailTop_${sZ > 0 ? 'R' : 'L'}`, [boomRearX + 0.6, boomH + 3.35, zRail], [boomTipX - 0.6, boomH + 3.35, zRail], 0.035, railingYellow, { parent: root });
    beamBetween(`BoomRailMid_${sZ > 0 ? 'R' : 'L'}`, [boomRearX + 0.6, boomH + 2.85, zRail], [boomTipX - 0.6, boomH + 2.85, zRail], 0.025, railingYellow, { parent: root });
    for (let x = boomRearX + 1.0; x <= boomTipX - 1.0; x += 3.2) {
      beamBetween(`BoomRailPost_${sZ > 0 ? 'R' : 'L'}_${Math.round(x)}`, [x, boomH + 2.32, zRail], [x, boomH + 3.35, zRail], 0.03, railingYellow, { parent: root });
    }
  });

  // Boom Tip Headblock & Buffers at X = boomTipX
  const boomTipHeadGeo = boxGeo(0.9, 1.8, girderZ * 2 + 1.3);
  createPart('BoomTipHead', boomTipHeadGeo, darkSteel, { position: [boomTipX - 0.3, boomH + 1.15, 0], parent: root });

  // Warning light at boom tip (overlapping BoomTipHead top at boomH + 2.05)
  createPart('TipBeacon', beaconGeo, warningLight, { position: [boomTipX - 0.3, boomH + 2.15, 0], parent: root });

  // Floodlight array at boom tip pointing down toward cargo ships
  const floodlightBarGeo = boxGeo(0.25, 0.35, 3.4);
  createPart('FloodlightBar', floodlightBarGeo, darkSteel, { position: [boomTipX - 0.7, boomH - 0.25, 0], parent: root });
  // Rigid floodlight mounting brackets connecting to BoomTipHead
  beamBetween('LightMount_R', [boomTipX - 0.3, boomH + 0.3, 1.2], [boomTipX - 0.7, boomH - 0.25, 1.2], 0.06, darkSteel, { parent: root });
  beamBetween('LightMount_L', [boomTipX - 0.3, boomH + 0.3, -1.2], [boomTipX - 0.7, boomH - 0.25, -1.2], 0.06, darkSteel, { parent: root });

  [-1.2, 0, 1.2].forEach((zL, i) => {
    const lightHousingGeo = boxGeo(0.5, 0.45, 0.55);
    createPart(`FloodHousing_${i}`, lightHousingGeo, craneWhite, { position: [boomTipX - 0.7, boomH - 0.6, zL], parent: root });
    const lensGeo = cylinderXGeo(0.2, 0.2, 0.05, 12);
    createPart(`FloodLens_${i}`, lensGeo, glass, { position: [boomTipX - 0.44, boomH - 0.6, zL], parent: root });
  });

  // ==========================================
  // 5. TENSION STAYS (FORESTAYS & BACKSTAYS)
  // Structural pin-ended tension tie bars
  // ==========================================
  // Outer forestays to outreach tip (X = 27.0)
  beamBetween('Stay_Outer_R', [apexX, apexH + 0.5, apexZ], [27.0, boomH + 2.3, girderZ], 0.09, cableSteel, { parent: root });
  beamBetween('Stay_Outer_L', [apexX, apexH + 0.5, -apexZ], [27.0, boomH + 2.3, -girderZ], 0.09, cableSteel, { parent: root });

  // Inner forestays to mid boom (X = 14.5)
  beamBetween('Stay_Inner_R', [apexX, apexH + 0.4, apexZ], [14.5, boomH + 2.3, girderZ], 0.08, cableSteel, { parent: root });
  beamBetween('Stay_Inner_L', [apexX, apexH + 0.4, -apexZ], [14.5, boomH + 2.3, -girderZ], 0.08, cableSteel, { parent: root });

  // Rear backstays to counterweight boom (X = -14.0)
  beamBetween('Backstay_Main_R', [apexX, apexH + 0.5, apexZ], [-14.0, boomH + 2.3, girderZ], 0.09, cableSteel, { parent: root });
  beamBetween('Backstay_Main_L', [apexX, apexH + 0.5, -apexZ], [-14.0, boomH + 2.3, -girderZ], 0.09, cableSteel, { parent: root });

  // ==========================================
  // 6. MACHINE HOUSE & COUNTERWEIGHT
  // ==========================================
  // Machine House sits on rear boom deck (X = -4.8 to -11.4)
  const mhLength = 6.6;
  const mhWidth = 4.5;
  const mhHeight = 3.5;
  const mhGeo = boxGeo(mhLength, mhHeight, mhWidth);
  createPart('MachineHouse', mhGeo, craneWhite, { position: [-8.1, boomH + 2.32 + mhHeight * 0.5, 0], parent: root });

  // Machine house roof louvers & HVAC
  const hvacGeo = boxGeo(1.6, 0.8, 1.8);
  createPart('HVAC_Pod', hvacGeo, darkSteel, { position: [-6.8, boomH + 2.32 + mhHeight + 0.4, 0.9], parent: root });
  const ventCowlGeo = cylinderYGeo(0.38, 0.42, 0.6, 12);
  createPart('VentCowl', ventCowlGeo, darkSteel, { position: [-9.5, boomH + 2.32 + mhHeight + 0.3, -1.1], parent: root });

  // Service access doors
  const mhDoorGeo = boxGeo(0.1, 2.2, 1.1);
  createPart('MH_Door', mhDoorGeo, darkSteel, { position: [-4.75, boomH + 3.42, 0], parent: root });

  // Machine house roof maintenance jib crane
  const jibMastGeo = cylinderYGeo(0.12, 0.12, 1.9, 8);
  createPart('JibMast', jibMastGeo, hazardYellow, { position: [-10.8, boomH + 2.32 + mhHeight + 0.95, 1.3], parent: root });
  beamBetween('JibArm', [-10.8, boomH + 2.32 + mhHeight + 1.8, 1.3], [-7.8, boomH + 2.32 + mhHeight + 1.8, 1.3], 0.08, hazardYellow, { parent: root });
  beamBetween('JibStay', [-10.8, boomH + 2.32 + mhHeight + 1.8, 1.3], [-9.0, boomH + 2.32 + mhHeight + 1.2, 1.3], 0.05, cableSteel, { parent: root });

  // Machine house roof safety handrails (with vertical posts fully anchoring to roof)
  const mhTopY = boomH + 2.32 + mhHeight;
  [-1, 1].forEach((sZ) => {
    const zE = sZ * (mhWidth * 0.5 - 0.12);
    beamBetween(`MHRailTop_${sZ > 0 ? 'R' : 'L'}`, [-8.1 - mhLength * 0.5 + 0.2, mhTopY + 1.0, zE], [-8.1 + mhLength * 0.5 - 0.2, mhTopY + 1.0, zE], 0.03, railingYellow, { parent: root });
    beamBetween(`MHRailMid_${sZ > 0 ? 'R' : 'L'}`, [-8.1 - mhLength * 0.5 + 0.2, mhTopY + 0.5, zE], [-8.1 + mhLength * 0.5 - 0.2, mhTopY + 0.5, zE], 0.02, railingYellow, { parent: root });
    for (let x = -8.1 - mhLength * 0.5 + 0.3; x <= -8.1 + mhLength * 0.5 - 0.1; x += 1.6) {
      beamBetween(`MHRailPost_${sZ > 0 ? 'R' : 'L'}_${Math.round(x)}`, [x, mhTopY - 0.05, zE], [x, mhTopY + 1.0, zE], 0.03, railingYellow, { parent: root });
    }
  });

  // End rail at back of machine house roof
  const mhRearX = -8.1 - mhLength * 0.5 + 0.2;
  beamBetween('MHRailEndTop', [mhRearX, mhTopY + 1.0, -mhWidth * 0.5 + 0.12], [mhRearX, mhTopY + 1.0, mhWidth * 0.5 - 0.12], 0.03, railingYellow, { parent: root });
  beamBetween('MHRailEndMid', [mhRearX, mhTopY + 0.5, -mhWidth * 0.5 + 0.12], [mhRearX, mhTopY + 0.5, mhWidth * 0.5 - 0.12], 0.02, railingYellow, { parent: root });

  // Counterweight Blocks at rear boom tip (X = -13.2 to -15.5)
  const cwFrameGeo = boxGeo(2.64, 2.54, 4.4);
  createPart('CounterweightCradle', cwFrameGeo, darkSteel, { position: [-14.2, boomH + 1.25, 0], parent: root });
  const ballastBlockGeo = boxGeo(2.2, 2.06, 4.0);
  createPart('BallastBlock', ballastBlockGeo, concreteGrey, { position: [-14.2, boomH + 1.25, 0], parent: root });

  // ==========================================
  // 7. TROLLEY & OPERATOR CAB
  // Positioned out over the water at X = 18.0
  // ==========================================
  const trolleyX = 18.0;
  const trolleyY = boomH - 0.35; // overlaps bottom of rails

  // Trolley chassis
  const trolleyChassisGeo = boxGeo(4.4, 0.7, 4.3);
  createPart('TrolleyChassis', trolleyChassisGeo, craneOrange, { position: [trolleyX, trolleyY, 0], parent: root });

  // 4 Trolley wheel bogies engaging the boom rails
  [-1.6, 1.6].forEach((dx, idx) => {
    [-girderZ, girderZ].forEach((gz, sideIdx) => {
      const tWheel = cylinderZGeo(0.26, 0.26, 0.22, 12);
      createPart(`TrolleyWheel_${idx}_${sideIdx}`, tWheel, darkSteel, { position: [trolleyX + dx, boomH + 0.05, gz], parent: root });
      const tBracket = boxGeo(0.65, 0.45, 0.28);
      createPart(`TrolleyBracket_${idx}_${sideIdx}`, tBracket, darkSteel, { position: [trolleyX + dx, boomH - 0.15, gz], parent: root });
    });
  });

  // Hoist winch drums & drive motor housings on trolley
  const winchDrumGeo = cylinderXGeo(0.48, 0.48, 1.8, 16);
  createPart('WinchDrum_R', winchDrumGeo, darkSteel, { position: [trolleyX, trolleyY + 0.65, 1.0], parent: root });
  createPart('WinchDrum_L', winchDrumGeo, darkSteel, { position: [trolleyX, trolleyY + 0.65, -1.0], parent: root });

  const motorBoxGeo = boxGeo(1.3, 0.75, 1.1);
  createPart('HoistMotor_F', motorBoxGeo, darkSteel, { position: [trolleyX + 1.4, trolleyY + 0.6, 0], parent: root });
  createPart('HoistMotor_R', motorBoxGeo, darkSteel, { position: [trolleyX - 1.4, trolleyY + 0.6, 0], parent: root });

  // Operator Cab suspended underneath front-left of trolley
  const cabX = trolleyX + 1.2;
  const cabY = trolleyY - 1.85;
  const cabZ = 1.1; // offset so operator looks directly down at container spread

  // Cab rigid steel suspension arms
  beamBetween('CabHanger_1', [cabX - 0.85, trolleyY - 0.35, cabZ - 0.75], [cabX - 0.85, cabY + 1.15, cabZ - 0.75], 0.06, darkSteel, { parent: root });
  beamBetween('CabHanger_2', [cabX + 0.85, trolleyY - 0.35, cabZ - 0.75], [cabX + 0.85, cabY + 1.15, cabZ - 0.75], 0.06, darkSteel, { parent: root });
  beamBetween('CabHanger_3', [cabX - 0.85, trolleyY - 0.35, cabZ + 0.75], [cabX - 0.85, cabY + 1.15, cabZ + 0.75], 0.06, darkSteel, { parent: root });
  beamBetween('CabHanger_4', [cabX + 0.85, trolleyY - 0.35, cabZ + 0.75], [cabX + 0.85, cabY + 1.15, cabZ + 0.75], 0.06, darkSteel, { parent: root });

  // Cab body
  const cabBodyGeo = boxGeo(2.5, 2.1, 2.0);
  createPart('CabBody', cabBodyGeo, craneWhite, { position: [cabX, cabY, cabZ], parent: root });

  // Panoramic Glazing: forward window, downward observation bay, side windows
  const cabFrontWin = boxGeo(0.1, 1.15, 1.7);
  createPart('CabWin_Front', cabFrontWin, glass, { position: [cabX + 1.26, cabY + 0.35, cabZ], parent: root });

  // Downward floor observation window
  const cabDownWin = boxGeo(0.1, 0.75, 1.5);
  createPart('CabWin_Down', cabDownWin, glass, { position: [cabX + 1.2, cabY - 0.65, cabZ], rotation: [0, 0, 30], parent: root });

  // Side windows
  const cabSideWin = boxGeo(1.5, 1.05, 0.1);
  createPart('CabWin_SideR', cabSideWin, glass, { position: [cabX + 0.3, cabY + 0.35, cabZ + 1.01], parent: root });
  createPart('CabWin_SideL', cabSideWin, glass, { position: [cabX + 0.3, cabY + 0.35, cabZ - 1.01], parent: root });

  // Interior operator seat and dual console joysticks
  const seatGeo = boxGeo(0.65, 0.75, 0.65);
  createPart('OperatorSeat', seatGeo, cabInterior, { position: [cabX + 0.2, cabY - 0.2, cabZ], parent: root });
  const consoleGeo = boxGeo(0.45, 0.65, 0.85);
  createPart('OperatorConsole', consoleGeo, darkSteel, { position: [cabX + 0.85, cabY - 0.3, cabZ], parent: root });

  // ==========================================
  // 8. SPREADER & WIRE HOIST RIGGING
  // Spreader length (40ft = ~9.2m) is ALONG Z (parallel to dock & ship holds)!
  // Spreader width is ALONG X (~2.44m standard container width)
  // ==========================================
  const spreaderY = 9.2;
  const headblockY = spreaderY + 1.45;

  // Headblock (sheave carrier between cables and spreader)
  const headblockGeo = boxGeo(2.2, 0.7, 3.2);
  createPart('Headblock', headblockGeo, hazardYellow, { position: [trolleyX, headblockY, 0], parent: root });

  // 4 Hoist sheaves in headblock
  const hbSheaveGeo = torusGeo(0.38, 0.06, 8, 16);
  createPart('HbSheave_FR', hbSheaveGeo, darkSteel, { position: [trolleyX + 0.8, headblockY + 0.35, 1.1], rotation: [90, 0, 0], parent: root });
  createPart('HbSheave_FL', hbSheaveGeo, darkSteel, { position: [trolleyX + 0.8, headblockY + 0.35, -1.1], rotation: [90, 0, 0], parent: root });
  createPart('HbSheave_RR', hbSheaveGeo, darkSteel, { position: [trolleyX - 0.8, headblockY + 0.35, 1.1], rotation: [90, 0, 0], parent: root });
  createPart('HbSheave_RL', hbSheaveGeo, darkSteel, { position: [trolleyX - 0.8, headblockY + 0.35, -1.1], rotation: [90, 0, 0], parent: root });

  // 4 Main hoist steel cables (deeply overlapping trolley chassis and headblock)
  beamBetween('Cable_FR', [trolleyX + 0.8, trolleyY + 0.2, 1.1], [trolleyX + 0.8, headblockY - 0.1, 1.1], 0.038, cableSteel, { parent: root });
  beamBetween('Cable_FL', [trolleyX + 0.8, trolleyY + 0.2, -1.1], [trolleyX + 0.8, headblockY - 0.1, -1.1], 0.038, cableSteel, { parent: root });
  beamBetween('Cable_RR', [trolleyX - 0.8, trolleyY + 0.2, 1.1], [trolleyX - 0.8, headblockY - 0.1, 1.1], 0.038, cableSteel, { parent: root });
  beamBetween('Cable_RL', [trolleyX - 0.8, trolleyY + 0.2, -1.1], [trolleyX - 0.8, headblockY - 0.1, -1.1], 0.038, cableSteel, { parent: root });

  // Twistlock adapter pins connecting headblock to spreader frame
  [-0.7, 0.7].forEach((hx, hIdx) => {
    [-1.0, 1.0].forEach((hz, zIdx) => {
      beamBetween(`HbPin_${hIdx}_${zIdx}`, [trolleyX + hx, headblockY + 0.1, hz], [trolleyX + hx, spreaderY + 0.4, hz], 0.08, darkSteel, { parent: root });
    });
  });

  // 40ft Telescopic Container Spreader Body
  // Length along Z = 9.2m, width along X = 2.44m, height = 0.65m
  const spreaderMainGeo = boxGeo(2.44, 0.65, 9.2);
  createPart('SpreaderMain', spreaderMainGeo, hazardYellow, { position: [trolleyX, spreaderY, 0], parent: root });

  // Spreader central hydraulic pack & tower
  const hydrPackGeo = boxGeo(1.6, 0.85, 2.4);
  createPart('SpreaderHydraulics', hydrPackGeo, darkSteel, { position: [trolleyX, spreaderY + 0.55, 0], parent: root });

  // Telescoping end beams at Z = +/-4.6
  [-1, 1].forEach((sEnd) => {
    const endZ = sEnd * 4.6;
    const endBeamGeo = boxGeo(2.5, 0.8, 0.6);
    createPart(`SpreaderEnd_${sEnd > 0 ? 'R' : 'L'}`, endBeamGeo, hazardYellow, { position: [trolleyX, spreaderY, endZ], parent: root });

    // 4 Corner flippers (angled guide flippers for centering onto containers)
    [-1, 1].forEach((sX) => {
      const flipX = trolleyX + sX * 1.25;
      const flipperGeo = boxGeo(0.35, 0.95, 0.12);
      createPart(`Flipper_${sEnd > 0 ? 'R' : 'L'}_${sX > 0 ? 'F' : 'R'}`, flipperGeo, hazardYellow, {
        position: [flipX, spreaderY - 0.35, endZ + sEnd * 0.2],
        rotation: [sEnd * 25, 0, 0],
        parent: root,
      });

      // Twistlock pins at corner
      const twistlockGeo = cylinderYGeo(0.14, 0.14, 0.42, 8);
      createPart(`Twistlock_${sEnd > 0 ? 'R' : 'L'}_${sX > 0 ? 'F' : 'R'}`, twistlockGeo, darkSteel, {
        position: [flipX - sX * 0.15, spreaderY - 0.45, endZ],
        parent: root,
      });

      // Twistlock status indicator light
      const statusLightGeo = cylinderYGeo(0.06, 0.06, 0.12, 6);
      createPart(`StatusLight_${sEnd > 0 ? 'R' : 'L'}_${sX > 0 ? 'F' : 'R'}`, statusLightGeo, statusGreen, {
        position: [flipX - sX * 0.15, spreaderY + 0.45, endZ],
        parent: root,
      });
    });
  });

  // ==========================================
  // 9. ACCESS LADDERS & CATWALKS
  // ==========================================
  // Lower caged ladder on Landside-Right leg from dock rail level (Y=1.4) to mid landing (Y=8.8)
  createLadder('LegLadder_Lower', {
    bottom: [legX_LS * 0.95, 1.4, legSpanZ + 0.45],
    top: [legX_LS * 0.72, 8.8, (legSpanZ + deckZ) * 0.5 + 0.45],
    width: 0.5,
    rungCount: 16,
    material: railingYellow,
    parent: root,
  });

  // Mid landing platform at Y = 8.8
  const midLandingGeo = boxGeo(1.4, 0.12, 1.4);
  createPart('MidLanding_LS_R', midLandingGeo, darkSteel, { position: [legX_LS * 0.72, 8.8, (legSpanZ + deckZ) * 0.5 + 0.55], parent: root });

  // Upper ladder from mid landing (Y=8.8) to portal deck (Y=portalH)
  createLadder('LegLadder_Upper', {
    bottom: [legX_LS * 0.72, 8.8, (legSpanZ + deckZ) * 0.5 + 0.45],
    top: [-deckX - 0.1, portalH, deckZ + 0.45],
    width: 0.5,
    rungCount: 16,
    material: railingYellow,
    parent: root,
  });

  // Tower ladder from portal deck (Y=portalH) to boom level (Y=boomH)
  createLadder('TowerLadder', {
    bottom: [-deckX + 0.2, portalH + 0.65, deckZ - 0.2],
    top: [-boomDeckX + 0.2, boomH + 1.0, boomDeckZ - 0.2],
    width: 0.5,
    rungCount: 18,
    material: railingYellow,
    parent: root,
  });

  // Access stairs leading from rear boom deck into Machine House
  createLadder('MHLadder', {
    bottom: [-boomDeckX, boomH + 1.15, 0],
    top: [-4.75, boomH + 2.32, 0],
    width: 0.8,
    rungCount: 4,
    material: railingYellow,
    parent: root,
  });

  return root;
}
