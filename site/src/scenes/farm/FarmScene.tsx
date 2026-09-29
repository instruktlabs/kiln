/**
 * The one import boundary to the scene package. The build resolves `@kiln-scenes/farm` to the
 * scenes workspace source, or to `./unavailable.tsx` where that source or its pack is absent
 * (scripts/scene-source.mjs). Nothing here is copied from the scene.
 */
export { FarmScene } from '@kiln-scenes/farm';
export type { FarmSceneProps } from '@kiln-scenes/farm';
