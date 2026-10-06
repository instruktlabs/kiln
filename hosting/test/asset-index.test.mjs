import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runtime;
let namespace;
before(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/tenant-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'KilnTenant', useSQLite: true } },
      bindings: {
        STORAGE_MAX_BYTES: '4194304',
        STORAGE_MAX_OBJECTS: '256',
        STORAGE_MAX_GROUPS: '128',
      },
      outboundService: async () => {
        throw new Error('No external requests');
      },
    }),
  );
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
});
after(async () => runtime?.dispose());
const call = (owner, path, init) =>
  namespace.get(namespace.idFromName(owner)).fetch(`https://tenant.internal${path}`, init);
const post = (owner, path, body) =>
  call(owner, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
async function files(owner) {
  const result = {};
  for (const [name, media] of [
    ['asset.glb', 'model/gltf-binary'],
    ['manifest.json', 'application/json'],
  ]) {
    const bytes = Buffer.from(name);
    const response = await call(owner, '/internal/artifacts', {
      method: 'POST',
      body: bytes,
      headers: {
        'content-type': media,
        'content-length': String(bytes.length),
        'x-artifact-name': name,
        'x-artifact-sha256': createHash('sha256').update(bytes).digest('hex'),
      },
    });
    assert.equal(response.status, 201);
    result[name] = (await response.json()).id;
  }
  return result;
}
const commit = (owner, input) =>
  post(owner, '/internal/assets/commit', {
    collection: 'project',
    assetId: 'post',
    revisionId: 'r_one',
    mode: 'save',
    ...input,
  });
const lookup = (owner, collection, asset, revision) =>
  call(owner, `/internal/assets/${collection}/${asset}/${revision}`);

test('saved asset index binds exact files to collection and revision and denies other tenants', async () => {
  const inventory = await files('index');
  const saved = await commit('index', { files: inventory });
  assert.equal(saved.status, 201);
  const group = await saved.json();
  assert.equal(group.key, 'assets/project/post/r_one');
  assert.deepEqual(group.files, inventory);
  assert.deepEqual(
    (await (await lookup('index', 'project', 'post', 'r_one')).json()).files,
    inventory,
  );
  assert.equal((await lookup('other', 'project', 'post', 'r_one')).status, 404);
  assert.equal((await lookup('index', 'library', 'post', 'r_one')).status, 404);
  assert.equal((await commit('other', { files: inventory })).status, 404);
  assert.equal((await commit('index', { files: inventory })).status, 200);
});

test('new-asset creation and parent checks are atomic across concurrent saves', async () => {
  const inventory = await files('parents');
  const results = await Promise.all(
    ['r_a', 'r_b'].map((revisionId) => commit('parents', { files: inventory, revisionId })),
  );
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
  const accepted = await results.find((response) => response.status === 201).json();
  const parentRevision = accepted.key.split('/').at(-1);
  assert.equal(
    (await commit('parents', { files: inventory, revisionId: 'r_child', parentRevision })).status,
    201,
  );
  assert.equal(
    (
      await commit('parents', {
        files: inventory,
        revisionId: 'r_missing',
        parentRevision: 'r_unknown',
      })
    ).status,
    404,
  );
  assert.equal(
    (await commit('parents', { files: inventory, assetId: 'other', parentRevision })).status,
    404,
  );
  const changed = await files('parents');
  assert.equal(
    (await commit('parents', { files: changed, revisionId: 'r_child', parentRevision })).status,
    409,
  );
});

test('asset catalogue pages have stable bounded cursors and independent collection scope', async () => {
  const inventory = await files('pages');
  for (let i = 0; i < 35; i++) {
    const response = await commit('pages', {
      files: inventory,
      mode: 'import',
      assetId: `a_${String(i).padStart(2, '0')}`,
    });
    assert.equal(response.status, 201);
  }
  assert.equal((await commit('pages', { files: inventory, collection: 'library' })).status, 201);
  const page = async (input) => {
    const response = await post('pages', '/internal/assets/list', {
      collection: 'project',
      ...input,
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await page({});
  assert.equal(first.records.length, 32);
  assert.equal(first.next, first.records.at(-1).key);
  const second = await page({ after: first.next });
  assert.equal(second.records.length, 3);
  assert.equal(second.next, null);
  assert.equal(new Set([...first.records, ...second.records].map((record) => record.key)).size, 35);
  assert.equal(
    (
      await post('pages', '/internal/assets/list', {
        collection: 'project',
        after: 'assets/library/post/r_one',
      })
    ).status,
    400,
  );
});

test('asset commits require safe identities and matching filenames and never pin an invalid inventory', async () => {
  const inventory = await files('invalid');
  for (const bad of [
    { collection: 'elsewhere' },
    { assetId: 'x/y' },
    { revisionId: 'r_a\n' },
    { files: { 'asset.glb': inventory['manifest.json'], 'manifest.json': inventory['asset.glb'] } },
    { files: { 'asset.glb': inventory['asset.glb'] } },
    { parentRevision: 'r_one' },
    { mode: 'unknown' },
  ]) {
    assert.equal((await commit('invalid', { files: inventory, ...bad })).status, 400);
  }
  assert.equal((await (await call('invalid', '/internal/usage')).json()).groups, 0);
});
