# Kiln release goal status

7 October 2026. This checkpoint distinguishes shipped work, private qualification
and remaining launch work. The dated research plan remains the scope record;
older statements within it are not the current execution status.

## New owner decision: private hosted application

The owner selected a separate private hosted application while keeping the engine
and integrations public. The [migration scope](../plans/2026-10-07-private-hosting-separation.md)
records the created private `instruktlabs/kiln-hosted` repository, dependency/CI
work, preservation of public history and the limits of removing already-published
code. Private PR #1 is now merged with owner approval. Further hosted-only
PR work belongs in that repository; the
existing trial approvals remain unanswered and are not supplied by this decision.

The PR sequence below predates this decision. #154/#155 should be preserved in the
private migration instead of proceeding through the earlier public merge sequence;
#156's public setup/isolation work must be separated from its hosted changes.
The owner requested an updated [execution goal](../plans/2026-10-06-v1-execution-goal.md)
covering the full cycle and a focused-day migration target. GitHub Team is the
approved plan for protection rules on the new private repository's branches.
There is no private branch inside the public repository. The owner selected
monthly billing and completed the upgrade. GitHub's organization API independently
confirms `plan.name: team`, `seats: 1`, `filled_seats: 1`; checkout showed $4/month
before tax/usage. The private remote is established; public cleanup is not merged.

The separate `C:/Users/Mattm/X/kiln-hosted` checkout records preserved source from
`f99f1b8`, with 251 original-source hash records. Private PR #1 at `1d6bd74`
merged as `e84d79f15d4c143e0855bf57ea1b5709e32dd165`; the merged tree is identical
to the approved candidate. Independent dependency resolution, typechecking, all
459 application tests and builds pass locally and on both CI platforms. All five
CI checks passed, including three native image checks; all 14 production modules
match across local/Linux/Windows builds. The import secret scan passed and private
main protections are verified. Two temporary installed-package adapters remain
documented follow-up API work.

The public cleanup candidate removes the hosting application and its two dedicated
workflows, relocates public plugin metadata/packaging, and retains generic engine
checks. It is being qualified in an isolated worktree; public main still contains
the old folder. The owner accepts historical source remaining visible: use a
normal cleanup PR without history rewriting, force pushes or release-tag removal.

## Completed

- GitHub Team upgrade for Instrukt Labs, monthly with one seat, completed by the
  owner and independently verified through the organization API. Private branch
  protection is configured on the separate private repository.
- The independent private application import is merged, with passing CI and
  source/output identity verified. This deploys no public service.
- GitHub transfer to `instruktlabs/kiln`, with repository/community preservation
  and the personal-profile pin checked. npm account/organization and publishing
  protections are established. Cloudflare Workers Paid and R2 Paid were already
  active; no new subscription purchase was required.
