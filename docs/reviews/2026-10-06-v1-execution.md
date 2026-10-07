# Kiln 1.0 execution record

Started 6 October 2026 by the owner's active goal. Working checkout:
`C:/Users/Mattm/X/kiln-oss`, branch `codex/v1-publication`, initial source
`65ce2f815a70ca3bdf8ad4fa1f8bf52d5fd08581`.

The [publication plan](../plans/2026-10-05-v1-publication-plan.md) defines scope;
[hosting economics](../plans/2026-10-06-hosting-economics.md) records assumptions.
This record tracks evidence, not release acceptance by implication. Community
contributions remain outside this cycle. Stable `@instruktlabs/kiln@1.0.0` is now
public on npm under `latest`; the release candidate remains under `next`. The
production hosted service remains unpublished. The table below is current; the dated execution notes retain earlier
states and the evidence that superseded them.

## Deliverables and evidence

| ID | Requirement | State and required proof |
| --- | --- | --- |
| P0 | Preserve publisher/repository setup | Complete in [publisher setup receipt](2026-10-06-publisher-setup.md); current checkout remote verified `instruktlabs/kiln` |
| P1 | Public API, stability and migrations | Stable contract published: 55 public entrypoints classified, experimental/re-export and deprecated-alias boundaries documented, and explicit 0.10.0/RC-to-stable managed workspace upgrades qualified |
| P2 | Compiled ESM SDK and declarations | Stable SDK published and qualified: compiled ESM/declarations, dependency-free core and optional-peer boundaries; public-registry installs pass across the supported Linux/Windows/macOS matrix |
| P3 | Package identity, contents, executables and notices | Stable published: PR #151 merged as main `fda71ac`; all 12 exact-main CI jobs and release verification passed. Owner-approved staging/promotion completed, and the public archive SHA-256 `6ed3d6b9...1508` and signed provenance independently verified |
| P4 | Clean installs and workspace upgrades | Stable qualified: all seven public-registry jobs pass; fresh Windows archive passes 25 consumer checks; Claude/Codex cached installers render/save/reopen/export; 0.10.0 and RC-to-stable upgrades preserve assets/customizations and refuse conflicts |
| P5 | Release automation and npm publication | Stable published and verified: approved stage promoted after npm security-key authentication, latest=1.0.0, public archive/provenance verified. PR #152 merged as 77dfbc3 after all twelve CI and seven registry jobs passed. GitHub v1.0.0 release/tag and downloaded archive verified |
| H1 | Native Cloudflare qualification | Fixed native qualification and private integrated candidate `c755434` passed. The latter passed ten lifecycle/isolation/quota checks using thirteen of seventeen allowed VM starts; all resources were removed and absence verified. Thirty-five actual VM starts across approved trials are recorded. Latest combined source/image qualification, representative load and settled billing remain open |
| H2 | Authenticated MCP and tenant boundary | In progress in draft PR #153: primary-D1 access/revocation, browser confirmation, Google/GitHub linking/unlinking and durable full-account deletion are implemented and locally tested. A thirteen-check preflight now exercises gateway/token/storage/revocation paths across the prepared six-Worker topology with synthetic accounts and paused native admission. Owner selected in-app security notices only for v1. Live sign-in and final combined-service qualification remain open |
| H3 | Artifact lifecycle | In progress in draft PR #153: native dispatch, private saved assets/material closures, verified evaluator identity, browser download tickets, quotas/retention and account retirement are locally tested. The earlier frozen private trial proves render/save/reopen/export/isolation for its recorded scope; newer material/download/deletion work still needs deployed qualification |
| H4 | Capacity and operations | In progress: shared SQLite admission, global/per-account quotas, operator pause, native cleanup and durable account-deletion recovery are implemented. Launch quota values, representative load/costs, deployed Cron recovery, retention/alerts/escalation, deployed identity and rollback verification remain open |
| H5 | Production deployment | Pending: approved deployment at `kiln.instruktlabs.com`; live authenticated create/edit/render/save/download/reconnect flow |
| L1 | Local Claude Code and Codex plugins | Stable distribution qualified: both actual client catalogs install kiln-engine 1.0.0 and download the exact public npm runtime; real MCP/CLI flows and Codex skill/tool discovery pass. RC and 0.10 workspace upgrades preserve stores. Same-profile RC-to-stable cache updates also pass, retaining the pinned workspace runtime and original saved assets |
| L2 | Public OpenAI plugin | Pending: compliant ZIP, verified publisher/domain, working MCP, privacy/support pages, review cases/video/account, submission receipt |
| L3 | Anthropic directory | Pending: owned marketplace is public and installed successfully; directory eligibility, exact final source, portal validation, reviewer materials and submission receipt remain open |
| V1 | Exact candidate verification | Package qualified: exact main fda71ac archive, twelve main CI jobs, release verification, public registry/provenance, seven-platform registry installs, fresh local consumer checks and stable plugin/workspace flows pass. Hosted end-to-end verification remains open |
| V2 | Release documentation and receipts | Pending: changelog/migrations/install/support/security/privacy/runbook; exact commits, hashes, versions, URLs and separate vendor-review state |

## Execution notes

### Authenticated metadata and helper discovery at the edge

The gateway now answers protocol metadata and static helper discovery without
starting a coordinator VM or reserving compute. The OAuth scope, current account
and primary-database connection checks still run first. Source/private-resource
operations and live capabilities retain the admitted native route. Tool and resource
definitions are captured from the actual engine protocol, checked during builds
and compared independently with the real native HTTP host. The Worker bundles only
the pure discovery service and generated catalog, with no native evaluator.

Focused tests first demonstrated missing gateway routing and invalid Discovery
arguments becoming transport errors. Those now pass, including engine-compatible
error guidance and path redaction. An older assertion expected modern server identity
at the top level; it was corrected against the current MCP discovery specification,
which places it in result metadata. Authentication checks also prove that revoked
credentials cannot obtain edge metadata through stale OAuth KV records.

