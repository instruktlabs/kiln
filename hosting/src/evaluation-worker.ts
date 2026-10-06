import { DurableObject } from 'cloudflare:workers';
import { ContainerEvaluationJob } from './container-job';
import { handleEvaluationRequest } from './evaluation-request';

/** Only the private dispatcher receives this binding; never the public gateway. */
export class KilnEvaluationJob extends DurableObject {
  private readonly job = new ContainerEvaluationJob(this.ctx);

  fetch(request: Request): Promise<Response> {
    return handleEvaluationRequest(request, this.job);
  }

  cancel(): Promise<void> {
    return this.job.cancel();
  }

  alarm(): Promise<void> {
    return this.job.alarm();
  }
}

export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
