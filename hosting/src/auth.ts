import {
  AuthorizationError,
  authorizationErrorRedirect,
  type ConsentDescription,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { HttpFailure, readBounded, sha256 } from './http';
import { D1AccountDirectory, IDENTITY_ISSUERS, type VerifiedIdentity } from './accounts';
import { googleAuthorizationUrl, type GoogleEnv, googleIdentity } from './google';
import { D1LoginIntents, type SignInProvider } from './login-intents';

export const SCOPES = ['kiln:use', 'offline_access'];
export interface SignInEnv extends GoogleEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ACCOUNTS: D1Database;
}
interface SignInTransaction {
  intentId: string;
  provider: SignInProvider;
  purpose: 'sign-in';
  verifier: string;
  nonce: string;
}
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function consentPage(details: ConsentDescription, handle: string): string {
  const descriptions: Record<string, string> = {
    'kiln:use':
      'Create, inspect, edit, save, download and delete your Kiln assets within your quota.',
    offline_access: 'Keep this connection working without signing in again for up to 30 days.',
  };
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Connect to Kiln</title><main><h1>Connect ${escapeHtml(details.clientName)} to Kiln</h1>
<p>${details.clientDomain ? `Client domain: <strong>${escapeHtml(details.clientDomain)}</strong>.` : 'This client registered its own name; that name is not verified.'}</p>
<p>Access will be returned to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p>This connects an app on your computer. Continue only if you started that connection.</p>' : ''}
<ul>${details.scope.map((scope) => `<li>${escapeHtml(descriptions[scope] ?? scope)}</li>`).join('')}</ul>
<p>Hosted access is free within your quota. Sign in to keep saved assets private. Kiln requests no GitHub repository access or Google Drive access.</p>
<p>Use the same sign-in method when returning to your library.</p>
<form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(handle)}">
<button name="decision" value="google">Continue with Google</button>
<button name="decision" value="github">Continue with GitHub</button>
<button name="decision" value="deny">Cancel</button></form></main></html>`;
}

async function upstreamJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new HttpFailure(502, 'Sign-in provider unavailable; restart sign-in');
  }
  const value: unknown = JSON.parse(
    new TextDecoder().decode(await readBounded(response.body, 32_768)),
  );
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpFailure(502, 'Invalid sign-in response');
  return value as Record<string, unknown>;
}

async function githubIdentity(
  code: string,
  verifier: string,
  origin: string,
  env: SignInEnv,
): Promise<VerifiedIdentity> {
  const token = await upstreamJson('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      redirect_uri: `${origin}/oauth/github/callback`,
    }),
  });
  if (
    typeof token.access_token !== 'string' ||
    !token.access_token ||
    token.access_token.length > 4096 ||
    typeof token.token_type !== 'string' ||
    token.token_type.toLowerCase() !== 'bearer'
  ) {
    throw new HttpFailure(400, 'Sign-in failed; restart sign-in');
  }
  const user = await upstreamJson('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token.access_token}`,
      'user-agent': 'Kiln-Instrukt-Labs',
      'x-github-api-version': '2026-03-10',
    },
  });
  if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new HttpFailure(502, 'Invalid sign-in identity');
  }
  // Immutable provider id, never a mutable login or email. Upstream tokens are
  // discarded here; the account directory owns the provider-neutral subject.
  return { issuer: IDENTITY_ISSUERS.github, subject: String(user.id) };
}

