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
| P1 | Public API, stability and migrations | In progress: existing stability labels now visible in Discovery search/overview and installed CLI/MCP; full export stability audit and final migration contract remain open |
| P2 | Compiled ESM SDK and declarations | In progress: all 55 exports compile; development archives pass 52 core imports, declarations without optional peers and both worker layouts; exact runtime-fix CI passes all platforms, final version remains open |
| P3 | Package identity, contents, executables and notices | In progress: unpublished `@instruktlabs/kiln@1.0.0-dev.0`, public metadata, MCP launcher, consumer doc allowlist and dependency notice refresh; development archive checks pass locally and in CI, final release audit remains open |
| P4 | Clean installs and workspace upgrades | In progress: namespace package passes Windows/Linux/macOS and core checks without optional agent peers; target-release installed upgrades and harness workflows remain open |
| P5 | Release automation and npm publication | In progress: manual exact-archive verification/staging workflow and owner runbook; qualified RC/final digests, live protected trust, owner staging approval, registry provenance and fresh registry install remain open |
| H1 | Native Cloudflare qualification | Pending: actual provider isolation probes, CPU/software Vulkan render, deadlines, RSS, startup and measured cost |
| H2 | Authenticated MCP and tenant boundary | Pending: OAuth, audience checks, user-scoped references/cache/storage, two-user negative tests, evaluator environment isolation |
| H3 | Artifact lifecycle | Pending: durable source/revisions/GLBs/materials, authorized downloads, deletion, saved quotas and seven-day unsaved retention |
| H4 | Capacity and operations | Pending: quotas/admission/cancellation, logs without credentials, load/cost measurements, alerts, health/build identity and rollback |
| H5 | Production deployment | Pending: approved deployment at `kiln.instruktlabs.com`; live authenticated create/edit/render/save/download/reconnect flow |
| L1 | Local Claude Code and Codex plugins | In progress: persistent exact-version runtime/workspace bootstrap passes focused tests and a real development-archive probe; small distributions, maintained skill wiring, strict validation and actual harness-cached installs remain open |
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
