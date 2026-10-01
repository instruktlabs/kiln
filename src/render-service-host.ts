/** Host-only renderer discovery/startup. The socket is the registry; the engine owns degradation. */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { launchWindowsRenderService } from './render-service-windows';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { resolvedRendererDependencies } from '../render-service/src/build-identity.mjs';
import { fingerprintSourceDir } from '../render-service/src/instance.mjs';
import {
  readRenderServiceHealth,
  type RenderServiceHealth,
  type RenderServiceInstance,
} from './render-service-client';
export type { RenderServiceInstance } from './render-service-client';

export const DEFAULT_LOCAL_RENDER_SERVICE_PORT = 8000;
export function localRenderServicePort(env: Readonly<NodeJS.ProcessEnv> = process.env): number {
  const raw = Number(env['KILN_RENDER_SERVICE_PORT']);
  return Number.isInteger(raw) && raw > 0 && raw < 65_536 ? raw : DEFAULT_LOCAL_RENDER_SERVICE_PORT;
}
export function localRenderServiceUrl(env: Readonly<NodeJS.ProcessEnv> = process.env): string {
  return `http://127.0.0.1:${localRenderServicePort(env)}`;
}
/**
 * An explicit renderer URL with the shared local socket's origin names that socket,
 * not another device, so hosts give it the local route: join, start on demand and
 * restart after an idle exit, with local credentials.
 */
export function namesLocalRenderService(
  url: string,
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): boolean {
  try {
    return new URL(url).origin === new URL(localRenderServiceUrl(env)).origin;
  } catch {
    return false;
  }
}
export function renderServiceNodeArguments(dir: string): string[] {
  return [
    '--import',
    pathToFileURL(join(dir, 'src/register-hooks.mjs')).href,
    join(dir, 'src/server.mjs'),
  ];
}
export function renderServiceDir(): string {
  return (
    process.env['KILN_RENDER_SERVICE_DIR'] ||
    fileURLToPath(new URL('../render-service', import.meta.url))
  );
}
export type LocalRenderServiceState =
  | 'ready'
  | 'dependencies-missing'
  | 'dependencies-incompatible'
  | 'runtime-unavailable'
  | 'not-packaged';
/** Resolve the graph Node will execute, including hoisted packages, without loading native code. */
export function localRenderServiceState(dir = renderServiceDir()): LocalRenderServiceState {
  if (!existsSync(join(dir, 'src/server.mjs')) || !existsSync(join(dir, 'package.json')))
    return 'not-packaged';
  try {
    const anchor = pathToFileURL(join(dir, 'src/server.mjs')).href;
    if (process.versions.bun) {
      // Probe Node's executed graph, not Bun's resolver or its negative lookup cache.
      const moduleUrl = new URL('../render-service/src/build-identity.mjs', import.meta.url).href;
      const result = spawnSync(
        nodeBinary(),
        [
          '--input-type=module',
          '-e',
          `import {resolvedRendererDependencies} from ${JSON.stringify(moduleUrl)};try{resolvedRendererDependencies(${JSON.stringify(anchor)})}catch(error){console.error(error.message);process.exitCode=1}`,
        ],
        { encoding: 'utf8', timeout: 5_000, windowsHide: true },
      );
      if (result.error || result.signal) return 'runtime-unavailable';
      if (result.status !== 0) throw new Error(result.stderr);
    } else resolvedRendererDependencies(anchor);
    return 'ready';
  } catch (error) {
    return (error as Error).message.includes('version conflict')
      ? 'dependencies-incompatible'
      : 'dependencies-missing';
  }
}
export function explainRenderServiceState(state: LocalRenderServiceState, dir: string): string {
  if (state === 'ready')
    return `renderer dependencies are ready (${dir}); GPU readiness is verified at startup`;
  if (state === 'not-packaged') return `this installation does not ship ${dir}`;
  if (state === 'runtime-unavailable')
    return 'the renderer requires a working Node runtime; check KILN_RENDER_SERVICE_NODE and kiln service reprobe';
  if (state === 'dependencies-incompatible')
    return 'renderer dependencies have incompatible versions; reinstall the official Kiln package with optional dependencies enabled';
  return 'renderer dependencies are missing; reinstall the official Kiln package with optional dependencies enabled';
}
export function renderServiceSourceFingerprint(dir: string): string | undefined {
  const source = join(dir, 'src');
  return existsSync(source) ? fingerprintSourceDir(source) : undefined;
}
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === 'EPERM';
  }
}
export type LocalRenderServiceProbe =
  | { kind: 'absent' }
  | { kind: 'unknown'; reason: string }
  | { kind: 'foreign' }
  | { kind: 'incompatible'; reason: string }
  | {
      kind: 'service';
      rendererId: string;
      instance: RenderServiceInstance;
      health: RenderServiceHealth;
      stale: boolean;
    };
