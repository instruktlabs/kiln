# Existing-project configuration preservation

Status: implementation prerequisite for shared local setup, 7 October 2026.
This does not yet enable existing-project adoption in `kiln-init`, modify an
installed user project, or change any published package/plugin.

The [owner-selected local setup plan](../plans/2026-10-07-agnostic-local-setup.md)
requires existing-project setup without replacing unrelated agent configuration.
`scripts/workspace-config.mjs` now provides pure JSON/JSONC and TOML merge functions
for the forthcoming project-adoption transaction. Both return proposed text;
neither opens files, reads credentials, writes settings or grants trust.

## Evidence

- Twelve initial tests failed against the unimplemented operations. Sixteen
  focused tests now pass with 73 assertions, including added adversarial cases.
- JSON edits preserve unrelated source bytes, comments, settings and large-number
  spelling. They reject duplicate keys, ambiguous parent types, overlapping
  changes, unsafe paths and conflicting or modified owned entries. Updating an
  owned entry requires matching the previous value, or the exact desired value
  for an idempotent repeat.
- TOML edits preserve text outside an explicitly owned table block. Parsing and
  semantic comparison check that insertion/replacement cannot change unrelated
  settings through table context. Marker-like lines inside a multiline string,
  duplicate/incomplete markers, manual target tables and extra assignments are
  rejected. A previously existing manual Kiln table needs an explicit ownership
  migration; this helper does not silently take it over.
- Malformed input diagnostics omit parser source excerpts and configuration
  values. Tests use synthetic credential strings to confirm those values are not
  included in errors. No real credential was used in these tests.
- Node 22.23.3 independently imported and exercised both functions successfully.
- The full local suite passed: 3,307 tests passed, two platform-specific tests
  skipped, no failures. Typechecking, skill consistency, toolchain validation and
  lint (1,085 files) passed. A registry advisory audit found no known
  vulnerabilities among 309 packages; that is not a guarantee of absence of
  vulnerabilities. Coverage qualification is still pending at this checkpoint.
- Runtime bundles rebuilt. The SDK directory replacement encountered a Windows
  `EPERM` once and restored the prior output; a direct SDK build retry succeeded
  with all 55 entrypoints and 522 emitted files. No permissions or running user
  processes were changed to obtain the successful build.
- Installed Codex 0.160.0 read the generated `.codex/config.toml` entry from a
  trusted synthetic project and reported an enabled stdio server. Installed
  Claude Code 2.1.287 read the generated `.mcp.json` and correctly reported
  **Pending approval**. Both used temporary, empty client configuration homes;
  the user's global settings and authentication were not changed. These commands
  inspected configuration only. They made no model call and did not run a Kiln
  authoring workflow.

The parsers are pinned to registry-verified stable versions:
`jsonc-parser@3.3.1` (MIT) and `smol-toml@1.9.0` (BSD-3-Clause). Both declare no
dependencies. The latter requires Node >=18, within Kiln's existing consumer
range. They remain separate npm dependencies with their distributed license
files. No new native component or provider service is introduced.

## Limits and next integration work

This module is not yet connected to the initializer or included in its shipped
file list. It is not proof that project adoption or multi-agent setup works.
The filesystem transaction must add containment/link checks, conflict checks
against fresh file contents, rollback/recovery and owned-state tracking. The
generator must then route both new-workspace and existing-project setup through
the shared logic, preserving legacy workspaces and normal client trust prompts.

Complete the adapter projections, skill registration without duplicates, safe
addition/removal of agent integrations and installed-package tests. Full real
client onboarding, asset preservation and cross-agent reuse remain release gates.
No public directory draft or outbound message was changed by this work.
