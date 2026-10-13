# Cabin in the Woods: PSX Horror implementation plan

Updated 2026-10-12. This is the authoritative remaining-work plan. One primary
agent owns implementation, review, integration and qualification. The three
previous subagents are stopped. Their preserved drafts and receipts are inputs
to review, not independent work streams or acceptance decisions.

## Release authorization, 2026-10-12

The owner approved the integrated scene, all assets and both photographs, then
authorized commit, push, merge, npm 1.2.3 publication and site deployment. The
release sequence is package/site qualification, main CI, verified npm staging and
promotion, registry verification, publication-record update and clean-main site
deployment. Dogfooding follows release. This supersedes approval and availability
statements in the historical review checkpoint below. The 53 selected asset
revisions remain unchanged; licenses and source provenance are retained.

## Historical review checkpoint, 2026-10-12 evening

Final qualification is recorded in [REVIEW.md](./REVIEW.md). The integrated
preview is reopened for owner review, and release actions remain unapproved.
All 53 gallery models opened in the actual site with hardware rendering;
fullscreen, pointer lock, movement, weapon/reload/flashlight controls, iframe
disposal, the two approved photos on five presentation routes and all three
download archive hashes passed with no browser errors or failed responses.
Final static validation passed all 281 HTML documents with zero HTML,
link/metadata/sitemap errors and no description-length warnings. The site suite
has 646 passes and two skips; two Windows symlink EPERM cases pass in the exact
48-test Linux deployment suite.

Nine representative headed hub samples measured 8.3ms median, 8.4ms p95 and
8.4–8.5ms p99, with maxima of 16.7–16.8ms at 1280×720 CSS / 760×427 PSX buffer.
The separate 160-second uninterrupted normal-play sample had no gaps above
20ms. These support the smooth-play objective at the documented settings, but
do not establish a hitch-free guarantee: an instrumentation comparison still
had a 25ms frame and the previously isolated major-GC pause remains possible.
The exact data, CPU costs, allocation estimates and limitations are in REVIEW.md.

This section supersedes earlier candidate identities and pending-work notes below.
The selected 53 asset revisions remain sealed by selection SHA-256
`1cedd25a9ebc757b28054c03ee87afc3f388bd72740f6ea8778afefc8278ede7`.
The current consumer bundle is `game-DPbVtMBx.js`, SHA-256
`2a718765f739c867c32428e87acfe461215a7dc490ec4ca364fe6ad7da663dd7`.
Public availability remains false. Full candidate visual acceptance is pending.

The current candidate includes compact static placements, release of unneeded
loader/parser ownership, persistent collision records and an independent door
clearance query. All 188 maintained and extracted portable tests pass. These
changes reduce retained data and correct ownership/query behavior; they have
not eliminated the occasional major-GC hitch. The integrated site is available
on the hub at port 4544 and locally at port 4540. Final exact-candidate browser
qualification passed. No release action is authorized or taken.

The hearth now has eighteen curved, textured flame tongues and six drifting
embers in one instanced batch (48 geometric triangles, one 32 by 64 procedural
texture). Actual WebGPU counters show two submissions and 96 submitted triangles
because the transparent double-sided material renders both sides. This is one
draw more than the prior glow; final timing results include both submissions.
Fuel controls height, width, light and ember strength; saturation contains a
heavily fed fire and interpolation softens transitions. Its point light is lower
and offset from the logs so visible flames carry the effect. There are no extra
shadows, post passes or per-frame particle allocations. This is consumer VFX and
does not change the canonical hearth asset or any selected revision.

A headed Play check ran the real 90-second fuel cycle with the flashlight off:
strong, intermediate, low, empty and refueled screenshots and state receipts.
Empty fuel extinguished both flame geometry and light; actual E interaction
consumed firewood and restored more than 30 seconds of fuel. Owner judgment of
the revised appearance remains pending.

Completed delivery checks: all 53 Full Kiln revision ZIPs imported into a fresh
workspace and rebuilt byte-identically; a separate FPS source remix changed the
model while preserving all ten clips. That experiment is not selected for the
site. The final VFX scene source was freshly extracted, installed with its frozen
lock, hydrated with 109 verified runtime inputs, built byte-identically to the
maintained scene across all 112 runtime files and passed all 188 portable tests.
Its source-manifest hash is
`d8b93653dc89f48552634df7e327f88ddb2c9c57d15477f0aabcc00f9e6f479f`;
the runnable scene archive hash is
`18a820f5876e422e9afc7aeac4f69c7f5802aac92773b748d2a2abe12055764f`.
All 53 prior fresh-workspace rebuilds were rechecked against the current exact
revision IDs, canonical hashes and served model bytes; all still match. The
runtime and Full Kiln archive hashes remain unchanged.

The final site build passed its privacy and public-text scans. Static checks
verified 53 gallery routes with exact revisions, 265 individual download hashes,
three pack archive hashes and the actual SceneShell runtime/fullscreen entry.
Site artifact-manifest SHA-256:
`a2edb0071e07837583c8440ba52d1990d8f64b63ee8c2e8b9de4d21d087ecbc6`.
The asset-demo staging namespace is independent of legacy scene-pack cleanup.
The current full site build emitted 276 pages (281 HTML pages indexed by the
finalizer, including supplied static pages), with zero private-data findings
and zero public-text errors. All 27 Cabin staging/presentation tests pass.

