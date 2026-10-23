const meta = { name: 'Cove / linen canopy and timber supports', role: 'building' };
// Shared Cove surface helpers. Metres, +Y up. UVs are metre-scaled so a tiling
// texture keeps one physical size across parts and merged pieces.
const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
function tex(name, size, layers, usage = 'albedo') { return proceduralTexture({ schemaVersion: 2, size, usage, name, layers }); }
// Packed glTF metallic-roughness data: G is roughness, B is metalness.
function roughMap(name, lo, hi, { size = 128, scale = 5, seed = 1, metal = 0 } = {}) {
  const c = r => (Math.round(r * 255) << 8) | Math.round(metal * 255);
  return tex(name, size, [{ op: 'noise', colorA: c(lo), colorB: c(hi), scale, octaves: 3, seed }], 'metallicRoughness');
}
function surface({ name, size = 256, layers, lo = 0.8, hi = 0.95, rscale = 5, seed = 1, strength = 3, doubleSided = false, metal = 0 }) {
  const albedo = tex(name, size, layers);
  return pbrMaterial({ albedo, normal: normalMapFromHeight(albedo, { strength }), metallicRoughness: roughMap(name + 'Rough', lo, hi, { scale: rscale, seed: seed + 7, metal }), roughness: 1, metalness: metal ? 1 : 0, doubleSided });
}
function flat(color, roughness = 0.85, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra }); }
function noise(colorA, colorB, scale, seed, blend = 'overlay', opacity = 1, octaves = 4) { return { op: 'noise', colorA, colorB, scale, octaves, seed, blend, opacity }; }

// Bake a part transform (Kiln XYZ degrees) into owned non-indexed geometry.
function bake(geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG, 'XYZ'));
  g.applyMatrix4(new THREE.Matrix4().compose(new V3(...position), q, new V3(...scale)));
  return g;
}
// Concatenate non-indexed geometries that carry position, normal and uv.
function merge(list) {
  let count = 0; for (const g of list) count += g.attributes.position.count;
  const out = { position: new Float32Array(count * 3), normal: new Float32Array(count * 3), uv: new Float32Array(count * 2) };
  let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0, n = g.attributes.position.count;
    for (const k of ['position', 'normal', 'uv']) {
      const a = g.attributes[k], size = k === 'uv' ? 2 : 3;
      if (!a) continue;
      for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) out[k][(o + i) * size + c] = a.getComponent(i, c);
    }
    o += n;
  }
  // Lathe poles can leave near-zero normals; glTF requires unit vectors.
  for (let i = 0; i < count; i++) { const n = out.normal, x = n[i * 3], y = n[i * 3 + 1], z = n[i * 3 + 2], len = Math.hypot(x, y, z); if (len < 1e-4) n.set([0, 1, 0], i * 3); else n.set([x / len, y / len, z / len], i * 3); }
  const r = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) r.setAttribute(k, new THREE.BufferAttribute(out[k], k === 'uv' ? 2 : 3));
  return r;
}
// Metre-scaled UVs per triangle: up-facing faces map XZ; side faces map either
// around the local Y axis (radial, arc length at `radius`) or by dominant axis.
function metricUV(geometry, scale = 1, { radial = false, radius = 1, planar = false } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const a = new V3(), b = new V3(), c = new V3(), n = new V3(), e = new V3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(e.subVectors(a, b)); n.normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    let ref = null;
    // Radial direction at the centroid; end faces of an arc fall back to box mapping.
    let cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3; const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
    [a, b, c].forEach((v, k) => {
      let u, w;
      if (planar || (ay >= ax && ay >= az)) { u = v.x; w = v.z; }
      else if (radial && Math.abs(n.x * cx + n.z * cz) > 0.5) {
        let ang = Math.atan2(v.z, v.x);
        if (ref === null) ref = ang; else { while (ang - ref > Math.PI) ang -= 2 * Math.PI; while (ang - ref < -Math.PI) ang += 2 * Math.PI; }
        u = ang * radius; w = v.y;
      } else if (ax >= az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = w * scale;
    });
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Radius whose full turn is a whole number of texture repeats, so radial UVs do not seam.
function seamlessRadius(r, scale) { return Math.max(1, Math.round(2 * Math.PI * r * scale)) / (2 * Math.PI * scale); }
// A turned profile: points are [radius, height] from bottom to top.
function lathe(points, segments = 48) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments); }
// createPart names meshes Mesh_<name>; exact names are only set where a Holodeck contract binds them.
function part(root, name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], exactName = false) {
  // Weld corners whose position, normal and UV agree; per-triangle mapping leaves them split.
  const g = geometry.index ? geometry : mergeVertices(geometry);
  const node = createPart(name, g, material, { parent: root, position, rotation, scale });
  if (exactName) node.name = name;
  return node;
}

