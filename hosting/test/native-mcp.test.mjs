import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { createKilnMcpServer, kilnMcpToolDefs } from '../../dist/mcp-engine.mjs';
import { renderGLB } from '../../lib/render.js';
import { evaluateEvaluatorRequestV2 } from '../../lib/evaluator/index.js';
import { encodePng } from '../../lib/views/png.js';

const publicOrigin = 'https://kiln.example.com';
const source =
  "function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#aaaaaa'),{parent:r});return r;}";
let createNativeMcpHandler;
let loadNativeMcpRuntime;
let loadContainerMcpRuntime;
let createNativeEvaluatorPort;
let runtime;
let namespace;
let runIntegratedOnce, integratedSource;
let runLifecycleOnce, lifecycleCases, lifecycleBudget;
let routeEdgeMcp;
const handlers = [];
before(async () => {
  const outfile = fileURLToPath(
    new URL('../../.cache/hosted-mcp-test/native-mcp.mjs', import.meta.url),
  );
  await mkdir(fileURLToPath(new URL('../../.cache/hosted-mcp-test/', import.meta.url)), {
    recursive: true,
  });
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-mcp.ts', import.meta.url))],
    outfile,
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
      ].map(([name, file]) => [
        `@instruktlabs/kiln/${name}`,
        fileURLToPath(new URL(`../../lib/${file}.js`, import.meta.url)),
      ]),
    ),
  });
  ({ createNativeMcpHandler, loadNativeMcpRuntime, loadContainerMcpRuntime } = await import(
    new URL('../../.cache/hosted-mcp-test/native-mcp.mjs', import.meta.url)
  ));
  const evaluatorOutput = new URL(
    '../../.cache/hosted-mcp-test/native-evaluator.mjs',
    import.meta.url,
  );
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-evaluator.ts', import.meta.url))],
    outfile: fileURLToPath(evaluatorOutput),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    alias: {
      '@instruktlabs/kiln/evaluator': fileURLToPath(
        new URL('../../lib/evaluator/index.js', import.meta.url),
      ),
    },
  });
  ({ createNativeEvaluatorPort } = await import(evaluatorOutput));
  const worker = await build({
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
  );
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
  const trial = new URL('../../.cache/hosted-mcp-test/integrated-run.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../probe/integrated-run.ts', import.meta.url))],
    outfile: fileURLToPath(trial),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ runIntegratedOnce, integratedSource } = await import(trial));
  const lifecycle = new URL('../../.cache/hosted-mcp-test/lifecycle-run.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../probe/lifecycle-run.ts', import.meta.url))],
    outfile: fileURLToPath(lifecycle),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ runLifecycleOnce, lifecycleCases, lifecycleBudget } = await import(lifecycle));
  const edge = new URL('../../.cache/hosted-mcp-test/edge.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/edge-mcp.ts', import.meta.url))],
    outfile: fileURLToPath(edge),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ routeEdgeMcp } = await import(edge));
});
after(async () => {
  for (const handler of handlers) await handler.close();
  await runtime?.dispose();
});

