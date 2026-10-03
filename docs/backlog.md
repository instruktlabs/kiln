# Kiln current backlog

**Release direction, 3 October:** Matt confirmed the farmer hand fixes and could not
reproduce the water jump locally. He authorized final performance review, commits,
main integration and Cloudflare deployment. The focused performance investigation is
settled for release with its original failures and limits preserved. See the
[release disposition](reviews/2026-10-03-release-disposition.md). Bridge stills are refreshed; physical-device
promotion, Troy construction and npm publication remain deferred.

Updated 3 October 2026. This is the maintained queue for the
[alignment plan](plans/2026-10-02-core-scenes-site-alignment.md). It separates work
still needed from historical requests already implemented and suggestions awaiting a
decision. Code and CHANGELOG.md establish shipped behavior; dated reports retain
their original evidence and limits. No queued item below is an acceptance claim.

Matt's current direction is stabilization of existing core/scenes/assets, with full
adversarial review of behavior, implementation and cycle intent, bounded known issues,
and reproducible final-artifact evidence. Report failures, skips, unverified areas,
risks and blockers explicitly. Troy brainstorming is not a specification, backlog or
task; construction/refinement awaits direct Matt discussion, and the Troy pack stays
off the public site. Commit, main integration and site deployment are now authorized; npm publication is not.

## Completed optimization baseline

PR #131 (`b1ac6ee`) landed the large runtime optimization pass in all three scenes.
Farm's hero/shadow work, Golden Gate's bridge/shadow/reflection work and Foundry's
planting/MSAA work are implemented. Foundry's 160/160 recorded parity checks passed;
no Foundry regression caused by that pass has been established. PR #132 (`ac8456c`)
then fixed engine ORM UV/transform handling, without changing scenes.

Asset GLBs were not rewritten. Farm's optimized runtime is live; production Golden
Gate g9 and Foundry ff3-review2 still serve their previous sealed runtimes. Local
`g9-code5` and `ff3-review2-code5` delivery pins are now active in the candidate;
their publication and remaining qualification are delivery work, not another
optimization implementation pass.

## Local candidate progress, 3 October

Work is on `codex/core-scenes-alignment`, based on `ac8456c`; a fresh fetch still
shows zero commits ahead/behind `origin/main`. Changes below are local and
uncommitted. They have not changed the production website or saved asset revisions.
The code5 site (`26ecd2b2…`) now has fresh changed-surface qualification. The prior
code3 site (`a4d1e2d0…`) and UI3 timing retain their original scopes. The bounded
[adversarial review](reviews/2026-10-03-stabilization-adversarial-review.md) records
implementation findings and remaining limits. Final skill-only artifact `978664da…`
passes fresh static/delivery/HTTP checks and strict continuity: all 2,721 product
files, 200 HTML files and 243 scene files are exact to `26ecd2b2…`; current guidance
archives are separately verified. After documentation freezes, the final offline
package byte audit is separately recorded at
`tmp/alignment-20261003/package-stabilization-final/receipt.json`; the qualification
ledger records its result. This prose does not pre-claim the audit outcome.
Matt selected focused timing checks, expanding only for a failure requiring
investigation; owner farmer/water review follows the development goals.
All 18 intended focused runs / 20.5 measured minutes are collection-valid, with raw
D41 17 pass / one fail and two failed post-run quiet gates. A separate unchanged
two-minute flyover pair passes D41, before/internal/after quiet checks and cleanup;
it does not erase the original failures. Intended measurements are complete and
functional implementation is complete within tested scope, but strict desktop
performance acceptance remains open. No further benchmark expansion is presently justified.

