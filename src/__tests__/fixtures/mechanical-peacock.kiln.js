/**
 * Mechanical Peacock — a clockwork display bird with a jewel-enamel body,
 * brass armature and an articulated fan of eye-pattern feathers.
 * Metres, +X forward, +Y up, +Z right. Feet at Y = 0.
 */
const meta = { name: 'Mechanical Peacock', category: 'prop', role: 'poi' };

/* ---------------------------- proportions ---------------------------- */
const BODY_Y = 0.62;          // body axis height
const BODY_X0 = -0.36;        // tail end of the body
const BODY_X1 = 0.26;         // breast end of the body
const BODY_RY = 0.168;
const BODY_RZ = 0.140;

const HUB_X = -0.34;          // fan hub centre
const HUB_Y = 0.63;
const HUB_R = 0.118;          // radius of the pivot ring
const HUB_LEAN = -0.14;       // radians about Z; leans the open fan forward

const FEATHER_N = 21;
const FAN_ARC = 112;          // degrees either side of vertical
const L_MAX = 1.16;
const L_MIN = 0.80;
const VANE_ARC = 0.16;        // backward bow of a vane, as a fraction of length
const VANE_CUP = 0.05;        // cross-section cupping
const VANE_TH = 0.0038;       // half thickness of a vane
const V_EYE = 0.80;           // ocellus station along the vane
const TILT_SHUT = 82;         // hinge angle with the fan closed
const TILT_OPEN_MID = 5;      // hinge angle of the centre feather, open
const TILT_OPEN_EDGE = 23;    // hinge angle of the outermost feathers, open

const NECK_RISE = 0.50;
const HEAD_X = 0.305;
const HEAD_Y = BODY_Y + NECK_RISE + 0.09;

const DEG = 180 / Math.PI;

/* ---------------------------- materials ------------------------------ */
function palette() {
  return {
    brass: gameMaterial(0xb98f3c, { metalness: 0.95, roughness: 0.29 }),
    brassBright: gameMaterial(0xe0bc63, { metalness: 1.0, roughness: 0.16 }),
    bronze: gameMaterial(0x6d5122, { metalness: 0.9, roughness: 0.46 }),
    steel: gameMaterial(0x8d939b, { metalness: 1.0, roughness: 0.31 }),
    enamelBlue: gameMaterial(0x18306f, { metalness: 0.25, roughness: 0.14 }),
    enamelTeal: gameMaterial(0x0d6d6b, { metalness: 0.25, roughness: 0.15 }),
    enamelGreen: gameMaterial(0x11633a, { metalness: 0.25, roughness: 0.16 }),
    enamelViolet: gameMaterial(0x442066, { metalness: 0.28, roughness: 0.15 }),
    enamelGold: gameMaterial(0xd8a83e, { metalness: 0.55, roughness: 0.2 }),
    enamelCream: gameMaterial(0xe6d2a4, { metalness: 0.2, roughness: 0.3 }),
    enamelInk: gameMaterial(0x0c1430, { metalness: 0.3, roughness: 0.12 }),
  };
}

/* ------------------------- geometry helpers -------------------------- */

/**
 * Orient a Y-axis primitive so it spans from a to b.
 * Solves Euler XYZ [beta, 0, gamma] for R * (0,1,0) = normalize(b - a).
 */
function strut(name, a, b, radius, material, parent, segments) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;
  const gamma = Math.asin(Math.max(-1, Math.min(1, -nx)));
  const beta = Math.atan2(nz, ny);
  return createPart(name, cylinderGeo(radius, radius, len, segments || 10), material, {
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    rotation: [beta * DEG, 0, gamma * DEG],
    parent: parent,
  });
}

/**
 * A closed thin vane: the cross-section loops front-to-back so the blade has
 * real thickness and reads from either side. widthFn(v) returns half-width.
 */
function vaneGeo(length, widthFn, arc, thick, uSeg, vSeg) {
  return parametricSurface(function (u, v) {
    const ang = 2 * Math.PI * u;
    const s = Math.cos(ang);
    const w = widthFn(v);
    const swell = 0.35 + 0.65 * Math.sin(Math.PI * v);
    return [
      -arc * length * v * v - VANE_CUP * s * s * w + thick * Math.sin(ang) * swell,
      length * v,
      s * w,
    ];
  }, { u: [0, 1], v: [0, 0.992], uSegments: uSeg, vSegments: vSeg, periodicU: true });
}

