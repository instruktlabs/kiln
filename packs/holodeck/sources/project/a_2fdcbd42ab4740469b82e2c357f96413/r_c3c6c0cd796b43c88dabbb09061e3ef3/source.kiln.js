// Meridian Sanctuary statue: a robed standing figure lifting a sphere overhead with both hands,
// for the floating sky. One closed implicit body (robe, head, arms, sleeve drapes), a separate
// orb mesh (so a polished or mirror material can replace its marble later) and a square plinth
// with base and cap mouldings. Read at 30-80 m: silhouette, head, arms and drape, no fine detail.
// Frame for this asset: figure faces +Z, +Y up, plinth bottom at y = 0 (the brief's convention).
// Marble: the white veined marble patch and low roughness of the stone kit (stone-kit.kiln.js,
// architecture.kiln.js), as a standalone tiled texture at the kit's density (one patch ~1.94 m).
const meta = { name: 'Meridian statue figure', role: 'prop' };

// ---------------------------------------------------------------- dimensions (metres)
const PLINTH_HALF = 0.45, PLINTH_H = 0.35;
const FOOT_Y = PLINTH_H - 0.007; // the figure's base sits 7 mm into the plinth top
const FIG_H = 2.0; // feet to crown at scale 1 (7.5 heads)
const HEAD = FIG_H / 7.5;
const ORB_R = 0.2;
const ORB_C = [0, PLINTH_H + FIG_H + 0.35, 0.04];
const PATCH_M = 1.94; // metres per marble patch (kit density 0.25 atlas units per metre)

// ---------------------------------------------------------------- marble (as the stone kit)
function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function veinPolys(R, x, y, ang, steps, len, halfW, wiggle, seg = 6) {
  const left = [], right = [];
  for (let k = 0; k < steps; k++) {
    ang += (R() - 0.5) * wiggle;
    x += Math.cos(ang) * len; y += Math.sin(ang) * len;
    const t = k / (steps - 1);
    const w = Math.max(1, halfW * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.7 + 0.6 * R()));
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    left.push([Math.round(x + nx) + 0, Math.round(y + ny) + 0]);
    right.push([Math.round(x - nx) + 0, Math.round(y - ny) + 0]);
  }
  const polys = [];
  for (let a = 0; a < steps - 1; a += seg) {
    const b = Math.min(steps - 1, a + seg);
    const pts = left.slice(a, b + 1).concat(right.slice(a, b + 1).reverse()).filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
    if (pts.length >= 3) polys.push(pts);
  }
  return polys;
}
// White veined marble, identical to the kits' marbleSpec: near-white ground, two long veins a
// patch (faint halo round a fine warm-grey core, forked branch) and fainter secondary veins.
function marbleSpec(q, seed, baseAng) {
  const s = q / 512, R = rng(seed), ops = [];
  ops.push({ op: 'legacy-v2', spec: { schemaVersion: 2, size: q, usage: 'albedo', layers: [
    { op: 'noise', colorA: 0xf1efea, colorB: 0xfefdfb, scale: 3, octaves: 4, seed },
    { op: 'noise', colorA: 0xdcd6cc, colorB: 0xfaf8f4, scale: 10, octaves: 2, seed: seed + 5, blend: 'overlay', opacity: 0.25 },
  ] } });
  for (let i = 0; i < 2; i++) {
    const x = -0.05 * q, y = ((i + 0.25 + R() * 0.5) * q) / 2, ang = baseAng + (R() - 0.5) * 0.3, vs = Math.floor(R() * 1e9);
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 10 * s + 1, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [222, 216, 206, 255], opacity: 28 });
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 1.2 * s + 0.6, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [178, 172, 162, 255], opacity: 75 });
    const t = 0.3 + 0.3 * R(), ba = ang + (R() < 0.5 ? -1 : 1) * (0.4 + 0.3 * R());
    for (const p of veinPolys(R, x + t * q * Math.cos(ang), y + t * q * Math.sin(ang), ba, 13, q / 26, 0.9 * s + 0.5, 0.35)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [186, 180, 170, 255], opacity: 60 });
  }
  for (let i = 0; i < 5; i++) {
    const opacity = 30 + Math.floor(R() * 18);
    for (const p of veinPolys(R, R() * q, R() * q, baseAng + (R() - 0.5) * 0.9, 19, q / 30, 0.8 * s + 0.5, 0.5)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [200, 194, 186, 255], opacity });
  }
  return { schemaVersion: 3, width: q, height: q, usage: 'albedo', operations: ops };
}
// The kits' marble roughness: 0x20-0x34 (0.13-0.20) in green, no metal.
function ormSpec(oq, roughA, roughB, seed) {
  return { schemaVersion: 3, width: oq, height: oq, usage: 'metallicRoughness', operations: [{ op: 'legacy-v2', spec: { schemaVersion: 2, size: oq, usage: 'metallicRoughness', layers: [
    { op: 'noise', colorA: roughA << 8, colorB: roughB << 8, scale: 5, octaves: 3, seed }] } }] };
}
function marbleMaterial() {
  const albedo = proceduralTexture(marbleSpec(512, 101, 0.55));
  const orm = proceduralTexture(ormSpec(64, 0x20, 0x34, 5));
  const m = pbrMaterial({ albedo, metallicRoughness: orm, roughness: 1, metalness: 1 });
  m.name = 'marble';
  return m;
}

