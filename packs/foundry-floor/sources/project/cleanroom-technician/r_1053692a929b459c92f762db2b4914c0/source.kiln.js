// Cleanroom technician: a person in a white bunny suit with blue hood trim, gloves and boot covers.
// Metres, +X forward (the face), +Y up, +Z is the technician's right. Feet on Y=0, root between the feet.
// Every moving part is a group whose origin sits on its joint axis; limb geometry is built relative to that
// origin, so rotating a limb about Z (or the head about Y) keeps each joint ball inside the torso.
const meta = { name: 'Cleanroom technician' };

const XB = -0.045;                       // body axis (x) of torso, legs, arms
const HIP_Y = 0.90, HIP_Z = 0.09;
const SHOULDER_Y = 1.39, SHOULDER_Z = 0.226;
const NECK_Y = 1.49, HEAD_X = -0.035;
const HEAD_TOP = 0.26;                   // hood apex above the neck pivot: 1.49 + 0.26 = 1.75
const BOOT_HEEL = -0.13, BOOT_TOE = 0.22; // relative to the hip pivot: world x -0.175 .. +0.175
const N_BODY = 20, N_LIMB = 16, N_FOOT = 14, N_HOOD = 24;

// y, rx, rz, superellipse exponent
const TORSO = [
  [0.790, 0.100, 0.160, 2.4], [0.830, 0.108, 0.166, 2.4], [0.900, 0.112, 0.174, 2.4],
  [0.980, 0.108, 0.160, 2.4], [1.060, 0.108, 0.152, 2.4], [1.140, 0.114, 0.164, 2.3],
  [1.240, 0.118, 0.178, 2.3], [1.330, 0.112, 0.187, 2.2], [1.385, 0.098, 0.186, 2.2],
  [1.425, 0.078, 0.150, 2.0], [1.455, 0.064, 0.100, 2.0], [1.480, 0.060, 0.076, 2.0],
  [1.492, 0.058, 0.070, 2.0]
];
// relative to the hip pivot: y, rx, rz
const LEG = [
  [0.030, 0.078, 0.070], [0.000, 0.086, 0.078], [-0.100, 0.082, 0.074], [-0.250, 0.072, 0.066],
  [-0.400, 0.064, 0.060], [-0.480, 0.062, 0.058], [-0.570, 0.062, 0.057], [-0.680, 0.052, 0.049],
  [-0.780, 0.044, 0.043], [-0.815, 0.042, 0.041]
];
const CUFF = [
  [-0.585, 0.0650, 0.0600], [-0.600, 0.0680, 0.0630], [-0.680, 0.0620, 0.0570],
  [-0.750, 0.0580, 0.0550], [-0.795, 0.0540, 0.0480]
];
// x, half height, half width (bottom of every station at y = -HIP_Y, so the sole is one flat line on the floor)
const FOOT = [
  [-0.122, 0.018, 0.026], [-0.105, 0.036, 0.043], [-0.075, 0.054, 0.054], [-0.040, 0.066, 0.058],
  [0.000, 0.070, 0.059], [0.040, 0.066, 0.060], [0.085, 0.055, 0.061], [0.130, 0.042, 0.059],
  [0.175, 0.031, 0.050], [0.205, 0.020, 0.034, 0.0045], [0.217, 0.009, 0.018, 0.011]
]; // [x, half-height, half-width, toe-spring lift]
// relative to the shoulder pivot: y, radius
const SLEEVE = [
  [0.040, 0.0283], [0.025, 0.0421], [0.000, 0.049], [-0.080, 0.049], [-0.200, 0.045],
  [-0.300, 0.041], [-0.420, 0.038], [-0.500, 0.035], [-0.550, 0.0335]
];
const GLOVE = [
  [-0.500, 0.038, 0.038], [-0.512, 0.0415, 0.0415], [-0.560, 0.040, 0.042], [-0.600, 0.033, 0.046],
  [-0.650, 0.030, 0.046], [-0.690, 0.027, 0.042], [-0.725, 0.022, 0.033], [-0.745, 0.014, 0.020]
];
const THUMB = [[-0.585, 0.020, 0.011], [-0.620, 0.028, 0.0115], [-0.660, 0.036, 0.0105], [-0.688, 0.040, 0.008]];
// head-local: y, rx, rz, xc
const HOOD = [
  [-0.035, 0.078, 0.094, 0.000], [0.000, 0.076, 0.086, 0.000], [0.035, 0.088, 0.083, 0.004],
  [0.075, 0.104, 0.088, 0.010], [0.120, 0.112, 0.092, 0.012], [0.165, 0.114, 0.093, 0.010],
  [0.205, 0.108, 0.088, 0.004], [0.235, 0.090, 0.072, -0.002], [0.248, 0.066, 0.053, -0.004],
  [0.256, 0.040, 0.032, -0.004]
];
const GOGGLE = { phi: 58, y0: 0.132, y1: 0.186, out: 0.010, inn: -0.004, n: 13 };
const MASK = { phi: 48, y0: 0.038, y1: 0.118, out: 0.010, inn: -0.004, n: 11 };
const EDGE = { phi: 50, y0: 0.034, y1: 0.122, d: 0.006, r: 0.0045, path: 32, sides: 5 };

