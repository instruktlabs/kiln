/**
 * Triangle and draw budgets in the receipt (delivery contract item 3).
 *
 * `defineBudget({ triangles, draws? })` declares a budget in source. The declaration travels
 * as scene extras `kilnBudgetV1`, and the integration manifest, the CLI `--json` receipt and
 * `kiln_render` report `budget: { status, tiers: [{ tier, declared, measured, status }] }`.
 * Advisory by default: it never changes QA acceptance. CLI `--strict-budget` exits non-zero
 * when a tier fails.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as THREE from 'three';
import { defineBudget, KILN_BUDGET_KEY } from '../budget';
import { AuthoringDiagnosticError } from '../evaluator/authoring-diagnostic';
import { buildSandboxGlobals } from '../primitives';
import { renderGLBInProcess } from '../render';
import { createKilnProgramToolRegistry } from '../tools/registry';

const tiered = (budget: string) => `const meta={name:'Budgeted'};
function build(){
  const root=createRoot('Root');
  const m=gameMaterial('#777777');
  createPart('Base',boxGeo(1,0.2,1),m,{parent:root});
  const tiers=['Body_LOD0','Body_LOD1'].map((name)=>{const g=new THREE.Group();g.name=name;root.add(g);return g;});
  createPart('Hi',sphereGeo(0.5,16,12),m,{parent:tiers[0],position:[0,1,0]});
  createPart('Lo',boxGeo(1,1,1),m,{parent:tiers[1],position:[0,1,0]});
  defineLod(tiers,{screenCoverage:[0.2,0]});
  ${budget}
  return root;
}`;

describe('defineBudget', () => {
  test('normalises a number or a per-tier record and stamps a target', () => {
    const root = new THREE.Group();
    expect(defineBudget({ triangles: 500, draws: 4 }, root)).toEqual({
      schemaVersion: 1,
      triangles: { LOD0: 500 },
      draws: 4,
    });
    expect(root.userData[KILN_BUDGET_KEY]).toEqual({
      schemaVersion: 1,
      triangles: { LOD0: 500 },
      draws: 4,
    });
    expect(defineBudget({ triangles: { LOD0: 500, LOD1: 80 } })).toEqual({
      schemaVersion: 1,
      triangles: { LOD0: 500, LOD1: 80 },
    });
    for (const bad of [
      { triangles: 0 },
      { triangles: 1.5 },
      { triangles: { Body: 4 } },
      { triangles: 10, draws: -1 },
      { triangles: 10, extra: 1 },
    ])
      expect(() => defineBudget(bad as never)).toThrow(AuthoringDiagnosticError);
    expect(typeof buildSandboxGlobals().defineBudget).toBe('function');
  });

  test('reports each tier against the GLB, pass and fail', async () => {
    const result = await renderGLBInProcess(
      tiered(`defineBudget({ triangles: { LOD0: 400, LOD1: 20 }, draws: 2 });`),
    );
    const budget = result.integrationManifest.budget!;
    // Base (12) + Hi sphere (16 x 12 segments: 16 * (12 - 1) * 2 = 352) and Base + Lo box (12).
    expect(budget.tiers).toEqual([
      {
        tier: 'LOD0',
        declared: { triangles: 400, draws: 2 },
        measured: { triangles: 364, draws: 2 },
        status: 'pass',
      },
      { tier: 'LOD1', declared: { triangles: 20 }, measured: { triangles: 24 }, status: 'fail' },
    ]);
    expect(budget.status).toBe('fail');
    // Advisory: the asset still builds and QA does not block on it.
    expect(result.glb.length).toBeGreaterThan(0);
  });

  test('kiln_render metrics carry the budget, and status none when undeclared', async () => {
    const render = createKilnProgramToolRegistry().find((tool) => tool.name === 'kiln_render')!;
    const declared = (await render.run({
      code: tiered('defineBudget({ triangles: 100 });'),
      detail: 'lean',
    })) as { budget: { status: string; tiers: { tier: string }[] } };
    expect(declared.budget.status).toBe('fail');
    expect(declared.budget.tiers.map((tier) => tier.tier)).toEqual(['LOD0']);
    const undeclared = (await render.run({ code: tiered('') })) as { budget: unknown };
    expect(undeclared.budget).toEqual({ status: 'none', tiers: [] });
  });

  test('an undeclared budget is absent from the manifest', async () => {
    const result = await renderGLBInProcess(tiered(''));
    expect(result.integrationManifest.budget).toBeUndefined();
  });
});

describe('CLI budget receipt', () => {
  let directory: string;
  beforeAll(async () => {
    const base = resolve(import.meta.dir, '../../tmp');
    await mkdir(base, { recursive: true });
    directory = await mkdtemp(join(base, 'cli-budget-'));
    const built = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../cli.ts')],
      target: 'node',
      packages: 'external',
      outdir: directory,
      naming: 'cli.mjs',
    });
    expect(built.success).toBe(true);
    await writeFile(join(directory, 'pass.js'), tiered('defineBudget({ triangles: 400 });'));
    await writeFile(join(directory, 'fail.js'), tiered('defineBudget({ triangles: 100 });'));
    await writeFile(join(directory, 'none.js'), tiered(''));
  });
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const run = (args: string[]) =>
    Bun.spawnSync(['node', join(directory, 'cli.mjs'), ...args], {
      cwd: directory,
      env: {
        ...process.env,
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_BUILD_CACHE: 'off',
        KILN_WORKSPACE: directory,
        KILN_PROGRAM_STORE: join(directory, 'programs'),
        KILN_RENDER: 'cpu',
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20000,
    });

  test('the receipt carries the budget and --strict-budget exits non-zero on fail', () => {
    const none = run(['render', 'none.js', '--out', 'none.glb', '--json']);
    expect(none.exitCode).toBe(0);
    expect(JSON.parse(none.stdout.toString()).budget).toEqual({ status: 'none', tiers: [] });

    const failed = run(['render', 'fail.js', '--out', 'fail.glb', '--json']);
    expect(failed.exitCode).toBe(0);
    expect(JSON.parse(failed.stdout.toString()).budget.status).toBe('fail');

    const strict = run(['render', 'fail.js', '--out', 'fail.glb', '--json', '--strict-budget']);
    expect(strict.exitCode).not.toBe(0);
    expect(JSON.parse(strict.stdout.toString()).budget.status).toBe('fail');

    const passed = run(['render', 'pass.js', '--out', 'pass.glb', '--strict-budget']);
    expect(passed.exitCode).toBe(0);
    expect(passed.stdout.toString()).toContain('budget pass');
  });
});
