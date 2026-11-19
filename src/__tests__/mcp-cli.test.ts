/**
 * `kiln mcp` starts the stdio server from the package's default executable.
 *
 * The official MCP registry derives its launch command from the npm package
 * name, and `npx @instruktlabs/kiln` runs the `kiln` executable, not `kiln-mcp`.
 * `server.json` therefore passes `mcp`, and this command must answer exactly as
 * `dist/mcp-server.mjs` does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { LEGACY_REVISIONS, REPO_ROOT, startStdioServer, type StdioServer } from './stdio-mcp';

const CLI_BUNDLE = join(REPO_ROOT, 'dist', 'cli.mjs');
let root: string;
const servers: StdioServer[] = [];

beforeAll(async () => {
  await mkdir(join(REPO_ROOT, 'tmp'), { recursive: true });
  root = await mkdtemp(join(REPO_ROOT, 'tmp', 'mcp-cli-'));
});
afterAll(async () => {
  // Closing stdin ends the wrapped server too; killing only the wrapper would leave it holding the directory.
  for (const server of servers) await server.close();
  await rm(root, { recursive: true, force: true });
});

describe('kiln mcp', () => {
  it('serves the same tool list over stdio as kiln-mcp', async () => {
    const server = await startStdioServer({ cwd: root, bundle: CLI_BUNDLE, args: ['mcp'] });
    servers.push(server);
    const init = await server.request('initialize', {
      protocolVersion: LEGACY_REVISIONS[0],
      capabilities: {},
      clientInfo: { name: 'kiln-contract-tests', version: '0' },
    });
    expect(init.error).toBeUndefined();
    server.notify('notifications/initialized');
    const list = await server.request('tools/list', {});
    const tools = ((list.result?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
    expect(tools).toContain('kiln_render');
    expect(tools).toContain('kiln_discover');
  });

  it('refuses extra arguments without starting a server', async () => {
    const child = Bun.spawn(['node', CLI_BUNDLE, 'mcp', '--bogus'], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const code = await child.exited;
    expect(code).toBe(2);
    expect(await new Response(child.stderr).text()).toContain('kiln mcp takes no arguments');
  });
});
