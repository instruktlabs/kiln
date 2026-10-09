import { expect, test } from 'bun:test';
import { createMcpHandler, type Tool } from '@modelcontextprotocol/server';
import { createKilnMcpServer } from '../../mcp-engine';
import type { MaterialLibrary } from '../../material-library';
import type { AssetLibrary } from '../../assets';

test('MCP SDK transports nested creation requirements and rejects invalid calls before storage', async () => {
  let storageCalls = 0;
  const materialLibrary = {
    list: async () => {
      storageCalls++;
      return [];
    },
  } as unknown as MaterialLibrary;
  const handler = createMcpHandler(
    () =>
      createKilnMcpServer(
        { materialLibrary, assetLibrary: { collections: () => [] } as unknown as AssetLibrary },
        { toolPresentation: 'operations' },
      ),
    { legacy: 'stateless', maxSubscriptions: 0 },
  );
  const rpc = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-11-25',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    const message = response.headers.get('content-type')?.includes('text/event-stream')
      ? text
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => JSON.parse(line.slice(5)))
          .findLast((value) => value.id !== undefined)
      : JSON.parse(text);
    expect(message.error).toBeUndefined();
    return message.result;
  };
  try {
    const init = await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'operation-contract-test', version: '1' },
    });
    expect(init.instructions).toContain('kiln_capabilities');
    expect(init.instructions).not.toContain('capabilities:true');
    const { tools } = (await rpc('tools/list')) as { tools: Tool[] };
    expect(tools).toHaveLength(21);
    const create = tools.find((tool) => tool.name === 'kiln_material_create')!;
    expect(create.inputSchema.required).toEqual(['definition']);
    const variants = (
      create.inputSchema.properties!.definition as { oneOf: { required: string[] }[] }
    ).oneOf;
    expect(variants).toHaveLength(2);
    expect(variants[0]!.required).toEqual(
      expect.arrayContaining(['kind', 'presetId', 'seed', 'creator', 'license']),
    );
    expect(variants[1]!.required).toEqual(expect.arrayContaining(['kind', 'draft']));
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(Buffer.byteLength(JSON.stringify(tool.inputSchema))).toBeLessThanOrEqual(5000);
    }
    expect(
      (
        await rpc('tools/call', {
          name: create.name,
          arguments: { definition: { kind: 'preset', presetId: 'wood' } },
        })
      ).isError,
    ).toBe(true);
    expect(storageCalls).toBe(0);
    expect(
      (await rpc('tools/call', { name: 'kiln_material_search', arguments: { scope: 'saved' } }))
        .isError,
    ).not.toBe(true);
    expect(storageCalls).toBe(1);
  } finally {
    await handler.close();
  }
});
