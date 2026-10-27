import { describe, expect, test } from 'bun:test';
import {
  createEvaluatorRequestV2,
  evaluatorOutcomeMessage,
  MAX_EVALUATOR_CODE_BYTES,
} from './protocol';
import { createEvaluatorPortV2 } from './protocol';
import { renderGLBViaSubprocess } from './subprocess';
import { MAX_PROGRAM_BYTES, programReference } from '../program-store';
import { createKilnProgramToolRegistry, type KilnToolContext } from '../tools/registry';

/**
 * A valid program padded with a literal buffer, sized into the gap between the program
 * store's limit and the evaluator transport's. This is the authoring shape #299 was filed
 * from: a large literal mesh buffer that saves and validates, then fails evaluation.
 */
function paddedProgram(bytes: number): string {
  const program = (pad: string) =>
    `const meta={name:'Padded'};\nconst DATA=[${pad}0];\nfunction build(){const r=createRoot('Padded');return r;}\n`;
  const cell = '0.12345,';
  const base = Buffer.byteLength(program(''), 'utf8');
  return program(cell.repeat(Math.ceil((bytes - base) / cell.length)));
}

const OVERSIZE = paddedProgram(600 * 1024);
const OVERSIZE_BYTES = Buffer.byteLength(OVERSIZE, 'utf8');
/** The generic request message, which advises a host/worker version migration. */
const VERSION_ADVICE = evaluatorOutcomeMessage('INPUT_INVALID');

const port = { render: async () => ({}) as never };

function registry(context: KilnToolContext) {
  const tools = createKilnProgramToolRegistry(context);
  return (name: string) => {
    const def = tools.find((tool) => tool.name === name);
    if (!def) throw new Error(`${name} is not registered`);
    return def;
  };
}

describe('source between the store and transport limits (#299)', () => {
  test('the gap exists: the store accepts a program the transport refuses', async () => {
    expect(OVERSIZE_BYTES).toBeGreaterThan(MAX_EVALUATOR_CODE_BYTES);
    expect(OVERSIZE_BYTES).toBeLessThanOrEqual(MAX_PROGRAM_BYTES);
    // Deliberate: a stored revision is read, imported and exported without evaluation.
    await expect(programReference(OVERSIZE)).resolves.toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('request construction names source size, not a version mismatch', () => {
    let message = '';
    try {
      createEvaluatorRequestV2({ requestId: 'pad-1', code: OVERSIZE });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(String(OVERSIZE_BYTES));
    expect(message).toContain(String(MAX_EVALUATOR_CODE_BYTES));
    expect(message).not.toContain('docs/migration.md');
    expect(message).not.toBe(VERSION_ADVICE);
  });

  test('the subprocess evaluator names source size before launching a worker', async () => {
    const failure = await renderGLBViaSubprocess(OVERSIZE).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    const error = failure as Error & { code?: string };
    expect(error.code).toBe('INPUT_INVALID');
    expect(error.message).toContain(String(OVERSIZE_BYTES));
    expect(error.message).toContain(String(MAX_EVALUATOR_CODE_BYTES));
    expect(error.message).not.toContain('docs/migration.md');
  });

  test('kiln_validate reports the finding at save time and keeps the source valid', async () => {
    const result = (await registry({ evaluatorPort: port })('kiln_validate').run({
      code: OVERSIZE,
    })) as { valid: boolean; errors: string[]; warnings: string[] };
    // Advisory: the program is syntactically valid, and a trusted in-process host runs it.
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    const found = result.warnings.filter((warning) => warning.includes(String(OVERSIZE_BYTES)));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(String(MAX_EVALUATOR_CODE_BYTES));
  });

  test('kiln_validate stays quiet where no request carries the source', async () => {
    for (const context of [
      {},
      { evaluatorPort: port, localExecution: { mode: 'in-process' } as never },
    ]) {
      const result = (await registry(context)('kiln_validate').run({ code: OVERSIZE })) as {
        valid: boolean;
        warnings: string[];
      };
      expect(result.valid).toBe(true);
      expect(result.warnings.join('\n')).not.toContain(String(OVERSIZE_BYTES));
    }
  });

  test('a local host reports it from a context built for a cheap syntax check', async () => {
    // `kiln validate` and `kiln edit` build no host context, so they declare the one host
    // fact a source finding needs rather than inheriting a forged evaluator port.
    const { localEvaluatorMode } = await import('../local-runtime');
    expect(localEvaluatorMode({})).toBe('subprocess');
    expect(localEvaluatorMode({ KILN_EVALUATOR_MODE: 'in-process' })).toBe('in-process');
    const result = (await registry({
      evaluatorTransportsSource: localEvaluatorMode({}) !== 'in-process',
    })('kiln_validate').run({ code: OVERSIZE })) as { valid: boolean; warnings: string[] };
    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toContain(String(MAX_EVALUATOR_CODE_BYTES));
  });

  test('the worker still reports a request it cannot decode as a malformed one', async () => {
    // Deliberate: both hosts rebuild the message from the outcome code and discard the
    // wire message, so a cause named inside the worker could not reach a reader. The
    // request builders above are the seam where naming it carries information.
    const { evaluateEvaluatorRequestV2 } = await import('./handler');
    const handRolled = JSON.stringify({
      version: 'kiln.evaluator.request.v2',
      requestId: 'pad-2',
      operation: 'execute-export-glb',
      code: OVERSIZE,
      options: {},
      limits: { maxGlbBytes: 1024 },
    });
    const result = JSON.parse(await evaluateEvaluatorRequestV2(handRolled)) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INPUT_INVALID');
    expect(result.error.message).toBe(VERSION_ADVICE);
  });

  test('kiln_render puts the named cause in the error a reader actually sees', async () => {
    const evaluatorPort = createEvaluatorPortV2(async () => {
      throw new Error('the transport must not be reached');
    });
    const result = (await registry({ evaluatorPort })('kiln_render').run({ code: OVERSIZE })) as {
      ok: boolean;
      error: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(OVERSIZE_BYTES));
    expect(result.error).toContain(String(MAX_EVALUATOR_CODE_BYTES));
    expect(result.error).not.toContain('docs/migration.md');
  });

  test('kiln_edit reports the finding when it patches without rendering', async () => {
    const result = (await registry({ evaluatorPort: port })('kiln_edit').run({
      code: OVERSIZE,
      edits: [{ oldString: "name:'Padded'", newString: "name:'Padded2'" }],
      render: false,
    })) as { ok: boolean; warnings?: string[] };
    expect(result.ok).toBe(true);
    expect(result.warnings?.join('\n')).toContain(String(MAX_EVALUATOR_CODE_BYTES));
  });
});
