# Shared project setup implementation checkpoint

7 October 2026. Development work for the owner's choice to support both existing
projects and new asset workspaces. The public npm package remains 1.0.0; these
changes have not been released, merged to main or submitted to a directory.

## Implemented boundary

`kiln-init <directory> --adopt --harness <client>` uses the maintained initializer
for either destination. `--adopt --check` previews changes without creating a
directory, project file or recovery journal. The plugin wrapper delegates to the
same capability and rejects an older pinned engine instead of silently running
legacy empty-folder setup. Its current 1.0.0 engine pin cannot adopt projects.

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
  typechecking and final lint pass. Exact-source CI remains a separate gate.

Early scratch-probe failures were in the probe: it initially omitted Sharp's
optional platform package and assumed artifact resource-link blocks were enabled
by default. The corrected probe uses the normal optional dependency installation
and the existing readable resource URIs. A later smoke fixture passed an invalid
empty work-item ID; it now uses a valid synthetic ID. Failed receipts are retained;
none of these failures justified changing engine behavior or weakening a gate.

## Remaining before release

1. Finish independent review and cross-platform CI on the committed
   candidate. Actual model conversations in both advertised clients, for an
   empty folder and an existing project, remain required. Protocol clients do
   not prove discovery, trust prompts, duplicate-free instructions or usability.
2. Freeze a new package version and plugin engine pin, qualify those exact bytes,
   and obtain the separate publication approval. Published 1.0.0 is immutable.
3. Reconcile the plugin README and draft privacy notice for this feature before
   owner review. Setup recovery temporarily snapshots project configuration,
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
