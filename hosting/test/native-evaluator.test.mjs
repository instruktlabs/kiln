import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { evaluateEvaluatorRequestV2 } from '../../lib/evaluator/index.js';

const source = 'function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}';
let createNativeEvaluatorPort;
let handleEvaluationRequest;
const image = `sha256:${'a'.repeat(64)}`;
before(async () => {
  const output = new URL('../../.cache/hosted-native-evaluator/client.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-evaluator.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    alias: {
      '@instruktlabs/kiln/evaluator': fileURLToPath(
        new URL('../../lib/evaluator/index.js', import.meta.url),
      ),
    },
  });
  ({ createNativeEvaluatorPort } = await import(output));
  const handler = new URL('../../.cache/hosted-native-evaluator/handler.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/evaluation-request.ts', import.meta.url))],
    outfile: fileURLToPath(handler),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ handleEvaluationRequest } = await import(handler));
});

test('native evaluation uses the fixed private route and the real versioned engine protocol', async () => {
  let calls = 0;
  const port = createNativeEvaluatorPort({
    fetch: async (request) => {
      calls++;
      assert.equal(request.url, 'http://kiln-evaluator.internal/evaluate');
      assert.equal(request.method, 'POST');
      assert.equal(request.redirect, 'error');
      assert.equal(request.credentials, 'omit');
      assert.deepEqual([...request.headers.keys()].sort(), [
        'content-length',
        'content-type',
        'x-kiln-deadline-ms',
        'x-kiln-max-response-bytes',
      ]);
      assert.equal(request.headers.get('x-kiln-deadline-ms'), '60000');
      assert.equal(request.headers.get('x-kiln-max-response-bytes'), String(8 * 1024 * 1024));
      // Fixed trusted fixture, not an isolation assertion. Production runs this in a fresh VM.
      return handleEvaluationRequest(request, {
        executionImage: () => `registry.cloudflare.com/fixture/kiln@${image}`,
        async run(bytes, controls) {
          const input = new TextDecoder().decode(bytes);
          assert.equal(JSON.parse(input).limits.maxGlbBytes, 4 * 1024 * 1024);
          assert.ok(controls.deadlineMs > 0 && controls.deadlineMs <= 60_000);
          assert.equal(controls.maxResponseBytes, 8 * 1024 * 1024);
          return new TextEncoder().encode(await evaluateEvaluatorRequestV2(input));
        },
      });
    },
  });
  const rendered = await port.render(
    source,
    {},
    {
      deadlineMs: 120000,
      maxGlbBytes: 16 * 1024 * 1024,
      maxResponseBytes: 32 * 1024 * 1024,
    },
  );
  assert.equal(calls, 1);
  assert.equal(Buffer.from(rendered.glb).subarray(0, 4).toString(), 'glTF');
  assert.equal(port.executionImage(rendered), image);
  assert.equal(port.executionImage({ ...rendered }), undefined);
});

test('native evaluation requires outside-controller identity with otherwise valid stdout', async () => {
  for (const header of [undefined, 'latest', `sha256:${'A'.repeat(64)}`, `${image}, ${image}`]) {
    const port = createNativeEvaluatorPort({
      fetch: async (request) => {
        const data = JSON.parse(await evaluateEvaluatorRequestV2(await request.text()));
        return Response.json(data, { headers: header ? { 'x-kiln-execution-image': header } : {} });
      },
    });
    await assert.rejects(port.render(source), (error) => error.code === 'WORKER_FAILED');
  }
});

test('native evaluation rejects forged response identity and invalid UTF-8', async () => {
  const forged = createNativeEvaluatorPort({
    fetch: async (request) => {
      const result = JSON.parse(await evaluateEvaluatorRequestV2(await request.text()));
      result.requestId = 'other-request';
      return Response.json(result, { headers: { 'x-kiln-execution-image': image } });
    },
  });
  await assert.rejects(forged.render(source), (error) => error.code === 'PROTOCOL_ERROR');
  const invalid = createNativeEvaluatorPort({
    fetch: async () =>
      new Response(new Uint8Array([0xff]), {
        headers: { 'x-kiln-execution-image': image },
      }),
  });
  await assert.rejects(invalid.render(source), (error) => error.code === 'WORKER_FAILED');
});

