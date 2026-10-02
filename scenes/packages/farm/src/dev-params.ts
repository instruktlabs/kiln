import { defineDevParams, readDevParams } from '@kiln-scenes/scene-kit';

export interface FarmDevParams {
  woodlandTangents?: boolean; staticBaseline?: boolean; instanceUniforms?: boolean; warmConcurrency?: number;
  heroMerge?: boolean; shadowCache?: boolean; standIns?: boolean; casterTexels?: number;
}
/**
 * Test and dev builds only (the literal folds away in public builds): A/B switches read from the page URL. M2-M4: woodland
 * tangents, the unbatched static baseline, three's per-mesh instance uniforms and the warm pass's concurrency. S4/S5: the
 * hero anchor merge, the cached sun shadow, hero shadow stand-ins and the small-caster threshold in texels (0 = off).
 */
export function readFarmDevParams(): FarmDevParams {
  return import.meta.env.KILN_TEST || import.meta.env.KILN_DEV ? readDevParams(defineDevParams({ woodlandTangents: { kind: 'boolean' }, staticBaseline: { kind: 'boolean' }, instanceUniforms: { kind: 'boolean' }, warmConcurrency: { kind: 'number' },
    heroMerge: { kind: 'boolean' }, shadowCache: { kind: 'boolean' }, standIns: { kind: 'boolean' }, casterTexels: { kind: 'number' } })) : {};
}
