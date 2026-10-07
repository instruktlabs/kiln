import { DurableObject } from 'cloudflare:workers';
import { LifecycleBudget, type LifecycleKind } from './lifecycle-budget';

export class KilnLifecycleBudget extends DurableObject {
  private readonly allowance = new LifecycleBudget(this.ctx.storage);
  open() {
    return this.allowance.open();
  }
  claim(kind: LifecycleKind, id: string) {
    return this.allowance.claim(kind, id);
  }
  close() {
    return this.allowance.close();
  }
  status() {
    return this.allowance.status();
  }
}
export default { fetch: () => new Response('Not found', { status: 404 }) };
