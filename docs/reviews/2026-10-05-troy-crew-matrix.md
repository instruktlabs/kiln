# Troy preserving crew matrix work, 5 October 2026

The CPU profile identified fleet posing and world-matrix propagation as the leading sampled unloading cost. The current crew travel sampler now caches each first DFS named node and relies on existing world queries to refresh required ancestry. It defers two redundant whole-character updates and retains the final complete update after contact, cloth and spine changes. No leg reach guard, contact target, geometry, material, bank, route, shader or actor count changed.

## Correctness and provenance

The focused comparison first failed with 280,560 full-tree visits in both versions. After the change it compares 85,680 node poses/surfaces over actual unloading and regroup routes, including endpoints, reversed/repeated clocks and after-duration sampling. Local positions and quaternions remain exact; world matrices remain within 1e-10. Contacts and sample results match. Full-tree visits fall from 280,560 to 109,200 (61.08%); named-joint searches fall from 23,520 to zero per sampled workload. These operation counts alone are not measured CPU time or memory savings.

All 13 focused checks and all 164 scene tests pass. The first full suite's historical bank-source assertion failed and is retained: banks were generated from the old sampler. The corrected provenance check separately verifies immutable old generator source and current consumer/test identities; original bank generator hashes remain unchanged. Evidence includes red.tap, focused-tests.tap, scene-tests.tap (historical assertion failure), scene-tests-02.tap and output/crew-matrix-intake-01/receipt.json.

## Bounded natural pacing comparison

Headed Chrome on the isolated NVIDIA hub, balanced 1440x900, complete current scene, two ten-second repetitions of four pose-heavy workloads. All raw frame intervals and stalls are retained; focus/visibility, exact source/dependency admission and normal release are checked. Baseline precedes candidate on WebGPU; the order reverses on WebGL2. Frozen comparisons occur separately from animated pacing. No profiler or GPU timestamp instrumentation runs in the timing windows.

| Backend | Workload | Baseline mean ms, repeats | Candidate mean ms, repeats | Mean reduction, repeats | Candidate p95 ms, repeats |
|---|---|---|---|---|---|
| webgpu | early-unloading | 43.69 / 43.54 | 34.59 / 36.26 | 20.8% / 16.7% | 41.7 / 41.7 |
| webgpu | early-marching | 30.23 / 30.84 | 24.93 / 26.20 | 17.5% / 15.1% | 25.1 / 33.4 |
| webgpu | hero-combat | 35.77 / 35.11 | 30.08 / 29.74 | 15.9% / 15.3% | 33.4 / 33.4 |
| webgpu | aerial-travel | 21.57 / 22.11 | 20.03 / 20.82 | 7.1% / 5.8% | 25.1 / 25.1 |
| webgl2 | early-unloading | 42.69 / 43.35 | 35.54 / 35.93 | 16.7% / 17.1% | 41.7 / 41.7 |
| webgl2 | early-marching | 30.35 / 31.75 | 26.54 / 27.67 | 12.5% / 12.9% | 33.4 / 33.4 |
| webgl2 | hero-combat | 35.51 / 35.74 | 31.35 / 30.19 | 11.7% / 15.5% | 33.4 / 33.4 |
| webgl2 | aerial-travel | 23.45 / 24.02 | 22.40 / 23.33 | 4.5% / 2.9% | 25.1 / 25.1 |

All four runs complete with zero browser errors/warnings, zero remaining pose-texture leases and all 527 lifecycle cleanup callbacks completed. All sixteen frozen PNG comparisons have zero changed pixels; actor positions/ownership, counts, inputs and cameras match exactly. This preserves the comparison source's appearance; owner taste acceptance remains separate.

Candidate stage-03 archive: bb9b39a441623a7f7a7a066fc4ad18c1e051f13475cb6a734ff9c54d951ab4fe. Exactly one sampler file differs from stage-02; 500 browser files are unchanged, and all 1,263 Three.js dependency files match. Current and previous source identities, test/runner hashes and raw run receipt hashes are in scene/evidence/crew-matrix-01/receipt.json.

## Remaining limits

The optimization is adopted within this bounded scope. Unloading still does not meet a 60 FPS budget, and its 41.7 ms p95 also exceeds a 33.3 ms frame budget. Natural samples retain the production 50 ms simulation clamp and differing final timestamps; exact frozen starts do not imply identical natural end poses. GPU execution time is unknown. This one-hub comparison is not the complete approach/archer/city/shadow/fallback matrix, physical-mobile qualification or agreed device acceptance. The earlier 2.816s transition interval remains unresolved. Finish those checks and scene integration, reusable workflows/skills, final asset/source delivery and owner review before goal closure.
