import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { DisposeRegistry } from '@kiln-scenes/scene-kit';
import type { SceneDataPreparationContext } from '@kiln-scenes/scene-kit';
import type { FarmLayout } from './types';
import { makeTerrainGeometry } from './terrain';
import { makeSurroundingTerrainGeometry } from './landscape';
import { makeStreamGeometry } from './stream-geometry';
import { woodlandPlacements } from './woodland';
import { meadowPixels } from './meadow';

export function decodeFarmLayout(bytes: ArrayBuffer): FarmLayout {
  const layout = JSON.parse(new TextDecoder().decode(bytes)) as FarmLayout;
  if (layout.version !== 2 || !Array.isArray(layout.placements) || !layout.presentation || !layout.views) throw new Error('Unsupported Farm layout');
  return layout;
}
/** No model, renderer, material or GPU dependency: runs when verified layout arrives. */
export function prepareFarm(layoutBytes: ArrayBuffer) {
  const registry = new DisposeRegistry(), layout = decodeFarmLayout(layoutBytes);
  try {
    const terrain = makeTerrainGeometry(layout); registry.add(terrain);
    const surrounding = makeSurroundingTerrainGeometry(); registry.add(surrounding);
    const stream = makeStreamGeometry([terrain, surrounding]); registry.add(stream);
    // Farm's ground collider is world-space identity. Other collision sources require GLBs.
    const position = terrain.getAttribute('position'), index = terrain.index;
    const soup = new Float32Array((index?.count ?? position.count) * 3);
    for (let i = 0; i < soup.length / 3; i++) {
      const at = index ? index.getX(i) : i;
      soup[i * 3] = position.getX(at); soup[i * 3 + 1] = position.getY(at); soup[i * 3 + 2] = position.getZ(at);
    }
    const groundCollision = new BufferGeometry(); groundCollision.setAttribute('position', new BufferAttribute(soup, 3)); registry.add(groundCollision);
    const woodland = woodlandPlacements(), meadow = meadowPixels();
    return { layout, terrain, surrounding, stream, groundCollision, woodland, meadow, dispose: () => registry.disposeAll() };
  } catch (error) { registry.disposeAll(); throw error; }
}
export type PreparedFarm = ReturnType<typeof prepareFarm>;
// A previous renderer can finish cleanup after its replacement mount starts.
// Cache identity therefore includes the owning mount registry, not just the session holder.
const preparedOwners = new WeakMap<PreparedFarm, DisposeRegistry>();
export function prepareFarmData(holder: { prepared: PreparedFarm | null }, data: ReadonlyMap<string, ArrayBuffer>, context: SceneDataPreparationContext) {
  const bytes = data.get('layout');
  if (!bytes || context.signal.aborted) return;
  if (holder.prepared && preparedOwners.get(holder.prepared) === context.registry) return;
  const prepared = prepareFarm(bytes); preparedOwners.set(prepared, context.registry); holder.prepared = prepared;
  context.registry.add(() => { prepared.dispose(); preparedOwners.delete(prepared); if (holder.prepared === prepared) holder.prepared = null; });
}
