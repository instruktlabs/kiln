/**
 * One flat object per multi-action tool (v1 contract rule 3). The advertised
 * schema is an `action` enum with every other field optional, so a harness that
 * rewrites or drops a root combinator still sees the whole tool; the server
 * checks what each action needs. A missing field is answered with the action's
 * requirements and, for a nested record, the Discovery id that returns its
 * shape (rule 9: the cause and the next call, never a local path).
 */
export interface ActionRequirements {
  /** Fields the action cannot run without. */
  readonly required: readonly string[];
  /** Nested records by field, as `kiln_discover({ ids: [id] })` describes them. */
  readonly shapes?: Readonly<Record<string, string>>;
}

const list = (fields: readonly string[]): string =>
  fields.length <= 1 ? fields.join('') : `${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}`;

export function requireActionFields(
  tool: string,
  action: string,
  input: Readonly<Record<string, unknown>>,
  requirements: ActionRequirements,
): void {
  const missing = requirements.required.filter((field) => input[field] === undefined);
  if (!missing.length) return;
  const shapes = missing
    .filter((field) => requirements.shapes?.[field])
    .map((field) => `${field} shape: kiln_discover({ ids: ['${requirements.shapes![field]}'] })`);
  throw new Error(
    `${tool} ${action} requires ${list(requirements.required)}; missing ${list(missing)}.${
      shapes.length ? ` ${shapes.join('. ')}.` : ''
    }`,
  );
}

/** A nested record the action validates with its own schema when it runs. */
export const nestedRecordDescription = (purpose: string, shape: string): string =>
  `${purpose} Shape: kiln_discover({ ids: ['${shape}'] }).`;

export interface InputErrorOptions {
  /** The top-level keys the tool takes, named when a key is not one of them. */
  readonly fields?: readonly string[];
  /** Nested records by field, as `kiln_discover({ ids: [id] })` describes them. */
  readonly shapes?: Readonly<Record<string, string>>;
}

/**
 * Rule 9 text for a failed input parse: each issue as "field: what is wrong",
 * then where the shape is. The raw zod message is a JSON array of issues,
 * which a model reads as data rather than as an instruction. A key the tool
 * does not take is answered with the keys it does: w28 called
 * `kiln_material get` with the `resourceId` a project's palette lists. An
 * issue inside a nested record names that record's Discovery shape: w35 put
 * the camera fields at the root of a `shot`.
 */
export function describeInputError(
  tool: string,
  error: unknown,
  options: InputErrorOptions = {},
): string | undefined {
  const issues = (error as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues) || !issues.length) return undefined;
  const { fields = [], shapes = {} } = options;
  // An issue's own full stop would meet the template's: "...or file.. Check" (f09).
  const lines = flattenIssues(issues)
    .slice(0, 6)
    .map((line) => line.replace(/\.+$/u, ''));
  const unknownKey = issues.some(
    (issue) => (issue as Issue).code === 'unrecognized_keys' && !(issue as Issue).path?.length,
  );
  const takes = unknownKey && fields.length ? ` ${tool} takes ${list(fields)}.` : '';
  const nested = [
    ...new Set(
      issues
        .map((issue) => String((issue as Issue).path?.[0] ?? ''))
        .filter((field) => shapes[field]),
    ),
  ].map((field) => `${field} shape: kiln_discover({ ids: ['${shapes[field]}'] })`);
  const where = nested.length
    ? nested.join('; ')
    : `nested shapes: kiln_discover({ ids: ['shape:...'] })`;
  return `${tool}: invalid input. ${lines.join('; ')}${
    issues.length > 6 ? `; ${issues.length - 6} more` : ''
  }.${takes} Check the field names and values against the ${tool} schema; ${where}.`;
}

/** The top-level keys an advertised zod object schema takes, for the error above. */
export function schemaFields(schema: unknown): string[] {
  const shape = (schema as { shape?: unknown } | null)?.shape;
  return shape && typeof shape === 'object' ? Object.keys(shape) : [];
}

interface Issue {
  code?: string;
  path?: (string | number)[];
  message?: string;
  errors?: unknown[][];
}

/**
 * "field: what is wrong" per issue. A union reports only "Invalid input" at
 * its root; the branch that came closest (the fewest issues) says which field
 * was wrong, so that branch's issues stand in for it.
 */
function flattenIssues(issues: readonly unknown[], prefix: (string | number)[] = []): string[] {
  const lines: string[] = [];
  for (const raw of issues) {
    const issue = raw as Issue;
    const path = [...prefix, ...(issue.path ?? [])];
    const branches = Array.isArray(issue.errors)
      ? issue.errors.filter((branch) => Array.isArray(branch) && branch.length)
      : [];
    if (issue.code === 'invalid_union' && branches.length) {
      const closest = branches.reduce((best, branch) =>
        branch.length < best.length ? branch : best,
      );
      lines.push(...flattenIssues(closest, path));
      continue;
    }
    lines.push(`${path.join('.') || 'input'}: ${issue.message ?? 'invalid'}`);
  }
  return lines;
}
