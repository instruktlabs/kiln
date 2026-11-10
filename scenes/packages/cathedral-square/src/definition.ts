import { ACESFilmicToneMapping } from 'three/webgpu';
import type { SceneDefinition } from '@kiln-scenes/scene-kit';
import { AFTERNOON } from './light';
import { EYE_HEIGHT, ORBIT_VIEW } from './layout';
import { cathedralTiers } from './tiers';

export const cathedralDefinition: SceneDefinition = {
  id: 'cathedral-square',
  label: 'Cathedral square',
  description: `Orbit the west front, then walk the square. The camera is at ${EYE_HEIGHT} metres. Drag orbits and the wheel zooms. Enter, or Walk the square, starts on the parvis. Click the view to look, W A S D walks, Shift runs, and Escape returns to the orbit.`,
  camera: {
    position: ORBIT_VIEW.position, fov: ORBIT_VIEW.fov, near: 0.15, far: 2600,
  },
  tiers: cathedralTiers,
  look: {
    toneMapping: ACESFilmicToneMapping, exposure: AFTERNOON.exposure, background: AFTERNOON.sky,
    fog: { color: AFTERNOON.sky, near: AFTERNOON.fogNear, far: AFTERNOON.fogFar },
  },
};
