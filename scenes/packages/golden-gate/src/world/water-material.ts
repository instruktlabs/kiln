// Golden Gate water (WATER-SPEC). One TSL graph for WebGPU and WebGL2; no compute, no storage textures.
//
// Vertex: clipmap geomorph (water-mesh.ts) and a sum of Gerstner waves, each faded where the local
// vertex spacing cannot carry it, faded out by the tier's displacement radius and attenuated in
// shallow water. Arguments are taken relative to a snapped origin with phases computed in double
// precision on the CPU, so sine arguments stay small everywhere.
//
// Fragment, per pixel:
//  - normals: analytic Gerstner slopes (each wave faded by its pixel footprint and, on Low, by view
//    distance; the lost slope variance kept as roughness) plus 2-3 layers of flow-advected slope-moment detail (LEAN: the
//    mip chain averages first and second moments, so distance turns detail into roughness);
//  - macro variation at two incommensurate scales modulates the chop and breaks any repetition;
//  - Fresnel: Schlick, F0 = 0.02;
//  - reflection: planar reflector on High (distorted by the normal, blurred by roughness), the sky
//    PMREM on Medium and Low;
//  - body: per-channel Beer-Lambert over the optical path (bathymetry, or the scene depth buffer
//    where it is shorter), scattering colour turning greener and browner toward the shore, and a
//    subsurface term on crests facing away from the sun;
//  - sun: GGX with the disc widening the lobe and a clamp, so glints are sharp without fireflies;
//  - foam: shore bands (exposed to the westerly swell), Gerstner-Jacobian whitecaps, depth-buffer
//    contact foam and analytic wakes downstream of the fender and piers, scaled by the tide;
//  - edge: alpha fades with shoreline distance, depth and scene-depth thickness (no seam, no z-fight);
//  - fog: the scene fog node (the same as every other material), so the horizon has no line.
import { MeshBasicNodeMaterial, Vector2, type DataTexture, type Texture } from 'three/webgpu';
import {
  Fn, abs, attribute, cameraFar, cameraNear, cameraPosition, clamp, cos, dFdx, dFdy, dot, exp, float, fract, fwidth, length, log2, max, min, mix,
  normalize, perspectiveDepthToViewZ, pmremTexture, positionGeometry, positionView, positionWorld, pow, reflect, saturate, screenUV, select, sin,
  smoothstep, sqrt, texture, uniform, varying, vec2, vec3, vec4, viewportDepthTexture,
} from 'three/tsl';
import { MORPH_END, MORPH_EPSILON, MORPH_START } from './water-mesh';
import { resaturate } from './fog';
import type { AtmosphereUniforms } from './fog';
import type { Bounds } from './water-maps';
import { BRIDGE } from '../constants';
import { WATER_DATA } from '../data';
import type { DetailLayerData, WaveData } from '../data';

// TSL graphs are typed loosely: @types/three's node generics add no safety to shader construction.
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Wave spectrum. A fetch-limited wind sea for a steady 8-10 m/s westerly through the Gate (JONSWAP-like
 * peak near 23 m / 3.8 s, amplitudes at roughly constant steepness kA = 0.03 above the peak) plus a
 * refracted Pacific swell pair (61-96 m, 6.3-7.8 s). All travel downwind, toward -X (east, into the
 * bay), spread +-30 degrees. Direction: degrees from +X toward +Z; propagation direction.
 */
export type GerstnerWave = WaveData;
/** data/water.json `waves` (D-21). */
export const GERSTNER_WAVES: readonly GerstnerWave[] = WATER_DATA.waves;
const GRAVITY = 9.81;
export function waveConstants(w: GerstnerWave) {
  const k = 2 * Math.PI / w.wavelength, a = w.direction * Math.PI / 180;
  return { k, omega: Math.sqrt(GRAVITY * k), dx: Math.cos(a), dz: Math.sin(a) };
}

