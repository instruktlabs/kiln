// Sky, environment light and sun (WATER-SPEC "Sky and fog").
// - The visible sky is three's TSL SkyMesh (Preetham), its colour wrapped by the scene fog so the
//   horizon, distant terrain and the water meet with no line. It follows the camera.
// - A second SkyMesh (sun disc off, darkened below the horizon like a dark sea) is rendered into a
//   PMREM that lights every standard material and gives the lower tiers their water reflection.
//   The PMREM target is reused; regeneration is throttled while presets blend.
// - The sun is one DirectionalLight. On High it casts one shadow cascade fitted around the focus
//   point with texel snapping; the shadow camera sees the traffic layer too.
// - During the planar-reflection render the sky hides its sun disc: the water adds the sun itself
//   through its GGX term, so the disc would otherwise be counted twice.
import { DirectionalLight, PMREMGenerator, Scene, Vector3, type Camera, type RenderTarget, type Texture, type WebGPURenderer } from 'three/webgpu';
import { Fn, cameraPosition, luminance, mix, normalize, positionWorld, smoothstep, vec3, vec4 } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { createAtmosphereUniforms, skyWithFog, type AtmosphereUniforms } from './fog';
import { normalizedSun, type GoldenGatePreset } from '../presets';
import { LAYERS } from '../constants';

export interface AtmosphereOptions { envSize: number; shadows: boolean; shadowMapSize: number; shadowExtent: readonly [number, number] }
export interface Atmosphere {
  readonly uniforms: AtmosphereUniforms;
  readonly sky: SkyMesh;
  readonly sun: DirectionalLight;
  readonly environment: Texture;
  /**
   * Applies preset values. The environment regenerates when the sky changed, at most every 0.25 s of
   * wall-clock time while presets blend (`force` regenerates now, for immediate switches).
   */
  apply(preset: GoldenGatePreset, nowSeconds: number, force?: boolean): void;
  /** Per frame: sky follows the camera, shadow cascade follows the focus. */
  update(camera: Camera, focus: Vector3, nowSeconds: number): void;
  /** Cameras for which the sky must hide its sun disc (planar reflection). */
  hideSunFor(camera: Camera | null): void;
  readonly stats: { environmentRenders: number };
  dispose(): void;
}

// TSL graphs are typed loosely: @types/three's node generics add no safety to shader construction.
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function createSky(u: AtmosphereUniforms, environment: boolean): SkyMesh {
  const sky = new SkyMesh();
  sky.name = environment ? 'environment-sky' : 'sky';
  sky.cloudCoverage.value = 0; // no clouds: SkyMesh's only time-dependent branch stays off
  const clear = sky.material.colorNode as N;
  sky.material.colorNode = Fn(() => {
    const fogged = skyWithFog(u, clear) as N;
    if (!environment) return vec4(fogged, 1);
    // Lighting calibration: Preetham skies are far more saturated than measured clear-sky skylight
    // (irradiance around 10,000 K, blue/red about 1.6-2 in linear sRGB against about 5 here), which
    // turned sunlit grass and paint blue. The environment keeps the sky's luminance and part of its
    // chroma; the water re-saturates its environment reflection (fog.ts `resaturate`).
    const calibrated = mix(vec3(luminance(fogged)), fogged, u.envSaturation);
    // The environment's lower hemisphere stands in for the sea and land under the sky: darker, so
    // undersides of the deck are not lit by a bright fog floor.
    const direction = normalize(positionWorld.sub(cameraPosition));
    return vec4(calibrated.mul(mix(1, .22, smoothstep(0, -.2, direction.y))), 1);
  })();
  sky.material.needsUpdate = true;
  sky.frustumCulled = false;
  sky.layers.set(LAYERS.world);
  return sky;
}

