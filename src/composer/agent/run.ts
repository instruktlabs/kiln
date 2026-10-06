/**
 * `runKilnComposer` — the scene-composition counterpart to `runKilnAgent`.
 *
 * Drives any Strands `Model` through the `scene_*` tool loop: the agent discovers
 * the fixed asset catalog, lays out / places / refines a structured scene model,
 * renders it through the host `SceneRenderPort` to SEE the result, and finalizes.
 * Reuses the asset-gen `MetricsCollector` (tool/step/usage + the runaway step cap)
 * and `unifiedDiff` (the refine patch artifact). The `@strands-agents/sdk`
 * dependency lives ONLY here on `@instruktlabs/kiln/composer/agent` — the composer core
 * (model / dsl / overlap / layout / render-port) never imports it.
 *
 * Never throws: failures come back on `result.error` with whatever the sink
 * captured beforehand (a step-capped or erroring run still returns its partial
 * program + placements).
 */
import { Agent, ImageBlock, TextBlock, type Message, type Tool } from '@strands-agents/sdk';

import { unifiedDiff } from '../../agent/diff';
import type { KilnInputImage } from '../../agent/run';
import type { GenerationCallBudget, GenerationCallBudgetReceipt } from '../../agent/call-budget';
import { type AgentUsage, type KilnAgentEvent, MetricsCollector } from '../../agent/hooks';
import { toCachedSystemPrompt } from '../../agent/providers';
import { SceneCompactionManager } from './compaction';
import { serialize } from '../dsl';
import { flatGround, type GroundSampler } from '../ground';
import {
  type CatalogEntry,
  type Placement,
  PlacementModel,
  type PlacementProvenance,
  type SceneModelJSON,
} from '../model';
import type { OverlapViolation } from '../overlap';
import type { PbrRenderPort, SceneRenderObservationPort, SceneRenderPort } from '../render-port';
import { buildComposerUserPrompt, COMPOSER_SYSTEM_PROMPT } from './prompt';
import { type ComposerSink, makeSceneComposerTools, type SceneRenderCandidate } from './tools';

export interface RunKilnComposerOptions {
  /** A constructed Strands `Model` instance (provider-agnostic). */
  model: unknown;
  /** Natural-language description of the scene to compose. */
  prompt: string;
  /** Optional scene reference. Direct-vision authors receive these exact bytes in
   * the initial turn; observer-backed hosts should omit it and inject their bounded
   * structured observation into `prompt` instead. */
  inputImage?: KilnInputImage;
  /** The selectable asset catalog (generationId + asset-local bbox). The agent may
   *  ONLY place these. Optional when `seedScene` already carries a catalog. */
  catalog?: CatalogEntry[];
  /** Host renderer: placements (+ optional cameras) → PNG(s). Injected so the
   *  composer core stays THREE-free; tests pass a stub returning a fixed PNG. */
  render: SceneRenderPort;
  /** OPTIONAL host PBR renderer seam (GLB bytes → per-view PNGs). Landed as a
   *  seam only: NO default implementation, and no composer tool calls it yet —
   *  absent means the feature is off and the run is byte-identical to today.
   *  Studio wiring is a separate, later change. */
  pbrRender?: PbrRenderPort;
  /** Display name for the scene (used in framing + the serialized program). */
  sceneName?: string;
  /** Terrain sampler. Default flat ground at y=0; a heightmap drops in unchanged. */
  ground?: GroundSampler;
  /** Deterministic layout seed. Default 1. */
  seed?: number;
  /** Refine an existing scene: seed the model from this JSON and frame the run as
   *  an edit (its serialized program is shown as the starting point, and the result
   *  carries a unified diff from it). Extra `catalog` entries are merged in. */
  seedScene?: SceneModelJSON;
  /** Agent name (for tracing). Default 'kiln-composer'. */
  agentName?: string;
  /** Live agent-loop events (tool/model calls) for progress UIs. Best-effort. */
  onEvent?: (event: KilnAgentEvent) => void;
  /** Live render candidates (one per successful scene_render) for a filmstrip. */
  onCandidate?: (c: SceneRenderCandidate) => void;
  /** Extra tools to expose (e.g. a Strands McpClient). */
  extraTools?: unknown[];
  /** Explicit first-stage model-call ceiling; overrides KILN_AGENT_MAX_STEPS. */
  maxSteps?: number;
  /** Shared aggregate allowance across compose, integration, observer, and repair phases. */
  generationCallBudget?: GenerationCallBudget;
  /** Optional host visual observer for a text-only composer author. When set, scene render PNGs
   * are converted to bounded structured evidence and never included in author tool results. */
  renderObservationPort?: SceneRenderObservationPort;
}

