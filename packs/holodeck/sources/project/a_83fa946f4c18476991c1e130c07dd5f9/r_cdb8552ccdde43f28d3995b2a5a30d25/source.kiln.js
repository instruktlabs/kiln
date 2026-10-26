const meta = { name: 'Cove / rim fern planters', role: 'fill' };
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
    { op: 'solid', color: 0xd8c2a2 }, noise(0xc1a683, 0xe8d8bd, 3, 11, 'overlay', 0.85), noise(0x9d876b, 0xf0e3cd, 22, 12, 'overlay', 0.35, 2), noise(0x8a7458, 0xfaf0e0, 70, 13, 'overlay', 0.18, 1)] }),
  baseCourse: () => surface({ name: 'ScuffedBase', size: 256, strength: 3, lo: 0.86, hi: 0.98, seed: 21, layers: [
    { op: 'solid', color: 0x9b8a76 }, noise(0x7e6d5b, 0xb2a08a, 4, 21, 'overlay', 0.8), noise(0x5e4a38, 0xd2b998, 40, 22, 'overlay', 0.4, 2)] }),
  floor: () => surface({ name: 'BurnishedLimeFloor', size: 512, strength: 1.3, lo: 0.42, hi: 0.78, rscale: 3, seed: 31, layers: [
    { op: 'solid', color: 0xcfb592 }, noise(0xc0a37f, 0xdac3a2, 2, 31, 'overlay', 0.6), noise(0xa48663, 0xe6d3b4, 14, 32, 'overlay', 0.3, 3), noise(0x8f7457, 0xf2e4cc, 90, 33, 'overlay', 0.12, 1)] }),
  rimStone: () => surface({ name: 'Limestone', size: 256, strength: 2, lo: 0.5, hi: 0.78, seed: 41, layers: [
    { op: 'solid', color: 0xe3d0b2 }, noise(0xcbb595, 0xf0e2ca, 4, 41, 'overlay', 0.7), noise(0x8d7b63, 0xf6ecdb, 64, 42, 'overlay', 0.4, 1)] }),
  wood: (size = 512) => surface({ name: 'OiledAsh', size, strength: 2.6, lo: 0.55, hi: 0.82, rscale: 7, seed: 51, layers: [
    { op: 'solid', color: 0x7e5c3f }, { op: 'stripes', colorA: 0x6a4c33, colorB: 0x8d6a4a, count: 28, angleDeg: 0, blend: 'normal', opacity: 0.55 },
    noise(0x5c4330, 0x94704f, 3, 51, 'normal', 0.35), noise(0x5a412d, 0x9a7656, 36, 52, 'normal', 0.2, 2)] }),
  darkOak: () => surface({ name: 'DarkOak', size: 128, strength: 2, lo: 0.5, hi: 0.75, seed: 61, layers: [
    { op: 'solid', color: 0x5e3d26 }, { op: 'stripes', colorA: 0x50331f, colorB: 0x6b4630, count: 20, angleDeg: 0, blend: 'overlay', opacity: 0.7 }, noise(0x3f2a1a, 0x7a5236, 4, 61, 'overlay', 0.5)] }),
  linen: (doubleSided = false) => surface({ name: 'Linen', size: 256, strength: 2.2, lo: 0.88, hi: 0.99, seed: 71, doubleSided, layers: [
    { op: 'solid', color: 0xe5d3b3 }, { op: 'checker', colorA: 0xece0c6, colorB: 0xd6c19e, squares: 96, blend: 'overlay', opacity: 0.55 },
    noise(0xcdb894, 0xf3e8d4, 6, 71, 'overlay', 0.6), { op: 'stripes', colorA: 0xd9c6a4, colorB: 0xeee2ca, count: 13, angleDeg: 90, blend: 'overlay', opacity: 0.18 }] }),
  moss: () => surface({ name: 'MossBoucle', size: 256, strength: 3.2, lo: 0.82, hi: 1, seed: 81, layers: [
    { op: 'solid', color: 0x6c7246 }, noise(0x575d36, 0x868c5b, 12, 81, 'overlay', 0.85, 3), { op: 'checker', colorA: 0x737a4b, colorB: 0x60663d, squares: 128, blend: 'overlay', opacity: 0.15 }, noise(0x4d5230, 0x8f9663, 48, 82, 'overlay', 0.4, 2)] }),
  rope: () => surface({ name: 'JuteRope', size: 128, strength: 3, lo: 0.9, hi: 1, seed: 91, layers: [
    { op: 'solid', color: 0xbca27a }, { op: 'stripes', colorA: 0x9a8160, colorB: 0xd3bc94, count: 8, angleDeg: 35, blend: 'normal', opacity: 0.85 }, noise(0x8a7354, 0xdcc7a3, 16, 91, 'overlay', 0.4)] }),
  basalt: (size = 512) => surface({ name: 'EmberBasalt', size, strength: 4.5, lo: 0.5, hi: 0.92, rscale: 6, seed: 101, layers: [
    { op: 'solid', color: 0x4b423a }, noise(0x37302a, 0x625649, 3, 101, 'overlay', 0.9), noise(0x2a2420, 0x74685b, 26, 102, 'overlay', 0.55, 3), noise(0x241f1b, 0x8a7c6c, 90, 103, 'overlay', 0.2, 1)] }),
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

