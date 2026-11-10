/** Separately bundled; the site shell imports this only after Explore. */
import { mountCathedralSquare } from '@kiln-scenes/cathedral-square';
import { REVISION } from 'three';
import type { SceneMountProps } from '../types';

export { REVISION };

export function mount(element: HTMLElement, props: SceneMountProps): () => void {
  const handle = mountCathedralSquare(element, props);
  return () => handle.unmount();
}