function makeMat(name, hex, roughness, metalness, extra) {
  const o = { roughness: roughness, metalness: metalness, flatShading: false };
  if (extra) { Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); }
  const m = gameMaterial(hex, o);
  m.name = name;
  if (extra && extra.opacity !== undefined) { m.transparent = true; m.opacity = extra.opacity; }
  return m;
}
function group(name, parent, pos) {
  const g = createPivot(name, pos || [0, 0, 0], parent);
  g.name = name;
  return g;
}
function part(name, data, m, parent) {
  const p = createPart(name, meshGeo(data), m, { position: [0, 0, 0], rotation: [0, 0, 0], parent: parent });
  p.name = name;
  return p;
}
function sgn(v) { return v < 0 ? -1 : 1; }
function sp(v, p) { return sgn(v) * Math.pow(Math.abs(v), 2 / p); }
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// Closed ring around the Y axis.
function ringY(n, y, rx, rz, xc, zc, p) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = 2 * Math.PI * k / n;
    pts.push([xc + rx * sp(Math.cos(t), p), y, zc + rz * sp(Math.sin(t), p)]);
  }
  return pts;
}
// Closed ring around the X axis (cross-section in the YZ plane); vertex 0 is the lowest point, so soles sit exactly on the floor.
function ringX(n, x, yc, ry, rz, zc, p) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = 1.5 * Math.PI + 2 * Math.PI * k / n;
    pts.push([x, yc + ry * sp(Math.sin(t), p), zc + rz * sp(Math.cos(t), p)]);
  }
  return pts;
}
// Loft closed rings into a watertight mesh. Ends: apex point, flat cap (own vertices, flat normal) or open (wrap).
function loft(rings, o) {
  o = o || {};
  const n = rings[0].length, m = rings.length, pos = [], idx = [];
  rings.forEach(function (r) { r.forEach(function (p) { pos.push(p[0], p[1], p[2]); }); });
  const last = o.wrap ? m : m - 1;
  for (let i = 0; i < last; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k, b = i * n + (k + 1) % n, c = ((i + 1) % m) * n + k, d = ((i + 1) % m) * n + (k + 1) % n;
      idx.push(a, b, c, b, d, c);
    }
  }
  function cap(ring0, base, apex, flat, isEnd) {
    let first = base;
    if (flat) {
      first = pos.length / 3;
      ring0.forEach(function (p) { pos.push(p[0], p[1], p[2]); });
    }
    let A = pos.length / 3;
    if (apex) pos.push(apex[0], apex[1], apex[2]);
    else pos.push(ring0.reduce(function (s, p) { return s + p[0]; }, 0) / n, ring0.reduce(function (s, p) { return s + p[1]; }, 0) / n, ring0.reduce(function (s, p) { return s + p[2]; }, 0) / n);
    for (let k = 0; k < n; k++) {
      const a = first + k, b = first + (k + 1) % n;
      if (isEnd) idx.push(A, a, b); else idx.push(A, b, a);
    }
  }
  if (!o.wrap) {
    if (o.startApex || o.startFlat) cap(rings[0], 0, o.startApex, !!o.startFlat, false);
    if (o.endApex || o.endFlat) cap(rings[m - 1], (m - 1) * n, o.endApex, !!o.endFlat, true);
  }
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const nor = new Array(pos.length).fill(0);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    [a, b, c].forEach(function (q) { nor[q] += nx; nor[q + 1] += ny; nor[q + 2] += nz; });
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  return { positions: pos, indices: idx, normals: nor };
}

