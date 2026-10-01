// Dimensions measured from the approved vehicle GLBs (tests/unit/vehicle-models.test.ts prints them),
// for tests that run the traffic and the driven car without loading the models.
import type { VehicleType } from '../../../src/traffic/vehicle-models';

export const DIMS: Record<VehicleType, { length: number; width: number; wheelRadius: number }> = {
  sedan: { length: 4.86, width: 1.87, wheelRadius: .33 }, hatchback: { length: 4.251, width: 1.81, wheelRadius: .315 }, suv: { length: 4.9, width: 1.94, wheelRadius: .365 },
  pickup: { length: 5.905, width: 2.05, wheelRadius: .4 }, 'box-truck': { length: 7.6, width: 2.504, wheelRadius: .42 }, 'transit-bus': { length: 12.208, width: 2.67, wheelRadius: .5 },
};