| Items | Implemented locally and checked | Still required |
| --- | --- | --- |
| CORE-1 | Shared ORM images isolated per packing pair; serialized, order and other-slot tests; independent adversarial review | Full root/coverage and installed-package gates pass; awaiting release review |
| CORE-2/3/4 | Rigid merging wired into full; LOD, named pivots, placements and shared-scene boundaries; byte budget, 16-bit splits, precision and failure cleanup; `rigid-v1` rebuild policy | Full root/coverage and installed-package gates pass; release review remains |
| CORE-5 | Bounded per-anchor draw diagnostics and sampled geometry observations in inspection/export; compact render unchanged | Fresh/managed Codex and Claude setup/upgrade qualification passes; paid dogfood remains separate |
| ASSET-1 | Consolidated 292 revision/resource rows across all existing families; all 113 scene GLB consumers and 109 auxiliary inputs represented; final code5 reconciliation repeats 882 checks with zero mismatches | 56 Foundry original source/export records are not linked by selected models-only inputs; fresh appearance, functional pivot/clip/scale and owner acceptance remain separate. Bridge previews explicitly apply to the full tier |
| ASSET-2 | Fresh 224/224 current-source corpus at 58b1 passes: 86 examples, 113 scene GLBs and 25 saved Troy regressions; every result and optimized hash matches the prior run | Structural/deterministic/Khronos scope only; 20 compressed terrain inputs remain decoded derivatives. GPU/material/importer/owner acceptance stays separate |
| UPGRADE-1 | Compatible geometry, image, MCP/provider and tooling updates; Vite 8.3.2 synchronized; Node 22.23.3/npm 12.2.0 pins and isolated hub tools aligned | Full root/coverage and installed-package gates pass; renderer scene parity remains UPGRADE-2 |
| UPGRADE-2 | Three 0.186.1/types 0.186.0/WebGPU 0.6.2 coherent; renderer 78 tests, NVIDIA smoke/conformance, core/package and fresh 58b1 corpus pass. Prior bounded scene matrices, motion3 both-backend controls and code5 public/site qualification retain exact scopes; all intended focused measurements are collected | Strict desktop performance acceptance stays open: original 18 runs retain one D41 miss and two failed post-run quiet gates despite a passing flyover repeat. Prior UI3/shared pilot failures, missing latest runtime owner receipt and GG strict flags remain |
| TOOL-1/2/3, KIT-1 | Exact packs restored and hash-verified; portable browser resolution/profile cleanup; script tests in normal gate; exact-input gate 22 pass with zero skips; WebP serving and actual browser lifecycle checks pass | New release qualification and authorization remain separate |
| KIT-3, FARM-1 | Morph-weight shadow observation, tested explicit live/invalidation contract, economy trailer exemption; direct images pass 160/160, all six settled X-02 fields match 32/32, and same-phase paired audit finds no introduced failure in 32/32 | Four absolute pilot-image failures are shared with the original; performance and owner acceptance remain separate |
| KIT-2 | Shared panel bounds/scroll/stacking and nested touch handling; 72/72 DOM contracts. Code5 passes all six NVIDIA public-control scenarios / 34 checks, nine lifecycle/viewer/failure areas and fresh accessibility; skill-only final site has exact product continuity | Physical-device and owner acceptance stay separate |
| KIT-5 | All 18 intended focused runs / 20.5 measured minutes collected validly; raw 17 D41 pass / one fail. Farm minimal pair passes at 25.0/33.4 ms maxima. Extra unchanged flyover pair passes D41 at 50.0/16.7 ms, all quiet gates and cleanup | Overall focused audit remains FAIL: original candidate flyover 50.1 ms and post-run CPU maxima 16.473% / 16.159% remain. Repeat preflight CPU 12.694% failed before browser and is preserved. No further benchmark expansion presently justified; full 108-run preparation remains deferred/unrun |
| FARM-2 | Busy-port handling verified; original Farm's 42 files verified; direct 160/160 and settled X-02 32/32 pass; paired 32/32 has no introduced failures; existing r34 B-07 pooling/optimization/ordered collider counts pass for both builds, with 41 cached-shadow textures | Four pilot-image failures are shared, not absolute parity. B-07 retains its r34 visible-source provenance note; no new collider soup/motion oracle. D-64/D-68 adopts the comparison baseline but no hash-bound latest scene-runtime owner acceptance receipt is established, so releaseQualified remains false |
| FARM-3 | Four valid allocation observations complete; current late GC remains about 36 ms with stable endpoint counts/joints. Separate focused 135-second minimal hero-view pair has original/candidate maxima 25.0/33.4 ms, both raw D41 pass | Post-run CPU maximum 16.159%, sampled 6.326 s after the block, fails strict quiet qualification. Source allocation/retainer ownership stays unresolved; no speculative repair, hitch-fixed, leak-freedom or performance-acceptance claim |
| GG-1 | Opt-in depth and sky/reflection/bias adaptations; NVIDIA prototype-reference comparison passes 78/78 on each backend; final public/startup/missing-clip probes pass; local `g9-code5` delivery prepared | Authentic original→final retains 17 WebGPU and 11 WebGL2 strict flags; owner review and publication remain separate |
| GG-2 | Dynamic reflection exclusions and persistent hidden fog banks; 17 focused tests; both-backend 78-view comparisons retain camera/bridge counts and pass against the reconstructed depth reference; local `g9-code5` delivery prepared | Moving-workload timing remains GG-4/PERF-1; owner review and publication remain separate |
| GG-3 | Verified per-world layout and deterministic 12,706-byte startup projection; code5 public runtime is 1,708,928 raw / 512,680 gzip, within fixed ceilings; both-backend initialization checks pass | Quiet timing remains PERF-1; no tablet tier promotion |
| GG-4 | Contact-shadow prewarming has focused tests and first-use native proof. Original focused candidate flyover misses D41 at 50.1 ms near 57 s; the nearby 41.3 ms render-call wall interval is not measured CPU. One unchanged extra A/B pair completes at 50.0/16.7 ms maxima with D41, quiet and cleanup passing | The candidate miss did not recur; no actionable cause or new runtime repair is justified. The repeat does not erase the first miss or failed quiet gate. Broader preparation stays deferred; owner review follows development goals |
| FF-1 | Prior comparison passes 120 default image cases and 56 static X-02 rows. Code5 keeps asset bytes/acceptance; motion3 first-key/follow and code5 controls/lifecycle pass both backends. Selected focused runs have raw D41 passes | Strict desktop performance acceptance remains open because the shared block fails post-run quiet qualification; owner acceptance and historical interior-pose limits stay separate |
| FARM-4 | Per-render empty-hand correction, borrowed mirrored arm, 150 ms blending and registered warming preserve saved GLBs. Motion3 both-backend entry/start-stop/reentry and code5 public controls pass; bounded adversarial review finds no new concrete blocker | Owner confirmed the hand/animation appearance on the local candidate on 3 October; physical mobile remains a separate scope |
| GG-5 | Phase/foam-origin fixes and reduced wakes are implemented; bounded shader/render checks pass. Owner could not reproduce the jump in the local candidate on 3 October | Closed for this release on scoped local evidence; reopen with an exact path/device if it recurs. No universal water or physical-device claim |
| FARM-5 | Desired camera separated from collision projection; motion3 both-backend orbit/pinch and obstacle regressions pass. Code5 public-02 additionally passes real incremental touch orbit/pinch and first W on actual NVIDIA WebGPU/WebGL2 | Physical-device and owner acceptance remain separate. Public-01 behavior passed but its warning-classifier failure stays recorded; public-02 uses the maintained exact classifier |
| KIT-6 | Pre-#131 joystick cleanup defect fixed with movement ownership; unchanged DOM fixture passes 8/8. Motion3 Farm/Foundry and code5 public Farm first-key/touch checks pass both backends; current fresh/managed guidance copies and final skill-only site continuity pass | The separately recorded final package audit, open strict desktop performance acceptance and deferred physical-device evidence remain separate |
| SITE-1 | Portable static-only deployment preflight; artifact hashes rechecked before upload; all three upload manifests summarize 486 files with zero problems; actual dry run correctly refuses the dirty checkout | Clean reviewed source/artifact and authorized upload after remaining release work |
| SITE-2 | Local g9-code5 and ff3-review2-code5 archives reproduce exactly, stage through the normal path and match runtime/page/catalog references; original model/data bytes, saved revisions and checksums are unchanged. Final skill-only artifact continuity passes | Clean authorized R2/Pages delivery/public verification; old objects remain unchanged |
| SITE-3 | Final skill-only artifact 978664da…: 2,728 files / 199,998,384 bytes; fresh static/delivery/HTTP pass. Strict continuity preserves 2,721 product files, all 200 HTML and 243 scene files from 26ecd2b2…, retaining its 564-test, 70-Astro-file, six-control/34-check, nine-flow, 396-width/44-tour evidence within original scopes. Current skill archives match maintained guidance | Final package audit is separately recorded after documentation freezes; strict desktop performance acceptance stays open and owner/device/release boundaries remain |

