const meta = { name: 'Humanoid work robot' };

// ---- landmarks and layout (metres, degrees); +X forward, +Y up, +Z right, left = -Z ----
const SHOULDER_Y = 1.42, SHOULDER_Z = 0.24;
const HIP_Y = 0.90, HIP_Z = 0.11;
const ELBOW_DROP = 0.30;             // shoulder -> elbow along the upper arm
const KNEE_DROP = 0.42;              // hip -> knee along the thigh
const SHIN_DROP = 0.41;              // knee -> ankle along the shin
const ANKLE_Y = HIP_Y - KNEE_DROP - SHIN_DROP;   // 0.07: ankle pivot height above the floor
const SOLE_HEEL_X = -0.10, SOLE_BALL_X = 0.15, SOLE_TOE_X = 0.20, SOLE_TOE_RISE = 0.005;   // flat sole heel..ball, toe spring
const GAIT_STRIKE_X = 0.22, GAIT_LIFT = 0.07;   // heel X ahead of the hip at strike; swing lift
const HAND_C = 0.375;                // elbow -> hand pad centre
const CARRY_X = 0.32, HANDOFF_X = 0.60, PAD_Y = 1.16;
const FORE_ZC = 0.006, FORE_RZ = 0.034;   // forearm/hand centre offset from the elbow axis; inner face at world |Z| 0.212
const N_LIMB = 14, N_HAND = 12, N_TORSO = 18;
const CAP_D = [0, 0.35, 0.8];
const CAP_S = [0.55, 0.85, 1.0];

// ---- geometry helpers ----
function ring(rx, rz, cx, cz, n, e) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n, c = Math.cos(a), s = Math.sin(a);
    p.push([cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), cz + rz * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)]);
  }
  return p;
}

