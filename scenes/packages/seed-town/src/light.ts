/**
 * Two hours of the same town. Streets run north (+Z); the day sun stands in the south-west so the
 * east side of each street is lit and the west side throws its shadow across the carriageway. At
 * dusk the sun is low in the west and the windows and lamps the plan lights carry the street.
 */
export interface Hour {
  /** Unit vector from the ground toward the sun. */
  sun: [number, number, number];
  sunColor: [number, number, number];
  sunIntensity: number;
  skyColor: [number, number, number];
  groundColor: [number, number, number];
  hemisphereIntensity: number;
  /** Fog colour and the sky at the horizon. */
  horizon: [number, number, number];
  /** The sky overhead. */
  zenith: [number, number, number];
  /** Added to the sky round the sun. */
  skyGlow: [number, number, number];
  /** What window glass reflects at eye level: the far side of the street. */
  street: [number, number, number];
  fogNear: number;
  fogFar: number;
  exposure: number;
  /** Multiplies the emissive strength the kits' glow material carries. */
  glow: number;
  /** Strength of the pools of light under lit lamps and shop windows, 0 to 1. */
  pools: number;
}

const unit = (x: number, y: number, z: number): [number, number, number] => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};

export const DAY: Hour = {
  sun: unit(-0.52, 0.78, -0.42),
  sunColor: [1, 0.95, 0.86],
  sunIntensity: 3,
  skyColor: [0.78, 0.87, 0.98],
  groundColor: [0.62, 0.56, 0.48],
  hemisphereIntensity: 1.35,
  horizon: [0.74, 0.84, 0.93],
  zenith: [0.3, 0.52, 0.84],
  skyGlow: [0.3, 0.28, 0.22],
  street: [0.56, 0.53, 0.48],
  fogNear: 110,
  fogFar: 640,
  exposure: 1,
  glow: 1,
  pools: 0,
};

export const DUSK: Hour = {
  sun: unit(-0.86, 0.2, 0.3),
  sunColor: [1, 0.55, 0.32],
  sunIntensity: 1.5,
  skyColor: [0.52, 0.58, 0.86],
  groundColor: [0.42, 0.34, 0.36],
  hemisphereIntensity: 1.5,
  horizon: [0.9, 0.56, 0.4],
  zenith: [0.13, 0.18, 0.42],
  skyGlow: [1, 0.42, 0.12],
  street: [0.4, 0.3, 0.3],
  fogNear: 70,
  fogFar: 460,
  exposure: 1.1,
  glow: 0.62,
  pools: 1,
};

/** The real lights the nearest lit lanterns carry: how many by tier, and each one's strength and reach. */
export const LANTERN = { count: { minimal: 0, economy: 4, balanced: 6, high: 8 } as Record<string, number>, color: [1, 0.72, 0.42] as [number, number, number], intensity: 14, distance: 20 };

export const SHADOW = { mapSize: 4096, near: 1, far: 420, distance: 200, bias: -0.00012, normalBias: 0.03, radius: 1.4, margin: 14 };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [mix(a[0]!, b[0]!, t), mix(a[1]!, b[1]!, t), mix(a[2]!, b[2]!, t)];

/** The light between two hours; `t` runs 0 (from) to 1 (to). The sun direction stays a unit vector. */
export function blendHours(from: Hour, to: Hour, t: number): Hour {
  // The ends are the hours themselves, not a renormalised copy a rounding step away.
  if (t <= 0) return from;
  if (t >= 1) return to;
  const k = t, s = k * k * (3 - 2 * k);
  const sun = mix3(from.sun, to.sun, s);
  return {
    sun: unit(sun[0], sun[1], sun[2]),
    sunColor: mix3(from.sunColor, to.sunColor, s),
    sunIntensity: mix(from.sunIntensity, to.sunIntensity, s),
    skyColor: mix3(from.skyColor, to.skyColor, s),
    groundColor: mix3(from.groundColor, to.groundColor, s),
    hemisphereIntensity: mix(from.hemisphereIntensity, to.hemisphereIntensity, s),
    horizon: mix3(from.horizon, to.horizon, s),
    zenith: mix3(from.zenith, to.zenith, s),
    skyGlow: mix3(from.skyGlow, to.skyGlow, s),
    street: mix3(from.street, to.street, s),
    fogNear: mix(from.fogNear, to.fogNear, s),
    fogFar: mix(from.fogFar, to.fogFar, s),
    exposure: mix(from.exposure, to.exposure, s),
    glow: mix(from.glow, to.glow, s),
    pools: mix(from.pools, to.pools, s),
  };
}
