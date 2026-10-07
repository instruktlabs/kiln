import { escapeHtml, htmlPage } from './html-page';
import { HttpFailure } from './http';

const contact = '<a href="mailto:support@instruktlabs.com">support@instruktlabs.com</a>';

function home(origin: string): Response {
  return htmlPage(
    'Editable 3D assets',
    `<h1>From JavaScript to editable 3D assets</h1>
<p>Kiln lets your coding assistant create, inspect, render and save 3D assets. Keep the source, materials and GLB together so you can reopen and change your work.</p>
<section><h2>Use hosted Kiln</h2><p>Hosted access is free within personal usage and storage quotas. Sign in with Google or GitHub to keep your saved work private and connect an app. No payment information is required.</p>
<p><a href="/account">Sign in or manage your account</a></p><p>MCP server address:<br><code>${escapeHtml(origin)}/mcp</code></p>
<p>Your app must support a remote MCP server with sign-in. Review the app name and requested access before connecting it.</p></section>
<section><h2>Work locally</h2><p>The open source <code>@instruktlabs/kiln</code> package includes the SDK, CLI and local MCP server. Local use does not require a Kiln account.</p><p><a href="https://github.com/instruktlabs/kiln">Read the installation guide and source</a></p></section>
<p>Kiln is operated by Instrukt Labs. Read <a href="/privacy">how hosted data is handled</a> or <a href="/support">get help</a>.</p>`,
  );
}

function privacy(): Response {
  return htmlPage(
    'Privacy',
    `<h1>Hosted Kiln privacy</h1><p>This notice covers the Kiln hosted service operated by Instrukt Labs. It does not cover your local Kiln workspace or the assistant you connect. Contact ${contact} about privacy or access to your data.</p>
<section><h2>Sign-in and account data</h2>
<p>Google or GitHub confirms your identity. Kiln receives provider identity and profile information during sign-in, and keeps the provider name and stable account identifier to associate you with a Kiln account. It does not retain your provider profile name, photo or email address. Provider access and ID tokens are discarded after verification.</p>
<p>Google sign-in requests basic identity and profile access. GitHub sign-in uses your public identity without requesting repository or private-email permissions. Kiln does not request Google Drive, Gmail or GitHub repository access.</p>
<p>Kiln stores its own account, session, connected-app, usage and security-activity records. Essential cookies keep sign-in, account confirmations and your browser session bound to you. Browser sessions expire after 30 minutes without activity or 24 hours in total; connected apps can stay authorized for up to 30 days.</p>
<p>Adding another sign-in method requires confirmation of both identities. Accounts are never automatically joined by matching email addresses. Security notices are in-app only: Kiln does not collect a separate security contact email or send alerts about sign-in method changes or deletion.</p></section>
<section><h2>Your source and assets</h2>
<p>Kiln processes the source, geometry, material files, previews, names and metadata you or your connected app send. It stores these privately for your account and returns requested results to the apps you authorize. The hosted service does not call a model provider. Your assistant handles its own conversations and copies under its provider's policies.</p>
<p>Unsaved work expires seven days after upload; background cleanup removes expired files. Saved source, assets and material dependencies remain until deleted, within your storage quota. Removing a saved revision removes that entry; files shared with another revision can remain, and unsaved copies follow the seven-day policy. Download links require your signed-in account and expire after ten minutes.</p></section>
<section><h2>Service providers and operations</h2>
<p>Cloudflare processes network requests, runs Kiln and stores hosted data. Google and GitHub process the sign-in you choose. Kiln's operational metrics record request categories, status codes, timing and aggregate service health, without source, file contents, account identifiers, IP addresses or credentials. These metrics are retained for three months. Cloudflare also processes its own infrastructure and security data under its policies.</p>
<p>Kiln pages do not load advertising or tracking scripts. If you contact support, your email and the details you choose to send are processed in the support inbox to handle your request. Do not include passwords, tokens or recovery codes.</p></section>
<section><h2>Your controls and deletion</h2>
<p>Use <a href="/account">Your account</a> to review sign-in methods, security activity and connected apps. Browser sign-out leaves app connections working. Disconnecting an app blocks its new requests but does not erase copies already returned to it or cancel work already admitted.</p>
<p>You can download your work and request account deletion after confirming a linked sign-in method. Access is revoked while cleanup stops outstanding work and removes active files and identity records. If cleanup is interrupted, the request stays pending while it retries. The private deletion receipt is available for seven days after completion.</p>
<p>Minimal pseudonymous retirement records remain to prevent old credentials or delayed jobs from restoring deleted data. Expiring authorization records and provider backups are separate from active-service deletion: Cloudflare's database recovery history can retain prior account data for up to 30 days. Deletion does not remove copies you downloaded or sent to another app.</p>
<p>For access, correction or deletion questions, contact ${contact}. Use the identity provider's own account controls for your Google or GitHub data.</p></section>`,
  );
}

function support(): Response {
  return htmlPage(
    'Support',
    `<h1>Get help with Kiln</h1><p>Kiln is an open source project operated by Instrukt Labs. Hosted access is free within quotas; there is no paid support tier.</p>
<section><h2>Account, privacy or security</h2><p>Email ${contact}. Include a short description and, when relevant, the time and the support reference shown by Kiln. Never send passwords, access tokens, recovery codes or private source you do not want to share.</p><p>Use email for security reports and private account details. Do not put them in public issues. Support cannot restore account access solely because an email address matches; your linked Google or GitHub identity establishes ownership.</p></section>
<section><h2>Common account questions</h2><p>Use the same sign-in method as before to reach your work. Add another method from <a href="/account">Your account</a>; separately created accounts cannot be merged.</p><p>A download link requires the account that saved the asset. If it has expired, request a fresh link from your connected app. A quota response means the operation was refused; try again after the stated delay or free saved storage as appropriate.</p><p>Browser sign-out and disconnecting an app are separate controls. Account deletion removes hosted files, so download anything you want to keep first.</p></section>
<section><h2>Bug reports and contributions</h2><p><a href="https://github.com/instruktlabs/kiln/issues">Open a public issue</a> with your Kiln version, operating system, expected behavior and a small reproduction you are comfortable making public. Remove credentials and private assets before posting.</p></section>`,
  );
}

/** Public information is available without authentication or a storage lookup. */
export function publicPage(request: Request, origin: string): Response | undefined {
  const url = new URL(request.url);
  if (!['/', '/privacy', '/support'].includes(url.pathname)) return undefined;
  if (url.search)
    throw new HttpFailure(400, 'Query parameters are not supported on information pages');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (!request.bodyUsed) void request.body?.cancel().catch(() => {});
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const response =
    url.pathname === '/' ? home(origin) : url.pathname === '/privacy' ? privacy() : support();
  return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
}