The latest portable gate records 713 passes, 18 historical skips and zero failures
across 123 files; typecheck/lint pass. Core coverage remains 3,187 passes, three
platform skips, 95.11% functions and 92.32% lines. All six runtime bundles retain
58b1 identity and installed-package smoke scope. The fresh source corpus at that
identity passes all 224 inputs with stable before/after source and unchanged assets;
all per-input outputs equal the prior dd25 run. See
`tmp/full-optimizer-corpus/current58b1-20261003/qualified.json` and its independent
`verification.json`. This is source execution, with dist execution covered separately.

Code5 site qualification and final revision/runtime/reference reconciliation are
complete within the scopes above. Current fresh/managed Codex and Claude copies
pass after KIT-6 guidance; the final skill-only site rebuild and exact product
continuity proof pass; the final offline package byte audit is separately recorded
after these documents freeze. The bounded adversarial
review reports no new concrete blocker and preserves the authorship/test limits.
No release or owner approval is implied. The four bounded Farm allocation observations
are complete, as are the intended focused measurements and bounded flyover repeat.
The overall focused audit remains failed; strict desktop performance acceptance is
open, with no further benchmark expansion presently justified. Earlier code3/UI3 receipts and
the deferred, unrun 108-run preparation stay historical. No all-tier, repeated-run
or desktop-speedup claim follows from the selected checks.

