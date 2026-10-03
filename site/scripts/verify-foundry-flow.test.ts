import { expect, test } from 'bun:test';
import { assertRenderedBackend, flowBackendPlan } from './verify-foundry-flow.mjs';

test('release Foundry flow requires WebGPU and WebGL2 as distinct actual backends', () => {
  expect(flowBackendPlan()).toEqual({
    qualification: 'webgpu-and-webgl2',
    backends: ['webgpu', 'webgl2'],
  });
  expect(() => assertRenderedBackend('webgpu', 'webgl2')).toThrow(/webgpu/i);
  expect(() => assertRenderedBackend('webgl2', 'webgpu')).toThrow(/webgl2/i);
  expect(() => assertRenderedBackend('webgpu', 'webgpu')).not.toThrow();
  expect(() => assertRenderedBackend('webgl2', 'webgl2')).not.toThrow();
});

test('an explicit auto smoke plan reports one observed backend without claiming release qualification', () => {
  expect(flowBackendPlan(true)).toEqual({ qualification: 'auto-smoke', backends: ['auto'] });
  expect(() => assertRenderedBackend('auto', 'webgl2')).not.toThrow();
  expect(() => assertRenderedBackend('auto', 'webgpu')).not.toThrow();
  for (const actual of [null, undefined, 'unknown']) {
    expect(() => assertRenderedBackend('auto', actual)).toThrow(/backend/i);
  }
});

test('unknown requested backends cannot silently become smoke qualification', () => {
  expect(() => assertRenderedBackend('unknown', 'webgl2')).toThrow(/requested backend/i);
});
