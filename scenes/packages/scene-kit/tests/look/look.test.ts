import { describe, expect, test } from 'bun:test';
import { createPresetBlender } from '../../src/look/core';

describe('U-23 preset blender', () => {
  const presets = { day: { exposure: 1, color: [0, 1, 0] }, night: { exposure: 3, color: [1, 0, 1] } };
  test('numbers and linear arrays use default two-second smoothstep, in stable storage', () => {
    const b = createPresetBlender(presets, 'day'), current = b.current, color = b.current.color;
    b.set('night'); b.update(.5);
    expect(b.current.exposure).toBe(1.3125); expect(b.current.color).toEqual([.15625, .84375, .15625]);
    b.update(1.5); expect(b.current).toEqual(presets.night); expect(b.current).toBe(current); expect(b.current.color).toBe(color); expect(b.blending).toBe(false);
  });
  test('retarget captures current value and notifies once, unsubscribe works', () => {
    const b = createPresetBlender(presets, 'day'), events: unknown[] = [];
    const off = b.onChange((...args) => events.push(args)); b.set('night'); b.update(1); b.set('day');
    expect(b.current.exposure).toBe(2); b.update(1); expect(b.current.exposure).toBe(1.5);
    b.set('night', { immediate: true }); expect(b.current.exposure).toBe(3); expect(events).toEqual([['night', false], ['day', false], ['night', true]]);
    off(); b.set('day'); expect(events.length).toBe(3);
  });
  test('rejects mismatched shapes and handles unknown names per build policy', () => {
    expect(() => createPresetBlender({ a: { a: [1] }, b: { a: [1, 2] } }, 'a')).toThrow();
    expect(() => createPresetBlender({ a: { a: 1 }, b: { b: 1 } }, 'a')).toThrow();
    const publicBlender = createPresetBlender(presets, 'day', { dev: false }); publicBlender.set('missing'); expect(publicBlender.target).toBe('day');
    const devBlender = createPresetBlender(presets, 'day', { dev: true }); expect(() => devBlender.set('missing')).toThrow();
  });
  test('reduced motion snaps an in-flight blend', () => {
    let reduced = false; const b = createPresetBlender(presets, 'day', { reduced: () => reduced });
    b.set('night'); b.update(.1); reduced = true; b.update(0); expect(b.current.exposure).toBe(3);
    b.set('day'); expect(b.current.exposure).toBe(1);
  });
});
