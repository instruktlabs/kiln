import * as oauth from 'oauth4webapi';
import { IDENTITY_ISSUERS, type VerifiedIdentity } from './accounts';
import { HttpFailure, readBounded } from './http';

export interface GoogleEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

/** Values retained server-side for one browser-bound, single-use login intent. */
export interface GoogleFlow {
  state: string;
  verifier: string;
  nonce: string;
  selectAccount?: boolean;
}

const issuer = new URL(IDENTITY_ISSUERS.google);
const unavailable = () =>
  new HttpFailure(502, 'Google sign-in provider unavailable; restart sign-in');
const failed = () => new HttpFailure(400, 'Google sign-in failed; restart sign-in');

function configuration(origin: string, flow: GoogleFlow, env: GoogleEnv): oauth.Client {
  if (
    new URL(origin).protocol !== 'https:' ||
    new URL(origin).origin !== origin ||
    !env.GOOGLE_CLIENT_ID ||
    env.GOOGLE_CLIENT_ID.length > 512 ||
    !env.GOOGLE_CLIENT_SECRET ||
    env.GOOGLE_CLIENT_SECRET.length > 4096
  )
    throw new HttpFailure(503, 'Google sign-in is not configured');
  if (
    !flow.state ||
    flow.state.length > 4096 ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(flow.verifier) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(flow.nonce)
  )
    throw failed();
  return { client_id: env.GOOGLE_CLIENT_ID, id_token_signed_response_alg: 'RS256' };
}

function endpoint(value: unknown, origin: string): string {
  if (typeof value !== 'string') throw unavailable();
  const url = new URL(value);
  if (url.origin !== origin || url.username || url.password || url.hash) throw unavailable();
  return url.href;
}

type GoogleHttpOptions = oauth.HttpRequestOptions<'GET' | 'POST', URLSearchParams | undefined>;

function network(signal?: AbortSignal): GoogleHttpOptions {
  const deadline = AbortSignal.timeout(10_000);
  const execution = signal ? AbortSignal.any([signal, deadline]) : deadline;
  return {
    signal: execution,
    [oauth.customFetch]: async (url, options) => {
      try {
        const target = new URL(url);
        // The discovery document and provider endpoints are selected by this
        // adapter, never by callback input. Refuse redirects and non-Google I/O.
        if (
          ![
            'https://accounts.google.com',
            'https://oauth2.googleapis.com',
            'https://www.googleapis.com',
          ].includes(target.origin)
        )
          throw unavailable();
        const response = await fetch(url, { ...options, redirect: 'manual', signal: execution });
        if ((response.status >= 300 && response.status < 400) || response.status >= 500) {
          void response.body?.cancel().catch(() => {});
          throw unavailable();
        }
        const bytes = await readBounded(response.body, 65_536, execution);
        return new Response(bytes, { status: response.status, headers: response.headers });
      } catch {
        throw unavailable();
      }
    },
  };
}

async function metadata(options: GoogleHttpOptions): Promise<oauth.AuthorizationServer> {
  try {
    const response = await oauth.discoveryRequest(issuer, options);
    const server = await oauth.processDiscoveryResponse(issuer, response);
    endpoint(server.authorization_endpoint, 'https://accounts.google.com');
    endpoint(server.token_endpoint, 'https://oauth2.googleapis.com');
    endpoint(server.jwks_uri, 'https://www.googleapis.com');
    return server;
  } catch {
    throw unavailable();
  }
}

export async function googleAuthorizationUrl(
  origin: string,
  flow: GoogleFlow,
  env: GoogleEnv,
  signal?: AbortSignal,
): Promise<string> {
  const client = configuration(origin, flow, env);
  const server = await metadata(network(signal));
  const target = new URL(server.authorization_endpoint!);
  target.search = new URLSearchParams({
    client_id: client.client_id,
    response_type: 'code',
    redirect_uri: `${origin}/oauth/google/callback`,
    scope: 'openid profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(flow.verifier),
    code_challenge_method: 'S256',
    ...(flow.selectAccount ? { prompt: 'select_account' } : {}),
  }).toString();
  return target.href;
}

export async function googleIdentity(
  request: Request,
  origin: string,
  flow: GoogleFlow,
  env: GoogleEnv,
): Promise<VerifiedIdentity> {
  const client = configuration(origin, flow, env);
  const callback = new URL(request.url);
  if (
    request.method !== 'GET' ||
    callback.origin !== origin ||
    callback.pathname !== '/oauth/google/callback'
  )
    throw failed();
  const options = network(request.signal);
  const server = await metadata(options);
  try {
    const parameters = oauth.validateAuthResponse(server, client, callback, flow.state);
    const response = await oauth.authorizationCodeGrantRequest(
      server,
      client,
      oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET),
      parameters,
      `${origin}/oauth/google/callback`,
      flow.verifier,
      options,
    );
    // Google documents both issuer spellings. Each goes through the complete
    // library validator; no JWT is decoded or modified by Kiln. The resulting
    // account key is always the canonical HTTPS issuer.
    let verified: oauth.TokenEndpointResponse | undefined;
    for (const acceptedIssuer of [server.issuer, 'accounts.google.com']) {
      const attempt = response.clone();
      const acceptedServer = { ...server, issuer: acceptedIssuer };
      try {
        verified = await oauth.processAuthorizationCodeResponse(acceptedServer, client, attempt, {
          expectedNonce: flow.nonce,
          requireIdToken: true,
        });
      } catch (error) {
        if (acceptedIssuer === server.issuer) continue;
        throw error;
      }
      await oauth.validateApplicationLevelSignature(acceptedServer, attempt, options);
      break;
    }
    const claims = verified && oauth.getValidatedIdTokenClaims(verified);
    if (!claims || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) throw failed();
    // This client has no cross-client/hybrid sign-in. The library requires azp
    // for multiple audiences; also reject a foreign azp with a single audience.
    if (claims.azp !== undefined && claims.azp !== client.client_id) throw failed();
    // Upstream access/ID tokens are intentionally discarded at this boundary.
    return { issuer: IDENTITY_ISSUERS.google, subject: claims.sub };
  } catch (error) {
    if (error instanceof HttpFailure) throw error;
    throw failed();
  }
}
