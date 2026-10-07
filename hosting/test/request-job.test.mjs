import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';

let NativeRequestJob;
before(async () => {
  const output = new URL('../../.cache/hosted-request-test/job.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/request-job.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ NativeRequestJob } = await import(output));
});

const tenant = 'a'.repeat(43);
const image = `registry.cloudflare.com/fixture/coordinator@sha256:${'b'.repeat(64)}`;
const request = (extra = {}) =>
  new Request('https://tenant.internal/mcp', {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' },
    ...extra,
  });
const evaluation = () =>
  new Request('http://kiln-evaluator.internal/evaluate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '2',
      'x-kiln-deadline-ms': '60000',
      'x-kiln-max-response-bytes': '1024',
    },
    body: '{}',
  });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const rendering = () =>
  new Request('http://kiln-renderer.internal/render', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '2',
      'x-kiln-deadline-ms': '30000',
      'x-kiln-max-response-bytes': '20971520',
    },
    body: '{}',
  });
const turn = () => new Promise((resolve) => setImmediate(resolve));

function fixture(options = {}) {
  const values = new Map(),
    events = [],
    children = new Map(),
    storageCalls = [];
  let alarmAt,
    transactionTail = Promise.resolve(),
    failChildren = !!options.failChildren;
  const exited = deferred();
  const storage = {
    async get(key) {
      return structuredClone(values.get(key));
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
    async setAlarm(value) {
      alarmAt = Number(value);
      events.push('alarm');
    },
    async deleteAlarm() {
      alarmAt = undefined;
    },
    transaction(callback) {
      const pending = transactionTail.then(() => callback(storage));
      transactionTail = pending.catch(() => {});
      return pending;
    },
  };
  let job;
  const container = {
    images: { coordinator: options.image ?? image },
    running: false,
    async interceptOutboundHttp(host, binding) {
      events.push(`intercept:${host}`);
      assert(binding);
      await options.intercept?.();
    },
    start(settings) {
      events.push('start');
      this.settings = settings;
      this.running = true;
    },
    monitor() {
      return exited.promise;
    },
    async setInactivityTimeout() {},
    async inspect() {
      return this.running ? { image: options.observedImage ?? image } : null;
    },
    async destroy() {
      events.push('destroy');
      await options.destroy?.();
      this.running = false;
      exited.resolve();
    },
    getTcpPort(port) {
      assert.equal(port, 3000);
      return {
        fetch: async (input) => {
          const req = input instanceof Request ? input : new Request(input);
          if (req.url.endsWith('/_ready')) return new Response(null, { status: 204 });
          events.push('mcp');
          return options.native ? options.native(req, job) : Response.json({ ok: true });
        },
      };
    },
  };
  const ports = {
    publicOrigin: 'https://kiln.example.com',
    storageInterceptor: {},
    evaluationInterceptor: {},
    renderInterceptor: {},
    async storage(owner, req) {
      storageCalls.push({ owner, url: req.url, headers: Object.fromEntries(req.headers) });
      return new Response('source bytes');
    },
    async evaluate(id, req) {
      assert(
        values
          .get('request')
          .children.some((child) => child.id === id && child.kind === 'evaluation'),
        'child must be durable before dispatch',
      );
      assert.equal(children.has(id), false);
      children.set(id, true);
      events.push(`child:${id}`);
      return options.evaluate ? options.evaluate(id, req) : Response.json({ fixture: true });
    },
    async cancelEvaluation(id) {
      events.push(`cancel:${id}`);
      if (failChildren) throw new Error('PRIVATE_CHILD_FAILURE');
      children.set(id, false);
    },
    async render(id, req) {
      assert(
        values.get('request').children.some((child) => child.id === id && child.kind === 'render'),
      );
      assert.equal(children.has(id), false);
      children.set(id, true);
      events.push(`render:${id}`);
      return options.render ? options.render(id, req) : Response.json({ rendered: true });
    },
    async cancelRender(id) {
      events.push(`cancel-render:${id}`);
      if (failChildren) throw new Error('PRIVATE_RENDER_FAILURE');
      children.set(id, false);
    },
  };
  const context = { storage, container };
  job = new NativeRequestJob(context, ports);
  return {
    job,
    context,
    ports,
    values,
    events,
    children,
    storageCalls,
    get alarmAt() {
      return alarmAt;
    },
    repair() {
      failChildren = false;
    },
    run(req = request()) {
      return job.run(tenant, req, Date.now() + 2000);
    },
  };
}

test('render children are durable, separately routed, and share the parent execution limit', async () => {
  const f = fixture({
    native: async (_, job) => {
      for (let i = 0; i < 8; i++) {
        if (i % 2) await job.evaluateRequest(evaluation());
        else await job.renderRequest(rendering());
      }
      await assert.rejects(job.renderRequest(rendering()), (error) => error.status === 429);
      await assert.rejects(job.evaluateRequest(evaluation()), (error) => error.status === 429);
      return Response.json({ ok: true });
    },
  });
  await f.run();
  const children = f.values.get('request').children;
  assert.equal(new Set(children.map((child) => child.id)).size, 8);
  assert.equal(children.filter((child) => child.kind === 'render').length, 4);
  assert.equal([...f.children.values()].some(Boolean), false);
  for (const child of children) {
    const prefix = child.kind === 'render' ? 'cancel-render:' : 'cancel:';
    assert(f.events.includes(prefix + child.id));
    assert(!f.events.includes((child.kind === 'render' ? 'cancel:' : 'cancel-render:') + child.id));
  }
});

test('a pending render excludes evaluation until its cleanup acknowledgement', async () => {
  const entered = deferred(),
    finish = deferred(),
    renderStarted = deferred(),
    renderFinish = deferred();
  const f = fixture({
    native: async () => {
      entered.resolve();
      await finish.promise;
      return Response.json({ ok: true });
    },
    render: async (_id, req) => {
      assert(Number(req.headers.get('x-kiln-deadline-ms')) <= 2000);
      renderStarted.resolve();
      await renderFinish.promise;
      return Response.json({ ok: true });
    },
  });
  const run = f.run();
  await entered.promise;
  const rendered = f.job.renderRequest(rendering());
  await renderStarted.promise;
  await assert.rejects(f.job.evaluateRequest(evaluation()), (error) => error.status === 429);
  await assert.rejects(f.job.renderRequest(rendering()), (error) => error.status === 429);
  renderFinish.resolve();
  await rendered;
  await f.job.evaluateRequest(evaluation());
  finish.resolve();
  await run;
});

test('render cleanup failure retains parent admission state and recovery routes by persisted kind', async () => {
  const f = fixture({
    failChildren: true,
    native: async (_, job) => {
      await job.renderRequest(rendering());
      return Response.json({ ok: true });
    },
  });
  await assert.rejects(f.run(), (error) => error.code === 'CLEANUP_FAILED');
  assert.equal(f.values.get('request').state, 'closing');
  const child = f.values.get('request').children[0];
  assert.equal(child.kind, 'render');
  f.repair();
  await new NativeRequestJob(f.context, f.ports).alarm();
  assert.equal(f.values.get('request').state, 'finished');
  assert(f.events.includes(`cancel-render:${child.id}`));
  assert(!f.events.includes(`cancel:${child.id}`));
});

test('render route rejects caller-selected authority and fails after parent cancellation', async () => {
  const f = fixture({
    native: async (_, job) => {
      await assert.rejects(job.renderRequest(evaluation()), (error) => error.status === 400);
      await assert.rejects(
        job.renderRequest(new Request(rendering(), { headers: { 'x-tenant': 'other' } })),
        (error) => error.status === 400,
      );
      return Response.json({ ok: true });
    },
  });
  await f.run();
  await assert.rejects(f.job.renderRequest(rendering()));
  assert.equal(f.values.get('request').children.length, 0);
});

test('request host binds storage outside its offline VM and stops the whole job tree before returning', async () => {
  const f = fixture({
    native: async (req, job) => {
      assert.equal(req.url, 'http://kiln-native.internal/mcp');
      assert.equal(req.headers.has('authorization'), false);
      assert.equal(
        await (
          await job.storageRequest(new Request('http://kiln-storage.internal/internal/programs'))
        ).text(),
        'source bytes',
      );
      await (await job.evaluateRequest(evaluation())).arrayBuffer();
      return Response.json({ ok: true }, { headers: { 'set-cookie': 'PRIVATE_FIXTURE=1' } });
    },
  });
  const result = await f.run();
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.headers.has('set-cookie'), false);
  assert.equal(f.context.container.settings.enableInternet, false);
  assert.deepEqual(f.context.container.settings.env, {
    KILN_PUBLIC_ORIGIN: 'https://kiln.example.com',
  });
  assert.equal(f.context.container.settings.image, image);
  assert.deepEqual(
    f.events.filter((v) => v.startsWith('intercept:')),
    [
      'intercept:kiln-storage.internal',
      'intercept:kiln-evaluator.internal',
      'intercept:kiln-renderer.internal',
    ],
  );
  assert.ok(f.events.indexOf('alarm') < f.events.indexOf('start'));
  assert.deepEqual(f.storageCalls, [
    { owner: tenant, url: 'https://tenant.internal/internal/programs', headers: {} },
  ]);
  assert.equal(f.context.container.running, false);
  assert.equal([...f.children.values()].some(Boolean), false);
  assert.equal(f.values.get('request').state, 'finished');
  assert.equal(f.alarmAt, undefined);
});