function volumeSign(g) {
  const p = g.attributes.position.array, ix = g.index ? g.index.array : null;
  const nTri = ix ? ix.length / 3 : p.length / 9;
  let v = 0;
  for (let t = 0; t < nTri; t++) {
    const a = 3 * (ix ? ix[3 * t] : 3 * t), b = 3 * (ix ? ix[3 * t + 1] : 3 * t + 1), c = 3 * (ix ? ix[3 * t + 2] : 3 * t + 2);
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v;
}

// Lofted shell along local Y from uStart to uEnd; rounded ends of length cA/cB; mids = full-size stations {u, rx, rz, cx?, cz?}.
function shell(uStart, uEnd, mids, cA, cB, n, e) {
  const dir = Math.sign(uEnd - uStart);
  const A = mids[0], B = mids[mids.length - 1];
  const st = [];
  for (let k = 0; k < CAP_D.length; k++) st.push(Object.assign({}, A, { u: uStart + dir * cA * CAP_D[k], sc: CAP_S[k] }));
  for (const m of mids) st.push(Object.assign({ sc: 1 }, m));
  for (let k = CAP_D.length - 1; k >= 0; k--) st.push(Object.assign({}, B, { u: uEnd - dir * cB * CAP_D[k], sc: CAP_S[k] }));
  const make = (list) => loftProfiles(list.map((s) => ({
    profile: ring(s.rx * s.sc, s.rz * s.sc, s.cx || 0, s.cz || 0, n, e),
    frame: { origin: [0, s.u, 0], rotation: [0, 0, 0] },
  })), { cap: true });
  let g = make(st);
  if (volumeSign(g) < 0) g = make(st.slice().reverse());
  return g;
}

function node(name, pos, parent) {
  const g = createPivot(name, pos, parent);
  g.name = name;
  g.position.set(pos[0], pos[1], pos[2]);
  if (g.parent !== parent) parent.add(g);
  return g;
}

function part(name, geo, mat, parent, pos, rot) {
  return createPart(name, geo, mat, { position: pos || [0, 0, 0], rotation: rot || [0, 0, 0], parent });
}

// ---- asset ----
async function build() {
  const root = createRoot('humanoid-work-robot');

  const white = gameMaterial(0xE6E9EC, { metalness: 0.15, roughness: 0.45, flatShading: false });
  white.name = 'robot-white';
  const graphite = gameMaterial(0x2E3338, { metalness: 0.20, roughness: 0.60, flatShading: false });
  graphite.name = 'robot-graphite';
  const glass = gameMaterial(0x5E6A73, { metalness: 0.0, roughness: 0.10, flatShading: false });
  glass.name = 'glass-smoked';
  glass.transparent = true;
  glass.opacity = 0.6;
  const lamp = gameMaterial(0x22B14C, { metalness: 0.0, roughness: 0.40, emissive: 0x22B14C, emissiveIntensity: 1.0, flatShading: false });
  lamp.name = 'status-green';

  // ---- torso: pelvis, abdomen and chest shells over a dark inner frame ----
  const torso = node('torso', [0, 0, 0], root);
  part('pelvisShell', shell(0.965, 1.085, [
    { u: 0.99, rx: 0.088, rz: 0.135 }, { u: 1.03, rx: 0.100, rz: 0.150 }, { u: 1.062, rx: 0.096, rz: 0.144 },
  ], 0.02, 0.02, N_TORSO, 3), white, torso);
  part('waistFrame', boxGeo(0.12, 0.11, 0.19), graphite, torso, [0, 1.135, 0]);
  part('abdomenShell', shell(1.097, 1.172, [
    { u: 1.112, rx: 0.070, rz: 0.108 }, { u: 1.135, rx: 0.078, rz: 0.115 }, { u: 1.157, rx: 0.070, rz: 0.108 },
  ], 0.012, 0.012, N_TORSO, 3), white, torso);
  part('chestShell', shell(1.185, 1.49, [
    { u: 1.215, rx: 0.098, rz: 0.128 }, { u: 1.28, rx: 0.110, rz: 0.138 }, { u: 1.36, rx: 0.114, rz: 0.143 },
    { u: 1.42, rx: 0.115, rz: 0.145 }, { u: 1.455, rx: 0.104, rz: 0.132 },
  ], 0.02, 0.03, N_TORSO, 3), white, torso);
  part('neckStub', cylinderGeo(0.04, 0.04, 0.077, 16), graphite, torso, [0, 1.5235, 0]);
  part('socketRight', cylinderGeo(0.058, 0.058, 0.03, 16), graphite, torso, [0, SHOULDER_Y, 0.15], [90, 0, 0]);
  part('socketLeft', cylinderGeo(0.058, 0.058, 0.03, 16), graphite, torso, [0, SHOULDER_Y, -0.15], [90, 0, 0]);
  part('lampPanel', boxGeo(0.012, 0.09, 0.10), graphite, torso, [0.112, 1.34, 0]);
  part('statusLamp', cylinderGeo(0.02, 0.02, 0.012, 16), lamp, torso, [0.118, 1.34, 0], [0, 0, -90]);
  part('packPlate', boxGeo(0.03, 0.25, 0.22), graphite, torso, [-0.118, 1.315, 0]);
  part('packShell', await roundedBoxGeo(0.075, 0.21, 0.19, 0.03, { segments: 3, smooth: true }), white, torso, [-0.1625, 1.315, 0]);

  // ---- head: rotates about Y at the neck ----
  const head = node('head', [0, 1.55, 0], torso);
  part('neckRing', cylinderGeo(0.044, 0.044, 0.012, 16), graphite, head, [0, 0.021, 0]);
  part('headShell', await roundedBoxGeo(0.21, 0.155, 0.19, 0.045, { segments: 3, smooth: true }), white, head, [0, 0.1025, 0]);
  part('facePlate', await roundedBoxGeo(0.02, 0.078, 0.128, 0.009, { segments: 2, smooth: true }), graphite, head, [0.098, 0.1135, 0]);
  part('visor', await roundedBoxGeo(0.024, 0.088, 0.14, 0.011, { segments: 2, smooth: true }), glass, head, [0.1005, 0.1135, 0]);
  part('earRight', cylinderGeo(0.028, 0.028, 0.012, 16), graphite, head, [-0.01, 0.1025, 0.095], [90, 0, 0]);
  part('earLeft', cylinderGeo(0.028, 0.028, 0.012, 16), graphite, head, [-0.01, 0.1025, -0.095], [90, 0, 0]);

  // Foot shells lofted along X in the foot frame (origin at the ankle): stations [x, yBottom, yTop, halfWidth].
  const footLoft = (st, n, e) => {
    const make = (list) => loftProfiles(list.map(([x, yb, yt, rz]) => ({
      profile: ring((yt - yb) / 2, rz, -(yt + yb) / 2, 0, n, e),
      frame: { origin: [0, x, 0], rotation: [0, 0, 0] },
    })), { cap: true });
    let g = make(st);
    if (volumeSign(g) < 0) g = make(st.slice().reverse());
    return g;
  };
  const Y0 = -ANKLE_Y, toeY = (x) => Y0 + (SOLE_TOE_RISE * (x - SOLE_BALL_X)) / (SOLE_TOE_X - SOLE_BALL_X);
  const soleSt = [
    [-0.112, Y0 + 0.008, Y0 + 0.023, 0.030], [-0.106, Y0 + 0.002, Y0 + 0.025, 0.043], [SOLE_HEEL_X, Y0, Y0 + 0.026, 0.049],
    [0, Y0, Y0 + 0.026, 0.056], [0.10, Y0, Y0 + 0.026, 0.055], [SOLE_BALL_X, Y0, Y0 + 0.026, 0.052],
    [0.185, toeY(0.185), Y0 + 0.027, 0.045], [0.195, toeY(0.195), Y0 + 0.023, 0.036], [SOLE_TOE_X, toeY(SOLE_TOE_X), Y0 + 0.016, 0.022],
  ];
  const shoeSt = [
    [-0.108, Y0 + 0.024, Y0 + 0.046, 0.030], [-0.100, Y0 + 0.020, Y0 + 0.052, 0.042], [-0.085, Y0 + 0.020, Y0 + 0.055, 0.046],
    [0, Y0 + 0.020, Y0 + 0.058, 0.053], [0.10, Y0 + 0.020, Y0 + 0.050, 0.052], [0.17, Y0 + 0.021, Y0 + 0.038, 0.046],
    [0.185, Y0 + 0.022, Y0 + 0.032, 0.036], [0.192, Y0 + 0.023, Y0 + 0.028, 0.020],
  ];

  for (const side of ['Right', 'Left']) {
    const s = side === 'Right' ? 1 : -1;
    const cz = FORE_ZC * s;

    // ---- arm: hub at the shoulder, shell, dark spar; forearm child with elbow hub, shell and mitten hand ----
    const arm = node('arm' + side, [0, SHOULDER_Y, s * SHOULDER_Z], torso);
    const fore = node('forearm' + side, [0, -ELBOW_DROP, 0], arm);
    part('shoulderHub' + side, cylinderGeo(0.06, 0.06, 0.14, 16), graphite, arm, [0, 0, 0], [90, 0, 0]);
    part('armSpar' + side, cylinderGeo(0.022, 0.022, 0.207, 12), graphite, arm, [0, -0.1435, 0]);
    part('armShell' + side, shell(-0.072, -0.235, [
      { u: -0.115, rx: 0.058, rz: 0.064 }, { u: -0.16, rx: 0.060, rz: 0.065 }, { u: -0.196, rx: 0.056, rz: 0.060 },
    ], 0.014, 0.014, N_LIMB, 3), white, arm);
    part('elbowHub' + side, cylinderGeo(0.05, 0.05, 0.084, 16), graphite, fore, [0, 0, 0.014 * s], [90, 0, 0]);
    part('forearmShell' + side, shell(-0.068, -0.292, [
      { u: -0.105, rx: 0.044, rz: FORE_RZ, cz }, { u: -0.165, rx: 0.048, rz: FORE_RZ, cz }, { u: -0.235, rx: 0.040, rz: 0.031, cz },
    ], 0.014, 0.014, N_LIMB, 3), white, fore);
    part('hand' + side, shell(-0.303, -0.450, [
      { u: -0.335, rx: 0.040, rz: FORE_RZ, cz }, { u: -0.385, rx: 0.044, rz: FORE_RZ, cz }, { u: -0.420, rx: 0.038, rz: 0.032, cz },
    ], 0.02, 0.02, N_HAND, 4), graphite, fore);

    // ---- leg: hip hub, thigh shell, dark spar; shin child with knee hub, shell, ankle collar; foot child at the ankle ----
    const leg = node('leg' + side, [0, HIP_Y, s * HIP_Z], torso);
    const shin = node('shin' + side, [0, -KNEE_DROP, 0], leg);
    part('hipHub' + side, cylinderGeo(0.062, 0.062, 0.12, 16), graphite, leg, [0, 0, 0], [90, 0, 0]);
    part('thighSpar' + side, cylinderGeo(0.030, 0.030, 0.327, 12), graphite, leg, [0, -0.2035, 0]);
    part('thighShell' + side, shell(-0.078, -0.353, [
      { u: -0.125, rx: 0.064, rz: 0.056 }, { u: -0.20, rx: 0.066, rz: 0.056 }, { u: -0.285, rx: 0.058, rz: 0.053 },
    ], 0.016, 0.016, N_LIMB, 3), white, leg);
    part('kneeHub' + side, cylinderGeo(0.05, 0.05, 0.12, 16), graphite, shin, [0, 0, 0], [90, 0, 0]);
    part('shinSpar' + side, cylinderGeo(0.026, 0.026, 0.27, 12), graphite, shin, [0, -0.165, 0]);
    part('shinShell' + side, shell(-0.066, -0.372, [
      { u: -0.11, rx: 0.054, rz: 0.050 }, { u: -0.17, rx: 0.058, rz: 0.052 }, { u: -0.28, rx: 0.048, rz: 0.046 }, { u: -0.335, rx: 0.043, rz: 0.042 },
    ], 0.014, 0.014, N_LIMB, 3), white, shin);
    // collar ends 34 mm above the ankle axis, the foot's hub 26 mm: an 8 mm dark gap at every ankle angle
    part('ankleCollar' + side, cylinderGeo(0.038, 0.038, 0.024, 14), graphite, shin, [0, -0.364, 0]);
    const foot = node('foot' + side, [0, -SHIN_DROP, 0], shin);
    part('ankleHub' + side, cylinderGeo(0.026, 0.026, 0.07, 16), graphite, foot, [0, 0, 0], [90, 0, 0]);
    part('shoe' + side, footLoft(shoeSt, N_HAND, 3), white, foot, [0, 0, 0], [0, 0, -90]);
    part('sole' + side, footLoft(soleSt, N_HAND, 3), graphite, foot, [0, 0, 0], [0, 0, -90]);
  }

  // ---- locators (empty named nodes; FOUP base centre) ----
  node('foupCarry', [CARRY_X, 0.92, 0], torso);   // rides the torso bob with the hands
  node('foupHandoff', [HANDOFF_X, 0.92, 0], root);

  return root;
}

// ---- animation ----
// ---- Walk / Carry legs: heel-to-toe roll baked every 0.05 s, in place (the scene moves the root at SPEED along +X) ----
// Left foot strikes at t = 0, right at CYCLE / 2. Contact points in the foot frame (origin at the ankle pivot).
const L_THIGH = KNEE_DROP, L_SHIN = SHIN_DROP;
const CYCLE = 1.1, DT = 0.05, SPEED = 1.2, STANCE = 0.65, FLAT_AT = 0.10, HEEL_OFF = 0.45;
const PITCH_STRIKE = 12, PITCH_TOEOFF = -25, STRIKE_X = GAIT_STRIKE_X, LIFT = GAIT_LIFT, LIFT_POW = 2.5, LIFT_SKEW = 0.8, MARGIN = 0.0008;
const HEEL = [SOLE_HEEL_X, -ANKLE_Y], BALL = [SOLE_BALL_X, -ANKLE_Y], TOE = [SOLE_TOE_X, SOLE_TOE_RISE - ANKLE_Y];
const TOE_TAKEOVER = Math.atan2(TOE[1] - BALL[1], TOE[0] - BALL[0]) * 180 / Math.PI;
function wrapT(t, T) { return ((t % T) + T) % T; }
function rot2(p, deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; }
function ease(u) { return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u))); }
function stancePitch(tau) {
  if (tau < FLAT_AT) return PITCH_STRIKE * (1 - ease(tau / FLAT_AT));
  if (tau > HEEL_OFF) return PITCH_TOEOFF * ease((tau - HEEL_OFF) / (STANCE - HEEL_OFF));
  return 0;
}
// Stance: the contact point (heel, ball, then toe) is pinned to ground sliding back at SPEED. Returns [ankle x rel. hip, ankle y, pitch].
function stanceFoot(tau) {
  const g = STRIKE_X - SPEED * tau, psi = stancePitch(tau);
  let c = HEEL, cx = g;
  if (psi < 0 && -psi <= TOE_TAKEOVER) { c = BALL; cx = g + BALL[0] - HEEL[0]; }
  else if (psi < 0) { c = TOE; cx = g + BALL[0] - HEEL[0] + rot2([TOE[0] - BALL[0], TOE[1] - BALL[1]], -TOE_TAKEOVER)[0]; }
  const r = rot2(c, psi);
  return [cx - r[0], -r[1], psi];
}
// Swing: toe-off pose to the next strike pose; X is a Hermite curve leaving and arriving at the stance speed.
function swingFoot(u) {
  const a = stanceFoot(STANCE), b = stanceFoot(0), e = ease(u), v = -SPEED * (CYCLE - STANCE), u2 = u * u, u3 = u2 * u;
  const x = a[0] * (2 * u3 - 3 * u2 + 1) + v * (u3 - 2 * u2 + u) + b[0] * (3 * u2 - 2 * u3) + v * (u3 - u2);
  return [x, a[1] + (b[1] - a[1]) * e + LIFT * Math.pow(Math.sin(Math.PI * Math.pow(u, LIFT_SKEW)), LIFT_POW), a[2] + (b[2] - a[2]) * e];
}
function inStance(t, t0) { return wrapT(t - t0, CYCLE) <= STANCE + 1e-9; }
function footState(t, t0) {
  const tau = wrapT(t - t0, CYCLE);
  return inStance(t, t0) ? stanceFoot(Math.min(tau, STANCE)) : swingFoot((tau - STANCE) / (CYCLE - STANCE));
}
// Torso height: as high as every stance leg reaches (MARGIN short of straight): highest at mid-stance.
function hipHeight(t) {
  let h = HIP_Y;
  [0, CYCLE / 2].forEach(function (t0) {
    if (!inStance(t, t0)) return;
    const a = footState(t, t0), r = L_THIGH + L_SHIN - MARGIN;
    h = Math.min(h, a[1] + Math.sqrt(Math.max(0, r * r - a[0] * a[0])));
  });
  return h;
}
// Planar two-bone IK in the hip frame; returns [thigh, knee, ankle] Z angles in degrees (the ankle sets the foot pitch).
function legPose(t, t0) {
  const a = footState(t, t0), dx = a[0], dy = a[1] - hipHeight(t);
  const d = Math.min(Math.hypot(dx, dy), L_THIGH + L_SHIN);
  const c = function (v) { return Math.max(-1, Math.min(1, v)); };
  const hip = Math.atan2(dx, -dy) + Math.acos(c((L_THIGH * L_THIGH + d * d - L_SHIN * L_SHIN) / (2 * L_THIGH * d)));
  const knee = -(Math.PI - Math.acos(c((L_THIGH * L_THIGH + L_SHIN * L_SHIN - d * d) / (2 * L_THIGH * L_SHIN))));
  return [hip * 180 / Math.PI, knee * 180 / Math.PI, a[2] - (hip + knee) * 180 / Math.PI];
}
// Keys every DT over one cycle (first key equal to the last); armSwing(s) gives the right upper-arm angle, or omit it.
function bakeGait(armSwing) {
  const n = Math.round(CYCLE / DT), tr = {};
  const R6 = function (v) { return Math.round(v * 1e6) / 1e6; };
  ['torso', 'legLeft', 'shinLeft', 'footLeft', 'legRight', 'shinRight', 'footRight', 'armLeft', 'armRight'].forEach(function (k) { tr[k] = []; });
  for (let i = 0; i <= n; i++) {
    const t = Math.round(i * DT * 1e9) / 1e9, s = i === n ? 0 : t;
    const L = legPose(s, 0), Rr = legPose(s, CYCLE / 2);
    tr.torso.push({ time: t, position: [0, Math.round((hipHeight(s) - HIP_Y) * 1e7) / 1e7, 0] });
    const e = [['legLeft', L[0]], ['shinLeft', L[1]], ['footLeft', L[2]], ['legRight', Rr[0]], ['shinRight', Rr[1]], ['footRight', Rr[2]]];
    if (armSwing) { const sw = armSwing(s); e.push(['armLeft', -sw], ['armRight', sw]); }
    e.forEach(function (x) { tr[x[0]].push({ time: t, rotation: [0, 0, R6(x[1])] }); });
  }
  return Object.keys(tr).filter(function (k) { return tr[k].length; })
    .map(function (k) { return k === 'torso' ? positionTrack(k, tr[k]) : rotationTrack(k, tr[k]); });
}

