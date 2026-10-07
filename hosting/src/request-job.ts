import { ContainerJobFailure, destroyContainer } from './container-job';
import { HttpFailure, privateResponse, readBounded } from './http';
import { EXECUTION_PROFILES, type ExecutionKind } from './execution-profiles';

interface RequestRecord {
  state: 'running' | 'closing' | 'finished';
  tenant?: string;
  deadlineAt: number;
  children: { id: string; kind: ExecutionKind }[];
  activeChild?: string;
}

export interface NativeRequestPorts {
  publicOrigin: string;
  storageInterceptor: Fetcher;
  evaluationInterceptor: Fetcher;
  renderInterceptor: Fetcher;
  storage(tenant: string, request: Request): Promise<Response>;
  evaluate(id: string, request: Request): Promise<Response>;
  cancelEvaluation(id: string): Promise<void>;
  render(id: string, request: Request): Promise<Response>;
  cancelRender(id: string): Promise<void>;
}

const MCP_HEADERS = new Set([
  'accept',
  'content-type',
  'content-length',
  'mcp-protocol-version',
  'mcp-method',
  'mcp-name',
  'mcp-session-id',
  'last-event-id',
]);
const STORAGE_HEADERS = new Set([
  'content-type',
  'content-length',
  'x-artifact-name',
  'x-artifact-sha256',
]);
const EVALUATION_HEADERS = new Set([
  'content-type',
  'content-length',
  'x-kiln-deadline-ms',
  'x-kiln-max-response-bytes',
]);
const TRANSPORT_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'connection',
  'host',
  'user-agent',
  'sec-fetch-mode',
]);

function checkHeaders(request: Request, allowed: Set<string>, transport = false): Headers {
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (value.length > 4096 || (!allowed.has(key) && !(transport && TRANSPORT_HEADERS.has(key))))
      throw new HttpFailure(400, 'Invalid private request header');
    if (allowed.has(key)) headers.set(key, value);
  }
  return headers;
}

export function nativeRequestHeaders(tenant: string, request: Request): Headers {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(tenant) ||
    request.url !== 'https://tenant.internal/mcp' ||
    !['GET', 'POST', 'DELETE'].includes(request.method)
  )
    throw new HttpFailure(400, 'Invalid native request');
  return checkHeaders(request, MCP_HEADERS);
}

