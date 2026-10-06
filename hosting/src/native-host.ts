import { createServer } from 'node:http';
import { toNodeHandler, type FetchLikeMcpHandler } from '@modelcontextprotocol/node';

/** Private port adapter. Only the externally scoped VM controller may reach it. */
export function createNativeHttpServer(
  handler: FetchLikeMcpHandler,
  options: { requestTimeoutMs?: number } = {},
) {
  const timeout = options.requestTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 10_000)
    throw new Error('Invalid native upload deadline');
  const adapter = toNodeHandler(handler, { maxRequestBodySize: 1024 * 1024, onerror: () => {} });
  const server = createServer(
    {
      requestTimeout: timeout,
      headersTimeout: timeout,
      connectionsCheckingInterval: Math.min(1000, timeout),
      keepAliveTimeout: 5000,
      maxHeaderSize: 16 * 1024,
    },
    (request, response) => {
      const refuse = (status: number) => {
        response.writeHead(status, {
          'content-type': 'text/plain',
          'cache-control': 'no-store',
          connection: 'close',
        });
        response.end('Invalid native request', () => request.destroy());
      };
      if (request.headers.host !== 'kiln-native.internal') return refuse(421);
      if (request.url === '/_ready' && request.method === 'GET') {
        response.writeHead(204, { 'cache-control': 'no-store' });
        response.end();
        return;
      }
      if (request.url !== '/mcp') return refuse(404);
      const declared = request.headers['content-length'];
      if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > 1024 * 1024))
        return refuse(413);
      // The SDK buffers the request before calling fetch. Bound that phase as well
      // as the handler's own execution deadline; disconnects are propagated by SDK.
      const timer = setTimeout(() => request.destroy(), timeout);
      timer.unref();
      const clear = () => clearTimeout(timer);
      request.once('end', clear);
      request.once('close', clear);
      void adapter(request, response).catch(() => response.destroy());
    },
  );
  server.maxConnections = 4;
  server.maxRequestsPerSocket = 16;
  return server;
}
