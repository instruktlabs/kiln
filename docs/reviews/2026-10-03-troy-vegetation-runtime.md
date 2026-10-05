# Troy vegetation representation checkpoint

3 October 2026. The approved source plants and the main scene preview are unchanged.
This extends the [production plan](../plans/2026-10-03-troy-scene-production-plan.md)
with standalone, source-bound static LOD and multiview experiments in the private
`review/troy-expansion/runtime-lab/`. It is not final range selection, a measured
frame-time improvement, owner acceptance or publication.

## Opaque mesh reductions

`scripts/reduce-static.mjs` takes an explicit GLB, output directory, ratio, error
and dependency installation. It clones the document, welds exact duplicates and
uses meshoptimizer topology-preserving reduction per primitive. Transform and
material boundaries remain separate; the original is never rewritten. The first
prototype accepts static, untextured, opaque, indexed POSITION/NORMAL triangles;
it rejects animations, skins, morphs, other attributes, extensions and external
resources. This is a narrow supported-input contract, not a generic glTF optimizer.

Manifests retain source/output/generator hashes, exact dependency versions, byte
sizes, primitive/vertex/triangle counts, requested reduction and actual relative
per-primitive errors. Error limits do not imply silhouette acceptance. Installed
versions are glTF Transform 4.5.1 and meshoptimizer 1.1.1. The CLI requires a new
output directory. A generated two-material non-Troy fixture proves source
preservation, deterministic output, transforms/materials and meaningful reduction.

| Plant | Original triangles | Moderate: ratio .5 / error .03 | Stronger: ratio .25 / error .06 |
| --- | ---: | ---: | ---: |
| Olive | 4,634 | 2,940 | 2,884 |
| Cypress | 2,712 | 1,496 | 1,080 |
| Fig | 4,676 | 2,700 | 1,868 |
| Shrub | 1,252 | 942 | 802 |

Topology and normal seams limit reduction; requested ratios are not guaranteed.
The olive barely benefits from the stronger setting. Close/overhead comparison
shows more angular fig and shrub clumps at the stronger setting, so those must
not replace close originals. Moderate geometry is the leading candidate for a
subsequent screen-space LOD comparison, not an accepted switch distance.

Current scene counts are six olives, six figs, 22 cypresses and 40 shrubs: 74 plants.
Their one-pass geometry totals 165,604 original, 104,432 moderate (36.9% less), or
84,352 stronger (49.1% less). These are arithmetic geometry totals, not measured
frame-time savings. Instanced source material batches would keep their material
count, but mixed LOD groups can add draws; runtime transitions must measure that.

`evidence/vegetation-02/{webgpu,webgl2}/receipt.json` records 36 captures per backend:
all four species, three representations, ground/overhead and distant framing,
with shadows and no page errors. Bounding-sphere framing replaces the initial
height-only framing in `vegetation-01`, which cropped the wide shrub. That earlier
capture remains retained and is not complete silhouette evidence.

## Multiview candidate and rejection at the tested range

`scripts/bake-impostor.mjs`, `src/impostor-views.mjs`, the bake page and
`src/impostor-playback.mjs` now produce and display a 25-view upper-hemisphere atlas:
eight azimuths at 0°, 35° and 70° elevation plus zenith. A 640×640 RGBA atlas has
128px cells, 4px gutters and 120px content. The second bake dilates RGB three pixels
into transparent edges while keeping alpha exact. Its test caught the missing
padding before implementation. The PNG rows begin at bottom-left for texture UVs.

Each atlas costs 1,638,400 decoded bytes without mipmaps: 6,553,600 bytes (6.25 MiB)
for all four plants. The padded PNGs total 659,459 transfer bytes. These costs are
additional to originals and any retained mesh derivatives. There are no depth or
normal layers. Capture uses the original material shading under a recorded fixed
rig, then a tone-mapping-disabled basic material displays the already-lit image.
This prototype does not support changing illumination, arbitrary actor yaw, wind,
cast/receive shadows, below-ground cameras or production instanced-card batching.

`evidence/vegetation-cards-02/{webgpu,webgl2}` records 60 images per backend, with
all species at exact, intermediate, overhead and 22°/23° azimuth views. Both
backends render without page errors. Shadows are disabled consistently for this
comparison because the card does not support them. These are visual captures,
not performance samples. Original and derivative hashes are checked before load.