/** Half-width of a train feather: slim quill, ovate eye lobe, drawn tip. */
function featherWidth(v, k) {
  const shaft = 0.006 + 0.020 * Math.pow(v, 0.7);
  const lobe = 0.062 * Math.exp(-Math.pow((v - V_EYE) / 0.17, 2));
  const tip = 1 - Math.pow(v, 10);
  return (shaft + lobe) * Math.max(tip, 0) * k;
}

/** Half-width of a wing covert: broad leaf. */
function wingWidth(v) {
  return 0.115 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62)), 0.85) * (1 - 0.28 * v) + 0.004;
}

/** Backward-facing surface x at the vane centreline for a given station. */
function vaneBackX(length, v, arc, thick) {
  return -arc * length * v * v - thick * (0.35 + 0.65 * Math.sin(Math.PI * v));
}

/** Sample the neck centreline; t = 0 at the breast, 1 at the skull. */
function neckPoint(t) {
  return [
    0.20 + 0.10 * Math.sin(Math.PI * t * 0.85) + 0.04 * t,
    BODY_Y + 0.02 + (NECK_RISE + 0.045) * t,
    0,
  ];
}

function neckRadius(t) {
  return 0.076 - 0.038 * Math.pow(Math.max(t, 0), 0.85);
}

/** Body cross-section scale; floored so the ends never collapse to a pole. */
function bodyK(v) {
  return Math.pow(Math.max(Math.sin(Math.PI * Math.pow(v, 0.9)), 0.02), 0.45);
}

function octagon() {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return pts;
}

