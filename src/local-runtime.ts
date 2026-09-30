import type { KilnToolContext } from './tools/registry';
import type { EvaluatorPortV2 } from './evaluator/protocol';
import { renderGLBViaSubprocess } from './evaluator/subprocess';
import { renderGLBViaIsolatedEvaluator } from './evaluator/isolation';
import { renderGLBInProcess, resolveEvaluatorMode, type RenderGlbOptions } from './render';
import { FileProgramStore } from './program-store-node';
import { createCachedEvaluatorPort, MemoryBuildCache } from './build-cache';
import { resolveGltfExporter } from './community-exporter';
import { FileBuildCache } from './build-cache-node';
import { installedRuntimeIdentity } from './runtime-identity';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Console } from 'node:console';
import { ApprovedTextureResourceCache, approvedTextureCatalogV1 } from './material-resources';
import { FileWorkspace, localWorkspaceRoot } from './workspace-node';
import { FileLiveReview } from './live-review-node';
import { localProgramStoreDirectory } from './workspace-location';
import { exportWorkspaceProjectBundle } from './project-bundle-node';

export interface LocalExecution {
  mode: 'in-process' | 'subprocess' | 'isolated';
  terminable: boolean;
  deadlineMs?: number;
  nodeHeapMb?: number;
  maxGlbBytes?: number;
  maxResponseBytes?: number;
  totalMemoryLimited: false;
  cacheScope: 'process' | 'disk' | 'disabled';
  cacheBytes?: number;
  cacheReason?: string;
  runtimeIdentity?: string;
}

