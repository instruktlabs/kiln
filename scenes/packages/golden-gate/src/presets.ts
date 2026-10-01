// Day, Golden hour and Fog (WATER-SPEC "Sky and fog"). Every value blends linearly through the kit's
// preset blender; colours are linear RGB, directions point toward the sun and are renormalized on use.
// Exposure is fixed per preset (no auto-exposure). Values come from data/presets.json (D-21).
import { PRESET_DATA } from './data';

export type GoldenGatePreset = {
  sunDir: readonly number[];      // toward the sun: +X west, +Z north
  sunColor: readonly number[];    // linear RGB, multiplied by sunIntensity
  sunIntensity: number;
  envIntensity: number;           // scene.environmentIntensity for the sky PMREM
  envSaturation: number;          // environment-sky chroma kept (1 = the visible sky's); see atmosphere.ts
  turbidity: number; rayleigh: number; mie: number; mieG: number; sunDisc: number;
  overcast: number;               // 0 clear sky .. 1 fully overcast
  overcastColor: readonly number[];
  fogColor: readonly number[];    // in-scattered colour at the horizon, away from the sun
  fogSun: readonly number[];      // sun-side in-scatter (power lobe around the sun direction)
  fogPower: number;               // sharpness of the sun-side lobe
  hazeDensity: number; hazeHeight: number;     // exponential haze: extinction at sea level (1/m), scale height (m)
  marineDensity: number; marineHeight: number; // marine layer
  exposure: number;
  skyGain: number;                // clear-sky radiance calibration (Preetham output scale)
  wind: number;                   // whitecap and chop scale (westerly strength)
  banks: number;                  // fog-bank opacity (High tier only)
  lights: number;                 // vehicle headlights and taillights
  lamps: number;                  // deck lamps and tower beacons
};

export const PRESET_ORDER = ['day', 'golden', 'fog'] as const;
export type PresetName = typeof PRESET_ORDER[number];
if (PRESET_DATA.order.join() !== PRESET_ORDER.join()) throw new Error(`data/presets.json order ${PRESET_DATA.order.join()} differs from the scene's presets`);
export const PRESET_LABELS = Object.fromEntries(PRESET_ORDER.map(name => [name, PRESET_DATA.presets[name]!.label])) as Record<PresetName, string>;

const dir = (azimuthFromWestTowardNorthDeg: number, elevationDeg: number): number[] => {
  const a = azimuthFromWestTowardNorthDeg * Math.PI / 180, e = elevationDeg * Math.PI / 180;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};

/** The presets as data/presets.json defines them, with the sun direction resolved. */
function fromData(name: PresetName): GoldenGatePreset {
  const data = PRESET_DATA.presets[name];
  if (!data) throw new Error(`data/presets.json has no preset ${name}`);
  const { label: _label, sunAzimuthDeg, sunElevationDeg, ...values } = data;
  return { ...values, sunDir: dir(sunAzimuthDeg, sunElevationDeg) };
}
export const PRESETS = Object.fromEntries(PRESET_ORDER.map(name => [name, fromData(name)])) as Record<PresetName, GoldenGatePreset>;

export function normalizedSun(p: GoldenGatePreset, out: [number, number, number] = [0, 1, 0]): [number, number, number] {
  const [x, y, z] = p.sunDir as [number, number, number], l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l; return out;
}
