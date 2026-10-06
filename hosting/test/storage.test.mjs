import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runtime;
let namespace;
const hash = (value) => createHash('sha256').update(value).digest('hex');
before(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/tenant-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'tenant',
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'KilnTenant', useSQLite: true } },
      bindings: {
        STORAGE_MAX_BYTES: '1048576',
        STORAGE_MAX_OBJECTS: '32',
        STORAGE_MAX_GROUPS: '8',
      },
      outboundService: async () => {
        throw new Error('Storage must not use outbound fetch');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
});
after(async () => runtime?.dispose());

const tenant = (name) => namespace.get(namespace.idFromName(name));
const send = (owner, path, init) => tenant(owner).fetch(`https://tenant.internal${path}`, init);
async function upload(owner, bytes = Buffer.from('source bytes'), extra = {}) {
  const response = await send(owner, '/internal/artifacts', {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length),
      'x-artifact-sha256': hash(bytes),
      'x-artifact-name': 'asset.glb',
      ...extra,
    },
  });
  return { response, record: response.ok ? await response.json() : undefined };
}
const save = (owner, key, files, metadata = {}) =>
  send(owner, '/internal/groups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, files, metadata }),
  });
const get = (owner, id) => send(owner, `/mcp/artifacts/${id}`);
const sweep = (owner) => send(owner, '/internal/maintenance', { method: 'POST' });
const usage = async (owner) => (await send(owner, '/internal/usage')).json();
async function database(owner) {
  return runtime.unsafeGetDurableObjectStorage('tenant', 'KilnTenant', {
    id: namespace.idFromName(owner).toString(),
  });
}

test('private tenant worker has no public upload or download route', async () => {
  assert.equal(
    (
      await runtime.dispatchFetch('https://anything.example/internal/artifacts', {
        method: 'POST',
        body: 'data',
      })
    ).status,
    404,
  );
});

test('uploaded bytes are immutable, tenant-private and downloadable with exact metadata', async () => {
  const bytes = Buffer.from('function build() { return mesh; }');
  const { response, record } = await upload('bytes-alice', bytes, {
    'x-artifact-name': 'source.kiln.js',
  });
  assert.equal(response.status, 201);
  assert.equal(record.sha256, hash(bytes));
  assert.equal(record.bytes, bytes.length);
  assert.equal(record.expiresAt - record.createdAt, 7 * 24 * 60 * 60 * 1000);
  const result = await get('bytes-alice', record.id);
  assert.equal(result.status, 200);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  assert.equal(result.headers.get('etag'), `"${hash(bytes)}"`);
  assert.match(result.headers.get('content-disposition'), /attachment; filename="source.kiln.js"/);
  assert.equal((await get('bytes-bob', record.id)).status, 404);
  assert.equal(
    (
      await tenant('bytes-alice').fetch(`https://tenant.internal/mcp/artifacts/${record.id}`, {
        method: 'PUT',
        body: 'overwrite',
      })
    ).status,
    405,
  );
});

test('saving a revision pins all its bytes atomically and keeps the record immutable', async () => {
  const first = (await upload('save', Buffer.from('source'))).record;
  const second = (await upload('save', Buffer.from('GLB'))).record;
  const files = { 'source.kiln.js': first.id, 'asset.glb': second.id };
  const metadata = { engineVersion: '1.0.0-rc.1', parentRevision: null };
  const saved = await save('save', 'library/box/rev-1', files, metadata);
  assert.equal(saved.status, 201);
  const record = await saved.json();
  assert.deepEqual(record.files, files);
  assert.deepEqual(record.metadata, metadata);
  assert.equal((await save('save', 'library/box/rev-1', files, metadata)).status, 200);
  assert.equal((await save('save', 'library/box/rev-1', { 'asset.glb': second.id })).status, 409);
  const db = await database('save');
  await db.exec('UPDATE artifacts SET expires_at = 1');
  assert.equal((await sweep('save')).status, 200);
  assert.equal((await get('save', first.id)).status, 200);
  assert.equal((await get('save', second.id)).status, 200);
});

test('a failed cross-tenant save cannot partially pin a local artifact', async () => {
  const local = (await upload('pin-alice')).record;
  const foreign = (await upload('pin-bob')).record;
  assert.equal(
    (await save('pin-alice', 'asset/invalid/rev', { local: local.id, foreign: foreign.id })).status,
    404,
  );
  const db = await database('pin-alice');
  await db.exec('UPDATE artifacts SET expires_at = 1');
  await sweep('pin-alice');
  assert.equal((await get('pin-alice', local.id)).status, 404);
  assert.equal((await get('pin-bob', foreign.id)).status, 200);
});

