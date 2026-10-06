import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedWorkerUrls } from './worker-urls';
import type { RenderGlbOptions, RenderResult } from '../render';
import {
  EvaluatorSubprocessError,
  type EvaluatorProcessLaunch,
  type EvaluatorSubprocessControls,
  renderGLBViaProcessLaunch,
  sanitizedEvaluatorEnv,
} from './subprocess';

const DEFAULT_RUNTIME_ROOT = '/app';
const DEFAULT_BWRAP_PATH = '/usr/local/bin/bwrap';
const DEFAULT_SETPRIV_PATH = '/usr/bin/setpriv';
const DEFAULT_PRLIMIT_PATH = '/usr/bin/prlimit';
const DEFAULT_NODE_PATH = '/usr/local/bin/node';
const READINESS_VERSION = 'kiln.evaluator.isolation-readiness.v1';
const TRANSPORT_VERSION = 'kiln.evaluator.isolation-transport.v1';
const TRANSPORT_STDOUT_MARKER = 'kiln-evaluator-transport-boot-v1\n';
const PROBE_DEADLINE_MS = 8_000;
const MAX_READINESS_PROTOCOL_BYTES = 16 * 1024;
const MAX_TRANSPORT_STDOUT_BYTES = 256;
const READINESS_FAILURE_CODES = [
  'wrapper-launch',
  'fd3-transport',
  'loader-probe-boot',
  'invariant-namespace',
  'invariant-environment',
  'invariant-filesystem',
  'invariant-network',
  'invariant-generated-policy',
  'deadline',
] as const;
const READINESS_CHECKS = [
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
] as const;

export interface IsolatedEvaluatorHost {
  platform?: NodeJS.Platform;
  runtimeRoot?: string;
  bwrapPath?: string;
  setprivPath?: string;
  prlimitPath?: string;
  nodePath?: string;
  pathExists?: (path: string) => boolean;
}

export interface IsolatedEvaluatorControls extends EvaluatorSubprocessControls {
  host?: IsolatedEvaluatorHost;
}

export interface EvaluatorIsolationReadiness {
  version: typeof READINESS_VERSION;
  mode: 'isolated';
  checks: readonly string[];
}

interface EvaluatorIsolationReadinessFailure {
  version: typeof READINESS_VERSION;
  mode: 'isolated';
  failure: EvaluatorIsolationProbeFailureCode;
}

interface EvaluatorIsolationTransport {
  version: typeof TRANSPORT_VERSION;
  transport: 'fd3';
}

export type EvaluatorIsolationReadinessFailureCode = (typeof READINESS_FAILURE_CODES)[number];
type EvaluatorIsolationProbeFailureCode = Extract<
  EvaluatorIsolationReadinessFailureCode,
  | 'loader-probe-boot'
  | 'invariant-namespace'
  | 'invariant-environment'
  | 'invariant-filesystem'
  | 'invariant-network'
  | 'invariant-generated-policy'
>;

export class EvaluatorIsolationReadinessError extends EvaluatorSubprocessError {
  readonly readinessCode: EvaluatorIsolationReadinessFailureCode;

  constructor(readinessCode: EvaluatorIsolationReadinessFailureCode) {
    super('ISOLATION_UNAVAILABLE', 'Isolated evaluator readiness check failed.');
    this.name = 'EvaluatorIsolationReadinessError';
    this.readinessCode = readinessCode;
  }
}

export function isolationReadinessFailureCode(
  error: unknown,
): EvaluatorIsolationReadinessFailureCode | undefined {
  if (!(error instanceof EvaluatorIsolationReadinessError)) return undefined;
  return READINESS_FAILURE_CODES.includes(error.readinessCode) ? error.readinessCode : undefined;
}

function isolationUnavailable(): never {
  throw new EvaluatorSubprocessError('ISOLATION_UNAVAILABLE', 'Isolated evaluator is unavailable.');
}

function requiredAbsolutePath(value: string): string {
  if (!posix.isAbsolute(value) || posix.normalize(value) !== value) isolationUnavailable();
  return value;
}

function requiredRuntimeRoot(value: string): string {
  const root = requiredAbsolutePath(value);
  if (root !== DEFAULT_RUNTIME_ROOT) isolationUnavailable();
  return root;
}

function workerInsideRuntime(workerPath: string, runtimeRoot: string): string {
  const normalized = requiredAbsolutePath(workerPath);
  const packageRoot = posix.join(runtimeRoot, 'node_modules') + posix.sep;
  if (!normalized.startsWith(packageRoot)) isolationUnavailable();
  return normalized;
}

function runtimeMounts(runtimeRoot: string, pathExists: (path: string) => boolean): string[] {
  const mounts = ['/usr', '/lib', '/lib64', posix.join(runtimeRoot, 'node_modules')];
  const existing = mounts.filter((path) => pathExists(path));
  if (!existing.includes('/usr') || !existing.includes(posix.join(runtimeRoot, 'node_modules'))) {
    isolationUnavailable();
  }
  return existing;
}

