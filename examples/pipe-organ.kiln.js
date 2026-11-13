// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 5 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'PipeOrgan', category: 'prop' };

function build() {
  const root = createRoot('PipeOrgan');

  // =========================================================================
  // MATERIALS
  // =========================================================================
  const woodDark = gameMaterial(0x381f10, { roughness: 0.68, metalness: 0.05 });
  const woodMedium = gameMaterial(0x543118, { roughness: 0.62, metalness: 0.05 });
  const woodLight = gameMaterial(0x754724, { roughness: 0.58, metalness: 0.05 });
  const pipeTin = gameMaterial(0xd8dce4, { roughness: 0.18, metalness: 0.92 });
  const pipeMouth = gameMaterial(0x18181c, { roughness: 0.7, metalness: 0.3 });
  const goldLeaf = gameMaterial(0xcaa034, { roughness: 0.32, metalness: 0.78 });
  const keyWhite = gameMaterial(0xf5f1e8, { roughness: 0.28, metalness: 0.05 });
  const keyBlack = gameMaterial(0x1a1a1c, { roughness: 0.38, metalness: 0.1 });
  const stopKnobWhite = gameMaterial(0xede7db, { roughness: 0.32, metalness: 0.05 });
  const feltRed = gameMaterial(0x82151b, { roughness: 0.9, metalness: 0.0 });
  const brassMat = gameMaterial(0xd4af37, { roughness: 0.25, metalness: 0.85 });
  const scorePaper = gameMaterial(0xfaf6ed, { roughness: 0.85, metalness: 0.0 });

  // =========================================================================
  // 0. GALLERY / DAIS PLATFORM
  // Connects the case, console, and bench into one grounded church organ loft.
  // Sits strictly on Y = 0.
  // =========================================================================
  const platform = createPivot('GalleryPlatform', [0, 0, 0], root);

  // Main case platform base
  createPart('PlatformPlinth', boxGeo(1.4, 0.05, 4.4), woodDark, {
    position: [-0.15, 0.025, 0],
    parent: platform
  });
  // Console dais running forward to carry console and bench
  createPart('ConsoleDais', boxGeo(2.1, 0.04, 2.1), woodMedium, {
    position: [1.6, 0.02, 0],
    parent: platform
  });
  // Stepped bevel trim along dais edges
  createPart('DaisTrimFront', boxGeo(0.06, 0.048, 2.14), woodDark, {
    position: [2.65, 0.02, 0],
    parent: platform
  });
  createPart('DaisTrimLeft', boxGeo(2.1, 0.048, 0.06), woodDark, {
    position: [1.6, 0.02, -1.07],
    parent: platform
  });
  createPart('DaisTrimRight', boxGeo(2.1, 0.048, 0.06), woodDark, {
    position: [1.6, 0.02, 1.07],
    parent: platform
  });

  // =========================================================================
  // 1. ORGAN CASE FAÇADE (Centred at X = 0, spanning Z = -2.1m to +2.1m)
  // Deep architectural case: back at X = -0.58m, front up to X = +0.40m
  // =========================================================================
  const caseGroup = createPivot('OrganCase', [0, 0, 0], root);

  // --- LOWER CASE (Dado / Pedestal) ---
  // Sub-base plinth
  createPart('CaseBasePlinth', boxGeo(0.95, 0.12, 4.14), woodDark, {
    position: [-0.11, 0.11, 0],
    parent: caseGroup
  });
  // Lower cabinet body
  createPart('CaseDadoBody', boxGeo(0.88, 1.38, 4.0), woodMedium, {
    position: [-0.11, 0.86, 0],
    parent: caseGroup
  });

  // Fielded panels across the lower case (7 panels with raised bolection moulding)
  const panelZs = [-1.65, -1.1, -0.55, 0, 0.55, 1.1, 1.65];
  panelZs.forEach((pz, idx) => {
    // Outer panel frame
    createPart(`DadoPanelFrame_${idx}`, boxGeo(0.03, 1.05, 0.46), woodDark, {
      position: [0.34, 0.88, pz],
      parent: caseGroup
    });
    // Raised inner field
    createPart(`DadoPanelField_${idx}`, boxGeo(0.04, 0.95, 0.38), woodLight, {
      position: [0.35, 0.88, pz],
      parent: caseGroup
    });
  });

  // Dado base rail and mid rail
  createPart('DadoBaseRail', boxGeo(0.924, 0.084, 4.06), woodDark, {
    position: [-0.092, 0.208, 0],
    parent: caseGroup
  });
  createPart('DadoMidRail', boxGeo(0.924, 0.06, 4.06), woodDark, {
    position: [-0.092, 1.44, 0],
    parent: caseGroup
  });

  // --- IMPOST (Classical shelf carrying the pipe flats) ---
  createPart('ImpostArchitrave', boxGeo(0.96, 0.1, 4.2), woodDark, {
    position: [-0.07, 1.6, 0],
    parent: caseGroup
  });
  createPart('ImpostFrieze', boxGeo(0.98, 0.08, 4.24), woodLight, {
    position: [-0.06, 1.69, 0],
    parent: caseGroup
  });
  createPart('ImpostCornice', boxGeo(1.02, 0.12, 4.3), woodDark, {
    position: [-0.04, 1.79, 0],
    parent: caseGroup
  });

  // Dentils along the Impost
  const dentilProto = createPart('ImpostDentil_0', boxGeo(0.04, 0.05, 0.04), woodLight, {
    position: [0.48, 1.76, -2.05],
    parent: caseGroup
  });
  for (let i = 1; i <= 24; i++) {
    const dZ = -2.05 + (i / 24) * 4.1;
    createInstance(`ImpostDentil_${i}`, dentilProto, {
      position: [0.48, 1.76, dZ],
      parent: caseGroup
    });
  }

  // --- CARVED SUPPORT CORBELS UNDER PIPE TOWERS ---
  // Large acanthus corbels supporting the projecting towers
  [-1.6, 0, 1.6].forEach((corbelZ, cIdx) => {
    const name = `TowerCorbel_${cIdx}`;
    // Upper scroll bracket
    createPart(`${name}_Upper`, boxGeo(0.18, 0.24, 0.16), woodDark, {
      position: [0.38, 1.56, corbelZ],
      parent: caseGroup
    });
    // Gilt acanthus carving
    createPart(`${name}_Acanthus`, coneGeo(0.08, 0.22, 6), goldLeaf, {
      position: [0.42, 1.54, corbelZ],
      rotation: [180, 0, 0],
      parent: caseGroup
    });
  });

  // --- FAÇADE PILASTERS (Dividing towers and flats) ---
  const pilasterZs = [-1.94, -1.28, -0.54, 0.54, 1.28, 1.94];
  let capitalProto = null;
  pilasterZs.forEach((pz, idx) => {
    // Pilaster shaft
    createPart(`PilasterShaft_${idx}`, boxGeo(0.1, 3.2, 0.1), woodMedium, {
      position: [0.08, 3.45, pz],
      parent: caseGroup
    });
    // Fluting detail (recessed stripe)
    createPart(`PilasterFlute_${idx}`, boxGeo(0.02, 3.0, 0.04), woodDark, {
      position: [0.135, 3.45, pz],
      parent: caseGroup
    });
    // Base plinth
    createPart(`PilasterBase_${idx}`, boxGeo(0.14, 0.14, 0.14), woodDark, {
      position: [0.09, 1.92, pz],
      parent: caseGroup
    });
    // Corinthian / Composite gilded capital
    if (!capitalProto) {
      capitalProto = createPart('CapitalProto', boxGeo(0.16, 0.14, 0.16), goldLeaf, {
        position: [0.09, 5.08, pz],
        parent: caseGroup
      });
      createPart('CapitalVolute', cylinderZGeo(0.035, 0.035, 0.18, 8), goldLeaf, {
        position: [0.12, 5.12, pz],
        parent: caseGroup
      });
    } else {
      createInstance(`Capital_${idx}`, capitalProto, {
        position: [0.09, 5.08, pz],
        parent: caseGroup
      });
    }
  });

  // --- REAR ENCLOSURE & SIDES (Deep enough to fully enclose all tower domes) ---
  // Back wall sits cleanly at X = -0.58m
  createPart('CaseBackWall', boxGeo(0.08, 5.2, 4.08), woodDark, {
    position: [-0.58, 2.7, 0],
    parent: caseGroup
  });
  createPart('CaseSideWallL', boxGeo(0.96, 5.2, 0.08), woodDark, {
    position: [-0.1, 2.7, -2.02],
    parent: caseGroup
  });
  createPart('CaseSideWallR', boxGeo(0.96, 5.2, 0.08), woodDark, {
    position: [-0.1, 2.7, 2.02],
    parent: caseGroup
  });

  // =========================================================================
  // DISPLAY PIPES WITH MITRED MOUTHS
  // =========================================================================
  function addDisplayPipe(name, posX, baseY, posZ, radius, totalHeight, parent) {
    const footLen = Math.min(0.72, totalHeight * 0.26);
    const bodyLen = totalHeight - footLen;
    const mouthY = baseY + footLen;

    // Conical Foot: tapers from toe at rackboard to mouth
    createPart(`${name}_Foot`, taperConeGeo(radius * 0.2, radius, footLen, 'y', 12), pipeTin, {
      position: [posX, baseY + footLen * 0.5, posZ],
      parent
    });

    // Resonator Body: polished tin cylinder
    createPart(`${name}_Body`, cylinderGeo(radius, radius, bodyLen, 12), pipeTin, {
      position: [posX, mouthY + bodyLen * 0.5, posZ],
      parent
    });

    // Dark Voice Slot (Languid flue opening)
    createPart(`${name}_VoiceSlot`, boxGeo(radius * 0.35, radius * 0.28, radius * 1.5), pipeMouth, {
      position: [posX + radius * 0.5, mouthY, posZ],
      parent
    });

    // Upper Mitred Lip: pointed French / bayleaf triangular leaf pointing up
    createPart(`${name}_UpperLip`, coneGeo(radius * 0.55, radius * 0.75, 4), goldLeaf, {
      position: [posX + radius * 0.62, mouthY + radius * 0.48, posZ],
      rotation: [0, 45, 0],
      parent
    });

    // Lower Mitred Lip: inverted triangular leaf pointing down into foot
    createPart(`${name}_LowerLip`, coneGeo(radius * 0.45, radius * 0.58, 4), goldLeaf, {
      position: [posX + radius * 0.58, mouthY - radius * 0.38, posZ],
      rotation: [180, 45, 0],
      parent
    });
  }

  // --- CENTRAL TOWER (Semi-circular forward bay at Z = 0) ---
  createPart('CenterTowerShelf', cylinderGeo(0.58, 0.58, 0.12, 16), woodDark, {
    position: [0.08, 1.86, 0],
    parent: caseGroup
  });
  createPart('CenterTowerShelfTrim', cylinderGeo(0.62, 0.58, 0.08, 16), woodLight, {
    position: [0.08, 1.80, 0],
    parent: caseGroup
  });

  // Central Tower: 7 graduated pipes forming a semi-circular arc
  const centerPipes = [
    { z: -0.42, x: 0.14, r: 0.075, h: 2.7 },
    { z: -0.30, x: 0.25, r: 0.088, h: 3.0 },
    { z: -0.16, x: 0.33, r: 0.098, h: 3.3 },
    { z: 0.0,   x: 0.36, r: 0.108, h: 3.65 }, // King pipe (tallest)
    { z: 0.16,  x: 0.33, r: 0.098, h: 3.3 },
    { z: 0.30,  x: 0.25, r: 0.088, h: 3.0 },
    { z: 0.42,  x: 0.14, r: 0.075, h: 2.7 },
  ];
  centerPipes.forEach((p, idx) => {
    addDisplayPipe(`CenterPipe_${idx}`, p.x, 1.92, p.z, p.r, p.h, caseGroup);
  });

  // Central Tower Entablature & Cornice (centered at X = 0.06, radius 0.62; rear is at 0.06 - 0.62 = -0.56, safely in front of back wall -0.58)
  createPart('CenterTowerFrieze', cylinderGeo(0.58, 0.58, 0.24, 16), woodDark, {
    position: [0.06, 5.58, 0],
    parent: caseGroup
  });
  createPart('CenterTowerCorniceLower', cylinderGeo(0.62, 0.58, 0.1, 16), woodLight, {
    position: [0.06, 5.72, 0],
    parent: caseGroup
  });
  createPart('CenterTowerCorniceUpper', cylinderGeo(0.66, 0.62, 0.12, 16), woodDark, {
    position: [0.06, 5.82, 0],
    parent: caseGroup
  });
  // Central Tower Pediment Dome & Golden Finial
  createPart('CenterTowerDome', coneGeo(0.64, 0.36, 16), woodDark, {
    position: [0.06, 6.02, 0],
    parent: caseGroup
  });
  createPart('CenterTowerFinialBall', sphereGeo(0.12, 10, 8), goldLeaf, {
    position: [0.06, 6.28, 0],
    parent: caseGroup
  });
  createPart('CenterTowerFinialSpire', coneGeo(0.09, 0.4, 10), goldLeaf, {
    position: [0.06, 6.52, 0],
    parent: caseGroup
  });

  // --- CARVED PIPE SHADES (Center Tower) ---
  // Arched valence drape in gold leaf
  createPart('CenterPipeShadeArch', cylinderGeo(0.54, 0.54, 0.32, 16), goldLeaf, {
    position: [0.08, 5.34, 0],
    parent: caseGroup
  });
  // Carved drop-pendants hanging between pipes
  const shadePendantProto = createPart('ShadePendantProto', coneGeo(0.035, 0.22, 6), goldLeaf, {
    position: [0.35, 5.15, -0.36],
    rotation: [180, 0, 0],
    parent: caseGroup
  });
  const pendantZs = [-0.23, -0.08, 0.08, 0.23, 0.36];
  pendantZs.forEach((pz, idx) => {
    const px = Math.sqrt(Math.max(0, 0.35 * 0.35 - pz * pz * 0.6)) + 0.06;
    createInstance(`CenterPendant_${idx}`, shadePendantProto, {
      position: [px, 5.15, pz],
      rotation: [180, 0, 0],
      parent: caseGroup
    });
  });

  // Lower Toe Shades (carved scrollwork along the rackboard)
  createPart('CenterToeShade', boxGeo(0.1, 0.16, 0.86), goldLeaf, {
    position: [0.24, 2.02, 0],
    parent: caseGroup
  });

  // --- SIDE TOWERS (Pointed V-towers at Z = -1.6m and Z = +1.6m) ---
  const sideTowerConfigs = [
    { name: 'Left', zCenter: -1.6 },
    { name: 'Right', zCenter: 1.6 },
  ];

  sideTowerConfigs.forEach((st) => {
    const side = st.name;
    const tz = st.zCenter;

    // V-shaped base pedestal bracket
    createPart(`${side}TowerShelf`, boxGeo(0.56, 0.12, 0.72), woodDark, {
      position: [0.12, 1.86, tz],
      parent: caseGroup
    });
    createPart(`${side}TowerShelfBevel`, boxGeo(0.6, 0.08, 0.76), woodLight, {
      position: [0.12, 1.80, tz],
      parent: caseGroup
    });

    // 7 pipes in pointed V-profile
    const sidePipes = [
      { zOff: -0.30, x: 0.12, r: 0.07, h: 2.4 },
      { zOff: -0.20, x: 0.22, r: 0.08, h: 2.75 },
      { zOff: -0.10, x: 0.31, r: 0.09, h: 3.1 },
      { zOff: 0.0,   x: 0.36, r: 0.10, h: 3.4 }, // Side tower king pipe
      { zOff: 0.10,  x: 0.31, r: 0.09, h: 3.1 },
      { zOff: 0.20,  x: 0.22, r: 0.08, h: 2.75 },
      { zOff: 0.30,  x: 0.12, r: 0.07, h: 2.4 },
    ];
    sidePipes.forEach((sp, idx) => {
      addDisplayPipe(`${side}Pipe_${idx}`, sp.x, 1.92, tz + sp.zOff, sp.r, sp.h, caseGroup);
    });

    // Tower Entablature & Cornice
    createPart(`${side}TowerEntablature`, boxGeo(0.58, 0.22, 0.76), woodDark, {
      position: [0.12, 5.3, tz],
      parent: caseGroup
    });
    createPart(`${side}TowerCornice`, boxGeo(0.66, 0.14, 0.84), woodLight, {
      position: [0.14, 5.46, tz],
      parent: caseGroup
    });
    // Pointed pediment / cap & finial urn
    createPart(`${side}TowerPediment`, coneGeo(0.42, 0.44, 4), woodDark, {
      position: [0.14, 5.72, tz],
      rotation: [0, 45, 0],
      parent: caseGroup
    });
    createPart(`${side}TowerFinialUrn`, cylinderGeo(0.08, 0.05, 0.26, 10), goldLeaf, {
      position: [0.14, 6.04, tz],
      parent: caseGroup
    });
    createPart(`${side}TowerFinialFlame`, coneGeo(0.09, 0.28, 10), goldLeaf, {
      position: [0.14, 6.26, tz],
      parent: caseGroup
    });

    // Pipe shades (upper tracery & pendants)
    createPart(`${side}PipeShadeValence`, boxGeo(0.16, 0.28, 0.7), goldLeaf, {
      position: [0.22, 5.08, tz],
      parent: caseGroup
    });
    [-0.22, -0.07, 0.07, 0.22].forEach((pz, pIdx) => {
      createInstance(`${side}Pendant_${pIdx}`, shadePendantProto, {
        position: [0.28, 4.9, tz + pz],
        rotation: [180, 0, 0],
        parent: caseGroup
      });
    });
    // Lower toe shade
    createPart(`${side}ToeShade`, boxGeo(0.08, 0.15, 0.68), goldLeaf, {
      position: [0.22, 2.02, tz],
      parent: caseGroup
    });
  });

  // --- INTERMEDIATE FLATS (Between center tower and side towers) ---
  const flatConfigs = [
    { name: 'LeftFlat', zCenter: -0.91 },
    { name: 'RightFlat', zCenter: 0.91 },
  ];

  flatConfigs.forEach((fl, fIdx) => {
    const fName = fl.name;
    const fz = fl.zCenter;
    const sign = fIdx === 0 ? -1 : 1;

    // 7 pipes in ascending slope toward side tower
    const flatPipes = [
      { zOff: -sign * 0.24, r: 0.055, h: 2.05 },
      { zOff: -sign * 0.16, r: 0.058, h: 2.18 },
      { zOff: -sign * 0.08, r: 0.062, h: 2.32 },
      { zOff: 0.0,          r: 0.066, h: 2.48 },
      { zOff: sign * 0.08,  r: 0.070, h: 2.64 },
      { zOff: sign * 0.16,  r: 0.074, h: 2.82 },
      { zOff: sign * 0.24,  r: 0.078, h: 3.0 },
    ];
    flatPipes.forEach((fp, idx) => {
      addDisplayPipe(`${fName}Pipe_${idx}`, 0.06, 1.92, fz + fp.zOff, fp.r, fp.h, caseGroup);
    });

    // Flat Entablature & Cornice
    createPart(`${fName}Entablature`, boxGeo(0.36, 0.18, 0.66), woodDark, {
      position: [0.06, 4.88, fz],
      parent: caseGroup
    });
    createPart(`${fName}Cornice`, boxGeo(0.42, 0.1, 0.72), woodLight, {
      position: [0.08, 5.0, fz],
      parent: caseGroup
    });

    // Pierced Tracery Pipe Shade (carved foliage valance)
    createPart(`${fName}Shade`, boxGeo(0.08, 0.36, 0.62), goldLeaf, {
      position: [0.1, 4.65, fz],
      parent: caseGroup
    });
    // Hanging drops
    [-0.2, 0.0, 0.2].forEach((pz, pIdx) => {
      createInstance(`${fName}Drop_${pIdx}`, shadePendantProto, {
        position: [0.12, 4.42, fz + pz],
        rotation: [180, 0, 0],
        parent: caseGroup
      });
    });

    // Flat roof cresting (carved decorative balustrade along top)
    createPart(`${fName}Cresting`, boxGeo(0.06, 0.22, 0.68), goldLeaf, {
      position: [0.08, 5.16, fz],
      parent: caseGroup
    });
  });

  // =========================================================================
  // 2. DETACHED CONSOLE (Centred at X = 1.48m, facing +X towards organist)
  // Complete church organ console with enclosed case, stepped manuals,
  // angled stop jambs, music desk, brass sconce lamps, and pedalboard.
  // =========================================================================
  const consoleGroup = createPivot('Console', [1.48, 0, 0], root);

  // Console plinth / base
  createPart('ConsolePlinth', boxGeo(0.82, 0.08, 1.48), woodDark, {
    position: [0, 0.08, 0],
    parent: consoleGroup
  });

  // Lower cabinet body
  createPart('ConsoleCabinet', boxGeo(0.74, 0.88, 1.4), woodMedium, {
    position: [-0.02, 0.54, 0],
    parent: consoleGroup
  });

  // Side panels with raised mouldings (full height up to Y = 1.34m)
  [-0.71, 0.71].forEach((sideZ, sIdx) => {
    const sName = sIdx === 0 ? 'Left' : 'Right';
    // Lower side panel
    createPart(`ConsoleLowerSide_${sName}`, boxGeo(0.66, 0.74, 0.04), woodDark, {
      position: [-0.02, 0.54, sideZ],
      parent: consoleGroup
    });
    // Upper side cheek case (enclosing the upper console, stop jambs, and desk)
    createPart(`ConsoleUpperSide_${sName}`, boxGeo(0.66, 0.44, 0.04), woodDark, {
      position: [-0.02, 1.13, sideZ],
      parent: consoleGroup
    });
    // Curved roll-top track moulding along upper cheek
    createPart(`ConsoleRollTrack_${sName}`, cylinderZGeo(0.05, 0.05, 0.05, 10), woodLight, {
      position: [0.28, 1.05, sideZ],
      parent: consoleGroup
    });
  });

  // Upper back panel enclosing behind the music desk up to the top lid
  createPart('ConsoleUpperBack', boxGeo(0.04, 0.44, 1.38), woodDark, {
    position: [-0.33, 1.13, 0],
    parent: consoleGroup
  });

  // Knee well / leg opening for the organist in the center
  createPart('ConsolePedestalL', boxGeo(0.664, 0.664, 0.26), woodDark, {
    position: [0.002, 0.452, -0.56],
    parent: consoleGroup
  });
  createPart('ConsolePedestalR', boxGeo(0.664, 0.664, 0.26), woodDark, {
    position: [0.002, 0.452, 0.56],
    parent: consoleGroup
  });
  createPart('KneeWellBack', boxGeo(0.04, 0.66, 0.88), woodDark, {
    position: [-0.28, 0.44, 0],
    parent: consoleGroup
  });

  // Keybed shelf (supports the manuals)
  createPart('KeybedShelf', boxGeo(0.58, 0.06, 1.18), woodDark, {
    position: [0.15, 0.73, 0],
    parent: consoleGroup
  });

  // Carved Console Cheeks (side cheeks enclosing the manuals)
  [-0.48, 0.48].forEach((cz, cIdx) => {
    const side = cIdx === 0 ? 'Left' : 'Right';
    createPart(`CheekBlock_${side}`, boxGeo(0.44, 0.26, 0.06), woodDark, {
      position: [0.14, 0.88, cz],
      parent: consoleGroup
    });
    createPart(`CheekScroll_${side}`, cylinderZGeo(0.07, 0.07, 0.07, 10), woodMedium, {
      position: [0.35, 0.82, cz],
      parent: consoleGroup
    });
  });

  // --- TWO MANUALS (Swell & Great Keyboards) ---
  // Stepped arrangement: Great (lower) at Y = 0.78, Swell (upper) at Y = 0.86
  const manuals = [
    { name: 'ManualGreat', posX: 0.22, posY: 0.78 },
    { name: 'ManualSwell', posX: 0.13, posY: 0.86 },
  ];

  let sharpKeyProto = null;
  manuals.forEach((m) => {
    // Ivory naturals keybed
    createPart(`${m.name}_Naturals`, boxGeo(0.14, 0.026, 0.84), keyWhite, {
      position: [m.posX, m.posY, 0],
      parent: consoleGroup
    });
    // Front lip bevel of natural keys
    createPart(`${m.name}_KeyLip`, boxGeo(0.02, 0.03, 0.84), keyWhite, {
      position: [m.posX + 0.07, m.posY - 0.002, 0],
      parent: consoleGroup
    });
    // Red felt strip behind keys
    createPart(`${m.name}_Felt`, boxGeo(0.024, 0.03, 0.84), feltRed, {
      position: [m.posX - 0.075, m.posY + 0.008, 0],
      parent: consoleGroup
    });

    // Black sharp keys in realistic octave pattern (groups of 2 and 3)
    const octaves = [-0.34, -0.17, 0.0, 0.17, 0.34];
    octaves.forEach((octZ, octIdx) => {
      const sharpOffsets = [-0.056, -0.028, 0.014, 0.040, 0.064];
      sharpOffsets.forEach((off, sIdx) => {
        const kZ = octZ + off;
        if (kZ < -0.40 || kZ > 0.40) return;

        if (!sharpKeyProto) {
          sharpKeyProto = createPart('SharpKeyProto', boxGeo(0.088, 0.024, 0.012), keyBlack, {
            position: [m.posX - 0.025, m.posY + 0.022, kZ],
            parent: consoleGroup
          });
        } else {
          createInstance(`${m.name}_Sharp_${octIdx}_${sIdx}`, sharpKeyProto, {
            position: [m.posX - 0.025, m.posY + 0.022, kZ],
            parent: consoleGroup
          });
        }
      });
    });
  });

  // --- STOP KNOBS DOWN EACH CHEEK ---
  // Terraced angled stop jambs (angled at 30 deg towards organist)
  let stopStemProto = null;
  let stopHeadProto = null;
  [-0.44, 0.44].forEach((jambZ, sideIdx) => {
    const side = sideIdx === 0 ? 'Left' : 'Right';
    const sign = sideIdx === 0 ? -1 : 1;

    // Angled stop jamb panel
    createPart(`StopJambPanel_${side}`, boxGeo(0.38, 0.38, 0.12), woodDark, {
      position: [0.08, 0.94, jambZ + sign * 0.16],
      rotation: [0, -sign * 25, 0],
      parent: consoleGroup
    });

    // 2 columns of 6 stop knobs on each jamb (24 stop knobs total)
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 6; row++) {
        const kX = 0.20 - col * 0.07;
        const kY = 0.80 + row * 0.056;
        const kZ = jambZ + sign * (0.10 + col * 0.08);

        if (!stopStemProto) {
          stopStemProto = createPart('StopStemProto', cylinderXGeo(0.007, 0.007, 0.04, 6), woodDark, {
            position: [kX, kY, kZ],
            parent: consoleGroup
          });
          stopHeadProto = createPart('StopHeadProto', cylinderXGeo(0.016, 0.013, 0.018, 8), stopKnobWhite, {
            position: [kX + 0.025, kY, kZ],
            parent: consoleGroup
          });
          createPart('StopFaceLabel', decalBox(0.002, 0.02, 0.02), woodDark, {
            position: [kX + 0.035, kY, kZ],
            parent: consoleGroup
          });
        } else {
          createInstance(`StopStem_${side}_${col}_${row}`, stopStemProto, {
            position: [kX, kY, kZ],
            parent: consoleGroup
          });
          createInstance(`StopHead_${side}_${col}_${row}`, stopHeadProto, {
            position: [kX + 0.025, kY, kZ],
            parent: consoleGroup
          });
        }
      }
    }
  });

  // --- MUSIC DESK & CONSOLE TOP ---
  // Slanted music desk with slatted rack
  createPart('MusicDeskLedge', boxGeo(0.09, 0.03, 0.82), woodMedium, {
    position: [0.02, 0.98, 0],
    parent: consoleGroup
  });
  createPart('MusicDeskBack', boxGeo(0.024, 0.32, 0.8), woodDark, {
    position: [-0.04, 1.15, 0],
    rotation: [-15, 0, 0],
    parent: consoleGroup
  });
  // Carved desk grille slats
  for (let s = -3; s <= 3; s++) {
    createPart(`MusicDeskSlat_${s}`, boxGeo(0.02, 0.28, 0.025), woodLight, {
      position: [-0.028, 1.15, s * 0.11],
      rotation: [-15, 0, 0],
      parent: consoleGroup
    });
  }
  // Open Sheet Music Score on desk
  createPart('SheetMusicBook', boxGeo(0.012, 0.25, 0.36), scorePaper, {
    position: [-0.01, 1.15, 0],
    rotation: [-15, 0, 0],
    parent: consoleGroup
  });
  createPart('SheetMusicStaffL', boxGeo(0.014, 0.008, 0.13), woodDark, {
    position: [-0.002, 1.18, -0.08],
    rotation: [-15, 0, 0],
    parent: consoleGroup
  });
  createPart('SheetMusicStaffR', boxGeo(0.014, 0.008, 0.13), woodDark, {
    position: [-0.002, 1.18, 0.08],
    rotation: [-15, 0, 0],
    parent: consoleGroup
  });

  // Console Brass Desk Lamps (left and right sconces)
  [-0.45, 0.45].forEach((lampZ, lIdx) => {
    const side = lIdx === 0 ? 'Left' : 'Right';
    createPart(`DeskLampBase_${side}`, cylinderGeo(0.035, 0.04, 0.04, 8), brassMat, {
      position: [-0.02, 1.0, lampZ],
      parent: consoleGroup
    });
    createPart(`DeskLampStem_${side}`, cylinderGeo(0.012, 0.012, 0.22, 6), brassMat, {
      position: [-0.02, 1.12, lampZ],
      parent: consoleGroup
    });
    createPart(`DeskLampShade_${side}`, taperConeGeo(0.03, 0.065, 0.1, 'y', 10), brassMat, {
      position: [0.0, 1.25, lampZ],
      rotation: [25, 0, 0],
      parent: consoleGroup
    });
  });

  // Console Top Canopy / Roll-top Lid Housing (solidly rests on upper side and back panels at Y = 1.35m)
  createPart('ConsoleTopLid', boxGeo(0.74, 0.06, 1.46), woodDark, {
    position: [-0.03, 1.36, 0],
    parent: consoleGroup
  });
  createPart('ConsoleTopMoulding', boxGeo(0.78, 0.04, 1.5), woodLight, {
    position: [-0.02, 1.40, 0],
    parent: consoleGroup
  });

  // =========================================================================
  // 3. PEDALBOARD (Sits in the knee well on the dais floor Y = 0.04..0.18)
  // Concave radial 25-note pedalboard with expression shoes
  // =========================================================================
  const pedalGroup = createPivot('Pedalboard', [0, 0, 0], consoleGroup);

  // Pedal Frame (Toe rail, Heel rail, Side blocks)
  createPart('PedalFrameHeel', boxGeo(0.08, 0.06, 1.08), woodDark, {
    position: [0.46, 0.07, 0],
    parent: pedalGroup
  });
  createPart('PedalFrameToe', boxGeo(0.1, 0.09, 1.08), woodDark, {
    position: [-0.28, 0.08, 0],
    parent: pedalGroup
  });
  createPart('PedalFrameLeft', boxGeo(0.82, 0.08, 0.07), woodDark, {
    position: [0.09, 0.08, -0.54],
    parent: pedalGroup
  });
  createPart('PedalFrameRight', boxGeo(0.82, 0.08, 0.07), woodDark, {
    position: [0.09, 0.08, 0.54],
    parent: pedalGroup
  });

  // 25 Pedals: Concave curvature (middle pedals lower at Y=0.065, edge pedals Y=0.09)
  let pedalSharpProto = null;
  let pedalNatProto = null;
  const numPedals = 25;
  for (let i = 0; i < numPedals; i++) {
    const frac = i / (numPedals - 1);
    const pZ = -0.46 + frac * 0.92;
    // Slight concave arch
    const archY = Math.pow(Math.abs(frac - 0.5) * 2, 2) * 0.025;
    const isSharp = (i % 7 === 1 || i % 7 === 2 || i % 7 === 4 || i % 7 === 5 || i % 7 === 6);

    if (isSharp) {
      if (!pedalSharpProto) {
        pedalSharpProto = createPart('PedalSharpProto', boxGeo(0.38, 0.04, 0.024), woodDark, {
          position: [-0.08, 0.10 + archY, pZ],
          parent: pedalGroup
        });
        createPart('PedalSharpCapProto', boxGeo(0.38, 0.012, 0.022), keyBlack, {
          position: [-0.08, 0.125 + archY, pZ],
          parent: pedalGroup
        });
      } else {
        createInstance(`PedalSharp_${i}`, pedalSharpProto, {
          position: [-0.08, 0.10 + archY, pZ],
          parent: pedalGroup
        });
      }
    } else {
      if (!pedalNatProto) {
        pedalNatProto = createPart('PedalNatProto', boxGeo(0.72, 0.028, 0.026), woodLight, {
          position: [0.08, 0.065 + archY, pZ],
          parent: pedalGroup
        });
      } else {
        createInstance(`PedalNatural_${i}`, pedalNatProto, {
          position: [0.08, 0.065 + archY, pZ],
          parent: pedalGroup
        });
      }
    }
  }

  // Swell & Crescendo Expression Shoes (mounted into knee well)
  [-0.08, 0.08].forEach((shoeZ, sIdx) => {
    const sName = sIdx === 0 ? 'SwellShoe' : 'CrescendoShoe';
    createPart(sName, boxGeo(0.18, 0.035, 0.1), keyBlack, {
      position: [-0.18, 0.22, shoeZ],
      rotation: [16, 0, 0],
      parent: pedalGroup
    });
    createPart(`${sName}Plate`, boxGeo(0.14, 0.01, 0.08), brassMat, {
      position: [-0.18, 0.24, shoeZ],
      rotation: [16, 0, 0],
      parent: pedalGroup
    });
  });

  // Toe Studs (metal combination pistons along the toe frame)
  for (let t = -3; t <= 3; t++) {
    createPart(`ToeStud_${t}`, sphereGeo(0.016, 6, 6), brassMat, {
      position: [-0.22, 0.14, t * 0.12],
      parent: pedalGroup
    });
  }

  // =========================================================================
  // 4. ORGAN BENCH (Centred at X = 2.22m, facing -X towards console)
  // Perfectly spaced at ~0.30m from the keybed for authentic organ ergonomics.
  // =========================================================================
  const benchGroup = createPivot('OrganBench', [2.22, 0, 0], root);

  // Bench Seat (wide contoured oak plank)
  createPart('BenchSeat', boxGeo(0.36, 0.05, 1.26), woodMedium, {
    position: [0, 0.62, 0],
    parent: benchGroup
  });
  createPart('BenchSeatBevel', boxGeo(0.38, 0.02, 1.28), woodLight, {
    position: [0, 0.645, 0],
    parent: benchGroup
  });

  // Music storage shelf under the bench seat
  createPart('BenchMusicShelf', boxGeo(0.28, 0.03, 1.08), woodDark, {
    position: [0, 0.53, 0],
    parent: benchGroup
  });

  // Trestle Legs (Left & Right shaped uprights)
  [-0.52, 0.52].forEach((legZ, lIdx) => {
    const side = lIdx === 0 ? 'Left' : 'Right';
    // Main vertical leg upright
    createPart(`BenchLeg_${side}`, boxGeo(0.24, 0.54, 0.05), woodDark, {
      position: [0, 0.32, legZ],
      parent: benchGroup
    });
    // Arched cutout in leg (decorative panel)
    createPart(`BenchLegArch_${side}`, cylinderXGeo(0.07, 0.07, 0.06, 10), woodLight, {
      position: [0, 0.22, legZ],
      parent: benchGroup
    });
    // Sturdy wide foot on the dais floor
    createPart(`BenchFoot_${side}`, boxGeo(0.34, 0.07, 0.09), woodDark, {
      position: [0, 0.06, legZ],
      parent: benchGroup
    });
    // Top bracket supporting seat
    createPart(`BenchTopBracket_${side}`, boxGeo(0.32, 0.05, 0.08), woodMedium, {
      position: [0, 0.58, legZ],
      parent: benchGroup
    });
  });

  // Central Stretcher rail connecting the two legs
  createPart('BenchStretcher', boxGeo(0.068, 0.09, 1.02), woodMedium, {
    position: [0, 0.24, 0],
    parent: benchGroup
  });
  // Wedge keys pinning the stretcher through each leg
  [-0.56, 0.56].forEach((keyZ, kIdx) => {
    createPart(`BenchWedge_${kIdx}`, boxGeo(0.04, 0.12, 0.03), woodLight, {
      position: [0, 0.24, keyZ],
      parent: benchGroup
    });
  });

  return root;
}
