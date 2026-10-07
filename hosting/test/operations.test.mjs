import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateAccounts } from './database.mjs';
import { rateLimitBindings } from './rate-limit-bindings.mjs';

let recordResponse, recordHealth, readOperationalHealth, runtime, database;
before(async () => {
  const output = new URL('../../.cache/operations-tests/operations.mjs', import.meta.url);
  await mkdir(fileURLToPath(new URL('.', output)), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(new URL('../src/operations.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: fileURLToPath(output),
  });
  ({ recordResponse, recordHealth, readOperationalHealth } = await import(output));
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./operations-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd'],
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      compatibilityFlags: ['global_fetch_strictly_public'],
      bindings: { PUBLIC_ORIGIN: 'https://kiln.example.com' },
      d1Databases: ['ACCOUNTS'],
      kvNamespaces: ['OAUTH_KV'],
      ratelimits: rateLimitBindings,
      outboundService: () => {
        throw new Error('External I/O forbidden');
      },
    }),
  );
  database = await runtime.getD1Database('ACCOUNTS');
  await migrateAccounts(database);
});
after(async () => runtime?.dispose());
const send = (path, options) => runtime.dispatchFetch(`https://kiln.example.com${path}`, options);
function fixture() {
  const points = [];
  return { points, env: { OPERATIONS: { writeDataPoint: (point) => points.push(point) } } };
}
const healthy = {
  deletion: { pending: 2, oldestPendingMs: 1000, overdue: 0 },
  compute: { paused: false, activeRequests: 1, pendingCleanup: 0, maxConcurrent: 2 },
};
test('response observations emit only a fixed class, validated status and finite elapsed time', () => {
  const f = fixture();
  recordResponse(f.env, '/downloads/private-capability/source.kiln.js', 429, 123.7);
  assert.deepEqual(f.points, [
    { indexes: ['http'], blobs: ['kiln.ops.v1', 'http', 'download', '429'], doubles: [1, 124] },
  ]);
  for (const [path, status, duration] of [
    ['/private-identity', 200, 4],
    ['/oauth/google/callback', 303, 5],
  ])
    recordResponse(f.env, path, status, duration);
  assert(!JSON.stringify(f.points).includes('private'));
  assert.equal(f.points[1].blobs[2], 'other');
  assert.equal(f.points[2].blobs[2], 'callback');
  for (const status of [NaN, Infinity, 200.5, 99, 600]) recordResponse(f.env, '/', status, 1);
  for (const duration of [NaN, Infinity, -1]) recordResponse(f.env, '/', 200, duration);
  assert.equal(f.points.length, 3);
});
test('health observations contain aggregate values only and unknown is never healthy zero', () => {
  const f = fixture();
  recordHealth(
    f.env,
    { ...healthy, account: 'private-identity', exception: 'private-secret' },
    true,
  );
  assert.deepEqual(f.points, [
    {
      indexes: ['health:deletion'],
      blobs: ['kiln.ops.v1', 'health', 'deletion', 'ok'],
      doubles: [1, 2, 1000, 0, 1],
    },
    {
      indexes: ['health:compute'],
      blobs: ['kiln.ops.v1', 'health', 'compute', 'ok'],
      doubles: [1, 0, 1, 0, 2],
    },
  ]);
  recordHealth(f.env, { deletion: null, compute: null }, false);
  assert.deepEqual(f.points[2], {
    indexes: ['health:deletion'],
    blobs: ['kiln.ops.v1', 'health', 'deletion', 'unavailable'],
    doubles: [1, -1, -1, -1, 0],
  });
  assert.deepEqual(f.points[3], {
    indexes: ['health:compute'],
    blobs: ['kiln.ops.v1', 'health', 'compute', 'unavailable'],
    doubles: [1, -1, -1, -1, -1],
  });
  assert(!JSON.stringify(f.points).includes('private'));
});
test('missing or failing telemetry never throws or serializes provider errors', () => {
  for (const env of [
    {},
    {
      OPERATIONS: {
        writeDataPoint() {
          throw new Error('private-secret');
        },
      },
    },
  ]) {
    assert.doesNotThrow(() => recordResponse(env, '/mcp', 200, 12));
    assert.doesNotThrow(() => recordHealth(env, healthy, true));
  }
});
test('a failed compute check does not discard deletion health and vice versa', async () => {
  const database = (value) => ({
    withSession(mode) {
      assert.equal(mode, 'first-primary');
      return {
        prepare() {
          return {
            bind(now, overdueBefore) {
              assert.equal(now, 1000000);
              assert.equal(overdueBefore, 100000);
              return { first: async () => value };
            },
          };
        },
      };
    },
  });
  const env = {
    ACCOUNTS: database(healthy.deletion),
    NATIVE_COMPUTE: {
      health: async () => {
        throw new Error('private-secret');
      },
    },
  };
  assert.deepEqual(await readOperationalHealth(env, 1000000), {
    deletion: healthy.deletion,
    compute: null,
  });
  env.ACCOUNTS = {
    withSession() {
      throw new Error('private-secret');
    },
  };
  env.NATIVE_COMPUTE.health = async () => healthy.compute;
  assert.deepEqual(await readOperationalHealth(env, 1000000), {
    deletion: null,
    compute: healthy.compute,
  });
  env.NATIVE_COMPUTE.health = async () => ({ ...healthy.compute, activeRequests: 'private' });
  assert.deepEqual(await readOperationalHealth(env, 1000000), { deletion: null, compute: null });
});
test('health collection has a bounded deadline and reports stalled reads as unavailable', async () => {
  const env = {
    ACCOUNTS: {
      withSession() {
        throw new Error('offline');
      },
    },
    NATIVE_COMPUTE: { health: () => new Promise(() => {}) },
  };
  assert.deepEqual(await readOperationalHealth(env), { deletion: null, compute: null });
});

