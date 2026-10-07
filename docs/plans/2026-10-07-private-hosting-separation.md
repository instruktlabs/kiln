# Private hosted application boundary

7 October 2026. Owner decision: keep the Kiln engine/package and integrations
public; separate the official hosted application into a private Instrukt Labs
repository. The accepted release goal authorized its creation; the owner then
approved the verified private import's main merge. Public cleanup and deployment
remain separate approvals. The owner separately
approved and completed GitHub Team at $4/month for one seat, billed monthly.
The organization API independently verifies Team with one purchased/filled seat.

## Repository boundary

- Existing public repository: `instruktlabs/kiln`, preserving its identity,
  stars, issues, PRs, releases, history and MIT-licensed engine.
- Private repository: `instruktlabs/kiln-hosted`, matching the hosting
  package's existing name. Public product name remains **Kiln**.
- The private repository has its own protected `main` branch. Branch protection
  means merge rules; it does not mean hiding a branch inside the public repository.
- Local npm, CLI, MCP and Claude Code/Codex installation remain account-free.
- Official hosting continues to target Cloudflare and `kiln.instruktlabs.com`.
  Repository separation does not require moving the domain, OAuth apps, provider
  resources or user data. The public hosted service has not launched.

## Scope found in the current source

Inspected source: `f99f1b894cf8277077c0b1377fdc8a37a0990a28`.
`hosting/` contains 245 tracked files, including 59 files under `src`, 80 under
`test`, and 60 under `probe`. Most can be preserved rather than rewritten.
These are inventory counts, not estimates of how many files need behavior changes.

| Area | Destination and work |
| --- | --- |
| Hosted gateway, identities, accounts, tenant storage, admission and native dispatch | Private repository; preserve behavior and existing tests |
| Hosting migrations, container definitions, private probes, deployment and recovery tooling | Private repository; preserve origin and evidence references |
| Hosted gateway and native image workflows | Private CI, adapted to consume a pinned engine dependency |
| SDK, CLI, local MCP, skills and local plugins | Remain public |
| Generic SDK evaluator qualification in `scripts/hosting/` and `hosting-probe.yml` | Remain public despite their historical names; they exercise the published engine |
| Hosted plugin manifests, public skills and connection documentation now under `hosting/plugin/` | Remain publicly distributable; relocate to the public integration tree and separate packaging from private application internals |
| Operational records and launch qualification evidence | Future records private; retain sanitized public status and historical records without rewriting Git history |

The npm 1.0.0 package's `files` allowlist does not include `hosting/`. Moving
the hosting application therefore does not require replacing the published
archive or renaming the npm package.

## Work that makes this more than a folder move

The original hosted application imported engine source directly: program storage contracts,
Discovery and lexical indexing, input-error helpers and geometry metadata. Its
tests and metadata generator also import `dist/mcp-engine.mjs`, and native
TypeScript paths point at the sibling `lib` directory.

Use the existing `@instruktlabs/kiln/programs`, `discovery`, material-library,
evaluator and other appropriate public entries wherever sufficient. Review the
remaining gaps, especially a lightweight edge Discovery interface and in-process
MCP construction. Expose only reusable engine contracts; do not copy tool schemas
or add Cloudflare/account logic to the engine. Any new public API requires its
normal tests, documentation and package release qualification.

The private application now installs exactly `@instruktlabs/kiln@1.0.0` through
its own lockfile. Public exports cover most imports. Two explicit compatibility
adapters consume shipped files for the MCP host and browser-safe Discovery because
1.0.0 lacks those named public exports. These adapters check or pin the installed
package identity; they do not read an adjacent source checkout. Finish the boundary
with minimal supported engine exports in the qualified follow-up package, keeping
Cloudflare and account logic private.

## Migration sequence

1. Preserve a reviewed hosting snapshot and its source attribution, tests and
   relevant receipts locally. Record a file/hash manifest. No credentials or
   private user data enter the source import.
2. Create the authorized named private remote, verify private visibility and
   membership, then import the reviewed application. Retain existing MIT notices
   for imported code; this migration does not revoke prior licenses.
3. Make private builds/tests independent, pin the engine input, and adapt the two
   hosting workflows. Reuse the active Team subscription; configure and verify
   required PR/check rules and prevent force pushes/deletion on private `main`.
   Keep cloud credentials out of build/test CI, monitor private Actions usage,
   and use an explicitly approved operator deployment because Team does not
   include private environment required reviewers.
4. Qualify the extracted application and the public package boundary. Compare
   generated tool metadata and relevant outputs, run affected hosting and
   installed-package checks, and scan the private import and distributable
   outputs for secrets. Reuse unchanged prior runtime evidence; a move alone
   does not require recreating every paid trial.
5. Prepare one public cleanup PR to remove hosted implementation and private-only
   workflows from the current tree, retain public integration metadata and generic
   evaluator tests, and fix maintained links. Request main-merge approval only
   after the private copy and builds are verified.
