> Current disposition: [5 October completion status](../reviews/2026-10-05-troy-completion-status.md) and [release sequence](2026-10-05-troy-release-plan.md). Checkpoints below are historical; their pending statements and paused marker do not describe the resumed current development cycle.

## Current checkpoint: controls, shield arms and tablet intake, 5 October 2026

All 228 scene tests pass. Primary Troy controls stay visible; secondary View/More menus start closed, with Hide/Show and focus-safe dismissal matching Kiln Farm/Fab/Bridge conventions. Both heroes’ shield-arm intersection is fixed; twenty original-mesh rendered replays pass. Current infantry audit finds zero contacts in 1690 poses; crew/archer runtimes currently have no shields. Physical Samsung tablet diagnostics and opt-in DPR/shadow tiers are recorded; automatic tier selection and sustained performance are not accepted. Exact local stage-22 has 521 browser files and is not on the hub. Read docs/reviews/2026-10-05-troy-controls-shield-tablet.md and scene/evidence/hero-shield-arm-01/receipt.json. The 60 FPS hub target remains open. Full delivery goal remains incomplete; the app goal is paused, and this checkpoint records the explicitly requested HUD, shield and tablet work.

## Current checkpoint: both paired shield interceptions, 5 October 2026

Hector blocks Achilles's follow-up at 9.75 s; Achilles blocks Hector's at 12.5 s. Original sword parries remain. All 205 scene tests pass, including dense original-mesh contact/continuity and millisecond retreat reach. Exact stage-14 (516 browser files) completed two natural full duels per backend, contact captures, source checks and release without errors/warnings. Retained browser matrices replay as original-mesh contacts on both backends. The stage-13 repeat failure is preserved and repaired; first-use WebGPU stall and full performance/owner acceptance remain open. Read docs/reviews/2026-10-05-troy-paired-shield-interceptions.md and scene/evidence/hero-paired-shield-impact-01/receipt.json. The full goal stays active; local development, hub testing.

## Current checkpoint: hero exploration and city routes, 5 October 2026

Either hero can explore from the arena through the original gate and into the city. Actual placed obstacle triangles, occupied-door waiting, a swept-volume camera and separate input owners are implemented. The narrow courtyard approach is repaired with bound-aware cross streets. All 200 scene tests pass; Hector completed the local rendered route through actual controls. Exact stage-12 (515 browser files) passes both-backend routes/mode ownership/release and eight natural movement windows (160 seconds). A 2841.1 ms first-use WebGPU stall remains; final performance/owner/device acceptance is open. Read docs/reviews/2026-10-05-troy-hero-city-exploration.md and scene/evidence/hero-city-exploration-01/receipt.json.

Completed stage-10 current-workload-05 has 52 windows / 1,040 seconds, zero errors/warnings and exact source/cleanup checks, but predates this exploration/street source. Rendered camera obstruction recovery, touch/physical-device behavior, relaxed exploration poses, paired shield impacts, startup/shadow/performance, unrelated reusable workflows/skills and final source/asset/site delivery remain open. This computer owns development; the hub runs isolated checks. The full goal stays active.

## Current work: exploration and shield review, 5 October 2026

Local free exploration now supports either hero, actual placed city contacts, occupied-gate waiting, a swept-volume camera and independent input ownership. All 198 scene tests pass, including both offline input-driven city routes. The rendered gate/courtyard journey, current-source hub qualification, control/camera feel and recovery checkpoint of this newer work remain pending. Stage-10 current-workload-05 completed both backends: 52 windows / 1,040 seconds, zero errors/warnings and exact source/cleanup checks. It predates exploration; the first WebGPU handoff still stalls 3107.7 ms. Read the current completion-status review for precise source scope.

The refreshed WebGPU preview confirms Achilles, the blue hero, raises shield cover during Hector's counter at 11.6 seconds. Both focused actual-asset shield pose/continuity tests pass. The paired choreography still meets swords at its timed contacts. Complete actual shield interceptions and convincing defense/recovery in the paired duel, preserving natural hand/weapon clearance and seekability; obtain owner visual acceptance. Playable blocking already uses actual shield geometry and explicit Block/Space input. Evidence: scene/evidence/hero-shield-current-confirmation-01. The full goal remains active.

## Current checkpoint: rendered ground and hinged gate, 5 October 2026

Scene heroes now use actual rendered triangle heights. Troy's saved hinges open/close through the existing seven batches; whole posed-hero passage checks and WebGPU/WebGL2 previews pass. All 189 scene tests pass. This establishes prerequisites; free beach/hero/gate/courtyard exploration, moving/occupied-door collision and rendered follow-camera passage remain open. Read docs/reviews/2026-10-05-troy-city-ground-gate.md and scene/evidence/city-ground-gate-01.

Stage-09 current-workload-04 completed 52 windows / 1,040 seconds on both backends without browser errors/warnings. City means 12–14 ms; first WebGPU handoff still stalls 3007.9 ms. Its evidence predates these contact/gate changes. Exact 509-file stage-10 is on the hub and current-workload-05 WebGPU is dispatched; terminal result and WebGL2 remain pending. Startup warmup is still reference. Full goal, supported-device performance, reusable workflows, delivery and owner acceptance remain open.

