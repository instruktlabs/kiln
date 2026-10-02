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
