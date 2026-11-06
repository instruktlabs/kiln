/** #277 — the two surfaces of the composed check: an explicit one, and one recorded at save. */
import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { FileAssetLibrary } from './assets-node';
import { exportWorkspaceProjectBundle, importWorkspaceProjectBundle } from './project-bundle-node';
import type { ProjectCompositionReportV1 } from './project-composition';
import { MemoryProgramStore, retainProgram } from './program-store';
import { renderGLBInProcess as render } from './render';
import { createKilnProgramToolRegistry, type KilnToolContext } from './tools/registry';
import { FileWorkspace } from './workspace-node';

const box = (name: string, size: number[], at: number[]) =>
  `createPart('${name}', boxGeo(${size.join(',')}), gameMaterial(0x888888), {parent: r, position: [${at.join(',')}]});`;
const program = (name: string, ...parts: string[]) =>
  `function build() { const r = createRoot('${name}'); ${parts.join(' ')} return r; }`;
const THROW = program(
  'Throw',
  `createPart('ThrowBlanket', planeGeo(1, 1, 8, 8), gameMaterial(0xaa4444), {parent: r, position: [0, 0.7, 0.4]});`,
);
const WALL = program('Wall', box('CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4]));
// The first revision of the throw stands clear of the wall; the revision being saved does not.
const THROW_CLEAR = program(
  'Throw',
  `createPart('ThrowBlanket', planeGeo(1, 1, 8, 8), gameMaterial(0xaa4444), {parent: r, position: [0, 0.7, 3]});`,
);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** A workspace holding a wall and the clear throw, and the throw's pin at that revision. */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-composition-tools-'));
  roots.push(root);
  const workspace = new FileWorkspace(root);
  const assetLibrary = new FileAssetLibrary({ project: join(root, 'saved') });
  const programStore = new MemoryProgramStore();
  const pin = (assetId: string, revisionId: string) => ({
    collectionId: 'project',
    assetId,
    revisionId,
  });
  const context = {
    workspace,
    projectStore: workspace.projects,
    assetLibrary,
    programStore,
  } satisfies KilnToolContext;
  const tools = createKilnProgramToolRegistry(context);
  const tool = (name: string) => tools.find((def) => def.name === name)!;
  // Saved through the tool, so a revision has the source and receipt a child revision needs.
  const saved = async (code: string, name: string, assetId: string) =>
    pin(
      assetId,
      (
        (await tool('kiln_save').run({
          programRef: await retainProgram(programStore, code),
          name,
          assetId,
        })) as { asset: { revisionId: string } }
      ).asset.revisionId,
    );
  return {
    root,
    workspace,
    assetLibrary,
    programStore,
    tool,
    wall: await saved(WALL, 'Wall', 'wall'),
    throwPin: await saved(THROW_CLEAR, 'Throw', 'throw'),
    refs: {
      throw: await retainProgram(programStore, THROW),
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const placedProject = (f: Fixture, projectId = 'cove') =>
  f.workspace.projects.create({
    projectId,
    name: 'Cove',
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement: {} },
      { id: 'throw', name: 'Throw', asset: f.throwPin, placement: {} },
    ],
  });

interface SaveResult {
  composition?: ProjectCompositionReportV1;
  asset: { revisionId: string };
}
const saveThrow = (f: Fixture, extra: Record<string, unknown> = {}) =>
  f.tool('kiln_save').run({
    programRef: f.refs.throw,
    name: 'Throw',
    assetId: 'throw',
    parentRevision: f.throwPin.revisionId,
    ...extra,
  }) as Promise<SaveResult>;

test('kiln_project check measures the current revision or an exact historical one', async () => {
  const f = await fixture();
  // A throw placed through the wall in its first revision, moved clear in the second.
  const throwNow = await f.assetLibrary.save('project', {
    name: 'Through',
    assetId: 'through',
    glb: (await render(THROW)).glb,
  });
  const through = { collectionId: 'project', assetId: 'through', revisionId: throwNow.revisionId };
  const first = await f.workspace.projects.create({
    projectId: 'cove',
    name: 'Cove',
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement: {} },
      { id: 'cloth', name: 'Cloth', asset: through, placement: {} },
    ],
  });
  const second = await f.workspace.projects.update('cove', first.revisionId, {
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement: {} },
      { id: 'cloth', name: 'Cloth', asset: through, placement: { translation: [0, 0, 5] } },
    ],
  });
  const check = f.tool('kiln_project');
  const current = (await check.run({ action: 'check', projectId: 'cove' })) as {
    ok: boolean;
    composition: ProjectCompositionReportV1;
  };
  expect(current.ok).toBe(true);
  expect(current.composition.projectRevision).toBe(second.revisionId);
  expect(current.composition.openSurfaces).toEqual([]);
  expect(current.composition.coverage).toBe('complete');
  const exact = (await check.run({
    action: 'check',
    projectId: 'cove',
    revisionId: first.revisionId,
  })) as { composition: ProjectCompositionReportV1 };
  expect(exact.composition.projectRevision).toBe(first.revisionId);
  expect(exact.composition.openSurfaces).toHaveLength(1);
  expect(exact.composition.openSurfaces[0]!.open.inventoryId).toBe('cloth');
  expect(exact.composition.openSurfaces[0]!.solid.inventoryId).toBe('wall');
});

