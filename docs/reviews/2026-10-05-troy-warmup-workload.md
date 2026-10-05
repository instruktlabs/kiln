# Troy current workload and startup passes, 5 October 2026

The current twelve-ship/later-reserve runtime completed its full two-backend workload matrix. Both heroes now visibly raise their shields during paired defense windows; Achilles is blue and Hector red. The preceding shield correction retains blade parries, while live playable combat already has actual shield contacts. This checkpoint adds no paired shield impacts. See the shield review and local scene/evidence/hero-duel-shield-use-01 for the correction and actual render observations.

## Current workload

Stage-05 completed 52 natural twenty-second windows, 1040 measured seconds: thirteen workloads, two repeats per backend, reverse order on repeat two. Later marching and formed reserves are now included. Before/after source checks cover506 browser files and1263 Three0.186.1 dependency files; both runs report zero browser errors/warnings and complete cleanup of fourteen leases/five pose textures. The archive SHA-256 is bb95b735375a649280aa36790d196a67c6814d5a7d03f1509aa6680e285791a8. The updated runner was staged separately from the archive and is preserved with its hash.

The quiet GTX1660Ti Max-Q hub ran hardware Chrome150 at1440x900 with balanced water. Mean unloading remains about34–35ms, live combat31ms and city/courtyard26–28ms. Later distant marching is13–16ms and later formed reserves11–13ms. The first WebGPU handoff contains a3274.5ms interval; the repeat peaks at41.7ms. WebGL2 has no interval above100ms across this matrix. Raw intervals, endpoint/clock states and screenshots are retained in scene/evidence/current-workload-03. The normal50ms simulation-delta clamp means stalls reduce simulated progress; requested starts do not imply matched final poses. This is frame pacing evidence on one device, not GPU execution timing, whole-scene60FPS acceptance or physical-mobile qualification.

The city/courtyard endpoint hides all112 later actors but still evaluates112 CPU rigs. Distant later marching uses112 shared GPU clips and zero CPU rig evaluations. The visibility and projected-error policies need a preserving candidate: off-camera shadows and reverse/camera changes must remain valid. The observation establishes wasted pose work, not its isolated cost or a completed fix.

## Startup candidates

The opt-in passes mode compiles all owners and renders their actual production shadow/color passes into an owned2x2 offscreen target before readiness. It restores visibility, instance counts, frustum settings and the prior target, releases the owned target and invalidates restored shadow maps. The landingPasses mode admits only the later-wave subtree while retaining the actual scene/light identity. The helper awaits WebGPU queue completion. Plain compileAsync skips shadow work in the pinned renderer, so shader compilation alone did not close the first-use stall. No temporary owners are drawn to the main target.

| Same-source WebGPU comparison | Reference first handoff max | Candidate first handoff max | Reference / candidate readiness | Frozen pixels |
|---|---:|---:|---:|---:|
| Stage-06, full passes |3141.1ms|25.1ms|12215 /28734ms|0 changed in both pairs|
| Stage-07, later-only passes |3082.8ms|33.2ms|12883 /26235ms|0 changed in both pairs|

Each comparison has two20s natural handoff windows per mode, the same exact source/dependencies/driver, matching frozen actor/camera state, zero browser errors/warnings and verified teardown. They are separate candidates; do not pool their readiness into a controlled full-versus-scoped comparison. The full candidate adds16519ms readiness and the scoped one13352ms. These costs are substantial, so neither is adopted. Default warmup remains reference. Startup claims are whole-ready observations, not isolated GPU attribution. A narrow workload and two frozen images do not establish all-frame appearance or final device qualification.

The latest local source is stage-07,507 browser files; its archive SHA-256 is02b745c8e04cc3d209331bf18894207d14e1fe39da5e83b79f0f4a3ae5854755. The hub reports zero source mismatches. All179 scene tests pass. Focused red/final fixtures cover target ownership, cleanup after compile/render failures, exact restoration, actual shadow passes and subtree boundaries. The full52-window matrix qualifies the stage-05 default workload and predates these opt-in source additions. Evidence for stages06/07, comparisons, TAP and local preview is in the external scene workspace and recovery overlay.

## Remaining completion work

Reduce unnecessary off-camera CPU posing with preserved shadows/contacts/visibility and matched evidence. Find a lower-cost first-use strategy before changing defaults. Complete the beach/hero/gate/courtyard journey and ground contacts, review combat/bot/camera feel and supported-device targets, then prove unrelated-input derivative workflows and maintained/packaged skills. Finish standalone/source rebuilds, exact asset/project pins, installed scene-kit/site delivery and owner appearance/playfeel acceptance. The full goal remains active. Development stays local; the hub supplies isolated performance evidence. No commit, push, publication or deployment occurred.
