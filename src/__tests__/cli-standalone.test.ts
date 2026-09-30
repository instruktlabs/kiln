import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FileWorkspace } from '../workspace-node';
import { FileLiveReview } from '../live-review-node';
import { FileAssetLibrary } from '../assets-node';
import { createMaterialRecordV1 } from '../material-library-node';
import { materialLibraryPortableSpec } from '../material-library';

test('compiled CLI renders and saves standalone textured assets with zero, one or multiple projects', async () => {
  await mkdir(resolve('tmp'), { recursive: true });
  const root = await mkdtemp(resolve('tmp/cli-standalone-'));
  try {
    const build = await Bun.build({
      entrypoints: [resolve('src/cli.ts')],
      target: 'node',
      packages: 'external',
      outdir: root,
      naming: 'cli.mjs',
    });
    expect(build.success).toBe(true);
    const workspace = new FileWorkspace(root);
    const record = await createMaterialRecordV1({
      materialId: 'standalone-plaster',
      name: 'Standalone plaster',
      tileable: true,
      sources: [
        {
          id: 'authored',
          kind: 'procedural',
          provider: 'Kiln',
          creator: 'Fixture',
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
            usage: 'albedo',
            size: 8,
            layers: [{ op: 'noise', colorA: 0xaaaaaa, colorB: 0xffffff, seed: 1 }],
          },
        },
      ],
    });
    await workspace.materials.import([record]);
    const pins = [
      {
        resourceId: record.manifest.materialId,
        revisionId: record.manifest.revisionId,
        sha256: record.manifest.revisionId,
      },
    ];
    await writeFile(join(root, 'materials.json'), JSON.stringify(pins));
    await writeFile(
      join(root, 'source.js'),
      `const meta={name:'Standalone'};async function build(){const r=createRoot('Root');const m=await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(record.manifest))});createPart('Box',boxGeo(1,1,1),m,{parent:r});return r;}`,
    );
    const env = {
      ...process.env,
      KILN_WORKSPACE: root,
      KILN_PROJECT: '',
      KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
      KILN_RENDER: 'cpu',
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_BUILD_CACHE: 'off',
      KILN_LIVE_REVIEW: 'on',
      KILN_COLLECTIONS: JSON.stringify({ project: join(root, 'assets') }),
    };
    const run = (...args: string[]) =>
      Bun.spawnSync(['node', join(root, 'cli.mjs'), ...args], {
        cwd: root,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20000,
      });
    let expectedHash: string | undefined;
    for (let projectCount = 0; projectCount <= 2; projectCount++) {
      if (projectCount)
        await workspace.projects.create({
          projectId: `project-${projectCount}`,
          name: `Project ${projectCount}`,
          materialDependencies: [
            {
              resourceId: 'deliberately-unavailable',
              revisionId: `sha256:${'0'.repeat(64)}`,
              sha256: `sha256:${'0'.repeat(64)}`,
            },
          ],
        });
      const output = run(
        'render',
        'source.js',
        '--materials',
        'materials.json',
        '--out',
        'asset.glb',
        '--render',
        'cpu',
        '--json',
      );
      expect(output.exitCode, output.stderr.toString() + output.stdout.toString()).toBe(0);
      const receipt = JSON.parse(output.stdout.toString());
      expect(receipt.projectId).toBeUndefined();
      expect(receipt.projectRevision).toBeUndefined();
      expectedHash ??= receipt.artifactGlbSha256;
      expect(receipt.artifactGlbSha256).toBe(expectedHash);
      const glb = await readFile(join(root, 'asset.glb'));
      const document = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
      expect(document.images).toHaveLength(1);
      expect(document.images[0].bufferView).toBeNumber();
    }
    env.KILN_PROJECT = 'project-1';
    const configured = run(
      'render',
      'source.js',
      '--materials',
      'materials.json',
      '--out',
      'default.glb',
      '--json',
    );
    expect(configured.exitCode).toBe(1);
    expect(configured.stdout.toString()).toContain('Locked material unavailable');
    const saved = run(
      'save',
      'source.js',
      '--materials',
      'materials.json',
      '--no-project',
      '--name',
      'Independent',
      '--render',
      'cpu',
    );
    expect(saved.exitCode, saved.stderr.toString() + saved.stdout.toString()).toBe(0);
    const identity = JSON.parse(saved.stdout.toString()).asset;
    const { manifest: asset } = await new FileAssetLibrary({ project: join(root, 'assets') }).read(
      'project',
      identity.assetId,
      identity.revisionId,
    );
    expect(asset.build?.options.projectId).toBeUndefined();
    expect(
      asset.build?.dependencies?.some((dependency) => {
        const material = dependency as { kind?: string; manifest?: { revisionId?: string } };
        return (
          material.kind === 'kiln.material.v1' &&
          material.manifest?.revisionId === record.manifest.revisionId
        );
      }),
    ).toBe(true);
    expect((await workspace.projects.list()).length).toBe(2);
    const operations = (await new FileLiveReview(root).snapshot()).operations;
    expect(operations.filter((operation) => operation.status === 'complete')).toHaveLength(4);
    expect(
      operations
        .filter((operation) => operation.status === 'complete')
        .every((operation) => operation.projectId === undefined),
    ).toBe(true);
    for (const flags of [
      ['--no-project', '--project', 'project-1'],
      ['--no-project', '--project-revision', `r_0000000001_${'0'.repeat(64)}`],
    ]) {
      const invalid = run('render', 'source.js', '--json', ...flags);
      expect(invalid.exitCode).not.toBe(0);
      expect(invalid.stdout.toString() + invalid.stderr.toString()).toContain('--no-project');
    }
    for (const flags of [
      ['--project', 'project-1'],
      ['--project-revision', `r_0000000001_${'0'.repeat(64)}`],
      ['--no-project'],
      ['--materials', 'missing.json'],
    ]) {
      const unsupported = run('source', 'source.js', ...flags);
      expect(unsupported.exitCode).not.toBe(0);
      expect(unsupported.stdout.toString() + unsupported.stderr.toString()).toContain(
        'supported by render and generate only',
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
