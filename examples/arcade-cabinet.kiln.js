// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 5 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// A 1980s upright arcade cabinet.
//
// Where the street lamp is a study in revolved profiles and the diving helmet in
// material contrast, this cabinet is about SILHOUETTE, JOINERY, and EMISSIVE
// ILLUMINATION. An arcade cabinet is instantly recognized by its iconic side profile
// cut: the forward-jutting marquee visor, the glare-shielding monitor hood, the
// forward-sloping control panel deck, the coin door that took countless quarters,
// and the bright T-molding tracing every routed edge.
//
// Several key construction principles from the Kiln contract guide this asset:
//
// 1. The cabinet sides are extruded using extrudeProfile rather than stacked from
//    boxes. Stacked boxes fail immediately in orthographic views because real arcade
//    cabinets were cut from 3/4" plywood with continuous curves and angles routed on
//    a pin router.
// 2. Both coin slots and the stereo speaker grille holes are cut using CSG (boolDiff)
//    with { smooth: true } to guarantee clean manifold geometry and continuous normals.
// 3. Emissive lighting is central: the CRT screen glows brightly from deep within the
//    hood behind real tinted glass (glassMaterial), while the top marquee illuminates
//    the header with a procedural synthwave graphic.
// 4. Paint, melamine, and plastics are strictly DIELECTRIC (metalness near 0). Only bare
//    metal (chrome joystick shafts, coin return flaps, lock plugs, leveller studs)
//    receives high metalness.
// 5. The asset strictly honors the Kiln coordinate contract: +X is forward (the screen,
//    controls, marquee, and coin door face +X), +Y is up, +Z is cabinet right, and the
//    heavy-duty levelling feet touch the ground plane exactly at Y = 0.
//
// Mistakes fixed during development:
// - Initial boolean cutters without smooth: true produced flat-shaded faceted normals,
//   which caused autoUnwrap to fragment the atlassed charts into tiles. Passing
//   { smooth: true } on the boolean calls restored continuous surface shading.
// - Smoked glass pane placed co-planar with the CRT bezel caused z-fighting; offsetting
//   the glass forward into real aluminum retaining channels eliminated all artifacts.
// - The control panel buttons were originally loose discs; modeling individual outer
//   threaded bezel collars with concave microswitch plungers made them read as real
//   Happ/Sanwa arcade hardware.
// - CRT curved face in roundedBoxGeo originally exceeded the radius constraint (radius must
//   be less than half the smallest dimension), which threw during generation. Adjusting
//   dimensions and unrolling through autoUnwrap ensured clean PBR texture rendering.
//
// Authored by: Gemini 3.8 Flash, via Antigravity CLI (agy).
// Every part below was written by the model itself, looking at its own renders
// through the Kiln tools and revising. Not a line of it is hand-authored.
const meta = { name: 'ArcadeCabinet', category: 'prop', role: 'poi' };

