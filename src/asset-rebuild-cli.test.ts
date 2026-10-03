import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FileWorkspace } from './workspace-node';
import { FileAssetLibrary } from './assets-node';
import { createMaterialPresetDraft } from './material-presets';
import { createMaterialLibraryPayload, createMaterialRecordV1 } from './material-library-node';
import { materialLibraryPortableSpec } from './material-library';
import { renderGLBInProcess } from './render';
import { exportWorkspaceProjectBundle, importWorkspaceProjectBundle } from './project-bundle-node';

test('CLI rebuild after project import uses exact saved source/options/materials despite newer project defaults', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-rebuild-cli-'));
  try {
    const source = new FileWorkspace(join(root, 'source'));
    const target = new FileWorkspace(join(root, 'target'));
    const library = (workspace: FileWorkspace) =>
      new FileAssetLibrary({ project: join(workspace.root, 'assets', 'kiln') });
    const preset = {
      materialId: 'brick',
      creator: 'Test fixture',
      size: 64 as const,
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: '',
      },
    };
    const old = await createMaterialRecordV1(
      createMaterialPresetDraft('warm-brick', { ...preset, seed: 1 }),
    );
    const newer = await createMaterialRecordV1(
      createMaterialPresetDraft('warm-brick', { ...preset, seed: 2 }),
    );
    await source.materials.import([old, newer]);
    const code = `const meta={name:'Brick cube'}; async function build(){const root=createRoot('Root');const material=await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(old.manifest))});createPart('Body',boxGeo(1,1,1),material,{parent:root});return root;}`;
    const result = await renderGLBInProcess(code, {
      gltfExporter: 'legacy',
      optimize: 'off',
      instance: 'off',
      materialResources: await createMaterialLibraryPayload([old]),
    });
    const asset = await library(source).save('project', {
      name: 'Brick',
      code,
      glb: result.glb,
      build: {
        engine: 'fixture',
        options: { ...result.rebuildOptions, requirements: result.requirements },
        dependencies: [{ kind: 'kiln.material.v1', delivery: 'runtime', manifest: old.manifest }],
        warnings: [],
      },
    });
    await source.projects.create({
      projectId: 'pilot',
      name: 'Pilot',
      materialDependencies: [
        {
          resourceId: 'brick',
          revisionId: newer.manifest.revisionId,
          sha256: newer.manifest.revisionId,
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
    await importWorkspaceProjectBundle(
      target,
      library(target),
      await exportWorkspaceProjectBundle(source, library(source), 'pilot'),
      { projectId: 'imported', collectionId: 'project' },
    );
    const output = join(root, 'rebuilt.glb');
    const run = () =>
      spawnSync(
        process.execPath,
        [
          resolve('src/cli.ts'),
          'asset',
          asset.assetId,
          asset.revisionId,
          '--rebuild',
          '--out',
          output,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            KILN_WORKSPACE: target.root,
            KILN_PROJECT: 'deliberately-unavailable-default',
            KILN_PROGRAM_STORE: '',
            KILN_COLLECTIONS: '',
            KILN_EVALUATOR_MODE: 'in-process',
            KILN_BUILD_CACHE: 'memory',
            KILN_RENDER: 'cpu',
            KILN_BAKE_INSTANCE: 'on',
            KILN_BAKE_OPTIMIZE: 'full',
          },
          encoding: 'utf8',
          windowsHide: true,
        },
      );
    const rebuilt = run();
    expect(rebuilt.status, rebuilt.stderr).toBe(0);
    expect(JSON.parse(rebuilt.stdout).matchesSavedArtifact).toBe(true);
    expect(new Uint8Array(await readFile(output))).toEqual(Uint8Array.from(result.glb));
    expect(run().status).toBe(1);
    expect(new Uint8Array(await readFile(output))).toEqual(Uint8Array.from(result.glb));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);

for (const versioned of [false, true]) {
  test(`CLI full rebuild ${versioned ? 'replays a versioned artifact exactly' : 'refuses an unversioned legacy pipeline before writing'}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiln-full-rebuild-cli-'));
    try {
      const workspace = new FileWorkspace(root);
      const library = new FileAssetLibrary({ project: join(root, 'assets', 'kiln') });
      const code = `const meta={name:'Pair'}; function build(){const r=createRoot('Root');const m=gameMaterial(0x888888);createPart('A',boxGeo(1,1,1),m,{parent:r});createPart('B',boxGeo(1,1,1),m,{parent:r,position:[1,0,0]});return r;}`;
      const rendered = await renderGLBInProcess(code, { optimize: 'full', instance: 'off' });
      const { optimizationPipeline, ...olderOptions } = rendered.rebuildOptions!;
      expect(optimizationPipeline).toBe('rigid-v1');
      const asset = await library.save('project', {
        name: 'Pair',
        code,
        glb: rendered.glb,
        build: {
          engine: 'fixture',
          warnings: [],
          options: {
            ...(versioned ? rendered.rebuildOptions : olderOptions),
            requirements: rendered.requirements,
          },
        },
      });
      const output = join(root, 'rebuilt.glb');
      const rebuilt = spawnSync(
        process.execPath,
        [
          resolve('src/cli.ts'),
          'asset',
          asset.assetId,
          asset.revisionId,
          '--rebuild',
          '--out',
          output,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            KILN_WORKSPACE: workspace.root,
            KILN_PROJECT: '',
            KILN_PROGRAM_STORE: '',
            KILN_COLLECTIONS: '',
            KILN_EVALUATOR_MODE: 'in-process',
            KILN_BUILD_CACHE: 'memory',
            KILN_RENDER: 'cpu',
          },
          encoding: 'utf8',
          windowsHide: true,
        },
      );
      if (versioned) {
        expect(rebuilt.status, rebuilt.stderr).toBe(0);
        expect(JSON.parse(rebuilt.stdout).matchesSavedArtifact).toBe(true);
        expect(new Uint8Array(await readFile(output))).toEqual(Uint8Array.from(rendered.glb));
      } else {
        expect(rebuilt.status, rebuilt.stderr).toBe(1);
        expect(rebuilt.stderr).toContain('unversioned full optimization pipeline');
        await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20000);
}