The prior `f0e49fbc…` site's accessibility receipt freshly checks four widths on the two
changed documentation routes and reuses 392 widths and all 44 tours from artifact
`42a41439…` only after exact HTML/dependency identity and unchanged Chrome, axe and
verifier are proved. That preserved prior receipt combined 60 freshly checked
routes with 138 byte-identical preliminary routes; its original proof remains
bound to those checks. That prior receipt and proof are under
`site/.cache/alignment-release-docs/`; this chain does not qualify activated
scene/viewer interactions or UI2. Its strict continuation proof rejects reuse for
UI2 because emitted shared CSS also differs outside the two approved rules; all
198 routes / 396 widths, 44 tours and 2,138 stops now pass freshly on `a4d1e2d0…`,
with zero problems and no reused routes. The exact receipt is
`site/.cache/alignment-site-qualified/accessibility/combined.json`.
The authenticated Cloudflare list at 10:35 UTC still identifies production
deployment `33c716c7…` / `b1ac6ee`. A fresh Node-fetch check at 10:50 UTC verifies
its public build metadata and manifest `5ecbbe76…`, with old `g9` / `ff3-review2`
pins. The earlier Python-client 403 attempt remains preserved separately.
No upload or commit has occurred; the successful public recheck is
`tmp/alignment-20261003/production-recheck-20261003T103132Z/node-public-receipt.json`.

The complete scene-script gate passes **108 tests / 615 assertions / 0 failures**
across 22 files (`/tmp/kiln-scenes-timing-evidence-scripts-host-final.log`). It covers
bounded cleanup, measured-interval visibility/focus and actual GPU device-to-canvas
binding as well as complete readable quiet telemetry. Unknown GPU load or locker
state cannot qualify as idle. The kit generator reads `scenes/toolchain.json`.
The quiet-host blocker is resolved without changing thresholds. The balanced
block completes 7 of 18 cells / 42 of 108 one-minute runs against the exact original
and UI3 candidate binaries; before, internal and after quiet checks pass. D41 is
37 pass / 5 fail. All 12 Farm and 18 Foundry runs pass raw D41; the six static
Foundry fab runs have absent exterior pose fields under the expected schema,
so these receipts do not claim independently measured interior camera coordinates.

