# Troy shared character kit and role batching

Current resource checkpoint, 5 October 2026: immutable pose texture pooling
is active. Exact matching infantry and shore-idle payloads share storage while
source pins, geometry, materials, equipment and actor phases remain separate.
The default full scene uses five pose DataTextures and 13,020,696 raw bytes;
separate registration uses seven and 15,464,592 bytes. Both backends preserve
source pins, actor positions and binding checks across six views. All 155 scene
tests pass; all four scene release checks free every pool lease and payload.
Read docs/reviews/2026-10-05-troy-pose-texture-pool.md and the exact scene receipt
at evidence/pose-texture-pool-01/receipt.json. Canonical CPU copies are explicit;
physical VRAM, total heap and frame costs remain unqualified. Full-workload
shadows/culling, hub/device costs, startup/failure cleanup, terrain/ocean/city,
reusable workflows/skills and owner acceptance remain in the active full goal.
Earlier checkpoint notes below retain their dated source scope.

Current scene intake, 5 October 2026: fleet crews now use the same saved solid
block donor r_2afc9ff07e944c70be5236f263c3f9bc with natural oar grips and
forearm-aligned wrists. Rowing, release, unloading, shore idle and regroup
marching use coherent landing-v11, crew-v3, crew-idle-v2, formation-idle-v2 and
walk-bank-v2 sources/banks. The 336 fleet crew join the 336 shielded formation
infantry, 48 archers and two heroes in the simple block-hand style. Current
infantry-v1, archer-v5 and both saved hero children are unchanged. All 147 scene
tests pass; decoded rowing contacts and independent bank interpolation/bounds
checks pass. Ten actual-scene captures check five stages on WebGPU and WebGL2.
Read kiln-oss/docs/reviews/2026-10-05-troy-fleet-block-hands.md and the exact
scene/evidence/fleet-block-hands-01/receipt.json. Four stored transform payloads
fall from 22,932,288 to 12,961,728 bytes (43.5%); this does not establish a
frame-time or GPU allocation saving. Full-workload shadows/culling, isolated
hub/device costs, resource pooling, terrain/ocean/aerial stability, city routes,
reusable workflow/maintained skills and owner acceptance remain open. Earlier
dated checkpoint descriptions retain their original source scope.


Latest owner correction: the mitt child r_56a63955df434655be9a11d0afdb01dd is
REJECTED visually, including the archer-v2 style. The replacement is child
r_2afc9ff07e944c70be5236f263c3f9bc: one compact solid beveled hand block per wrist,
no sideways finger slab, separate thumb or opening. It is saved, exactly rebuilt,
GPU-reviewed and displayed in Library 4538. Read the newer
kiln-oss/docs/reviews/2026-10-04-troy-block-hands.md. This new geometry is not yet
the live scene donor; role anchors/attachment poses and banks require new intake.
Old hand contact passes do not qualify it. Earlier selected-mitt wording below is
superseded. The full goal remains active and owner appearance approval is pending.


Current checkpoint: owner-directed simple mitts are integrated into all 48 packed
archers via runtime/archer-v2. The exact saved child remains
r_56a63955df434655be9a11d0afdb01dd. Matte body/hand skin now shares a compatible
batch; bow position and normal fitting are qualified by sampled bank checks.
129 scene tests and basic current WebGPU/WebGL2 retrieval/draw/release inspection
pass. Read kiln-oss/docs/reviews/2026-10-04-troy-archer-mitts.md and the scene receipt
at evidence/archer-mitt-intake-01/receipt.json. Fleet, infantry and hero mitt
consistency, affected banks, current shadow/performance/device/owner acceptance
and the wider full goal remain open. Earlier checkpoint claims below are history
where superseded by this intake. The final bank payload reduction is 5.2%; no
rendering cost improvement is claimed.


4 October 2026. The owner asked whether archers and soldiers should reuse a body,
change clothing texture/color and add or remove equipment. The owner also requested
simple mitts matching the characters' stylized detail level. This is the next
asset/runtime organization direction within the active full Troy goal.

