/**
 * Levels of detail as named sibling tiers with declared screen-coverage thresholds.
 *
 * A tier is a node whose own name carries an `LOD<n>` token (`LOD0`, `Body_LOD1`, `lod2`)
 * and whose ancestors carry none; tokens inside a tier name its parts, not new tiers.
 * Tiers under one parent whose names share a stem form one set. A set of two or more
 * tiers must run LOD0..LODn and carry one `defineLod` declaration on LOD0, which export
 * turns into one `MSFT_lod` chain (see `lod-export.ts`). A lone tier is an ordinary node.
 *
 * Thresholds are the only information a set adds beyond its names, and they are never
 * guessed: a default could cull an asset in a consumer at a distance nobody chose.
 */
import type * as THREE from 'three';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

/** An LOD level token such as `LOD0`, `lod1` or `Tree_LOD2`, delimited by the name's ends or non-alphanumerics. */
export const LOD_TOKEN = /(^|[^a-z0-9])lod(\d+)([^a-z0-9]|$)/i;

/** Where a set's thresholds live on its LOD0 node until export writes them as extras. */
export const KILN_LOD_KEY = 'kilnLodV1';

export interface LodDeclarationV1 {
  /** Minimum screen coverage (0..1) at which each level draws, LOD0 first. */
  screenCoverage: number[];
}

export interface DefineLodOptions {
  screenCoverage: number[];
}

export interface LodSet {
  parent: THREE.Object3D;
  /** The tiers in level order, LOD0 first. */
  levels: THREE.Object3D[];
  screenCoverage: number[];
}

interface LodName {
  level: number;
  /** The name with its token replaced, for grouping siblings into one set. */
  stem: string;
  /** The name with `<n>` in place of the level, for messages. */
  pattern: string;
}

/** The level and stem a name's `LOD<n>` token gives it, if it has one. */
export function lodName(name: string): LodName | undefined {
  const match = LOD_TOKEN.exec(name);
  if (!match) return undefined;
  const start = match.index + match[1]!.length;
  const end = start + 3 + match[2]!.length;
  const token = name.slice(start, start + 3);
  return {
    level: Number(match[2]),
    stem: `${name.slice(0, start)}\u0000${name.slice(end)}`,
    pattern: `${name.slice(0, start)}${token}<n>${name.slice(end)}`,
  };
}

const EXAMPLE = 'defineLod([body0, body1, body2], { screenCoverage: [0.25, 0.06, 0.01] })';

function fail(message: string): never {
  throw new AuthoringDiagnosticError('LOD_SET', message);
}

function coverageProblem(values: unknown, levels: number): string | undefined {
  if (!Array.isArray(values) || values.length !== levels)
    return `screenCoverage needs one value per level (${levels})`;
  for (const [index, value] of values.entries()) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
      return `screenCoverage[${index}] must be a number from 0 to 1`;
    if (index > 0 && value >= (values[index - 1] as number))
      return 'screenCoverage must be strictly decreasing, LOD0 first; the last value may be 0, which never culls';
  }
  return undefined;
}

function format(values: unknown): string {
  try {
    return JSON.stringify(values) ?? String(values);
  } catch {
    return String(values);
  }
}

/**
 * Declare one set of LOD tiers and its screen-coverage thresholds.
 *
 * `levels` are the tier nodes in level order, LOD0 (full detail) first, named with one
 * stem and consecutive tokens. `screenCoverage[i]` is the smallest fraction of the screen
 * the object may cover while level i draws; below the last value the object is culled,
 * and a last value of 0 never culls. Returns `levels` unchanged.
 */
