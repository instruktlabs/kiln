import { z } from 'zod';
import type { ActionRequirements } from './actions';

/** Domain action metadata shared by grouped execution and named presentations. */
export interface KilnActionContract extends ActionRequirements {
  readonly fields: readonly string[];
  readonly description: string;
}

export function projectActionSchemas<A extends string>(
  name: string,
  input: z.ZodObject,
  actions: Readonly<Record<A, KilnActionContract>>,
): Record<A, z.ZodObject> {
  if (input.def.checks?.length)
    throw new Error(`${name}: cross-field constraints require an explicit operation schema`);
  const json = z.toJSONSchema(input, { io: 'input' });
  const selector = json.properties?.action as { enum?: unknown } | undefined;
  const expected = Object.keys(actions).sort();
  if (
    !Array.isArray(selector?.enum) ||
    JSON.stringify([...selector.enum].sort()) !== JSON.stringify(expected)
  )
    throw new Error(`${name}: unclassified actions`);
  const classified = new Set([
    'action',
    ...Object.values<KilnActionContract>(actions).flatMap((contract) => [...contract.fields]),
  ]);
  const unclassified = Object.keys(input.shape).filter((field) => !classified.has(field));
  if (unclassified.length)
    throw new Error(`${name}: Unclassified fields: ${unclassified.join(', ')}`);
  const schemas: [string, z.ZodObject][] = [];
  for (const [action, contract] of Object.entries<KilnActionContract>(actions)) {
    for (const field of contract.required)
      if (!contract.fields.includes(field))
        throw new Error(`${name}.${action}: unmapped required ${field}`);
    for (const field of json.required ?? [])
      if (field !== 'action' && !contract.fields.includes(field))
        throw new Error(`${name}.${action}: would omit required ${field}`);
    const shape: Record<string, z.ZodType> = {};
    for (const field of contract.fields) {
      if (field === 'action' || !Object.hasOwn(input.shape, field))
        throw new Error(`${name}.${action}: missing or reserved field ${field}`);
      classified.add(field);
      const source = input.shape[field]!;
      shape[field] = contract.required.includes(field) ? source.nonoptional() : source;
    }
    schemas.push([action, z.strictObject(shape)]);
  }
  return Object.fromEntries(schemas) as Record<A, z.ZodObject>;
}
