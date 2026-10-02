# Draw-call and frame-time optimization cycle: plan of record

Status: waiting for the owner to pass the goal statement at the end of this file. Nothing is implemented,
committed or timed until then. Written 2026-10-01 22:20 -04:00.

## Purpose

Make Kiln's scenes cheaper to render without losing their look, starting with the shadow pass and the
hazards the research found. This serves every scene (Farm, Foundry Floor, Golden Gate), not only the
Farm. It must also produce a report that feeds back into the tooling, skills and project conventions
for authoring scenes and assets.

## Inputs

- Research report (24-agent sweep with verification, repo map and experiments):
  `tmp/drawcalls/research/asset-optimization-frontier.md`. This file is gitignored and copied from the
  main checkout. Its section 3 ranks the levers and section 8 is the roadmap; this cycle is its Phases 0 and 1.
- Measured Farm baseline (desktop RTX, headless Chrome, 1920x1080, high tier, PC under load, indicative):
  - 583 draws per frame: 270 in the 2048² sun shadow pass and 313 in the main pass.
  - About 2.3M triangles per frame and about 6.3 ms per frame.
  - 14 hero placements hold 195 meshes, which account for about 390 of the 583 draws.
  - What-if tests:

    | Variant | Draws per frame | Frame time |
    |---|---|---|
    | Shadow frozen | ~313 | 4.3 ms |
    | Heroes hidden | ~188 | 3.5 ms |
    | Casters under 300 triangles off | ~378 | 5.4 ms |
- Tablet (Galaxy Tab S9 FE), economy tier, from the research follow-up:
  - The GPU is the limit, with an unlocked frame of 24.9 ms.
  - Shares of that frame: vegetation ~37%, 4x MSAA ~21%, shadow pass ~12%, heroes 0.9 ms.
  - p95 is 33.6 ms against the 33.3 ms rule.
- Count snapshots of the other scenes (2026-10-01 22:40; built standalones in `scenes/.cache/site-inputs`;
  headless 1920x1080; one camera each; counts only; scratch probe `tmp/drawcalls/scene-snapshot.mjs`):

  | Scene and view | Draws per frame | Per pass | Triangles | Notes |
  |---|---|---|---|---|
  | Golden Gate overview | 432 | shadow 74, main (MSAA 4x) 179, planar water reflection at half resolution 178 | 1.54M | No instancing; bridge has 165 meshes (150 cast); terrain 464k triangles |
  | Golden Gate "Drive the sedan" | 410 | shadow 148, main 133, reflection 128 | 1.69M | Traffic is 13 meshes |
  | Foundry Floor campus | 102 | main 101, no shadows | 137k | 17 instanced meshes |
  | Foundry Floor fab ("Enter the fab") | 129 | main 128, no shadows | 205k | Already merged per (class, part, LOD), with detail and lod pairs; 21 transparent meshes |

  Each scene has a different dominant cost:
  - **Farm:** the shadow pass and its 14 moving hero objects.
  - **Golden Gate:** three full scene passes, of which the water reflection is a second extra pass.
  - **Foundry Floor:** already lean. It is the reference pattern (anchor bake) and the control scene.
- Confirmed hazard: `consolidateMaterials` in `src/render.ts:1451-1489`.
  - With `mode:'full'` it runs `flatten()` and then `join({keepNamed:true})`.
  - Every Kiln node is named, so the join merges nothing.
  - Flatten moves the farmhouse door out from under `Joint_FrontDoor`, and that pivot is then pruned.
  - Result: 16 → 16 draws, and the pivot is lost.

## Owner decisions (2026-10-01, about 22:00-22:18 -04:00)

