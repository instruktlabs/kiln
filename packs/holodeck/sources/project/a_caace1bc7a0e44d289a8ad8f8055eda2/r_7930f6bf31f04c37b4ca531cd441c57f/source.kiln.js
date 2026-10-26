// ---- Shared courtyard furniture helpers (identical in every furniture asset) ----
// Palette from BRIEF.md (sRGB).
const PAL = {
  limestone: '#d6c8a8', travertine: '#c9b48c', weathered: '#9c8d70',
  iron: '#2b2a28', oak: '#8a6440', boxwood: '#3a5228', ivy: '#4b6a32',
  soil: '#4a3a2a', glow: '#ffd9a0', flower: '#c8504a',
};

/** Shared material definitions; every asset calls the same recipes with the same values. */
async function courtyardMaterials() {
  return {
    stone: await materialRecipe('kiln.material.stone.v1', {
      baseColor: PAL.limestone, roughness: 0.9,
      textureResources: { normal: 'kiln.texture.rough-concrete-normal.v1' } }),
    weathered: await materialRecipe('kiln.material.stone.v1', {
      baseColor: '#ab9b7c', roughness: 0.95,
      textureResources: { normal: 'kiln.texture.rough-concrete-normal.v1' } }),
    iron: await materialRecipe('kiln.material.painted-metal.v1', {
      baseColor: PAL.iron, roughness: 0.55, metalness: 0.35,
      textureResources: { normal: 'kiln.texture.rusted-metal-normal.v1' } }),
    oak: await materialRecipe('kiln.material.wood.v1', {
      baseColor: PAL.oak, roughness: 0.7,
      textureResources: { normal: 'kiln.texture.oak-veneer-normal.v1' } }),
    glow: await materialRecipe('kiln.material.emissive.v1', {
      baseColor: PAL.glow, roughness: 0.35, emissiveColor: PAL.glow, emissiveIntensity: 0.55 }),
  };
}

const DEG = Math.PI / 180;

/** World-scaled box projection UVs (metres * s), chosen per triangle from its geometric normal. */
function boxUV(geo, s = 1, off = [0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const i = t + k, x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let u, v;
      if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
      uv[i * 2] = u * s + off[0]; uv[i * 2 + 1] = v * s + off[1];
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Flip triangle winding if the closed mesh has negative signed volume. */
function orientOutward(positions, indices) {
  let vol = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const i = indices[t] * 3, j = indices[t + 1] * 3, k = indices[t + 2] * 3;
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[j], by = positions[j + 1], bz = positions[j + 2];
    const cx = positions[k], cy = positions[k + 1], cz = positions[k + 2];
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let t = 0; t < indices.length; t += 3) { const s = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = s; }
  return indices;
}

function area2(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; s += x0 * y1 - x1 * y0; } return s / 2; }

/**
 * Closed solid lofted through planar sections with matching point counts.
 * sections: [{ pts: [[u,v],...], w }], map(u,v,w) -> [x,y,z]. Caps are triangulated.
 */