All six Golden Gate flyover runs peak at about 25 s into sampling (about 30 s of
scene time after warmup), in both builds: A 50.0/66.6/58.4 ms and B 58.2/50.1/49.9 ms.
Four fail D41; candidate drive pair2 separately fails at 58.3 ms, about 4.408 s
into sampling. Flyover busy×clock rises +3.45%, +0.05% and +2.91% across the three
pairs; higher clocks alone do not explain it, but coarse global GPU polling does
not establish a code cause. No desktop margin or tablet adoption threshold is applied.

Seven economy and four orbit cells were unrun in that historical UI3 campaign.
The current motion3 campaign prepares all 18 cells / 108 runs and is unstarted;
the code5 functional/site checks do not qualify its performance. Raw historical
results remain in
`scenes/evidence/perf/hub-alignment-2026-10-03/candidate-ui3-balanced/`, with independent
calculations in `tmp/alignment-20261003/balanced-performance-review/review.json`.
All five D41 failures and the separate drive event remain recorded. Four bounded
135-second Farm allocation observations are prepared under
`scenes/.tmp/alignment-farm/allocation-plan/`, with execution pending. No allocation
cause, timing pass, deployment or release approval is claimed.

## Work items and required completion evidence

The order is core correctness and compatible upgrades, focused scene follow-ups,
then qualified site delivery. The rows include regression checks and release chores;
they are **not a count of unimplemented defects or mandates to rework every asset**.
The local-progress table above records which implementation and checks already pass. Existing
accepted evidence remains useful. Recheck the surfaces changed by the next release.

