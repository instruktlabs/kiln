# Kiln 1.0 execution goal

Prepared 6 October 2026. Status: activated by the owner's explicit goal on 6 October.
Track current progress in [the execution record](../reviews/2026-10-06-v1-execution.md).
The owner previously authorized the early transfer and npm setup separately:
the native transfer is complete with preservation verified, an Actions-policy
compatibility fix is applied with a passing Linux CI rerun, and the npm account/free
organization are created with two security keys and 2FA enforcement verified.
The local recovery backup is encrypted and verified, and its staging plaintext is
removed. Local npm CLI login remains unconfigured until publishing requires it.
Cloudflare's dashboard confirms Workers Paid and R2 Paid are already active;
no subscription purchase or upgrade was needed. Implementation is now underway on
`codex/v1-publication`, tracked in the execution record. No hosted production
deployment or npm release has been performed.

Use with the [full publication plan](2026-10-05-v1-publication-plan.md) and
[hosting economics](2026-10-06-hosting-economics.md). Current code, `AGENTS.md` and the
owner's subsequent instructions take precedence over dated planning observations.

## Copyable goal statement

Execute the entire Kiln Engine 1.0 publication plan in
`docs/plans/2026-10-05-v1-publication-plan.md`, using
`docs/plans/2026-10-06-hosting-economics.md` for hosting assumptions. Target sustained
overnight execution from the completed publisher setup. Work in
`C:/Users/Mattm/X/kiln-oss`; the sibling dogfood directory contains setup evidence,
not the release checkout. Keep every outcome in scope; do not call the goal complete until all
required work within our control has passed and its result is verified.

**First, confirm the completed setup and establish the v1 contract.** The existing
repository moved from `matthew-kissinger/kiln` to `instruktlabs/kiln` with identity,
history, stars, watchers, forks, issues, PRs and releases preserved. Read the transfer
receipts and current status; do not repeat the transfer. Verify the completed
Actions-policy fix and its CI result, operational access and publishing
bindings. Keep redirects and my personal pin intact. Do not recreate the repository
or triage, close or merge incoming community contributions. Surface any unexplained
preservation discrepancy immediately.

**Second, prepare publishing access when the candidate needs it.** Reuse the created personal account
`matthew-kissinger` and free `instruktlabs` organization; do not recreate them. Verify
2FA/recovery readiness and prepare `@instruktlabs/kiln` publishing access. Bring any
remaining verification, login, 2FA and recovery handoffs to me through the
visible browser and chat. Never ask for secrets in chat. Configure GitHub trusted
publishing and staged release approval when the package is ready; organization
registration does not itself authorize publishing a placeholder or release. Do not
repeat completed email, 2FA or recovery setup, or let a pending interactive login
block independent package engineering.

**Then implement and qualify the full release:** the supported ESM/TypeScript SDK,
CLI, local MCP, skills, package contents and migrations; installable Claude Code and
Codex plugins; and the authenticated service at `kiln.instruktlabs.com` on Cloudflare
Workers, Containers, R2, D1 and Durable Objects. Qualify native evaluation, tenant
isolation, CPU rendering and software Vulkan, downloads, retention, quotas, load and
cost against the plan. Retain existing experimental features with explicit labels.
Keep saved assets until deletion within quotas and expire unsaved work after seven
days. Treat $20/month as an initial target, not a spending authorization or hard cap.
Hosted access is free within quotas, with optional sponsorship and no subscription
billing in v1. Reuse the already-active Cloudflare Workers Paid and R2 subscriptions;
do not buy a duplicate plan. Evaluate reasonable usage growth against measured costs
and the existing $10 budget alert; keep account purchases distinct from billing users.

Use a `codex/` branch and commit/push tested work needed for CI. Follow current
repository instructions, preserve unrelated changes, and verify exact packed
artifacts and real installed/hosted flows. Prepare the complete release and directory
candidates, surface any still-required approval against concrete artifacts or costs,
and carry out authorized publication, deployment and submissions. Use the same
qualified engine version across package and hosted integrations.

Sequence consequential decisions through the question tool, honor settled answers,
and continue independent work while I handle account steps. Surface missing
permissions, provider blockers and material scope/cost changes promptly. Do not
silently weaken checks, skip scope or switch hosts to finish overnight.

Finish with verified npm `1.0.0`, working local plugin distribution, a verified hosted
service and submission receipts for the applicable OpenAI and Anthropic directories.
Report each milestone separately with exact versions, hashes, URLs and evidence.
Vendor review/acceptance may remain pending after submission; unfinished engineering,
authentication or publication work must remain explicitly open. Keep a durable
progress record so the run can continue accurately through interruptions.

## Hosted-access decision resolved

D8 was explicitly accepted on 6 October: free hosted access within quotas, optional
sponsorship and no subscription billing. The owner accepts justified provider usage
overages and is open to a suitable paid Cloudflare plan. Exact technical quotas still
require measurements; no further business-model preference question is needed.

The owner also selected Google and GitHub sign-in through one Kiln-owned account,
with email sign-in deferred. Correct security and a professional, clearly branded
end-user flow are explicit acceptance requirements. Follow the publication plan's
6 October authentication architecture review; do not treat the current GitHub-only
fixture or passing local OAuth checks as deployed multi-provider acceptance.
