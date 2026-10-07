import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { deploymentConfig } from '../scripts/deployment-config.mjs';
import { migrateAccounts } from './database.mjs';

const origin = 'https://kiln-private-qualification.invalid';
const manifest = {
  account: 'a'.repeat(32),
  prefix: 'kiln-preflight-fixture',
  origin,
  database: { id: '11111111-1111-1111-1111-111111111111', name: 'kiln-preflight-fixture-accounts' },
  oauthKv: 'b'.repeat(32),
  bucket: 'kiln-preflight-fixture-artifacts',
  requestLimits: {
    edge: { namespace: '8101', perMinute: 600 },
    account: { namespace: '8102', perMinute: 120 },
  },
  images: {
    coordinator: `registry.cloudflare.com/${'a'.repeat(32)}/kiln-coordinator@sha256:${'c'.repeat(64)}`,
    software: `registry.cloudflare.com/${'a'.repeat(32)}/kiln-software@sha256:${'d'.repeat(64)}`,
  },
  compute: {
    maxConcurrent: 1,
    tenantPerMinute: 9,
    tenantPerDay: 9,
    globalPerDay: 9,
    globalPerMonth: 9,
    deadlineMs: 120000,
  },
  storage: { maxBytes: 1048576, maxObjects: 32, maxGroups: 8 },
};
const configuration = deploymentConfig(manifest);
const bundles = {};
before(async () => {
  for (const [role, entry] of [
    ...Object.entries(configuration.entries),
    ['probe', '../test/gateway-preflight-worker'],
  ]) {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      conditions: ['workerd'],
      external: ['cloudflare:workers'],
    });
    bundles[role] = result.outputFiles[0].text;
  }
});

// Adapt the prepared production topology, not a hand-maintained copy of its links.
// Miniflare does not qualify remote Analytics Engine, Cron or Container images.
function worker(role) {
  const config = configuration.workers[role];
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
      throw new Error('Network forbidden in private fixture');
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
      case 'secret':
      case 'analytics-engine-dataset':
        break;
      default:
        assert.fail(`Unhandled binding type: ${binding.type}`);
    }
  }
  // Build Output declares namespace ownership through exports/migrations.
  // Miniflare v4 adaptation declares it through a local binding instead.
  for (const [name, exported] of Object.entries(config.exports))
    if (exported.type === 'durable-object')
      result.durableObjects[`REGISTER_${name}`] = { className: name, useSQLite: true };
  return result;
}
async function fixture(override = {}, fault) {
  const names = Object.fromEntries(
    Object.entries(configuration.workers).map(([role, config]) => [role, config.name]),
  );
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'probe',
          modules: true,
          script: bundles.probe,
          compatibilityDate: '2026-10-06',
          compatibilityFlags: ['global_fetch_strictly_public'],
          durableObjects: {
            RUN: { className: 'PreflightFixture', useSQLite: true },
            TENANTS: { className: 'KilnTenant', scriptName: names.tenant, useSQLite: true },
          },
          serviceBindings: {
            GATEWAY: names.gateway,
            COMPUTE: { name: names.admission, entrypoint: 'KilnCompute' },
            CONTROL: { name: names.admission, entrypoint: 'KilnComputeControl' },
          },
          d1Databases: { ACCOUNTS: manifest.database.id },
          kvNamespaces: { OAUTH_KV: manifest.oauthKv },
          r2Buckets: { ARTIFACTS: manifest.bucket },
          bindings: {
            PUBLIC_ORIGIN: origin,
            QUALIFICATION_MODE: 'isolated-synthetic-v1',
            ...override,
          },
          outboundService: () => {
            throw new Error('External identity providers must not be called');
          },
        },
        ...Object.keys(configuration.entries).map((role) => {
          const value = worker(role);
          if (fault === 'gateway-database' && role === 'gateway')
            value.d1Databases.ACCOUNTS = '22222222-2222-2222-2222-222222222222';
          return value;
        }),
      ],
    }),
  );
  try {
    const database = await runtime.getD1Database('ACCOUNTS', 'probe');
    await migrateAccounts(database);
    const namespace = await runtime.getDurableObjectNamespace('RUN', 'probe');
    const stub = namespace.get(namespace.idFromName('once'));
    return { runtime, database, run: { run: async () => JSON.parse(await stub.run()) } };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}

