import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateAccounts } from './database.mjs';
import { operationsConfig } from '../probe/operations-config.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';

const manifest = {
  ...lifecycleManifest,
  prefix: 'kiln-private-operations-v1',
  database: { ...lifecycleManifest.database, name: 'kiln-private-operations-v1-accounts' },
  bucket: 'kiln-private-operations-v1-artifacts',
  compute: {
    maxConcurrent: 1,
    tenantPerMinute: 1,
    tenantPerDay: 1,
    globalPerDay: 1,
    globalPerMonth: 1,
    deadlineMs: 120000,
  },
};
const config = operationsConfig(manifest),
  bundles = {};
before(async () => {
  for (const [role, entry] of Object.entries(config.entries)) {
    const built = await build({
      entryPoints: [fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      external: ['cloudflare:workers'],
    });
    bundles[role] = built.outputFiles[0].text;
  }
  // Read only a presence bit from private state; never expose synthetic tokens.
  bundles.operator = (
    await build({
      stdin: {
        contents: `
    import {KilnOperationsRun as Base} from '../probe/operations-worker';
    export {default,KilnOperationsControl} from '../probe/operations-worker';
    export class KilnOperationsRun extends Base {
      async privateStatePresent(){return Boolean(await this.ctx.storage.get('operations-private'));}
    }`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      external: ['cloudflare:workers'],
    })
  ).outputFiles[0].text;
  for (const entry of ['worker', 'maintenance-worker']) {
    bundles[entry] = (
      await build({
        stdin: {
          contents: `import gateway from '../src/${entry}';
    export default {async fetch(r,env,ctx){
      if(new URL(r.url).pathname==='/local-scheduled') {
        await gateway.scheduled({cron:'* * * * *',scheduledTime:Date.now(),noRetry(){}},env);
        return new Response('ok');
      }return gateway.fetch(r,env,ctx);
    }}`,
          resolveDir: fileURLToPath(new URL('.', import.meta.url)),
          loader: 'ts',
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        external: ['cloudflare:workers'],
      })
    ).outputFiles[0].text;
  }
});
function worker(role, gatewayEntry = 'worker') {
  const c = config.workers[role];
  const w = {
    name: c.name,
    modules: true,
    script: role === 'gateway' ? bundles[gatewayEntry] : bundles[role],
    compatibilityDate: c.compatibilityDate,
    compatibilityFlags: c.compatibilityFlags,
    bindings: {},
    durableObjects: {},
    serviceBindings: {},
    kvNamespaces: {},
    d1Databases: {},
    r2Buckets: {},
    ratelimits: {},
    outboundService: () => {
      throw new Error('Unexpected provider request');
    },
  };
  for (const [name, b] of Object.entries(c.env)) {
    if (b.type === 'text') w.bindings[name] = b.value;
    else if (b.type === 'durable-object')
      w.durableObjects[name] = { className: b.exportName, scriptName: b.worker, useSQLite: true };
    else if (b.type === 'worker')
      w.serviceBindings[name] = { name: b.worker, entrypoint: b.exportName };
    else if (b.type === 'd1') w.d1Databases[name] = b.id;
    else if (b.type === 'kv') w.kvNamespaces[name] = b.id;
    else if (b.type === 'r2') w.r2Buckets[name] = b.name;
    else if (b.type === 'rate-limit')
      w.ratelimits[name] = { namespace_id: b.namespace, simple: b.simple };
    else assert.equal(b.type, 'analytics-engine-dataset');
  }
  for (const [name, e] of Object.entries(c.exports))
    if (e.type === 'durable-object')
      w.durableObjects[`REGISTER_${name}`] = { className: name, useSQLite: true };
  return w;
}
async function fixture() {
  const options = (entry = 'worker') =>
    convertV4MiniflareOptions({
      workers: [
        ...Object.keys(config.workers).map((role) => worker(role, entry)),
        {
          name: 'observer',
          modules: true,
          compatibilityDate: '2026-10-06',
          durableObjects: {
            RUN: {
              className: 'KilnOperationsRun',
              scriptName: config.workers.operator.name,
              useSQLite: true,
            },
          },
          serviceBindings: {
            PROBE: { name: config.workers.operator.name, entrypoint: 'KilnOperationsControl' },
          },
          script: `export default {async fetch(r,e){const path=new URL(r.url).pathname;
      if(path==='/has-private-state')return Response.json(await e.RUN.getByName('once-v1').privateStatePresent());
      if(path==='/begin')return Response.json(await e.PROBE.begin());
      if(path==='/progress')return Response.json(await e.PROBE.progress());
      if(path==='/stop')return Response.json(await e.PROBE.stop());
      if(path==='/inspect')return Response.json(await e.PROBE.inspect());
      return Response.json(await e.PROBE.status());}}`,
        },
      ],
    });
  const runtime = new Miniflare(options());
  const database = await runtime.getD1Database('ACCOUNTS', config.workers.gateway.name);
  await migrateAccounts(database);
  return {
    runtime,
    database,
    async send(path) {
      const observer = await runtime.getWorker('observer');
      return (await observer.fetch(`https://observer.internal${path}`)).json();
    },
    async gatewayVersion(entry) {
      await runtime.setOptions(options(entry));
      this.database = await runtime.getD1Database('ACCOUNTS', config.workers.gateway.name);
      return runtime.getWorker(config.workers.gateway.name);
    },
  };
}

test('maintenance and code restoration retain current revocation and finish deletion without losing the other account', async () => {
  const f = await fixture();
  try {
    const begun = await f.send('/begin');
    assert.equal(begun.state, 'waiting');
    assert.equal(begun.revocationVerified, true);
    const accountSnapshot = async (state) =>
      (
        await f.database
          .prepare('SELECT * FROM kiln_accounts WHERE state=? ORDER BY id')
          .bind(state)
          .all()
      ).results;
    const owner = await accountSnapshot('deleting'),
      foreign = await accountSnapshot('active');
    assert.equal(owner.length, 1);
    assert.equal(foreign.length, 1);
    const gateway = await f.gatewayVersion('maintenance-worker');
    assert.deepEqual(await accountSnapshot('deleting'), owner);
    assert.deepEqual(await accountSnapshot('active'), foreign);
    const paused = await f.send('/inspect');
    assert.equal(paused.record.startedAt, begun.startedAt);
    assert.equal(paused.privateStatePresent, true);
    assert.equal(paused.admission.paused, true);
    assert.equal(paused.admission.activeRequests, 0);
    for (const path of [
      '/mcp',
      '/account',
      '/oauth/token',
      '/oauth/github/callback',
      '/downloads/private-ticket',
    ]) {
      const response = await gateway.fetch(`${manifest.origin}${path}`);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('retry-after'), '60');
      assert.equal(response.headers.get('set-cookie'), null);
      await response.body?.cancel();
    }
    // Explicit local invocation qualifies handler continuity, not provider Cron.
    for (let i = 0; i < 5; i++) {
      await f.database.exec('UPDATE kiln_deletions SET retry_at=0,lease_until=0');
      assert.equal((await gateway.fetch(`${manifest.origin}/local-scheduled`)).status, 200);
    }
    assert.deepEqual(await accountSnapshot('deleting'), []);
    assert.deepEqual(await accountSnapshot('active'), foreign);
    const restored = await f.gatewayVersion('worker');
    const anonymous = await restored.fetch(`${manifest.origin}/mcp`);
    assert.equal(anonymous.status, 401);
    await anonymous.body?.cancel();
    const deadline = Date.now() + 12000;
    let result;
    do {
      result = await f.send('/progress');
      if (result.state !== 'waiting') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    // The actual operator checks its retained revoked token, both tenant stores,
    // the foreign account's valid token and exact saved source after restoration.
    assert.equal(result.state, 'finished');
    assert.equal(result.passed, true);
    assert.equal(result.deletionRecovered, true);
    assert.equal(result.foreignAccountPreserved, true);
    assert.deepEqual(await accountSnapshot('active'), foreign);
    const clean = await f.send('/inspect');
    assert.equal(clean.privateStatePresent, false);
    assert.equal(clean.alarmAt, null);
    assert.equal(clean.admission.pendingCleanup, 0);
  } finally {
    await f.runtime.dispose();
  }
});
test('operations runner waits for actual retention and separately invoked scheduled recovery, without native execution', async () => {
  const f = await fixture();
  try {
    const begun = await f.send('/begin');
    assert.equal(begun.state, 'waiting', JSON.stringify(begun));
    assert.equal(begun.passed, false);
    assert.equal(begun.revocationVerified, true);
    assert.equal(begun.nativeExecutionPossible, false);
    assert.equal((await f.send('/begin')).startedAt, begun.startedAt);
    assert.equal((await f.send('/progress')).state, 'waiting');
    const gateway = await f.runtime.getWorker(config.workers.gateway.name);
    for (let i = 0; i < 5; i++) {
      await f.database.exec('UPDATE kiln_deletions SET retry_at=0,lease_until=0');
      assert.equal(
        (await gateway.fetch('https://kiln-private-qualification.invalid/local-scheduled')).status,
        200,
      );
    }
    const deadline = Date.now() + 12000;
    let receipt;
    do {
      receipt = await f.send('/progress');
      if (receipt.state !== 'waiting') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    assert.equal(receipt.state, 'finished');
    assert.equal(receipt.passed, true);
    assert.equal(receipt.retentionVerified, true);
    assert.equal(receipt.deletionRecovered, true);
    assert.equal(receipt.foreignAccountPreserved, true);
    assert.equal(receipt.computePaused, true);
    const inspected = await f.send('/inspect');
    assert.equal(inspected.record.state, 'finished');
    assert.equal(inspected.alarmAt, null);
    assert.equal(inspected.privateStatePresent, false);
    assert.equal(inspected.admission.paused, true);
    assert.equal(inspected.admission.activeRequests, 0);
    assert.equal(inspected.admission.pendingCleanup, 0);
    assert.doesNotMatch(
      JSON.stringify(receipt),
      /accessToken|refreshToken|__Host-|ka_|kd_|receipt_hash/,
    );
    const raw = await f.runtime.getWorker(config.workers.operator.name);
    assert.equal((await raw.fetch('https://operator.invalid/begin')).status, 404);
  } finally {
    await f.runtime.dispose();
  }
});
test('stopping an unused operations candidate prevents a later invocation', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.send('/stop')).state, 'stopped');
    assert.equal((await f.send('/begin')).state, 'stopped');
    assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM kiln_accounts').first()).n, 0);
  } finally {
    await f.runtime.dispose();
  }
});

