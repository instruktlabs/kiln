import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const READINESS = [
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
const FAILURE_CODES = new Set([
  'UNSUPPORTED_HOST',
  'ISOLATION_UNAVAILABLE',
  'INPUT_INVALID',
  'EXECUTION_REJECTED',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'OUTPUT_LIMIT_EXCEEDED',
  'wrapper-launch',
  'fd3-transport',
  'loader-probe-boot',
  'invariant-namespace',
  'invariant-environment',
  'invariant-filesystem',
  'invariant-network',
  'invariant-generated-policy',
  'deadline',
]);
const BOX = `function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}`;
const NEVER = `async function build(){await new Promise(() => {});}`;
const LIMITS = {
  deadlineMs: 30000,
  maxGlbBytes: 2 * 1024 * 1024,
  maxResponseBytes: 4 * 1024 * 1024,
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function qualifyNestedEvaluator(ports) {
  return qualifyRuntime(ports, false);
}

export async function captureCgroupSnapshot(readText) {
  const snapshot = {};
  for (const name of ['memory.current', 'memory.peak', 'memory.max', 'cpu.stat']) {
    try {
      const value = await readText(`/sys/fs/cgroup/${name}`, 'utf8');
      // Kernel counter names include dots, e.g. core_sched.force_idle_usec.
      if (value.length < 2048 && /^[a-z0-9_.\s]+$/.test(value)) snapshot[name] = value.trim();
    } catch {
      /* Not all providers expose a readable cgroup v2 mount. */
    }
  }
  return snapshot;
}

/** Fixed qualification fixtures only. No caller-supplied source and no fallback evaluator. */
export async function qualifyNativeRuntime(ports) {
  return qualifyRuntime(ports, true);
}

async function qualifyRuntime(ports, includeSoftware) {
  const receipt = {
    version: includeSoftware
      ? 'kiln.host-native-qualification.v1'
      : 'kiln.nested-evaluator-qualification.v1',
    status: 'running',
    checks: [],
    artifacts: [],
  };
  let phase = 'host';
  async function check(name, run) {
    phase = name;
    const start = performance.now();
    const result = await run();
    receipt.checks.push({ name, elapsedMs: performance.now() - start });
    return result;
  }
  async function artifact(name, bytes) {
    await ports.artifact(name, bytes);
    receipt.artifacts.push({ name, bytes: bytes.length, sha256: sha(bytes) });
  }
  async function render() {
    const result = await ports.render(BOX, { ...LIMITS });
    assert(
      Buffer.isBuffer(result.glb) &&
        result.glb.length >= 8 &&
        result.glb.length <= LIMITS.maxGlbBytes,
    );
    assert.equal(result.glb.subarray(0, 4).toString('ascii'), 'glTF');
    return result.glb;
  }
  async function rejects(code, invoke) {
    try {
      await invoke();
    } catch (error) {
      if (error?.code !== code) throw error;
      return;
    }
    assert.fail('Expected bounded failure was not observed');
  }
  try {
    await check('host', async () => {
      if (ports.platform !== 'linux' || !Number.isInteger(ports.uid) || ports.uid <= 0) {
        throw Object.assign(new Error('Unsupported qualification host'), {
          code: 'UNSUPPORTED_HOST',
        });
      }
    });
    receipt.isolation = await check('isolation', async () => {
      const result = await ports.ready();
      assert.equal(result.version, 'kiln.evaluator.isolation-readiness.v1');
      assert.equal(result.mode, 'isolated');
      assert.deepEqual([...result.checks].sort(), [...READINESS].sort());
      return { version: result.version, mode: result.mode, checks: [...result.checks] };
    });
    const glb = await check('first-evaluation', render);
    await artifact('fixture.glb', glb);
    await check('repeat-evaluation', async () => assert.equal(sha(await render()), sha(glb)));
    await check('cpu-preview', async () => {
      const image = await ports.cpu(glb);
      assert(image.png instanceof Uint8Array && image.png.length <= 1024 * 1024);
      const decoded = ports.inspectPng(image.png);
      assert.equal(decoded.width, 128);
      assert.equal(decoded.height, 128);
      assert(decoded.distinctPixels > 1, 'CPU fixture is blank');
      await artifact('cpu-preview.png', image.png);
    });
    await check('deadline', () =>
      rejects('DEADLINE_EXCEEDED', () => ports.render(NEVER, { ...LIMITS, deadlineMs: 100 })),
    );
    await check('cancellation', async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 50);
      try {
        await rejects('CANCELLED', () =>
          ports.render(NEVER, { ...LIMITS, signal: controller.signal }),
        );
      } finally {
        clearTimeout(timer);
      }
    });
    await check('output-limit', () =>
      rejects('OUTPUT_LIMIT_EXCEEDED', () => ports.render(BOX, { ...LIMITS, maxGlbBytes: 32 })),
    );
    await check('post-limit-recovery', async () => assert.equal(sha(await render()), sha(glb)));
    if (includeSoftware) {
      receipt.software = await check('software-vulkan', async () => {
        const result = await ports.software();
        assert.equal(result.status, 'passed');
        assert.equal(result.software, true);
        assert(typeof result.rendererId === 'string' && result.rendererId.length < 256);
        return { status: result.status, software: true, rendererId: result.rendererId };
      });
    }
    receipt.status = 'passed';
  } catch (error) {
    const code = ports.readinessCode(error) ?? error?.code;
    receipt.status = 'failed';
    receipt.failure = { phase, code: FAILURE_CODES.has(code) ? code : 'CHECK_FAILED' };
  }
  return receipt;
}
