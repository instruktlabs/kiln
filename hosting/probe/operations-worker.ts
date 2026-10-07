import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { D1AccountDeletions } from '../src/account-deletions';
import { D1BrowserSessions } from '../src/browser-sessions';
import { tenantForAccount } from '../src/tenant-identity';
import type { KilnCompute, KilnComputeControl } from '../src/admission-worker';
import type { KilnOperationsTenant } from './operations-tenant';
import { qualificationControl as control } from './qualification-rpc';
import {
  assertQualification,
  privateJson,
  qualificationOrigin,
  syntheticAccount,
  type QualificationAccountsEnv,
} from './qualification-accounts';

interface Env extends QualificationAccountsEnv {
  TENANTS: DurableObjectNamespace<KilnOperationsTenant>;
  ARTIFACTS: R2Bucket;
  COMPUTE: Service<KilnCompute>;
  CONTROL: Service<KilnComputeControl>;
  RUN: DurableObjectNamespace<KilnOperationsRun>;
}
interface Receipt {
  state: 'preparing' | 'waiting' | 'finished' | 'failed' | 'stopped';
  startedAt: number;
  deadline: number;
  passed: boolean;
  nativeExecutionPossible: false;
  computePaused: boolean;
  revocationVerified: boolean;
  retentionVerified: boolean;
  deletionRecovered: boolean;
  foreignAccountPreserved: boolean;
  step: 'fresh' | 'retention' | 'accounts' | 'sources' | 'deletion' | 'revocation' | 'recovery';
}
interface PrivateState {
  ownerId: string;
  ownerTenant: string;
  ownerToken: string;
  foreignTenant: string;
  foreignToken: string;
  foreignProgramRef: string;
  deletionReceipt: string;
}
const initial = (): Receipt => ({
  state: 'preparing',
  startedAt: Date.now(),
  deadline: Date.now() + 10 * 60_000,
  passed: false,
  nativeExecutionPossible: false,
  computePaused: false,
  revocationVerified: false,
  retentionVerified: false,
  deletionRecovered: false,
  foreignAccountPreserved: false,
  step: 'fresh',
});
const check = (value: unknown) => {
  if (!value) throw new Error('PRIVATE_OPERATIONS_CHECK');
};
const source = 'function build(){return createRoot("Private deletion fixture");}';

/** One-use synthetic storage/recovery run. It deliberately never calls the
 * gateway scheduled handler: only the provider's Cron may advance deletion. */
