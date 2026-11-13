// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 4 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opencode-go/glm-5.3-flash, via opencode.
//
// Repaired by hand afterwards: the backbox was built entirely behind the
// cabinet's rear face and cantilevered on nothing. Sliding it forward onto the
// cabinet only traded one fault for another, because the playfield runs the
// cabinet's full length -- anything the head gains in support it takes out of
// the glass. So the cabinet grew the bay a real machine has: it is 1.34 m long
// rather than 1.14, its rear face is at x = -0.82, its back legs moved with it,
// and the head now sits on that bay entirely behind the playfield glass. The
// backbox itself is unchanged apart from being 0.20 m deep instead of 0.38.
// Nothing else in the program was touched.
//
// Written by the model itself through the Kiln MCP tools, and cut off
// mid-run rather than finished -- by a provider limit, or by the
// dispatch deadline. The program below is what was on disk when the
// session ended; how many times it had looked at its own contact sheet
// by then is not recorded, so this one does not make the claim the
// others do.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'PinballMachine', category: 'prop', role: 'prop' };

const glow = (hex, i) => gameMaterial(hex, { emissive: hex, emissiveIntensity: i });

async function build() {
  const root = createRoot('PinballMachine');

  const woodDark = gameMaterial(0x3b2a1d, { roughness: 0.65 });
  const woodInner = gameMaterial(0x241a12, { roughness: 0.85 });
  const chrome = gameMaterial(0xd9dee2, { metalness: 0.9, roughness: 0.22 });
  const steelDark = gameMaterial(0x5a5f64, { metalness: 0.85, roughness: 0.4 });
  const blackTrim = gameMaterial(0x141414, { roughness: 0.6 });
  const navyArt = gameMaterial(0x16306b, { roughness: 0.7 });
  const pfBlue = gameMaterial(0x1b4f8a, { roughness: 0.6 });
  const artOrange = gameMaterial(0xe07b1f, { roughness: 0.6 });
  const artRed = gameMaterial(0xc23327, { roughness: 0.55 });
  const artYellow = gameMaterial(0xe9c630, { roughness: 0.55 });
  const artCream = gameMaterial(0xf2e8cf, { roughness: 0.6 });
  const rubberYellow = gameMaterial(0xf0c419, { roughness: 0.9 });
  const bumperRed = gameMaterial(0xd23b2e, { roughness: 0.5 });
  const bumperBlue = gameMaterial(0x2e6fd2, { roughness: 0.5 });
  const glassMat = glassMaterial(0xcfe4f2, { opacity: 0.16 });
  const reelWhite = gameMaterial(0xf5f1e4, { roughness: 0.5 });
  const bgIndigo = glow(0x1a2452, 0.3);
  const bgOrange = glow(0xe07b1f, 0.55);
  const bgRed = glow(0xc23327, 0.5);
  const bgYellow = glow(0xe9c630, 0.55);
  const bgCream = glow(0xf2e8cf, 0.5);

  const add = (name, geo, mat, pos, rot, parent) => {
    const opts = { position: pos, parent: parent || root };
    if (rot) opts.rotation = rot;
    return createPart(name, geo, mat, opts);
  };

  const SLOPE = -4 * Math.PI / 180;

  // Legs
  for (const [lx, lz] of [[0.42, 0.225], [0.42, -0.225], [-0.72, 0.225], [-0.72, -0.225]]) {
    add('LegWood', cylinderGeo(0.030, 0.021, 0.52, 10), woodDark, [lx, 0.315, lz]);
    add('LegLeveler', cylinderGeo(0.016, 0.016, 0.04, 8), chrome, [lx, 0.035, lz]);
    add('LegFoot', cylinderGeo(0.020, 0.022, 0.012, 10), blackTrim, [lx, 0.006, lz]);
    add('LegPlate', boxGeo(0.06, 0.008, 0.06), chrome, [lx, 0.579, lz]);
  }

  // Cabinet
  add('CabinetBottom', boxGeo(1.332, 0.03, 0.476), woodInner, [-0.15, 0.592, 0]);
  add('CabinetFrontWall', boxGeo(0.03, 0.19, 0.52), woodDark, [0.505, 0.67, 0]);
  add('CabinetBackWall', boxGeo(0.03, 0.27, 0.52), woodDark, [-0.805, 0.71, 0]);
  const wallProfile = [[-0.82, 0], [0.52, 0], [0.52, 0.19], [-0.82, 0.27]];
  add('SideWallRight', await extrudeProfile(wallProfile, { depth: 0.022, axis: 'z', center: true }), woodDark, [0, 0.575, 0.249]);
  add('SideWallLeft', await extrudeProfile(wallProfile, { depth: 0.022, axis: 'z', center: true }), woodDark, [0, 0.575, -0.249]);

  // Playfield group (sloped)
  const pf = createPivot('PlayfieldGroup', [-0.05, 0.755, 0], root);
  pf.rotation.z = SLOPE;

  add('PlayfieldBoard', boxGeo(1.13, 0.02, 0.46), pfBlue, [0, -0.011, 0], null, pf);
  add('Glass', boxGeo(1.14, 0.005, 0.475), glassMat, [0, 0.0565, 0], null, pf);
  add('SideRailRight', boxGeo(1.14, 0.05, 0.024), chrome, [0.005, 0.025, 0.246], null, pf);
  add('SideRailLeft', boxGeo(1.14, 0.05, 0.024), chrome, [0.005, 0.025, -0.246], null, pf);
  add('LockdownBar', await roundedBoxGeo(0.055, 0.026, 0.50, 0.01), chrome, [0.575, 0.068, 0], null, pf);

  // Shooter lane
  add('LaneWall', boxGeo(0.90, 0.018, 0.010), artCream, [0.10, 0.009, -0.195], null, pf);
  add('Ball', sphereGeo(0.0135, 10, 8), chrome, [0.30, 0.0145, -0.218], null, pf);

  // Playfield art
  const ring = (name, r, tube, mat, x, z, parent) =>
    add(name, torusGeo(r, tube, 6, 20), mat, [x, 0.004, z], [90, 0, 0], parent);
  ring('ArtRingA', 0.085, 0.008, artOrange, -0.38, 0.015, pf);
  add('ArtDiscA', cylinderYGeo(0.03, 0.03, 0.004, 16), artYellow, [-0.38, 0.002, 0.015], null, pf);
  ring('ArtRingB', 0.07, 0.008, artRed, -0.18, 0.16, pf);
  add('ArtDiscB', cylinderYGeo(0.025, 0.025, 0.004, 16), artCream, [-0.18, 0.002, 0.16], null, pf);
  ring('ArtRingC', 0.07, 0.008, artOrange, -0.18, -0.13, pf);
  for (const [i, lz] of [0.075, 0.015, -0.045].entries())
    add('LaneStrip' + i, boxGeo(0.02, 0.002, 0.05), artCream, [-0.50, 0.001, lz], null, pf);
  for (const [i, lz] of [0.045, -0.015].entries())
    add('RolloverStar' + i, cylinderYGeo(0.009, 0.009, 0.003, 10), artYellow, [-0.50, 0.0015, lz], null, pf);

  // Pop bumpers
  const bumpers = [[-0.40, -0.055, bumperRed], [-0.40, 0.085, bumperBlue], [-0.27, 0.015, artYellow]];
  for (const [i, [bx, bz, mat]] of bumpers.entries()) {
    add('BumperBase' + i, cylinderYGeo(0.042, 0.042, 0.010, 14), artCream, [bx, 0.005, bz], null, pf);
    add('BumperBody' + i, cylinderYGeo(0.028, 0.028, 0.032, 14), mat, [bx, 0.026, bz], null, pf);
    add('BumperCap' + i, cylinderYGeo(0.018, 0.018, 0.008, 12), chrome, [bx, 0.046, bz], null, pf);
    add('BumperSkirt' + i, torusGeo(0.036, 0.004, 6, 16), blackTrim, [bx, 0.012, bz], [90, 0, 0], pf);
  }

  // Targets
  for (const [i, tz] of [0.05, 0.082, 0.114].entries())
    add('DropTarget' + i, boxGeo(0.005, 0.02, 0.016), artCream, [-0.14, 0.012, tz], null, pf);
  for (const [i, tz] of [-0.17, 0.17].entries())
    add('StandupTarget' + i, boxGeo(0.006, 0.022, 0.03), bumperRed, [-0.50, 0.013, tz], null, pf);

  // Spinner
  add('SpinnerPostL', cylinderYGeo(0.004, 0.004, 0.026, 8), chrome, [-0.44, 0.013, 0.030], null, pf);
  add('SpinnerPostR', cylinderYGeo(0.004, 0.004, 0.026, 8), chrome, [-0.44, 0.013, 0.0], null, pf);
  add('SpinnerFlap', boxGeo(0.0015, 0.026, 0.024), steelDark, [-0.44, 0.016, 0.015], null, pf);

  // Posts and rubbers
  const posts = [[0.28, 0.135], [0.28, -0.105], [0.40, 0.135], [0.40, -0.105], [-0.33, 0.185], [-0.33, -0.155]];
  for (const [i, [px, pz]] of posts.entries()) {
    add('Post' + i, cylinderYGeo(0.0045, 0.0055, 0.02, 8), artCream, [px, 0.010, pz], null, pf);
    if (i < 4) add('PostRubber' + i, torusGeo(0.011, 0.0025, 6, 12), rubberYellow, [px, 0.012, pz], [90, 0, 0], pf);
  }

  // Slingshots
  const slingL = [[0.12, 0.14], [0.27, 0.14], [0.12, 0.205]];
  const slingR = [[0.27, -0.11], [0.12, -0.11], [0.12, -0.175]];
  add('SlingBodyL', await extrudeProfile(slingL, { depth: 0.012, axis: 'y', center: true, bevel: 0.004 }), rubberYellow, [0, 0.006, 0], null, pf);
  add('SlingBodyR', await extrudeProfile(slingR, { depth: 0.012, axis: 'y', center: true, bevel: 0.004 }), rubberYellow, [0, 0.006, 0], null, pf);
  beamBetween('SlingBandL', [0.12, 0.014, 0.205], [0.27, 0.014, 0.14], 0.004, artRed, { parent: pf });
  beamBetween('SlingBandR', [0.12, 0.014, -0.175], [0.27, 0.014, -0.11], 0.004, artRed, { parent: pf });

  // Flippers
  const flipOutline = [[-0.052, 0.026], [-0.028, 0.032], [0.018, 0.021], [0.058, 0.0], [0.018, -0.021], [-0.028, -0.032], [-0.052, -0.026]];
  const flipGeo = await extrudeProfile(flipOutline, { depth: 0.013, axis: 'y', center: true, bevel: 0.005 });
  add('FlipperLeft', flipGeo, rubberYellow, [0.33, 0.0065, 0.085], [0, 25, 0], pf);
  add('FlipperRight', flipGeo, rubberYellow, [0.33, 0.0065, -0.055], [0, -25, 0], pf);

  // Apron
  const apronOutline = [[0.40, -0.175], [0.545, -0.045], [0.545, 0.075], [0.40, 0.195]];
  add('Apron', await extrudeProfile(apronOutline, { depth: 0.008, axis: 'y', center: true }), navyArt, [0, 0.004, 0], null, pf);
  beamBetween('ApronTrim', [0.545, 0.010, 0.075], [0.545, 0.010, -0.045], 0.004, chrome, { parent: pf });

  // Wire ramps
  const rampCtrl = [
    [[-0.30, 0.030, 0.16], [-0.05, 0.046, 0.20], [0.15, 0.030, 0.185], [0.30, 0.008, 0.13]],
    [[-0.30, 0.030, -0.16], [-0.05, 0.046, -0.20], [0.15, 0.030, -0.185], [0.30, 0.008, -0.13]]
  ];
  for (const [ri, ctrl] of rampCtrl.entries()) {
    const path = bezierCurve(ctrl, 24);
    for (const [si, dz] of [-0.016, 0.016].entries()) {
      const pts = path.map(p => [p[0], p[1], p[2] + dz]);
      add('RampRail' + ri + si, pipeAlongPath(pts, 0.0035, { bendRadius: 0.02, radialSegments: 6 }), steelDark, [0, 0, 0], null, pf);
    }
    beamBetween('RampLeg' + ri + 'a', [-0.05, 0.042, ctrl[1][2]], [-0.05, 0.001, ctrl[1][2]], 0.003, steelDark, { parent: pf });
    beamBetween('RampLeg' + ri + 'b', [0.15, 0.026, ctrl[2][2]], [0.15, 0.001, ctrl[2][2]], 0.003, steelDark, { parent: pf });
  }

  // Backbox
  add('BackboxBottom', boxGeo(0.20, 0.025, 0.47), woodDark, [-0.72, 0.8575, 0]);
  add('BackboxSideRight', boxGeo(0.20, 0.935, 0.02), woodDark, [-0.72, 1.3125, 0.225]);
  add('BackboxSideLeft', boxGeo(0.20, 0.935, 0.02), woodDark, [-0.72, 1.3125, -0.225]);
  add('BackboxBack', boxGeo(0.025, 0.935, 0.47), woodDark, [-0.8075, 1.3125, 0]);
  add('BackboxTop', boxGeo(0.24, 0.03, 0.49), woodDark, [-0.705, 1.77, 0]);
  add('BackboxFrameBottom', boxGeo(0.02, 0.05, 0.45), woodDark, [-0.62, 0.895, 0]);
  add('BackboxFrameTop', boxGeo(0.02, 0.05, 0.45), woodDark, [-0.62, 1.725, 0]);
  add('BackboxStileRight', boxGeo(0.02, 0.83, 0.025), woodDark, [-0.62, 1.31, 0.2125]);
  add('BackboxStileLeft', boxGeo(0.02, 0.83, 0.025), woodDark, [-0.62, 1.31, -0.2125]);

  // Backglass
  add('BackglassPanel', boxGeo(0.012, 0.78, 0.42), bgIndigo, [-0.625, 1.31, 0]);
  add('BackglassRingOuter', torusGeo(0.19, 0.014, 8, 28), bgRed, [-0.612, 1.44, 0], [0, 90, 0]);
  add('BackglassRingInner', torusGeo(0.13, 0.013, 8, 24), bgOrange, [-0.614, 1.44, 0], [0, 90, 0]);
  add('BackglassSun', cylinderXGeo(0.075, 0.075, 0.006, 20), bgYellow, [-0.615, 1.44, 0]);
  add('RocketBody', cylinderXGeo(0.016, 0.016, 0.09, 12), chrome, [-0.612, 1.14, -0.10]);
  add('RocketNose', coneXGeo(0.016, 0.045, 12), bgRed, [-0.557, 1.14, -0.10]);
  add('RocketFinTop', boxGeo(0.004, 0.03, 0.014), bgRed, [-0.645, 1.16, -0.10]);
  add('RocketFinBottom', boxGeo(0.004, 0.03, 0.014), bgRed, [-0.645, 1.12, -0.10]);
  add('RocketFlame', coneXGeo(0.010, 0.035, 8), bgOrange, [-0.665, 1.14, -0.10], [0, 0, 180]);
  for (const [i, [sy, sz]] of [[1.60, 0.14], [1.55, -0.16], [1.30, 0.17], [1.25, -0.17], [1.05, 0.10]].entries())
    add('BackglassStar' + i, cylinderXGeo(0.006, 0.006, 0.004, 8), bgCream, [-0.617, sy, sz]);
  add('BackglassBanner', boxGeo(0.008, 0.065, 0.40), bgYellow, [-0.616, 1.655, 0]);
  for (const [i, lz] of [-0.135, -0.09, -0.045, 0, 0.045, 0.09, 0.135].entries())
    add('BannerLetter' + i, decalBox(0.018, 0.03, 0.003), blackTrim, [-0.611, 1.655, lz], [0, 90, 0]);

  // Score window and reels
  add('ScoreWindowGlass', boxGeo(0.011, 0.07, 0.396), glassMat, [-0.6265, 0.957, 0]);
  for (const [i, lz] of [-0.135, -0.045, 0.045, 0.135].entries()) {
    add('ScoreReel' + i, cylinderXGeo(0.03, 0.03, 0.05, 14), reelWhite, [-0.68, 0.955, lz]);
    add('ScoreDigits' + i, decalBox(0.022, 0.026, 0.002), blackTrim, [-0.6545, 0.955, lz], [0, 90, 0]);
  }
  add('ScoreBackdrop', boxGeo(0.006, 0.10, 0.42), blackTrim, [-0.715, 0.955, 0]);
  add('ScoreFrameTop', boxGeo(0.012, 0.012, 0.42), artRed, [-0.621, 0.995, 0]);
  add('ScoreFrameBottom', boxGeo(0.012, 0.012, 0.42), artRed, [-0.621, 0.915, 0]);

  // Coin door
  add('CoinDoorPlate', await roundedBoxGeo(0.20, 0.15, 0.016, 0.006), chrome, [0.524, 0.66, 0.02]);
  add('CoinSlotL', decalBox(0.026, 0.007, 0.004), blackTrim, [0.534, 0.695, -0.03], [0, 90, 0]);
  add('CoinSlotR', decalBox(0.026, 0.007, 0.004), blackTrim, [0.534, 0.695, 0.07], [0, 90, 0]);
  add('RejectButtonL', cylinderXGeo(0.008, 0.008, 0.006, 10), bumperRed, [0.534, 0.66, -0.03]);
  add('RejectButtonR', cylinderXGeo(0.008, 0.008, 0.006, 10), bumperRed, [0.534, 0.66, 0.07]);
  add('CoinDoorLock', cylinderXGeo(0.011, 0.011, 0.01, 10), steelDark, [0.535, 0.715, -0.055]);
  add('CoinDoorLip', boxGeo(0.014, 0.012, 0.21), chrome, [0.527, 0.583, 0.02]);

  // Plunger
  add('PlungerRod', cylinderXGeo(0.008, 0.008, 0.11, 10), chrome, [0.545, 0.723, -0.208]);
  add('PlungerKnob', cylinderXGeo(0.023, 0.026, 0.024, 12), bumperRed, [0.607, 0.723, -0.208]);
  add('PlungerEscutcheon', cylinderXGeo(0.017, 0.017, 0.008, 10), chrome, [0.523, 0.723, -0.208]);

  // Side art
  for (const s of [1, -1]) {
    add('SideStripeOrange' + s, boxGeo(0.85, 0.04, 0.005), artOrange, [-0.10, 0.665, s * 0.2625]);
    add('SideStripeCream' + s, boxGeo(0.85, 0.015, 0.005), artCream, [-0.10, 0.635, s * 0.263]);
    add('SideDiscOuter' + s, cylinderZGeo(0.045, 0.045, 0.005, 18), artOrange, [-0.42, 0.655, s * 0.265]);
    add('SideDiscInner' + s, cylinderZGeo(0.028, 0.028, 0.006, 18), artCream, [-0.42, 0.655, s * 0.267]);
    add('BackboxSideDisc' + s, cylinderZGeo(0.06, 0.06, 0.004, 18), bgOrange, [-0.72, 1.35, s * 0.236]);
  }

  return root;
}
