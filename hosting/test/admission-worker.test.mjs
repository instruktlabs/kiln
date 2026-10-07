import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let runtime, compute, operator, raw;
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `
    import {DurableObject} from 'cloudflare:workers';
    export * from './src/admission-worker';
    export {default} from './src/admission-worker';
    export class FakeRequest extends DurableObject {
      async run(tenant,request,deadlineAt) {
        const before=await this.env.ADMISSION.getByName('global-v1').status();
        return Response.json({tenant,body:await request.text(),headers:Object.fromEntries(request.headers),before,deadlineAt});
      }
      async cancel(){await this.ctx.storage.put('stopped',true);}
    }
  `,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'admission',
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          durableObjects: {
            ADMISSION: { className: 'KilnAdmission', useSQLite: true },
            REQUESTS: { className: 'FakeRequest', useSQLite: true },
          },
          bindings: {
            COMPUTE_MAX_CONCURRENT: '2',
            COMPUTE_TENANT_PER_MINUTE: '5',
            COMPUTE_TENANT_PER_DAY: '10',
            COMPUTE_GLOBAL_PER_DAY: '2',
            COMPUTE_GLOBAL_PER_MONTH: '3',
            COMPUTE_DEADLINE_MS: '60000',
          },
        },
        {
          name: 'unconfigured-admission',
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          durableObjects: {
            ADMISSION: { className: 'KilnAdmission', useSQLite: true },
            REQUESTS: { className: 'FakeRequest', useSQLite: true },
          },
        },
        {
          name: 'gateway-fixture',
          modules: true,
          compatibilityDate: '2026-10-06',
          serviceBindings: {
            COMPUTE: { name: 'admission', entrypoint: 'KilnCompute' },
            UNCONFIGURED: { name: 'unconfigured-admission', entrypoint: 'KilnCompute' },
          },
          script: `
      export default {async fetch(request,env){
        const url=new URL(request.url);
        if(url.pathname==='/private-http')return env.COMPUTE.fetch(request);
        if(url.pathname==='/health')return Response.json(await env.COMPUTE.health());
        if(url.pathname==='/missing-policy')return env.UNCONFIGURED.dispatch('a'.repeat(43),new Request('https://tenant.internal/mcp'));
        if(url.pathname==='/try-pause') {try {await env.COMPUTE.setPaused(true);return new Response('exposed');}catch{return new Response('unavailable',{status:404});}}
        if(url.pathname==='/retire') {await env.COMPUTE.retireTenant('z'.repeat(43));return Response.json({retired:true});}
        return env.COMPUTE.dispatch(url.searchParams.get('tenant').repeat(43),new Request('https://tenant.internal/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
      }};`,
        },
        {
          name: 'operator-fixture',
          modules: true,
          compatibilityDate: '2026-10-06',
          serviceBindings: { CONTROL: { name: 'admission', entrypoint: 'KilnComputeControl' } },
          script: `
      export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/pause')return Response.json(await env.CONTROL.setPaused(true));if(url.pathname==='/resume')return Response.json(await env.CONTROL.setPaused(false));return Response.json(await env.CONTROL.status());}};`,
        },
      ],
    }),
  );
  compute = await runtime.getWorker('gateway-fixture');
  operator = await runtime.getWorker('operator-fixture');
  raw = await runtime.getWorker('admission');
});
after(async () => runtime?.dispose());

test('private entrypoint selects one global authority across accounts and exposes no public or operator API', async () => {
  assert.equal((await raw.fetch('https://test.invalid/')).status, 404);
  assert.equal((await compute.fetch('https://test.invalid/private-http')).status, 404);
  assert.equal((await compute.fetch('https://test.invalid/try-pause')).status, 404);
  for (const tenant of ['a', 'b']) {
    const response = await compute.fetch(`https://test.invalid/?tenant=${tenant}`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.tenant, tenant.repeat(43));
    assert.equal(data.before.activeRequests, 1);
    assert.equal(data.body, '{}');
    assert.equal(data.headers.authorization, undefined);
    assert.equal((await (await operator.fetch('https://test.invalid/')).json()).activeRequests, 0);
  }
  assert.equal((await compute.fetch('https://test.invalid/?tenant=c')).status, 429);
});

test('read-only compute health exposes aggregates without changing admission or exposing pause', async () => {
  const before = await (await operator.fetch('https://test.invalid/')).json();
  assert.deepEqual(await (await compute.fetch('https://test.invalid/health')).json(), before);
  assert.deepEqual(await (await operator.fetch('https://test.invalid/')).json(), before);
  assert.equal((await compute.fetch('https://test.invalid/try-pause')).status, 404);
  assert.equal((await raw.fetch('https://test.invalid/health')).status, 404);
});

test('separate operator binding pauses and resumes without exposing account identifiers', async () => {
  const paused = await (await operator.fetch('https://test.invalid/pause')).json();
  assert.equal(paused.paused, true);
  assert.equal(paused.activeRequests, 0);
  assert.equal((await compute.fetch('https://test.invalid/?tenant=d')).status, 503);
  const resumed = await (await operator.fetch('https://test.invalid/resume')).json();
  assert.equal(resumed.paused, false);
  assert.deepEqual(Object.keys(resumed).sort(), [
    'activeRequests',
    'maxConcurrent',
    'paused',
    'pendingCleanup',
  ]);
});

test('absent quota configuration refuses work instead of selecting implicit launch limits', async () => {
  const response = await compute.fetch('https://test.invalid/missing-policy');
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'Service temporarily unavailable');
});

test('verified gateway lifecycle RPC permanently retires a tenant without a public route', async () => {
  assert.equal((await raw.fetch('https://test.invalid/retire')).status, 404);
  assert.deepEqual(await (await compute.fetch('https://test.invalid/retire')).json(), {
    retired: true,
  });
  assert.equal((await compute.fetch('https://test.invalid/?tenant=z')).status, 410);
  assert.deepEqual(await (await compute.fetch('https://test.invalid/retire')).json(), {
    retired: true,
  });
});
