import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let runtime;
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `
      import {DurableObject} from 'cloudflare:workers';
      import {ComputeAdmission, admissionFailure} from './src/admission';
      export class Fixture extends DurableObject {
        constructor(ctx,env) {
          super(ctx,env); this.pending=new Map(); this.cancelledBodies=0;
          this.admission=new ComputeAdmission(ctx.storage, {
            run: async (id,tenant,request,deadlineAt) => {
              const calls=await ctx.storage.get('calls')||[];
              calls.push({id,tenant,url:request.url,headers:Object.fromEntries(request.headers),deadlineAt});
              await ctx.storage.put('calls',calls);
              if(await ctx.storage.get('abortRace')) {
                this.requestAbort.abort();
                return new Response(new ReadableStream({cancel:()=>{this.cancelledBodies++;}}));
              }
              if(await ctx.storage.get('hold')) return new Promise(resolve=>this.pending.set(id,resolve));
              if(await ctx.storage.get('runFail')) throw Error('private diagnostic');
              return new Response('native result');
            },
            cancel: async id => {
              if(await ctx.storage.get('cancelFail')) throw Error('private cleanup diagnostic');
              const stopped=await ctx.storage.get('stopped')||[];
              stopped.push(id); await ctx.storage.put('stopped',stopped);
              this.pending.get(id)?.(new Response('cancelled',{status:499})); this.pending.delete(id);
            },
          }, {maxConcurrent:2,tenantPerMinute:3,tenantPerDay:4,globalPerDay:7,globalPerMonth:8,deadlineMs:env.FIXTURE_SHORT_DEADLINE===true?250:60000},
            ()=>ctx.storage.kv.get('now')??Date.now());
        }
        async dispatch(tenant,request) {
          this.requestAbort=new AbortController();
          try{return await this.admission.dispatch(tenant,new Request(request,{signal:this.requestAbort.signal}));}catch(e){return admissionFailure(e);}
        }
        async command(command,value) {
          if(command==='pause') return this.admission.setPaused(value);
          if(command==='alarm') return this.admission.alarm();
          if(command==='expire') {this.ctx.storage.sql.exec('UPDATE compute_active SET recover_at = 0');return;}
          if(command==='snapshot') return {
            active:this.ctx.storage.sql.exec('SELECT * FROM compute_active').toArray(),
            usage:this.ctx.storage.sql.exec('SELECT * FROM compute_usage').toArray(),
            calls:await this.ctx.storage.get('calls')||[], stopped:await this.ctx.storage.get('stopped')||[],
            alarm:await this.ctx.storage.getAlarm(),
            cancelledBodies:this.cancelledBodies,
          };
          await this.ctx.storage.put(command,value);
        }
        alarm(){return this.admission.alarm();}
      }
      export class ShortFixture extends Fixture {constructor(ctx,env){super(ctx,{...env,FIXTURE_SHORT_DEADLINE:true});}}
      export default {async fetch(request,env) {
        const url=new URL(request.url), stub=env[url.searchParams.has('short')?'SHORT':'FIXTURE'].getByName(url.searchParams.get('fixture'));
        if(url.pathname==='/command') {const {command,value}=await request.json();return Response.json((await stub.command(command,value))??null);}
        const headers=new Headers({'content-type':'application/json'});
        if(url.searchParams.has('hostile')) headers.set('authorization','Bearer must-never-leave');
        return stub.dispatch(url.searchParams.get('tenant'),new Request('https://tenant.internal/mcp',{method:'POST',headers,body:'{}'}));
      }};`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'admission-fixture',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      durableObjects: {
        FIXTURE: { className: 'Fixture', useSQLite: true },
        SHORT: { className: 'ShortFixture', useSQLite: true },
      },
      outboundService: async () => {
        throw Error('No network');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
});
after(async () => runtime?.dispose());

