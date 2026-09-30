/**
 * The published MCP entry point, exercised the way a client actually uses it.
 *
 * `mcp-parity.test.ts` proves the defs are projected faithfully; nothing there
 * proves `bun run src/mcp-server.ts` starts, speaks the protocol, and puts real
 * PNG bytes on the wire. This spawns the server as a subprocess over stdio and
 * drives it with the reference client, so a broken entry point fails here rather
 * than in someone's editor.
 */
import { describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { kilnMcpToolDefs } from './mcp-server';
import { createLocalToolContext } from './local-runtime';
import { localAssetLibrary } from './assets-node';

const CUBE = `
const meta = { name: 'SmokeCube', category: 'prop' };
function build() {
  const root = createRoot('SmokeCube');
  createPart('Body', boxGeo(1, 1, 1), gameMaterial(0x808080), { position: [0, 0.5, 0], parent: root });
  return root;
}
`;

async function connect(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['run', 'src/mcp-server.ts'],
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    // Pin CPU so the smoke result cannot vary with the runner's GPU.
    env: { ...process.env, KILN_RENDER: 'cpu' } as Record<string, string>,
  });
  const client = new Client({ name: 'kiln-smoke', version: '0' });
  await client.connect(transport);
  return client;
}

describe('mcp server over real stdio', () => {
  it('starts, handshakes, and serves the composed tool surface', async () => {
    const client = await connect();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(
        kilnMcpToolDefs(createLocalToolContext({ assetLibrary: localAssetLibrary() })).map(
          (d) => d.name,
        ),
      );
      for (const t of tools) {
        const schema = t.inputSchema as { type?: string; properties?: object };
        expect(schema.type).toBe('object');
        expect(
          schema.properties ?? (schema as { oneOf?: unknown }).oneOf,
          JSON.stringify({ name: t.name, schema }),
        ).toBeDefined();
      }
    } finally {
      await client.close();
    }
  }, 120_000);

  it('puts real PNG bytes on the wire for kiln_render', async () => {
    const client = await connect();
    try {
      const res = (await client.callTool({
        name: 'kiln_render',
        arguments: { code: CUBE },
      })) as { content: { type: string; data?: string }[] };

      const image = res.content.find((c) => c.type === 'image');
      expect(image).toBeDefined();
      const bytes = Buffer.from(image!.data!, 'base64');
      // Not a description of a render — the render.
      expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(bytes.byteLength).toBeGreaterThan(1_000);
    } finally {
      await client.close();
    }
  }, 120_000);

  it('survives a malformed program without dropping the session', async () => {
    const client = await connect();
    try {
      const res = (await client.callTool({
        name: 'kiln_render',
        arguments: { code: 'this is not valid kiln source' },
      })) as { content: { type: string }[] };
      // kiln_render never throws — it reports. Either way the session must live.
      expect(res.content.length).toBeGreaterThan(0);

      const after = await client.listTools();
      expect(after.tools.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  }, 120_000);
});
