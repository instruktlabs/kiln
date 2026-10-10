import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createKilnOperationToolRegistry } from '../registry';
import { createKilnToolHost } from '../../mcp-engine';
import type { AssetLibrary } from '../../assets';
import type { MaterialLibrary } from '../../material-library';
import hostedSurface from '../../../plugins/kiln-hosted/tool-surface.json';

const assets = {
  collections: () => [{ id: 'project', label: 'Project', writable: true }],
  list: async () => [],
} as unknown as AssetLibrary;
const materials = { list: async () => [] } as unknown as MaterialLibrary;
const context = { assetLibrary: assets, materialLibrary: materials };
const defs = () => createKilnOperationToolRegistry(context);
const find = (name: string) => defs().find((def) => def.name === name)!;

test('public hosted integration snapshot matches the shared operation registry', () => {
  expect(hostedSurface.hostedToolSurface).toBe('kiln.hosted-tools.v2');
  expect([...hostedSurface.tools].sort()).toEqual(
    defs()
      .map((def) => def.name)
      .sort(),
  );
});

test('named presentation preserves capabilities with 21 tools and no unsupported renderer controls', () => {
  const names = defs().map((def) => def.name);
  expect(names).toHaveLength(21);
  expect(new Set(names).size).toBe(21);
  for (const name of [
    'kiln_assets_search',
    'kiln_material_search',
    'kiln_material_create',
    'kiln_capabilities',
  ])
    expect(names).toContain(name);
  for (const name of [
    'kiln_renderer',
    'kiln_renderer_status',
    'kiln_renderer_reprobe',
    'kiln_project',
    'kiln_review',
  ])
    expect(names).not.toContain(name);
});

test('named required inputs are enforced and visible in JSON schemas', async () => {
  for (const [name, field] of [
    ['kiln_assets_get', 'assetId'],
    ['kiln_assets_restore', 'assetId'],
    ['kiln_material_get', 'materialId'],
    ['kiln_material_import', 'payload'],
  ]) {
    const def = find(name!);
    expect(z.toJSONSchema(def.inputSchema, { io: 'input' }).required).toContain(field);
    await expect(def.run({})).rejects.toThrow();
  }
});

test('asset search normalizes collection identity without changing local list defaults', async () => {
  expect(await find('kiln_assets_search').run({ collection: 'project' })).toEqual({
    errors: [],
    total: 0,
    nextOffset: null,
    assets: [],
  });
  await expect(find('kiln_assets_search').run({ collection: '' })).rejects.toThrow();
  await expect(find('kiln_assets_search').run({ collection: 'missing' })).rejects.toThrow();
  const legacy = createKilnToolHost(context).defs.find((def) => def.name === 'kiln_assets')!;
  expect(await legacy.run({ action: 'list' })).toMatchObject({ collection: 'project' });
});

test('material browsing keeps recipe and saved identities distinct', async () => {
  const result = (await find('kiln_material_search').run({ scope: 'presets' })) as {
    presets: { kind: string }[];
    materials: unknown[];
  };
  expect(result.presets.length).toBeGreaterThan(0);
  expect(result.presets.every((entry) => entry.kind === 'preset')).toBe(true);
  expect(result.materials).toEqual([]);
  expect(await find('kiln_material_search').run({ scope: 'saved' })).toEqual({
    ok: true,
    presets: [],
    materials: [],
  });
});

test('material creation exposes nested variants and rejects incomplete or widened definitions', () => {
  const schema = find('kiln_material_create').inputSchema;
  const json = z.toJSONSchema(schema, { io: 'input' });
  expect(json.type).toBe('object');
  expect(json.required).toEqual(['definition']);
  expect(JSON.stringify(json.properties?.definition)).toContain('presetId');
  expect(schema.safeParse({ definition: { kind: 'preset', presetId: 'wood' } }).success).toBe(
    false,
  );
  expect(schema.safeParse({ definition: { kind: 'procedural' } }).success).toBe(false);
  expect(
    schema.safeParse({ definition: { kind: 'procedural', draft: {}, action: 'import' } }).success,
  ).toBe(false);
});

test('MCP presentation is explicitly selected; grouped tools remain the default', () => {
  expect(createKilnToolHost(context).defs.map((def) => def.name)).toContain('kiln_material');
  expect(
    createKilnToolHost(context, { toolPresentation: 'operations' }).defs.map((def) => def.name),
  ).toEqual(defs().map((def) => def.name));
});

test('named discovery and capabilities only recommend available calls', async () => {
  const caps = await find('kiln_capabilities').run({});
  expect(JSON.stringify(caps)).not.toMatch(/kiln_project|kiln_assets action=restore/);
  expect(JSON.stringify(caps)).toContain('kiln_assets_restore');
  const overview = await find('kiln_discover').run({});
  expect(JSON.stringify(overview)).not.toContain('capabilities:true');
  expect(JSON.stringify(overview)).toContain('kiln_capabilities');
});

test('named searches preserve collection identity and partial failures', async () => {
  const library = {
    ...assets,
    collections: () => [
      { id: 'project', label: 'Project' },
      { id: 'other', label: 'Other' },
    ],
    list: async (collection: string) => {
      if (collection === 'other') throw new Error('Unavailable collection');
      return [
        {
          assetId: 'one',
          revisionId: 'r1',
          name: 'One',
          tags: [],
          editable: true,
          createdAt: '2026-10-09',
        },
      ];
    },
  } as unknown as AssetLibrary;
  const search = createKilnOperationToolRegistry({ ...context, assetLibrary: library }).find(
    (def) => def.name === 'kiln_assets_search',
  )!;
  const all = (await search.run({})) as { assets: unknown[]; errors: unknown[]; total: number };
  expect(all.total).toBe(1);
  expect(all.assets[0]).toMatchObject({ collection: 'project', assetId: 'one', revisionId: 'r1' });
  expect(all.errors).toHaveLength(1);
  expect(await search.run({ collection: 'project' })).toMatchObject({
    assets: all.assets,
    errors: [],
  });
});

test('missing saved resources give recovery calls from the selected presentation', async () => {
  await expect(find('kiln_material_get').run({ materialId: 'missing' })).rejects.toThrow(
    'kiln_material_search',
  );
  await expect(find('kiln_assets_get').run({ assetId: 'missing' })).rejects.toThrow(
    'kiln_assets_search',
  );
});

test('named embeddings only advertise persistence operations with the corresponding storage', () => {
  const bare = createKilnOperationToolRegistry().map((def) => def.name);
  for (const name of [
    'kiln_save',
    'kiln_present',
    'kiln_export',
    'kiln_import',
    'kiln_assets_search',
    'kiln_material_create',
  ])
    expect(bare).not.toContain(name);
  expect(bare).toContain('kiln_render');
  expect(bare).toContain('kiln_capabilities');
});
