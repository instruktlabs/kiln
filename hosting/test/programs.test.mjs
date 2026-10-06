import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runtime;
let namespace;
const canonical = (source) => `sha256:${createHash('sha256').update(source).digest('hex')}`;
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/tenant-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'programs',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'KilnTenant', useSQLite: true } },
      bindings: {
        STORAGE_MAX_BYTES: String(4 * 1024 * 1024),
        STORAGE_MAX_OBJECTS: '32',
        STORAGE_MAX_GROUPS: '8',
      },
      outboundService: async () => {
        throw new Error('Program storage must not use outbound fetch');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
});
after(async () => runtime?.dispose());
const send = (owner, path, init) =>
  namespace.get(namespace.idFromName(owner)).fetch(`https://tenant.internal${path}`, init);
const put = (owner, body) =>
  send(owner, '/internal/programs', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/javascript' },
  });
const get = (owner, ref) => send(owner, `/internal/programs/${encodeURIComponent(ref)}`);
const usage = async (owner) => (await send(owner, '/internal/usage')).json();
async function db(owner) {
  return runtime.unsafeGetDurableObjectStorage('programs', 'KilnTenant', {
    id: namespace.idFromName(owner).toString(),
  });
}

test('source retains the engine hash and exact UTF-8 bytes, including a leading BOM', async () => {
  const source = '\ufeffconst name = "Café 🏠"; return name;';
  const response = await put('unicode', source);
  assert.equal(response.status, 201);
  const record = await response.json();
  assert.equal(record.programRef, canonical(source));
  assert.equal(record.shortRef, `p_${record.programRef.slice(7)}`);
  for (const ref of [record.programRef, record.shortRef]) {
    const result = await get('unicode', ref);
    assert.equal(result.status, 200);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), Buffer.from(source));
  }
  assert.equal((await get('another-tenant', record.programRef)).status, 404);
  const stats = await (await send('unicode', '/internal/programs')).json();
  assert.equal(stats.entries, 1);
  assert.equal(stats.bytes, Buffer.byteLength(source));
  assert.equal(stats.maxSourceBytes, 1024 * 1024);
  assert.match(stats.retention, /seven days/);
});

test('same-source concurrent puts and reconnects share one artifact and preserve its expiry', async () => {
  const source = 'return new THREE.Group();';
  const results = await Promise.all(Array.from({ length: 8 }, () => put('dedupe', source)));
  for (const response of results) assert.equal(response.status, 201);
  const records = await Promise.all(results.map((response) => response.json()));
  assert.equal(new Set(records.map((record) => record.artifactId)).size, 1);
  assert.equal((await usage('dedupe')).objects, 1);
  const database = await db('dedupe');
  const expiry = (await database.exec('SELECT expires_at FROM artifacts'))[0].expires_at;
  await runtime.unsafeEvictDurableObject('programs', 'KilnTenant', {
    id: namespace.idFromName('dedupe').toString(),
  });
  const again = await (await put('dedupe', source)).json();
  assert.equal(again.artifactId, records[0].artifactId);
  const freshDb = await db('dedupe');
  assert.equal((await freshDb.exec('SELECT expires_at FROM artifacts'))[0].expires_at, expiry);
  assert.equal((await usage('dedupe')).objects, 1);
  assert.equal(await (await get('dedupe', again.shortRef)).text(), source);
});

test('unknown and unissued short handles deny access with source-recovery guidance', async () => {
  const record = await (await put('references', 'return "source";')).json();
  const guessed = record.shortRef.slice(0, 14);
  const missing = await get('references', guessed);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Send the source again with kiln_validate or kiln_render/);
  assert.equal((await get('references', `sha256:${'0'.repeat(64)}`)).status, 404);
  assert.equal((await get('references', 'sha256:bad')).status, 400);
});

test('unsaved expiry denies source before cleanup; saved source remains resolvable', async () => {
  const unsaved = await (await put('retention', 'return "unsaved";')).json();
  const saved = await (await put('retention', 'return "saved";')).json();
  const group = await send('retention', '/internal/groups', {
    method: 'POST',
    body: JSON.stringify({
      key: 'asset/revision',
      files: { 'source.kiln.js': saved.artifactId },
      metadata: {},
    }),
  });
  assert.equal(group.status, 201);
  const groupId = (await group.json()).id;
  await (await db('retention')).exec('UPDATE artifacts SET expires_at = 1');
  assert.equal((await get('retention', unsaved.programRef)).status, 404);
  assert.equal((await get('retention', saved.shortRef)).status, 200);
  await send('retention', '/internal/maintenance', { method: 'POST' });
  const stats = await (await send('retention', '/internal/programs')).json();
  assert.equal(stats.entries, 1);
  await send('retention', `/internal/groups/${groupId}`, { method: 'DELETE' });
  assert.equal((await get('retention', saved.programRef)).status, 404);
  assert.equal((await usage('retention')).objects, 0);
});

test('invalid UTF-8 and oversized source consume no quota; the exact source limit works', async () => {
  assert.equal((await put('source-limits', Buffer.from([0xff]))).status, 400);
  assert.equal((await put('source-limits', 'a'.repeat(1024 * 1024 + 1))).status, 413);
  assert.equal((await usage('source-limits')).objects, 0);
  const empty = await (await put('source-limits', '')).json();
  assert.equal(empty.programRef, canonical(''));
  const response = await put('source-limits', 'a'.repeat(1024 * 1024));
  assert.equal(response.status, 201);
  const record = await response.json();
  assert.equal(
    (await (await get('source-limits', record.shortRef)).arrayBuffer()).byteLength,
    1024 * 1024,
  );
});

test('corrupt stored source cannot be accepted by get or an idempotent put', async () => {
  const source = 'return "original";';
  const record = await (await put('source-integrity', source)).json();
  const bucket = await runtime.getR2Bucket('ARTIFACTS');
  const key = `tenants/${namespace.idFromName('source-integrity')}/artifacts/${record.artifactId}`;
  await bucket.put(key, 'different source');
  assert.equal((await get('source-integrity', record.programRef)).status, 502);
  assert.equal((await put('source-integrity', source)).status, 502);
  assert.equal((await usage('source-integrity')).objects, 1);
});

test('source shares artifact quota, never evicts existing work and can retry after cleanup', async () => {
  const bytes = Buffer.alloc(4 * 1024 * 1024, 1);
  const upload = await send('shared-quota', '/internal/artifacts', {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length),
      'x-artifact-name': 'asset.glb',
      'x-artifact-sha256': createHash('sha256').update(bytes).digest('hex'),
    },
  });
  assert.equal(upload.status, 201);
  const blob = await upload.json();
  const source = 'return "quota retry";';
  const failures = await Promise.all([put('shared-quota', source), put('shared-quota', source)]);
  for (const response of failures) assert.equal(response.status, 507);
  assert.equal(
    (await send('shared-quota', `/mcp/artifacts/${blob.id}`, { method: 'HEAD' })).status,
    200,
  );
  assert.equal((await usage('shared-quota')).objects, 1);
  await (await db('shared-quota')).exec('UPDATE artifacts SET expires_at = 1');
  await send('shared-quota', '/internal/maintenance', { method: 'POST' });
  const retry = await put('shared-quota', source);
  assert.equal(retry.status, 201);
  const record = await retry.json();
  assert.equal(await (await get('shared-quota', record.programRef)).text(), source);
  assert.equal((await usage('shared-quota')).bytes, Buffer.byteLength(source));
});