async function untilAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(new HttpFailure(499, 'Request cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([pending, stopped]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

async function cleanupChild(cancel: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      cancel,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ContainerJobFailure('CLEANUP_FAILED')), 10_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** One coordinator VM per admitted MCP request. Only its outside parent owns tenancy. */
export class NativeRequestJob {
  private readonly stopped = new AbortController();
  private closing?: Promise<void>;
  constructor(
    private readonly context: Pick<DurableObjectState, 'container' | 'storage'>,
    private readonly ports: NativeRequestPorts,
  ) {}

  private check(): void {
    if (this.stopped.signal.aborted) throw new HttpFailure(499, 'Request cancelled');
  }

  private async active(): Promise<RequestRecord & { tenant: string }> {
    this.check();
    const record = await this.context.storage.get<RequestRecord>('request');
    this.check();
    if (record?.state !== 'running' || !record.tenant)
      throw new HttpFailure(409, 'Native request is not active');
    if (Date.now() >= record.deadlineAt) throw new HttpFailure(504, 'Native request timed out');
    return record as RequestRecord & { tenant: string };
  }

  async run(tenant: string, request: Request, deadlineAt: number): Promise<Response> {
    const container = this.context.container;
    const image = container?.images.coordinator;
    let origin: URL;
    try {
      origin = new URL(this.ports.publicOrigin);
    } catch {
      throw new HttpFailure(503, 'Native host is not configured');
    }
    if (
      !container ||
      !image ||
      image.length > 512 ||
      !/^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$/.test(image) ||
      origin.protocol !== 'https:' ||
      origin.origin !== this.ports.publicOrigin
    )
      throw new HttpFailure(503, 'Native host is not configured');
    if (
      !Number.isSafeInteger(deadlineAt) ||
      deadlineAt <= Date.now() ||
      deadlineAt > Date.now() + 120_000
    )
      throw new HttpFailure(400, 'Invalid native request');
    const headers = nativeRequestHeaders(tenant, request);
    const admitted = await this.context.storage.transaction(async (tx) => {
      if (await tx.get('request')) return false;
      await tx.put('request', {
        state: 'running',
        tenant,
        deadlineAt,
        children: [],
      } satisfies RequestRecord);
      await tx.setAlarm(deadlineAt);
      return true;
    });
    if (!admitted) throw new HttpFailure(409, 'Native request already used');
    const signal = AbortSignal.any([request.signal, this.stopped.signal]);
    const check = () => {
      this.check();
      if (Date.now() >= deadlineAt) throw new HttpFailure(504, 'Native request timed out');
      if (signal.aborted) throw new HttpFailure(499, 'Request cancelled');
    };
    const timer = setTimeout(() => this.stopped.abort(), Math.max(0, deadlineAt - Date.now()));
    let response: Response | undefined;
    try {
      check();
      const body = await readBounded(request.body, 1024 * 1024, signal);
      check();
      if (container.running) throw new HttpFailure(503, 'Native host is unavailable');
      await untilAbort(
        container.interceptOutboundHttp('kiln-storage.internal', this.ports.storageInterceptor),
        signal,
      );
      check();
      await untilAbort(
        container.interceptOutboundHttp(
          'kiln-evaluator.internal',
          this.ports.evaluationInterceptor,
        ),
        signal,
      );
      check();
      await untilAbort(
        container.interceptOutboundHttp('kiln-renderer.internal', this.ports.renderInterceptor),
        signal,
      );
      check();
      container.start({
        image,
        enableInternet: false,
        instance: 'standard-1',
        env: { KILN_PUBLIC_ORIGIN: this.ports.publicOrigin },
      });
      void container.monitor().then(
        () => this.stopped.abort(),
        () => this.stopped.abort(),
      );
      await untilAbort(container.setInactivityTimeout(120_000), signal);
      const port = container.getTcpPort(3000);
      for (;;) {
        check();
        try {
          const ready = await untilAbort(
            port.fetch(new Request('http://kiln-native.internal/_ready', { signal })),
            signal,
          );
          void ready.body?.cancel().catch(() => {});
          if (ready.status === 204) break;
        } catch {
          if (signal.aborted) throw new HttpFailure(499, 'Request cancelled');
        }
        await untilAbort(new Promise((resolve) => setTimeout(resolve, 100)), signal);
      }
      const observed = await untilAbort(container.inspect(), signal);
      check();
      if (observed?.image !== image) throw new HttpFailure(503, 'Native host is unavailable');
      const incoming = new Request('http://kiln-native.internal/mcp', {
        method: request.method,
        headers,
        body: request.body === null ? undefined : body,
        signal,
        redirect: 'manual',
      });
      const pending = port.fetch(incoming).then((result) => {
        if (signal.aborted) void result.body?.cancel().catch(() => {});
        return result;
      });
      response = await untilAbort(pending, signal);
      check();
      if (response.status >= 300 && response.status < 400)
        throw new HttpFailure(502, 'Invalid native response');
      const bytes = await readBounded(response.body, 32 * 1024 * 1024, signal);
      check();
      const outgoing = new Headers();
      for (const key of ['content-type', 'mcp-protocol-version', 'allow']) {
        const value = response.headers.get(key);
        if (value && value.length <= 512) outgoing.set(key, value);
      }
      return privateResponse(
        new Response(bytes.length ? bytes : null, { status: response.status, headers: outgoing }),
      );
    } catch (error) {
      void response?.body?.cancel().catch(() => {});
      if (Date.now() >= deadlineAt) throw new HttpFailure(504, 'Native request timed out');
      throw error instanceof HttpFailure
        ? error
        : new HttpFailure(503, 'Native host is unavailable');
    } finally {
      clearTimeout(timer);
      await this.cancel();
    }
  }

  async storageRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const permitted =
      request.method === 'GET'
        ? path === '/internal/programs' ||
          /^\/internal\/programs\/[^/]+$/.test(path) ||
          /^\/internal\/assets\/[^/]+\/[^/]+\/[^/]+$/.test(path) ||
          /^\/internal\/materials\/[a-z][a-z0-9_-]{0,79}\/[a-f0-9]{64}$/.test(path) ||
          /^\/mcp\/artifacts\/[a-f0-9]{32}$/.test(path)
        : request.method === 'POST'
          ? [
              '/internal/programs',
              '/internal/artifacts',
              '/internal/artifacts/discard',
              '/internal/assets/list',
              '/internal/assets/commit',
              '/internal/materials/list',
              '/internal/materials/commit',
              '/internal/downloads',
            ].includes(path)
          : request.method === 'DELETE' && /^\/internal\/groups\/[a-f0-9]{32}$/.test(path);
    if (url.href !== `http://kiln-storage.internal${path}` || !permitted)
      throw new HttpFailure(400, 'Invalid storage request');
    const headers = checkHeaders(request, STORAGE_HEADERS, true);
    const record = await this.active();
    const signal = AbortSignal.any([request.signal, this.stopped.signal]);
    const incoming = new Request(request, { headers, signal, redirect: 'manual' });
    const pending = this.ports
      .storage(record.tenant, new Request(`https://tenant.internal${path}`, incoming))
      .then((result) => {
        if (signal.aborted) void result.body?.cancel().catch(() => {});
        return result;
      });
    return untilAbort(pending, signal);
  }

  evaluateRequest(request: Request): Promise<Response> {
    return this.executionRequest('evaluation', request);
  }

  renderRequest(request: Request): Promise<Response> {
    return this.executionRequest('render', request);
  }

  private cancelChild(kind: ExecutionKind, id: string): Promise<void> {
    return kind === 'evaluation' ? this.ports.cancelEvaluation(id) : this.ports.cancelRender(id);
  }

  private async executionRequest(kind: ExecutionKind, request: Request): Promise<Response> {
    const profile = EXECUTION_PROFILES[kind];
    if (request.url !== profile.url || request.method !== 'POST')
      throw new HttpFailure(400, 'Invalid execution request');
    const headers = checkHeaders(request, EVALUATION_HEADERS, true);
    const id = crypto.randomUUID();
    const record = await this.context.storage.transaction(async (tx) => {
      this.check();
      const record = await tx.get<RequestRecord>('request');
      this.check();
      if (record?.state !== 'running' || Date.now() >= record.deadlineAt)
        throw new HttpFailure(409, 'Native request is not active');
      if (record.activeChild || record.children.length >= 8)
        throw new HttpFailure(429, 'Execution limit reached');
      record.children.push({ id, kind });
      record.activeChild = id;
      await tx.put('request', record);
      return record;
    });
    let response: Response | undefined;
    const signal = AbortSignal.any([request.signal, this.stopped.signal]);
    try {
      this.check();
      const requested = Number(headers.get('x-kiln-deadline-ms'));
      if (!Number.isSafeInteger(requested) || requested < 1 || requested > profile.deadlineMs)
        throw new HttpFailure(400, 'Invalid execution limit');
      const remaining = Math.min(requested, record.deadlineAt - Date.now());
      if (remaining < 1) throw new HttpFailure(504, 'Native request timed out');
      headers.set('x-kiln-deadline-ms', String(remaining));
      const incoming = new Request(request, { headers, signal });
      const execution =
        kind === 'evaluation' ? this.ports.evaluate(id, incoming) : this.ports.render(id, incoming);
      const pending = execution.then((result) => {
        if (signal.aborted) void result.body?.cancel().catch(() => {});
        return result;
      });
      response = await untilAbort(pending, signal);
      await cleanupChild(this.cancelChild(kind, id));
      await this.context.storage.transaction(async (tx) => {
        const current = await tx.get<RequestRecord>('request');
        if (current?.activeChild === id) {
          delete current.activeChild;
          await tx.put('request', current);
        }
      });
      this.check();
      return response;
    } catch (error) {
      void response?.body?.cancel().catch(() => {});
      throw error;
    }
  }

  cancel(): Promise<void> {
    this.stopped.abort();
    if (this.closing) return this.closing;
    const pending = this.close();
    this.closing = pending;
    const done = () => {
      if (this.closing === pending) this.closing = undefined;
    };
    void pending.then(done, done);
    return pending;
  }

  private async close(): Promise<void> {
    const record = await this.context.storage.transaction(async (tx) => {
      const record = await tx.get<RequestRecord>('request');
      if (!record) {
        await tx.put('request', {
          state: 'finished',
          deadlineAt: Date.now(),
          children: [],
        } satisfies RequestRecord);
        return undefined;
      }
      if (record.state === 'finished') return undefined;
      record.state = 'closing';
      await tx.put('request', record);
      await tx.setAlarm(Date.now());
      return record;
    });
    if (!record) return;
    try {
      const container = this.context.container;
      if (!container) throw new ContainerJobFailure('CLEANUP_FAILED');
      const results = await Promise.allSettled([
        destroyContainer(container),
        ...record.children.map(({ id, kind }) => cleanupChild(this.cancelChild(kind, id))),
      ]);
      if (results.some((result) => result.status === 'rejected'))
        throw new ContainerJobFailure('CLEANUP_FAILED');
      await this.context.storage.put('request', {
        ...record,
        state: 'finished',
        activeChild: undefined,
      } satisfies RequestRecord);
      await this.context.storage.deleteAlarm();
    } catch {
      await this.context.storage.setAlarm(Date.now() + 30_000);
      throw new ContainerJobFailure('CLEANUP_FAILED');
    }
  }

  async alarm(): Promise<void> {
    const record = await this.context.storage.get<RequestRecord>('request');
    if (!record || record.state === 'finished') {
      await this.context.storage.deleteAlarm();
      return;
    }
    if (record.state === 'running' && Date.now() < record.deadlineAt) {
      await this.context.storage.setAlarm(record.deadlineAt);
      return;
    }
    await this.cancel();
  }
}
