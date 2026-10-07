# Directory preflight, October 7, 2026

This is implementation and preparation evidence, not submission or vendor approval.
The published npm package and local plugin remain at 1.0.0. Hosted production is
not live. The owner selected in-app security notices only; no contact-email
collection or notification provider is part of v1.

## Hosted operation contract

[OpenAI's current guidelines](https://developers.openai.com/plugins/plugin-guidelines)
require separately exposed operations and explicit read-only, destructive and
open-world annotations. A discovery tool must not conceal executable operations
behind a generic executor. Stateful jobs count as writes even if their useful
result is a read or preview.

`hosting/src/public-tools.ts` derives `kiln.hosted-tools.v1` from the actual
15-tool native manifest generated from the pinned engine registry. It exposes 26
hosted tools:

| Engine entry | Hosted operation names |
| --- | --- |
| `kiln_renderer` | `kiln_renderer_status`, `kiln_renderer_reprobe` |
| `kiln_material` | `kiln_material_presets`, `kiln_material_create_preset`, `kiln_material_list`, `kiln_material_get`, `kiln_material_create_procedural`, `kiln_material_import` |
| `kiln_assets` | `kiln_assets_collections`, `kiln_assets_catalog`, `kiln_assets_list`, `kiln_assets_get`, `kiln_assets_restore` |
| `kiln_discover` | `kiln_discover` for catalog retrieval; `kiln_capabilities` for runtime facts |
| Remaining eleven entries | Existing names and registry-derived inputs |

The adapter selects relevant fields without copying their schemas. Engine parsing,
action requirements and execution remain authoritative. Caller-supplied action
selectors, unrelated top-level fields, hidden local tool names and conflicting
routing headers fail before native admission. Modern protocol metadata and matched
plain/Base64 tool-name headers survive translation. Resource requests keep their
native route. Registry action additions, missing mapped fields and unknown tools
fail closed rather than silently expanding the public surface.

Only catalog discovery is marked read-only. Every other hosted operation starts a
quota-admitted stateful native job; its description says so. Operations remain
confined to the private account, with no deletion/overwrite tools. Restoring source
and importing revisions are additive. Hosted instructions no longer tell remote
users to install a local renderer or read files beside the server executable.
Engine diagnostics can still mention local multi-action names; hosted instructions
explain how those names correspond to the exposed operations.

Two focused regressions failed before implementation. All 417 hosted tests, three
typechecks, thirteen production builds and root lint pass. Thirty focused checks
also pass after formatting and the hosted import-description correction. The
21-stage lifecycle fixture now calls the public operation names through the actual
edge adapter, then the real native MCP handler with private storage; it retains the
same admission and VM budgets. Native coordinator code and image inputs are
unchanged. Logs: `.cache/public-tools-*.log`.

This does not establish hosted client usability, live provider behavior, directory
compliance of the entire service, or acceptance. Those require the fresh private
trial, deployed client checks and portal validation/review.

## OpenAI candidate still to finish

The [submission documentation](https://developers.openai.com/plugins/deploy/submission)
requires a public HTTPS MCP endpoint, verified publisher/domain, four listing URLs
(website, support, privacy and terms), five positive and three negative cases,
demo recording and working review access. Use a new portable public ZIP with one
remote MCP definition; the existing private connector bundle is unsuitable.

Home, support and privacy pages are implemented; terms are not. Draft terms for
owner review before publication. Review access must work without signup or an
additional approval/MFA step, using a dedicated populated account. Google/GitHub
sign-in alone does not establish that requirement. Prepare an isolated review
identity and test it through normal authentication; do not add an authentication
bypass or weaken the owner's account. Keep reviewer credentials out of Git and the
ZIP, entering them only in the portal's designated secure fields.

The public ZIP, screenshots/video, real review account, positive/negative case
receipts and publisher/domain verification remain unfinished. Upload, submission,
vendor approval and publication require separate records.

## Claude Code candidate

The existing `plugins/kiln-engine` remains the local setup plugin; submit that
folder, not the repository root. Its version, launcher pins and identity are
unchanged. [Anthropic's preflight](https://claude.com/docs/plugins/pre-submission-checklist)
checks both plugin contents and repository archive limits. Local CLI validation
does not replace portal validation or the security scan. Registry installers can
receive a reviewer hold even when pinned.

Read-only measurement of commit `0b680d3b2fb9de2d76b0170fed0121a7021d8d3c`:

- 4,133 tracked blobs, 94,131,137 uncompressed bytes.
- Local Git ZIP: 42,057,936 bytes, below the documented 50 MiB archive limit.
- Plugin folder: nine files, 36,426 bytes; no file exceeds 256 KiB.
- `.gitattributes` has line-ending/binary rules and no export-ignore,
  export-subst, custom filter or LFS rule.

The locally generated ZIP is an estimate of GitHub's archive, not a portal receipt.
Recheck the exact submitted commit. No extra plugin repository is justified by
these measurements. Directory name availability, account eligibility and the
portal's findings remain unverified.

[Submission settings](https://claude.com/docs/plugins/submit) determine the tracked
branch/tag and publication behavior. Keep automatic publication off for the first
submission; the owner reserves public publication approval. Validate the exact
repository, folder and revision before submitting, and retain the resulting ID and
scan status. Directory submission does not promise placement in Anthropic's
separately curated official marketplace.

## Decision sequence

The prepared Google OAuth client approval remains the sole pending question.
Next, request the concrete refreshed private lifecycle candidate and allowance
after its exact CI and artifact hashes are ready. Then finish real sign-in and
account controls, owner-reviewable terms, review-account access and directory
identity/attestations. Do not repeat the settled in-app-notices decision or create
provider credentials, deploy publicly or submit a directory candidate implicitly.
