import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, Quaternion, RepeatWrapping, Vector3 } from 'three/webgpu';
import type { DirectionalLight, Material, MeshStandardMaterial, Object3D } from 'three/webgpu';
import { useEffect, useRef } from 'react';
import { useLoadedPack, useSceneBuilt, useBuilt, SystemOrder, useSystem, useQuality, useReducedMotion } from '@kiln-scenes/scene-kit';
import type { LoadedPack } from '@kiln-scenes/scene-kit';
import { mergeRigidByMaterial } from '@kiln-scenes/scene-kit/instancing';
import type { RigidMerge } from '@kiln-scenes/scene-kit/instancing';
import { smallCasterThreshold } from '@kiln-scenes/scene-kit/shadows';
import { HIDDEN_PARTS, HIDDEN_PREFIX, TOWN_COUNTS, placements, town } from './layout';
import type { Placement } from './layout';
import { currentSun } from './lighting';
import { buildRouteCollision } from './colliders';
import type { CollisionWorld } from '@kiln-scenes/scene-kit/collision';
import { buildCrucifixPlacements, buildPewPlacements } from './furnishings';
import { buildStainedLight } from './stained-light';
import { buildCandles } from './candles';
import { createSanctuaryGoldBinding } from './sanctuary-gold';

const hidden = new Set<string>(HIDDEN_PARTS);
const up = new Vector3(0, 1, 0);
const TINTS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1], [1.04, 0.97, 0.88], [0.97, 0.99, 1.03], [1.05, 0.93, 0.86],
  [0.95, 0.97, 0.92], [1.03, 1, 0.94], [0.92, 0.9, 0.88],
];
const REPEAT: Record<string, number> = { Paving_Flags: 4.8, Paving_Cobbles: 2.4, Paving_Soil: 4, Paving_Granite: 1 };
const LAYER: Record<string, number> = { Paving_Cobbles: 0, Paving_Soil: 1, Paving_Flags: 1, Paving_Granite: 2 };
const PAVING_Y = 0.008;

export interface TownStats {
  houses: number; props: number; streets: number; lanes: number; blocks: number;
  draws: number; triangles: number; paving: number;
}

export let townStats: TownStats = {
  houses: TOWN_COUNTS.houses, props: TOWN_COUNTS.props, streets: TOWN_COUNTS.streets,
  lanes: TOWN_COUNTS.lanes, blocks: TOWN_COUNTS.blocks, draws: 0, triangles: 0, paving: 0,
};

/** Published only while its matching scene world is mounted; Eyes never owns this BVH. */
export let squareCollision: CollisionWorld | null = null;
export let squareInteriorOccluders: readonly Object3D[] | null = null;
export let squareGold: ReturnType<typeof createSanctuaryGoldBinding> | null = null;
export let squareLightStats: ReturnType<typeof buildStainedLight>['stats'] | null = null;

function model(pack: LoadedPack, id: string): GLTF {
  const gltf = pack.models.get(id);
  if (!gltf) throw new Error(`Cathedral square pack is missing ${id}`);
  return gltf;
}

function presentCathedral(gltf: GLTF): RigidMerge | null {
  gltf.scene.traverse(node => {
    if (hidden.has(node.name) || node.name.startsWith(HIDDEN_PREFIX)) node.visible = false;
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as (MeshStandardMaterial & { transmission?: number }) | undefined;
    const glass = material?.transparent === true || (material?.transmission ?? 0) > 0 || /Glass|Stained/.test(material?.name ?? '');
    mesh.castShadow = !glass;
    mesh.receiveShadow = true;
  });
  try {
    return mergeRigidByMaterial(gltf.scene, { isAnchor: () => false });
  } catch (error) {
    console.warn('Cathedral parts stayed separate', error);
    return null;
  }
}

/** Identical kit materials (same name and textures) become one material. Plaster keeps its own copy so instance tints stay per mesh. */
function shareMaterial(material: Material, shared: Map<string, Material>): Material {
  const standard = material as MeshStandardMaterial;
  if (/Plaster|Paint/.test(material.name ?? '')) return material;
  const maps = [standard.map, standard.normalMap, standard.roughnessMap, standard.metalnessMap, standard.aoMap].map(map => map?.uuid ?? '').join('|');
  const key = `${material.type}|${material.name}|${maps}`;
  const existing = shared.get(key);
  if (existing) return existing;
  shared.set(key, material);
  return material;
}

function prepareKitMaterial(material: Material): void {
  const standard = material as MeshStandardMaterial & { userData: { squareShadow?: boolean } };
  if (standard.userData.squareShadow) return;
  standard.userData.squareShadow = true;
  standard.shadowSide = DoubleSide;
}

