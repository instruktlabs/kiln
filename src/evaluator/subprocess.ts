import { authoringDiagnosticAdvice, type AuthoringDiagnostic } from './authoring-diagnostic';
import { spawn, type SpawnOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { RenderGlbOptions, RenderResult } from '../render';
import { AssetQaBlockedError } from '../qa/run';
import { assertNoLegacyRuntimePolicy, resolveRequirementsContext } from '../requirements-context';
import { validateMaterialLibraryPayload } from '../material-library-node';
import {
  decodeEvaluatorResultV2,
  assertEvaluatorResultRequirements,
  assertEvaluatorResultMaterialResources,
  evaluatorOutcomeMessage,
  EVALUATOR_REQUEST_VERSION,
  type EvaluatorOutcomeCode,
  type EvaluatorRequestV2,
  MAX_EVALUATOR_REQUEST_BYTES,
} from './protocol';

const DEFAULT_DEADLINE_MS = 60_000;
const DEFAULT_MAX_GLB_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;

export interface EvaluatorSubprocessControls {
  deadlineMs?: number;
  maxGlbBytes?: number;
  maxResponseBytes?: number;
  /** Host cancellation, never serialized into the generated program. */
  signal?: AbortSignal;
  /** Node V8 old-space heap cap, not a total process/native-memory limit. */
  maxHeapMb?: number;
}

export interface EvaluatorProcessLaunch {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  detached?: boolean;
}

export class EvaluatorSubprocessError extends Error {
  readonly code: EvaluatorOutcomeCode;

  constructor(
    code: EvaluatorOutcomeCode,
    message: string,
    readonly diagnostic?: AuthoringDiagnostic,
  ) {
    super(diagnostic ? `${message} ${authoringDiagnosticAdvice(diagnostic)}` : message);
    this.name = 'EvaluatorSubprocessError';
    this.code = code;
  }
}

export function sanitizedEvaluatorEnv(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', NO_COLOR: '1' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TZ']) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  return env;
}

function boundedInteger(value: number | undefined, fallback: number, max: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > max) {
    throw new EvaluatorSubprocessError('INPUT_INVALID', 'Evaluator controls are invalid.');
  }
  return resolved;
}