| ID | Work | Required completion evidence |
| --- | --- | --- |
| CORE-1 | Fix pre-existing shared-image ORM overwrite | Tests for distinct AO maps, other-slot consumers, order independence and serialized GLB; preserve material/UV/sampler behavior |
| CORE-2 | Complete deferred engine full-export optimizer | Named pivots, placements, animation targets and all LOD levels survive; caller inventory and public contract settled; separate from landed scene runtime merging |
| CORE-3 | Correct D2/D3 and bake-frame policy | Actual added bytes per saved draw, conditioned transforms, 65,534-vertex split and end-to-end determinism tests |
| CORE-4 | Version rebuild behavior and expose diagnostics | Old saved revisions have an explicit replay/migration policy; merge/rejection summary reaches callers |
| CORE-5 | D23 outputs and maintained skill guidance | Qualified draw estimates and geometry observations; compact output budgets; fresh setup and managed upgrade preserve user customizations |
| UPGRADE-1 | Compatible dependency and maintainer-tool updates | Peer-compatible exact pins, synchronized locks/toolchain/CI and applicable offline gates |
| UPGRADE-2 | Renderer-family update | Coordinated Three.js/types/WebGPU dependencies, build identity, GPU smoke and both-backend scene parity |
| ASSET-1 | Reconcile existing inventories and acceptance | Match final scene consumers, source/material/asset revisions, acceptance states, pack/archive/mirror pins and served download hashes; keep new runtime delivery labels separate from asset revisions. Preserve originals and exclude Troy from the public catalog/artifact |
| ASSET-2 | Core regression corpus | All 86 examples, exact released scene assets and pinned Troy revisions; engine LOD-aware IO, world-space geometry and semantic assertions |
| TOOL-1 | Clean-hub exact inputs and browser launch | Public hash-pinned inputs restored; Linux/Windows executable selection; scene builds independent of missing author workspaces |
| TOOL-2 | Scene test and release coverage | Script tests in normal gate; correct Foundry budget fixture; exact-input gate cannot pass via fixture skips; Golden Gate count baseline |
| TOOL-3 | Browser process/profile lifecycle | Owned-port handling and cleanup on normal close and launch failure |
| KIT-1 | WebP static serving (GG-004) | GET, HEAD and range MIME tests with existing access controls preserved |
| KIT-2 | Consolidate existing HUD/touch workarounds (GG-007, FF-002) | Narrow/short screens, panel scrolling/stacking/focus and nested controls retain behavior; no claim of broken current scene controls |
| KIT-3 | Shadow motion contract (D26) | Explicit treatment of morphs, shader motion and custom instance attributes; auto detection or documented live-caster behavior tested |
| KIT-4 | Collision/interaction regression verification | Preserve already-tested doors/joints/proxies when changing optimization; no current broken interaction established |
| KIT-5 | Shared parity and GPU timing tools (D18, D16) | Thin-line budget and repeat-capture noise; units/provenance for GPU clock and busy-times-clock |
| FARM-1 | Trailer shadow and baseline work (D8) | Economy trailer exemption with appearance, draw and shadow parity |
| FARM-2 | Paired pilot audit (D20) | Busy-port fix; new and last-accepted same-phase captures on both backends; texture/count provenance |
| FARM-3 | Late hero-view hitch (D22) | Desktop GC mechanism reproduced; measure allocations/retainers before a targeted fix and repeated quiet-host validation; retain tractor/joint behavior |
| GG-1 | Reversed depth (D15) | Opt-in renderer feature, sky/reflection/polygon-offset adjustments, WebGPU/WebGL2 and unsupported fallback evidence |
| GG-2 | Reflection exclusions (D5/D6) | Traffic, player car and fog banks excluded as adopted; vegetation cards preserved and fog banks stay hidden |
| GG-3 | Runtime layout delivery (D27) | Verified layout data; missing/corrupt/cancelled-load tests; bundle budget and initialization parity |
| GG-4 | Shared flyover transition and separate drive hitch (D22) | Startup-context native pipeline proof passes; qualify repeated exact-candidate quiet timing; retain the separate drive event and five historical D41 failures. No tablet tier change |
| FF-1 | Verify and release the optimized Foundry runtime | Preserve #131's planting work and unchanged interior; reuse existing tests against restored exact inputs; 62 metadata/pin records already agree |
| FARM-4 | Farmer pose, gesture and transitions | Implemented cadence/relaxed-hand/blend/warming pass focused and both-backend public motion checks; carry them into rebuilt deliveries and affected lifecycle checks. Broader pose/seat and owner review retain their explicit bounds |
| FARM-5 | Mobile third-person camera | Farm and shared Foundry motion3 checks pass both backends; complete rebuilt delivery checks. Preserve drag distance, pinch in/out and obstruction recovery; physical devices remain a separate boundary |
| GG-5 | Owner-observed wakes and high-angle water snapping | Reproduce pier wake size/distinctness and water texture/orientation clipping/snapping during high-angle orbit; qualify the targeted visual behavior without wholesale asset rebaking |
| KIT-6 | Touch-to-keyboard movement handoff | Preserve the newer input when the joystick hides or releases; actual React lifecycle and first-key browser regressions, including cancel/clear ownership |
| PERF-1 | Focused investigation settled for release | Retain original 50.1 ms miss and post-run quiet failures; targeted unchanged repeat passes. No reproducible actionable regression established, no additional benchmark or speculative patch required. Strict all-run acceptance and 108-minute campaign remain unclaimed |
| SITE-1 | Portable deploy preflight | Preserve clean-tree/commit/packs/file-limit checks; verify artifact hashes immediately before upload; refusal and dry-run tests |
| SITE-2 | Prepare affected local scene deliveries | Qualified exact runtimes and producer hashes; synchronized scene-packs, scene-input archives, mirror/upload manifests and applicable catalog scenePack references; unchanged saved asset revisions and old objects |
| SITE-3 | Final local launch-mode qualification | Full existing assets/scenes, accessibility/touch/keyboard/failure flows and exact served downloads on the final artifact; explicit identity proof for reused evidence; Troy absent. Cloudflare upload/deployment requires a separate authorization |
| RELEASE-1 | Installed-package and workspace qualification | Full applicable gates, runtime rebuild, package/skills contents and fresh setup/managed-upgrade checks |