function fixture(short = false) {
  const id = crypto.randomUUID();
  return {
    id,
    request: (tenant = 'a', hostile = false) =>
      runtime.dispatchFetch(
        `https://test.invalid/?fixture=${id}&tenant=${tenant.repeat(43)}${hostile ? '&hostile=1' : ''}${short ? '&short=1' : ''}`,
      ),
    command: async (command, value) =>
      (
        await runtime.dispatchFetch(
          `https://test.invalid/command?fixture=${id}${short ? '&short=1' : ''}`,
          { method: 'POST', body: JSON.stringify({ command, value }) },
        )
      ).json(),
  };
}
async function waitFor(f, predicate) {
  const deadline = Date.now() + 3000;
  do {
    const snapshot = await f.command('snapshot');
    if (predicate(snapshot)) return snapshot;
    await new Promise((r) => setTimeout(r, 10));
  } while (Date.now() < deadline);
  assert.fail('Fixture did not reach expected state');
}

test('admission reserves before dispatch, uses a fresh job ID and releases only after cancellation acknowledgement', async () => {
  const f = fixture();
  const r = await f.request();
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'native result');
  await f.request();
  const s = await f.command('snapshot');
  assert.equal(s.active.length, 0);
  assert.equal(s.calls.length, 2);
  assert.notEqual(s.calls[0].id, s.calls[1].id);
  assert.deepEqual(
    s.stopped,
    s.calls.map((c) => c.id),
  );
  assert.equal(s.calls[0].tenant, 'a'.repeat(43));
  assert.equal(s.calls[0].url, 'https://tenant.internal/mcp');
  assert.deepEqual(s.calls[0].headers, { 'content-type': 'application/json' });
  assert.ok(s.alarm > 0);
});

test('only the explicit short-deadline fixture uses the 250 ms deadline', async () => {
  const now = Date.UTC(2030, 0, 2, 12);
  for (const [short, deadlineMs] of [
    [false, 60000],
    [true, 250],
  ]) {
    const f = fixture(short);
    await f.command('now', now);
    assert.equal((await f.request()).status, 200);
    const s = await f.command('snapshot');
    assert.equal(s.calls[0].deadlineAt - now, deadlineMs);
  }
});

test('concurrent admission enforces both one job per account and total capacity', async () => {
  const f = fixture();
  await f.command('hold', true);
  const alice = f.request('a');
  await waitFor(f, (s) => s.calls.length === 1);
  const duplicate = await f.request('a');
  assert.equal(duplicate.status, 429);
  assert.ok(duplicate.headers.get('retry-after'));
  const bob = f.request('b');
  await waitFor(f, (s) => s.calls.length === 2);
  assert.equal((await f.request('c')).status, 429);
  await f.command('pause', true);
  await Promise.all([alice, bob]);
  const s = await f.command('snapshot');
  assert.equal(s.calls.length, 2);
  assert.equal(s.active.length, 0);
  assert.equal((await f.request('c')).status, 503);
});

test('unknown cleanup suppresses output and retains capacity across object eviction until recovery confirms stop', async () => {
  const f = fixture();
  await f.command('cancelFail', true);
  const r = await f.request();
  assert.equal(r.status, 503);
  assert.equal((await r.text()).includes('diagnostic'), false);
  const first = await f.command('snapshot');
  assert.equal(first.active.length, 1);
  assert.equal(first.active[0].state, 'closing');
  assert.equal((await f.request()).status, 429);
  const ns = await runtime.getDurableObjectNamespace('FIXTURE');
  await runtime.unsafeEvictDurableObject('admission-fixture', 'Fixture', {
    id: ns.idFromName(f.id).toString(),
  });
  assert.equal((await f.command('snapshot')).active.length, 1);
  await f.command('cancelFail', false);
  await f.command('expire');
  await f.command('alarm');
  const recovered = await f.command('snapshot');
  assert.equal(recovered.active.length, 0);
  assert.deepEqual(recovered.stopped, [first.calls[0].id]);
  assert.equal((await f.request()).status, 200);
});

