# Claude distribution audit, October 7, 2026

Status: analysis for owner alignment. No submission, naming change, account grant,
compliance acceptance or further outreach is authorized by this report. The owner
asked to hold Claude submission work while reviewing the intended experience.

The root agent checked the live portal and sent-email thread. An independently
delegated agent inspected packaging, retained installation evidence and current
Anthropic documentation. Source audited: `663ff4ae6220c3bf88b7d653429b9d116e53f926`.
This report changes documentation only; no plugin implementation was changed.

## What actually happened

The signed-in Claude directory dashboard currently shows **0 submissions** and
**Nothing submitted yet**. The unfinished form says **Draft saved in this tab**.
It is not a saved submission in the dashboard, an application under review or an
accepted listing. The form still points at `plugins/kiln-engine` on
`codex/v1-native-dispatch`, validated at `4b3dc62`.

Validation did send the public source location to Anthropic for retrieval and
scanning. That preparation is real external activity even though no final
submission occurred. The form reports five warnings and two policy holds. The
five warnings concern the icon and four directory-only URL fields; their details
explicitly say the directory reads them and no action is needed. The two
credential-related policy holds are unresolved. The current listing preview
shows **Kiln Engine**, **1 skill**, **no MCP servers**, and **Claude Code only**.
All four compliance acknowledgments remain unchecked and Next is disabled.

One clarification email was sent to `directory@anthropic.com` after the owner's
explicit approval. Subject: **Local plugin executable declaration and publisher
ownership for Kiln**. It was sent from the maintainer's personal Gmail account,
signed Matthew Kissinger / Instrukt Labs, with no attachments. It explained the
public installer and asked about the executable acknowledgment, the two scanner
holds, and ownership through a personal Claude account. It did not submit a
plugin or request publication. The thread contains an automated support-ticket
acknowledgment and no substantive answer as of this audit.

The earlier dated preflight record ends with an unsent email draft. That describes
its earlier state, not the later approved send. The exact sent copy is retained
locally for owner review, outside tracked documentation. Future outreach should
show the owner the final text, sender, recipient and purpose before sending.

## What each package contains

| Delivery | Contents and limits |
| --- | --- |
| Published npm `@instruktlabs/kiln@1.0.0` | Six maintained skills: setup, author, refine, QA, compose and batch, plus the engine/CLI/MCP runtime. |
| Local plugin candidate 1.0.1 | One setup skill, reference, real installer, exact engine pin, manifests, icon, privacy notice and supporting files. |
| Default generated workspace | `kiln-author-asset`, `kiln-refine-asset`, `kiln-qa-asset`, registered for the chosen harness, plus one local `kiln_workspace` MCP server. |
| Optional workspace workflows | `kiln-compose-scene` and `kiln-batch-dispatch`, selected with `--skills compose,batch`. |
| Hosted OpenAI draft | Remote MCP definition and hosted authoring guidance in OpenAI's format. |
| Hosted Claude integration | Claude-format bundle and connector listing are not implemented or qualified yet. |

The local packager's check passed against maintained source. The published engine
installation inspected by the audit contains all six skills. Therefore the single
listed skill is intentional, not a failed npm publication or missing-file defect.
The portal only inventories the plugin folder, not what its installer later adds.

Source: `scripts/package-local-plugin.mjs`, `scripts/create-workspace.mjs`,
`package.json`, and `plugins/kiln-engine/README.md`.

## Findings

