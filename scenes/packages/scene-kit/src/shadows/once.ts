import type { Light, LightShadow } from 'three/webgpu';
import { keepsShadowMask } from './layers';
/**
 * Renders a light's shadow map at most once per frame. three r186 re-renders an auto-updating map for every camera that
 * draws a receiver in a frame (ShadowNode.updateBefore dedupes per camera and frame only), so Golden Gate's planar
 * reflector drew the sun map twice. Call `update()` every frame before rendering (SystemOrder.shadows): the first camera
 * renders and three clears the flag, later cameras reuse the map. Armed at install for the first-frame bind. The shadow
 * camera must keep its own layers (a bit above layer 0, checked at install): with none, three draws the map with each
 * viewing camera's mask, so cameras that see different layers need their own map and one shared map is not look-neutral.
 */
export function shadowOncePerFrame(light: Light & { shadow: LightShadow }): { update(): void; restore(): void } {
  const s = light.shadow, auto = s.autoUpdate;let restored = false;
  if (!keepsShadowMask(s.camera.layers.mask)) throw new Error('Shadow once per frame needs a shadow camera layer above 0: three r186 otherwise renders the map with each camera\'s own mask');
  s.autoUpdate = false; s.needsUpdate = true;
  return { update() { if (!restored) s.needsUpdate = true; }, restore() { if (restored) return; restored = true; s.autoUpdate = auto; s.needsUpdate = true; } };
}
