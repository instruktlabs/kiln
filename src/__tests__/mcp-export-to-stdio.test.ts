/**
 * `kiln_export_to` through the packaged stdio executable (#207): advertised and
 * writing when the host sets `KILN_EXPORT_ROOT`, and a wrong root reported as a
 * tool result naming the fix, never a write elsewhere.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { REPO_ROOT, SERVER_BUNDLE } from './stdio-mcp';

const CODE =
  "const meta = { name: 'Box' }; function build() { const root = createRoot('Box'); createPart('Body', boxGeo(1,1,1), gameMaterial(0x88aa66), {parent: root, position: [0,0.5,0]}); return root; }";

let root: string;
beforeAll(async () => {
  await mkdir(join(REPO_ROOT, 'tmp'), { recursive: true });
  root = await mkdtemp(join(REPO_ROOT, 'tmp', 'mcp-export-to-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function connect(exportRoot: string) {
  const client = new Client({ name: 'export-to-stdio', version: '0' });
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_BUNDLE],
    cwd: root,
    env: {
      ...process.env,
      KILN_WORKSPACE: '',
      KILN_PROJECT: '',
      KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
      KILN_COLLECTIONS: JSON.stringify({ project: join(root, 'collection') }),
      KILN_RENDER: 'cpu',
      KILN_BUILD_CACHE: 'memory',
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_LIVE_REVIEW: 'off',
      KILN_EXPORT_ROOT: exportRoot,
    } as Record<string, string>,
    stderr: 'pipe',
  });
  await client.connect(transport);
  return client;
}

const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as { type: string; text?: string }[]).find((block) => block.type === 'text')!
    .text!;

test('a configured export root advertises kiln_export_to and receives the files', async () => {
  const exportRoot = join(root, 'exports');
  await mkdir(exportRoot);
  const client = await connect(exportRoot);
  try {
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === 'kiln_export_to')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    const { programRef } = JSON.parse(
      text(await client.callTool({ name: 'kiln_validate', arguments: { code: CODE } })),
    );
    const saved = await client.callTool({
      name: 'kiln_save',
      arguments: { programRef, name: 'Box' },
    });
    expect(saved.isError, text(saved)).not.toBe(true);
    const { asset } = JSON.parse(text(saved));
    const result = await client.callTool({
      name: 'kiln_export_to',
      arguments: { assetId: asset.assetId, revisionId: asset.revisionId, path: 'out/box.glb' },
    });
    expect(result.isError, text(result)).not.toBe(true);
    expect(text(result)).not.toContain(root);
    expect(JSON.parse(text(result)).files.map((file: { path: string }) => file.path)).toEqual([
      'out/box.glb',
      'out/box.kiln-metadata.json',
    ]);
    expect((await readdir(join(exportRoot, 'out'))).sort()).toEqual([
      'box.glb',
      'box.kiln-metadata.json',
    ]);
  } finally {
    await client.close();
  }
});

test('a wrong export root is a tool result naming the fix', async () => {
  const client = await connect('exports');
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('kiln_export_to');
    const result = await client.callTool({
      name: 'kiln_export_to',
      arguments: { assetId: 'a', revisionId: 'r', path: 'box.glb' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('KILN_EXPORT_ROOT must be an absolute directory');
  } finally {
    await client.close();
  }
});
