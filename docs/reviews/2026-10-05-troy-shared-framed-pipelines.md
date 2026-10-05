# Troy shared rigid pose pipelines and performance target, 5 October 2026

The owner sets final Troy performance acceptance at **60 FPS on the hub at 1440×900, balanced quality, including combat and fleet transitions**. The approximate per-frame budget is 16.67 ms. This sets the target; the current scene is not qualified against it. Preserve first-use pauses and frame tails alongside averages rather than declaring acceptance from a stable or repeated subset. Other physical devices remain separately unqualified.

Production-system inventory on unchanged stage-16 identifies 200 pipeline creation requests during first handoff preparation: 39 rigid crew parts and 40 ship parts in each color/shadow pass (158 requests), plus 21 other batches per pass (42). The phase includes frozen inspection and animated warmup. Requests do not equal the earlier native trace's 148 calls during a different measured interval. Color renders use an offscreen target before output transformation; these are not all direct screen passes. The failed raw-module hook and corrected bundled-backend inventory are retained.

An optional consumer implementation uses plain Mesh objects with InstancedBufferGeometry and a stable matrix-attribute layout. Current Three 0.186.1 includes object identity in InstancedMesh pipeline keys. Sharing the compatible layout reduces that duplication while retaining each original rigid part, material identity, active actor selection and final world matrices. Normal/tangent and shadow positions receive the same rigid transform. Owned buffers/materials dispose independently; invalid skin/morph inputs are rejected. This is a scoped rigid Troy derivative, not a general skinned/material replacement or an engine change. Saved source assets, GLBs and animation banks are unchanged. Defaults remain poseDraw=reference and warmup=reference; poseDraw=shared is opt-in. Other warmup modes with shared poses are not qualified.

| Same-source WebGPU observation | Reference | Shared candidate |
|---|---:|---:|
| First retained scene pixels available, wall ms | 19082 | 15009 |
| Screenshot/readback bracket, wall ms | 6348 | 3730 |
| Application ready assignment, ms | 10032.9 | 9803.2 |
| Returned render observed, ms | 12597.4 | 11203.4 |
| Shader programs at time zero | 403 | 175 |
| First handoff mean / maximum, ms | 22.487 / 3432.8 | 17.862 / 974.8 |
| Repeat handoff mean / maximum, ms | 18.662 / 25.1 | 16.939 / 25.1 |

The first retained scene arrives 4073 ms earlier and the first handoff pause falls substantially, but the 974.8 ms pause and 25.1 ms frame tails still miss the target. The seven fixed state/image pairs match exactly, including rowing, first handoff, later unloading and formed reserves. Both modes use exact stage-17: 518 browser files, 1263 Three dependency files, identical runner and balanced 1440×900 fresh hardware browser processes. Two natural twenty-second windows per mode retain all intervals. Source checks, visible/focused observations and resource teardown pass with no browser errors/warnings. No Chrome trace/backend inventory hook runs in this comparison. Startup observers and screenshot readback still impose overhead; first retained pixels are an availability upper bound, not physical display time. Fresh processes do not prove cold driver caches. GPU execution timing is unknown.

The WebGL2 reference completed two natural twenty-second windows, with first/repeat maxima 50.0 / 33.4 ms and means 20.987 / 20.748 ms. Three candidate attempts failed quiet admission before measurement; all zero-case receipts are preserved. Read-only process inspection found a Riverline test suite in /home/matthewk/X/vietnam-war-sim-ci consuming CPU. It was left running. The WebGL2 candidate comparison and cross-backend adoption remain pending. Do not retry the occupied evidence labels or reuse failed attempts as performance data.

All 219 scene tests pass. Focused red, first failing green and corrected green evidence are retained. The hub stage archive SHA-256 is 67c4f7505e2004cb217e34a6d76a6dd57ed880c2bef4e456a31a2410bc7166f5. Code and evidence are local under the external Troy scene; maintained engine runtime and installed authors' skills were not changed.

Next: complete admitted WebGL2 comparison using a fresh candidate label, identify the remaining WebGPU first-use cost with exact-source inventory, and compare startup plus the complete combat/fleet workload before any default adoption. Then finish integrated contact/shadow/camera/input review, bot behavior and the sea-to-city journey; unrelated reusable workflows and maintained packaged skills; source rebuilds, revision/project pins, site integration and owner acceptance. Migration is complete, full delivery goal remains active. No commit, push, deployment or publication occurred.