function loftSolid(sections, map, opts = {}) {
  const n = sections[0].pts.length;
  const rev = area2(sections[0].pts) < 0;
  const secs = sections.map((s) => ({ w: s.w, pts: rev ? s.pts.slice().reverse() : s.pts }));
  const pos = [], idx = [];
  for (const s of secs) for (const [u, v] of s.pts) pos.push(...map(u, v, s.w));
  for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + (j + 1) % n, d = (i + 1) * n + j;
    idx.push(a, b, c, a, c, d);
  }
  if (opts.caps !== false) {
    const capFor = (si, flip) => {
      const base = pos.length / 3;
      const s = secs[si];
      for (const [u, v] of s.pts) pos.push(...map(u, v, s.w));
      const tris = THREE.ShapeUtils.triangulateShape(s.pts.map(([u, v]) => new THREE.Vector2(u, v)), []);
      for (const [a, b, c] of tris) {
        const A = s.pts[a], B = s.pts[b], C = s.pts[c];
        const ccw = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) > 0;
        if (ccw !== flip) idx.push(base + a, base + b, base + c); else idx.push(base + a, base + c, base + b);
      }
    };
    capFor(0, true); capFor(secs.length - 1, false);
  }
  orientOutward(pos, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Lathe solid with per-vertex radial modulation. profile: [[r,y],...]; a point with r == 0
 * at either end closes that end with a fan. mod(theta, y, r) -> radius multiplier.
 */
function latheMesh(profile, segs, opts = {}) {
  const mod = opts.mod || (() => 1);
  const phase = opts.phase || 0;
  const pos = [], uvs = [], idx = [];
  const ringStart = [];
  let arc = 0;
  for (let k = 0; k < profile.length; k++) {
    const [r, y] = profile[k];
    if (k > 0) arc += Math.hypot(r - profile[k - 1][0], y - profile[k - 1][1]);
    ringStart.push(pos.length / 3);
    if (r === 0) { pos.push(0, y, 0); uvs.push(0, arc); continue; }
    for (let j = 0; j <= segs; j++) {
      const th = phase + (j / segs) * Math.PI * 2;
      const rr = r * mod(th, y, r, k);
      pos.push(rr * Math.cos(th), y, -rr * Math.sin(th));
      uvs.push((j / segs) * Math.PI * 2 * Math.max(r, 0.05), arc);
    }
  }
  for (let k = 0; k < profile.length - 1; k++) {
    const c0 = profile[k][0] === 0, c1 = profile[k + 1][0] === 0;
    for (let j = 0; j < segs; j++) {
      const a = c0 ? ringStart[k] : ringStart[k] + j, b = c0 ? ringStart[k] : ringStart[k] + j + 1;
      const d = c1 ? ringStart[k + 1] : ringStart[k + 1] + j, c = c1 ? ringStart[k + 1] : ringStart[k + 1] + j + 1;
      if (!c0) idx.push(a, b, c); else idx.push(a, c, d);
      if (!c0 && !c1) idx.push(a, c, d);
    }
  }
  orientOutward(pos, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return creaseNormals(g, { angle: opts.crease || 40 });
}

/** Merge several geometries (each placed by position / Euler-degree rotation / scale) into one. */
function mergeGeos(items) {
  const P = [], N = [], U = [];
  for (const it of items) {
    let g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(it.position || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(it.rotation || [0, 0, 0]).map((d) => d * DEG), 'XYZ')),
      new THREE.Vector3(...(Array.isArray(it.scale) ? it.scale : [it.scale || 1, it.scale || 1, it.scale || 1])));
    g.applyMatrix4(m);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
      if (u) U.push(u.getX(i), u.getY(i)); else U.push(0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}

/**
 * Draw-call consolidation: merge every mesh under root that shares a material into ONE mesh
 * (baking each part's transform), weld it, and name it by role. names: Map(material -> name).
 * Non-mesh nodes (e.g. LightCentre) are kept.
 */
function consolidateByMaterial(root, names) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const groups = new Map();
  for (const m of meshes) { if (!groups.has(m.material)) groups.set(m.material, []); groups.get(m.material).push(m); }
  for (const [mat, list] of groups) {
    const P = [], N = [], U = [];
    for (const m of list) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
        if (u) U.push(u.getX(i), u.getY(i)); else U.push(0, 0);
      }
      m.parent.remove(m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    const name = names.get(mat);
    if (!name) throw new Error('consolidateByMaterial: no role name for material ' + mat.name);
    const part = createPart(name, weld(g), mat, { parent: root });
    part.name = name;
  }
  return root;
}

/** Deterministic 3D value noise in [-1, 1] and a small fbm. */
function hash3(i, j, k) { let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return ((h >>> 0) / 4294967295) * 2 - 1; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++)
    r += hash3(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
  return r;
}
function fbm(x, y, z, oct = 3) { let s = 0, amp = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += amp * vnoise(x * f, y * f, z * f); f *= 2.03; amp *= 0.5; } return s; }

/** Cellular lumps: 1 at a jittered feature point falling to 0 one cell away (cauliflower/foliage clumps). */
function lumps(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const i = xi + a, j = yi + b, k = zi + c;
    const fx = i + 0.5 + 0.45 * hash3(i, j, k), fy = j + 0.5 + 0.45 * hash3(j, k, i + 17), fz = k + 0.5 + 0.45 * hash3(k + 31, i, j);
    best = Math.min(best, Math.hypot(x - fx, y - fy, z - fz));
  }
  const t = Math.max(0, 1 - best / 0.85);
  return Math.sqrt(t);
}
/** Weld coincident vertices with identical attributes (keeps the GLB small after box UVs or merges). */
function weld(geo) { return mergeVertices(geo); }

/** Points along a Catmull-Rom curve through control points (own implementation, any count). */
function smoothPath(ctrl, per = 6) { return catmullRomPath(ctrl, per); }
// ---- end shared helpers ----

const meta = { name: 'bench-park', role: 'prop' };

