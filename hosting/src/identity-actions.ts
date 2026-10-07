import { IDENTITY_ISSUERS, type VerifiedIdentity } from './accounts';
import type { SignInEnv } from './auth';
import { BROWSER_COOKIE_ATTRIBUTES, browserToken, randomBrowserToken } from './browser-cookies';
import {
  clearBrowserSessionCookie,
  D1BrowserSessions,
  type BrowserSession,
} from './browser-sessions';
import { accountNoticePage } from './account-page';
import { githubAuthorizationUrl, githubIdentity } from './github';
import { googleAuthorizationUrl, googleIdentity } from './google';
import { HttpFailure, sha256 } from './http';
import type { SignInProvider } from './login-intents';

const COOKIE = '__Host-kiln-identity';
const clearCookie = `${COOKIE}=; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=0`;
const denied = () =>
  new HttpFailure(403, 'Sign-in method change unavailable; return to your account and try again');
const invalid = () =>
  new HttpFailure(
    400,
    'Invalid or expired sign-in confirmation; return to your account and try again',
  );
const isProvider = (value: unknown): value is SignInProvider =>
  value === 'google' || value === 'github';
const hash = (origin: string, kind: 'state' | 'binding', value: string) =>
  sha256(JSON.stringify(['kiln-identity-action-v1', origin, kind, value]));
interface Flow {
  purpose: 'link' | 'unlink';
  phase: 'confirm' | 'target';
  provider: SignInProvider;
  target: SignInProvider;
  confirmer: SignInProvider;
  confirmedSubject: string | null;
  confirmedAt: number | null;
  expiresAt: number;
  verifier: string;
  nonce: string;
}
const currentSession = `s.token_hash=? AND s.account_id=? AND s.account_epoch=?
  AND s.expires_at>? AND s.idle_expires_at>? AND a.state='active'
  AND a.authorization_epoch=s.account_epoch`;
const proofArgs = (proof: BrowserSession, now: number) => [
  proof.binding,
  proof.accountId,
  proof.accountEpoch,
  now,
  now,
];

/** Every phase is purpose-bound, browser-bound and consumed before provider I/O. */
async function redirect(
  request: Request,
  origin: string,
  env: SignInEnv,
  proof: BrowserSession,
  flow: Pick<
    Flow,
    'purpose' | 'phase' | 'provider' | 'target' | 'confirmer' | 'confirmedSubject' | 'confirmedAt'
  >,
): Promise<Response> {
  const state = `ki1_${randomBrowserToken()}`,
    binding = randomBrowserToken();
  const verifier = randomBrowserToken(),
    nonce = randomBrowserToken(),
    now = Date.now();
  const previous = browserToken(request, origin, COOKIE);
  const database = env.ACCOUNTS.withSession('first-primary');
  const rows = await database.batch([
    database
      .prepare(`DELETE FROM kiln_identity_actions WHERE state_hash IN
      (SELECT state_hash FROM kiln_identity_actions WHERE expires_at<=? LIMIT 128)`)
      .bind(now),
    database
      .prepare('DELETE FROM kiln_identity_actions WHERE binding_hash=?')
      .bind(previous ? await hash(origin, 'binding', previous) : ''),
    database
      .prepare(`INSERT INTO kiln_identity_actions
      (state_hash,binding_hash,session_hash,account_id,account_epoch,purpose,phase,provider,target,confirmer,
       confirmed_subject,confirmed_at,verifier,nonce,expires_at)
      SELECT ?,?,s.token_hash,s.account_id,s.account_epoch,?,?,?,?,?,?,?,?,?,? FROM kiln_browser_sessions s
      JOIN kiln_accounts a ON a.id=s.account_id WHERE ${currentSession}
        AND EXISTS (SELECT 1 FROM kiln_identities i WHERE i.account_id=s.account_id AND i.issuer=?
          AND (? IS NULL OR i.subject=?))
        AND (SELECT COUNT(*) FROM kiln_identities i WHERE i.account_id=s.account_id AND i.issuer=?)=?
        AND (SELECT COUNT(*) FROM kiln_identity_actions WHERE account_id=s.account_id)<4
        AND (SELECT COUNT(*) FROM kiln_identity_actions)<4096 RETURNING state_hash`)
      .bind(
        await hash(origin, 'state', state),
        await hash(origin, 'binding', binding),
        flow.purpose,
        flow.phase,
        flow.provider,
        flow.target,
        flow.confirmer,
        flow.confirmedSubject,
        flow.confirmedAt,
        verifier,
        nonce,
        now + 300_000,
        ...proofArgs(proof, now),
        IDENTITY_ISSUERS[flow.confirmer],
        flow.confirmedSubject,
        flow.confirmedSubject,
        IDENTITY_ISSUERS[flow.target],
        flow.purpose === 'link' ? 0 : 1,
      ),
  ]);
  if (rows[2]?.results.length !== 1) throw denied();
  const location =
    flow.provider === 'google'
      ? await googleAuthorizationUrl(
          origin,
          { state, verifier, nonce, selectAccount: true },
          env,
          request.signal,
        )
      : await githubAuthorizationUrl(origin, state, verifier, env, true);
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': `${COOKIE}=${binding}; ${BROWSER_COOKIE_ATTRIBUTES}; Max-Age=300`,
    },
  });
}

