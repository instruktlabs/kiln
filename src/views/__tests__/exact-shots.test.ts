import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { MAX_CAMERAS, MAX_CAMERA_TOTAL_PIXELS } from '../../../render-service/src/contract.mjs';
import type { PbrRenderRequest } from '../../composer/render-port';
import { createGltfIO } from '../../gltf-io';
import { renderSceneToGLB } from '../../render';
import { MemoryCaptureCache, createCachedRenderPort } from '../capture-cache';
import { encodePng } from '../png';
import {
  MAX_CAMERAS_PER_REQUEST,
  MAX_PIXELS_PER_REQUEST,
  captureExactArtifactShotsViaPort,
  captureViewsViaPort,
  exactShotRequestSizes,
} from '../port';
import { loadGlbReviewScene } from '..';
import { resolveAssetCamera } from '../camera';

const sha = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as const;

const gpu = (requests: PbrRenderRequest[]) => async (req: PbrRenderRequest) => {
  requests.push(req);
  const size = req.width!;
  return {
    ok: true,
    rendererId: 'gpu:test',
    cameras: req.cameras,
    width: req.width,
    height: req.height,
    viewsPng: req.cameras!.map(() => encodePng(new Uint8Array(size * size * 3), size, size)),
    derivativeFidelity: { materialFaithful: true as const, inputGlbSha256: sha(req.glb) },
  };
};

/** A box whose only texture samples the given UV set, every set holding different coordinates. */
async function channelAsset(channel: number): Promise<Uint8Array> {
  const root = new Group();
  root.name = 'Root';
  const geometry = new BoxGeometry();
  const uv = geometry.getAttribute('uv')!;
  for (const [index, name] of ['uv1', 'uv2', 'uv3'].entries()) {
    const set = uv.clone();
    for (let i = 0; i < set.count; i++) set.setXY(i, uv.getX(i) * (index + 2) * 0.25, uv.getY(i));
    geometry.setAttribute(name, set);
  }
  const map = new DataTexture(new Uint8Array(4 * 4 * 4).fill(200), 4, 4);
  map.colorSpace = SRGBColorSpace;
  map.channel = channel;
  map.needsUpdate = true;
  const part = new Mesh(geometry, new MeshStandardMaterial({ map }));
  part.name = 'Body';
  root.add(part);
  return (await renderSceneToGLB(root, { gltfExporter: 'three', optimize: 'off' })).bytes;
}

describe('request sizes', () => {
  test('the engine split mirrors what the render service admits', () => {
    expect(MAX_PIXELS_PER_REQUEST).toBe(MAX_CAMERA_TOTAL_PIXELS);
    expect(MAX_CAMERAS_PER_REQUEST).toBe(MAX_CAMERAS);
  });

  test('shots split at the pixel limit, in order, and one shot always goes alone', () => {
    expect(exactShotRequestSizes(9, 1000)).toEqual([9]);
    // 9 * 1366^2 passes the limit by a little.
    expect(exactShotRequestSizes(9, 1365)).toEqual([9]);
    expect(exactShotRequestSizes(9, 1366)).toEqual([8, 1]);
    expect(exactShotRequestSizes(9, 2048)).toEqual([4, 4, 1]);
    expect(exactShotRequestSizes(1, 4096)).toEqual([1]);
    expect(exactShotRequestSizes(1, 8192)).toEqual([1]);
  });
});

