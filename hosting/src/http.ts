export class HttpFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Bound bytes while reading, including chunked bodies without Content-Length.
export async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new HttpFailure(408, 'Request timed out'));
      void reader.cancel().catch(() => {});
    }, 10_000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        throw new HttpFailure(413, 'Request too large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
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
  const body = await readBounded(request.body, limit);
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
