import { expect, test } from 'bun:test';
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Scene } from 'three/webgpu';
import { DisposeRegistry } from '../../../scene-kit/src/lifecycle/core';
import { batchStaticMeshes, freezeTransforms } from '../../../scene-kit/src/instancing/core';
// Finish the pinned ESM three load before R3F's CJS entry requires it in Bun.
await import('three');
const { bindFarmFrameGraph } = await import('../../src/world/frame-graph');

test('Farm graph waits for attachment and static readiness, updates dynamic hidden roots, then restores before optimization', () => {
  const scene = new Scene(), root = new Scene(), registry = new DisposeRegistry();
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), owners = [false, true].map((dynamic, index) => {
    const object = new Group(); object.name = `owner-${index}`; object.position.x = index; object.add(new Mesh(geometry, material)); root.add(object);
    return { id: object.name, assetId: 'box', object, dynamic };
  });
  const batches = batchStaticMeshes(root, owners, { cellSize: 96, cellOffset: 48, excludeAssets: new Set() }), isFixed = (owner: typeof owners[number]) => !owner.dynamic;
  const frozen = freezeTransforms(owners, isFixed); let optimizedRestored = 0;
  registry.add(() => { expect(scene.matrixWorldAutoUpdate).toBe(true); expect(owners.every(owner => owner.object.visible)).toBe(true); frozen.restore(); batches.restore(); optimizedRestored++; });
  let staticReady = false;
  const optimizationStats: { frameGraph: { hiddenRoots: number; dynamicRoots: number } | null } = { frameGraph: null };
  const binding = bindFarmFrameGraph(scene, { root, registry, optimization: { owners, batches, isFixed, stats: optimizationStats } }, () => staticReady);
  expect(binding.update()).toBe(false); expect(binding.stats).toBeNull(); expect(scene.matrixWorldAutoUpdate).toBe(true);
  scene.add(root); expect(binding.update()).toBe(false); staticReady = true;
  expect(binding.update()).toBe(true); const stats = binding.stats;
  expect(optimizationStats.frameGraph).toBe(stats);
  expect(stats?.hiddenRoots).toBe(2); expect(scene.matrixWorldAutoUpdate).toBe(false);
  owners[1]!.object.position.z = 3; expect(binding.update()).toBe(true); expect(binding.stats).toBe(stats);
  const matrix = new Matrix4(); batches.batches[0]!.mesh.getMatrixAt(1, matrix); expect(matrix.elements[14]).toBe(3);
  registry.disposeAll(); binding.dispose(); registry.disposeAll();
  expect(optimizedRestored).toBe(1); expect(binding.update()).toBe(false); expect(scene.matrixWorldAutoUpdate).toBe(true);
  expect(optimizationStats.frameGraph).toBeNull();
  geometry.dispose(); material.dispose();
});

test('Farm graph detects an attached wrong parent and an already-disposed registry prevents late attachment', () => {
  const scene = new Scene(), root = new Scene(), wrongParent = new Group(), registry = new DisposeRegistry();
  wrongParent.add(root);
  const world = { root, registry, optimization: { owners: [], batches: null, isFixed: () => true } };
  const binding = bindFarmFrameGraph(scene, world); expect(() => binding.update()).toThrow(/direct child/); binding.dispose();
  registry.disposeAll(); root.removeFromParent(); scene.add(root);
  const late = bindFarmFrameGraph(scene, world); expect(late.update()).toBe(false); expect(scene.matrixWorldAutoUpdate).toBe(true);
});
