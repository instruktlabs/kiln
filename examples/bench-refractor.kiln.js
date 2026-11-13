// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = { name: 'Bench Refractor Comparator', category: 'prop', role: 'prop' };
// Curation of supplied source 'Articulated Observatory Instrument' from Muse's
// earlier clean-room workflow test (provided-instrument.kiln.js). That plain
// tube-on-tripod is the starting point only: this revision redesigns it as a
// compact bench-top precision refractor with a lofted pier, yoke mount,
// segmented ribbed barrel and a genuinely recessed objective with visible
// internal optics, plus a sliding focus assembly. Credit to the Muse source.

const TILT_DEG = -52;
const FOCUS_BASE_Y = -0.20;
const FOCUS_TRAVEL = 0.05;

function ringPts(n, r, cx, cz) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return p;
}
function octPts(rx, rz, cx, cz) {
  const p = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    p.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
  }
  return p;
}
function rectPts(cx, cz, hx, hz) {
  return [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];
}

async function build() {
  const root = createRoot('BenchComparator');
  const enamel = gameMaterial(0x33454c, { metalness: 0.35, roughness: 0.45 });
  const brass = gameMaterial(0xb08a3e, { metalness: 0.85, roughness: 0.32 });
  const steel = gameMaterial(0x9aa2ab, { metalness: 0.85, roughness: 0.35 });
  const ironDark = gameMaterial(0x1d2126, { metalness: 0.55, roughness: 0.6 });
  const rubber = gameMaterial(0x141414, { metalness: 0.0, roughness: 0.9 });
  const lensGlass = glassMaterial(0x8fc8ff, { opacity: 0.35, roughness: 0.08, metalness: 0.1 });

  // ---- Asymmetric base: tapered wedge plate + 3 leveling feet ----
  const base = createPivot('Base', [0, 0, 0], root);
  const plateGeo = loftProfiles([
    { profile: rectPts(-0.02, 0, 0.36, 0.18) },
    { profile: rectPts(0.0, 0, 0.30, 0.15), frame: { origin: [0, 0.065, 0], rotation: [0, 0, 0] } },
  ]);
  createPart('BasePlate', plateGeo, enamel, { position: [0, 0.02, 0], parent: base });
  const footXZ = [[0.24, 0.11], [0.24, -0.12], [-0.27, -0.04]];
  footXZ.forEach(([fx, fz], i) => {
    createPart('FootPad' + i, cylinderGeo(0.045, 0.052, 0.02, 20), ironDark, { position: [fx, 0.01, fz], parent: base });
    createPart('FootBall' + i, sphereGeo(0.018, 12, 8), steel, { position: [fx, 0.028, fz], parent: base });
    createPart('LevelScrew' + i, cylinderGeo(0.011, 0.011, 0.10, 10), steel, { position: [fx, 0.075, fz], parent: base });
    createPart('TommyBar' + i, cylinderXGeo(0.005, 0.005, 0.10, 8), brass, { position: [fx, 0.115, fz], parent: base });
  });
  beamBetween('OutriggerArm', [-0.18, 0.05, -0.02], [-0.27, 0.05, -0.04], 0.022, enamel, { parent: base });
  createPart('VialBase', boxGeo(0.09, 0.012, 0.03), brass, { position: [0.12, 0.091, 0.09], parent: base });
  createPart('VialGlass', cylinderZGeo(0.011, 0.011, 0.074, 12), lensGlass, { position: [0.12, 0.103, 0.09], parent: base });
  createPart('VialCapA', cylinderZGeo(0.013, 0.013, 0.008, 10), brass, { position: [0.12, 0.103, 0.129], parent: base });
  createPart('VialCapB', cylinderZGeo(0.013, 0.013, 0.008, 10), brass, { position: [0.12, 0.103, 0.051], parent: base });

  // ---- Lofted pier: swept tapered housing ----
  const pierGeo = loftProfiles([
    { profile: octPts(0.20, 0.13, 0.0, 0.0) },
    { profile: octPts(0.135, 0.105, 0.01, 0.0), frame: { origin: [0, 0.215, 0], rotation: [0, 0, 0] } },
    { profile: octPts(0.10, 0.085, 0.02, 0.0), frame: { origin: [0, 0.435, 0], rotation: [0, 0, 0] } },
    { profile: octPts(0.115, 0.075, 0.03, 0.0), frame: { origin: [0, 0.615, 0], rotation: [0, 0, 0] } },
  ]);
  createPart('Pier', pierGeo, enamel, { position: [0, 0.085, 0], parent: root });
  createPart('PierCollar', torusGeo(0.115, 0.010, 8, 24), brass, { position: [0.025, 0.42, 0], rotation: [90, 0, 0], parent: root });

  // ---- Yoke fork with exposed elevation adjustment ----
  const yoke = createPivot('Yoke', [0, 0, 0], root);
  createPart('YokeCrossbar', boxGeo(0.24, 0.05, 0.18), enamel, { position: [0.03, 0.71, 0], parent: yoke });
  createPart('CheekL', boxGeo(0.09, 0.24, 0.028), enamel, { position: [0.03, 0.80, 0.085], parent: yoke });
  createPart('CheekR', boxGeo(0.09, 0.24, 0.028), enamel, { position: [0.03, 0.80, -0.085], parent: yoke });
  createPart('CheekBoltL', cylinderZGeo(0.009, 0.009, 0.04, 6), brass, { position: [0.03, 0.74, 0.085], parent: yoke });
  createPart('CheekBoltR', cylinderZGeo(0.009, 0.009, 0.04, 6), brass, { position: [0.03, 0.74, -0.085], parent: yoke });
  // elevation handwheel: faceted brass disc + rim teeth + hub
  createPart('ElevWheel', cylinderZGeo(0.075, 0.075, 0.024, 28), brass, { position: [0.03, 0.88, 0.115], parent: yoke });
  createPart('ElevHub', cylinderZGeo(0.016, 0.016, 0.04, 12), steel, { position: [0.03, 0.88, 0.115], parent: yoke });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 360;
    const r = a * Math.PI / 180;
    createPart('WheelTooth' + i, boxGeo(0.012, 0.012, 0.024), brass, {
      position: [0.03 + Math.cos(r) * 0.075, 0.88 + Math.sin(r) * 0.075, 0.115],
      rotation: [0, 0, a], parent: yoke
    });
  }
  createPart('ElevPinion', cylinderZGeo(0.028, 0.028, 0.03, 12), steel, { position: [0.10, 0.815, 0.115], parent: yoke });
  beamBetween('CrankArm', [0.10, 0.815, 0.13], [0.10, 0.775, 0.15], 0.007, steel, { parent: yoke });
  createPart('CrankKnob', sphereGeo(0.014, 10, 8), rubber, { position: [0.10, 0.768, 0.153], parent: yoke });

  // ---- Tilted optical assembly ----
  const tilt = createPivot('TiltCradle', [0.03, 0.88, 0], root);
  tilt.rotation.z = TILT_DEG * Math.PI / 180;
  createPart('TrunnionL', cylinderZGeo(0.032, 0.032, 0.05, 16), brass, { position: [0, 0, 0.085], parent: tilt });
  createPart('TrunnionR', cylinderZGeo(0.032, 0.032, 0.05, 16), brass, { position: [0, 0, -0.085], parent: tilt });
  createPart('CradlePlate', boxGeo(0.035, 0.34, 0.16), ironDark, { position: [0.10, 0.05, 0], parent: tilt });
  createPart('RiserA', boxGeo(0.05, 0.05, 0.06), enamel, { position: [0.075, -0.03, 0.04], parent: tilt });
  createPart('RiserB', boxGeo(0.05, 0.05, 0.06), enamel, { position: [0.075, 0.22, -0.04], parent: tilt });
  createPart('Dovetail', boxGeo(0.035, 0.30, 0.075), steel, { position: [0.078, 0.10, 0], parent: tilt });

  // main barrel: segmented lofted housing (solid, capped)
  const barrelGeo = loftProfiles([
    { profile: ringPts(16, 0.056, 0, 0) },
    { profile: ringPts(16, 0.062, 0, 0), frame: { origin: [0, 0.12, 0], rotation: [0, 0, 0] } },
    { profile: ringPts(16, 0.067, 0, 0), frame: { origin: [0, 0.26, 0], rotation: [0, 0, 0] } },
    { profile: ringPts(16, 0.071, 0, 0), frame: { origin: [0, 0.38, 0], rotation: [0, 0, 0] } },
  ]);
  createPart('Barrel', barrelGeo, enamel, { position: [0, -0.16, 0], parent: tilt });
  createPart('RearCap', cylinderGeo(0.057, 0.057, 0.03, 20), ironDark, { position: [0, -0.165, 0], parent: tilt });
  [[-0.04, 0.058], [0.10, 0.064], [0.24, 0.069]].forEach(([by, br], i) => {
    createPart('Band' + i, torusGeo(br + 0.002, 0.006, 8, 28), brass, { position: [0, by, 0], rotation: [90, 0, 0], parent: tilt });
  });
  // swept ribs hugging the taper (half-embedded, never floating)
  const ribDirs = [[0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
  ribDirs.forEach(([dx, dz], i) => {
    const stations = [[-0.10, 0.057], [0.10, 0.065], [0.33, 0.071]];
    const path = stations.map(([sy, sr]) => [dx * (sr - 0.001), sy, dz * (sr - 0.001)]);
    const ribGeo = sweepProfile([[-0.005, -0.003], [0.005, -0.003], [0.005, 0.003], [-0.005, 0.003]], path, { up: [0, 0, 1] });
    createPart('Rib' + i, ribGeo, ironDark, { parent: tilt });
  });

  // ---- Open objective: bell shroud (open loft) + recessed optics ----
  const bellGeo = loftProfiles([
    { profile: ringPts(24, 0.071, 0, 0) },
    { profile: ringPts(24, 0.086, 0, 0), frame: { origin: [0, 0.08, 0], rotation: [0, 0, 0] } },
    { profile: ringPts(24, 0.099, 0, 0), frame: { origin: [0, 0.14, 0], rotation: [0, 0, 0] } },
    { profile: ringPts(24, 0.103, 0, 0), frame: { origin: [0, 0.17, 0], rotation: [0, 0, 0] } },
  ], { cap: false });
  createPart('BellShroud', bellGeo, enamel, { position: [0, 0.22, 0], parent: tilt });
  createPart('BoreFloor', cylinderGeo(0.095, 0.095, 0.008, 24), ironDark, { position: [0, 0.281, 0], parent: tilt });
  createPart('ObjectiveLens', cylinderGeo(0.068, 0.068, 0.006, 28), lensGlass, { position: [0, 0.286, 0], parent: tilt });
  createPart('ApertureStop', torusGeo(0.068, 0.005, 8, 28), brass, { position: [0, 0.291, 0], rotation: [90, 0, 0], parent: tilt });
  createPart('BaffleA', torusGeo(0.082, 0.005, 8, 28), ironDark, { position: [0, 0.315, 0], rotation: [90, 0, 0], parent: tilt });
  createPart('BaffleB', torusGeo(0.090, 0.005, 8, 28), ironDark, { position: [0, 0.345, 0], rotation: [90, 0, 0], parent: tilt });
  createPart('RimLip', torusGeo(0.099, 0.013, 10, 32), brass, { position: [0, 0.39, 0], rotation: [90, 0, 0], parent: tilt });

  // ---- FocusSlide: named movable focusing assembly (slides along barrel Y) ----
  const slide = createPivot('FocusSlide', [0, FOCUS_BASE_Y, 0], tilt);
  createPart('Drawtube', cylinderGeo(0.030, 0.030, 0.14, 16), steel, { position: [0, 0.0, 0], parent: slide });
  createPart('DrawtubeCollar', torusGeo(0.031, 0.006, 8, 20), brass, { position: [0, 0.055, 0], rotation: [90, 0, 0], parent: slide });
  for (let i = 0; i < 7; i++) {
    createPart('RackTooth' + i, boxGeo(0.010, 0.008, 0.014), brass, { position: [0.032, -0.045 + i * 0.014, 0], parent: slide });
  }
  createPart('Eyecup', cylinderGeo(0.030, 0.034, 0.035, 16), rubber, { position: [0, -0.085, 0], parent: slide });
  createPart('EyeLens', cylinderGeo(0.018, 0.018, 0.004, 16), lensGlass, { position: [0, -0.066, 0], parent: slide });
  // barrel-fixed pinion driving the rack (stays while slide moves)
  createPart('PinionBracketA', boxGeo(0.03, 0.03, 0.02), ironDark, { position: [0.045, -0.17, 0.03], parent: tilt });
  createPart('PinionBracketB', boxGeo(0.03, 0.03, 0.02), ironDark, { position: [0.045, -0.17, -0.03], parent: tilt });
  createPart('FocusShaft', cylinderZGeo(0.007, 0.007, 0.11, 10), steel, { position: [0.045, -0.17, 0], parent: tilt });
  createPart('FocusKnobA', cylinderZGeo(0.020, 0.020, 0.022, 16), rubber, { position: [0.045, -0.17, 0.062], parent: tilt });
  createPart('FocusKnobB', cylinderZGeo(0.020, 0.020, 0.022, 16), rubber, { position: [0.045, -0.17, -0.062], parent: tilt });
  createPart('FocusGear', cylinderZGeo(0.020, 0.020, 0.016, 12), brass, { position: [0.032, -0.17, 0], parent: tilt });

  // ---- Finder scope (side-mounted, bracketed, attached) ----
  createPart('FinderTube', cylinderGeo(0.018, 0.018, 0.22, 14), ironDark, { position: [-0.092, 0.10, 0], parent: tilt });
  createPart('FinderLens', cylinderGeo(0.016, 0.016, 0.004, 14), lensGlass, { position: [-0.092, 0.210, 0], parent: tilt });
  createPart('FinderCup', cylinderGeo(0.020, 0.022, 0.03, 14), rubber, { position: [-0.092, -0.015, 0], parent: tilt });
  createPart('FinderBracketA', boxGeo(0.032, 0.03, 0.03), steel, { position: [-0.074, 0.03, 0], parent: tilt });
  createPart('FinderBracketB', boxGeo(0.032, 0.03, 0.03), steel, { position: [-0.074, 0.18, 0], parent: tilt });

  return root;
}

function animate(root) {
  return [createClip('FocusTravel', 2.0, [
    positionTrack('Joint_FocusSlide', [
      { time: 0, position: [0, FOCUS_BASE_Y, 0] },
      { time: 1.0, position: [0, FOCUS_BASE_Y + FOCUS_TRAVEL, 0] },
      { time: 2.0, position: [0, FOCUS_BASE_Y, 0] }
    ])
  ])];
}
