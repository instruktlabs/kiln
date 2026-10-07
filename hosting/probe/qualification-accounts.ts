import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider';
import { D1BrowserSessions } from '../src/browser-sessions';
import { D1Connections } from '../src/connections';
import { readBounded, sha256 } from '../src/http';

export const qualificationOrigin = 'https://kiln-private-qualification.invalid';
export interface QualificationAccountsEnv {
  PUBLIC_ORIGIN: string;
  QUALIFICATION_MODE: string;
  ACCOUNTS: D1Database;
  OAUTH_KV: KVNamespace;
  GATEWAY: Fetcher;
}
export function assertQualification(env: QualificationAccountsEnv): void {
  if (
    env.PUBLIC_ORIGIN !== qualificationOrigin ||
    env.QUALIFICATION_MODE !== 'isolated-synthetic-v1'
  )
    throw new Error('PRIVATE_QUALIFICATION_ONLY');
}
export function qualificationOAuth(env: QualificationAccountsEnv) {
  assertQualification(env);
  return new OAuthAuthorizationServer<QualificationAccountsEnv>({
    issuer: qualificationOrigin,
    resources: [`${qualificationOrigin}/mcp`],
    authorizeEndpoint: `${qualificationOrigin}/authorize`,
    tokenEndpoint: `${qualificationOrigin}/oauth/token`,
    clientRegistrationEndpoint: `${qualificationOrigin}/register`,
    scopesSupported: ['kiln:use'],
    accessTokenTTL: 900,
    refreshTokenTTL: 30 * 86400,
    onError: () => {},
  }).getOAuthApi(env);
}
export async function privateJson(
  response: Response,
  status = 200,
): Promise<Record<string, unknown>> {
  const bytes = await readBounded(response.body, 65536);
  if (response.status !== status) throw new Error('PRIVATE_QUALIFICATION_RESPONSE');
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('PRIVATE_QUALIFICATION_RESPONSE');
  return value as Record<string, unknown>;
}

/** Synthetic private fixture only. This bypasses upstream consent, not token validation.
 * Credentials stay inside the private runner; never put this module in a gateway bundle.
 */
export async function syntheticAccount(env: QualificationAccountsEnv, name: 'alice' | 'bob') {
  assertQualification(env);
  const identity = { issuer: 'https://github.com', subject: `kiln-private-qualification-${name}` };
  const sessions = new D1BrowserSessions(env.ACCOUNTS, qualificationOrigin);
  const browser = await sessions.issue(identity);
  const redirect = 'http://127.0.0.1:49317/callback';
  const client = await privateJson(
    await env.GATEWAY.fetch(
      new Request(`${qualificationOrigin}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Kiln private qualification',
          redirect_uris: [redirect],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      }),
    ),
    201,
  );
  if (typeof client.client_id !== 'string') throw new Error('PRIVATE_QUALIFICATION_CLIENT');
  const verifier = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const query = new URLSearchParams({
    client_id: client.client_id,
    response_type: 'code',
    redirect_uri: redirect,
    resource: `${qualificationOrigin}/mcp`,
    scope: 'kiln:use',
    state: crypto.randomUUID(),
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
  });
  const api = qualificationOAuth(env);
  const request = await api.parseAuthRequest(
    new Request(`${qualificationOrigin}/authorize?${query}`),
  );
  const connections = new D1Connections(env.ACCOUNTS);
  const props = await connections.create(
    browser.account,
    request,
    await api.describeConsent(request),
  );
  const { redirectTo } = await api.completeAuthorization({
    request,
    userId: browser.account.id,
    metadata: { connectionId: props.connectionId },
    scope: request.scope,
    props,
    revokeExistingGrants: false,
  });
  const code = new URL(redirectTo).searchParams.get('code');
  if (!code) throw new Error('PRIVATE_QUALIFICATION_CODE');
  const token = await privateJson(
    await env.GATEWAY.fetch(
      new Request(`${qualificationOrigin}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: client.client_id,
          redirect_uri: redirect,
          resource: `${qualificationOrigin}/mcp`,
        }),
      }),
    ),
  );
  if (typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string')
    throw new Error('PRIVATE_QUALIFICATION_TOKEN');
  // Keep only the Cookie pair, never the Set-Cookie attributes.
  const cookie = browser.cookie.split(';')[0]!;
  return {
    identity,
    account: browser.account,
    connectionId: props.connectionId,
    cookie,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    clientId: client.client_id,
  };
}
