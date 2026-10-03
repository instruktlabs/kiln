import { NeutralToneMapping } from 'three/webgpu';
import type { SceneDefinition } from '@kiln-scenes/scene-kit';
import { CAMERA, NAMED_CAMERAS } from './constants';
import { BOOTSTRAP as LAYOUT } from './layout-bootstrap';
import { goldenGateTiers } from './tiers';

/**
 * Khronos PBR Neutral tone mapping keeps International Orange's hue (AgX is the documented fallback
 * only). Exposure is fixed per preset and set by the atmosphere; the look's exposure is Day's.
 * No kit fog: the scene fog is a height-fog node owned by `world/fog.ts`. The background colour is
 * only a fallback behind the sky dome.
 */
export const goldenGateDefinition: SceneDefinition = {
  id: 'golden-gate', label: 'Golden Gate Bridge',
  description: 'Orbit the Golden Gate Bridge with the camera controls, choose Day, Golden hour or Fog, and take a guided flyover. Choose Drive the sedan, or press Enter or E, to drive across the bridge: W A S D or the arrows steer and accelerate, Space brakes, Shift boosts, X is the handbrake and R turns around at the end of the deck. E or Escape leaves the car; a second Escape leaves the scene. Tab moves through and out of the controls.',
  camera: { position: NAMED_CAMERAS[LAYOUT.cameras.default]!.position, fov: NAMED_CAMERAS[LAYOUT.cameras.default]!.fov, near: CAMERA.near, far: CAMERA.far },
  tiers: goldenGateTiers,
  reversedDepthBuffer: true,
  look: { toneMapping: NeutralToneMapping, exposure: 1, background: '#9fb0bf' },
};