function host(
  owner,
  options = {},
  evaluator = {
    render: async (code, renderOptions) => {
      // Explicit fixed trusted fixture only; this port is never in a production bundle.
      assert.equal(code, source);
      return renderGLB(code, renderOptions);
    },
  },
  viewRenderPort,
) {
  const handler = createNativeMcpHandler(
    { createServer: createKilnMcpServer, evaluatorPort: evaluator, viewRenderPort },
    {
      publicOrigin,
      storage: {
        fetch: async (request) => {
          assert.equal(new URL(request.url).origin, 'http://kiln-storage.internal');
          assert.equal(request.headers.get('authorization'), null);
          return namespace
            .get(namespace.idFromName(owner))
            .fetch(new Request(`https://tenant.internal${new URL(request.url).pathname}`, request));
        },
      },
      ...options,
    },
  );
  handlers.push(handler);
  return handler;
}
function request(method, params = {}, { modern = true, headers = {}, signal, id = 1 } = {}) {
  const meta = modern
    ? {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'hosted-fixture', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      }
    : {};
  return new Request('http://kiln-native.internal/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(modern
        ? {
            'mcp-protocol-version': '2026-07-28',
            'mcp-method': method,
            ...(params.name || params.uri ? { 'mcp-name': params.name ?? params.uri } : {}),
          }
        : { 'mcp-protocol-version': '2025-11-25' }),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, ...meta } }),
    signal,
  });
}
async function message(response) {
  const body = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const events = body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)));
    return events.findLast((event) => event.id !== undefined);
  }
  return JSON.parse(body);
}
async function rpc(handler, method, params, options) {
  const response = await handler.fetch(request(method, params, options));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const value = await message(response);
  assert.equal(value.error, undefined, JSON.stringify(value.error));
  return value.result;
}
async function tool(handler, name, args, options) {
  const value = await rpc(handler, 'tools/call', { name, arguments: args }, options);
  assert.notEqual(value.isError, true, JSON.stringify(value.content));
  return JSON.parse(value.content.find((item) => item.type === 'text').text);
}

