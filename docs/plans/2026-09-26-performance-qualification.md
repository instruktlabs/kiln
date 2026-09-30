# Reserved performance qualification

Status: complete. Twelve browser samples, an observer baseline, a corrected real-pin baseline and the final 48-operation installed-candidate comparison are retained in [the performance review](../reviews/2026-09-26-foundation-performance.md). Measured journal scan cost prompted a bounded optimization, validated through full gates and the same comparison protocol. Earlier failed harness attempts, the pin-seed correction and ambient variations remain explicit. Older busy-machine samples are not pooled with these runs. The owner's quiet window is released.

## Conditions and scope

Use the authorized quiet period after functional qualification of a stable installed candidate. Close this task's unused viewers and test processes; preserve unrelated user work and shared services with active clients. Record any remaining CPU/GPU load. A quiet machine is a measured condition, not merely the absence of a known agent.

Record candidate source/runtime and GLB hashes, Node/browser/Three versions, CPU, GPU adapter and driver, power profile, display refresh rate, browser zoom, CSS viewport, drawing-buffer dimensions and DPR. Record cold/warm state and whether DevTools or capture instrumentation is active. Use the same scene, camera, lighting and animation state for comparisons. Run baseline samples without the Performance panel, then a separately labeled diagnostic trace.

The current representative fixture contains 321 meshes/draws in the observed view, 97,292 triangles, 16 library materials plus ground, and 48 texture objects. Its exact GLB hash is `sha256:96faf9d7e9848f185054f1f5aeda5570612d1c5b8a3ff1351af00dee343dd84c`. It is a technical workload, not a Farm aesthetic or game-scene acceptance asset. Also retain the simple textured cube as a low-complexity comparison. Real Farm proving-scene budgets must be qualified once that scene exists.

## Sequence

1. Confirm the intended installed package and GPU adapter; save a sanitized renderer health/instance receipt. Let the system settle, record background utilization and confirm the owner has paused competing work. Do not install updates or change graphics settings during the run.
2. Measure three fresh loads and three warm samples of the small fixture and representative scene. Keep the dashboard viewport and actual drawing-buffer dimensions fixed; report those dimensions without calling the sample a full-screen 1080p game test. Measure at the agreed game viewport separately when one is available.
3. Capture load-to-first-render-submission, frame-interval p50/p95/max, draw counts, triangles, texture/geometry/program counts and explicit cold/warm labels. Record process memory separately where the browser permits it. Do not convert resource counts into actual GPU memory bytes or frame intervals into GPU execution time.
4. Run paired observation-off and observation-on authoring operations with the same source/materials, warmed cache state and GPU capture recipe. Cover both an empty journal and a populated journal near its 200-operation retention limit, including pinned entries and representative artifact sizes. Alternate order and collect multiple pairs. Verify that enabling observation never adds an evaluation or image capture; measure authoring latency, journal flush time, bytes written and dashboard polling cost separately. The current persistence path scans retained records for cleanup and retention accounting; qualify this cost before optimizing it. A single elapsed-time difference under load is not observer overhead evidence.
5. Capture a diagnostic browser trace if any repeatable spike remains. Separate shader compilation, GLB parsing, texture decoding/upload, GPU submission, GC, dashboard DOM/polling and background-process interference. Save the trace and workload manifest with the receipt.
6. Report medians and dispersion, not only the fastest run. Reject or label samples with background-load changes. Agree on a target budget for this hardware and viewport only after this evidence; do not transfer it to Rome, mobile devices, Godot, Unity or another renderer without consumer-specific measurement.

## Interpretation sources

Three.js describes `WebGLRenderer.info.memory` in terms of allocated objects and reports render-call statistics. Those counters are useful for structural comparisons but are not a byte-level GPU memory profiler. [Three.js WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html).

Chrome's calibrated CPU throttling does not throttle the GPU process. It therefore cannot stand in for a lower-tier graphics adapter when assessing these textured scenes. [Chrome performance calibration guidance](https://developer.chrome.com/blog/devtools-grounded-real-world).

Functional resilience remains a separate gate: failed source, missing materials, reconnect, concurrent revisions and authenticated service sharing can be tested while the machine is busy. Their timings must retain the workload caveat. See the [GPU integration review](2026-09-26-gpu-service-integration.md) and [foundation checkpoint](2026-09-26-project-foundation.md).
