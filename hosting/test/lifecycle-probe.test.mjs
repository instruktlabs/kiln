import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

let LifecycleBudget, lifecycleBudget, runLifecycleOnce;
before(async () => {
  for (const name of ['lifecycle-budget', 'lifecycle-run']) {
    const output = new URL(`../../.cache/lifecycle-tests/${name}.mjs`, import.meta.url);
    await build({
      entryPoints: [fileURLToPath(new URL(`../probe/${name}.ts`, import.meta.url))],
      outfile: fileURLToPath(output),
      bundle: true,
      format: 'esm',
      platform: 'node',
    });
    const value = await import(output);
    if (name === 'lifecycle-budget') ({ LifecycleBudget, lifecycleBudget } = value);
    else ({ runLifecycleOnce } = value);
  }
});
function storage() {
  const values = new Map();
  let tail = Promise.resolve();
  const api = {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    transaction(fn) {
      const next = tail.then(() => fn(api));
      tail = next.catch(() => {});
      return next;
    },
  };
  return api;
}
test('native lifecycle allowance cannot refund or reopen and bounds concurrent claims', async () => {
  const store = storage(),
    budget = new LifecycleBudget(store);
  await assert.rejects(budget.claim('coordinator', 'a'.repeat(64)));
  await budget.open();
  await assert.rejects(budget.open());
  for (const [kind, maximum] of Object.entries(lifecycleBudget)) {
    const results = await Promise.allSettled(
      Array.from({ length: maximum + 3 }, (_, i) =>
        budget.claim(kind, i.toString(16).padStart(64, '0')),
      ),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, maximum);
    await assert.rejects(budget.claim(kind, '0'.repeat(64)));
  }
  assert.equal((await budget.status()).claims.length, 22);
  await budget.close();
  const reconstructed = new LifecycleBudget(store);
  await assert.rejects(reconstructed.open());
  await assert.rejects(reconstructed.claim('render', 'f'.repeat(64)));
});
test('closed or malformed native lifecycle allowances fail without allocating a claim', async () => {
  const stopped = new LifecycleBudget(storage());
  await stopped.close();
  await assert.rejects(stopped.open());
  const budget = new LifecycleBudget(storage());
  await budget.open();
  for (const kind of ['other', '__proto__', 'constructor'])
    await assert.rejects(budget.claim(kind, 'a'.repeat(64)));
  for (const id of ['', 'x'.repeat(64), `${'a'.repeat(64)}\n`])
    await assert.rejects(budget.claim('render', id));
  assert.equal((await budget.status()).claims.length, 0);
});
test('an interrupted native lifecycle record does not reopen or resume', async () => {
  const store = storage();
  const previous = { state: 'running', passed: false, results: [] };
  await store.put('native-lifecycle', previous);
  assert.deepEqual(
    await runLifecycleOnce(
      store,
      new Proxy(
        {},
        {
          get() {
            throw new Error('INTERRUPTED_RUN_TOUCHED_PORT');
          },
        },
      ),
    ),
    previous,
  );
});
function fixture() {
  let paused = true,
    calls = 0,
    retained = 0,
    closed = 0;
  const ports = {
    expectedImage: `sha256:${'b'.repeat(64)}`,
    open: async () => {
      paused = false;
    },
    close: async () => {
      closed++;
    },
    pause: async () => {
      paused = true;
    },
    status: async () => ({ paused, activeRequests: 0, pendingCleanup: 0 }),
    mcp: async () => {
      calls++;
      return new Response(new Uint8Array(8 * 1024 * 1024 + 1));
    },
    retain: async () => {
      retained++;
    },
  };
  return { ports, counts: () => ({ paused, calls, retained, closed }) };
}
test('native lifecycle stops before retaining an oversized response and seals admission', async () => {
  const f = fixture(),
    result = await runLifecycleOnce(storage(), f.ports);
  assert.equal(result.passed, false);
  assert.equal(result.admissionIdleAndPaused, true);
  assert.equal(result.results.length, 1);
  assert.deepEqual(f.counts(), { paused: true, calls: 1, retained: 0, closed: 1 });
});
// Exercise the production ten-second evidence deadline, not an injected shorter timeout.
test('a stalled evidence write cannot resume a failed lifecycle after its deadline', {
  timeout: 20000,
}, async () => {
  const f = fixture(),
    store = storage();
  let finish;
  f.ports.mcp = async () => new Response('{}');
  f.ports.retain = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const started = Date.now();
  const result = await runLifecycleOnce(store, f.ports);
  assert(Date.now() - started >= 9500);
  assert.equal(result.passed, false);
  assert.equal(result.admissionIdleAndPaused, true);
  assert.equal(result.results.length, 1);
  assert.equal(f.counts().closed, 1);
  finish();
  await Promise.resolve();
  assert.deepEqual(await store.get('native-lifecycle'), result);
});
