import gateway, { type Env } from '../src/worker';
import { readOperationalHealth } from '../src/operations';

// Captured datapoints and faults are confined to this local fixture.
const points: AnalyticsEngineDataPoint[] = [];
export default {
  async fetch(request: Request, bindings: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const env = {
      ...bindings,
      OPERATIONS: {
        writeDataPoint(point: AnalyticsEngineDataPoint) {
          if (request.headers.has('x-fixture-metrics-failure'))
            throw new Error('private-metrics-error');
          points.push(point);
        },
      },
      NATIVE_COMPUTE: {
        async health() {
          return { paused: false, activeRequests: 0, pendingCleanup: 0, maxConcurrent: 2 };
        },
      },
    } as unknown as Env;
    if (request.headers.has('x-fixture-database-failure'))
      env.ACCOUNTS = {
        withSession() {
          throw new Error('private-database-error');
        },
      } as unknown as D1Database;
    if (url.pathname === '/fixture/points') return Response.json(points.splice(0));
    if (url.pathname === '/fixture/health')
      return Response.json(await readOperationalHealth(env, 1000000));
    if (url.pathname === '/fixture/scheduled') {
      try {
        await gateway.scheduled(
          { cron: '* * * * *', scheduledTime: Date.now(), noRetry() {} },
          env,
        );
        return new Response('ok');
      } catch {
        return new Response('unavailable', { status: 503 });
      }
    }
    return gateway.fetch(request, env, ctx);
  },
};
