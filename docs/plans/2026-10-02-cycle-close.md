# Cycle close before the trip: plan of record (2 October 2026)

**Later hub direction:** the owner has deferred the full Troy scene until core, existing
assets/scenes, upgrades and Cloudflare delivery are aligned. The current work queue is
[Kiln alignment before Troy](2026-10-02-core-scenes-site-alignment.md). This document
retains the cycle-close scope, decisions and verification as their dated record.

Written 14:05 -04:00, revised 14:40 after the owner's direction ("finish what can be committed, pushed, merged and deployed before the trip; clear-cut engine defects confirmed by the adversarial review go in; tricky or undetermined work waits for the hub and is documented") and after the engine module review.

Owners: **F** = the engine session (orchestration, merges, releases, hub sync), **O1** = Opus agent landing the scenes work (PR 1), **O2** = Opus agent fixing the clear-cut engine defects (PR 3), **Owner** = Matt, who continues on the hub (his Linux laptop) after the trip.

## 1. Verdict on the draw-optimization branch

**What it is.** 25 local commits on `c734e2a`: 18 scenes, 2 compose-scene skill, 4 records, 1 engine (`e72b610`). Runtime-only scene optimizations (merge by material within anchors, cached sun shadow with stand-ins, MSAA discard, count probe, A/B timing runner); no GLB, pack, site, `dist/` or `src/` change apart from `e72b610`, which nothing imports. Scenes gates on the tip: typecheck and lint clean, 533 pass / 22 skip / 0 fail. No file overlaps 0.10.0; a trial merge onto `main` is clean.

**What is proven vs reported.** Every draw, frame-time and byte figure is the author's: the evidence (5.6 GB) is in ignored folders, none of it committed or re-derivable on this PC. Counts came from committed tooling and are deterministic; timing came from the quiet hub and the tablet under the owner's rules. The committed numbers are the AFTER baselines only (Farm `x02-baseline.json`, Foundry `count-baseline.json`, Golden Gate `PERFORMANCE.md`). The headline table (Farm landing 583 → 283 draws settled; Golden Gate arrival 432 → 103; Foundry campus pipelines 21 → 10) is author-reported. The Farm is the only scene the site ships from source, so the site's Farm build check and the deployed look are the real acceptance.

**Disagreements with the agent's plan as written.**
1. Its 12-item "landing" goal is mostly new work (reversed depth with three renderer adaptations and two-backend parity; reflection content; a banks flag; the trailer exemption; thin-line budgets; timing-runner columns; four tooling items; profile cleanup) plus two hours of hub timing and two paid dogfood sessions. The hub is the laptop; none of that runs before the trip. Split: land what exists now, do the new work after.
2. The committed records still carry the six errors the agent itself listed (D30), four private links, stale counts and `tmp/` citations that read as committed. PR 1's records commit fixes them.
3. D8 (trailer shadows at economy) was answered yes but not implemented; it needs captures and a re-baseline, so it is recorded as adopted-deferred.
4. Wiring `optimize: 'full'` is not "unreachable by tools": `KILN_BAKE_OPTIMIZE` is the evaluator default for every render that omits `optimize`, two view paths (`renderCodeViewGrid`, `rasterizeComposedScene`) render bare, and the rebuild CLI replays a manifest's recorded `optimize`. A revision saved under `full` would rebuild to different bytes after the wiring. This, not the draw savings, is the risk to users.
5. The handoff's owner-only questions were never asked (Kiln Studio's `optimizeGlbBytes` mode; placement wrappers as boundaries; the named-node contract). They stay open for the hub.
6. The batch timestamps were estimated, then corrected from the transcript; the committed times now agree with the commit times. Process note.
7. Golden Gate's gzip headroom after this branch is 6.3 KB; the next Golden Gate change hits the bundle ceiling. Known cost of the post-trip work.
8. The compose-scene skill (+69 lines) ships without a dogfood run; accepted, dogfood after the trip.

