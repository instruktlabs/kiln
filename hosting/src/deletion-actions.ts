import { IDENTITY_ISSUERS } from './accounts';
import { D1AccountDeletions } from './account-deletions';
import { deletionStatusPage } from './account-page';
import type { SignInEnv } from './auth';
import { BROWSER_COOKIE_ATTRIBUTES, browserToken, randomBrowserToken } from './browser-cookies';
import {
  D1BrowserSessions,
  clearBrowserSessionCookie,
  type BrowserSession,
} from './browser-sessions';
import { githubAuthorizationUrl, githubIdentity } from './github';
import { googleAuthorizationUrl, googleIdentity } from './google';
import { HttpFailure, sha256 } from './http';
import type { SignInProvider } from './login-intents';

const COOKIE = '__Host-kiln-delete';
const RECEIPT_COOKIE = '__Host-kiln-deletion-receipt';
const clearCookie = `${COOKIE}=; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=0`;
const denied = () => new HttpFailure(403, 'Account deletion could not be confirmed');
const invalid = () =>
  new HttpFailure(
    400,
    'Invalid or expired deletion confirmation; return to your account to start again',
  );
const hash = (origin: string, kind: 'state' | 'binding', value: string) =>
  sha256(JSON.stringify(['kiln-delete-action-v1', origin, kind, value]));

export async function beginDeletionAction(
  request: Request,
  origin: string,
  env: SignInEnv,
): Promise<Response> {
  if (request.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  if (new URL(request.url).search || request.headers.get('origin') !== origin) throw denied();
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
    throw new HttpFailure(415, 'Expected form data');
  const form = await request.formData(),
    fields = ['csrf', 'provider', 'confirmation'];
  if (
    fields.some((field) => form.getAll(field).length !== 1) ||
    [...form.keys()].some((field) => !fields.includes(field))
  )
    throw denied();
  const provider = form.get('provider');
  if (
    (provider !== 'google' && provider !== 'github') ||
    form.get('confirmation') !== 'delete-my-account'
  )
    throw denied();
  const proof = await new D1BrowserSessions(env.ACCOUNTS, origin).authorizeForm(
    request,
    String(form.get('csrf')),
  );
  const flow = {
    state: `kd1_${randomBrowserToken()}`,
    verifier: randomBrowserToken(),
    nonce: randomBrowserToken(),
    selectAccount: true,
  };
  const binding = randomBrowserToken(),
    now = Date.now();
  const previous = browserToken(request, origin, COOKIE);
  const database = env.ACCOUNTS.withSession('first-primary');
  const rows = await database.batch([
    database
      .prepare(`DELETE FROM kiln_deletion_actions WHERE state_hash IN
      (SELECT state_hash FROM kiln_deletion_actions WHERE expires_at<=? LIMIT 128)`)
      .bind(now),
    database
      .prepare('DELETE FROM kiln_deletion_actions WHERE binding_hash=?')
      .bind(previous ? await hash(origin, 'binding', previous) : ''),
    database
      .prepare(`INSERT INTO kiln_deletion_actions
      (state_hash,binding_hash,session_hash,account_id,account_epoch,provider,verifier,nonce,expires_at)
      SELECT ?,?,s.token_hash,s.account_id,s.account_epoch,?,?,?,? FROM kiln_browser_sessions s
      JOIN kiln_accounts a ON a.id=s.account_id
      WHERE s.token_hash=? AND s.account_id=? AND s.account_epoch=? AND s.csrf=?
        AND s.expires_at>? AND s.idle_expires_at>? AND a.state='active' AND a.authorization_epoch=s.account_epoch
        AND EXISTS (SELECT 1 FROM kiln_identities i WHERE i.account_id=a.id AND i.issuer=?)
        AND (SELECT COUNT(*) FROM kiln_deletion_actions WHERE account_id=a.id)<4
        AND (SELECT COUNT(*) FROM kiln_deletion_actions)<4096 RETURNING state_hash`)
      .bind(
        await hash(origin, 'state', flow.state),
        await hash(origin, 'binding', binding),
        provider,
        flow.verifier,
        flow.nonce,
        now + 300_000,
        proof.binding,
        proof.accountId,
        proof.accountEpoch,
        proof.csrf,
        now,
        now,
        IDENTITY_ISSUERS[provider],
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
      'set-cookie': `${COOKIE}=${binding}; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=300`,
    },
  });
}

export async function finishDeletionAction(
  request: Request,
  origin: string,
  env: SignInEnv,
  provider: SignInProvider,
): Promise<Response> {
  const url = new URL(request.url),
    state = url.searchParams.get('state') ?? '';
  const binding = browserToken(request, origin, COOKIE);
  if (
    request.method !== 'GET' ||
    url.pathname !== `/oauth/${provider}/callback` ||
    url.searchParams.getAll('state').length !== 1 ||
    !/^kd1_[a-f0-9]{64}(?![\s\S])/.test(state) ||
    !binding
  )
    throw invalid();
  let proof: BrowserSession;
  try {
    proof = await new D1BrowserSessions(env.ACCOUNTS, origin).read(request);
  } catch (error) {
    if (error instanceof HttpFailure && error.status === 401) throw invalid();
    throw error;
  }
  const flow = await env.ACCOUNTS.withSession('first-primary')
    .prepare(`DELETE FROM kiln_deletion_actions WHERE state_hash=? AND binding_hash=? AND provider=?
      AND session_hash=? AND account_id=? AND account_epoch=? AND expires_at>?
      AND EXISTS (SELECT 1 FROM kiln_accounts a WHERE a.id=kiln_deletion_actions.account_id
        AND a.state='active' AND a.authorization_epoch=kiln_deletion_actions.account_epoch)
      RETURNING verifier,nonce,expires_at AS expiresAt`)
    .bind(
      await hash(origin, 'state', state),
      await hash(origin, 'binding', binding),
      provider,
      proof.binding,
      proof.accountId,
      proof.accountEpoch,
      Date.now(),
    )
    .first<{ verifier: string; nonce: string; expiresAt: number }>();
  if (!flow) throw invalid();
  if (url.searchParams.has('error'))
    return new Response('Deletion was cancelled. Your account is unchanged.', {
      status: 400,
      headers: { 'set-cookie': clearCookie },
    });
  const code = url.searchParams.get('code');
  if (!code || code.length > 1024 || url.searchParams.getAll('code').length !== 1) throw invalid();
  const identity =
    provider === 'google'
      ? await googleIdentity(request, origin, { ...flow, state }, env)
      : await githubIdentity(code, flow.verifier, origin, env);
  if (Date.now() >= flow.expiresAt || identity.issuer !== IDENTITY_ISSUERS[provider])
    throw invalid();
  const receipt = randomBrowserToken();
  await new D1AccountDeletions(env.ACCOUNTS, origin).request(proof, identity, receipt);
  const headers = new Headers({ location: '/account/deletion' });
  headers.append('set-cookie', clearCookie);
  headers.append('set-cookie', clearBrowserSessionCookie);
  headers.append(
    'set-cookie',
    `${RECEIPT_COOKIE}=${receipt}; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=2592000`,
  );
  return new Response(null, { status: 303, headers });
}

export async function accountDeletionStatus(
  request: Request,
  database: D1Database,
  origin: string,
): Promise<Response> {
  if (new URL(request.url).search)
    throw new HttpFailure(400, 'Query parameters are not supported on deletion status');
  if (request.method !== 'GET')
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const receipt = browserToken(request, origin, RECEIPT_COOKIE);
  return deletionStatusPage(await new D1AccountDeletions(database, origin).status(receipt));
}
