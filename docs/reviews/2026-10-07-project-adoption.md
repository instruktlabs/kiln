# Shared project setup implementation checkpoint

7 October 2026. Development work for the owner's choice to support both existing
projects and new asset workspaces. The public npm package remains 1.0.0; these
changes have not been released, merged to main or submitted to a directory.

## Implemented boundary

`kiln-init <directory> --adopt --harness <client>` uses the maintained initializer
for either destination. `--adopt --check` previews changes without creating a
directory, project file or recovery journal. The plugin wrapper delegates to the
same capability and rejects an older pinned engine instead of silently running
legacy empty-folder setup. The updated development plugin pins `1.1.0-dev.1`;
published engine 1.0.0 cannot adopt projects.

Schema 2 records multiple client registrations around one program store, owned
file hashes, and only the configuration entries managed by Kiln. Other servers,
settings, JSON/JSONC comments, TOML text, large numeric literals and unowned root
instructions are preserved. Kiln guidance remains available at `.kiln/AGENTS.md`
and `.kiln/START.md`. Skills use the same maintained sources with client-specific
discovery paths. Optional compose/batch workflows stay optional.

The complete change plan is checked before one recoverable write transaction.
Path conflicts, invalid configuration, corrupt metadata and conflicting owned
edits stop before mutation. Explicit schema 1 adoption preserves saved assets.
Repeated adoption is idempotent; adding another compatible integration does not
duplicate the store. Repair changes runtime registrations without refreshing
copied skills; upgrade handles unchanged managed guidance and reports conflicts.
`--recover` is a separate operation after interruption.

## Evidence

- Fifteen focused adoption tests pass with 114 assertions. They cover populated
  and missing directories, existing instructions/servers, read-only previews,
  repeated setup, adding Codex, legacy migration, runtime relocation, customized
  skills, OpenCode paths/comments, invalid UTF-8, and malformed or hostile manifest
  data. New failure cases were observed before their implementation fixes.
- Twenty-six plugin-wrapper tests pass, including capable-engine delegation,
  refusal of unsupported adoption and recovery/preview argument handling. The
  generated plugin remains byte-aligned with its maintained helper and setup skill.
- An independently installed archive in a Windows temporary directory containing
  spaces and a non-ASCII character passes actual MCP validation, CPU rendering,
  saving, source reopening and GLB reads. The Claude registration starts one
  17-tool server; after stopping it and adding Codex, its registration starts a
  new 17-tool server and reads the same program reference and saved revision.
  Source and GLB bytes are identical, and owner instructions/settings are intact.
- The archive SHA-256 is
  `486e26f396632c9a586505cfc313e00e62b6d7942297479a890a0891b1014c2b`.
  This is an unpublished working-tree archive bearing the existing development
  package version, not the published 1.0.0 artifact. Local evidence is
  `.cache/adoption-installed-receipt.json`.
- The same storage-reuse check now runs in the maintained package smoke test,
  so candidate OS/Node CI can exercise it. Its full Windows package smoke run
  passed and the receipt verifier accepted that exact archive. Historical public
  releases report that adoption is unsupported; a manifest that ships adoption
  must supply its passing installed proof. Evidence:
  `.cache/adoption-package-smoke.json`.
- The full local test run passed 3,338 tests with two platform-specific skips and
  no failures across 414 files. After adding the receipt-gate regression, the
  coverage run passed 3,339 tests with two skips, 95.16% function coverage and
  92.50% line coverage, above the unchanged ratchet. Toolchain, skill consistency,
  typechecking and final lint pass.