Engine gates already passed for the unchanged engine candidate: toolchain,
skills, typecheck, lint, 3690 tests (two skipped), coverage (95.39% functions,
93.02% lines) and 78 render-service tests. Site Astro checks passed. The site
suite's two Windows symlink EPERM failures were qualified by running the exact
deploy suite on Linux (48 passing); do not describe the Windows run as all green.

Prior collision/VFX-candidate performance samples used visible Chrome 150 on actual desktop :0,
hardware NVIDIA GTX 1660 Ti Max-Q WebGPU, 1280 by 720 CSS and a 760 by 427 PSX
drawing buffer. Each view warmed for eight seconds, then sampled about twenty
seconds. Aerial, continuous orbit, living, kitchen, bedroom, storage, hearth,
active house walking/turning and active forest walking/turning all measured
8.3 ms median and 8.4 ms p95. Kitchen p99 was 8.5 ms with one 66.6 ms maximum;
storage reached 33.4 ms and active house walking reached 25 ms. Final-view draws
ranged from 26 to 166. The owner requested investigation of the kitchen hitch
before closing the goal. These distributions are strong at these settings, but
the intermittent stall remains an open issue; they do not qualify other GPUs, mobile or full native resolution.
CPU category timing is not GPU execution timing. Raw host and pacing data are
retained in the external audit `presentation-qualification-20261012`.

Remaining before the owner checkpoint: finish exact-candidate representative
profiling and integrated browser checks, report the remaining GC hitch, complete host
restoration accounting, and reopen the exact site preview. All 53 gallery models
already opened successfully through the site on headed NVIDIA hardware; site
fullscreen entry/exit, pointer lock, movement, navigation and download checks
passed before the collision-only update. Placed-family coverage, interaction
checks and allocation diagnostics are recorded below. Then provide concise review notes and request approval only for the
specific release actions the owner chooses. No release action has been taken.

Owner approved the shown aerial and furnished-interior captures after explicitly
reviewing both. The exact two PNGs are retained under `review-media/` and appear
in the root and pack README, site homepage, pack index/detail and scene
index/detail through the shared two-image component. The stager admits and seals
both named PNGs, with a focused failing test followed by 27 passing staging and
presentation tests. The updated site build and download-hash checks pass; actual
browser checks of the updated image surfaces remain pending. Static checks have
verified both images in all five site surfaces and both README files, and exact
PNG byte identity against the two owner-approved captures. Image approval does
not authorize a commit, push, merge, deployment or publication.

Additional diagnostics: all 46 placed families now have actual draw coverage;
the remaining seven assets are pack-only. Actual UI/input checks exercised the
door, television, window breach/repair, storage, sawing, axe chopping, three-hit
tree harvesting, encounter start and hearth refueling. The first scripted door
and axe trials sent input before Play settled or aimed through an already-open
door; explicit settled-input follow-ups passed, and original failures remain in
the audit. ABBA benchmark-recording on/off trials had matching 8.3 ms medians and
8.4 ms p95/p99; this comparison does not disable the always-on draw diagnostics.
CDP allocation sampling over 20 seconds of active forest movement estimated
1.29 GB allocated including subsequently collected objects (2417 rendered
frames). This is sampled allocation, not retained heap growth. The largest
identified caller was collision resolution, followed by model/bounds work;
the final collision broad phase now skips distant rock hulls and reuses scalar
contact values. A focused test failed before the change and passed afterward;
all 177 portable tests pass. The matched 20-second forest diagnostic fell to
999,044,052 sampled bytes over 2412 frames: about 414 KB/frame versus 534 KB/frame,
a 22.4% reduction per frame. Remaining allocation is disclosed, not represented
as allocation-free. The diagnostic is a sampling estimate with profiler overhead.

Kitchen investigation: three immediate kitchen-only repetitions measured maxima
of 16.7, 25.0 and 16.7 ms. A further 60-second browser trace stayed below 25 ms.
Both original full-view runs stalled at about 109 seconds after page load and
rendered frame 12,580. Scene CPU category counters did not explain the gap. A
trace repeating the original sequence reproduced a 41.7 ms gap at 109.2 seconds.
The trace identifies a 39.61 ms main-thread MajorGC (memory reduction / mark
compaction), reducing the JS heap from 149.7 MB to 82.4 MB, followed by incremental
sweeping during nearby shorter gaps. The immediate cause is confirmed garbage
collection, not a demonstrated kitchen geometry or collision fault. A matched
normal-mode trace with benchmark recording disabled also reproduced two 33.3 ms
frames and a 32.60 ms main-thread MajorGC. This confirms the problem is present
with benchmark recording off. These remain instrumented measurements. No fix is
claimed yet. Repeats
rejected by the host-load guard are excluded from results. Evidence:
`sequence-trace-analysis.json` and `sequence-trace-profile-kitchen.json` in the
external audit, with the full trace retained on the hub.

## Current hitch work and architecture review, 2026-10-12

The current staged site includes the tested compact placement, lifetime and
collision-query changes described below. None is accepted as eliminating the
remaining major-GC hitch. Earlier bundle identities below document the investigation.

