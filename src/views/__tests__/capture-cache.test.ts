import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { MemoryCaptureCache, createCachedRenderPort, captureCpuCell } from '../capture-cache';
import { cameraFromBounds } from '../camera';
import { encodePng } from '../png';
import type { PbrRenderRequest } from '../../composer/render-port';
const png = encodePng(new Uint8Array(128 * 128 * 3), 128, 128);
const glb = new Uint8Array([1]);
const hash = `sha256:${createHash('sha256').update(glb).digest('hex')}` as const;
const camera = cameraFromBounds({ min: [-1, -1, -1], max: [1, 1, 1] }, [1, 0, 0]);

test('review and legacy lighting never share cached GPU cells', async () => {
  let calls = 0;
  const port = createCachedRenderPort(
    async (request) => {
      calls++;
      return {
        ok: true,
        rendererId: 'gpu',
        cameras: request.cameras,
        width: 128,
        height: 128,
        viewsPng: [png],
        derivativeFidelity: { materialFaithful: true, inputGlbSha256: hash },
      };
    },
    { cache: new MemoryCaptureCache(), identity: () => 'same-producer' },
  );
  const request = { glb, cameras: [camera], width: 128, height: 128 };
  for (const lightingPresetId of [
    'neutral-studio-v1',
    'review-neutral-v1',
    'neutral-studio-v1',
    'review-neutral-v1',
  ]) {
    await port({ ...request, lightingPresetId });
  }
  expect(calls).toBe(2);
});
test('GPU cells reuse independently of requested order and invalidate on camera/backend changes', async () => {
  let calls = 0;
  let identity = 'gpu-v1';
  const cache = new MemoryCaptureCache();
  const port = createCachedRenderPort(
    async (request) => {
      calls++;
      return {
        ok: true,
        rendererId: identity,
        cameras: request.cameras,
        width: 128,
        height: 128,
        viewsPng: request.cameras!.map(() => png),
        derivativeFidelity: { materialFaithful: true, inputGlbSha256: hash },
      };
    },
    { cache, identity: () => identity },
  );
  const second = { ...camera, halfHeight: 4 };
  const request: PbrRenderRequest = { glb, cameras: [camera, second], width: 128, height: 128 };
  const first = await port(request);
  expect(calls).toBe(1);
  first.viewsPng![0]!.fill(0);
  const reordered = await port({ ...request, cameras: [second, camera] });
  expect(calls).toBe(1);
  expect(reordered.viewsPng?.[0]).toEqual(new Uint8Array(png));
  await port({ ...request, cameras: [{ ...camera, halfHeight: 5 }] });
  expect(calls).toBe(2);
  identity = 'gpu-v2';
  await port(request);
  expect(calls).toBe(3);
});
test('missing material or camera receipts are never admitted; unknown backend bypasses reuse', async () => {
  let calls = 0;
  const cache = new MemoryCaptureCache();
  const bad = createCachedRenderPort(
    async () => {
      calls++;
      return { ok: true, rendererId: 'bad', viewsPng: [png] };
    },
    { cache, identity: () => 'bad' },
  );
  const request = { glb, cameras: [camera], width: 128, height: 128 };
  await bad(request);
  await bad(request);
  expect(calls).toBe(2);
  expect(cache.stats().entries).toBe(0);
});
test('CPU cells preserve geometry-flat evidence and never alias GPU entries', async () => {
  let calls = 0;
  const cache = new MemoryCaptureCache();
  const identity = { artifactGlbSha256: hash, rendererId: 'cpu:fixture', camera, size: 128 };
  const produce = async () => {
    calls++;
    return {
      png: Buffer.from(png),
      width: 128,
      height: 128,
      inputGlbSha256: hash,
      reasonCodes: [],
      meshCount: 1,
      instanceCount: 0,
    };
  };
  const a = await captureCpuCell(cache, identity, produce);
  a.png.fill(0);
  const b = await captureCpuCell(cache, identity, produce);
  expect(calls).toBe(1);
  expect(b.png).toEqual(png);
  expect(b.captureCache?.hit).toBe(true);
  const tiny = new MemoryCaptureCache(1);
  await captureCpuCell(tiny, identity, produce);
  expect(tiny.stats().entries).toBe(0);
});
import { renderGLBInProcess } from '../../render';
import { renderGlbViewGrid } from '../index';
test('legacy CPU layout changes reuse unannotated cells without changing default pixels', async () => {
  const built = await renderGLBInProcess(
    "const meta={name:'box'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,2,3),gameMaterial('#888888'),{parent:r});return r;}",
  );
  const cache = new MemoryCaptureCache();
  const first = await renderGlbViewGrid(built.glb, {
    capture: { preset: '1x1' },
    captureCache: cache,
  });
  const second = await renderGlbViewGrid(built.glb, {
    capture: { preset: '2x1' },
    captureCache: cache,
  });
  expect(first.captureCache?.reused).toBe(0);
  expect(second.captureCache?.reused).toBe(1);
  const uncached = await renderGlbViewGrid(built.glb, { capture: { preset: '2x1' } });
  expect(second.png).toEqual(uncached.png);
});
test('producer changing during render never populates an older identity', async () => {
  let identity = 'one',
    calls = 0;
  const port = createCachedRenderPort(
    async (req) => {
      calls++;
      identity = 'two';
      return {
        ok: true,
        rendererId: 'gpu',
        viewsPng: [png],
        cameras: req.cameras,
        width: 128,
        height: 128,
        derivativeFidelity: { materialFaithful: true, inputGlbSha256: hash },
      };
    },
    { cache: new MemoryCaptureCache(), identity: async () => identity },
  );
  const request = { glb, cameras: [camera], width: 128, height: 128 };
  await port(request);
  identity = 'one';
  await port(request);
  expect(calls).toBe(2);
});
