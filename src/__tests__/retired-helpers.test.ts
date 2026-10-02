import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import * as primitives from '../primitives';
import * as uvShapes from '../uv-shapes';
import { validate } from '../validation';
import { executeKilnCode } from '../render';

const names = [
  'cloneGeometry',
  'cloneMaterial',
  'panelRemapV',
  'validateAsset',
  'boxUnwrap',
  'cylinderUnwrap',
  'planeUnwrap',
];
const source = (body: string) =>
  `const meta = { name: 'Migration' }; function build() { const root = createRoot('Migration'); ${body} return root; }`;
const { materialBudgetAdvisory } = primitives;
const { remapUV } = uvShapes;

describe('removed authoring helpers', () => {
  it('removes globals and direct exports without callable compatibility aliases', () => {
    const globals = primitives.buildSandboxGlobals();
    for (const name of names) {
      expect(Object.hasOwn(globals, name)).toBe(false);
      expect(Object.hasOwn(primitives, name)).toBe(false);
      expect(Object.hasOwn(uvShapes, name)).toBe(false);
    }
  });
  it('rejects unbound retired calls and aliases with explicit migration guidance', () => {
    for (const name of names) {
      for (const body of [`${name}(root);`, `const oldHelper = ${name}; oldHelper(root);`]) {
        const result = validate(source(body));
        expect(result.valid).toBe(false);
        const issue = result.issues.find((entry) => entry.code === 'REMOVED_HELPER');
        expect(issue?.message).toContain(name);
        expect(issue?.fixHint?.length).toBeGreaterThan(30);
      }
    }
  });
  it('allows user-defined functions and ordinary property names that match an old name', () => {
    expect(
      validate(source('function cloneGeometry(g) { return g; } cloneGeometry(root);')).valid,
    ).toBe(true);
    expect(
      validate(source('const x = { panelRemapV: 1 }; const note = "validateAsset";')).valid,
    ).toBe(true);
  });
  it.each([
    'function unrelated(cloneGeometry) {} cloneGeometry(root);',
    'function unrelated() { const cloneGeometry = x => x; } cloneGeometry(root);',
    '{ const cloneGeometry = x => x; } cloneGeometry(root);',
    'for (const cloneGeometry of []) {} cloneGeometry(root);',
    'try {} catch (cloneGeometry) {} cloneGeometry(root);',
    'const f = function cloneGeometry() {}; cloneGeometry(root);',
    'const C = class cloneGeometry {}; void cloneGeometry;',
    'function f(x = cloneGeometry(root)) { var cloneGeometry = y => y; }',
    'switch (cloneGeometry(root)) { case 0: let cloneGeometry; }',
    'class C { static { var cloneGeometry = x => x; } } cloneGeometry(root);',
    'class C { method() { { function cloneGeometry() {} } cloneGeometry(); } }',
    '{ let cloneGeometry; { function cloneGeometry() {} } } cloneGeometry(root);',
    'function f() { "use strict"; { function cloneGeometry() {} } cloneGeometry(); }',
    // Generated code runs in strict mode (decision 23 of 2 October 2026), so a block-level
    // function declaration never hoists out of its block: the call outside reaches the
    // removed global, and validate says so before the evaluator throws.
    '{ function cloneGeometry(x) { return x; } } cloneGeometry(root);',
    'cloneGeometry = root;',
    '({value: cloneGeometry} = {value: root});',
  ])('does not let an unrelated local binding hide a removed global: %s', (body) => {
    const result = validate(source(body));
    expect(result.issues.some((issue) => issue.code === 'REMOVED_HELPER')).toBe(true);
  });
  it.each([
    'const C = class cloneGeometry { static self() { return cloneGeometry; } }; C.self();',
    'const f = function cloneGeometry() { return cloneGeometry; }; f();',
    'function f(cloneGeometry) { return () => cloneGeometry(root); } f(x => x)();',
    'function f({cloneGeometry: local = x => x}) { return local(root); } f({});',
    'function f({cloneGeometry = x => x}) { return cloneGeometry(root); } f({});',
    '{ const cloneGeometry = x => x; cloneGeometry(root); }',
    'for (const cloneGeometry of [x => x]) { cloneGeometry(root); }',
    'if (true) { var cloneGeometry = x => x; } cloneGeometry(root);',
    'class C { static { var cloneGeometry = x => x; cloneGeometry(root); } }',
    'switch (0) { case 0: const cloneGeometry = x => x; cloneGeometry(root); }',
    'const o = { cloneGeometry: root }; void o.cloneGeometry;',
  ])('preserves valid scoped locals and property names: %s', async (body) => {
    expect(validate(source(body)).valid).toBe(true);
    await expect(executeKilnCode(source(body))).resolves.toBeDefined();
  });
  it('rejects a removed global before any authored statements execute', async () => {
    const code = `throw new Error('EARLIER_AUTHORED_STATEMENT'); ${source('cloneGeometry(root);')}`;
    await expect(executeKilnCode(code)).rejects.toMatchObject({ diagnostic: 'REMOVED_HELPER' });
  });
  it('keeps deliberate direct sharing separate from owned copies', () => {
    const globals = primitives.buildSandboxGlobals() as { boxGeo: typeof primitives.boxGeo };
    const shared = globals.boxGeo(1, 1, 1);
    const material = primitives.gameMaterial(0xff0000);
    material.map = new THREE.Texture();
    const a = primitives.createPart('A', shared, material) as THREE.Mesh;
    const b = primitives.createPart('B', shared, material) as THREE.Mesh;
    expect(a.geometry).toBe(b.geometry);
    expect(a.material).toBe(b.material);
    expect(globals.boxGeo(1, 1, 1)).toBe(shared);
    const owned = primitives.copyGeometry(shared).translate(2, 0, 0);
    expect(owned.getAttribute('position').array).not.toBe(shared.getAttribute('position').array);
    shared.computeBoundingBox();
    expect(shared.boundingBox!.min.x).toBe(-0.5);
    const changed = primitives.copyMaterial(material);
    expect(changed).not.toBe(material);
    expect(changed.map).toBe(material.map);
    changed.color.set(0x00ff00);
    expect(material.color.getHex()).toBe(0xff0000);
  });
});

