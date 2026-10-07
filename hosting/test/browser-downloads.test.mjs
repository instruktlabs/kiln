import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateAccounts } from './database.mjs';
import { mkdir } from 'node:fs/promises';
import { createKilnMcpServer } from '../../dist/mcp-engine.mjs';
import { renderGLB } from '../../lib/render.js';

const origin = 'https://kiln.example.com';
let runtime, namespace, database, createNativeMcpHandler;
const digest = (s) => createHash('sha256').update(s).digest('hex');
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./browser-download-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd'],
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: 'browser-downloads',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      compatibilityFlags: ['global_fetch_strictly_public'],
      kvNamespaces: ['OAUTH_KV'],
      d1Databases: ['ACCOUNTS'],
      durableObjects: { TENANTS: { className: 'DownloadTenant', useSQLite: true } },
      r2Buckets: ['ARTIFACTS'],
      bindings: {
        PUBLIC_ORIGIN: origin,
        STORAGE_MAX_BYTES: '1048576',
        STORAGE_MAX_OBJECTS: '32',
        STORAGE_MAX_GROUPS: '8',
      },
      outboundService: async () => {
        throw Error('No network or compute permitted');
      },
    }),
  );
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
  database = await runtime.getD1Database('ACCOUNTS');
  await migrateAccounts(database);
  const output = new URL('../../.cache/browser-download-test/native-mcp.mjs', import.meta.url);
  await mkdir(fileURLToPath(new URL('./', output)), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-mcp.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    alias: Object.fromEntries(
      [
        ['assets', 'assets'],
        ['assets/node', 'assets-node'],
        ['material-library/node', 'material-library-node'],
        ['material-library', 'material-library'],
        ['workspace', 'workspace'],
        ['evaluator', 'evaluator/index'],
        ['composer', 'composer/index'],
      ].map(([name, path]) => [
        `@instruktlabs/kiln/${name}`,
        fileURLToPath(new URL(`../../lib/${path}.js`, import.meta.url)),
      ]),
    ),
  });
  ({ createNativeMcpHandler } = await import(output));
});
after(async () => runtime?.dispose());
const selector = { collection: 'project', assetId: 'a_box', revisionId: 'r_one' };
async function session(subject) {
  const response = await runtime.dispatchFetch(`${origin}/fixture/session`, {
    method: 'POST',
    body: JSON.stringify({ subject }),
  });
  assert.equal(response.status, 200);
  const { accountId } = await response.json();
  const tenant = createHash('sha256')
    .update(JSON.stringify(['kiln-tenant-v1', origin, accountId]))
    .digest('base64url');
  const stub = namespace.getByName(tenant);
  return { accountId, cookie: response.headers.get('set-cookie').split(';')[0], stub };
}
async function seed(user) {
  const files = {};
  for (const [name, data] of [
    ['asset.glb', 'glTFfixture'],
    ['source.kiln.js', 'function build(){}'],
    ['manifest.json', '{}'],
  ]) {
    const response = await user.stub.fetch('https://tenant.internal/internal/artifacts', {
      method: 'POST',
      body: data,
      headers: {
        'content-type':
          name === 'asset.glb'
            ? 'model/gltf-binary'
            : name.endsWith('.js')
              ? 'application/javascript'
              : 'application/json',
        'x-artifact-name': name,
        'x-artifact-sha256': digest(data),
        'content-length': String(Buffer.byteLength(data)),
      },
    });
    assert.equal(response.status, 201);
    files[name] = (await response.json()).id;
  }
  const commit = await user.stub.fetch('https://tenant.internal/internal/assets/commit', {
    method: 'POST',
    body: JSON.stringify({ ...selector, files, mode: 'save' }),
  });
  assert.equal(commit.status, 201);
  const group = await commit.json();
  const response = await user.stub.fetch('https://tenant.internal/internal/downloads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(selector),
  });
  assert.equal(response.status, 201);
  const ticket = await response.json();
  return { path: `/downloads/${ticket.ticket}/asset.glb`, group };
}
const get = (path, cookie = '', extra = {}) =>
  runtime.dispatchFetch(`${origin}${path}`, {
    redirect: 'manual',
    ...extra,
    headers: {
      cookie,
      ...extra.headers,
      ...(extra.headers?.['sec-fetch-mode']
        ? { 'x-fixture-fetch-mode': extra.headers['sec-fetch-mode'] }
        : {}),
    },
  });

test('saved bytes require the current owning browser account, with no compute or credential forwarding', async () => {
  const alice = await session('2101'),
    bob = await session('2102');
  const { path } = await seed(alice);
  const anonymous = await get(path);
  assert.equal(anonymous.status, 401);
  assert.match(
    await anonymous.text(),
    new RegExp(`name="returnTo" value="${path.replaceAll('.', '\\.')}"`),
  );
  assert.match(anonymous.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await get(path, bob.cookie)).status, 404);
  assert.equal(
    (
      await get(path, '', {
        headers: { authorization: 'Bearer fixture', 'x-tenant': alice.accountId },
      })
    ).status,
    401,
  );
  const response = await get(path, alice.cookie, {
    headers: { authorization: 'Bearer fixture', 'x-tenant': bob.accountId },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'glTFfixture');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-disposition'), /attachment; filename="asset.glb"/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const headers = await (await alice.stub.fetch('https://tenant.internal/fixture/headers')).json();
  for (const key of ['authorization', 'cookie', 'x-tenant', 'range'])
    assert.equal(headers[key], undefined);
  const head = await get(path, alice.cookie, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), String('glTFfixture'.length));
});

