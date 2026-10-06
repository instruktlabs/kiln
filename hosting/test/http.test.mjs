import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';

let readBounded;
let boundedRequest;
before(async () => {
  const output = new URL('../../.cache/hosted-http-test/http.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/http.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ readBounded, boundedRequest } = await import(output));
});

test('public body admission honors an already cancelled incoming request', async () => {
  const controller = new AbortController();
  controller.abort(new Error('private cancellation reason'));
  const request = new Request('https://kiln.example.com/mcp', {
    method: 'POST',
    body: '{}',
    signal: controller.signal,
  });
  await assert.rejects(
    boundedRequest(request, 32),
    (error) => error.status === 499 && error.message === 'Request cancelled',
  );
});

test('public body reads enforce elapsed time even while chunks keep timers queued', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      now += 6000;
      if (++pulls === 100) controller.close();
      else controller.enqueue(new Uint8Array());
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readBounded(body, 32),
    (error) => error.status === 408 && error.message === 'Request timed out',
  );
  assert.ok(pulls < 100);
  assert.equal(cancelled, true);
});

test('bounded bodies retain bytes when a stream reuses its read buffer', async () => {
  const shared = new Uint8Array(1);
  let value = 0;
  const body = new ReadableStream(
    {
      pull(controller) {
        if (++value === 4) return controller.close();
        shared[0] = value;
        controller.enqueue(shared);
      },
    },
    { highWaterMark: 0 },
  );
  assert.deepEqual(await readBounded(body, 32), new Uint8Array([1, 2, 3]));
});
