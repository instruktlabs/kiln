import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, sep } from 'node:path';

let IntegratedBudget, runIntegratedOnce, integratedSource, integratedCases;
before(async () => {
  for (const name of ['integrated-budget', 'integrated-run']) {
    const output = new URL(`../../.cache/integrated-test/${name}.mjs`, import.meta.url);
    await build({
      entryPoints: [fileURLToPath(new URL(`../probe/${name}.ts`, import.meta.url))],
      outfile: fileURLToPath(output),
      bundle: true,
      format: 'esm',
      platform: 'node',
    });
    const value = await import(output);
    if (name === 'integrated-budget') ({ IntegratedBudget } = value);
    else ({ runIntegratedOnce, integratedSource, integratedCases } = value);
  }
});
function storage() {
  const values = new Map();
  let tail = Promise.resolve();
  const api = {
    get: async (k) => structuredClone(values.get(k)),
    put: async (k, v) => {
      values.set(k, structuredClone(v));
    },
    transaction(fn) {
      const p = tail.then(() => fn(api));
      tail = p.catch(() => {});
      return p;
    },
  };
  return api;
}
test('the trial budget never reopens and bounds every kind across retries and reconstruction', async () => {
  const store = storage(),
    budget = new IntegratedBudget(store);
  await assert.rejects(budget.claim('coordinator', 'a'.repeat(64)));
  await budget.open();
  await assert.rejects(budget.open());
  for (const [kind, max] of [
    ['coordinator', 9],
    ['evaluation', 4],
    ['render', 4],
  ]) {
    for (let i = 0; i < max; i++) await budget.claim(kind, i.toString(16).padStart(64, '0'));
    await assert.rejects(budget.claim(kind, 'f'.repeat(64)));
    await assert.rejects(budget.claim(kind, '0'.repeat(64)));
  }
  assert.equal((await budget.status()).claims.length, 17);
  await budget.close();
  await assert.rejects(new IntegratedBudget(store).open());
  await assert.rejects(new IntegratedBudget(store).claim('render', 'e'.repeat(64)));
});
function fixture(failAt) {
  const calls = [],
    evidence = [];
  let paused = false,
    opened = 0,
    closed = 0;
  const ref = `p_${'a'.repeat(64)}`,
    asset = { assetId: 'fixture', revisionId: 'v1' };
  const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const ports = {
    open: async () => {
      opened++;
    },
    close: async () => {
      closed++;
    },
    pause: async () => {
      paused = true;
    },
    status: async () => ({ activeRequests: 0, pendingCleanup: 0, paused, maxConcurrent: 1 }),
    retain: async (name, bytes) => {
      evidence.push({ name, bytes });
    },
    async dispatch(owner, request) {
      const input = await request.json();
      calls.push({ owner, input });
      const index = calls.length;
      if (index === 10) return new Response('quota', { status: 429 });
      if (index === failAt) return new Response('private failure', { status: 503 });
      let result;
      if (index === 1)
        result = {
          ...text({
            ok: true,
            programRef: ref,
            viewFidelity: { delivered: 'full-material', degraded: false },
          }),
          content: [
            ...text({
              ok: true,
              programRef: ref,
              viewFidelity: { delivered: 'full-material', degraded: false },
            }).content,
            { type: 'image', data: 'cG5n', mimeType: 'image/png' },
          ],
        };
      if (index === 2) result = text({ ok: true, asset });
      if (index === 3) result = text({ ok: true, programRef: ref, asset });
      if (index === 4) result = text({ programRef: ref, code: integratedSource, nextOffset: null });
      if (index === 5) result = text({ ok: true, asset });
      if (index === 6)
        result = {
          contents: [
            { blob: Buffer.from('glTFfixture').toString('base64'), mimeType: 'model/gltf-binary' },
          ],
        };
      if (index === 7)
        result = {
          contents: [
            {
              text: JSON.stringify({
                assetId: 'fixture',
                revisionId: 'v1',
                preview: { fidelity: { delivered: 'full-material', degraded: false } },
                build: { engine: 'fixture-identity' },
              }),
            },
          ],
        };
      if (index === 8) result = { isError: true, content: [{ type: 'text', text: 'not found' }] };
      if (index === 9)
        return Response.json({
          jsonrpc: '2.0',
          id: input.id,
          error: { code: -32603, message: 'not found' },
        });
      return Response.json({ jsonrpc: '2.0', id: input.id, result });
    },
  };
  return {
    ports,
    calls,
    evidence,
    get opened() {
      return opened;
    },
    get closed() {
      return closed;
    },
    get paused() {
      return paused;
    },
  };
}
test('the fixed trial checks fresh-request lifecycle, tenant denial and quota rejection exactly once', async () => {
  const s = storage(),
    f = fixture();
  const first = await runIntegratedOnce(s, f.ports);
  assert.equal(first.passed, true);
  assert.equal(first.results.length, 10);
  assert.equal(f.calls.length, 10);
  assert.equal(f.opened, 1);
  assert.equal(f.closed, 1);
  assert.equal(f.paused, true);
  assert.equal(f.evidence.length, 10);
  assert.deepEqual(
    first.results.map((r) => r.name),
    integratedCases,
  );
  assert.notEqual(f.calls[0].owner, f.calls[7].owner);
  assert.deepEqual(await runIntegratedOnce(s, f.ports), first);
  assert.equal(f.calls.length, 10);
});
test('a failed case stops further requests and still closes the budget and pauses admission', async () => {
  const f = fixture(3),
    result = await runIntegratedOnce(storage(), f.ports);
  assert.equal(result.passed, false);
  assert.equal(f.calls.length, 3);
  assert.equal(f.closed, 1);
  assert.equal(f.paused, true);
  assert(!JSON.stringify(result).includes('private failure'));
});
test('unconfirmed final cleanup cannot produce a passing trial', async () => {
  const f = fixture();
  f.ports.status = async () => ({
    activeRequests: f.paused ? 1 : 0,
    pendingCleanup: f.paused ? 1 : 0,
    paused: f.paused,
    maxConcurrent: 1,
  });
  const result = await runIntegratedOnce(storage(), f.ports);
  assert.equal(result.passed, false);
  assert.equal(result.cleanupConfirmed, false);
});

