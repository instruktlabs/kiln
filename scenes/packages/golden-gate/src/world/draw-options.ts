// Draw optimisation switches (docs/plans/2026-10-01-draw-optimization-cycle.md S4/S4b, OD-18): what each feature level
// takes by default. The bridge merge applies at every level; the shadow and reflection features exist only where the pass
// does (High). The cached sun shadow is opt-in: Golden Gate's texel-snapped sun moves on almost every drive frame
// (tmp/drawcalls/understand/shadow-internals.check.md claim 22). Its maps render once per frame by construction, so it
// replaces the once-per-frame render. Test and dev builds override each switch through development parameters read in
// World.tsx (bridgeMerge, shadowOnce, standIns, reflectionStandIns, shadowCache), whose names stay out of public builds.
import type { GoldenGateFeatures } from '../tiers';

/** merge: bridge parts by material; once: the sun map once per frame; depth: shadow depth stand-ins; reflection: far-approach stand-ins in the planar reflection; cache: the cached static plus live sun shadow. */
export interface DrawOptions { merge: boolean; once: boolean; depth: boolean; reflection: boolean; cache: boolean }
export function drawOptions(f: GoldenGateFeatures, o: Partial<DrawOptions>): DrawOptions {
  const shadows = f.shadows.enabled, cache = shadows && o.cache === true;
  return { merge: o.merge !== false, once: shadows && !cache && o.once !== false, depth: shadows && o.depth !== false, reflection: f.water.reflection === 'planar' && o.reflection !== false, cache };
}