test('private preflight uses real gateway, account authorities, tenant storage and compute control', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.runtime.dispatchFetch('https://probe.invalid')).status, 404);
    const first = await Promise.all([f.run.run(), f.run.run()]);
    const receipt = first.find((value) => value.state === 'finished');
    assert(receipt);
    assert.equal(receipt.state, 'finished');
    assert.equal(receipt.passed, true, JSON.stringify(receipt));
    assert.equal(receipt.computePaused, true);
    assert.deepEqual(
      receipt.results.map(({ name, passed }) => [name, passed]),
      [
        ['fresh-resources', true],
        ['pause-native', true],
        ['metadata', true],
        ['synthetic-accounts', true],
        ['anonymous-denied', true],
        ['edge-discovery', true],
        ['oversized-denied', true],
        ['store-fixture', true],
        ['bearer-isolation', true],
        ['browser-isolation', true],
        ['revoke-connection', true],
        ['revoked-token-denied', true],
        ['other-account-preserved', true],
      ],
    );
    assert.doesNotMatch(
      JSON.stringify(receipt),
      /access_token|refresh_token|cookie|ka_[a-f0-9]|Bearer |source\.kiln|fixture-source/,
    );
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n,
      2,
    );
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_connections').first()).n,
      2,
    );
    assert.equal(
      (
        await f.database
          .prepare("SELECT COUNT(*) AS n FROM kiln_connections WHERE state='revoked'")
          .first()
      ).n,
      1,
    );
    const before = await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_connections').first();
    assert.deepEqual(await f.run.run(), receipt);
    assert.deepEqual(
      await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_connections').first(),
      before,
    );
  } finally {
    await f.runtime.dispose();
  }
});

test('a gateway bound to the wrong account database fails at token exchange and never retries provisioning', async () => {
  const f = await fixture({}, 'gateway-database');
  try {
    const first = await f.run.run();
    assert.equal(first.passed, false);
    assert.equal(first.computePaused, true);
    assert.deepEqual(first.results.at(-1), { name: 'synthetic-accounts', passed: false });
    assert.equal(first.results.length, 4);
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n,
      1,
    );
    assert.deepEqual(await f.run.run(), first);
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n,
      1,
    );
    assert.doesNotMatch(JSON.stringify(first), /token|cookie|ka_[a-f0-9]|SQL|D1_ERROR|Bearer /);
  } finally {
    await f.runtime.dispose();
  }
});

for (const seeded of ['accounts', 'oauth', 'artifacts'])
  test(`preflight refuses nonempty ${seeded} instead of altering existing data`, async () => {
    const f = await fixture();
    try {
      if (seeded === 'accounts')
        await f.database
          .prepare('INSERT INTO kiln_accounts(id,created_at) VALUES (?,0)')
          .bind(`ka_${'f'.repeat(32)}`)
          .run();
      if (seeded === 'oauth')
        await (await f.runtime.getKVNamespace('OAUTH_KV', 'probe')).put(
          'existing',
          'do-not-change',
        );
      if (seeded === 'artifacts')
        await (await f.runtime.getR2Bucket('ARTIFACTS', 'probe')).put('existing', 'do-not-change');
      const result = await f.run.run();
      assert.equal(result.passed, false);
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].name, 'fresh-resources');
      assert.equal(result.results[0].passed, false);
      assert.equal(
        (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n,
        seeded === 'accounts' ? 1 : 0,
      );
      if (seeded === 'oauth')
        assert.equal(
          await (await f.runtime.getKVNamespace('OAUTH_KV', 'probe')).get('existing'),
          'do-not-change',
        );
      if (seeded === 'artifacts')
        assert.equal(
          await (await (await f.runtime.getR2Bucket('ARTIFACTS', 'probe')).get('existing')).text(),
          'do-not-change',
        );
      assert.deepEqual(await f.run.run(), result);
    } finally {
      await f.runtime.dispose();
    }
  });

test('preflight refuses a production origin before accessing account storage', async () => {
  const f = await fixture({ PUBLIC_ORIGIN: 'https://kiln.instruktlabs.com' });
  try {
    const result = await f.run.run();
    assert.equal(result.passed, false);
    assert.equal(result.results.length, 0);
    assert.equal(
      (await f.database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n,
      0,
    );
  } finally {
    await f.runtime.dispose();
  }
});
