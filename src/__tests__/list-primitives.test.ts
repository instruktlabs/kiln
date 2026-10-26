/**
 * Kiln primitive catalog tests (W3b.2)
 *
 * Verifies the self-describing catalog stays in sync with the actual
 * sandbox globals exposed by `buildSandboxGlobals()`. Drift between the
 * catalog and the real surface is a silent agent-facing bug, so we check
 * it here rather than relying on documentation discipline.
 */

import { describe, expect, test } from 'bun:test';

import { listHelperSpecs } from '../discovery/helper-specs';
import { buildSandboxGlobals } from '../primitives';

describe('kiln.listHelperSpecs', () => {
  test('returns a non-empty catalog with expected shape', () => {
    const spec = listHelperSpecs();
    expect(spec.length).toBeGreaterThan(20);
    for (const p of spec) {
      expect(p.name).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
      expect(p.signature).toContain(p.name);
      expect(p.returns.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.example.length).toBeGreaterThan(0);
      expect([
        'geometry',
        'material',
        'structure',
        'animation',
        'utility',
        'instancing',
        'csg',
        'arrays',
        'mesh-ops',
        'curves',
        'uv',
        'textures',
      ]).toContain(p.category);
    }
  });

  test('every cataloged primitive is present in the sandbox globals', () => {
    const globals = buildSandboxGlobals();
    for (const p of listHelperSpecs()) {
      expect(typeof globals[p.name]).toBe('function');
    }
  });

  test('every sandbox function (except Math/console) appears in the catalog', () => {
    const catalog = new Set(listHelperSpecs().map((p) => p.name));
    const globals = buildSandboxGlobals();

    const missing: string[] = [];
    for (const [name, value] of Object.entries(globals)) {
      if (name === 'Math' || name === 'console') continue;
      if (typeof value !== 'function') continue;
      if (!catalog.has(name)) missing.push(name);
    }

    expect(missing).toEqual([]);
  });

  // #202: docs/programs.md names every sandbox global the catalog does not.
  test('docs/programs.md lists every sandbox global outside the catalog', async () => {
    const catalog = new Set(listHelperSpecs().map((p) => p.name));
    const extra = Object.keys(buildSandboxGlobals())
      .filter((name) => !catalog.has(name))
      .sort();
    expect(extra).toEqual(['Math', 'THREE', 'console']);
    const doc = await Bun.file(new URL('../../docs/programs.md', import.meta.url)).text();
    const section = doc.split('## Sandbox globals')[1]?.split('\n## ')[0] ?? '';
    for (const name of extra) expect(section).toContain(`\`${name}\``);
  });

  test('returned array is a defensive copy', () => {
    const a = listHelperSpecs();
    const b = listHelperSpecs();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    a[0]!.name = 'mutated';
    expect(b[0]!.name).not.toBe('mutated');
  });

  test('contains canonical entries for the major primitive groups', () => {
    const names = new Set(listHelperSpecs().map((p) => p.name));
    for (const expected of [
      'createRoot',
      'createPivot',
      'createPart',
      'boxGeo',
      'sphereGeo',
      'cylinderGeo',
      'gameMaterial',
      'rotationTrack',
      'positionTrack',
      'createClip',
      'countTriangles',
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });
});
