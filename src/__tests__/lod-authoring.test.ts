/**
 * Levels of detail as an explicit authoring contract.
 *
 * Tiers are sibling nodes whose names share a stem and carry `LOD0`, `LOD1`, ... tokens
 * (the same token QA already reads). `defineLod` gives a set its screen-coverage
 * thresholds, one per level, and export turns the set into one `MSFT_lod` chain. A set
 * without thresholds, or with a gap, is an authoring error rather than a guess.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { listHelperSpecs } from '../discovery/helper-specs';
import { AuthoringDiagnosticError } from '../evaluator/authoring-diagnostic';
import { collectLodSets, defineLod, KILN_LOD_KEY } from '../lod';
import { buildSandboxGlobals } from '../primitives';

function tier(name: string, parent?: THREE.Object3D): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  parent?.add(group);
  return group;
}

function asset(name = 'Car'): THREE.Group {
  const root = new THREE.Group();
  root.name = name;
  return root;
}

function lodError(run: () => unknown): AuthoringDiagnosticError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthoringDiagnosticError);
    expect((error as AuthoringDiagnosticError).diagnostic).toBe('LOD_SET');
    return error as AuthoringDiagnosticError;
  }
  throw new Error('expected an LOD_SET authoring error');
}

describe('defineLod', () => {
  test('declares one coverage value per tier on LOD0 and is a sandbox helper', () => {
    const root = asset();
    const levels = [tier('LOD0', root), tier('LOD1', root), tier('LOD2', root)];

    expect(defineLod(levels, { screenCoverage: [0.25, 0.06, 0] })).toBe(levels);
    expect(levels[0]!.userData[KILN_LOD_KEY]).toEqual({ screenCoverage: [0.25, 0.06, 0] });
    expect(levels[1]!.userData[KILN_LOD_KEY]).toBeUndefined();
    expect(typeof buildSandboxGlobals().defineLod).toBe('function');
    expect(listHelperSpecs().map((spec) => spec.name)).toContain('defineLod');
  });

  test('names what is wrong with a declaration and how to write it', () => {
    const root = asset();
    const [body0, body1, body2] = ['Body_LOD0', 'Body_LOD1', 'Body_LOD2'].map((name) =>
      tier(name, root),
    );
    const hood1 = tier('Hood_LOD1', root);
    const moved = tier('Body_LOD1', asset('Elsewhere'));

    expect(lodError(() => defineLod([body0!], { screenCoverage: [0.5] })).message).toContain(
      'at least two',
    );
    expect(
      lodError(() => defineLod([body0!, body2!], { screenCoverage: [0.5, 0.1] })).message,
    ).toContain('"Body_LOD2"');
    expect(
      lodError(() => defineLod([body0!, hood1], { screenCoverage: [0.5, 0.1] })).message,
    ).toContain('"Hood_LOD1"');
    expect(
      lodError(() => defineLod([body0!, body1!], { screenCoverage: [0.5] })).message,
    ).toContain('one value per level');
    expect(
      lodError(() => defineLod([body0!, body1!], { screenCoverage: [0.1, 0.2] })).message,
    ).toContain('decreasing');
    expect(
      lodError(() => defineLod([body0!, body1!], { screenCoverage: [1.5, 0.2] })).message,
    ).toContain('from 0 to 1');
    expect(
      lodError(() => defineLod([body0!, body1!], { screenCoverage: [0.5, Number.NaN] })).message,
    ).toContain('from 0 to 1');
    expect(
      lodError(() => defineLod([body0!, moved], { screenCoverage: [0.5, 0.1] })).message,
    ).toContain('same parent');
    expect(lodError(() => defineLod([body0!, body1!], undefined as never)).message).toContain(
      'screenCoverage',
    );
  });
});

describe('LOD sets', () => {
  test('sibling tiers with one stem form a set; lone tiers and names inside a tier do not', () => {
    const root = asset();
    const levels = ['LOD0', 'LOD1', 'LOD2'].map((name) => tier(name, root));
    tier('Wheel_FL', root);
    tier('Door_LOD1', levels[1]);
    tier('Sign_lod2', root);
    tier('Tree_LOD0', root);
    defineLod(levels, { screenCoverage: [0.2, 0.05, 0.01] });

    const sets = collectLodSets(root);

    expect(sets).toHaveLength(1);
    expect(sets[0]!.parent).toBe(root);
    expect(sets[0]!.levels).toEqual(levels);
    expect(sets[0]!.screenCoverage).toEqual([0.2, 0.05, 0.01]);
  });

  test('sets are found under any parent, one per stem', () => {
    const root = asset();
    const body = ['Body_LOD0', 'Body_LOD1'].map((name) => tier(name, root));
    const wheel = tier('Wheel_FL', root);
    const hub = ['Hub_LOD0', 'Hub_lod1'].map((name) => tier(name, wheel));
    defineLod(body, { screenCoverage: [0.3, 0] });
    defineLod(hub, { screenCoverage: [0.05, 0] });

    expect(collectLodSets(root).map((set) => set.levels.map((level) => level.name))).toEqual([
      ['Body_LOD0', 'Body_LOD1'],
      ['Hub_LOD0', 'Hub_lod1'],
    ]);
  });

  test('a set without a declaration fails with the defineLod call to add', () => {
    const root = asset();
    for (const name of ['Body_LOD0', 'Body_LOD1']) tier(name, root);

    const error = lodError(() => collectLodSets(root));

    expect(error.message).toContain('"Body_LOD<n>"');
    expect(error.message).toContain('defineLod([');
  });

  test('gaps, repeats, a missing LOD0 and stale declarations fail', () => {
    const gap = asset();
    defineLod([tier('LOD0', gap), tier('LOD1', gap)], { screenCoverage: [0.2, 0] });
    tier('LOD3', gap);
    expect(lodError(() => collectLodSets(gap)).message).toContain('0, 1, 3');

    const repeat = asset();
    const levels = [tier('LOD0', repeat), tier('LOD1', repeat)];
    defineLod(levels, { screenCoverage: [0.2, 0] });
    tier('LOD1', repeat);
    expect(lodError(() => collectLodSets(repeat)).message).toContain('0, 1, 1');

    const headless = asset();
    tier('Body_LOD1', headless);
    tier('Body_LOD2', headless);
    expect(lodError(() => collectLodSets(headless)).message).toContain('LOD0');

    const stale = asset();
    const three = [tier('LOD0', stale), tier('LOD1', stale), tier('LOD2', stale)];
    defineLod(three, { screenCoverage: [0.2, 0.05, 0] });
    three[2]!.removeFromParent();
    expect(lodError(() => collectLodSets(stale)).message).toContain('declares 3 levels');

    const alone = asset();
    const pair = [tier('LOD0', alone), tier('LOD1', alone)];
    defineLod(pair, { screenCoverage: [0.2, 0] });
    pair[1]!.removeFromParent();
    expect(lodError(() => collectLodSets(alone)).message).toContain('declares 2 levels');
  });
});

/** A program with two body tiers; `declare` adds their defineLod call. */
function tieredProgram(declare: boolean): string {
  return `const meta = { name: 'PRIVATE_MARKER' };
function build() {
  const root = createRoot('PRIVATE_MARKER');
  const tiers = ['Body_LOD0', 'Body_LOD1'].map((name, lod) => {
    const group = new THREE.Group();
    group.name = name;
    root.add(group);
    createPart('Shell' + lod, boxGeo(2 - lod * 0.2, 1, 1), gameMaterial(0x886644), { parent: group });
    return group;
  });
  ${declare ? 'defineLod(tiers, { screenCoverage: [0.2, 0] });' : ''}
  return root;
}`;
}

