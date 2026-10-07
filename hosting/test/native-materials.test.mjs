import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createMaterialRecordV1 } from '../../lib/material-library-node.js';

let NativeMaterialLibrary, runtime, namespace, sample;
before(async () => {
  const output = new URL('../../.cache/native-material-test/native-materials.mjs', import.meta.url);
  await mkdir(fileURLToPath(new URL('./', output)), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-materials.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    alias: {
      '@instruktlabs/kiln/material-library': fileURLToPath(
        new URL('../../lib/material-library.js', import.meta.url),
      ),
      '@instruktlabs/kiln/material-library/node': fileURLToPath(
        new URL('../../lib/material-library-node.js', import.meta.url),
      ),
    },
  });
  ({ NativeMaterialLibrary } = await import(output));
  const worker = await build({
    entryPoints: [fileURLToPath(new URL('../src/tenant-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'native-materials',
      modules: true,
      script: worker.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'KilnTenant', useSQLite: true } },
      bindings: {
        STORAGE_MAX_BYTES: '4194304',
        STORAGE_MAX_OBJECTS: '128',
        STORAGE_MAX_GROUPS: '64',
      },
      outboundService: async () => {
        throw Error('No network');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
  sample = await fixture('hosted-stone');
});

function fixture(materialId) {
  return createMaterialRecordV1({
    materialId,
    name: 'Hosted stone',
    tileable: true,
    sources: [
      {
        id: 'authored',
        kind: 'procedural',
        provider: 'Kiln',
        creator: 'Fixture author',
        license: {
          spdx: 'CC0-1.0',
          url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          attribution: '',
        },
        originalFiles: [],
      },
    ],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        procedural: {
          schemaVersion: 2,
          size: 8,
          usage: 'albedo',
          layers: [
            { op: 'noise', colorA: 0x779944, colorB: 0xeeeecc, seed: 17, scale: 4, octaves: 2 },
          ],
        },
      },
    ],
  });
}
after(async () => runtime?.dispose());
const stub = (owner) => namespace.getByName(owner);
const storage = (owner) => async (request) => {
  assert.equal(new URL(request.url).origin, 'http://kiln-storage.internal');
  assert.equal(request.headers.get('authorization'), null);
  return stub(owner).fetch(
    new Request(`https://tenant.internal${new URL(request.url).pathname}`, request),
  );
};
const library = (owner) => new NativeMaterialLibrary({ fetch: storage(owner) });
const usage = async (owner) =>
  (await stub(owner).fetch('https://tenant.internal/internal/usage')).json();
const read = (lib) => lib.read(sample.manifest.materialId, sample.manifest.revisionId);

test('material import, list and exact reads survive a fresh host and tenant eviction while other accounts are denied', async () => {
  const original = structuredClone(sample);
  assert.deepEqual(await library('persist').import([sample]), [sample.manifest]);
  assert.deepEqual(await library('persist').list(), [sample.manifest]);
  await runtime.unsafeEvictDurableObject('native-materials', 'KilnTenant', {
    id: namespace.idFromName('persist').toString(),
  });
  assert.deepEqual(await read(library('persist')), original);
  await assert.rejects(read(library('foreign')), /not found/);
  assert.equal((await usage('foreign')).objects, 0);
  const count = await usage('persist');
  assert.equal(count.objects, 2);
  assert.equal(count.groups, 1);
  assert.ok(count.metadataBytes > 0);
});

test('concurrent identical imports are idempotent and discard losing staged files', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => library('race').import([sample])),
  );
  for (const result of results) assert.deepEqual(result, [sample.manifest]);
  assert.deepEqual(await read(library('race')), sample);
  const count = await usage('race');
  assert.equal(count.objects, 2);
  assert.equal(count.groups, 1);
});

test('invalid batches and path identities are rejected before any storage write', async () => {
  let calls = 0;
  const lib = new NativeMaterialLibrary({
    fetch: async (request) => {
      calls++;
      return storage('invalid')(request);
    },
  });
  const bad = await fixture('bad-stone');
  bad.files['baseColor.png'][bad.files['baseColor.png'].length - 1] ^= 1;
  await assert.rejects(lib.import([sample, bad]), /integrity|hash|PNG/);
  for (const [id, revision] of [
    ['../victim', sample.manifest.revisionId],
    [sample.manifest.materialId, `${sample.manifest.revisionId}\n`],
  ])
    await assert.rejects(lib.read(id, revision));
  await assert.rejects(lib.import([]));
  await assert.rejects(lib.import(Array(101).fill(sample)));
  await assert.rejects(lib.import([sample, sample]), /Duplicate/);
  assert.equal(calls, 0);
  assert.equal((await usage('invalid')).objects, 0);
});

