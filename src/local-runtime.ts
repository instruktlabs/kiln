import type { KilnToolContext } from './tools/registry';
import {
  DEFAULT_EVALUATOR_MAX_GLB_BYTES,
  DEFAULT_EVALUATOR_MAX_RESPONSE_BYTES,
  MAX_EVALUATOR_DEADLINE_MS,
  MAX_EVALUATOR_GLB_BYTES,
  MAX_EVALUATOR_RESPONSE_BYTES,
  type EvaluatorPortV2,
} from './evaluator/protocol';
import { renderGLBViaSubprocess } from './evaluator/subprocess';
import { renderGLBViaIsolatedEvaluator } from './evaluator/isolation';
import { renderGLBInProcess, resolveEvaluatorMode, type RenderGlbOptions } from './render';
import { FileProgramStore } from './program-store-node';
import { createCachedEvaluatorPort, MemoryBuildCache } from './build-cache';
import { resolveGltfExporter } from './community-exporter';
import { FileBuildCache } from './build-cache-node';
import { installedRuntimeIdentity } from './runtime-identity';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Console } from 'node:console';
import { MAX_PROGRAM_BYTES } from './program-store';
import { ApprovedTextureResourceCache, approvedTextureCatalogV1 } from './material-resources';
import { FileWorkspace } from './workspace-node';
import { FileLiveReview } from './live-review-node';
import {
  localProgramStoreDirectory,
  localWorkspaceLocation,
  pathInsideRoot,
  WorkspaceFileError,
  type WorkspaceLocation,
} from './workspace-location';
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
  /** Installed runtime identity: worker bytes, installed dependencies and Node/platform. */
  runtimeIdentity?: string;
  /** The dist build identity alone; `.kiln/workspace.json` records the same value. */
  buildIdentity?: string;
}

let scope = 0;

/** How the workspace root was chosen, worded for an agent that has to act on it. */
const ROOT_CHOSEN_BY: Record<WorkspaceLocation['selectedBy'], string> = {
  KILN_WORKSPACE: 'set by KILN_WORKSPACE',
  KILN_PROGRAM_STORE: 'the folder above the .kiln of KILN_PROGRAM_STORE',
  cwd: "the server's working directory; KILN_WORKSPACE is not set",
};

/**
 * Reads a program file inside the workspace, so a code-mode harness can hand Kiln a path
 * instead of quoting a program into an argument. The path is relative to the root or
 * absolute below it; `..`, another drive and a link that resolves outside the root are
 * refused. Every refusal names the root and the setting that chose it, so an agent working
 * in another folder can correct itself in one turn (#423); the MCP host keeps this one
 * local path in the error. The size bound is the program store's.
 */
function workspaceSourceReader(location: WorkspaceLocation): (file: string) => Promise<string> {
  const { root } = location;
  const where = `${root} (${ROOT_CHOSEN_BY[location.selectedBy]})`;
  const fix =
    location.selectedBy === 'cwd'
      ? ' To read from another folder, start the agent there or set KILN_WORKSPACE to a folder prepared by kiln-init, then restart the MCP session.'
      : '';
  const outside = (file: string, how = 'is') =>
    new WorkspaceFileError(
      `file ${file} ${how} outside the workspace ${where}. Write the program below that folder and name it relative to it, or pass code or programRef.${fix}`,
      root,
    );
  return async (file) => {
    const segments = file.split(/[\\/]/u);
    const absolute = isAbsolute(file);
    if (
      !file ||
      // A drive-relative path (C:name) or, off Windows, any drive path: neither names a
      // place below this root.
      (!absolute && /^[A-Za-z]:/u.test(file)) ||
      segments.includes('..') ||
      (!absolute && segments.includes(''))
    )
      throw new WorkspaceFileError(
        `file ${file} must name a program inside the workspace ${where}: a path relative to that folder, such as assets/asset.kiln.js, or an absolute path inside it, with no "..". Or pass code or programRef.${fix}`,
        root,
      );
    // The root may itself be reached through a link (macOS /var, a Windows junction).
    const realRoot = await realpath(root).catch(() => root);
    if (absolute && !pathInsideRoot(root, file) && !pathInsideRoot(realRoot, file))
      throw outside(file);
    const path = absolute ? resolve(file) : resolve(root, file);
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile())
      throw new WorkspaceFileError(
        `file ${file} was not found in the workspace ${where}. Name it relative to that folder or as an absolute path inside it, or pass code or programRef.${fix}`,
        root,
      );
    // Links are followed, so the file actually read must stay below the root too.
    const real = await realpath(path);
    if (!pathInsideRoot(realRoot, real)) throw outside(file, 'resolves through a link');
    if (info.size > MAX_PROGRAM_BYTES)
      throw new Error(
        `file ${file} exceeds the ${MAX_PROGRAM_BYTES / (1024 * 1024)} MiB source limit.`,
      );
    return readFile(real, 'utf8');
  };
}

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

