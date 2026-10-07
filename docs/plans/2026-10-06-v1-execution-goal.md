# Kiln release-cycle execution goal

**Superseded scope, 7 October 2026:** the owner now prioritizes the public package,
README/site refresh, Troy imagery and blind clone/npm dogfooding. Hosted deployment
and directory submission are deferred to another agent after a tested private-main
handoff. Use the [current public release goal](2026-10-07-public-release-goal.md).
The earlier goal below is retained as historical decision context, not a requirement
to finish hosting before public work.

Updated 7 October 2026 for the owner's public-engine/private-hosting decision.
The existing goal remains active with the accepted public/private split. This text
records that goal and its current completion boundaries; it does not create a
second goal. The owner separately approved
GitHub Team at $4/month for one seat, billed monthly. The owner completed the
upgrade, and GitHub's organization API now verifies `plan.name: team`, `seats: 1`
and `filled_seats: 1`.

Stable `@instruktlabs/kiln@1.0.0` and the GitHub release are already published.
Reuse the completed GitHub transfer, npm security/trusted-publishing setup,
Cloudflare subscriptions, the completed GitHub Team upgrade and existing OAuth
applications. Do not repeat that work.
The private import (private PR #1) and normal public cleanup (public PR #157)
are now merged with owner approval. Their approved trees are preserved exactly,
and superseded release PRs #154/#155/#156 are closed. The remaining engine API,
onboarding and hosted launch work continue under this same goal.
Current evidence and unfinished tasks are in the
[release status](../reviews/2026-10-07-release-status.md).

## Earlier goal statement (superseded by the public release goal)

Complete this Kiln release cycle with a public, community-maintained engine and
integrations, an independently buildable private hosted application under Instrukt
Labs, a working authenticated Cloudflare service, and the applicable OpenAI and
Anthropic directory submissions. Use the
`docs/plans/2026-10-07-private-hosting-separation.md` migration scope, the existing
publication plan and hosting economics, and my subsequent decisions. Preserve the
full end state; migration alone does not complete this goal.

Work from `C:/Users/Mattm/X/kiln-oss` and the separate private application checkout
at `C:/Users/Mattm/X/kiln-hosted`. Preserve the reviewed hosting source,
tests, origin and evidence in `instruktlabs/kiln-hosted`. Keep it able to install, build and
test from a clean checkout with explicit pinned engine dependencies, with no
adjacent developer checkout or unpublished local files required. Keep reusable
engine contracts public and derive MCP metadata from the shared registry.

Use the already-active GitHub Team organization plan to protect the private
repository's `main` branch with pull requests, required passing checks and
protection against force pushes and deletion. Verify the rules through readback
and a controlled check. Keep build/test CI free of production credentials and
track private Actions usage against its included allowance. Team does not provide
required environment reviewers in private repositories, so production deployment
remains an explicitly approved operator action. The public npm release workflow
retains its existing protected environment. There is no private branch within the
public engine repository; repository visibility and branch protection are separate.

Then remove `hosting/` and private-service-only CI from the public default branch
through a reviewed cleanup PR. Relocate public plugin manifests, skills and
connection documentation first, and retain generic evaluator tests. Preserve
repository identity, stars, forks, issues, PRs, releases, redirects and my personal
pin. Use a normal deletion/relocation PR and preserve public Git history and
existing license notices. The owner accepts the old hosting source remaining in
history; do not rewrite commits, force-push or remove historical release tags.
Reconcile our open release PRs without losing their
work. Incoming community PRs remain outside this cycle's scope.

Reuse the published 1.0.0 package. Finish and publish the appropriately versioned
follow-up needed for shared setup in existing projects and new workspaces, and
the already-developed fixes. Verify actual installed Claude Code and Codex flows,
preservation of users' files and settings, and agent-agnostic local MCP/skills.
Local use remains account-free. Never replace an already-published version.

Finish qualification and deploy the private application to `kiln.instruktlabs.com`
on Cloudflare. Prove real Google and GitHub sign-in, account controls, tenant
isolation, native evaluation, CPU/software rendering, saved assets, downloads,
retention/deletion, quotas, practical load/cost limits and rollback. Keep saved
assets until deleted within quotas; expire unsaved work after seven days. Use
in-app security notices. Use provider database recovery and tested code rollback;
disclose that deleted source/GLB files cannot be recovered. Automatic asset backups
are outside v1, as the owner selected on 7 October. Complete an adversarial review of the actual release and deployed
configuration; secrets and user data stay outside source repositories.

Keep hosted use free within quotas, with optional sponsorship and no user billing.
Optimize initial hosting toward $20/month without treating it as a hard cap.
Surface exact subscription costs, bounded trial spending and material increases
before purchase or execution; reuse existing Cloudflare plans. Record the separate
GitHub Team development subscription at $4/month for one seat before tax or
metered usage. Monthly billing is settled; do not buy another plan or seat by
default.

After verifying the service, complete the public README, Troy imagery, site and
installation documentation. Review the complete directory dossiers with me,
including Kiln naming, Instrukt Labs publisher ownership, supported clients and
skills. Then submit the applicable OpenAI and Anthropic candidates once authorized.
Track vendor review separately from submission; do not claim pending review as
acceptance. Preserve my hold on further Claude portal changes or outreach until
the concrete dossier is aligned.

Target the migration and remaining controllable engineering within the next
focused day. Use the current implementation and passing evidence, make only the
boundary changes and demonstrated fixes needed to finish, and avoid adding
general frameworks, unrelated features or repetitive validation. Run checks
affected by changes and required final release gates. Surface concrete blockers
early; timing never substitutes for working behavior or security.

Use `codex/` branches and preserve unrelated changes. Continue authorized local
implementation and tested commits/pushes needed for CI. Reuse the already-created
private remote. Sequence remaining paid trials, main merges, publication, production deployment and
submission approvals against concrete candidates. Put authentication in the
browser and decisions in the question tool; never request secrets in chat. Do not
repeat settled decisions. Continue independent work while awaiting owner steps.

Finish only when private-repository independence and public cleanup, package/local
plugin publication, real hosted operation, current public documentation and
directory submissions each have direct evidence. Report exact versions, source
commits, URLs and relevant artifact hashes, with any external review still pending.

## Completed private-repository checkpoint

The private repository is created and [PR #1](https://github.com/instruktlabs/kiln-hosted/pull/1)
is merged with owner approval as `e84d79f15d4c143e0855bf57ea1b5709e32dd165`.
Its tree matches approved `1d6bd74` exactly. All five CI checks passed, including
459 application tests on Linux and Windows; all 14 production modules matched
local and both CI builds. Main protections are configured and verified, with no
production secrets in repository Actions. Public cleanup is prepared locally and
still requires qualification and explicit merge approval.

The private app consumes published 1.0.0 independently. Its two documented
compatibility adapters still need supported public engine exports in the follow-up;
independent builds do not by themselves complete the long-term API boundary.

## Delivery order and acceptance

| Step | Completion evidence |
| --- | --- |
| 1. Preserve and extract hosting | Existing Team plan reused; private repository/permissions and branch-rule readback; reviewed source and attribution retained; secrets absent from import |
| 2. Make the private application independent | Fresh-checkout install/typecheck/test/build and private CI pass against recorded engine input; no sibling checkout required |
| 3. Clean the public default branch | Approved cleanup PR merged; `hosting/` absent; public plugins and generic evaluator checks retained; no private source copied into another public path or artifact |
| 4. Close package and local onboarding work | Qualified follow-up package and plugin artifacts published; real Claude Code and Codex existing/new-project flows verified |
| 5. Complete hosted qualification and launch | Real provider/account/storage/render/retention/rollback flows and scoped security/cost evidence; approved public deployment and actual MCP client verification |
| 6. Finish public docs and directory submissions | README/site show actual install and hosted behavior; owner-aligned submission receipts; vendor review tracked separately |

Current unanswered paid-trial/onboarding decisions remain unanswered. Recovery
scope is settled: provider database recovery and code rollback with disclosed
asset recovery limits; no automatic asset-backup system in this cycle.
Reconcile the frozen trial inputs with the repository move; do not silently swap
an approved artifact for a different candidate. The one-day target is an execution
priority, not a promise about owner availability or vendor turnaround.

## GitHub Team status and operating constraints

**Completed 7 October 2026:** the owner purchased the monthly Team upgrade.
Authenticated `gh api orgs/instruktlabs` independently returned `plan.name: team`,
`plan.seats: 1` and `plan.filled_seats: 1`. Checkout previously showed **Pay monthly**,
**one seat** and **$4/month** before tax or usage. The final invoice/tax amount was
not inspected. Billing address and payment data remain outside this repository.

GitHub advertises 3,000 included Actions minutes/month on Team. Track private CI
and artifact usage; the $4 base is not a cap on metered services or extra seats.
This development subscription is separate from the Cloudflare hosting target.
Legal business name is verified as **Instrukt Labs, LLC**, Virginia SCC entity
11834137; public publisher branding remains **Instrukt Labs**.

Team does **not** provide required environment reviewers for private repositories.
Keep v1 deployment as an explicitly approved operator action with production
credentials outside build/test CI; do not promise Enterprise-only gates or buy
Enterprise just to reproduce the public npm environment. The public npm release
workflow and its existing approvals remain in the public engine repository.

Sources checked 7 October 2026:

- [GitHub pricing](https://github.com/pricing)
- [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [License users](https://docs.github.com/en/billing/reference/github-license-users)
- [Deployment environment restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Virginia SCC entity 11834137](https://cis.scc.virginia.gov/EntitySearch/BusinessInformation?businessId=11834137)
