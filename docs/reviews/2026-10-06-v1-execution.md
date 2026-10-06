# Kiln 1.0 execution record

Started 6 October 2026 by the owner's active goal. Working checkout:
`C:/Users/Mattm/X/kiln-oss`, branch `codex/v1-publication`, initial source
`65ce2f815a70ca3bdf8ad4fa1f8bf52d5fd08581`.

The [publication plan](../plans/2026-10-05-v1-publication-plan.md) defines scope;
[hosting economics](../plans/2026-10-06-hosting-economics.md) records assumptions.
This record tracks evidence, not release acceptance by implication. Community
contributions remain outside this cycle. No package or production service is
published yet.

## Deliverables and evidence

| ID | Requirement | State and required proof |
| --- | --- | --- |
| P0 | Preserve publisher/repository setup | Complete in [publisher setup receipt](2026-10-06-publisher-setup.md); current checkout remote verified `instruktlabs/kiln` |
| P1 | Public API, stability and migrations | In progress: all 55 public entrypoints classified in the SDK guide, experimental/re-export and deprecated-alias boundaries explicit, Discovery labels visible; final release freeze and target-version upgrade proof remain open |
| P2 | Compiled ESM SDK and declarations | In progress: corrected 53-entry core qualification includes dependency-free arena; all 55 imports/declarations pass in fresh optional-peer installations at current and declared-minimum versions; final-version and platform evidence remain open |
| P3 | Package identity, contents, executables and notices | In progress: unpublished `@instruktlabs/kiln@1.0.0-rc.1`, aligned engine/plugin identities, MCP launcher, consumer doc allowlist and dependency notices; fresh RC archive checks pass locally, final release audit remains open |
| P4 | Clean installs and workspace upgrades | In progress: RC package passed all platform CI jobs; official 0.10.0-to-RC upgrades pass for Claude/Codex workspaces with conflict refusal, reapplied customizations and byte-exact old assets; final-version harness checks remain open |
| P5 | Release automation and npm publication | In progress: manual exact-archive workflow and owner runbook; GitHub npm-release environment created with sole owner review, no admin bypass and protected branches; live npm trust, staging approval, registry provenance and fresh registry install remain open |
| H1 | Native Cloudflare qualification | In progress: Linux image built, Trixie software renderer passes six textured views; Docker namespace probe fails closed, Bubblewrap launch-argument defect corrected; real Cloudflare isolation/execution, RSS, startup and measured cost remain pending |
| H2 | Authenticated MCP and tenant boundary | In progress: separate hosted Worker implements OAuth consent/PKCE, audience/scope checks and verified-subject tenant routing; local workerd tests cover two identities, reconnects and forged tenant headers; real sign-in, tenant engine/storage reference checks and evaluator environment isolation remain open |
| H3 | Artifact lifecycle | In progress: tenant SQLite/R2 bytes, ProgramStore and native AssetLibrary, atomic quotas/revision pins, material closures, authenticated downloads, deletion and seven-day unsaved retention pass local workerd and actual-engine checks; standalone MaterialLibrary, native dispatch, browser tickets, account deletion and deployed lifecycle proof remain open |
| H4 | Capacity and operations | Pending: quotas/admission/cancellation, logs without credentials, load/cost measurements, alerts, health/build identity and rollback |
| H5 | Production deployment | Pending: approved deployment at `kiln.instruktlabs.com`; live authenticated create/edit/render/save/download/reconnect flow |
| L1 | Local Claude Code and Codex plugins | In progress: both remote Git catalogs and real versioned caches qualified; actual development-to-RC plugin updates preserve pinned workspaces until explicit runtime upgrade, saved assets remain byte-exact and native clients discover one server; final registry/tag distribution and final-version upgrade remain open |
| L2 | Public OpenAI plugin | Pending: compliant ZIP, verified publisher/domain, working MCP, privacy/support pages, review cases/video/account, submission receipt |
| L3 | Anthropic directory | Pending: owned marketplace publication, final source path, account eligibility, reviewer materials and submission receipt |
| V1 | Exact candidate verification | In progress: development builds have pinned local and CI evidence; final RC/version archive and target-host flows remain open |
| V2 | Release documentation and receipts | Pending: changelog/migrations/install/support/security/privacy/runbook; exact commits, hashes, versions, URLs and separate vendor-review state |

## Execution notes

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

## Owner handoffs

Cloudflare CLI consent is pending. The default 474-permission request was not
approved. A replacement requested 22 permissions covering profile/account/zone
reads and Workers, Containers, R2, D1, routes and observability. The owner was shown
the exact browser consent page; its five-minute device window expired before
completion. Renew the flow when the owner is available, preserving that scope.
No account-wide credential or API token provisioning scope was requested.

Local npm login, publisher verification and final external approvals will be
surfaced when a concrete candidate needs them. Missing human steps do not block
independent package work.
