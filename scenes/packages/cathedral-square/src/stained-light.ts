import { BufferAttribute, BufferGeometry, Color, DataTexture, DirectionalLight, DoubleSide, FloatType, Group, LinearFilter, Mesh, NearestFilter, Ray, RedFormat, SRGBColorSpace, Vector2, Vector3, Vector4 } from 'three/webgpu';
import { dot, ivec2, positionWorld, texture, textureLoad, uniform, vec2, vec3 } from 'three/tsl';
import type { MeshStandardMaterial, Object3D, Texture } from 'three/webgpu';
import { MeshBVH } from 'three-mesh-bvh';
import { createCollisionWorld } from '@kiln-scenes/scene-kit/collision';
import { isCathedralSolid } from './interior-collision';
import { HIDDEN_PARTS, HIDDEN_PREFIX } from './layout';
import { afternoonSunDirection } from './light';

const hidden = new Set<string>(HIDDEN_PARTS);
const MAX_SAMPLES = 262144;
const RAY_LENGTH = 350;
/** Artistic transmission gain, bounded to one; not calibrated spectral glass transport. */
const TRANSMISSION_GAIN = 2;
type Pixels = { data: ArrayLike<number>; width: number; height: number };
function pixelsOf(texture: Texture): Pixels | null {
  const image = texture.image as { data?: ArrayLike<number>; width?: number; height?: number } | undefined;
  if (!image?.width || !image.height) return null;
  if (image.data) return { data: image.data, width: image.width, height: image.height };
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image as CanvasImageSource, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
function materialOf(mesh: Mesh): MeshStandardMaterial { return (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial; }
function blocksLight(mesh: Mesh): boolean {
  if (hidden.has(mesh.name) || mesh.name.startsWith(HIDDEN_PREFIX) || mesh.userData.kilnMerged) return false;
  const material = materialOf(mesh);
  if (material.transparent || /Glass|Weathering/.test(material.name)) return false;
  return isCathedralSolid(mesh) || /_(?:Lead|LeadWork|Oak|Iron)(?:_\d+)?$/.test(mesh.name);
}
function copyGlass(meshes: readonly Mesh[]): BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], point = new Vector3();
  for (const mesh of meshes) {
    const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, uv = mesh.geometry.getAttribute('uv');
    for (let i = 0, n = index?.count ?? p.count; i < n; i++) {
      const source = index ? index.getX(i) : i;
      point.fromBufferAttribute(p, source).applyMatrix4(mesh.matrixWorld);
      positions.push(point.x, point.y, point.z); uvs.push(uv?.getX(source) ?? 0, uv?.getY(source) ?? 0);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  return geometry;
}
type Glass = { geometry: BufferGeometry; bvh: MeshBVH; texture: Texture; pixels: Pixels };
function buildGlass(cathedral: Object3D): Glass[] {
  cathedral.updateWorldMatrix(true, true);
  const groups = new Map<Texture, Mesh[]>();
  cathedral.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    const material = materialOf(mesh);
    if (material.name !== 'StainedGlass' || !material.map) return;
    const group = groups.get(material.map) ?? []; group.push(mesh); groups.set(material.map, group);
  });
  const result: Glass[] = [];
  try {
    for (const [texture, meshes] of groups) {
      const pixels = pixelsOf(texture); if (!pixels) continue;
      const geometry = copyGlass(meshes);
      try { result.push({ geometry, bvh: new MeshBVH(geometry, { targetLeafSize: 10 }), texture, pixels }); }
      catch (error) { geometry.dispose(); throw error; }
    }
    return result;
  } catch (error) { for (const entry of result) entry.geometry.dispose(); throw error; }
}
const sampleUv = new Vector2(), sampleColor = new Color();
function glassColor(entry: Glass, uv: Vector2): [number, number, number] {
  sampleUv.copy(uv); entry.texture.transformUv(sampleUv);
  const px = Math.min(entry.pixels.width - 1, Math.max(0, Math.floor(sampleUv.x * entry.pixels.width)));
  const py = Math.min(entry.pixels.height - 1, Math.max(0, Math.floor(sampleUv.y * entry.pixels.height)));
  const i = (py * entry.pixels.width + px) * 4;
  sampleColor.setRGB((entry.pixels.data[i] ?? 0) / 255, (entry.pixels.data[i + 1] ?? 0) / 255, (entry.pixels.data[i + 2] ?? 0) / 255, SRGBColorSpace);
  return [Math.min(1, sampleColor.r * TRANSMISSION_GAIN), Math.min(1, sampleColor.g * TRANSMISSION_GAIN), Math.min(1, sampleColor.b * TRANSMISSION_GAIN)];
}
function firstGlass(glass: Glass[], ray: Ray) {
  let closest = RAY_LENGTH;
  let found: { color: [number, number, number]; point: Vector3 } | null = null;
  for (const entry of glass) {
    const hit = entry.bvh.raycastFirst(ray, DoubleSide, .002, closest);
    if (hit?.uv) { closest = hit.distance; found = { color: glassColor(entry, hit.uv), point: hit.point }; }
  }
  return found;
}