## Current checkpoint: off-camera motion adopted, 5 October 2026

Shadow-aware off-camera shared walking is now the scene default with fleet culling on; walkOffscreen=reference and culling-disabled restoration remain available. Same-source WebGPU/WebGL2 comparisons:32 windows/640s,16 exact image pairs, city/courtyard means about26–28ms to12–14ms. Unsupported and shadow-relevant/near motion retain CPU source posing. All182 scene tests pass. Read docs/reviews/2026-10-05-troy-offscreen-motion.md and scene/evidence/walk-offscreen-01/receipt.json.

Adopted stage-09:507 browser files, archive707062ce4c1d12ca2d15d6bdd5b2174f9071027fdde095f536e08783ce4d060e; hub reports zero mismatches. Full current-workload-04 is dispatched on WebGPU, with terminal result not yet collected and WebGL2 pending. Resume the existing job. Older full matrices retain their prior source scope. Startup warmup remains reference; the expensive pass candidates remain opt-in. No final GPU/device/owner acceptance.

Maintained optional runtime guidance passes validation, package-byte, fresh-setup and managed-upgrade/customization fixtures. Existing authors were not rewritten. Next: full adopted-source workload; finish the beach/hero/gate/courtyard journey and actual terrain contacts; first-use/shadow/fallback/playfeel/device work; unrelated reusable workflow, source/asset delivery and owner acceptance. Full goal active.

## Current checkpoint: full workload and startup comparison, 5 October 2026

Current twelve-ship/later-reserve workload completed52 twenty-second windows on both backends,1040 measured seconds, zero browser errors/warnings and exact source/cleanup checks. Stage-05 remains the full-matrix source. The latest stage-07 source has179 passing scene tests and507 browser files. Both heroes visibly guard with their shields in paired defense windows.

Actual offscreen startup passes avoid the tested first-use WebGPU handoff stall with identical frozen images, but add13.4s (later-only) or16.5s (full) to readiness in separate comparisons. Both remain opt-in; default is reference. No whole-scene60FPS, GPU execution or physical-mobile qualification. Read docs/reviews/2026-10-05-troy-warmup-workload.md and scene/evidence/scene-pass-warmup-01/receipt.json.

Next: preserving off-camera CPU pose reduction (city views hide112 later actors yet evaluate112 rigs), cheaper startup strategy, complete beach/hero/city route and contacts, shadows/fallback/device/playfeel, unrelated reusable workflows/skills, source rebuilds and final delivery/owner acceptance. The goal remains active. Earlier notes retain their dated source scope.

## Current checkpoint: later reserves integrated, 5 October 2026

All112 later sailors now march beyond shore staging into four translated flank reserves, preserving offshore IDs. Distant walking uses shared GPU clips, close views restore the CPU sampler, and formed reserves use GPU idles. Total playback:777.375s. All175 scene tests pass, including failed-admission cleanup; both backend previews show completed reserves. Read docs/reviews/2026-10-05-troy-late-reserves.md and scene/evidence/late-regroup-runtime-01/receipt.json.

Exact stage-05 archive:bb95b735375a649280aa36790d196a67c6814d5a7d03f1509aa6680e285791a8;506 browser files match locally and on the hub. Use its separately staged current-workload runner (14 leases,5 shared textures,13 workloads). Current performance remains unmeasured. A prior warmup-reference attempt was rejected by quiet admission with zero cases; do not use it as timing evidence.

Next: admitted hub qualification of current later ownership/transitions and frame tails; complete beach/hero/city route and ground contacts; shadow/culling/startup/fallback and playfeel/device review; reusable workflows/skills, source rebuilds and final delivery/owner acceptance. Goal remains active. Earlier notes retain their dated scope.

## Current checkpoint: paired shield use and full workload, 5 October 2026

Both paired heroes now raise and face their shields toward incoming attacks during their defensive exchanges. Playable player blocking remains an explicit input. All 172 scene tests and 14 focused hero checks pass; WebGPU/WebGL2 screenshots are retained. Read docs/reviews/2026-10-05-troy-shields-workload.md and scene/evidence/hero-duel-shield-use-01.

Stage-03 completed 44 natural workload windows (880 seconds), with zero browser errors/warnings and successful cleanup. The first WebGPU handoff still stalls 2799.7 ms. An opt-in stage-04 warmup experiment still stalls 1391.4 ms and remains unadopted; same-stage reference/startup/image comparison is pending. The full matrix predates this local shield correction.

All 112 later reserve routes have offline terrain/pose/spacing evidence, but runtime and GPU-owner integration are pending. Next: integrate those routes and city journey, resolve first-use stalls and shadow/device/playfeel findings, then reusable skills and final delivery/owner acceptance. Full goal active. Earlier notes retain their dated scope.

## Current checkpoint: preserving crew CPU work, 5 October 2026

