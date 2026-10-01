/**
 * Contract rule 2: the handshake, discovery and the tool list are answered
 * before the engine loads, and before the workspace or the renderer is touched.
 *
 * Codex waits one second for an optional server and then goes on without its
 * tools; on 0.9.0 the first answer took 1.1 to 1.7 s because the entry imported
 * the whole engine (three, zod, sharp, the registry), checked the workspace's
 * skill hashes and probed the renderer before it would speak. The fix is a
 * thin entry: `dist/mcp-server.mjs` carries only the protocol library and a
 * generated tool manifest, and loads `dist/mcp-engine.mjs` on the first call
 * that needs it. Configuration problems found at that point come back as tool
 * results the agent can act on, not as a dead server.
 *
 * The 300 ms figure in the plan is measured by the capture rig on the
 * maintainer's PC; runner speed varies too much to assert it here. What is
 * asserted is structure: what the entry imports, and that the three answers
 * arrive with no engine bundle on disk at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CUBE_PROGRAM,
  LEGACY_REVISIONS,
  REPO_ROOT,
  SERVER_BUNDLE,
  modernMeta,
  resultJson,
  startStdioServer,
  type StdioServer,
} from './stdio-mcp';

const ALLOWED_ENTRY_IMPORTS = [
  '@modelcontextprotocol/server',
  '@modelcontextprotocol/server/stdio',
  '@modelcontextprotocol/ext-apps/server',
];
/** The engine bundle alone is about 2.8 MB; the entry must stay a fraction of that. */
const MAX_ENTRY_BYTES = 400_000;

let root: string;
const servers: StdioServer[] = [];
const start = async (
  options: { cwd?: string; env?: Record<string, string>; bundle?: string } = {},
) => {
  const server = await startStdioServer({
    cwd: options.cwd ?? root,
    env: options.env,
    bundle: options.bundle,
  });
  servers.push(server);
  return server;
};
const legacyInit = (server: StdioServer) =>
  server.request('initialize', {
    protocolVersion: LEGACY_REVISIONS[0],
    capabilities: {},
    clientInfo: { name: 'kiln-contract-tests', version: '0' },
  });

beforeAll(async () => {
  await mkdir(join(REPO_ROOT, 'tmp'), { recursive: true });
  root = await mkdtemp(join(REPO_ROOT, 'tmp', 'mcp-startup-'));
});
afterAll(async () => {
  for (const server of servers) server.kill();
  await rm(root, { recursive: true, force: true });
});

