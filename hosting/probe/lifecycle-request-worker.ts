import { KilnNativeRequest as NativeRequest } from '../src/request-worker';
import { claimLifecycle } from './lifecycle-binding';
export {
  default,
  KilnNativeStorage,
  KilnNativeEvaluation,
  KilnNativeRender,
} from '../src/request-worker';
export class KilnNativeRequest extends NativeRequest {
  override async run(tenant: string, request: Request, deadline: number): Promise<Response> {
    await claimLifecycle(this.env, 'coordinator', this.ctx.id.toString(), request);
    return super.run(tenant, request, deadline);
  }
}
