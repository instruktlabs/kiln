// SPDX-License-Identifier: MIT
import { mountScene } from '@kiln-scenes/scene-kit';
import type { SceneHandle } from '@kiln-scenes/scene-kit';
import { FoundryFloorScene } from './FoundryFloorScene';
import type { FoundryFloorSceneProps } from './FoundryFloorScene';
export { FoundryFloorScene };
export type { FoundryFloorSceneProps };
export type { SceneProps } from '@kiln-scenes/scene-kit';
export { foundryFloorDefinition } from './definition';
export { WARM_START_ID } from './scene/World';
/** Mounts the scene into a container; `unmount()` releases every GPU and DOM resource. */
export function mountFoundryFloorScene(element: HTMLElement, props: FoundryFloorSceneProps): SceneHandle { return mountScene(element, FoundryFloorScene, props); }