function terminateProcess(child: ReturnType<typeof spawn>, detached: boolean): void {
  if (!child.pid || child.killed) return;
  try {
    if (detached && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export async function renderGLBViaProcessLaunch(
  code: string,
  options: RenderGlbOptions = {},
  controls: EvaluatorSubprocessControls = {},
  launch?: EvaluatorProcessLaunch,
): Promise<RenderResult> {
  if (controls.signal?.aborted) {
    throw new EvaluatorSubprocessError('CANCELLED', 'Evaluator request was cancelled.');
  }
  assertNoLegacyRuntimePolicy(options);
  const requirements = resolveRequirementsContext(options.requirements);
  if (options.textureResolver) {
    throw new EvaluatorSubprocessError(
      'INPUT_INVALID',
      'Subprocess evaluation does not accept host resolver capabilities.',
    );
  }
  const deadlineMs = boundedInteger(controls.deadlineMs, DEFAULT_DEADLINE_MS, 120_000);
  const maxGlbBytes = boundedInteger(controls.maxGlbBytes, DEFAULT_MAX_GLB_BYTES, 64 * 1024 * 1024);
  const maxResponseBytes = boundedInteger(
    controls.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    96 * 1024 * 1024,
  );
  if (options.materialResources !== undefined)
    validateMaterialLibraryPayload(options.materialResources);
  const request: EvaluatorRequestV2 = {
    version: EVALUATOR_REQUEST_VERSION,
    requestId: 'render-1',
    operation: 'execute-export-glb',
    code,
    options,
    limits: { maxGlbBytes },
  };
  const requestJson = JSON.stringify(request);
  if (Buffer.byteLength(requestJson, 'utf8') > MAX_EVALUATOR_REQUEST_BYTES) {
    throw new EvaluatorSubprocessError(
      'INPUT_INVALID',
      'Evaluator request exceeds its size limit.',
    );
  }

  const sourceModule = import.meta.url.endsWith('.ts');
  const workerPath = fileURLToPath(
    new URL(
      process.versions.bun && sourceModule
        ? './worker.ts'
        : sourceModule
          ? '../../dist/evaluator-worker.mjs'
          : './evaluator-worker.mjs',
      import.meta.url,
    ),
  );
  const maxHeapMb = boundedInteger(controls.maxHeapMb, 512, 4096);
  if (maxHeapMb < 64 || (process.versions.bun && controls.maxHeapMb !== undefined)) {
    throw new EvaluatorSubprocessError(
      'INPUT_INVALID',
      'Heap limits require a Node worker and 64–4096 MiB.',
    );
  }
  const defaultLaunch: EvaluatorProcessLaunch = {
    command: process.execPath,
    args: process.versions.bun ? [workerPath] : [`--max-old-space-size=${maxHeapMb}`, workerPath],
    env: sanitizedEvaluatorEnv(),
  };
  const resolvedLaunch = launch ?? defaultLaunch;
  const detached = resolvedLaunch.detached === true;

  return await new Promise<RenderResult>((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      env: resolvedLaunch.env,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe', 'pipe'],
      ...(detached ? { detached: true } : {}),
    };
    const child = spawn(resolvedLaunch.command, resolvedLaunch.args, spawnOptions);
    const protocol = child.stdio[3];
    if (!protocol) {
      terminateProcess(child, detached);
      reject(new EvaluatorSubprocessError('WORKER_FAILED', 'Evaluator worker did not start.'));
      return;
    }
    const chunks: Buffer[] = [];
    let responseBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (error?: Error, result?: RenderResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controls.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result as RenderResult);
    };
    const timer = setTimeout(() => {
      finish(new EvaluatorSubprocessError('DEADLINE_EXCEEDED', 'Evaluator deadline exceeded.'));
      terminateProcess(child, detached);
    }, deadlineMs);
    const abort = () => {
      // Windows/Bun may emit a child error synchronously while killing it.
      // Settle the host outcome first so that event cannot replace cancellation.
      finish(new EvaluatorSubprocessError('CANCELLED', 'Evaluator request was cancelled.'));
      terminateProcess(child, detached);
    };
    const pipeFailed = (error: NodeJS.ErrnoException) => {
      // Killing a worker while stdin is opening can emit EPIPE after cancellation.
      // Always consume pipe errors; only an active request becomes a worker error.
      if (settled) return;
      // Windows/Bun can report a closed input/stderr/protocol pipe before the
      // process close event drains its complete fd3 envelope. Keep the host
      // deadline and cancellation armed, then require exit 0 plus strict decode.
      if (
        ['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_PREMATURE_CLOSE'].includes(
          error.code ?? '',
        )
      )
        return;
      finish(new EvaluatorSubprocessError('WORKER_FAILED', 'Evaluator worker pipe failed.'));
      terminateProcess(child, detached);
    };
    child.stdin?.on('error', pipeFailed);
    protocol.on('error', (error: NodeJS.ErrnoException) => {
      // Bun on Windows can report EBADF on fd3 after delivering its complete
      // reply, before a normal process close. Only that proved case is deferred;
      // close still requires exit 0 and a strictly decoded, complete envelope.
      if (process.platform === 'win32' && process.versions.bun && error.code === 'EBADF') return;
      pipeFailed(error);
    });
    child.stderr?.on('error', pipeFailed);
    controls.signal?.addEventListener('abort', abort, { once: true });
    if (controls.signal?.aborted) abort();

    protocol.on('data', (chunk: Buffer) => {
      responseBytes += chunk.byteLength;
      if (responseBytes > maxResponseBytes) {
        finish(
          new EvaluatorSubprocessError('OUTPUT_LIMIT_EXCEEDED', 'Evaluator output limit exceeded.'),
        );
        terminateProcess(child, detached);
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes = Math.min(MAX_STDERR_BYTES, stderrBytes + chunk.byteLength);
    });
    child.on('error', () => {
      finish(new EvaluatorSubprocessError('WORKER_FAILED', 'Evaluator worker failed to start.'));
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      if (exitCode !== 0 || chunks.length === 0) {
        finish(new EvaluatorSubprocessError('WORKER_FAILED', 'Evaluator worker failed.'));
        return;
      }
      try {
        const result = decodeEvaluatorResultV2(
          Buffer.concat(chunks).toString('utf8'),
          maxGlbBytes,
          request.requestId,
        );
        assertEvaluatorResultRequirements(result, requirements);
        assertEvaluatorResultMaterialResources(result, request.options.materialResources);
        if (!result.ok) {
          if (result.error.code === 'QA_BLOCKED' && result.error.qa) {
            finish(
              new AssetQaBlockedError(
                result.error.qa.report,
                result.error.qa.stage,
                result.error.qa.gltfValidation,
              ),
            );
            return;
          }
          finish(
            new EvaluatorSubprocessError(
              result.error.code,
              evaluatorOutcomeMessage(result.error.code),
              result.error.diagnostic,
            ),
          );
          return;
        }
        finish(undefined, result.render);
      } catch {
        finish(new EvaluatorSubprocessError('PROTOCOL_ERROR', 'Evaluator returned invalid data.'));
      }
    });
    if (!settled) child.stdin?.end(requestJson);
  });
}

export async function renderGLBViaSubprocess(
  code: string,
  options: RenderGlbOptions = {},
  controls: EvaluatorSubprocessControls = {},
): Promise<RenderResult> {
  return renderGLBViaProcessLaunch(code, options, controls);
}
