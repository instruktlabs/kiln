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

const meta = { name: 'bench-stone', role: 'prop' };

// Carved limestone garden bench: 1.9 m moulded slab on two scroll (console) end supports.
// Faces +X; length along Z; seat top at 0.45 m.
const LEN = 1.9, DEPTH = 0.5, SEAT_TOP = 0.45, SLAB_T = 0.1;
const SUP_Z = 0.66;         // support centre planes (|z|)
const SUP_T = 0.17;         // support thickness along Z
const PLINTH_H = 0.05;

function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * DEG; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
/** Shrink a profile toward a centre by absolute insets (dx, dy) - softens the ends of a loft. */
function inset(pts, cx, cy, hx, hy, d) {
  return pts.map(([x, y]) => [cx + (x - cx) * (1 - d / hx), cy + (y - cy) * (1 - d / hy)]);
}
/** Lofted bar with rounded (worn) ends: profile in XY, length along Z centred at z0. */
function roundedEndLoft(prof, z0, len, c, h, ends = [0.016, 0.007, 0.002], mids = 0) {
  const half = len / 2, secs = [];
  const step = [0.0, 0.005, 0.013];
  for (let k = 0; k < ends.length; k++) secs.push({ pts: inset(prof, c[0], c[1], h[0], h[1], ends[k]), w: z0 - half + step[k] });
  for (let m = 1; m <= mids; m++) secs.push({ pts: prof, w: z0 - half + 0.03 + (len - 0.06) * m / (mids + 1) });
  for (let k = ends.length - 1; k >= 0; k--) secs.push({ pts: inset(prof, c[0], c[1], h[0], h[1], ends[k]), w: z0 + half - step[k] });
  return loftSolid(secs, (u, v, w) => [u, v, w]);
}

async function build() {
  const root = createRoot('BenchStone');
  const M = await courtyardMaterials();

  // ---- Seat slab: flat top, bullnose front edge over a fascia and quirk, rounded back arris ----
  const y0 = SEAT_TOP - SLAB_T, y1 = SEAT_TOP, xf = DEPTH / 2, xb = -DEPTH / 2;
  const slabProf = [
    ...arc(xb + 0.02, y0 + 0.02, 0.02, 180, 270, 2).slice(1),
    [xf - 0.05, y0], [xf - 0.032, y0 + 0.004], [xf - 0.026, y0 + 0.014], [xf - 0.022, y0 + 0.026],
    ...arc(xf - 0.036, y1 - 0.036, 0.036, -70, 90, 7),
    ...arc(xb + 0.022, y1 - 0.022, 0.022, 90, 180, 3),
  ];
  let slab = roundedEndLoft(slabProf, 0, LEN, [0, (y0 + y1) / 2], [DEPTH / 2, SLAB_T / 2], [0.016, 0.007, 0.002], 7);
  // Subtle wear: soften and undulate the surface a few millimetres.
  slab = displace(slab, ([x, y, z]) => {
    const n = fbm(x * 9, y * 9, z * 5, 2);
    return [n * 0.003, (y > y1 - 0.01 ? -0.003 * (1 + n) : n * 0.002), 0];
  });
  createPart('Seat', weld(creaseNormals(boxUV(slab, 1.1), { angle: 35 })), M.stone, { parent: root });

  // ---- Scroll console supports ----
  const base = PLINTH_H - 0.006, top = y0 + 0.004, H = top - base;
  const k = H / 0.35; // design coordinates are in a 0.35 m tall frame
  const S = (pts) => pts.map(([x, y]) => [x, base + y * k]);
  const topC = [0.125, 0.265], topR = 0.085, lowC = [0.115, 0.065], lowR = 0.065;
  const outline = S([
    [-0.2, 0.0], [-0.188, 0.06], [-0.176, 0.12], [-0.168, 0.19], [-0.172, 0.26], [-0.184, 0.32], [-0.195, 0.35],
    [-0.08, 0.35], [0.04, 0.35],
    ...arc(topC[0], topC[1], topR, 90, -150, 12),
    [0.04, 0.19], [0.036, 0.16], [0.042, 0.13],
    ...arc(lowC[0], lowC[1], lowR, 150, -90, 10),
    [0.0, 0.0], [-0.1, 0.0],
  ]);
  const supItems = [], voluteItems = [];
  const rib = (cx, cy, r0, zf, dir) => {
    const pts = [];
    const turns = 1.5, n = 11;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = (90 - turns * 360 * t) * DEG, r = r0 * (1 - 0.78 * t);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), zf]);
    }
    const radii = pts.map((_, i) => 0.0095 - 0.004 * i / n);
    voluteItems.push({ geo: taperedTube(pts, radii, { radialSegments: 4 }) });
    const eye = sphereGeo(0.016, 6, 3);
    voluteItems.push({ geo: eye, position: [cx, cy, zf], scale: [1, 1, 0.55] });
  };
  for (const zs of [-1, 1]) {
    const zc = zs * SUP_Z;
    supItems.push({ geo: roundedEndLoft(outline, zc, SUP_T, [0.0, base + H / 2], [0.2, H / 2], [0.012, 0.005, 0.0015]) });
    for (const face of [-1, 1]) {
      const zf = zc + face * (SUP_T / 2 - 0.003);
      rib(topC[0], base + topC[1] * k, (topR - 0.018) * k, zf, face);
      rib(lowC[0], base + lowC[1] * k, (lowR - 0.016) * k, zf, face);
    }
  }
  createPart('Supports', weld(creaseNormals(boxUV(mergeGeos(supItems), 1.1, [0.4, 0.2]), { angle: 35 })), M.stone, { parent: root });
  createPart('Volutes', weld(boxUV(mergeGeos(voluteItems), 1.1)), M.stone, { parent: root });

  // ---- Plinth blocks under each support (darker, weathered at ground level) ----
  const plinth = await roundedBoxGeo(0.46, PLINTH_H, SUP_T + 0.07, 0.012, { style: 'chamfer' });
  createPart('Plinths', weld(boxUV(mergeGeos([
    { geo: plinth, position: [0.0, PLINTH_H / 2, -SUP_Z] },
    { geo: plinth, position: [0.0, PLINTH_H / 2, SUP_Z] },
  ]), 1.1)), M.weathered, { parent: root });
  // One mesh per distinct material (one instanced draw each in Holodeck).
  consolidateByMaterial(root, new Map([[M.stone, 'Bench_Stone'], [M.weathered, 'Bench_Weathered']]));
  return root;
}
