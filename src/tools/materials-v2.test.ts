import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKilnMaterialDef } from './materials';
import { createKilnOperationToolRegistry } from './registry';
import {
  FileMaterialLibrary,
  createMaterialLibraryPayload,
  createMaterialRecordV2,
} from '../material-library-node';
import {
  materialLibraryResourceId,
  type MaterialLibrary,
  type MaterialManifest,
} from '../material-library';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function library() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-material-tools-v2-'));
  roots.push(root);
  return new FileMaterialLibrary(root);
}
const sampler = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'clamp-to-edge',
  wrapT: 'clamp-to-edge',
} as const;
const draft = {
  schemaVersion: 2,
  materialId: 'pixel-leaf',
  name: 'Pixel leaf',
  tileable: false,
  sources: [
    {
      id: 'authored',
      kind: 'procedural',
      provider: 'Kiln',
      creator: 'Fixture author',
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
      sampler,
      procedural: {
        schemaVersion: 3,
        width: 4,
        height: 8,
        usage: 'albedo',
        background: [20, 60, 30, 0],
        operations: [
          {
            op: 'paint',
            shape: { kind: 'rectangle', x: 1, y: 1, width: 2, height: 6 },
            rgba: [40, 90, 30, 255],
          },
        ],
      },
    },
  ],
};
function atlasDraft(manifest: MaterialManifest, missing = false) {
  const pin = {
    resourceId: manifest.materialId,
    revisionId: manifest.revisionId,
    sha256: manifest.revisionId,
  };
  const source = {
    kind: 'resource',
    pin,
    resourceId: materialLibraryResourceId(manifest, 'baseColor'),
  };
  return {
    ...draft,
    materialId: 'leaf-atlas',
    name: 'Leaf atlas',
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        sampler,
        atlas: {
          schemaVersion: 1,
          width: 16,
          height: 16,
          usage: 'albedo',
          sampler,
          regions: [
            {
              name: 'leaf',
              content: { x: 2, y: 2, width: 4, height: 8 },
              source,
              edgeMode: 'mask-rgb-dilate',
            },
            ...(missing
              ? [
                  {
                    name: 'absent',
                    content: { x: 10, y: 2, width: 4, height: 8 },
                    source: { ...source, pin: { ...pin, resourceId: 'absent' } },
                  },
                ]
              : []),
          ],
        },
      },
    ],
  };
}

test('grouped and named creation accept rectangular RGBA recipes and exact pinned atlas sources standalone', async () => {
  const store = await library();
  const tool = createKilnMaterialDef(store);
  const named = createKilnOperationToolRegistry({ materialLibrary: store }).find(
    (def) => def.name === 'kiln_material_create',
  )!;
  const result = (await tool.run({ action: 'create-procedural', draft })) as {
    material: MaterialManifest;
    portableSpec: { schemaVersion: number };
  };
  expect(result.material.schemaVersion).toBe(2);
  expect(result.material.maps[0]).toMatchObject({ width: 4, height: 8, sampler });
  expect(result.portableSpec.schemaVersion).toBe(3);
  expect(await named.run({ definition: { kind: 'procedural', draft } })).toEqual(result);
  const sheet = atlasDraft(result.material);
  const atlas = (await named.run({
    definition: { kind: 'procedural', draft: sheet },
  })) as typeof result;
  expect(await tool.run({ action: 'create-procedural', draft: sheet })).toEqual(atlas);
  expect(atlas.material).toHaveProperty('dependencies', [
    {
      resourceId: result.material.materialId,
      revisionId: result.material.revisionId,
      sha256: result.material.revisionId,
    },
  ]);
  expect(atlas.material.maps[0]).toHaveProperty('recipe.kind', 'atlas');
  const records = await Promise.all(
    [atlas.material, result.material].map((m) => store.read(m.materialId, m.revisionId)),
  );
  const payload = await createMaterialLibraryPayload(records);
  const destination = await library();
  await createKilnMaterialDef(destination).run({ action: 'import', payload });
  expect(await destination.read(atlas.material.materialId, atlas.material.revisionId)).toEqual(
    records[0]!,
  );
});

test('missing exact atlas source is rejected before any PNG read or import, including when another source exists', async () => {
  const original = await createMaterialRecordV2(draft);
  let bytesRead = 0,
    imports = 0;
  const store: MaterialLibrary = {
    list: async () => [original.manifest],
    readManifest: async (id) => {
      if (id === 'absent') throw Error('missing pinned source');
      return original.manifest;
    },
    read: async () => {
      bytesRead++;
      return original;
    },
    import: async () => {
      imports++;
      return [];
    },
  };
  await expect(
    createKilnMaterialDef(store).run({
      action: 'create-procedural',
      draft: atlasDraft(original.manifest, true),
    }),
  ).rejects.toThrow('missing pinned source');
  expect(bytesRead).toBe(0);
  expect(imports).toBe(0);
});

test('new authoring rejects unresolved libraries, changed exact identities and non-JSON file inputs', async () => {
  const original = await createMaterialRecordV2(draft);
  let reads = 0;
  const store: MaterialLibrary = {
    list: async () => [original.manifest],
    read: async () => {
      reads++;
      return original;
    },
    import: async () => [],
  };
  const tool = createKilnMaterialDef(store);
  await expect(
    tool.run({ action: 'create-procedural', draft: atlasDraft(original.manifest) }),
  ).rejects.toThrow('readManifest');
  store.readManifest = async () => ({ ...original.manifest, materialId: 'another' });
  await expect(
    tool.run({ action: 'create-procedural', draft: atlasDraft(original.manifest) }),
  ).rejects.toThrow(/pin|identity/);
  await expect(
    tool.run({
      action: 'create-procedural',
      draft: { ...draft, maps: [{ ...draft.maps[0], bytes: [1, 2, 3] }] },
    }),
  ).rejects.toThrow();
  expect(reads).toBe(0);
});
