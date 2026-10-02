import { z } from 'zod';

const text = z.string().trim().min(1);
const texts = z.array(text);
const id = z.string().regex(/^(operation|assembly|recipe|shape):[A-Za-z][A-Za-z0-9-]*$/);
const common = {
  version: z.literal('kiln.catalog-entry.v1'),
  id,
  name: text,
  summary: text.max(500),
  family: text.max(80),
  tags: texts,
  aliases: texts,
  intents: texts,
  stability: z.enum(['stable', 'experimental', 'deprecated']),
  related: z.array(
    z
      .object({
        id,
        relation: z.enum(['alternative', 'prerequisite', 'companion']),
      })
      .strict(),
  ),
  references: texts,
  limitations: texts,
};

export const operationContractSchema = z
  .object({
    signature: text,
    returns: text,
    units: text,
    axes: text,
    origin: text,
    execution: z.enum(['sync', 'async']),
    ownership: text,
    coordinates: text,
    parameters: texts,
    topology: texts,
    preservation: texts,
    semantics: texts,
    cost: text,
    example: text,
  })
  .strict();

export const discoveryEntrySchema = z
  .discriminatedUnion('kind', [
    z
      .object({ ...common, kind: z.literal('operation'), contract: operationContractSchema })
      .strict(),
    z
      .object({ ...common, kind: z.literal('assembly'), contract: operationContractSchema })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('recipe'),
        recipe: z
          .object({
            prerequisites: z.array(id),
            steps: texts.min(1),
            example: text,
            adaptations: texts,
            checks: texts,
          })
          .strict(),
      })
      .strict(),
    // A tool input record served on request, so the advertised schema can stay small.
    z
      .object({
        ...common,
        kind: z.literal('shape'),
        shape: z
          .object({ tool: text, field: text, schema: z.record(z.string(), z.unknown()) })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((entry, ctx) => {
    if (!entry.id.startsWith(`${entry.kind}:`)) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'Entry ID namespace must match kind.',
      });
    }
    if (entry.kind !== 'recipe' && entry.id !== `${entry.kind}:${entry.name}`) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'Executable entry ID must contain its exact sandbox name.',
      });
    }
  });

export type DiscoveryEntry = z.infer<typeof discoveryEntrySchema>;
export type OperationContract = z.infer<typeof operationContractSchema>;

/** Validate once at catalog construction, before any entry can enter retrieval. */
export function parseCatalog(value: unknown): DiscoveryEntry[] {
  const entries = z.array(discoveryEntrySchema).parse(value);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate Discovery ID: ${entry.id}`);
    ids.add(entry.id);
    if (entry.kind !== 'recipe') {
      if (names.has(entry.name))
        throw new Error(`Duplicate executable Discovery name: ${entry.name}`);
      names.add(entry.name);
    }
  }
  for (const entry of entries) {
    const refs = [
      ...entry.related.map((related) => related.id),
      ...(entry.kind === 'recipe' ? entry.recipe.prerequisites : []),
    ];
    for (const ref of refs) {
      if (!ids.has(ref)) throw new Error(`Unknown Discovery reference ${ref} in ${entry.id}`);
    }
  }
  return entries;
}