// Two-link arm IK in the sagittal plane: target = hand pad centre relative to the shoulder (forward, up).
// Returns [upper-arm angle about Z, elbow flexion] in degrees; +Z rotation swings a hanging limb forward.
function armIK(px, py) {
  const L1 = ELBOW_DROP, L2 = HAND_C;
  const d = Math.hypot(px, py);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const flex = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
  const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const phi = Math.atan2(px, -py);
  return [((phi - alpha) * 180) / Math.PI, (flex * 180) / Math.PI];
}

function animate(root) {
  const R = (v) => Math.round(v * 1e6) / 1e6;
  const rot = (name, times, fn, axis) => rotationTrack(name, times.map((t) => {
    const v = R(fn(t));
    return { time: R(t), rotation: axis === 'y' ? [0, v, 0] : [0, 0, v] };
  }));
  const cyc = (T, N) => Array.from({ length: N + 1 }, (_, i) => (T * i) / N);
  const ph = (t, T) => (2 * Math.PI * t) / T;

  // Walk / Carry: torso bob and heel-to-toe legs from bakeGait; Walk swings the arms +/-15 opposite to the legs.
  const TW = CYCLE;
  const walk = createClip('Walk', TW, [
    ...bakeGait((s) => 15 * Math.cos(ph(s, TW))),
    rot('forearmLeft', [0, TW], () => 15),
    rot('forearmRight', [0, TW], () => 15),
  ]);

  const dy = PAD_Y - SHOULDER_Y;
  const [c1, cf] = armIK(CARRY_X, dy);
  const carry = createClip('Carry', TW, [
    ...bakeGait(),
    rot('armLeft', [0, TW], () => c1),
    rot('armRight', [0, TW], () => c1),
    rot('forearmLeft', [0, TW], () => cf),
    rot('forearmRight', [0, TW], () => cf),
  ]);

  // Handoff: hand pad (and FOUP base centre) moves linearly foupCarry -> foupHandoff over 1.5 s, holds 0.5 s, returns over 1.0 s.
  const hx = (t) => (t <= 1.5 ? CARRY_X + (HANDOFF_X - CARRY_X) * (t / 1.5)
    : t <= 2.0 ? HANDOFF_X : HANDOFF_X - (HANDOFF_X - CARRY_X) * ((t - 2.0) / 1.0));
  const th = [];
  for (let i = 0; i <= 15; i++) th.push(i * 0.1);
  th.push(2.0);
  for (let i = 1; i <= 10; i++) th.push(2.0 + i * 0.1);
  const handoff = createClip('Handoff', 3, [
    rot('armLeft', th, (t) => armIK(hx(t), dy)[0]),
    rot('armRight', th, (t) => armIK(hx(t), dy)[0]),
    rot('forearmLeft', th, (t) => armIK(hx(t), dy)[1]),
    rot('forearmRight', th, (t) => armIK(hx(t), dy)[1]),
  ]);

  const TI = 4, ti = cyc(TI, 32);
  const idle = createClip('Idle', TI, [
    rot('head', ti, (t) => 10 * Math.sin(ph(t, TI)), 'y'),
    rot('armLeft', ti, (t) => 3 * Math.sin(ph(t, TI))),
    rot('armRight', ti, (t) => -3 * Math.sin(ph(t, TI))),
  ]);

  const TS = 3, ts = cyc(TS, 24);
  const raise = (t) => 30 * (1 - Math.cos(ph(t, TS)));
  const service = createClip('Service', TS, [
    rot('armLeft', ts, raise),
    rot('armRight', ts, raise),
    rot('forearmLeft', [0, TS], () => 20),
    rot('forearmRight', [0, TS], () => 20),
  ]);

  return [walk, idle, carry, handoff, service];
}
