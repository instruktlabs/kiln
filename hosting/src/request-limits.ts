import { privateResponse, sha256 } from './http';

export interface RequestLimitEnv {
  EDGE_REQUEST_LIMIT: RateLimit;
  ACCOUNT_REQUEST_LIMIT: RateLimit;
}
function refused(request: Request, status: 401 | 429 | 503): Response {
  if (!request.bodyUsed) void request.body?.cancel().catch(() => {});
  return privateResponse(
    new Response(
      status === 429
        ? 'Too many requests. Try again shortly.'
        : status === 401
          ? 'Invalid identity'
          : 'Service temporarily unavailable',
      {
        status,
        headers: status === 429 ? { 'retry-after': '60' } : undefined,
      },
    ),
  );
}

const usable = (binding: RateLimit | undefined) => typeof binding?.limit === 'function';
async function check(
  request: Request,
  binding: RateLimit,
  key: string,
): Promise<Response | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!usable(binding)) return refused(request, 503);
    const result = await Promise.race([
      binding.limit({ key }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Limiter deadline')), 1000);
      }),
    ]);
    if (!result || typeof result.success !== 'boolean') return refused(request, 503);
    return result.success ? undefined : refused(request, 429);
  } catch {
    return refused(request, 503);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Fixed classes bound anonymous work without storing IPs, credentials or URLs. */
export function routeClass(path: string): string {
  if (path === '/register') return 'registration';
  if (path.startsWith('/oauth/token')) return 'token';
  if (path === '/authorize' || path === '/account/login') return 'sign-in';
  if (path === '/oauth/google/callback' || path === '/oauth/github/callback') return 'callback';
  if (path === '/account' || path.startsWith('/account/')) return 'account';
  if (path.startsWith('/downloads/')) return 'download';
  if (path === '/mcp' || path.startsWith('/mcp/')) return 'mcp';
  if (path.startsWith('/.well-known/')) return 'discovery';
  return 'other';
}

export async function limitIngress(
  request: Request,
  env: RequestLimitEnv,
  origin: string,
): Promise<Response | undefined> {
  if (!usable(env.EDGE_REQUEST_LIMIT) || !usable(env.ACCOUNT_REQUEST_LIMIT))
    return refused(request, 503);
  return check(
    request,
    env.EDGE_REQUEST_LIMIT,
    `kiln-ingress-v1:${origin}:${routeClass(new URL(request.url).pathname)}`,
  );
}

/** Invoke only with verified account ownership, never a token or caller selector. */
export async function limitAccount(
  request: Request,
  env: Pick<RequestLimitEnv, 'ACCOUNT_REQUEST_LIMIT'>,
  origin: string,
  accountId: string,
): Promise<Response | undefined> {
  if (typeof accountId !== 'string' || !/^ka_[a-f0-9]{32}(?![\s\S])/.test(accountId))
    return refused(request, 401);
  return check(
    request,
    env.ACCOUNT_REQUEST_LIMIT,
    `kiln-account-rate-v1:${await sha256(JSON.stringify([origin, accountId]))}`,
  );
}
