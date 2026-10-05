# Troy fleet resources and visibility — 4 October 2026

The combined fleet now shares its parsed source assets and rowing atlas between
shore and offshore controllers. Optional culling removes out-of-view CPU crew and
ship instances while retaining off-camera casters whose shadows could enter the
view. The tested screenshots remain pixel-identical on WebGPU and WebGL2.
This is external scene work, not a core engine change or performance acceptance.

Preview with the candidate enabled:
`http://127.0.0.1:4420/?shorefleet=1&fleetCulling=on&view=landing`.
Without `fleetCulling=on`, the shared resources are used but visibility culling is
still disabled pending timing evidence. `fleetResources=separate` retains the
separate-resource comparison; runtime `troy.setFleetCulling(boolean)` toggles culling.

## Changes

Under the external `troy-expansion/scene` workspace:

- `web/fleet-resources.mjs` verifies the retained source/bank hashes and parses the
  vessel and crew once for both controllers. They share one 4,219,488-byte atlas
  payload and one DataTexture, replacing two such allocations. Actual driver memory
  overhead was not measured.
- `web/shared-resource.mjs` owns reference-counted leases. One consumer can release
  its lease without breaking the other; closing the owner frees the texture after
  the last release. Both browser modes verify final disposal with zero live leases.
- `web/runtime/fleet-v1/rigid-playback.mjs` adds optional shared texture ownership to
  the retained shader path. `landing-v10` stays unchanged for prior reproduction.
- `web/view-culling.mjs` tests current geometry bounds against the camera, plus the
  directional-shadow sweep down to an explicit receiver floor of Y=-16. The current
  scene's terrain bottoms at that height; other receivers lie above it. Unknown
  bounds or bounds below this contract are retained. This is not a general shadow
  culler for arbitrary lights, displaced geometry or receivers below the floor.
- Shore actor and all fleet ship bounds use their current CPU poses with a 1 mm
  expansion. Compact draw slots preserve persistent actor identities. Hidden actors
  keep simulating and restore current matrices when they reenter the view.
- Offshore ships stop uploading unchanged poses once their approach has finished.

GPU-animated crew and formation batches still bypass this culling. They need
conservative bounds for shader animation before extending the technique. City and
vegetation policy, geometry LOD and impostors are unchanged.

## Evidence

`scene/evidence/fleet-optimization-01/` contains the prior source snapshot, 20 passing
scene tests, 11 captures per backend, source hashes and the full image comparison.
Tests cover shared lifetime/retry/disposal, camera-visible objects, off-camera shadow
casters, conservative fallback, plus the earlier population/slot/scene checks.

All six matched comparisons per backend have **zero differing pixels**: separate
versus shared resources and culling off versus on at five frozen view/time pairs.
No page errors or instance-matrix/actor-identity failures occurred. These are sampled
visual comparisons, not a continuous motion or physical-mobile qualification.

Both backends report the same submitted geometry counts, including shadows:

| View / time | Culling off | Culling on | Reduction |
| --- | ---: | ---: | ---: |
| Landing / 12 s | 4,351,049 | 2,845,529 | 34.6% |
| Landing / 97 s | 4,351,049 | 2,831,089 | 34.9% |
| Beach / 338 s | 5,011,749 | 3,072,069 | 38.7% |
| Fleet overview / 12 s | 5,011,749 | 5,011,749 | 0% |
| Heroes / 338 s | 5,011,749 | 3,072,069 | 38.7% |

Beach/hero draw calls fall from 479 to 181. Close landing draw counts do not change
because the remaining visible instances still use those batches. No timed benchmark
ran: fewer submitted triangles do not yet establish smoother frames or a device tier.
App minimization and machine quieting were not needed for these functional captures.

## Next

Run a bounded quiet-machine timing comparison, preserving the owner's minimize-Codex
and foreground-browser requirements. Extend culling to baked characters only after
qualifying their animated bounds; retain shadow evidence. Crew regrouping and final
idle transitions, offshore landings, equipment handling, hull/waves, archery and duel,
environment, device/owner review and reproducible Cloudflare release remain open.
