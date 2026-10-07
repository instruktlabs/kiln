# Kiln local setup across agents

Status: owner-selected direction with a proposed implementation sequence, 7 October
2026. This records release work, not an implemented feature or a directory
submission. The existing published package remains unchanged.

## Decisions and intent

The owner wants Kiln to remain agent and harness agnostic. Claude Code and Codex
plugins should be convenient integrations with a shared product, rather than
determine the engine's architecture. Small extensions or restructuring are in
scope when they improve that shared experience.

The owner selected **support existing projects and new workspaces** for local v1
onboarding through the question tool. The earlier question offering only the
existing setup-only design or a Claude-specific redesign is superseded.

The public product name is **Kiln**, subject to directory availability, with
**Instrukt Labs** as publisher. Use the exact registered legal entity name in
legal fields; its punctuation has not been verified. GitHub organization
ownership does not establish ownership of a vendor directory listing. Do not
rename installation identifiers or resume submission/outreach merely because this
direction is recorded.

## Current implementation and gaps

- `scripts/create-workspace.mjs` rejects a nonempty destination for first setup.
  It generates instructions, skills, a local runtime launcher and one selected
  harness's configuration. Its repair/check/upgrade paths preserve the recorded
  single `harness` value.
- `scripts/setup-plugin-workspace.mjs` installs a pinned npm engine outside the
  disposable plugin cache and invokes the same workspace generator. The local
  plugin currently exposes only the setup skill; author/refine/QA skills arrive
  in the generated workspace, with compose/batch optional.
- `scripts/package-local-plugin.mjs` already generates Claude and OpenAI
  manifests from shared identity and maintained setup files. Preserve that source
  ownership instead of maintaining independent copies by hand.
- Shared source, program references, saved assets, runtime identity and ordinary
  CLI/MCP behavior should survive adding another agent integration. Multiple
  registrations are a proposed extension; concurrent editing is not thereby
  proven safe.
- Current setup guidance overstates Codex's lack of project configuration. The
  generator itself already writes `.codex/config.toml` and explains its trust
  requirement. Reconcile the guidance with current documentation and installed
  client behavior; retain an explicit launcher only where it serves a measured
  compatibility or unattended-execution need.

## Proposed implementation boundary

1. **One setup service, multiple entry points.** Extend the maintained initializer
   used by npm/CLI and plugin setup. Keep runtime installation, version checks,
   project storage and repair/upgrade logic outside client-specific wrappers.
   Preserve existing initializer commands and existing managed workspaces.
2. **Safe adoption of an existing project.** Inspect before writing. Add Kiln's
   owned state and narrowly merge its selected integration entries. Preserve
   unrelated MCP servers, settings, skills, `AGENTS.md`, `CLAUDE.md` and project
   content. Report conflicts before mutation; never replace a whole project
   config merely to add Kiln. Show the intended changes and provide a check mode.
   Exact file placement and manifest evolution need design/test review.
3. **Optional agent registrations around the same project.** Keep asset storage
   and engine identity independent of agent choice. Add or remove a selected
   integration without recreating the project, duplicating saved assets or
   relocating authentication. Preserve the host's normal trust decisions.
4. **Thin client adapters.** Each integration owns only its manifest, supported
   configuration format, registration locations and any necessary launcher.
   Reuse the maintained core skills and tool registry. Avoid duplicate skill/MCP
   registration when the plugin and project integration are both present.
5. **Guided first use.** Let setup use a chosen existing project or create a new
   workspace, then verify the actual client can see the expected engine and
   tools. Make available authoring workflows clear. Do not assume installation
   means a live session has reloaded its tools. Keep compose/batch optional.
6. **Separate local and hosted delivery.** Local setup stays account-free.
   Claude apps and ChatGPT use the authenticated hosted service and their own
   thin packages. A hosted wrapper must not depend on a local Node installer,
   global shell permissions or Claude-specific settings. Reuse engine behavior
   and portable workflow guidance where supported.

Existing-project support applies to user projects. The engine repository remains
the wrong place to author assets; retain that boundary. Projects as an optional
Kiln asset-grouping feature must not become mandatory just because the containing
directory is an application project.

## Qualification and release sequence

1. Add failing tests for adopting projects with existing instructions, skills and
   MCP configuration, including collisions, interrupted writes and rollback.
2. Implement the shared setup extension and compatible manifest migration, then
   test check, repair, repeat setup and upgrade without losing customizations.
3. Verify the same saved asset/program references through two independently
   registered agents, with no duplicate server or copied asset store. Test the
   CLI path without installing a plugin too.
4. Rebuild and qualify the exact engine archive and derived plugin candidates.
   The already-published `1.0.0` cannot be modified in place; choose the next
   release version from the actual compatibility impact. Publication remains a
   separate approval.
5. Run real first-use conversations in each advertised client from both an empty
   folder and a populated project. Direct SDK tests and zero-model-turn receipts
   are not substitutes for this onboarding evidence.
6. Review the exact candidate's name, publisher, supported clients, installed
   workflows, setup actions and privacy links with the owner before submission.
   Keep the findings in the [Claude distribution audit](../reviews/2026-10-07-claude-distribution-audit.md)
   open until their individual checks pass.

## Current documentation basis

Implementation checkpoint: the pure JSON/JSONC and TOML configuration merge layer
has focused preservation/conflict tests and installed-client configuration
readback. See the [evidence and remaining integration work](../reviews/2026-10-07-project-config-preservation.md).
Existing-project adoption and multiple agent registrations are not yet enabled.

- [OpenAI's Claude-plugin portability guide](https://developers.openai.com/plugins/guides/submit-claude-plugin)
  distinguishes reusable skills/server implementations from host-specific
  configuration and submission requirements. Directory submission and local
  distribution are different paths.
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml)
  documents trusted project-scoped configuration. This supports investigating
  native project setup; it does not prove the installed-client workflow by itself.
- [Claude plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference)
  defines separate display names, skill and MCP components, and validation.
  Client-specific metadata belongs in the adapter, not the engine contract.

These sources were checked on 7 October 2026. No portal draft, listing, account
permission or outbound message was changed during this alignment update.
