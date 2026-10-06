import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { ManagedStartupDiagnostic } from './startup-diagnostic';

interface Bindings {
  STARTUP_JOB: DurableObjectNamespace<KilnImageStartupJob>;
}

export class KilnImageStartupJob extends DurableObject {
  async runFixed() {
    return new ManagedStartupDiagnostic(this.ctx, 'kiln').run();
  }

  async alarm() {
    await new ManagedStartupDiagnostic(this.ctx, 'kiln').alarm();
  }
}

export class KilnImageStartupControl extends WorkerEntrypoint<Bindings> {
  fetch() {
    return new Response('Not found', { status: 404 });
  }

  async runFixed() {
    return this.env.STARTUP_JOB.getByName('kiln-runtime-2026-10-06').runFixed();
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Bindings>;
