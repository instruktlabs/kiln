// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// Authored by: opus, via claude.
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

const meta = { name: 'Anglerfish', category: 'prop', role: 'prop' };

// ---------------------------------------------------------------------------
// Deep-sea anglerfish (Melanocetus-like). +X = snout, +Y = up, +Z = right.
// Hard bounds: 0.42 long, 0.20 tall, 0.13 wide, belly resting on Y = 0.
//
// The body is one swept tube. Past u = RIM the tube folds back on itself and
// runs inward to the throat, so the gaping mouth is real cavity geometry
// rather than a boolean cut. `tilt` pushes the bottom of each head ring
// forward, which is what gives the jaw its dropped, under-shot profile.
// ---------------------------------------------------------------------------

// [u, x, halfHeight, halfWidth, xTilt, centreLift]
const STATIONS = [
  [0.000, -0.1630, 0.0035, 0.0025,  0.0000, 0.0000],
  [0.030, -0.1585, 0.0100, 0.0072,  0.0000, 0.0000],
  [0.080, -0.1490, 0.0165, 0.0110,  0.0000, 0.0000],
  [0.150, -0.1345, 0.0245, 0.0160,  0.0000, 0.0000],
  [0.230, -0.1150, 0.0345, 0.0225,  0.0000, 0.0000],
  [0.310, -0.0930, 0.0450, 0.0290,  0.0000, 0.0000],
  [0.390, -0.0680, 0.0555, 0.0350,  0.0000, 0.0000],
  [0.470, -0.0400, 0.0655, 0.0405,  0.0000, 0.0000],
  [0.550, -0.0090, 0.0740, 0.0445,  0.0000, 0.0000],
  [0.630,  0.0240, 0.0800, 0.0470, -0.0010, 0.0000],
  [0.700,  0.0530, 0.0825, 0.0480, -0.0020, 0.0000],
  [0.760,  0.0790, 0.0820, 0.0478, -0.0040, 0.0010],
  [0.810,  0.1010, 0.0790, 0.0465, -0.0080, 0.0020],
  [0.850,  0.1200, 0.0730, 0.0440, -0.0120, 0.0030],
  [0.880,  0.1350, 0.0650, 0.0405, -0.0150, 0.0070],
  [0.900,  0.1425, 0.0575, 0.0372, -0.0160, 0.0100],
  [0.910,  0.1460, 0.0530, 0.0348, -0.0170, 0.0120],
  [0.920,  0.1462, 0.0490, 0.0325, -0.0170, 0.0135], // jaw rim / fold
  [0.940,  0.1345, 0.0370, 0.0255, -0.0140, 0.0180],
  [0.965,  0.1120, 0.0250, 0.0175, -0.0100, 0.0240],
  [0.985,  0.0850, 0.0140, 0.0100, -0.0050, 0.0300],
  [1.000,  0.0620, 0.0040, 0.0030,  0.0000, 0.0340],
];

const RIM = 0.920;
const BELLY_POW = 0.65;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function bellyY(u) {
  const t = u >= 0.42 ? 0 : (0.42 - u) / 0.42;
  return 0.004 + 0.045 * t * t;
}

function stationByU(uRaw) {
  const u = clamp(uRaw, 0, 1);
  let i = 0;
  while (i < STATIONS.length - 2 && STATIONS[i + 1][0] < u) i++;
  const a = STATIONS[i], b = STATIONS[i + 1];
  const t = (u - a[0]) / (b[0] - a[0]);
  const ry = lerp(a[2], b[2], t);
  return {
    u,
    x: lerp(a[1], b[1], t),
    ry,
    rz: lerp(a[3], b[3], t),
    tilt: lerp(a[4], b[4], t),
    cy: bellyY(u) + ry + lerp(a[5], b[5], t),
  };
}

// Deterministic warty relief; suppressed on the lip and inside the mouth.
function wartAmount(x, y, z, st) {
  const n1 = Math.sin(x * 118 + 0.7) * Math.sin(y * 133 + 2.1) * Math.sin(z * 126 + 4.2);
  const n2 = Math.sin(x * 213 + 1.9) * Math.sin(y * 238 + 0.4) * Math.sin(z * 226 + 3.3);
  const w = 0.62 * n1 + 0.38 * n2;
  const fade = st.u > 0.855 ? clamp((0.905 - st.u) / 0.050, 0, 1) : 1;
  return 0.0042 * (Math.max(0, w - 0.10) / 0.90) * clamp(st.ry / 0.030, 0.15, 1) * fade;
}

