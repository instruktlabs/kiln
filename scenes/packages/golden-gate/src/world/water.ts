// Water assembly (WATER-SPEC): data maps and the derived ebb field, the detail and macro textures,
// the geometry clipmap mesh on its own layer, the planar reflector on High, and the per-frame
// tile selection and uniform update.
import { Frustum, Matrix4, Mesh } from 'three/webgpu';
import type { Camera, DataTexture, PerspectiveCamera, Scene } from 'three/webgpu';
import { reflector } from 'three/tsl';
import { createTileGeometry, maxTiles, selectTiles } from './water-mesh';
import type { ClipmapOptions } from './water-mesh';
import { createWaterMaterial, createWaterUniforms, describeWater, updateWaterUniforms } from './water-material';
import type { WaterUniforms } from './water-material';
import { deriveFlowField, flowTexture, FLOW_DEFAULTS } from './water-maps';
import type { WaterGrid, WaterMapLevel } from './water-maps';
import { macroNoiseTexture, slopeMomentTexture, synthesizeSlopes } from './detail-textures';
import type { Atmosphere } from './atmosphere';
import type { GoldenGateFeatures } from '../tiers';
import { LAYERS } from '../constants';

export interface WaterOptions {
  features: GoldenGateFeatures['water'];
  atmosphere: Atmosphere;
  near: WaterMapLevel; mid: WaterMapLevel; midGrid: WaterGrid;
}
export interface Water {
  mesh: Mesh; uniforms: WaterUniforms; clipmap: ClipmapOptions;
  textures: { macroNoise: DataTexture; slopeMoments: DataTexture; flow: DataTexture };
  /** The reflector's virtual camera (High), so the sky can hide its sun disc there. */
  reflectionCamera(camera: Camera): Camera | null;
  update(camera: PerspectiveCamera, time: number): void;
  readonly stats: { tiles: number; maxTiles: number; vertices: number; reflection: string; description: ReturnType<typeof describeWater> };
  dispose(): void;
}

export function createWater(scene: Scene, o: WaterOptions): Water {
  const f = o.features, clipmap: ClipmapOptions = { grid: f.grid, tile0: f.tile0, levels: f.levels, halfTiles: 4 };
  const owned: { dispose(): void }[] = [];
  const flowField = deriveFlowField(o.midGrid, FLOW_DEFAULTS), flow = flowTexture(flowField, FLOW_DEFAULTS.size);
  const slopeMoments = slopeMomentTexture(synthesizeSlopes(256, 1), f.anisotropy), macroNoise = macroNoiseTexture(f.anisotropy);
  owned.push(flow, slopeMoments, macroNoise, o.near.texture, o.mid.texture);
  const uniforms = createWaterUniforms();
  uniforms.displaceRadius.value = f.displaceRadius;

  let reflection: ReturnType<typeof reflector> | null = null;
  if (f.reflection === 'planar') {
    reflection = reflector({ resolutionScale: f.reflectionScale, generateMipmaps: true, bounces: false, depth: false });
    reflection.target.rotateX(-Math.PI / 2); reflection.target.name = 'water-reflector';
    scene.add(reflection.target);
  }
  const options = {
    atmosphere: o.atmosphere.uniforms, grid: f.grid, displacedWaves: f.displacedWaves, fragmentWaves: f.fragmentWaves, detailLayers: f.detailLayers,
    reflection: f.reflection, reflectionNode: reflection ?? undefined, environment: o.atmosphere.environment, depthContact: f.depthContact, waveFade: f.waveFade,
    near: { texture: o.near.texture as DataTexture, bounds: o.near.bounds }, mid: { texture: o.mid.texture as DataTexture, bounds: o.mid.bounds },
    flow: { texture: flow, bounds: o.midGrid.bounds }, slopeMoments, macroNoise,
  };
  const material = createWaterMaterial(options, uniforms), geometry = createTileGeometry(clipmap);
  owned.push(material, geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'water'; mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.layers.set(LAYERS.water);
  mesh.castShadow = mesh.receiveShadow = false;
  scene.add(mesh);

  const patches = geometry.getAttribute('tilePatch') as unknown as { array: Float32Array; needsUpdate: boolean; clearUpdateRanges(): void; addUpdateRange(start: number, count: number): void };
  const frustum = new Frustum(), projection = new Matrix4();
  const stats = { tiles: 0, maxTiles: maxTiles(clipmap), vertices: 0, reflection: f.reflection, description: describeWater(options) };
  return {
    mesh, uniforms, clipmap, textures: { macroNoise, slopeMoments, flow },
    reflectionCamera(camera) { return reflection ? (reflection as unknown as { reflector: { getVirtualCamera(c: Camera): Camera } }).reflector.getVirtualCamera(camera) : null; },
    update(camera, time) {
      camera.updateMatrixWorld();
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projection);
      const count = selectTiles(clipmap, camera.position.x, camera.position.z, patches.array, frustum, 3);
      geometry.instanceCount = count;
      patches.clearUpdateRanges(); patches.addUpdateRange(0, count * 4); patches.needsUpdate = true;
      updateWaterUniforms(uniforms, time, camera.position.x, camera.position.z);
      stats.tiles = count; stats.vertices = count * (clipmap.grid + 1) ** 2;
    },
    stats,
    dispose() {
      mesh.removeFromParent(); reflection?.target.removeFromParent();
      (reflection as unknown as { dispose?(): void } | null)?.dispose?.();
      for (const item of owned) item.dispose();
    },
  };
}
