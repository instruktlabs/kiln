import { KilnRenderJob as RenderJob } from '../src/render-worker';
import { claimLifecycle } from './lifecycle-binding';
export { default } from '../src/render-worker';
export class KilnRenderJob extends RenderJob {
  override async fetch(request: Request): Promise<Response> {
    await claimLifecycle(this.env, 'render', this.ctx.id.toString(), request);
    return super.fetch(request);
  }
}