/* ------------------------------ build -------------------------------- */
async function build() {
  const root = createRoot('MechanicalPeacock');
  const M = palette();
  const vaneEnamels = [M.enamelTeal, M.enamelGreen, M.enamelBlue];
  const eyeRings = [
    [M.enamelGold, M.enamelViolet, M.enamelInk],
    [M.enamelGold, M.enamelTeal, M.enamelInk],
    [M.enamelCream, M.enamelBlue, M.enamelViolet],
  ];

  /* ---- enamel body shell over a brass keel ---- */
  const bodyGroup = createPivot('Body', [0, BODY_Y, 0], root);
  const bodyGeo = parametricSurface(function (u, v) {
    const a = -2 * Math.PI * u; // Outward winding around the longitudinal body axis.
    const k = bodyK(v);
    const x = BODY_X0 + (BODY_X1 - BODY_X0) * v;
    const droop = -0.028 * Math.sin(Math.PI * v);
    return [x, droop + BODY_RY * k * Math.sin(a), BODY_RZ * k * Math.cos(a)];
  }, { u: [0, 1], v: [0.02, 0.98], uSegments: 40, vSegments: 28, periodicU: true });
  createPart('BodyShell', creaseNormals(bodyGeo, { angle: 55 }), M.enamelBlue, { parent: bodyGroup });
  createPart('BodyCapTail', sphereGeo(0.055, 16, 12), M.enamelBlue, {
    position: [BODY_X0 + 0.008, -0.002, 0], scale: [0.62, 0.97, 0.81], parent: bodyGroup,
  });
  createPart('BodyCapBreast', sphereGeo(0.050, 16, 12), M.enamelBlue, {
    position: [BODY_X1 - 0.016, -0.002, 0], scale: [0.62, 0.89, 0.74], parent: bodyGroup,
  });

  // brass frame hoops around the enamel shell
  const hoopStations = [0.2, 0.42, 0.64, 0.84];
  for (let i = 0; i < hoopStations.length; i++) {
    const v = hoopStations[i];
    const k = bodyK(v);
    const x = BODY_X0 + (BODY_X1 - BODY_X0) * v;
    const ring = createPart('BodyHoop' + i, torusGeo(1, 0.055, 8, 34), M.brass, {
      position: [x, -0.028 * Math.sin(Math.PI * v), 0],
      rotation: [0, 90, 0],
      scale: [BODY_RZ * k + 0.004, BODY_RY * k + 0.004, 1],
      parent: bodyGroup,
    });
    ring.scale.z = 0.22;
  }

  // brass spine strip and belly keel
  const spinePath = [];
  const keelPath = [];
  for (let i = 0; i <= 12; i++) {
    const v = 0.06 + (i / 12) * 0.88;
    const k = bodyK(v);
    const x = BODY_X0 + (BODY_X1 - BODY_X0) * v;
    const droop = -0.028 * Math.sin(Math.PI * v);
    spinePath.push([x, droop + BODY_RY * k + 0.006, 0]);
    keelPath.push([x, droop - BODY_RY * k - 0.006, 0]);
  }
  const stripProfile = [[-0.020, -0.008], [0.020, -0.008], [0.020, 0.008], [-0.020, 0.008]];
  createPart('SpineStrip', sweepProfile(stripProfile, spinePath, { cap: true, up: [0, 0, 1] }), M.brass, { parent: bodyGroup });
  createPart('BellyKeel', sweepProfile(stripProfile, keelPath, { cap: true, up: [0, 0, 1] }), M.bronze, { parent: bodyGroup });

  /* ---- neck ---- */
  const neckPts = [];
  const neckScale = [];
  for (let i = 0; i <= 13; i++) {
    const t = -0.18 + (i / 13) * 1.18;
    neckPts.push(neckPoint(t));
    const r = neckRadius(t);
    neckScale.push([r, r]);
  }
  const neckProfile = octagon();
  createPart('Neck', sweepProfile(neckProfile, neckPts, { cap: true, scale: neckScale, up: [1, 0, 0] }), M.enamelBlue, { parent: root });

  // brass collars: each is a two-station sweep so it follows the neck frame
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const r = neckRadius(t) * 1.16;
    const a = neckPoint(t - 0.022);
    const b = neckPoint(t + 0.022);
    createPart('NeckCollar' + i, sweepProfile(neckProfile, [a, b], {
      cap: true, scale: [[r, r], [r, r]], up: [1, 0, 0],
    }), M.brass, { parent: root });
  }

  /* ---- head ---- */
  const head = createPivot('Head', [HEAD_X, HEAD_Y, 0], root);
  head.rotation.z = -0.18;
  createPart('Skull', sphereGeo(0.062, 16, 12), M.enamelBlue, { scale: [1.55, 1.0, 0.88], parent: head });
  createPart('Beak', coneGeo(0.030, 0.125, 12), M.brassBright, {
    position: [0.098, -0.012, 0], rotation: [0, 0, -96], parent: head,
  });
  createPart('BeakBand', torusGeo(0.028, 0.006, 6, 14), M.bronze, {
    position: [0.055, -0.006, 0], rotation: [0, 84, 0], parent: head,
  });
  for (let s = -1; s <= 1; s += 2) {
    createPart('EyeBezel', torusGeo(0.021, 0.006, 6, 14), M.brassBright, {
      position: [0.040, 0.018, s * 0.049], rotation: [90, 0, 0], parent: head,
    });
    createPart('EyeJewel', sphereGeo(0.017, 10, 8), M.enamelGold, {
      position: [0.040, 0.018, s * 0.050], parent: head,
    });
  }
  // crest: brass wires with enamel beads
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) / 2;
    const base = [-0.012 + 0.020 * spread * spread, 0.055, spread * 0.020];
    const tip = [-0.030 + 0.055 * spread * spread, 0.155, spread * 0.070];
    strut('CrestWire' + i, base, tip, 0.0045, M.brassBright, head, 6);
    createPart('CrestBead' + i, sphereGeo(0.019, 10, 8), M.enamelTeal, { position: tip, parent: head });
    createPart('CrestBeadRim' + i, torusGeo(0.020, 0.004, 6, 12), M.brass, {
      position: tip, rotation: [0, 0, 90], parent: head,
    });
  }

  /* ---- wing coverts ---- */
  for (let s = -1; s <= 1; s += 2) {
    const wingRoot = createPivot('WingRoot' + (s > 0 ? 'R' : 'L'), [0.06, BODY_Y + 0.03, s * 0.115], root);
    wingRoot.rotation.x = -s * 1.31;
    createPart('WingCovert', vaneGeo(0.46, wingWidth, 0.30, 0.010, 14, 20), M.enamelGreen, {
      rotation: [0, 0, 120], parent: wingRoot,
    });
    strut('WingRib', [0, 0, 0], [-0.40 * Math.sin(2.094), 0.40 * Math.cos(2.094), 0], 0.008, M.brass, wingRoot, 6);
    createPart('ShoulderBoss', cylinderGeo(0.034, 0.040, 0.030, 14), M.brass, {
      rotation: [90, 0, 0], parent: wingRoot,
    });
  }

  /* ---- legs ---- */
  for (let s = -1; s <= 1; s += 2) {
    const z = s * 0.088;
    const hip = [0.02, 0.50, z];
    const knee = [-0.06, 0.285, z];
    const ankle = [0.035, 0.062, z];
    createPart('HipBoss', cylinderGeo(0.036, 0.036, 0.034, 14), M.brass, {
      position: hip, rotation: [90, 0, 0], parent: root,
    });
    strut('Thigh', hip, knee, 0.028, M.brass, root, 10);
    createPart('KneeBoss', cylinderGeo(0.028, 0.028, 0.036, 12), M.brassBright, {
      position: knee, rotation: [90, 0, 0], parent: root,
    });
    strut('Shank', knee, ankle, 0.020, M.steel, root, 10);
    createPart('AnkleBoss', cylinderGeo(0.022, 0.022, 0.030, 12), M.brass, {
      position: ankle, rotation: [90, 0, 0], parent: root,
    });
    const toes = [
      [ankle[0] + 0.105, 0.013, z],
      [ankle[0] + 0.055, 0.013, z + 0.058],
      [ankle[0] + 0.055, 0.013, z - 0.058],
      [ankle[0] - 0.072, 0.013, z],
    ];
    for (let t = 0; t < toes.length; t++) {
      strut('Toe' + t, ankle, toes[t], 0.013, M.bronze, root, 8);
      createPart('Claw' + t, sphereGeo(0.014, 8, 6), M.brassBright, { position: toes[t], parent: root });
    }
  }

  /* ---- fan hub and drive ---- */
  const hub = createPivot('TailHub', [HUB_X, HUB_Y, 0], root);
  hub.rotation.z = HUB_LEAN;
  createPart('HubRing', torusGeo(HUB_R, 0.018, 10, 44), M.brass, { rotation: [0, 90, 0], parent: hub });
  createPart('HubPlate', cylinderGeo(0.080, 0.098, 0.062, 24), M.bronze, { rotation: [0, 0, 90], parent: hub });
  createPart('HubCap', cylinderGeo(0.044, 0.044, 0.020, 20), M.brassBright, {
    position: [-0.052, 0, 0], rotation: [0, 0, 90], parent: hub,
  });
  const driveGear = createPivot('DriveGear', [-0.086, 0, 0], hub);
  createPart('DriveGearBody', gearGeo({ teeth: 26, rootRadius: 0.060, tipRadius: 0.075, boreRadius: 0.014, height: 0.020 }), M.brassBright, {
    rotation: [0, 0, 90], parent: driveGear,
  });
  const pinion = createPivot('Pinion', [-0.086, -0.118, 0], hub);
  createPart('PinionBody', gearGeo({ teeth: 12, rootRadius: 0.032, tipRadius: 0.046, boreRadius: 0.010, height: 0.020 }), M.steel, {
    rotation: [0, 0, 90], parent: pinion,
  });
  strut('DriveShaft', [-0.086, -0.118, 0], [0.12, -0.16, 0], 0.011, M.steel, hub, 8);

  /* ---- the articulated train ---- */
  for (let i = 0; i < FEATHER_N; i++) {
    const t = (i / (FEATHER_N - 1)) * 2 - 1;   // -1 .. 1 across the fan
    const at = Math.abs(t);
    const theta = t * FAN_ARC;
    const len = L_MIN + (L_MAX - L_MIN) * (1 - Math.pow(at, 1.7));
    const k = 0.72 + 0.28 * (len / L_MAX);     // eye lobe scales with length
    const openTilt = TILT_OPEN_MID + (TILT_OPEN_EDGE - TILT_OPEN_MID) * at * at;
    const idx = i < 10 ? '0' + i : '' + i;

    const socket = createPivot('FeatherSocket' + idx, [0, 0, 0], hub);
    socket.rotation.x = theta / DEG;

    // radial armature spoke and the fixed half of the pivot
    createPart('Spoke' + idx, cylinderGeo(0.0075, 0.011, HUB_R, 8), M.brass, {
      position: [0, HUB_R * 0.5, 0], parent: socket,
    });
    createPart('Knuckle' + idx, cylinderGeo(0.017, 0.017, 0.030, 12), M.bronze, {
      position: [0, HUB_R, 0], rotation: [90, 0, 0], parent: socket,
    });
    createPart('PivotPin' + idx, cylinderGeo(0.0065, 0.0065, 0.052, 8), M.brassBright, {
      position: [0, HUB_R, 0], rotation: [90, 0, 0], parent: socket,
    });

    // moving half: the feather hinge
    const hinge = createPivot('FeatherHinge' + idx, [0, HUB_R, 0], socket);
    hinge.rotation.z = openTilt / DEG;

    for (let y = -1; y <= 1; y += 2) {
      createPart('Yoke' + idx, boxGeo(0.030, 0.046, 0.008), M.brass, {
        position: [-0.004, 0.023, y * 0.019], parent: hinge,
      });
    }
    createPart('Ferrule' + idx, cylinderGeo(0.013, 0.017, 0.052, 10), M.brass, {
      position: [0, 0.050, 0], parent: hinge,
    });

    const widthFn = function (v) { return featherWidth(v, k); };
    createPart('Vane' + idx, vaneGeo(len, widthFn, VANE_ARC, VANE_TH, 12, 26), vaneEnamels[i % 3], {
      position: [0, 0.030, 0], parent: hinge,
    });
    // brass quill riding the front face of the vane
    createPart('Quill' + idx, cylinderGeo(0.0035, 0.0095, len * 0.74, 8), M.brass, {
      position: [0.006, 0.030 + len * 0.37, 0], parent: hinge,
    });

    // the ocellus: brass bezel over stacked enamel discs
    const eyeY = 0.030 + len * V_EYE;
    const backX = vaneBackX(len, V_EYE, VANE_ARC, VANE_TH);
    const rings = eyeRings[i % 3];
    createPart('EyeBezel' + idx, torusGeo(0.057 * k, 0.0045, 6, 22), M.brass, {
      position: [backX - 0.0026, eyeY, 0], rotation: [0, 90, 0], scale: [1, 1.26, 1], parent: hinge,
    });
    createPart('EyeOuter' + idx, cylinderGeo(0.055 * k, 0.055 * k, 0.005, 20), rings[0], {
      position: [backX - 0.0025, eyeY, 0], rotation: [0, 0, 90], scale: [1.26, 1, 1], parent: hinge,
    });
    createPart('EyeMid' + idx, cylinderGeo(0.039 * k, 0.039 * k, 0.005, 20), rings[1], {
      position: [backX - 0.0062, eyeY, 0], rotation: [0, 0, 90], scale: [1.26, 1, 1], parent: hinge,
    });
    createPart('EyeCore' + idx, sphereGeo(0.023 * k, 14, 10), rings[2], {
      position: [backX - 0.0092, eyeY, 0], scale: [0.5, 1.26, 1], parent: hinge,
    });
  }

  return root;
}

