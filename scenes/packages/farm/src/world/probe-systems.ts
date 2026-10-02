import type { InstancedMesh, Object3D } from 'three/webgpu';
import { farmBatchPolicy } from './optimize-policy';
import type { FarmWorld } from './build-world';

const ANIMALS = new Set(['cow', 'sheep', 'chicken']);
/**
 * Test and dev builds only (World.tsx registers these behind the build flags): the count probe's systems and asset names
 * (scene-kit testing/probe.ts). Heroes are the policy-excluded placements plus the windmill, whose four meshes never
 * batch; animals are their dynamic batches; batched is every other batch; placements are the owners left drawing their
 * own meshes. A batch is named by the asset of its first source.
 */
export function farmProbeHooks(world: FarmWorld): Record<string, (...args: any[]) => unknown> {
  const excluded = farmBatchPolicy().excludeAssets, owners = new Map<Object3D, string>();
  for (const instance of world.placements.instances) owners.set(instance.object, instance.asset.id);
  const ownerAsset = (object: Object3D | null) => { for (let node = object; node; node = node.parent) { const id = owners.get(node); if (id) return id; } return null; };
  const batches = (world.optimization?.batches.batches ?? []).map(batch => ({ mesh: batch.mesh as Object3D, asset: ownerAsset(batch.sources[0]?.o ?? null) }));
  const named = new Map<Object3D, string>(batches.map(batch => [batch.mesh, batch.asset ?? batch.mesh.name]));
  const woodland = () => [...world.woodland.meshes, ...world.root.children.filter(child => (child as InstancedMesh).isInstancedMesh && child.name.startsWith('Packed '))];
  const isHero = (asset: string) => excluded.has(asset) || asset === 'windmill';
  return {
    probeSystems: () => ({
      terrain: [world.ground, world.surrounding], woodland: woodland(), stream: world.water, bridge: world.bridge, grass: world.grass.layers.map(layer => layer.mesh),
      heroes: world.placements.instances.filter(i => isHero(i.asset.id)).map(i => i.object),
      animals: [...world.placements.instances.filter(i => ANIMALS.has(i.asset.id)).map(i => i.object), ...batches.filter(b => b.asset && ANIMALS.has(b.asset)).map(b => b.mesh)],
      placements: world.placements.instances.filter(i => !isHero(i.asset.id) && !ANIMALS.has(i.asset.id)).map(i => i.object),
      batched: batches.filter(b => !b.asset || !ANIMALS.has(b.asset)).map(b => b.mesh),
    }),
    probeAsset: (object: Object3D) => named.get(object) ?? (woodland().includes(object) ? 'faceted-tree' : ownerAsset(object)),
  };
}
