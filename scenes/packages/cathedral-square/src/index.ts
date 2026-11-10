import { mountScene } from '@kiln-scenes/scene-kit';
import { CathedralScene } from './CathedralScene';
import type { CathedralSceneProps } from './CathedralScene';

export { CathedralScene };
export type { CathedralSceneProps };
export function mountCathedralSquare(element: HTMLElement, props: CathedralSceneProps) {
  return mountScene(element, CathedralScene, props);
}
