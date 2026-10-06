import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
export { default } from '../src/worker';

// This test-only backend records routing and transport data. It never evaluates
// source or claims to implement the engine's MCP tools.
export class TestTenant extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    return Response.json({
      tenant: this.ctx.id.toString(),
      path: new URL(request.url).pathname,
      headers: Object.fromEntries(request.headers),
      body: request.method === 'POST' ? await request.text() : null,
    });
  }
}

// Auth tests observe routing only. Actual admission/compute has separate fixtures.
export class TestCompute extends WorkerEntrypoint<{ TENANTS: DurableObjectNamespace }> {
  dispatch(tenant: string, request: Request): Promise<Response> {
    return this.env.TENANTS.getByName(tenant).fetch(request);
  }
}
