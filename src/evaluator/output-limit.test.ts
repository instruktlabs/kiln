import { describe, expect, test } from 'bun:test';

import { createLocalToolContext } from '../local-runtime';
import { resolveRequirementsContext } from '../requirements-context';
import { createRequirementsQaReport } from '../qa/requirements-report';
import type { RenderResult } from '../render';
import {
  createEvaluatorPortV2,
  createEvaluatorRequestV2,
  decodeEvaluatorResultV2,
  evaluateEvaluatorRequestV2,
  EvaluatorPortError,
} from './index';
import { EvaluatorSubprocessError, renderGLBViaSubprocess } from './subprocess';

const GLB = Buffer.from('glTF output limit fixture, long enough to pass a 16 byte limit');
const HASH = `sha256:${new Bun.CryptoHasher('sha256').update(GLB).digest('hex')}` as const;
const RENDER = {
  glb: GLB,
  requirements: resolveRequirementsContext(),
  artifactGlbSha256: HASH,
  tris: 4096,
  meta: {
    qaReport: createRequirementsQaReport(resolveRequirementsContext(), { executedRules: [] }),
  },
  warnings: [],
} as unknown as RenderResult;

const BOX = `const meta = { name: 'box' };
function build() {
  const root = createRoot('Box');
  createPart('body', new THREE.BoxGeometry(1, 1, 1), gameMaterial(0x808080), { parent: root });
  return root;
}`;

function wireFailure(limit: unknown) {
  return JSON.stringify({
    version: 'kiln.evaluator.result.v2',
    requestId: 'limit-1',
    ok: false,
    error: {
      code: 'OUTPUT_LIMIT_EXCEEDED',
      message: 'Evaluator output limit exceeded.',
      limit,
    },
  });
}

describe('evaluator output limit diagnostics (#317)', () => {
  test('the GLB stage names the limit, the exact size and the triangles', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'limit-1', code: 'x', maxGlbBytes: 16 });
    const decoded = decodeEvaluatorResultV2(
      await evaluateEvaluatorRequestV2(built.json, { render: async () => RENDER }),
      16,
      'limit-1',
    );
    expect(decoded).toMatchObject({
      ok: false,
      error: {
        code: 'OUTPUT_LIMIT_EXCEEDED',
        limit: { stage: 'glb', limitBytes: 16, observedBytes: GLB.byteLength, triangles: 4096 },
      },
    });
  });

  test('the port message says what was reached and how to recover', async () => {
    const port = createEvaluatorPortV2(
      (json) => evaluateEvaluatorRequestV2(json, { render: async () => RENDER }),
      { maxGlbBytes: 16 },
    );
    const error = await port.render('x').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EvaluatorPortError);
    const message = (error as Error).message;
    expect(message).toContain('Evaluator output limit exceeded.');
    expect(message).toContain(`${GLB.byteLength} bytes`);
    expect(message).toContain('at most 16 bytes');
    expect(message).toContain('4096 triangles');
    expect(message).toContain('KILN_EVALUATOR_MAX_GLB_BYTES');
    expect(message).toContain('kiln_discover');
  });

  test('a response over budget is reported as the response stage, not as bad input', async () => {
    const built = createEvaluatorRequestV2({ requestId: 'limit-1', code: 'x' });
    const decoded = decodeEvaluatorResultV2(
      await evaluateEvaluatorRequestV2(
        built.json,
        { render: async () => RENDER },
        { maxResponseBytes: 512 },
      ),
      16 * 1024 * 1024,
      'limit-1',
    );
    expect(decoded).toMatchObject({
      ok: false,
      error: { code: 'OUTPUT_LIMIT_EXCEEDED', limit: { stage: 'response', limitBytes: 512 } },
    });
  });

  test('a host port that sees an oversize response reports the response stage', async () => {
    const port = createEvaluatorPortV2(async () => 'x'.repeat(2049), { maxResponseBytes: 2048 });
    const error = await port.render('x').catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'OUTPUT_LIMIT_EXCEEDED' });
    expect((error as Error).message).toContain('2049 bytes');
    expect((error as Error).message).toContain('at most 2048 bytes');
  });

  test('the subprocess names the GLB stage of a real build', async () => {
    const error = await renderGLBViaSubprocess(BOX, {}, { maxGlbBytes: 32 }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(EvaluatorSubprocessError);
    expect(error).toMatchObject({
      code: 'OUTPUT_LIMIT_EXCEEDED',
      limit: { stage: 'glb', limitBytes: 32 },
    });
    expect((error as Error).message).toContain('at most 32 bytes');
  }, 60_000);

  test('the subprocess marks a cut stream as a lower bound', async () => {
    const error = await renderGLBViaSubprocess(BOX, {}, { maxResponseBytes: 256 }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      code: 'OUTPUT_LIMIT_EXCEEDED',
      limit: { stage: 'response', limitBytes: 256, atLeast: true },
    });
    expect((error as Error).message).toContain('at least');
  }, 60_000);

  test.each([
    ['an unknown stage', { stage: 'disk', limitBytes: 1, observedBytes: 2 }],
    ['an observed size within the limit', { stage: 'glb', limitBytes: 2, observedBytes: 2 }],
    ['an unknown key', { stage: 'glb', limitBytes: 1, observedBytes: 2, path: '/tmp/x' }],
    ['a fractional size', { stage: 'glb', limitBytes: 1, observedBytes: 2.5 }],
  ])('the protocol refuses %s', (_name, limit) => {
    expect(() => decodeEvaluatorResultV2(wireFailure(limit), 16, 'limit-1')).toThrow();
  });

  test('details on another outcome are refused', () => {
    const wire = JSON.parse(wireFailure({ stage: 'glb', limitBytes: 1, observedBytes: 2 }));
    wire.error.code = 'WORKER_FAILED';
    wire.error.message = 'Evaluator worker failed.';
    expect(() => decodeEvaluatorResultV2(JSON.stringify(wire), 16, 'limit-1')).toThrow();
  });
});

