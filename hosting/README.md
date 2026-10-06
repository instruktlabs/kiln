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

## Private evaluator client

`createNativeEvaluatorPort` speaks the published SDK's versioned evaluator
protocol over `http://kiln-evaluator.internal/evaluate`. It accepts no URL, tenant
selector or credentials. The SDK owns request construction, response identity,
GLB and QA validation. This client applies the private host's ceilings: 60 seconds,
4 MiB request/GLB and 8 MiB response. Invalid controls fail before dispatch;
larger valid caller allowances are clamped to these limits.

Storage, evaluation and rendering share bounded stream/cancellation handling, but have
separate fixed origins, paths and allowed headers. Network diagnostics, abort
reasons and upstream bodies do not become public errors. A failure never selects
an in-process fallback. Tests exercise the real MCP render/save/reconnect flow
through this protocol using a fixed trusted evaluator fixture; that fixture is
not cloud isolation evidence.

The provider controller binds this intercepted hostname to a fresh job and retains
global admission until verified VM destruction. The complete deployed flow still
needs qualification. A returned HTTP timeout does not prove cleanup. The
existing default native loader still fails closed on missing nested isolation;
no production configuration or public endpoint is enabled by this client.

`evaluation-worker` supplies a private `KilnEvaluationJob` Durable Object and
returns 404 from its default HTTP handler. Its private request handler admits
only the fixed evaluation route, bounded JSON and numeric execution limits;
request reading consumes the same deadline. It delegates execution and its alarm
to `ContainerEvaluationJob`, awaiting its verified cleanup before returning output.
No source, identity, executable or image selector is accepted through headers.
The native client and this handler are exercised together with the actual SDK
codec. The externally tenant-bound dispatcher and global admission controller are
implemented below; end-to-end provider qualification and deployment remain open.

The private evaluation DO also exposes `cancel()` to its parent dispatcher. One
controller lives for the DO instance, so cancellation reaches an evaluation still
waiting to claim its durable record. A cancelled child that has not arrived gets
a permanent terminal record; later delivery cannot start it after object eviction.
For active work, the cancellation flag and immediate recovery alarm are persisted,
then the caller waits for confirmed whole-VM cleanup. Failed cleanup keeps the
record unfinished and schedules recovery. Repeated cancellation and its alarm
share the pending cleanup. The parent must retain admission whenever cancellation
fails or its acknowledgement is lost. These cases have local adversarial tests;
the new parent-cancellation RPC still needs provider qualification.

## Private software rendering

`createNativeRenderPort` sends only a self-contained GLB and validated view options
to `http://kiln-renderer.internal/render`. It accepts no URL, source program,
tenant, image or credential selector. The versioned response must match the exact
request ID, GLB digest, view count, camera values, dimensions and presentation rig.
Only the fixed software Vulkan backend is admitted. Engine `captureViewsViaPort`
continues to own PNG validation, its deadline and truthful CPU degradation; this
transport never implements a second fallback policy.

The private limits are 4 MiB GLB, 6 MiB request, 20 MiB wire response, 12 MiB PNG
bytes, 1,024 pixels per dimension and 3,145,728 pixels across requested images.
The MCP host admits 8,388,608 pixels including grid composition and a 12 MiB
capture output. The render deadline is 30 seconds, bounded further by the parent
deadline. This is a qualification candidate, not a measured production latency
promise; the earlier six-view provider fixture took 13,286 ms including cleanup.

`render-worker` exposes only the private `KilnRenderJob` DO. It shares evaluation's
HTTP limits, one-use durable lifecycle, cancellation fence, alarm recovery and
whole-VM destruction through fixed host profiles. `RENDERS` must bind this class;
its immutable named image is `renderer`. `EVALUATIONS` remains a separate binding
with image `kiln`. No request can select the profile or executable. The renderer
runs `/opt/kiln/render.mjs` as `1000:1000` with networking disabled and no secrets.
Its input and self-contained GLB are checked before graphics initialization. The
entry explicitly selects the pinned Mesa ICD because native exec does not inherit
the image's environment.

