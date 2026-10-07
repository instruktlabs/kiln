import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';

let ContainerEvaluationJob, ContainerRenderJob;
const image = `registry.cloudflare.com/fixture/kiln@sha256:${'a'.repeat(64)}`;
const encoder = new TextEncoder();
const input = encoder.encode('{"version":"kiln.evaluator.request.v2"}');
const response = encoder.encode('{"version":"kiln.evaluator.result.v2"}');
const controls = { deadlineMs: 2_000, maxResponseBytes: 1024 };
const code = (expected) => (error) => error.code === expected;

before(async () => {
  const output = new URL('../../.cache/hosted-container-test/job.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/container-job.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ ContainerEvaluationJob, ContainerRenderJob } = await import(output));
});

function fixture(options = {}) {
  const values = new Map();
  const events = [];
  let alarmAt;
  let transactionTail = Promise.resolve();
  let stopped;
  const monitor = new Promise((resolve) => {
    stopped = resolve;
  });
  let releaseExec;
  const pendingExec = new Promise((resolve) => {
    releaseExec = resolve;
  });
  let failCleanup = options.failCleanup ?? false;
  let unconfirmedCleanup = options.unconfirmedCleanup;
  const received = [];
  const stream = (bytes, hanging = false) =>
    new ReadableStream({
      start(controller) {
        if (bytes) controller.enqueue(bytes);
        if (!hanging) controller.close();
      },
    });
  const process = {
    stdin: new WritableStream({
      write(bytes) {
        events.push('input');
        received.push(bytes);
      },
    }),
    stdout: stream(options.output ?? response, options.hanging),
    stderr: stream(options.stderr ?? new Uint8Array()),
    exitCode: options.hanging ? new Promise(() => {}) : Promise.resolve(options.exitCode ?? 0),
  };
  const container = {
    images: { kiln: options.image ?? image, renderer: options.image ?? image },
    running: false,
    start(settings) {
      events.push('start');
      this.settings = settings;
      this.running = true;
      if (options.startFailure) throw new Error('private provider diagnostic');
    },
    async exec(command, settings) {
      events.push('exec');
      this.command = command;
      this.execSettings = settings;
      // The native API rejects named Linux identities. The image uses USER node.
      if (options.requireNumericUser && settings.user !== '1000:1000')
        throw new Error('internal error; fixture requires numeric uid:gid');
      return options.pendingExec ? pendingExec : process;
    },
    monitor() {
      return monitor;
    },
    async inspect() {
      events.push('inspect');
      if (events.includes('destroy')) {
        if (unconfirmedCleanup === 'inspect-error') throw new Error('private inspection failure');
        if (unconfirmedCleanup === 'inspect-pending') return new Promise(() => {});
        if (unconfirmedCleanup === 'inspect-live') return { image };
      }
      return this.running ? { image: options.observedImage ?? image } : null;
    },
    async setInactivityTimeout() {},
    async destroy() {
      events.push('destroy');
      if (failCleanup) throw new Error('private cleanup diagnostic');
      if (unconfirmedCleanup === 'running') return;
      this.running = false;
      stopped();
    },
  };
  const storage = {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
    async setAlarm(value) {
      events.push('alarm');
      alarmAt = Number(value);
    },
    async deleteAlarm() {
      alarmAt = undefined;
    },
    async transaction(callback) {
      const operation = transactionTail.then(() => callback(storage));
      transactionTail = operation.catch(() => {});
      return operation;
    },
  };
  return {
    context: { container, storage },
    values,
    events,
    received,
    get alarmAt() {
      return alarmAt;
    },
    finishStartup() {
      releaseExec(process);
    },
    repairCleanup() {
      failCleanup = false;
      unconfirmedCleanup = undefined;
    },
  };
}

test('render jobs use a fixed software image and entry with the same cleanup fence', async () => {
  const f = fixture();
  const result = await new ContainerRenderJob(f.context).run(input, controls);
  assert.deepEqual(result, response);
  assert.deepEqual(f.context.container.command, ['/usr/local/bin/node', '/opt/kiln/render.mjs']);
  assert.deepEqual(f.context.container.execSettings.env, {});
  assert.equal(f.context.container.settings.enableInternet, false);
  assert.equal(f.context.container.running, false);
  assert.equal(f.values.get('job').state, 'finished');
  for (const limits of [
    { ...controls, deadlineMs: 30001 },
    { ...controls, maxResponseBytes: 20 * 1024 * 1024 + 1 },
  ]) {
    const rejected = fixture();
    await assert.rejects(
      new ContainerRenderJob(rejected.context).run(input, limits),
      code('INPUT_INVALID'),
    );
    assert.equal(rejected.events.includes('start'), false);
  }
  const wrongImage = fixture();
  delete wrongImage.context.container.images.renderer;
  await assert.rejects(
    new ContainerRenderJob(wrongImage.context).run(input, controls),
    code('INPUT_INVALID'),
  );
  assert.equal(wrongImage.events.includes('start'), false);
});

test('render cancellation survives eviction and unconfirmed cleanup suppresses output', async () => {
  const cancelled = fixture();
  await new ContainerRenderJob(cancelled.context).cancel();
  await assert.rejects(
    new ContainerRenderJob(cancelled.context).run(input, controls),
    code('JOB_ALREADY_USED'),
  );
  assert.equal(cancelled.events.includes('start'), false);
  const f = fixture({ failCleanup: true });
  await assert.rejects(
    new ContainerRenderJob(f.context).run(input, controls),
    code('CLEANUP_FAILED'),
  );
  assert.equal(f.values.get('job').state, 'running');
  f.repairCleanup();
  await new ContainerRenderJob(f.context).cancel();
  assert.equal(f.context.container.running, false);
  assert.equal(f.values.get('job').state, 'finished');
});

test('starts one pinned, offline VM and destroys it before returning any output', async () => {
  const f = fixture();
  const job = new ContainerEvaluationJob(f.context);
  const result = await job.run(input, controls);
  assert.equal(job.executionImage(result), image);
  assert.equal(job.executionImage(Uint8Array.from(result)), undefined);
  assert.deepEqual(result, response);
  assert.equal(f.context.container.running, false);
  assert.deepEqual(f.received, [input]);
  assert.equal(f.context.container.settings.enableInternet, false);
  assert.equal(f.context.container.settings.image, image);
  assert.equal(f.context.container.settings.containerSnapshot, undefined);
  assert.deepEqual(f.context.container.command, ['/usr/local/bin/node', '/opt/kiln/evaluate.mjs']);
  assert.deepEqual(f.context.container.execSettings.env, { KILN_RENDER: 'cpu' });
  assert.ok(f.events.indexOf('alarm') < f.events.indexOf('start'));
  assert.ok(f.events.indexOf('inspect') < f.events.indexOf('input'));
  assert.equal(f.values.get('job').state, 'finished');
  assert.equal(f.alarmAt, undefined);
});

test('execution identity is unavailable for failed isolation or unconfirmed cleanup', async () => {
  for (const options of [{ observedImage: 'wrong-image' }, { failCleanup: true }]) {
    const f = fixture(options);
    const job = new ContainerEvaluationJob(f.context);
    await assert.rejects(job.run(input, controls));
    assert.equal(job.executionImage(response), undefined);
  }
});

test('rejects concurrent and subsequent attempts on the same durable job', async () => {
  const f = fixture();
  const first = new ContainerEvaluationJob(f.context);
  const second = new ContainerEvaluationJob(f.context);
  const results = await Promise.allSettled([
    first.run(input, controls),
    second.run(input, controls),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((result) => result.status === 'rejected').reason.code,
    'JOB_ALREADY_USED',
  );
  assert.equal(f.events.filter((event) => event === 'start').length, 1);
  assert.equal(f.events.filter((event) => event === 'destroy').length, 1);
  await assert.rejects(second.run(input, controls), code('JOB_ALREADY_USED'));
});

test('exec explicitly selects the image user by numeric uid and gid', async () => {
  const f = fixture({ requireNumericUser: true });
  assert.deepEqual(await new ContainerEvaluationJob(f.context).run(input, controls), response);
  assert.equal(f.context.container.execSettings.user, '1000:1000');
  assert.equal(f.context.container.running, false);
});

test('rejects unpinned images, excessive requests and invalid limits before starting', async () => {
  for (const [options, request, limits] of [
    [{ image: 'registry.example/kiln:latest' }, input, controls],
    [{}, new Uint8Array(4 * 1024 * 1024 + 1), controls],
    [{}, input, { ...controls, deadlineMs: 60_001 }],
    [{}, input, { ...controls, maxResponseBytes: 8 * 1024 * 1024 + 1 }],
  ]) {
    const f = fixture(options);
    await assert.rejects(
      new ContainerEvaluationJob(f.context).run(request, limits),
      code('INPUT_INVALID'),
    );
    assert.equal(f.events.includes('start'), false);
  }
});

test('does not send source to an image whose observed identity differs', async () => {
  const f = fixture({ observedImage: `registry.example/other@sha256:${'b'.repeat(64)}` });
  await assert.rejects(
    new ContainerEvaluationJob(f.context).run(input, controls),
    code('ISOLATION_UNAVAILABLE'),
  );
  assert.deepEqual(f.received, []);
  assert.equal(f.context.container.running, false);
});

test('output and stderr floods destroy the VM and cannot return a success', async () => {
  for (const options of [
    { output: new Uint8Array(1025), hanging: true },
    { stderr: new Uint8Array(16_385) },
  ]) {
    const f = fixture(options);
    await assert.rejects(
      new ContainerEvaluationJob(f.context).run(input, controls),
      code('OUTPUT_LIMIT_EXCEEDED'),
    );
    assert.equal(f.context.container.running, false);
    assert.equal(f.values.get('job').outcome, 'OUTPUT_LIMIT_EXCEEDED');
  }
});

test('the external deadline destroys a hung evaluation including when startup is pending', async () => {
  for (const options of [{ hanging: true }, { pendingExec: true }]) {
    const f = fixture(options);
    await assert.rejects(
      new ContainerEvaluationJob(f.context).run(input, { ...controls, deadlineMs: 30 }),
      code('DEADLINE_EXCEEDED'),
    );
    assert.equal(f.context.container.running, false);
    if (options.pendingExec) {
      f.finishStartup();
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(f.received, []);
    }
  }
});

test('caller cancellation destroys the whole VM; pre-cancellation starts nothing', async () => {
  const f = fixture({ pendingExec: true });
  const controller = new AbortController();
  const pending = new ContainerEvaluationJob(f.context).run(input, {
    ...controls,
    signal: controller.signal,
  });
  while (!f.events.includes('exec')) await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, code('CANCELLED'));
  assert.equal(f.context.container.running, false);
  const untouched = fixture();
  await assert.rejects(
    new ContainerEvaluationJob(untouched.context).run(input, {
      ...controls,
      signal: controller.signal,
    }),
    code('CANCELLED'),
  );
  assert.deepEqual(untouched.events, []);
});

test('cleanup failure suppresses output and a durable recovery alarm retries destruction', async () => {
  const f = fixture({ failCleanup: true });
  await assert.rejects(
    new ContainerEvaluationJob(f.context).run(input, controls),
    code('CLEANUP_FAILED'),
  );
  assert.equal(f.values.get('job').state, 'running');
  assert.ok(Number.isSafeInteger(f.alarmAt));
  f.repairCleanup();
  f.values.get('job').deadlineAt = Date.now() - 1;
  await new ContainerEvaluationJob(f.context).alarm();
  assert.equal(f.context.container.running, false);
  assert.equal(f.values.get('job').state, 'finished');
  assert.equal(f.values.get('job').outcome, 'DEADLINE_EXCEEDED');
  assert.equal(f.alarmAt, undefined);
});

test('cleanup must confirm both stopped state and inspection before releasing output or its alarm', async () => {
  for (const unconfirmedCleanup of ['running', 'inspect-live', 'inspect-error']) {
    const f = fixture({ unconfirmedCleanup });
    await assert.rejects(
      new ContainerEvaluationJob(f.context).run(input, controls),
      code('CLEANUP_FAILED'),
    );
    assert.equal(f.values.get('job').state, 'running');
    assert.ok(Number.isSafeInteger(f.alarmAt));
    f.values.get('job').deadlineAt = Date.now() - 1;
    await assert.rejects(new ContainerEvaluationJob(f.context).alarm(), code('CLEANUP_FAILED'));
    assert.equal(f.values.get('job').state, 'running');
    assert.ok(f.alarmAt > Date.now());
    f.repairCleanup();
    await new ContainerEvaluationJob(f.context).alarm();
    assert.equal(f.context.container.running, false);
    assert.equal(f.values.get('job').state, 'finished');
    assert.equal(f.alarmAt, undefined);
  }
});

test('the same cleanup deadline bounds a stalled stopped-state inspection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ unconfirmedCleanup: 'inspect-pending' });
  const pending = new ContainerEvaluationJob(f.context).run(input, controls);
  const rejected = assert.rejects(pending, code('CLEANUP_FAILED'));
  // Let real promise/stream callbacks reach cleanup before advancing the clock.
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.events.includes('destroy'));
  t.mock.timers.tick(5_000);
  await rejected;
  assert.equal(f.values.get('job').state, 'running');
  assert.ok(Number.isSafeInteger(f.alarmAt));
});

