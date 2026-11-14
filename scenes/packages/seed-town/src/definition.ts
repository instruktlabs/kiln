import { ACESFilmicToneMapping } from 'three/webgpu';
import type { SceneDefinition } from '@kiln-scenes/scene-kit';
import { DAY } from './light';
import { EYE_HEIGHT } from './layout';
import { townTiers } from './tiers';

const hex = (rgb: readonly [number, number, number]) => `#${rgb.map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`;

export const townDefinition: SceneDefinition = {
  id: 'seed-town',
  label: 'Seed town',
  description: `A small town built from nine kit models, with the roads and trees round it. Type a seed to build a different town. Drag orbits and the wheel zooms. Enter, or Walk the town, starts on the road south of the town with the camera at ${EYE_HEIGHT} metres. Click the view to look, W A S D walks, Shift runs, and Escape returns to the orbit.`,
  camera: { position: [-70, 64, -80], fov: 46, near: 0.15, far: 900 },
  tiers: townTiers,
  look: {
    toneMapping: ACESFilmicToneMapping, exposure: DAY.exposure, background: hex(DAY.horizon),
    fog: { color: hex(DAY.horizon), near: DAY.fogNear, far: DAY.fogFar },
  },
};
