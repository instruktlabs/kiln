/**
 * Issue #245: a child save reports what changed against its parent revision.
 *
 * The Holodeck dogfood (October 2026) merged four frond primitives into one. Positions,
 * indices and UVs stayed byte-identical, yet the only signal was a part `changed`; the agent
 * proved equality with its own GLB comparison. A save with `parentRevision` now carries the
 * triangle, vertex, draw and material counts of both revisions, the bounds delta and whether
 * the drawn world-space triangles are the same.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document } from '@gltf-transform/core';
import { FileAssetLibrary } from '../../assets-node';
import { createGltfIO } from '../../gltf-io';
import { trustedInProcessEvaluatorPortV2 } from '../../evaluator';
import { MemoryProgramStore, retainProgram } from '../../program-store';
import { createKilnProgramToolRegistry, type KilnInspectResult } from '../registry';

/** Four fronds, one part each: four nodes, four draws, one shared material. */
const PARENT =
  "const meta = { name: 'Fronds', category: 'prop' };\n" +
  'function build() {\n' +
  "  const root = createRoot('Fronds');\n" +
  "  const leaf = gameMaterial('#3a7a3a');\n" +
  "  for (let i = 0; i < 4; i++) createPart('Frond' + i, boxGeo(0.25, 1, 0.05), leaf, { parent: root, position: [i * 0.5, 0.5, 0] });\n" +
  '  return root;\n' +
  '}\n';

/** The same four fronds merged into one primitive: the geometry is translated, not changed. */
const merged = (shift = 0, uvShift = 0) =>
  "const meta = { name: 'Fronds', category: 'prop' };\n" +
  'function build() {\n' +
  "  const root = createRoot('Fronds');\n" +
  "  const leaf = gameMaterial('#3a7a3a');\n" +
  '  const parts = [3, 1, 2, 0].map((i) => boxGeo(0.25, 1, 0.05).clone().translate(i * 0.5, 0.5, 0));\n' +
  `  parts[0].attributes.position.setY(0, parts[0].attributes.position.getY(0) + ${shift});\n` +
  `  parts[0].attributes.uv.setX(0, parts[0].attributes.uv.getX(0) + ${uvShift});\n` +
  "  const names = ['position', 'normal', 'uv'];\n" +
  '  const merged = new THREE.BufferGeometry();\n' +
  '  for (const name of names) {\n' +
  '    const size = parts[0].attributes[name].itemSize;\n' +
  '    merged.setAttribute(name, new THREE.Float32BufferAttribute(parts.flatMap((p) => [...p.attributes[name].array]), size));\n' +
  '  }\n' +
  '  const index = [];\n' +
  '  let base = 0;\n' +
  '  for (const p of parts) { for (const v of p.index.array) index.push(v + base); base += p.attributes.position.count; }\n' +
  '  merged.setIndex(index);\n' +
  "  createPart('Fronds', merged, leaf, { parent: root });\n" +
  '  return root;\n' +
  '}\n';

