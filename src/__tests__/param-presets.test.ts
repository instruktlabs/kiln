/**
 * Presets a GLB can carry: a preset that only sets carried colours becomes one
 * `KHR_materials_variants` entry, with a copy of each bound material at the preset's colour.
 */
import { describe, expect, test } from 'bun:test';
import { addPresetVariants, srgbHexToLinear } from '../param-bindings';
import type { ParamsDeclarationV1 } from '../params';

const factor = (hex: string, alpha = 1) => [...srgbHexToLinear(hex), alpha];
const material = (name: string, hex: string, more: object = {}) => ({
  name,
  pbrMetallicRoughness: { baseColorFactor: factor(hex), roughnessFactor: 0.7 },
  ...more,
});
/** Body and lid use `paint`, the hinge uses `steel`; `paint` and `trim` are tagged as carried. */
function file(more: object = {}) {
  return {
    asset: { version: '2.0' },
    materials: [
      material('paint', '#8a5a33', { extras: { kilnParamV1: { name: 'paint', type: 'color' } } }),
      material('steel', '#b9bec3'),
      material('trim', '#404040', { extras: { kilnParamV1: { name: 'trim', type: 'color' } } }),
    ],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
      {
        primitives: [
          { attributes: { POSITION: 1 }, material: 0 },
          { attributes: { POSITION: 2 }, material: 1 },
          { attributes: { POSITION: 3 }, material: 2 },
        ],
      },
    ],
    ...more,
  };
}
const colors = { paint: [{ index: 0, name: 'paint' }], trim: [{ index: 2, name: 'trim' }] };
const declaration = (presets: ParamsDeclarationV1['presets']): ParamsDeclarationV1 => ({
  schemaVersion: 1,
  params: {
    paint: { type: 'color', default: '#8a5a33' },
    trim: { type: 'color', default: '#404040' },
    stain: { type: 'color', default: '#101010' },
    size: { type: 'range', default: 1, min: 0.5, max: 2 },
  },
  ...(presets ? { presets } : {}),
});

/** What the tests read back from the JSON once variants are written. */
type Written = {
  extensionsUsed: string[];
  extensions: { KHR_materials_variants: { variants: { name: string }[] } };
  materials: {
    name: string;
    pbrMetallicRoughness: { baseColorFactor: number[] };
    extras: Record<string, unknown>;
  }[];
  meshes: {
    primitives: { extensions?: { KHR_materials_variants: { mappings: unknown[] } } }[];
  }[];
};
const read = (json: object) => json as unknown as Written;

describe('addPresetVariants', () => {
  test('a preset that only sets carried colours becomes a material variant', () => {
    const json = file();
    const result = addPresetVariants(json, declaration({ blue: { paint: '#2f6fa8' } }), colors);
    expect(result).toEqual({ presets: { blue: 0 }, rebuild: [] });
    const out = read(json);
    expect(out.extensionsUsed).toEqual(['KHR_materials_variants']);
    expect(out.extensions.KHR_materials_variants).toEqual({ variants: [{ name: 'blue' }] });
    // One copy of the bound material at the preset's colour, without the parameter tag.
    expect(out.materials).toHaveLength(4);
    expect(out.materials[3] as unknown).toEqual({
      name: 'paint@blue',
      pbrMetallicRoughness: { baseColorFactor: factor('#2f6fa8'), roughnessFactor: 0.7 },
    });
    // Every primitive that draws with the bound material maps the variant to the copy.
    const mapping = { KHR_materials_variants: { mappings: [{ material: 3, variants: [0] }] } };
    expect(out.meshes[0]!.primitives[0]!.extensions).toEqual(mapping);
    expect(out.meshes[1]!.primitives[0]!.extensions).toEqual(mapping);
    expect(out.meshes[1]!.primitives[1]!.extensions).toBeUndefined();
    expect(out.meshes[1]!.primitives[2]!.extensions).toBeUndefined();
    // The default materials are untouched.
    expect(out.materials[0]!.pbrMetallicRoughness.baseColorFactor).toEqual(factor('#8a5a33'));
  });

  test('presets share a copy at the same colour, and a preset equal to the defaults maps nothing', () => {
    const raw = file();
    const json = read(raw);
    const result = addPresetVariants(
      raw,
      declaration({
        blue: { paint: '#2f6fa8' },
        standard: { paint: '#8a5a33', size: 1 },
        navy: { paint: '#2f6fa8', trim: '#000000' },
      }),
      colors,
    );
    expect(result).toEqual({ presets: { blue: 0, standard: 1, navy: 2 }, rebuild: [] });
    expect(json.extensions.KHR_materials_variants.variants).toEqual([
      { name: 'blue' },
      { name: 'standard' },
      { name: 'navy' },
    ]);
    expect(json.materials.map((entry: { name: string }) => entry.name)).toEqual([
      'paint',
      'steel',
      'trim',
      'paint@blue',
      'trim@navy',
    ]);
    expect(json.meshes[0]!.primitives[0]!.extensions!.KHR_materials_variants.mappings).toEqual([
      { material: 3, variants: [0, 2] },
    ]);
    expect(json.meshes[1]!.primitives[2]!.extensions!.KHR_materials_variants.mappings).toEqual([
      { material: 4, variants: [2] },
    ]);
  });

  test('a preset that changes anything a file does not carry is left to a rebuild', () => {
    const raw = file();
    const json = read(raw);
    const result = addPresetVariants(
      raw,
      declaration({
        big: { size: 2 },
        dark: { paint: '#111111', stain: '#000000' },
        blue: { paint: '#2f6fa8' },
      }),
      colors,
    );
    expect(result).toEqual({ presets: { blue: 0 }, rebuild: ['big', 'dark'] });
    expect(json.extensions.KHR_materials_variants.variants).toEqual([{ name: 'blue' }]);
  });

  test('nothing is written when no preset changes a carried colour', () => {
    const cases: ParamsDeclarationV1['presets'][] = [
      undefined,
      { big: { size: 2 } },
      { standard: { size: 1 } },
    ];
    for (const presets of cases) {
      const json = file();
      const result = addPresetVariants(json, declaration(presets), colors);
      expect(json).toEqual(file());
      expect(result.presets).toEqual({});
    }
  });

  test('a file that already has material variants is left as it is', () => {
    const existing = {
      extensionsUsed: ['KHR_materials_variants'],
      extensions: { KHR_materials_variants: { variants: [{ name: 'night' }] } },
    };
    const json = file(existing);
    const result = addPresetVariants(json, declaration({ blue: { paint: '#2f6fa8' } }), colors);
    expect(json).toEqual(file(existing));
    expect(result).toEqual({ presets: {}, rebuild: ['blue'] });
  });

  test('a copy keeps the material alpha and its other extras', () => {
    const raw = file();
    const json = read(raw);
    json.materials[0]!.pbrMetallicRoughness.baseColorFactor = factor('#8a5a33', 0.5);
    json.materials[0]!.extras.keep = 1;
    addPresetVariants(raw, declaration({ blue: { paint: '#2f6fa8' } }), colors);
    expect(json.materials[3]!.pbrMetallicRoughness.baseColorFactor).toEqual(factor('#2f6fa8', 0.5));
    expect(json.materials[3]!.extras).toEqual({ keep: 1 });
  });
});
