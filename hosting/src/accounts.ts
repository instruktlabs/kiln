import { HttpFailure } from './http';

export const IDENTITY_ISSUERS = {
  google: 'https://accounts.google.com',
  github: 'https://github.com',
} as const;

/** Identity inputs may only come from a successfully verified provider adapter. */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
}

export interface KilnAccount {
  id: string;
  state: 'active' | 'disabled' | 'deleting';
  authorizationEpoch: number;
}

export interface AccountDirectory {
  /** Reuses a binding or atomically creates it; never links existing accounts. */
  resolveIdentity(identity: VerifiedIdentity): Promise<KilnAccount>;
  /** Reads current primary state, including disabled/deleting and revocation epoch. */
  getAccount(id: string): Promise<KilnAccount | null>;
}

/** A grant can outlive sign-in, but never the account's current authorization epoch. */
export async function isCurrentAccountGrant(
  database: D1Database,
  userId: unknown,
  props: unknown,
): Promise<boolean> {
  if (
    typeof userId !== 'string' ||
    !/^ka_[a-f0-9]{32}$/.test(userId) ||
    !props ||
    typeof props !== 'object'
  )
    return false;
  const grant = props as Record<string, unknown>;
  if (
    grant.userId !== userId ||
    !Number.isSafeInteger(grant.accountEpoch) ||
    Number(grant.accountEpoch) < 1
  )
    return false;
  const account = await new D1AccountDirectory(database).getAccount(userId);
  return account?.state === 'active' && account.authorizationEpoch === grant.accountEpoch;
}

const accountColumns = 'id, state, authorization_epoch AS authorizationEpoch';

export class D1AccountDirectory implements AccountDirectory {
  constructor(private readonly database: D1Database) {}

  async resolveIdentity(identity: VerifiedIdentity): Promise<KilnAccount> {
    if (
      !identity ||
      !Object.values(IDENTITY_ISSUERS).some((issuer) => issuer === identity.issuer) ||
      typeof identity.subject !== 'string' ||
      !/^[\x21-\x7e]{1,255}$/.test(identity.subject)
    ) {
      throw new HttpFailure(400, 'Invalid sign-in identity');
    }
    const { issuer, subject } = identity;
    const id = `ka_${crypto.randomUUID().replace(/-/g, '')}`;
    const created = Date.now();
    // A fresh primary-backed session per operation, never a client bookmark.
    const session = this.database.withSession('first-primary');
    // D1 batches are transactions. Registration cannot leave an orphan account
    // when binding fails, or allocate several owners under concurrent callbacks.
    const results = await session.batch<KilnAccount>([
      session
        .prepare(`INSERT INTO kiln_accounts (id, created_at)
          SELECT ?, ? WHERE NOT EXISTS (
            SELECT 1 FROM kiln_identities WHERE issuer=? AND subject=?
          )`)
        .bind(id, created, issuer, subject),
      session
        .prepare(`INSERT INTO kiln_identities (issuer, subject, account_id, created_at)
          SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM kiln_accounts WHERE id=?)
          ON CONFLICT (issuer, subject) DO NOTHING`)
        .bind(issuer, subject, id, created, id),
      session
        .prepare(`SELECT ${accountColumns} FROM kiln_accounts WHERE id=(
          SELECT account_id FROM kiln_identities WHERE issuer=? AND subject=?
        )`)
        .bind(issuer, subject),
    ]);
    const account = results[2]?.results[0];
    if (!account) throw new Error('Account registration failed');
    if (account.state !== 'active') throw new HttpFailure(403, 'Account unavailable');
    return account;
  }

  async getAccount(id: string): Promise<KilnAccount | null> {
    if (typeof id !== 'string' || !/^ka_[a-f0-9]{32}$/.test(id))
      throw new HttpFailure(400, 'Invalid account');
    return this.database
      .withSession('first-primary')
      .prepare(`SELECT ${accountColumns} FROM kiln_accounts WHERE id=?`)
      .bind(id)
      .first<KilnAccount>();
  }
}
