import { afterEach, expect, test, setSystemTime } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, unzipSync } from 'three/addons/libs/fflate.module.js';
import { FileWorkspace } from './workspace-node';
import { FileAssetLibrary } from './assets-node';
import { createMaterialRecordV1, createMaterialLibraryPayload } from './material-library-node';
import { materialLibraryPortableSpec } from './material-library';
import { renderGLBInProcess } from './render';
import { decodeProjectBundle, encodeProjectBundle } from './project-bundle';
import {
  exportWorkspaceProjectBundle,
  importWorkspaceProjectBundle,
  resolveAssetMaterialPayload,
} from './project-bundle-node';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-project-bundle-'));
  roots.push(root);
  return {
    root,
    workspace: new FileWorkspace(root),
    assets: new FileAssetLibrary({ project: join(root, 'assets', 'kiln') }),
  };
}
async function material(seed: number) {
  return createMaterialRecordV1({
    materialId: 'plaster',
    name: 'Plaster',
    tileable: true,
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
          layers: [{ op: 'noise', colorA: 0x779944, colorB: 0xeeeecc, seed, scale: 4, octaves: 2 }],
        },
      },
    ],
  });
}
async function fixture() {
  const source = await workspace();
  const old = await material(1),
    current = await material(2);
  await source.workspace.materials.import([old, current]);
  const code = `const meta = { name: 'Textured cube' }; async function build() { const root = createRoot('Root'); const material = await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(old.manifest))}); createPart('Body', boxGeo(1,1,1), material, {parent: root}); return root; }`;
  const rendered = await renderGLBInProcess(code, {
    materialResources: await createMaterialLibraryPayload([old]),
  });
  const asset = await source.assets.save('project', {
    assetId: 'cube',
    name: 'Cube',
    code,
    glb: rendered.glb,
    build: {
      engine: 'test',
      options: {},
      warnings: [],
      dependencies: [{ kind: 'kiln.material.v1', delivery: 'runtime', manifest: old.manifest }],
    },
  });
  const project = await source.workspace.projects.create({
    projectId: 'source-project',
    name: 'Source project',
    materialDependencies: [
      {
        resourceId: 'plaster',
        revisionId: current.manifest.revisionId,
        sha256: current.manifest.revisionId,
      },
    ],
    inventory: [
      {
        id: 'cube',
        name: 'Cube',
        asset: { collectionId: 'project', assetId: asset.assetId, revisionId: asset.revisionId },
      },
    ],
  });
  return { ...source, old, current, code, rendered, asset, project };
}

test('editable bundle preserves exact snapshot and dependency union; old asset rebuilds offline after import', async () => {
  const source = await fixture();
  const bytes = await exportWorkspaceProjectBundle(
    source.workspace,
    source.assets,
    source.project.projectId,
  );
  const decoded = await decodeProjectBundle(bytes);
  expect(decoded.manifest.profile).toBe('editable');
  expect(decoded.project).toEqual(source.project);
  expect(decoded.materials).toHaveLength(2);
  const target = await workspace();
  const imported = await importWorkspaceProjectBundle(target.workspace, target.assets, bytes, {
    projectId: 'imported-project',
    collectionId: 'project',
  });
  expect(imported.projectId).toBe('imported-project');
  expect(imported.materialDependencies).toEqual(source.project.materialDependencies);
  expect(imported.reviews).toEqual([]);
  expect(imported.references.some((ref) => ref.uri.startsWith('kiln-import:sha256:'))).toBe(true);
  const importedAsset = await target.assets.read(
    'project',
    source.asset.assetId,
    source.asset.revisionId,
  );
  expect(importedAsset.files['source.kiln.js']).toEqual(new TextEncoder().encode(source.code));
  const payload = await resolveAssetMaterialPayload(target.workspace, importedAsset);
  expect(payload.records.map((record) => record.manifest.revisionId)).toEqual([
    source.old.manifest.revisionId,
  ]);
  const rebuilt = await renderGLBInProcess(source.code, { materialResources: payload });
  expect(rebuilt.artifactGlbSha256).toBe(source.rendered.artifactGlbSha256);
  await expect(
    target.workspace.run({ projectId: imported.projectId }, () =>
      renderGLBInProcess(source.code, {
        materialResources: target.workspace.current()!.materialResources,
      }),
    ),
  ).rejects.toThrow();
  const archiveHash = imported.references.find((ref) => ref.uri.startsWith('kiln-import:sha256:'))!
    .sha256!;
  expect(
    new Uint8Array(
      await readFile(join(target.root, '.kiln', 'imports', `${archiveHash.slice(7)}.zip`)),
    ),
  ).toEqual(Uint8Array.from(bytes));
});