// Oak-slat park bench with cast/wrought iron end frames and scroll arms.
// Sitter faces +X; backrest toward -X; length along Z.
const LEN = 1.8;           // slat length
const FZ = 0.79;           // end-frame centre plane (|z|)
const SEAT_H = 0.45;       // top of seat slats at the front
const PW = 0.05;           // iron member in-plane width
const PT = 0.034;          // iron member thickness (along Z)
const SLAT_T = 0.028;

/** Chamfered rectangular iron section: x in-plane width, z thickness. */
function ironSection(w = PW, t = PT, c = 0.008) {
  // Hexagonal-ish cast section: full width at the centre plane, chamfered toward both faces.
  const a = w / 2, b = t / 2;
  return [[-a + c, -b], [a - c, -b], [a, 0], [a - c, b], [-a + c, b], [-a, 0]];
}
/** Sweep an iron member along XY control points (in the frame plane z). */
function member(ctrl, z, per = 3, section = ironSection()) {
  const path = catmullRomPath(ctrl.map(([x, y]) => [x, y, z]), per);
  return { geo: sweepProfile(section, path, { up: [0, 0, 1], creaseAngle: 50 }), path };
}
function spiral(cx, cy, r0, r1, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = (a0 + (a1 - a0) * t) * DEG, r = r0 + (r1 - r0) * t; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
/** Point and unit tangent on a polyline where it reaches height y (first crossing). */
function atHeight(path, y) {
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1];
    if ((p[1] - y) * (q[1] - y) <= 0 && p[1] !== q[1]) {
      const t = (y - p[1]) / (q[1] - p[1]);
      const tx = q[0] - p[0], ty = q[1] - p[1], l = Math.hypot(tx, ty);
      return { p: [p[0] + tx * t, y], t: [tx / l, ty / l] };
    }
  }
  throw new Error('height not on path: ' + y);
}

// Shared frame geometry (XY control points).
const REAR = [[-0.268, 0.012], [-0.225, 0.14], [-0.185, 0.29], [-0.172, 0.40], [-0.19, 0.53], [-0.235, 0.68],
  [-0.278, 0.80], ...spiral(-0.327, 0.835, 0.042, 0.026, 0, 230, 6)];
const FRONT = [[0.262, 0.012], [0.232, 0.13], [0.218, 0.27], [0.222, 0.40], [0.235, 0.52], [0.247, 0.634]];
const SEAT_RAIL = [[0.265, SEAT_H - SLAT_T - PW / 2], [0.12, SEAT_H - SLAT_T - PW / 2 - 0.006], [-0.03, SEAT_H - SLAT_T - PW / 2 - 0.014], [-0.178, SEAT_H - SLAT_T - PW / 2 - 0.02]];
const ARM = [[-0.205, 0.612], [-0.1, 0.626], [0.05, 0.643], [0.245, 0.654], ...spiral(0.282, 0.612, 0.04, 0.022, 75, -205, 7).slice(1)];
const STRETCHER = [[0.228, 0.15], [0.0, 0.135], [-0.226, 0.15]];

