const meta = { name: 'Cove / creation table and ember core', role: 'building' };
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
    { op: 'solid', color: 0xc9b493 }, noise(0xb9a585, 0xd3c09f, 4, 41, 'normal', 0.35), noise(0x8a7860, 0xe2d2b6, 64, 42, 'normal', 0.35, 1), noise(0xa8946f, 0xdccaa9, 160, 43, 'normal', 0.2, 1)] }),
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
    { op: 'solid', color: 0x564b42 }, noise(0x41382f, 0x6c5f52, 3, 101, 'normal', 0.7), noise(0x3f362f, 0x8a7b6a, 26, 102, 'normal', 0.4, 3), noise(0x352d27, 0x9a8b78, 90, 103, 'normal', 0.18, 1)] }),
  terracotta: () => surface({ name: 'Terracotta', size: 256, strength: 2.4, lo: 0.74, hi: 0.93, seed: 111, layers: [
    { op: 'solid', color: 0xa46f57 }, noise(0x8f5e48, 0xb58066, 4, 111, 'normal', 0.6), noise(0x7a5240, 0xc9a08a, 48, 112, 'normal', 0.25, 1)] }),
  ceramic: () => surface({ name: 'CreamGlaze', size: 128, strength: 0.6, lo: 0.18, hi: 0.36, seed: 121, layers: [
    { op: 'solid', color: 0xe9dcc4 }, noise(0xd9c8ab, 0xf4eadb, 3, 121, 'overlay', 0.5)] }),
  paper: () => surface({ name: 'PageEdge', size: 128, strength: 1.2, lo: 0.85, hi: 0.95, seed: 131, layers: [
    { op: 'solid', color: 0xeee2c7 }, { op: 'stripes', colorA: 0xe2d3b2, colorB: 0xf4ead6, count: 64, angleDeg: 90, blend: 'normal', opacity: 0.6 }] }),
  bookCloth: (color = 0x4a5a46) => surface({ name: 'BookCloth', size: 128, strength: 2, lo: 0.8, hi: 0.95, seed: 141, layers: [
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

const tableX = -1.12, tableZ = 0.08, tableTop = 0.785;
// The seedstone surface: broad lobes, a weathered mid band and fine pitting.
function stonePoint(x, y, z, offset = 0) {
  const radial = 1 + 0.11 * Math.sin(x * 3.4 + y * 1.8 + 0.4) * Math.sin(z * 4.2 - y) + 0.035 * Math.sin(x * 12 + y * 7 + z * 9)
    + 0.012 * Math.sin(x * 23 + y * 17) * Math.sin(z * 19 - x * 5) + 0.006 * Math.sin(x * 41 - z * 37 + y * 29);
  return new V3(x * (radial + offset) * 0.49 + y * 0.055, y * (radial + offset) * 0.39, z * (radial + offset) * 0.405);
}
function smoothShade(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, sums = new Map();
  const key = i => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 100000)).join(',');
  for (let i = 0; i < p.count; i++) { const k = key(i); if (!sums.has(k)) sums.set(k, new V3()); sums.get(k).add(new V3(n.getX(i), n.getY(i), n.getZ(i))); }
  for (let i = 0; i < p.count; i++) { const v = sums.get(key(i)).clone().normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return geo;
}
async function build() {
  const root = createRoot('HearthCove');
  const plaster = SURFACES.plaster(256), stone = SURFACES.rimStone(), moss = SURFACES.moss(), basalt = SURFACES.basalt();
  const cloth = SURFACES.bookCloth(), paper = SURFACES.paper(), glaze = SURFACES.ceramic();
  const glow = flat(0xeeb571, 0.6, { emissive: 0xffb456, emissiveIntensity: 2 });
  const tea = flat(0x5a3418, 0.08), accent = flat(0x9b3b2a, 0.6);
  const add = (name, geo, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => part(root, name, geo, material, position, rotation, scale);
  // Turned plaster pedestal with a flared foot and a softened neck.
  const foot = lathe([[0.74, 0], [0.745, 0.025], [0.71, 0.06], [0.62, 0.1], [0.535, 0.18], [0.5, 0.32], [0.515, 0.47], [0.57, 0.565], [0.645, 0.615], [0.66, 0.636]], 56);
  add('TableFoot', creaseNormals(metricUV(foot, 0.8, { radial: true, radius: seamlessRadius(0.6, 0.8) }), { angle: 50 }), plaster, [tableX, 0, tableZ]);
  // Burnished limestone top with a bullnose edge.
  const top = lathe([[0.001, 0.636], [1.1, 0.636], [1.15, 0.646], [1.185, 0.672], [1.2, 0.71], [1.192, 0.748], [1.168, 0.774], [1.13, tableTop], [0.85, tableTop], [0.55, tableTop], [0.25, tableTop], [0.001, tableTop]], 72);
  add('CreationTable', creaseNormals(metricUV(top, 1.1, { radial: true, radius: seamlessRadius(1.19, 1.1) }), { angle: 40 }), stone, [tableX, 0, tableZ]);
  // A shallow moss bed with a rolled lip holds the ember core.
  const bed = lathe([[0.001, tableTop], [0.6, tableTop], [0.655, 0.8], [0.68, 0.828], [0.668, 0.856], [0.62, 0.868], [0.4, 0.874], [0.001, 0.876]], 56);
  add('CoreBed', creaseNormals(metricUV(bed, 2, { radial: true, radius: seamlessRadius(0.65, 2) }), { angle: 50 }), moss, [tableX, 0, tableZ]);
  // The seedstone: a lobed basalt core with smooth shading and fine pitting in its maps.
  const stoneGeo = new THREE.SphereGeometry(1, 64, 40).toNonIndexed(), sp = stoneGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const p = stonePoint(sp.getX(i), sp.getY(i), sp.getZ(i)); sp.setXYZ(i, p.x, p.y, p.z); }
  stoneGeo.computeVertexNormals();
  add('KilnSeedstone', smoothShade(metricUV(smoothShade(stoneGeo), 1.6)), basalt, [tableX, 1.22, tableZ]);
  function fissure(name, from, to, branch = false) {
    const points = [];
    for (let i = 0; i <= 90; i++) {
      const t = from + (to - from) * i / 90, x = branch ? 0.16 + 0.32 * (i / 90) : 0.10 * Math.sin(t * 4) + 0.035 * Math.sin(t * 15), yz = Math.sqrt(1 - x * x);
      points.push(stonePoint(x, yz * Math.cos(t), yz * Math.sin(t), 0.013));
    }
    add(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 110, branch ? 0.004 : 0.007, 6, false), glow, [tableX, 1.22, tableZ]);
  }
  fissure('KilnAmberSeam', 0.13, 3.02);
  fissure('KilnBranchSeam', 1.25, 2.35, true);
  // Moss clumps and river pebbles around the core, merged so they share two draws.
  const clumps = [], pebbles = [];
  for (let i = 0; i < 15; i++) {
    const a = i * 2.4 + 0.3, r = 0.5 + 0.04 * Math.sin(i * 1.7), g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), f = 1 + 0.18 * Math.sin(x * 5 + i) * Math.sin(z * 4 - y * 3); p.setXYZ(k, x * f, Math.max(-0.2, y) * f, z * f); }
    g.computeVertexNormals();
    clumps.push(bake(smoothShade(metricUV(g, 0.25)), [tableX + Math.cos(a) * r, 0.885, tableZ + Math.sin(a) * r * 0.97], [0, i * 37, 0], [0.07 + 0.015 * Math.sin(i), 0.045, 0.06]));
  }
  for (let i = 0; i < 9; i++) {
    const a = i * 0.71 + 1.1, r = 0.4 + 0.05 * Math.cos(i * 2.3), g = new THREE.SphereGeometry(1, 10, 7).toNonIndexed();
    pebbles.push(bake(metricUV(g, 0.4), [tableX + Math.cos(a) * r, 0.885, tableZ + Math.sin(a) * r], [0, i * 51, 6 * Math.sin(i)], [0.035 + 0.012 * Math.cos(i * 3), 0.014, 0.026 + 0.008 * Math.sin(i)]));
  }
  add('CoreGarden', merge(clumps), moss);
  add('CoreGardenPebbles', merge(pebbles), stone);
  // The world bible: cloth-bound boards, a rounded spine, page block and ribbon.
  const book = { position: [-0.40, tableTop, 0.48], rotation: [0, -22, 0] };
  const place = (geo, p, r = [0, 0, 0]) => bake(geo, p, r);
  const boards = [
    place(await roundedBoxGeo(0.38, 0.007, 0.5, 0.003, { segments: 2 }), [0, 0.0035, 0]),
    place(await roundedBoxGeo(0.38, 0.007, 0.5, 0.003, { segments: 2 }), [0, 0.0415, 0]),
    place(new THREE.CylinderGeometry(0.0225, 0.0225, 0.5, 12, 1, true, Math.PI, Math.PI), [-0.19, 0.0225, 0], [90, 0, 0]),
  ].map(g => metricUV(g, 4));
  const coverGeo = bake(merge(boards), book.position, book.rotation);
  add('BibleCover', coverGeo, cloth);
  add('BiblePages', bake(metricUV(new THREE.BoxGeometry(0.36, 0.031, 0.48), 3, { planar: false }), [book.position[0], book.position[1] + 0.0225, book.position[2]], book.rotation), paper);
  const ribbon = new THREE.PlaneGeometry(0.012, 0.09); ribbon.rotateX(-Math.PI / 2);
  add('BibleRibbon', bake(ribbon, [book.position[0] + 0.03, book.position[1] + 0.047, book.position[2] + 0.27], [0, -22, 0]), accent);
  // Tea service: a turned cup with handle on a saucer, and a matching pot.
  const cup = [-1.68, tableTop, 0.64], pot = [-1.92, tableTop, 0.27];
  const saucer = lathe([[0.001, 0], [0.06, 0], [0.066, 0.006], [0.118, 0.012], [0.134, 0.02], [0.13, 0.024], [0.112, 0.018], [0.06, 0.013], [0.001, 0.013]], 40);
  const cupBody = lathe([[0.001, 0.013], [0.042, 0.013], [0.05, 0.02], [0.07, 0.042], [0.084, 0.08], [0.09, 0.118], [0.085, 0.121], [0.079, 0.116], [0.073, 0.08], [0.058, 0.048], [0.001, 0.034]], 40);
  const handle = new THREE.TorusGeometry(0.028, 0.0075, 6, 14, Math.PI * 1.1);
  const potBody = lathe([[0.001, 0], [0.065, 0], [0.074, 0.01], [0.1, 0.05], [0.106, 0.085], [0.098, 0.125], [0.075, 0.15], [0.05, 0.158], [0.046, 0.163], [0.03, 0.166], [0.013, 0.172], [0.016, 0.186], [0.008, 0.194], [0.001, 0.195]], 40);
  const spoutCurve = new THREE.CatmullRomCurve3([new V3(0.085, 0.06, 0), new V3(0.13, 0.085, 0), new V3(0.16, 0.13, 0), new V3(0.178, 0.16, 0)]);
  const spout = new THREE.TubeGeometry(spoutCurve, 10, 0.014, 8, false);
  const potHandle = new THREE.TorusGeometry(0.05, 0.01, 6, 16, Math.PI * 1.15);
  add('TeaService', merge([
    bake(metricUV(saucer, 2), cup), bake(metricUV(cupBody, 2), cup), bake(metricUV(handle, 2), [cup[0] + 0.088, cup[1] + 0.07, cup[2]], [0, 0, -100]),
    bake(metricUV(potBody, 2), pot), bake(metricUV(spout, 2), pot), bake(metricUV(potHandle, 2), [pot[0] - 0.1, pot[1] + 0.09, pot[2]], [0, 0, 80]),
  ]), glaze, [0, 0, 0], [0, 0, 0]);
  const liquid = new THREE.CircleGeometry(0.074, 24); liquid.rotateX(-Math.PI / 2);
  add('Tea', liquid, tea, [cup[0], cup[1] + 0.098, cup[2]]);
  // Ruled sketch cards and a pencil left mid-thought.
  const cards = [0, 1, 2].map(i => bake(metricUV(new THREE.BoxGeometry(0.15, 0.0015, 0.1), 2.5), [-0.55 + i * 0.012, tableTop + 0.001 + i * 0.0016, -0.36 + i * 0.01], [0, 14 - i * 11, 0]));
  add('SketchCards', merge(cards), paper);
  const pencil = new THREE.CylinderGeometry(0.0045, 0.0045, 0.16, 6), tip = new THREE.ConeGeometry(0.0045, 0.022, 6);
  add('Pencil', merge([bake(pencil, [0, 0, 0], [0, 0, 90]), bake(tip, [0.091, 0, 0], [0, 0, -90])].map(g => bake(g, [-0.42, tableTop + 0.0045, -0.24], [0, 38, 0]))), accent);
  // Export with the Kiln asset convention: +X faces out of the cove; the module pivot is the table centre.
  root.rotation.y = -Math.PI / 2;
  for (const child of root.children) child.position.sub(new V3(tableX, 0, tableZ));
  return root;
}
