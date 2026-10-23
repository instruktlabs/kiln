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

const meta = { name: 'lamp-bollard', role: 'prop' };

// Path bollard light, 0.9 m: limestone plinth and column, iron lantern head with a
// warm glazed band behind six mullions, domed iron cap and finial.
const SQ = Math.SQRT2;
const GLOW_Y0 = 0.655, GLOW_Y1 = 0.765;
const GLOW_CENTRE_Y = (GLOW_Y0 + GLOW_Y1) / 2;

function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * DEG; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
function squareTurn(profile, crease = 30) {
  return latheMesh(profile.map(([h, y]) => [h * SQ, y]), 4, { phase: Math.PI / 4, crease });
}

async function build() {
  const root = createRoot('LampBollard');
  const M = await courtyardMaterials();

  // Square plinth with a chamfered base and a cove up to the column.
  const plinth = squareTurn([[0, 0], [0.16, 0], [0.16, 0.075], [0.15, 0.085], [0.138, 0.088],
    [0.13, 0.095], [0.122, 0.108], [0.118, 0.125], [0, 0.125]]);
  createPart('Plinth', weld(boxUV(plinth, 1.2)), M.stone, { parent: root });

  // Limestone column with torus base, slight entasis and an astragal under the head.
  const column = latheMesh([
    [0, 0.12], [0.118, 0.12], ...arc(0.112, 0.142, 0.02, -60, 90, 4).slice(1), [0.104, 0.165],
    [0.1, 0.2], [0.098, 0.4], [0.094, 0.58], [0.092, 0.6], [0.104, 0.604], ...arc(0.104, 0.618, 0.014, -90, 90, 4).slice(1),
    [0.096, 0.634], [0, 0.634],
  ], 28, { crease: 40 });
  createPart('Column', weld(boxUV(column, 1.2, [0.3, 0])), M.stone, { parent: root });

  // Iron head: seat ring, six mullions, top ring, domed cap, finial.
  const seat = latheMesh([[0, 0.63], [0.1, 0.63], [0.108, 0.638], [0.108, 0.652], [0.096, GLOW_Y0 + 0.004], [0, GLOW_Y0 + 0.004]], 24);
  const topRing = latheMesh([[0, GLOW_Y1 - 0.004], [0.096, GLOW_Y1 - 0.004], [0.112, GLOW_Y1 + 0.004], [0.116, GLOW_Y1 + 0.018],
    [0.11, GLOW_Y1 + 0.024], [0, GLOW_Y1 + 0.024]], 24);
  const dome = latheMesh([[0, GLOW_Y1 + 0.02], [0.104, GLOW_Y1 + 0.02], [0.1, 0.81], [0.085, 0.835], [0.06, 0.852],
    [0.03, 0.86], [0.022, 0.865], ...arc(0, 0.882, 0.018, -40, 90, 4).slice(0, -1), [0.004, 0.9], [0, 0.9]], 20, { crease: 35 });
  const mullion = cylinderGeo(0.008, 0.008, GLOW_Y1 - GLOW_Y0 + 0.01, 6);
  const items = [{ geo: seat }, { geo: topRing }, { geo: dome }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    items.push({ geo: mullion, position: [Math.cos(a) * 0.088, (GLOW_Y0 + GLOW_Y1) / 2, -Math.sin(a) * 0.088] });
  }
  createPart('LampHead', weld(boxUV(mergeGeos(items), 3)), M.iron, { parent: root });

  // Warm glazed band.
  const glass = latheMesh([[0, GLOW_Y0], [0.084, GLOW_Y0], [0.084, GLOW_Y1], [0, GLOW_Y1]], 24);
  createPart('GlowBand', glass, M.glow, { parent: root });

  const light = createPivot('LightCentre', [0, GLOW_CENTRE_Y, 0], root);
  light.name = 'LightCentre';
  // One mesh per distinct material (one instanced draw each in Holodeck).
  consolidateByMaterial(root, new Map([[M.stone, 'Bollard_Stone'], [M.iron, 'Head_Iron'], [M.glow, 'Band_Glow']]));
  return root;
}
