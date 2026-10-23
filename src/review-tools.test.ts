import { expect, test } from 'bun:test';
import { renderGLBInProcess } from './render';
import { FileAssetLibrary } from './assets-node';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FileLiveReview } from './live-review-node';
import { createKilnReviewDef } from './tools/review';
import type { LiveOperation } from './live-review';
import {
  FileMaterialLibrary,
  createMaterialRecordV1,
  createMaterialRecordV2,
  createMaterialLibraryPayload,
} from './material-library-node';
import { materialLibraryPortableSpec } from './material-library';
import { decodeAssetBundle } from './assets';
import { createAssetRequirementsStore } from './requirements-store';
import { createAssetRequirementsV1, requestedRequirement } from './contracts/requirements';

test('review save preserves recorded GLB/source and refuses revision or policy mismatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-exact-review-'));
  try {
    const code =
      "\ufeffconst meta={name:'Reviewed'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#887766'),{parent:r});return r;}";
    const rendered = await renderGLBInProcess(code, { optimize: 'off' });
    const op: LiveOperation = {
      version: 'kiln.live.v1',
      operationId: 'op_00000000-0000-0000-0000-000000000000',
      revision: 2,
      tool: 'kiln_render',
      transport: 'cli',
      sessionId: 'session',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'complete',
      pinned: false,
      captures: [
        {
          name: 'capture-0.png',
          bytes: 8,
          sha256: `sha256:${'0'.repeat(64)}`,
          url: '/fixture-preview',
        },
      ],
      result: { capture: { backdrop: 'dark' } },
      // The CLI reviewed an in-loop build; saving persists exactly those bytes.
      viewFidelity: {
        version: 'kiln.view-fidelity.v1',
        requested: 'full-preferred',
        delivered: 'geometry-flat',
        materialFaithful: false,
        exactArtifact: false,
        rendererId: 'cpu-raster:fixture',
        inputGlbSha256: rendered.artifactGlbSha256,
        degraded: false,
        reasonCodes: ['IN_LOOP_BUILD_NOT_PERSISTED'],
      },
      phases: [],
      artifact: {
        name: 'asset.glb',
        bytes: rendered.glb.length,
        sha256: rendered.artifactGlbSha256,
        url: '/fixture',
      },
    };
    const { glb, ...evaluation } = rendered;
    const files: Record<string, Uint8Array> = {
      'asset.glb': glb,
      'source.kiln.js': Buffer.from(code),
      'evaluation.json': Buffer.from(JSON.stringify(evaluation)),
      'capture-0.png': Buffer.from('89504e470d0a1a0a', 'hex'),
    };
    const library = new FileAssetLibrary({ project: root });
    const store = {
      get: async () => op,
      readFile: async (_id: string, name: string) => files[name]!,
      snapshot: async () => ({
        cursor: 'fixture',
        unchanged: false,
        operations: [op],
        retention: { maxOperations: 2, maxBytes: 1024, pinned: 0 },
      }),
      pin: async () => {},
    };
    const tool = createKilnReviewDef({ reviewStore: store, assetLibrary: library });
    const input = {
      action: 'save',
      operationId: op.operationId,
      expectedRevision: 2,
      name: 'Exact reviewed fixture',
    };
    const saved = (await tool.run(input)) as { asset: { assetId: string; revisionId: string } };
    const record = await library.read('project', saved.asset.assetId, saved.asset.revisionId);
    expect(record.files['asset.glb']).toEqual(glb);
    expect(record.files['source.kiln.js']).toEqual(new TextEncoder().encode(code));
    expect(record.manifest.build?.options.reviewOperationId).toBe(op.operationId);
    expect(record.manifest.build?.options.instance).toBe(rendered.rebuildOptions!.instance);
    expect(record.manifest.preview?.backdrop).toBe('dark');
    expect(record.manifest.preview?.fidelity).toMatchObject({
      exactArtifact: true,
      inputGlbSha256: record.manifest.files['asset.glb']!.sha256,
      reasonCodes: [],
    });
    await expect(tool.run({ ...input, expectedRevision: 1 })).rejects.toThrow(/revision/i);
    evaluation.requirements = {
      ...evaluation.requirements,
      policyHash: `sha256:${'1'.repeat(64)}`,
    };
    files['evaluation.json'] = Buffer.from(JSON.stringify(evaluation));
    await expect(tool.run(input)).rejects.toThrow(/requirements/i);
    expect(await library.list('project')).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('review CLI lists, pins and saves the exact retained artifact using workspace-only configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-review-cli-'));
  try {
    const code =
      "function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#887766'),{parent:r});return r;}";
    const rendered = await renderGLBInProcess(code);
    const review = new FileLiveReview(root);
    await review.observe('fixture', {}, async () => {
      review.artifact(code, rendered);
      return { ok: true };
    });
    await review.flush();
    const run = (args: string[]) =>
      spawnSync(process.execPath, [resolve('src/cli.ts'), 'review', ...args], {
        cwd: root,
        env: { ...process.env, KILN_WORKSPACE: root, KILN_PROGRAM_STORE: '', KILN_COLLECTIONS: '' },
        encoding: 'utf8',
        windowsHide: true,
      });
    const list = run(['list']);
    expect(list.status, list.stderr).toBe(0);
    const operation = JSON.parse(list.stdout).operations[0];
    const pinned = run(['pin', operation.operationId, '--pinned', 'true']);
    expect(pinned.status, pinned.stderr).toBe(0);
    const revision = JSON.parse(pinned.stdout).operation.revision;
    const saved = run([
      'save',
      operation.operationId,
      '--expected',
      String(revision),
      '--name',
      'CLI reviewed cube',
    ]);
    expect(saved.status, saved.stderr).toBe(0);
    expect(JSON.parse(saved.stdout).asset.files['asset.glb'].sha256).toBe(
      rendered.artifactGlbSha256,
    );
    expect(
      run(['save', operation.operationId, '--expected', String(revision - 1), '--name', 'Stale'])
        .status,
    ).toBe(1);
    expect(run(['list', '--unexpected', 'flag']).status).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);

