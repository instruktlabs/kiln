# Troy shared walking exploration — 4 October 2026

The live preview is unchanged. Walking still uses the exact CPU contact solver;
packed routes and GPU final-formation idle retain their previous defaults. A shared,
slope-aware cycle is a promising candidate for distant walkers, not an adopted
optimization or a performance result.

Work and retained evidence live in
`/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion/scene`.
No engine runtime, accepted asset revision, installed skill or site was changed.

## Findings

All 28 completed unloading variants produce one equivalent normalized steady walk
at nine sampled phases (maximum grouped matrix-entry discrepancy 7.68e-12).
This supports sharing donor motion rather than creating 28 copies per slope.
It is an inspection of this rig, not an arbitrary-character equivalence guarantee.

Each exploration compares 224 actual routes, twelve eligible steps per route and
nine phases per step: 24,192 poses. Mesh error measures transformed local bounding-box
corners, including the feet. Eligibility excludes turns, short steps, steep ground
and endpoint acceleration. Sampling is not a continuous or exhaustive error bound.

| Candidate | Maximum mesh error | Maximum foot error | Eligible steps |
| --- | ---: | ---: | ---: |
| Flat donor | 60.18 mm | 33.76 mm | 81,471 / 83,998 |
| Slope donor, initial eligibility | 22.13 mm | 17.13 mm | 81,471 / 83,998 |
| Slope donor, corrected eligibility | 7.81 mm | 4.22 mm | 81,212 / 83,998 |

The initial eligibility window incorrectly admitted the first accelerated stride
after a stationary turn. Extending the preceding-contact window fixes that case;
a focused regression test failed first and passes after the correction. The
eligible fraction is now 96.68%, not a runtime GPU population percentage. Changing
eligibility also changes sampled indices, so the final row is not a paired sample
comparison against the previous rows.

The planar donor uses local cross/forward gradients quantized in increments of
0.005 rise per horizontal metre. The sampled routes encounter 92 slope pairs.
The donor supplies relative rig motion; the original footprint plan supplies exact
root placement and gait phase. Sampled root-matrix discrepancy is zero; normalized
cycle-loop discrepancy is below 2.6e-15 metres. The remaining discrepancy includes
terrain changes, stride differences and slope approximation. Exact solver playback
must remain available near the camera and during unsupported motion.

## Evidence and limits

- `evidence/walk-variants-01/groups.json`: shared-rig inspection.
- `evidence/steady-walk-03/exploration.json`: flat donor.
- `evidence/slope-walk-01/exploration.json`: first slope donor.
- `evidence/slope-walk-02/exploration.json`: corrected eligibility.
- `evidence/slope-walk-02/tests.tap`: all 44 scene tests pass.

Each exploration's recorded script/adapter hashes were verified and matching
source snapshots retained in its `source/` directory. The large route source
remains in `output/regroup-02/plans.json`, verified against each recorded hash.
The experiments use source transforms: no transform quantization, GPU interpolation,
rendered transition, shadow, culling or device-performance qualification yet.
The 92 pairs reflect sampled steps only; a production bank must inspect every
eligible route step before fixing its palette. No performance run was conducted.

## Baked candidate follow-up

The complete scan confirms 92 slope pairs across all 81,212 eligible steps. Two
uniform half-float candidates failed the preselected 4 mm donor mesh-error limit:
60 Hz uses 6,398,784 bytes and reaches 14.01 mm; 120 Hz uses 12,645,216 bytes and
reaches 7.54 mm. Their rejection is retained in `steady-walk-01-baked` and
`steady-walk-02-baked`. Neither was staged or adopted.

An adaptive candidate places more samples around brief knee motion. The generic
consumer wrapper refines quarter-interval corner errors with a 2 mm fitting target;
it preserves editable inputs and fails when a sample budget is exhausted. It
produces 58–68 frames per clip, 5,749 total, and a **9,520,344-byte** atlas. This is
animation payload size, excluding geometry, metadata and other scene resources.

`output/steady-walk-adaptive-01` passes the separate retained qualification in
`evidence/steady-walk-adaptive-01-baked/qualification.json`:

- All 92 donors checked at eighth-frame intervals: 45,348 poses and 25,032,096
  transformed corners. Maximum mesh error 2.347 mm; foot error 1.989 mm; loop error
  zero. Eighth points include additional probes beyond the quarter-point fitting.
- Combined route comparison: 24,192 poses, 13,353,984 corners; maximum mesh error
  7.808 mm and foot error 4.205 mm, including half-float decoding and float32 actor
  placement/frame indices. This remains twelve selected eligible steps per route,
  not an exhaustive continuous route bound.
- Zero decoded-geometry escapes from the conservative interpolation bounds in
  either check. These bounds enclose the GPU representation, not source-motion
  approximation error.
