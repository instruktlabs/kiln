/**
 * #423: an independent benchmark agent fell back to the CLI and skipped
 * collections because the MCP tools "couldn't read files from the working
 * folder". The stdio server's workspace is KILN_WORKSPACE, else the folder
 * above KILN_PROGRAM_STORE's `.kiln`, else the server's own working directory;
 * when that is not the folder the agent writes in, a relative `file` is not
 * found, an absolute one was refused outright, and the error named no root.
 *
 * Measured over the built server on stdio, the way a harness receives it: the
 * server starts in one folder, the agent's program sits in another.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CUBE_PROGRAM,
  LEGACY_REVISIONS,
  REPO_ROOT,
  resultJson,
  startStdioServer,
  type StdioServer,
} from './stdio-mcp';

let base: string;
let install: string;
let agent: string;
const servers: StdioServer[] = [];

const start = async (cwd: string, env: Record<string, string>) => {
  const server = await startStdioServer({
    cwd,
    env: { KILN_COLLECTIONS: '', KILN_LIVE_REVIEW: 'off', ...env },
  });
  servers.push(server);
  const init = await server.request('initialize', {
    protocolVersion: LEGACY_REVISIONS[0],
    capabilities: {},
    clientInfo: { name: 'kiln-file-workspace-tests', version: '0' },
  });
  expect(init.error, server.stderr()).toBeUndefined();
  server.notify('notifications/initialized');
  return server;
};
const text = (message: Awaited<ReturnType<StdioServer['request']>>) =>
  (message.result?.['content'] as { text?: string }[] | undefined)
    ?.map((block) => block.text ?? '')
    .join('\n') ?? '';

beforeAll(async () => {
  await mkdir(join(REPO_ROOT, 'tmp'), { recursive: true });
  base = await mkdtemp(join(REPO_ROOT, 'tmp', 'mcp-file-workspace-'));
  install = join(base, 'install');
  agent = join(base, 'agent');
  await mkdir(install);
  await mkdir(agent);
  await writeFile(join(agent, 'scene.kiln.js'), CUBE_PROGRAM);
});
afterAll(async () => {
  for (const server of servers) {
    server.kill();
    await server.exited;
  }
  await rm(base, { recursive: true, force: true });
});

describe('MCP file input when the agent works outside the server folder (#423)', () => {
  it('names the workspace root and how it was chosen, in the error and in Discovery', async () => {
    // A plain registration: no KILN_WORKSPACE and no program store, started elsewhere.
    const server = await start(install, { KILN_PROGRAM_STORE: '' });
    const missing = await server.request('tools/call', {
      name: 'kiln_validate',
      arguments: { file: 'scene.kiln.js' },
    });
    expect(missing.result!['isError']).toBe(true);
    const body = text(missing);
    expect(body).toContain('was not found in the workspace');
    expect(body).toContain(install);
    expect(body).toContain('working directory');
    expect(body).toContain('KILN_WORKSPACE');
    const outside = await server.request('tools/call', {
      name: 'kiln_validate',
      arguments: { file: join(agent, 'scene.kiln.js') },
    });
    expect(outside.result!['isError']).toBe(true);
    expect(text(outside)).toContain(`outside the workspace ${install}`);
    const discovered = await server.request('tools/call', {
      name: 'kiln_discover',
      arguments: { capabilities: true },
    });
    expect(discovered.result!['isError'], text(discovered)).not.toBe(true);
    // The capability page is a heading line and one line of JSON.
    const reply = text(discovered);
    const capabilities = JSON.parse(reply.slice(reply.indexOf('\n') + 1)) as {
      source: { file: { workspaceRoot: string; selectedBy: string } };
    };
    expect(capabilities.source.file).toMatchObject({ workspaceRoot: install, selectedBy: 'cwd' });
    await server.close();
  }, 60_000); // Two stdio starts and an engine load: 2-4 s idle, 20+ s on a loaded Windows host.

  it('renders from an absolute file in the agent folder and saves it to a collection', async () => {
    // Started by the harness in the agent's folder, as Claude Code and Codex start
    // a project server; the agent names its file by absolute path.
    const server = await start(agent, { KILN_PROGRAM_STORE: '' });
    const rendered = await server.request('tools/call', {
      name: 'kiln_render',
      arguments: { file: join(agent, 'scene.kiln.js'), capture: { preset: '1x1' } },
    });
    expect(rendered.result!['isError'], text(rendered)).not.toBe(true);
    const { programRef } = resultJson(rendered) as { programRef: string };
    expect(programRef).toMatch(/^p_[0-9a-f]{12}$/u);
    const saved = await server.request('tools/call', {
      name: 'kiln_save',
      arguments: { programRef, name: 'Bakery Cube' },
    });
    expect(saved.result!['isError'], text(saved)).not.toBe(true);
    const { collection, asset } = resultJson(saved) as {
      collection: string;
      asset: { assetId: string };
    };
    expect(collection).toBe('project');
    expect(await readdir(join(agent, 'assets', 'kiln'))).toContain(asset.assetId);
    await server.close();
  }, 60_000); // As above, plus one CPU render and a save.

  it('follows a program store that names the agent folder when the server starts elsewhere', async () => {
    const server = await start(install, {
      KILN_PROGRAM_STORE: join(agent, '.kiln', 'programs'),
    });
    for (const file of ['scene.kiln.js', join(agent, 'scene.kiln.js')]) {
      const validated = await server.request('tools/call', {
        name: 'kiln_validate',
        arguments: { file },
      });
      expect(validated.result!['isError'], text(validated)).not.toBe(true);
    }
    await server.close();
  }, 60_000);
});
