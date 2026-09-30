import {
  MemoryCaptureCache,
  createCachedRenderPort,
  type CaptureCache,
} from '../views/capture-cache';
/** Shared definitions for the program-reference MCP and native authoring workflows. */

import { z } from 'zod';
import { assetManifestSchema } from '../assets';
import {
  MemoryProgramStore,
  retainProgram,
  programReference,
  programRefPattern,
  type ProgramStore,
} from '../program-store';
import { assertSavedRequirementsAuthorized } from '../requirements-assets';
import { createKilnSourceDef, withProgramReferences } from './programs';
import { ProgramArtifactStore, type NativeCompletion } from './program-artifacts';
import { createKilnDiscoveryDef } from './discovery';
import { createKilnProjectDef } from './projects';
import { listAssetCatalog } from '../asset-catalog';
import { createKilnMaterialDef } from './materials';
import { createKilnReviewDef, type ReviewStore } from './review';
import { withWorkspaceContext } from './workspace';
import {
  compactReviewResult,
  partsHint,
  reviewDetailInput,
  type ReviewDetail,
} from './review-detail';
import { createCachedEvaluatorPort, MemoryBuildCache, type BuildCache } from '../build-cache';
import * as THREE from 'three';

import { validate, type ValidationIssue } from '../validation';
import { appendSourceCheck } from '../evaluator/source-check';
import { inspectSceneStructure, renderSceneToGLB, type RenderResult } from '../render';
import type { AssetCategory, AssetIntentV1 } from '../contracts';
import type { AssetQaReport } from '../qa';
import type { RequirementsBinding } from '../requirements-store';
import {
  assertNoLegacyRuntimePolicy,
  createRequirementsCheckpoint,
  resolveRequirementsContext,
  type RequirementsContext,
} from '../requirements-context';
import type {
  DerivativeReviewFidelityV1,
  DerivativeViewReceiptV1,
  PbrRenderPort,
  ViewFidelityReasonCode,
  ViewFidelityV1,
  ViewEvidenceHistoryV1,
} from '../composer/render-port';
import type { ViewGridResult } from '../views';
import type { EvaluatorExecutionProfileV2, EvaluatorPortV2 } from '../evaluator';
import { resolveEvaluatorPortV2 } from '../evaluator';
import { sceneNeedsPbrShading } from '../material-resources';
import { KilnDraftBuffer } from '../edit-buffer';
// `agent/diff` has no imports of its own -- it is pure string work -- so this
// does not put an agent-SDK edge into the `kiln/tools` graph.
import { unifiedDiff } from '../agent/diff';
import type { GenerationCallBudget } from '../agent/call-budget';
import {
  resolveViewRenderTimeoutMs,
  type ViewRenderTimeoutContextProvider,
  type ViewRenderTimeoutResolver,
} from '../agent/view-render-timeout';
import { ViewEvidenceHistoryStore } from '../views/evidence-history';
import { BACKDROP_IDS, DEFAULT_BACKDROP_ID, type BackdropId } from '../views/background';
import { MAX_CAPTURE_SHOT_SIZE } from '../views/capture-limits';
import type { TextureUsage } from '../textures';

// =============================================================================
// Tool definition contract
// =============================================================================

export const KILN_ASSET_WIDGET_URI = 'ui://kiln/asset-v5.html';
export interface KilnToolDef {
  outputSchema?: z.ZodType;
  /** Optional MCP App presentation; metadata is hidden from the language model. */
  ui?: {
    resourceUri: string;
    data(output: unknown): Promise<Record<string, unknown>>;
  };
  annotations?: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  /** Stable tool name exposed to the model (in-process and over MCP). */
  name: string;
  /** Model-facing description shared by transports and current authoring guidance. */
  description: string;
  /** Zod schema for the tool input. */
  inputSchema: z.ZodType;
  /** Execute the tool. Returns JSON-serializable output. */
  run(input: unknown): Promise<unknown>;
  /**
   * Extract media from a `run()` output, for transports that can show the
   * model images (Strands ImageBlock tool results, MCP image content). Returns
   * the PNG bytes plus the JSON payload to send alongside them (the output
   * with any embedded base64 stripped, so the image is never double-encoded).
   * Transports without image support just use the raw `run()` output.
   */
  media?(output: unknown): { png: Uint8Array; json: unknown } | undefined;
  /**
   * Like {@link media} but for tools that return MULTIPLE images in one result
   * (kiln_screenshot_animation in perFrame mode → N frame PNGs). Transports that
   * support image arrays attach all PNGs as separate blocks; those that don't fall
   * back to {@link media} (a composite) or the raw output. Checked before `media`.
   */
  mediaMulti?(output: unknown): { pngs: Uint8Array[]; json: unknown } | undefined;
  /**
   * Reshape a `run()` output for a text transport.
   *
   * The default MCP serialization is `JSON.stringify(output, null, 2)`, which is
   * right for a result whose fields the model needs to read individually. It is
   * wrong for a result that already contains a rendered human-readable form of
   * itself, because then the wire carries the same information twice.
   *
   * `kiln_discover` is the case that forced this: it returns 92 entries
   * as a structured array (48 KB) AND as formatted text (36 KB), and pretty
   * printing the pair sent 90 KB for one call. Harnesses differ in how they cope
   * and one of them copes badly -- OpenCode truncates a result that large, spills
   * the full copy to a file, and hands the model a cut-off catalog plus the job
   * of reassembling it. A dispatched model spent twenty-two minutes grepping that
   * file and never wrote a program.
   *
   * In-process callers still get the structured array from `run()`; only the
   * wire representation changes.
   */
  text?(output: unknown): string | undefined;
}

/**
 * Host-owned context captured by tool closures. This object is never part of a
 * model-facing input schema. One bound registry belongs to one task/asset lineage;
 * hosts running independent assets construct separate contexts. Generated source
 * cannot replace the host binding or turn descriptive labels into QA policy.
 */
export interface KilnToolContext {
  projectBundleReader?: import('./projects').ProjectBundleReader;
  materialLibrary?: import('../material-library').MaterialLibrary;
  reviewStore?: ReviewStore;
  /** Shared workspace projects, supplied only by hosts that support persistent project operations. */
  projectStore?: import('../projects').ProjectStore;
  /** Host-owned immutable project/material binding for each concurrent invocation. */
  workspace?: import('../workspace').WorkspacePort;
  /** Passive host observation. Never required for evaluation or structural QA. */
  liveReview?: import('../live-review').LiveReviewPort;
  /** Snapshot a host-owned render connection at the start of a view operation.
   * The callback survives context copies; one operation keeps one connection. */
  viewRenderState?: () => Pick<KilnToolContext, 'viewRenderPort' | 'captureCacheIdentity'>;
  /** Explicitly reconsider the existing host selection, without installing or rendering. */
  reprobeRenderer?: () => Promise<import('../render-capabilities').RenderCapabilities>;
  /** Host-owned read-only status; Discovery must never invoke the image port to probe readiness. */
  renderCapabilities?: () => Promise<import('../render-capabilities').RenderCapabilities>;
  /** Resolver configuration for this evaluator only. Read descriptors without resolving bytes. */
  approvedTextureResources?: () => import('../material-resources').ApprovedTextureCatalogEntryV1[];
  /** Native harness snapshot reader; absent from CLI/MCP and ordinary inline runs. */
  skillResourceReader?: import('../agent/skill-resources').SkillResourceReader;
  /** Durable user collections, supplied by the host; never a disposable build cache. */
  assetLibrary?: import('../assets').AssetLibrary;
  /** Host-owned delivery URLs, for example expiring HTTPS links or a running local viewer. */
  assetDownloadUrls?: (
    collection: string,
    assetId: string,
    revisionId: string,
  ) => Promise<Record<string, string>>;
  /** Effective host defaults, captured for saved build provenance. */
  assetBuildOptions?: Record<string, unknown>;
  geometryPolicy?: import('../geometry-export').GeometryExportPolicy;
  localExecution?: import('../local-runtime').LocalExecution;
  /** Host-only, lazy provenance scan for saved builds; independent of evaluator reuse. */
  prepareBuildProvenance?: () => Promise<void>;
  evaluationControls?: () => import('../evaluator/protocol').EvaluatorPortCallControlsV2;
  captureLimits?: import('../views/capture-limits').CaptureLimits;
  captureCache?: CaptureCache;
  captureCacheIdentity?: string | (() => string | undefined | Promise<string | undefined>);
  cacheCaptures?: boolean;
  /** Disposable evaluated artifacts; source persistence is independently owned by programStore. */
  buildCache?: BuildCache;
  /** Host-declared engine/dependency identity for an injected evaluator. Omit to disable its reuse. */
  evaluatorCacheIdentity?: string | (() => string | undefined);
  /** The local host already wrapped its evaluator; avoid applying the cache twice. */
  evaluatorCacheManaged?: boolean;
  /** Public registries reuse compatible local builds by default. */
  cacheEvaluations?: boolean;
  /** Fail image requests rather than substitute CPU when GPU rendering is required. */
  viewRenderRequired?: boolean;
  /** Optional shared source store for the reference-based tool surface. */
  programStore?: ProgramStore;
  /** Private evaluated revisions for native completion; never accepted as tool input. */
  programArtifacts?: ProgramArtifactStore;
  /** Host binding, snapshotted before each evaluation. Omit for neutral authoring. */
  requirements?: RequirementsBinding;
  /** Retained only to issue an explicit migration error; never executed. */
  intent?: AssetIntentV1;
  /** Retained only to issue an explicit migration error; never executed. */
  category?: AssetCategory;
  /** Host-owned material acceptance contract. The model cannot weaken it through
   * generated source or tool input. Each required usage must be backed by an
   * exact baked procedural texture binding in the rendered GLB. */
  requiredProceduralTextureUsages?: readonly RequiredProceduralTextureUsage[];
  /**
   * Host-injected GPU renderer for the in-loop view grid. Absent by default, and
   * absent means every render stays on the CPU rasterizer — byte-identical to the
   * behavior before this existed.
   *
   * The engine never opens a socket itself (AGENTS.md): the host owns the HTTP
   * adapter, auth, and configuration, and {@link captureViewsViaPort} stays the
   * single owner of the deadline, PNG validation, grid composition, and the
   * never-throw CPU fallback. This field is the injection point, nothing more.
   */
  viewRenderPort?: PbrRenderPort;
  /**
   * Deadline for ONE in-loop port call. Deliberately separate from the deadline
   * the host uses for the post-loop artifact sheet, and expected to be far
   * shorter: nothing waits on the artifact sheet, whereas an in-loop render
   * blocks the agent mid-thought. A slow GPU must fall back to the CPU raster
   * quickly rather than stall the loop. Defaults to
   * {@link DEFAULT_INLOOP_VIEW_RENDER_TIMEOUT_MS}.
   */
  viewRenderTimeoutMs?: number;
  /** Dynamic host state sampled immediately before every port call. */
  viewRenderTimeoutContext?: ViewRenderTimeoutContextProvider;
  /** Host policy for deriving one deadline from warm-up/budget state. */
  viewRenderTimeoutResolver?: ViewRenderTimeoutResolver;
  /**
   * Host tally hook, called once per in-loop grid with whoever actually drew it.
   *
   * Reporting rides this callback rather than the tool's OUTPUT so the decision
   * stays invisible to the model's own reasoning, and rides neither the input
   * schema nor the description so the cached tool definition is untouched (the
   * program's schema/prompt-invalidation window is reserved — see the P6 rule).
   * Never throws into the render path: a host callback that throws is swallowed.
   */
  onViewsRendered?(event: InLoopViewRender): void;
  /**
   * Optional host-owned visual observer for authors that cannot consume image
   * input. When present, media-bearing tool results are sent here out of band
   * and the author receives only the returned structured observation plus the
   * ordinary JSON metrics. Raw pixels never enter the author transcript.
   *
   * The engine does not construct a model or network client. Studio owns the
   * observer model, prompt, schema validation, deadline, accounting, and retry
   * policy. A port failure degrades to an explicit unavailable marker rather
   * than leaking the image or failing the render tool.
   */
  renderObservationPort?: RenderObservationPort;
  /** Shared generation-global allowance, forwarded to the host observer port. */
  generationCallBudget?: GenerationCallBudget;
  /** Shared bounded hash-only evidence ledger for one agent/tool session. */
  viewEvidenceHistory?: ViewEvidenceHistoryStore;
  /** Host-owned generated-source execution boundary. Production selects
   * `evaluator-required`; trusted local/test callers may retain the explicit
   * compatibility profile. */
  evaluatorPort?: EvaluatorPortV2;
  evaluatorProfile?: EvaluatorExecutionProfileV2;
}

export type RequiredProceduralTextureUsage = Extract<
  TextureUsage,
  'albedo' | 'normal' | 'metallicRoughness' | 'emissive'
>;

export interface ProceduralTextureMaterialContract {
  required: RequiredProceduralTextureUsage[];
  present: RequiredProceduralTextureUsage[];
  missing: RequiredProceduralTextureUsage[];
}

function proceduralTextureMaterialContract(
  rendered: RenderResult,
  context: KilnToolContext,
): ProceduralTextureMaterialContract | undefined {
  const required = [...new Set(context.requiredProceduralTextureUsages ?? [])];
  if (required.length === 0) return undefined;
  const available = new Set(
    (rendered.bakedTextures ?? []).map((entry) => entry.usage as RequiredProceduralTextureUsage),
  );
  const present = required.filter((usage) => available.has(usage));
  const missing = required.filter((usage) => !available.has(usage));
  return { required, present, missing };
}

function missingProceduralTextureResult(
  rendered: RenderResult,
  context: KilnToolContext,
):
  | {
      ok: false;
      error: string;
      materialContract: ProceduralTextureMaterialContract;
      warnings: string[];
      requirements?: RequirementsContext;
      qaReport?: AssetQaReport;
    }
  | undefined {
  const materialContract = proceduralTextureMaterialContract(rendered, context);
  if (!materialContract || materialContract.missing.length === 0) return undefined;
  const missing = materialContract.missing.join(', ');
  return {
    ok: false,
    error:
      `Material contract missing procedural texture usages: ${missing}. ` +
      'Create and bind each missing usage through pbrMaterial; derive a normal with ' +
      'normalMapFromHeight when appropriate, then render the corrected buffer again.',
    materialContract,
    requirements: rendered.requirements,
    warnings: [...rendered.warnings],
    ...(rendered.meta.qaReport ? { qaReport: rendered.meta.qaReport as AssetQaReport } : {}),
  };
}

/** JSON-safe value accepted from a host visual observer. */
export type RenderObservationValue =
  | null
  | boolean
  | number
  | string
  | RenderObservationValue[]
  | { [key: string]: RenderObservationValue };