test('startup or native process failures are bounded public errors with cleanup', async () => {
  for (const options of [{ startFailure: true }, { exitCode: 1 }]) {
    const f = fixture(options);
    await assert.rejects(
      new ContainerEvaluationJob(f.context).run(input, controls),
      code('WORKER_FAILED'),
    );
    assert.equal(f.context.container.running, false);
  }
});

test('durable cancellation fences a child before arrival and survives object reconstruction', async () => {
  const f = fixture();
  const job = new ContainerEvaluationJob(f.context);
  await job.cancel();
  assert.equal(f.values.get('job').state, 'finished');
  assert.equal(f.values.get('job').outcome, 'CANCELLED');
  await assert.rejects(
    new ContainerEvaluationJob(f.context).run(input, controls),
    code('JOB_ALREADY_USED'),
  );
  assert.equal(f.events.includes('start'), false);
  assert.equal(f.alarmAt, undefined);
});

test('durable cancellation during the persisted claim cannot start a late VM', async () => {
  const f = fixture();
  const job = new ContainerEvaluationJob(f.context);
  assert.equal(typeof job.cancel, 'function');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const transaction = f.context.storage.transaction;
  f.context.storage.transaction = (callback) =>
    transaction(async (tx) => {
      await gate;
      return callback(tx);
    });
  const rejected = assert.rejects(job.run(input, controls), code('CANCELLED'));
  const cancelled = job.cancel();
  release();
  await Promise.all([rejected, cancelled]);
  assert.equal(f.events.includes('start'), false);
  assert.equal(f.values.get('job').state, 'finished');
  assert.equal(f.values.get('job').outcome, 'CANCELLED');
  assert.equal(f.alarmAt, undefined);
});