test('reviewed save preserves mixed V1/V2 material identities and editable closure through file-backed export/import', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-reviewed-v2-'));
  const checked = relative(resolve(tmpdir()), resolve(root));
  if (
    checked.startsWith('..') ||
    isAbsolute(checked) ||
    !basename(root).startsWith('kiln-reviewed-v2-')
  )
    throw Error('Unexpected temporary cleanup target');
  try {
    const materials = new FileMaterialLibrary(join(root, 'materials'));
    const library = new FileAssetLibrary({ project: join(root, 'assets') }, materials);
    const source = {
      id: 'authored',
      kind: 'procedural' as const,
      provider: 'Kiln',
      creator: 'Review fixture',
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: '',
      },
      originalFiles: [],
    };
    const legacy = await createMaterialRecordV1({
      materialId: 'review-legacy',
      name: 'Legacy review material',
      tileable: true,
      sources: [source],
      maps: [
        {
          slot: 'baseColor',
          sourceId: 'authored',
          transforms: [],
          procedural: {
            schemaVersion: 2,
            size: 4,
            usage: 'albedo',
            layers: [{ op: 'solid', color: 0x884422 }],
          },
        },
      ],
    });
    const modern = await createMaterialRecordV2({
      schemaVersion: 2,
      materialId: 'review-modern',
      name: 'V2 review material',
      tileable: false,
      sources: [source],
      maps: [
        {
          slot: 'baseColor',
          sourceId: 'authored',
          transforms: [],
          sampler: {
            minFilter: 'nearest',
            magFilter: 'nearest',
            wrapS: 'clamp-to-edge',
            wrapT: 'clamp-to-edge',
          },
          procedural: {
            schemaVersion: 3,
            width: 8,
            height: 4,
            usage: 'albedo',
            background: [40, 100, 60, 255],
            operations: [],
          },
        },
      ],
    });
    await materials.import([legacy, modern]);
    const code = `async function build(){const root=createRoot('MixedReview');const legacy=await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(legacy.manifest))});const modern=await compilePortableMaterialSpecV3(${JSON.stringify(materialLibraryPortableSpec(modern.manifest))});createPart('Old',boxGeo(.5,.5,.5),legacy,{parent:root,position:[-.4,.25,0]});createPart('New',boxGeo(.5,.5,.5),modern,{parent:root,position:[.4,.25,0]});return root;}`;
    const rendered = await renderGLBInProcess(code, {
      optimize: 'off',
      materialResources: await createMaterialLibraryPayload([legacy, modern]),
    });
    const review = new FileLiveReview(join(root, 'review'));
    await review.observe('kiln_render', {}, async () => {
      review.artifact(code, rendered);
      return { ok: true };
    });
    await review.flush();
    const operation = (await review.snapshot()).operations[0]!;
    const saved = (await createKilnReviewDef({ reviewStore: review, assetLibrary: library }).run({
      action: 'save',
      operationId: operation.operationId,
      expectedRevision: operation.revision,
      name: 'Reviewed mixed resource fixture',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
    const record = await library.read('project', saved.asset.assetId, saved.asset.revisionId);
    expect(record.files['asset.glb']).toEqual(rendered.glb);
    expect(record.files['source.kiln.js']).toEqual(new TextEncoder().encode(code));
    expect(record.manifest.files['asset.glb']!.sha256).toBe(operation.artifact!.sha256);
    const dependencies = record.manifest.build!.dependencies! as {
      kind: string;
      delivery: string;
      manifest: unknown;
    }[];
    expect(dependencies).toEqual([
      { kind: 'kiln.material.v1', delivery: 'runtime', manifest: legacy.manifest },
      { kind: 'kiln.material.v2', delivery: 'runtime', manifest: modern.manifest },
    ]);
    const bundle = decodeAssetBundle(await library.exportBundle([record]));
    expect(bundle[0]!.manifest).toEqual(record.manifest);
    expect(bundle[0]!.materialResources!.records.map((r) => r.manifest)).toEqual(
      expect.arrayContaining([legacy.manifest, modern.manifest]),
    );
    const targetMaterials = new FileMaterialLibrary(join(root, 'import-materials'));
    const target = new FileAssetLibrary({ project: join(root, 'import-assets') }, targetMaterials);
    await target.import('project', bundle);
    const imported = await target.read('project', saved.asset.assetId, saved.asset.revisionId);
    expect(imported.files['asset.glb']).toEqual(rendered.glb);
    expect(
      (await targetMaterials.read(modern.manifest.materialId, modern.manifest.revisionId)).manifest,
    ).toEqual(modern.manifest);
    expect(
      (await targetMaterials.read(legacy.manifest.materialId, legacy.manifest.revisionId)).manifest,
    ).toEqual(legacy.manifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('review save refuses an artifact reviewed under an earlier validation profile (#208)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-review-profile-'));
  try {
    const profile = (doubleSided?: boolean) => ({
      version: 'kiln.validation-profile.v1' as const,
      profileId: 'holodeck.palm',
      mode: 'enforce' as const,
      checks: [
        {
          id: 'frond',
          select: { names: ['Mesh_frond_*'] },
          primitives: { exactly: 1 },
          ...(doubleSided === undefined ? {} : { material: { doubleSided } }),
        },
      ],
    });
    const store = createAssetRequirementsStore();
    const key = { taskId: 'palm', lineageId: 'palm-a' };
    const authority = { actor: 'holodeck', reason: 'Destination', source: 'brief' as const };
    const v1 = store.host.bind(
      key,
      createAssetRequirementsV1({ requirements: { validation: requestedRequirement(profile()) } }),
      authority,
    );
    const v2 = store.host.replace(
      key,
      v1.revision,
      createAssetRequirementsV1({
        requirements: { validation: requestedRequirement(profile(true)) },
      }),
      { ...authority, reason: 'Stricter destination' },
    );
    const code =
      "function build(){const r=createRoot('Palm');createPart('frond_0',boxGeo(0.2,2,0.05),gameMaterial('#336633'),{parent:r});return r;}";
    const rendered = await renderGLBInProcess(code, { requirements: v1 });
    const review = new FileLiveReview(root);
    await review.observe('fixture', {}, async () => {
      review.artifact(code, rendered);
      return { ok: true };
    });
    await review.flush();
    const operation = (await review.snapshot()).operations[0]!;
    const library = new FileAssetLibrary({ project: root });
    const input = {
      action: 'save',
      operationId: operation.operationId,
      expectedRevision: operation.revision,
      name: 'Palm',
    };
    const stale = createKilnReviewDef({
      reviewStore: review,
      assetLibrary: library,
      requirements: v2,
    });
    await expect(stale.run(input)).rejects.toThrow(/requirements/i);
    expect(await library.list('project')).toHaveLength(0);
    const current = createKilnReviewDef({
      reviewStore: review,
      assetLibrary: library,
      requirements: v1,
    });
    await current.run(input);
    expect(await library.list('project')).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
