/**
 * Colour parameters through save, sweep and runtime export: a save records which colours the
 * GLB can carry, the saved GLB itself stays the untagged default build, a recoloured copy is
 * the bytes a rebuild gives, and the runtime export tags the materials a consumer sets.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportAssetGlb } from '../../asset-export';
import { FileAssetLibrary } from '../../assets-node';
import { recolorGlb, validateParamBindings } from '../../param-bindings';
import { MemoryProgramStore } from '../../program-store';
import { createKilnProgramToolRegistry } from '../registry';

const CODE = `const meta = { name: 'Crate' };
const P = defineParams({
  paint: { type: 'color', default: '#8a5a33' },
  trim: { type: 'color', default: '#404040' },
  size: { type: 'range', default: 1, min: 0.5, max: 2 },
}, { presets: { blue: { paint: '#2f6fa8' } } });
function build() {
  const root = createRoot('Crate');
  const body = gameMaterial(P.paint);
  body.name = 'body';
  const edge = gameMaterial(P.trim);
  edge.color.multiplyScalar(0.5);
  edge.name = 'edge';
  createPart('Body', boxGeo(P.size, P.size, P.size), body, { parent: root, position: [0, P.size / 2, 0] });
  createPart('Lid', boxGeo(P.size * 1.1, 0.05, P.size * 1.1), edge, { parent: root, position: [0, P.size + 0.025, 0] });
  return root;
}`;

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const jsonOf = (bytes: Uint8Array) =>
  JSON.parse(
    new TextDecoder().decode(
      bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)),
    ),
  );

let root: string;
let library: FileAssetLibrary;
let programStore: MemoryProgramStore;
let ref: string;
let saved: { assetId: string; revisionId: string };
const tool = (name: string) =>
  createKilnProgramToolRegistry({ assetLibrary: library, programStore }).find(
    (def) => def.name === name,
  )!;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-param-bindings-'));
  library = new FileAssetLibrary({ project: root });
  programStore = new MemoryProgramStore();
  ref = await programStore.put(CODE);
  const result = (await tool('kiln_save').run({
    programRef: ref,
    name: 'Crate',
    collection: 'project',
  })) as { asset: { assetId: string; revisionId: string } };
  saved = result.asset;
}, 60_000);
afterAll(() => rm(root, { recursive: true, force: true }));

describe('colour parameters a GLB can carry', () => {
  test('a save records which colours are one material value and which need a rebuild', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    const bindings = validateParamBindings(record.manifest.build?.paramBindings);
    expect(bindings?.colors.paint).toEqual({
      mode: 'factor',
      materials: [{ index: 0, name: 'body' }],
    });
    expect(bindings?.colors.trim).toMatchObject({ mode: 'rebuild', reason: 'DERIVED_COLOR' });
    expect(Object.keys(bindings!.colors)).toEqual(['paint', 'trim']);
    // The saved GLB is still the plain default build: nothing is tagged into it.
    const built = (await tool('kiln_export').run({ programRef: ref })) as { sha256: string };
    expect(sha(record.files['asset.glb']!)).toBe(built.sha256);
    expect(JSON.stringify(jsonOf(record.files['asset.glb']!))).not.toContain('kilnParamV1');
  }, 60_000);

  test('a recoloured copy of the saved GLB is the bytes a rebuild at that colour gives', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    const bindings = validateParamBindings(record.manifest.build?.paramBindings);
    const rebuilt = (await tool('kiln_export').run({
      programRef: ref,
      params: { values: { paint: '#2f6fa8' } },
    })) as { sha256: string };
    const recoloured = recolorGlb(record.files['asset.glb']!, bindings, {
      paint: '#2f6fa8',
      trim: '#ffffff',
    });
    expect(sha(recoloured)).toBe(rebuilt.sha256);
  }, 60_000);

  test('a sweep reports the same classification without images', async () => {
    const result = (await tool('kiln_render').run({
      programRef: ref,
      params: { sweep: true },
    })) as {
      sweep: { colors?: Record<string, { mode: string; materials?: unknown }>; notSwept: string[] };
    };
    expect(result.sweep.colors?.paint).toEqual({
      mode: 'factor',
      materials: [{ index: 0, name: 'body' }],
    });
    expect(result.sweep.colors?.trim?.mode).toBe('rebuild');
    expect(result.sweep.notSwept).toEqual(['paint', 'trim']);
  }, 60_000);

  test('the runtime export tags the materials and lists them in its metadata', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    const output = await exportAssetGlb(record, { profile: 'runtime' });
    if (output.profile !== 'runtime') throw new Error('Expected a runtime export');
    const materials = jsonOf(output.glb).materials as { name: string; extras?: unknown }[];
    expect(materials[0]).toMatchObject({
      name: 'body',
      extras: { kilnParamV1: { name: 'paint', type: 'color' } },
    });
    expect(materials[1]!.extras).toBeUndefined();
    const metadata = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
    expect(metadata.params).toEqual({ colors: { paint: [{ index: 0, name: 'body' }] } });
    // The tags follow each material through the three target and a draw reduction.
    for (const options of [{ target: 'three' as const }, { draws: 'minimal' as const }]) {
      const derived = await exportAssetGlb(record, { profile: 'runtime', ...options });
      if (derived.profile !== 'runtime') throw new Error('Expected a runtime export');
      const listed = JSON.parse(new TextDecoder().decode(derived.metadata.bytes)).params.colors
        .paint as { index: number; name: string }[];
      expect(listed.map((material) => material.name)).toEqual(['body']);
      expect(
        (jsonOf(derived.glb).materials as { extras?: { kilnParamV1?: unknown } }[])[
          listed[0]!.index
        ]!.extras?.kilnParamV1,
      ).toEqual({ name: 'paint', type: 'color' });
    }
    // The editable profile is still the saved bytes.
    const editable = await exportAssetGlb(record, { profile: 'editable' });
    expect(sha(editable.glb)).toBe(record.manifest.files['asset.glb']!.sha256);
  }, 60_000);

  test('a program without colour parameters records nothing', async () => {
    const plain = await programStore.put(`const meta = { name: 'Plain' };
const P = defineParams({ size: { type: 'range', default: 1, min: 0.5, max: 2 } });
function build() {
  const root = createRoot('Plain');
  createPart('Box', boxGeo(P.size, 1, 1), gameMaterial(0x808080), { parent: root, position: [0, 0.5, 0] });
  return root;
}`);
    const result = (await tool('kiln_save').run({
      programRef: plain,
      name: 'Plain',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
    const record = await library.read('project', result.asset.assetId, result.asset.revisionId);
    expect(record.manifest.build?.paramBindings).toBeUndefined();
    const output = await exportAssetGlb(record, { profile: 'runtime' });
    if (output.profile !== 'runtime') throw new Error('Expected a runtime export');
    expect(JSON.parse(new TextDecoder().decode(output.metadata.bytes)).params).toBeUndefined();
  }, 60_000);
});
