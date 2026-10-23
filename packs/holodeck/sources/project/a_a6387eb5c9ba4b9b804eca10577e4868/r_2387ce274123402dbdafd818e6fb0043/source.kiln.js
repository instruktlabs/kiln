const meta = { name: 'Cove / platform and curved seating shell', role: 'building' };
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

// Hand-built wobble shared by the wall, its cap and the planters that sit on it.
const wobbleAt = (x, z) => 0.018 * Math.sin(x * 2.2 - z * 3.1) + 0.008 * Math.sin(x * 9 + z * 5);
const liftAt = (x, z) => 0.045 * Math.sin(x * 1.4 - z * 0.8);
// An arc of the shell, built directly in cove coordinates (world angles start..end).
function arcGeo(inner, outer, bottom, top, start, end, { bevel = 0.025, segments = 64, bevelSegments = 3, wobble = false, follow = false, hug = false } = {}) {
  const shape = new THREE.Shape();
  // Profile angles are negated: the extrusion's second axis becomes cove -Z.
  shape.absarc(0, 0, outer, -end, -start, false);
  shape.lineTo(inner * Math.cos(-start), inner * Math.sin(-start));
  shape.absarc(0, 0, inner, -start, -end, true); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments: segments, steps: 1 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, bottom, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    let w = 0, lift = 0;
    if (wobble || follow || hug) w = wobbleAt(x, z);
    if (wobble) lift = liftAt(x, z) * Math.max(0, (y - bottom) / (top - bottom));
    if (follow) lift = liftAt(x, z);
    p.setXYZ(i, x + x / r * w, y + lift, z + z / r * w);
  }
  return geo;
}
function shellPart(root, name, geo, material, scale, radius) {
  const mapped = metricUV(geo, scale, { radial: true, radius: seamlessRadius(radius, scale) });
  part(root, name, creaseNormals(mapped, { angle: 50 }), material);
}
async function build() {
  const root = createRoot('HearthCove');
  const plaster = SURFACES.plaster(), floor = SURFACES.floor(), rim = SURFACES.rimStone(), base = SURFACES.baseCourse(), oak = SURFACES.darkOak();
  // Platform: burnished floor with a rounded nosing and a plaster skirt.
  const top = new THREE.RingGeometry(0, 4.52, 96, 4); top.rotateX(-Math.PI / 2);
  part(root, 'Platform', metricUV(top, 0.5, { planar: true }), floor);
  const edge = lathe([[4.68, -0.22], [4.68, -0.16], [4.665, -0.07], [4.64, -0.03], [4.6, -0.008], [4.555, 0], [4.52, 0]], 96);
  shellPart(root, 'PlatformEdge', edge, plaster, 0.8, 4.6);
  // A dark oak inlay ring set into the floor near the edge.
  const inlay = new THREE.RingGeometry(4.43, 4.49, 96, 1); inlay.rotateX(-Math.PI / 2); inlay.translate(0, 0.0025, 0);
  part(root, 'PlatformInlay', metricUV(inlay, 3, { planar: true }), oak);
  // The enclosing wall, low seat and their stone caps sit behind the observer and to the left.
  shellPart(root, 'CurvedBack', arcGeo(3.95, 4.25, 0.02, 1.38, 0.10, 3.65, { wobble: true, segments: 48, bevelSegments: 2 }), plaster, 0.8, 4.1);
  shellPart(root, 'WallCap', arcGeo(3.92, 4.28, 1.385, 1.415, 0.085, 3.665, { follow: true, segments: 48, bevel: 0.016, bevelSegments: 1 }), rim, 1.2, 4.1);
  shellPart(root, 'SeatPlinth', arcGeo(3.12, 3.99, 0.02, 0.38, 0.18, 3.6, { segments: 40, bevelSegments: 2 }), plaster, 0.8, 3.5);
  shellPart(root, 'SeatTop', arcGeo(3.10, 3.99, 0.39, 0.47, 0.18, 3.6, { hug: true, segments: 40, bevel: 0.022, bevelSegments: 2 }), rim, 1.2, 3.5);
  // Scuffed base courses where feet and floor water wear the plaster.
  shellPart(root, 'BaseCourseBack', arcGeo(4.27, 4.305, 0.0, 0.15, 0.10, 3.65, { hug: true, segments: 48, bevel: 0 }), base, 1, 4.26);
  shellPart(root, 'BaseCourseSeat', arcGeo(3.06, 3.092, 0.0, 0.1, 0.18, 3.6, { segments: 40, bevel: 0 }), base, 1, 3.1);
  // Export with the Kiln asset convention: +X faces out of the cove.
  root.rotation.y = -Math.PI / 2;
  return root;
}
