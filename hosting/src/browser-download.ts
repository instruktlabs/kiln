import { signInPage } from './account-page';
import { D1BrowserSessions, type BrowserSession } from './browser-sessions';
import { parseDownloadPath } from './download-path';
import { HttpFailure } from './http';
import { tenantForAccount } from './tenant-identity';

export async function browserDownload(
  request: Request,
  env: { ACCOUNTS: D1Database; TENANTS: DurableObjectNamespace },
  origin: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== origin || url.search || url.hash)
    throw new HttpFailure(400, 'Invalid download link');
  const selected = parseDownloadPath(url.pathname);
  if (!selected) throw new HttpFailure(404, 'Download link unavailable; request a new link');
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const incomingOrigin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (
    (incomingOrigin !== null && incomingOrigin !== origin) ||
    ((site === 'cross-site' || site === 'same-site') &&
      (request.headers.get('sec-fetch-mode') !== 'navigate' ||
        request.headers.get('sec-fetch-dest') !== 'document'))
  )
    throw new HttpFailure(403, 'Open the download link directly');
  const sessions = new D1BrowserSessions(env.ACCOUNTS, origin);
  let session: BrowserSession;
  try {
    session = await sessions.read(request);
  } catch (error) {
    if (!(error instanceof HttpFailure) || error.status !== 401) throw error;
    return request.method === 'HEAD'
      ? new Response(null, { status: 401 })
      : signInPage(url.pathname);
  }
  const tenant = await tenantForAccount(origin, session.accountId);
  // Forward no caller headers, cookies, bearer tokens or object selectors.
  const response = await env.TENANTS.getByName(tenant).fetch(
    new Request(
      `https://tenant.internal/internal/downloads/${selected.token}/${selected.filename}`,
      {
        method: request.method,
        signal: request.signal,
        redirect: 'manual',
      },
    ),
  );
  try {
    // Storage reads yield. Revocation must be checked again before releasing bytes.
    const current = await sessions.read(request);
    if (current.accountId !== session.accountId || current.accountEpoch !== session.accountEpoch)
      throw new HttpFailure(401, 'Sign in to continue');
    return response;
  } catch (error) {
    void response.body?.cancel().catch(() => {});
    throw error;
  }
}
