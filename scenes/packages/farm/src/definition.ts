import { ACESFilmicToneMapping } from 'three/webgpu';
import type { SceneDefinition } from '@kiln-scenes/scene-kit';
import { FARM_CAMERA, FARM_LOOK } from './constants';
import { farmTiers } from './tiers';

export const farmDefinition: SceneDefinition = {
  id: 'farm', label: 'Shapes & Seasons Farm',
  description: 'Explore the farm with the camera controls. Choose Walk the farm or press Enter to walk in third person. Use W A S D or the arrows to move, Shift to run and E to interact. Drag to look around and scroll to zoom. Escape returns to overview; a second Escape leaves the scene. Tab moves through and out of the controls.',
  camera: { position: [54, 45, 62], fov: 45, near: FARM_CAMERA.near, far: FARM_CAMERA.far },
  tiers: farmTiers,
  look: { toneMapping: ACESFilmicToneMapping, exposure: FARM_LOOK.exposure, background: FARM_LOOK.background,
    fog: { color: FARM_LOOK.background, near: FARM_LOOK.fogNear, far: FARM_LOOK.fogFar } },
};
