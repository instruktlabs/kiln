import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { ResilienceExecution } from './resilience-execution';
import { runResilienceOnce, type ResilienceCase } from './resilience-run';

interface Bindings {
  KilnResilienceRun: DurableObjectNamespace<KilnResilienceRun>;
  KilnResilienceJob: DurableObjectNamespace<KilnResilienceJob>;
}
export class KilnResilienceJob extends DurableObject {
  runFixture(name: ResilienceCase) {
    return new ResilienceExecution(this.ctx).run(name);
  }
  readResult() {
    return new ResilienceExecution(this.ctx).read();
  }
  stopUnconfirmed() {
    return new ResilienceExecution(this.ctx).stopUnconfirmed();
  }
  alarm() {
    return new ResilienceExecution(this.ctx).alarm();
  }
}
export class KilnResilienceRun extends DurableObject {
  async run() {
    const bindings = this.ctx.exports as unknown as Bindings;
    return runResilienceOnce(this.ctx.storage, async (name) => {
      const job = bindings.KilnResilienceJob.getByName(`stable-resilience-v1/${name}`);
      let result = await job.runFixture(name);
      if (!result.pendingAlarm) return result;
      // A different DO observes the actual alarm callback. It never calls alarm()
      // itself and cannot restart a VM or submit new source while polling.
      const until = Date.now() + 45_000;
      while (Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const next = await job.readResult();
        if (next) result = next;
        if (!result.pendingAlarm) return result;
      }
      return job.stopUnconfirmed();
    });
  }
}
export class KilnResilienceControl extends WorkerEntrypoint {
  fetch() {
    return new Response('Not found', { status: 404 });
  }
  runFixed() {
    const bindings = this.ctx.exports as unknown as Bindings;
    return bindings.KilnResilienceRun.getByName('stable-resilience-v1').run();
  }
}
export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler;