Crew travel caches joint references and defers redundant full-tree synchronization while retaining final world transforms. All 164 scene tests pass. Thirty-two ten-second uninstrumented hub windows cover unloading, marching, hero combat and aerial travel across WebGPU/WebGL2; sixteen frozen image pairs have zero changed pixels and exact actor/count/camera comparisons. Only the sampler changes among 501 browser files; assets, banks and contact targets are preserved.

Current hub candidate: troy-current-runtime-stage-03, SHA-256 bb9b39a441623a7f7a7a066fc4ad18c1e051f13475cb6a734ff9c54d951ab4fe; 501 browser and 1,263 dependency files verified. Read docs/reviews/2026-10-05-troy-crew-matrix.md and scene/evidence/crew-matrix-01/receipt.json. The comparison shows a bounded improvement, not full workload/device qualification. Unloading remains around 35–36 ms mean with 41.7 ms p95; the earlier 2.816s transition stall remains unresolved.

Next: complete the corrected full-workload matrix and investigate transition stalls; finish later-crew destinations and the city journey; qualify shadows, culling, startup/fallback and device policy; prove reusable workflows/skills and final source/asset delivery, then owner acceptance. The full goal remains active. Earlier notes below retain their checkpoint scope.

## Current checkpoint: sustained combat reach, 5 October 2026

The longer hub workload found and reproduced a planted-foot reach failure during bot recovery/approach reversals. The live swing duration is now 0.16s; contact targets and the reach guard remain intact. All 163 scene tests pass. Six profiled twenty-second browser windows pass on WebGPU/WebGL2, including more than 19 seconds of active combat and complete resource release.

Current hub candidate: troy-current-runtime-stage-02, SHA-256 5cc9ecd102bbc50f956f72db208f44c12c9f5b2065eceb018bfb23770b1eeb05; 501 browser and 1,263 dependency files verified. Only the live hero rig differs from stage-01. Evidence: scene/evidence/hero-gait-reach-01 and current-cpu-attribution-01. Engine review: docs/reviews/2026-10-05-troy-hero-gait-reach.md.

The earlier natural matrix failed during combat and is retained in scene/evidence/current-workload-01. Its seven completed windows and 2.816s transition interval do not form a performance pass. Profiling points to fleet pose/world-matrix work as the next optimization; the transition stall remains unresolved. Complete a corrected repeated natural matrix, later crew/city integration, device/shadow qualification, reusable skills/delivery and owner acceptance. Full goal remains active.

# Kiln and Troy completion plan

Current cleanup/status checkpoint, 5 October 2026: partial fleet startup and
root scene teardown now release owned resources, preserve borrowed owners,
remove controls/listeners/panels and close once. Five focused checks and all160
scene tests pass. Eight injected failures and normal recovery/double-disposal
checks pass across WebGPU/WebGL2. Current source and banks are preserved.
The hub stage troy-current-runtime-stage-01 matches501 browser files and1,263
Three.js dependency files; current performance remains unmeasured. Read the
new docs/reviews/2026-10-05-troy-startup-cleanup.md and completion-status.md.
Migration is complete; final integrated city/routes, current shadows/performance/
device policy, reusable workflow/skills and owner delivery acceptance remain open.
Earlier notes below retain their dated source and acceptance scope.

Current resource checkpoint, 5 October 2026: immutable pose texture pooling
is active. Exact matching infantry and shore-idle payloads share storage while
source pins, geometry, materials, equipment and actor phases remain separate.
The default full scene uses five pose DataTextures and 13,020,696 raw bytes;
separate registration uses seven and 15,464,592 bytes. Both backends preserve
source pins, actor positions and binding checks across six views. All 155 scene
tests pass; all four scene release checks free every pool lease and payload.
Read docs/reviews/2026-10-05-troy-pose-texture-pool.md and the exact scene receipt
at evidence/pose-texture-pool-01/receipt.json. Canonical CPU copies are explicit;
physical VRAM, total heap and frame costs remain unqualified. Full-workload
shadows/culling, hub/device costs, startup/failure cleanup, terrain/ocean/city,
reusable workflows/skills and owner acceptance remain in the active full goal.
Earlier checkpoint notes below retain their dated source scope.

Current scene intake, 5 October 2026: fleet crews now use the same saved solid
block donor r_2afc9ff07e944c70be5236f263c3f9bc with natural oar grips and
forearm-aligned wrists. Rowing, release, unloading, shore idle and regroup
marching use coherent landing-v11, crew-v3, crew-idle-v2, formation-idle-v2 and
walk-bank-v2 sources/banks. The 336 fleet crew join the 336 shielded formation
infantry, 48 archers and two heroes in the simple block-hand style. Current
infantry-v1, archer-v5 and both saved hero children are unchanged. All 147 scene
tests pass; decoded rowing contacts and independent bank interpolation/bounds
checks pass. Ten actual-scene captures check five stages on WebGPU and WebGL2.
Read kiln-oss/docs/reviews/2026-10-05-troy-fleet-block-hands.md and the exact
scene/evidence/fleet-block-hands-01/receipt.json. Four stored transform payloads
fall from 22,932,288 to 12,961,728 bytes (43.5%); this does not establish a
frame-time or GPU allocation saving. Full-workload shadows/culling, isolated
hub/device costs, resource pooling, terrain/ocean/aerial stability, city routes,
reusable workflow/maintained skills and owner acceptance remain open. Earlier
dated checkpoint descriptions retain their original source scope.


