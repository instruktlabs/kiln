import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalToolContext } from '../local-runtime';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { validate } from '../validation';
import { EXECUTION_REJECTED_ADVICE } from './authoring-diagnostic';
import { evaluateEvaluatorRequestV2 } from './handler';
import { createEvaluatorRequestV2, decodeEvaluatorResultV2 } from './protocol';
import { renderGLBViaSubprocess } from './subprocess';

const wireError = async (code: string) => {
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'cause', code }).json,
  );
  expect(decodeEvaluatorResultV2(wire, 100000, 'cause').ok).toBe(false);
  return { wire, error: JSON.parse(wire).error };
};

const tdz = `const WIDTH = PRIVATE_DEPTH * 2;
const PRIVATE_DEPTH = 0.5;
function build() { return createRoot('PRIVATE_MARKER'); }`;
const recipe = `async function build() {
  const glow = await materialRecipe('kiln.material.emissive.v1', { metalness: 0.5 });
  return createRoot('PRIVATE_MARKER');
}`;

test('build-time throws carry a closed cause and no program text across the worker', async () => {
  for (const [code, diagnostic] of [
    [tdz, 'UNINITIALIZED_BINDING'],
    [
      `function build() { const w = PRIVATE_DEPTH * 2; const PRIVATE_DEPTH = 1; return createRoot('PRIVATE_MARKER'); }`,
      'UNINITIALIZED_BINDING',
    ],
    [`function build() { const root = createRoot('PRIVATE_MARKER'); }`, 'BUILD_RESULT'],
    [`function build() { const o = undefined; return o.PRIVATE_MARKER; }`, 'PROGRAM_TYPE_ERROR'],
    [`function build() { return new Array(-1); }`, 'PROGRAM_RANGE_ERROR'],
    [recipe, 'MATERIAL_RECIPE_OVERRIDE'],
  ] as const) {
    const { wire, error } = await wireError(code);
    expect(error).toEqual({
      code: 'EXECUTION_REJECTED',
      message: 'Generated asset execution was rejected.',
      diagnostic,
    });
    for (const value of ['PRIVATE_MARKER', 'PRIVATE_DEPTH', 'metalness'])
      expect(wire).not.toContain(value);
  }
});

test('a throw with no closed cause is answered with the engine-owned generic advice', async () => {
  // s50 threw an Error to print bounding boxes and got the bare sentence (H30, decision 24
  // of 2 October 2026): the sentence stays exact and first; the advice is the engine's.
  const code = `function build() { throw new Error('PRIVATE_MARKER'); }`;
  const { wire, error } = await wireError(code);
  expect(error).toEqual({
    code: 'EXECUTION_REJECTED',
    message: 'Generated asset execution was rejected.',
  });
  expect(wire).not.toContain('PRIVATE_MARKER');
  const thrown = (await renderGLBViaSubprocess(code).catch((e: unknown) => e)) as Error;
  expect(thrown.message).toStartWith('Generated asset execution was rejected. ');
  expect(thrown.message).toBe(
    `Generated asset execution was rejected. ${EXECUTION_REJECTED_ADVICE}`,
  );
  expect(thrown.message).toContain('kiln_inspect');
  expect(thrown.message).not.toContain('PRIVATE_MARKER');
  // A rejection that carries a cause keeps that cause's advice alone.
  const typed = (await renderGLBViaSubprocess(
    `function build() { const o = undefined; return o.PRIVATE_MARKER; }`,
  ).catch((e: unknown) => e)) as Error;
  expect(typed.message).toContain('TypeError');
  expect(typed.message).not.toContain(EXECUTION_REJECTED_ADVICE);
}, 20000);

test('the actual subprocess turns those causes into engine-owned advice', async () => {
  await expect(renderGLBViaSubprocess(tdz)).rejects.toThrow('before its declaration ran');
  await expect(renderGLBViaSubprocess(recipe)).rejects.toThrow('allowed overrides');
}, 20000);

test('validate names a recipe override the recipe does not accept', () => {
  const result = validate(`const meta = { name: 'Glow' };\n${recipe}`);
  expect(result.valid).toBe(false);
  const issue = result.issues.find((i) => i.code === 'MATERIAL_RECIPE_OVERRIDE');
  expect(issue?.line).toBe(3);
  for (const text of ['metalness', 'kiln.material.emissive.v1', 'emissiveIntensity'])
    expect(issue?.message).toContain(text);
  const unknown = validate(
    `const meta = { name: 'Lava' };\nasync function build() { await materialRecipe('kiln.material.lava.v1'); return createRoot('Lava'); }`,
  );
  expect(unknown.issues.map((i) => i.code)).toContain('MATERIAL_RECIPE_ID');
  const allowed = validate(
    `const meta = { name: 'Glow' };\nasync function build() { await materialRecipe('kiln.material.emissive.v1', { emissiveIntensity: 0.4, 'baseColor': '#202020' }); return createRoot('Glow'); }`,
  );
  expect(allowed.valid).toBe(true);
});

