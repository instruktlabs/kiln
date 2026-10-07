import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runtime, namespace, bucket;
const bytes = Buffer.from('synthetic saved source; not a credential');
const sha = (value) => createHash('sha256').update(value).digest('hex');
before(async () => {
  const built = await build({
    entryPoints: [fileURLToPath(new URL('./recovery-artifact-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'recovery-audit',
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'RecoveryArtifactFixture', useSQLite: true } },
      outboundService: () => {
        throw new Error('Recovery audit must not use the network');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
  bucket = await runtime.getR2Bucket('ARTIFACTS');
});
after(async () => runtime?.dispose());
const send = (owner, path, init) =>
  namespace.getByName(owner).fetch(`https://fixture.internal${path}`, init);
const database = (owner) =>
  runtime.unsafeGetDurableObjectStorage('recovery-audit', 'RecoveryArtifactFixture', {
    id: namespace.idFromName(owner).toString(),
  });
const key = (owner, id) => `tenants/${namespace.idFromName(owner)}/artifacts/${id}`;
async function seed(owner, saved = true) {
  const response = await send(owner, '/upload', {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': 'application/javascript',
      'content-length': String(bytes.length),
      'x-artifact-name': 'source.kiln.js',
      'x-artifact-sha256': sha(bytes),
    },
  });
  assert.equal(response.status, 201);
  const artifact = await response.json();
  let group;
  if (saved) {
    const response = await send(owner, '/save', {
      method: 'POST',
      body: JSON.stringify({
        key: 'library/example/revision',
        files: { 'source.kiln.js': artifact.id },
        metadata: { name: 'Private example title' },
      }),
    });
    assert.equal(response.status, 200);
    group = await response.json();
  }
  return { artifact, group };
}
async function audit(owner, id) {
  const response = await send(owner, `/audit/${id}`);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function state(owner) {
  const db = await database(owner);
  const result = {};
  for (const table of [
    'artifacts',
    'saved_groups',
    'group_files',
    'storage_retirement',
    'artifact_writes',
    'maintenance',
    'storage_format',
  ])
    result[table] = await db.exec(`SELECT * FROM ${table}`);
  result.alarm = await (await send(owner, '/alarm')).json();
  return result;
}

test('recovery verifies actual saved bytes without changing metadata, alarm or R2 object', async () => {
  const owner = 'valid',
    { artifact } = await seed(owner);
  const before = await state(owner),
    object = await bucket.head(key(owner, artifact.id));
  assert.deepEqual(await audit(owner, artifact.id), {
    status: 'verified',
    artifactId: artifact.id,
    bytes: bytes.length,
    sha256: sha(bytes),
  });
  assert.deepEqual(await state(owner), before);
  assert.equal((await bucket.head(key(owner, artifact.id))).etag, object.etag);
});

test('missing and corrupt bytes remain explicit failures rather than empty successful recovery', async () => {
  const owner = 'corrupt',
    { artifact } = await seed(owner);
  await bucket.delete(key(owner, artifact.id));
  assert.equal((await audit(owner, artifact.id)).status, 'missing');
  await bucket.put(key(owner, artifact.id), 'wrong', { sha256: sha('wrong') });
  assert.equal((await audit(owner, artifact.id)).status, 'mismatch');
});

test('provider checksum metadata cannot substitute for hashing the returned bytes', async () => {
  const owner = 'wrong-body',
    { artifact } = await seed(owner);
  await send(owner, '/fault/wrong-body');
  assert.equal((await audit(owner, artifact.id)).status, 'mismatch');
});

test('body length overflow is rejected and cancelled', async () => {
  const owner = 'long-body',
    { artifact } = await seed(owner);
  await send(owner, '/fault/long-body');
  assert.equal((await audit(owner, artifact.id)).status, 'mismatch');
  assert.equal((await (await send(owner, '/counts')).json()).cancels, 1);
});

test('an unsaved artifact, deleted saved group and retired tenant are never recovery candidates', async () => {
  const unsaved = await seed('unsaved', false);
  assert.equal((await send('unsaved', `/audit/${unsaved.artifact.id}`)).status, 409);
  const deleted = await seed('deleted');
  await send('deleted', `/delete/${deleted.group.id}`, { method: 'POST' });
  assert.equal((await send('deleted', `/audit/${deleted.artifact.id}`)).status, 409);
  const retired = await seed('retired');
  await send('retired', '/retire', { method: 'POST' });
  assert.equal((await send('retired', `/audit/${retired.artifact.id}`)).status, 410);
});

test('corrupt metadata cannot select another tenant or perform an arbitrary object read', async () => {
  const owner = 'foreign-key',
    { artifact } = await seed(owner),
    other = await seed('other');
  const db = await database(owner);
  await db.exec(`UPDATE artifacts SET object_key='${key('other', other.artifact.id)}'`);
  assert.equal((await send(owner, `/audit/${artifact.id}`)).status, 409);
  assert.deepEqual(await (await send(owner, '/counts')).json(), { reads: 0, cancels: 0 });
  assert.equal((await audit('other', other.artifact.id)).status, 'verified');
});

test('pending writes, unsupported storage format and malformed selections stop before R2', async () => {
  const owner = 'metadata',
    { artifact } = await seed(owner),
    db = await database(owner);
  await db.exec(`INSERT INTO artifact_writes VALUES ('${artifact.id}')`);
  assert.equal((await send(owner, `/audit/${artifact.id}`)).status, 409);
  await db.exec('DELETE FROM artifact_writes; UPDATE storage_format SET version=99');
  assert.equal((await send(owner, `/audit/${artifact.id}`)).status, 409);
  assert.equal((await send(owner, '/audit/not-an-artifact')).status, 400);
  assert.equal((await (await send(owner, '/counts')).json()).reads, 0);
});

test('metadata changes and retirement during R2 reads cannot yield a verified result', async () => {
  for (const fault of ['metadata-change', 'retire-during-read', 'retire-during-body']) {
    const { artifact } = await seed(fault);
    await send(fault, `/fault/${fault}`);
    assert.equal((await audit(fault, artifact.id)).status, 'changed');
  }
});

test('an unresolved late provider read retains admission until it actually settles', async () => {
  const owner = 'held-read',
    { artifact } = await seed(owner);
  await send(owner, '/fault/held-get');
  try {
    assert.equal((await audit(owner, artifact.id)).status, 'unavailable');
    assert.equal((await send(owner, `/audit/${artifact.id}`)).status, 409);
    assert.equal((await (await send(owner, '/counts')).json()).reads, 1);
  } finally {
    await send(owner, '/release-get');
  }
  await delay(30);
  assert.equal((await (await send(owner, '/counts')).json()).cancels, 1);
});

test('truncated streams and provider failures cannot yield a verified digest or leak diagnostics', async () => {
  for (const [fault, expected] of [
    ['short-body', 'mismatch'],
    ['provider-error', 'unavailable'],
  ]) {
    const { artifact } = await seed(fault);
    await send(fault, `/fault/${fault}`);
    assert.deepEqual(await audit(fault, artifact.id), {
      status: expected,
      artifactId: artifact.id,
    });
  }
});

test('a dangling or contradictory saved-file index cannot authorize an R2 read', async () => {
  for (const statement of ["UPDATE saved_groups SET files='{}'", 'DELETE FROM saved_groups']) {
    const owner = sha(statement),
      { artifact } = await seed(owner),
      db = await database(owner);
    await db.exec(statement);
    assert.equal((await send(owner, `/audit/${artifact.id}`)).status, 409);
    assert.equal((await (await send(owner, '/counts')).json()).reads, 0);
  }
});

test('stalled body and late R2 response have bounded failure and release their streams', async () => {
  for (const fault of ['stalled-body', 'stalled-get']) {
    const { artifact } = await seed(fault);
    await send(fault, `/fault/${fault}`);
    assert.equal((await audit(fault, artifact.id)).status, 'unavailable');
    await delay(100);
    assert.equal((await (await send(fault, '/counts')).json()).cancels, 1, fault);
  }
});
