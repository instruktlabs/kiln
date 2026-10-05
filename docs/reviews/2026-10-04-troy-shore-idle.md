# Troy shore idle and animated bounds — 4 October 2026

Shore crews now transition from their completed walking pose into restrained
breathing, shoulder and head motion, with planted feet and swords retained at the
hips. The combined shore prototype defaults to GPU idle playback. Actor IDs survive
walking → idle, culling, replay and reverse seeking. This adds life at the existing
staging positions; marching/regrouping into the battlefield formations remains.

Preview: `http://127.0.0.1:4420/?shorefleet=1&fleetCulling=on&view=idleCrew`.
Use the Landing time slider's End key, then Play to inspect the landed crews.
`shoreIdle=off` retains the previous frozen finish; `shoreIdle=reference` evaluates
the same idle on CPU. Culling remains opt-in through `fleetCulling=on`.

## Motion and data

All work remains external under
`/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion/scene`.
`web/runtime/crew-idle-v1/shore-idle.mjs` captures the completed supported stance.
Only spine, neck, shoulders and elbows move. Root, hips, legs, finger posture and
hip weapon attachment remain unchanged. A six-second periodic envelope starts and
ends at that stance with zero added velocity; each actor's clock starts at its own
arrival, rather than resetting the whole crew together. Already-landed ships keep
advancing their idle clocks after the equipment timeline stops.

The bank has 28 stance variants, 91 inclusive samples per six-second cycle at 15 Hz,
69 rigid mesh parts and 4,219,488 bytes of RGBA16F transforms. Origins are rebased
per stance before quantization and restored before ship-frame placement. Geometry,
materials and editable originals remain the existing crew asset. The runtime
shares one idle atlas across all 224 shore actors and uses three material batches.
It does not evaluate the CPU idle rigs during GPU playback.

`scripts/bake-shore-idle.mjs` uses the existing generic procedural-sampler baker.
`qualify-shore-idle.mjs`, `bound-shore-idle.mjs`, `capture-shore-idle.mjs`,
`compare-shore-idle.py` and `measure-shore-idle.mjs` retain reproducible evidence.
This adapter is specific to the Greek rig and these completed stances; it does not
claim to bake arbitrary skins, morphs, gestures or navigation.

## Representation and culling

`web/runtime/fleet-v2/rigid-playback.mjs` adds compact draw slots while keeping
source actor IDs, clip frames and placement records separate. Hidden actors retain
their current pose records; revealing or reversing them rebuilds the correct slots.
CPU walking slots exclude actors owned by the GPU idle renderer. Captures verify
ownership totals of 224 shore actors, actual instance matrices and frame/origin
attributes, not just declared roster counts.

The asset-independent `rigid-bounds.mjs` computes conservative bounds for this
T/Q/S decoder. Each mesh part's scaled local box fits an origin-centred sphere;
unit quaternion rotation preserves its radius. The extrema of linearly interpolated
translations/scales lie within endpoint extrema. Union those ranges across each
clip, restore its origin and transform the result once by actor placement. A 5 mm
numerical guard covers shader/instance floating-point arithmetic. These are broader
than captured-pose boxes, and include between-sample rotation arcs. A test first
failed with sampled endpoint boxes, then passed with the new bound construction.
The contract applies to rigid T/Q/S playback, not arbitrary vertex deformation.

Idle bounds feed the existing camera/potential-shadow culler and its receiver-floor
contract. All 32 matched culling off/on image pairs across WebGPU and WebGL2 are
pixel-identical. The landed-crew view retains 38 potential visible/shadow casters
out of 224 idlers. It draws 239 calls versus the CPU reference's 371, including
shadows, while submitting 2,876,169 versus 2,853,849 triangles: the conservative
bounds intentionally retain a little more geometry. Neither count alone proves
better frame pacing. Formation and offshore-rower animated bounds remain separate
unfinished work.

## Checks and visible differences

- 29 scene tests pass, including deterministic forward/reverse motion, fixed feet
  and weapon socket, exact finish ownership, and bounds between rotation samples.
- Independent reconstruction checks cover 10,108 poses and 5,579,616 transformed
  local-box corners. Maximum sampled mesh error is 1.002 mm, foot-mesh error
  0.071 mm and walking-to-idle join error 0.588 mm. The loop closes exactly in
  decoded data. No sampled reconstructed corner escapes its conservative bounds.
- Full scene captures: 32 per backend, covering arrival, exact first handoff,
  subsequent idle motion, completed staging, culling and reverse seek. No page
  errors, ID/slot failures or shared rowing-resource disposal failures occurred.
- The quantized GPU idle is not pixel-identical to the full-precision CPU reference.
  At 1440×900 the largest close-view comparison has 1,648 pixels differing by more
  than 10 channel levels, and at most 430 by more than 40. Geometry error is bounded
  above in sampled poses; close views were inspected. Retain these differences for
  owner review rather than labelling the approximation exact.
- The normal URL was checked after selecting GPU idle as the default: exact slider
  endpoint and keyboard End, all 224 ashore, zero CPU-rendered shore actors (their hierarchies remain allocated for reverse seek), valid
  GPU slots, and reverse seek back to rowing.

Evidence: `scene/evidence/shore-idle-01` retains first integration and interpolation;
`shore-idle-02` retains the final culling/reference comparisons and archived sources;
`shore-idle-default-01` checks the adopted default. Bank/source hashes and final
provenance bind the retained artifacts. No source-asset save or project repin was
made; no core tool or installed skill changed.

## Bounded performance cost

One frozen-finish/GPU-idle pair in each of two views per backend; four 15-second
samples per backend, preceded by frozen shader warmup and two seconds of animated
warmup. GTX 1660 Ti Max-Q, 1440×900, balanced water, culling on. The IAB preview was
blanked and Codex minimization/restoration verified; benchmark visibility/focus
passed. No tests, captures or providers ran during timing. Preparation load includes
the frozen benchmark rendering, not an idle-machine measurement.

| Backend / view | Frozen → GPU idle mean | GPU idle p50 / p95 | GPU idle maximum |
| --- | ---: | ---: | ---: |
| WebGPU unloading | 20.56 → 21.35 ms | 24.9 / 25.1 ms | 41.7 ms |
| WebGPU landed crew | 8.39 → 8.76 ms | 8.3 / 16.6 ms | 16.8 ms |
| WebGL2 unloading | 20.06 → 21.53 ms | 24.9 / 25.1 ms | 41.6 ms |
| WebGL2 landed crew | 8.93 → 9.90 ms | 8.3 / 16.7 ms | 16.8 ms |

This adds animated behavior at a measured mean cost of about 0.4–1.5 ms in these
samples, rather than improving speed over frozen crews. It is not a comparison
against CPU idle performance. The earlier 166.6 ms WebGPU hitch remains unresolved;
no >100 ms interval appeared here, but its absence does not identify its cause.
No long-run, moving-camera, water-tier or physical-mobile acceptance is implied.
Per-frame CPU clip-record updates are a candidate for a shared GPU clock/phase
workflow; avoid claiming the present path is the final optimal implementation.

## Remaining full-scene work

Regroup/march shore units, land the offshore crews, refine equipment handling and
hull/wave contact, add archers and the heroes' optional duel, finish environment
and traversal, qualify range/device policies and physical controls, incorporate
proven optional workflows, obtain owner visual review and deliver reproducibly to
Cloudflare. The full goal remains active. Nothing was committed, pushed or deployed.
