import { mountScene } from '@kiln-scenes/scene-kit';
import { SeedTownScene } from './SeedTownScene';
import type { SeedTownSceneProps } from './SeedTownScene';

export { SeedTownScene };
export type { SeedTownSceneProps };
export type { TownState } from './session';
export function mountSeedTown(element: HTMLElement, props: SeedTownSceneProps) {
  return mountScene(element, SeedTownScene, props);
}
