import { createMcpHandler, type Server } from '@modelcontextprotocol/server';
import type { KilnToolContext } from '@instruktlabs/kiln/tools';
import type { EvaluatorPortV2, IsolatedEvaluatorHost } from '@instruktlabs/kiln/evaluator';
import type { PbrRenderPort } from '@instruktlabs/kiln/composer';
import { NativeProgramStore } from './native-programs';
import { NativeAssetLibrary } from './native-assets';
import { NativeMaterialLibrary } from './native-materials';
import { NativeMaterialWorkspace } from './native-workspace';
import type { NativeStorageOptions } from './native-http';
import { createNativeEvaluatorPort, type NativeEvaluatorOptions } from './native-evaluator';
import { HttpFailure, privateResponse, readBounded, serviceFailure } from './http';
import { createNativeRenderPort } from './native-render';
import { RENDER_LIMITS } from './render-limits';

export interface NativeMcpRuntime {
  createServer: (context: KilnToolContext) => Server;
  evaluatorPort: EvaluatorPortV2;
  viewRenderPort?: PbrRenderPort;
}

async function loadInstalledEngine(): Promise<NativeMcpRuntime['createServer']> {
  try {
    const entry = new URL(import.meta.resolve('@instruktlabs/kiln'));
    // This private host pins the engine's shipped bundle alongside its SDK.
    // Do not resolve a checkout source file or a caller-supplied module URL.
    const engine = await import(new URL('../dist/mcp-engine.mjs', entry).href);
    if (typeof engine.createKilnMcpServer !== 'function') throw new Error('Invalid engine');
    return engine.createKilnMcpServer;
  } catch {
    throw new Error('Native engine installation is unavailable');
  }
}

/** Installed-package nested-isolation route. A failed probe has no fallback. */
export async function loadNativeMcpRuntime(
  host: IsolatedEvaluatorHost = { bwrapPath: '/usr/bin/bwrap' },
): Promise<NativeMcpRuntime> {
  const createServer = await loadInstalledEngine();
  try {
    const evaluator = await import('@instruktlabs/kiln/evaluator');
    await evaluator.assertIsolatedEvaluatorReady(host);
    return {
      createServer,
      evaluatorPort: {
        render: (code, options, controls) =>
          evaluator.renderGLBViaIsolatedEvaluator(code, options, { ...controls, host }),
      },
    };
  } catch {
    throw new Error('Native isolation readiness failed; no evaluator is available');
  }
}

/**
 * Explicit externally isolated profile. The controller supplies the private
 * evaluator route; unavailable transport fails closed on calls. Never selected
 * automatically after a failed nested-isolation readiness check.
 */
export async function loadContainerMcpRuntime(
  options: NativeEvaluatorOptions = {},
  rendering: { fetch?: (request: Request) => Promise<Response> } = {},
): Promise<NativeMcpRuntime> {
  return {
    createServer: await loadInstalledEngine(),
    evaluatorPort: createNativeEvaluatorPort(options),
    viewRenderPort: createNativeRenderPort(rendering),
  };
}

export interface NativeMcpOptions {
  publicOrigin: string;
  storage?: NativeStorageOptions;
  requestTimeoutMs?: number;
  maxConcurrent?: number;
  maxResponseBytes?: number;
}

const REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
function integer(value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error('Invalid native host limit');
  return value;
}

