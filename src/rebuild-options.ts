import { z } from 'zod';

/** Full-mode artifact bytes changed when rigid-group merging replaced flatten/join. */
export const FULL_OPTIMIZATION_PIPELINE = 'rigid-v1' as const;

/** Recorded effective export inputs. This excludes host credentials, execution mode and QA authority. */
export const rebuildOptionsSchema = z.object({
  // Optional when reading older saved receipts; new builds always record the effective policy.
  indexPolicy: z.enum(['indexed', 'asBuilt']).optional(),
  gltfExporter: z.enum(['legacy', 'three']),
  geometryPolicy: z.enum(['warn', 'strict']),
  optimize: z.enum(['off', 'auto', 'palette', 'full']),
  optimizationPipeline: z.literal(FULL_OPTIMIZATION_PIPELINE).optional(),
  instance: z.enum(['off', 'auto', 'on']),
});
export type RebuildOptions = z.infer<typeof rebuildOptionsSchema>;

/**
 * The evaluator options an exact rebuild of a saved revision passes, from its saved
 * `build.options`. Shared by `kiln asset --rebuild` and the corpus gate so the two cannot
 * drift: missing settings and an unversioned full pipeline are refused, never guessed.
 */
export function savedRebuildRenderOptions(
  saved: unknown,
): Omit<RebuildOptions, 'optimizationPipeline'> {
  const parsed = rebuildOptionsSchema.safeParse(saved);
  if (!parsed.success)
    throw new Error(
      'Saved exporter settings are incomplete; use an explicit new authoring run instead of an exact rebuild.',
    );
  if (
    parsed.data.optimize === 'full' &&
    parsed.data.optimizationPipeline !== FULL_OPTIMIZATION_PIPELINE
  )
    throw new Error(
      'Saved revision uses an unversioned full optimization pipeline; rebuild with its original pinned engine, or explicitly author and save a new child revision to migrate.',
    );
  // The pipeline version is replay metadata, not an evaluator input option.
  const { optimizationPipeline: _pipeline, ...renderOptions } = parsed.data;
  return renderOptions;
}
