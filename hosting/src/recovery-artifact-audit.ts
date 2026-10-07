import { HttpFailure } from './http';

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
type PinRow = { group_id: string; filename: string; files: string };
type Outcome = 'verified' | 'missing' | 'mismatch' | 'changed' | 'unavailable';
export interface RecoveryArtifactResult {
  status: Outcome;
  artifactId: string;
  bytes?: number;
  sha256?: string;
}
const idPattern = /^[a-f0-9]{32}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const filenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const mediaTypes = new Set([
  'application/octet-stream',
  'model/gltf-binary',
  'image/png',
  'application/javascript',
  'application/json',
  'application/zip',
]);
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
class IntegrityFailure extends Error {}

/**
 * Read-only, one-artifact verifier for a private recovery operator. It selects
 * only currently saved bytes, never a caller-supplied object key or old manifest.
 * Not registered by a production Worker. A verified result is not a backup,
 * tenant-wide snapshot, identity check or permission to reopen public traffic.
 */
export class RecoveryArtifactAudit {
  private running = false;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly bucket: R2Bucket,
    private readonly deadlineMs = 10_000,
  ) {
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000)
      throw new Error('Invalid recovery audit deadline');
  }

  private selection(id: string): { row: ArtifactRow; identity: string } {
    const sql = this.ctx.storage.sql;
    try {
      const format = sql.exec<{ version: number }>('SELECT version FROM storage_format').toArray();
      if (format.length !== 1 || format[0]?.version !== 1)
        throw new HttpFailure(409, 'Unsupported recovery storage format');
      if (sql.exec('SELECT 1 FROM storage_retirement WHERE id=1').toArray().length)
        throw new HttpFailure(410, 'Account storage has been retired');
      if (sql.exec('SELECT 1 FROM artifact_writes WHERE artifact_id=?', id).toArray().length)
        throw new HttpFailure(409, 'Artifact write is unresolved');
      const rows = sql.exec<ArtifactRow>('SELECT * FROM artifacts WHERE id=?', id).toArray();
      const row = rows[0];
      const pins = sql
        .exec<PinRow>(
          `SELECT f.group_id,f.filename,g.files
        FROM group_files f JOIN saved_groups g ON g.id=f.group_id
        WHERE f.artifact_id=? ORDER BY f.group_id,f.filename LIMIT 1`,
          id,
        )
        .toArray();
      const pin = pins[0];
      if (
        rows.length !== 1 ||
        !row ||
        row.id !== id ||
        row.state !== 'ready' ||
        row.object_key !== `tenants/${this.ctx.id.toString()}/artifacts/${id}` ||
        !digestPattern.test(row.sha256) ||
        !Number.isSafeInteger(row.bytes) ||
        row.bytes < 0 ||
        row.bytes > 64 * 1024 * 1024 ||
        !filenamePattern.test(row.filename) ||
        !mediaTypes.has(row.media_type) ||
        !Number.isSafeInteger(row.created_at) ||
        row.created_at < 0 ||
        !Number.isSafeInteger(row.expires_at) ||
        row.expires_at < row.created_at ||
        !pin ||
        !idPattern.test(pin.group_id) ||
        pin.filename !== row.filename ||
        typeof pin.files !== 'string' ||
        pin.files.length > 65_536
      )
        throw new HttpFailure(409, 'Saved artifact metadata is unavailable');
      const files: unknown = JSON.parse(pin.files);
      if (
        !files ||
        typeof files !== 'object' ||
        Array.isArray(files) ||
        !Object.hasOwn(files, row.filename) ||
        (files as Record<string, unknown>)[row.filename] !== id
      )
        throw new HttpFailure(409, 'Saved artifact metadata is unavailable');
      return { row, identity: JSON.stringify([row, pin]) };
    } catch (error) {
      if (error instanceof HttpFailure) throw error;
      throw new HttpFailure(409, 'Saved artifact metadata is unavailable');
    }
  }

  async verify(id: string): Promise<RecoveryArtifactResult> {
    if (typeof id !== 'string' || !idPattern.test(id))
      throw new HttpFailure(400, 'Invalid recovery artifact selection');
    if (this.running) throw new HttpFailure(409, 'Another recovery read is unresolved');
    const selected = this.selection(id);
    this.running = true;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unavailable: RecoveryArtifactResult = { status: 'unavailable', artifactId: id };
    const timeout = new Promise<RecoveryArtifactResult>((resolve) => {
      timer = setTimeout(() => {
        abort.abort();
        resolve(unavailable);
      }, this.deadlineMs);
    });
    const operation = this.inspect(selected, abort.signal)
      .catch(() => unavailable)
      .finally(() => {
        // An R2 get cannot be cancelled. A timeout retains this admission until its
        // actual promise settles; a late body is cancelled and never verified.
        this.running = false;
      });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async inspect(
    selected: { row: ArtifactRow; identity: string },
    signal: AbortSignal,
  ): Promise<RecoveryArtifactResult> {
    const { row } = selected;
    const result = (status: Outcome): RecoveryArtifactResult => ({ status, artifactId: row.id });
    const current = () => {
      try {
        return this.selection(row.id).identity === selected.identity;
      } catch {
        return false;
      }
    };
    const object = await this.bucket.get(row.object_key);
    if (signal.aborted) {
      void object?.body.cancel().catch(() => {});
      return result('unavailable');
    }
    if (!current()) {
      void object?.body.cancel().catch(() => {});
      return result('changed');
    }
    if (!object) return result('missing');
    if (
      object.key !== row.object_key ||
      object.size !== row.bytes ||
      !object.checksums.sha256 ||
      hex(object.checksums.sha256) !== row.sha256
    ) {
      void object.body.cancel().catch(() => {});
      return result('mismatch');
    }
    let count = 0;
    const digest = new crypto.DigestStream('SHA-256');
    // Observe rejected digests even when a read or deadline fails before close.
    void digest.digest.catch(() => {});
    const reader = object.body.getReader();
    const writer = digest.getWriter();
    const cancel = () => {
      void reader.cancel().catch(() => {});
      void writer.abort().catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    let complete = false;
    try {
      for (;;) {
        if (signal.aborted) return result('unavailable');
        const { done, value } = await reader.read();
        if (signal.aborted) return result('unavailable');
        if (done) break;
        count += value.byteLength;
        if (count > row.bytes) throw new IntegrityFailure();
        await writer.write(value);
      }
      await writer.close();
      const hash = await digest.digest;
      complete = true;
      if (signal.aborted) return result('unavailable');
      if (!current()) return result('changed');
      if (count !== row.bytes || hex(hash) !== row.sha256) return result('mismatch');
      return { status: 'verified', artifactId: row.id, bytes: count, sha256: row.sha256 };
    } catch (error) {
      if (signal.aborted) return result('unavailable');
      if (!current()) return result('changed');
      return result(error instanceof IntegrityFailure ? 'mismatch' : 'unavailable');
    } finally {
      signal.removeEventListener('abort', cancel);
      if (!complete) cancel();
      reader.releaseLock();
      writer.releaseLock();
    }
  }
}
