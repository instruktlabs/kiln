// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opencode-go/muse-spark-1.3-contributor, via opencode.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.
//
// Refined later, in this repository, with `kiln_edit`: the cab roof was cut
// back to a real eave and lifted off near-black, having read from above as a
// slab wider than the boiler.
// The attribution above is for the authoring run, which had none of this in
// scope. Both passes went through the same tools; only the second one could
// see the gallery it was going into.

const meta = { name: 'SteamLocomotive', category: 'prop' };

async function build() {
  const root = createRoot('SteamLocomotive');

  // ---------- materials ----------
  const black = gameMaterial(0x18191c, { roughness: 0.55, metalness: 0.45 });
  const boilerGreen = gameMaterial(0x1d3a2a, { roughness: 0.5, metalness: 0.35 });
  const smokebox = gameMaterial(0x232326, { roughness: 0.7, metalness: 0.3 });
  const steel = gameMaterial(0x9aa0a8, { roughness: 0.32, metalness: 0.9 });
  const darkSteel = gameMaterial(0x4a4e55, { roughness: 0.5, metalness: 0.8 });
  const rodSteel = gameMaterial(0xb9bec6, { roughness: 0.28, metalness: 0.92 });
  const brass = gameMaterial(0xc09a3e, { roughness: 0.3, metalness: 0.95 });
  const copper = gameMaterial(0x8e4a2f, { roughness: 0.4, metalness: 0.9 });
  const cabRed = gameMaterial(0x6e1f1f, { roughness: 0.6, metalness: 0.2 });
  const beamRed = gameMaterial(0x8c2323, { roughness: 0.62, metalness: 0.15 });
  // Slate rather than 0x101011. The cab roof is the largest unbroken surface
  // on the locomotive and the only one seen from directly above; at near-black
  // it returned nothing at all and read from the top view as a hole cut in the
  // engine.
  const roofBlack = gameMaterial(0x2b2c30, { roughness: 0.8, metalness: 0.2 });
  const glass = glassMaterial(0x9fc4d8, { opacity: 0.45, roughness: 0.15, metalness: 0.1 });
  const lampLens = gameMaterial(0xffe9b0, { emissive: 0xffc861, emissiveIntensity: 0.9, roughness: 0.4 });
  const whitewall = gameMaterial(0xd8d5cc, { roughness: 0.7 });
  const tireMat = gameMaterial(0x2c2e33, { roughness: 0.45, metalness: 0.7 });

  const Xd = [0.6, -0.75, -2.1];   // 3 driving axles (4-6-2: 3 drivers)
  const Yd = 0.82, crankR = 0.38;  // tire outer 0.82 -> tread touches Y=0
  const Zdriver = 0.78;
  const ponyX = [2.5, 3.35], ponyY = 0.41, Zpony = 0.7;   // leading truck (4 wheels)
  const trailX = -3.35, trailY = 0.41;                    // trailing truck (2 wheels)
  const cabW = 2.3, floorY = 1.6;

  // ---------- frames ----------
  for (const s of [1, -1]) {
    createPart('FrameSide_' + s, boxGeo(8.6, 0.34, 0.12), cabRed,
      { position: [0.3, 1.02, s * 0.62], parent: root });
    createPart('Footplate_' + s, boxGeo(8.9, 0.07, 0.5), black,
      { position: [0.35, 1.56, s * 0.95], parent: root });
    createPart('Valance_' + s, boxGeo(8.9, 0.16, 0.04), boilerGreen,
      { position: [0.35, 1.45, s * 1.19], parent: root });
  }
  createPart('BufferBeam', boxGeo(0.22, 0.4, 2.3), beamRed,
    { position: [4.5, 1.15, 0], parent: root });
  createPart('RearBeam', boxGeo(0.22, 0.4, 2.3), beamRed,
    { position: [-4.0, 1.15, 0], parent: root });
  createPart('PilotDeck', boxGeo(1.0, 0.08, 2.0), darkSteel,
    { position: [4.15, 1.5, 0], parent: root });
  for (const x of Xd) {
    createPart('Axle_' + x, cylinderZGeo(0.09, 0.09, 1.7, 12), darkSteel,
      { position: [x, Yd, 0], parent: root });
    for (const s of [1, -1]) {
      createPart('Axlebox_' + x + '_' + s, boxGeo(0.34, 0.3, 0.2), darkSteel,
        { position: [x, Yd, s * 0.62], parent: root });
      createPart('LeafSpring_' + x + '_' + s, boxGeo(0.7, 0.09, 0.1), steel,
        { position: [x, 1.28, s * 0.62], parent: root });
      createPart('SpringHanger_' + x + '_' + s, boxGeo(0.06, 0.18, 0.06), darkSteel,
        { position: [x + 0.3, 1.15, s * 0.62], parent: root });
    }
  }

  // ---------- boiler ----------
  createPart('BoilerBarrel', cylinderXGeo(0.85, 0.85, 5.0, 28), boilerGreen,
    { position: [0.75, 2.15, 0], parent: root });
  createPart('Smokebox', cylinderXGeo(0.88, 0.88, 0.85, 28), smokebox,
    { position: [3.65, 2.15, 0], parent: root });
  createPart('SmokeboxDoor', sphereGeo(0.88, 24, 8), smokebox,
    { position: [4.07, 2.15, 0], scale: [0.28, 1, 1], parent: root });
  createPart('DoorRim', torusGeo(0.68, 0.045, 8, 28), darkSteel,
    { position: [4.28, 2.15, 0], rotation: [0, 90, 0], parent: root });
  createPart('DoorDart', cylinderXGeo(0.05, 0.05, 0.35, 10), steel,
    { position: [4.35, 2.15, 0], parent: root });
  createPart('DartHandle', torusGeo(0.12, 0.025, 6, 14), steel,
    { position: [4.5, 2.15, 0], rotation: [0, 90, 0], parent: root });
  for (const bx of [-1.2, -0.3, 0.6, 1.5, 2.4]) {
    createPart('BoilerBand_' + bx, torusGeo(0.86, 0.028, 8, 36), brass,
      { position: [bx, 2.15, 0], rotation: [0, 90, 0], parent: root });
  }
  createPart('Firebox', boxGeo(1.3, 1.5, 1.9), boilerGreen,
    { position: [-2.2, 2.0, 0], parent: root });
  createPart('FireboxThroat', cylinderXGeo(0.7, 0.85, 0.6, 20), boilerGreen,
    { position: [-1.85, 2.1, 0], parent: root });
  for (const wx of [-2.5, -2.1, -1.7]) {
    for (const s of [1, -1]) {
      createPart('Washout_' + wx + '_' + s, cylinderZGeo(0.05, 0.05, 0.06, 8), brass,
        { position: [wx, 1.7, s * 0.96], parent: root });
    }
  }

  // ---------- stack / domes / top furniture ----------
  createPart('StackBase', taperConeGeo(0.42, 0.26, 0.35, 'y', 20), black,
    { position: [3.55, 3.0, 0], parent: root });
  createPart('StackBarrel', cylinderGeo(0.24, 0.28, 0.75, 20), black,
    { position: [3.55, 3.5, 0], parent: root });
  createPart('StackFlare', taperConeGeo(0.24, 0.4, 0.35, 'y', 20), black,
    { position: [3.55, 4.02, 0], parent: root });
  createPart('StackRim', torusGeo(0.39, 0.035, 8, 24), copper,
    { position: [3.55, 4.2, 0], rotation: [90, 0, 0], parent: root });
  createPart('SteamDomeBase', cylinderGeo(0.42, 0.48, 0.25, 20), copper,
    { position: [0.9, 2.95, 0], parent: root });
  createPart('SteamDome', sphereGeo(0.42, 20, 12), brass,
    { position: [0.9, 3.1, 0], scale: [1, 0.95, 1], parent: root });
  createPart('SandDomeBase', cylinderGeo(0.36, 0.42, 0.22, 20), brass,
    { position: [1.85, 2.92, 0], parent: root });
  createPart('SandDome', sphereGeo(0.36, 20, 12), copper,
    { position: [1.85, 3.05, 0], scale: [1, 0.9, 1], parent: root });
  createPart('SandPipeL', cylinderGeo(0.03, 0.03, 1.1, 8), darkSteel,
    { position: [1.95, 2.3, 0.8], parent: root });
  createPart('SandPipeR', cylinderGeo(0.03, 0.03, 1.1, 8), darkSteel,
    { position: [1.95, 2.3, -0.8], parent: root });
  createPart('Whistle', cylinderGeo(0.05, 0.05, 0.4, 10), brass,
    { position: [-1.3, 3.15, 0.25], parent: root });
  createPart('WhistleBell', sphereGeo(0.06, 10, 6), brass,
    { position: [-1.3, 3.36, 0.25], parent: root });
  createPart('SafetyValve', cylinderGeo(0.09, 0.11, 0.22, 12), brass,
    { position: [-0.6, 3.0, 0], parent: root });
  createPart('BellYokeA', boxGeo(0.06, 0.3, 0.06), darkSteel,
    { position: [2.5, 3.15, 0.14], parent: root });
  createPart('BellYokeB', boxGeo(0.06, 0.3, 0.06), darkSteel,
    { position: [2.5, 3.15, -0.14], parent: root });
  createPart('Bell', coneGeo(0.16, 0.28, 16), brass,
    { position: [2.5, 3.15, 0], parent: root });
  createPart('Generator', cylinderXGeo(0.09, 0.09, 0.35, 12), darkSteel,
    { position: [2.9, 2.95, 0.35], parent: root });
  createPart('AirPump', cylinderGeo(0.22, 0.22, 0.55, 16), black,
    { position: [3.3, 1.9, -0.95], parent: root });
  createPart('AirReservoir', cylinderXGeo(0.3, 0.3, 1.6, 16), black,
    { position: [0.2, 1.35, 0.0], parent: root });
  // exhaust saddle (cylinders -> smokebox), ashpan, injector plumbing
  createPart('Saddle', boxGeo(0.75, 0.55, 1.5), smokebox,
    { position: [3.35, 1.35, 0], parent: root });
  createPart('Ashpan', boxGeo(1.1, 0.45, 1.2), black,
    { position: [-2.2, 1.05, 0], parent: root });
  for (const s of [1, -1]) {
    beamBetween('InjectorFeed_' + s, [-1.9, 1.35, s * 0.7], [2.2, 1.05, s * 0.95], 0.03, copper, { parent: root });
    beamBetween('InjectorDelivery_' + s, [-1.9, 1.2, s * 0.7], [1.2, 1.0, s * 0.9], 0.025, steel, { parent: root });
  }
  // brake shoes + hangers at every driver (static rigging)
  for (const x of Xd) {
    for (const s of [1, -1]) {
      createPart('BrakeShoe_' + x + '_' + s, boxGeo(0.12, 0.32, 0.1), darkSteel,
        { position: [x + 0.76, 0.47, s * 0.78], rotation: [0, 0, -25], parent: root });
      createPart('BrakeHanger_' + x + '_' + s, boxGeo(0.06, 0.7, 0.06), darkSteel,
        { position: [x + 0.76, 0.85, s * 0.66], parent: root });
    }
  }

  // handrails along boiler
  for (const s of [1, -1]) {
    beamBetween('Handrail_' + s, [-1.6, 2.55, s * 0.88], [3.2, 2.55, s * 0.9], 0.02, steel, { parent: root });
    for (const hx of [-1.0, 0.2, 1.4, 2.6]) {
      createPart('Stanchion_' + hx + '_' + s, cylinderGeo(0.015, 0.015, 0.35, 6), steel,
        { position: [hx, 2.42, s * 0.86], parent: root });
    }
  }

  // ---------- cylinders + crosshead guides (static) ----------
  for (const s of [1, -1]) {
    createPart('Cylinder_' + s, cylinderXGeo(0.32, 0.32, 1.0, 18), darkSteel,
      { position: [2.7, 0.95, s * 1.0], parent: root });
    createPart('CylinderCapF_' + s, cylinderXGeo(0.34, 0.34, 0.1, 18), steel,
      { position: [3.22, 0.95, s * 1.0], parent: root });
    createPart('CylinderCapR_' + s, cylinderXGeo(0.34, 0.34, 0.1, 18), steel,
      { position: [2.18, 0.95, s * 1.0], parent: root });
    createPart('GuideBarTop_' + s, boxGeo(1.5, 0.06, 0.08), steel,
      { position: [1.45, 1.12, s * 1.0], parent: root });
    createPart('GuideBarBot_' + s, boxGeo(1.5, 0.06, 0.08), steel,
      { position: [1.45, 0.78, s * 1.0], parent: root });
    createPart('ValveChest_' + s, cylinderXGeo(0.16, 0.16, 0.9, 12), darkSteel,
      { position: [2.7, 1.38, s * 1.0], parent: root });
  }

  // ---------- driving wheels on real pivots (spoked + counterweight + crank) ----------
  const tireGeo = torusGeo(0.72, 0.1, 10, 30);
  const hubGeo = cylinderZGeo(0.15, 0.15, 0.2, 14);
  const spokeGeo = boxGeo(0.62, 0.1, 0.07);
  for (let i = 0; i < Xd.length; i++) {
    for (const s of [1, -1]) {
      const side = s > 0 ? 'R' : 'L';
      const j = createPivot('Driver' + (i + 1) + side, [Xd[i], Yd, s * Zdriver], root);
      createPart('Tire_D' + i + side, tireGeo, tireMat, { position: [0, 0, 0], parent: j });
      createPart('Hub_D' + i + side, hubGeo, darkSteel, { position: [0, 0, 0], parent: j });
      for (let k = 0; k < 12; k++) {
        const a = k * 30, rad = a * Math.PI / 180;
        createPart('Spoke_D' + i + side + '_' + k, spokeGeo, darkSteel,
          { position: [Math.cos(rad) * 0.42, Math.sin(rad) * 0.42, 0], rotation: [0, 0, a], parent: j });
      }
      createPart('Counterweight_D' + i + side, boxGeo(0.34, 0.5, 0.09), darkSteel,
        { position: [-0.42, 0, 0], parent: j });
      createPart('CounterweightTop_D' + i + side, boxGeo(0.5, 0.24, 0.09), darkSteel,
        { position: [-0.3, 0.28, 0], rotation: [0, 0, 25], parent: j });
      createPart('CrankPin_D' + i + side, cylinderZGeo(0.055, 0.055, 0.3, 10), rodSteel,
        { position: [crankR, 0, s * 0.16], parent: j });
    }
  }

  // ---------- pony + trailing truck wheels on pivots ----------
  const ponyTire = torusGeo(0.34, 0.07, 8, 22);
  const ponyDisc = cylinderZGeo(0.34, 0.34, 0.07, 20);
  const ponyHub = cylinderZGeo(0.09, 0.09, 0.16, 10);
  let pi = 0;
  for (const x of ponyX) for (const s of [1, -1]) {
    pi++;
    const j = createPivot('Pony' + pi, [x, ponyY, s * Zpony], root);
    createPart('PonyTire_' + pi, ponyTire, tireMat, { position: [0, 0, 0], parent: j });
    createPart('PonyDisc_' + pi, ponyDisc, darkSteel, { position: [0, 0, 0], parent: j });
    createPart('PonyHub_' + pi, ponyHub, steel, { position: [0, 0, 0], parent: j });
  }
  let ti = 0;
  for (const s of [1, -1]) {
    ti++;
    const j = createPivot('Trail' + ti, [trailX, trailY, s * Zpony], root);
    createPart('TrailTire_' + ti, ponyTire, tireMat, { position: [0, 0, 0], parent: j });
    createPart('TrailDisc_' + ti, ponyDisc, darkSteel, { position: [0, 0, 0], parent: j });
    createPart('TrailHub_' + ti, ponyHub, steel, { position: [0, 0, 0], parent: j });
  }
  createPart('PonyFrame', boxGeo(1.8, 0.22, 1.5), darkSteel, { position: [2.92, 0.72, 0], parent: root });
  createPart('TrailFrame', boxGeo(1.0, 0.22, 1.5), darkSteel, { position: [-3.35, 0.72, 0], parent: root });

  // ---------- coupling rods on pivots (orbit with crank circle) ----------
  for (const s of [1, -1]) {
    const side = s > 0 ? 'R' : 'L';
    const j = createPivot('Couple' + side, [-0.75, Yd, s * (Zdriver + 0.24)], root);
    createPart('CoupleBar_' + side, boxGeo(3.5, 0.15, 0.07), rodSteel, { position: [0, 0, 0], parent: j });
    for (const x of Xd) {
      createPart('RodBoss_' + side + '_' + x, cylinderZGeo(0.11, 0.11, 0.1, 12), rodSteel,
        { position: [x + 0.75, 0, 0], parent: j });
    }
  }

  // ---------- crossheads + main rods + valve stems on pivots ----------
  for (const s of [1, -1]) {
    const side = s > 0 ? 'R' : 'L';
    const jc = createPivot('Crosshead' + side, [1.45, 0.95, s * 1.0], root);
    createPart('CrossheadBlock_' + side, boxGeo(0.3, 0.22, 0.14), steel, { position: [0, 0, 0], parent: jc });
    createPart('PistonRod_' + side, cylinderXGeo(0.035, 0.035, 1.1, 8), rodSteel, { position: [0.7, 0, 0], parent: jc });
    createPart('CrossheadShoe_' + side, boxGeo(0.34, 0.06, 0.2), darkSteel, { position: [0, 0.11, 0], parent: jc });
    const jm = createPivot('MainRod' + side, [1.0, 0.9, s * (Zdriver + 0.24)], root);
    createPart('MainRodBar_' + side, boxGeo(1.9, 0.13, 0.06), rodSteel, { position: [0, 0, 0], parent: jm });
    createPart('MainRodBigEnd_' + side, cylinderZGeo(0.14, 0.14, 0.09, 14), rodSteel, { position: [-0.02, -0.08, 0], parent: jm });
    createPart('MainRodSmallEnd_' + side, cylinderZGeo(0.09, 0.09, 0.09, 12), rodSteel, { position: [0.45, 0.05, 0], parent: jm });
    createPart('EccentricRod_' + side, boxGeo(1.17, 0.07, 0.05), rodSteel, { position: [0.49, 0.2, 0], rotation: [0, 0, 28.7], parent: jm });
    const jv = createPivot('Valve' + side, [2.2, 1.38, s * 1.0], root);
    createPart('ValveStem_' + side, cylinderXGeo(0.03, 0.03, 1.2, 8), rodSteel, { position: [0, 0, 0], parent: jv });
    createPart('ValveBob_' + side, sphereGeo(0.05, 8, 6), rodSteel, { position: [0.6, 0, 0], parent: jv });
  }

  // ---------- cab ----------
  createPart('CabFloor', boxGeo(2.1, 0.1, cabW), darkSteel, { position: [-3.0, floorY, 0], parent: root });
  for (const s of [1, -1]) {
    createPart('CabSideLow_' + s, boxGeo(2.0, 1.0, 0.08), boilerGreen, { position: [-3.0, 2.15, s * 1.11], parent: root });
    createPart('CabPillarF_' + s, boxGeo(0.28, 0.75, 0.08), boilerGreen, { position: [-2.15, 3.0, s * 1.11], parent: root });
    createPart('CabPillarR_' + s, boxGeo(0.28, 0.75, 0.08), boilerGreen, { position: [-3.85, 3.0, s * 1.11], parent: root });
    createPart('CabTopRail_' + s, boxGeo(2.0, 0.22, 0.08), boilerGreen, { position: [-3.0, 3.5, s * 1.11], parent: root });
    createPart('CabGlass_' + s, boxGeo(1.44, 0.62, 0.02), glass, { position: [-3.0, 3.0, s * 1.11], parent: root });
    createPart('CabTrimLow_' + s, boxGeo(2.0, 0.08, 0.1), cabRed, { position: [-3.0, 2.68, s * 1.11], parent: root });
  }
  createPart('CabFrontLow', boxGeo(0.08, 1.0, cabW), boilerGreen, { position: [-2.0, 2.15, 0], parent: root });
  createPart('CabFrontMidL', boxGeo(0.08, 0.8, 0.62), boilerGreen, { position: [-2.0, 3.0, 0.72], parent: root });
  createPart('CabFrontMidR', boxGeo(0.08, 0.8, 0.62), boilerGreen, { position: [-2.0, 3.0, -0.72], parent: root });
  createPart('CabFrontMidC', boxGeo(0.08, 0.8, 0.5), boilerGreen, { position: [-2.0, 3.0, 0], parent: root });
  createPart('CabFrontTop', boxGeo(0.08, 0.3, cabW), boilerGreen, { position: [-2.0, 3.62, 0], parent: root });
  for (const s of [1, -1]) {
    createPart('CabFrontGlass_' + s, boxGeo(0.02, 0.55, 0.42), glass, { position: [-2.0, 3.05, s * 0.36], parent: root });
  }
  for (const s of [1, -1]) {
    createPart('CabRearPost_' + s, boxGeo(0.12, 2.3, 0.12), boilerGreen, { position: [-3.95, 2.75, s * 1.09], parent: root });
  }
  createPart('CabRearBeam', boxGeo(0.12, 0.25, cabW), boilerGreen, { position: [-3.95, 3.75, 0], parent: root });
  // The cab is 1.95 m long between its posts and 2.30 m across its outer
  // panels. A 2.70 by 2.90 roof overhung it by 0.375 m at each end and 0.30 m
  // at each side, which made the widest thing on the locomotive a flat plate
  // floating over the cab rather than a roof sitting on it. 0.20 m of eave all
  // round is what a cab roof actually carries.
  const cabRoofGeo = await roundedBoxGeo(2.35, 0.12, 2.7, 0.05);
  createPart('CabRoof', cabRoofGeo, roofBlack, { position: [-3.0, 3.94, 0], parent: root });
  createPart('Backhead', cylinderXGeo(0.7, 0.7, 0.5, 20), black, { position: [-2.1, 2.4, 0], parent: root });
  createPart('GaugePanel', boxGeo(0.06, 0.5, 0.9), roofBlack, { position: [-2.322, 2.95, 0], parent: root });
  for (const s of [1, -1]) {
    createPart('Gauge_' + s, cylinderXGeo(0.09, 0.09, 0.06, 12), brass, { position: [-2.35, 3.0, s * 0.25], parent: root });
    createPart('GaugeFace_' + s, cylinderXGeo(0.07, 0.07, 0.065, 12), whitewall, { position: [-2.35, 3.0, s * 0.25], parent: root });
    createPart('SeatPost_' + s, boxGeo(0.12, 0.55, 0.12), darkSteel, { position: [-3.5, 1.92, s * 0.7], parent: root });
    createPart('Seat_' + s, boxGeo(0.5, 0.1, 0.5), cabRed, { position: [-3.5, 2.2, s * 0.7], parent: root });
    createPart('SeatBack_' + s, boxGeo(0.1, 0.6, 0.5), cabRed, { position: [-3.72, 2.5, s * 0.7], parent: root });
  }
  createPart('ThrottleLever', boxGeo(0.06, 0.7, 0.06), steel, { position: [-2.5, 2.6, 0.4], rotation: [0, 0, -20], parent: root });
  createPart('FireboxDoor', boxGeo(0.1, 0.5, 0.5), copper, { position: [-2.38, 2.1, 0], parent: root });

  // ---------- cowcatcher (pilot) ----------
  beamBetween('PilotFrameL', [4.55, 1.3, 0.9], [5.35, 0.15, 0.9], 0.05, beamRed, { parent: root });
  beamBetween('PilotFrameR', [4.55, 1.3, -0.9], [5.35, 0.15, -0.9], 0.05, beamRed, { parent: root });
  beamBetween('PilotBottom', [5.35, 0.15, 0.95], [5.35, 0.15, -0.95], 0.05, beamRed, { parent: root });
  for (let k = 0; k < 9; k++) {
    const z = 0.8 - k * 0.2;
    beamBetween('PilotSlat_' + k, [4.55, 1.25, z * 0.9], [5.35, 0.15, z], 0.03, beamRed, { parent: root });
  }
  createPart('Coupler', boxGeo(0.4, 0.15, 0.15), darkSteel, { position: [4.7, 1.0, 0], parent: root });

  // ---------- headlamp + markers + plates ----------
  createPart('HeadlampBracket', boxGeo(0.15, 0.25, 0.15), black, { position: [3.9, 3.05, 0], parent: root });
  createPart('HeadlampBox', boxGeo(0.4, 0.5, 0.4), black, { position: [3.9, 3.45, 0], parent: root });
  createPart('HeadlampLens', boxGeo(0.06, 0.34, 0.3), lampLens, { position: [4.12, 3.45, 0], parent: root });
  createPart('HeadlampTop', coneGeo(0.28, 0.2, 4), black, { position: [3.9, 3.8, 0], rotation: [0, 45, 0], parent: root });
  for (const s of [1, -1]) {
    createPart('MarkerLamp_' + s, boxGeo(0.16, 0.22, 0.16), brass, { position: [4.5, 1.6, s * 1.0], parent: root });
  }
  createPart('NumberPlate', cylinderXGeo(0.16, 0.16, 0.04, 16), brass, { position: [4.32, 2.5, 0], parent: root });
  createPart('RoofVent', cylinderGeo(0.09, 0.12, 0.16, 10), black, { position: [-3.0, 4.06, 0], parent: root });
  createPart('RoofVentCap', cylinderGeo(0.14, 0.14, 0.05, 10), black, { position: [-3.0, 4.16, 0], parent: root });
  for (const lz of [-0.7, -0.3, 0.3, 0.7]) {
    createPart('LampIron_' + lz, boxGeo(0.04, 0.25, 0.04), darkSteel, { position: [4.63, 1.45, lz], parent: root });
  }

  // ---------- steps with hangers (attached) ----------
  for (const s of [1, -1]) {
    createPart('CabStep1_' + s, boxGeo(0.5, 0.06, 0.4), darkSteel, { position: [-3.2, 1.2, s * 1.05], parent: root });
    createPart('CabStep2_' + s, boxGeo(0.5, 0.06, 0.4), darkSteel, { position: [-3.2, 0.75, s * 1.05], parent: root });
    createPart('StepHangerF_' + s, boxGeo(0.06, 0.36, 0.06), darkSteel, { position: [-3.0, 1.38, s * 1.05], parent: root });
    createPart('StepHangerR_' + s, boxGeo(0.06, 0.36, 0.06), darkSteel, { position: [-3.4, 1.38, s * 1.05], parent: root });
    createPart('StepHangerLow_' + s, boxGeo(0.06, 0.45, 0.06), darkSteel, { position: [-3.2, 0.97, s * 1.05], parent: root });
    createPart('FrontStep_' + s, boxGeo(0.5, 0.06, 0.35), darkSteel, { position: [4.32, 1.0, s * 1.1], parent: root });
  }

  // smokebox rivet ring
  for (let k = 0; k < 16; k++) {
    const a = k * 22.5 * Math.PI / 180;
    createPart('Rivet_' + k, sphereGeo(0.03, 6, 4), darkSteel,
      { position: [4.06, 2.15 + Math.sin(a) * 0.88, Math.cos(a) * 0.88], parent: root });
  }

  return root;
}