// ---------------------------------------------------------------- signed distance helpers (negative inside)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  nrm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
// tapered capsule from a (radius ra) to b (radius rb)
function sdCone(p, a, b, ra, rb) {
  const pa0 = p[0] - a[0], pa1 = p[1] - a[1], pa2 = p[2] - a[2];
  const ba0 = b[0] - a[0], ba1 = b[1] - a[1], ba2 = b[2] - a[2];
  const h = clamp((pa0 * ba0 + pa1 * ba1 + pa2 * ba2) / (ba0 * ba0 + ba1 * ba1 + ba2 * ba2), 0, 1);
  return Math.hypot(pa0 - ba0 * h, pa1 - ba1 * h, pa2 - ba2 * h) - mix(ra, rb, h);
}
function sdEllipsoid(p, c, r) {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  const k1 = Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}
// rotate p about the X axis through pivot by angle (radians)
function rotX(p, pivot, ang) {
  const y = p[1] - pivot[1], z = p[2] - pivot[2], c = Math.cos(ang), s = Math.sin(ang);
  return [p[0], pivot[1] + c * y - s * z, pivot[2] + s * y + c * z];
}

// ---------------------------------------------------------------- the figure
// Robe sections: [y, rx, rz, cx, cz, fold amplitude (relative)]. The weight rests on the
// figure's right leg (-X), so the hips shift a little toward it; the free left knee presses
// forward through the cloth. A peplos overfold ends at the hips; a high girdle under the chest.
const ROBE = [
  [FOOT_Y, 0.255, 0.235, -0.01, 0.025, 0.075],
  [0.40, 0.238, 0.21, -0.01, 0.022, 0.07],
  [0.55, 0.218, 0.18, -0.012, 0.016, 0.06],
  [0.80, 0.202, 0.158, -0.015, 0.01, 0.05],
  [1.05, 0.196, 0.147, -0.018, 0.0, 0.035],
  [1.18, 0.203, 0.15, -0.02, -0.005, 0.025],
  [1.205, 0.222, 0.165, -0.02, -0.002, 0.06], // overfold hem
  [1.42, 0.178, 0.133, -0.012, 0.004, 0.05],
  [1.62, 0.168, 0.128, -0.006, 0.01, 0.02],
  [1.66, 0.162, 0.124, -0.005, 0.012, 0.008], // girdle
  [1.70, 0.178, 0.138, -0.004, 0.018, 0.03],
  [1.82, 0.19, 0.145, 0, 0.022, 0.025],
  [1.95, 0.195, 0.128, 0, 0.004, 0.015],
  [2.03, 0.12, 0.09, 0, 0.0, 0.0],
];
function robeAt(y) {
  if (y <= ROBE[0][0]) return ROBE[0];
  for (let i = 1; i < ROBE.length; i++) if (y <= ROBE[i][0]) {
    const a = ROBE[i - 1], b = ROBE[i], t = (y - a[0]) / (b[0] - a[0]), s = t * t * (3 - 2 * t);
    return a.map((v, k) => mix(v, b[k], k === 0 ? t : s));
  }
  return ROBE[ROBE.length - 1];
}
function foldWave(th, y) {
  // mostly vertical folds, deeper and fewer toward the hem, drifting slightly with height
  return 0.62 * Math.sin(9 * th + 0.9 * Math.sin(2 * th + 0.7) + 0.35 * y + 1.3)
    + 0.38 * Math.sin(16 * th + 1.7 * Math.sin(3 * th) - 0.5 * y + 0.4);
}
function sdRobe(p) {
  const y = p[1];
  const [, rx, rz, cx, cz, fa] = robeAt(y);
  const x = p[0] - cx, z = p[2] - cz;
  const th = Math.atan2(z, x);
  const f = 1 + fa * foldWave(th, y);
  const rho = Math.hypot(x / (rx * f), z / (rz * f));
  let d = (rho - 1) * Math.min(rx, rz) * f;
  d = Math.max(d, FOOT_Y - y, y - 2.03);
  return d;
}

