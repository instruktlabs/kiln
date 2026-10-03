# Repository and site release preparation — 3 October 2026

Execute the stabilization release. Matt has now authorized commit, main integration
and Cloudflare deployment after performance review and final organization. Troy requirements, assets and scene work follow
this checkpoint and a direct discussion; its pack remains off the public site.

## Current blockers and preserved evidence

Matt confirmed the farmer hand fixes and could not reproduce the water jump locally.
The [release disposition](../reviews/2026-10-03-release-disposition.md) closes those
release holds and records the bounded performance decision; historical evidence
remains in the [investigation](../reviews/2026-10-03-water-orbit-follow-up.md).
The original focused timing audit remains failed (one 50.1 ms interval and two
post-run quiet failures); the targeted repeat passes. That is a known acceptance
limit, not grounds for a speculative runtime patch or automatic 108-minute rerun.
Physical mobile and owner visual acceptance remain distinct from desktop emulation.

Core, shared input/camera, farmer and existing site functional receipts retain their
exact source/artifact scopes. No current source change was made merely to suppress
a failed result. The previous package and report are preserved before reopening.
Current documentation changes require a new package/document binding; a clean release
commit also requires fresh site build provenance before deployment.

## Efficient validation

1. No further water repair or timing run is required for the present candidate. If
   the issue recurs, reproduce it and add a failing regression for its actual cause.
2. Run the nearest tests, scene typecheck/lint and the required portable scene gate
   after a source repair. Use rendered before/after orbit evidence on both backends,
   including transient frames and animation if implicated by the reproduction.
3. For a water-only change, budget three original/candidate 60-second pairs:
   balanced orbit, high orbit and flyover — six measured minutes plus loading and
   unchanged quiet checks. Expand only when a failure needs attribution. Do not
   remeasure unchanged Farm or Foundry merely because they share the repository.
4. Rebuild only changed delivery surfaces; verify exact scene seals, site references,
   affected public controls and downloaded bytes. Retain the existing core runtime
   qualification when those bundles are byte-identical.

The 108-minute plan is archived as optional broader coverage, not the current release
gate. Omitted tiers and repetitions remain unmeasured. No hitch threshold is relaxed,
and a passing repeat does not replace earlier failures.

## Housekeeping and commit structure

The read-only inventory initially contains 267 pending files with no `.env`,
`node_modules`, `.tmp` or `.cache` entries in the proposed tracked/untracked set.
`git diff --check` passes. Ignored diagnostic captures remain local evidence; preserve
them and old artifacts, rather than running broad cleanup or deleting unknown files.
New documentation added by this checkpoint is additional to that initial inventory.

Prepare these coherent review groups, preserving the existing working tree:

- Core ORM/full-exporter fixes, their regression coverage and rebuilt Node bundles.
- Compatible dependency/toolchain updates and lockfiles; coordinate scene/site pins.
- Shared scene input/camera and Farm/Golden Gate runtime fixes with their tests.
- Site verification/deployment tooling, exact scene delivery catalogs and asset pins.
- Maintained guidance, roadmap/backlog and release/migration records aligned to the
  final implementation. Troy document edits clarify deferral, not construction.

A file inventory is not a blanket correctness review of every diff. Review staged
groups before committing, check for unintended generated payloads, and keep code,
its required tests and its build outputs together. Do not blindly stage all files.

## Concrete release sequence

Owner commit/push/deploy authorization is recorded in the release disposition.
Fetch and inspect remote changes; preserve local work and integrate only if needed. Commit the reviewed groups,
run applicable checks on the resulting tree, then push the agreed branch/PR path.

The website uses direct upload to Cloudflare Pages project `kilnstudio`, production
branch `production`; GitHub Actions does not deploy it automatically. Follow
[`site/DEPLOYMENT.md`](../../site/DEPLOYMENT.md): build from the clean intended commit,
verify the full artifact inventory and exact scene/runtime/asset pins, validate the
R2 upload sets without mutation, upload only approved immutable assets, verify their
public hashes, and run the portable deployment dry run before the actual upload.
The dirty-checkout refusal is expected until the release commit exists; do not bypass it.

Current public rollback reference: deployment `33c716c7-16e5-46c6-93bf-f2260f0082be`,
commit `b1ac6ee`, artifact `5ecbbe76…`, Golden Gate `g9` / Foundry `ff3-review2`.
Preserve existing versioned assets. After an authorized deployment, verify the public
build-info, scene runtime hashes and actual scene entry/control flows against the new
artifact. npm publication remains a separate deferred action.
