import type { Tool } from '@modelcontextprotocol/server';

export const HOSTED_TOOL_SURFACE = 'kiln.hosted-tools.v1';

interface Operation {
  description: string;
  fields: readonly string[];
}

// Routing and field selection only. Every field's schema comes from the pinned
// engine registry; the engine still owns parsing, requirements and execution.
const actions: Record<string, Record<string, Operation>> = {
  kiln_renderer: {
    status: { description: 'Inspect the hosted renderer status.', fields: [] },
    reprobe: {
      description:
        'Refresh renderer availability for this hosted call. Does not install or repair a service.',
      fields: [],
    },
  },
  kiln_material: {
    presets: {
      description: 'List shipped material recipes, optionally filtered by tag.',
      fields: ['tag'],
    },
    'create-preset': {
      description:
        'Bake and retain an immutable material from a shipped preset. Supply presetId, seed, creator and license; pin the returned materialId/revisionId for rendering.',
      fields: ['presetId', 'seed', 'creator', 'license', 'size', 'materialId'],
    },
    list: {
      description: 'List private material revisions, optionally filtered by tag.',
      fields: ['tag'],
    },
    get: {
      description:
        'Read a private material revision, provenance and portable material specification. Supply materialId; omit revisionId only when the material has one revision.',
      fields: ['materialId', 'revisionId'],
    },
    'create-procedural': {
      description:
        'Bake and retain an immutable material from a bounded procedural draft. Supply draft; pin the returned materialId/revisionId for rendering. Does not fetch URLs or execute source.',
      fields: ['draft'],
    },
    import: {
      description:
        'Import complete normalized material records and embedded PNGs into the private account. Supply payload. Does not fetch URLs or execute source.',
      fields: ['payload'],
    },
  },
  kiln_assets: {
    collections: {
      description:
        'List the private account asset collections. A collection is a storage destination, not project membership.',
      fields: [],
    },
    catalog: {
      description: 'Search saved assets across the private account collections, with pagination.',
      fields: ['assetId', 'query', 'offset', 'limit'],
    },
    list: {
      description: 'Search saved assets in one private account collection, with pagination.',
      fields: ['collection', 'assetId', 'query', 'offset', 'limit'],
    },
    get: {
      description:
        'Read a saved asset revision and its authenticated download links. Supply assetId; omit revisionId for the newest revision.',
      fields: ['collection', 'assetId', 'revisionId'],
    },
    restore: {
      description:
        'Restore exact saved source as a retained programRef for editing or rendering. Supply assetId; omit revisionId for the newest revision. Does not overwrite the saved revision. Binary-only assets have no source.',
      fields: ['collection', 'assetId', 'revisionId'],
    },
  },
};

const direct = new Set([
  'kiln_discover',
  'kiln_validate',
  'kiln_render',
  'kiln_screenshot_animation',
  'kiln_view_interior',
  'kiln_inspect',
  'kiln_edit',
  'kiln_source',
  'kiln_save',
  'kiln_present',
  'kiln_export',
  'kiln_import',
]);

const nativeJob =
  ' Runs an isolated hosted job and consumes the account request quota. Temporary job records and any produced artifacts are retained under the hosted retention policy.';
export const hostedInstructions =
  'Kiln turns authored JavaScript into editable GLB assets in your private account. ' +
  'Use kiln_discover for geometry helper contracts and input shapes; it cannot execute operations. ' +
  'Use kiln_capabilities for hosted runtime facts. Send new source once to kiln_validate or kiln_render, ' +
  'then preserve the exact programRef for later reads, edits and renders. ' +
  'Read viewFidelity before judging materials: CPU images show geometry; software-rendered PBR views can show materials. ' +
  'Rendering is managed by the service and requires no local installation. ' +
  'Each material, asset and renderer operation has its own named tool. ' +
  'Engine diagnostics can mention their local multi-action names; use the corresponding exposed operation here. ' +
  'Save only when requested. Unsaved work expires after seven days; saved assets remain until deleted within quotas.';

interface Route {
  engineName: string;
  fixed: Record<string, unknown>;
  tool: Tool;
}

