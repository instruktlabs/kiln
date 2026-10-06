import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runResilienceOnce,
  resilienceCases,
  observeResilience,
  checkResilienceResult,
  ResilienceExecution,
  resilienceImage;
before(async () => {
  for (const module of [
    'resilience-run',
    'resilience-observation',
    'resilience-result',
    'resilience-execution',
  ]) {
    const output = new URL(`../../.cache/resilience-test/${module}.mjs`, import.meta.url);
    await build({
      entryPoints: [fileURLToPath(new URL(`../probe/${module}.ts`, import.meta.url))],
      outfile: fileURLToPath(output),
      bundle: true,
      format: 'esm',
      platform: 'node',
    });
    const value = await import(output);
    if (module === 'resilience-run') ({ runResilienceOnce, resilienceCases } = value);
    if (module === 'resilience-observation') ({ observeResilience } = value);
    if (module === 'resilience-result') ({ checkResilienceResult } = value);
    if (module === 'resilience-execution') ({ ResilienceExecution, resilienceImage } = value);
  }
});

function runningFixture() {
  const store = storage();
  let alarmAt;
  store.setAlarm = async (time) => {
    alarmAt = time;
  };
  store.deleteAlarm = async () => {
    alarmAt = undefined;
  };
  let exited, stopped, stdout;
  const monitor = new Promise((resolve) => {
    stopped = resolve;
  });
  const exitCode = new Promise((resolve) => {
    exited = resolve;
  });
  const calls = [];
  const container = {
    images: { kiln: resilienceImage },
    running: false,
    start() {
      calls.push('start');
      this.running = true;
    },
    async setInactivityTimeout() {},
    monitor() {
      return monitor;
    },
    async inspect() {
      return this.running ? { image: resilienceImage } : null;
    },
    async exec() {
      calls.push('exec');
      return {
        stdin: new WritableStream({
          write() {
            calls.push('input');
          },
        }),
        stdout: new ReadableStream({
          start(c) {
            stdout = c;
            c.enqueue(new TextEncoder().encode('KILN_PROBE_READY\n'));
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exitCode,
      };
    },
    async destroy() {
      calls.push('destroy');
      this.running = false;
      stdout?.close();
      exited(0);
      stopped();
    },
  };
  return { context: { container, storage: store }, calls, alarmAt: () => alarmAt };
}

test('native cancellation begins after readiness, destroys once and retains the outcome', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const f = runningFixture();
  const execution = new ResilienceExecution(f.context);
  const pending = execution.run('native-cancel');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.calls.includes('input'));
  assert.equal(f.calls.includes('destroy'), false);
  t.mock.timers.tick(251);
  const result = await pending;
  assert.equal(result.passed, true);
  assert.equal(result.reason, 'CANCELLED');
  assert.equal(result.ready, true);
  assert.equal(result.stopped, true);
  assert.deepEqual(await execution.run('native-cancel'), result);
  assert.equal(f.calls.filter((c) => c === 'start').length, 1);
  assert.equal(f.calls.filter((c) => c === 'destroy').length, 1);
  assert.equal(f.alarmAt(), undefined);
});

test('recovery requires the durable deadline callback; a new controller cannot reexecute the claim', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 2_000_000 });
  const f = runningFixture();
  const pending = new ResilienceExecution(f.context).run('alarm-recovery');
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(251);
  const waiting = await pending;
  assert.equal(waiting.pendingAlarm, true);
  assert.equal(waiting.passed, false);
  assert.equal(f.context.container.running, true);
  const restarted = new ResilienceExecution(f.context);
  assert.deepEqual(await restarted.run('alarm-recovery'), waiting);
  await restarted.alarm();
  assert.equal((await restarted.read()).passed, false);
  assert.equal(f.context.container.running, true);
  t.mock.timers.tick(15_000);
  await restarted.alarm();
  const recovered = await restarted.read();
  assert.equal(recovered.passed, true);
  assert.equal(recovered.reason, 'ALARM_RECOVERED');
  assert.equal(recovered.stopped, true);
  assert.equal(recovered.pendingAlarm, false);
  assert.equal(f.alarmAt(), undefined);
  assert.equal(f.calls.filter((c) => c === 'start').length, 1);
});

