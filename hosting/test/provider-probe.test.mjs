import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runProbeOnce;
let probeCases;
test('the manifest qualification has no public route or automatic trigger and pins the proven runtime image', async () => {
  const config = JSON.parse(
    await readFile(new URL('../probe/qualification.wrangler.jsonc', import.meta.url), 'utf8'),
  );
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.triggers, undefined);
  assert.equal(config.main, './worker.ts');
  assert.equal(config.containers.length, 1);
  assert.equal(config.containers[0].scheduling_policy, 'durable_object');
  assert.equal(config.containers[0].class_name, 'KilnProbeJob');
  assert.equal(config.containers[0].observability.logs.enabled, false);
  assert.equal(
    config.containers[0].images.kiln.image,
    'registry.cloudflare.com/56adffd40534f7fe110fc661a40bbf53/kiln-evaluation@sha256:db79551579a9abd33f7589a4da4d57947364ddf3dd37b79f766e202f2703edc8',
  );
  assert.deepEqual(config.exports, {
    KilnProbeControl: { type: 'worker' },
    KilnProbeRun: { type: 'durable-object', storage: 'sqlite' },
    KilnProbeJob: { type: 'durable-object', storage: 'sqlite' },
  });
});
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
  // The fixed candidate has four cases. Any new deployment requires its own
  // approval; this code cannot reset the exhausted earlier trial allowance.
  assert.deepEqual(probeCases, ['engine-a', 'network', 'write-marker', 'read-marker']);
  assert.deepEqual(called, probeCases);
  assert.equal(final.state, 'finished');
  assert.equal(final.results.length, 4);
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

test('private service RPC can trigger only the fixed retained probe and exposes no HTTP execution', async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../probe/worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'private-probe',
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          compatibilityFlags: ['enable_ctx_exports'],
          durableObjects: {
            RUN: { className: 'KilnProbeRun', useSQLite: true },
            JOB: { className: 'KilnProbeJob', useSQLite: true },
          },
        },
        {
          name: 'operator',
          modules: true,
          compatibilityDate: '2026-10-06',
          serviceBindings: {
            PROBE: { name: 'private-probe', entrypoint: 'KilnProbeControl' },
          },
          script: `export default {
            async fetch(request, env) {
              if (new URL(request.url).pathname === '/denied') return env.PROBE.fetch(request);
              return Response.json(await env.PROBE.runFixed());
            }
          }`,
        },
      ],
    }),
  );
  try {
    const operator = await runtime.getWorker('operator');
    const denied = await operator.fetch('http://localhost/denied', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(denied.status, 404);
    const first = await (await operator.fetch('http://localhost/run')).json();
    assert.deepEqual(first, {
      state: 'finished',
      results: [{ name: 'engine-a', passed: false, reason: 'CONTAINER_UNAVAILABLE' }],
    });
    const second = await (await operator.fetch('http://localhost/run')).json();
    assert.deepEqual(second, first);
  } finally {
    await runtime.dispose();
  }
});