async function build() {
  const root = createRoot('BenchPark');
  const M = await courtyardMaterials();

  // ---- Iron end frames ----
  let rearPath = null;
  for (const [side, z] of [['L', -FZ], ['R', FZ]]) {
    const parts = [];
    const rear = member(REAR, z, 2); rearPath = rear.path; parts.push(rear);
    parts.push(member(FRONT, z, 2));
    parts.push(member(SEAT_RAIL, z, 2, ironSection(0.046, PT)));
    parts.push(member(ARM, z, 2, ironSection(0.046, PT + 0.012)));
    parts.push(member(STRETCHER, z, 1, ironSection(0.034, 0.026)));
    // Decorative C-scroll bracing the seat rail to the front leg.
    parts.push(member(spiral(0.17, 0.35, 0.045, 0.026, 100, -170, 6), z, 2, ironSection(0.022, 0.022, 0.005)));
    const items = parts.map((p) => ({ geo: p.geo }));
    // Flat feet pads give real ground contact at y = 0.
    const pad = await roundedBoxGeo(0.1, 0.024, PT + 0.024, 0.008, { style: 'chamfer' });
    items.push({ geo: pad, position: [0.268, 0.012, z] }, { geo: pad, position: [-0.272, 0.012, z] });
    createPart('Frame_' + side, weld(boxUV(mergeGeos(items), 3)), M.iron, { parent: root });
  }

  // Tie rod between the frames at the stretchers, with collars.
  const rod = cylinderGeo(0.012, 0.012, 2 * FZ, 8);
  const collar = cylinderGeo(0.022, 0.022, 0.03, 10);
  createPart('TieRod', weld(boxUV(mergeGeos([
    { geo: rod, position: [0.0, 0.135, 0], rotation: [90, 0, 0] },
    { geo: collar, position: [0.0, 0.135, -(FZ - PT / 2 - 0.015)], rotation: [90, 0, 0] },
    { geo: collar, position: [0.0, 0.135, FZ - PT / 2 - 0.015], rotation: [90, 0, 0] },
  ]), 3)), M.iron, { parent: root });

  // ---- Oak seat slats on the seat rails, real gaps between them ----
  const nSeat = 5, seatW = 0.068, gap = 0.016;
  const slatGeo = await roundedBoxGeo(seatW, SLAT_T, LEN, 0.007, { segments: 2 });
  const railPath = catmullRomPath(SEAT_RAIL.map(([x, y]) => [x, y, 0]), 3);
  const railY = (x) => { // rail top at x
    for (let i = 0; i < railPath.length - 1; i++) {
      const p = railPath[i], q = railPath[i + 1];
      if ((p[0] - x) * (q[0] - x) <= 0) { const t = (x - p[0]) / (q[0] - p[0]); return p[1] + (q[1] - p[1]) * t + PW * 0.46; }
    }
    return railPath[railPath.length - 1][1] + PW * 0.46;
  };
  const x0 = 0.262 - seatW / 2;
  const seatItems = [], backItems = [];
  for (let i = 0; i < nSeat; i++) {
    const x = x0 - i * (seatW + gap);
    const yl = railY(x + seatW / 2 - 0.004), yr = railY(x - seatW / 2 + 0.004);
    const ang = Math.atan2(yl - yr, seatW - 0.008) / DEG;
    const yc = (yl + yr) / 2 + SLAT_T / 2;
    const g = boxUV(slatGeo, 1, [i * 0.37, i * 0.21]);
    seatItems.push({ geo: g, position: [x, yc, 0], rotation: [0, 0, ang] });
  }
  createPart('SeatSlats', weld(mergeGeos(seatItems)), M.oak, { parent: root });

  // ---- Back slats on the front face of the curved rear uprights ----
  const backYs = [0.5, 0.705, 0.797];
  const backW = 0.084, backT = 0.024;
  const backGeo = await roundedBoxGeo(backW, backT, LEN, 0.007, { segments: 2 });
  backYs.forEach((y, i) => {
    const { p, t } = atHeight(rearPath, y);
    const n = [t[1], -t[0]]; // toward the sitter (+X side)
    const nn = n[0] < 0 ? [-n[0], -n[1]] : n;
    const off = PW / 2 + backT / 2 - 0.002;
    const ang = Math.atan2(t[1], t[0]) / DEG;
    backItems.push({ geo: boxUV(backGeo, 1, [i * 0.29, 0.5]), position: [p[0] + nn[0] * off, p[1] + nn[1] * off, 0], rotation: [0, 0, ang] });
  });
  createPart('BackSlats', weld(mergeGeos(backItems)), M.oak, { parent: root });

  // Carriage-bolt heads where slats cross the frames.
  const bolt = sphereGeo(0.011, 5, 2);
  const bolts = [];
  for (let i = 0; i < nSeat; i++) {
    const x = x0 - i * (seatW + gap);
    const y = (railY(x + 0.02) + railY(x - 0.02)) / 2 + SLAT_T;
    for (const z of [-FZ, FZ]) bolts.push({ geo: bolt, position: [x, y, z], scale: [1, 0.45, 1] });
  }
  backYs.forEach((y) => {
    const { p, t } = atHeight(rearPath, y);
    const n = [t[1], -t[0]]; const nn = n[0] < 0 ? [-n[0], -n[1]] : n;
    const off = PW / 2 + backT - 0.002;
    for (const z of [-FZ, FZ]) bolts.push({ geo: bolt, position: [p[0] + nn[0] * off, p[1] + nn[1] * off, z], rotation: [0, 0, Math.atan2(nn[1], nn[0]) / DEG - 90], scale: [1, 0.45, 1] });
  });
  createPart('Bolts', weld(boxUV(mergeGeos(bolts), 3)), M.iron, { parent: root });
  // One mesh per distinct material (one instanced draw each in Holodeck).
  consolidateByMaterial(root, new Map([[M.iron, 'Frame_Iron'], [M.oak, 'Slats_Oak']]));
  return root;
}
