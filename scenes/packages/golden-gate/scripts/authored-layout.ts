// Offline authoring/test fixture. Browser runtime consumes the verified pack through src/layout.ts.
import authored from '../data/layout.json';
import type { SceneLayout } from '../src/data';
export const LAYOUT = authored as unknown as SceneLayout;
