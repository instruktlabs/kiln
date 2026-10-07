import { routeClass } from './request-limits';
import type { TenantEnv } from './gateway';

export interface OperationsEnv {
  OPERATIONS?: Pick<AnalyticsEngineDataset, 'writeDataPoint'>;
}
interface DeletionHealth {
  pending: number;
  oldestPendingMs: number;
  overdue: number;
}
interface ComputeHealth {
  paused: boolean;
  activeRequests: number;
  pendingCleanup: number;
  maxConcurrent: number;
}
export interface OperationalHealth {
  deletion: DeletionHealth | null;
  compute: ComputeHealth | null;
}
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function deletionHealth(value: unknown): DeletionHealth | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as DeletionHealth;
  if (!count(v.pending) || !count(v.oldestPendingMs) || !count(v.overdue) || v.overdue > v.pending)
    return null;
  return { pending: v.pending, oldestPendingMs: v.oldestPendingMs, overdue: v.overdue };
}
function computeHealth(value: unknown): ComputeHealth | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as ComputeHealth;
  if (
    typeof v.paused !== 'boolean' ||
    !count(v.activeRequests) ||
    !count(v.pendingCleanup) ||
    !count(v.maxConcurrent) ||
    v.maxConcurrent === 0 ||
    v.pendingCleanup > v.activeRequests
  )
    return null;
  return {
    paused: v.paused,
    activeRequests: v.activeRequests,
    pendingCleanup: v.pendingCleanup,
    maxConcurrent: v.maxConcurrent,
  };
}
function emit(env: OperationsEnv, index: string, labels: string[], values: number[]): void {
  try {
    // Explicit positional fields only. Never log a Request, response, exception,
    // account, URL, environment or arbitrary caller-provided object.
    env.OPERATIONS?.writeDataPoint({
      indexes: [index],
      blobs: ['kiln.ops.v1', ...labels],
      doubles: [1, ...values],
    });
  } catch {
    /* Observability failure cannot change authorization or cleanup. */
  }
}
export function recordResponse(
  env: OperationsEnv,
  path: string,
  status: number,
  elapsedMs: number,
): void {
  if (
    typeof path !== 'string' ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > Number.MAX_SAFE_INTEGER
  )
    return;
  emit(env, 'http', ['http', routeClass(path), String(status)], [Math.round(elapsedMs)]);
}
export function recordHealth(
  env: OperationsEnv,
  health: OperationalHealth,
  recovered: boolean,
): void {
  const deletion = deletionHealth(health.deletion),
    compute = computeHealth(health.compute);
  emit(
    env,
    'health:deletion',
    ['health', 'deletion', deletion ? 'ok' : 'unavailable'],
    deletion
      ? [deletion.pending, deletion.oldestPendingMs, deletion.overdue, Number(recovered === true)]
      : [-1, -1, -1, Number(recovered === true)],
  );
  emit(
    env,
    'health:compute',
    ['health', 'compute', compute ? 'ok' : 'unavailable'],
    compute
      ? [
          Number(compute.paused),
          compute.activeRequests,
          compute.pendingCleanup,
          compute.maxConcurrent,
        ]
      : [-1, -1, -1, -1],
  );
}
async function boundedRead(read: () => Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 2000);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
export async function readOperationalHealth(
  env: Pick<TenantEnv, 'NATIVE_COMPUTE'> & { ACCOUNTS: D1Database },
  now = Date.now(),
): Promise<OperationalHealth> {
  const [deletion, compute] = await Promise.all([
    boundedRead(async () =>
      env.ACCOUNTS.withSession('first-primary')
        .prepare(
          `SELECT COUNT(*) AS pending, COALESCE(MAX(0,?-MIN(created_at)),0) AS oldestPendingMs,
      COALESCE(SUM(created_at<=?),0) AS overdue FROM kiln_deletions
      WHERE phase IN ('compute','storage','grants','identity')`,
        )
        .bind(now, now - 15 * 60_000)
        .first(),
    ),
    boundedRead(async () => env.NATIVE_COMPUTE?.health()),
  ]);
  return { deletion: deletionHealth(deletion), compute: computeHealth(compute) };
}