function animate() {
  const dur = 1.2, N = 12;
  const crankR = 0.38, Yd = 0.82;
  const Xd1 = 0.6, Xc0 = 1.45, Yc = 0.95, Lrod = 1.9;
  function circleKeys(cx, cy, phase) {
    const ks = [];
    for (let i = 0; i <= N; i++) {
      const t = dur * i / N;
      const phi = -2 * Math.PI * i / N + phase;
      ks.push({ time: t, position: [cx + crankR * Math.cos(phi), cy + crankR * Math.sin(phi), 0] });
    }
    return ks;
  }
  function crossKeys(phase) {
    const ks = [];
    for (let i = 0; i <= N; i++) {
      const t = dur * i / N;
      const phi = -2 * Math.PI * i / N + phase;
      const yc = Yd + crankR * Math.sin(phi);
      const xc = Xd1 + crankR * Math.cos(phi);
      const dy = yc - Yc;
      const xcross = xc + Math.sqrt(Lrod * Lrod - dy * dy) - (Lrod - (Xc0 - Xd1));
      ks.push({ time: t, position: [xcross, 0, 0] });
    }
    return ks;
  }
  function mainRodKeys(phase) {
    const pk = [], rk = [];
    for (let i = 0; i <= N; i++) {
      const t = dur * i / N;
      const phi = -2 * Math.PI * i / N + phase;
      const yc = Yd + crankR * Math.sin(phi);
      const xc = Xd1 + crankR * Math.cos(phi);
      const dy = yc - Yc;
      const xcross = xc + Math.sqrt(Lrod * Lrod - dy * dy) - (Lrod - (Xc0 - Xd1));
      const mx = (xc + xcross) / 2, my = (yc + Yc) / 2;
      pk.push({ time: t, position: [mx - 1.0, my - 0.9, 0] });
      const ang = Math.atan2(yc - Yc, xcross - xc) * 180 / Math.PI;
      rk.push({ time: t, rotation: [0, 0, ang] });
    }
    return { pk, rk };
  }
  const tracks = [];
  for (const n of ['Joint_Driver1L', 'Joint_Driver2L', 'Joint_Driver3L'])
    tracks.push(rotationTrack(n, [{ time: 0, rotation: [0, 0, 0] }, { time: dur, rotation: [0, 0, -360] }]));
  for (const n of ['Joint_Driver1R', 'Joint_Driver2R', 'Joint_Driver3R'])
    tracks.push(rotationTrack(n, [{ time: 0, rotation: [0, 0, -90] }, { time: dur, rotation: [0, 0, -450] }]));
  for (let i = 1; i <= 4; i++)
    tracks.push(rotationTrack('Joint_Pony' + i, [{ time: 0, rotation: [0, 0, 0] }, { time: dur, rotation: [0, 0, -720] }]));
  for (let i = 1; i <= 2; i++)
    tracks.push(rotationTrack('Joint_Trail' + i, [{ time: 0, rotation: [0, 0, 0] }, { time: dur, rotation: [0, 0, -720] }]));
  tracks.push(positionTrack('Joint_CoupleL', circleKeys(-0.75, Yd, 0)));
  tracks.push(positionTrack('Joint_CoupleR', circleKeys(-0.75, Yd, -Math.PI / 2)));
  tracks.push(positionTrack('Joint_CrossheadL', crossKeys(0)));
  tracks.push(positionTrack('Joint_CrossheadR', crossKeys(-Math.PI / 2)));
  const mL = mainRodKeys(0), mR = mainRodKeys(-Math.PI / 2);
  tracks.push(positionTrack('Joint_MainRodL', mL.pk));
  tracks.push(rotationTrack('Joint_MainRodL', mL.rk));
  tracks.push(positionTrack('Joint_MainRodR', mR.pk));
  tracks.push(rotationTrack('Joint_MainRodR', mR.rk));
  function valveKeys(phase) {
    const ks = [];
    for (let i = 0; i <= N; i++) {
      const t = dur * i / N;
      const phi = -2 * Math.PI * i / N + phase;
      ks.push({ time: t, position: [0.12 * Math.cos(phi + 1.2), 0, 0] });
    }
    return ks;
  }
  tracks.push(positionTrack('Joint_ValveL', valveKeys(0)));
  tracks.push(positionTrack('Joint_ValveR', valveKeys(-Math.PI / 2)));
  return [createClip('Drive', dur, tracks)];
}
