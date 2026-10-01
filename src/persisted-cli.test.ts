import { expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewMain } from './review-cli';
import { projectMain } from './project-cli';
import { FileLiveReview } from './live-review-node';
import { localAssetLibrary } from './assets-node';
import { renderGLBInProcess } from './render';

async function inWorkspace(run: (root: string, output: () => string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'kiln-persisted-cli-'));
  const env = {
    KILN_WORKSPACE: root,
    KILN_PROGRAM_STORE: '',
    KILN_COLLECTIONS: JSON.stringify({ project: join(root, 'assets') }),
    KILN_PROJECT: '',
  };
  const previous = Object.keys(env).map((key) => [key, process.env[key]] as const);
  const log = spyOn(console, 'log').mockImplementation(() => {});
  try {
    Object.assign(process.env, env);
    await run(root, () => String(log.mock.calls.at(-1)?.[0]));
  } finally {
    log.mockRestore();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
}

test('review CLI reads, pins and saves the exact retained artifact with revision checks', async () => {
  await inWorkspace(async (root, output) => {
    const code =
      "function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#887766'),{parent:r});return r;}";
    const rendered = await renderGLBInProcess(code);
    const review = new FileLiveReview(root);
    await review.observe('kiln_render', {}, async () => {
      review.artifact(code, rendered);
      return { ok: true };
    });
    await review.flush();
    expect(await reviewMain(['list'])).toBe(0);
    const listed = JSON.parse(output());
    expect(listed.operations).toHaveLength(1);
    const operationId = listed.operations[0].operationId as string;
    expect(await reviewMain(['get', operationId])).toBe(0);
    expect(JSON.parse(output()).operation.artifact.sha256).toBe(rendered.artifactGlbSha256);
    expect(await reviewMain(['pin', operationId, '--pinned', 'true'])).toBe(0);
    expect(JSON.parse(output()).operation.pinned).toBe(true);
    const revision = JSON.parse(output()).operation.revision as number;
    await expect(
      reviewMain(['save', operationId, '--expected', String(revision - 1), '--name', 'Cube']),
    ).rejects.toThrow('Review revision changed');
    expect(
      await reviewMain(['save', operationId, '--expected', String(revision), '--name', 'Cube']),
    ).toBe(0);
    const saved = JSON.parse(output());
    const record = await localAssetLibrary().read(
      'project',
      saved.asset.assetId,
      saved.asset.revisionId,
    );
    expect(new TextDecoder().decode(record.files['source.kiln.js'])).toBe(code);
    expect(record.files['asset.glb']).toEqual(new Uint8Array(rendered.glb));
    expect(await reviewMain(['pin', operationId, '--pinned', 'false'])).toBe(0);
    expect(JSON.parse(output()).operation.pinned).toBe(false);
    expect(await reviewMain(['list', '--project', 'unrelated'])).toBe(0);
    expect(JSON.parse(output()).operations).toEqual([]);
    await expect(reviewMain(['pin', operationId, '--pinned', 'yes'])).rejects.toThrow('--pinned');
    await expect(reviewMain(['list', '--project', 'a', '--project', 'b'])).rejects.toThrow(
      'Invalid review option',
    );
  });
});

test('project CLI preserves historical revisions and rejects stale updates from JSON files', async () => {
  await inWorkspace(async (root, output) => {
    const draft = join(root, 'draft.json');
    const patch = join(root, 'patch.json');
    await writeFile(
      draft,
      `\uFEFF${JSON.stringify({ projectId: 'test-project', name: 'Original' })}`,
    );
    await writeFile(patch, JSON.stringify({ name: 'Updated' }));
    expect(await projectMain(['project', 'create', '--file', draft])).toBe(0);
    const original = JSON.parse(output()).project;
    expect(original.name).toBe('Original');
    expect(
      await projectMain([
        'project',
        'update',
        'test-project',
        '--expected',
        original.revisionId,
        '--file',
        patch,
      ]),
    ).toBe(0);
    const updated = JSON.parse(output()).project;
    expect(updated.name).toBe('Updated');
    expect(updated.revisionId).not.toBe(original.revisionId);
    await expect(
      projectMain([
        'project',
        'update',
        'test-project',
        '--expected',
        original.revisionId,
        '--file',
        patch,
      ]),
    ).rejects.toThrow();
    expect(
      await projectMain(['project', 'get', 'test-project', '--revision', original.revisionId]),
    ).toBe(0);
    expect(JSON.parse(output()).project).toEqual(original);
    expect(await projectMain(['project', 'get', 'test-project'])).toBe(0);
    expect(JSON.parse(output()).project).toEqual(updated);
    expect(await projectMain(['project', 'list'])).toBe(0);
    expect(JSON.parse(output()).projects).toHaveLength(1);
    await expect(
      projectMain(['project', 'create', '--file', draft, '--name', 'Ambiguous']),
    ).rejects.toThrow('not both');
  });
});