async function workerFixture() {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../probe/integrated-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  return new Miniflare({
    ...convertV4MiniflareOptions({
      workers: [
        {
          name: 'private-integration',
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          compatibilityFlags: ['enable_ctx_exports', 'enable_request_signal'],
          durableObjects: Object.fromEntries(
            Object.entries({
              RUN: 'KilnIntegratedRun',
              BUDGET: 'KilnIntegratedBudget',
              ADMISSION: 'KilnAdmission',
              TENANTS: 'KilnTenant',
              REQUESTS: 'IntegratedRequestJob',
              EVALUATIONS: 'IntegratedEvaluationJob',
              RENDERS: 'IntegratedRenderJob',
            }).map(([binding, className]) => [binding, { className, useSQLite: true }]),
          ),
          bindings: {
            PUBLIC_ORIGIN: 'https://kiln.instruktlabs.com',
            STORAGE_MAX_BYTES: '67108864',
            STORAGE_MAX_OBJECTS: '256',
            STORAGE_MAX_GROUPS: '64',
            COMPUTE_MAX_CONCURRENT: '1',
            COMPUTE_TENANT_PER_MINUTE: '9',
            COMPUTE_TENANT_PER_DAY: '9',
            COMPUTE_GLOBAL_PER_DAY: '9',
            COMPUTE_GLOBAL_PER_MONTH: '9',
            COMPUTE_DEADLINE_MS: '120000',
          },
          r2Buckets: ['ARTIFACTS'],
          outboundService: async () => {
            throw new Error('No external network in local trial fixture');
          },
        },
        {
          name: 'operator',
          modules: true,
          compatibilityDate: '2026-10-06',
          serviceBindings: {
            PROBE: { name: 'private-integration', entrypoint: 'KilnIntegratedControl' },
          },
          durableObjects: {
            REQUESTS: {
              className: 'IntegratedRequestJob',
              scriptName: 'private-integration',
              useSQLite: true,
            },
          },
          script: `export default {async fetch(request,env){
            switch(new URL(request.url).pathname) {
              case '/closed-budget-request': {
                let cancelled=false, denied=false;
                let stopped;
                const cancellation=new Promise(resolve=>{stopped=resolve;});
                const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{}'));},cancel(){cancelled=true;stopped();}});
                const input=new Request('https://tenant.internal/mcp',{method:'POST',body});
                try{await env.REQUESTS.getByName('denied-budget').run('a'.repeat(43),input,Date.now()+60000);}catch{denied=true;}
                let timer;try{await Promise.race([cancellation,new Promise(resolve=>{timer=setTimeout(resolve,1000);})]);}finally{clearTimeout(timer);}
                return Response.json({cancelled,denied});
              }
              case '/status': return Response.json(await env.PROBE.status());
              case '/stop': return Response.json(await env.PROBE.stop());
              case '/run': return Response.json(await env.PROBE.runFixed());
              default: return env.PROBE.fetch(request);
            }
          }};`,
        },
      ],
    }),
    unsafeInspectDurableObjects: true,
  });
}

