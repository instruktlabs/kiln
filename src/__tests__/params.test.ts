import { describe, expect, test } from 'bun:test';
import { createCachedEvaluatorPort, MemoryBuildCache } from '../build-cache';
import { AuthoringDiagnosticError, PARAMS_VALUE_ADVICE } from '../evaluator/authoring-diagnostic';
import { createEvaluatorRequestV2, decodeEvaluatorRequestV2 } from '../evaluator/protocol';
import { EvaluatorSubprocessError, renderGLBViaSubprocess } from '../evaluator/subprocess';
import {
  checkParamValues,
  normalizeParamsSpec,
  PARAMS_MAX_COUNT,
  resolveParams,
  validateParamsInput,
  validateParamsReport,
} from '../params';
import { executeKilnCode, renderGLBInProcess } from '../render';

const SPEC = `{
  width: { type: 'range', default: 1, min: 0.5, max: 2, step: 0.25, unit: 'm', label: 'Width', describe: 'Box width.' },
  count: { type: 'int', default: 2, min: 1, max: 4 },
  lid: { type: 'toggle', default: true },
  paint: { type: 'color', default: '#8A5A33' },
  style: { type: 'choice', default: 'plain', options: ['plain', 'tall'] },
  seed: { type: 'seed', default: 7 },
}`;
const body = (width: string, count: string, lid: string, paint: string, style: string) =>
  `function build(){const r=createRoot('Root');const m=gameMaterial(${paint});` +
  `for(let i=0;i<${count};i++)createPart('Box'+i,boxGeo(${width},${style}==='tall'?2:1,1),m,{parent:r,position:[i*3,0,0]});` +
  `if(${lid})createPart('Lid',boxGeo(${width},0.1,1),m,{parent:r,position:[0,1,0]});return r;}`;
const PARAMETRIC = `const meta={name:'params'};const P=defineParams(${SPEC},{presets:{wide:{width:2,count:3}}});${body('P.width', 'P.count', 'P.lid', 'P.paint', 'P.style')}`;
const literal = (width: number, count: number, lid: boolean, paint: string, style: string) =>
  `const meta={name:'params'};${body(String(width), String(count), String(lid), `'${paint}'`, `'${style}'`)}`;

const diagnosticOf = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof AuthoringDiagnosticError) return error.diagnostic;
    throw error;
  }
  return 'NO_ERROR';
};

describe('defineParams spec', () => {
  test('normalizes a declaration and lowercases colours', () => {
    const declaration = normalizeParamsSpec(
      { paint: { type: 'color', default: '#8A5A33' }, on: { type: 'toggle', default: false } },
      { presets: { dark: { paint: '#101010' } } },
    );
    expect(declaration).toEqual({
      schemaVersion: 1,
      params: {
        paint: { type: 'color', default: '#8a5a33' },
        on: { type: 'toggle', default: false },
      },
      presets: { dark: { paint: '#101010' } },
    });
  });

  test.each([
    ['empty spec', {}],
    ['bad name', { '9lives': { type: 'toggle', default: true } }],
    ['prototype name', { constructor: { type: 'toggle', default: true } }],
    ['unknown type', { a: { type: 'slider', default: 1 } }],
    ['unknown field', { a: { type: 'toggle', default: true, extra: 1 } }],
    ['default out of range', { a: { type: 'range', default: 3, min: 0, max: 2 } }],
    ['min not below max', { a: { type: 'range', default: 1, min: 1, max: 1 } }],
    ['non-finite', { a: { type: 'range', default: 1, min: 0, max: Number.POSITIVE_INFINITY } }],
    ['fractional int', { a: { type: 'int', default: 1.5, min: 0, max: 3 } }],
    ['snap without step', { a: { type: 'range', default: 1, min: 0, max: 2, snap: true } }],
    [
      'default off step',
      { a: { type: 'range', default: 0.3, min: 0, max: 2, step: 0.5, snap: true } },
    ],
    ['bad colour', { a: { type: 'color', default: 'red' } }],
    ['default not an option', { a: { type: 'choice', default: 'x', options: ['a', 'b'] } }],
    ['duplicate options', { a: { type: 'choice', default: 'a', options: ['a', 'a'] } }],
    ['seed out of range', { a: { type: 'seed', default: -1 } }],
    ['long describe', { a: { type: 'toggle', default: true, describe: 'x'.repeat(241) } }],
  ])('refuses %s', (_label, spec) => {
    expect(() => normalizeParamsSpec(spec)).toThrow(AuthoringDiagnosticError);
  });

  test('bounds the number of parameters', () => {
    const spec = Object.fromEntries(
      Array.from({ length: PARAMS_MAX_COUNT + 1 }, (_, i) => [
        `p${i}`,
        { type: 'toggle', default: true },
      ]),
    );
    expect(() => normalizeParamsSpec(spec)).toThrow(AuthoringDiagnosticError);
  });

  test('refuses a preset that names an unknown parameter or a bad value', () => {
    const spec = { a: { type: 'int', default: 1, min: 0, max: 3 } };
    expect(() => normalizeParamsSpec(spec, { presets: { p: { b: 1 } } })).toThrow(
      AuthoringDiagnosticError,
    );
    expect(() => normalizeParamsSpec(spec, { presets: { p: { a: 9 } } })).toThrow(
      AuthoringDiagnosticError,
    );
  });
});