test('operator teardown after missing alarm never converts failure to a qualification pass', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 3_000_000 });
  const f = runningFixture();
  const execution = new ResilienceExecution(f.context);
  const pending = execution.run('alarm-recovery');
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(251);
  await pending;
  const stopped = await execution.stopUnconfirmed();
  assert.equal(stopped.passed, false);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.reason, 'ALARM_NOT_OBSERVED');
  t.mock.timers.tick(15_000);
  // A later real alarm can finish cleanup, but cannot overwrite the failed proof.
  f.context.container.destroy = async () => {
    f.context.container.running = false;
  };
  await execution.alarm();
  assert.deepEqual(await execution.read(), stopped);
});

function storage() {
  const records = new Map();
  let tail = Promise.resolve();
  const result = {
    async get(key) {
      return structuredClone(records.get(key));
    },
    async put(key, value) {
      records.set(key, structuredClone(value));
    },
    transaction(fn) {
      const next = tail.then(() => fn(result));
      tail = next.catch(() => {});
      return next;
    },
  };
  return result;
}

test('resilience allowance is fixed, claimed once and sequential even under concurrent invocations', async () => {
  const store = storage();
  const calls = [];
  let active = 0;
  const execute = async (name) => {
    assert.equal(active++, 0);
    calls.push(name);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return { name, passed: true, stopped: true };
  };
  await Promise.all([runResilienceOnce(store, execute), runResilienceOnce(store, execute)]);
  const retained = await runResilienceOnce(store, execute);
  assert.deepEqual(resilienceCases, [
    'cpu-preview',
    'software-views',
    'network',
    'write-marker',
    'read-marker',
    'native-deadline',
    'native-cancel',
    'stdout-flood',
    'stderr-flood',
    'memory-limit',
    'alarm-recovery',
    'engine-after',
  ]);
  assert.deepEqual(calls, resilienceCases);
  assert.equal(retained.state, 'finished');
  assert.equal(retained.results.length, 12);
});

test('failure or interruption never authorizes another batch or exposes arbitrary errors', async () => {
  const store = storage();
  let calls = 0;
  const execute = async () => {
    calls++;
    throw new Error('PRIVATE_DIAGNOSTIC');
  };
  const record = await runResilienceOnce(store, execute);
  assert.deepEqual(record.results, [
    { name: 'cpu-preview', passed: false, reason: 'PROBE_FAILED' },
  ]);
  assert.deepEqual(await runResilienceOnce(store, execute), record);
  assert.equal(calls, 1);
  const interrupted = storage();
  await interrupted.put('run', { state: 'running', results: [] });
  await runResilienceOnce(interrupted, execute);
  assert.equal(calls, 1);
});

test('readiness observes split fixed prefix, preserves bytes and never mistakes partial output for readiness', async () => {
  let ready = 0;
  let received;
  const actual = {
    async exec(command, options) {
      received = { command, options };
      return {
        stdin: null,
        stderr: null,
        stdout: new ReadableStream({
          start(c) {
            for (const chunk of ['KILN_', 'PROBE_READY\n', 'body'])
              c.enqueue(new TextEncoder().encode(chunk));
            c.close();
          },
        }),
        exitCode: Promise.resolve(0),
      };
    },
  };
  const observer = observeResilience(actual, 'fixed script', () => {
    ready++;
  });
  const process = await observer.container.exec(['original'], { user: '1000:1000' });
  assert.equal(await new Response(process.stdout).text(), 'KILN_PROBE_READY\nbody');
  assert.equal(ready, 1);
  assert.equal(observer.ready(), true);
  assert.deepEqual(received.command, [
    '/usr/local/bin/node',
    '--input-type=module',
    '-e',
    'fixed script',
  ]);
  assert.equal(received.options.user, '1000:1000');
  assert.equal(observer.exitCode(), 0);
  const partial = observeResilience(
    {
      async exec() {
        return {
          stdout: new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('KILN_PROBE_'));
              c.close();
            },
          }),
          exitCode: Promise.resolve(0),
        };
      },
    },
    'fixed',
    () => {
      assert.fail('partial prefix');
    },
  );
  await new Response((await partial.container.exec([])).stdout).text();
  assert.equal(partial.ready(), false);
});

test('destruction fault injection is probe-only and fails once without swallowing subsequent cleanup', async () => {
  let destroyed = 0;
  const observer = observeResilience(
    {
      async destroy() {
        destroyed++;
      },
    },
    'fixed',
    () => {},
    true,
  );
  await assert.rejects(observer.container.destroy());
  assert.equal(destroyed, 0);
  await observer.container.destroy();
  assert.equal(destroyed, 1);
});