export function createPublicTools(engineTools: readonly Tool[]) {
  const routes = new Map<string, Route>();
  const seen = new Set<string>();
  function add(
    original: Tool,
    name: string,
    fields: readonly string[],
    fixed: Record<string, unknown>,
    description: string,
  ) {
    const schema = original.inputSchema;
    const properties = Object.fromEntries(
      fields.map((key) => {
        if (!Object.hasOwn(schema.properties ?? {}, key))
          throw new Error(`Missing engine field ${original.name}.${key}`);
        return [key, structuredClone(schema.properties![key])];
      }),
    );
    const tool = {
      ...structuredClone(original),
      name,
      description: description + (name === 'kiln_discover' ? '' : nativeJob),
      inputSchema: {
        ...structuredClone(schema),
        properties,
        additionalProperties: false,
        required: (schema.required ?? []).filter((key) => fields.includes(key)),
      },
      annotations: {
        ...original.annotations,
        // Even private reads use a stateful, quota-admitted native job. This
        // conservative hosted annotation differs deliberately from local reads.
        readOnlyHint: name === 'kiln_discover',
        destructiveHint: original.annotations?.destructiveHint ?? false,
        openWorldHint: original.annotations?.openWorldHint ?? false,
      },
    } as Tool;
    if (routes.has(name)) throw new Error('Duplicate hosted tool');
    routes.set(name, { engineName: original.name, fixed, tool });
  }
  for (const tool of engineTools) {
    if (seen.has(tool.name)) throw new Error('Duplicate engine tool');
    seen.add(tool.name);
    const operations = actions[tool.name];
    if (operations) {
      const advertised = tool.inputSchema.properties?.action as { enum?: unknown } | undefined;
      const expected = Object.keys(operations).sort();
      if (
        !Array.isArray(advertised?.enum) ||
        JSON.stringify([...advertised.enum].sort()) !== JSON.stringify(expected)
      )
        throw new Error(`Unreviewed engine actions in ${tool.name}`);
      for (const [action, operation] of Object.entries(operations)) {
        add(
          tool,
          `${tool.name}_${action.replaceAll('-', '_')}`,
          operation.fields,
          { action },
          operation.description,
        );
      }
    } else {
      if (!direct.has(tool.name)) throw new Error(`Unreviewed engine tool ${tool.name}`);
      const fields = Object.keys(tool.inputSchema.properties ?? {});
      if (fields.includes('action')) throw new Error(`Unreviewed engine actions in ${tool.name}`);
      if (tool.name === 'kiln_discover') {
        if (!fields.includes('capabilities')) throw new Error('Missing engine capabilities input');
        add(
          tool,
          tool.name,
          fields.filter((key) => key !== 'capabilities'),
          {},
          'Read the Kiln geometry-helper catalog and complete input shapes. Search with ordinary modeling language, or fetch up to six exact IDs. Does not execute source, fetch URLs, or expose hidden callable operations.',
        );
        add(
          tool,
          'kiln_capabilities',
          [],
          { capabilities: true },
          'Inspect this hosted runtime, supported rendering, camera and storage capabilities.',
        );
      } else {
        add(
          tool,
          tool.name,
          fields,
          {},
          tool.name === 'kiln_import'
            ? 'Copy a pinned private asset revision between account collections, preserving identity and provenance. Copies do not track later edits.'
            : (tool.description ?? tool.name),
        );
      }
    }
  }
  if (seen.size !== direct.size + Object.keys(actions).length)
    throw new Error('Missing engine tools');
  return {
    tools: [...routes.values()].map((route) => route.tool),
    // A caller cannot pick an engine action, supply unadvertised arguments, or
    // introduce another tool. No fallback to the local multi-action names.
    resolve(
      name: string,
      args: Record<string, unknown>,
    ): { name: string; arguments: Record<string, unknown> } | undefined {
      const route = routes.get(name);
      if (
        !route ||
        Object.keys(args).some(
          (key) => !Object.hasOwn(route.tool.inputSchema.properties ?? {}, key),
        )
      )
        return undefined;
      return { name: route.engineName, arguments: { ...args, ...route.fixed } };
    },
  };
}