describe('the build enforces the set rule', () => {
  test('an undeclared set fails in process with the call to add', async () => {
    const { renderGLBInProcess } = await import('../render');
    const error = await renderGLBInProcess(tieredProgram(false)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthoringDiagnosticError);
    expect((error as AuthoringDiagnosticError).diagnostic).toBe('LOD_SET');
    expect(String(error)).toContain('defineLod([Body_LOD0, Body_LOD1]');
    await expect(renderGLBInProcess(tieredProgram(true))).resolves.toBeDefined();
  });

  test('the worker boundary carries only the closed cause and its advice', async () => {
    const { evaluateEvaluatorRequestV2 } = await import('../evaluator/handler');
    const { createEvaluatorRequestV2 } = await import('../evaluator/protocol');
    const { renderGLBViaSubprocess } = await import('../evaluator/subprocess');
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: 'lod', code: tieredProgram(false) }).json,
    );

    expect(JSON.parse(wire).error).toEqual({
      code: 'EXECUTION_REJECTED',
      message: 'Generated asset execution was rejected.',
      diagnostic: 'LOD_SET',
    });
    expect(wire).not.toContain('PRIVATE_MARKER');
    const error = await renderGLBViaSubprocess(tieredProgram(false)).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'EXECUTION_REJECTED', diagnostic: 'LOD_SET' });
    expect(String(error)).toContain('defineLod([lod0, lod1, ...]');
    expect(String(error)).not.toContain('PRIVATE_MARKER');
  }, 20000);
});
