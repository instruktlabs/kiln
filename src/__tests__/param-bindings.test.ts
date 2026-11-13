/**
 * Which colour parameters a GLB can carry: a colour that only sets material base colour
 * factors can be changed in the file, and everything else needs a rebuild.
 */
import { describe, expect, test } from 'bun:test';
import {
  classifyColorBinding,
  colorProbe,
  factorColorBindings,
  recolorGlb,
  srgbHexToLinear,
  tagGltfColorParams,
  validateParamBindings,
  type ParamBindingsV1,
} from '../param-bindings';
import { renderGLBInProcess } from '../render';

function glb(json: unknown, bin: Uint8Array = new Uint8Array([1, 2, 3, 4])): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + bin.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.fill(32, 20, 20 + jsonLength);
  out.set(text, 20);
  view.setUint32(20 + jsonLength, bin.length, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  out.set(bin, 28 + jsonLength);
  return out;
}
const jsonOf = (bytes: Uint8Array) =>
  JSON.parse(
    new TextDecoder().decode(
      bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)),
    ),
  );
const factor = (hex: string, alpha = 1) => [...srgbHexToLinear(hex), alpha];
const material = (name: string | undefined, hex: string, extra: object = {}) => ({
  ...(name ? { name } : {}),
  pbrMetallicRoughness: { baseColorFactor: factor(hex), roughnessFactor: 0.7, ...extra },
});
const asset = (materials: unknown[], more: object = {}) => ({
  asset: { version: '2.0' },
  materials,
  ...more,
});
const GREY = '#d3d7da';
const PROBE = '#ff00ff';

describe('colour conversion', () => {
  test('matches the linear value three.js writes for an sRGB colour', () => {
    expect(srgbHexToLinear('#d3d7da')).toEqual([
      0.6514056374127929, 0.6795424696265424, 0.7011018919268015,
    ]);
    expect(srgbHexToLinear('#ff00ff')).toEqual([1, 0, 1]);
  });
  test('the probe is a colour other than the default', () => {
    expect(colorProbe('#8a5a33')).toBe('#ff00ff');
    expect(colorProbe('#ff00ff')).toBe('#00ff00');
  });
});

describe('classifyColorBinding', () => {
  const classify = (a: unknown, b: unknown, binA?: Uint8Array, binB?: Uint8Array) =>
    classifyColorBinding(glb(a, binA), glb(b, binB), GREY, PROBE);

  test('a colour that only sets base colour factors is carried by those materials', () => {
    expect(
      classify(
        asset([material('tile', GREY), material('steel', '#b9bec3')]),
        asset([material('tile', PROBE), material('steel', '#b9bec3')]),
      ),
    ).toEqual({ mode: 'factor', materials: [{ index: 0, name: 'tile' }] });
  });

  test('an unnamed material is addressed by index, and one colour may drive several', () => {
    expect(
      classify(
        asset([material(undefined, GREY), material('trim', GREY), material('x', '#000000')]),
        asset([material(undefined, PROBE), material('trim', PROBE), material('x', '#000000')]),
      ),
    ).toEqual({ mode: 'factor', materials: [{ index: 0 }, { index: 1, name: 'trim' }] });
  });

  test('a material without a written factor is white', () => {
    expect(
      classifyColorBinding(
        glb(asset([{ name: 'paint', pbrMetallicRoughness: { roughnessFactor: 0.7 } }])),
        glb(asset([material('paint', PROBE)])),
        '#ffffff',
        PROBE,
      ),
    ).toEqual({ mode: 'factor', materials: [{ index: 0, name: 'paint' }] });
  });

  test('changed mesh or texture data needs a rebuild', () => {
    expect(
      classify(
        asset([material('tile', GREY)]),
        asset([material('tile', PROBE)]),
        new Uint8Array([1, 2, 3, 4]),
        new Uint8Array([1, 2, 3, 5]),
      ),
    ).toMatchObject({ mode: 'rebuild', reason: 'DATA_CHANGED' });
  });

  test('changed data in files that do not line up keeps the general detail', () => {
    const detail = (
      classify(
        asset([material('tile', GREY)]),
        asset([material('tile', PROBE)]),
        new Uint8Array([1, 2, 3, 4]),
        new Uint8Array([1, 2, 3, 5]),
      ) as { detail: string }
    ).detail;
    expect(detail).toStartWith('The colour is baked into mesh, vertex-colour or texture data.');
    expect(detail).not.toContain('First difference');
  });

  test('a colour baked into vertex colours names them and their part', async () => {
    // The tile's vertex colours are the parameter's colour; its material stays white.
    const code = `const meta = { name: 'Tile' };
const P = defineParams({ paint: { type: 'color', default: '${GREY}' } });
function build() {
  const root = createRoot('Tile');
  const geo = boxGeo(0.4, 0.02, 0.4);
  const colours = geo.getAttribute('normal').clone();
  const channel = (at) => Number.parseInt(P.paint.slice(at, at + 2), 16) / 255;
  for (let i = 0; i < colours.count; i++) colours.setXYZ(i, channel(1), channel(3), channel(5));
  geo.setAttribute('color', colours);
  createPart('Tile', geo, gameMaterial(0xffffff), { parent: root });
  return root;
}`;
    const build = async (paint: string) =>
      (await renderGLBInProcess(code, { params: { values: { paint } } })).glb;
    const binding = classifyColorBinding(await build(GREY), await build(PROBE), GREY, PROBE);
    expect(binding).toMatchObject({ mode: 'rebuild', reason: 'DATA_CHANGED' });
    const detail = (binding as { detail: string }).detail;
    expect(detail).toStartWith('The colour is baked into mesh, vertex-colour or texture data.');
    expect(detail).toContain('First difference: vertex colours (COLOR_0) of Mesh_Tile.');
    expect(detail.length).toBeLessThanOrEqual(320);
  }, 60_000);

  test('any other changed value needs a rebuild', () => {
    expect(
      classify(
        asset([material('tile', GREY)]),
        asset([material('tile', PROBE, { roughnessFactor: 0.2 })]),
      ),
    ).toMatchObject({ mode: 'rebuild', reason: 'OTHER_VALUES_CHANGED' });
    expect(
      classify(
        asset([material('tile', GREY)]),
        asset([material('tile', PROBE), material('extra', PROBE)]),
      ),
    ).toMatchObject({ mode: 'rebuild', reason: 'OTHER_VALUES_CHANGED' });
  });

  test('a base colour derived from the parameter, not equal to it, needs a rebuild', () => {
    expect(
      classify(asset([material('tile', '#6a6c6d')]), asset([material('tile', '#800080')])),
    ).toMatchObject({ mode: 'rebuild', reason: 'DERIVED_COLOR' });
  });

  test('a colour no material follows is reported as such', () => {
    const same = asset([material('tile', GREY)]);
    expect(classify(same, same)).toMatchObject({ mode: 'rebuild', reason: 'NO_MATERIAL' });
  });
});

