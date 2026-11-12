/**
 * `toggle` and `choice` parameters through save, sweep and runtime export: a save records which
 * options only show and hide nodes, the saved GLB stays the untagged default build, a switched
 * copy holds what a rebuild holds, and the runtime export tags the nodes a consumer shows.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportAssetGlb } from '../../asset-export';
import { FileAssetLibrary } from '../../assets-node';
import { applyCarriedParams, validateParamBindings } from '../../param-bindings';
import { MemoryProgramStore } from '../../program-store';
import { renderGLBInProcess } from '../../render';
import { createKilnProgramToolRegistry } from '../registry';

// Arms and the two backs are always built and shown from a parameter; the cushion is built
// only when asked for, which a GLB cannot carry.
const CODE = `const meta = { name: 'Bench' };
const P = defineParams({
  arms: { type: 'toggle', default: true },
  style: { type: 'choice', default: 'plain', options: ['plain', 'scroll'] },
  cushion: { type: 'toggle', default: false },
  paint: { type: 'color', default: '#8a5a33' },
});
function build() {
  const root = createRoot('Bench');
  const wood = gameMaterial(P.paint);
  wood.name = 'wood';
  createPart('Seat', boxGeo(0.5, 0.06, 1.6), wood, { parent: root, position: [0, 0.45, 0] });
  const arms = createPart('Arms', boxGeo(0.5, 0.2, 1.7), wood, { parent: root, position: [0, 0.6, 0] });
  arms.visible = P.arms;
  const plain = createPart('BackPlain', boxGeo(0.05, 0.5, 1.6), wood, { parent: root, position: [-0.25, 0.75, 0] });
  plain.visible = P.style === 'plain';
  const scroll = createPart('BackScroll', cylinderGeo(0.08, 0.08, 1.6, 12), wood, { parent: root, position: [-0.25, 1.0, 0], rotation: [90, 0, 0] });
  scroll.visible = P.style === 'scroll';
  if (P.cushion) createPart('Cushion', boxGeo(0.45, 0.05, 1.5), gameMaterial(0x993333), { parent: root, position: [0, 0.51, 0] });
  return root;
}`;

const jsonOf = (bytes: Uint8Array) =>
  JSON.parse(
    new TextDecoder().decode(
      bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)),
    ),
  );
const binOf = (bytes: Uint8Array) =>
  bytes.subarray(20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true));

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
  root = await mkdtemp(join(tmpdir(), 'kiln-param-switches-'));
  library = new FileAssetLibrary({ project: root });
  programStore = new MemoryProgramStore();
  ref = await programStore.put(CODE);
  const result = (await tool('kiln_save').run({
    programRef: ref,
    name: 'Bench',
    collection: 'project',
  })) as { asset: { assetId: string; revisionId: string } };
  saved = result.asset;
}, 60_000);
afterAll(() => rm(root, { recursive: true, force: true }));

describe('toggle and choice parameters a GLB can carry', () => {
  test('a save records which options are node visibility and which need a rebuild', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    const bindings = validateParamBindings(record.manifest.build?.paramBindings);
    expect(bindings?.switches?.arms).toMatchObject({
      mode: 'visibility',
      nodes: [{ name: 'Mesh_Arms', visibleWhen: [true] }],
    });
    expect(bindings?.switches?.style).toMatchObject({
      mode: 'visibility',
      nodes: [
        { name: 'Mesh_BackPlain', visibleWhen: ['plain'] },
        { name: 'Mesh_BackScroll', visibleWhen: ['scroll'] },
      ],
    });
    expect(bindings?.switches?.cushion?.mode).toBe('rebuild');
    expect(bindings?.colors.paint?.mode).toBe('factor');
    // The saved GLB is still the plain default build: nothing is tagged into it.
    expect(JSON.stringify(jsonOf(record.files['asset.glb']!))).not.toContain('kilnParamV1');
  }, 60_000);

  test('a switched copy of the saved GLB holds what a rebuild at those values holds', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    const bindings = validateParamBindings(record.manifest.build?.paramBindings);
    const values = { arms: false, style: 'scroll', paint: '#2f6fa8' };
    const rebuilt = (await renderGLBInProcess(CODE, { params: { values } })).glb;
    const switched = applyCarriedParams(record.files['asset.glb']!, bindings, {
      ...values,
      cushion: true,
    });
    expect(jsonOf(switched)).toEqual(jsonOf(rebuilt));
    expect(binOf(switched)).toEqual(binOf(rebuilt));
  }, 60_000);

  test('a sweep reports the same classification', async () => {
    const result = (await tool('kiln_render').run({
      programRef: ref,
      params: { sweep: true },
    })) as { sweep: { switches?: Record<string, { mode: string }>; colors?: object } };
    expect(result.sweep.switches?.arms?.mode).toBe('visibility');
    expect(result.sweep.switches?.style?.mode).toBe('visibility');
    expect(result.sweep.switches?.cushion?.mode).toBe('rebuild');
    expect(result.sweep.colors).toBeDefined();
  }, 60_000);

  test('the runtime export tags the nodes and lists them in its metadata', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    const output = await exportAssetGlb(record, { profile: 'runtime' });
    if (output.profile !== 'runtime') throw new Error('Expected a runtime export');
    const nodes = jsonOf(output.glb).nodes as { name: string; extras?: unknown }[];
    const byName = (name: string) => nodes.find((node) => node.name === name)!;
    expect(byName('Mesh_Arms').extras).toEqual({
      kilnParamV1: { name: 'arms', type: 'toggle', visibleWhen: [true] },
    });
    expect(byName('Mesh_BackScroll').extras).toEqual({
      kilnParamV1: { name: 'style', type: 'choice', visibleWhen: ['scroll'] },
    });
    expect(byName('Mesh_Seat').extras).toBeUndefined();
    const metadata = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
    expect(Object.keys(metadata.params.switches)).toEqual(['arms', 'style']);
    expect(metadata.params.switches.arms).toMatchObject([
      { name: 'Mesh_Arms', visibleWhen: [true] },
    ]);
    expect(metadata.params.colors.paint).toMatchObject([{ name: 'wood' }]);
    // Each listed index is the tagged node of the exported file.
    for (const listed of metadata.params.switches.style as { index: number; name: string }[])
      expect(nodes[listed.index]!.name).toBe(listed.name);
  }, 60_000);

  test('a derived export lists only the switches whose nodes it kept', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    for (const options of [{ target: 'three' as const }, { draws: 'minimal' as const }]) {
      const derived = await exportAssetGlb(record, { profile: 'runtime', ...options });
      if (derived.profile !== 'runtime') throw new Error('Expected a runtime export');
      const metadata = JSON.parse(new TextDecoder().decode(derived.metadata.bytes));
      const nodes = jsonOf(derived.glb).nodes as {
        name?: string;
        extras?: { kilnParamV1?: unknown };
      }[];
      const tagged = nodes.filter((node) => node.extras?.kilnParamV1 !== undefined).length;
      const listed = Object.values(
        (metadata.params.switches ?? {}) as Record<string, unknown[]>,
      ).flat().length;
      expect(listed).toBe(tagged);
      // A switch is listed whole or reported as dropped, never half.
      for (const name of ['arms', 'style']) {
        const kept = metadata.params.switches?.[name] !== undefined;
        const dropped = (metadata.params.dropped ?? []).includes(name);
        expect(kept !== dropped).toBe(true);
      }
    }
  }, 60_000);
});
