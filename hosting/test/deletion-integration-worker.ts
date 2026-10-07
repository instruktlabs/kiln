import { WorkerEntrypoint } from 'cloudflare:workers';
import gateway, { type Env } from '../src/worker';

// No native job is started in this identity/storage fixture. The real admission
// cancellation contract is exercised separately by admission-worker.test.mjs.
export class EmptyCompute extends WorkerEntrypoint<Env> {
  health() {
    return { paused: false, activeRequests: 0, pendingCleanup: 0, maxConcurrent: 1 };
  }
  dispatch(): Response {
    return new Response('Native execution excluded from fixture', { status: 503 });
  }
  async retireTenant(tenant: string): Promise<void> {
    await this.env.ACCOUNTS.prepare(
      'CREATE TABLE IF NOT EXISTS fixture_retired (tenant TEXT PRIMARY KEY)',
    ).run();
    await this.env.ACCOUNTS.prepare('INSERT OR IGNORE INTO fixture_retired VALUES (?)')
      .bind(tenant)
      .run();
  }
}

// Allows tests to invoke the actual scheduled handler. This file never ships.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname === '/fixture/recover') {
      await gateway.scheduled({ cron: '* * * * *', scheduledTime: Date.now(), noRetry() {} }, env);
      return new Response('Recovered');
    }
    return gateway.fetch(request, env, ctx);
  },
};
