import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { ManagedStartupDiagnostic } from './startup-diagnostic';

interface Bindings {
  STARTUP_JOB: DurableObjectNamespace<KilnCustomStartupJob>;
}

export class KilnCustomStartupJob extends DurableObject {
  async runFixed() {
    return new ManagedStartupDiagnostic(this.ctx, 'configured').run();
  }

  async alarm() {
    await new ManagedStartupDiagnostic(this.ctx, 'configured').alarm();
  }
}

export class KilnCustomStartupControl extends WorkerEntrypoint<Bindings> {
  fetch() {
    return new Response('Not found', { status: 404 });
  }

  async runFixed() {
    return this.env.STARTUP_JOB.getByName('custom-runtime-2026-10-06').runFixed();
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Bindings>;
