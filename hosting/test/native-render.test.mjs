import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { renderGLB } from '../../lib/render.js';
import { encodePng } from '../../lib/views/png.js';
import { captureViewPngsViaPort } from '../../lib/views/port.js';

let createNativeRenderPort, encodeRenderRequest, decodeRenderRequest, encodeRenderResult;
let glb;
const rendererId = 'dawn-vulkan:llvmpipe-fixture';
const request = () => ({ glb, viewDirs: [[1, 0.4, 1]], size: 32, backdrop: 'dark' });
const png = () => encodePng(new Uint8Array(32 * 32 * 3).fill(100), 32, 32);
before(async () => {
  const output = new URL('../../.cache/hosted-native-render/native-render.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-render.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    alias: {
      '@instruktlabs/kiln/composer': fileURLToPath(
        new URL('../../lib/composer/index.js', import.meta.url),
      ),
    },
  });
  ({ createNativeRenderPort, encodeRenderRequest, decodeRenderRequest, encodeRenderResult } =
    await import(output));
  ({ glb } = await renderGLB(
    'function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}',
  ));
});
function success(input, extra = {}) {
  return encodeRenderResult(input, {
    rendererId,
    backend: 'vulkan',
    software: true,
    views: [png()],
    ...extra,
  });
}
test('software transport binds exact GLB bytes and uses only the fixed private route', async () => {
  let calls = 0;
  const port = createNativeRenderPort({
    fetch: async (incoming) => {
      calls++;
      assert.equal(incoming.url, 'http://kiln-renderer.internal/render');
      assert.equal(incoming.redirect, 'error');
      assert.equal(incoming.credentials, 'omit');
      assert.equal(incoming.headers.get('x-kiln-deadline-ms'), '30000');
      assert.equal(incoming.headers.get('authorization'), null);
      const input = decodeRenderRequest(new Uint8Array(await incoming.arrayBuffer()));
      assert.deepEqual(input.request.glb, glb);
      assert.equal(input.request.backdrop, 'dark');
      return new Response(success(input));
    },
  });
  const result = await port(request());
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.rendererId, rendererId);
  assert.deepEqual(result.viewsPng[0], png());
  assert.equal(result.derivativeFidelity.materialFaithful, true);
});
test('camera mode preserves exact cameras, dimensions and presentation identity', async () => {
  const camera = {
    position: [3, 2, 4],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovDeg: 50,
    aspect: 1,
    near: 0.1,
    far: 100,
  };
  const input = {
    glb,
    cameras: [camera],
    width: 32,
    height: 32,
    lightingPresetId: 'review-neutral-v1',
  };
  const port = createNativeRenderPort({
    fetch: async (req) => {
      const parsed = decodeRenderRequest(new Uint8Array(await req.arrayBuffer()));
      assert.deepEqual(parsed.request.cameras, [camera]);
      return new Response(
        success(parsed, {
          cameras: [camera],
          width: 32,
          height: 32,
          lightingPresetId: 'review-neutral-v1',
        }),
      );
    },
  });
  const result = await port(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.cameras, [camera]);
  assert.equal(result.width, 32);
});
test('input limits reject unknown authority, invalid cameras, excessive pixels and oversized GLBs before transport', async () => {
  let calls = 0;
  const port = createNativeRenderPort({
    fetch: async () => {
      calls++;
      throw Error('must not run');
    },
  });
  for (const value of [
    { ...request(), tenant: 'other' },
    { ...request(), viewDirs: [[0, 0, 0]] },
    { ...request(), size: 2048 },
    { ...request(), viewDirs: Array.from({ length: 12 }, () => [1, 0, 0]), size: 1024 },
    { ...request(), glb: new Uint8Array(4 * 1024 * 1024 + 1) },
  ]) {
    assert.equal((await port(value)).ok, false);
  }
  assert.equal(calls, 0);
  const wire = JSON.parse(new TextDecoder().decode(encodeRenderRequest(request()).bytes));
  for (const value of [
    { ...wire, tenant: 'other' },
    { ...wire, glbBase64: '!!!' },
    { ...wire, options: { ...wire.options, glb: 'replace' } },
    { ...wire, version: 'future' },
  ]) {
    assert.throws(() => decodeRenderRequest(new TextEncoder().encode(JSON.stringify(value))));
  }
});
test('forged result identity, GPU claims, dimensions and excessive output fail closed without echoing diagnostics', async () => {
  for (const change of [
    (r) => ({ ...r, requestId: 'other' }),
    (r) => ({ ...r, inputGlbSha256: `sha256:${'a'.repeat(64)}` }),
    (r) => ({ ...r, software: false }),
    (r) => ({ ...r, viewsBase64: [] }),
    (r) => ({ ...r, viewsBase64: ['!!!!'] }),
    (r) => ({ ...r, unknown: 'PRIVATE_SOURCE' }),
  ]) {
    const port = createNativeRenderPort({
      fetch: async (req) => {
        const input = decodeRenderRequest(new Uint8Array(await req.arrayBuffer()));
        return Response.json(change(JSON.parse(new TextDecoder().decode(success(input)))));
      },
    });
    const result = await port(request());
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SOURCE'));
  }
  for (const respond of [
    () => new Response('PRIVATE_PATH', { status: 503 }),
    () => new Response('x', { headers: { 'content-length': '999999999' } }),
  ]) {
    const result = await createNativeRenderPort({ fetch: async () => respond() })(request());
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_PATH'));
  }
});
test('the engine still owns PNG validation and failed-render fallback', async () => {
  const port = createNativeRenderPort({
    fetch: async (req) => {
      const input = decodeRenderRequest(new Uint8Array(await req.arrayBuffer()));
      return new Response(success(input, { views: [Buffer.from('invalid PNG')] }));
    },
  });
  const result = await captureViewPngsViaPort(port, glb, 1000, [[1, 0.4, 1]], 32);
  assert.equal(result.ok, false);
});
test('execution cancellation aborts the transport and disposes a late response', async () => {
  let entered,
    finish,
    cancelled = false;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise((resolve) => {
    finish = resolve;
  });
  let signal;
  const port = createNativeRenderPort({
    fetch: async (req) => {
      signal = req.signal;
      entered();
      return waiting;
    },
  });
  const abort = new AbortController();
  const pending = port(request(), { signal: abort.signal });
  await started;
  abort.abort();
  assert.equal((await pending).ok, false);
  assert.equal(signal.aborted, true);
  finish(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('one-shot renderer rejects malformed input before loading a graphics device', async () => {
  const entry = new URL('../../.cache/hosted-native-render/render.mjs', import.meta.url);
  await copyFile(new URL('../container/render.mjs', import.meta.url), entry);
  for (const input of [
    Buffer.from('{'),
    Buffer.from(encodeRenderRequest({ ...request(), glb: Buffer.from('not a GLB') }).bytes),
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(entry)], {
      input,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr.toString(), 'Kiln software render input or execution failed.\n');
  }
});
