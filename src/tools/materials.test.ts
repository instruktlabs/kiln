import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { FileMaterialLibrary, createMaterialLibraryPayload } from '../material-library-node';
import { createKilnMaterialDef, materialToolInput } from './materials';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const draft = {
  materialId: 'mortar',
  name: 'Warm mortar',
  tileable: true,
  tags: ['architecture'],
  sources: [
    {
      id: 'authored',
      kind: 'procedural',
      provider: 'Kiln',
      creator: 'Test author',
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: '',
      },
      originalFiles: [],
    },
  ],
  maps: [
    {
      slot: 'baseColor',
      sourceId: 'authored',
      transforms: [],
      procedural: {
        schemaVersion: 2,
        size: 8,
        usage: 'albedo',
        layers: [{ op: 'noise', colorA: 0xddddcc, colorB: 0xeeeecc, seed: 11 }],
      },
    },
  ],
};
async function library() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-material-tools-'));
  roots.push(root);
  return new FileMaterialLibrary(root);
}
test('material tool creates repeatable recipes, lists summaries and reads code-ready portable specs', async () => {
  const store = await library();
  const tool = createKilnMaterialDef(store);
  expect(tool.name).toBe('kiln_material');
  const result = (await tool.run({ action: 'create-procedural', draft })) as {
    material: { materialId: string; revisionId: string };
    portableSpec: unknown;
  };
  expect(result.material.materialId).toBe('mortar');
  expect(await tool.run({ action: 'create-procedural', draft })).toEqual(result);
  const list = (await tool.run({ action: 'list', tag: 'architecture' })) as {
    materials: unknown[];
  };
  expect(list.materials).toHaveLength(1);
  expect(JSON.stringify(list)).not.toContain('pixelHash');
  const read = await tool.run({
    action: 'get',
    materialId: 'mortar',
    revisionId: result.material.revisionId,
  });
  expect(read).toEqual(result);
});
test('material import accepts only complete normalized data and remains usable offline', async () => {
  const from = await library();
  const sourceTool = createKilnMaterialDef(from);
  await sourceTool.run({ action: 'create-procedural', draft });
  const manifest = (await from.list())[0]!;
  const record = await from.read(manifest.materialId, manifest.revisionId);
  const payload = await createMaterialLibraryPayload([record]);
  const to = await library();
  const targetTool = createKilnMaterialDef(to);
  await targetTool.run({ action: 'import', payload });
  expect(await to.read(manifest.materialId, manifest.revisionId)).toEqual(record);
  await expect(targetTool.run({ action: 'import', path: '../arbitrary-file' })).rejects.toThrow();
  const corrupted = structuredClone(payload);
  corrupted.records[0]!.files['baseColor.png'] = 'bad';
  await expect(targetTool.run({ action: 'import', payload: corrupted })).rejects.toThrow();
});
test('material tool schema is serializable for MCP and has closed operations', () => {
  expect(() => z.toJSONSchema(materialToolInput)).not.toThrow();
  expect(() =>
    materialToolInput.parse({ action: 'download', url: 'https://example.com/file' }),
  ).toThrow();
});

test('material tools discover and instantiate shipped presets without external paths', async () => {
  const tool = createKilnMaterialDef(await library());
  const catalog = (await tool.run({ action: 'presets', tag: 'wood' })) as {
    presets: { id: string }[];
  };
  expect(catalog.presets).toHaveLength(1);
  const input = {
    action: 'create-preset',
    presetId: catalog.presets[0]!.id,
    seed: 7,
    size: 64,
    creator: 'Test author',
    license: draft.sources[0]!.license,
  };
  const result = (await tool.run(input)) as { material: { materialId: string } };
  expect(result.material.materialId).toBe('wood-grain');
  expect(await tool.run(input)).toEqual(result);
});