- Committed source `225d74ac9cf35950802253aa97275de2f621619a` passed all twelve
  engine/package jobs in [CI run 37662806886](https://github.com/instruktlabs/kiln/actions/runs/37662806886).
  Its downloaded archive hashes to
  `cc620fd544857230d09be232417339b7b9c83cbcab4720abb036008ad028ad4c`.
  The receipt verifier independently accepted all seven downloaded installation
  receipts against those bytes: maintainer Linux, the three consumer Node versions,
  Windows and both macOS architectures. Each reports passing installed project
  adoption and cross-client storage. Software Vulkan also passed in CI. These
  checks qualify the development candidate; they do not publish it or establish
  actual client first-use conversations. The separate legacy Docker isolation
  preflight remains failed and is not included in this passing CI claim.

Early scratch-probe failures were in the probe: it initially omitted Sharp's
optional platform package and assumed artifact resource-link blocks were enabled
by default. The corrected probe uses the normal optional dependency installation
and the existing readable resource URIs. A later smoke fixture passed an invalid
empty work-item ID; it now uses a valid synthetic ID. Failed receipts are retained;
none of these failures justified changing engine behavior or weakening a gate.

## Remaining before release

1. Finish independent review. Cross-platform CI passed at the source above;
   implementation changes require fresh qualification. Actual model conversations
   in both advertised clients, for an
   empty folder and an existing project, remain required. Protocol clients do
   not prove discovery, trust prompts, duplicate-free instructions or usability.
2. Qualify the new `1.1.0-dev.1` package and plugin pin, then freeze a release
   candidate and obtain separate publication approval. Published 1.0.0 is immutable.
3. Review the updated plugin README and draft privacy notice with the owner.
   Setup recovery temporarily snapshots project configuration,
   which may already contain credentials, outside the project. It never prints
   snapshot contents and removes them after successful setup/recovery. Storage
   uses filesystem permissions, not encryption. See the recovery review for
   interrupted cleanup, power-loss and same-user threat-model limitations.
4. Keep the owner's hold on naming, portal changes, submissions and further
   outreach. Review the concrete distribution dossier before resuming them.

This does not prove every pair of client configurations is compatible. A pair
requiring different values for the same MCP entry is rejected before writing.
Removing integrations is not implemented. Existing-project use also does not
provide clean-room asset authoring: application context remains visible. The
separate-workspace path remains available for that purpose.

## Independent review follow-up

The owner-requested distribution audit completed its bounded review of `225d74a`.
It identified two concrete issues, addressed in the development follow-up:

- Copying a schema 1 OpenCode workspace and adopting the copy left the original
  absolute skill path alongside the copied one. A new real-Node regression failed
  with both paths present. Migration now recognizes the old single path only when
  the complete legacy configuration still matches its recorded hash. The copied
  workspace uses only its own skills, while the original workspace, saved source
  and owner files remain unchanged. Repeat adoption is idempotent.
- The plugin helper limited setup to Claude and Codex even though the shared
  initializer supports more adapters. Its generated runtime pin now derives the
  adapter list from the initializer. The helper validates that list before npm
  installation and delegates configuration to the engine. Older metadata without
  this list retains its original two-client contract. This does not advertise
  plugin installation in other clients or prove their complete current workflows.

All 57 focused adoption, wrapper and bundle tests pass with 311 assertions after
the fixes. Full local tests and coverage each pass 3,346 tests with two
platform-specific skips; coverage remains 95.16% functions and 92.50% lines.
Toolchain, skill consistency, typechecking, lint and the redacted patch secret
scan pass. The package, engine identity and plugin now use `1.1.0-dev.1`, with
rebuilt runtime bundles and 55 SDK entrypoints. The generated plugin README
explains adoption and the correct interactive Codex entry; its draft privacy
notice discloses recovery snapshots and retention.

The follow-up's installed Windows archive has SHA-256
`48c5c0ddfce1f70543c614d4725ca18bfc68d7bb31c3f3696a88de8fea749f74`.
Full SDK/CLI/MCP smoke and consumer type checks pass, including project adoption
and the same saved GLB bytes across Claude/Codex registrations. Its receipt
verifier accepted `.cache/setup-audit-package-smoke.json`. The smoke ran with an
allowlist of OS environment variables and empty npm configuration files, without
provider credentials or model calls. An initial assertion expected the older
two-field runtime pin; it now checks the full new pin against the installed
initializer's adapter list. The same archive was used for the successful rerun.
Committed source `76c869aa7c8637b222b5bdf956fd1e70c3f9d83a` passed all twelve
engine/package jobs in [CI run 37668542892](https://github.com/instruktlabs/kiln/actions/runs/37668542892).
Its downloaded CI archive has SHA-256
`98407508d8ec599189851aa0bd8b86313ac3abbd25e6337ac97f8510cc72215b`.
All seven downloaded installation receipts independently verify against those
bytes, including project adoption and shared storage; software Vulkan also
passes against the same archive. The separate legacy Docker isolation preflight
still fails. Four external first-use fixtures are prepared from this CI archive:
new workspace and existing project in each client. Their owner MCP fixtures and
baseline files pass validation, but no model conversations have run. These are
test preparations, not completed onboarding evidence.
Hosted typechecking, all 450 offline tests and the Worker build also pass. The
version bump required refreshing the generated edge metadata and draft plugin
version; their protocol/packaging checks caught that drift before qualification.
The frozen deployment and trial candidates at earlier commits are unchanged.

The audit also identified an unverified OpenCode adapter concern: root
`opencode.json` is the maintained configuration, while newer client documentation
describes other JSONC and `.opencode` configuration locations. Their precedence
and discovery have not been qualified with an installed current client. Record
the tested client version and resolve conflicting effective configurations before
claiming support for that workflow. No additional preservation defect was found
in the bounded review; that is not a complete security or first-use acceptance.