test('kiln_project check names what it needs, and is only offered with an asset library', async () => {
  const f = await fixture();
  const check = f.tool('kiln_project');
  await expect(check.run({ action: 'check' })).rejects.toThrow(/projectId/);
  await expect(check.run({ action: 'check', projectId: 'nope' })).rejects.toThrow(/action: 'list'/);
  const hostless = createKilnProgramToolRegistry({ projectStore: f.workspace.projects }).find(
    (def) => def.name === 'kiln_project',
  )!;
  await expect(hostless.run({ action: 'check', projectId: 'nope' })).rejects.toThrow();
  const advertised = z.toJSONSchema(hostless.inputSchema as z.ZodType) as unknown as {
    properties: { action: { enum: string[] } };
  };
  expect(advertised.properties.action.enum).not.toContain('check');
});

test('kiln_save records the report in the result and the build record, measuring the revision being saved', async () => {
  const f = await fixture();
  // Against the pinned clear throw this project is clean, so a finding can only come from
  // the bytes being saved.
  const project = await placedProject(f);
  const pinned = (await f.tool('kiln_project').run({ action: 'check', projectId: 'cove' })) as {
    composition: ProjectCompositionReportV1;
  };
  expect(pinned.composition.openSurfaces).toEqual([]);

  const saved = await saveThrow(f, { projectId: 'cove' });
  const report = saved.composition!;
  expect(report.projectRevision).toBe(project.revisionId);
  expect(report.subject).toEqual(['throw']);
  expect(report.openSurfaces).toHaveLength(1);
  expect(report.openSurfaces[0]!.solid.part).toContain('CurvedWall');
  expect(report.openSurfaces[0]!.depth).toBeCloseTo(0.06, 3);
  const record = await f.assetLibrary.read('project', 'throw', saved.asset.revisionId);
  expect(record.manifest.build?.composition).toEqual(report);
});

test('a positive never stops the save, and an unreadable sibling is partial rather than clear', async () => {
  const f = await fixture();
  await f.workspace.projects.create({
    projectId: 'cove',
    name: 'Cove',
    inventory: [
      {
        id: 'wall',
        name: 'Wall',
        asset: { ...f.wall, revisionId: 'r_evicted' },
        placement: {},
      },
      { id: 'throw', name: 'Throw', asset: f.throwPin, placement: {} },
    ],
  });
  const saved = await saveThrow(f, { projectId: 'cove' });
  expect(saved.asset.revisionId).toBeTruthy();
  expect(saved.composition!.coverage).toBe('partial');
  expect(saved.composition!.unmeasured).toEqual([
    expect.objectContaining({ inventoryId: 'wall', reason: 'unavailable' }),
  ]);
});

test('standalone work gets no report, no finding and no warning', async () => {
  const f = await fixture();
  await placedProject(f);
  // A placed project exists in this workspace, but nothing selected it.
  const saved = await saveThrow(f);
  expect('composition' in saved).toBe(false);
  const record = await f.assetLibrary.read('project', 'throw', saved.asset.revisionId);
  expect('composition' in (record.manifest.build ?? {})).toBe(false);
  expect(JSON.stringify(saved)).not.toMatch(/neighbour/i);
});

test('projectId null overrides a configured default', async () => {
  const f = await fixture();
  await placedProject(f);
  const workspace = new FileWorkspace(f.root, 'cove');
  const save = createKilnProgramToolRegistry({
    workspace,
    projectStore: workspace.projects,
    assetLibrary: f.assetLibrary,
    programStore: f.programStore,
  }).find((def) => def.name === 'kiln_save')!;
  const request = { programRef: f.refs.throw, name: 'Throw', assetId: 'throw' };
  const standalone = (await save.run({
    ...request,
    parentRevision: f.throwPin.revisionId,
    projectId: null,
  })) as SaveResult;
  expect('composition' in standalone).toBe(false);
  // Negative control: the same workspace and call without the opt-out is measured.
  const configured = (await save.run({
    ...request,
    parentRevision: standalone.asset.revisionId,
  })) as SaveResult;
  expect(configured.composition?.openSurfaces).toHaveLength(1);
});

