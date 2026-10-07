import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
let observer;
before(async () => {
  const output = new URL('../../.cache/operations-observer-test.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../probe/operations-observer.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  observer = (await import(output)).default;
});
test('local operations observer rejects browser-origin, foreign-host and caller-controlled RPC inputs', async () => {
  let calls = 0;
  const env = {
    PROBE: {
      begin: async () => {
        calls++;
        return {};
      },
    },
  };
  for (const [url, init] of [
    ['http://localhost:8799/begin', {}],
    ['http://127.0.0.1:8799/begin?run=2', {}],
    ['http://127.0.0.1:8799/begin', { method: 'GET' }],
    ['http://127.0.0.1:8799/begin', { headers: { Origin: 'https://example.com' } }],
    ['http://127.0.0.1:8799/begin', { headers: { 'Sec-Fetch-Site': 'cross-site' } }],
    ['http://127.0.0.1:8799/arbitrary-method', {}],
  ]) {
    const r = new Request(url, {
      method: 'POST',
      ...init,
      headers: { 'X-Kiln-Operator': 'private-operations-v1', ...init.headers },
    });
    assert.equal((await observer.fetch(r, env)).status, 404);
  }
  assert.equal(calls, 0);
  const response = await observer.fetch(
    new Request('http://127.0.0.1:8799/begin', {
      method: 'POST',
      headers: { 'X-Kiln-Operator': 'private-operations-v1' },
      body: 'untrusted arguments',
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test('observer configuration binds only the fixed private control and stays loopback-only', async () => {
  const config = JSON.parse(
    await readFile(new URL('../probe/operations-observer.wrangler.jsonc', import.meta.url), 'utf8'),
  );
  assert.deepEqual(config.dev, { ip: '127.0.0.1', port: 8799, local_protocol: 'http' });
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.deepEqual(config.services, [
    {
      binding: 'PROBE',
      service: 'kiln-private-operations-v1-operator',
      entrypoint: 'KilnOperationsControl',
      remote: true,
    },
  ]);
});

test('observer exposes only aggregate cleanup inspection with no caller arguments', async () => {
  const expected = { alarmAt: null, privateStatePresent: false };
  const response = await observer.fetch(
    new Request('http://127.0.0.1:8799/inspect', {
      method: 'POST',
      headers: { 'X-Kiln-Operator': 'private-operations-v1' },
    }),
    {
      PROBE: {
        inspect: async (...args) => {
          assert.deepEqual(args, []);
          return expected;
        },
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
});
