import { expect, test } from 'bun:test';
import { DirectionalLight, PerspectiveCamera } from 'three/webgpu';
import { shadow } from 'three/tsl';
import { shadowOncePerFrame } from '../../src/shadows/once';

/**
 * three r187's own ShadowNode.updateBefore gating with the GPU work stubbed out: updateShadow counts renders. Every render
 * clears the flag (r186 kept it after a first render that recreated the depth texture; r187 arms the map in setupShadow).
 */
function counted(light: DirectionalLight) {
  const node = shadow(light) as any;const renders: string[] = [];
  node.shadowMap = { dispose() {} };
  node.updateShadow = (frame: any) => { renders.push(`${frame.frameId}:${frame.camera.name}`); };
  return { renders, draw: (frameId: number, camera: PerspectiveCamera, precompiling = false) => node.updateBefore({ renderer: { _precompilationState: precompiling ? {} : null }, camera, frameId }) };
}
const main = Object.assign(new PerspectiveCamera(), { name: 'main' }), mirror = Object.assign(new PerspectiveCamera(), { name: 'mirror' });
/** A sun whose shadow camera keeps its own layers (a bit above 0), as Golden Gate's enables LAYERS.dynamic. */
const layered = () => { const light = new DirectionalLight(); light.shadow.camera.layers.enable(2); return light; };

test('without the helper a second camera re-renders the map every frame (the Golden Gate reflector duplicate)', () => {
  const light = new DirectionalLight(), { renders, draw } = counted(light);
  for (let f = 0; f < 3; f++) { draw(f, main); draw(f, main); draw(f, mirror); }
  expect(renders).toEqual(['0:main', '0:mirror', '1:main', '1:mirror', '2:main', '2:mirror']);
});

test('once per frame: armed at install, re-armed by update, reused by the second camera', () => {
  const light = layered(), { renders, draw } = counted(light), once = shadowOncePerFrame(light);
  expect([light.shadow.autoUpdate, light.shadow.needsUpdate]).toEqual([false, true]);
  draw(0, main, true); expect(renders).toEqual([]);              // compileAsync never renders shadows
  for (let f = 0; f < 4; f++) { once.update(); draw(f, main); draw(f, mirror); }
  // One render a frame from the first: r187 clears the flag on every render (r186 kept it after the first render, which
  // recreated the depth texture, so the mirror drew frame 0 again).
  expect(renders).toEqual(['0:main', '1:main', '2:main', '3:main']);
  draw(4, main); expect(renders.length).toBe(4);                  // no update(): nothing armed, nothing rendered
  once.restore(); once.restore();
  expect([light.shadow.autoUpdate, light.shadow.needsUpdate]).toEqual([true, true]);
  light.shadow.needsUpdate = false; once.update(); expect(light.shadow.needsUpdate).toBe(false);
  draw(5, main); draw(5, mirror); expect(renders.slice(4)).toEqual(['5:main', '5:mirror']);
});

test('restore keeps an author-frozen shadow frozen', () => {
  const light = layered(); light.shadow.autoUpdate = false;
  const once = shadowOncePerFrame(light); once.restore();
  expect(light.shadow.autoUpdate).toBe(false);
});

test('RK-2 refuses a shadow camera mask three swaps for each viewing camera mask, where cameras with other layers need their own map', () => {
  // ShadowNode.updateShadow: a mask with no bit at layer 1 or above becomes the rendering camera's mask, so one shared map
  // would carry the first camera's casters into the second camera's view.
  for (const mask of [1, 0]) {
    const light = new DirectionalLight(); light.shadow.camera.layers.mask = mask;
    expect(() => shadowOncePerFrame(light)).toThrow('layer above 0');
    expect([light.shadow.autoUpdate, light.shadow.needsUpdate]).toEqual([true, false]);
  }
  expect(() => shadowOncePerFrame(layered()).restore()).not.toThrow();
});
