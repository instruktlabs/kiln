/**
 * Declared parameters through the tool surface: kiln_render builds a variant from `params`,
 * names a refused value, never retains a variant as the reviewed artifact, and sweeps the
 * declared range without images.
 */
import { describe, expect, test } from 'bun:test';
import { normalizeParamsSpec, sweepPoints } from '../../params';
import { ProgramArtifactStore } from '../program-artifacts';
import { createKilnProgramToolRegistry, type KilnRenderViewsResult } from '../registry';

const PARAMETRIC = `const meta = { name: 'crate' };
const P = defineParams({
  width: { type: 'range', default: 1, min: 0.5, max: 2, step: 0.25, unit: 'm' },
  count: { type: 'int', default: 2, min: 1, max: 3 },
  lid: { type: 'toggle', default: true },
  paint: { type: 'color', default: '#8a5a33' },
  style: { type: 'choice', default: 'plain', options: ['plain', 'tall', 'broken'] },
}, { presets: { wide: { width: 2, count: 3 } } });
function build() {
  const root = createRoot('Crate');
  const paint = gameMaterial(P.paint);
  if (P.style === 'broken') return undefined;
  for (let i = 0; i < P.count; i++)
    createPart('Box' + i, boxGeo(P.width, P.style === 'tall' ? 2 : 1, 1), paint, {
      parent: root,
      position: [i * 3, P.style === 'tall' ? 1 : 0.5, 0],
    });
  if (P.lid)
    createPart('Lid', boxGeo(P.width, 0.1, 1), paint, { parent: root, position: [0, 3, 0] });
  return root;
}`;
const PLAIN = `const meta = { name: 'plain' };
function build() {
  const root = createRoot('Plain');
  createPart('Box', boxGeo(1, 1, 1), gameMaterial('#808080'), { parent: root, position: [0, 0.5, 0] });
  return root;
}`;

type ParamsResult = KilnRenderViewsResult & {
  programRef?: string;
  params?: { preset?: string; values: Record<string, unknown> };
  paramIssues?: { name: string; code: string; detail: string }[];
  sweep?: {
    points: {
      label: string;
      values: Record<string, unknown>;
      ok: boolean;
      tris?: number;
      draws?: number;
      size?: number[];
      acceptance?: string;
      error?: string;
    }[];
    built: number;
    failed: number;
    notSwept: string[];
  };
};

const render = (context = {}) =>
  createKilnProgramToolRegistry(context).find((def) => def.name === 'kiln_render')!;
const run = async (input: Record<string, unknown>, context = {}) =>
  (await render(context).run(input)) as ParamsResult;

describe('kiln_render params', () => {
  test('builds the variant and reports the values used', async () => {
    const base = await run({ code: PARAMETRIC });
    expect(base.ok).toBe(true);
    expect(base.params).toEqual({
      values: { width: 1, count: 2, lid: true, paint: '#8a5a33', style: 'plain' },
    });
    const variant = await run({
      code: PARAMETRIC,
      params: { preset: 'wide', values: { lid: false } },
    });
    expect(variant.ok).toBe(true);
    expect(variant.params).toEqual({
      preset: 'wide',
      values: { width: 2, count: 3, lid: false, paint: '#8a5a33', style: 'plain' },
    });
    expect(variant.tris).toBe(36);
    expect(base.tris).toBe(36);
    expect(variant.bbox!.size[0]).toBeCloseTo(8, 5);
    expect(variant.viewFidelity?.inputGlbSha256).not.toBe(base.viewFidelity?.inputGlbSha256);
    expect(variant.pngBase64).toBeDefined();
    const plain = await run({ code: PLAIN });
    expect(plain.params).toBeUndefined();
  }, 60_000);

  test('names each refused value and builds nothing', async () => {
    const refused = await run({
      code: PARAMETRIC,
      params: { values: { width: 9, depth: 1, style: 'short' } },
    });
    expect(refused.ok).toBe(false);
    expect(refused.pngBase64).toBeUndefined();
    expect(refused.paramIssues?.map(({ name, code }) => [name, code])).toEqual([
      ['width', 'OUT_OF_RANGE'],
      ['depth', 'UNKNOWN_PARAMETER'],
      ['style', 'NOT_AN_OPTION'],
    ]);
    expect(refused.error).toContain('width takes 0.5 to 2');
    expect(refused.error).toContain('plain, tall, broken');
    const undeclared = await run({ code: PLAIN, params: { values: { width: 1 } } });
    expect(undeclared.ok).toBe(false);
    expect(undeclared.error).toContain('declares no parameters');
    expect(undeclared.paramIssues).toBeUndefined();
  }, 60_000);

  test('refuses malformed params input before building', async () => {
    for (const params of [
      { values: { width: [1] } },
      { extra: true },
      { sweep: true, values: { width: 1 } },
      { sweep: true, preset: 'wide' },
    ])
      await expect(render().run({ code: PARAMETRIC, params })).rejects.toThrow();
  });

  test('a variant is never retained as the reviewed artifact', async () => {
    const programArtifacts = new ProgramArtifactStore();
    const variant = await run(
      { code: PARAMETRIC, params: { values: { width: 2 } } },
      { programArtifacts },
    );
    expect(variant.ok).toBe(true);
    expect(variant.viewFidelity?.exactArtifact).toBe(false);
    expect(variant.viewFidelity?.reasonCodes).toContain('IN_LOOP_BUILD_NOT_PERSISTED');
    expect(programArtifacts.latest(variant.requirements!)).toBeUndefined();
    const base = await run({ code: PARAMETRIC }, { programArtifacts });
    expect(base.viewFidelity?.exactArtifact).toBe(true);
    expect(programArtifacts.latest(base.requirements!)?.rendered.artifactGlbSha256).toBe(
      base.viewFidelity!.inputGlbSha256,
    );
    // Passing the defaults explicitly is the default build, and is retained like one.
    const explicit = await run(
      { code: PARAMETRIC, params: { values: { width: 1 } } },
      { programArtifacts: new ProgramArtifactStore() },
    );
    expect(explicit.viewFidelity?.inputGlbSha256).toBe(base.viewFidelity!.inputGlbSha256);
    expect(explicit.viewFidelity?.exactArtifact).toBe(true);
  }, 60_000);
});