test('download navigation accepts ordinary external links but denies cross-origin embedding and hostile routes', async () => {
  const alice = await session('2103');
  const { path } = await seed(alice);
  const navigate = await get(path, alice.cookie, {
    headers: {
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
    },
  });
  assert.equal(navigate.status, 200);
  await navigate.arrayBuffer();
  for (const headers of [
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' },
    { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
  ])
    assert.equal((await get(path, alice.cookie, { headers })).status, 403);
  assert.equal((await get(path, alice.cookie, { method: 'POST', body: '{}' })).status, 405);
  for (const bad of [
    `${path}?tenant=other`,
    `${path}/extra`,
    path.replace('asset.glb', '%61sset.glb'),
    path.replace('asset.glb', 'secret.txt'),
    path.replace('asset.glb', 'asset.glb%0a'),
  ])
    assert.ok([400, 404].includes((await get(bad, alice.cookie)).status), bad);
  assert.equal((await get(path, '', { method: 'HEAD' })).status, 401);
});

test('browser revocation while storage is being read suppresses bytes, and deleting a saved revision revokes its links', async () => {
  const alice = await session('2104');
  const { path, group } = await seed(alice);
  await alice.stub.fetch('https://tenant.internal/fixture/revoke');
  const revoked = await get(path, alice.cookie);
  assert.equal(revoked.status, 401);
  assert.ok(!(await revoked.text()).includes('glTFfixture'));
  assert.equal((await get(path, alice.cookie)).status, 401);
  const fresh = await session('2104');
  const removed = await alice.stub.fetch(`https://tenant.internal/internal/groups/${group.id}`, {
    method: 'DELETE',
  });
  assert.equal(removed.status, 200);
  // The fixture revokes on every read; storage independently reports 404 first.
  const direct = await alice.stub.fetch(`https://tenant.internal/internal${path}`);
  assert.equal(direct.status, 404);
  assert.ok(fresh.cookie);
});

test('real MCP save and reopen links deliver exact bytes through the actual authenticated browser gateway', async () => {
  const alice = await session('2105'),
    bob = await session('2106');
  const code =
    "function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#aaaaaa'),{parent:r});return r;}";
  const host = () =>
    createNativeMcpHandler(
      {
        createServer: createKilnMcpServer,
        evaluatorPort: {
          render: async (source, options) => {
            assert.equal(source, code);
            return renderGLB(source, options);
          },
        },
      },
      {
        publicOrigin: origin,
        storage: {
          fetch: (request) =>
            alice.stub.fetch(
              new Request(`https://tenant.internal${new URL(request.url).pathname}`, request),
            ),
        },
      },
    );
  const call = async (name, args) => {
    const handler = host();
    try {
      const response = await handler.fetch(
        new Request('http://kiln-native.internal/mcp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2025-11-25',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        }),
      );
      assert.equal(response.status, 200);
      const raw = await response.text();
      const result = response.headers.get('content-type')?.includes('text/event-stream')
        ? raw
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => JSON.parse(line.slice(5)))
            .findLast((event) => event.id === 1)
        : JSON.parse(raw);
      assert.equal(result.error, undefined);
      assert.notEqual(result.result.isError, true, JSON.stringify(result));
      return JSON.parse(result.result.content.find((item) => item.type === 'text').text);
    } finally {
      await handler.close();
    }
  };
  const rendered = await call('kiln_render', { code, capture: { preset: '1x1' } });
  const saved = await call('kiln_save', {
    programRef: rendered.programRef,
    collection: 'project',
    name: 'Browser delivery box',
  });
  const request = {
    collection: 'project',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  };
  const reopened = await call('kiln_assets', { ...request, action: 'get' });
  assert.notEqual(saved.downloadUrls['asset.glb'], reopened.downloadUrls['asset.glb']);
  for (const name of ['asset.glb', 'source.kiln.js', 'manifest.json', 'preview.png']) {
    const path = new URL(reopened.downloadUrls[name]).pathname;
    assert.equal((await get(path, bob.cookie)).status, 404);
    const response = await get(path, alice.cookie);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (name === 'source.kiln.js') assert.equal(bytes.toString(), code);
    if (name === 'manifest.json') assert.equal(JSON.parse(bytes).revisionId, request.revisionId);
    if (name === 'asset.glb') {
      assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
      assert.equal(`sha256:${digest(bytes)}`, reopened.asset.files[name].sha256);
    }
    if (name === 'preview.png')
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
});
