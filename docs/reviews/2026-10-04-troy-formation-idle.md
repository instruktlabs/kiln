# Troy GPU formation idle — 4 October 2026

Completed shore units now use shared GPU idle clips in the packed-route preview.
The same 224 actors keep their exact final placements, planted stances and
independent unit clocks. Walking remains CPU-driven. `regroup=packed` selects the
GPU formation idle by default; `formationIdle=reference` retains the CPU comparison.
Regrouping itself remains opt-in.

Preview: `http://127.0.0.1:4420/?shorefleet=1&regroup=packed&fleetCulling=on&view=reserveCrew`.
Use the landing slider's End key, then Play. Marching crew near 390 seconds shows
the mixed state: 56 walkers and 168 formed soldiers.

## Representation and contacts

The implementation remains in the external `troy-expansion/scene` workspace under
`/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/`. No engine runtime,
accepted asset or installed skill was changed.

Removing each actor's world placement reveals 33 equivalent final pose groups
across the 224 soldiers. The largest grouped rest-matrix discrepancy is
5.02e−10. Each group supplies a six-second, 15 Hz rigid-part idle clip, with
91 inclusive frames and 69 parts. All clips share one 4,972,968-byte RGBA16F atlas
and three material batches. Actors retain their own full world transforms.
These are derived animation data; editable character and route sources remain.

The normalized stance grouping is a scene adapter, not a claim that arbitrary
characters share poses. The existing generic rigid baker, clip-bank runtime and
conservative interpolation bounds are reused. The loader verifies character,
packed-route metadata, animation and bound identities before use. A pure roster
helper preserves source indices, actor IDs and each unit's post-march clock.

All 224 actual final stances were checked at quarter-frame intervals: 80,864 poses
and 44,636,928 local-box corners, including float32 actor placement:

- Maximum mesh-corner error against CPU: 1.009 mm.
- Maximum foot-corner error: 0.055 mm.
- Maximum transition discrepancy: 0.587 mm.
- Measured baked foot drift and loop discrepancy: zero.
- Escapes from the conservative world bounds: zero.

The GPU renderer owns formed actors; they leave CPU draw slots and stop repeated
CPU pose evaluation. CPU hierarchies remain allocated for reverse seeking. Reverse
travel restores CPU ownership, and reversing before regrouping restores shore
idle/rowing ownership. GPU playback does not create additional soldiers.

## Render and functional evidence

39 scene tests pass. Both WebGPU and WebGL2 pass 28 captures for each CPU/GPU
variant, including just before/at/after the final transition, continued idle,
forward/reverse seeking and actual instance binding checks. All 28 GPU culling
off/on pairs and all 12 repeat/reverse pairs across the backends are pixel-identical.
CPU/GPU images have small quantization differences: at most 591 pixels differ by
more than 10 channel levels, and 137 by more than 40, in the 1440×900 captures.
Ground-level captures were inspected; owner motion review remains separate.

In the completed-formation view, total draw calls fall from 386 to 254. In the
marching view, draws remain 371 because walking still uses the CPU part batches,
but CPU-evaluated crew fall from 224 to 56. At completion, all 224 use GPU playback
and CPU-evaluated/rendered shore crew fall to zero.

Evidence: `output/formation-stances-01`, `output/formation-idle-01`,
`evidence/formation-idle-01`, `formation-idle-gpu-01`, `formation-idle-ref-01`
and `formation-idle-default-01`. Capture sources are retained before the final
default-only change; the adopted default receives a separate smoke check.

## Focused performance check

Chrome 150.0.7871.128, GTX 1660 Ti Max-Q, 1440×900, balanced water and fleet culling
enabled. Each case retained 15 seconds of natural frame intervals after frozen
shader warmup and two seconds of animated warmup. There were eight cases total,
120 seconds of retained samples. The preview was blanked, Codex minimization and
restoration were verified, and every measured frame passed visibility/focus checks.
No test suite, capture or provider job ran during timing; unrelated processes were
preserved. Preparation load readings include the frozen benchmark rendering and
must not be described as idle-machine readings.

| Backend / view | CPU idle mean | GPU idle mean | GPU p95 |
| --- | ---: | ---: | ---: |
| WebGPU / marching | 55.20 ms | 26.25 ms | 33.3 ms |
| WebGPU / formed | 47.38 ms | 9.06 ms | 16.7 ms |
| WebGL2 / marching | 46.12 ms | 25.38 ms | 33.3 ms |
| WebGL2 / formed | 39.80 ms | 10.45 ms | 16.7 ms |

The GPU cases contain no interval over 50 ms. These are scoped warmed desktop
results, not sustained 60 FPS, physical-mobile, startup or final-scene acceptance.
The application's existing 50 ms delta clamp means the slow WebGPU CPU marching
baseline advances about 13.6 scene seconds during its 15-second retained window;
other cases advance about 15. Population and motion-phase counts stay the same,
but these are not identical wall-time-to-scene-time traces. Raw clocks and
intervals remain in `evidence/formation-idle-timing-01`.

Next work remains substantial: CPU walking and range policy, later offshore
landings, natural equipment/hull interaction, archery and heroes, environment and
traversal, physical mobile/owner review and reproducible Cloudflare delivery.
The previously recorded hitch is not closed by these short measurements.
