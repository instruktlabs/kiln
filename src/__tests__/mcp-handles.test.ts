/**
 * Contract rule 10: a programRef is a durable handle. It works from another
 * process that shares the program store, an unknown handle is a tool result
 * that names the next call and no local path, and the tools that issue
 * handles say how long they are kept.
 *
 * The baseline sessions of 1 October 2026 showed why: a harness restarts the
 * server between turns (Codex) or opens a second one, and an agent that lost
 * its handle re-sent the whole program -- 8 KB of source per retry.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { KILN_MCP_MANIFEST } from '../mcp-server';
import {
  CUBE_PROGRAM,
  LEGACY_REVISIONS,
  REPO_ROOT,
  resultJson,
  startStdioServer,
  type StdioServer,
} from './stdio-mcp';

const UNKNOWN_HANDLE = 'p_000000000000';
const HANDLE_ISSUERS = ['kiln_validate', 'kiln_render', 'kiln_edit'];

let root: string;
const servers: StdioServer[] = [];
const start = async () => {
  const server = await startStdioServer({
    cwd: root,
    env: { KILN_PROGRAM_STORE: join(root, 'shared-store') },
  });
  servers.push(server);
  const init = await server.request('initialize', {
    protocolVersion: LEGACY_REVISIONS[0],
    capabilities: {},
    clientInfo: { name: 'kiln-contract-tests', version: '0' },
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
  root = await mkdtemp(join(REPO_ROOT, 'tmp', 'mcp-handles-'));
});
afterAll(async () => {
  // A server still holding the store keeps Windows from removing the directory.
  for (const server of servers) {
    server.kill();
    await server.exited;
  }
  await rm(root, { recursive: true, force: true });
});

describe('contract rule 10: durable program handles', () => {
  it('a handle issued in one process resolves in another process sharing the store', async () => {
    const first = await start();
    const validated = await first.request('tools/call', {
      name: 'kiln_validate',
      arguments: { code: CUBE_PROGRAM },
    });
    expect(validated.result!['isError']).not.toBe(true);
    const programRef = resultJson(validated)['programRef'] as string;
    expect(programRef).toMatch(/^p_[0-9a-f]{12}$/u);
    await first.close();

    const second = await start();
    const source = await second.request('tools/call', {
      name: 'kiln_source',
      arguments: { programRef, query: 'createRoot' },
    });
    expect(source.result!['isError'], text(source)).not.toBe(true);
    expect(text(source)).toContain('createRoot');
    await second.close();
  });

  it('an unknown handle is a result that names the next call and no local path', async () => {
    const server = await start();
    for (const [name, args] of [
      ['kiln_source', { programRef: UNKNOWN_HANDLE, query: 'createRoot' }],
      ['kiln_render', { programRef: UNKNOWN_HANDLE, capture: { preset: '1x1' } }],
    ] as const) {
      const call = await server.request('tools/call', { name, arguments: args });
      expect(call.error, name).toBeUndefined();
      const body = text(call);
      // kiln_render reports through its result; kiln_source through isError.
      expect(call.result!['isError'] === true || /"ok":\s*false/u.test(body), body).toBe(true);
      expect(body).toContain(UNKNOWN_HANDLE);
      expect(body).toContain('kiln_validate');
      expect(body).toContain('programRef');
      expect(body).not.toContain(root);
      expect(body).not.toContain(REPO_ROOT);
    }
    await server.close();
  });

  it('every tool that issues a handle says how long it is kept', () => {
    for (const name of HANDLE_ISSUERS) {
      const tool = KILN_MCP_MANIFEST.tools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      expect(tool!.description, name).toMatch(/program store/u);
      expect(tool!.description, name).toMatch(/across (sessions|processes)/u);
    }
  });
});