function instances(gltf: GLTF, key: string, places: Placement[], shared: Map<string, Material>): InstancedMesh[] {
  gltf.scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  gltf.scene.traverse(node => { const mesh = node as Mesh; if (mesh.isMesh) meshes.push(mesh); });
  const built: InstancedMesh[] = [];
  const placement = new Matrix4(), matrix = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), tint = new Color();
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    if (!geometry.getAttribute('position')) continue;
    if (geometry.getAttribute('tangent')) geometry.deleteAttribute('tangent');
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!source) continue;
    prepareKitMaterial(source);
    const material = shareMaterial(source, shared);
    const tinted = /Plaster|Paint/.test(material.name ?? '');
    const instanced = new InstancedMesh(geometry, material, places.length);
    instanced.name = `${key}:${mesh.name}`;
    const glass = (material as MeshStandardMaterial).transparent === true;
    instanced.castShadow = !glass;
    instanced.receiveShadow = true;
    instanced.frustumCulled = true;
    places.forEach((place, i) => {
      q.setFromAxisAngle(up, place.rotation);
      s.setScalar(place.scale ?? 1);
      p.set(place.x, place.y ?? 0, place.z);
      placement.compose(p, q, s);
      matrix.multiplyMatrices(placement, mesh.matrixWorld);
      instanced.setMatrixAt(i, matrix);
      if (tinted) {
        const color = TINTS[(place.variant ?? i) % TINTS.length]!;
        tint.setRGB(color[0], color[1], color[2]);
        instanced.setColorAt(i, tint);
      }
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.computeBoundingSphere();
    built.push(instanced);
  }
  if (!built.length) throw new Error(`Town kit model ${key} has no meshes`);
  return built;
}

function polygonsOf(list: readonly ([number, number][] | null)[]): [number, number][][] {
  return list.filter((polygon): polygon is [number, number][] => !!polygon && polygon.length >= 3);
}

/** Street and precinct paving from the layout polygons, using the ground swatch. */
function buildGround(gltf: GLTF): { group: Group; meshes: number } {
  const materials = new Map<string, MeshStandardMaterial>();
  gltf.scene.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial | undefined;
    if (material?.name) materials.set(material.name, material);
  });
  const group = new Group();
  group.name = 'Paving';
  const lists: [string, [number, number][][]][] = [
    ['Paving_Cobbles', polygonsOf(town.paving.cobbles)],
    ['Paving_Flags', polygonsOf(town.paving.flags)],
    ['Paving_Soil', polygonsOf(town.paving.soil)],
    ['Paving_Granite', polygonsOf(town.paving.granite)],
  ];
  let meshes = 0;
  for (const [name, polygons] of lists) {
    const source = materials.get(name);
    if (!source || !polygons.length) continue;
    const material = source.clone();
    material.name = name;
    const layer = LAYER[name] ?? 0;
    material.polygonOffset = layer > 0;
    material.polygonOffsetFactor = -layer;
    material.polygonOffsetUnits = -4 * layer;
    if (name === 'Paving_Flags') material.color.multiplyScalar(0.5);
    for (const map of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap]) {
      if (!map) continue;
      const copy = map.clone();
      copy.wrapS = copy.wrapT = RepeatWrapping;
      copy.repeat.set(1, 1);
      copy.anisotropy = 8;
      copy.needsUpdate = true;
      if (map === material.map) material.map = copy;
      else if (map === material.normalMap) material.normalMap = copy;
      else if (map === material.roughnessMap) material.roughnessMap = copy;
      else if (map === material.metalnessMap) material.metalnessMap = copy;
      else material.aoMap = copy;
    }
    const repeat = REPEAT[name] ?? 4;
    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const index: number[] = [];
    for (const polygon of polygons) {
      const base = positions.length / 3;
      for (const [x, z] of polygon) {
        positions.push(x, PAVING_Y, z);
        normals.push(0, 1, 0);
        uvs.push(x / repeat, -z / repeat);
      }
      for (let k = 1; k + 1 < polygon.length; k++) index.push(base, base + k + 1, base + k);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(index);
    geometry.computeTangents();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = layer;
    mesh.userData.squareOwned = true;
    group.add(mesh);
    meshes += 1;
  }
  if (!meshes) throw new Error('Town paving produced no ground');
  return { group, meshes };
}