/** Evidence passed to a host visual observer, never to the author model. */
export interface RenderObservationInput {
  /** Model-facing tool that produced the evidence. */
  toolName: string;
  /** One grid PNG for ordinary render/inspect, or multiple animation frames. */
  pngs: readonly Uint8Array[];
  /** The same base64-free metrics JSON a direct-vision author would receive. */
  json: unknown;
  /** Trusted request intent, when the host supplied one. */
  intent?: AssetIntentV1;
  /** Current host binding and neutral policy receipt, independent of generated labels. */
  requirements?: RequirementsContext;
  /**
   * Shared generation-global allowance. The host must debit role `observer`
   * immediately before each actual provider dispatch; image preparation,
   * sub-cap rejection, and other pre-dispatch failures must not consume it.
   */
  generationCallBudget?: GenerationCallBudget;
}

/** Host-injected, model-free engine seam for a bounded VLM observer. */
export type RenderObservationPort = (
  input: RenderObservationInput,
) => Promise<RenderObservationValue>;

/** One in-loop grid, and who drew it. Counted by the host, never shown to the model. */
export interface InLoopViewRender {
  /** The port's own renderer id when the GPU drew it; `cpu-raster` when it did not. */
  renderer: string;
  /** True when a port was injected and did not produce the grid. */
  degraded: boolean;
  /** Why the port was bypassed. Only set when `degraded`. */
  degradedReason?: string;
  /** Whether the scene held anything a flat raster cannot show (the routing predicate). */
  neededPbr: boolean;
}

/**
 * In-loop port deadline. Well under the engine's post-loop default because the
 * cost of waiting is completely different here: this one blocks the agent.
 */
export const DEFAULT_INLOOP_VIEW_RENDER_TIMEOUT_MS = 6000;

function resolveInLoopViewRenderTimeoutMs(
  context: KilnToolContext,
  requestKind: 'in-loop-grid' | 'derivative-cell',
): number {
  return resolveViewRenderTimeoutMs({
    requestKind,
    defaultTimeoutMs: DEFAULT_INLOOP_VIEW_RENDER_TIMEOUT_MS,
    ...(context.viewRenderTimeoutMs !== undefined
      ? { timeoutMs: context.viewRenderTimeoutMs }
      : {}),
    ...(context.viewRenderTimeoutContext
      ? { contextProvider: context.viewRenderTimeoutContext }
      : {}),
    ...(context.viewRenderTimeoutResolver ? { resolver: context.viewRenderTimeoutResolver } : {}),
  });
}

function toolRequirements(context: KilnToolContext): RequirementsContext {
  assertNoLegacyRuntimePolicy(context);
  return resolveRequirementsContext(context.requirements);
}

async function evaluateGeneratedSource(
  code: string,
  context: KilnToolContext,
  optimize: 'off' | 'auto' = 'off',
): Promise<RenderResult> {
  const requirements = toolRequirements(context);
  return resolveEvaluatorPortV2(
    context.evaluatorPort,
    context.evaluatorProfile ?? 'trusted-local',
  ).render(
    code,
    {
      optimize,
      ...(context.workspace?.current()?.materialResources.records.length
        ? { materialResources: context.workspace.current()!.materialResources }
        : {}),
      ...(context.geometryPolicy ? { geometryPolicy: context.geometryPolicy } : {}),
      ...(requirements.binding ? { requirements: requirements.binding } : {}),
    },
    context.evaluationControls?.(),
  );
}

interface EvaluationEvidence {
  requirements?: RequirementsContext;
  qaReport?: AssetQaReport;
}
function evaluationEvidence(rendered: RenderResult): EvaluationEvidence {
  return {
    requirements: rendered.requirements,
    ...(rendered.meta.qaReport ? { qaReport: rendered.meta.qaReport as AssetQaReport } : {}),
  };
}

async function loadEvaluatedReviewScene(code: string, context: KilnToolContext) {
  const rendered = await evaluateGeneratedSource(code, context);
  try {
    context.liveReview?.artifact(code, rendered);
  } catch {
    /* Optional observation. */
  }
  const { loadGlbReviewScene } = await import('../views');
  const scene = await loadGlbReviewScene(rendered.glb);
  return { rendered, ...scene };
}

const viewEvidenceHistoryByContext = new WeakMap<KilnToolContext, ViewEvidenceHistoryStore>();
const VIEW_EVIDENCE_GUIDANCE =
  ' viewEvidence.current describes ONLY this request. lastFaithful is older hash-only evidence for reference, not reused pixels and not current verification.';

function withViewEvidenceHistory(context: KilnToolContext): KilnToolContext {
  if (context.viewEvidenceHistory) return context;
  let history = viewEvidenceHistoryByContext.get(context);
  if (!history) {
    history = new ViewEvidenceHistoryStore();
    viewEvidenceHistoryByContext.set(context, history);
  }
  return { ...context, viewEvidenceHistory: history };
}

async function sha256Glb(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)),
  );
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Render one purpose-built review GLB. Generated source has already executed;
 * both GPU and geometry-flat fallback consume only the serialized derivative. */
async function renderDerivativeCell(
  input: import('../views').DerivativeCellRenderInput,
  context: KilnToolContext,
): Promise<import('../views').DerivativeCellRenderResult> {
  let derivativeRoot = input.root as THREE.Object3D;
  if (input.backfaceCull === false) {
    derivativeRoot = derivativeRoot.clone(true);
    derivativeRoot.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const prepare = (material: THREE.Material) => {
        const copy = material.clone();
        copy.side = THREE.DoubleSide;
        return copy;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(prepare)
        : prepare(mesh.material);
    });
  }
  // `withCameraVisibility` and `isolateSubtree` express isolation by clearing
  // `mesh.visible`. The CPU rasterizer culls on that flag (see views/raster.ts),
  // but glTF carries no per-mesh visibility, so serializing unfiltered ships the
  // hidden geometry to the GPU service and makes isolate a silent no-op on exactly
  // the material-faithful path it is most useful on. Prune on a copy: the caller
  // restores `.visible` afterwards and must not observe a mutated scene.
  let hasHidden = false;
  derivativeRoot.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.visible === false) hasHidden = true;
  });
  if (hasHidden) {
    if (derivativeRoot === (input.root as THREE.Object3D))
      derivativeRoot = derivativeRoot.clone(true);
    const drop: THREE.Object3D[] = [];
    derivativeRoot.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.visible === false) drop.push(node);
    });
    for (const node of drop) node.removeFromParent();
  }
  const rendered = await renderSceneToGLB(derivativeRoot, {
    // The scene here was loaded back from a GLB this engine already produced
    // and adjudicated. Submitting it for judgement a second time fails on the
    // round trip rather than on the asset: see `derivative` in render.ts.
    derivative: true,
    requirements: toolRequirements(context).binding,
  });
  const { cameraFromBounds, measureBounds } = await import('../views');
  const camera =
    input.camera ??
    cameraFromBounds(
      input.frameBounds ?? measureBounds(input.root),
      input.view.dir,
      1,
      undefined,
      measureBounds(input.root),
    );
  const derivativeGlb = Uint8Array.from(rendered.bytes);
  const inputGlbSha256 = await sha256Glb(derivativeGlb);
  let degradeReason: string | undefined;
  const derivativeReasonCodes: ViewFidelityReasonCode[] = [];

  if (context.viewRenderPort) {
    const { captureViewPngsViaPort } = await import('../views/port');
    const ported = await captureViewPngsViaPort(
      context.viewRenderPort,
      derivativeGlb,
      resolveInLoopViewRenderTimeoutMs(context, 'derivative-cell'),
      [input.view.dir],
      input.size,
      [camera],
      context.captureLimits,
      input.backdrop,
      context.evaluationControls?.(),
    );
    context.evaluationControls?.().signal?.throwIfAborted();
    if (ported.ok && ported.derivativeFidelityAttested) {
      if (ported.inputGlbSha256 !== inputGlbSha256) {
        throw new Error(
          `validated derivative receipt hash mismatch (${ported.inputGlbSha256} != ${inputGlbSha256})`,
        );
      }
      const receipt: DerivativeViewReceiptV1 = {
        version: 'kiln.view-fidelity.v1',
        derivativeLabel: input.label,
        camera,
        cameraFidelity: 'echo-validated',
        ...(ported.captureCache ? { captureCache: ported.captureCache } : {}),
        requested: 'full-preferred',
        delivered: 'full-material',
        materialFaithful: true,
        exactArtifact: false,
        rendererId: ported.rendererId,
        inputGlbSha256,
        degraded: false,
      };
      try {
        context.onViewsRendered?.({
          renderer: ported.rendererId,
          degraded: false,
          neededPbr: true,
        });
      } catch {
        /* best effort */
      }
      return { png: Buffer.from(ported.pngs[0]!), receipt };
    }
    if (ported.ok) {
      degradeReason = 'view render port returned no derivative material/hash receipt';
      derivativeReasonCodes.push('DERIVATIVE_RECEIPT_UNAVAILABLE');
    } else {
      degradeReason = ported.reason;
      if (ported.reason.includes('derivative receipt hash mismatch')) {
        derivativeReasonCodes.push('DERIVATIVE_RECEIPT_INVALID');
      }
    }
  } else if (input.gpuUnsupportedReasonCode) {
    degradeReason = 'GPU auto-framing cannot preserve the requested derivative focus bounds';
  } else {
    degradeReason = 'material-faithful view render port unavailable';
  }

  if (context.viewRenderRequired) throw new Error(`Required GPU render failed: ${degradeReason}`);
  const { renderGlbViewCell, CPU_RASTER_RENDERER_ID } = await import('../views');
  const produceFlat = async () =>
    renderGlbViewCell(derivativeGlb, input.view, {
      size: input.size,
      camera,
      ...(input.backdrop ? { backdrop: input.backdrop } : {}),
      ...(input.backfaceCull !== undefined ? { backfaceCull: input.backfaceCull } : {}),
      ...(input.frameBounds ? { frameBounds: input.frameBounds } : {}),
    });
  const flat: import('../views').GlbViewCellResult & {
    captureCache?: { hit: boolean };
  } = context.captureCache
    ? await (await import('../views/capture-cache')).captureCpuCell(
        context.captureCache,
        {
          artifactGlbSha256: inputGlbSha256,
          rendererId: CPU_RASTER_RENDERER_ID,
          camera,
          size: input.size,
          backfaceCull: input.backfaceCull ?? true,
          ...(input.backdrop ? { backdrop: input.backdrop } : {}),
        },
        produceFlat,
      )
    : await produceFlat();
  if (flat.inputGlbSha256 !== inputGlbSha256) {
    throw new Error(
      `derivative GLB fallback hash mismatch (${flat.inputGlbSha256} != ${inputGlbSha256})`,
    );
  }
  const reasonCodes = [
    'FULL_MATERIAL_RENDER_UNAVAILABLE',
    ...(input.gpuUnsupportedReasonCode ? [input.gpuUnsupportedReasonCode] : []),
    ...derivativeReasonCodes,
    ...flat.reasonCodes,
  ] as ViewFidelityReasonCode[];
  const receipt: DerivativeViewReceiptV1 = {
    version: 'kiln.view-fidelity.v1',
    derivativeLabel: input.label,
    camera,
    cameraFidelity: 'engine-resolved',
    ...(flat.captureCache
      ? {
          captureCache: {
            hit: flat.captureCache.hit,
            reused: flat.captureCache.hit ? 1 : 0,
            total: 1,
          },
        }
      : {}),
    requested: 'full-preferred',
    delivered: 'geometry-flat',
    materialFaithful: false,
    exactArtifact: false,
    rendererId: CPU_RASTER_RENDERER_ID,
    inputGlbSha256,
    degraded: true,
    degradeReason,
    reasonCodes,
  };
  try {
    context.onViewsRendered?.({
      renderer: CPU_RASTER_RENDERER_ID,
      degraded: true,
      degradedReason: degradeReason,
      neededPbr: true,
    });
  } catch {
    /* best effort */
  }
  return { png: flat.png, receipt };
}

function derivativeReviewFidelity(
  receipts: DerivativeViewReceiptV1[] | undefined,
): DerivativeReviewFidelityV1 | undefined {
  if (!receipts?.length) return undefined;
  const materialFaithful = receipts.every((receipt) => receipt.materialFaithful);
  const reasonCodes = [
    ...new Set(receipts.flatMap((receipt) => receipt.reasonCodes ?? [])),
  ] as ViewFidelityReasonCode[];
  return {
    version: 'kiln.derivative-review-fidelity.v1',
    requested: 'full-preferred',
    delivered: materialFaithful ? 'full-material' : 'geometry-flat',
    materialFaithful,
    exactArtifact: false,
    degraded: receipts.some((receipt) => receipt.degraded),
    receipts,
    ...(reasonCodes.length ? { reasonCodes } : {}),
  };
}

// =============================================================================
// Schemas
// =============================================================================

const validateInput = z.object({
  code: z.string().describe('Kiln source code (defines `meta` + `build()`, optional `animate()`).'),
});

const renderInput = z.object({
  code: z.string().describe('Kiln source code to execute and render to an in-memory GLB.'),
});

/** Unified render accepts optional capture configuration. */
/**
 * A named backdrop, never a free colour: sheets must stay comparable across
 * runs, and a backdrop tuned to the asset colour hides the seams the model is
 * meant to find. Neutral is the measured default; see `views/background.ts`.
 */
const backdropInput = z
  .enum(BACKDROP_IDS as [BackdropId, ...BackdropId[]])
  .optional()
  .describe('neutral (default); light for dark parts, dark for light parts.');

const legacyCaptureInput = z
  .object({
    preset: z
      .enum(['1x1', '1x2', '2x1', '3x1', '2x2', '3x2', '3x3'])
      .optional()
      .describe(
        'Grid shape as COLSxROWS. Default 3x2. Choose fewer views for simple shapes, up to 3x3 for more angles.',
      ),
    cells: z
      .array(
        z.object({
          azimuthDeg: z.number().describe('0 = front, 90 = right, 180 = back, 270 = left. Wraps.'),
          elevationDeg: z
            .number()
            .describe(
              '0 = eye level, positive looks down, negative from below. Clamped to -89..89.',
            ),
          zoom: z
            .number()
            .optional()
            .describe(
              'Padding multiplier around the asset bounds for this cell only. Omit for the ' +
                'default framing; below 1 crops in, above 1 pulls back.',
            ),
          name: z
            .string()
            .optional()
            .describe('Cell label. Auto-derived from the angles if omitted.'),
        }),
      )
      .optional()
      .describe(
        'One camera per cell, in row-major order. Omit to use the preset default cameras. ' +
          'Must not exceed the preset capacity (max 9 overall).',
      ),
    backdrop: backdropInput,
  })
  .optional()
  .describe(
    'Optional. Choose the contact-sheet shape and cameras. Omit it entirely for the standard ' +
      'six-view 3x2 grid, which is the right default for most assets.',
  );

