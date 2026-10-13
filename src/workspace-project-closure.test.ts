import { afterEach, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWorkspace } from './workspace-node';
import { FileAssetLibrary } from './assets-node';
import { createMaterialRecordV2 } from './material-library-node';
import { decodeProjectBundle, encodeProjectBundle } from './project-bundle';
import { exportWorkspaceProjectBundle, importWorkspaceProjectBundle } from './project-bundle-node';
import { zipSync, unzipSync } from 'three/addons/libs/fflate.module.js';
import {
  canonicalMaterialJson,
  materialLibraryResourceId,
  type MaterialManifestV1,
} from './material-library';
import type { ProjectRevision } from './projects';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function control() {
  const raw = JSON.parse(
    await readFile(
      new URL('./__tests__/fixtures/project-closure-v1.json', import.meta.url),
      'utf8',
    ),
  ) as {
    project: ProjectRevision;
    materials: { manifest: MaterialManifestV1; files: Record<string, string> }[];
  };
  return {
    project: raw.project,
    materials: raw.materials.map((r) => ({
      manifest: r.manifest,
      files: Object.fromEntries(
        Object.entries(r.files).map(([k, v]) => [k, new Uint8Array(Buffer.from(v, 'base64'))]),
      ),
    })),
  };
}
async function host(defaultProject?: string) {
  const root = await mkdtemp(join(tmpdir(), 'kiln-project-closure-'));
  roots.push(root);
  return {
    root,
    workspace: new FileWorkspace(root, defaultProject),
    assets: new FileAssetLibrary({ project: join(root, 'assets') }),
  };
}
const pin = (manifest: { materialId: string; revisionId: string }) => ({
  resourceId: manifest.materialId,
  revisionId: manifest.revisionId,
  sha256: manifest.revisionId,
});
async function dependentFixture() {
  const fixture = await control();
  const child = fixture.materials[1]!;
  const sampler = {
    minFilter: 'linear-mipmap-linear',
    magFilter: 'linear',
    wrapS: 'clamp-to-edge',
    wrapT: 'clamp-to-edge',
  };
  const atlas = await createMaterialRecordV2(
    {
      schemaVersion: 2,
      materialId: 'atlas-owner',
      name: 'Atlas owner',
      tileable: false,
      sources: child.manifest.sources,
      maps: [
        {
          slot: 'baseColor',
          sourceId: 'authored',
          transforms: [],
          sampler,
          atlas: {
            schemaVersion: 1,
            width: 4,
            height: 4,
            usage: 'albedo',
            sampler,
            regions: [
              {
                name: 'wood',
                content: { x: 0, y: 0, width: 4, height: 4 },
                gutter: 0,
                edgeMode: 'copy-edge',
                source: {
                  kind: 'resource',
                  resourceId: materialLibraryResourceId(child.manifest, 'baseColor'),
                  pin: pin(child.manifest),
                },
              },
            ],
          },
        },
      ],
    },
    { materials: [child] },
  );
  return { ...fixture, atlas };
}
function revise(manifest: MaterialManifestV1): MaterialManifestV1 {
  const { revisionId: _, ...payload } = manifest;
  return {
    ...payload,
    revisionId: `sha256:${createHash('sha256').update(canonicalMaterialJson(payload)).digest('hex')}`,
  };
}
test('all-V1 whole project archive retains the qualified byte fixture and older/newer identity order', async () => {
  const fixture = await control();
  const bytes = await encodeProjectBundle({ ...fixture, assets: [] });
  expect(bytes.length).toBe(5920);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '13ad6c74ef5e43295cd6e83bd111a6a8833ef25191e785babc97a26c26520705',
  );
  const decoded = await decodeProjectBundle(bytes);
  expect(decoded.manifest.version).toBe('kiln.project-bundle.v1');
  expect(decoded.materials.map((r) => r.manifest.revisionId)).toEqual(
    fixture.materials.map((r) => r.manifest.revisionId),
  );
  expect(new Set(decoded.materials.map((r) => r.manifest.materialId))).toEqual(new Set(['wood']));
});
test('workspace root metadata rejects aggregate bytes before any full record read or evaluation', async () => {
  const { materials } = await control();
  const root = await mkdtemp(join(tmpdir(), 'kiln-manifest-admission-'));
  roots.push(root);
  const workspace = new FileWorkspace(root);
  const manifests = Array.from({ length: 3 }, (_, i) =>
    revise({
      ...structuredClone(materials[0]!.manifest),
      materialId: `large-${i}`,
      maps: [{ ...materials[0]!.manifest.maps[0]!, bytes: 8 * 1024 * 1024 }],
    }),
  );
  let fullReads = 0;
  Object.assign(workspace.materials, {
    readManifest: async (id: string) => manifests.find((m) => m.materialId === id)!,
    readRecordFiles: async () => {
      fullReads++;
      throw Error('FILE_READ_BEFORE_ADMISSION');
    },
  });
  const read = spyOn(workspace.materials, 'read').mockImplementation(async () => {
    throw Error('FULL_READ_BEFORE_ADMISSION');
  });
  let evaluated = false;
  try {
    await expect(
      workspace.run(
        {
          projectId: null,
          materialDependencies: manifests.map((m) => ({
            resourceId: m.materialId,
            revisionId: m.revisionId,
            sha256: m.revisionId,
          })),
        },
        async () => {
          evaluated = true;
        },
      ),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(fullReads).toBe(0);
    expect(evaluated).toBe(false);
  } finally {
    read.mockRestore();
  }
});
test('workspace keeps new root and old transitive revisions of one ID and standalone overrides configured context', async () => {
  const { materials, atlas } = await dependentFixture();
  const target = await host('configured');
  await target.workspace.materials.import([...materials, atlas], {
    materials: [...materials, atlas],
  });
  await target.workspace.projects.create({
    projectId: 'configured',
    name: 'Configured',
    materialDependencies: [pin(materials[0]!.manifest), pin(atlas.manifest)],
  });
  await target.workspace.run({}, async () => {
    const binding = target.workspace.current()!;
    expect(binding.materialDependencies).toHaveLength(2);
    expect(binding.materialResources.schemaVersion).toBe(2);
    expect(new Set(binding.materialResources.records.map((r) => r.manifest.revisionId))).toEqual(
      new Set([...materials, atlas].map((r) => r.manifest.revisionId)),
    );
    const standalone = await target.workspace.run(
      { projectId: null, materialDependencies: [pin(atlas.manifest)] },
      async () => target.workspace.current(),
    );
    expect(standalone?.project).toBeUndefined();
    expect(standalone?.materialDependencies).toEqual([pin(atlas.manifest)]);
    expect(
      new Set(standalone?.materialResources.records.map((r) => r.manifest.revisionId)),
    ).toEqual(new Set([atlas.manifest.revisionId, materials[1]!.manifest.revisionId]));
    expect(target.workspace.current()?.project?.projectId).toBe('configured');
  });
  expect((await target.workspace.projects.list()).map((p) => p.projectId)).toEqual(['configured']);
  const archive = await exportWorkspaceProjectBundle(target.workspace, target.assets, 'configured');
  const archived = await decodeProjectBundle(archive);
  expect(archived.manifest.version).toBe('kiln.project-bundle.v2');
  expect(new Set(archived.materials.map((r) => r.manifest.revisionId))).toEqual(
    new Set([...materials, atlas].map((r) => r.manifest.revisionId)),
  );
});
test('missing transitive source prevents project export before source file reads', async () => {
  const { materials, atlas } = await dependentFixture();
  const target = await host();
  await target.workspace.materials.import([...materials, atlas], {
    materials: [...materials, atlas],
  });
  const project = await target.workspace.projects.create({
    projectId: 'missing-source-export',
    name: 'Missing source',
    materialDependencies: [pin(atlas.manifest), pin(materials[0]!.manifest)],
  });
  const original = target.workspace.materials.readManifest.bind(target.workspace.materials);
  const metadata = spyOn(target.workspace.materials, 'readManifest').mockImplementation(
    async (id, revision) => {
      if (
        id === materials[1]!.manifest.materialId &&
        revision === materials[1]!.manifest.revisionId
      )
        throw Error('missing exact source');
      return original(id, revision);
    },
  );
  const full = spyOn(target.workspace.materials, 'readRecordFiles');
  try {
    await expect(
      exportWorkspaceProjectBundle(target.workspace, target.assets, project.projectId),
    ).rejects.toThrow('material unavailable');
    expect(full).not.toHaveBeenCalled();
  } finally {
    metadata.mockRestore();
    full.mockRestore();
  }
});
test('mixed project bundle uses V2 and preserves exact atlas source closure offline', async () => {
  const { project, materials, atlas } = await dependentFixture();
  const bytes = await encodeProjectBundle({
    project,
    materials: [...materials, atlas],
    assets: [],
  });
  const decoded = await decodeProjectBundle(bytes);
  expect(decoded.manifest.version).toBe('kiln.project-bundle.v2');
  expect(decoded.materials.map((r) => r.manifest.revisionId)).toEqual(
    [...materials, atlas].map((r) => r.manifest.revisionId),
  );
  const target = await host();
  await importWorkspaceProjectBundle(target.workspace, target.assets, bytes, {
    projectId: 'imported-closure',
    collectionId: 'project',
  });
  expect(
    (await target.workspace.materials.read(atlas.manifest.materialId, atlas.manifest.revisionId))
      .manifest,
  ).toEqual(atlas.manifest);
  expect(
    (await target.workspace.materials.read('wood', materials[1]!.manifest.revisionId)).files,
  ).toEqual(materials[1]!.files);
});
test('missing transitive child and mislabelled V1 envelope reject before material or project publication', async () => {
  const { project, materials, atlas } = await dependentFixture();
  const bytes = await encodeProjectBundle({
    project,
    materials: [...materials, atlas],
    assets: [],
  });
  const files = unzipSync(bytes);
  const manifest = JSON.parse(new TextDecoder().decode(files['bundle.json']!));
  const old = materials[1]!.manifest;
  const prefix = `materials/${old.materialId}/${old.revisionId.slice(7)}/`;
  for (const path of Object.keys(files))
    if (path.startsWith(prefix)) {
      delete files[path];
      delete manifest.files[path];
    }
  manifest.materials = manifest.materials.filter(
    (m: { revisionId: string }) => m.revisionId !== old.revisionId,
  );
  files['bundle.json'] = new TextEncoder().encode(JSON.stringify(manifest));
  const target = await host();
  await expect(
    importWorkspaceProjectBundle(target.workspace, target.assets, zipSync(files), {
      projectId: 'missing-child',
      collectionId: 'project',
    }),
  ).rejects.toThrow('transitive');
  const versionFiles = unzipSync(bytes),
    versionManifest = JSON.parse(new TextDecoder().decode(versionFiles['bundle.json']!));
  versionManifest.version = 'kiln.project-bundle.v1';
  versionFiles['bundle.json'] = new TextEncoder().encode(JSON.stringify(versionManifest));
  await expect(
    importWorkspaceProjectBundle(target.workspace, target.assets, zipSync(versionFiles), {
      projectId: 'mislabelled',
      collectionId: 'project',
    }),
  ).rejects.toThrow();
  expect(await target.workspace.projects.list()).toEqual([]);
  expect(await target.workspace.materials.list()).toEqual([]);
});
test('project archive permits seventeen exact materials while evaluation keeps its sixteen-record limit', async () => {
  const { materials } = await control();
  const records = Array.from({ length: 17 }, (_, i) => ({
    manifest: revise({ ...structuredClone(materials[0]!.manifest), materialId: `material-${i}` }),
    files: materials[0]!.files,
  }));
  const target = await host();
  await target.workspace.materials.import(records);
  const project = await target.workspace.projects.create({
    projectId: 'many-materials',
    name: 'Many materials',
    materialDependencies: records.map((r) => pin(r.manifest)),
  });
  const bytes = await exportWorkspaceProjectBundle(
    target.workspace,
    target.assets,
    project.projectId,
  );
  expect((await decodeProjectBundle(bytes)).materials).toHaveLength(17);
  let ran = false;
  await expect(
    target.workspace.run({ projectId: project.projectId }, async () => {
      ran = true;
    }),
  ).rejects.toThrow('at most 16');
  expect(ran).toBe(false);
});
test('duplicate compound identity with conflicting content rejects at the project bundle boundary', async () => {
  const { project, materials, atlas } = await dependentFixture();
  const conflicting = structuredClone(atlas);
  conflicting.manifest.name = 'Conflicting owner';
  await expect(
    encodeProjectBundle({ project, materials: [...materials, atlas, conflicting], assets: [] }),
  ).rejects.toThrow('Duplicate material');
});
