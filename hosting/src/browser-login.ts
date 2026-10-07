import type { SignInEnv } from './auth';
import { BROWSER_COOKIE_ATTRIBUTES, browserToken, randomBrowserToken } from './browser-cookies';
import { D1BrowserSessions } from './browser-sessions';
import { githubAuthorizationUrl, githubIdentity } from './github';
import { googleAuthorizationUrl, googleIdentity } from './google';
import { HttpFailure, sha256 } from './http';
import type { SignInProvider } from './login-intents';
import { validLoginReturn } from './download-path';

const COOKIE = '__Host-kiln-login';
const invalid = () => new HttpFailure(400, 'Invalid or expired sign-in; restart sign-in');
const hash = (origin: string, kind: 'binding' | 'state', value: string) =>
  sha256(JSON.stringify(['kiln-browser-login-v1', origin, kind, value]));
const clearCookie = `${COOKIE}=; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=0`;

export async function beginBrowserLogin(
  request: Request,
  origin: string,
  env: SignInEnv,
): Promise<Response> {
  if (request.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  if (request.headers.get('origin') !== origin) throw new HttpFailure(403, 'Invalid sign-in form');
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
    throw new HttpFailure(415, 'Expected form data');
  if (new URL(request.url).search) throw invalid();
  const form = await request.formData();
  const provider = form.get('provider');
  const returnTo = form.get('returnTo') ?? '/account';
  if (
    form.getAll('provider').length !== 1 ||
    form.getAll('returnTo').length > 1 ||
    !validLoginReturn(returnTo) ||
    [...form.keys()].some((key) => key !== 'provider' && key !== 'returnTo') ||
    (provider !== 'google' && provider !== 'github')
  )
    throw invalid();
  const flow = {
    state: `kb1_${randomBrowserToken()}`,
    verifier: randomBrowserToken(),
    nonce: randomBrowserToken(),
  };
  const binding = randomBrowserToken();
  const now = Date.now();
  const previous = browserToken(request, origin, COOKIE);
  const database = env.ACCOUNTS.withSession('first-primary');
  const results = await database.batch([
    database
      .prepare(`DELETE FROM kiln_browser_logins WHERE state_hash IN
      (SELECT state_hash FROM kiln_browser_logins WHERE expires_at<=? LIMIT 128)`)
      .bind(now),
    database
      .prepare('DELETE FROM kiln_browser_logins WHERE binding_hash=?')
      .bind(previous ? await hash(origin, 'binding', previous) : ''),
    database
      .prepare(`INSERT INTO kiln_browser_logins(state_hash, binding_hash, provider, verifier, nonce, expires_at, return_to)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM kiln_browser_logins)<4096 RETURNING state_hash`)
      .bind(
        await hash(origin, 'state', flow.state),
        await hash(origin, 'binding', binding),
        provider,
        flow.verifier,
        flow.nonce,
        now + 600_000,
        returnTo,
      ),
  ]);
  if (results[2]?.results.length !== 1)
    throw new HttpFailure(429, 'Sign-in is busy; please try again later');
  const target =
    provider === 'google'
      ? await googleAuthorizationUrl(origin, flow, env, request.signal)
      : await githubAuthorizationUrl(origin, flow.state, flow.verifier, env);
  return new Response(null, {
    status: 302,
    headers: {
      location: target,
      'set-cookie': `${COOKIE}=${binding}; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=600`,
    },
  });
}

/** A separate server-retained transaction; no synthetic MCP client or issuer. */
export async function finishBrowserLogin(
  request: Request,
  origin: string,
  env: SignInEnv,
  provider: SignInProvider,
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const binding = browserToken(request, origin, COOKIE);
  if (
    request.method !== 'GET' ||
    url.pathname !== `/oauth/${provider}/callback` ||
    url.searchParams.getAll('state').length !== 1 ||
    !/^kb1_[a-f0-9]{64}$/.test(state) ||
    !binding
  )
    throw invalid();
  const flow = await env.ACCOUNTS.withSession('first-primary')
    .prepare(
      `DELETE FROM kiln_browser_logins WHERE state_hash=? AND binding_hash=? AND provider=? AND expires_at>?
      RETURNING verifier, nonce, return_to AS returnTo`,
    )
    .bind(
      await hash(origin, 'state', state),
      await hash(origin, 'binding', binding),
      provider,
      Date.now(),
    )
    .first<{ verifier: string; nonce: string; returnTo: string }>();
  if (!flow || !validLoginReturn(flow.returnTo)) throw invalid();
  if (url.searchParams.has('error'))
    return new Response('Sign-in was cancelled. Return to the account page to try again.', {
      status: 400,
      headers: { 'set-cookie': clearCookie },
    });
  const code = url.searchParams.get('code');
  if (!code || code.length > 1024 || url.searchParams.getAll('code').length !== 1) throw invalid();
  const identity =
    provider === 'google'
      ? await googleIdentity(request, origin, { ...flow, state }, env)
      : await githubIdentity(code, flow.verifier, origin, env);
  const session = await new D1BrowserSessions(env.ACCOUNTS, origin).issue(identity, request);
  const headers = new Headers({ location: flow.returnTo });
  headers.append('set-cookie', clearCookie);
  headers.append('set-cookie', session.cookie);
  return new Response(null, { status: 303, headers });
}
