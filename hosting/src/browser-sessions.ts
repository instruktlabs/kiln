import { D1AccountDirectory, type KilnAccount, type VerifiedIdentity } from './accounts';
import { HttpFailure, sha256 } from './http';
import {
  BROWSER_COOKIE_ATTRIBUTES as cookieAttributes,
  browserToken,
  randomBrowserToken,
} from './browser-cookies';

const COOKIE = '__Host-kiln-session';
export const clearBrowserSessionCookie = `${COOKIE}=; ${cookieAttributes}; Max-Age=0`;
const LIFETIME_MS = 86_400_000;
const IDLE_MS = 1_800_000;
const denied = () => new HttpFailure(401, 'Sign in to continue');

export interface BrowserSession {
  /** Server-only session binding. Never render it or accept it as a credential. */
  binding: string;
  accountId: string;
  accountEpoch: number;
  authenticatedAt: number;
  expiresAt: number;
  csrf: string;
}

export class D1BrowserSessions {
  constructor(
    private readonly database: D1Database,
    private readonly origin: string,
  ) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin)
      throw new Error('Invalid browser-session origin');
  }

  /** Call only after a provider adapter has verified a fresh sign-in response. */
  async issue(identity: VerifiedIdentity, previousRequest?: Request) {
    const account = await new D1AccountDirectory(this.database).resolveIdentity(identity);
    return this.issueAccount(account, previousRequest);
  }

  async renew(identity: VerifiedIdentity, proof: BrowserSession, request: Request) {
    if ((await this.requestHash(request)) !== proof.binding) throw denied();
    const account = await new D1AccountDirectory(this.database).getAccount(proof.accountId);
    const binding = await this.database
      .withSession('first-primary')
      .prepare(
        'SELECT account_id FROM kiln_identities WHERE issuer=? AND subject=? AND account_id=?',
      )
      .bind(identity.issuer, identity.subject, proof.accountId)
      .first();
    if (
      account?.state !== 'active' ||
      account.authorizationEpoch !== proof.accountEpoch ||
      !binding
    )
      throw denied();
    return this.issueAccount(account, request);
  }

  private async issueAccount(account: KilnAccount, previousRequest?: Request) {
    const token = randomBrowserToken();
    const hash = await this.hash(token);
    const csrf = randomBrowserToken();
    const now = Date.now();
    let previousHash = '';
    if (previousRequest) {
      try {
        previousHash = await this.requestHash(previousRequest);
      } catch (error) {
        if (!(error instanceof HttpFailure) || error.status !== 401) throw error;
      }
    }
    const session = this.database.withSession('first-primary');
    const results = await session.batch([
      session
        .prepare(`DELETE FROM kiln_browser_sessions WHERE token_hash IN (
        SELECT token_hash FROM kiln_browser_sessions WHERE expires_at<=? LIMIT 128
      )`)
        .bind(now),
      session.prepare('DELETE FROM kiln_browser_sessions WHERE token_hash=?').bind(previousHash),
      session
        .prepare(`DELETE FROM kiln_browser_sessions WHERE token_hash IN (
        SELECT token_hash FROM kiln_browser_sessions WHERE account_id=?
        ORDER BY authenticated_at DESC, token_hash DESC LIMIT -1 OFFSET 7
      ) AND EXISTS (SELECT 1 FROM kiln_accounts WHERE id=? AND state='active'
        AND authorization_epoch=?)`)
        .bind(account.id, account.id, account.authorizationEpoch),
      session
        .prepare(`INSERT INTO kiln_browser_sessions
        (token_hash, account_id, account_epoch, authenticated_at, expires_at, idle_expires_at, csrf)
        SELECT ?, id, authorization_epoch, ?, ?, ?, ? FROM kiln_accounts
        WHERE id=? AND state='active' AND authorization_epoch=? RETURNING token_hash`)
        .bind(
          hash,
          now,
          now + LIFETIME_MS,
          now + IDLE_MS,
          csrf,
          account.id,
          account.authorizationEpoch,
        ),
    ]);
    if (results[3]?.results.length !== 1) throw denied();
    return {
      account,
      csrf,
      cookie: `${COOKIE}=${token}; ${cookieAttributes}; Max-Age=${LIFETIME_MS / 1000}`,
    };
  }

  async read(request: Request): Promise<BrowserSession> {
    return this.readCurrent(request, null);
  }

  async authorizeForm(request: Request, csrf: string): Promise<BrowserSession> {
    if (
      request.method !== 'POST' ||
      request.headers.get('origin') !== this.origin ||
      typeof csrf !== 'string' ||
      !/^[a-f0-9]{64}$/.test(csrf)
    )
      throw new HttpFailure(403, 'Invalid account form');
    return this.readCurrent(request, csrf);
  }

  private async readCurrent(request: Request, csrf: string | null): Promise<BrowserSession> {
    const hash = await this.requestHash(request);
    const now = Date.now();
    const session = await this.database
      .withSession('first-primary')
      .prepare(`UPDATE kiln_browser_sessions SET idle_expires_at=MIN(expires_at, ?)
        WHERE token_hash=? AND expires_at>? AND idle_expires_at>? AND (? IS NULL OR csrf=?)
        AND EXISTS (SELECT 1 FROM kiln_accounts a WHERE a.id=kiln_browser_sessions.account_id
          AND a.state='active' AND a.authorization_epoch=kiln_browser_sessions.account_epoch)
        RETURNING token_hash AS binding, account_id AS accountId, account_epoch AS accountEpoch,
          authenticated_at AS authenticatedAt, expires_at AS expiresAt, csrf`)
      .bind(now + IDLE_MS, hash, now, now, csrf, csrf)
      .first<BrowserSession>();
    if (!session) throw csrf === null ? denied() : new HttpFailure(403, 'Invalid account form');
    return session;
  }

  async logout(request: Request, csrf: string): Promise<string> {
    if (
      request.method !== 'POST' ||
      request.headers.get('origin') !== this.origin ||
      typeof csrf !== 'string' ||
      !/^[a-f0-9]{64}$/.test(csrf)
    )
      throw new HttpFailure(403, 'Invalid account form');
    const hash = await this.requestHash(request);
    const row = await this.database
      .withSession('first-primary')
      .prepare(`DELETE FROM kiln_browser_sessions WHERE token_hash=? AND csrf=?
        AND expires_at>? AND idle_expires_at>? AND EXISTS (SELECT 1 FROM kiln_accounts a
          WHERE a.id=kiln_browser_sessions.account_id AND a.state='active'
          AND a.authorization_epoch=kiln_browser_sessions.account_epoch)
        RETURNING token_hash`)
      .bind(hash, csrf, Date.now(), Date.now())
      .first();
    if (!row) throw new HttpFailure(403, 'Invalid account form');
    return clearBrowserSessionCookie;
  }

  private hash(token: string): Promise<string> {
    return sha256(JSON.stringify(['kiln-browser-session-v1', this.origin, token]));
  }

  private requestHash(request: Request): Promise<string> {
    const token = browserToken(request, this.origin, COOKIE);
    if (!token) throw denied();
    return this.hash(token);
  }
}
