import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { ManagedStartupDiagnostic } from './startup-diagnostic';

interface Bindings {
  STARTUP_JOB: DurableObjectNamespace<KilnManifestStartupJob>;
}

export class KilnManifestStartupJob extends DurableObject {
  async runFixed() {
    return new ManagedStartupDiagnostic(this.ctx, 'kiln-manifest').run();
  }

  async alarm() {
    await new ManagedStartupDiagnostic(this.ctx, 'kiln-manifest').alarm();
  }
}

export class KilnManifestStartupControl extends WorkerEntrypoint<Bindings> {
  fetch() {
    return new Response('Not found', { status: 404 });
  }

  async runFixed() {
    return this.env.STARTUP_JOB.getByName('kiln-manifest-2026-10-06').runFixed();
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Bindings>;
