import { defineTiers } from '@kiln-scenes/scene-kit';
import type { TierKnobs } from '@kiln-scenes/scene-kit';
import { DAY, SHADOW } from './light';

const tier = (pixelRatioCap: number, pixelRatioMin: number, mapSize: number): TierKnobs => ({
  pixelRatioCap, pixelRatioMin,
  shadows: { enabled: true, type: 'pcf', mapSize, maxCasters: 4096 },
  vegetationDensity: 0, instanceDensity: 1,
  drawDistance: { far: 900, fogNear: DAY.fogNear, fogFar: DAY.fogFar, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 },
  effects: { water: 'off', wind: false, ambientAnimation: false },
  ladder: [{ pixelRatio: pixelRatioCap, vegetationDensity: 0, instanceDensity: 1, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 }],
  multisample: { discard: false },
});

export const townTiers = defineTiers({
  order: ['minimal', 'economy', 'balanced', 'high'],
  minimal: tier(0.6, 0.5, 1024),
  economy: tier(0.75, 0.6, 2048),
  balanced: tier(1, 0.75, 2048),
  high: tier(1.5, 1, SHADOW.mapSize),
});
