import { DurableObject } from 'cloudflare:workers';
import { ArtifactStore } from '../src/artifact-store';
import { serviceFailure } from '../src/http';

// Never bundled for deployment. The real R2 binding is wrapped only to delay
// acknowledgement or reject deletion, while SQLite inspection controls faults.
export class StorageFaultFixture extends DurableObject<{ ARTIFACTS: R2Bucket }> {
  private readonly artifacts: ArtifactStore;
  constructor(ctx: DurableObjectState, env: { ARTIFACTS: R2Bucket }) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS faults (name TEXT PRIMARY KEY)');
    const fault = (name: string) =>
      ctx.storage.sql.exec('SELECT 1 FROM faults WHERE name = ?', name).toArray().length > 0;
    const bucket = new Proxy(env.ARTIFACTS, {
      get(target, key) {
        if (key === 'put')
          return async (...args: Parameters<R2Bucket['put']>) => {
            const result = await target.put(...args);
            if (fault('slow-ack')) await new Promise((resolve) => setTimeout(resolve, 1500));
            return result;
          };
        if (key === 'delete')
          return async (...args: Parameters<R2Bucket['delete']>) => {
            if (fault('delete-failure')) throw new Error('Injected deletion failure');
            return target.delete(...args);
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    let fixtureClock = Date.now();
    this.artifacts = new ArtifactStore(
      ctx,
      bucket,
      { maxBytes: 1024 * 1024, maxObjects: 32, maxGroups: 8 },
      () =>
        fault('ticking-clock') ? ++fixtureClock : Date.now() + (fault('aged') ? 16 * 60 * 1000 : 0),
      500,
    );
  }
  async alarm(): Promise<void> {
    await this.artifacts.sweep();
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/upload-short' || path === '/upload-large' || path === '/upload-negative') {
        const headers = new Headers(request.headers);
        headers.set(
          'content-length',
          path === '/upload-short'
            ? '2'
            : path === '/upload-large'
              ? String(64 * 1024 * 1024 + 1)
              : '-1',
        );
        return Response.json(await this.artifacts.upload(new Request(request, { headers })), {
          status: 201,
        });
      }
      if (path === '/upload')
        return Response.json(await this.artifacts.upload(request), { status: 201 });
      if (path === '/sweep') return Response.json(await this.artifacts.sweep());
      if (path === '/usage') return Response.json(this.artifacts.usage());
      if (path.startsWith('/download/'))
        return await this.artifacts.download(path.slice('/download/'.length));
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return serviceFailure(error);
    }
  }
}
export default { fetch: () => new Response('Not found', { status: 404 }) };