Exact sampled angles are plausible, but intermediate views change the fig/shrub
canopy shape and nearest-view selection produces unacceptable visible popping at
the tested 100px nominal bounds diameter. Across a one-degree 22°→23° boundary,
WebGPU source captures change 52–297 pixels above an 8/255 channel difference;
cards change 1,033–1,639. These descriptive centered-region metrics support visual
inspection; they are not a frozen acceptance threshold. The initial metric included
the ground in its foreground mean and is retained as
`comparison-including-ground.json`; `comparison.json` excludes both sky and ground
corner colors and records the PNG hashes. First undilated atlases/captures are
retained as `*-impostor-01` and `vegetation-cards-01`.

**Do not integrate this nearest-view card into the scene.** More angular/elevation
samples, view blending/depth-aware reconstruction, reduced screen size, lighting
and shadow policy would need another comparison. A single billboard or crossed
card offers still less view-dependent shape information; no claim is made that
these alternatives have been qualified. A denser atlas also increases memory.

## Current decision and remaining work

Keep originals in the main preview. Test moderate opaque meshes first at the
actual 74-plant layout and a 148-plant stress case, with screen-space thresholds,
hysteresis, stable IDs, per-tree culling and measured draw/CPU/GPU costs. Retain
full geometry near the camera. Consider distant cards only if that measured
workload needs them and their view transitions can pass appearance review.

Seventeen lab tests pass after this checkpoint. Browser tools remain tied to the
explicit local Three/Puppeteer/Chrome installation and preview server on 4421;
portability, dependency identities for the browser bake, generic atlas intake,
instanced-card playback, runtime LOD transitions, population performance, mobile
qualification and final scene integration remain work. The supported static-LOD
input is broader than these four plants but still deliberately restricted.
Nothing was added to Kiln's core tools, exports, default build or shared skills.
The complete Troy goal remains active.

## Population follow-up

The subsequent `population-01` experiment compares original/moderate meshes at
74 actual city placements and a 148-plant offset duplicate stress fixture on
WebGPU and WebGL2. Both use material/part instancing, identical terrain, shadows,
1440×900 at pixel ratio 1 and the recorded NVIDIA desktop adapter. The isolated
fixture deliberately excludes buildings, armies, ships and water. Actor IDs and
inherited part transforms are preserved by `src/static-population.mjs`; focused
non-Troy tests verify this and reject missing sources/duplicate IDs/bad transforms.

Each view/candidate gets two seconds of warmup, then five seconds of natural RAF.
A separate renderer run gathers three seconds of GPU query/readback diagnostics;
those intervals are not natural pacing. Counters are snapshotted immediately after
render. No extra test-owned GPU browser overlaps a measurement; other desktop load
is uncontrolled, and brief CPU-only validation overlaps part of the session. These
are short comparative diagnostics, not isolated-machine or final-scene acceptance.

All natural-pacing p95 intervals were about 8.4 ms on the 120 Hz display. All
representations submitted 28 total draws including shadows/postprocessing. At 74
plants, submitted triangles dropped from 335,817 to 213,473; at 148, from 667,025 to
422,337. GPU median differences were small and inconsistent. The initial near
camera inherited an obsolete courtyard target and actually showed distant plants;
its captures remain useful only for that distant coverage, not close-canopy proof.

`population-close-02` changes only the near framing to include actual nearby olive,
fig, cypress and shrubs, then repeats the 74-plant pair on each backend. GPU medians
were 0.475→0.449 ms on WebGPU and 0.901→0.668 ms on WebGL2. Natural-pacing p95 stayed
about 8.4 ms. One WebGPU moderate-mesh sample has a retained 25 ms interval; cause
is unisolated and it is not evidence that the derivative fixes hitches. The combined
population/close runs use 160 seconds of measured samples plus warmup/loading.
Receipts retain all raw intervals, submit times, GPU queries, source hashes,
counters, browser identity, warnings and screenshots. All runs have no page errors
or warnings. The scene's Courtyard button now uses the corrected camera too.

**Decision:** keep full approved meshes as the current desktop default. The tested
planting is not demonstrably frame-rate limited by vegetation. Retain moderate
meshes as a candidate for constrained devices or denser composition; choose their
thresholds only against the complete workload. Do not spend more desktop audit time
or add LOD draw/transition overhead to chase these small isolated deltas. Per-tree
culling and distance policy remain useful workflow work when full-scene evidence
justifies them. Nearest-view cards remain withheld for appearance defects.
