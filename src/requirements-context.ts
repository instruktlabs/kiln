/** Host requirements snapshots and import data. No generated metadata enters this module. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  AssetRequirementsV1Schema,
  createAssetRequirementsV1,
  type AssetRequirementsV1,
} from './contracts/requirements';
import { assetRequirementsPolicyHash } from './requirements-identity';
import {
  RequirementsMigrationRequiredError,
  assertNoLegacyRuntimePolicy,
} from './requirements-json';
import type { RequirementsBinding } from './requirements-store';

const text = z.string().refine((value) => value.trim().length > 0, 'Must be non-empty.');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const change = z.strictObject({
  actor: text,
  reason: text,
  source: z.enum(['brief', 'automation', 'migration', 'restore']),
  revision,
  policyHash: hash,
  previousPolicyHash: hash.optional(),
});
export const RequirementsBindingSchema = z
  .strictObject({
    kind: z.literal('kiln.requirements-binding'),
    schemaVersion: z.literal(1),
    taskId: text,
    lineageId: text,
    revision,
    policyHash: hash,
    requirements: AssetRequirementsV1Schema,
    history: z.array(change).min(1),
  })
  .superRefine((binding, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    if (binding.policyHash !== assetRequirementsPolicyHash(binding.requirements))
      issue('Requirements binding policy hash does not match its data.');
    if (binding.history.length !== binding.revision)
      issue('Requirements binding history does not match its revision.');
    for (let i = 0; i < binding.history.length; i++) {
      const current = binding.history[i]!;
      if (
        current.revision !== i + 1 ||
        current.previousPolicyHash !== binding.history[i - 1]?.policyHash
      )
        issue('Requirements binding history is not contiguous.');
    }
    if (binding.history.at(-1)?.policyHash !== binding.policyHash)
      issue('Requirements binding history does not end at its current policy.');
  });

export interface RequirementsContext {
  kind: 'kiln.requirements-context.v1';
  requirements: AssetRequirementsV1;
  binding?: RequirementsBinding;
  /** Enforced statements only. Binding policyHash separately preserves full semantic history. */
  policyHash: `sha256:${string}`;
  adviceHash: `sha256:${string}`;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function contextHash(
  requirements: AssetRequirementsV1,
  kind: 'policy' | 'advice',
): `sha256:${string}` {
  const includes = (state: string) =>
    kind === 'policy'
      ? state === 'requested' || state === 'inapplicable'
      : state === 'inferred' || state === 'unknown';
  const statement = (value: { state: string; value?: unknown }) => ({
    state: value.state,
    ...('value' in value ? { value: value.value } : {}),
  });
  const semantic = {
    frame: requirements.frame,
    ...(requirements.scope && includes(requirements.scope.state)
      ? { scope: statement(requirements.scope) }
      : {}),
    requirements: Object.fromEntries(
      Object.entries(requirements.requirements)
        .filter(([, value]) => value && includes(value.state))
        .map(([key, value]) => [key, statement(value!)]),
    ),
  };
  return `sha256:${createHash('sha256').update(`kiln.requirements-${kind}.v1`).update(canonical(semantic)).digest('hex')}`;
}
// The legacy-policy check lives in the zod-free module so the MCP entry can run
// it before the engine loads; it stays importable from here.
export { RequirementsMigrationRequiredError, assertNoLegacyRuntimePolicy };
export function validateRequirementsBinding(input: unknown): RequirementsBinding {
  const parsed = RequirementsBindingSchema.safeParse(input);
  if (!parsed.success)
    throw new TypeError(
      `Invalid requirements binding: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`,
    );
  return parsed.data;
}
/** A caller's object is snapshotted before evaluation or cache lookup can await. */
export function resolveRequirementsContext(input?: unknown): RequirementsContext {
  const binding = input === undefined ? undefined : validateRequirementsBinding(input);
  const requirements = binding?.requirements ?? createAssetRequirementsV1();
  return {
    kind: 'kiln.requirements-context.v1',
    requirements,
    ...(binding ? { binding } : {}),
    policyHash: contextHash(requirements, 'policy'),
    adviceHash: contextHash(requirements, 'advice'),
  };
}

/** Validate a transported receipt against its own detached binding or the neutral default. */
export function validateRequirementsContext(input: unknown): RequirementsContext {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Invalid requirements context.');
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !['kind', 'requirements', 'binding', 'policyHash', 'adviceHash'].includes(key),
    )
  )
    throw new TypeError('Invalid requirements context fields.');
  const expected = resolveRequirementsContext(raw.binding);
  if (canonical(raw) !== canonical(expected))
    throw new TypeError('Requirements context does not match its binding.');
  return expected;
}

export function requirementsContextsEqual(
  left: RequirementsContext,
  right: RequirementsContext,
): boolean {
  return canonical(left) === canonical(right);
}

const CheckpointSchema = z.strictObject({
  kind: z.literal('kiln.requirements-checkpoint.v1'),
  programRef: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  binding: RequirementsBindingSchema,
});
export type RequirementsCheckpoint = z.infer<typeof CheckpointSchema>;
export function createRequirementsCheckpoint(
  programRef: string,
  binding: RequirementsBinding,
): RequirementsCheckpoint {
  return CheckpointSchema.parse({ kind: 'kiln.requirements-checkpoint.v1', programRef, binding });
}
/** Decoding imported data is deliberately not a store mutation or grant of host authority. */
export function readRequirementsCheckpoint(input: unknown): {
  status: 'host-binding-required';
  checkpoint: RequirementsCheckpoint;
} {
  if (input && typeof input === 'object' && ('intent' in input || 'category' in input))
    throw new RequirementsMigrationRequiredError();
  const result = CheckpointSchema.safeParse(input);
  if (!result.success)
    throw new TypeError(`Invalid requirements checkpoint binding: ${result.error.message}`);
  return { status: 'host-binding-required', checkpoint: result.data };
}
