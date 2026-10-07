# Recoverable project setup preparation

7 October 2026. Internal implementation checkpoint for the owner-selected
[shared setup plan](../plans/2026-10-07-agnostic-local-setup.md). This does not
enable existing-project installation or change the published package.

## Filesystem boundary

`scripts/workspace-transaction.mjs` accepts a bounded list of exact before/after
file snapshots. It checks all paths and preimages before writing, serializes
cooperating setup processes, stages complete files beside their destination, and
writes `.kiln/workspace.json` last. A check creates no files or directories.

Recovery snapshots and a journal live outside the project, under the user's Kiln
application-data directory by default. They may contain credentials already in
the project configuration. Snapshot bytes never enter reports or error messages.
New directories/files request modes 0700/0600 on POSIX; Windows uses the profile
directory's filesystem permissions. This is temporary recovery storage, not an
encrypted credential vault. Successful setup or recovery removes these files.

Caught failures restore files only when their contents still match the recorded
setup state. Conflicting owner edits are retained along with the recovery data.
Explicit recovery verifies snapshot hashes and every target conflict before
restoring targets. Traversal, Windows aliases/device names, overlapping file and
directory targets, linked managed paths, and a changed project-root identity are
rejected. Cleanup never recursively deletes recovery storage or a project target.
Unknown recovery files prevent cleanup.

File IDs use bigint filesystem metadata and decimal strings in the journal.
Testing found Windows IDs that exceed JavaScript's safe integer range; converting
them through ordinary numbers would make recovery validation unreliable.

## Evidence and limits

- Nine initial tests failed against stubs. Thirteen focused filesystem tests now
  pass, including a real Node subprocess exiting after its first file write,
  explicit recovery, concurrent setup exclusion, junction replacement, tampered
  backups, conflict retention and reversible deletion.
- Together with the configuration merge tests, 29 focused tests and 137 assertions
  pass. Evidence: `.cache/workspace-recovery-green.log`.
- Toolchain checks, skill consistency, typechecking and lint passed. The full
  local suite passed 3,320 tests, with two platform-specific skips and no failures
  across 413 files. The separate coverage run also passed all 3,320 tests and the
  existing ratchet: 95.16% functions (minimum 94.00%) and 92.50% lines (minimum
  92.10%). Coverage measures `src/`; the recovery helper is verified by its focused
  tests, not those engine percentages. Evidence:
  `.cache/recovery-{check-toolchain,check-skills,typecheck,lint,test,test-coverage}.log`.
- Recovery covers process interruption, not a claim of atomic multi-file commits
  across power loss. Files are flushed; directory-entry durability is not proved
  across every filesystem. An incomplete journal or interrupted recovery lock
  fails closed and may require manual inspection.
- These checks protect ordinary setup conflicts. They are not an OS security
  boundary against a hostile process running as the same user. Users should stop
  agent/MCP sessions and configuration writers before maintenance. Path checks
  and atomic renames do not provide a filesystem compare-and-swap primitive.

The helper is not yet imported by the initializer or shipped in `package.json`.
Next work is the owned project manifest, adapter projections, shared initializer
integration, legacy migration and installed-package qualification. No release,
cloud deployment, directory submission or external outreach occurred here.

## Correcting the skill-discovery assumption

Current [Claude Code skill documentation](https://code.claude.com/docs/en/skills)
documents `.claude/skills` as the project location. It does not advertise
`.agents/skills`. A fresh-profile probe of installed Claude Code 2.1.287 confirms
that narrower behavior in both an ordinary folder and a newly initialized Git
project: `.claude/skills` fixtures appear in session initialization; the distinct
`.agents/skills` fixture does not. A shared-name fixture appears once.

The Git-project probe stopped immediately after initialization. It used a
synthetic API key and a loopback API stub, with nonessential traffic disabled;
the stub saw only an initialization HEAD request. No model request reached a
provider, and no real authentication or user configuration was used or changed.
The earlier ordinary-folder probe retried only against the rejecting local stub
and was stopped at its 20-second deadline. Neither probe is a successful model
conversation or onboarding acceptance test.

Receipts: `.cache/claude-skill-discovery.json` and
`.cache/claude-skill-discovery-git.json`. The old claim in `docs/harnesses.md` that
this binary loads both directories is not sufficient evidence for a shared
registry. Keep client discovery paths in their adapters, reuse the same skill
sources, and qualify discovery and duplicates in each actual client.