// Cove surfaces. Colours are sRGB albedo; roughness variation is packed per material.
const SURFACES = {
  plaster: (size = 512) => surface({ name: 'LimePlaster', size, strength: 2.4, lo: 0.8, hi: 0.96, rscale: 4, seed: 11, layers: [
    { op: 'solid', color: 0xcbb393 }, noise(0xb69d7d, 0xd9c4a5, 3, 11, 'normal', 0.7), noise(0x9d876b, 0xe2d2b8, 22, 12, 'normal', 0.25, 2), noise(0x8a7458, 0xeee2cc, 70, 13, 'normal', 0.12, 1)] }),
  baseCourse: () => surface({ name: 'ScuffedBase', size: 256, strength: 3, lo: 0.86, hi: 0.98, seed: 21, layers: [
    { op: 'solid', color: 0x9b8a76 }, noise(0x7e6d5b, 0xb2a08a, 4, 21, 'overlay', 0.8), noise(0x5e4a38, 0xd2b998, 40, 22, 'overlay', 0.4, 2)] }),
  floor: () => surface({ name: 'BurnishedLimeFloor', size: 512, strength: 1.3, lo: 0.42, hi: 0.78, rscale: 3, seed: 31, layers: [
    { op: 'solid', color: 0xcfb592 }, noise(0xc0a37f, 0xdac3a2, 2, 31, 'overlay', 0.6), noise(0xa48663, 0xe6d3b4, 14, 32, 'overlay', 0.3, 3), noise(0x8f7457, 0xf2e4cc, 90, 33, 'overlay', 0.12, 1)] }),
  rimStone: () => surface({ name: 'Limestone', size: 256, strength: 2.2, lo: 0.6, hi: 0.86, seed: 41, layers: [
    { op: 'solid', color: 0xc9b493 }, noise(0xb19c7c, 0xd6c3a3, 4, 41, 'normal', 0.6), noise(0x8a7860, 0xe2d2b6, 64, 42, 'normal', 0.3, 1)] }),
  wood: (size = 512) => surface({ name: 'OiledAsh', size, strength: 2.6, lo: 0.55, hi: 0.82, rscale: 7, seed: 51, layers: [
    { op: 'solid', color: 0x7e5c3f }, { op: 'stripes', colorA: 0x6a4c33, colorB: 0x8d6a4a, count: 28, angleDeg: 0, blend: 'normal', opacity: 0.55 },
    noise(0x5c4330, 0x94704f, 3, 51, 'normal', 0.35), noise(0x5a412d, 0x9a7656, 36, 52, 'normal', 0.2, 2)] }),
  darkOak: () => surface({ name: 'DarkOak', size: 128, strength: 2, lo: 0.5, hi: 0.75, seed: 61, layers: [
    { op: 'solid', color: 0x5e3d26 }, { op: 'stripes', colorA: 0x50331f, colorB: 0x6b4630, count: 20, angleDeg: 0, blend: 'overlay', opacity: 0.7 }, noise(0x3f2a1a, 0x7a5236, 4, 61, 'overlay', 0.5)] }),
  linen: (doubleSided = false) => surface({ name: 'Linen', size: 256, strength: 2.2, lo: 0.88, hi: 0.99, seed: 71, doubleSided, layers: [
    { op: 'solid', color: 0xd8c4a2 }, { op: 'checker', colorA: 0xe0d0b2, colorB: 0xc9b48f, squares: 96, blend: 'overlay', opacity: 0.55 },
    noise(0xcdb894, 0xf3e8d4, 6, 71, 'overlay', 0.6), { op: 'stripes', colorA: 0xd9c6a4, colorB: 0xeee2ca, count: 13, angleDeg: 90, blend: 'overlay', opacity: 0.18 }] }),
  moss: () => surface({ name: 'MossBoucle', size: 256, strength: 3.2, lo: 0.82, hi: 1, seed: 81, layers: [
    { op: 'solid', color: 0x6c7246 }, noise(0x575d36, 0x868c5b, 12, 81, 'overlay', 0.85, 3), { op: 'checker', colorA: 0x737a4b, colorB: 0x60663d, squares: 128, blend: 'overlay', opacity: 0.15 }, noise(0x4d5230, 0x8f9663, 48, 82, 'overlay', 0.4, 2)] }),
  rope: () => surface({ name: 'JuteRope', size: 128, strength: 3, lo: 0.9, hi: 1, seed: 91, layers: [
    { op: 'solid', color: 0xbca27a }, { op: 'stripes', colorA: 0x9a8160, colorB: 0xd3bc94, count: 8, angleDeg: 35, blend: 'normal', opacity: 0.85 }, noise(0x8a7354, 0xdcc7a3, 16, 91, 'overlay', 0.4)] }),
  basalt: (size = 512) => surface({ name: 'EmberBasalt', size, strength: 3, lo: 0.45, hi: 0.9, rscale: 6, seed: 101, layers: [
    { op: 'solid', color: 0x625649 }, noise(0x4c4239, 0x7a6c5d, 3, 101, 'normal', 0.7), noise(0x3f362f, 0x8a7b6a, 26, 102, 'normal', 0.4, 3), noise(0x352d27, 0x9a8b78, 90, 103, 'normal', 0.18, 1)] }),
  terracotta: () => surface({ name: 'Terracotta', size: 256, strength: 2.4, lo: 0.74, hi: 0.93, seed: 111, layers: [
    { op: 'solid', color: 0xa46f57 }, noise(0x8f5e48, 0xb58066, 4, 111, 'normal', 0.6), noise(0x7a5240, 0xc9a08a, 48, 112, 'normal', 0.25, 1)] }),
  ceramic: () => surface({ name: 'CreamGlaze', size: 128, strength: 0.6, lo: 0.18, hi: 0.36, seed: 121, layers: [
    { op: 'solid', color: 0xe9dcc4 }, noise(0xd9c8ab, 0xf4eadb, 3, 121, 'overlay', 0.5)] }),
  paper: () => surface({ name: 'PageEdge', size: 128, strength: 1.2, lo: 0.85, hi: 0.95, seed: 131, layers: [
    { op: 'solid', color: 0xeee2c7 }, { op: 'stripes', colorA: 0xe2d3b2, colorB: 0xf4ead6, count: 64, angleDeg: 90, blend: 'normal', opacity: 0.6 }] }),
  bookCloth: (color = 0x6e6948) => surface({ name: 'BookCloth', size: 128, strength: 2, lo: 0.8, hi: 0.95, seed: 141, layers: [
    { op: 'solid', color }, { op: 'checker', colorA: 0xffffff, colorB: 0xd8d0c0, squares: 48, blend: 'multiply', opacity: 0.35 }, noise(0x404030, 0xb0a888, 6, 141, 'overlay', 0.4)] }),
  wool: () => surface({ name: 'WoolThrow', size: 256, strength: 2.8, lo: 0.9, hi: 1, seed: 151, doubleSided: true, layers: [
    { op: 'solid', color: 0xa86a4c }, { op: 'stripes', colorA: 0xffffff, colorB: 0xd8c4a2, count: 8, angleDeg: 0, blend: 'multiply', opacity: 0.85 },
    { op: 'stripes', colorA: 0xffffff, colorB: 0xd8c4a2, count: 8, angleDeg: 90, blend: 'multiply', opacity: 0.85 },
    { op: 'stripes', colorA: 0xffffff, colorB: 0x6d4a35, count: 32, angleDeg: 0, blend: 'multiply', opacity: 0.25 }, noise(0x8a4a2c, 0xd08a62, 30, 151, 'overlay', 0.35, 2)] }),
  wicker: () => surface({ name: 'Wicker', size: 256, strength: 4, lo: 0.7, hi: 0.9, seed: 161, layers: [
    { op: 'solid', color: 0x987650 }, { op: 'checker', colorA: 0xab8a5e, colorB: 0x765a3a, squares: 24, blend: 'normal', opacity: 0.7 },
    { op: 'stripes', colorA: 0x9a7646, colorB: 0xb89260, count: 48, angleDeg: 90, blend: 'overlay', opacity: 0.5 }, noise(0x6b4f2d, 0xc8a776, 20, 161, 'overlay', 0.3)] }),
  soil: () => surface({ name: 'Soil', size: 128, strength: 4, lo: 0.9, hi: 1, seed: 171, layers: [
    { op: 'solid', color: 0x43362a }, noise(0x2d241b, 0x65533f, 18, 171, 'overlay', 1, 3)] }),
  bark: () => surface({ name: 'SplitLog', size: 256, strength: 4, lo: 0.8, hi: 0.97, seed: 181, layers: [
    { op: 'solid', color: 0x6b5139 }, { op: 'stripes', colorA: 0x4a3726, colorB: 0x7d6047, count: 22, angleDeg: 0, blend: 'overlay', opacity: 0.9 }, noise(0x3a2a1d, 0x8c7155, 8, 181, 'overlay', 0.6)] }),
  felt: () => surface({ name: 'CharcoalFelt', size: 128, strength: 1.5, lo: 0.9, hi: 1, seed: 191, layers: [
    { op: 'solid', color: 0x2c2f27 }, noise(0x22251e, 0x3a3e33, 20, 191, 'overlay', 0.8)] }),
  brass: () => surface({ name: 'AgedBrass', size: 64, strength: 1, lo: 0.32, hi: 0.55, seed: 201, metal: 0.85, layers: [
    { op: 'solid', color: 0xa38a62 }, noise(0x7f6a48, 0xc2a878, 4, 201, 'overlay', 0.6)] }),
};