Current official Three.js InstancedMesh/BatchedMesh documentation, the installed
Three.js 0.186.1 implementation, pmndrs reuse guidance, pmndrs/math source and V8
memory-reducer source were reviewed. The chosen direction is one immutable loaded
asset graph per saved revision, lightweight placements for static scenery and
ordinary full instances for animation or interaction. GPU batches and collision
hulls derive from that same source. Canonical files and forest density are unchanged.
This follows standard instancing/resource reuse, without a new renderer or math
library migration. BatchedMesh fits heterogeneous geometries sharing a material;
repeated forest templates already fit InstancedMesh. pmndrs/math remains a targeted
option only if a real hot operation shows a correctness-preserving measured win.

The first compact experiment passed 181 tests, including position/normal/UV and
rock collision parity. Matched diagnostic snapshots reduced retained JS heap from
78,313,280 to 33,903,368 bytes (56.7%). In the traced normal-mode sequence, major GC
fell from 32.60 to 27.40 ms, but a 41.6 ms frame remained at 109.0 seconds. This is
one comparison, not a reproducible hitch elimination or a claim about total GPU
memory. A fresh headed browser repeat reproduced a 41.6 ms frame at 109.05 seconds with
a 29.66 ms MajorGC (60.6 to 33.1 MB heap), so prior heap snapshot state does not
explain it. An outside-only 160-second run then reproduced its only >20 ms gap at
109.02 seconds (33.3 ms, p99 8.4 ms), with no house entry or door operation.
Kitchen selection and door operation are therefore not necessary triggers.
The outside trace confirms a 32.65 ms main-thread MajorGC, reducing heap from
44.6 to 32.4 MB. This reproduces the same mechanism outside the house. Fresh
browsers were closed after tracing; diagnostic traces are retained separately
from final uninstrumented performance qualification. No door collision fault has been observed:
player collision resolution was inactive in the paused view; collision-list work
was about 0.1-0.2 ms around the original stall.

Architecture review found and corrected two experiment lifecycle defects with
failing tests first: materialized fallback roots must stay in the render tree,
and their owned materials must be disposed exactly once without disposing the
canonical material. Lightweight roots now stay attached; only legacy full source
graphs are archived. The factory explicitly requires a non-renderable GLTF scene
container. Ten focused lifecycle/visibility/parity tests and all 183 scene tests pass. Scene
typecheck, lint (zero advisory findings) and build also pass. The corrected source
build is game-CPOTriTN.js, SHA-256
8b18ec77e7a2497d2543549451a660aae8452a4f44454ad27aa295519d8b2f01.
It still needs exact-candidate hardware performance and delivery qualification.

A subsequent loader-lifetime change retains only scene, clips and selected entry
metadata after GLTF texture sharing completes, releasing unneeded parser plugin
and dependency caches. A real parsed animated-GLB regression first failed on
parser retention, then passed; it also proves animation, independent instance
materials and shared geometry remain intact. The build is game-B4-AH1zs.js,
SHA-256 612a77ddc5b908025e48b11217589254610e8f98215e562c91e51e79c98b60b9.
All 185 scene tests, typecheck and lint pass. Its outside-only run still has a
33.3 ms maximum (8.4 ms p99), with a 29.55 ms major collection at 109.01 seconds,
so it is not a demonstrated hitch elimination. Post-run diagnostic collection
leaves 29,622,300 bytes of JS heap and 15,215,762 bytes of backing storage.

The owner's culling-lifetime hypothesis is under explicit verification. Repeated
frustum in/out tests retain the same batch mesh, geometry, material and instance
buffer, with zero disposal events and no source clones materialized. The optional
room-occlusion helper is not imported by the current game and cannot explain this
run. A live headed hardware GPU probe recorded zero buffer, texture, bind-group,
sampler or pipeline creations during both stationary and warmed orbit views,
and zero buffer/texture destruction. Its receipts are gpu-culling-lifetime.json.
The probe completed and saved evidence before a harness-only cleanup error
(releasing an already released mouse button); the fresh browser exited and the
harness cleanup was corrected. This is resource-lifetime evidence, not a frame
timing qualification or proof that the entire application is allocation-free.

A 20-second paused aerial allocation sample attributed about 333 MB across 2402
frames, including objects collected during sampling. The largest source was
Three.js NodeMaterialObserver.equals (about 103 MB), followed by world updates,
renderer cache keys, sorting and skin-bounds checks. Profiling overhead and
sampling variability apply. The public Object3D.static API is under evaluation
only for explicitly immutable render objects; changing instance buffers, doors,
characters and dynamic materials must not be indiscriminately marked static.

Collision records now retain their array and object identities; moving door
records refresh their bounds only when the actual leaf matrix changes. A focused
test first failed on the recreated array, then passed, checking moving/closed
door bounds and unchanged-frame reuse. All 186 scene tests, typecheck and lint
pass. The build is game-BJ7QQz4h.js, SHA-256
0c420ee3f7f1e006977bc619455171d9975e15e5db6bd6bbcbc0ff4f6d97ff87.
Its 160-second headed aerial run measured 8.3 ms median, 8.4 ms p99 and one
33.3 ms maximum at 109.03 seconds, correlated with 31.51 ms MajorGC. Background
process CPU was about 4.9% of one core. This did not fix the stall. A subsequent
allocation sample estimated 126 KB/frame versus the earlier 138 KB/frame; the
samples occurred at different page ages, so this is not a controlled effect size.

