# Kiln publisher setup, 6 October 2026

The owner explicitly requested the repository transfer and npm setup before starting
the full v1 implementation goal. No engine changes, package publication or hosting
purchase were performed by these setup actions.

## Native GitHub transfer

Destination: [instruktlabs/kiln](https://github.com/instruktlabs/kiln).
GitHub's native transfer operation moved the existing repository; it was not copied
or recreated. The local `origin` URL was updated to the destination.

| Property | Before | After |
| --- | --- | --- |
| Repository ID | `1278326592` | Same |
| GraphQL node ID | `R_kgDOTDG3QA` | Same |
| Stars | 233 | 233, same stargazer identities |
| Watchers | 2 | 2, same identities |
| Forks | 18 | 18, same repository identities |
| Open PRs | #140, #141, #142 | Same IDs, authors, bodies, states, head/base refs and reviews |
| Open issue | #134 | Same ID, body, state and owner assignment |
| All issue/PR records | 144, including 143 PRs | Exact projected record comparison passed |
| Issue comments | 8 | Same IDs and contents |
| Tags and releases | 5 of each | Same refs, release IDs, metadata and assets |
| Main SHA | `65ce2f815a70ca3bdf8ad4fa1f8bf52d5fd08581` | Same |
| Main protection | Eight required checks, strict updates, admin enforcement and other existing settings | Preserved |
| Personal profile pin | Kiln pinned | Same pinned node, now `instruktlabs/kiln` |

Old repository, issue #134, PR #140 and v0.10.0 release URLs were tested and redirect
to the organization URLs. Git access through the old URL returns the same HEAD,
main and tag refs. Pages was disabled before and after. No outside contribution was
triaged, closed, merged or rewritten. Existing collaborators, environments, hook,
deploy-key and secret-name inventories match; no secret values were read.

Initial post-transfer stargazer/watcher reads returned temporary 404s. A subsequent
complete snapshot passed without API errors and matched every captured identity.

## Actions policy compatibility

The destination organization requires full commit-SHA pins and permits selected
Actions. It initially allowed only GitHub-owned Actions, excluding Kiln's existing
Bun setup action. The owner explicitly approved adding only
`oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6` (upstream v2.2.0).

That exact allowlist entry is now applied and effective for Kiln. Mandatory SHA
pins, GitHub-owned actions and the other organization restrictions remain in place.
The stricter inherited policy explains the only settings difference in the
before/after audit. This was an organization-wide setting, disclosed to the owner.

The existing Linux `typecheck · lint · test` job from
[CI run 37410749192](https://github.com/instruktlabs/kiln/actions/runs/37410749192)
was rerun under the new ownership to verify operational continuity. Attempt 2 and
the new Linux job `112124711993` passed on the unchanged SHA. This reran the Linux
job, including toolchain setup, tests/coverage and exporter qualification; the other
previously successful platform jobs were not represented as newly executed.

## npm handoff

The local CLI had no authenticated npm account. The owner asked to use
`matt@instruktlabs.com`, an alias to their personal inbox. The signup form was
prepared with that business email and suggested personal username
`matthew-kissinger`; the organization will be `instruktlabs` separately.

The owner completed account creation and confirmed email verification. The agent
created the free public-package organization `instruktlabs`; npm displayed its success
message and the member list verified `matthew-kissinger` as the sole owner. The scope
is secured. No invitation or paid npm subscription was created.

The owner enrolled two security keys, reporting one on the PC and one on the phone.
The npm key list confirms two registrations and 2FA required for write actions.
Organization-wide 2FA enforcement is enabled; npm confirms one enabled member, no
disabled members and no removals. No package has been published. Configure package
publishing trust when an authorized reviewed bootstrap exists.

At the owner's explicit request, a one-use, loopback-only helper was prepared to save
the recovery codes using Windows DPAPI CurrentUser and restrictive Windows file
permissions. The browser tools' virtual clipboard was empty. The local form failed,
and Notepad could not open the prepared restricted paths. The owner saved the codes
manually and supplied the exact file path in OneDrive Documents. The helper then
encrypted that file and verified both the in-memory and persisted round trips.
The encrypted file exists at
`%LOCALAPPDATA%/Instrukt Labs/Kiln/Secrets/npm-recovery-20261006-055937-d35c8c23.dpapi`.
The staging plaintext was removed and its absence verified. OneDrive recovery or
synced copies were not inspected or purged. This backup requires the original
Windows account's DPAPI keys; it is not an independent disaster-recovery copy.
No code contents were printed or added to the repository. Browser account setup
is complete; local npm CLI login remains unconfigured until publishing requires it.

Automatic approval review blocked an earlier cleanup command for the two empty
helper staging files and synthetic test backup, reporting only "blocked by policy."
Those harmless helper artifacts remain. The separately verified owner plaintext
file was subsequently removed successfully.

## Cloudflare subscription

The owner explicitly authorized Workers Paid at its current $5/month subscription
price if not already active. After the owner signed in, the Subscriptions dashboard
confirmed **Workers Paid: Active** and **R2 Paid: Active**, both renewing on
20 October 2026. No purchase or account upgrade was needed or performed.

The Billable usage dashboard showed $0.00 in usage charges for the current cycle,
with all observed usage within included tier limits. This excludes the subscription
base charge and is not a forecast for Kiln's future workload. Allowances are shared
with the account's existing applications. An auto-created $10 budget alert already
exists with one recipient; it was inspected without changes. This is a notification,
not a hard spending cap. Native Container
qualification, Kiln-specific resources and deployment remain implementation work.
This developer subscription is separate from a domain Pro/Business plan.

## Evidence and remaining work

Full local snapshots and scripts:
`C:/Users/Mattm/X/kiln-dogfood/publisher-setup-2026-10-06/`.
This is a scratch evidence directory, not the engine checkout or release workspace.
All release planning documents and future engine changes belong in `kiln-oss`.
Key receipts: `before.json`, `after.json`, `comparison.json`,
`actions-policy-final.json`. These are outside the installable engine checkout.

Repository content links, metadata and final plugin/npm trust bindings will be
updated during the v1 implementation cycle; old GitHub URLs currently redirect.
This record does not prove native Cloudflare execution or npm release qualification.
