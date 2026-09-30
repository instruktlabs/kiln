import { expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetMain } from './asset-cli';
import { FileLiveReview } from './live-review-node';
import { FileAssetLibrary } from './assets-node';
import { renderGLBInProcess } from './render';
import { createMaterialRecordV1 } from './material-library-node';

test('CLI save flushes completed review without replacing success if observation flush fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-save-observer-'));
  const env = {
    KILN_WORKSPACE: root,
    KILN_PROGRAM_STORE: '',
    KILN_COLLECTIONS: '',
    KILN_PROJECT: '',
    KILN_EVALUATOR_MODE: 'in-process',
    KILN_BUILD_CACHE: 'memory',
    KILN_LIVE_REVIEW: 'on',
  };
  const previous = Object.keys(env).map((key) => [key, process.env[key]] as const);
  const original = FileLiveReview.prototype.flush;
  const flush = spyOn(FileLiveReview.prototype, 'flush').mockImplementation(async function (
    this: FileLiveReview,
  ) {
    await original.call(this);
    throw new Error('Optional flush failed after persistence');
  });
  const log = spyOn(console, 'log').mockImplementation(() => {});
  try {
    Object.assign(process.env, env);
    const source = join(root, 'fixture.js');
    await writeFile(
      source,
      "function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#887766'),{parent:r});return r;}",
    );
    expect(await assetMain(['save', source, '--name', 'Fixture', '--render', 'cpu'])).toBe(0);
    expect(flush).toHaveBeenCalledTimes(1);
    const snapshot = await new FileLiveReview(root).snapshot();
    expect(snapshot.operations[0]?.status).toBe('complete');
  } finally {
    flush.mockRestore();
    log.mockRestore();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('authoring-only scope and material flags reject before other asset commands access files or start services', async () => {
  for (const command of ['collections', 'assets', 'asset', 'export', 'import', 'view']) {
    for (const flags of [
      ['--project', 'missing'],
      ['--project-revision', 'missing'],
      ['--no-project'],
      ['--materials', 'missing.json'],
    ]) {
      await expect(assetMain([command, '--out', 'unused.glb', ...flags])).rejects.toThrow(
        'supported by save only',
      );
    }
  }
});

test('rebuild preflight failures are observed once without inheriting a configured project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-rebuild-preflight-'));
  const env = {
    KILN_WORKSPACE: root,
    KILN_PROGRAM_STORE: '',
    KILN_COLLECTIONS: JSON.stringify({ project: join(root, 'assets') }),
    KILN_PROJECT: 'missing-default',
    KILN_EVALUATOR_MODE: 'in-process',
    KILN_BUILD_CACHE: 'memory',
    KILN_LIVE_REVIEW: 'on',
  };
  const previous = Object.keys(env).map((key) => [key, process.env[key]] as const);
  try {
    Object.assign(process.env, env);
    const library = new FileAssetLibrary({ project: join(root, 'assets') });
    const code =
      "function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#887766'),{parent:r});return r;}";
    const result = await renderGLBInProcess(code);
    const material = await createMaterialRecordV1({
      materialId: 'missing-material',
      name: 'Missing',
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
    const variants = [
      {
        label: 'source',
        draft: { name: 'Binary', glb: result.glb },
        error: 'Editable source unavailable',
      },
      {
        label: 'policy',
        draft: { name: 'Legacy', glb: result.glb, code },
        error: 'no current requirements receipt',
      },
      {
        label: 'settings',
        draft: {
          name: 'Incomplete',
          glb: result.glb,
          code,
          build: {
            engine: 'fixture',
            options: { requirements: result.requirements },
            warnings: [],
          },
        },
        error: 'Saved exporter settings are incomplete',
      },
      {
        label: 'materials',
        draft: {
          name: 'Missing resources',
          glb: result.glb,
          code,
          build: {
            engine: 'fixture',
            options: { ...result.rebuildOptions, requirements: result.requirements },
            warnings: [],
            dependencies: [
              { kind: 'kiln.material.v1', delivery: 'runtime', manifest: material.manifest },
            ],
            rebuild: 'external-dependencies-required' as const,
          },
        },
        error: 'Locked asset material unavailable',
      },
    ];
    for (const variant of variants) {
      const asset = await library.save('project', variant.draft);
      await expect(
        assetMain([
          'asset',
          asset.assetId,
          asset.revisionId,
          '--rebuild',
          '--out',
          join(root, `${variant.label}.glb`),
        ]),
      ).rejects.toThrow(variant.error);
    }
    const operations = (await new FileLiveReview(root).snapshot()).operations;
    expect(operations).toHaveLength(variants.length);
    for (const operation of operations) {
      expect(operation.tool).toBe('kiln_asset_rebuild');
      expect(operation.status).toBe('failed');
      expect(operation.projectId).toBeUndefined();
      expect(operation.projectRevision).toBeUndefined();
      expect(operation.artifact).toBeUndefined();
    }
    for (const variant of variants)
      expect(operations.some((operation) => operation.error?.includes(variant.error))).toBe(true);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
