import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Group, HemisphereLight } from 'three/webgpu';
import type { Scene, Texture } from 'three/webgpu';
import { asWebGPU, buildRoomEnvironment, useBuilt, useQuality } from '@kiln-scenes/scene-kit';
import type { TierKnobs } from '@kiln-scenes/scene-kit';
import { cachedSunShadow } from '@kiln-scenes/scene-kit/shadows';
import type { CachedSunShadow } from '@kiln-scenes/scene-kit/shadows';
import { FARM_LOOK } from '../constants';
import { readFarmDevParams } from '../dev-params';
import { useFarmSession } from '../state';
import { createFarmSun, farmShadowMask, farmShadowOptions } from './shadows';
import type { FarmShadowOptions } from './shadows';

/**
 * INV 4.1 lights. On tiers with shadows the OD-9 cached sun shadow is installed here, before any receiver builds (three r186
 * reads a light's custom shadow node once), and published on the session; it is disposed after the lights leave the scene.
 * With stand-ins the sun's own camera also sees their layer (a mask with a bit above 0 keeps its own layers).
 */
export function buildFarmLighting(scene: Scene, shadows: TierKnobs['shadows'], environment: () => { texture: Texture; dispose(): void }, o: FarmShadowOptions, session: { shadow: CachedSunShadow | null }) {
  const root = new Group(); root.name = 'Farm lighting';
  const hemisphere = new HemisphereLight(FARM_LOOK.hemisphereSky, FARM_LOOK.hemisphereGround, FARM_LOOK.hemisphereIntensity);
  const sun = createFarmSun(shadows.mapSize); sun.castShadow = shadows.enabled;
  sun.shadow.camera.layers.mask = farmShadowMask(shadows.enabled && o.standIns);
  const shadow = shadows.enabled && o.cache ? cachedSunShadow({ light: sun, settleFrames: o.settleFrames, ...(o.liveMapSize ? { liveMapSize: Math.min(o.liveMapSize, shadows.mapSize) } : {}) }) : null;
  session.shadow = shadow;
  const env = environment();
  scene.environment = env.texture; scene.environmentIntensity = FARM_LOOK.environmentIntensity;
  root.add(hemisphere, sun, sun.target);
  return { root, sun, shadow, dispose() {
    root.removeFromParent(); if (session.shadow === shadow) session.shadow = null; shadow?.dispose(); sun.shadow.dispose();
    if (scene.environment === env.texture) scene.environment = null;
    env.dispose(); root.clear();
  } };
}
export function FarmLighting() {
  const state = useThree(), quality = useQuality(), session = useFarmSession(), options = useMemo(() => farmShadowOptions(readFarmDevParams()), []);
  const lights = useBuilt(() => buildFarmLighting(state.scene, quality.knobs.shadows, () => buildRoomEnvironment(asWebGPU(state.gl), { blur: FARM_LOOK.environmentBlur, intensity: FARM_LOOK.environmentIntensity }), options, session),
    value => value.dispose(), [state.gl, state.scene, quality.knobs.shadows]);
  return lights ? <primitive object={lights.root} dispose={null}/> : null;
}