test('admitted failed work still consumes minute and daily quotas, with independent UTC windows', async () => {
  const f = fixture();
  const now = Date.UTC(2030, 0, 2, 12);
  await f.command('now', now);
  await f.command('runFail', true);
  for (let i = 0; i < 3; i++) assert.equal((await f.request()).status, 503);
  assert.equal((await f.request()).status, 429);
  await f.command('now', now + 60000);
  assert.equal((await f.request()).status, 503);
  assert.equal((await f.request()).status, 429);
  await f.command('now', now + 86400000);
  assert.equal((await f.request()).status, 503);
  assert.equal((await f.command('snapshot')).calls.length, 5);
});

test('global day and month counters apply across accounts and survive day rollover', async () => {
  const f = fixture(),
    now = Date.UTC(2030, 0, 2, 12);
  await f.command('now', now);
  for (const tenant of ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    assert.equal((await f.request(tenant)).status, 200);
  assert.equal((await f.request('h')).status, 429);
  await f.command('now', now + 86400000);
  assert.equal((await f.request('h')).status, 200);
  assert.equal((await f.request('i')).status, 429);
  await f.command('now', Date.UTC(2030, 1, 1));
  assert.equal((await f.request('i')).status, 200);
});

test('invalid identity and authority headers fail before consuming quota or starting work', async () => {
  const f = fixture();
  assert.equal((await f.request('invalid')).status, 400);
  assert.equal((await f.request('a', true)).status, 400);
  const s = await f.command('snapshot');
  assert.equal(s.calls.length, 0);
  assert.equal(s.active.length, 0);
  assert.equal(s.usage.length, 0);
});

test('operator pause is durable and cannot release unconfirmed cleanup', async () => {
  const f = fixture();
  await f.command('cancelFail', true);
  await f.request();
  await f.command('pause', true);
  assert.equal((await f.request('b')).status, 503);
  const ns = await runtime.getDurableObjectNamespace('FIXTURE');
  await runtime.unsafeEvictDurableObject('admission-fixture', 'Fixture', {
    id: ns.idFromName(f.id).toString(),
  });
  assert.equal((await f.request('b')).status, 503);
  assert.equal((await f.command('snapshot')).active.length, 1);
  await f.command('pause', false);
  assert.equal((await f.request('a')).status, 429);
});

test('a concurrent burst cannot overbook capacity or charge rejected attempts', async () => {
  const f = fixture();
  await f.command('hold', true);
  const requests = ['a', 'b', 'c', 'd', 'e'].map((tenant) => f.request(tenant));
  await waitFor(f, (s) => s.calls.length === 2);
  await f.command('pause', true);
  const responses = await Promise.all(requests);
  assert.equal(responses.filter((r) => r.status === 429).length, 3);
  const s = await f.command('snapshot');
  assert.equal(s.active.length, 0);
  assert.equal(s.calls.length, 2);
  assert.equal(s.usage.find((row) => row.owner === 'global' && row.period === 'month').used, 2);
});

test('an RPC that does not return is bounded by deadline and out-of-band cancellation', async () => {
  const f = fixture(true);
  await f.command('hold', true);
  assert.equal((await f.request()).status, 504);
  const s = await f.command('snapshot');
  assert.equal(s.active.length, 0);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(s.stopped, [s.calls[0].id]);
});

test('maintenance retires expired usage counters and its alarm after an idle month', async () => {
  const f = fixture();
  await f.command('now', Date.UTC(2030, 0, 2));
  await f.request();
  assert.equal((await f.command('snapshot')).usage.length, 4);
  await f.command('now', Date.UTC(2030, 1, 1));
  await f.command('alarm');
  const s = await f.command('snapshot');
  assert.equal(s.usage.length, 0);
  assert.equal(s.alarm, null);
});

test('a response arriving in the same turn as cancellation has its discarded body closed', async () => {
  const f = fixture();
  await f.command('abortRace', true);
  assert.equal((await f.request()).status, 499);
  const s = await f.command('snapshot');
  assert.equal(s.active.length, 0);
  assert.equal(s.cancelledBodies, 1);
});