/**
 * Build the Linux process boundary; each hosting environment must qualify it.
 * The outer image runs as a non-root user. setpriv clears inheritable/ambient
 * capabilities and locks no-new-privs before bubblewrap creates fresh user,
 * PID, network, mount, IPC, UTS, and cgroup namespaces. bubblewrap drops the
 * bounding/effective sets after entering its user namespace, where that drop
 * is valid for the non-root caller. Only the language runtime and installed
 * dependency tree are mounted read-only; scratch is tmpfs.
 */
function isolatedEvaluatorLaunchWithLoader(
  workerPath: string,
  host: IsolatedEvaluatorHost = {},
  loader: 'tsx' | 'module' = 'tsx',
): EvaluatorProcessLaunch {
  const platform = host.platform ?? process.platform;
  if (platform !== 'linux') isolationUnavailable();
  const runtimeRoot = requiredRuntimeRoot(host.runtimeRoot ?? DEFAULT_RUNTIME_ROOT);
  const pathExists = host.pathExists ?? existsSync;
  const bwrapPath = requiredAbsolutePath(host.bwrapPath ?? DEFAULT_BWRAP_PATH);
  const setprivPath = requiredAbsolutePath(host.setprivPath ?? DEFAULT_SETPRIV_PATH);
  const prlimitPath = requiredAbsolutePath(host.prlimitPath ?? DEFAULT_PRLIMIT_PATH);
  const nodePath = requiredAbsolutePath(host.nodePath ?? DEFAULT_NODE_PATH);
  for (const executable of [bwrapPath, setprivPath, prlimitPath, nodePath]) {
    if (!pathExists(executable)) isolationUnavailable();
  }
  const resolvedWorkerPath = workerInsideRuntime(workerPath, runtimeRoot);
  if (!pathExists(resolvedWorkerPath)) isolationUnavailable();

  const bwrapArgs = [
    '--unshare-all',
    // --unshare-all only tries a user namespace; --disable-userns requires it.
    '--unshare-user',
    '--die-with-parent',
    '--new-session',
    '--disable-userns',
    '--cap-drop',
    'ALL',
    '--clearenv',
    '--setenv',
    'NODE_ENV',
    'production',
    '--setenv',
    'NO_COLOR',
    '1',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
    '--dir',
    runtimeRoot,
    '--dir',
    posix.join(runtimeRoot, 'node_modules'),
  ];
  for (const mount of runtimeMounts(runtimeRoot, pathExists)) {
    bwrapArgs.push('--ro-bind', mount, mount);
  }
  const nodeArgs = [nodePath, '--max-old-space-size=512', '--disable-proto=throw'];
  if (loader === 'tsx') nodeArgs.push('--import', 'tsx');
  nodeArgs.push(resolvedWorkerPath);
  bwrapArgs.push(
    '--chdir',
    runtimeRoot,
    '--preserve-fds',
    '1',
    '--',
    prlimitPath,
    '--cpu=65:65',
    '--as=6442450944:6442450944',
    '--fsize=100663296:100663296',
    '--nofile=64:64',
    '--nproc=64:64',
    '--',
    ...nodeArgs,
  );

  return {
    command: setprivPath,
    args: [
      '--no-new-privs',
      '--inh-caps=-all',
      '--ambient-caps=-all',
      '--',
      bwrapPath,
      ...bwrapArgs,
    ],
    // The wrapper receives no product/provider environment. bubblewrap clears
    // even this two-key environment before creating the worker environment.
    env: sanitizedEvaluatorEnv({}),
    detached: true,
  };
}

export function isolatedEvaluatorLaunch(
  workerPath: string,
  host: IsolatedEvaluatorHost = {},
): EvaluatorProcessLaunch {
  return isolatedEvaluatorLaunchWithLoader(
    workerPath,
    host,
    /\.tsx?$/.test(workerPath) ? 'tsx' : 'module',
  );
}

export async function renderGLBViaIsolatedEvaluator(
  code: string,
  options: RenderGlbOptions = {},
  controls: IsolatedEvaluatorControls = {},
): Promise<RenderResult> {
  const workerPath = fileURLToPath(isolatedWorkerUrls(import.meta.url).worker);
  const launch = isolatedEvaluatorLaunch(workerPath, controls.host);
  const { host: _, ...processControls } = controls;
  return renderGLBViaProcessLaunch(code, options, processControls, launch);
}

export function decodeEvaluatorIsolationReadiness(
  value: unknown,
): EvaluatorIsolationReadiness | EvaluatorIsolationReadinessFailure {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) isolationUnavailable();
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') === 'failure,mode,version' &&
    record.version === READINESS_VERSION &&
    record.mode === 'isolated' &&
    [
      'loader-probe-boot',
      'invariant-namespace',
      'invariant-environment',
      'invariant-filesystem',
      'invariant-network',
      'invariant-generated-policy',
    ].includes(String(record.failure))
  ) {
    return record as unknown as EvaluatorIsolationReadinessFailure;
  }
  if (
    Object.keys(record).sort().join(',') !== 'checks,mode,version' ||
    record.version !== READINESS_VERSION ||
    record.mode !== 'isolated' ||
    !Array.isArray(record.checks) ||
    record.checks.length !== READINESS_CHECKS.length ||
    record.checks.join(',') !== READINESS_CHECKS.join(',')
  ) {
    isolationUnavailable();
  }
  return record as unknown as EvaluatorIsolationReadiness;
}

