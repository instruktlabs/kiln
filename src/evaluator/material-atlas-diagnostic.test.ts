import { expect, test } from 'bun:test';
import { authoringDiagnosticAdvice } from './authoring-diagnostic';
import {
  decodeEvaluatorResultV2,
  evaluatorOutcomeMessage,
  EVALUATOR_RESULT_VERSION,
} from './protocol';

for (const diagnostic of ['PORTABLE_MATERIAL_V3_CONTRACT', 'TEXTURE_ATLAS_CONTRACT'] as const) {
  test(`${diagnostic} accepts only closed repair advice in the evaluator envelope`, () => {
    const result = {
      version: EVALUATOR_RESULT_VERSION,
      requestId: 'material-atlas',
      ok: false,
      error: {
        code: 'EXECUTION_REJECTED',
        message: evaluatorOutcomeMessage('EXECUTION_REJECTED'),
        diagnostic,
      },
    };
    expect(decodeEvaluatorResultV2(JSON.stringify(result), 1024, 'material-atlas')).toMatchObject({
      ok: false,
      error: { diagnostic },
    });
    expect(authoringDiagnosticAdvice(diagnostic)).toContain('kiln_discover');
    expect(() =>
      decodeEvaluatorResultV2(
        JSON.stringify({ ...result, error: { ...result.error, message: 'PRIVATE_MARKER' } }),
        1024,
        'material-atlas',
      ),
    ).toThrow();
    expect(() =>
      decodeEvaluatorResultV2(
        JSON.stringify({ ...result, error: { ...result.error, details: 'PRIVATE_FIELD' } }),
        1024,
        'material-atlas',
      ),
    ).toThrow();
  });
}
