# Public Kiln release goal

Updated 7 October 2026 following the owner's explicit scope change. This replaces
the earlier requirement to launch hosting before completing public documentation.
The private application handoff is merged on private main at `d71e66d`, with all
five required checks passing. Another agent can resume from its `HANDOFF.md`. Hosted deployment and directory submissions are deferred and
are not completion requirements for this public release cycle.

## Goal statement

Complete the next public Kiln release with accurate, useful documentation and
independently demonstrated installation and authoring workflows. Stabilize the
current 1.1.0 candidate, including the failures in PR #158; refresh the README,
repository documentation and website for the published npm package; add genuine
Troy scene imagery; and run substantial blind agent dogfooding through both a
clean repository checkout and the installed npm package. Fix demonstrated defects,
qualify the exact release artifacts, then publish the approved package version
and corresponding GitHub tag/release and updated public site. Verify the result
from the public registry and deployed documentation. Keep local use account-free
and agent/harness agnostic.

Preserve public repository identity, history, stars, forks, releases and community
issues/PRs. The first-time contributor's PRs #140–142 remain outside this work.
Keep private hosting source, operational credentials and user assets out of public
commits and npm artifacts. Do not launch or advertise a ready hosted service.

## Delivery sequence

1. **Save private hosting.** Merge the tested handoff candidate to private main
   under the owner's explicit authorization. Preserve research, implementation,
   trial results/proposals, settled decisions and concrete remaining launch work.
   Record exact commit and CI evidence. Close superseded private PRs only after
   their work is preserved. No deployment or new cloud trial is required.
2. **Reconcile public state.** Audit the eight remote branches and our outstanding
   PR. Keep `main` and active release work; identify the six superseded branch tips
   and verify preservation before proposing deletion. Do not delete local
   worktrees or dirty files as part of a remote-branch cleanup. Diagnose #158's
   Windows renderer reconnection and Linux concurrent-start failures with focused
   reproduction. A local pass is not proof the CI failure is harmless.
3. **Refresh public documentation.** Keep the README concise and end-user focused; remove stale migration/provenance
   narration and link to deeper references. Audit all maintained Markdown, including
   package/skill/agent guides and site operations notes. Lead with npm installation, stable package
   identity, prerequisites and useful first-run workflows. Cover existing projects
   and new workspaces, SDK/CLI/MCP, Claude Code/Codex and other harnesses, rendering
   capabilities, optional dependencies and experimental boundaries. Reconcile
   README, maintained docs, site content and shipped skills/examples against actual
   behavior. Clearly separate shipped local functionality from deferred hosting.
   Archive the old example collection outside the normal checkout, preserving the
   website archive and necessary regression fixtures. Do not add teaching examples
   or expose whole showcase assets through Discovery. Prefer the existing immutable
   Git history as the archive source over a new storage or indexing system.
4. **Add Troy imagery.** Locate the maintained Troy scene and existing captures,
   verify provenance and current appearance, and choose real scene images for the
   README and site. Capture fresh views if necessary. Use accessible alt text,
   reasonable image sizes and links to the actual scene/source. Do not fabricate
   screenshots or imply that historical showcase assets are quality baselines.
5. **Run blind dogfooding.** Use fresh independent agents with no inherited release
   context, ordinary user-facing instructions and separate asset workspaces. Test
   clean-clone/build/setup and installed-package paths, new workspaces and adoption
   of an existing project. The owner selected AGY `gemini-3.8-flash-high` with high
   effort and OpenCode `opencode/muse-spark-1.3-contributor-free` for live blind runs.
   Keep documented Claude Code/Codex integrations compatible through their existing
   offline/plugin checks; do not substitute them for the requested live models. Begin with bounded
   setup/authoring trials, then exercise representative geometry, materials,
   inspection, refinement, save/reopen/export and user-file preservation. Keep
   prompts minimal: here is the repo or package,
   set it up and launch headless agents to dogfood it. Keep known defects, setup
   commands, tool names and the evaluator's acceptance checklist out of their
   context. The evaluator chooses coverage and inspects results independently.
   Record model/harness versions, package/source identity, traces, assistance, failures,
   output files and actual rendered views. Inspect outputs independently rather
   than accepting an agent's completion claim. Test the published 1.0.0 baseline
   where useful and the exact follow-up candidate; repeat final installation from
   npm after publication. Use existing subscriptions/free access where applicable;
   surface a concrete bounded allowance before any additional paid API campaign.
6. **Repair and qualify.** Use failing regression tests for demonstrated behavior
   defects. Update the maintained shared guidance when blind runs reveal a real
   instruction defect; keep scene-specific fixes in authoring workspaces. Run the
   relevant full gates and exact archive/platform checks after changes. CPU geometry
   images do not establish PBR/material fidelity. Retain unresolved visual or
   workflow limitations explicitly and obtain owner review where taste matters.
7. **Publish and verify.** Use semantic versioning for the final change. The current
   additive candidate is 1.1.0; 1.0.0 is already published and must not be replaced.
   Align package/engine/plugin identities, changelog, README and site. Present the
   qualified main-branch archive for existing release approvals, publish to npm's
   `latest` tag and create the matching GitHub release/tag at its actual source.
   Verify registry version, provenance/integrity, clean installation and representative
   workflows. Publish the approved static site/docs and verify its visible version,
   links and media. Vendor submissions and hosted launch stay with the later work.

## Acceptance

- Private hosting handoff is committed on private main and its required checks
  pass; deferred work and credential boundaries are clear to a new agent.
- Public release CI passes for the exact candidate. #158 failures are explained
  and resolved without masking failing behavior or broad retry loops.
- README and site give a truthful npm-first onboarding path and show real Troy
  imagery; no stale version or unsupported hosted-ready claim remains in current
  user guidance. Dated records retain their historical meaning.
- Blind runs cover both delivery paths and both requested harness/model routes, with
  independent artifact/render inspection and preserved failure/assistance records.
- The approved follow-up is actually published on npm with the corresponding
  GitHub release/tag, and post-publication installed use is verified.
- A final report distinguishes completed work, remaining limitations, exact
  versions/commits and any owner-facing choices. Community contributions are untouched.

## Authorization

The owner explicitly authorized saving and merging the stabilized private hosting
handoff to private main. Continue authorized public implementation and tested
`codex/` commits/pushes. Preserve the established approval gates for public main
merges, npm publication, release tags and site deployment; present concrete tested
candidates. Put decisions/authentication in the question tool/browser when needed,
and continue independent work without repeating settled decisions. Do not create
new subscriptions, run deferred cloud trials or resume directory outreach from
this goal statement.
