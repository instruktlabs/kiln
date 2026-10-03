import generated from './layout-bootstrap.json';
import type { LayoutBootstrap } from './layout-contract';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Generated, immutable startup contract; runtime layout must match it before a world is built. */
export const BOOTSTRAP = freeze(generated.projection as unknown as LayoutBootstrap);
