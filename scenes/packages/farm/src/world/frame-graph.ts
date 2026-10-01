import { createFrameGraph } from '@kiln-scenes/scene-kit/instancing';
import type { BatchSet, DisposeRegistry, FrameGraph, InstanceOwner } from '@kiln-scenes/scene-kit';
import type { Object3D, Scene } from 'three/webgpu';

interface GraphWorld {
  root: Object3D;
  registry: Pick<DisposeRegistry, 'add'>;
  optimization: { owners: InstanceOwner[]; batches: BatchSet | null; isFixed(owner: InstanceOwner): boolean; stats?: { frameGraph: FrameGraph['stats'] | null } };
}

/** Attach only after R3F commits the primitive and static singleton objects. */
export function bindFarmFrameGraph(scene: Scene, world: GraphWorld, staticReady: () => boolean = () => true) {
  let graph: FrameGraph | null = null, disposed = false;
  const binding = {
    worldRoot: world.root,
    get stats() { return graph?.stats ?? null; },
    update(): boolean {
      if (disposed) return false;
      if (!graph) {
        if (!world.root.parent) return false;
        if (world.root.parent !== scene) throw new Error('Farm world must be a direct child of the outer R3F Scene');
        if (!staticReady()) return false;
        graph = createFrameGraph({ scene, worldRoot: world.root, owners: world.optimization.owners, batches: world.optimization.batches, isFixed: world.optimization.isFixed });
        if (world.optimization.stats) world.optimization.stats.frameGraph = graph.stats;
      }
      graph.update(); return true;
    },
    dispose() { if (disposed) return; disposed = true; graph?.restore(); graph = null; if (world.optimization.stats) world.optimization.stats.frameGraph = null; },
  };
  // Registered after optimization: reverse disposal restores this graph first,
  // even when React runs the world's useBuilt cleanup before sibling effects.
  world.registry.add(binding);
  return binding;
}
export type FarmFrameGraphBinding = ReturnType<typeof bindFarmFrameGraph>;
