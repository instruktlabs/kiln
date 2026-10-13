import { expect, test } from 'bun:test';
import { evaluateEvaluatorRequestV2 } from './handler';
import { createEvaluatorRequestV2, decodeEvaluatorResultV2 } from './protocol';
import { authoringDiagnosticAdvice } from './authoring-diagnostic';

test('V3 contract rejection crosses the closed evaluator boundary with no source data', async () => {
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({
      requestId: 'v3-diagnostic',
      code: `function build(){proceduralTexture({schemaVersion:3,width:4,height:4,operations:[],palette:{colors:[0],dither:'PRIVATE_MARKER'}});return createRoot('Root');}`,
    }).json,
  );
  const decoded = decodeEvaluatorResultV2(wire, 16 * 1024 * 1024, 'v3-diagnostic');
  expect(decoded).toMatchObject({
    ok: false,
    error: { code: 'EXECUTION_REJECTED', diagnostic: 'PROCEDURAL_TEXTURE_V3_CONTRACT' },
  });
  expect(wire).not.toContain('PRIVATE_MARKER');
  expect(wire).not.toContain('palette.dither');
  expect(authoringDiagnosticAdvice('PROCEDURAL_TEXTURE_V3_CONTRACT')).toContain('kiln_discover');
});