1. **High: the current candidate does not deliver the intended Claude apps
   experience.** The real top-level `bin/` executable excludes Claude apps and
   Cowork, as both the live portal and [Anthropic's component
   documentation](https://code.claude.com/docs/en/plugins/components#executables)
   state. Adding more skills cannot make the native installer work there. Moving
   it to hide its classification would not establish compatibility.

2. **High: hosted Claude distribution is a separate unfinished deliverable.**
   Reuse the Cloudflare service and maintained guidance, but generate Claude's
   `.claude-plugin/plugin.json` and `.mcp.json` wrapper. The current OpenAI ZIP
   cannot be submitted unchanged. Anthropic requires the owned remote MCP to be
   submitted as a connector as well as any plugin bundle referencing it. Matching
   owner and endpoint enable pairing. See [plugin
   structure](https://claude.com/docs/plugins/build) and [directory
   publishing](https://claude.com/docs/directory/publish). Real authentication,
   asset persistence, tool use and downloads must be checked in each advertised
   client before claiming support.

3. **High: publisher ownership and an execution acknowledgment remain open.**
   The compliance form names Matthew Kissinger; manifest authorship says Instrukt
   Labs. The first submitting Claude organization holds the repository-folder
   listing. GitHub organization ownership does not select it, and later transfer
   has not been established. The form's acknowledgment disallows execution outside
   declared MCP servers, while setup demonstrably runs npm and the workspace
   generator before that MCP exists. Do not accept an inaccurate statement.
   Clarification or an appropriate alternate distribution path is needed. See
   [submission requirements](https://claude.com/docs/plugins/submit).

4. **Medium: the branding was a choice, not a demonstrated namespace necessity.**
   There is no evidence that `kiln` is taken in Anthropic's directory. npm's
   occupied unscoped name is unrelated. Claude supports separate `name` and
   `displayName` fields; the current Claude manifest has no explicit display name.
   Own-marketplace naming is scoped, while public directory checks also compare
   names across organizations. `kiln@instruktlabs` is a possible local naming
   shape, not a verified available public directory name. See the [manifest
   reference](https://code.claude.com/docs/en/plugins/manifest-reference) and
   [directory naming checks](https://claude.com/docs/plugins/pre-submission-checklist).

5. **Medium: the setup-only design creates an onboarding cost.** Installation
   provides setup first. Users create/select a persistent workspace and start
   their coding agent there before authoring. This keeps assets out of disposable
   plugin caches and avoids duplicate server/skill registration. The listing
   should explain that sequence and name the default and optional skills. A
   direct-authoring plugin would be a deliberate UX redesign, not a packaging fix.

6. **Medium: candidate qualification and public installation differ.** GitHub
   `main` currently serves local plugin 1.0.0, while the preflight candidate is
   1.0.1 on a development branch. Its new privacy URL on `main` returns 404 today.
   The prior isolated 1.0.1 checks prove installation, generated workspace,
   discovery and direct MCP operations. Their receipt explicitly records zero
   model turns; they do not prove a normal Claude conversation follows the whole
   onboarding workflow. Qualify that workflow on the exact released candidate.

7. **Medium: review the boundary between remote API facts and behavioral
   instructions.** Section 2F of the [Directory
   Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
   restricts dynamically retrieved behavioral instructions. The hosted skill's
   references are bundled files, and hosted tools do not expose the optional
   `kiln_skill_resource` tool. However, `src/discovery/service.ts` includes workflow
   guidance and `src/discovery/recipes.ts` includes imperative review steps in
   remote catalog results. These deserve a specific policy review. Prefer putting
   workflow guidance in the reviewed skill bundle while retaining remote helper
   signatures, schemas, constraints and examples. This is an identified
   interpretation/qualification gap, not a finding that all remote documentation
   violates policy.

The scanner holds are not proof of credential theft. Inspection shows that its
flagged `pin` is a public package/version pair. However, npm does inherit normal
caller environment and configuration. Do not claim credentials are universally
stripped or dismiss the vendor's hold as resolved by local tests.

Kiln evaluates assistant-authored JavaScript into geometry/GLB and renders views;
the hosted runtime is not itself a standalone image-generation model service.
Describe this distinction accurately when applying Directory Policy section 4B.
Its design-workflow exception may be relevant, but does not guarantee acceptance.

## Recommended alignment and sequence

1. The owner selected **Kiln**, if available, as the product brand and **Instrukt
   Labs** as publisher during this audit. Keep the npm package unchanged. Use
   the LLC's exact registered name in legal disclosures and legal-entity fields;
   the public publisher label can remain Instrukt Labs. The exact registered
   punctuation has not been independently verified. Decide installation slugs
   separately; retaining the
   existing local slug avoids an immediate migration, while renaming requires
   an update plan. Public directory availability still needs preflight.
2. Describe two explicit experiences: local workspaces for coding agents, and
   hosted Kiln for Claude apps and compatible coding clients. Retain the useful
   workspace skill boundary unless the owner chooses a broader onboarding redesign.
3. Resolve the long-term Claude publisher and the executable acknowledgment
   before creating an owned submission. No additional Claude subscription or
   future ownership transfer is assumed.
4. Finish the hosted service and Claude-specific wrapper, then run actual client
   workflows and review public privacy/support links. Prepare a connector record
   and a paired hosted plugin record from the intended publisher.
5. Present one owner-reviewable dossier for each candidate: visible name, slug,
   exact source/version, supported clients, installed skills/tools, setup actions,
   outbound services, privacy, publisher, screenshots, unresolved findings and
   proposed submission settings. Keep automatic publication off for launch.
6. Obtain approval on that concrete dossier before submission or more outreach.
   Track preparation, submission, review, approval and publication separately.

The branding preference is aligned, subject to availability. The remaining
sequence is a recommendation, not an approved rename or authorization to submit.

## Subsequent owner alignment

After this audit, the owner clarified that Kiln must remain agent and harness
agnostic, with seamless Claude Code compatibility through thin integrations or
shared architectural improvements. The owner selected support for both existing
projects and new workspaces through the question tool. The earlier setup-only
versus Claude-specific-redesign question is superseded. See the
[local setup plan](../plans/2026-10-07-agnostic-local-setup.md) for the shared
extension and qualification requirements. This does not close the findings above,
change the published package, or authorize further directory activity.