The door architecture audit then caught a shared-state error in the new cache:
the existing swing query temporarily moved the live hinge and left cached
collision rows at a trial angle. A failing regression reproduced it before
integration. Clearance now uses a separate retained shape and trial transform;
it neither rotates the live hinge nor scans/rebuilds the world's colliders.
It preserves the existing 24 angular intervals and clearance policy. A transformed
parent/pivot fixture checks 1014 opening/closing clearance decisions against
actual posed geometry; all 188 scene tests, typecheck, lint and build pass.
This build is game-DPbVtMBx.js, SHA-256
2a718765f739c867c32428e87acfe461215a7dc490ec4ca364fe6ad7da663dd7.
It is now staged in the integrated site and portable scene download, with exact
extracted-build parity recorded in `delivery-lifetime-summary.json`.

The assembly synchronizer also revalidates/serializes material and geometry
state during moving-door frames. This is avoidable complexity to evaluate later,
not an explanation for the measured stationary aerial stall. Per owner steering,
pause further door optimization and isolate the long-run major-GC cost. A fresh
headed 150-second minimal Three.js cube comparison completed with the same
hardware, renderer version, browser flags and drawing-buffer dimensions, without
scene assets, controllers, batching, R3F or PSX postprocessing.
It measured 8.3 ms median, 8.4 ms p99, 16.7 ms maximum and no >20 ms gaps. Major
collections took 2.1-3.6 ms. The diagnostic's CSS canvas was subsequently found
to be undersized; its presentation comparison is provisional pending a corrected
control. It does not identify the cabin's costly collector subphase. The fresh
cabin heap has about 28.6 MB live JS, 8300 Object3D world
matrices and only one dead parser result shape. Duplicated atlas provenance
accounts for about 1.17 MB of reachable own data, not the main retained heap.

A documented DynamicDrawUsage trial for changing family-frustum instance buffers
passed all 188 tests but did not reduce the measured allocation rate (127 versus
126 KB/frame) or the stall (33.4 ms, MajorGC 30.18 ms). It was reverted rather than
retained as an assumed optimization. Its isolated bundle game-4FrhPPBD.js and
receipts remain in the external audit; it is not the maintained candidate.
Retaining the complete collection and constructed world while rendering only a
cube measured 16.7 ms maximum pacing and a 19.86 ms major collection. Rendering
the frozen full world without gameplay updates or R3F measured a 24.9 ms maximum
and 26.34 ms major collection, including 14.17 ms in the heap epilogue safepoint.
These are external diagnostics, not product modes. Both share the undersized
CSS canvas limitation below; do not treat them as matched presentation controls.

The owner noticed a small scene surrounded by gray in the hub Chrome window.
Inspection found the external diagnostic pages used setSize(1280,720,false)
without setting the displayed canvas size: the 760 by 427 drawing buffer also
became the CSS size. The integrated site's canvas fills its container (verified
858 by 831 CSS and 760 by 736 backing pixels in the local app). Corrected probes
explicitly fill their viewport and assert CSS and backing sizes separately.
The corrected frozen-world run explicitly verifies 1280 by 720 CSS, 760 by 427
backing pixels, 162 draws and hardware NVIDIA WebGPU. It still records a 33.4 ms
gap with a 26.12 ms major collection (14.90 ms heap epilogue safepoint). The sizing
mistake does not explain this reproduced hitch. This isolation has no per-frame
gameplay, collision, door, animation or R3F work.

The gray strip is a separate browser presentation issue: the test viewport was
1280 by 720 inside a 1440 by 900 Chrome window. The review browser was relaunched
without viewport emulation, then reopened on the existing integrated site at
port 4541. The natural content area is 1408 by 715; after layout settles, the
canvas fills its 1393 by 662 container (760 by 361 backing pixels). The remaining
15 pixels are the site's vertical scrollbar. This is a presentation repair,
not new performance qualification or integration of the pending source bundle.
Evidence: frozen-world-sized-long-result/analysis.json and
integrated-native-viewport.json/png in the external audit. The owned original
preview browser was closed; its replacement keeps the same static server root.

Acceptance remains evidence-led: bounded caller-owned scratch data in measured
hot loops; explicit source/instance/batch ownership; exact surface and collision
parity; headed long-run frame pacing with normal recording settings; final site
and portable-download requalification. No forced GC, GC-disabling flags, delayed
kitchen loading, camera-specific exceptions or reduced forest density are fixes.

References checked:
- https://threejs.org/docs/pages/InstancedMesh.html
- https://threejs.org/docs/pages/BatchedMesh.html
- https://threejs.org/docs/pages/Object3D.html (static render-state contract)
- https://threejs.org/manual/pages/how-to-dispose-of-objects.html
- https://r3f.docs.pmnd.rs/advanced/scaling-performance
- https://github.com/pmndrs/math (caller-owned output operations)
- https://raw.githubusercontent.com/v8/v8/main/src/heap/memory-reducer.cc
- https://developer.chrome.com/docs/devtools/memory-problems

## Goal

