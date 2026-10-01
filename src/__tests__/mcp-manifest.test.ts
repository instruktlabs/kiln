/**
 * The stdio entry advertises definitions from `src/generated/mcp-manifest.json`,
 * not from the registry at runtime, so the committed file must equal what the
 * registry builds. Contract rule 11 (one stable tool list, identical in every
 * process) rests on this file being current.
 */
import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { KILN_RESOURCE_TEMPLATES, KILN_WIDGET_RESOURCE, type KilnMcpManifest } from '../mcp-core';
import { packagedMcpManifest } from '../mcp-manifest';

const FILE = resolve(import.meta.dir, '../generated/mcp-manifest.json');
const committed = async () => JSON.parse(await readFile(FILE, 'utf8')) as KilnMcpManifest;

describe('generated MCP manifest', () => {
  it('equals what the registry builds (after a tool change: bun run mcp:manifest)', async () => {
    expect(await committed()).toEqual(JSON.parse(JSON.stringify(packagedMcpManifest())));
  });

  it('lists the packaged surface with no dialect noise', async () => {
    const manifest = await committed();
    expect(manifest.kind).toBe('kiln.mcp-manifest.v1');
    expect([...manifest.tools.map((tool) => tool.name)].sort()).toEqual([
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
    ]);
    for (const tool of manifest.tools) {
      expect(tool.inputSchema.type).toBe('object');
      // A flat object, or (until step 2 of the v1 plan flattens the three host
      // services) a discriminated union of flat objects.
      expect(
        tool.inputSchema['properties'] ?? tool.inputSchema['anyOf'] ?? tool.inputSchema['oneOf'],
        tool.name,
      ).toBeDefined();
      expect(tool.annotations).toBeDefined();
    }
    // 2020-12 is the dialect MCP assumes; naming it costs bytes in every request.
    expect(JSON.stringify(manifest)).not.toContain('$schema');
    expect(manifest.resources).toEqual([KILN_WIDGET_RESOURCE]);
    expect(manifest.resourceTemplates).toEqual([
      KILN_RESOURCE_TEMPLATES.assetFile,
      KILN_RESOURCE_TEMPLATES.projectPackage,
    ]);
  });
});