function basePoint(u, theta) {
  const st = stationByU(u);
  const ny = Math.cos(theta), nz = Math.sin(theta);
  const f = ny >= 0 ? ny : -Math.pow(-ny, BELLY_POW);
  return [st.x + st.tilt * ny, st.cy + st.ry * f, st.rz * nz];
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scl(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function baseNormal(u, theta) {
  const du = 0.003, dt = 0.01;
  const pu = sub(basePoint(clamp(u + du, 0, 1), theta), basePoint(clamp(u - du, 0, 1), theta));
  const pt = sub(basePoint(u, theta + dt), basePoint(u, theta - dt));
  const n = norm(cross(pt, pu));
  return u > RIM ? scl(n, -1) : n; // cavity rings face inward
}

function surfacePoint(u, theta) {
  const p = basePoint(u, theta);
  const st = stationByU(u);
  const a = wartAmount(p[0], p[1], p[2], st);
  if (a === 0) return p;
  const n = baseNormal(u, theta);
  return add(p, scl(n, a));
}

// ---------------------------------------------------------------------------

function buildTube(u0, u1, rings, NT, capStart, capEnd) {
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const u = lerp(u0, u1, i / rings);
    for (let j = 0; j < NT; j++) {
      const p = surfacePoint(u, (j / NT) * Math.PI * 2);
      pos.push(p[0], p[1], p[2]);
      uvs.push(i / rings, j / NT);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < NT; j++) {
      const j2 = (j + 1) % NT;
      const a = i * NT + j, b = i * NT + j2;
      const c = (i + 1) * NT + j, d = (i + 1) * NT + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (capStart) {
    const st = stationByU(u0);
    const p = (pos.length / 3);
    pos.push(st.x + st.tilt - 0.005, st.cy, 0); uvs.push(0, 0.5);
    for (let j = 0; j < NT; j++) idx.push(p, (j + 1) % NT, j);
  }
  if (capEnd) {
    const st = stationByU(u1);
    const p = (pos.length / 3);
    pos.push(st.x - 0.006, st.cy, 0); uvs.push(1, 0.5);
    for (let j = 0; j < NT; j++) idx.push(p, rings * NT + j, rings * NT + (j + 1) % NT);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Needle tooth: base at origin, axis +Y, curls toward +X.
function toothGeometry(len, rad, bend, seg) {
  const geo = mergeVertices(coneYGeo(rad, len, seg));
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const yf = clamp((p.getY(i) + len / 2) / len, 0, 1);
    p.setX(i, p.getX(i) + bend * yf * yf);
  }
  geo.translate(0, len / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

function basis(obj, X, Y, Z) {
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
// Align the part's local +X with xDir (fins, whose fan runs along local X).
function orientX(obj, xDir, zHint) {
  const X = new THREE.Vector3(xDir[0], xDir[1], xDir[2]).normalize();
  const Z = new THREE.Vector3(zHint[0], zHint[1], zHint[2]);
  Z.addScaledVector(X, -Z.dot(X)).normalize();
  basis(obj, X, new THREE.Vector3().crossVectors(Z, X).normalize(), Z);
}
// Align the part's local +Y with yDir (cones: teeth, tubercles, spines).
function orientY(obj, yDir, xHint) {
  const Y = new THREE.Vector3(yDir[0], yDir[1], yDir[2]).normalize();
  const X = new THREE.Vector3(xHint[0], xHint[1], xHint[2]);
  X.addScaledVector(Y, -X.dot(Y));
  if (X.lengthSq() < 1e-9) X.set(1, 0, 0).addScaledVector(Y, -Y.x);
  X.normalize();
  basis(obj, X, Y, new THREE.Vector3().crossVectors(X, Y).normalize());
}

// Tapered tube along a planar (constant-Z) path.
function planarTube(points, r0, r1, radial) {
  const pos = [], idx = [];
  const B = [0, 0, 1];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const T = norm(sub(b, a));
    const N = norm(cross(T, B));
    const t = i / (n - 1);
    const r = lerp(r0, r1, t * t * (3 - 2 * t));
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th) * r, s = Math.sin(th) * r;
      pos.push(
        points[i][0] + N[0] * c + B[0] * s,
        points[i][1] + N[1] * c + B[1] * s,
        points[i][2] + N[2] * c + B[2] * s,
      );
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j, b = i * radial + j2;
      const c = (i + 1) * radial + j, d = (i + 1) * radial + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Ragged ray-fin: scalloped web plus the rays that carry it.
async function buildFin(name, rays, thickness, webMat, rayMat, parent) {
  const grp = new THREE.Object3D();
  grp.name = name;
  parent.add(grp);
  const pts = [[0.003, -0.0050]];
  for (let i = 0; i < rays.length; i++) {
    const r = rays[i];
    pts.push([r.len * Math.cos(r.a), r.len * Math.sin(r.a)]);
    if (i < rays.length - 1) {
      const mid = (r.a + rays[i + 1].a) / 2;
      const ml = ((r.len + rays[i + 1].len) / 2) * (0.84 + 0.06 * (i % 3));
      pts.push([ml * Math.cos(mid), ml * Math.sin(mid)]);
    }
  }
  pts.push([0.003, 0.0050]);
  const geo = await extrudeProfile(pts, {
    depth: thickness, bevel: 0.0007, bevelStyle: 'round', segments: 2, center: true,
  });
  createPart(name + '_Web', geo, webMat, { parent: grp });
  for (let i = 0; i < rays.length; i++) {
    const r = rays[i];
    beamBetween(name + '_Ray' + i, [0, 0, 0],
      [r.len * 0.99 * Math.cos(r.a), r.len * 0.99 * Math.sin(r.a), 0],
      0.0015, rayMat, { segments: 6, parent: grp });
  }
  return grp;
}

function fanRays(count, a0, a1, lBase, lTip, wobble) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const bell = Math.sin(Math.PI * (0.18 + 0.64 * t));
    out.push({
      a: lerp(a0, a1, t),
      len: lerp(lTip, lBase, bell) * (1 + wobble * Math.sin(i * 2.399 + 1.1)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

async function build() {
  const root = createRoot('AnglerfishOpus');
  const fish = new THREE.Object3D();
  fish.name = 'Anglerfish';
  root.add(fish);

  const skin = gameMaterial(0x3d352e, { roughness: 0.90, metalness: 0.0, flatShading: false });
  const mouthMat = gameMaterial(0x6e3032, { roughness: 0.55, flatShading: false });
  const toothMat = gameMaterial(0xe8e2d0, { roughness: 0.30, flatShading: false });
  const finMat = gameMaterial(0x4d4239, { roughness: 0.92, flatShading: false });
  const eyeMat = gameMaterial(0x0b0b0e, { roughness: 0.12, flatShading: false });
  const glowMat = gameMaterial(0xcafbe9, {
    roughness: 0.35, emissive: 0x62e9c2, emissiveIntensity: 2.6, flatShading: false,
  });
  const bulbMat = glassMaterial(0x9ff0e0, { opacity: 0.32, roughness: 0.22 });

  const NT = 48;

  // ---- body shell and buccal cavity -----------------------------------------
  createPart('Body', buildTube(0, RIM, 58, NT, true, false), skin, { parent: fish });
  createPart('MouthCavity', buildTube(RIM, 1, 12, NT, false, true), mouthMat, { parent: fish });
  createPart('Gullet', sphereGeo(0.0165, 16, 12), mouthMat, {
    parent: fish, position: [0.0700, stationByU(1).cy + 0.002, 0], scale: [1.0, 1.0, 0.9],
  });

  // ---- jaw rim, hinge knobs -------------------------------------------------
  const rimPts = [];
  for (let j = 0; j < 40; j++) rimPts.push(surfacePoint(RIM, (j / 40) * Math.PI * 2));
  createPart('JawRim', pipeAlongPath(rimPts, 0.0038, {
    closed: true, tubularSegments: 64, radialSegments: 7,
  }), skin, { parent: fish });

  const lowerArc = [];
  for (let k = 0; k <= 16; k++) {
    const th = lerp(Math.PI * 0.42, Math.PI * 1.58, k / 16);
    const p = surfacePoint(RIM - 0.004, th);
    lowerArc.push([p[0] + 0.0016, p[1] - 0.0022, p[2]]);
  }
  createPart('LowerJawBone', pipeAlongPath(lowerArc, 0.0056, {
    tubularSegments: 30, radialSegments: 7,
  }), skin, { parent: fish });

  for (const s of [-1, 1]) {
    const p = surfacePoint(RIM - 0.012, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    createPart('JawHinge' + (s > 0 ? 'R' : 'L'), sphereGeo(0.0088, 12, 9), skin, {
      parent: fish, position: [p[0] - 0.004, p[1], p[2]], scale: [1.3, 1.0, 0.75],
    });
  }

  // ---- teeth: two rows of inward-curving needles ----------------------------
  const teeth = new THREE.Object3D();
  teeth.name = 'Teeth';
  fish.add(teeth);
  const toothCache = {};
  function getTooth(len) {
    const key = Math.round(len * 2500);
    if (!toothCache[key]) toothCache[key] = toothGeometry(len, 0.0024, len * 0.34, 8);
    return toothCache[key];
  }

  function toothRow(tag, uRow, count, phase, lenTop, lenSide, lenBottom, back) {
    const st = stationByU(uRow);
    const centre = [st.x, st.cy, 0];
    for (let i = 0; i < count; i++) {
      const th = ((i + phase) / count) * Math.PI * 2;
      const p = surfacePoint(uRow, th);
      const radial = norm(sub(p, centre));
      const up = Math.cos(th);
      const len = up > 0
        ? lerp(lenSide, lenTop, up)
        : lerp(lenSide, lenBottom, -up);
      const jitter = 1 + 0.11 * Math.sin(i * 2.7 + 0.8);
      const dir = norm(add(scl(radial, -1), [-back, 0, 0]));
      const part = createPart(tag + i, getTooth(len * jitter), toothMat, {
        parent: teeth, position: [p[0], p[1], p[2]],
      });
      orientY(part, dir, [-1, 0, 0]);
    }
  }
  toothRow('ToothOuter', RIM - 0.0035, 26, 0.5, 0.0250, 0.0165, 0.0285, 0.42);
  toothRow('ToothInner', RIM + 0.0090, 19, 0.0, 0.0150, 0.0105, 0.0175, 0.62);

  // ---- warty tuberculate skin ----------------------------------------------
  const warts = new THREE.Object3D();
  warts.name = 'Tubercles';
  fish.add(warts);
  const wartA = coneYGeo(0.0052, 0.0072, 7);
  const wartB = coneYGeo(0.0035, 0.0048, 6);
  const wartC = coneYGeo(0.0060, 0.0115, 7);
  wartA.translate(0, 0.0036, 0);
  wartB.translate(0, 0.0024, 0);
  wartC.translate(0, 0.0058, 0);
  let wc = 0;
  for (let iu = 0; iu < 28; iu++) {
    const u = 0.055 + (iu / 27) * 0.845;
    const st = stationByU(u);
    const ring = Math.max(3, Math.round(12 * clamp(st.rz / 0.048, 0.22, 1)));
    for (let j = 0; j < ring; j++) {
      const th = ((j + 0.5 * (iu % 2)) / ring) * Math.PI * 2 + 0.35 * Math.sin(iu * 1.7 + j * 2.3);
      const p = surfacePoint(u, th);
      if (p[1] < 0.007) continue;
      const n = baseNormal(u, th);
      const big = ((iu * 7 + j * 3) % 5) === 0;
      const part = createPart('Tubercle' + (wc++), big ? wartA : wartB, skin, {
        parent: warts, position: [p[0] - n[0] * 0.0012, p[1] - n[1] * 0.0012, p[2] - n[2] * 0.0012],
      });
      orientY(part, n, [1, 0, 0]);
    }
  }
  // dorsal ridge of larger spines
  for (let i = 0; i < 13; i++) {
    const u = 0.16 + (i / 12) * 0.68;
    const th = 0.20 * Math.sin(i * 1.9);
    const p = surfacePoint(u, th);
    const n = baseNormal(u, th);
    const part = createPart('DorsalSpine' + i, wartC, skin, {
      parent: warts, position: [p[0] - n[0] * 0.002, p[1] - n[1] * 0.002, p[2] - n[2] * 0.002],
    });
    orientY(part, norm(add(n, [-0.45, 0, 0])), [1, 0, 0]);
  }

  // ---- eyes ----------------------------------------------------------------
  for (const s of [-1, 1]) {
    const th = s > 0 ? 0.92 : -0.92;
    const p = surfacePoint(0.842, th);
    const n = baseNormal(0.842, th);
    createPart('EyeRidge' + (s > 0 ? 'R' : 'L'), sphereGeo(0.0112, 14, 10), skin, {
      parent: fish,
      position: [p[0] - n[0] * 0.005, p[1] - n[1] * 0.005, p[2] - n[2] * 0.005],
      scale: [1.05, 1.0, 0.7],
    });
    createPart('Eye' + (s > 0 ? 'R' : 'L'), sphereGeo(0.0066, 16, 12), eyeMat, {
      parent: fish, position: [p[0] + n[0] * 0.0012, p[1] + n[1] * 0.0012, p[2] + n[2] * 0.0012],
      scale: [1, 1, 0.9],
    });
    createPart('EyeGlint' + (s > 0 ? 'R' : 'L'), sphereGeo(0.0018, 8, 6), glowMat, {
      parent: fish, position: [p[0] + 0.0038, p[1] + 0.0032, p[2] + s * 0.0028],
    });
  }

  // ---- illicium and esca ----------------------------------------------------
  const lureTip = [0.1830, 0.1580, 0];
  const path = bezierCurve(
    [[0.1000, 0.1560, 0], [0.1120, 0.1960, 0], [0.1650, 0.1920, 0], lureTip], 42,
  );
  createPart('Illicium', planarTube(path, 0.0060, 0.0026, 10), skin, { parent: fish });
  createPart('EscaBulb', sphereGeo(0.0172, 20, 14), bulbMat, { parent: fish, position: lureTip });
  createPart('EscaCore', sphereGeo(0.0126, 20, 14), glowMat, { parent: fish, position: lureTip });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = norm([0.50 + 0.32 * Math.cos(a), 0.48 * Math.sin(a), 0.78 * Math.cos(a + 1.1)]);
    beamBetween('EscaFilament' + i,
      [lureTip[0] + d[0] * 0.012, lureTip[1] + d[1] * 0.012, lureTip[2] + d[2] * 0.012],
      [lureTip[0] + d[0] * 0.0215, lureTip[1] + d[1] * 0.0215, lureTip[2] + d[2] * 0.0215],
      0.0011, glowMat, { segments: 5, parent: fish });
  }

  // ---- fins -----------------------------------------------------------------
  for (const s of [-1, 1]) {
    const th = s > 0 ? 1.80 : -1.80;
    const p = surfacePoint(0.505, th);
    const n = baseNormal(0.505, th);
    const fin = await buildFin('PectoralFin' + (s > 0 ? 'R' : 'L'),
      fanRays(9, -0.66, 0.74, 0.0385, 0.0215, 0.07), 0.0028, finMat, skin, fish);
    fin.position.set(p[0] - n[0] * 0.003, p[1] - n[1] * 0.003, p[2] - n[2] * 0.003);
    orientX(fin, norm([-0.78, -0.12, 0.50 * s]), [0.06, 1, 0.12 * s]);
  }

  for (const s of [-1, 1]) {
    const th = s > 0 ? 2.44 : -2.44;
    const p = surfacePoint(0.640, th);
    const fin = await buildFin('PelvicFin' + (s > 0 ? 'R' : 'L'),
      fanRays(7, -0.58, 0.62, 0.0245, 0.0135, 0.08), 0.0024, finMat, skin, fish);
    fin.position.set(p[0], Math.max(p[1], 0.0080), p[2]);
    orientX(fin, norm([-0.84, 0.06, 0.48 * s]), [0.10, 1, 0.05 * s]);
  }

  {
    const p = surfacePoint(0.215, 0);
    const dorsal = await buildFin('DorsalFin',
      fanRays(7, -0.30, 0.95, 0.0250, 0.0115, 0.09), 0.0024, finMat, skin, fish);
    dorsal.position.set(p[0] + 0.003, p[1] - 0.0015, 0);
    orientX(dorsal, norm([-0.36, 0.93, 0]), [0, 0, 1]);
  }
  {
    const p = surfacePoint(0.230, Math.PI);
    const anal = await buildFin('AnalFin',
      fanRays(6, -0.26, 0.60, 0.0205, 0.0105, 0.09), 0.0024, finMat, skin, fish);
    anal.position.set(p[0] + 0.003, Math.max(p[1], 0.0065), 0);
    orientX(anal, norm([-0.94, -0.12, 0]), [0, 0, 1]);
  }
  {
    const st = stationByU(0.060);
    const caudal = await buildFin('CaudalFin',
      fanRays(13, -0.92, 0.92, 0.0625, 0.0415, 0.055), 0.0016, finMat, skin, fish);
    caudal.position.set(st.x + 0.002, st.cy, 0);
    orientX(caudal, [-1, 0.03, 0], [0, 0, 1]);
  }

  // ---- fit strictly inside the shoebox --------------------------------------
  const box = new THREE.Box3().setFromObject(fish);
  const size = new THREE.Vector3();
  box.getSize(size);
  fish.scale.setScalar(Math.min(0.42 / size.x, 0.20 / size.y, 0.13 / size.z));
  const fitted = new THREE.Box3().setFromObject(fish);
  const c = new THREE.Vector3();
  fitted.getCenter(c);
  fish.position.set(-c.x, -fitted.min.y, -c.z);

  meta.tris = countTriangles(root);
  return root;
}
