import { DurableObject } from 'cloudflare:workers';
import { ContainerRenderJob } from './container-job';
import { handleRenderRequest } from './evaluation-request';

/** Private image-bound rendering job; no source evaluation or public entrypoint. */
export class KilnRenderJob extends DurableObject {
  private readonly job = new ContainerRenderJob(this.ctx);

  fetch(request: Request): Promise<Response> {
    return handleRenderRequest(request, this.job);
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