Latest owner correction: the mitt child r_56a63955df434655be9a11d0afdb01dd is
REJECTED visually, including the archer-v2 style. The replacement is child
r_2afc9ff07e944c70be5236f263c3f9bc: one compact solid beveled hand block per wrist,
no sideways finger slab, separate thumb or opening. It is saved, exactly rebuilt,
GPU-reviewed and displayed in Library 4538. Read the newer
kiln-oss/docs/reviews/2026-10-04-troy-block-hands.md. This new geometry is not yet
the live scene donor; role anchors/attachment poses and banks require new intake.
Old hand contact passes do not qualify it. Earlier selected-mitt wording below is
superseded. The full goal remains active and owner appearance approval is pending.


Current checkpoint: owner-directed simple mitts are integrated into all 48 packed
archers via runtime/archer-v2. The exact saved child remains
r_56a63955df434655be9a11d0afdb01dd. Matte body/hand skin now shares a compatible
batch; bow position and normal fitting are qualified by sampled bank checks.
129 scene tests and basic current WebGPU/WebGL2 retrieval/draw/release inspection
pass. Read kiln-oss/docs/reviews/2026-10-04-troy-archer-mitts.md and the scene receipt
at evidence/archer-mitt-intake-01/receipt.json. Fleet, infantry and hero mitt
consistency, affected banks, current shadow/performance/device/owner acceptance
and the wider full goal remain open. Earlier checkpoint claims below are history
where superseded by this intake. The final bank payload reduction is 5.2%; no
rendering cost improvement is claimed.


The owner corrected the hand style to simple mitts and asked for shared bodies,
faction clothing and modular equipment. Use the newer mitt child in the updated
hand review; the detailed-finger candidate was rejected. Follow the
[character-kit plan](2026-10-04-troy-character-kit.md) for source/resource sharing
and compatible role batches, with matched full-workload hub qualification.

The [articulated-hand candidate](../reviews/2026-10-04-troy-articulated-hands.md)
now has an exact saved/rebuilt crew child, sampled grip/release proof and an
isolated archer fit/material correction. Next is adapter intake and affected
motion-bank/bounds rebuilds before changing live crew/archers, followed by infantry
adoption. The latest integrated scene remains the hero shield checkpoint below.

Latest scene checkpoint: [both revised heroes and shield defense](../reviews/2026-10-04-troy-hero-shields.md)
are integrated locally. 124 tests, eight actual-mesh stationary hit/guard flows
and basic both-backend UI checks pass. All-role hand repair and infantry/bank
adoption remain next; motion/input/bot feel, full workload/shadows/resources/devices,
owner acceptance and other full-goal requirements remain open. Earlier notes
below, including isolated-candidate status, are records of their own checkpoints.

Latest owner equipment direction: shield-equipped Achilles/Hector and frontline
infantry, better hands across every visible role, and clearer champion identity.
Four isolated immutable master candidates now exist, with final-source GPU review,
151 sampled attack poses each and exact saved rebuilds. They are not integrated
into live Troy. Read the [character equipment review](../reviews/2026-10-04-troy-character-equipment.md)
for exact revisions and next shield-combat, articulated-hand and bank work. This
extension is part of asset/contact and playable-hero completion, followed by current
full-scene hub cost and owner review. Earlier evidence retains its original scope.

4 October 2026. Current plan after the hub inventory, remote/main comparison,
Windows migration and review of the retained production work. This consolidates
the [original production objective](2026-10-03-troy-scene-production-plan.md)
and the owner's subsequent requests for a stable aerial shoreline and apparently
continuous land and ocean. It covers assets, optimization, reusable workflows,
skills, engine issues and delivery as well as scene content.

Migration is complete; Troy production is active under the owner's explicit
completion goal and remains incomplete. The first local environment checkpoint
adds reversed depth and modest-cost procedural sand/mountain detail; see the
[environment review](../reviews/2026-10-04-troy-terrain-materials.md). This does not
approve a release or qualify the complete scene/device. Code and
[CHANGELOG.md](../../CHANGELOG.md) establish engine behavior; older dated reports
retain their original evidence, including failed candidates.

The subsequent [continuous environment checkpoint](../reviews/2026-10-04-troy-continuous-environment.md)
removes ground overlap and extends land/ocean beyond the bounded camera envelope.
67 scene tests pass; both backends completed 16 views, 96 travel samples and
quality changes. WebGL2 exact pixel return remains open (19 one-level pixels).
The next implementation slice joins landings, formations, archers, heroes and
city routes; owner/device review and integrated performance remain open.

The [archer reference checkpoint](../reviews/2026-10-04-troy-archer-reference.md)
now provides one equipped, reversible CPU archer in actual Troy, with consumer
wall-cover/hand fit and ballistic release. 77 scene tests and 15 functional views
per backend pass. The trial retains 47 sword placeholders. Next: complete close
equipment review and a qualified 48-actor deformation/visibility derivative,
then the remaining hero, landing and route work. No full crowd cost is claimed.

