import { z } from 'zod';

/** Recorded effective export inputs. This excludes host credentials, execution mode and QA authority. */
export const rebuildOptionsSchema = z.object({
  gltfExporter: z.enum(['legacy', 'three']),
  geometryPolicy: z.enum(['warn', 'strict']),
  optimize: z.enum(['off', 'auto', 'palette', 'full']),
  instance: z.enum(['off', 'auto', 'on']),
});
export type RebuildOptions = z.infer<typeof rebuildOptionsSchema>;
