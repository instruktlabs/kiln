/**
 * Host validation profile (#208): a closed, declarative statement a host binds inside
 * `requirements.validation`. It names nodes and states glTF facts the destination needs.
 * No host code runs and nothing here reads images.
 */
import { z } from 'zod';

export const VALIDATION_PROFILE_VERSION = 'kiln.validation-profile.v1' as const;
export const MAX_VALIDATION_PROFILE_BYTES = 8 * 1024;
export const MAX_VALIDATION_CHECKS = 16;
export const MAX_VALIDATION_PATTERN_CHARS = 128;
export const MAX_VALIDATION_PATTERN_STARS = 4;
/** Per-check ceiling on matched nodes; also the largest `maxMatches`. */
export const MAX_VALIDATION_MATCHES = 512;

export const VALIDATION_SEMANTICS = [
  'POSITION',
  'NORMAL',
  'TANGENT',
  'TEXCOORD_0',
  'TEXCOORD_1',
  'COLOR_0',
  'JOINTS_0',
  'WEIGHTS_0',
] as const;
export type ValidationSemantic = (typeof VALIDATION_SEMANTICS)[number];

/** Largest component count glTF allows for each semantic. COLOR_0 may be VEC3 or VEC4. */
export const VALIDATION_SEMANTIC_SIZE: Readonly<Record<ValidationSemantic, number>> = {
  POSITION: 3,
  NORMAL: 3,
  TANGENT: 4,
  TEXCOORD_0: 2,
  TEXCOORD_1: 2,
  COLOR_0: 4,
  JOINTS_0: 4,
  WEIGHTS_0: 4,
};

export const VALIDATION_AXES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const;

const finite = z.number().finite();
const id = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, digits, ".", "_" or "-".');

const pattern = z
  .string()
  .min(1)
  .refine((value) => Array.from(value).length <= MAX_VALIDATION_PATTERN_CHARS, {
    message: `A pattern has at most ${MAX_VALIDATION_PATTERN_CHARS} characters.`,
  })
  .refine((value) => value.split('*').length - 1 <= MAX_VALIDATION_PATTERN_STARS, {
    message: `A pattern has at most ${MAX_VALIDATION_PATTERN_STARS} "*".`,
  });

const componentFits = (value: { attribute: ValidationSemantic; component: number }) =>
  value.component < VALIDATION_SEMANTIC_SIZE[value.attribute];
const componentMessage = {
  message: 'component is outside the attribute.',
  path: ['component'],
};

const gradient = z
  .strictObject({
    attribute: z.enum(['TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']),
    component: z.number().int().min(0).max(3),
    axis: z.enum(VALIDATION_AXES),
    from: finite,
    to: finite,
    tolerance: finite.positive().max(0.5),
    monotonic: z.boolean(),
  })
  .refine((value) => value.from !== value.to, {
    message: 'from and to must differ.',
  })
  .refine(componentFits, componentMessage);

const range = z
  .strictObject({
    attribute: z.enum(VALIDATION_SEMANTICS),
    component: z.number().int().min(0).max(3),
    min: finite,
    max: finite,
    tolerance: finite.nonnegative(),
  })
  .refine((value) => value.min <= value.max, {
    message: 'min must not exceed max.',
  })
  .refine(componentFits, componentMessage);

const check = z
  .strictObject({
    id: id(48),
    select: z
      .strictObject({
        names: z.array(pattern).min(1).max(8),
        /** Defaults to 1, so a renamed node is a finding rather than a silent pass. */
        minMatches: z.number().int().min(0).max(MAX_VALIDATION_MATCHES).optional(),
        maxMatches: z.number().int().min(0).max(MAX_VALIDATION_MATCHES).optional(),
      })
      .refine(
        (value) => value.maxMatches === undefined || (value.minMatches ?? 1) <= value.maxMatches,
        { message: 'minMatches must not exceed maxMatches.' },
      ),
    primitives: z
      .union([
        z.strictObject({ exactly: z.number().int().min(1).max(64) }),
        z.strictObject({ max: z.number().int().min(1).max(64) }),
      ])
      .optional(),
    /** Every listed semantic is required on every primitive of each matched node. */
    attributes: z
      .array(z.enum(VALIDATION_SEMANTICS))
      .min(1)
      .max(8)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Attributes must be unique.',
      })
      .optional(),
    gradient: gradient.optional(),
    range: range.optional(),
    material: z
      .strictObject({
        alphaMode: z.enum(['OPAQUE', 'MASK', 'BLEND']).optional(),
        doubleSided: z.boolean().optional(),
      })
      .refine((value) => value.alphaMode !== undefined || value.doubleSided !== undefined, {
        message: 'A material check needs alphaMode or doubleSided.',
      })
      .optional(),
  })
  .refine(
    (value) =>
      value.primitives !== undefined ||
      value.attributes !== undefined ||
      value.gradient !== undefined ||
      value.range !== undefined ||
      value.material !== undefined,
    { message: 'A check needs at least one assertion.' },
  );

export const ValidationProfileV1Schema = z
  .strictObject({
    version: z.literal(VALIDATION_PROFILE_VERSION),
    profileId: id(64).regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, digits, ".", "_" or "-".'),
    /** One profile-level mode in v1: `enforce` findings block, `warn` findings warn. */
    mode: z.enum(['warn', 'enforce']),
    checks: z.array(check).min(1).max(MAX_VALIDATION_CHECKS),
  })
  .superRefine((value, context) => {
    const ids = value.checks.map((item) => item.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'Check ids must be unique.',
      });
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (bytes > MAX_VALIDATION_PROFILE_BYTES)
      context.addIssue({
        code: 'custom',
        message: `A validation profile serializes to at most ${MAX_VALIDATION_PROFILE_BYTES} bytes (got ${bytes}).`,
      });
  });

export type ValidationProfileV1 = z.infer<typeof ValidationProfileV1Schema>;
export type ValidationCheckV1 = ValidationProfileV1['checks'][number];
