import { DurableObject } from 'cloudflare:workers';
export { KilnAdmission, KilnCompute, KilnComputeControl } from '../src/admission-worker';

// Storage/Cron qualification has no native Worker or container capability. Even
// an accidentally unpaused request cannot create a VM in this private topology.
export class KilnNoExecution extends DurableObject {
  run(): never {
    throw new Error('PRIVATE_OPERATIONS_NATIVE_DISABLED');
  }
  cancel(): void {}
}
export default { fetch: () => new Response('Not found', { status: 404 }) };