describe('parameter values', () => {
  const declaration = normalizeParamsSpec(
    {
      width: { type: 'range', default: 1, min: 0.5, max: 2 },
      grid: { type: 'range', default: 1, min: 0.5, max: 2, step: 0.5, snap: true },
      count: { type: 'int', default: 2, min: 1, max: 4 },
      lid: { type: 'toggle', default: true },
      paint: { type: 'color', default: '#8a5a33' },
      style: { type: 'choice', default: 'plain', options: ['plain', 'tall'] },
    },
    { presets: { wide: { width: 2, count: 3 } } },
  );

  test('defaults, presets and values resolve in that order', () => {
    expect(resolveParams(declaration, undefined)).toEqual({
      width: 1,
      grid: 1,
      count: 2,
      lid: true,
      paint: '#8a5a33',
      style: 'plain',
    });
    const resolved = resolveParams(declaration, {
      preset: 'wide',
      values: { count: 4, paint: '#FFFFFF' },
    });
    expect(resolved).toMatchObject({ width: 2, count: 4, paint: '#ffffff' });
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  test('names each refused value', () => {
    const issues = checkParamValues(declaration, {
      preset: 'narrow',
      values: {
        width: 3,
        grid: 0.75,
        count: 2.5,
        lid: 'yes',
        paint: 'red',
        style: 'short',
        depth: 1,
      },
    });
    expect(issues.map(({ name, code }) => [name, code])).toEqual([
      ['narrow', 'UNKNOWN_PRESET'],
      ['width', 'OUT_OF_RANGE'],
      ['grid', 'OFF_STEP'],
      ['count', 'WRONG_TYPE'],
      ['lid', 'WRONG_TYPE'],
      ['paint', 'WRONG_TYPE'],
      ['style', 'NOT_AN_OPTION'],
      ['depth', 'UNKNOWN_PARAMETER'],
    ]);
    expect(issues[1]!.detail).toContain('0.5');
    expect(() => resolveParams(declaration, { values: { width: 3 } })).toThrow(
      AuthoringDiagnosticError,
    );
  });

  test('a step is a hint unless snap is set', () => {
    const hinted = normalizeParamsSpec({
      w: { type: 'range', default: 1, min: 0, max: 2, step: 0.5 },
    });
    expect(checkParamValues(hinted, { values: { w: 0.3 } })).toEqual([]);
  });
});

describe('defineParams in a program', () => {
  test('a default build is byte-identical to the same program with literals', async () => {
    const parametric = await renderGLBInProcess(PARAMETRIC);
    const plain = await renderGLBInProcess(literal(1, 2, true, '#8a5a33', 'plain'));
    expect(parametric.artifactGlbSha256).toBe(plain.artifactGlbSha256);
    expect(parametric.params?.values).toEqual({
      width: 1,
      count: 2,
      lid: true,
      paint: '#8a5a33',
      style: 'plain',
      seed: 7,
    });
    expect(parametric.params?.declaration.params.width).toMatchObject({ type: 'range', unit: 'm' });
    expect(plain.params).toBeUndefined();
  });

  test('host values build the same bytes as the literal program at those values', async () => {
    const variant = await renderGLBInProcess(PARAMETRIC, {
      params: { preset: 'wide', values: { lid: false, style: 'tall' } },
    });
    const plain = await renderGLBInProcess(literal(2, 3, false, '#8a5a33', 'tall'));
    expect(variant.artifactGlbSha256).toBe(plain.artifactGlbSha256);
    expect(variant.params).toMatchObject({
      preset: 'wide',
      values: { width: 2, count: 3, lid: false },
    });
  });

  test('refuses bad values, undeclared parameters and misuse with closed codes', async () => {
    expect(
      await diagnosticOf(() => executeKilnCode(PARAMETRIC, { params: { values: { width: 9 } } })),
    ).toBe('PARAMS_VALUE');
    expect(
      await diagnosticOf(() =>
        executeKilnCode(literal(1, 1, true, '#808080', 'plain'), {
          params: { values: { width: 1 } },
        }),
      ),
    ).toBe('PARAMS_VALUE');
    // An empty input passes nothing, so a program without parameters still builds.
    expect(
      (await executeKilnCode(literal(1, 1, true, '#808080', 'plain'), { params: { values: {} } }))
        .params,
    ).toBeUndefined();
    const twice = `const A=defineParams({a:{type:'toggle',default:true}});const B=defineParams({b:{type:'toggle',default:true}});${body('1', '1', 'A.a', "'#808080'", "'plain'")}`;
    expect(await diagnosticOf(() => executeKilnCode(twice))).toBe('PARAMS_CONTRACT');
    const late = `function build(){const P=defineParams({a:{type:'toggle',default:true}});const r=createRoot('Root');createPart('B',boxGeo(1,1,1),gameMaterial('#808080'),{parent:r});return r;}`;
    expect(await diagnosticOf(() => executeKilnCode(late))).toBe('PARAMS_CONTRACT');
    expect(
      await diagnosticOf(() =>
        executeKilnCode(
          `const P=defineParams({});${body('1', '1', 'true', "'#808080'", "'plain'")}`,
        ),
      ),
    ).toBe('PARAMS_CONTRACT');
  });

  test('resolved values cannot be changed by the program', async () => {
    const mutating = `const P=defineParams({a:{type:'int',default:1,min:0,max:3}});P.a=3;${body('1', 'P.a', 'true', "'#808080'", "'plain'")}`;
    await expect(executeKilnCode(mutating)).rejects.toThrow(TypeError);
  });
});

describe('transport and cache', () => {
  // Measured 1.6 s on an idle host; the budget covers a cold Windows worker start.
  test('a subprocess build matches the in-process build and reports only a closed code', async () => {
    // The worker does not inherit KILN_GLTF_EXPORTER, so both sides name the converter.
    const options = {
      gltfExporter: 'legacy' as const,
      params: { preset: 'wide', values: { lid: false } },
    };
    const direct = await renderGLBInProcess(PARAMETRIC, options);
    const contained = await renderGLBViaSubprocess(PARAMETRIC, options, { deadlineMs: 30_000 });
    expect(contained.artifactGlbSha256).toBe(direct.artifactGlbSha256);
    expect(contained.params).toEqual(direct.params!);
    const refused = await renderGLBViaSubprocess(
      PARAMETRIC,
      { params: { values: { width: 9 } } },
      { deadlineMs: 30_000 },
    ).catch((error) => error);
    expect(refused).toBeInstanceOf(EvaluatorSubprocessError);
    expect(String(refused.message)).toContain(PARAMS_VALUE_ADVICE);
    expect(String(refused.message)).not.toContain('width');
  }, 60_000);

  test('params cross the evaluator request as validated data', () => {
    const { json } = createEvaluatorRequestV2({
      requestId: 'r-params-1',
      code: PARAMETRIC,
      options: { params: { preset: 'wide', values: { lid: false } } },
    });
    expect(decodeEvaluatorRequestV2(json).options.params).toEqual({
      preset: 'wide',
      values: { lid: false },
    });
    for (const params of [
      { values: { a: null } },
      { values: { a: [1] } },
      { values: {}, extra: 1 },
      { preset: 7 },
      {
        values: Object.fromEntries(
          Array.from({ length: PARAMS_MAX_COUNT + 1 }, (_, i) => [`p${i}`, 1]),
        ),
      },
    ])
      expect(() =>
        createEvaluatorRequestV2({
          requestId: 'r-params-2',
          code: PARAMETRIC,
          options: { params: params as never },
        }),
      ).toThrow('invalid evaluator request');
    expect(() => validateParamsInput({ values: { a: Number.NaN } })).toThrow();
  });

  test('a returned report must agree with its own declaration', async () => {
    const { params } = await renderGLBInProcess(PARAMETRIC);
    expect(validateParamsReport(structuredClone(params))).toEqual(params!);
    const forged = structuredClone(params!);
    forged.values.width = 99;
    expect(() => validateParamsReport(forged)).toThrow();
  });

  test('different values are different cache entries; equal values are reused', async () => {
    let calls = 0;
    const port = createCachedEvaluatorPort(
      {
        render: async (code, options) => {
          calls++;
          return renderGLBInProcess(code, options);
        },
      },
      { cache: new MemoryBuildCache(), identity: () => 'params-review' },
    );
    const base = await port.render(PARAMETRIC);
    const wide = await port.render(PARAMETRIC, { params: { values: { width: 2 } } });
    const again = await port.render(PARAMETRIC, { params: { values: { width: 2 } } });
    expect(calls).toBe(2);
    expect(wide.artifactGlbSha256).not.toBe(base.artifactGlbSha256);
    expect(again.artifactGlbSha256).toBe(wide.artifactGlbSha256);
    expect(again.buildCache?.hit).toBe(true);
  });
});
