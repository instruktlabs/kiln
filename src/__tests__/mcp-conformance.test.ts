/**
 * Contract rule 1: the built server speaks both protocol eras over stdio.
 *
 * Agy opens with `server/discover` and stateless 2026-07-28 requests; Claude
 * Code and OpenCode still open with `initialize` at 2025-11-25 and Codex at
 * 2025-06-18 (all measured first-hand on 1 October 2026). Every one of those
 * openings has to work against the one bundle each harness launches, so this
 * drives `dist/mcp-server.mjs` under `node` with hand-written JSON-RPC rather
 * than the reference client, which would negotiate on the test's behalf.
 *
 * The wire shapes and error codes come from the 2026-07-28 specification:
 * a request missing a required `_meta` field is malformed (`-32602`); an
 * unsupported protocol version is `-32022` with the supported list in `data`;
 * complete results of `server/discover`, `tools/list`, `resources/read` and
 * `resources/templates/list` carry `ttlMs` and `cacheScope`; every result
 * carries `resultType`; `subscriptions/listen` is acknowledged first with the
 * subscription id, and the acknowledged filter omits types the server does not
 * support. Contract rule 11 (a stable, byte-identical tool list across processes,
 * `listChanged` only when Kiln emits it) and the prompt exit on stdin close are
 * proved here too, because they need the same raw driver.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  EXTENSION_ID as MCP_APPS_EXTENSION_ID,
  RESOURCE_MIME_TYPE as MCP_APPS_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { ENGINE_VERSION } from '../engine-identity';
import { KILN_ASSET_WIDGET_URI } from '../tools/registry';
import {
  CLIENT_CAPABILITIES_KEY,
  CLIENT_INFO_KEY,
  CUBE_PROGRAM,
  LEGACY_REVISIONS,
  MODERN_REVISION,
  PROTOCOL_VERSION_KEY,
  REPO_ROOT,
  SERVER_INFO_KEY,
  SUBSCRIPTION_ID_KEY,
  modernMeta,
  resultJson,
  startStdioServer,
  type JsonRpcMessage,
  type StdioServer,
} from './stdio-mcp';

const EXPECTED_TOOLS = [
  'kiln_assets',
  'kiln_discover',
  'kiln_edit',
  'kiln_export',
  'kiln_import',
  'kiln_inspect',
  'kiln_material',
  'kiln_present',
  'kiln_project',
  'kiln_render',
  'kiln_renderer',
  'kiln_review',
  'kiln_save',
  'kiln_screenshot_animation',
  'kiln_source',
  'kiln_validate',
  'kiln_view_interior',
];
const ASSET_FILE_TEMPLATE = 'kiln://assets/{collection}/{asset}/{revision}/{file}';
const UNKNOWN_REVISION = '1900-01-01';

let root: string;
const servers: StdioServer[] = [];
const start = async (): Promise<StdioServer> => {
  const server = await startStdioServer({ cwd: root });
  servers.push(server);
  return server;
};

beforeAll(async () => {
  await mkdir(join(REPO_ROOT, 'tmp'), { recursive: true });
  root = await mkdtemp(join(REPO_ROOT, 'tmp', 'mcp-conformance-'));
});
afterAll(async () => {
  for (const server of servers) server.kill();
  await rm(root, { recursive: true, force: true });
});

const expectComplete = (message: JsonRpcMessage) => {
  expect(message.error, JSON.stringify(message.error)).toBeUndefined();
  const result = message.result!;
  expect(result['resultType']).toBe('complete');
  expect(result['_meta']).toEqual(
    expect.objectContaining({ [SERVER_INFO_KEY]: { name: 'kiln', version: ENGINE_VERSION } }),
  );
  return result;
};

const expectCacheable = (result: Record<string, unknown>) => {
  expect(Number.isInteger(result['ttlMs'])).toBe(true);
  expect(result['ttlMs'] as number).toBeGreaterThanOrEqual(0);
  expect(['public', 'private']).toContain(result['cacheScope'] as string);
};

const toolNames = (message: JsonRpcMessage) =>
  ((message.result?.['tools'] ?? []) as { name: string }[]).map((tool) => tool.name).sort();

describe('contract rule 1: the 2025 handshake revisions', () => {
  for (const revision of LEGACY_REVISIONS) {
    it(`initialize at ${revision}, then tools/list, tools/call, resources/read and templates`, async () => {
      const server = await start();
      const init = await server.request('initialize', {
        protocolVersion: revision,
        capabilities: {},
        clientInfo: { name: 'kiln-contract-tests', version: '0' },
      });
      expect(init.error, server.stderr()).toBeUndefined();
      expect(init.result!['protocolVersion']).toBe(revision);
      expect(init.result!['serverInfo']).toEqual(
        expect.objectContaining({ name: 'kiln', version: ENGINE_VERSION }),
      );
      expect(typeof init.result!['instructions']).toBe('string');
      const capabilities = init.result!['capabilities'] as Record<string, Record<string, unknown>>;
      expect(capabilities['tools']).toBeDefined();
      expect(capabilities['resources']).toBeDefined();
      expect(capabilities['extensions']).toEqual(
        expect.objectContaining({ [MCP_APPS_EXTENSION_ID]: { mimeTypes: [MCP_APPS_MIME_TYPE] } }),
      );
      server.notify('notifications/initialized');

      const list = await server.request('tools/list', {});
      expect(list.error).toBeUndefined();
      expect(toolNames(list)).toEqual(EXPECTED_TOOLS);
      for (const tool of list.result!['tools'] as {
        name: string;
        inputSchema: { type?: string };
      }[]) {
        expect(tool.inputSchema.type, tool.name).toBe('object');
      }

      const call = await server.request('tools/call', {
        name: 'kiln_validate',
        arguments: { code: CUBE_PROGRAM },
      });
      expect(call.error).toBeUndefined();
      expect(call.result!['isError']).not.toBe(true);
      expect(resultJson(call)['programRef']).toMatch(/^p_[0-9a-f]{12}$/u);

      const read = await server.request('resources/read', { uri: KILN_ASSET_WIDGET_URI });
      expect(read.error).toBeUndefined();
      const contents = read.result!['contents'] as {
        uri: string;
        mimeType: string;
        text?: string;
      }[];
      expect(contents[0]!.uri).toBe(KILN_ASSET_WIDGET_URI);
      expect(contents[0]!.mimeType).toBe(MCP_APPS_MIME_TYPE);
      expect(contents[0]!.text!.length).toBeGreaterThan(1000);

      const templates = await server.request('resources/templates/list', {});
      expect(templates.error).toBeUndefined();
      expect(
        (templates.result!['resourceTemplates'] as { uriTemplate: string }[]).map(
          (t) => t.uriTemplate,
        ),
      ).toContain(ASSET_FILE_TEMPLATE);
      await server.close();
    });
  }

  it('answers an initialize naming an unknown revision with a revision it supports', async () => {
    const server = await start();
    const init = await server.request('initialize', {
      protocolVersion: UNKNOWN_REVISION,
      capabilities: {},
      clientInfo: { name: 'kiln-contract-tests', version: '0' },
    });
    expect(init.error, server.stderr()).toBeUndefined();
    expect(LEGACY_REVISIONS as readonly string[]).toContain(
      init.result!['protocolVersion'] as string,
    );
    await server.close();
  });
});

describe('contract rule 1: the 2026-07-28 stateless revision', () => {
  it('answers server/discover with the supported versions, capabilities, identity and cache hints', async () => {
    const server = await start();
    const discover = await server.request('server/discover', { _meta: modernMeta() });
    expect(discover.error, server.stderr()).toBeUndefined();
    const result = expectComplete(discover);
    expect(result['supportedVersions']).toContain(MODERN_REVISION);
    const capabilities = result['capabilities'] as Record<string, Record<string, unknown>>;
    expect(capabilities['tools']).toBeDefined();
    expect(capabilities['resources']).toBeDefined();
    expect(capabilities['extensions']).toEqual(
      expect.objectContaining({ [MCP_APPS_EXTENSION_ID]: { mimeTypes: [MCP_APPS_MIME_TYPE] } }),
    );
    expect(typeof result['instructions']).toBe('string');
    expectCacheable(result);
    await server.close();
  });

  it('serves tools/list, tools/call, resources/read and templates statelessly on a fresh process', async () => {
    // No server/discover first: the spec says a client may invoke any RPC inline.
    const server = await start();
    const list = await server.request('tools/list', { _meta: modernMeta() });
    expect(list.error, server.stderr()).toBeUndefined();
    const listResult = expectComplete(list);
    expectCacheable(listResult);
    expect(toolNames(list)).toEqual(EXPECTED_TOOLS);

    const call = await server.request('tools/call', {
      name: 'kiln_validate',
      arguments: { code: CUBE_PROGRAM },
      _meta: modernMeta(),
    });
    const callResult = expectComplete(call);
    expect(callResult['isError']).not.toBe(true);
    expect(resultJson(call)['programRef']).toMatch(/^p_[0-9a-f]{12}$/u);

    const read = await server.request('resources/read', {
      uri: KILN_ASSET_WIDGET_URI,
      _meta: modernMeta(),
    });
    const readResult = expectComplete(read);
    expectCacheable(readResult);
    const contents = readResult['contents'] as { mimeType: string; text?: string }[];
    expect(contents[0]!.mimeType).toBe(MCP_APPS_MIME_TYPE);
    expect(contents[0]!.text!.length).toBeGreaterThan(1000);

    const templates = await server.request('resources/templates/list', { _meta: modernMeta() });
    const templatesResult = expectComplete(templates);
    expectCacheable(templatesResult);
    expect(
      (templatesResult['resourceTemplates'] as { uriTemplate: string }[]).map((t) => t.uriTemplate),
    ).toContain(ASSET_FILE_TEMPLATE);

    const resources = await server.request('resources/list', { _meta: modernMeta() });
    expectCacheable(expectComplete(resources));
    await server.close();
  });

  it('refuses an unsupported protocol version with -32022 and the versions it supports', async () => {
    const server = await start();
    const refused = await server.request('tools/list', { _meta: modernMeta(UNKNOWN_REVISION) });
    expect(refused.result).toBeUndefined();
    expect(refused.error!.code).toBe(-32022);
    const data = refused.error!.data as { supported: string[]; requested: string };
    expect(data.supported).toContain(MODERN_REVISION);
    expect(data.requested).toBe(UNKNOWN_REVISION);
    // The refusal is per request: a supported revision on the same process still works.
    const list = await server.request('tools/list', { _meta: modernMeta() });
    expect(list.error).toBeUndefined();
    expect(toolNames(list)).toEqual(EXPECTED_TOOLS);
    await server.close();
  });

  it('refuses a request whose envelope lacks the client capabilities block with -32602', async () => {
    const server = await start();
    const refused = await server.request('tools/list', {
      _meta: {
        [PROTOCOL_VERSION_KEY]: MODERN_REVISION,
        [CLIENT_INFO_KEY]: { name: 'kiln-contract-tests', version: '0' },
      },
    });
    expect(refused.result).toBeUndefined();
    expect(refused.error!.code).toBe(-32602);
    expect(refused.error!.message).toContain(CLIENT_CAPABILITIES_KEY);
    await server.close();
  });

  it('refuses a request with neither a protocol version nor a prior handshake with -32602', async () => {
    // Malformed under 2026-07-28 (no required envelope) and premature under
    // 2025-11-25 (nothing may precede initialize), so it is refused either way,
    // and the message says what to send instead.
    const server = await start();
    const refused = await server.request('tools/list', {});
    expect(refused.result, server.stderr()).toBeUndefined();
    expect(refused.error!.code).toBe(-32602);
    expect(refused.error!.message).toContain('initialize');
    expect(refused.error!.message).toContain(PROTOCOL_VERSION_KEY);
    // The refusal does not poison the process: a handshake afterwards is served.
    const init = await server.request('initialize', {
      protocolVersion: LEGACY_REVISIONS[0],
      capabilities: {},
      clientInfo: { name: 'kiln-contract-tests', version: '0' },
    });
    expect(init.error).toBeUndefined();
    expect(init.result!['protocolVersion']).toBe(LEGACY_REVISIONS[0]);
    server.notify('notifications/initialized');
    const list = await server.request('tools/list', {});
    expect(toolNames(list)).toEqual(EXPECTED_TOOLS);
    await server.close();
  });

  it('acknowledges subscriptions/listen first and omits notification types Kiln never emits', async () => {
    const server = await start();
    const id = server.send('subscriptions/listen', {
      _meta: modernMeta(),
      notifications: {
        toolsListChanged: true,
        resourcesListChanged: true,
        promptsListChanged: true,
      },
    });
    const ack = await server.notification('notifications/subscriptions/acknowledged');
    const params = ack.params as {
      _meta: Record<string, unknown>;
      notifications: Record<string, unknown>;
    };
    expect(params._meta[SUBSCRIPTION_ID_KEY]).toBe(id);
    // Kiln's tool and resource lists are fixed for a build, so no list-changed
    // notification is ever emitted and none may be acknowledged.
    expect(params.notifications).toEqual({});
    // The stream stays open: a request on the same process still works beside it.
    const list = await server.request('tools/list', { _meta: modernMeta() });
    expect(toolNames(list)).toEqual(EXPECTED_TOOLS);
    server.notify('notifications/cancelled', { requestId: id });
    await server.close();
  });
});

describe('contract rule 11: a stable tool list', () => {
  it('returns the same tool definitions, byte for byte and in the same order, from two processes', async () => {
    const [first, second] = await Promise.all([start(), start()]);
    const [a, b] = await Promise.all([
      first.request('tools/list', { _meta: modernMeta() }),
      second.request('tools/list', { _meta: modernMeta() }),
    ]);
    expect(a.error).toBeUndefined();
    expect(JSON.stringify(a.result!['tools'])).toBe(JSON.stringify(b.result!['tools']));
    await Promise.all([first.close(), second.close()]);
  });

  it('advertises listChanged for neither tools nor resources, because nothing emits it', async () => {
    const server = await start();
    const discover = await server.request('server/discover', { _meta: modernMeta() });
    const modern = discover.result!['capabilities'] as Record<string, Record<string, unknown>>;
    expect(modern['tools']!['listChanged']).not.toBe(true);
    expect(modern['resources']!['listChanged']).not.toBe(true);
    await server.close();
    const legacy = await start();
    const init = await legacy.request('initialize', {
      protocolVersion: LEGACY_REVISIONS[0],
      capabilities: {},
      clientInfo: { name: 'kiln-contract-tests', version: '0' },
    });
    const capabilities = init.result!['capabilities'] as Record<string, Record<string, unknown>>;
    expect(capabilities['tools']!['listChanged']).not.toBe(true);
    expect(capabilities['resources']!['listChanged']).not.toBe(true);
    await legacy.close();
  });
});

describe('stdio shutdown', () => {
  it('exits promptly, without an error, when its standard input closes', async () => {
    const server = await start();
    const init = await server.request('initialize', {
      protocolVersion: LEGACY_REVISIONS[0],
      capabilities: {},
      clientInfo: { name: 'kiln-contract-tests', version: '0' },
    });
    expect(init.error, server.stderr()).toBeUndefined();
    const exit = await server.close();
    expect(exit.code).toBe(0);
    // About 20 ms on the maintainer's PC; the bound only has to catch a server
    // that waits for something else before leaving.
    expect(exit.ms).toBeLessThan(5000);
  });
});
