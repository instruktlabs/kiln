import { defineTiers } from '@kiln-scenes/scene-kit';
import type { LadderLevel, TierKnobs } from '@kiln-scenes/scene-kit';

/**
 * The live ladder steps only the knob Farm applies at run time: the grass fraction, in steps of .25 down to the
 * .25 floor (SPEC 8.3 rule 7). Z4 removes pixel-ratio steps, and Farm has no scaled instance sets and no LOD,
 * stream or zone knobs (SPEC 15), so the kit's generic ladder would add steps that change nothing and that the
 * benefit rule then reverts (M3b, R5-01). A tier already at or below the floor keeps a single level.
 */
export function vegetationLadder(pixelRatio: number, vegetationDensity: number): LadderLevel[] {
  const level = (density: number): LadderLevel => ({ pixelRatio, vegetationDensity: density, instanceDensity: 1, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 });
  const levels: LadderLevel[] = [];
  for (let step = 1; vegetationDensity - step * .25 >= .25 - 1e-9; step++) levels.push(level(Math.round((vegetationDensity - step * .25) * 100) / 100));
  return levels.length ? levels : [level(vegetationDensity)];
}

/** SPEC section 15; C-01 keeps high's floor at 1.0. Z4 disables live DPR steps. */
const tier = (pixelRatioCap: number, pixelRatioMin: number, vegetationDensity: number, type: 'pcf' | 'basic', mapSize: number, enabled = true): TierKnobs => ({
  pixelRatioCap, pixelRatioMin,
  shadows: { enabled, type, mapSize, maxCasters: enabled ? 1 : 0 },
  vegetationDensity, instanceDensity: 1,
  drawDistance: { far: 250, fogNear: 120, fogFar: 220, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 },
  effects: { water: enabled ? 'full' : 'simple', wind: enabled, ambientAnimation: enabled },
  ladder: vegetationLadder(pixelRatioCap, vegetationDensity),
});
export const farmTiers = defineTiers({
  order: ['minimal', 'economy', 'balanced', 'high'],
  minimal: tier(.6, .5, 0, 'basic', 512, false),
  economy: tier(.75, .6, .25, 'basic', 512),
  balanced: tier(1, .75, .5, 'pcf', 1024),
  high: tier(1.5, 1, 1, 'pcf', 2048),
});
