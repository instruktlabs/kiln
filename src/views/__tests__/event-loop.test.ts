import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { renderSceneToGLB } from '../../render';
import { eventLoopPace, TRIANGLE_BUDGET, VERTEX_BUDGET } from '../event-loop';
import { rasterizeCamera, rasterizeCameraPaced, resolveAssetCamera } from '../camera';
import { renderCaptureGrid } from '../camera-capture';
import { loadGlbReviewScene } from '../glb';

/** Count event-loop turns until `done` resolves: what another call waiting on this process sees. */
async function turnsDuring<T>(work: () => Promise<T>): Promise<{ turns: number; value: T }> {
  let turns = 0;
  let running = true;
  const tick = () => {
    if (!running) return;
    turns++;
    setImmediate(tick);
  };
  setImmediate(tick);
  try {
    const value = await work();
    return { turns, value };
  } finally {
    running = false;
  }
}

async function denseScene(): Promise<Uint8Array> {
  const root = new THREE.Group();
  root.name = 'Dense';
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 256, 128),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = `Ball${i}`;
    mesh.position.x = i * 3;
    root.add(mesh);
  }
  return Uint8Array.from(
    (await renderSceneToGLB(root, { derivative: true, gltfExporter: 'three' })).bytes,
  );
}

describe('event-loop pace', () => {
  test('pauses once the budget is spent, and only then', async () => {
    const pace = eventLoopPace(10);
    expect(pace.step(4)).toBeUndefined();
    expect(pace.step(5)).toBeUndefined();
    const { turns } = await turnsDuring(async () => pace.step(1));
    expect(turns).toBe(1);
    expect(pace.step(9)).toBeUndefined();
  });

  test('honours cancellation at a pause', async () => {
    const controller = new AbortController();
    const pace = eventLoopPace(1, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pace.step(1)!).rejects.toThrow('cancelled');
  });
});

describe('loading a large review scene', () => {
  test('lets other work run between node batches and stops when cancelled', async () => {
    const bytes = await denseScene();
    // 12 spheres of about 33,000 vertices each.
    expect(12 * 257 * 129).toBeGreaterThan(2 * VERTEX_BUDGET);
    const loaded = await turnsDuring(() => loadGlbReviewScene(bytes));
    expect(loaded.turns).toBeGreaterThanOrEqual(2);
    const controller = new AbortController();
    setImmediate(() => controller.abort(new Error('call cancelled')));
    await expect(loadGlbReviewScene(bytes, { signal: controller.signal })).rejects.toThrow(
      'call cancelled',
    );
  });

  test('a scene loaded with pauses is the scene loaded without them', async () => {
    const bytes = await denseScene();
    const describe = (root: THREE.Object3D) => {
      const out: unknown[] = [];
      root.traverse((node) => out.push([node.name, node.type, node.position.toArray()]));
      return out;
    };
    const a = await loadGlbReviewScene(bytes);
    const b = await loadGlbReviewScene(bytes, { signal: new AbortController().signal });
    expect(describe(b.root as THREE.Object3D)).toEqual(describe(a.root as THREE.Object3D));
  });
});

describe('drawing a shot set', () => {
  const shots = (n: number) => ({
    version: 'kiln.capture.v1' as const,
    size: 128,
    shots: Array.from({ length: n }, (_, i) => ({
      name: `S${i}`,
      camera: { type: 'orbit' as const, azimuthDeg: i * 40 },
    })),
  });

  test('pauses between shots, and a cancelled call stops before its next shot', async () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const { turns } = await turnsDuring(() => renderCaptureGrid(root, shots(3)));
    // One pause after resolving each shot's camera and one after drawing each.
    expect(turns).toBeGreaterThanOrEqual(6);
    const controller = new AbortController();
    let drawn = 0;
    await expect(
      renderCaptureGrid(
        root,
        shots(3),
        async (input) => {
          drawn++;
          controller.abort(new Error('call cancelled'));
          const { encodePng } = await import('../png');
          return {
            png: encodePng(new Uint8Array(input.size * input.size * 3), input.size, input.size),
            receipt: {} as never,
          };
        },
        undefined,
        { execution: { signal: controller.signal } },
      ),
    ).rejects.toThrow('call cancelled');
    expect(drawn).toBe(1);
  });
});

describe('the CPU rasterizer', () => {
  test('pauses between triangle batches and draws the same pixels', async () => {
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(new THREE.SphereGeometry(1, 200, 100), new THREE.MeshStandardMaterial()),
    );
    // 200 x 100 segments: about 39,600 triangles.
    expect(39_600).toBeGreaterThan(TRIANGLE_BUDGET);
    const { camera } = resolveAssetCamera(root, { camera: { type: 'orbit', azimuthDeg: 30 } });
    const { turns, value } = await turnsDuring(() =>
      rasterizeCameraPaced(root, camera, 96, true, 'neutral'),
    );
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(value).toEqual(rasterizeCamera(root, camera, 96, true, 'neutral'));
    const controller = new AbortController();
    setImmediate(() => controller.abort(new Error('call cancelled')));
    await expect(
      rasterizeCameraPaced(root, camera, 96, true, 'neutral', controller.signal),
    ).rejects.toThrow('call cancelled');
  });
});
