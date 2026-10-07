import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { ComputeAdmission, admissionFailure } from './admission';
import type { KilnNativeRequest } from './request-worker';

interface ComputeBinding {
  ADMISSION: DurableObjectNamespace<KilnAdmission>;
}
interface AdmissionEnv extends ComputeBinding {
  REQUESTS: DurableObjectNamespace<KilnNativeRequest>;
  COMPUTE_MAX_CONCURRENT: string;
  COMPUTE_TENANT_PER_MINUTE: string;
  COMPUTE_TENANT_PER_DAY: string;
  COMPUTE_GLOBAL_PER_DAY: string;
  COMPUTE_GLOBAL_PER_MONTH: string;
  COMPUTE_DEADLINE_MS: string;
}

function limit(value: string): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))
    throw new Error('Missing compute policy');
  return Number(value);
}

export class KilnAdmission extends DurableObject<AdmissionEnv> {
  private readonly admission: ComputeAdmission;
  constructor(ctx: DurableObjectState, env: AdmissionEnv) {
    super(ctx, env);
    this.admission = new ComputeAdmission(
      ctx.storage,
      {
        run: (id, tenant, request, deadline) =>
          env.REQUESTS.getByName(id).run(tenant, request, deadline),
        cancel: async (id) => {
          await env.REQUESTS.getByName(id).cancel();
        },
      },
      {
        maxConcurrent: limit(env.COMPUTE_MAX_CONCURRENT),
        tenantPerMinute: limit(env.COMPUTE_TENANT_PER_MINUTE),
        tenantPerDay: limit(env.COMPUTE_TENANT_PER_DAY),
        globalPerDay: limit(env.COMPUTE_GLOBAL_PER_DAY),
        globalPerMonth: limit(env.COMPUTE_GLOBAL_PER_MONTH),
        deadlineMs: limit(env.COMPUTE_DEADLINE_MS),
      },
    );
  }
  async dispatch(tenant: string, request: Request): Promise<Response> {
    try {
      return await this.admission.dispatch(tenant, request);
    } catch (error) {
      return admissionFailure(error);
    }
  }
  status() {
    return this.admission.status();
  }
  async setPaused(paused: boolean) {
    await this.admission.setPaused(paused);
    return this.admission.status();
  }
  retireTenant(tenant: string): Promise<void> {
    return this.admission.retireTenant(tenant);
  }
  alarm(): Promise<void> {
    return this.admission.alarm();
  }
}

/** Gateway receives only this binding, never a selectable DO namespace. */
export class KilnCompute extends WorkerEntrypoint<ComputeBinding> {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  }
  /** Aggregate read-only health, with no tenant identifiers or operator controls. */
  health() {
    return this.env.ADMISSION.getByName('global-v1').status();
  }
  async dispatch(tenant: string, request: Request): Promise<Response> {
    try {
      return await this.env.ADMISSION.getByName('global-v1').dispatch(tenant, request);
    } catch (error) {
      return admissionFailure(error);
    }
  }
  /** Only the gateway's verified account-deletion controller may call this. */
  retireTenant(tenant: string): Promise<void> {
    return this.env.ADMISSION.getByName('global-v1').retireTenant(tenant);
  }
}

/** Bind only to an authenticated operator service; never to the public gateway. */
export class KilnComputeControl extends WorkerEntrypoint<ComputeBinding> {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  }
  status() {
    return this.env.ADMISSION.getByName('global-v1').status();
  }
  setPaused(paused: boolean) {
    return this.env.ADMISSION.getByName('global-v1').setPaused(paused);
  }
}

export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