| Id | Decision |
|---|---|
| OD-1 | Work in a new worktree off `main`: `C:/Users/Mattm/X/kiln-draw-optimization`, branch `draw-optimization`. Scene work goes ahead now; it does not overlap `v1-readiness`, which changes no file under `scenes/`. Model-facing engine changes (tool output, authoring and QA skills) wait until `v1-readiness` merges, then rebase. |
| OD-2 | This cycle covers Phases 0-1 of the research roadmap, then stops and reports. Owner note: the work is for **all scenes**, and its findings must feed a report that upgrades or aligns the tooling, projects and skills for authoring scenes. |
| OD-3 | Success measure: frame time first, with draw count also reported as a headline metric ("a metric that a lot of devs look at"). This PC is often under load, so timing must come from clean data. |
| OD-4 | Look: **small shadow changes are OK**. Tiny parts may stop casting, and stand-in shadow outlines may differ slightly. Everything else stays at parity (D-20 baseline). |
| OD-5 | Measurement: count metrics (draws, triangles, pipelines, CPU draw-call counts) may run anytime on this PC. Timing comes only from quiet hosts, with interleaved before/after (A/B/A/B) runs. |
| OD-6 | Tablet: the coordinator may schedule tablet timing runs. Use the device kit, only while the tablet is quiet and cool, and remove port mappings after each run. |
| OD-7 | The tablet rule stays p95 ≤ 33.3 ms. Also report the share of frames within one and within two display refreshes, so a restatement can be decided with data. |
| OD-8 | X-02 (draws and triangles within 2% of the sealed pilot at high) is re-baselined on the optimized build. Pixel parity against the pilot remains. |
| OD-9 | Moving objects: a cached static sun shadow plus a small live map for movers, with both sampled. |
| OD-10 | MSAA store-op: first confirm it is a real issue, with an adversarial review. If confirmed, implement an elegant solution and make a **private** artifact covering the issue, how it was found and what a fix would be. Never open a three.js issue or PR. Owner's words: "i don't want to slop spam AI generated PRs or issues for three.js". |
| OD-11 | The shadow work applies to all three scenes: Farm, Foundry Floor and Golden Gate. |
| OD-12 | The tablet stays on the minimal tier (D-25). Bring economy before/after numbers; any tier change is the owner's call. |
| OD-13 | Commit locally on `draw-optimization` in logical steps. No push. Push and PR are decided by the owner afterwards. |
| OD-14 | No changes to `site/` and no deployment. Scene builds and staging happen only inside the worktree. |
| OD-15 | End report: a private artifact page (per-scene before/after, quiet-host timing, parity images, open decisions, feedback map), plus a dated `docs/reviews/` record on the branch. |
| OD-16 | Feedback is applied now to `skills/kiln-compose-scene/` and its runtime-scenes reference, which `v1-readiness` does not touch. Authoring and QA skill changes, tool-output changes and project-convention changes are written as proposals in the report. |
| OD-17 | (22:35) Analyse and implement across **all** scenes, not only the Farm. Testing Foundry Floor and Golden Gate (robots, cars) gives more useful perf data and a better feedback loop for judging whether the approach is right. |
| OD-18 | (22:45) Beyond Phases 0-1, also implement the scene-side merges that each scene's diagnosis proves look-neutral, in scene-kit and scene code only, with no engine changes. Examples: Golden Gate bridge parts merged by material; a Foundry-style anchor merge for the Farm's moving heroes, with each moving group kept separate. Stand-ins cover every extra pass: the shadow pass and Golden Gate's planar reflection. |

## Defaults set by the coordinator (owner may edit)

- **Pivot fix (Phase 0).** `optimize:'full'` merges primitives by material only within rigid groups. Boundaries are:
  - nodes targeted by animations;
  - `Joint_*` pivots;
  - nodes carrying Kiln semantic extras;
  - LOD and node-visibility nodes.

  `off` and `palette` outputs stay byte-identical. Proof uses the farmhouse: `Joint_FrontDoor` is kept, draws are ≤ 11, and triangles and world bounds are equal.
- **Extension compatibility check (Phase 0).** A library function, with tests, that flags extensions marked required against per-destination allowlists (Godot, Bevy, Blender, Unity glTFast, three). It adds no new tool output or schema, because that is model-facing (OD-1). How to surface it is proposed in the report.
- **Count probe.** A committed scenes script that builds each scene in test mode and records, per tier and named view:
  - draws per render pass (by instrumenting the WebGPU encoder);
  - pipelines and triangles.

  It uses the kit's existing test hooks instead of the ad-hoc React-devtools probe used in research.