/** Detail normal layers: tile size (m), rotation (deg), RMS slope at wind 1, drift speed downwind (m/s). */
export type DetailLayer = DetailLayerData;
export const DETAIL_LAYERS: readonly DetailLayer[] = WATER_DATA.detailLayers;
export const MACRO_TILES = WATER_DATA.macroTiles;
export const FLOW_PERIOD = WATER_DATA.flow.flowPeriod;        // seconds per two-phase flow cycle
export const SHORE_BAND_PERIOD = WATER_DATA.shoreBandPeriod;  // seconds between shore-foam bands
export const ORIGIN_SNAP = WATER_DATA.originSnap;             // metres
const FOAM_BREAKUP_TILE = 7.3;                               // metres, unrotated

export interface WaterMapBinding { texture: DataTexture; bounds: Bounds }
export interface WaterMaterialOptions {
  atmosphere: AtmosphereUniforms;
  grid: number;
  displacedWaves: number;       // 0 = normals only
  fragmentWaves: number;
  detailLayers: number;
  reflection: 'planar' | 'environment';
  reflectionNode?: N;           // TSL reflector (High)
  environment: Texture;         // sky PMREM
  depthContact: boolean;
  waveFade?: readonly [number, number]; // Low: view-distance fade (m) of the per-pixel waves into roughness
  near: WaterMapBinding; mid: WaterMapBinding;
  flow: WaterMapBinding;
  slopeMoments: DataTexture; macroNoise: DataTexture;
}

export function createWaterUniforms() {
  return {
    time: uniform(0),
    wind: uniform(1),
    tide: uniform(1),
    envIntensity: uniform(1),
    displaceRadius: uniform(450),
    clipCenter: uniform(new Vector2()),
    origin: uniform(new Vector2()),
    phases: GERSTNER_WAVES.map(() => uniform(0)),
    detailOffsets: DETAIL_LAYERS.map(() => uniform(new Vector2())),
    foamOffset: uniform(new Vector2()),
    macroOffsets: MACRO_TILES.map(() => uniform(new Vector2())),
    flowPhase: uniform(0),
    shorePhase: uniform(0),
    wakePhase: uniform(0),
    wakeWarpPhase: uniform(0),
    debug: uniform(0),          // 0 off, 1 body only, 2 normal, 3 foam, 4 roughness, 5 reflection only, 6 opacity factors
  };
}
export type WaterUniforms = ReturnType<typeof createWaterUniforms>;

const rotate = (p: N, degrees: number): N => { const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c))); };
const rotateBack = (p: N, degrees: number): N => rotate(p, -degrees);
const frac = (x: number) => x - Math.floor(x);

/** CPU side of the per-frame uniforms (double precision). */
export function updateWaterUniforms(u: WaterUniforms, time: number, cameraX: number, cameraZ: number): void {
  u.time.value = time;
  u.clipCenter.value.set(cameraX, cameraZ);
  const ox = Math.round(cameraX / ORIGIN_SNAP) * ORIGIN_SNAP, oz = Math.round(cameraZ / ORIGIN_SNAP) * ORIGIN_SNAP;
  u.origin.value.set(ox, oz);
  GERSTNER_WAVES.forEach((w, i) => {
    // The shader adds this to k dot (p - origin), leaving k dot p - omega*t.
    const c = waveConstants(w), phase = c.k * (c.dx * ox + c.dz * oz) - c.omega * time;
    u.phases[i]!.value = phase - Math.floor(phase / (2 * Math.PI)) * 2 * Math.PI;
  });
  DETAIL_LAYERS.forEach((layer, i) => {
    // uv = R(p) / tile + drift; p = origin + rel. Downwind is -X in world space.
    const a = layer.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const px = ox + layer.drift * time, pz = oz; // the pattern moves toward -X: sample at p + drift*t
    u.detailOffsets[i]!.value.set(frac((px * c - pz * s) / layer.tile), frac((px * s + pz * c) / layer.tile));
    // Foam uses a different tile and no rotation. Preserve its existing time drift,
    // but compensate this lookup's own origin instead of borrowing a detail-layer offset.
    if (i === 0) u.foamOffset.value.set(frac(ox / FOAM_BREAKUP_TILE + layer.drift * time * c / layer.tile), frac(oz / FOAM_BREAKUP_TILE + layer.drift * time * s / layer.tile));
  });
  MACRO_TILES.forEach((tile, i) => u.macroOffsets[i]!.value.set(frac(ox / tile), frac(oz / tile)));
  u.flowPhase.value = frac(time / FLOW_PERIOD);
  u.shorePhase.value = frac(time / SHORE_BAND_PERIOD);
  // Each wake phase wraps at its own period, so the advected streaks never jump (g2 wrapped the 23 m streaks every
  // 57 m of travel, a jump of 11 m every 30 s).
  u.wakePhase.value = frac(time * WAKE.speed / WAKE.period);
  u.wakeWarpPhase.value = frac(time * WAKE.speed / WAKE.warpPeriod);
}

