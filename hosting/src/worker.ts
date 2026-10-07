import {
  OAuthAuthorizationServer,
  OAuthError,
  OAuthResourceServer,
} from '@cloudflare/workers-oauth-provider';
import { D1Connections } from './connections';
import { accountPage } from './account-page';
import { beginBrowserLogin } from './browser-login';
import { beginAccountAction } from './account-actions';
import { beginIdentityAction } from './identity-actions';
import { browserDownload } from './browser-download';
import { authorize, authorizationFailure, SCOPES, type SignInEnv } from './auth';
import { forwardTenant, type TenantEnv } from './gateway';
import { boundedRequest, HttpFailure, privateResponse } from './http';

export interface Env extends SignInEnv, TenantEnv {
  OAUTH_KV: KVNamespace;
  PUBLIC_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const configured = new URL(env.PUBLIC_ORIGIN);
      if (configured.protocol !== 'https:' || configured.origin !== env.PUBLIC_ORIGIN)
        throw new Error('Invalid origin configuration');
      const origin = configured.origin;
      const url = new URL(request.url);
      if (url.origin !== origin) throw new HttpFailure(421, 'Invalid request origin');
      if (url.href.length > 16_384) throw new HttpFailure(414, 'URL too long');
      const resource = `${origin}/mcp`;
      const auth = new OAuthAuthorizationServer<Env>({
        issuer: origin,
        resources: [resource],
        authorizeEndpoint: `${origin}/authorize`,
        tokenEndpoint: `${origin}/oauth/token`,
        clientRegistrationEndpoint: `${origin}/register`,
        clientIdMetadataDocumentEnabled: true,
        scopesSupported: SCOPES,
        accessTokenTTL: 900,
        refreshTokenTTL: 30 * 24 * 60 * 60,
        tokenExchangeCallback: async ({
          env: bindings,
          userId,
          props,
          clientId,
          grantId,
          grantType,
        }) => {
          if (
            !(await new D1Connections(bindings.ACCOUNTS).exchange(
              userId,
              props,
              clientId,
              grantId,
              grantType,
            ))
          )
            throw new OAuthError('invalid_grant', {
              description: 'Account authorization changed; sign in again',
            });
        },
        // Deliberately do not log request data or provider error descriptions.
        onError: () => {},
      });
      const protectedResource = new OAuthResourceServer<Env>({
        resourceMetadata: { resource, authorization_servers: [origin] },
        requiredScopes: ['kiln:use'],
        validateToken: (bindings) => async (audience, token) => {
          const verified = await auth.validateToken(audience, token, bindings);
          if (!verified) return null;
          if (
            !(await new D1Connections(bindings.ACCOUNTS).accepts(
              verified.userId,
              verified.props,
              verified.clientId,
            ))
          )
            throw new OAuthError('invalid_token', {
              description: 'Account authorization changed; sign in again',
            });
          return verified;
        },
        handler: {
          fetch: (incoming, bindings, context) =>
            forwardTenant(incoming, bindings, context, origin),
        },
      });
      let response: Response;
      if (
        url.pathname === '/mcp' ||
        url.pathname.startsWith('/mcp/') ||
        url.pathname.startsWith('/.well-known/oauth-protected-resource')
      ) {
        const browserOrigin = request.headers.get('origin');
        if (browserOrigin !== null && browserOrigin !== origin)
          throw new HttpFailure(403, 'Origin not allowed');
        if (url.search)
          throw new HttpFailure(400, 'Query parameters are not supported on resource endpoints');
        response = await protectedResource.fetch(request, env, ctx);
      } else if (url.pathname.startsWith('/downloads/')) {
        response = await browserDownload(request, env, origin);
      } else if (url.pathname === '/account' || url.pathname === '/account/logout') {
        response = await accountPage(await boundedRequest(request, 4096), env.ACCOUNTS, origin);
      } else if (
        url.pathname === '/authorize' ||
        url.pathname === '/account/login' ||
        url.pathname === '/account/action' ||
        url.pathname === '/account/identity' ||
        url.pathname === '/oauth/github/callback' ||
        url.pathname === '/oauth/google/callback'
      ) {
        if (
          !env.GITHUB_CLIENT_ID ||
          !env.GITHUB_CLIENT_SECRET ||
          !env.GOOGLE_CLIENT_ID ||
          !env.GOOGLE_CLIENT_SECRET ||
          !env.ACCOUNTS
        )
          throw new HttpFailure(503, 'Sign-in is not configured');
        response =
          url.pathname === '/account/identity'
            ? await beginIdentityAction(await boundedRequest(request, 4096), origin, env)
            : url.pathname === '/account/action'
              ? await beginAccountAction(await boundedRequest(request, 4096), origin, env)
              : url.pathname === '/account/login'
                ? await beginBrowserLogin(await boundedRequest(request, 4096), origin, env)
                : await authorize(
                    await boundedRequest(request, 16_384),
                    auth.getOAuthApi(env),
                    origin,
                    env,
                    ctx,
                  );
      } else if (
        url.pathname === '/register' ||
        url.pathname.startsWith('/oauth/token') ||
        url.pathname.startsWith('/.well-known/')
      ) {
        response = await auth.fetch(await boundedRequest(request, 16_384), env, ctx);
      } else {
        response = new Response('Not found', { status: 404 });
      }
      return privateResponse(response);
    } catch (error) {
      return privateResponse(authorizationFailure(error));
    }
  },
} satisfies ExportedHandler<Env>;
