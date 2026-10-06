import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { IDENTITY_ISSUERS } from './accounts';
import type { SignInEnv } from './auth';
import { BROWSER_COOKIE_ATTRIBUTES, browserToken, randomBrowserToken } from './browser-cookies';
import { D1BrowserSessions, type BrowserSession } from './browser-sessions';
import { D1Connections } from './connections';
import { githubAuthorizationUrl, githubIdentity } from './github';
import { googleAuthorizationUrl, googleIdentity } from './google';
import { HttpFailure, sha256 } from './http';
import type { SignInProvider } from './login-intents';

const COOKIE = '__Host-kiln-action';
const invalid = () =>
  new HttpFailure(
    400,
    'Invalid or expired account confirmation; return to your account and try again',
  );
const denied = () =>
  new HttpFailure(403, 'Account action unavailable; return to your account and try again');
const hash = (origin: string, kind: 'state' | 'binding', value: string) =>
  sha256(JSON.stringify(['kiln-account-action-v1', origin, kind, value]));
const clearCookie = `${COOKIE}=; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=0`;

export async function beginAccountAction(
  request: Request,
  origin: string,
  env: SignInEnv,
): Promise<Response> {
  if (request.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  if (new URL(request.url).search || request.headers.get('origin') !== origin) throw denied();
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
    throw new HttpFailure(415, 'Expected form data');
  const form = await request.formData();
  const fields = ['csrf', 'action', 'connectionId', 'provider'];
  if (
    fields.some((key) => form.getAll(key).length !== 1) ||
    [...form.keys()].some((key) => !fields.includes(key))
  )
    throw denied();
  const provider = form.get('provider');
  const target = String(form.get('connectionId'));
  if (
    (provider !== 'google' && provider !== 'github') ||
    form.get('action') !== 'disconnect' ||
    !/^kc_[a-f0-9]{32}$/.test(target)
  )
    throw denied();
  const session = await new D1BrowserSessions(env.ACCOUNTS, origin).authorizeForm(
    request,
    String(form.get('csrf')),
  );
  const binding = randomBrowserToken();
  const flow = {
    state: `ka1_${randomBrowserToken()}`,
    verifier: randomBrowserToken(),
    nonce: randomBrowserToken(),
    selectAccount: true,
  };
  const now = Date.now();
  const previous = browserToken(request, origin, COOKIE);
  const database = env.ACCOUNTS.withSession('first-primary');
  const rows = await database.batch([
    database
      .prepare(`DELETE FROM kiln_account_actions WHERE state_hash IN
      (SELECT state_hash FROM kiln_account_actions WHERE expires_at<=? LIMIT 128)`)
      .bind(now),
    database
      .prepare('DELETE FROM kiln_account_actions WHERE binding_hash=?')
      .bind(previous ? await hash(origin, 'binding', previous) : ''),
    database
      .prepare(`INSERT INTO kiln_account_actions
      (state_hash,binding_hash,session_hash,account_id,account_epoch,provider,purpose,target,verifier,nonce,expires_at)
      SELECT ?,?,s.token_hash,s.account_id,s.account_epoch,?,'disconnect',?,?,?,? FROM kiln_browser_sessions s
      JOIN kiln_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.csrf=? AND s.account_epoch=?
        AND s.account_id=? AND a.state='active' AND a.authorization_epoch=s.account_epoch AND s.expires_at>? AND s.idle_expires_at>?
        AND EXISTS (SELECT 1 FROM kiln_identities i WHERE i.account_id=s.account_id AND i.issuer=?)
        AND EXISTS (SELECT 1 FROM kiln_connections c WHERE c.id=? AND c.account_id=s.account_id AND c.account_epoch=s.account_epoch
          AND c.state IN ('pending','active') AND c.expires_at>?)
        AND (SELECT COUNT(*) FROM kiln_account_actions WHERE account_id=s.account_id)<4
        AND (SELECT COUNT(*) FROM kiln_account_actions)<4096 RETURNING state_hash`)
      .bind(
        await hash(origin, 'state', flow.state),
        await hash(origin, 'binding', binding),
        provider,
        target,
        flow.verifier,
        flow.nonce,
        now + 600_000,
        session.binding,
        session.csrf,
        session.accountEpoch,
        session.accountId,
        now,
        now,
        IDENTITY_ISSUERS[provider],
        target,
        now,
      ),
  ]);
  if (rows[2]?.results.length !== 1) throw denied();
  const location =
    provider === 'google'
      ? await googleAuthorizationUrl(origin, flow, env, request.signal)
      : await githubAuthorizationUrl(origin, flow.state, flow.verifier, env, true);
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': `${COOKIE}=${binding}; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=600`,
    },
  });
}

export async function finishAccountAction(
  request: Request,
  origin: string,
  env: SignInEnv,
  provider: SignInProvider,
  oauth: OAuthHelpers,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const binding = browserToken(request, origin, COOKIE);
  if (
    request.method !== 'GET' ||
    url.pathname !== `/oauth/${provider}/callback` ||
    url.searchParams.getAll('state').length !== 1 ||
    !/^ka1_[a-f0-9]{64}$/.test(state) ||
    !binding
  )
    throw invalid();
  const sessions = new D1BrowserSessions(env.ACCOUNTS, origin);
  let session: BrowserSession;
  try {
    session = await sessions.read(request);
  } catch (error) {
    if (error instanceof HttpFailure && error.status === 401) throw invalid();
    throw error;
  }
  const now = Date.now();
  const flow = await env.ACCOUNTS.withSession('first-primary')
    .prepare(
      `DELETE FROM kiln_account_actions WHERE state_hash=? AND binding_hash=? AND provider=? AND purpose='disconnect'
     AND session_hash=? AND account_id=? AND account_epoch=? AND expires_at>?
     AND EXISTS (SELECT 1 FROM kiln_accounts a WHERE a.id=kiln_account_actions.account_id AND a.state='active' AND a.authorization_epoch=kiln_account_actions.account_epoch)
     RETURNING target,verifier,nonce`,
    )
    .bind(
      await hash(origin, 'state', state),
      await hash(origin, 'binding', binding),
      provider,
      session.binding,
      session.accountId,
      session.accountEpoch,
      now,
    )
    .first<{ target: string; verifier: string; nonce: string }>();
  if (!flow) throw invalid();
  if (url.searchParams.has('error'))
    return new Response('Confirmation was cancelled. Return to your account to try again.', {
      status: 400,
      headers: { 'set-cookie': clearCookie },
    });
  const code = url.searchParams.get('code');
  if (!code || code.length > 1024 || url.searchParams.getAll('code').length !== 1) throw invalid();
  const identity =
    provider === 'google'
      ? await googleIdentity(request, origin, { ...flow, state }, env)
      : await githubIdentity(code, flow.verifier, origin, env);
  const grantId = await new D1Connections(env.ACCOUNTS).revoke(session, identity, flow.target);
  // The primary deny is already committed. KV cleanup is supplemental and may
  // propagate later; failure cannot re-enable a connection, and records have TTLs.
  if (grantId) ctx.waitUntil(oauth.revokeGrant(grantId, session.accountId).catch(() => {}));
  const renewed = await sessions.renew(identity, session, request);
  const headers = new Headers({ location: '/account' });
  headers.append('set-cookie', clearCookie);
  headers.append('set-cookie', renewed.cookie);
  return new Response(null, { status: 303, headers });
}
