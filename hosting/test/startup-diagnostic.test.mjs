import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let ManagedStartupDiagnostic;
before(async () => {
  const output = new URL('../../.cache/startup-diagnostic-test/diagnostic.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../probe/startup-diagnostic.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ ManagedStartupDiagnostic } = await import(output));
});

function fixture(options = {}) {
  const records = new Map();
  const calls = [];
  let tail = Promise.resolve();
  let alarmAt;
  let cleanupFails = options.cleanupFails ?? false;
  let finishMonitor;
  let failMonitor;
  const monitor = new Promise((resolve, reject) => {
    finishMonitor = resolve;
    failMonitor = reject;
  });
  const output = new TextEncoder().encode(
    options.output ?? JSON.stringify({ version: 'v24.20.0', uid: 0, gid: 0 }),
  );
  const stream = (bytes) =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  const container = {
    images: options.images ?? {},
    running: false,
    start(settings) {
      calls.push('start');
      this.settings = settings;
      this.running = true;
      if (options.startFails) throw new Error('private startup details');
    },
    monitor() {
      calls.push('monitor');
      if (options.monitorThrows) throw new Error('private synchronous monitor details');
      return monitor;
    },
    async setInactivityTimeout(ms) {
      calls.push('inactivity');
      this.inactivity = ms;
    },
    async exec(command, settings) {
      calls.push('exec');
      this.command = command;
      this.execSettings = settings;
      if (options.monitorFails) {
        failMonitor(new Error('private monitor details'));
        return new Promise(() => {});
      }
      if (options.execFails) throw new Error('private exec details');
      if (options.hang) return new Promise(() => {});
      return {
        stdout: stream(output),
        stderr: stream(new TextEncoder().encode(options.stderr ?? '')),
        exitCode: Promise.resolve(options.exitCode ?? 0),
      };
    },
    async inspect() {
      calls.push('inspect');
      if (!this.running) return null;
      return { image: options.image ?? this.settings.image };
    },
    async destroy() {
      calls.push('destroy');
      if (options.cleanupHangs) return new Promise(() => {});
      if (cleanupFails) throw new Error('private cleanup details');
      this.running = false;
      if (options.cleanupMonitorFails) failMonitor(new Error('private teardown details'));
      else finishMonitor();
    },
  };
  const storage = {
    async get(key) {
      return structuredClone(records.get(key));
    },
    async put(key, value) {
      records.set(key, structuredClone(value));
    },
    async setAlarm(value) {
      alarmAt = Number(value);
      calls.push('alarm');
    },
    async deleteAlarm() {
      alarmAt = undefined;
    },
    transaction(callback) {
      const operation = tail.then(() => callback(storage));
      tail = operation.catch(() => {});
      return operation;
    },
  };
  return {
    context: { container: options.absent ? undefined : container, storage },
    records,
    calls,
    container,
    get alarmAt() {
      return alarmAt;
    },
    repairCleanup() {
      cleanupFails = false;
    },
  };
}

test('managed control runs one fixed command offline and retains phase and destruction evidence', async () => {
  const f = fixture();
  const probe = new ManagedStartupDiagnostic(f.context);
  const result = await probe.run();
  assert.equal(result.passed, true);
  assert.equal(result.state, 'finished');
  assert.equal(result.stopped, true);
  assert.deepEqual(result.runtime, { version: 'v24.20.0', uid: 0, gid: 0 });
  assert.equal(f.container.settings.image, 'cloudflare/debian-trixie');
  assert.equal(f.container.settings.enableInternet, false);
  assert.equal(f.container.settings.instance, 'standard-2');
  assert.deepEqual(f.container.settings.entrypoint, ['sleep', 'infinity']);
  assert.deepEqual(f.container.command.slice(0, 2), ['/usr/local/bin/node', '--eval']);
  assert.equal(f.container.command.join(' ').includes('kiln'), false);
  assert.equal(f.calls.indexOf('alarm') < f.calls.indexOf('start'), true);
  assert.equal(f.container.running, false);
  assert.equal(f.alarmAt, undefined);
  for (const operation of ['start', 'exec', 'inspect', 'output', 'destroy', 'stopped']) {
    assert.ok(result.phases.some((p) => p.operation === operation && p.event === 'completed'));
  }
  assert.deepEqual(await probe.run(), result);
  assert.equal(f.calls.filter((x) => x === 'start').length, 1);
});

test('concurrent invocations cannot start another instance or change the fixed command', async () => {
  const f = fixture();
  await Promise.all([
    new ManagedStartupDiagnostic(f.context).run('untrusted command'),
    new ManagedStartupDiagnostic(f.context).run('new id'),
  ]);
  assert.equal(f.calls.filter((x) => x === 'start').length, 1);
  assert.equal(f.container.command.join(' ').includes('untrusted'), false);
});

test('missing binding and provider failure produce bounded metadata without private error text', async () => {
  for (const options of [
    { absent: true },
    { startFails: true },
    { execFails: true },
    { monitorFails: true },
    { monitorThrows: true },
  ]) {
    const f = fixture(options);
    const result = await new ManagedStartupDiagnostic(f.context).run();
    assert.equal(result.state, 'finished');
    assert.equal(result.passed, false);
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(result.stopped, true);
    if (options.execFails) assert.equal(result.reason, 'EXEC_FAILED');
    if (options.monitorFails || options.monitorThrows) {
      assert.equal(result.reason, 'MONITOR_FAILED');
      assert.ok(
        result.phases.some(
          (p) => p.operation === 'monitor' && p.event === 'failed' && !p.duringCleanup,
        ),
      );
    }
  }
});

test('a monitor rejection caused by destruction is marked as cleanup, not startup failure', async () => {
  const f = fixture({ cleanupMonitorFails: true });
  const result = await new ManagedStartupDiagnostic(f.context).run();
  assert.equal(result.passed, true);
  assert.ok(
    result.phases.some((p) => p.operation === 'monitor' && p.event === 'failed' && p.duringCleanup),
  );
});

test('unexpected identity, process failure and output floods fail without retaining process output', async () => {
  for (const options of [
    { image: 'other-image' },
    { output: 'private process output' },
    { output: 'x'.repeat(1025) },
    { stderr: 'private stderr' },
    { exitCode: 2 },
    { output: JSON.stringify({ version: 'v22.23.3', uid: 0, gid: 0 }) },
  ]) {
    const f = fixture(options);
    const result = await new ManagedStartupDiagnostic(f.context).run();
    assert.equal(result.passed, false);
    assert.equal(result.stopped, true);
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(f.container.running, false);
  }
});

test('failed cleanup retains a durable recovery alarm and never retries execution', async () => {
  const f = fixture({ cleanupFails: true });
  const result = await new ManagedStartupDiagnostic(f.context).run();
  assert.equal(result.passed, false);
  assert.equal(result.stopped, false);
  assert.equal(result.cleanupRequired, true);
  assert.ok(f.alarmAt > Date.now());
  f.repairCleanup();
  await new ManagedStartupDiagnostic(f.context).alarm();
  const recovered = await new ManagedStartupDiagnostic(f.context).run();
  assert.equal(recovered.passed, false);
  assert.equal(recovered.stopped, true);
  assert.equal(recovered.cleanupRequired, false);
  assert.equal(f.alarmAt, undefined);
  assert.equal(f.calls.filter((x) => x === 'start').length, 1);
});

test('deadline stops a hung command and a fresh controller can clean an interrupted claim', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const f = fixture({ hang: true });
  const pending = new ManagedStartupDiagnostic(f.context).run();
  while (!f.calls.includes('exec')) await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(60_001);
  const result = await pending;
  assert.equal(result.reason, 'DEADLINE_EXCEEDED');
  assert.equal(result.stopped, true);
  assert.equal(f.container.running, false);

  const interrupted = fixture();
  interrupted.container.running = true;
  await interrupted.context.storage.put('startup', {
    state: 'running',
    passed: false,
    claimedAt: 1_000_000,
    deadlineAt: 1_060_000,
    phases: [],
    cleanupRequired: true,
    stopped: false,
  });
  await new ManagedStartupDiagnostic(interrupted.context).alarm();
  const retained = await new ManagedStartupDiagnostic(interrupted.context).run();
  assert.equal(retained.reason, 'DEADLINE_EXCEEDED');
  assert.equal(retained.stopped, true);
  assert.equal(interrupted.calls.includes('exec'), false);
});

