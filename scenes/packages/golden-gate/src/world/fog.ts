// Scene-wide fog: two exponential height layers (haze and the marine layer) integrated
// analytically along each view ray, with one in-scatter colour function. The same functions
// fog every material (scene.fogNode), blend the sky dome toward the horizon, and fog the
// planar-reflection render, so water, terrain, bridge and sky meet the horizon with no line.
//
// Density of layer i at height y: b_i * exp(-max(y, 0) / H_i). Optical depth between heights
// y0 and y1 over path length L: b * L * (exp(-y0/H) - exp(-y1/H)) / ((y1 - y0) / H).
// Toward the sky (a ray to infinity with direction elevation s > 0): b * H * exp(-y0/H) / s.
// A camera below Y = 0 is the reflector's mirrored camera: integration starts where its ray
// crosses the water plane, so reflected light carries only the water-to-object leg (the
// water surface itself is fogged along the camera-to-water leg in the main pass).
import { Color, Vector2, Vector3 } from 'three/webgpu';
import { Fn, abs, cameraPosition, clamp, dot, exp, float, fog, luminance, max, mix, normalize, positionWorld, pow, select, uniform, vec3 } from 'three/tsl';

export interface FogLayer { density: number; height: number }

/** Optical depth of one layer along a segment between heights y0 and y1 (both clamped to >= 0). */
export function layerDepth(layer: FogLayer, y0: number, y1: number, length: number): number {
  const a = Math.max(0, y0), b = Math.max(0, y1), u = (b - a) / layer.height, e0 = Math.exp(-a / layer.height);
  const mean = Math.abs(u) > 1e-3 ? (e0 - Math.exp(-b / layer.height)) / u : e0 * (1 - u * .5);
  return layer.density * length * mean;
}
/** Fog factor (0 clear .. 1 opaque) for a point seen from a camera, matching the TSL node. */
export function fogFactor(layers: readonly FogLayer[], camera: readonly number[], point: readonly number[]): number {
  const dx = point[0]! - camera[0]!, dy = point[1]! - camera[1]!, dz = point[2]! - camera[2]!, length = Math.hypot(dx, dy, dz);
  const below = camera[1]! < 0 ? Math.min(1, Math.max(0, -camera[1]! / Math.max(dy, 1e-4))) : 0;
  let tau = 0; for (const layer of layers) tau += layerDepth(layer, camera[1]!, point[1]!, length * (1 - below));
  return 1 - Math.exp(-tau);
}
/** Fog factor toward the sky for a ray of elevation sine `s` from height `y0`. */
export function skyFogFactor(layers: readonly FogLayer[], y0: number, s: number): number {
  let tau = 0; for (const layer of layers) tau += layer.density * layer.height * Math.exp(-Math.max(0, y0) / layer.height) / Math.max(s, 1e-4);
  return 1 - Math.exp(-tau);
}

export type AtmosphereUniforms = ReturnType<typeof createAtmosphereUniforms>;
export function createAtmosphereUniforms() {
  return {
    haze: uniform(new Vector2(6.5e-5, 1300)),
    marine: uniform(new Vector2(3e-5, 70)),
    fogColor: uniform(new Color(.58, .67, .79)),
    fogSun: uniform(new Color(.28, .25, .19)),
    fogPower: uniform(10),
    sunDir: uniform(new Vector3(.55, .68, -.48)),
    sunRadiance: uniform(new Color(3, 2.9, 2.7)),
    overcast: uniform(0),
    overcastColor: uniform(new Color(.56, .59, .63)),
    skyGain: uniform(1),          // calibration of the clear (Preetham) sky radiance
    envSaturation: uniform(1),    // chroma kept in the environment sky (lighting); the water undoes it for reflections
  };
}

// TSL graphs are typed loosely: @types/three's node generics add no safety to shader construction.
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const layerTau = (layer: N, y0: N, y1: N, length: N): N => {
  const density = (layer as any).x, height = (layer as any).y;
  const e0 = exp((y0 as any).div(height).negate()), e1 = exp((y1 as any).div(height).negate());
  const u = (y1 as any).sub(y0).div(height);
  const mean = select(abs(u).greaterThan(1e-3), e0.sub(e1).div(u), e0.mul(float(1).sub(u.mul(.5))));
  return density.mul(length).mul(mean);
};

/** In-scattered fog colour seen along a direction: horizon colour plus a sun-side lobe. */
export function fogColorNode(u: AtmosphereUniforms, direction: N): N {
  const lobe = pow(max(dot(direction as any, u.sunDir).mul(.5).add(.5), 0), u.fogPower);
  return vec3(u.fogColor as N).add(vec3(u.fogSun as N).mul(lobe));
}
/** Fog factor for a world point from the current camera (reflection camera handled). */
export function fogFactorNode(u: AtmosphereUniforms, point: N): N {
  const c = cameraPosition, d = (point as any).sub(c), length = d.length();
  const below = select(c.y.lessThan(0), clamp(c.y.negate().div(max(d.y, 1e-4)), 0, 1), float(0));
  const y0 = max(c.y, 0), y1 = max((point as any).y, 0), path = length.mul(float(1).sub(below));
  const tau = layerTau(u.haze, y0, y1, path).add(layerTau(u.marine, y0, y1, path));
  return float(1).sub(exp(tau.negate()));
}
/** Fog factor toward the sky dome along a unit direction. */
export function skyFogFactorNode(u: AtmosphereUniforms, direction: N): N {
  const y0 = max(cameraPosition.y, 0), s = max((direction as any).y, 1e-4);
  const tau = (u.haze as any).x.mul(u.haze.y).mul(exp(y0.div(u.haze.y).negate()))
    .add((u.marine as any).x.mul(u.marine.y).mul(exp(y0.div(u.marine.y).negate()))).div(s);
  return float(1).sub(exp(tau.negate()));
}
/** Undoes the environment's chroma calibration for mirror-like reflections of the visible sky. */
export function resaturate(u: AtmosphereUniforms, color: N): N {
  const grey = vec3(luminance(color as N));
  return max(grey.add((color as any).sub(grey).div(max(u.envSaturation, .05))), 0);
}
/** scene.fogNode: every fogged material uses this. */
export function sceneFogNode(u: AtmosphereUniforms): N {
  const factor = Fn(() => fogFactorNode(u, positionWorld))();
  const color = Fn(() => fogColorNode(u, normalize(positionWorld.sub(cameraPosition))))();
  return fog(color, factor);
}
/** Blend a sky colour toward the fog colour exactly as distant geometry blends, plus overcast. */
export function skyWithFog(u: AtmosphereUniforms, clear: N): N {
  return Fn(() => {
    const direction = normalize(positionWorld.sub(cameraPosition));
    // CIE overcast luminance distribution: zenith three times the horizon.
    const overcastSky = vec3(u.overcastColor as N).mul(float(1).add(max(direction.y, 0).mul(2)).div(3).mul(1.6));
    const sky = mix((clear as any).rgb.mul(u.skyGain), overcastSky, u.overcast);
    return mix(sky, fogColorNode(u, direction), skyFogFactorNode(u, direction));
  })();
}
