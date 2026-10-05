# Troy shadow-aware off-camera motion, 5 October 2026

The scene now defaults to shared walking for eligible off-camera actors when fleet culling is enabled. It restores exact CPU motion for visible/shadow-relevant, unsupported or uncertain motion. Explicit walkOffscreen=reference retains the preceding selector. Switching fleet culling off disables the new admission path. Original assets, route/binary banks, authored hands, equipment and contact targets are unchanged.

## Behavior and scope

The previous projected-error policy returns Infinity for bounds behind the camera, so hidden later sailors still evaluated112 CPU rigs in city views. The new selector tests the known derivative box after inflating it by the scene's20mm engineering budget, then includes its directional shadow sweep down to the admitted receiver floor. Only a complete miss permits hidden shared motion. Camera matrices, effective depth convention, viewport, light contract and the culling switch participate in the view revision. Shared ownership advances the real route and clip clocks. Returning to a near view restores the original CPU sampler at the current time; unsupported turns/endpoints still use exact source poses.

The bank and error evidence remain sampled. The20mm allowance is not a certified continuous source envelope. This is a scene consumer policy using the existing qualified bank, not a new deterministic engine renderer or a requirement for standalone assets. Rig initialization at the first route admission can still evaluate source poses; zero steady-state work does not mean zero initialization cost.

## Matched evidence

Stage-08 ran32 natural20s windows,640 measured seconds: four workloads, two repeats, reference/candidate on both backends. The quiet GTX1660Ti Max-Q hub used hardware Chrome150 at1440x900 with balanced water. Each run checks507 source files and1263 Three0.186.1 dependencies before/after, reports zero browser errors/warnings and releases all fourteen leases/five pose textures. A fresh browser per mode does not make driver/OS caches cold.

| Workload means | Reference | Candidate |
|---|---:|---:|
| WebGPU city/courtyard |25.9–26.5ms|12.0–12.4ms|
| WebGL2 city/courtyard |27.6–28.4ms|13.4–13.7ms|
| WebGPU later marching |13.2–13.4ms|13.3ms|
| WebGPU aerial camera travel |14.2–14.3ms|14.0–14.1ms|
| WebGL2 later marching |15.3–16.1ms|15.3–15.7ms|
| WebGL2 aerial camera travel |16.7–16.8ms|16.6–16.7ms|

City/courtyard p95 drops from33.4ms to16.7ms on WebGPU and16.7–16.8ms on WebGL2. At their measured endpoints,110 hidden actors use shared motion and two unsupported poses remain on CPU, versus112 CPU rig evaluations in reference. Sixteen fixed image pairs have zero changed pixels. Requested frozen clock/camera/counts, asset input pins, actor IDs and actor root positions match exactly. Natural endpoints differ slightly with pacing and are not compared as identical poses. Aerial travel tests moving visibility; focused fixtures additionally cover close views, visible shadows, error inflation, reverse clocks, receiver-floor violations and culling-disabled restoration.

All182 scene tests pass after adoption. Red, intermediate and final TAP are retained. Local WebGPU city previews render without browser errors. Raw runs and comparisons are in scene/evidence/walk-offscreen-reference-01 and walk-offscreen-candidate-01; adoption, source identities and tests are in walk-offscreen-01.

The matched source is stage-08, archive0bb6e0e78a8b66d7431a23b7b36f96837816de776ebb8aa92707ab7cb97c6559. Adopted stage-09 differs only in main.mjs's two default selectors among507 browser files; the explicit candidate path is unchanged. Its archive is707062ce4c1d12ca2d15d6bdd5b2174f9071027fdde095f536e08783ce4d060e, staged with zero mismatches. Its full13-workload/two-backend matrix is not complete: current-workload-04 WebGPU was dispatched and its terminal result has not yet been collected. Continue the existing process, then qualify WebGL2; do not call the older stage-05 matrix current-source acceptance.

## Maintained guidance and remaining delivery

The optional compose-scene runtime reference now explains hidden CPU motion, bounds/error/shadow admission and restoration, and the difference between main-pass compilation and actual shadow preparation. Skill validation and the repository skill check pass. An offline local npm artifact preserves exact reference bytes; fresh setup and managed upgrade verify four installed copies. A customized fixture reference rejects upgrade without changing any files, and owner notes survive the later resolved upgrade. No existing author workspace was rewritten. Proof: recovery/runtime-visibility-skills-01/receipt.json. This closes this guidance update's distribution checks, not unrelated-asset derivative qualification or final engine release gates.

The expensive offscreen startup-pass experiments remain opt-in and unadopted. Default warmup remains reference. The first-use handoff stall, unloading/combat costs, integrated animated shadows/device targets and camera/playfeel still need work. Finish the sea/beach/hero/gate/courtyard journey and qualify contacts against actual rendered terrain triangles, then unrelated-input reusable workflows, reproducible asset/source builds, exact project pins, installed scene/site flows and owner acceptance. The full goal remains active. Everything developed here is local; the hub supplies isolated performance evidence. No commit, push, publication or deployment occurred.
