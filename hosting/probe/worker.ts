import { DurableObject } from 'cloudflare:workers';
import { ContainerEvaluationJob, ContainerJobFailure } from '../src/container-job';
import { engineRequest, glbDigest, nativeFixtures } from './fixtures';
import { observeContainer } from './observe-container';
import { probeCases, runProbeOnce, type ProbeCase, type ProbeResult } from './run-once';

interface ProbeBindings {
  KilnProbeRun: DurableObjectNamespace<KilnProbeRun>;
  KilnProbeJob: DurableObjectNamespace<KilnProbeJob>;
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export class KilnProbeJob extends DurableObject {
  async runFixture(name: ProbeCase): Promise<ProbeResult> {
    if (!probeCases.includes(name)) throw new Error('Unknown fixed fixture');
    const actual = this.ctx.container;
    if (!actual) return { name, passed: false, reason: 'CONTAINER_UNAVAILABLE' };
    const image = actual.images.kiln;
    const started = Date.now();
    const script = nativeFixtures[name];
    // This substitution exists only in the private probe bundle. Production
    // ContainerEvaluationJob always invokes the immutable evaluate.mjs entry.
    const observed = observeContainer(actual, script);
    try {
      const output = await new ContainerEvaluationJob({
        container: observed.container,
        storage: this.ctx.storage,
      }).run(script ? new TextEncoder().encode('{}') : engineRequest, {
        deadlineMs: 60_000,
        maxResponseBytes: 1024 * 1024,
      });
      const stopped = !actual.running && (await actual.inspect()) === null;
      const value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(output),
      );
      let passed = value.ok === true;
      let outputDigest: string | undefined;
      if (!script) {
        passed &&=
          value.version === 'kiln.evaluator.result.v2' && value.requestId === 'image-fixture';
        const binary = atob(value.render?.glbBase64 ?? '');
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        outputDigest = await digest(bytes);
        passed &&= bytes.byteLength === 1912 && outputDigest === glbDigest;
      }
      return {
        name,
        passed: passed && stopped,
        stopped,
        image,
        elapsedMs: Date.now() - started,
        digest: outputDigest,
      };
    } catch (error) {
      return {
        name,
        passed: false,
        image,
        elapsedMs: Date.now() - started,
        stopped: !actual.running && (await actual.inspect()) === null,
        reason: error instanceof ContainerJobFailure ? error.code : 'CHECK_FAILED',
        failedOperation: observed.failure(),
      };
    }
  }

  async alarm() {
    await new ContainerEvaluationJob(this.ctx).alarm();
  }
}

export class KilnProbeRun extends DurableObject {
  async run() {
    const bindings = this.ctx.exports as unknown as ProbeBindings;
    return runProbeOnce(this.ctx.storage, (name) =>
      bindings.KilnProbeJob.getByName(`availability-rc1/${name}`).runFixture(name),
    );
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
  async scheduled(_event: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    const bindings = ctx.exports as unknown as ProbeBindings;
    const result = await bindings.KilnProbeRun.getByName('availability-rc1').run();
    // No source, credentials or arbitrary container output enter logs.
    console.log(JSON.stringify({ kind: 'kiln-private-availability-probe', ...result }));
  },
} satisfies ExportedHandler;
