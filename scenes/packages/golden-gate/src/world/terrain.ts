// Terrain rings from the terrain pipeline (terrain/REPORT.md): gltfpack tiles with
// EXT_meshopt_compression + KHR_mesh_quantization, one WebP albedo and one object-space normal map
// per tile. The kit's loadGlb/loadPack reject meshopt (kit request GG-002), so tiles are fetched
// through the verified pack reader and parsed here. Quantized positions (uint16 with a node
// transform) and int8 normals are baked to float32 world space: WebGPU has no three-component
// 16- or 8-bit vertex formats, and a baked tile needs no per-object transform. The near levels are then
// edited along the approach roads (./corridor, fix round 2): cut, fill and structure clearance, with the
// imagery still draped; where a benched cut (fix round 3) lowers the terrain, the imagery turns toward the cut's
// scrub colours. The same levels carry the vegetation impostors (./vegetation, fix round 3): their roots take the
// edited tile's surface and their material reads the tile's own imagery.
import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Color, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, NoColorSpace, ObjectSpaceNormalMap, SRGBColorSpace, Texture, Vector3 } from 'three/webgpu';
import type { Node, Object3D } from 'three/webgpu';
import { attribute, color, materialColor, mix, mx_noise_float, normalView, positionWorld, specularColor, specularColorBlended, specularF90, vec3, vec4 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { FeatureLevel } from '../tiers';
import type { WaterMapEntry } from './water-maps';
import { LAYERS } from '../constants';
import { applyCorridors, CORRIDOR_LEVELS } from './corridor';
import type { CorridorPlan } from './corridor';
import { crownAtlasTexture, vegetationMaterial, vegetationTile } from './vegetation';
import type { VegetationCandidate } from './vegetation';
import type { VegetationData } from '../data';

export type TileBounds = [number, number, number, number]; // xmin, zmin, xmax, zmax
export interface TerrainTileEntry { key: string; bounds: TileBounds; glb: string; albedo: string; normal: string; triangles: number; bytes: number; albedoSize: number }
export interface TerrainLevelEntry { half: number; hole: number; tiles: TerrainTileEntry[] }
export interface TerrainIndex {
  schema: string;
  levels: Record<string, TerrainLevelEntry>;
  sets: Record<FeatureLevel, string[]>;
  water: Record<FeatureLevel, { near: WaterMapEntry; mid: WaterMapEntry }>;
  collision: { path: string; bounds: TileBounds; metresPerUnit: number; size: [number, number] };
  postcard: { position: [number, number, number]; target: [number, number, number]; fov: number; groundClearance: number; sightlineClearance: number };
  downloads: Record<string, number>; triangles: Record<string, number>;
}
export interface SceneIndex {
  schema: string; release: string;
  bridge: Record<'web' | 'far', { model: string; path: string; revision: string; bytes: number; triangles: number; licence: string }>;
  terrain: TerrainIndex;
  vehicles: Record<string, { model: string; path: string; licence: string; asset: string; revision: string; licenceGenerated: boolean }>;
}

export type FetchFile = (path: string, signal: AbortSignal) => Promise<ArrayBuffer>;
export interface TerrainOptions {
  set: FeatureLevel; anisotropy: number; receiveShadow: boolean; signal: AbortSignal; onTile?: (loaded: number, total: number) => void;
  /** The approach roads' corridors, applied to the tiles of CORRIDOR_LEVELS. */
  corridors?: readonly CorridorPlan[];
  /** Vegetation impostor candidates (./vegetation), set on the tiles of CORRIDOR_LEVELS, with their data and distance fade. */
  vegetation?: { candidates: readonly VegetationCandidate[]; data: VegetationData; fade: readonly [number, number] };
}
export interface Terrain {
  root: Group; tiles: number; triangles: number; textureBytes: number; /** Tiles whose UVs were reoriented (see bakeTileGeometry). */ uvFlipped: number;
  /** Tiles edited by the approach corridors, triangles replaced and pieces added. */
  corridor: { tiles: number; clipped: number; pieces: number };
  /**
   * The vegetation impostors (not under `root`: the caller adds `root` to the approaches' near representation): the
   * candidates offered, the cards set on a tile (after dropping those over water, beach or no tile), their meshes,
   * and bytes on the GPU for the cards' instance data and for the crown atlas with its mipmaps.
   */
  vegetation: { root: Group; candidates: number; cards: number; dropped: number; meshes: number; bytes: number; atlasBytes: number };
  dispose(): void;
}

async function bitmap(bytes: ArrayBuffer, type: string): Promise<ImageBitmap> {
  // glTF convention: UV (0,0) is the image's top-left, so the image is uploaded unflipped.
  return createImageBitmap(new Blob([bytes], { type }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'from-image' });
}
function imageTexture(image: ImageBitmap, name: string, srgb: boolean, anisotropy: number): Texture {
  const texture = new Texture(image);
  texture.name = name; texture.flipY = false; texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping; texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter; texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Grass, scrub and rock seen from above shadow most of their own specular, so the sky's grazing
 * reflection stays small: F0 0.012 and F90 0.3 in place of the dielectric 0.04 and 1. With the full
 * dielectric response the headland slopes facing the postcard camera took on the sky's blue.
 */
export const TERRAIN_SPECULAR = { f0: .012, f90: .3 } as const;
class TerrainMaterial extends MeshStandardNodeMaterial {
  static get type() { return 'GoldenGateTerrainMaterial'; }
  /** Set on tiles the approach corridors edited: their `corridor` vertex weight blends the map's normal toward the edited surface's. */
  corridor = false;
  setupSpecular() {
    specularColor.assign(vec3(TERRAIN_SPECULAR.f0)); specularColorBlended.assign(vec3(TERRAIN_SPECULAR.f0)); specularF90.assign(TERRAIN_SPECULAR.f90);
  }
  setupNormal(): Node {
    const map = super.setupNormal() as Node<'vec3'>;
    return this.corridor ? mix(map, normalView, attribute('corridor', 'float')).normalize() : map;
  }
}

/** Scrub colours of a benched cut (sRGB, 0 to 255). */
export interface ScrubTones { dark: readonly number[]; light: readonly number[] }
/** Sizes (m) of the two octaves of the scrub colours' variation over scene x and z, and each octave's share. */
export const SCRUB_VARIATION = { sizes: [3.5, 1.2], shares: [.65, .35] } as const;
/**
 * A benched cut's surface colour: the imagery turned toward the cut's scrub colours by the `scrub` vertex weight,
 * varying between the dark and the light colour in patches (two octaves of noise over scene x and z), so the cut's
 * faces and benches read as scrub and soil rather than as the imagery stretched over the new slopes.
 */
export function scrubColor(tones: ScrubTones): Node<'vec4'> {
  const tone = (c: readonly number[]) => color(new Color().setRGB(c[0]! / 255, c[1]! / 255, c[2]! / 255, SRGBColorSpace));
  const { sizes, shares } = SCRUB_VARIATION, p = positionWorld.xz;
  const n = mx_noise_float(p.div(sizes[0])).mul(shares[0]).add(mx_noise_float(p.div(sizes[1])).mul(shares[1]));
  const scrub = mix(tone(tones.dark), tone(tones.light), n.mul(.7).add(.5).clamp());
  return vec4(mix(materialColor.rgb, scrub, attribute('scrub', 'float')), 1);
}

/**
 * Applies the approach corridors to a baked tile (./corridor). Returns the edited geometry with a
 * `corridor` weight attribute (and a `scrub` weight attribute with the cut's scrub colours where a benched
 * cut lowered the terrain), or null when no triangle of the tile overlaps a corridor.
 */
export function corridorTileGeometry(geometry: BufferGeometry, plans: readonly CorridorPlan[]): { geometry: BufferGeometry; clipped: number; pieces: number; scrub: ScrubTones | null } | null {
  const index = geometry.index!.array as Uint16Array | Uint32Array;
  const result = applyCorridors({ position: geometry.getAttribute('position').array as Float32Array, normal: geometry.getAttribute('normal').array as Float32Array, uv: geometry.getAttribute('uv').array as Float32Array, index }, plans);
  if (!result.stats.clipped) return null;
  const edited = new BufferGeometry();
  edited.setAttribute('position', new BufferAttribute(result.position, 3)); edited.setAttribute('normal', new BufferAttribute(result.normal, 3)); edited.setAttribute('uv', new BufferAttribute(result.uv, 2));
  edited.setAttribute('corridor', new BufferAttribute(result.weight, 1)); edited.setIndex(new BufferAttribute(result.index, 1));
  if (result.scrub) edited.setAttribute('scrub', new BufferAttribute(result.scrub.weight, 1));
  edited.computeBoundingBox(); edited.computeBoundingSphere();
  edited.userData.uvFlipped = geometry.userData.uvFlipped;
  return { geometry: edited, clipped: result.stats.clipped, pieces: result.stats.pieces, scrub: result.scrub ? { dark: result.scrub.dark, light: result.scrub.light } : null };
}

/**
 * Bakes a quantized glTF primitive into float32 world-space attributes, with UVs in the imagery's
 * orientation. The imagery's top row is +Z and its left column -X (sampled with flipY = false), so
 * u must grow toward +X and v toward -Z. The delivered tiles carry v growing toward +Z, against the
 * terrain manifest's "v increases -Z" (their exporter flips V), which mirrored every tile's albedo
 * and normal map north to south; each axis is checked against the positions and flipped if needed.
 * `userData.uvFlipped` records what was flipped.
 */
export function bakeTileGeometry(mesh: Mesh): BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const source = mesh.geometry, position = source.getAttribute('position'), normal = source.getAttribute('normal'), uv = source.getAttribute('uv');
  if (!position || !normal || !uv || !source.index) throw new Error(`Terrain tile ${mesh.name || '(unnamed)'} lacks position, normal, uv or index`);
  const count = position.count, p = new Float32Array(count * 3), n = new Float32Array(count * 3), t = new Float32Array(count * 2);
  const v = new Vector3(), e = mesh.matrixWorld.elements;
  for (let i = 0; i < count; i++) {
    v.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(mesh.matrixWorld);
    p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
    // Node transforms are translation plus uniform scale, so the normal direction is unchanged.
    v.set(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize();
    n[i * 3] = v.x; n[i * 3 + 1] = v.y; n[i * 3 + 2] = v.z;
    t[i * 2] = uv.getX(i); t[i * 2 + 1] = uv.getY(i);
  }
  if (Math.abs(e[1]!) + Math.abs(e[2]!) + Math.abs(e[4]!) + Math.abs(e[6]!) + Math.abs(e[8]!) + Math.abs(e[9]!) > 1e-9) throw new Error('Terrain tile transform is not axis-aligned');
  // Covariance signs of u with x and v with z decide the orientation.
  let mx = 0, mz = 0, mu = 0, mv = 0, xu = 0, zv = 0;
  for (let i = 0; i < count; i++) { mx += p[i * 3]!; mz += p[i * 3 + 2]!; mu += t[i * 2]!; mv += t[i * 2 + 1]!; }
  mx /= count; mz /= count; mu /= count; mv /= count;
  for (let i = 0; i < count; i++) { xu += (p[i * 3]! - mx) * (t[i * 2]! - mu); zv += (p[i * 3 + 2]! - mz) * (t[i * 2 + 1]! - mv); }
  const flipped = { u: xu < 0, v: zv > 0 };
  if (flipped.u || flipped.v) for (let i = 0; i < count; i++) {
    if (flipped.u) t[i * 2] = 1 - t[i * 2]!;
    if (flipped.v) t[i * 2 + 1] = 1 - t[i * 2 + 1]!;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(p, 3)); geometry.setAttribute('normal', new BufferAttribute(n, 3)); geometry.setAttribute('uv', new BufferAttribute(t, 2));
  const index = source.index.array, copy = count > 65535 ? new Uint32Array(index.length) : new Uint16Array(index.length);
  copy.set(index as ArrayLike<number>); geometry.setIndex(new BufferAttribute(copy, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.uvFlipped = flipped;
  return geometry;
}

export async function loadTerrain(index: TerrainIndex, fetchFile: FetchFile, o: TerrainOptions): Promise<Terrain> {
  const root = new Group(); root.name = 'terrain';
  const owned: { dispose(): void }[] = [], bitmaps: ImageBitmap[] = [];
  const vegetationRoot = new Group(); vegetationRoot.name = 'vegetation';
  const atlas = o.vegetation ? crownAtlasTexture() : null;
  const vegetation = { root: vegetationRoot, candidates: o.vegetation?.candidates.length ?? 0, cards: 0, dropped: 0, meshes: 0, bytes: 0, atlasBytes: atlas ? Math.round(atlas.image.width * atlas.image.height * 4 * 4 / 3) : 0 };
  if (atlas) owned.push(atlas);
  const dispose = () => { root.removeFromParent(); root.clear(); vegetationRoot.removeFromParent(); vegetationRoot.clear(); for (const item of owned) item.dispose(); for (const image of bitmaps) image.close(); owned.length = bitmaps.length = 0; };
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const levels = index.sets[o.set], entries = levels.flatMap(level => { const entry = index.levels[level]; if (!entry) throw new Error(`Terrain level ${level} is missing`); return entry.tiles.map(tile => ({ level, tile })); });
  let loaded = 0, triangles = 0, textureBytes = 0, uvFlipped = 0;
  const corridor = { tiles: 0, clipped: 0, pieces: 0 }, corridorLevels: readonly string[] = CORRIDOR_LEVELS;
  try {
    await MeshoptDecoder.ready;
    await Promise.all(entries.map(async ({ level, tile }) => {
      const [glb, albedoBytes, normalBytes] = await Promise.all([fetchFile(tile.glb, o.signal), fetchFile(tile.albedo, o.signal), fetchFile(tile.normal, o.signal)]);
      if (o.signal.aborted) throw o.signal.reason;
      const [gltf, albedoImage, normalImage] = await Promise.all([loader.parseAsync(glb, ''), bitmap(albedoBytes, 'image/webp'), bitmap(normalBytes, 'image/webp')]);
      bitmaps.push(albedoImage, normalImage);
      const meshes: Mesh[] = []; gltf.scene.traverse((node: Object3D) => { if ((node as Mesh).isMesh) meshes.push(node as Mesh); });
      if (meshes.length !== 1) throw new Error(`Terrain tile ${tile.key} has ${meshes.length} meshes`);
      let geometry = bakeTileGeometry(meshes[0]!), edited = false, scrub: ScrubTones | null = null;
      if (geometry.userData.uvFlipped.u || geometry.userData.uvFlipped.v) uvFlipped++;
      if (o.corridors?.length && corridorLevels.includes(level)) {
        const [x0, z0, x1, z1] = tile.bounds, near = o.corridors.filter(p => p.bbox[0] <= x1 && p.bbox[2] >= x0 && p.bbox[1] <= z1 && p.bbox[3] >= z0);
        const result = near.length ? corridorTileGeometry(geometry, near) : null;
        if (result) { geometry.dispose(); geometry = result.geometry; edited = true; scrub = result.scrub; corridor.tiles++; corridor.clipped += result.clipped; corridor.pieces += result.pieces; }
      }
      meshes[0]!.geometry.dispose(); (meshes[0]!.material as { dispose(): void }).dispose();
      const albedo = imageTexture(albedoImage, `${tile.key}-albedo`, true, o.anisotropy), normal = imageTexture(normalImage, `${tile.key}-normal`, false, o.anisotropy);
      const material = new TerrainMaterial({ map: albedo, normalMap: normal, normalMapType: ObjectSpaceNormalMap, roughness: .93, metalness: 0 });
      material.name = `terrain-${level}`; material.corridor = edited;
      if (scrub) material.colorNode = scrubColor(scrub);
      owned.push(geometry, albedo, normal, material);
      const mesh = new Mesh(geometry, material);
      mesh.name = `terrain-${tile.key}`; mesh.receiveShadow = o.receiveShadow; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
      mesh.layers.set(LAYERS.world);
      root.add(mesh);
      if (o.vegetation && atlas && corridorLevels.includes(level)) {
        const cardMaterial = vegetationMaterial({ albedo, bounds: tile.bounds, atlas, data: o.vegetation.data, fade: o.vegetation.fade, specular: TERRAIN_SPECULAR });
        const cards = vegetationTile(o.vegetation.candidates, tile.bounds, geometry.getAttribute('position').array, geometry.index!.array, o.vegetation.data, cardMaterial, tile.key);
        owned.push(cardMaterial, ...cards.meshes.map(m => m.geometry));
        for (const m of cards.meshes) { m.receiveShadow = o.receiveShadow; m.layers.set(LAYERS.world); vegetationRoot.add(m); }
        vegetation.cards += cards.cards; vegetation.dropped += cards.dropped; vegetation.meshes += cards.meshes.length; vegetation.bytes += cards.bytes;
      }
      triangles += (geometry.index?.count ?? 0) / 3;
      textureBytes += (albedoImage.width * albedoImage.height + normalImage.width * normalImage.height) * 4 * 4 / 3;
      o.onTile?.(++loaded, entries.length);
    }));
  } catch (error) { dispose(); throw error; }
  // Stable draw order regardless of network completion order.
  root.children.sort((a, b) => a.name.localeCompare(b.name));
  vegetationRoot.children.sort((a, b) => a.name.localeCompare(b.name));
  root.updateMatrixWorld(true); vegetationRoot.updateMatrixWorld(true);
  return { root, tiles: entries.length, triangles, textureBytes: Math.round(textureBytes), uvFlipped, corridor, vegetation, dispose };
}