describe('explicit UV remapping', () => {
  it('has identity defaults and preserves the reviewed legacy U/V mapping explicitly', () => {
    const input = new THREE.PlaneGeometry(1, 1);
    const before = Array.from(input.getAttribute('uv').array);
    const identity = remapUV(input);
    expect(identity).not.toBe(input);
    expect(Array.from(identity.getAttribute('uv').array)).toEqual(before);
    const output = remapUV(input, { scale: [2, 0.3], offset: [0.2, -0.1] });
    for (let i = 0; i < before.length; i += 2) {
      expect(output.getAttribute('uv').getX(i / 2)).toBeCloseTo(before[i]! * 2 + 0.2, 6);
      expect(output.getAttribute('uv').getY(i / 2)).toBeCloseTo(before[i + 1]! * 0.3 - 0.1, 6);
    }
    expect(Array.from(input.getAttribute('uv').array)).toEqual(before);
  });
  it('reads interleaved normalized values and removes stale tangents only when scale changes', () => {
    const input = new THREE.PlaneGeometry(1, 1);
    const buffer = new THREE.InterleavedBuffer(
      new Uint16Array([9, 0, 65535, 9, 65535, 0, 9, 32768, 65535, 9, 65535, 32768]),
      3,
    );
    input.setAttribute('uv', new THREE.InterleavedBufferAttribute(buffer, 2, 1, true));
    input.setAttribute('tangent', new THREE.Float32BufferAttribute(Array(16).fill(1), 4));
    const offset = remapUV(input, { offset: [2, 3] });
    expect(offset.getAttribute('uv').getX(0)).toBe(2);
    expect(offset.getAttribute('uv').getY(0)).toBe(4);
    expect(offset.getAttribute('tangent')).toBeDefined();
    const mirrored = remapUV(input, { scale: [-1, 1] });
    expect(mirrored.getAttribute('tangent')).toBeUndefined();
    expect(input.getAttribute('tangent')).toBeDefined();
    expect(mirrored.getIndex()!.array).toEqual(input.getIndex()!.array);
    expect(mirrored.groups).toEqual(input.groups);
  });
  it('rejects missing/nonfinite UVs, unknown options and nonfinite output instead of silently cloning', () => {
    const input = new THREE.PlaneGeometry();
    // @ts-expect-error Exercise untyped authored JavaScript options.
    expect(() => remapUV(input, { vScale: 0.3 })).toThrow(/option/);
    expect(() => remapUV(input, { scale: [1, Number.NaN] })).toThrow(/finite/);
    expect(() => remapUV(input, { scale: [Number.MAX_VALUE, 1] })).toThrow(/finite/);
    input.getAttribute('uv').setX(0, Number.NaN);
    expect(() => remapUV(input)).toThrow(/finite/);
    input.deleteAttribute('uv');
    expect(() => remapUV(input)).toThrow(/UV|uv/);
  });
});

describe('honest material advisory', () => {
  it('reports material identity counts without declaring validity or pretending they are draw calls', () => {
    const root = primitives.createRoot('Advisory');
    const material = primitives.gameMaterial(0xff0000);
    primitives.createPart('A', primitives.boxGeo(1, 1, 1), material, { parent: root });
    primitives.createPart('B', primitives.boxGeo(1, 1, 1), material, { parent: root });
    const report = materialBudgetAdvisory(root);
    expect(report).toEqual({ materialCount: 1, maxMaterials: null, exceeded: null, warnings: [] });
    expect(Object.hasOwn(report, 'valid')).toBe(false);
    expect(Object.hasOwn(report, 'errors')).toBe(false);
    expect(Object.hasOwn(report, 'drawCalls')).toBe(false);
    expect(materialBudgetAdvisory(root, { maxMaterials: 0 })).toMatchObject({
      materialCount: 1,
      maxMaterials: 0,
      exceeded: true,
    });
    expect(materialBudgetAdvisory(root, { maxMaterials: 0 }).warnings.length).toBe(1);
    expect(() => materialBudgetAdvisory(root, { maxMaterials: -1 })).toThrow(/maxMaterials/);
    // @ts-expect-error Exercise untyped authored JavaScript options.
    expect(() => materialBudgetAdvisory(root, { category: 'prop' })).toThrow(/option/);
    // @ts-expect-error Null must not silently become an absent budget.
    expect(() => materialBudgetAdvisory(root, { maxMaterials: null })).toThrow(/maxMaterials/);
  });
});
