import { mountScene } from '@kiln-scenes/scene-kit';
import { FarmScene } from './FarmScene';
import type { FarmSceneProps } from './FarmScene';
export { FarmScene };
export type { FarmSceneProps };
export function mountFarmScene(element: HTMLElement, props: FarmSceneProps) { return mountScene(element, FarmScene, props); }