const SHOULDER = [0.195, 2.0, -0.005];
const ARM_U = 0.33, ARM_F = 0.29;
const ORB_GRIP = 58 * Math.PI / 180; // contact angle up from the orb's lowest point
function armChain(side) {
  const n = [side * Math.sin(ORB_GRIP), -Math.cos(ORB_GRIP), 0.08];
  const nn = v3.nrm(n);
  const t = v3.nrm([side * Math.cos(ORB_GRIP), Math.sin(ORB_GRIP), 0]); // up the orb's side
  const palm = v3.add(ORB_C, v3.mul(nn, ORB_R + 0.024));
  const wrist = v3.sub(palm, v3.mul(t, 0.065));
  const n2 = v3.nrm([side * Math.sin(78 * Math.PI / 180), -Math.cos(78 * Math.PI / 180), 0.12]);
  const tip = v3.add(ORB_C, v3.mul(n2, ORB_R + 0.012));
  const thumbTip = v3.add(ORB_C, v3.mul(v3.nrm([side * 0.5, -0.6, 0.62]), ORB_R + 0.01));
  const S = [side * SHOULDER[0], SHOULDER[1], SHOULDER[2]];
  // two-link solve: elbow bends outward and a little forward
  const sw = v3.sub(wrist, S), d = v3.len(sw), u = v3.mul(sw, 1 / d);
  const a = (ARM_U * ARM_U - ARM_F * ARM_F + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ARM_U * ARM_U - a * a));
  let bend = [side, 0, 0.3];
  bend = v3.nrm(v3.sub(bend, v3.mul(u, v3.dot(bend, u))));
  const E = v3.add(v3.add(S, v3.mul(u, a)), v3.mul(bend, h));
  return { S, E, wrist, palm, tip, thumbTip, side };
}
const ARMS = [armChain(1), armChain(-1)];

