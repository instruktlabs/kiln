/**
 * A program can be given as a workspace file (`file`) as well as `code` or
 * `programRef`. In OpenCode's code mode the model quoted an 8 KB program
 * inside a JavaScript template literal, failed, and fell back to the CLI for
 * every call (finding F2); a path needs no quoting. The file must be inside
 * the workspace: a path relative to its root, or an absolute path below it,
 * with no `..` and no link that leads out of it.
 *
 * #423: an agent whose working folder was not the workspace could not tell
 * where files had to go, because the error named no root. The errors and
 * Discovery now name the workspace root and the setting that chose it.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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

async function scratch(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function workspace(env: Record<string, string> = {}) {
  const root = await scratch('kiln-source-file-');
  await writeFile(join(root, 'asset.kiln.js'), CUBE);
  const context = createLocalToolContext(
    { programStore: new MemoryProgramStore() },
    { KILN_WORKSPACE: root, KILN_RENDER: 'cpu', KILN_EVALUATOR_MODE: 'in-process', ...env },
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

  it('accepts an absolute path inside the workspace, in any spelling the platform accepts', async () => {
    const { root, tool } = await workspace();
    const spellings = [join(root, 'asset.kiln.js'), `${root}/asset.kiln.js`];
    // NTFS names, drive letters included, compare without case.
    if (process.platform === 'win32')
      spellings.push(
        join(root.toUpperCase(), 'asset.kiln.js'),
        join(root.toLowerCase(), 'ASSET.KILN.JS'),
      );
    for (const file of spellings) {
      const result = (await tool('kiln_validate').run({ file })) as { valid: boolean };
      expect(result.valid, file).toBe(true);
    }
  });

  it('refuses a path outside the workspace, naming the root and the setting that chose it', async () => {
    const { root, tool } = await workspace();
    const elsewhere = await scratch('kiln-source-elsewhere-');
    await writeFile(join(elsewhere, 'asset.kiln.js'), CUBE);
    for (const file of [
      '../outside.js',
      'nested/../asset.kiln.js',
      'C:/elsewhere/asset.js',
      'C:asset.kiln.js',
      join(elsewhere, 'asset.kiln.js'),
      join(root, '..', 'asset.kiln.js'),
      // A sibling whose name extends the root's is not inside it.
      `${root}-sibling/asset.kiln.js`,
    ]) {
      const attempt = tool('kiln_validate').run({ file });
      await expect(attempt, file).rejects.toThrow('workspace');
      await expect(attempt, file).rejects.toThrow(root);
      await expect(attempt, file).rejects.toThrow('KILN_WORKSPACE');
    }
  });

  it('refuses a link inside the workspace that leads out of it', async () => {
    const { root, tool } = await workspace();
    const elsewhere = await scratch('kiln-source-linked-');
    await writeFile(join(elsewhere, 'outside.kiln.js'), CUBE);
    // A junction needs no privilege on Windows; elsewhere the type is ignored.
    await symlink(elsewhere, join(root, 'linked'), 'junction');
    await mkdir(join(root, 'inner'));
    await writeFile(join(root, 'inner', 'inside.kiln.js'), CUBE);
    await symlink(join(root, 'inner'), join(root, 'alias'), 'junction');
    for (const file of ['linked/outside.kiln.js', join(root, 'linked', 'outside.kiln.js')]) {
      const attempt = tool('kiln_validate').run({ file });
      await expect(attempt, file).rejects.toThrow('outside the workspace');
      await expect(attempt, file).rejects.toThrow(root);
    }
    // A link that stays inside is an ordinary path.
    const inside = (await tool('kiln_validate').run({ file: 'alias/inside.kiln.js' })) as {
      valid: boolean;
    };
    expect(inside.valid).toBe(true);
  });

  it('names the root and the server working directory when nothing configures a workspace', async () => {
    const root = await scratch('kiln-source-cwd-');
    const previous = process.cwd();
    process.chdir(root);
    try {
      const context = createLocalToolContext(
        { programStore: new MemoryProgramStore() },
        { KILN_RENDER: 'cpu', KILN_EVALUATOR_MODE: 'in-process' },
      );
      const validate = createKilnProgramToolRegistry(context).find(
        (candidate) => candidate.name === 'kiln_validate',
      )!;
      const attempt = validate.run({ file: 'scene.kiln.js' });
      await expect(attempt).rejects.toThrow('was not found in the workspace');
      await expect(attempt).rejects.toThrow(process.cwd());
      await expect(attempt).rejects.toThrow('working directory');
      await expect(attempt).rejects.toThrow('KILN_WORKSPACE');
    } finally {
      process.chdir(previous);
    }
  });

  it('reports the workspace root and how it was chosen in Discovery capabilities', async () => {
    const { root, tool } = await workspace();
    const result = (await tool('kiln_discover').run({ capabilities: true })) as {
      capabilities: { source: { file: unknown } };
      text: string;
    };
    expect(result.capabilities.source.file).toEqual({
      workspaceRoot: root,
      selectedBy: 'KILN_WORKSPACE',
      paths: 'relative to workspaceRoot, or absolute inside it; no ".."',
    });
    expect(result.text).toContain(JSON.stringify(root).slice(1, -1));
    const embedded = createKilnProgramToolRegistry({ programStore: new MemoryProgramStore() }).find(
      (candidate) => candidate.name === 'kiln_discover',
    )!;
    const hosted = (await embedded.run({ capabilities: true })) as {
      capabilities: { source: { file: unknown } };
    };
    expect(hosted.capabilities.source.file).toBeNull();
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