All 245 hosted tests, three hosted typechecks, ten production bundles and root
typecheck/lint pass. The actual gateway bundle is 2,401,079 unminified bytes;
startup CPU and deployed cost remain unmeasured. Source and production-bundle
secret scans are clear. Receipts: `.cache/edge-hosted-tests.log`,
`.cache/edge-source-scan.json` and `.cache/edge-bundle-scan.json`.
The preceding admission commit `892ebd8` passed all eighteen CI checks, including
[engine/package CI](https://github.com/instruktlabs/kiln/actions/runs/37542572710).
Both hosted platforms passed the edge commit `82dd546` in
[run 37544102514](https://github.com/instruktlabs/kiln/actions/runs/37544102514).
Its independent native-image job exposed an unconditional checkout SDK import
in the combined build script. The native-only build now skips that edge dependency;
an isolated-checkout regression first reproduced the failure without `dist/` or
`lib/`, then passed. The image workflow uses that path, while the ordinary Worker
build retains its required metadata check. The build correction needs fresh CI.
Hosted-specific instructions, integrated
rendering, account lifecycle and live qualification remain open.

No cloud upload, compute job, main merge, npm change or deployment occurred. The
approved cloud allowance is still exhausted and the public service is unpublished.

### Shared admission and gateway connection

The gateway now routes MCP through a private service binding that selects one
fixed global SQLite admission object. Artifact downloads stay on the storage
path. Required configuration controls per-account minute/day usage, global
day/month usage, concurrent requests and deadlines. A request reserves capacity
before dispatch and keeps it until its coordinator and children confirm cleanup.
Unknown cleanup stays reserved across eviction and alarm recovery. A separate
operator binding supports durable pause without exposing that control to the
gateway. Launch values have not been adopted from the test fixtures.

Focused tests first failed for the missing controller/entrypoint and the old
gateway routing. An adversarial same-turn cancellation case then reproduced an
unclosed discarded response body; the fix retains and cancels that response even
when the cancellation wins the promise race. Real local workerd tests also cover
concurrent requests, denied-attempt accounting, UTC quota rollover, missing
configuration, operator separation and recovery after eviction. Provider
qualification and an inexpensive edge path for MCP discovery remain pending.

All 237 hosted tests, three hosted typechecks, ten production bundles and root
typecheck/lint pass. The full offline engine suite passes 3,290 tests with two
platform-specific skips and zero failures. Production source and bundle scans
report no secrets. Logs are retained in `.cache/admission-hosted-tests.log` and
`.cache/admission-root-tests.log`; source and bundle scan
receipts use `.cache/admission-{source,bundle}-scan.json`.

The previous commit `83a8272` is now green across all eighteen CI checks. Its
Windows hosted job initially failed one of 221 tests with Miniflare `fetch failed`.
The focused test and all 221 tests passed locally; a single rerun of the failed
Windows job in [run 37540274823](https://github.com/instruktlabs/kiln/actions/runs/37540274823)
passed unchanged. The first transport failure remains unexplained; no test was
weakened or removed. The new changes require their own cross-platform CI.

No cloud upload, compute job, public route, main merge or deployment occurred.
The approved cloud allowance remains exhausted. The stable public package is unchanged.

### Request dispatcher and private tenant bindings

The private request controller now starts a pinned offline coordinator, waits for
readiness and image confirmation, and binds fixed storage/evaluation interceptors
using host-owned loopback props. Tenant selection comes from the request's durable
record. A request allows one active child and at most eight children total, records
each child before dispatch, and withholds its bounded response until the entire VM
tree is confirmed stopped. Failed cleanup remains unfinished for alarm recovery.

The first tests failed for the missing implementation. Follow-up cases reproduced
startup after an expired durable claim and a Node stream-forwarding incompatibility;
both are fixed. The real workerd fixture also demonstrated loss of the custom HTTP
error prototype across RPC. Errors are now converted before crossing that boundary,
preserving intended statuses while redacting unexpected diagnostics. Local workerd
checks use the actual private entrypoints, loopback props, tenant/R2 storage and
eviction: Alice's source remains unavailable through Bob's request object.

All 221 hosted tests, three hosted typechecks, nine production bundles and root
typecheck/lint pass locally. The earlier cancellation commit `432cb2c` passed all
eighteen CI checks, including [engine/package CI](https://github.com/instruktlabs/kiln/actions/runs/37538519458),
[both hosted platforms](https://github.com/instruktlabs/kiln/actions/runs/37538519509)
and [all three installed images](https://github.com/instruktlabs/kiln/actions/runs/37538519558).

The shared admission service, its quotas and the gateway connection are still
pending. The new controller has local orchestration evidence only; it has not run
on Cloudflare and does not enable public MCP. The total approved cloud-job allowance
remains exhausted, with no new upload, compute job or production deployment.

### Durable child cancellation

The private evaluation DO now keeps a single controller and exposes a parent-only
cancellation RPC. Before any child request arrives, cancellation writes a permanent
terminal record that survives reconstruction. During a pending durable claim it
also aborts the live controller, preventing late startup. Active cancellation
persists a recovery flag and alarm and waits for verified whole-instance cleanup;
failed cleanup retains the unfinished job for recovery, even before the original
execution deadline. A completed job remains unchanged by repeated cancellation.

Five focused cases failed before implementation and now pass. An additional
overlap assertion reproduced duplicate destruction from cancellation plus an
alarm; the alarm now joins the same pending cancellation. Local checks pass all
204 hosted tests, three hosted typechecks, eight bundles and root types/lint.
The Node-host commit `f6a7d39` independently passed Linux/Windows hosted checks
and all three image jobs in [run 37537769251](https://github.com/instruktlabs/kiln/actions/runs/37537769251).

The implementation follows the current [Container API](https://developers.cloudflare.com/containers/api/durable-object-container/)
and [alarm contract](https://developers.cloudflare.com/durable-objects/api/alarms/),
including repeated alarm delivery and explicit recovery scheduling. This new RPC
is locally qualified only; the earlier fixed cloud receipts do not establish its
provider behavior. No live job or deployment occurred, and the parent/global
admission implementation remains open.

### Private Node host and installed coordinator image

The native coordinator now has an actual HTTP entry using the maintained MCP Node
adapter, separate from the untrusted evaluator image. The entry selects the remote
evaluator explicitly and requires an exact public HTTPS origin. Socket-level tests
cover the fixed internal Host/path, request limits, stalled uploads and propagation
of disconnects. Invalid startup settings and missing private services fail closed;
there is no fallback to in-process source evaluation.

The focused tests were observed failing before implementation. All 199 hosted
tests, three hosted typechecks and eight production bundles now pass locally.
The prior integration commit `4e7a304` also passed all engine/package checks in
[run 37535301751](https://github.com/instruktlabs/kiln/actions/runs/37535301751),
Linux/Windows hosted checks, both evaluator images and the website build.

The new coordinator image was built with a minimal eight-file context and the
exact published stable archive. Image
`sha256:5402d67069e8b5c9d355e4f49b9ae92d353171b381d27496f85f5794adf95d75`
passes readiness, modern MCP discovery, legacy initialization, foreign-host and
credential rejection, and failure without private services. It advertises the
fourteen actual registry tools. The Docker fixture used no host port, disabled
networking and a non-root, read-only, resource-bounded container; that container
was removed. The image/lock/bundle identities and inventories are retained at
`.cache/native-host-image/qualification/receipt.json`. Both hosting and generated
image locks reported zero known npm audit findings. CI now builds and exercises
this image in a separate job without cloud access or image publication.

These are local coordinator checks, not an extension of the Cloudflare isolation
receipt. No new cloud job, deployment or registry write occurred. The dispatcher
still needs tenant-bound interceptors, whole-job-tree recovery/global admission,
software rendering and complete hosted lifecycle qualification.

### Stable plugin cache updates

Both isolated qualification profiles now have `kiln-engine@instruktlabs` version
1.0.0, upgraded from their existing 1.0.0-rc.1 caches through the actual Claude
and Codex CLIs. Cached provenance inventories verify byte-for-byte. Their managed
workspaces remain pinned to the RC until an explicit workspace upgrade; the
original saved asset hashes and owner notes remain intact. The separate previously
qualified RC-to-stable workspace upgrade is still the intentional next step.
Receipt: `.cache/v1-stable-cache-upgrade.json`.

These test profiles had explicitly selected the development catalog branch,
`codex/v1-publication`. Both CLIs correctly refused replacing a declared catalog
with a different source through `marketplace add`. Only the isolated profiles'
declared ref was changed to `main`, followed by normal marketplace/plugin updates.
The refusals and continuation are retained in the receipts; no normal user profile
was changed. Full before/after workspace snapshots bracket the Codex update and
the repeated Claude refresh. Claude's first update is supported by the CLI's
RC-to-stable result and verification of the original saved file hashes afterward.
Do not recommend deleting a marketplace as the normal upgrade route: Claude's
current CLI documentation states that this also uninstalls its plugins and may
delete plugin-managed data. [Claude plugin commands](https://code.claude.com/docs/en/plugins/cli-reference#plugin-marketplace-remove).

### Native dispatch integration branch

`codex/v1-native-dispatch` combines the published stable source and release record
with the account-controls and provider-qualified controller branches. This is
integration work, not a main merge or deployment. The full README/site refresh
remains a final release task as the owner requested.

The new private evaluator client uses the published SDK's v2 protocol and validates
response identity, GLB and QA through that SDK. Its separate fixed hostname carries
no account selector or credentials and clamps hosted work to 60 seconds, 4 MiB
input/GLB and 8 MiB output. A private evaluation Worker exposes the existing
single-use controller through a bounded HTTP handler, with request reading charged
against the execution deadline and no early return that bypasses job cleanup.
The default Worker route is 404; production bindings are not configured.

Focused tests first failed for the missing client/handler, then exposed a real
cancellation race between receiving headers and attaching a body reader. The
shared native transport now closes that stream on cancellation and other failures.
Adversarial tests cover hostile identity headers, route confusion, mismatched
response IDs, invalid UTF-8, declared/streamed size limits, delayed bodies,
cancellation, redacted errors and no in-process fallback. The real MCP fixture
renders, saves and reconnects using the new protocol transport; a separate fixture
connects the actual native client, private HTTP handler and SDK evaluator together.
These fixtures use fixed trusted source locally and do not extend the Cloudflare
isolation receipt. No new cloud jobs or paid operations were started.

Local qualification on Node 22.23.3/npm 12.2.0/Bun 1.4.2 passes all three hosted
typechecks, all 193 hosted tests and seven production bundles. Root toolchain,
typecheck and lint pass; the full offline engine suite reports 3,290 passed,
two platform-specific skips and zero failures. Logs are retained at
`.cache/native-dispatch-hosted-tests.log` and
`.cache/native-dispatch-root-tests.log`. Cross-platform CI remains the next gate.

The outer tenant-bound dispatcher, global admission, production renderer,
account lifecycle and live-provider verification remain open. HTTP cancellation
alone must never release a global slot while VM destruction is unconfirmed.

### GitHub stable release and final documentation scope

The owner approved the prepared GitHub release. [Kiln 1.0.0](https://github.com/instruktlabs/kiln/releases/tag/v1.0.0)
was published at 21:19:19 UTC on 6 October 2026. Tag `v1.0.0` resolves to
`fda71ac775750f25390b6ee30082ebc56463edc6`, matching the public npm provenance.
The release attaches the 9,155,191-byte published archive and `SHA256SUMS.txt`.
A fresh GitHub download hashes to
`6ed3d6b9964429f14c3c6a0a6a13d56be509dd0f40b07061a37d491f901c1508`;
the checksum file and remote asset digest agree. The public notes explicitly keep
hosted access and vendor submissions pending. Receipt in the stable worktree:
`.cache/stable-main-qualification/github-release-receipt.json`.

The owner reaffirmed the final documentation pass after the remaining work.
Audit the root README, maintained repo guides and generated/site content for old
package identities, prerelease/default-tag claims, install commands, supported
runtime versions, plugin setup, authentication/hosting availability and deprecated
architecture advice. Reconcile every public promise against the shipped or live
surface. Include the deferred Troy scene images and new user/agent onboarding.
Keep historical review records dated; they are not current installation guides.
Validate the final website build and real navigation/install paths before its
separate approved publication. No broad README or site rollout happened here.

### Stable installed clients, upgrades and native resilience

All twelve engine/package CI jobs in [run 37528755662](https://github.com/instruktlabs/kiln/actions/runs/37528755662)
and seven public-registry installation jobs in [run 37528755713](https://github.com/instruktlabs/kiln/actions/runs/37528755713)
passed. The registry matrix covers Linux Node 20.15/22.2/22.23.3/24.20, Windows
22.23.3 and macOS Intel/Apple Silicon. After explicit approval, PR #152 merged as
`77dfbc35197e372e1039995c2160830ddda8a197`, updating the immutable public
release record. A duplicate manual registry run was cancelled after the automatic
PR run appeared; it is not the qualification receipt.

Fresh isolated Claude Code 2.1.287 and Codex CLI 0.160.1 profiles installed the
stable plugin from the public Instrukt Labs catalog at source `fda71ac`. Their
cached setup helpers downloaded npm 1.0.0, verified its archive integrity and
created managed workspaces. Each workspace completed Discovery, CPU render,
save, process restart, exact retained source and CLI export. Codex's native
app server discovered the cached setup skill, three workspace skills and seventeen
MCP tools at version 1.0.0 without model calls or normal-profile changes.
Receipts: `.cache/v1-stable-remote-plugin-install.json`,
`.cache/v1-stable-plugin-workflow.json` and
`.cache/v1-stable-codex-appserver.json`. An initial redundant app-server refresh
raced its startup refresh on Windows; the failed receipt remains separate. The
successful check uses the catalog already installed by the CLI.

Explicit upgrades from the public RC runtime and the verified official 0.10.0
archive passed for both harnesses. Check-only and conflicting launcher updates
changed no files; resolved upgrades preserved saved source/GLB/preview bytes,
revision parents and owner files. Compatible edits to unchanged guides survived.
The upgraded MCP rendered retained source, saved child revisions and exported the
exact edited source through the CLI. Receipts:
`.cache/v1-stable-rc1-upgrade.json` and `.cache/v1-stable-v010-upgrade.json`.
The first RC test incorrectly expected an unchanged customized guide to conflict;
it actually upgraded successfully. Its failed assertion is retained in
`.cache/v1-stable-workspace-upgrade.json`. The corrected probe tests a changed
launcher conflict and preservation of an unchanged customized guide. No engine
change or weaker upgrade rule was needed.

After the owner's twelve-job/$1 approval, native source `d068a7c` passed all
fixed Cloudflare cases: CPU preview, six software material views, native network
denial, marker/child destruction and fresh-VM absence, native deadline,
cancellation, stdout/stderr floods, actual memory exhaustion, actual durable alarm
recovery and engine execution afterward. Downloaded Worker and image identities
matched the approved candidate. Every VM was confirmed stopped by the controller
and independently by the provider API. Replaying the RPC started no new jobs.
All seven returned PNGs decoded independently and matched local references byte
for byte; visual inspection confirmed the fixed geometry/material/backdrop views.

The operator, application, Worker, both namespaces and registry tag were removed,
with absence verified. All 22 jobs across the four approved scopes are consumed.
The 101,532 ms total reported job time is not billed CPU, a load benchmark or a
settled invoice. The diagnostic branch's `hosting/probe/RESILIENCE.md` and
`.cache/resilience-trial/` retain the exact twelve-case and cleanup receipts.
Authenticated native dispatch, production render integration, account lifecycle,
private artifacts, global admission, live providers, production deployment and
vendor submissions still remain. Broad README/Troy/site work stays deferred.

### Stable publicly published

The owner approved the protected environment and
[staging run 37525019084](https://github.com/instruktlabs/kiln/actions/runs/37525019084)
completed successfully. npm reports stage
`6b1a5f9f-36f7-465d-ba81-9c47e5d83e66` as `staged`, version `1.0.0`, intended
tag `latest`, published by trusted automation. Downloading that exact stage
reproduced SHA-256
`6ed3d6b9964429f14c3c6a0a6a13d56be509dd0f40b07061a37d491f901c1508`.
Sigstore verification passed for the main-branch release workflow identity,
GitHub Actions issuer, exact commit `fda71ac775750f25390b6ee30082ebc56463edc6`,
staging run and archive digest against
[Rekor entry 3116120928](https://search.sigstore.dev/?logIndex=3116120928).
The local receipt is retained in the stable worktree at
`.cache/stable-main-qualification/provenance-receipt.json`.

The owner's environment approval authorized private staging only. The owner then
separately approved public promotion of this exact stable candidate and completed
npm security-key authentication. The CLI confirmed successful publication.
Public registry metadata now reads `latest = 1.0.0`, with `next = 1.0.0-rc.1`.
The independently downloaded public archive matches the digest above, and its
public Sigstore provenance verifies against the same workflow, commit, run and
archive. The npm website also displays `1.0.0`, Public. No production hosted
deployment has occurred.

[PR #152](https://github.com/instruktlabs/kiln/pull/152) updates the public candidate
record to stable so the seven-job registry installation matrix can qualify the
published version. [Run 37528755713](https://github.com/instruktlabs/kiln/actions/runs/37528755713)
was dispatched at `6248b4c`. The fresh local Windows installation passed all 25
checks, including SDK declarations, CLI, MCP and packaged plugin checks; its
receipt validator accepted the exact public archive on Node 22.23.3/npm 12.2.0.
Receipts and the npm screenshot are retained under the stable worktree's
`.cache/stable-main-qualification/public-registry/`.

Independent hosted resilience work continues: native cancellation,
deadline/output/memory bounds, actual durable-alarm recovery and stable-image
rendering are being prepared for local verification and a separately approved
Cloudflare trial. No new cloud trial allowance has been requested or consumed.

### Stable exact-main qualification

Main `fda71ac775750f25390b6ee30082ebc56463edc6` passed every job in
[CI run 37523234644](https://github.com/instruktlabs/kiln/actions/runs/37523234644),
including both engine platforms, the installed package matrix and six software
Vulkan images. The downloaded archive SHA-256 is
`6ed3d6b9964429f14c3c6a0a6a13d56be509dd0f40b07061a37d491f901c1508`.
[Release verification 37524905058](https://github.com/instruktlabs/kiln/actions/runs/37524905058)
validated repository/commit identity, all CI jobs, the archive and all eight
qualification artifacts. Its downloaded archive independently matches that digest.

The protected `npm-release` environment still requires the owner as sole reviewer,
forbids administrator bypass and allows only protected branches. The same main
commit and digest were dispatched for staging in
[run 37525019084](https://github.com/instruktlabs/kiln/actions/runs/37525019084).
Its verification passed and the staging job is waiting for the owner's browser
review. No new package version has been uploaded or promoted at this point.
Public metadata still reads `next = 1.0.0-rc.1` and `latest = 0.0.0-stage`.
The concrete handoff was opened in Chrome with `npm-release` selected. Final
promotion remains a separate owner decision and npm security-key step.

The native startup branch separately adds stopped-state confirmation to the
production controller at `d3e6ac7`. It withholds output and retains durable
recovery when destruction cannot be confirmed. Focused regression tests first
failed, then all 136 hosted tests, hosted/root types, lint and production bundle
checks passed. Exact-source CI and further live failure-path qualification remain
pending at that point; the completed four-job allowance does not authorize another cloud run.

Subsequently, `d3e6ac7` passed both Linux and Windows hosted checks in
[run 37525915541](https://github.com/instruktlabs/kiln/actions/runs/37525915541).
The separate software-image candidate at `b34d56f` passed both CPU and software
image CI jobs in [run 37526078285](https://github.com/instruktlabs/kiln/actions/runs/37526078285).
Those image CI jobs use the public RC. Independently, the exact stable archive
was installed in local image
`sha256:84a0fa62bcffa010b9ac1c5f2f0e2cf9045a9cdb6407f621e8049e6a37f9de99`:
the real entry produced the expected GLB twice, the CPU preview passed, and the
packaged software Vulkan renderer produced all six textured views. Its retained
npm lock has zero known audit findings. The local containers were removed.
These results do not qualify that new image on Cloudflare or authorize its upload.

- Created `codex/v1-publication` from the current main checkout without altering
  the four existing untracked planning/setup documents.
- Confirmed Bun 1.4.2 is installed. Default shell Node/npm differ from maintainer
  pins; use the installed Node 22.23.3 environment for release gates.
- First implementation target is the SDK build and installed-consumer contract.
  Current exports point at TypeScript and the package root is the CLI, so a plain
  Node consumer cannot use the promised library without a source loader.

### Compiled SDK foundation

The development package now emits ESM and declarations for all 55 public entrypoints.
The root is a library entry, and compiled modules resolve explicit Node paths.
Worker and viewer resource lookup support the compiled layout. Core tool types no
longer pull optional Strands declarations into ordinary host consumers. The
[SDK reference](../sdk.md) records the intended contract and its limits.

Verified locally with Bun 1.4.2, Node 22.23.3 and npm 12.2.0:

- Unit suite: 3,191 passed, two platform skips, no failures (404 files).
- Toolchain, skill alignment, typechecking and lint passed.
- Render service: 78 tests passed, no failures.
- Fresh npm tarball installation: 20 checks passed, including all 52 core SDK
  imports and TypeScript declarations without optional agent peers; real SDK
  subprocess rendering; CLI/MCP source edits, persistence and exact exports;
  native/WASM helpers, CPU PNG and textured community export.
- All 55 SDK imports also passed with optional peers installed in the development
  checkout. This does not replace clean optional-workflow qualification.
- Coverage initially counted both `src/` and its generated `lib/` copy. Excluding
  the generated copy restores the existing source measurement without lowering
  thresholds: functions 95.20% (minimum 94.00%), lines 92.52% (minimum 92.10%).
  The corrected full coverage run had one Windows `EPERM` during an atomic asset
  directory rename in `packaged-save-provenance.test.ts`; its focused rerun passed
  all nine tests. Record this as a full-run failure followed by a passing focused
  rerun, not an entirely green coverage run. CI remains required.

Local development tarball SHA-256:
`48b633bd9ca6ad3399548d711ec8a06aee6f992e98c3606711a48c3eddbbc23d`.
Receipt: `.cache/v1-package-smoke-types.log`. This archive still uses the previous
private `@kiln/engine@0.10.0` identity; it is not a release candidate or npm
publication. The package identity change is a separate tracked step.

CI now checks installed consumer declarations against the exact tarball distributed
to its Windows, Linux and macOS jobs. Full cross-platform qualification remains open.
The foundation was committed as `ea56ccdf10052a869b64280f64de1267a0261da8`
and pushed to the approved branch. [Draft PR #145](https://github.com/instruktlabs/kiln/pull/145)
started [CI run 37425306532](https://github.com/instruktlabs/kiln/actions/runs/37425306532).
That run completed with the portable package build, Linux consumer matrix, Windows
package installation, render-service tests and software Vulkan checks passing.
The separate website workflow also passed. Two defects prevented an all-green run:

- macOS ARM64/x64 package assertions compared the `/var` temporary-directory alias
  with Node's canonical `/private/var` module URL. The smoke check now canonicalizes
  its temporary root; the Windows package rerun passes with that correction.
- Both engine-check jobs rejected the enlarged agent guide: 12,441 bytes exceeded
  the 12,288-byte repository budget. Condensing its wording preserves the instructions
  at 12,235 bytes; the focused repository-contract tests pass.

Both fixes passed in the next commit's CI run, recorded below. Passing adjacent jobs
in the original failed run did not qualify them.
At that foundation commit, the isolated evaluator still located source TypeScript
workers. The correction and its separate qualification are recorded below.

### Public package identity and installed commands

The next slice adopts `@instruktlabs/kiln` with the explicitly unpublished version
`1.0.0-dev.0`. Package, engine and plugin versions stay aligned. Public repository,
support and publish metadata point at Instrukt Labs; maintained SDK examples and
runtime identity checks use the new scope. Historical planning/release records keep
their original names and versions.

The archive's documentation now uses a 21-file consumer allowlist instead of the
whole research/planning tree. The new `kiln-mcp` executable points to the existing
thin Node MCP entry. Package smoke checks exercise that command through npm, and
inspect the installed documentation even when CI supplies a prepacked archive.
Receipt verification now requires the chosen package name and SDK/documentation/
MCP-command checks. Negative fixtures first demonstrated the old verifier accepting
missing evidence; the updated focused suite passes.

The Windows dependency-notice inventory was refreshed against installed manifests
and native-library metadata. This does not qualify the native binary inventory on
other platforms. Thirty links from consumer documents to excluded repository files
now point to GitHub source pages. The installed-document check first rejected the
previous archive for a broken link, then passed after rebuilding it.

Pinned local results for this slice:

- Toolchain, skill alignment, typechecking and lint pass.
- Fresh npm installation: all 22 checks pass, including 52 core SDK imports and
  declarations, subprocess rendering, installed document links, all three npm
  executables, source edits and persistence. Receipt verification accepts its
  package name/version, runtime and archive digest.
- Archive inventory: 922 files, 21 consumer documents, no planning/review/evaluation
  records or test files. Receipt: `.cache/v1-namespace-package-final.log`.
- Final development archive SHA-256:
  `ff8a1863ab54e6875092a4a5dc9319b429b4496beb90dd5140cb1cbcb93818fd`.
- Full offline coverage run: 3,195 pass, two platform skips, one failure in 404 files.
  The same Windows `EPERM` at the immutable asset-revision directory rename
  recurred in `packaged-save-provenance.test.ts`. This is now a reproducible release
  concern, not closed by the prior focused rerun. A bounded atomic-save correction
  and another full gate are required.
- The separately checked LCOV thresholds still pass at 95.20% functions and 92.52%
  lines. This does not make the failed full run green.

Committed as `c7c578ee5bde6928ee78a1a70eeff23782ace458` and pushed to the approved
branch. [CI run 37427644449](https://github.com/instruktlabs/kiln/actions/runs/37427644449)
completed successfully, including Linux/Windows engine checks, every package
platform job, both macOS architectures and software Vulkan. Downloaded platform and producer receipts all match
the same CI tarball SHA-256:
`68795af7d2641dd2723d99a3d937ef45dcbe24c299344f990644879dcc561047`.
The producer reports 22 checks including consumer types; each downstream platform
reports 21 checks because it does not install the TypeScript qualification toolchain.
These receipts qualify this commit, not the following runtime corrections.

### Atomic saves and compiled isolated workers

Focused regressions first demonstrated both defects: transient Windows rename
denials aborted saves, and the SDK build omitted workers reached only through URLs.
The save path now retries Windows `EPERM`/`EACCES`/`EBUSY` only when the destination
is absent, with a total delay budget of 770 ms. Existing destinations and other
errors return to the existing immutable-import handling. The operation remains an
atomic rename; it never deletes or copies over a destination. All 24 focused atomic,
asset-library and packaged-save tests pass.

The SDK build now includes the evaluator, readiness and transport worker entryfiles.
Source, installed SDK and executable-bundle paths resolve their corresponding
workers; installed JavaScript uses Node directly without `tsx`. Existing namespace,
environment, filesystem/network and resource-limit controls remain mandatory.
Package tests execute a trusted fixture through the actual installed compiled
worker; this does not run or qualify the OS isolation boundary.

Typecheck/lint and all 23 fresh-install checks pass, including consumer types and
the compiled worker. Receipt: `.cache/v1-runtime-fixes-package.log`.
Development tarball SHA-256:
`f0511c21b1e1857a9a22a039a78b0da88253880e8043eab3cdaa5f0ecfbad0ec`.
The corrected full offline coverage run passes: 3,210 tests, two platform skips,
zero failures in 406 files; functions 95.20% and lines 92.52%, above the unchanged
94.00%/92.10% thresholds. The previously failing packaged-save case passes in the
full run. Receipt: `.cache/v1-runtime-fixes-coverage.log`.
Committed and pushed as `ee7ecc9daa2d58bb7cb11a546b2d62225c7fdb04`.
[CI run 37428983292](https://github.com/instruktlabs/kiln/actions/runs/37428983292)
completed successfully for that exact head, including all twelve engine, package
and render-service jobs. This qualifies the development commit; no RC or final
registry release has been produced.
Downloaded all seven package receipts and the software-renderer artifact. Every
package receipt and the renderer checksum identify the same CI archive SHA-256:
`1c85bca5f66d419fab3c77612d5aada070a8b311eb6dee1e17fecc578c642976`.
The producer reports 23 checks (including consumer types); downstream platforms
report 22. Retained locally in `.cache/v1-ci-ee7ecc9/`.

### Exact-archive release workflow

Added `.github/workflows/release.yml`, a manual workflow with a read-only default.
Its preparation script requires a successful main push at the dispatch commit,
the original repository ID, all twelve required jobs, eight retained artifact sets,
one reviewed archive digest, platform/SDK/type receipts and hashed software-renderer
views. Development versions and PR qualification runs are rejected. The optional
stage job uses the protected `npm-release` environment, repeats verification after
approval, and stages the unchanged archive through OIDC. It never promotes a stage.

Focused tests first failed on the missing workflow, then passed with it; the
metadata and artifact regressions include missing/expired/foreign receipts,
unprotected environments and changed bytes. All 31 focused tests, typecheck and
lint pass. The full offline unit suite passes: 3,241 tests, two platform skips,
zero failures in 407 files; receipt `.cache/v1-release-workflow-tests.log`.
This changes release tooling and documentation, not engine behavior; the prior
runtime coverage receipt remains separate. CI against this slice is still required.
The [maintainer runbook](../releasing.md) records first-package bootstrap, its
public-placeholder side effect, trust setup, exact stage-ID review, human 2FA
promotion and post-publication verification. No environment configuration, npm
stage, placeholder or release has been created by this workflow preparation.
Committed and pushed as `3e83a9cf9f54a3e94314a11fb9e05851683d9eb2`.
[CI run 37431427439](https://github.com/instruktlabs/kiln/actions/runs/37431427439)
is checking this exact release-tooling commit. The separate Website workflow on
the preceding runtime commit failed a stale migration-heading link; its engine
CI passed. The link correction is part of the following slice, not retroactive
website acceptance.

### Discovery stability at the model boundary

Added failing tests for experimental operations/recipes, stable helpers and a
deprecated catalog fixture, including the text adapter used by both agent skins.
Search and overview now show the existing stability value before each summary's
execution mode and limitations. This adds no opt-in requirement, changes no
tool input schema, and does not relabel helpers used by experimental recipes.
All 91 focused Discovery/context tests and 52 release-receipt tests pass.

Rebuilt the compiled SDK and runtime bundles. The clean installed archive passes
24 checks, including actual CLI and stdio MCP calls for stable helpers, implicit
modeling and an experimental recipe. Its receipt is
`.cache/v1-discovery-labels-package.log`; SHA-256:
`77ddc78367a4a35a55236786b5542f9c5f313b3189ea59f91be1f0429f89506f`.
The first smoke attempt had a new test-harness assertion treating its string result
as an object; correcting that assertion produced the passing fresh-install run.
Release receipt verification now requires `discovery-stability-labels` explicitly.
Typecheck/lint pass. Full offline coverage passes: 3,245 tests, two platform skips,
zero failures in 407 files; functions 95.20% and lines 92.52%, above unchanged
thresholds. Receipt: `.cache/v1-discovery-labels-coverage.log`. This slice still
needs its own exact-head CI before qualification.

Corrected `docs/runtime.md` to link to the current 1.0 migration heading. Rendering
the target document through the installed Astro Markdown processor confirms that
the fragment exists. The complete Website CI still needs to verify the next head.

### Local plugin packaging preflight

Current official OpenAI documentation recommends a portable root `plugin.json`
and `mcp.json`; `.codex-plugin/plugin.json` remains a supported fallback. Public
submission still needs its direct remote MCP endpoint, separate from local plugin
distribution. Source: [OpenAI packaging](https://developers.openai.com/plugins/build/plugins).

Claude's strict marketplace validation passes, but explicitly validating the current
root plugin fails strict mode because root `CLAUDE.md` is not loaded as plugin
context. This is another reason to ship the planned small plugin directory instead
of the engine checkout. Claude's loading rules also distinguish local-path plugins
(loaded in place, without dependency installation) from copied marketplace plugins
(cached with eligible dependency installation). Qualification must test the copied
installation, and durable workspace/runtime state must not live in a removable
plugin-version directory. Sources: [Claude publishing](https://code.claude.com/docs/en/plugins/publish),
[loading rules](https://code.claude.com/docs/en/plugins/loading).
No local plugin installation or directory candidate is qualified by these checks.

### Verified Discovery candidate

Commit `4ea07c62ef13f518f1ff15b32d0c7d7d33bf451a` completed all twelve jobs in
[CI run 37432619561](https://github.com/instruktlabs/kiln/actions/runs/37432619561)
successfully, including Windows and Linux engine tests, both macOS architectures,
the consumer Node matrix and installed Linux software Vulkan. The separate
[Website run 37432619572](https://github.com/instruktlabs/kiln/actions/runs/37432619572)
also passed. This qualifies the development candidate's checks, not a published
1.0.0 or the subsequent plugin bootstrap changes.

### Local plugin workspace bootstrap

Added `scripts/setup-plugin-workspace.mjs` as a standalone helper for the planned
small local plugin. It pins `@instruktlabs/kiln` to an exact version, installs with
optional dependencies and lifecycle scripts disabled, and keeps the installation
in a persistent version directory outside the plugin cache and asset workspace.
The existing engine generator remains the owner of `kiln_workspace` configuration,
skill selection and conflict-preserving check/upgrade/repair. The planned plugin
does not also start a global authoring MCP server.

The helper verifies package identity and its dependency lock before reuse,
refuses unknown existing runtime directories, checks canonical path separation,
and serializes setup through an exclusive lock. An explicit qualification archive
is bound to its SHA-256; different bytes with the same version require a separate
data directory. No cleanup replaces an existing runtime or user workspace.

The initial fifteen focused tests failed against the stub, then passed after
implementation. Additional checks found and fixed a CLI exit-status mismatch:
workspace checks report `status`, rather than a `current` boolean. A redirected
`runtimes` directory also exposed a pre-install path-validation gap; the helper now
rejects it before npm runs. All 23 focused tests pass, covering drift, interrupted
setup, path aliases, dependency-lock changes, conflicting setup, argument validation
and immutable candidate reuse.

A separate local probe installed the actual development archive with SHA-256
`77ddc78367a4a35a55236786b5542f9c5f313b3189ea59f91be1f0429f89506f` under
Node 22.23.3 on Windows. All ten checks passed: both harness workspace layouts,
one configured workspace MCP server, check/upgrade, CPU GLB rendering and working
CLI discovery after the plugin directory was relocated. Receipt:
`.cache/v1-local-plugin-setup-receipt.json`. This tests the copied helper against
the installed engine; it does not yet prove an actual Claude or Codex marketplace
cache installation, a live harness connection, or a published plugin.

Typecheck and lint pass. The full offline unit run passed 3,267 tests with two
platform skips and no failures across 408 files
(`.cache/v1-plugin-bootstrap-tests.log`). That run started before the final
redirected-store guard was added; the final helper's separate 23-test run and
repeated ten-check installed-archive probe pass. Exact-head CI is still required
for this implementation slice. Engine source and its coverage thresholds did not
change.

### Small local plugin bundle and owned catalogs

Added `plugins/kiln-engine`, generated from the engine version, the standalone
bootstrap and the maintained setup skill with its new plugin reference. It has a
portable root manifest, a Claude manifest and a hash inventory. Both owned catalogs
use `instruktlabs` and select this subdirectory. No engine implementation, examples,
dependencies or assets are present in the cached bundle. The plugin registers only
setup; the workspace supplies author/refine/QA skills and its one authoring MCP
server. This implements the plan's pinned local launcher through managed workspace
configuration instead of also declaring a global server.

Updated the maintained skill and its two registered copies. The new reference
explains persistent runtime locations, exact archive qualification, existing
workspace reuse and conflict-preserving upgrades. The install/migration guides
document the `kiln@kiln` transition and clearly mark the v1 release commands as
unavailable until the release tag and npm package exist. The hosted public OpenAI
candidate remains separate and will require its own remote MCP connection.

The initial package-generator tests failed against the stub, and package/receipt
tests first rejected the absent bundle and missing required receipt check. The
implemented generator refuses existing output, detects byte drift and extra
components in check mode, and has eight passing contract tests. It is checked by
the normal unit suite. The npm archive now includes both catalogs and their complete
target bundle; platform smoke receipts require `local-plugin-bundle` and verify
each inventoried file against its digest.

Validation for this slice: typecheck/lint and skill alignment pass; the full offline
suite passed 3,277 tests, two platform skips, no failures across 409 files
(`.cache/v1-local-plugin-bundle-tests.log`). The real installed Windows archive
passes 25 checks, including the plugin bundle, SDK declarations and CLI/MCP flows.
Its SHA-256 is `48f1f91887e80769897f4d4324401a4c496f95e6adfeb0ce3d7ff7eacc0fa1ff`;
receipt: `.cache/v1-local-plugin-bundle-package.log`. Documentation edits after
that archive still need the next exact-head CI archive.

Claude's strict plugin and marketplace manifest validation reports no warnings or
errors. Codex CLI 0.160.0 installed and enabled the portable plugin from the local
catalog into an isolated profile's real versioned cache. Receipt:
`.cache/v1-codex-local-plugin-install.json`. That isolated temporary profile emitted
a helper-PATH warning; plugin installation succeeded, but this alone is not a live
authoring-session qualification. The next probe uses a non-temporary isolated
profile and the Git-backed marketplace, with no normal-profile mutation or model
calls. Claude's local-path mode is loaded in place, so its copied cache must be
qualified with a Git-backed source.

Current primary references: [OpenAI portable packaging and marketplace sources](https://developers.openai.com/plugins/build/plugins),
[Claude plugin loading](https://code.claude.com/docs/en/plugins/loading), and
[Claude marketplace source formats](https://code.claude.com/docs/en/plugins/marketplace-reference).

### Remote plugin and persistent workspace qualification

Both installed harnesses fetched the Git-backed marketplace at commit
`775491b638d978652bdba4fc688f24a6e3b7f7ab`: Claude Code 2.1.287 and Codex CLI
0.160.0. Isolated profiles under the local application-data directory held real
versioned plugin caches. Normal user profiles were untouched. Cached file hashes
match the bundle inventory. Receipt: `.cache/v1-remote-plugin-install.json`.

Each cached helper installed the reviewed development archive with digest
`48f1f91887e80769897f4d4324401a4c496f95e6adfeb0ce3d7ff7eacc0fa1ff` into the shared
persistent engine directory and created a separate authoring workspace. Twelve
checks passed, covering native harness MCP inventory, all seventeen local tools,
Discovery, CPU render, save, reconnect to exact retained source, workspace upgrade
and CLI rendering. Receipt: `.cache/v1-cached-plugin-workflows.json`.

Claude initially reported the expected project-server approval requirement. Its
qualification command supplied approval for only the known fixture's
`kiln_workspace` server through `--settings`; it then reported Connected. This
did not approve arbitrary projects, change normal profile trust, or make the
plugin approve itself. The user-facing installation still requires normal project
and MCP trust. See [Claude's project-server approval rules](https://code.claude.com/docs/en/mcp#project-server-approvals-and-workspace-trust).

The actual Codex app-server protocol returned one `kiln_workspace` with seventeen
tools, engine version `1.0.0-dev.0` and no tool-discovery error. Skill inventory
contains one each of workspace author/refine/QA plus the cached plugin's setup
skill. No model turn was run; `runtimeStatus` is null without an active thread,
so this receipt does not claim an active conversation connection status.
Receipt: `.cache/v1-codex-plugin-appserver.json`.

Actual CLI uninstall and reinstall passed five more checks. Claude retains
uninstalled cache files until cleanup; after verifying uninstallation, the probe
removed only its own retired test cache after canonical containment checks. Codex
removed its cache itself. With each cache absent, the persistent runtime still
served exact saved GLB, source and PNG bytes, verified by SHA-256, and its CLI read
the source. Reinstall beside each existing workspace preserved launcher and MCP
configuration bytes. Codex app-server discovery was repeated after reinstall and
still returned one server and one copy of each Kiln skill. Receipt:
`.cache/v1-plugin-removal-reinstall.json`. This is not yet an RC-to-final upgrade.

The same commit passed all twelve jobs in
[CI run 37436913727](https://github.com/instruktlabs/kiln/actions/runs/37436913727),
including Intel macOS on its first attempt, and the separate
[Website run 37436913674](https://github.com/instruktlabs/kiln/actions/runs/37436913674).
Those jobs qualify their exact development archive. The local harness probe used
the earlier archive digest above, with the same plugin/runtime bytes; it is not
described as an installation of the CI archive or a final npm publication.

### Bootstrap CI shutdown retry

Bootstrap commit `41738812bc9f2b86119caec17f843473a1047c24` completed
[CI run 37434989839](https://github.com/instruktlabs/kiln/actions/runs/37434989839)
with eleven jobs passing initially. Intel macOS passed its installed package work
through the npm MCP entry, then exceeded the five-second stdin-close check. The
unchanged job rerun passed, making the run successful. This is an intermittent
shutdown failure followed by a passing retry, not a diagnosed engine fix. The next
smoke script retains the same bound and adds the exact launch command and captured
stderr to any repeat failure. The final release still needs its own platform proof.

### Release authorization timing

Rechecked npm's current docs on 6 October. First-time staging creates a public
`0.0.0-stage` placeholder, so it still waits for the reviewed candidate and the
appropriate authorization. Configure trust close to the first workflow publish:
unvalidated configurations now expire after 48 hours. Routine CI should have
stage-only publishing access, with owner 2FA for promotion; use a permitted event
such as `workflow_dispatch`, not `issue_comment` or `pull_request_target`.
Sources: [staged publishing](https://docs.npmjs.com/staged-publishing/),
[trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[October 2 trust-expiry update](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire/).

### Hosting probe preparation

The new `cf` CLI (1.0.0-beta.12) runs under the pinned Node toolchain. Its read-only
account probe found an invalid inherited API token; ignoring that token only in the
probe process confirmed that a separate CLI login is needed. No token was printed
or changed. Browser login does not itself establish CLI access.
The Docker CLI is installed, but daemon/status checks timed out after starting
Docker Desktop. No local container execution has been qualified. Neither
local Docker nor package tests substitute for the required actual Cloudflare
isolation and rendering probe.
The later bounded daemon recheck also timed out; a fresh `cf auth whoami` still
reports not logged in. The owner has been asked to finish any Docker Desktop
startup/setup screen. No provider deployment has been attempted.

### Repeatable native execution probe

Added `scripts/hosting/` with a fixed one-shot runner and a non-root Dockerfile.
It runs all ten existing engine isolation invariants before evaluating any source,
then checks repeated isolated GLB output, a nonblank CPU preview, deadlines,
cancellation, output limits, recovery and the existing textured software-Vulkan
fixture. It cannot accept caller source, has no HTTP endpoint or fallback
evaluator, and performs no provider deployment. The renderer fixture is trusted;
its output is separate from the source-isolation evidence.

All eight focused tests first failed against the stub and pass after implementation.
Typecheck and lint pass. A real invocation against the installed development
archive on Windows failed at the host gate with `UNSUPPORTED_HOST`, no evaluation
and no render artifact, as required. Its receipt is
`.cache/native-windows-negative/receipt.json`. This is negative-path qualification,
not a passing Linux probe. The full offline suite passed 3,285 tests with two
platform skips and no failures across 410 files in 364.88 seconds
(`.cache/v1-native-qualification-tests.log`). No engine runtime source changed.
Two stale consumer-guide statements about TypeScript source exports were also
corrected to match the compiled SDK.

The minimal six-file context in `.cache/native-probe-context/` uses the downloaded
archive from CI run 37436913727. Its SHA-256
`141a907f792beded74c7e6965b072cdfe6669c86b95d67c77b56a70c8e1f89a2` matches the
run's installed SDK receipt. The Node 22.23.3 bookworm image index digest was read
from Docker's registry and pinned in the Dockerfile; the final image, OS package
inventory and resolved npm dependencies are still unqualified. The local Docker
daemon again timed out after fifteen seconds, and `cf auth whoami` remains
unauthenticated. No image was built, pushed or deployed.

The runner records first/repeated call timings, parent-only process usage and
available cgroup counters with explicit scope. These are not provider cold-start,
per-job RSS, billed CPU or user-capacity claims. Its `provider` remains `unverified`;
actual hosting proof must include a separate deployment and immutable image receipt.
Cloudflare's [current Container API](https://developers.cloudflare.com/containers/api/durable-object-container/)
is the preferred route for the eventual provider adapter; it does not prove nested
namespace support. An unsupported boundary must remain a failed launch gate.

Probe-preparation commit `16916d05b146d10699bb6c43b698233f981808c5` passed all
twelve jobs in [CI run 37440387609](https://github.com/instruktlabs/kiln/actions/runs/37440387609)
and [Website run 37440387590](https://github.com/instruktlabs/kiln/actions/runs/37440387590).
The CI does not build or run this qualification image; passing those jobs does not
close the provider execution gate.

### SDK surface and optional-peer audit

Reviewed the 55 export targets and their maintained consumer references. The SDK
guide now classifies the root and 54 subpaths: all public entrypoints except
`implicit` receive the stable v1 contract. The experimental exception follows
`implicitSurface` through its `primitives` re-export; the existing experimental
recipes and explicitly selected community exporter remain separately labeled.
The deprecated `setApprovedTextureResolver` alias stays available, with its trusted
host replacement documented. No existing public entry was removed or relabeled
experimental to avoid supporting it. Final release freeze and upgrades still need
their target-version evidence.

The audit found a check omission: `/arena` is dependency-free ranking math, not an
optional model adapter. Core smoke/type/release checks previously skipped it
alongside `agent` and `composer/agent`. They now require 53 core entrypoints and
exercise installed ranking behavior. Focused tests first demonstrated the omitted
arena declaration and incomplete release count; all 33 type/release tests pass.
The declaration checker also has an explicit `--with-agent-peers` mode for all 55
entrypoints. The full offline run passed 3,287 tests, two platform skips and no
failures across 411 files in 376.21 seconds. Typecheck/lint and the final focused
tests pass; a lint-only fixture-cleanup guard placement was corrected separately.

A fresh Windows development archive passed 25 package checks with 53 SDK imports
and consumer declarations. SHA-256:
`78aeaea9a5188466eeb2d28d1b3986ea1ea7388754ba7ef31b76c73b6a7dce7f`.
Receipt: `.cache/v1-sdk-surface-package.json`. Later guide edits need the next
exact-head CI archive; runtime bytes did not change.

Two separate clean installations of that archive qualified the optional surface:

| Install | Strands SDK | OpenRouter provider | AI SDK provider | Result |
| --- | --- | --- | --- | --- |
| Current maintainer family | 1.19.0 | 2.10.0 | 3.0.18 | Seven checks pass |
| Declared peer floors | 1.18.0 | 2.10.0 | 3.0.0 | Seven checks pass |

Each installation imports all 55 entrypoints, typechecks all declarations, builds
an OpenRouter adapter without making a request, compares native tool names to the
shared registry, invokes Discovery/render/finish against a fixed fixture, and
invokes the composer catalog adapter. The retained GLB and canonical source
reference are checked; no model runs or provider requests were made. An initial
probe assertion incorrectly equated a public short reference with its canonical
SHA reference. Correcting the assertion to verify their documented relationship
passed without changing engine behavior. The failed assertion receipt is retained.

Receipts: `.cache/v1-optional-sdk-receipt.json` and
`.cache/v1-optional-sdk-floor-receipt.json`; the probe is
`.cache/optional-sdk-probe.mjs`. They record installation paths, archive/dependency
lock digests, runtime export inventories and native-tool results. These are Windows
Node 22.23.3 package/adapter checks, not live-provider, model-quality, minimum-Node
optional-agent or Cloudflare qualification. The installation guide now gives the
tested optional-peer command and distinguishes it from ordinary CLI/MCP setup.

### Linux image preflight

Added a separate, path-filtered `Native hosting preflight` workflow. It builds the
minimal six-file context from the exact PR head archive without publishing an
image or deployment. The two sequential containers run with networking disabled,
no host mounts, one CPU, 6 GiB memory, 256 PIDs, dropped capabilities and no new
privileges. Isolation failure keeps the workflow failed; the trusted software
fixture still runs independently to diagnose image dependencies. Artifacts retain
archive/image identities, the installed npm lock, OS inventory, logs, container
exit state and available probe receipts/images. Provider qualification remains
separate, and neither the package CI contract nor runtime isolation was weakened.

Local validation parsed the YAML, syntax-checked all eight shell steps with Bash,
and passed 17 existing native-probe/repository-contract tests. The first real
image build and execution were then performed in
[run 37442916260](https://github.com/instruktlabs/kiln/actions/runs/37442916260)
at `cbcaeece3db9d2884a73aeacc52fcd3fb648759a`. The image built, ran as UID 1000,
and retained both failures: isolation `wrapper-launch` before any source execution,
and no usable software adapter. The renderer log identifies missing Vulkan
`shaderUniform*ArrayDynamicIndexing` support with Mesa 22.3.6 from Bookworm.
The separate trusted fixture did build its GLB; this is not isolated evaluation.

The first image ID is
`sha256:5e248d4b7ebcf2d88a2e37495bc884c818d747e5468ee87546699da121edb120`;
archive SHA-256 is
`27aa75d582150473a8ffe10a0b89b20934cbffbb43587463184a1cc171038dc2`.
Downloaded receipts are in `.cache/native-hosting-run-37442916260/`.
The next image uses the registry-verified Node 22.23.3 Trixie digest, whose
[Debian Mesa package](https://packages.debian.org/trixie/mesa-vulkan-drivers)
is 25.0.7. A separate bounded namespace diagnostic records fixed command errors
without changing the engine's failure policy or Docker restrictions. Both changes
require a new image run. Cloudflare CLI was rechecked and is still unauthenticated.

The Trixie run at `89b3e26bf6e7cea5b0e9042eaef2357697135c83`
([37443271908](https://github.com/instruktlabs/kiln/actions/runs/37443271908))
passed the independent software fixture with Mesa 25.0.7/LLVM 19.1.7, six textured
128-pixel views and all material-color checks. The neutral view was also inspected.
Its image ID is
`sha256:ff9bbaa930cf651d0e4e8e8a19cb9b3bf9ff0f8b9818801a948645e74d5a0f62`;
the archive digest is unchanged from the first image, isolating the OS update.
The first two-view renderer call took 2,296.4 ms; subsequent dark/light calls took
691.1/102.7 ms. Those are fixture-level timings on a one-CPU Docker limit, not
Cloudflare cold-start, capacity, cost, or an optimized performance guarantee.

Isolation still failed before source execution. The fixed diagnostic returned
`Operation not permitted` for direct user-namespace creation. Bubblewrap 0.12.0
also rejected `--disable-userns` without explicit `--unshare-user`.
[Upstream's manual](https://github.com/containers/bubblewrap/blob/v0.12.0/bwrap.xml)
confirms `--unshare-all` implies only `--unshare-user-try`. The engine launch now
explicitly requires the user namespace; no restriction or readiness invariant is
removed. This corrects argument construction but does not establish that this
Docker host or Cloudflare allows the namespace. The diagnostic also exposed a
measurement omission: `core_sched.force_idle_usec` contains a dot, causing the
probe to discard the entire `cpu.stat` snapshot. Bounded snapshot capture now
retains that kernel format.

The launch regression and two cgroup tests first failed; all 18 focused tests now
pass. Typecheck passes, and lint passes after a test-string formatting correction.
Runtime bundles were rebuilt. The full offline suite passed 3,289 tests with two
platform skips and no failures across 411 files in 367.79 seconds. A fresh Windows
package passed all 25 installation checks, including the 53 core SDK imports and
consumer declarations. Archive SHA-256:
`a8c382e28b4d164c64628813bc4986f1ac72c9d0e6ac9b1dcd2bd3eea433a797`.
Receipts: `.cache/v1-hosting-runtime-tests.log` and
`.cache/v1-hosting-runtime-package.json`. The corrected Linux image needs its
new-head CI run; these local results do not establish host namespace availability.

The corrected image ran in
[37444497913](https://github.com/instruktlabs/kiln/actions/runs/37444497913)
at `56c3bef44ee5c50ad040ad9a780149c422c8c2b8`. Software rendering again passed
all six views; both CPU-stat snapshots now include the dotted kernel counter.
Bubblewrap no longer reports the missing argument and instead reports that it has
no permission to create a namespace. Direct `unshare` also returns `Operation not
permitted`. The default Docker host remains unqualified, with no source evaluated;
no seccomp, capabilities or host policy was relaxed. This does not determine
Cloudflare's behavior. Its live probe still requires authenticated provider access.
The archive SHA-256 is
`c0e6dc0f358c49b87ea0848d0fb77c2cc01e3b23882f791311fdce1d93dc2e93`, and image ID is
`sha256:b4bb2b10a189b957f2403e234a8b716271d0a8d56dd3e1043ba9ebbe5ea14ebe`.
Receipts: `.cache/native-hosting-run-37444497913/`. The separate twelve-job
package/engine [CI run 37444496448](https://github.com/instruktlabs/kiln/actions/runs/37444496448)
passed all twelve jobs. [Website run 37444497764](https://github.com/instruktlabs/kiln/actions/runs/37444497764)
also passed. The native hosting workflow remains failed independently; these
package checks do not qualify its unsupported Docker namespace boundary.

### First release candidate and historical workspace upgrades

Prepared the unpublished `1.0.0-rc.1` identity across the npm package, engine and
legacy/local plugin manifests, rebuilt runtime bundles and regenerated the small
local plugin bundle. The maintained roadmap now targets 1.0, incorporating the
previously planned 0.11 changes. Dated release records retain their original scope.
The hosting image workflow now also runs for package/dependency, evaluator and
renderer changes, so a new candidate cannot silently retain an old image receipt.

The fresh Windows RC archive passes all 25 installed-package checks, 53 core
imports and consumer declarations. SHA-256:
`6ea9b29408b99766f0636ef27f94d9edd01526c7fb45470d811f13afa3cb755b`.
Receipt: `.cache/v1-rc1-package.json`. Fresh current-peer and declared-floor
installations each pass all seven optional-SDK checks, including all 55 runtime
imports/declarations, native render/finish, composer catalog and offline provider
construction. Receipts: `.cache/v1-rc1-optional-sdk.json` and
`.cache/v1-rc1-optional-sdk-floor.json`. No model requests were made.
The full RC suite passed 3,289 tests, two platform skips and no failures across
411 files in 378.52 seconds (`.cache/v1-rc1-tests.log`). Typecheck, lint, toolchain,
skills checks and 39 focused plugin/release tests pass. Subsequent README/runbook
updates need the RC commit's freshly packed CI archive; the local archive above is
retained qualification evidence, not the future publishing artifact.

Downloaded the actual `kiln-engine-0.10.0.tgz` from the existing GitHub release and
matched its published SHA-256:
`e1ce85d7a27106cc2706bb23d2707e3904e214cf4afda329da5dbfceabf60c9f`.
A fresh old-package installation created Claude and Codex workspaces. Both saved
an asset through the old MCP server and verified its GLB/source/preview downloads.
The qualification then added owner instructions, a launcher customization and an
unmanaged note. `--check` and the refused conflicting `--upgrade` changed no file
in a full workspace hash inventory. After retaining the edited originals and
explicitly resolving those fixture conflicts, upgrade selected the RC runtime,
kept the harness and note, and accepted the reapplied guide/launcher customizations.

Reopened RC MCP sessions retained all seventeen tools, the exact old source and
byte-identical downloads. An edited asset saved a new revision with the old
revision as parent; the old downloads remained unchanged. The upgraded customized
CLI exported the exact revised source. Eleven checks pass across the two harness
configurations. Receipt: `.cache/v1-rc1-v010-upgrade.json`; reproducible probe:
`.cache/v010-rc-upgrade-probe.mjs`. This proves the installed upgrade and MCP/CLI
flows, not yet a new remote plugin-cache install or final npm registry upgrade.
The first probe incorrectly expected `status: upgraded`; the API returns
`status: current, upgraded: true`. That assertion was corrected without an engine
change, and its initial failed receipt was retained.

### Protected npm staging environment

Created the repository-scoped GitHub `npm-release` environment through the
[documented environment API](https://docs.github.com/en/rest/deployments/environments#create-or-update-an-environment),
then independently read it back. It has one required reviewer,
`matthew-kissinger`, `can_admins_bypass: false`, self-review available to that owner,
and protected branches only. Main's protected state was read back as true.
Receipts: `.cache/npm-release-environment-created.json` and
`.cache/npm-release-environment-verified.json`. The existing `github-pages`
environment was not modified. This performs the planned repository setup;
it creates no npm package, publisher trust, token, stage, release or deployment.

### Real plugin updates to the release candidate

Updated the existing isolated Claude Code and Codex qualification profiles through
their actual marketplace and plugin commands. Both moved `kiln-engine@instruktlabs`
from `1.0.0-dev.0` to `1.0.0-rc.1` in new versioned caches. Claude's marketplace
checkout resolves to `3f4bd38d1d8a6a2a849f3f634bbc1cc8709ff25c`; both cached
bundles have the RC runtime pin and verified file inventories. Ordinary owner
profiles were not changed.

Full workspace hashes stayed unchanged after each plugin update: the workspace
continued to use its pinned development runtime. The helper's `--check` stayed
read-only. Explicit `--upgrade` then installed the reviewed local RC archive in
persistent storage outside the plugin cache and retained the unmanaged owner note.
Reopened MCP sessions reported `1.0.0-rc.1`, seventeen tools and rendered images;
old saved source, GLB and preview downloads remained byte-identical. The upgraded
CLI exported exact source. All ten checks passed in
`.cache/v1-rc1-plugin-upgrade.json`; probe:
`.cache/rc1-plugin-upgrade-probe.mjs`.

Claude's real `mcp list` reported the fixture's workspace server connected using
server-specific fixture trust. Codex's real app server reported one
`kiln_workspace`, seventeen tools and no tool-list error, and loaded each of the
three workspace authoring skills and the plugin setup skill exactly once.
Receipt: `.cache/v1-rc1-codex-appserver.json`; probe:
`.cache/rc1-codex-appserver-probe.mjs`. No model request was made. These flows use
the locally qualified archive with SHA-256
`6ea9b29408b99766f0636ef27f94d9edd01526c7fb45470d811f13afa3cb755b`;
they do not establish final registry/tag installation or a final 1.0 upgrade.

The SDK and installation guides now state explicitly that both optional Strands
SDK subpaths require Node 22.2.0+, like the built-in agent. The core package's
Node 20.15 compatibility remains unchanged. Current and floor optional-SDK peer
qualification used Node 22.23.3; it is not optional-Strands evidence for Node 20.

### Release-candidate Linux image

The RC image workflow
[37446490940](https://github.com/instruktlabs/kiln/actions/runs/37446490940)
at `3f4bd38d1d8a6a2a849f3f634bbc1cc8709ff25c` again passed all six textured
software-renderer views. Its native isolation probe failed at `wrapper-launch`
before evaluating source. Fixed diagnostics show the same namespace permission
denial for both `unshare` and Bubblewrap; container CPU counters were retained.
This is a failed hosting qualification, independently of renderer success, and
does not establish Cloudflare's namespace behavior or provider costs.

RC hosting archive SHA-256:
`0f266b65ad4e8cae1e2c7cce18cac9a508b3ce96010bca2912ed81b3cfac9197`.
Image ID:
`sha256:ae6073107808c16384729fe655f116d76a5e1720ce359a7075772e506d5c4c67`.
Receipts: `.cache/native-hosting-run-37446490940/`.
The separate [Website run 37446490916](https://github.com/instruktlabs/kiln/actions/runs/37446490916)
passed. Package/engine [CI 37446490984](https://github.com/instruktlabs/kiln/actions/runs/37446490984)
subsequently completed successfully with all twelve jobs passed, including the
Linux coverage/exporter gates, Windows suite, every installed-package platform
and the separate installed software-renderer check. These results qualify that
commit's artifacts; subsequent documentation or source edits need new release
artifacts. They do not turn the failed hosting probe into a pass.

### Hosted OAuth gateway and tenant routing

Created the private `hosting/` package without changing the engine's dependencies
or shipped file list. The production Worker combines the separate authorization
and resource-server roles from `@cloudflare/workers-oauth-provider@1.2.1`.
It uses the configured HTTPS issuer and `/mcp` audience, browser-bound consent,
S256 PKCE for both client and upstream sign-in, metadata-based and dynamically
registered clients, fifteen-minute access tokens, refresh and revocation.
Scope enforcement happens before any tenant request. GitHub identity is the
provisional adapter pending the owner's new sign-in preference question; no
identity app or secret has been provisioned.

Verified subjects select a private Durable Object using a versioned issuer/subject
hash. Different OAuth clients for the same account reconnect to the same object;
another account cannot choose it through tenant headers or MCP session ids.
Bearer tokens, cookies and untrusted identity headers are removed before forwarding.
GitHub tokens are discarded after resolving the immutable user id. Hosted MCP
schemas are not duplicated: the future native backend must consume the registry.

Fifteen workerd integration tests pass through the real OAuth library, KV and
Durable Object simulation. They cover challenges/discovery, consent escaping and
browser/origin binding, denial, missing audience/PKCE and unsupported scopes,
authorization-code/state replay, wrong verifier, cross-account routing, scope
denial, metadata clients, resource-bound refresh/revocation, request-size limits
including chunked bodies, and absence of raw credentials from stored OAuth records.
Ten initial tests were observed failing against the unavailable-handler baseline
before implementation. The simulator caught two actual integration problems:
Workers reject `redirect: error`, and the OAuth library forbids colons in subject
ids. The adapter now refuses redirects through manual response checks and uses
`github-<numeric id>`. The revocation test follows the advertised endpoint rather
than assuming a path. See `hosting/README.md` for scope and limitations.

The backend in these tests only records requests; it does not emulate successful
engine tool calls. These passes do not establish native evaluation, cross-user
asset/reference denial, production KV propagation or an authenticated live client
connection. Public OAuth admission controls and deployed storage/tenant bindings
remain mandatory. The separate tenant Worker and evaluator must not receive OAuth
or identity-provider credentials.

The Worker builds to 241,789 bytes, SHA-256
`01c02255d7fc2aca4f81c6f28d40d05de56995530a8f4ebb122b7c28a793f975`,
with only the OAuth library and four hosted modules in its input inventory.
`build` produces `.cache/hosted-worker/` without deploying. A dedicated workflow
runs hosted typechecking, workerd tests and bundle generation on Linux and Windows.
Repository and hosted typechecking and lint pass. The full offline engine run
passed 3,289 tests, two platform skips and no failures across 411 files in
366.92 seconds (`.cache/v1-hosted-gateway-engine-tests.log`). The hosted receipt
is `.cache/v1-hosted-gateway-tests.log`. The new workflow's remote result remains
pending until the committed branch is checked in CI.

Rechecked `cf auth whoami`: `authenticated: false`, `Not logged in`.
No fresh device flow was started while the existing owner-readiness question was
unanswered. The OAuth implementation needs a dedicated KV binding; current Paid
plan inclusions and overage rates were added to the economics report. A future
scoped deployment authorization must cover that resource too.

### Tenant storage foundation and integrated download boundary

Added a separate private tenant Worker with SQLite ownership/quota records and
private R2 bytes. The gateway and tenant produce separate bundles; the build rejects
test helpers in either bundle and OAuth code in the tenant bundle. No identity
secret or OAuth KV binding is present in the tenant fixture. Its default public
handler returns 404; private storage operations require its Durable Object binding.

Uploads reserve quota transactionally before R2, stream with exact length/SHA-256,
and become visible only after acknowledged storage. Saved groups atomically pin
their inventory and metadata quota; active keys are immutable and identical saves
are idempotent. Unsaved files deny reads after seven days without extending expiry.
Deletion retains files shared by other saved groups. Bounded maintenance removes
expired and failed writes and reconciles old orphan objects within one tenant only.

The deadline fault test first demonstrated a late R2 acknowledgement being accepted
as a successful upload. The fix bounds the whole operation, denies late publication,
retains quota through failed cleanup and lets durable maintenance recover. The
fault fixture uses actual workerd SQLite/R2 with a delayed acknowledgement or failed
delete; none of its controls enter a production bundle. Recovery after eviction,
checksum/length mismatch, corrupted/missing bytes, quota races, empty-file count
limits, metadata admission and failed cross-tenant pinning are also exercised.

Thirty-two hosted tests pass locally after a clean pinned-toolchain `npm ci`:
sixteen authorization/integration tests, thirteen storage tests and three recovery
fault tests. The integrated test runs both production Workers, issues OAuth grants
to two fixed upstream identities, verifies own downloads/reconnection, and denies a
second user's copied artifact id and forged tenant headers. Internal mutation routes
remain unavailable through the gateway. Hosted typecheck/build and root typecheck/
lint pass. Receipt: `.cache/v1-hosted-storage-tests.log`.

The tenant bundle is 18,529 bytes, SHA-256
`1158803f7733d58e459ad7a8d4d7cc9ded2c2c694a5e467851813dac99fe0d28`.
Its only inputs are the HTTP helpers, artifact store, tenant class and tenant entry.
The gateway bundle remains 241,789 bytes with the previously recorded hash.
Both receipts are in `.cache/hosted-worker/`.

These checks establish the local byte-storage boundary, not live provider tenancy
or engine semantics. The program store, AssetLibrary/revision/material adapters,
browser download tickets, account deletion, native execution and deployed tests
remain open. `/mcp` returns 503 until the native backend is configured and qualified.
Daily recovery alarms and SQLite costs are now included explicitly in the economics
record; production quotas and usage measurements remain unset.

CI at `693b0700f273367daf08b920e03530647c134d4b`:
[hosted checks 37450009673](https://github.com/instruktlabs/kiln/actions/runs/37450009673)
passed Linux and Windows; [Website 37450009523](https://github.com/instruktlabs/kiln/actions/runs/37450009523)
passed. [Engine/package CI 37450009480](https://github.com/instruktlabs/kiln/actions/runs/37450009480)
passed ten jobs and failed the two engine suites solely on the expanded root
AGENTS.md exceeding its existing 12 KiB limit. Hosting instructions were moved to
`hosting/AGENTS.md`; the unchanged reliability gate now passes all nine tests locally.
This corrects the earlier local full-suite receipt, which preceded that documentation
addition. A new complete CI run is required for the new commit.
[Native preflight 37450009484](https://github.com/instruktlabs/kiln/actions/runs/37450009484)
again passed software rendering but failed required namespace isolation before
source execution. Actual Cloudflare qualification remains pending authentication.

### Engine source-store adapter

`HostedProgramStore` implements the engine's existing `ProgramStore` interface using
its canonical reference, Unicode and size helpers. Exact UTF-8, including an authored
BOM, round-trips through private storage. Canonical hashes and full-digest `p_`
handles retain the existing engine syntax; unissued shortened prefixes do not resolve.
This host choice avoids permanent alias growth and expired-handle reassignment.
Ownership remains tenant-local even when two users know the same source digest.

The source adapter reuses the artifact quota, checksum and retention boundary.
Concurrent identical writes share one upload; a durable content index finds that
same artifact after eviction. Reads and repeated writes do not extend expiry.
Saved groups pin exact source artifacts; last-pin deletion removes their source.
Quota failure preserves existing work and a subsequent retry can succeed after
cleanup. Corrupt bytes are refused both on reads and idempotent writes.

Six initial source lifecycle checks were observed failing before the endpoint was
implemented; those and added shared-quota/retry coverage now pass with the adapter.
The hosted suite now passes all 39 tests after a clean
installation, along with hosted typecheck/build and root typecheck/lint. The four
nearest engine program-reference suites passed 23 tests. Workerd's stricter ambient
TextDecoder type required spelling out the existing `fatal: false` default in the
portable helper; hashing/Unicode behavior is unchanged. Node runtime bundles were
rebuilt after that source change.

The full offline engine suite then passed 3,289 tests, two platform skips and no
failures across 411 files in 369.08 seconds. Receipt:
`.cache/v1-hosted-programs-engine-tests.log`. These local results supplement the
new commit's required CI; they do not qualify live hosting or final npm publication.

A fresh Windows Node 22.23.3/npm 12.2.0 installation passed 24 package checks,
including all 53 core SDK imports, native dependency paths, CLI, stdio MCP,
source-edit images, restart persistence and exact source export. A separate check
against that same installed package passed all 53 consumer declaration entries.
No models were called. Archive SHA-256:
`1a16edd649e69eeb65008d06e22b24a5ce02b45c12fbd7fc471d0c268856e3c0`.
Receipts: `.cache/v1-hosted-programs-package.json`,
`.cache/v1-hosted-programs-types.json`, `.cache/v1-hosted-programs-full.log`.

The tenant bundle is 25,318 bytes, SHA-256
`08a84289e44260780c138ebe629a6e84f38a9dee7d74b67bf5072865b80fa90c`.
Its new inputs are the portable engine program-store module and hosted adapter.
No native engine, provider credential or fixture code enters that Worker.
The shared portable-module dependency is now included in hosted CI path triggers.
The `/internal/programs` endpoints remain private; native MCP dispatch still needs
to inject the adapter and qualify actual source/edit/render/save/reconnect behavior.
AssetLibrary, material/revision semantics and browser download tickets remain open.

For the preceding `1251f360442186b437cbf9fa86275dd9cfdfa87f` commit,
[engine/package CI 37453219496](https://github.com/instruktlabs/kiln/actions/runs/37453219496)
passed all twelve jobs. [Hosted checks 37453219494](https://github.com/instruktlabs/kiln/actions/runs/37453219494)
passed Linux and Windows; [Website 37453219517](https://github.com/instruktlabs/kiln/actions/runs/37453219517)
passed. [Native preflight 37453219527](https://github.com/instruktlabs/kiln/actions/runs/37453219527)
again passed the trusted software-renderer fixture and failed required namespace
isolation before source execution. These are separate outcomes, not hosting acceptance.

### Native source client and engine integration

`NativeProgramStore` connects the real engine's source-reference tools to the
tenant storage API. It uses one fixed internal hostname and carries no tenant
selector, OAuth token or cloud credential. The future Cloudflare container
controller must bind that hostname to the authenticated tenant outside the image;
that interceptor and native MCP entrypoint remain unimplemented. The adapter alone
does not create or qualify a hosted evaluator.

Six new checks were first observed failing because the adapter did not exist.
They now pass, including an actual `createKilnToolHost` fixture calling
`kiln_validate`, `kiln_source`, `kiln_edit` and `kiln_render`. The edit produces a
PNG and an immutable new source reference. A fresh host after Durable Object
eviction retrieves both exact revisions and renders again; a separate tenant is
denied the same reference. This is fixed trusted local execution, not a native
process restart, production isolation or live Cloudflare evidence.

The client verifies exact source bytes, Unicode and hashes, validates acknowledgements
and stats, bounds streamed replies, disables redirects and credentials, and limits
the entire HTTP operation. Fault checks cover stalled headers/bodies, invalid
lengths, corruption, quota errors, cancellation and redacted diagnostics. A test
exposed a cancellation race where closing the reader could resolve an empty body
before the abort rejection; the abort now wins that race.

After a clean private-package installation, all 45 hosted tests passed (6.23
seconds), as did both hosted typechecks, the three hosted builds, root typecheck,
root lint and whitespace checks. Receipt: `.cache/v1-native-programs-tests.log`.
The Node adapter is separately built and absent from both Worker entrypoints.
Gateway output remains unchanged. Current build receipts:

- Native source client: 8,141 bytes, SHA-256
  `2ce285fb5fde64b2ceefb42430ad0bfbdf5c1e82c076cfbf099c792884a6ed1d`.
- Tenant Worker: 25,403 bytes, SHA-256
  `740d86ef71653d63de7550f2e257be114ccd810406bf69cebff85c9c602f0250`.

Hosted CI now rebuilds the current engine before the same integration tests on
Linux and Windows, and triggers on engine source/dependency changes. The image,
container controller, MCP HTTP transport, AssetLibrary/material/revision adapters,
browser downloads, account deletion and deployed qualification remain open.

At the preceding `349cf89e7652a075dbc0777ff883f2ca7b58fa5c` commit,
[engine/package CI 37455478543](https://github.com/instruktlabs/kiln/actions/runs/37455478543)
passed all twelve jobs, [hosted checks 37455478554](https://github.com/instruktlabs/kiln/actions/runs/37455478554)
passed both platforms, and [Website 37455478462](https://github.com/instruktlabs/kiln/actions/runs/37455478462)
passed. [Native preflight 37455478603](https://github.com/instruktlabs/kiln/actions/runs/37455478603)
again failed required isolation before source execution while its independent
trusted software-rendering fixture passed. Cloudflare authentication is still
required for provider qualification; no production service or npm package is live.

### Native saved assets and exact source restoration

The private storage index and `NativeAssetLibrary` now implement the engine's
existing project/library save, read, list, import and export contracts. The native
adapter imports the public SDK's verifier and material dependency resolver;
`resolveSavedAssetMaterials` is now exported from `@instruktlabs/kiln/assets/node`.
Cloud code remains outside the published package, and Workers do not import the
native engine. The shared HTTP transport preserves the source client's existing
timeouts, cancellation, fixed internal origin and redacted diagnostics.

Revision ownership, filename inventories, immutable ids and parent/first-revision
conditions are enforced in tenant storage. Commit checks and file pins are atomic,
so competing first saves cannot silently create independent histories. Imports
validate the complete input first and commit each revision separately. Copies keep
their collection identity; deleting one does not delete the other. A retry of an
identical imported revision retains the same records without new quota consumption.

Material resources use the canonical SDK closure semantics. The local fixture
exports and imports a textured GLB with its source/materials, then rebuilds it
byte-for-byte without the original material library. Imported closures are also
installed in an injected MaterialLibrary. Implementing that library's standalone
durable hosted adapter remains open.

New tests were observed failing before the index/adapter implementation and missing
SDK export were added. The full hosted suite now passes 57 checks, including actual
registry save/list/restore/export, fresh hosts, storage eviction, cross-tenant
denial, pagination, immutable conflicts, partial-upload cleanup, concurrent-save
cleanup, lost commit acknowledgement, retained pins and corruption rejection.
The lost-acknowledgement test confirms cleanup leaves all committed files readable
after reconnect. Unacknowledged uploads or interrupted cleanup can remain charged
until normal unsaved expiry; the controller's per-job recovery remains open.

The source round trip exposed a real engine defect: default UTF-8 decoding removed
an authored BOM and changed the program reference. Restore, MCP source reads,
reviewed saves and CLI rebuild observations now preserve those exact source bytes.
The focused 23 tests across five files passed after observing the failures, and
runtime bundles were regenerated. Build identity:
`sha256:4024be2f88cbe9582a83fc9250a90e44f1e2ec9255a65ba81f94db3a9ac08624`.

The full engine suite passed 3,289 tests with two platform skips and no failures
across 411 files in 369.68 seconds. Hosted typechecks, all four hosted builds, root
typecheck and lint passed. Receipts: `.cache/v1-hosted-assets-engine-tests.log`,
`.cache/v1-hosted-assets-tests.log` and `.cache/hosted-worker/`.
These fixtures use fixed trusted local source. They do not establish untrusted
native isolation, production persistence, live OAuth or capacity/costs.

A fresh Windows Node 22.23.3/npm 12.2.0 installation passed 25 package checks,
including all 53 core SDK imports/declarations, CLI, MCP, native dependency paths,
source-edit images and restart persistence. Archive SHA-256:
`c3fbbef710fbd56cc42897a10d803a5a534f9dcc27f713c7142fba93787aa951`.
Receipt: `.cache/v1-hosted-assets-package.log`. Both separately built production
native adapters also loaded against that exact fresh installation, including the
new public material resolver; no test alias or repository SDK path was used.

Build receipts identify the native asset adapter as 19,226 bytes, SHA-256
`ea7055048ecd9f946f5537aeb89d0daf7ab4b9344f166e958d57d3e8bffa0995`,
with three external public SDK imports. The tenant Worker is 31,244 bytes, SHA-256
`dadf4d9d5d8be7d848479c2c2f9665e47e7a9670e1195529a0e309154ab2dbe9`.
No model call, cloud provisioning, npm publication or production deployment was
performed by this validation.

For the preceding `194b0ba1d0080f4360fba5ae05e3feeb6b33266e` commit,
[engine/package CI 37457310643](https://github.com/instruktlabs/kiln/actions/runs/37457310643),
[hosted checks 37457310650](https://github.com/instruktlabs/kiln/actions/runs/37457310650)
and [Website 37457310654](https://github.com/instruktlabs/kiln/actions/runs/37457310654)
passed. [Native preflight 37457310791](https://github.com/instruktlabs/kiln/actions/runs/37457310791)
failed the required isolated evaluation/rendering step. Exact CI for this new change
and actual Cloudflare provider qualification remain required.

### Native MCP HTTP transport

The private native host now uses the pinned MCP server SDK 2.3.0 and the installed
engine's real registry. It supports the current HTTP protocol and stateless 2025
compatibility without duplicating tool schemas. Gateway forwarding now preserves
the required method/name headers, and browser Origin validation is applied before
dispatch. Credentials and tenant selectors cannot enter the private native route.

The production loader requires isolated-evaluator readiness before it exposes an
engine. Local tests use a fixed trusted fixture and make no isolation claim.
Fresh request contexts inject the durable source and asset adapters. Body, response
and deadline limits bound HTTP work; a cancelled evaluator retains its admission
slot until it settles. Container execution and forced process cleanup still need
their own implementation and real Cloudflare qualification.

Tests first demonstrated missing transport behavior, dropped protocol headers and
an accepted foreign Origin. Additional fault tests exposed cancellation/deadline
handling and an unhandled rejection; the corrections pass the focused nine HTTP
tests. After a clean private-package install, the complete hosted suite passes
67 tests, both hosted typechecks and five production builds. Root typecheck, lint
and whitespace checks pass. Receipt: `.cache/v1-native-mcp-tests.log`.
The native MCP bundle is 33,262 bytes, SHA-256
`0a2b1d06ecd4a5ca46141c0f6c859b6baac9cde84117c1dc372740fe34da6807`.

For `1116ea6b5415482f7436e73830a60397bbc1dc5c`,
[engine/package CI 37460519101](https://github.com/instruktlabs/kiln/actions/runs/37460519101)
passed all twelve jobs. Hosted checks 37460519166 and Website 37460519321 passed.
Native preflight 37460519128 failed its required isolated evaluation/rendering step.
These results qualify that commit; this transport change needs its own CI.

### Package release priority

A fresh public registry lookup on 6 October still returns 404 for
`@instruktlabs/kiln`. The RC is unpublished. Final 1.0 version/documents, exact
candidate qualification, approved main integration, npm publisher authorization,
publication/provenance and fresh registry installation remain open. As specified
in the publication plan, npm release does not wait for hosted launch or directory
approval. Those remain separate requirements of the overall active goal.

### Authentication architecture and current client compatibility

The owner expanded hosted v1 sign-in to Google and GitHub, with email later, and
requested a current, provider-agnostic architecture review. The publication plan's
[authentication review](../plans/2026-10-05-v1-publication-plan.md#authentication-architecture-review-6-october)
records primary sources, the account boundary, library alternatives and required
implementation/qualification. It recommends retaining the maintained Cloudflare
MCP issuer, adding a standards-based Google adapter and a permanent internal Kiln
account id, and keeping identity/lifecycle data separate from tenant artifacts.
The existing `github-<id>` subject is not the final multi-provider account model.

Live registry metadata confirms the existing Cloudflare OAuth provider pin 1.2.1
is the current stable release. Read-only Google discovery and ChatGPT CIMD probes
confirmed the documented endpoints, S256 and the current public/signed method
offer. Two new checks prove the production gateway can negotiate the supported
public method when the metadata's legacy preference is signed, still rejects a
missing PKCE verifier, and refuses a signed-only client. All 19 focused auth
checks and the complete 69-test hosted suite pass; root lint and whitespace checks
pass after formatting the added fixtures. Receipts:
`.cache/v1-auth-architecture-tests.log`, `.cache/v1-auth-review-hosted-tests.log`.
This does not constitute
live Google/OpenAI login or signed-client assertion support.

Production dependency audit reported zero known advisories in the current private
hosting package; `.cache/v1-auth-audit.json`. It is not a security certification.
The review explicitly records the library's KV concurrent-consumption limitation,
cross-region revocation concerns, missing account/linking/deletion controls and
unfinished branded UI. No provider app, secret or cloud resource was created.

### RC shutdown qualification and final-version preparation

At `aa5bc2cba745f616a4775a60016cefb097621bcf`,
[engine/package CI 37464347265](https://github.com/instruktlabs/kiln/actions/runs/37464347265)
completed with eleven successful jobs. Intel macOS failed because the npm-launched
MCP process did not exit within five seconds of stdin closing, after successfully
listing tools. Hosted checks 37464347226 and Website 37464347348 passed. Native
preflight 37464347408 failed required isolation, as before. This is not an
all-green package candidate.

A focused regression reproduced a real lifecycle defect locally: the executable's
delayed warmup imported an unused engine after a tool-list-only client disconnected.
The executable now cancels pending warmup on stdin end/close, checks the stream
before starting it and unreferences the speculative timer. It does not force the
process to exit or loosen the package smoke test's shutdown deadline. All six
startup checks pass after rebuilding; the macOS outcome still requires fresh CI.
Before/after receipts: `.cache/v1-mcp-close-before-fix.log` and
`.cache/v1-mcp-close-after-fix.log`.
The full offline unit suite passed 3,290 tests with two platform skips and no
failures across 411 files (367.11 seconds); `.cache/v1-mcp-close-tests.log`.
Typechecking, root lint and whitespace checks also pass. Exact-commit CI still
must qualify coverage, other operating systems and installed software rendering.

The corrected RC's fresh Windows installation passed all 25 package checks,
including 53 core imports/declarations, npm-launched MCP shutdown, real CLI/MCP
render/edit/save flows and textured community export. Archive SHA-256:
`aab4be74024f93d1ef20a397d15807204b04cd81fb959fbee779c2e32997d14b`;
receipt `.cache/v1-mcp-close-package.json`. Its installed production dependency
audit reported zero known advisories in `.cache/v1-rc-consumer-audit.json`.
Neither result is a security certification or a registry publication receipt.

Final `1.0.0` version/documents/plugin preparation is preserved in
`.cache/v1-final-preparation.patch`. Its preliminary Windows package check passed,
but that archive predates this shutdown correction and is not a final candidate.
The working branch remains `1.0.0-rc.1` so the plan's authorized RC publication and
fresh registry/plugin installation precede final 1.0 qualification. Apply the
saved source/document changes selectively after the RC step, then regenerate plugin
metadata and runtime bundles; never restore its stale generated build files.

### Independent multi-provider account foundation

The tested stdio correction was committed and pushed as
`6a89d790ba2d786ad641bdab777a40535ef3c19c` on `codex/v1-publication`;
[CI 37466581875](https://github.com/instruktlabs/kiln/actions/runs/37466581875)
passed all twelve jobs, including Intel macOS shutdown, coverage and installed
software Vulkan. Hosted gateway checks 37466581806 and Website 37466582044 also
passed at the same commit; native preflight 37466581995 still fails isolation.
PR 145 is ready for review, with approval to merge this exact RC requested through
the question tool. No merge, npm stage or deployment has occurred.
Hosting implementation continues on the local
`codex/v1-hosted-identity` branch based on that commit, preserving the PR 145
candidate while its release checks and owner handoffs proceed.

The first account-directory contract and D1 migration are implemented independently
of the OAuth gateway. Canonical verified issuer/subject pairs map to random Kiln
account IDs; contact data and upstream credentials are not persisted. Atomic D1
batches and uniqueness constraints prevent duplicate owners and orphan accounts.
Every lookup starts a new `first-primary` session. Disabled/deleting records are
returned by state lookup but cannot sign in or create a replacement account.

Six focused tests failed against the initial unimplemented contract and pass with
the D1 adapter. They include 24 concurrent first sign-ins, distinct issuers with
matching emails/subjects and a trigger-induced identity failure proving transaction
rollback. Full hosted suite: 75 passed, no failures; both typechecks and all five
existing production builds pass. Receipts: `.cache/v1-accounts-before.log`,
`.cache/v1-accounts-after.log`, `.cache/v1-accounts-full.log`.
No live D1 database was created. The adapter is not yet wired to authorization or
tenant selection; Google, linking, epoch enforcement and account lifecycle remain
open. Simulated primary reads do not prove deployed cross-region revocation.

## Hosted identity integration

The owner-selected Google and GitHub flow is now connected to the D1 account
directory on `codex/v1-hosted-identity`, separately from the frozen npm RC. Google
uses pinned `oauth4webapi@3.8.8`; signatures, both documented Google issuers,
audience/authorized-party, nonce, expiry, state and exact callback checks are
exercised with locally generated signing keys. It requests `openid profile` and
discards upstream credentials. GitHub continues to request no repository scopes.
Only a permanent Kiln account ID enters a grant or tenant-routing hash.

`0002_login_intents.sql` and its D1 adapter close the upstream same-browser KV
replay window with atomic, origin/state/provider/purpose-bound claims, after the
OAuth library verifies its browser cookie. Tests include 24 simultaneous consent
claims and callback consumes, stale-KV replay, provider swaps, expiry and bounded
input. No raw state or upstream credentials are stored in these D1 tables.
Every protected access, code exchange and refresh also reads current primary
account state and epoch. Disabled/deleting accounts, old epochs and missing
authority fail closed. Re-enabling after an epoch increment does not restore old
credentials. These checks use public provider hooks, with no vendor internals
modified and no custom JWT decoder.

The Google tests first failed against their stub, and a single-audience foreign
`azp` fixture exposed an additional check now enforced. The login-intent stub
failed all four contract tests; the new routing contract failed before wiring.
Full hosted result: **90 passed, no failures**; both hosting typechecks, all five
production builds and root lint (933 files) pass. Receipts:
`.cache/v1-google-before.log`, `.cache/v1-google-after.log`,
`.cache/v1-login-intents-before.log`, `.cache/v1-login-intents-after.log`,
`.cache/v1-provider-routing-before.log`, `.cache/v1-hosted-identity-full.log`.

This is local implementation evidence, not hosted launch acceptance. No provider
app, live D1 resource or hosted deployment was created. Explicit account linking,
browser account sessions, individual connection revocation, deletion orchestration,
public-endpoint admission limits, completed branding/privacy/support pages and
actual deployed provider/client and cross-region checks remain open. Native
provider isolation and dispatch remain independent blockers. PR #145's npm RC
head was unchanged during this work; its subsequent merge is recorded below.

## RC merge and npm authentication handoff

The owner explicitly approved merging PR #145 at reviewed head
`6a89d790ba2d786ad641bdab777a40535ef3c19c`. Its complete check set was **15 passed,
one failed**: all 12 engine/package jobs, both hosted gateway platform jobs and the
website build passed. The native-hosting preflight remained failed. Its downloaded
receipt reports `isolation / wrapper-launch`; diagnostics show `unshare` denied
with `Operation not permitted` and Bubblewrap unable to create a namespace. The
separate software-renderer receipt passed six views. This is an unresolved hosted
launch blocker, not an all-green PR and not Cloudflare provider qualification.

GitHub's required linear-history rule rejected a merge commit. A normal squash
merge of the exact approved head succeeded, with no admin bypass or protection
change, on 6 October at 13:31 UTC. Main commit:
`ce640ccae0c621177aad176a03b5a214ae57d266`. The hosting identity branch was rebased
onto that main commit without changing its implementation. Exact main CI, archive
review and verify-mode release preparation are now required before staging.

The owner also completed a fresh npm CLI browser sign-in in external Chrome. The
CLI reported success and an independent `npm whoami` returned `matthew-kissinger`.
No password, security-key response, recovery code or npm token was read into chat.
Login and merge published no package and deployed no hosted service.

## Isolation review and exact-main qualification

The owner requested current-practice research on the Docker namespace failure and
offered their HOL Guard fork as a possible reference. The
[hosted isolation review](2026-10-06-hosted-isolation-review.md) records the actual
CI denial, current Cloudflare microVM controls, the fork's local/OCI/gVisor code,
and upstream's separately provisioned containment test environments. No HOL Guard
code was installed or run. The owner explicitly deferred its contribution and
integration work until after a polished v1.

The next hosted implementation is an explicit adapter for a fresh Cloudflare
microVM per evaluation job, with external network, lifetime and output controls.
This does not weaken or bypass the existing Linux Bubblewrap readiness contract.
Cloudflare deployment and adversarial qualification remain open; no workstation
Docker change is required from the owner at this stage.

All 12 engine/package jobs passed on exact merged main
`ce640ccae0c621177aad176a03b5a214ae57d266` in
[CI run 37471433457](https://github.com/instruktlabs/kiln/actions/runs/37471433457).
Downloaded `node-package-candidate` without repacking: the RC archive is 9,154,941
bytes, SHA-256
`f2de7eb69f6e16dd618c77249b1f46eda1b5d032789f5b0d9048b2b2a08ea8c2`.
Its SDK receipt agrees with that digest. Dispatched
[release verification 37473250032](https://github.com/instruktlabs/kiln/actions/runs/37473250032)
from the same main commit, in **verify** mode with no npm staging permission.
Verification passed. Downloaded `npm-release-review`, inspected `review.json` and
independently matched its archive digest. The stage job was skipped as intended.
All 15 checks on hosted identity PR #146 at `255df6a` also passed; that PR remains
unmerged and does not change this npm candidate. The owner staging/access-setup
question was pending at this checkpoint because first-time npm staging creates a
public placeholder. The subsequent authorized setup is recorded below. No hosted
service has been deployed.

## Owner handoffs

Cloudflare CLI consent is complete. After the earlier consent expired, the owner
approved a fresh request in external Chrome. The CLI reported successful login,
and a separate `auth whoami` check confirmed authenticated and token-valid state
for the intended account. The consent displayed 24 permissions covering identity,
account/zone reads, Workers, Containers, R2, KV, D1 and observability; the CLI also
records its refresh capability. No billing or API-token management permission was
requested. This authorizes CLI access, not evidence of a deployed service.

The owner selected Google and GitHub sign-in for free hosted v1 access, private
saved assets and personal quotas, with email sign-in deferred and explicit requirements for correct implementation,
professional presentation and end-user security. The package and local plugins
remain account-free. The hosted launch gate includes clear Kiln / Instrukt Labs
branding, verified domain, minimal provider permissions, privacy/support links,
usable disconnect/deletion controls and actual deployed consent, cancellation,
expiry/revocation and cross-user denial checks. Local fixtures do not establish
those results. No identity app or secret has been provisioned yet.

The initial npm browser login did not complete and its terminal-password fallback
was cancelled. The fresh owner-attended attempt succeeded, as recorded above.
Trusted publishing configuration, exact-archive staging and owner promotion remain
separate steps, with subsequent progress recorded below.

## npm bootstrap and package protections

The owner explicitly approved staging the verified RC and configuring stage-only
GitHub publishing access. The exact archive above was uploaded using npm 12.2.0
with lifecycle scripts disabled and local provenance disabled only for bootstrap.
npm created stage `36c3dbd9-5908-4e0c-b394-b08e12379e31` and the public
`0.0.0-stage` holding version. The RC itself was not promoted. The package website
confirmed the placeholder even while public registry metadata was still returning
404; these are different observations, not evidence that no public write occurred.

Owner security-key authentication completed the trusted publisher configuration:
repository `instruktlabs/kiln`, workflow `release.yml`, environment `npm-release`,
permission **npm stage publish only**. npm's Settings UI independently showed
those values. A second owner security-key step saved **Require two-factor
authentication and disallow bypass 2fa tokens**; the success notification and
selected setting were verified. No bypass token or `NPM_TOKEN` was created.

As prescribed by the runbook, the bootstrap was rejected with owner 2FA after
trust was saved. The CLI confirmed rejection and `npm stage list` returned an
empty list. This removed only the temporary unpromoted stage, not the package or
its settings. The exact archive remains retained in the CI artifacts and locally.

Rechecked main, successful source CI, archive digest and the GitHub environment:
sole owner reviewer, protected branches only, no administrator bypass. Dispatched
[staging run 37477014656](https://github.com/instruktlabs/kiln/actions/runs/37477014656)
from unchanged main with the same CI run and digest. Its verification job passed;
the owner approved the GitHub environment review, and the stage job succeeded.
npm stage `6f426dc2-d6b6-41a8-9ccf-874342bd7089` is `1.0.0-rc.1`, tag `next`,
actor `GitHub Actions` / `trusted automation`. Its registry validation completed
with status `staged`. No RC promotion or stable 1.0 publication has occurred.

Downloaded that stage from npm and independently matched its 9,154,941 bytes and
SHA-256 to the approved archive. npm recorded signed provenance in
[Sigstore log entry 3110722988](https://search.sigstore.dev/?logIndex=3110722988).
The Rekor entry stores the signed payload hash rather than the statement itself.
Reconstructed the expected statement using npm 12.2.0's deterministic schema and
the verified archive SHA-512, then required its exact SHA-256 to match Rekor's
`79449664bc6e679b694bcae73b78d26023b3df2f97eca215672c50fc8686c3a3`.
Reassembled the verification bundle from that statement and the public certificate,
signature, inclusion proof and signed timestamp. npm's installed Sigstore verifier
successfully checked the bundle against its TUF trust root and the required
GitHub Actions issuer and workflow identity. The verified statement binds the
package/version/archive to repository `instruktlabs/kiln`, `release.yml`, main
commit `ce640ccae0c621177aad176a03b5a214ae57d266` and run `37477014656` attempt 1.
This was verification only; no new signature or provenance was generated locally.
Retained `.cache/npm-stage-provenance-receipt.json` and
`.cache/npm-stage-verified-provenance.json`. Public promotion is now awaiting
the separate owner approval required by the runbook at this checkpoint; its
subsequent promotion and public-registry verification are recorded below.

## Cloudflare evaluation controller implementation

The private host now has a one-job container controller with a durable claim and
deadline alarm recorded before compute starts. It requires a pinned image digest,
disables internet, sends no storage or identity credentials, bounds request/stdout/
stderr bytes, and destroys the whole VM before returning output. Cancellation,
startup failures, output flooding and deadlines converge on that cleanup. Failed
cleanup suppresses success and leaves a durable alarm to retry. Completed job IDs
remain unavailable for reuse. Returned bytes still require the engine's strict
versioned result validation outside the VM.

The companion one-shot entry imports the compiled engine package, accepts one
bounded UTF-8 request and emits one canonical evaluator response. It is designed
only for an externally isolated VM; its in-process handler and JavaScript timeout
do not provide a security boundary. Fixed trusted fixtures passed deterministic
GLB, malformed-envelope, invalid-UTF-8 and oversized-input checks on the development
host. Nine controller tests passed for orchestration and cleanup. These checks do
not establish Cloudflare isolation, image deployment, hostile-source containment
or production routing. Those gates remain open.

With these additions, the local hosted suite passed **103/103** tests. Both hosted
TypeScript configurations, all five existing production bundle builds, repository
lint and whitespace checks passed. The new controller and entry are not yet wired
into a deployed Worker. Receipts: `.cache/v1-container-entry-before.log`,
`.cache/v1-container-entry-after.log`, `.cache/v1-container-hosting-full.log`.
The work is in draft [PR #147](https://github.com/instruktlabs/kiln/pull/147),
stacked on #146. Both Linux and Windows checks passed in
[hosted CI 37477551252](https://github.com/instruktlabs/kiln/actions/runs/37477551252)
at `7ac3b23`.

An independent storage regression found during the full hosted suite was fixed in
`76ef646`: creation and seven-day expiry now derive from one clock read. A focused
advancing-clock test failed before the change and passed afterward. The fix is on
hosted identity PR #146; both hosted CI platforms passed. It does not change the
frozen main-branch npm archive.

## Public release candidate promotion

The owner explicitly approved public promotion of the verified RC under `next`
and completed npm's security-key authentication. `npm stage approve` succeeded
for stage `6f426dc2-d6b6-41a8-9ccf-874342bd7089`. The public registry independently
confirmed `@instruktlabs/kiln@1.0.0-rc.1` and `next=1.0.0-rc.1`. `latest` remains
`0.0.0-stage`; users must select `@next` or the exact RC version until stable
1.0 is published. This is a published prerelease, not completion of the v1 goal.

Fetched the tarball from its public npm URL without authentication. Its bytes,
SHA-256 and SHA-512 integrity match the approved candidate. Downloaded the public
registry provenance bundle and verified it with Sigstore against the GitHub Actions
issuer and exact workflow identity. Its statement exactly matches the independently
verified staging statement, including package digest, source commit and workflow
invocation. Public receipts are retained in `.cache/npm-public-rc1/`.

Installed that public-registry archive into a fresh Windows x64 consumer directory
using Node 22.23.3 and npm 12.2.0. All 25 package checks passed, including SDK imports
and consumer types, CLI, CSG/UV WASM, CPU PNGs, the compiled evaluator, MCP discovery,
source editing/export, restart persistence, and the local plugin bundle. The receipt
validator accepted its exact runtime, package version, digest and required checks.
This verifies Windows consumption of the public archive; the remaining public-
registry platform matrix and actual plugin harness installation remain open. The
prepublication exact-archive platform matrix is separately complete.

The package remains `@instruktlabs/kiln`; `next` is a distribution tag, not part of
its name. Stable `1.0.0` will be assigned `latest`, allowing the plain install
command. Source checkout documentation now states the RC publication status.
Stable publication, hosted deployment and directory submissions remain incomplete.

## Installed container image and public-registry matrix

The private CPU image built successfully on Linux amd64 in
[run 37479877969](https://github.com/instruktlabs/kiln/actions/runs/37479877969)
at `4267b2053236a012c590a23b62f82d5760b38bd7`. Its four-file build context contained
only the Dockerfile, one-shot entry, approved public archive and archive checksum.
The fixed trusted fixture ran in two fresh containers with networking disabled,
one CPU, 6 GiB memory, 128 processes, dropped capabilities and no new privileges.
Canonical response decoding passed; both returned the same 1,912-byte GLB with
SHA-256 `f94d231ed3eb4843a03704872adc3f20b00c2ea24567cb5916407b40a2cf1d40`.
The receipt explicitly leaves Cloudflare and hostile-source qualification false.
Image metadata, installed dependency lock, OS inventory and runtime version are
retained in the run's `private-evaluation-image-evidence` artifact and locally
under `.cache/image-ci-37479877969/`. No image was published or deployed.

Public-registry [run 37479877736](https://github.com/instruktlabs/kiln/actions/runs/37479877736)
passed all four Linux Node versions and both macOS architectures. Windows completed
all 24 functional checks but correctly failed receipt validation: the child helper
selected bundled npm 10.9.9 instead of the globally upgraded 12.2.0. The workflow
now passes the selected global npm CLI explicitly and checks its version before
running the package fixture. The required npm version was not relaxed. This
workflow correction still requires a successful Windows CI receipt.

Docker Desktop was installed locally but its Linux engine was stopped when first
queried. After the owner started it, `docker info` successfully reported server
29.5.3, Linux, x86_64. No reinstall, privilege change, seccomp relaxation or Windows
service reconfiguration was needed. This resolves local image-build availability;
it does not resolve the separate historical Bubblewrap namespace probe or qualify
Cloudflare isolation.

The corrected public-registry [run 37480967896](https://github.com/instruktlabs/kiln/actions/runs/37480967896)
passed all seven jobs at `3a5d00a8a35f9434d42aae4d39ef5824916d9539`. Downloaded
every receipt and verified `status=passed`, all 24 required checks, package name,
RC version and the approved archive SHA-256. Linux covered Node 20.15.0, 22.2.0,
22.23.3 and 24.20.0; Windows x64 and both macOS architectures covered Node 22.23.3.
The Windows receipt now records npm 12.2.0. Evidence is retained under
`.cache/registry-ci-37480967896/`. This closes the public-registry platform matrix,
not stable publication or actual agent-harness plugin installation.

The local Docker build subsequently passed its own two fresh-container fixtures.
Its immutable image ID is
`sha256:69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a`;
both GLBs match the Linux CI fixture's digest above. The local image's metadata,
dependency lock and OS/runtime inventory are in `.cache/evaluation-image-local-evidence/`.
Only the named test containers were removed; the qualified local image is retained.

## Private Cloudflare availability candidate

Prepared the bounded [probe and teardown plan](../../hosting/probe/README.md).
It has no public HTTP routes or external bindings, uses five fixed sequential
jobs, and atomically claims its run once. The first failure stops the batch;
interrupted claims do not automatically spend again. The production image is
unchanged; native boundary fixtures exist only in the separate probe Worker.
Production bundle builds now reject both test and probe helpers.

Three initial run-control tests failed before implementation and passed afterward.
A fourth workerd integration check verifies loopback namespace routing, closed
HTTP access and retained failure when no real container is bound. The full hosted
suite passed **107/107**, all three TypeScript configurations and five production
bundles passed, and repository lint passed. `@cloudflare/config@0.23.0` is a pinned
private development dependency for validating the cf beta Build Output; it does
not enter the engine package or production Worker bundle.

The final probe Worker bundle is 13,190 bytes, SHA-256
`6babbbb9073fbb4514b03675d73ee1387f30099cd6174cfca7ac8bc6515cc2e0`.
`cf@1.0.0-beta.12 deploy --prebuilt --dry-run` succeeded for the prepared private
Worker and `durable_object` container application. No upload, deployment, cron
provisioning or live probe was performed. Its managed-registry image reference is
the intended destination, not evidence that the image has been pushed. Retain the
actual returned registry digest and deployed identities after the concrete owner
approval. Estimated container metering is about $0.012 for the five-job worst-case
runtime; the proposed total trial allowance is $1, not a provider-enforced cap.

Availability is only the first provider gate. Native memory exhaustion, output
floods, cancellation/deadline races, controller interruption recovery, CPU images,
software Vulkan, measured startup/costs and authenticated storage/MCP integration
remain separate required work before hosted launch.

## Public-registry plugin qualification and documentation refresh

Re-read the current [OpenAI packaging](https://developers.openai.com/plugins/build/plugins),
[submission](https://developers.openai.com/plugins/deploy/submission),
[Claude Code installation](https://code.claude.com/docs/en/discover-plugins),
[publication](https://code.claude.com/docs/en/plugins/publish) and
[Anthropic portal checks](https://claude.com/docs/plugins/pre-submission-checklist)
on 6 October. The plan's distinction between owned marketplaces, directory
submission and an Anthropic partner's curated-marketplace listing still applies.
Portable OpenAI manifests and `.claude-plugin/plugin.json` remain appropriate.
Claude Code 2.1.287 strict validation passes without warnings. Codex CLI 0.160.1
provides the native marketplace/plugin commands used for qualification.

Claude fetched `https://github.com/instruktlabs/kiln.git#main`; the downloaded
commit was exactly `ce640ccae0c621177aad176a03b5a214ae57d266`. GitHub shorthand
selected an unavailable SSH identity on this machine, and a full SHA in Claude's
`#ref` position was rejected as a missing remote branch. Explicit HTTPS plus a
branch/tag works; inspect the resolved commit rather than claiming SHA-selector
support. Installation was scoped to a separate qualification workspace. The old
user-scoped `kiln@kiln` 0.6.0 installation was already disabled and was not changed.

Codex refreshed a Git marketplace pinned to that exact SHA with per-invocation
configuration and materialized the RC in its normal versioned plugin cache.
Its app server discovered the cached `kiln-engine:kiln-setup-workspace` skill,
the workspace's three author/refine/QA skills exactly once, and `kiln_workspace`
with all seventeen tools and server version `1.0.0-rc.1`. No model turn, profile
relocation, permanent Codex configuration edit or authentication change was used.
The experimental app-server interface is qualification tooling, not a product
dependency. Both cached plugin inventories match their recorded file hashes.

The cached installer downloaded the exact public RC without `--archive`. The
installed lockfile records the approved public tarball URL and SHA-512 integrity.
Both cached helpers then accepted their fresh managed workspace with `--check`.
Claude's actual MCP connection check passed with a fixture-only, server-specific
trust option. A standard MCP client exercised each generated workspace's installed
server: capability identity, CPU images, save, process restart, exact source
recovery and CLI GLB export all passed. Capability receipts point to the installed
public package outside either plugin cache and report the RC engine/build identity.
These fixed-fixture checks do not claim a model-authored asset or vendor approval.

Receipts: `C:/Users/Mattm/X/kiln-dogfood/plugin-rc1-2026-10-06/codex-receipt.json`
and `workflow-receipt.json` beside it. Probe helpers are retained under
`.cache/registry-plugin-{codex-probe,workflow}.mjs`. Failed diagnostic assumptions
(quoted CLI override key and JSON-only Discovery text) were corrected in the
probe; no engine behavior or acceptance criterion was relaxed.

The current repository contains 3,944 blobs totaling 92,216,785 bytes; a local
Git ZIP of the exact main commit is 41,453,102 bytes. These are preliminary size
checks against Anthropic's repository limits, not a substitute for the actual
GitHub archive and portal validation of the final source. Stable-version plugin
updates, final public distribution and both directory submissions remain open.

## First private Cloudflare attempt and cleanup

The owner approved the bounded five-job, $1 trial. Source `ea08a16` was uploaded
using cf 1.0.0-beta.12. The registry returned the unchanged local image digest
`sha256:69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a`.
An independent download of the deployed module matched the prepared Worker
SHA-256 `6babbbb9073fbb4514b03675d73ee1387f30099cd6174cfca7ac8bc6515cc2e0`.
Worker metadata verified no public routes, workers.dev or preview URLs and no
external references. Version `d4225ffb-9951-49a6-9f8d-281542d3ab9d` belonged to
deployment `479434b1-c5cd-4f18-b1db-88d51e9d5fce`; application/job namespace
`e8d89496082f4e63961a8793eed7f1bf` and coordinator namespace
`2256b6871cbc4661a2d7525a48d9fc3a` were created only for this trial.

At 15:25:18 UTC on 6 October, the first `engine-a` job failed after **2,048 ms**
with `WORKER_FAILED`; Cloudflare logged internal-error reference
`oe4cvciv5rmllufovr4m5gcm`. The retained result has `stopped=true`, and the run
finished after exactly one result. All four remaining fixtures were skipped.
Provider queries showed zero active/starting instances. The operator deleted the
exact trial application, Worker and image; follow-up reads returned no application
or image, a Worker 404, and neither trial namespace. Other account resources were
left in place. Receipts are retained under `.cache/provider-probe-trial-1/`.
Actual billed usage is not yet settled; the $1 figure is the approved allowance,
not a provider-enforced cap or a measured bill.

The current [native API documentation](https://developers.cloudflare.com/containers/api/durable-object-container/)
states that user/group names cause native `exec` errors. This image's named `node`
identity resolves locally to `1000:1000`. A focused test rejected the old omitted
identity; explicitly passing numeric `1000:1000` now passes. This changes file
ownership selection, not the VM isolation boundary. The provider failure is only
plausibly explained until the corrected code runs successfully. The operator
probe additionally records the first failed native API method without exposing
raw errors or output. Both observation tests failed before implementation.

The continuation uses the same immutable image and at most **four remaining
jobs**, preserving the aggregate five-job/$1 authorization. It removes the
redundant second provider box fixture rather than increasing that scope. Any
successful provider GLB will be compared with the independently qualified
local/CI digest; two-run provider determinism is not claimed. Updated local gates:
**110/110 hosted tests**, all three TypeScript configurations and all five
production bundles pass. Production bundles exclude the operator-only observer.
Repository lint and the corrected private deployment dry run also pass. The
continuation Worker is 14,130 bytes with SHA-256
`8ed395851f30e935d874f79af62f6a33db2098de6fc24745d54af0f3741941ac`;
its preparation receipt is `.cache/provider-probe-numeric-user-candidate/build-receipt.json`.

## Main merge, identity setup and security review

The owner approved PR #146 at `76ef64648c3ce91d65140a43b806dcfcf3fb3af0`.
GitHub rejected a merge commit under repository policy; the same approved change
was squash-merged without bypassing protection. Main is
`8d14d0e0ca89fe3ef860ff6d3568e5647a382c53`. CI run `37491254733`, hosted checks
`37491254766` and website build `37491254759` all passed on that exact commit.
No package publication or service deployment resulted from the merge. PR #147
now targets main, and its branch incorporates that main revision.

The owner selected the existing signed-in Google account for a dedicated Kiln
identity project. `instruktlabs-kiln-auth` was created with display name Kiln.
The Google Auth Platform is not configured yet: no OAuth client or client secret
has been created, and no compute, billing or Google Cloud Run service was added.
Hosting remains on Cloudflare.

The actual GitHub ZIP of `ce640ccae0c621177aad176a03b5a214ae57d266` is
41,888,908 bytes, contains 4,736 entries and expands to 92,216,785 bytes. SHA-256:
`00e910c53cf75740fb2d6693853e01ef7d9d45277c64f14325adddea2b5a61ed`.
The plugin contains nine files, the largest 15,026 bytes. This passes the checked
Anthropic archive limits; portal validation and submission have not occurred.
The final stable archive must be measured again. The receipt is
`.cache/anthropic-github-main-archive-receipt.json`.

The owner requested adversarial security review, now tracked in
[the security record](2026-10-06-v1-security-review.md). Repository secret scanning
and push protection were enabled; no open secret alerts were returned. An actual
stream-deadline defect was reproduced and fixed with failing-then-passing tests.
All 112 hosted tests, typechecks, production bundle builds and root lint pass.

The owner explicitly deferred the broad public README/site documentation refresh
until stable 1.0 and the public hosted service are verified. The queued refresh
includes Troy scene pictures, npm installation, local agent/plugin onboarding,
hosted setup and matching website/agent-readable content. Internal execution and
security records continue now; accurate privacy, support and sign-in pages remain
part of the hosted candidate. No public README/site refresh or Troy picture
publication was performed during this checkpoint.

## Corrected private trial: scheduling limitation and cleanup

The corrected source `aabc798437184ae4ef5a5b40a5b4de00beca5624` was deployed at
15:42:31 UTC on 6 October. Its downloaded Worker matched the prepared SHA-256
`8ed395851f30e935d874f79af62f6a33db2098de6fc24745d54af0f3741941ac` and retained
the original immutable image. Version `d8199c93-e870-40a6-9338-9c8c27bd141e`
belonged to deployment `517e21c9-d3dc-4082-904d-149a7f9cd593`. The Worker had no
public HTTP route, workers.dev or preview URL, credentials or user assets.

The configured five-minute cron produced no observed invocation, log event,
coordinator object or container instance. Reapplying its exact trigger at
16:12:47 did not resolve this. At 16:22:10, a separate private 278-byte scheduler
(`kiln-private-probe-trigger-20261006`) was deployed with only a binding to the
existing coordinator. It called the same `availability-rc1` durable claim, adding
no job, run state, image or allowance. Its downloaded module matched SHA-256
`27233d5b3ce584d6c7ad1de140ebf92f244277419adc6c226d6fa561cf38b40d`; private URL
settings and the exact binding were independently verified. This also produced
no observed event. The cause is unconfirmed; the result does not demonstrate that
the corrected evaluator failed or that Cloudflare cannot run it.

At 16:54:51, both telemetry queries remained empty; the coordinator-object and
container-instance lists were also empty. This exceeded the documented 15-minute
cron propagation window and 30-minute new-worker event-history window for the
helper. Cleanup removed the helper first, followed by the trial application,
original Worker and registry image. Follow-up reads returned 404 for both Workers
and the application, no matching image and neither trial namespace. Other account
resources were preserved. Receipts: `.cache/provider-probe-trial-2/`.
No successful provider evaluation/isolation result or settled billing total is
claimed. The aggregate five-job/$1 authorization was not reset or expanded.

## Security fixes and business support identity

Commit `abe5a44538251ebc5d7b5051a25eec1d74200233` adds tested request cancellation,
elapsed-time and bounded-buffer handling, plus targeted transitive dependency
patches. All 3,290 local engine tests, the coverage ratchet, 116 hosted tests,
typechecks, lint and the full local website build pass. Linux/Windows hosted CI,
the private image, public-registry checks and the Linux website workflow pass on
that commit. All twelve engine/package jobs in run `37498513040` also pass,
including the installed Linux software-Vulkan renderer. The Linux website job
qualifies the two symlink assertions that Windows could not execute locally.
The separate native preflight remains unsuccessful. See the security record for
audit scope, the remaining build-only advisory and release limitations.

The owner selected `support@instruktlabs.com` for the public support identity.
Cloudflare routing was configured and verified active, forwarding that address
to the existing verified inbox without changing other aliases. The owner then
created and secured a free Google Account using that address. After explicit
approval, the account received only `roles/oauthconfig.editor` on
`instruktlabs-kiln-auth`; the existing personal account remains project owner.
The owner accepted the first-use Cloud Console terms and Google's API User Data
Policy. Kiln's OAuth application is now created in external testing mode, with
the business support address and `matt@instruktlabs.com` as developer contact.
The narrowly scoped account can manage branding, although the overview metrics
page separately asks for `serviceusage.quotas.get`; no extra role was granted.
No OAuth client or client secret has been created, and outgoing support replies
still need configuration and testing. No paid Google Workspace subscription,
Google compute service or billing account was added.

## Private invocation continuation

Cloudflare documents remote development service bindings as a route to deployed
Workers and their Durable Objects. The operator probe now exposes only a named
`KilnProbeControl.runFixed()` RPC, accepting no source, commands, fixture selection
or run ID. Both HTTP handlers still return 404. Its prepared deployment removes
the cron and retains the four remaining fixed jobs, atomic run claim and original
immutable image. This changes invocation, not the isolation or cost allowance.

A workerd integration test first failed because the entrypoint did not exist,
then passed with the implementation; it covers fixed execution, HTTP denial and
retained results on retry. All 117 hosted tests, typechecks, five production
bundles and root lint pass. The prepared 14,432-byte Worker has SHA-256
`e3f30d81e40f19cb63f49d2879cb7684e9c2bad5e8f76808685d4b5233e7d3a1`;
`cf deploy --prebuilt --dry-run` passes. This candidate has not yet run remotely.
Receipts: `.cache/security-review-2026-10-06/probe-rpc-*.log` and
`.cache/provider-probe-rpc-candidate/build-receipt.json`.

### Direct invocation result and cleanup

Source `cfbcb2a5f3116ece4fa21ce4dc6967f842290e68` was deployed at 17:11:54 UTC.
Downloaded code matched the prepared hash. Version
`b4755a77-5835-4de5-84ea-c548d755294c` belonged to deployment
`18d6f30e-b729-4b32-bca8-017dd393ad9b`; the application was
`0772425387194d20804b5222688b8f26`. Both public URL flags were false and no
domain or scheduled trigger was deployed.

On Windows, `cf dev` failed with `spawn EFTYPE` before starting its backend.
The installed Wrangler 4.147.0 backend was launched directly with the same
`cloudflare.config.ts` and its documented experimental configuration mode. It
established the remote service binding; the local operator listened only on
127.0.0.1 and rejected browser-origin requests. No source or arbitrary command
could be submitted.

The direct RPC reached the deployed coordinator. Its first `engine-a` case failed
after 2,038 ms with `WORKER_FAILED`; the first failed native operation was
`monitor`, and Cloudflare returned internal-error reference
`3fp1nn0uot4akgi20vs4fdjs`. The VM was confirmed stopped and all later cases were
skipped. Repeating the RPC returned the exact retained result without another
job. No container instance remained. Numeric exec identity did not resolve the
failure; successful engine execution and isolation remain unqualified.

The local operator was stopped, then the exact cloud application, Worker and image
were removed. Follow-up reads returned 404 for the Worker and application, neither
trial namespace existed, and no matching registry image remained. CLI deletion
initially declined noninteractive confirmation despite returning exit code zero;
the operator detected this through readback and completed the authorized cleanup
using `--force`. Receipts: `.cache/provider-probe-trial-3/`.

Two jobs have now been attempted in total, leaving three of the original five-job
allowance. The four-case candidate must not be redeployed to a new coordinator:
doing so would exceed that remaining allowance. Further trials need a revised
bounded candidate and diagnosis of the startup failure, not a new run ID or an
automatic retry. No settled billing total or successful native hosting is claimed.

With explicit owner approval, the prepared P4 diagnostic was submitted to
Cloudflare as case `02363339`. The portal confirmed receipt. It includes the error
reference, time and runtime configuration, with no credentials, user assets or
attachments. No provider response has been received. The confirmation is retained
in `.cache/provider-probe-trial-3/support-case.json` and its screenshot.

## Browser account access continuation

PR #147's exact head `7f4e98ebc3691bf025e7ea712d8ef549c4d6a516` now has successful
engine/package, Linux/Windows gateway, installed image, seven-platform public
registry and website checks. The separate restricted-Docker native preflight still
fails. Neither this status nor the support case qualifies native hosting.

The separate `codex/v1-account-controls` branch adds real D1 browser sessions,
direct Google/GitHub account sign-in and browser logout. Callback adapters remain
shared with MCP authorization; direct account access does not invent an MCP client
or issue downstream tokens. Independent browser bindings, purpose/origin-separated
state hashes and atomic D1 consumption prevent stolen or concurrent callback reuse.
No upstream token reaches a browser cookie or asset service.

Session credentials are 256-bit random host cookies with only their SHA-256
verifiers retained. Primary-backed checks enforce account state/epoch, 30-minute
idle and 24-hour absolute expiry. Fresh sign-in rotates the current browser's
session; an eight-session account cap does not discard another device during a
rotation. The focused cap test exposed that ordering defect before its fix.
Logout requires the session's CSRF proof and exact Origin and leaves existing MCP
connections usable. Browser cookies and MCP tokens cannot substitute for one another.

The new cases were first observed failing, then fixed. The focused account and
authentication suite passes 43 tests; the complete hosted suite passes 138 tests,
all three hosted type configurations and five production bundles. Additional
adversarial cases cover expired intents, rollback, provider swapping, bounded
pending-login storage and same-browser concurrent replay. Receipts are in
`.cache/security-review-2026-10-06/browser-*.log` and `account-*.log`.

The root gate also passes 3,290 tests with two platform skips, typecheck and lint.
Two further failing-then-passing build tests ensure extracted provider/browser
modules cannot enter tenant or native bundles. Candidate secret scans are redacted;
no secrets were found in the staged source patch or rebuilt hosting bundles.

The account page has local desktop and 375px presentation evidence, with no
horizontal overflow and 44px sign-in buttons. Google's current pre-approved PNG
is embedded unmodified, avoiding external image/font/script requests; provenance
is recorded in `hosting/assets/README.md`. The preview uses only disposable local
fixture identities and is not evidence of live Google/GitHub authentication.

Provider linking/unlinking, purpose-bound sensitive-action reauthentication,
individual connection revocation, complete account/asset deletion, public admission
limits, privacy pages and deployed user flows remain open. A fresh OAuth callback
is not being presented as proof of a fresh password or MFA challenge. No production
deployment or npm publication occurred in this continuation.

## Startup research and current status refresh

The owner requested further documentation/community research before treating the
native error as a vendor blocker. The [startup review](2026-10-06-cloudflare-startup-review.md)
records the current API/SDK comparison, related public reports, limits of the
existing diagnostics and a smaller managed-image/custom-image sequence. No new
cloud execution, provider change or support message occurred in this review.

PR #149's exact `11a4f64` now passes both Linux and Windows hosted jobs in
[run 37507203413](https://github.com/instruktlabs/kiln/actions/runs/37507203413).
The working tree additionally implements primary-backed connection records,
single-use code activation, protected-request revocation checks and browser-bound
provider confirmation for disconnect. All 144 hosted tests and three TypeScript
configurations pass locally. These additions remain uncommitted and need their
remaining review/build/UI checks and CI; they are not deployed account controls.

A fresh public registry read still returns `next=1.0.0-rc.1` and
`latest=0.0.0-stage`. Stable publication and local distribution can proceed through
their own gates while native hosting is investigated. The support case is not a
reason to suspend independent work or to claim the rest of hosted v1 is complete.

## Managed-image startup control passed

The research-led minimal control now passes on Cloudflare. PR #150 source
`c6b119b4a6358d51c27406f6fb3e74cafd289782` uses documented Wrangler configuration,
an explicit private service binding and Cloudflare's managed Debian image. Its
fixed Node command returned the expected version/identity; output completed after
470 ms and awaited whole-instance cleanup after 573 ms. The provider instance API
also reported stopped with exit code zero. A repeat RPC returned the retained
result without starting a second job.

The tested bundle was compared with uploaded bytes before invocation. Public URLs
were disabled and no provider credentials, user assets or custom image were used.
After retaining evidence, the local operator, Container application, Worker and
namespace were removed; follow-up reads verified absence. Three of the five
approved trial jobs have now been attempted, leaving two. No additional support
message, production deployment or package publication occurred.

All 126 hosted tests on this isolated branch, its hosted typechecks/builds,
3,290 root tests (two platform skips), root typecheck/lint and redacted scans pass.
Both hosted CI platforms pass in run `37513405377`. The account-control branch's
separate uncommitted changes remain at 144 locally passing tests. The detailed
[startup review](2026-10-06-cloudflare-startup-review.md) records the receipt,
remaining custom-image/Kiln controls and unchanged hosted-launch requirements.

## Minimal custom-registry control passed

PR #150 source `2c605257b8990a3bb9c9f0fffb5a9abc45092bc3` passed the next private
control at 18:59:29 UTC. The official Node 24.20.0 Debian Trixie AMD64 image was
copied without changes to the private Cloudflare registry and selected through
the documented named-image binding. Deployed code/image/privacy readbacks passed.
The fixed command returned the expected version and identity, output completed
after 7,000 ms, and whole-instance cleanup after 7,102 ms. Provider state separately
confirmed stopped with exit code zero; replay returned the retained result.

All diagnostic cloud resources, its registry image and local operator were removed
with absence verified. Four of five approved trial jobs are now consumed; one
remains. Local gates include 129 hosted tests, all hosted builds/typechecks,
3,290 root tests (two platform skips), typecheck/lint and redacted scans. Both CI
platforms passed in run `37515318317`. The unchanged Kiln image without engine
imports is the next comparison; full hosted launch remains unqualified. The
detailed startup review records why image preparation is not a supported cause:
both this deployment and the earlier failed cf deployment reached image-ready.

## Original image startup isolated; initial trial exhausted

The final approved comparison at source `569fc5313f909c04ac960348b638e376cdb36239`
used the unchanged Kiln image with the successful minimal controller. Its fixed
Node command did not import Kiln. Deployed source, image and privacy checks passed,
but at 19:08:40 UTC the monitor failed after 1,242 ms before the controller entered
`exec`. Cleanup was confirmed after 1,243 ms, the provider instance list was empty,
and replay returned the retained failure. The app, Worker, namespace, registry
image and local operator were removed, with absence verified.

All five original trial jobs are now attempted; no jobs remain. Further cloud
execution requires a separately prepared bounded candidate and owner approval.
Local image/startup analysis and independent npm/account work continue. The failure
is now isolated from package evaluation, but its exact cause remains unproven.
Current checks pass 131 hosted tests, hosted typechecks/builds, root typecheck/lint,
dry run and redacted scans. Hosted CI run: `37516547552`. The full engine suite was
already green on the preceding candidate; this change touched only the diagnostic.

## Stable candidate and manifest comparison prepared

The separate managed worktree `kiln-stable-release` prepares stable 1.0.0 from
current main `8d14d0e`. PR #151 at `2cb3d864eaced99cbd56c5e7dfb8d8a92773ec31`
contains release identities, minimal packaged installation/migration corrections,
targeted dependency patches, secret-file ignores and the RC publication receipt.
It excludes native execution and account-controls changes. Its detailed candidate
record lives at `docs/reviews/2026-10-06-stable-package-candidate.md` on that branch.

Local final gates pass: 3,290 engine tests with two platform skips; coverage at
95.16% functions and 92.50% lines; root types/lint/toolchain/skills; 78 renderer
tests; 91 hosted foundation tests/types/builds; a clean Windows Node 22.23.3/npm
12.2.0 archive installation with SDK/CLI/MCP/local-plugin checks; and the complete
prepared website build. The first coverage run's Windows rename EPERM is retained;
a focused retry and the final full run pass without a source change. Root, hosted
and installed runtime audits report no known vulnerabilities. The optional agent
lockfile now resolves the patched MCP SDK 1.32.1. Extracted package and source
secret scans pass. No stable version was staged or published and nothing deployed.

The local archive digest is `6ed3d6b9964429f14c3c6a0a6a13d56be509dd0f40b07061a37d491f901c1508`.
This archive is not a substitute for the exact main-CI archive in the release
runbook. PR CI is running; owner-approved merge, main qualification, staging and
owner promotion still follow. The broad README/Troy/site refresh remains deferred.

In parallel, local inspection verified the original Container image's runtime
manifest and unchanged layers. Cloudflare's builder omits provenance by default;
selecting the existing platform manifest directly tests that format difference.
PR #150 at `29fc0ac248f59aa1d8c6f6ca89160c85d266e8ca` prepares exactly one fixed
private job. All 133 local hosted tests, types/builds, root types/lint, deployment
dry run and source/actual-bundle scans pass. Its hosted CI run is `37520300880`.
No new cloud execution is authorized yet. The original five-job allowance remains
exhausted; the new candidate needs a separate owner decision, with its exact image,
60-second deadline, cleanup, privacy settings and $1 allowance documented in
`hosting/probe/MANIFEST_STARTUP.md`.

## Private renderer and request-tree integration

Stable npm 1.0.0 and the GitHub v1.0.0 release are now published; their separate
release receipts remain authoritative for package acceptance. Draft PR #153
continues hosted integration. Its preceding commit `6fca99d` passes all eighteen
CI checks. The new private renderer/controller work below needs its own fresh CI
and has not been deployed.

The coordinator now injects a bounded private `PbrRenderPort`. It sends exact GLB
bytes and view options to a fixed renderer route; the response must match the
request ID, GLB digest, camera values, dimensions and renderer class. Published
engine code retains PNG validation, capture deadlines and truthful CPU fallback.
Tests demonstrate full-material views on success and geometry-only fallback when
the port fails. No published package or public tool schema was changed.

The fixed one-shot rendering entry validates requests and self-contained GLBs
before graphics initialization and explicitly selects the software Vulkan ICD.
Its private `KilnRenderJob` shares the evaluator's durable one-use lifecycle,
deadline, cancellation fence, recovery and verified whole-VM destruction. The
parent registers a third host-owned interceptor and persists each child ID and
kind before dispatch. Renders and evaluations share one active-child allowance
and eight total children. Recovery routes cancellation through the recorded kind;
unknown cleanup retains the parent reservation and suppresses its response.

All 261 hosted tests, three hosted typechecks, twelve production bundles and root
typecheck/lint pass locally. New behavior was tested failing before implementation.
Adversarial checks cover forged response identity, caller authority, request/output
limits, failed PNGs, cancellation, late response disposal, shared child limits,
cleanup failure and recovery. A real local workerd loopback/RPC fixture verifies
renderer routing through host-selected request props, cancellation acknowledgement
and denial after parent closure and eviction. These are local guarantees, not
evidence of provider isolation or complete hosted acceptance.

The exact installed renderer image
`sha256:64022900f0c298668076db054c44e019dad6a3813751a92dec7a06ceb734fe24`
passes its real entry/port fixture under offline local Docker with two CPUs and
4 GiB memory. Eight decoded 128px PNGs preserve textured materials across three
backdrops, a beauty image and an explicit camera. Malformed input is rejected
before device startup. The rebuilt coordinator image
`sha256:029c4fba6f0521a5a18c9dde364d07b5ffc076fe4d988358868950de40134b66`
passes readiness, current/legacy MCP, hostile-header denial and failure without
private services. Both install the exact published stable archive, retain their
dependency inventories and remove their local test containers. Procedures and
receipt paths are in [the image guide](../../hosting/container/README.md).

The thirty-second render deadline is a candidate setting informed by the earlier
13,286 ms fixed provider fixture, not a measured production SLO. No additional
cloud upload, execution or public route was enabled. All 22 previously approved
cloud jobs remain consumed. The next provider trial must qualify the integrated
admission/coordinator/interceptor/evaluation/render/storage path with a concrete
bounded approval. Account lifecycle, live identity-provider setup, material
storage, browser downloads, representative load/costs, production deployment and
directory submissions remain open. The broad README/Troy/site refresh remains
deferred to launch closeout.

## Progress checkpoint after stable publication

The npm registry reports `latest: 1.0.0` and `next: 1.0.0-rc.1`; the public
[GitHub release](https://github.com/instruktlabs/kiln/releases/tag/v1.0.0) is
published. Stable package acceptance and installed local plugin checks are complete.
The hosted service and vendor directory submissions are not complete.

PR #153 at `382b40e` completed sixteen successful checks, including all twelve
engine/package jobs, Linux hosting, the installed MCP and CPU images, and the
website build. Two checks failed. The Windows admission fixture accidentally used
its `SHORT` Durable Object namespace binding as a boolean, applying a 250 ms
deadline to ordinary tests. A focused regression reproduced that mismatch before
the fixture flag was separated. All twelve admission tests then passed. Production
deadlines and admission policy are unchanged. The software image's actual rendering
checks passed; its artifact upload failed while opening a private build-cache file.
The evidence upload now excludes that cache and retains the receipts and images.
These corrections require fresh CI before the candidate can be accepted.

Local preparation of the integrated trial covers render, save, reopen, source,
export, saved GLB/manifest reads, cross-account denial and quota rejection. The
current working tree passes 268 hosted tests, all three hosted typechecks and all
twelve production bundles. That total includes trial work not yet committed or
provider-qualified. The local-only trial builder passes the installed Cloudflare
output schemas; no image upload, deployment or cloud execution has occurred.
It caps coordinator starts at nine, evaluator starts at four and renderer starts
at four, with sequential requests, durable one-use allowance and cleanup checks.
Its full worker integration and exact-source CI must pass before approval is sought.

No owner authentication step is currently pending. The next concrete owner action
is approval of the prepared integrated provider trial, followed later by live
provider credential handoffs and qualified merge/deployment/submission candidates.
All 22 previously approved trial jobs remain consumed. Routine implementation and
local validation can continue without a new decision.

Remaining launch work includes account link/unlink/delete, material storage,
browser download tickets, live Google/GitHub sign-in, retention verification,
representative load/cost evidence, operating alerts and rollback, production
deployment and verification, and separate vendor submission receipts. Saved-build
provenance also needs a host-verified evaluator identity: the current native host
does not inject one, so the SDK can report `source-development:unverified` in a
saved manifest. A successful round trip alone must not qualify that provenance.
The broad README, Troy images and site-content refresh remains deferred until
the final hosted behavior is verified, as requested.

## Integrated provider candidate prepared

The fixed ten-step sequence is prepared in
[the integrated trial record](../../hosting/probe/INTEGRATED.md): nine admitted
MCP requests plus quota rejection, with a durable ceiling of seventeen VM starts.
The actual private Worker, admission service, diagnostic allowance and R2 evidence
path now pass local workerd tests, including replay after durable-object eviction
and a stop issued before the trial. The complete fixed lifecycle also passes the
actual MCP adapter with a fresh host per request and real local tenant storage.
The generated deployment is schema-validated and checked for private-only routing,
fixed budgets, disabled Container logs/SSH and immutable image references.

The eviction test found a real early-failure defect: native startup rejection
could leave its inbound RPC request body unread, retaining the admission caller's
execution context. Closing an unused body in the production request boundary
fixes the demonstrated failure. The diagnostic budget boundary now does the same
when denying work; its focused cancellation regression also failed before the fix.
These changes do not alter the published SDK or immutable installed images.

All 270 hosted tests passed before the added deployment-configuration check, which
also passes. Hosted types/builds, lint and redacted source/bundle scans pass. The
preceding CI corrections have passed both hosted platforms and all image jobs;
this new candidate still requires its own exact-source CI. No cloud upload or
deployment has occurred, and the earlier twenty-two-job allowance remains spent.
The proposed separate trial allowance is $1; owner approval will be requested only
after the candidate checks pass. Live OAuth, provenance, account lifecycle,
downloads, production operations and vendor submissions remain separate open work.

## Owner progress checkpoint: package published, hosted integration open

Live readback confirms npm `latest` is `1.0.0` and the public GitHub `v1.0.0`
release contains the matching archive and checksum. PR #153 at `c755434` now
passes all eighteen CI checks, including both hosted platforms, all three
installed images, the twelve engine/package jobs and the website build. The PR
remains a draft; passing these checks does not qualify a public hosted launch.

The separate $1 private integration trial at that exact commit is prepared and
awaiting the owner's answer to the existing approval question. No new upload,
provisioning or trial execution has occurred. All twenty-two earlier approved
jobs remain consumed. No owner authentication step is currently pending.

Independent download work adds a tenant-local ticket store and six adversarial
tests. The current working tree passes all three hosted typechecks and all 277
hosted tests. Tests cover account separation, hashed tickets, expiry during a
read, revision deletion, concurrent transfer limits and bounded ticket issuance.
This foundation is still uncommitted and is not yet connected to the browser
gateway or MCP download URLs; it is not a completed download feature.

The remaining milestones are the integrated provider trial; browser downloads,
material persistence, account link/unlink/delete and verified saved-build
identity; live Google/GitHub configuration and sign-in; retention, representative
load/costs, alerts and rollback; an approved production deployment with real client
verification; separate directory submissions; and the deferred README/Troy/site
refresh. Existing provider trials establish native execution and software-render
feasibility, not completion of this integrated service.

## Private download flow integrated locally

The native MCP host now supplies download URLs through the published engine's
existing hook. Exact saved revisions receive ten-minute, hashed, tenant-local
tickets with atomic issuance/transfer limits. Browser requests derive their tenant
from the current primary-backed session, require the owning account, and recheck
revocation after storage awaits. No credentials are passed to storage or native
compute, and browser downloads start no VM. Deleted revisions and expired tickets
cannot release bytes, including when deletion or expiry interleaves with a read.

The existing branded sign-in page handles anonymous download navigation. Both
providers resume a strictly validated server-retained relative path. The additive
`0007_browser_login_return.sql` migration defaults existing transactions to the
account page; callback parameters cannot retarget the redirect. The page was
visually inspected in the local in-app browser. Its presentation-only listener
was stopped afterward; no real provider or credentials were used for that preview.

Focused tests first demonstrated missing ticket routing, missing native links,
the dispatch allowlist denial and rejected sign-in continuation. The completed
local gates pass all 286 hosted tests, three hosted typechecks, twelve production
bundles, root lint, diff checks and redacted source/bundle secret scans. The actual
MCP save/reopen output is exercised through the real browser gateway, D1 sessions,
SQLite tenant index and R2 with two fixture accounts. GLB hashes, exact source,
manifest identity and PNG signatures agree; hostile routes, foreign embedding,
cross-account reads, callback replay and revoked browser sessions are denied.
Provider exchanges remain mocked, so these checks do not claim live OAuth.

The rebuilt native coordinator uses the exact public 1.0.0 archive and unchanged
dependency lock. Image
`sha256:2f85a87cb48e360e9de3994d898413695a87c11b3d9f39f466fbf9d88c090d34`
passes the six offline Docker checks; its test container was removed and absence
read back. Evidence is under `.cache/native-host-download/qualification/`.
This image and the changed gateway/storage code require their own CI/provider
qualification. The pending private trial remains pinned to `c755434` and its
retained original bundle/images. No cloud resources were created or changed.

Account lifecycle, material persistence, saved-build identity, live OAuth,
representative operations/cost evidence, production deployment and vendor
submissions remain open. The root README/Troy/site refresh remains deferred.

## Durable material storage foundation and progress checkpoint

Fresh registry/release readback still confirms public npm `latest: 1.0.0` and the
non-prerelease GitHub `v1.0.0` archive/checksum. The download integration at
`72a3b61` passes seventeen CI checks, including both hosted platforms and all
three installed images; the Linux engine gate remains running at this checkpoint.
No completed check has failed. PR #153 remains a draft and is not a hosted launch.

The new native material adapter and tenant index pass nine focused tests and the
complete 295-test hosted suite. All three typechecks, thirteen production bundles,
root lint, whitespace checks and redacted source/bundle scans pass. Storage reuses
artifact quotas and immutable pins; verification imports the published SDK's
material contract. Tests cover persistence after host replacement and tenant
eviction, cross-account denial, concurrent identical imports, mutation of caller
buffers, corruption, quota exhaustion, paging and partial/lost-acknowledgement
failures. The first corruption-batch fixture reused the same material identity,
so duplicate validation correctly rejected it before hash validation. Giving the
corrupt second fixture a distinct valid identity now tests the intended integrity
boundary; duplicate rejection remains separately checked.

The material adapter is not yet connected to native MCP, asset imports or workspace
dependency binding. No material tool is advertised yet. This is local storage
evidence, not installed-image or Cloudflare material qualification.

The private integrated Cloudflare candidate still awaits the existing owner
approval question for a separate $1 allowance. Its retained Worker hash remains
`3ff536d4e99b8ee348d2a55e5a0de58ca04895643f53ccba4a68cf5ee570312a`;
the later download/material changes have not replaced that candidate. No cloud
resources were provisioned or run. All twenty-two earlier authorized jobs remain
consumed, and no owner authentication step is currently pending.

Remaining work is material integration, account link/unlink/delete, saved-build
identity, live Google/GitHub setup and end-to-end sign-in, integrated provider
qualification, retention/load/cost evidence, operating alerts and rollback, public
deployment with real clients, vendor directory submissions, and the deferred
README/Troy/site refresh. Independent implementation can continue while awaiting
the private trial decision.

## Material library connected to hosted MCP

The storage-foundation commit `7a85ba2` was pushed after the preceding download
commit `72a3b61` completed all eighteen CI checks. The native MCP host now injects
the durable material library and a standalone async workspace binding through
published SDK interfaces. Assets also receive the library so copying/importing a
saved revision restores its embedded editable material closure. Edge metadata is
regenerated from the same registry: fifteen hosted tools, including `kiln_material`,
with the engine's existing dependency-selection schema on authoring operations.
Hosted project/review stores remain unavailable and are not advertised.

Focused failing tests first demonstrated the missing material tool, workspace
binding and dispatch routes. The implementation now passes the complete 301-test
hosted suite, all three typechecks, thirteen production builds, root lint and
redacted source/bundle scans. A further extension to the passing material lifecycle
test also passes: delete the live material entry, import a saved asset into another
collection, confirm exact material restoration and byte-identical GLB delivery,
then render again. Overlapping and nested bindings, explicit standalone reset,
bad locks/paths, oversized pin sets, identity-swapped records and cross-account
denial before evaluation are covered. No provider credentials or actual cloud
execution were involved in these local tests.

Coordinator image
`sha256:b31f2395c43610c1cf2d2630cde3d130ce24a973a83fece6c0722d3ec3a9c599`
uses the exact stable npm archive and unchanged dependency lock. Its eight offline
Docker checks pass, including the registry's material-binding schema and preset
discovery from the installed package. The named test container was removed;
receipts are under `.cache/native-host-materials/qualification/`. The image still
requires exact-source CI and provider qualification. The separately reviewed
`c755434` integration trial retains its original bundle and images.

The owner requested decisions through the question tool and then explicitly
approved the frozen `c755434` private trial with the same nine-request,
seventeen-start limits and separate $1 allowance. That approval covers the original
candidate only, not the newer material/download changes. Account lifecycle,
verified saved-build identity, live sign-in, operational
qualification, public deployment, submissions and the final documentation refresh
remain open; the overall goal remains active.

## Approved integrated Cloudflare trial passed and was removed

The owner's separate $1 allowance was used for the exact frozen `c755434`
candidate. All ten checks passed: material-faithful rendering, save, restore,
exact source retrieval, export, GLB and manifest reads, denial of another
account's source/GLB reads, and quota rejection before another VM starts.
Nine admitted MCP requests used thirteen fresh VMs: nine coordinators, two
evaluators and two software renderers, within the approved seventeen-start
ceiling. This run is complete; its unused allowance is not permission for a new
candidate or a replay that allocates new VMs.

The deployed Worker SHA-256 matched
`3ff536d4e99b8ee348d2a55e5a0de58ca04895643f53ccba4a68cf5ee570312a`.
Both image manifests matched the reviewed immutable digests. Worker URLs,
preview URLs and public routes were disabled; bindings, limits, image references,
Container SSH/logging and all seven SQLite namespaces were verified by API.

The initial `cf 1.0.0-beta.12` deployment failed locally because its converter
serialized the Worker's own Durable Object bindings as external `script_name`
references, which Container deployment rejects. Wrangler `4.147.0` deployed the
same prebuilt bytes after removing only those seven explicit self-references.
The generated probe now also emits this equivalent `wrangler.json`; its regression
test first failed on the missing output and then passed. No dependency was patched
and no code, image, quota or routing change was made to the approved trial.

The long-lived local operator RPC returned 502 after approximately 81 seconds.
The durable run continued and finished successfully. Reading its persisted status
recovered all results without restarting the sequence; calling the completed run
returned the identical record and left the thirteen budget claims unchanged.
This transport interruption remains recorded and must inform the next operator
implementation. It is not a successful long-lived client-connection claim.

Every retained response hash was verified. Saved GLB/source/preview sizes and
hashes match the manifest. Both the in-loop image and saved six-view preview were
visually inspected: checker texture and reflective blue sphere are present.
The saved preview names the exact saved GLB and reports full material fidelity
without fallback. The run measured approximately 39.9 seconds for initial render,
35.6 seconds for save, and 3.6-4.5 seconds for subsequent admitted reads/restore/
export. These are one small sequential fixture's end-to-end times, not a load
benchmark or an estimate for every asset. Settled billing remains unknown.

Provider readback confirmed all thirteen instances stopped. Cleanup removed the
three Container applications, Worker, seven namespaces, fifteen objects,
temporary bucket and both uploaded image tags; subsequent API reads verified
their absence. The local operator was stopped and its listener disappeared.
The checked-in [receipt](2026-10-06-hosted-integration-receipt.json) records hashes,
timings, limits, replay behavior and cleanup. Raw responses, provider snapshots
and image/GLB evidence remain under `.cache/integrated-trial/`.

The newer download/material implementation at `8775750` separately passed all
eighteen CI checks. It was not substituted into this cloud trial. Hosted launch
still requires qualification of those changes, host-owned saved-build identity
(this trial correctly retains `source-development:unverified`), account lifecycle,
live Google/GitHub sign-in, retention/load/cost and operating checks, production
approval and real client verification. Directory submissions and the deferred
README/Troy/site refresh remain open. No further owner action is needed for the
completed trial; ordinary implementation continues under the active release goal.

The configuration correction passes all 301 hosted tests, three typechecks,
thirteen production builds, root lint, redacted source/record scans and an actual
Wrangler no-bundle dry run. It changes local preparation only and has not been
used for another cloud deployment. The published npm package remains unchanged.

## Host-owned saved-build identity implemented and tested locally

New Container evaluations now acquire image identity at the outside controller.
The controller associates only the exact output returned after image inspection,
process completion and verified whole-VM cleanup with the selected immutable
image. Its private HTTP response carries the digest; it never accepts an identity
from request fields or evaluator stdout. The coordinator requires that header,
validates the normal SDK response, and binds the digest to that exact accepted
result. Overlapping responses have independent state.

Each admitted MCP request has a bounded proof map keyed by exact source and GLB
hashes. The new-save adapter requires a matching entry and replaces the draft's
engine claim with `cloudflare-container:sha256:<digest>`. Missing proof, altered
source/output, conflicting identities and excessive retained entries fail closed.
Saved code/GLB bytes are snapshotted before storage awaits. Imports retain their
original metadata and do not acquire a claim from this host. The digest identifies
the complete pinned evaluator image; this does not sign arbitrary imported
provenance or retroactively qualify historical records.

Focused regressions failed before implementation at the controller, transport,
asset-save and actual MCP boundaries. All 308 hosted tests now pass, including
fresh storage reads after reconnect, imports with original provenance, refusal
before storage writes and overlapping evaluation identities. All three hosted
typechecks, thirteen production bundles and root lint pass. The public SDK and
npm package are unchanged; these changes belong to the private hosting package.

The strengthened offline image check failed against the previous material image
because it had no identity contract. Rebuilt coordinator image
`sha256:d78f29a8565e2df4957f60607ee25645bff81e8221bc75b56b2992d7e17d4482`
passes all ten installed-image checks against the exact stable archive and the
unchanged dependency lock. The native MCP bundle SHA-256 is
`331ced56fab784f24ebaad644354f423d585a6346f22957d17dd9925c1e6d8f2`.
Both uniquely named test containers were removed. Receipts and inventories are
under `.cache/native-host-identity/`; this image has not been uploaded or deployed.

The prior `c755434` trial remains valid for its recorded scope and still accurately
records its unverified saved engine field. The new controller/coordinator pair,
downloads and material changes need their own exact-source CI and provider
qualification. Update the evaluation controller before the coordinator because
the new coordinator deliberately rejects old responses without identity.
Account link/unlink/delete, live OAuth, operating and load evidence, approved
public deployment, vendor submissions and deferred public documentation remain
open. No additional cloud spend or user authentication was used for this work.

## Explicit Google/GitHub linking and unlinking locally qualified

The gateway now has separate, purpose-bound identity-change flows. Linking first
confirms an already-linked provider, then validates the new provider in a separate
one-use, browser-bound phase. Unlinking verifies the provider that will remain.
The unique provider constraint and atomic final mutation prevent account merges,
last-login removal and concurrent unlink races. Account ownership and the tenant
namespace remain unchanged. Every successful change records account activity,
increments the authorization epoch and revokes browser sessions together. Old MCP
access and refresh credentials are denied by the existing primary authority.

Regression tests failed on the absent route before implementation. All 317 hosted
tests pass, including both link directions, foreign-account refusal, same-session
binding, replay/races, cancellation/expiry, rollback on event-write failure and
state changes during the provider exchange. Three hosted typechecks, thirteen
production builds, root lint and redacted source/bundle scans pass. A local
presentation-only fixture was inspected at the normal browser width and a 375px
viewport, including linked-method controls, activity and completion messaging.
The mobile controls have separated touch targets and no horizontal overflow.
The fixture uses synthetic identities, does no external I/O, and proves layout
only. Screenshot: `.cache/security-review-2026-10-06/account-identity-controls-mobile.jpg`.

Apply additive migration `0008_identity_actions.sql` before the gateway, after
checking existing per-account provider uniqueness. Rollback preserves committed
identity changes and account epochs. The private native image does not change.
Live sign-in and real provider confirmation remain unqualified, as do full account
deletion and production operation. This work was not deployed or merged to main.

Current OWASP, NIST federation, Google/GitHub and D1 documentation were checked.
Provider selection/confirmation can reuse an upstream session and does not prove
a fresh password/MFA challenge. The current notices are in-app only. A sequenced
owner question is pending about collecting a verified security contact email and
sending out-of-band identity-change/deletion notices through Cloudflare. This is
separate from email-based sign-in, which remains deferred; no scopes, live email
configuration or mail delivery were changed. Cloudflare's documented Workers Paid
allowance is 3,000 outbound messages per account/month, then $0.35 per 1,000. Actual
sender-domain readiness and delivery still need qualification if adopted.

Sources:
[OWASP federation linking](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#secure-federated-account-linking),
[NIST federation](https://pages.nist.gov/800-63-4/sp800-63c.html),
[Cloudflare Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/).

## Compute and storage retirement locally qualified

Added private account-retirement primitives, with no public deletion form or
gateway lifecycle route yet. Compute retirement records a permanent tenant deny,
marks any admitted job closing and requires verified whole-request cancellation.
Failure retains admission capacity and recovery intent. Eviction or global
pause/resume cannot reopen the account. Only that tenant's quota history is
removed; global counters still account for its admitted work.

Storage retirement denies further operations, revokes download tickets, removes
saved metadata and purges only that tenant's R2 prefix. Batches and retry alarms
bound cleanup. Outstanding uploads retain durable write evidence until the put
settles or matching committed immutable bytes establish its completion. Neither
a timeout nor an empty listing proves that an unresolved write is cancelled.
Unknown outcomes after a crash remain pending with a daily recovery alarm and
require escalation if they cannot be resolved. Verified purge requires an empty
prefix, no artifact rows and no unresolved writes, then removes its alarm while
retaining the small denial record.

Focused tests first reproduced two races: ordinary maintenance removed an
unresolved write's metadata, and an older sweep recreated maintenance state after
purge. Both are fixed and covered, alongside delayed writes, failed deletion,
lost acknowledgement, eviction, account isolation, 105-object bounded cleanup,
hostile retirement requests and refusal from the native storage interceptor.
Further red/green cases enforce atomic download-ticket revocation and ensure a
batch of unresolved writes cannot starve ordinary expiry of other files.
All 331 hosted tests, three hosted typechecks, thirteen production builds and
root lint pass locally. The npm package/native image is unchanged. No cloud
trial, resource creation or deployment occurred for this change.

The full deletion flow still needs purpose-bound owner confirmation, primary-D1
revocation and durable retry orchestration, identity/token cleanup, truthful user
status, and provider qualification. Deploy retirement-aware compute/storage
before connecting that controller; rollback must not restore code that ignores
retirement after accepting deletions. Provider backup retention and unresolved
write escalation also remain operational launch work. The pending security-email
decision is unchanged.

Current references:
[R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/),
[R2 durability](https://developers.cloudflare.com/r2/reference/durability/),
[Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

## Account deletion controller and user flow locally qualified

The gateway now connects explicit account-page confirmation to durable cleanup.
A separate five-minute provider flow binds the browser, account epoch and linked
identity. Confirmation atomically creates a primary-D1 job, revokes account
access and removes browser sessions. Cleanup proceeds through compute retirement,
private storage purge, OAuth-helper grant revocation and final identity/account
erasure. Leases, deadlines and retry backoff prevent concurrent or delayed work
from falsely advancing another claim. Failure keeps access disabled and the
receipt pending. The completed receipt retains no account link and expires after
seven days. The receipt secret exists only in an HttpOnly cookie; its database
value is hashed.

All 349 hosted tests pass, along with three hosted typechecks, thirteen production
builds, root lint and redacted source/bundle secret scans. Focused regressions
failed before implementation. The real gateway/D1/OAuth-helper/private-tenant/R2
fixture now exercises deletion of saved work, denial of old credentials,
preservation of another account and a new empty account on subsequent sign-in.
Provider identity exchanges are mocked and the fixture starts no native VM.
Additional cases cover enqueue/final-erasure rollback, wrong identities, hostile
forms, callback replay/races, epoch/session changes during provider I/O,
bounded intents, expired/replaced leases, cleanup failures and delayed completion.
The deadline fixture observes the real 20-second timeout and records the later
completion in the originating request context before checking that the job did
not advance. This avoids mistaking workerd's cancellation of a cross-request
promise for proof about late completion. Test-only controls are absent from all
thirteen production bundles.

Desktop and 375px browser previews show the confirmation and pending/completed
receipt pages without horizontal overflow, using synthetic data only. Screenshots
are under `.cache/security-review-2026-10-06/account-deletion-*.png`. The local
preview server was stopped and its listener absence verified.

Apply additive migration `0009_account_deletion.sql` before the gateway and
retirement-aware compute/storage before accepting deletions. The scheduled
handler is implemented but no deployed Cron Trigger has been configured. Verify
recurring recovery, stalled-job escalation and real account deletion on the next
approved combined-service qualification. Rollback must preserve retirement and
primary revocation. Completion concerns active application storage, not immediate
erasure of provider backups or eventually consistent OAuth KV records. In-flight
authorized token writes can outlive inventory cleanup but primary account state
denies their use; configured access/refresh expiry remains 15 minutes/30 days.
Public retention disclosures and restore procedures remain launch gates.

The preceding head `1e609b3` passed all eighteen CI checks. This change has only
the local results above until its own exact-head CI finishes. It does not change
the published npm archive or native image. No additional paid run, deployment,
live credential creation or email delivery occurred. The security-email owner
decision remains pending; the prepared Google client form is still unsubmitted.

References checked:
[D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
[Worker scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/),
[KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

## Complete hosted deployment preparation

Added an offline candidate builder for the actual six production Workers: gateway,
tenant storage, admission, native request, evaluation and rendering. It builds
each entrypoint with its production dependency boundary, checks required exports,
copies the numbered D1 migrations and hashes every configuration, bundle and
migration. The input accepts only non-secret resource identifiers, pinned
account-owned image digests and bounded numeric policies. Provider credential
values are neither accepted nor copied; only the gateway declares the four
required secret names. Output is fresh, local and never overwrites prior evidence.

The prepared gateway has no public route, workers.dev endpoint or preview URL.
Its every-minute deletion-recovery trigger is explicit but has not been deployed.
Only the tenant Worker owns the R2 binding; only the gateway owns account D1 and
OAuth KV. Gateway compute access uses `KilnCompute`, never its operator export.
Cross-service DO bindings retain their target script, while self bindings use the
local form required by the previously observed cf beta conversion issue.
Invocation logs, persistent traces, Container logs and SSH are disabled; sanitized
operational monitoring and ingress-abuse controls remain required before launch.

Five new configuration/preparation tests failed before implementation and now
pass. All 354 hosted tests, three hosted typechecks, thirteen production builds,
root lint and redacted preparation-source/generated-output scans pass locally.
Wrangler 4.147.0 successfully dry-ran all six generated no-bundle configurations.
Those dry runs used synthetic account/resource IDs and image digests; they establish
local configuration validity, not remote resource existence or execution.
Evidence is under `.cache/hosted-deployment-dryrun-v1/`, the final hashed receipt
under `.cache/hosted-deployment-dryrun-v2/`, and six adjacent dry-run logs. No cloud
resource, secret, trigger, route or image was created by this work.

CI on preceding deletion head `5d91f2f` initially failed the existing Windows
resilience-probe HTTP-denial request with `TypeError: fetch failed`. The focused
test passed locally, and the unchanged failed-job rerun passed on Windows. The
cause is not established; no test was weakened or automatically retried in code.
Seventeen of eighteen checks have passed; the root Linux community-exporter step
is still running at this checkpoint. New preparation changes require their own CI.

The [deployment guide](../../hosting/DEPLOYMENT.md) records the dependency order,
secret/migration requirements, recovery verification and remaining launch gates.
The example manifest deliberately contains invalid identifiers and qualification
policy examples, not public quota decisions. Actual resource ownership, image
identity, live OAuth, combined provider qualification, monitoring/load/costs,
retention/rollback and an approved public route remain unfinished. The unanswered
security-email question and unsubmitted Google client form are unchanged.

## Request abuse limits locally qualified

The gateway now requires separate edge and authenticated-account rate-limit
bindings. Fixed route classes bound anonymous work before OAuth, D1 or body
processing. Verified permanent account IDs select hashed counters shared across
MCP clients, bearer tokens and browser downloads before storage or compute. No
IP, credential, source or arbitrary URL enters those keys. Exhaustion returns
429 with a 60-second retry suggestion; missing, failing, malformed or stalled
bindings fail closed with 503. An unread rejected body is cancelled.

The offline deployment manifest now requires distinct positive integer namespace
IDs and per-minute thresholds, emitted only on the gateway. Verify account-wide
namespace uniqueness before deployment. Example thresholds are 600 requests per
route class and 120 per account, for qualification planning only. Cloudflare
documents these counters as approximate and local to each location; durable
global/tenant compute quotas remain unchanged. Coarse ingress exhaustion can
temporarily affect all users of a route class in that location. Provider/load
qualification must assess that tradeoff; no exact request or billing cap is
claimed, and rejected requests still invoke the Worker.

Focused limiter and deployment regressions failed before implementation. All
363 hosted tests, three typechecks, thirteen production builds and root lint
pass locally. Integration tests use real local rate-limit bindings to exhaust
ingress and share an account budget across MCP and browser downloads while
leaving another account usable. Separate forbidden-I/O fixtures prove rejected
registration, token, callback, account, MCP and download requests never reach
OAuth/database work; denied accounts never reach storage or native compute.
The limiter deadline test observes the real one-second timeout. Ordinary auth
and storage tests retain real bindings with generous fixture limits.

Redacted source and six-worker candidate bundle scans found no leaks. The
changed gateway configuration passed a Wrangler 4.147.0 no-bundle dry run with
synthetic resource IDs and images. Evidence is under
`.cache/hosted-deployment-rate-limits/` and `.cache/request-limits-*.log`; its
receipt correctly records a dirty checkout and is not a release receipt.
No provider resource, credential, threshold, route or image was deployed.
Seventeen of eighteen checks on preceding head `293affa` have passed; the root
Linux check is still running. The new change needs its own CI.

Live OAuth, the pending security-email decision, sanitized operational alerts,
updated combined-provider qualification, load/costs, backup retention/rollback
and public-launch approval remain outstanding. The Google client form remains
unsubmitted. The earlier private trial allowance is consumed and was not reused.

Reference checked:
[Cloudflare rate-limit configuration, locality and accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Sanitized operational observations and alert candidates

The gateway now writes explicit Analytics Engine points for HTTP response class,
status and handler elapsed time, plus scheduled deletion and compute health. No
request/response object, body, arbitrary URL, IP, account ID, token, download
capability or exception enters a point. Fixed indexes separate HTTP from the two
health streams. Persistent request logs and traces remain disabled.

Deletion health queries primary D1 with indexed phase selection, reporting pending
count, oldest age and jobs at least fifteen minutes old. A narrow private compute
RPC exposes existing aggregate admission state without pause control or tenant
identifiers. Both reads have independent two-second deadlines; unavailable data
is marked explicitly with `-1` values, not zero. Scheduled recovery emits both
components even after a failure and fails the invocation when recovery or either
component is unavailable. A telemetry write failure does not change access,
returned bytes or cleanup; external missing-heartbeat detection is required.

The complete deployment binds only the gateway to its derived operations dataset
and hashes `monitoring-candidate.json`. Six proposed Cloudflare Custom Alerts
cover missing recovery/compute heartbeats, overdue deletion, persistent cleanup,
HTTP errors and request rejections. They contain the exact account/dataset,
one-minute evaluation and five-minute windows with hourly repeat proposals.
They are not enabled and have no destination. Queries use the newer Analytics SQL
API dialect, whose sampling rules differ from the legacy Analytics Engine API.
Live catalog access, query validation, thresholds and notification delivery remain
unverified. [OPERATIONS.md](../../hosting/OPERATIONS.md) records the schema,
limitations, retention, volume assumptions and deployment qualification steps.

Focused observation and deployment regressions failed before implementation.
All 373 hosted tests, three typechecks, thirteen production builds and root lint
pass locally. Real local D1, gateway and scheduled-handler fixtures establish
empty/pending/completed aggregate behavior, secret-free fields, independent
component failures and unaffected HTTP responses when telemetry fails. The
read-only compute RPC test verifies unchanged admission and continued denial of
public/operator access. A stalled read exercises the actual two-second timeout.
Local tests do not establish remote Analytics Engine ingestion, SQL acceptance,
sampling or alert delivery.

Redacted source and generated-candidate scans found no leaks. Wrangler 4.147.0
dry-ran the changed gateway with its Analytics Engine binding. Evidence is under
`.cache/hosted-deployment-operations/` and `.cache/operations-*.log`; synthetic
IDs/images and the dirty-checkout receipt are not release qualification. No cloud
resource, dataset point, alert, email, credential or paid trial was created.

CI on preceding head `71347d6` passed sixteen checks but the Windows hosted run
failed its existing chunked-body test with `TypeError: fetch failed`, before the
413 assertion. The root Windows check was still running at that checkpoint.
The exact hosted failure log is retained locally and one unchanged failed-job
rerun was requested. Cause and rerun outcome are not yet established; assertions
and retry behavior in the suite are unchanged. This monitoring change requires
its own CI. The pending owner security-email decision and prepared, unsubmitted
Google client form remain unchanged.

The unchanged Windows hosted rerun subsequently passed (run `37561702455`,
attempt 2). Current upstream workerd issue
[#7634](https://github.com/cloudflare/workerd/issues/7634) describes Windows
connection resets after early responses through service bindings, and related
workers-sdk issue [#15709](https://github.com/cloudflare/workers-sdk/issues/15709)
covers oversized-body cancellation. These reports are consistent with the local
failure shape, not proof of its precise cause or of deployed behavior. No drain,
automatic retry or relaxed assertion was introduced. Live gateway qualification
must include early 401/413/429 responses to streamed bodies and subsequent normal
requests, confirming client-visible errors and continued service availability.

References checked:
[Analytics Engine writing](https://developers.cloudflare.com/analytics/analytics-engine/get-started/),
[retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/),
[pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/),
[Custom Alerts](https://developers.cloudflare.com/notifications/notification-available/#custom-alerts-beta),
[Analytics SQL datasets](https://developers.cloudflare.com/analytics/sql-api/datasets/).

## Combined-service gateway preflight locally qualified

The next private trial now has a reusable gateway preflight component. Its local
fixture builds all six production Worker entrypoints and derives service, D1,
KV, R2, rate-limit and DO links from the deployment configuration. It registers
declared DO namespaces using Miniflare's local representation; remote namespace
ownership, Container images, Cron and Analytics Engine remain unqualified.

Thirteen fixed checks cover metadata, real helper-issued OAuth grants and PKCE
exchange, edge tool discovery, anonymous and oversized-body denial, exact bearer
and browser downloads, foreign-account denial, primary connection revocation,
denial of retained access/refresh credentials and preservation of another account.
Admission is paused through its real private operator RPC before setup and stays
paused afterward. No step invokes native tooling or starts a VM. Fixtures bypass
upstream identity verification and seed routing-test files directly; this is not
evidence of provider consent, engine save, rendering or validated asset contents.

The helper requires an explicit private-fixture mode and fixed `.invalid` origin.
Existing account, OAuth or artifact data causes refusal before provisioning.
A transaction claims the run once. Concurrent calls and terminal replay cannot
create additional accounts or retry a failed sequence. The receipt contains only
stage outcomes and pause state; credentials, identifiers, download capabilities,
source and exception details stay out of it. An intentionally misbound gateway
database fails at synthetic authorization and replay leaves that partial state
unchanged. No HTTP route or provider-deployable operator was added.

All 379 hosted tests pass, including six new preflight cases. Three typechecks,
thirteen production builds, root lint and redacted probe-source/bundle scans also pass.
The test preceded the implementation; local harness corrections then registered
export-owned namespaces and serialized RPC receipts for deterministic comparison.
Production dependency checks exclude every test/probe helper from all bundles.
Evidence is under `.cache/gateway-preflight-*.log`. All eighteen CI checks on
preceding head `e421455` now pass; this change needs its own exact-source CI.

[GATEWAY_PREFLIGHT.md](../../hosting/probe/GATEWAY_PREFLIGHT.md) states the scope
and remaining work: a bounded private operator and updated native/material/image
phase, explicit VM/evidence budgets, complete cleanup, then renewed trial approval.
Live OAuth/account actions/deletion, real scheduled recovery, retention, load,
costs, alerts and public-client behavior remain launch gates. No cloud resource,
provider credential, public route, paid run or email was created. The existing
security-email decision remains pending and the Google client form unsubmitted.

## Security notice decision and native lifecycle component

The owner selected **in-app notices only for v1**. This supersedes the pending
security-email question above. The plan's D10 and hosting guide now record that no
separate security contact email, additional email scopes or outbound security mail
will be added to v1. Google/GitHub sign-in remains unchanged. The next sequenced
browser approval is creating the prepared Google web client with the sole callback
`https://kiln.instruktlabs.com/oauth/google/callback`; the form remains unsubmitted.

All eighteen CI checks passed on `dd33b5a`. The next native trial now has a locally
qualified lifecycle runner and independent durable allowance. Twenty-one fixed
stages cover material creation, fresh-host rendering/save/restore/source/export,
GLB/manifest reads, exact browser download contents, account isolation, material
closure restoration after removing the disposable live material, rerender and
quota rejection. The actual engine fixture observes fourteen admitted MCP calls,
three evaluations and three synthetic view calls; the fifteenth MCP call is denied.
Manifest acceptance requires the exact evaluator-image identity. Local synthetic
views do not qualify software Vulkan fidelity or cloud VM behavior.

The proposed private allowance caps coordinator/evaluation/render starts at 14/4/4,
22 total, once connected to diagnostic wrappers. It is transactional and one-use;
failed starts cannot be refunded, and closing before opening forbids any later run.
The old trial and its consumed allowance remain unchanged. No new paid execution,
cloud resources, image upload or public route was created.

The lifecycle uses fixed request/control deadlines, an 8 MiB response ceiling,
64 MiB aggregate evidence ceiling, stop-on-failure, and terminal allowance closure
with paused/idle admission verification. A retained interrupted record cannot
resume or recreate the run. Raw synthetic response evidence stays private; public
receipts exclude credentials, URLs, source and exception details. Paused/idle
admission is not a cloud-resource-deletion receipt.

Focused failing tests preceded implementation. Adversarial replays of real engine
responses exposed weaknesses in the new trial's initial acceptance checks: it
missed JSON-escaped source in an error and trusted download denial status without
checking for leaked content. Both checks were corrected. Replays now reject those
leaks, leaked material data, modified GLB downloads and unverified engine identity.
Other tests exercise concurrent allowance claims, reconstruction, invalid inputs,
oversized responses and the actual ten-second stalled-evidence deadline; late
completion cannot resume the failed sequence.

All 385 hosted tests, three typechecks, thirteen production builds, root lint and
redacted probe-source/bundle scans pass locally. Logs are under
`.cache/lifecycle-*.log`. [NATIVE_LIFECYCLE.md](../../hosting/probe/NATIVE_LIFECYCLE.md)
records scope and limitations. Wiring the unchanged production gateway/tenant/
admission services to diagnostic budget wrappers, the private operator, exact
image/config verification and full cleanup is next; only then is another paid
trial ready for approval. Live OAuth, account actions/deletion, scheduled recovery,
retention, load/costs, alerts and actual public-client verification remain open.

## Combined private operator and deployment candidate

The native lifecycle and gateway preflight are now connected through a fixed private
operator. It creates fresh grants for the same two synthetic accounts only after
the preflight passes, opens the separate durable allowance, then sends every native
request and browser download through the production gateway. Three wrappers add
only startup claims around the production native jobs; gateway, tenant and admission
implementations stay unchanged. The combined local test passes gateway checks,
stops at the first missing VM, seals admission and retains its failure receipt.
It does not pretend to qualify successful cloud native execution.

The private allowance has its own Worker to eliminate a circular deployment
dependency. The resulting eight roles have a tested order in which every dependency
precedes its caller. The gateway omits provider secrets and Cron in this private
candidate. All eight disable public routes, workers.dev, preview URLs and persisted
logs/traces. The generic production preparation path retains its no-probe guard.
The new `--private-lifecycle` path validates fixed quotas/origin/names and hashes
eight separate bundles/configurations plus nine migrations. Unexpected helpers and
native identity-provider dependencies cause rejection; output cannot overwrite an
existing candidate.

Operator controls include a 15-minute terminal alarm, one-minute recovery when
cleanup remains unknown or non-idle, and status with explicit alarm/stop state.
The startup ceiling remains 14/4/4, 22 total, with no refunds. Local tests cover
concurrent invocation, failed preflight, stop before identity creation, body
cancellation at all three closed native wrappers, eviction/replay and uncertain
cleanup retaining its alarm. These do not prove remote alarm delivery.

An eviction test exposed retained RPC capabilities in the initial diagnostic
operator. Explicit disposal of control-call promises/results and copying plain
receipt values fixes it; the same eviction/replay assertion now passes. The Workers
type configuration includes the standard disposable declarations used by this code.
This follows [Cloudflare RPC lifetime guidance](https://developers.cloudflare.com/workers/runtime-apis/rpc/lifecycle/).
The initial default HTTP service binding also incorrectly named the `default`
entrypoint; omitting the named-entrypoint field now reaches the actual gateway as
documented for [HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/).

All 394 hosted tests, three typechecks, thirteen production builds, root lint and
redacted source/bundle scans pass. All eight generated Wrangler 4.147.0 configurations
pass no-bundle dry runs using synthetic IDs. The fixture candidate and logs are in
`.cache/lifecycle-preview-final-13af43d`; its source was intentionally dirty while
preparing the change, and it is not an approved deployment artifact. All eighteen CI
checks passed on preceding commit `13af43d`; this new source needs its own CI.

No Cloudflare resources, image uploads, paid starts or provider credentials were
created. In-app security notices remain the settled v1 choice; Google client
creation remains pending owner confirmation. Next steps are a clean candidate,
exact image verification, a fresh private observer, concrete resource/readback and
cleanup qualification, then a sequenced trial allowance. Live OAuth/deletion,
scheduled recovery, retention/load/costs/alerts, production publication and directory
submissions remain incomplete. Root README/Troy/site refresh remains deferred.

## Native deadline classification corrected after Linux CI

The Linux hosted job on `602700e` failed one of 394 tests: a native response
interrupted by its deadline timer returned cancellation (499) instead of timeout
(504). A deterministic regression reproduces that result when the deadline timer
fires while the wall clock still reads one millisecond before the deadline. The
controller now retains the timer-expiry cause, so catch handling reports timeout
without relying solely on a second wall-clock read. Cancellation, late-response
discard and whole-instance cleanup remain enforced. The original real-timer test
and all its assertions remain in place.

The new test failed before the fix; all 21 request-controller tests and the full
395 hosted tests now pass locally, along with three typechecks, thirteen production
builds and root lint. Logs are `.cache/request-deadline-*.log`. This changes the
request Worker, not the installed native images. A fresh branch CI run is required.

Read-only Cloudflare inventory confirms the fixed `kiln-private-lifecycle-v1` names
are absent across Workers, Durable Objects, D1, KV, R2 and Container applications.
There are no Container applications or registry images currently in this account.
The existing local coordinator and software-image IDs still match their retained
qualification receipts. Inventory receipt: `.cache/lifecycle-readonly-inventory-refreshed/receipt.json`.
These observations authorize no resource creation or paid starts; image upload,
remote configuration readback, a fresh observer and verified teardown remain trial
preparation work. Google client creation remains the pending owner approval.