test('a forged complete deletion receipt cannot pass while the owner or saved bytes remain', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.send('/begin')).state, 'waiting');
    await f.database.exec("UPDATE kiln_deletions SET phase='complete',completed_at=9999999999999");
    const receipt = await f.send('/progress');
    assert.equal(receipt.state, 'failed');
    assert.equal(receipt.passed, false);
    assert.equal(receipt.deletionRecovered, false);
    assert.equal((await f.send('/begin')).state, 'failed');
    assert.equal(await f.send('/has-private-state'), true);
    assert.equal((await f.send('/stop')).state, 'failed');
    assert.equal(await f.send('/has-private-state'), false);
    const inspected = await f.send('/inspect');
    assert.equal(inspected.record.state, 'failed');
    assert.equal(inspected.alarmAt, null);
    assert.equal(inspected.privateStatePresent, false);
  } finally {
    await f.runtime.dispose();
  }
});

test('a terminal stop cannot be overwritten by progress or a second begin', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.send('/begin')).state, 'waiting');
    const active = await f.send('/inspect');
    assert.equal(active.privateStatePresent, true);
    assert.equal(typeof active.alarmAt, 'number');
    assert.doesNotMatch(JSON.stringify(active), /ownerToken|foreignToken|deletionReceipt|ka_|kd_/);
    const stopped = await f.send('/stop');
    assert.equal(stopped.state, 'stopped');
    assert.equal(stopped.passed, false);
    assert.deepEqual(await f.send('/progress'), stopped);
    assert.deepEqual(await f.send('/begin'), stopped);
  } finally {
    await f.runtime.dispose();
  }
});