test('failure qualification requires the exact failure, real native readiness and confirmed destruction', async () => {
  const base = { name: 'native-cancel', reason: 'CANCELLED', ready: true, stopped: true };
  assert.equal((await checkResilienceResult(base)).passed, true);
  for (const change of [{ reason: 'WORKER_FAILED' }, { ready: false }, { stopped: false }]) {
    assert.equal((await checkResilienceResult({ ...base, ...change })).passed, false);
  }
  assert.equal(
    (
      await checkResilienceResult({
        name: 'engine-after',
        stopped: true,
        output: new TextEncoder().encode('{"ok":true}'),
      })
    ).passed,
    false,
  );
  assert.equal(
    (
      await checkResilienceResult({
        name: 'memory-limit',
        stopped: true,
        output: new TextEncoder().encode('{"ok":true,"oomKills":0}'),
      })
    ).passed,
    false,
  );
});

test('software proof rejects a truncated PNG even when reported colour counts look valid', async () => {
  const png = Buffer.alloc(24);
  png.set([137, 80, 78, 71]);
  png.writeUInt32BE(128, 16);
  png.writeUInt32BE(128, 20);
  const views = ['neutral', 'dark', 'light'].flatMap((backdrop) =>
    [0, 1].map((index) => ({
      backdrop,
      index,
      red: 100,
      green: 100,
      pngBase64: png.toString('base64'),
    })),
  );
  const output = new TextEncoder().encode(JSON.stringify({ ok: true, software: true, views }));
  assert.equal(
    (await checkResilienceResult({ name: 'software-views', stopped: true, output })).passed,
    false,
  );
});

test('the resilience candidate has no public entry or trigger and pins the stable software image', async () => {
  const config = JSON.parse(
    await readFile(new URL('../probe/resilience.wrangler.jsonc', import.meta.url), 'utf8'),
  );
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.triggers, undefined);
  assert.equal(config.main, './resilience-worker.ts');
  assert.equal(config.containers.length, 1);
  assert.equal(config.containers[0].scheduling_policy, 'durable_object');
  assert.equal(config.containers[0].class_name, 'KilnResilienceJob');
  assert.equal(config.containers[0].images.kiln.image, resilienceImage);
  assert.equal(config.containers[0].observability.logs.enabled, false);
  assert.deepEqual(config.exports, {
    KilnResilienceControl: { type: 'worker' },
    KilnResilienceRun: { type: 'durable-object', storage: 'sqlite' },
    KilnResilienceJob: { type: 'durable-object', storage: 'sqlite' },
  });
});

test('unknown cases and wrong images are rejected before a native job can start', async () => {
  const f = runningFixture();
  const execution = new ResilienceExecution(f.context);
  await assert.rejects(execution.run('arbitrary-code'));
  f.context.container.images.kiln = 'wrong';
  assert.deepEqual(await execution.run('cpu-preview'), {
    name: 'cpu-preview',
    passed: false,
    reason: 'IMAGE_UNAVAILABLE',
  });
  assert.deepEqual(f.calls, []);
  assert.equal(await f.context.storage.get('probe'), undefined);
});

test('real Worker RPC admits only the fixed retained batch and denies HTTP execution', async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../probe/resilience-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'private-resilience',
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          compatibilityFlags: ['enable_ctx_exports'],
          durableObjects: {
            RUN: { className: 'KilnResilienceRun', useSQLite: true },
            JOB: { className: 'KilnResilienceJob', useSQLite: true },
          },
          outboundService: async () => {
            throw new Error('No network');
          },
        },
        {
          name: 'operator',
          modules: true,
          compatibilityDate: '2026-10-06',
          serviceBindings: {
            PROBE: { name: 'private-resilience', entrypoint: 'KilnResilienceControl' },
          },
          script: `export default { async fetch(request,env){if(new URL(request.url).pathname==='/denied')return env.PROBE.fetch(request);return Response.json(await env.PROBE.runFixed({code:'arbitrary source is ignored'}));} }`,
        },
      ],
    }),
  );
  try {
    const worker = await runtime.getWorker('private-resilience');
    const operator = await runtime.getWorker('operator');
    assert.equal(
      (await worker.fetch('http://localhost/execute', { method: 'POST', body: '{}' })).status,
      404,
    );
    assert.equal(
      (await operator.fetch('http://localhost/denied', { method: 'POST', body: '{}' })).status,
      404,
    );
    const first = await (await operator.fetch('http://localhost/run')).json();
    assert.deepEqual(first, {
      state: 'finished',
      results: [{ name: 'cpu-preview', passed: false, reason: 'CONTAINER_UNAVAILABLE' }],
    });
    assert.deepEqual(await (await operator.fetch('http://localhost/run')).json(), first);
  } finally {
    await runtime.dispose();
  }
});