- Stable `@instruktlabs/kiln@1.0.0` is public under `latest`. Registry metadata was
  rechecked today. Normal install is `npm install @instruktlabs/kiln`. The public
  GitHub release is [Kiln 1.0.0](https://github.com/instruktlabs/kiln/releases/tag/v1.0.0),
  at source `fda71ac775750f25390b6ee30082ebc56463edc6`. Its archive digest is
  recorded in `.github/published-candidate.json`.
- The published SDK/CLI/MCP package has platform installation evidence. Local
  plugin foundations and isolated client discovery/protocol checks exist; this
  is distinct from completion of the newly selected existing-project onboarding.
- Private Cloudflare trials demonstrate native evaluation, software material
  rendering, persistence, downloads, account isolation, quotas and bounded VM
  cleanup. See the [deployed lifecycle receipt](2026-10-07-private-lifecycle-result.md).
  This is not a public-service launch or a load-capacity claim.
- Google and organization-owned GitHub OAuth clients exist. Their credentials
  are stored encrypted outside the repository; live hosted sign-in is unqualified.

## In progress

- Shared setup for existing projects and new workspaces is implemented locally.
  An installed candidate preserves owner files and reopens the same source,
  revision and exact GLB across Claude and Codex registrations. Full local tests
  and all twelve engine/package CI jobs pass at `225d74a`; seven installed
  receipts were independently checked against the exact CI archive.
  [Adoption evidence](2026-10-07-project-adoption.md) separates these results
  from actual client first-use conversations, which remain outstanding.
- Independent setup review found a copied-OpenCode migration defect and a
  plugin-helper adapter restriction. Both have focused regressions and fixes in
  the `1.1.0-dev.1` follow-up. Full local tests, coverage and an installed Windows
  archive pass. At `76c869a`, all twelve engine/package CI jobs pass and seven
  downloaded installation receipts verify against the exact CI archive. Real
  client onboarding remains outstanding; four isolated new/existing-project
  fixtures are prepared, with no model calls made.
  The exact plugin installs in isolated Claude/Codex profiles; Codex sees one
  setup skill alongside the fixture's existing skill and MCP server. The
  [bounded live onboarding plan](2026-10-07-local-onboarding-qualification.md)
  awaits its separate model allowance and isolated Codex-profile sign-in.
  This development version does not replace the published stable package.
  The newer `2087faa` archive has now passed all seven downloaded installation
  receipt checks, including project adoption, cross-client saved storage and six
  software-rendered views. The independently verified archive SHA-256 is
  `ce0d7e182705159d70daa19ab58e8fc063e81a8a43a8e4df203cfb1d88c2878f`.
  All twelve package CI jobs now pass at this exact source, including Linux and
  Windows full tests. These receipts do not replace the outstanding actual-client
  sessions.
- Hosted retention and scheduled deletion have a frozen private trial candidate.
  The maintenance gateway and recovery runbook have offline tests, including a
  state-preserving local transition, but need provider qualification.
- A private recovery verification component now checks actual saved bytes against
  current tenant metadata without storage writes. All 463 hosted tests, three
  hosting typechecks and repository lint pass. It has no production route, backup
  capture or restore implementation; full provider recovery remains a launch gate.
- Public pages, terms, account controls and directory bundles are prepared
  candidates. They have not been approved as a public service or submitted listing.
- Current package, plugin, fourteen rebuilt hosted modules and all 103 post-stable
  commits pass redacted secret scans at `2087faa`. The focused account-flow review
  identified no new defect in this pass. See the [security record](2026-10-06-v1-security-review.md#7-october-candidate-refresh);
  live provider sign-in, final image/configuration review and real-client behavior
  are still separate launch requirements.
- Recovery scope is awaiting owner alignment: the original plan requires rollback
  readiness, while the later checklist also adds broader backup and restore
  qualification. The pending decision distinguishes provider database recovery plus
  tested code rollback from a new source/GLB backup system. Until answered, the
  existing checklist remains in force; no new backup storage is provisioned.

## Execution focus after the owner progress review

The owner raised the elapsed time and asked whether process was displacing
delivery. The core native execution problem now has positive installed evidence;
all 27 checks at `2087faa` pass. The project is not waiting for another rerun of
that candidate. It still lacks actual-client onboarding, live hosted identity
flows, deployed retention/rollback proof and directory submissions.

Stop adding general recovery automation ahead of those flows. The newly started
gateway code-change helper test was removed before implementation or commit;
the documented rollback procedure and its required provider rehearsal remain.
The existing backup-scope question is an owner decision, not evidence that the
original plan required a new cross-store backup product.

Prioritize the prepared merge and trial handoffs, then test the integrated hosted
journey and fix only demonstrated launch defects. Keep frozen approval candidates
unchanged. Reuse passing exact-artifact evidence; rerun affected checks after
meaningful changes, not merely to refresh a status report. Consolidate the PR
queue after the approved foundational merge. Final docs and submission dossiers
follow functioning, verified user journeys.

## Remaining sequence

0. Qualify and approve the public cleanup PR after the verified private merge.
   Preserve public setup/isolation work and close superseded release PRs only
   after confirming their content and obtaining the owner's approval.
1. Finish shared setup qualification and exact package/plugin version selection.
   Published 1.0.0 cannot gain this new feature in place. Test actual onboarding
   in both advertised clients, then qualify and approve the new artifact.
2. Complete deployed retention/Cron, backup/restore and rollback qualification.
   Prove that recovery retains current revocations and saved bytes.
3. Complete real Google/GitHub sign-in and account actions, production Google
   audience/branding, monitoring, representative abuse/load/cost checks, and
   the final security review of the exact hosted candidate.
4. Approve the concrete deployment, launch `kiln.instruktlabs.com`, then verify
   public HTTPS and actual MCP client flows.
5. Review each directory dossier with the owner: visible name, installation ID,
   Instrukt Labs publisher ownership, supported clients, skills/tools, executable
   and privacy declarations, reviewer access and demo evidence. Claude-specific
   portal changes, naming changes, submissions and further outreach remain on
   hold for alignment. No directory submission has been completed.
6. Refresh public README, Troy imagery, site documentation and stale onboarding
   statements after hosted launch, as the owner requested. Track vendor review
   separately from successful submission.

## PR sequence and outstanding handoffs

Git ancestry and merged content were checked against current remote PR heads.
The owner approved #153 and closure of its three superseded PRs. There are now
three open release PRs:

| PR | Role | Disposition |
| --- | --- | --- |
| [#147](https://github.com/instruktlabs/kiln/pull/147) | Initial native execution | Closed as superseded after inclusion in #153 was verified |
| [#149](https://github.com/instruktlabs/kiln/pull/149) | Initial account controls | Closed as superseded; no separate merge needed |
| [#150](https://github.com/instruktlabs/kiln/pull/150) | Native startup/isolation qualification | Closed as superseded; no separate merge needed |
| [#153](https://github.com/instruktlabs/kiln/pull/153) | Integrated hosted foundation | Merged as `6f41a1a`; merged tree is identical to approved `39083d7`; main CI running |
| [#154](https://github.com/instruktlabs/kiln/pull/154) | Retention and scheduled recovery | Based on main; history reconciled at `7fc5bbb` without changing any file; frozen private trial still uses `37c962e` and awaits its separate $1 allowance |
| [#155](https://github.com/instruktlabs/kiln/pull/155) | Maintenance and recovery preparation | Review base is #154's branch; restore/provider evidence remains unfinished |
| [#156](https://github.com/instruktlabs/kiln/pull/156) | Shared setup and isolation fixes | Review base is #155's branch; all 27 checks pass at `2087faa`; actual onboarding remains |

GitHub requires linear main history. The merge-commit attempt was refused; the
approved squash merge was used without changing branch protections. Main's tree
`8547cb35133b6efe2a78b20a24f9873e8abb24ab` equals the approved source tree exactly.
Operations history was then reconciled using that verified common content;
`7fc5bbb` has the unchanged `37c962e` tree `7802a86fd2fdea78e8a57e0ecb9c16415d5aeec9`.
No history was force-pushed. The remaining PRs show successive changes for review;
each still needs explicit approval before its eventual main merge.

The hosted foundation merge deploys and publishes nothing. The pending retention
trial uses four private Workers with temporary D1/KV/R2, no VMs, provider secrets
or public route, with a bounded run and identity-checked cleanup. Earlier paid
trial allowances do not authorize it.

The [preflight alignment review](2026-10-07-native-preflight-alignment.md) records
the exact Docker/VM failures and distinguishes the optional nested SDK evaluator
from production's explicit Cloudflare fresh-VM adapter. Actual installed VM
qualification now passes at `5b1094c`: all ten readiness invariants, deterministic
GLBs, CPU preview, deadline/cancellation/output bounds and post-limit recovery.
Archive and artifact hashes were independently checked. Launcher, namespace,
environment and Khronos-validator compatibility fixes have regressions and rebuilt
bundles; the optional-adapter fixes remain unpublished. All 118 focused evaluator
and qualification tests pass; full exact-candidate package CI remains required.

The preserved Docker job still fails in that earlier run. Its replacement requires
explicit kernel-denial and evaluator-refusal evidence, no artifact, and the unchanged
trusted software-renderer fixture. At `2087faa`, both the positive VM and restricted
Docker/renderer jobs pass in run `37685410198`; the two exact archives and all eight
output artifact hashes were independently verified. Local full tests pass 3,353
tests with two skips; fifteen qualification tests cover the subsequent refusal
extension. All twelve package CI jobs now pass, including Linux and Windows full
tests and all installation jobs. Hosted gateway checks, public-registry install
checks, private image checks and the website build all pass at the same source:
27 checks total. No restriction is relaxed and no
failed positive probe automatically selects the refusal mode. Recovery commit `88ebe58`
separately passed hosted CI on Linux and Windows; provider restore remains unfinished.

No immediate authentication is required for the local implementation. Later
provider transitions and final publication/deployment actions will be surfaced
as concrete handoffs. The contributor's #140, #141 and #142 remain outside today's
scope for the owner to review separately. The public #153 merge and
#147/#149/#150 closures have been performed. Separately, private
`instruktlabs/kiln-hosted` PR #1 is merged with owner approval; public cleanup and
closures of #154/#155/#156 remain pending.
