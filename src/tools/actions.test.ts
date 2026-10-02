import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { describeInputError, schemaFields } from './actions';

const input = z.strictObject({
  action: z.enum(['get', 'list']),
  materialId: z.string().optional(),
  revisionId: z.string().optional(),
});

describe('describeInputError', () => {
  it('answers a key the tool does not take with the keys it does', () => {
    // w28: Codex passed the `resourceId` a project's palette lists to kiln_material get.
    const parsed = input.safeParse({ action: 'get', resourceId: 'troy-timber' });
    expect(parsed.success).toBe(false);
    const message = describeInputError('kiln_material', parsed.error, schemaFields(input));
    expect(message).toContain('resourceId');
    expect(message).toContain('kiln_material takes action, materialId and revisionId.');
    expect(message).not.toMatch(/\.\.(?:\s|$)/u);
  });

  it('lists no fields for a wrong value or an unknown key inside a nested record', () => {
    const wrong = input.safeParse({ action: 'frobnicate' });
    expect(describeInputError('kiln_material', wrong.error, schemaFields(input))).not.toContain(
      ' takes ',
    );
    const nested = z.strictObject({ draft: z.strictObject({ name: z.string() }) });
    const inner = nested.safeParse({ draft: { name: 'x', colour: 'red' } });
    expect(describeInputError('kiln_material', inner.error, schemaFields(nested))).not.toContain(
      ' takes ',
    );
  });

  it('reads the keys of an advertised object schema and nothing from any other schema', () => {
    expect(schemaFields(input)).toEqual(['action', 'materialId', 'revisionId']);
    expect(schemaFields(z.string())).toEqual([]);
    expect(schemaFields(undefined)).toEqual([]);
  });
});
