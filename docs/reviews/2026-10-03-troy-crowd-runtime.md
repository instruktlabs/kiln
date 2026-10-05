# Troy crowd comparison and first scene integration

3 October 2026. Follow-up to the [GPU playback prototype](2026-10-03-troy-gpu-playback.md).
The full production goal remains active. Work is in the private evidence repository
under `review/troy-expansion/`; no engine runtime, default build or public site was
changed.

## Current decision

Use merged rigid-part texture playback provisionally for ordinary formations on
this desktop. Retain the CPU instanced-part implementation as a comparison/fallback
candidate and keep heroes outside this crowd representation. This is a measured
CPU/GPU tradeoff, not a universal device-tier winner or proof that far geometry
needs no LOD. Full VAT, bone textures and impostors remain conditional alternatives.

The baseline evaluates exact source clips in shared phase groups, then uploads
per-part instance matrices. It explicitly transforms normal-map tangents as well
as normals. Both candidates use identical actors, sixteen phases, geometry,
materials, camera paths, lighting and shadow settings. Neither culls individual
actors in this lab. Three-actor source comparisons on both backends include the
strong normal-map diagnostic; the baseline's mean whole-frame RGB error is below
0.00021/255 in those frozen samples. This does not establish a general motion-error
tolerance.

## Bounded performance evidence

`runtime-lab/evidence/crowd-01-480/` contains four 30-second warmed cases per backend
at 1440×900: ground and aerial routes for both candidates. These use natural RAF
pacing without GPU readback. On this NVIDIA desktop/120 Hz display, p95 intervals
were about 8.4 ms for both candidates. Baked playback reduced median animation
update work from 1.3–1.4 ms to below the approximately 0.1 ms timer resolution, and
median render submission from 1.8–2.1 ms to about 0.8 ms. Total lab draws, including
shadows/environment, were 50 versus 8. This is not a claim of zero animation cost.

Keep the **175 ms interval** in the WebGL CPU-instanced aerial run. That observation
also includes a 136.5 ms render submission and 20.6 ms animation update outlier.
Its cause was not isolated, so it is neither erased nor attributed to a proven
engine defect. The baked natural-pacing runs did not reproduce that outlier.

`crowd-02-gpu-128/` and `crowd-02-gpu-1000/` add ten-second diagnostic cases with
per-frame GPU query readback. These are deliberately separate from natural pacing.
At 1,000 actors, baked median GPU time was roughly 3.34–3.61 ms, versus 2.72–3.39 ms
for instanced parts, while CPU update/submission work was substantially lower.
The saved summaries contain the actual per-case values and outliers. Do not infer
natural 1,000-actor FPS from serialized query-readback intervals. Other app/browser
load was not controlled; physical mobile and final combined-scene budgets remain
unqualified.

Five diagnostic cases returned zero end-of-case draw counters because renderer
statistics reset across asynchronous query readback. Those counters are invalid;
the raw receipts are retained. The harness now snapshots counters immediately
after rendering. A focused ten-second `counter-snapshot-check` confirms 50 draws
and positive geometry for the instanced 1,000-actor case. Its timings are not used
for comparison. No long blanket audit was run.

## Scene integration

The preview on port 4420 now animates all 480 ordinary soldiers with their saved
idle clips. Phase assignment is deterministic by actor ID. Heroes remain separate;
the 48 wall soldiers are still archer stand-ins. `?crowd=instanced` selects the CPU
comparison and `?crowd=static` selects static placements. These are development
routes, not a finished product quality UI.

`scene/scripts/stage-runtime.mjs` stages nine adapter/bake files (130,825 bytes) into
`web/runtime/rigid-v1/`, recording hashes and checking bake/source identity. Source
GLBs remain unchanged. The browser now hashes each loaded GLB before parsing and
checks each animation payload against its recorded source and data hashes. The
current adapter keeps actor transforms fixed; moving actors/attachments and clip
transitions are still work.

A 2048 directional shadow map covers the battlefield, with characters and ships
as casters and the terrain as receiver. This improves the ground-contact reading;
city architectural shadow coverage, shadow tiers and final contact qualification
remain unfinished. Arrival captures record 183 total draws and 2,778,309 submitted
triangles including the shadow pass; these are counts, not final FPS evidence.

Scene evidence:

- `crowd-integration-01`: both representations/backends, two frozen idle times,
  before adding the battlefield shadow pass.
- `crowd-integration-02-shadow/webgpu` and
  `crowd-integration-04-shadow/webgl2`: current shadowed comparison captures, with
  no browser errors and different rendered poses at the two sampled times.
- `crowd-integration-03-touch/webgpu` and
  `crowd-integration-04-touch/webgl2`: complete viewpoint captures and successful
  touch orbit/pinch emulation after integration. This is not physical mobile.
- The first shadowed WebGL comparison timed out during navigation. It remains in
  `crowd-integration-02-shadow/webgl2`. A second owned Chrome diagnostic overlapped
  part of that attempt; the cause is unproven. The retry ran separately, foregrounded
  the page and waited for actual rendered readiness rather than network-idle alone.

Twelve runtime-lab tests and twelve scene tests pass. The new shared-pose and
actor-identity tests were observed failing before implementation. Existing fixtures
cover source preservation and unsupported input guards; no core/package gates are
claimed for these external experiments.

## Remaining objective

The scene now has idle life, not a completed army/landing simulation. Next work is
vegetation LOD/impostor comparison and one complete landing/battle/city slice:
walking/start-stop, deck/shore transfer, archery, dynamic attachments and actor
transforms, ground contact, hero face-off/duel and replay. Refine city/layout/terrain,
qualify culling and per-range/device choices with the combined scene, obtain owner
visual acceptance, prove reusable non-Troy workflows, then integrate optional skill
guidance and perform the scene/site/Cloudflare release. The goal is not complete.
