import { z } from 'zod';

const selector = z.string().trim().min(1).max(120);
export function discoverySelectorMigration(keys: readonly string[]): string | undefined {
  if (!keys.some((key) => ['category', 'name', 'names'].includes(key))) return undefined;
  return 'Legacy Discovery selectors category/name/names were removed. Use query for search, ids (CLI --id) for exact contracts, and family (CLI --family), kind or tags for filtering. See docs/migration.md.';
}
export const discoveryInputSchema = z
  .object(
    {
      query: z.string().trim().min(1).max(500).optional(),
      ids: z
        .array(selector)
        .min(1)
        .max(6)
        .refine((ids) => new Set(ids).size === ids.length, {
          message: 'Exact IDs must be unique.',
        })
        .optional(),
      overview: z.literal(true).optional(),
      capabilities: z.literal(true).optional(),
      family: selector.optional(),
      kind: z.enum(['operation', 'assembly', 'recipe', 'shape']).optional(),
      tags: z.array(selector).min(1).max(8).optional(),
      offset: z.number().int().min(0).max(10000).optional(),
      limit: z.number().int().min(1).max(12).optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys' ? discoverySelectorMigration(issue.keys) : undefined,
    },
  )
  .strict()
  .superRefine((input, context) => {
    const modes = [
      input.query !== undefined,
      input.ids !== undefined,
      input.overview === true,
      input.capabilities === true,
    ];
    if (modes.filter(Boolean).length > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Choose one of query, ids, overview or capabilities.',
      });
    }
    if (input.ids || input.capabilities) {
      const key = input.ids ? 'ids' : 'capabilities';
      if (Object.keys(input).some((entry) => entry !== key)) {
        context.addIssue({
          code: 'custom',
          message: `Use ${key} alone; filters and pagination apply to overview/search.`,
        });
      }
    }
  });

export function parseDiscoveryRequest(value: unknown) {
  const input = discoveryInputSchema.parse(value);
  if (input.capabilities) return { mode: 'capabilities' as const };
  if (input.ids) return { mode: 'detail' as const, ids: input.ids };
  const { overview: _, capabilities: __, ids: ___, ...filters } = input;
  return {
    ...filters,
    mode: input.query ? ('search' as const) : ('overview' as const),
    offset: input.offset ?? 0,
    limit: input.limit ?? 6,
  };
}

export type DiscoveryRequest = ReturnType<typeof parseDiscoveryRequest>;
