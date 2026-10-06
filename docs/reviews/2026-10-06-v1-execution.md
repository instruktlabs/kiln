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
| P1 | Public API, stability and migrations | In progress: audit all existing exports; document stable/experimental contracts and Node compatibility |
| P2 | Compiled ESM SDK and declarations | In progress: compiled all 55 exports; clean Windows package passes 52 core imports, consumer declarations without optional peers and subprocess render; cross-platform CI and isolated evaluator path remain open |
| P3 | Package identity, contents, executables and notices | In progress: unpublished `@instruktlabs/kiln@1.0.0-dev.0`, public metadata, MCP launcher, consumer doc allowlist and dependency notice refresh; Windows archive checks pass, CI remains required |
| P4 | Clean installs and workspace upgrades | Pending: Windows/Linux/macOS matrix, optional dependency absence, custom instructions and revisions preserved |
| P5 | Release automation and npm publication | Pending: qualified RC/final archive digests, protected trusted publishing, owner staging approval, registry provenance and fresh registry install |
| H1 | Native Cloudflare qualification | Pending: actual provider isolation probes, CPU/software Vulkan render, deadlines, RSS, startup and measured cost |
| H2 | Authenticated MCP and tenant boundary | Pending: OAuth, audience checks, user-scoped references/cache/storage, two-user negative tests, evaluator environment isolation |
| H3 | Artifact lifecycle | Pending: durable source/revisions/GLBs/materials, authorized downloads, deletion, saved quotas and seven-day unsaved retention |
| H4 | Capacity and operations | Pending: quotas/admission/cancellation, logs without credentials, load/cost measurements, alerts, health/build identity and rollback |
| H5 | Production deployment | Pending: approved deployment at `kiln.instruktlabs.com`; live authenticated create/edit/render/save/download/reconnect flow |
| L1 | Local Claude Code and Codex plugins | Pending: small pinned distributions, maintained skills, strict validation and actual cached installs in separate workspaces |
| L2 | Public OpenAI plugin | Pending: compliant ZIP, verified publisher/domain, working MCP, privacy/support pages, review cases/video/account, submission receipt |
| L3 | Anthropic directory | Pending: owned marketplace publication, final source path, account eligibility, reviewer materials and submission receipt |
| V1 | Exact candidate verification | Pending: pinned tools, full offline/coverage/render-service gates, rebuilt bundles, tarball consumer/platform and target-host flows |
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

These fixes require CI against the next commit. Passing adjacent jobs does not
qualify the failed jobs or the new package identity.
The current isolated evaluator still locates source TypeScript workers; its installed
compiled path needs qualification before any hosted acceptance claim.

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

### Hosting probe preparation

The new `cf` CLI (1.0.0-beta.12) runs under the pinned Node toolchain. Its read-only
account probe found an invalid inherited API token; ignoring that token only in the
probe process confirmed that a separate CLI login is needed. No token was printed
or changed. Browser login does not itself establish CLI access.
The Docker CLI is installed, but daemon/status checks timed out after starting
Docker Desktop. No local container execution has been qualified. Neither
local Docker nor package tests substitute for the required actual Cloudflare
isolation and rendering probe.

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
