import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import type { KilnEvaluationJob } from './evaluation-worker';
import type { KilnRenderJob } from './render-worker';
import { NativeRequestJob } from './request-job';
import { privateResponse, serviceFailure } from './http';

interface RequestEnv {
  PUBLIC_ORIGIN: string;
  TENANTS: DurableObjectNamespace;
  REQUESTS: DurableObjectNamespace<KilnNativeRequest>;
  EVALUATIONS: DurableObjectNamespace<KilnEvaluationJob>;
  RENDERS: DurableObjectNamespace<KilnRenderJob>;
}
interface InterceptorProps {
  requestId: string;
}

/** Private binding only. The admission service chooses the tenant and request ID. */
export class KilnNativeRequest extends DurableObject<RequestEnv> {
  private readonly job: NativeRequestJob;

  constructor(ctx: DurableObjectState, env: RequestEnv) {
    super(ctx, env);
    const loopback = ctx.exports as {
      KilnNativeStorage: LoopbackForExport<typeof KilnNativeStorage>;
      KilnNativeEvaluation: LoopbackForExport<typeof KilnNativeEvaluation>;
      KilnNativeRender: LoopbackForExport<typeof KilnNativeRender>;
    };
    const props = { requestId: ctx.id.toString() };
    this.job = new NativeRequestJob(ctx, {
      publicOrigin: env.PUBLIC_ORIGIN,
      storageInterceptor: loopback.KilnNativeStorage({ props }),
      evaluationInterceptor: loopback.KilnNativeEvaluation({ props }),
      renderInterceptor: loopback.KilnNativeRender({ props }),
      storage: (tenant, request) => env.TENANTS.getByName(tenant).fetch(request),
      evaluate: (id, request) => env.EVALUATIONS.getByName(id).fetch(request),
      cancelEvaluation: async (id) => {
        await env.EVALUATIONS.getByName(id).cancel();
      },
      render: (id, request) => env.RENDERS.getByName(id).fetch(request),
      cancelRender: async (id) => {
        await env.RENDERS.getByName(id).cancel();
      },
    });
  }

  async run(tenant: string, request: Request, deadlineAt: number): Promise<Response> {
    try {
      return await this.job.run(tenant, request, deadlineAt);
    } catch (error) {
      return privateResponse(serviceFailure(error));
    } finally {
      // Configuration/one-use checks can reject before the RPC body is read.
      // Close that stream so it cannot retain the caller's execution context.
      if (!request.bodyUsed) await request.body?.cancel().catch(() => {});
    }
  }
  async storage(request: Request): Promise<Response> {
    // Convert deliberate HTTP errors before RPC serializes away their prototype.
    try {
      return await this.job.storageRequest(request);
    } catch (error) {
      return privateResponse(serviceFailure(error));
    }
  }
  async evaluate(request: Request): Promise<Response> {
    try {
      return await this.job.evaluateRequest(request);
    } catch (error) {
      return privateResponse(serviceFailure(error));
    }
  }
  cancel(): Promise<void> {
    return this.job.cancel();
  }
  async render(request: Request): Promise<Response> {
    try {
      return await this.job.renderRequest(request);
    } catch (error) {
      return privateResponse(serviceFailure(error));
    }
  }
  alarm(): Promise<void> {
    return this.job.alarm();
  }
}

/** No HTTP field chooses a request object; only the host-configured binding props do. */
export class KilnNativeStorage extends WorkerEntrypoint<RequestEnv, InterceptorProps> {
  async fetch(request: Request): Promise<Response> {
    try {
      if (!/^[a-f0-9]{64}$/.test(this.ctx.props.requestId)) throw new Error('Invalid binding');
      const id = this.env.REQUESTS.idFromString(this.ctx.props.requestId);
      return await this.env.REQUESTS.get(id).storage(request);
    } catch (error) {
      return privateResponse(serviceFailure(error));
    }
  }
}

export class KilnNativeEvaluation extends WorkerEntrypoint<RequestEnv, InterceptorProps> {
  async fetch(request: Request): Promise<Response> {
    try {
      if (!/^[a-f0-9]{64}$/.test(this.ctx.props.requestId)) throw new Error('Invalid binding');
      const id = this.env.REQUESTS.idFromString(this.ctx.props.requestId);
      return await this.env.REQUESTS.get(id).evaluate(request);
    } catch (error) {
      return privateResponse(serviceFailure(error));
    }
  }
}

export class KilnNativeRender extends WorkerEntrypoint<RequestEnv, InterceptorProps> {
  async fetch(request: Request): Promise<Response> {
    try {
      if (!/^[a-f0-9]{64}$/.test(this.ctx.props.requestId)) throw new Error('Invalid binding');
      const id = this.env.REQUESTS.idFromString(this.ctx.props.requestId);
      return await this.env.REQUESTS.get(id).render(request);
    } catch (error) {
      return privateResponse(serviceFailure(error));
    }
  }
}

export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
