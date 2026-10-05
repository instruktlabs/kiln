# Troy rowing-to-landing handoff — 4 October 2026

The one-ship dry-shore prototype now uses the qualified compact GPU rowing bank
through approach, coast and settle, then returns the same 28 actors to the existing
CPU hand-release, stand and single-file unloading sequence. The ship size, 14 paired
seats, one person per oar, hip weapons, folding plank and dry-shore route are retained.
This is an external scene prototype, not an accepted asset revision or release.

## Implementation and reproduction

Workspace: `/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion`.
Open `http://127.0.0.1:4420/?landing=1&gpurow=1&view=shipApproach`.
`landingRender=instances` selects the CPU reference in the same bundle.

- `runtime-lab/src/rowing-handoff.mjs` switches pose ownership without replacing IDs.
  Returning from GPU playback invalidates CPU pose caches, including after reverse seek.
- `runtime-lab/web/oar-playback.mjs` drives authored oar pivots without character IK.
  Its transforms match the reference at tested stroke times and reset parked offsets.
- `runtime-lab/web/troy-hybrid-controller.mjs` uses three GPU crew material batches
  during rowing and 69 CPU part batches during unloading. Both sets stay allocated;
  only the current owner is visible. Initialization still constructs the CPU rigs.
- `runtime-lab/scripts/stage-hybrid-landing.mjs` checks dry-shore evidence and rowing
  source/payload hashes before staging. `scene/web/runtime/landing-v10` contains
  36 files / 7,555,343 bytes; v9 remains unchanged. The 4,219,488-byte rowing atlas
  is shared across the 28 row/side clips, not duplicated per actor.

At 42 seconds the rowing clock has settled at 15 seconds (loop phase zero), matching
CPU stand time zero. Plank unfolding/lowering completes before crew leave their seats.
The entire approach/landing still takes 337.175 seconds. Actor positions reported
while GPU playback owns the pose use their seated locations, not stale ashore roots.

## Evidence

- Focused tests first failed for the missing handoff/oar implementation; both pass
  after implementation. Full external lab: **69 tests passed**. Scene: **12 passed**.
- `runtime-lab/evidence/hybrid-landing-01/handoff.json`: all 28 actors, 15,456 mesh
  bounding-box corner samples at the handoff. Maximum discrepancy **0.545 mm**,
  below the unchanged 5 mm mesh threshold. This is a sampled boundary check.
- `scene/evidence/hybrid-landing-01/{webgpu,webgl2}/receipt.json`: ten captures per
  backend, zero page errors, three GPU crew batches and zero character rig evaluations
  per GPU update. All 28 actors reach dry shore. Replay, pause, slider and reverse seek
  preserve identities and positions. Selected rowing, transition and exit views inspected.
- `scene/evidence/hybrid-landing-01/image-comparison.json`: at CPU handoff the
  reference and hybrid screenshots are identical within each backend. Reverse-seek
  captures have zero pixels differing by more than 10 channel levels outside controls.
  GPU/reference rowing differs at 241 / 228 pixels by over 10 and 44 / 43 by over 40
  (WebGPU / WebGL2), consistent with the retained sampled/quantized playback.

No timed benchmark ran. These counts and checks establish behavior, not frame-rate,
memory, mobile capacity or continuous collision acceptance. Culling remains disabled
for the baked crew. The other 11 scene ships still use their earlier placeholders.

## Next work

Extend the fleet with persistent crew rosters, independent ship phases and validated
placements/routes, then add culling/range policy and a bounded quiet-machine comparison.
Believable manual equipment handling, hull trim/wave contact, owner motion review,
archery, heroes/optional duel, environment polish, physical mobile qualification and
Cloudflare release remain part of the full goal. No core tools, installed skills,
accepted project pins or public deployment changed in this checkpoint.
