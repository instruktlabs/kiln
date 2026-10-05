# Troy implementation: first working checkpoint

3 October 2026. The full [production goal](../plans/2026-10-03-troy-scene-production-plan.md)
remains active. This checkpoint is concrete progress, not completion or release
acceptance. Source work lives in the private evidence repository under
`review/troy-expansion/`; no engine runtime, default build or public site was changed.

Subsequent evidence: the [GPU playback follow-up](2026-10-03-troy-gpu-playback.md)
implements and compares the next prototype. Unimplemented wording below describes
this earlier checkpoint, not the latest adapter state.

## Scene blockout

A fresh `scene/` workspace was created with the maintained compose skill and
verified capabilities against its configured runtime. Fourteen saved GLBs were
staged with exact hash checks, including the approved plants and repaired horse
(the horse is available but not placed in this blockout). Deterministic layout
contains 480 ordinary soldiers, two heroes, 12 ships, 80 wall/gate placements,
529 buildings and 74 plants. Unit tests cover population conservation and unique
IDs, the city enclosure/central route, beach elevation continuity, hero clearance
and repeatability.

`scene/scripts/serve.mjs` serves `http://127.0.0.1:4420/`, separate from the earlier
site preview on 4412. Seven viewpoints support review of the sea approach, beach,
heroes, wall, city, aerial layout and courtyard. Exact inputs and source identities
are recorded in `web/inputs.json` and the capture receipts.

The first GPU images exposed sparse housing and overly dominant mountains. The
second blockout increased city density, raised the interior skyline, moved the
mountains farther back and batched foundation pads. WebGPU and WebGL2 each captured
four review views without page errors on the NVIDIA adapter. Arrival-view counters
record 163 main draws and 1,745,311 submitted triangles. These are static counts
without animated crowds or shadows; no frame-rate improvement is claimed.

`scene/evidence/blockout-04/{webgpu,webgl2}/receipt.json` binds source hashes and
records successful rendered touch emulation at 390×844: drag changes orbit without
zoom drift, spreading fingers moves closer, and pinching moves farther away.
This is an OrbitControls blockout, not the final third-person controller, and
emulation is not physical-device qualification. Browser processes closed after
the checks. The preview server remains available for review.

Preserved earlier evidence: `blockout-01` includes a favicon 404; `blockout-03`
includes a capture-harness readiness failure because changing mobile emulation
reloaded the page. The harness now waits for scene readiness after each change.
Neither earlier failure was erased or relabeled as a pass.

## Standalone animation-bake experiment

`runtime-lab/scripts/bake-animation.mjs` is now implemented as an opt-in CLI with
explicit GLB, clip, sample rate, precision, output directory and Three install
arguments. It writes part-transform texture bytes and a manifest recording input,
generator and output hashes, layout, frame convention, source coordinate frame,
sampled bounds and limitations. It preserves the source GLB and does not require
a Kiln project or asset ID. Output directories must be new.

Five focused tests pass: inherited translation/rotation and source preservation;
half-float packing/decoding; invalid clip/sampling/budget and morph rejection;
shear rejection; and rejection of half-float scale underflow that would collapse
geometry. The last test was observed failing before the guard was implemented.

Actual saved soldiers bake to 52,416 bytes for 91 idle samples at 30 Hz; a Greek
attack bake uses 104,256 bytes for 181 samples at 120 Hz. A repeated idle bake is
byte-identical. Artifacts and receipts are in `runtime-lab/output/`. The prior
offline pose-error study remains distinct in `character-study/`.

This first baker supports rigid parts only. Skin/bone and vertex modes, compressed
intake, GPU playback, sampled-source visual comparison, continuous bounds,
attachments, shaders and shadows are not implemented or qualified. Binary sizes
are not GPU performance evidence. Generic fixtures exercise the module, but
multi-family consumer reuse is still pending.

## Completion audit at this checkpoint

| Goal requirement | Current evidence / remaining work |
| --- | --- |
| Cohesive full-scale environment | Working blockout and camera captures; uniform housing, foundations, wall joins, terrain/water, lighting and city access still require refinement and owner review |
| Landing, animation, contacts and duel | Static placements only; wall figures are archer stand-ins. No claim of motion, supported ship transfer, equipped archery or paired duel |
| Correct range representations | Static instancing baseline and rigid bake artifact; GPU candidate comparison, mesh LODs, VAT and impostors remain work |
| Vegetation workflow | Approved exact assets placed; no reduced-geometry/impostor bake/runtime selection yet |
| Reusable standalone tools | First explicit CLI and tests exist; preview/qualification manifests and additional bake families remain work |
| Desktop/mobile controls | Blockout orbit and touch emulation pass; final scene shell, movement, obstacles and physical devices remain unqualified |
| Skill integration | Current guidance used; no new workflow advertised in maintained skills before consumer proof |
| Owner visual acceptance | Approved plants/body shape retained; no new scene composition/final scene acceptance received |
| Reproducible site release | Source and staged input hashes retained; project repinning, full scene package, site integration, release gates and Cloudflare deployment remain pending |

Next: implement GPU part-transform playback in the consumer lab, compare it with
the exact original soldier clips on both backends, and begin independent vegetation
geometry/card/multiview candidates. Continue refining the blockout and build one
complete landing/battle/city slice before scaling the full experience. The goal
must not be marked complete based on this checkpoint.
