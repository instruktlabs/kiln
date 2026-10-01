import { describe, expect, test } from 'bun:test';
import { BoxGeometry, InstancedMesh, Mesh, MeshStandardMaterial } from 'three/webgpu';
import { installInstanceAttributes, takesInstanceAttributes, type InstanceAttributeBuilder, type InstanceAttributeRenderer } from '../../src/world/instance-attributes';

// M4 item 1: instanced meshes take three's instanced-attribute path (shared programs, uploads only on change). No GPU:
// a stand-in node builder reports the backend's 64 KB uniform buffer limit until the hook overrides it.
const builder = (): InstanceAttributeBuilder => ({ getUniformBufferLimit: () => 65536 });

describe('instanced meshes read their matrices as vertex attributes', () => {
  test('only instanced meshes with ordinary instance matrices take the attribute path', () => {
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), batch = new InstancedMesh(geometry, material, 12);
    expect(takesInstanceAttributes({ object: batch })).toBe(true);
    expect(takesInstanceAttributes({ object: new Mesh(geometry, material) })).toBe(false);
    // Compute builders are created with the compute node, which has no object.
    expect(takesInstanceAttributes({ isComputeNode: true })).toBe(false);
    expect(takesInstanceAttributes(null)).toBe(false);
    const storage = new InstancedMesh(geometry, material, 2); (storage.instanceMatrix as unknown as { isStorageInstancedBufferAttribute: boolean }).isStorageInstancedBufferAttribute = true;
    expect(takesInstanceAttributes({ object: storage })).toBe(false);
  });

  test('the hook zeroes the uniform buffer limit for instanced meshes only, chains an earlier callback and restores it', () => {
    const seen: unknown[] = [], earlier = (_b: InstanceAttributeBuilder, target: unknown) => { seen.push(target); };
    const renderer: InstanceAttributeRenderer = { debug: { onNodeBuilderCreated: earlier } };
    const remove = installInstanceAttributes(renderer);
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
    const instanced = builder(), plain = builder(), batch = { object: new InstancedMesh(geometry, material, 3) }, mesh = { object: new Mesh(geometry, material) };
    renderer.debug.onNodeBuilderCreated!(instanced, batch);
    renderer.debug.onNodeBuilderCreated!(plain, mesh);
    // three 0.186.0 keeps the uniform buffer only while count * 64 bytes <= the limit, so 0 selects the attribute path for any count.
    expect(instanced.getUniformBufferLimit()).toBe(0);
    expect(plain.getUniformBufferLimit()).toBe(65536);
    expect(seen).toEqual([batch, mesh]);
    remove();
    expect(renderer.debug.onNodeBuilderCreated).toBe(earlier);
    const bare: InstanceAttributeRenderer = { debug: { onNodeBuilderCreated: null } };
    const removeBare = installInstanceAttributes(bare);
    const again = builder(); bare.debug.onNodeBuilderCreated!(again, batch); expect(again.getUniformBufferLimit()).toBe(0);
    removeBare(); expect(bare.debug.onNodeBuilderCreated).toBeNull();
  });
});
