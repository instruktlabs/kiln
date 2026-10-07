import { ContainerJobFailure, type ContainerEvaluationJob } from './container-job';
import { HttpFailure, privateResponse, readBounded, serviceFailure } from './http';
import { EXECUTION_PROFILES, type ExecutionKind } from './execution-profiles';

const allowedHeaders = new Set([
  'content-type',
  'content-length',
  'x-kiln-deadline-ms',
  'x-kiln-max-response-bytes',
  // Fetch implementations add these transport fields. None selects identity or work.
  'accept',
  'accept-encoding',
  'accept-language',
  'connection',
  'host',
  'user-agent',
  'sec-fetch-mode',
]);
type ExecutionJob = Pick<ContainerEvaluationJob, 'run'> &
  Partial<Pick<ContainerEvaluationJob, 'executionImage'>>;

function limit(header: string | null, max: number): number {
  if (header === null || !/^[1-9]\d{0,8}$/.test(header) || Number(header) > max)
    throw new HttpFailure(400, 'Invalid evaluation limit');
  return Number(header);
}

/**
 * Private, single-job HTTP boundary. The outer controller supplies the fresh DO
 * and holds admission; this handler cannot choose a tenant, image or executable.
 * Never expose this route directly from a public Worker.
 */
async function handleExecutionRequest(
  request: Request,
  job: ExecutionJob,
  kind: ExecutionKind,
): Promise<Response> {
  const profile = EXECUTION_PROFILES[kind];
  try {
    if (request.url !== profile.url || request.method !== 'POST')
      throw new HttpFailure(400, 'Invalid evaluation request');
    for (const [name, value] of request.headers)
      if (!allowedHeaders.has(name) || value.length > 512)
        throw new HttpFailure(400, 'Invalid evaluation header');
    if (request.headers.get('content-type') !== 'application/json')
      throw new HttpFailure(415, 'Evaluation requires application/json');
    const deadlineMs = limit(request.headers.get('x-kiln-deadline-ms'), profile.deadlineMs);
    const maxResponseBytes = limit(
      request.headers.get('x-kiln-max-response-bytes'),
      profile.responseBytes,
    );
    const declared = limit(request.headers.get('content-length'), profile.requestBytes);
    const deadlineAt = Date.now() + deadlineMs;
    const reading = new AbortController();
    const cancelRead = () => reading.abort();
    let expired = false;
    request.signal.addEventListener('abort', cancelRead, { once: true });
    if (request.signal.aborted) cancelRead();
    const timer = setTimeout(() => {
      expired = true;
      reading.abort();
    }, deadlineMs);
    let body: Uint8Array<ArrayBuffer>;
    try {
      body = await readBounded(request.body, profile.requestBytes, reading.signal);
    } catch (error) {
      if (expired) throw new HttpFailure(504, 'Evaluation deadline exceeded');
      throw error;
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', cancelRead);
    }
    if (body.byteLength !== declared) throw new HttpFailure(400, 'Invalid evaluation length');
    const remaining = deadlineAt - Date.now();
    if (remaining < 1) throw new HttpFailure(504, 'Evaluation deadline exceeded');
    // No independent timeout race here: run owns the deadline, durable watchdog
    // and verified VM destruction. Aborting HTTP must not abandon that cleanup.
    const output = await job.run(body, {
      deadlineMs: remaining,
      maxResponseBytes,
      signal: request.signal,
    });
    if (
      !(output instanceof Uint8Array) ||
      output.byteLength === 0 ||
      output.byteLength > maxResponseBytes
    )
      throw new Error('Invalid evaluation output');
    const headers = new Headers({
      'content-type': 'application/json',
      'content-length': String(output.byteLength),
    });
    if (kind === 'evaluation') {
      const image = job.executionImage?.(output);
      const digest =
        typeof image === 'string' && image.length <= 512
          ? /^[a-zA-Z0-9._:/-]+@(sha256:[a-f0-9]{64})(?![\s\S])/.exec(image)?.[1]
          : undefined;
      if (!digest) throw new ContainerJobFailure('ISOLATION_UNAVAILABLE');
      // This header is outside the VM's stdout and is never copied from a request.
      headers.set('x-kiln-execution-image', digest);
    }
    return privateResponse(
      new Response(output, {
        headers,
      }),
    );
  } catch (error) {
    void request.body?.cancel().catch(() => {});
    if (error instanceof ContainerJobFailure) {
      const statuses = {
        INPUT_INVALID: 400,
        JOB_ALREADY_USED: 409,
        ISOLATION_UNAVAILABLE: 503,
        WORKER_FAILED: 503,
        OUTPUT_LIMIT_EXCEEDED: 502,
        DEADLINE_EXCEEDED: 504,
        CANCELLED: 499,
        CLEANUP_FAILED: 503,
      } as const;
      return privateResponse(
        new Response('Evaluation did not complete', { status: statuses[error.code] }),
      );
    }
    return privateResponse(serviceFailure(error));
  }
}

export const handleEvaluationRequest = (request: Request, job: ExecutionJob) =>
  handleExecutionRequest(request, job, 'evaluation');

export const handleRenderRequest = (request: Request, job: Pick<ContainerEvaluationJob, 'run'>) =>
  handleExecutionRequest(request, job, 'render');
