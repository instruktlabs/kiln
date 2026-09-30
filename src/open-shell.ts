/**
 * Intentionally open shells (R52).
 *
 * Some parts are open on purpose: a C-channel rail closed by separate end plates, a single-sided
 * sign face, a canopy sheet. The part-volume observer cannot build such a part as a closed
 * solid, so it cannot measure the part's overlap with its neighbours. `markOpenShell(part,
 * reason)` records that the shell is open by intent and why. QA then reports the part as
 * acknowledged, with the reason, instead of as an unexplained gap, and still says which
 * overlapping pairs it could not measure: a mark is the author's statement, never a
 * measurement, and it never hides overlap.
 *
 * The mark lives in `userData` under the engine-owned `kilnOpenShell` key (authors' `kiln*` keys
 * never export; see `user-data-extras.ts`). Both exporters write the validated mark as that
 * node's glTF extras, and import restores it to userData, so QA of the written bytes and of a
 * derivative reads the same mark. A mark on a group covers the meshes under it.
 */
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

/** The engine-owned userData and glTF extras key that carries a mark. */
export const OPEN_SHELL_KEY = 'kilnOpenShell';
/** Longest reason a mark keeps, in UTF-16 code units after trimming. */
export const MAX_OPEN_SHELL_REASON = 200;

export interface OpenShellMarkV1 {
  schemaVersion: 1;
  /** Why the shell is open, in the author's words. */
  reason: string;
}

interface MarkableNode {
  isObject3D?: boolean;
  name?: string;
  userData?: Record<string, unknown>;
  parent?: MarkableNode | null;
}

const EXAMPLE = 'markOpenShell(rail, "C-channel closed by the end plates")';
const fail = (detail: string): never => {
  throw new AuthoringDiagnosticError(
    'OPEN_SHELL',
    `markOpenShell(part, reason): ${detail} For example ${EXAMPLE}.`,
  );
};

const validReason = (reason: unknown): string | undefined => {
  if (typeof reason !== 'string') return undefined;
  const trimmed = reason.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_OPEN_SHELL_REASON ? trimmed : undefined;
};

/**
 * Mark `part` (a mesh, or a group whose meshes it covers) as an intentionally open shell.
 * Returns the part. The reason is trimmed and must be 1 to 200 characters.
 */
export function markOpenShell<T>(part: T, reason: string): T {
  const node = part as MarkableNode | null | undefined;
  if (!node || typeof node !== 'object' || node.isObject3D !== true)
    fail('part must be a scene node, such as the mesh createPart returned or a group.');
  const kept = validReason(reason);
  if (kept === undefined)
    fail(
      `reason must be a non-empty string of at most ${MAX_OPEN_SHELL_REASON} characters saying why the shell is open.`,
    );
  const target = node as MarkableNode;
  if (!target.userData || typeof target.userData !== 'object') target.userData = {};
  target.userData[OPEN_SHELL_KEY] = { schemaVersion: 1, reason: kept! } satisfies OpenShellMarkV1;
  return part;
}

/** The mark's reason when `value` is a valid mark, else undefined. */
function markReason(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const mark = value as Record<string, unknown>;
  if (mark.schemaVersion !== 1) return undefined;
  if (Object.keys(mark).some((key) => key !== 'schemaVersion' && key !== 'reason'))
    return undefined;
  const reason = validReason(mark.reason);
  return reason === mark.reason ? reason : undefined;
}

/** The reason of the nearest valid mark on `node` or an ancestor, if any. */
export function openShellIntent(node: unknown): string | undefined {
  for (let at = node as MarkableNode | null | undefined; at; at = at.parent) {
    const value = at.userData?.[OPEN_SHELL_KEY];
    if (value !== undefined) return markReason(value);
  }
  return undefined;
}

/**
 * The extras a node's own mark exports: a detached, validated copy, or nothing. A value under
 * the key that is not a mark `markOpenShell` would write fails the build rather than export.
 */
export function openShellExtras(node: unknown): Record<string, OpenShellMarkV1> {
  const target = node as MarkableNode | null | undefined;
  const value = target?.userData?.[OPEN_SHELL_KEY];
  if (value === undefined) return {};
  const reason = markReason(value);
  if (reason === undefined)
    fail(
      `userData.${OPEN_SHELL_KEY} on ${JSON.stringify(target?.name || '(unnamed node)')} is not a mark this helper wrote; the engine owns that key, so set it only through markOpenShell.`,
    );
  return { [OPEN_SHELL_KEY]: { schemaVersion: 1, reason: reason! } };
}