export async function authorize(
  request: Request,
  oauth: OAuthHelpers,
  origin: string,
  env: SignInEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const intents = new D1LoginIntents(env.ACCOUNTS, origin);
  if (url.pathname === '/authorize' && request.method === 'GET') {
    const auth = await oauth.parseAuthRequest(request);
    if (
      url.searchParams.getAll('resource').length !== 1 ||
      !url.searchParams.get('resource') ||
      auth.codeChallengeMethod !== 'S256' ||
      !auth.codeChallenge ||
      auth.scope.length === 0 ||
      auth.scope.some((scope) => !SCOPES.includes(scope))
    ) {
      throw new HttpFailure(
        400,
        'Request requires a Kiln resource, S256 PKCE and supported scopes',
      );
    }
    const details = await oauth.describeConsent(auth);
    const consent = await oauth.beginConsent(auth);
    consent.headers.set('content-type', 'text/html; charset=utf-8');
    consent.headers.set(
      'content-security-policy',
      "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    return new Response(consentPage(details, consent.handle), { headers: consent.headers });
  }
  if (url.pathname === '/authorize' && request.method === 'POST') {
    if (request.headers.get('origin') !== origin) throw new HttpFailure(403, 'Invalid form origin');
    if (
      request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded'
    ) {
      throw new HttpFailure(415, 'Expected form data');
    }
    const form = await request.formData();
    if (form.getAll('handle').length !== 1 || form.getAll('decision').length !== 1)
      throw new HttpFailure(400, 'Invalid sign-in form');
    const handle = String(form.get('handle') ?? '');
    const decision = form.get('decision');
    if (decision === 'deny') {
      const result = await oauth.denyConsent(request, handle);
      await intents.claimConsent(handle);
      return new Response(null, { status: 302, headers: result.headers });
    }
    if (decision !== 'google' && decision !== 'github')
      throw new HttpFailure(400, 'Choose how to connect');
    const approved = await oauth.approveConsent(request, handle);
    await intents.claimConsent(handle);
    const verifier = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const data: SignInTransaction = {
      intentId: crypto.randomUUID(),
      provider: decision,
      purpose: 'sign-in',
      verifier,
      nonce: crypto.randomUUID().replace(/-/g, ''),
    };
    const upstream = await oauth.beginUpstream(approved.request, {
      data,
      headers: approved.headers,
    });
    await intents.create({
      id: data.intentId,
      state: upstream.state,
      provider: data.provider,
      purpose: data.purpose,
    });
    if (decision === 'google') {
      upstream.headers.set(
        'location',
        await googleAuthorizationUrl(
          origin,
          { state: upstream.state, verifier, nonce: data.nonce },
          env,
          request.signal,
        ),
      );
      return new Response(null, { status: 302, headers: upstream.headers });
    }
    const target = new URL('https://github.com/login/oauth/authorize');
    target.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${origin}/oauth/github/callback`,
      scope: '',
      state: upstream.state,
      code_challenge: await sha256(verifier),
      code_challenge_method: 'S256',
    }).toString();
    upstream.headers.set('location', target.href);
    return new Response(null, { status: 302, headers: upstream.headers });
  }
  const callbackProvider =
    url.pathname === '/oauth/google/callback'
      ? 'google'
      : url.pathname === '/oauth/github/callback'
        ? 'github'
        : null;
  if (callbackProvider && request.method === 'GET') {
    if (url.searchParams.getAll('state').length !== 1)
      throw new HttpFailure(400, 'Invalid sign-in state');
    const resumed = await oauth.finishUpstream<SignInTransaction>(request);
    if (
      !resumed.data ||
      resumed.data.provider !== callbackProvider ||
      resumed.data.purpose !== 'sign-in'
    )
      throw new HttpFailure(400, 'Invalid sign-in provider');
    const state = url.searchParams.get('state') ?? '';
    // The library validates this state against its browser-bound transaction;
    // D1 additionally compares its server-retained hash and atomically consumes it.
    await intents.consume({
      id: resumed.data.intentId,
      state,
      provider: callbackProvider,
      purpose: resumed.data.purpose,
    });
    if (url.searchParams.has('error')) {
      resumed.headers.set('location', authorizationErrorRedirect(resumed.request, 'access_denied'));
      return new Response(null, { status: 302, headers: resumed.headers });
    }
    const code = url.searchParams.get('code');
    if (!code || code.length > 1024 || url.searchParams.getAll('code').length !== 1)
      throw new HttpFailure(400, 'Missing sign-in code');
    const identity =
      callbackProvider === 'google'
        ? await googleIdentity(
            request,
            origin,
            { state, verifier: resumed.data.verifier, nonce: resumed.data.nonce },
            env,
          )
        : await githubIdentity(code, resumed.data.verifier, origin, env);
    const account = await new D1AccountDirectory(env.ACCOUNTS).resolveIdentity(identity);
    const userId = account.id;
    const { redirectTo } = await oauth.completeAuthorization({
      request: resumed.request,
      userId,
      metadata: {},
      scope: resumed.request.scope,
      props: { userId, accountEpoch: account.authorizationEpoch },
    });
    resumed.headers.set('location', redirectTo);
    return new Response(null, { status: 302, headers: resumed.headers });
  }
  return new Response('Method not allowed', { status: 405 });
}

export function authorizationFailure(error: unknown): Response {
  // Never echo provider response bodies, URLs, request headers or exceptions.
  if (error instanceof AuthorizationError)
    return new Response('Invalid or expired authorization request; restart sign-in', {
      status: 400,
    });
  if (error instanceof HttpFailure) return new Response(error.message, { status: error.status });
  return new Response('Service temporarily unavailable', { status: 503 });
}
