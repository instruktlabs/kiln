import type { Object3D } from 'three/webgpu';
/** Kit-reserved layer bits for the cached sun shadow; scenes keep 0..29 (Golden Gate uses 0-2). */
export const ShadowLayers = { static: 30, live: 31 } as const;
export interface ShadowLayerSet { static: number; live: number }
/** three r186 swaps a shadow camera mask with no bit at layer 1 or above for the viewing camera's (ShadowNode.updateShadow). */
export const keepsShadowMask = (mask: number): boolean => (mask & 0xFFFFFFFE) !== 0;
export const layerBit = (layer: number): number => 1 << layer | 0;
/** Casters a kit feature switched off (small-caster threshold, stand-in sources): they keep shadow layer bits so a restore casts again. */
export const suppressedCasters = /*@__PURE__*/ new WeakSet<Object3D>();