/**
 * A three-number vector, advertised as a bounded uniform array rather than a tuple.
 *
 * `z.tuple` renders as JSON Schema 2020-12: `prefixItems` plus `items: false`, meaning
 * "nothing beyond the listed positions". That is correct, and it is also unreadable to a
 * consumer written against draft-07, where `items` must be a schema. VS Code's tool
 * validator tests `items` for truthiness, so `false` reads to it as an array with no
 * items and it refuses to register the tool at all -- `kiln_render`, `kiln_edit`,
 * `kiln_inspect`, `kiln_view_interior` and `kiln_screenshot_animation` were all
 * unusable there, which is the whole authoring loop.
 *
 * Every position holds the same type, so `minItems`/`maxItems` on a uniform array states
 * exactly the same constraint and is valid under both drafts.
 *
 * The tuple TYPE is recovered by a static assertion, so `CameraVec3` still lines up
 * across the view boundary and nothing downstream needs a cast. It is deliberately NOT
 * `.transform(v => v as [number, number, number])`, which reads as the same thing and
 * breaks every non-MCP harness: the Strands skin converts with `io: 'output'`, where zod
 * refuses outright -- "Transforms cannot be represented in JSON Schema" -- while the MCP
 * SDK converts with `io: 'input'` and never sees it. A change that looks identical on one
 * transport can take the other one down. The assertion is sound because the runtime
 * schema is unchanged: `.length(3)` still rejects every other arity.
 */
const cameraVec3Input = z.array(z.number()).length(3) as unknown as z.ZodType<
  [number, number, number]
>;

const orbitCameraError = (issue: { code?: string; keys?: string[] }): string | undefined => {
  if (
    issue.code === 'unrecognized_keys' &&
    issue.keys?.some((key) => key === 'target' || key === 'distance')
  ) {
    return 'Orbit cameras derive target and distance from the selected subject bounds; choose subject and padding, or use an explicit camera with position and target.';
  }
  return undefined;
};

const advancedCaptureError = (issue: { code?: string; keys?: string[] }): string | undefined => {
  if (
    issue.code === 'unrecognized_keys' &&
    issue.keys?.some((key) => key === 'width' || key === 'height')
  ) {
    return `Advanced capture uses one square per-shot size from 128 to ${MAX_CAPTURE_SHOT_SIZE}; width and height are returned image dimensions, not request fields.`;
  }
  return undefined;
};