export interface RunKilnComposerResult {
  /** The final serialized scene program (the diffable, version-controlled artifact). */
  program?: string;
  /** The structured scene model JSON (machine round-trip / persistence). */
  scene?: SceneModelJSON;
  /** The evaluated world placements the renderer/runtime consume. */
  placements?: Placement[];
  /** instanceId → provenance (generationId + statement + optional source prompt). */
  provenance?: Record<string, PlacementProvenance>;
  /** Any unresolved footprint overlaps at finalize (surfaced, never dropped). */
  overlaps?: OverlapViolation[];
  /** Whether the agent called scene_finalize. */
  finalized: boolean;
  /** Every tool the model called, in order. */
  toolCalls: string[];
  /** Number of model calls (agent-loop iterations). */
  steps: number;
  /** Best-effort token usage. */
  usage?: AgentUsage;
  /** Snapshot of the shared aggregate allowance after this stage, when supplied. */
  callBudget?: GenerationCallBudgetReceipt;
  /** The last assistant text (fallback / diagnostics). */
  lastText?: string;
  /** When refining (seedScene set): a unified diff from the parent program. */
  diff?: string;
  /** True when the run hit the step cap before the agent called scene_finalize. NOT
   *  an error — the returned scene is the agent's best effort (layout + whatever
   *  refinement fit the budget); the host can persist it and flag it unfinalized. */
  capped?: boolean;
  /** Error message if the run THREW (a real failure). A step-cap is `capped`, not this. */
  error?: string;
}

