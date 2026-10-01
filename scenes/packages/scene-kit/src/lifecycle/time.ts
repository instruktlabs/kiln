import { uniform, renderGroup } from 'three/tsl';
import type { SceneClock } from './core';
export function createTimeNode(clock: SceneClock, kind: 'time' | 'ambient' = 'time', wrapSeconds = 1e9) {
  return uniform(0).setGroup(renderGroup).onRenderUpdate(() => clock[kind] % wrapSeconds);
}