The [48-archer candidate](../reviews/2026-10-04-troy-archer-crowd.md) advances that
next action: explicit deformation/visibility, exact per-actor projectiles and
matched full CPU reference now run, with packed archers the local preview default.
86 scene tests and comparisons on both hardware backends pass. All four scoped
hub timing receipts are returned; about 22 ms of CPU work remains above a 60 FPS
budget. Full frame pacing, late workload, culling, equipment, shadows, resources,
supported devices and owner review remain open before final acceptance.
Heroes, destinations/routes and reusable delivery
remain required; completing the bank does not close the integrated slice.

The owner's subsequent [archer anatomy correction](../reviews/2026-10-04-troy-archer-anatomy.md)
fixes inward drawing elbows and loop recovery in all 48 defaults. 92 scene tests
and 24 reference/default pose views per backend pass. Owner approval is still
open. [CPU attribution and rigid bounds](../reviews/2026-10-04-troy-cpu-bounds.md)
are completed within their recorded scope; the old cost candidate predates the
corrected motion. Shore poses remain the measured CPU lead. Remaining equipment,
shadows/culling/resources, heroes/routes and reusable delivery remain required.

The [equipment/shadow checkpoint](../reviews/2026-10-04-troy-archer-equipment-shadows.md)
corrects stretching strings and helmet intersection while preserving the arm fix.
95 scene tests and both-backend pose/shadow comparisons pass. QA/compose guidance
has exact offline packaged fresh-setup/managed-upgrade proof, without rewriting
existing authors. Actual-scene shadow coverage/appearance and costs remain open;
this does not close other-input derivative workflows or owner acceptance.

The [initial playable hero checkpoint](../reviews/2026-10-04-troy-playable-heroes.md)
adds both player choices, movement, light/heavy attacks, stamina/guard rules,
live feet/arm IK and a delayed fighting bot. 110 tests and both-backend flows
pass. This starts playable hero qualification; combat contact agreement, motion,
camera/bot tuning, full-scene performance and owner acceptance remain open.

The owner's latest [playable-hero direction](2026-10-04-troy-playable-heroes.md)
extends hero work to choosing Achilles or Hector, movement, light/heavy attacks,
blocking, stamina and a responsive fighting bot. Keep the face-off and paired
choreography reference, but those alone no longer close this requirement.

## Intended end state

This computer is the source of continuing work: current engine/main, all retained
hub work in progress, editable asset sources, exact saved revisions, scene and
derivative scripts, evidence and recovery archives are available locally. The hub
is used for isolated performance testing of identified local candidates, with
receipts returned here. That migration boundary is already established in the
[migration and continuation map](2026-10-04-local-migration.md).

The finished Troy environment is cohesive from sea level through aerial views:
twelve ships approach and unload onto a broad rising beach; Greek and Trojan
formations frame Achilles and Hector; equipped archers and believable crew/army
motion belong in the scene; walls, gates, streets, courtyard and citadel form
convincing routes. Land and ocean appear to extend beyond the scene throughout
the supported camera range, without visible mesh edges, shoreline flicker or
overlapping mountain ground. The approved asset style and vegetation remain
coherent. The selected face-off includes the optional duel interaction.

The same candidate must support usable navigation, stable actor identity and
motion through representation changes, correct contacts and shadows, bounded
startup/resources, and a measured desktop rendering policy. Reduced device modes
need their own evidence. Reusable derivative workflows and maintained skills
must be proven beyond Troy. Delivery includes editable sources and reproducible
runtime derivatives, exact revision/hash provenance, documented limitations and
an approved scene/site artifact. A rendered preview or passing unit suite alone
does not establish that endpoint.

This remains an environment and interaction scene, not a new RTS or full combat
simulation. Projectile damage, casualties, an exterior dock district, every
possible rendering technique, and a universal animation framework are outside
the existing objective. The repaired horse is optional scene content; running
must be grounded before it is used. No new prop inventory is required unless a
route or composition actually needs it.

## Established baseline at migration, with current scene updates