function sdArm(p, A) {
  let d = sdCone(p, A.S, A.E, 0.066, 0.05);
  d = smin(d, sdCone(p, A.E, A.wrist, 0.05, 0.035), 0.03);
  d = smin(d, sdCone(p, A.wrist, A.palm, 0.035, 0.033), 0.025);
  d = smin(d, sdCone(p, A.palm, A.tip, 0.032, 0.022), 0.02);
  const thumbBase = v3.add(A.wrist, v3.mul(v3.sub(A.palm, A.wrist), 0.5));
  d = smin(d, sdCone(p, thumbBase, A.thumbTip, 0.022, 0.017), 0.02);
  return d;
}
// The chiton sleeve, slid down the raised arm, hangs as a drape from the upper arm and elbow to
// the side of the chest: a fan of rounded folds that merge into one cloth wing.
function sdSleeve(p, A) {
  let d = 1e9;
  const s = A.side;
  const hang = (t) => v3.add(A.S, v3.mul(v3.sub(A.E, A.S), t));
  const anchors = [
    [0.25, [s * 0.185, 1.86, 0.035]], [0.5, [s * 0.19, 1.84, -0.01]], [0.72, [s * 0.215, 1.86, 0.03]],
    [0.92, [s * 0.235, 1.9, -0.02]], [1.05, [s * 0.255, 1.96, 0.02]],
  ];
  for (const [t, foot] of anchors) {
    const top = t <= 1 ? hang(t) : v3.add(A.E, v3.mul(v3.sub(A.wrist, A.E), t - 1));
    const lowTop = [top[0], top[1] - 0.03, top[2]];
    const mid = v3.add(v3.mul(v3.add(lowTop, foot), 0.5), [s * 0.04, -0.05, 0]); // sag outward and down
    d = smin(d, sdCone(p, lowTop, mid, 0.03, 0.028), 0.04);
    d = smin(d, sdCone(p, mid, foot, 0.028, 0.026), 0.04);
  }
  return d;
}

const HEAD_PIVOT = [0, 2.09, 0.01], HEAD_TILT = -8 * Math.PI / 180; // a slight lift of the face
function sdHead(p) {
  const q = rotX(p, HEAD_PIVOT, -HEAD_TILT);
  let d = sdEllipsoid(q, [0, 2.24, -0.012], [0.1, 0.12, 0.114]); // hair over the cranium
  d = smin(d, sdEllipsoid(q, [0, 2.175, 0.04], [0.078, 0.098, 0.082]), 0.04); // face
  d = smin(d, sdEllipsoid(q, [0, 2.105, 0.065], [0.042, 0.035, 0.035]), 0.03); // chin
  d = smin(d, sdCone(q, [0, 2.205, 0.112], [0, 2.162, 0.132], 0.014, 0.017), 0.015); // nose
  d = smin(d, sdEllipsoid(q, [0, 2.205, -0.118], [0.06, 0.05, 0.05]), 0.03); // chignon
  return d;
}

// A himation hangs from the shoulders down the back to the calves: a layer standing 3 cm off the
// robe over its back half, its hem curving up toward the sides, with its own broader folds.
function sdMantle(p) {
  const y = p[1];
  if (y < 0.62 || y > 2.06) return 1e9;
  const [, rx, rz, cx, cz] = robeAt(Math.min(y, 1.97));
  const x = p[0] - cx, z = p[2] - cz;
  const th = Math.atan2(z, x);
  const f = 1 + 0.035 * Math.sin(6 * th + 0.6 * Math.sin(2 * th) + 0.2 * y + 2.1);
  const ox = rx + 0.032, oz = rz + 0.038;
  const rho = Math.hypot(x / (ox * f), z / (oz * f));
  let d = (rho - 1) * Math.min(ox, oz) * f;
  d = Math.max(d, z + 0.005 - 0.04 * Math.max(0, y - 1.75) / 0.3); // back half; it wraps forward over the shoulders
  d = Math.max(d, 0.68 + 2.6 * x * x - y, y - 2.04);
  return d;
}

