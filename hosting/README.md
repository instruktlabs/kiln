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
documented simulation bindings. Tests replace GitHub network responses with fixed
identities. Routing tests use a recording backend; storage tests use the production
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

The owner selected GitHub sign-in for free hosted v1 access, private saved assets
and personal quotas. The local package needs no Kiln account. The adapter requests
no repository scopes, uses upstream S256 PKCE,
and resolves the current GitHub user for every login. Only `github-<immutable id>`
becomes a subject. Login names and email addresses are not tenant identifiers.
Upstream tokens are used only for the identity lookup and are not stored or passed
to the backend. This needs a dedicated Instrukt Labs OAuth app; no app or secret
has been provisioned by this implementation.

Launch requires a clearly branded Kiln / Instrukt Labs connection page, a verified
service domain, a plain explanation of the granted access, privacy/support links
and usable disconnect/deletion controls. Verify actual provider consent, denied
and cancelled sign-in, token expiry/revocation and cross-user access on the deployed
service. Local fixtures are not acceptance of that end-user experience or its
deployed security. Keep GitHub credentials only in the gateway's secret bindings;
never send them to an evaluator, log them or store them with artifacts.

Consent names the requesting client, verified domain when available, callback
host, scopes and loopback warning. The library binds consent and upstream state
to HttpOnly, Secure browser cookies; the form additionally checks its exact
origin. Client-supplied strings are escaped. The page forbids scripts and framing.
The `kiln:use` scope permits the engine's asset lifecycle, including deletion;
`offline_access` permits a renewable connection with a fixed 30-day lifetime.
Access tokens expire after 15 minutes. Revocation uses the advertised endpoint.
Production KV propagation means the local revocation test does not promise
instant global revocation; this needs explicit operational qualification.

Verified OAuth subjects alone select a Durable Object, using a versioned hash of
issuer and subject. Reconnecting through another client selects the same tenant.
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
