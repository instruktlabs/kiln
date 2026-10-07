import { IDENTITY_ISSUERS } from './accounts';
import { D1BrowserSessions, type BrowserSession } from './browser-sessions';
import { HttpFailure } from './http';
import { GOOGLE_SIGN_IN_BUTTON } from './google-button';
import { D1Connections } from './connections';
import { validLoginReturn } from './download-path';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function page(content: string, status = 200): Response {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Your account · Kiln</title>
<style nonce="${nonce}">
:root{font-family:system-ui,sans-serif;color:#292821;background:#f6f4ef;color-scheme:light}
*{box-sizing:border-box}body{margin:0}main{max-width:42rem;margin:8vh auto;padding:1.5rem}
header{display:flex;align-items:baseline;gap:.8rem;margin-bottom:2.5rem}header strong{font-size:1.7rem}
header span,footer{font-size:.9rem;color:#59594f}h1{font-size:2rem;line-height:1.2}
p,li{line-height:1.6}section{border:1px solid #d6d3c9;background:#fff;border-radius:.75rem;padding:1.5rem;margin:1.5rem 0}
h2{font-size:1.15rem;margin-top:0}button{font:inherit;font-weight:600;min-height:2.75rem;padding:.65rem 1.2rem;border:0;border-radius:.35rem;background:#3d5139;color:#fff;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid #a25c24;outline-offset:4px}a{color:#365231}
article+article{border-top:1px solid #d6d3c9;margin-top:1.5rem;padding-top:1.5rem}article h3,article p{overflow-wrap:anywhere}
article form{display:flex;align-items:center;flex-wrap:wrap;gap:.75rem}select{font:inherit;min-height:2.75rem;border:1px solid #747775;border-radius:.35rem;background:#fff;color:#292821;padding:.4rem}
select:focus-visible{outline:3px solid #a25c24;outline-offset:4px}
.provider-buttons{display:flex;flex-wrap:wrap;gap:.75rem}.google-button{padding:0;background:transparent;line-height:0}
.google-button img{display:block;width:198px;height:44px}.github-button{width:198px;min-height:44px;padding:0;background:#fff;color:#1f1f1f;border:1px solid #747775;font-size:14px;font-weight:500}
footer{margin-top:2rem}footer a{margin-right:1rem}
</style></head><body><main><header><strong>Kiln</strong><span>by Instrukt Labs</span></header>
${content}<footer><a href="mailto:support@instruktlabs.com">Contact support</a>
<a href="https://github.com/instruktlabs/kiln">Open source</a></footer></main></body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': `default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
      },
    },
  );
}

export function signInPage(returnTo = '/account'): Response {
  if (!validLoginReturn(returnTo)) throw new HttpFailure(400, 'Invalid sign-in destination');
  return page(
    `<h1>Sign in to Kiln</h1><p>${
      returnTo === '/account'
        ? 'Free hosted access, with private saved assets and a personal usage quota.'
        : 'Sign in to the Kiln account that saved this asset to download it. This link expires after ten minutes; you can request a new link from your connected app.'
    }</p>
<section><h2>Welcome back</h2><p>Use the same sign-in method as before to reach your saved work. Kiln requests no GitHub repository access or Google Drive access.</p>
<form class="provider-buttons" method="post" action="/account/login"><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><button class="google-button" name="provider" value="google"><img src="${GOOGLE_SIGN_IN_BUTTON}" width="198" height="44" alt="Sign in with Google"></button>
<button class="github-button" name="provider" value="github">Sign in with GitHub</button></form></section>`,
    401,
  );
}

export function accountNoticePage(message: string): Response {
  return page(
    `<h1>${escapeHtml(message)}</h1><p>Your saved assets and Kiln account stay the same. All browser sessions and connected apps have been signed out.</p><p><a href="/account">Sign in to continue</a>, then reconnect any apps you want to use.</p>`,
  );
}

export function deletionStatusPage(status: {
  id: string;
  state: 'pending' | 'complete';
  createdAt: number;
}): Response {
  return page(
    status.state === 'complete'
      ? `<h1>Account deleted</h1><p>Your Kiln account and files have been removed from the active service. Access from this account remains revoked.</p><p>This does not remove copies you previously downloaded or shared. Inaccessible authorization records and provider backups follow the retention policy.</p><p>This private receipt is available for seven days. You can <a href="/account">create a new, empty account</a> if you return.</p>`
      : `<h1>Deletion in progress</h1><p>Access to your account is blocked while Kiln stops outstanding work and removes your files and sign-in records. You can close this page; cleanup continues automatically.</p><p><a href="/account/deletion">Refresh deletion status</a>. If this remains pending, contact support with reference <strong>${escapeHtml(status.id)}</strong>.</p><p>Requested ${escapeHtml(new Date(status.createdAt).toISOString())}.</p>`,
  );
}

export async function accountPage(
  request: Request,
  database: D1Database,
  origin: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.search) throw new HttpFailure(400, 'Query parameters are not supported on account pages');
  const sessions = new D1BrowserSessions(database, origin);
  if (url.pathname === '/account/logout') {
    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
    if (request.headers.get('origin') !== origin)
      throw new HttpFailure(403, 'Invalid account form');
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      throw new HttpFailure(415, 'Expected form data');
    const form = await request.formData();
    if (form.getAll('csrf').length !== 1 || [...form.keys()].some((key) => key !== 'csrf'))
      throw new HttpFailure(403, 'Invalid account form');
    const cookie = await sessions.logout(request, String(form.get('csrf')));
    return new Response(null, {
      status: 303,
      headers: { location: '/account', 'set-cookie': cookie },
    });
  }
  if (request.method !== 'GET')
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  let session: BrowserSession;
  try {
    session = await sessions.read(request);
  } catch (error) {
    if (!(error instanceof HttpFailure) || error.status !== 401) throw error;
    return signInPage();
  }
  const identities = await database
    .withSession('first-primary')
    .prepare('SELECT issuer FROM kiln_identities WHERE account_id=? ORDER BY issuer LIMIT 3')
    .bind(session.accountId)
    .all<{ issuer: string }>();
  const providers = identities.results.map(({ issuer }) =>
    issuer === IDENTITY_ISSUERS.google
      ? 'Google'
      : issuer === IDENTITY_ISSUERS.github
        ? 'GitHub'
        : 'Unknown provider',
  );
  const connections = await new D1Connections(database).list(
    session.accountId,
    session.accountEpoch,
  );
  const providerOptions = identities.results
    .flatMap(({ issuer }) =>
      issuer === IDENTITY_ISSUERS.google
        ? ['<option value="google">Google</option>']
        : issuer === IDENTITY_ISSUERS.github
          ? ['<option value="github">GitHub</option>']
          : [],
    )
    .join('');
  const connectionCards = connections
    .map(
      (connection) => `<article><h3>${escapeHtml(connection.clientName)}</h3>
<p>${connection.clientDomain ? `Client domain: ${escapeHtml(connection.clientDomain)}.` : 'This client registered its own name; that name is not verified.'}
Return address: ${escapeHtml(new URL(connection.redirectUri).host)}.</p>
<p>${connection.state === 'pending' ? 'Waiting for the app to finish connecting.' : 'Connected'} · ${escapeHtml(new Date(connection.createdAt).toISOString().slice(0, 16).replace('T', ' '))} UTC</p>
<form method="post" action="/account/action"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
<input type="hidden" name="action" value="disconnect"><input type="hidden" name="connectionId" value="${escapeHtml(connection.id)}">
<label>Confirm using <select name="provider">${providerOptions}</select></label> <button type="submit">Disconnect this app</button></form></article>`,
    )
    .join('');
  const identityControls = (['google', 'github'] as const)
    .map((target) => {
      const linked = identities.results.some(({ issuer }) => issuer === IDENTITY_ISSUERS[target]);
      const confirmer = (['google', 'github'] as const).find(
        (provider) =>
          provider !== target &&
          identities.results.some(({ issuer }) => issuer === IDENTITY_ISSUERS[provider]),
      );
      if (!confirmer) return '';
      const label = target === 'google' ? 'Google' : 'GitHub';
      return `<form method="post" action="/account/identity"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
<input type="hidden" name="action" value="${linked ? 'unlink' : 'link'}"><input type="hidden" name="target" value="${target}">
<input type="hidden" name="provider" value="${confirmer}"><button type="submit">${linked ? 'Remove' : 'Add'} ${label}</button></form>`;
    })
    .join('');
  const events = await database
    .withSession('first-primary')
    .prepare(
      'SELECT kind,provider,created_at AS createdAt FROM kiln_account_events WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 20',
    )
    .bind(session.accountId)
    .all<{ kind: 'link' | 'unlink'; provider: string; createdAt: number }>();
  const activity = events.results
    .map(
      (event) =>
        `<li>${event.kind === 'link' ? 'Sign-in method added' : 'Sign-in method removed'}: ${event.provider === 'google' ? 'Google' : 'GitHub'} · ${escapeHtml(new Date(event.createdAt).toISOString().slice(0, 16).replace('T', ' '))} UTC</li>`,
    )
    .join('');
  return page(`<h1>Your Kiln account</h1><p>Free hosted access, with private saved assets and a personal usage quota.</p>
<section><h2>Sign-in methods</h2><ul>${providers.map((provider) => `<li>${escapeHtml(provider)}</li>`).join('')}</ul>
<p>Adding a method asks you to confirm your current provider, then the new one. Removing a method asks you to confirm the one you will keep. Each change signs out all browsers and connected apps. Saved assets stay in this account. Already separate Kiln accounts cannot be merged.</p><div class="provider-buttons">${identityControls}</div></section>
<section><h2>Recent security activity</h2>${activity ? `<ul>${activity}</ul>` : '<p>No sign-in method changes.</p>'}</section>
<section><h2>Connected apps</h2><p>Disconnecting blocks new requests from that connection. Confirm with a sign-in method to continue.</p>${connectionCards || '<p>No connected apps.</p>'}</section>
<section><h2>This browser</h2><p>Signing out here leaves your connected apps working.</p>
<form method="post" action="/account/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
<button type="submit">Sign out of this browser</button></form></section>
<section><h2>Delete your account</h2><p>This permanently removes your hosted Kiln account and saved files. Download anything you want to keep first. Your local npm package and local files are unaffected.</p>
<form method="post" action="/account/delete"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
<p><label><input type="checkbox" name="confirmation" value="delete-my-account" required> I understand that my hosted files will be deleted.</label></p>
<p><label>Confirm using <select name="provider">${providerOptions}</select></label></p><button type="submit">Confirm account deletion</button></form>
<p>Next, confirm control of a linked sign-in method. Cancelling that step leaves your account unchanged. After confirmation, access is revoked and deletion cannot be undone.</p></section>`);
}
