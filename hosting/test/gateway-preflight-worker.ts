import { DurableObject } from 'cloudflare:workers';
import { runGatewayPreflight, type PreflightEnv } from '../probe/gateway-preflight';

export class PreflightFixture extends DurableObject<PreflightEnv> {
  async run() {
    return JSON.stringify(await runGatewayPreflight(this.ctx.storage, this.env));
  }
}

export default { fetch: () => new Response('Not found', { status: 404 }) };