let root: string;
let registry: ReturnType<typeof createKilnProgramToolRegistry>;
let programStore: MemoryProgramStore;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-save-comparison-'));
  programStore = new MemoryProgramStore();
  registry = createKilnProgramToolRegistry({
    evaluatorPort: trustedInProcessEvaluatorPortV2,
    programStore,
    assetLibrary: new FileAssetLibrary({ project: root }),
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const tool = (name: string) => registry.find((definition) => definition.name === name)!;

interface SaveResult {
  asset: { assetId: string; revisionId: string };
  comparison?: Record<string, unknown> & {
    counts?: Record<string, { parent: number; child: number; delta: number }>;
    bounds?: { parent: unknown; child: unknown; delta: { size: number[] } | null };
    geometryIdentical?: boolean;
    uvIdentical?: boolean;
  };
}

async function saveChild(code: string) {
  const parent = (await tool('kiln_save').run({
    programRef: await retainProgram(programStore, PARENT),
    name: 'Fronds',
  })) as SaveResult;
  const child = (await tool('kiln_save').run({
    programRef: await retainProgram(programStore, code),
    name: 'Fronds',
    assetId: parent.asset.assetId,
    parentRevision: parent.asset.revisionId,
  })) as SaveResult;
  return { parent, child };
}

test('a save without a parent carries no comparison', async () => {
  const { parent } = await saveChild(PARENT);
  expect(parent.comparison).toBeUndefined();
}, 60_000);

test('a merge-only child save reports equal geometry with fewer draws', async () => {
  const { child } = await saveChild(merged());
  const comparison = child.comparison!;
  expect(comparison).toBeDefined();
  expect(comparison.counts).toEqual({
    triangles: { parent: 48, child: 48, delta: 0 },
    vertices: { parent: 96, child: 96, delta: 0 },
    drawCalls: { parent: 4, child: 1, delta: -3 },
    materials: { parent: 1, child: 1, delta: 0 },
  });
  expect(comparison.bounds!.delta!.size).toEqual([0, 0, 0]);
  expect(comparison.geometryIdentical).toBe(true);
  expect(comparison.uvIdentical).toBe(true);
  // 349 characters when written: counts, not per-node pages.
  expect(JSON.stringify(comparison).length).toBeLessThanOrEqual(500);
}, 60_000);

test('a moved vertex reads as a geometry change', async () => {
  const { child } = await saveChild(merged(0.125));
  expect(child.comparison!.geometryIdentical).toBe(false);
  expect(child.comparison!.counts!.triangles).toEqual({ parent: 48, child: 48, delta: 0 });
}, 60_000);

test('equal geometry with a changed UV corner reads as a UV change only', async () => {
  const { child } = await saveChild(merged(0, 0.25));
  expect(child.comparison!.geometryIdentical).toBe(true);
  expect(child.comparison!.uvIdentical).toBe(false);
}, 60_000);

test('a parent that cannot be compared leaves the comparison unavailable, not the save', async () => {
  // A binary-only parent whose one triangle names a vertex its positions do not have.
  const doc = new Document();
  const buffer = doc.createBuffer();
  const primitive = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 5]))
        .setBuffer(buffer),
    );
  doc
    .createScene()
    .addChild(doc.createNode('Broken').setMesh(doc.createMesh().addPrimitive(primitive)));
  // Its build record is a real save's, so only the GLB stands in the way.
  const library = new FileAssetLibrary({ project: root });
  const { parent: saved } = await saveChild(PARENT);
  const { manifest } = await library.read('project', saved.asset.assetId, saved.asset.revisionId);
  const parent = await library.save('project', {
    name: 'Fronds',
    glb: await createGltfIO().writeBinary(doc),
    build: manifest.build!,
  });
  const child = (await tool('kiln_save').run({
    programRef: await retainProgram(programStore, merged()),
    name: 'Fronds',
    assetId: parent.assetId,
    parentRevision: parent.revisionId,
  })) as SaveResult & { ok: boolean };
  expect(child.ok).toBe(true);
  expect(child.comparison).toEqual({
    unavailable:
      'Parent comparison unavailable: Revision comparison requires finite positions and valid indices.',
  });
}, 60_000);

test('kiln_inspect compare carries the same counts and geometry identity', async () => {
  const before = await retainProgram(programStore, PARENT);
  const output = (await tool('kiln_inspect').run({
    code: merged(),
    compare: { programRef: before },
    image: false,
  })) as KilnInspectResult;
  expect(output.ok).toBe(true);
  const comparison = output.comparison! as unknown as Record<string, unknown>;
  expect(comparison['counts']).toEqual({
    triangles: { before: 48, after: 48, delta: 0 },
    vertices: { before: 96, after: 96, delta: 0 },
    drawCalls: { before: 4, after: 1, delta: -3 },
    materials: { before: 1, after: 1, delta: 0 },
  });
  expect(comparison['geometryIdentical']).toBe(true);
  expect(comparison['uvIdentical']).toBe(true);
  expect((comparison['boundsDelta'] as { size: number[] }).size).toEqual([0, 0, 0]);
}, 60_000);
