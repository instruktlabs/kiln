import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import { NodeBuilder } from 'three/webgpu';
import { compilesOnPageThread } from '../src/components/viewer-renderer';

const backendOf = (webgpu: boolean) =>
  ({ backend: { isWebGPUBackend: webgpu } }) as unknown as THREE.WebGPURenderer;

const withBatches = (count: number) => {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardNodeMaterial();
  for (let i = 0; i < count; i++) group.add(new THREE.InstancedMesh(geometry, material, 3));
  group.add(new THREE.Mesh(geometry, material));
  return group;
};

describe('which models build their shaders before they are first drawn', () => {
  test('WebGL2 always does, since it compiles on the page thread', () => {
    expect(compilesOnPageThread(backendOf(false))).toBe(true);
    expect(compilesOnPageThread(backendOf(false), withBatches(0))).toBe(true);
  });

  test('WebGPU does for a model with many GPU batches', () => {
    // r186 added an InstancedMesh's uuid to its render cache key, so each batch's node graph was built alone: 176
    // batches held the first frame for 5.7 s. r187 keys a batch by its instance data; the threshold stays until the
    // first frame is re-measured without it.
    expect(compilesOnPageThread(backendOf(true), withBatches(16))).toBe(true);
  });

  test('WebGPU draws a plain model or a few batches at once, as before', () => {
    expect(compilesOnPageThread(backendOf(true))).toBe(false);
    expect(compilesOnPageThread(backendOf(true), withBatches(0))).toBe(false);
    expect(compilesOnPageThread(backendOf(true), withBatches(15))).toBe(false);
  });
});

/** three's build as the site bundles it; from r187 `three/tsl` holds the node classes. */
const threeBuild = (entry: string) => readFileSync(Bun.resolveSync(entry, import.meta.dir), 'utf8');

// r186 put a batch's matrices in a uniform array named after its own node below 1,024 copies, so each batch was a
// shader of its own: a cathedral exported with `--draws minimal` (176 batches) cost 203 WebGL2 programs and 399
// WebGPU modules until the viewer reported a zero uniform limit for instanced parts. r187 shares those shaders itself.
// Counted at the graphics API in Chrome 156 on that cathedral, with the patch and without: 55 WebGPU modules, 29
// WebGL2 programs and 286 draws either way.
describe('instanced parts share their shaders without help from the viewer', () => {
  test('three r187 binds the matrices as an instanced attribute where the geometry leaves a vertex buffer free', () => {
    const tsl = threeBuild('three/tsl');
    expect(tsl).toContain('const MAX_VERTEX_BUFFERS = 8;');
    expect(tsl).toContain(
      'return Object.keys( object.geometry.attributes ).length + instanceBuffers <= MAX_VERTEX_BUFFERS;',
    );
    // Only the fallback is built per object, and only it reads the uniform limit (`createInstanceMatrixNode`).
    expect(tsl).toMatch(
      /if \( canReferenceInstanceData\( instancedMesh, builder \) \) \{[\s\S]{0,800}?transformInstance\( builder, referenceAttribute\( 'instanceMatrix', 'mat4' \)[\s\S]{0,400}?\} else \{\s*builder\.objectSpecific = true;\s*instance\( instancedMesh\.instanceMatrix, instancedMesh\.instanceColor \);/,
    );
    expect(tsl).toMatch(/if \( uniformBufferSize <= builder\.getUniformBufferLimit\(\) \) \{/);
  });

  test('three r187 keys a batch by the kind of its instance data, not its uuid, and shares the build', () => {
    const webgpu = threeBuild('three/webgpu');
    expect(webgpu).toContain(
      "cacheKey += getInstanceDataKey( instanceMatrix ) + getInstanceDataKey( instanceColor ) + ( morphTexture !== null ? 'm' : '' ) + ',';",
    );
    expect(webgpu).toContain(
      'if ( nodeBuilder.objectSpecific === false ) nodeBuilderCache.set( cacheKey, nodeBuilderState );',
    );
  });

  test('the viewer leaves the uniform limit to three', async () => {
    // A zero limit in r187's fallback would move a batch's matrices from a uniform array onto one more vertex
    // buffer, for exactly the geometry that has none to spare.
    const viewer = await import('../src/components/viewer-renderer');
    expect(Object.keys(viewer)).not.toContain('shareInstancedShaders');
    expect(String(NodeBuilder.prototype.getUniformBufferLimit)).toContain('capabilities.getUniformBufferLimit()');
  });
});
