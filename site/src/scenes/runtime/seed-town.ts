/** Separately bundled; the site shell imports this only after Explore. The town lives in the page address. */
import { mountSeedTown } from '@kiln-scenes/seed-town';
import { REVISION } from 'three';
import { readTownAddress, townSearch } from '../seed-town-address';
import type { SceneMountProps } from '../types';

export { REVISION };

export function mount(element: HTMLElement, props: SceneMountProps): () => void {
  const { seed, dusk } = readTownAddress(location.search);
  const handle = mountSeedTown(element, {
    ...props,
    seed,
    dusk,
    onTown(town) {
      history.replaceState(
        history.state,
        '',
        `${location.pathname}${townSearch(location.search, town)}${location.hash}`,
      );
    },
  });
  return () => handle.unmount();
}
