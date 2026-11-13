/**
 * Which `toggle` and `choice` parameters a GLB can carry: an option that only shows or hides
 * named nodes is `KHR_node_visibility` on those nodes, and everything else needs a rebuild.
 */
import { describe, expect, test } from 'bun:test';
import {
  applyCarriedParams,
  classifyParamBindings,
  classifySwitchBinding,
  switchBindings,
  taggedSwitchNodes,
  tagGltfParams,
  validateParamBindings,
  type ParamBindingsV1,
} from '../param-bindings';
import type { ParamsDeclarationV1 } from '../params';
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
const binOf = (bytes: Uint8Array) =>
  bytes.subarray(20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true));

/** A scene of named nodes; the names in `hidden` carry `KHR_node_visibility: false`. */
function scene(names: string[], hidden: string[] = [], more: object = {}) {
  return {
    asset: { version: '2.0' },
    ...(hidden.length ? { extensionsUsed: ['KHR_node_visibility'] } : {}),
    nodes: names.map((name) => ({
      name,
      ...(hidden.includes(name) ? { extensions: { KHR_node_visibility: { visible: false } } } : {}),
    })),
    scenes: [{ nodes: names.map((_, index) => index) }],
    ...more,
  };
}
const PARTS = ['Seat', 'Arms', 'Scroll', 'Plain'];

describe('classifySwitchBinding', () => {
  test('a toggle that only hides a node is carried by that node', () => {
    expect(
      classifySwitchBinding([
        { value: true, glb: glb(scene(PARTS)) },
        { value: false, glb: glb(scene(PARTS, ['Arms'])) },
      ]),
    ).toEqual({ mode: 'visibility', nodes: [{ index: 1, name: 'Arms', visibleWhen: [true] }] });
  });

  test('a choice lists, per node, the options that show it', () => {
    expect(
      classifySwitchBinding([
        { value: 'plain', glb: glb(scene(PARTS, ['Scroll'])) },
        { value: 'scroll', glb: glb(scene(PARTS, ['Plain'])) },
        { value: 'bare', glb: glb(scene(PARTS, ['Scroll', 'Plain', 'Arms'])) },
      ]),
    ).toEqual({
      mode: 'visibility',
      nodes: [
        { index: 1, name: 'Arms', visibleWhen: ['plain', 'scroll'] },
        { index: 2, name: 'Scroll', visibleWhen: ['scroll'] },
        { index: 3, name: 'Plain', visibleWhen: ['plain'] },
      ],
    });
  });

  test('a node hidden at every value is left alone', () => {
    expect(
      classifySwitchBinding([
        { value: true, glb: glb(scene(PARTS, ['Scroll'])) },
        { value: false, glb: glb(scene(PARTS, ['Scroll', 'Arms'])) },
      ]),
    ).toEqual({ mode: 'visibility', nodes: [{ index: 1, name: 'Arms', visibleWhen: [true] }] });
  });

  test('changed mesh data needs a rebuild', () => {
    expect(
      classifySwitchBinding([
        { value: true, glb: glb(scene(PARTS)) },
        { value: false, glb: glb(scene(PARTS, ['Arms']), new Uint8Array([9, 9, 9, 9])) },
      ]),
    ).toMatchObject({ mode: 'rebuild', reason: 'DATA_CHANGED' });
  });

  describe('changed data names the first data that differs when the files line up', () => {
    // `tall` reshapes the back with the same vertices; `cushion` builds its part only when on.
    const code = `const meta = { name: 'Bench' };
const P = defineParams({
  tall: { type: 'toggle', default: false },
  cushion: { type: 'toggle', default: false },
});
function build() {
  const root = createRoot('Bench');
  const wood = gameMaterial(0x8a5a33);
  createPart('Seat', boxGeo(0.5, 0.06, 1.6), wood, { parent: root, position: [0, 0.45, 0] });
  createPart('Back', boxGeo(0.05, P.tall ? 0.9 : 0.5, 1.6), wood, { parent: root, position: [-0.25, 0.75, 0] });
  if (P.cushion) createPart('Cushion', boxGeo(0.45, 0.05, 1.5), wood, { parent: root, position: [0, 0.51, 0] });
  return root;
}`;
    const build = async (values: Record<string, boolean>) =>
      (await renderGLBInProcess(code, { params: { values } })).glb;

    test('a reshaped part names its positions', async () => {
      const binding = classifySwitchBinding([
        { value: false, glb: await build({}) },
        { value: true, glb: await build({ tall: true }) },
      ]);
      expect(binding).toMatchObject({ mode: 'rebuild', reason: 'DATA_CHANGED' });
      const detail = (binding as { detail: string }).detail;
      expect(detail).toStartWith('The option adds, removes or reshapes geometry.');
      expect(detail).toContain('First difference: positions (POSITION) of Mesh_Back.');
      expect(detail.length).toBeLessThanOrEqual(320);
    }, 60_000);

    test('a part built only when on keeps the general detail', async () => {
      const binding = classifySwitchBinding([
        { value: false, glb: await build({}) },
        { value: true, glb: await build({ cushion: true }) },
      ]);
      expect(binding).toMatchObject({ mode: 'rebuild', reason: 'DATA_CHANGED' });
      const detail = (binding as { detail: string }).detail;
      expect(detail).toStartWith('The option adds, removes or reshapes geometry.');
      expect(detail).toContain('always build the part and set its `visible`');
      expect(detail).not.toContain('First difference');
    }, 60_000);
  });

  test('a node added or removed, or any other changed value, needs a rebuild', () => {
    expect(
      classifySwitchBinding([
        { value: true, glb: glb(scene(PARTS)) },
        { value: false, glb: glb(scene(['Seat', 'Scroll', 'Plain'])) },
      ]),
    ).toMatchObject({ mode: 'rebuild', reason: 'OTHER_VALUES_CHANGED' });
    expect(
      classifySwitchBinding([
        { value: true, glb: glb(scene(PARTS)) },
        { value: false, glb: glb(scene(PARTS, ['Arms'], { materials: [{ name: 'x' }] })) },
      ]),
    ).toMatchObject({ mode: 'rebuild', reason: 'OTHER_VALUES_CHANGED' });
  });

  test('an option that shows and hides nothing is reported as such', () => {
    expect(
      classifySwitchBinding([
        { value: true, glb: glb(scene(PARTS)) },
        { value: false, glb: glb(scene(PARTS)) },
      ]),
    ).toMatchObject({ mode: 'rebuild', reason: 'NO_NODE' });
  });
});

