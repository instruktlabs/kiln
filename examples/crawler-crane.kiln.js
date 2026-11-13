// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opencode-go/minimax-m3, via opencode.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'CrawlerCrane', category: 'prop', role: 'vehicle' };

async function build() {
  const root = createRoot('CrawlerCrane');

  // ========== MATERIALS ==========
  const yellow = gameMaterial(0xe0a020, { roughness: 0.55, metalness: 0.3 });
  const yellowLite = gameMaterial(0xf0c840, { roughness: 0.5, metalness: 0.25 });
  const darkSteel = gameMaterial(0x1f1f1f, { roughness: 0.55, metalness: 0.7 });
  const steel = gameMaterial(0x5a5a5a, { roughness: 0.5, metalness: 0.8 });
  const rubber = gameMaterial(0x1a1a1a, { roughness: 0.95 });
  const cabGlass = glassMaterial(0x99ccee, { opacity: 0.5 });
  const cable = gameMaterial(0x1a1a1a, { roughness: 0.7, metalness: 0.3 });
  const counterMat = gameMaterial(0x3a3a3a, { roughness: 0.75, metalness: 0.4 });
  const hubMat = gameMaterial(0xc8a830, { roughness: 0.5, metalness: 0.6 });
  const black = gameMaterial(0x0a0a0a, { roughness: 0.7, metalness: 0.5 });
  const warnYellow = gameMaterial(0xff8800, { roughness: 0.6, metalness: 0.2 });
  const chrome = gameMaterial(0xc0c0c0, { roughness: 0.2, metalness: 0.9 });

  // ========== UNDERCARRIAGE ==========
  const undercarriage = createPivot('Undercarriage', [0, 0, 0], root);

  createPart('CarbodyPlate', boxGeo(5.4, 0.08, 2.7), darkSteel, { position: [0, 0.6, 0], parent: undercarriage });
  createPart('Carbody', boxGeo(4.6, 0.3, 1.2), darkSteel, { position: [0, 0.92, 0], parent: undercarriage });
  createPart('Bearing', cylinderYGeo(1.15, 1.15, 0.06, 24), steel, { position: [0, 1.078, 0], parent: undercarriage });

  for (const side of [-1, 1]) {
    const sName = side > 0 ? 'R' : 'L';
    const trackSide = createPivot('TrackSide_' + sName, [0, 0, side * 1.5], undercarriage);

    createPart('TrackFrame_' + sName, boxGeo(5.5, 0.4, 0.45), darkSteel, { position: [0, 0.5, 0], parent: trackSide });
    createPart('TrackSideGuard_' + sName, boxGeo(5.5, 0.08, 0.04), yellow, { position: [0, 0.95, side * 0.23], parent: trackSide });
    createPart('TrackSideGuard2_' + sName, boxGeo(5.5, 0.04, 0.02), yellow, { position: [0, 0.3, side * 0.23], parent: trackSide });

    for (let i = 0; i < 7; i++) {
      const x = -2.1 + i * 0.7;
      createPart('RoadTire_' + sName + '_' + i, cylinderZGeo(0.34, 0.34, 0.55, 18), rubber, { position: [x, 0.34, 0], parent: trackSide });
      createPart('RoadHub_' + sName + '_' + i, cylinderZGeo(0.13, 0.13, 0.6, 12), hubMat, { position: [x, 0.34, 0], parent: trackSide });
      for (let a = 0; a < 3; a++) {
        const ang = (a / 3) * Math.PI * 2;
        createPart('HubBolt_' + sName + '_' + i + '_' + a, cylinderZGeo(0.025, 0.025, 0.62, 6), steel, { position: [x, 0.34 + Math.cos(ang) * 0.08, Math.sin(ang) * 0.08], parent: trackSide });
      }
    }

    createPart('SprocketDisc_' + sName, cylinderZGeo(0.46, 0.46, 0.4, 22), hubMat, { position: [2.4, 0.62, 0], parent: trackSide });
    for (let t = 0; t < 14; t++) {
      const ta = (t / 14) * Math.PI * 2;
      createPart('SprocketTooth_' + sName + '_' + t, boxGeo(0.06, 0.08, 0.42), hubMat, { position: [2.4 + Math.cos(ta) * 0.48, 0.62 + Math.sin(ta) * 0.48, 0], rotation: [0, 0, ta * 180 / Math.PI], parent: trackSide });
    }
    createPart('SprocketHub_' + sName, cylinderZGeo(0.16, 0.16, 0.48, 12), darkSteel, { position: [2.4, 0.62, 0], parent: trackSide });

    createPart('Idler_' + sName, cylinderZGeo(0.4, 0.4, 0.42, 18), hubMat, { position: [-2.4, 0.62, 0], parent: trackSide });
    createPart('IdlerHub_' + sName, cylinderZGeo(0.14, 0.14, 0.46, 10), darkSteel, { position: [-2.4, 0.62, 0], parent: trackSide });

    for (let i = 0; i < 3; i++) {
      const x = -1.5 + i * 1.5;
      createPart('CarrierRoller_' + sName + '_' + i, cylinderZGeo(0.22, 0.22, 0.4, 12), hubMat, { position: [x, 1.05, 0], parent: trackSide });
    }

    const numStraight = 12, numArc = 6, arcR = 0.5;
    for (let i = 0; i < numStraight; i++) {
      const t = i / numStraight;
      const x = -2.4 + t * 4.8;
      createPart('TS_B_' + sName + '_' + i, boxGeo(0.42, 0.13, 0.554), black, { position: [x, 0.13, 0], parent: trackSide });
      createPart('TS_B_Grouser_' + sName + '_' + i, boxGeo(0.42, 0.02, 0.08), steel, { position: [x, 0.22, 0], parent: trackSide });
    }
    for (let i = 0; i < numArc; i++) {
      const t = i / numArc;
      const ang = -Math.PI / 2 + t * Math.PI;
      const x = 2.4 + Math.cos(ang) * arcR;
      const y = 0.65 + Math.sin(ang) * arcR;
      const rotDeg = (ang + Math.PI / 2) * 180 / Math.PI;
      createPart('TS_R_' + sName + '_' + i, boxGeo(0.42, 0.13, 0.554), black, { position: [x, y, 0], rotation: [0, 0, rotDeg], parent: trackSide });
    }
    for (let i = 0; i < numStraight; i++) {
      const t = i / numStraight;
      const x = 2.4 - t * 4.8;
      createPart('TS_T_' + sName + '_' + i, boxGeo(0.42, 0.13, 0.554), black, { position: [x, 1.18, 0], parent: trackSide });
    }
    for (let i = 0; i < numArc; i++) {
      const t = i / numArc;
      const ang = Math.PI / 2 + t * Math.PI;
      const x = -2.4 + Math.cos(ang) * arcR;
      const y = 0.65 + Math.sin(ang) * arcR;
      const rotDeg = (ang + Math.PI / 2) * 180 / Math.PI;
      createPart('TS_L_' + sName + '_' + i, boxGeo(0.42, 0.13, 0.554), black, { position: [x, y, 0], rotation: [0, 0, rotDeg], parent: trackSide });
    }
    createPart('TrackTension_' + sName, cylinderYGeo(0.08, 0.08, 0.5, 8), yellow, { position: [-1.7, 0.5, side * 0.1], parent: trackSide });
  }

  // ========== HOUSE (Upper Structure) ==========
  const house = createPivot('House', [0, 1.13, 0], root);
  createPart('Turntable', cylinderYGeo(1.3, 1.3, 0.16, 32), darkSteel, { position: [0, 0, 0], parent: house });
  createPart('SlewingRing', cylinderYGeo(1.38, 1.38, 0.05, 32), steel, { position: [0, 0.06, 0], parent: house });

  const engineDeckGeo = await roundedBoxGeo(2.4, 0.85, 2.4, 0.05);
  createPart('EngineDeck', engineDeckGeo, yellow, { position: [-0.3, 0.5, 0], parent: house });

  for (let i = -1; i <= 1; i += 2) {
    for (let j = 0; j < 4; j++) {
      createPart('Louver_' + i + '_' + j, boxGeo(0.5, 0.04, 0.02), darkSteel, { position: [-0.3 - 0.4, 0.4 + j * 0.12, i * 1.22], parent: house });
    }
  }

  createPart('EngineHatch', boxGeo(0.7, 0.04, 0.7), darkSteel, { position: [-0.3, 0.95, 0.4], parent: house });
  createPart('EngineHatch2', boxGeo(0.4, 0.04, 0.5), darkSteel, { position: [-0.3, 0.95, -0.5], parent: house });
  createPart('Exhaust', cylinderYGeo(0.06, 0.06, 0.8, 8), darkSteel, { position: [-0.6, 1.15, 0.7], parent: house });
  createPart('ExhaustCap', cylinderYGeo(0.1, 0.1, 0.04, 8), steel, { position: [-0.6, 1.58, 0.7], parent: house });

  for (let i = 0; i < 3; i++) {
    const slabH = 0.45;
    const slabY = 0.2 + i * (slabH + 0.04);
    const slabGeo = await roundedBoxGeo(1.15, slabH, 2.55, 0.04);
    createPart('CounterSlab_' + i, slabGeo, counterMat, { position: [-1.6, slabY, 0], parent: house });
    for (let j = -1; j <= 1; j += 2) {
      createPart('CounterTie_' + i + '_' + (j > 0 ? 'R' : 'L'), boxGeo(1.05, 0.05, 0.05), yellow, { position: [-1.6, slabY + slabH / 2, j * 1.2], parent: house });
    }
    for (let bx = -1; bx <= 1; bx += 2) {
      for (let by = -1; by <= 1; by += 2) {
        createPart('CounterBolt_' + i + '_' + bx + '_' + by, cylinderYGeo(0.035, 0.035, 0.5, 6), steel, { position: [-1.6 + bx * 0.45, slabY + slabH / 2, by * 1.15], rotation: [90, 0, 0], parent: house });
      }
    }
  }

  createPart('CounterFrameBack', boxGeo(1.1, 1.5, 0.08), yellow, { position: [-1.6, 1.45, 0], parent: house });

  const cabGeo = await roundedBoxGeo(1.3, 1.4, 1.5, 0.07);
  createPart('Cab', cabGeo, yellow, { position: [1.5, 1.0, -0.9], parent: house });
  createPart('CabWindowFront', boxGeo(1.21, 0.95, 1.44), cabGlass, { position: [1.53, 1.3, -0.9], parent: house });
  createPart('CabWindowSide', boxGeo(1.22, 0.7, 0.02), cabGlass, { position: [1.5, 1.25, -1.65], parent: house });
  createPart('CabRoof', boxGeo(1.35, 0.07, 1.55), yellow, { position: [1.5, 1.72, -0.9], parent: house });
  createPart('CabBeacon', cylinderYGeo(0.07, 0.07, 0.08, 8), warnYellow, { position: [1.5, 1.8, -0.9], parent: house });
  createPart('CabDoor', boxGeo(0.04, 1.0, 0.6), yellow, { position: [1.5 + 0.66, 0.95, -0.6], parent: house });
  createPart('CabDoorHandle', boxGeo(0.03, 0.05, 0.12), steel, { position: [1.5 + 0.68, 1.05, -0.4], parent: house });
  createPart('CabStep', boxGeo(0.6, 0.06, 1.0), darkSteel, { position: [1.9, 0.3, -0.4], parent: house });

  // Side mirror
  createPart('MirrorArm', boxGeo(0.02, 0.02, 0.4), steel, { position: [2.16, 1.35, -0.7], parent: house });
  createPart('Mirror', boxGeo(0.12, 0.18, 0.04), chrome, { position: [2.16, 1.35, -0.9], parent: house });

  createLadder('CabLadder', { bottom: [1.9, 0.3, -0.05], top: [1.9, 1.7, -0.05], width: 0.45, rungCount: 6, railRadius: 0.025, rungRadius: 0.022, parent: house });

  // Rear handrail - posts taller so rails attach properly
  for (let i = -1; i <= 1; i++) {
    createPart('RailPost_' + i, cylinderYGeo(0.03, 0.03, 0.65, 6), yellow, { position: [-0.3, 1.07, i * 1.05], parent: house });
  }
  // Top horizontal rails
  for (let i = 0; i < 2; i++) {
    createPart('RailTop_' + i, cylinderZGeo(0.028, 0.028, 2.1, 6), yellow, { position: [-0.3, 1.35, 0], rotation: [0, 90, 0], parent: house });
    createPart('RailMid_' + i, cylinderZGeo(0.022, 0.022, 2.1, 6), yellow, { position: [-0.3, 1.18, 0], rotation: [0, 90, 0], parent: house });
  }
  // End rails connecting front to back
  for (let i = -1; i <= 1; i += 2) {
    createPart('RailEnd_' + i, cylinderXGeo(0.022, 0.022, 0.95, 6), yellow, { position: [0.16, 1.35, i * 1.05], parent: house });
  }

  // ========== A-FRAME MAST (gantry for pendant lines) ==========
  // Positioned BETWEEN counterweight and cab (not overlapping cab)
  const aFrameX = 0.3;
  const aFrameBaseY = 0.3, aFrameTipY = 3.0, aFrameBaseZ = 1.1;

  beamBetween('AFrameLeg_L', [aFrameX, aFrameBaseY, -aFrameBaseZ], [aFrameX, aFrameTipY, 0], 0.06, yellow, { parent: house });
  beamBetween('AFrameLeg_R', [aFrameX, aFrameBaseY, aFrameBaseZ], [aFrameX, aFrameTipY, 0], 0.06, yellow, { parent: house });
  beamBetween('AFrameCross1', [aFrameX, aFrameBaseY + 0.5, -0.9], [aFrameX, aFrameBaseY + 0.5, 0.9], 0.035, yellow, { parent: house });
  beamBetween('AFrameCross2', [aFrameX, aFrameBaseY + 1.2, -0.65], [aFrameX, aFrameBaseY + 1.2, 0.65], 0.035, yellow, { parent: house });
  beamBetween('AFrameCross3', [aFrameX, aFrameBaseY + 1.9, -0.35], [aFrameX, aFrameBaseY + 1.9, 0.35], 0.035, yellow, { parent: house });

  createPart('PendantPin', cylinderZGeo(0.06, 0.06, 0.2, 8), steel, { position: [aFrameX, aFrameTipY + 0.05, 0], parent: house });
  createPart('PendantPinHouse', boxGeo(0.12, 0.12, 0.12), steel, { position: [aFrameX, aFrameTipY + 0.05, 0], parent: house });

  // ========== BOOM ==========
  const boomLength = 11.0;
  const boomPivot = createPivot('BoomFoot', [1.85, 2.0, 0], house);
  boomPivot.rotation.z = Math.PI / 180 * 62;
  const numSegs = 8;
  const segLen = boomLength / numSegs;
  const chordR = 0.055;

  for (let s = 0; s < numSegs; s++) {
    const x0 = s * segLen, x1 = (s + 1) * segLen, xc = (x0 + x1) / 2;
    const t0 = s / numSegs, t1 = (s + 1) / numSegs;
    const halfW0 = 0.5 - 0.32 * t0, halfW1 = 0.5 - 0.32 * t1;
    const topY0 = 0.6 - 0.38 * t0, topY1 = 0.6 - 0.38 * t1;

    createPart('BTopChord_' + s, cylinderXGeo(chordR, chordR, segLen, 6), yellow, { position: [xc, (topY0 + topY1) / 2, 0], parent: boomPivot });
    createPart('BBLChord_' + s, cylinderXGeo(chordR, chordR, segLen, 6), yellow, { position: [xc, 0, -(halfW0 + halfW1) / 2], parent: boomPivot });
    createPart('BBRChord_' + s, cylinderXGeo(chordR, chordR, segLen, 6), yellow, { position: [xc, 0, (halfW0 + halfW1) / 2], parent: boomPivot });

    const dr = chordR * 0.85;
    beamBetween('BLD1_' + s, [x0, topY0, -halfW0], [x1, 0, -halfW1], dr, yellow, { parent: boomPivot });
    beamBetween('BLD2_' + s, [x0, 0, -halfW0], [x1, topY1, -halfW1], dr, yellow, { parent: boomPivot });
    beamBetween('BRD1_' + s, [x0, topY0, halfW0], [x1, 0, halfW1], dr, yellow, { parent: boomPivot });
    beamBetween('BRD2_' + s, [x0, 0, halfW0], [x1, topY1, halfW1], dr, yellow, { parent: boomPivot });
    beamBetween('BBD1_' + s, [x0, 0, -halfW0], [x1, 0, halfW1], dr, yellow, { parent: boomPivot });
    beamBetween('BBD2_' + s, [x0, 0, halfW0], [x1, 0, -halfW1], dr, yellow, { parent: boomPivot });

    // Joint bolts at each chord crossing (every chord intersection)
    for (let pt of [
      [x0, topY0, -halfW0], [x0, 0, -halfW0], [x0, 0, halfW0],
      [x1, topY1, -halfW1], [x1, 0, -halfW1], [x1, 0, halfW1]
    ]) {
      if (pt[0] <= boomLength + 0.01) {
        const tag = pt[1] > 0 ? 'T' : (pt[2] < 0 ? 'BL' : 'BR');
        createPart('BJointBolt_' + s + '_' + pt[0].toFixed(1) + '_' + tag,
          sphereGeo(0.045, 6, 4),
          steel,
          { position: pt, parent: boomPivot });
      }
    }
  }

  // Boom tip cap
  const tipHW = 0.5 - 0.32, tipTopY = 0.6 - 0.38;
  createPart('BoomTipCap', boxGeo(0.18, tipTopY + 0.06, tipHW * 2 + 0.06), yellow, { position: [boomLength + 0.06, tipTopY / 2, 0], parent: boomPivot });
  createPart('BoomTipGusset_L', boxGeo(0.08, tipTopY, 0.05), yellow, { position: [boomLength - 0.04, tipTopY / 2, -tipHW], parent: boomPivot });
  createPart('BoomTipGusset_R', boxGeo(0.08, tipTopY, 0.05), yellow, { position: [boomLength - 0.04, tipTopY / 2, tipHW], parent: boomPivot });

  // Sheave at boom tip (the pulley for hoist cable)
  createPart('Sheave', cylinderZGeo(0.2, 0.2, 0.14, 18), steel, { position: [boomLength - 0.1, tipTopY * 0.6, 0], parent: boomPivot });
  createPart('SheaveRim', torusGeo(0.2, 0.025, 8, 18), steel, { position: [boomLength - 0.1, tipTopY * 0.6, 0], rotation: [0, 90, 0], parent: boomPivot });
  createPart('SheaveShaft', cylinderZGeo(0.04, 0.04, 0.25, 8), darkSteel, { position: [boomLength - 0.1, tipTopY * 0.6, 0], parent: boomPivot });

  // Top pendant bridle
  createPart('BoomBridle', boxGeo(0.15, 0.06, 0.3), steel, { position: [boomLength - 0.05, tipTopY + 0.06, 0], parent: boomPivot });
  createPart('BoomBridlePin', cylinderZGeo(0.04, 0.04, 0.3, 8), steel, { position: [boomLength - 0.05, tipTopY + 0.06, 0], parent: boomPivot });

  // Boom foot pin (connects boom to house)
  createPart('BoomFootPin', cylinderZGeo(0.08, 0.08, 0.4, 12), steel, { position: [0, 0, 0], parent: boomPivot });
  createPart('BoomFootPinCap', boxGeo(0.18, 0.18, 0.18), steel, { position: [0, 0, 0], parent: boomPivot });

  // Boom warning light (top of boom tip)
  createPart('BoomLight', boxGeo(0.08, 0.04, 0.08), warnYellow, { position: [boomLength - 0.3, tipTopY + 0.05, 0], parent: boomPivot });

  // ========== CABLE + HOOK BLOCK ==========
  // Boom tip world coords: pivot at (1.85, 2.0, 0) in house; house at (0, 1.13, 0)
  // Local (boomLength, tipTopY + 0.06, 0) rotated 62° around Z:
  // x_house = 11*0.4695 - 0.28*0.8829 = 5.165 - 0.247 = 4.918
  // y_house = 11*0.8829 + 0.28*0.4695 = 9.712 + 0.131 = 9.843
  // World: (1.85 + 4.918, 1.13 + 2.0 + 9.843, 0) = (6.768, 12.973, 0)
  const boomTipWorld = { x: 6.77, y: 12.97, z: 0 };
  const cableLength = 7.8;

  createPart('Cable', cylinderYGeo(0.03, 0.03, cableLength, 6), cable, { position: [boomTipWorld.x, boomTipWorld.y - cableLength / 2, boomTipWorld.z], parent: root });

  const hookBlockGeo = await roundedBoxGeo(0.65, 0.7, 0.5, 0.05);
  const hookY = boomTipWorld.y - cableLength - 0.35;
  createPart('HookBlock', hookBlockGeo, darkSteel, { position: [boomTipWorld.x, hookY, boomTipWorld.z], parent: root });
  createPart('HookBlockTop', cylinderYGeo(0.08, 0.08, 0.15, 8), steel, { position: [boomTipWorld.x, hookY + 0.42, boomTipWorld.z], parent: root });
  createPart('HookSheave', cylinderZGeo(0.18, 0.18, 0.55, 16), steel, { position: [boomTipWorld.x, hookY + 0.15, boomTipWorld.z], parent: root });
  createPart('HookCheek_L', boxGeo(0.55, 0.55, 0.04), yellow, { position: [boomTipWorld.x, hookY + 0.1, boomTipWorld.z - 0.27], parent: root });
  createPart('HookCheek_R', boxGeo(0.55, 0.55, 0.04), yellow, { position: [boomTipWorld.x, hookY + 0.1, boomTipWorld.z + 0.27], parent: root });
  createPart('HookShaft', cylinderZGeo(0.04, 0.04, 0.6, 8), steel, { position: [boomTipWorld.x, hookY + 0.1, boomTipWorld.z], parent: root });
  // Hook safety latch detail
  createPart('HookNeck', boxGeo(0.1, 0.4, 0.1), steel, { position: [boomTipWorld.x, hookY - 0.3, boomTipWorld.z], parent: root });
  createPart('HookCurve', torusGeo(0.13, 0.03, 8, 18), steel, { position: [boomTipWorld.x, hookY - 0.5, boomTipWorld.z], rotation: [0, 90, 0], parent: root });

  // ========== PENDANT LINES (boom support cables from A-frame to boom tip) ==========
  const aFrameTopWorld = { x: aFrameX, y: 1.13 + aFrameTipY + 0.05, z: 0 };

  for (const zs of [-0.4, 0.4]) {
    beamBetween('Pendant_' + (zs > 0 ? 'R' : 'L'),
      [boomTipWorld.x - 0.05, boomTipWorld.y + 0.05, zs],
      [aFrameTopWorld.x, aFrameTopWorld.y, 0],
      0.03, cable, { parent: root });
  }
  // Backstay (centered)
  beamBetween('Backstay',
    [boomTipWorld.x - 0.05, boomTipWorld.y + 0.05, 0],
    [aFrameTopWorld.x, aFrameTopWorld.y, 0],
    0.035, cable, { parent: root });

  return root;
}