test('cleanup itself is bounded and preserves recovery without granting a second invocation', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 2_000_000 });
  const f = fixture({ cleanupHangs: true });
  const pending = new ManagedStartupDiagnostic(f.context).run();
  while (!f.calls.includes('destroy')) await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(5_001);
  const result = await pending;
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'CLEANUP_FAILED');
  assert.equal(result.cleanupRequired, true);
  assert.equal(result.stopped, false);
  assert.equal(f.alarmAt, Date.now() + 30_000);
  assert.deepEqual(await new ManagedStartupDiagnostic(f.context).run(), result);
  assert.equal(f.calls.filter((x) => x === 'start').length, 1);
});

test('configured control uses only a pinned Cloudflare image from its host binding', async () => {
  const image = `registry.cloudflare.com/${'a'.repeat(32)}/kiln-startup-control@sha256:${'b'.repeat(64)}`;
  const f = fixture({ images: { control: image } });
  const result = await new ManagedStartupDiagnostic(f.context, 'configured').run();
  assert.equal(result.passed, true);
  assert.equal(f.container.settings.image, image);
  assert.equal(f.container.settings.enableInternet, false);
  for (const invalid of [
    undefined,
    '',
    'cloudflare/debian-trixie',
    'node:24.20.0-trixie-slim',
    image.replace(/@sha256:.*/, ':latest'),
  ]) {
    const denied = fixture({ images: { control: invalid } });
    const failed = await new ManagedStartupDiagnostic(denied.context, 'configured').run();
    assert.equal(failed.reason, 'IMAGE_UNAVAILABLE');
    assert.equal(failed.passed, false);
    assert.equal(denied.calls.includes('start'), false);
    assert.equal(denied.calls.includes('exec'), false);
  }
});