**Engine modules, adversarial review (14:35).** `src/rigid-merge.ts` and `src/extension-compat.ts` are sound: 28 of 28 tests pass; baking of positions, normals and tangents (inverse-transpose, `w *= sign(det)`, winding reversal) verified by probes; deterministic output (two builds byte-identical); boundaries, locks, shared meshes, partial-mesh merges and animation targets behave as specified; the wiring patch ports mechanically onto `main`. **Not landable as one engine PR until** six items are done, each needing design or a decision:
- D2 "copy a shared mesh at most 4 KB per saved draw" is not implementable as drafted: the variant only widens `expandSharedMeshes` to a predicate that runs before buckets exist, so the saved draw is unknowable; a usable definition is `bakedBytes(mesh) ≤ 4096` (float32 POSITION/NORMAL/TANGENT plus index bytes) decided in `nodeLock` and reported on the lock entry, then re-measured.
- `MSFT_lod` referenced levels are not boundaries (only the node carrying the extension is): an in-scene lower level absorbed a wall's triangles in a probe. Kiln-written chains are safe because the exporter moves levels off-scene; `optimizeGlbBytes(…, 'full')` on an imported GLB is not.
- The wiring drops the merge summary: a rejected bucket yields `mode: 'full'` with unchanged draws and no warning. `OptimizeSummary` needs a `merge` block and `renderGLB` the warnings.
- The bake frame is the first contributing node with no conditioning check (a `[1, 1e-6, 1]` scale passes `isSingular` and bakes the bucket at ×1e6); choose the best-conditioned world matrix deterministically.
- D3 (split at 65,534 vertices) exists in the variant as an opt-in option, is not passed by the patch, and has no test; the rule is vertex count, not largest index.
- The rebuild and env consequences (item 4 above) need a recorded pipeline version in `rebuildOptions` and a Breaking CHANGELOG entry.
Plus missing tests (D2/D3 cases, in-scene LOD levels, partial-mesh and cross-group shared meshes, determinism through `consolidateMaterials`, UV/COLOR/texture-transform layouts, quantized primitives, a full `renderSceneToGLB` geometry assertion, a pre-wiring `full` manifest). Notes for later: lock reports keyed by node name are ambiguous; the apply phase is outside the per-bucket try/catch; `extension-compat`'s malformed-JSON path throws a raw `SyntaxError`, `unverified` profiles can never say `blocked`, and the Godot/Unity/Bevy allowlists rest on citations the tests merely pin.

**Clear-cut defects in the current engine (fixed now, PR 3):** the D34 hazards, which exist on `main` today. (1) `src/kit.ts` packs occlusion into the metallic-roughness image and points the occlusion texture at the metallic-roughness UV set without checking that the two sets match, so a baked AO map on UV1 would be sampled with UV0. (2) `src/render.ts` and `src/__tests__/optimize.test.ts` cite `docs/kiln-material-consolidation-cycle.md`, which exists on no branch. (3) `KILN_BAKE_OPTIMIZE` and `KILN_BAKE_INSTANCE` are read in `local-runtime.ts`, `render.ts` and the registry and documented nowhere; the two bare view renders inherit the env default while tool renders pin `off`.

## 2. Phase 0 (F): done
- PR #129 (Kiln 0.10.0) merged as `9375d04`; tag `v0.10.0` and the GitHub release with the CI tarball, six receipts and `SHA256SUMS.txt`.
- PR #130 (install guide, README and site copy for the download) merged as `a396612`.

## 3. Phase 1 (O1, then F): PR 1, the scenes landing
- 1.1 New worktree `kiln-draw-landing`, branch `draw-optimization-landing` from `origin/main`; cherry-pick the 24 non-engine commits.
- 1.2 Records commit: D30's six errors, private links replaced, stale counts, `tmp/` citations labelled ignored, `scenes/DECISIONS.md` D-65 onward with the owner's answers and "adopted; implementation after the trip" where the code is not in this PR, a dated log row in the landing plan.
- 1.3 D24 compose-scene corrections; `check:skills`.
- 1.4 Gates: check:skills, root typecheck and lint, `bun test scripts`; scenes typecheck, lint, test; `dist/` byte-identical to main.
- 1.5 Push, open PR 1 (no merge). F reads CI (the Website job builds the Farm from this source) and squash-merges.

