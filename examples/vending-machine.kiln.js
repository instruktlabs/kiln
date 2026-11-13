// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// A Japanese street vending machine, at night.
//
// Authored by: Claude Opus 5, via Claude Code. Every part below was written by
// the model itself, looking at its own renders through the Kiln tools and
// revising. Not a line of it is hand-authored.
//
// This is the EMISSIVE example, and the thing it exists to demonstrate is the
// rule that keeps catching people out:
//
//   EMISSIVE AREA IS THE ENEMY OF SHAPE.
//
// There is no global illumination here. An emissive surface does not light the
// room, it only makes its own pixels bright -- so a large panel at a high
// intensity does not read as "a glowing sign", it reads as a white rectangle
// with nothing in it, and anything standing in front of it is a black
// silhouette against a blown-out ground. The first pass of this file ran the
// display backlight at intensity 2.4 across 0.76 x 0.62 m and every bottle in
// the machine disappeared into it.
//
// So the emissive here is allocated the other way round:
//
//   large area, LOW intensity   the display backlight, which only has to be
//                               brighter than the cabinet around it
//   small area, HIGH intensity  the price tags, the button LEDs, the two neon
//                               tubes -- narrow enough that clipping to white
//                               is what you want, because that is what a real
//                               tube does to a camera
//
// and the contrast that sells all of it comes from the DARK: near-black bezel,
// near-black mullions between the columns, a black delivery port. Put a bright
// thing next to a black thing and the bright thing glows. Put it next to
// another bright thing and you have a lightbox.
//
// The second rule this asset is built on is that the machine is a FACE. Every
// element is on a declared plane measured forward from the cabinet front, and
// the ones a customer touches -- buttons, coin slot, the flap -- stand proud of
// the ones they only look at. A vending machine modelled flat looks like a
// poster of a vending machine.
//
// Known limit: no text anywhere. proceduralTexture has no text op, so the
// price tags are colour fields, the brand banner is a stripe, and the hot/cold
// labels are the red and blue bands they sit on rather than the words. At asset
// scale that reads correctly -- Japanese machines really do code hot and cold
// by colour first -- but it would not survive a close-up.
const meta = { name: 'VendingMachine', category: 'prop', role: 'poi' };

