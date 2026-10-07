import { DurableObject } from 'cloudflare:workers';
import { ArtifactStore } from '../src/artifact-store';
import { RecoveryArtifactAudit } from '../src/recovery-artifact-audit';
import { serviceFailure } from '../src/http';

// Synthetic private fixture only. No corresponding production HTTP route exists.
export class RecoveryArtifactFixture extends DurableObject<{ ARTIFACTS: R2Bucket }> {
  private readonly artifacts: ArtifactStore;
  private readonly audit: RecoveryArtifactAudit;
  private readonly boundedAudit: RecoveryArtifactAudit;
  private reads = 0;
  private cancels = 0;
  private fault = '';
  private releaseGet?: () => void;
  constructor(ctx: DurableObjectState, env: { ARTIFACTS: R2Bucket }) {
    super(ctx, env);
    this.artifacts = new ArtifactStore(ctx, env.ARTIFACTS, {
      maxBytes: 1024 * 1024,
      maxObjects: 64,
      maxGroups: 32,
    });
    const fixture = this;
    const bucket = new Proxy(env.ARTIFACTS, {
      get(target, key) {
        if (key === 'get')
          return async (...args: Parameters<R2Bucket['get']>) => {
            fixture.reads++;
            if (fixture.fault === 'provider-error') throw new Error('PRIVATE_PROVIDER_FAILURE');
            const object = await target.get(...args);
            if (!object || !('body' in object)) return object;
            if (fixture.fault === 'metadata-change')
              ctx.storage.sql.exec("UPDATE artifacts SET state='deleting'");
            if (fixture.fault === 'retire-during-read')
              ctx.storage.sql.exec("INSERT INTO storage_retirement VALUES (1,'retiring')");
            if (fixture.fault === 'stalled-get') {
              await new Promise((resolve) => setTimeout(resolve, 80));
            }
            if (fixture.fault === 'held-get')
              await new Promise<void>((resolve) => {
                fixture.releaseGet = resolve;
              });
            if (fixture.fault === 'retire-during-body') {
              const bytes = new Uint8Array(await object.arrayBuffer());
              const body = new ReadableStream<Uint8Array>(
                {
                  pull(controller) {
                    ctx.storage.sql.exec("INSERT INTO storage_retirement VALUES (1,'retiring')");
                    controller.enqueue(bytes);
                    controller.close();
                  },
                },
                { highWaterMark: 0 },
              );
              return new Proxy(object, {
                get(target, key) {
                  return key === 'body' ? body : Reflect.get(target, key);
                },
              });
            }
            if (
              ![
                'wrong-body',
                'long-body',
                'short-body',
                'stalled-body',
                'stalled-get',
                'held-get',
              ].includes(fixture.fault)
            )
              return object;
            await object.body.cancel();
            const body = new ReadableStream<Uint8Array>({
              start(controller) {
                if (fixture.fault !== 'stalled-body') {
                  const length =
                    object.size +
                    (fixture.fault === 'long-body' ? 1 : fixture.fault === 'short-body' ? -1 : 0);
                  controller.enqueue(new Uint8Array(length).fill(90));
                  if (!['long-body', 'stalled-get', 'held-get'].includes(fixture.fault))
                    controller.close();
                }
              },
              cancel() {
                fixture.cancels++;
              },
            });
            return new Proxy(object, {
              get(target, key) {
                if (key === 'body') return body;
                const value = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          };
        if (
          ['put', 'delete', 'createMultipartUpload', 'resumeMultipartUpload'].includes(String(key))
        )
          return () => {
            throw new Error('Recovery audit must not mutate R2');
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    this.audit = new RecoveryArtifactAudit(ctx, bucket);
    this.boundedAudit = new RecoveryArtifactAudit(ctx, bucket, 40);
  }
  async alarm(): Promise<void> {
    await this.artifacts.sweep();
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/upload')
        return Response.json(await this.artifacts.upload(request), { status: 201 });
      if (path === '/save') return Response.json(this.artifacts.save(await request.json()).record);
      if (path === '/retire') return Response.json(await this.artifacts.retire());
      if (path.startsWith('/delete/')) {
        await this.artifacts.deleteGroup(path.slice('/delete/'.length));
        return new Response('Deleted');
      }
      if (path.startsWith('/audit/'))
        return Response.json(
          await (this.fault.startsWith('stalled-') || this.fault === 'held-get'
            ? this.boundedAudit
            : this.audit
          ).verify(path.slice('/audit/'.length)),
        );
      if (path === '/release-get') {
        this.releaseGet?.();
        this.releaseGet = undefined;
        return new Response('Released');
      }
      if (path.startsWith('/fault/')) {
        this.fault = path.slice('/fault/'.length);
        return new Response('Configured');
      }
      if (path === '/counts') return Response.json({ reads: this.reads, cancels: this.cancels });
      if (path === '/alarm') return Response.json(await this.ctx.storage.getAlarm());
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return serviceFailure(error);
    }
  }
}
export default { fetch: () => new Response('Not found', { status: 404 }) };