test('primary-D1 deletion health counts pending jobs and age without exposing rows or completed receipts', async () => {
  const empty = await (await send('/fixture/health')).json();
  assert.deepEqual(empty.deletion, { pending: 0, oldestPendingMs: 0, overdue: 0 });
  for (const [id, phase, created] of [
    ['private-old', 'storage', 10000],
    ['private-new', 'grants', 999000],
    ['private-completed', 'complete', 1],
  ])
    await database
      .prepare(
        'INSERT INTO kiln_deletions (id,receipt_hash,phase,created_at,updated_at,retry_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(id, id, phase, created, created, created)
      .run();
  const response = await send('/fixture/health');
  const text = await response.text();
  assert(!text.includes('private'));
  assert.deepEqual(JSON.parse(text).deletion, { pending: 2, oldestPendingMs: 990000, overdue: 1 });
  await database.exec('DELETE FROM kiln_deletions');
});

test('actual gateway emits one sanitized response point and keeps telemetry errors out of responses', async () => {
  for (const broken of [false, true]) {
    const response = await send('/unknown-private-name?code=private-code', {
      headers: {
        authorization: 'Bearer private-token',
        cookie: 'private-cookie',
        ...(broken ? { 'x-fixture-metrics-failure': '1' } : {}),
      },
    });
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not found');
    const points = await (await send('/fixture/points')).json();
    assert.equal(points.length, broken ? 0 : 1);
    if (!broken) {
      assert.deepEqual(points[0].blobs, ['kiln.ops.v1', 'http', 'other', '404']);
      assert.equal(points[0].doubles[0], 1);
      assert(Number.isSafeInteger(points[0].doubles[1]));
    }
    assert(!JSON.stringify(points).includes('private'));
  }
});

test('actual scheduled recovery emits both health components and reports a primary outage as unavailable', async () => {
  assert.equal((await send('/fixture/scheduled')).status, 200);
  let points = await (await send('/fixture/points')).json();
  assert.equal(points.length, 2);
  assert.deepEqual(points[0].doubles, [1, 0, 0, 0, 1]);
  assert.deepEqual(points[1].doubles, [1, 0, 0, 0, 2]);
  assert.equal(
    (await send('/fixture/scheduled', { headers: { 'x-fixture-database-failure': '1' } })).status,
    503,
  );
  points = await (await send('/fixture/points')).json();
  assert.equal(points[0].blobs[3], 'unavailable');
  assert.deepEqual(points[0].doubles, [1, -1, -1, -1, 0]);
  assert.equal(points[1].blobs[3], 'ok');
  assert(!JSON.stringify(points).includes('private'));
});
