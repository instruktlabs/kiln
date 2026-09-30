import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { FileWorkspace } from '../workspace-node';
import { FileLiveReview } from '../live-review-node';
import type { LiveReviewPort } from '../live-review';
import type { KilnToolDef } from './registry';
import { withWorkspaceContext } from './workspace';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const definition = (run: () => Promise<unknown>): KilnToolDef => ({
  name: 'kiln_render',
  description: 'Fixture',
  inputSchema: z.object({}),
  run,
});

test('project resolution failures remain visible without evaluating source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-observation-boundary-'));
  roots.push(root);
  const workspace = new FileWorkspace(root);
  const liveReview = new FileLiveReview(root);
  await workspace.projects.create({
    projectId: 'pilot',
    name: 'Pilot',
    materialDependencies: [
      {
        resourceId: 'missing',
        revisionId: `sha256:${'0'.repeat(64)}`,
        sha256: `sha256:${'0'.repeat(64)}`,
      },
    ],
  });
  let evaluated = 0;
  const tool = withWorkspaceContext(
    definition(async () => {
      evaluated++;
      return { ok: true };
    }),
    { workspace, liveReview },
  );
  await expect(tool.run({ projectId: 'pilot' })).rejects.toThrow('Locked material unavailable');
  await liveReview.flush();
  const operations = (await liveReview.snapshot()).operations;
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({ projectId: 'pilot', status: 'failed' });
  expect(operations[0]!.error).toContain('Locked material unavailable');
  expect(evaluated).toBe(0);
});

test('observer failures cannot replace, duplicate or stall authoring outcomes', async () => {
  const observers: LiveReviewPort[] = [
    {
      artifact() {},
      observe() {
        throw new Error('Observer failed before running');
      },
    },
    {
      artifact() {},
      async observe(_tool, _input, run) {
        await run();
        throw new Error('Observer failed after running');
      },
    },
    {
      artifact() {},
      async observe<T>(_tool: string, _input: unknown, run: () => Promise<T>) {
        await run();
        return 'wrong result' as T;
      },
    },
    {
      artifact() {},
      async observe(_tool, _input, run) {
        await run();
        return run();
      },
    },
    {
      artifact() {},
      observe() {
        return new Promise(() => {});
      },
    },
  ];
  for (const liveReview of observers) {
    let calls = 0;
    const output = { ok: true, expected: 'original' };
    const tool = withWorkspaceContext(
      definition(async () => {
        calls++;
        return output;
      }),
      { liveReview },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        tool.run({}),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Observer stalled authoring')), 100);
        }),
      ]);
      expect(result).toBe(output);
      expect(calls).toBe(1);
      const failure = new Error('Original authoring failure');
      const failed = withWorkspaceContext(
        definition(async () => {
          throw failure;
        }),
        { liveReview },
      );
      await expect(failed.run({})).rejects.toBe(failure);
    } finally {
      clearTimeout(timer);
    }
  }
});

test('shared tool selection exposes explicit standalone intent and validates resource pins before authoring', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-tool-standalone-'));
  roots.push(root);
  const workspace = new FileWorkspace(root, 'pilot');
  await workspace.projects.create({ projectId: 'pilot', name: 'Pilot' });
  const tool = withWorkspaceContext(
    definition(async () => ({ project: workspace.current()?.project?.projectId })),
    { workspace },
  );
  expect(await tool.run({})).toEqual({ project: 'pilot' });
  expect(await tool.run({ projectId: null })).toEqual({ project: undefined });
  await expect(
    tool.run({ projectId: null, projectRevision: `r_0000000001_${'0'.repeat(64)}` }),
  ).rejects.toThrow();
  await expect(
    tool.run({
      projectId: null,
      materialDependencies: [
        {
          resourceId: 'missing',
          revisionId: `sha256:${'0'.repeat(64)}`,
          sha256: `sha256:${'0'.repeat(64)}`,
        },
      ],
    }),
  ).rejects.toThrow('Locked material unavailable');
});