test('HTTP serves both protocol eras and exactly the engine registry surface', async () => {
  const handler = host('protocol');
  const expected = kilnMcpToolDefs({
    programStore: {},
    assetLibrary: {},
    materialLibrary: {},
    workspace: {},
  })
    .map((def) => def.name)
    .sort();
  const current = await rpc(handler, 'tools/list');
  assert.deepEqual(current.tools.map((item) => item.name).sort(), expected);
  const manifest = JSON.parse(
    await readFile(new URL('../src/generated/edge-manifest.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(current.tools, manifest.tools);
  for (const [method, key] of [
    ['resources/list', 'resources'],
    ['resources/templates/list', 'resourceTemplates'],
  ]) {
    assert.deepEqual((await rpc(handler, method))[key], manifest[key]);
  }
  assert.equal(current.resultType, 'complete');
  for (const version of ['2025-03-26', '2025-06-18', '2025-11-25']) {
    const initialized = await rpc(
      handler,
      'initialize',
      { protocolVersion: version, capabilities: {}, clientInfo: { name: 'legacy', version: '1' } },
      { modern: false },
    );
    assert.equal(initialized.protocolVersion, version);
    assert.equal(initialized.instructions, manifest.instructions);
    assert.deepEqual(initialized.serverInfo, manifest.serverInfo);
    assert.deepEqual(initialized.capabilities, manifest.capabilities);
    const legacy = await rpc(
      handler,
      'tools/list',
      {},
      { modern: false, headers: { 'mcp-protocol-version': version } },
    );
    assert.deepEqual(legacy.tools.map((item) => item.name).sort(), expected);
  }
  const mismatch = await handler.fetch(
    request('tools/list', {}, { headers: { 'mcp-method': 'tools/call' } }),
  );
  assert.equal(mismatch.status, 400);
  assert.ok((await message(mismatch)).error);
});

test('real HTTP tools validate, render, save, restore and read exact source after reconnect', async () => {
  let evaluations = 0;
  const port = createNativeEvaluatorPort({
    fetch: async (request) => {
      assert.equal(request.url, 'http://kiln-evaluator.internal/evaluate');
      assert.equal(request.headers.get('authorization'), null);
      const json = await request.text();
      // Fixed trusted fixture only. Actual VM dispatch and cleanup require provider qualification.
      assert.equal(JSON.parse(json).code, source);
      evaluations++;
      return new Response(await evaluateEvaluatorRequestV2(json), {
        headers: { 'x-kiln-execution-image': `sha256:${'a'.repeat(64)}` },
      });
    },
  });
  const first = host('lifecycle', {}, port);
  const validated = await tool(first, 'kiln_validate', { code: source });
  const rendered = await rpc(first, 'tools/call', {
    name: 'kiln_render',
    arguments: { programRef: validated.programRef, capture: { preset: '1x1' } },
  });
  assert.equal(rendered.isError, undefined);
  assert.ok(rendered.content.some((item) => item.type === 'image'));
  assert.ok(evaluations > 0, 'Real MCP render must cross the versioned private transport');
  const saved = await tool(first, 'kiln_save', {
    programRef: validated.programRef,
    collection: 'project',
    name: 'HTTP box',
  });
  assert.equal(saved.asset.build.engine, `cloudflare-container:sha256:${'a'.repeat(64)}`);
  assert.match(
    saved.downloadUrls['asset.glb'],
    /^https:\/\/kiln\.example\.com\/downloads\/[a-f0-9]{64}\/asset\.glb$/,
  );
  const link = new URL(saved.downloadUrls['source.kiln.js']);
  const browserBytes = await namespace
    .getByName('lifecycle')
    .fetch(`https://tenant.internal/internal${link.pathname}`);
  assert.equal(await browserBytes.text(), source);
  await first.close();
  const second = host('lifecycle');
  const restored = await tool(second, 'kiln_assets', {
    action: 'restore',
    collection: 'project',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  });
  assert.equal(restored.programRef, validated.programRef);
  const uri = `kiln://assets/project/${saved.asset.assetId}/${saved.asset.revisionId}/source.kiln.js`;
  assert.equal((await rpc(second, 'resources/read', { uri })).contents[0].text, source);
  const savedManifest = JSON.parse(
    (
      await rpc(second, 'resources/read', {
        uri: uri.replace('source.kiln.js', 'manifest.json'),
      })
    ).contents[0].text,
  );
  assert.equal(savedManifest.build.engine, `cloudflare-container:sha256:${'a'.repeat(64)}`);
  const other = await rpc(host('other'), 'tools/call', {
    name: 'kiln_source',
    arguments: { programRef: restored.programRef },
  });
  assert.equal(other.isError, true);
  assert.ok(!JSON.stringify(other).includes(source));
});

test('render, save, restore and export work with a fresh native host for every MCP request', async () => {
  const owner = 'one-request-per-vm';
  const call = async (name, args) => {
    const handler = host(owner);
    try {
      return await tool(handler, name, args);
    } finally {
      await handler.close();
    }
  };
  const rendered = await call('kiln_render', { code: source, capture: { preset: '1x1' } });
  const saved = await call('kiln_save', {
    programRef: rendered.programRef,
    collection: 'project',
    name: 'Fresh host fixture',
  });
  const restored = await call('kiln_assets', {
    action: 'restore',
    collection: 'project',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  });
  assert.equal(restored.programRef, rendered.programRef);
  const original = await call('kiln_source', { programRef: restored.programRef });
  assert(JSON.stringify(original).includes('createRoot'));
  const exported = await call('kiln_export', {
    collection: 'project',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  });
  assert(exported);
});

test('durable materials bind exact revisions across fresh MCP hosts, save their closure and deny foreign accounts', async () => {
  const owner = 'material-lifecycle';
  let evaluations = 0,
    expectedSource;
  const port = createNativeEvaluatorPort({
    fetch: async (request) => {
      const json = await request.text();
      const input = JSON.parse(json);
      assert.equal(input.code, expectedSource);
      assert.equal(input.options.materialResources.records.length, 1);
      evaluations++;
      return new Response(await evaluateEvaluatorRequestV2(json), {
        headers: { 'x-kiln-execution-image': `sha256:${'b'.repeat(64)}` },
      });
    },
  });
  const call = async (name, args, account = owner, raw = false) => {
    const handler = host(account, {}, port);
    try {
      return raw
        ? await rpc(handler, 'tools/call', { name, arguments: args })
        : await tool(handler, name, args);
    } finally {
      await handler.close();
    }
  };
  const created = await call('kiln_material', {
    action: 'create-procedural',
    draft: {
      materialId: 'mcp-stone',
      name: 'MCP stone',
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
    },
  });
  const { material, portableSpec } = created;
  const { materialId, revisionId } = material;
  assert.equal(
    (await call('kiln_material', { action: 'list' })).materials[0].revisionId,
    revisionId,
  );
  assert.deepEqual(
    (await call('kiln_material', { action: 'get', materialId, revisionId })).material,
    material,
  );
  const materialDependencies = [{ resourceId: materialId, revisionId, sha256: revisionId }];
  expectedSource = `async function build(){const r=createRoot('Root');const m=await compilePortableMaterialSpecV2(${JSON.stringify(portableSpec)});createPart('Body',boxGeo(1,1,1),m,{parent:r});return r;}`;
  const rendered = await call('kiln_render', {
    code: expectedSource,
    materialDependencies,
    capture: { preset: '1x1' },
  });
  const saved = await call('kiln_save', {
    programRef: rendered.programRef,
    materialDependencies,
    collection: 'project',
    name: 'Material box',
  });
  assert.ok(saved.downloadUrls['materials.kiln.json']);
  const path = new URL(saved.downloadUrls['materials.kiln.json']).pathname;
  const closure = await (
    await namespace.getByName(owner).fetch(`https://tenant.internal/internal${path}`)
  ).json();
  assert.deepEqual(closure.records[0].manifest, material);
  const exportResult = await call('kiln_export', {
    collection: 'project',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  });
  assert(exportResult);
  const before = evaluations;
  const foreign = await call(
    'kiln_render',
    { code: expectedSource, materialDependencies, capture: { preset: '1x1' } },
    'material-foreign',
    true,
  );
  assert.equal(foreign.isError, true);
  assert.match(JSON.stringify(foreign), /Locked material unavailable/);
  assert.equal(evaluations, before, 'Foreign material denial occurs before native evaluation');
  assert.deepEqual(
    (await call('kiln_material', { action: 'list' }, 'material-foreign')).materials,
    [],
  );
  // A saved asset's editable closure is independent of the live material library.
  const tenant = namespace.getByName(owner);
  const indexed = await (
    await tenant.fetch(
      `https://tenant.internal/internal/materials/${materialId}/${revisionId.slice(7)}`,
    )
  ).json();
  assert.equal(
    (
      await tenant.fetch(`https://tenant.internal/internal/groups/${indexed.id}`, {
        method: 'DELETE',
      })
    ).status,
    200,
  );
  assert.deepEqual((await call('kiln_material', { action: 'list' })).materials, []);
  const imported = await call('kiln_import', {
    sourceCollection: 'project',
    collection: 'library',
    assetId: saved.asset.assetId,
    revisionId: saved.asset.revisionId,
  });
  assert.deepEqual(
    (await call('kiln_material', { action: 'get', materialId, revisionId })).material,
    material,
  );
  const originalGlb = await (
    await tenant.fetch(
      `https://tenant.internal/internal${new URL(saved.downloadUrls['asset.glb']).pathname}`,
    )
  ).arrayBuffer();
  const importedGlb = await (
    await tenant.fetch(
      `https://tenant.internal/internal${new URL(imported.downloadUrls['asset.glb']).pathname}`,
    )
  ).arrayBuffer();
  assert.deepEqual(Buffer.from(importedGlb), Buffer.from(originalGlb));
  const rebuilt = await call('kiln_render', {
    programRef: rendered.programRef,
    materialDependencies,
    capture: { preset: '1x1' },
  });
  assert.equal(rebuilt.programRef, rendered.programRef);
});

test('the complete fixed provider sequence matches real fresh-host MCP and private asset contracts', async () => {
  const values = new Map();
  let count = 0,
    paused = false;
  const store = {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => values.set(key, structuredClone(value)),
    transaction: async (fn) => fn(store),
  };
  const receipts = [];
  const result = await runIntegratedOnce(store, {
    open: async () => {},
    close: async () => {},
    pause: async () => {
      paused = true;
    },
    status: async () => ({ paused, activeRequests: 0, pendingCleanup: 0, maxConcurrent: 1 }),
    retain: async (name, bytes) => {
      receipts.push({ name, bytes });
    },
    dispatch: async (owner, request) => {
      if (++count > 9) return new Response('quota', { status: 429 });
      const handler = host(
        owner,
        {},
        {
          render: async (code, options) => {
            assert.equal(code, integratedSource);
            return renderGLB(code, options);
          },
        },
        async (request) => {
          const size = request.size ?? request.width;
          return {
            ok: true,
            rendererId: 'dawn-vulkan:software-fixture',
            viewsPng: (request.viewDirs ?? request.cameras).map(() =>
              encodePng(new Uint8Array(size * size * 3).fill(128), size, size),
            ),
            derivativeFidelity: {
              materialFaithful: true,
              inputGlbSha256: `sha256:${createHash('sha256').update(request.glb).digest('hex')}`,
            },
          };
        },
      );
      const response = await handler.fetch(new Request('http://kiln-native.internal/mcp', request));
      const bytes = await response.arrayBuffer();
      await handler.close();
      return new Response(bytes, { status: response.status, headers: response.headers });
    },
  });
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.results.length, 10);
  assert.equal(receipts.length, 10);
});

test('private lifecycle trial qualifies fresh hosts, editable materials, exact downloads and pinned provenance', async () => {
  const values = new Map();
  const store = {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => values.set(key, structuredClone(value)),
    transaction: async (fn) => fn(store),
  };
  const fixtureOrigin = 'https://kiln-private-qualification.invalid';
  const expectedImage = `sha256:${'b'.repeat(64)}`;
  let calls = 0,
    evaluations = 0,
    renders = 0,
    paused = true,
    opened = 0,
    closed = 0;
  const evidence = [];
  const ownerName = (account) => `full-lifecycle-${account}`;
  const evaluator = createNativeEvaluatorPort({
    fetch: async (request) => {
      const json = await request.text();
      const input = JSON.parse(json);
      assert.equal(input.options.materialResources.records.length, 1);
      assert.equal(
        input.options.materialResources.records[0].manifest.materialId,
        'qualification-stone',
      );
      evaluations++;
      return new Response(await evaluateEvaluatorRequestV2(json), {
        headers: { 'x-kiln-execution-image': expectedImage },
      });
    },
  });
  const ports = {
    expectedImage,
    open: async () => {
      opened++;
      paused = false;
    },
    close: async () => {
      closed++;
    },
    pause: async () => {
      paused = true;
    },
    status: async () => ({ paused, activeRequests: 0, pendingCleanup: 0 }),
    retain: async (name, bytes) => {
      evidence.push({ name, bytes: Buffer.from(bytes) });
    },
    mcp: async (account, request) => {
      assert.equal(request.headers.get('authorization'), null);
      assert.equal(request.headers.get('cookie'), null);
      const routed = await routeEdgeMcp(request);
      if (routed instanceof Response) return routed;
      if (++calls > lifecycleBudget.coordinator) return new Response('quota', { status: 429 });
      const handler = host(
        ownerName(account),
        { publicOrigin: fixtureOrigin },
        evaluator,
        async (input) => {
          renders++;
          const size = input.size ?? input.width;
          return {
            ok: true,
            rendererId: 'dawn-vulkan:software-fixture',
            viewsPng: (input.viewDirs ?? input.cameras).map(() =>
              encodePng(new Uint8Array(size * size * 3).fill(128), size, size),
            ),
            derivativeFidelity: {
              materialFaithful: true,
              inputGlbSha256: `sha256:${createHash('sha256').update(input.glb).digest('hex')}`,
            },
          };
        },
      );
      const response = await handler.fetch(new Request('http://kiln-native.internal/mcp', routed));
      const bytes = await response.arrayBuffer();
      await handler.close();
      return new Response(bytes, { status: response.status, headers: response.headers });
    },
    download: async (account, path, signal) => {
      if (account === 'anonymous') return new Response(null, { status: 401 });
      return namespace
        .getByName(ownerName(account))
        .fetch(`https://tenant.internal/internal${path}`, { signal });
    },
    dropMaterial: async (materialId, revisionId) => {
      const tenant = namespace.getByName(ownerName('owner'));
      const group = await (
        await tenant.fetch(
          `https://tenant.internal/internal/materials/${materialId}/${revisionId.slice(7)}`,
        )
      ).json();
      assert.equal(
        (
          await tenant.fetch(`https://tenant.internal/internal/groups/${group.id}`, {
            method: 'DELETE',
          })
        ).status,
        200,
      );
    },
  };
  const result = await runLifecycleOnce(store, ports);
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.results.length, 21);
  assert.deepEqual(
    result.results.map((value) => value.name),
    lifecycleCases,
  );
  assert.equal(calls, 15);
  assert.equal(evaluations, 3);
  assert.equal(renders, 3);
  assert.equal(opened, 1);
  assert.equal(closed, 1);
  assert.equal(paused, true);
  assert.equal(
    result.results.find((value) => value.name === 'manifest').savedEngine,
    `cloudflare-container:${expectedImage}`,
  );
  assert.equal(evidence.length, 20);
  assert.deepEqual(await runLifecycleOnce(store, ports), result);
  assert.equal(calls, 15);
  assert.equal(opened, 1);
  assert.equal(closed, 1);
  // Reuse actual engine responses to attack the trial's acceptance checks.
  const recorded = new Map(evidence.map((item) => [item.name, item.bytes]));
  const sourceMessage = JSON.parse(recorded.get('source').toString());
  const source = JSON.parse(
    sourceMessage.result.content.find((item) => item.type === 'text').text,
  ).code;
  const attacks = [
    ['foreign-download', () => Buffer.from(source)],
    ['anonymous-download', () => Buffer.from(source)],
    [
      'manifest',
      (bytes) => {
        const message = JSON.parse(bytes.toString());
        const manifest = JSON.parse(message.result.contents[0].text);
        manifest.build.engine = 'unverified';
        message.result.contents[0].text = JSON.stringify(manifest);
        return Buffer.from(JSON.stringify(message));
      },
    ],
    [
      'glb-download',
      (bytes) => {
        const changed = Buffer.from(bytes);
        changed[changed.length - 1] ^= 1;
        return changed;
      },
    ],
    [
      'foreign-source',
      (bytes) => {
        const message = JSON.parse(bytes.toString());
        message.debug = { source };
        return Buffer.from(JSON.stringify(message));
      },
    ],
    [
      'foreign-source',
      (bytes) => {
        const message = JSON.parse(bytes.toString());
        message.debug = { text: JSON.stringify({ code: source }) };
        return Buffer.from(JSON.stringify(message));
      },
    ],
    [
      'foreign-material',
      (bytes) => {
        const message = JSON.parse(bytes.toString());
        const materialMessage = JSON.parse(recorded.get('material-get').toString());
        message.debug = JSON.parse(
          materialMessage.result.content.find((item) => item.type === 'text').text,
        ).material;
        return Buffer.from(JSON.stringify(message));
      },
    ],
  ];
  for (const [failedCase, mutate] of attacks) {
    let index = 0,
      sealed = false,
      halted = false;
    const replayStoreValues = new Map();
    const replayStore = {
      get: async (key) => structuredClone(replayStoreValues.get(key)),
      put: async (key, value) => {
        replayStoreValues.set(key, structuredClone(value));
      },
      transaction: async (fn) => fn(replayStore),
    };
    const response = () => {
      const name = lifecycleCases[index++];
      const original = recorded.get(name);
      assert(original, name);
      const bytes = name === failedCase ? mutate(original) : original;
      return new Response(bytes, {
        status: result.results.find((item) => item.name === name).status,
        headers: { 'cache-control': 'no-store' },
      });
    };
    const failed = await runLifecycleOnce(replayStore, {
      expectedImage,
      open: async () => {},
      close: async () => {
        sealed = true;
      },
      pause: async () => {
        halted = true;
      },
      status: async () => ({ paused: halted, activeRequests: 0, pendingCleanup: 0 }),
      mcp: async () => response(),
      download: async () => response(),
      retain: async () => {},
      dropMaterial: async () => {
        index++;
      },
    });
    assert.equal(failed.passed, false, failedCase);
    assert.equal(failed.results.at(-1).name, failedCase);
    assert.equal(failed.results.at(-1).passed, false);
    assert.equal(index, lifecycleCases.indexOf(failedCase) + 1);
    assert.equal(sealed && halted, true);
  }
});

test('native MCP uses the material-view port and retains truthful CPU fallback', async () => {
  const metal =
    'function build(){return new THREE.Mesh(boxGeo(1,1,1),pbrMaterial({albedo:0x8899aa,metalness:0.5,roughness:0.5}));}';
  let views = 0;
  const evaluate = {
    render: async (code, options) => {
      assert.equal(code, metal);
      return renderGLB(code, options);
    },
  };
  const handler = host('material', {}, evaluate, async (request, execution) => {
    views++;
    assert(execution.signal);
    assert.equal(execution.signal.aborted, false);
    const size = request.size ?? request.width;
    return {
      ok: true,
      rendererId: 'dawn-vulkan:software-fixture',
      viewsPng: (request.viewDirs ?? request.cameras).map(() =>
        encodePng(new Uint8Array(size * size * 3).fill(128), size, size),
      ),
      derivativeFidelity: {
        materialFaithful: true,
        inputGlbSha256: `sha256:${createHash('sha256').update(request.glb).digest('hex')}`,
      },
    };
  });
  const result = await rpc(handler, 'tools/call', {
    name: 'kiln_render',
    arguments: { code: metal, capture: { preset: '1x1' } },
  });
  assert.equal(result.isError, undefined);
  assert.equal(views, 1);
  assert.ok(result.content.some((value) => value.type === 'image'));
  assert.match(JSON.stringify(result), /full-material/);
  const unavailable = host('material-fallback', {}, evaluate, async () => ({
    ok: false,
    rendererId: 'unavailable',
    error: 'Hosted software rendering is unavailable',
  }));
  const fallback = await rpc(unavailable, 'tools/call', {
    name: 'kiln_render',
    arguments: { code: metal, capture: { preset: '1x1' } },
  });
  assert.equal(fallback.isError, undefined);
  assert.ok(fallback.content.some((value) => value.type === 'image'));
  assert.match(JSON.stringify(fallback), /geometry-flat/);
});

test('native HTTP validates its private route, Origin, body and credentials before engine dispatch', async () => {
  const handler = host('requests');
  for (const [url, status] of [
    ['http://foreign.internal/mcp', 421],
    ['http://kiln-native.internal/private', 404],
    ['http://kiln-native.internal/mcp?token=secret', 400],
  ]) {
    const result = await handler.fetch(new Request(url));
    assert.equal(result.status, status);
    await result.body?.cancel();
  }
  for (const headers of [
    { origin: 'https://foreign.example' },
    { authorization: 'Bearer forbidden' },
    { cookie: 'forbidden' },
    { 'x-kiln-tenant': 'forged' },
  ]) {
    const result = await handler.fetch(request('tools/list', {}, { headers }));
    assert.equal(result.status, 403);
    assert.ok(!(await result.text()).includes('forbidden'));
  }
  const oversized = await handler.fetch(
    new Request('http://kiln-native.internal/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(1024 * 1024 + 1),
    }),
  );
  assert.equal(oversized.status, 413);
  await oversized.body?.cancel();
  const allowed = await rpc(handler, 'tools/list', {}, { headers: { origin: publicOrigin } });
  assert.ok(allowed.tools.length);
});