- **Parity.** Reuse the existing B-06 parity tooling and thresholds per scene. Any shadow difference beyond the thresholds is captured as before/after images and listed for owner review under OD-4.
- **Timing hosts and rules:**
  - **Hub:** headed, 120 Hz, quiet check over SSH recorded beside each result.
  - **Tablet:** device kit, quiet and cool.
  - **This PC:** only when the kit's quiet check passes (CPU < 20%, GPU < 10%), and labelled indicative otherwise.
  - Results go under `scenes/evidence/perf/<host>-<date>/`, which is ignored; summaries go into the report.
- **Inputs.** Copy the ignored scene inputs (`scenes/.cache/site-inputs`, `scenes/packages/*/staged`, `scenes/packages/scene-kit/demo/staged`) read-only from the main checkout. Never write to the main checkout.
- **Toolchain.** Run `bun install --frozen-lockfile` at the root and in `scenes/`, then `node scripts/build-runtime.mjs all`. Run `bun run check:toolchain` first. This PC has Node 24.20.0 while the maintainer pin is 22.23.2; record what the check says and stop if it blocks a gate.
- **Process.**
  - Strict TDD for behaviour changes.
  - Opus orchestrates; Sonnet 5.5 subagents handle well-specified implementation.
  - An independent agent adversarially reviews each lever and the MSAA claim.
- **No live model runs.** No model-visible output changes this cycle, so no dogfood runs.
- **Decision record.** OD-1..OD-18 and the X-02 re-baseline are recorded as D-46 onward in `scenes/DECISIONS.md` in the branch.

## Boundaries

- Never edit, stash, switch branches or clean in `C:/Users/Mattm/X/kiln-oss` (main checkout) or `C:/Users/Mattm/X/kiln-v1-readiness`.
- Do not edit files that `v1-readiness` changes. Check with `git -C ../kiln-v1-readiness diff --name-only main...v1-readiness`. Typical ones:
  - `src/tools/*`
  - `src/tools/review-detail.ts`
  - `skills/kiln-author-asset/*`
  - `skills/kiln-qa-asset/*`
  - the export-profiles references
  - the setup skills
- `src/render.ts` is touched there by 24 lines. Keep the Phase 0 edit inside `consolidateMaterials` and nearby helpers, and note the overlap in the report.
- Never push, never touch `site/`, never deploy, never post upstream, never spend money.

## Steps

**S0. Provision**
- Install, build the runtime and copy the inputs.
- Run the engine gates (`bun run typecheck`, `lint`, `test`, `test:render-service`, `test:coverage`) and the scenes gates (`bun run typecheck`, `lint`, `test` in `scenes/`) to confirm a green baseline.
- Record anything already red as pre-existing.

**S1. Per-scene diagnosis (OD-17)**
- Turn the scratch probe into a committed scenes script.
- For Farm, Foundry Floor and Golden Gate, at every tier, run every named view and workload rather than only the landing camera:
  - Farm: overview, walk, tractor drive.
  - Foundry Floor: campus, the fab, One pair, Arrival, The split, the sedan drive.
  - Golden Gate: overview, the sedan drive, flyovers, golden hour, fog.
- For each, record:
  - draws per pass;
  - pipelines;
  - triangles;
  - attribution by system and asset;
  - count-only what-if toggles (hide a system, freeze shadow, freeze reflection, drop small casters).
- Then rank each scene's levers from its own data.
- Foundry Floor is the control scene and the reference pattern (anchor bake, LOD pairs). Record what it does that the others should borrow.

**S2. Phase 0 engine**
- Pivot fix by TDD.
- Extension compatibility check by TDD.
- Commit.

