import { expect, test } from 'bun:test';
import { captureCgroupSnapshot, qualifyNativeRuntime } from './native-qualification.mjs';

test('cgroup evidence retains dotted kernel counters from the Linux preflight', async () => {
  const cpu =
    'usage_usec 58167\nuser_usec 41686\nsystem_usec 16480\ncore_sched.force_idle_usec 0\n';
  const snapshot = await captureCgroupSnapshot(async (path) =>
    path.endsWith('cpu.stat') ? cpu : '6442450944\n',
  );
  expect(snapshot['cpu.stat']).toBe(cpu.trim());
  expect(snapshot['memory.max']).toBe('6442450944');
});

test('cgroup evidence bounds malformed values and tolerates unavailable counters', async () => {
  const snapshot = await captureCgroupSnapshot(async (path) => {
    if (path.endsWith('memory.current')) return '9'.repeat(2048);
    if (path.endsWith('memory.peak')) throw new Error('not exposed');
    if (path.endsWith('cpu.stat')) return 'usage_usec 1\u0000';
    return 'max\n';
  });
  expect(snapshot).toEqual({ 'memory.max': 'max' });
});

const checks = [
  'user-namespace',
  'no-new-privileges',
  'capabilities-empty',
  'environment-exact',
  'product-filesystem-denied',
  'host-filesystem-denied',
  'runtime-filesystem-read-only',
  'network-namespace-empty',
  'metadata-and-local-network-denied',
  'generated-capabilities-denied',
];
const glb = Buffer.from('glTFfixture');
function fixture() {
  const calls = [];
  const ports = {
    platform: 'linux',
    uid: 1000,
    ready: async () => ({
      version: 'kiln.evaluator.isolation-readiness.v1',
      mode: 'isolated',
      checks,
    }),
    readinessCode: (error) => error.readinessCode,
    render: async (_code, controls) => {
      calls.push(controls);
      if (controls.signal) {
        return await new Promise((_, reject) =>
          controls.signal.addEventListener('abort', () => reject({ code: 'CANCELLED' }), {
            once: true,
          }),
        );
      }
      if (controls.deadlineMs === 100) throw { code: 'DEADLINE_EXCEEDED' };
      if (controls.maxGlbBytes === 32) throw { code: 'OUTPUT_LIMIT_EXCEEDED' };
      return { glb };
    },
    cpu: async () => ({ png: Buffer.from('pngfixture'), width: 128, height: 128 }),
    inspectPng: () => ({ width: 128, height: 128, distinctPixels: 12 }),
    artifact: async () => {},
    software: async () => ({ status: 'passed', software: true, rendererId: 'test-software' }),
  };
  return { ports, calls };
}

test('non-Linux and root hosts cannot attempt evaluation', async () => {
  for (const override of [{ platform: 'win32' }, { uid: 0 }]) {
    const { ports, calls } = fixture();
    const result = await qualifyNativeRuntime({ ...ports, ...override });
    expect(result).toMatchObject({
      status: 'failed',
      failure: { phase: 'host', code: 'UNSUPPORTED_HOST' },
    });
    expect(calls).toHaveLength(0);
  }
});

test('failed readiness stops before source execution without exposing diagnostics', async () => {
  const { ports, calls } = fixture();
  ports.ready = async () => {
    throw { readinessCode: 'fd3-transport', message: 'private-token-value' };
  };
  const result = await qualifyNativeRuntime(ports);
  expect(result).toMatchObject({
    status: 'failed',
    failure: { phase: 'isolation', code: 'fd3-transport' },
  });
  expect(JSON.stringify(result)).not.toContain('private-token-value');
  expect(calls).toHaveLength(0);
});

test('partial and duplicated readiness assertions do not qualify the boundary', async () => {
  for (const invalid of [checks.slice(1), [...checks.slice(1), checks[1]]]) {
    const { ports, calls } = fixture();
    ports.ready = async () => ({
      version: 'kiln.evaluator.isolation-readiness.v1',
      mode: 'isolated',
      checks: invalid,
    });
    expect(await qualifyNativeRuntime(ports)).toMatchObject({
      status: 'failed',
      failure: { phase: 'isolation', code: 'CHECK_FAILED' },
    });
    expect(calls).toHaveLength(0);
  }
});

test('successful qualification retains bounded artifacts and separate safety checks', async () => {
  const { ports, calls } = fixture();
  const result = await qualifyNativeRuntime(ports);
  expect(result.status).toBe('passed');
  expect(result.checks.map((item) => item.name)).toEqual([
    'host',
    'isolation',
    'first-evaluation',
    'repeat-evaluation',
    'cpu-preview',
    'deadline',
    'cancellation',
    'output-limit',
    'post-limit-recovery',
    'software-vulkan',
  ]);
  expect(result.artifacts.map((item) => item.name)).toEqual(['fixture.glb', 'cpu-preview.png']);
  expect(result.artifacts[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    result.checks.every((item) => Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0),
  ).toBe(true);
  expect(calls.every((item) => item.deadlineMs <= 30000 && item.maxResponseBytes <= 4194304)).toBe(
    true,
  );
});

test('a deadline check that resolves instead of rejecting is a failure', async () => {
  const { ports } = fixture();
  ports.render = async () => ({ glb });
  expect(await qualifyNativeRuntime(ports)).toMatchObject({
    status: 'failed',
    failure: { phase: 'deadline', code: 'CHECK_FAILED' },
  });
});

test('wrong negative outcome is not accepted as a successful limit', async () => {
  const { ports } = fixture();
  const original = ports.render;
  ports.render = async (source, controls) => {
    if (controls.deadlineMs === 100) throw { code: 'EXECUTION_REJECTED' };
    return original(source, controls);
  };
  expect(await qualifyNativeRuntime(ports)).toMatchObject({
    status: 'failed',
    failure: { phase: 'deadline', code: 'EXECUTION_REJECTED' },
  });
});

test('hardware or missing renderer proof cannot qualify software rendering', async () => {
  for (const response of [
    { status: 'passed', software: false },
    { status: 'failed', software: true },
  ]) {
    const { ports } = fixture();
    ports.software = async () => response;
    expect(await qualifyNativeRuntime(ports)).toMatchObject({
      status: 'failed',
      failure: { phase: 'software-vulkan', code: 'CHECK_FAILED' },
    });
  }
});

test('malformed GLBs and blank CPU previews fail before safety/renderer qualification', async () => {
  const { ports } = fixture();
  ports.render = async () => ({ glb: Buffer.from('wrong') });
  expect(await qualifyNativeRuntime(ports)).toMatchObject({
    status: 'failed',
    failure: { phase: 'first-evaluation', code: 'CHECK_FAILED' },
  });
  const other = fixture().ports;
  other.inspectPng = () => ({ width: 128, height: 128, distinctPixels: 1 });
  expect(await qualifyNativeRuntime(other)).toMatchObject({
    status: 'failed',
    failure: { phase: 'cpu-preview', code: 'CHECK_FAILED' },
  });
});
