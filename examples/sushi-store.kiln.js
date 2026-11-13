// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 11 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// A sushi-ya: the shopfront, not the cart.
//
// Authored by: Claude Opus 5, via Claude Code. Every part below was written by
// the model itself, looking at its own renders through the Kiln tools and
// revising. Not a line of it is hand-authored.
//
// Every other hero in this set is an OBJECT. You can walk around it and its
// silhouette does the work. A shopfront is not an object, it is a PLANE that
// has to stop looking like a plane, and that is a completely different problem.
// A texture-mapped box with a window painted on it reads as a billboard from
// every angle except dead ahead, and the moment the camera moves 20 degrees the
// whole illusion collapses.
//
// The technique that fixes it is LAYERED DEPTH. Every real facade is a stack of
// surfaces at measurably different distances from the street, and the shadow
// lines between those layers are the entire reason it reads as architecture.
// So this asset does not have "a front wall". It has a declared depth table --
// see DEPTH below -- and every single part states which plane it lives on.
// Nothing is coplanar with anything else by accident. The glass is 34 cm behind
// the wall it sits in; the sill stands 9 cm proud of that wall; the lattice
// stands proud of the sill; the posts stand proud of the lattice; the signboard
// stands proud of the posts; the eave overhangs all of it by most of a metre.
// That ladder is what you are actually looking at when a facade "feels solid".
//
// The first pass of this asset got that ladder right and the BUILDING wrong: it
// was 1.4 m deep, which is a stage flat, not a shop. From above it was an open
// box and from the side it was a blank slab. A facade only reads as a building
// if there is a building behind it, so the plan here runs 3.2 m back, the roof
// is a real ridged kawara roof over the whole plan with gable ends, and the
// side walls get the same shitami-ita and plaster treatment as the front.
//
// The second lesson is that a shop is defined by what is BEHIND the glass. A
// dark window is a dead building. So there is a real interior -- counter,
// stools, refrigerated neta case, bottles, and the fish itself in rows -- built
// at full detail even though you only see it through a 2 m aperture, because
// the parallax of those parts sliding past the mullions as the camera moves is
// the single strongest signal that the building has an inside.
//
// The third is kawara. Roof tiles are not a texture. Japanese pantiles are a
// flat pan with a half-round cover tile over every joint, and that alternation
// throws a hard shadow stripe down the whole roof. Painting it on gives you a
// flat grey plane; building it gives you the roof.
const meta = { name: 'SushiStore', category: 'architecture', role: 'hero' };