export function buildSquare(pack: LoadedPack, candleOptions = { shadows: true, tier: 'high' }): { root: Group; collision: CollisionWorld; gold: ReturnType<typeof createSanctuaryGoldBinding>; interiorOccluders: readonly Object3D[]; lightStats: ReturnType<typeof buildStainedLight>['stats']; bindSun(light: DirectionalLight): void; updateCandles(time: number, reduced: boolean): void; dispose(): void } {
  const root = new Group();
  root.name = 'Cathedral square';
  let collision: CollisionWorld | null = null;
  let stainedLight: ReturnType<typeof buildStainedLight> | null = null;
  let candles: ReturnType<typeof buildCandles> | null = null;
  let merged: RigidMerge | null = null, mergedFurnishings: RigidMerge | null = null;
  let gold: ReturnType<typeof createSanctuaryGoldBinding> | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    if (squareCollision === collision) squareCollision = null;
    if (squareLightStats === stainedLight?.stats) squareLightStats = null;
    collision?.dispose();
    stainedLight?.dispose();
    candles?.dispose();
    root.removeFromParent();
    merged?.restore();
    mergedFurnishings?.restore();
    gold?.dispose();
    root.traverse(node => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || mesh.userData.squareOwned !== true) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const mapped = material as MeshStandardMaterial;
        mapped.map?.dispose(); mapped.normalMap?.dispose(); mapped.roughnessMap?.dispose();
        mapped.metalnessMap?.dispose(); mapped.aoMap?.dispose(); mapped.dispose();
      }
    });
    root.clear();
  };
  try {
  const cathedral = model(pack, 'cathedral');
  const furnishings = buildCrucifixPlacements(model(pack, 'crucifix').scene, cathedral.scene);
  gold = createSanctuaryGoldBinding(cathedral.scene, furnishings);
  root.add(furnishings);
  furnishings.add(buildPewPlacements(model(pack, 'nave-pew').scene));
  furnishings.traverse(node => {
    const mesh = node as Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  collision = buildRouteCollision(cathedral.scene, furnishings);
  stainedLight = buildStainedLight(cathedral.scene, furnishings);
  candles = buildCandles(cathedral.scene, candleOptions);
  merged = presentCathedral(cathedral);
  root.add(cathedral.scene);
  root.add(furnishings);
  root.add(stainedLight.root);
  root.add(candles.root);
  root.userData.candleStats = candles.stats;
  mergedFurnishings = mergeRigidByMaterial(furnishings, { isAnchor: () => false });
  const ground = buildGround(model(pack, 'ground'));
  root.add(ground.group);
  const byKey = new Map<string, Placement[]>();
  for (const place of placements) {
    const list = byKey.get(place.key) ?? [];
    list.push(place);
    byKey.set(place.key, list);
  }
  const shared = new Map<string, Material>();
  let draws = 0;
  let triangles = 0;
  for (const [key, places] of byKey) {
    for (const mesh of instances(model(pack, key), key, places, shared)) {
      root.add(mesh);
      draws += 1;
      const geometry = mesh.geometry;
      const count = geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
      triangles += count / 3 * mesh.count;
    }
  }
  townStats = { ...TOWN_COUNTS, draws, triangles, paving: ground.meshes };
  root.userData.townStats = townStats;
  return { root, collision, gold, interiorOccluders: [cathedral.scene, furnishings], lightStats: stainedLight.stats, bindSun: stainedLight.bindSun, updateCandles: candles.update, dispose };
  } catch (error) { dispose(); throw error; }
}

interface ShadowBind { cache: object; untrack(): void; restore(): void }

export function SquareWorld() {
  const pack = useLoadedPack();
  const markBuilt = useSceneBuilt();
  const quality = useQuality(), reduced = useReducedMotion();
  const world = useBuilt(() => buildSquare(pack, { shadows: quality.knobs.shadows.enabled, tier: quality.tier }), value => value.dispose(), [pack, quality.knobs.shadows.enabled, quality.tier]);
  const shadow = useRef<ShadowBind | null>(null);
  useEffect(() => {
    if (!world) return;
    squareCollision = world.collision;
    squareInteriorOccluders = world.interiorOccluders;
    squareGold = world.gold;
    squareLightStats = world.lightStats;
    markBuilt(true);
    return () => {
      if (squareCollision === world.collision) squareCollision = null;
      if (squareInteriorOccluders === world.interiorOccluders) squareInteriorOccluders = null;
      if (squareGold === world.gold) squareGold = null;
      if (squareLightStats === world.lightStats) squareLightStats = null;
      markBuilt(false);
    };
  }, [world, markBuilt]);
  useSystem('cathedral-candle-flicker', SystemOrder.mixers, (_dt, elapsed) => { world?.updateCandles(elapsed, reduced); });
  useSystem('cathedral-shadow-track', SystemOrder.shadows - 1, () => {
    if (!world) return;
    const sun = currentSun();
    if (sun) world.bindSun(sun.light);
    if (shadow.current && shadow.current.cache !== sun?.cache) {
      shadow.current.untrack(); shadow.current.restore(); shadow.current = null;
    }
    if (!sun?.cache || shadow.current) return;
    const threshold = smallCasterThreshold(world.root, sun.light, {
      minTexels: 2,
      onChange() { sun.cache?.invalidate('casters'); },
    });
    const tracked = sun.cache.track(world.root);
    sun.cache.invalidate('town');
    shadow.current = { cache: sun.cache, untrack: () => tracked.untrack(), restore: () => threshold.restore() };
  });
  useEffect(() => () => {
    shadow.current?.untrack();
    shadow.current?.restore();
    shadow.current = null;
  }, [world]);
  return world ? <primitive object={world.root} dispose={null} /> : null;
}