const masts = [[-3.25, -1.7], [2.55, -1.7], [-3.25, 2.55], [2.55, 2.55]];
const span = { u: [-3.25, 2.55], v: [-1.7, 2.55] };
// The sail sags between its four corners, with soft wrinkles running in from each corner.
function sailY(u, v) {
  const su = (u - span.u[0]) / (span.u[1] - span.u[0]), sv = (v - span.v[0]) / (span.v[1] - span.v[0]);
  let y = 3.22 - 0.42 * Math.sin(su * Math.PI) - 0.22 * Math.sin(sv * Math.PI) + 0.025 * Math.sin(u * 13) * Math.sin(sv * Math.PI);
  for (const [cu, cv] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const du = su - cu, dv = sv - cv, d = Math.hypot(du, dv), along = Math.atan2(dv, du);
    y += 0.014 * Math.sin(along * 26) * Math.exp(-d * 4.5) * Math.min(1, d * 9);
  }
  return y;
}
async function build() {
  const root = createRoot('HearthCove');
  const wood = SURFACES.wood(), rope = SURFACES.rope(), linen = SURFACES.linen(true), leaf = SURFACES.moss();
  const add = (name, geo, material, position = [0, 0, 0], rotation = [0, 0, 0]) => part(root, name, geo, material, position, rotation);
  // Tapered timber masts with a turned foot and a cap; rope lashing wraps below the sail.
  const mast = lathe([[0.125, 0], [0.13, 0.02], [0.112, 0.06], [0.1, 0.12], [0.094, 1.2], [0.085, 2.4], [0.072, 3.08], [0.082, 3.12], [0.082, 3.2], [0.06, 3.25], [0.025, 3.27], [0.001, 3.275]], 14);
  const mastGeo = creaseNormals(metricUV(mast, 1.25, { radial: true, radius: seamlessRadius(0.09, 1.25) }), { angle: 45 });
  masts.forEach(([x, z], i) => {
    add('CanopyMast_' + i, mastGeo, wood, [x, 0, z]);
    const turns = [];
    for (let k = 0; k <= 96; k++) { const t = k / 96, a = t * Math.PI * 2 * 6; turns.push(new V3(Math.cos(a) * 0.084, 2.98 + t * 0.12, Math.sin(a) * 0.084)); }
    const sy = sailY(x, z);
    add('Lashing_' + i, merge([
      metricUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(turns), 72, 0.011, 4, false), 6),
      // A tie runs from the lashing to the sail corner grommet.
      metricUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(0, 3.1, 0), new V3(0.06 * Math.sign(-x), (3.1 + sy) / 2, 0.06 * Math.sign(-z)), new V3(0.11 * Math.sign(-x), sy - 0.01, 0.11 * Math.sign(-z))]), 12, 0.008, 5, false), 6),
    ]), rope, [x, 0, z]);
  });
  // Double-sided linen sail inset from the masts, with a rolled hem along every edge.
  const inset = 0.11, u0 = span.u[0] + inset, u1 = span.u[1] - inset, v0 = span.v[0] + inset, v1 = span.v[1] - inset;
  const sail = parametricSurface((u, v) => [u, sailY(u, v), v], { u: [u0, u1], v: [v0, v1], uSegments: 52, vSegments: 34 });
  add('LinenCanopy', metricUV(sail, 1.6, { planar: true }), linen);
  const edge = (from, to) => { const pts = []; for (let k = 0; k <= 40; k++) { const t = k / 40, u = from[0] + (to[0] - from[0]) * t, v = from[1] + (to[1] - from[1]) * t; pts.push(new V3(u, sailY(u, v) - 0.004, v)); } return metricUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.013, 4, false), 4); };
  add('LinenCanopyHem', merge([edge([u0, v0], [u1, v0]), edge([u1, v0], [u1, v1]), edge([u1, v1], [u0, v1]), edge([u0, v1], [u0, v0])]), linen);
  // A climbing vine spirals up the first mast, its heart-shaped leaves merged into one mesh.
  const [vx, vz] = masts[0], stem = [], leaves = [];
  for (let k = 0; k <= 60; k++) { const t = k / 60, a = t * Math.PI * 2 * 3.2; stem.push(new V3(vx + Math.cos(a) * 0.105, 0.35 + t * 2.55, vz + Math.sin(a) * 0.105)); }
  const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.05, 0.02, 0.06, 0.08, 0, 0.13); leafShape.bezierCurveTo(-0.06, 0.08, -0.05, 0.02, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 4);
  for (let k = 3; k < 58; k += 1.15) {
    const i = Math.floor(k), p = stem[i], a = (i / 60) * Math.PI * 2 * 3.2, s = 1.05 + 0.4 * Math.sin(k * 1.9);
    leaves.push(metricUV(bake(leafGeo, [p.x + Math.cos(a) * 0.02, p.y, p.z + Math.sin(a) * 0.02], [-60 + 20 * Math.sin(k), -a / DEG + 90, 25 * Math.cos(k * 2.3)], [s, s, s]), 4, { planar: true }));
  }
  add('ClimbingVine', metricUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stem), 90, 0.007, 5, false), 6), leaf);
  add('ClimbingLeaf', merge(leaves), leaf);
  root.rotation.y = -Math.PI / 2;
  return root;
}
