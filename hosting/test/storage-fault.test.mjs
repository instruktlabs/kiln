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
const status = async (owner) => (await send(owner, '/status')).json();
async function until(predicate) {
  const deadline = Date.now() + 4000;
  while (!(await predicate())) {
    assert(Date.now() < deadline, 'Fixture did not reach the expected state');
    await delay(10);
  }
}

test('retirement waits for a late write and maintenance preserves its durable evidence', async () => {
  const owner = 'retire-late-put';
  const db = await database(owner);
  await db.exec("INSERT INTO faults VALUES ('hold-put')");
  const pending = upload(owner);
  try {
    await until(async () => (await (await send(owner, '/held')).json()).includes('put'));
    assert.equal((await pending).status, 502);
    assert.equal((await send(owner, '/sweep')).status, 200);
    assert.equal((await status(owner)).remainingObjects, 1, 'retain unresolved write metadata');
    const retired = await (await send(owner, '/retire')).json();
    assert.equal(retired.state, 'retiring');
    assert.equal(retired.pendingWrites, 1);
    assert.equal((await upload(owner)).status, 410);
    await send(owner, '/release/put');
    await until(async () => (await status(owner)).pendingWrites === 0);
    await send(owner, '/run-alarm');
    assert.deepEqual(await status(owner), {
      state: 'purged',
      pendingWrites: 0,
      remainingObjects: 0,
      alarm: null,
    });
    assert.equal(
      (await (await runtime.getR2Bucket('ARTIFACTS')).list({ prefix: prefix(owner) })).objects
        .length,
      0,
    );
  } finally {
    await send(owner, '/release/put');
    await pending;
  }
});

test('failed retirement stays denied across eviction and retries deletion before clearing its alarm', async () => {
  const owner = 'retire-failed-delete';
  const db = await database(owner);
  const record = await (await upload(owner)).json();
  await db.exec("INSERT INTO faults VALUES ('delete-failure')");
  assert.equal((await send(owner, '/retire')).status, 503);
  assert.equal((await status(owner)).state, 'retiring');
  assert.equal((await status(owner)).remainingObjects, 1);
  assert.notEqual((await status(owner)).alarm, null);
  await runtime.unsafeEvictDurableObject('faults', 'StorageFaultFixture', {
    id: namespace.idFromName(owner).toString(),
  });
  assert.equal((await upload(owner)).status, 410);
  assert.equal((await send(owner, `/download/${record.id}`)).status, 404);
  await db.exec('DELETE FROM faults');
  assert.equal((await send(owner, '/run-alarm')).status, 200);
  assert.deepEqual(await status(owner), {
    state: 'purged',
    pendingWrites: 0,
    remainingObjects: 0,
    alarm: null,
  });
});

test('retirement recovers a lost put acknowledgement only from matching committed bytes', async () => {
  for (const committed of [false, true]) {
    const owner = `retire-lost-ack-${committed}`;
    const db = await database(owner);
    const record = await (await upload(owner)).json();
    await db.exec("UPDATE artifacts SET state='uploading',created_at=1");
    await db.exec('INSERT INTO artifact_writes VALUES (?)', record.id);
    if (!committed)
      await (await runtime.getR2Bucket('ARTIFACTS')).delete(prefix(owner) + record.id);
    await runtime.unsafeEvictDurableObject('faults', 'StorageFaultFixture', {
      id: namespace.idFromName(owner).toString(),
    });
    const result = await (await send(owner, '/retire')).json();
    assert.equal(result.state, committed ? 'purged' : 'retiring');
    assert.equal(result.pendingWrites, committed ? 0 : 1);
    assert.equal((await upload(owner)).status, 410);
    if (!committed) assert.notEqual((await status(owner)).alarm, null);
  }
});

test('an older maintenance pass cannot recreate metadata or alarms after retirement', async () => {
  const owner = 'retire-maintenance-race';
  const db = await database(owner);
  await db.exec("INSERT INTO faults VALUES ('hold-list')");
  const pending = send(owner, '/sweep');
  try {
    await until(async () => (await (await send(owner, '/held')).json()).includes('list'));
    assert.equal((await (await send(owner, '/retire')).json()).state, 'purged');
    await send(owner, '/release/list');
    assert.equal((await pending).status, 200);
    assert.equal((await db.exec('SELECT COUNT(*) AS n FROM maintenance'))[0].n, 0);
    assert.equal((await status(owner)).alarm, null);
  } finally {
    await send(owner, '/release/list');
    await pending;
  }
});

test('an unresolved write batch cannot indefinitely block retention of other expired files', async () => {
  const owner = 'retention-pending-batch';
  const db = await database(owner);
  const record = await (await upload(owner)).json();
  for (let i = 0; i < 32; i++) {
    const id = randomBytes(16).toString('hex');
    await db.exec(
      "INSERT INTO artifacts SELECT ?,?,sha256,bytes,filename,media_type,1,1,'uploading' FROM artifacts WHERE id=?",
      id,
      prefix(owner) + id,
      record.id,
    );
    await db.exec('INSERT INTO artifact_writes VALUES (?)', id);
  }
  await send(owner, '/sweep');
  await db.exec('UPDATE artifacts SET expires_at=1 WHERE id=?', record.id);
  assert.equal((await send(owner, '/sweep')).status, 200);
  assert.equal(
    await (await runtime.getR2Bucket('ARTIFACTS')).head(prefix(owner) + record.id),
    null,
  );
  assert.equal((await status(owner)).pendingWrites, 32);
  assert.equal((await status(owner)).remainingObjects, 32);
});

test('unsaved retention uses one creation instant even when the clock advances', async () => {
  const db = await database('retention-clock');
  await db.exec("INSERT INTO faults VALUES ('ticking-clock')");
  const result = await upload('retention-clock');
  assert.equal(result.status, 201);
  const record = await result.json();
  assert.equal(record.expiresAt - record.createdAt, 7 * 24 * 60 * 60 * 1000);
});

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
