import { describe, expect, test } from 'bun:test';
import {
  carriedParams,
  controlStep,
  manifestParams,
  needsRebuild,
  paramDefaults,
  presetValues,
  sliderValue,
  valueText,
  variantFileName,
  variantInput,
} from './params-state';

const declaration = {
  schemaVersion: 1 as const,
  params: {
    length: { type: 'range' as const, default: 1.6, min: 1, max: 2.4, step: 0.05, unit: 'm' },
    depth: { type: 'range' as const, default: 0.5, min: 0.3, max: 0.67 },
    slats: { type: 'int' as const, default: 5, min: 3, max: 8 },
    bay: { type: 'range' as const, default: 2, min: 2, max: 6, step: 2, snap: true },
    arms: { type: 'toggle' as const, default: true },
    wood: { type: 'color' as const, default: '#8a5a33' },
    style: { type: 'choice' as const, default: 'plain', options: ['plain', 'scroll'] },
    seed: { type: 'seed' as const, default: 7 },
  },
  presets: { long: { length: 2.4, slats: 8 } },
};

describe('manifestParams', () => {
  test('reads the declaration a saved manifest records', () => {
    expect(manifestParams({ build: { params: declaration } })).toEqual(declaration);
  });
  test('is undefined for a manifest without one or with one it cannot trust', () => {
    expect(manifestParams({})).toBeUndefined();
    expect(manifestParams({ build: {} })).toBeUndefined();
    expect(manifestParams({ build: { params: { schemaVersion: 2, params: {} } } })).toBeUndefined();
    expect(
      manifestParams({
        build: {
          params: {
            schemaVersion: 1,
            params: { width: { type: 'range', default: 9, min: 0, max: 1 } },
          },
        },
      }),
    ).toBeUndefined();
    expect(manifestParams({ build: { params: 'width' } })).toBeUndefined();
  });
});

describe('values', () => {
  test('defaults, and a preset laid over them', () => {
    expect(paramDefaults(declaration)).toEqual({
      length: 1.6,
      depth: 0.5,
      slats: 5,
      bay: 2,
      arms: true,
      wood: '#8a5a33',
      style: 'plain',
      seed: 7,
    });
    expect(presetValues(declaration, 'long')).toMatchObject({ length: 2.4, slats: 8, depth: 0.5 });
  });

  test('a request names only what differs from the defaults', () => {
    const defaults = paramDefaults(declaration);
    expect(variantInput(declaration, defaults)).toBeUndefined();
    expect(variantInput(declaration, { ...defaults, slats: 7, arms: false })).toEqual({
      values: { slats: 7, arms: false },
    });
  });
});

describe('controls', () => {
  test('a slider steps by the declared step when the range is a whole number of them', () => {
    expect(controlStep(declaration.params.length)).toBe(0.05);
    expect(controlStep(declaration.params.bay)).toBe(2);
    expect(controlStep(declaration.params.slats)).toBe(1);
  });
  test('otherwise it steps finely enough to reach both ends', () => {
    // 0.37 wide: a hundredth of the span, rounded down to a power of ten.
    expect(controlStep(declaration.params.depth)).toBe(0.001);
    expect(controlStep({ type: 'range', default: 1, min: 0, max: 10, step: 3 })).toBe(0.1);
    // A snapped step is the contract, even when the top of the range is off it.
    expect(controlStep({ type: 'range', default: 0, min: 0, max: 10, step: 3, snap: true })).toBe(
      3,
    );
  });
  test('a slider position becomes a clean value inside the range', () => {
    expect(sliderValue(declaration.params.length, '1.7000000000000002')).toBe(1.7);
    expect(sliderValue(declaration.params.length, '9')).toBe(2.4);
    expect(sliderValue(declaration.params.slats, '4.6')).toBe(5);
    expect(sliderValue(declaration.params.depth, 'x')).toBe(0.5);
  });
  test('values read as text with their unit', () => {
    expect(valueText(declaration.params.length, 1.65)).toBe('1.65 m');
    expect(valueText(declaration.params.slats, 5)).toBe('5');
    expect(valueText(declaration.params.arms, false)).toBe('Off');
    expect(valueText(declaration.params.wood, '#8a5a33')).toBe('#8a5a33');
  });
});

test('a variant download is named for the asset and what changed', () => {
  const defaults = paramDefaults(declaration);
  expect(variantFileName('Park Bench!', declaration, defaults)).toBe('Park-Bench-.glb');
  expect(
    variantFileName('Park Bench', declaration, {
      ...defaults,
      length: 2.4,
      arms: false,
      wood: '#112233',
    }),
  ).toBe('Park-Bench-length-2.4-arms-false-wood-112233.glb');
  const many = variantFileName('A', declaration, {
    length: 2,
    depth: 0.4,
    slats: 3,
    bay: 4,
    arms: false,
    wood: '#000000',
    style: 'scroll',
    seed: 123456789,
  });
  expect(many.length).toBeLessThanOrEqual(120);
  expect(many.endsWith('.glb')).toBe(true);
});

describe('colours the saved GLB carries', () => {
  const bindings = {
    version: 'kiln.param-bindings.v1',
    colors: {
      wood: { mode: 'factor', materials: [{ index: 0, name: 'wood' }] },
      stain: { mode: 'rebuild', reason: 'DATA_CHANGED', detail: 'baked' },
    },
  };
  test('are read from the manifest, and only for parameters the declaration has', () => {
    const read = carriedParams(declaration, { build: { paramBindings: bindings } });
    expect(read.names).toEqual(['wood']);
    expect(read.bindings as unknown).toEqual(bindings);
    expect(carriedParams(declaration, { build: {} }).names).toEqual([]);
    expect(
      carriedParams(declaration, { build: { paramBindings: { version: 'x' } } }).names,
    ).toEqual([]);
    const other = {
      version: 'kiln.param-bindings.v1',
      colors: { paint: { mode: 'factor', materials: [{ index: 0 }] } },
    };
    expect(carriedParams(declaration, { build: { paramBindings: other } }).names).toEqual([]);
  });
  test('a rebuild is needed only when something other than a carried colour changed', () => {
    const defaults = paramDefaults(declaration);
    expect(needsRebuild(declaration, ['wood'], defaults)).toBe(false);
    expect(needsRebuild(declaration, ['wood'], { ...defaults, wood: '#112233' })).toBe(false);
    expect(needsRebuild(declaration, [], { ...defaults, wood: '#112233' })).toBe(true);
    expect(needsRebuild(declaration, ['wood'], { ...defaults, wood: '#112233', slats: 6 })).toBe(
      true,
    );
    expect(needsRebuild(declaration, ['wood'], presetValues(declaration, 'long'))).toBe(true);
  });
  test('toggles and choices the file carries as node visibility are listed with the colours', () => {
    const switched = {
      ...bindings,
      switches: {
        arms: { mode: 'visibility', nodes: [{ index: 1, name: 'Arms', visibleWhen: [true] }] },
        style: { mode: 'rebuild', reason: 'DATA_CHANGED', detail: 'reshaped' },
        length: { mode: 'visibility', nodes: [{ index: 2, visibleWhen: [true] }] },
      },
    };
    const read = carriedParams(declaration, { build: { paramBindings: switched } });
    expect(read.names).toEqual(['wood', 'arms']);
    const defaults = paramDefaults(declaration);
    expect(needsRebuild(declaration, read.names, { ...defaults, arms: false })).toBe(false);
    expect(needsRebuild(declaration, read.names, { ...defaults, style: 'scroll' })).toBe(true);
  });
});