/** Exact CPU surface oracle for tests; these owned BVHs are not retained by the live bake. */
export function createStainedSurfaceProbe(cathedral: Object3D, furnishings?: Object3D, sun = new Vector3().copy(afternoonSunDirection())) {
  const glass = buildGlass(cathedral), solid = createCollisionWorld();
  try {
    solid.addStatic('structure', cathedral, blocksLight);
    if (furnishings) solid.addStatic('furnishings', furnishings);
  } catch (error) { solid.dispose(); for (const entry of glass) entry.geometry.dispose(); throw error; }
  const direction = sun.clone().normalize(), ray = new Ray(new Vector3(), direction), end = new Vector3();
  let disposed = false;
  return {
    sample(point: Vector3, normal: Vector3) {
      const incidence = Math.max(0, normal.dot(direction));
      if (disposed || !incidence) return { filtered: false, shadowed: true, color: [0, 0, 0] as [number, number, number] };
      ray.origin.copy(point).addScaledVector(normal, .004);
      end.copy(ray.origin).addScaledVector(direction, RAY_LENGTH);
      const shadowed = solid.rayDistance(ray.origin, end) < RAY_LENGTH - .01;
      const window = firstGlass(glass, ray);
      const color = shadowed ? [0, 0, 0] as [number, number, number] : window?.color ?? [1, 1, 1] as [number, number, number];
      return { filtered: !!window, shadowed, color: color.map(value => value * incidence) as [number, number, number] };
    },
    dispose() { if (disposed) return; disposed = true; solid.dispose(); for (const entry of glass) entry.geometry.dispose(); },
  };
}
interface Projection {
  color: DataTexture; depth: DataTexture; width: number; height: number;
  u: Vector3; v: Vector3; sun: Vector3; rect: Vector4;
}

/** Cover sub-texel pane/lead seams with compatible neighboring glass, never white sunlight.
 * The real opaque shadow remains the visibility test, including the lead and stone frame.
 * One frozen 3x3 pass expands at most one texel; it cannot flood an opening or mix distant panes.
 */
function coverPaneSeams(colors: Uint8Array, depths: Float32Array, width: number, height: number): void {
  const sourceColors = colors.slice(), sourceDepths = depths.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (sourceColors[index * 4 + 3]) continue;
    let referenceDepth: number | null = null, red = 0, green = 0, blue = 0, depth = 0, weight = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const sx = x + dx, sy = y + dy;
      if ((!dx && !dy) || sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const source = sy * width + sx;
      if (!sourceColors[source * 4 + 3]) continue;
      const candidateDepth = sourceDepths[source]!;
      if (referenceDepth === null) referenceDepth = candidateDepth;
      if (Math.abs(candidateDepth - referenceDepth) > .75) continue;
      const w = dx && dy ? .5 : 1;
      red += sourceColors[source * 4]! * w; green += sourceColors[source * 4 + 1]! * w; blue += sourceColors[source * 4 + 2]! * w;
      depth += candidateDepth * w; weight += w;
    }
    if (!weight) continue;
    colors[index * 4] = Math.round(red / weight); colors[index * 4 + 1] = Math.round(green / weight); colors[index * 4 + 2] = Math.round(blue / weight); colors[index * 4 + 3] = 255;
    depths[index] = depth / weight;
  }
}