function mapUv(position: N, bounds: Bounds): N {
  const [x0, z0, x1, z1] = bounds;
  return vec2(position.x.sub(x0).div(x1 - x0), float(z1).sub(position.y).div(z1 - z0));
}
/** Chebyshev distance from a point to the inside edge of a square map, positive inside. */
function insideEdge(position: N, bounds: Bounds): N {
  const [x0, z0, x1, z1] = bounds;
  return min(min(position.x.sub(x0), float(x1).sub(position.x)), min(position.y.sub(z0), float(z1).sub(position.y)));
}
/** Water depth (m) and signed shoreline distance (m, + over water), blended across the two map levels. */
function sampleMaps(o: WaterMaterialOptions, position: N, vertexStage: boolean): N {
  const near = texture(o.near.texture, mapUv(position, o.near.bounds)), mid = texture(o.mid.texture, mapUv(position, o.mid.bounds));
  const a: N = vertexStage ? (near as N).level(0) : near, b: N = vertexStage ? (mid as N).level(0) : mid;
  const wNear = smoothstep(0, 150, insideEdge(position, o.near.bounds)), wMid = smoothstep(0, 300, insideEdge(position, o.mid.bounds));
  const open = vec2(80, 4000); // beyond the maps: open, deep water
  return mix(open, mix(b.rg, a.rg, wNear), wMid);
}