const cameraShotInput = z
  .object({
    name: z.string().optional(),
    subject: z
      .object({ path: z.string().optional(), name: z.string().optional() })
      .strict()
      .refine((v) => (v.path === undefined) !== (v.name === undefined), {
        message: 'Choose subject path OR exact name.',
      })
      .optional(),
    visibility: z.enum(['context', 'isolate']).optional(),
    camera: z
      .discriminatedUnion('type', [
        z.strictObject(
          {
            type: z.literal('orbit'),
            azimuthDeg: z.number().optional(),
            elevationDeg: z.number().optional(),
            relativeTo: z.enum(['world', 'asset', 'part']).optional(),
            padding: z.number().positive().max(100).optional(),
          },
          { error: orbitCameraError },
        ),
        z
          .object({
            type: z.literal('explicit'),
            projection: z.enum(['orthographic', 'perspective']),
            position: cameraVec3Input,
            target: cameraVec3Input.optional(),
            relativeTo: z.enum(['world', 'asset', 'part', 'local']).optional(),
            frame: z
              .object({
                origin: cameraVec3Input.optional(),
                rotation: cameraVec3Input.optional(),
              })
              .strict()
              .optional(),
            framing: z.enum(['explicit', 'bounds']).optional(),
            padding: z.number().positive().max(100).optional(),
            targetOffset: cameraVec3Input.optional(),
            up: cameraVec3Input.optional(),
            halfHeight: z.number().positive().optional(),
            fovDeg: z.number().positive().lt(180).optional(),
            near: z.number().positive().optional(),
            far: z.number().positive().optional(),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();
const advancedCaptureInput = z.strictObject(
  {
    version: z.literal('kiln.capture.v1'),
    shots: z.array(cameraShotInput).min(1).max(9),
    cols: z.number().int().min(1).max(3).optional(),
    size: z.number().int().min(128).max(MAX_CAPTURE_SHOT_SIZE).optional(),
    output: z.enum(['grid', 'separate']).optional(),
    backdrop: backdropInput,
  },
  { error: advancedCaptureError },
);
// Error selection only: tagged input should explain its shot fields, not the
// legacy branch's unknown keys. This does not coerce values or change JSON Schema.
function taggedCaptureError(issue: { input?: unknown }): string | undefined {
  const input = issue.input;
  if (
    typeof input !== 'object' ||
    input === null ||
    !('version' in input) ||
    input.version !== 'kiln.capture.v1'
  )
    return undefined;
  const parsed = advancedCaptureInput.safeParse(input);
  if (parsed.success) return undefined;
  const issues = parsed.error.issues;
  const details = issues
    .slice(0, 6)
    .map((problem) => `${problem.path.join('.') || 'capture'}: ${problem.message.slice(0, 240)}`);
  return `Invalid kiln.capture.v1: ${details.join('; ')}${issues.length > 6 ? '; additional issues omitted' : ''}`;
}
const captureInput = z
  .union(
    [
      advancedCaptureInput,
      z.strictObject(legacyCaptureInput.unwrap().shape, {
        error: taggedCaptureError,
      }),
    ],
    { error: taggedCaptureError },
  )
  .optional()
  .describe(
    'Use legacy preset/cells for an orbit sheet, or version kiln.capture.v1 with 1..9 shots for exact part framing, local axes, perspective and separate images. Omit for six default views.',
  );

const renderViewsInput = renderInput.extend({ capture: captureInput, detail: reviewDetailInput });

/** The requested review detail; anything but 'full' is compact, and invalid input fails parsing later. */
const requestedDetail = (input: unknown): ReviewDetail =>
  (input as { detail?: unknown } | null)?.detail === 'full' ? 'full' : 'compact';

/** Unified-agent schema: the working buffer supplies `code`, while the model
 * still owns the deliberately bounded camera selection. Keeping this derived
 * from the registry schema prevents the Strands skin from silently lagging the
 * canonical capture contract. */
export const renderViewsBufferInput = renderViewsInput.omit({ code: true });

const screenshotAnimationInput = z.object({
  shot: cameraShotInput.optional(),
  measureParts: z
    .array(cameraShotInput.shape.subject.unwrap())
    .min(1)
    .max(16)
    .optional()
    .describe(
      'Exact names or paths of subtrees measured together at each phase, independent of camera selection.',
    ),
  frames: z.number().int().min(2).max(6).optional(),
  frameTimes: z
    .array(z.number().min(0).max(1))
    .min(1)
    .max(9)
    .optional()
    .describe('Ordered phase fractions 0..1; mutually exclusive with frames.'),
  framing: z.enum(['locked', 'follow']).optional(),
  size: z.number().int().min(128).max(1024).optional().describe('Frame size in px; default 256.'),
  detail: reviewDetailInput,
  code: z
    .string()
    .describe('Kiln source code to execute; must define animate() returning the named clip.'),
  clip: z
    .string()
    .describe(
      'The animation clip to view, by name (e.g. "walk", "attack"). Must be one your animate() returns.',
    ),
  camera: z
    .string()
    .optional()
    .describe(
      'Camera angle: right (default — side profile, best for leg swing + knee bend direction), front ' +
        '(reveals sideways/lateral motion), back, left, top, or three-quarter.',
    ),
  perFrame: z
    .boolean()
    .optional()
    .describe(
      'Return the frames as separate high-res images instead of one composite grid. Default false.',
    ),
});

const viewInteriorInput = z.object({
  capture: advancedCaptureInput.optional(),
  code: z.string().describe('Kiln source code to execute and render with the roof hidden.'),
  nodeName: z
    .string()
    .optional()
    .describe(
      'Override: lift the roof by exact node name instead of by role. Matches that node and its ' +
        'children. Normally OMIT it — Kiln finds the roof from its semantic role (anything built ' +
        'with createRoofPlanes/createGableRoof), falling back to historical "Roof" naming.',
    ),
});

// =============================================================================
// kiln_validate
// =============================================================================

function runValidate(
  input: z.infer<typeof validateInput>,
  context: KilnToolContext,
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
  validationScope: 'syntax-and-sandbox';
  requirements: RequirementsContext;
} {
  const requirements = toolRequirements(context);
  const result = validate(input.code);
  return {
    validationScope: 'syntax-and-sandbox',
    requirements,
    valid: result.valid,
    errors: result.errors,
    issues: result.issues,
    warnings: result.warnings.map((w) => (w.fixHint ? `${w.message} (${w.fixHint})` : w.message)),
  };
}

// =============================================================================
// kiln_render
// =============================================================================

const partListInput = z
  .object({
    query: z
      .string()
      .max(4096)
      .optional()
      .describe('Case-insensitive substring of name or exact encoded path; not a regex.'),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export interface PartListing {
  total: number;
  matched: number;
  offset: number;
  nextOffset?: number;
  parts: { path: string; name: string }[];
}

interface PartPreview {
  parts?: PartListing['parts'];
  partsTotal?: number;
  partsTruncated?: boolean;
  partsNextOffset?: number;
  partsHint?: string;
}

/** Same exported-scene paths used by exact camera and measurement selectors. */
async function listPartPage(
  root: THREE.Object3D,
  options: z.infer<typeof partListInput> = {},
): Promise<PartListing> {
  const { listCameraSubjects } = await import('../views/camera');
  const all = listCameraSubjects(root);
  const query = options.query?.trim().toLowerCase();
  const matches = query
    ? all.filter(
        (part) =>
          part.name.toLowerCase().includes(query) || part.path.toLowerCase().includes(query),
      )
    : all;
  const offset = options.offset ?? 0;
  const parts = matches
    .slice(offset, offset + (options.limit ?? 80))
    .map(({ path, name }) => ({ path, name }));
  const nextOffset = offset + parts.length;
  return {
    total: all.length,
    matched: matches.length,
    offset,
    parts,
    ...(nextOffset < matches.length ? { nextOffset } : {}),
  };
}

async function partPreview(root: THREE.Object3D): Promise<PartPreview> {
  const page = await listPartPage(root);
  return {
    parts: page.parts,
    partsTotal: page.total,
    partsTruncated: page.nextOffset !== undefined,
    ...(page.nextOffset === undefined
      ? {}
      : {
          partsNextOffset: page.nextOffset,
          partsHint: partsHint(page.nextOffset),
        }),
  };
}

export interface KilnRenderMetrics extends PartPreview {
  buildCache?: { key: `sha256:${string}`; hit: boolean };
  ok: boolean;
  tris?: number;
  meshes?: number;
  /**
   * Material slots on the re-imported review scene, which is one per mesh. The
   * scene measured here has been round-tripped through GLB, so authored sharing
   * no longer survives as object identity and this can never disagree with
   * `meshes`. Kept for output-shape stability; judge material sprawl from
   * `distinctMaterials`.
   */
  materials?: number;
  /**
   * Distinct materials in the exported GLB, measured post-dedup. This is the
   * number that actually falls when parts share a material, and the one the
   * instanceability grade is driven by.
   */
  distinctMaterials?: number;
  bbox?: { min: number[]; max: number[]; size: number[] };
  /** Mesh touching the lowest world point — ground-contact attribution. When
   *  bbox.min[1] dips below 0, this names the buried part so the agent can
   *  judge intent (earthworks/keels are fine; wheels/tails/missiles are not). */
  lowestPart?: { name: string; y: number };
  /** Post-dedup instanceability grade (informational): how cheap to render at scale. */
  instanceability?: { grade: string; summary: string };
  /** Structured deterministic report; five dimensions remain separate. */
  requirements?: RequirementsContext;
  qaReport?: AssetQaReport;
  warnings: string[];
  error?: string;
}

/** Traversal-derived geometry metrics for unified rendering. */
interface SceneMetrics {
  meshes: number;
  materials: number;
  bbox?: KilnRenderMetrics['bbox'];
  lowestPart?: KilnRenderMetrics['lowestPart'];
}

/**
 * Measure the review scene loaded from exported GLB bytes. Instances are already
 * expanded by loadGlbReviewScene. Referenced base vertices establish rest geometry
 * extents, not an alpha silhouette, shader displacement or animation envelope.
 * Transforming local boxes would include empty corners around rotated geometry.
 */
function collectSceneMetrics(root: THREE.Object3D): SceneMetrics {
  let meshes = 0;
  const materialSet = new Set<unknown>();
  let lowestPart: SceneMetrics['lowestPart'];
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((node: THREE.Object3D) => {
    const n = node as { isMesh?: boolean; material?: unknown };
    if (n.isMesh) {
      meshes += 1;
      const mat = n.material;
      if (Array.isArray(mat)) {
        for (const m of mat) materialSet.add(m);
      } else if (mat) {
        materialSet.add(mat);
      }
      const mesh = node as THREE.Mesh;
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.index;
      const mb = new THREE.Box3();
      if (position) {
        for (let i = 0; i < (index?.count ?? position.count); i++) {
          point.fromBufferAttribute(position, index ? index.getX(i) : i);
          mb.expandByPoint(point.applyMatrix4(mesh.matrixWorld));
        }
      }
      box.union(mb);
      // Attribute the minimum to this mesh's vertices, not its descendants.
      if (!mb.isEmpty() && (!lowestPart || mb.min.y < lowestPart.y)) {
        lowestPart = { name: node.name || '(unnamed mesh)', y: mb.min.y };
      }
    }
  });

  let bbox: SceneMetrics['bbox'];
  if (!box.isEmpty()) {
    const size = new THREE.Vector3();
    box.getSize(size);
    bbox = {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
      size: [size.x, size.y, size.z],
    };
  }

  return { meshes, materials: materialSet.size, bbox, lowestPart };
}

/**
 * Execute Kiln code, render it to an in-memory GLB, and report metrics.
 * Never writes files; never throws — failures come back as { ok:false, error }.
 */
// Shared render views
// =============================================================================

/** Unified render result: geometry measurements, views and fidelity. */
export type KilnScreenshotResult = KilnRenderViewsResult;

/** Extract PNG bytes for host image transport without duplicating base64 in text. */
export function screenshotMedia(output: unknown): { png: Uint8Array; json: unknown } | undefined {
  const o = output as KilnScreenshotResult | undefined;
  if (!o || typeof o.pngBase64 !== 'string' || o.pngBase64.length === 0) return undefined;
  const { pngBase64: _png, ...json } = o;
  return { png: new Uint8Array(Buffer.from(o.pngBase64, 'base64')), json };
}

// =============================================================================
// kiln_render (unified) — collapsed render + screenshot
// =============================================================================

export interface KilnRenderViewsResult extends PartPreview {
  captureCache?: { hit: boolean; reused: number; total: number };
  buildCache?: { key: `sha256:${string}`; hit: boolean };
  cameraShots?: import('../views').ResolvedCameraShotV1[];
  derivativeReceipts?: DerivativeViewReceiptV1[];
  framesBase64?: string[];
  ok: boolean;
  tris?: number;
  meshes?: number;
  /**
   * Material slots on the re-imported review scene, which is one per mesh. The
   * scene measured here has been round-tripped through GLB, so authored sharing
   * no longer survives as object identity and this can never disagree with
   * `meshes`. Kept for output-shape stability; judge material sprawl from
   * `distinctMaterials`.
   */
  materials?: number;
  /**
   * Distinct materials in the exported GLB, measured post-dedup. This is the
   * number that actually falls when parts share a material, and the one the
   * instanceability grade is driven by.
   */
  distinctMaterials?: number;
  bbox?: { min: number[]; max: number[]; size: number[] };
  lowestPart?: { name: string; y: number };
  /** Post-dedup instanceability grade (informational): how cheap to render at scale. */
  instanceability?: { grade: string; summary: string };
  /** Structured deterministic report; five dimensions remain separate. */
  requirements?: RequirementsContext;
  qaReport?: AssetQaReport;
  materialContract?: ProceduralTextureMaterialContract;
  /** View names in grid order (row-major). Defaults to Front, Right, Back, Left, Top, 3/4. */
  views?: string[];
  /** Grid shape and backdrop actually rendered — echoes the capture config back, or `3x2` on neutral by default. */
  capture?: {
    preset: string;
    cols: number;
    cells: number;
    backdrop?: BackdropId;
  };
  gridWidth?: number;
  gridHeight?: number;
  /** The 3x2 grid PNG, base64-encoded (transports with image support strip this and attach the bytes). */
  pngBase64?: string;
  /** Truthful material fidelity delivered by this render, visible to the model. */
  viewFidelity?: ViewFidelityV1;
  viewEvidence?: ViewEvidenceHistoryV1;
  warnings: string[];
  error?: string;
}

/** Evaluate once, then return metrics, structural advisories and views. Failed builds are image-free. */
async function retainReviewedArtifact(
  input: z.infer<typeof renderViewsInput>,
  rendered: RenderResult,
  reviewed: KilnRenderViewsResult,
  context: KilnToolContext,
): Promise<KilnRenderViewsResult> {
  context.evaluationControls?.().signal?.throwIfAborted();
  if (!context.programArtifacts) return reviewed;
  // Full-asset grids depict the exact retained bytes. Derivative shots remain
  // derivative evidence even though their source artifact is retained as well.
  if (reviewed.viewFidelity && !reviewed.derivativeReceipts) {
    reviewed.viewFidelity = {
      ...reviewed.viewFidelity,
      exactArtifact: true,
      reasonCodes: reviewed.viewFidelity.reasonCodes?.filter(
        (code) => code !== 'IN_LOOP_BUILD_NOT_PERSISTED',
      ),
    };
  }
  await context.programArtifacts.record({
    code: input.code,
    rendered,
    review: reviewed,
    captureSelection: input.capture ? { capture: input.capture } : {},
  });
  return reviewed;
}

async function runRenderViews(
  input: z.infer<typeof renderViewsInput>,
  context: KilnToolContext,
  onEvaluated?: (artifact: RenderResult) => void,
): Promise<KilnRenderViewsResult> {
  context = snapshotRenderContext(context);
  try {
    context.evaluationControls?.().signal?.throwIfAborted();
    // `CPU_RASTER_RENDERER_ID` and `resolveGridCapture` come from this SAME lazy
    // import rather than static ones on purpose. `../views/renderer-id` reads
    // package.json with `readFileSync` at MODULE LOAD, so a static import would
    // put a `node:fs` edge — evaluated on import, not on call — into this
    // module's graph, which is exactly what the lazy `../views` import at the top
    // of this file exists to prevent.
    const { renderGlbViewGrid, CPU_RASTER_RENDERER_ID, resolveGridCapture } = await import(
      '../views'
    );
    const { root, rendered, reasonCodes } = await loadEvaluatedReviewScene(input.code, context);
    onEvaluated?.(rendered);
    context = { ...context, requirements: rendered.requirements.binding };
    const materialContractFailure = missingProceduralTextureResult(rendered, context);
    if (materialContractFailure) return materialContractFailure;

    const structuralWarnings = inspectSceneStructure(root);
    const metrics = collectSceneMetrics(root);
    if ('shots' in (input.capture ?? {})) {
      const { renderCaptureGrid } = await import('../views');
      const grid = await renderCaptureGrid(root, input.capture!, (cell) =>
        renderDerivativeCell(cell, context),
      );
      const receipts = grid.derivativeReceipts;
      const materialFaithful = receipts.every((r) => r.materialFaithful);
      context.evaluationControls?.().signal?.throwIfAborted();
      const reviewed: KilnRenderViewsResult = {
        ok: true,
        ...evaluationEvidence(rendered),
        ...(rendered.buildCache ? { buildCache: rendered.buildCache } : {}),
        tris: rendered.tris,
        meshes: metrics.meshes,
        materials: metrics.materials,
        ...(rendered.meta.instanceability
          ? {
              distinctMaterials: rendered.meta.instanceability.metrics.uniqueMaterials,
            }
          : {}),
        bbox: metrics.bbox,
        lowestPart: metrics.lowestPart,
        views: grid.views,
        capture: grid.capture,
        ...(grid.captureCache ? { captureCache: grid.captureCache } : {}),
        gridWidth: grid.width,
        gridHeight: grid.height,
        cameraShots: grid.cameraShots,
        ...(await partPreview(root)),
        derivativeReceipts: receipts,
        ...('output' in input.capture! && input.capture.output === 'separate'
          ? { framesBase64: grid.perFramePngs.map((p) => p.toString('base64')) }
          : { pngBase64: grid.png.toString('base64') }),
        viewFidelity: {
          version: 'kiln.view-fidelity.v1',
          requested: 'full-preferred',
          delivered: materialFaithful ? 'full-material' : 'geometry-flat',
          materialFaithful,
          exactArtifact: false,
          rendererId: [...new Set(receipts.map((r) => r.rendererId))].join(', '),
          inputGlbSha256: await sha256Glb(Uint8Array.from(rendered.glb)),
          degraded: !materialFaithful,
          reasonCodes: ['IN_LOOP_BUILD_NOT_PERSISTED'],
        },
        warnings: [...structuralWarnings, ...rendered.warnings],
      };
      return await retainReviewedArtifact(input, rendered, reviewed, context);
    }

    // Route to the GPU only when a flat-shaded raster would misrepresent the
    // scene. A prop made of untextured `gameMaterial` looks the same either way,
    // so sending it costs a round trip and a warm GPU to draw a picture the CPU
    // already draws correctly. `renderSceneToGLB` above ALREADY produced the
    // bytes the port needs — this reuses them rather than paying a second bake.
    const neededPbr =
      sceneNeedsPbrShading(root) ||
      (rendered.materialMetrics?.texturedMaterials ?? 0) > 0 ||
      (rendered.materialMetrics?.materialExtensionCount ?? 0) > 0 ||
      reasonCodes.length > 0;
    let grid: ViewGridResult | undefined;
    let drawnBy: InLoopViewRender | undefined;
    let materialFaithful = false;

    if (context.viewRenderPort && (neededPbr || context.viewRenderRequired)) {
      // Lazy import: `../agent/generate` sits upstream of this module in the
      // agent tool-surface graph (tools/registry <- agent/tools <- agent/surface
      // <- agent/run <- agent/generate), so a static import of
      // `captureViewsViaPort` here would be a real runtime import cycle. Loaded
      // lazily exactly like the `../views` import above.
      const { captureViewsViaPort } = await import('../views/port');
      const ported = await captureViewsViaPort(
        context.viewRenderPort,
        rendered.glb,
        resolveInLoopViewRenderTimeoutMs(context, 'in-loop-grid'),
        input.capture,
        context.captureLimits,
        context.evaluationControls?.(),
      );
      context.evaluationControls?.().signal?.throwIfAborted();
      if (ported.ok) {
        // The port reports pixels only, not view names. Derive the same names
        // the CPU path would report for this capture config through the SAME
        // resolver both producers share, so the two paths agree on cell order.
        const resolvedViews = resolveGridCapture(input.capture, process.env['KILN_GRID_VARIANT']);
        grid = {
          png: ported.png,
          views: resolvedViews.views.map((v) => v.name),
          width: ported.width,
          height: ported.height,
          capture: ported.capture,
          ...(ported.captureCache ? { captureCache: ported.captureCache } : {}),
        };
        materialFaithful = true;
        drawnBy = { renderer: ported.rendererId, degraded: false, neededPbr };
      } else {
        drawnBy = {
          renderer: CPU_RASTER_RENDERER_ID,
          degraded: true,
          degradedReason: ported.reason,
          neededPbr,
        };
      }
    }

    // The CPU path is unchanged and is still what runs for every scene that does
    // not need PBR, every host with no port, and every port call that did not
    // come back. It is never skipped as an optimisation — it is the fallback.
    if (!grid && context.viewRenderRequired)
      throw new Error(
        `Required GPU render failed: ${drawnBy?.degradedReason ?? 'renderer unavailable'}`,
      );
    if (!grid) {
      grid = await renderGlbViewGrid(rendered.glb, {
        ...(input.capture ? { capture: input.capture } : {}),
        ...(context.captureCache ? { captureCache: context.captureCache } : {}),
      });
    }
    drawnBy ??= context.viewRenderPort
      ? { renderer: CPU_RASTER_RENDERER_ID, degraded: false, neededPbr }
      : {
          renderer: CPU_RASTER_RENDERER_ID,
          degraded: neededPbr,
          ...(neededPbr
            ? {
                degradedReason: 'material-faithful view render port unavailable',
              }
            : {}),
          neededPbr,
        };

    // Copy into an ArrayBuffer-backed view: render bytes are typed as
    // `Uint8Array<ArrayBufferLike>`, while Web Crypto deliberately rejects a
    // possible SharedArrayBuffer at its boundary.
    const hashInput = new Uint8Array(rendered.glb.byteLength);
    hashInput.set(rendered.glb);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', hashInput));
    const inputGlbSha256 = `sha256:${[...digest]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}` as const;
    const viewFidelity: ViewFidelityV1 = {
      version: 'kiln.view-fidelity.v1',
      requested: 'full-preferred',
      delivered: materialFaithful ? 'full-material' : 'geometry-flat',
      materialFaithful,
      // Native completion can select these retained bytes without another bake.
      // Other hosts receive an in-loop build until they persist an artifact.
      exactArtifact: context.programArtifacts !== undefined,
      rendererId: drawnBy.renderer,
      inputGlbSha256,
      degraded: drawnBy.degraded,
      ...(drawnBy.degradedReason ? { degradeReason: drawnBy.degradedReason } : {}),
      reasonCodes: context.programArtifacts ? [] : ['IN_LOOP_BUILD_NOT_PERSISTED'],
    };
    const viewEvidence = context.viewEvidenceHistory?.record('kiln_render', viewFidelity);

    // A host bookkeeping hook must never be able to fail a render the model is
    // waiting on.
    try {
      context.onViewsRendered?.(drawnBy);
    } catch {
      /* ignore */
    }

    const warnings = [...structuralWarnings, ...rendered.warnings];
    const materialContract = proceduralTextureMaterialContract(rendered, context);

    const reviewed: KilnRenderViewsResult = {
      ok: true,
      requirements: rendered.requirements,
      ...(rendered.buildCache ? { buildCache: rendered.buildCache } : {}),
      ...(await partPreview(root)),
      tris: rendered.tris,
      meshes: metrics.meshes,
      materials: metrics.materials,
      ...(rendered.meta.instanceability
        ? {
            distinctMaterials: rendered.meta.instanceability.metrics.uniqueMaterials,
          }
        : {}),
      bbox: metrics.bbox,
      lowestPart: metrics.lowestPart,
      ...(rendered.meta.instanceability
        ? {
            instanceability: {
              grade: rendered.meta.instanceability.grade,
              summary: rendered.meta.instanceability.summary,
            },
          }
        : {}),
      views: grid.views,
      ...(grid.capture ? { capture: grid.capture } : {}),
      ...(grid.captureCache ? { captureCache: grid.captureCache } : {}),
      gridWidth: grid.width,
      gridHeight: grid.height,
      pngBase64: grid.png.toString('base64'),
      viewFidelity,
      ...(viewEvidence ? { viewEvidence } : {}),
      warnings,
      qaReport: rendered.meta.qaReport as AssetQaReport | undefined,
      ...(materialContract ? { materialContract } : {}),
    };
    return await retainReviewedArtifact(input, rendered, reviewed, context);
  } catch (err) {
    return {
      ok: false,
      error: appendSourceCheck(err instanceof Error ? err.message : String(err), input.code),
      warnings: [],
    };
  }
}

/** Shared render definition and PNG media contract for the current authoring workflows. */
const KILN_RENDER_VIEWS_DESCRIPTION =
  'Build the current asset and return geometry metrics, exact part paths and images. Omit capture for six orthographic views. Choose preset/cells for a smaller orbit sheet, or version kiln.capture.v1 with shots for per-part framing, local axes, perspective and separate images. +X is forward, +Y up, +Z right. Review silhouette, attachments, proportion and ground contact. GPU PBR shading supports textured or metallic materials; a flat-shaded CPU render supports geometry review. Read viewFidelity; do not judge material fidelity from CPU views. Failed builds return errors without images.' +
  VIEW_EVIDENCE_GUIDANCE;

/** Create the unified render/view definition with host-owned QA context. */
export function createKilnRenderViewsDef(context: KilnToolContext = {}): KilnToolDef {
  const statefulContext = withViewEvidenceHistory(context);
  return {
    name: 'kiln_render',
    description: KILN_RENDER_VIEWS_DESCRIPTION,
    mediaMulti: screenshotAnimationMediaMulti,
    inputSchema: renderViewsInput,
    run: async (input) =>
      compactReviewResult(
        await guardCaptureBudget('kiln_render', input, statefulContext, () =>
          runRenderViews(renderViewsInput.parse(input), statefulContext),
        ),
        requestedDetail(input),
      ),
    media: screenshotMedia,
  };
}

/** Neutral compatibility export. It never reads category from generated source. */
export const kilnRenderViewsDef: KilnToolDef = createKilnRenderViewsDef();

// =============================================================================
// kiln_screenshot_animation — SEE one clip's motion (6 phase-labeled frames)
// =============================================================================

export interface KilnScreenshotAnimationResult extends EvaluationEvidence {
  loopClosure?: import('../views/pose').LoopClosureEvidence;
  cameraShots?: import('../views').ResolvedCameraShotV1[];
  /** Sampled world-space geometry, independent of framing and image fidelity. */
  poseBounds?: import('../views').AnimationPoseBounds[];
  ok: boolean;
  clip?: string;
  camera?: string;
  /** Frames rendered (6). */
  frames: number;
  /** Phase fraction (0..1) of each frame, in order. */
  frameTimes?: number[];
  duration?: number;
  /** Track targets that bind to no joint → the clip looks FROZEN. Fix the joint name. */
  unresolvedTracks?: string[];
  width?: number;
  height?: number;
  /** Composite 3x2 grid PNG, base64 (default; transports with image support strip + attach it). */
  pngBase64?: string;
  /** Per-frame PNGs, base64 (perFrame mode; image transports attach each separately). */
  framesBase64?: string[];
  /** Material fidelity and SHA-256 receipt for every posed derivative GLB. */
  viewFidelity?: DerivativeReviewFidelityV1;
  viewEvidence?: ViewEvidenceHistoryV1;
  /** Clip names available in the scene (set when the requested clip wasn't found). */
  availableClips?: string[];
  warnings: string[];
  error?: string;
}

/** Review the exported clip at requested phases, with posed geometry bounds and
 * GPU or CPU images. Build/clip failures come back as { ok:false, error }. */
async function runScreenshotAnimation(
  input: z.infer<typeof screenshotAnimationInput>,
  context: KilnToolContext,
): Promise<KilnScreenshotAnimationResult> {
  context = snapshotRenderContext(context);
  try {
    const { renderClipAnimation } = await import('../views');
    const { root, clips, rendered } = await loadEvaluatedReviewScene(input.code, context);
    context = { ...context, requirements: rendered.requirements.binding };
    const warnings = inspectSceneStructure(root);
    const r = await renderClipAnimation(root, clips, {
      clip: input.clip,
      ...(input.shot ? { shot: input.shot } : {}),
      ...(input.measureParts ? { measureParts: input.measureParts } : {}),
      ...(input.frames !== undefined ? { frames: input.frames } : {}),
      ...(input.frameTimes ? { frameTimes: input.frameTimes } : {}),
      ...(input.framing ? { framing: input.framing } : {}),
      ...(input.camera ? { camera: input.camera } : {}),
      ...(input.perFrame ? { perFrame: true } : {}),
      ...(input.size ? { size: input.size } : {}),
      renderDerivativeCell: (cell) => renderDerivativeCell(cell, context),
    });
    if (!r.ok) {
      return {
        ok: false,
        ...evaluationEvidence(rendered),
        frames: 0,
        warnings,
        ...(r.error ? { error: r.error } : {}),
        ...(r.clip ? { clip: r.clip } : {}),
        ...(r.availableClips ? { availableClips: r.availableClips } : {}),
      };
    }
    const { loopIntentWarning } = await import('../views/pose');
    const loopWarning = r.loopClosure && loopIntentWarning(r.clip ?? input.clip, r.loopClosure);
    if (loopWarning) warnings.push(loopWarning);
    const viewFidelity = derivativeReviewFidelity(r.derivativeReceipts);
    const viewEvidence = viewFidelity
      ? context.viewEvidenceHistory?.record('kiln_screenshot_animation', viewFidelity)
      : undefined;
    const base: KilnScreenshotAnimationResult = {
      ok: true,
      ...evaluationEvidence(rendered),
      frames: r.frames,
      ...(r.cameraShots ? { cameraShots: r.cameraShots } : {}),
      warnings,
      ...(r.clip ? { clip: r.clip } : {}),
      ...(r.camera ? { camera: r.camera } : {}),
      ...(r.frameTimes ? { frameTimes: r.frameTimes } : {}),
      ...(r.poseBounds ? { poseBounds: r.poseBounds } : {}),
      ...(r.loopClosure ? { loopClosure: r.loopClosure } : {}),
      ...(r.duration != null ? { duration: r.duration } : {}),
      ...(r.unresolvedTracks ? { unresolvedTracks: r.unresolvedTracks } : {}),
      ...(r.width ? { width: r.width } : {}),
      ...(r.height ? { height: r.height } : {}),
      ...(viewFidelity ? { viewFidelity } : {}),
      ...(viewEvidence ? { viewEvidence } : {}),
    };
    if (r.pngs) return { ...base, framesBase64: r.pngs.map((p) => p.toString('base64')) };
    return { ...base, pngBase64: r.png!.toString('base64') };
  } catch (err) {
    return {
      ok: false,
      frames: 0,
      error: appendSourceCheck(err instanceof Error ? err.message : String(err), input.code),
      warnings: [],
    };
  }
}

/** Media extractor for the composite-grid result (pngBase64 → bytes + stripped JSON). */
export function screenshotAnimationMedia(
  output: unknown,
): { png: Uint8Array; json: unknown } | undefined {
  const o = output as KilnScreenshotAnimationResult | undefined;
  if (!o || typeof o.pngBase64 !== 'string' || o.pngBase64.length === 0) return undefined;
  const { pngBase64: _png, framesBase64: _frames, ...json } = o;
  return { png: new Uint8Array(Buffer.from(o.pngBase64, 'base64')), json };
}

/** Media extractor for the perFrame result (framesBase64 → N bytes + stripped JSON). */
export function screenshotAnimationMediaMulti(
  output: unknown,
): { pngs: Uint8Array[]; json: unknown } | undefined {
  const o = output as KilnScreenshotAnimationResult | undefined;
  if (!o || !Array.isArray(o.framesBase64) || o.framesBase64.length === 0) return undefined;
  const { pngBase64: _png, framesBase64: _frames, ...json } = o;
  return {
    pngs: o.framesBase64.map((b) => new Uint8Array(Buffer.from(b, 'base64'))),
    json,
  };
}

/** Shared animation feedback with grid and per-frame image transport support. */
const KILN_SCREENSHOT_ANIMATION_DESCRIPTION =
  'Review a named animation clip at sampled phases, with phase-labeled images and poseBounds in world metres. ' +
  'Use this to check motion against the brief: pivots, attachment, ground clearance, travel and which parts remain fixed. ' +
  'Choose a camera that reveals the movement and inspect intermediate phases; symmetric parts can look stationary at regularly spaced phases. ' +
  'poseBounds reports scene geometry and the selected shot subject before camera isolation. Optional measureParts selects 1..16 exact names/paths for simultaneous per-part bounds; empty subtrees return null. Sampled bounds do not certify continuous collision or physical contact. ' +
  'args: clip (required), frameTimes (ordered fractions 0..1) or frames (2..6, default 6), ' +
  'camera (default right; also front/back/left/top/three-quarter) or shot, and perFrame (separate images). ' +
  'Nonempty unresolvedTracks names targets that do not exist; correct the track names. ' +
  'Images use deterministic posed GLB bytes: GPU PBR when available, otherwise geometry-flat CPU fallback. ' +
  'Read viewFidelity before judging materials; writes no files.' +
  VIEW_EVIDENCE_GUIDANCE;

/** Create an animation-view definition with host-owned QA context. */
export function createKilnScreenshotAnimationDef(context: KilnToolContext = {}): KilnToolDef {
  const statefulContext = withViewEvidenceHistory(context);
  return {
    name: 'kiln_screenshot_animation',
    description: KILN_SCREENSHOT_ANIMATION_DESCRIPTION,
    inputSchema: screenshotAnimationInput,
    run: async (input) =>
      compactReviewResult(
        await guardCaptureBudget('kiln_screenshot_animation', input, statefulContext, () =>
          runScreenshotAnimation(screenshotAnimationInput.parse(input), statefulContext),
        ),
        requestedDetail(input),
      ),
    media: screenshotAnimationMedia,
    mediaMulti: screenshotAnimationMediaMulti,
  };
}

/** Neutral compatibility export. It never reads category from generated source. */
export const kilnScreenshotAnimationDef: KilnToolDef = createKilnScreenshotAnimationDef();

// =============================================================================
// kiln_view_interior (unified) — see INSIDE an enterable building, roof off
// =============================================================================

export interface KilnViewInteriorResult extends EvaluationEvidence {
  /** Grid shape and backdrop actually rendered, echoed like every other image result. */
  capture?: {
    preset: string;
    cols: number;
    cells: number;
    backdrop?: BackdropId;
  };
  cameraShots?: import('../views').ResolvedCameraShotV1[];
  framesBase64?: string[];
  ok: boolean;
  /** View names in grid order: Floor plan, Dollhouse, Eye-level. */
  views?: string[];
  gridWidth?: number;
  gridHeight?: number;
  /** Roof subtree roots hidden (0 → no roof was resolvable by role or by name). */
  roofsHidden?: number;
  /** Near-wall subtree roots removed for the eye-level cutaway (0 → not a room()). */
  wallsHidden?: number;
  /** The single-row grid PNG, base64 (image transports strip this and attach the bytes). */
  pngBase64?: string;
  /** Material fidelity and SHA-256 receipt for every cutaway derivative GLB. */
  viewFidelity?: DerivativeReviewFidelityV1;
  viewEvidence?: ViewEvidenceHistoryV1;
  warnings: string[];
  error?: string;
}

/**
 * Render the asset with its roof hidden so the agent can SEE the interior the six
 * exterior views cannot (open/walkable floor, a doorway that is a real gap, fixtures
 * on the floor, nothing buried/sealed). Three roof-off cells: Floor plan, Dollhouse,
 * Eye-level. A build error comes back image-free ({ ok:false, error }). When the roof
 * could not be lifted (roofsHidden === 0) the interior stays occluded — the warning is
 * mode-specific: a bad explicit nodeName vs no resolvable roof at all. Pure visual QA:
 * does NOT run the structural inspector uses the same host-owned category as every other
 * view path. The views module is imported lazily to keep node:zlib out of the browser
 * bundle graph.
 */
async function runViewInterior(
  input: z.infer<typeof viewInteriorInput>,
  context: KilnToolContext,
): Promise<KilnViewInteriorResult> {
  context = snapshotRenderContext(context);
  try {
    const { renderInteriorGrid } = await import('../views');
    const { root, rendered: evaluated } = await loadEvaluatedReviewScene(input.code, context);
    context = { ...context, requirements: evaluated.requirements.binding };
    // No default name. An explicit nodeName stays an exact-name override; with
    // none, the grid resolves the roof from its semantic role (and only then
    // falls back to historical "Roof" naming) — so a correctly-roled roof named
    // anything at all still lifts.
    const nodeName = input.nodeName?.trim() ? input.nodeName : undefined;
    const grid = await renderInteriorGrid(root, {
      ...(input.capture ? { capture: input.capture } : {}),
      ...(nodeName ? { nodeName } : {}),
      renderDerivativeCell: (cell) => renderDerivativeCell(cell, context),
    });
    const warnings = inspectSceneStructure(root);
    if (grid.roofsHidden === 0) {
      warnings.push(
        nodeName
          ? `No node named "${nodeName}" was found, so the roof could not be lifted and the interior is still occluded. Check that name, or omit nodeName so the roof is found by its semantic role instead.`
          : 'No roof was found, so nothing could be lifted and the interior is still occluded. Build the roof with createRoofPlanes/createGableRoof (which tag it as a roof), or name the roof group "Roof".',
      );
    }
    const viewFidelity = derivativeReviewFidelity(grid.derivativeReceipts);
    const viewEvidence = viewFidelity
      ? context.viewEvidenceHistory?.record('kiln_view_interior', viewFidelity)
      : undefined;
    return {
      ok: true,
      ...evaluationEvidence(evaluated),
      views: grid.views,
      gridWidth: grid.width,
      gridHeight: grid.height,
      ...(grid.cameraShots ? { cameraShots: grid.cameraShots } : {}),
      ...(grid.capture ? { capture: grid.capture } : {}),
      roofsHidden: grid.roofsHidden,
      wallsHidden: grid.wallsHidden,
      ...(input.capture?.output === 'separate' && grid.perFramePngs
        ? { framesBase64: grid.perFramePngs.map((p) => p.toString('base64')) }
        : { pngBase64: grid.png.toString('base64') }),
      ...(viewFidelity ? { viewFidelity } : {}),
      ...(viewEvidence ? { viewEvidence } : {}),
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      error: appendSourceCheck(err instanceof Error ? err.message : String(err), input.code),
      warnings: [],
    };
  }
}

/** Interior views share the unified image transport contract. */
const KILN_VIEW_INTERIOR_DESCRIPTION =
  'SEE INSIDE an enterable building: renders it with the roof lifted off, as a ' +
  'three-view grid. (1) Floor plan: top-down — check the interior is open and walkable and the footprint ' +
  'is right. (2) Dollhouse: a 3/4 cutaway — check built-in fixtures (hearth, counter, shelves) rest ON the ' +
  'floor, not floating or sunk, and the walls enclose a real volume with headroom. (3) Eye-level: a low ' +
  'angle looking in through the doorway with the near walls also removed — confirm the doorway is a REAL ' +
  'gap you could walk through (not a panel) and no wall or glass is buried inside a solid mass. ' +
  'Call this before finalizing any building. Take no argument: the roof is found from its semantic ' +
  'role, so any roof built with createRoofPlanes/createGableRoof lifts whatever it is named. If ' +
  'roofsHidden comes back 0 no roof was resolvable and the interior stays hidden — build the roof ' +
  'with a roof primitive (or name the group "Roof"). Each cell is rendered from deterministic cutaway ' +
  'GLB bytes: GPU PBR when available, otherwise a GLB-native geometry-flat fallback. Read viewFidelity ' +
  'before judging materials; writes no files.' +
  VIEW_EVIDENCE_GUIDANCE;

/** Create the interior-view definition with host-owned QA context. */
export function createKilnViewInteriorDef(context: KilnToolContext = {}): KilnToolDef {
  const statefulContext = withViewEvidenceHistory(context);
  return {
    name: 'kiln_view_interior',
    mediaMulti: screenshotAnimationMediaMulti,
    description: KILN_VIEW_INTERIOR_DESCRIPTION,
    inputSchema: viewInteriorInput,
    run: async (input) =>
      compactReviewResult(
        await guardCaptureBudget('kiln_view_interior', input, statefulContext, () =>
          runViewInterior(viewInteriorInput.parse(input), statefulContext),
        ),
      ),
    media: screenshotMedia,
  };
}

/** Neutral compatibility export. It never reads category from generated source. */
export const kilnViewInteriorDef: KilnToolDef = createKilnViewInteriorDef();

// =============================================================================
// kiln_inspect (unified) — part-framed close-up of one suspect region
// =============================================================================

const attachmentEndpointInput = z
  .object({
    subject: z.object({ path: z.string().optional(), name: z.string().optional() }).strict(),
    point: cameraVec3Input.optional(),
  })
  .strict();
// Uniform items with an exact length also work in draft-07 tool consumers.
const surfacePairInput = z.array(z.string().max(4096)).length(2) as unknown as z.ZodType<
  [string, string]
>;
const inspectInput = z.object({
  image: z
    .boolean()
    .optional()
    .describe(
      'False: requires listParts/measure/surfacePairs/compare; no image or camera controls. Default true.',
    ),
  listParts: partListInput
    .optional()
    .describe(
      'List exported-scene paths, including nested parts. Default 80, max 100 per page. Follow partListing.nextOffset with the same programRef/query. image:false avoids rendering.',
    ),
  surfacePairs: z
    .array(surfacePairInput)
    .min(1)
    .max(12)
    .optional()
    .describe('[fromPath,toPath] pairs; check surfaceMeasurements.status and each result.'),
  compare: z
    .object({
      programRef: z.string().regex(programRefPattern),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      paths: z
        .array(z.string().max(4096))
        .min(1)
        .max(12)
        .optional()
        .describe(
          'Exact baseline node paths, scene-prefixed without primitive children. Complete subtree summaries.',
        ),
    })
    .strict()
    .optional()
    .describe(
      'Static geometry/material/transform/bounds under current host settings. Follow nextOffset; paths adds complete subtrees.',
    ),
  measure: z
    .object({
      mode: z.enum(['anchors', 'surface']).optional(),
      from: attachmentEndpointInput,
      to: attachmentEndpointInput,
    })
    .strict()
    .optional()
    .describe(
      'Default anchors: origin/local-point distance. Surface: disjoint mesh triangles, omit points. Rest pose, asset units. Check status/bounds; no solid clearance/attachment proof.',
    ),
  shot: cameraShotInput.optional().describe('Exact shot; omit part/view/orbit controls.'),
  code: z.string().describe('Kiln source code to execute and inspect.'),
  part: z
    .string()
    .optional()
    .describe(
      'Frame named part and descendants (case-insensitive, substring fallback). Omit for whole asset.',
    ),
  view: z
    .string()
    .optional()
    .describe('front/right/back/left/top/three-quarter (default). Orbit angles override.'),
  azimuthDeg: z
    .number()
    .optional()
    .describe('Orbit degrees: 0 front, 90 right, 180 back, 270 left. Wraps.'),
  elevationDeg: z
    .number()
    .optional()
    .describe('Elevation degrees: 0 eye level, positive above. Clamped -89..89.'),
  zoom: z.number().optional().describe('Bounds padding 1..4; default 1.2. Larger = more context.'),
  isolate: z
    .boolean()
    .optional()
    .describe('Hide surrounding geometry. Requires part; default false.'),
});

/** Unified-agent schema: identical inspection controls, with source supplied
 * by the working buffer instead of the model. */
export const inspectBufferInput = inspectInput.omit({ code: true });

export interface KilnInspectResult extends EvaluationEvidence {
  partListing?: PartListing;
  surfaceMeasurements?: ReturnType<typeof import('../views/surface-distance').measureSurfacePairs>;
  comparison?: Awaited<ReturnType<typeof import('../revision-comparison').compareRevisionGlbs>> & {
    programRef: string;
  };
  measurement?:
    | ReturnType<typeof import('../views/measurement').measureAttachment>
    | ReturnType<typeof import('../views/surface-distance').measureSurfaceDistance>;
  subjectFrame?: ReturnType<typeof import('../views/measurement').describeSubjectFrame>;
  cameraShot?: import('../views').ResolvedCameraShotV1;
  ok: boolean;
  /** Resolved part name that was framed (absent when the whole asset was framed). */
  part?: string;
  view?: string;
  /** Orbit angles actually rendered — reported for named cameras too. */
  azimuthDeg?: number;
  elevationDeg?: number;
  zoom?: number;
  /** True when everything outside the framed part was hidden (isolate honored). */
  isolated?: boolean;
  /** One line stating what was framed and from which view. */
  framed?: string;
  width?: number;
  height?: number;
  /** The close-up PNG, base64 (image transports strip this and attach the bytes). */
  pngBase64?: string;
  /** Fidelity and exact derivative-byte receipt for this close-up. */
  viewFidelity?: DerivativeReviewFidelityV1;
  viewEvidence?: ViewEvidenceHistoryV1;
  /** Part names available for framing (set when the requested part was not found). */
  availableParts?: string[];
  error?: string;
}

/**
 * Execute Kiln code and render ONE view framed to a named part's world bounds
 * (the part and its descendants), so the agent can see a suspect region at
 * full-image detail instead of one grid cell. An unresolved part name is not an
 * error thrown at the loop — it comes back as { ok:false, availableParts } so
 * the model can retry by name. The views module is imported lazily (node:zlib)
 * to keep it out of the browser bundle graph.
 */
async function runInspect(
  input: z.infer<typeof inspectInput>,
  context: KilnToolContext,
): Promise<KilnInspectResult> {
  context = snapshotRenderContext(context);
  try {
    const legacyCamera = [
      input.part,
      input.view,
      input.azimuthDeg,
      input.elevationDeg,
      input.zoom,
      input.isolate,
    ].some((value) => value !== undefined);
    if (input.image === false && (input.shot !== undefined || legacyCamera))
      throw new Error('image:false cannot be combined with camera controls.');
    if (
      input.image === false &&
      !input.listParts &&
      !input.measure &&
      !input.surfacePairs &&
      !input.compare
    )
      throw new Error('image:false requires listParts, measure, surfacePairs or compare.');
    if (input.shot && legacyCamera)
      throw new Error('shot cannot be combined with legacy inspection controls');
    const { prepareInspectView } = await import('../views/inspect');
    const {
      root,
      rendered: evaluated,
      reasonCodes,
    } = await loadEvaluatedReviewScene(input.code, context);
    context = { ...context, requirements: evaluated.requirements.binding };
    const { measureAttachment, describeSubjectFrame } = await import('../views/measurement');
    let comparison: KilnInspectResult['comparison'];
    if (input.compare) {
      if (!context.programStore) throw new Error('Revision comparison requires a program store.');
      const previousCode = await context.programStore.get(input.compare.programRef);
      const previous = await evaluateGeneratedSource(previousCode, context);
      const { compareRevisionGlbs } = await import('../revision-comparison');
      comparison = {
        ...(await compareRevisionGlbs(previous.glb, evaluated.glb, input.compare)),
        programRef: input.compare.programRef,
      };
    }
    let measurement: KilnInspectResult['measurement'];
    let surfaceMeasurements: KilnInspectResult['surfaceMeasurements'];
    if (input.measure?.mode === 'surface' || input.surfacePairs) {
      const unsupported = reasonCodes.filter((code) => /SKIN|MORPH|NON_TRIANGLE/.test(code));
      if (unsupported.length)
        throw new Error(`Surface measurement unavailable: ${unsupported.join(', ')}.`);
      const { measureSurfaceDistance, measureSurfacePairs } = await import(
        '../views/surface-distance'
      );
      if (input.measure?.mode === 'surface')
        measurement = measureSurfaceDistance(root, input.measure);
      if (input.surfacePairs) surfaceMeasurements = measureSurfacePairs(root, input.surfacePairs);
    }
    if (input.measure && input.measure.mode !== 'surface')
      measurement = measureAttachment(root, input.measure);
    const measurements = {
      ...(input.listParts ? { partListing: await listPartPage(root, input.listParts) } : {}),
      ...(measurement ? { measurement } : {}),
      ...(surfaceMeasurements ? { surfaceMeasurements } : {}),
      ...(comparison ? { comparison } : {}),
    };
    if (input.image === false)
      return { ok: true, ...evaluationEvidence(evaluated), ...measurements };
    if (input.shot) {
      const { renderCaptureGrid } = await import('../views');
      const grid = await renderCaptureGrid(
        root,
        { version: 'kiln.capture.v1', shots: [input.shot], size: 512 },
        (cell) => renderDerivativeCell(cell, context),
      );
      return {
        ok: true,
        ...evaluationEvidence(evaluated),
        cameraShot: grid.cameraShots[0],
        subjectFrame: describeSubjectFrame(root, input.shot.subject),
        ...measurements,
        pngBase64: grid.perFramePngs[0]!.toString('base64'),
        width: 512,
        height: 512,
        viewFidelity: derivativeReviewFidelity(grid.derivativeReceipts),
      };
    }

    const r = prepareInspectView(root, {
      ...(input.part !== undefined ? { part: input.part } : {}),
      ...(input.view !== undefined ? { view: input.view } : {}),
      ...(input.azimuthDeg !== undefined ? { azimuthDeg: input.azimuthDeg } : {}),
      ...(input.elevationDeg !== undefined ? { elevationDeg: input.elevationDeg } : {}),
      ...(input.zoom !== undefined ? { zoom: input.zoom } : {}),
      ...(input.isolate !== undefined ? { isolate: input.isolate } : {}),
    });
    if (!r.ok) {
      return {
        ok: false,
        view: r.view,
        zoom: r.zoom,
        error: r.error,
        availableParts: r.availableParts,
      };
    }
    const rendered = await renderDerivativeCell(
      {
        root: r.root,
        label: r.part ? `inspect:${r.part}` : 'inspect:whole-asset',
        view: r.viewSpec,
        size: r.size,
        frameBounds: r.frameBounds,
      },
      context,
    );
    const viewFidelity = derivativeReviewFidelity([rendered.receipt]);
    const viewEvidence = viewFidelity
      ? context.viewEvidenceHistory?.record('kiln_inspect', viewFidelity)
      : undefined;
    // Always state the angles, named camera or not, so the model can step from
    // where it actually is instead of guessing the next view by name.
    const from = `the ${r.view} view (azimuth ${r.azimuthDeg}deg, elevation ${r.elevationDeg}deg)`;
    const framed = r.part
      ? `Framed part "${r.part}" (with its descendants) from ${from} at zoom ${r.zoom}.` +
        (r.isolated
          ? ' Everything else is hidden, so nothing in this image occludes it.'
          : ' Surrounding geometry is still drawn and may occlude it.')
      : `Framed the whole asset from ${from}.`;
    return {
      ok: true,
      ...evaluationEvidence(evaluated),
      ...(r.part ? { part: r.part } : {}),
      ...measurements,
      view: r.view,
      azimuthDeg: r.azimuthDeg,
      elevationDeg: r.elevationDeg,
      zoom: r.zoom,
      isolated: r.isolated,
      framed,
      width: r.size,
      height: r.size,
      pngBase64: rendered.png.toString('base64'),
      ...(viewFidelity ? { viewFidelity } : {}),
      ...(viewEvidence ? { viewEvidence } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      error: appendSourceCheck(err instanceof Error ? err.message : String(err), input.code),
    };
  }
}

/** Inspection provides targeted views, measurements and revision comparisons. */
const KILN_INSPECT_DESCRIPTION =
  'List complete part paths with listParts and image:false; query filters names/paths, offset/limit paginate. Follow partListing.nextOffset. ' +
  'ZOOM IN on one part: renders a single 512x512 close-up framed to the named part (the node name ' +
  'you gave createPart, matched case-insensitively with a substring fallback) and its descendants, ' +
  'from one camera. Use it after kiln_render reveals a suspect region — a floating part, a bad ' +
  'joint, a wrong proportion — to see fine detail one grid cell cannot show. args: part (omit to ' +
  'frame the whole asset in one large view), view (front/right/back/left/top/three-quarter, ' +
  'default three-quarter), azimuthDeg + elevationDeg (orbit to ANY angle instead of a named view: ' +
  'azimuth 0 = front, 90 = right, 180 = back, 270 = left; elevation 0 = eye level, positive looks ' +
  'down, clamped to -89..89), zoom (padding multiplier around the part bounds, 1 = tight crop up ' +
  'to 4 = wide context, default 1.2), isolate (hide everything except that part, default false). ' +
  'Reach for the orbit angles when a named view puts the thing you need to judge edge-on or ' +
  'behind something — the reply always tells you the azimuth/elevation it used, so you can step ' +
  'from there. ' +
  'If the part name does not resolve you get the list of available part names back — pick one and ' +
  'retry. By default surrounding geometry stays visible for context and can occlude the part: ' +
  'either pick a different view, or set isolate:true to hide everything else and see the part ' +
  'unobstructed (use it for anything buried inside or behind other geometry). The view is rendered ' +
  'from deterministic derivative GLB bytes; GPU PBR is used only when it can preserve the requested ' +
  'framing, otherwise the GLB-native geometry-flat fallback reports why in viewFidelity. Writes no files.' +
  VIEW_EVIDENCE_GUIDANCE;

/** Create the close-up inspection definition. */
export function createKilnInspectDef(context: KilnToolContext = {}): KilnToolDef {
  const statefulContext = withViewEvidenceHistory(context);
  return {
    name: 'kiln_inspect',
    description: KILN_INSPECT_DESCRIPTION,
    inputSchema: inspectInput,
    run: async (input) =>
      compactReviewResult(
        await guardCaptureBudget('kiln_inspect', input, statefulContext, () =>
          runInspect(inspectInput.parse(input), statefulContext),
        ),
      ),
    media: screenshotMedia,
  };
}

/** Neutral compatibility export. It never reads category from generated source. */
export const kilnInspectDef: KilnToolDef = createKilnInspectDef();

// =============================================================================
// Registry
// =============================================================================

// =============================================================================
// kiln_edit — patch an existing program and see the result in one call
// =============================================================================
//
// Edits apply atomically to the selected immutable program. A failed match
// produces no partial revision. Both native and MCP callers share this operation;
// optional rendering provides feedback from the edited source.

const editOperationInput = z.object({
  oldString: z
    .string()
    .describe(
      'The exact text to replace, copied verbatim from the program (including whitespace and ' +
        'indentation, and with no line-number prefixes). Must be unique unless replaceAll is true.',
    ),
  newString: z.string().describe('The replacement text. Use an empty string to delete.'),
  replaceAll: z
    .boolean()
    .optional()
    .describe('Replace every occurrence instead of failing when oldString matches more than once.'),
});

const editInput = z.object({
  code: z.string().describe('The Kiln program to patch. The full current source.'),
  edits: z
    .array(editOperationInput)
    .min(1)
    .max(20)
    .describe(
      'Edits applied in order against the program. If any one fails to match, none are applied ' +
        'and the reply says which. Batch related changes into a single call.',
    ),
  render: z
    .boolean()
    .optional()
    .describe(
      'Render the patched program and return the views (default true). false = patch only.',
    ),
  capture: captureInput,
});

/** Result of one `kiln_edit` call. */
export interface KilnEditResult {
  /** Exact static comparison is evidence, never a semantic preservation verdict. */
  preservation?: {
    status: 'compared' | 'not_assessed';
    comparison?: Awaited<ReturnType<typeof import('../revision-comparison').compareRevisionGlbs>>;
    reason?: string;
  };
  framesBase64?: string[];
  ok: boolean;
  /** Why the call failed. Present only when ok is false. */
  error?: string;
  /** 1-based index of the edit that failed to apply. */
  failedEdit?: number;
  /** How to fix the failure. */
  hint?: string;
  /** The patched program. Present only when every edit applied. */
  code?: string;
  /** Occurrences replaced, per edit, in the order given. */
  applied?: { occurrences: number }[];
  /** Unified diff from the submitted code to the patched code. */
  diff?: string;
  /** The render of the patched program, when render was not disabled. */
  render?: KilnRenderViewsResult;
  /** Six-view PNG, lifted from the render so transports can attach it as an image. */
  pngBase64?: string;
}

async function runEdit(
  input: z.infer<typeof editInput>,
  context: KilnToolContext,
): Promise<KilnEditResult> {
  context = snapshotRenderContext(context);
  const buffer = new KilnDraftBuffer(input.code);
  const applied: { occurrences: number }[] = [];

  for (const [index, edit] of input.edits.entries()) {
    const result = buffer.apply(edit);
    if (!result.ok) {
      return {
        ok: false,
        failedEdit: index + 1,
        error: result.error,
        ...(result.hint ? { hint: result.hint } : {}),
        // No `code`: nothing was applied, so there is no new program to report.
      };
    }
    applied.push({ occurrences: result.occurrences });
  }

  const code = buffer.code;
  const diff = unifiedDiff(input.code, code, {
    fromLabel: 'before',
    toLabel: 'after',
  });

  if (input.render === false)
    return {
      ok: true,
      code,
      applied,
      diff,
      preservation: {
        status: 'not_assessed',
        reason:
          'Source-only edit. Unchanged source text does not prove unchanged geometry; compare the rendered revisions with kiln_inspect compare.',
      },
    };

  let editedArtifact: RenderResult | undefined;
  const rendered = await runRenderViews(
    { code, ...(input.capture ? { capture: input.capture } : {}) } as z.infer<
      typeof renderViewsInput
    >,
    context,
    (artifact) => {
      editedArtifact = artifact;
    },
  );

  let preservation: KilnEditResult['preservation'] = {
    status: 'not_assessed',
    reason: 'The edited revision did not produce a reviewed build.',
  };
  if (rendered.ok && editedArtifact) {
    try {
      context.evaluationControls?.().signal?.throwIfAborted();
      const previous = await evaluateGeneratedSource(input.code, context);
      const { compareRevisionGlbs } = await import('../revision-comparison');
      preservation = {
        status: 'compared',
        comparison: await compareRevisionGlbs(previous.glb, editedArtifact.glb, { limit: 12 }),
      };
    } catch (error) {
      context.evaluationControls?.().signal?.throwIfAborted();
      preservation = {
        status: 'not_assessed',
        reason: `Static comparison unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Lift the image to the top level and strip it from the nested result, so the
  // PNG crosses the wire once rather than being carried in both places.
  const { pngBase64, framesBase64, ...renderJson } = rendered as KilnRenderViewsResult & {
    pngBase64?: string;
  };
  return {
    ok: true,
    code,
    applied,
    diff,
    preservation,
    render: renderJson as KilnRenderViewsResult,
    ...(pngBase64 ? { pngBase64 } : {}),
    ...(framesBase64 ? { framesBase64 } : {}),
  };
}

const KILN_EDIT_DESCRIPTION =
  'Patch an EXISTING Kiln program with exact-string replacements and render the result in one ' +
  'call. This is the refine verb: use it to change an asset you already have rather than ' +
  're-emitting the whole file, so every line you did not touch stays byte-for-byte identical and ' +
  'the reply carries a unified diff of what actually changed. Pass the full current source as ' +
  '`code` and one or more { oldString, newString } edits, copied verbatim from that source. ' +
  'Edits apply in order and the call is all-or-nothing: if any oldString does not match, or ' +
  'matches more than once without replaceAll, NOTHING is applied and the reply names the edit ' +
  'that failed -- fix it and call again. The patched program comes back as `code`; write it to ' +
  'your file to keep it. Renders by default, so you see the change immediately; pass ' +
  'render:false to patch without rendering. Writes no files.';

/** Create the refine/edit definition with host-owned QA context. */
export function createKilnEditDef(context: KilnToolContext = {}): KilnToolDef {
  const statefulContext = withViewEvidenceHistory(context);
  return {
    name: 'kiln_edit',
    mediaMulti: screenshotAnimationMediaMulti,
    description: KILN_EDIT_DESCRIPTION,
    inputSchema: editInput,
    run: async (input) =>
      compactReviewResult(
        await guardCaptureBudget('kiln_edit', input, statefulContext, () =>
          runEdit(editInput.parse(input), statefulContext),
        ),
      ),
    media: (output) => {
      const o = output as KilnEditResult | undefined;
      if (!o || typeof o.pngBase64 !== 'string' || o.pngBase64.length === 0) return undefined;
      const { pngBase64: _png, ...json } = o;
      return { png: new Uint8Array(Buffer.from(o.pngBase64, 'base64')), json };
    },
  };
}

/** Neutral compatibility export. */
export const kilnEditDef: KilnToolDef = createKilnEditDef();

/** Shared syntax-only definition; the authoring registries own the workflow. */
function createKilnValidateDef(context: KilnToolContext): KilnToolDef {
  return {
    name: 'kiln_validate',
    description:
      'Statically validate Kiln source code before rendering. Checks for the required `meta` const and `build()` function, `value:` keyframe typos, infinite loops, recursive build() calls, retired globals and syntax errors. Returns { valid, errors, issues, warnings }; issues include stable codes, lines and repair hints where available. Warnings are advisory only (they never make code invalid). There is NO triangle budget: density is never warned about, so build as much detail as the asset deserves. Run this to catch mistakes cheaply before kiln_render.',
    inputSchema: validateInput,
    run: async (input) => runValidate(validateInput.parse(input), context),
  };
}

/** Portable authoring surface. Hosts share a store explicitly; no hidden current program. */
let localCacheScope = 0;
function withBuildCache(context: KilnToolContext): KilnToolContext {
  if (
    context.evaluatorCacheManaged ||
    context.cacheEvaluations === false ||
    (context.evaluatorPort && !context.evaluatorCacheIdentity)
  )
    return context;
  // The implicit identity never leaves this process/registry. Persistent or shared
  // host caches should supply an exact engine/dependency identity explicitly.
  const scope = `kiln-local-registry-${++localCacheScope}`;
  const evaluator = {
    render: (...args: Parameters<import('../evaluator').EvaluatorPortV2['render']>) =>
      resolveEvaluatorPortV2(
        context.evaluatorPort,
        context.evaluatorProfile ?? 'trusted-local',
      ).render(...args),
  };
  return {
    ...context,
    evaluatorPort: createCachedEvaluatorPort(evaluator, {
      cache: context.buildCache ?? new MemoryBuildCache(),
      identity: () => {
        const declared =
          typeof context.evaluatorCacheIdentity === 'function'
            ? context.evaluatorCacheIdentity()
            : context.evaluatorCacheIdentity;
        if (context.evaluatorPort) return declared;
        const env = typeof process === 'undefined' ? {} : process.env;
        return JSON.stringify([
          declared ?? scope,
          env['KILN_QA_MODE'],
          env['KILN_BAKE_OPTIMIZE'],
          env['KILN_BAKE_INSTANCE'],
          ...(env['KILN_GLTF_EXPORTER'] === 'three' ? ['three'] : []),
        ]);
      },
    }),
  };
}

async function guardCaptureBudget(
  name: string,
  input: unknown,
  context: KilnToolContext,
  run: () => Promise<unknown>,
): Promise<unknown> {
  try {
    const { enforceCapturePixels, enforceCaptureBytes } = await import('../views/capture-limits');
    const args = input as {
      capture?: import('../views').CaptureConfig;
      frames?: number;
      frameTimes?: number[];
      render?: boolean;
      image?: boolean;
      shot?: unknown;
      size?: number;
    };
    if (name === 'kiln_edit' && args.render === false) return await run();
    if (name === 'kiln_inspect' && args.image === false) return await run();
    let cells = 6,
      size = 384,
      cols = 3,
      compose = true;
    if (name === 'kiln_inspect') {
      cells = 1;
      size = 512;
      cols = 1;
      compose = Boolean(args.shot);
    } else if (name === 'kiln_screenshot_animation') {
      cells = args.frameTimes?.length ?? args.frames ?? 6;
      size = args.size ?? 256;
    } else if (name === 'kiln_view_interior') {
      cells = 3;
      size = 256;
    }
    if (args.capture) {
      if (args.capture.shots) {
        cells = args.capture.shots.length;
        size = args.capture.size ?? 384;
        cols = args.capture.cols ?? Math.min(3, cells);
      } else {
        const { resolveGridCapture } = await import('../views/capture');
        const resolved = resolveGridCapture(args.capture);
        cells = resolved.views.length;
        cols = resolved.cols;
      }
    }
    enforceCapturePixels(cells, size, cols, context.captureLimits, compose);
    const out = await run();
    if (out && typeof out === 'object') {
      const media = out as { pngBase64?: string; framesBase64?: string[] };
      const encoded = media.framesBase64 ?? (media.pngBase64 ? [media.pngBase64] : []);
      enforceCaptureBytes(
        encoded.map((value) => Buffer.from(value, 'base64')),
        context.captureLimits,
      );
    }
    return out;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function snapshotRenderContext(context: KilnToolContext): KilnToolContext {
  return context.viewRenderState
    ? { ...context, ...context.viewRenderState(), viewRenderState: undefined }
    : context;
}

function withCaptureCache(context: KilnToolContext): KilnToolContext {
  if (context.cacheCaptures === false) return { ...context, captureCache: undefined };
  const cache = context.captureCache ?? new MemoryCaptureCache();
  if (context.viewRenderState) {
    const read = context.viewRenderState;
    const wrapped = new WeakMap<PbrRenderPort, PbrRenderPort>();
    return {
      ...context,
      captureCache: cache,
      viewRenderState: () => {
        const state = read();
        if (!state.viewRenderPort || !state.captureCacheIdentity) return state;
        let port = wrapped.get(state.viewRenderPort);
        if (!port) {
          const identity = state.captureCacheIdentity;
          port = createCachedRenderPort(state.viewRenderPort, {
            cache,
            identity: () => (typeof identity === 'function' ? identity() : identity),
          });
          wrapped.set(state.viewRenderPort, port);
        }
        return { ...state, viewRenderPort: port };
      },
    };
  }
  const identity = () =>
    typeof context.captureCacheIdentity === 'function'
      ? context.captureCacheIdentity()
      : context.captureCacheIdentity;
  return {
    ...context,
    captureCache: cache,
    ...(context.viewRenderPort && context.captureCacheIdentity
      ? {
          viewRenderPort: createCachedRenderPort(context.viewRenderPort, {
            cache,
            identity,
          }),
        }
      : {}),
  };
}

const rendererInput = z.strictObject({
  action: z.enum(['status', 'reprobe']).default('status'),
});

export function createKilnProgramToolRegistry(
  suppliedContext: KilnToolContext = {},
): KilnToolDef[] {
  toolRequirements(suppliedContext);
  const store = suppliedContext.programStore ?? new MemoryProgramStore();
  const context = withCaptureCache(withBuildCache({ ...suppliedContext, programStore: store }));
  return [
    createKilnDiscoveryDef({ ...suppliedContext, programStore: store }),
    {
      name: 'kiln_renderer',
      description:
        'Inspect status, or reprobe after renderer setup/repair to refresh this session and reset failed starts. Never installs, starts, stops or renders. Preserves CPU/local/remote selection; environment/credential changes require a host restart. Read viewFidelity after rendering.',
      inputSchema: rendererInput,
      run: async (raw: unknown) => {
        const { action } = rendererInput.parse(raw);
        if (action === 'reprobe' && !suppliedContext.reprobeRenderer)
          return {
            ok: false,
            error:
              'Renderer reprobe is not provided by this host. Configure its render connection through the host.',
          };
        if (!suppliedContext.renderCapabilities)
          return {
            ok: false,
            error:
              'Renderer status is not provided by this host. Discovery reports its declared configuration.',
          };
        try {
          return {
            ok: true,
            renderer: await (action === 'reprobe'
              ? suppliedContext.reprobeRenderer!()
              : suppliedContext.renderCapabilities()),
          };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    ...[
      createKilnValidateDef(context),
      createKilnRenderViewsDef(context),
      createKilnScreenshotAnimationDef(context),
      createKilnViewInteriorDef(context),
      createKilnInspectDef(context),
      createKilnEditDef(context),
    ].map((def) => withProgramReferences(def, store)),
    createKilnSourceDef(store),
    ...(context.projectStore
      ? [createKilnProjectDef(context.projectStore, context.projectBundleReader)]
      : []),
    ...(context.materialLibrary ? [createKilnMaterialDef(context.materialLibrary)] : []),
    ...(context.reviewStore && context.assetLibrary
      ? [
          createKilnReviewDef({
            reviewStore: context.reviewStore,
            assetLibrary: context.assetLibrary,
            requirements: context.requirements,
          }),
        ]
      : []),
    ...createKilnAssetDefs({ ...context, programStore: store }),
  ]
    .map((def) => withWorkspaceContext(def, context))
    .map((def) => ({
      ...def,
      annotations: {
        readOnlyHint: ['kiln_source', 'kiln_discover', 'kiln_export', 'kiln_present'].includes(
          def.name,
        ),
        destructiveHint: false,
        idempotentHint: def.name !== 'kiln_save',
        openWorldHint: false,
        ...def.annotations,
      },
    }));
}

/** Canonical native workflow: shared definitions plus one host-owned terminal. */
export function createKilnNativeToolRegistry(
  suppliedContext: KilnToolContext,
  completion: NativeCompletion,
): KilnToolDef[] {
  const active = toolRequirements(suppliedContext);
  const context = {
    ...suppliedContext,
    requirements: active.binding,
    programStore: suppliedContext.programStore ?? new MemoryProgramStore(),
    programArtifacts: suppliedContext.programArtifacts ?? new ProgramArtifactStore(),
  };
  const inputSchema = z.strictObject({
    programRef: z.string().regex(programRefPattern),
  });
  const skillResourceInput = z.strictObject({
    skill: z.string().min(1).max(64),
    path: z.string().min(1).max(240).optional(),
    offset: z
      .number()
      .int()
      .min(0)
      .max(256 * 1024)
      .default(0),
    limit: z.number().int().min(1).max(16000).default(12000),
  });
  const delivery = new Set([
    'kiln_save',
    'kiln_assets',
    'kiln_export',
    'kiln_import',
    'kiln_present',
  ]);
  return [
    ...createKilnProgramToolRegistry(context).filter(
      (def) => context.assetLibrary || !delivery.has(def.name),
    ),
    ...(context.skillResourceReader
      ? [
          {
            name: 'kiln_skill_resource',
            description:
              'Read a bounded text reference from a configured native skill. Omit path to list exact available reference keys. Offsets count UTF-16 characters; follow nextOffset for another page. Reads the immutable run snapshot, without filesystem access or script execution.',
            inputSchema: skillResourceInput,
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
            run: async (raw: unknown) =>
              context.skillResourceReader!(skillResourceInput.parse(raw)),
          },
        ]
      : []),
    {
      name: 'kiln_finish',
      description:
        'Finish this run with one exact reviewed programRef. Call alone after kiln_render (or an edit that rendered). Unknown, unreviewed, evicted or differently bound revisions are rejected. Returns recorded QA acceptance separately from model completion; no implicit optimization or re-execution occurs.',
      inputSchema,
      run: async (raw: unknown) => {
        if (completion.artifact) throw new Error('This native run has already finished.');
        const { programRef } = inputSchema.parse(raw);
        const code = await context.programStore.get(programRef);
        const artifact = context.programArtifacts.get(await programReference(code), active);
        completion.artifact = artifact;
        return {
          ok: true,
          completion: 'finished',
          programRef: artifact.programRef,
          artifactGlbSha256: artifact.rendered.artifactGlbSha256,
          requirements: artifact.rendered.requirements,
          acceptance:
            (artifact.rendered.meta.qaReport as { acceptance?: string } | undefined)?.acceptance ??
            'incomplete',
          qaReport: artifact.rendered.meta.qaReport,
          viewFidelity: artifact.review.viewFidelity,
        };
      },
    },
  ];
}

const assetSelector = {
  collection: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,79}$/)
    .describe(
      'Collection ID (list with kiln_assets action=collections): the user destination, else project.',
    )
    .default('project'),
  assetId: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  revisionId: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
};

/** Build one current-policy revision for ordinary save or explicit migration. */
export async function buildProgramAssetDraft(
  code: string,
  context: KilnToolContext,
  backdrop?: BackdropId,
): Promise<
  Pick<import('../assets').AssetDraft, 'code' | 'glb' | 'preview' | 'previewInfo' | 'build'>
> {
  await context.prepareBuildProvenance?.();
  const callContext = {
    ...context,
    requirements: toolRequirements(context).binding,
  };
  const rendered = await evaluateGeneratedSource(code, callContext);
  let preview: Uint8Array | undefined;
  let previewInfo: import('../assets').AssetManifest['preview'];
  try {
    // The preview is the default six-view sheet on the named backdrop, and
    // the manifest records the one actually painted, so a preview reviewed
    // on `dark` ships on `dark` and a reader never has to guess.
    const result = await runRenderViews(
      {
        code,
        ...(backdrop ? { capture: { backdrop } } : {}),
      } as z.infer<typeof renderViewsInput>,
      { ...callContext, evaluatorPort: { render: async () => rendered } },
    );
    if (!result.ok || !result.pngBase64) throw new Error(result.error ?? 'Preview unavailable');
    preview = Uint8Array.from(Buffer.from(result.pngBase64, 'base64'));
    previewInfo = {
      fidelity: result.viewFidelity,
      backdrop: result.capture?.backdrop ?? DEFAULT_BACKDROP_ID,
    };
  } catch (error) {
    previewInfo = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const dependencies = [
    ...(rendered.materialResourceProvenance ?? []),
    ...(rendered.materialLibraryDependencies ?? []).map((manifest) => ({
      kind: 'kiln.material.v1',
      delivery: 'runtime',
      manifest,
    })),
  ];
  const project = context.workspace?.current()?.project;
  return {
    code,
    glb: rendered.glb,
    preview,
    previewInfo,
    build: {
      engine: context.localExecution?.runtimeIdentity ?? 'source-development:unverified',
      options: {
        ...context.assetBuildOptions,
        ...(project ? { projectId: project.projectId, projectRevision: project.revisionId } : {}),
        ...rendered.rebuildOptions,
        requirements: rendered.requirements,
        ...(rendered.requirements.binding
          ? {
              requirementsCheckpoint: createRequirementsCheckpoint(
                await programReference(code),
                rendered.requirements.binding,
              ),
            }
          : {}),
      },
      warnings: rendered.warnings,
      integration: rendered.integrationManifest,
      qa: rendered.meta.qaReport,
      dependencies,
      rebuild: dependencies.some((d) => d.delivery === 'runtime')
        ? 'external-dependencies-required'
        : 'engine-required',
    },
  };
}

/** All asset operation schemas live here, alongside the existing tool definitions. */
export function createKilnAssetDefs(context: KilnToolContext): KilnToolDef[] {
  const library = () => {
    if (!context.assetLibrary)
      throw new Error(
        'No asset library configured. The local CLI/MCP host supplies workspace collections; embedded hosts must inject assetLibrary.',
      );
    return context.assetLibrary;
  };
  const links = async (collection: string, asset: import('../assets').AssetManifest) => ({
    ok: true,
    collection,
    asset: {
      assetId: asset.assetId,
      revisionId: asset.revisionId,
      parentRevision: asset.parentRevision,
      name: asset.name,
      tags: asset.tags,
      createdAt: asset.createdAt,
      editable: asset.editable,
      files: asset.files,
      build: asset.build && {
        engine: asset.build.engine,
        rebuild: asset.build.rebuild,
        warningCount: asset.build.warnings.length,
        warnings: asset.build.warnings.slice(0, 3).map((warning) => warning.slice(0, 200)),
      },
    },
    resources: (await import('../assets-resources')).assetLinks(collection, asset),
    downloadUrls: await context.assetDownloadUrls?.(collection, asset.assetId, asset.revisionId),
  });
  const saveInput = z.object({
    collection: assetSelector.collection,
    programRef: z.string(),
    name: z.string().min(1).max(200),
    assetId: assetSelector.assetId.optional(),
    parentRevision: assetSelector.revisionId.optional(),
    tags: z.array(z.string().max(80)).max(30).optional(),
    brief: z.string().max(8000).optional(),
    description: z.string().max(4000).optional(),
    attribution: z
      .object({
        model: z.string().max(200).optional(),
        harness: z.string().max(200).optional(),
        author: z.string().max(200).optional(),
      })
      .optional(),
    backdrop: z
      .enum(BACKDROP_IDS as [BackdropId, ...BackdropId[]])
      .optional()
      .describe('Preview backdrop: the one the reviewed sheet used.'),
  });
  const assetsInput = z.object({
    action: z.enum(['collections', 'catalog', 'list', 'get', 'restore']).default('list'),
    collection: assetSelector.collection,
    assetId: assetSelector.assetId.optional(),
    revisionId: assetSelector.revisionId.optional(),
    query: z.string().max(200).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(50).default(20),
  });
  const exportInput = z.object(assetSelector);
  const profileExportInput = exportInput.extend({
    profile: z
      .enum(['editable', 'runtime'])
      .default('editable')
      .describe(
        'editable preserves canonical source/GLB/build resources. runtime returns a standalone GLB and versioned review-metadata sidecar; no source bundle or geometry optimization.',
      ),
  });
  const importInput = z.object({
    ...assetSelector,
    sourceCollection: assetSelector.collection,
  });
  return [
    {
      name: 'kiln_save',
      description:
        'Save a completed source revision into the user-requested collection, or project when none was requested. Persists exact GLB, source, preview and build record. Use programRef returned by render/edit. To revise an asset, pass assetId and parentRevision; earlier revisions stay intact. Returns downloadable resources; draft renders never populate collections.',
      inputSchema: saveInput,
      run: async (raw) => {
        const { backdrop, ...input } = saveInput.parse(raw);
        const target = library();
        const activeRequirements = toolRequirements(context);
        const callContext = {
          ...context,
          requirements: activeRequirements.binding,
        };
        if (input.assetId && input.parentRevision) {
          const previous = await target.read(input.collection, input.assetId, input.parentRevision);
          assertSavedRequirementsAuthorized(previous.manifest, activeRequirements);
        }
        const code = await context.programStore!.get(input.programRef);
        const asset = await target.save(input.collection, {
          ...input,
          ...(await buildProgramAssetDraft(code, callContext, backdrop)),
        });
        return links(input.collection, asset);
      },
    },
    {
      name: 'kiln_assets',
      description:
        'collections discovers storage; catalog searches all configured collections; list searches one. Both searches paginate. get returns a build record/downloads; restore loads exact source for kiln_source/kiln_edit. Collection is not project membership. Binary-only assets cannot restore source.',
      inputSchema: assetsInput,
      run: async (raw) => {
        const input = assetsInput.parse(raw);
        const activeRequirements = toolRequirements(context);
        const target = library();
        if (input.action === 'collections') return { collections: target.collections() };
        if (input.action === 'catalog') {
          const catalog = await listAssetCatalog(target);
          const query = input.query?.toLowerCase();
          const all = catalog.entries.filter(
            ({ manifest: a }) =>
              (!input.assetId || a.assetId === input.assetId) &&
              (!query || `${a.name} ${a.tags.join(' ')}`.toLowerCase().includes(query)),
          );
          return {
            errors: catalog.errors,
            total: all.length,
            nextOffset: input.offset + input.limit < all.length ? input.offset + input.limit : null,
            assets: all
              .slice(input.offset, input.offset + input.limit)
              .map(({ collectionId, manifest: a }) => ({
                collection: collectionId,
                assetId: a.assetId,
                revisionId: a.revisionId,
                parentRevision: a.parentRevision,
                name: a.name,
                tags: a.tags,
                editable: a.editable,
                createdAt: a.createdAt,
              })),
          };
        }
        if (input.action === 'list') {
          const query = input.query?.toLowerCase();
          const all = (await target.list(input.collection)).filter(
            (a) =>
              (!input.assetId || a.assetId === input.assetId) &&
              (!query || `${a.name} ${a.tags.join(' ')}`.toLowerCase().includes(query)),
          );
          return {
            collection: input.collection,
            total: all.length,
            nextOffset: input.offset + input.limit < all.length ? input.offset + input.limit : null,
            assets: all.slice(input.offset, input.offset + input.limit).map((a) => ({
              assetId: a.assetId,
              revisionId: a.revisionId,
              parentRevision: a.parentRevision,
              name: a.name,
              tags: a.tags,
              editable: a.editable,
              createdAt: a.createdAt,
            })),
          };
        }
        if (!input.assetId || !input.revisionId)
          throw new Error('get/restore requires assetId and revisionId');
        const record = await target.read(input.collection, input.assetId, input.revisionId);
        if (input.action === 'get') return links(input.collection, record.manifest);
        const saved = assertSavedRequirementsAuthorized(record.manifest, activeRequirements);
        const code = record.files['source.kiln.js'];
        if (!code) throw new Error('Source unavailable: this asset contains only a GLB');
        return {
          ...(await links(input.collection, record.manifest)),
          programRef: await retainProgram(context.programStore!, new TextDecoder().decode(code)),
          requirements: activeRequirements,
          savedRequirements: saved,
          acceptance: 'reevaluation-required',
        };
      },
    },
    {
      name: 'kiln_present',
      description:
        'Present one exact saved revision. Supporting MCP App clients show an interactive 3D card with GLB, editable ZIP, and source downloads. Every host receives exact artifact descriptors with resource URIs in the JSON result; verified hosts may also receive core MCP resource-link blocks. This tool does not launch a local browser in coding harnesses. Call after saving or when the user wants to see or download an asset.',
      inputSchema: exportInput,
      outputSchema: z.object({
        ok: z.literal(true),
        collection: z.string(),
        asset: assetManifestSchema
          .pick({
            assetId: true,
            revisionId: true,
            parentRevision: true,
            name: true,
            tags: true,
            createdAt: true,
            editable: true,
            files: true,
          })
          .extend({
            build: z
              .object({
                engine: z.string(),
                rebuild: z.enum(['engine-required', 'external-dependencies-required']),
                warningCount: z.number().int(),
                warnings: z.array(z.string()),
              })
              .optional(),
          }),
        resources: z.array(
          z.object({
            type: z.literal('resource_link'),
            name: z.string(),
            uri: z.string(),
            mimeType: z.string(),
            size: z.number().int().nonnegative(),
            annotations: z.object({
              audience: z.array(z.enum(['user', 'assistant'])),
              priority: z.number(),
            }),
          }),
        ),
        downloadUrls: z.record(z.string(), z.string()).optional(),
      }),
      ui: {
        resourceUri: KILN_ASSET_WIDGET_URI,
        data: async (output) =>
          (await import('../asset-widget')).assetWidgetData(
            library(),
            output as {
              collection: string;
              asset: { assetId: string; revisionId: string };
            },
          ),
      },
      run: async (raw) => {
        const input = exportInput.parse(raw);
        return links(
          input.collection,
          (await library().read(input.collection, input.assetId, input.revisionId)).manifest,
        );
      },
    },
    {
      name: 'kiln_export',
      description:
        'Export one saved revision. Default editable returns exact GLB, source, preview, and manifest descriptors; configured hosts may include portable editable ZIP download URLs. Opt-in runtime returns a standalone GLB plus a versioned metadata sidecar, moving only Kiln review clips out of GLB extras while preserving native animation and application metadata. Resource URIs remain readable through resources/read. Canonical revisions never change; no binary bytes are placed in tool text.',
      inputSchema: profileExportInput,
      run: async (raw) => {
        const input = profileExportInput.parse(raw);
        if (input.profile === 'runtime') {
          const record = await library().read(input.collection, input.assetId, input.revisionId);
          return {
            ok: true,
            profile: input.profile,
            collection: input.collection,
            asset: {
              assetId: input.assetId,
              revisionId: input.revisionId,
              name: record.manifest.name,
            },
            resources: await (await import('../assets-resources')).runtimeAssetLinks(
              input.collection,
              record,
            ),
          };
        }
        return links(
          input.collection,
          (await library().read(input.collection, input.assetId, input.revisionId)).manifest,
        );
      },
    },
    {
      name: 'kiln_import',
      description:
        'Copy a pinned asset revision between configured collections, preserving identity and provenance. Copies never track later edits automatically. For a GLB or downloaded ZIP on disk, use kiln import <file> --collection <name> in the CLI.',
      inputSchema: importInput,
      run: async (raw) => {
        const input = importInput.parse(raw);
        const target = library();
        const record = await target.read(input.sourceCollection, input.assetId, input.revisionId);
        await target.import(input.collection, [record]);
        return links(input.collection, record.manifest);
      },
    },
  ];
}
