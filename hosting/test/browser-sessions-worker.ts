import { D1BrowserSessions } from '../src/browser-sessions';
import { serviceFailure } from '../src/http';

// Fixture only: production identity inputs come exclusively from provider proofs.
export default {
  async fetch(request: Request, env: { ACCOUNTS: D1Database }) {
    try {
      const sessions = new D1BrowserSessions(env.ACCOUNTS, 'https://kiln.test');
      const path = new URL(request.url).pathname;
      if (path === '/issue')
        return Response.json(await sessions.issue(await request.json(), request));
      if (path === '/logout') {
        const body =
          request.method === 'POST' ? ((await request.json()) as { csrf: string }) : { csrf: '' };
        return new Response(null, {
          headers: { 'set-cookie': await sessions.logout(request, body.csrf) },
        });
      }
      return Response.json(await sessions.read(request));
    } catch (error) {
      return serviceFailure(error);
    }
  },
} satisfies ExportedHandler<{ ACCOUNTS: D1Database }>;
