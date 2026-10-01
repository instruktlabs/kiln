/**
 * The repository's central claim, as a test.
 *
 * README says: "One tool definition, two transports. The in-process Strands skin and
 * the MCP server both iterate it, so tool names and schemas cannot drift apart."
 *
 * If someone hand-writes a tool in either skin, that sentence becomes false. These
 * tests are what stop that from happening quietly.
 */
import { describe, expect, it } from 'bun:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { createKilnNativeToolRegistry, createKilnProgramToolRegistry } from './tools/registry';
import { makeKilnNativeTools } from './agent/tools';
import { runTool, kilnMcpToolDefs, createKilnMcpServer } from './mcp-engine';

/**
 * List the tool surface the way a client sees it, over a real linked transport.
 *
 * Deliberately not a projection helper of our own: SDK v2 derives the advertised
 * JSON Schema from the registry's zod schema itself, so the only assertion worth
 * making is against what the SDK actually puts on the wire. A test against our own
 * converter would have been a test of the converter, not of the surface.
 */
async function listToolsOverMcp(): Promise<
  {
    name: string;
    description?: string;
    inputSchema: unknown;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  }[]
> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createKilnMcpServer();
  const client = new Client({ name: 'kiln-parity', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
    await server.close();
  }
}

describe('tool surface parity across transports', () => {
  it('advertises reads and immutable writes without destructive defaults', async () => {
    const tools = await listToolsOverMcp();
    for (const tool of tools) expect(tool.annotations?.destructiveHint).toBe(false);
    for (const name of ['kiln_source', 'kiln_discover', 'kiln_export'])
      expect(tools.find((t) => t.name === name)?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'kiln_save')?.annotations?.readOnlyHint).toBe(false);
  });
  it('the reference-based Strands skin shares every MCP definition plus terminal finish', () => {
    expect(makeKilnNativeTools({}, { assetLibrary: {} as never }).map((t) => t.name)).toEqual([
      ...kilnMcpToolDefs().map((d) => d.name),
      'kiln_finish',
    ]);
  });
  it('the MCP skin advertises its defs verbatim', async () => {
    const defs = kilnMcpToolDefs();
    const advertised = await listToolsOverMcp();

    expect(advertised.map((t) => t.name)).toEqual(defs.map((d) => d.name));
    for (let i = 0; i < defs.length; i++) {
      // Descriptions are model-facing surface area. A skin that paraphrases is a
      // skin that has drifted.
      expect(advertised[i]!.description).toBe(defs[i]!.description);
    }
  });

  it('every MCP def is a registry factory def, not a hand-written one', () => {
    // The claim is "one tool definition, two transports". It survives only while
    // no skin authors a def of its own, so compare against the factories rather
    // than against a list of names someone could edit to match.
    const factories = createKilnProgramToolRegistry();
    const canonical = new Map(factories.map((d) => [d.name, d.description]));

    for (const def of kilnMcpToolDefs()) {
      expect(canonical.has(def.name)).toBe(true);
      expect(def.description).toBe(canonical.get(def.name) ?? '<missing>');
    }
  });

  it('the MCP surface carries one unified kiln_render and no native terminal', () => {
    expect(kilnMcpToolDefs().map((d) => d.name)).toEqual([
      'kiln_discover',
      'kiln_renderer',
      'kiln_validate',
      'kiln_render',
      'kiln_screenshot_animation',
      'kiln_view_interior',
      'kiln_inspect',
      'kiln_edit',
      'kiln_source',
      'kiln_save',
      'kiln_assets',
      'kiln_present',
      'kiln_export',
      'kiln_import',
    ]);

    const mcpRender = kilnMcpToolDefs().find((d) => d.name === 'kiln_render')!;
    expect(mcpRender.description).toContain('capture');
    expect(mcpRender.description).toContain('perspective');
    expect(mcpRender.mediaMulti).toBeDefined();
    // The substituted def is the one that can actually return an image.
    expect(mcpRender.media).toBeDefined();
    expect(kilnMcpToolDefs().map((d) => d.name)).not.toContain('kiln_screenshot');
  });

  it('both skins share Discovery and validation definitions verbatim', () => {
    const registry = createKilnProgramToolRegistry();
    const mcp = new Map(kilnMcpToolDefs().map((d) => [d.name, d.description]));
    const strands = new Map(
      makeKilnNativeTools({}, {}).map((t) => {
        const tool = t as { name: string; description?: string };
        return [tool.name, tool.description];
      }),
    );

    for (const name of ['kiln_discover', 'kiln_validate']) {
      const def = registry.find((d) => d.name === name)!;
      expect(mcp.get(name)).toBeDefined();
      expect(strands.get(name)).toBe(def.description);
    }
  });

  it('native availability follows the canonical registry and excludes unconfigured delivery tools', () => {
    const canonical = createKilnNativeToolRegistry({}, {});
    const actual = makeKilnNativeTools({}, {});
    expect(actual.map((t) => t.name)).toEqual(canonical.map((d) => d.name));
    for (const name of ['kiln_save', 'kiln_assets', 'kiln_present', 'kiln_export', 'kiln_import'])
      expect(actual.map((t) => t.name)).not.toContain(name);
    expect(actual.at(-1)?.name).toBe('kiln_finish');
  });

  it('every exposed schema reaches the client as usable JSON Schema', async () => {
    // The SDK derives these from the registry's zod schemas. A def whose schema
    // failed to convert would still register and would still be listed — it would
    // just arrive with nothing a client could fill in, which is worse than a crash.
    for (const tool of await listToolsOverMcp()) {
      const schema = tool.inputSchema as { type?: string; properties?: object };
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    }
  });

  it('the MCP render def returns an image block, not a description of one', async () => {
    const def = kilnMcpToolDefs().find((d) => d.name === 'kiln_render');
    expect(def).toBeDefined();

    const code = `
const meta = { name: 'ParityCube', category: 'prop' };
function build() {
  const root = createRoot('ParityCube');
  createPart('Body', boxGeo(1, 1, 1), gameMaterial(0x808080), { position: [0, 0.5, 0], parent: root });
  return root;
}
`;
    const result = await runTool(def!, { code });
    const kinds = result.content.map((c) => c.type);
    expect(kinds).toContain('image');
    expect(kinds).toContain('text');

    const image = result.content.find((c) => c.type === 'image') as {
      data: string;
    };
    // A PNG, base64-encoded: the agent literally sees the render.
    expect(Buffer.from(image.data, 'base64').subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it('a failing tool call is an error result, not a thrown transport failure', async () => {
    const def = kilnMcpToolDefs().find((d) => d.name === 'kiln_render');
    const result = await runTool(def!, {
      code: 'this is not valid kiln source',
    }).catch(() => undefined);
    // Either the def handled it and returned content, or runTool surfaced it — what
    // must never happen is an unhandled rejection killing the MCP session.
    expect(result).toBeDefined();
  });
});

/**
 * A tool a client refuses to register is worse than a missing tool: the server looks
 * healthy, `tools/list` succeeds, and only the call site fails.
 *
 * Zod renders `z.tuple` as JSON Schema 2020-12 -- `prefixItems` plus `items: false`,
 * meaning "nothing beyond the listed positions". That is correct, and it is also
 * unreadable to a consumer written against draft-07, where `items` must be a schema.
 * VS Code's tool validator tests `items` for truthiness, so `false` reads to it as an
 * array with no items and it rejects the whole tool:
 *
 *   Failed to validate tool mcp_kiln_kiln_edit: tool parameters array type must have items
 *
 * Five of the thirteen tools carried one, and they were the authoring loop --
 * `kiln_render`, `kiln_edit`, `kiln_inspect`, `kiln_view_interior` and
 * `kiln_screenshot_animation` -- so an asset could not be built in that host at all.
 */
describe('every advertised schema is readable by a draft-07 consumer', () => {
  function arraysWithUnusableItems(schema: unknown, path: string): string[] {
    if (!schema || typeof schema !== 'object') return [];
    if (Array.isArray(schema))
      return schema.flatMap((entry, index) => arraysWithUnusableItems(entry, `${path}[${index}]`));
    const node = schema as Record<string, unknown>;
    const declared = node['type'];
    const isArray = declared === 'array' || (Array.isArray(declared) && declared.includes('array'));
    // Truthiness, not presence: `items: false` is the 2020-12 spelling that trips this.
    const here = isArray && !node['items'] ? [path] : [];
    return [
      ...here,
      ...Object.entries(node).flatMap(([key, value]) =>
        arraysWithUnusableItems(value, `${path}.${key}`),
      ),
    ];
  }

  it('no array in any tool schema has a falsy items keyword', async () => {
    const tools = await listToolsOverMcp();
    expect(tools.length).toBeGreaterThan(0);
    const offenders = tools.flatMap((tool) =>
      arraysWithUnusableItems(tool.inputSchema, `${tool.name}.inputSchema`),
    );
    expect(offenders).toEqual([]);
  });

  it('a three-number vector still round-trips exactly three numbers', async () => {
    const tools = await listToolsOverMcp();
    const render = tools.find((tool) => tool.name === 'kiln_render')!;
    // Whatever shape it is advertised as, the bound has to survive the change: this
    // fix must not quietly widen a camera vector into an unbounded number list.
    const json = JSON.stringify(render.inputSchema);
    expect(json).toContain('"maxItems":3');
    expect(json).toContain('"minItems":3');
  });
});

/**
 * The portability fix above traded a tuple for a bounded uniform array. What must not
 * have changed is what the server accepts, because every other harness was already
 * working: loosening a camera vector into an unbounded number list would be a silent
 * regression for all of them in exchange for a fix one host needed.
 */
describe('a camera vector is still exactly three numbers at runtime', () => {
  const camera = (position: unknown) => ({
    code: "const meta = { name: 'B', category: 'prop' }; function build() { const root = createRoot('B'); createPart('Body', boxGeo(1,1,1), gameMaterial(0x808080), { position: [0,0.5,0], parent: root }); return root; }",
    capture: {
      version: 'kiln.capture.v1',
      shots: [{ camera: { type: 'explicit', projection: 'perspective', position } }],
    },
  });
  const refusal = async (position: unknown) => {
    const def = kilnMcpToolDefs().find((entry) => entry.name === 'kiln_render')!;
    const result = await runTool(def, camera(position)).catch((error) => ({
      isError: true as const,
      content: [{ type: 'text', text: String(error) }],
    }));
    return { failed: result.isError === true, text: JSON.stringify(result) };
  };

  it('accepts exactly three numbers', async () => {
    expect((await refusal([3, 2, 4])).failed).toBe(false);
  });

  /**
   * Matched on the message zod actually produces, not on "some error appeared". An
   * earlier draft of this test asserted a generic /invalid|error/ and passed on an
   * unrelated "Unrecognized key" from a malformed `capture` -- it was green while
   * measuring nothing about arity at all.
   */
  it.each([
    ['two numbers', [1, 2], /position: Too small: expected array to have exactly 3 items/],
    ['four numbers', [1, 2, 3, 4], /position: Too big: expected array to have exactly 3 items/],
    ['a non-number member', [1, 2, 'three'], /position\.2[^"]*expected number/],
    ['not an array at all', 3, /position: Invalid input: expected array, received number/],
  ])('rejects %s', async (_label, position, expected) => {
    const { failed, text } = await refusal(position);
    expect(failed).toBe(true);
    expect(text).toMatch(expected);
  });
});
