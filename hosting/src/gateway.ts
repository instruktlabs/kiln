import { insufficientScope, type OAuthResourceContext } from '@cloudflare/workers-oauth-provider';
import { boundedRequest, HttpFailure, sha256 } from './http';
import type { KilnCompute } from './admission-worker';
import { tryEdgeMcp } from './edge-mcp';

export interface TenantEnv {
  TENANTS: DurableObjectNamespace;
  NATIVE_COMPUTE?: Service<KilnCompute>;
}

export async function forwardTenant(
  request: Request,
  env: TenantEnv,
  ctx: OAuthResourceContext<unknown>,
  origin: string,
): Promise<Response> {
  if (!ctx.auth.scope.includes('kiln:use')) return insufficientScope(ctx.auth, ['kiln:use']);
  const userId = ctx.auth.userId;
  if (!userId || !/^ka_[a-f0-9]{32}$/.test(userId)) throw new HttpFailure(401, 'Invalid identity');
  const url = new URL(request.url);
  const isMcp = url.pathname === '/mcp';
  const isArtifact = /^\/mcp\/artifacts\/[A-Za-z0-9_-]{16,128}$/.test(url.pathname);
  if (!isMcp && !isArtifact) return new Response('Not found', { status: 404 });
  const allowed = isMcp ? ['GET', 'POST', 'DELETE'] : ['GET', 'HEAD'];
  if (!allowed.includes(request.method))
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: allowed.join(', ') },
    });
  if (
    request.method === 'POST' &&
    request.headers.get('content-type')?.split(';')[0] !== 'application/json'
  ) {
    throw new HttpFailure(415, 'MCP requires application/json');
  }
  const bounded = await boundedRequest(request, 1024 * 1024);
  // Only verified authorization identity selects the object. Token, client id,
  // session id, source refs, cookies and caller tenant headers cannot select it.
  const tenant = await sha256(JSON.stringify(['kiln-tenant-v1', origin, userId]));
  const headers = new Headers();
  for (const name of [
    'accept',
    'content-type',
    'mcp-protocol-version',
    'mcp-method',
    'mcp-name',
    'mcp-session-id',
    'last-event-id',
  ]) {
    const value = bounded.headers.get(name);
    if (value && value.length > 4096) throw new HttpFailure(431, 'Header too large');
    if (value) headers.set(name, value);
  }
  const internal = new Request(`https://tenant.internal${url.pathname}`, {
    method: bounded.method,
    headers,
    body: bounded.body,
    signal: bounded.signal,
    redirect: 'manual',
  });
  if (isMcp) {
    const edge = await tryEdgeMcp(internal);
    if (edge) return edge;
    if (!env.NATIVE_COMPUTE) throw new HttpFailure(503, 'Native compute is not configured');
    return env.NATIVE_COMPUTE.dispatch(tenant, internal);
  }
  return env.TENANTS.getByName(tenant).fetch(internal);
}
