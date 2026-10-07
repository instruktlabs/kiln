import type { KilnLifecycleBudget } from './lifecycle-allowance-worker';
import type { LifecycleKind } from './lifecycle-budget';

export interface LifecycleAllowanceEnv {
  BUDGET: DurableObjectNamespace<KilnLifecycleBudget>;
}
export const lifecycleAllowance = (env: unknown) =>
  (env as LifecycleAllowanceEnv).BUDGET.getByName('lifecycle-v1');

export async function claimLifecycle(
  env: unknown,
  kind: LifecycleKind,
  id: string,
  request: Request,
): Promise<void> {
  try {
    await lifecycleAllowance(env).claim(kind, id);
  } catch {
    if (!request.bodyUsed) await request.body?.cancel().catch(() => {});
    throw new Error('PRIVATE_LIFECYCLE_ALLOWANCE_DENIED');
  }
}
