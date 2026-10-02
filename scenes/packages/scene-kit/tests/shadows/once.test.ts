import { expect, test } from 'bun:test';
import { DirectionalLight, PerspectiveCamera } from 'three/webgpu';
import { shadow } from 'three/tsl';
import { shadowOncePerFrame } from '../../src/shadows/once';

/**
 * three r186's own ShadowNode.updateBefore gating with the GPU work stubbed out: updateShadow counts renders and bumps the
 * depth version on the first one, as the first updateRenderTarget does, so the first update spans two frames.
 */
function counted(light: DirectionalLight) {
  const node = shadow(light) as any;let first = true;const renders: string[] = [];
  node.shadowMap = { depthTexture: { version: 0 } };
  node.updateShadow = (frame: any) => { node._depthVersionCached = node.shadowMap.depthTexture.version; if (first) { node.shadowMap.depthTexture.version++; first = false; } renders.push(`${frame.frameId}:${frame.camera.name}`); };
  return { renders, draw: (frameId: number, camera: PerspectiveCamera, precompiling = false) => node.updateBefore({ renderer: { _isPreCompiling: precompiling }, camera, frameId }) };
}
const main = Object.assign(new PerspectiveCamera(), { name: 'main' }), mirror = Object.assign(new PerspectiveCamera(), { name: 'mirror' });

test('without the helper a second camera re-renders the map every frame (the Golden Gate reflector duplicate)', () => {
  const light = new DirectionalLight(), { renders, draw } = counted(light);
  for (let f = 0; f < 3; f++) { draw(f, main); draw(f, main); draw(f, mirror); }
  expect(renders).toEqual(['0:main', '0:mirror', '1:main', '1:mirror', '2:main', '2:mirror']);
});

test('once per frame: armed at install, re-armed by update, reused by the second camera', () => {
  const light = new DirectionalLight(), { renders, draw } = counted(light), once = shadowOncePerFrame(light);
  expect([light.shadow.autoUpdate, light.shadow.needsUpdate]).toEqual([false, true]);
  draw(0, main, true); expect(renders).toEqual([]);              // compileAsync never renders shadows
  for (let f = 0; f < 4; f++) { once.update(); draw(f, main); draw(f, mirror); }
  // Frame 0 is the first render, whose depth-texture recreation keeps needsUpdate for the mirror; then one render a frame.
  expect(renders).toEqual(['0:main', '0:mirror', '1:main', '2:main', '3:main']);
  draw(4, main); expect(renders.length).toBe(5);                  // no update(): nothing armed, nothing rendered
  once.restore(); once.restore();
  expect([light.shadow.autoUpdate, light.shadow.needsUpdate]).toEqual([true, true]);
  light.shadow.needsUpdate = false; once.update(); expect(light.shadow.needsUpdate).toBe(false);
  draw(5, main); draw(5, mirror); expect(renders.slice(5)).toEqual(['5:main', '5:mirror']);
});

test('restore keeps an author-frozen shadow frozen', () => {
  const light = new DirectionalLight(); light.shadow.autoUpdate = false;
  const once = shadowOncePerFrame(light); once.restore();
  expect(light.shadow.autoUpdate).toBe(false);
});