**S3. MSAA investigation (OD-10)**
- Read the three r186 WebGPU backend source for render-pass store ops on multisampled colour and depth when a resolve target exists.
- Count encoder store/discard ops in the Farm.
- Measure on the tablet only within OD-6.
- An independent agent tries to refute the claim.
- If confirmed: implement in scene-kit through the narrowest stable surface, with a test that fails loudly if three changes; make the private artifact; commit.
- If refuted: record why and drop it.

**S4. scene-kit shadow features, by TDD**
1. Shadow-layer stand-ins: material-free merged depth meshes per rigid group, with source meshes excluded from the shadow pass.
2. A cached static shadow map plus a small live mover map, sampled together. It must handle the first-frame `needsUpdate` hazard and never share one light between two shadow nodes.
3. A texel-size small-caster threshold.

Each is a kit option, off by default. Commit.

**S4b. Extra-pass stand-ins and look-neutral scene merges (OD-18), by TDD**
- Generalise the shadow stand-ins to any extra pass. Golden Gate's planar water reflection draws stand-ins, or only large silhouettes, instead of the full scene; its update cadence is only reduced if parity holds.
- Scene-side merges proven look-neutral by S1:
  - Golden Gate bridge parts merged by material.
  - Farm heroes merged Foundry-style per anchor and material, with every moving group (doors, wheels, limbs, gates) kept as its own node so colliders, doors and the frame graph keep working.
- Each merge keeps per-object interaction intact and passes B-06.
- Foundry Floor gets no new shadows, since that would change its look. It receives the MSAA fix if S3 confirms it, plus counts and timing.

**S5. Enable per scene**
- Turn the features on in Farm, Foundry Floor and Golden Gate (Golden Gate already moves its shadow with the focus; integrate rather than replace).
- Build standalones in the worktree.
- Run the count probe and B-06 parity per scene.
- Show any shadow differences as images.
- Commit.

**S6. Timing (OD-3, OD-5, OD-6, OD-7)**
- Interleaved A/B on quiet hosts per scene and tier.
- Report p50/p95, the refresh-share view, hitch-rule counts (D-41) and load samples.
- Measure tablet economy before/after (OD-12).
- If no quiet window opens, list the pending runs with their exact commands.

**S7. Feedback (OD-16)**
- Update `skills/kiln-compose-scene/` and its runtime-scenes reference with the proven techniques and their measured effect. Run `bun run check:skills`.
- Record the X-02 re-baseline and OD-1..OD-18 as D-46 onward.

**S8. Report (OD-15)**
- Write `docs/reviews/2026-10-0X-draw-optimization.md`:
  - per-scene before/after, timing and parity;
  - a cross-scene comparison: which lever worked where, which did not, and why;
  - a feedback map of proposed changes (engine tools, authoring/QA skills, scene-kit, project conventions) with evidence.
- Publish a private artifact page with the same content.
- Run the final gates in both workspaces.
- Commit.
- Stop.

## Progress log

- 2026-10-01 22:20: Worktree created at `c734e2a` (main = origin/main). Plan written. Waiting for the goal.
- 2026-10-01 22:50: OD-17 and OD-18 added after count snapshots of Golden Gate and Foundry Floor. S1 widened to a per-scene diagnosis; S4b added. Goal statement updated.
- 2026-10-01 23:00: Goal passed; cycle started.
- S0 toolchain and install: `check:toolchain` passes (metadata Bun 1.4.2, Node 22.23.2, npm 12.0.2; this PC runs Node 24.20.0). Root install took 249 packages and `scenes/` took 73. `node scripts/build-runtime.mjs all` rebuilt `dist/` byte-identical (no git diff).
- S0 inputs: copied read-only from the main checkout:
  - `scenes/.cache/site-inputs`: 246 files
  - `foundry-floor/staged`: 87 files
  - `golden-gate/staged`: 105 files
  - `scene-kit/demo/staged`: 7 files