/** Timeout, refused socket, and incompatible identity are deliberately different outcomes. */
export async function inspectLocalRenderService(
  url: string,
  dir = renderServiceDir(),
  timeoutMs = 1_500,
): Promise<LocalRenderServiceProbe> {
  const probe = await readRenderServiceHealth(url, {
    timeoutMs,
    token:
      url === localRenderServiceUrl()
        ? (process.env['KILN_RENDER_TOKEN'] ?? process.env['RENDER_SERVICE_TOKEN'])
        : undefined,
  });
  if (probe.kind !== 'service') return probe;
  const source = renderServiceSourceFingerprint(dir);
  return {
    kind: 'service',
    rendererId: probe.health.rendererId,
    instance: probe.health.instance,
    health: probe.health,
    stale: !source || probe.health.compatibility.sourceFingerprint !== source,
  };
}
export function describeStaleService(url: string, probe: LocalRenderServiceProbe): string {
  if (probe.kind !== 'service') return `the render service on ${url} has incompatible source`;
  const { pid, ownerPid, mode } = probe.instance;
  const provenance = ownerPid === null ? 'started by hand' : `started by session ${ownerPid}`;
  return `the ${mode} render service on ${url} (pid ${pid}, ${provenance}) runs different source from this installation`;
}
export function describeUnavailableService(url: string, probe: LocalRenderServiceProbe): string {
  switch (probe.kind) {
    case 'service':
      return `${describeStaleService(url, probe)}; stop it explicitly with \`kiln service stop\` when other clients are finished`;
    case 'foreign':
      return `port ${new URL(url).port} is in use by something that is not a render service; set KILN_RENDER_SERVICE_PORT to move the renderer`;
    case 'incompatible':
      return `the renderer on ${url} is incompatible: ${probe.reason}; stop it by hand and use the same Kiln build`;
    case 'unknown':
      return `the listener on ${url} is unknown: ${probe.reason}; retry \`kiln service reprobe\``;
    case 'absent':
      return `no render service is listening on ${url}`;
  }
}
/** Explicit local stop only. Remote instance PIDs are never local process authority. */
export async function terminateRenderService(
  url: string,
  probe: LocalRenderServiceProbe,
  waitMs = 5_000,
): Promise<boolean> {
  if (
    url !== localRenderServiceUrl() ||
    probe.kind !== 'service' ||
    probe.instance.pid === process.pid
  )
    return false;
  const fresh = await inspectLocalRenderService(url);
  if (
    fresh.kind !== 'service' ||
    fresh.instance.pid !== probe.instance.pid ||
    fresh.instance.startedAt !== probe.instance.startedAt ||
    fresh.health.captureIdentity.instanceId !== probe.health.captureIdentity.instanceId ||
    fresh.health.compatibility.fingerprint !== probe.health.compatibility.fingerprint
  )
    return false;
  try {
    process.kill(probe.instance.pid);
  } catch {
    return false;
  }
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if ((await inspectLocalRenderService(url, undefined, 500)).kind === 'absent') return true;
    await new Promise((done) => setTimeout(done, 100));
  }
  return false;
}
function nodeBinary(env: Readonly<NodeJS.ProcessEnv> = process.env): string {
  return env['KILN_RENDER_SERVICE_NODE'] || (process.versions.bun ? 'node' : process.execPath);
}
function detach(running: ChildProcess): void {
  running.stdout?.destroy();
  running.stderr?.destroy();
  running.unref();
}
/** Join a verified current service or start one on the same shared socket. Never replace by owner PID. */
export async function startLocalRenderService(
  dir = renderServiceDir(),
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): Promise<string> {
  const url = localRenderServiceUrl(environment);
  const probe = await inspectLocalRenderService(url, dir);
  if (probe.kind === 'service' && !probe.stale) return url;
  if (probe.kind !== 'absent') throw new Error(describeUnavailableService(url, probe));
  const state = localRenderServiceState(dir);
  if (state !== 'ready') throw new Error(explainRenderServiceState(state, dir));
  const rawBudget = Number(environment['KILN_RENDER_SERVICE_STARTUP_MS'] ?? 60_000);
  const budget = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : 60_000;
  let stderr = '';
  let spawnError: Error | undefined;
  const env = {
    ...environment,
    PORT: String(localRenderServicePort(environment)),
    HOST: '127.0.0.1',
    RENDER_SERVICE_MODE: 'managed',
    RENDER_SERVICE_OWNER_PID: String(process.pid),
  };
  const windowsLaunch =
    process.platform === 'win32'
      ? launchWindowsRenderService(
          nodeBinary(environment),
          renderServiceNodeArguments(dir),
          dir,
          env,
        )
      : undefined;
  const running =
    windowsLaunch?.child ??
    spawn(nodeBinary(environment), renderServiceNodeArguments(dir), {
      cwd: dir,
      detached: true,
      windowsHide: true,
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  running.on('error', (error) => {
    spawnError = error;
  });
  running.stderr?.on('data', (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-2_000);
  });
  const deadline = Date.now() + budget;
  let exitedAt: number | undefined;
  try {
    while (Date.now() < deadline) {
      const fresh = await inspectLocalRenderService(url, dir, 1_000);
      if (fresh.kind === 'service' && !fresh.stale) return url;
      if (fresh.kind === 'service' || fresh.kind === 'incompatible' || fresh.kind === 'foreign')
        throw new Error(describeUnavailableService(url, fresh));
      const exited = windowsLaunch
        ? windowsLaunch.hasExited()
        : running.exitCode !== null || running.signalCode !== null;
      if (exited) exitedAt ??= Date.now();
      // Another client may have won the socket while this child lost its bind. Give
      // that listener a bounded health warmup, and join only after full verification.
      // A failed spawn has no such race; absent/unknown never count as success.
      if (spawnError || (exitedAt !== undefined && Date.now() - exitedAt >= 1500))
        throw new Error(
          `render service exited during startup${spawnError ? `: ${spawnError.message}` : ''}${stderr.trim() ? `: ${stderr.trim().split('\n').slice(-3).join(' ')}` : windowsLaunch ? '; launch the renderer manually to inspect native-driver errors' : ''}`,
        );
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error(
      `render service health is unknown after ${budget}ms; inspect with \`kiln service reprobe\``,
    );
  } finally {
    // An unknown startup could be serving another client. Its own idle timer owns shutdown.
    detach(running);
  }
}