test('configured control verifies the running image independently of the selected reference', async () => {
  const image = `registry.cloudflare.com/${'a'.repeat(32)}/kiln-startup-control@sha256:${'b'.repeat(64)}`;
  const f = fixture({ images: { control: image }, image: 'cloudflare/debian-trixie' });
  const result = await new ManagedStartupDiagnostic(f.context, 'configured').run();
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'INSPECT_FAILED');
  assert.equal(result.stopped, true);
});

test('Kiln-image control selects its exact original image and numeric identity without importing Kiln', async () => {
  const image =
    'registry.cloudflare.com/56adffd40534f7fe110fc661a40bbf53/kiln-evaluation@sha256:69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a';
  const output = JSON.stringify({ version: 'v22.23.3', uid: 1000, gid: 1000 });
  const f = fixture({ images: { control: image }, output });
  const result = await new ManagedStartupDiagnostic(f.context, 'kiln').run();
  assert.equal(result.passed, true);
  assert.equal(f.container.settings.image, image);
  assert.equal(f.container.execSettings.user, '1000:1000');
  assert.deepEqual(f.container.command, [
    '/usr/local/bin/node',
    '--eval',
    'process.stdout.write(JSON.stringify({version:process.version,uid:process.getuid(),gid:process.getgid()}))',
  ]);
  for (const runtime of [
    { version: 'v24.20.0', uid: 1000, gid: 1000 },
    { version: 'v22.23.3', uid: 0, gid: 0 },
  ]) {
    const mismatch = fixture({ images: { control: image }, output: JSON.stringify(runtime) });
    assert.equal(
      (await new ManagedStartupDiagnostic(mismatch.context, 'kiln').run()).reason,
      'OUTPUT_FAILED',
    );
  }
  const substituted = fixture({
    images: { control: image.replace('69aff70b', 'ffffffff') },
    output,
  });
  assert.equal(
    (await new ManagedStartupDiagnostic(substituted.context, 'kiln').run()).reason,
    'IMAGE_UNAVAILABLE',
  );
  assert.equal(substituted.calls.includes('start'), false);
});