test('imports snapshot caller-owned records before asynchronous verification', async () => {
  const input = structuredClone(sample);
  const importing = library('snapshot').import([input]);
  input.manifest.name = 'Mutated caller manifest';
  input.files['baseColor.png'].fill(0);
  assert.deepEqual(await importing, [sample.manifest]);
  assert.deepEqual(await read(library('snapshot')), sample);
});

test('quota failure preserves earlier atomic imports and catalogue paging has no duplicates or omissions', async () => {
  const records = await Promise.all(
    Array.from({ length: 65 }, (_, index) => fixture(`paged-${String(index).padStart(3, '0')}`)),
  );
  const lib = library('paged');
  await assert.rejects(lib.import(records), /quota reached/);
  const manifests = records.slice(0, 64).map((record) => record.manifest);
  assert.deepEqual(await lib.list(), manifests);
  const count = await usage('paged');
  assert.equal(count.groups, 64);
  assert.equal(count.objects, 128);
  // Idempotent reads/imports still work at the storage limit.
  assert.deepEqual(await lib.import([records[0]]), [records[0].manifest]);
});

test('partial staging failure cleans acknowledged files without storing a material', async () => {
  let uploads = 0;
  const lib = new NativeMaterialLibrary({
    fetch: async (request) => {
      if (new URL(request.url).pathname === '/internal/artifacts' && ++uploads === 2)
        return new Response('fixture upload unavailable', { status: 503 });
      return storage('staged-failure')(request);
    },
  });
  await assert.rejects(lib.import([sample]), /unavailable/);
  assert.deepEqual(await library('staged-failure').list(), []);
  assert.equal((await usage('staged-failure')).objects, 0);
});

test('lost commit acknowledgement cannot remove pinned material bytes', async () => {
  const lib = new NativeMaterialLibrary({
    fetch: async (request) => {
      const response = await storage('lost')(request);
      if (new URL(request.url).pathname === '/internal/materials/commit') {
        assert.equal(response.status, 201);
        await response.body?.cancel();
        return new Response('fixture lost acknowledgement', { status: 503 });
      }
      return response;
    },
  });
  await assert.rejects(lib.import([sample]), /unavailable/);
  assert.deepEqual(await read(library('lost')), sample);
  assert.equal((await usage('lost')).objects, 2);
});

test('material retention shares artifact quotas and corrupted objects cannot be read', async () => {
  await library('integrity').import([sample]);
  const db = await runtime.unsafeGetDurableObjectStorage('native-materials', 'KilnTenant', {
    id: namespace.idFromName('integrity').toString(),
  });
  await db.exec('UPDATE artifacts SET expires_at=1');
  await stub('integrity').fetch('https://tenant.internal/internal/maintenance', { method: 'POST' });
  assert.deepEqual(await read(library('integrity')), sample);
  const rows = await db.exec("SELECT object_key FROM artifacts WHERE filename='baseColor.png'");
  await (await runtime.getR2Bucket('ARTIFACTS')).put(rows[0].object_key, 'corrupt');
  await assert.rejects(read(library('integrity')), /integrity|unavailable/);
});

test('material index rejects arbitrary storage keys, extra filenames, foreign file IDs and malformed pagination', async () => {
  await library('indexed').import([sample]);
  const encoded = sample.manifest.revisionId.slice(7);
  const record = await (
    await stub('indexed').fetch(
      `https://tenant.internal/internal/materials/${sample.manifest.materialId}/${encoded}`,
    )
  ).json();
  for (const input of [
    {
      materialId: sample.manifest.materialId,
      revisionId: sample.manifest.revisionId,
      files: record.files,
      key: 'assets/project/victim',
    },
    { materialId: '../victim', revisionId: sample.manifest.revisionId, files: record.files },
    {
      materialId: sample.manifest.materialId,
      revisionId: sample.manifest.revisionId,
      files: { ...record.files, 'asset.glb': record.files['manifest.json'] },
    },
  ])
    assert.equal(
      (
        await stub('indexed').fetch('https://tenant.internal/internal/materials/commit', {
          method: 'POST',
          body: JSON.stringify(input),
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await stub('foreign-index').fetch('https://tenant.internal/internal/materials/commit', {
        method: 'POST',
        body: JSON.stringify({
          materialId: sample.manifest.materialId,
          revisionId: sample.manifest.revisionId,
          files: record.files,
        }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await stub('indexed').fetch('https://tenant.internal/internal/materials/list', {
        method: 'POST',
        body: JSON.stringify({ after: 'assets/project/elsewhere' }),
      })
    ).status,
    400,
  );
});
