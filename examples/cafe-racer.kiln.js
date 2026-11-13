// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// A 1970s cafe racer.
//
// Authored by: Claude Opus 5, via Claude Code. Every part below was written by
// the model itself, looking at its own renders through the Kiln tools and
// revising. Not a line of it is hand-authored.
//
// This is the hardest silhouette in the set, because a motorcycle is the one
// object here that almost everyone can draw from memory and nobody can draw
// correctly. The read depends on four measurements and very little else:
//
//   wheelbase, seat height, the tank's break line, and the fork rake.
//
// Get those right and it reads as a bike even in flat grey. Get them wrong and
// no amount of chrome rescues it, which is why every node below is a named
// constant at the top rather than a number buried in a call. The frame, the
// forks, the exhaust and the swingarm are all built by naming two nodes and
// running a beam between them, so changing the wheelbase moves everything that
// should move and nothing that should not.
//
// The technique this file exists for is the TAPERED SWEEP. beamBetween runs a
// constant radius, so a header pipe built from one call reads as electrical
// conduit. A real exhaust leaves the head narrow, swells through the bend and
// opens into the megaphone, so the pipes here are chains of short beams down a
// sampled bezier with the radius interpolated along the run. That is the same
// trick the penny-farthing uses on its backbone, applied to a curve that turns
// in all three axes instead of lying in a plane.
const meta = { name: 'CafeRacer', category: 'vehicle', role: 'hero' };

