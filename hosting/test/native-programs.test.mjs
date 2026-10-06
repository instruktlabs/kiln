import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { createKilnToolHost } from '../../dist/mcp-engine.mjs';

let NativeProgramStore;
let runtime;
let namespace;
const canonical = (source) => `sha256:${createHash('sha256').update(source).digest('hex')}`;
before(async () => {
  const client = await build({
    entryPoints: [fileURLToPath(new URL('../src/native-programs.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  ({ NativeProgramStore } = await import(
    `data:text/javascript;base64,${Buffer.from(`${client.outputFiles[0].text}\n//# sourceURL=kiln-native-programs-test.mjs`).toString('base64')}`
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
      name: 'native-programs',
      modules: true,
      script: worker.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      r2Buckets: ['ARTIFACTS'],
      durableObjects: { TENANTS: { className: 'KilnTenant', useSQLite: true } },
      bindings: {
        STORAGE_MAX_BYTES: String(4 * 1024 * 1024),
        STORAGE_MAX_OBJECTS: '32',
        STORAGE_MAX_GROUPS: '8',
      },
      outboundService: async () => {
        throw new Error('Storage must not fetch externally');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
});
after(async () => runtime?.dispose());

function store(owner, options = {}) {
  return new NativeProgramStore({
    ...options,
    fetch: async (request) => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'http://kiln-storage.internal');
      assert.equal(request.redirect, 'error');
      assert.equal(request.credentials, 'omit');
      assert.deepEqual(
        [...request.headers.keys()].sort(),
        request.method === 'POST' ? ['content-length', 'content-type'] : [],
      );
      // Test transport only. Production must bind this owner outside the container.
      return namespace
        .get(namespace.idFromName(owner))
        .fetch(new Request(`https://tenant.internal${url.pathname}`, request));
    },
  });
}

test('native source client retains exact bytes and resolves durable references after restart', async () => {
  const source = '\ufeff// Café 🏠\r\nfunction build() { return createRoot("Home"); }';
  const first = store('bytes');
  const ref = await first.put(source);
  assert.equal(ref, canonical(source));
  const handle = await first.shortRef(ref);
  assert.equal(handle, `p_${ref.slice(7)}`);
  assert.equal(await first.get(handle), source);
  await runtime.unsafeEvictDurableObject('native-programs', 'KilnTenant', {
    id: namespace.idFromName('bytes').toString(),
  });
  const second = store('bytes');
  assert.equal(await second.get(handle), source);
  assert.equal(await second.put(source), ref);
  const stats = await second.stats();
  assert.equal(stats.entries, 1);
  assert.equal(stats.bytes, Buffer.byteLength(source));
  assert.equal(stats.maxSourceBytes, 1024 * 1024);
  await assert.rejects(store('other').get(ref), /Program not found.*Send the source again/s);
  await assert.rejects(store('other').shortRef(ref), /Program not found/);
});

test('invalid source and references are rejected before any storage request', async () => {
  let requests = 0;
  const client = new NativeProgramStore({
    fetch: async () => {
      requests++;
      throw new Error();
    },
  });
  for (const source of ['\ud800', 'a'.repeat(1024 * 1024 + 1)]) {
    await assert.rejects(client.put(source), /Unicode|1 MiB/);
  }
  for (const ref of ['../../keys', 'https://other.example/source', `sha256:${'a'.repeat(64)}\n`]) {
    await assert.rejects(client.get(ref), /Invalid program reference/);
  }
  await assert.rejects(client.get(`p_${'a'.repeat(12)}`), /Program not found/);
  assert.equal(requests, 0);
});

test('native client rejects corrupt, oversized, redirected and malformed storage responses', async () => {
  const ref = canonical('original');
  const cases = [
    () => new Response('changed'),
    () => new Response(Buffer.from([0xff])),
    () => new Response('a'.repeat(1024 * 1024 + 1)),
    () => new Response(null, { status: 302, headers: { location: 'https://external.example/' } }),
    () => new Response('fixture-sensitive-response', { status: 500 }),
  ];
  for (const response of cases) {
    const client = new NativeProgramStore({ fetch: async () => response() });
    await assert.rejects(client.get(ref), (error) => {
      assert.doesNotMatch(error.message, /fixture-sensitive|changed|external\.example/);
      return /integrity|limit|unavailable|response/.test(error.message);
    });
  }
  const wrong = new NativeProgramStore({
    fetch: async () =>
      Response.json(
        {
          programRef: canonical('different'),
          shortRef: `p_${'a'.repeat(64)}`,
          artifactId: '0'.repeat(32),
        },
        { status: 201 },
      ),
  });
  await assert.rejects(wrong.put('original'), /response/);
  const badStats = new NativeProgramStore({
    fetch: async () =>
      Response.json({
        entries: -1,
        bytes: 0,
        maxSourceBytes: 1024 * 1024,
        eviction: 'none',
      }),
  });
  await assert.rejects(badStats.stats(), /response/);
  const full = new NativeProgramStore({
    fetch: async () => new Response('private detail', { status: 507 }),
  });
  await assert.rejects(full.put('source'), /quota/);
  const missingBody = new NativeProgramStore({
    fetch: async () =>
      new Response(null, {
        headers: { 'content-length': '1' },
      }),
  });
  await assert.rejects(missingBody.get(canonical('')), /response/);
});

test('a storage deadline covers stalled headers and bodies and cancels the response stream', async () => {
  const ref = canonical('source');
  let sentSignal;
  const stalled = new NativeProgramStore({
    timeoutMs: 25,
    fetch: (request) => {
      sentSignal = request.signal;
      return new Promise(() => {});
    },
  });
  await assert.rejects(stalled.get(ref), /timed out/);
  assert.equal(sentSignal.aborted, true);
  let cancelled = false;
  const body = new NativeProgramStore({
    timeoutMs: 25,
    fetch: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  await assert.rejects(body.get(ref), /timed out/);
  assert.equal(cancelled, true);
});

test('request cancellation is scoped per call and never leaks a supplied abort reason', async () => {
  const signals = new AsyncLocalStorage();
  const a = new AbortController();
  const b = new AbortController();
  const seen = [];
  const client = new NativeProgramStore({
    signal: () => signals.getStore(),
    fetch: (request) => {
      seen.push(request.signal);
      if (seen.length === 2) return Promise.resolve(new Response('source'));
      return new Promise(() => {});
    },
  });
  const pending = signals.run(a.signal, () => client.get(canonical('source')));
  await Promise.resolve();
  a.abort(new Error('fixture-sensitive-abort-reason'));
  await assert.rejects(pending, (error) => error.message === 'Source storage request cancelled');
  assert.equal(await signals.run(b.signal, () => client.get(canonical('source'))), 'source');
  assert.equal(seen[0].aborted, true);
  assert.equal(seen[1].aborted, false);
  await assert.rejects(
    signals.run(a.signal, () => client.get(canonical('source'))),
    /cancelled/,
  );
  assert.equal(seen.length, 2);
});

test('real engine tools validate, read, edit and CPU-render durable source across hosts', async () => {
  const source = `const meta = { name: 'Post' };\nfunction build() { const r = createRoot('Post'); createPart('Body', boxGeo(1, 2, 1), gameMaterial(0x888888), { parent: r, position: [0, 1, 0] }); return r; }\n`;
  const make = (owner) =>
    createKilnToolHost({
      programStore: store(owner),
      // Only this fixed trusted fixture may use the local evaluator. This is not
      // a hosted execution entrypoint or evidence of provider isolation.
      evaluatorProfile: 'trusted-local',
    });
  const invoke = async (host, name, args) => {
    const result = await host.callTool(name, args, { signal: new AbortController().signal });
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
    return { result, data: JSON.parse(result.content.find((item) => item.type === 'text').text) };
  };
  const first = make('engine');
  const { data: initial } = await invoke(first, 'kiln_validate', { code: source });
  assert.match(initial.programRef, /^p_[a-f0-9]{64}$/);
  assert.equal(
    (await invoke(first, 'kiln_source', { programRef: initial.programRef })).data.code,
    source,
  );
  const { result: edited, data } = await invoke(first, 'kiln_edit', {
    programRef: initial.programRef,
    edits: [{ oldString: 'boxGeo(1, 2, 1)', newString: 'boxGeo(1, 3, 1)' }],
    capture: { preset: '1x1' },
  });
  assert.equal(data.ok, true);
  assert.equal(data.parentRef, initial.programRef);
  assert.notEqual(data.programRef, initial.programRef);
  const image = edited.content.find((item) => item.type === 'image');
  assert.ok(image, 'Actual edit must produce an image');
  assert.equal(Buffer.from(image.data, 'base64').subarray(1, 4).toString(), 'PNG');
  await runtime.unsafeEvictDurableObject('native-programs', 'KilnTenant', {
    id: namespace.idFromName('engine').toString(),
  });
  const restarted = make('engine');
  assert.equal(
    (await invoke(restarted, 'kiln_source', { programRef: initial.programRef })).data.code,
    source,
  );
  assert.equal(
    (await invoke(restarted, 'kiln_source', { programRef: data.programRef })).data.code,
    source.replace('boxGeo(1, 2, 1)', 'boxGeo(1, 3, 1)'),
  );
  const render = await invoke(restarted, 'kiln_render', {
    programRef: data.programRef,
    capture: { preset: '1x1' },
  });
  assert.equal(render.data.ok, true);
  assert.ok(render.result.content.some((item) => item.type === 'image'));
  const denied = await make('another-engine').callTool(
    'kiln_source',
    { programRef: data.programRef },
    { signal: new AbortController().signal },
  );
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /Program not found/);
  assert.equal((await store('engine').stats()).entries, 2);
});
