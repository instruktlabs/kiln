import { AuthoringDiagnosticError } from './authoring-diagnostic';

/** Measured engine facts only. No scene names, source text or exception messages. */
export interface SolidFailureMesh {
  /** Zero-based child indices from the authored root; null when deeper than 64 nodes. */
  childPath: number[] | null;
  closed: boolean;
  manifold: boolean;
  orientation: 'outward' | 'inward' | 'mixed';
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationConflicts: number;
}
export interface SolidFailureDetails {
  total: number;
  truncated: boolean;
  meshes: SolidFailureMesh[];
}
export const MAX_SOLID_FAILURE_MESHES = 4;
export const MAX_SOLID_FAILURE_PATH = 64;

export class RequiredSolidError extends AuthoringDiagnosticError {
  constructor(
    readonly solid: SolidFailureDetails,
    message: string,
  ) {
    super('REQUIRE_SOLID', message);
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: string[]) =>
  Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function validSolidFailureDetails(value: unknown): value is SolidFailureDetails {
  if (
    !record(value) ||
    !keys(value, ['total', 'truncated', 'meshes']) ||
    !count(value.total) ||
    value.total < 1 ||
    !Array.isArray(value.meshes) ||
    value.meshes.length !== Math.min(value.total, MAX_SOLID_FAILURE_MESHES) ||
    value.truncated !== value.total > value.meshes.length
  )
    return false;
  return value.meshes.every(
    (mesh) =>
      record(mesh) &&
      keys(mesh, [
        'childPath',
        'closed',
        'manifold',
        'orientation',
        'boundaryEdges',
        'nonManifoldEdges',
        'orientationConflicts',
      ]) &&
      (mesh.childPath === null ||
        (Array.isArray(mesh.childPath) &&
          mesh.childPath.length <= MAX_SOLID_FAILURE_PATH &&
          mesh.childPath.every(count))) &&
      typeof mesh.closed === 'boolean' &&
      typeof mesh.manifold === 'boolean' &&
      typeof mesh.orientation === 'string' &&
      ['outward', 'inward', 'mixed'].includes(mesh.orientation) &&
      count(mesh.boundaryEdges) &&
      count(mesh.nonManifoldEdges) &&
      count(mesh.orientationConflicts),
  );
}

/** Only format validated facts, using engine-owned labels and numeric locators. */
export function solidFailureAdvice(value: SolidFailureDetails | undefined): string {
  if (!value || !validSolidFailureDetails(value)) return '';
  const rows = value.meshes.map((mesh) => {
    const locator =
      mesh.childPath === null
        ? 'mesh beyond the 64-level locator limit'
        : `root${mesh.childPath.map((index) => `.children[${index}]`).join('')}`;
    return `${locator}: closed=${mesh.closed}, manifold=${mesh.manifold}, orientation=${mesh.orientation}, boundaryEdges=${mesh.boundaryEdges}, nonManifoldEdges=${mesh.nonManifoldEdges}, orientationConflicts=${mesh.orientationConflicts}`;
  });
  return ` Required solid measurements (${value.meshes.length} of ${value.total} failing meshes): ${rows.join('; ')}. Child indices locate nodes in the authored build root before export; names are not forwarded. Read the retained source and check that node's geometryDiagnostics().solid.`;
}