/**
 * The evaluator mode a local CLI/MCP host runs in, without building a host context. A cheap
 * offline command such as `kiln validate` needs this one fact and none of the rest, so the
 * default lives here rather than being spelled a second time at the call site.
 */
export function localEvaluatorMode(
  env: Record<string, string | undefined> = process.env,
): LocalExecution['mode'] {
  return resolveEvaluatorMode({ KILN_EVALUATOR_MODE: env.KILN_EVALUATOR_MODE ?? 'subprocess' });
}

/** Local CLI/MCP host defaults; library callers retain explicit evaluator choice. */
export function createLocalToolContext(
  base: KilnToolContext = {},
  env: Record<string, string | undefined> = process.env,
): KilnToolContext & { localExecution: LocalExecution } {
  const location: WorkspaceLocation =
    !env.KILN_WORKSPACE && base.programStore instanceof FileProgramStore
      ? {
          root: dirname(dirname(base.programStore.directory)),
          selectedBy: 'KILN_PROGRAM_STORE',
        }
      : localWorkspaceLocation(env);
  const workspaceRoot = location.root;
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
  const indexPolicy = base.indexPolicy ?? env.KILN_INDEX_POLICY ?? 'indexed';
  if (indexPolicy !== 'indexed' && indexPolicy !== 'asBuilt')
    throw new Error('KILN_INDEX_POLICY must be indexed or asBuilt.');
  if (!['warn', 'strict'].includes(geometryPolicy))
    throw new Error('KILN_GEOMETRY_POLICY must be warn or strict.');
  const mode = localEvaluatorMode(env);
  const deadlineMs = integer(env, 'KILN_EVALUATOR_TIMEOUT_MS', 60000, 1, MAX_EVALUATOR_DEADLINE_MS);
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
  // Host-only, like the deadline: no tool argument reaches it.
  const maxGlbBytes = integer(
    env,
    'KILN_EVALUATOR_MAX_GLB_BYTES',
    DEFAULT_EVALUATOR_MAX_GLB_BYTES,
    1,
    MAX_EVALUATOR_GLB_BYTES,
  );
  const gltfExporter = resolveGltfExporter(env.KILN_GLTF_EXPORTER ?? 'legacy');
  // Base64 is 4/3 of the GLB; the rest is room for its review data. 16 MiB gives the default 32.
  const maxResponseBytes = Math.min(
    MAX_EVALUATOR_RESPONSE_BYTES,
    Math.max(DEFAULT_EVALUATOR_MAX_RESPONSE_BYTES, Math.ceil(maxGlbBytes * 1.5) + 8 * 1024 * 1024),
  );
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
        indexPolicy,
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
      try {
        if (mode === 'isolated') return await renderGLBViaIsolatedEvaluator(code, resolved, limits);
        return await renderGLBViaSubprocess(code, resolved, {
          ...limits,
          ...(!process.versions.bun ? { maxHeapMb: heapMb } : {}),
        });
      } catch (error) {
        // The worker returns only a closed cause; the host still has the source.
        const { withSourceCheck } = await import('./evaluator/source-check');
        throw withSourceCheck(error, code);
      }
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
    indexPolicy,
    programStore: base.programStore ?? new FileProgramStore(localProgramStoreDirectory(env)),
    ...(base.readSourceFile
      ? { readSourceFile: base.readSourceFile }
      : { readSourceFile: workspaceSourceReader(location), sourceWorkspace: location }),
    evaluatorPort,
    assetBuildOptions: {
      gltfExporter,
      optimize,
      instance,
      geometryPolicy,
      indexPolicy,
      qaMode: env.KILN_QA_MODE ?? 'enforce',
      evaluatorMode: mode,
    },
    buildCache: new MemoryBuildCache(),
    evaluatorCacheIdentity: `kiln-local-${process.pid}-${++scope}:${JSON.stringify({ mode, optimize, instance, geometryPolicy, indexPolicy, qa: env.KILN_QA_MODE, deadlineMs, heapMb })}`,
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
            indexPolicy: options?.indexPolicy ?? context.indexPolicy,
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
      if (identity.identity) {
        context.localExecution.runtimeIdentity = identity.identity;
        context.localExecution.buildIdentity = identity.buildIdentity;
      } else context.localExecution.cacheReason = identity.reason;
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
    indexPolicy: context.indexPolicy,
    timezone: env.TZ,
    ...(env.KILN_GLTF_EXPORTER === 'three' ? { gltfExporter: 'three' } : {}),
  })}`;
  context.localExecution = {
    ...context.localExecution,
    cacheScope: 'disk',
    cacheBytes,
    runtimeIdentity: identity.identity,
    buildIdentity: identity.buildIdentity,
  };
  return managed();
}