function hoodAt(y) {
  for (let i = 0; i < HOOD.length - 1; i++) {
    const a = HOOD[i], b = HOOD[i + 1];
    if (y <= b[0] + 1e-12) {
      const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0])));
      return { rx: a[1] + (b[1] - a[1]) * t, rz: a[2] + (b[2] - a[2]) * t, xc: a[3] + (b[3] - a[3]) * t };
    }
  }
  const l = HOOD[HOOD.length - 1];
  return { rx: l[1], rz: l[2], xc: l[3] };
}
// Point on the hood at azimuth phi (0 = straight ahead, toward +Z positive), height y, pushed out by d.
function surf(phi, y, d) {
  const h = hoodAt(y), c = Math.cos(phi), s = Math.sin(phi);
  const nx = c / h.rx, nz = s / h.rz, l = Math.hypot(nx, nz);
  return [h.xc + h.rx * c + d * nx / l, y, h.rz * s + d * nz / l];
}
// A curved slab that follows the hood between +-phi degrees and y0..y1, rising 'out' above the surface, sunk 'inn' into it.
function hoodSlab(s) {
  const rings = [], e = 0.004;
  for (let i = 0; i < s.n; i++) {
    const phi = (-s.phi + 2 * s.phi * i / (s.n - 1)) * Math.PI / 180;
    rings.push([surf(phi, s.y0 + e, s.out), surf(phi, s.y1 - e, s.out), surf(phi, s.y1, s.out - e),
      surf(phi, s.y1, s.inn), surf(phi, s.y0, s.inn), surf(phi, s.y0, s.out - e)]);
  }
  return loft(rings, { startFlat: true, endFlat: true });
}
// A solid ring band around the hood between y0 and y1, standing 'off' proud of the surface.
function hoodBand(y0, y1, off) {
  const e = 0.003;
  const rings = [[y0, 0], [y0 + e, off], [y1 - e, off], [y1, 0]].map(function (q) {
    const h = hoodAt(q[0]);
    return ringY(N_HOOD, q[0], h.rx + q[1], h.rz + q[1], h.xc, 0, 2);
  });
  return loft(rings, { startFlat: true, endFlat: true });
}
// Round tube along a closed path lying on the hood.
function maskEdge(s) {
  const pts = [], refs = [], p = 6;
  const yc = (s.y0 + s.y1) / 2, hy = (s.y1 - s.y0) / 2;
  for (let i = 0; i < s.path; i++) {
    const t = 2 * Math.PI * i / s.path;
    const phi = sp(Math.cos(t), p) * s.phi * Math.PI / 180, y = yc + sp(Math.sin(t), p) * hy;
    const h = hoodAt(y);
    pts.push(surf(phi, y, s.d));
    refs.push(norm3([Math.cos(phi) / h.rx, 0, Math.sin(phi) / h.rz]));
  }
  const rings = pts.map(function (q, i) {
    const a = pts[(i + s.path - 1) % s.path], b = pts[(i + 1) % s.path];
    const t = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), r = refs[i];
    const d = r[0] * t[0] + r[1] * t[1] + r[2] * t[2];
    const e1 = norm3([r[0] - t[0] * d, r[1] - t[1] * d, r[2] - t[2] * d]), e2 = cross3(t, e1);
    const ring = [];
    for (let k = 0; k < s.sides; k++) {
      const ang = 2 * Math.PI * k / s.sides, c = Math.cos(ang) * s.r, sn = Math.sin(ang) * s.r;
      ring.push([q[0] + e1[0] * c + e2[0] * sn, q[1] + e1[1] * c + e2[1] * sn, q[2] + e1[2] * c + e2[2] * sn]);
    }
    return ring;
  });
  return loft(rings, { wrap: true });
}