export function defineLod<T extends THREE.Object3D>(levels: T[], options: DefineLodOptions): T[] {
  if (
    !Array.isArray(levels) ||
    levels.length < 2 ||
    levels.some((level) => (level as { isObject3D?: boolean } | null)?.isObject3D !== true)
  )
    fail(`defineLod: levels must list at least two tier nodes, LOD0 first, as in ${EXAMPLE}.`);
  const first = lodName(levels[0]!.name);
  for (const [index, level] of levels.entries()) {
    const parsed = lodName(level.name);
    if (!parsed || parsed.level !== index || parsed.stem !== first?.stem) {
      const expected = first
        ? first.pattern.replace('<n>', String(index))
        : `a name with the token LOD${index}`;
      fail(
        `defineLod: level ${index} is named ${JSON.stringify(level.name)}; name each tier with one stem and its level's token in order (${expected}).`,
      );
    }
  }
  const parents = new Set(levels.map((level) => level.parent));
  if (!parents.has(null) && parents.size > 1)
    fail(
      `defineLod: the tiers of ${JSON.stringify(first!.pattern)} must share the same parent; lower levels replace LOD0 in place.`,
    );
  const coverage = (options as Partial<DefineLodOptions> | undefined)?.screenCoverage;
  const problem = coverageProblem(coverage, levels.length);
  if (problem) fail(`defineLod: ${problem}; got ${format(coverage)}. For example ${EXAMPLE}.`);
  const declaration: LodDeclarationV1 = { screenCoverage: [...(coverage as number[])] };
  levels[0]!.userData[KILN_LOD_KEY] = declaration;
  return levels;
}

function declarationOf(node: THREE.Object3D): unknown {
  return (node.userData as Record<string, unknown> | undefined)?.[KILN_LOD_KEY];
}

/**
 * Every set of LOD tiers under `root`, validated for export.
 *
 * Throws an `LOD_SET` authoring error for a set with a gap, a repeat or no LOD0, a set of
 * two or more tiers without a declaration, and a declaration that no longer matches its set.
 */
export function collectLodSets(root: THREE.Object3D): LodSet[] {
  const sets: LodSet[] = [];
  const declaredBases = new Set<THREE.Object3D>();
  const visit = (parent: THREE.Object3D): void => {
    const groups = new Map<string, Array<{ node: THREE.Object3D; name: LodName }>>();
    const untagged: THREE.Object3D[] = [];
    for (const child of parent.children) {
      const name = lodName(child.name);
      if (!name) {
        untagged.push(child);
        continue;
      }
      const members = groups.get(name.stem) ?? [];
      members.push({ node: child, name });
      groups.set(name.stem, members);
    }
    for (const members of groups.values()) {
      const pattern = members[0]!.name.pattern;
      const where = `${JSON.stringify(pattern)} under ${JSON.stringify(parent.name || '(unnamed)')}`;
      if (members.length === 1) continue;
      const ordered = [...members].sort((a, b) => a.name.level - b.name.level);
      const found = ordered.map((member) => member.name.level);
      if (found.some((level, index) => level !== index))
        fail(
          `LOD set ${where} has levels ${found.join(', ')}; a set needs LOD0 and consecutive levels with no repeats.`,
        );
      const levels = ordered.map((member) => member.node);
      const declaration = declarationOf(levels[0]!);
      const names = levels.map((level) => level.name).join(', ');
      if (declaration === undefined)
        fail(
          `LOD set ${where} (${names}) has no screen coverage. Declare it once: defineLod([${names}], { screenCoverage: [...] }) with one value per level, from 0 to 1, strictly decreasing.`,
        );
      const coverage = (declaration as Partial<LodDeclarationV1> | null)?.screenCoverage;
      if (Array.isArray(coverage) && coverage.length !== levels.length)
        fail(
          `LOD set ${where} declares ${coverage.length} levels but has ${levels.length} (${names}); call defineLod again with every tier.`,
        );
      const problem = coverageProblem(coverage, levels.length);
      if (problem) fail(`LOD set ${where}: ${problem}.`);
      declaredBases.add(levels[0]!);
      sets.push({ parent, levels, screenCoverage: [...(coverage as number[])] });
    }
    for (const child of untagged) visit(child);
  };
  visit(root);
  root.traverse((node) => {
    const declaration = declarationOf(node);
    if (declaration === undefined || declaredBases.has(node)) return;
    const coverage = (declaration as Partial<LodDeclarationV1> | null)?.screenCoverage;
    const count = Array.isArray(coverage) ? coverage.length : 'its';
    fail(
      `${JSON.stringify(node.name)} declares ${count} levels with defineLod but is not the LOD0 of a set of sibling tiers; attach every tier under the same parent (sets cannot nest inside another tier).`,
    );
  });
  return sets;
}