Complete an original, polished PSX cabin and woodland asset pack and an extensive
R3F/Three.js WebGPU asset demonstration maintained in the Kiln open-source
repository. Preserve the agreed cabin layout, mixed walkable forest, clear
approaches, interactive furnishings, tools, supplies, spiders, Stone Golem and
Caretaker. Finish natural first-person anatomy, grips and animations, a working
left-hand flashlight, predictable controls and collision. Reduce actual draw
submissions and unnecessary CPU work while preserving the art and editable
canonical assets. The primary performance objective is smooth 60 FPS in aerial,
orbit, indoor and active walkthrough views on the connected hub, in a visible,
headed browser on its actual desktop display with verified hardware WebGPU.
Roughly 100 total draws is a soft optimization target, not a completion gate.
Preserve art, forest density and interactions rather than sacrifice them for
that count. Deliver the same exact selected revisions in the gallery,
pack and scene, with runtime models and metadata, importable Full Kiln bundles,
portable scene source and a runnable scene archive. Feed demonstrated authoring
and integration defects into engine fixes or generic maintained skills without
imposing scene-specific requirements on standalone assets or other engines.
Reopen the integrated site preview for owner feedback before publication.

Keep the approved warm porch light on for aerial/orbit presentation and turn it
off in Play as Caretaker. Play starts unarmed with the left-hand flashlight on;
finish its physical grip, beam alignment and first-person appearance. Retain the
modest ambient lift while preserving the dark woodland atmosphere. Provide
fullscreen through the site's shared shell and in the standalone scene.

This is an asset demonstration. A complete survival game, multiplayer, a new AI
system, navigation stack and production audio campaign are outside this pass.

## Source ownership and existing contracts

- Maintained consumer scene: this package, including `src/game`, portable tests,
  build, runtime hydration and software notices. Further scene edits happen here.
- Editable asset source and selected manifests: the companion
  [pack source](../../../packs/cabin-woods-psx-horror/README.md), populated from
  reviewed immutable asset revisions during final staging. Authoring remains
  in the separate live Kiln workspace; it is not a runtime dependency.
- Site integration: `site/src/pages/scenes/cabin-woods-psx-horror.astro`, pack and
  gallery pages, the shared SceneShell and `site/scripts/stage-cabin-woods.mjs`.
- Engine/project delivery contracts:
  [projects and live review](../../../docs/projects-and-live-review.md),
  [export profiles](../../../docs/export-profiles.md),
  [atlas provenance](../../../docs/atlas-provenance.md) and
  [procedural surfaces](../../../docs/procedural-surfaces-v3.md).
- Maintained authoring and scene skills remain generic. The asset bible, cabin
  layout v2 and earlier engine-upgrade research supply design history; dated
  proposals never override verified source or current owner feedback.

Do not edit the old author-workspace scene and this package independently.
Asset changes create immutable children, followed by explicit reviewed intake.
Every benchmark names its source/build and asset-selection identity. Rebuilds
supersede an earlier benchmark candidate; results are never silently relabeled.

## Verified baseline

| Work | Current state |
| --- | --- |
| Maintained scene | Current portable suite: 174 tests pass; production build passes. Scenes typecheck/lint pass (Cabin lint is advisory). Source is local and uncommitted, not published. |
| Cabin and forest | Rebuilt cabin/layout and furnishings; pine/birch woodland, rocks, clear approaches and supplies are implemented. Rock and door collision and route replay have structural evidence; owner walkthrough remains part of acceptance. |
| Vegetation | Global family instancing with per-instance conservative frustum selection is the scene default. The former cell strategy is a benchmark baseline only. |
| Asset consolidation | Reviewed pine, cut-pine, bush and spider children are selected. Their Full Kiln import/rebuild checks pass. Birch already has two canonical render meshes; current selection inspection confirms its generic-name child is selected. |
| Windows and doors | Shared rigid batches are integrated; original interaction targets, board visibility, hinge motion and collision are retained. |
| Skin bounds | Runtime posed bounds update without disabling frustum culling; canonical geometry and bindings remain unchanged. |
| Optimization progress | Exact texture inventory completed. Texture sharing and compatible furnishing merges are integrated. Fully batched forest source graphs are retained outside renderer/matrix traversal. Role lookup, held animation, emissive state and unchanged skin bounds are cached; temporary math objects and draw counters are reused. Bounded flat ray targets have tests; effects request a target only on new impact events. Final interaction, allocation and hub frame-pacing qualification remains open. |
| UI and controls | Native mouse capture, unarmed/light-on entry and WASD passed headed hub checks. A deliberate pointer-lock rejection verified the explicit keyboard fallback, movement, equipment and flashlight controls; normal native capture passed after removing the test rejection. Simulation now consumes up to 250ms in <=1/60s slices, with equal movement/timer tests at 30/60/120 FPS and 100ms frames. Longer stalls discard excess time. Actual site iframe flow remains pending. |
| Presentation | Shared site SceneShell already supports fullscreen; standalone scene now also supports it, with enter/leave verified on the headed hub. Owner approved the porch-light appearance. Porch-off in Play is implemented but awaits rebuilt runtime verification. |
| Character | Connected body/FPS revisions are now saved, selected and loaded by the maintained scene, with material-faithful saved previews. The FPS metadata names its exact full-body source. Headed native-GLB comparison identified a 19cm rest-eye/body-origin mismatch: aligning the upright local body to the fixed camera removes the exposed collar disk at 55/70-degree look-down. Runtime placement is corrected without changing canonical geometry or adding camera drift. Final integrated character, grips and reload qualification remain open. |
| Room visibility | Optional helper has 15 focused tests passing, but is unwired/default-off and lacks real WebGPU query/image qualification. |
| Delivery | A 53-revision selection is sealed and its 109 verified runtime files are loaded by the maintained scene. Body/FPS/shotgun Full Kiln and runtime exports exist. The fixed shotgun and owner-approved lower-elbow FPS revision are selected. Gallery/pack staging contains all 53 assets and three verified-hash download profiles. Fresh import/remix/rebuild, integrated site review and final performance qualification remain open. |

