/**
 * A project configured for the workspace (`KILN_PROJECT`) must be visible to
 * the agent: the baseline sessions of 1 October 2026 built every asset
 * standalone because nothing in a result or in Discovery named the project
 * (findings F1 and F8). Capabilities and the overview name it, and results
 * from a project-bound operation carry the exact revision that was used.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryProgramStore } from '../../program-store';
import { FileWorkspace } from '../../workspace-node';
import { createKilnProgramToolRegistry, type KilnToolDef } from '../registry';

const CUBE =
  "const meta = { name: 'Cube', category: 'prop' };\n" +
  "function build() {\n  const root = createRoot('Cube');\n" +
  "  createPart('Body', boxGeo(1, 1, 1), gameMaterial(0x808080), { position: [0, 0.5, 0], parent: root });\n" +
  '  return root;\n}\n';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function registry(configuredProject?: string) {
  const root = await mkdtemp(join(tmpdir(), 'kiln-configured-project-'));
  roots.push(root);
  const workspace = new FileWorkspace(root, configuredProject);
  const project = await workspace.projects.create({ projectId: 'troy', name: 'Troy' });
  const tools = createKilnProgramToolRegistry({
    workspace,
    projectStore: workspace.projects,
    programStore: new MemoryProgramStore(),
  });
  const tool = (name: string): KilnToolDef => {
    const found = tools.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`missing ${name}`);
    return found;
  };
  return { tool, project };
}

describe('the configured project is visible to the agent', () => {
  it('capabilities name the configured project and how to read it', async () => {
    const { tool } = await registry('troy');
    const result = (await tool('kiln_discover').run({ capabilities: true })) as {
      capabilities: { project?: { configured: string | null; read: string } };
    };
    expect(result.capabilities.project?.configured).toBe('troy');
    expect(result.capabilities.project?.read).toContain('kiln_project');
  });

  it('capabilities say when no project is configured', async () => {
    const { tool } = await registry();
    const result = (await tool('kiln_discover').run({ capabilities: true })) as {
      capabilities: { project?: { configured: string | null } };
    };
    expect(result.capabilities.project?.configured).toBeNull();
  });

  it('the overview tells the agent to read the configured project first', async () => {
    const { tool } = await registry('troy');
    const overview = (await tool('kiln_discover').run({})) as {
      text: string;
      orientation: { guidance: string[] };
    };
    expect(overview.text).toContain('troy');
    expect(overview.text).toContain('kiln_project');
    expect(overview.orientation.guidance.join('\n')).toContain('troy');
    const plain = (await (await registry()).tool('kiln_discover').run({})) as { text: string };
    expect(plain.text).not.toContain('troy');
  });

  it('a project-bound render names the exact project revision it used', async () => {
    const { tool, project } = await registry('troy');
    const bound = (await tool('kiln_render').run({ code: CUBE, capture: { preset: '1x1' } })) as {
      ok: boolean;
      project?: { projectId: string; revisionId: string };
    };
    expect(bound.ok).toBe(true);
    expect(bound.project).toEqual({ projectId: 'troy', revisionId: project.revisionId });
    const standalone = (await tool('kiln_render').run({
      code: CUBE,
      projectId: null,
      capture: { preset: '1x1' },
    })) as { ok: boolean; project?: unknown };
    expect(standalone.ok).toBe(true);
    expect(standalone.project).toBeUndefined();
  });
});