export async function beginIdentityAction(
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
    fields = ['csrf', 'action', 'provider', 'target'];
  if (
    fields.some((field) => form.getAll(field).length !== 1) ||
    [...form.keys()].some((field) => !fields.includes(field))
  )
    throw denied();
  const purpose = form.get('action'),
    provider = form.get('provider'),
    target = form.get('target');
  // Unlink proves control of the method that will remain, never the one removed.
  if (
    (purpose !== 'link' && purpose !== 'unlink') ||
    !isProvider(provider) ||
    !isProvider(target) ||
    provider === target
  )
    throw denied();
  const proof = await new D1BrowserSessions(env.ACCOUNTS, origin).authorizeForm(
    request,
    String(form.get('csrf')),
  );
  return redirect(request, origin, env, proof, {
    purpose,
    provider,
    target,
    phase: 'confirm',
    confirmer: provider,
    confirmedSubject: null,
    confirmedAt: null,
  });
}

/** Called only with a consumed confirmation and freshly validated provider response. */
async function changeIdentity(
  env: SignInEnv,
  proof: BrowserSession,
  flow: Flow,
  confirmed: VerifiedIdentity,
  target: VerifiedIdentity,
) {
  const now = Date.now();
  if (
    now >= flow.expiresAt ||
    (flow.phase === 'target' &&
      (!flow.confirmedAt || now - flow.confirmedAt > 300_000 || flow.confirmedAt > now))
  )
    throw invalid();
  const database = env.ACCOUNTS.withSession('first-primary');
  const authorized = `EXISTS (SELECT 1 FROM kiln_browser_sessions s JOIN kiln_accounts a ON a.id=s.account_id
    WHERE ${currentSession} AND EXISTS (SELECT 1 FROM kiln_identities i WHERE i.account_id=s.account_id AND i.issuer=? AND i.subject=?))`;
  const args = [...proofArgs(proof, now), confirmed.issuer, confirmed.subject];
  const mutation =
    flow.purpose === 'link'
      ? database
          .prepare(`INSERT INTO kiln_identities (issuer,subject,account_id,created_at)
        SELECT ?,?,?,? WHERE ${authorized}
          AND NOT EXISTS (SELECT 1 FROM kiln_identities WHERE issuer=? AND (subject=? OR account_id=?))
        ON CONFLICT DO NOTHING`)
          .bind(
            target.issuer,
            target.subject,
            proof.accountId,
            now,
            ...args,
            target.issuer,
            target.subject,
            proof.accountId,
          )
      : database
          .prepare(`DELETE FROM kiln_identities WHERE account_id=? AND issuer=? AND ${authorized}
        AND (SELECT COUNT(*) FROM kiln_identities WHERE account_id=?)>1`)
          .bind(proof.accountId, target.issuer, ...args, proof.accountId);
  // Each of the next three statements depends on exactly one preceding change.
  // D1 batch is a transaction: identity, notification record, epoch and session
  // revocation either commit together or all roll back. No external I/O in between.
  const result = await database.batch([
    mutation,
    database
      .prepare(`INSERT INTO kiln_account_events(id,account_id,kind,provider,created_at)
      SELECT ?,?,?,?,? WHERE changes()=1`)
      .bind(crypto.randomUUID(), proof.accountId, flow.purpose, flow.target, now),
    database
      .prepare(`UPDATE kiln_accounts SET authorization_epoch=authorization_epoch+1
      WHERE id=? AND authorization_epoch=? AND changes()=1 RETURNING id`)
      .bind(proof.accountId, proof.accountEpoch),
    database
      .prepare('DELETE FROM kiln_browser_sessions WHERE account_id=? AND changes()=1')
      .bind(proof.accountId),
    database
      .prepare(`DELETE FROM kiln_account_events WHERE id IN
      (SELECT id FROM kiln_account_events WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 20)`)
      .bind(proof.accountId),
  ]);
  if (result[2]?.results.length !== 1) throw denied();
}

export async function finishIdentityAction(
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
    !/^ki1_[a-f0-9]{64}$/.test(state) ||
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
    .prepare(`DELETE FROM kiln_identity_actions
    WHERE state_hash=? AND binding_hash=? AND provider=? AND session_hash=? AND account_id=? AND account_epoch=? AND expires_at>?
    AND EXISTS (SELECT 1 FROM kiln_accounts a WHERE a.id=kiln_identity_actions.account_id AND a.state='active'
      AND a.authorization_epoch=kiln_identity_actions.account_epoch)
    RETURNING purpose,phase,provider,target,confirmer,confirmed_subject AS confirmedSubject,confirmed_at AS confirmedAt,
      expires_at AS expiresAt,verifier,nonce`)
    .bind(
      await hash(origin, 'state', state),
      await hash(origin, 'binding', binding),
      provider,
      proof.binding,
      proof.accountId,
      proof.accountEpoch,
      Date.now(),
    )
    .first<Flow>();
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
  if (Date.now() >= flow.expiresAt) throw invalid();
  if (flow.phase === 'confirm' && flow.purpose === 'link')
    return redirect(request, origin, env, proof, {
      ...flow,
      phase: 'target',
      provider: flow.target,
      confirmedSubject: identity.subject,
      confirmedAt: Date.now(),
    });
  const confirmed =
    flow.phase === 'confirm'
      ? identity
      : {
          issuer: IDENTITY_ISSUERS[flow.confirmer],
          subject: flow.confirmedSubject ?? '',
        };
  if (
    confirmed.issuer !== IDENTITY_ISSUERS[flow.confirmer] ||
    (flow.phase === 'target' && (flow.purpose !== 'link' || provider !== flow.target))
  )
    throw invalid();
  await changeIdentity(
    env,
    proof,
    flow,
    confirmed,
    flow.purpose === 'link' ? identity : { issuer: IDENTITY_ISSUERS[flow.target], subject: '' },
  );
  const response = accountNoticePage(
    flow.purpose === 'link' ? 'Sign-in method added' : 'Sign-in method removed',
  );
  response.headers.append('set-cookie', clearCookie);
  response.headers.append('set-cookie', clearBrowserSessionCookie);
  return response;
}