## 4. Phase 2 (O2, then F): PR 3, the clear-cut engine fixes
- 3.1 Branch `engine-d34-fixes` from `origin/main` in a new worktree `kiln-engine-fixes`.
- 3.2 Test first: `src/kit.ts` occlusion packing checks the UV sets; when they differ the material keeps its separate occlusion texture and the summary says so.
- 3.3 Remove the two citations of the missing doc.
- 3.4 Document `KILN_BAKE_OPTIMIZE` and `KILN_BAKE_INSTANCE` where the runtime environment is documented, including that tool renders pin `optimize: 'off'`, that a render which omits `optimize` takes the env default, and that a saved revision rebuilds with the `optimize` its manifest recorded.
- 3.5 CHANGELOG: an "Unreleased" section above 0.10.0 with the three entries. No version bump: the package stays 0.10.0 and `main` is ahead of the release, as the install guide allows.
- 3.6 `node scripts/build-runtime.mjs all`; gates: typecheck, lint, test, test:render-service, check:skills (coverage runs in CI); the plan file `docs/plans/2026-10-02-cycle-close.md` (this document) committed in the same PR.
- 3.7 PR 3; F merges after PR 1.

## 5. Phase 3 (F; the deploy on the owner's word): the site
- 3.1 Launch-mode `bun run build` from clean `main` (after PR 1 and PR 3), the site's validation, `site/scripts/deploy.ps1 -DryRun`.
- 3.2 Deploy (ships the 0.10 download instructions and the optimized Farm); verify `build-info.json`, home, install and the Farm scene live.
- 3.3 No new tag: the package is still 0.10.0 (`e1ce85d7…`).

## 6. Phase 4 (F): hub sync
- 4.1 Done: `~/X/kiln` on `main` at the merged docs commit; the raw `draw-optimization` branch pushed over SSH into `~/X/kiln` (never to GitHub: its records carry the private links until PR 1 fixes them) and checked out as the worktree `~/X/kiln-draw-optimization` at `4a1d238`; its ignored evidence copied by tar over ssh (18,195 files: `tmp/drawcalls`, `scenes/evidence`, `scenes/.tmp/build-src/{draw-base,flicker-revz2}`; counts verified both sides).
- 4.2 After the merges: `~/X/kiln` to the final `main`; `bun install --frozen-lockfile` at the root and in `scenes/`; the landing branch fetched.
- 4.3 The private evidence repository (`~/X/kiln-dogfood/v1-readiness-2026-10`) pulled; this PC's `tmp/harness-probe` committed into it.
- 4.4 The Troy workspace repaired to the hub's runtime (`create-workspace.mjs … --repair`, `kiln.mjs init --check`).
- 4.5 `~/X/START-HERE.md` on the hub: every folder, what is where, the next steps (this plan's section 7).
- 4.6 A cleanup list for the owner (worktrees and branches on this PC; decision 34).

## 7. After the trip, on the hub
- **Engine PR (0.11.0):** `e72b610` plus the six review items above, the wiring, D2 and D3 with tests, the three "falls back to palette" texts, a Breaking CHANGELOG entry, a pipeline version in `rebuildOptions`, one `dist/` rebuild, the full gate and a fresh clone; then D23's output-only draw signals, the authoring and QA skill proposals, and dogfood in Agy and OpenCode. Open questions first: Q1 does anything outside the repository call `optimize: 'full'` (Kiln Studio's `optimizeGlbBytes`); Q2 placement wrappers as boundaries (recommended: one `keep` at the `composeSceneGLB` call site); Q3 keep the named-node contract rather than plumbing `keep` through `RenderSceneOptions` (recommended: keep).
- **Scenes PR 1b:** D15 reversed depth with D5 and D6 (watch the Golden Gate gzip ceiling), D8, D16, D18, D19, D32; the hub timing (D21) on the quiet laptop; the compose-scene dogfood (D31). Then D20 tooling, the D22 stalls, D26 correctness, D27 run-time layout, the D29 reseal of Golden Gate and Foundry Floor with an approved upload, the D33 GPU cycle.
- **Troy:** the asset revisions the owner listed, the real battle scene under `scenes/packages/`, the gallery (needs pinned-material support in the site build), the pack's move into the scenes workspace. The handoff is `packs/troy/HANDOFF.md`.

