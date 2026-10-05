# Troy water, device tiers and mountain visibility

3 October 2026. Owner feedback on the local composition preview requested richer
water and shore wash, very low runtime cost, device tiers, clearer mountains and
less predictable wave/depth patterns. This is scene-owned work in the private
evidence repository at `review/troy-expansion/scene/`; it is not a core engine or
production-site change. Final scene visual acceptance remains open.

## Current implementation

- Four world-space swells use different directions, wavelengths, speeds and
  amplitudes. Small surface detail uses independently advected samples of one
  deterministic 128×128 data texture. This replaces the initial visibly regular
  sine-pattern detail and costs 87,380 decoded bytes including mipmaps. There are
  no downloaded water images, reflection render targets or fluid-simulation passes.
- A shallow opaque film follows the actual coarse terrain interpolation. An
  irregular shore front advances and recedes within a bounded band; foam breaks
  into patches. Wet sand uses the existing terrain draw. Shallow-water colour is
  an approximation, not physical refraction or a depth-buffer effect.
- The wave clock and coordinates are independent of camera orbit. All tiers retain
  the same shore timing and large swells. Lower tiers reduce mesh density and the
  number of small-detail samples.
- Water selector: Auto, Low, Balanced and High. Auto starts Low when reported
  core/memory hints are modest, otherwise Balanced; unknown hints use Balanced.
  Sustained slow frame intervals can step down after startup. Isolated pauses and
  hidden/resumed frame gaps are rejected; ten-second cooldowns limit switching.
  It does not auto-promote based on refresh-limited timing. Manual selection wins.
  This is a water-specific policy; complete-scene tier selection is still work.
- Fog now starts at 1,600 m and ends at 6,200 m, replacing 720–2,800 m. Captured
  approach views show clear mountain silhouettes with some atmospheric separation.
  Mountain geometry itself is still blockout quality.

| Tier | Water triangles | Water vertices | Water draws |
| --- | ---: | ---: | ---: |
| Low | 7,168 | 3,705 | 1 |
| Balanced | 17,472 | 8,925 | 1 |
| High | 31,360 | 15,933 | 1 |

The bounded multi-wave approach is informed by the parameter and interference
discussion in [GPU Gems, Effective Water Simulation](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models).
This implementation uses its own scene-owned height-field/normal approximation;
it is not a fluid solver, FFT ocean or full Gerstner implementation.

## Evidence and limits

`evidence/water-08/{webgpu,webgl2}/receipt.json` binds source hashes, backend/device,
views, tier selections and errors. Both capture runs finished with no browser
errors, captured all three tiers, and returned pixel-identical images after a
frozen high-angle orbit returned to the same approach camera. This checks return
stability; it is not a proof that every possible orbit is artifact-free.

Ten scene tests pass: four layout invariants, three shore/grid/contact constraints
and three quality-policy checks. The new shore and policy tests were observed
failing before implementation. The minimum sampled wash excursion was revised
from 9 m to 6 m when multiple unequal cycles replaced the uniform single cycle;
the allowed front bounds and terrain-clearance requirements were retained.

`evidence/water-08/timing-summary.json` summarizes 20 warmup plus 120 measured
whole-scene frames per view/tier/backend at 1440×900, using per-frame GPU query
readback. These short diagnostics include the static blockout, not animated armies
or the final shadow/interaction load. GPU medians varied non-monotonically between
tiers, so the runs do not establish a precise incremental cost or a winning tier.
Keep raw outliers; do not infer mobile qualification or final frame pacing from
these samples. Physical mobile and combined-scene performance remain open.

Earlier water captures are retained. `water-01` failed because the preview listener
was absent; the listener was checked and restarted. `water-02` through `water-07`
show intermediate regular-wave/noise-free versions, not the current visual design.
The latest touch regression run is kept separately in `water-09-touch`.

Next: owner review of the revised motion and visibility, then incorporate the water
into the complete landing slice and measure with animated crowds/vegetation.
Ship waterlines, buoyancy and hull/shore transfer remain separate unfinished work.
Do not report this preview as final ocean quality or publish the Troy scene yet.
