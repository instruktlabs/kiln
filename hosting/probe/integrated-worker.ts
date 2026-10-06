import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { KilnNativeRequest } from '../src/request-worker';
import { KilnEvaluationJob } from '../src/evaluation-worker';
import { KilnRenderJob } from '../src/render-worker';
import type { KilnAdmission } from '../src/admission-worker';
import { IntegratedBudget, type IntegratedKind } from './integrated-budget';
import { runIntegratedOnce } from './integrated-run';

export { KilnNativeStorage, KilnNativeEvaluation, KilnNativeRender } from '../src/request-worker';
export { KilnTenant } from '../src/tenant';
export { KilnAdmission } from '../src/admission-worker';

interface BudgetBindings {
  BUDGET: DurableObjectNamespace<KilnIntegratedBudget>;
}
interface RunBindings extends BudgetBindings {
  RUN: DurableObjectNamespace<KilnIntegratedRun>;
  ADMISSION: DurableObjectNamespace<KilnAdmission>;
  ARTIFACTS: R2Bucket;
}
const budget = (env: unknown) => (env as BudgetBindings).BUDGET.getByName('integrated-v1');

async function claimRequest(env: unknown, kind: IntegratedKind, id: string, request: Request) {
  try {
    await budget(env).claim(kind, id);
  } catch (error) {
    if (!request.bodyUsed) await request.body?.cancel().catch(() => {});
    throw error;
  }
}

/** Wrappers add only the diagnostic allowance; production run/fetch/cancel/alarm stay intact. */
export class IntegratedRequestJob extends KilnNativeRequest {
  override async run(tenant: string, request: Request, deadline: number): Promise<Response> {
    await claimRequest(this.env, 'coordinator', this.ctx.id.toString(), request);
    return super.run(tenant, request, deadline);
  }
}
export class IntegratedEvaluationJob extends KilnEvaluationJob {
  override async fetch(request: Request): Promise<Response> {
    await claimRequest(this.env, 'evaluation', this.ctx.id.toString(), request);
    return super.fetch(request);
  }
}
export class IntegratedRenderJob extends KilnRenderJob {
  override async fetch(request: Request): Promise<Response> {
    await claimRequest(this.env, 'render', this.ctx.id.toString(), request);
    return super.fetch(request);
  }
}
export class KilnIntegratedBudget extends DurableObject {
  private readonly budget = new IntegratedBudget(this.ctx.storage);
  open() {
    return this.budget.open();
  }
  claim(kind: IntegratedKind, id: string) {
    return this.budget.claim(kind, id);
  }
  close() {
    return this.budget.close();
  }
  status() {
    return this.budget.status();
  }
}
export class KilnIntegratedRun extends DurableObject<RunBindings> {
  run() {
    const allowance = budget(this.env),
      admission = this.env.ADMISSION.getByName('global-v1');
    return runIntegratedOnce(this.ctx.storage, {
      open: () => allowance.open(),
      close: () => allowance.close(),
      pause: async () => {
        await admission.setPaused(true);
      },
      status: () => admission.status(),
      dispatch: (tenant, request) => admission.dispatch(tenant, request),
      retain: async (name, bytes) => {
        await this.env.ARTIFACTS.put(`probe-evidence/${name}.json`, bytes, {
          httpMetadata: { contentType: 'application/json' },
        });
      },
    });
  }
  async status() {
    return this.ctx.storage.get('run');
  }
}
export class KilnIntegratedControl extends WorkerEntrypoint<RunBindings> {
  fetch() {
    return new Response('Not found', { status: 404 });
  }
  runFixed() {
    return this.env.RUN.getByName('integrated-v1').run();
  }
  async stop() {
    await budget(this.env).close();
    await this.env.ADMISSION.getByName('global-v1').setPaused(true);
    return this.status();
  }
  async status() {
    return {
      run: await this.env.RUN.getByName('integrated-v1').status(),
      budget: await budget(this.env).status(),
      admission: await this.env.ADMISSION.getByName('global-v1').status(),
    };
  }
}
export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler;
