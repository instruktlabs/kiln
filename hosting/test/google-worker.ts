import { googleAuthorizationUrl, googleIdentity, type GoogleEnv } from '../src/google';
import { serviceFailure } from '../src/http';

// Fixtures have no production entry or credentials. The real gateway must load
// these values from its consumed browser-bound login intent, never from a caller.
const flow = { state: 's'.repeat(43), verifier: 'v'.repeat(43), nonce: 'n'.repeat(43) };
export default {
  async fetch(request: Request, env: GoogleEnv): Promise<Response> {
    try {
      const origin = 'https://kiln.example.com';
      if (new URL(request.url).pathname === '/start')
        return Response.json({
          url: await googleAuthorizationUrl(origin, flow, env, request.signal),
        });
      return Response.json(await googleIdentity(request, origin, flow, env));
    } catch (error) {
      return serviceFailure(error);
    }
  },
} satisfies ExportedHandler<GoogleEnv>;
