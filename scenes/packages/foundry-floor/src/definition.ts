// SPDX-License-Identifier: MIT
import { NeutralToneMapping } from 'three/webgpu';
import { defineTiers } from '@kiln-scenes/scene-kit';
import type { SceneDefinition, TierKnobs } from '@kiln-scenes/scene-kit';
import { LANDING_CAMERA } from './landing-camera';

function tier(pixelRatioCap: number): TierKnobs {
  return {
    pixelRatioCap, pixelRatioMin: Math.min(1, pixelRatioCap),
    shadows: { enabled: false, type: 'basic', mapSize: 1024, maxCasters: 0 },
    vegetationDensity: 0, instanceDensity: 1,
    drawDistance: { far: 400, fogNear: 300, fogFar: 400, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 },
    effects: { water: 'off', wind: false, ambientAnimation: true },
  };
}

const landing = LANDING_CAMERA;

/** FF2: the running twin drawn from the accepted GLBs (data/assets.json). No shadows or post effects; a room environment
 *  gives the metal and glass parts something to reflect. */
export const foundryFloorDefinition: SceneDefinition = {
  id: 'foundry-floor',
  label: 'Foundry Floor',
  description: 'A generic 2 nm-class chip fab running as a live, seeded simulation. Lots in FOUPs ride overhead hoist vehicles between 42 tools. Choose a time scale, switch between the pilot line and the megafab slice, or orbit the overview. About this model explains what is simulated and what is estimated.',
  camera: { position: landing.position, fov: landing.fov, near: 0.05, far: 400 },
  tiers: defineTiers({ order: ['minimal', 'economy', 'balanced', 'high'], minimal: tier(0.75), economy: tier(1), balanced: tier(1.25), high: tier(1.5) }),
  look: { toneMapping: NeutralToneMapping, exposure: 1, background: '#d9dee2', environment: { kind: 'room', blur: 0.04, intensity: 0.6 } },
};