/* ---------------------------- animation ------------------------------ */
function animate() {
  const tracks = [];
  const DURATION = 2.6;
  for (let i = 0; i < FEATHER_N; i++) {
    const t = (i / (FEATHER_N - 1)) * 2 - 1;
    const at = Math.abs(t);
    const openTilt = TILT_OPEN_MID + (TILT_OPEN_EDGE - TILT_OPEN_MID) * at * at;
    const lead = 0.30 * at;                 // outer feathers trail the centre
    const idx = i < 10 ? '0' + i : '' + i;
    tracks.push(rotationTrack('Joint_FeatherHinge' + idx, [
      { time: 0, rotation: [0, 0, TILT_SHUT] },
      { time: 0.35 + lead, rotation: [0, 0, TILT_SHUT - 0.18 * (TILT_SHUT - openTilt)] },
      { time: 1.55 + lead, rotation: [0, 0, openTilt + 0.22 * (TILT_SHUT - openTilt)] },
      { time: 2.15 + lead, rotation: [0, 0, openTilt - 3] },
      { time: DURATION, rotation: [0, 0, openTilt] },
    ]));
  }
  tracks.push(rotationTrack('Joint_DriveGear', [
    { time: 0, rotation: [0, 0, 0] },
    { time: DURATION, rotation: [-260, 0, 0] },
  ]));
  tracks.push(rotationTrack('Joint_Pinion', [
    { time: 0, rotation: [0, 0, 0] },
    { time: DURATION, rotation: [563, 0, 0] },
  ]));
  return [createClip('FanOpen', DURATION, tracks)];
}
