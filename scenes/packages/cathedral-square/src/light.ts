/**
 * Afternoon from the film lighting recipe: the sun sits in the south-west so the west front
 * and the south flank are lit together. Azimuth 0 is north (+Z), 90 east (-X), 180 south (-Z),
 * 270 west (+X). The film's path-traced afternoon uses sun intensity 4.6 and exposure 1.8.
 * Those values blow out a three.js raster frame, so the walk uses a lower sun and an exposure
 * near 1, with a hemisphere so the shade stays readable.
 */
export const AFTERNOON = {
  // This higher south-west afternoon reaches the nave through the actual aisle windows.
  elevation: 48,
  azimuth: 205,
  sunColor: 0xffe3c0,
  sunIntensity: 3.05,
  exposure: 1.02,
  hemisphereSky: 0xd5e3f0,
  hemisphereGround: 0x8a7260,
  hemisphereIntensity: 0.7,
  sky: '#a7bccc',
  fogNear: 160,
  fogFar: 1180,
  shadowExtent: 116,
  shadowMapSize: 2048,
  shadowNear: 1,
  shadowFar: 680,
  shadowNormalBias: 0.035,
  shadowBias: -0.00012,
  shadowRadius: 1.6,
  lightDistance: 260,
  /** Fixed cathedral coverage includes the apse, tower crowns and near parvis at 11.3 cm/texel. */
  shadowFocus: [0, 28, 0] as [number, number, number],
};

/** Unit vector from the ground toward the afternoon sun. */
export function afternoonSunDirection(): { x: number; y: number; z: number } {
  const azimuth = AFTERNOON.azimuth * Math.PI / 180;
  const elevation = AFTERNOON.elevation * Math.PI / 180;
  const horizontal = Math.cos(elevation);
  return { x: -Math.sin(azimuth) * horizontal, y: Math.sin(elevation), z: Math.cos(azimuth) * horizontal };
}