test('request cancellation reaches native evaluation and holds admission until the evaluator settles', async () => {
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let settle;
  let executionSignal;
  const handler = host(
    'cancel',
    {},
    {
      render: async (_code, _options, controls) => {
        executionSignal = controls.signal;
        entered();
        return new Promise((_resolve, reject) => {
          settle = () => reject(new Error('fixture cancelled'));
        });
      },
    },
  );
  const abort = new AbortController();
  const pending = handler.fetch(
    request(
      'tools/call',
      { name: 'kiln_render', arguments: { code: source } },
      { signal: abort.signal },
    ),
  );
  await started;
  abort.abort('private cancellation detail');
  const stopped = await pending;
  assert.equal(stopped.status, 499);
  assert.ok(!(await stopped.text()).includes('private cancellation detail'));
  assert.equal(executionSignal.aborted, true);
  const busy = await handler.fetch(request('tools/list'));
  assert.equal(busy.status, 429);
  await busy.body?.cancel();
  settle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok((await rpc(handler, 'tools/list')).tools.length);
});

test('production runtime refuses an unqualified host and never selects a trusted fallback', async () => {
  assert.throws(
    () => createNativeMcpHandler({ createServer: createKilnMcpServer }, { publicOrigin }),
    /evaluator/i,
  );
  await assert.rejects(
    loadNativeMcpRuntime({ bwrapPath: '/kiln-fixture-no-such-executable' }),
    /isolation readiness/i,
  );
});

