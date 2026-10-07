# Hosted information and consent pages

Local implementation and presentation evidence, not public launch acceptance.
The package and gallery README/site refresh remain deferred until hosted launch.

The gateway now serves `/`, `/privacy` and `/support` before creating an OAuth
server or looking up account/storage data. These routes retain ingress limits,
canonical-origin validation and private response headers. GET and HEAD work;
mutation methods and query parameters are refused. They set no cookies and make
no provider request. The home page describes Kiln, free hosted quotas, the local
package and the MCP address derived from the configured service origin.

One HTML shell now supplies the information, account and consent pages. It keeps
per-response style nonces, no scripts, data-only button images, same-origin form
submission, frame denial and links to privacy, support and account controls. The
consent response preserves the OAuth library's cookie headers and existing form
handle. Client text stays escaped; the client domain or unverified-name warning,
return host, loopback warning and requested permissions remain visible. Google
uses the existing vendor-provided button asset; GitHub and cancellation remain
ordinary form buttons. This is presentation work, not a new authentication flow.

## Privacy facts and remaining verification

The copy is grounded in current code:

- `google.ts`, `github.ts` and `accounts.ts`: only provider issuer/subject are
  retained from upstream identity; profile fields and upstream tokens are not
  persisted. Google requests `openid profile`; GitHub requests no additional scope.
- `browser-sessions.ts`, `connections.ts` and `worker.ts`: browser session expiry,
  bounded app connections and the distinction between browser sign-out and app
  disconnection. Linking never matches email addresses.
- `program-contract.ts`, `artifact-store.ts` and `asset-downloads.ts`: seven-day
  unsaved expiry, saved references, shared-file retention and authenticated,
  ten-minute download tickets. Expiry is not a claim of instant physical erasure.
- `account-deletions.ts`, `admission.ts` and `artifact-store.ts`: pending deletion,
  active-data cleanup, seven-day completed receipts and retained pseudonymous
  retirement records that block late writes or stale access.
- `operations.ts`: aggregate service telemetry excludes source, identities, IPs,
  URLs and credentials. Provider-managed operational data is described separately.
- Owner decision D10: notices are in-app only. The account activity page now says
  explicitly that sign-in changes and deletion do not produce email alerts.

Support uses the already selected `support@instruktlabs.com`; it separates private
security/account reports from public issues and asks users to omit credentials.
The pages do not add an email sender, contact-email field or broader OAuth scope.

Sources refreshed on 7 October:

- [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
  requires an accessible home page and a same-domain privacy policy that describes
  Google data handling. Domain verification, actual branding publication and live
  provider review remain open.
- [D1 recovery history](https://developers.cloudflare.com/d1/reference/time-travel/)
  and [SQLite Durable Object recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api)
  can retain prior database state for 30 days. This is distinct from active-service
  deletion; production retention and retirement-safe restore still need qualification.
- [Analytics Engine limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)
  document three-month metric retention.

The draft copy must remain consistent with the actual production configuration.
It creates no public route, does not prove a published privacy policy or vendor
approval, and does not establish live account deletion, data recovery or support
delivery. Public deployment remains a separate owner-approved step.

## Qualification

The new route and consent assertions failed before implementation. The focused
65-test set then passed. All 410 hosted tests, three typechecks, thirteen production
builds and root lint pass. Logs are `.cache/public-pages-*.log`. A fixture with no
account database, OAuth KV, provider credentials, storage or compute proves public
information is available without those services; unexpected outbound fetches fail.
Existing consent tests still reject hostile client HTML, stolen handles and
cross-browser/cross-origin approval, and both provider workflows still pass.

A loopback-only presentation fixture rendered the actual page functions. The home
page was visually checked at the normal desktop viewport. Consent, home, privacy,
support and sign-in were checked with a 375-by-812 browser override: no horizontal
overflow; consent sign-in buttons are 198 by 44 pixels and cancellation is at least
44 pixels high. Privacy navigation works from consent before sign-in. The viewport
was restored afterward. The fixture has synthetic client information, refuses
POST and cannot contact a provider or native evaluator.

Local evidence: `.cache/public-home-desktop.png`,
`.cache/public-consent-mobile.png`, `.cache/public-pages-mobile-checks.json`.
This is layout and local protocol evidence, not successful Google/GitHub login.
