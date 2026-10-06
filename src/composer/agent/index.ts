/**
 * `@instruktlabs/kiln/composer/agent` — the Strands-driven scene-composition loop.
 *
 * The agent counterpart to the pure `@instruktlabs/kiln/composer` core: it exposes the
 * `scene_*` tool surface over a `PlacementModel` and drives any Strands `Model`
 * through it via {@link runKilnComposer}. Isolated on its own subpath so the
 * `@strands-agents/sdk` dependency does not leak into the composer core (which is
 * pure and THREE-free) — import from here only when you want the agent loop.
 *
 * - {@link runKilnComposer}        — drive a Strands Model through the scene_* tool loop
 * - {@link makeSceneComposerTools} — the 14-tool scene_* skin over a model + render port
 * - {@link COMPOSER_SYSTEM_PROMPT} / {@link buildComposerUserPrompt} — the prompts
 */
export { runKilnComposer } from './run';
export type { RunKilnComposerOptions, RunKilnComposerResult } from './run';

export { makeSceneComposerTools } from './tools';
export type { ComposerSink, MakeComposerToolsOptions, SceneRenderCandidate } from './tools';

export {
  buildComposerUserPrompt,
  COMPOSER_SYSTEM_PROMPT,
  WORLD_INTEGRATION_PROMPT_V2,
} from './prompt';
export type { BuildComposerPromptOptions } from './prompt';

export { makeWorldIntegrationToolsV2 } from './world-tools';
export type {
  MakeWorldIntegrationToolsV2Options,
  WorldIntegrationToolState,
} from './world-tools';

export { runKilnWorldIntegration } from './world-run';
export type {
  RunKilnWorldIntegrationOptions,
  RunKilnWorldIntegrationResult,
  WorldIntegrationRenderEvidence,
} from './world-run';

export { SceneCompactionManager } from './compaction';
export type { SceneCompactionConfig, SceneCompactionInfo } from './compaction';
