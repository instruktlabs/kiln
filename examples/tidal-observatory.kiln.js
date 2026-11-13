// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opencode/muse-spark-1.3-contributor-free, via opencode.
// Dispatched into a clean directory with a brief, Kiln skills, and the MCP tools.
// No example asset or engine implementation was supplied as authoring context.
// Refined by the same model using source references after reviewer feedback on
// the island shape and category metadata. Geometry reviewed during authoring;
// material-faithful gallery render reviewed separately by the maintainer agent.
// Run date: 2026-09-05. See docs/dogfooding.md for the procedure and limitations.

const meta = { name: 'TidalObservatory', category: 'architecture', role: 'building' };

async function build() {
  const root = createRoot('TidalObservatory');

  // Palette: turquoise steel, aged copper, pale stone, warm brass, red accents
  const rockMat = gameMaterial(0x6f6a63, { roughness: 0.95 });
  const rockDark = gameMaterial(0x57534d, { roughness: 0.95 });
  const stoneMat = gameMaterial(0xd9d2c0, { roughness: 0.9 });
  const stoneDark = gameMaterial(0xb9b09a, { roughness: 0.9 });
  const steelMat = gameMaterial(0x2f9a90, { metalness: 0.55, roughness: 0.45 });
  const steelDark = gameMaterial(0x1f6e68, { metalness: 0.55, roughness: 0.5 });
  const copperMat = gameMaterial(0x62a48f, { metalness: 0.75, roughness: 0.42 });
  const copperDark = gameMaterial(0x4a7f6e, { metalness: 0.7, roughness: 0.5 });
  const brassMat = gameMaterial(0xc9a227, { metalness: 0.9, roughness: 0.32 });
  const brassDark = gameMaterial(0x9a7a1c, { metalness: 0.85, roughness: 0.4 });
  const redMat = gameMaterial(0xc2372b, { roughness: 0.55, metalness: 0.15 });
  const ironMat = gameMaterial(0x3a3f44, { metalness: 0.6, roughness: 0.55 });
  const glassMat = glassMaterial(0x9fd4d8, { opacity: 0.45, roughness: 0.15, metalness: 0.1 });

  // ---------- Rocky island base (ground contact Y=0) ----------
  const island = createPart('IslandRock', cylinderGeo(2.9, 4.2, 1.6, 12), rockMat, { position: [0, 0.8, 0], parent: root });
  createPart('IslandSkirt', cylinderGeo(3.6, 4.5, 0.5, 12), rockDark, { position: [0, 0.25, 0], parent: root });
  createPart('IslandShelf', cylinderGeo(3.0, 3.2, 0.5, 14), rockDark, { position: [0, 1.6, 0], parent: root });
  // boulders around the rim
  const bGeo = sphereGeo(0.55, 8, 6);
  const bPos = [[3.7, 0.4, 0.8], [-3.4, 0.4, 1.7], [1.5, 0.4, -3.6], [-2.0, 0.4, -3.1], [0.3, 0.4, 3.9], [-3.9, 0.4, -0.9], [3.9, 0.4, -1.5]];
  for (let i = 0; i < bPos.length; i++) {
    createPart('Boulder' + i, bGeo, rockDark, { position: bPos[i], scale: [1 + (i % 3) * 0.25, 0.7, 0.9], parent: root });
  }
  // lower rock shadow band grounds the island

  // ---------- Lower tide-measuring deck ----------
  const tideY = 1.85;
  createPart('TideDeck', cylinderGeo(2.6, 2.45, 0.2, 24), stoneMat, { position: [0, tideY, 0], parent: root });
  createPart('TideDeckRim', torusGeo(2.6, 0.07, 6, 32), steelMat, { position: [0, tideY + 0.1, 0], rotation: [90, 0, 0], parent: root });
  createPart('TideDeckBand', cylinderGeo(2.62, 2.62, 0.1, 24), steelDark, { position: [0, tideY - 0.06, 0], parent: root });
  // deck plank joints (3 radial seams)
  for (let i = 0; i < 3; i++) {
    const a = i * 60;
    createPart('TideSeam' + i, boxGeo(2.5, 0.02, 0.05), stoneDark, { position: [0, tideY + 0.11, 0], rotation: [0, a, 0], parent: root });
  }
  // tide gauge house + staff
  createPart('GaugePlinth', boxGeo(0.5, 0.25, 0.5), stoneDark, { position: [1.9, tideY + 0.22, -1.1], parent: root });
  createPart('GaugeHouse', boxGeo(0.4, 0.7, 0.4), steelMat, { position: [1.9, tideY + 0.7, -1.1], parent: root });
  createPart('GaugeRoof', coneGeo(0.36, 0.25, 4), copperDark, { position: [1.9, tideY + 1.17, -1.1], rotation: [0, 45, 0], parent: root });
  // stilling well pipe down through deck edge + brass cap
  createPart('StillingWell', cylinderGeo(0.11, 0.11, 1.5, 10), brassDark, { position: [2.35, tideY - 0.5, -0.4], parent: root });
  createPart('WellCap', sphereGeo(0.13, 10, 6), brassMat, { position: [2.35, tideY + 0.3, -0.4], parent: root });
  // graduated tide staff (white pole + red bands)
  createPart('TideStaff', boxGeo(0.12, 1.7, 0.12), stoneMat, { position: [-2.2, tideY - 0.2, 0.9], parent: root });
  for (let i = 0; i < 5; i++) {
    createPart('StaffBand' + i, boxGeo(0.14, 0.12, 0.14), redMat, { position: [-2.2, tideY - 0.8 + i * 0.3, 0.9], parent: root });
  }
  // red ladder down the rock face
  createLadder('TideLadder', { bottom: [2.75, 0.15, 1.35], top: [2.45, tideY + 0.1, 1.0], width: 0.4, rungCount: 6, material: redMat, parent: root });

  // ---------- Three slender buttressed supports ----------
  const supBaseY = tideY + 0.1;
  const supTopY = 4.35;
  const supR = 1.65;
  for (let k = 0; k < 3; k++) {
    const a = (k * 120 + 30) * Math.PI / 180;
    const bx = Math.cos(a) * supR, bz = Math.sin(a) * supR;
    const tx = Math.cos(a) * 1.35, tz = Math.sin(a) * 1.35;
    createPart('Footing' + k, boxGeo(0.5, 0.18, 0.5), stoneDark, { position: [bx, supBaseY + 0.09, bz], rotation: [0, -a * 180 / Math.PI, 0], parent: root });
    createPart('FootPlate' + k, boxGeo(0.34, 0.08, 0.34), ironMat, { position: [bx, supBaseY + 0.22, bz], parent: root });
    // main slender tapered column
    createPart('Column' + k, cylinderGeo(0.09, 0.14, supTopY - supBaseY, 10), steelMat, { position: [(bx + tx) / 2, (supBaseY + supTopY) / 2, (bz + tz) / 2], parent: root });
    // brass collar joints (construction joints)
    createPart('CollarLow' + k, cylinderGeo(0.16, 0.16, 0.1, 10), brassDark, { position: [bx * 0.95, supBaseY + 0.75, bz * 0.95], parent: root });
    createPart('CollarHigh' + k, cylinderGeo(0.13, 0.13, 0.1, 10), brassDark, { position: [tx, supTopY - 0.45, tz], parent: root });
    // buttress: diagonal strut from outer deck edge to column mid
    const ox = Math.cos(a) * 2.4, oz = Math.sin(a) * 2.4;
    beamBetween('Buttress' + k, [ox, supBaseY + 0.1, oz], [(bx + tx) / 2, supBaseY + 1.35, (bz + tz) / 2], 0.055, steelDark, { parent: root });
    // secondary cross brace to deck rim
    beamBetween('Brace' + k, [Math.cos(a + 0.5) * 2.2, supBaseY + 0.1, Math.sin(a + 0.5) * 2.2], [(bx + tx) / 2, supBaseY + 0.9, (bz + tz) / 2], 0.035, ironMat, { parent: root });
    // gusset plate at top
    createPart('Gusset' + k, boxGeo(0.3, 0.35, 0.06), steelDark, { position: [tx, supTopY - 0.2, tz], rotation: [0, -a * 180 / Math.PI, 0], parent: root });
  }
  // triangular ring beam linking the three column heads
  for (let k = 0; k < 3; k++) {
    const a0 = (k * 120 + 30) * Math.PI / 180, a1 = ((k + 1) * 120 + 30) * Math.PI / 180;
    beamBetween('RingBeam' + k, [Math.cos(a0) * 1.35, supTopY - 0.1, Math.sin(a0) * 1.35], [Math.cos(a1) * 1.35, supTopY - 0.1, Math.sin(a1) * 1.35], 0.06, steelMat, { parent: root });
  }

  // ---------- Main observatory deck ----------
  const deckY = 4.45;
  createPart('MainDeck', cylinderGeo(2.2, 2.0, 0.24, 24), stoneMat, { position: [0, deckY, 0], parent: root });
  createPart('DeckRim', torusGeo(2.2, 0.08, 6, 32), steelMat, { position: [0, deckY + 0.12, 0], rotation: [90, 0, 0], parent: root });
  createPart('DeckFrieze', cylinderGeo(2.22, 2.22, 0.1, 24), copperDark, { position: [0, deckY - 0.08, 0], parent: root });
  // railing posts + double rail
  const postGeo = cylinderGeo(0.03, 0.03, 0.75, 6);
  const firstPost = createPart('RailPost0', postGeo, ironMat, { position: [2.02, deckY + 0.5, 0], parent: root });
  arrayRadial('RailPost', firstPost, 14, 'y', root);
  createPart('RailTop', torusGeo(2.02, 0.035, 6, 32), brassMat, { position: [0, deckY + 0.88, 0], rotation: [90, 0, 0], parent: root });
  createPart('RailMid', torusGeo(2.02, 0.022, 6, 32), ironMat, { position: [0, deckY + 0.55, 0], rotation: [90, 0, 0], parent: root });
  // red life ring on railing
  createPart('LifeRing', torusGeo(0.16, 0.05, 6, 14), redMat, { position: [-1.2, deckY + 0.62, 1.65], rotation: [20, 30, 0], parent: root });

  // ---------- Copper-domed instrument room ----------
  const roomY = deckY + 0.12;
  createPart('RoomPlinth', cylinderGeo(1.3, 1.38, 0.3, 20), stoneDark, { position: [-0.35, roomY + 0.15, -0.35], parent: root });
  createPart('RoomDrum', cylinderGeo(1.12, 1.18, 1.5, 20), stoneMat, { position: [-0.35, roomY + 1.05, -0.35], parent: root });
  // turquoise panel band + pilasters
  createPart('RoomBand', cylinderGeo(1.16, 1.16, 0.35, 20), steelMat, { position: [-0.35, roomY + 1.62, -0.35], parent: root });
  for (let i = 0; i < 8; i++) {
    const a = i * 45 * Math.PI / 180;
    createPart('Pilaster' + i, boxGeo(0.1, 1.5, 0.08), steelDark, { position: [-0.35 + Math.cos(a) * 1.16, roomY + 1.05, -0.35 + Math.sin(a) * 1.16], rotation: [0, -a * 180 / Math.PI, 0], parent: root });
  }
  // windows with brass frames (4 sides)
  const winDirs = [0, 90, 180, 270];
  for (let i = 0; i < 4; i++) {
    const a = winDirs[i] * Math.PI / 180;
    const wx = -0.35 + Math.cos(a) * 1.14, wz = -0.35 + Math.sin(a) * 1.14;
    createPart('WinFrame' + i, boxGeo(0.1, 0.62, 0.46), brassDark, { position: [wx, roomY + 1.05, wz], rotation: [0, -a * 180 / Math.PI + 90, 0], parent: root });
    createPart('WinGlass' + i, boxGeo(0.06, 0.5, 0.34), glassMat, { position: [-0.35 + Math.cos(a) * 1.18, roomY + 1.05, -0.35 + Math.sin(a) * 1.18], rotation: [0, -a * 180 / Math.PI + 90, 0], parent: root });
    createPart('WinSill' + i, boxGeo(0.14, 0.06, 0.5), stoneDark, { position: [-0.35 + Math.cos(a) * 1.16, roomY + 0.7, -0.35 + Math.sin(a) * 1.16], rotation: [0, -a * 180 / Math.PI + 90, 0], parent: root });
  }
  // red door facing +X with steps
  createPart('DoorFrame', boxGeo(0.12, 0.95, 0.62), brassDark, { position: [0.822, roomY + 0.75, -0.35], parent: root });
  createPart('DoorLeaf', boxGeo(0.08, 0.85, 0.5), redMat, { position: [0.85, roomY + 0.72, -0.35], parent: root });
  createPart('DoorStep', boxGeo(0.5, 0.12, 0.7), stoneDark, { position: [1.1, roomY + 0.06, -0.35], parent: root });
  // entablature + copper dome (sphere sunk into drum)
  createPart('Entablature', cylinderGeo(1.28, 1.2, 0.22, 20), copperDark, { position: [-0.35, roomY + 1.9, -0.35], parent: root });
  createPart('DomeRing', torusGeo(1.2, 0.06, 6, 28), brassMat, { position: [-0.35, roomY + 2.0, -0.35], rotation: [90, 0, 0], parent: root });
  createPart('CopperDome', sphereGeo(1.18, 20, 12), copperMat, { position: [-0.35, roomY + 2.0, -0.35], parent: root });
  // dome ribs (8 straight chords base->apex read as seams)
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 + 22) * Math.PI / 180;
    beamBetween('DomeRib' + i, [-0.35 + Math.cos(a) * 1.12, roomY + 2.05, -0.35 + Math.sin(a) * 1.12], [-0.35 + Math.cos(a) * 0.12, roomY + 3.1, -0.35 + Math.sin(a) * 0.12], 0.028, copperDark, { parent: root });
  }
  createPart('DomeSeam', torusGeo(0.85, 0.03, 6, 24), copperDark, { position: [-0.35, roomY + 2.75, -0.35], rotation: [90, 0, 0], parent: root });
  // finial: brass ball + spike + red beacon
  createPart('FinialBase', cylinderGeo(0.12, 0.16, 0.18, 10), brassDark, { position: [-0.35, roomY + 3.22, -0.35], parent: root });
  createPart('FinialBall', sphereGeo(0.14, 12, 8), brassMat, { position: [-0.35, roomY + 3.42, -0.35], parent: root });
  createPart('FinialSpike', coneGeo(0.06, 0.4, 8), brassMat, { position: [-0.35, roomY + 3.7, -0.35], parent: root });
  createPart('Beacon', sphereGeo(0.07, 10, 8), redMat, { position: [-0.35, roomY + 3.95, -0.35], parent: root });

  // ---------- Curved gantry + brass armillary sphere ----------
  const gX = 1.15, gZ = 1.05, gBase = deckY + 0.12;
  createPart('GantryPlinth', boxGeo(0.7, 0.2, 0.7), stoneDark, { position: [gX, gBase + 0.1, gZ], parent: root });
  createPart('Pedestal', cylinderGeo(0.16, 0.22, 0.55, 12), stoneMat, { position: [gX, gBase + 0.47, gZ], parent: root });
  createPart('PedestalCap', cylinderGeo(0.24, 0.18, 0.12, 12), brassDark, { position: [gX, gBase + 0.8, gZ], parent: root });
  // curved gantry arch over the sphere (two bent pipes)
  const archL = pipeAlongPath([[gX - 0.55, gBase + 0.1, gZ - 0.4], [gX - 0.55, gBase + 1.5, gZ - 0.1], [gX, gBase + 1.9, gZ]], 0.05, { bendRadius: 0.25 });
  createPart('GantryLegL', archL, steelMat, { parent: root });
  const archR = pipeAlongPath([[gX + 0.55, gBase + 0.1, gZ + 0.45], [gX + 0.55, gBase + 1.5, gZ + 0.15], [gX, gBase + 1.9, gZ]], 0.05, { bendRadius: 0.25 });
  createPart('GantryLegR', archR, steelMat, { parent: root });
  createPart('GantryCrown', sphereGeo(0.09, 10, 8), redMat, { position: [gX, gBase + 1.9, gZ], parent: root });
  // hanging plumb line from crown
  beamBetween('PlumbLine', [gX, gBase + 1.85, gZ], [gX, gBase + 1.25, gZ], 0.012, ironMat, { parent: root });
  createPart('PlumbBob', coneGeo(0.045, 0.12, 8), brassMat, { position: [gX, gBase + 1.18, gZ], rotation: [180, 0, 0], parent: root });
  // armillary sphere: tilted axis + 3 rings + core
  const armY = gBase + 1.05;
  const axis = createPart('ArmAxis', cylinderGeo(0.025, 0.025, 1.15, 8), brassDark, { position: [gX, armY, gZ], rotation: [23.5, 0, 0], parent: root });
  createPart('ArmCore', sphereGeo(0.14, 12, 8), brassMat, { position: [gX, armY, gZ], parent: root });
  createPart('RingEquator', torusGeo(0.45, 0.028, 6, 28), brassMat, { position: [gX, armY, gZ], rotation: [90, 0, 0], parent: root });
  createPart('RingMeridian', torusGeo(0.38, 0.025, 6, 26), brassMat, { position: [gX, armY, gZ], rotation: [0, 23.5, 0], parent: root });
  createPart('RingOuter', torusGeo(0.55, 0.03, 6, 30), brassDark, { position: [gX, armY, gZ], rotation: [0, 90, 23.5], parent: root });
  // pointer sight on outer ring
  createPart('Sight', boxGeo(0.1, 0.06, 0.12), redMat, { position: [gX, armY + 0.55, gZ], parent: root });

  // ---------- Spiral exterior stairs (tide deck -> main deck) ----------
  const stCX = -1.65, stCZ = 1.2;
  const stBase = tideY + 0.1, stTop = deckY + 0.12;
  const nSteps = 17;
  createPart('StairNewel', cylinderGeo(0.07, 0.09, stTop - stBase - 0.1, 10), steelDark, { position: [stCX, (stBase + stTop) / 2 - 0.05, stCZ], parent: root });
  createPart('StairFoot', cylinderGeo(0.3, 0.35, 0.18, 12), stoneDark, { position: [stCX, stBase + 0.09, stCZ], parent: root });
  const treadGeo = boxGeo(0.75, 0.06, 0.3);
  let prevRailTop = null;
  for (let i = 0; i < nSteps; i++) {
    const t = i / (nSteps - 1);
    const ang = (-40 + t * 300) * Math.PI / 180;
    const y = stBase + 0.2 + t * (stTop - stBase - 0.25);
    const px = stCX + Math.cos(ang) * 0.32, pz = stCZ + Math.sin(ang) * 0.32;
    createPart('Tread' + i, treadGeo, stoneMat, { position: [px, y, pz], rotation: [0, -ang * 180 / Math.PI, 0], parent: root });
    // outer baluster every other step + handrail segments
    if (i % 2 === 0) {
      const ox = stCX + Math.cos(ang) * 0.68, oz = stCZ + Math.sin(ang) * 0.68;
      createPart('Baluster' + i, cylinderGeo(0.02, 0.02, 0.7, 6), ironMat, { position: [ox, y + 0.38, oz], parent: root });
      const top = [ox, y + 0.75, oz];
      if (prevRailTop) beamBetween('Handrail' + i, prevRailTop, top, 0.025, brassMat, { parent: root });
      prevRailTop = top;
    }
    // red accent tread nosing every 4th step
    if (i % 4 === 1) {
      createPart('Nosing' + i, boxGeo(0.72, 0.025, 0.05), redMat, { position: [px + Math.cos(ang + Math.PI / 2) * 0.0, y + 0.04, pz], rotation: [0, -ang * 180 / Math.PI, 0], parent: root });
    }
  }
  // landing gangway to main deck
  createPart('Landing', boxGeo(1.1, 0.1, 0.6), stoneMat, { position: [-1.05, stTop, 0.95], rotation: [0, -30, 0], parent: root });
  beamBetween('LandingStayA', [-1.4, stTop - 0.05, 1.05], [-1.1, supTopY - 0.3, 0.6], 0.03, ironMat, { parent: root });

  // ---------- deck props: telescope, crates, valve, lamp ----------
  // small brass telescope on railing mount
  beamBetween('ScopePost', [0.4, deckY + 0.12, -1.95], [0.4, deckY + 0.85, -1.95], 0.04, ironMat, { parent: root });
  createPart('Telescope', cylinderXGeo(0.09, 0.11, 0.7, 12), brassMat, { position: [0.55, deckY + 0.95, -1.95], rotation: [0, -15, 12], parent: root });
  createPart('ScopeEyepiece', cylinderXGeo(0.04, 0.04, 0.18, 8), ironMat, { position: [0.15, deckY + 0.88, -1.9], rotation: [0, -15, 12], parent: root });
  // red valve wheel + pipe on deck
  createPart('ValvePipe', cylinderGeo(0.06, 0.06, 0.5, 8), copperDark, { position: [-1.35, deckY + 0.37, -0.9], parent: root });
  createPart('ValveWheel', torusGeo(0.14, 0.025, 6, 16), redMat, { position: [-1.35, deckY + 0.68, -0.9], rotation: [90, 0, 0], parent: root });
  // crates + coiled rope
  createPart('CrateA', boxGeo(0.4, 0.4, 0.4), stoneDark, { position: [0.5, deckY + 0.32, 0.9], rotation: [0, 20, 0], parent: root });
  createPart('CrateB', boxGeo(0.3, 0.3, 0.3), stoneDark, { position: [0.55, deckY + 0.67, 0.85], rotation: [0, -10, 0], parent: root });
  createPart('RopeCoil', torusGeo(0.18, 0.06, 6, 16), brassDark, { position: [-0.9, deckY + 0.18, 1.35], rotation: [90, 0, 0], parent: root });
  // deck lamp posts (2) with warm lamp + red cap
  for (let i = 0; i < 2; i++) {
    const a = (140 + i * 180) * Math.PI / 180;
    const lx = Math.cos(a) * 1.85, lz = Math.sin(a) * 1.85;
    beamBetween('LampPost' + i, [lx, deckY + 0.12, lz], [lx, deckY + 1.15, lz], 0.035, ironMat, { parent: root });
    createPart('LampHead' + i, sphereGeo(0.09, 10, 8), brassMat, { position: [lx, deckY + 1.22, lz], parent: root });
    createPart('LampCap' + i, coneGeo(0.12, 0.1, 8), redMat, { position: [lx, deckY + 1.33, lz], parent: root });
  }

  return root;
}