| Area | Confirmed state | Remaining implication |
| --- | --- | --- |
| Engine and released scenes | Main is `a6d2aa3` from PR #133, also the recorded deployed identity. Rigid full optimization, ORM isolation/UV guards, portable tooling and adopted Farm/Golden Gate/Foundry repairs are merged | Do not merge the archived raw optimization branch again. No partially implemented engine change was found in this migration audit |
| Package release | Latest tagged version is 0.10.0; newer main changes are under Unreleased, including the planned 0.11 breaking behavior. npm publication has not occurred | Main/site deployment and a new installable package are separate milestones |
| Troy composition | 528 Greeks, 192 Trojans, two playable shielded heroes, twelve ships, 529 buildings, 80 wall modules and 74 approved plants | Counts describe the prototype, not final visual or capacity acceptance; ground-level composition remains incomplete |
| Landing and identity | Eight shore ships unload 224 crew and support packed regrouping. Four opt-in later landings unload another 112 crew, ending in shore staging. Both backends have retained reversible-clock/identity checks | Finish the intended later-crew destination and integrated motion review; passing trial checks do not make the trial a final default |
| Runtime optimization | Shared parsed fleet assets/rowing texture, CPU pose/subtree/joint work, packed routes, GPU rowing/idles and adaptive distant walking are implemented. Exact nearby/unsupported walking and `walk=reference` remain available | Preserve these baselines; qualify complete-scene costs, transitions, animated visibility and device policies before further adoption |
| Assets and action | Exact saved sources and approved plants are retained.48 equipped archers and both playable shielded heroes are integrated; all actor roles use simple block hands and natural grips. Horse running ground contact remains unresolved | Finish integrated owner/contact/shadow/cost review, bot/camera feel and final delivery pins without treating implementation as owner acceptance |
| Local verification | Root coverage: 3,188 pass, two existing skips; render service: 78 pass; scenes: 713 pass, 18 historical skips; Troy: 53 pass; lab: 69 pass. Actual Windows WebGPU/WebGL2 flows passed within their scope | These are migration receipts, not new hub performance, physical-mobile or owner acceptance |
| Site and platform | Site check/build passed; site unit suite has 562 passes, two historical skips and two file-symlink permission failures under this Windows account | Qualify those fixtures on a suitable Windows account or Linux CI; preserve the security assertions |

Source locations and evidence are mapped in the migration document. Active Troy
code is outside the engine, under
`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion`:
`scene/` owns composition/runtime, `runtime-lab/` owns experiments, and the
motion/horse/vegetation authoring workspaces retain editable sources. The saved
asset library also remains in `review/troy-refine/ws`. Do not develop from an old
output snapshot or silently replace saved master revisions with derivatives.

## Remaining work and evidence

### Terrain, ocean and aerial stability

The owner's observed defect is most visible high above the shore. The original code
uses a camera near/far range of 0.2–6,000, a very thin shoreline film (18 mm lift),
finite ground/water meshes and separate beach/mountain surfaces. That beach spans
2,400 m in X; mountains span 4,000 m and overlap its Z extent by 100 m. Those
coverage and overlap facts explain the visible edge/composition problem. Depth
precision was a plausible cause of the distance-dependent flicker. Matched views
now demonstrate an improvement with reversed depth, enabled by default on the
tested backends. The [environment checkpoint](../reviews/2026-10-04-troy-terrain-materials.md)
records this scoped evidence and the remaining geometry/device limits.

