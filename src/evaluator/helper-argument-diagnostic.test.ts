import { expect, test } from 'bun:test';
import { evaluateEvaluatorRequestV2 } from './handler';
import { createEvaluatorRequestV2, decodeEvaluatorResultV2 } from './protocol';
import { renderGLBViaSubprocess } from './subprocess';

// #415: four helper preconditions that agents hit repeatedly threw a plain Error, so the
// worker reported only the generic sentence. Each is now a closed cause; the thrown text,
// the helper's file and every argument value stay inside the sandbox.
const cases = [
  {
    diagnostic: 'UV_PROJECTION_OPTIONS',
    advice: 'projectUV',
    source: `function build(){const g=boxGeo(1,1,1);projectUV(g,{});return createRoot('PRIVATE_SOURCE_MARKER');}`,
  },
  {
    diagnostic: 'TAPERED_TUBE_ARGUMENT',
    advice: 'one radius per path point',
    source: `function build(){const g=taperedTube([[0,0,0],[0,1,0]],[0.1,0.2,0.3,0.987654]);return createRoot('PRIVATE_SOURCE_MARKER');}`,
  },
  // A dogfood author passed one [side, depth] pair for the whole tube. Reading its first
  // number as a pair threw a TypeError before the length check could name the cause.
  {
    name: 'TAPERED_TUBE_ARGUMENT for one sectionScale pair on a longer path',
    diagnostic: 'TAPERED_TUBE_ARGUMENT',
    advice: 'one [side, depth] pair per path point',
    source: `function build(){const g=taperedTube([[0,0,0],[0,1,0],[0,2,0]],[0.1,0.1,0.1],{sectionScale:[1,0.987654]});return createRoot('PRIVATE_SOURCE_MARKER');}`,
  },
  {
    name: 'TAPERED_TUBE_ARGUMENT for one sectionScale pair on a two-point path',
    diagnostic: 'TAPERED_TUBE_ARGUMENT',
    advice: 'one [side, depth] pair per path point',
    source: `function build(){const g=taperedTube([[0,0,0],[0,1,0]],[0.1,0.1],{sectionScale:[1,0.987654]});return createRoot('PRIVATE_SOURCE_MARKER');}`,
  },
  {
    diagnostic: 'SWEEP_PROFILE_ARGUMENT',
    advice: 'one [scaleX, scaleY] pair per path station',
    source: `function build(){const g=sweepProfile(circleProfile(0.1,8),[[0,0,0],[0,1,0],[0,2,0]],{scale:[[1,1],[0.987654,1]]});return createRoot('PRIVATE_SOURCE_MARKER');}`,
  },
  {
    diagnostic: 'CSG_OPERAND_MESH',
    advice: 'triangle mesh',
    source: `async function build(){const cloud=new THREE.BufferGeometry();cloud.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,1],3));const operand=createPart('PRIVATE_OPERAND',cloud,gameMaterial(0x888888));await hull('PrivateHull',operand);return createRoot('PRIVATE_SOURCE_MARKER');}`,
  },
] as const;

for (const testCase of cases) {
  const { diagnostic, advice, source } = testCase;
  const title = 'name' in testCase ? testCase.name : diagnostic;
  test(`${title} crosses the worker as a closed cause without program text`, async () => {
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: diagnostic, code: source }).json,
    );
    expect(JSON.parse(wire).error).toEqual({
      code: 'EXECUTION_REJECTED',
      message: 'Generated asset execution was rejected.',
      diagnostic,
    });
    expect(decodeEvaluatorResultV2(wire, 100000, diagnostic).ok).toBe(false);
    const error = (await renderGLBViaSubprocess(source).catch((e: unknown) => e)) as Error;
    expect(error).toMatchObject({ code: 'EXECUTION_REJECTED', diagnostic });
    expect(error.message).toContain(advice);
    expect(error.message).not.toContain('cannot see execution-time');
    for (const output of [wire, error.message]) {
      for (const privateValue of [
        'PRIVATE_SOURCE_MARKER',
        'PRIVATE_OPERAND',
        'PrivateHull',
        '0.987654',
        'uv-project.ts',
        'organic.ts',
        'solids.ts',
      ])
        expect(output).not.toContain(privateValue);
    }
  }, 20000);
}
