# Troy actor-transform integration checkpoint

3 October 2026. Follow-up to the [crowd runtime](2026-10-03-troy-crowd-runtime.md)
and [vegetation population comparison](2026-10-03-troy-vegetation-runtime.md).
The full production objective remains active. This provides a runtime prerequisite
for locomotion; it does not claim walking, landing, archery or a duel is implemented.

## Implemented

The external runtime lab's `actor-transforms.mjs` owns cloned actor transforms and
validates an entire update batch before applying any part of it. Updates identify
existing actors by stable ID, preserve their phases and reject duplicates, unknown
IDs, nonfinite matrices, mirroring, shear and degenerate scales. Caller-owned matrix
mutation cannot change retained actor state. Two focused tests failed against the
stub before implementation and now pass.

Both rendering adapters expose `updateActorTransforms([{id,matrix}])`. The GPU
adapter updates instance matrices and the shared tangent-transform buffer, including
explicit dirty ranges. The CPU shared-pose adapter immediately recomputes matrices
at its last clip time. IDs and phases remain unchanged. The current adapter still
uses one retained clip per group; arbitrary clip switching/blending and sockets
are not implemented. Culling stays disabled until continuous animated bounds exist.

`runtime-lab/evidence/moving-actors-01/{webgpu,webgl2}` captures three actors at
three clip times using the saved Greek attack bake, changing translation, yaw and
positive nonuniform scale, with a strong diagnostic normal map and shadows. Original
hierarchy, baked playback, CPU instanced parts and repeat-original are compared at
identical transforms/times. Both backends render without page errors. Repeat-original
pixels are identical. CPU baseline whole-frame mean RGB error is below 0.000214/255;
baked mean is about 0.011–0.027/255. These are descriptive full-frame metrics and
visual parity evidence for the tested transforms, not silhouette thresholds,
contact/animation-quality acceptance or a performance result.

The scene now stages `web/runtime/rigid-v2/`: six source modules plus two idle
manifests/binaries, ten files and 132,736 bytes. All staged hashes were independently
verified against its manifest. The old `rigid-v1` is retained for reproduction.
`scene/evidence/crowd-runtime-v2/{webgpu,webgl2}` confirms 480 idle actors in both
adapters at two times, with shadows and no page errors. The corrected Courtyard
camera now frames the approved planting rather than pointing away from it.
The scene remains an idle composition study; no sliding idle actors were substituted
for missing walking motion. Twenty-one lab tests and twelve scene tests pass.

## Next motion boundary

Read-only inspection of the currently staged GLBs confirms Greek soldier, Trojan
soldier, Achilles and Hector contain only `idle` and `attack` (16 channels each).
The galley has no animation. Those assets do not already provide a qualified walk,
start/stop, disembark, equipped bow or paired duel sequence. The horse retains its
separate reported gallop ground-contact defect.

Next author and qualify the walking/transition/equipment motion required for one
complete landing slice, then connect a single logical actor roster through aboard,
transfer, staging and formation. Derive movement from terrain/deck support and
actual routes, not timeline teleports. Check feet, hands, weapons, bounds and clip
transitions before scaling out. Preserve original editable revisions and bake only
newly reviewed clips. The actor update path is ready for that consumer work.

Plant population evidence supports retaining originals at this desktop density;
no frame-rate need to deploy the reduced variants was demonstrated. Device-tier
LOD, complete-scene timing, final composition/shadows, physical mobile evidence,
owner review, reusable workflow qualification and public release are still open.

## First locomotion draft — not accepted

Historical first-draft findings below are superseded by the bounded
[saved locomotion prototype](2026-10-03-troy-locomotion.md), not by final scene
acceptance. Its garment repair, start/stop clips and remaining scope are recorded
there; rejected drafts remain available.

A fresh external `motion/` workspace restored the exact Greek soldier revision
and rebuilt its original GLB byte-for-byte, with its five saved material pins.
The first draft adds a 1.2 second walk while preserving geometry and the existing
idle/attack channels. Sampled exported-animation checks at 240 Hz over two cycles
show approximately 0.0101 mm maximum stance Z variation and a minimum foot bound
of -0.05694 mm when the consumer advances at the matching 2/3 m/s. The sword
retains its hand socket. These checks concern flat-plane contact only.

Material-faithful animation sheets expose thigh penetration through the rigid
tunic skirt during swing. The draft remains unsaved and is not staged in the
scene or baked into a crowd payload. Resolve this visible fit defect and review
moving playback, then qualify start/stop transitions and landing support. Numeric
foot checks do not override the failed visual review. No new performance sample
was taken during this authoring work.
