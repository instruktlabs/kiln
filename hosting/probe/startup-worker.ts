import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { ManagedStartupDiagnostic } from './startup-diagnostic';

interface Bindings {
  STARTUP_JOB: DurableObjectNamespace<KilnManagedStartupJob>;
}

export class KilnManagedStartupJob extends DurableObject {
  async runFixed() {
    return new ManagedStartupDiagnostic(this.ctx).run();
  }

  async alarm() {
    await new ManagedStartupDiagnostic(this.ctx).alarm();
  }
}

/** The authenticated operator can invoke only this fixed, retained diagnostic. */
export class KilnStartupControl extends WorkerEntrypoint<Bindings> {
  fetch() {
    return new Response('Not found', { status: 404 });
  }

  async runFixed() {
    return this.env.STARTUP_JOB.getByName('managed-runtime-2026-10-06').runFixed();
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Bindings>;