At the fixed aerial camera, CSS 1280x720 / PSX buffer 760x427, the latest local
submission diagnostic improved from 175 to 161 draws with 271189 submitted
triangles unchanged after compatible furnishing merges. The headed hub confirmed
161 draws after the query-index, porch-mode and source-archive changes. Pine uses 6
draws including interactive trees; birch, bush and rock use 2 each; spider 4;
window assemblies 7. Before the furnishing merge, prominent families included wood storage and
plank reserves (10 each), cupboards/cabinets/deer mounts (8 each), sawing station
(7), pictures and benches (6 each). These are draw diagnostics, not local FPS
qualification.

The sealed forest-only hub pilot completed 16 accepted cases: global instances
versus cells used 244/376 aerial-game draws and 34/136 forest-view draws. That
archive predates assembly batching and the newest controls/character work.
Frame pacing did not improve in that environment. Separate calibration measured
blank rAF near 16.67ms but an empty native WebGPU canvas near 66.67ms median /
83.33ms p95. A controlled comparison now isolates that floor to the virtual
display path: on the actual Plasma/XWayland desktop, blank rAF, native WebGPU
clear and minimal Three each measured about 8.33ms median/p95 on NVIDIA
hardware; the Xvfb control retained roughly 66.67/83.33ms native/Three pacing.
The underlying driver mechanism is not proven. Actual desktop calibration is
usable; it does not qualify final scene FPS. Final broad profiling remains open.

Evidence: `C:/Users/Mattm/X/nightman-rebuild-audit/presentation-qualification-20261012/`
contains `desktop-summary.json`, `xvfb-summary.json`, rejected-run telemetry,
comparison scripts, resource inventory and headed presentation captures.

An eight-second headed CPU-profile comparison of JS candidates `0f28b562...`
and `a6a2915b...` found the original batched forest hierarchies dominated matrix
updates and renderer traversal. Retaining these sources in a separate archive
reduced sampled aerial frames from roughly 15-17ms to 8-9ms; sampled model update
fell from about 4.1-4.5ms to 1.6-2ms and render submission from about 10-11ms to
4-5ms. The 1280x720 aerial PNGs are pixel-identical (zero changed pixels), with
unchanged draws/triangles. This was an instrumented diagnostic with no full quiet
host admission, not final FPS acceptance. See `source-archive-image-parity.json`,
the two `*-aerial.cpuprofile` files and their `*-smoke.json` receipts.
`bbb5203e-controls.json` records the native/fallback input checks;
`body-eye-alignment.json` records exact draft eye placement and hardware identity.

Historical intake ledger (superseded by the current candidate section above):
P00 complete; P01 actual-display baseline qualified (fresh host
checks remain required per run); P02 inventory complete; P03-P05 implemented in
part with correctness tests, further runtime/measured validation pending;
P06 targeted evaluation complete without adoption; P07 remains off/optional;
P08-P09 have the partial fixes above; P10 has provisional selected-runtime intake; P11-P13 remain open. The same final 53 revisions are
not yet sealed and smooth 60 FPS is not yet an achieved result.

### Caretaker intake and closed-join correction

Current body is `r_a6a15017a0db4908be17d03165443ba6`; FPS arms are
`r_b4db27f764214a1da134374e4c782464`; shotgun is
`r_6a85c34ec22c4d9eaaf6b21e59152929`. All have material-faithful saved previews.
The shotgun chamfer closes the measured 5mm receiver/barrel gap without moving
barrels, grips or animation tracks. Earlier interfering extensions were rejected.
The FPS shotgun hold and left-hand reload now keep elbows below the wrists and
shoulders. The owner approved the shown native headed hold/reload direction.
Fresh checks covered 574 elbow samples, 2452 carried skin/tool cases, 2380 dense
left-digit cases and 10 FPS clips, with no sampled intersection or visible cap
failures. Final metadata correction preserved exact geometry/animation bytes.
These samples are not continuous collision proof or complete candidate acceptance.

Current selection seal is
`1cedd25a9ebc757b28054c03ee87afc3f388bd72740f6ea8778afefc8278ede7`.
All 109 runtime inputs are loaded by the maintained scene. The site staging
contains all 53 gallery assets and runtime, editable and runnable-source archives,
with public availability false. Project revision
`r_0000000002_ed53498b63581befea0cc4198a8e6ee9fc90d7d3573ab946ffdd19e222f81822`
pins the same selection. Scene JavaScript remains `game-Ct_L72mw.js`; asset selection
identity must accompany that bundle identity. Final integrated walkthrough,
download rebuild and frame-pacing qualification remain pending.

Receipts and scripts are in author workspace `production/caretaker/feedback-01/`
and external audit `presentation-qualification-20261012/`. Prior runtimes and pins
are preserved there. No commit, push, merge, deployment or publication is approved.

## Work sequence and acceptance

All tasks are owned by the primary agent. Independent preparations may be
interleaved by that agent; no subagents resume without a new owner request.

