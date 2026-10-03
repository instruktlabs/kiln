import { expect, test } from 'bun:test';
import { installControlObserver } from './verify-scene-controls.mjs';

function fixture() {
  const devtools = new EventTarget();
  const root = { getAttribute: () => 'webgpu', querySelectorAll: () => [{}] };
  const actor = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1] } };
  const attributes = new Float32Array([1, 2, 3, 0, 99, 99, 99, 0]);
  const freight = { name: 'traffic-truck-tractor-lod0', visible: true, geometry: { instanceCount: 1, attributes: { iA: { array: attributes } } } };
  const state: any = { scene: null, camera: actor, gl: { domElement: { isConnected: true, closest: () => root } } };
  const scene = { isScene: true, __r3f: { root: { getState: () => state } }, getObjectByName: (name: string) => name === 'farmer-yard-0' ? actor : null, traverse: (visit: any) => visit(freight) };
  state.scene = scene;
  const scope: any = { EventTarget, __THREE_DEVTOOLS__: devtools, document: { visibilityState: 'visible' }, __timingEvidence: { gpu: () => ({ status: 'bound' }) } };
  return { scope, state, scene, actor, attributes, freight, observe: (detail: unknown) => devtools.dispatchEvent(new CustomEvent('observe', { detail })) };
}

test('serialized observer uses the mounted renderer root and copies only active named transforms/buffers without updates', () => {
  const f = fixture(), prior = f.scope.__THREE_DEVTOOLS__;
  const serialized = new Function(`return (${installControlObserver.toString()})`)();
  serialized(f.scope);
  f.observe({ isScene: true }); // Reflection/temporary scenes do not become a root.
  f.observe(f.scene);
  const result = f.scope.__siteControlSnapshot();
  expect(f.scope.__THREE_DEVTOOLS__).toBe(prior);
  expect(result.farmer).toEqual({ subject: 'farmer-yard-0', position: [2, 3, 4] });
  expect(result.freight).toEqual([{ name: 'traffic-truck-tractor-lod0', positions: [[1, 2, 3, 0]] }]);
  expect(result.gpu.status).toBe('bound');
  result.freight[0].positions[0][0] = 100;
  result.farmer.position[0] = 100;
  expect(f.attributes[0]).toBe(1);
  expect(f.actor.matrixWorld.elements[12]).toBe(2);
});

test('observer fails closed for absent, disconnected or ambiguous renderer roots', () => {
  const f = fixture(); installControlObserver(f.scope);
  expect(() => f.scope.__siteControlSnapshot()).toThrow(/observed 0/);
  f.observe(f.scene); f.state.gl.domElement.isConnected = false;
  expect(() => f.scope.__siteControlSnapshot()).toThrow(/observed 0/);
  f.state.gl.domElement.isConnected = true;
  const second = fixture(); f.observe(second.scene);
  expect(() => f.scope.__siteControlSnapshot()).toThrow(/observed 2/);
});

test('invisible freight and inactive capacity never count as visible movement evidence', () => {
  const f = fixture(); installControlObserver(f.scope); f.observe(f.scene);
  f.freight.visible = false;
  expect(f.scope.__siteControlSnapshot().freight).toEqual([]);
  f.freight.visible = true; f.freight.geometry.instanceCount = 0;
  expect(f.scope.__siteControlSnapshot().freight).toEqual([]);
});

test('camera projection and canvas size evidence is copied without changing the live camera', () => {
  const f = fixture();
  f.state.camera.fov = 50;
  f.state.gl.domElement.clientWidth = 390;
  f.state.gl.domElement.clientHeight = 791;
  installControlObserver(f.scope); f.observe(f.scene);
  const result = f.scope.__siteControlSnapshot();
  expect(result.camera.fov).toBe(50);
  expect(result.camera.forward).toEqual([-0, -0, -1]);
  expect(result.canvas).toEqual({ width: 390, height: 791 });
  result.camera.forward[2] = 7;
  expect(f.actor.matrixWorld.elements[10]).toBe(1);
});