/** Install while creating the light, before Three caches its AnalyticLightNode. */
export function createStainedSunBinding(light: DirectionalLight) {
  const neutral = new DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1); neutral.needsUpdate = true;
  const neutralDepth = new DataTexture(new Float32Array([-1e6]), 1, 1, RedFormat, FloatType); neutralDepth.needsUpdate = true;
  const u = uniform(new Vector3(1, 0, 0)), v = uniform(new Vector3(0, 1, 0)), sun = uniform(new Vector3(0, 1, 0));
  const rect = uniform(new Vector4(0, 0, 1, 1)), dimensions = uniform(new Vector2(1, 1)), enabled = uniform(0);
  const base = uniform(new Vector3(light.color.r, light.color.g, light.color.b).multiplyScalar(light.castShadow ? light.intensity : 0));
  const coords = vec2(dot(positionWorld, u), dot(positionWorld, v)).sub(rect.xy).mul(rect.zw);
  const texel = ivec2(coords.mul(dimensions).floor().clamp(vec2(0), dimensions.sub(1)));
  const tint = textureLoad(neutral, texel), depth = textureLoad(neutralDepth, texel);
  // RGB interpolation is independent of nearest glass depth/validity and opaque shadowing.
  const smoothTint = texture(neutral, coords);
  const inside = coords.x.greaterThanEqual(0).and(coords.x.lessThan(1)).and(coords.y.greaterThanEqual(0)).and(coords.y.lessThan(1));
  const behindGlass = dot(positionWorld, sun).lessThan(depth.r.sub(.02));
  const filtered = inside.and(behindGlass).and(tint.a.greaterThan(.5)).and(enabled.greaterThan(.5));
  const colorNode = base.mul(filtered.select(smoothTint.rgb, vec3(1)));
  const nodeLight = light as DirectionalLight & { colorNode?: typeof colorNode };
  const previous = nodeLight.colorNode; nodeLight.colorNode = colorNode;
  let owner: object | null = null, active = false, disposed = false, hasShadows = light.castShadow;
  const binding = {
    get active() { return active; },
    set(projection: Projection | null, nextOwner: object) {
      if (disposed) return;
      const nextActive = !!projection && light.castShadow;
      if (owner === nextOwner && active === nextActive && hasShadows === light.castShadow) return;
      owner = nextOwner; active = nextActive; hasShadows = light.castShadow; enabled.value = nextActive ? 1 : 0;
      base.value.set(light.color.r, light.color.g, light.color.b).multiplyScalar(hasShadows ? light.intensity : 0);
      if (!projection) { tint.value = smoothTint.value = neutral; depth.value = neutralDepth; dimensions.value.set(1, 1); return; }
      tint.value = smoothTint.value = projection.color; depth.value = projection.depth;
      u.value.copy(projection.u); v.value.copy(projection.v); sun.value.copy(projection.sun);
      rect.value.copy(projection.rect); dimensions.value.set(projection.width, projection.height);
    },
    clear(previousOwner: object) {
      if (owner !== previousOwner || disposed) return;
      owner = null; active = false; enabled.value = 0; tint.value = smoothTint.value = neutral; depth.value = neutralDepth; dimensions.value.set(1, 1);
    },
    dispose() {
      if (disposed) return; disposed = true;
      if (nodeLight.colorNode === colorNode) nodeLight.colorNode = previous;
      neutral.dispose(); neutralDepth.dispose(); sunBindings.delete(light);
    },
  };
  sunBindings.set(light, binding); return binding;
}
const sunBindings = new WeakMap<DirectionalLight, ReturnType<typeof createStainedSunBinding>>();

/**
 * A sun-space glass field modulates the real directional light. Only RGB interpolates;
 * first-glass depth/validity remain nearest, and opaque shadowing is independent.
 * Existing receiver normals and the sun shadow map choose the first opaque surface. No
 * floor decals, extra receiver draws, extra shadow pass, or per-frame CPU rays. When shadows
 * are disabled, this filter is disabled too. Bounded raster lighting, not physical caustics.
 */
