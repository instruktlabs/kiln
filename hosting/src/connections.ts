import type {
  AuthRequest,
  ConsentDescription,
  GrantType,
} from '@cloudflare/workers-oauth-provider';
import type { KilnAccount, VerifiedIdentity } from './accounts';
import type { BrowserSession } from './browser-sessions';
import { HttpFailure } from './http';

export interface ConnectionProps {
  userId: string;
  accountEpoch: number;
  connectionId: string;
}

export interface KilnConnection {
  id: string;
  clientName: string;
  clientDomain: string | null;
  redirectUri: string;
  scope: string;
  state: 'pending' | 'active' | 'revoked';
  createdAt: number;
  expiresAt: number;
}

function validProps(userId: unknown, props: unknown): props is ConnectionProps {
  if (
    typeof userId !== 'string' ||
    !/^ka_[a-f0-9]{32}$/.test(userId) ||
    !props ||
    typeof props !== 'object'
  )
    return false;
  const value = props as Record<string, unknown>;
  return (
    value.userId === userId &&
    Number.isSafeInteger(value.accountEpoch) &&
    Number(value.accountEpoch) > 0 &&
    typeof value.connectionId === 'string' &&
    /^kc_[a-f0-9]{32}$/.test(value.connectionId)
  );
}

const activeAccount = `EXISTS (SELECT 1 FROM kiln_accounts a
  WHERE a.id=kiln_connections.account_id AND a.state='active'
    AND a.authorization_epoch=kiln_connections.account_epoch)`;

/** This primary SQL authority complements, and never replaces, library token validation. */
export class D1Connections {
  constructor(private readonly database: D1Database) {}

  async create(
    account: KilnAccount,
    request: AuthRequest,
    details: ConsentDescription,
  ): Promise<ConnectionProps> {
    const connectionId = `kc_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = Date.now();
    const session = this.database.withSession('first-primary');
    const rows = await session.batch([
      session
        .prepare(`DELETE FROM kiln_connections WHERE id IN (
        SELECT id FROM kiln_connections WHERE expires_at<=? OR (state='pending' AND created_at<=?) LIMIT 128
      )`)
        .bind(now, now - 600_000),
      session
        .prepare(`INSERT INTO kiln_connections
        (id, account_id, account_epoch, client_id, client_name, client_domain, redirect_uri, scope, created_at, expires_at)
        SELECT ?, id, authorization_epoch, ?, ?, ?, ?, ?, ?, ? FROM kiln_accounts
        WHERE id=? AND state='active' AND authorization_epoch=? AND
          (SELECT COUNT(*) FROM kiln_connections WHERE account_id=? AND account_epoch=?
           AND state IN ('pending','active') AND expires_at>?)<32 RETURNING id`)
        .bind(
          connectionId,
          request.clientId,
          details.clientName,
          details.clientDomain ?? null,
          request.redirectUri,
          request.scope.join(' '),
          now,
          now + 30 * 86_400_000,
          account.id,
          account.authorizationEpoch,
          account.id,
          account.authorizationEpoch,
          now,
        ),
    ]);
    if (rows[1]?.results.length !== 1)
      throw new HttpFailure(
        429,
        'Cannot add a connection; sign in again or disconnect an unused app',
      );
    return { userId: account.id, accountEpoch: account.authorizationEpoch, connectionId };
  }

  async cancelPending(props: ConnectionProps): Promise<void> {
    await this.database
      .withSession('first-primary')
      .prepare(
        "DELETE FROM kiln_connections WHERE id=? AND account_id=? AND account_epoch=? AND state='pending'",
      )
      .bind(props.connectionId, props.userId, props.accountEpoch)
      .run();
  }

  /** Claim authorization-code exchange once, before the library writes any token. */
  async exchange(
    userId: string,
    props: unknown,
    clientId: string,
    grantId: string,
    kind: GrantType,
  ): Promise<boolean> {
    if (!validProps(userId, props) || !/^[A-Za-z0-9_-]{1,255}$/.test(grantId)) return false;
    const now = Date.now();
    const session = this.database.withSession('first-primary');
    const predicate = `id=? AND account_id=? AND account_epoch=? AND client_id=? AND expires_at>? AND ${activeAccount}`;
    if (kind === 'authorization_code') {
      const row = await session
        .prepare(`UPDATE kiln_connections SET state='active', grant_id=?
        WHERE ${predicate} AND state='pending' AND grant_id IS NULL AND created_at>?
        RETURNING id`)
        .bind(grantId, props.connectionId, userId, props.accountEpoch, clientId, now, now - 600_000)
        .first();
      return row !== null;
    }
    const row = await session
      .prepare(`SELECT id FROM kiln_connections WHERE ${predicate}
      AND state='active' AND grant_id=?`)
      .bind(props.connectionId, userId, props.accountEpoch, clientId, now, grantId)
      .first();
    return row !== null;
  }

  async accepts(userId: string, props: unknown, clientId: string): Promise<boolean> {
    if (!validProps(userId, props)) return false;
    const row = await this.database
      .withSession('first-primary')
      .prepare(
        `SELECT id FROM kiln_connections WHERE id=? AND account_id=? AND account_epoch=? AND client_id=?
        AND state='active' AND grant_id IS NOT NULL AND expires_at>? AND ${activeAccount}`,
      )
      .bind(props.connectionId, userId, props.accountEpoch, clientId, Date.now())
      .first();
    return row !== null;
  }

  async list(accountId: string, epoch: number): Promise<KilnConnection[]> {
    const now = Date.now();
    const rows = await this.database
      .withSession('first-primary')
      .prepare(
        `SELECT id, client_name AS clientName, client_domain AS clientDomain, redirect_uri AS redirectUri,
       scope, state, created_at AS createdAt, expires_at AS expiresAt FROM kiln_connections
       WHERE account_id=? AND account_epoch=? AND state IN ('pending','active') AND expires_at>?
         AND (state='active' OR created_at>?) AND ${activeAccount}
       ORDER BY created_at DESC, id LIMIT 32`,
      )
      .bind(accountId, epoch, now, now - 600_000)
      .all<KilnConnection>();
    return rows.results;
  }

  /** Only a consumed action and a newly verified, already-linked identity reach this method. */
  async revoke(
    proof: BrowserSession,
    identity: VerifiedIdentity,
    connectionId: string,
  ): Promise<string | null> {
    const now = Date.now();
    const row = await this.database
      .withSession('first-primary')
      .prepare(
        `UPDATE kiln_connections SET state='revoked' WHERE id=? AND account_id=? AND account_epoch=?
       AND state IN ('pending','active') AND expires_at>? AND ${activeAccount}
       AND EXISTS (SELECT 1 FROM kiln_browser_sessions s WHERE s.token_hash=? AND s.account_id=kiln_connections.account_id
         AND s.account_epoch=kiln_connections.account_epoch AND s.expires_at>? AND s.idle_expires_at>?)
       AND EXISTS (SELECT 1 FROM kiln_identities i WHERE i.account_id=kiln_connections.account_id AND i.issuer=? AND i.subject=?)
       RETURNING grant_id AS grantId`,
      )
      .bind(
        connectionId,
        proof.accountId,
        proof.accountEpoch,
        now,
        proof.binding,
        now,
        now,
        identity.issuer,
        identity.subject,
      )
      .first<{ grantId: string | null }>();
    if (!row)
      throw new HttpFailure(
        403,
        'Could not verify this account action; return to your account and try again',
      );
    return row.grantId;
  }
}