export class KilnOperationsRun extends DurableObject<Env> {
  private advancing?: Promise<Receipt>;
  private async paused() {
    const status = await control<Awaited<ReturnType<KilnCompute['health']>>>(
      this.env.CONTROL.setPaused(true),
    );
    check(status.paused && status.activeRequests === 0 && status.pendingCleanup === 0);
    return true;
  }
  private async save(record: Receipt) {
    return this.ctx.storage.transaction(async (tx) => {
      const current = await tx.get<Receipt>('operations-run');
      if (current && ['stopped', 'failed', 'finished'].includes(current.state)) return current;
      await tx.put('operations-run', record);
      return record;
    });
  }
  async status() {
    return (await this.ctx.storage.get<Receipt>('operations-run')) ?? null;
  }
  async begin(): Promise<Receipt> {
    assertQualification(this.env);
    const record = initial();
    const claimed = await this.ctx.storage.transaction(async (tx) => {
      if (await tx.get('operations-run')) return false;
      await tx.put('operations-run', record);
      return true;
    });
    if (!claimed) return (await this.status())!;
    try {
      await this.ctx.storage.setAlarm(record.deadline);
      record.computePaused = await this.paused();
      check(
        (
          await this.env.ACCOUNTS.withSession('first-primary')
            .prepare('SELECT COUNT(*) AS n FROM kiln_accounts')
            .first<{ n: number }>()
        )?.n === 0,
      );
      check((await this.env.OAUTH_KV.list({ limit: 1 })).keys.length === 0);
      check((await this.env.ARTIFACTS.list({ limit: 1 })).objects.length === 0);
      record.step = 'retention';
      const retention = await control(
        this.env.TENANTS.getByName('operations-retention-v1').prepareRetention(),
      );
      check(
        retention.sevenDayExpiryVerified &&
          retention.expiredUnsavedDenied &&
          retention.savedSourceReadable,
      );
      record.step = 'accounts';
      const owner = await syntheticAccount(this.env, 'alice'),
        foreign = await syntheticAccount(this.env, 'bob');
      const ownerTenant = await tenantForAccount(qualificationOrigin, owner.account.id);
      const foreignTenant = await tenantForAccount(qualificationOrigin, foreign.account.id);
      const seed = async (name: string, saved: boolean) => {
        const tenant = this.env.TENANTS.getByName(name);
        const program = await privateJson(
          await tenant.fetch('https://tenant.internal/internal/programs', {
            method: 'POST',
            body: source,
            headers: { 'content-type': 'application/javascript' },
          }),
          201,
        );
        if (saved)
          await privateJson(
            await tenant.fetch('https://tenant.internal/internal/groups', {
              method: 'POST',
              body: JSON.stringify({
                key: 'operations/deletion',
                files: { 'source.kiln.js': program.artifactId },
                metadata: {},
              }),
            }),
            201,
          );
        check(typeof program.programRef === 'string');
        return program.programRef as string;
      };
      record.step = 'sources';
      await seed(ownerTenant, true);
      const foreignProgramRef = await seed(foreignTenant, true);
      record.step = 'deletion';
      const proof = await new D1BrowserSessions(this.env.ACCOUNTS, qualificationOrigin).read(
        new Request(`${qualificationOrigin}/account`, { headers: { cookie: owner.cookie } }),
      );
      const deletionReceipt =
        crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      await new D1AccountDeletions(this.env.ACCOUNTS, qualificationOrigin).request(
        proof,
        owner.identity,
        deletionReceipt,
      );
      const state: PrivateState = {
        ownerId: owner.account.id,
        ownerTenant,
        ownerToken: owner.accessToken,
        foreignTenant,
        foreignToken: foreign.accessToken,
        foreignProgramRef,
        deletionReceipt,
      };
      await this.ctx.storage.transaction(async (tx) => {
        check((await tx.get<Receipt>('operations-run'))?.state === 'preparing');
        await tx.put('operations-private', state);
      });
      record.step = 'revocation';
      await this.checkAccess(state);
      record.revocationVerified = true;
      record.state = 'waiting';
      record.step = 'recovery';
      return await this.save(record);
    } catch {
      record.state = 'failed';
      return this.save(record);
    }
  }
  private async checkAccess(state: PrivateState) {
    const owner = await this.env.GATEWAY.fetch(
      new Request(`${qualificationOrigin}/mcp`, {
        headers: { authorization: `Bearer ${state.ownerToken}` },
      }),
    );
    check(owner.status === 401);
    await owner.body?.cancel();
    const foreign = await this.env.GATEWAY.fetch(
      new Request(`${qualificationOrigin}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${state.foreignToken}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': {
                name: 'kiln-private-operations',
                version: '1',
              },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
    );
    const result = await privateJson(foreign);
    check(
      result.result &&
        typeof result.result === 'object' &&
        Array.isArray((result.result as { tools: unknown }).tools),
    );
  }
  progress(): Promise<Receipt> {
    if (this.advancing) return this.advancing;
    const work = this.advance();
    this.advancing = work;
    void work
      .finally(() => {
        if (this.advancing === work) this.advancing = undefined;
      })
      .catch(() => {});
    return work;
  }
  private async advance(): Promise<Receipt> {
    const record = await this.status();
    check(record);
    if (record!.state !== 'waiting') return record!;
    const next = record!;
    try {
      check(Date.now() < next.deadline);
      next.computePaused = await this.paused();
      const retention = this.env.TENANTS.getByName('operations-retention-v1');
      if (!next.retentionVerified) {
        const result = await control(retention.retentionStatus());
        if (result.alarmObserved) {
          check(
            result.sevenDayExpiryVerified &&
              result.expiredUnsavedDenied &&
              result.savedSourceReadable &&
              result.remainingObjects === 1 &&
              result.unsavedObjectAbsent &&
              result.savedObjectPresent,
          );
          const removed = await control(retention.removeRetainedSource());
          check(
            removed.remainingObjects === 0 &&
              !removed.savedObjectPresent &&
              !removed.savedSourceReadable,
          );
          next.retentionVerified = true;
          await this.save(next);
        }
      }
      const state = await this.ctx.storage.get<PrivateState>('operations-private');
      check(state);
      const deletion = await new D1AccountDeletions(this.env.ACCOUNTS, qualificationOrigin).status(
        state!.deletionReceipt,
      );
      if (deletion.state === 'complete') {
        check(
          !(await this.env.ACCOUNTS.withSession('first-primary')
            .prepare('SELECT id FROM kiln_accounts WHERE id=?')
            .bind(state!.ownerId)
            .first()),
        );
        const owner = this.env.TENANTS.getByName(state!.ownerTenant);
        const retired = await owner.fetch('https://tenant.internal/internal/usage');
        check(retired.status === 410);
        await retired.body?.cancel();
        const prefix = `tenants/${this.env.TENANTS.idFromName(state!.ownerTenant)}/artifacts/`;
        check((await this.env.ARTIFACTS.list({ prefix, limit: 1 })).objects.length === 0);
        await this.checkAccess(state!);
        const foreign = await this.env.TENANTS.getByName(state!.foreignTenant).fetch(
          `https://tenant.internal/internal/programs/${encodeURIComponent(state!.foreignProgramRef)}`,
        );
        check(foreign.status === 200 && (await foreign.text()) === source);
        next.deletionRecovered = true;
        next.foreignAccountPreserved = true;
      }
      if (next.retentionVerified && next.deletionRecovered && next.foreignAccountPreserved) {
        next.state = 'finished';
        next.passed = true;
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.delete('operations-private');
      }
    } catch {
      next.state = 'failed';
      next.passed = false;
    }
    return this.save(next);
  }
  async stop(): Promise<Receipt> {
    const record = (await this.status()) ?? initial();
    if (record.state === 'finished') return record;
    if (record.state !== 'failed') record.state = 'stopped';
    record.passed = false;
    record.computePaused = await this.paused();
    await this.ctx.storage.put('operations-run', record);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete('operations-private');
    return record;
  }
  async alarm(): Promise<void> {
    await this.stop();
  }
}
export class KilnOperationsControl extends WorkerEntrypoint<Env> {
  begin() {
    assertQualification(this.env);
    return this.env.RUN.getByName('once-v1').begin();
  }
  status() {
    assertQualification(this.env);
    return this.env.RUN.getByName('once-v1').status();
  }
  progress() {
    assertQualification(this.env);
    return this.env.RUN.getByName('once-v1').progress();
  }
  stop() {
    assertQualification(this.env);
    return this.env.RUN.getByName('once-v1').stop();
  }
  fetch() {
    return new Response('Not found', { status: 404 });
  }
}
export default { fetch: () => new Response('Not found', { status: 404 }) };
