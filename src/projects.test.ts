import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileProjectStore, localProjectStore } from './projects-node';
import { MAX_PROJECT_BYTES, ProjectConflictError, projectDraftSchema } from './projects';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-projects-'));
  roots.push(root);
  return { root, store: new FileProjectStore(root) };
}
const hash = `sha256:${'a'.repeat(64)}`;

test('project configuration survives restart and updates retain immutable history', async () => {
  const { root, store } = await fixture();
  expect(await store.list()).toEqual([]);
  const first = await store.create({
    projectId: 'farm',
    name: 'Farm',
    brief: 'Coherent rural game art',
    design: { style: 'Faceted', palette: [{ role: 'grass', color: '#779944' }] },
    materialDependencies: [{ resourceId: 'kiln.material.grass', revisionId: 'v1', sha256: hash }],
    inventory: [{ id: 'barn', name: 'Barn' }],
    deliveryProfiles: [{ id: 'browser', target: 'three', performanceIntent: 'Mid-range desktop' }],
  });
  const updated = await store.update('farm', first.revisionId, { brief: 'Reviewed brief' });
  expect(updated.projectId).toBe('farm');
  expect(updated.revisionId).not.toBe(first.revisionId);
  expect(updated.parentRevision).toBe(first.revisionId);
  expect(updated.design).toEqual(first.design);
  expect(updated.materialDependencies).toEqual(first.materialDependencies);
  const restarted = new FileProjectStore(root);
  expect(await restarted.read('farm')).toEqual(updated);
  expect(await restarted.read('farm', first.revisionId)).toEqual(first);
  expect(await restarted.list()).toEqual([updated]);
  updated.design.style = 'caller mutation';
  expect((await restarted.read('farm')).design.style).toBe('Faceted');
});

