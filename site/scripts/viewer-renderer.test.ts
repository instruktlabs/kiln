import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import { NodeBuilder } from 'three/webgpu';
import { compileAhead, compileInTurn, compilesOnPageThread } from '../src/components/viewer-renderer';

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

/**
 * The view's renderer as far as a shader build and the render target go. Like three r187's `compileAsync` (pinned
 * below), a build makes the target that was current when it began current again after each piece of its work and when
 * it settles, whatever was set in between. A frame records the target it was drawn into. WebGL2, which always builds
 * ahead.
 */
function standIn() {
  let current: THREE.RenderTarget | null = null;
  const frames: (THREE.RenderTarget | null)[] = [];
  const builds: {
    began: THREE.RenderTarget | null;
    culledAtStart: boolean[];
    piece: () => void;
    settle: () => void;
    fail: () => void;
  }[] = [];
  const renderer = {
    backend: { isWebGPUBackend: false },
    getRenderTarget: () => current,
    setRenderTarget(target: THREE.RenderTarget | null) {
      current = target;
    },
    render() {
      frames.push(current);
    },
    compileAsync(object: THREE.Object3D) {
      const began = current;
      const culledAtStart: boolean[] = [];
      object.traverse((part) => {
        culledAtStart.push(part.frustumCulled);
      });
      return new Promise<void>((resolve, reject) => {
        builds.push({
          began,
          culledAtStart,
          piece: () => {
            current = began;
          },
          settle: () => {
            current = began;
            resolve();
          },
          fail: () => {
            current = began;
            reject(new Error('device lost'));
          },
        });
      });
    },
  };
  return { renderer: renderer as unknown as THREE.WebGPURenderer, frames, builds, target: () => current };
}

const settled = () => new Promise((done) => setTimeout(done, 0));
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();

/** As the shadow bake asks: its target is current only around the call. */
const bakeBuild = (renderer: THREE.WebGPURenderer, target: THREE.RenderTarget) => () => {
  const page = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    return renderer.compileAsync(scene, camera);
  } finally {
    renderer.setRenderTarget(page);
  }
};

describe('shader builds leave the page its render target', () => {
  test('three r187 makes the target a build began with current again after each piece of its work', () => {
    const webgpu = threeBuild('three/webgpu');
    // Without the frame buffer target, the target put back is the one current when the build began...
    expect(webgpu).toContain('outputRenderTarget: useFrameBufferTarget ? outputRenderTarget : this._renderTarget,');
    // ...and each piece of work is put back as if it had drawn into the frame buffer target.
    expect(webgpu).toMatch(/useFrameBufferTarget: true,\s*renderTarget: this\.getRenderTarget\(\),/);
    expect(webgpu).toContain(
      'if ( useFrameBufferTarget === true ) this.setRenderTarget( outputRenderTarget, activeCubeFace, activeMipmapLevel );',
    );
  });

  test('a frame drawn while the bake builds its shaders reaches the page, which has its target back after', async () => {
    const { renderer, frames, builds, target } = standIn();
    const bake = new THREE.RenderTarget(8, 8);
    const built = compileInTurn(renderer, bake, bakeBuild(renderer, bake));
    await settled();
    expect(builds.map((build) => build.began)).toEqual([bake]);
    builds[0].piece();
    renderer.render(scene, camera);
    expect(frames).toEqual([null]);
    expect(target()).toBe(bake);
    builds[0].settle();
    await built;
    expect(target()).toBe(null);
  });

  test('a frame drawn into a target of its own while a build runs is drawn there', async () => {
    const { renderer, frames, builds } = standIn();
    const bake = new THREE.RenderTarget(8, 8);
    const environment = new THREE.RenderTarget(8, 8);
    const built = compileInTurn(renderer, bake, bakeBuild(renderer, bake));
    await settled();
    renderer.setRenderTarget(environment);
    renderer.render(scene, camera);
    expect(frames).toEqual([environment]);
    renderer.setRenderTarget(null);
    builds[0].settle();
    await built;
  });

  test("builds on one renderer take turns, and the model's is built for the page's target", async () => {
    const { renderer, builds } = standIn();
    const bake = new THREE.RenderTarget(8, 8);
    const baking = compileInTurn(renderer, bake, bakeBuild(renderer, bake));
    const model = withBatches(2);
    const ahead = compileAhead(renderer, model, camera, scene);
    await settled();
    expect(builds).toHaveLength(1);
    builds[0].piece();
    builds[0].settle();
    await baking;
    await settled();
    expect(builds.map((build) => build.began)).toEqual([bake, null]);
    // Culled parts are built too, and culled again once three has read the model.
    expect(builds[1].culledAtStart.every((culled) => !culled)).toBe(true);
    let stillCulled = true;
    model.traverse((part) => {
      stillCulled &&= part.frustumCulled;
    });
    expect(stillCulled).toBe(true);
    builds[1].settle();
    await ahead;
  });

  test('a failed build gives the page its target back and the next build its turn', async () => {
    const { renderer, builds, target } = standIn();
    const bake = new THREE.RenderTarget(8, 8);
    const failed = compileInTurn(renderer, bake, bakeBuild(renderer, bake));
    const next = compileInTurn(renderer, null, () => renderer.compileAsync(scene, camera));
    await settled();
    builds[0].fail();
    await expect(failed).rejects.toThrow('device lost');
    expect(target()).toBe(null);
    await settled();
    expect(builds).toHaveLength(2);
    builds[1].settle();
    await next;
  });
});

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
