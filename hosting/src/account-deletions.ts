import { IDENTITY_ISSUERS, type VerifiedIdentity } from './accounts';
import type { BrowserSession } from './browser-sessions';
import { HttpFailure, sha256 } from './http';

type Phase = 'compute' | 'storage' | 'grants' | 'identity' | 'complete';
interface Claim {
  id: string;
  account_id: string;
  phase: Exclude<Phase, 'complete'>;
  lease_token: string;
  attempts: number;
}
export interface DeletionPorts {
  retireCompute(accountId: string): Promise<void>;
  retireStorage(accountId: string): Promise<boolean>;
  revokeGrants(accountId: string): Promise<boolean>;
}
const denied = () => new HttpFailure(403, 'Account deletion could not be confirmed');
const RECEIPT_LIFETIME = 7 * 86400_000;

/** Primary revocation plus a durable, leased outbox. No caller supplies a job ID. */
export class D1AccountDeletions {
  constructor(
    private readonly database: D1Database,
    private readonly origin: string,
    private readonly ports?: DeletionPorts,
    private readonly now: () => number = Date.now,
  ) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin)
      throw new Error('Invalid deletion origin');
  }

  private hash(receipt: string) {
    return sha256(JSON.stringify(['kiln-deletion-receipt-v1', this.origin, receipt]));
  }

  /** Call only after consuming a purpose-bound flow and verifying its provider. */
  async request(proof: BrowserSession, identity: VerifiedIdentity, receipt: string) {
    if (
      !proof ||
      !identity ||
      typeof receipt !== 'string' ||
      !/^[a-f0-9]{64}(?![\s\S])/.test(receipt) ||
      typeof proof.accountId !== 'string' ||
      !/^ka_[a-f0-9]{32}(?![\s\S])/.test(proof.accountId) ||
      !Number.isSafeInteger(proof.accountEpoch) ||
      proof.accountEpoch < 1 ||
      typeof proof.binding !== 'string' ||
      typeof proof.csrf !== 'string' ||
      !Object.values(IDENTITY_ISSUERS).some((issuer) => issuer === identity.issuer) ||
      typeof identity.subject !== 'string' ||
      !/^[\x21-\x7e]{1,255}(?![\s\S])/.test(identity.subject)
    )
      throw denied();
    const id = `kd_${crypto.randomUUID().replace(/-/g, '')}`,
      now = this.now();
    const database = this.database.withSession('first-primary');
    const result = await database.batch([
      database
        .prepare(`INSERT INTO kiln_deletions
        (id,account_id,receipt_hash,phase,created_at,updated_at,retry_at)
        SELECT ?,a.id,?,'compute',?,?,? FROM kiln_accounts a
        JOIN kiln_browser_sessions s ON s.account_id=a.id
        WHERE a.id=? AND a.state='active' AND a.authorization_epoch=?
          AND s.token_hash=? AND s.csrf=? AND s.account_epoch=a.authorization_epoch
          AND s.expires_at>? AND s.idle_expires_at>?
          AND EXISTS (SELECT 1 FROM kiln_identities i WHERE i.account_id=a.id AND i.issuer=? AND i.subject=?)
        ON CONFLICT(account_id) DO NOTHING RETURNING id`)
        .bind(
          id,
          await this.hash(receipt),
          now,
          now,
          now,
          proof.accountId,
          proof.accountEpoch,
          proof.binding,
          proof.csrf,
          now,
          now,
          identity.issuer,
          identity.subject,
        ),
      database
        .prepare(`UPDATE kiln_accounts SET state='deleting',authorization_epoch=authorization_epoch+1
        WHERE id=? AND state='active' AND changes()=1
          AND EXISTS (SELECT 1 FROM kiln_deletions WHERE id=? AND account_id=kiln_accounts.id) RETURNING id`)
        .bind(proof.accountId, id),
      database
        .prepare('DELETE FROM kiln_browser_sessions WHERE account_id=? AND changes()=1')
        .bind(proof.accountId),
      database
        .prepare(`UPDATE kiln_connections SET state='revoked' WHERE account_id=?
        AND EXISTS (SELECT 1 FROM kiln_deletions WHERE id=? AND account_id=kiln_connections.account_id)`)
        .bind(proof.accountId, id),
    ]);
    if (result[1]?.results.length !== 1) throw denied();
    return { id };
  }

  async status(receipt: unknown) {
    if (typeof receipt !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(receipt))
      throw new HttpFailure(404, 'Deletion receipt unavailable');
    const row = await this.database
      .withSession('first-primary')
      .prepare(`SELECT id,phase,created_at AS createdAt,completed_at AS completedAt
        FROM kiln_deletions WHERE receipt_hash=? AND (completed_at IS NULL OR completed_at>?)`)
      .bind(await this.hash(receipt), this.now() - RECEIPT_LIFETIME)
      .first<{ id: string; phase: Phase; createdAt: number; completedAt: number | null }>();
    if (!row) throw new HttpFailure(404, 'Deletion receipt unavailable');
    return {
      ...row,
      state: row.phase === 'complete' ? ('complete' as const) : ('pending' as const),
    };
  }

  private async claim(): Promise<Claim | null> {
    const now = this.now(),
      lease = crypto.randomUUID();
    return this.database
      .withSession('first-primary')
      .prepare(`UPDATE kiln_deletions SET lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?
        WHERE id=(SELECT d.id FROM kiln_deletions d JOIN kiln_accounts a ON a.id=d.account_id
          WHERE d.phase!='complete' AND d.retry_at<=? AND d.lease_until<=? AND a.state='deleting'
          ORDER BY d.retry_at,d.created_at,d.id LIMIT 1)
        RETURNING id,account_id,phase,lease_token,attempts`)
      .bind(lease, now + 60_000, now, now, now)
      .first<Claim>();
  }

  private async advance(claim: Claim, phase: Phase, retry = 0): Promise<void> {
    const now = this.now();
    await this.database
      .withSession('first-primary')
      .prepare(`UPDATE kiln_deletions SET attempts=CASE WHEN phase=? THEN attempts ELSE 0 END,
        phase=?,retry_at=?,updated_at=?,lease_token=NULL,lease_until=0
        WHERE id=? AND account_id=? AND phase=? AND lease_token=? AND lease_until>?
          AND EXISTS (SELECT 1 FROM kiln_accounts a WHERE a.id=kiln_deletions.account_id AND a.state='deleting')`)
      .bind(
        phase,
        phase,
        now + retry,
        now,
        claim.id,
        claim.account_id,
        claim.phase,
        claim.lease_token,
        now,
      )
      .run();
  }

  private async finish(claim: Claim): Promise<void> {
    const database = this.database.withSession('first-primary'),
      now = this.now();
    const authorized = `EXISTS (SELECT 1 FROM kiln_deletions d JOIN kiln_accounts a ON a.id=d.account_id
      WHERE d.id=? AND d.account_id=? AND d.phase='identity' AND d.lease_token=? AND d.lease_until>?
        AND a.state='deleting')`;
    const args = [claim.id, claim.account_id, claim.lease_token, now];
    await database.batch([
      ...[
        'kiln_browser_sessions',
        'kiln_connections',
        'kiln_account_events',
        'kiln_identities',
      ].map((table) =>
        database
          .prepare(`DELETE FROM ${table} WHERE account_id=? AND ${authorized}`)
          .bind(claim.account_id, ...args),
      ),
      database
        .prepare(`DELETE FROM kiln_accounts WHERE id=? AND ${authorized}`)
        .bind(claim.account_id, ...args),
      // The foreign key clears account_id in the same transaction. A failed
      // identity/account delete cannot leave a completed receipt behind.
      database
        .prepare(`UPDATE kiln_deletions SET phase='complete',completed_at=?,updated_at=?,
        lease_token=NULL,lease_until=0,retry_at=0 WHERE id=? AND account_id IS NULL
        AND phase='identity' AND lease_token=? AND changes()=1`)
        .bind(now, now, claim.id, claim.lease_token),
    ]);
  }

  /** Called by the trusted scheduled handler, with a bounded immediate attempt after confirmation. */
  async recover(): Promise<{ steps: number }> {
    if (!this.ports) throw new Error('Deletion recovery is not configured');
    await this.database
      .withSession('first-primary')
      .prepare(`DELETE FROM kiln_deletions WHERE id IN
      (SELECT id FROM kiln_deletions WHERE phase='complete' AND completed_at<=? LIMIT 128)`)
      .bind(this.now() - RECEIPT_LIFETIME)
      .run();
    const end = Date.now() + 25_000;
    let steps = 0;
    for (; steps < 4 && Date.now() < end; steps++) {
      const claim = await this.claim();
      if (!claim) break;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = async () => {
          if (claim.phase === 'compute') {
            await this.ports!.retireCompute(claim.account_id);
            return true;
          }
          if (claim.phase === 'storage') return this.ports!.retireStorage(claim.account_id);
          if (claim.phase === 'grants') return this.ports!.revokeGrants(claim.account_id);
          await this.finish(claim);
          return true;
        };
        const done = await Promise.race([
          work(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Deletion step deadline')),
              Math.max(1, Math.min(20_000, end - Date.now())),
            );
          }),
        ]);
        if (claim.phase !== 'identity') {
          const next = { compute: 'storage', storage: 'grants', grants: 'identity' } as const;
          await this.advance(claim, done ? next[claim.phase] : claim.phase, done ? 0 : 60_000);
        }
      } catch {
        // No exception text or provider data is retained. A late idempotent
        // cleanup cannot advance a replaced lease or reactivate an account.
        await this.advance(
          claim,
          claim.phase,
          Math.min(3600_000, 60_000 * 2 ** Math.min(claim.attempts - 1, 6)),
        );
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
    return { steps };
  }
}