| ID | Task | Depends on | Completion evidence |
| --- | --- | --- | --- |
| P00 | Reconcile stopped-agent handoffs, freeze evidence and make maintained scene source authoritative. | None | Agent status confirms stopped; root handoff records hashes and accepted/draft/experimental distinctions; tests/build pass. Complete for current source intake. |
| P01 | Qualify the hub browser/presentation environment before more scene FPS testing. | P00 | Quiet host checks, actual GPUDevice and display identity; blank, native-clear and minimal-Three baselines. One-factor browser-feature comparison, offscreen/canvas and actual desktop-display comparisons only as needed. No unexplained empty-canvas pacing floor accepted. |
| P02 | Build an exact resource-sharing inventory for furnishings and remaining heavy families. | P00 | PNG/content, sampler, UV transform, color-space and complete material-state matches; semantic/dynamic boundaries; actual draw contributors. Count feasible buckets without claiming a measured gain. |
| P03 | Reuse identical textures/material states and merge compatible static prop geometry; instance exact repeated geometry. | P02 | Focused failing tests followed by smallest fixes; world positions/normals/UVs and images preserved; interactions, lights, storage visibility and ray-hit provenance retained; actual draw deltas. Keep different materials, deforming and controlled parts separate. |
| P04 | Reduce runtime hierarchy and update costs. | P02 | Retained source markers and authoring graphs stay available for inspection/provenance but do not require repeated render traversal. Cache role/socket bindings; avoid unchanged mixer, skin-bounds and material updates; reuse temporary vectors/arrays; measure allocation and CPU category changes. Existing background matrix freeze is already implemented. |
| P05 | Give interaction and line-of-sight queries explicit bounded targets and a spatial broad phase. | P03/P04 | Same nearest-hit/occlusion semantics, door/board behavior and pickups; no full-world decorative hierarchy scan each aim update; rock/capsule route regressions pass. Adopt a static BVH only where an actual measured query workload warrants it. |
| P06 | Evaluate `pmndrs/math` at selected numeric hot spots. | P02/P04 | Compare reusable Three scratch objects with caller-owned numeric arrays; verify coordinate, aliasing and precision contracts; benchmark on hub; adopt only exact pinned subpath imports with measured benefit and notices. No wholesale math or physics rewrite. |
| P07 | Add conservative room visibility only where it improves total cost. | P03/P04 | Preserve visibility through open doors/windows and camera-inside/near-plane cases. Room/portal grouping must work while walking. Optional GPU queries require actual backend ordering and image proof; unknown results fail visible; moving-camera proxy churn is avoided. Keep helper off or remove it if it has no net benefit. |
| P08 | Finish and independently review Caretaker/body/FPS/weapon assets. | P00 | Connected pelvis/shoulders/elbows, aligned eyes, horizontal left flashlight carry, relaxed empty right idle/natural walk, normal opposing-thumb grips, axe swing, trigger/fire and synchronized reload. Fixed 16:9 camera and look-down show no clipped loading action or exposed artificial neck disk. Recheck dense surface contacts and all clip phases, then save immutable children with exact body/FPS lineage. |
| P09 | Complete first-person runtime behavior and entry UX. | P08; P05 for final walk | First entry unarmed/light on; 1/2/3 and F/reload behavior; local head/duplicate arms hidden and torso/legs appropriate; continuous walk/run animation; fixed camera with no breathing/drift; pointer-lock error shown and a deliberate usable fallback if needed. Correct frame-rate-dependent movement caused by the current 50ms dt clamp using bounded real-time stepping; verify equal trajectories at different frame intervals. |
| P10 | Intake final asset children and seal one complete review candidate. | P03-P09 | Same 53 exact revisions for gallery/pack/scene; generic public names; project pins updated explicitly; exact runtime sidecars, material closure, canonical source and metadata; no intermediate character export mistaken for final. Rebuild from maintained source and record new identity. |
| P11 | Qualify the final integrated candidate on the hub. | P01/P10 | Fixed aerial, orbit, all rooms/workyard and actual trusted Play/WASD/mouse-look forest routes; unarmed/axe/gun/flashlight/reload and collisions active. Match paths, camera, buffers, settings and warmup; record all placed-family draws, CPU categories, p50/p95/p99, long frames, allocation and supported GPU timing separately. Repeat paired comparisons only when they resolve a change or concern. |
| P12 | Stage and verify gallery, pack, scene and public source delivery. | P10/P11 | Real site SceneShell entry/fullscreen/exit, asset inspection and all download types; fresh Full Kiln import/remix/rebuild; runtime metadata references; portable source install/build/hydrate/serve; licenses and generic naming. Source stays in this repo and standalone source archive. |
| P13 | Close engine/skill feedback and reopen the integrated preview. | P12 | Demonstrated issues mapped to resolved/deferred/rejected decisions; generic skills plus managed-copy/package checks; applicable engine/scenes/site gates; owner-facing review notes and preview. Publication remains a separate owner decision. |

### Performance goals

- Primary objective: smooth 60 FPS on the qualified hub at the agreed PSX resolution,
  in a headed, visible browser on the actual desktop with verified hardware WebGPU.
  Proposed frame-pacing criteria: median
  frame interval at most about 16.7ms, p95 at most 25ms and p99 at most 33.4ms.
  These are proposed acceptance goals, not current achieved results. Preserve
  the visual density and authored assets; discuss art changes before reducing
  them to meet a number.