export function createWaterMaterial(o: WaterMaterialOptions, u: WaterUniforms): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.name = 'golden-gate-water';
  material.fog = true;
  const atm = o.atmosphere, G = o.grid;
  const patch = attribute('tilePatch', 'vec4') as N;

  // ---------------------------------------------------------------- vertex
  const vertex = Fn(() => {
    const local = (positionGeometry as N).xz, size = patch.z, spacing = size.div(G);
    const grid0 = patch.xy.add(local.mul(size)).toVar();
    const cheb = max(abs(grid0.x.sub(u.clipCenter.x)), abs(grid0.y.sub(u.clipCenter.y)));
    const a = size.mul(MORPH_START + MORPH_EPSILON), b = size.mul(MORPH_END - MORPH_EPSILON);
    const morph = saturate(cheb.sub(a).div(b.sub(a))).toVar();
    const odd = fract(local.mul(G * .5)).mul(2);
    const p = grid0.sub(odd.mul(spacing).mul(morph)).toVar();
    const rel = p.sub(u.origin).toVar();
    const displaced = vec3(p.x, 0, p.y).toVar();
    if (o.displacedWaves > 0) {
      const distance = length(p.sub(vec2(cameraPosition.x, cameraPosition.z)));
      const radial = float(1).sub(smoothstep(u.displaceRadius.mul(.55), u.displaceRadius, distance));
      const depth = sampleMaps(o, p, true).x;
      const shallow = smoothstep(.3, 5, depth);
      const effectiveSpacing = spacing.mul(morph.add(1));
      const scale = radial.mul(shallow).mul(u.wind).toVar();
      GERSTNER_WAVES.slice(0, o.displacedWaves).forEach((w, i) => {
        const c = waveConstants(w);
        const fade = saturate(float(w.wavelength).div(effectiveSpacing).mul(.25).sub(1));
        const amplitude = scale.mul(fade).mul(w.amplitude);
        const theta = rel.x.mul(c.k * c.dx).add(rel.y.mul(c.k * c.dz)).add(u.phases[i]);
        const horizontal = amplitude.mul(w.steepness).mul(cos(theta));
        displaced.addAssign(vec3(horizontal.mul(c.dx), amplitude.mul(sin(theta)), horizontal.mul(c.dz)));
      });
    }
    return displaced;
  });
  const vertexResult = vertex();
  material.positionNode = vertexResult;
  // Undisplaced (morphed) surface parameter relative to the snapped origin, for per-pixel waves and maps.
  const relNode = Fn(() => {
    const local = (positionGeometry as N).xz, size = patch.z, spacing = size.div(G);
    const grid0 = patch.xy.add(local.mul(size));
    const cheb = max(abs(grid0.x.sub(u.clipCenter.x)), abs(grid0.y.sub(u.clipCenter.y)));
    const a = size.mul(MORPH_START + MORPH_EPSILON), b = size.mul(MORPH_END - MORPH_EPSILON);
    const morph = saturate(cheb.sub(a).div(b.sub(a)));
    return grid0.sub(fract(local.mul(G * .5)).mul(2).mul(spacing).mul(morph)).sub(u.origin);
  })();
  const vRel = varying(relNode, 'vWaterRel') as N;

  // ---------------------------------------------------------------- fragment
  const fragment = Fn(() => {
    const rel = vRel.toVar(), world = rel.add(u.origin).toVar();
    const footprint = max(length(fwidth(rel)), 1e-4).toVar();
    const maps = sampleMaps(o, world, false).toVar();
    const depthMap = maps.x, shore = maps.y;

    // Macro variation (two incommensurate scales).
    const m1 = texture(o.macroNoise, rel.div(MACRO_TILES[0]).add(u.macroOffsets[0]!)), m2 = texture(o.macroNoise, rel.div(MACRO_TILES[1]).add(u.macroOffsets[1]!));
    const macro = m1.mul(.6).add(m2.mul(.4)).toVar();
    const chop = macro.x.mul(.9).add(.55).toVar();

    // Shallow-water attenuation of the swell.
    const shallow = smoothstep(.3, 5, depthMap);

    // Gerstner slopes, Jacobian and crest height, filtered by footprint.
    const slope = vec2(0).toVar(), lostVariance = float(0).toVar(), height = float(0).toVar();
    const jxx = float(0).toVar(), jzz = float(0).toVar(), jxz = float(0).toVar(), compress = float(0).toVar();
    // Low (tier knob waveFade): four waves of nearly one direction sum to regular parallel bands across the
    // bay once the footprint filter has removed the shorter ones, so they also fade with view distance; the
    // slope they carried is kept as variance below and blurs the environment reflection instead.
    const distanceFade: N = o.waveFade ? float(1).sub(smoothstep(o.waveFade[0], o.waveFade[1], length(cameraPosition.sub(positionWorld)))).toVar() : null;
    GERSTNER_WAVES.slice(0, o.fragmentWaves).forEach((w, i) => {
      const c = waveConstants(w);
      const filtered = saturate(float(w.wavelength).div(footprint.mul(3)).sub(1));
      const visible = distanceFade ? filtered.mul(distanceFade).toVar() : filtered;
      const amplitude = u.wind.mul(shallow).mul(w.amplitude);
      const theta = rel.x.mul(c.k * c.dx).add(rel.y.mul(c.k * c.dz)).add(u.phases[i]);
      const ct = cos(theta), st = sin(theta), ka = amplitude.mul(c.k);
      slope.addAssign(vec2(c.dx, c.dz).mul(ka.mul(ct).mul(visible)));
      lostVariance.addAssign(float(1).sub(visible.mul(visible)).mul(ka).mul(ka).mul(.5));
      height.addAssign(amplitude.mul(st).mul(visible));
      const q = ka.mul(w.steepness).mul(st).mul(visible);
      jxx.addAssign(q.mul(c.dx * c.dx)); jzz.addAssign(q.mul(c.dz * c.dz)); jxz.addAssign(q.mul(c.dx * c.dz)); compress.addAssign(q);
    });
    // Jacobian of the horizontal displacement with a choppiness gain for crest detection.
    const gain = 7;
    const jacobian = float(1).sub(jxx.mul(gain)).mul(float(1).sub(jzz.mul(gain))).sub(jxz.mul(jxz).mul(gain * gain));

    // Flow (two-phase, with per-location phase noise so resets never line up).
    const flow = texture(o.flow.texture, mapUv(world, o.flow.bounds)).rg.mul(u.tide).mul(smoothstep(0, 200, insideEdge(world, o.flow.bounds))).toVar();
    const phaseA = fract(u.flowPhase.add(macro.z.mul(2.7))).toVar(), phaseB = fract(phaseA.add(.5));
    const weightA = float(1).sub(abs(phaseA.mul(2).sub(1))).toVar(), weightB = float(1).sub(weightA);
    const norm = sqrt(weightA.mul(weightA).add(weightB.mul(weightB))).toVar();
    const shiftA = flow.mul(phaseA.sub(.5).mul(FLOW_PERIOD)), shiftB = flow.mul(phaseB.sub(.5).mul(FLOW_PERIOD));

    // Detail layers (slope moments: xy mean slope, zw mean squared slope).
    const detailVariance = float(0).toVar();
    DETAIL_LAYERS.slice(0, o.detailLayers).forEach((layer, i) => {
      const base = rotate(rel, layer.rotation).div(layer.tile).add(u.detailOffsets[i]!);
      const sa = texture(o.slopeMoments, base.sub(rotate(shiftA, layer.rotation).div(layer.tile)));
      const sb = texture(o.slopeMoments, base.sub(rotate(shiftB, layer.rotation).div(layer.tile)));
      const meanA = sa.xy, meanB = sb.xy;
      const varA = max(sa.zw.sub(meanA.mul(meanA)), 0), varB = max(sb.zw.sub(meanB.mul(meanB)), 0);
      const mean = meanA.mul(weightA).add(meanB.mul(weightB)).div(norm);
      const variance = varA.mul(weightA.mul(weightA)).add(varB.mul(weightB.mul(weightB))).div(norm.mul(norm));
      const amplitude = u.wind.mul(layer.slope).mul(chop);
      slope.addAssign(rotateBack(mean, layer.rotation).mul(amplitude));
      detailVariance.addAssign(variance.x.add(variance.y).mul(amplitude.mul(amplitude)));
    });
    // Unresolved capillary roughness (wind) plus everything filtered away.
    const variance = u.wind.mul(.0035).add(.0008).add(lostVariance).add(detailVariance).toVar();
    const alpha = clamp(sqrt(variance.mul(2)), .03, .65).toVar();
    const normal = normalize(vec3(slope.x.negate(), float(1).sub(compress), slope.y.negate())).toVar();

    // View geometry.
    const toCamera = cameraPosition.sub(positionWorld).toVar(), viewDistance = length(toCamera);
    const V = toCamera.div(viewDistance).toVar();
    const NdotV = max(dot(normal, V), 1e-3).toVar();
    const fresnel = float(.02).add(float(.98).mul(pow(float(1).sub(NdotV), 5))).toVar();

    // Reflection.
    let reflection: N;
    const R = reflect(V.negate(), normal).toVar();
    const Rsky = normalize(vec3(R.x, max(R.y, .002), R.z));
    const envRoughness = clamp(alpha.mul(1.3), .02, 1);
    const env = resaturate(atm, pmremTexture(o.environment, Rsky, envRoughness).rgb).mul(u.envIntensity);
    if (o.reflection === 'planar' && o.reflectionNode) {
      const distortion = vec2(slope.x.negate(), slope.y).mul(.35).mul(smoothstep(0, 60, viewDistance).mul(.6).add(.4)).div(max(viewDistance.mul(.02), 1));
      const uv = vec2(float(1).sub(screenUV.x), screenUV.y).add(distortion);
      const lod = clamp(log2(alpha.mul(48).add(1)), 0, 6);
      const planar = o.reflectionNode.sample(clamp(uv, .001, .999)).level(lod).rgb;
      // Where the distorted ray leaves the screen the planar image has no data: fall back to the sky.
      const edge = smoothstep(0, .03, min(min(uv.x, float(1).sub(uv.x)), min(uv.y, float(1).sub(uv.y))));
      reflection = mix(env, planar, edge);
    } else reflection = env;

    // Lighting inputs.
    const L = normalize(atm.sunDir).toVar();
    const sun = vec3(atm.sunRadiance as N).toVar();
    const skyIrradiance = pmremTexture(o.environment, vec3(0, 1, 0), float(1)).rgb.mul(u.envIntensity).toVar(); // ~E/pi from the sky
    const sunDown = sun.mul(max(L.y, 0)).div(Math.PI);
    const downwelling = skyIrradiance.add(sunDown).toVar();

    // Scene-depth thickness (piers, fender, shallow terrain) along the view ray.
    let rayThickness: N = float(1e4);
    if (o.depthContact) {
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
      const axial = positionView.z.sub(sceneZ);
      rayThickness = max(axial, 0).mul(length(positionView)).div(max(positionView.z.negate(), 1e-3));
    }
    const ray = float(rayThickness).toVar();

    // Body colour: per-channel Beer-Lambert with an analytic bottom; turbidity rises toward the shore.
    const turbid = float(1).sub(smoothstep(25, 420, shore)).toVar();
    const extinction = mix(vec3(.45, .07, .09), vec3(.62, .26, .34), turbid).toVar();            // 1/m
    const scatterAlbedo = mix(vec3(.055, .08, .092), vec3(.085, .105, .07), turbid).toVar();      // deep-water reflectance
    const cosRefracted = sqrt(float(1).sub(float(1).sub(NdotV.mul(NdotV)).div(1.769)));
    const verticalDepth = min(depthMap, ray.mul(abs(V.y)));
    const path = verticalDepth.mul(float(1).add(float(1).div(max(cosRefracted, .2))));
    const transmittance = exp(extinction.mul(path).negate()).toVar();
    const bottom = mix(vec3(.2, .18, .13), vec3(.16, .15, .12), turbid);
    const body = downwelling.mul(scatterAlbedo.mul(float(1).sub(transmittance)).add(bottom.mul(transmittance))).toVar();
    // Subsurface: crests seen against the sun glow teal-green.
    const back = pow(saturate(dot(V.negate(), L)), 4);
    const crest = saturate(height.div(u.wind.mul(.35).add(.05)).add(.5));
    const sss = vec3(.08, .2, .17).mul(sun).mul(back).mul(crest).mul(pow(saturate(float(.5).sub(dot(L, normal).mul(.5))), 3).mul(2.5).add(.15)).mul(max(L.y, 0).mul(.7).add(.3));
    body.addAssign(sss.mul(float(1).sub(turbid.mul(.5))));

    // Sun: GGX with disc widening (angular radius 0.00465 rad) and a firefly clamp.
    const H = normalize(L.add(V));
    const NdotL = max(dot(normal, L), 0), NdotH = max(dot(normal, H), 0), VdotH = max(dot(V, H), 0);
    const a2 = alpha.mul(alpha).add(.00465 * .00465 * 4).toVar();
    const dDenominator = NdotH.mul(NdotH).mul(a2.sub(1)).add(1);
    const D = a2.div(dDenominator.mul(dDenominator).mul(Math.PI));
    const visibility = float(.5).div(NdotL.mul(sqrt(NdotV.mul(NdotV).mul(float(1).sub(a2)).add(a2))).add(NdotV.mul(sqrt(NdotL.mul(NdotL).mul(float(1).sub(a2)).add(a2)))).add(1e-4));
    const Fs = float(.02).add(float(.98).mul(pow(float(1).sub(VdotH), 5)));
    const specular = min(D.mul(visibility).mul(Fs).mul(NdotL), 40).mul(sun).toVar();

    // Foam.
    const breakup = smoothstep(.25, .75, macro.y.mul(.6).add(texture(o.slopeMoments, rel.div(FOAM_BREAKUP_TILE).add(u.foamOffset)).x.mul(.12)).add(.2));
    // (a) shore: slow bands travelling toward the shore, stronger where the west swell reaches.
    // World-space gradient of the shoreline distance from screen derivatives (no extra texture taps).
    const dwx = dFdx(world) as N, dwy = dFdy(world) as N, dsx = dFdx(shore) as N, dsy = dFdy(shore) as N;
    const det = dwx.x.mul(dwy.y).sub(dwx.y.mul(dwy.x));
    const safeDet = select(abs(det).lessThan(1e-8), float(1e-8), det);
    const gradient = vec2(dsx.mul(dwy.y).sub(dsy.mul(dwx.y)), dwx.x.mul(dsy).sub(dwy.x.mul(dsx))).div(safeDet);
    const exposure = saturate(dot(normalize(gradient.add(vec2(1e-4, 0))), vec2(1, 0)).mul(.6).add(.45));
    const bands = pow(float(.5).add(float(.5).mul(sin(shore.mul(2 * Math.PI / 11).add(u.shorePhase.mul(2 * Math.PI))))), 3);
    const shoreFoam = float(1).sub(smoothstep(3, 32, shore)).mul(bands.mul(.75).add(float(1).sub(smoothstep(1, 7, shore)))).mul(exposure).mul(breakup).mul(smoothstep(-1, 1.5, shore));
    // (b) whitecaps where the Jacobian folds, patchy by macro noise, scaled by wind.
    const whitecaps = smoothstep(.55, .12, jacobian).mul(smoothstep(.35, .8, macro.w)).mul(u.wind.mul(u.wind)).mul(breakup.mul(.7).add(.3));
    // (c) contact foam from the scene depth buffer and wakes downstream of the fender and piers.
    let contact: N = float(0);
    if (o.depthContact) contact = float(1).sub(smoothstep(.15, 2.2, ray)).mul(breakup.mul(.8).add(.2)).mul(smoothstep(.2, 1, depthMap.add(ray)));
    const wake = wakeFoam(world, u, distanceFade, abs(V.y)).mul(breakup.mul(.7).add(.3));
    const foam = saturate(shoreFoam.add(whitecaps).add(contact).add(wake)).toVar();

    // Composite.
    const water = body.mul(float(1).sub(fresnel)).add(reflection.mul(fresnel)).add(specular).toVar();
    const foamColor = downwelling.mul(.8);
    const color = mix(water, foamColor, foam.mul(.9)).toVar();

    // Edge: fade with shoreline distance, depth and scene thickness, so rock meets water softly.
    const opacity = smoothstep(-.5, 3, shore).mul(smoothstep(.02, .45, min(depthMap, ray.mul(abs(V.y)).add(.02)))).max(foam.mul(smoothstep(-1, 1, shore)).mul(.9)).toVar();

    // Debug views (development only).
    const d = u.debug;
    // 6: the three opacity factors (shoreline, mapped depth, scene thickness along the ray).
    const factors = vec3(smoothstep(-.5, 3, shore), smoothstep(.02, .45, depthMap), smoothstep(.02, .45, ray.mul(abs(V.y)).add(.02)));
    const debugColor = select(d.equal(1), body, select(d.equal(2), normal.mul(.5).add(.5), select(d.equal(3), vec3(foam), select(d.equal(4), vec3(alpha), select(d.equal(6), factors, reflection)))));
    return vec4(select(d.equal(0), color, debugColor), select(d.equal(0), saturate(opacity), float(1)));
  });
  const result = fragment();
  material.colorNode = result; // alpha travels in colorNode.a (opacityNode would multiply it again)
  return material;
}

