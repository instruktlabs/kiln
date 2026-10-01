import { AgXToneMapping } from 'three/webgpu';
import { SceneRoot } from '../src/contract';
import type { SceneDefinition, SceneProps } from '../src/contract';
import { defineTiers } from '../src/quality';
import type { TierKnobs } from '../src/quality';
import { DevPanel } from '../src/ui';
import { DemoWorld } from './World';
import { RigDemo, RigDemoHud } from './RigDemo';
import { DemoHud } from './DemoHud';

function tier(pixelRatioCap: number, density: number, shadows: boolean): TierKnobs {
  return { pixelRatioCap, pixelRatioMin: Math.min(1, pixelRatioCap), shadows: { enabled: shadows, type: 'pcf', mapSize: 1024, maxCasters: 1 }, vegetationDensity: density, instanceDensity: density, drawDistance: { far: 500, fogNear: 200, fogFar: 460, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 }, effects: { water: 'off', wind: false, ambientAnimation: true } };
}
export const demoDefinition: SceneDefinition = {
  id: 'kit-demo', label: 'Interactive scene-kit demonstration',
  description: 'Explore a field of ten thousand objects. Choose Walk to move with WASD or the joystick, Drive for a chase camera, or Flyover for a camera path. Escape leaves walking or driving; press Escape again to leave the page scene. Tab moves through the controls.',
  camera: { position: [15, 15, 25], fov: 40, near: .02, far: 500 },
  tiers: defineTiers({ order: ['minimal', 'economy', 'balanced', 'high'], minimal: tier(.6, .25, false), economy: tier(.75, .5, true), balanced: tier(1, .75, true), high: tier(1.5, 1, true) }),
  look: { toneMapping: AgXToneMapping, exposure: 1, background: 0xa8c5d5, fog: { color: 0xa8c5d5, near: 200, far: 460 } },
  hud: <><RigDemoHud/><DemoHud/></>,
  devPanel: import.meta.env.KILN_DEV ? <DevPanel/> : undefined,
};
export function DemoScene(props: SceneProps) { return <SceneRoot options={props} definition={demoDefinition}><DemoWorld/><RigDemo/></SceneRoot>; }
