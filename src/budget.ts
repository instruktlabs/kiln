/**
 * Triangle and draw budgets (delivery contract item 3).
 *
 * `defineBudget({ triangles, draws? })` declares what the asset may cost: `triangles` is one
 * number for LOD0 or a record of tiers (`{ LOD0: 4000, LOD1: 900, LOD2: 120 }`), and `draws`
 * caps LOD0 draw calls. The declaration travels in the GLB as scene extras `kilnBudgetV1`,
 * and every receipt measures the written bytes against it. Budgets are advisory: a failing
 * tier never changes QA acceptance; only CLI `--strict-budget` turns it into an exit code.
 */
import type * as THREE from 'three';
import type { BudgetReportV1, BudgetTierV1, LevelOfDetailChainV1 } from './contracts/integration';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

/** Where a declaration lives: root userData until export, then default-scene extras. */
export const KILN_BUDGET_KEY = 'kilnBudgetV1';

export interface BudgetSpecV1 {
  triangles: number | Record<string, number>;
  draws?: number;
}

export interface BudgetDeclarationV1 {
  schemaVersion: 1;
  /** Maximum drawn triangles per tier, LOD0 first. */
  triangles: Record<string, number>;
  /** Maximum LOD0 draw calls. */
  draws?: number;
}

/** The report when no budget was declared. */
export const noBudget = (): BudgetReportV1 => ({ status: 'none', tiers: [] });

const fail = (detail: string): never => {
  throw new AuthoringDiagnosticError('DELIVERY_CONTRACT', `defineBudget(spec): ${detail}`);
};

const count = (label: string, value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    fail(`${label} must be a positive integer, got ${String(value)}.`);
  return value as number;
};

/** Validate a spec into its detached declaration. Tier keys are LOD0, LOD1, ... */
export function normalizeBudget(spec: unknown): BudgetDeclarationV1 {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec))
    fail('spec must be { triangles: number | { LOD0, LOD1, ... }, draws? }.');
  const value = spec as Record<string, unknown>;
  for (const key of Object.keys(value))
    if (key !== 'triangles' && key !== 'draws' && key !== 'schemaVersion')
      fail(`unknown field ${JSON.stringify(key)}.`);
  const triangles: Record<string, number> = {};
  if (typeof value.triangles === 'number') triangles.LOD0 = count('triangles', value.triangles);
  else if (
    value.triangles &&
    typeof value.triangles === 'object' &&
    !Array.isArray(value.triangles)
  ) {
    const entries = Object.entries(value.triangles as Record<string, unknown>);
    if (entries.length === 0) fail('triangles needs at least one tier.');
    for (const [tier, limit] of entries) {
      if (!/^LOD(0|[1-9][0-9]?)$/.test(tier))
        fail(`triangles tier ${JSON.stringify(tier)} must be named LOD0, LOD1, ...`);
      triangles[tier] = count(`triangles.${tier}`, limit);
    }
  } else fail('triangles must be a positive integer or a record of LOD tiers.');
  const ordered = Object.fromEntries(
    Object.entries(triangles).sort(([a], [b]) => Number(a.slice(3)) - Number(b.slice(3))),
  );
  return {
    schemaVersion: 1,
    triangles: ordered,
    ...(value.draws === undefined ? {} : { draws: count('draws', value.draws) }),
  };
}

/**
 * Declare the asset's budget. With `target` (normally the root), the declaration is stamped
 * on it; inside a Kiln program the sandbox stamps the returned root after build(). Returns the
 * normalised declaration.
 */
export function defineBudget(spec: BudgetSpecV1, target?: THREE.Object3D): BudgetDeclarationV1 {
  const declaration = normalizeBudget(spec);
  if (target !== undefined) {
    if ((target as { isObject3D?: boolean } | null)?.isObject3D !== true)
      fail('target must be a scene node, normally the root.');
    target.userData[KILN_BUDGET_KEY] = structuredClone(declaration);
  }
  return declaration;
}

/** The declaration a value holds, or undefined when it is absent or malformed. */
export function readBudgetDeclaration(value: unknown): BudgetDeclarationV1 | undefined {
  if (value === undefined) return undefined;
  try {
    const declaration = normalizeBudget(value);
    return (value as { schemaVersion?: unknown }).schemaVersion === 1 ? declaration : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Measure a declaration against the written GLB. Tier n draws level min(n, last) of every
 * `MSFT_lod` chain plus everything outside the chains; LOD0 is the manifest headline.
 */
export function evaluateBudget(
  declaration: BudgetDeclarationV1,
  measuredLod0: { triangles: number; draws: number; instancedDraws?: number },
  chains: readonly LevelOfDetailChainV1[],
): BudgetReportV1 {
  // Reported beside draws, never judged (#200).
  const instanced =
    measuredLod0.instancedDraws === undefined
      ? {}
      : { instancedDraws: measuredLod0.instancedDraws };
  const outside =
    measuredLod0.triangles - chains.reduce((sum, chain) => sum + chain.levels[0]!.triangles, 0);
  const tierTriangles = (level: number) =>
    outside +
    chains.reduce(
      (sum, chain) => sum + chain.levels[Math.min(level, chain.levels.length - 1)]!.triangles,
      0,
    );
  const tiers: BudgetTierV1[] = Object.entries(declaration.triangles).map(([tier, limit]) => {
    const level = Number(tier.slice(3));
    const triangles = level === 0 ? measuredLod0.triangles : tierTriangles(level);
    const drawsDeclared = level === 0 ? declaration.draws : undefined;
    const pass =
      triangles <= limit && (drawsDeclared === undefined || measuredLod0.draws <= drawsDeclared);
    return {
      tier,
      declared: {
        triangles: limit,
        ...(drawsDeclared === undefined ? {} : { draws: drawsDeclared }),
      },
      measured: {
        triangles,
        ...(drawsDeclared === undefined ? {} : { draws: measuredLod0.draws, ...instanced }),
      },
      status: pass ? 'pass' : 'fail',
    };
  });
  if (declaration.draws !== undefined && declaration.triangles.LOD0 === undefined)
    tiers.unshift({
      tier: 'LOD0',
      declared: { draws: declaration.draws },
      measured: { triangles: measuredLod0.triangles, draws: measuredLod0.draws, ...instanced },
      status: measuredLod0.draws <= declaration.draws ? 'pass' : 'fail',
    });
  return { status: tiers.every((tier) => tier.status === 'pass') ? 'pass' : 'fail', tiers };
}