// Holodeck foliage contract: each FernFronds_* node is one primitive whose UV.y runs
// from 0 at a frond's attachment to 1 at its tip, so uv-y wind bends tips, not roots.
// The module is authored directly in cove coordinates and is placed without rotation.
const wobbleAt = (x, z) => 0.018 * Math.sin(x * 2.2 - z * 3.1) + 0.008 * Math.sin(x * 9 + z * 5);
const liftAt = (x, z) => 0.045 * Math.sin(x * 1.4 - z * 0.8);
const capTop = 1.431;
function fernBase(i) {
  const a = 0.4 + i * 0.28, x0 = 4.1 * Math.cos(a), z0 = 4.1 * Math.sin(a), r = 4.1 + wobbleAt(x0, z0);
  const x = r * Math.cos(a), z = r * Math.sin(a);
  return { a, x, z, y: capTop + liftAt(x, z) };
}
// One frond: a narrow rachis ribbon with paired, tapering pinnae. Returns flat arrays.
function frond(base, angle, reach, height, seed, out) {
  const n = 14, pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, droop = Math.max(0, t - 0.6) ** 2 * 0.35;
    pts.push({ t, p: new V3(base.x + Math.cos(angle) * reach * t, base.y + height * Math.sin(t * 2.1) - droop, base.z + Math.sin(angle) * reach * t) });
  }
  const side = new V3(-Math.sin(angle), 0, Math.cos(angle)), up = new V3(0, 1, 0);
  const tri = (a, b, c) => { for (const v of [a, b, c]) { out.position.push(v.p.x, v.p.y, v.p.z); out.uv.push(v.u, v.v); } };
  const vert = (p, u, v) => ({ p, u, v: Math.min(1, Math.max(0, v)) });
  for (let k = 0; k < n; k++) {
    const a = pts[k], b = pts[k + 1], w0 = 0.006 * (1 - a.t * 0.7), w1 = 0.006 * (1 - b.t * 0.7);
    const al = vert(a.p.clone().addScaledVector(side, -w0), 0.45, a.t), ar = vert(a.p.clone().addScaledVector(side, w0), 0.55, a.t);
    const bl = vert(b.p.clone().addScaledVector(side, -w1), 0.45, b.t), br = vert(b.p.clone().addScaledVector(side, w1), 0.55, b.t);
    tri(al, bl, br); tri(al, br, ar);
  }
  for (let k = 1; k < n; k++) {
    const { t, p } = pts[k], next = pts[k + 1].p, forward = next.clone().sub(p).normalize();
    const len = (0.03 + 0.1 * Math.sin(Math.min(1, t * 1.15) * Math.PI)) * (0.9 + 0.2 * Math.sin(seed + k)), width = len * 0.24;
    for (const s of [-1, 1]) {
      const dir = side.clone().multiplyScalar(s).addScaledVector(forward, 0.55).addScaledVector(up, -0.12 - 0.25 * t).normalize();
      const tip = p.clone().addScaledVector(dir, len), mid = p.clone().addScaledVector(dir, len * 0.45).addScaledVector(up, 0.012);
      const across = new V3().crossVectors(dir, up).normalize().multiplyScalar(width * 0.5);
      const v0 = vert(p, 0.5, t), v1 = vert(mid.clone().add(across), s < 0 ? 0.2 : 0.8, t + 0.01), v2 = vert(tip, s < 0 ? 0 : 1, t + 0.03);
      const v3 = vert(mid.clone().sub(across), s < 0 ? 0.3 : 0.7, t + 0.01), vm = vert(mid, s < 0 ? 0.25 : 0.75, t + 0.012);
      tri(v0, v1, vm); tri(v1, v2, vm); tri(v2, v3, vm); tri(v3, v0, vm);
    }
  }
}
async function build() {
  const root = createRoot('CovePlanting');
  const pot = SURFACES.terracotta(), soil = SURFACES.soil();
  const leaf = surface({ name: 'FernFrond', size: 128, strength: 1.5, lo: 0.62, hi: 0.85, seed: 211, doubleSided: true, layers: [
    { op: 'gradient', from: 0x34502a, to: 0x7e9a48, angleDeg: 90 }, noise(0x2c4524, 0x8aa356, 10, 211, 'overlay', 0.45), { op: 'stripes', colorA: 0x5f7a3a, colorB: 0x6f8a44, count: 4, angleDeg: 0, blend: 'overlay', opacity: 0.3 }] });
  const pots = [], soils = [];
  const potGeo = lathe([[0.001, 0], [0.072, 0], [0.078, 0.008], [0.098, 0.085], [0.112, 0.092], [0.116, 0.112], [0.106, 0.116], [0.098, 0.1], [0.001, 0.1]], 20);
  const soilGeo = new THREE.CircleGeometry(0.1, 16); soilGeo.rotateX(-Math.PI / 2);
  const groups = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10]].map(() => ({ position: [], uv: [] }));
  for (let i = 0; i < 11; i++) {
    const b = fernBase(i);
    pots.push(bake(metricUV(potGeo, 3, { radial: true, radius: seamlessRadius(0.1, 3) }), [b.x, b.y, b.z], [0, i * 23, 0]));
    soils.push(bake(metricUV(soilGeo, 3), [b.x, b.y + 0.101, b.z]));
    const stem = { x: b.x, y: b.y + 0.1, z: b.z }, out = groups[i < 4 ? 0 : i < 8 ? 1 : 2];
    for (let j = 0; j < 8; j++) frond(stem, b.a + j * 0.785 + 0.3 * Math.sin(i * 3 + j), 0.32 + 0.1 * Math.sin(i + j), 0.24 + 0.08 * Math.cos(i * 2 + j), i * 7 + j, out);
  }
  part(root, 'FernPots', creaseNormals(merge(pots), { angle: 50 }), pot, [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
  part(root, 'FernSoil', merge(soils), soil, [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
  ['A', 'B', 'C'].forEach((name, g) => {
    // Each wind node sits at its planters' centre so the three groups sway out of phase.
    const ids = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10]][g], centre = ids.map(fernBase).reduce((c, b) => c.add(new V3(b.x, b.y, b.z)), new V3()).divideScalar(ids.length);
    const geo = new THREE.BufferGeometry(), pos = groups[g].position.slice();
    for (let k = 0; k < pos.length; k += 3) { pos[k] -= centre.x; pos[k + 1] -= centre.y; pos[k + 2] -= centre.z; }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(groups[g].uv, 2));
    // Weld shared corners so fronds shade smoothly and export compactly.
    const welded = mergeVertices(geo); welded.computeVertexNormals();
    part(root, 'FernFronds_' + name, welded, leaf, [centre.x, centre.y, centre.z], [0, 0, 0], [1, 1, 1], true);
  });
  return root;
}
