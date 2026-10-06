import { D1AccountDirectory } from '../src/accounts';
import { serviceFailure } from '../src/http';

// Test-only interface to the directory. Production must only accept identities
// from verified sign-in adapters, never request bodies or caller headers.
export default {
  async fetch(request: Request, env: { ACCOUNTS: D1Database }): Promise<Response> {
    try {
      const directory = new D1AccountDirectory(env.ACCOUNTS);
      const url = new URL(request.url);
      if (request.method === 'POST')
        return Response.json(await directory.resolveIdentity(await request.json()));
      return Response.json(await directory.getAccount(url.pathname.slice(1)));
    } catch (error) {
      return serviceFailure(error);
    }
  },
} satisfies ExportedHandler<{ ACCOUNTS: D1Database }>;
