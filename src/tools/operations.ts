import { z } from 'zod';
import type { KilnToolContext, KilnToolDef } from './registry';
import { projectActionSchemas } from './operation-contract';

/** Adapt domain operations in the engine, never in a transport-specific skin. */
export function projectOperationDefs(
  defs: readonly KilnToolDef[],
  context: KilnToolContext,
): KilnToolDef[] {
  return defs.flatMap((def) => {
    if (
      !context.assetLibrary &&
      ['kiln_save', 'kiln_assets', 'kiln_present', 'kiln_export', 'kiln_import'].includes(def.name)
    )
      return [];
    if (def.name === 'kiln_renderer') return rendererOperations(def, context);
    if (def.name === 'kiln_discover') return discoveryOperations(def);
    if (def.name === 'kiln_material') return materialOperations(def);
    if (def.name === 'kiln_assets') return assetOperations(def, context);
    return [def];
  });
}

function actionTools(def: KilnToolDef) {
  if (!(def.inputSchema instanceof z.ZodObject) || !def.actionContract)
    throw new Error(`${def.name}: missing shared action contract`);
  const schemas = projectActionSchemas(def.name, def.inputSchema, def.actionContract);
  return Object.fromEntries(
    Object.entries(def.actionContract).map(([action, contract]) => [
      action,
      {
        ...def,
        actionContract: undefined,
        name: `${def.name}_${action.replaceAll('-', '_')}`,
        description: contract.description,
        inputSchema: schemas[action]!,
        run: async (raw: unknown) => def.run({ ...schemas[action]!.parse(raw), action }),
      } satisfies KilnToolDef,
    ]),
  );
}

function assetOperations(def: KilnToolDef, context: KilnToolContext): KilnToolDef[] {
  const tools = actionTools(def);
  const list = tools.list!;
  const listSchema = list.inputSchema as z.ZodObject;
  // Remove only the legacy default: omission means all collections in this operation.
  const collection = (listSchema.shape.collection as z.ZodDefault<z.ZodString>)
    .unwrap()
    .optional()
    .describe(
      'Collection ID from kiln_assets_collections; omitted searches all configured collections.',
    );
  const inputSchema = listSchema.extend({ collection });
  const search: KilnToolDef = {
    ...list,
    name: 'kiln_assets_search',
    description:
      'Search saved assets with pagination. Omit collection for all configured collections, or select one explicitly. Results identify exact collection, asset and revision; partial read failures are reported.',
    inputSchema,
    run: async (raw) => {
      const input = inputSchema.parse(raw);
      const { collection: _collection, ...filters } = input;
      if (input.collection === undefined) return tools.catalog!.run(filters);
      if (!context.assetLibrary?.collections().some((item) => item.id === input.collection))
        throw new Error(
          'Unknown collection. Use kiln_assets_collections to list available destinations.',
        );
      const result = (await list.run(input)) as {
        total: number;
        nextOffset: number | null;
        assets: Record<string, unknown>[];
      };
      return {
        errors: [],
        total: result.total,
        nextOffset: result.nextOffset,
        assets: result.assets.map((asset) => ({ ...asset, collection: input.collection })),
      };
    },
  };
  return [tools.collections!, search, tools.get!, tools.restore!];
}

function materialOperations(def: KilnToolDef): KilnToolDef[] {
  const tools = actionTools(def);
  const presets = tools.presets!;
  const inputSchema = (presets.inputSchema as z.ZodObject).extend({
    scope: z.enum(['all', 'presets', 'saved']).default('all'),
  });
  const search: KilnToolDef = {
    ...presets,
    name: 'kiln_material_search',
    description:
      'Browse shipped material recipes and saved material revisions, optionally filtered by exact tag. Recipe IDs and saved material IDs are distinct. Use scope to select presets, saved or both.',
    inputSchema,
    run: async (raw) => {
      const { scope, ...input } = inputSchema.parse(raw);
      const recipes =
        scope === 'saved'
          ? { presets: [] }
          : ((await presets.run(input)) as { presets: Record<string, unknown>[] });
      const saved =
        scope === 'presets'
          ? { materials: [] }
          : ((await tools.list!.run(input)) as { materials: Record<string, unknown>[] });
      return {
        ok: true,
        presets: recipes.presets.map((item) => ({ ...item, kind: 'preset' })),
        materials: saved.materials.map((item) => ({ ...item, kind: 'saved' })),
      };
    },
  };
  const preset = tools['create-preset']!;
  const procedural = tools['create-procedural']!;
  const createInput = z.strictObject({
    definition: z.discriminatedUnion('kind', [
      (preset.inputSchema as z.ZodObject).extend({ kind: z.literal('preset') }),
      (procedural.inputSchema as z.ZodObject).extend({ kind: z.literal('procedural') }),
    ]),
  });
  const create: KilnToolDef = {
    ...preset,
    name: 'kiln_material_create',
    description:
      'Create and retain one immutable material from a preset or procedural definition. Presets require explicit seed, creator and license. Pin the returned materialId/revisionId for rendering. Does not fetch URLs or execute source.',
    inputSchema: createInput,
    run: async (raw) => {
      const { kind, ...input } = createInput.parse(raw).definition;
      return (kind === 'preset' ? preset : procedural).run(input);
    },
  };
  return [search, tools.get!, create, tools.import!];
}

function rendererOperations(def: KilnToolDef, context: KilnToolContext): KilnToolDef[] {
  if (!context.renderCapabilities) return [];
  return ['status', ...(context.reprobeRenderer ? ['reprobe'] : [])].map((action) => {
    const inputSchema = z.strictObject({});
    return {
      ...def,
      name: `kiln_renderer_${action}`,
      inputSchema,
      run: async (raw: unknown) => {
        inputSchema.parse(raw);
        return def.run({ action });
      },
    };
  });
}

function discoveryOperations(def: KilnToolDef): KilnToolDef[] {
  const original = def.inputSchema as z.ZodObject;
  const { capabilities: _capabilities, ...fields } = original.shape;
  const inputSchema = z.strictObject(fields);
  const empty = z.strictObject({});
  return [
    {
      ...def,
      description:
        'Discover geometry helpers, assemblies, recipes and complete input shapes. Search with modeling language or fetch up to six exact IDs. Use kiln_capabilities for current host facts.',
      inputSchema,
      run: async (raw) => def.run(inputSchema.parse(raw)),
    },
    {
      ...def,
      name: 'kiln_capabilities',
      description:
        'Inspect declared host capabilities, execution limits and available storage. Observed rendering fidelity is returned by each render.',
      inputSchema: empty,
      run: async (raw) => {
        empty.parse(raw);
        return def.run({ capabilities: true });
      },
    },
  ];
}
