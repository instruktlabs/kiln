import { ContainerJobFailure, type ContainerEvaluationJob } from './container-job';
import { HttpFailure, privateResponse, readBounded, serviceFailure } from './http';

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
export async function handleEvaluationRequest(
  request: Request,
  job: Pick<ContainerEvaluationJob, 'run'>,
): Promise<Response> {
  try {
    if (request.url !== 'http://kiln-evaluator.internal/evaluate' || request.method !== 'POST')
      throw new HttpFailure(400, 'Invalid evaluation request');
    for (const [name, value] of request.headers)
      if (!allowedHeaders.has(name) || value.length > 512)
        throw new HttpFailure(400, 'Invalid evaluation header');
    if (request.headers.get('content-type') !== 'application/json')
      throw new HttpFailure(415, 'Evaluation requires application/json');
    const deadlineMs = limit(request.headers.get('x-kiln-deadline-ms'), 60_000);
    const maxResponseBytes = limit(
      request.headers.get('x-kiln-max-response-bytes'),
      8 * 1024 * 1024,
    );
    const declared = limit(request.headers.get('content-length'), 4 * 1024 * 1024);
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
      body = await readBounded(request.body, 4 * 1024 * 1024, reading.signal);
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
    return privateResponse(
      new Response(output, {
        headers: {
          'content-type': 'application/json',
          'content-length': String(output.byteLength),
        },
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