test('storage interceptor refuses supplied identity, foreign origins and administrative routes', async () => {
  const entered = deferred(),
    finish = deferred();
  const f = fixture({
    native: async () => {
      entered.resolve();
      await finish.promise;
      return Response.json({ ok: true });
    },
  });
  const run = f.run();
  await entered.promise;
  for (const req of [
    new Request('http://kiln-storage.internal/internal/programs', {
      headers: { 'x-tenant': 'victim' },
    }),
    new Request('http://kiln-storage.internal/internal/programs', {
      headers: { authorization: 'Bearer PRIVATE' },
    }),
    new Request('http://kiln-storage.internal/internal/programs?tenant=victim'),
    new Request('http://attacker.example/internal/programs'),
    new Request('http://kiln-storage.internal/internal/maintenance', { method: 'POST' }),
    new Request('http://kiln-storage.internal/internal/account-deletion', { method: 'POST' }),
  ])
    await assert.rejects(f.job.storageRequest(req));
  assert.equal(f.storageCalls.length, 0);
  finish.resolve();
  await run;
  await assert.rejects(
    f.job.storageRequest(new Request('http://kiln-storage.internal/internal/programs')),
  );
});

test('material storage routes stay bound to the parent tenant and reject arbitrary paths or identity headers', async () => {
  const f = fixture({
    native: async (_req, job) => {
      for (const [path, method] of [
        ['/internal/materials/list', 'POST'],
        ['/internal/materials/commit', 'POST'],
        [`/internal/materials/stone/${'a'.repeat(64)}`, 'GET'],
      ]) {
        const response = await job.storageRequest(
          new Request(`http://kiln-storage.internal${path}`, {
            method,
            ...(method === 'POST'
              ? { body: '{}', headers: { 'content-type': 'application/json' } }
              : {}),
          }),
        );
        await response.text();
      }
      for (const path of [
        '/internal/materials/stone/invalid',
        '/internal/materials/list?tenant=victim',
        '/internal/materials/delete',
      ])
        await assert.rejects(
          job.storageRequest(new Request(`http://kiln-storage.internal${path}`)),
          (error) => error.status === 400,
        );
      await assert.rejects(
        job.storageRequest(
          new Request('http://kiln-storage.internal/internal/materials/list', {
            method: 'POST',
            body: '{}',
            headers: { 'x-kiln-tenant': 'victim' },
          }),
        ),
        (error) => error.status === 400,
      );
      return Response.json({ ok: true });
    },
  });
  await f.run();
  assert.equal(f.storageCalls.length, 3);
  assert(f.storageCalls.every((call) => call.owner === tenant));
});

