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

## Public bundle and terms draft prepared later on October 7

All eighteen CI checks passed on `f701121590c8d4f4b71ac4a4bb7fde3b97b2ec8a`.
The following changes require their own committed-source CI and do not change the
published local package.

`hosting/scripts/package-public-plugin.mjs` now builds a portable public draft
from a fixed source list. It includes one HTTPS MCP definition, listing metadata,
a hosted authoring skill, four byte-identical maintained references, the existing
Kiln icon adapted to a 64px SVG, license and file provenance. It excludes local
installers, private connector dependencies, hooks, credentials and engine code.
The generated skill passes the skill validator. A local listing preview confirmed
the icon at large and toolbar sizes; it is not a directory screenshot.

The five positive and three negative review cases name only advertised hosted
operations. Before live qualification, create a dedicated review account through
normal authentication and seed a saved asset named **Review Stool**. Record its
account, asset/revision IDs and hashes in private qualification evidence. The
revision and download cases must each work from this seed independently; they
must not depend on the creation case, which uses **Review Stool Creation**.
Recheck fixture availability and quota before providing review access. No case
has been executed in a live assistant, and no reviewer identity exists yet.

The packager records exact source/file/archive hashes, refuses existing output
and produces a deterministic ZIP. Its receipt deliberately remains
`submissionReady: false`; demo URL, live case receipts, immediately usable review
access, publisher/domain verification and portal validation remain outstanding.
The draft README must be updated to reflect actual availability before submission.
Use the [maintainer command](../../hosting/README.md#public-plugin-preparation)
instead of uploading incomplete source files.

The gateway now serves a draft `/terms` page, linked from the public, consent and
account footer. It follows the owner's choices: free access within quotas, no
end-user billing, in-app security notices, private saved assets, seven-day unsaved
retention and independent local MIT-licensed use. It explains required processing,
user-controlled rights, acceptable use, availability and support. It adds no
payment subscription, arbitration clause or unreviewed liability cap. The owner
must review the terms with the concrete public deployment candidate; this draft
is not a legal review or certification. Its promise to surface material policy
changes is an operational commitment to honor before making future changes.

Two terms-route regressions failed before implementation. All 421 hosted tests,
three typechecks, thirteen builds and root lint pass locally. The actual terms
HTML was inspected through the local workerd preview; the existing script-free
layout, policy navigation and GET/HEAD restrictions remain in place. Logs are
`.cache/terms-{red,green}.log` and `.cache/public-plugin-final-*.log`; screenshots
are `.cache/hosted-terms-preview.png` and `.cache/public-plugin-listing-preview.png`.

No provider credential, public route, paid trial or submission was created. The
Google client approval remains the one pending owner question. The gateway change
requires refreshing the frozen lifecycle candidate before its approval request.

## Publisher portals and Claude validation, October 7

Read-only inspection found the existing **Instrukt Labs** OpenAI organization
marked **Verified** and its Plugins portal available. No ZIP was uploaded. This
removes a presumed new verification step; the submission still needs a selected
developer identity, MCP domain proof and live qualification. Organization
verification alone does not prove the final listing identity or domain challenge.

Anthropic's current signed-in account can open the submission form. Its portal
validated public `instruktlabs/kiln`, folder `plugins/kiln-engine`, tag `v1.0.0`,
resolving to `fda71ac775750f25390b6ee30082ebc56463edc6`. The source folder matched
the local bundle before the icon addition below. Seven checks finished: validation
passed with one warning and two policy holds. Repository retrieval, size, name and
publisher checks passed. The portal reports fourteen entries and 36.4 kB, including
directories; the local file inventory counts regular files separately.

The warning is a missing raster icon. The portal requires a square PNG/JPEG and
captures the first listing icon when saving/submitting the initial draft. A 512px
PNG export of `site/public/favicon.svg` is now maintained at
`assets/branding/kiln-512.png` and included by the local plugin packager at the
default `.claude-plugin/icon.png` path. Sharp 0.35.5 rendered the existing SVG at
density 1152, resized to 512 square, with PNG compression level 9. The 4,481-byte
file's SHA-256 is
`b4b651c402793b7e27cab780f04b14f80daec6d0cd5b7e4e90313930581a54e9`.
Its dimensions decode correctly and its appearance was inspected. The plugin's
runtime remains pinned to the published engine 1.0.0; no executable or engine
version changed. The published tag and npm archive remain immutable.

Both holds use `MCP_FORWARDS_CREDENTIAL_ENV`, referring to the installer's `pin`
beside `registry.npmjs.org` and combining that with setup guidance about a host.
The source review distinguishes the actual data flow:

- `pin` comes from the plugin's public `runtime.json`: package name and exact
  version. It is not an authentication PIN or token.
- Direct environment reads select local storage and the npm executable:
  `LOCALAPPDATA`, `XDG_DATA_HOME` and `npm_execpath`.
- The ordinary npm child inherits the caller's environment and npm configuration.
  npm can therefore use configured npm credentials with its registry. Do not claim
  that all credentials are stripped. Kiln passes a fixed public package/version
  and npm registry, disables install scripts and does not implement a separate
  credential collection or forwarding mechanism.
- Optional remote-renderer credentials in the shared setup guidance are configured
  by the user for that renderer. They are unrelated to the package-version pin.

Retain this explanation for the reviewer; a local code review cannot dismiss a
portal hold or predict Anthropic's decision. Do not rename or hide legitimate code
to evade the scan, or ask the user for a secret to replace the public version pin.
The [portal guidance](https://claude.com/docs/plugins/pre-submission-checklist)
distinguishes a hold from a blocking failure. Final GitHub push-access verification,
data-handling declarations, compliance acknowledgements and submission remain open.
No final submission or compliance acknowledgement was made, and no GitHub access
was granted. The validation form remains local to its browser tab until saved.

The new icon assertion failed first and all eight local-plugin packaging tests
now pass. The full offline gate passes 3,290 tests with two skips and no failures;
function coverage is 95.16% and line coverage 92.50%, above both thresholds.
Typechecking, lint and skill checks pass. Claude Code 2.1.287 validates the
manifest. Revalidate the exact new
commit in the portal before saving the listing, since the `v1.0.0` result cannot
qualify the added icon. Local evidence: `.cache/claude-directory-stable-validation.txt`,
`.cache/claude-directory-stable-validation.png`, and `.cache/claude-icon-*.log`.

## Correcting local-plugin platform support (October 7)

The portal revalidated `2339681`: the icon warning is gone and both credential
policy holds remain. All 18 CI checks passed on that source. Listing details then
exposed an inaccurate result: the skills-only component classification offered
Claude Code, Cowork and Claude apps. Kiln's installer requires a local shell and
persistent runtime/workspace directories; chat and Cowork are not qualified.

Anthropic's [platform support](https://claude.com/docs/plugins/platform-support)
and [executable documentation](https://code.claude.com/docs/en/plugins/components#executables)
identify a top-level `bin/` executable as a Claude Code component that excludes
chat and Cowork. The maintained installer is now actually shipped at
`bin/kiln-setup-workspace.mjs`, with a shebang and executable permission, and the
setup skill invokes that file. No dummy component or scanner-specific obfuscation
was added. Explicit Node invocation remains portable on Windows.

`plugins/kiln-engine.release.json` owns plugin version **1.0.1** and engine pin
**1.0.0** independently. Both plugin manifests and provenance use the plugin
version; `runtime.json` retains the exact published npm engine. This invalidates
plugin caches without replacing the public package, tag, installed engines or
assets. Maintained skills and both registered copies agree and explain the older
1.0.0 helper path. The package smoke check still accepts the published 1.0.0
provenance format while checking separate versions for newer bundles.

Four focused regressions failed before implementation. All 32 packaging/setup
tests now pass, including invocation from outside the checkout and POSIX
executable-mode checks (the latter execute in Linux/macOS CI). Isolated Claude
Code 2.1.287 and Codex 0.160.0 profiles installed 1.0.1 and ran the cached helper.
Both created a workspace with the public 1.0.0 npm archive, checked its integrity,
discovered 17 MCP tools, rendered, saved, reopened source and exported a GLB.
Codex app-server loaded exactly one setup skill, the three workspace skills and
one connected 1.0.0 MCP server. These probes made no model calls and changed no
normal user profile. Receipts are `.cache/plugin-101-{install,workflow,codex-appserver}.json`.
Exact-source CI and portal platform readback remain required after commit.

The full offline gate passes **3,291 tests**, with two skips, zero failures,
95.16% function coverage and 92.50% line coverage. Toolchain, skill consistency,
typechecking, lint and Claude manifest validation pass. Logs:
`.cache/claude-platform-{red,green,full-tests,types,lint,skills}.log`.

### Additional submission gates observed in the form

Data handling asks about personal data, outbound services, retention and intended
under-18 use. No answers were submitted. Prepare precise local-plugin disclosures:
installation contacts npm/GitHub, absolute local paths can contain a user name,
assets persist on the user's machine, and a user-selected remote renderer is
separate from the unlaunched hosted service. Add the appropriate local-plugin
privacy link and three documented use cases before owner review.

The compliance page currently names **Matthew Kissinger**, not Instrukt Labs, as
the submitting identity. Publisher identity needs resolving before acceptance.
It also asks the submitter to attest that the plugin does not execute code outside
declared MCP servers. The local setup executable does run npm and workspace setup
before a workspace MCP exists, so do not tick that statement without resolving its
meaning for documented executable plugins. A fresh candidate may change the form;
otherwise obtain clarification or select another supported submission path.
This is a directory-submission question, not evidence of a hosted execution flaw.

The [Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms)
and [Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
require accurate disclosures and applicable privacy/support information. They do
not resolve the form's executable wording. All declarations and legal acceptance
remain untouched; no submission, GitHub grant or external support message occurred.
Preserve the Google OAuth-client question as the sole pending owner approval.

## Local privacy and listing disclosures (October 7)

All **25 CI checks passed on `6a213b6`**, including the seven public-registry
installation jobs. Anthropic validated that exact source and now lists **Claude
Code only**; chat and Cowork are unavailable for the executable component. The
icon warning is absent, and the same two policy holds remain. Receipts are
`.cache/claude-directory-6a213b6-{validation,platforms,compliance}.txt` and the
platform screenshot. The executable acknowledgement remained unchanged after
this revalidation, so component classification alone does not resolve it.

The maintained local plugin now packages a [draft privacy notice](../local-plugin-privacy.md),
support and license links, and three setup examples: create, check and managed
upgrade. Both manifests advertise the same destinations. The notice distinguishes
local persistence and assistant tool results from hosted retention; it documents
npm/GitHub downloads, inherited npm configuration, normal cache/log writes,
explicit remote rendering and support-email forwarding. It does not promise to
strip npm credentials or erase copies controlled by another application.

The privacy URL targets `main`, where this new file does not yet exist. Owner
review and an approved merge are necessary before that URL can serve as a live
directory policy. The draft marker is intentional; this work does not claim
legal acceptance or submission readiness. Plugin version remains the unreleased
1.0.1 candidate, with the immutable published engine 1.0.0 pin.

The two packaging regressions failed first. All 32 packaging/setup tests pass;
typechecking, lint and strict Claude manifest validation pass. The full offline
gate passes 3,291 tests with two skips, no failures, 95.16% function coverage and
92.50% line coverage. The final cache/log prose clarification was followed by
regeneration, the 32 focused tests and lint. Fresh isolated Claude Code 2.1.287
and Codex 0.160.0 installations accepted the new metadata and included the privacy
file. Their actual engine/workspace behavior was already qualified on `6a213b6`;
the helper and engine pin are unchanged. Logs are
`.cache/local-plugin-disclosures-*.log`; installation receipt is
`.cache/plugin-101-disclosures-install.json`.

### Listing ownership and clarification queue

Anthropic's current [publishing guidance](https://claude.com/docs/directory/publish)
allows a personal Pro or Max account to submit. The first submitting Claude
organization owns the repository-folder listing; GitHub organization ownership
does not select that publisher. The page does not establish whether a personal
listing can later transfer to a business organization. Resolve the desired owner
before creating or submitting the official listing; do not purchase another plan
or assume a future transfer.

A local, unsent clarification draft asks `directory@anthropic.com` about the
executable acknowledgement, the two policy holds and publisher ownership. It
contains public repository details only. No external message, saved portal draft,
GitHub grant, declaration or legal acceptance has been made. Sending that draft
requires the owner's explicit authorization, sequenced after the already pending
Google OAuth-client creation question. Hosted in-app notices remain settled and
are unrelated to this support correspondence.