Local Docker qualification exercises that actual entry and installed port, producing
eight independently decoded PNGs across three backdrops, a beauty image and an
exact camera. Real workerd loopback/RPC tests verify host-owned routing and reject
forged identity fields. These do not qualify the integrated Cloudflare path. See
[the image procedure](container/README.md#one-shot-software-render-entry).

## Private request dispatcher

`request-worker` adds one `KilnNativeRequest` Durable Object per admitted MCP
request. Its private `run` RPC accepts the verified tenant hash and an absolute
deadline of at most 120 seconds. The tenant and child-job inventory remain in
Durable Object storage, outside the coordinator VM. That VM starts offline from
the pinned `coordinator` image with only the public origin in its environment.
Readiness and image readback precede sending the bounded MCP request.

Three fixed HTTP interceptors use host-configured loopback binding props to select
the request object. Storage RPCs select the tenant from its durable record; URLs,
headers and body fields cannot choose it. The storage route allowlist excludes
administrative operations. This uses the documented Container interception API
and Worker loopback props. Local workerd checks exercise the actual RPCs, tenant
storage and object eviction, including cross-account source denial. Deliberate
HTTP errors are converted to responses before RPC serialization, which does not
preserve their custom JavaScript prototype.

Each request admits at most one active child evaluation or render and eight
children in total. Every child ID and kind is persisted before dispatch and receives at most the
remaining parent deadline. A child's cancellation acknowledgement is required
before another child can start. Completion or cancellation first closes the
durable request to new work, then confirms destruction of the coordinator and
all registered children, routing cancellation by their persisted kind. Unknown cleanup retains the record and a recovery alarm;
late delivery is refused through the child's durable cancellation fence. Parent
responses are bounded to 32 MiB and withheld until cleanup completes.

The default Worker route remains 404. The gateway uses the private admission
binding described below and returns 503 for native calls when it is absent. No production
configuration, public route or new Cloudflare job is enabled by these modules.
Provider qualification must test the coordinator/interceptor/child flow together;
local state-machine and workerd tests do not establish that live boundary.

Sources: [Container API](https://developers.cloudflare.com/containers/api/durable-object-container/),
[loopback binding props](https://developers.cloudflare.com/workers/runtime-apis/context/#specifying-ctxprops-when-using-ctxexports),
[RPC Request and Response transport](https://developers.cloudflare.com/workers/runtime-apis/rpc/#readablestream-writablestream-request-and-response).

## Shared compute admission

`admission-worker` owns one global `KilnAdmission` SQLite Durable Object. The
gateway receives only a named `KilnCompute` service binding as `NATIVE_COMPUTE`;
that entrypoint always selects `global-v1`. It cannot accept a caller-selected
admission object or expose operator controls. Artifact downloads continue through
tenant storage without starting compute. The authenticated edge path below serves
metadata and helper discovery without a coordinator or compute reservation.

An admitted request reserves one coordinator and at most one active child VM.
One request per account and the configured global concurrency limit are enforced
atomically with per-account minute/day and global day/month attempt counters.
Counters use UTC calendar windows. Failed admitted work consumes its attempt;
rejected work does not. There is no queue of unbounded pending requests.
429 responses include `Retry-After`. Required settings have no implicit defaults:

| Setting | Meaning |
| --- | --- |
| `COMPUTE_MAX_CONCURRENT` | Concurrent request trees; implementation ceiling 16 |
| `COMPUTE_TENANT_PER_MINUTE` | Admitted requests per account per UTC minute |
| `COMPUTE_TENANT_PER_DAY` | Admitted requests per account per UTC day |
| `COMPUTE_GLOBAL_PER_DAY` | All admitted requests per UTC day |
| `COMPUTE_GLOBAL_PER_MONTH` | All admitted requests per UTC month |
| `COMPUTE_DEADLINE_MS` | Absolute request lifetime, at most 120,000 ms |

These are configuration controls, not adopted launch quotas or an invoice cap.
Provider measurements must include both VM types, cold starts, retries, and
non-compute services. The global ceiling is a validation bound, not demonstrated
capacity. Launch values and total capacity still require measurement.

The reservation and recovery alarm commit together before the parent RPC. A
deadline or disconnect triggers out-of-band parent cancellation. Admission is
released only after the parent confirms whole-tree cleanup, including children
and its durable fence against late requests. Unknown cleanup suppresses output,
retains capacity, and schedules another recovery attempt. Eviction and elapsed
time never free a slot by themselves. Expired usage counters are cleaned in
bounded batches. No OAuth credentials or source content enter admission storage.

The separate private `KilnComputeControl` binding exposes pause/resume and
aggregate status. Bind it only to an authenticated operator service. Pause is
durable, rejects new compute and attempts cancellation of every active request;
unconfirmed cleanup remains visible in `pendingCleanup` and retains its slot.
Resuming does not bypass those reservations or reset usage counters.

Local workerd tests cover the actual SQLite/RPC boundary, concurrent admission,
quota rollover, operator separation, eviction/recovery, stalled calls and a
response/cancellation race. The race test reproduced a discarded response body
left open and now verifies its closure. No new cloud qualification is implied.
Implementation follows the current [SQLite transaction contract](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction)
and [alarm contract](https://developers.cloudflare.com/durable-objects/api/alarms/).
Production configuration, integrated rendering and deployed qualification remain open.

## Authenticated edge discovery

After the same OAuth scope, account and connection checks used by native calls,
the gateway serves initialization, protocol discovery, tool/resource lists and
static `kiln_discover` queries directly in the Worker. Ping, notifications, malformed
JSON and unknown tool names also stay on that path. No storage or native service is
available to its handler. Source operations, resource reads and live capabilities
still go through shared admission. Routing inspects the bounded JSON body; a
forged `mcp-method` header cannot turn metadata into native execution. Both paths
use the maintained MCP handler, with stateless legacy compatibility. HTTP responses
remain `no-store`; protocol cache hints apply only to fixed public definitions.

`node hosting/scripts/edge-manifest.mjs --write` captures metadata from the actual
engine server with the hosted storage surface. Its sentinels throw if any host
service is invoked. The build checks the committed snapshot; it never silently
updates it. The actual native HTTP fixture independently checks every tool schema,
resource, template and initialization field against that snapshot. Helper results
and validation diagnostics are compared with the engine host. The Worker imports
only the pure discovery algorithm/schema and a generated catalog, not the Node
engine, renderer or evaluator. The `workerd` build condition selects the MCP SDK's
Worker-compatible schema validator without runtime code generation.

The independent installed-image workflow uses `npm run build -- --native-only`.
That path builds only the private Node adapters, without loading checkout engine
bundles or generated edge metadata. An isolated-checkout test verifies it with no
`dist/` or `lib/`; the normal build still requires metadata parity. This preserves
the image workflow's qualification against the published npm archive.

Real workerd tests cover modern discovery, legacy initialization, malformed
messages, forged routing headers, missing native bindings and primary-database
revocation despite retained OAuth KV records. No authentication or compute quota
is bypassed for operations that require native execution. Provider startup/cost
measurements and final hosted-specific instructions remain launch checks; the
current instructions deliberately match the published engine verbatim.

Sources: [MCP discovery](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/discover.mdx),
[Cloudflare stateless MCP guidance](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/).

## Private Node host

`native-host` adapts the MCP Fetch handler through the maintained
`@modelcontextprotocol/node` adapter. It listens only inside the coordinator VM
on port 3000, requires the fixed `kiln-native.internal` Host and exposes a minimal
`/_ready` route. Header/body bounds, an upload deadline and client-disconnect
propagation precede the MCP handler's own execution and response limits. A chunked
body flood may close the socket before the adapter can deliver its 413 response;
either outcome must occur before MCP dispatch.

`container/serve.mjs` requires an exact HTTPS public origin and selects the explicit
remote evaluator profile. Missing private storage or evaluation services fail
closed; they never enable in-process source evaluation. The default local loader
still retains its separate isolation requirements. Neither profile is an automatic
fallback for the other.

Build and qualify the minimal image through
[the container instructions](container/README.md#private-mcp-coordinator-image).
Local Docker evidence establishes installed MCP startup, protocol compatibility
and request rejection. It does not establish Cloudflare routing or tenant
isolation. The outside dispatcher must bind the storage/evaluation interceptors,
retain admission through all child-job cleanup and destroy the coordinator VM.

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
