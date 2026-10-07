export interface NativeStorageOptions {
  fetch?: (request: Request) => Promise<Response>;
  /** Supply the native host's per-request signal. */
  signal?: () => AbortSignal | undefined;
  timeoutMs?: number;
}
export interface NativeStorageRequest {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: Uint8Array<ArrayBuffer>;
  headers?: Record<string, string>;
  limit: number;
  statuses?: readonly number[];
  /** Synchronous validation of metadata from the fixed private service. */
  onResponseHeaders?: (headers: Headers) => void;
}
export class StorageFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Fixed-origin native transport; ownership is bound by an interceptor outside the image. */
export class NativeHttpClient {
  private readonly timeoutMs: number;
  private readonly send: (request: Request) => Promise<Response>;
  private readonly origin: string;
  constructor(
    private readonly options: NativeStorageOptions = {},
    private readonly label = 'Storage',
    private readonly service: 'storage' | 'evaluator' | 'renderer' = 'storage',
  ) {
    if (service !== 'storage' && service !== 'evaluator' && service !== 'renderer')
      throw new Error('Invalid private service');
    this.origin = `http://kiln-${service}.internal`;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000)
      throw new Error('Invalid storage timeout');
    this.send = options.fetch ?? ((request) => fetch(request));
  }
  async bytes(path: string, request: NativeStorageRequest): Promise<Uint8Array> {
    const { body, limit, headers, method = 'GET', statuses = [200], onResponseHeaders } = request;
    const url = new URL(path, this.origin);
    if (
      url.href !== `${this.origin}${path}` ||
      url.search ||
      url.hash ||
      !(this.service === 'evaluator'
        ? path === '/evaluate'
        : this.service === 'renderer'
          ? path === '/render'
          : path.startsWith('/internal/') || /^\/mcp\/artifacts\/[a-f0-9]{32}$/.test(path))
    )
      throw new Error('Invalid private service path');
    if (
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      limit > 64 * 1024 * 1024 ||
      (body?.byteLength ?? 0) > 64 * 1024 * 1024
    )
      throw new Error('Invalid storage size limit');
    const outgoing = new Headers(headers);
    const allowedHeaders =
      this.service !== 'storage'
        ? ['content-type', 'x-kiln-deadline-ms', 'x-kiln-max-response-bytes']
        : ['content-type', 'x-artifact-name', 'x-artifact-sha256'];
    for (const name of outgoing.keys())
      if (!allowedHeaders.includes(name)) throw new Error('Invalid private service header');
    if (body !== undefined) outgoing.set('content-length', String(body.byteLength));
    const parent = this.options.signal?.();
    if (parent?.aborted) throw new StorageFailure(499, `${this.label} request cancelled`);
    const controller = new AbortController();
    const deadlineAt = Date.now() + this.timeoutMs;
    const cancel = () => controller.abort();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let responseBody: ReadableStream<Uint8Array> | null | undefined;
    let timedOut = false;
    let finished = false;
    let abortListener: () => void = () => {};
    const expired = () => {
      if (Date.now() >= deadlineAt) {
        timedOut = true;
        controller.abort();
      }
      return controller.signal.aborted;
    };
    const check = () => {
      if (expired())
        throw new StorageFailure(
          timedOut ? 504 : 499,
          timedOut ? `${this.label} request timed out` : `${this.label} request cancelled`,
        );
    };
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () => {
        reject(
          new StorageFailure(
            timedOut ? 504 : 499,
            timedOut ? `${this.label} request timed out` : `${this.label} request cancelled`,
          ),
        );
        void reader?.cancel().catch(() => {});
      };
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    parent?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const request = new Request(url, {
        method,
        body,
        headers: outgoing,
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
      });
      const pending = this.send(request).then((response) => {
        responseBody = response.body;
        // Even a non-cooperative injected transport cannot leave a late body open.
        if (finished || expired()) void response.body?.cancel().catch(() => {});
        return response;
      });
      const response = await Promise.race([pending, aborted]);
      check();
      if (!statuses.includes(response.status)) {
        void response.body?.cancel().catch(() => {});
        throw new StorageFailure(
          response.status,
          response.status === 507
            ? `${this.label} quota reached; delete unneeded saved work and retry`
            : `${this.label} unavailable; retry the request`,
        );
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
        void response.body?.cancel().catch(() => {});
        throw new StorageFailure(502, `Invalid ${this.label.toLowerCase()} response`);
      }
      onResponseHeaders?.(new Headers(response.headers));
      if (!response.body) {
        if (declared !== null && Number(declared) !== 0)
          throw new StorageFailure(502, `Invalid ${this.label.toLowerCase()} response`);
        return new Uint8Array();
      }
      reader = response.body.getReader();
      let bytes = new Uint8Array(Math.min(limit, 64 * 1024));
      let length = 0;
      for (;;) {
        // Continuously available chunks can starve timers with microtasks.
        check();
        const { done, value } = await Promise.race([reader.read(), aborted]);
        check();
        if (done) break;
        const nextLength = length + value.byteLength;
        if (nextLength > limit) {
          void reader.cancel().catch(() => {});
          throw new StorageFailure(502, `${this.label} response exceeds its size limit`);
        }
        if (nextLength > bytes.byteLength) {
          const grown = new Uint8Array(Math.min(limit, Math.max(nextLength, bytes.byteLength * 2)));
          grown.set(bytes.subarray(0, length));
          bytes = grown;
        }
        bytes.set(value, length);
        length = nextLength;
      }
      if (declared !== null && Number(declared) !== length)
        throw new StorageFailure(502, `Invalid ${this.label.toLowerCase()} response`);
      return bytes.byteLength === length ? bytes : bytes.slice(0, length);
    } catch (error) {
      if (error instanceof StorageFailure) throw error;
      if (controller.signal.aborted)
        throw new StorageFailure(
          timedOut ? 504 : 499,
          timedOut ? `${this.label} request timed out` : `${this.label} request cancelled`,
        );
      // Never expose network diagnostics, response bodies, paths or abort reasons.
      throw new StorageFailure(503, `${this.label} unavailable; retry the request`);
    } finally {
      finished = true;
      clearTimeout(timer);
      parent?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', abortListener);
      // Cancellation can win after headers arrive but before a reader attaches.
      // Also close a partially read stream on any validation/read failure.
      void (reader ? reader.cancel() : responseBody?.cancel())?.catch(() => {});
      reader?.releaseLock();
    }
  }
}