6. Continue the existing hosted launch work in the private repository. Retention,
   live OAuth, rollback, cost/load qualification and launch approval remain open;
   repository separation does not satisfy those gates.

## Verified migration checkpoint

On 7 October, `C:/Users/Mattm/X/kiln-hosted` preserved the original hosting source,
notices, toolchain and workflows with a byte-matched SHA-256 inventory. The private
`migration/source-manifest.json` now contains 251 original-source records, including
the unchanged renderer smoke helper. Public integration metadata and its packager
remain public deliverables rather than private application code.

Private [PR #1](https://github.com/instruktlabs/kiln-hosted/pull/1), approved at
`1d6bd74339377fa8be9d697a292eaea0b95c16e7`, merged as
`e84d79f15d4c143e0855bf57ea1b5709e32dd165`. The merged tree exactly matches the
approved source. Local checks and both fresh CI platforms passed all 459 application
tests, typechecking and builds; all three native image checks also passed. All 14
production modules match byte-for-byte between local, Linux and Windows builds.
The redacted import secret scan passed. The repository is verified private, with
required PR/check rules enforced for administrators and force pushes/deletion
disabled. Build/test CI has no repository Actions secrets.

The public cleanup is prepared in an isolated worktree: remove `hosting/`,
`hosted-gateway.yml` and `container-image.yml`; relocate public metadata to
`plugins/kiln-hosted/` and its packager/tests to `scripts/`; retain generic engine
evaluator qualification. Plugin packaging passes with no hosting directory present.
Full public qualification and approval of the cleanup merge remain outstanding.
The public default branch has not been changed by this extraction.

## Public removal and history

The owner explicitly chose no history rewrite and accepts the old implementation
remaining in public history. Kiln itself stays public, preserving stars, forks,
issues, PRs, contributor history and releases in the existing repository.
Use a normal cleanup commit and PR; do not rewrite history, force-push, delete
release tags or change the public repository's visibility. Existing contributors
continue with the same repository and normal pulls. Preserve source attribution
and existing MIT notices. Future hosted implementation changes belong in the
private repository; historical public copies are not made confidential by removal.

This matches GitHub's documented [file deletion behavior](https://docs.github.com/en/repositories/working-with-files/managing-files/deleting-files-in-a-repository).
GitHub documents [history rewrite side effects](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository),
including changed commit hashes and disruption to pull requests and clones. This
migration has no requirement to incur those effects. A discovered credential
exposure would be handled separately by revocation/rotation and appropriate cleanup.

Before public cleanup, the repository API returned the unchanged public repository
ID `1278326592` (`R_kgDOTDG3QA`), default branch `main`, 244 stars and 19 forks.
Counts can grow while work continues; this is a preservation checkpoint, not a
requirement to freeze community activity. No community PR will be closed or edited
as part of the hosting removal.

## Existing release PRs and trials

- #153 is already merged; its public history remains intact.
- Preserve #154 and #155 source/evidence in the private migration before closing
  them as superseded. Do not merge further hosted implementation just to move it
  again. Their closure still requires the owner's authorization.
- #156 contains both public setup/isolation work and some hosted changes. Separate
  those paths so public work is retained without publishing future hosting work.
- Keep frozen private trial `37c962e` and onboarding candidate `76c869a` unchanged.
  Their unanswered spending/authentication handoffs remain separate. Reconcile
  their execution location and compare any affected bundle bytes before running;
  the repository decision does not authorize either trial.

## Complexity, limits and cost

This is a moderate repository/dependency migration, not a rewrite of hosting.
The owner set a target of completing the migration within a focused day in this
development cycle. Prioritize extraction, independent builds/tests and the public
cleanup; reuse existing code and qualification evidence. The main uncertainty is
the edge/MCP package boundary. Surface a concrete problem early if it threatens
that target rather than silently expanding the architecture. Owner/provider waits
and the remaining hosted launch work stay visible in the overall release goal.

The [updated execution goal](2026-10-06-v1-execution-goal.md) integrates this
migration into the full end state and records the completed GitHub Team upgrade.

Instrukt Labs now reports **GitHub Team**, one seat purchased and filled. The
owner completed the monthly upgrade after checkout showed a $4/month base before
tax/usage. This enables protection rules for branches in the separate private
repository. Private Actions usage has plan-dependent allowances; monitor it rather
than treating the subscription as an unlimited CI budget. Production deployment
access is not enabled by the plan upgrade. Sources checked 7 October:

- [Repository visibility](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories)
- [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)

Removing files from the public default branch does not erase old commits, public
PRs, forks or existing copies. Preserve public history and existing licenses;
do not claim retroactive confidentiality. This split protects future unpublished
hosting development. The separately authorized Team upgrade and private repository
import are complete. The existing public repository remains public; public cleanup
and the hosted launch are still pending.
