import gateway from '../src/worker';
import { forwardTenant } from '../src/gateway';
import { browserDownload } from '../src/browser-download';
import { D1BrowserSessions } from '../src/browser-sessions';

// Test-only I/O observations and identities. This module never enters production.
let calls = { auth: 0, storage: 0, compute: 0 };
export default {
  async fetch(request: Request, env: Parameters<typeof gateway.fetch>[1], ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/fixture/stats') return Response.json(calls);
    if (url.pathname === '/fixture/reset') {
      calls = { auth: 0, storage: 0, compute: 0 };
      return new Response('reset');
    }
    if (url.pathname === '/fixture/session') {
      const session = await new D1BrowserSessions(env.ACCOUNTS, env.PUBLIC_ORIGIN).issue({
        issuer: 'https://github.com',
        subject: await request.text(),
      });
      return Response.json(
        { accountId: session.account.id },
        { headers: { 'set-cookie': session.cookie } },
      );
    }
    if (request.headers.has('x-fixture-ingress')) {
      const forbidden = new Proxy(
        {},
        {
          get() {
            calls.auth++;
            throw new Error('Unexpected auth I/O');
          },
        },
      );
      const deny = {
        async limit() {
          return { success: false };
        },
      };
      const limited = {
        ...env,
        ACCOUNTS: forbidden,
        OAUTH_KV: forbidden,
        EDGE_REQUEST_LIMIT:
          request.headers.get('x-fixture-ingress') === 'missing' ? undefined : deny,
      };
      return gateway.fetch(request, limited as unknown as typeof env, ctx);
    }
    const downstream = {
      ...env,
      TENANTS: {
        getByName() {
          calls.storage++;
          return {
            async fetch() {
              return new Response('saved bytes');
            },
          };
        },
      },
      NATIVE_COMPUTE: {
        async dispatch() {
          calls.compute++;
          return new Response('computed');
        },
      },
    } as unknown as typeof env;
    if (url.pathname === '/fixture/mcp') {
      const incoming = new Request(`${env.PUBLIC_ORIGIN}/mcp`, request);
      return forwardTenant(
        incoming,
        downstream,
        {
          auth: { userId: request.headers.get('x-fixture-account')!, scope: ['kiln:use'] },
        } as Parameters<typeof forwardTenant>[2],
        env.PUBLIC_ORIGIN,
      );
    }
    if (url.pathname.startsWith('/downloads/'))
      return browserDownload(request, downstream, env.PUBLIC_ORIGIN);
    return gateway.fetch(request, env, ctx);
  },
};
