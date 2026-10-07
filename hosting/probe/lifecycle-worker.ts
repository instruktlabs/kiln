import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { lifecycleAllowance, type LifecycleAllowanceEnv } from './lifecycle-binding';
import { runGatewayPreflight, type PreflightEnv } from './gateway-preflight';
import { runLifecycleOnce } from './lifecycle-run';
import {
  assertQualification,
  privateJson,
  qualificationOrigin,
  syntheticAccount,
} from './qualification-accounts';
import { tenantForAccount } from '../src/tenant-identity';
import type { KilnCompute } from '../src/admission-worker';
import { qualificationControl as control } from './qualification-rpc';

interface Env extends PreflightEnv, LifecycleAllowanceEnv {
  RUN: DurableObjectNamespace<KilnLifecycleRun>;
  EXPECTED_IMAGE: string;
}
interface Receipt {
  state: 'running' | 'finished' | 'stopped';
  passed: boolean;
  preflight: Awaited<ReturnType<typeof runGatewayPreflight>> | null;
  native: Awaited<ReturnType<typeof runLifecycleOnce>> | null;
}
type ComputeStatus = Awaited<ReturnType<KilnCompute['health']>>;
export class KilnLifecycleRun extends DurableObject<Env> {
  private async checkRunning() {
    if (await this.ctx.storage.get('operator-stopped')) throw new Error('PRIVATE_OPERATOR_STOPPED');
  }
  private async seal() {
    const [allowance, paused] = await Promise.allSettled([
      control(lifecycleAllowance(this.env).close()),
      control<ComputeStatus>(this.env.CONTROL.setPaused(true)),
    ]);
    return (
      allowance.status === 'fulfilled' &&
      paused.status === 'fulfilled' &&
      paused.value.paused &&
      paused.value.activeRequests === 0 &&
      paused.value.pendingCleanup === 0
    );
  }
  async run(): Promise<Receipt> {
    assertQualification(this.env);
    const record: Receipt = { state: 'running', passed: false, preflight: null, native: null };
    const claimed = await this.ctx.storage.transaction(async (tx) => {
      if (await tx.get('combined-lifecycle')) return false;
      if (await tx.get('operator-stopped')) record.state = 'stopped';
      await tx.put('combined-lifecycle', record);
      return record.state === 'running';
    });
    if (!claimed) return (await this.ctx.storage.get<Receipt>('combined-lifecycle'))!;
    try {
      // Stop admission and consume the allowance on interruption, even if the
      // observer goes away. No alarm can reopen or retry this one-use sequence.
      await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
      await this.checkRunning();
      record.preflight = await runGatewayPreflight(this.ctx.storage, this.env);
      await this.ctx.storage.put('combined-lifecycle', record);
      if (!record.preflight.passed) throw new Error('PRIVATE_PREFLIGHT_FAILED');
      await this.checkRunning();
      // Fresh grants for the same two permanent fixture accounts. Alice's old
      // revoked connection stays revoked. Secrets remain in this invocation.
      const owner = await syntheticAccount(this.env, 'alice');
      await this.checkRunning();
      const other = await syntheticAccount(this.env, 'bob');
      await this.checkRunning();
      const tenant = this.env.TENANTS.getByName(
        await tenantForAccount(qualificationOrigin, owner.account.id),
      );
      const accounts = { owner, other };
      record.native = await runLifecycleOnce(this.ctx.storage, {
        expectedImage: this.env.EXPECTED_IMAGE,
        open: async () => {
          await this.checkRunning();
          await control(lifecycleAllowance(this.env).open());
          await this.checkRunning();
          await control(this.env.CONTROL.setPaused(false));
          await this.checkRunning();
        },
        close: () => control(lifecycleAllowance(this.env).close()),
        pause: async () => {
          await control(this.env.CONTROL.setPaused(true));
        },
        status: () => control(this.env.COMPUTE.health()),
        mcp: async (account, request) => {
          await this.checkRunning();
          const headers = new Headers(request.headers);
          headers.set('authorization', `Bearer ${accounts[account].accessToken}`);
          return this.env.GATEWAY.fetch(new Request(request, { headers }));
        },
        download: async (account, path, signal) => {
          await this.checkRunning();
          return this.env.GATEWAY.fetch(
            new Request(`${qualificationOrigin}${path}`, {
              // Anonymous GET would redirect to login; HEAD exercises denial.
              method: account === 'anonymous' ? 'HEAD' : 'GET',
              signal,
              headers: account === 'anonymous' ? {} : { cookie: accounts[account].cookie },
            }),
          );
        },
        dropMaterial: async (materialId, revisionId) => {
          await this.checkRunning();
          if (
            materialId !== 'qualification-stone' ||
            !/^sha256:[a-f0-9]{64}(?![\s\S])/.test(revisionId)
          )
            throw new Error('PRIVATE_MATERIAL_SELECTION');
          const group = await privateJson(
            await tenant.fetch(
              `https://tenant.internal/internal/materials/${materialId}/${revisionId.slice(7)}`,
            ),
          );
          if (typeof group.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(group.id))
            throw new Error('PRIVATE_MATERIAL_GROUP');
          await privateJson(
            await tenant.fetch(`https://tenant.internal/internal/groups/${group.id}`, {
              method: 'DELETE',
            }),
          );
        },
        retain: async (name, bytes) => {
          await this.env.ARTIFACTS.put(`probe-evidence/native-${name}.bin`, bytes, {
            httpMetadata: { contentType: 'application/octet-stream' },
          });
        },
      });
      record.passed = record.native.passed;
    } catch {
      record.passed = false;
    } finally {
      const sealed = await this.seal();
      await this.ctx.storage.transaction(async (tx) => {
        const stopped = Boolean(await tx.get('operator-stopped'));
        record.state = stopped ? 'stopped' : 'finished';
        record.passed &&= sealed && !stopped;
        await tx.put('combined-lifecycle', record);
      });
      // Recover promptly when either control acknowledgement remains unknown.
      if (sealed) await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(Date.now() + 60000);
    }
    return record;
  }
  async stop() {
    await this.ctx.storage.transaction(async (tx) => {
      await tx.put('operator-stopped', true);
      const record = await tx.get<Receipt>('combined-lifecycle');
      if (record?.state === 'running') {
        record.state = 'stopped';
        record.passed = false;
        await tx.put('combined-lifecycle', record);
      }
    });
    const sealed = await this.seal();
    if (!sealed) await this.ctx.storage.setAlarm(Date.now() + 60000);
    else await this.ctx.storage.deleteAlarm();
    return this.status();
  }
  async alarm() {
    await this.stop();
  }
  async status() {
    const [record, budget, admission] = await Promise.all([
      this.ctx.storage.get<Receipt>('combined-lifecycle'),
      control(lifecycleAllowance(this.env).status()),
      control(this.env.COMPUTE.health()),
    ]);
    return {
      record: record ?? null,
      budget: budget ?? null,
      admission,
      alarmAt: await this.ctx.storage.getAlarm(),
      operatorStopped: Boolean(await this.ctx.storage.get('operator-stopped')),
    };
  }
}
export class KilnLifecycleControl extends WorkerEntrypoint<Env> {
  fetch() {
    return new Response('Not found', { status: 404 });
  }
  async runFixed() {
    using result = await this.env.RUN.getByName('lifecycle-v1').run();
    return structuredClone(result);
  }
  async status() {
    using result = await this.env.RUN.getByName('lifecycle-v1').status();
    return structuredClone(result);
  }
  async stop() {
    using result = await this.env.RUN.getByName('lifecycle-v1').stop();
    return structuredClone(result);
  }
}
export default { fetch: () => new Response('Not found', { status: 404 }) };
