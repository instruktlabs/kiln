// Sealed r33 meadow-material.mjs and presentation ground clones.
// MIT, Copyright (c) 2026 Matthew Kissinger. Procedural recipe and pixels: CC0-1.0.
import { DataTexture, MeshStandardMaterial, RGBAFormat, RepeatWrapping, SRGBColorSpace, NoColorSpace, LinearFilter, LinearMipmapLinearFilter } from 'three/webgpu';

export function meadowPixels(size = 256) {
  const hash = (x: number, y: number, n: number) => { x = (x % n + n) % n; y = (y % n + n) % n; let v = Math.imul(x + 271, y + 1229) ^ Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801); v = Math.imul(v ^ (v >>> 16), 2246822507); return ((v ^ (v >>> 13)) >>> 0) / 4294967295; };
  const smooth = (t: number) => t * t * (3 - 2 * t), noise = (x: number, y: number, n: number) => { x *= n; y *= n; const a = Math.floor(x), b = Math.floor(y), u = smooth(x - a), v = smooth(y - b); return (hash(a, b, n) * (1 - u) + hash(a + 1, b, n) * u) * (1 - v) + (hash(a, b + 1, n) * (1 - u) + hash(a + 1, b + 1, n) * u) * v; };
  const color = new Uint8Array(size * size * 4), roughness = new Uint8Array(color.length), normal = new Uint8Array(color.length), height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, broad = noise(u, v, 5), patch = noise(u, v, 17), grain = noise(u, v, 113), moss = smooth(Math.max(0, Math.min(1, (broad * .65 + patch * .35 - .26) * 1.7))), at = (y * size + x) * 4;
    const earth = [124, 116, 83], green = [113, 131, 88], detail = (grain - .5) * 13 + (patch - .5) * 9;
    for (let c = 0; c < 3; c++) color[at + c] = Math.round(earth[c] * (1 - moss) + green[c] * moss + detail);
    const r = Math.round(222 + patch * 25); roughness.fill(r, at, at + 3); color[at + 3] = roughness[at + 3] = 255; height[y * size + x] = grain * .5 + patch * .32 + broad * .18;
  }
  const h = (x: number, y: number) => height[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4, dx = (h(x + 1, y) - h(x - 1, y)) * .6, dy = (h(x, y + 1) - h(x, y - 1)) * .6, len = Math.hypot(dx, dy, 1);
    normal[at] = Math.round((-dx / len * .5 + .5) * 255); normal[at + 1] = Math.round((-dy / len * .5 + .5) * 255); normal[at + 2] = Math.round((1 / len * .5 + .5) * 255); normal[at + 3] = 255;
  }
  return { color, roughness, normal, size };
}
/** Caller owns the material and its three generated textures. */
export function createMeadowMaterial(p = meadowPixels()) {
  const texture = (bytes: Uint8Array, srgb = false) => {
    const t = new DataTexture(bytes, p.size, p.size, RGBAFormat); t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(1 / 3, 1 / 3); t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
  };
  const material = new MeshStandardMaterial({ color: 0xffffff, map: texture(p.color, true), roughnessMap: texture(p.roughness), normalMap: texture(p.normal), roughness: 1, metalness: 0, vertexColors: true });
  material.name = 'Farm meadow ground v1'; material.normalScale.set(.4, .4); return material;
}
/** GLB textures stay shared; only the soil/path materials and meadow resources are new. */
export function createGroundMaterials(source: MeshStandardMaterial, pixels?: ReturnType<typeof meadowPixels>): [MeshStandardMaterial, MeshStandardMaterial, MeshStandardMaterial] {
  const soil = source.clone(), meadow = createMeadowMaterial(pixels), path = soil.clone();
  path.color.setHex(0xe3c6a0); path.roughness = 1; path.vertexColors = true; path.normalScale?.set(.2, .2);
  return [meadow, path, soil];
}