test('Kiln platform-manifest control preserves runtime identity and rejects the original index', async () => {
  const image =
    'registry.cloudflare.com/56adffd40534f7fe110fc661a40bbf53/kiln-evaluation@sha256:db79551579a9abd33f7589a4da4d57947364ddf3dd37b79f766e202f2703edc8';
  const output = JSON.stringify({ version: 'v22.23.3', uid: 1000, gid: 1000 });
  const f = fixture({ images: { control: image }, output });
  const diagnostic = new ManagedStartupDiagnostic(f.context, 'kiln-manifest');
  const result = await diagnostic.run();
  assert.equal(result.passed, true);
  assert.equal(result.stopped, true);
  assert.equal(f.container.settings.image, image);
  assert.equal(f.container.execSettings.user, '1000:1000');
  assert.equal(f.container.settings.enableInternet, false);
  assert.deepEqual(await diagnostic.run(), result);
  assert.equal(f.calls.filter((call) => call === 'start').length, 1);
  for (const digest of [
    '69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a',
    'a'.repeat(64),
  ]) {
    const mismatch = fixture({
      images: { control: image.replace(/sha256:.*/, `sha256:${digest}`) },
      output,
    });
    assert.equal(
      (await new ManagedStartupDiagnostic(mismatch.context, 'kiln-manifest').run()).reason,
      'IMAGE_UNAVAILABLE',
    );
    assert.equal(mismatch.calls.includes('start'), false);
  }
  for (const runtime of [
    { version: 'v24.20.0', uid: 1000, gid: 1000 },
    { version: 'v22.23.3', uid: 0, gid: 0 },
  ]) {
    const mismatch = fixture({ images: { control: image }, output: JSON.stringify(runtime) });
    assert.equal(
      (await new ManagedStartupDiagnostic(mismatch.context, 'kiln-manifest').run()).reason,
      'OUTPUT_FAILED',
    );
  }
});

for (const [entryFile, className, entrypoint] of [
  ['startup-worker.ts', 'KilnManagedStartupJob', 'KilnStartupControl'],
  ['custom-startup-worker.ts', 'KilnCustomStartupJob', 'KilnCustomStartupControl'],
  ['kiln-startup-worker.ts', 'KilnImageStartupJob', 'KilnImageStartupControl'],
  ['manifest-startup-worker.ts', 'KilnManifestStartupJob', 'KilnManifestStartupControl'],
]) {
  test(`${entryFile} uses its private binding, denies HTTP and retains a missing-container result`, async () => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL(`../probe/${entryFile}`, import.meta.url))],
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
            name: 'diagnostic',
            modules: true,
            script: bundle.outputFiles[0].text,
            compatibilityDate: '2026-10-06',
            durableObjects: { STARTUP_JOB: { className, useSQLite: true } },
          },
          {
            name: 'operator',
            modules: true,
            compatibilityDate: '2026-10-06',
            serviceBindings: { DIAGNOSTIC: { name: 'diagnostic', entrypoint } },
            script: `export default {
          async fetch(request, env) {
            if (new URL(request.url).pathname === '/denied') return env.DIAGNOSTIC.fetch(request);
            return Response.json(await env.DIAGNOSTIC.runFixed());
          }
        }`,
          },
        ],
      }),
    );
    try {
      const diagnostic = await runtime.getWorker('diagnostic');
      assert.equal(
        (await diagnostic.fetch('http://localhost/run-fixed', { method: 'POST', body: '{}' }))
          .status,
        404,
      );
      const operator = await runtime.getWorker('operator');
      assert.equal((await operator.fetch('http://localhost/denied')).status, 404);
      const first = await (await operator.fetch('http://localhost/run')).json();
      assert.equal(first.passed, false);
      assert.equal(first.reason, 'ISOLATION_UNAVAILABLE');
      assert.equal(first.stopped, true);
      assert.deepEqual(await (await operator.fetch('http://localhost/run')).json(), first);
    } finally {
      await runtime.dispose();
    }
  });
}
