import { describe, expect, test } from 'bun:test';
import { Clock, WebGLRenderer } from '../three-runtime';
import { requestWindowsDevice } from '../windows-device';

describe('M0 pinned-runtime compatibility', () => {
  test('Timer-backed Clock preserves R3F start, stop, restart and manual fields', () => {
    let now = 1000;
    let previous = now;
    let delta = 0;
    const timer = {
      reset() { previous = now; return this; },
      update() { delta = (now - previous) / 1000; previous = now; return this; },
      getDelta() { return delta; },
    };
    const clock = new Clock(true, { timer, now: () => now });
    expect(clock.running).toBe(false);
    expect(clock.getDelta()).toBe(0);
    expect(clock.running).toBe(true);
    expect(clock.startTime).toBe(1000);
    now += 20;
    expect(clock.getDelta()).toBeCloseTo(.02, 10);
    now += 30;
    expect(clock.getElapsedTime()).toBeCloseTo(.05, 10);
    clock.stop();
    expect(clock.running).toBe(false);
    expect(clock.autoStart).toBe(false);
    now += 500;
    expect(clock.getDelta()).toBe(0);
    clock.start();
    expect(clock.elapsedTime).toBe(0);
    expect(clock.oldTime).toBe(now);
    now += 10;
    expect(clock.getDelta()).toBeCloseTo(.01, 10);
    clock.elapsedTime = 12;
    clock.oldTime = 11;
    expect(clock.elapsedTime).toBe(12);
    expect(clock.oldTime).toBe(11);
  });

  test('Clock autoStart false remains stopped until explicit start', () => {
    const timer = { reset() { return this; }, update() { return this; }, getDelta() { return .1; } };
    const clock = new Clock(false, { timer, now: () => 0 });
    expect(clock.getElapsedTime()).toBe(0);
    clock.start();
    expect(clock.getDelta()).toBe(.1);
  });

  test('the unavailable classic renderer fails clearly if R3F skips the async factory', () => {
    expect(() => new WebGLRenderer()).toThrow('async WebGPURenderer factory');
  });

  test('Windows device creation matches supported three features without an ignored adapter hint', async () => {
    const calls: unknown[] = [];
    const device = { destroy() {} };
    const gpu = { async requestAdapter(options: unknown) {
      calls.push(options);
      return { features: new Set(['shader-f16', 'timestamp-query', 'not-a-three-feature']), async requestDevice(descriptor: unknown) { calls.push(descriptor); return device; } };
    } };
    const result = await requestWindowsDevice({ platform: 'Win32', forceWebGL: false, gpu });
    expect(result).toBe(device);
    expect(calls[0]).toEqual({ featureLevel: 'compatibility', xrCompatible: false });
    expect((calls[0] as Record<string, unknown>).powerPreference).toBeUndefined();
    expect(calls[1]).toEqual({ requiredFeatures: ['timestamp-query', 'shader-f16'], requiredLimits: {} });
  });

  test('other platforms, forced fallback and absent GPU do not pre-request a device', async () => {
    const gpu = { async requestAdapter() { throw new Error('must not be called'); } };
    expect(await requestWindowsDevice({ platform: 'Linux', forceWebGL: false, gpu })).toBeUndefined();
    expect(await requestWindowsDevice({ platform: 'Win32', forceWebGL: true, gpu })).toBeUndefined();
    expect(await requestWindowsDevice({ platform: 'Win32', forceWebGL: false })).toBeUndefined();
  });

  test('null adapter and request failure leave native three fallback in charge', async () => {
    expect(await requestWindowsDevice({ platform: 'Win32', forceWebGL: false, gpu: { async requestAdapter() { return null; } } })).toBeUndefined();
    expect(await requestWindowsDevice({ platform: 'Win32', forceWebGL: false, gpu: { async requestAdapter() { throw new Error('denied'); } } })).toBeUndefined();
  });
});
