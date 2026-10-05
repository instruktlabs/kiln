# Troy joint propagation and landing controls — 4 October 2026

The shore crew now update only a rotated leg joint's descendants during walking
and aisle steps, instead of updating the entire character after each joint.
Full-pose synchronization still happens before and after limb solving. Compared
with the preceding completed-stand cache, the measured mean frame interval falls
by about 9–15% in the two tested views on WebGPU and WebGL2, with unchanged sampled
images. This is another local improvement, not stable 60 FPS or mobile acceptance.

## Implementation and retained references

External workspace: `/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion/scene`.
`web/runtime/crew-v2/` derives the aisle/travel playback and their caller adapters
from `landing-v10` and `crew-v1`. `joint-pose.mjs` refreshes the required ancestors
through its existing world-transform queries, then calls `joint.updateMatrixWorld`
after changing that joint. Its contract requires callers to synchronize other
edited branches; this is qualified for these scene adapters, not a generic change
to arbitrary hierarchies or the Kiln engine.

The combined shore scene defaults to `crewPose=subtree`. `crewPose=cached` retains
the preceding stand-cache adapter and `crewPose=reference` retains the original
solver. The earlier runtime directories, assets, routes, IDs and saved project pins
are unchanged. No engine, installed skill, accepted asset revision or public site
changed in this checkpoint.

## Checks

- The focused test first failed because rotating a knee traversed an unrelated
  shoulder branch. It passes after restricting propagation to the rotated branch.
- All 28 crew variants match `crew-v1` at 19 forward/reverse times: 532 poses,
  over 50,000 hierarchy comparisons, actor and parked-oar matrices within 1e-9.
- 25 scene tests pass. Both backend capture receipts pass, with zero page errors,
  correct actor identities, matrix bindings and shared-resource disposal.
- All 12 matched image pairs across WebGPU/WebGL2 have zero differing pixels.
  They cover rowing, hand release, travel, completed shore staging and reverse seek;
  rendered shadows are included. The landing view was also visually inspected.

Evidence: `evidence/crew-subtree-01`, including archived comparison sources and
source hashes. The sole subsequent runtime change switches the default selection
from cached to subtree; both explicit comparison modes were already exercised.
`evidence/landing-controls-01` separately verifies the resulting normal URL and
records its source hashes. Final provenance binds these artifacts.

## Focused timing

`evidence/crew-subtree-timing-01/{webgpu,webgl2}` uses one cached/subtree pair in
each of two views: four 15-second samples per backend. Frozen shader warmup is at
least two seconds and 30 frames, followed by two seconds of animated warmup.
Balanced water, 1440×900, culling enabled, GTX 1660 Ti Max-Q. Natural frame pacing;
no GPU query/readback or CPU sampling profiler during timing.

| Backend / view | Cached mean → subtree mean | Cached p50 → subtree p50 | Subtree p95 / maximum |
| --- | ---: | ---: | ---: |
| WebGPU landing | 24.36 → 20.81 ms | 25.0 → 16.8 ms | 25.1 / 33.3 ms |
| WebGPU fleet | 24.16 → 21.74 ms | 25.0 → 24.9 ms | 25.1 / 33.4 ms |
| WebGL2 landing | 23.84 → 20.64 ms | 25.0 → 16.7 ms | 25.1 / 33.4 ms |
| WebGL2 fleet | 24.87 → 22.59 ms | 25.0 → 25.0 ms | 25.1 / 33.3 ms |

The landing median crosses a refresh boundary, but its 25 ms p95 and approximately
21 ms mean show that this is not sustained 60 FPS. No interval exceeds 100 ms in
these eight samples. The earlier 166.6 ms WebGPU hitch remains unresolved; its
absence here is not a diagnosis. One pair per case does not prove long-run stability,
physical-mobile capacity, other water tiers or moving-camera performance.

The retained IAB preview was temporarily blanked. KWin verified Codex minimization
and restoration for each backend; every sample was visible and focused. Tests and
captures had finished before timing, and no providers ran. Unrelated processes were
preserved. Preparation load includes the frozen benchmark rendering and must not
be reported as idle-machine load. Full source/configuration receipts are retained.

## Landing controls

The status cache previously keyed only on the integer second, so a sequence ending
at 337.175 s could stay labelled “unloading” after completion. The range input's
0.1 s step also stopped at 337.1 rather than its exact endpoint. The completion flag
now participates in the readout cache, and the slider accepts the exact end time.
The browser regression first reproduced both faults. It now verifies all 224 shore
crew ashore, “338 / 338 s · ashore”, exact 337.175 s slider/keyboard-End navigation,
and reverse seek back to rowing. This does not add a per-frame expensive stats call.

## Remaining production work

Keep the full scene objective active. Next functional work is crew regrouping and
natural final idle transitions, plus the offshore ships' later landings. Performance
work still includes the retained hitch, qualified animated bounds, range/device
policy and representation transitions. Equipment handling, hull/wave contact,
archery, heroes/optional duel, environment refinement, physical mobile and owner
review, reusable workflow guidance and reproducible Cloudflare delivery remain.
No commit, push, deployment or acceptance is implied by this checkpoint.