test('runtime delivery is explicitly noneditable with standalone GLBs and metadata; import refuses it', async () => {
  const source = await fixture();
  const bytes = await exportWorkspaceProjectBundle(
    source.workspace,
    source.assets,
    source.project.projectId,
    { profile: 'runtime' },
  );
  const decoded = await decodeProjectBundle(bytes);
  expect(decoded.manifest.profile).toBe('runtime');
  expect(decoded.manifest.editable).toBe(false);
  expect(decoded.materials).toEqual([]);
  const names = Object.keys(unzipSync(bytes));
  expect(names.some((name) => name.endsWith('/runtime.glb'))).toBe(true);
  expect(names.some((name) => name.endsWith('/runtime.kiln-metadata.json'))).toBe(true);
  expect(
    names.some((name) => name.endsWith('source.kiln.js') || name.startsWith('materials/')),
  ).toBe(false);
  const target = await workspace();
  await expect(
    importWorkspaceProjectBundle(target.workspace, target.assets, bytes, {
      projectId: 'runtime-import',
      collectionId: 'project',
    }),
  ).rejects.toThrow('editable');
  expect(await target.workspace.projects.list()).toEqual([]);
});

test('missing locked resources and unclosed saved dependencies fail clearly', async () => {
  const source = await fixture();
  const record = await source.assets.read('project', source.asset.assetId, source.asset.revisionId);
  await rm(
    join(source.workspace.materials.root, 'plaster', source.old.manifest.revisionId.slice(7)),
    { recursive: true },
  );
  await expect(resolveAssetMaterialPayload(source.workspace, record)).rejects.toThrow(
    'Locked asset material unavailable',
  );
  await expect(
    exportWorkspaceProjectBundle(source.workspace, source.assets, source.project.projectId),
  ).rejects.toThrow('Locked asset material unavailable');
  record.manifest.build!.dependencies = [
    { delivery: 'runtime', resourceId: 'unresolved-custom-resource' },
  ];
  await expect(resolveAssetMaterialPayload(source.workspace, record)).rejects.toThrow(
    'Unsupported runtime dependency',
  );
});

test('tampered bytes and unsafe ZIP entries are rejected before any workspace writes', async () => {
  const source = await fixture();
  const bytes = await exportWorkspaceProjectBundle(
    source.workspace,
    source.assets,
    source.project.projectId,
  );
  const files = unzipSync(bytes);
  const sourceFile = Object.keys(files).find((name) => name.endsWith('source.kiln.js'))!;
  files[sourceFile]![0] = files[sourceFile]![0]! ^ 1;
  const target = await workspace();
  await expect(
    importWorkspaceProjectBundle(target.workspace, target.assets, zipSync(files), {
      projectId: 'bad-import',
      collectionId: 'project',
    }),
  ).rejects.toThrow('hash');
  expect(await target.workspace.projects.list()).toEqual([]);
  expect(await target.workspace.materials.list()).toEqual([]);
  const unsafe = zipSync({ '../escape': new Uint8Array([1]) });
  await expect(decodeProjectBundle(unsafe)).rejects.toThrow('Unsafe');
});

