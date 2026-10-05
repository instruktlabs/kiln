# Troy character rendering: candidate comparison

Requested 3 October 2026: explore VATs and octahedral impostors **for characters**.
This is a scoped investigation, not adoption, a measured performance result or a
change to the standalone asset/export contract.

The broader [production plan](2026-10-03-troy-scene-production-plan.md) expands the
candidate set to skeletal animation textures, reduced animated geometry, pose
caches and distant formation proxies; compares vegetation representations; and
defines opt-in tooling outside the core toolchain. This document retains the
measured offline soldier evidence. No GPU winner has yet been established.

Subsequent evidence: the [crowd runtime checkpoint](../reviews/2026-10-03-troy-crowd-runtime.md)
records the GPU/CPU comparison and provisional desktop formation choice. Unproven
GPU wording below describes this original offline investigation, not current code.

## Starting evidence

The saved Greek and Trojan manifests each report 24 draws, 16 unique geometries,
three materials, six textures and no skinning. They use rigid articulated parts.
The proposed 288 Greeks and 192 Trojans total 933,120 source triangles and 11,520
naive character draws before heroes/shadows. Draw and animation overhead therefore
deserve measurement before assuming polygon reduction is the main solution.

The scene kit already has compatible rigid merging and static/dynamic instancing,
but the inspected scene code has no character VAT or octahedral-impostor pipeline.
Installed Three.js 0.186.1 NodeMaterial exposes custom vertex and shadow positions;
this supports a prototype path, not proof of WebGPU/WebGL2 parity.

## Compare these candidates on the same saved soldier

Read-only inspection of the actual saved GLBs now gives the following sizing for
their three-second idle clips at 30 fps (91 samples, unpadded RGBA16F):

| Character | Drawable vertices | Mesh parts | Full position/normal VAT | Part transform texture |
| --- | ---: | ---: | ---: | ---: |
| Greek soldier | 5,462 | 24 | 7.584 MiB | 51.188 KiB |
| Trojan soldier | 5,042 | 24 | 7.001 MiB | 51.188 KiB |
| Hector | 6,094 | 25 | 8.462 MiB | 53.320 KiB |
| Achilles | 6,465 | 27 | 8.977 MiB | 57.586 KiB |

These are per-character-type/clip resources shared across instances, not a cost
multiplied by every soldier. GLB inspection also confirms the 1.5-second attack
clips and lack of skins/morphs. This makes part-transform textures the first
candidate to prototype; it does not prove interpolation correctness or frame time.
Script and hashed artifact receipt: private evidence repository
`review/troy-expansion/character-study/{analyze.mjs,artifact-sizing.json}`.

An offline follow-up loaded those exact two soldier GLBs and reconstructed their
poses with simulated half-float part transforms, linear translation/scale and
quaternion slerp. It checked every drawable vertex at three off-grid times per
bake interval against the exported clip evaluated by Three.js. The maximum errors
for both soldiers were:

| Bake rate | Idle positional error | Attack positional error | Attack normal error |
| --- | ---: | ---: | ---: |
| 30 fps | 1.00 mm | 54.10 mm | 2.06° |
| 60 fps | 1.00 mm | 14.14 mm | 0.51° |
| 120 fps | 1.03 mm | 3.86 mm | 0.13° |

The fast sword tip produces the attack maximum. Transform decomposition residuals
were below 6.1e-8, so sampled poses do not expose a significant shear obstruction
for these assets. Thirty samples per second is a useful idle prototype; fast clips
need denser/adaptive sampling or a different reconstruction. At 120 fps the current
1.5-second attack's part transforms are still about 102 KiB before padding. These
are finite sampled CPU results, not a continuous bound, GPU shader test, visual
acceptance or benchmark. Shadows, clip transitions, new locomotion/archery and
WebGPU/WebGL2 remain untested. See `check-transform-bake.mjs` and the retained
`transform-bake-fidelity*.json` receipts in the same evidence directory.

| Representation | Intended use | Main question |
| --- | --- | --- |
| Full rigid-joint animation | Heroes, nearby soldiers, deck transfers, interaction | Reference motion, contacts and appearance |
| Instanced rigid parts with shared phase groups | Baseline for formations | How much does existing batching already save? |
| Baked part-transform texture, merged per material | Middle-distance formations | Can per-part translation/quaternion/scale beat full VAT memory without excessive vertex shader work? |
| Full vertex animation textures | Middle-distance formations | Does simpler vertex lookup outperform part transforms on target devices? |
| Animated octahedral impostors | Very distant characters | Are atlas memory, transparency overdraw and orbit transitions worth the triangle savings? |

The part-transform candidate fits these assets better than assuming a skinning rig
exists. Every derivative vertex retains a part index; sampled transforms come from
the exact exported clip, with correct normal/tangent transforms and interpolation.
Generate these attributes in the scene build pipeline, not by silently expanding
Kiln's GLB attribute/export contract. Keep original source, GLBs, clips and sockets.
No Houdini installation is required to investigate baking the existing GLB clips.