- Roughly 100 actual total draw submissions, including post passes, is a soft
  optimization target, not a hard cap or release gate. A higher count is acceptable
  when representative active views meet smooth 60 FPS with the art and interactions
  preserved. A lower count alone is not success. Report dynamic/pass floors and
  measured trade-offs honestly.
- Report actual CPU simulation, animation/bounds, traversal, aiming, submission
  and allocation costs separately. CPU time around `render()` is not GPU time.
  Measure instrumentation overhead; paused/on-demand savings do not substitute
  for continuous active-walk qualification.
- Account for all 46 currently placed asset families and distinguish the 7
  pack-only assets. A family not visible in one camera is covered in another
  relevant view; canonical mesh counts are not substituted for actual draws.
- No triangle reduction, new atlas, WebGPU compute culling or physics engine
  adoption without a demonstrated problem and a useful measured trade-off.

### `pmndrs/math` decision scope

The current project publishes as npm `math` (0.1.0 verified on 2026-10-12), not
`maath`. Its caller-owned array APIs and `math/shapes` frustum/box/raycast
operations are relevant to visibility and query hot spots. `math/geometry`
hull helpers and `math/ik` FABRIK may be evaluated when those workloads justify
them. Three objects remain the rendering boundary; avoid per-frame conversion
allocation. A math library does not consolidate meshes or automatically reduce
draw calls. Deterministic forest placement must remain stable if random/noise
helpers are ever adopted. No dependency has been added to the scene.

Targeted 2026-10-12 evaluation used the integrity-verified npm `math@0.1.0` archive
only in the external audit folder. In the headed hub Chrome browser, its WebGPU
zero-to-one frustum test matched Three on 4096 synthetic forest-scale boxes;
inside, parallel-outside and near-parallel ray samples also matched. Nine
alternating warmed trials of 524288 frustum tests measured about 16.5ms median
for Three versus 12.9ms for math, excluding conversion. This implies only about
0.007ms saved per 1000 boxes, not a measured scene-frame improvement. Both test
paths reused storage. Decision: retain Three scratch objects; no runtime
adoption is justified by this workload. This is sampled correctness and a
numeric microbenchmark, not a general library certification or GPU/FPS result.
Receipt: external audit `math-evaluation.json`; package integrity:
`sha512-hq5KkLblFiR8OO8ZYqPK02mBqrXuxJ6hwvhL3ZM9OFkAR82/20n4H768SWl4yVVrufh8VijEm42D4V9N8hDa2g==`.

## Hub quieting and qualification boundaries

ExpressVPN and WARP services are stopped; the idle mk-os Actions runner was
paused after confirming no active worker. No Docker containers were running.
The short idle check showed GPU 0%, 40C, and low CPU load. Desktop ChatGPT/Codex
sessions remain open; their occasional activity must still be caught by the
contention guard. Do not kill sessions or essential networking to manufacture
a clean result. Record and restore intentionally paused testing services at
the end of profiling, subject to the owner's VPN preference. The owner explicitly
chose to leave ExpressVPN and WARP stopped on 2026-10-12 during the final review
qualification. Do not restart or reconnect either VPN. The mk-os runner was restored after the final timing work and is active/running; its service-state receipt is retained.

The old pilot used headed Xvfb. Current qualification uses the actual visible
Plasma/XWayland display :0, Chrome 150 and the NVIDIA GTX 1660 Ti Max-Q. Verify
the actual GPUDevice and fallback flag on every candidate. Adding VulkanFromANGLE
alone did not remove the Xvfb floor. Do not use Xvfb, software adapters or headless
results as final performance acceptance evidence. The actual-display guard
explicitly accounts for pre-baselined KWin/Xwayland compositor participants while
retaining thermal, memory and unrelated-process contention checks and raw telemetry.

## References

- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
- [Three.js Object3D](https://threejs.org/docs/pages/Object3D.html)
- [Three.js Renderer](https://threejs.org/docs/pages/Renderer.html)
- [R3F performance scaling](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [R3F performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)
- [Chrome WebGPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [Chromium Linux Vulkan pairing context](https://chromium.googlesource.com/chromium/src/testing/+/3afe6aed9a358496eb691275f44568b60344ea3a)
- [pmndrs/math source and API](https://github.com/pmndrs/math)
- [Maintained Golden Gate performance procedure](../golden-gate/PERFORMANCE.md)

## Completion and publication

A test pass, saved draft, benchmark launch or staging scaffold does not complete
the pack. Completion requires the integrated candidate, exact download/import
flows, representative performance evidence and owner visual feedback. Proper
site integration is required: the scene must work inside the real site shell,
all 53 selected assets must be present and browsable in the gallery, and gallery,
pack and scene pages must consistently link the exact selected revisions and
working downloads. Verify navigation, previews, fullscreen and download/remix
flows through the integrated site, not only the standalone scene.

Prepare a complete review candidate and reopen its integrated site preview for
the owner immediately before requesting release approval. Provide the candidate
identity, concise changes, validation/performance evidence and remaining limits.
The owner must be able to inspect the scene, every gallery asset, pack and
downloads before explicitly approving any commit, push, merge, deployment,
public availability switch or publication. Approval applies only to the reviewed
candidate and the actions explicitly authorized; material changes require renewed
review. Continue serially through this ledger; update states only with evidence.
No release action is authorized by this plan itself.
