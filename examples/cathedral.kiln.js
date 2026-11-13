// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// A Gothic cathedral, at dusk, with the lamps lit inside.
//
// Authored by: Claude Opus 5, via Claude Code. Every part below was written by
// the model itself, looking at its own renders through the Kiln tools and
// revising. Not a line of it is hand-authored.
//
// This is the REPETITION example, and it is here because a cathedral is the
// thing a code-first modeller is actually better at than a mouse.
//
// A Gothic building is not a collection of unique shapes. It is one bay,
// resolved once and then repeated with variation: pier, window, flyer,
// pinnacle, cornice, repeat. Every real one was built that way, from templates
// held by a master mason, because that is the only way a workshop of four
// hundred people builds a coherent object over eighty years. In a viewport you
// copy-paste geometry and then discover, three hundred copies later, that the
// sill height was wrong. Written down, the sill height is a number in one
// place. Move BAY and the windows, the piers, the flyers and the pinnacles all
// move with it, because none of them knows where it is -- each one is told.
//
// Three things make this read as a cathedral rather than as a shed with
// pointed windows:
//
//   1. THE ARCH IS EQUILATERAL. Both arcs of a lancet are struck from the
//      opposite springing point at a radius equal to the full span. That is not
//      a stylistic choice, it is the compass construction, and it means an
//      arch's height is not a free parameter -- it falls out of its width, at
//      w * sqrt(3)/2. Every opening here obeys it, which is why they all look
//      like they belong to the same building.
//   2. THE BUTTRESSING IS STRUCTURAL. The flyers land on the clerestory wall
//      where the vault pushes, and the pinnacles are not ornament -- they are
//      dead weight stacked on the pier head to turn the flyer's diagonal thrust
//      down into the pier. That relationship is most of what separates a
//      cathedral silhouette from a castle silhouette.
//   3. THE WEST FRONT IS SYMMETRIC AND THE REST OF THE BUILDING IS NOT. A
//      facade faces the city and the two towers are a pair, so they match:
//      Cologne, Westminster and Notre-Dame all read as one composition for
//      that reason. Two earlier passes here tried to buy character by making
//      the towers differ -- first by leaving one unbuilt with a crane on it,
//      then by giving one a taller crocketed spire and the other a plain lead
//      pyramid. Both produced a building with a good half and a bad half, and
//      the eye goes straight to the bad half every time. Asymmetry has to come
//      from the PLAN instead, where it costs nothing: the crossing fleche
//      stands off the tower axis, the apse is only at the east end, and the
//      aisle bays run a rhythm the front never repeats.
//
// Lighting: it is dusk and the building is lit from inside, so the glass is the
// only emissive thing here. The windows are a small fraction of the elevation,
// so they run HOT -- small area, high intensity, the rule the vending machine
// example sets out. The rose is the exception. It is nearly 8 m across, so it
// runs cooler and takes its punch from the black tracery laid over it.
//
// Known limit: no interior. Every mass is solid and every opening is a recess
// cut about a metre into it with glass at the back. From outside that is the
// same picture as a modelled interior for a fraction of the triangles; walk the
// camera through the west door and there is nothing in there.
const meta = { name: 'Cathedral', category: 'architecture', role: 'hero' };