export function buildStainedLight(cathedral: Object3D, _furnishings?: Object3D, options: { sun?: Vector3; cellSize?: number } = {}) {
  const root = new Group(); root.name = 'Stained-glass sun transmission';
  const stats = { samples: 0, litSamples: 0, solidTriangles: 0, litBounds: null as { minX: number; maxX: number; minZ: number; maxZ: number } | null };
  let projection: Projection | null = null, disposed = false;
  const bindings = new Set<ReturnType<typeof createStainedSunBinding>>();
  const result = { root, stats, get projection() { return projection; },
    bindSun(light: DirectionalLight) {
      if (disposed) return;
      const binding = sunBindings.get(light);
      if (!binding) throw new Error('Install stained sun binding before the first scene render');
      binding.set(projection, result); bindings.add(binding);
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const binding of bindings) binding.clear(result);
      projection?.color.dispose(); projection?.depth.dispose(); projection = null;
      root.removeFromParent(); root.clear();
    },
  };
  const glass = buildGlass(cathedral);
  try {
    if (!glass.length) return result;
    const sun = options.sun?.clone().normalize() ?? new Vector3().copy(afternoonSunDirection());
    const u = new Vector3().crossVectors(new Vector3(0, 1, 0), sun).normalize();
    if (u.lengthSq() < .5) u.set(1, 0, 0);
    const v = new Vector3().crossVectors(sun, u).normalize();
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity, front = -Infinity;
    const point = new Vector3();
    for (const entry of glass) {
      const positions = entry.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        const pu = point.dot(u), pv = point.dot(v);
        minU = Math.min(minU, pu); maxU = Math.max(maxU, pu); minV = Math.min(minV, pv); maxV = Math.max(maxV, pv); front = Math.max(front, point.dot(sun));
      }
    }
    minU -= .02; minV -= .02; maxU += .02; maxV += .02;
    const extentU = maxU - minU, extentV = maxV - minV;
    let cell = Math.max(.08, options.cellSize ?? .2, Math.sqrt(extentU * extentV / (MAX_SAMPLES - 2048)));
    let width = Math.ceil(extentU / cell), height = Math.ceil(extentV / cell);
    while (width * height > MAX_SAMPLES) { cell *= 1.01; width = Math.ceil(extentU / cell); height = Math.ceil(extentV / cell); }
    const colors = new Uint8Array(width * height * 4), depths = new Float32Array(width * height); depths.fill(-1e6);
    const ray = new Ray(new Vector3(), sun.clone().negate());
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      ray.origin.copy(u).multiplyScalar(minU + (x + .5) / width * extentU).addScaledVector(v, minV + (y + .5) / height * extentV).addScaledVector(sun, front + 2);
      stats.samples++;
      const hit = firstGlass(glass, ray); if (!hit) continue;
      const index = y * width + x; depths[index] = hit.point.dot(sun);
      colors[index * 4] = Math.round(hit.color[0] * 255); colors[index * 4 + 1] = Math.round(hit.color[1] * 255); colors[index * 4 + 2] = Math.round(hit.color[2] * 255); colors[index * 4 + 3] = 255;
      stats.litSamples++;
    }
    coverPaneSeams(colors, depths, width, height);
    const color = new DataTexture(colors, width, height), depth = new DataTexture(depths, width, height, RedFormat, FloatType);
    color.minFilter = color.magFilter = LinearFilter;
    depth.minFilter = depth.magFilter = NearestFilter;
    color.generateMipmaps = depth.generateMipmaps = false; color.needsUpdate = depth.needsUpdate = true;
    projection = { color, depth, width, height, u, v, sun, rect: new Vector4(minU, minV, 1 / extentU, 1 / extentV) };
    root.userData.stainedLight = stats; return result;
  } catch (error) { result.dispose(); throw error; }
  finally { for (const entry of glass) entry.geometry.dispose(); }
}
