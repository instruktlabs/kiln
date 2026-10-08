# Public Kiln release goal

Updated 7 October 2026 following the owner's explicit scope change. This replaces
the earlier requirement to launch hosting before completing public documentation.
The private application handoff is merged on private main at `d71e66d`, with all
five required checks passing. Another agent can resume from its `HANDOFF.md`. Hosted deployment and directory submissions are deferred and
are not completion requirements for this public release cycle.

## Goal statement

Finish, qualify and publish Kiln 1.1.0 with clear onboarding and demonstrated
end-to-end use. Stable 1.0.0 is already published; this goal delivers its follow-up.

First finish the maintained README, repository/skill/plugin documentation and
website audit. Keep the README concise and npm-first, retain the real Troy images,
complete historical-example archiving without rewriting history, and preserve
the website archive and regression inputs. Make released functionality, candidate
features and deferred hosting unambiguous. Freeze a committed candidate before
formal blind testing; earlier exploratory runs do not qualify it.

Finalize the implemented existing-project setup, safe upgrades, shared stores,
public host SDK exports, renderer repairs and local plugin packaging. Resolve
required CI failures and check current official Codex/Claude Code plugin guidance.
Avoid unrelated engine features or an exhaustive test matrix.

Run independent, minimally prompted clone-and-setup, public-npm-install and live
Codex-plugin first-use tracks. Use AGY Gemini 3.8 Flash High and OpenCode Muse Spark
1.3 Contributor for the selected clone/npm runs; cover new workspaces and existing
projects across the campaign. Codex credits are available; Claude Code gets
offline/package/setup checks only. Test the unpublished 1.1.0 archive separately
and distinguish it from registry runs. Audit isolation, actual tool traces,
rendered artifacts, refinement, save/reopen/export and user-file preservation.

Fix demonstrated engine, setup, packaging or guidance defects and rerun affected
paths with fresh agents. Qualify the exact final package across supported CI
platforms, keep credentials/private hosting out of public artifacts, and complete
the approved main merge, npm publication, matching GitHub tag/release and static
site deployment. Then verify fresh registry installation and representative use
of published 1.1.0, plus deployed documentation, links and Troy imagery.

The end state is a published, usable Kiln 1.1.0 with consistent docs and local
integrations, retained test evidence and explicit remaining limitations. Local
use remains account-free and agent/harness agnostic. Preserve separate approval
and authentication handoffs for qualified main merges, publication, release tags
and deployment; continue authorized fixes and tested branch commits/pushes.

Preserve public repository identity, history, stars, forks, releases and community
issues/PRs. The first-time contributor's PRs #140–142 remain outside this work.
Keep private hosting source, operational credentials and user assets out of public
commits and npm artifacts. Do not launch or advertise a ready hosted service.

## Delivery sequence

1. **Private hosting saved.** The tested handoff is already on private main at
   `d71e66d`; research, implementation, decisions and remaining launch work are
   preserved. No further hosted deployment, cloud trial or directory outreach is
   required in this public release cycle.
2. **Reconcile public state.** The six superseded remote branches have been removed
   after exact-tip and private-import verification; `main` and active PR #158
   remain. Local branches, worktrees and contributor PRs are retained. PR #158's
   renderer reconnection, plugin inventory and stale-documentation checks are
   repaired; all twelve engine/package jobs pass at `b14cbd9`. The subsequent
   archive and documentation changes require their own passing candidate checks.
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
4. **Verify Troy imagery.** Real Troy coast and city views are committed in the
   README and link to the maintained scene. Check their rendering and links in the
   final site and GitHub presentation. Do not fabricate screenshots or imply that
   historical showcase assets are quality baselines.
5. **Freeze documentation, then run blind dogfooding.** Finish the maintained-docs,
   skills, plugin and archive audit before starting release-qualification runs.
   Check the setup commands and links in both the checkout and installed archive;
   regenerate derived plugin files and tool references rather than editing their
   copies independently. Record one committed candidate and its package hash.
   Earlier exploratory runs may identify problems but do not qualify this final
   onboarding set. If a demonstrated defect changes the onboarding guidance,
   repeat the affected path with a fresh agent after the correction.

   Use fresh independent agents with no inherited release
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
   Use separate entry-point cohorts: repository agents receive the repository
   and candidate ref; npm agents receive only the public package identity
   `@instruktlabs/kiln` and the request to install it from npm and dogfood it.
   Do not preinstall either distribution or give npm agents a repository
   walkthrough. A local tarball qualification is a third, separate check and
   must not be described as a public-registry blind run. Before publication,
   registry runs exercise published 1.0.0; after 1.1.0 promotion, repeat with fresh
   registry-installed sessions and record the version actually installed.
   Add one bounded Codex-plugin installation/first-use track with a live Codex
   session. The owner confirmed Codex credits are available; Claude Code credits
   are not, so Claude checks remain package/manifest/setup qualification without
   a live Claude model run. No credit purchase or paid fallback is authorized. Cover
   new/existing projects across the campaign rather than expanding into every
   harness/distribution permutation. Mine traces and fix demonstrated friction;
   do not add speculative features merely to extend the campaign.
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

## Current scope and remaining work

| Area | Implementation and remaining qualification |
| --- | --- |
| Engine and npm package | Public `src/`, `scripts/`, `package.json`; 1.0.0 is published. Candidate 1.1.0 adds host SDK exports, setup improvements and renderer fixes. Resolve CI findings and qualify the final installed archive; no unrelated engine feature expansion is planned. |
| Shared project setup | `scripts/create-workspace.mjs`, workspace helpers and maintained `skills/`; adoption, safe upgrades and shared stores are implemented. Fresh blind new/existing-project runs still need to qualify the final documented experience. |
| Local plugins | `plugins/kiln-engine/`, generated by `scripts/package-local-plugin.mjs`; Claude Code/Codex catalogs select this setup bundle. The engine pin and generated hashes must match. Setup installs the workspace's author/refine/QA skills; one plugin setup skill is intentional. Root plugin manifests are legacy compatibility entry points and need clear migration guidance. |
| Public docs and site | README, maintained `docs/`, skill/agent guides and `site/`; npm-first README/install refresh and real Troy images are committed. Complete the broader Markdown and archived-example audit, check links/commands and build the full site before final blind runs. |
| Historical examples | Remove the old collection and obsolete promotion helpers from the active tree, retain pinned Git-history restoration for the website archive and corpus checks, and preserve the small fixtures required by targeted tests. No new teaching collection or Discovery indexing. |
| Private hosting | Implementation and handoff are on private `instruktlabs/kiln-hosted` main. Public `plugins/kiln-hosted/` contains draft integration metadata and portable guidance only. Deployment, cloud trials, hosted authentication qualification and vendor submissions are deferred. |
| Release | After final blind runs and repairs, complete exact-candidate CI, approved main merge, npm promotion, matching GitHub release/tag and static-site deployment; verify public installation and served documentation. |

The owner clarified that completed documentation must precede formal blind
dogfooding. The three runs started during the incomplete audit on 7 October are
exploratory only. Preserve their traces and findings, let admitted work finish,
and start no additional campaign runs until the documentation gate above passes.
Dated research/review records remain historical; current user instructions must
not direct readers to stale commands or present those records as release acceptance.

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