describe('KILN_EVALUATOR_MAX_GLB_BYTES (#317)', () => {
  const MIB = 1024 * 1024;

  test('the default budget is unchanged', () => {
    expect(createLocalToolContext({}, {}).localExecution).toMatchObject({
      maxGlbBytes: 16 * MIB,
      maxResponseBytes: 32 * MIB,
    });
  });

  test('raising the GLB limit raises the response budget enough to carry it', () => {
    const local = createLocalToolContext({}, { KILN_EVALUATOR_MAX_GLB_BYTES: String(64 * MIB) });
    expect(local.localExecution).toMatchObject({
      maxGlbBytes: 64 * MIB,
      maxResponseBytes: 96 * MIB,
    });
  });

  test('tightening the GLB limit keeps the default response budget', () => {
    const local = createLocalToolContext({}, { KILN_EVALUATOR_MAX_GLB_BYTES: String(MIB) });
    expect(local.localExecution).toMatchObject({ maxGlbBytes: MIB, maxResponseBytes: 32 * MIB });
  });

  test.each(['0', '-1', String(64 * 1024 * 1024 + 1), '1.5', 'lots'])(
    'refuses %s rather than ignoring it',
    (value) => {
      expect(() => createLocalToolContext({}, { KILN_EVALUATOR_MAX_GLB_BYTES: value })).toThrow(
        'KILN_EVALUATOR_MAX_GLB_BYTES',
      );
    },
  );

  // A raised limit has to reach the worker: its own response bound used to default to 32 MiB.
  // Measured at ~12 s for this 640-segment surface (22.9 MB GLB, 30.6 MB base64).
  test('a GLB between the old and raised limits exports through the worker', async () => {
    const code = `const meta = { name: 'surface' };
function build() {
  const root = createRoot('Surface');
  const geometry = new THREE.PlaneGeometry(10, 10, 640, 640);
  createPart('surface', geometry, gameMaterial(0x617c3e), { parent: root });
  return root;
}`;
    await expect(
      createLocalToolContext({}, { KILN_BUILD_CACHE: 'off' }).evaluatorPort!.render(code),
    ).rejects.toMatchObject({ code: 'OUTPUT_LIMIT_EXCEEDED', limit: { stage: 'glb' } });
    const rendered = await createLocalToolContext(
      {},
      { KILN_BUILD_CACHE: 'off', KILN_EVALUATOR_MAX_GLB_BYTES: String(32 * 1024 * 1024) },
    ).evaluatorPort!.render(code);
    expect(rendered.glb.byteLength).toBeGreaterThan(16 * 1024 * 1024);
  }, 120_000);
});