test('native evaluation bounds declared and streamed output and redacts upstream errors', async () => {
  for (const make of [
    () => new Response('PRIVATE_SOURCE_PATH', { status: 503 }),
    () => new Response('private', { headers: { 'content-length': '999999999' } }),
    () => new Response('x'.repeat(2049), { headers: { 'x-kiln-execution-image': image } }),
  ]) {
    const port = createNativeEvaluatorPort({ fetch: async () => make() });
    await assert.rejects(port.render(source, {}, { maxResponseBytes: 2048 }), (error) => {
      assert.doesNotMatch(error.message, /PRIVATE_SOURCE_PATH|private|x{20}/);
      return error.code === 'WORKER_FAILED';
    });
  }
});

test('overlapping evaluations retain their own controller image identity', async () => {
  let started,
    finish,
    calls = 0;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const released = new Promise((resolve) => {
    finish = resolve;
  });
  const other = `sha256:${'b'.repeat(64)}`;
  const port = createNativeEvaluatorPort({
    fetch: async (request) => {
      const first = ++calls === 1;
      const output = new TextEncoder().encode(
        await evaluateEvaluatorRequestV2(await request.text()),
      );
      return new Response(
        new ReadableStream({
          async start(controller) {
            if (first) {
              started();
              await released;
            }
            controller.enqueue(output);
            controller.close();
          },
        }),
        { headers: { 'x-kiln-execution-image': first ? image : other } },
      );
    },
  });
  const first = port.render(source);
  await ready;
  const second = await port.render(source);
  finish();
  assert.equal(port.executionImage(await first), image);
  assert.equal(port.executionImage(second), other);
});

test('native evaluation cancellation reaches a pending response body', async () => {
  const controller = new AbortController();
  let signal,
    cancelled = false,
    started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const port = createNativeEvaluatorPort({
    fetch: async (request) => {
      signal = request.signal;
      return new Response(
        new ReadableStream({
          pull() {
            started();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'x-kiln-execution-image': image } },
      );
    },
  });
  const pending = port.render(source, {}, { signal: controller.signal });
  await ready;
  controller.abort(new Error('PRIVATE_ABORT_REASON'));
  await assert.rejects(
    pending,
    (error) => error.code === 'CANCELLED' && !error.message.includes('PRIVATE'),
  );
  assert.equal(signal.aborted, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('native evaluation has no local fallback on transport failure or deadline', async () => {
  let lateCancelled = false;
  const deadline = createNativeEvaluatorPort({
    fetch: async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return new Response(
        new ReadableStream({
          cancel() {
            lateCancelled = true;
          },
        }),
      );
    },
  });
  await assert.rejects(
    deadline.render(source, {}, { deadlineMs: 25 }),
    (error) => error.code === 'DEADLINE_EXCEEDED',
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(lateCancelled, true);
  const failed = createNativeEvaluatorPort({
    fetch: async () => {
      throw new Error('PRIVATE_NETWORK_PATH');
    },
  });
  await assert.rejects(
    failed.render(source),
    (error) => error.code === 'WORKER_FAILED' && !error.message.includes('PRIVATE'),
  );
});

test('invalid controls and already-cancelled calls cannot dispatch native evaluation', async () => {
  let calls = 0;
  const port = createNativeEvaluatorPort({
    fetch: async () => {
      calls++;
      throw new Error('Must not dispatch');
    },
  });
  for (const controls of [
    { deadlineMs: 0 },
    { maxGlbBytes: -1 },
    { maxResponseBytes: NaN },
    { signal: AbortSignal.abort() },
  ])
    await assert.rejects(port.render(source, {}, controls));
  assert.equal(calls, 0);
});
