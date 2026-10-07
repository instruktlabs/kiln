import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { createKilnToolHost } from '../../dist/mcp-engine.mjs';
import { decodeAssetBundle } from '../../lib/assets.js';
import { renderGLB } from '../../lib/render.js';
import {
  createMaterialRecordV1,
  createMaterialLibraryPayload,
} from '../../lib/material-library-node.js';
import { materialLibraryPortableSpec } from '../../lib/material-library.js';

let NativeAssetLibrary;
let NativeProgramStore;
let runtime;
let namespace;
const source =
  "function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#aaaaaa'),{parent:r});return r;}";
const persisted = (value) => JSON.parse(JSON.stringify(value));
let glb;
before(async () => {
  const outdir = fileURLToPath(new URL('../../.cache/hosted-asset-test/', import.meta.url));
  await mkdir(outdir, { recursive: true });
  await build({
    entryPoints: ['native-assets', 'native-programs'].map((name) =>
      fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url)),
    ),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    outdir,
    outExtension: { '.js': '.mjs' },
    alias: Object.fromEntries(
      [
        ['assets', 'assets'],
        ['assets/node', 'assets-node'],
        ['material-library/node', 'material-library-node'],
      ].map(([name, file]) => [
        `@instruktlabs/kiln/${name}`,
        fileURLToPath(new URL(`../../lib/${file}.js`, import.meta.url)),
      ]),
    ),
  });
  ({ NativeAssetLibrary } = await import(
    new URL('../../.cache/hosted-asset-test/native-assets.mjs', import.meta.url)
  ));
  ({ NativeProgramStore } = await import(
    new URL('../../.cache/hosted-asset-test/native-programs.mjs', import.meta.url)
  ));
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
      name: 'native-assets',
      modules: true,
      script: worker.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'KilnTenant', useSQLite: true } },
      bindings: {
        STORAGE_MAX_BYTES: String(16 * 1024 * 1024),
        STORAGE_MAX_OBJECTS: '256',
        STORAGE_MAX_GROUPS: '64',
      },
      outboundService: async () => {
        throw new Error('No external requests');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
  glb = (await renderGLB(source)).glb;
});
after(async () => runtime?.dispose());
const fetchFor = (owner) => async (request) => {
  const url = new URL(request.url);
  assert.equal(url.origin, 'http://kiln-storage.internal');
  assert.equal(request.headers.get('authorization'), null);
  return namespace
    .get(namespace.idFromName(owner))
    .fetch(new Request(`https://tenant.internal${url.pathname}`, request));
};
const library = (owner) => new NativeAssetLibrary({ fetch: fetchFor(owner) });
const usage = async (owner) =>
  (
    await namespace.get(namespace.idFromName(owner)).fetch('https://tenant.internal/internal/usage')
  ).json();

test('native links use server-issued tickets for exact saved revisions and never accept backend URLs', async () => {
  const assets = library('download-links');
  const saved = await assets.save('project', { name: 'Box', code: source, glb });
  const urls = await assets.downloadUrls(
    'https://kiln.example.com',
    'project',
    saved.assetId,
    saved.revisionId,
  );
  assert.deepEqual(Object.keys(urls).sort(), ['asset.glb', 'manifest.json', 'source.kiln.js']);
  const uri = new URL(urls['source.kiln.js']);
  assert.equal(uri.origin, 'https://kiln.example.com');
  assert.match(uri.pathname, /^\/downloads\/[a-f0-9]{64}\/source\.kiln\.js$/);
  const read = await namespace
    .getByName('download-links')
    .fetch(`https://tenant.internal/internal${uri.pathname}`);
  assert.equal(read.status, 200);
  assert.equal(await read.text(), source);
  assert.equal(
    (
      await namespace
        .getByName('other-downloads')
        .fetch(`https://tenant.internal/internal${uri.pathname}`)
    ).status,
    404,
  );
  await assert.rejects(
    assets.downloadUrls('https://evil.example/path', 'project', saved.assetId, saved.revisionId),
  );
  await assert.rejects(
    assets.downloadUrls('https://kiln.example.com', 'foreign', saved.assetId, saved.revisionId),
  );
  for (const invalid of [
    { ticket: 'a'.repeat(64), expiresAt: Date.now() + 600000, files: ['../../secret'] },
    { ticket: `${'a'.repeat(64)}\n`, expiresAt: Date.now() + 600000, files: ['asset.glb'] },
    { ticket: 'a'.repeat(64), expiresAt: 0, files: ['asset.glb'] },
    { ticket: 'a'.repeat(64), expiresAt: Date.now() + 600000, files: ['https://evil.example'] },
    { ticket: 'a'.repeat(64), expiresAt: Date.now() + 600000, files: ['asset.glb', 'asset.glb'] },
  ]) {
    const forged = new NativeAssetLibrary({ fetch: async () => Response.json(invalid) });
    await assert.rejects(
      forged.downloadUrls('https://kiln.example.com', 'project', saved.assetId, saved.revisionId),
    );
  }
});