CORE-1 can be a small isolated fix. CORE-2 through CORE-4 change full-mode behavior
and need the planned 0.11 release/migration treatment. A scene runtime optimization
does not by itself justify replacing standalone asset revisions. Paid harness dogfood
needs its own concrete authorized run scope; offline qualification stays provider-free.

## Stabilization readiness exit

The final review must connect each adopted change to intended behavior and exact
source/build/input evidence, reconcile final existing-scene and asset delivery pins,
and retain a bounded known-issue inventory with impact and disposition. Report local
failures/skips/unverified areas and external owner/device/release boundaries separately.
Prior green matrices or site/package checkpoints do not qualify changed bytes without
an explicit continuity proof. Complete required local gates before reporting readiness;
no blanket acceptance, release action or Troy task follows from this report.

## Implemented or superseded requests

- PR #132 shipped UV/transform guards and other recorded fixes. It did **not** fix
  CORE-1's shared-image overwrite.
- PR #131 landed the completed scene runtime optimization work. It did not
  implement every adopted follow-up or reseal all production runtimes.
- The maintained compose-scene skill includes #131's optimization lessons; the
  published website archive matched main at the 3 October audit. Four narrow
  reference clarifications are now local, pending release. The v0.10.0 tag predates
  #131, and Troy's current workspace has no optional compose skill installed.
- FARM-001 through FARM-007, GG-001/FF-001 and GG-009/GG-010 are recorded as done.
- FF-003's callback-cancellation identity handling is present in the shared kit and
  tests; it is no longer an open implementation request. Full failure-flow acceptance
  remains part of each new scene release.
- Requested placement output, extras/visibility, cubic easing, index policy,
  hide-node captures, intentional open shells and LOD support shipped. Sweep analysis
  has bounded local coverage, not a general distant-intersection guarantee.
- Foundry's earlier deferred-startup repair and Golden Gate's earlier rejected bridge
  variant are superseded by their accepted revisions; do not reopen them from old logs.

## Held, optional or awaiting evidence

| Item | Disposition |
| --- | --- |
| Troy scene ideas | Brainstorming only, not an adopted specification, backlog or task. Construction is deferred for direct discussion with Matt; foundation exit does not start it automatically |
| Troy pack/refinement/publication | Keep off the public site. No refinement or publication task is adopted; existing revisions may remain local regression inputs without changing this boundary |
| AI SDK/provider/OpenRouter/OpenAI major upgrades | Blocked by current Strands peer compatibility; compatible-family updates are locally qualified |
| Site TypeScript 7 | Keep TypeScript 6 while Astro's checker/compiler-API consumers require it |
| Xclipse tier classification (GG-008) | Needs actual device strings and performance evidence |
| FARM-008 instancing/warm-up advice | Measure applicability per scene; not a proven global defect or automatic rewrite |
| Shared meshopt loader (GG-002) | Optional consolidation; Golden Gate has a working local path |
| Terrain derivative encoder (GG-005) | Regeneration tooling is distinct from the usable sealed terrain; decide when new tiles are needed |
| Static scene export (GG-006) | New delivery contract requiring a separate decision |
| Foundry S3 cross-pass and roof/seam design | Pre-existing asset/design questions, not #131 regressions; D-75 retains campus structures. Change only after an explicit design disposition |
| Next vegetation cycle (D33) | Adopted later performance exploration: per-tree culling before LOD, with visual/GPU-work gates. Keep separate from shipping the completed pass |
| R8 shadow targets, reflection cadence, output-pass depth and extra merge layouts | Optional measured follow-ups; not silently prerequisites |
| MCP render file destination | Unadopted; existing CLI file output and MCP media/receipts remain supported |
| SEP-2640 resources and large present metadata | Retain the roadmap's recorded defer decisions |
| Ten-pack production, broader importers, public v1 package | Later milestones with their own acceptance |

Update this ledger when evidence or an owner decision changes a disposition. Link the
test/report/revision that closes an item. Historical reports should gain a current
pointer where needed, not be rewritten to claim new acceptance.