describe('contract rule 2: the first answers come before the engine', () => {
  it('the entry bundle imports only the protocol library and Node built-ins', async () => {
    const source = await readFile(SERVER_BUNDLE, 'utf8');
    expect(source.length).toBeLessThan(MAX_ENTRY_BYTES);
    const specifiers = [
      ...source.matchAll(/^import\s+(?:[^'"\n]+?\s+from\s+)?["']([^"']+)["']/gmu),
      ...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/gu),
      ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu),
    ].map((match) => match[1]!);
    expect(specifiers.length).toBeGreaterThan(0);
    const outside = specifiers.filter(
      (name) => !name.startsWith('node:') && !ALLOWED_ENTRY_IMPORTS.includes(name),
    );
    expect(outside).toEqual([]);
  });

  it('answers the handshake, discovery and the tool list with no engine bundle on disk', async () => {
    // Only the entry is copied: the engine bundle it would load beside itself
    // is absent, so any answer that needed the engine could not be given.
    const alone = join(root, 'entry-only');
    await mkdir(join(alone, 'dist'), { recursive: true });
    const bundle = join(alone, 'dist', 'mcp-server.mjs');
    await copyFile(SERVER_BUNDLE, bundle);

    const legacy = await start({ bundle, cwd: alone });
    const init = await legacyInit(legacy);
    expect(init.error, legacy.stderr()).toBeUndefined();
    expect(init.result!['protocolVersion']).toBe(LEGACY_REVISIONS[0]);
    legacy.notify('notifications/initialized');
    const listed = await legacy.request('tools/list', {});
    expect(listed.error).toBeUndefined();
    expect((listed.result!['tools'] as unknown[]).length).toBe(17);
    // The first call that needs the engine reports the missing bundle as a
    // tool result with the next step, and the process stays up.
    const call = await legacy.request('tools/call', {
      name: 'kiln_validate',
      arguments: { code: CUBE_PROGRAM },
    });
    expect(call.error).toBeUndefined();
    expect(call.result!['isError']).toBe(true);
    const text = (call.result!['content'] as { type: string; text?: string }[])
      .map((block) => block.text ?? '')
      .join('\n');
    expect(text).toContain('mcp-engine.mjs');
    expect(text).toContain('kiln-init');
    expect(text).not.toContain(alone);
    const stillUp = await legacy.request('tools/list', {});
    expect(stillUp.error).toBeUndefined();
    await legacy.close();

    const modern = await start({ bundle, cwd: alone });
    const discover = await modern.request('server/discover', { _meta: modernMeta() });
    expect(discover.error, modern.stderr()).toBeUndefined();
    expect(discover.result!['supportedVersions']).toContain('2026-07-28');
    const tools = await modern.request('tools/list', { _meta: modernMeta() });
    expect((tools.result!['tools'] as unknown[]).length).toBe(17);
    await modern.close();
  });

  it('reports a stale or missing workspace as a tool result instead of dying at startup', async () => {
    // An empty directory is not a Kiln workspace. Before the fix the server
    // printed the diagnostic to stderr and exited 1 before answering anything,
    // so the harness saw a dead server and the agent never saw the fix.
    const workspace = join(root, 'not-a-workspace');
    await mkdir(workspace, { recursive: true });
    const server = await start({ env: { KILN_WORKSPACE: workspace } });
    const init = await legacyInit(server);
    expect(init.error, server.stderr()).toBeUndefined();
    server.notify('notifications/initialized');
    const call = await server.request('tools/call', {
      name: 'kiln_validate',
      arguments: { code: CUBE_PROGRAM },
    });
    expect(call.error).toBeUndefined();
    expect(call.result!['isError']).toBe(true);
    const text = (call.result!['content'] as { text?: string }[])
      .map((b) => b.text ?? '')
      .join('\n');
    expect(text).toContain('workspace');
    expect(text).toContain('kiln-init');
    // Rule 9: the diagnostic names the step without an absolute local path.
    expect(text).not.toContain(workspace);
    expect(text).not.toContain(REPO_ROOT);
    await server.close();
  });

  it('reports an invalid KILN_RENDER value as a tool result that names the accepted values', async () => {
    const server = await start({ env: { KILN_RENDER: 'invalid-render-mode' } });
    const init = await legacyInit(server);
    expect(init.error, server.stderr()).toBeUndefined();
    server.notify('notifications/initialized');
    const call = await server.request('tools/call', {
      name: 'kiln_validate',
      arguments: { code: CUBE_PROGRAM },
    });
    expect(call.error).toBeUndefined();
    expect(call.result!['isError']).toBe(true);
    const text = (call.result!['content'] as { text?: string }[])
      .map((b) => b.text ?? '')
      .join('\n');
    expect(text).toContain('KILN_RENDER');
    expect(text).toContain('cpu');
    await server.close();
  });

  it('serves a real call once the engine loads on demand, and reports how long the first answer took', async () => {
    const server = await start();
    const started = performance.now();
    const init = await legacyInit(server);
    const firstAnswerMs = Math.round(performance.now() - started);
    expect(init.error, server.stderr()).toBeUndefined();
    server.notify('notifications/initialized');
    const call = await server.request('tools/call', {
      name: 'kiln_validate',
      arguments: { code: CUBE_PROGRAM },
    });
    expect(call.result!['isError']).not.toBe(true);
    expect(resultJson(call)['programRef']).toMatch(/^p_[0-9a-f]{12}$/u);
    // Informational: the plan's 300 ms is a rig measurement, not a CI assertion.
    console.log(`first answer after process start: ${firstAnswerMs} ms (includes Node startup)`);
    await server.close();
  });
});
