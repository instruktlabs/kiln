import { boundedRequest, HttpFailure, privateResponse, serviceFailure } from './http';
import { nativeRequestHeaders } from './request-job';

const MINUTE = 60_000;
const DAY = 86_400_000;
const RECOVERY_DELAY = 30_000;
const CLEANUP_DEADLINE = 15_000;

export interface ComputePolicy {
  maxConcurrent: number;
  tenantPerMinute: number;
  tenantPerDay: number;
  globalPerDay: number;
  globalPerMonth: number;
  deadlineMs: number;
}
export interface ComputePorts {
  run(id: string, tenant: string, request: Request, deadlineAt: number): Promise<Response>;
  cancel(id: string): Promise<void>;
}
type Active = {
  id: string;
  tenant: string;
  state: string;
  deadline_at: number;
  recover_at: number;
};
type Bucket = { owner: string; period: string; start: number; end: number; limit: number };

class QuotaFailure extends HttpFailure {
  constructor(readonly retryAfter: number) {
    super(429, 'Compute quota or capacity reached');
  }
}
export function admissionFailure(error: unknown): Response {
  const response = serviceFailure(error);
  if (error instanceof QuotaFailure) response.headers.set('retry-after', String(error.retryAfter));
  return privateResponse(response);
}

/** One global SQLite authority. Expiration starts cleanup; it never releases capacity. */
export class ComputeAdmission {
  private readonly sql: SqlStorage;
  private readonly closing = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly ports: ComputePorts,
    private readonly policy: ComputePolicy,
    private readonly now: () => number = Date.now,
  ) {
    for (const key of [
      'maxConcurrent',
      'tenantPerMinute',
      'tenantPerDay',
      'globalPerDay',
      'globalPerMonth',
      'deadlineMs',
    ] as const) {
      const value = policy[key];
      if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000)
        throw new Error('Invalid compute policy');
    }
    if (policy.maxConcurrent > 16 || policy.deadlineMs > 120_000)
      throw new Error('Invalid compute capacity');
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS compute_format (version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS compute_active (
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL UNIQUE, state TEXT NOT NULL,
        deadline_at INTEGER NOT NULL, recover_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS compute_recovery ON compute_active(recover_at);
      CREATE TABLE IF NOT EXISTS compute_usage (
        owner TEXT NOT NULL, period TEXT NOT NULL, window_start INTEGER NOT NULL,
        used INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(owner,period)
      );
      CREATE INDEX IF NOT EXISTS compute_expiry ON compute_usage(expires_at);
      CREATE TABLE IF NOT EXISTS compute_control (id INTEGER PRIMARY KEY, paused INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS compute_retired (tenant TEXT PRIMARY KEY NOT NULL);
      INSERT OR IGNORE INTO compute_control VALUES (1,0);
    `);
    const versions = this.sql
      .exec<{ version: number }>('SELECT version FROM compute_format')
      .toArray();
    if (!versions.length) this.sql.exec('INSERT INTO compute_format VALUES (1)');
    else if (versions.length !== 1 || versions[0]?.version !== 1)
      throw new Error('Unsupported compute format');
  }

  private active(id: string): Active | undefined {
    return this.sql.exec<Active>('SELECT * FROM compute_active WHERE id = ?', id).toArray()[0];
  }
  private paused(): boolean {
    return (
      this.sql.exec<{ paused: number }>('SELECT paused FROM compute_control WHERE id = 1').one()
        .paused !== 0
    );
  }
  private assertAvailable(tenant: string): void {
    if (this.sql.exec('SELECT 1 FROM compute_retired WHERE tenant=?', tenant).toArray().length)
      throw new HttpFailure(410, 'Account compute has been retired');
  }
  status(): {
    paused: boolean;
    activeRequests: number;
    pendingCleanup: number;
    maxConcurrent: number;
  } {
    const counts = this.sql
      .exec<{ total: number; closing: number }>(
        "SELECT COUNT(*) AS total, COALESCE(SUM(state = 'closing'),0) AS closing FROM compute_active",
      )
      .one();
    return {
      paused: this.paused(),
      activeRequests: counts.total,
      pendingCleanup: counts.closing,
      maxConcurrent: this.policy.maxConcurrent,
    };
  }
  private buckets(tenant: string, now: number): Bucket[] {
    const minute = Math.floor(now / MINUTE) * MINUTE;
    const day = Math.floor(now / DAY) * DAY;
    const date = new Date(now);
    const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    return [
      {
        owner: tenant,
        period: 'minute',
        start: minute,
        end: minute + MINUTE,
        limit: this.policy.tenantPerMinute,
      },
      { owner: tenant, period: 'day', start: day, end: day + DAY, limit: this.policy.tenantPerDay },
      {
        owner: 'global',
        period: 'day',
        start: day,
        end: day + DAY,
        limit: this.policy.globalPerDay,
      },
      {
        owner: 'global',
        period: 'month',
        start: month,
        end: nextMonth,
        limit: this.policy.globalPerMonth,
      },
    ];
  }

  // Call inside a storage transaction so records and their recovery alarm commit together.
  private async schedule(): Promise<void> {
    const active = this.sql
      .exec<{ at: number | null }>('SELECT MIN(recover_at) AS at FROM compute_active')
      .one().at;
    const expiry = this.sql
      .exec<{ at: number | null }>('SELECT MIN(expires_at) AS at FROM compute_usage')
      .one().at;
    const maintenance = expiry === null ? Infinity : Math.max(this.now() + RECOVERY_DELAY, expiry);
    const next = Math.min(active ?? Infinity, maintenance);
    if (Number.isFinite(next)) await this.storage.setAlarm(next);
    else await this.storage.deleteAlarm();
  }

  private async reserve(tenant: string): Promise<Active> {
    return this.storage.transaction(async () => {
      const now = this.now();
      this.assertAvailable(tenant);
      if (this.paused()) throw new HttpFailure(503, 'Compute is temporarily paused');
      const count = this.sql
        .exec<{ total: number }>('SELECT COUNT(*) AS total FROM compute_active')
        .one().total;
      if (
        count >= this.policy.maxConcurrent ||
        this.sql.exec('SELECT 1 FROM compute_active WHERE tenant = ?', tenant).toArray().length
      )
        throw new QuotaFailure(30);
      const buckets = this.buckets(tenant, now).map((bucket) => {
        const existing = this.sql
          .exec<{ window_start: number; used: number }>(
            'SELECT window_start,used FROM compute_usage WHERE owner = ? AND period = ?',
            bucket.owner,
            bucket.period,
          )
          .toArray()[0];
        const used = existing?.window_start === bucket.start ? existing.used : 0;
        if (used >= bucket.limit)
          throw new QuotaFailure(Math.max(1, Math.ceil((bucket.end - now) / 1000)));
        return { ...bucket, used };
      });
      for (const bucket of buckets)
        this.sql.exec(
          'INSERT OR REPLACE INTO compute_usage VALUES (?,?,?,?,?)',
          bucket.owner,
          bucket.period,
          bucket.start,
          bucket.used + 1,
          bucket.end,
        );
      const record: Active = {
        id: crypto.randomUUID(),
        tenant,
        state: 'running',
        deadline_at: now + this.policy.deadlineMs,
        recover_at: now + this.policy.deadlineMs,
      };
      this.sql.exec(
        'INSERT INTO compute_active VALUES (?,?,?,?,?)',
        record.id,
        record.tenant,
        record.state,
        record.deadline_at,
        record.recover_at,
      );
      await this.schedule();
      return record;
    });
  }

  async dispatch(tenant: string, request: Request): Promise<Response> {
    nativeRequestHeaders(tenant, request);
    const bounded = await boundedRequest(request, 1024 * 1024);
    if (request.signal.aborted) throw new HttpFailure(499, 'Request cancelled');
    const record = await this.reserve(tenant);
    let response: Response | undefined;
    let received: Response | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};
    let done = false;
    let failed = false;
    let failure: unknown;
    try {
      this.assertAvailable(tenant);
      // Pause/recovery may have run while the durable reservation was committing.
      if (this.paused() || this.active(record.id)?.state !== 'running')
        throw new HttpFailure(503, 'Compute is temporarily paused');
      if (this.now() >= record.deadline_at) throw new HttpFailure(504, 'Compute timed out');
      if (request.signal.aborted) throw new HttpFailure(499, 'Request cancelled');
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new HttpFailure(499, 'Request cancelled'));
        request.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(
          () => reject(new HttpFailure(504, 'Compute timed out')),
          Math.max(0, record.deadline_at - this.now()),
        );
      });
      const pending = this.ports
        .run(record.id, tenant, bounded, record.deadline_at)
        .then((result) => {
          received = result;
          if (done) void result.body?.cancel().catch(() => {});
          return result;
        });
      response = await Promise.race([pending, cancelled]);
      if (this.now() >= record.deadline_at) throw new HttpFailure(504, 'Compute timed out');
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      request.signal.removeEventListener('abort', onAbort);
    }
    if (failed) void received?.body?.cancel().catch(() => {});
    // Failed cleanup takes precedence over any response, including successful work.
    try {
      await this.close(record.id);
    } catch (error) {
      void received?.body?.cancel().catch(() => {});
      throw error;
    }
    if (failed) {
      throw failure;
    }
    // A completed result cannot escape after account retirement interleaved with
    // the run or its verified cleanup. Previously delivered bytes cannot be recalled.
    try {
      this.assertAvailable(tenant);
    } catch (error) {
      void response?.body?.cancel().catch(() => {});
      throw error;
    }
    if (!response) throw new Error('Missing compute result');
    return response;
  }

  private close(id: string): Promise<void> {
    const existing = this.closing.get(id);
    if (existing) return existing;
    const work = this.closeOnce(id);
    this.closing.set(id, work);
    const clear = () => {
      if (this.closing.get(id) === work) this.closing.delete(id);
    };
    void work.then(clear, clear);
    return work;
  }

  private async closeOnce(id: string): Promise<void> {
    const present = await this.storage.transaction(async () => {
      if (!this.active(id)) return false;
      this.sql.exec(
        "UPDATE compute_active SET state = 'closing', recover_at = ? WHERE id = ?",
        this.now() + RECOVERY_DELAY,
        id,
      );
      await this.schedule();
      return true;
    });
    if (!present) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // This acknowledgement includes the coordinator and all of its children.
      // The parent's durable cancellation fence also prevents a late run RPC.
      await Promise.race([
        this.ports.cancel(id),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Cleanup not confirmed')), CLEANUP_DEADLINE);
        }),
      ]);
      await this.storage.transaction(async () => {
        this.sql.exec('DELETE FROM compute_active WHERE id = ?', id);
        await this.schedule();
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    if (typeof paused !== 'boolean') throw new Error('Invalid pause setting');
    const active = await this.storage.transaction(async () => {
      this.sql.exec('UPDATE compute_control SET paused = ? WHERE id = 1', paused ? 1 : 0);
      const active = paused ? this.sql.exec<Active>('SELECT * FROM compute_active').toArray() : [];
      if (paused)
        this.sql.exec("UPDATE compute_active SET state = 'closing', recover_at = ?", this.now());
      await this.schedule();
      return active;
    });
    await Promise.allSettled(active.map((row) => this.close(row.id)));
  }

  /** Permanent account-deletion fence, followed by verified whole-request cleanup. */
  async retireTenant(tenant: string): Promise<void> {
    if (typeof tenant !== 'string' || !/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(tenant))
      throw new HttpFailure(400, 'Invalid compute identity');
    const active = await this.storage.transaction(async () => {
      this.sql.exec('INSERT OR IGNORE INTO compute_retired VALUES (?)', tenant);
      const active = this.sql
        .exec<Active>('SELECT * FROM compute_active WHERE tenant=?', tenant)
        .toArray()[0];
      if (active)
        this.sql.exec(
          "UPDATE compute_active SET state='closing',recover_at=? WHERE id=?",
          this.now(),
          active.id,
        );
      await this.schedule();
      return active;
    });
    // Cleanup failure deliberately rejects: a caller must not proceed as if the
    // tenant is drained. The deny and the active lease survive eviction/retry.
    if (active) await this.close(active.id);
    await this.storage.transaction(async () => {
      if (this.sql.exec('SELECT 1 FROM compute_active WHERE tenant=?', tenant).toArray().length)
        throw new Error('Account compute cleanup is not confirmed');
      this.sql.exec('DELETE FROM compute_usage WHERE owner=?', tenant);
      // Global counters retain the cost of admitted work. The opaque deny record
      // persists without its own alarm and cannot be cleared by pause/resume.
      await this.schedule();
    });
  }

  async alarm(): Promise<void> {
    const due = this.sql
      .exec<Active>('SELECT * FROM compute_active WHERE recover_at <= ?', this.now())
      .toArray();
    await Promise.allSettled(due.map((row) => this.close(row.id)));
    await this.storage.transaction(async () => {
      // Bound each maintenance batch, including after a long idle period.
      this.sql.exec(
        'DELETE FROM compute_usage WHERE rowid IN (SELECT rowid FROM compute_usage WHERE expires_at <= ? LIMIT 256)',
        this.now(),
      );
      await this.schedule();
    });
  }
}