- S0 scenes gates: typecheck, lint and test are green (378 pass, 22 skip, 0 fail).
- S0 engine gates: all green.
  - typecheck and lint pass.
  - test: 3,042 pass, 2 skip, 0 fail.
  - test:render-service: 78/78.
  - test:coverage: functions 95.22% (minimum 94.00%), lines 92.48% (minimum 92.10%).
- S1-S4 code maps launched (read-only workflow): probe infra, shadow internals, Farm, Golden Gate, Foundry, MSAA, engine Phase 0.
- 23:25: Code maps done; the MSAA, shadow and engine maps were also reviewed adversarially. Files are in `tmp/drawcalls/understand/`.

  **MSAA:** confirmed with a narrower scope. three r186 always stores the 4x colour and depth of the canvas frame-buffer target. That is wasted where the main pass is never split (Farm, Foundry Floor, Golden Gate low tiers) and required where `viewportDepthTexture` splits it (Golden Gate medium and high). It is a conservative default, not a three.js bug. Use the corrected design with trip-wires.

  **Shadows:**
  - Combine the two maps with `min` rather than `mul` (exact at shadow intensity below 1).
  - Classify movers per node from observed motion, not per frame-graph root.
  - Build stand-ins before freezing transforms.
  - Re-arm the static map at reveal.
  - Pin tests against `build/three.webgpu.js`.

  **Golden Gate:**
  - The shadow map renders twice per frame (the reflector's camera triggers a second render). Rendering it once per frame is look-neutral.
  - The reflection draws traffic and fog banks, against its own spec. Fixing that changes pixels: **owner decision, not applied.**
  - The texel-snapped shadow camera moves on almost every drive frame, so S is re-rendered by fit key.

  **Engine:**
  - Editing `src/render.ts` forces a `dist/` rebuild, which `src/__tests__/mcp-bundle.test.ts` checks byte for byte. `dist/*` are v1-readiness files.
  - **Stop rule:** the `optimize:'full'` wiring is held for an owner decision. Phase 0 ships as new unbundled modules: `src/rigid-merge.ts` and `src/extension-compat.ts`.
  - The merge must handle tangents itself (gltf-transform's helper corrupts rotated ones), lock BLEND materials, and treat relationship targets as boundaries.
- 23:29: Wave A launched: S1 probe and baseline diagnosis, S2 engine modules, S3 MSAA policy. Each is adversarially reviewed and fixed.
- 2026-10-02 00:19, S2 tangent deviation (reviewer accepted): `mergeMirroredTangents` defaults to false. The spec's unconditional `w *= sign(det)` would flip three's bitangents on mirrored normal-mapped parts. three r186 builds the bitangent as `cross(N, T) * w` with no determinant term: `src/renderers/shaders/ShaderChunk/normal_vertex.glsl.js:9-15` negates it only under `FLIP_SIDED`, and `src/nodes/accessors/Bitangent.js:18,58` matches. So by default a tangent-bearing primitive joins only parts of the same world handedness, which both renderer conventions draw the same way. The opt-in applies the spec's rule.
- 2026-10-02 01:03-01:06: Wave A committed after review and fixes.
  - `417da63`, S1 probe. 204 fixtures, all stable. GPU draws equal JS draws everywhere, and every what-if restores its baseline. Baseline is `scenes/evidence/counts/draw-base/`.
  - `e72b610`, S2 modules: `src/rigid-merge.ts` and `src/extension-compat.ts`.
    - farmhouse: 16 → 11 draws; `Joint_FrontDoor` keeps 2 primitives and 132 triangles; triangles equal at 4,080; bounds drift 0; validator 0/0.
    - The test failed first: `rigid-merge.red.log`, expected 11, received 16.
    - The `optimize:'full'` wiring is held for the owner; the patch is in `tmp/drawcalls/phase0/wiring.patch`.
  - `ced34bb`, S3 MSAA discard knob.
    - Browser: 190 frames with discard active, 0 errors.
    - Golden Gate balanced/high fail loudly when discard is forced.
    - Pixel diff within noise; B-06 144/144.
    - Mutation tests: 14/14 caught.
    - Hygiene on the three `wavea` public builds: 12 files, 0 hits.
    - Private page: https://claude.ai/artifact/TZzjtuijtZAmMd42jL1K3d
  - Scenes gates on the combined tree: typecheck, lint 0, test 433 pass / 22 skip / 0 fail.
- 01:35: Wave B launched (workflow): kit rigid merge, kit shadow cache/once/threshold, kit stand-ins, then Farm and Golden Gate wiring, with Foundry planting in parallel. The S6 timing kit was built in parallel. Owner decisions recorded as D-46 to D-63 (`57177cf`). The probe gained `--query` (`5042a16`).
- 02:13, S6 timing kit committed (`67cafa4`). MSAA-only A/B, `draw-base` against `wavea`: 60 s runs, 3 interleaved pairs, quiet checks recorded. Evidence is in `scenes/evidence/perf/{hub,tablet}-2026-10-02/`.
  - **Hub** (GTX 1660 Ti, 120 Hz): no measurable effect. p50/p95 8.3/8.4 ms both sides; GPU busy unchanged; D-41 pass 18/18.
  - **Tablet** (Mali-G68, 60 Hz):
    - Farm minimal: GPU busy 93% → 85%.
    - Golden Gate minimal: GPU busy 85% → 82%.
    - Farm economy: within one refresh 39.9% → 48.8%, 37.5 → 39.8 fps; p95 33.3 ms on both sides.
    - three r186 makes the 4x attachments transient when the store flags are false, and the tablet supports `TRANSIENT_ATTACHMENT`.
  - This PC was not quiet (CPU 81.5%, GPU 27%), so it was not used for timing.
- 02:30: Wave B built and committed. Scenes gates on the combined tree: typecheck, lint 0, test 513 pass / 22 skip / 0 fail.
  - `2bd021e` kit rigid merge.
  - `0806baa` kit shadows: cache, once, threshold, stand-ins, pass stand-ins.
  - `95996dc` Foundry planting:
    - campus 101 → 95 draws, 21 → 10 pipelines;
    - near views −18 to −25 draws, about −30 pipelines;
    - B-06 22/22.
  - `1c4ae4f` Farm:
    - settled hero view at economy, balanced and high: 583 → 283 (shadow 270 → 0 per frame; the live map holds 31-54 draws with ambient life);
    - minimal: 345 → 315;
    - B-06 144/144 on 3 views at high.
  - `d2d1cfd` Golden Gate:
    - arrival at high: 432 → 103; at minimal: 180 → 52;
    - B-06 37/37;
    - the opt-in cache stays off because it gains nothing while driving.
- 02:38: Wave B review launched (workflow). Kit, Farm, and Golden Gate plus Foundry each get an adversarial reviewer; fixes follow, kit first.
- 04:18: Review done and fixed.
  - Commits: `8d95fec` (kit), `0174e7d` (Farm), `892d103` (Golden Gate and Foundry).
  - One major finding: Golden Gate's kerb stipple, a coplanar depth tie the merge reordered, missed by B-06. Fixed at no draw cost, and parity gained a thin-line budget (pixels over 32 levels).
  - Kit guards: shadow mask, late install, drift tolerance and untrack. The Farm adopts `layout:'source'`, which saves 2-3 pipelines.
- 05:10: S5 done. Commits `4383a1a`, `dc77f27`, `bf4b2dd`; D-64 `75751ec`.
  - Cross-build parity: Farm 86/86, Golden Gate 488/489 (golden-hour side-full, 193 px tower depth tie, held for the owner), Foundry 160/160.
  - X-02 re-baselined per scene.
- 05:12-05:45: Final engine gates green: test 3,070/2/0, render-service 78/78, coverage functions 95.28% and lines 92.55%, check:skills.
- 07:15: S6 done (`69f92fe` fixes the timing probe). 196/198 runs valid.
  - **Tablet:**
    - Minimal holds 60 Hz in both builds, with GPU busy −2 to −9 points.
    - Economy: within one refresh 39.9 → 61.2% (Farm hero), 39.0 → 81.9% (tractor drive), 86.4 → 97.9% (Golden Gate). The tractor drive's p95 goes from 33.4 ms (over OD-7) to 33.3 ms.
  - **Hub:** vsync-locked at 8.3/8.4 ms in both builds. CPU render 5.5 → 1.6 ms on the Farm hero at high. D-41 131/132; the one failure is a flyover hitch shared by both builds.
  - **Pending:** the remaining hub balanced/economy cells; commands are in `tmp/drawcalls/s6/timing-full.report.md`.
- 07:25: S7/S8.
  - Scenes gates green: test 533/22/0, scripts 58/58.
  - Review record `docs/reviews/2026-10-02-draw-optimization.md`.
  - Private page https://claude.ai/artifact/8yyK4nmGRcLbAEb3dLAvbo.
  - The skill gains the measured frame-time effect.

## Goal statement

<!-- goal:start -->
Run the draw-optimization cycle in docs/plans/2026-10-01-draw-optimization-cycle.md inside the worktree C:/Users/Mattm/X/kiln-draw-optimization (branch draw-optimization), following owner decisions OD-1..OD-18 and the plan's defaults and boundaries, across all scenes (Farm, Foundry Floor, Golden Gate). Never edit, stash, switch or clean C:/Users/Mattm/X/kiln-oss or C:/Users/Mattm/X/kiln-v1-readiness; never edit files the v1-readiness branch changes; never touch site/, deploy, push, post upstream, run live models or spend money. Commit locally in logical steps.

Done when each item is shown by printed output in this conversation:
1. Diagnosis: a committed count probe gives, per scene, tier and named view or workload, draws per pass, pipelines, triangles, attribution by system and count-only what-ifs, with each scene's levers ranked from its own data.
2. Phase 0: a test that failed first and now passes proves optimize:'full' keeps Joint_* pivots and semantic nodes and merges by material within rigid groups (farmhouse.glb keeps Joint_FrontDoor, draws <= 11, triangles and bounds equal); a required-extension compatibility check has tests.
3. MSAA: an adversarial verdict, confirmed or refuted, on whether three r186 stores multisampled attachments needlessly; if confirmed, a scene-kit implementation with a test and a private artifact page (issue, how found, fix); nothing posted upstream.
4. scene-kit has extra-pass stand-ins (shadow and reflection), a cached static shadow plus a small live mover map and a texel-size small-caster threshold, with tests, enabled where each scene has the pass; plus the look-neutral scene merges S1 justifies (OD-18), with doors, colliders and moving groups intact.
5. Per scene, before/after count tables and B-06 parity; every difference beyond parity is shown as images for owner review.
6. Timing from quiet hosts only (hub after its quiet check; tablet via the device kit when quiet and cool, mappings removed; this PC only when the kit's quiet check passes), interleaved A/B: p50/p95, share of frames within one and two refreshes, D-41 hitch counts, load samples, tablet economy before/after; or the pending runs with exact commands.
7. scenes/DECISIONS.md records OD-1..OD-18 and the X-02 re-baseline as D-46 onward; skills/kiln-compose-scene and its runtime-scenes reference carry the proven techniques; bun run check:skills passes.
8. Final gates pass: engine bun run typecheck, lint, test, test:render-service, test:coverage; scenes bun run typecheck, lint, test.
9. docs/reviews/2026-10-0X-draw-optimization.md and a private artifact page give per-scene before/after, timing, parity, a cross-scene comparison of what worked where, open decisions and a feedback map of proposed tool, skill, scene-kit and project-convention changes.

Stop and report, rather than treat as unmet, when: a gate cannot pass without changing an owner decision; a change needs a file v1-readiness modifies; a lever fails parity beyond small shadow changes or shows no gain (record it, continue with the rest); the MSAA suspicion is refuted (record, continue); the hub or tablet stays unavailable (report counts and pending timing instead of waiting); anything would need a push, site change, upstream post, live model run or spend.
<!-- goal:end -->