/** One externally tenant-bound native host. Never expose its private port directly. */
export function createNativeMcpHandler(runtime: NativeMcpRuntime, options: NativeMcpOptions) {
  if (
    typeof runtime?.createServer !== 'function' ||
    typeof runtime?.evaluatorPort?.render !== 'function'
  )
    throw new Error('A qualified evaluator port is required');
  const publicOrigin = new URL(options.publicOrigin);
  if (publicOrigin.protocol !== 'https:' || publicOrigin.origin !== options.publicOrigin)
    throw new Error('Invalid public origin');
  const timeoutMs = integer(options.requestTimeoutMs ?? 120_000, 120_000);
  const maxConcurrent = integer(options.maxConcurrent ?? 1, 4);
  const maxResponseBytes = integer(
    options.maxResponseBytes ?? MAX_RESPONSE_BYTES,
    MAX_RESPONSE_BYTES,
  );
  const active = new Set<{ abort: () => void }>();
  let closed = false;

  return {
    async close() {
      closed = true;
      for (const lease of active) lease.abort();
    },
    async fetch(request: Request): Promise<Response> {
      // The outside controller owns identity, authentication and port reachability.
      const url = new URL(request.url);
      if (url.origin !== 'http://kiln-native.internal')
        return privateResponse(new Response('Invalid internal origin', { status: 421 }));
      if (url.pathname !== '/mcp')
        return privateResponse(new Response('Not found', { status: 404 }));
      if (url.search || url.hash)
        return privateResponse(new Response('Invalid internal request', { status: 400 }));
      if (
        (request.headers.has('origin') && request.headers.get('origin') !== options.publicOrigin) ||
        ['authorization', 'cookie', 'x-kiln-tenant', 'x-user-id', 'cf-access-jwt-assertion'].some(
          (name) => request.headers.has(name),
        )
      )
        return privateResponse(
          new Response('Forbidden internal credentials or Origin', { status: 403 }),
        );
      if (closed) return privateResponse(new Response('Native host is closed', { status: 503 }));
      if (active.size >= maxConcurrent)
        return privateResponse(
          new Response('Native host is busy; retry shortly', {
            status: 429,
            headers: { 'retry-after': '2' },
          }),
        );

      const controller = new AbortController();
      let timedOut = false;
      let responseDone = false;
      let evaluations = 0;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let transport: ReturnType<typeof createMcpHandler> | undefined;
      const lease = { abort: () => controller.abort() };
      const release = () => {
        if (responseDone && evaluations === 0) active.delete(lease);
      };
      const abortError = () =>
        new HttpFailure(
          timedOut ? 504 : 499,
          timedOut ? 'Native request timed out' : 'Native request cancelled',
        );
      let rejectAbort: (reason: unknown) => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject;
      });
      // Body admission or an already-aborted caller can fail before fetch races it.
      void aborted.catch(() => {});
      const onAbort = () => {
        rejectAbort(abortError());
        void reader?.cancel().catch(() => {});
        finish();
      };
      controller.signal.addEventListener('abort', onAbort, { once: true });
      request.signal.addEventListener('abort', lease.abort, { once: true });
      active.add(lease);
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const finish = () => {
        if (responseDone) return;
        responseDone = true;
        clearTimeout(timer);
        request.signal.removeEventListener('abort', lease.abort);
        controller.signal.removeEventListener('abort', onAbort);
        void transport?.close().catch(() => {});
        release();
      };
      try {
        if (request.signal.aborted) controller.abort();
        if (controller.signal.aborted) throw abortError();
        const declared = request.headers.get('content-length');
        if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > REQUEST_BYTES))
          throw new HttpFailure(413, 'Request too large');
        const bytes = await readBounded(request.body, REQUEST_BYTES, controller.signal);
        const incoming = new Request(request, {
          body: request.body === null ? undefined : bytes,
          signal: controller.signal,
        });
        transport = createMcpHandler(
          () => {
            const storage = { ...options.storage, signal: () => controller.signal };
            const materials = new NativeMaterialLibrary(storage);
            const assets = new NativeAssetLibrary({ ...storage, materials });
            return runtime.createServer({
              programStore: new NativeProgramStore(storage),
              assetLibrary: assets,
              materialLibrary: materials,
              workspace: new NativeMaterialWorkspace(materials),
              assetDownloadUrls: (collection, assetId, revisionId) =>
                assets.downloadUrls(options.publicOrigin, collection, assetId, revisionId),
              evaluatorProfile: 'evaluator-required',
              evaluatorPort: {
                render: async (code, renderOptions, controls) => {
                  if (controller.signal.aborted) throw abortError();
                  evaluations++;
                  try {
                    return await runtime.evaluatorPort.render(code, renderOptions, controls);
                  } finally {
                    evaluations--;
                    release();
                  }
                },
              },
              ...(runtime.viewRenderPort
                ? {
                    viewRenderPort: async (input, execution) => {
                      if (controller.signal.aborted) throw abortError();
                      evaluations++;
                      try {
                        return await runtime.viewRenderPort!(input, {
                          signal: execution?.signal
                            ? AbortSignal.any([execution.signal, controller.signal])
                            : controller.signal,
                        });
                      } finally {
                        evaluations--;
                        release();
                      }
                    },
                    viewRenderTimeoutMs: RENDER_LIMITS.deadlineMs,
                  }
                : {}),
              captureLimits: {
                maxTotalPixels: 8 * 1024 * 1024,
                maxOutputBytes: RENDER_LIMITS.pngBytes,
              },
              evaluationControls: () => ({
                signal: controller.signal,
                deadlineMs: Math.min(timeoutMs, 60_000),
                maxGlbBytes: 16 * 1024 * 1024,
                maxResponseBytes: 32 * 1024 * 1024,
              }),
              cacheEvaluations: false,
              cacheCaptures: false,
            });
          },
          {
            legacy: 'stateless',
            maxRequestBodySize: REQUEST_BYTES,
            maxSubscriptions: 0,
            onerror: () => {},
          },
        );
        const pending = transport.fetch(incoming).then((response) => {
          if (responseDone || controller.signal.aborted)
            void response.body?.cancel().catch(() => {});
          return response;
        });
        const response = await Promise.race([pending, aborted]);
        if (!response.body) {
          finish();
          return privateResponse(response);
        }
        reader = response.body.getReader();
        let total = 0;
        const stream = new ReadableStream<Uint8Array>({
          async pull(output) {
            try {
              const chunk = await Promise.race([reader!.read(), aborted]);
              if (chunk.done) {
                output.close();
                finish();
                return;
              }
              total += chunk.value.byteLength;
              if (total > maxResponseBytes)
                throw new HttpFailure(502, 'MCP response exceeds host size limit');
              output.enqueue(chunk.value);
            } catch (error) {
              controller.abort();
              output.error(
                error instanceof HttpFailure ? error : new Error('Native response unavailable'),
              );
              finish();
            }
          },
          cancel() {
            controller.abort();
            void reader?.cancel().catch(() => {});
            finish();
          },
        });
        return privateResponse(
          new Response(stream, { status: response.status, headers: response.headers }),
        );
      } catch (error) {
        void request.body?.cancel().catch(() => {});
        finish();
        return privateResponse(serviceFailure(controller.signal.aborted ? abortError() : error));
      }
    },
  };
}