async function build() {
  const root = createRoot('ArcadeCabinet');
  const uv = (g) => autoUnwrap(g, { resolution: 512 });

  // =========================================================================
  // MATERIALS
  // =========================================================================

  // Cabinet carcass: dark charcoal satin melamine over 3/4" plywood core.
  const woodBlack = gameMaterial(0x18181b, { roughness: 0.65, metalness: 0.04 });
  // Rear service door: slightly warmer textured panel with distinct shadow reveal.
  const woodDoor = gameMaterial(0x222226, { roughness: 0.72, metalness: 0.03 });

  // T-molding: bright extruded vinyl trim along the routed cabinet edges.
  const tmoldBlue = gameMaterial(0x0078eb, { roughness: 0.22, metalness: 0.05 });

  // Powder-coated cast iron: crinkle-finish black for coin door frame and bezels.
  const metalCast = gameMaterial(0x222225, { roughness: 0.58, metalness: 0.65 });
  // Coin door face plate: dark steel with distinct texture.
  const metalDoorFace = gameMaterial(0x1a1a1d, { roughness: 0.52, metalness: 0.50 });

  // Mirror chrome: joystick shafts, lock cylinders, coin return flaps, carriage bolts.
  const metalChrome = gameMaterial(0xe4e4e6, { roughness: 0.12, metalness: 0.96 });

  // Zinc-plated hardware: brackets, speaker basket frames, leveller studs and locknuts.
  const metalZinc = gameMaterial(0x828a8f, { roughness: 0.38, metalness: 0.88 });

  // Molded plastic: matte black ABS for CRT monitor bezel shroud, cord cleats, speaker cones.
  const plasticBlack = gameMaterial(0x121215, { roughness: 0.82, metalness: 0.02 });

  // Heavy black rubber: joystick dust washers, power cord boot, levelling foot pads.
  const rubberBlack = gameMaterial(0x181818, { roughness: 0.92, metalness: 0.0 });

  // Arcade pushbutton plastics: bright glossy saturated colors.
  const btnRed = gameMaterial(0xd81824, { roughness: 0.18, metalness: 0.04 });
  const btnBlue = gameMaterial(0x0866ea, { roughness: 0.18, metalness: 0.04 });
  const btnYellow = gameMaterial(0xf5b800, { roughness: 0.18, metalness: 0.04 });
  const btnGreen = gameMaterial(0x12aa3e, { roughness: 0.18, metalness: 0.04 });
  const btnWhite = gameMaterial(0xf0f0f4, { roughness: 0.18, metalness: 0.04 });
  const btnOrange = gameMaterial(0xff6a00, { roughness: 0.18, metalness: 0.04 });

  // Illuminated 25¢ reject pushbuttons: glowing translucent orange.
  const coinGlow = gameMaterial(0xff6a00, { emissive: 0xff4800, emissiveIntensity: 2.4, roughness: 0.28 });

  // Marquee backlight: glowing white fluorescent tube.
  const fluorescentMat = gameMaterial(0xffffff, { emissive: 0xffffff, emissiveIntensity: 3.2 });

  // Smoked tempered safety glass: tinted, semi-transparent protective pane in front of CRT.
  const glass = glassMaterial(0x142028, { opacity: 0.30, roughness: 0.05, metalness: 0.02 });

  // Procedural CRT Screen: glowing retro arcade space combat scene with horizontal scanlines!
  const crtTex = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'CRTScreenArt',
    layers: [
      { op: 'solid', color: 0x03060f },
      { op: 'gradient', from: 0x0d4a6b, to: 0x03060f, angleDeg: 90 },
      // Scanlines run HORIZONTALLY on a CRT -- angleDeg 90 made them vertical,
      // which reads as interference rather than a raster.
      { op: 'stripes', colorA: 0x000000, colorB: 0x0aa6c4, count: 64, angleDeg: 0, blend: 'overlay', opacity: 0.30 },
      { op: 'noise', colorA: 0x000000, colorB: 0x7fd8a0, scale: 32, octaves: 2, blend: 'screen', opacity: 0.20 },
    ],
  });
  // A CRT is bright RELATIVE TO ITS SURROUND, not absolutely. The first pass ran
  // a near-white albedo under an emissive and the screen clipped to a white
  // rectangle -- the one part of the cabinet that should read as an image became
  // the one part with no image in it.
  const crtScreenMat = pbrMaterial({
    albedo: crtTex,
    emissive: 0x0a5f8c,
    emissiveIntensity: 1.5,
    roughness: 0.30,
    metalness: 0.02,
  });

  // Procedural marquee graphic: 80s synthwave cosmic title graphic with neon stripes.
  const marqueeTex = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'MarqueeArt',
    layers: [
      { op: 'solid', color: 0x180036 },
      { op: 'gradient', from: 0xff0077, to: 0x00e5ff, angleDeg: 30 },
      { op: 'stripes', colorA: 0xffdd00, colorB: 0x180036, count: 6, angleDeg: -45, blend: 'overlay', opacity: 0.60 },
      { op: 'noise', colorA: 0x000000, colorB: 0xffffff, scale: 28, octaves: 2, blend: 'screen', opacity: 0.25 },
    ],
  });
  const marqueeMat = pbrMaterial({
    albedo: marqueeTex,
    emissive: 0xff1166,
    roughness: 0.25,
    metalness: 0.02,
  });

  // Procedural side art graphic: vibrant 80s arcade neon speed stripes on midnight navy.
  const sideArtTex = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'SideArtSpeedStripes',
    layers: [
      // Side art is the largest single surface on a cabinet, so a full-strength
      // two-way stripe over the whole of it turns the machine into a beach
      // towel and buries the silhouette. Dropping the primary stripe to a third
      // and deleting the counter-diagonal leaves a diagonal sweep over a dark
      // ground, which is what the real Bally/Midway art actually does.
      { op: 'solid', color: 0x140a28 },
      { op: 'gradient', from: 0x3a1068, to: 0x0a0416, angleDeg: 90 },
      { op: 'stripes', colorA: 0xff0066, colorB: 0x00f0ff, count: 6, angleDeg: 45, blend: 'normal', opacity: 0.30 },
      { op: 'noise', colorA: 0x000000, colorB: 0xffffff, scale: 36, octaves: 2, blend: 'overlay', opacity: 0.20 },
    ],
  });
  const sideArtMat = pbrMaterial({
    albedo: sideArtTex,
    normal: normalMapFromHeight(sideArtTex, { strength: 1.4 }),
    roughness: 0.40,
    metalness: 0.04,
  });

  // =========================================================================
  // 1. CABINET CARCASS & EXTRUDED SIDE PANELS
  // =========================================================================
  const sideProfile = [
    [-0.36, 0.04],  // 0: Bottom rear
    [0.12, 0.04],   // 1: Bottom front (toe kick base)
    [0.12, 0.22],   // 2: Top of toe kick
    [0.23, 0.24],   // 3: Bottom of coin door kick face
    [0.25, 0.55],   // 4: Mid coin door face
    [0.26, 0.82],   // 5: Top of coin door / under CP shelf
    [0.38, 0.85],   // 6: CP nose bottom
    [0.40, 0.90],   // 7: CP nose front tip
    [0.39, 0.94],   // 8: CP nose top
    [0.26, 0.99],   // 9: CP deck slope
    [0.16, 1.04],   // 10: Top of CP / base of monitor hood
    [0.15, 1.16],   // 11: Monitor hood cheek lower
    [0.13, 1.28],   // 12: Monitor hood cheek mid
    [0.08, 1.38],   // 13: Monitor hood cheek upper
    [0.04, 1.44],   // 14: Deepest recess under speaker/marquee hood
    [0.10, 1.50],   // 15: Speaker grille slant
    [0.16, 1.54],   // 16: Marquee bottom overhang
    [0.22, 1.76],   // 17: Marquee top visor peak
    [0.14, 1.76],   // 18: Roof front corner
    [-0.10, 1.73],  // 19: Roof mid
    [-0.36, 1.68],  // 20: Roof rear
  ];

  const sidePanelGeo = await extrudeProfile(sideProfile, { depth: 0.024, axis: 'z', bevel: 0.003 });
  createPart('SidePanel_R', sidePanelGeo, woodBlack, { position: [0, 0, 0.308], parent: root });
  createPart('SidePanel_L', sidePanelGeo, woodBlack, { position: [0, 0, -0.308], parent: root });

  const chassisBolts = [
    [0.06, 1.12],
    [-0.04, 1.25],
    [-0.14, 1.36],
  ];
  for (const [cbx, cby] of chassisBolts) {
    for (const sz of [-0.322, 0.322]) {
      createPart(`ChassisBolt_${cbx}_${sz > 0 ? 'R' : 'L'}`, sphereGeo(0.007, 10, 8), metalChrome, {
        position: [cbx, cby, sz], parent: root,
      });
    }
  }

  // =========================================================================
  // 2. T-MOLDING
  // =========================================================================
  const tmoldPerimeter = sideProfile.slice(1).map(([x, y]) => [x, y]);
  const tmoldPtsR = tmoldPerimeter.map(([x, y]) => [x, y, 0.320]);
  const tmoldPtsL = tmoldPerimeter.map(([x, y]) => [x, y, -0.320]);

  createPart('TMolding_R', pipeAlongPath(tmoldPtsR, 0.010, { bendRadius: 0.015, tubularSegments: 80, radialSegments: 10 }), tmoldBlue, { parent: root });
  createPart('TMolding_L', pipeAlongPath(tmoldPtsL, 0.010, { bendRadius: 0.015, tubularSegments: 80, radialSegments: 10 }), tmoldBlue, { parent: root });

  // =========================================================================
  // 3. SIDE ART PANELS (WITH DIE-CUT BLACK BORDER)
  // =========================================================================
  const sideArtPoly = [
    [-0.27, 0.38],
    [0.17, 0.38],
    [0.19, 0.78],
    [0.11, 1.03],
    [0.01, 1.34],
    [0.09, 1.49],
    [0.15, 1.68],
    [-0.27, 1.60],
  ];
  const sideArtBackerGeo = await extrudeProfile(sideArtPoly, { depth: 0.005, axis: 'z', bevel: 0.002 });
  createPart('SideArtBorder_R', sideArtBackerGeo, plasticBlack, { position: [0, 0, 0.321], parent: root });
  createPart('SideArtBorder_L', sideArtBackerGeo, plasticBlack, { position: [0, 0, -0.321], parent: root });

  const sideArtGeo = await uv(await extrudeProfile(sideArtPoly, { depth: 0.003, axis: 'z' }));
  // Inset the art about 4 mm so its edge sits inside the border's edge instead of on it.
  sideArtGeo.translate(0.04, -1.03, 0).scale(0.452 / 0.46, 1.292 / 1.30, 1).translate(-0.04, 1.03, 0);
  createPart('SideArt_R', sideArtGeo, sideArtMat, { position: [0, 0, 0.324], parent: root });
  createPart('SideArt_L', sideArtGeo, sideArtMat, { position: [0, 0, -0.324], parent: root });

  // =========================================================================
  // 4. BASEBOARD & LEVELLING FEET (GROUNDING AT Y = 0)
  // =========================================================================
  createPart('CabinetFloor', boxGeo(0.48, 0.024, 0.592), woodBlack, {
    position: [-0.12, 0.052, 0], parent: root,
  });

  const levellerCoords = [
    [0.08, 0.22],
    [0.08, -0.22],
    [-0.28, 0.22],
    [-0.28, -0.22],
  ];

  for (let i = 0; i < levellerCoords.length; i++) {
    const [lx, lz] = levellerCoords[i];
    createPart(`LevellerPad_${i}`, cylinderGeo(0.028, 0.030, 0.010, 16), metalZinc, {
      position: [lx, 0.005, lz], parent: root,
    });
    createPart(`LevellerNut_${i}`, cylinderGeo(0.015, 0.015, 0.008, 6), metalZinc, {
      position: [lx, 0.014, lz], parent: root,
    });
    createPart(`LevellerStud_${i}`, cylinderGeo(0.009, 0.009, 0.026, 12), metalChrome, {
      position: [lx, 0.027, lz], parent: root,
    });
    createPart(`LevellerBracket_${i}`, boxGeo(0.065, 0.005, 0.065), metalCast, {
      position: [lx, 0.040, lz], parent: root,
    });
  }

  for (const sz of [-1, 1]) {
    createPart(`RearCasterBracket_${sz > 0 ? 'R' : 'L'}`, boxGeo(0.036, 0.030, 0.035), metalCast, {
      position: [-0.338, 0.045, sz * 0.24], parent: root,
    });
    createPart(`RearCasterWheel_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.022, 0.022, 0.025, 16), rubberBlack, {
      position: [-0.34, 0.024, sz * 0.24], parent: root,
    });
  }

  // =========================================================================
  // 5. TOE KICK & STEEL KICKPLATE
  // =========================================================================
  createPart('ToeKickPanel', boxGeo(0.018, 0.18, 0.592), woodBlack, {
    position: [0.120, 0.130, 0], parent: root,
  });

  createPart('Kickplate', await roundedBoxGeo(0.006, 0.150, 0.570, 0.0015), metalCast, {
    position: [0.131, 0.130, 0], parent: root,
  });

  for (const sy of [-0.055, 0.055]) {
    for (const sz of [-0.24, 0.24]) {
      createPart(`KickplateBolt_${sy > 0 ? 'T' : 'B'}_${sz > 0 ? 'R' : 'L'}`, sphereGeo(0.006, 8, 6), metalChrome, {
        position: [0.134, 0.130 + sy, sz], parent: root,
      });
    }
  }

  // =========================================================================
  // 6. LOWER FRONT & DOUBLE COIN DOOR (CSG COIN SLOTS)
  // =========================================================================
  createPart('CoinDoorBulkhead', boxGeo(0.020, 0.580, 0.592), woodBlack, {
    position: [0.245, 0.530, 0], parent: root,
  });

  createPart('CoinDoorFrame', await roundedBoxGeo(0.024, 0.440, 0.360, 0.008), metalCast, {
    position: [0.266, 0.530, 0], parent: root,
  });

  createPart('CoinDoorInner', await roundedBoxGeo(0.016, 0.410, 0.330, 0.006), metalDoorFace, {
    position: [0.274, 0.530, 0], parent: root,
  });

  createPart('CoinDoorCenterRib', boxGeo(0.018, 0.410, 0.012), metalCast, {
    position: [0.278, 0.530, 0], parent: root,
  });

  createPart('CoinLockBezel', cylinderXGeo(0.013, 0.013, 0.016, 16), metalChrome, {
    position: [0.284, 0.705, 0], parent: root,
  });
  createPart('CoinLockCore', cylinderXGeo(0.008, 0.008, 0.018, 12), metalZinc, {
    position: [0.286, 0.705, 0], parent: root,
  });
  createPart('CoinLockSlot', boxGeo(0.020, 0.008, 0.002), metalCast, {
    position: [0.287, 0.705, 0], parent: root,
  });

  createPart('InsertCoinBadge', boxGeo(0.003, 0.022, 0.160), metalZinc, {
    position: [0.282, 0.655, 0], parent: root,
  });

  const bezelGeo = await roundedBoxGeo(0.016, 0.076, 0.066, 0.004);

  const bezelL = new THREE.Mesh(bezelGeo, metalCast);
  bezelL.position.set(0.280, 0.605, -0.075);
  const slotCutterL = new THREE.Mesh(boxGeo(0.030, 0.032, 0.004), metalCast);
  slotCutterL.position.set(0.280, 0.615, -0.075);
  const coinSlotMeshL = await boolDiff('CoinSlotL', bezelL, slotCutterL, { smooth: true });
  root.add(coinSlotMeshL);

  const bezelR = new THREE.Mesh(bezelGeo, metalCast);
  bezelR.position.set(0.280, 0.605, 0.075);
  const slotCutterR = new THREE.Mesh(boxGeo(0.030, 0.032, 0.004), metalCast);
  slotCutterR.position.set(0.280, 0.615, 0.075);
  const coinSlotMeshR = await boolDiff('CoinSlotR', bezelR, slotCutterR, { smooth: true });
  root.add(coinSlotMeshR);

  for (const sz of [-0.075, 0.075]) {
    const sideName = sz > 0 ? 'R' : 'L';
    createPart(`CoinRejectBtn_${sideName}`, await roundedBoxGeo(0.014, 0.024, 0.038, 0.003), coinGlow, {
      position: [0.288, 0.545, sz], parent: root,
    });
    createPart(`CoinRejectBezel_${sideName}`, await roundedBoxGeo(0.008, 0.030, 0.044, 0.002), plasticBlack, {
      position: [0.283, 0.545, sz], parent: root,
    });
  }

  for (const sz of [-0.075, 0.075]) {
    const sideName = sz > 0 ? 'R' : 'L';
    createPart(`CoinReturnPocket_${sideName}`, await roundedBoxGeo(0.022, 0.074, 0.068, 0.004), metalCast, {
      position: [0.279, 0.385, sz], parent: root,
    });
    createPart(`CoinReturnFlap_${sideName}`, boxGeo(0.004, 0.052, 0.050), metalChrome, {
      position: [0.284, 0.385, sz], rotation: [0, 0, 16], parent: root,
    });
  }

  for (const sy of [-0.19, 0.19]) {
    for (const sz of [-0.155, 0.155]) {
      createPart(`CoinFrameBolt_${sy > 0 ? 'T' : 'B'}_${sz > 0 ? 'R' : 'L'}`, sphereGeo(0.005, 8, 6), metalChrome, {
        position: [0.278, 0.530 + sy, sz], parent: root,
      });
    }
  }

  createPart('UnderCPShelf', boxGeo(0.125, 0.020, 0.592), woodBlack, {
    position: [0.320, 0.835, 0], parent: root,
  });

  // =========================================================================
  // 7. CONTROL PANEL (C.P.) ASSEMBLY & BUTTON ARRAYS
  // =========================================================================
  const cpSlopeRad = -0.410;
  const cpSlopeDeg = -23.5;

  createPart('ControlPanelDeck', boxGeo(0.252, 0.020, 0.590), woodBlack, {
    position: [0.275, 0.990, 0], rotation: [0, 0, cpSlopeDeg], parent: root,
  });

  createPart('CPO_PlateP1', boxGeo(0.230, 0.002, 0.270), gameMaterial(0x101428, { roughness: 0.35, metalness: 0.05 }), {
    position: [0.275 - 0.011 * Math.sin(cpSlopeRad), 0.990 + 0.011 * Math.cos(cpSlopeRad), -0.145],
    rotation: [0, 0, cpSlopeDeg], parent: root,
  });
  createPart('CPO_PlateP2', boxGeo(0.230, 0.002, 0.270), gameMaterial(0x281014, { roughness: 0.35, metalness: 0.05 }), {
    position: [0.275 - 0.011 * Math.sin(cpSlopeRad), 0.990 + 0.011 * Math.cos(cpSlopeRad), 0.145],
    rotation: [0, 0, cpSlopeDeg], parent: root,
  });

  createPart('CPFrontNosing', cylinderZGeo(0.012, 0.012, 0.592, 20), metalCast, {
    position: [0.392, 0.938, 0], parent: root,
  });

  for (const sz of [-0.298, 0.298]) {
    createPart(`CPMountBracket_${sz > 0 ? 'R' : 'L'}`, boxGeo(0.180, 0.012, 0.008), metalZinc, {
      position: [0.275, 0.990, sz], rotation: [0, 0, cpSlopeDeg], parent: root,
    });
    for (const sx of [-0.06, 0.06]) {
      createPart(`CPMountBolt_${sz > 0 ? 'R' : 'L'}_${sx > 0 ? 'F' : 'B'}`, sphereGeo(0.005, 8, 6), metalChrome, {
        position: [0.275 + sx * Math.cos(cpSlopeRad), 0.990 + sx * Math.sin(cpSlopeRad), sz + (sz > 0 ? 0.005 : -0.005)],
        parent: root,
      });
    }
  }

  for (const sz of [-0.18, 0.18]) {
    const pName = sz > 0 ? 'P2' : 'P1';
    const startX = 0.198, startY = 1.025;
    createPart(`StartBtnBezel_${pName}`, cylinderGeo(0.015, 0.016, 0.006, 16), plasticBlack, {
      position: [startX, startY, sz], rotation: [0, 0, cpSlopeDeg], parent: root,
    });
    createPart(`StartBtnPlunger_${pName}`, cylinderGeo(0.011, 0.011, 0.008, 16), btnWhite, {
      position: [startX - 0.003 * Math.sin(cpSlopeRad), startY + 0.003 * Math.cos(cpSlopeRad), sz],
      rotation: [0, 0, cpSlopeDeg], parent: root,
    });
  }

  const joystickZ = [-0.165, 0.165];
  for (let p = 0; p < 2; p++) {
    const jz = joystickZ[p];
    const pName = p === 0 ? 'P1' : 'P2';
    const ballMat = p === 0 ? btnRed : btnBlue;
    const jBaseX = 0.280, jBaseY = 0.988;

    createPart(`JoyMount_${pName}`, boxGeo(0.065, 0.004, 0.065), metalCast, {
      position: [jBaseX, jBaseY + 0.010, jz], rotation: [0, 0, cpSlopeDeg], parent: root,
    });

    createPart(`JoyWasher_${pName}`, cylinderGeo(0.026, 0.026, 0.003, 24), rubberBlack, {
      position: [jBaseX, jBaseY + 0.014, jz], rotation: [0, 0, cpSlopeDeg], parent: root,
    });

    const shaftLen = 0.052;
    const nx = -Math.sin(cpSlopeRad), ny = Math.cos(cpSlopeRad);
    createPart(`JoyShaft_${pName}`, cylinderGeo(0.005, 0.005, shaftLen, 16), metalChrome, {
      position: [jBaseX + nx * (shaftLen / 2 + 0.014), jBaseY + ny * (shaftLen / 2 + 0.014), jz],
      rotation: [0, 0, cpSlopeDeg], parent: root,
    });

    createPart(`JoyBall_${pName}`, sphereGeo(0.018, 20, 16), ballMat, {
      position: [jBaseX + nx * (shaftLen + 0.022), jBaseY + ny * (shaftLen + 0.022), jz],
      parent: root,
    });
  }

  const buttonColorsP1 = [
    [btnRed, btnBlue, btnYellow],
    [btnGreen, btnWhite, btnOrange],
  ];
  const buttonColorsP2 = [
    [btnBlue, btnYellow, btnRed],
    [btnWhite, btnGreen, btnOrange],
  ];

  const buttonDefs = [
    { pName: 'P1', centerZ: -0.165, colors: buttonColorsP1 },
    { pName: 'P2', centerZ: 0.165, colors: buttonColorsP2 },
  ];

  for (const bDef of buttonDefs) {
    const { pName, centerZ, colors } = bDef;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const localX = 0.022 - row * 0.036 + (col === 2 ? 0.006 : 0);
        const localZ = 0.052 + col * 0.034;
        const bz = pName === 'P1' ? centerZ + localZ : centerZ - localZ;

        const bx = 0.280 + localX * Math.cos(cpSlopeRad);
        const by = 0.988 + localX * Math.sin(cpSlopeRad) + 0.012;

        createPart(`BtnBezel_${pName}_r${row}_c${col}`, cylinderGeo(0.015, 0.016, 0.007, 20), plasticBlack, {
          position: [bx, by, bz], rotation: [0, 0, cpSlopeDeg], parent: root,
        });

        const plungerMat = colors[row][col];
        createPart(`BtnPlunger_${pName}_r${row}_c${col}`, cylinderGeo(0.011, 0.011, 0.009, 20), plungerMat, {
          position: [bx - 0.002 * Math.sin(cpSlopeRad), by + 0.002 * Math.cos(cpSlopeRad), bz],
          rotation: [0, 0, cpSlopeDeg], parent: root,
        });
      }
    }
  }

  // =========================================================================
  // 8. MONITOR HOUSING, CRT SCREEN (WITH SCANLINES) & REAL GLASS COVER
  // =========================================================================
  const monitorAngleDeg = 73.3;
  const monitorRad = (monitorAngleDeg * Math.PI) / 180;
  const monMidX = 0.100, monMidY = 1.240;

  createPart('MonitorRearChamber', boxGeo(0.412, 0.180, 0.580), woodBlack, {
    position: [monMidX - 0.090 * Math.sin(monitorRad), monMidY - 0.090 * Math.cos(monitorRad), 0],
    rotation: [0, 0, monitorAngleDeg], parent: root,
  });

  createPart('MonitorBezelFrame', boxGeo(0.420, 0.024, 0.588), plasticBlack, {
    position: [monMidX, monMidY, 0], rotation: [0, 0, monitorAngleDeg], parent: root,
  });

  createPart('MonitorBezelInner', boxGeo(0.310, 0.032, 0.410), plasticBlack, {
    position: [monMidX, monMidY, 0], rotation: [0, 0, monitorAngleDeg], parent: root,
  });

  createPart('InstructionStrip', boxGeo(0.050, 0.034, 0.380), btnWhite, {
    position: [monMidX + 0.145 * Math.cos(monitorRad), monMidY - 0.145 * Math.sin(monitorRad), 0],
    rotation: [0, 0, monitorAngleDeg], parent: root,
  });

  const crtGeo = await uv(await roundedBoxGeo(0.270, 0.060, 0.370, 0.018, { style: 'round', segments: 16 }));
  createPart('CRTScreen', crtGeo, crtScreenMat, {
    position: [monMidX - 0.016 * Math.sin(monitorRad), monMidY - 0.016 * Math.cos(monitorRad), 0],
    rotation: [0, 0, monitorAngleDeg], parent: root,
  });

  createPart('MonitorSafetyGlass', boxGeo(0.416, 0.006, 0.584), glass, {
    position: [monMidX + 0.020 * Math.sin(monitorRad), monMidY + 0.012 * Math.cos(monitorRad), 0],
    rotation: [0, 0, monitorAngleDeg], parent: root,
  });

  createPart('GlassRetainerBottom', boxGeo(0.016, 0.020, 0.590), metalCast, {
    position: [0.165, 1.045, 0], parent: root,
  });
  createPart('GlassRetainerTop', boxGeo(0.016, 0.020, 0.590), metalCast, {
    position: [0.045, 1.435, 0], parent: root,
  });

  for (const sz of [-0.22, 0, 0.22]) {
    createPart(`GlassScrew_B_${sz < 0 ? 'L' : sz > 0 ? 'R' : 'M'}`, sphereGeo(0.004, 8, 6), metalChrome, {
      position: [0.174, 1.045, sz], parent: root,
    });
    createPart(`GlassScrew_T_${sz < 0 ? 'L' : sz > 0 ? 'R' : 'M'}`, sphereGeo(0.004, 8, 6), metalChrome, {
      position: [0.054, 1.435, sz], parent: root,
    });
  }

  // =========================================================================
  // 9. SPEAKER GRILLE & AUDIO (CSG SOUND HOLES)
  // =========================================================================
  const baffleMesh = new THREE.Mesh(boxGeo(0.155, 0.018, 0.588), woodBlack);

  const speakerHoleCutters = [];
  for (const zSpeaker of [-0.15, 0.15]) {
    for (let dx = -0.038; dx <= 0.038; dx += 0.018) {
      for (let dz = -0.038; dz <= 0.038; dz += 0.018) {
        if (dx * dx + dz * dz <= 0.042 * 0.042) {
          const cutter = new THREE.Mesh(cylinderGeo(0.0055, 0.0055, 0.040, 10), woodBlack);
          cutter.position.set(dx, 0, zSpeaker + dz);
          speakerHoleCutters.push(cutter);
        }
      }
    }
  }

  const speakerBaffle = await boolDiff('SpeakerBaffle', baffleMesh, ...speakerHoleCutters, { smooth: true });
  speakerBaffle.position.set(0.100, 1.490, 0);
  speakerBaffle.rotation.z = Math.atan2(0.10, 0.12);
  root.add(speakerBaffle);

  const baffleRad = Math.atan2(0.10, 0.12);
  for (const zSpeaker of [-0.15, 0.15]) {
    const sideName = zSpeaker > 0 ? 'R' : 'L';
    const spkX = 0.100 - 0.018 * Math.sin(baffleRad);
    const spkY = 1.490 + 0.018 * Math.cos(baffleRad);

    createPart(`SpeakerBasket_${sideName}`, torusGeo(0.046, 0.004, 8, 20), metalZinc, {
      position: [spkX, spkY, zSpeaker], rotation: [0, 0, baffleRad * 180 / Math.PI + 90], parent: root,
    });
    createPart(`SpeakerCone_${sideName}`, cylinderGeo(0.042, 0.016, 0.018, 20), plasticBlack, {
      position: [spkX, spkY, zSpeaker], rotation: [0, 0, baffleRad * 180 / Math.PI + 90], parent: root,
    });
    createPart(`SpeakerDustCap_${sideName}`, sphereGeo(0.012, 12, 10), metalChrome, {
      position: [spkX + 0.008 * Math.sin(baffleRad), spkY - 0.008 * Math.cos(baffleRad), zSpeaker], parent: root,
    });
  }

  // =========================================================================
  // 10. ILLUMINATED MARQUEE HEADER
  // =========================================================================
  const marqueeAngleDeg = 74.7;
  const marqueeMidX = 0.190, marqueeMidY = 1.650;

  createPart('MarqueeSign', boxGeo(0.226, 0.005, 0.584), marqueeMat, {
    position: [marqueeMidX, marqueeMidY, 0], rotation: [0, 0, marqueeAngleDeg], parent: root,
  });

  createPart('MarqueeFluorescentTube', cylinderZGeo(0.012, 0.012, 0.500, 16), fluorescentMat, {
    position: [0.155, 1.650, 0], parent: root,
  });
  for (const sz of [-0.255, 0.255]) {
    createPart(`TubeSocket_${sz > 0 ? 'R' : 'L'}`, boxGeo(0.024, 0.030, 0.018), btnWhite, {
      position: [0.155, 1.650, sz], parent: root,
    });
  }

  createPart('MarqueeBoxRoof', boxGeo(0.120, 0.018, 0.588), woodBlack, {
    position: [0.160, 1.765, 0], parent: root,
  });
  createPart('MarqueeBoxFloor', boxGeo(0.120, 0.018, 0.588), woodBlack, {
    position: [0.110, 1.545, 0], parent: root,
  });

  createPart('MarqueeRetainerBottom', await roundedBoxGeo(0.018, 0.020, 0.592, 0.003), metalCast, {
    position: [0.160, 1.540, 0], parent: root,
  });
  createPart('MarqueeRetainerTop', await roundedBoxGeo(0.018, 0.020, 0.592, 0.003), metalCast, {
    position: [0.220, 1.760, 0], parent: root,
  });

  for (const sz of [-0.22, 0, 0.22]) {
    createPart(`MarqueeScrew_B_${sz < 0 ? 'L' : sz > 0 ? 'R' : 'M'}`, sphereGeo(0.004, 8, 6), metalChrome, {
      position: [0.170, 1.540, sz], parent: root,
    });
    createPart(`MarqueeScrew_T_${sz < 0 ? 'L' : sz > 0 ? 'R' : 'M'}`, sphereGeo(0.004, 8, 6), metalChrome, {
      position: [0.230, 1.760, sz], parent: root,
    });
  }

  // =========================================================================
  // 11. CABINET ROOF & POWER SWITCH
  // =========================================================================
  createPart('CabinetRoof', boxGeo(0.584, 0.022, 0.590), woodBlack, {
    position: [-0.070, 1.730, 0], rotation: [0, 0, 7.8], parent: root,
  });

  createPart('RoofFanGrille', cylinderGeo(0.065, 0.065, 0.004, 24), metalCast, {
    position: [-0.080, 1.745, 0], parent: root,
  });

  createPart('PowerSwitchBox', await roundedBoxGeo(0.040, 0.025, 0.060, 0.004), metalCast, {
    position: [-0.260, 1.715, 0], parent: root,
  });
  createPart('PowerSwitchRocker', boxGeo(0.022, 0.012, 0.035), btnRed, {
    position: [-0.260, 1.728, 0], rotation: [0, 0, 15], parent: root,
  });

  // =========================================================================
  // 12. REAR PANEL, VENT SLOTS (ARRAYED), SERVICE DOOR & POWER
  // =========================================================================
  createPart('RearWall', boxGeo(0.020, 1.640, 0.590), woodBlack, {
    position: [-0.355, 0.860, 0], parent: root,
  });

  const ventSlot0 = createPart('VentSlot0', await roundedBoxGeo(0.012, 0.010, 0.380, 0.003), metalCast, {
    position: [-0.356, 1.340, 0], parent: root,
  });
  arrayLinear('VentSlot', ventSlot0, 9, [0, 0.026, 0], root);

  createPart('ServiceDoor', await roundedBoxGeo(0.016, 0.820, 0.520, 0.006), woodDoor, {
    position: [-0.360, 0.720, 0], parent: root,
  });

  createPart('ServiceLockBezel', cylinderXGeo(0.012, 0.012, 0.018, 16), metalChrome, {
    position: [-0.368, 1.100, 0], parent: root,
  });
  createPart('ServiceLockCore', cylinderXGeo(0.008, 0.008, 0.020, 12), metalZinc, {
    position: [-0.369, 1.100, 0], parent: root,
  });

  for (const sy of [-0.32, 0.32]) {
    createPart(`ServiceHingeLeaf_${sy > 0 ? 'T' : 'B'}`, boxGeo(0.006, 0.050, 0.040), metalZinc, {
      position: [-0.367, 0.720 + sy, -0.250], parent: root,
    });
    createPart(`ServiceHingePin_${sy > 0 ? 'T' : 'B'}`, cylinderGeo(0.006, 0.006, 0.056, 12), metalCast, {
      position: [-0.368, 0.720 + sy, -0.250], parent: root,
    });
  }

  createPart('ServiceDoorLatch', await roundedBoxGeo(0.014, 0.040, 0.080, 0.005), metalCast, {
    position: [-0.366, 0.720, 0.210], parent: root,
  });

  createPart('PowerInletHousing', await roundedBoxGeo(0.016, 0.050, 0.040, 0.004), plasticBlack, {
    position: [-0.362, 0.160, -0.160], parent: root,
  });
  createPart('PowerStrainRelief', cylinderXGeo(0.010, 0.007, 0.040, 12), rubberBlack, {
    position: [-0.380, 0.160, -0.160], parent: root,
  });
  createPart('PowerCordDrop', cylinderGeo(0.006, 0.006, 0.120, 10), rubberBlack, {
    position: [-0.395, 0.100, -0.160], parent: root,
  });

  for (const sy of [-0.14, 0.14]) {
    createPart(`CordCleat_${sy > 0 ? 'T' : 'B'}`, boxGeo(0.035, 0.020, 0.025), plasticBlack, {
      position: [-0.370, 0.400 + sy, -0.160], parent: root,
    });
  }

  createPart('WarningBadge', boxGeo(0.002, 0.045, 0.075), gameMaterial(0xffcc00, { roughness: 0.4, metalness: 0.05 }), {
    position: [-0.366, 0.240, -0.160], parent: root,
  });

  createPart('SpecBadge', boxGeo(0.002, 0.060, 0.090), metalZinc, {
    position: [-0.366, 1.220, 0.140], parent: root,
  });

  return root;
}
