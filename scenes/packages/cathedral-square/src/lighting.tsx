import { useThree } from '@react-three/fiber';
import { DirectionalLight, Group, HemisphereLight, Vector3 } from 'three/webgpu';
import { asWebGPU, SystemOrder, useBuilt, useQuality, useSystem } from '@kiln-scenes/scene-kit';
import { cachedSunShadow, shadowOncePerFrame } from '@kiln-scenes/scene-kit/shadows';
import type { CachedSunShadow } from '@kiln-scenes/scene-kit/shadows';
import { AFTERNOON, afternoonSunDirection } from './light';
import { createStainedSunBinding } from './stained-light';
import { createInteriorBounce } from './candles';

export interface SunRig {
  light: DirectionalLight;
  cache: CachedSunShadow | null;
  once: { update(): void; restore(): void } | null;
}

let installed: SunRig | null = null;
export function currentSun(): SunRig | null { return installed; }

/** One afternoon sun, sky fill, and one cached shadow map. Exposure is restored on unmount. */
export function SquareLighting() {
  const state = useThree();
  const quality = useQuality();
  const lights = useBuilt(() => {
    const renderer = asWebGPU(state.gl);
    const previousExposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = AFTERNOON.exposure;
    const root = new Group();
    root.name = 'Cathedral square lighting';
    const hemisphere = new HemisphereLight(AFTERNOON.hemisphereSky, AFTERNOON.hemisphereGround, AFTERNOON.hemisphereIntensity);
    hemisphere.name = 'Sky fill';
    const sun = new DirectionalLight(AFTERNOON.sunColor, AFTERNOON.sunIntensity);
    sun.name = 'Afternoon sun';
    const focus = new Vector3(...AFTERNOON.shadowFocus);
    const direction = afternoonSunDirection();
    sun.position.set(
      focus.x + direction.x * AFTERNOON.lightDistance,
      focus.y + direction.y * AFTERNOON.lightDistance,
      focus.z + direction.z * AFTERNOON.lightDistance,
    );
    sun.target.position.copy(focus);
    const shadows = quality.knobs.shadows.enabled;
    sun.castShadow = shadows;
    // Bind the stable node before Three creates/caches this directional light's shader.
    // Without shadows this binding suppresses direct sun, leaving ambient sky fill.
    const stainedBinding = createStainedSunBinding(sun);
    const extent = AFTERNOON.shadowExtent;
    sun.shadow.mapSize.set(AFTERNOON.shadowMapSize, AFTERNOON.shadowMapSize);
    Object.assign(sun.shadow.camera, {
      left: -extent, right: extent, top: extent, bottom: -extent,
      near: AFTERNOON.shadowNear, far: AFTERNOON.shadowFar,
    });
    sun.shadow.bias = AFTERNOON.shadowBias;
    sun.shadow.normalBias = AFTERNOON.shadowNormalBias;
    sun.shadow.radius = AFTERNOON.shadowRadius;
    sun.shadow.camera.updateProjectionMatrix();
    let cache: CachedSunShadow | null = null;
    let once: SunRig['once'] = null;
    if (shadows) {
      sun.shadow.camera.layers.enable(1);
      once = shadowOncePerFrame(sun);
      cache = cachedSunShadow({ light: sun, settleFrames: 30 });
    }
    state.scene.environment = null;
    const bounce = createInteriorBounce();
    root.add(hemisphere, sun, sun.target, bounce.light);
    const rig: SunRig = { light: sun, cache, once };
    installed = rig;
    return { root, rig, dispose() {
      if (installed === rig) installed = null;
      root.removeFromParent();
      once?.restore();
      cache?.dispose();
      sun.shadow.dispose();
      stainedBinding.dispose();
      bounce.dispose();
      renderer.toneMappingExposure = previousExposure;
      root.clear();
    } };
  }, value => value.dispose(), [state.gl, state.scene, quality.knobs.shadows.enabled, quality.knobs.shadows.mapSize]);
  useSystem('cathedral-shadow', SystemOrder.shadows, () => {
    lights?.rig.once?.update();
    lights?.rig.cache?.update();
  });
  return lights ? <primitive object={lights.root} dispose={null} /> : null;
}