test('validate reports a lexical binding read before its declaration runs', () => {
  const codes = (code: string) =>
    validate(`const meta = { name: 'Tdz' };\n${code}`).issues.filter(
      (i) => i.code === 'TEMPORAL_DEAD_ZONE',
    );
  const top = codes(tdz);
  expect(top).toHaveLength(1);
  expect(top[0]!.line).toBe(2);
  expect(top[0]!.message).toContain('PRIVATE_DEPTH');
  expect(top[0]!.message).toContain('line 3');
  // Immediately executed code inside build, nested blocks and self-reference.
  expect(
    codes(`function build() { if (true) { use(D); } const D = 1; return createRoot('A'); }`),
  ).toHaveLength(1);
  expect(codes(`const X = X + 1;\nfunction build() { return createRoot('A'); }`)).toHaveLength(1);
  // Deferred reads, shadowing and later reads are not temporal-dead-zone reads.
  for (const ok of [
    `const f = () => D;\nconst D = 1;\nfunction build() { return createRoot('A'); }`,
    `function build() { return createRoot(NAME); }\nconst NAME = 'A';`,
    `const D = 1;\nfunction build() { { const D = 2; use(D); } return createRoot('A'); }`,
    `const D = 1;\nconst E = D + 1;\nfunction build() { return createRoot('A'); }`,
    `const o = { D: 1 };\nconst v = o.D;\nconst D = 2;\nfunction build() { return createRoot('A'); }`,
  ])
    expect(codes(ok)).toEqual([]);
});

test('local hosts append the source check to an opaque rejection once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-source-check-'));
  try {
    const context = createLocalToolContext(
      {},
      {
        KILN_WORKSPACE: root,
        KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
        KILN_LIVE_REVIEW: 'off',
        KILN_EVALUATOR_MODE: 'subprocess',
      },
    );
    const policy = `const meta = { name: 'This' };\nfunction size() { return this ? 1 : 2; }\nfunction build() { return createRoot('A'); }`;
    const error = (await context.evaluatorPort!.render(policy).catch((e: unknown) => e)) as Error;
    expect(error.message).toStartWith('Generated asset execution was rejected.');
    expect(error.message).toContain('Source check: UNSAFE_GLOBAL_ACCESS at line 2');
    // Missing meta is not a cause of rejection and is not reported as one.
    const typeError = (await context
      .evaluatorPort!.render(`function build() { const o = undefined; return o.x; }`)
      .catch((e: unknown) => e)) as Error;
    expect(typeError.message).not.toContain('MISSING_META');
    // Tools on an injected port add the same check exactly once.
    const render = createKilnProgramToolRegistry({
      evaluatorPort: { render: renderGLBViaSubprocess },
    }).find((d) => d.name === 'kiln_render')!;
    const out = (await render.run({ code: policy })) as { ok: boolean; error: string };
    expect(out.ok).toBe(false);
    expect(out.error.split('Source check:')).toHaveLength(2);
    expect(out.error).toContain('UNSAFE_GLOBAL_ACCESS at line 2');
    const local = createKilnProgramToolRegistry(context).find((d) => d.name === 'kiln_render')!;
    const both = (await local.run({ code: policy })) as { ok: boolean; error: string };
    expect(both.error.split('Source check:')).toHaveLength(2);
    // Every other tool that evaluates source reports the same check.
    const injected = createKilnProgramToolRegistry({
      evaluatorPort: { render: renderGLBViaSubprocess },
    });
    for (const [name, args] of [
      ['kiln_inspect', { code: policy, image: false, listParts: {} }],
      ['kiln_view_interior', { code: policy }],
      ['kiln_screenshot_animation', { code: policy, clip: 'spin' }],
    ] as const) {
      const tool = injected.find((d) => d.name === name)!;
      const result = (await tool.run(args)) as { ok: boolean; error: string };
      expect(result.ok).toBe(false);
      expect(result.error, name).toContain('Source check: UNSAFE_GLOBAL_ACCESS at line 2');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
