/** Host selection policy. Verified HTTP transport is shared with local service discovery. */
import type { PbrRenderPort } from './composer/render-port';
import type { KilnToolContext } from './tools/registry';
import { createRenderCapabilitiesReader } from './render-capabilities';
import {
  makeRemoteRenderPort,
  probeCaptureIdentity,
  readRenderServiceHealth,
} from './render-service-client';
import {
  describeUnavailableService,
  explainRenderServiceState,
  inspectLocalRenderService,
  localRenderServiceState,
  localRenderServiceUrl,
  renderServiceDir,
  renderServiceSourceFingerprint,
  startLocalRenderService,
} from './render-service-host';
export {
  makeRemoteRenderPort,
  probeCaptureIdentity,
  probeRenderService,
} from './render-service-client';
export type RenderMode = 'auto' | 'cpu' | 'gpu';
/** In-loop timeout. Artifact callers supply their own larger deadline through the port owner. */
export const CLI_VIEW_RENDER_TIMEOUT_MS = 20_000;
/** An explicit option wins over the environment; omission defaults to auto. */
export function resolveRenderMode(value = process.env['KILN_RENDER'] ?? 'auto'): RenderMode {
  if (value === 'auto' || value === 'cpu' || value === 'gpu') return value;
  throw new Error(`--render must be auto, cpu or gpu (got: ${value})`);
}
/** Failed starts are cached. Only an explicitly refused socket permits a new local start. */
export function makeLazyRenderPort(
  start: () => Promise<string>,
  token?: string,
  sourceFingerprint?: string,
  initialUrl?: string,
): PbrRenderPort {
  let resolving: Promise<{ url: string; port: PbrRenderPort }> | undefined = initialUrl
    ? Promise.resolve({
        url: initialUrl,
        port: makeRemoteRenderPort(initialUrl, token, sourceFingerprint),
      })
    : undefined;
  const resolve = () =>
    (resolving ??= start().then(
      (url) => ({
        url,
        port: makeRemoteRenderPort(url, token, sourceFingerprint),
      }),
      (error) => {
        throw new Error(
          `render service could not start: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    ));
  return async (req, execution) => {
    execution?.signal?.throwIfAborted();
    const pending = resolve();
    const { url, port } = await pending;
    execution?.signal?.throwIfAborted();
    try {
      return await port(req, execution);
    } catch (error) {
      if (execution?.signal?.aborted || (error as Error).name === 'TimeoutError') throw error;
      if (
        (
          await readRenderServiceHealth(url, {
            token,
            signal: execution?.signal,
          })
        ).kind !== 'absent'
      )
        throw error;
      execution?.signal?.throwIfAborted();
      // Concurrent captures can all observe the old socket disappearing. Only
      // the first retires its connection; the others share the replacement.
      if (resolving === pending) resolving = undefined;
      return (await resolve()).port(req, execution);
    }
  };
}

/** What actually got selected, for honest CLI reporting. */
const selected = new WeakMap<object, string>();

export function describeRenderMode(context: KilnToolContext): string {
  return selected.get(context) ?? 'cpu raster';
}

/**
 * The honest producer line for one completed screenshot.
 *
 * `describeRenderMode` reports what was CONFIGURED. That is not the same thing as
 * what drew the pixels: `kiln_render` routes to the port only when the scene
 * actually needs PBR shading, so a correctly-skipped GPU would otherwise be
 * reported as though it had rendered. The tool output already carries the truth in
 * its `kiln.view-fidelity.v1` block; this reads it rather than restating intent.
 */
export function describeDrawnBy(output: unknown, context: KilnToolContext): string {
  const fidelity = (output as { viewFidelity?: ViewFidelityLike } | undefined)?.viewFidelity;
  if (!fidelity) return describeRenderMode(context);

  if (fidelity.materialFaithful) return `GPU ${fidelity.rendererId}`;

  // `degraded` means "this scene wanted PBR and did not get it". With no port
  // configured that is the documented default, not an incident, and reporting it
  // as a degrade would make the ordinary no-GPU path look like a failure.
  if (!context.viewRenderPort) return describeRenderMode(context);

  if (fidelity.degraded) {
    const why = fidelity.degradeReason ? `: ${fidelity.degradeReason}` : '';
    return `cpu raster (GPU degraded${why})`;
  }
  // A port was configured and the render did not degrade, so the scene simply did
  // not need PBR. Sending a flat, untextured scene to a GPU buys nothing the CPU
  // rasterizer does not already draw correctly.
  return 'cpu raster (GPU configured; scene needs no PBR shading)';
}

/** The fields of `kiln.view-fidelity.v1` this module reads. */
interface ViewFidelityLike {
  rendererId: string;
  materialFaithful: boolean;
  degraded: boolean;
  degradeReason?: string;
}

/** Local auto starts lazily by default; false is an explicit host opt-out. */
export interface RenderPortOptions {
  autoSpawn?: boolean;
  start?: () => Promise<string>;
  serviceDir?: string;
}
export async function buildRenderPort(
  mode: RenderMode,
  portUrl: string | undefined,
  options?: RenderPortOptions,
): Promise<KilnToolContext> {
  const remoteToken = process.env['KILN_RENDER_TOKEN'];
  const localToken = remoteToken ?? process.env['RENDER_SERVICE_TOKEN'];
  const startupEnvironment = { ...process.env };
  const readCapabilities = createRenderCapabilitiesReader(mode, portUrl, {
    ...options,
    injectedStart: Boolean(options?.start),
  });
  // Keep route and credentials fixed for the lifetime of this host. Reprobe
  // refreshes readiness, not ambient configuration or the loaded source build.
  const explicitUrl = portUrl || process.env['KILN_RENDER_PORT_URL'];
  const dir = options?.serviceDir ?? renderServiceDir();
  const url = localRenderServiceUrl();
  const source = mode === 'cpu' ? undefined : renderServiceSourceFingerprint(dir);
  const context: KilnToolContext = {
    ...(mode === 'gpu' ? { viewRenderRequired: true } : {}),
    viewRenderTimeoutMs: CLI_VIEW_RENDER_TIMEOUT_MS,
    renderCapabilities: async () => {
      const readiness = await readCapabilities();
      const configured = Boolean(context.viewRenderPort);
      return {
        ...readiness,
        configured,
        ...(!configured && readiness.configured
          ? {
              reprobeRequired: true,
              reason:
                'Renderer readiness changed after this host selected CPU. Call kiln_renderer with action=reprobe to refresh this session.',
            }
          : {}),
      };
    },
  };
  const select = async (): Promise<KilnToolContext> => {
    const context: KilnToolContext = {};
    const attach = (
      url: string,
      label: string,
      token?: string,
      source?: string,
    ): KilnToolContext => {
      context.viewRenderPort = makeRemoteRenderPort(url, token, source);
      context.viewRenderTimeoutMs = CLI_VIEW_RENDER_TIMEOUT_MS;
      context.captureCacheIdentity = () => probeCaptureIdentity(url, token, source);
      selected.set(context, label);
      return context;
    };
    if (mode === 'cpu') {
      selected.set(context, 'cpu raster');
      return context;
    }
    // Explicit remote selection never discovers, starts, or stops local services. The
    // first render verifies remote health and exposes failures through the existing owner.
    if (explicitUrl)
      return attach(explicitUrl, `GPU service (explicit remote ${explicitUrl})`, remoteToken);
    const attachLocal = (initialUrl?: string, label = 'GPU service (local, started on demand)') => {
      let resolvedUrl = initialUrl;
      const start = options?.start ?? (() => startLocalRenderService(dir, startupEnvironment));
      context.viewRenderPort = makeLazyRenderPort(
        async () => {
          resolvedUrl = await start();
          return resolvedUrl;
        },
        localToken,
        source,
        initialUrl,
      );
      context.viewRenderTimeoutMs = CLI_VIEW_RENDER_TIMEOUT_MS;
      context.captureCacheIdentity = () =>
        resolvedUrl ? probeCaptureIdentity(resolvedUrl, localToken, source) : undefined;
      selected.set(context, label);
      return context;
    };
    const probe = await inspectLocalRenderService(url, dir);
    if (probe.kind === 'service' && !probe.stale) {
      const label = `GPU service (${probe.rendererId})`;
      return options?.autoSpawn !== false || mode === 'gpu'
        ? attachLocal(url, label)
        : attach(url, label, localToken, source);
    }
    if (probe.kind !== 'absent') {
      const why = describeUnavailableService(url, probe);
      if (mode === 'gpu') throw new Error(why);
      selected.set(context, `cpu raster (${why})`);
      return context;
    }
    if (options?.autoSpawn !== false || mode === 'gpu') {
      const state = options?.start ? 'ready' : localRenderServiceState(dir);
      if (state === 'ready') return attachLocal();
      const why = explainRenderServiceState(state, dir);
      if (mode === 'gpu')
        throw new Error(
          `${why}; set --render-port or KILN_RENDER_PORT_URL for another device, or use --render auto for CPU`,
        );
      selected.set(context, `cpu raster (${why})`);
      return context;
    }
    selected.set(context, 'cpu raster (local automatic startup disabled; no GPU service found)');
    return context;
  };
  const apply = (next: KilnToolContext) => {
    context.viewRenderPort = next.viewRenderPort;
    context.captureCacheIdentity = next.captureCacheIdentity;
    selected.set(context, describeRenderMode(next));
  };
  apply(await select());
  context.viewRenderState = () => ({
    viewRenderPort: context.viewRenderPort,
    captureCacheIdentity: context.captureCacheIdentity,
  });
  let refreshing: Promise<import('./render-capabilities').RenderCapabilities> | undefined;
  context.reprobeRenderer = () => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      apply(await select());
      return context.renderCapabilities!();
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  };
  return context;
}