const declaration: ParamsDeclarationV1 = {
  schemaVersion: 1,
  params: {
    arms: { type: 'toggle', default: true },
    style: { type: 'choice', default: 'plain', options: ['plain', 'scroll'] },
    length: { type: 'range', default: 1, min: 0.5, max: 2 },
  },
};
/** A build function over the bench: arms hides Arms; style shows Plain or Scroll. */
function benchBuilder(log: Record<string, unknown>[] = []) {
  return async (values: Record<string, unknown>) => {
    log.push(values);
    const hidden = [(values.style ?? 'plain') === 'plain' ? 'Scroll' : 'Plain'];
    if (values.arms === false) hidden.push('Arms');
    return glb(scene(PARTS, hidden));
  };
}

describe('classifyParamBindings', () => {
  test('classifies each toggle and choice with the other parameters at their defaults', async () => {
    const log: Record<string, unknown>[] = [];
    const bindings = await classifyParamBindings(
      declaration,
      glb(scene(PARTS, ['Scroll'])),
      benchBuilder(log),
    );
    expect(log).toEqual([{ arms: false }, { style: 'scroll' }]);
    expect(bindings).toEqual({
      version: 'kiln.param-bindings.v1',
      colors: {},
      switches: {
        arms: { mode: 'visibility', nodes: [{ index: 1, name: 'Arms', visibleWhen: [true] }] },
        style: {
          mode: 'visibility',
          nodes: [
            { index: 2, name: 'Scroll', visibleWhen: ['scroll'] },
            { index: 3, name: 'Plain', visibleWhen: ['plain'] },
          ],
        },
      },
    });
  });

  test('a declaration with nothing a file could carry gives no record', async () => {
    expect(
      await classifyParamBindings(
        { schemaVersion: 1, params: { length: declaration.params.length! } },
        glb(scene(PARTS)),
        benchBuilder(),
      ),
    ).toBeUndefined();
  });

  test('a failed build and a spent build budget are each reported', async () => {
    const failing = await classifyParamBindings(declaration, glb(scene(PARTS, ['Scroll'])), () =>
      Promise.reject(new Error('no')),
    );
    expect(failing?.switches?.arms).toMatchObject({ mode: 'rebuild', reason: 'PROBE_FAILED' });
    const log: Record<string, unknown>[] = [];
    const capped = await classifyParamBindings(
      declaration,
      glb(scene(PARTS, ['Scroll'])),
      benchBuilder(log),
      { maxBuilds: 1 },
    );
    expect(log).toEqual([{ arms: false }]);
    expect(capped?.switches?.arms).toMatchObject({ mode: 'visibility' });
    expect(capped?.switches?.style).toMatchObject({ mode: 'rebuild', reason: 'NOT_CLASSIFIED' });
  });

  test('a node two parameters both hide is carried by neither', async () => {
    const both: ParamsDeclarationV1 = {
      schemaVersion: 1,
      params: {
        arms: { type: 'toggle', default: true },
        bare: { type: 'toggle', default: false },
      },
    };
    const bindings = await classifyParamBindings(both, glb(scene(PARTS)), async (values) =>
      glb(scene(PARTS, values.arms === false || values.bare === true ? ['Arms'] : [])),
    );
    expect(bindings?.switches?.arms).toMatchObject({ mode: 'rebuild', reason: 'SHARED_NODE' });
    expect(bindings?.switches?.bare).toMatchObject({ mode: 'rebuild', reason: 'SHARED_NODE' });
  });
});

