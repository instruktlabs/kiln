/**
 * `@instruktlabs/kiln/agent` — the agnostic, tool-driven Kiln codegen foundation
 * (validated in the pixel-forge kiln-bench harness, folded in 2026-06).
 *
 * Isolated on its own subpath export so the `@strands-agents/sdk` dependency
 * does not leak into the rest of the engine — import from `@instruktlabs/kiln/agent`
 * only when you want the agent loop.
 *
 * - {@link runKilnAgent}      — drive any Strands Model through the kiln tool loop
 * - {@link generateKilnAsset} — model id -> tool loop -> rendered GLB (the default codegen engine)
 * - {@link makeKilnModel}     — agnostic Strands model factory (native + OpenRouter)
 * - {@link resolveKilnAgentModel} — model-id string -> Strands provider descriptor
 * - {@link makeKilnNativeTools} — native skin over shared reference tools and terminal completion
 * - {@link unifiedDiff}       — dependency-free unified diff (the refine patch artifact)
 * - {@link ensureStreamStart} — the OpenRouter/Vercel-bridge stream fix
 * - {@link makeOpenRouterModel} — build an OpenRouter Strands model with the fix
 * - {@link MetricsCollector}  — per-loop tool/step/usage metrics via hooks
 * - {@link installRenderImageCompaction} — prune superseded render images from the transcript
 */
export { runKilnAgent } from './run';
export type { RunKilnAgentOptions, RunKilnAgentResult, KilnKnowhow, KilnInputImage } from './run';

export type { RefineMode } from './run';

export { DEFAULT_INLOOP_VIEW_RENDER_TIMEOUT_MS } from '../tools/registry';
export type {
  InLoopViewRender,
  RenderObservationInput,
  RenderObservationPort,
  RenderObservationValue,
} from '../tools/registry';

export {
  generateKilnAsset,
  generateKilnCodeAgent,
  captureViewsViaPort,
  DEFAULT_KILN_AGENT_MODEL,
  DEFAULT_VIEW_RENDER_TIMEOUT_MS,
} from './generate';
export type {
  GenerateKilnAssetOptions,
  GenerateKilnAssetResult,
  PortViewsOutcome,
} from './generate';

export { makeKilnNativeTools } from './tools';
export type { EditRecord, EditResult, KilnRenderCandidate } from './tools';
export type { ProgramArtifact, NativeCompletion } from '../tools/program-artifacts';

export { unifiedDiff } from './diff';
export type { UnifiedDiffOptions } from './diff';

export {
  pruneStaleRenderImages,
  installRenderImageCompaction,
  installGenerationCounters,
  STALE_RENDER_PLACEHOLDER,
} from './compaction';
export type {
  PruneImagesResult,
  RenderImageCompactionOptions,
  ModelCallStat,
  GenerationCounters,
} from './compaction';

export { ensureStreamStart } from './stream-start';

export {
  makeOpenRouterModel,
  makeKilnModel,
  resolveKilnAgentModel,
  harnessIdToAgentModelId,
  modelConsumesSystemPromptCachePoints,
  toCachedSystemPrompt,
} from './providers';
export type {
  OpenRouterModelOptions,
  KilnAgentProvider,
  KilnModelDescriptor,
  MakeKilnModelOptions,
} from './providers';

export { MetricsCollector } from './hooks';
export type { CollectedMetrics, AgentUsage, KilnAgentEvent } from './hooks';

export {
  createGenerationCallBudget,
  generationModelCallLimitFromEnv,
  resolveGenerationModelCallLimit,
  DEFAULT_GENERATION_MODEL_CALL_LIMIT,
} from './call-budget';
export type {
  GenerationCallBudget,
  GenerationCallBudgetReceipt,
  GenerationModelCallAdmission,
  GenerationModelCallAdmissionDecision,
  GenerationModelCallAdmissionInput,
  GenerationModelCallRole,
} from './call-budget';

export {
  resolveViewRenderTimeoutMs,
  MIN_VIEW_RENDER_TIMEOUT_MS,
  MAX_VIEW_RENDER_TIMEOUT_MS,
} from './view-render-timeout';
export type {
  ResolveViewRenderTimeoutInput,
  ViewRenderRequestKind,
  ViewRenderTimeoutContextProvider,
  ViewRenderTimeoutHostContext,
  ViewRenderTimeoutResolver,
  ViewRenderTimeoutResolverContext,
  ViewRenderWarmUpState,
} from './view-render-timeout';