const bindings: ParamBindingsV1 = {
  version: 'kiln.param-bindings.v1',
  colors: {
    tile: { mode: 'factor', materials: [{ index: 0, name: 'tile' }] },
    grout: { mode: 'rebuild', reason: 'DATA_CHANGED', detail: 'x' },
  },
};

describe('validateParamBindings', () => {
  test('accepts a recorded report and refuses anything else', () => {
    expect(validateParamBindings(bindings)).toEqual(bindings);
    expect(validateParamBindings(undefined)).toBeUndefined();
    expect(
      validateParamBindings({ version: 'kiln.param-bindings.v2', colors: {} }),
    ).toBeUndefined();
    expect(
      validateParamBindings({
        version: 'kiln.param-bindings.v1',
        colors: { tile: { mode: 'factor', materials: [{ index: -1 }] } },
      }),
    ).toBeUndefined();
    expect(
      validateParamBindings({
        version: 'kiln.param-bindings.v1',
        colors: { 'not a name': { mode: 'factor', materials: [{ index: 0 }] } },
      }),
    ).toBeUndefined();
  });
  test('lists the colours a file can carry', () => {
    expect(factorColorBindings(bindings)).toEqual({ tile: [{ index: 0, name: 'tile' }] });
    expect(factorColorBindings(undefined)).toEqual({});
  });
});

describe('recolorGlb', () => {
  const base = glb(asset([material('tile', GREY), material('steel', '#b9bec3')]));
  test('sets the bound materials and nothing else', () => {
    const out = recolorGlb(base, bindings, { tile: '#2f6fa8' });
    expect(out).toEqual(glb(asset([material('tile', '#2f6fa8'), material('steel', '#b9bec3')])));
  });
  test('keeps a material alpha and ignores colours a file cannot carry', () => {
    const translucent = glb(
      asset([{ name: 'tile', pbrMetallicRoughness: { baseColorFactor: factor(GREY, 0.5) } }]),
    );
    expect(
      jsonOf(recolorGlb(translucent, bindings, { tile: '#000000', grout: '#ffffff' })).materials[0]
        .pbrMetallicRoughness.baseColorFactor,
    ).toEqual([0, 0, 0, 0.5]);
  });
  test('returns the same bytes when nothing applies, and refuses a file that does not fit', () => {
    expect(recolorGlb(base, bindings, {})).toBe(base);
    expect(() => recolorGlb(glb(asset([])), bindings, { tile: '#000000' })).toThrow(/material/);
    expect(() => recolorGlb(base, bindings, { tile: 'blue' })).toThrow(/#rrggbb/);
  });
});

describe('tagGltfColorParams', () => {
  test('marks each bound material and reports where the marks are', () => {
    const json = asset([material('tile', GREY), { name: 'steel', extras: { keep: 1 } }]);
    tagGltfColorParams(json, bindings);
    expect((json.materials[0] as { extras: unknown }).extras).toEqual({
      kilnParamV1: { name: 'tile', type: 'color' },
    });
    expect((json.materials[1] as { extras: unknown }).extras).toEqual({ keep: 1 });
  });
  test('refuses a file whose materials do not match the record', () => {
    expect(() => tagGltfColorParams(asset([]), bindings)).toThrow(/material/);
    expect(() => tagGltfColorParams(asset([material('other', GREY)]), bindings)).toThrow(
      /material/,
    );
  });
});
