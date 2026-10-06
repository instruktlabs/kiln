import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { createKilnMcpServer, kilnMcpToolDefs } from '../../dist/mcp-engine.mjs';
import { renderGLB } from '../../lib/render.js';

const publicOrigin = 'https://kiln.example.com';
const source =
  "function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#aaaaaa'),{parent:r});return r;}";
let createNativeMcpHandler;
let loadNativeMcpRuntime;
let runtime;
let namespace;
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
        ['evaluator', 'evaluator/index'],
      ].map(([name, file]) => [
        `@instruktlabs/kiln/${name}`,
        fileURLToPath(new URL(`../../lib/${file}.js`, import.meta.url)),
      ]),
    ),
  });
  ({ createNativeMcpHandler, loadNativeMcpRuntime } = await import(
    new URL('../../.cache/hosted-mcp-test/native-mcp.mjs', import.meta.url)
  ));
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
) {
  const handler = createNativeMcpHandler(
    { createServer: createKilnMcpServer, evaluatorPort: evaluator },
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
  const expected = kilnMcpToolDefs({ programStore: {}, assetLibrary: {} })
    .map((def) => def.name)
    .sort();
  const current = await rpc(handler, 'tools/list');
  assert.deepEqual(current.tools.map((item) => item.name).sort(), expected);
  assert.equal(current.resultType, 'complete');
  for (const version of ['2025-03-26', '2025-06-18', '2025-11-25']) {
    const initialized = await rpc(
      handler,
      'initialize',
      { protocolVersion: version, capabilities: {}, clientInfo: { name: 'legacy', version: '1' } },
      { modern: false },
    );
    assert.equal(initialized.protocolVersion, version);
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
  const first = host('lifecycle');
  const validated = await tool(first, 'kiln_validate', { code: source });
  const rendered = await rpc(first, 'tools/call', {
    name: 'kiln_render',
    arguments: { programRef: validated.programRef, capture: { preset: '1x1' } },
  });
  assert.equal(rendered.isError, undefined);
  assert.ok(rendered.content.some((item) => item.type === 'image'));
  const saved = await tool(first, 'kiln_save', {
    programRef: validated.programRef,
    collection: 'project',
    name: 'HTTP box',
  });
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
  const other = await rpc(host('other'), 'tools/call', {
    name: 'kiln_source',
    arguments: { programRef: restored.programRef },
  });
  assert.equal(other.isError, true);
  assert.ok(!JSON.stringify(other).includes(source));
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
