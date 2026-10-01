import { mountScene } from '@kiln-scenes/scene-kit';
import type { SceneHandle } from '@kiln-scenes/scene-kit';
import { GoldenGateScene } from './GoldenGateScene';
import type { GoldenGateSceneProps } from './GoldenGateScene';
export { GoldenGateScene };
export type { GoldenGateSceneProps };
export type { SceneProps } from '@kiln-scenes/scene-kit';
export { goldenGateDefinition } from './definition';
export { goldenGateTiers, FEATURES } from './tiers';
export { GG_DEV_PARAMS } from './params';
export { PRESETS, PRESET_ORDER, PRESET_LABELS } from './presets';
/** Mounts the scene into a container; `unmount()` releases every GPU and DOM resource. */
export function mountGoldenGateScene(element: HTMLElement, props: GoldenGateSceneProps): SceneHandle { return mountScene(element, GoldenGateScene, props); }
