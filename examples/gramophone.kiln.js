// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'Gramophone', category: 'prop' };

function build() {
  const root = createRoot('Gramophone');

  // ==========================================
  // MATERIALS
  // ==========================================
  const woodMahogany = gameMaterial(0x3e1f10, { roughness: 0.55, metalness: 0.05 });
  const woodPanel = gameMaterial(0x542b16, { roughness: 0.60, metalness: 0.05 });
  const brassPolished = gameMaterial(0xebb438, { roughness: 0.25, metalness: 0.90 });
  const darkBrass = gameMaterial(0x917122, { roughness: 0.40, metalness: 0.85 });
  const steelPolished = gameMaterial(0xd8d8d8, { roughness: 0.20, metalness: 0.95 });
  const feltGreen = gameMaterial(0x1a4522, { roughness: 0.95, metalness: 0.0 });
  const recordVinyl = gameMaterial(0x111111, { roughness: 0.30, metalness: 0.15 });
  const recordGroove = gameMaterial(0x1c1c1c, { roughness: 0.45, metalness: 0.10 });
  const recordLabel = gameMaterial(0x961515, { roughness: 0.65, metalness: 0.0 });
  const mica = gameMaterial(0xe8e4db, { roughness: 0.20, metalness: 0.10 });

  // ==========================================
  // 1. TURNED WOODEN PLINTH CABINET
  // ==========================================

  // 1A. Four Turned Classical Feet (touching Y = 0)
  // Turned profile: pad foot -> scotia -> torus -> collar
  const footProfile = [
    [0.000, 0.000],
    [0.024, 0.000],
    [0.025, 0.006],
    [0.021, 0.012],
    [0.024, 0.020],
    [0.022, 0.027],
    [0.015, 0.031],
    [0.018, 0.035],
    [0.000, 0.035]
  ];
  const footGeo = lathe(footProfile, 14);
  const footPositions = [
    [0.145, 0.000, 0.145],
    [-0.145, 0.000, 0.145],
    [0.145, 0.000, -0.145],
    [-0.145, 0.000, -0.145]
  ];
  footPositions.forEach(([fx, fy, fz], idx) => {
    createPart(`Foot_${idx}`, footGeo, woodMahogany, {
      position: [fx, fy, fz],
      parent: root
    });
  });

  // 1B. Stepped Plinth Base Mouldings (Y = 0.035 to 0.065)
  createPart('PlinthBaseTier1', boxGeo(0.36, 0.016, 0.36), woodMahogany, {
    position: [0, 0.043, 0],
    parent: root
  });
  createPart('PlinthBaseMoulding', boxGeo(0.34, 0.014, 0.34), woodMahogany, {
    position: [0, 0.058, 0],
    parent: root
  });

  // 1C. Cabinet Main Body (Y = 0.065 to 0.165)
  createPart('CabinetCore', boxGeo(0.32, 0.100, 0.32), woodMahogany, {
    position: [0, 0.115, 0],
    parent: root
  });

  // Four Turned Corner Columns
  const columnProfile = [
    [0.000, 0.000],
    [0.016, 0.000],
    [0.016, 0.008],
    [0.013, 0.014],
    [0.011, 0.022],
    [0.011, 0.078],
    [0.013, 0.086],
    [0.016, 0.092],
    [0.016, 0.100],
    [0.000, 0.100]
  ];
  const columnGeo = lathe(columnProfile, 14);
  footPositions.forEach(([cx, _, cz], idx) => {
    createPart(`Column_${idx}`, columnGeo, woodMahogany, {
      position: [cx, 0.065, cz],
      parent: root
    });
  });

  // Recessed Side Panels with Moulding Trim
  // Front (+X) panel
  createPart('Panel_Front_Backing', boxGeo(0.008, 0.072, 0.216), woodPanel, {
    position: [0.159, 0.115, 0],
    parent: root
  });
  createPart('Trim_Front_Top', boxGeo(0.006, 0.006, 0.22), woodMahogany, {
    position: [0.162, 0.150, 0],
    parent: root
  });
  createPart('Trim_Front_Bottom', boxGeo(0.006, 0.006, 0.22), woodMahogany, {
    position: [0.162, 0.080, 0],
    parent: root
  });
  createPart('Trim_Front_Left', boxGeo(0.006, 0.076, 0.006), woodMahogany, {
    position: [0.162, 0.115, -0.107],
    parent: root
  });
  createPart('Trim_Front_Right', boxGeo(0.006, 0.076, 0.006), woodMahogany, {
    position: [0.162, 0.115, 0.107],
    parent: root
  });

  // Maker's Brass Plaque on Front
  createPart('MakerPlaque', boxGeo(0.002, 0.028, 0.065), brassPolished, {
    position: [0.164, 0.115, 0],
    parent: root
  });
  createPart('PlaqueBorder', boxGeo(0.003, 0.030, 0.067), darkBrass, {
    position: [0.163, 0.115, 0],
    parent: root
  });
  // Plaque corner rivets
  const plaqueRivets = [
    [0.165, 0.125, -0.028],
    [0.165, 0.125, 0.028],
    [0.165, 0.105, -0.028],
    [0.165, 0.105, 0.028]
  ];
  plaqueRivets.forEach(([rx, ry, rz], idx) => {
    createPart(`PlaqueRivet_${idx}`, cylinderXGeo(0.001, 0.001, 0.003, 6), steelPolished, {
      position: [rx, ry, rz],
      parent: root
    });
  });

  // Back (-X) panel
  createPart('Panel_Back_Backing', boxGeo(0.008, 0.072, 0.216), woodPanel, {
    position: [-0.159, 0.115, 0],
    parent: root
  });
  createPart('Trim_Back_Top', boxGeo(0.006, 0.006, 0.22), woodMahogany, {
    position: [-0.162, 0.150, 0],
    parent: root
  });
  createPart('Trim_Back_Bottom', boxGeo(0.006, 0.006, 0.22), woodMahogany, {
    position: [-0.162, 0.080, 0],
    parent: root
  });

  // Left (-Z) panel
  createPart('Panel_Left_Backing', boxGeo(0.216, 0.072, 0.008), woodPanel, {
    position: [0, 0.115, -0.159],
    parent: root
  });
  createPart('Trim_Left_Top', boxGeo(0.22, 0.006, 0.006), woodMahogany, {
    position: [0, 0.150, -0.162],
    parent: root
  });
  createPart('Trim_Left_Bottom', boxGeo(0.22, 0.006, 0.006), woodMahogany, {
    position: [0, 0.080, -0.162],
    parent: root
  });

  // Right (+Z) panel (around crank)
  createPart('Panel_Right_Backing', boxGeo(0.216, 0.072, 0.008), woodPanel, {
    position: [0, 0.115, 0.159],
    parent: root
  });
  createPart('Trim_Right_Top', boxGeo(0.22, 0.006, 0.006), woodMahogany, {
    position: [0, 0.150, 0.162],
    parent: root
  });
  createPart('Trim_Right_Bottom', boxGeo(0.22, 0.006, 0.006), woodMahogany, {
    position: [0, 0.080, 0.162],
    parent: root
  });

  // 1D. Top Cornice Moulding & Deck (Y = 0.165 to 0.190)
  createPart('Cornice_Tier1', boxGeo(0.335, 0.012, 0.335), woodMahogany, {
    position: [0, 0.171, 0],
    parent: root
  });
  createPart('Cornice_Tier2', boxGeo(0.355, 0.013, 0.355), woodMahogany, {
    position: [0, 0.183, 0],
    parent: root
  });

  // ==========================================
  // 2. CRANK HANDLE ON +Z SIDE
  // ==========================================
  // Escutcheon plate
  createPart('CrankEscutcheon', cylinderZGeo(0.022, 0.022, 0.004, 14), brassPolished, {
    position: [0.01, 0.115, 0.164],
    parent: root
  });
  createPart('CrankEscutcheonCenter', cylinderZGeo(0.012, 0.012, 0.007, 10), darkBrass, {
    position: [0.01, 0.115, 0.1665],
    parent: root
  });

  // Escutcheon screws
  const screwOffsets = [
    [0.01, 0.129, 0.166],
    [-0.002, 0.108, 0.166],
    [0.022, 0.108, 0.166]
  ];
  screwOffsets.forEach(([sx, sy, sz], idx) => {
    createPart(`CrankScrew_${idx}`, cylinderZGeo(0.002, 0.002, 0.004, 6), steelPolished, {
      position: [sx, sy, sz],
      parent: root
    });
  });

  // Steel shaft extending from cabinet
  createPart('CrankShaft', cylinderZGeo(0.0055, 0.0055, 0.055, 8), steelPolished, {
    position: [0.01, 0.115, 0.194],
    parent: root
  });

  // Brass crank hub and arm
  createPart('CrankHub', cylinderZGeo(0.009, 0.009, 0.010, 10), brassPolished, {
    position: [0.01, 0.115, 0.222],
    parent: root
  });
  createPart('CrankArm', boxGeo(0.010, 0.065, 0.008), brassPolished, {
    position: [0.01, 0.082, 0.222],
    parent: root
  });
  createPart('CrankElbowPin', cylinderZGeo(0.0045, 0.0045, 0.055, 8), steelPolished, {
    position: [0.01, 0.052, 0.245],
    parent: root
  });

  // Turned wooden handle grip
  const gripProfile = [
    [0.000, 0.000],
    [0.008, 0.000],
    [0.012, 0.010],
    [0.014, 0.024],
    [0.011, 0.038],
    [0.007, 0.046],
    [0.009, 0.050],
    [0.000, 0.050]
  ];
  const gripGeo = lathe(gripProfile, 12);
  createPart('CrankHandleGrip', gripGeo, woodMahogany, {
    position: [0.01, 0.052, 0.226],
    rotation: [90, 0, 0],
    parent: root
  });
  createPart('CrankGripCap', cylinderZGeo(0.008, 0.008, 0.003, 8), brassPolished, {
    position: [0.01, 0.052, 0.276],
    parent: root
  });

  // ==========================================
  // 3. HINGED LID
  // ==========================================
  const lidHingePivot = createPivot('LidHinge', [-0.155, 0.190, 0], root);
  lidHingePivot.rotation.z = (112 * Math.PI) / 180;

  createPart('LidTopMoulding', boxGeo(0.355, 0.014, 0.355), woodMahogany, {
    position: [0.177, 0.015, 0],
    parent: lidHingePivot
  });
  createPart('LidBevelTier', boxGeo(0.335, 0.012, 0.335), woodMahogany, {
    position: [0.177, 0.028, 0],
    parent: lidHingePivot
  });
  createPart('LidBackPanel', boxGeo(0.28, 0.003, 0.28), woodPanel, {
    position: [0.177, 0.035, 0],
    parent: lidHingePivot
  });
  createPart('LidUnderPanel', boxGeo(0.28, 0.004, 0.28), woodPanel, {
    position: [0.177, 0.006, 0],
    parent: lidHingePivot
  });

  createPart('LidClasp', boxGeo(0.004, 0.014, 0.016), brassPolished, {
    position: [0.355, 0.015, 0],
    parent: lidHingePivot
  });

  [-0.09, 0.09].forEach((hz, idx) => {
    createPart(`HingeBarrel_${idx}`, cylinderZGeo(0.004, 0.004, 0.024, 10), brassPolished, {
      position: [-0.155, 0.190, hz],
      parent: root
    });
    createPart(`HingeCabinetLeaf_${idx}`, boxGeo(0.016, 0.002, 0.020), brassPolished, {
      position: [-0.147, 0.190, hz],
      parent: root
    });
  });

  // Slotted Brass Quadrant Stay Arm on left side (-Z)
  const stayBottom = [-0.13, 0.192, -0.15];
  const stayTop = [-0.215, 0.338, -0.15];
  beamBetween('LidStayArm', stayBottom, stayTop, 0.0035, brassPolished, { parent: root });
  createPart('LidStayKnob', cylinderZGeo(0.006, 0.006, 0.008, 10), darkBrass, {
    position: [-0.172, 0.265, -0.15],
    parent: root
  });
  createPart('LidStayFoot', boxGeo(0.014, 0.004, 0.012), brassPolished, {
    position: [-0.13, 0.192, -0.15],
    parent: root
  });
  createPart('LidStayLidBracket', boxGeo(0.012, 0.008, 0.012), brassPolished, {
    position: [-0.215, 0.338, -0.15],
    parent: root
  });

  // ==========================================
  // 4. TURNTABLE & RECORD
  // ==========================================
  const ttPos = [0.01, 0.190, -0.04];

  // Platter Body (Brass with bevelled edge)
  createPart('PlatterRim', cylinderGeo(0.125, 0.125, 0.012, 28), brassPolished, {
    position: [ttPos[0], ttPos[1] + 0.006, ttPos[2]],
    parent: root
  });
  createPart('PlatterCollar', cylinderGeo(0.122, 0.125, 0.004, 28), darkBrass, {
    position: [ttPos[0], ttPos[1] + 0.014, ttPos[2]],
    parent: root
  });

  // Velvet Felt Mat (Rich Emerald Green)
  createPart('TurntableFelt', cylinderGeo(0.122, 0.122, 0.003, 28), feltGreen, {
    position: [ttPos[0], ttPos[1] + 0.017, ttPos[2]],
    parent: root
  });

  // 78 RPM Shellac Record
  createPart('RecordBody', cylinderGeo(0.116, 0.116, 0.0025, 28), recordVinyl, {
    position: [ttPos[0], ttPos[1] + 0.0195, ttPos[2]],
    parent: root
  });

  // Concentric Grooves (Specular ring highlights)
  const grooveRadii = [0.070, 0.096];
  grooveRadii.forEach((gr, idx) => {
    createPart(`RecordGroove_${idx}`, torusGeo(gr, 0.001, 6, 24), recordGroove, {
      position: [ttPos[0], ttPos[1] + 0.021, ttPos[2]],
      rotation: [90, 0, 0],
      parent: root
    });
  });

  // Center Record Label (Crimson & Gold border)
  createPart('RecordLabel', cylinderGeo(0.040, 0.040, 0.003, 24), recordLabel, {
    position: [ttPos[0], ttPos[1] + 0.0205, ttPos[2]],
    parent: root
  });
  createPart('RecordLabelRing', torusGeo(0.036, 0.0008, 6, 24), brassPolished, {
    position: [ttPos[0], ttPos[1] + 0.0225, ttPos[2]],
    rotation: [90, 0, 0],
    parent: root
  });

  // Polished Steel Center Spindle Pin
  createPart('Spindle', cylinderGeo(0.0036, 0.0036, 0.022, 12), steelPolished, {
    position: [ttPos[0], ttPos[1] + 0.028, ttPos[2]],
    parent: root
  });

  // Deck Controls
  // Speed regulator plate & lever
  createPart('SpeedPlate', boxGeo(0.036, 0.002, 0.026), brassPolished, {
    position: [0.11, 0.191, -0.12],
    parent: root
  });
  beamBetween('SpeedLever', [0.11, 0.192, -0.12], [0.12, 0.205, -0.12], 0.002, steelPolished, { parent: root });
  createPart('SpeedKnob', sphereGeo(0.004, 8, 6), darkBrass, {
    position: [0.12, 0.206, -0.12],
    parent: root
  });

  // Platter Brake switch
  createPart('BrakeHousing', boxGeo(0.016, 0.008, 0.012), brassPolished, {
    position: [0.08, 0.194, 0.06],
    parent: root
  });
  beamBetween('BrakeLever', [0.08, 0.198, 0.06], [0.06, 0.208, 0.06], 0.002, steelPolished, { parent: root });
  createPart('BrakePad', boxGeo(0.006, 0.008, 0.008), feltGreen, {
    position: [0.07, 0.198, 0.05],
    parent: root
  });

  // Needle Cup on deck with spare needles
  createPart('NeedleCupRim', torusGeo(0.016, 0.003, 8, 16), brassPolished, {
    position: [0.12, 0.193, -0.03],
    rotation: [90, 0, 0],
    parent: root
  });
  createPart('NeedleCupWell', cylinderGeo(0.016, 0.016, 0.004, 16), darkBrass, {
    position: [0.12, 0.191, -0.03],
    parent: root
  });
  beamBetween('SpareNeedle1', [0.115, 0.193, -0.035], [0.125, 0.194, -0.025], 0.0008, steelPolished, { parent: root });
  beamBetween('SpareNeedle2', [0.125, 0.193, -0.035], [0.115, 0.194, -0.025], 0.0008, steelPolished, { parent: root });

  // ==========================================
  // 5. BACK BRACKET & SUPPORT
  // ==========================================
  const bracketPos = [-0.13, 0.190, 0.05];

  createPart('BracketBasePlate', boxGeo(0.055, 0.006, 0.065), darkBrass, {
    position: [bracketPos[0], bracketPos[1] + 0.003, bracketPos[2]],
    parent: root
  });
  const boltDeltas = [
    [0.02, 0.022],
    [-0.02, 0.022],
    [0.02, -0.022],
    [-0.02, -0.022]
  ];
  boltDeltas.forEach(([bx, bz], idx) => {
    createPart(`BracketBolt_${idx}`, cylinderYGeo(0.0025, 0.0025, 0.005, 6), steelPolished, {
      position: [bracketPos[0] + bx, bracketPos[1] + 0.008, bracketPos[2] + bz],
      parent: root
    });
  });

  const pillarProfile = [
    [0.000, 0.000],
    [0.022, 0.000],
    [0.022, 0.008],
    [0.015, 0.016],
    [0.013, 0.065],
    [0.017, 0.075],
    [0.020, 0.085],
    [0.000, 0.085]
  ];
  const pillarGeo = lathe(pillarProfile, 14);
  createPart('BracketPillar', pillarGeo, brassPolished, {
    position: [bracketPos[0], bracketPos[1] + 0.006, bracketPos[2]],
    parent: root
  });

  createPart('BracketArmBody', boxGeo(0.045, 0.022, 0.035), darkBrass, {
    position: [bracketPos[0] + 0.015, bracketPos[1] + 0.090, bracketPos[2]],
    parent: root
  });
  createPart('BracketSocketRing', torusGeo(0.019, 0.003, 8, 16), brassPolished, {
    position: [bracketPos[0], bracketPos[1] + 0.095, bracketPos[2]],
    rotation: [90, 0, 0],
    parent: root
  });

  // ==========================================
  // 6. PIVOTING TONE ARM & SOUND BOX
  // ==========================================
  const armPivotPos = [bracketPos[0] + 0.035, bracketPos[1] + 0.085, bracketPos[2] - 0.025];

  createPart('ToneArmSwivelBase', cylinderGeo(0.014, 0.014, 0.020, 14), brassPolished, {
    position: armPivotPos,
    parent: root
  });
  createPart('ToneArmGimbalRing', torusGeo(0.015, 0.003, 8, 16), darkBrass, {
    position: [armPivotPos[0], armPivotPos[1] + 0.012, armPivotPos[2]],
    parent: root
  });

  createPart('ToneArmCounterweight', cylinderXGeo(0.012, 0.012, 0.025, 12), brassPolished, {
    position: [armPivotPos[0] - 0.025, armPivotPos[1] + 0.012, armPivotPos[2]],
    parent: root
  });

  // Tone Arm curved tube reaching over to record
  const soundBoxPos = [armPivotPos[0] + 0.205, 0.236, armPivotPos[2] - 0.015];
  const toneArmPoints = [
    [armPivotPos[0], armPivotPos[1] + 0.012, armPivotPos[2]],
    [armPivotPos[0] + 0.045, armPivotPos[1] + 0.008, armPivotPos[2] - 0.018],
    [armPivotPos[0] + 0.110, armPivotPos[1] - 0.005, armPivotPos[2] - 0.025],
    [armPivotPos[0] + 0.165, armPivotPos[1] - 0.018, armPivotPos[2] - 0.025],
    [soundBoxPos[0] - 0.012, soundBoxPos[1] + 0.005, soundBoxPos[2] - 0.006]
  ];
  const toneArmGeo = pipeAlongPath(toneArmPoints, 0.0065, {
    bendRadius: 0.025,
    tubularSegments: 16,
    radialSegments: 10
  });
  createPart('ToneArmTube', toneArmGeo, brassPolished, { parent: root });

  // Tone arm elbow connecting into back of sound box
  createPart('ToneArmSoundBoxFerrule', cylinderGeo(0.009, 0.009, 0.012, 12), darkBrass, {
    position: [soundBoxPos[0] - 0.008, soundBoxPos[1] + 0.003, soundBoxPos[2] - 0.004],
    parent: root
  });

  // Sound Box (Reproducer / Exhibition soundbox)
  // Rotated so mica diaphragm faces forward-right (+X, +Z) and stylus chuck points DOWN (-Y)
  const soundBoxPivot = createPivot('SoundBoxPivot', soundBoxPos, root);
  soundBoxPivot.rotation.x = (20 * Math.PI) / 180;
  soundBoxPivot.rotation.y = (25 * Math.PI) / 180;
  soundBoxPivot.rotation.z = (-75 * Math.PI) / 180;

  // Sound box casing
  createPart('SoundBoxCase', cylinderGeo(0.025, 0.025, 0.010, 20), brassPolished, {
    position: [0, 0, 0],
    parent: soundBoxPivot
  });
  createPart('SoundBoxBackCap', cylinderGeo(0.021, 0.023, 0.004, 20), darkBrass, {
    position: [0, -0.006, 0],
    parent: soundBoxPivot
  });
  // Front bezel retaining ring
  createPart('SoundBoxBezel', torusGeo(0.024, 0.0025, 8, 20), brassPolished, {
    position: [0, 0.005, 0],
    rotation: [90, 0, 0],
    parent: soundBoxPivot
  });

  // 6 Perimeter bezel screws
  for (let si = 0; si < 6; si++) {
    const sAng = (si * Math.PI * 2) / 6;
    const sx = Math.cos(sAng) * 0.023;
    const sz = Math.sin(sAng) * 0.023;
    createPart(`BezelScrew_${si}`, cylinderYGeo(0.0012, 0.0012, 0.003, 6), steelPolished, {
      position: [sx, 0.007, sz],
      parent: soundBoxPivot
    });
  }

  // Mica Diaphragm (translucent / pearlescent disc)
  createPart('MicaDiaphragm', cylinderGeo(0.021, 0.021, 0.001, 20), mica, {
    position: [0, 0.0025, 0],
    parent: soundBoxPivot
  });

  // Center spider / needle bar mounting dot
  createPart('DiaphragmSpider', sphereGeo(0.0025, 6, 6), darkBrass, {
    position: [0, 0.0055, 0],
    parent: soundBoxPivot
  });

  // Needle bar extending from lower trunnions to center
  beamBetween('NeedleBar', [0, 0.0055, 0], [0.022, 0.004, 0], 0.0012, steelPolished, {
    parent: soundBoxPivot
  });

  // Stylus chuck boss at bottom (local +X)
  createPart('StylusChuck', boxGeo(0.007, 0.008, 0.006), darkBrass, {
    position: [0.024, 0.002, 0],
    parent: soundBoxPivot
  });
  // Knurled thumbscrew on stylus chuck
  createPart('StylusThumbScrew', cylinderGeo(0.0025, 0.0025, 0.008, 8), brassPolished, {
    position: [0.024, 0.002, 0.006],
    rotation: [90, 0, 0],
    parent: soundBoxPivot
  });

  // Steel Needle pointing down to rest on the record groove
  beamBetween('StylusNeedle', [0.024, 0.002, 0], [0.033, 0.002, 0], 0.0012, steelPolished, {
    parent: soundBoxPivot
  });

  // ==========================================
  // 7. CURVED ELBOW & MORNING-GLORY HORN
  // ==========================================

  // 7A. Smooth Curved Brass Elbow
  const elbowPath = [
    [bracketPos[0], bracketPos[1] + 0.085, bracketPos[2]],
    [bracketPos[0], bracketPos[1] + 0.155, bracketPos[2]],
    [bracketPos[0] + 0.025, bracketPos[1] + 0.205, bracketPos[2]],
    [bracketPos[0] + 0.065, bracketPos[1] + 0.230, bracketPos[2]],
    [bracketPos[0] + 0.110, bracketPos[1] + 0.243, bracketPos[2]]
  ];
  const elbowGeo = pipeAlongPath(elbowPath, 0.016, {
    bendRadius: 0.035,
    tubularSegments: 20,
    radialSegments: 12
  });
  createPart('ElbowPipe', elbowGeo, brassPolished, { parent: root });

  // Elbow collar at base
  createPart('ElbowBaseCollar', cylinderGeo(0.021, 0.021, 0.014, 14), darkBrass, {
    position: [bracketPos[0], bracketPos[1] + 0.095, bracketPos[2]],
    parent: root
  });

  // Elbow connection ferrule at horn mouth
  const hornThroatPos = [bracketPos[0] + 0.110, bracketPos[1] + 0.243, bracketPos[2]];
  createPart('HornCouplingFerrule', cylinderGeo(0.022, 0.022, 0.016, 14), darkBrass, {
    position: hornThroatPos,
    rotation: [0, 0, -74],
    parent: root
  });

  // 7B. Large Brass Morning-Glory Horn (12 Fluted Tapering Petals)
  const hornLength = 0.40;
  const rThroat = 0.018;
  const rBell = 0.215;
  const wall = 0.0022;

  const hornSteps = 16;
  const outerCurve = [];
  const innerCurve = [];

  for (let i = 0; i <= hornSteps; i++) {
    const u = i / hornSteps;
    const y = u * hornLength;
    const r = rThroat + 0.014 * u + (rBell - rThroat - 0.014) * Math.pow(u, 3.4);
    outerCurve.push([r + wall * 0.5, y]);
    innerCurve.push([Math.max(0.003, r - wall * 0.5), y]);
  }

  const rOuterRim = outerCurve[outerCurve.length - 1][0];
  const rInnerRim = innerCurve[innerCurve.length - 1][0];
  const rMidRim = (rOuterRim + rInnerRim) * 0.5;
  const rimProfile = [
    [rOuterRim, hornLength],
    [rMidRim + 0.003, hornLength + 0.004],
    [rInnerRim, hornLength]
  ];

  const hornProfile = [
    ...outerCurve,
    ...rimProfile,
    ...innerCurve.slice().reverse(),
    outerCurve[0]
  ];

  const hornGeo = lathe(hornProfile, 12);

  const hornPivot = createPivot('HornPivot', hornThroatPos, root);
  hornPivot.rotation.z = (-74 * Math.PI) / 180;

  createPart('HornBellBody', hornGeo, brassPolished, {
    position: [0, 0, 0],
    parent: hornPivot
  });

  // 12 Seam Ribs running along the 12 petal folds
  for (let pi = 0; pi < 12; pi++) {
    const angle = (pi * Math.PI * 2) / 12;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const ribPoints = [];
    const ribSteps = 8;
    for (let ri = 1; ri <= ribSteps; ri++) {
      const u = ri / ribSteps;
      const y = u * hornLength;
      const r = rThroat + 0.014 * u + (rBell - rThroat - 0.014) * Math.pow(u, 3.4) + wall * 0.6;
      ribPoints.push([r * cosA, y, r * sinA]);
    }

    const ribGeo = pipeAlongPath(ribPoints, 0.0016, {
      bendRadius: 0.02,
      tubularSegments: 8,
      radialSegments: 5
    });
    createPart(`HornPetalRib_${pi}`, ribGeo, darkBrass, {
      parent: hornPivot
    });

    const nextAngle = ((pi + 1) * Math.PI * 2) / 12;
    const midAngle = (angle + nextAngle) * 0.5;
    const rimR = rBell + 0.003;
    createPart(`PetalCrest_${pi}`, sphereGeo(0.004, 6, 6), brassPolished, {
      position: [rimR * Math.cos(midAngle), hornLength + 0.003, rimR * Math.sin(midAngle)],
      parent: hornPivot
    });
  }

  // 7C. Slender Support Brace for the Heavy Horn
  const braceCollarU = 0.35;
  const braceCollarY = braceCollarU * hornLength;
  const braceCollarR = rThroat + 0.014 * braceCollarU + (rBell - rThroat - 0.014) * Math.pow(braceCollarU, 3.4);

  createPart('HornSupportCollar', torusGeo(braceCollarR + 0.002, 0.0025, 8, 18), darkBrass, {
    position: [0, braceCollarY, 0],
    rotation: [90, 0, 0],
    parent: hornPivot
  });
  createPart('CollarLug', boxGeo(0.008, 0.010, 0.010), darkBrass, {
    position: [0, braceCollarY, -(braceCollarR + 0.003)],
    parent: hornPivot
  });

  const collarWorldPos = [
    hornThroatPos[0] + braceCollarY * Math.sin((74 * Math.PI) / 180),
    hornThroatPos[1] + braceCollarY * Math.cos((74 * Math.PI) / 180),
    hornThroatPos[2] - (braceCollarR + 0.003)
  ];

  // Slender Brace Rod from the back bracket post up to the horn collar
  const braceBasePos = [bracketPos[0] + 0.01, bracketPos[1] + 0.080, bracketPos[2] - 0.015];
  beamBetween('HornSupportBrace', braceBasePos, collarWorldPos, 0.0035, brassPolished, {
    parent: root
  });
  createPart('BraceTurnbuckle', cylinderGeo(0.005, 0.005, 0.022, 8), darkBrass, {
    position: [
      (braceBasePos[0] + collarWorldPos[0]) * 0.5,
      (braceBasePos[1] + collarWorldPos[1]) * 0.5,
      (braceBasePos[2] + collarWorldPos[2]) * 0.5
    ],
    parent: root
  });
  createPart('BraceAnchorFoot', boxGeo(0.012, 0.016, 0.014), darkBrass, {
    position: braceBasePos,
    parent: root
  });

  return root;
}
