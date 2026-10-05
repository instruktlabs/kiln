# Troy 48-archer runtime candidate

4 October 2026. Follows the [equipped reference](2026-10-04-troy-archer-reference.md)
under the active completion goal. Packed archers are now the local preview
default; the full Troy/device/workflow/delivery endpoint remains incomplete.

## Candidate and reference

`archers=packed` equips all 48 front-wall guard IDs, with eight deterministic
phase offsets over the nine-second cycle. `archers=cpu` is the matched full
48-actor exact reference; `archers=reference` retains the earlier single close
reference. `archers=off` retains the former placeholders. `archerSync=1`
optionally synchronizes the full trial for inspection.
Population, original asset hashes and trial wall/gap placements are preserved.
No saved master, engine runtime or package skill was changed.

The scene owns a format that explicitly carries mesh-local bow positions/normals,
rigid part transforms and inherited visibility. It does not bypass the previous
rigid-only baker's geometry/visibility restrictions. Six body/material/layout
batches retain the source materials, UVs and static tangents; deforming limbs
use their own vertex rows. Eight uniform frame values map the nonuniform source
samples to actor phases. Hidden parts collapse to a clipped point in both colour
and shadow vertex paths, while normals use valid positive scale.

Six additional instanced arrow-part batches use exact per-actor ballistic poses
and terrain impacts, independent of the body hierarchy. These use the reference's
launch/nock convention and rotate normal-map tangents with their instance
transforms. This is scripted archery, without damage/casualties. Shadow hooks are
implemented; existing battlefield shadow coverage is not full city qualification.
Culling remains disabled for these batches until conservative swept/spatial
bounds are qualified. No false sampled-bound certification is claimed.

`scene/output/archer-bank-02/` and `web/runtime/archer-v1/` retain the reproducible
bank: 95 parts, 236 deforming vertices, 492 samples and 2,979,552 bytes (about
2.84 MiB) in its two textures. This excludes source textures/geometry, browser
allocations, temporary bake buffers, driver pipelines and other scene resources.
`scripts/bake-archers.mjs` rebuilds into an exclusive output directory; the record
pins original GLBs, pose/baker source hashes and payload hashes. Browser intake
checks source/input and payload identity before admission. The second rebuild
updates provenance for the preview default selector; both binary payloads match
the first build byte for byte. That first build remains preserved.

## Reconstruction and failures

86 scene tests pass, zero failures/skips. Float32 exact-frame tests inspect every
part's positions and inherited visibility. Independent probes inspect all visible
surface vertices in the half-precision candidate within 2 mm, plus limb normals
within 0.005 rad. Adaptive fitting uses rigid local AABB corners and deforming
vertices at quarter intervals; four passes and 5,727 probes finish at a maximum
1.474 mm fitting error. Those probes are not a continuous motion certificate.
The 48 placements/eight phases agree with the exact reference in 480 projectile
pose/visibility/impact checks. Geometry tests retain material identities and
nonindexed source-vertex mapping. Existing source/grip/sole/seek tests remain.
All planted sole vertices also have ray support at the correct height on the
actual transformed wall geometry, across all 48 placements. A default-selection
test retains explicit off/reference/CPU/packed comparisons.

The first uniform 50 Hz candidate had 8.45 mm forearm error during retrieval.
Adaptive fitting exposed an actual lower-string roll discontinuity: the generic
antiparallel-vector quaternion fallback changed roll as a draw began/ended.
A focused regression failed before fixed-axis orientation removed that jump.
Hidden carried-arrow orientation resets are intentionally outside visible-surface
fitting, with visibility independently required to match at every fitting probe.
Half values now round to nearest with even ties; truncation previously prevented
the 1.5 mm fitting limit despite repeated subdivision. Earlier failed test logs
remain under `scene/evidence/archer-reference-01/`.

The first full-scene attempt failed because the new mode was not yet integrated;
the next failed on a TSL cast API typo. Both zero-view receipts remain in
`archer-crowd-01` and `-02`. Corrected `archer-crowd-03` completes fourteen views
for CPU and packed modes on each hardware backend without runtime errors. All
eight phases remain active; counts are 48 equipped actors and zero placeholders.
Numeric CPU/packed PNG comparisons cover cycle and close hand/foot images.
Their close-view mean absolute RGB difference is about 0.013–0.090 on the
0–255 scale, with edge/high-contrast differences retained in the raw metrics.
These numbers and visual inspection do not imply owner acceptance.

The added measurement instrumentation includes CPU scene updates separately from
render submission and reports their sum as CPU work. A live check failed when
the previous render-only harness omitted those arrays, then passed after the
timing boundary changed. Timestamp readback wait remains excluded. Final packed
functional repeats after this instrumentation are in `archer-crowd-04`;
the actual default route is checked in `archer-crowd-05` on both backends.

## Hub measurement and next work

The identified local candidate stages 374 browser files / 85,443,186 bytes into a
fresh hub folder, with zero hash mismatches. Agents and edits remain local.
Admission records no post-boot agent turns, CPU below 1.5% and GPU at 0% before
the first comparison. Before/after checks are required for each measurement.
All four before/after-admitted runs completed without errors/warnings. Each has
360 valid samples per view after twenty warm-up frames at 1,440 x 900, through
the first 6.33 scene seconds with eight archer phases. Raw receipts and mean/p95
summary are in external `scene/evidence/archer-perf-01/`.

| Backend / view | CPU update + render mean, exact reference → packed (ms) | GPU mean, exact reference → packed (ms) |
| --- | --- | --- |
| WebGPU close archer | 85.45 → 22.15 | 18.95 → 7.21 |
| WebGPU battlefield | 85.38 → 22.70 | 20.75 → 8.10 |
| WebGPU aerial | 117.78 → 22.22 | 24.69 → 7.53 |
| WebGL2 close archer | 83.20 → 21.60 | 45.35 → 13.14 |
| WebGL2 battlefield | 81.16 → 22.30 | 44.53 → 13.61 |
| WebGL2 aerial | 124.43 → 21.90 | 81.02 → 13.69 |

These measure complete-scene CPU work and GPU command cost at the named early
workload, with synchronous timestamp readback pacing. They exclude readback wait,
scanout, full late-landing travel, natural frame tails, physical mobile and final
device/owner acceptance. They do not imply a frame rate. Packed CPU work still
exceeds a 16.67 ms / 60 FPS budget in this workload; scene updates average about
12–13.5 ms and submission about 9–10 ms on the admitted hub. Profile the actual
remaining CPU work before assuming archery or GPU shading is the next bottleneck.
Startup readiness timings exclude final shader/pipeline/resource qualification.

The measured stage used explicit packed mode. Subsequent default selection and
provenance changes preserve binary payloads, shaders, controller hot paths and
the measured mode's behavior. Actual default captures and rebuild equality prove
that boundary; a final exact-candidate integrated performance gate is still open.

Continue with close equipment/strap/draw-hand review, certified spatial culling,
actual animated-shadow/coverage review, startup/resources and integrated late
scene/device policy. Follow measured bottlenecks before final qualification. Hero interaction,
later-crew destinations, city routes, horse contact, independent asset workflow
and packaged-skill proof, final revisions/rebuild/site and owner acceptance
remain in the [completion plan](../plans/2026-10-04-kiln-troy-completion-plan.md).