async function build() {
  const white = makeMat('suit-white', 0xF3F5F7, 0.85, 0.0);
  const blue = makeMat('suit-blue', 0x8FB3D9, 0.80, 0.0);
  const smoke = makeMat('glass-smoked', 0x5E6A73, 0.10, 0.0, { transparent: true, opacity: 0.6 });
  const graphite = makeMat('trim-graphite', 0x3B4148, 0.50, 0.1);

  const root = createRoot('CleanroomTechnician');

  const torso = group('torso', root, [0, 0, 0]);
  part('torso_suit', loft(TORSO.map(function (r) { return ringY(N_BODY, r[0], r[1], r[2], XB, 0, r[3]); }),
    { startFlat: true, endFlat: true }), white, torso);

  const head = group('head', root, [HEAD_X, NECK_Y, 0]);
  const hoodRings = HOOD.map(function (r) { return ringY(N_HOOD, r[0], r[1], r[2], r[3], 0, 2); });
  part('head_hood', loft(hoodRings, { startFlat: true, endApex: [-0.004, HEAD_TOP, 0] }), white, head);
  part('head_trimBrow', hoodBand(0.198, 0.214, 0.004), blue, head);
  part('head_trimRim', hoodBand(-0.030, -0.012, 0.005), blue, head);
  part('head_goggles', hoodSlab(GOGGLE), smoke, head);
  part('head_mask', hoodSlab(MASK), white, head);
  part('head_maskEdge', maskEdge(EDGE), graphite, head);

  [['Left', -1], ['Right', 1]].forEach(function (s) {
    const nm = s[0], side = s[1];
    const arm = group('arm' + nm, root, [XB, SHOULDER_Y, side * SHOULDER_Z]);
    part('arm' + nm + '_sleeve', loft(SLEEVE.map(function (r) { return ringY(N_LIMB, r[0], r[1], r[1], 0, 0, 2); }),
      { startApex: [0, 0.049, 0], endFlat: true }), white, arm);
    part('arm' + nm + '_glove', loft(GLOVE.map(function (r) { return ringY(N_FOOT, r[0], r[1], r[2], 0, 0, 2); }),
      { startFlat: true, endApex: [0, -0.755, 0] }), blue, arm);
    part('arm' + nm + '_thumb', loft(THUMB.map(function (r) { return ringY(6, r[0], r[2], r[2], r[1], -side * 0.02, 2); }),
      { startFlat: true, endApex: [0.043, -0.700, -side * 0.02] }), blue, arm);

    const leg = group('leg' + nm, root, [XB, HIP_Y, side * HIP_Z]);
    part('leg' + nm + '_leg', loft(LEG.map(function (r) { return ringY(N_LIMB, r[0], r[1], r[2], 0, 0, 2); }),
      { startFlat: true, endFlat: true }), white, leg);
    part('leg' + nm + '_cuff', loft(CUFF.map(function (r) { return ringY(N_LIMB, r[0], r[1], r[2], 0, 0, 2); }),
      { startFlat: true, endFlat: true }), blue, leg);
    part('leg' + nm + '_foot', loft(FOOT.map(function (r) { return ringX(N_FOOT, r[0], -HIP_Y + r[1] + (r[3] || 0), r[1], r[2], 0, 4); }),
      { startApex: [BOOT_HEEL, -HIP_Y + 0.009, 0], endApex: [BOOT_TOE, -HIP_Y + 0.0175, 0] }), blue, leg);
  });
  return root;
}

function keys(dur, steps, fn) {
  const out = [];
  for (let i = 0; i <= steps; i++) out.push({ time: Math.round(dur * i / steps * 1e9) / 1e9, rotation: fn(i / steps) });
  return out;
}
function rz(a) { return [0, 0, Math.round(a * 1e6) / 1e6]; }
function ry(a) { return [0, Math.round(a * 1e6) / 1e6, 0]; }

function animate(root) {
  const W = 2 * Math.PI;
  const walk = createClip('Walk', 1.1, [
    rotationTrack('legLeft', keys(1.1, 8, function (u) { return rz(25 * Math.cos(W * u)); })),
    rotationTrack('legRight', keys(1.1, 8, function (u) { return rz(-25 * Math.cos(W * u)); })),
    rotationTrack('armLeft', keys(1.1, 8, function (u) { return rz(-15 * Math.cos(W * u)); })),
    rotationTrack('armRight', keys(1.1, 8, function (u) { return rz(15 * Math.cos(W * u)); }))
  ]);
  const idle = createClip('Idle', 4, [
    rotationTrack('head', keys(4, 8, function (u) { return ry(10 * Math.sin(W * u)); })),
    rotationTrack('armLeft', keys(4, 8, function (u) { return rz(3 * Math.cos(W * u)); })),
    rotationTrack('armRight', keys(4, 8, function (u) { return rz(-3 * Math.cos(W * u)); }))
  ]);
  const service = createClip('Service', 3, [
    rotationTrack('armLeft', keys(3, 8, function (u) { return rz(30 * (1 - Math.cos(W * u))); })),
    rotationTrack('armRight', keys(3, 8, function (u) { return rz(30 * (1 - Math.cos(W * u))); }))
  ]);
  return [walk, idle, service];
}