test('explicit container runtime loads the installed engine and fails closed when its remote evaluator is unavailable', async () => {
  let calls = 0;
  const runtime = await loadContainerMcpRuntime({
    fetch: async () => {
      calls++;
      throw new Error('PRIVATE_NETWORK_ERROR');
    },
  });
  assert.equal(typeof runtime.createServer, 'function');
  const handler = host('remote-failure', {}, runtime.evaluatorPort);
  const result = await rpc(handler, 'tools/call', {
    name: 'kiln_render',
    arguments: { code: source },
  });
  assert.equal(result.isError, true);
  assert.ok(!result.content.some((item) => item.type === 'image'));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_NETWORK_ERROR/);
  assert.ok(calls > 0);
});

test('slow request bodies expire, cancel their stream and release admission', async () => {
  let cancelled = false;
  const handler = host('slow-body', { requestTimeoutMs: 30 });
  const response = await handler.fetch(
    new Request('http://kiln-native.internal/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      duplex: 'half',
      body: new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    }),
  );
  assert.equal(response.status, 504);
  await response.body?.cancel();
  assert.equal(cancelled, true);
  const next = await handler.fetch(new Request('http://kiln-native.internal/mcp'));
  assert.equal(next.status, 405);
  await next.body?.cancel();
});

test('an already-cancelled request returns a redacted result without unhandled rejection', async () => {
  const handler = host('already-cancelled');
  const abort = new AbortController();
  abort.abort('sensitive reason');
  const response = await handler.fetch(request('tools/list', {}, { signal: abort.signal }));
  assert.equal(response.status, 499);
  assert.ok(!(await response.text()).includes('sensitive reason'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok((await rpc(handler, 'tools/list')).tools.length);
});

test('response size limits stop streaming, and closing the host prevents further work', async () => {
  const handler = host('response-limit', { maxResponseBytes: 128 });
  const response = await handler.fetch(request('tools/list'));
  await assert.rejects(response.text(), /size limit/);
  await handler.close();
  const closed = await handler.fetch(request('tools/list'));
  assert.equal(closed.status, 503);
  await closed.body?.cancel();
});

test('closing a legacy SSE response cancels its evaluator and keeps its occupied slot', async () => {
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let settle;
  let executionSignal;
  const handler = host(
    'legacy-cancel',
    {},
    {
      render: async (_code, _options, controls) => {
        executionSignal = controls.signal;
        entered();
        return new Promise((_resolve, reject) => {
          settle = () => reject(new Error('fixture cancelled'));
        });
      },
    },
  );
  const response = await handler.fetch(
    request('tools/call', { name: 'kiln_render', arguments: { code: source } }, { modern: false }),
  );
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  await started;
  await response.body.cancel();
  assert.equal(executionSignal.aborted, true);
  const busy = await handler.fetch(request('tools/list'));
  assert.equal(busy.status, 429);
  await busy.body?.cancel();
  settle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok((await rpc(handler, 'tools/list')).tools.length);
});
