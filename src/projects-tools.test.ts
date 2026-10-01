import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileProjectStore } from './projects-node';
import { createKilnProgramToolRegistry, createKilnNativeToolRegistry } from './tools/registry';
import { kilnMcpToolDefs, runTool } from './mcp-engine';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
test('project tools are host-backed and share exactly the MCP/native registry definition', async () => {
  expect(createKilnProgramToolRegistry().some((def) => def.name === 'kiln_project')).toBe(false);
  const root = await mkdtemp(join(tmpdir(), 'kiln-project-tools-'));
  roots.push(root);
  const context = { projectStore: new FileProjectStore(root) };
  const tool = kilnMcpToolDefs(context).find((def) => def.name === 'kiln_project')!;
  expect(tool).toBeDefined();
  expect(
    createKilnNativeToolRegistry(context, {}).find((def) => def.name === 'kiln_project')
      ?.description,
  ).toBe(tool.description);
  const created = (await tool.run({
    action: 'create',
    draft: { projectId: 'pilot', name: 'Pilot', brief: 'Foundation fixture' },
  })) as { project: { revisionId: string } };
  const wire = await runTool(tool, { action: 'get', projectId: 'pilot' });
  expect(JSON.parse((wire.content[0] as { text: string }).text).project.revisionId).toBe(
    created.project.revisionId,
  );
  const updated = (await tool.run({
    action: 'update',
    projectId: 'pilot',
    expectedRevision: created.project.revisionId,
    patch: { brief: 'Changed' },
  })) as { project: { revisionId: string } };
  expect((await context.projectStore.read('pilot')).revisionId).toBe(updated.project.revisionId);
  await expect(
    tool.run({
      action: 'update',
      projectId: 'pilot',
      expectedRevision: created.project.revisionId,
      patch: { brief: 'stale' },
    }),
  ).rejects.toThrow();
  await expect(
    tool.run({ action: 'create', draft: { name: 'Bad', requirements: { acceptance: 'off' } } }),
  ).rejects.toThrow();
});
