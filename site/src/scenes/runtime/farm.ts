/**
 * The Farm scene runtime. scripts/scene-runtime.mjs builds this file on its own, with bare `three`
 * resolved to the scene kit's facade and one copy of three, React and the fiber, and stages the
 * result under public/scene-runtime/farm/. The site's pages never import it: the shell loads the
 * staged file when a visitor chooses Explore.
 */
import { mountFarmScene } from '@kiln-scenes/farm';
import { REVISION } from 'three';
import type { SceneMountProps } from '../types';

export { REVISION };

export function mount(element: HTMLElement, props: SceneMountProps): () => void {
  const handle = mountFarmScene(element, props);
  return () => handle.unmount();
}
