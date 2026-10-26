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

const meta = { name: 'planter-square', role: 'prop' };

// Square limestone planter, 1.0 m wide, 0.70 m tall, with a clipped boxwood ball.
const W = 1.0;            // outer width at base and cornice
const H = 0.70;           // stone height
const SOIL_Y = 0.665;     // soil surface (crown of the soil mound)
const BALL_R = 0.40;      // boxwood ball radius (0.8 m diameter)
const SQ = Math.SQRT2;

/** Square-section "lathe": profile of half-widths -> 4-segment revolve rotated 45 degrees. */
function squareTurn(profile) {
  return latheMesh(profile.map(([h, y]) => [h * SQ, y]), 4, { phase: Math.PI / 4, crease: 30 });
}
function arcPts(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * DEG; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}

async function build() {
  const root = createRoot('PlanterSquare');
  const M = await courtyardMaterials();
  const soilMat = await materialRecipe('kiln.material.stone.v1', {
    baseColor: PAL.soil, roughness: 1.0, textureResources: { normal: 'kiln.texture.dry-soil-normal.v1' } });
  const leaf = await materialRecipe('kiln.material.leaf.v1', {
    baseColor: '#46642f', roughness: 0.75,
    textureResources: { normal: 'kiln.texture.forest-leaves-normal.v1' } });

  // Planter shell: plinth, base ovolo, recessed body, top rail, cyma cornice and lip, hollow top.
  const cove = [];
  for (let i = 1; i <= 5; i++) { const t = i / 5; cove.push([0.45 + 0.05 * (1 - Math.cos(t * Math.PI / 2)), 0.575 + 0.06 * Math.sin(t * Math.PI / 2)]); }
  const prof = [
    [0, 0], [0.50, 0], [0.50, 0.055], [0.49, 0.065], [0.468, 0.065],
    ...arcPts(0.468, 0.09, 0.025, -60, 90, 6),
    [0.455, 0.115], [0.452, 0.13], [0.45, 0.15], [0.45, 0.20], [0.42, 0.215], [0.42, 0.515], [0.45, 0.53], [0.45, 0.575],
    ...cove,
    [0.505, 0.642], [0.505, 0.685], [0.495, 0.70],
    [0.445, 0.70], [0.435, 0.693], [0.43, 0.68], [0.43, 0.645], [0, 0.645],
  ];
  const shell = boxUV(squareTurn(prof), 1.2);
  createPart('Planter', creaseNormals(shell, { angle: 30 }), M.stone, { parent: root });

  // Corner pilasters frame each recessed panel.
  const pil = await roundedBoxGeo(0.1, 0.31, 0.1, 0.012, { style: 'chamfer' });
  const pilItems = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pilItems.push({ geo: pil, position: [sx * 0.40, 0.365, sz * 0.40] });
  createPart('Pilasters', weld(boxUV(mergeGeos(pilItems), 1.2, [0.3, 0.1])), M.stone, { parent: root });

  // A carved roundel at the centre of each panel.
  const roundel = latheMesh([[0, 0], [0.085, 0], [0.085, 0.008], [0.075, 0.016], [0.06, 0.018], [0.05, 0.026], [0.03, 0.03], [0, 0.031]], 20, { crease: 35 });
  const rItems = [];
  for (let f = 0; f < 4; f++) {
    const a = f * 90;
    const rad = a * DEG;
    // roundel axis is local +Y; tip it to face outward along each panel normal.
    rItems.push({ geo: roundel, position: [Math.cos(rad) * 0.418, 0.365, -Math.sin(rad) * 0.418], rotation: [0, a, -90] });
  }
  createPart('Roundels', weld(boxUV(mergeGeos(rItems), 1.2)), M.stone, { parent: root });

  // Soil: fills the hollow top, slightly mounded.
  const soilGeo = squareTurn([[0, 0.64], [0.434, 0.64], [0.434, 0.655], [0.33, 0.662], [0, SOIL_Y]]);
  createPart('Soil', boxUV(soilGeo, 2.0), soilMat, { parent: root });

  // Clipped boxwood ball: displaced sphere with clumpy leafy bumps, flattened slightly underneath.
  let ball = sphereGeo(BALL_R, 72, 44);
  ball = displace(ball, ([x, y, z]) => {
    const l = Math.hypot(x, y, z) || 1;
    const nx = x / l, ny = y / l, nz = z / l;
    const big = 0.018 * fbm(nx * 2.2 + 3, ny * 2.2, nz * 2.2, 2);
    const clump = 0.026 * lumps(nx * 7, ny * 7 + 3, nz * 7) + 0.008 * lumps(nx * 15 + 5, ny * 15, nz * 15);
    const fine = 0.006 * vnoise(nx * 24, ny * 24, nz * 24 + 11);
    let d = big + clump + fine;
    if (ny < -0.6) d -= (ny + 0.6) * 0.06; // fuller (flatter) base resting on the soil
    return [nx * d, ny * d, nz * d];
  });
  // Tile the leaf texture several times over the sphere UVs.
  ball = boxUV(ball, 2.5);
  const ballY = SOIL_Y + BALL_R - 0.045;
  createPart('Topiary', weld(creaseNormals(ball, { angle: 80 })), leaf, { position: [0, ballY, 0], parent: root });
  // One mesh per distinct material (one instanced draw each in Holodeck).
  consolidateByMaterial(root, new Map([[M.stone, 'Planter_Stone'], [soilMat, 'Soil'], [leaf, 'Topiary']]));
  return root;
}
