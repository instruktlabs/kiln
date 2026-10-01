import { useThree } from '@react-three/fiber';
import { Group, HemisphereLight, DirectionalLight } from 'three/webgpu';
import { asWebGPU, buildRoomEnvironment, useBuilt, useQuality } from '@kiln-scenes/scene-kit';
import { FARM_LOOK } from '../constants';

/** INV 4.1; the shadow projection is updated after every bound is assigned. */
export function FarmLighting() {
  const state = useThree(), quality = useQuality();
  const lights = useBuilt(() => {
    const root = new Group(); root.name = 'Farm lighting';
    const hemisphere = new HemisphereLight(FARM_LOOK.hemisphereSky, FARM_LOOK.hemisphereGround, FARM_LOOK.hemisphereIntensity);
    const sun = new DirectionalLight(FARM_LOOK.sunColor, FARM_LOOK.sunIntensity);
    sun.position.fromArray(FARM_LOOK.sunPosition); sun.castShadow = quality.knobs.shadows.enabled;
    sun.shadow.mapSize.setScalar(quality.knobs.shadows.mapSize);
    Object.assign(sun.shadow.camera, {
      left: -FARM_LOOK.shadowExtent, right: FARM_LOOK.shadowExtent,
      top: FARM_LOOK.shadowExtent, bottom: -FARM_LOOK.shadowExtent,
      near: FARM_LOOK.shadowNear, far: FARM_LOOK.shadowFar,
    });
    sun.shadow.normalBias = FARM_LOOK.shadowNormalBias;
    sun.shadow.camera.updateProjectionMatrix();
    const environment = buildRoomEnvironment(asWebGPU(state.gl), { blur: FARM_LOOK.environmentBlur, intensity: FARM_LOOK.environmentIntensity });
    state.scene.environment = environment.texture; state.scene.environmentIntensity = FARM_LOOK.environmentIntensity;
    root.add(hemisphere, sun, sun.target);
    return { root, dispose() {
      root.removeFromParent(); sun.shadow.dispose();
      if (state.scene.environment === environment.texture) state.scene.environment = null;
      environment.dispose(); root.clear();
    } };
  }, value => value.dispose(), [state.gl, state.scene, quality.knobs.shadows]);
  return lights ? <primitive object={lights.root} dispose={null}/> : null;
}
