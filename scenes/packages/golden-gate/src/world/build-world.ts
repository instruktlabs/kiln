// Builds the Golden Gate world asynchronously: sky and light first, then terrain tiles and water maps
// in parallel through the verified pack reader, then the bridge, water and fog banks, and finally a
// pipeline pre-compile so the first frames do not stall. Every step checks the abort signal; a
// failed or aborted build releases everything it created.
import { Group, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import type { LoadedPack, PackReader } from '@kiln-scenes/scene-kit';
import type { GoldenGateKnobs } from '../tiers';
import { createAtmosphere } from './atmosphere';
import type { Atmosphere } from './atmosphere';
import { loadTerrain } from './terrain';
import { approachCorridorPlans } from './corridor';
import { parkedVehicles } from './dressing';
import { vegetationCandidates } from './vegetation';
import { LAYOUT } from '../data';
import { BRIDGE } from '../constants';
import type { SceneIndex, Terrain } from './terrain';
import { decodeWaterLevel } from './water-maps';
import { decodePng } from './png16';
import { heightFieldFromU16 } from './heightfield';
import type { HeightField } from './heightfield';
import { createBridge } from './bridge';
import type { Bridge } from './bridge';
import { createWater } from './water';
import type { Water } from './water';
import { createFogBanks } from './fog-banks';
import type { FogBanks } from './fog-banks';
import { sceneFogNode } from './fog';
import type { GoldenGatePreset } from '../presets';
import type { TrafficDensity } from '../tiers';
import { extractVehicle, VEHICLE_TYPES } from '../traffic/vehicle-models';
import type { VehicleModel, VehicleType } from '../traffic/vehicle-models';
import { createTraffic, paintLinear } from '../traffic/traffic';
import type { Traffic } from '../traffic/traffic';

export interface BuildContext {
  pack: LoadedPack; reader: PackReader; renderer: WebGPURenderer; scene: Scene; camera: PerspectiveCamera;
  knobs: GoldenGateKnobs; signal: AbortSignal;
  /** Deck traffic (on unless the `traffic` development parameter empties the lanes); density defaults to the tier's. */
  traffic?: { enabled: boolean; density?: TrafficDensity };
  onProgress?(loaded: number, total: number, text: string): void;
}
function abortIfNeeded(signal: AbortSignal): void { if (signal.aborted) throw signal.reason ?? new DOMException('Golden Gate build aborted', 'AbortError'); }
export function readSceneIndex(pack: LoadedPack): SceneIndex {
  const bytes = pack.data.get('scene');
  if (!bytes) throw new Error('Golden Gate scene index is missing from the verified pack');
  const index = JSON.parse(new TextDecoder().decode(bytes)) as SceneIndex;
  if (index.schema !== 'golden-gate-scene/1') throw new Error(`Unexpected scene index schema ${index.schema}`);
  return index;
}
export async function readCollisionField(pack: LoadedPack, index: SceneIndex): Promise<HeightField> {
  const bytes = pack.data.get('collision'), spec = index.terrain.collision;
  if (!bytes) throw new Error('Golden Gate collision grid is missing from the verified pack');
  const png = await decodePng(bytes);
  if (png.bitDepth !== 16 || png.channels !== 1 || png.width !== spec.size[0] || png.height !== spec.size[1]) throw new Error('Collision grid is not the expected 16-bit grey image');
  return heightFieldFromU16(png.data as Uint16Array, png.width, png.height, spec.bounds, spec.metresPerUnit);
}

export async function buildGoldenGateWorld(c: BuildContext) {
  const features = c.knobs.gg, index = readSceneIndex(c.pack), owned: { dispose(): void }[] = [];
  const release = () => { for (const item of owned.splice(0).reverse()) { try { item.dispose(); } catch { /* keep releasing */ } } };
  const tiles = index.terrain.sets[features.terrainSet].reduce((sum, level) => sum + (index.terrain.levels[level]?.tiles.length ?? 0), 0);
  const total = tiles + 7; let loaded = 0;
  const step = (text: string) => c.onProgress?.(++loaded, total, text);
  try {
    const atmosphere: Atmosphere = createAtmosphere(c.renderer, c.scene, { envSize: features.envSize, shadows: c.knobs.shadows.enabled, shadowMapSize: c.knobs.shadows.mapSize, shadowExtent: features.shadowExtent });
    owned.push(atmosphere); step('Sky and light');
    const fogNode = sceneFogNode(atmosphere.uniforms);
    const maps = index.terrain.water[features.terrainSet];
    const fetch = (path: string) => c.reader.fetchFile(path, c.signal);
    const settled = await Promise.allSettled([
      loadTerrain(index.terrain, (path, signal) => c.reader.fetchFile(path, signal), { set: features.terrainSet, anisotropy: features.water.anisotropy, receiveShadow: c.knobs.shadows.enabled, signal: c.signal, onTile: () => step('Terrain'), corridors: approachCorridorPlans(LAYOUT.approaches, BRIDGE.roadEndZ, LAYOUT.dressing),
        vegetation: { candidates: vegetationCandidates(LAYOUT.approaches, BRIDGE.roadEndZ, LAYOUT.dressing, features.vegetation.density), data: LAYOUT.dressing.vegetation, fade: features.vegetation.fade } }),
      readCollisionField(c.pack, index),
      Promise.all([fetch(maps.near.depth.path), fetch(maps.near.shore.path)]).then(([d, s]) => decodeWaterLevel(maps.near, d, s)),
      Promise.all([fetch(maps.mid.depth.path), fetch(maps.mid.shore.path)]).then(([d, s]) => decodeWaterLevel(maps.mid, d, s)),
    ] as const);
    // Release whatever the parallel loads created when any of them failed.
    const failed = settled.find(result => result.status === 'rejected');
    if (failed) {
      for (const result of settled) if (result.status === 'fulfilled') {
        const value = result.value as { dispose?(): void; level?: { texture: { dispose(): void } } };
        value.dispose?.(); value.level?.texture.dispose();
      }
      throw (failed as PromiseRejectedResult).reason;
    }
    const value = <T,>(result: PromiseSettledResult<T>) => (result as PromiseFulfilledResult<T>).value;
    const terrain: Terrain = value(settled[0]), field: HeightField = value(settled[1]), near = value(settled[2]), mid = value(settled[3]);
    owned.push(terrain);
    abortIfNeeded(c.signal); step('Water maps');
    const web = c.pack.models.get(index.bridge.web.model), far = c.pack.models.get(index.bridge.far.model);
    if (!web || !far) throw new Error('Bridge models are missing from the verified pack');
    const bridge: Bridge = createBridge(web, far, { farSwitch: features.bridgeFarSwitch, castShadow: c.knobs.shadows.enabled });
    owned.push(bridge); step('Bridge');
    // The vegetation impostors switch with the approaches' near representation (fix round 3 item 5).
    bridge.approachMeshes.near.group.add(terrain.vegetation.root);
    const water: Water = createWater(c.scene, { features: features.water, atmosphere, near: near.level, mid: mid.level, midGrid: mid.grid });
    owned.push(water); step('Water');
    const banks: FogBanks | null = features.fogBanks > 0 ? createFogBanks(atmosphere.uniforms, water.textures.macroNoise, features.fogBanks) : null;
    if (banks) owned.push(banks);
    // Traffic on the approved vehicles: MSFT_lod levels read through each GLTF's parser. The driven
    // sedan draws with the traffic, so the vehicles load even when the development parameter empties the lanes.
    const vehicles = index.vehicles;
    const models = new Map<VehicleType, VehicleModel>();
    for (const type of VEHICLE_TYPES) {
      // All six approved vehicles are required; there is no placeholder geometry.
      const gltf = vehicles[type] ? c.pack.models.get(vehicles[type].model) : undefined;
      if (!gltf) throw new Error(`Vehicle ${type} is missing from the verified pack`);
      const { model, release } = await extractVehicle(type, gltf); release();
      models.set(type, model); abortIfNeeded(c.signal);
    }
    // Vista Point's parked cars (layout.json dressing) stay whether or not the lanes carry traffic.
    const parked = parkedVehicles(LAYOUT.approaches, BRIDGE.roadEndZ, LAYOUT.dressing).map(p => {
      const type = VEHICLE_TYPES.find(t => t === p.type); if (!type) throw new Error(`layout.json dressing.vista.cars: unknown vehicle ${p.type}`);
      return { type, x: p.x, y: p.y, z: p.z, yaw: p.yaw, paint: paintLinear(p.paint) };
    });
    const traffic: Traffic = createTraffic({ models, route: bridge.route, density: c.traffic?.density ?? features.traffic.density,
      perLaneMax: c.traffic?.enabled === false ? 0 : features.traffic.perLaneMax, lod: features.traffic.lod, shadows: c.knobs.shadows.enabled, contactShadow: features.traffic.contactShadow, parked });
    owned.push(traffic);
    step('Traffic');
    const root = new Group(); root.name = 'golden-gate-world';
    root.add(terrain.root, bridge.root, traffic.root); if (banks) root.add(banks.sprite);
    c.scene.add(root); owned.push({ dispose: () => root.removeFromParent() });
    c.scene.fogNode = fogNode;
    // No compileAsync here: its pass has no depth copy yet, so depth-reading materials (water contact,
    // fog banks) would bind a single-sampled placeholder against a multisampled layout.
    abortIfNeeded(c.signal); step('Shaders');
    const focus = new Vector3();
    const stats = {
      tier: features.feature, terrainTiles: terrain.tiles, terrainTriangles: terrain.triangles, terrainTextureBytes: terrain.textureBytes, terrainUvFlipped: terrain.uvFlipped, terrainCorridor: terrain.corridor,
      bridge: bridge.stats, fogBankPuffs: banks?.puffs ?? 0, water: water.stats,
      vegetation: { candidates: terrain.vegetation.candidates, cards: terrain.vegetation.cards, dropped: terrain.vegetation.dropped, meshes: terrain.vegetation.meshes, bytes: terrain.vegetation.bytes, atlasBytes: terrain.vegetation.atlasBytes },
      vehicles: [...models.values()].map(m => ({ type: m.type, triangles: m.triangles, length: +m.length.toFixed(3), wheelRadius: m.wheelRadius })),
    };
    let vehicleLights = 0;
    const world = {
      index, atmosphere, terrain, field, bridge, water, banks, traffic, models, root, fogNode, stats, focus,
      credits: c.pack.manifest.credits ?? [],
      /** Presets: atmosphere, water wind and lamps (called while blending and once per change). */
      applyPreset(p: GoldenGatePreset, force = false) {
        atmosphere.apply(p, performance.now() / 1000, force);
        water.uniforms.wind.value = p.wind; water.uniforms.envIntensity.value = p.envIntensity;
        bridge.setLamps(p.lamps); vehicleLights = p.lights;
      },
      /** Per frame after the cameras: view-dependent state. */
      update(camera: PerspectiveCamera, time: number, bankOpacity: number, delta: number) {
        if (c.scene.fogNode !== fogNode) c.scene.fogNode = fogNode; // the kit's look may reset it
        atmosphere.hideSunFor(water.reflectionCamera(camera));
        atmosphere.update(camera, focus, performance.now() / 1000); // wall clock: environment throttle only
        water.update(camera, time);
        bridge.update(camera.position);
        banks?.update(time, bankOpacity);
        traffic.update(camera, delta, vehicleLights);
      },
      dispose() { if (c.scene.fogNode === fogNode) c.scene.fogNode = null; release(); },
    };
    return world;
  } catch (error) { release(); throw error; }
}
export type GoldenGateWorld = Awaited<ReturnType<typeof buildGoldenGateWorld>>;
