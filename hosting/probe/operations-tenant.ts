import { KilnTenant, type TenantStorageEnv } from '../src/tenant';
import { readBounded } from '../src/http';

const DAY = 86400_000;
const sources = {
  unsaved: 'function build(){return createRoot("Private unsaved retention fixture");}',
  saved: 'function build(){return createRoot("Private saved retention fixture");}',
};
type SourceRecord = { artifactId: string; programRef: string };
type RetentionState = {
  unsaved: SourceRecord;
  saved: SourceRecord;
  groupId: string;
  sevenDayExpiryVerified: boolean;
};
const requireProbe = (value: unknown): void => {
  if (!value) throw new Error('PRIVATE_OPERATIONS_STORAGE_CHECK');
};
async function json(response: Response, expected = 200) {
  requireProbe(response.status === expected);
  return JSON.parse(new TextDecoder().decode(await readBounded(response.body, 4096)));
}

/** Private diagnostic subclass only. It preserves the production fetch/sweep
 * methods, seeds two fixed synthetic sources, and advances only their expiry
 * timestamps. These RPC methods must never be exported by a production Worker.
 */
export class KilnOperationsTenant extends KilnTenant {
  constructor(ctx: DurableObjectState, env: TenantStorageEnv & { OPERATIONS_MODE: string }) {
    requireProbe(env.OPERATIONS_MODE === 'isolated-storage-v1');
    super(ctx, env);
  }

  async prepareRetention() {
    await this.ctx.storage.transaction(async (tx) => {
      requireProbe(!(await tx.get('operations-retention-claimed')));
      requireProbe(this.ctx.storage.sql.exec('SELECT 1 FROM artifacts').toArray().length === 0);
      requireProbe(this.ctx.storage.sql.exec('SELECT 1 FROM saved_groups').toArray().length === 0);
      requireProbe(
        this.ctx.storage.sql.exec('SELECT 1 FROM storage_retirement').toArray().length === 0,
      );
      await tx.put('operations-retention-claimed', true);
    });
    const put = (source: string) =>
      this.fetch(
        new Request('https://tenant.internal/internal/programs', {
          method: 'POST',
          body: source,
          headers: { 'content-type': 'application/javascript' },
        }),
      );
    const unsaved = (await json(await put(sources.unsaved), 201)) as SourceRecord;
    const saved = (await json(await put(sources.saved), 201)) as SourceRecord;
    const group = await json(
      await this.fetch(
        new Request('https://tenant.internal/internal/groups', {
          method: 'POST',
          body: JSON.stringify({
            key: 'operations/retention',
            files: { 'source.kiln.js': saved.artifactId },
            metadata: { fixture: 'retention' },
          }),
        }),
      ),
      201,
    );
    const rows = this.ctx.storage.sql
      .exec<{ id: string; created_at: number; expires_at: number }>(
        'SELECT id,created_at,expires_at FROM artifacts ORDER BY id',
      )
      .toArray();
    requireProbe(
      rows.length === 2 &&
        rows.every(
          (row) =>
            [unsaved.artifactId, saved.artifactId].includes(row.id) &&
            row.expires_at - row.created_at === 7 * DAY,
        ),
    );
    const state: RetentionState = {
      unsaved,
      saved,
      groupId: group.id,
      sevenDayExpiryVerified: true,
    };
    requireProbe(typeof state.groupId === 'string' && /^[a-f0-9]{32}$/.test(state.groupId));
    await this.ctx.storage.put('operations-retention-state', state);
    this.ctx.storage.sql.exec(
      'UPDATE artifacts SET expires_at=? WHERE id IN (?,?)',
      Date.now() - 1,
      unsaved.artifactId,
      saved.artifactId,
    );
    const initial = await this.retentionStatus();
    requireProbe(initial.expiredUnsavedDenied && initial.savedSourceReadable);
    await this.ctx.storage.setAlarm(Date.now() + 2000);
    return initial;
  }

  override async alarm(): Promise<void> {
    await super.alarm();
    if (await this.ctx.storage.get('operations-retention-state'))
      await this.ctx.storage.put('operations-retention-alarm', true);
  }

  async retentionStatus() {
    const state = await this.ctx.storage.get<RetentionState>('operations-retention-state');
    requireProbe(state);
    const selected = state!;
    const fetchSource = (record: SourceRecord) =>
      this.fetch(
        new Request(
          `https://tenant.internal/internal/programs/${encodeURIComponent(record.programRef)}`,
        ),
      );
    const unsaved = await fetchSource(selected.unsaved);
    const expiredUnsavedDenied = unsaved.status === 404;
    await unsaved.body?.cancel();
    const saved = await fetchSource(selected.saved);
    const savedBytes = await readBounded(saved.body, 4096);
    const savedSourceReadable =
      saved.status === 200 && new TextDecoder().decode(savedBytes) === sources.saved;
    const key = (id: string) => `tenants/${this.ctx.id}/artifacts/${id}`;
    return {
      sevenDayExpiryVerified: selected.sevenDayExpiryVerified,
      expiredUnsavedDenied,
      savedSourceReadable,
      alarmObserved: (await this.ctx.storage.get('operations-retention-alarm')) === true,
      remainingObjects: this.ctx.storage.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM artifacts')
        .one().n,
      unsavedObjectAbsent: !(await this.env.ARTIFACTS.head(key(selected.unsaved.artifactId))),
      savedObjectPresent: Boolean(await this.env.ARTIFACTS.head(key(selected.saved.artifactId))),
    };
  }

  async removeRetainedSource() {
    requireProbe((await this.ctx.storage.get('operations-retention-alarm')) === true);
    const state = await this.ctx.storage.get<RetentionState>('operations-retention-state');
    requireProbe(state);
    await json(
      await this.fetch(
        new Request(`https://tenant.internal/internal/groups/${state!.groupId}`, {
          method: 'DELETE',
        }),
      ),
    );
    return this.retentionStatus();
  }
}

export default { fetch: () => new Response('Not found', { status: 404 }) };
