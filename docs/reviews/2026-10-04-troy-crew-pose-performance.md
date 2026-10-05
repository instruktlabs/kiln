# Troy crew pose performance — 4 October 2026

The measured landing bottleneck was repeated CPU pose work. Walking actors solved
the completed seated-to-standing transition again every frame, before applying their
walk pose. Caching that invariant pose improves median full-scene frame time from
about 42 ms to 25 ms in the two tested views on both WebGPU and WebGL2. The scene
still does not sustain 60 FPS, and one WebGPU wide-view hitch remains recorded.

## Diagnosis and fix

The initial culling comparison (`scene/evidence/fleet-timing-01/webgpu`) showed
only a modest landing median improvement and no wide-view median improvement.
Its first shader warmup was too short: some initial animation sampling windows
started at different motion times. Keep it as exploratory evidence, not the final
matched comparison or grounds for enabling culling by default.

A six-second CPU profile (`scene/evidence/fleet-profile-01/webgpu`) attributed
about 4.35 of 6.32 profiled seconds inclusively to crew unloading samples, including
3.16 seconds in the stand sampler. Matrix updates, multiplication and repeated node
lookups dominated self time. Profiling overhead is present; these are diagnostic
attributions, not separate wall-time budgets that can be added together.

`scene/web/runtime/crew-v1/crew-travel-unload.mjs` snapshots the completed stand's
local transforms once, including the actor's parked oar pivot/grip/mesh. Later
samples restore those values before existing aisle/walk playback. This also handles
reverse seeks from ashore to rowing and back. Early hand-release and standing
animation still use the original solver. `landing-v10` remains unchanged.

The shore runtime defaults to this cached adapter. `crewPose=reference` selects
the prior adapter for reproduction. This changes neither geometry nor animation
content; it avoids recomputing an invariant intermediate pose. No core engine or
installed skill changed.

## Visual and behavioral checks

- 22 scene tests pass. The optimization test first observed two redundant stand
  solves; it now observes zero during later movement.
- Every one of 28 crew variants matches the reference at 19 forward/reverse times
  (532 poses). Actor hierarchy matrices and parked oar matrices agree within 1e-9.
- `scene/evidence/crew-cache-01` contains 12 captures per backend. All six matched
  reference/cached pairs per backend are pixel-identical, covering rowing, release,
  walking, shore staging and reverse seek. No page errors, identity failures or
  instance-binding failures occurred.

## Focused timing

`scene/evidence/crew-cache-timing-01/{webgpu,webgl2}` records one reference/cached
pair in each of two views: four 15-second samples per backend. Before each sample,
frozen shader warmup requires at least two seconds and 30 frames, followed by two
seconds of animated warmup. Balanced water, 1440×900, culling enabled; natural RAF
pacing with no GPU-query readback. Landing samples begin at motion time approximately
99.03 seconds and fleet samples at 14.03 seconds in both variants.

Machine: GTX 1660 Ti Max-Q. Thirteen superseded agent-created preview tabs were
closed. The latest preview was temporarily blanked, then restored to its prior
location/playback. Codex minimization and restoration were verified through KWin;
all samples report a visible, focused benchmark browser. No concurrent tests,
captures or provider runs occurred. Preparation CPU/GPU readings include the frozen
benchmark scene still rendering; they are not a measurement of background-only idle
load. Unrelated processes were preserved, so this is reduced contention, not complete
machine isolation. The desktop helper uses the observed window identity, following
[KDE's scripting API](https://develop.kde.org/docs/plasma/kwin/api/).

| Backend / view | Reference p50 / p95 | Cached p50 / p95 | Cached maximum |
| --- | ---: | ---: | ---: |
| WebGPU landing | 41.7 / 50.0 ms | 25.0 / 33.4 ms | 41.7 ms |
| WebGPU fleet | 41.6 / 41.8 ms | 25.0 / 33.3 ms | 166.6 ms |
| WebGL2 landing | 41.7 / 50.0 ms | 25.0 / 25.1 ms | 41.7 ms |
| WebGL2 fleet | 41.7 / 41.8 ms | 25.0 / 33.2 ms | 33.4 ms |

The median reduction is about 40%. The WebGPU fleet sample has one interval over
100 ms; it is retained, not discarded. Its cause is unresolved, and the scene's
capped animation delta makes its final motion time about 0.2 seconds earlier than
the reference after that hitch. This is one bounded pair per case, not a broad tier,
long-run stability or physical-mobile acceptance. Culling remains optional: this
comparison qualifies the pose cache with culling on, not a new post-fix culling policy.

## Next work

Investigate the remaining joint/matrix work and the recorded hitch before calling
performance stable. Qualify animated GPU bounds and range/device policy, then crew
regrouping/final idles, later offshore landings, equipment/hull/waves, archery/duel,
environment and owner/mobile review. The landing readout also caches by integer
second and can still show “unloading” at completion; fix that small UI status issue.
The full goal and reproducible Cloudflare delivery remain open. No asset acceptance,
project repin, commit, push or deployment occurred during this pass.
