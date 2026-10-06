export class HttpFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function serviceFailure(error: unknown): Response {
  // Only intentionally public errors may supply a response message.
  if (error instanceof HttpFailure) return new Response(error.message, { status: error.status });
  return new Response('Service temporarily unavailable', { status: 503 });
}

// Bound bytes while reading, including chunked bodies without Content-Length.
export async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (signal?.aborted) {
    void body?.cancel().catch(() => {});
    throw new HttpFailure(499, 'Request cancelled');
  }
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const deadlineAt = Date.now() + 10_000;
  let bytes = new Uint8Array(Math.min(limit, 64 * 1024));
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new HttpFailure(499, 'Request cancelled'));
      void reader.cancel().catch(() => {});
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new HttpFailure(408, 'Request timed out'));
      void reader.cancel().catch(() => {});
    }, 10_000);
  });
  void timeout.catch(() => {});
  const check = () => {
    if (signal?.aborted) throw new HttpFailure(499, 'Request cancelled');
    if (Date.now() >= deadlineAt) throw new HttpFailure(408, 'Request timed out');
  };
  try {
    for (;;) {
      check();
      const { done, value } = await Promise.race([reader.read(), timeout]);
      check();
      if (done) break;
      const nextLength = length + value.byteLength;
      if (nextLength > limit) {
        throw new HttpFailure(413, 'Request too large');
      }
      if (nextLength > bytes.byteLength) {
        const grown = new Uint8Array(Math.min(limit, Math.max(nextLength, bytes.byteLength * 2)));
        grown.set(bytes.subarray(0, length));
        bytes = grown;
      }
      // Copy before the next read; neither tiny chunks nor reused buffers retain
      // an unbounded collection of views or change previously received bytes.
      bytes.set(value, length);
      length = nextLength;
    }
    return bytes.byteLength === length ? bytes : bytes.slice(0, length);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (timer !== undefined) clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function boundedRequest(request: Request, limit: number): Promise<Request> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    void request.body?.cancel().catch(() => {});
    throw new HttpFailure(413, 'Request too large');
  }
  if (!request.body) return request;
  const body = await readBounded(request.body, limit, request.signal);
  return new Request(request, { body });
}

export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