async function build() {
  const root = createRoot('Cathedral');
  const uv = (g) => autoUnwrap(g, { resolution: 1024 });
  const RAD = Math.PI / 180;

  // ---------- Plan ----------
  // +X is west, so the front faces the camera and the building runs away east.
  const Z_NAVE = 5.5; // nave wall line
  const Z_AISLE = 9.5; // aisle outer wall line
  const Z_PIER = 10.6; // buttress piers, 1.1 m proud of the aisle
  const Z_TRANS = 13.0; // transept gable ends
  const X_WEST = 16.0; // west face
  const X_NAVE = 11.0; // east face of the west block
  const X_CROSS = -11.5; // crossing centre
  const X_EAST = -18.0; // apse springing
  const APSE_R = 7.0;
  const T_HALF = 3.4; // half the transept's depth along X

  // Cornices. A Gothic elevation is three storeys and these are the three.
  const Y_GROUND = 1.0; // top of the podium; everything starts here
  const Y_AISLE = 10.0; // aisle eaves
  const Y_LEAN = 13.8; // where the aisle roof dies into the nave wall
  const Y_CORNICE = 20.5; // nave eaves
  const Y_RIDGE = 27.0; // nave ridge
  const Y_TOWER = 32.0; // tower belfry cornice

  // Five nave bays and one choir bay. The crossing has no bay -- the transept
  // is there. Piers stand on the bay DIVISIONS, not the centres, because that
  // is where a rib vault puts its load.
  const BAYS = [9, 5, 1, -3, -7, -16];
  const PIERS = [7, 3, -1, -5, -18];

  // ---------- The arch ----------
  // An equilateral arch: both arcs at radius = span, struck from the opposite
  // springing point. The profile's sill sits at v = 0, so a window is placed by
  // its sill and its height takes care of itself.
  const lancet = (w, spring, seg = 7) => {
    const hw = w / 2;
    const pts = [
      [-hw, 0],
      [hw, 0],
    ];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * 60 * RAD;
      pts.push([-hw + w * Math.cos(a), spring + w * Math.sin(a)]);
    }
    for (let i = 1; i <= seg; i++) {
      const a = (120 + (i / seg) * 60) * RAD;
      pts.push([hw + w * Math.cos(a), spring + w * Math.sin(a)]);
    }
    return pts;
  };
  const lancetTop = (w, spring) => spring + (w * Math.sqrt(3)) / 2;

  // ---------- Materials ----------
  // Limestone. Two things matter: it is a DIELECTRIC (metalness 0, or the whole
  // building goes to pewter under a low sun), and it is BEDDED. The horizontal
  // courses are what give a 30 m wall its sense of scale; without them the
  // towers read as extruded plastic however good the silhouette is.
  const stoneAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 1024,
    usage: 'albedo',
    name: 'Limestone',
    layers: [
      // Mid-value, not cream. The first pass sat at 0xc9c0ac and the whole
      // west front went flat: four archivolts, eight jamb shafts, a tympanum
      // and a trumeau were all modelled and none of them read, because carving
      // is legible by VALUE and a near-white wall has none left to spend.
      // Two stops down, with the course variance widened to match.
      { op: 'solid', color: 0x9a968c },
      { op: 'noise', colorA: 0x7c786e, colorB: 0xb4b0a6, scale: 9, octaves: 5, seed: 11, blend: 'overlay', opacity: 0.62 },
      // 34 courses over the tile. A mason's joint is a shadow line 5 mm wide,
      // not a drawn stripe -- but at 30 m it is the only thing giving scale.
      { op: 'stripes', colorA: 0x9a968c, colorB: 0x757165, count: 34, angleDeg: 0, blend: 'multiply', opacity: 0.30 },
      { op: 'noise', colorA: 0x6d695f, colorB: 0x9a968c, scale: 42, octaves: 4, seed: 3, blend: 'multiply', opacity: 0.30 },
    ],
  });
  const stone = pbrMaterial({
    albedo: stoneAlbedo,
    normal: normalMapFromHeight(stoneAlbedo, { strength: 0.85 }),
    roughness: 0.86,
    metalness: 0.0,
  });

  // The same stone lower down and wetter. Rain runs off a cathedral in
  // predictable places, and the bottom four metres of one is always darker.
  const stoneWetAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'LimestoneWet',
    layers: [
      { op: 'solid', color: 0x6d6a62 },
      { op: 'noise', colorA: 0x53504a, colorB: 0x827e74, scale: 12, octaves: 5, seed: 27, blend: 'overlay', opacity: 0.60 },
      { op: 'stripes', colorA: 0x6d6a62, colorB: 0x565249, count: 22, angleDeg: 0, blend: 'multiply', opacity: 0.32 },
    ],
  });
  const stoneWet = pbrMaterial({
    albedo: stoneWetAlbedo,
    normal: normalMapFromHeight(stoneWetAlbedo, { strength: 0.75 }),
    roughness: 0.92,
    metalness: 0.0,
  });

  // Lead roofing: rolled sheet, seamed, and dark enough that the roofs read as
  // the negative space the towers stand out of.
  const leadAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'Lead',
    layers: [
      { op: 'solid', color: 0x4a5058 },
      { op: 'stripes', colorA: 0x4a5058, colorB: 0x373d45, count: 40, angleDeg: 90, blend: 'multiply', opacity: 0.45 },
      { op: 'noise', colorA: 0x3a4048, colorB: 0x5b626b, scale: 30, octaves: 4, seed: 9, blend: 'overlay', opacity: 0.35 },
    ],
  });
  const lead = pbrMaterial({
    albedo: leadAlbedo,
    normal: normalMapFromHeight(leadAlbedo, { strength: 0.6 }),
    roughness: 0.58,
    metalness: 0.45,
  });

  // Bright lead for the crossing flèche. This one has been through three
  // hues. Verdigris copper at 0x4f8b78 read as a kelly green party hat behind
  // the gable; toned to 0x4e5f58 it was still the only green thing on a stone
  // and slate building. Then the roof lead was tried, and a steep cone in a
  // dark metal turns into a black spike, because almost none of its faces
  // catch the light -- it went from the wrong hue to the wrong VALUE, which is
  // worse. What a flèche actually is, is new sheet on a roof that is old, so
  // it belongs three stops ABOVE the roof beside it.
  const flecheAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'LeadBright',
    layers: [
      { op: 'solid', color: 0x7f858c },
      { op: 'noise', colorA: 0x6b7178, colorB: 0x959da4, scale: 16, octaves: 5, seed: 41, blend: 'overlay', opacity: 0.55 },
      { op: 'stripes', colorA: 0x7f858c, colorB: 0x6e747b, count: 26, angleDeg: 90, blend: 'multiply', opacity: 0.30 },
    ],
  });
  const flecheLead = pbrMaterial({
    albedo: flecheAlbedo,
    normal: normalMapFromHeight(flecheAlbedo, { strength: 0.55 }),
    roughness: 0.60,
    metalness: 0.40,
  });

  const oak = gameMaterial(0x3b2a1c, { roughness: 0.80, metalness: 0.05 });
  const iron = gameMaterial(0x2a2c30, { roughness: 0.55, metalness: 0.80 });
  const shadow = gameMaterial(0x141210, { roughness: 0.95, metalness: 0.0 });
  // One stop up from `shadow`. A window reveal is a hole and should go black;
  // a blind arcade is a RECESS, and at 0x141210 eleven of them in a row read as
  // a set of teeth bitten out of the front rather than as depth in the wall.
  const recess = gameMaterial(0x342f27, { roughness: 0.95, metalness: 0.0 });
  const plaza = gameMaterial(0x3a3733, { roughness: 0.94, metalness: 0.0 });

  // Glass. Small area, so HOT. THREE hues and no more. An earlier pass had five
  // -- gold, amber, sapphire, ruby, emerald -- and the building read as a
  // stained-glass sampler: a green apse, an orange transept and a rainbow rose
  // all competing at once. The discipline that fixes it is not subtlety, it is
  // ARITHMETIC: warm at the ground where the candles are, cool up at the
  // clerestory where the sky is, and one saturated accent held in reserve.
  const glassGold = gameMaterial(0x8a7040, { emissive: 0xffca6a, emissiveIntensity: 2.8, roughness: 0.40 });
  const glassSapphire = gameMaterial(0x2c3f6b, { emissive: 0x4d86ff, emissiveIntensity: 2.4, roughness: 0.40 });
  const glassRuby = gameMaterial(0x6b2430, { emissive: 0xff3a4e, emissiveIntensity: 2.5, roughness: 0.40 });
  // The rose runs cooler than the lancets: it is 40x their area, and an
  // emissive that size with no GI behind it clips to white long before a
  // lancet does.
  const rose = (m, k) =>
    gameMaterial(m.color.getHex(), { emissive: m.emissive.getHex(), emissiveIntensity: k, roughness: 0.42 });
  const roseSapphire = rose(glassSapphire, 1.15);
  const roseRuby = rose(glassRuby, 1.00);
  const roseEye = rose(glassGold, 1.60);

  // ---------- Helpers ----------
  const slab = (name, w, h, d, position, mat, opts = {}) =>
    createPart(name, boxGeo(w, h, d), mat, {
      position,
      rotation: opts.rotation,
      parent: opts.parent ?? root,
    });
  const solid = (geo, mat = stone) => new THREE.Mesh(geo, mat);

  // A lancet prism, oriented to cut a wall whose normal runs along Z or X.
  // extrudeProfile on axis 'z' maps the profile's (u, v) straight to (x, y),
  // which is what a Z-facing wall wants. An X-facing wall is the same prism
  // turned a quarter turn about Y: local +X lands on world -Z, and the
  // extrusion (local +Z) lands on world +X.
  const lancetPrism = async (w, spring, depth, facing) => {
    const m = solid(await extrudeProfile(lancet(w, spring), { depth, axis: 'z' }));
    if (facing === 'x') m.rotation.y = Math.PI / 2;
    return m;
  };

  // ---------- Ground ----------
  slab('Plaza', 54, 0.4, 38, [-5, 0.2, 0], plaza);
  slab('Podium', 46, 0.6, 30, [-5, 0.7, 0], stoneWet);
  for (let i = 0; i < 3; i++) {
    slab(`Step_${i}`, 0.8, 0.22 * (3 - i), 15.0 - i * 0.8, [16.4 + i * 0.8, 0.4 + 0.11 * (3 - i), 0], stoneWet);
  }

  // ---------- Nave and aisles ----------
  // Everything is solid; see the known limit in the header. REVEAL is how deep
  // an opening is cut into a wall, and the glass goes at the back of the cut.
  const REVEAL = 1.15;
  // ...but the GLASS does not go to the back of the cut. A window set a metre
  // inside a wall is a window you cannot see: at the 55-degree azimuth a hero
  // shot is taken from, a 1.15 m reveal occludes 1.6 m of a 2.4 m opening and
  // every lancet on the flank goes black. The reveal is deep for the SHADOW it
  // casts on the elevation; the glass sits 0.35 m in, which is where a real
  // one is -- the splay that makes the wall look thick is on the inside, where
  // nobody outside is looking.
  const GLAZE = 0.35;

  const naveCutters = [];
  for (const bx of BAYS) {
    for (const sz of [1, -1]) {
      const c = await lancetPrism(2.8, 3.0, REVEAL * 2, 'z');
      c.position.set(bx, 14.5, sz * Z_NAVE);
      naveCutters.push(c);
    }
  }
  const naveBody = solid(boxGeo(X_NAVE - X_EAST, Y_CORNICE - Y_GROUND, Z_NAVE * 2));
  naveBody.position.set((X_NAVE + X_EAST) / 2, (Y_CORNICE + Y_GROUND) / 2, 0);
  const naveMass = await boolDiff('NaveWall', naveBody, ...naveCutters);
  naveMass.geometry = await uv(naveMass.geometry);
  root.add(naveMass);

  for (const sz of [1, -1]) {
    const cutters = [];
    for (const bx of BAYS) {
      const c = await lancetPrism(2.4, 2.5, REVEAL * 2, 'z');
      c.position.set(bx, 3.5, sz * Z_AISLE);
      cutters.push(c);
    }
    const body = solid(boxGeo(X_NAVE - X_EAST, Y_AISLE - Y_GROUND, Z_AISLE - Z_NAVE));
    body.position.set((X_NAVE + X_EAST) / 2, (Y_AISLE + Y_GROUND) / 2, (sz * (Z_AISLE + Z_NAVE)) / 2);
    const m = await boolDiff(`Aisle_${sz > 0 ? 'S' : 'N'}`, body, ...cutters);
    m.geometry = await uv(m.geometry);
    root.add(m);
  }

  // Glass and tracery at the back of every recess. A window is glass plus a
  // MULLION plus a transom: an undivided sheet of light reads as a hole in the
  // wall, and the bars are what make it read as a window.
  const glazeZ = async (name, w, spring, sillY, x, z, mat) => {
    const inner = w - 0.34;
    createPart(name, await uv(await extrudeProfile(lancet(inner, spring), { depth: 0.10, axis: 'z' })), mat, {
      position: [x, sillY, z],
      parent: root,
    });
    const top = lancetTop(inner, spring);
    slab(`${name}_Mullion`, 0.13, top - 0.25, 0.16, [x, sillY + (top - 0.25) / 2, z], stone);
    slab(`${name}_Transom`, inner - 0.1, 0.13, 0.16, [x, sillY + spring * 0.62, z], stone);
  };

  for (const bx of BAYS) {
    for (const sz of [1, -1]) {
      const tag = `${bx < 0 ? 'e' : 'w'}${Math.abs(bx)}${sz > 0 ? 'S' : 'N'}`;
      // A dark plate at the back of each cut, so the glass is never silhouetted
      // against raw daylight-coloured stone.
      slab(`ClerRev_${tag}`, 3.2, 6.4, 0.10, [bx, 17.6, sz * (Z_NAVE - GLAZE - 0.07)], shadow);
      await glazeZ(`ClerGlass_${tag}`, 2.8, 3.0, 14.5, bx, sz * (Z_NAVE - GLAZE), glassSapphire);
      slab(`AisleRev_${tag}`, 2.8, 5.6, 0.10, [bx, 6.0, sz * (Z_AISLE - GLAZE - 0.07)], shadow);
      await glazeZ(`AisleGlass_${tag}`, 2.4, 2.5, 3.5, bx, sz * (Z_AISLE - GLAZE), glassGold);
    }
  }

  // ---------- Transept ----------
  const T_RUN = T_HALF + 0.4;
  const naveRun = Z_NAVE + 0.6;
  const naveRise = Y_RIDGE - Y_CORNICE;
  const naveSlope = Math.atan2(naveRise, naveRun);
  const T_RISE = T_RUN * Math.tan(naveSlope); // same pitch, narrower span, lower ridge

  for (const sz of [1, -1]) {
    const tag = sz > 0 ? 'S' : 'N';
    const zEnd = sz * Z_TRANS;
    const cz = (sz * (Z_TRANS + Z_NAVE)) / 2;
    // Cut, like the nave and the aisles. The first pass built this arm as a
    // plain slab and then placed its window inside it, which sealed the glass
    // in solid stone -- the same mistake the vending machine's display made,
    // and just as invisible until you look at the elevation it faces.
    {
      const body = solid(boxGeo(T_HALF * 2, Y_CORNICE - Y_GROUND, Z_TRANS - Z_NAVE));
      body.position.set(X_CROSS, (Y_CORNICE + Y_GROUND) / 2, cz);
      const win = await lancetPrism(3.6, 4.0, REVEAL * 2, 'z');
      win.position.set(X_CROSS, 8.8, zEnd);
      const wheel = solid(cylinderZGeo(1.68, 1.68, REVEAL * 2, 20));
      wheel.position.set(X_CROSS, 18.3, zEnd);
      const m = await boolDiff(`Transept_${tag}`, body, win, wheel);
      m.geometry = await uv(m.geometry);
      root.add(m);
    }
    createPart(
      `TranseptGable_${tag}`,
      await uv(
        await extrudeProfile(
          [
            [-T_HALF, 0],
            [T_HALF, 0],
            [0, T_RISE],
          ],
          { depth: 1.0, axis: 'z' },
        ),
      ),
      stone,
      { position: [X_CROSS, Y_CORNICE, zEnd - sz * 0.5], parent: root },
    );

    // The end front: a triplet under a wheel window. The wheel lies in XY,
    // which is the plane a Z-facing wall lives in, so torusGeo needs no
    // rotation at all and cylinderZGeo is the disc that fits behind it.
    slab(`TranseptRev_${tag}`, 4.0, 7.6, 0.10, [X_CROSS, 12.4, sz * (Z_TRANS - GLAZE - 0.07)], shadow);
    createPart(
      `TranseptGlass_${tag}`,
      await uv(await extrudeProfile(lancet(3.6, 4.0), { depth: 0.10, axis: 'z' })),
      glassGold,
      { position: [X_CROSS, 8.8, sz * (Z_TRANS - GLAZE)], parent: root },
    );
    slab(`TranseptMullion_${tag}`, 0.16, 6.8, 0.14, [X_CROSS, 12.0, sz * (Z_TRANS - GLAZE + 0.07)], stone);
    createPart(`TranseptWheel_${tag}`, cylinderZGeo(1.5, 1.5, 0.12, 20), glassRuby, {
      position: [X_CROSS, 18.3, sz * (Z_TRANS - GLAZE + 0.06)],
      parent: root,
    });
    for (let i = 0; i < 6; i++) {
      slab(`TranseptSpoke_${tag}_${i}`, 0.16, 3.1, 0.16, [X_CROSS, 18.3, sz * (Z_TRANS - GLAZE + 0.14)], stone, {
        rotation: [0, 0, i * 30],
      });
    }
    createPart(`TranseptRing_${tag}`, torusGeo(1.62, 0.17, 6, 24), stone, {
      position: [X_CROSS, 18.3, sz * (Z_TRANS - GLAZE + 0.14)],
      parent: root,
    });
  }

  // ---------- Apse ----------
  // A half-octagon drum, the western half of it buried in the choir -- which is
  // how a real chevet meets its straight bays. The -22.5 turn puts a facet
  // CENTRE on the building's axis instead of an edge; with an edge on the axis
  // the east end comes to a point like a boat.
  // The drum's apothem, not its radius: an octagon's flat face is R*cos(22.5)
  // from the centre, and putting a window at R buries it 0.53 m inside the wall.
  const APSE_FACE = APSE_R * Math.cos(22.5 * RAD);
  const APSE_DIRS = [-1, 0, 1].map((i) => 180 + i * 45);
  {
    const drum = solid(cylinderGeo(APSE_R, APSE_R, Y_CORNICE - Y_GROUND, 8));
    drum.position.set(X_EAST, (Y_CORNICE + Y_GROUND) / 2, 0);
    drum.rotation.y = -22.5 * RAD;
    const cutters = [];
    for (const a of APSE_DIRS) {
      const c = await lancetPrism(2.4, 4.2, REVEAL * 2, 'z');
      c.rotation.y = (90 - a) * RAD;
      c.position.set(X_EAST + Math.cos(a * RAD) * APSE_FACE, 6.2, Math.sin(a * RAD) * APSE_FACE);
      cutters.push(c);
    }
    const m = await boolDiff('Apse', drum, ...cutters);
    m.geometry = await uv(m.geometry);
    root.add(m);
  }
  for (let i = 0; i < APSE_DIRS.length; i++) {
    const a = APSE_DIRS[i];
    const nx = Math.cos(a * RAD);
    const nz = Math.sin(a * RAD);
    const r = APSE_FACE - GLAZE;
    // Sized to the opening. A reveal plate three metres taller than the window
    // it backs is not a reveal, it is a black rectangle on the elevation.
    slab(`ApseRev_${i}`, 0.14, 7.0, 2.8, [X_EAST + nx * (r - 0.07), 9.4, nz * (r - 0.07)], shadow, {
      rotation: [0, -a, 0],
    });
    createPart(
      `ApseGlass_${i}`,
      await uv(await extrudeProfile(lancet(2.06, 4.2), { depth: 0.12, axis: 'z' })),
      glassGold,
      { position: [X_EAST + nx * r, 6.2, nz * r], rotation: [0, 90 - a, 0], parent: root },
    );
  }
  createPart('ApseRoof', await uv(coneGeo(APSE_R + 0.7, 6.8, 8)), lead, {
    position: [X_EAST, Y_CORNICE + 3.4, 0],
    rotation: [0, -22.5, 0],
    parent: root,
  });

  // ---------- Roofs ----------
  // A slab rotated about X by +t drops its +Z edge, so the south slope takes a
  // positive angle and the north slope a negative one.
  const naveLen = Math.hypot(naveRun, naveRise);
  for (const sz of [1, -1]) {
    slab(`NaveRoof_${sz > 0 ? 'S' : 'N'}`, X_NAVE - X_EAST + 0.5, 0.4, naveLen, [
      (X_NAVE + X_EAST) / 2,
      Y_CORNICE + naveRise / 2,
      (sz * naveRun) / 2,
    ], lead, { rotation: [(sz * naveSlope) / RAD, 0, 0] });
  }
  slab('NaveRidge', X_NAVE - X_EAST + 0.5, 0.36, 0.8, [(X_NAVE + X_EAST) / 2, Y_RIDGE + 0.12, 0], lead);

  // Aisles: a lean-to from the aisle eaves into the nave wall, broken at the
  // crossing because the transept is there.
  const leanRun = Z_AISLE - Z_NAVE + 0.5;
  const leanRise = Y_LEAN - Y_AISLE;
  const leanLen = Math.hypot(leanRun, leanRise);
  const leanSlope = Math.atan2(leanRise, leanRun) / RAD;
  const leanRuns = [
    [X_NAVE + 0.2, X_CROSS + T_HALF + 0.4],
    [X_CROSS - T_HALF - 0.4, X_EAST - 0.2],
  ];
  for (const sz of [1, -1]) {
    for (let i = 0; i < leanRuns.length; i++) {
      const [x0, x1] = leanRuns[i];
      slab(`AisleRoof_${sz > 0 ? 'S' : 'N'}${i}`, x0 - x1, 0.35, leanLen, [
        (x0 + x1) / 2,
        (Y_AISLE + Y_LEAN) / 2,
        sz * (Z_NAVE + leanRun / 2 - 0.25),
      ], lead, { rotation: [sz * leanSlope, 0, 0] });
    }
  }

  // Transept: the same pitch turned across the nave. Rotating about Z lifts the
  // +X edge, so the west slope takes a negative angle.
  const tLen = Math.hypot(T_RUN, T_RISE);
  for (const sz of [1, -1]) {
    for (const dx of [1, -1]) {
      slab(`TranseptRoof_${sz > 0 ? 'S' : 'N'}${dx > 0 ? 'w' : 'e'}`, tLen, 0.36, Z_TRANS - Z_NAVE + 1.0, [
        X_CROSS + (dx * T_RUN) / 2,
        Y_CORNICE + T_RISE / 2,
        (sz * (Z_TRANS + Z_NAVE)) / 2,
      ], lead, { rotation: [0, 0, (-dx * naveSlope) / RAD] });
    }
  }

  // ---------- Flying buttresses ----------
  // Pier, flyer and pinnacle are one assembly, built once and placed ten times.
  // The flyer's section is the honest one: a curved intrados carrying the load
  // and a STRAIGHT extrados above it, because the top of a flyer is a gutter
  // and the water has to run off it.
  const flyProfile = () => {
    const z0 = Z_NAVE + 0.4;
    const z1 = Z_PIER - 0.5;
    const y0 = 17.9;
    const y1 = 14.6;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([z0 + (z1 - z0) * t, y0 + (y1 - y0) * t - 1.15 * Math.sin(Math.PI * t)]);
    }
    pts.push([z1, y1 + 1.45]);
    pts.push([z0, y0 + 2.05]);
    return pts;
  };
  const flyGeo = await uv(await extrudeProfile(flyProfile(), { depth: 0.75, axis: 'z' }));
  const pinnacleGeo = await uv(
    await revolveProfile(
      [
        [0.0, 0.0],
        [0.80, 0.0],
        [0.80, 1.1],
        [0.64, 1.4],
        [0.64, 1.8],
        [0.0, 5.6],
      ],
      { segments: 8, axis: 'y' },
    ),
  );

  let flySource = null;
  let pinSource = null;
  for (const px of PIERS) {
    for (const sz of [1, -1]) {
      const tag = `${px < 0 ? 'e' : 'w'}${Math.abs(px)}${sz > 0 ? 'S' : 'N'}`;
      const pz = sz * (Z_PIER - 0.3);
      // Three stages, each set back from the one below: that is how a buttress
      // sheds water, and it is what makes it read at thirty metres.
      slab(`PierBase_${tag}`, 2.1, 4.2, 2.9, [px, Y_GROUND + 2.1, pz], stoneWet);
      slab(`PierSet_${tag}`, 1.9, 0.5, 2.7, [px, Y_GROUND + 4.3, pz], stone);
      slab(`Pier_${tag}`, 1.7, 15.5, 2.4, [px, Y_GROUND + 7.75, pz], stone);
      slab(`PierCap_${tag}`, 2.0, 0.55, 2.7, [px, 16.9, pz], stone);
      createPart(`PierWeather_${tag}`, coneGeo(1.5, 1.5, 4), stone, {
        position: [px, 17.7, pz],
        rotation: [0, 45, 0],
        parent: root,
      });

      // Dead weight on the pier head, not ornament. See the header.
      if (!pinSource) pinSource = createPart(`Pinnacle_${tag}`, pinnacleGeo, stone, { position: [px, 17.4, pz], parent: root });
      else createInstance(`Pinnacle_${tag}`, pinSource, { position: [px, 17.4, pz], parent: root });

      // The flyer, built in the (z, y) plane and turned a quarter turn -- the
      // same trick as the window prisms.
      // A quarter turn about Y sends the profile's u to world -z, so the
      // SOUTH flyer takes the negative rotation. The first pass had these the
      // other way round and every flyer sprang from the pier on the far side.
      const opts = { position: [px, 0, 0], rotation: [0, sz > 0 ? -90 : 90, 0], parent: root };
      if (!flySource) flySource = createPart(`Flyer_${tag}`, flyGeo, stone, opts);
      else createInstance(`Flyer_${tag}`, flySource, opts);
    }
  }

  // ---------- West front ----------
  const westCutters = [];
  const portal = await lancetPrism(6.4, 5.6, 5.0, 'x');
  portal.position.set(X_WEST, Y_GROUND + 0.3, 0);
  westCutters.push(portal);
  const roseHole = solid(cylinderXGeo(3.8, 3.8, 6.0, 24));
  roseHole.position.set(X_WEST, 21.0, 0);
  westCutters.push(roseHole);
  const westBody = solid(boxGeo(X_WEST - 0.002 - 10.2, 26.0 - Y_GROUND, Z_NAVE * 2 + 0.2));
  westBody.position.set((X_WEST - 0.002 + 10.2) / 2, (26.0 + Y_GROUND) / 2, 0);
  const westMass = await boolDiff('WestFront', westBody, ...westCutters);
  westMass.geometry = await uv(westMass.geometry);
  root.add(westMass);

  // The rose. A big emissive disc would be a white hole in the front of the
  // building; what makes a rose read is the STONE laid over it, so the glass
  // runs cool and the tracery does the work.
  //
  // The first pass got the geometry wrong in a way worth recording: twelve
  // wedges running centre-to-rim, hues cycling round them. That is a parasol,
  // not a window. A rose is built as concentric RINGS of small lights, each
  // ring separated from the next by stone, because the tracery is what carries
  // the load -- the glass is only filling what the mason left. So: sixteen
  // lights in the outer ring, eight inside it, one eye at the centre, and
  // eight full-diameter bars whose sixteen arms land exactly on the outer
  // ring's joints. Blue outside, red inside, gold only in the eye.
  {
    const RX = X_WEST - 0.55;
    // An annular sector: out along one radius, round at r1, back at r0.
    const ringPane = (i, count, r0, r1) => {
      const step = 360 / count;
      const a0 = (i * step + step * 0.15) * RAD;
      const a1 = ((i + 1) * step - step * 0.15) * RAD;
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const a = a0 + ((a1 - a0) * k) / 5;
        pts.push([Math.cos(a) * r1, Math.sin(a) * r1]);
      }
      for (let k = 5; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / 5;
        pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
      }
      return pts;
    };
    for (let i = 0; i < 16; i++) {
      createPart(
        `RoseOuter_${i}`,
        await uv(await extrudeProfile(ringPane(i, 16, 2.55, 3.45), { depth: 0.14, axis: 'z' })),
        i % 4 === 2 ? roseRuby : roseSapphire,
        { position: [RX, 21.0, 0], rotation: [0, 90, 0], parent: root },
      );
    }
    for (let i = 0; i < 8; i++) {
      createPart(
        `RoseInner_${i}`,
        await uv(await extrudeProfile(ringPane(i, 8, 1.10, 1.95), { depth: 0.14, axis: 'z' })),
        roseRuby,
        { position: [RX, 21.0, 0], rotation: [0, 90, 0], parent: root },
      );
    }
    createPart('RoseHub', cylinderXGeo(0.62, 0.62, 0.30, 16), roseEye, { position: [RX + 0.12, 21.0, 0], parent: root });
    // The spokes are boxes standing on their long Y axis, swung about X --
    // which is the rose's own axis, so no second rotation is needed. Eight
    // bars, 22.5 degrees apart, give sixteen arms: one per outer joint.
    for (let i = 0; i < 8; i++) {
      slab(`RoseSpoke_${i}`, 0.26, 7.2, 0.28, [RX + 0.22, 21.0, 0], stoneWet, { rotation: [i * 22.5, 0, 0] });
    }
    createPart('RoseRingInner', torusGeo(1.15, 0.22, 6, 20), stone, { position: [RX + 0.26, 21.0, 0], rotation: [0, 90, 0], parent: root });
    createPart('RoseRingMid', torusGeo(2.35, 0.20, 6, 28), stone, { position: [RX + 0.26, 21.0, 0], rotation: [0, 90, 0], parent: root });
    createPart('RoseRingOuter', torusGeo(3.8, 0.42, 8, 32), stone, { position: [RX + 0.32, 21.0, 0], rotation: [0, 90, 0], parent: root });
  }

  // The great door. Recessed orders are the whole point of a Gothic portal: one
  // flat arch reads as a hole punched in a wall, four stepped ones read as a
  // doorway you could walk through.
  {
    for (let i = 0; i < 4; i++) {
      const w = 6.4 - i * 0.44;
      const band = await boolDiff(
        `Archivolt_${i}`,
        await lancetPrism(w, 5.6, 0.50, 'x'),
        await lancetPrism(w - 0.48, 5.6, 0.9, 'x'),
      );
      band.geometry = await uv(band.geometry);
      band.position.set(X_WEST - 0.22 - i * 0.55, Y_GROUND + 0.3, 0);
      root.add(band);
    }
    slab('Tympanum', 0.35, 3.0, 4.6, [X_WEST - 2.35, Y_GROUND + 7.2, 0], stoneWet);
    slab('Lintel', 0.55, 0.55, 4.9, [X_WEST - 2.25, Y_GROUND + 5.5, 0], stone);
    slab('Trumeau', 0.7, 5.4, 0.6, [X_WEST - 2.25, Y_GROUND + 2.8, 0], stone);
    for (const s of [1, -1]) {
      slab(`Door_${s > 0 ? 'a' : 'b'}`, 0.22, 5.2, 1.85, [X_WEST - 2.4, Y_GROUND + 2.75, s * 1.1], oak);
      for (let i = 0; i < 3; i++) {
        slab(`DoorBand_${s > 0 ? 'a' : 'b'}${i}`, 0.1, 0.18, 1.75, [X_WEST - 2.5, Y_GROUND + 1.2 + i * 1.7, s * 1.1], iron);
      }
      // Jamb shafts. Eight thin columns are the cheapest thing on this model
      // and they are what make the doorway look carved rather than punched.
      for (let i = 0; i < 4; i++) {
        createPart(`Jamb_${s > 0 ? 'a' : 'b'}${i}`, cylinderGeo(0.19, 0.19, 5.2, 8), stone, {
          position: [X_WEST - 0.45 - i * 0.55, Y_GROUND + 3.0, s * (2.95 + i * 0.24)],
          parent: root,
        });
      }
    }
  }

  createPart(
    'PortalGable',
    await uv(await extrudeProfile([[-3.9, 0], [3.9, 0], [0, 3.0]], { depth: 0.7, axis: 'z' })),
    stone,
    { position: [X_WEST - 0.35, Y_GROUND + 11.4, 0], rotation: [0, 90, 0], parent: root },
  );
  slab('WestString', 0.5, 0.5, Z_NAVE * 2 + 0.4, [X_WEST - 0.05, Y_GROUND + 11.2, 0], stone);

  // The gallery: a blind arcade across the front between the door and the rose.
  // One arch, built once, placed eleven times.
  {
    // Eleven arches at 1.0 m across a 1.15 m opening left 0.15 m of stone
    // between them, and the whole band collapsed into one dark stripe. Nine at
    // 1.22 across 0.88 leaves 0.34 -- a third of the opening -- which is what
    // makes the rhythm read as columns rather than as a gap.
    let arcSource = null;
    const arcGeo = await uv(await extrudeProfile(lancet(0.88, 1.7), { depth: 0.4, axis: 'z' }));
    for (let i = 0; i < 9; i++) {
      const z = -4.88 + i * 1.22;
      const opts = { position: [X_WEST - 0.15, 13.6, z], rotation: [0, 90, 0], parent: root };
      if (!arcSource) arcSource = createPart(`Gallery_${i}`, arcGeo, recess, opts);
      else createInstance(`Gallery_${i}`, arcSource, opts);
      slab(`GalleryShaft_${i}`, 0.46, 3.4, 0.30, [X_WEST - 0.02, 13.2, z - 0.61], stone);
    }
    slab('GalleryShaft_end', 0.46, 3.4, 0.30, [X_WEST - 0.02, 13.2, 4.88 + 0.61], stone);
    slab('GallerySill', 0.6, 0.45, 11.4, [X_WEST - 0.12, 13.2, 0], stone);
    slab('GalleryCap', 0.6, 0.45, 11.4, [X_WEST - 0.12, 16.8, 0], stone);
  }

  slab('WestCornice', 0.9, 0.6, Z_NAVE * 2 + 1.4, [X_WEST - 0.1, 26.2, 0], stone);
  createPart(
    'WestGable',
    await uv(
      await extrudeProfile(
        [
          [-5.6, 0],
          [5.6, 0],
          [0, 4.6],
        ],
        { depth: 2.2, axis: 'z' },
      ),
    ),
    stone,
    { position: [X_WEST - 1.1, 26.5, 0], rotation: [0, 90, 0], parent: root },
  );
  createPart('GableFinial', await uv(coneGeo(0.6, 2.8, 6)), stone, { position: [X_WEST - 1.1, 32.0, 0], parent: root });

  // ---------- Towers ----------
  // One tower, cut once for its belfry openings, then placed twice. The
  // openings sit on all four faces, so the same solid serves both sides.
  const TOWER_HALF = 2.8;
  const TOWER_Z = 8.3;
  const TOWER_X = X_WEST - TOWER_HALF;
  const BELFRY_SILL = 23.5;
  const BELFRY_H = lancetTop(1.5, 3.0);
  const belfryCut = [];
  for (const face of ['x', 'z']) {
    for (const s of [1, -1]) {
      for (const off of [-1.0, 1.0]) {
        const c = await lancetPrism(1.5, 3.0, 3.4, face);
        const local = BELFRY_SILL - (Y_TOWER + Y_GROUND) / 2;
        if (face === 'x') c.position.set(s * TOWER_HALF, local, off);
        else c.position.set(off, local, s * TOWER_HALF);
        belfryCut.push(c);
      }
    }
  }
  const towerSolid = await boolDiff(
    'Tower',
    solid(boxGeo(TOWER_HALF * 2, Y_TOWER - Y_GROUND, TOWER_HALF * 2)),
    ...belfryCut,
  );
  towerSolid.geometry = await uv(towerSolid.geometry);

  for (const sz of [1, -1]) {
    const tag = sz > 0 ? 'S' : 'N';
    const tz = sz * TOWER_Z;
    createInstance(`Tower_${tag}`, towerSolid, {
      position: [TOWER_X, (Y_TOWER + Y_GROUND) / 2, tz],
      parent: root,
    });
    // A belfry is OPEN, so its openings are dark, not lit. This is the one
    // place on the building where a hole must not glow.
    for (const face of ['x', 'z']) {
      for (const s of [1, -1]) {
        for (const off of [-1.0, 1.0]) {
          const at = face === 'x'
            ? [TOWER_X + s * (TOWER_HALF - 0.45), BELFRY_SILL + BELFRY_H / 2, tz + off]
            : [TOWER_X + off, BELFRY_SILL + BELFRY_H / 2, tz + s * (TOWER_HALF - 0.45)];
          slab(`Belfry_${tag}${face}${s > 0 ? 'p' : 'n'}${off > 0 ? 'a' : 'b'}`,
            face === 'x' ? 0.2 : 1.4, BELFRY_H, face === 'x' ? 1.4 : 0.2, at, shadow);
        }
      }
    }
    // Corner buttresses clasping the angles. Every real tower has them, and
    // they are most of what stops a tower reading as a chimney.
    for (const cx of [1, -1]) {
      for (const cz of [1, -1]) {
        const bx = TOWER_X + cx * TOWER_HALF;
        const bz = tz + cz * TOWER_HALF;
        slab(`TowerButBase_${tag}${cx > 0 ? 'p' : 'n'}${cz > 0 ? 'p' : 'n'}`, 1.9, 4.6, 1.9, [bx, Y_GROUND + 2.3, bz], stoneWet);
        slab(`TowerBut_${tag}${cx > 0 ? 'p' : 'n'}${cz > 0 ? 'p' : 'n'}`, 1.5, Y_TOWER - Y_GROUND - 2.0, 1.5, [
          bx,
          (Y_TOWER + Y_GROUND) / 2 - 1.0,
          bz,
        ], stone);
      }
    }
    for (const sy of [12.2, 18.4, 22.6]) {
      slab(`TowerString_${tag}_${sy}`, 6.6, 0.45, 6.6, [TOWER_X, sy, tz], stone);
    }
    slab(`TowerCornice_${tag}`, 7.2, 0.7, 7.2, [TOWER_X, Y_TOWER, tz], stone);
  }

  // ---------- Tower crowns ----------
  // One crown, placed on both towers. Everything above the belfry cornice is a
  // second campaign: a parapet with pinnacles at its corners, a pierced
  // octagonal lantern, then the spire. See principle 3 -- the two towers are a
  // pair and are built as one.
  //
  // The lantern's openings are CUT, for the same reason every other opening on
  // this building is: a drum with window plates stuck on its faces is a drum
  // with pictures of windows on it, and it reads as one the moment the light
  // moves. Rotating the octagon by -22.5 puts a face CENTRE on each cardinal
  // azimuth, so the eight face normals land on multiples of 45 degrees, and a
  // cutter driven through the middle takes out the near face and the far one
  // together -- four of them do all eight lights.
  const LANT_R = 2.85;
  const LANT_H = 5.0;
  const LANT_Y0 = Y_TOWER + 2.35;
  const SP_R = 2.55;
  const SP_H = 14.0;
  const SP_Y0 = LANT_Y0 + LANT_H + 0.8;

  for (const csz of [1, -1]) {
    const tag = csz > 0 ? 'S' : 'N';
    const tz = csz * TOWER_Z;

    slab(`ParapetDeck_${tag}`, 6.6, 0.4, 6.6, [TOWER_X, Y_TOWER + 0.55, tz], stoneWet);
    for (const [ox, oz, w, d] of [
      [0, 3.2, 7.0, 0.6],
      [0, -3.2, 7.0, 0.6],
      [3.2, 0, 0.6, 7.0],
      [-3.2, 0, 0.6, 7.0],
    ]) {
      const px = ox > 0 ? 'p' : ox < 0 ? 'n' : 'c';
      const pz = oz > 0 ? 'p' : oz < 0 ? 'n' : 'c';
      slab(`Parapet_${tag}${px}${pz}`, w - (ox === 0 ? 0 : 0.004), 2.0 - (ox === 0 ? 0 : 0.004), d - (ox === 0 ? 0 : 0.004), [TOWER_X + ox, Y_TOWER + 1.35, tz + oz], stone);
    }
    for (const cx of [1, -1]) {
      for (const cz of [1, -1]) {
        createInstance(`TowerPinnacle_${tag}${cx > 0 ? 'p' : 'n'}${cz > 0 ? 'p' : 'n'}`, pinSource, {
          position: [TOWER_X + cx * 3.2, Y_TOWER + 2.2, tz + cz * 3.2],
          parent: root,
        });
      }
    }

    const lantern = solid(cylinderGeo(LANT_R, LANT_R, LANT_H, 8));
    lantern.position.set(TOWER_X, LANT_Y0 + LANT_H / 2, tz);
    lantern.rotation.y = -22.5 * RAD;
    const lantCut = [];
    for (let k = 0; k < 4; k++) {
      const a = k * 45;
      const cut = solid(await extrudeProfile(lancet(1.55, 1.85), { depth: LANT_R * 2.4, axis: 'z' }));
      cut.position.set(TOWER_X, LANT_Y0 + 0.95, tz);
      cut.rotation.y = (90 - a) * RAD;
      lantCut.push(cut);
    }
    const lanternMass = await boolDiff(`Lantern_${tag}`, lantern, ...lantCut);
    lanternMass.geometry = await uv(lanternMass.geometry);
    root.add(lanternMass);
    // A belfry is open, so what stands behind its lights is the dark of the
    // bell chamber. Same rule as the openings in the tower shaft below.
    createPart(`LanternDark_${tag}`, cylinderGeo(2.34, 2.34, LANT_H - 0.5, 8), shadow, {
      position: [TOWER_X, LANT_Y0 + LANT_H / 2, tz],
      rotation: [0, -22.5, 0],
      parent: root,
    });
    // Colonnettes on the arrises, which sit at 22.5 + k*45 -- between the
    // faces, not on them.
    for (let k = 0; k < 8; k++) {
      const a = (22.5 + k * 45) * RAD;
      createPart(`LanternShaft_${tag}${k}`, cylinderGeo(0.20, 0.20, LANT_H, 6), stone, {
        position: [TOWER_X + Math.cos(a) * LANT_R, LANT_Y0 + LANT_H / 2, tz + Math.sin(a) * LANT_R],
        parent: root,
      });
    }

    // The spire is stone, not lead. A lead spire on one tower and a stone one
    // on the other was the single ugliest thing on this model: the pair read as
    // two buildings that happened to touch.
    createPart(`SpireCornice_${tag}`, await uv(cylinderGeo(2.95, 3.15, 0.8, 8)), stone, {
      position: [TOWER_X, SP_Y0 - 0.4, tz],
      rotation: [0, -22.5, 0],
      parent: root,
    });
    createPart(`Spire_${tag}`, await uv(coneGeo(SP_R, SP_H, 8)), stone, {
      position: [TOWER_X, SP_Y0 + SP_H / 2, tz],
      rotation: [0, -22.5, 0],
      parent: root,
    });

    // Lucarnes at the spire foot: the little gabled dormers that let a mason
    // out onto the stonework. Four, on the cardinal faces.
    for (const a of [0, 90, 180, 270]) {
      const rad = a * RAD;
      const at = (r) => [TOWER_X + Math.cos(rad) * r, SP_Y0 + 0.95, tz + Math.sin(rad) * r];
      createPart(
        `Lucarne_${tag}${a}`,
        await uv(
          await extrudeProfile(
            [
              [-0.52, 0],
              [0.52, 0],
              [0.52, 0.62],
              [0, 1.30],
              [-0.52, 0.62],
            ],
            { depth: 0.72, axis: 'z' },
          ),
        ),
        stone,
        { position: at(2.10), rotation: [0, 90 - a, 0], parent: root },
      );
      createPart(
        `LucarneLight_${tag}${a}`,
        await uv(await extrudeProfile(lancet(0.40, 0.34), { depth: 0.10, axis: 'z' })),
        recess,
        { position: at(2.47), rotation: [0, 90 - a, 0], parent: root },
      );
    }

    // Crockets up the arrises. They are 0.26 m knobs on a 14 m cone, so they do
    // not read as carving -- they read as an EDGE that is not straight, which
    // is most of what separates a spire from a traffic cone. Set at 0.88 of the
    // surface radius so each one bites into the stone rather than hovering off
    // a face the geometry does not have there.
    for (let k = 0; k < 8; k++) {
      const a = (22.5 + k * 45) * RAD;
      for (const t of [0.16, 0.34, 0.52, 0.70]) {
        const r = SP_R * (1 - t) * 0.88;
        createPart(`Crocket_${tag}${k}_${Math.round(t * 100)}`, coneGeo(0.26, 0.55, 4), stone, {
          position: [TOWER_X + Math.cos(a) * r, SP_Y0 + t * SP_H, tz + Math.sin(a) * r],
          rotation: [0, 45, 0],
          parent: root,
        });
      }
    }

    createPart(`SpireFinial_${tag}`, cylinderGeo(0.13, 0.13, 2.4, 6), iron, {
      position: [TOWER_X, SP_Y0 + SP_H + 1.0, tz],
      parent: root,
    });
    createPart(`SpireCross_${tag}`, boxGeo(0.13, 0.13, 1.0), iron, {
      position: [TOWER_X, SP_Y0 + SP_H + 1.5, tz],
      parent: root,
    });
  }

  // ---------- Crossing flèche ----------
  // Timber and lead over the crossing, far slimmer than the stone spires,
  // because it stands on a vault and not on a tower. It is also the one thing
  // on this building that is deliberately off-axis: the west front is a
  // symmetric pair, and the flèche is what stops the whole silhouette from
  // being one.
  createPart('FlecheBase', await uv(cylinderGeo(2.4, 2.6, 2.6, 8)), lead, {
    position: [X_CROSS, Y_RIDGE + 0.9, 0],
    rotation: [0, -22.5, 0],
    parent: root,
  });
  createPart('FlecheStage', await uv(cylinderGeo(1.9, 2.2, 3.4, 8)), flecheLead, {
    position: [X_CROSS, Y_RIDGE + 3.9, 0],
    rotation: [0, -22.5, 0],
    parent: root,
  });
  createPart('Fleche', await uv(coneGeo(1.9, 11.0, 8)), flecheLead, {
    position: [X_CROSS, Y_RIDGE + 11.1, 0],
    rotation: [0, -22.5, 0],
    parent: root,
  });
  createPart('FlecheFinial', cylinderGeo(0.11, 0.11, 1.9, 6), iron, { position: [X_CROSS, Y_RIDGE + 17.4, 0], parent: root });
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 + 45) * RAD;
    createPart(`FlecheLucarne_${i}`, coneGeo(0.6, 1.6, 4), flecheLead, {
      position: [X_CROSS + Math.cos(a) * 1.7, Y_RIDGE + 7.6, Math.sin(a) * 1.7],
      rotation: [0, i * 90, 0],
      parent: root,
    });
  }

  return root;
}
