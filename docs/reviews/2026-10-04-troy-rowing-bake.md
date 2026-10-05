# Troy rowing bake and fleet playback checkpoint — 2026-10-04

A fleet playback study now renders 12 ships and 336 seated rowers, preserving the
28 row/side variants on each ship. Crew animation uses a shared 4.02 MiB GPU
transform atlas and three material batches. Ship parts are instanced in 40
batches. Baked playback does not run character IK each update.

<http://127.0.0.1:4421/rowing-bank.html?ships=12>

This is a rowing-only comparison environment with reference/baked modes and
staggered ship phases. The full Troy scene on 4420 still has one active landing
ship under `dryshore=1`. The fleet study does not establish final scene capacity,
frame rate, range/device policy, or integrated fleet arrival/unloading.

## Representation and reusable work

The existing rigid-part baker now supports a procedural pose sampler as well as
AnimationClips. It samples a cloned hierarchy, validates TQS decomposition,
includes endpoints, retains mesh identity and releases the sampler after success
or failure. The sampler contract permits transform changes only. Explicit origin
rebasing is carried per clip through the bank and GPU playback; the origin is
restored before the actor's instance transform and in the shadow path.

These are external experimental utilities under `troy-expansion/runtime-lab/src/`:
`rigid-bake.mjs`, `rigid-clip-bank.mjs` and `rigid-playback.mjs`. Focused tests were
observed failing before the new behaviors were implemented. Existing baked
AnimationClip and clip-switching tests continue to pass. Nothing was added to the
engine toolchain or installed skills. The preceding generator versions are kept
under `evidence/rowing-bake-01/` for historical bake reproduction.

The scene adapter `scripts/bake-rowing-bank.mjs` bakes the existing contact-solved
rowing controller at 30 Hz: 28 three-second clips, 91 frames each, 69 mesh parts.
One atlas has 207 × 2,548 RGBA texels. The editable ship/crew GLBs are unchanged.
The runtime reuses the same geometry, textures and actor IDs. Each ship has its
own phase; crew within a ship remain synchronized with its oars.

## Precision experiment

All three options were compared against the same procedural poses at quarter-frame
intervals: 10,108 poses and 5,579,616 mesh-bound corner samples per candidate.
These samples bound mesh-position error at the tested instants, not over all time.

| Storage | Animation bytes | Maximum mesh-bound error | Maximum hand error | Maximum ankle error | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| Float32, ship coordinates | 8,438,976 | 0.864 mm | 0.173 mm | 0.000379 mm | Retained reference candidate |
| Float16, ship coordinates | 4,219,488 | 8.459 mm | 7.958 mm | 4.010 mm | Fails the close-contact thresholds |
| Float16, centred at each seat | 4,219,488 | 0.998 mm | 0.721 mm | 0.472 mm | Current rowing candidate |

The origin change removes large fixed ship coordinates from the compact values;
it does not change source poses or loosen the thresholds (5 mm mesh bound, 2 mm
hand and ankle). The compact loop endpoint matches within numerical noise.
Origin rebasing is useful for stationary motions; long-travel clips still need
separate root tracks, segmentation or higher precision and their own evidence.

Current external output: `runtime-lab/output/rowing-bank-seat-01/`.
Transform payload SHA-256:
`a65b6a454a420a7b7d8c19d5c64af68857b9a118643b5840ba6771bda69fc4fc`.
Crew source remains `85451321e884eb8144da37f6882880ce773634bcd40a64cb49b0a56a91dc1aa4`;
ship remains `5681307bf29432b26c82f2625ef6deb0fb1e0dcb3b2866a5043b2e9d9caa39cf`.
`bank.json` binds source, rig, generator and data identities. Repeated CLI outputs
use new directories; old candidates remain available.

## Runtime evidence

`runtime-lab/evidence/rowing-bake-seat-01/` contains interpolation results,
provenance, all 67 passing lab tests, and browser receipts. WebGPU and WebGL2 each
have 14 successful captures: one-ship close views at fractional phases and the
loop boundary, plus 12-ship wide/close views, both reference and baked. Actor IDs
remain unique, the correct backend/mode is confirmed and the baked path records
zero character IK evaluations. Material, shadow and close rowing images were
inspected. Pixel comparisons exclude the controls: the 12-ship wide pair differs
by >10 channel levels in 909 pixels on WebGPU and 737 on WebGL2, and by >40 in
134/84 pixels. Close comparisons have small interpolation/quantization differences;
these are not bit-identical renders. Exact per-view counts are in `parity.json`.
The studio's water plane is a display aid, not wave/contact evidence.

The renderer reports 88 draw calls for the baked 12-ship study, including its
shadow pass. The unmerged reference hierarchy has far more submissions; that is
not a comparison against the previous 69-part CPU-instanced landing renderer.
The baked groups currently disable frustum culling and still submit off-camera
crew; close reference views may cull geometry that the baked view submits.
Draw counts and fewer IK evaluations do not establish a frame-time improvement.
No timed performance run was conducted. The comparison page also retains CPU
reference rigs in memory for switching modes; production memory is unqualified.

## Next integration and full-goal status

Use this bank during the existing arrival, preserving the handoff to hand release,
standing and shore walking at the seated recovery pose. Then extend ship/crew
identity, phase and terrain-bound placement to the fleet. Keep close control paths
and distant baked representations synchronized; establish culling/LOD and device
policy through bounded measurements after visual/contact checks. Full-Troy timing
must follow the quiet-machine/minimized-app protocol.

Still outstanding: convincing equipment handling and hull/wave contact, fleet
arrival/unloading/staging, army/archer and hero motion, optional duel, remaining
city/environment refinement, VAT/bone/impostor comparisons where useful, vegetation
range transitions, physical mobile and owner review, and reproducible Cloudflare
release. The full goal remains active.