test('actual private RPC, admission and budget stop at a missing container and persist across eviction', async () => {
  const runtime = await workerFixture();
  try {
    const operator = await runtime.getWorker('operator');
    const rpc = async (path) => (await operator.fetch(`https://operator.invalid/${path}`)).json();
    assert.equal((await runtime.dispatchFetch('https://probe.invalid/run')).status, 404);
    assert.equal((await operator.fetch('https://operator.invalid/arbitrary')).status, 404);
    const first = await rpc('run');
    assert.equal(first.state, 'finished');
    assert.equal(first.passed, false);
    assert.equal(first.cleanupConfirmed, true);
    assert.equal(first.results.length, 1);
    assert.equal(first.results[0].name, 'render');
    assert.equal(first.results[0].status, 503);
    const status = await rpc('status');
    assert.deepEqual(status.admission, {
      paused: true,
      activeRequests: 0,
      pendingCleanup: 0,
      maxConcurrent: 1,
    });
    assert.equal(status.budget.state, 'closed');
    assert.equal(status.budget.claims.length, 1);
    assert.equal(status.budget.claims[0].kind, 'coordinator');
    const bucket = await runtime.getR2Bucket('ARTIFACTS', 'private-integration');
    assert.deepEqual(
      (await bucket.list()).objects.map((o) => o.key),
      ['probe-evidence/render.json'],
    );
    for (const [binding, className, name] of [
      ['RUN', 'KilnIntegratedRun', 'integrated-v1'],
      ['BUDGET', 'KilnIntegratedBudget', 'integrated-v1'],
      ['ADMISSION', 'KilnAdmission', 'global-v1'],
    ]) {
      const ns = await runtime.getDurableObjectNamespace(binding, 'private-integration');
      await runtime.unsafeEvictDurableObject('private-integration', className, {
        id: ns.idFromName(name).toString(),
      });
    }
    assert.deepEqual(await rpc('run'), first);
    assert.deepEqual(await rpc('stop'), status);
  } finally {
    await runtime.dispose();
  }
});

test('operator stop before the trial permanently closes its allowance without admitting a job', async () => {
  const runtime = await workerFixture();
  try {
    const operator = await runtime.getWorker('operator');
    const rpc = async (path) => (await operator.fetch(`https://operator.invalid/${path}`)).json();
    await rpc('stop');
    const result = await rpc('run');
    assert.equal(result.state, 'finished');
    assert.equal(result.passed, false);
    assert.equal(result.cleanupConfirmed, true);
    assert.deepEqual(result.results, []);
    const status = await rpc('status');
    assert.deepEqual(status.budget, { state: 'closed', claims: [] });
    assert.equal(status.admission.activeRequests, 0);
    assert.deepEqual(await rpc('closed-budget-request'), { cancelled: true, denied: true });
    assert.deepEqual((await rpc('status')).budget, status.budget);
    assert.deepEqual(await rpc('run'), result);
  } finally {
    await runtime.dispose();
  }
});

test('the prepared deployment keeps all execution private and pins bounded immutable images', async () => {
  const cache = fileURLToPath(new URL('../../.cache/', import.meta.url));
  const directory = await mkdtemp(resolve(cache, 'integrated-config-test-'));
  assert(directory.startsWith(resolve(cache) + sep));
  try {
    // Metadata fixture only: this does not install, authenticate or invoke cf.
    const metadata = resolve(directory, 'cf-package.json');
    await writeFile(metadata, JSON.stringify({ name: 'cf', version: '1.0.0-beta.12' }));
    const { stdout } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../scripts/build-integrated-probe.mjs', import.meta.url)),
      '--account',
      '0'.repeat(32),
      '--output',
      directory,
      '--cf-package',
      metadata,
    ]);
    const receipt = JSON.parse(stdout);
    assert.equal(receipt.deployed, false);
    assert.deepEqual(receipt.maxVmStarts, { coordinator: 9, evaluation: 4, render: 4, total: 17 });
    const output = resolve(directory, '.cloudflare/output/v0');
    const worker = JSON.parse(
      await readFile(resolve(output, 'workers/default/worker.config.json')),
    );
    assert.equal(worker.workersDev, false);
    assert.equal(worker.previewUrls, false);
    assert.deepEqual(worker.domains, []);
    assert.deepEqual(worker.triggers, []);
    assert.equal(worker.env.ARTIFACTS.name, 'kiln-private-integrated-v1-evidence');
    assert.equal(worker.env.COMPUTE_MAX_CONCURRENT.value, '1');
    assert.equal(worker.env.COMPUTE_GLOBAL_PER_MONTH.value, '9');
    assert.equal(worker.env.COMPUTE_DEADLINE_MS.value, '120000');
    assert.equal(
      Object.values(worker.exports).filter((e) => e.type === 'durable-object').length,
      7,
    );
    for (const [kind, key] of [
      ['coordinator', 'coordinator'],
      ['evaluation', 'kiln'],
      ['render', 'renderer'],
    ]) {
      const container = JSON.parse(
        await readFile(
          resolve(output, `containers/kiln-private-integrated-v1-${kind}/container.config.json`),
        ),
      );
      assert.equal(container.schedulingPolicy, 'durable-object');
      assert.equal(container.ssh.enabled, false);
      assert.equal(container.observability.logs.enabled, false);
      assert.deepEqual(Object.keys(container.images), [key]);
      assert.equal(
        container.images[key].reference,
        kind === 'coordinator' ? receipt.coordinator : receipt.software,
      );
      assert.match(container.images[key].reference, /@sha256:[a-f0-9]{64}$/);
    }
    assert(
      !receipt.inputs.some((input) =>
        /oauth|\/src\/(?:auth|github|google|browser-|account-)/.test(input.replaceAll('\\', '/')),
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