## Confirmed current implementation

`scene/web/main.mjs` creates archers from the already-loaded Trojan soldier body,
an articulated crew hand donor and the bow/quiver set. `archer-reference.mjs`
clones the body, removes sword/shield equipment and grafts the donor hands.
This shares geometry/material references within clones; it is not a separately
authored archer body.

The default 48 archers use `archer-playback.mjs`: parts are merged by material
identity and attribute/deformation layout in `archer-geometry.mjs`, then rendered
with instancing. Body poses read a baked transform texture; the bending bow reads
vertex/normal data; projectiles have their own per-actor transforms. The reference
mode uses CPU pose hierarchies for comparison. Infantry have separate faction idle
rigid banks and instanced playback. Crew landing/travel/formation modes have
additional role-specific banks. Greek/Trojan masters and derivatives remain
separate assets today; equivalent source regions are not yet a universal character kit.

Sharing an authored kit, sharing loaded GPU resources, and combining draw batches
are separate properties. The same body can be used in several motion batches
while its source, geometry and compatible materials remain shared.

## Proposed end state

| Layer | Shared resource | Per actor or role variation |
| --- | --- | --- |
| Body | Common stylized proportions, named rigid rig and simple mitt policy | Faction palette; approved body variants if needed |
| Materials | Neutral cloth maps, matte skin, bronze and timber | Clothing tint; explicit texture variant when its pattern differs |
| Equipment | Helmet, armor, sword, shield, bow, quiver and oar modules with named mounts | Actual equipped modules and their transforms |
| Motion | Compatible clip/pose-bank data and interpolation code | Clip, time/phase, placement, role state |
| Rendering | Reused geometry/material resources | Batches grouped by compatible layout, material, motion route and spatial region |
| Champions | Same attachment and rig conventions | Recognizable armor/shield/crest silhouettes and live interaction |

Prefer per-instance clothing tint for a color change. A genuinely different
texture pattern can use an atlas/layer selection or a small set of material
variants if measured costs justify it. Ordinary Three.js
[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) shares geometry
and material and supports per-instance color; arbitrary per-instance texture
selection needs a shader/data design rather than replacing each actor's material.
[BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html) supports differing
geometries with a common material, but it is not a drop-in replacement for Troy's
custom animated transform/vertex playback or qualified shadow path.

Equipment batches contain only equipped actors. A hidden sword or shield should
not remain a collapsed payload in every archer instance merely to unify the model.
Spatial partitions must preserve camera and shadow culling; one giant batch is
not the objective. Keep the interactive two-hero solver separate from crowd bake
playback unless matched evidence justifies a change.

## Work order and acceptance

1. Complete mitt and equipment intake with named mounts, grip profiles and exact
   revision pins. Preserve standalone masters, original parents and role provenance.
2. Audit actual decoded geometry/material/image equivalence across faction and
   role artifacts before claiming resource sharing. Introduce a consumer resource
   pool and role descriptors at verified boundaries; avoid loading duplicate body
   resources when they are exactly equivalent.
3. Rebuild affected motion banks and bounds. Keep different pose routes in
   compatible batches; combining animation banks is a separate experiment requiring
   exact part/clip mapping, motion, shadow and resource proofs.
4. Compare current and proposed full workloads on the quiet hub with matched
   actors, cameras, motion, shadows and quality. Measure startup, memory, CPU/GPU
   tails and draw/batch counts. Adopt only a qualified improvement.
5. Demonstrate reuse on another asset/role, then update maintained authoring and
   integration references with evidence. Keep Troy dimensions and controllers in
   its consumer workspace; do not make this kit mandatory for standalone Kiln assets.

No engine export change or new renderer architecture is presently required by
the evidence. Performance benefit and owner acceptance are pending. This proposal
does not qualify the complete scene, supported devices, or an external deployment.