function sdFigure(p) {
  const x = p[0], y = p[1], z = p[2];
  let d = sdRobe(p);
  if (z < 0.08) d = smin(d, sdMantle(p), 0.015);
  // free left knee and thigh pressing the cloth forward
  if (y < 1.35 && y > 0.6) {
    d = smin(d, sdCone(p, [0.075, 1.18, 0.02], [0.08, 0.86, 0.1], 0.085, 0.07), 0.06);
    d = smin(d, sdCone(p, [0.08, 0.86, 0.1], [0.095, 0.52, 0.08], 0.068, 0.06), 0.06);
  }
  // toes from under the hem
  if (y < 0.5 && z > 0) {
    d = smin(d, sdEllipsoid(p, [-0.085, FOOT_Y + 0.03, 0.18], [0.047, 0.036, 0.09]), 0.02);
    d = smin(d, sdEllipsoid(p, [0.115, FOOT_Y + 0.03, 0.215], [0.047, 0.036, 0.09]), 0.02);
  }
  // shoulders, neck, head
  if (y > 1.8) {
    d = smin(d, sdCone(p, [-0.17, 2.0, -0.01], [0.17, 2.0, -0.01], 0.07, 0.07), 0.06);
    d = smin(d, sdCone(p, [0, 1.96, -0.008], [0, 2.13, 0.012], 0.054, 0.05), 0.05);
    if (y > 2.0) d = smin(d, sdHead(p), 0.04);
  }
  // arms and sleeve drapes
  if (y > 1.75 && Math.abs(x) > 0.05) {
    for (const A of ARMS) {
      if (A.side * x < 0) continue;
      d = smin(d, sdArm(p, A), 0.05);
      if (y < 2.45) d = smin(d, sdSleeve(p, A), 0.05);
    }
  }
  return d;
}

// ---------------------------------------------------------------- plinth
// A square plinth 0.9 x 0.9 x 0.35 m: base block, a rounded base moulding, a fillet, the die,
// and a cap of fillet, ovolo and top slab. Revolved with four segments (a square), so each
// profile half-width w becomes a corner radius w * sqrt 2.
const PLINTH_PROFILE = [
  [0.45, 0], [0.45, 0.065], [0.447, 0.077], [0.438, 0.088], [0.425, 0.096], [0.41, 0.1],
  [0.405, 0.1], [0.405, 0.112], [0.395, 0.118], [0.395, 0.25], [0.405, 0.256], [0.405, 0.266],
  [0.414, 0.268], [0.425, 0.274], [0.434, 0.283], [0.44, 0.294], [0.45, 0.298], [0.45, PLINTH_H],
];

async function build() {
  const root = createRoot('statue_figure');
  const marble = marbleMaterial();

  const ext = 0.04;
  const raw = await implicitSurface((p) => -sdFigure(p), {
    bounds: { min: [-0.48, FOOT_Y - ext, -0.36], max: [0.48, ORB_C[1] + 0.12, 0.42] },
    edgeLength: 0.023,
  });
  const figGeo = projectUV(raw, { projection: 'box', metersPerUnit: PATCH_M });
  requireSolid(createPart('figure', figGeo, marble, { parent: root }));

  const orbGeo = projectUV(copyGeometry(sphereGeo(ORB_R, 48, 32)), { projection: 'box', metersPerUnit: PATCH_M, frame: { origin: [0.37, 0.21, 0.11] } });
  requireSolid(createPart('orb', orbGeo, marble, { parent: root, position: ORB_C }));

  const k = Math.SQRT2;
  const prof = [[0, 0], ...PLINTH_PROFILE.map(([w, y]) => [w * k, y]), [0, PLINTH_H]];
  const plinthRaw = await revolveProfile(prof, { segments: 4, smooth: false });
  plinthRaw.rotateY(Math.PI / 4);
  const plinthGeo = projectUV(plinthRaw, { projection: 'box', metersPerUnit: PATCH_M, frame: { origin: [0.61, 0, 0.29] } });
  requireSolid(createPart('plinth', plinthGeo, marble, { parent: root }));
  return root;
}
