import { defineTiers } from '@kiln-scenes/scene-kit';
import type { TierKnobs } from '@kiln-scenes/scene-kit';
import { AFTERNOON } from './light';

const tier = (pixelRatioCap: number, pixelRatioMin: number): TierKnobs => ({
  pixelRatioCap, pixelRatioMin,
  shadows: { enabled: true, type: 'pcf', mapSize: AFTERNOON.shadowMapSize, maxCasters: 4096 },
  vegetationDensity: 0, instanceDensity: 1,
  drawDistance: { far: 2600, fogNear: AFTERNOON.fogNear, fogFar: AFTERNOON.fogFar, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 },
  effects: { water: 'off', wind: false, ambientAnimation: false },
  ladder: [{ pixelRatio: pixelRatioCap, vegetationDensity: 0, instanceDensity: 1, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 }],
  multisample: { discard: false },
});

export const cathedralTiers = defineTiers({
  order: ['minimal', 'economy', 'balanced', 'high'],
  minimal: tier(0.6, 0.5),
  economy: tier(0.75, 0.6),
  balanced: tier(1, 0.75),
  high: tier(1.25, 1),
});
