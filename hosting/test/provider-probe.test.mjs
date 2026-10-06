import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runProbeOnce;
let probeCases;
before(async () => {
  const output = new URL('../../.cache/hosted-probe-test/run-once.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../probe/run-once.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ runProbeOnce, probeCases } = await import(output));
});

function storage() {
  const records = new Map();
  let tail = Promise.resolve();
  const store = {
    async get(key) {
      return structuredClone(records.get(key));
    },
    async put(key, value) {
      records.set(key, structuredClone(value));
    },
    transaction(callback) {
      const result = tail.then(() => callback(store));
      tail = result.catch(() => {});
      return result;
    },
  };
  return store;
}

test('private probe claims its fixed budget once across concurrent and later triggers', async () => {
  const store = storage();
  const called = [];
  const execute = async (name) => {
    called.push(name);
    return { name, passed: true };
  };
  await Promise.all([runProbeOnce(store, execute), runProbeOnce(store, execute)]);
  const final = await runProbeOnce(store, execute);
  assert.deepEqual(called, probeCases);
  assert.equal(final.state, 'finished');
  assert.equal(final.results.length, 5);
});

test('private probe stops after a failed case and does not spend again on retry', async () => {
  const store = storage();
  let count = 0;
  const execute = async (name) => {
    count++;
    return { name, passed: false, reason: 'CHECK_FAILED' };
  };
  assert.equal((await runProbeOnce(store, execute)).results[0].passed, false);
  await runProbeOnce(store, execute);
  assert.equal(count, 1);
});

test('an interrupted claim is not silently replayed and exceptions do not disclose details', async () => {
  const store = storage();
  await store.put('run', { state: 'running', results: [] });
  await runProbeOnce(store, async () => {
    throw new Error('must never run');
  });
  const failure = await runProbeOnce(storage(), async () => {
    throw new Error('private diagnostic');
  });
  assert.deepEqual(failure.results, [{ name: 'engine-a', passed: false, reason: 'PROBE_FAILED' }]);
});

test('the private Worker exposes no HTTP execution and its loopback namespaces fail closed without a container', async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./provider-probe-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      compatibilityFlags: ['enable_ctx_exports'],
      durableObjects: {
        RUN: { className: 'KilnProbeRun', useSQLite: true },
        JOB: { className: 'KilnProbeJob', useSQLite: true },
      },
      outboundService: async () => {
        throw new Error('No external requests');
      },
    }),
  );
  try {
    const denied = await runtime.dispatchFetch('http://localhost/execute', {
      method: 'POST',
      body: '{"code":"arbitrary"}',
    });
    assert.equal(denied.status, 404);
    const first = await (await runtime.dispatchFetch('http://localhost/test-trigger')).json();
    assert.equal(first.state, 'finished');
    assert.deepEqual(first.results, [
      { name: 'engine-a', passed: false, reason: 'CONTAINER_UNAVAILABLE' },
    ]);
    const second = await (await runtime.dispatchFetch('http://localhost/test-trigger')).json();
    assert.deepEqual(second, first);
  } finally {
    await runtime.dispose();
  }
});
