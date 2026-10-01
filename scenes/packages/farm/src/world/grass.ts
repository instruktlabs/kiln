import { float } from 'three/tsl';
import { createTimeNode, DisposeRegistry } from '@kiln-scenes/scene-kit';
import type { LoadedPack, SceneClock, TierKnobs } from '@kiln-scenes/scene-kit';
import { createGrassLayer, decodeTufts, STORYBOOK_GRASS_PRESET } from '../../vendor/field-grass/src';
import type { GrassLayer, GrassManifest } from '../../vendor/field-grass/src';
import { FARM_GRASS } from '../constants';

/** INV 5.7: sealed tuft12 data, the original palette/style and grown cell bounds. */
export function createFarmGrass(pack: LoadedPack, clock: SceneClock, knobs: TierKnobs) {
  const manifestBytes = pack.data.get('grass'), bytes = pack.data.get('grassBin');
  if (!manifestBytes || !bytes) throw new Error('Farm grass data is missing from the verified pack');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as GrassManifest;
  if (manifest.version !== 1 || manifest.format !== 'tuft12' || manifest.stride !== 12 || !Array.isArray(manifest.groups)) throw new Error('Unsupported Farm grass manifest');
  const layers: GrassLayer[] = [], registry = new DisposeRegistry();
  const timeNode = knobs.effects.wind ? createTimeNode(clock, 'ambient') : float(0);
  try {
    for (const group of manifest.groups) {
      const buffers = decodeTufts(bytes, manifest, group);
      const layer = createGrassLayer(buffers, {
        preset: STORYBOOK_GRASS_PRESET, name: group.id, timeNode,
        palette: FARM_GRASS.palette,
        style: { ...STORYBOOK_GRASS_PRESET.style, tipGold: FARM_GRASS.tipGold, windReach: FARM_GRASS.windReach },
      });
      registry.add(layer); layers.push(layer);
      layer.mesh.computeBoundingSphere();
      if (layer.mesh.boundingSphere) layer.mesh.boundingSphere.radius += FARM_GRASS.sphereGrowth;
      layer.mesh.frustumCulled = true;
    }
  } catch (error) { registry.disposeAll(); throw error; }
  const setDensity = (fraction: number) => { for (const layer of layers) layer.mesh.count = Math.floor(layer.mesh.instanceMatrix.count * fraction); };
  setDensity(knobs.vegetationDensity);
  return {
    layers, stats: { tufts: manifest.groups.reduce((count, group) => count + group.count, 0), chunks: layers.length },
    setDensity, dispose() { registry.disposeAll(); layers.length = 0; },
  };
}
