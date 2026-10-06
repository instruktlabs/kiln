import { describe, expect, test } from 'bun:test';
import { resolveEvaluatorMode } from '../render';
import { EvaluatorSubprocessError } from './subprocess';
import {
  decodeEvaluatorIsolationReadiness,
  decodeEvaluatorIsolationTransport,
  EvaluatorIsolationReadinessError,
  isolationReadinessFailureCode,
  isolatedEvaluatorLaunch,
} from './isolation';
import { processCapabilitiesAreEmpty } from './probe-invariants';

const PATHS = new Set([
  '/usr',
  '/lib',
  '/app/node_modules',
  '/usr/local/bin/bwrap',
  '/usr/bin/setpriv',
  '/usr/bin/prlimit',
  '/usr/local/bin/node',
  '/app/node_modules/@instruktlabs/kiln/src/evaluator/worker.ts',
]);

function launch() {
  return isolatedEvaluatorLaunch('/app/node_modules/@instruktlabs/kiln/src/evaluator/worker.ts', {
    platform: 'linux',
    pathExists: (path) => PATHS.has(path),
  });
}

describe('isolated evaluator process contract', () => {
  test('exposes only the reviewed readiness failure vocabulary', () => {
    for (const code of [
      'wrapper-launch',
      'fd3-transport',
      'loader-probe-boot',
      'invariant-namespace',
      'invariant-environment',
      'invariant-filesystem',
      'invariant-network',
      'invariant-generated-policy',
      'deadline',
    ] as const) {
      const error = new EvaluatorIsolationReadinessError(code);
      expect(error).toMatchObject({
        code: 'ISOLATION_UNAVAILABLE',
        message: 'Isolated evaluator readiness check failed.',
        readinessCode: code,
      });
      expect(isolationReadinessFailureCode(error)).toBe(code);
    }
    expect(isolationReadinessFailureCode(new Error('bwrap /private/path secret'))).toBeUndefined();
  });

  test('accepts only bounded v1 negative readiness envelopes', () => {
    for (const failure of [
      'loader-probe-boot',
      'invariant-namespace',
      'invariant-environment',
      'invariant-filesystem',
      'invariant-network',
      'invariant-generated-policy',
    ] as const) {
      expect(
        decodeEvaluatorIsolationReadiness({
          version: 'kiln.evaluator.isolation-readiness.v1',
          mode: 'isolated',
          failure,
        }),
      ).toEqual({ version: 'kiln.evaluator.isolation-readiness.v1', mode: 'isolated', failure });
    }
    for (const value of [
      {
        version: 'kiln.evaluator.isolation-readiness.v1',
        mode: 'isolated',
        failure: 'wrapper-launch',
      },
      {
        version: 'kiln.evaluator.isolation-readiness.v1',
        mode: 'isolated',
        failure: 'invariant-namespace',
        detail: '/private/path',
      },
    ]) {
      expect(() => decodeEvaluatorIsolationReadiness(value)).toThrow(
        'Isolated evaluator is unavailable.',
      );
    }
  });

  test('accepts only the exact fd3 transport marker envelope', () => {
    expect(
      decodeEvaluatorIsolationTransport({
        version: 'kiln.evaluator.isolation-transport.v1',
        transport: 'fd3',
      }),
    ).toEqual({ version: 'kiln.evaluator.isolation-transport.v1', transport: 'fd3' });
    for (const value of [
      { version: 'kiln.evaluator.isolation-transport.v1', transport: 'stdout' },
      {
        version: 'kiln.evaluator.isolation-transport.v1',
        transport: 'fd3',
        detail: '/private/path',
      },
    ]) {
      expect(() => decodeEvaluatorIsolationTransport(value)).toThrow(
        'Isolated evaluator is unavailable.',
      );
    }
  });
  test('selects isolated mode exactly and rejects near-miss flags', () => {
    expect(resolveEvaluatorMode({ KILN_EVALUATOR_MODE: 'isolated' })).toBe('isolated');
    expect(() => resolveEvaluatorMode({ KILN_EVALUATOR_MODE: 'isolate' })).toThrow(
      'Invalid KILN_EVALUATOR_MODE',
    );
  });

  test('drops privileges before a no-network, read-only namespace boundary', () => {
    const spec = launch();
    expect(spec.command).toBe('/usr/bin/setpriv');
    expect(spec.detached).toBe(true);
    expect(spec.env).toEqual({ NODE_ENV: 'production', NO_COLOR: '1' });
    expect(spec.args.slice(0, 5)).toEqual([
      '--no-new-privs',
      '--inh-caps=-all',
      '--ambient-caps=-all',
      '--',
      '/usr/local/bin/bwrap',
    ]);
    expect(spec.args).not.toContain('--bounding-set=-all');
    expect(spec.args).toContain('--unshare-all');
    // --unshare-all implies --unshare-user-try, which does not satisfy
    // Bubblewrap's --disable-userns precondition (observed with 0.12.0).
    expect(spec.args).toContain('--unshare-user');
    expect(spec.args).not.toContain('--share-net');
    expect(spec.args).toContain('--disable-userns');
    expect(spec.args).toContain('--cap-drop');
    expect(spec.args).toContain('--clearenv');
    expect(spec.args).toContain('--tmpfs');
    expect(spec.args).toContain('--ro-bind');
    expect(spec.args).toContain('--preserve-fds');
    expect(spec.args).toContain('--cpu=65:65');
    expect(spec.args).toContain('--as=6442450944:6442450944');
    expect(spec.args).toContain('--nproc=64:64');
    expect(spec.args).toContain('--max-old-space-size=512');
    expect(spec.args).not.toContain('/app/agent-runtime');
    expect(spec.args).not.toContain('/etc');
  });

  test('compiled workers retain isolation controls without requiring a TypeScript loader', () => {
    const worker = '/app/node_modules/@instruktlabs/kiln/lib/evaluator/worker.js';
    const spec = isolatedEvaluatorLaunch(worker, {
      platform: 'linux',
      pathExists: (path) => PATHS.has(path) || path === worker,
    });
    expect(spec.args.at(-1)).toBe(worker);
    expect(spec.args).not.toContain('tsx');
    expect(spec.args).not.toContain('--import');
    expect(spec.args).toContain('--unshare-all');
    expect(spec.args).toContain('--clearenv');
    expect(spec.args).toContain('--cpu=65:65');
    expect(spec.args).toContain('--max-old-space-size=512');
  });

  test('requires every Linux capability set to be present and empty', () => {
    const emptyStatus = [
      'Name:\tnode',
      'CapInh:\t0000000000000000',
      'CapPrm:\t0000000000000000',
      'CapEff:\t0000000000000000',
      'CapBnd:\t0000000000000000',
      'CapAmb:\t0000000000000000',
    ].join('\n');
    expect(processCapabilitiesAreEmpty(emptyStatus)).toBe(true);
    for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
      expect(
        processCapabilitiesAreEmpty(emptyStatus.replace(`${field}:\t0000`, `${field}:\t0001`)),
      ).toBe(false);
      expect(
        processCapabilitiesAreEmpty(emptyStatus.replace(new RegExp(`^${field}:.*$`, 'm'), '')),
      ).toBe(false);
    }
    expect(processCapabilitiesAreEmpty(undefined)).toBe(false);
  });

  test('refuses non-Linux hosts, missing binaries, and workers outside installed dependencies', () => {
    for (const invoke of [
      () =>
        isolatedEvaluatorLaunch('/app/node_modules/@instruktlabs/kiln/src/evaluator/worker.ts', {
          platform: 'win32',
          pathExists: () => true,
        }),
      () =>
        isolatedEvaluatorLaunch('/app/node_modules/@instruktlabs/kiln/src/evaluator/worker.ts', {
          platform: 'linux',
          pathExists: () => false,
        }),
      () =>
        isolatedEvaluatorLaunch('/app/agent-runtime/src/server.ts', {
          platform: 'linux',
          pathExists: () => true,
        }),
    ]) {
      try {
        invoke();
        throw new Error('expected isolation refusal');
      } catch (error) {
        expect(error).toBeInstanceOf(EvaluatorSubprocessError);
        expect(error).toMatchObject({ code: 'ISOLATION_UNAVAILABLE' });
        expect(String(error)).not.toContain('/app/agent-runtime/src/server.ts');
      }
    }
  });
});
