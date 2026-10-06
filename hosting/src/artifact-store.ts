import { HttpFailure } from './http';

const DAY = 24 * 60 * 60 * 1000;
const UPLOAD_GRACE = 15 * 60 * 1000;
const filenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const idPattern = /^[a-f0-9]{32}$/;
const mediaTypes = new Set([
  'application/octet-stream',
  'model/gltf-binary',
  'image/png',
  'application/javascript',
  'application/json',
  'application/zip',
]);
type ArtifactRow = {
  id: string;
  object_key: string;
  sha256: string;
  bytes: number;
  filename: string;
  media_type: string;
  created_at: number;
  expires_at: number;
  state: string;
};
type GroupRow = {
  id: string;
  logical_key: string;
  metadata: string;
  files: string;
  bytes: number;
  created_at: number;
};

export interface StoragePolicy {
  maxBytes: number;
  maxObjects: number;
  maxGroups: number;
}

export class ArtifactStore {
  private readonly sql: SqlStorage;
  private readonly prefix: string;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly bucket: R2Bucket,
    private readonly policy: StoragePolicy,
    private readonly now: () => number = Date.now,
    private readonly uploadDeadlineMs = 60_000,
  ) {
    for (const limit of Object.values(policy)) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1024 ** 4)
        throw new Error('Invalid storage policy');
    }
    if (
      !Number.isSafeInteger(uploadDeadlineMs) ||
      uploadDeadlineMs < 1 ||
      uploadDeadlineMs > 60_000
    ) {
      throw new Error('Invalid upload deadline');
    }
    this.sql = ctx.storage.sql;
    this.prefix = `tenants/${ctx.id.toString()}/artifacts/`;
    this.sql.exec('CREATE TABLE IF NOT EXISTS storage_format (version INTEGER NOT NULL)');
    const version = this.sql
      .exec<{ version: number }>('SELECT version FROM storage_format')
      .toArray();
    if (!version.length) this.sql.exec('INSERT INTO storage_format VALUES (1)');
    else if (version.length !== 1 || version[0]?.version !== 1)
      throw new Error('Unsupported storage format');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL,
      bytes INTEGER NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_groups (
      id TEXT PRIMARY KEY, logical_key TEXT NOT NULL UNIQUE, metadata TEXT NOT NULL,
      files TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_files (
      group_id TEXT NOT NULL, filename TEXT NOT NULL, artifact_id TEXT NOT NULL,
      PRIMARY KEY (group_id, filename)
    );
    CREATE INDEX IF NOT EXISTS artifact_pins ON group_files(artifact_id);
    CREATE INDEX IF NOT EXISTS artifact_expiry ON artifacts(state, expires_at);
    CREATE INDEX IF NOT EXISTS artifact_content ON artifacts(sha256, filename, media_type);
    CREATE TABLE IF NOT EXISTS maintenance (id INTEGER PRIMARY KEY, cursor TEXT NOT NULL)`);
  }

  private artifact(id: string): ArtifactRow | undefined {
    if (!idPattern.test(id)) return undefined;
    return this.sql.exec<ArtifactRow>('SELECT * FROM artifacts WHERE id = ?', id).toArray()[0];
  }

  private pinned(id: string): boolean {
    return (
      this.sql.exec('SELECT 1 FROM group_files WHERE artifact_id = ? LIMIT 1', id).toArray()
        .length > 0
    );
  }

  private readable(row: ArtifactRow | undefined): row is ArtifactRow {
    return !!row && row.state === 'ready' && (row.expires_at > this.now() || this.pinned(row.id));
  }

  usage() {
    const objects = this.sql
      .exec<{ bytes: number; objects: number }>(
        'SELECT COALESCE(SUM(bytes), 0) AS bytes, COUNT(*) AS objects FROM artifacts',
      )
      .one();
    const groups = this.sql
      .exec<{ metadataBytes: number; groups: number }>(
        'SELECT COALESCE(SUM(bytes), 0) AS metadataBytes, COUNT(*) AS groups FROM saved_groups',
      )
      .one();
    return {
      ...objects,
      ...groups,
      totalBytes: objects.bytes + groups.metadataBytes,
      limits: this.policy,
    };
  }

  private receipt(row: ArtifactRow) {
    return {
      id: row.id,
      sha256: row.sha256,
      bytes: row.bytes,
      filename: row.filename,
      mediaType: row.media_type,
      createdAt: row.created_at,
      expiresAt: this.pinned(row.id) ? null : row.expires_at,
    };
  }

  private async schedule(at = this.now() + DAY): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  findContent(sha256: string, filename: string, mediaType: string) {
    const rows = this.sql
      .exec<ArtifactRow>(
        "SELECT * FROM artifacts WHERE sha256 = ? AND filename = ? AND media_type = ? AND state = 'ready' ORDER BY created_at DESC",
        sha256,
        filename,
        mediaType,
      )
      .toArray();
    const row = rows.find((candidate) => this.readable(candidate));
    return row ? this.receipt(row) : undefined;
  }

  contentStats(filename: string, mediaType: string) {
    const rows = this.sql
      .exec<{ bytes: number }>(
        `SELECT MAX(bytes) AS bytes FROM artifacts
      WHERE filename = ? AND media_type = ? AND state = 'ready'
      AND (expires_at > ? OR EXISTS (SELECT 1 FROM group_files WHERE artifact_id = artifacts.id))
      GROUP BY sha256`,
        filename,
        mediaType,
        this.now(),
      )
      .toArray();
    return { entries: rows.length, bytes: rows.reduce((sum, row) => sum + row.bytes, 0) };
  }

  async upload(request: Request) {
    const rawSize = request.headers.get('content-length') ?? '';
    const bytes = Number(rawSize);
    const sha256 = request.headers.get('x-artifact-sha256') ?? '';
    const filename = request.headers.get('x-artifact-name') ?? '';
    const mediaType = request.headers.get('content-type') ?? '';
    if (
      !/^\d+$/.test(rawSize) ||
      !Number.isSafeInteger(bytes) ||
      bytes > 64 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      !filenamePattern.test(filename) ||
      !mediaTypes.has(mediaType)
    ) {
      throw new HttpFailure(400, 'Invalid artifact declaration');
    }
    // Schedule recovery before reserving storage or starting an external write.
    await this.schedule(this.now() + UPLOAD_GRACE);
    const id = crypto.randomUUID().replace(/-/g, '');
    const row: ArtifactRow = {
      id,
      object_key: this.prefix + id,
      sha256,
      bytes,
      filename,
      media_type: mediaType,
      created_at: this.now(),
      expires_at: this.now() + 7 * DAY,
      state: 'uploading',
    };
    this.ctx.storage.transactionSync(() => {
      const usage = this.usage();
      if (
        usage.objects >= this.policy.maxObjects ||
        usage.totalBytes + bytes > this.policy.maxBytes
      ) {
        throw new HttpFailure(507, 'Tenant storage quota exceeded');
      }
      this.sql.exec(
        'INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        row.object_key,
        sha256,
        bytes,
        filename,
        mediaType,
        row.created_at,
        row.expires_at,
        row.state,
      );
    });
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        abort.abort();
        reject(new Error('Upload deadline exceeded'));
      }, this.uploadDeadlineMs);
    });
    const fixed = new FixedLengthStream(bytes);
    const pipe = (request.body ?? new Blob([]).stream()).pipeTo(fixed.writable, {
      signal: abort.signal,
    });
    const put = Promise.resolve().then(() =>
      this.bucket.put(row.object_key, fixed.readable, {
        sha256,
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: mediaType },
      }),
    );
    try {
      const [, stored] = await Promise.race([Promise.all([pipe, put]), timeout]);
      if (!stored || stored.size !== bytes) throw new Error('Artifact write did not complete');
      const updated = this.sql
        .exec<{ id: string }>(
          "UPDATE artifacts SET state = 'ready' WHERE id = ? AND state = 'uploading' RETURNING id",
          id,
        )
        .toArray();
      if (!updated.length) throw new Error('Upload reservation expired');
      row.state = 'ready';
      return this.receipt(row);
    } catch {
      abort.abort();
      // A failed/unknown write is never visible. Its durable deletion intent keeps
      // quota reserved until R2 cleanup succeeds, and alarms retry after a crash.
      this.sql.exec("UPDATE artifacts SET state = 'deleting' WHERE id = ?", id);
      const cleanup = (async () => {
        await Promise.allSettled([pipe, put]);
        try {
          await this.bucket.delete(row.object_key);
          this.sql.exec("DELETE FROM artifacts WHERE id = ? AND state = 'deleting'", id);
        } catch {
          /* Retain intent and reserved quota until maintenance succeeds. */
        }
      })();
      // R2 does not expose cancellation of a put. A late acknowledgement may only
      // trigger cleanup; it cannot make this request successful or publish bytes.
      this.ctx.waitUntil(cleanup);
      if (!timedOut) {
        try {
          await Promise.race([cleanup, timeout]);
        } catch {
          /* Alarm owns recovery. */
        }
      }
      throw new HttpFailure(502, 'Artifact upload failed integrity or storage checks');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async download(id: string, head = false): Promise<Response> {
    const row = this.artifact(id);
    if (!this.readable(row)) throw new HttpFailure(404, 'Artifact not found');
    let object: R2Object | null;
    let body: ReadableStream | null = null;
    if (head) object = await this.bucket.head(row.object_key);
    else {
      const loaded = await this.bucket.get(row.object_key);
      object = loaded;
      body = loaded?.body ?? null;
    }
    const checksum = object?.checksums.sha256;
    const hex = checksum
      ? Array.from(new Uint8Array(checksum), (byte) => byte.toString(16).padStart(2, '0')).join('')
      : '';
    if (!object || object.size !== row.bytes || hex !== row.sha256) {
      void body?.cancel().catch(() => {});
      throw new HttpFailure(502, 'Stored artifact integrity check failed');
    }
    // Recheck after the external read: deletion can interleave with an R2 await.
    if (!this.readable(this.artifact(id))) {
      void body?.cancel().catch(() => {});
      throw new HttpFailure(404, 'Artifact not found');
    }
    return new Response(body, {
      headers: {
        'content-type': row.media_type,
        'content-length': String(row.bytes),
        etag: `"${row.sha256}"`,
        'content-disposition': `attachment; filename="${row.filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  }

  assertFileNames(files: Record<string, string>): void {
    for (const [name, id] of Object.entries(files)) {
      const row = this.artifact(id);
      if (!this.readable(row)) throw new HttpFailure(404, 'Artifact not found');
      if (row.filename !== name) throw new HttpFailure(400, 'Saved filename mismatch');
    }
  }

  save(input: unknown, conditions: { parentKey?: string; absentPrefix?: string } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new HttpFailure(400, 'Invalid saved revision');
    const { key, files, metadata } = input as Record<string, unknown>;
    if (
      typeof key !== 'string' ||
      !/^[A-Za-z0-9_./-]{1,240}$/.test(key) ||
      !files ||
      typeof files !== 'object' ||
      Array.isArray(files)
    )
      throw new HttpFailure(400, 'Invalid saved revision');
    const entries = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (
      !entries.length ||
      entries.length > 256 ||
      entries.some(
        ([name, id]) =>
          !filenamePattern.test(name) || typeof id !== 'string' || !idPattern.test(id),
      )
    ) {
      throw new HttpFailure(400, 'Invalid saved file inventory');
    }
    const filesJson = JSON.stringify(Object.fromEntries(entries));
    const metadataJson = JSON.stringify(metadata ?? {});
    const bytes = new TextEncoder().encode(key + filesJson + metadataJson).byteLength;
    if (bytes > 65_536) throw new HttpFailure(413, 'Saved metadata too large');
    return this.ctx.storage.transactionSync(() => {
      const existing = this.sql
        .exec<GroupRow>('SELECT * FROM saved_groups WHERE logical_key = ?', key)
        .toArray()[0];
      if (existing) {
        if (existing.files !== filesJson || existing.metadata !== metadataJson)
          throw new HttpFailure(409, 'Saved revision is immutable');
        return { created: false, record: this.groupReceipt(existing) };
      }
      if (conditions.parentKey) this.groupByKey(conditions.parentKey);
      if (conditions.absentPrefix && this.groupPage(conditions.absentPrefix).records.length)
        throw new HttpFailure(409, 'An existing asset requires parentRevision');
      for (const [, id] of entries)
        if (!this.readable(this.artifact(id as string)))
          throw new HttpFailure(404, 'Artifact not found');
      const usage = this.usage();
      if (usage.groups >= this.policy.maxGroups || usage.totalBytes + bytes > this.policy.maxBytes)
        throw new HttpFailure(507, 'Tenant storage quota exceeded');
      const row: GroupRow = {
        id: crypto.randomUUID().replace(/-/g, ''),
        logical_key: key,
        files: filesJson,
        metadata: metadataJson,
        bytes,
        created_at: this.now(),
      };
      this.sql.exec(
        'INSERT INTO saved_groups VALUES (?, ?, ?, ?, ?, ?)',
        row.id,
        key,
        metadataJson,
        filesJson,
        bytes,
        row.created_at,
      );
      for (const [name, id] of entries)
        this.sql.exec('INSERT INTO group_files VALUES (?, ?, ?)', row.id, name, id as string);
      return { created: true, record: this.groupReceipt(row) };
    });
  }

  private groupReceipt(row: GroupRow) {
    return {
      id: row.id,
      key: row.logical_key,
      files: JSON.parse(row.files) as Record<string, string>,
      metadata: JSON.parse(row.metadata) as unknown,
      createdAt: row.created_at,
    };
  }

  group(id: string) {
    const row = this.sql.exec<GroupRow>('SELECT * FROM saved_groups WHERE id = ?', id).toArray()[0];
    if (!row) throw new HttpFailure(404, 'Saved revision not found');
    return this.groupReceipt(row);
  }

  groupByKey(key: string) {
    const row = this.sql
      .exec<GroupRow>('SELECT * FROM saved_groups WHERE logical_key = ?', key)
      .toArray()[0];
    if (!row) throw new HttpFailure(404, 'Saved revision not found');
    return this.groupReceipt(row);
  }

  groupPage(prefix: string, after = '') {
    const rows = this.sql
      .exec<GroupRow>(
        `SELECT * FROM saved_groups WHERE logical_key >= ? AND logical_key < ? AND logical_key > ?
       ORDER BY logical_key LIMIT 33`,
        prefix,
        `${prefix}\uffff`,
        after,
      )
      .toArray();
    return {
      records: rows.slice(0, 32).map((row) => this.groupReceipt(row)),
      next: rows.length > 32 ? rows[31]!.logical_key : null,
    };
  }

  async deleteGroup(id: string): Promise<void> {
    await this.schedule(this.now() + 60_000);
    this.ctx.storage.transactionSync(() => {
      const group = this.group(id);
      this.sql.exec('DELETE FROM group_files WHERE group_id = ?', id);
      this.sql.exec('DELETE FROM saved_groups WHERE id = ?', id);
      for (const artifact of new Set(Object.values(group.files))) {
        if (!this.pinned(artifact))
          this.sql.exec("UPDATE artifacts SET state = 'deleting' WHERE id = ?", artifact);
      }
    });
    await this.sweep();
  }

  async discard(input: unknown): Promise<void> {
    if (
      !Array.isArray(input) ||
      input.length > 16 ||
      input.some((id) => typeof id !== 'string' || !idPattern.test(id))
    )
      throw new HttpFailure(400, 'Invalid staging inventory');
    await this.schedule(this.now() + 60_000);
    this.ctx.storage.transactionSync(() => {
      for (const id of input)
        if (!this.pinned(id))
          this.sql.exec(
            "UPDATE artifacts SET state = 'deleting' WHERE id = ? AND state = 'ready'",
            id,
          );
    });
    await this.sweep();
  }

  async sweep(): Promise<{ removed: number }> {
    const now = this.now();
    let removed = 0;
    try {
      const candidates = this.sql
        .exec<ArtifactRow>(
          `SELECT * FROM artifacts WHERE state = 'deleting'
        OR (state = 'uploading' AND created_at <= ?)
        OR (state = 'ready' AND expires_at <= ? AND NOT EXISTS
          (SELECT 1 FROM group_files WHERE artifact_id = artifacts.id)) LIMIT 32`,
          now - UPLOAD_GRACE,
          now,
        )
        .toArray();
      for (const row of candidates)
        this.sql.exec("UPDATE artifacts SET state = 'deleting' WHERE id = ?", row.id);
      if (candidates.length) {
        await this.bucket.delete(candidates.map((row) => row.object_key));
        this.ctx.storage.transactionSync(() => {
          for (const row of candidates)
            this.sql.exec("DELETE FROM artifacts WHERE id = ? AND state = 'deleting'", row.id);
        });
        removed += candidates.length;
      }
      // Reconcile aged orphan objects after a crash between an R2 write and its
      // local acknowledgement. Never scan or delete outside this tenant prefix.
      const cursor = this.sql
        .exec<{ cursor: string }>('SELECT cursor FROM maintenance WHERE id = 1')
        .toArray()[0]?.cursor;
      const listing = await this.bucket.list({
        prefix: this.prefix,
        limit: 100,
        cursor: cursor || undefined,
      });
      const orphans = listing.objects.filter(
        (object) =>
          object.uploaded.getTime() <= now - UPLOAD_GRACE &&
          idPattern.test(object.key.slice(this.prefix.length)) &&
          !this.artifact(object.key.slice(this.prefix.length)),
      );
      if (orphans.length) await this.bucket.delete(orphans.map((object) => object.key));
      this.sql.exec(
        'INSERT OR REPLACE INTO maintenance VALUES (1, ?)',
        listing.truncated ? listing.cursor : '',
      );
      removed += orphans.length;
      if (candidates.length === 32 || listing.truncated) await this.schedule(now + 10_000);
      return { removed };
    } finally {
      // Daily reconciliation also covers a late orphan after a prior interrupted
      // request. An operator account-deletion flow must retire this alarm last.
      await this.schedule(now + DAY);
    }
  }
}
