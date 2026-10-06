import {
  assertProgramRef,
  MAX_PROGRAM_BYTES,
  programNotFound,
  programReference,
  type ProgramStore,
  type ProgramStoreStats,
} from '../../src/program-store';
import { HOSTED_PROGRAM_RETENTION } from './program-contract';

interface NativeStorageOptions {
  /** Fixed-origin transport. The production interceptor selects the tenant outside the container. */
  fetch?: (request: Request) => Promise<Response>;
  /** Read from the host's per-request context, never from a mutable shared current request. */
  signal?: () => AbortSignal | undefined;
  timeoutMs?: number;
}

class StorageFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const malformed = () => new StorageFailure(502, 'Invalid source storage response');
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Native host adapter only. No tenant selector, cloud credential or arbitrary URL is accepted. */
export class NativeProgramStore implements ProgramStore {
  readonly retention = HOSTED_PROGRAM_RETENTION;
  private readonly timeoutMs: number;
  private readonly send: (request: Request) => Promise<Response>;

  constructor(private readonly options: NativeStorageOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000)
      throw new Error('Invalid source storage timeout');
    this.send = options.fetch ?? ((request) => fetch(request));
  }

  private canonical(ref: string): string {
    assertProgramRef(ref);
    if (ref.startsWith('sha256:')) return ref;
    if (ref.length === 66) return `sha256:${ref.slice(2)}`;
    throw this.notFound(ref);
  }

  private notFound(ref: string): Error {
    return programNotFound(ref, 'This account has no retained source for that reference.');
  }

  private async bytes(
    path: string,
    limit: number,
    body?: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array> {
    const parent = this.options.signal?.();
    if (parent?.aborted) throw new StorageFailure(499, 'Source storage request cancelled');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timedOut = false;
    let finished = false;
    let abortListener: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () => {
        reject(
          new StorageFailure(
            timedOut ? 504 : 499,
            timedOut ? 'Source storage request timed out' : 'Source storage request cancelled',
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
      const request = new Request(`http://kiln-storage.internal${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        body,
        headers:
          body === undefined
            ? undefined
            : {
                'content-type': 'application/javascript',
                'content-length': String(body.byteLength),
              },
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
      });
      const pending = this.send(request).then((response) => {
        // Even a non-cooperative injected transport cannot leave a late body open.
        if (finished || controller.signal.aborted) void response.body?.cancel().catch(() => {});
        return response;
      });
      const response = await Promise.race([pending, aborted]);
      if (response.status !== (body === undefined ? 200 : 201)) {
        void response.body?.cancel().catch(() => {});
        throw new StorageFailure(
          response.status,
          response.status === 507
            ? 'Source storage quota reached; delete unneeded saved work and retry'
            : 'Source storage unavailable; retry the request',
        );
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
        void response.body?.cancel().catch(() => {});
        throw malformed();
      }
      if (!response.body) {
        if (declared !== null && Number(declared) !== 0) throw malformed();
        return new Uint8Array();
      }
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          void reader.cancel().catch(() => {});
          throw new StorageFailure(502, 'Source storage response exceeds its size limit');
        }
        chunks.push(value);
      }
      if (declared !== null && Number(declared) !== length) throw malformed();
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    } catch (error) {
      if (error instanceof StorageFailure) throw error;
      if (controller.signal.aborted)
        throw new StorageFailure(
          timedOut ? 504 : 499,
          timedOut ? 'Source storage request timed out' : 'Source storage request cancelled',
        );
      // Never expose network diagnostics, response bodies, paths or abort reasons.
      throw new StorageFailure(503, 'Source storage unavailable; retry the request');
    } finally {
      finished = true;
      clearTimeout(timer);
      parent?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', abortListener);
      reader?.releaseLock();
    }
  }

  private async json(body?: Uint8Array<ArrayBuffer>): Promise<Record<string, unknown>> {
    const bytes = await this.bytes('/internal/programs', 2048, body);
    try {
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!record(value)) throw malformed();
      return value;
    } catch {
      throw malformed();
    }
  }

  async put(code: string): Promise<string> {
    const ref = await programReference(code);
    const response = await this.json(new TextEncoder().encode(code));
    if (
      response.programRef !== ref ||
      response.shortRef !== `p_${ref.slice(7)}` ||
      typeof response.artifactId !== 'string' ||
      !/^[a-f0-9]{32}$/.test(response.artifactId)
    )
      throw malformed();
    return ref;
  }

  async get(ref: string): Promise<string> {
    const canonical = this.canonical(ref);
    let bytes: Uint8Array;
    try {
      bytes = await this.bytes(`/internal/programs/${encodeURIComponent(ref)}`, MAX_PROGRAM_BYTES);
    } catch (error) {
      if (error instanceof StorageFailure && error.status === 404) throw this.notFound(ref);
      throw error;
    }
    try {
      const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if ((await programReference(source)) !== canonical) throw malformed();
      return source;
    } catch {
      throw new StorageFailure(502, 'Stored program integrity check failed');
    }
  }

  async shortRef(ref: string): Promise<string> {
    await this.get(ref);
    return `p_${this.canonical(ref).slice(7)}`;
  }

  async stats(): Promise<ProgramStoreStats> {
    const value = await this.json();
    if (
      !count(value.entries) ||
      !count(value.bytes) ||
      (value.maxBytes !== undefined && !count(value.maxBytes)) ||
      value.maxSourceBytes !== MAX_PROGRAM_BYTES ||
      value.eviction !== 'none'
    )
      throw malformed();
    return {
      entries: value.entries,
      bytes: value.bytes,
      ...(value.maxBytes === undefined ? {} : { maxBytes: value.maxBytes }),
      maxSourceBytes: MAX_PROGRAM_BYTES,
      eviction: 'none',
    };
  }
}
