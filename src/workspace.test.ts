import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWorkspace } from './workspace-node';
import { createMaterialRecordV1 } from './material-library-node';
import { MATERIAL_LIBRARY_LIMITS } from './material-library';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
test('workspace omission stays standalone with zero, one or multiple projects and concurrent explicit bindings stay isolated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-context-'));
  roots.push(root);
  const workspace = new FileWorkspace(root);
  expect(await workspace.run({}, async () => workspace.current()?.project)).toBeUndefined();
  const a = await workspace.projects.create({ projectId: 'alpha', name: 'Alpha' });
  expect(await workspace.run({}, async () => workspace.current()?.project)).toBeUndefined();
  await workspace.projects.create({ projectId: 'beta', name: 'Beta' });
  expect(await workspace.run({}, async () => workspace.current()?.project)).toBeUndefined();
  const results = await Promise.all(
    ['alpha', 'beta'].map((projectId) =>
      workspace.run({ projectId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return workspace.current()?.project?.projectId;
      }),
    ),
  );
  expect(results).toEqual(['alpha', 'beta']);
  expect(workspace.current()).toBeUndefined();
  await workspace.projects.update('alpha', a.revisionId, { brief: 'Changed' });
  expect(
    await workspace.run(
      { projectId: 'alpha', projectRevision: a.revisionId },
      async () => workspace.current()?.project?.brief,
    ),
  ).toBe('');
});
test('project selection reports missing locked material before evaluating', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-missing-'));
  roots.push(root);
  const workspace = new FileWorkspace(root);
  const project = await workspace.projects.create({
    name: 'Missing',
    materialDependencies: [
      {
        resourceId: 'absent',
        revisionId: `sha256:${'0'.repeat(64)}`,
        sha256: `sha256:${'0'.repeat(64)}`,
      },
    ],
  });
  let ran = false;
  await expect(
    workspace.run({ projectId: project.projectId }, async () => {
      ran = true;
    }),
  ).rejects.toThrow();
  expect(ran).toBe(false);
});

test('explicit standalone overrides configured and inherited projects without leaking into sibling operations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-opt-in-'));
  roots.push(root);
  const workspace = new FileWorkspace(root, 'alpha');
  const project = await workspace.projects.create({ projectId: 'alpha', name: 'Alpha' });
  expect(await workspace.run({}, async () => workspace.current()?.project?.projectId)).toBe(
    'alpha',
  );
  await workspace.run({}, async () => {
    expect(await workspace.run({}, async () => workspace.current()?.project?.projectId)).toBe(
      'alpha',
    );
    expect(
      await workspace.run({ projectId: null }, async () => workspace.current()?.project),
    ).toBeUndefined();
    expect(workspace.current()?.project?.projectId).toBe('alpha');
    await workspace.projects.update('alpha', project.revisionId, {
      brief: 'Changed during operation',
    });
    expect(
      await workspace.run(
        { projectId: 'alpha' },
        async () => workspace.current()?.project?.revisionId,
      ),
    ).toBe(project.revisionId);
  });
  await expect(
    workspace.run({ projectId: null, projectRevision: project.revisionId }, async () => null),
  ).rejects.toThrow('projectRevision');
  expect(workspace.current()).toBeUndefined();
});

test('effective material closure is bounded before reading or allocating any library resources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-pin-limit-'));
  roots.push(root);
  const workspace = new FileWorkspace(root);
  const pins = Array.from({ length: MATERIAL_LIBRARY_LIMITS.maxPayloadRecords + 1 }, (_, i) => ({
    resourceId: `resource-${i}`,
    revisionId: `sha256:${'0'.repeat(64)}`,
    sha256: `sha256:${'0'.repeat(64)}`,
  }));
  await workspace.projects.create({
    projectId: 'pilot',
    name: 'Pilot',
    materialDependencies: pins.slice(1),
  });
  const read = spyOn(workspace.materials, 'read');
  try {
    await expect(
      workspace.run(
        { projectId: 'pilot', materialDependencies: pins.slice(0, 1) },
        async () => null,
      ),
    ).rejects.toThrow(`at most ${MATERIAL_LIBRARY_LIMITS.maxPayloadRecords}`);
    expect(read).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
  }
});

test('standalone material pins resolve exact resources, merge only compatible project locks and never require project creation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-pins-'));
  roots.push(root);
  const workspace = new FileWorkspace(root);
  const make = (materialId: string, seed: number) =>
    createMaterialRecordV1({
      materialId,
      name: materialId,
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
            layers: [{ op: 'noise', colorA: 0xaaaaaa, colorB: 0xffffff, seed }],
          },
        },
      ],
    });
  const [oldWood, newWood, stone] = await Promise.all([
    make('wood', 1),
    make('wood', 2),
    make('stone', 3),
  ]);
  await workspace.materials.import([oldWood, newWood, stone]);
  const pin = (record: typeof oldWood) => ({
    resourceId: record.manifest.materialId,
    revisionId: record.manifest.revisionId,
    sha256: record.manifest.revisionId,
  });
  const inspect = async () => workspace.current();
  const standalone = await workspace.run({ materialDependencies: [pin(oldWood)] }, inspect);
  expect(standalone?.project).toBeUndefined();
  expect(standalone?.materialResources.records.map((record) => record.manifest.revisionId)).toEqual(
    [oldWood.manifest.revisionId],
  );
  expect(await workspace.projects.list()).toEqual([]);
  await workspace.projects.create({
    projectId: 'farm',
    name: 'Farm',
    materialDependencies: [pin(oldWood)],
  });
  const merged = await workspace.run(
    { projectId: 'farm', materialDependencies: [pin(stone), pin(oldWood)] },
    inspect,
  );
  expect(
    merged?.materialResources.records.map((record) => record.manifest.materialId).sort(),
  ).toEqual(['stone', 'wood']);
  await expect(
    workspace.run({ projectId: 'farm', materialDependencies: [pin(newWood)] }, inspect),
  ).rejects.toThrow('Conflicting material');
  const independent = await workspace.run(
    { projectId: null, materialDependencies: [pin(newWood)] },
    inspect,
  );
  expect(independent?.project).toBeUndefined();
  expect(independent?.materialResources.records[0]?.manifest.revisionId).toBe(
    newWood.manifest.revisionId,
  );
  await expect(
    workspace.run(
      { materialDependencies: [{ ...pin(oldWood), sha256: newWood.manifest.revisionId }] },
      inspect,
    ),
  ).rejects.toThrow('hash mismatch');
  await expect(
    workspace.run(
      { materialDependencies: Array.from({ length: 513 }, () => pin(oldWood)) },
      inspect,
    ),
  ).rejects.toThrow();
});