function lastMessageText(message: Message | undefined): string | undefined {
  if (!message) return undefined;
  const parts: string[] = [];
  for (const block of message.content) {
    if ((block as { type?: string }).type === 'textBlock') {
      const t = (block as { text?: string }).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  const joined = parts.join('\n').trim();
  return joined.length ? joined : undefined;
}

function imageFormatFromMime(mime: string): 'png' | 'jpeg' | 'gif' | 'webp' {
  const normalized = mime.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpeg';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  return 'png';
}

/** Build the model from a fresh catalog or a seeded scene (merging extra catalog). */
function buildModel(opts: RunKilnComposerOptions): PlacementModel {
  const ground = opts.ground ?? flatGround(0);
  if (opts.seedScene) {
    const m = PlacementModel.fromJSON(opts.seedScene, ground);
    for (const e of opts.catalog ?? []) m.registerAsset(e);
    return m;
  }
  return new PlacementModel(opts.sceneName ?? 'Scene', {
    ground,
    ...(opts.seed != null ? { seed: opts.seed } : {}),
    catalog: opts.catalog ?? [],
  });
}

/**
 * Run one scene-composition session end-to-end. Never throws — failures are
 * returned on `result.error` with whatever the sink captured beforehand.
 */
export async function runKilnComposer(
  opts: RunKilnComposerOptions,
): Promise<RunKilnComposerResult> {
  // Runaway backstop (NOT a throttle): a stuck model could loop place/render
  // forever. Default 80 — compaction (below) keeps each step cheap regardless of how
  // long the run gets, so the cap is a far-back safety net, not the primary stop; the
  // agent should finalize well before it. Env-overridable (0 disables); shares the
  // asset-gen knob name for one place to tune.
  const maxSteps = opts.maxSteps ?? (Number(process.env['KILN_AGENT_MAX_STEPS'] ?? 80) || 0);
  // Compact the transcript once it grows past this many messages: the scene state
  // lives in the model, so the history is disposable working memory. Env-tunable.
  const compactAt = Number(process.env['KILN_COMPOSER_COMPACT_AT'] ?? 24) || 0;
  const metrics = new MetricsCollector(opts.onEvent, maxSteps, opts.generationCallBudget, 'author');
  const model = buildModel(opts);
  const parentProgram = opts.seedScene ? serialize(model) : undefined;
  const sink: ComposerSink = {};

  try {
    const tools: Tool[] = makeSceneComposerTools({
      model,
      render: opts.render,
      sink,
      ...(opts.onCandidate ? { onCandidate: opts.onCandidate } : {}),
      ...(opts.renderObservationPort ? { renderObservationPort: opts.renderObservationPort } : {}),
      ...(opts.generationCallBudget ? { generationCallBudget: opts.generationCallBudget } : {}),
    });
    const allTools: unknown[] = opts.extraTools ? [...tools, ...opts.extraTools] : tools;

    // Keep the loop lean + convergent: collapse the transcript to the live program
    // once it bloats (state is in the model, not the history) and nudge toward finalize.
    const compaction = new SceneCompactionManager({
      model,
      taskRecap: opts.sceneName ? `${opts.sceneName} — ${opts.prompt}` : opts.prompt,
      ...(compactAt ? { maxMessages: compactAt } : {}),
      onCompact: (info) =>
        opts.onEvent?.({ type: 'compaction', step: metrics.readMetrics().steps, ...info }),
    });

    const agent = new Agent({
      model: opts.model as never,
      // A2: same portable cache breakpoint as the asset agent — Anthropic/Bedrock
      // get [TextBlock, CachePointBlock]; other providers keep the plain string.
      // Safe here: the composer's system prompt is a static const, and the
      // SceneCompactionManager only manages `messages`, never the system prompt.
      systemPrompt: await toCachedSystemPrompt(COMPOSER_SYSTEM_PROMPT, opts.model),
      tools: allTools as never,
      name: opts.agentName ?? 'kiln-composer',
      conversationManager: compaction,
    });
    metrics.attach(agent);

    const catalogLines = model
      .catalogList()
      .map((e) => {
        // Role/tier at a glance (M3) — the same fields scene_list_assets returns.
        const traits = [e.role, e.tier ? `tier ${e.tier}` : undefined].filter(Boolean).join(', ');
        return `- ${e.name ?? e.generationId} — ${e.size[0]}×${e.size[1]}×${e.size[2]}${traits ? ` (${traits})` : ''}`;
      })
      .join('\n');

    const userPrompt =
      buildComposerUserPrompt({
        prompt: opts.prompt,
        ...(opts.sceneName ? { sceneName: opts.sceneName } : {}),
        ...(catalogLines ? { catalogSummary: catalogLines } : {}),
        ...(parentProgram ? { existingProgram: parentProgram } : {}),
      }) +
      (opts.inputImage
        ? '\n\nUse the attached scene reference as visual evidence for object identity, relative placement, scale, materials, and composition. Preserve ambiguity instead of inventing occluded geometry or exact depth.'
        : '');

    const initialTurn = opts.inputImage
      ? [
          new TextBlock(userPrompt),
          new ImageBlock({
            format: imageFormatFromMime(opts.inputImage.mime),
            source: { bytes: new Uint8Array(Buffer.from(opts.inputImage.base64, 'base64')) },
          }),
        ]
      : userPrompt;
    const result = await agent.invoke(initialTurn as never);
    metrics.recordResultUsage(result.metrics?.latestAgentInvocation?.usage);
    const lastText = lastMessageText(result.lastMessage);

    // Halted by the step cap: a SOFT stop, not a failure. Return the scene the sink
    // captured (continuous autosave: layout + whatever refinement fit the budget) with
    // `capped` set so the host can persist it and flag it unfinalized — discarding a
    // fully laid-out scene just because the agent over-refined would waste the work.
    if (metrics.wasCapped()) {
      const collected = metrics.readMetrics();
      return {
        ...sceneFields(sink, model),
        finalized: sink.finalized ?? false,
        capped: true,
        toolCalls: collected.toolCalls,
        steps: collected.steps,
        ...(collected.usage ? { usage: collected.usage } : {}),
        ...(opts.generationCallBudget ? { callBudget: opts.generationCallBudget.receipt() } : {}),
        ...(lastText ? { lastText } : {}),
      };
    }

    const collected = metrics.readMetrics();
    const program = sink.program;
    const diff =
      parentProgram && program
        ? unifiedDiff(parentProgram, program, { fromLabel: 'parent', toLabel: 'refined' })
        : undefined;

    return {
      ...sceneFields(sink, model),
      finalized: sink.finalized ?? false,
      toolCalls: collected.toolCalls,
      steps: collected.steps,
      ...(collected.usage ? { usage: collected.usage } : {}),
      ...(opts.generationCallBudget ? { callBudget: opts.generationCallBudget.receipt() } : {}),
      ...(lastText ? { lastText } : {}),
      ...(diff ? { diff } : {}),
    };
  } catch (err) {
    const collected = metrics.readMetrics();
    return {
      ...sceneFields(sink, model),
      finalized: sink.finalized ?? false,
      toolCalls: collected.toolCalls,
      steps: collected.steps,
      ...(collected.usage ? { usage: collected.usage } : {}),
      ...(opts.generationCallBudget ? { callBudget: opts.generationCallBudget.receipt() } : {}),
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    metrics.detach();
  }
}

/** The scene payload fields, from the sink when present (the agent built something)
 *  else evaluated fresh from the model (so even a no-tool run returns a valid scene). */
function sceneFields(
  sink: ComposerSink,
  model: PlacementModel,
): Pick<RunKilnComposerResult, 'program' | 'scene' | 'placements' | 'provenance' | 'overlaps'> {
  const program = sink.program ?? serialize(model);
  if (sink.placements) {
    return {
      program,
      scene: model.toJSON(),
      placements: sink.placements,
      ...(sink.provenance ? { provenance: sink.provenance } : {}),
      ...(sink.overlaps ? { overlaps: sink.overlaps } : {}),
    };
  }
  const ev = model.placements();
  return {
    program,
    scene: model.toJSON(),
    placements: ev.placements,
    provenance: ev.provenance,
    overlaps: ev.overlaps,
  };
}
