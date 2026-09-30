/**
 * Host-side source check for an opaque execution rejection.
 *
 * Nothing from a sandboxed exception may cross the worker boundary: a rejection
 * carries at most a closed diagnostic. The host still holds the source it sent,
 * so it can parse that source itself, before or after execution, and name what
 * `kiln_validate` would name. This leaks nothing from the worker and turns
 * "execution was rejected" into a code and a line in the same result.
 */
import { validate, type ValidationIssue } from '../validation';
import { evaluatorOutcomeMessage } from './protocol';

export const SOURCE_CHECK_LABEL = 'Source check:';

/** Issues that can cause a rejection; a missing meta block is not one. */
function causes(code: string): ValidationIssue[] {
  const result = validate(code);
  return [
    ...result.issues.filter((issue) => issue.code !== 'MISSING_META'),
    ...result.warnings.filter((issue) => issue.code === 'UNKNOWN_HELPER'),
  ];
}

/** `CODE at line N: message; ...`, or undefined when validation finds no cause. */
export function sourceCheckDetail(code: string, limit = 3): string | undefined {
  let found: ValidationIssue[];
  try {
    found = causes(code);
  } catch {
    // A diagnostic must never turn a handled failure into an unhandled one.
    return undefined;
  }
  if (found.length === 0) return undefined;
  const shown = found.slice(0, limit).map((issue) => {
    const text = issue.message.replace(/^Syntax error: /, '').replace(/\.$/, '');
    return `${issue.code}${issue.line ? ` at line ${issue.line}` : ''}: ${text}`;
  });
  const more = found.length - shown.length;
  return `${shown.join('; ')}${more > 0 ? `; ${more} more in kiln_validate` : ''}.`;
}

/** Append the source check to an execution rejection once; other messages are unchanged. */
export function appendSourceCheck(message: string, code: unknown): string {
  if (
    typeof code !== 'string' ||
    code.length === 0 ||
    !message.startsWith(evaluatorOutcomeMessage('EXECUTION_REJECTED')) ||
    message.includes(SOURCE_CHECK_LABEL)
  )
    return message;
  const detail = sourceCheckDetail(code);
  return detail ? `${message} ${SOURCE_CHECK_LABEL} ${detail}` : message;
}

/** The same check on a thrown evaluator error, keeping its class and code. */
export function withSourceCheck(error: unknown, code: unknown): unknown {
  if (
    error instanceof Error &&
    (error as Error & { code?: unknown }).code === 'EXECUTION_REJECTED'
  ) {
    error.message = appendSourceCheck(error.message, code);
  }
  return error;
}