test('save, revise, reconnect and export preserve exact records and source lineage', async () => {
  const assets = library('saved');
  assert.deepEqual(
    assets.collections().map((item) => item.id),
    ['project', 'library'],
  );
  const first = await assets.save('project', { name: 'Box', code: source, glb });
  const revised = await assets.save('project', {
    name: 'Revised',
    assetId: first.assetId,
    parentRevision: first.revisionId,
    code: `${source}\n// revised`,
    glb,
  });
  assert.equal(revised.parentRevision, first.revisionId);
  await runtime.unsafeEvictDurableObject('native-assets', 'KilnTenant', {
    id: namespace.idFromName('saved').toString(),
  });
  const fresh = library('saved');
  const records = await fresh.list('project');
  assert.equal(records.length, 2);
  const original = await fresh.read('project', first.assetId, first.revisionId);
  assert.deepEqual(original.manifest, persisted(first));
  assert.deepEqual(Buffer.from(original.files['asset.glb']), Buffer.from(glb));
  assert.equal(new TextDecoder().decode(original.files['source.kiln.js']), source);
  const latest = await fresh.read('project', revised.assetId, revised.revisionId);
  const decoded = decodeAssetBundle(await fresh.exportBundle([original, latest]));
  assert.equal(decoded.length, 2);
  assert.deepEqual(decoded[1].manifest, persisted(revised));
  assert.deepEqual(Buffer.from(decoded[0].files['asset.glb']), Buffer.from(glb));
  await assert.rejects(
    library('other').read('project', first.assetId, first.revisionId),
    /not found/i,
  );
});

test('copy and repeated imports preserve identity and do not allocate duplicate storage', async () => {
  const assets = library('copy');
  const saved = await assets.save('project', { name: 'Box', code: source, glb });
  const record = await assets.read('project', saved.assetId, saved.revisionId);
  record.manifest.ownerProvenance = { fixture: 'preserve unknown provenance' };
  await assets.import('library', [record]);
  const before = await usage('copy');
  await library('copy').import('library', [record]);
  assert.deepEqual(await usage('copy'), before);
  const copied = await assets.read('library', saved.assetId, saved.revisionId);
  assert.deepEqual(copied.manifest, record.manifest);
  const changed = structuredClone(record);
  changed.manifest.name = 'Conflicting name';
  await assert.rejects(assets.import('library', [changed]), /immutable/);
  assert.deepEqual(
    (await assets.read('library', saved.assetId, saved.revisionId)).manifest,
    record.manifest,
  );
});