const bindings: ParamBindingsV1 = {
  version: 'kiln.param-bindings.v1',
  colors: {},
  switches: {
    arms: { mode: 'visibility', nodes: [{ index: 1, name: 'Arms', visibleWhen: [true] }] },
    style: {
      mode: 'visibility',
      nodes: [
        { index: 2, name: 'Scroll', visibleWhen: ['scroll'] },
        { index: 3, name: 'Plain', visibleWhen: ['plain'] },
      ],
    },
    lid: { mode: 'rebuild', reason: 'DATA_CHANGED', detail: 'x' },
  },
};

describe('validateParamBindings with switches', () => {
  test('accepts a recorded report and refuses a malformed one', () => {
    expect(validateParamBindings(bindings)).toEqual(bindings);
    expect(switchBindings(bindings)).toEqual({
      arms: [{ index: 1, name: 'Arms', visibleWhen: [true] }],
      style: [
        { index: 2, name: 'Scroll', visibleWhen: ['scroll'] },
        { index: 3, name: 'Plain', visibleWhen: ['plain'] },
      ],
    });
    expect(switchBindings(undefined)).toEqual({});
    for (const nodes of [
      [],
      [{ index: -1, visibleWhen: [true] }],
      [{ index: 0, visibleWhen: [1] }],
    ])
      expect(
        validateParamBindings({
          version: 'kiln.param-bindings.v1',
          colors: {},
          switches: { arms: { mode: 'visibility', nodes } },
        }),
      ).toBeUndefined();
  });
});

describe('applyCarriedParams', () => {
  const saved = glb(scene(PARTS, ['Scroll']));
  test('hides and shows the bound nodes as a rebuild at those values would', () => {
    const out = applyCarriedParams(saved, bindings, { arms: false, style: 'scroll' });
    expect(jsonOf(out)).toEqual(scene(PARTS, ['Arms', 'Plain']));
    expect(binOf(out)).toEqual(binOf(saved));
  });
  test('drops the extension from the file when nothing is hidden any more', () => {
    const only: ParamBindingsV1 = {
      version: 'kiln.param-bindings.v1',
      colors: {},
      switches: { arms: bindings.switches!.arms! },
    };
    const hidden = glb(scene(PARTS, ['Arms']));
    expect(jsonOf(applyCarriedParams(hidden, only, { arms: true }))).toEqual(scene(PARTS));
  });
  test('returns the same bytes when nothing applies and refuses what does not fit', () => {
    expect(applyCarriedParams(saved, bindings, {})).toBe(saved);
    expect(applyCarriedParams(saved, bindings, { lid: true, length: 2 })).toBe(saved);
    expect(() => applyCarriedParams(glb(scene(['Seat'])), bindings, { arms: false })).toThrow(
      /node/,
    );
  });
});

describe('tagGltfParams', () => {
  test('marks each bound node and reports where the marks are', () => {
    const json = scene(PARTS, ['Scroll']);
    tagGltfParams(json, bindings);
    expect((json.nodes[1] as { extras?: unknown }).extras).toEqual({
      kilnParamV1: { name: 'arms', type: 'toggle', visibleWhen: [true] },
    });
    expect((json.nodes[2] as { extras?: unknown }).extras).toEqual({
      kilnParamV1: { name: 'style', type: 'choice', visibleWhen: ['scroll'] },
    });
    expect((json.nodes[0] as { extras?: unknown }).extras).toBeUndefined();
    expect(taggedSwitchNodes(json)).toEqual({
      arms: [{ index: 1, name: 'Arms', visibleWhen: [true] }],
      style: [
        { index: 2, name: 'Scroll', visibleWhen: ['scroll'] },
        { index: 3, name: 'Plain', visibleWhen: ['plain'] },
      ],
    });
  });
  test('refuses a file whose nodes do not match the record', () => {
    expect(() => tagGltfParams(scene(['Seat']), bindings)).toThrow(/node/);
  });
});