export function createAtmosphere(renderer: WebGPURenderer, scene: Scene, o: AtmosphereOptions): Atmosphere {
  const u = createAtmosphereUniforms();
  const sky = createSky(u, false);
  sky.scale.setScalar(100_000); // corners at 86.6 km, inside the 160 km far plane; depth is forced to the far plane
  scene.add(sky);

  const envSky = createSky(u, true), envScene = new Scene();
  envSky.scale.setScalar(100); envSky.showSunDisc.value = 0; envScene.add(envSky);
  const pmrem = new PMREMGenerator(renderer);
  let envTarget: RenderTarget = pmrem.fromScene(envScene, 0, .1, 1000, { size: o.envSize });
  const stats = { environmentRenders: 1 };

  const sun = new DirectionalLight(0xffffff, 3);
  sun.name = 'sun';
  sun.castShadow = o.shadows;
  if (o.shadows) {
    sun.shadow.mapSize.set(o.shadowMapSize, o.shadowMapSize);
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .35;
    sun.shadow.camera.near = 50; sun.shadow.camera.far = 9000;
    sun.shadow.camera.layers.enable(LAYERS.dynamic);
  }
  scene.add(sun, sun.target);

  let hiddenFor: Camera | null = null, sunDisc = 1;
  sky.onBeforeRender = (_renderer, _scene, camera) => { sky.showSunDisc.value = camera === hiddenFor ? 0 : sunDisc; };

  let envDirty = false, lastEnv = -Infinity, lastKey = '';
  const direction: [number, number, number] = [0, 1, 0];
  const sunDir = new Vector3(), right = new Vector3(), up = new Vector3(), snapped = new Vector3();

  const atmosphere: Atmosphere = {
    uniforms: u, sky, sun,
    get environment() { return envTarget.texture; },
    stats,
    apply(p, now, force = false) {
      normalizedSun(p, direction);
      u.sunDir.value.set(direction[0], direction[1], direction[2]);
      u.sunRadiance.value.setRGB(p.sunColor[0]! * p.sunIntensity, p.sunColor[1]! * p.sunIntensity, p.sunColor[2]! * p.sunIntensity);
      u.haze.value.set(p.hazeDensity, p.hazeHeight); u.marine.value.set(p.marineDensity, p.marineHeight);
      u.fogColor.value.setRGB(p.fogColor[0]!, p.fogColor[1]!, p.fogColor[2]!);
      u.fogSun.value.setRGB(p.fogSun[0]!, p.fogSun[1]!, p.fogSun[2]!);
      u.fogPower.value = p.fogPower; u.overcast.value = p.overcast;
      u.overcastColor.value.setRGB(p.overcastColor[0]!, p.overcastColor[1]!, p.overcastColor[2]!);
      u.skyGain.value = p.skyGain; u.envSaturation.value = p.envSaturation;
      for (const s of [sky, envSky]) {
        s.turbidity.value = p.turbidity; s.rayleigh.value = p.rayleigh; s.mieCoefficient.value = p.mie; s.mieDirectionalG.value = p.mieG;
        s.sunPosition.value.set(direction[0], direction[1], direction[2]);
      }
      sunDisc = p.sunDisc;
      sun.color.setRGB(p.sunColor[0]!, p.sunColor[1]!, p.sunColor[2]!); sun.intensity = p.sunIntensity;
      renderer.toneMappingExposure = p.exposure;
      scene.environmentIntensity = p.envIntensity;
      // Every value that changes the environment sky, rounded so settled blends stop regenerating.
      const key = [p.turbidity, p.rayleigh, p.mie, p.mieG, ...direction, p.overcast, ...p.overcastColor, ...p.fogColor, ...p.fogSun, p.fogPower, p.hazeDensity * 1e6, p.marineDensity * 1e6, p.skyGain, p.envSaturation].map(v => Math.round(v * 1000)).join();
      if (key !== lastKey) { lastKey = key; envDirty = true; }
      if (envDirty && (force || now - lastEnv > .25)) { envTarget = pmrem.fromScene(envScene, 0, .1, 1000, { size: o.envSize, renderTarget: envTarget }); envDirty = false; lastEnv = now; stats.environmentRenders++; }
      if (scene.environment !== envTarget.texture) scene.environment = envTarget.texture;
    },
    update(camera, focus, now) {
      sky.position.copy(camera.position);
      if (envDirty && now - lastEnv > .25) { envTarget = pmrem.fromScene(envScene, 0, .1, 1000, { size: o.envSize, renderTarget: envTarget }); envDirty = false; lastEnv = now; stats.environmentRenders++; }
      sunDir.copy(u.sunDir.value).normalize();
      if (!o.shadows) { sun.position.copy(focus).addScaledVector(sunDir, 4000); sun.target.position.copy(focus); return; }
      // One cascade around the focus: size from the viewing distance in 25 % steps (so zooming does
      // not resize it every frame), centre snapped to whole shadow texels in light space.
      const distance = camera.position.distanceTo(focus), [minExtent, maxExtent] = o.shadowExtent;
      const wanted = Math.min(maxExtent, Math.max(minExtent, distance * .75));
      const extent = minExtent * 1.25 ** Math.ceil(Math.log(wanted / minExtent) / Math.log(1.25));
      const texel = 2 * extent / o.shadowMapSize;
      right.set(0, 1, 0).cross(sunDir); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
      up.copy(sunDir).cross(right).normalize();
      const r = Math.round(focus.dot(right) / texel) * texel, v = Math.round(focus.dot(up) / texel) * texel, d = focus.dot(sunDir);
      snapped.copy(right).multiplyScalar(r).addScaledVector(up, v).addScaledVector(sunDir, d);
      sun.position.copy(snapped).addScaledVector(sunDir, 4000); sun.target.position.copy(snapped);
      const cam = sun.shadow.camera;
      if (cam.right !== extent) { cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent; cam.updateProjectionMatrix(); }
    },
    hideSunFor(camera) { hiddenFor = camera; },
    dispose() {
      sky.removeFromParent(); sun.removeFromParent(); sun.target.removeFromParent();
      sky.onBeforeRender = () => {};
      if (scene.environment === envTarget.texture) scene.environment = null;
      sky.geometry.dispose(); sky.material.dispose(); envSky.geometry.dispose(); envSky.material.dispose();
      envTarget.dispose(); pmrem.dispose(); sun.dispose();
    },
  };
  return atmosphere;
}
