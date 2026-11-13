// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: gemini-3.8-flash-high, via agy.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Refined later, in this repository, with `kiln_edit`: the horses were turned
// to face along their track instead of across it.
// The attribution above is for the authoring run, which had none of this in
// scope. Both passes went through the same tools; only the second one could
// see the gallery it was going into.

const meta = { name: 'Carousel', category: 'prop' };

function build() {
  const root = createRoot('Carousel');

  // =========================================================================
  // Materials Palette
  // =========================================================================
  const gold = gameMaterial(0xdfaf37, { metalness: 0.85, roughness: 0.25 });
  const mirror = gameMaterial(0xd8e4ec, { metalness: 0.95, roughness: 0.05 });
  const crimson = gameMaterial(0xb81824, { roughness: 0.45 });
  const cream = gameMaterial(0xf6eedb, { roughness: 0.55 });
  const darkWood = gameMaterial(0x3e2415, { roughness: 0.8 });
  const deckPlank = gameMaterial(0x6e4324, { roughness: 0.7 });
  const baseMaroon = gameMaterial(0x3a1017, { roughness: 0.85 });
  const darkLeather = gameMaterial(0x482818, { roughness: 0.75 });
  const darkDetail = gameMaterial(0x221a16, { roughness: 0.9 });
  const lightBulb = gameMaterial(0xfff3b0, { emissive: 0xffdf70, emissiveIntensity: 1.5, roughness: 0.3 });

  // Blanket accent colors
  const blanketSapphire = gameMaterial(0x1d4e89, { roughness: 0.45 });
  const blanketEmerald = gameMaterial(0x1e6b45, { roughness: 0.45 });
  const blanketPurple = gameMaterial(0x5e2b6d, { roughness: 0.45 });

  // Horse coat colors
  const coatWhite = gameMaterial(0xf4f1eb, { roughness: 0.6 });
  const coatChestnut = gameMaterial(0x7a361c, { roughness: 0.65 });
  const coatBlack = gameMaterial(0x282626, { roughness: 0.7 });
  const coatPalomino = gameMaterial(0xdca55c, { roughness: 0.65 });

  // =========================================================================
  // 1. Static Foundation Base (sitting on Y = 0)
  // =========================================================================
  // Sub-base plinth (Y: 0.00 to 0.08, radius 3.38m)
  createPart('BaseRingLower', cylinderGeo(3.38, 3.42, 0.08, 24), baseMaroon, {
    position: [0, 0.04, 0],
    parent: root,
  });
  // Stepped surround plinth (Y: 0.08 to 0.16, radius 3.28m)
  createPart('BaseRingUpper', cylinderGeo(3.28, 3.32, 0.08, 24), darkWood, {
    position: [0, 0.12, 0],
    parent: root,
  });
  // Outer perimeter brass trim
  createPart('BaseGoldTrim', torusGeo(3.32, 0.022, 6, 24), gold, {
    position: [0, 0.16, 0],
    rotation: [90, 0, 0],
    parent: root,
  });

  // =========================================================================
  // 2. Main Rotating Assembly (Joint_Carousel)
  // =========================================================================
  const carousel = createPivot('Carousel', [0, 0, 0], root);

  // Rotating Deck platform (Y: 0.16 to 0.32, radius 3.16m)
  createPart('DeckPlatform', cylinderGeo(3.16, 3.16, 0.16, 24), deckPlank, {
    position: [0, 0.24, 0],
    parent: carousel,
  });
  // Bullnose brass rim around deck edge
  createPart('DeckRim', torusGeo(3.17, 0.020, 6, 24), gold, {
    position: [0, 0.32, 0],
    rotation: [90, 0, 0],
    parent: carousel,
  });
  // Concentric deck plank inlay ring
  createPart('DeckInnerRing', torusGeo(2.25, 0.015, 6, 24), darkWood, {
    position: [0, 0.325, 0],
    rotation: [90, 0, 0],
    parent: carousel,
  });

  // =========================================================================
  // 3. Mirrored Centre Drum (Y: 0.32 to 2.65, radius 1.05m)
  // =========================================================================
  createPart('DrumCore', cylinderGeo(1.02, 1.02, 2.248, 12), darkWood, {
    position: [0, 1.484, 0],
    parent: carousel,
  });
  createPart('DrumPlinth', cylinderGeo(1.08, 1.12, 0.40, 12), baseMaroon, {
    position: [0, 0.52, 0],
    parent: carousel,
  });
  createPart('DrumPlinthTrim', torusGeo(1.09, 0.02, 6, 24), gold, {
    position: [0, 0.72, 0],
    rotation: [90, 0, 0],
    parent: carousel,
  });

  const mirrorWidth = 0.46;
  const mirrorHeight = 1.45;
  const drumR = 1.04;

  const geoMirror = boxGeo(mirrorWidth, mirrorHeight, 0.02);
  const geoFrameTop = boxGeo(mirrorWidth + 0.06, 0.06, 0.03);
  const geoFrameBot = boxGeo(mirrorWidth + 0.06, 0.06, 0.03);
  const geoPilaster = cylinderGeo(0.032, 0.032, 1.62, 6);
  const geoCap = boxGeo(0.08, 0.05, 0.08);
  const geoRosette = cylinderGeo(0.04, 0.04, 0.02, 6);
  geoRosette.rotateX(Math.PI / 2);
  const geoDrumLight = cylinderGeo(0.026, 0.026, 0.025, 6);
  geoDrumLight.rotateX(Math.PI / 2);

  for (let i = 0; i < 12; i++) {
    const angleDeg = i * 30;
    const rad = (angleDeg * Math.PI) / 180;
    const facePivot = createPivot('DrumFace' + i, [0, 0, 0], carousel);
    facePivot.rotation.y = -rad;

    // Mirrored glass panel
    createPart('Mirror' + i, geoMirror, mirror, {
      position: [0, 1.55, drumR],
      parent: facePivot,
    });
    // Gilded top & bottom frame
    createPart('FrameTop' + i, geoFrameTop, gold, {
      position: [0, 1.55 + mirrorHeight / 2 + 0.03, drumR + 0.01],
      parent: facePivot,
    });
    createPart('FrameBot' + i, geoFrameBot, gold, {
      position: [0, 1.55 - mirrorHeight / 2 - 0.03, drumR + 0.01],
      parent: facePivot,
    });

    // Fluted pilaster column
    const colX = mirrorWidth / 2 + 0.04;
    createPart('Pilaster' + i, geoPilaster, gold, {
      position: [colX, 1.55, drumR + 0.015],
      parent: facePivot,
    });
    createPart('ColCap' + i, geoCap, gold, {
      position: [colX, 1.55 + 0.81, drumR + 0.015],
      parent: facePivot,
    });
    createPart('ColBase' + i, geoCap, gold, {
      position: [colX, 1.55 - 0.81, drumR + 0.015],
      parent: facePivot,
    });

    // Rosette crest & cabochon carnival light
    createPart('Rosette' + i, geoRosette, crimson, {
      position: [0, 1.55 + mirrorHeight / 2 + 0.10, drumR + 0.02],
      parent: facePivot,
    });
    createPart('DrumLight' + i, geoDrumLight, lightBulb, {
      position: [0, 1.55 + mirrorHeight / 2 + 0.18, drumR + 0.02],
      parent: facePivot,
    });
  }

  // Upper drum cornice
  createPart('DrumCornice', cylinderGeo(1.15, 1.06, 0.16, 12), baseMaroon, {
    position: [0, 2.53, 0],
    parent: carousel,
  });
  createPart('DrumCorniceTrim', torusGeo(1.15, 0.022, 6, 24), gold, {
    position: [0, 2.61, 0],
    rotation: [90, 0, 0],
    parent: carousel,
  });

  // =========================================================================
  // 4. Overhead Structure: Ceiling & Radial Rafters
  // =========================================================================
  createPart('CeilingPlate', cylinderGeo(3.18, 3.18, 0.08, 24), darkWood, {
    position: [0, 2.68, 0],
    parent: carousel,
  });

  const geoRafter = boxGeo(0.08, 0.08, 2.15);
  const geoCrankBox = boxGeo(0.18, 0.14, 0.18);

  for (let i = 0; i < 8; i++) {
    const angleDeg = i * 45;
    const rad = (angleDeg * Math.PI) / 180;
    const rafterPivot = createPivot('RafterPivot' + i, [0, 0, 0], carousel);
    rafterPivot.rotation.y = -rad;

    createPart('Rafter' + i, geoRafter, gold, {
      position: [0, 2.64, 2.12],
      parent: rafterPivot,
    });
    createPart('CrankBox' + i, geoCrankBox, baseMaroon, {
      position: [0, 2.64, 2.25],
      parent: rafterPivot,
    });
  }

  // =========================================================================
  // 5. Striped Canopy (24 red & cream wedges) & Scalloped Valance
  // =========================================================================
  function makeWedgeGeo(rBot, rTop, yBot, yTop, dAngleDeg) {
    const geo = new THREE.BufferGeometry();
    const halfA = ((dAngleDeg * Math.PI) / 180) / 2;
    const cosA = Math.cos(halfA);
    const sinA = Math.sin(halfA);

    const x0 = -rBot * sinA, z0 = rBot * cosA, y0 = yBot;
    const x1 =  rBot * sinA, z1 = rBot * cosA, y1 = yBot;
    const x2 =  rTop * sinA, z2 = rTop * cosA, y2 = yTop;
    const x3 = -rTop * sinA, z3 = rTop * cosA, y3 = yTop;

    const pos = [
      x0, y0, z0,  x1, y1, z1,  x2, y2, z2,
      x0, y0, z0,  x2, y2, z2,  x3, y3, z3,
      x0, y0, z0,  x2, y2, z2,  x1, y1, z1,
      x0, y0, z0,  x3, y3, z3,  x2, y2, z2,
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  }

  const canopyWedgeGeo = makeWedgeGeo(3.25, 0.35, 2.76, 4.38, 15);

  const geoValance = boxGeo(0.82, 0.28, 0.03);
  const geoValTrim = boxGeo(0.84, 0.04, 0.04);
  const geoValCrest = cylinderGeo(0.038, 0.038, 0.02, 6);
  geoValCrest.rotateX(Math.PI / 2);
  const geoValLight = cylinderGeo(0.024, 0.024, 0.025, 6);
  geoValLight.rotateX(Math.PI / 2);
  const geoCanopySeam = cylinderGeo(0.014, 0.014, 3.25, 4);
  const seamPitch = 27.6;

  for (let i = 0; i < 24; i++) {
    const angleDeg = i * 15;
    const rad = (angleDeg * Math.PI) / 180;
    const isEven = i % 2 === 0;
    const mat = isEven ? crimson : cream;

    // Wedge
    const wedge = createPart('CanopyWedge' + i, canopyWedgeGeo, mat, { parent: carousel });
    wedge.rotation.y = -rad;

    // Valance panel
    const valancePivot = createPivot('ValPivot' + i, [0, 0, 0], carousel);
    valancePivot.rotation.y = -rad;

    createPart('Valance' + i, geoValance, isEven ? crimson : cream, {
      position: [0, 2.62, 3.26],
      parent: valancePivot,
    });
    createPart('ValTrim' + i, geoValTrim, gold, {
      position: [0, 2.48, 3.26],
      parent: valancePivot,
    });
    createPart('ValCrest' + i, geoValCrest, isEven ? gold : crimson, {
      position: [0, 2.62, 3.28],
      parent: valancePivot,
    });
    createPart('ValLight' + i, geoValLight, lightBulb, {
      position: [0, 2.50, 3.28],
      parent: valancePivot,
    });

    createPart('CanopySeam' + i, geoCanopySeam, gold, {
      position: [0, 3.57, 1.80],
      rotation: [-(90 - seamPitch), 0, 0],
      parent: valancePivot,
    });
  }

  // =========================================================================
  // 6. Canopy Cupola, Spire & Finial (Y: 4.38 to 5.80)
  // =========================================================================
  createPart('ApexRing', cylinderGeo(0.42, 0.42, 0.12, 16), gold, {
    position: [0, 4.42, 0],
    parent: carousel,
  });
  createPart('CupolaDrum', cylinderGeo(0.38, 0.38, 0.35, 12), baseMaroon, {
    position: [0, 4.65, 0],
    parent: carousel,
  });
  const geoCupCol = cylinderGeo(0.025, 0.025, 0.35, 6);
  for (let j = 0; j < 6; j++) {
    const cupA = (j * 60 * Math.PI) / 180;
    createPart('CupCol' + j, geoCupCol, gold, {
      position: [0.38 * Math.sin(cupA), 4.65, 0.38 * Math.cos(cupA)],
      parent: carousel,
    });
  }
  // Safe spire cone with non-zero top radius
  createPart('SpireCone', cylinderGeo(0.015, 0.44, 0.65, 16), gold, {
    position: [0, 5.15, 0],
    parent: carousel,
  });
  createPart('FinialOrb', cylinderGeo(0.06, 0.08, 0.14, 8), gold, {
    position: [0, 5.54, 0],
    parent: carousel,
  });
  createPart('FinialSpike', cylinderGeo(0.008, 0.018, 0.32, 6), gold, {
    position: [0, 5.72, 0],
    parent: carousel,
  });
  createPart('PennantFlag', boxGeo(0.32, 0.16, 0.015), crimson, {
    position: [0.18, 5.76, 0],
    parent: carousel,
  });

  // =========================================================================
  // 7. 8 Animated Horses & Brass Poles
  // =========================================================================
  // Reusable horse geometry set
  const geoTorso = cylinderXGeo(0.18, 0.19, 0.44, 8);
  const geoChest = cylinderXGeo(0.19, 0.13, 0.16, 8);
  const geoRump = cylinderXGeo(0.13, 0.18, 0.16, 8);
  const geoNeck = cylinderGeo(0.10, 0.15, 0.42, 8);
  const geoMane1 = boxGeo(0.08, 0.18, 0.05);
  const geoMane2 = boxGeo(0.08, 0.18, 0.05);
  const geoMane3 = boxGeo(0.07, 0.14, 0.05);
  const geoHead = boxGeo(0.16, 0.15, 0.15);
  const geoMuzzle = cylinderXGeo(0.06, 0.08, 0.18, 8);
  const geoNose = boxGeo(0.06, 0.07, 0.10);
  // Non-degenerate ear cylinder
  const geoEar = cylinderGeo(0.005, 0.028, 0.09, 6);
  const geoEye = boxGeo(0.03, 0.03, 0.02);

  const geoBlanket = boxGeo(0.40, 0.22, 0.42);
  const geoBlanketTrim = boxGeo(0.42, 0.03, 0.44);
  const geoSaddle = boxGeo(0.25, 0.06, 0.25);
  const geoPommel = boxGeo(0.06, 0.09, 0.16);
  const geoCantle = boxGeo(0.06, 0.11, 0.18);
  const geoStirrup = boxGeo(0.03, 0.08, 0.08);
  const geoBreastplate = boxGeo(0.18, 0.04, 0.32);
  const geoMedallion = cylinderGeo(0.035, 0.035, 0.02, 6);
  geoMedallion.rotateZ(Math.PI / 2);

  const geoLegUpper = cylinderGeo(0.04, 0.032, 0.22, 6);
  const geoLegLower = cylinderGeo(0.032, 0.026, 0.20, 6);
  const geoJoint = cylinderGeo(0.036, 0.036, 0.05, 6);
  const geoHoof = cylinderGeo(0.028, 0.036, 0.06, 6);
  const geoHaunch = cylinderGeo(0.07, 0.09, 0.18, 6);
  const geoThigh = cylinderGeo(0.055, 0.04, 0.24, 6);

  const geoTail1 = cylinderGeo(0.04, 0.03, 0.22, 6);
  const geoTail2 = cylinderGeo(0.035, 0.025, 0.24, 6);
  const geoTail3 = cylinderGeo(0.03, 0.015, 0.20, 6);

  const geoPole = cylinderGeo(0.024, 0.024, 2.38, 6);
  const geoPoleRing = torusGeo(0.038, 0.012, 6, 12);
  const geoPoleFinial = cylinderGeo(0.02, 0.045, 0.08, 6);

  const horseRingR = 2.25;
  const horseConfigs = [
    { coat: coatWhite, blanket: crimson, mane: darkDetail },
    { coat: coatChestnut, blanket: blanketSapphire, mane: coatWhite },
    { coat: coatBlack, blanket: blanketEmerald, mane: coatBlack },
    { coat: coatPalomino, blanket: blanketPurple, mane: coatWhite },
    { coat: coatWhite, blanket: blanketSapphire, mane: darkDetail },
    { coat: coatChestnut, blanket: crimson, mane: coatWhite },
    { coat: coatBlack, blanket: blanketPurple, mane: coatBlack },
    { coat: coatPalomino, blanket: blanketEmerald, mane: coatWhite },
  ];

  for (let i = 0; i < 8; i++) {
    const angleDeg = i * 45;
    const rad = (angleDeg * Math.PI) / 180;
    const cfg = horseConfigs[i];

    const mount = createPivot('Mount' + i, [
      horseRingR * Math.sin(rad),
      0,
      horseRingR * Math.cos(rad),
    ], carousel);
    // Face each horse along the track, not across it. The horse is modelled
    // nose-at-+X, and a Y rotation of `a` carries +X to (cos a, 0, -sin a) --
    // which is exactly the tangent at (R sin a, 0, R cos a). Adding a quarter
    // turn on top of that pointed every nose at the centre pole instead.
    mount.rotation.y = rad;

    // Fixed Brass Pole
    createPart('Pole' + i, geoPole, gold, {
      position: [0, 1.51, 0],
      parent: mount,
    });
    createPart('PoleBase' + i, geoPoleRing, gold, {
      position: [0, 0.33, 0],
      rotation: [90, 0, 0],
      parent: mount,
    });
    createPart('PoleTop' + i, geoPoleRing, gold, {
      position: [0, 2.67, 0],
      rotation: [90, 0, 0],
      parent: mount,
    });
    createPart('PoleBall' + i, geoPoleFinial, gold, {
      position: [0, 2.64, 0],
      parent: mount,
    });

    // Moving Horse Joint
    const baseY = 1.20;
    const horseJoint = createPivot('Horse' + i, [0, baseY, 0], mount);

    // Torso & Body
    createPart('Torso' + i, geoTorso, cfg.coat, { parent: horseJoint });
    createPart('Chest' + i, geoChest, cfg.coat, { position: [0.24, 0.02, 0], parent: horseJoint });
    createPart('Rump' + i, geoRump, cfg.coat, { position: [-0.24, 0.02, 0], parent: horseJoint });

    // Neck & Mane
    createPart('Neck' + i, geoNeck, cfg.coat, {
      position: [0.30, 0.22, 0],
      rotation: [0, 0, -38],
      parent: horseJoint,
    });
    createPart('ManeA' + i, geoMane1, cfg.mane, { position: [0.22, 0.28, 0], rotation: [0, 0, -35], parent: horseJoint });
    createPart('ManeB' + i, geoMane2, cfg.mane, { position: [0.30, 0.38, 0], rotation: [0, 0, -35], parent: horseJoint });
    createPart('ManeC' + i, geoMane3, cfg.mane, { position: [0.37, 0.48, 0], rotation: [0, 0, -30], parent: horseJoint });

    // Head
    createPart('Head' + i, geoHead, cfg.coat, { position: [0.44, 0.45, 0], parent: horseJoint });
    createPart('Muzzle' + i, geoMuzzle, cfg.coat, { position: [0.55, 0.41, 0], parent: horseJoint });
    createPart('Nose' + i, geoNose, darkDetail, { position: [0.64, 0.41, 0], parent: horseJoint });
    createPart('EarL' + i, geoEar, cfg.coat, { position: [0.41, 0.55, 0.055], rotation: [10, -5, -15], parent: horseJoint });
    createPart('EarR' + i, geoEar, cfg.coat, { position: [0.41, 0.55, -0.055], rotation: [-10, 5, -15], parent: horseJoint });
    createPart('EyeL' + i, geoEye, gold, { position: [0.47, 0.47, 0.085], parent: horseJoint });
    createPart('EyeR' + i, geoEye, gold, { position: [0.47, 0.47, -0.085], parent: horseJoint });

    // Saddle & Trappings
    createPart('Blanket' + i, geoBlanket, cfg.blanket, { position: [0, 0.02, 0], parent: horseJoint });
    createPart('BlanketTrim' + i, geoBlanketTrim, gold, { position: [0, -0.08, 0], parent: horseJoint });
    createPart('Saddle' + i, geoSaddle, darkLeather, { position: [0, 0.15, 0], parent: horseJoint });
    createPart('Pommel' + i, geoPommel, gold, { position: [0.10, 0.18, 0], parent: horseJoint });
    createPart('Cantle' + i, geoCantle, gold, { position: [-0.10, 0.19, 0], parent: horseJoint });
    createPart('StirrupL' + i, geoStirrup, gold, { position: [0, -0.16, 0.21], parent: horseJoint });
    createPart('StirrupR' + i, geoStirrup, gold, { position: [0, -0.16, -0.21], parent: horseJoint });
    createPart('Breastplate' + i, geoBreastplate, gold, { position: [0.25, 0.05, 0], parent: horseJoint });
    createPart('Medallion' + i, geoMedallion, crimson, { position: [0.35, 0.05, 0], parent: horseJoint });

    // Front Legs
    createPart('FL_Up' + i, geoLegUpper, cfg.coat, {
      position: [0.22, -0.12, 0.11],
      rotation: [-5, 0, -35],
      parent: horseJoint,
    });
    createPart('FL_Kn' + i, geoJoint, cfg.coat, { position: [0.28, -0.22, 0.11], parent: horseJoint });
    createPart('FL_Lo' + i, geoLegLower, cfg.coat, {
      position: [0.22, -0.31, 0.11],
      rotation: [0, 0, 30],
      parent: horseJoint,
    });
    createPart('FL_Hf' + i, geoHoof, gold, { position: [0.17, -0.40, 0.11], parent: horseJoint });

    createPart('FR_Up' + i, geoLegUpper, cfg.coat, {
      position: [0.22, -0.13, -0.11],
      rotation: [5, 0, -25],
      parent: horseJoint,
    });
    createPart('FR_Kn' + i, geoJoint, cfg.coat, { position: [0.27, -0.24, -0.11], parent: horseJoint });
    createPart('FR_Lo' + i, geoLegLower, cfg.coat, {
      position: [0.32, -0.34, -0.11],
      rotation: [0, 0, -20],
      parent: horseJoint,
    });
    createPart('FR_Hf' + i, geoHoof, gold, { position: [0.36, -0.44, -0.11], parent: horseJoint });

    // Hind Legs
    createPart('HL_Hn' + i, geoHaunch, cfg.coat, { position: [-0.22, -0.04, 0.12], parent: horseJoint });
    createPart('HL_Th' + i, geoThigh, cfg.coat, {
      position: [-0.28, -0.15, 0.12],
      rotation: [-5, 0, 30],
      parent: horseJoint,
    });
    createPart('HL_Hk' + i, geoJoint, cfg.coat, { position: [-0.34, -0.26, 0.12], parent: horseJoint });
    createPart('HL_Lo' + i, geoLegLower, cfg.coat, {
      position: [-0.31, -0.36, 0.12],
      rotation: [0, 0, -15],
      parent: horseJoint,
    });
    createPart('HL_Hf' + i, geoHoof, gold, { position: [-0.28, -0.45, 0.12], parent: horseJoint });

    createPart('HR_Hn' + i, geoHaunch, cfg.coat, { position: [-0.22, -0.04, -0.12], parent: horseJoint });
    createPart('HR_Th' + i, geoThigh, cfg.coat, {
      position: [-0.30, -0.16, -0.12],
      rotation: [5, 0, 40],
      parent: horseJoint,
    });
    createPart('HR_Hk' + i, geoJoint, cfg.coat, { position: [-0.38, -0.27, -0.12], parent: horseJoint });
    createPart('HR_Lo' + i, geoLegLower, cfg.coat, {
      position: [-0.44, -0.37, -0.12],
      rotation: [0, 0, 25],
      parent: horseJoint,
    });
    createPart('HR_Hf' + i, geoHoof, gold, { position: [-0.49, -0.47, -0.12], parent: horseJoint });

    // Tail
    createPart('TailA' + i, geoTail1, cfg.mane, {
      position: [-0.34, 0.04, 0],
      rotation: [0, 0, 45],
      parent: horseJoint,
    });
    createPart('TailB' + i, geoTail2, cfg.mane, {
      position: [-0.44, -0.08, 0],
      rotation: [0, 0, 20],
      parent: horseJoint,
    });
    createPart('TailC' + i, geoTail3, cfg.mane, {
      position: [-0.49, -0.22, 0],
      rotation: [0, 0, -10],
      parent: horseJoint,
    });
  }

  return root;
}

function animate() {
  const duration = 4;
  const tracks = [];

  // Full 360-degree rotation of the carousel assembly
  const carouselRotations = [];
  for (let step = 0; step <= 4; step++) {
    const angle = (step * 90) % 360;
    carouselRotations.push({
      time: (step * duration) / 4,
      rotation: [0, angle, 0],
    });
  }
  tracks.push(rotationTrack('Joint_Carousel', carouselRotations));

  // Sinusoidal rise-and-fall for each of the 8 horses
  const baseY = 1.20;
  const bobAmp = 0.16;
  const sampleCount = 8;

  for (let i = 0; i < 8; i++) {
    const phase = (i * Math.PI) / 2;
    const horsePositions = [];

    for (let s = 0; s <= sampleCount; s++) {
      const t = (s * duration) / sampleCount;
      const y = baseY + bobAmp * Math.sin(2 * Math.PI * (t / 2) + phase);
      horsePositions.push({
        time: t,
        position: [0, y, 0],
      });
    }

    tracks.push(positionTrack('Joint_Horse' + i, horsePositions));
  }

  return [createClip('ride', duration, tracks)];
}
