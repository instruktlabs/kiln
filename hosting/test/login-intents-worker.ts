import { authorizationFailure } from '../src/auth';
import { D1LoginIntents, type LoginIntent } from '../src/login-intents';

export default {
  async fetch(request: Request, env: { ACCOUNTS: D1Database }): Promise<Response> {
    try {
      const input = (await request.json()) as LoginIntent & { handle: string };
      const store = new D1LoginIntents(env.ACCOUNTS, new URL(request.url).origin);
      switch (new URL(request.url).pathname) {
        case '/consent':
          await store.claimConsent(input.handle);
          break;
        case '/create':
          await store.create(input);
          break;
        case '/consume':
          await store.consume(input);
          break;
        default:
          return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      return authorizationFailure(error);
    }
  },
};