async function build() {
  const root = createRoot('VendingMachine');
  const uv = (g) => autoUnwrap(g, { resolution: 1024 });

  // ---------- Plan ----------
  const HZ = 0.55; // half width, across Z
  const CAB_Y0 = 0.10; // top of the plinth
  const CAB_Y1 = 1.76; // top of the cabinet
  const CROWN_Y = 1.94; // top of the illuminated banner

  // Depth planes, forward from the machine's back. Every part states which one
  // it lives on, so nothing is coplanar by accident and the fascia has real
  // relief instead of decals.
  const P = {
    NEON: 0.400,
    BUTTON: 0.386,
    BEZEL: 0.374,
    FASCIA: 0.360, // the cabinet's own front face
    TAG: 0.350,
    GLASS: 0.344,
    SHELF: 0.260,
    CANS: 0.245,
    BACKLIGHT: 0.172,
    WELL_BACK: 0.160, // front face of the carcass = back wall of the display
    BACK: -0.360,
  };

  // The well is 0.20 m deep, and that number is load-bearing. Cutting the
  // opening at the previous 0.32 m turned the display into a cave: the mullions
  // and shelves stood far enough forward to occlude the lit panel from any
  // angle but dead-on, so the machine went straight from a white lightbox to a
  // black hole without ever passing through "shop window". A real display is a
  // shallow diorama -- the dummy products sit about 10 cm behind the glass and
  // about 6 cm in front of the light, and that is the whole trick.

  // The display: four columns, three shelves, and all four of them stocked.
  // Column 2 was an unlit sold-out column for a while, on the theory that one
  // dead cell stops a 4 x 3 grid reading as a texture. It does, but not the way
  // it was supposed to: everything in that column -- the dim panel, the bezel
  // shelves, the rails -- is near-black, so instead of an empty rack behind a
  // switched-off light it came out as a solid black rectangle with no shape in
  // it at all, and against three lit columns that reads as a hole in the model
  // rather than as a sold-out slot. The asymmetry that actually works is the one
  // that is still here: cans in column 1, bottles in the other three.
  const COL_Z = [-0.400, -0.212, -0.024, 0.164];
  const COL_W = 0.176;
  const SHELF_Y = [0.885, 1.148, 1.411];
  const DISP_Z0 = -0.500;
  const DISP_Z1 = 0.256;
  const DISP_Y0 = 0.860;
  const DISP_Y1 = 1.650;

  // ---------- Materials ----------
  // Cabinet enamel. Painted sheet steel: dielectric, and slightly off-white,
  // because a pure white body under a warm sign turns grey in the shadows and
  // reads as plastic.
  const shellAlbedo = proceduralTexture({
    schemaVersion: 2, size: 1024, usage: 'albedo', name: 'Shell',
    layers: [
      { op: 'solid', color: 0xd8d5cd },
      { op: 'gradient', from: 0xe6e3db, to: 0x9d9a94, angleDeg: 90, blend: 'overlay', opacity: 0.50 },
      // Vertical brushing plus grime that only reaches up the lower panels --
      // a machine on a street is filthy at ankle height and clean at eye level.
      { op: 'stripes', colorA: 0xd8d5cd, colorB: 0xcbc8c0, count: 90, angleDeg: 90, blend: 'overlay', opacity: 0.22 },
      { op: 'noise', colorA: 0x8e8b83, colorB: 0xd8d5cd, scale: 22, octaves: 4, seed: 5, blend: 'multiply', opacity: 0.16 },
    ],
  });
  const shell = pbrMaterial({
    albedo: shellAlbedo,
    normal: normalMapFromHeight(shellAlbedo, { strength: 0.55 }),
    roughness: 0.44, metalness: 0.18,
  });

  // The red band. Same paint, different colour, and still dielectric.
  const bandAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Band',
    layers: [
      { op: 'solid', color: 0xb01f26 },
      { op: 'gradient', from: 0xd0272f, to: 0x87161c, angleDeg: 90, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x9a1a20, colorB: 0xc0232b, scale: 60, octaves: 3, seed: 23, blend: 'overlay', opacity: 0.18 },
    ],
  });
  const band = pbrMaterial({
    albedo: bandAlbedo,
    normal: normalMapFromHeight(bandAlbedo, { strength: 0.4 }),
    roughness: 0.38, metalness: 0.10,
  });

  // The dark. This material is doing more work than any of the emissives: it is
  // the ground everything bright is measured against.
  const bezel = gameMaterial(0x18191c, { roughness: 0.52, metalness: 0.30 });
  const black = gameMaterial(0x0d0e10, { roughness: 0.70, metalness: 0.05 });
  const steel = gameMaterial(0x767b82, { roughness: 0.36, metalness: 0.92 });
  const rubber = gameMaterial(0x232527, { roughness: 0.90, metalness: 0.0 });

  const glass = glassMaterial(0x0e1a22, { opacity: 0.22, roughness: 0.03, metalness: 0.0 });

  // Large area, LOW intensity. This panel is 0.76 x 0.68 m; at anything above
  // about 1.0 it stops being a backlight and becomes a hole in the machine.
  // Note the albedo: a near-WHITE albedo under an emissive is what actually
  // clips. Lit surface plus emitted light both land in the same pixel, so a
  // panel painted 0xfff3dc is already most of the way to 1.0 before the
  // emissive is added. Paint it mid-grey and let the emission do the work.
  // ...and then measured, which moved it the other way again. Once the shelves
  // are stocked, the panel is not a 0.76 x 0.68 m emitter at all: the products
  // cover most of it and what actually reaches the camera is a set of slivers
  // between bottles. Small visible area, so it wants a HIGH intensity, by the
  // same rule that keeps the neon at 3.6. The area that matters is the area you
  // can see, not the area you built.
  const backlight = gameMaterial(0x9a9284, {
    emissive: 0xffe6b4, emissiveIntensity: 2.30, roughness: 0.60,
  });
  // Small area, HIGH intensity. These are allowed to clip -- a fluorescent tube
  // photographed at night is clipped, and refusing to let it clip is what makes
  // CG neon look like painted plastic.
  const neonPink = gameMaterial(0xff9ecb, {
    emissive: 0xff2f8e, emissiveIntensity: 3.6, roughness: 0.25,
  });
  const neonCyan = gameMaterial(0xa8f0ff, {
    emissive: 0x1fd4ff, emissiveIntensity: 3.2, roughness: 0.25,
  });
  const hotTag = gameMaterial(0xff8a80, {
    emissive: 0xe8231a, emissiveIntensity: 2.4, roughness: 0.35,
  });
  const coldTag = gameMaterial(0x8ec5ff, {
    emissive: 0x1f6fe0, emissiveIntensity: 2.4, roughness: 0.35,
  });
  const signFace = gameMaterial(0xfff6e4, {
    emissive: 0xffe6b0, emissiveIntensity: 1.15, roughness: 0.55,
  });
  const signGround = gameMaterial(0x1a1430, {
    emissive: 0x241c46, emissiveIntensity: 0.55, roughness: 0.55,
  });
  const binLabel = gameMaterial(0xe8e4dc, { roughness: 0.70 });
  const readout = gameMaterial(0x143c22, {
    emissive: 0x35ff86, emissiveIntensity: 2.0, roughness: 0.30,
  });

  // Drinks. Four columns, four different products, and the labels are stripes
  // and gradients rather than artwork -- see the known limit in the header.
  //
  // All four are DIELECTRIC, the printed can included. A can is aluminium, but
  // what a customer sees is the printing on it, and print is a coating over the
  // metal -- only the bare lid is exposed aluminium, and that is what capMat is
  // for. Modelling the whole can as metal at 0.78 is what made it disappear:
  // a metal has no diffuse term, so its entire appearance is a specular
  // reflection tinted by its albedo, and a near-black albedo under a neutral
  // studio dome returns almost nothing. The cans rendered as black rectangles
  // and their column read as empty stock.
  //
  // They still must not be PALE. Everything in the display stands in front of a
  // lit panel, and a pale product against a backlight is the one thing
  // guaranteed to vanish. Mid-tone and saturated is the window that works.
  const drink = (base, top, metal, rough = 0.34) => pbrMaterial({
    albedo: proceduralTexture({
      schemaVersion: 2, size: 256, usage: 'albedo', name: `Drink${base.toString(16)}`,
      layers: [
        { op: 'solid', color: base },
        { op: 'stripes', colorA: base, colorB: top, count: 3, angleDeg: 0, blend: 'normal', opacity: 0.55 },
      ],
    }),
    roughness: rough, metalness: metal,
  });
  const drinks = [
    drink(0x1c6b39, 0xcfc7a4, 0.0),        // PET, deep green
    drink(0x8f2733, 0xe4d9c6, 0.12, 0.27), // printed can, cola red over foil
    drink(0xa8541c, 0xf0dcae, 0.0),        // PET, amber
    drink(0x123566, 0xb9cee8, 0.0),        // PET, deep blue
  ];
  const capMat = gameMaterial(0xd9d4c8, { roughness: 0.35, metalness: 0.15 });

  const concrete = pbrMaterial({
    albedo: proceduralTexture({
      schemaVersion: 2, size: 512, usage: 'albedo', name: 'Concrete',
      layers: [
        { op: 'solid', color: 0x4c4b48 },
        { op: 'noise', colorA: 0x3a3937, colorB: 0x5e5d59, scale: 40, octaves: 5, seed: 31, blend: 'overlay', opacity: 0.7 },
      ],
    }),
    roughness: 0.92, metalness: 0.0,
  });

  const box = async (name, w, h, d, position, mat, opts = {}) =>
    createPart(name, await uv(await roundedBoxGeo(w, h, d, opts.r ?? 0.006), opts.res ?? 512), mat, {
      position, rotation: opts.rotation, parent: opts.parent ?? root,
    });
  const slab = (name, w, h, d, position, mat, rotation) =>
    createPart(name, boxGeo(w, h, d), mat, { position, rotation, parent: root });

  // ---------- Ground ----------
  // A machine with nothing under it floats. The pad also gives the neon
  // something to sit against in the bottom of the frame.
  await box('Pad', 1.30, 0.030, 1.90, [0.10, 0.015, 0], concrete, { r: 0.006, res: 512 });

  // ---------- Cabinet ----------
  await box('Plinth', 0.66, CAB_Y0, 1.06, [0, CAB_Y0 / 2, 0], black, { r: 0.010 });
  // The cabinet is a CARCASS plus a fascia with a hole in it, not one solid
  // box. The first pass built it as one box from x = -0.36 to +0.36 and then
  // placed the backlight, the shelves, the mullions and every bottle at x
  // between 0.05 and 0.25 -- which is to say, sealed inside it. The render
  // showed a clean white rectangle where the display should be and it took a
  // zoom to work out that the white rectangle was the cabinet's own front
  // panel, with the entire display standing behind it. Nothing was wrong with
  // the emissive at all.
  //
  // A machine with a window in it needs the window to be an absence.
  const CARCASS_X = P.WELL_BACK;
  await box('Carcass', 0.36 + CARCASS_X, CAB_Y1 - CAB_Y0, 1.10,
    [(CARCASS_X - 0.36) / 2, (CAB_Y0 + CAB_Y1) / 2, 0], shell, { r: 0.018, res: 1024 });
  {
    // Fascia, in four pieces around the opening. Depth runs from the carcass
    // face to the machine's front, so the display well is a genuine 0.32 m deep
    // recess and the products sit inside it rather than on it.
    const fx = (CARCASS_X + P.FASCIA) / 2;
    const fd = P.FASCIA - CARCASS_X;
    await box('FasciaTop', fd, CAB_Y1 - DISP_Y1, 1.10,
      [fx, (DISP_Y1 + CAB_Y1) / 2, 0], shell, { r: 0.014, res: 1024 });
    await box('FasciaBottom', fd, DISP_Y0 - CAB_Y0, 1.10,
      [fx, (CAB_Y0 + DISP_Y0) / 2, 0], shell, { r: 0.014, res: 1024 });
    await box('FasciaLeft', fd, DISP_Y1 - DISP_Y0, DISP_Z0 + HZ,
      [fx, (DISP_Y0 + DISP_Y1) / 2, (-HZ + DISP_Z0) / 2], shell, { r: 0.012, res: 512 });
    await box('FasciaRight', fd, DISP_Y1 - DISP_Y0, HZ - DISP_Z1,
      [fx, (DISP_Y0 + DISP_Y1) / 2, (DISP_Z1 + HZ) / 2], shell, { r: 0.012, res: 512 });
  }
  // Levelling feet, visible under the plinth's inset.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      createPart(`Foot_${sx}${sz}`, cylinderGeo(0.026, 0.026, 0.034, 10), steel,
        { position: [sx * 0.28, 0.020, sz * 0.46], parent: root });
    }
  }
  // Side vents and the compressor grille, on the machine's left flank.
  for (let i = 0; i < 9; i++) {
    slab(`Vent_${i}`, 0.30, 0.010, 0.006, [-0.10, 0.34 + i * 0.026, -HZ - 0.001], bezel);
  }
  // Panel seams on the flanks. A 1.9 m sheet-steel side with no joint in it
  // reads as a solid block of plastic.
  for (const sz of [-1, 1]) {
    slab(`FlankSeam_${sz > 0 ? 'R' : 'L'}`, 0.006, 1.44, 0.008, [0.058, 1.00, sz * (HZ + 0.002)], bezel);
    slab(`FlankSeamH_${sz > 0 ? 'R' : 'L'}`, 0.40, 0.008, 0.008, [-0.12, 0.300, sz * (HZ + 0.002)], bezel);
  }
  slab('BackPanel', 0.008, CAB_Y1 - CAB_Y0 - 0.10, 1.02, [P.BACK - 0.004, 0.94, 0], bezel);
  // The back is where the refrigeration lives, and it was one black rectangle.
  // A sixth view that is a solid field of one colour reads as an unfinished
  // model even when nothing is actually missing.
  {
    const bx = P.BACK - 0.012;
    createPart('CondenserRing', torusGeo(0.150, 0.016, 8, 28), steel,
      { position: [bx, 0.520, -0.230], rotation: [0, 90, 0], parent: root });
    createPart('CondenserHub', cylinderXGeo(0.048, 0.048, 0.030, 16), bezel,
      { position: [bx - 0.008, 0.520, -0.230], parent: root });
    for (let i = 0; i < 4; i++) {
      slab(`CondenserGuard_${i}`, 0.006, 0.290, 0.010,
        [bx - 0.014, 0.520, -0.230 + (i - 1.5) * 0.075], steel);
    }
    for (let i = 0; i < 11; i++) {
      slab(`Louvre_${i}`, 0.012, 0.014, 0.420,
        [bx - 0.004, 0.320 + i * 0.030, 0.190], bezel);
    }
    slab('DataPlate', 0.006, 0.130, 0.180, [bx - 0.006, 1.320, 0.140], steel);
    slab('CompressorBox', 0.070, 0.240, 0.300, [P.BACK + 0.040, 0.230, 0.150], bezel);
    createPart('SuctionLine', cylinderGeo(0.014, 0.014, 0.330, 10), steel,
      { position: [P.BACK + 0.020, 0.480, 0.150], parent: root });
  }

  // ---------- Crown ----------
  // The illuminated banner. Bright, but only 0.18 m tall: the whole point of
  // putting the biggest emissive at the TOP of a tall object is that it lights
  // the frame rather than competing with the product display.
  await box('CrownBody', 0.62, CROWN_Y - CAB_Y1, 1.12,
    [0.02, (CAB_Y1 + CROWN_Y) / 2, 0], bezel, { r: 0.012 });
  // 0.336, not 0.318: the crown body's front face is at 0.330, so the first
  // placement put the entire illuminated banner INSIDE the box it lights.
  {
    // The sign is the machine's face and it was a blank white plank. A lit sign
    // is a DARK ground with a small bright mark on it -- that is what makes it
    // read as illuminated rather than as a sheet of paper, and it is the same
    // trade as the neon: contrast comes from the surround, not the intensity.
    const cy = (CAB_Y1 + CROWN_Y) / 2;
    slab('CrownFace', 0.014, 0.136, 1.04, [0.336, cy, 0], signGround);
    createPart('CrownMark', cylinderXGeo(0.046, 0.046, 0.008, 24), neonCyan,
      { position: [0.347, cy, 0.330], parent: root });
    createPart('CrownMarkCore', cylinderXGeo(0.022, 0.022, 0.010, 20), signGround,
      { position: [0.349, cy, 0.330], parent: root });
    const bar = [0.084, 0.060, 0.104];
    for (let i = 0; i < bar.length; i++) {
      slab(`CrownBar_${i}`, 0.008, 0.018, bar[i],
        [0.345, cy + 0.030 - i * 0.030, 0.196 - bar[i] / 2], i === 1 ? neonPink : signFace);
    }
  }
  slab('CrownStripe', 0.016, 0.030, 1.04, [0.340, CAB_Y1 + 0.038, 0], band);
  // Two tubes framing the banner. Narrow and hot, which is the whole recipe.
  for (const ny of [CAB_Y1 + 0.012, CROWN_Y - 0.012]) {
    createPart(`NeonTop_${ny.toFixed(3)}`, cylinderZGeo(0.013, 0.013, 1.10, 12), neonPink,
      { position: [0.330, ny, 0], parent: root });
  }
  // Vertical tubes down both edges of the fascia. Cyan against the pink reads
  // as two separate light sources rather than one wash.
  for (const sz of [-1, 1]) {
    createPart(`NeonSide_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.011, 0.011, 1.26, 12), neonCyan,
      { position: [P.NEON - 0.026, 1.06, sz * (HZ - 0.018)], parent: root });
  }

  // ---------- Display ----------
  const dispW = DISP_Z1 - DISP_Z0;
  const dispH = DISP_Y1 - DISP_Y0;
  const dispCz = (DISP_Z0 + DISP_Z1) / 2;
  const dispCy = (DISP_Y0 + DISP_Y1) / 2;
  // Recessed well. The interior is lined black so the only bright things inside
  // are the backlight panel and the products it is behind.
  const wellD = P.FASCIA - P.WELL_BACK;
  const wellX = (P.WELL_BACK + P.FASCIA) / 2;
  slab('WellTop', wellD, 0.012, dispW, [wellX, DISP_Y1 - 0.006, dispCz], black);
  slab('WellBot', wellD, 0.012, dispW, [wellX, DISP_Y0 + 0.006, dispCz], black);
  for (const sz of [-1, 1]) {
    slab(`WellSide_${sz > 0 ? 'R' : 'L'}`, wellD, dispH, 0.012,
      [wellX, dispCy, dispCz + sz * (dispW / 2 - 0.006)], black);
  }
  slab('Backlight', 0.010, dispH - 0.02, dispW - 0.02, [P.BACKLIGHT, dispCy, dispCz], backlight);

  // Shelves and mullions. The mullions matter more than they look: without a
  // dark divider between columns the four products merge into one bright band.
  // Shelves 65 mm deep with a lit front rail, not 150 mm deep plain plates.
  // Depth was the whole problem: at the hero elevation a 150 mm shelf hides
  // 73 mm of the cell below it, and the gap above a 204 mm bottle in a 263 mm
  // cell is 59 mm -- so the backlight was occluded by the shelf, not by the
  // products, and no amount of emissive intensity was going to reach the
  // camera. The rail is the second half of the fix and the more honest one:
  // a chiller lights its shelf fronts, and a light at the front of the well
  // cannot be occluded by anything in the well.
  for (const sy of SHELF_Y) {
    const k = sy.toFixed(3);
    slab(`Shelf_${k}`, 0.065, 0.010, dispW - 0.03, [0.328, sy, dispCz], bezel);
    slab(`ShelfRail_${k}`, 0.014, 0.026, dispW - 0.03, [0.351, sy - 0.017, dispCz], bezel);
    slab(`ShelfLed_${k}`, 0.010, 0.009, dispW - 0.06, [0.350, sy - 0.006, dispCz], backlight);
  }
  slab('CanopyLed', 0.010, 0.009, dispW - 0.06, [0.350, DISP_Y1 - 0.022, dispCz], backlight);
  for (let i = 0; i <= COL_Z.length; i++) {
    const z = i < COL_Z.length
      ? COL_Z[i] - COL_W / 2 - 0.006
      : COL_Z[COL_Z.length - 1] + COL_W / 2 + 0.006;
    // 60 mm deep, at the glass. The previous 160 mm ran the full depth of the
    // well, and at a 3/4 view a divider that deep occludes 112 mm of a 176 mm
    // cell -- so the lit panel behind was geometrically unreachable from any
    // angle a hero shot is taken at. A divider only has to divide at the front.
    slab(`Mullion_${i}`, 0.062, dispH - 0.02, 0.012, [0.311, dispCy, z], black);
  }

  // Product columns. 0.186 m to the neck, 0.204 to the top of the cap, in a
  // 0.222 m cell. The
  // first sizing ran 0.236 and every bottle grew through the shelf above it.
  const bottleGeo = await uv(await revolveProfile([
    [0.000, 0.000], [0.037, 0.000], [0.039, 0.014], [0.038, 0.104],
    [0.037, 0.134], [0.031, 0.152], [0.016, 0.170], [0.014, 0.186], [0.000, 0.186],
  ], { segments: 20, axis: 'y', smooth: true }));
  for (let c = 0; c < COL_Z.length; c++) {
    const z = COL_Z[c];
    const mat = drinks[c];
    for (let s = 0; s < SHELF_Y.length; s++) {
      const y = SHELF_Y[s] + 0.005;
      for (const dz of [-0.044, 0.044]) {
        const nm = `Prod_${c}_${s}_${dz > 0 ? 'a' : 'b'}`;
        if (c === 1) {
          // Cans in column 1, bottles elsewhere. Two silhouettes rather than
          // one is most of what keeps the display from reading as wallpaper.
          createPart(nm, cylinderGeo(0.037, 0.037, 0.136, 18), mat,
            { position: [P.CANS, y + 0.068, z + dz], parent: root });
          createPart(`${nm}_Lid`, cylinderGeo(0.033, 0.033, 0.009, 18), capMat,
            { position: [P.CANS, y + 0.139, z + dz], parent: root });
        } else {
          createPart(nm, bottleGeo, mat, { position: [P.CANS, y, z + dz], parent: root });
          createPart(`${nm}_Cap`, cylinderGeo(0.016, 0.016, 0.018, 12), capMat,
            { position: [P.CANS, y + 0.194, z + dz], parent: root });
        }
      }
    }
  }

  // Glazing, then the bezel that frames it. The frame is proud of the glass by
  // 30 mm, which is what puts the display INTO the machine.
  slab('Glass', 0.008, dispH - 0.006, dispW - 0.006, [P.GLASS, dispCy, dispCz], glass);
  const frameT = 0.052;
  slab('BezelTop', 0.030, frameT, dispW + frameT * 2, [P.BEZEL, DISP_Y1 + frameT / 2, dispCz], bezel);
  slab('BezelBot', 0.030, frameT, dispW + frameT * 2, [P.BEZEL, DISP_Y0 - frameT / 2, dispCz], bezel);
  for (const sz of [-1, 1]) {
    slab(`BezelSide_${sz > 0 ? 'R' : 'L'}`, 0.030, dispH, frameT,
      [P.BEZEL, dispCy, dispCz + sz * (dispW / 2 + frameT / 2)], bezel);
  }

  // ---------- Selection row ----------
  // Under each column: a price tag on its hot/cold band, and the button. The
  // tags are the second-brightest thing on the machine and they are 20 mm tall,
  // which is exactly the trade the header describes.
  const TAG_Y = 0.792;
  const BTN_Y = 0.700;
  slab('SelectionPanel', 0.020, 0.180, DISP_Z1 - DISP_Z0 + 0.104,
    [P.FASCIA - 0.004, 0.738, dispCz], bezel);
  for (let c = 0; c < COL_Z.length; c++) {
    const z = COL_Z[c];
    const tag = c === 1 ? hotTag : coldTag;
    slab(`Tag_${c}`, 0.008, 0.022, COL_W - 0.020, [P.TAG + 0.036, TAG_Y, z], tag);
    slab(`TagWell_${c}`, 0.010, 0.034, COL_W - 0.006, [P.TAG + 0.030, TAG_Y, z], black);
    await box(`Button_${c}`, 0.024, 0.050, 0.104, [P.BUTTON - 0.006, BTN_Y, z],
      steel, { r: 0.008, res: 256 });
    createPart(`ButtonLamp_${c}`, cylinderXGeo(0.010, 0.010, 0.014, 12), tag,
      { position: [P.BUTTON + 0.008, BTN_Y + 0.012, z], parent: root });
  }

  // ---------- Money column ----------
  const MZ = 0.386;
  slab('MoneyPanel', 0.018, 1.06, 0.180, [P.FASCIA - 0.002, 1.06, MZ], bezel);
  slab('Readout', 0.008, 0.052, 0.126, [P.FASCIA + 0.010, 1.500, MZ], readout);
  slab('ReadoutWell', 0.012, 0.076, 0.150, [P.FASCIA + 0.004, 1.500, MZ], black);
  // Note acceptor: a slot with a lit throat, which is the detail that makes it
  // read as a mechanism rather than a printed rectangle.
  await box('NoteBezel', 0.026, 0.120, 0.150, [P.FASCIA + 0.008, 1.330, MZ], steel, { r: 0.006, res: 256 });
  slab('NoteSlot', 0.010, 0.014, 0.098, [P.FASCIA + 0.022, 1.330, MZ], black);
  slab('NoteLamp', 0.006, 0.006, 0.090, [P.FASCIA + 0.024, 1.330, MZ], readout);
  // Coin slot, angled the way a real one is so a coin can fall into it.
  await box('CoinBezel', 0.024, 0.090, 0.090, [P.FASCIA + 0.008, 1.180, MZ], steel, { r: 0.006, res: 256 });
  slab('CoinSlot', 0.014, 0.044, 0.014, [P.FASCIA + 0.018, 1.180, MZ], black, [0, 0, 18]);
  // Coin return and its cup.
  createPart('ReturnLever', cylinderXGeo(0.014, 0.014, 0.030, 12), steel,
    { position: [P.FASCIA + 0.018, 1.062, MZ + 0.052], parent: root });
  await box('CoinCup', 0.034, 0.056, 0.098, [P.FASCIA + 0.002, 0.968, MZ], black, { r: 0.008, res: 256 });

  // ---------- Delivery port ----------
  // The bottom-left flap. It is black, deep, and hinged slightly open, because
  // a closed flush flap on a flat panel is invisible and this is the one part of
  // the machine a person actually reaches into.
  const PORT_Z = -0.246;
  slab('PortSurround', 0.020, 0.280, 0.470, [P.FASCIA - 0.004, 0.400, PORT_Z], bezel);
  slab('PortVoid', 0.070, 0.226, 0.412, [P.FASCIA - 0.030, 0.396, PORT_Z], black);
  // Hinged a few degrees open. A flush flap on a flat panel is invisible, and
  // this is the one part of the machine a person actually puts a hand into.
  await box('PortFlap', 0.016, 0.212, 0.400, [P.FASCIA + 0.016, 0.436, PORT_Z], rubber,
    { r: 0.006, rotation: [0, 0, 11], res: 512 });
  slab('PortLip', 0.030, 0.018, 0.420, [P.FASCIA + 0.010, 0.290, PORT_Z], steel);
  // Lower fascia, and the red band that carries the machine's colour down to
  // the ground so the bottom half is not a blank white slab.
  slab('LowerBand', 0.012, 0.088, 1.08, [P.FASCIA + 0.006, 0.196, 0], band);
  slab('KickPlate', 0.014, 0.084, 1.06, [P.FASCIA + 0.004, 0.128, 0], bezel);

  // ---------- Recycling bin ----------
  // Every one of these machines on every street in Japan has a bin bolted to
  // its flank. It is here for scale as much as for company: a 1.9 m cabinet
  // photographed alone could be any size at all.
  const binZ = HZ + 0.29;
  createPart('Bin', await uv(await revolveProfile([
    [0.000, 0.000], [0.185, 0.000], [0.190, 0.030], [0.196, 0.560],
    [0.204, 0.640], [0.204, 0.690], [0.176, 0.690], [0.000, 0.690],
  ], { segments: 26, axis: 'y', smooth: true })), band, { position: [0.02, 0.03, binZ], parent: root });
  createPart('BinRim', torusGeo(0.196, 0.018, 8, 26), bezel,
    { position: [0.02, 0.722, binZ], rotation: [90, 0, 0], parent: root });
  createPart('BinHole', cylinderGeo(0.116, 0.116, 0.030, 20), black,
    { position: [0.02, 0.706, binZ], parent: root });
  // The sorting label, and it cannot be a slab. A flat plate 0.24 m across a
  // 0.39 m drum only touches it along one line: the middle sinks in and the two
  // ends stand 40 mm proud of the curve, which from the front reads as a white
  // wing sticking out of the bin. A label on a round bin is a curved plate, so
  // this is an annular sector -- the same wedge trick the well's curb stones
  // use -- swept up through the label's height and sitting 6 mm proud all the
  // way round.
  const labelArc = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
  const LABEL_HALF = 0.44;
  const labelProfile = [];
  for (let i = 0; i <= 6; i++) {
    labelProfile.push(labelArc(0.1925, -LABEL_HALF + (i / 6) * 2 * LABEL_HALF));
  }
  for (let i = 6; i >= 0; i--) {
    labelProfile.push(labelArc(0.2005, -LABEL_HALF + (i / 6) * 2 * LABEL_HALF));
  }
  createPart(
    'BinLabel',
    await extrudeProfile(labelProfile, { depth: 0.110, axis: 'y' }),
    binLabel,
    { position: [0.02, 0.375, binZ], parent: root },
  );
  // The bracket that actually holds it to the machine. Short, dark and tucked
  // behind the bin's shoulder -- the first version was a pale slab long enough
  // to pass straight through the bin and out the far side.
  slab('BinBracket', 0.050, 0.026, 0.130, [-0.10, 0.585, HZ + 0.10], bezel);
  slab('BinBracketPad', 0.016, 0.070, 0.020, [-0.10, 0.585, HZ + 0.028], bezel);

  return root;
}