## 8. Decisions
- A (the split), B (no 0.11.0 now; clear-cut fixes land without a bump) and C (one site deploy after the merges, on the owner's word): taken by the owner's direction of 2 October, 14:00 to 14:20.
- Q1 to Q3: open, for the hub.

## 9. Hub readiness verification (2 October 2026)

The hub fetched and pulled `origin/main`: both the checkout and remote are at
`ac8456c` (#132), with a clean starting tree. PRs #129 through #132 are merged;
there are no open PRs. CI and Website passed on that commit. The package remains
0.10.0 with the three engine fixes under `Unreleased`; the rigid-merge and
extension-compatibility modules are still only on the raw `draw-optimization`
branch at `4a1d238`. Its worktree, wiring patches and ignored evidence are intact.
The private evidence repository is also current with its remote at `3cdd416`.

Readiness changes, left uncommitted for review:

- Fix `scenes/scripts/check-pins.ts` to read this integrated checkout's engine,
  site, renderer and toolchain instead of the old Windows worktrees. The relocated
  filesystem test failed on the old path and passes with the fix; it also verifies
  detection of a changed engine pin.
- Refresh contributor validation/version guidance, scene checks, the Troy setup
  commands and the hub's `~/X/START-HERE.md`. Preserve the earlier dated plans and
  evidence; the original landing goal's deferred items remain deferred.
- Upgrade the live Troy workspace's runtime metadata through managed setup. The
  initial refresh needed no managed file rewrites. After the owner approved the
  host's full OS upgrade for ChatGPT, install isolated Node 22.23.2/npm 12.0.2
  under `~/.local/share/kiln-toolchain/` rather than downgrade system packages,
  then repin `kiln.mjs` and `.mcp.json` through another managed upgrade. Existing
  local relocation/skill edits were preserved. Setup reports `current`; CLI
  Discovery resolves `~/X/kiln`. Restart a previously open harness/MCP session.

Local checks used Bun 1.4.2, Node 22.23.2 and npm 12.0.2:

| Check | Result |
| --- | --- |
| Root and scene frozen installs | No dependency or lockfile changes |
| All six runtime bundles | Source identities and bundle hashes match |
| Root toolchain, skills, typecheck and lint | Pass |
| Root `test:coverage` | 3,137 pass, 3 skip, 0 fail; functions 95.06%, lines 92.25%; ratchet passes |
| Render-service tests | 78 pass, 0 fail; no GPU required |
| Scene toolchain, pins, typecheck and lint | Pass |
| Scene portable tests | 525 pass, 30 fixture skips, 0 fail |
| Scene script tests (run separately) | 58 pass, 1 fixture skip, 0 fail |

After the owner's approved host OS upgrade, the full root coverage gate was
rerun: the same 3,137 passes, three skips and coverage percentages, with no
failures. Root toolchain, skills, typecheck and lint, all 78 render-service tests,
45 focused runtime/capture/material tests and the 11 scene-check tests also
passed. Scene toolchain/pins and the repinned Troy setup/Discovery checks remained
current. The official ChatGPT Linux preview was installed and its visible
XWayland launch verified; host installation, update and reboot notes are in
`~/X/START-HERE.md`. No reboot or GPU qualification was performed.

The raw branch's author-reported scene acceptance figures are still historical
evidence. These portable checks do not establish browser parity, GPU readiness,
quiet-host timing, pack acceptance or live dogfood. Those remain in section 7.

One queued engine defect was independently reproduced on current `main`:
materials A and B share a metallic-roughness texture but have distinct occlusion
maps, with red values 40 and 220. After `applyKitContract`, both occlusion slots
read 220 and the summary reports two successful packs with no skip. The UV and
transform guard in #132 does not prevent mutation of the shared image. Add a
focused failing test in `src/__tests__/kit.test.ts`, then preserve each material's
occlusion through a per-occlusion image copy or an explicitly reported skip.
