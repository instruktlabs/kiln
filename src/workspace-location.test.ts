import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { localAssetLibrary, collectionConfigPath, FileAssetLibrary } from './assets-node';
import { localProjectStore, FileProjectStore } from './projects-node';
import { localProgramStore, FileProgramStore } from './program-store-node';
import { createLocalToolContext } from './local-runtime';
import { FileWorkspace, localWorkspaceRoot } from './workspace-node';
import { FileMaterialLibrary } from './material-library-node';
import type { FileLiveReview } from './live-review-node';
import { kilnMcpToolDefs, runTool } from './mcp-engine';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function scratch() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-location-'));
  roots.push(root);
  return root;
}

test('explicit host environment supplies the authoring item identity', async () => {
  const root = await scratch();
  const context = createLocalToolContext(
    {},
    {
      KILN_WORKSPACE: root,
      KILN_WORK_ITEM: 'host-selected-item',
      KILN_EVALUATOR_MODE: 'in-process',
    },
  );
  const review = context.liveReview as FileLiveReview;
  await review.observe('fixture', {}, async () => ({ ok: true }));
  await review.flush();
  expect((await review.snapshot()).operations[0]?.workId).toBe('host-selected-item');
});

test('KILN_WORKSPACE alone locates source, project, material and project assets consistently', async () => {
  const root = await scratch();
  const env = { KILN_WORKSPACE: root, KILN_EVALUATOR_MODE: 'in-process' };
  const programs = localProgramStore(env);
  expect(programs.directory).toBe(join(root, '.kiln', 'programs'));
  const project = await localProjectStore(env).create({ projectId: 'pilot', name: 'Pilot' });
  const context = createLocalToolContext({ assetLibrary: localAssetLibrary(env) }, env);
  expect((context.workspace as FileWorkspace).root).toBe(root);
  expect((context.programStore as FileProgramStore).directory).toBe(programs.directory);
  expect((context.materialLibrary as FileMaterialLibrary).root).toBe(
    join(root, '.kiln', 'materials'),
  );
  expect((await context.projectStore!.read('pilot')).revisionId).toBe(project.revisionId);
  expect(collectionConfigPath(env)).toBe(join(root, '.kiln', 'collections.json'));
  expect((context.assetLibrary as FileAssetLibrary).directory('project')).toBe(
    join(root, 'assets', 'kiln'),
  );
  const stored = await context.programStore!.put('function build(){}');
  expect(await programs.get(stored)).toBe('function build(){}');
});

test('explicit source-store override preserves the selected workspace and legacy derivation', async () => {
  const root = await scratch();
  const external = join(root, 'external', '.kiln', 'programs');
  const workspace = join(root, 'selected');
  const env = { KILN_WORKSPACE: workspace, KILN_PROGRAM_STORE: external };
  expect(localProgramStore(env).directory).toBe(external);
  expect(localWorkspaceRoot(env)).toBe(workspace);
  expect(localProjectStore(env).workspace).toBe(workspace);
  expect(collectionConfigPath(env)).toBe(join(workspace, '.kiln', 'collections.json'));
  expect(localAssetLibrary(env).directory('project')).toBe(join(workspace, 'assets', 'kiln'));
  expect((createLocalToolContext({}, env).programStore as FileProgramStore).directory).toBe(
    external,
  );
  const legacy = { KILN_PROGRAM_STORE: external };
  expect(localWorkspaceRoot(legacy)).toBe(join(root, 'external'));
  expect(localProjectStore(legacy).workspace).toBe(join(root, 'external'));
  expect(localAssetLibrary(legacy).directory('project')).toBe(
    join(root, 'external', 'assets', 'kiln'),
  );
  expect(localWorkspaceRoot({})).toBe(resolve('.'));
});

test('local defaults never replace explicitly injected host stores', async () => {
  const root = await scratch();
  const programs = new FileProgramStore(join(root, 'source', '.kiln', 'programs'));
  const workspace = new FileWorkspace(join(root, 'bound'));
  const projects = new FileProjectStore(join(root, 'project-store'));
  const materials = new FileMaterialLibrary(join(root, 'material-store'));
  const assets = new FileAssetLibrary({ project: join(root, 'asset-store') });
  const context = createLocalToolContext(
    {
      programStore: programs,
      workspace,
      projectStore: projects,
      materialLibrary: materials,
      assetLibrary: assets,
    },
    { KILN_WORKSPACE: join(root, 'ambient'), KILN_PROGRAM_STORE: join(root, 'ambient-programs') },
  );
  expect(context.programStore).toBe(programs);
  expect(context.workspace).toBe(workspace);
  expect(context.projectStore).toBe(projects);
  expect(context.materialLibrary).toBe(materials);
  expect(context.assetLibrary).toBe(assets);
});

test('CLI commands and the MCP tool skin exchange workspace-only projects, materials and source', async () => {
  const root = await scratch();
  const working = join(root, 'caller');
  const selected = join(root, 'selected');
  await mkdir(working);
  const env: Record<string, string | undefined> = {
    ...process.env,
    KILN_WORKSPACE: selected,
    KILN_EVALUATOR_MODE: 'in-process',
    KILN_RENDER: 'cpu',
    KILN_BUILD_CACHE: 'memory',
  };
  delete env.KILN_PROGRAM_STORE;
  delete env.KILN_COLLECTIONS;
  delete env.KILN_PROJECT;
  const cli = async (...args: string[]) => {
    const process = Bun.spawn([Bun.which('bun')!, resolve('src/cli.ts'), ...args], {
      cwd: working,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [status, out, err] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);
    expect(status, err).toBe(0);
    return out.trim();
  };
  const source = 'function build(){return createRoot("Fixture");}';
  await writeFile(join(working, 'fixture.js'), source);
  const programRef = await cli('source', 'fixture.js');
  await cli('project', 'create', '--id', 'pilot', '--name', 'Pilot');
  const context = createLocalToolContext({ assetLibrary: localAssetLibrary(env) }, env);
  const defs = kilnMcpToolDefs(context);
  const mcp = async (name: string, args: Record<string, unknown>) => {
    const response = await runTool(defs.find((def) => def.name === name)!, args);
    return JSON.parse(
      (response.content.find((part) => part.type === 'text') as { text: string }).text,
    );
  };
  expect((await mcp('kiln_source', { programRef })).code).toBe(source);
  expect((await mcp('kiln_project', { action: 'get', projectId: 'pilot' })).project.name).toBe(
    'Pilot',
  );
  const { presets } = await mcp('kiln_material', { action: 'presets', tag: 'wood' });
  const { material } = await mcp('kiln_material', {
    action: 'create-preset',
    presetId: presets[0].id,
    seed: 1,
    size: 64,
    creator: 'Test fixture',
    license: {
      spdx: 'CC0-1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: '',
    },
  });
  const listed = JSON.parse(await cli('material', 'list'));
  expect(listed.materials[0].revisionId).toBe(material.revisionId);
  expect((await localProjectStore({ KILN_WORKSPACE: selected }).read('pilot')).name).toBe('Pilot');
  expect(await localProgramStore({ KILN_WORKSPACE: selected }).get(programRef)).toBe(source);
}, 20000);