test('native download ticket issuance stays bound to the active parent tenant without browser redemption authority', async () => {
  const f = fixture({
    native: async (_req, job) => {
      const response = await job.storageRequest(
        new Request('http://kiln-storage.internal/internal/downloads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ collection: 'project', assetId: 'a_box', revisionId: 'r_one' }),
        }),
      );
      assert.equal(await response.text(), 'source bytes');
      await assert.rejects(
        job.storageRequest(
          new Request(
            `http://kiln-storage.internal/internal/downloads/${'a'.repeat(64)}/asset.glb`,
          ),
        ),
      );
      return Response.json({ ok: true });
    },
  });
  await (await f.run()).arrayBuffer();
  assert.equal(f.storageCalls.length, 1);
  assert.equal(f.storageCalls[0].owner, tenant);
  assert.equal(f.storageCalls[0].url, 'https://tenant.internal/internal/downloads');
  await assert.rejects(
    f.job.storageRequest(
      new Request('http://kiln-storage.internal/internal/downloads', { method: 'POST' }),
    ),
  );
});

test('a cancelled parent refuses a late request after reconstruction without starting a VM', async () => {
  const f = fixture();
  await f.job.cancel();
  const restored = new NativeRequestJob(f.context, f.ports);
  await assert.rejects(restored.run(tenant, request(), Date.now() + 2000));
  assert.equal(f.events.includes('start'), false);
  assert.equal(f.values.get('request').state, 'finished');
});