test('expired unsaved artifacts deny reads before cleanup and are removed from R2', async () => {
  const record = (await upload('expiry')).record;
  const db = await database('expiry');
  await db.exec('UPDATE artifacts SET expires_at = 1');
  assert.equal((await get('expiry', record.id)).status, 404);
  await sweep('expiry');
  assert.equal((await usage('expiry')).bytes, 0);
  const bucket = await runtime.getR2Bucket('ARTIFACTS');
  const objects = await bucket.list({ prefix: `tenants/${namespace.idFromName('expiry')}/` });
  assert.equal(objects.objects.length, 0);
});

test('concurrent uploads reserve quota before R2 work', async () => {
  const results = await Promise.all([
    upload('quota', Buffer.alloc(600_000, 1)),
    upload('quota', Buffer.alloc(600_000, 2)),
  ]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [201, 507]);
  assert.equal((await usage('quota')).bytes, 600_000);
});

test('checksum rejection does not publish a record or consume quota', async () => {
  const { response } = await upload('checksum', Buffer.from('different'), {
    'x-artifact-sha256': '0'.repeat(64),
  });
  assert.equal(response.status, 502);
  await sweep('checksum');
  assert.equal((await usage('checksum')).bytes, 0);
});

test('deleting one revision preserves shared bytes; deleting its last owner removes them', async () => {
  const blob = (await upload('delete')).record;
  const a = await (await save('delete', 'asset/a/rev', { source: blob.id })).json();
  const b = await (await save('delete', 'asset/b/rev', { source: blob.id })).json();
  assert.equal(
    (await send('delete', `/internal/groups/${a.id}`, { method: 'DELETE' })).status,
    200,
  );
  assert.equal((await get('delete', blob.id)).status, 200);
  assert.equal(
    (await send('delete-other', `/internal/groups/${b.id}`, { method: 'DELETE' })).status,
    404,
  );
  assert.equal(
    (await send('delete', `/internal/groups/${b.id}`, { method: 'DELETE' })).status,
    200,
  );
  assert.equal((await get('delete', blob.id)).status, 404);
  assert.equal((await usage('delete')).bytes, 0);
});

test('metadata and R2 bytes survive a Durable Object eviction', async () => {
  const blob = (await upload('restart', Buffer.from('retained'))).record;
  const id = namespace.idFromName('restart').toString();
  await runtime.unsafeEvictDurableObject('tenant', 'KilnTenant', { id });
  const response = await get('restart', blob.id);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'retained');
});

test('download refuses corrupted or missing R2 bytes, including HEAD requests', async () => {
  const blob = (await upload('integrity', Buffer.from('original'))).record;
  const bucket = await runtime.getR2Bucket('ARTIFACTS');
  const key = `tenants/${namespace.idFromName('integrity')}/artifacts/${blob.id}`;
  await bucket.put(key, 'changed!');
  assert.equal((await get('integrity', blob.id)).status, 502);
  assert.equal(
    (await send('integrity', `/mcp/artifacts/${blob.id}`, { method: 'HEAD' })).status,
    502,
  );
  await bucket.delete(key);
  assert.equal((await get('integrity', blob.id)).status, 502);
});

test('empty artifacts support HEAD and reject unsafe declarations before reserving quota', async () => {
  const blob = (await upload('empty', Buffer.alloc(0))).record;
  const head = await send('empty', `/mcp/artifacts/${blob.id}`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '0');
  assert.equal(await head.text(), '');
  for (const headers of [{ 'x-artifact-name': '../source.js' }, { 'content-type': 'text/html' }]) {
    assert.equal(
      (await upload('declarations', Buffer.from('bytes'), headers)).response.status,
      400,
    );
  }
  assert.equal((await usage('declarations')).objects, 0);
});

test('object and saved-group counts prevent tiny-file quota bypass', async () => {
  const uploads = await Promise.all(
    Array.from({ length: 33 }, () => upload('object-count', Buffer.alloc(0))),
  );
  assert.equal(uploads.filter(({ response }) => response.status === 201).length, 32);
  assert.equal(uploads.filter(({ response }) => response.status === 507).length, 1);
  const id = uploads.find(({ record }) => record)?.record.id;
  for (let i = 0; i < 8; i++)
    assert.equal((await save('object-count', `revision/${i}`, { source: id })).status, 201);
  assert.equal((await save('object-count', 'revision/overflow', { source: id })).status, 507);
  assert.equal((await save('object-count', 'revision/0', { source: id })).status, 200);
  assert.equal((await usage('object-count')).groups, 8);
});

test('saved metadata consumes the same byte quota as artifacts without partial pinning', async () => {
  const blob = (await upload('metadata', Buffer.alloc(1048576 - 80))).record;
  const rejected = await save(
    'metadata',
    'large-metadata',
    { source: blob.id },
    { details: 'x'.repeat(100) },
  );
  assert.equal(rejected.status, 507);
  assert.equal((await usage('metadata')).groups, 0);
  const db = await database('metadata');
  await db.exec('UPDATE artifacts SET expires_at = 1');
  await sweep('metadata');
  assert.equal((await usage('metadata')).totalBytes, 0);
});
