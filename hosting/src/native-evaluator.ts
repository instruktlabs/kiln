import {
  createEvaluatorPortV2,
  EvaluatorPortError,
  type EvaluatorPortV2,
} from '@instruktlabs/kiln/evaluator';
import { NativeHttpClient, StorageFailure } from './native-http';

export interface NativeEvaluatorOptions {
  fetch?: (request: Request) => Promise<Response>;
}

/** Validate first; clamping must not turn NaN, zero or negative controls into authority. */
function capped(value: number | undefined, max: number): number {
  if (value === undefined) return max;
  if (!Number.isSafeInteger(value) || value < 1) throw new EvaluatorPortError('INPUT_INVALID');
  return Math.min(value, max);
}

/**
 * The host's protocol client, never an in-process evaluator. The controller binds
 * a fresh isolated job to this fixed virtual hostname outside the native host.
 * A deadline/cancellation result alone does not establish VM cleanup or release
 * global admission; the controller must retain its lease until destruction.
 */
export function createNativeEvaluatorPort(options: NativeEvaluatorOptions = {}): EvaluatorPortV2 {
  const port = createEvaluatorPortV2(async (json, controls) => {
    const body = new TextEncoder().encode(json);
    if (body.byteLength > 4 * 1024 * 1024) throw new EvaluatorPortError('INPUT_INVALID');
    const client = new NativeHttpClient(
      { fetch: options.fetch, timeoutMs: controls.deadlineMs, signal: () => controls.signal },
      'Evaluator',
      'evaluator',
    );
    try {
      const result = await client.bytes('/evaluate', {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
          'x-kiln-deadline-ms': String(controls.deadlineMs),
          'x-kiln-max-response-bytes': String(controls.maxResponseBytes),
        },
        limit: controls.maxResponseBytes,
      });
      return new TextDecoder('utf-8', { fatal: true }).decode(result);
    } catch (error) {
      if (error instanceof StorageFailure && error.status === 504)
        throw new EvaluatorPortError('DEADLINE_EXCEEDED');
      if (error instanceof StorageFailure && error.status === 499)
        throw new EvaluatorPortError('CANCELLED');
      // The SDK maps other transport failures to a fixed WORKER_FAILED message.
      throw error;
    }
  });
  return {
    async render(code, renderOptions, controls = {}) {
      return port.render(code, renderOptions, {
        signal: controls.signal,
        deadlineMs: capped(controls.deadlineMs, 60_000),
        maxGlbBytes: capped(controls.maxGlbBytes, 4 * 1024 * 1024),
        maxResponseBytes: capped(controls.maxResponseBytes, 8 * 1024 * 1024),
      });
    },
  };
}