The initial comparison reproduced fixed close, aerial and distant views on both backends. Compare
camera depth settings with identical geometry and water: fit the supported camera
range and test reversed depth, retaining a reference. Three's
[camera guidance](https://threejs.org/manual/en/cameras.html),
[renderer options](https://threejs.org/docs/pages/Renderer.html) and
[reversed-depth example](https://threejs.org/examples/webgpu_reversed_depth_buffer.html)
support investigating depth precision; they do not prove this scene's cause.
Avoid promoting a blanket polygon offset or a larger water lift that hides the
symptom while changing shore contact.

Then make beach and mountains one continuous terrain definition, with matching
boundaries instead of intersecting coplanar base surfaces. Retain exact near-field
ground heights for feet, planks and shore wash. Test a camera-following outer
terrain representation with progressively coarser rings and seam blending.
[GPU geometry clipmaps](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)
are a relevant design reference, not a requirement to add GPU compute or a new
engine subsystem. Choose the smallest approach that provides continuous coverage
and passes cost/appearance checks.

The owner also requested procedural sand and mountain textures if cost is modest.
The implemented LOD profile uses a one-time generated texture, broad vertex
variation and close detail that fades before a texture-free far material takes
over. The bounded hub study supports this default; retain appearance review and
recheck integrated costs after changing coverage. Added data is about 0.79 MiB
for the current geometries, excluding driver/pipeline allocations. No new GPU
compute terrain subsystem is needed merely to supply these textures.

Keep near-shore water/contact fixed; extend outer ocean coverage using world-space
wave phase, compatible ring boundaries and a controlled horizon transition.
Simply translating the existing water mesh would also move its shore behavior
and local wave phase. Check camera travel, ascent/descent, horizon silhouettes,
water/terrain seams and shadows, including WebGL2 fallback. Exit: no visible edges
or fighting in the agreed camera envelope, preserved near contacts and matched
before/after CPU/GPU costs. The camera envelope and acceptable distant detail
must be recorded with the candidate.

### Complete scene motion and assets

| Work | Next concrete result | Exit evidence |
| --- | --- | --- |
| Archers | Replace wall sword placeholders with scale-correct bow/quiver/arrow equipment and compatible grips; implement idle, aim, draw and release | Close/wall/aerial review of hands, string/limb behavior, arrow alignment, parapet stance and transitions. Current mesh-only intake is not texture/material evidence |
| Heroes | Complete default face-off, paired reference/reset and playable choice of Achilles or Hector against a fighting bot, with movement, light/heavy attacks, blocking and stamina | Both player flows, fair delayed bot reactions, balanced stamina/guard behavior, readable motion, equipment/contact/clearance, deterministic replay/reset, shadows, usable camera/input, supported-device performance and owner acceptance |
| Fleet and shore | Review arrival, hull/water response, oar/grip/stow/plank contacts; decide later crews' final reserve path and default landing policy | All twelve ships and intended crew destinations coexist without identity loss, queue collisions or time/representation discontinuities |
| City and battlefield | Complete sea/beach, Greek rear, hero arena, Trojan front, gate/wall walk, streets/courtyard/citadel and overhead-to-ground routes | Ground-level traversal, believable scale/spacing, vegetation/building-ground contact and coherent aerial composition, with the approved plants |
| Horse, if used | Repair running ground penetration from the approved anatomy source | Hoof/body contact and equipment review across the intended motion; approval of the static revision does not close this item |
| Asset delivery | Retain masters; create new revisions only for actual asset changes and explicitly repin scene/project inputs | Revision/source/material hashes, provenance/licenses, structural checks, destination rendering and owner acceptance are separately recorded |

Do not turn Troy controllers, actor counts, slope assumptions or bow dimensions
into requirements for standalone Kiln assets. Runtime derivatives remain linked
to their sources, with CPU/reference motion available where approximation is
unsupported. Projects remain optional and pin exact saved revisions when used.

### Integrated optimization and device policy

Owner acceptance target, confirmed 5 October 2026: **60 FPS on the hub at 1440×900, balanced quality, including combat and fleet transitions**. Current measurements do not meet it. Record first-use stalls, complete-workload intervals and frame tails; repeat-only averages do not close acceptance. Other device classes remain separately unqualified.

Retained checkpoints: [packed routes](../reviews/2026-10-04-troy-packed-footprints.md),
[formation idle](../reviews/2026-10-04-troy-formation-idle.md),
[fleet visibility/resources](../reviews/2026-10-04-troy-fleet-optimization.md) and
[current Troy status](../../packs/troy/STATUS.md). The external scene's
`SHARED-WALK.md` and `evidence/shared-walk-timing-01/` record adoption after the
earlier unadopted exploration; `LATE-LANDINGS.md` records the subsequent trial.

Existing gains are substantial but bounded. Packed routes reduce raw route data
from 15.52 MB to 2.66 MB. Focused formed-unit views improved from roughly 40–47 ms
to 9–10.5 ms. The adopted distant-walk comparison improved busy aerial means from
62.6 to 26.1 ms on WebGPU and 57.5 to 26.7 ms on WebGL2, while near views cost
about 0.7–1.0 ms more and one nearby WebGL2 tail worsened. The slow reference's
50 ms simulation clamp covers less physical motion time: those receipts are not
a complete matched-time scene benchmark or a 60 FPS claim.

Preserve rejected flat/uniform walking candidates. The adopted 92-cycle, 9.52 MB
bank has sampled route error around 4.2 mm and retained conservative bounds; its
20 mm engineering allowance is not a continuous error proof. Check ownership
hysteresis, phase, equipment and shadow continuity through camera motion and
unsupported turns/accelerations, as well as repeat/reverse seeking.

Measure the completed content, not only static formed units: approach, unloading,
regrouping, walking, archers, hero action, city traversal and aerial descent. Record
frame tails, CPU posing/submission, GPU costs when available, draw/triangle counts,
animated shadows, asset/motion-bank bytes, peak/live allocations and first usable
interaction. Compare matched physical time and camera endpoints. Investigate
the measured dominant cost before adding new representations.

Fleet visibility currently omits GPU-animated batches; extending it requires
conservative animated bounds and shadow receiver/light assumptions. Review city
and vegetation culling, then LOD/impostors only where workload justifies them.
Original opaque plants remain the desktop baseline: fewer triangles did not
demonstrate faster pacing, and view-card popping was rejected. CPU/GPU fallback,
quality selection and startup/warming need integrated checks. The hub target is
recorded above; qualify any additional supported device classes before declaring acceptance;
the present prototype counts do not guarantee those targets.

Build and validate on this computer. Stage exact hashed candidates on the hub
without replacing originals. Admit timing only while no agent, bake, build or
unrelated capture is active there. Keep raw receipts and unknown GPU samples.
Physical mobile remains unqualified until that actual device is available;
desktop emulation does not close it.

### Reusable workflows, skills and engine disposition

The external lab already has rigid animation/impostor bakers, static reduction,
comparison previews and qualification scripts. The scene adds adaptive baking,
packed routes and specialized motion adapters. Reusability remains open:

1. Separate generic inspection, rigid sampling, irregular-time lookup, bounds,
   manifests and qualification from Troy-specific rig/ground/placement adapters.
2. Prove another asset family and small static/rigid/skinned fixtures. Unsupported
   deformation/skins/morphs must have explicit rejection or original fallback;
   rigid-part success is not general skinned-animation support.
3. Record source/resources, generator/dependency identity, settings, units/pivots,
   output hashes, clip timing/loops, motion bounds, sampled errors, texture/color
   formats, supported backends, licenses and evidence. Prove reproducible outputs,
   bounded jobs and clear failure/recovery behavior.
4. Document working commands and preview/qualification flows. Proposed generic
   commands in the original plan are not implemented interfaces. Package only
   after another-input and installed-consumer proof; no automatic core adoption.
5. Feed demonstrated shape/fit defects into asset geometry guidance and destination,
   contact/interaction/performance evidence into QA and optional compose-scene
   references. Check maintained skills, registrations, fresh setup, managed upgrade
   and packaged copies while preserving user customizations. The six migrated
   workspaces had current managed skills at migration. Subsequent guidance changes
   have new-package fixture proof; check authors for drift before authoring and
   preserve customizations through an explicit managed upgrade.

No new mandatory terrain/crowd renderer belongs in deterministic engine paths
merely because Troy needs it. Any reproducible engine/export/tool defect found
through these consumers gets its own focused failing test, smallest fix and the
required runtime rebuild/full gates. Keep render images separate from QA gates.
Inspection advisories and optimization estimates do not prove GPU performance.

The transient Windows library-save rename failure passed isolation and a complete
rerun without a source fix. Monitor recurrence; do not record an established engine
bug or speculative fix. The two site file-symlink failures need appropriate host
qualification. A new package version/publication is a separate release decision;
if a final consumer needs newer main behavior, identify its exact engine build
instead of labeling it as the old tagged package.

### Other scenes and existing backlog

Farm, Golden Gate and Foundry's bounded optimization release stays closed under
the [release disposition](../reviews/2026-10-03-release-disposition.md). Retain the
original failed performance/quiet-load receipts; successful repeats or deployment
do not erase them. Reopen only a reproducible new defect or sustained measured
regression. Farm allocator/late-GC ownership remains unproven, not a confirmed
leak. Foundry roof/seam questions predate the optimizer and need a design
disposition before changes.

Remaining physical-device/tier review and asset-library owner acceptance are
separate from the accepted scene runtime. Optional per-tree culling/LOD, shared
meshopt loader, terrain regeneration tooling and static-scene export remain in
the [backlog](../backlog.md); they are not automatically Troy blockers. Provider
major upgrades, site TypeScript 7, expanded importers/packs and npm publication
also remain separate decisions. Do not expand this endpoint to every future
Kiln product milestone.

## Execution order

| Phase | Deliverable | Completion condition |
| --- | --- | --- |
| 1. Stabilize the environment | Diagnosed aerial flicker, continuous beach/mountains and horizon coverage, recorded camera envelope | Both-backend view/motion comparisons preserve contacts and show no scene edges; cost recorded |
| 2. Finish one complete slice | Landing through formation/archers/hero arena into gate and courtyard, with intended action | Contacts, identities, routes, camera access and owner-visible motion work together; neither isolated clips nor terrain tests close this slice |
| 3. Complete composition | All intended fleet destinations, formations, city routes, vegetation and optional content | Whole-scene visual/traversal review at human and aerial scale |
| 4. Qualify runtime | Complete-workload measurements, culling/representation/shadow/startup and device policy | Exact candidate meets recorded targets, with fallbacks and limitations verified; additional optimization follows measured bottlenecks |
| 5. Prove reusable delivery | Other-input derivative workflow, documented boundaries and maintained/installed skills | Rebuild/preview/qualification works outside Troy without scene-specific requirements leaking into standalone assets |
| 6. Finish public delivery | Exact asset/project pins, sources/derivatives/manifests, scene/site integration and acceptance | Final offline and installed-consumer gates, destination flows, owner review and supported-device evidence; any authorized publication verifies exact live identity and rollback |

These phases are dependency order, not a requirement to wait on unrelated work:
archer/hero intake and generic-tool review can proceed alongside terrain diagnosis
during active production. Reassess costs as content arrives; do not optimize an
obsolete blockout or run every historical experimental matrix again.

## Completion record

At each completed phase, update [Troy status](../../packs/troy/STATUS.md),
[handoff](../../packs/troy/HANDOFF.md), the backlog and the exact candidate/evidence
references. Keep failed candidates and explicit limitations. Before final closure,
record source and runtime identities, accepted asset revisions, supported cameras
and devices, measured targets/results, installed-workflow/skill proof and the
owner's scene acceptance. If device review is deferred, label that deferred scope
instead of calling the whole device objective complete.

The endpoint is an accepted, reproducible scene and reusable workflow on this
computer, with the hub reserved for performance receipts. It is not reached by
finishing archers alone, fixing the shoreline alone, or accumulating passing tests.

Latest playable weapon-contact checkpoint: damage and sword parries now use
actual blade and authored torso/head geometry at the fixed 120 Hz simulation
clock, with bounded relative vertex sweeps. 120 scene tests pass. Both hero
choices retain light/heavy attacks, block, stamina and a delayed opponent.
Source and impact proof: scene/evidence/hero-play-06 and hero-modes-02.
The current full-scene cost still needs quiet-hub measurement; motion, camera,
bot balance/owner playtests and other completion work remain active.
Engine review: docs/reviews/2026-10-04-troy-weapon-contact.md.
