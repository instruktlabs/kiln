import { KilnEvaluationJob as EvaluationJob } from '../src/evaluation-worker';
import { claimLifecycle } from './lifecycle-binding';
export { default } from '../src/evaluation-worker';
export class KilnEvaluationJob extends EvaluationJob {
  override async fetch(request: Request): Promise<Response> {
    await claimLifecycle(this.env, 'evaluation', this.ctx.id.toString(), request);
    return super.fetch(request);
  }
}