test('durable cancellation waits for confirmed cleanup and prevents late startup input', async () => {
  const f = fixture({ pendingExec: true });
  const job = new ContainerEvaluationJob(f.context);
  assert.equal(typeof job.cancel, 'function');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const destroy = f.context.container.destroy.bind(f.context.container);
  f.context.container.destroy = async () => {
    await gate;
    await destroy();
  };
  const rejected = assert.rejects(job.run(input, controls), code('CANCELLED'));
  while (!f.events.includes('exec')) await new Promise((resolve) => setImmediate(resolve));
  let returned = false;
  const cancelled = job.cancel().then(() => {
    returned = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned, false);
  assert.equal(f.context.container.running, true);
  assert.equal(f.values.get('job').cancelled, true);
  const repeated = job.cancel();
  const alarm = job.alarm();
  release();
  await Promise.all([rejected, cancelled, repeated, alarm]);
  assert.equal(f.context.container.running, false);
  assert.equal(f.values.get('job').state, 'finished');
  assert.equal(f.events.filter((event) => event === 'destroy').length, 1);
  f.finishStartup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.received, []);
});

test('failed cancellation retains a durable fence and alarm for recovery after eviction', async () => {
  const f = fixture({ pendingExec: true, failCleanup: true });
  const job = new ContainerEvaluationJob(f.context);
  assert.equal(typeof job.cancel, 'function');
  const rejected = assert.rejects(job.run(input, controls), code('CLEANUP_FAILED'));
  while (!f.events.includes('exec')) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(job.cancel(), code('CLEANUP_FAILED'));
  await rejected;
  assert.equal(f.values.get('job').state, 'running');
  assert.equal(f.values.get('job').cancelled, true);
  assert.ok(Number.isSafeInteger(f.alarmAt));
  f.repairCleanup();
  await new ContainerEvaluationJob(f.context).alarm();
  assert.equal(f.values.get('job').state, 'finished');
  assert.equal(f.values.get('job').outcome, 'CANCELLED');
  assert.equal(f.context.container.running, false);
  assert.equal(f.alarmAt, undefined);
  await assert.rejects(
    new ContainerEvaluationJob(f.context).run(input, controls),
    code('JOB_ALREADY_USED'),
  );
});

test('repeated cancellation preserves completed work and never restarts or destroys it again', async () => {
  const f = fixture();
  const job = new ContainerEvaluationJob(f.context);
  assert.equal(typeof job.cancel, 'function');
  await job.run(input, controls);
  const previous = structuredClone(f.values.get('job'));
  await Promise.all([job.cancel(), job.cancel()]);
  await new ContainerEvaluationJob(f.context).cancel();
  assert.deepEqual(f.values.get('job'), previous);
  assert.equal(f.events.filter((event) => event === 'start').length, 1);
  assert.equal(f.events.filter((event) => event === 'destroy').length, 1);
});
