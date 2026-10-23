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

const meta = { name: 'planter-urn', role: 'prop' };

// Classical campana urn, 0.85 m across the rim, 1.0 m tall, on a short pedestal foot,
// gadrooned lower bowl, with a mound of trailing planting and a few flowers.
const RIM_R = 0.426;
const SOIL_Y = 0.925;
const GAD_N = 16;               // gadroon lobes

function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * DEG; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

async function build() {
  const root = createRoot('PlanterUrn');
  const M = await courtyardMaterials();
  const leaf = await materialRecipe('kiln.material.leaf.v1', {
    baseColor: '#527a36', roughness: 0.75, textureResources: { normal: 'kiln.texture.forest-leaves-normal.v1' } });
  const bloom = await materialRecipe('kiln.material.leaf.v1', { baseColor: '#d45a64', roughness: 0.7 });

  // Foot: square-edged base disc, torus, cavetto stem and knop.
  const foot = latheMesh([
    [0, 0], [0.205, 0], [0.205, 0.032], [0.192, 0.044],
    ...arc(0.178, 0.067, 0.022, -60, 90, 4),
    [0.15, 0.092], [0.122, 0.108], [0.106, 0.14], [0.104, 0.172],
    [0.118, 0.18], [0.134, 0.192], [0.138, 0.205], [0.13, 0.218], [0, 0.222],
  ], 24, { crease: 40 });

  // Lower bowl with gadroons (convex lobes divided by grooves, rounded at both ends).
  const bowlProf = [[0, 0.212]];
  const lower = [[0.13, 0.212], [0.17, 0.222], [0.215, 0.24], [0.255, 0.265], [0.288, 0.297], [0.31, 0.33],
    [0.324, 0.37], [0.332, 0.42], [0.334, 0.47], [0.33, 0.515], [0.32, 0.535]];
  bowlProf.push(...lower, [0, 0.54]);
  const Y0 = 0.23, Y1 = 0.535;
  const bowl = latheMesh(bowlProf, GAD_N * 4, {
    phase: Math.PI / GAD_N,
    crease: 70,
    mod: (th, y, r) => {
      if (r === 0 || y <= Y0 || y >= Y1) return 1;
      const t = (y - Y0) / (Y1 - Y0);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.45);
      const lobe = Math.pow(Math.abs(Math.cos(GAD_N * th / 2)), 0.7);
      return 1 - 0.075 * (1 - lobe) * env;
    },
  });

  // Upper bowl: moulded band over the gadroon tops, flaring campana body, rolled rim, inner wall.
  const upper = latheMesh([
    [0, 0.515], [0.31, 0.515], [0.335, 0.522],
    ...arc(0.335, 0.54, 0.018, -90, 90, 4).slice(1),
    [0.33, 0.562], [0.332, 0.6], [0.338, 0.66], [0.35, 0.73], [0.368, 0.8], [0.388, 0.86], [0.402, 0.895],
    [0.404, 0.905], ...arc(0.398, 0.94, 0.028, -75, 75, 5),
    [0.412, 0.985], [0.402, 0.995], [0.39, 1.0],
    [0.37, 1.0], [0.358, 0.993], [0.35, 0.975], [0.344, 0.93], [0, 0.93],
  ], 36, { crease: 40 });
  const urn = weld(boxUV(mergeGeos([{ geo: foot }, { geo: bowl }, { geo: upper }]), 1.4));
  createPart('Urn', urn, M.stone, { parent: root });

  // (No separate soil part: the planting mound fills the bowl mouth and hides the soil line.)

  // Planting mound: lumpy dome that fills the bowl and swells just over the lip.
  const MR = 0.355, MSY = 0.75, MY = SOIL_Y + 0.055;
  const moundTuck = (ny) => ny >= 0 ? 1 : 1 - 0.3 * Math.min(1, -ny * 2.5);
  const moundD = (nx, ny, nz) => 0.065 * lumps(nx * 4.5, ny * 4.5, nz * 4.5 + 2) + 0.018 * lumps(nx * 10 + 4, ny * 10, nz * 10);
  let mound = sphereGeo(MR, 30, 14);
  mound = displace(mound, ([x, y, z]) => {
    const l = Math.hypot(x, y, z) || 1, nx = x / l, ny = y / l, nz = z / l;
    // Lower half tucks inside the bowl mouth so lumps never break through the stone.
    const R = (MR + moundD(nx, ny, nz)) * moundTuck(ny) - MR;
    return [nx * R, ny * R, nz * R];
  });
  createPart('Planting', weld(creaseNormals(boxUV(mound, 3), { angle: 80 })), leaf,
    { position: [0, MY, 0], scale: [1, MSY, 1], parent: root });

  // Trailing strands over the rim, each a thin stem with leaf clusters along it.
  const rand = rng(11);
  const stems = [], leaves = [], flowers = [];
  const leafGeo = sphereGeo(0.042, 5, 3);
  const flowerGeo = latheMesh([[0, 0], [0.024, 0.01], [0.016, 0.017], [0, 0.012]], 5, { crease: 60 });
  const N_STRANDS = 8;
  for (let s = 0; s < N_STRANDS; s++) {
    const phi = (s / N_STRANDS) * Math.PI * 2 + 0.35 * (rand() - 0.5);
    const drop = 0.16 + 0.22 * rand();
    const sway = 0.06 * (rand() - 0.5);
    const c = Math.cos(phi), sn = -Math.sin(phi);
    const tx = -sn, tz = c; // tangent around the rim
    const P = (r, y, t) => [c * r + tx * sway * t, y, sn * r + tz * sway * t];
    const ctrl = [P(0.30, SOIL_Y + 0.07, 0), P(0.40, SOIL_Y + 0.085, 0.1), P(0.448, 1.005, 0.25),
      P(0.462, 0.96, 0.45), P(0.455, 1.0 - drop * 0.6, 0.7), P(0.44, 1.0 - drop, 1)];
    const path = catmullRomPath(ctrl, 2);
    const radii = path.map((_, i) => 0.008 - 0.005 * i / (path.length - 1));
    stems.push({ geo: taperedTube(path, radii, { radialSegments: 3 }) });
    for (let i = 2; i < path.length; i++) {
      const p = path[i];
      const k = 1 - 0.45 * i / path.length;
      { const side = i % 2 ? 1 : -1;
        leaves.push({ geo: leafGeo, position: [p[0] + side * tx * 0.022 + c * 0.012, p[1] - 0.01, p[2] + side * tz * 0.022 + sn * 0.012],
          rotation: [rand() * 60 - 30, rand() * 360, rand() * 60 - 30], scale: [1.3 * k, 0.5 * k, 1.0 * k] });
      }
      if (i === path.length - 1 || (i === 5 && rand() < 0.6))
        flowers.push({ geo: flowerGeo, position: [p[0] + c * 0.02, p[1] - 0.005, p[2] + sn * 0.02], rotation: [0, 0, -70], scale: 1.1 });
    }
  }
  // Flowers nestled in the top of the mound.
  for (let f = 0; f < 13; f++) {
    // Sit each flower on the actual displaced mound surface (same field as the mound).
    const a = f * 2.39996 + 0.3, polar = 0.15 + 1.05 * Math.sqrt((f + 0.5) / 13);
    const nx = Math.sin(polar) * Math.cos(a), ny = Math.cos(polar), nz = -Math.sin(polar) * Math.sin(a);
    const r = MR + moundD(nx, ny, nz);
    flowers.push({ geo: flowerGeo, position: [nx * r, MY + ny * r * MSY - 0.004, nz * r],
      rotation: [-polar / DEG * Math.sin(a) * 0.6, 0, -polar / DEG * Math.cos(a) * 0.6], scale: 1.3 });
  }
  createPart('TrailingStems', weld(boxUV(mergeGeos(stems), 4)), leaf, { parent: root });
  createPart('TrailingLeaves', weld(boxUV(mergeGeos(leaves), 6)), leaf, { parent: root });
  createPart('Flowers', weld(mergeGeos(flowers)), bloom, { parent: root });
  // One mesh per distinct material (one instanced draw each in Holodeck).
  consolidateByMaterial(root, new Map([[M.stone, 'Urn_Stone'], [leaf, 'Planting_Leaf'], [bloom, 'Flowers']]));
  return root;
}
