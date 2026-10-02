/**
 * Contract rules 3 to 6 of the v1 readiness cycle, checked over the definitions
 * the packaged server advertises -- the generated manifest is what every
 * harness receives:
 *
 *   3. plain schemas: an object root with properties and no root combinator;
 *   4. small schemas: at most 5,000 bytes each;
 *   5. short text: instructions at most 700 characters with the first 512
 *      self-contained, descriptions at most 1,024 with the purpose stated
 *      inside the first 250;
 *   6. small total: every definition together at most 45,000 characters.
 *
 * Each limit is the strictest a measured harness imposes: Claude Code drops a
 * tool whose root is a combinator and cuts text at 2,048, Codex compacts large
 * schemas and surfaces only a description's opening, OpenCode sends every
 * definition on every request.
 */
import { describe, expect, it } from 'bun:test';

import { MCP_SERVER_INSTRUCTIONS } from '../../mcp-core';
import { packagedMcpManifest } from '../../mcp-manifest';

const MAX_SCHEMA_BYTES = 5_000;
const MAX_DEFINITIONS_CHARS = 45_000;
const MAX_INSTRUCTIONS_CHARS = 700;
const SELF_CONTAINED_INSTRUCTIONS_CHARS = 512;
const MAX_DESCRIPTION_CHARS = 1_024;
const PURPOSE_CHARS = 250;

const manifest = packagedMcpManifest();
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

describe('contract rules 3 to 6: the advertised tool definitions', () => {
  it('advertises every tool as a plain object schema with no root combinator (rule 3)', () => {
    for (const tool of manifest.tools) {
      const schema = tool.inputSchema;
      expect(schema.type, tool.name).toBe('object');
      expect(schema['properties'], tool.name).toBeDefined();
      for (const combinator of ['oneOf', 'anyOf', 'allOf'])
        expect(schema[combinator], `${tool.name} has a root ${combinator}`).toBeUndefined();
    }
  });

  it('keeps every input schema within 5,000 bytes (rule 4)', () => {
    for (const tool of manifest.tools) {
      const size = bytes(tool.inputSchema);
      expect(size, `${tool.name} schema is ${size} bytes`).toBeLessThanOrEqual(MAX_SCHEMA_BYTES);
    }
  });

  it('keeps the server instructions short, with the essentials in the first 512 characters (rule 5)', () => {
    expect(MCP_SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS_CHARS);
    // What a client that cuts at 512 must still have read: what Kiln makes, the
    // reference workflow, where contracts come from, and what an image proves.
    const opening = MCP_SERVER_INSTRUCTIONS.slice(0, SELF_CONTAINED_INSTRUCTIONS_CHARS);
    for (const essential of ['GLB', 'programRef', 'kiln_discover', 'viewFidelity'])
      expect(opening).toContain(essential);
  });

  it('opens every description with its purpose and stays within 1,024 characters (rule 5)', () => {
    for (const tool of manifest.tools) {
      const description = tool.description;
      expect(description.length, tool.name).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
      // A sentence, not a field list: a capitalised verb phrase that ends inside 250.
      expect(description, tool.name).toMatch(/^[A-Z]/u);
      const end = description.search(/[.!?](\s|$)/u);
      expect(end, `${tool.name}: no sentence end`).toBeGreaterThanOrEqual(0);
      expect(end + 1, `${tool.name}: first sentence ends at ${end + 1}`).toBeLessThanOrEqual(
        PURPOSE_CHARS,
      );
    }
  });

  it('keeps every definition together within 45,000 characters (rule 6)', () => {
    const total = JSON.stringify(manifest.tools).length;
    const largest = [...manifest.tools]
      .sort((a, b) => bytes(b) - bytes(a))
      .slice(0, 3)
      .map((tool) => `${tool.name} ${bytes(tool)}`);
    expect(total, `definitions total ${total}; largest ${largest.join(', ')}`).toBeLessThanOrEqual(
      MAX_DEFINITIONS_CHARS,
    );
  });
});
