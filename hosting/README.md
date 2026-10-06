# Hosted Kiln

This private package contains the hosted service's Worker code and native storage adapters. It is not shipped
inside `@instruktlabs/kiln` and introduces no cloud dependency into the engine.
It is not deployed or ready for public traffic. Native provider qualification,
native dispatch, deployed storage, operational quotas and launch checks remain open.

## Local checks

Use the repository's Node 22.23.3 and npm 12.2.0 maintainer toolchain:

```sh
bun install --frozen-lockfile
node scripts/build-runtime.mjs all
cd hosting
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

The tests execute the Worker in workerd through the pinned Miniflare package.
Its 5.x API is currently alpha; the exported v4 option converter supplies the
documented simulation bindings. Tests replace GitHub responses with fixed identities
and Google responses with locally signed OIDC fixtures. Routing tests use a recording backend; storage tests use the production
tenant Worker with real simulated SQLite and R2 bindings. A combined test connects
both production Workers and verifies authenticated two-user downloads and reconnects.
Separate test-only fault injection covers late upload acknowledgement and failed
cleanup. A fixed trusted fixture also runs the actual bundled Node engine against
the production storage Worker: validate, read, edit, CPU render, saved revisions,
restore/export and retrieval from a fresh host after storage eviction. Material
closures survive an export/import and exact offline GLB rebuild. Unexpected external fetches fail. No model,
real identity provider or cloud deployment is used. These tests do not establish
untrusted native isolation, deployed persistence, global KV consistency or production capacity.

The separate gateway, tenant, native source-client, native asset-client and native MCP bundles,
with input/hash/import receipts, are written to
`../.cache/hosted-worker/`. `build` performs no upload, resource provisioning or
deployment. `Hosted gateway checks` runs the same checks on Linux and Windows.

## Provider-neutral accounts

`src/accounts.ts` defines a provider-neutral account lookup contract and a D1
adapter. `migrations/0001_accounts.sql` owns the identity index. Verified canonical
issuer/subject pairs map to random permanent Kiln IDs; email, provider tokens and
profile names are not stored or used to merge accounts. Registering an identity
and its new account is one transaction. Each operation starts a primary-backed
session, independent of caller bookmarks. Disabled/deleting accounts cannot obtain
a replacement account through ordinary sign-in.

The workerd tests exercise concurrent first sign-ins, unique issuer/subject pairs,
rollback after an injected identity-write failure and current account-state reads.
They do not establish cross-region deployment behavior. Both provider adapters now
resolve this directory before issuing Kiln grants. Every protected-resource token
validation, authorization-code exchange and refresh checks the current primary
account state and authorization epoch. Missing/disabled/deleting accounts and old
epochs fail closed; database outages return unavailable rather than permitting
cached access. Account lifecycle mutations must increment the epoch atomically.
Browser sessions and direct sign-in now have local qualification. Explicit
identity linking, deployed connection controls and completed asset deletion remain required
before launch.
Only verified server-side provider adapters may call this contract. The JSON
interface under `test/` exists solely for local tests and is not a public API.

### Browser account access

`/account` renders sign-in or the current account's linked provider names. Direct
sign-in and MCP authorization share the verified Google/GitHub adapters and exact
provider callbacks. Direct sign-in does not register a synthetic MCP client or
issue MCP tokens. Its `kb1_` state selects a separate D1 transaction namespace;
the state and an independent browser cookie must both match before a provider
exchange. D1 atomically consumes the transaction, including cancellation. Stored
state and cookie bindings are hashed with the service origin and their purpose.
PKCE verifiers and nonces remain server-side for at most ten minutes. The table
admits at most 4,096 pending transactions and opportunistically removes expired
rows. This storage bound does not replace the required public rate/admission limits.

Successful verified callbacks issue a new `__Host-kiln-session` cookie with Secure,
HttpOnly, SameSite=Lax and Path=/, never Domain. D1 stores only its SHA-256 verifier,
with a separate CSRF value, account ID and authorization epoch. Sessions expire
after 30 minutes idle or 24 hours absolute, whichever comes first. Each successful
read atomically renews only the idle deadline and checks the current primary account
state/epoch. Fresh sign-in revokes that browser's previous session; at most eight
sessions remain per account. Rotation at the cap preserves the other seven devices.

Logout requires a same-origin POST, a bounded form and that session's CSRF value.
It revokes only the browser session; it deliberately leaves MCP connections and
other devices intact. Browser cookies cannot authorize `/mcp`, and MCP bearer
tokens cannot authorize account pages. No account selection comes from a form or
URL. Session issuance accepts only verified server-side identities. A recent
callback is not proof of a fresh password/MFA challenge; linking/deletion still
need their own explicit, purpose-bound confirmation and reauthentication policy.

Migrations `0003_browser_sessions.sql` and `0004_browser_logins.sql` add these
tables. Workerd tests cover expiry, rotation, concurrent callbacks, cross-provider
and cross-browser rejection, SQL rollback, storage bounds and logout/connection
separation. The account page uses a nonce-restricted style block and a Google-
provided button image embedded locally; see [asset provenance](assets/README.md).
Local desktop/375px layout checks establish presentation only, not live provider
authentication or final launch acceptance. Privacy pages, full account controls
and the branded MCP consent experience remain open.

### Connected-app controls

Migrations `0005_connections.sql` and `0006_account_actions.sql` add independently
revocable MCP connections and purpose-bound confirmation transactions. A connection
becomes active through one atomic primary-D1 claim during authorization-code
exchange. Every resource request and refresh checks its current account, epoch,
client and connection state after the OAuth library's token validation. Stale KV
records cannot replay an exchanged code or re-enable a revoked connection.
Connections expire after 30 days; at most 32 pending/active connections are admitted
per account. Expired pending connections are retired after ten minutes.

`/account` lists connections and accepts a same-origin, CSRF-protected disconnect
form. Confirmation requires the current browser session, an independent action
cookie, one-use state, PKCE and a freshly verified identity already linked to that
account. Google also verifies the OIDC nonce. The primary SQL revocation commits
before optional OAuth KV cleanup; other connections remain usable. The browser
session rotates after confirmation. This blocks subsequent requests; it does not
cancel already admitted computation. Public rate/admission controls remain required.

Both providers' `prompt=select_account` asks the user to choose an account; it
does not prove a new password or MFA challenge. Sources:
[GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps),
[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect).
Identity linking and deletion require their own purpose-bound designs; this
disconnect flow must not be repurposed to merge or delete accounts.

Local workerd checks cover concurrent callbacks, cancellation, expiry, copied
state, wrong identities, revoked sessions, forged forms, hostile client names,
oversized requests and retained access by another connection. Layout checks use
synthetic identities only. Live provider confirmation, cross-region denial and
production migration/rollback remain unqualified.

## Native HTTP adapter

`src/native-mcp.ts` serves the installed engine's registry through the MCP SDK's
Streamable HTTP handler, including stateless compatibility for the 2025 protocols.
The gateway preserves the current protocol's `mcp-method` and `mcp-name` headers.
Both boundaries reject a supplied browser Origin other than the configured public
origin. The native endpoint accepts only its fixed private hostname and path and
refuses forwarded credentials or caller-selected tenant headers.

The production loader first verifies the installed isolated evaluator. Failure
leaves the host unavailable; there is no trusted execution fallback. Each request
gets a fresh engine context with the native ProgramStore and AssetLibrary adapters.
The outside container controller must bind storage to one verified tenant; it has
not been implemented or qualified on Cloudflare. No public native port is opened.

Admission defaults to one active request, with a 1 MiB request bound, 120-second
whole-request deadline and 64 MiB streamed response ceiling. Evaluation has a
60-second maximum deadline. These are implementation bounds, not measured launch
capacity or global quotas. Disconnects and response cancellation abort storage
and evaluation. An evaluator that has not settled keeps its occupied slot even
after the HTTP response ends; the future controller must enforce process cleanup.

The local HTTP tests run real registry tools against the production storage Worker:
validate, CPU render, save, restore and exact source retrieval after reconnect.
They also check protocol compatibility, cross-tenant denial, cancellation, stalled
bodies, response limits and refusal of an unqualified evaluator. They deliberately
use a fixed trusted render fixture and do not establish provider isolation.

## Authorization and tenant routing

`src/worker.ts` combines the OAuth authorization server and protected resource
server using `@cloudflare/workers-oauth-provider@1.2.1`. Their logical roles remain
separate. The canonical resource is `PUBLIC_ORIGIN + /mcp`; origin is operator
configuration, never a forwarded header. HTTP origins other than that configured
HTTPS origin are refused.

The Worker serves resource/issuer discovery, client registration, browser consent,
authorization-code exchange, refresh and revocation. Client ID Metadata Documents
are enabled; the deployed Worker must set `global_fetch_strictly_public` to bound
their network fetches. Dynamic registration is retained for client compatibility.
Registration and other public endpoints still need operational admission limits
before deployment.

The owner selected Google and GitHub sign-in for free hosted v1 access, private
saved assets and personal quotas; email can follow. The local package needs no
Kiln account. GitHub requests no repository scopes, uses upstream S256 PKCE and
resolves the immutable user ID for every login. Google uses `oauth4webapi@3.8.8`
for discovery, code exchange, nonce/issuer/audience/expiry checks and application-level
signature verification. It requests `openid profile`, uses S256 PKCE, rejects a
foreign `azp`, and canonicalizes Google's two documented issuer spellings. Network
responses are bounded and redirects/foreign endpoint origins are refused. Upstream
access/ID tokens are discarded at the adapter boundary; only verified issuer/subject
pairs enter the account directory. Login names and email never select a tenant.

The gateway needs `ACCOUNTS` bound to D1 with all numbered migrations applied, plus
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`. Register exact `/oauth/google/callback` and
`/oauth/github/callback` URLs under the configured `PUBLIC_ORIGIN`, using separate
test and production provider apps. Google OAuth branding now exists in testing
mode; no live database or provider client secret has been provisioned by this
implementation. Existing prototype provider-derived grants
are deliberately invalid; no deployed user migration is being claimed. See the
[authentication architecture review](../docs/plans/2026-10-05-v1-publication-plan.md#authentication-architecture-review-6-october)
for the selected provider-independent boundary, library comparison, KV consistency
limits and required deployed checks. Equal email addresses never imply permission
to merge accounts or libraries.

Launch requires a clearly branded Kiln / Instrukt Labs connection page, a verified
service domain, a plain explanation of the granted access, privacy/support links
and usable disconnect/deletion controls. The current minimal consent page is not
the accepted launch design. Verify actual provider consent, denied
and cancelled sign-in, token expiry/revocation and cross-user access on the deployed
service. Local fixtures are not acceptance of that end-user experience or its
deployed security. Keep provider credentials only in the gateway's secret bindings;
never send them to an evaluator, log them or store them with artifacts.

Consent names the requesting client, verified domain when available, callback
host, scopes and loopback warning. The library binds consent and upstream state
to HttpOnly, Secure browser cookies; the form additionally checks its exact
origin. Client-supplied strings are escaped. The page forbids scripts and framing.
`src/login-intents.ts` adds atomic D1 claims after the library's browser validation:
one consent choice per handle, and one callback per origin/state/provider/purpose
intent. The database stores hashes, not raw state, verifier or nonce. Consent claims
last one day (longer than the library's ten-minute transaction); upstream intents
last ten minutes. Indexed cleanup removes at most 128 expired rows per write.
Replayed stale KV snapshots and concurrent D1 claims are exercised locally.
The `kiln:use` scope permits the engine's asset lifecycle, including deletion;
`offline_access` permits a renewable connection with a fixed 30-day lifetime.
Access tokens expire after 15 minutes. Revocation uses the advertised endpoint.
Production KV propagation means the local revocation test does not promise
instant global revocation; this needs explicit operational qualification.

Verified permanent Kiln account IDs alone select a Durable Object, using a versioned
hash of the configured Kiln origin and account ID. Reconnecting through another
client selects the same tenant. Different provider identities are separate until
an explicit linking flow is implemented; matching email or subject strings do not
merge their accounts.
Bearer tokens, cookies, session ids, caller tenant headers and program references
cannot choose the object. Only bounded MCP transport headers and request bodies
cross the private binding. The tenant backend must still authorize all references
inside its own storage; this gateway does not treat an opaque reference as access.

The resource handler currently forwards `/mcp` and authenticated downloads at
`/mcp/artifacts/<opaque-id>`. It defines no tools: the native backend must derive
its MCP surface from the engine registry. API bodies are bounded to 1 MiB while
reading; OAuth bodies to 16 KiB, with a ten-second read deadline. Resource URLs
reject query parameters, including bearer credentials. Responses are not cached,
and application error responses omit raw exceptions and upstream responses.

## Required deployment bindings

| Binding | Purpose |
| --- | --- |
| `PUBLIC_ORIGIN` | `https://kiln.instruktlabs.com`; final environment must verify ownership/TLS |
| `OAUTH_KV` | Dedicated OAuth records, separate from user artifacts |
| `GITHUB_CLIENT_ID` | Dedicated identity app's id |
| `GITHUB_CLIENT_SECRET` | Worker secret; never source, CI output or a browser variable |
| `TENANTS` | Private namespace of the separate tenant Worker; not a public evaluator endpoint |

Keep OAuth and GitHub secrets out of that separate tenant Worker and all evaluator
containers. Final deployment configuration must bind the real reviewed resources;
there is deliberately no deploy command or fabricated namespace id here.

The tenant Worker requires a SQLite-backed `KilnTenant` namespace, private R2
`ARTIFACTS` binding and positive integer `STORAGE_MAX_BYTES`, `STORAGE_MAX_OBJECTS`
and `STORAGE_MAX_GROUPS` limits. The test limits are fixtures, not launch quotas.
Its default HTTP handler returns 404; private operations are available only through
the Durable Object binding. Neither identity secrets nor OAuth KV are bound to it.

## Artifact storage boundary

Each tenant owns SQLite records and an isolated R2 key prefix. Uploads stream to R2
with an exact declared length, SHA-256 check and 64 MiB per-object ceiling. An
atomic reservation counts in-progress uploads against byte and object quotas before
external storage starts. A sixty-second deadline covers the stream and R2
acknowledgement. Timed-out or failed writes never become readable; cleanup retains
their quota reservation until object deletion succeeds. A late acknowledgement can
only trigger cleanup. Private declarations use safe basenames and known media types.

Unsaved bytes expire seven days after upload, and reads do not extend that clock.
Immutable saved groups atomically pin their file inventory until deletion. Group
metadata counts toward the tenant byte quota; a separate group-count ceiling also
bounds small-record growth. Repeating an identical save is idempotent; reusing an
active logical key with different contents is refused. Keys are database values,
never filesystem paths. A group deletion removes only files with no other saved
group reference. Server-generated blob and group ids are never reused.

Downloads require a live record in the selected tenant, not possession of an id.
They recheck access after the external read and validate stored length/checksum
metadata. Responses stream bytes as private attachments with no caching. Bearer
authorization is required through the gateway; browser-friendly download tickets
and the engine's `assetDownloadUrls` adapter are not implemented yet.

Alarms expire unsaved rows, retry deletion and reconcile aged orphan R2 objects in
bounded batches within one tenant prefix. Daily reconciliation remains scheduled
after ordinary artifact deletion to catch late interrupted writes. Account deletion
must retire its alarm only after outstanding work and cleanup have completed;
that owner/account lifecycle and its operating costs still need qualification.

This storage layer now supplies the engine's `ProgramStore` and `AssetLibrary`
contracts as described below. The standalone MaterialLibrary and production native
dispatch remain open. The private `/mcp`
endpoint deliberately returns 503 until native integration is configured and
qualified. Evaluation and registry-derived tools must be connected
and tested before declaring H2/H3 done.

Storage references: [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## Durable source references

`HostedProgramStore` implements the existing engine interface and imports its
portable `src/program-store.ts` reference/Unicode/size helpers directly. It creates
no cloud dependency in that module or the published package. Hosted CI also runs
when this shared module changes. The tenant bundle includes the exact helper source
in its input/hash receipt; it does not import the renderer or native evaluator.

Canonical references remain `sha256:<digest>`. The host emits the engine's supported
full-digest `p_<64 hex characters>` handle, avoiding an indefinitely growing alias
table and preventing an expired prefix from being reassigned. It does not resolve
unissued shorter prefixes. References are opaque identifiers, not access tokens;
every lookup searches only the current tenant's retained source bytes.

Source is valid Unicode encoded as exact UTF-8, including a leading BOM when
authored, and is limited to the engine's existing 1 MiB bound. Use a byte-preserving
decoder when bridging this API: ordinary `Response.text()` can strip that BOM.
Every read verifies bytes against the engine's canonical reference. An idempotent
put also verifies the existing source and does not repair corruption silently.
Concurrent identical puts share one upload. After object eviction, the durable
content index resolves the same artifact without relying on the in-memory map.

The source store shares file/object quotas with GLBs and other tenant artifacts.
Quota exhaustion never evicts existing work. Identical puts and reads do not renew
expiry; explicit resubmission after expiry creates a fresh retained copy. A saved
group can pin its source artifact until deletion. Source stats count live distinct
source snapshots, whereas total tenant usage also includes other files and pending
cleanup. The `retention` property tells tool callers about the seven-day unsaved
lifetime; `eviction: none` means no capacity-driven eviction.

The private binding serves source creation, reads and stats at `/internal/programs`
and `/internal/programs/<reference>`. Source creation returns its reference and
artifact id. Saved asset records currently retain their own exact source artifact;
cross-adapter source deduplication is not implemented.
These paths are not public gateway endpoints or new MCP tools. The native client
and its engine integration tests are described below. Production native dispatch,
and the complete deployed edit/render/save/reconnect flow remain open.

## Native source client

`NativeProgramStore` implements the same engine contract over bounded HTTP. It
accepts no tenant selector, credentials or configurable URL. Its only destination
is `http://kiln-storage.internal/internal/programs`; redirects and cookies are
disabled. A future controller must register a scoped outbound interceptor for
that hostname and select the tenant outside the container. Cloudflare documents
virtual-host HTTP access to Worker bindings and `interceptOutboundHttp` on the
Durable Object Container API. The intended container configuration disables Internet
access and permits only this intercepted hostname. This integration still needs
implementation and testing on the provider.
[Worker connections](https://developers.cloudflare.com/containers/configuration/workers-connections/),
[Container API](https://developers.cloudflare.com/containers/api/durable-object-container/).

The client rejects malformed references and source before sending, verifies
returned source hashes and exact UTF-8 bytes, and bounds streamed source to 1 MiB
and response metadata to 2 KiB. Its configurable deadline defaults to 15 seconds
and includes both response headers and body reads. Request cancellation must be
supplied from the native host's per-request context. It cancels stalled reads,
cleans up late responses and returns fixed errors instead of network diagnostics,
upstream bodies or caller-supplied abort reasons. Reads never create an authority
to access another tenant's source.

The six native-client checks include actual registry tools with a fixed trusted
fixture, source preservation after editing, new host construction, storage eviction,
cross-tenant denial, integrity failures, size limits, deadlines and cancellation.
This fixture explicitly uses `trusted-local`; it is test code excluded from production
bundles. The production host still requires `evaluator-required` and qualified
isolation. `/mcp` remains unavailable until that host is configured and qualified.
The client uses standard Fetch types in a separate TypeScript check; Worker code
continues to use the Cloudflare runtime types.

## Native saved assets

`NativeAssetLibrary` implements the engine's existing collection, save, read, list,
import and export contract. Its `project` collection is workspace storage, not
project membership; `library` is a second user-owned destination. Asset and revision
ids remain collection-qualified. No extra MCP tool or schema is introduced.
The actual registry's `kiln_save`, `kiln_assets` restore/list and `kiln_export` are
exercised through this adapter in the local fixture.

The adapter uses the published SDK's record verifier and material resolver; GLB,
source, preview, manifest and any required editable material closure are separate
quota-counted artifacts. Native bundles retain external imports of the three public
SDK modules, which the eventual image must install at the same qualified version.
Workers own tenancy, quotas and atomic revision indexing; they do not import the
native engine or decide whether an asset is structurally valid.

Saving a new revision requires a parent when the asset already exists. The Worker
checks the parent or absence of prior revisions in the same transaction as pinning
the inventory, including competing saves. Imports retain immutable revisions and
unknown provenance, can carry a revision without its ancestors, and are idempotent
when the existing record is identical. Every input is validated before an import
writes anything; commits are atomic per revision, not per batch. A later network
failure can leave earlier imported revisions saved, so retries use the same ids.

Each batch is limited to 100 revisions and 64 MiB including manifests and material
closures; each manifest is limited to 1 MiB. Lists page the private index in groups
of 32, and the native result is bounded to 10,000 manifests and 64 MiB. These are
implementation ceilings, not measured public usage quotas.

Failed saves attempt an independently bounded cleanup of acknowledged staging
files. The Worker checks saved pins atomically, so a lost commit acknowledgement
cannot cause cleanup to delete the committed revision. An unacknowledged upload,
a process crash or failed cleanup can leave unsaved bytes charged until the normal
seven-day expiry/recovery path removes them. `deleteRevision` is a host UI/account
operation; it preserves copies in other collections. Browser/account deletion UI
and its deployed lifecycle remain open.

Embedded material records are retained and verified using the SDK's canonical
dependency semantics. An injected MaterialLibrary receives the closure on import;
the separate durable hosted MaterialLibrary is still unimplemented. A textured
fixture rebuilds the exported/imported GLB byte-for-byte without its original
library. This does not qualify software rendering or native isolation on Cloudflare.

Source restoration, MCP source reads, reviewed saves and CLI rebuild observations
preserve a leading UTF-8 BOM. Otherwise restoring an asset could change the exact
source bytes and its program reference; focused engine tests cover those paths.

Before launch, complete native isolation on the actual Cloudflare provider,
tenant engine/storage integration, two-user asset/download denial tests, retention,
admission/cancellation and cost controls, identity-provider setup, live client
connections, support/privacy pages and exact deployed identity verification.

Sources checked 6 October 2026:
[Cloudflare OAuth library](https://github.com/cloudflare/workers-oauth-provider),
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
[GitHub OAuth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
