import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runtime;
let namespace;
before(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./storage-fault-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'faults',
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'StorageFaultFixture', useSQLite: true } },
      outboundService: async () => {
        throw new Error('Unexpected network access');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
});
after(async () => runtime?.dispose());
const send = (owner, path, init) =>
  namespace.get(namespace.idFromName(owner)).fetch(`https://fixture.internal${path}`, init);
async function database(owner) {
  await send(owner, '/usage');
  return runtime.unsafeGetDurableObjectStorage('faults', 'StorageFaultFixture', {
    id: namespace.idFromName(owner).toString(),
  });
}
const upload = (owner, path = '/upload') =>
  send(owner, path, {
    method: 'POST',
    body: 'durable',
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': '7',
      'x-artifact-name': 'asset.glb',
      'x-artifact-sha256': createHash('sha256').update('durable').digest('hex'),
    },
  });
const prefix = (owner) => `tenants/${namespace.idFromName(owner)}/artifacts/`;

test('upload deadline includes R2 acknowledgement and retains failed-cleanup quota for retry', async () => {
  const db = await database('deadline');
  await db.exec("INSERT INTO faults VALUES ('slow-ack'), ('delete-failure')");
  const response = await upload('deadline');
  assert.equal(response.status, 502);
  const bucket = await runtime.getR2Bucket('ARTIFACTS');
  const objects = await bucket.list({ prefix: prefix('deadline') });
  assert.equal(objects.objects.length, 1);
  const id = objects.objects[0].key.slice(prefix('deadline').length);
  assert.equal((await send('deadline', `/download/${id}`)).status, 404);
  assert.equal((await (await send('deadline', '/usage')).json()).bytes, 7);
  assert.equal((await send('deadline', '/sweep')).status, 503);
  // Let the delayed R2 acknowledgement arrive. A timeout must not publish it.
  await delay(1600);
  assert.equal((await send('deadline', `/download/${id}`)).status, 404);
  assert.equal((await (await send('deadline', '/usage')).json()).bytes, 7);
  await db.exec('DELETE FROM faults');
  assert.equal((await send('deadline', '/sweep')).status, 200);
  assert.equal((await (await send('deadline', '/usage')).json()).bytes, 0);
  assert.equal((await bucket.list({ prefix: prefix('deadline') })).objects.length, 0);
});

test('recovery removes interrupted and aged orphan writes only within the tenant prefix', async () => {
  const db = await database('recover');
  const record = await (await upload('recover')).json();
  await db.exec("UPDATE artifacts SET state = 'uploading', created_at = 1");
  const bucket = await runtime.getR2Bucket('ARTIFACTS');
  const orphan = prefix('recover') + randomBytes(16).toString('hex');
  const foreign = prefix('other') + randomBytes(16).toString('hex');
  await bucket.put(orphan, 'orphan');
  await bucket.put(foreign, 'foreign');
  await db.exec("INSERT INTO faults VALUES ('aged')");
  assert.equal((await send('recover', '/sweep')).status, 200);
  assert.equal((await send('recover', `/download/${record.id}`)).status, 404);
  assert.equal((await (await send('recover', '/usage')).json()).bytes, 0);
  assert.equal((await bucket.list({ prefix: prefix('recover') })).objects.length, 0);
  assert.equal(await (await bucket.get(foreign)).text(), 'foreign');
});

test('declarations and actual stream length are checked independently of the HTTP client', async () => {
  assert.equal((await upload('length', '/upload-short')).status, 502);
  assert.equal((await upload('length', '/upload-large')).status, 400);
  assert.equal((await upload('length', '/upload-negative')).status, 400);
  await send('length', '/sweep');
  assert.equal((await (await send('length', '/usage')).json()).objects, 0);
});
