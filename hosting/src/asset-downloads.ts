import type { ArtifactStore } from './artifact-store';
import type { AssetIndex } from './asset-index';
import { HttpFailure, sha256 } from './http';
import { DOWNLOAD_FILES, DOWNLOAD_TOKEN } from './download-path';

const LIFETIME_MS = 600_000;
const MAX_TICKETS = 128;
const MAX_TRANSFERS = 32;
const denied = () => new HttpFailure(404, 'Download link unavailable; request a new link');
type Ticket = { token_hash: string; group_id: string; expires_at: number; uses: number };

/**
 * Tenant-local download selection, not authentication. The browser gateway must
 * select this tenant from a current signed-in account before presenting a ticket.
 * A link alone never authorizes a caller to select another tenant or an R2 key.
 */
export class AssetDownloadTickets {
  private readonly sql: SqlStorage;
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly artifacts: Pick<ArtifactStore, 'group' | 'download'>,
    private readonly assets: Pick<AssetIndex, 'read'>,
    private readonly now: () => number = Date.now,
  ) {
    this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS asset_download_tickets (
      token_hash TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= 32)
    );
    CREATE INDEX IF NOT EXISTS asset_download_expiry ON asset_download_tickets(expires_at)`);
  }

  revokeAll(): void {
    this.sql.exec('DELETE FROM asset_download_tickets');
  }

  async issue(collection: unknown, assetId: unknown, revisionId: unknown) {
    const group = this.assets.read(collection, assetId, revisionId);
    const files = Object.keys(group.files).sort();
    if (!files.length || files.some((name) => !DOWNLOAD_FILES.has(name))) throw denied();
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const tokenHash = await this.hash(token);
    const expiresAt = this.now() + LIFETIME_MS;
    this.storage.transactionSync(() => {
      // Hashing yields. Recheck the immutable revision before granting a link.
      this.artifacts.group(group.id);
      this.sweep();
      if (
        this.sql
          .exec<{ count: number }>('SELECT COUNT(*) AS count FROM asset_download_tickets')
          .one().count >= MAX_TICKETS
      )
        throw new HttpFailure(
          429,
          'Download link limit reached; try again after existing links expire',
        );
      this.sql.exec(
        'INSERT INTO asset_download_tickets(token_hash,group_id,expires_at,uses) VALUES (?,?,?,0)',
        tokenHash,
        group.id,
        expiresAt,
      );
    });
    return { ticket: token, expiresAt, files };
  }

  private hash(token: string): Promise<string> {
    return sha256(JSON.stringify(['kiln-asset-download-v1', token]));
  }
  private current(hash: string): Ticket {
    const row = this.sql
      .exec<Ticket>(
        'SELECT * FROM asset_download_tickets WHERE token_hash=? AND expires_at>?',
        hash,
        this.now(),
      )
      .toArray()[0];
    if (!row) throw denied();
    return row;
  }
  private file(row: Ticket, name: string): string {
    const group = this.artifacts.group(row.group_id);
    const id = group.files[name];
    if (!id) throw denied();
    return id;
  }

  async download(token: string, filename: string, headOnly = false): Promise<Response> {
    if (
      typeof token !== 'string' ||
      !DOWNLOAD_TOKEN.test(token) ||
      !DOWNLOAD_FILES.has(filename) ||
      typeof headOnly !== 'boolean'
    )
      throw denied();
    const hash = await this.hash(token);
    const selected = this.storage.transactionSync(() => {
      const row = this.current(hash);
      const id = this.file(row, filename);
      if (row.uses >= MAX_TRANSFERS)
        throw new HttpFailure(429, 'Download link limit reached; request a new link');
      this.sql.exec('UPDATE asset_download_tickets SET uses=uses+1 WHERE token_hash=?', hash);
      return { id, groupId: row.group_id };
    });
    // Failed reads still consume an attempt; requests cannot refund their own quota.
    const response = await this.artifacts.download(selected.id, headOnly);
    try {
      const current = this.current(hash);
      if (current.group_id !== selected.groupId || this.file(current, filename) !== selected.id)
        throw denied();
      return response;
    } catch (error) {
      void response.body?.cancel().catch(() => {});
      throw error;
    }
  }

  /** Bounded by the fixed 128-row per-tenant ceiling; never extends asset retention. */
  sweep(): void {
    this.sql.exec('DELETE FROM asset_download_tickets WHERE expires_at<=?', this.now());
  }
}