test('independent writers cannot overwrite a concurrently accepted revision', async () => {
  const { root, store } = await fixture();
  const initial = await store.create({ name: 'Farm' });
  const outcomes = await Promise.allSettled([
    store.update(initial.projectId, initial.revisionId, { brief: 'one' }),
    new FileProjectStore(root).update(initial.projectId, initial.revisionId, { brief: 'two' }),
  ]);
  expect(outcomes.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  const failed = outcomes.find((v) => v.status === 'rejected');
  expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(ProjectConflictError);
  const current = await store.read(initial.projectId);
  await expect(
    store.update(initial.projectId, initial.revisionId, { name: 'stale' }),
  ).rejects.toMatchObject({
    code: 'PROJECT_CONFLICT',
    expectedRevision: initial.revisionId,
    actualRevision: current.revisionId,
  });
  expect(await store.read(initial.projectId, initial.revisionId)).toEqual(initial);
});

test('concurrent creation cannot replace an existing project', async () => {
  const { root, store } = await fixture();
  const outcomes = await Promise.allSettled([
    store.create({ projectId: 'farm', name: 'one' }),
    new FileProjectStore(root).create({ projectId: 'farm', name: 'two' }),
  ]);
  expect(outcomes.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  expect(await store.list()).toHaveLength(1);
  await expect(store.create({ projectId: 'farm', name: 'replacement' })).rejects.toMatchObject({
    code: 'PROJECT_EXISTS',
  });
});

test('selection is explicit and workspace resolution follows the shared program-store boundary', async () => {
  const { root, store } = await fixture();
  const local = localProjectStore({ KILN_PROGRAM_STORE: join(root, '.kiln', 'programs') });
  expect(local.directory).toBe(join(root, '.kiln', 'projects'));
  await local.create({ projectId: 'chosen', name: 'Chosen' });
  expect((await store.read('chosen')).name).toBe('Chosen');
  await expect(store.read('missing')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  await expect(store.read('')).rejects.toThrow();
  await expect(store.read('../chosen')).rejects.toThrow();
});

test('strict bounded data rejects authority, duplicates and broken inventory references', async () => {
  const { root, store } = await fixture();
  for (const bad of [
    { name: 'Bad', requirements: { maxTriangles: 1 } },
    { name: 'Bad', design: { style: 'Anything', trustedRequirements: {} } },
    {
      name: 'Bad',
      inventory: [
        { id: 'barn', name: 'Barn' },
        { id: 'barn', name: 'Other' },
      ],
    },
    { name: 'Bad', inventory: [{ id: 'barn', name: 'Barn', references: ['missing'] }] },
    {
      name: 'Bad',
      materialDependencies: [
        { resourceId: 'grass', revisionId: 'v1', sha256: hash },
        { resourceId: 'grass', revisionId: 'v2', sha256: hash },
      ],
    },
    { name: 'Bad', design: { palette: [{ role: 'bad', color: 'red' }] } },
  ])
    await expect(store.create(bad as never)).rejects.toThrow();
  expect(await store.list()).toEqual([]);
  expect(await readdir(join(root, '.kiln', 'projects')).catch(() => [])).toEqual([]);
  expect(projectDraftSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
});

test('oversized project data fails before a revision is published', async () => {
  const { store } = await fixture();
  const references = Array.from({ length: 256 }, (_, i) => ({
    id: `ref-${i}`,
    title: 'Reference',
    uri: 'x'.repeat(2000),
    description: 'x'.repeat(4000),
  }));
  expect(JSON.stringify(references).length).toBeGreaterThan(MAX_PROJECT_BYTES);
  await expect(store.create({ name: 'Oversized', references })).rejects.toThrow('1 MiB');
  expect(await store.list()).toEqual([]);
});

test('review annotations bind existing project revisions and exact asset identities without granting authority', async () => {
  const { store } = await fixture();
  const initial = await store.create({ name: 'Farm', inventory: [{ id: 'barn', name: 'Barn' }] });
  const review = {
    id: 'review-1',
    inventoryId: 'barn',
    projectRevisionId: initial.revisionId,
    asset: { collectionId: 'project', assetId: 'barn', revisionId: 'r_example' },
    reviewer: 'Owner',
    verdict: 'accepted' as const,
    notes: 'Visual direction accepted only',
  };
  const reviewed = await store.update(initial.projectId, initial.revisionId, { reviews: [review] });
  expect(reviewed.reviews).toEqual([review]);
  await expect(
    store.update(initial.projectId, reviewed.revisionId, {
      reviews: [{ ...review, inventoryId: 'missing' }],
    }),
  ).rejects.toThrow();
  const other = await store.create({ name: 'Other' });
  await expect(
    store.update(initial.projectId, reviewed.revisionId, {
      reviews: [{ ...review, projectRevisionId: other.revisionId }],
    }),
  ).rejects.toThrow();
});

test('partial writes are ignored and tampered published revisions fail integrity checks', async () => {
  const { root, store } = await fixture();
  const initial = await store.create({ projectId: 'farm', name: 'Farm' });
  const directory = join(root, '.kiln', 'projects', 'farm', 'revisions');
  await writeFile(join(directory, '.write-abandoned'), '{');
  expect(await store.read('farm')).toEqual(initial);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  const path = join(directory, files[0]!);
  const record = JSON.parse(await readFile(path, 'utf8'));
  record.name = 'Tampered';
  await writeFile(path, JSON.stringify(record));
  await expect(store.read('farm')).rejects.toThrow('integrity');
});

test('project directories cannot escape through symlinks', async () => {
  const { root, store } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'kiln-project-outside-'));
  roots.push(outside);
  await mkdir(join(root, '.kiln', 'projects'), { recursive: true });
  await symlink(
    outside,
    join(root, '.kiln', 'projects', 'escaped'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await expect(store.create({ projectId: 'escaped', name: 'Escape' })).rejects.toThrow('symlink');
  expect(await readdir(outside)).toEqual([]);
});

test('undefined patch values preserve configuration and explicit empty arrays clear it', async () => {
  const { store } = await fixture();
  const initial = await store.create({
    name: 'Farm',
    brief: 'Keep',
    inventory: [{ id: 'barn', name: 'Barn' }],
  });
  const edited = await store.update(initial.projectId, initial.revisionId, {
    brief: undefined,
    inventory: undefined,
  });
  expect(edited.brief).toBe('Keep');
  expect(edited.inventory).toEqual(initial.inventory);
  const cleared = await store.update(initial.projectId, edited.revisionId, { inventory: [] });
  expect(cleared.inventory).toEqual([]);
  await expect(
    store.update(initial.projectId, cleared.revisionId, { projectId: 'replacement' } as never),
  ).rejects.toThrow();
  expect((await store.read(initial.projectId)).revisionId).toBe(cleared.revisionId);
});

test('project IDs are portable across Windows and Unix filesystems', async () => {
  const { store } = await fixture();
  for (const id of ['con', 'prn', 'aux', 'nul', 'com1', 'lpt9'])
    expect(projectDraftSchema.safeParse({ projectId: id, name: 'Invalid' }).success).toBe(false);
  expect(await store.list()).toEqual([]);
});

test('two actual processes preserve one winner for the same expected revision', async () => {
  const { root, store } = await fixture();
  const initial = await store.create({ name: 'Concurrent' });
  const script = `import { FileProjectStore } from ${JSON.stringify(new URL('./projects-node.ts', import.meta.url).href)};
    try {
      const result = await new FileProjectStore(${JSON.stringify(root)}).update(${JSON.stringify(initial.projectId)}, ${JSON.stringify(initial.revisionId)}, { brief: 'child' });
      console.log(JSON.stringify({ revisionId: result.revisionId }));
    } catch (error) { console.log(JSON.stringify({ code: error.code })); }`;
  const run = async () => {
    const child = Bun.spawn([process.execPath, '--eval', script], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    return JSON.parse(output);
  };
  const results = await Promise.all([run(), run()]);
  expect(results.filter((result) => result.revisionId)).toHaveLength(1);
  expect(results.filter((result) => result.code === 'PROJECT_CONFLICT')).toHaveLength(1);
  expect((await store.read(initial.projectId)).parentRevision).toBe(initial.revisionId);
});