export function decodeEvaluatorIsolationTransport(value: unknown): EvaluatorIsolationTransport {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'transport,version'
  ) {
    isolationUnavailable();
  }
  const record = value as Record<string, unknown>;
  if (record.version !== TRANSPORT_VERSION || record.transport !== 'fd3') isolationUnavailable();
  return record as unknown as EvaluatorIsolationTransport;
}

function terminateReadinessChild(child: ReturnType<typeof spawn>): void {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGKILL');
  } catch {}
}

async function assertIsolationTransport(launch: EvaluatorProcessLaunch): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      env: launch.env,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const protocolChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let protocolBytes = 0;
    let settled = false;
    const fail = (readinessCode: EvaluatorIsolationReadinessFailureCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new EvaluatorIsolationReadinessError(readinessCode));
    };
    const timer = setTimeout(() => {
      terminateReadinessChild(child);
      fail('deadline');
    }, PROBE_DEADLINE_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_TRANSPORT_STDOUT_BYTES) {
        terminateReadinessChild(child);
        fail('wrapper-launch');
        return;
      }
      stdoutChunks.push(Buffer.from(chunk));
    });
    const protocol = child.stdio[3];
    if (!protocol) {
      terminateReadinessChild(child);
      fail('fd3-transport');
      return;
    }
    protocol.on('data', (chunk: Buffer) => {
      protocolBytes += chunk.byteLength;
      if (protocolBytes > MAX_READINESS_PROTOCOL_BYTES) {
        terminateReadinessChild(child);
        fail('fd3-transport');
        return;
      }
      protocolChunks.push(Buffer.from(chunk));
    });
    child.once('error', () => fail('wrapper-launch'));
    child.once('close', (code) => {
      if (settled) return;
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      if (stdout !== TRANSPORT_STDOUT_MARKER) return fail('wrapper-launch');
      if (code !== 0 || protocolChunks.length === 0) return fail('fd3-transport');
      try {
        decodeEvaluatorIsolationTransport(
          JSON.parse(Buffer.concat(protocolChunks).toString('utf8')),
        );
        settled = true;
        clearTimeout(timer);
        resolve();
      } catch {
        fail('fd3-transport');
      }
    });
  });
}

async function runIsolationProbe(
  launch: EvaluatorProcessLaunch,
): Promise<EvaluatorIsolationReadiness> {
  return await new Promise<EvaluatorIsolationReadiness>((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      env: launch.env,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
    });
    const protocol = child.stdio[3];
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const fail = (readinessCode: EvaluatorIsolationReadinessFailureCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new EvaluatorIsolationReadinessError(readinessCode));
    };
    const timer = setTimeout(() => {
      terminateReadinessChild(child);
      fail('deadline');
    }, PROBE_DEADLINE_MS);
    if (!protocol) {
      terminateReadinessChild(child);
      fail('fd3-transport');
      return;
    }
    protocol.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > MAX_READINESS_PROTOCOL_BYTES) {
        terminateReadinessChild(child);
        fail('loader-probe-boot');
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.once('error', () => fail('wrapper-launch'));
    child.once('close', (code) => {
      if (settled) return;
      if (chunks.length === 0) return fail('loader-probe-boot');
      try {
        const result = decodeEvaluatorIsolationReadiness(
          JSON.parse(Buffer.concat(chunks).toString('utf8')),
        );
        if ('failure' in result) return fail(result.failure);
        if (code !== 0) return fail('loader-probe-boot');
        settled = true;
        clearTimeout(timer);
        resolve(result);
      } catch {
        fail('loader-probe-boot');
      }
    });
  });
}

/** Fail-closed boot/readiness proof. Package presence alone is not accepted. */
export async function assertIsolatedEvaluatorReady(
  host: IsolatedEvaluatorHost = {},
): Promise<EvaluatorIsolationReadiness> {
  if (typeof process.getuid !== 'function' || process.getuid() === 0) {
    throw new EvaluatorIsolationReadinessError('invariant-namespace');
  }
  const workers = isolatedWorkerUrls(import.meta.url);
  const transportPath = fileURLToPath(workers.transport);
  const probePath = fileURLToPath(workers.probe);
  let transportLaunch: EvaluatorProcessLaunch;
  let probeLaunch: EvaluatorProcessLaunch;
  try {
    transportLaunch = isolatedEvaluatorLaunchWithLoader(transportPath, host, 'module');
    probeLaunch = isolatedEvaluatorLaunch(probePath, host);
  } catch {
    throw new EvaluatorIsolationReadinessError('wrapper-launch');
  }
  await assertIsolationTransport(transportLaunch);
  return await runIsolationProbe(probeLaunch);
}