test('explicit subsets preserve original snapshot while unselected imported bindings stay unbound', async () => {
  const source = await fixture();
  const second = await source.workspace.projects.update(
    source.project.projectId,
    source.project.revisionId,
    {
      inventory: [
        ...source.project.inventory,
        { id: 'other', name: 'Other', asset: source.project.inventory[0]!.asset },
      ],
    },
  );
  const bytes = await exportWorkspaceProjectBundle(
    source.workspace,
    source.assets,
    second.projectId,
    { inventoryIds: ['cube'] },
  );
  const target = await workspace();
  const imported = await importWorkspaceProjectBundle(target.workspace, target.assets, bytes, {
    projectId: 'subset',
    collectionId: 'project',
  });
  expect(imported.inventory.find((item) => item.id === 'cube')!.asset).toBeDefined();
  expect(imported.inventory.find((item) => item.id === 'other')!.asset).toBeUndefined();
  expect((await decodeProjectBundle(bytes)).project).toEqual(second);
  await expect(
    importWorkspaceProjectBundle(target.workspace, target.assets, bytes, {
      projectId: 'subset',
      collectionId: 'project',
    }),
  ).rejects.toThrow('exists');
  await expect(
    exportWorkspaceProjectBundle(source.workspace, source.assets, second.projectId, {
      inventoryIds: ['missing'],
    }),
  ).rejects.toThrow('inventory');
});

test('flattening collections cannot silently alias different assets with the same identity', async () => {
  const source = await fixture();
  const original = await source.assets.read(
    'project',
    source.asset.assetId,
    source.asset.revisionId,
  );
  const conflicting = structuredClone(original);
  conflicting.manifest.name = 'Different asset with colliding source identity';
  const project = await source.workspace.projects.update(
    source.project.projectId,
    source.project.revisionId,
    {
      inventory: [
        ...source.project.inventory,
        {
          id: 'other',
          name: 'Other',
          asset: { ...source.project.inventory[0]!.asset!, collectionId: 'other' },
        },
      ],
    },
  );
  const bytes = await encodeProjectBundle({
    project,
    materials: [source.old, source.current],
    assets: [
      { inventoryId: 'cube', collectionId: 'project', record: original },
      { inventoryId: 'other', collectionId: 'other', record: conflicting },
    ],
  });
  const target = await workspace();
  await expect(
    importWorkspaceProjectBundle(target.workspace, target.assets, bytes, {
      projectId: 'collision',
      collectionId: 'project',
    }),
  ).rejects.toThrow('identity collision');
  expect(await target.workspace.materials.list()).toEqual([]);
  expect(await target.assets.list('project')).toEqual([]);
});

test('editable roundtrip preserves additional saved asset provenance', async () => {
  const source = await fixture();
  const original = await source.assets.read(
    'project',
    source.asset.assetId,
    source.asset.revisionId,
  );
  Object.assign(original.manifest, {
    customProvenance: { author: 'Example', source: 'retained exactly' },
  });
  const bytes = await encodeProjectBundle({
    project: source.project,
    materials: [source.old, source.current],
    assets: [{ inventoryId: 'cube', collectionId: 'project', record: original }],
  });
  expect((await decodeProjectBundle(bytes)).assets[0]!.record.manifest).toEqual(original.manifest);
});

test('exporting the same immutable project produces the same archive across dates', async () => {
  const source = await fixture();
  let first: Uint8Array;
  try {
    setSystemTime(new Date('2025-01-01T12:00:00Z'));
    first = await exportWorkspaceProjectBundle(
      source.workspace,
      source.assets,
      source.project.projectId,
    );
    setSystemTime(new Date('2027-06-01T12:00:00Z'));
    const second = await exportWorkspaceProjectBundle(
      source.workspace,
      source.assets,
      source.project.projectId,
    );
    expect(second).toEqual(first);
  } finally {
    setSystemTime();
  }
});