async function build() {
  const root = createRoot('SushiStore');
  const uv = (g, r = 1024) => autoUnwrap(g, { resolution: r });
  const D = Math.PI / 180;

  // ---------- The depth table ----------
  // This is the asset. Read it as a section through the shopfront, from the
  // street inward. Every createPart below takes its x from one of these.
  const DEPTH = {
    EAVE_2: 1.16,   // upper roof, the deepest overhang
    EAVE_1: 0.98,   // shop canopy over the entrance
    LANTERN: 0.72,  // chochin, hanging clear of the fascia
    KANBAN: 0.40,   // the vertical signboard
    NOREN: 0.33,    // the split curtain, hanging in front of the door
    POST: 0.24,     // structural posts, the outermost part of the wall itself
    LATTICE: 0.16,  // koshi screen and window mullions
    SILL: 0.09,     // sills, lintels, the horizontal bands
    WALL: 0.00,     // the plaster plane -- the datum everything is measured from
    GLASS: -0.34,   // glazing, deep in its reveal
    STOOL: -0.86,   // where a customer sits
    COUNTER: -1.40, // the hinoki counter behind the glass
    KITCHEN: -2.36, // the itamae's side of the counter
    BACK: -3.16,    // interior back wall
  };

  // ---------- Dimensions ----------
  const HZ = 2.30;        // half the shopfront width
  const PLINTH_Y = 0.17;
  const HEAD_Y = 2.12;    // top of the ground-floor openings
  const BAND_Y = 2.42;    // top of the ground storey
  const UPPER_Y = 3.78;   // wall plate of the upper storey
  const RIDGE_X = -1.55;  // the roof ridge runs along Z, parallel to the street
  const RIDGE_Y = 5.30;
  const EAVE_Y = 4.10;
  const ROOF_HZ = HZ + 0.26;
  const POST_Z = 2.14;    // corner post centres
  const MID_Z = -0.18;    // the post that divides door bay from window bay
  const WALL_Z = HZ - 0.08;
  const PLAN_X0 = -3.24;  // outside face of the back wall
  const PLAN_MID = (PLAN_X0 + 0.10) / 2;
  const PLAN_LEN = 0.10 - PLAN_X0;

  // ---------- Materials ----------
  // Shikkui plaster. Warm, chalky, and a DIELECTRIC -- lime render has no metal
  // in it at all, and giving a wall even 0.1 metalness turns it grey and dead.
  const plasterAlbedo = proceduralTexture({
    schemaVersion: 2, size: 1024, usage: 'albedo', name: 'Shikkui',
    layers: [
      { op: 'solid', color: 0xdcd3c2 },
      { op: 'noise', colorA: 0xc6bca8, colorB: 0xeae3d5, scale: 34, octaves: 4, seed: 5, blend: 'overlay', opacity: 0.45 },
      { op: 'noise', colorA: 0xa79b85, colorB: 0xdcd3c2, scale: 9, octaves: 2, seed: 23, blend: 'multiply', opacity: 0.14 },
    ],
  });
  const plaster = pbrMaterial({
    albedo: plasterAlbedo, normal: normalMapFromHeight(plasterAlbedo, { strength: 1.3 }),
    roughness: 0.88, metalness: 0.0,
  });

  // Yakisugi: cedar charred black to preserve it. It is nearly value-zero, so
  // the grain has to come from the NORMAL, not from albedo contrast -- push the
  // albedo apart far enough to see grain and it stops reading as charred and
  // starts reading as dirty paint.
  const charAlbedo = proceduralTexture({
    schemaVersion: 2, size: 1024, usage: 'albedo', name: 'Yakisugi',
    layers: [
      { op: 'solid', color: 0x2b2622 },
      { op: 'stripes', colorA: 0x201c19, colorB: 0x3a332d, count: 110, angleDeg: 0, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x181513, colorB: 0x3f382f, scale: 40, octaves: 4, seed: 11, blend: 'overlay', opacity: 0.40 },
    ],
  });
  const char = pbrMaterial({
    albedo: charAlbedo, normal: normalMapFromHeight(charAlbedo, { strength: 2.6 }),
    roughness: 0.80, metalness: 0.02,
  });

  // Hinoki: the pale cypress the counter and the interior are made of. Same
  // stripe-not-noise rule as any sawn board -- noise gives you chipboard.
  const hinokiAlbedo = proceduralTexture({
    schemaVersion: 2, size: 1024, usage: 'albedo', name: 'Hinoki',
    layers: [
      { op: 'solid', color: 0xd8b98a },
      { op: 'stripes', colorA: 0xc7a473, colorB: 0xe6cda6, count: 84, angleDeg: 0, blend: 'overlay', opacity: 0.38 },
      { op: 'noise', colorA: 0xab8a5d, colorB: 0xe6cda6, scale: 22, octaves: 4, seed: 31, blend: 'overlay', opacity: 0.30 },
    ],
  });
  const hinoki = pbrMaterial({
    albedo: hinokiAlbedo, normal: normalMapFromHeight(hinokiAlbedo, { strength: 1.1 }),
    roughness: 0.55, metalness: 0.0,
  });

  // Ibushi-gawara: smoked clay roof tile. Silver-grey, faintly metallic because
  // the smoking process leaves a carbon film, and SMOOTH -- fired clay glaze is
  // one of the few architectural surfaces that is genuinely low-roughness.
  const tileAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Ibushi',
    layers: [
      { op: 'solid', color: 0x6e747a },
      { op: 'noise', colorA: 0x5a6066, colorB: 0x878d94, scale: 44, octaves: 4, seed: 17, blend: 'overlay', opacity: 0.42 },
    ],
  });
  const tile = pbrMaterial({
    albedo: tileAlbedo, normal: normalMapFromHeight(tileAlbedo, { strength: 1.4 }),
    roughness: 0.38, metalness: 0.22,
  });

  // Indigo noren. Woven cotton: matte, dielectric, and with a weave normal fine
  // enough that it never resolves into visible stripes at asset scale.
  const norenAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Aizome',
    layers: [
      { op: 'solid', color: 0x1e3a5c },
      { op: 'checker', colorA: 0x1a3352, colorB: 0x244366, squares: 160, blend: 'overlay', opacity: 0.45 },
      { op: 'noise', colorA: 0x152a44, colorB: 0x2b4d72, scale: 30, octaves: 3, seed: 13, blend: 'overlay', opacity: 0.25 },
    ],
  });
  const noren = pbrMaterial({
    albedo: norenAlbedo, normal: normalMapFromHeight(norenAlbedo, { strength: 0.9 }),
    roughness: 0.94, metalness: 0.0,
  });

  const concrete = gameMaterial(0x8d8a84, { roughness: 0.92, metalness: 0.0 });
  const steel = gameMaterial(0x6b7075, { roughness: 0.44, metalness: 0.82 });
  const brass = gameMaterial(0xb3893c, { roughness: 0.36, metalness: 0.90 });
  const cream = gameMaterial(0xf0e6d2, { roughness: 0.82, metalness: 0.0 });
  const lacquer = gameMaterial(0x3a1512, { roughness: 0.22, metalness: 0.12 });
  const glass = glassMaterial(0xa8c4cc, { opacity: 0.18, roughness: 0.03, metalness: 0.0 });
  const caseGlass = glassMaterial(0xc8dde2, { opacity: 0.14, roughness: 0.02, metalness: 0.0 });
  // The interior is the only lit thing here, and the temptation is to make it
  // bright. Resist it: a large emissive surface has no shape, it just clips to
  // white. These are narrow strips at modest intensity, and the interior reads
  // as lit because everything AROUND the window is dark timber.
  const lamp = gameMaterial(0xffeccb, { emissive: 0xffd9a0, emissiveIntensity: 1.05, roughness: 0.9 });
  const paper = gameMaterial(0xf2603a, { emissive: 0xd9421f, emissiveIntensity: 1.15, roughness: 0.85 });

  // Fish. Four neta colours, deliberately close in value and far apart in hue,
  // because a tray of sushi reads by hue and a tray of grey blocks reads as
  // gravel no matter how well it is modelled.
  const rice = gameMaterial(0xf5f0e6, { roughness: 0.86 });
  const tuna = gameMaterial(0xc03a3a, { roughness: 0.52 });
  const salmon = gameMaterial(0xe8804a, { roughness: 0.50 });
  const tamago = gameMaterial(0xf0c04a, { roughness: 0.66 });
  const nori = gameMaterial(0x1d2b22, { roughness: 0.74 });

  // ---------- Helpers ----------
  const box = async (name, w, h, d, position, mat, opts = {}) =>
    createPart(name, await uv(await roundedBoxGeo(w, h, d, opts.r ?? 0.012), opts.res ?? 512), mat, {
      position, rotation: opts.rotation, parent: opts.parent ?? root,
    });
  // Untextured trim does not need an atlas, and unwrapping two hundred small
  // boards is most of the build time in exchange for nothing.
  const bar = (name, w, h, d, position, mat, rotation) =>
    createPart(name, boxGeo(w, h, d), mat, { position, rotation, parent: root });

  // ---------- Shell ----------
  await box('Plinth', PLAN_LEN + 0.50, PLINTH_Y, HZ * 2 + 0.24, [PLAN_MID - 0.14, PLINTH_Y / 2, 0], concrete, { r: 0.03 });
  await box('BackBoard', 0.16, 1.42, HZ * 2 - 0.004, [DEPTH.BACK - 0.08, PLINTH_Y + 0.71, 0], char);
  await box('BackPlaster', 0.14, UPPER_Y - PLINTH_Y - 1.50, HZ * 2 - 0.06,
    [DEPTH.BACK - 0.08, PLINTH_Y + 1.42 + (UPPER_Y - PLINTH_Y - 1.50) / 2, 0], plaster);
  bar('BackBand', 0.22, 0.104, HZ * 2, [DEPTH.BACK - 0.08, PLINTH_Y + 1.47, 0], char);
  await box('Floor', PLAN_LEN, 0.08, HZ * 2 - 0.20, [PLAN_MID, PLINTH_Y + 0.04, 0], hinoki);
  await box('Ceiling', PLAN_LEN, 0.10, HZ * 2 - 0.20, [PLAN_MID, HEAD_Y + 0.20, 0], hinoki);

  // Side walls, treated the same way as the front: charred board below, plaster
  // above, with the band between them lining up with the shop's own nageshi. A
  // building whose sides are one blank material is a building that was only
  // ever designed from one camera.
  for (const sz of [-1, 1]) {
    const s = sz > 0 ? 'R' : 'L';
    await box(`SideBoard_${s}`, PLAN_LEN, 1.42, 0.16, [PLAN_MID, PLINTH_Y + 0.71, sz * WALL_Z], char);
    await box(`SidePlaster_${s}`, PLAN_LEN - 0.06, UPPER_Y - PLINTH_Y - 1.50, 0.14,
      [PLAN_MID, PLINTH_Y + 1.42 + (UPPER_Y - PLINTH_Y - 1.50) / 2, sz * WALL_Z], plaster);
    bar(`SideBand_${s}`, PLAN_LEN, 0.10, 0.22, [PLAN_MID, PLINTH_Y + 1.47, sz * WALL_Z], char);
    // Sode-kabe: the short return that wraps the corner post, so the front and
    // the side are joined by a piece of building rather than a hard edge.
    await box(`SideReturn_${s}`, 0.222, UPPER_Y - PLINTH_Y - 0.004, 0.30,
      [DEPTH.POST - 0.131, (UPPER_Y + PLINTH_Y) / 2 - 0.002, sz * (HZ + 0.02)], char);
  }
  // One side gets two small upper windows. One side. That is the whole point.
  for (const wx of [-1.10, -2.10]) {
    bar(`SideWindow_${wx.toFixed(2)}`, 0.72, 0.82, 0.10, [wx, 2.90, -WALL_Z - 0.03], char);
    createPart(`SideGlass_${wx.toFixed(2)}`, planeGeo(0.52, 0.62), glass,
      { position: [wx, 2.90, -WALL_Z - 0.08], rotation: [90, 0, 0], parent: root });
    for (let i = 0; i < 4; i++) {
      bar(`SideBar_${wx.toFixed(2)}_${i}`, 0.05, 0.62, 0.055, [wx - 0.20 + i * 0.133, 2.90, -WALL_Z - 0.11], plaster);
    }
    bar(`SideMuntin_${wx.toFixed(2)}`, 0.52, 0.05, 0.05, [wx, 2.90, -WALL_Z - 0.11], char);
  }

  // ---------- Ground-floor wall, built around the openings ----------
  // Door bay spans z -2.04..-0.26, window bay z -0.10..2.04. The wall exists
  // only where the openings are not, which is what a reveal actually is.
  await box('WallHead', 0.30, BAND_Y - HEAD_Y, HZ * 2, [DEPTH.WALL - 0.15, (HEAD_Y + BAND_Y) / 2, 0], plaster);
  await box('WallSill', 0.30, 0.77, 2.14, [DEPTH.WALL - 0.15, PLINTH_Y + 0.385, 1.04], plaster);
  await box('WallPier', 0.30, HEAD_Y - PLINTH_Y, 0.16, [DEPTH.WALL - 0.15, (HEAD_Y + PLINTH_Y) / 2, MID_Z], plaster);
  for (const [zc, nm] of [[-2.04, 'DoorL'], [-0.26, 'DoorR'], [-0.10, 'WinL'], [2.04, 'WinR']]) {
    bar(`Reveal_${nm}`, 0.296, HEAD_Y - PLINTH_Y, 0.03, [DEPTH.WALL - 0.15, (HEAD_Y + PLINTH_Y) / 2, zc], plaster);
  }

  // ---------- Posts: the outermost layer of the wall itself ----------
  for (const sz of [-1, 1]) {
    const s = sz > 0 ? 'R' : 'L';
    await box(`CornerPost_${s}`, 0.24, UPPER_Y - PLINTH_Y, 0.22, [DEPTH.POST - 0.12, (UPPER_Y + PLINTH_Y) / 2, sz * POST_Z], char);
    // Stone footing under each post. Timber never touches the ground in this
    // tradition, and the little grey block at the base of a post is one of
    // those details nobody names and everybody misses.
    await box(`PostFooting_${s}`, 0.32, 0.204, 0.30, [DEPTH.POST - 0.12, PLINTH_Y + 0.062, sz * POST_Z], concrete, { r: 0.02 });
  }
  await box('MidPost', 0.22, HEAD_Y - PLINTH_Y + 0.30, 0.18, [DEPTH.POST - 0.13, (HEAD_Y + PLINTH_Y) / 2 + 0.15, MID_Z], char);
  // Nageshi: the horizontal tie over the openings that visually carries the
  // upper storey. On the SILL plane, not the post plane, so it reads as passing
  // BEHIND the posts rather than being notched into them.
  await box('Nageshi', 0.20, 0.20, HZ * 2 + 0.10, [DEPTH.SILL - 0.02, HEAD_Y + 0.11, 0], char);
  await box('BaseRail', 0.20, 0.16, HZ * 2 + 0.10, [DEPTH.SILL - 0.02, PLINTH_Y + 0.08, 0], char);

  // ---------- Display window ----------
  const WIN_Z0 = -0.10;
  const WIN_Z1 = 2.04;
  const SILL_Y = PLINTH_Y + 0.77;
  createPart('WindowGlass', planeGeo(HEAD_Y - SILL_Y - 0.04, WIN_Z1 - WIN_Z0 - 0.04), glass, {
    position: [DEPTH.GLASS, (SILL_Y + HEAD_Y) / 2, (WIN_Z0 + WIN_Z1) / 2], rotation: [0, 0, -90], parent: root,
  });
  // Sill: a real projecting board with a drip edge. This one part does more for
  // the facade than any amount of albedo detail, because it is the only thing
  // casting a horizontal shadow across the plaster below.
  await box('WindowSill', 0.42, 0.09, WIN_Z1 - WIN_Z0 + 0.24, [DEPTH.SILL - 0.13, SILL_Y, (WIN_Z0 + WIN_Z1) / 2], char);
  await box('WindowHead', 0.34, 0.10, WIN_Z1 - WIN_Z0 + 0.20, [DEPTH.SILL - 0.11, HEAD_Y - 0.04, (WIN_Z0 + WIN_Z1) / 2], char);
  // Mullions on the LATTICE plane. Four bays, an odd division, so the window
  // never reads as a mirrored pair of panes.
  for (let i = 1; i <= 3; i++) {
    bar(`Mullion_${i}`, 0.09, HEAD_Y - SILL_Y, 0.07,
      [DEPTH.LATTICE - 0.05, (SILL_Y + HEAD_Y) / 2, WIN_Z0 + (WIN_Z1 - WIN_Z0) * (i / 4)], char);
  }
  bar('WindowTransom', 0.094, 0.07, WIN_Z1 - WIN_Z0, [DEPTH.LATTICE - 0.05, HEAD_Y - 0.42, (WIN_Z0 + WIN_Z1) / 2], char);

  // ---------- Interior, visible through the glass ----------
  // A metre of parallax between the glass and the counter, which is what the
  // whole depth argument was for.
  await box('Counter', 0.72, 0.10, HZ * 2 - 0.70, [DEPTH.COUNTER, 1.06, 0.10], hinoki);
  await box('CounterApron', 0.098, 0.86, HZ * 2 - 0.70, [DEPTH.COUNTER + 0.309, 0.62, 0.10], hinoki);
  for (let i = 0; i < 5; i++) {
    const cz = -1.30 + i * 0.66;
    createPart(`StoolSeat_${i}`, cylinderGeo(0.17, 0.17, 0.07, 14), char,
      { position: [DEPTH.STOOL, 0.72, cz], parent: root });
    createPart(`StoolPost_${i}`, cylinderGeo(0.045, 0.055, 0.68, 10), steel,
      { position: [DEPTH.STOOL, 0.38, cz], parent: root });
    createPart(`StoolFoot_${i}`, torusGeo(0.15, 0.020, 6, 14), steel,
      { position: [DEPTH.STOOL, 0.22, cz], rotation: [90, 0, 0], parent: root });
  }
  // The neta case: a refrigerated glass box on the counter, canted toward the
  // customer the way a real one is so the fish faces the street.
  const CASE_Y = 1.11;
  await box('NetaCaseBase', 0.56, 0.10, 2.70, [DEPTH.COUNTER - 0.02, CASE_Y, 0.24], steel, { r: 0.02 });
  createPart('NetaCaseGlass', planeGeo(0.46, 2.66), caseGlass, {
    position: [DEPTH.COUNTER - 0.26, CASE_Y + 0.21, 0.24], rotation: [0, 0, -76], parent: root,
  });
  bar('NetaCaseTop', 0.54, 0.05, 2.70, [DEPTH.COUNTER - 0.02, CASE_Y + 0.44, 0.24], steel);
  for (const cz of [-1.04, 0.24, 1.36]) {
    bar(`NetaCaseRib_${cz.toFixed(2)}`, 0.52, 0.06, 0.05, [DEPTH.COUNTER - 0.12, CASE_Y + 0.23, cz], steel, [0, 0, -14]);
  }
  // The fish. Rows of nigiri on trays, hue-sorted into blocks the way a case is
  // actually laid out, with a nori-wrapped row breaking the run.
  const NETA = [tuna, salmon, tamago, tuna, salmon, tamago, tuna, salmon];
  for (let r = 0; r < 8; r++) {
    const cz = -0.98 + r * 0.32;
    for (let c = 0; c < 2; c++) {
      const cx = DEPTH.COUNTER + 0.08 - c * 0.20;
      createPart(`Rice_${r}_${c}`, await roundedBoxGeo(0.10, 0.05, 0.16, 0.022), rice,
        { position: [cx, CASE_Y + 0.08, cz], rotation: [0, (r * 37) % 14 - 7, 0], parent: root });
      createPart(`Neta_${r}_${c}`, await roundedBoxGeo(0.115, 0.026, 0.175, 0.012), NETA[r],
        { position: [cx, CASE_Y + 0.122, cz], rotation: [0, (r * 37) % 14 - 7, -4], parent: root });
    }
    if (r === 4) bar(`Nori_${r}`, 0.13, 0.09, 0.012, [DEPTH.COUNTER - 0.04, CASE_Y + 0.115, cz + 0.09], nori);
  }
  // The itamae's side: a working bench, a knife rack, and the back shelf. None
  // of it is fully visible and all of it moves against the mullions.
  await box('KitchenBench', 0.60, 0.90, HZ * 2 - 0.90, [DEPTH.KITCHEN, 0.62, 0], steel, { r: 0.02 });
  bar('KnifeRail', 0.06, 0.05, 0.90, [DEPTH.KITCHEN - 0.26, 1.34, -0.60], char);
  for (let i = 0; i < 4; i++) {
    bar(`Knife_${i}`, 0.012, 0.30, 0.05, [DEPTH.KITCHEN - 0.26, 1.16, -0.96 + i * 0.24], steel, [0, 0, (i % 2) * 4 - 2]);
  }
  await box('BackShelf', 0.30, 1.20, HZ * 2 - 0.80, [DEPTH.BACK + 0.24, 1.60, 0], char);
  for (let i = 0; i < 11; i++) {
    createPart(`Bottle_${i}`, cylinderGeo(0.035, 0.045, 0.24 + (i % 3) * 0.06, 10),
      i % 3 === 0 ? tamago : i % 3 === 1 ? nori : hinoki,
      { position: [DEPTH.BACK + 0.34, 1.86 + (i % 3) * 0.03, -1.60 + i * 0.32], parent: root });
  }
  // Two narrow strips, not one big panel. Emissive area is the enemy of shape.
  bar('CeilingLightA', 0.20, 0.06, 2.90, [DEPTH.COUNTER + 0.10, HEAD_Y + 0.12, 0.10], lamp);
  bar('CeilingLightB', 0.20, 0.06, 2.90, [DEPTH.KITCHEN, HEAD_Y + 0.12, 0.10], lamp);
  const caseLamp = gameMaterial(0xfff2d8, { emissive: 0xffe0ae, emissiveIntensity: 1.6, roughness: 0.9 });
  bar('CaseLight', 0.16, 0.05, 2.60, [DEPTH.COUNTER - 0.10, 1.74, 0.24], caseLamp);
  bar('CaseLightHood', 0.24, 0.06, 2.64, [DEPTH.COUNTER - 0.10, 1.82, 0.24], steel);
  // Shoji backdrop. Large but weak: it is there to be a value, not a light.
  const backGlow = gameMaterial(0xf6e6c8, { emissive: 0xe8cf9e, emissiveIntensity: 0.55, roughness: 0.95 });
  bar('ShojiBackdrop', 0.04, 1.30, HZ * 2 - 1.00, [DEPTH.BACK + 0.44, 1.62, 0], backGlow);

  // ---------- Entrance ----------
  const DOOR_Z0 = -2.04;
  const DOOR_Z1 = -0.26;
  // Sliding doors in a real track: two leaves, one pushed back past the other,
  // which is the only configuration that proves they slide.
  bar('DoorTrackTop', 0.20, 0.07, DOOR_Z1 - DOOR_Z0, [DEPTH.WALL - 0.10, HEAD_Y - 0.05, (DOOR_Z0 + DOOR_Z1) / 2], char);
  bar('DoorTrackBottom', 0.20, 0.06, DOOR_Z1 - DOOR_Z0, [DEPTH.WALL - 0.10, PLINTH_Y + 0.03, (DOOR_Z0 + DOOR_Z1) / 2], char);
  for (const [leafZ, leafX, nm] of [[-1.50, DEPTH.WALL - 0.06, 'A'], [-0.62, DEPTH.WALL - 0.15, 'B']]) {
    bar(`DoorLeaf_${nm}`, 0.05, HEAD_Y - PLINTH_Y - 0.14, 0.85, [leafX, (HEAD_Y + PLINTH_Y) / 2, leafZ], char);
    createPart(`DoorPane_${nm}`, planeGeo(HEAD_Y - PLINTH_Y - 0.34, 0.70), glass,
      { position: [leafX - 0.04, (HEAD_Y + PLINTH_Y) / 2 + 0.06, leafZ], rotation: [0, 0, -90], parent: root });
    // Muntins across the pane. Three, not four -- an even count centres a bar
    // on the handle and the door looks designed by a spreadsheet.
    for (let m = 0; m < 3; m++) {
      bar(`DoorMuntin_${nm}${m}`, 0.03, 0.035, 0.70, [leafX - 0.055, PLINTH_Y + 0.42 + m * 0.46, leafZ], char);
    }
  }
  await box('DoorStone', 0.54, 0.14, 1.30, [DEPTH.POST + 0.14, PLINTH_Y - 0.03, -1.16], concrete, { r: 0.03 });
  createPart('DoorHandle', cylinderGeo(0.022, 0.022, 0.30, 10), brass,
    { position: [DEPTH.WALL - 0.01, 1.16, -1.14], parent: root });

  // Noren. Four panels with the two centre ones swung apart, so it reads as
  // cloth someone just walked through rather than a printed board.
  const NOREN_TOP = HEAD_Y - 0.02;
  bar('NorenRod', 0.05, 0.05, DOOR_Z1 - DOOR_Z0 + 0.20, [DEPTH.NOREN, NOREN_TOP + 0.06, (DOOR_Z0 + DOOR_Z1) / 2], char);
  const NOREN_SWING = [0, 9, -11, 0];
  for (let i = 0; i < 4; i++) {
    await box(`NorenPanel_${i}`, 0.02, 0.62, 0.44, [DEPTH.NOREN + (i === 2 ? 0.004 : 0), NOREN_TOP - 0.31, DOOR_Z0 + 0.22 + i * 0.445],
      noren, { rotation: [NOREN_SWING[i], 0, 0], r: 0.006 });
  }
  // The shop name across the noren, in cream. Three glyph cells, each a real
  // arrangement of strokes rather than a decal, so it survives being looked at.
  const glyphStrokes = [
    [[0, 0.24, 0.30, 0.035], [0, 0.10, 0.24, 0.035], [0, -0.06, 0.30, 0.035], [0.0, -0.02, 0.035, 0.34]],
    [[-0.13, 0.06, 0.035, 0.44], [0, 0.26, 0.28, 0.035], [0.02, 0.06, 0.18, 0.030], [0, -0.15, 0.28, 0.035]],
    [[0, 0.26, 0.34, 0.035], [-0.09, 0.02, 0.030, 0.40], [0.09, 0.02, 0.030, 0.40], [0, -0.08, 0.22, 0.030]],
  ];
  glyphStrokes.forEach((strokes, gi) => {
    const cz = -1.62 + gi * 0.56;
    strokes.forEach(([sz2, sy, sw, sh], si) => {
      bar(`NorenGlyph_${gi}_${si}`, 0.01, sh, sw, [DEPTH.NOREN - 0.012, NOREN_TOP - 0.32 + sy, cz + sz2], cream);
    });
  });

  // ---------- Kawara ----------
  // One helper, used three times: the shop canopy and both slopes of the main
  // roof. A building gets a consistent language from shared code; two roofs
  // hand-tuned separately give you two buildings.
  const kawaraSlope = async (name, xTop, yTop, xEave, yEave, halfZ, pitch, mat) => {
    const run = xEave - xTop;
    const sign = Math.sign(run);
    const len = Math.hypot(run, yTop - yEave);
    const angle = Math.atan2(yTop - yEave, Math.abs(run)) / D;
    const mid = [(xTop + xEave) / 2, (yTop + yEave) / 2, 0];
    await box(`${name}_Deck`, len, 0.07, halfZ * 2, mid, mat, { rotation: [0, 0, -sign * angle], r: 0.02 });
    for (let i = 0; i <= pitch; i++) {
      const cz = -halfZ + (halfZ * 2) * (i / pitch);
      // Cover tiles: the half-rounds over every pan joint. This is the element
      // that throws the shadow stripe, so it is the one that cannot be faked.
      createPart(`${name}_Cover_${i}`, cylinderXGeo(0.052, 0.052, len, 8), mat, {
        position: [mid[0], mid[1] + 0.06, cz], rotation: [0, 0, -sign * angle], parent: root,
      });
      // Gatou: the round cap that closes each cover tile at the eave. Tiny, and
      // the single most identifiable feature of a Japanese roof edge.
      createPart(`${name}_Gatou_${i}`, cylinderXGeo(0.075, 0.075, 0.054, 12), mat, {
        position: [xEave + sign * 0.02, yEave + 0.055, cz], parent: root,
      });
    }
    bar(`${name}_Fascia`, 0.05, 0.16, halfZ * 2, [xEave + sign * 0.02, yEave - 0.05, 0], mat);
  };

  await kawaraSlope('ShopEave', DEPTH.WALL + 0.02, BAND_Y + 0.24, DEPTH.EAVE_1, BAND_Y + 0.02, HZ + 0.16, 13, tile);
  bar('ShopEaveFlashing', 0.104, 0.14, (HZ + 0.16) * 2, [0.022, BAND_Y + 0.30, 0], tile);
  // Rafter tails under the canopy, an odd count against the tile pitch so the
  // two rhythms never line up. Aligned rhythms are what make architecture look
  // procedurally generated.
  for (let i = 0; i < 10; i++) {
    bar(`Rafter_${i}`, DEPTH.EAVE_1 - 0.06, 0.09, 0.07,
      [DEPTH.EAVE_1 / 2 - 0.03, BAND_Y + 0.10, -HZ + (HZ * 2) * (i / 9)], char, [0, 0, -12]);
  }

  // ---------- Upper storey ----------
  await box('UpperWall', 0.28, UPPER_Y - BAND_Y - 0.30, HZ * 2 - 0.30,
    [DEPTH.WALL - 0.14, (BAND_Y + UPPER_Y) / 2 + 0.16, 0], plaster);
  // Mushiko-mado: the barred insect-cage window. Bars on the LATTICE plane over
  // a recessed dark ground -- the shopfront's depth trick again, in miniature.
  // Eleven thick bars, not fifteen thin ones: at fifteen it stopped being
  // joinery and started being a radiator grille.
  const MU_Y0 = BAND_Y + 0.56;
  const MU_Y1 = UPPER_Y - 0.44;
  bar('MushikoGround', 0.06, MU_Y1 - MU_Y0, 2.30, [DEPTH.WALL + 0.01, (MU_Y0 + MU_Y1) / 2, -0.30], char);
  for (let i = 0; i < 11; i++) {
    bar(`MushikoBar_${i}`, 0.11, MU_Y1 - MU_Y0, 0.105, [DEPTH.LATTICE - 0.06, (MU_Y0 + MU_Y1) / 2, -1.36 + i * 0.212], plaster);
  }
  bar('MushikoSill', 0.26, 0.08, 2.46, [DEPTH.SILL - 0.06, MU_Y0 - 0.05, -0.30], char);
  bar('MushikoHead', 0.22, 0.08, 2.46, [DEPTH.SILL - 0.06, MU_Y1 + 0.05, -0.30], char);

  // ---------- Main roof ----------
  const REAR_EAVE_X = PLAN_X0 - 0.82;
  await kawaraSlope('RoofFront', RIDGE_X, RIDGE_Y, DEPTH.EAVE_2, EAVE_Y, ROOF_HZ, 17, tile);
  await kawaraSlope('RoofRear', RIDGE_X, RIDGE_Y, REAR_EAVE_X, EAVE_Y, ROOF_HZ, 17, tile);
  for (let i = 0; i < 3; i++) {
    await box(`RidgeNoshi_${i}`, 0.46 - i * 0.06, 0.09, ROOF_HZ * 2, [RIDGE_X, RIDGE_Y + 0.10 + i * 0.09, 0], tile, { r: 0.02 });
  }
  createPart('RidgeCap', cylinderZGeo(0.13, 0.13, ROOF_HZ * 2, 12), tile,
    { position: [RIDGE_X, RIDGE_Y + 0.42, 0], parent: root });
  for (const sz of [-1, 1]) {
    await box(`Onigawara_${sz > 0 ? 'R' : 'L'}`, 0.34, 0.46, 0.16,
      [RIDGE_X, RIDGE_Y + 0.44, sz * (ROOF_HZ + 0.06)], tile, { rotation: [0, 0, 0], r: 0.04, res: 256 });
  }
  // Gable ends. The roofline is COMPUTED at the wall face rather than guessed,
  // so the triangle meets the slope exactly instead of leaving a lit sliver.
  const roofYAt = (x) => x >= RIDGE_X
    ? RIDGE_Y - (x - RIDGE_X) * ((RIDGE_Y - EAVE_Y) / (DEPTH.EAVE_2 - RIDGE_X))
    : RIDGE_Y - (RIDGE_X - x) * ((RIDGE_Y - EAVE_Y) / (RIDGE_X - REAR_EAVE_X));
  const GABLE_X0 = PLAN_X0 + 0.04;
  const GABLE_X1 = DEPTH.WALL + 0.10;
  for (const sz of [-1, 1]) {
    const s = sz > 0 ? 'R' : 'L';
    createPart(`Gable_${s}`, await uv(await extrudeProfile([
      [GABLE_X1, UPPER_Y - 0.10], [GABLE_X1, roofYAt(GABLE_X1) - 0.04],
      [RIDGE_X, RIDGE_Y - 0.04], [GABLE_X0, roofYAt(GABLE_X0) - 0.04], [GABLE_X0, UPPER_Y - 0.10],
    ], { depth: 0.16, axis: 'z', bevel: 0.02 }), 512), plaster, {
      position: [0, 0, sz * WALL_Z], parent: root,
    });
    // Hafu: the barge boards that cap the gable, one per slope per end.
    for (const [xa, nm] of [[GABLE_X1, 'F'], [GABLE_X0, 'R']]) {
      const ya = roofYAt(xa);
      const len = Math.hypot(RIDGE_X - xa, RIDGE_Y - ya);
      bar(`Hafu_${s}${nm}`, len, 0.16, 0.10,
        [(xa + RIDGE_X) / 2, (ya + RIDGE_Y) / 2 + 0.06, sz * (WALL_Z + 0.10)], tile,
        [0, 0, Math.sign(RIDGE_X - xa) * (Math.atan2(RIDGE_Y - ya, Math.abs(RIDGE_X - xa)) / D)]);
    }
  }

  // The wall has to actually reach the roof. Front and back get a plaster
  // frieze whose top is computed from the slope; the side gables already carry
  // their own profile.
  const roofUnder = (x) => roofYAt(x) - 0.05;
  for (const [nm, wx, wz] of [['Front', DEPTH.WALL - 0.13, HZ * 2 - 0.34], ['Back', DEPTH.BACK - 0.07, HZ * 2 - 0.34]]) {
    const xf = nm === 'Front' ? GABLE_X1 : GABLE_X0;
    const y0 = UPPER_Y - 0.08;
    const y1 = roofUnder(xf);
    await box(`${nm}Frieze`, nm === 'Front' ? 0.262 : 0.26, y1 - y0, wz, [nm === 'Front' ? wx + 0.001 : wx, (y0 + y1) / 2, 0], plaster);
  }
  // Exposed rafter tails under the main eave, the same detail as the canopy but
  // at the larger scale. A metre of unsupported overhang with a blank soffit is
  // the fastest way to make a roof look like it was dropped on from orbit.
  for (let i = 0; i < 13; i++) {
    const cz = -ROOF_HZ + 0.12 + (ROOF_HZ * 2 - 0.24) * (i / 12);
    bar(`EaveRafter_${i}`, 1.20, 0.10, 0.08, [0.58, roofUnder(0.58) - 0.09, cz], char, [0, 0, -23.9]);
  }
  bar('EaveKayaoi', 0.10, 0.18, ROOF_HZ * 2, [DEPTH.EAVE_2 - 0.06, roofUnder(DEPTH.EAVE_2) - 0.12, 0], char);

  // ---------- Fittings, each placed ONCE ----------
  // A shopfront is symmetric in its structure and never in its clutter. Every
  // part below is on exactly one side, chosen rather than mirrored.
  await box('Kanban', 0.07, 1.66, 0.40, [DEPTH.KANBAN, 1.62, -POST_Z - 0.06], lacquer, { r: 0.018 });
  bar('KanbanBracketTop', 0.20, 0.06, 0.06, [DEPTH.KANBAN - 0.10, 2.38, -POST_Z - 0.06], char);
  bar('KanbanBracketLow', 0.20, 0.06, 0.06, [DEPTH.KANBAN - 0.10, 0.92, -POST_Z - 0.06], char);
  glyphStrokes.forEach((strokes, gi) => {
    const cy = 2.14 - gi * 0.50;
    strokes.forEach(([sz2, sy, sw, sh], si) => {
      bar(`KanbanGlyph_${gi}_${si}`, 0.02, sh * 1.15, sw * 1.15,
        [DEPTH.KANBAN + 0.042, cy + sy * 1.15, -POST_Z - 0.06 + sz2 * 1.15], cream);
    });
  });

  // Two chochin, hung from the canopy at different heights on different cords.
  const chochin = async (name, cz, cordLen, r, h) => {
    bar(`${name}_Cord`, 0.012, cordLen, 0.012, [DEPTH.LANTERN, BAND_Y + 0.10 - cordLen / 2, cz], char);
    const cy = BAND_Y + 0.10 - cordLen - h / 2;
    createPart(`${name}_Body`, await uv(await revolveProfile([
      [0.00, 0.00], [r * 0.52, 0.02], [r, h * 0.34], [r, h * 0.66], [r * 0.52, h - 0.02], [0.00, h],
    ], { segments: 18, axis: 'y', smooth: true }), 256), paper, {
      position: [DEPTH.LANTERN, cy - h / 2, cz], parent: root,
    });
    for (let i = 0; i < 5; i++) {
      createPart(`${name}_Rib_${i}`, torusGeo(r * (0.72 + 0.28 * Math.sin(((i + 1) / 6) * Math.PI)), 0.010, 6, 16), lacquer, {
        position: [DEPTH.LANTERN, cy - h / 2 + h * ((i + 1) / 6), cz], rotation: [0, 0, 90], parent: root,
      });
    }
    bar(`${name}_Cap`, 0.02, r * 0.62, r * 0.62, [DEPTH.LANTERN, cy + h / 2 - 0.01, cz], lacquer);
  };
  await chochin('ChochinA', -1.44, 0.20, 0.20, 0.40);
  await chochin('ChochinB', -0.42, 0.34, 0.15, 0.30);

  // Lit menu case, right of the entrance only.
  await box('MenuCase', 0.10, 0.62, 0.40, [DEPTH.POST - 0.02, 1.44, -0.06], steel, { r: 0.02, res: 256 });
  bar('MenuFace', 0.03, 0.50, 0.32, [DEPTH.POST + 0.05, 1.44, -0.06], lamp);

  // Drainpipe down ONE corner, with hoppers and a shoe at the bottom.
  createPart('Downpipe', cylinderGeo(0.045, 0.045, EAVE_Y - PLINTH_Y - 0.10, 10), steel,
    { position: [DEPTH.POST + 0.02, (EAVE_Y + PLINTH_Y) / 2, POST_Z + 0.20], parent: root });
  for (const hy of [1.10, 2.30, 3.30]) {
    createPart(`PipeClip_${hy.toFixed(2)}`, torusGeo(0.058, 0.012, 6, 14), steel,
      { position: [DEPTH.POST + 0.02, hy, POST_Z + 0.20], rotation: [90, 0, 0], parent: root });
  }
  createPart('PipeShoe', cylinderGeo(0.045, 0.062, 0.20, 10), steel,
    { position: [DEPTH.POST + 0.02, PLINTH_Y + 0.10, POST_Z + 0.20], rotation: [0, 0, 12], parent: root });

  // Aircon on the upper wall, off centre, on a bracket. Nothing says "a real
  // person runs this shop" quite like the box they had to bolt on.
  await box('AcUnit', 0.36, 0.54, 0.76, [DEPTH.WALL + 0.20, 3.14, 1.34], steel, { r: 0.03, res: 256 });
  createPart('AcFan', torusGeo(0.19, 0.030, 6, 20), steel,
    { position: [DEPTH.WALL + 0.39, 3.14, 1.34], rotation: [0, 90, 0], parent: root });
  for (const bz of [1.02, 1.66]) bar(`AcBracket_${bz.toFixed(2)}`, 0.34, 0.05, 0.05, [DEPTH.WALL + 0.18, 2.85, bz], steel);
  bar('AcConduit', 0.06, 0.70, 0.06, [DEPTH.WALL + 0.06, 2.60, 1.68], steel, [0, 0, 6]);

  // Crates outside, opposite the menu case, each rotated a few degrees because
  // nobody stacks crates square.
  for (let i = 0; i < 3; i++) {
    await box(`Crate_${i}`, 0.40, 0.24, 0.56, [DEPTH.POST + 0.16, PLINTH_Y + 0.12 + i * 0.24, 1.66], hinoki,
      { rotation: [0, (i * 53) % 17 - 8, 0], r: 0.02, res: 256 });
  }
  // A potted plant by the door, on its own.
  createPart('PotBody', await uv(await revolveProfile([
    [0.00, 0.00], [0.17, 0.00], [0.20, 0.10], [0.22, 0.26], [0.19, 0.28], [0.00, 0.28],
  ], { segments: 16, axis: 'y', smooth: true }), 256), lacquer, {
    position: [DEPTH.POST + 0.18, PLINTH_Y, -1.10], parent: root,
  });
  for (let i = 0; i < 7; i++) {
    const a = i * 51 * D;
    bar(`Leaf_${i}`, 0.02, 0.34 + (i % 3) * 0.09, 0.10,
      [DEPTH.POST + 0.18 + Math.cos(a) * 0.06, PLINTH_Y + 0.44 + (i % 3) * 0.05, -1.10 + Math.sin(a) * 0.06],
      nori, [Math.cos(a) * 22, i * 26, Math.sin(a) * 22]);
  }

  // The back of the building is in the contact sheet, so it gets a service
  // door, an extract cowl and the gas bottles every small kitchen actually has.
  bar('ServiceDoor', 0.08, 1.90, 0.84, [DEPTH.BACK - 0.14, PLINTH_Y + 0.95, -1.10], char);
  createPart('ServiceHandle', cylinderZGeo(0.020, 0.020, 0.18, 8), steel,
    { position: [DEPTH.BACK - 0.20, 1.06, -0.78], parent: root });
  createPart('ExtractCowl', cylinderGeo(0.24, 0.30, 0.36, 14), steel,
    { position: [DEPTH.BACK - 0.24, 2.70, 0.90], rotation: [0, 0, 12], parent: root });
  bar('ExtractDuct', 0.30, 0.34, 0.34, [DEPTH.BACK - 0.06, 2.52, 0.90], steel);
  for (let i = 0; i < 2; i++) {
    createPart(`GasBottle_${i}`, cylinderGeo(0.13, 0.15, 0.82, 12), tuna,
      { position: [DEPTH.BACK - 0.28, PLINTH_Y + 0.41, 1.62 - i * 0.34], parent: root });
  }
  bar('BackWindow', 0.10, 0.78, 1.04, [DEPTH.BACK - 0.20, 2.86, -0.30], char);
  createPart('BackGlass', planeGeo(0.66, 0.92), glass,
    { position: [DEPTH.BACK - 0.26, 2.86, -0.30], rotation: [0, 0, -90], parent: root });
  for (let i = 0; i < 5; i++) {
    bar(`BackWindowBar_${i}`, 0.05, 0.66, 0.05, [DEPTH.BACK - 0.28, 2.86, -0.70 + i * 0.20], plaster);
  }
  await box('MeterBox', 0.18, 0.44, 0.34, [DEPTH.BACK - 0.24, 1.90, 1.46], steel, { r: 0.02, res: 256 });
  bar('MeterConduit', 0.06, 1.30, 0.06, [DEPTH.BACK - 0.20, 1.20, 1.46], steel);
  createPart('BackDownpipe', cylinderGeo(0.045, 0.045, 3.30, 10), steel,
    { position: [DEPTH.BACK - 0.22, 1.90, -1.94], parent: root });

  return root;
}
