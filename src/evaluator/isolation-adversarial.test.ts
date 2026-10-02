import { afterEach, describe, expect, test } from 'bun:test';
import { renderGLB } from '../render';
import { EXECUTION_REJECTED_ADVICE } from './authoring-diagnostic';
import { renderGLBViaSubprocess } from './subprocess';

const previousMode = process.env['KILN_EVALUATOR_MODE'];
afterEach(() => {
  if (previousMode === undefined) delete process.env['KILN_EVALUATOR_MODE'];
  else process.env['KILN_EVALUATOR_MODE'] = previousMode;
});

const BASE = `
const meta = { name: 'AdversarialProbe' };
function build() { return createRoot('AdversarialProbe'); }
`;

describe('isolated evaluator adversarial settlement', () => {
  test('generated filesystem, environment, network, and process acquisition settle as sanitized rejections', async () => {
    const probes = [
      `const marker = process.env.SECRET; ${BASE}`,
      `const marker = fetch('http://169.254.169.254/latest/meta-data/'); ${BASE}`,
      `const marker = globalThis.process.mainModule.require('node:fs').readFileSync('/etc/passwd'); ${BASE}`,
      `const marker = globalThis.process.mainModule.require('node:child_process').spawn('/bin/sh'); ${BASE}`,
      `const marker = loadTexture('../../agent-runtime/src/server.ts'); ${BASE}`,
    ];
    for (const [index, source] of probes.entries()) {
      const secretMarker = `DO_NOT_LEAK_PROBE_${index}`;
      try {
        await renderGLBViaSubprocess(`${source}\n// ${secretMarker}`, {}, { deadlineMs: 10_000 });
        throw new Error('expected adversarial rejection');
      } catch (error) {
        expect(error).toMatchObject({ code: 'EXECUTION_REJECTED' });
        // The exact match is the first sentence; what follows is the engine's own fixed
        // advice and nothing else (decision 24 of 2 October 2026, H30).
        expect(String(error)).toStartWith(
          'EvaluatorSubprocessError: Generated asset execution was rejected.',
        );
        expect(String(error)).toBe(
          `EvaluatorSubprocessError: Generated asset execution was rejected. ${EXECUTION_REJECTED_ADVICE}`,
        );
        expect(String(error)).not.toContain(secretMarker);
        expect(String(error)).not.toContain('/etc/passwd');
      }
    }
  }, 30_000);

  test('an unavailable isolated boundary is terminal and never runs the valid source in-process', async () => {
    process.env['KILN_EVALUATOR_MODE'] = 'isolated';
    await expect(renderGLB(BASE)).rejects.toMatchObject({ code: 'ISOLATION_UNAVAILABLE' });
  });

  test('resource exhaustion settles at the deadline with no source or prompt echo', async () => {
    const marker = 'EXHAUSTION_SOURCE_DO_NOT_ECHO';
    const source = `async function build(){ ${marker}: await new Promise(() => {}); }`;
    try {
      await renderGLBViaSubprocess(source, {}, { deadlineMs: 100 });
      throw new Error('expected deadline');
    } catch (error) {
      expect(error).toMatchObject({ code: 'DEADLINE_EXCEEDED' });
      expect(String(error)).not.toContain(marker);
      expect(String(error)).not.toContain(source);
    }
  }, 10_000);
});