For scale only, not measurements: 2,048 vertices × 60 frames × two RGBA16F textures
is 1.875 MiB before padding, whereas 24 parts × 60 frames × three RGBA16F texels is
33.75 KiB. The actual vertex/part count, clip length, interpolation and packing must
be measured. Animated impostors multiply view and time samples: 64 directions ×
16 animation frames × 128² pixels × two RGBA8 textures is 128 MiB before mipmaps,
compression and padding, per appearance/clip. A billboard is not automatically cheap.

## Correctness and bounded performance experiment

Use one Greek source/idle clip first, then the walking/landing and archer clips
when authored. Preserve actor identity, clip time, per-instance phase, facing,
root movement and attachments across representations. Near heroes and active
boarding actors remain full 3D. Choose transitions by projected size and measured
error, with hysteresis and a bounded blend, rather than a single arbitrary distance.

Compare 128, 480 and a 1,000-character stress case in a small isolated scene with
the same camera path, light, resolution and shadow policy. Short warmed samples
with targeted repeats are sufficient for the first selection; no broad long audit
unless failures or unstable timing require it. Record startup/compile latency,
CPU frame work, GPU timing where reliable, main/shadow draws, submitted triangles,
resident textures, downloads and overdraw. Count failures and unsupported timing
explicitly. Do not raise the promised crowd size merely because a synthetic case runs.

Required visual checks: frozen-time camera orbit across impostor view boundaries,
high-angle/top views, silhouette edges, alpha cutouts, depth overlap between ranks,
clip loop and transition continuity, bow/shield consistency, normals, matching
animated shadows and conservative bounds over the whole motion. Shader-driven
animation must explicitly invalidate or use the live shadow route; matrix-only
motion tracking cannot see texture-driven motion. View changes must not produce
the sort of snapping previously investigated on bridge water.

Test the actual WebGPU renderer and its WebGL2 fallback. Prefer texture sampling
over compute/storage-only assumptions for the common path; verify support rather
than declaring portability from TSL syntax. Keep physical mobile qualification
separate. Reject impostors if their quality/memory tradeoff loses to animated meshes.

## Repeatable derivative workflows

The owner requested reusable workflows for vegetation impostors and character
animation baking, rather than a one-off Troy conversion. Prove the smallest
working path first; promote its measured contract and tools after qualification.

Both workflows take an exact saved source revision and material hashes, preserve
the canonical GLB, and emit a derivative manifest with generator/settings identity,
bounds, coordinate conventions, resource sizes and validation receipts. Changed
source or settings invalidate the derivative. Scene integration chooses the LOD
and shadow policy; standalone asset delivery must not require these derivatives.

- **Static vegetation impostors:** capture reviewed source views, bake an atlas
  with alpha and suitable depth/normal data, retain ground pivot and full bounds,
  then compare frozen-time orbits against the full tree at the intended projected
  size. Test canopy edges, near-overlap, top views, mipmaps, shadows and transition
  stability before choosing atlas resolution, directions and compression.
- **Character animation baking:** inspect rigid parts versus skin/morph animation,
  enumerate clips, choose part-transform or full-vertex baking, measure temporal
  error against the exact source, and export shared textures plus per-instance
  clip/time/phase controls. Clip density follows measured error, not one universal
  sampling rate. Keep attachments and actor identity through LOD changes.
- **Animated character impostors:** a separate extension of static capture, with
  view × animation-frame atlases, matching clip phase and explicit transition
  tests. Its memory and alpha overdraw can outweigh geometry savings; do not make
  it a required final stage if instanced animated meshes perform better.

For large armies, rendering and simulation are separate budgets. Use spatial
formation chunks for culling and coarse movement, with individual path/contact
updates for nearby actors and active landing routes. Heroes retain individual
animation and interaction. Keep stable soldier identities and deterministic phase
variation, avoiding a synchronized crowd or hundreds of unnecessary full mixers.
Do not promise thousands of fully interactive agents from a rendering-only result.

The next bounded prototype compares ordinary instanced parts against merged
part-transform animation on one existing soldier before adding full VAT or
animated impostors. Qualify the simpler static vegetation workflow independently.
These workflows are planned; only the offline sizing/reconstruction experiments
above have run so far.

## Primary references checked

- [SideFX VAT documentation](https://www.sidefx.com/docs/houdini/nodes/out/labs--vertex_animation_textures-3.1.html):
  GPU animation, per-instance variation, memory/interactivity limits and transform
  texture alternatives. Its shipped shaders are not a Three.js integration.
- [Three.js NodeMaterial](https://threejs.org/docs/pages/NodeMaterial.html):
  custom vertex/shadow position hooks; local pinned source also inspected.
- [Andrea Gargaro's octahedral-impostor implementation](https://github.com/agargaro/octahedral-impostor):
  MIT-licensed, explicitly marked work in progress. Study the capture/sampling
  approach; do not treat a static-object demo as an animated character solution.
- [Ctrlmonster's Three.js implementation](https://github.com/Ctrlmonster/three-octahedral-impostor):
  another work-in-progress reference for octahedral view selection.
