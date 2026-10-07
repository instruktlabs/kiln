import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let handleEvaluationRequest, handleRenderRequest;
before(async () => {
  const output = new URL('../../.cache/hosted-evaluation-request/handler.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/evaluation-request.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ handleEvaluationRequest, handleRenderRequest } = await import(output));
});

function request(options = {}) {
  return new Request(options.url ?? 'http://kiln-evaluator.internal/evaluate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '2',
      'x-kiln-deadline-ms': '30000',
      'x-kiln-max-response-bytes': '4096',
      ...options.headers,
    },
    body: options.body ?? '{}',
    duplex: 'half',
    signal: options.signal,
  });
}

test('private rendering admits its own bounds but denies evaluation routes and caller authority', async () => {
  const url = 'http://kiln-renderer.internal/render';
  let calls = 0;
  const job = {
    run: async (bytes, controls) => {
      calls++;
      assert.equal(controls.maxResponseBytes, 20 * 1024 * 1024);
      return bytes;
    },
  };
  const valid = await handleRenderRequest(
    request({ url, headers: { 'x-kiln-max-response-bytes': String(20 * 1024 * 1024) } }),
    job,
  );
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), '{}');
  for (const options of [
    { url: 'http://kiln-evaluator.internal/evaluate' },
    { headers: { 'x-kiln-deadline-ms': '30001' } },
    { headers: { 'content-length': String(6 * 1024 * 1024 + 1) } },
    { headers: { 'x-kiln-max-response-bytes': String(20 * 1024 * 1024 + 1) } },
    { headers: { 'x-image': 'other' } },
    { headers: { authorization: 'Bearer PRIVATE' } },
  ]) {
    const result = await handleRenderRequest(request({ url, ...options }), job);
    assert(result.status >= 400);
  }
  assert.equal(calls, 1);
});

test('private evaluator forwards only bounded bytes and controls and waits for the job to settle', async () => {
  let entered, finish;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  let returned = false;
  const pending = handleEvaluationRequest(request(), {
    executionImage: () => `registry.cloudflare.com/fixture/kiln@sha256:${'a'.repeat(64)}`,
    async run(bytes, controls) {
      assert.equal(new TextDecoder().decode(bytes), '{}');
      assert.ok(controls.deadlineMs > 0 && controls.deadlineMs <= 30000);
      assert.equal(controls.maxResponseBytes, 4096);
      assert.deepEqual(Object.keys(controls).sort(), ['deadlineMs', 'maxResponseBytes', 'signal']);
      entered();
      await done;
      return new TextEncoder().encode('{"opaque":"engine validates this"}');
    },
  }).then((value) => {
    returned = true;
    return value;
  });
  await started;
  assert.equal(returned, false);
  finish();
  const result = await pending;
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('content-type'), 'application/json');
  assert.equal(result.headers.get('x-kiln-execution-image'), `sha256:${'a'.repeat(64)}`);
  const bytes = await result.arrayBuffer();
  assert.equal(Number(result.headers.get('content-length')), bytes.byteLength);
});

test('evaluator output cannot claim its own image identity or omit the host proof', async () => {
  for (const identity of [undefined, 'mutable:latest', `sha256:${'a'.repeat(64)}`]) {
    const result = await handleEvaluationRequest(request(), {
      run: async () => new TextEncoder().encode('{"image":"forged","ok":true}'),
      executionImage: () => identity,
    });
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('x-kiln-execution-image'), null);
  }
  const forged = await handleEvaluationRequest(
    request({ headers: { 'x-kiln-execution-image': `sha256:${'a'.repeat(64)}` } }),
    { run: async () => assert.fail('caller identity must be rejected before execution') },
  );
  assert.equal(forged.status, 400);
});

test('private evaluator rejects authority, route and malformed limits before starting compute', async () => {
  let calls = 0;
  const job = {
    run: async () => {
      calls++;
      throw new Error('must not execute');
    },
  };
  for (const options of [
    { url: 'https://kiln-evaluator.internal/evaluate' },
    { url: 'http://kiln-evaluator.internal/evaluate?tenant=other' },
    { url: 'http://kiln-evaluator.internal/evaluate#fragment' },
    { url: 'http://kiln-evaluator.internal/other' },
    { headers: { authorization: 'Bearer PRIVATE' } },
    { headers: { cookie: 'PRIVATE' } },
    { headers: { 'x-tenant': 'other' } },
    { headers: { 'x-kiln-deadline-ms': '60001' } },
    { headers: { 'x-kiln-deadline-ms': '0' } },
    { headers: { 'x-kiln-deadline-ms': 'NaN' } },
    { headers: { 'x-kiln-max-response-bytes': '8388609' } },
    { headers: { 'content-length': '4194305' } },
    { headers: { 'content-length': '1' } },
    { headers: { 'content-type': 'text/plain' } },
    { body: 'x'.repeat(4 * 1024 * 1024 + 1) },
    { signal: AbortSignal.abort('PRIVATE') },
  ]) {
    const result = await handleEvaluationRequest(request(options), job);
    assert.ok(result.status >= 400, JSON.stringify(options));
    assert.doesNotMatch(await result.text(), /PRIVATE|other/);
  }
  assert.equal(calls, 0);
});

test('private evaluator propagates cancellation without reporting an unconfirmed cleanup as success', async () => {
  const abort = new AbortController();
  let entered, finish;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  let executionSignal,
    returned = false;
  const pending = handleEvaluationRequest(request({ signal: abort.signal }), {
    async run(_bytes, controls) {
      executionSignal = controls.signal;
      entered();
      await done;
      throw new Error('PRIVATE_CLEANUP_FAILURE');
    },
  }).then((value) => {
    returned = true;
    return value;
  });
  await started;
  abort.abort('PRIVATE_REASON');
  assert.equal(executionSignal.aborted, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned, false);
  finish();
  const response = await pending;
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /PRIVATE/);
});

test('private evaluator rechecks output bounds and returns fixed errors for bad job output', async () => {
  for (const output of [new Uint8Array(), new Uint8Array(4097), 'PRIVATE', null]) {
    const response = await handleEvaluationRequest(request(), { run: async () => output });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
});

test('reading a stalled request consumes the evaluation deadline without starting compute', async () => {
  let cancelled = false;
  let calls = 0;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const result = await handleEvaluationRequest(
    request({
      headers: { 'x-kiln-deadline-ms': '25' },
      body,
    }),
    {
      run: async () => {
        calls++;
        return new Uint8Array([1]);
      },
    },
  );
  assert.equal(result.status, 504);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});
