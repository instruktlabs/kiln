import { DurableObject } from 'cloudflare:workers';
import { ContainerEvaluationJob } from './container-job';
import { handleEvaluationRequest } from './evaluation-request';

/** Only the private dispatcher receives this binding; never the public gateway. */
export class KilnEvaluationJob extends DurableObject {
  fetch(request: Request): Promise<Response> {
    return handleEvaluationRequest(request, new ContainerEvaluationJob(this.ctx));
  }

  alarm(): Promise<void> {
    return new ContainerEvaluationJob(this.ctx).alarm();
  }
}

export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