/** Mean over one period of the wake's streak profile (smoothstep .15-.5 times smoothstep .95-.6). */
const TURBULENCE_MEAN = .45;
/**
 * The wake's turbulence streaks: advected at `speed` m/s with period `period` m, their spacing warped by a
 * second wave of period `warpPeriod` (the golden ratio times the first, so the two never repeat together)
 * and `warpAcross` m across the stream, by `warp` streak periods (under 1 / (2 pi period / warpPeriod), so
 * the streaks never fold); their contrast fades to the mean as the view looks down, from `elevation[0]` to
 * `elevation[1]` (the sine of the view ray's elevation above the water: 14.5 to 40.5 degrees).
 */
export const WAKE = { speed: 1.9, period: 23, warpPeriod: 23 * (1 + Math.sqrt(5)) / 2, warpAcross: 17, warp: .12, elevation: [.25, .65],
  decay: 110, spread: .08, edgeStrength: .15, gain: .35 } as const;
/**
 * Wakes streaming downstream (with the tide) from the south fender and the north tower pier. The 23 m
 * turbulence streaks are spaced irregularly by the second, incommensurate period, and fade to their mean
 * as the view looks down (`viewElevation`, the view vector's vertical component) and, on Low, with the
 * waves (`distanceFade`), so a wake seen from above or far away reads as a pale trail rather than a set
 * of parallel bands; at low angles the streaks keep g2's contrast.
 */