test('invalid batches publish nothing and concurrent new saves require a parent', async () => {
  const assets = library('invalid-assets');
  const first = await assets.save('project', { name: 'Box', assetId: 'shared', code: source, glb });
  const record = await assets.read('project', first.assetId, first.revisionId);
  const broken = structuredClone(record);
  broken.manifest.revisionId = 'r_broken';
  broken.files['asset.glb'][0] = 0;
  const before = await usage('invalid-assets');
  await assert.rejects(assets.import('library', [record, broken]), /integrity|GLB/);
  assert.deepEqual(await usage('invalid-assets'), before);
  assert.equal((await assets.list('library')).length, 0);
  const races = await Promise.allSettled(
    [1, 2].map(() => assets.save('library', { name: 'Race', assetId: 'race', code: source, glb })),
  );
  assert.equal(races.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(races.filter((item) => item.status === 'rejected').length, 1);
  assert.equal(
    (await usage('invalid-assets')).objects,
    6,
    'A failed competing save discards only its unpinned files',
  );
});

test('partial upload failure discards staging files while deletion preserves copies in other collections', async () => {
  let uploads = 0;
  const flaky = new NativeAssetLibrary({
    fetch: async (request) => {
      if (new URL(request.url).pathname === '/internal/artifacts' && ++uploads === 2) {
        return new Response('fixture upload failure', { status: 503 });
      }
      return fetchFor('failed-save')(request);
    },
  });
  await assert.rejects(flaky.save('project', { name: 'Failed', code: source, glb }), /unavailable/);
  assert.equal((await usage('failed-save')).objects, 0);
  const assets = library('deletion');
  const saved = await assets.save('project', { name: 'Keep copy', code: source, glb });
  const record = await assets.read('project', saved.assetId, saved.revisionId);
  await assets.import('library', [record]);
  await assets.deleteRevision('project', saved.assetId, saved.revisionId);
  await assert.rejects(assets.read('project', saved.assetId, saved.revisionId), /not found/);
  assert.deepEqual(
    (await assets.read('library', saved.assetId, saved.revisionId)).manifest,
    record.manifest,
  );
});

test('a lost commit acknowledgement preserves saved files through cleanup and reconnect', async () => {
  const owner = 'lost-commit-ack';
  const flaky = new NativeAssetLibrary({
    fetch: async (request) => {
      const response = await fetchFor(owner)(request);
      if (new URL(request.url).pathname === '/internal/assets/commit') {
        assert.equal(response.status, 201);
        await response.body?.cancel();
        return new Response('fixture lost acknowledgement', { status: 503 });
      }
      return response;
    },
  });
  await assert.rejects(
    flaky.save('project', { name: 'Committed before disconnect', code: source, glb }),
    /unavailable/,
  );
  await runtime.unsafeEvictDurableObject('native-assets', 'KilnTenant', {
    id: namespace.idFromName(owner).toString(),
  });
  const fresh = library(owner);
  const records = await fresh.list('project');
  assert.equal(records.length, 1);
  const saved = await fresh.read('project', records[0].assetId, records[0].revisionId);
  assert.deepEqual(Buffer.from(saved.files['asset.glb']), Buffer.from(glb));
  assert.deepEqual(saved.files['source.kiln.js'], new TextEncoder().encode(source));
  assert.equal((await usage(owner)).objects, 3, 'Cleanup must retain every committed file');
});

test('saved records survive unsaved expiry and integrity corruption is refused', async () => {
  const assets = library('retained');
  const saved = await assets.save('project', { name: 'Box', code: source, glb });
  const database = await runtime.unsafeGetDurableObjectStorage('native-assets', 'KilnTenant', {
    id: namespace.idFromName('retained').toString(),
  });
  await database.exec('UPDATE artifacts SET expires_at = 1');
  assert.deepEqual(
    (await assets.read('project', saved.assetId, saved.revisionId)).manifest,
    persisted(saved),
  );
  const rows = await database.exec("SELECT object_key FROM artifacts WHERE filename = 'asset.glb'");
  await (await runtime.getR2Bucket('ARTIFACTS')).put(rows[0].object_key, 'corrupt');
  await assert.rejects(
    assets.read('project', saved.assetId, saved.revisionId),
    /integrity|unavailable/,
  );
});

test('real registry tools save, list, load and export a hosted revision after fresh host construction', async () => {
  const make = () =>
    createKilnToolHost({
      programStore: new NativeProgramStore({ fetch: fetchFor('engine-assets') }),
      assetLibrary: library('engine-assets'),
      evaluatorProfile: 'trusted-local',
    });
  const invoke = async (host, name, args) => {
    const response = await host.callTool(name, args, { signal: new AbortController().signal });
    assert.notEqual(response.isError, true, JSON.stringify(response.content));
    return JSON.parse(response.content.find((item) => item.type === 'text').text);
  };
  const first = make();
  const validated = await invoke(first, 'kiln_validate', { code: `\ufeff${source}` });
  const saved = await invoke(first, 'kiln_save', {
    programRef: validated.programRef,
    name: 'Hosted Box',
    collection: 'project',
  });
  assert.ok(saved.asset.assetId);
  const second = make();
  const listed = await invoke(second, 'kiln_assets', { action: 'list', collection: 'project' });
  assert.ok(JSON.stringify(listed).includes(saved.asset.assetId));
  const loaded = await invoke(second, 'kiln_assets', {
    action: 'restore',
    collection: 'project',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  });
  assert.ok(loaded.programRef);
  assert.equal(
    loaded.programRef,
    validated.programRef,
    'Restore must retain the exact authored BOM and reference',
  );
  const exported = await invoke(second, 'kiln_export', {
    collection: 'project',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  });
  assert.ok(JSON.stringify(exported).includes('asset.glb'));
});

test('saved material closure survives export, import and offline rebuild without the original library', async () => {
  const material = await createMaterialRecordV1({
    materialId: 'hosted-plaster',
    name: 'Hosted plaster',
    tileable: true,
    sources: [
      {
        id: 'authored',
        kind: 'procedural',
        provider: 'Kiln',
        creator: 'Test author',
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
  const code = `async function build(){const r=createRoot('Root');const m=await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(material.manifest))});createPart('Body',boxGeo(1,1,1),m,{parent:r});return r;}`;
  const baked = await renderGLB(code, {
    materialResources: await createMaterialLibraryPayload([material]),
  });
  const origin = new NativeAssetLibrary({
    fetch: fetchFor('material-origin'),
    materials: { read: async () => material },
  });
  const saved = await origin.save('project', {
    name: 'Material box',
    code,
    glb: baked.glb,
    build: {
      engine: 'fixture',
      options: baked.rebuildOptions,
      warnings: [],
      dependencies: [
        { kind: 'kiln.material.v1', delivery: 'runtime', manifest: material.manifest },
      ],
      rebuild: 'external-dependencies-required',
    },
  });
  const record = await library('material-origin').read('project', saved.assetId, saved.revisionId);
  assert.deepEqual(record.materialResources.records[0].manifest, material.manifest);
  const bundle = await origin.exportBundle([record]);
  const installedMaterials = [];
  const target = new NativeAssetLibrary({
    fetch: fetchFor('material-target'),
    materials: {
      import: async (records) => {
        installedMaterials.push(...records);
        return records.map((record) => record.manifest);
      },
      read: async (id, revision) =>
        installedMaterials.find(
          (record) => record.manifest.materialId === id && record.manifest.revisionId === revision,
        ),
    },
  });
  await target.import('library', decodeAssetBundle(bundle));
  assert.equal(
    installedMaterials.length,
    1,
    'Import installs the exact material closure in an injected library',
  );
  const restored = await target.read('library', saved.assetId, saved.revisionId);
  const rebuilt = await renderGLB(code, { materialResources: restored.materialResources });
  assert.deepEqual(Buffer.from(rebuilt.glb), Buffer.from(baked.glb));
  const broken = structuredClone(record);
  broken.materialResources.records[0].files[material.manifest.maps[0].file] = 'invalid';
  const before = await usage('material-target');
  await assert.rejects(target.import('project', [broken]));
  assert.deepEqual(await usage('material-target'), before);
  const missing = structuredClone(record);
  delete missing.materialResources;
  await assert.rejects(
    library('material-missing').import('project', [missing]),
    /material unavailable/i,
  );
});
