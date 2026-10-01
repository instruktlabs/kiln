import { defineDevParams, readDevParams } from '@kiln-scenes/scene-kit';
import { NAMED_CAMERAS } from './constants';
import { PRESET_ORDER } from './presets';

export const WATER_DEBUG_VIEWS = ['off', 'body', 'normal', 'foam', 'roughness', 'reflection', 'opacity'] as const;
export const FLIGHT_NAMES = ['postcard-sweep', 'tower-rise', 'fog-roll', 'deck-run'] as const;
export type FlightName = typeof FLIGHT_NAMES[number];

/**
 * Test and developer URL parameters (compiled out of public builds by the kit's gate). The kit adds
 * `tier`, `backend=webgl2`, `time` (fixed scene time), `freeze`, `assetBase` and `dev`. `flight` starts a
 * flyover at load and `flightAt` (0..1) seeks it; with a fixed `time` the pose holds (review captures).
 */
export const GG_DEV_PARAMS = defineDevParams({
  cam: { kind: 'enum', values: Object.keys(NAMED_CAMERAS) },
  preset: { kind: 'enum', values: [...PRESET_ORDER] },
  tide: { kind: 'number' },
  waterDebug: { kind: 'enum', values: [...WATER_DEBUG_VIEWS] },
  flight: { kind: 'enum', values: [...FLIGHT_NAMES] },
  flightAt: { kind: 'number' },
  traffic: { kind: 'boolean' },
  density: { kind: 'enum', values: ['low', 'medium', 'high'] },
  hud: { kind: 'boolean' },
} as const);
export type GoldenGateDevParams = ReturnType<typeof readGoldenGateParams>;
export function readGoldenGateParams() { return readDevParams(GG_DEV_PARAMS); }