function wakeFoam(world: N, u: WaterUniforms, distanceFade: N | null, viewElevation: N): N {
  const f = BRIDGE.southFender, n = BRIDGE.pierFootings[0];
  const obstacles = [
    { x: f.x, z: f.z, halfAlong: f.rx, halfAcross: f.rz },
    { x: (n.x0 + n.x1) / 2, z: (n.z0 + n.z1) / 2, halfAlong: (n.x1 - n.x0) / 2, halfAcross: (n.z1 - n.z0) / 2 },
  ];
  const direction = select(u.tide.lessThan(0), float(-1), float(1)), strength = abs(u.tide);
  const lowAngle = float(1).sub(smoothstep(WAKE.elevation[0], WAKE.elevation[1], viewElevation));
  const contrast = distanceFade ? lowAngle.mul(distanceFade) : lowAngle;
  let total: N = float(0);
  for (const ob of obstacles) {
    const along = world.x.sub(ob.x).mul(direction).sub(ob.halfAlong * .7);
    const across = world.y.sub(ob.z);
    const width = along.max(0).mul(WAKE.spread).add(ob.halfAcross * .9);
    const core = exp(across.div(width).pow(2).negate());
    const edges = exp(abs(across).sub(width).div(width.mul(.22)).pow(2).negate());
    const lengthFade = exp(along.max(0).div(WAKE.decay).negate()).mul(smoothstep(-ob.halfAlong * .6, 8, along));
    // turbulence advected downstream with the current, its spacing warped by the second period
    const warp = sin(along.div(WAKE.warpPeriod).sub(u.wakeWarpPhase).add(across.div(WAKE.warpAcross)).mul(2 * Math.PI)).mul(WAKE.warp);
    const streak = fract(along.div(WAKE.period).sub(u.wakePhase).add(across.div(9).mul(.37)).add(warp));
    const streaks = smoothstep(.15, .5, streak).mul(smoothstep(.95, .6, streak));
    const turbulence = mix(float(TURBULENCE_MEAN), streaks, contrast);
    total = total.add(core.mul(.55).add(edges.mul(WAKE.edgeStrength)).mul(lengthFade).mul(turbulence.mul(.6).add(.4)));
  }
  return saturate(total.mul(strength).mul(WAKE.gain));
}

/** Material features that must never change after compile, for tests and reports. */
export function describeWater(o: Pick<WaterMaterialOptions, 'grid' | 'displacedWaves' | 'fragmentWaves' | 'detailLayers' | 'reflection' | 'depthContact' | 'waveFade'>) {
  return { grid: o.grid, displacedWaves: o.displacedWaves, fragmentWaves: o.fragmentWaves, detailLayers: o.detailLayers, reflection: o.reflection, depthContact: o.depthContact, waveFade: o.waveFade ?? null, waves: GERSTNER_WAVES, detail: DETAIL_LAYERS };
}
export const WATER_DEBUG = { off: 0, body: 1, normal: 2, foam: 3, roughness: 4, reflection: 5, opacity: 6 } as const;
