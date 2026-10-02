/**
 * A program can be given as a workspace file (`file`) as well as `code` or
 * `programRef`. In OpenCode's code mode the model quoted an 8 KB program
 * inside a JavaScript template literal, failed, and fell back to the CLI for
 * every call (finding F2); a path needs no quoting. The file must be inside
 * the workspace: no absolute paths and no `..`.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLocalToolContext } from '../../local-runtime';
import { toolInputJsonSchema } from '../../mcp-manifest';
import { MemoryProgramStore } from '../../program-store';
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

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-source-file-'));
  roots.push(root);
  await writeFile(join(root, 'asset.kiln.js'), CUBE);
  const context = createLocalToolContext(
    { programStore: new MemoryProgramStore() },
    { KILN_WORKSPACE: root, KILN_RENDER: 'cpu', KILN_EVALUATOR_MODE: 'in-process' },
  );
  const tools = createKilnProgramToolRegistry(context);
  const tool = (name: string): KilnToolDef => {
    const found = tools.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`missing ${name}`);
    return found;
  };
  return { root, tool };
}

describe('a workspace file as the program source', () => {
  it('validates a file inside the workspace and returns a handle for it', async () => {
    const { tool } = await workspace();
    const result = (await tool('kiln_validate').run({ file: 'asset.kiln.js' })) as {
      valid: boolean;
      programRef: string;
    };
    expect(result.valid).toBe(true);
    expect(result.programRef).toMatch(/^p_[0-9a-f]{12}$/u);
    const source = (await tool('kiln_source').run({
      programRef: result.programRef,
      query: 'createRoot',
    })) as { found: boolean };
    expect(source.found).toBe(true);
  });

  it('refuses a path outside the workspace, naming the rule and no local path', async () => {
    const { root, tool } = await workspace();
    for (const file of ['../outside.js', join(root, 'asset.kiln.js'), 'C:/elsewhere/asset.js']) {
      const attempt = tool('kiln_validate').run({ file });
      await expect(attempt).rejects.toThrow('inside the workspace');
      await expect(attempt).rejects.not.toThrow(root);
    }
  });

  it('wants exactly one of code, programRef and file', async () => {
    const { tool } = await workspace();
    await expect(tool('kiln_validate').run({ code: CUBE, file: 'asset.kiln.js' })).rejects.toThrow(
      'exactly one',
    );
    await expect(tool('kiln_validate').run({})).rejects.toThrow('exactly one');
  });

  it('advertises the field only where a workspace can serve it', async () => {
    const { tool } = await workspace();
    const advertised = toolInputJsonSchema(tool('kiln_render'));
    expect(advertised['properties']).toHaveProperty('file');
    const embedded = createKilnProgramToolRegistry({ programStore: new MemoryProgramStore() }).find(
      (candidate) => candidate.name === 'kiln_render',
    )!;
    expect(toolInputJsonSchema(embedded)['properties']).not.toHaveProperty('file');
  });
});
