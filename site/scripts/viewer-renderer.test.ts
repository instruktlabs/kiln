import { describe, expect, test } from 'bun:test';
import * as THREE from 'three/webgpu';
import { NodeBuilder } from 'three/webgpu';
import { compilesOnPageThread, shareInstancedShaders } from '../src/components/viewer-renderer';

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

  test('WebGPU does for a model with many GPU batches, whose node graphs are each built alone', () => {
    // r186 adds an InstancedMesh's uuid to its render cache key. 176 batches held the first frame for 5.7 s.
    expect(compilesOnPageThread(backendOf(true), withBatches(16))).toBe(true);
  });

  test('WebGPU draws a plain model or a few batches at once, as before', () => {
    expect(compilesOnPageThread(backendOf(true))).toBe(false);
    expect(compilesOnPageThread(backendOf(true), withBatches(0))).toBe(false);
    expect(compilesOnPageThread(backendOf(true), withBatches(15))).toBe(false);
  });
});

/** A renderer as three's node builder sees it: only the backend's capabilities are read. */
const rendererWithLimit = (bytes: number) => ({
  backend: { capabilities: { getUniformBufferLimit: () => bytes } },
});

/** What three r186's node builder reports to `nodes/accessors/Instance.js` and `Skinning.js` while it builds `object`. */
const limitSeenByNodes = (renderer: object, object: object) =>
  NodeBuilder.prototype.getUniformBufferLimit.call({ renderer, object } as unknown as NodeBuilder);

const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial(), 3);
const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial());

describe('instanced parts share their shaders', () => {
  test('a GPU batch of any size takes the instanced-attribute path', () => {
    const renderer = rendererWithLimit(65536);
    // Unpatched, a batch under 1,024 copies is a uniform array named after its own node, so each
    // batch is a shader of its own: 176 batches cost 203 WebGL2 programs and 399 WebGPU modules.
    expect(limitSeenByNodes(renderer, batch)).toBeGreaterThanOrEqual(64);
    shareInstancedShaders(renderer as never);
    // `createInstanceMatrixNode` uses the uniform array only when `count * 64` fits the limit.
    expect(limitSeenByNodes(renderer, batch)).toBeLessThan(64);
  });

  test('a skinned part keeps its bones in a uniform block', () => {
    // Skinning reads the same limit; only instanced parts are moved off the uniform path.
    const renderer = rendererWithLimit(65536);
    shareInstancedShaders(renderer as never);
    expect(limitSeenByNodes(renderer, skinned)).toBe(65536);
  });

  test('another renderer on the page is left alone', () => {
    const other = rendererWithLimit(65536);
    shareInstancedShaders(rendererWithLimit(65536) as never);
    expect(limitSeenByNodes(other, batch)).toBe(65536);
  });
});