describe('captureViewsViaPort with shots', () => {
  test('sends the exact bytes for camera-only shots, in one request', async () => {
    const artifact = await channelAsset(0);
    const requests: PbrRenderRequest[] = [];
    const out = await captureViewsViaPort(gpu(requests), artifact, 5000, {
      version: 'kiln.capture.v1',
      shots: [{}, { camera: { type: 'orbit', azimuthDeg: 200 } }],
      size: 128,
    });
    expect(out.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(sha(requests[0]!.glb)).toBe(sha(artifact));
    if (out.ok) {
      expect(out.rendererId).toBe('gpu:test');
      expect(out.derivativeReceipts?.map((r) => r.exactArtifact)).toEqual([true, true]);
      expect(out.derivativeReceipts?.[0]?.inputGlbSha256).toBe(sha(artifact));
    }
  });

  test('orthographic and perspective shots never share a request, and keep their order', async () => {
    const artifact = await channelAsset(0);
    const requests: PbrRenderRequest[] = [];
    const perspective = (x: number) => ({
      camera: {
        type: 'explicit' as const,
        projection: 'perspective' as const,
        position: [x, 2, 4] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        fovDeg: 40,
      },
    });
    const out = await captureViewsViaPort(gpu(requests), artifact, 5000, {
      version: 'kiln.capture.v1',
      shots: [
        { camera: { type: 'orbit', azimuthDeg: 10 } },
        perspective(1),
        { camera: { type: 'orbit', azimuthDeg: 200 } },
        perspective(2),
      ],
      size: 128,
    });
    expect(out.ok).toBe(true);
    expect(requests).toHaveLength(2);
    for (const request of requests)
      expect(
        new Set(request.cameras!.map((camera) => (camera as { projection?: string }).projection))
          .size,
      ).toBe(1);
    expect(requests.map((request) => request.cameras!.length)).toEqual([2, 2]);
    if (out.ok)
      expect(
        out.derivativeReceipts?.map(
          (receipt) => (receipt.camera as { projection?: string } | undefined)?.projection,
        ),
      ).toEqual(['orthographic', 'perspective', 'orthographic', 'perspective']);
  });

  test('a batch gets one shot deadline per camera, as separate requests had', async () => {
    const artifact = await channelAsset(0);
    const { root } = await loadGlbReviewScene(artifact);
    const shots = [0, 90, 180, 270].map((azimuthDeg) =>
      resolveAssetCamera(root, { camera: { type: 'orbit', azimuthDeg } }),
    );
    const requests: PbrRenderRequest[] = [];
    const answer = gpu(requests);
    // A renderer that takes 150 ms per view: four views need 600 ms, more than one shot's 400.
    const slow = async (req: PbrRenderRequest) => {
      await new Promise((resolve) => setTimeout(resolve, 150 * req.cameras!.length));
      return answer(req);
    };
    const cells = await captureExactArtifactShotsViaPort(slow, artifact, 400, shots, 128, {
      exactArtifact: true,
    });
    expect(requests).toHaveLength(1);
    expect(cells.every((cell) => cell?.receipt.rendererId === 'gpu:test')).toBe(true);
  });

  test('a renderer that changes between requests does not reach one sheet', async () => {
    const artifact = await channelAsset(0);
    const { root } = await loadGlbReviewScene(artifact);
    const shots = [0, 72, 144, 216, 288].map((azimuthDeg) =>
      resolveAssetCamera(root, { camera: { type: 'orbit', azimuthDeg } }),
    );
    let call = 0;
    const cells = await captureExactArtifactShotsViaPort(
      async (req) => {
        call++;
        const size = req.width!;
        return {
          ok: true,
          rendererId: `gpu:${call}`,
          cameras: req.cameras,
          width: req.width,
          height: req.height,
          viewsPng: req.cameras!.map(() => encodePng(new Uint8Array(size * size * 3), size, size)),
          derivativeFidelity: { materialFaithful: true as const, inputGlbSha256: sha(req.glb) },
        };
      },
      artifact,
      5000,
      shots,
      2048,
      { exactArtifact: true },
    );
    expect(call).toBe(2);
    expect(cells.map((cell) => cell?.receipt.rendererId)).toEqual([
      'gpu:1',
      'gpu:1',
      'gpu:1',
      'gpu:1',
      undefined,
    ]);
  }, 60_000); // Five 2048 px PNG encodes and decodes.
});

describe('UV sets', () => {
  for (const channel of [2, 3])
    test(`an asset sampling TEXCOORD_${channel} reaches the renderer with that set intact`, async () => {
      const artifact = await channelAsset(channel);
      const requests: PbrRenderRequest[] = [];
      const out = await captureViewsViaPort(gpu(requests), artifact, 5000, {
        version: 'kiln.capture.v1',
        shots: [{}],
        size: 128,
      });
      expect(out.ok).toBe(true);
      expect(sha(requests[0]!.glb)).toBe(sha(artifact));
      const sent = await createGltfIO().readBinary(requests[0]!.glb);
      const primitive = sent.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
      for (const set of [1, 2, 3]) expect(primitive.getAttribute(`TEXCOORD_${set}`)).not.toBeNull();
      expect(primitive.getMaterial()!.getBaseColorTextureInfo()!.getTexCoord()).toBe(channel);
      // Each set still holds its own coordinates.
      const u = (set: number) => primitive.getAttribute(`TEXCOORD_${set}`)!.getElement(1, [])[0]!;
      expect(u(2)).not.toBe(u(3));
    });

  test('a derivative keeps the set too, so an isolated shot of the same asset still samples it', async () => {
    const artifact = await channelAsset(3);
    const requests: PbrRenderRequest[] = [];
    await captureViewsViaPort(gpu(requests), artifact, 5000, {
      version: 'kiln.capture.v1',
      shots: [{ subject: { name: 'Body' }, visibility: 'isolate' }],
      size: 128,
    });
    expect(sha(requests[0]!.glb)).not.toBe(sha(artifact));
    const sent = await createGltfIO().readBinary(requests[0]!.glb);
    const primitive = sent.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(primitive.getAttribute('TEXCOORD_3')).not.toBeNull();
    expect(primitive.getMaterial()!.getBaseColorTextureInfo()!.getTexCoord()).toBe(3);
  });
});

describe('capture cache keys', () => {
  test('backdrop, lighting, size and bytes each key their own cell; hits name their cells', async () => {
    const cache = new MemoryCaptureCache();
    const requests: PbrRenderRequest[] = [];
    const inner = gpu(requests);
    const port = createCachedRenderPort(inner, { cache, identity: () => 'renderer' });
    const glb = new Uint8Array([1, 2, 3, 4]);
    const camera = (x: number) => ({
      version: 'kiln.camera.v1' as const,
      projection: 'perspective' as const,
      position: [x, 1, 5] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      aspect: 1,
      near: 0.1,
      far: 100,
      fovDeg: 50,
    });
    const request = (over: Partial<PbrRenderRequest> = {}): PbrRenderRequest => ({
      glb,
      cameras: [camera(1), camera(2)],
      width: 64,
      height: 64,
      ...over,
    });
    await port(request());
    expect(requests).toHaveLength(1);
    const repeat = await port(request());
    expect(requests).toHaveLength(1);
    expect(repeat.captureCache).toEqual({ hit: true, reused: 2, total: 2 });
    expect(repeat.captureCacheHits).toEqual([true, true]);

    for (const changed of [
      { backdrop: 'dark' as const },
      { lightingPresetId: 'other-rig' },
      { width: 96, height: 96 },
      { glb: new Uint8Array([9, 9, 9, 9]) },
    ]) {
      const before = requests.length;
      const out = await port(request(changed));
      expect(requests.length).toBe(before + 1);
      expect(out.captureCache).toEqual({ hit: false, reused: 0, total: 2 });
      expect(out.captureCacheHits).toEqual([false, false]);
    }

    const mixed = await port(request({ cameras: [camera(1), camera(3)] }));
    expect(mixed.captureCache).toEqual({ hit: false, reused: 1, total: 2 });
    expect(mixed.captureCacheHits).toEqual([true, false]);
  });
});
