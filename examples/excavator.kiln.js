// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 4 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opencode-go/omen-alpha, via opencode.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. Not a line of it is hand-authored.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'Excavator', category: 'prop' };
meta.role = 'vehicle';

const D2R = Math.PI / 180;
function minus(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function midOf(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
function angZ(v) { return Math.atan2(v[1], v[0]) / D2R; }

async function build() {
  const root = createRoot('Excavator');

  const yellow = gameMaterial(0xf0a80c, { roughness: 0.5, metalness: 0.12 });
  const charcoal = gameMaterial(0x24262b, { roughness: 0.92, metalness: 0.2 });
  const steel = gameMaterial(0x79818a, { roughness: 0.35, metalness: 0.85 });
  const steelDark = gameMaterial(0x474c52, { roughness: 0.55, metalness: 0.7 });
  const chrome = gameMaterial(0xc8ccd2, { roughness: 0.18, metalness: 1.0 });
  const glass = glassMaterial(0x1c2b36, { opacity: 0.55 });
  const black = gameMaterial(0x121316, { roughness: 0.9, metalness: 0.3 });
  const lamp = gameMaterial(0xfff1c4, { roughness: 0.4, emissive: 0xffdf9e, emissiveIntensity: 1.6 });

  // ---------------- key pins ----------------
  const BOOM_FOOT = [1.30, 1.78, 0];
  const BOOM_TIP = [2.95, 3.28, 0];
  const BUCKET_PIN = [4.90, 1.44, 0];
  const boomV = minus(BOOM_TIP, BOOM_FOOT);
  const dipV = minus(BUCKET_PIN, BOOM_TIP);
  const boomAng = angZ(boomV);
  const dipAng = angZ(dipV);

  const slew = createPivot('Slew', [0, 0, 0], root);
  const boomJ = createPivot('Boom', BOOM_FOOT, slew);
  const dipJ = createPivot('Dipper', boomV, boomJ);
  const bucketJ = createPivot('Bucket', dipV, dipJ);

  // ================= UNDERCARRIAGE =================
  const R = 0.42, CY = 0.494, FX = 1.52, RX = -1.52;
  const shoeGeo = boxGeo(0.235, 0.07, 0.62);
  const grouserGeo = boxGeo(0.24, 0.026, 0.24);
  const rollerGeo = cylinderZGeo(0.12, 0.12, 0.2, 14);
  const rollerFlangeGeo = cylinderZGeo(0.15, 0.15, 0.025, 14);
  const idlerGeo = cylinderZGeo(0.385, 0.385, 0.22, 18);
  const idlerFlangeGeo = cylinderZGeo(0.418, 0.418, 0.022, 18);
  const hubGeo = cylinderZGeo(0.12, 0.12, 0.34, 10);
  const sprocketDiscGeo = cylinderZGeo(0.28, 0.28, 0.16, 14);
  const sprocketToothGeo = boxGeo(0.13, 0.1, 0.12);

  for (const s of [-1, 1]) {
    const side = s > 0 ? 'Right' : 'Left';
    const g = new THREE.Group(); g.name = 'Track' + side; root.add(g);
    const zc = s * 0.95;
    let n = 0;
    const putShoe = (x, y, rz) => {
      const sh = createPart('Shoe' + side + (n++), shoeGeo, charcoal, { position: [x, y, zc], rotation: [0, 0, rz], parent: g });
      createPart('GrouserA' + side + n, grouserGeo, black, { position: [0, -0.047, 0.14], parent: sh });
      createPart('GrouserB' + side + n, grouserGeo, black, { position: [0, -0.047, -0.14], parent: sh });
    };
    for (let x = -1.44; x <= 1.45; x += 0.24) { putShoe(x, CY - R, 0); putShoe(x, CY + R, 0); }
    for (let a = -78.75; a <= 78.8; a += 22.5) { const r = a * D2R; putShoe(FX + R * Math.cos(r), CY + R * Math.sin(r), a + 90); }
    for (let a = -101.25; a >= -281.3; a -= 22.5) { const r = a * D2R; putShoe(RX + R * Math.cos(r), CY + R * Math.sin(r), a + 90); }

    for (let x = -1.15; x <= 1.21; x += 0.47) {
      const roller = createPart('Roller' + side + (n++), rollerGeo, steel, { position: [x, 0.229, zc - s * 0.16], parent: g });
      createPart('RollerFlangeF' + side + n, rollerFlangeGeo, steelDark, { position: [0, 0, 0.105], parent: roller });
      createPart('RollerFlangeB' + side + n, rollerFlangeGeo, steelDark, { position: [0, 0, -0.105], parent: roller });
    }
    const idler = createPart('Idler' + side, idlerGeo, steel, { position: [FX, CY, zc - s * 0.16], parent: g });
    createPart('IdlerFlangeF' + side, idlerFlangeGeo, steelDark, { position: [0, 0, 0.115], parent: idler });
    createPart('IdlerFlangeB' + side, idlerFlangeGeo, steelDark, { position: [0, 0, -0.115], parent: idler });
    createPart('IdlerHub' + side, hubGeo, steelDark, { position: [FX, CY, zc - s * 0.16], parent: g });
    const sprocketAsm = new THREE.Group(); sprocketAsm.name = 'SprocketAsm' + side;
    sprocketAsm.position.set(RX, CY, zc - s * 0.16); g.add(sprocketAsm);
    createPart('SprocketDisc' + side, sprocketDiscGeo, steelDark, { parent: sprocketAsm });
    const tooth0 = createPart('SprocketTooth0' + side, sprocketToothGeo, steelDark, { position: [0.33, 0, 0], parent: sprocketAsm });
    arrayRadial('SprocketTooth' + side, tooth0, 11, 'z', sprocketAsm);
    createPart('SprocketHub' + side, hubGeo, steelDark, { position: [RX, CY, zc - s * 0.16], parent: g });

    createPart('Frame' + side, boxGeo(3.5, 0.3, 0.34), yellow, { position: [0, 0.5, zc - s * 0.31], parent: g });
    createPart('RockGuardInner' + side, boxGeo(2.9, 0.5, 0.05), charcoal, { position: [0, 0.34, zc - s * 0.325], parent: g });
    createPart('RockGuardOuter' + side, boxGeo(2.9, 0.5, 0.05), charcoal, { position: [0, 0.34, zc + s * 0.325], parent: g });
    createPart('IdlerGuard' + side, boxGeo(0.5, 0.25, 0.68), yellow, { position: [1.55, 0.77, zc], parent: g });
    createPart('SprocketGuard' + side, boxGeo(0.5, 0.25, 0.68), yellow, { position: [-1.55, 0.77, zc], parent: g });
  }

  // car body + slew ring + slew gear
  createPart('CarBody', await roundedBoxGeo(2.0, 0.32, 1.24, 0.05), yellow, { position: [0, 0.76, 0], parent: root });
  createPart('SlewRing', cylinderGeo(1.0, 1.0, 0.12, 36), steelDark, { position: [0, 1.03, 0], parent: root });
  const slewTooth0 = createPart('SlewGearTooth0', boxGeo(0.09, 0.07, 0.05), steelDark, { position: [1.02, 1.0, 0], parent: root });
  arrayRadial('SlewGearTooth', slewTooth0, 24, 'y', root);
  createPart('GreaseRing', torusGeo(0.9, 0.03, 6, 36), black, { position: [0, 1.095, 0], rotation: [90, 0, 0], parent: root });

  // ================= HOUSE =================
  createPart('Deck', await roundedBoxGeo(3.6, 0.08, 2.12, 0.02), yellow, { position: [-0.12, 1.13, 0], parent: slew });
  createPart('DeckWalkway', boxGeo(0.85, 0.02, 1.9), black, { position: [1.28, 1.18, 0], parent: slew });
  for (const zz of [-0.93, 0.93]) createPart('WalkwayEdge' + zz, boxGeo(0.85, 0.028, 0.04), steelDark, { position: [1.28, 1.186, zz * (0.932 / 0.93)], parent: slew });
  createPart('Counterweight', await roundedBoxGeo(1.15, 1.3, 2.34, 0.14), yellow, { position: [-1.8, 1.79, 0], parent: slew });
  createPart('CwStrip', boxGeo(0.02, 0.42, 2.0), black, { position: [-2.38, 1.55, 0], parent: slew });
  for (const yy of [1.3, 2.2]) for (const zz of [-0.75, -0.25, 0.25, 0.75]) {
    createPart('CwBolt' + yy + zz, cylinderXGeo(0.035, 0.035, 0.04, 8), steelDark, { position: [-2.395, yy, zz], parent: slew });
  }
  // counterweight rear handrail
  for (const zz of [-0.8, 0, 0.8]) {
    createPart('CwRailPost' + zz, cylinderGeo(0.018, 0.018, 0.32, 6), black, { position: [-2.3, 2.6, zz], parent: slew });
  }
  beamBetween('Mesh_CwRailTop', [-2.3, 2.76, -0.85], [-2.3, 2.76, 0.85], 0.016, black, { parent: slew });

  createPart('Hood', await roundedBoxGeo(1.95, 1.06, 1.9, 0.09), yellow, { position: [-0.23, 1.7, 0], parent: slew });
  for (const yy of [1.5, 1.62, 1.74, 1.86, 1.98]) {
    createPart('LouverL' + yy, boxGeo(1.3, 0.05, 0.03), black, { position: [-0.25, yy, -0.94], parent: slew });
    createPart('LouverR' + yy, boxGeo(1.3, 0.05, 0.03), black, { position: [-0.25, yy, 0.94], parent: slew });
  }
  for (const zz of [-0.65, -0.35, -0.05, 0.25]) {
    createPart('HoodGrill' + zz, boxGeo(0.02, 0.55, 0.05), black, { position: [0.755, 1.7, zz], parent: slew });
  }
  createPart('AirCleaner', cylinderGeo(0.09, 0.09, 0.3, 10), steelDark, { position: [-0.15, 2.37, -0.72], parent: slew });
  createPart('AirCleanerCap', cylinderGeo(0.11, 0.11, 0.03, 10), black, { position: [-0.15, 2.53, -0.72], parent: slew });
  createPart('Exhaust', cylinderGeo(0.06, 0.06, 0.42, 12), steelDark, { position: [-0.7, 2.41, -0.5], parent: slew });
  createPart('ExhaustFlange', cylinderGeo(0.085, 0.085, 0.04, 12), black, { position: [-0.7, 2.222, -0.5], parent: slew });
  createPart('ExhaustCap', coneGeo(0.09, 0.1, 12), steelDark, { position: [-0.7, 2.67, -0.5], parent: slew });

  // tanks under the deck overhang
  createPart('FuelTank', boxGeo(0.85, 0.2, 0.5), steelDark, { position: [-1.05, 1.0, -0.52], parent: slew });
  for (const xx of [-1.25, -0.85]) createPart('FuelStrap' + xx, boxGeo(0.03, 0.22, 0.54), black, { position: [xx, 1.0, -0.52], parent: slew });
  createPart('BatteryBox', boxGeo(0.4, 0.24, 0.35), black, { position: [-1.6, 1.0, 0.72], parent: slew });

  // hoses from hood to boom bracket
  createPart('HoseA', pipeAlongPath([[-0.4, 2.2, 0.62], [0.25, 2.1, 0.72], [0.95, 1.9, 0.5], [1.28, 1.8, 0.3]], 0.028, { bendRadius: 0.09, radialSegments: 6 }), black, { parent: slew });
  createPart('HoseB', pipeAlongPath([[-0.4, 2.2, -0.62], [0.25, 2.05, -0.7], [0.9, 1.85, -0.55], [1.26, 1.78, -0.3]], 0.028, { bendRadius: 0.09, radialSegments: 6 }), black, { parent: slew });

  // ---------------- cab ----------------
  createPart('CabSill', await roundedBoxGeo(1.12, 0.32, 0.96, 0.05), yellow, { position: [1.33, 1.33, 0.65], parent: slew });
  createPart('CabRoof', await roundedBoxGeo(1.2, 0.09, 1.02, 0.03), yellow, { position: [1.34, 2.42, 0.65], parent: slew });
  createPart('CabRear', boxGeo(0.06, 0.95, 0.96), yellow, { position: [0.80, 1.9, 0.65], parent: slew });
  for (const zz of [0.2, 1.1]) createPart('CabPillar' + zz, boxGeo(0.07, 0.95, 0.07), yellow, { position: [1.84, 1.9, zz], parent: slew });
  createPart('CabGlassFront', boxGeo(0.025, 0.92, 0.88), glass, { position: [1.86, 1.9, 0.65], parent: slew });
  createPart('CabGlassRight', boxGeo(0.996, 0.92, 0.025), glass, { position: [1.332, 1.9, 1.12], parent: slew });
  createPart('CabGlassRear', boxGeo(0.025, 0.9, 0.9), glass, { position: [0.79, 1.89, 0.65], parent: slew });
  createPart('CabGlassLeft', boxGeo(0.45, 0.92, 0.025), glass, { position: [1.6, 1.9, 0.19], parent: slew });
  createPart('CabDoor', boxGeo(0.52, 0.9, 0.03), yellow, { position: [1.12, 1.91, 0.19], parent: slew });
  createPart('CabDoorWindow', boxGeo(0.3, 0.4, 0.025), glass, { position: [1.12, 2.1, 0.2], parent: slew });
  createPart('CabDoorHandle', boxGeo(0.05, 0.03, 0.02), black, { position: [1.34, 1.75, 0.21], parent: slew });
  createPart('CabGrabHandle', boxGeo(0.02, 0.45, 0.02), black, { position: [0.88, 1.9, 0.155], parent: slew });
  createPart('WiperA', boxGeo(0.012, 0.02, 0.3), black, { position: [1.89, 2.12, 0.5], rotation: [0, 0, 6], parent: slew });
  createPart('WiperB', boxGeo(0.012, 0.02, 0.3), black, { position: [1.89, 2.0, 0.84], rotation: [0, 0, 6], parent: slew });
  for (const zz of [0.4, 0.9]) {
    createPart('WorkLight' + zz, boxGeo(0.09, 0.07, 0.11), black, { position: [1.88, 2.44, zz], parent: slew });
    createPart('WorkLens' + zz, boxGeo(0.02, 0.05, 0.08), lamp, { position: [1.935, 2.44, zz], parent: slew });
  }
  beamBetween('Mesh_MirrorStalk', [0.82, 2.1, 0.17], [0.64, 2.12, 0.07], 0.015, black, { parent: slew });
  createPart('Mirror', boxGeo(0.02, 0.16, 0.2), black, { position: [0.62, 2.12, 0.05], parent: slew });

  // handrail along deck left edge
  for (let x = -1.05; x <= 1.1; x += 0.55) {
    createPart('RailPost' + x.toFixed(2), cylinderGeo(0.018, 0.018, 0.45, 6), black, { position: [x, 1.395, -1.03], parent: slew });
  }
  beamBetween('Mesh_RailTop', [-1.08, 1.62, -1.03], [1.12, 1.62, -1.03], 0.016, black, { parent: slew });
  beamBetween('Mesh_RailMid', [-1.08, 1.4, -1.03], [1.12, 1.4, -1.03], 0.014, black, { parent: slew });

  // access steps, left rear
  createPart('Step1', boxGeo(0.4, 0.04, 0.3), steelDark, { position: [-1.55, 0.55, -1.42], parent: slew });
  createPart('Step2', boxGeo(0.4, 0.04, 0.3), steelDark, { position: [-1.55, 0.88, -1.42], parent: slew });
  for (const xx of [-1.75, -1.35]) {
    createPart('StepBracket' + xx, boxGeo(0.06, 0.62, 0.3), yellow, { position: [xx, 0.95, -1.18], parent: slew });
  }

  // boom foot bracket (house side)
  for (const zz of [-0.35, 0.35]) {
    createPart('BoomBracket' + zz, boxGeo(0.5, 0.62, 0.05), yellow, { position: [1.3, 1.48, zz], parent: slew });
  }
  createPart('BoomBracketGusset', boxGeo(0.45, 0.4, 0.62), yellow, { position: [1.33, 1.35, 0], parent: slew });

  // ================= ARM =================
  // --- boom (parented to boomJ: coords are world - BOOM_FOOT) ---
  const bo = minus(midOf(BOOM_FOOT, BOOM_TIP, 0.5), BOOM_FOOT);
  createPart('BoomBeam', await roundedBoxGeo(2.42, 0.3, 0.7, 0.05), yellow, { position: bo, rotation: [0, 0, boomAng], parent: boomJ });
  for (const zz of [-0.32, 0.32]) {
    createPart('BoomPlate' + zz, boxGeo(2.3, 0.34, 0.05), yellow, { position: [bo[0], bo[1], zz], rotation: [0, 0, boomAng], parent: boomJ });
  }
  createPart('BoomCap', boxGeo(2.3, 0.05, 0.56), yellow, { position: [bo[0] - 0.11, bo[1] + 0.125, 0], rotation: [0, 0, boomAng], parent: boomJ });
  for (const t of [0.28, 0.52, 0.76]) {
    const p = [boomV[0] * t, boomV[1] * t, 0];
    createPart('BoomRib' + t, boxGeo(0.06, 0.38, 0.72), yellow, { position: p, rotation: [0, 0, boomAng], parent: boomJ });
  }
  // hydraulic hoses running along the boom top
  for (const hz of [0.2, 0.32]) {
    createPart('BoomHose' + hz, pipeAlongPath([[0.044, 0.283, hz], [0.704, 0.883, hz], [1.364, 1.483, hz]], 0.024, { bendRadius: 0.06, radialSegments: 6 }), black, { parent: boomJ });
  }
  createPart('BoomFootBoss', cylinderZGeo(0.1, 0.1, 0.8, 12), steelDark, { position: [0, 0, 0], parent: boomJ });
  createPart('BoomTipBoss', cylinderZGeo(0.09, 0.09, 0.74, 12), steelDark, { position: boomV, parent: boomJ });

  // --- dipper (parented to dipJ: coords are world - BOOM_TIP) ---
  const dp = minus(midOf(BOOM_TIP, BUCKET_PIN, 0.5), BOOM_TIP);
  createPart('DipperBeam', await roundedBoxGeo(2.86, 0.26, 0.5, 0.045), yellow, { position: dp, rotation: [0, 0, dipAng], parent: dipJ });
  for (const zz of [-0.22, 0.22]) {
    createPart('DipperPlate' + zz, boxGeo(2.7, 0.3, 0.045), yellow, { position: [dp[0], dp[1], zz], rotation: [0, 0, dipAng], parent: dipJ });
  }
  for (const t of [0.3, 0.7]) {
    const p = [dipV[0] * t, dipV[1] * t, 0];
    createPart('DipperRib' + t, boxGeo(0.05, 0.32, 0.54), yellow, { position: p, rotation: [0, 0, dipAng], parent: dipJ });
  }
  createPart('DipperFootBoss', cylinderZGeo(0.085, 0.085, 0.62, 12), steelDark, { position: [0, 0, 0], parent: dipJ });
  createPart('DipperEndBoss', cylinderZGeo(0.08, 0.08, 0.62, 12), steelDark, { position: dipV, parent: dipJ });

  // --- bucket (parented to bucketJ: coords are world - BUCKET_PIN) ---
  // faceted C-shell: outer curve from pin over the belly to the cutting edge,
  // inner face curving back up — leaves the mouth open toward the machine.
  const outerPts = [[-0.06, 0.12], [0.34, -0.04], [0.58, -0.32], [0.68, -0.64], [0.56, -0.94], [0.30, -1.12], [0.0, -1.18]];
  const innerPts = [[0.0, -1.18], [-0.28, -1.10], [-0.40, -0.82], [-0.30, -0.44], [-0.10, -0.18]];
  function shellPlate(name, a, b, th, mat) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.05;
    const ang = angZ([b[0] - a[0], b[1] - a[1], 0]);
    createPart(name, boxGeo(L, th, 1.4), mat, { position: [mx, my, 0], rotation: [0, 0, ang], parent: bucketJ });
  }
  for (let i = 0; i < outerPts.length - 1; i++) shellPlate('BucketShellOut' + i, outerPts[i], outerPts[i + 1], 0.07, steelDark);
  for (let i = 0; i < innerPts.length - 1; i++) shellPlate('BucketShellIn' + i, innerPts[i], innerPts[i + 1], 0.06, steelDark);
  // side-plate fill: horizontal chords spanning the C so the silhouette reads solid
  function xAtY(pts, y) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((y <= a[1] && y >= b[1]) || (y >= a[1] && y <= b[1])) {
        const t = (y - a[1]) / (b[1] - a[1]);
        return a[0] + (b[0] - a[0]) * t;
      }
    }
    return null;
  }
  for (const y of [0.06, -0.12, -0.34, -0.58, -0.82, -1.04, -1.16]) {
    const xo = xAtY(outerPts, y);
    const xi = y > -0.18 ? -0.09 : xAtY(innerPts, y);
    for (const zz of [-0.685, 0.685]) {
      createPart('BucketSideFill' + y + '_' + zz, boxGeo(Math.max(xo - xi, 0.02), 0.19, 0.03), steelDark, { position: [(xi + xo) / 2, y, zz], parent: bucketJ });
    }
  }
  createPart('BucketEdge', boxGeo(0.66, 0.07, 1.44), steel, { position: [0.0, -1.17, 0], rotation: [0, 0, -5], parent: bucketJ });
  createPart('BucketPinBoss', cylinderZGeo(0.09, 0.09, 1.5, 12), steelDark, { position: [0, 0, 0], parent: bucketJ });
  for (const zz of [-0.56, -0.28, 0, 0.28, 0.56]) {
    createPart('BucketTooth' + zz, coneXGeo(0.05, 0.26, 8), steel, { position: [0.02, -1.19, zz], rotation: [0, 0, -78], parent: bucketJ });
  }
  for (const zz of [-0.71, 0.71]) {
    createPart('BucketSideStrip' + zz, boxGeo(0.28, 0.1, 0.03), steel, { position: [0.28, -1.0, zz], rotation: [0, 0, -30], parent: bucketJ });
  }
  for (const zz of [-0.3, 0.3]) {
    createPart('BucketHorn' + zz, boxGeo(0.24, 0.3, 0.05), steelDark, { position: [0.05, 0.12, zz], parent: bucketJ });
  }

  // --- hydraulic rams ---
  function ram(name, base, tip, rB, rR, parent, off) {
    const b = minus(base, off), t = minus(tip, off);
    const L = Math.hypot(t[0] - b[0], t[1] - b[1]);
    const a = angZ(minus(t, b));
    createPart(name + 'Barrel', cylinderXGeo(rB, rB * 1.12, L * 0.52, 12), steel, { position: midOf(b, t, 0.26), rotation: [0, 0, a], parent });
    createPart(name + 'Rod', cylinderXGeo(rR, rR, L * 0.56, 10), chrome, { position: midOf(b, t, 0.74), rotation: [0, 0, a], parent });
    createPart(name + 'BaseLug', boxGeo(0.2, rB * 2.4, rB * 2.6), steelDark, { position: b, rotation: [0, 0, a], parent });
    createPart(name + 'TipLug', boxGeo(0.16, rR * 2.6, rR * 2.8), steelDark, { position: t, rotation: [0, 0, a], parent });
  }
  // boom lift rams (deck to boom underside)
  for (const zz of [-0.58, 0.58]) {
    const tipB = [BOOM_FOOT[0] + boomV[0] * 0.42 - 0.1, BOOM_FOOT[1] + boomV[1] * 0.42 - 0.12, zz];
    ram('BoomRam' + zz, [0.35, 1.27, zz], tipB, 0.085, 0.05, slew, [0, 0, 0]);
  }
  // dipper ram (boom top to mid-dipper)
  {
    const tipD = [BOOM_TIP[0] + dipV[0] * 0.62, BOOM_TIP[1] + dipV[1] * 0.62, 0];
    ram('DipperRam', [2.2, 2.78, 0], tipD, 0.08, 0.048, boomJ, BOOM_FOOT);
  }
  // bucket ram (dipper to bucket horns)
  {
    const tipK = [4.95, 1.69, 0];
    ram('BucketRam', [2.75, 3.0, 0], tipK, 0.07, 0.042, dipJ, BOOM_TIP);
  }

  return root;
}

function animate() {
  return [createClip('SlewSurvey', 6, [
    rotationTrack('Joint_Slew', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 2.2, rotation: [0, 24, 0] },
      { time: 4, rotation: [0, 24, 0] },
      { time: 6, rotation: [0, 0, 0] },
    ]),
    rotationTrack('Joint_Boom', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1.6, rotation: [8, 0, 0] },
      { time: 3.4, rotation: [8, 0, 0] },
      { time: 6, rotation: [0, 0, 0] },
    ]),
    rotationTrack('Joint_Dipper', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1.6, rotation: [14, 0, 0] },
      { time: 3.4, rotation: [14, 0, 0] },
      { time: 6, rotation: [0, 0, 0] },
    ]),
    rotationTrack('Joint_Bucket', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1.0, rotation: [35, 0, 0] },
      { time: 3.4, rotation: [35, 0, 0] },
      { time: 5.0, rotation: [0, 0, 0] },
      { time: 6, rotation: [0, 0, 0] },
    ]),
  ])];
}
