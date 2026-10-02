import { Mesh, Scene } from 'three/webgpu';
import type { MeshStandardMaterial, Texture } from 'three/webgpu';
import { assertInstancingSafe, DisposeRegistry, poolTextures } from '@kiln-scenes/scene-kit';
import type { LoadedPack, SceneClock, TierKnobs } from '@kiln-scenes/scene-kit';
import { makeTerrainGeometry } from './terrain';
import { makeSurroundingTerrainGeometry } from './landscape';
import { addWoodland } from './woodland';
import { makeStreamGeometry } from './stream-geometry';
import { createStreamMaterial } from './stream-material';
import { makeBridge } from './bridge';
import { createGroundMaterials } from './meadow';
import { createFarmGrass } from './grass';
import { buildPlacements, setCropShadows } from './placements';
import { createHerdMotion } from '../play/herd';
import { decodeFarmLayout } from './prepare';
import type { PreparedFarm } from './prepare';
import { optimizeFarmWorld } from './optimize';
import { buildFarmColliders } from './colliders';
import { createFarmSim } from '../play/sim';

/** S4b `heroMerge` (default on); S4 `shadow`, hero stand-ins and the small-caster threshold, applied on tiers with shadows. */
export interface FarmBuildOptions { woodlandTangents?: boolean; prepared?: PreparedFarm | null; optimize?: boolean; heroMerge?: boolean; shadow?: { standIns: boolean; minCasterTexels: number } }
export function readFarmLayout(pack: LoadedPack) {
  const bytes = pack.data.get('layout');
  if (!bytes) throw new Error('Farm layout is missing from the verified pack');
  return decodeFarmLayout(bytes);
}
/** Assemble the world, then preserve the pilot's batching/freezing policy. */
export function buildFarmWorld(pack: LoadedPack, knobs: TierKnobs, clock: SceneClock, options: FarmBuildOptions = {}) {
  const root = new Scene(); root.name = 'Farm world';
  const registry = new DisposeRegistry(), prepared = options.prepared, layout = prepared?.layout ?? readFarmLayout(pack);
  try {
    // Promise completion order is nondeterministic; the pilot pools in manifest order.
    const texturePooling = poolTextures(pack.manifest.models.map(model => pack.models.get(model.id)!), pack.imageHashes);
    const soilSource = pack.models.get('cabbage-stage-1')?.scene.getObjectByName('Mesh_SoilMound') as Mesh | undefined;
    const tree = pack.models.get('faceted-tree')?.scene;
    const timber = pack.models.get('watermill')?.scene.getObjectByName('Mesh_Building_Wood') as Mesh | undefined;
    if (!soilSource || !tree || !timber || Array.isArray(soilSource.material) || Array.isArray(timber.material)) throw new Error('Required Farm presentation materials are missing');
    const materials = createGroundMaterials(soilSource.material as MeshStandardMaterial, prepared?.meadow);
    for (const material of materials) registry.add(material);
    // Meadow pixels are newly owned. The path/soil clones retain pack-owned maps.
    const meadowTextures = new Set<Texture>();
    for (const value of Object.values(materials[0])) if ((value as Texture | null)?.isTexture) meadowTextures.add(value as Texture);
    for (const texture of meadowTextures) registry.add(texture);
    const ground = new Mesh(prepared?.terrain ?? makeTerrainGeometry(layout), materials);
    ground.name = 'Farm terrain and paths'; ground.receiveShadow = true; if (!prepared) registry.add(ground.geometry); root.add(ground);
    const surrounding = new Mesh(prepared?.surrounding ?? makeSurroundingTerrainGeometry(), [materials[0], materials[2]]);
    surrounding.name = 'Continuous countryside'; surrounding.receiveShadow = true; if (!prepared) registry.add(surrounding.geometry); root.add(surrounding);
    const woodland = addWoodland(root, tree, { tangentSafe: options.woodlandTangents !== false, points: prepared?.woodland }); registry.add(woodland);
    if (!knobs.shadows.enabled) for (const mesh of woodland.meshes) mesh.castShadow = false;
    const water = new Mesh(prepared?.stream ?? makeStreamGeometry([ground.geometry, surrounding.geometry]), createStreamMaterial(clock));
    water.name = 'Farm flowing stream'; water.receiveShadow = true; water.renderOrder = 2;
    if (!prepared) registry.add(water.geometry); registry.add(water.material); root.add(water);
    const bridge = makeBridge(timber.material); registry.add(bridge.geometry); root.add(bridge);
    const grass = createFarmGrass(pack, clock, knobs); registry.add(grass);
    for (const layer of grass.layers) root.add(layer.mesh);
    const placements = buildPlacements(pack, layout); registry.add(placements);
    while (placements.root.children.length) root.add(placements.root.children[0]);
    // Pilot order (SPEC 12.3): the collision world and play controller follow the placements and
    // precede the herd, the initial clips and batching. The prepared soup is the ground's own
    // world-space triangles (section 6.4), registered through an off-scene proxy mesh.
    const groundCollider = prepared ? new Mesh(prepared.groundCollision, materials[0]) : ground;
    groundCollider.name = ground.name;
    const colliders = buildFarmColliders({ ground: groundCollider, bridge, instances: placements.instances }); registry.add(colliders);
    const sim = createFarmSim({ instances: placements.instances, colliders }); registry.add(sim);
    const herd = createHerdMotion({ instances: placements.instances }); registry.add(herd);
    placements.initializeClips();
    // This material/shadow policy is required for the static visual baseline,
    // independently of whether placement batching has been enabled yet.
    setCropShadows(placements.instances, false, false);
    root.updateMatrixWorld(true);
    const optimization = options.optimize === false ? null : optimizeFarmWorld(root, placements.instances, woodland, { packWoodland: knobs.shadows.enabled,
      heroMerge: options.heroMerge, shadow: knobs.shadows.enabled && options.shadow ? { mapSize: knobs.shadows.mapSize, ...options.shadow } : null });
    if (optimization) registry.add(optimization.restore);
    if ((import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) && !(options.optimize === false && options.woodlandTangents === false)) {
      const offenders = assertInstancingSafe(root);
      if (offenders.length) throw new Error('Unsafe Farm instancing: ' + offenders.join(', '));
    }
    const stats = {
      stage: optimization ? 'M2b optimized' : 'M2a pre-batching', placements: placements.instances.length, layoutEntries: layout.placements.length,
      woodlandTrees: woodland.trees, woodlandCells: woodland.cells, woodlandMeshes: woodland.meshes.length,
      grassTufts: grass.stats.tufts, grassMeshes: grass.stats.chunks, texturePooling, optimization: optimization?.stats ?? null,
      terrainVertices: ground.geometry.getAttribute('position').count,
      terrainTriangles: (ground.geometry.index?.count ?? ground.geometry.getAttribute('position').count) / 3,
      surroundingTriangles: (surrounding.geometry.index?.count ?? surrounding.geometry.getAttribute('position').count) / 3,
      streamTriangles: (water.geometry.index?.count ?? water.geometry.getAttribute('position').count) / 3,
      bridgeTriangles: (bridge.geometry.index?.count ?? bridge.geometry.getAttribute('position').count) / 3,
      colliders: colliders.stats,
    };
    return { root, registry, layout, ground, surrounding, woodland, water, bridge, grass, placements, herd, colliders, sim, optimization, stats,
      dispose() { root.removeFromParent(); registry.disposeAll(); root.clear(); },
    };
  } catch (error) { registry.disposeAll(); root.clear(); throw error; }
}
export type FarmWorld = ReturnType<typeof buildFarmWorld>;
