# Kiln release goal status

7 October 2026. This checkpoint distinguishes shipped work, private qualification
and remaining launch work. The dated research plan remains the scope record;
older statements within it are not the current execution status.

## Completed

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
  pass. [Adoption evidence](2026-10-07-project-adoption.md) separates these results
  from coverage, exact-source CI and actual first-use conversations.
- Hosted retention and scheduled deletion have a frozen private trial candidate.
  The maintenance gateway and recovery runbook have offline tests, including a
  state-preserving local transition, but need provider qualification.
- Public pages, terms, account controls and directory bundles are prepared
  candidates. They have not been approved as a public service or submitted listing.

## Remaining sequence

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

Git ancestry was checked against current remote PR heads. There are seven open
release PRs, but not seven independent changes to merge:

| PR | Role | Disposition |
| --- | --- | --- |
| [#147](https://github.com/instruktlabs/kiln/pull/147) | Initial native execution | All commits included in #153; close as superseded after that merge |
| [#149](https://github.com/instruktlabs/kiln/pull/149) | Initial account controls | All commits included in #153; no separate merge needed |
| [#150](https://github.com/instruktlabs/kiln/pull/150) | Native startup/isolation qualification | All commits included in #153; no separate merge needed |
| [#153](https://github.com/instruktlabs/kiln/pull/153) | Integrated hosted foundation | First main merge awaiting owner approval at `39083d7`; all 25 reported checks pass |
| [#154](https://github.com/instruktlabs/kiln/pull/154) | Retention and scheduled recovery | Follows #153; frozen private trial at `37c962e` awaits its separate $1 allowance |
| [#155](https://github.com/instruktlabs/kiln/pull/155) | Maintenance and recovery preparation | Follows #154; implementation is distinct from unfinished provider restore evidence |
| [#156](https://github.com/instruktlabs/kiln/pull/156) | Shared local setup | Follows #155; current adoption extension still being qualified |

The hosted foundation merge deploys and publishes nothing. The pending retention
trial uses four private Workers with temporary D1/KV/R2, no VMs, provider secrets
or public route, with a bounded run and identity-checked cleanup. Earlier paid
trial allowances do not authorize it.

The previous #156 head has 25 passing checks and a separate failing legacy Linux
Docker isolation preflight. That failure remains visible and needs resolution or
an evidenced check replacement before final readiness; it is not the result of
the private Cloudflare fresh-VM tests. Do not hide it by weakening isolation.

No immediate authentication is required for the local implementation. Later
provider transitions and final publication/deployment actions will be surfaced
as concrete handoffs. The contributor's #140, #141 and #142 remain outside today's
scope for the owner to review separately. No PR is closed or merged by this report.