let scope = 0;
function integer(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} requires an integer from ${min} to ${max}.`);
  return value;
}

/** Local CLI/MCP host defaults; library callers retain explicit evaluator choice. */
export function createLocalToolContext(
  base: KilnToolContext = {},
  env: Record<string, string | undefined> = process.env,
): KilnToolContext & { localExecution: LocalExecution } {
  const workspaceRoot = env.KILN_WORKSPACE
    ? resolve(env.KILN_WORKSPACE)
    : base.programStore instanceof FileProgramStore
      ? dirname(dirname(base.programStore.directory))
      : localWorkspaceRoot(env);
  const workspace = base.workspace ?? new FileWorkspace(workspaceRoot, env.KILN_PROJECT);
  const projectStore =
    base.projectStore ?? (workspace instanceof FileWorkspace ? workspace.projects : undefined);
  const liveReview =
    base.liveReview ??
    (env.KILN_LIVE_REVIEW === 'off'
      ? undefined
      : new FileLiveReview(workspaceRoot, {
          transport: 'cli',
          workId: env.KILN_WORK_ITEM,
        }));
  const geometryPolicy = base.geometryPolicy ?? env.KILN_GEOMETRY_POLICY ?? 'warn';
  if (!['warn', 'strict'].includes(geometryPolicy))
    throw new Error('KILN_GEOMETRY_POLICY must be warn or strict.');
  const mode = resolveEvaluatorMode({
    KILN_EVALUATOR_MODE: env.KILN_EVALUATOR_MODE ?? 'subprocess',
  });
  const deadlineMs = integer(env, 'KILN_EVALUATOR_TIMEOUT_MS', 60000, 1, 120000);
  const heapMb = integer(env, 'KILN_EVALUATOR_HEAP_MB', 512, 64, 4096);
  if (mode === 'subprocess' && process.versions.bun && env.KILN_EVALUATOR_HEAP_MB !== undefined) {
    throw new Error('KILN_EVALUATOR_HEAP_MB requires the packaged Node runtime.');
  }
  if (mode !== 'in-process' && ['observe', 'off'].includes(env.KILN_QA_MODE ?? '')) {
    throw new Error(
      'KILN_QA_MODE overrides are not transported to the local worker. Remove the override or explicitly select trusted KILN_EVALUATOR_MODE=in-process.',
    );
  }
  const optimize = ['auto', 'palette', 'full'].includes(env.KILN_BAKE_OPTIMIZE ?? '')
    ? (env.KILN_BAKE_OPTIMIZE as RenderGlbOptions['optimize'])
    : 'off';
  const instance = ['off', 'auto', 'on'].includes(env.KILN_BAKE_INSTANCE ?? '')
    ? (env.KILN_BAKE_INSTANCE as RenderGlbOptions['instance'])
    : 'auto';
  const maxGlbBytes = 16 * 1024 * 1024;
  const gltfExporter = resolveGltfExporter(env.KILN_GLTF_EXPORTER ?? 'legacy');
  const maxResponseBytes = 32 * 1024 * 1024;
  // Keep authored diagnostics off the CLI JSON and MCP stdio channels. The
  // subprocess already isolates stdout; this sink covers trusted local evaluation.
  const diagnosticConsole = new Console({ stdout: process.stderr, stderr: process.stderr });
  // Worker protocols do not transport parent resolver capabilities. A fresh cache
  // describes their embedded resources without inheriting a parent byte resolver.
  const workerTextures = mode === 'in-process' ? undefined : new ApprovedTextureResourceCache();
  const evaluatorPort: EvaluatorPortV2 = {
    async render(code, options = {}, controls = {}) {
      if (controls.signal?.aborted) {
        const { EvaluatorPortError } = await import('./evaluator/protocol');
        throw new EvaluatorPortError('CANCELLED');
      }
      if (
        options.geometryPolicy !== undefined &&
        !['warn', 'strict'].includes(options.geometryPolicy)
      )
        throw new Error('geometryPolicy must be warn or strict');
      const resolved: RenderGlbOptions = {
        gltfExporter,
        optimize,
        instance,
        ...options,
        ...(workspace.current()?.materialResources.records.length
          ? { materialResources: workspace.current()!.materialResources }
          : {}),
        geometryPolicy: geometryPolicy === 'strict' ? 'strict' : (options.geometryPolicy ?? 'warn'),
      };
      if (mode === 'in-process') {
        const result = await renderGLBInProcess(code, { ...resolved, diagnosticConsole });
        if (controls.signal?.aborted) {
          const { EvaluatorPortError } = await import('./evaluator/protocol');
          throw new EvaluatorPortError('CANCELLED');
        }
        return result;
      }
      const limits = { deadlineMs, maxGlbBytes, maxResponseBytes, ...controls };
      if (mode === 'isolated') return renderGLBViaIsolatedEvaluator(code, resolved, limits);
      return renderGLBViaSubprocess(code, resolved, {
        ...limits,
        ...(!process.versions.bun ? { maxHeapMb: heapMb } : {}),
      });
    },
  };
  const localExecution: LocalExecution = {
    mode,
    terminable: mode !== 'in-process',
    ...(mode !== 'in-process' ? { deadlineMs } : {}),
    ...(mode === 'subprocess' && !process.versions.bun ? { nodeHeapMb: heapMb } : {}),
    ...(mode !== 'in-process' ? { maxGlbBytes, maxResponseBytes } : {}),
    totalMemoryLimited: false,
    cacheScope: 'process',
  };
  return {
    ...base,
    workspace,
    projectStore,
    projectBundleReader:
      base.projectBundleReader ??
      (workspace instanceof FileWorkspace && base.assetLibrary
        ? (projectId, revisionId, profile) =>
            exportWorkspaceProjectBundle(workspace, base.assetLibrary!, projectId, {
              revisionId,
              profile,
            })
        : undefined),
    materialLibrary:
      base.materialLibrary ??
      (workspace instanceof FileWorkspace ? workspace.materials : undefined),
    liveReview,
    reviewStore:
      base.reviewStore ?? (liveReview instanceof FileLiveReview ? liveReview : undefined),
    approvedTextureResources: () => approvedTextureCatalogV1({ cache: workerTextures }),
    geometryPolicy: geometryPolicy as 'warn' | 'strict',
    programStore: base.programStore ?? new FileProgramStore(localProgramStoreDirectory(env)),
    evaluatorPort,
    assetBuildOptions: {
      gltfExporter,
      optimize,
      instance,
      geometryPolicy,
      qaMode: env.KILN_QA_MODE ?? 'enforce',
      evaluatorMode: mode,
    },
    buildCache: new MemoryBuildCache(),
    evaluatorCacheIdentity: `kiln-local-${process.pid}-${++scope}:${JSON.stringify({ mode, optimize, instance, geometryPolicy, qa: env.KILN_QA_MODE, deadlineMs, heapMb })}`,
    localExecution,
  };
}

/** Packaged Node provenance is independent of reuse; non-disk hosts scan on first save. */
export async function createPackagedLocalToolContext(
  base: KilnToolContext = {},
  env: Record<string, string | undefined> = process.env,
  installationRoot = fileURLToPath(new URL('../', import.meta.url)),
): Promise<KilnToolContext & { localExecution: LocalExecution }> {
  const context = createLocalToolContext(base, env);
  const managed = () => {
    const identity = context.evaluatorCacheIdentity;
    const cached = createCachedEvaluatorPort(context.evaluatorPort!, {
      cache: context.buildCache!,
      identity: () => (typeof identity === 'function' ? identity() : identity),
    });
    // Normalize host defaults before keying, so tools and CLI exports share a build.
    context.evaluatorPort = {
      render: (code, options, controls) =>
        cached.render(
          code,
          {
            ...options,
            ...(context.workspace?.current()?.materialResources.records.length
              ? { materialResources: context.workspace.current()!.materialResources }
              : {}),
            geometryPolicy:
              context.geometryPolicy === 'strict'
                ? 'strict'
                : (options?.geometryPolicy ?? context.geometryPolicy),
          },
          controls,
        ),
    };
    context.evaluatorCacheManaged = true;
    return context;
  };
  const policy = env.KILN_BUILD_CACHE ?? 'disk';
  if (!['disk', 'memory', 'off'].includes(policy))
    throw new Error('KILN_BUILD_CACHE must be disk, memory, or off.');
  const packagedNode =
    !process.versions.bun &&
    !import.meta.url.endsWith('.ts') &&
    context.localExecution.mode === 'subprocess';
  let pendingIdentity: ReturnType<typeof installedRuntimeIdentity> | undefined;
  const identityForHost = () =>
    (pendingIdentity ??= installedRuntimeIdentity(installationRoot).then((identity) => {
      if (identity.identity) context.localExecution.runtimeIdentity = identity.identity;
      else context.localExecution.cacheReason = identity.reason;
      return identity;
    }));
  if (packagedNode) {
    context.prepareBuildProvenance = async () => {
      await identityForHost();
    };
  }
  if (policy === 'off' || base.cacheEvaluations === false) {
    context.cacheEvaluations = false;
    context.localExecution.cacheScope = 'disabled';
    return context;
  }
  if (policy === 'memory') return managed();
  if (!packagedNode) {
    context.localExecution.cacheReason =
      'Disk reuse requires the packaged Node subprocess evaluator; this host uses process memory.';
    return managed();
  }
  const identity = await identityForHost();
  if (!identity.identity) {
    context.localExecution.cacheReason = identity.reason;
    return managed();
  }
  const cacheBytes = integer(env, 'KILN_BUILD_CACHE_MB', 128, 0, 1024) * 1024 * 1024;
  const store = context.programStore;
  const directory = resolve(
    env.KILN_BUILD_CACHE_DIR ??
      join(
        store instanceof FileProgramStore ? dirname(store.directory) : '.kiln',
        'cache',
        'builds',
      ),
  );
  context.buildCache = new FileBuildCache(directory, cacheBytes);
  context.evaluatorCacheIdentity = `${identity.identity}:${JSON.stringify({
    execution: context.localExecution,
    optimize: env.KILN_BAKE_OPTIMIZE ?? 'off',
    instance: env.KILN_BAKE_INSTANCE ?? 'auto',
    qa: env.KILN_QA_MODE ?? 'enforce',
    geometryPolicy: context.geometryPolicy,
    timezone: env.TZ,
    ...(env.KILN_GLTF_EXPORTER === 'three' ? { gltfExporter: 'three' } : {}),
  })}`;
  context.localExecution = {
    ...context.localExecution,
    cacheScope: 'disk',
    cacheBytes,
    runtimeIdentity: identity.identity,
  };
  return managed();
}
