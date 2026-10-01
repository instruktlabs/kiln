/**
 * Builds the MCP manifest from the registry: the tool definitions exactly as
 * `tools/list` advertises them, plus the fixed resources and templates.
 *
 * The JSON Schema for each tool comes from the registry's zod schema through
 * the Standard JSON Schema interface, the same conversion the protocol library
 * applies when it is handed a zod schema, so the manifest is what the library
 * would have advertised -- minus the `$schema` keyword, because 2020-12 is the
 * dialect MCP assumes when none is named, and the keyword costs 56 bytes in
 * every one of the seventeen definitions a harness sends with every request.
 */
import type { z } from 'zod';

import { localAssetLibrary } from './assets-node';
import { createLocalToolContext } from './local-runtime';
import {
  KILN_RESOURCE_TEMPLATES,
  KILN_WIDGET_RESOURCE,
  type KilnMcpManifest,
  type KilnMcpManifestTemplate,
  type KilnMcpManifestTool,
} from './mcp-core';
import {
  createKilnProgramToolRegistry,
  type KilnToolContext,
  type KilnToolDef,
} from './tools/registry';

type StandardJsonSchemaCarrier = {
  '~standard': {
    jsonSchema?: {
      input(options: { target: string }): Record<string, unknown>;
      output(options: { target: string }): Record<string, unknown>;
    };
  };
};

const JSON_SCHEMA_TARGET = 'draft-2020-12';

function standardJsonSchema(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const carrier = schema as unknown as StandardJsonSchemaCarrier;
  const converter = carrier['~standard'].jsonSchema;
  if (!converter)
    throw new Error('The registry schema does not implement Standard JSON Schema (zod >= 4.2).');
  const { $schema: _dialect, ...rest } = converter[io]({ target: JSON_SCHEMA_TARGET });
  return rest;
}

/** The input schema as advertised: an object root first, the rest as converted. */
export function toolInputJsonSchema(def: KilnToolDef): KilnMcpManifestTool['inputSchema'] {
  const converted = standardJsonSchema(def.inputSchema, 'input');
  if (converted['type'] !== undefined && converted['type'] !== 'object')
    throw new Error(`${def.name}: a tool input schema must describe an object.`);
  return { type: 'object', ...converted };
}

/** One registry definition as one `tools/list` entry, keys in the order the wire has always carried them. */
export function toolManifestEntry(def: KilnToolDef): KilnMcpManifestTool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: toolInputJsonSchema(def),
    ...(def.annotations ? { annotations: def.annotations } : {}),
    ...(def.ui
      ? {
          _meta: {
            ui: { resourceUri: def.ui.resourceUri, visibility: ['model'] },
            'openai/outputTemplate': def.ui.resourceUri,
            'ui/resourceUri': def.ui.resourceUri,
          },
        }
      : {}),
    ...(def.outputSchema
      ? { outputSchema: { type: 'object', ...standardJsonSchema(def.outputSchema, 'output') } }
      : {}),
  };
}

/** Which templates a context can serve: asset files need a library, project packages a bundle reader. */
export function resourceTemplatesFor(context: KilnToolContext): KilnMcpManifestTemplate[] {
  return [
    ...(context.assetLibrary ? [KILN_RESOURCE_TEMPLATES.assetFile] : []),
    ...(context.projectBundleReader ? [KILN_RESOURCE_TEMPLATES.projectPackage] : []),
  ];
}

export function buildMcpManifest(defs: KilnToolDef[], context: KilnToolContext): KilnMcpManifest {
  return {
    kind: 'kiln.mcp-manifest.v1',
    tools: defs.map(toolManifestEntry),
    resources: [KILN_WIDGET_RESOURCE],
    resourceTemplates: resourceTemplatesFor(context),
  };
}

/**
 * The manifest the packaged server advertises: the full surface with both
 * templates, built from a context shaped like the packaged host's but with no
 * environment of its own, so the file is the same on every machine.
 */
export function packagedMcpManifest(): KilnMcpManifest {
  const context = createLocalToolContext({ assetLibrary: localAssetLibrary() }, {});
  return buildMcpManifest(createKilnProgramToolRegistry(context), context);
}