test('an item that states no placement, or is another collection, is not a save-time subject', async () => {
  const f = await fixture();
  await f.workspace.projects.create({
    projectId: 'unplaced',
    name: 'Unplaced',
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement: {} },
      { id: 'throw', name: 'Throw', asset: f.throwPin },
    ],
  });
  await f.workspace.projects.create({
    projectId: 'other',
    name: 'Other',
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement: {} },
      {
        id: 'throw',
        name: 'Throw',
        asset: { ...f.throwPin, collectionId: 'library' },
        placement: {},
      },
    ],
  });
  await f.workspace.projects.create({
    projectId: 'named-only',
    name: 'Named only',
    // Sharing a name or an item id with the asset is not membership.
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement: {} },
      { id: 'throw', name: 'throw', placement: {} },
    ],
  });
  for (const projectId of ['unplaced', 'other', 'named-only']) {
    const saved = await saveThrow(f, { projectId });
    expect('composition' in saved, projectId).toBe(false);
  }
});

test('placement survives a project bundle, and an unselected asset leaves it unpinned', async () => {
  const f = await fixture();
  const placement = {
    translation: [1, 2, 3] as [number, number, number],
    rotation: [0, 90, 0] as [number, number, number],
    scale: [2, 2, 2] as [number, number, number],
  };
  await f.workspace.projects.create({
    projectId: 'cove',
    name: 'Cove',
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement },
      { id: 'throw', name: 'Throw', asset: f.throwPin, placement: {} },
      { id: 'planned', name: 'Planned' },
    ],
  });
  const bytes = await exportWorkspaceProjectBundle(f.workspace, f.assetLibrary, 'cove', {
    profile: 'editable',
    inventoryIds: ['wall'],
  });
  const targetRoot = await mkdtemp(join(tmpdir(), 'kiln-composition-import-'));
  roots.push(targetRoot);
  const target = new FileWorkspace(targetRoot);
  const library = new FileAssetLibrary({ project: join(targetRoot, 'saved') });
  const imported = await importWorkspaceProjectBundle(target, library, bytes, {
    projectId: 'imported',
    collectionId: 'project',
  });
  const items = Object.fromEntries(imported.inventory.map((item) => [item.id, item]));
  expect(items.wall!.placement).toEqual(placement);
  expect(items.wall!.asset).toBeDefined();
  expect(items.throw!.placement).toEqual({});
  expect(items.throw!.asset).toBeUndefined();
  expect('placement' in items.planned!).toBe(false);
  // A placement with its asset left behind is declared and unmeasured, never clear.
  const { composeProjectModules } = await import('./project-composition');
  const report = await composeProjectModules(imported, library);
  expect(report.unmeasured).toEqual([
    expect.objectContaining({ inventoryId: 'throw', reason: 'unpinned' }),
  ]);
});

test('the CLI checks an exact revision through the same path', async () => {
  const f = await fixture();
  const env = {
    ...process.env,
    KILN_RENDER: 'cpu',
    KILN_WORKSPACE: f.root,
    KILN_PROGRAM_STORE: join(f.root, '.kiln', 'programs'),
    KILN_COLLECTIONS: JSON.stringify({ project: join(f.root, 'saved') }),
  };
  const through = await f.assetLibrary.save('project', {
    name: 'Through',
    assetId: 'through',
    glb: (await render(THROW)).glb,
  });
  const created = await f.workspace.projects.create({
    projectId: 'cove',
    name: 'Cove',
    inventory: [
      { id: 'wall', name: 'Wall', asset: f.wall, placement: {} },
      {
        id: 'cloth',
        name: 'Cloth',
        asset: { collectionId: 'project', assetId: 'through', revisionId: through.revisionId },
        placement: {},
      },
    ],
  });
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [resolve('src/cli.ts'), 'project', ...args], {
      cwd: f.root,
      env,
      encoding: 'utf8',
      windowsHide: true,
    });
  const result = run('check', 'cove', '--revision', created.revisionId);
  expect(result.status, result.stderr).toBe(0);
  const { composition } = JSON.parse(result.stdout) as { composition: ProjectCompositionReportV1 };
  expect(composition.projectRevision).toBe(created.revisionId);
  expect(composition.openSurfaces[0]!.solid.inventoryId).toBe('wall');
  expect(run('check').status).toBe(1);
}, 60_000);
