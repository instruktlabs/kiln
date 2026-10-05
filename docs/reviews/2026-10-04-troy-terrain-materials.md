# Troy aerial depth and procedural terrain materials

Later 4 October coverage work: [continuous environment checkpoint](2026-10-04-troy-continuous-environment.md).
Use that for current geometry, default capture results and the open WebGL2
repeatability check; this report retains the earlier candidate's exact scope.

4 October 2026. Local production resumed under the owner's active Kiln/Troy
completion goal. This is an environment checkpoint, not final scene or device
acceptance. No engine runtime, saved asset revision, motion bank, commit, push or
deployment changed in this checkpoint.

## Result

The preview now defaults to reversed depth and `surface=lod`. Sand and mountains
receive deterministic procedural variation generated once. A shared 256-square
RGBA texture supplies close detail; vertex colours retain broad variation at
distance. The close texture fades over 160–220 m of camera-to-mesh bounding-box
distance, then the mesh switches to a far material without detail texture reads.
The conservative whole-mesh distance is deliberate: the first per-pixel distance
branch still cost too much in aerial WebGPU views. There is no terrain displacement,
new simulation pass or additional terrain draw. Four near/far material variants
are warmed before the preview reports ready; startup is still unqualified.

Estimated added data for the current two geometries: 349,524 texture bytes with
mips plus 483,072 vertex-colour bytes, 832,596 bytes total (about 0.79 MiB).
This excludes driver allocations, shader/pipeline memory and temporary generation
buffers. Texture generation is one-time; selecting material LOD does small CPU work
each frame. It is not a claim of zero CPU cost.

`depth=standard&surface=flat` retains the earlier comparator. Explicit
`surface=procedural` and `surface=hybrid` retain the measured, more expensive
experiments; neither is the default. These are consumer scene materials, not
requirements for standalone Kiln assets or engine rendering.

## Depth evidence and open geometry defects

The original camera used near 0.2, far 6,000 and ordinary depth. A matched local
standard/reversed comparison kept heights, water, 18 mm shoreline-film lift,
camera and frozen scene time unchanged. The high-shore pair differed in 26,693
pixels, including 10,881 with a channel difference above 30; the visibly broken
shore strip became stable in the retained reversed-depth capture. The close hero
pair differed in only 190 pixels, nine above 30. This supports depth precision as
the cause of that sampled aerial artifact; it does not close all shoreline cases.
Three documents [reversed depth](https://threejs.org/docs/pages/Renderer.html) and
provides an [example](https://threejs.org/examples/webgpu_reversed_depth_buffer.html).

Both local hardware backends enabled reversed depth. Camera projection and
frustum consumers use the effective renderer flag, including when WebGL2 lacks
the extension. That fallback is structurally tested, but unsupported physical
devices have not received new visual qualification and may retain the original
precision defect.

The beach is still 2,400 m wide; mountains remain 4,000 m wide and overlap the
beach by 100 m. The retained mountain image still shows intersecting base surfaces.
Reversed depth does not repair coplanar geometry. Outer terrain and ocean edges
remain finite. Those are the next environment tasks; near ground heights and
shore contacts must survive the replacement.

## Isolated hub cost study

Fresh candidates were staged from local files without modifying the original hub
workspace. Stage 03 verified all 361 browser files (82,238,611 bytes) against its
manifest. Headed hardware Chrome on the hub's GTX 1660 Ti Max-Q rendered WebGPU
and WebGL2 at 1,440 × 900, DPR 1, balanced water, twelve-ship trial, reversed depth.
Each view used 20 warm-up frames followed by 240 known GPU timestamp samples.
Before/after receipts admitted quiet CPU/GPU and no post-boot agent turn. The 22
old in-progress history rows predate the current boot and were preserved as
historical diagnostics. Agents and code edits remained local.

GPU render means, milliseconds; flat and LOD use the same staged scene:

| Backend | View | Flat | LOD detail | Difference |
|---|---|---:|---:|---:|
| WebGPU | Shoreline | 5.244 | 5.052 | -0.192 |
| WebGPU | Aerial | 8.285 | 7.824 | -0.461 |
| WebGPU | Mountains | 4.038 | 3.952 | -0.086 |
| WebGL2 | Shoreline | 10.701 | 10.845 | +0.144 |
| WebGL2 | Aerial | 12.489 | 12.744 | +0.255 |
| WebGL2 | Mountains | 8.305 | 8.432 | +0.127 |

CPU submission means, flat → LOD: WebGPU 7.899 → 7.895, 9.090 → 9.027,
6.575 → 6.480 ms; WebGL2 9.653 → 9.734, 11.419 → 11.588,
7.939 → 7.995 ms, in the same view order. Sequential run variation prevents
calling negative differences a speedup. The largest measured WebGL2 increment
was 0.255 ms (about 2%); the sampled WebGPU views show no added render cost.
This supports the modest-cost default within this bounded study.

The first full-detail candidate added about 1.23 ms to aerial WebGPU render time
(15.7%) and 0.70 ms to the mountain view (17.7%). A compiled per-pixel distance
branch still added about 1.2 ms aerially. Both candidates were withheld from the
default. Retained source snapshots and raw receipts show the decisions.

Timing covers warmed rendering/submission, not complete frame pacing, actor
updates, startup, travel transitions, mobile or final scene capacity. Statistics
read after asynchronous timestamp collection can show reset draw counters;
zero counters in those receipts are not evidence of zero draws. Material swaps
preserve the existing two terrain meshes/draws. Do not use these numbers to
claim whole-scene 60 FPS, universal device support or final performance acceptance.

## Verification and reproducibility

All 61 scene tests pass with no failures or skips. Focused failing contracts
preceded depth projection/culling, deterministic textures and material defaults.
Both actual-default hardware capture suites pass eight views each, no errors or
warnings, exact frozen aerial return and source-hash continuity. Far material
shader snapshots contain no terrain detail texture fetch. Earlier full-detail
and hybrid WebGL2 captures failed exact return by 19 one-level pixels; those
failed receipts remain retained. The check was not relaxed; the final LOD and
actual-default suites pass it on both backends.

Evidence is local in
`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion\scene\evidence\`:

- `terrain-depth-01`: original/depth-only source and matched views.
- `terrain-detail-01`, `terrain-hybrid-01`, `terrain-hybrid-02`: rejected-cost
  candidates, original failures and compiled shader snapshots.
- `terrain-lod-01`, `terrain-default-01`: both-backend passing captures.
- `terrain-perf-01`, `terrain-perf-02`, `terrain-perf-03`: stage manifests,
  candidate bundles, source snapshots and returned raw hub timing receipts.
- `terrain-perf-03/local-tests.tap`: 61 passing tests.

Stage 03 explicitly requested reversed depth and LOD. The later local change
made those modes defaults and added tested exported default constants; it did
not change the selected material graph, geometry, baked colour or timing path.
`terrain-default-01` independently verifies the resulting default route, with
the final source hashes. Reproduce capture and staging commands from the
external scene's `ENVIRONMENT.md`.

Next: replace the overlapping beach/mountain join with shared continuous ground,
extend coarse outer land/ocean coverage with world-stable phases, then verify
camera travel, horizon coverage and near contacts before another matched hub run.
Archers, heroes, integrated optimization, reusable skills, delivery and owner
acceptance remain governed by the active completion plan.
