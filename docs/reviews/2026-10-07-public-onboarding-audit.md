# Public onboarding and archive audit

7 October 2026. This records preparation for 1.1; it is not publication or final
release acceptance. The public release goal owns the remaining blind runs and
exact main-branch archive qualification.

## Changes

- README onboarding is npm-first and includes real Troy coast/city captures,
  all ten earlier scene/vehicle images and their existing destinations.
  Maintained guides describe package installation, project adoption, upgrades,
  SDK boundaries and local plugins. The architecture guide's incorrect claim
  that npm publication had not happened is removed. Hermes instructions now
  match the launcher and no longer recommend suppressing project rules.
- Historical examples and obsolete gallery-writing helpers are removed from the
  active tree through normal commits. `scripts/example-archive.mjs` restores the
  selected public files from `fda71ac775750f25390b6ee30082ebc56463edc6` into an ignored
  cache. It verifies Git blob bytes and refuses modified caches and tree links.
  CI prepares inputs explicitly; tests perform no implicit network fetch.
- The gallery retains all 80 entries, with identical source, editable GLB and
  runtime-download hashes before and after restoration. Corpus coverage remains;
  two small fixtures support targeted CLI and geometry tests. No new showcase
  collection or Discovery asset index was added.
- Scene guides point to integrated setup and current dependency pins. Original
  milestone reports are explicitly historical; their external capture paths are
  not represented as files available in a fresh clone.

## Checks

- Full offline coverage: 3,376 passed, 2 existing skips, 0 failures; functions
  95.16%, lines 92.49%, both above the unchanged thresholds.
- Typecheck, full lint, skill-copy checks and generated local-plugin inventory pass.
  The focused archive/CLI/plugin checks pass, including original-byte restoration,
  refusal to overwrite a changed cache, and rejection of links before extraction.
- Restoration from a fresh shallow partial clone succeeds. The rebuilt gallery
  passes source/download/poster checks. A full site build produces 224 pages;
  static validation reports zero errors and warnings. Later documentation-only
  edits still require the final candidate's website CI before formal blind runs.
- A relative-link audit covers 104 maintained Markdown files. Remaining absent
  targets are documented original-workspace evidence in historical scene reports
  and the hosted template's three resources, which its offline packager supplies.
- Installed candidate smoke checks, including consumer TypeScript declarations,
  pass all 26 checks. CI must qualify its own exact final archive; the local
  archive is not a substitute for the main-branch release artifact.
- The CI archive at `86262ebc` also passes global-command discovery in a private
  npm prefix, project-local `npx --no --` discovery, `npm.cmd exec` discovery,
  workspace creation and the managed-current check. The quick starts use
  `npx --offline --no --`: PowerShell's npm wrapper consumed the separator in the
  original command and npm 12 rejected Kiln flags. Global commands do not replace
  the workspace launcher's runtime/interpreter/store alignment.
- Claude Code 2.1.287 strict validation passes with no warnings. Codex CLI 0.160.0
  supports the documented marketplace/ref/sparse and plugin-install commands.
  Manifest and CLI checks do not substitute for the pending live Codex trial.

Plugin instructions were checked against current primary documentation:
[Claude manifest reference](https://code.claude.com/docs/en/plugins-reference),
[Claude marketplaces](https://code.claude.com/docs/en/plugin-marketplaces),
[Codex marketplace commands](https://learn.chatgpt.com/docs/developer-commands#codex-plugin-marketplace)
and [OpenAI local plugin installation](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually).

## Blind-run boundary

The earlier three runs are exploratory, not final qualification. Trace review
confirmed that an outer OpenCode agent read neighboring runs, including their
launch scripts and prompts. Retain those results as assisted observations.
Fresh qualification uses random separate directories, minimal prompts and an
explicit restriction against reading other workspaces or prior evaluation
records. Audit the actual traces; a prompt restriction is not an OS sandbox.
Public-registry runs, candidate-archive checks and the Codex plugin trial remain
distinct. No live Claude Code credits, hosted launch or vendor outreach are needed.