test('cancellation during interceptor registration prevents late VM startup', async () => {
  const entered = deferred(),
    finish = deferred();
  const f = fixture({
    intercept: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  const rejected = assert.rejects(f.run());
  await entered.promise;
  await f.job.cancel();
  finish.resolve();
  await rejected;
  await turn();
  assert.equal(f.events.includes('start'), false);
  assert.equal(f.values.get('request').state, 'finished');
});

test('only one child runs at a time and subsequent evaluations get fresh IDs', async () => {
  const entered = deferred(),
    finish = deferred(),
    childStarted = deferred(),
    childFinish = deferred();
  const f = fixture({
    native: async () => {
      entered.resolve();
      await finish.promise;
      return Response.json({ ok: true });
    },
    evaluate: async () => {
      childStarted.resolve();
      await childFinish.promise;
      return Response.json({ ok: true });
    },
  });
  const run = f.run();
  await entered.promise;
  const first = f.job.evaluateRequest(evaluation());
  await childStarted.promise;
  await assert.rejects(f.job.evaluateRequest(evaluation()), (error) => error.status === 429);
  childFinish.resolve();
  await first;
  await f.job.evaluateRequest(evaluation());
  assert.equal(new Set(f.values.get('request').children.map((child) => child.id)).size, 2);
  finish.resolve();
  await run;
  assert.equal([...f.children.values()].some(Boolean), false);
});

test('failed child cleanup suppresses the host response and survives eviction for alarm recovery', async () => {
  const f = fixture({
    failChildren: true,
    native: async (_, job) => {
      await job.evaluateRequest(evaluation());
      return Response.json({ ok: true });
    },
  });
  await assert.rejects(f.run(), (error) => error.code === 'CLEANUP_FAILED');
  assert.notEqual(f.values.get('request').state, 'finished');
  assert.ok(Number.isSafeInteger(f.alarmAt));
  assert.equal(f.context.container.running, false);
  f.repair();
  await new NativeRequestJob(f.context, f.ports).alarm();
  assert.equal(f.values.get('request').state, 'finished');
  assert.equal([...f.children.values()].some(Boolean), false);
  assert.equal(f.alarmAt, undefined);
});

test('a response cannot escape while coordinator destruction is still pending', async () => {
  const entered = deferred(),
    finish = deferred();
  const f = fixture({
    destroy: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  let returned = false;
  const run = f.run().then((response) => {
    returned = true;
    return response;
  });
  await entered.promise;
  assert.equal(returned, false);
  finish.resolve();
  await run;
  assert.equal(f.context.container.running, false);
});

test('invalid coordinator configuration or forwarded authority starts no VM', async () => {
  for (const [f, req] of [
    [fixture({ image: 'registry.example/coordinator:latest' }), request()],
    [fixture(), request({ headers: { authorization: 'Bearer PRIVATE' } })],
  ]) {
    await assert.rejects(f.run(req));
    assert.equal(f.events.includes('start'), false);
  }
});

test('a durable claim that finishes after the request deadline cannot start compute', async () => {
  const f = fixture();
  const transaction = f.context.storage.transaction;
  let first = true;
  f.context.storage.transaction = (callback) =>
    transaction(async (tx) => {
      if (first) {
        first = false;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return callback(tx);
    });
  await assert.rejects(
    f.job.run(tenant, request(), Date.now() + 20),
    (error) => error.status === 504,
  );
  assert.equal(f.events.includes('start'), false);
});

test('storage uploads preserve bytes while stripping transport-only headers', async () => {
  const f = fixture({
    native: async (_, job) => {
      await job.storageRequest(
        new Request('http://kiln-storage.internal/internal/programs', {
          method: 'POST',
          headers: {
            'content-type': 'application/javascript',
            'content-length': '2',
            host: 'kiln-storage.internal',
          },
          body: '{}',
        }),
      );
      return Response.json({ ok: true });
    },
  });
  f.ports.storage = async (owner, req) => {
    assert.equal(owner, tenant);
    assert.equal(await req.text(), '{}');
    assert.equal(req.headers.has('host'), false);
    return new Response('saved');
  };
  await f.run();
});

test('an unexpected coordinator image is destroyed before it receives the MCP body', async () => {
  const f = fixture({ observedImage: `registry.example/other@sha256:${'c'.repeat(64)}` });
  await assert.rejects(f.run());
  assert.equal(f.events.includes('mcp'), false);
  assert.equal(f.context.container.running, false);
  assert.equal(f.values.get('request').state, 'finished');
});

test('a timed-out native response cannot revive work or leak a late body', async () => {
  const entered = deferred(),
    result = deferred();
  const f = fixture({
    native: async () => {
      entered.resolve();
      return result.promise;
    },
  });
  const rejected = assert.rejects(
    f.job.run(tenant, request(), Date.now() + 50),
    (error) => error.status === 504,
  );
  await entered.promise;
  await rejected;
  let cancelled = false;
  result.resolve(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await turn();
  assert.equal(cancelled, true);
  assert.equal(f.context.container.running, false);
  assert.equal(f.values.get('request').state, 'finished');
});

test('one admitted request cannot spawn more than eight child evaluations', async () => {
  const f = fixture({
    native: async (_, job) => {
      for (let i = 0; i < 8; i++) await (await job.evaluateRequest(evaluation())).arrayBuffer();
      await assert.rejects(job.evaluateRequest(evaluation()), (error) => error.status === 429);
      return Response.json({ ok: true });
    },
  });
  await f.run();
  assert.equal(f.values.get('request').children.length, 8);
  assert.equal([...f.children.values()].some(Boolean), false);
});

test('an oversized native response is discarded and coordinator cleanup is still required', async () => {
  const f = fixture({ native: async () => new Response(new Uint8Array(32 * 1024 * 1024 + 1)) });
  await assert.rejects(f.run(), (error) => error.status === 413);
  assert.equal(f.context.container.running, false);
  assert.equal(f.values.get('request').state, 'finished');
});
