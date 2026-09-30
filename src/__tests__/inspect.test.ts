/**
 * Kiln introspection tests (W3b.1)
 *
 * Render-only — no LLM, no network. Feeds hand-written Kiln code into
 * `kiln.inspect()` and asserts the structured report captures everything
 * agents need for debugging.
 */

import { describe, expect, test } from 'bun:test';

import { type EvaluatorPortV2, resolveEvaluatorPortV2 } from '../evaluator/protocol';
import { inspect } from '../inspect';

const CHEST_CODE = `
const meta = { name: 'TestChest', category: 'prop', tris: 60 };
function build() {
  const root = createRoot('TestChest');
  const body = createPart('Body', boxGeo(1, 0.6, 0.6), gameMaterial(0x8b4513), {
    position: [0, 0.3, 0], parent: root,
  });
  createPart('Lid', boxGeo(1, 0.2, 0.6), gameMaterial(0x6b3410), {
    position: [0, 0.7, 0], pivot: true, parent: root,
  });
  return root;
}
function animate() {
  return [createClip('Open', 1, [
    rotationTrack('Joint_Lid', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1, rotation: [-80, 0, 0] },
    ]),
  ])];
}
`;

const FLOATING_CODE = `
const meta = { name: 'Floater' };
function build() {
  const root = createRoot('Floater');
  createPart('Body', sphereGeo(0.5), gameMaterial(0x00ff00), {
    position: [0, 5, 0], parent: root,
  });
  return root;
}
`;

const BROKEN_JOINT_CODE = `
const meta = { name: 'Broken' };
function build() {
  const root = createRoot('Broken');
  const body = createPivot('Body', [0, 0, 0], root);
  createPart('Mesh', boxGeo(1, 1, 1), gameMaterial('#888888'), { parent: body });
  return root;
}
function animate() {
  return [createClip('bad', 1, [
    rotationTrack('Joint_DoesNotExist', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1, rotation: [30, 0, 0] },
    ]),
  ])];
}
`;

const EMPTY_CODE = `
const meta = { name: 'Empty' };
function build() {
  return createRoot('Empty');
}
`;

const SWATCHES_CODE = `
const meta = { name: 'Swatches', category: 'prop' };
function build() {
  const root = createRoot('Swatches');
  [0xaa3333, 0x33aa33, 0x3333aa, 0xaaaa33, 0x33aaaa].forEach((colour, i) => {
    createPart('Swatch' + i, boxGeo(0.4, 0.4, 0.4), gameMaterial(colour), {
      position: [i * 0.5, 0.2, 0], parent: root,
    });
  });
  return root;
}
`;

describe('kiln.inspect', () => {
  test('reports triangles, materials and bounding box for a real chest', async () => {
    const r = await inspect(CHEST_CODE);

    expect(r.triangles).toBeGreaterThan(0);
    expect(r.materials).toBe(2);
    expect(r.boundingBox.size[0]).toBeGreaterThan(0);
    expect(r.boundingBox.size[1]).toBeGreaterThan(0);
    expect(r.boundingBox.size[2]).toBeGreaterThan(0);
    expect(r.warnings).toEqual([]);
    expect(r.meta.name).toBe('TestChest');
  });

  test('captures named parts with type classification', async () => {
    const r = await inspect(CHEST_CODE);

    const names = r.namedParts.map((p) => p.name);
    expect(names).toContain('TestChest');
    expect(names).toContain('Mesh_Body');
    expect(names).toContain('Joint_Lid');

    const joint = r.namedParts.find((p) => p.name === 'Joint_Lid');
    expect(joint?.type).toBe('pivot');

    const mesh = r.namedParts.find((p) => p.name === 'Mesh_Body');
    expect(mesh?.type).toBe('mesh');
  });

  test('surfaces animation tracks with targetResolved flag', async () => {
    const r = await inspect(CHEST_CODE);

    expect(r.animationTracks.length).toBe(1);
    const track = r.animationTracks[0];
    expect(track?.clipName).toBe('Open');
    expect(track?.targetName).toBe('Joint_Lid');
    expect(track?.property).toBe('rotation');
    expect(track?.targetResolved).toBe(true);
  });

  test('preserves an unresolved review track and reports the evaluator warning', async () => {
    const r = await inspect(BROKEN_JOINT_CODE);

    expect(r.animationTracks).toHaveLength(1);
    expect(r.animationTracks[0]).toMatchObject({
      targetName: 'Joint_DoesNotExist',
      targetResolved: false,
    });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes('Joint_DoesNotExist'))).toBe(true);
  });

  test('lists the primitives actually used in the code', async () => {
    const r = await inspect(CHEST_CODE);

    expect(r.primitivesUsed).toContain('createRoot');
    expect(r.primitivesUsed).toContain('createPart');
    expect(r.primitivesUsed).toContain('boxGeo');
    expect(r.primitivesUsed).toContain('gameMaterial');
    expect(r.primitivesUsed).toContain('rotationTrack');
    expect(r.primitivesUsed).toContain('createClip');

    // Should not falsely detect unused primitives.
    expect(r.primitivesUsed).not.toContain('sphereGeo');
    expect(r.primitivesUsed).not.toContain('torusGeo');
  });

  test('bounds reflect a floating asset (debugging aid)', async () => {
    const r = await inspect(FLOATING_CODE);

    // Sphere at y=5 with r=0.5 → min y >= 4.5, max y <= 5.5
    expect(r.boundingBox.min[1]).toBeGreaterThan(4);
    expect(r.boundingBox.min[1]).toBeLessThan(5);
    expect(r.boundingBox.max[1]).toBeGreaterThan(5);
  });

  test('fails closed when evaluator QA blocks a pivots-only scene', async () => {
    await expect(inspect(EMPTY_CODE)).rejects.toMatchObject({ stage: 'scene' });
  });

  test('inspects the authored scene even when bake optimization is configured', async () => {
    const previous = process.env['KILN_BAKE_OPTIMIZE'];
    process.env['KILN_BAKE_OPTIMIZE'] = 'palette';
    try {
      const inspectedMaterials: number[] = [];
      const port = resolveEvaluatorPortV2(undefined, 'trusted-local');
      const spy: EvaluatorPortV2 = {
        render: async (code, options, controls) => {
          const result = await port.render(code, options, controls);
          const glb = new Uint8Array(result.glb);
          const jsonLength = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
          const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
          inspectedMaterials.push(json.materials.length);
          return result;
        },
      };
      const r = await inspect(SWATCHES_CODE, { evaluatorPort: spy });

      // Palette consolidation would have merged the five swatches into one
      // palette-textured material before inspection.
      expect(inspectedMaterials).toEqual([5]);
      expect(r.materials).toBe(5);
    } finally {
      if (previous === undefined) delete process.env['KILN_BAKE_OPTIMIZE'];
      else process.env['KILN_BAKE_OPTIMIZE'] = previous;
    }
  });
});
