import { expect, test } from 'bun:test';
import { renderGLBInProcess } from './render';
import { FileAssetLibrary } from './assets-node';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FileLiveReview } from './live-review-node';
import { createKilnReviewDef } from './tools/review';
import type { LiveOperation } from './live-review';

test('review save preserves recorded GLB/source and refuses revision or policy mismatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-exact-review-'));
  try {
    const code =
      "const meta={name:'Reviewed'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#887766'),{parent:r});return r;}";
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
    expect(new TextDecoder().decode(record.files['source.kiln.js'])).toBe(code);
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
