import gateway from '../src/worker';
import { KilnTenant } from '../src/tenant';
import { D1BrowserSessions } from '../src/browser-sessions';

// Test-only session issuer and delayed-revocation fixture, excluded from production.
export class DownloadTenant extends KilnTenant {
  override async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/fixture/revoke') {
      await this.ctx.storage.put('revoke', true);
      return new Response('set');
    }
    if (path === '/fixture/headers')
      return Response.json((await this.ctx.storage.get('headers')) ?? {});
    if (path.startsWith('/internal/downloads/')) {
      await this.ctx.storage.put('headers', Object.fromEntries(request.headers));
      const response = await super.fetch(request);
      if (await this.ctx.storage.get('revoke')) {
        // Simulate account access changing while the tenant awaits object storage.
        const env = this.env as typeof this.env & { ACCOUNTS: D1Database };
        await env.ACCOUNTS.prepare('DELETE FROM kiln_browser_sessions').run();
      }
      return response;
    }
    return super.fetch(request);
  }
}

export default {
  async fetch(request: Request, env: Parameters<typeof gateway.fetch>[1], ctx: ExecutionContext) {
    // Node's fetch overwrites Sec-Fetch-Mode with cors; reproduce browser metadata here.
    if (request.headers.has('x-fixture-fetch-mode')) {
      const headers = new Headers(request.headers);
      headers.set('sec-fetch-mode', headers.get('x-fixture-fetch-mode')!);
      headers.delete('x-fixture-fetch-mode');
      request = new Request(request, { headers });
    }
    if (new URL(request.url).pathname === '/fixture/session') {
      const { subject } = (await request.json()) as { subject: string };
      const session = await new D1BrowserSessions(env.ACCOUNTS, env.PUBLIC_ORIGIN).issue({
        issuer: 'https://github.com',
        subject,
      });
      return Response.json(
        { accountId: session.account.id },
        { headers: { 'set-cookie': session.cookie } },
      );
    }
    return gateway.fetch(request, env, ctx);
  },
};