async function build() {
  const root = createRoot('CafeRacer');
  const uv = (g) => autoUnwrap(g, { resolution: 1024 });

  // ---------- Nodes ----------
  // Everything is placed off these. A 1970s 750 has a 1.42 m wheelbase and sits
  // on 18-inch wheels, so the axles are 0.33 m up and 1.42 m apart.
  const FRONT_AXLE = [0.71, 0.33, 0];
  const REAR_AXLE = [-0.71, 0.33, 0];
  const STEER_TOP = [0.52, 0.94, 0];     // top of the steering head
  const STEER_BOT = [0.58, 0.66, 0];     // bottom of the steering head
  const SPINE_BACK = [-0.30, 0.76, 0];   // where the backbone meets the seat loop
  const ENGINE = [0.03, 0.46, 0];
  const SWING_PIVOT = [-0.16, 0.40, 0];

  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const lerp3 = (a, b, f) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * f);

  // ---------- Materials ----------
  // Tank paint. A painted tank is a DIELECTRIC with a clearcoat: low roughness
  // for the gloss, metalness at zero. Run it metallic and the tank turns into a
  // mirror and the single most recognisable shape on the bike disappears.
  const paintAlbedo = proceduralTexture({
    schemaVersion: 2, size: 1024, usage: 'albedo', name: 'TankPaint',
    layers: [
      { op: 'solid', color: 0x8f1f24 },
      { op: 'gradient', from: 0xb03038, to: 0x6d1519, angleDeg: 90, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x7a1a1f, colorB: 0xa32a30, scale: 48, octaves: 3, seed: 11, blend: 'overlay', opacity: 0.20 },
    ],
  });
  const paint = pbrMaterial({
    albedo: paintAlbedo, normal: normalMapFromHeight(paintAlbedo, { strength: 0.5 }),
    roughness: 0.18, metalness: 0.0,
  });

  // Chrome: the rims, the pipes, the fork stanchions. This is the one place
  // metalness belongs at the top of its range.
  const chromeAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Chrome',
    layers: [
      { op: 'solid', color: 0xc7ccd2 },
      { op: 'noise', colorA: 0xb2b8be, colorB: 0xdfe4e9, scale: 60, octaves: 2, seed: 3, blend: 'overlay', opacity: 0.30 },
    ],
  });
  const chrome = pbrMaterial({
    albedo: chromeAlbedo, normal: normalMapFromHeight(chromeAlbedo, { strength: 0.4 }),
    roughness: 0.12, metalness: 0.98,
  });

  // Cast alloy: the engine cases and the hubs. Sandcast aluminium is metallic
  // but ROUGH, which is what separates it from the chrome next to it.
  const alloyAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'CastAlloy',
    layers: [
      { op: 'solid', color: 0x9ea3a6 },
      { op: 'noise', colorA: 0x82878a, colorB: 0xb4b9bc, scale: 34, octaves: 4, seed: 17, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x6d7275, colorB: 0x9ea3a6, scale: 11, octaves: 2, seed: 29, blend: 'multiply', opacity: 0.18 },
    ],
  });
  const alloy = pbrMaterial({
    albedo: alloyAlbedo, normal: normalMapFromHeight(alloyAlbedo, { strength: 1.8 }),
    roughness: 0.58, metalness: 0.82,
  });

  // Frame enamel: near-black, but NOT black. A true black frame reads as a hole
  // in the render and the whole middle of the bike falls out.
  const frameEnamel = gameMaterial(0x24262a, { roughness: 0.38, metalness: 0.20 });

  const leatherAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'SeatLeather',
    layers: [
      { op: 'solid', color: 0x2b211b },
      { op: 'noise', colorA: 0x1e1713, colorB: 0x3d2f26, scale: 52, octaves: 4, seed: 7, blend: 'overlay', opacity: 0.60 },
    ],
  });
  const leather = pbrMaterial({
    albedo: leatherAlbedo, normal: normalMapFromHeight(leatherAlbedo, { strength: 2.4 }),
    roughness: 0.86, metalness: 0.0,
  });

  const rubberAlbedo = proceduralTexture({
    schemaVersion: 2, size: 512, usage: 'albedo', name: 'Tyre',
    layers: [
      { op: 'solid', color: 0x191a1c },
      { op: 'stripes', colorA: 0x101113, colorB: 0x242629, count: 56, angleDeg: 90, blend: 'overlay', opacity: 0.45 },
    ],
  });
  const rubber = pbrMaterial({
    albedo: rubberAlbedo, normal: normalMapFromHeight(rubberAlbedo, { strength: 2.0 }),
    roughness: 0.95, metalness: 0.0,
  });

  const lens = glassMaterial(0xf2ead2, { opacity: 0.42, roughness: 0.06, metalness: 0 });
  const bulb = gameMaterial(0xfff3d0, { emissive: 0xffdca0, emissiveIntensity: 1.8, roughness: 0.4 });

  // ---------- Helpers ----------
  const box = async (name, w, h, d, r, position, mat, rotation) =>
    createPart(name, await uv(await roundedBoxGeo(w, h, d, r)), mat, { position, rotation, parent: root });

  // A bezier sampled into a chain of beams whose radius interpolates. This is
  // the whole reason the pipes read as pipes and not as conduit.
  const taperedSweep = async (name, pts, r0, r1, segs, mat) => {
    const curve = bezierCurve(pts, segs + 1);
    for (let i = 1; i <= segs; i++) {
      const f = (i - 0.5) / segs;
      beamBetween(`${name}_${i}`, curve[i - 1], curve[i], r0 + (r1 - r0) * f, mat, { parent: root });
    }
    return curve;
  };

  // ---------- Wheels ----------
  const wheel = (name, at, rimR, tyreTube, spokes) => {
    const p = createPivot(name, at, root);
    createPart(`${name}Rim`, torusGeo(rimR, 0.022, 10, 60), chrome, { parent: p });
    createPart(`${name}Tyre`, torusGeo(rimR + 0.021 + tyreTube, tyreTube, 12, 60), rubber, { parent: p });
    createPart(`${name}Hub`, cylinderZGeo(0.062, 0.062, 0.16, 20), alloy, { parent: p });
    createPart(`${name}HubFlangeA`, cylinderZGeo(0.082, 0.082, 0.022, 20), alloy, { position: [0, 0, 0.075], parent: p });
    createPart(`${name}HubFlangeB`, cylinderZGeo(0.082, 0.082, 0.022, 20), alloy, { position: [0, 0, -0.075], parent: p });
    // Spokes lace from hub flange to rim, so they are angled, not radial. Two
    // opposed sets is what makes a laced wheel read as laced.
    for (const sz of [-1, 1]) {
      const len = rimR - 0.070;
      const s = createPart(`${name}Spoke${sz > 0 ? 'A' : 'B'}0`,
        cylinderGeo(0.0045, 0.0045, len, 5), chrome, {
        position: [0, 0.070 + len / 2, sz * 0.038],
        rotation: [sz * 5.5, 0, 0], parent: p,
      });
      arrayRadial(`${name}Spoke${sz > 0 ? 'A' : 'B'}`, s, spokes, 'z', p);
    }
    return p;
  };
  // The tyre's outer radius is declared once here and shared with the mudguard,
  // so the guard's clearance is derived from the tyre it has to clear instead of
  // being typed a second time and left free to drift away from it.
  const FRONT_RIM_R = 0.268;
  const FRONT_TUBE = 0.052;
  const FRONT_TYRE_OUTER = FRONT_RIM_R + 0.021 + FRONT_TUBE * 2;
  const frontWheel = wheel('Front', FRONT_AXLE, FRONT_RIM_R, FRONT_TUBE, 20);
  const rearWheel = wheel('Rear', REAR_AXLE, 0.258, 0.068, 20);
  // Brake disc and caliper, front only, on the left as it should be.
  createPart('BrakeDisc', cylinderZGeo(0.145, 0.145, 0.010, 30), chrome,
    { position: [0, 0, -0.105], parent: frontWheel });
  createPart('BrakeCarrier', cylinderZGeo(0.070, 0.070, 0.016, 20), alloy,
    { position: [0, 0, -0.100], parent: frontWheel });
  await box('BrakeCaliper', 0.07, 0.13, 0.05, 0.016, [0.60, 0.46, -0.105], alloy, [0, 0, 22]);
  // Rear sprocket and chain run.
  createPart('Sprocket', cylinderZGeo(0.115, 0.115, 0.012, 34), alloy,
    { position: [0, 0, 0.098], parent: rearWheel });
  for (const sy of [-1, 1]) {
    await box(`ChainRun_${sy > 0 ? 'T' : 'B'}`, 0.72, 0.022, 0.020, 0.006,
      [-0.36, 0.33 + sy * 0.113, 0.098], frameEnamel, [0, 0, sy * 1.6]);
  }

  // ---------- Frame ----------
  // Steering head, then the two tubes that define a 1970s twin-cradle frame:
  // a backbone over the engine and a downtube in front of it.
  createPart('SteerHead', cylinderGeo(0.042, 0.042, 0.30, 18), frameEnamel, {
    position: mid(STEER_TOP, STEER_BOT), rotation: [0, 0, 26], parent: root,
  });
  beamBetween('Backbone', [0.50, 0.90, 0], SPINE_BACK, 0.030, frameEnamel, { parent: root });
  beamBetween('Downtube', [0.56, 0.70, 0], [0.30, 0.34, 0], 0.026, frameEnamel, { parent: root });
  for (const sz of [-1, 1]) {
    // Twin cradle rails under the engine, and the seat loop above.
    beamBetween(`Cradle_${sz > 0 ? 'R' : 'L'}`,
      [0.30, 0.32, sz * 0.02], [-0.24, 0.34, sz * 0.10], 0.020, frameEnamel, { parent: root });
    beamBetween(`SeatRail_${sz > 0 ? 'R' : 'L'}`,
      SPINE_BACK, [-0.80, 0.80, sz * 0.11], 0.019, frameEnamel, { parent: root });
    beamBetween(`SubStrut_${sz > 0 ? 'R' : 'L'}`,
      [-0.26, 0.42, sz * 0.10], [-0.74, 0.76, sz * 0.11], 0.016, frameEnamel, { parent: root });
    // Swingarm and shock.
    beamBetween(`Swingarm_${sz > 0 ? 'R' : 'L'}`,
      [SWING_PIVOT[0], SWING_PIVOT[1], sz * 0.115], [REAR_AXLE[0], REAR_AXLE[1], sz * 0.115],
      0.024, frameEnamel, { parent: root });
    createPart(`ShockBody_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.030, 0.030, 0.20, 14), frameEnamel, {
      position: [-0.615, 0.53, sz * 0.115], rotation: [0, 0, -14], parent: root,
    });
    createPart(`ShockRod_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.013, 0.013, 0.16, 10), chrome, {
      position: [-0.66, 0.70, sz * 0.115], rotation: [0, 0, -14], parent: root,
    });
    createPart(`ShockSpring_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.042, 0.042, 0.17, 14), chrome, {
      position: [-0.625, 0.57, sz * 0.115], rotation: [0, 0, -14], parent: root,
    });
    // Footpeg.
    createPart(`Footpeg_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.014, 0.014, 0.11, 10), alloy, {
      position: [-0.20, 0.30, sz * 0.19], parent: root,
    });
  }

  // ---------- Engine ----------
  // A parallel twin: crankcase, barrels with cooling fins, a head and a rocker
  // cover. The fins are the detail that makes an engine an engine, and they are
  // an array of thin discs, which is exactly what the real casting is.
  await box('Crankcase', 0.34, 0.20, 0.36, 0.045, [ENGINE[0], ENGINE[1] - 0.10, 0], alloy);
  await box('Sump', 0.26, 0.07, 0.28, 0.025, [ENGINE[0], ENGINE[1] - 0.21, 0], alloy);
  createPart('ClutchCover', cylinderZGeo(0.115, 0.115, 0.055, 22), alloy,
    { position: [ENGINE[0] - 0.03, ENGINE[1] - 0.10, 0.195], parent: root });
  createPart('AltCover', cylinderZGeo(0.098, 0.098, 0.050, 22), alloy,
    { position: [ENGINE[0] - 0.03, ENGINE[1] - 0.10, -0.195], parent: root });
  // Barrels, inclined forward the way a British twin sits.
  const BARREL_TILT = 12;
  await box('Barrels', 0.20, 0.19, 0.30, 0.020, [ENGINE[0] + 0.04, ENGINE[1] + 0.11, 0], alloy, [0, 0, -BARREL_TILT]);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    await box(`Fin_${i}`, i === 8 ? 0.231 : 0.235, 0.011, 0.335, 0.005,
      [ENGINE[0] + 0.078 - t * 0.040, ENGINE[1] + 0.035 + t * 0.155, 0], alloy, [0, 0, -BARREL_TILT]);
  }
  await box('Head', 0.22, 0.075, 0.32, 0.022, [ENGINE[0] + 0.005, ENGINE[1] + 0.225, 0], alloy, [0, 0, -BARREL_TILT]);
  await box('RockerCover', 0.17, 0.055, 0.26, 0.024, [ENGINE[0] - 0.008, ENGINE[1] + 0.278, 0], alloy, [0, 0, -BARREL_TILT]);
  // Carburettors behind the barrels, with float bowls.
  for (const sz of [-1, 1]) {
    createPart(`Carb_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.036, 0.036, 0.10, 14), alloy, {
      position: [ENGINE[0] - 0.155, ENGINE[1] + 0.20, sz * 0.075], rotation: [0, 0, 74], parent: root,
    });
    createPart(`FloatBowl_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.032, 0.032, 0.045, 12), alloy, {
      position: [ENGINE[0] - 0.153, ENGINE[1] + 0.135, sz * 0.075], parent: root,
    });
    createPart(`AirTrumpet_${sz > 0 ? 'R' : 'L'}`, coneGeo(0.046, 0.055, 14), frameEnamel, {
      position: [ENGINE[0] - 0.222, ENGINE[1] + 0.215, sz * 0.075], rotation: [0, 0, -90], parent: root,
    });
  }

  // ---------- Exhaust ----------
  // Two pipes, each swelling from 0.021 at the head to 0.032 into the megaphone.
  // The bend turns in X, Y and Z at once, which is why this cannot be one beam.
  for (const sz of [-1, 1]) {
    await taperedSweep(`Header_${sz > 0 ? 'R' : 'L'}`, [
      [ENGINE[0] + 0.14, ENGINE[1] + 0.20, sz * 0.085],
      [ENGINE[0] + 0.34, ENGINE[1] + 0.02, sz * 0.125],
      [ENGINE[0] + 0.10, ENGINE[1] - 0.20, sz * 0.190],
      [-0.38, 0.255, sz * 0.205],
    ], 0.021, 0.032, 16, chrome);
    // Megaphone silencer: a revolve, so the taper and the rolled tip are real.
    // revolveProfile on axis 'x' grows in +X, which is FORWARD here -- the first
    // pass buried both silencers inside the crankcase and the bike had no
    // visible exhaust at all. The 180 turn is what points them out the back.
    createPart(`Megaphone_${sz > 0 ? 'R' : 'L'}`, await uv(await revolveProfile([
      [0.000, 0.00], [0.034, 0.00], [0.044, 0.17], [0.052, 0.33],
      [0.056, 0.35], [0.050, 0.36], [0.000, 0.36],
    ], { segments: 24, axis: 'x', smooth: true })), chrome, {
      position: [-0.36, 0.250, sz * 0.205], rotation: [0, 180, -3], parent: root,
    });
  }

  // ---------- Tank ----------
  // A body of revolution about X, then squashed. A real teardrop tank is not a
  // solid of revolution -- it has a flat top and knee scallops -- but the
  // proportion and the break line do the recognising, and this gets both.
  const tank = new THREE.Mesh(await revolveProfile([
    [0.000, 0.000], [0.070, 0.000], [0.128, 0.075], [0.158, 0.185],
    [0.166, 0.300], [0.160, 0.420], [0.132, 0.510], [0.080, 0.560],
    [0.000, 0.570],
  ], { segments: 34, axis: 'x', smooth: true }), paint);
  tank.geometry = await uv(tank.geometry);
  tank.position.set(0.06, 0.865, 0);
  tank.rotation.z = -4 * Math.PI / 180;
  tank.scale.set(1.0, 0.86, 1.06);
  tank.name = 'Tank';
  root.add(tank);
  createPart('TankCap', cylinderGeo(0.038, 0.042, 0.022, 18), chrome,
    { position: [0.30, 1.02, 0], parent: root });
  // Knee pads: the one bit of non-red on the tank, and they break the gloss.
  for (const sz of [-1, 1]) {
    await box(`KneePad_${sz > 0 ? 'R' : 'L'}`, 0.24, 0.13, 0.02, 0.008,
      [0.08, 0.86, sz * 0.153], leather, [0, 0, -4]);
  }

  // ---------- Seat ----------
  // The cafe racer signature: a single seat with a humped rear cowl. Without
  // the hump this is just an old motorcycle.
  const seatPan = [
    [0.30, 0.00], [0.30, 0.05], [-0.16, 0.055], [-0.28, 0.10],
    [-0.33, 0.27], [-0.40, 0.20], [-0.42, 0.06], [-0.42, 0.00],
  ];
  createPart('SeatCowl', await uv(await extrudeProfile(seatPan, {
    depth: 0.27, axis: 'z', bevel: 0.018,
  })), paint, { position: [-0.44, 0.80, 0], parent: root });
  await box('SeatPad', 0.40, 0.045, 0.24, 0.020, [-0.28, 0.855, 0], leather);
  await box('TailLight', 0.045, 0.05, 0.10, 0.014, [-0.86, 0.80, 0], frameEnamel);

  // ---------- Front end ----------
  // Fork legs are raked with the steering head, and the clip-ons sit BELOW the
  // top yoke -- that is what makes it a cafe racer rather than a standard.
  const RAKE = 26;
  for (const sz of [-1, 1]) {
    beamBetween(`ForkLeg_${sz > 0 ? 'R' : 'L'}`,
      [0.585, 0.88, sz * 0.10], [FRONT_AXLE[0], FRONT_AXLE[1], sz * 0.10], 0.023, chrome, { parent: root });
    createPart(`ForkSlider_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.032, 0.032, 0.26, 16), alloy, {
      position: [0.678, 0.46, sz * 0.10], rotation: [0, 0, RAKE - 20], parent: root,
    });
    // Clip-on bar, angled down and back.
    createPart(`ClipOn_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.014, 0.014, 0.17, 10), chrome, {
      position: [0.50, 0.905, sz * 0.20], rotation: [0, 0, -6], parent: root,
    });
    createPart(`Grip_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.019, 0.019, 0.10, 12), leather, {
      position: [0.50, 0.905, sz * 0.275], parent: root,
    });
    createPart(`Lever_${sz > 0 ? 'R' : 'L'}`, cylinderZGeo(0.007, 0.007, 0.09, 8), chrome, {
      position: [0.545, 0.895, sz * 0.245], rotation: [0, 22, 0], parent: root,
    });
  }
  await box('TopYoke', 0.10, 0.028, 0.24, 0.012, [0.545, 0.94, 0], alloy, [0, 0, RAKE - 26]);
  await box('LowerYoke', 0.11, 0.036, 0.24, 0.014, [0.585, 0.76, 0], alloy, [0, 0, RAKE - 26]);
  // Headlight: a bucket, a lens and a filament, not a grey disc.
  createPart('HeadlampShell', await uv(await revolveProfile([
    [0.000, 0.000], [0.086, 0.010], [0.094, 0.055], [0.090, 0.105],
    [0.062, 0.135], [0.000, 0.140],
  ], { segments: 26, axis: 'x', smooth: true })), chrome, {
    position: [0.60, 0.87, 0], rotation: [0, 0, 180], parent: root,
  });
  createPart('HeadlampLens', sphereGeo(0.086, 20, 12), lens, { position: [0.628, 0.87, 0], parent: root });
  createPart('HeadlampBulb', sphereGeo(0.030, 12, 8), bulb, { position: [0.605, 0.87, 0], parent: root });
  // Twin clocks over the yoke.
  for (const sz of [-1, 1]) {
    createPart(`Clock_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.042, 0.042, 0.062, 18), frameEnamel, {
      position: [0.545, 0.99, sz * 0.058], rotation: [0, 0, -16], parent: root,
    });
    createPart(`ClockFace_${sz > 0 ? 'R' : 'L'}`, cylinderGeo(0.038, 0.038, 0.006, 18), lens, {
      position: [0.553, 1.019, sz * 0.058], rotation: [0, 0, -16], parent: root,
    });
  }
  // ---------- Front mudguard ----------
  // A mudguard is the TYRE'S OWN SURFACE, offset outward. That one sentence is
  // the whole construction: the tyre is a torus, so the guard is a concentric
  // torus shell standing off it by a declared clearance, cut to an arc and to
  // the wrap angle it covers. Nothing about it is plotted by hand, so it cannot
  // drift away from the wheel it belongs to.
  //
  // Two earlier versions got this wrong in two different ways, and both are
  // worth naming because they are the two ways a guard usually fails:
  //
  //   1. A typed outline. Its radii ran 0.26 to 0.41 against a tyre whose outer
  //      radius is 0.393, and it was positioned 0.02 m off the axle -- so it was
  //      not hovering over the tyre, it was buried in it, and not concentric.
  //   2. A generated arc, but extruded FLAT along z. Concentric and correctly
  //      clear, and still wrong: a guard bent in one direction only is a plank
  //      lying on the tread. What makes it read as a guard is the CHANNEL
  //      section -- edges that curve down over the tyre's shoulders.
  //
  // Offsetting the tyre torus gives both at once, for free.
  const RAD = Math.PI / 180;
  const GUARD_GAP = 0.026;    // clearance over the tyre, the same everywhere
  const GUARD_THICK = 0.009;  // sheet
  const GUARD_WRAP = 135;     // degrees of the tyre's section the blade covers
  const GUARD_A0 = 40;        // leading edge, CCW from straight ahead
  const GUARD_A1 = 118;       // trailing edge, roughly on the fork axis
  const TYRE_MAJOR = FRONT_RIM_R + 0.021 + FRONT_TUBE;
  const GUARD_R = TYRE_MAJOR + FRONT_TUBE + GUARD_GAP;   // outer edge, at the crown
  {
    const shellTube = (t) => new THREE.Mesh(torusGeo(TYRE_MAJOR, t, 12, 72), chrome);
    // Cutting the inner part of the section away is what sets the wrap: keep
    // only the material further from the axle than the chord at WRAP/2.
    const coreR = TYRE_MAJOR + (FRONT_TUBE + GUARD_GAP) * Math.cos((GUARD_WRAP / 2) * RAD);
    const core = new THREE.Mesh(cylinderZGeo(coreR, coreR, 0.60, 72), chrome);
    // Each wedge is a half-space whose cut face lies exactly on a ray from the
    // axle: the box is pushed one half-size along its own rotated +/-Y, so the
    // face lands on the origin however the ray is angled.
    const wedge = (deg, sign) => {
      const a = deg * RAD;
      const m = new THREE.Mesh(boxGeo(2.4, 2.4, 0.8), chrome);
      m.position.set(sign * Math.sin(a) * 1.2, -sign * Math.cos(a) * 1.2, 0);
      m.rotation.z = a;
      return m;
    };
    const blade = await boolDiff('Mudguard',
      shellTube(FRONT_TUBE + GUARD_GAP + GUARD_THICK),
      shellTube(FRONT_TUBE + GUARD_GAP),
      core, wedge(GUARD_A0, 1), wedge(GUARD_A1, -1),
      { smooth: true });
    blade.name = 'Mudguard';
    blade.geometry = await uv(blade.geometry);
    blade.position.set(FRONT_AXLE[0], FRONT_AXLE[1], FRONT_AXLE[2]);
    root.add(blade);
  }
  // Stays. A guard is not cantilevered off thin air -- it is bolted to the fork
  // legs, and with the clearance corrected the blade reads as floating without
  // them. Each stay lands on the fork leg at its own height, solved off the same
  // two nodes the leg itself is built from rather than measured off the render.
  for (const sz of [-1, 1]) {
    for (const deg of [52, 108]) {
      const r = TYRE_MAJOR + (FRONT_TUBE + GUARD_GAP) * Math.cos((GUARD_WRAP / 2 - 8) * RAD);
      const gx = FRONT_AXLE[0] + Math.cos(deg * RAD) * r;
      const gy = FRONT_AXLE[1] + Math.sin(deg * RAD) * r;
      const t = (0.88 - gy) / (0.88 - FRONT_AXLE[1]);
      const fx = 0.585 + (FRONT_AXLE[0] - 0.585) * t;
      beamBetween(`GuardStay_${deg}_${sz > 0 ? 'R' : 'L'}`,
        [gx, gy, sz * 0.062], [fx, gy, sz * 0.100], 0.0065, chrome, { parent: root });
    }
  }

  return root;
}
