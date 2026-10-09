import { expect, test } from 'bun:test';
import { z } from 'zod';
import { projectActionSchemas } from '../operation-contract';

const actions = {
  list: { fields: ['query'], required: [], description: 'List records.' },
  get: { fields: ['id'], required: ['id'], description: 'Read one record.' },
} as const;
const input = z.strictObject({
  action: z.enum(['list', 'get']),
  query: z.string().max(200).optional(),
  id: z.string().min(1).optional(),
});

test('action schemas advertise and enforce the same conditional requirements', () => {
  const schemas = projectActionSchemas('records', input, actions);
  expect(schemas.get.safeParse({}).success).toBe(false);
  expect(schemas.get.safeParse({ id: '' }).success).toBe(false);
  expect(schemas.get.parse({ id: 'one' })).toEqual({ id: 'one' });
  expect(schemas.get.safeParse({ id: 'one', action: 'list' }).success).toBe(false);
  expect(z.toJSONSchema(schemas.get).required).toEqual(['id']);
  expect(schemas.list.parse({})).toEqual({});
});

test('projection rejects new fields and actions until the shared contract classifies them', () => {
  expect(() =>
    projectActionSchemas('records', input.extend({ futureRequired: z.string() }), actions),
  ).toThrow(/Unclassified.*futureRequired/);
  expect(() =>
    projectActionSchemas(
      'records',
      input.extend({ futureOptional: z.string().optional() }),
      actions,
    ),
  ).toThrow(/Unclassified.*futureOptional/);
  expect(() =>
    projectActionSchemas(
      'records',
      input.extend({ action: z.enum(['list', 'get', 'delete']) }),
      actions,
    ),
  ).toThrow(/actions/);
  expect(() => projectActionSchemas('records', input.omit({ id: true }), actions)).toThrow(/id/);
});

test('projection never silently drops globally required inputs or constraints', () => {
  expect(() => projectActionSchemas('records', input.extend({ id: z.string() }), actions)).toThrow(
    /required.*id/,
  );
  const schemas = projectActionSchemas(
    'records',
    input.extend({ query: z.string().max(2).optional() }),
    actions,
  );
  expect(schemas.list.safeParse({ query: 'long' }).success).toBe(false);
  expect(z.toJSONSchema(schemas.list).properties?.query).toMatchObject({ maxLength: 2 });
});

test('cross-field refinements require explicit operation design instead of being discarded', () => {
  const refined = input.refine((value) => value.action !== 'get' || value.id !== 'forbidden');
  expect(() => projectActionSchemas('records', refined, actions)).toThrow(/cross-field/);
});
