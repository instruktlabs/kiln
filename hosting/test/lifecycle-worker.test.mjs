import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { lifecycleConfig } from '../probe/lifecycle-config.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';
import { migrateAccounts } from './database.mjs';

const c = lifecycleConfig(lifecycleManifest),
  bundles = {};
before(async () => {
  for (const [role, entry] of Object.entries(c.entries)) {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      conditions: ['workerd'],
      external: ['cloudflare:workers'],
      metafile: true,
    });
    bundles[role] = result.outputFiles[0].text;
    const inputs = Object.keys(result.metafile.inputs).join('\n').replaceAll('\\', '/');
    if (role !== 'operator')
      assert.doesNotMatch(inputs, /qualification-accounts|lifecycle-run|gateway-preflight/);
    if (['request', 'evaluation', 'render'].includes(role))
      assert.doesNotMatch(inputs, /oauth|\/src\/(?:auth|google|github|browser-|account-)/);
  }
});
function worker(role) {
  const config = c.workers[role];
  const result = {
    name: config.name,
    modules: true,
    script: bundles[role],
    compatibilityDate: config.compatibilityDate,
    compatibilityFlags: config.compatibilityFlags,
    bindings: {},
    durableObjects: {},
    serviceBindings: {},
    kvNamespaces: {},
    d1Databases: {},
    r2Buckets: {},
    ratelimits: {},
    outboundService: () => {
      throw new Error('No external network in private lifecycle fixture');
    },
  };
  for (const [name, binding] of Object.entries(config.env)) {
    switch (binding.type) {
      case 'text':
        result.bindings[name] = binding.value;
        break;
      case 'durable-object':
        result.durableObjects[name] = {
          className: binding.exportName,
          scriptName: binding.worker,
          useSQLite: true,
        };
        break;
      case 'worker':
        result.serviceBindings[name] = { name: binding.worker, entrypoint: binding.exportName };
        break;
      case 'd1':
        result.d1Databases[name] = binding.id;
        break;
      case 'kv':
        result.kvNamespaces[name] = binding.id;
        break;
      case 'r2':
        result.r2Buckets[name] = binding.name;
        break;
      case 'rate-limit':
        result.ratelimits[name] = { namespace_id: binding.namespace, simple: binding.simple };
        break;
      case 'analytics-engine-dataset':
        break;
      default:
        assert.fail(`Unexpected binding ${binding.type}`);
    }
  }
  for (const [name, exported] of Object.entries(config.exports))
    if (exported.type === 'durable-object')
      result.durableObjects[`REGISTER_${name}`] = { className: name, useSQLite: true };
  return result;
}
async function fixture(fault) {
  const runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      workers: [
        ...Object.keys(c.entries).map((role) => {
          const value = worker(role);
          if (role === 'gateway' && fault === 'database')
            value.d1Databases.ACCOUNTS = '22222222-2222-2222-2222-222222222222';
          if (role === 'operator' && fault === 'uncertain-cleanup')
            value.serviceBindings.CONTROL = { name: 'uncertain-control', entrypoint: 'Control' };
          return value;
        }),
        {
          name: 'uncertain-control',
          modules: true,
          compatibilityDate: '2026-10-06',
          script: `import {WorkerEntrypoint} from 'cloudflare:workers';
          export class Control extends WorkerEntrypoint {
            setPaused(){return {paused:true,activeRequests:1,pendingCleanup:1};}
          }
          export default {fetch(){return new Response('Not found',{status:404});}};`,
        },
        {
          name: 'local-observer',
          modules: true,
          compatibilityDate: '2026-10-06',
          serviceBindings: {
            PROBE: { name: c.workers.operator.name, entrypoint: 'KilnLifecycleControl' },
          },
          durableObjects: {
            REQUEST: {
              className: 'KilnNativeRequest',
              scriptName: c.workers.request.name,
              useSQLite: true,
            },
            EVALUATION: {
              className: 'KilnEvaluationJob',
              scriptName: c.workers.evaluation.name,
              useSQLite: true,
            },
            RENDER: {
              className: 'KilnRenderJob',
              scriptName: c.workers.render.name,
              useSQLite: true,
            },
          },
          script: `export default {async fetch(request,env){
          switch(new URL(request.url).pathname){
            case '/run': {using result=await env.PROBE.runFixed();return Response.json(result);}
            case '/stop': {using result=await env.PROBE.stop();return Response.json(result);}
            case '/status': {using result=await env.PROBE.status();return Response.json(result);}
            case '/denied': {
              const outcomes=[];
              for(const name of ['REQUEST','EVALUATION','RENDER']) {
                let cancelled=false,denied=false,done;
                const cancellation=new Promise(resolve=>{done=resolve;});
                const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{}'));},cancel(){cancelled=true;done();}});
                const input=new Request('https://native.invalid/mcp',{method:'POST',body});
                try {
                  const stub=env[name].getByName('closed-budget');
                  if(name==='REQUEST') await stub.run('a'.repeat(43),input,Date.now()+60000);
                  else await stub.fetch(input);
                } catch { denied=true; }
                let timer;
                try {await Promise.race([cancellation,new Promise(resolve=>{timer=setTimeout(resolve,1000);})]);}
                finally {clearTimeout(timer);}
                outcomes.push({name,cancelled,denied});
              }
              return Response.json(outcomes);
            }
            default: return new Response('Not found',{status:404});
          }
        }};`,
        },
      ],
    }),
    unsafeInspectDurableObjects: true,
  });
  try {
    const name = c.workers.operator.name;
    const database = await runtime.getD1Database('ACCOUNTS', name);
    await migrateAccounts(database);
    const namespace = await runtime.getDurableObjectNamespace('RUN', name);
    const observer = await runtime.getWorker('local-observer');
    const call = async (path) => (await observer.fetch(`https://observer.invalid/${path}`)).json();
    return {
      runtime,
      database,
      namespace,
      run: () => call('run'),
      stop: () => call('stop'),
      status: () => call('status'),
      denied: () => call('denied'),
    };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
test('combined private operator passes the gateway before native admission, seals on missing VM and survives eviction', async () => {
  const f = await fixture();
  try {
    const attempts = await Promise.all([f.run(), f.run()]);
    const first = attempts.find((result) => result.state === 'finished');
    assert(first);
    assert.equal(first.preflight.passed, true, JSON.stringify(first));
    assert.equal(first.native.passed, false);
    assert.equal(first.native.results.length, 1);
    assert.equal(first.native.results[0].name, 'material-create');
    assert.equal(first.native.results[0].status, 503);
    assert.equal(first.passed, false);
    const status = await f.status();
    assert.equal(status.budget.state, 'closed');
    assert.deepEqual(
      status.budget.claims.map((v) => v.kind),
      ['coordinator'],
    );
    assert.equal(status.admission.paused, true);
    assert.equal(status.admission.activeRequests, 0);
    assert.equal(status.admission.pendingCleanup, 0);
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n,
      2,
    );
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_connections').first()).n,
      4,
    );
    assert.doesNotMatch(
      JSON.stringify(first),
      /access_token|refresh_token|cookie|Bearer |ka_[a-f0-9]/,
    );
    await f.runtime.unsafeEvictDurableObject(c.workers.operator.name, 'KilnLifecycleRun', {
      id: f.namespace.idFromName('lifecycle-v1').toString(),
    });
    assert.deepEqual(await f.run(), first);
    assert.deepEqual((await f.status()).budget, status.budget);
    for (const w of Object.values(c.workers)) {
      const bound = await f.runtime.getWorker(w.name);
      if (w.name !== c.workers.gateway.name)
        assert.equal((await bound.fetch('https://private.invalid/run')).status, 404);
    }
  } finally {
    await f.runtime.dispose();
  }
});
test('operator stop before setup cannot provision identities or native work', async () => {
  const f = await fixture();
  try {
    await f.stop();
    const first = await f.run(),
      status = await f.status();
    assert.equal(first.passed, false);
    assert.equal(first.state, 'stopped');
    assert.deepEqual(status.budget, { state: 'closed', claims: [] });
    assert.equal(status.admission.paused, true);
    assert.deepEqual(
      await f.denied(),
      ['REQUEST', 'EVALUATION', 'RENDER'].map((name) => ({ name, cancelled: true, denied: true })),
    );
    assert.deepEqual((await f.status()).budget, status.budget);
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n,
      0,
    );
  } finally {
    await f.runtime.dispose();
  }
});
test('failed gateway preflight cannot open the native allowance', async () => {
  const f = await fixture('database');
  try {
    const first = await f.run();
    assert.equal(first.preflight.passed, false);
    assert.equal(first.native, null);
    const status = await f.status();
    assert.deepEqual(status.budget, { state: 'closed', claims: [] });
    assert.equal(status.admission.paused, true);
    assert.deepEqual(await f.run(), first);
  } finally {
    await f.runtime.dispose();
  }
});

test('operator stop retains a recovery alarm when control reports uncertain cleanup', async () => {
  const f = await fixture('uncertain-cleanup');
  try {
    const failed = await f.run();
    assert.equal(failed.passed, false);
    const afterRun = await f.status();
    assert(afterRun.alarmAt > Date.now() && afterRun.alarmAt <= Date.now() + 61000);
    await f.stop();
    const status = await f.status();
    assert(status.alarmAt > Date.now());
    assert.deepEqual(status.budget, { state: 'closed', claims: [] });
    assert.equal(status.operatorStopped, true);
  } finally {
    await f.runtime.dispose();
  }
});