describe('sweep', () => {
  test('points cover the defaults, each extreme, each other option and every preset', () => {
    const declaration = normalizeParamsSpec(
      {
        width: { type: 'range', default: 1, min: 0.5, max: 2 },
        low: { type: 'int', default: 1, min: 1, max: 3 },
        lid: { type: 'toggle', default: true },
        paint: { type: 'color', default: '#8a5a33' },
        style: { type: 'choice', default: 'plain', options: ['plain', 'tall'] },
        seed: { type: 'seed', default: 7 },
      },
      { presets: { wide: { width: 2 } } },
    );
    const { points, notSwept } = sweepPoints(declaration);
    expect(points.map((point) => point.label)).toEqual([
      'defaults',
      'width=0.5',
      'width=2',
      'low=3',
      'lid=false',
      'style=tall',
      'preset wide',
    ]);
    expect(points[1]!.input).toEqual({ values: { width: 0.5 } });
    expect(points.at(-1)!.input).toEqual({ preset: 'wide' });
    expect(notSwept).toEqual(['paint', 'seed']);
    const limited = sweepPoints(declaration, 3);
    expect(limited.points).toHaveLength(3);
    expect(limited.notSwept).toEqual([
      'low=3',
      'lid=false',
      'style=tall',
      'preset wide',
      'paint',
      'seed',
    ]);
  });

  test('kiln_render sweep builds every point and returns no image', async () => {
    const result = await run({ code: PARAMETRIC, params: { sweep: true } });
    expect(result.ok).toBe(true);
    expect(result.pngBase64).toBeUndefined();
    const sweep = result.sweep!;
    expect(sweep.points.map((point) => point.label)).toEqual([
      'defaults',
      'width=0.5',
      'width=2',
      'count=1',
      'count=3',
      'lid=false',
      'style=tall',
      'style=broken',
      'preset wide',
    ]);
    expect(sweep.notSwept).toEqual(['paint']);
    expect(sweep.built).toBe(8);
    expect(sweep.failed).toBe(1);
    const byLabel = Object.fromEntries(sweep.points.map((point) => [point.label, point]));
    expect(byLabel.defaults).toMatchObject({ ok: true, tris: 36, values: {} });
    expect(byLabel['count=3']).toMatchObject({ ok: true, tris: 48, values: { count: 3 } });
    expect(byLabel['width=2']!.size![0]).toBeCloseTo(5, 5);
    expect(byLabel['lid=false']!.tris).toBe(24);
    expect(byLabel['preset wide']).toMatchObject({ ok: true, values: { width: 2, count: 3 } });
    expect(byLabel['style=broken']).toMatchObject({ ok: false });
    expect(byLabel['style=broken']!.error).toContain('build()');
    expect(typeof byLabel.defaults!.acceptance).toBe('string');
    expect(byLabel.defaults!.draws).toBeGreaterThan(0);
  }, 120_000);

  test('a program without parameters has nothing to sweep', async () => {
    const result = await run({ code: PLAIN, params: { sweep: true } });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('declares no parameters');
  }, 60_000);
});