- All 46 scene tests pass, including irregular time lookup, source preservation,
  concentrated brief motion and explicit sample-budget failure.

The actual fixture character bytes match the recorded character source hash.
`provenance.json` seals 38 source/evidence identities; script/helper snapshots are
retained alongside the result. Source binaries remain at their recorded paths.
The candidate and failure records are kept separate from runtime acceptance.

Irregular sample times require an explicit lookup from physical gait time to local
fractional frame. The existing shader can consume that frame through its clip-time
adapter; passing physical time directly would distort the gait. This adapter has
not yet been wired into the scene. `SHARED-WALK.md` in the scene workspace documents
reproduction and the timing contract. There was no performance run, browser change,
engine edit, skill installation, accepted-asset repin, commit, push or deployment.

## Next adoption gates

The full palette and a numerically checked shared bake now exist. Stage an opt-in
scene trial with the required irregular time lookup. Use projected error to define
viewing ranges; keep exact near poses, stable actor IDs and clocks,
and verify slope changes plus CPU/GPU transitions in both directions. Only after
render checks should a focused old/new performance pair decide adoption. Avoid
expanding into long unique per-route animation banks.

The full scene goal remains active: later offshore landings, equipment and hull
interaction, archers, heroes and optional duel, environment/traversal, device and
vegetation policies, physical mobile/owner review, workflow documentation and
reproducible Cloudflare delivery are still outstanding.

## Subsequent opt-in integration trial

The previous non-integration statements describe the bake checkpoint. The candidate
is now staged behind `walk=hybrid` with packed routes, retaining exact walking by
default. Its physical-time lookup feeds the existing shared shader without rebaking.
Original root placement, actor IDs and route clocks are retained; near/unsupported
motion falls back to the original solver. Projected-error selection includes caster
and directional floor-shadow extents, with hysteresis. A 20 mm engineering allowance
is injected into that policy; it is not a continuous certified source-error bound.

`scene/evidence/walk-trial-01/` retains 51 passing tests, 64 matched captures and two
15-position camera sweeps on WebGPU/WebGL2. Tested aerial cases move 56 or 112 walkers
to shared playback. Close reference/hybrid renders are identical; distant differences
are small (at most 41 pixels exceeding ten channel values in the sampled WebGPU
images, 32 on WebGL2). Sampled culling and repeated/reversed images are identical.
Camera sweeps retain zero actor-position drift and restore exact nearby ownership.
The first camera sweep failed harness readiness/foreground handling; corrected
`*-sweep-02` runs pass and the original failure remains retained.

These are functional/render checks, not isolated performance measurements. The
focused timing script is prepared but has not run. No speedup, default adoption,
physical-mobile or complete-scene acceptance is claimed. The next step is one short
matched comparison per backend, then scene production rather than a broader bake
campaign. No engine runtime, installed skill, accepted asset pin or release changed.

## Focused timing and prototype default adoption

The sequential desktop comparison retained15seconds per case: reference/hybrid in
busy aerial and close marching views, on WebGPU and WebGL2 (120seconds total).
Codex minimization, foreground visibility/focus and restoration were verified;
CUA inventory found no IAB tabs. Preparation load includes benchmark rendering and
is not a machine-idle gate. No other benchmark ran concurrently.

| Backend / view | Reference mean / p95 | Hybrid mean / p95 |
| --- | --- | --- |
| WebGPU aerial |62.63 /66.70ms |26.08 /33.40ms |
| WebGL2 aerial |57.53 /66.60ms |26.70 /33.40ms |
| WebGPU close marching |26.11 /33.30ms |26.84 /33.40ms |
| WebGL2 close marching |24.71 /25.10ms |25.67 /33.30ms |

Aerial mean reduction is54–58%; close overhead is0.7–1.0ms and WebGL2 near p95
worsens. Natural pacing retains the existing50ms simulation clamp: the slow aerial
reference advances only12–13seconds while hybrid advances about15seconds. These
are complete-preview intervals, not matched per-pose timings or60FPS qualification.
One WebGPU reference interval exceeded100ms; one hybrid aerial interval exceeded50ms.
Raw intervals, ownership and clocks remain in `evidence/shared-walk-timing-01/`;
`disposition.json` hashes its input receipts and explicitly retains these limits.

The substantial distant benefit supports hybrid as the packed-route prototype
default; nearby/unsupported motion stays exact and `walk=reference` remains available.
A focused policy test failed before implementation; all52 scene tests then pass.
Eight captures verify default aerial/near/initial/completed states on both backends
in `evidence/walking-default-01/`. Final mobile, whole-scene and frame pacing remain
open. No broader comparison campaign is needed before continuing scene production.
