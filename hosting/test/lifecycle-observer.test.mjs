import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

let observer;
before(async () => {
  const output = new URL('../../.cache/lifecycle-observer-test/observer.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../probe/lifecycle-observer.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  observer = (await import(output)).default;
});
const options = { method: 'POST', headers: { 'X-Kiln-Operator': 'private-lifecycle-v1' } };
const invoke = (path, env, init = options) =>
  observer.fetch(new Request(`http://127.0.0.1:8798/${path}`, init), env);

test('observer config stays loopback-only with exactly the fixed private control binding', async () => {
  const config = JSON.parse(
    await readFile(new URL('../probe/lifecycle-observer.wrangler.jsonc', import.meta.url), 'utf8'),
  );
  assert.deepEqual(config.dev, { ip: '127.0.0.1', port: 8798, local_protocol: 'http' });
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.deepEqual(config.observability, { enabled: false });
  assert.deepEqual(config.services, [
    {
      binding: 'PROBE',
      service: 'kiln-private-lifecycle-v1-operator',
      entrypoint: 'KilnLifecycleControl',
      remote: true,
    },
  ]);
});

test('loopback observer refuses browser traffic and arbitrary controls without calling RPC', async () => {
  const env = {
    PROBE: new Proxy(
      {},
      {
        get() {
          assert.fail('Unexpected control call');
        },
      },
    ),
  };
  for (const [url, init] of [
    ['http://127.0.0.1:8798/run-fixed', {}],
    ['http://127.0.0.1:8798/run-fixed', { method: 'POST' }],
    ['http://127.0.0.1:8798/run-fixed', { method: 'OPTIONS' }],
    ['http://attacker.invalid:8798/run-fixed', options],
    ['http://127.0.0.1:8799/run-fixed', options],
    ['http://127.0.0.1:8798/run-fixed?restart=1', options],
    ['http://127.0.0.1:8798/arbitrary', options],
    ...['Origin', 'Sec-Fetch-Site'].map((name) => [
      'http://127.0.0.1:8798/run-fixed',
      { ...options, headers: { ...options.headers, [name]: 'https://attacker.invalid' } },
    ]),
  ])
    assert.equal((await observer.fetch(new Request(url, init), env)).status, 404);
});

test('observer forwards only fixed controls, releases RPC capabilities and sends private JSON', async () => {
  const calls = [],
    disposed = [];
  const env = {
    PROBE: Object.fromEntries(
      ['runFixed', 'status', 'stop'].map((action) => [
        action,
        (...args) => {
          assert.deepEqual(args, []);
          calls.push(action);
          const result = { state: 'finished', passed: true };
          Object.defineProperty(result, Symbol.dispose, {
            value: () => disposed.push(`${action}-result`),
          });
          const work = Promise.resolve(result);
          work[Symbol.dispose] = () => disposed.push(`${action}-promise`);
          return work;
        },
      ]),
    ),
  };
  for (const [path, action] of [
    ['run-fixed', 'runFixed'],
    ['status', 'status'],
    ['stop', 'stop'],
  ]) {
    const response = await invoke(path, env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.has('access-control-allow-origin'), false);
    assert.deepEqual(await response.json(), { state: 'finished', passed: true });
    assert.deepEqual(disposed.slice(-2), [`${action}-result`, `${action}-promise`]);
  }
  assert.deepEqual(calls, ['runFixed', 'status', 'stop']);
});

test('observer failures redact RPC errors and never issue another operation', async () => {
  let calls = 0,
    disposed = 0;
  const env = {
    PROBE: {
      runFixed() {
        calls++;
        const work = Promise.reject(new Error('PRIVATE_CREDENTIAL_OR_DOWNLOAD'));
        work[Symbol.dispose] = () => disposed++;
        return work;
      },
    },
  };
  const response = await invoke('run-fixed', env);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /PRIVATE_CREDENTIAL_OR_DOWNLOAD/);
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
});

test('observer cancels uploaded input, passes no arguments and refuses oversized receipts', async () => {
  let cancelled = false,
    disposed = 0;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const result = { unused: 'x'.repeat(128 * 1024) };
  Object.defineProperty(result, Symbol.dispose, { value: () => disposed++ });
  const response = await invoke(
    'status',
    {
      PROBE: {
        status(...args) {
          assert.deepEqual(args, []);
          return Promise.resolve(result);
        },
      },
    },
    { ...options, body, duplex: 'half' },
  );
  assert.equal(cancelled, true);
  assert.equal(disposed, 1);
  assert.equal(response.status, 502);
  assert((await response.text()).length < 256);
});

test('observation deadlines release capabilities and discard late results without retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const [action, path, deadline] of [
    ['status', 'status', 10000],
    ['runFixed', 'run-fixed', 960000],
  ]) {
    let resolve,
      calls = 0,
      disposed = 0;
    const work = new Promise((done) => {
      resolve = done;
    });
    work[Symbol.dispose] = () => disposed++;
    const pending = invoke(path, {
      PROBE: {
        [action]() {
          calls++;
          return work;
        },
      },
    });
    t.mock.timers.tick(deadline);
    const response = await pending;
    assert.equal(response.status, 502);
    assert.equal(disposed, 1);
    const result = { state: 'finished' };
    Object.defineProperty(result, Symbol.dispose, { value: () => disposed++ });
    resolve(result);
    await new Promise((done) => setImmediate(done));
    assert.equal(disposed, 2);
    assert.equal(calls, 1);
  }
});
