import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';

let NativeHttpClient;
before(async () => {
  const output = new URL('../../.cache/hosted-http-test/client.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-http.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ NativeHttpClient } = await import(output));
});

test('a continuously readable body cannot starve the storage deadline timer', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let pulls = 0;
  let cancelled = false;
  const client = new NativeHttpClient({
    timeoutMs: 25,
    fetch: async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            now += 10;
            if (++pulls === 100) controller.close();
            else controller.enqueue(new Uint8Array());
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  await assert.rejects(
    client.bytes('/internal/programs', { limit: 32 }),
    (error) => error.status === 504 && error.message === 'Storage request timed out',
  );
  assert.ok(pulls < 100, 'Stop reading even while microtasks prevent timer delivery');
  assert.equal(cancelled, true);
});

test('a response arriving after the deadline cannot bypass it before timers run', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let signal;
  const client = new NativeHttpClient({
    timeoutMs: 25,
    fetch: async (request) => {
      signal = request.signal;
      now += 30;
      return new Response('ok');
    },
  });
  await assert.rejects(
    client.bytes('/internal/programs', { limit: 32 }),
    (error) => error.status === 504 && error.message === 'Storage request timed out',
  );
  assert.equal(signal.aborted, true);
});
