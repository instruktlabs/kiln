# Troy first-visible startup and pipeline diagnosis, 5 October 2026

The remaining first later-fleet handoff stall has native pipeline-creation evidence. Exact stage-16 reference creates 148 synchronous render pipelines during its first measured handoff. Chrome records 2687.571 ms of interval-union work for DeviceBase::APICreateRenderPipeline on CrGpuMain; the repeat creates none. Its retained first RAF maximum is 3082.9 ms. This identifies substantial native CPU work in Chrome's GPU process, not measured GPU execution, and does not assign every part of the stall to that work.

The earlier readyMs ended after a polled application marker. The new diagnostic records the ready assignment separately, observes a returned CPU render on a later RAF, brackets a screenshot readback, and retains Chrome task traces. Both modes use the same observer, categories, runner hash, exact 517-file browser source, 1263 Three dependency files, fresh headed hardware browser process and balanced1440x900 hub.

| Instrumented WebGPU observation | Reference | Actual-phase offscreen candidate |
|---|---:|---:|
| Ready assignment, navigation-relative ms | 9198.8 | 20620.2 |
| First returned render observed, navigation-relative ms | 11760.2 | 21198.0 |
| First captured scene available, wall ms | 18286 | 23013 |
| Capture/readback bracket, wall ms | 6369 | 1746 |
| Synchronous pipelines through startup capture | 367 | 567 |
| Named pipeline-task interval union on CrGpuMain, ms | 7098.082 | 11012.345 |
| New synchronous pipelines in first / repeat handoff | 148 / 0 | 0 / 0 |
| First / repeat RAF maximum, ms | 3082.9 / 33.4 | 25.1 / 25.1 |

The candidate's first captured scene arrives 4727 ms later despite a shorter readback bracket. It remains optional and default is reference. Loading cost cannot be dismissed solely because the handoff is smooth. Trace categories and screenshot readback impose overhead; first captured pixels are an availability upper bound, not the first physical presentation or an uninstrumented loading benchmark. Fresh browser processes do not establish cold driver/network caches. Pipeline/shader tasks nest; do not add their durations or treat process timing as GPU execution. The analyzer checks interval union per thread and retains unsupported B/E/async phases only in the raw trace.

All 215 scene tests pass, including four new analyzer checks for nested events, boundary clipping, distinct threads and unsupported/invalid durations. Red and green evidence is retained. Both modes completed two natural twenty-second handoff windows, exact source checks, visible/focused startup observations and resource teardown with no browser errors or warnings. Time-zero and both fixed handoff states match; all three fixed image pairs have zero changed pixels. Production browser source, saved revisions, GLBs and animation banks are unchanged. Raw traces, receipts, readiness brackets, retained images, task names and pipeline counts are local under scene/evidence/startup-trace-reference-01, startup-trace-candidate-01 and startup-trace-diagnostic-01.

The next implementation should attribute the new pipelines to scene systems and reduce unnecessary compatible pipeline duplication. Current Three0.186.1 includes object UUID in the cache key for InstancedMesh or object.count greater than one; current framed CPU poses create an InstancedMesh and node material per rigid part. This is a source-grounded candidate pressure point, not proof that every new pipeline belongs to that system. Preserve original matrices, tangent/normal transforms, active-instance selection, bounds, contact geometry, shadows and failure cleanup; qualify a shared-layout derivative on both backends before adoption. A production-system inventory should distinguish main and shadow passes and screen/offscreen target formats. Then verify startup pixels and uninstrumented first-use/complete workload costs together.

No default or engine runtime behavior changed. This diagnostic does not qualify WebGL2, arbitrary entry cameras, actions, whole-device performance, physical mobile or owner acceptance. Those requirements remain in the full completion plan, alongside combat/camera/input feel, integrated sea-to-city routes, reusable unrelated workflows, maintained packaged skills and final source/asset/project/site delivery. Development remains local; the hub ran only isolated exact-candidate diagnostics. No commit, push, deployment or publication occurred.
