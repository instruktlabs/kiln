# Troy rigid-animation GPU prototype

3 October 2026. Follow-up to the [first implementation checkpoint](2026-10-03-troy-implementation-progress.md).
The full [production goal](../plans/2026-10-03-troy-scene-production-plan.md) remains
active. This proves a narrow consumer rendering path, not crowd capacity, completed
motion, owner acceptance or release readiness.

## Implementation and evidence

Source and immutable capture receipts live in the private evidence repository at
`review/troy-expansion/runtime-lab/`. The existing blockout remains separate on
port 4420; the comparison preview is on port 4421. No engine runtime, maintained
skill, default build, canonical GLB or deployed site was changed.

`src/rigid-geometry.mjs` retains mesh-local vertices and stable part indices while
merging parts by original material. `src/rigid-playback.mjs` samples the rigid TQS
texture in a Three 0.186.1 node material, interpolating translation/scale and
shortest-path quaternion rotation. Actor phase, rotation and positive nonuniform
scale are independent. The adapter transforms normals and tangents, retains source
material maps and supplies a separate animated shadow-position node. Culling is
disabled until a continuous bound is qualified; actor matrices are fixed at
construction in this version. Unique IDs, finite phases and supported transforms
are checked before allocation.

The preview checks the original GLB and transform-byte hashes. Capture receipts
bind the renderer source, bake, browser and backend; each frozen viewpoint records
original, baked and repeated-original images. Ten unit tests pass, covering bake
reconstruction/intake, source preservation, material batching, part identity and
unsupported inputs. Geometry and actor-intake tests were observed failing before
their implementations.

Final source-material captures:

| Capture directory under `evidence/` | Input / scope | Result |
| --- | --- | --- |
| `playback-09-greek-final/{webgpu,webgl2}` | Greek attack, 120 Hz half-float bake, three actors with different phase/rotation/scale | Three frozen views per backend; no browser errors; original and baked shadows present |
| `playback-09-trojan-final/{webgpu,webgl2}` | Trojan idle, 30 Hz half-float bake, same actor variation | Three frozen views per backend; no browser errors; original and baked shadows present |

Each final three-actor view records 146 original versus 8 baked total draw calls,
including shadow rendering and the comparison environment. This is draw reduction,
not measured frame-time improvement. Greek attack data is 104,256 bytes; Trojan
idle data is 52,416 bytes, shared by instances. Geometry/material residency and
combined-scene costs are not included in those binary sizes.

All repeated-original screenshots in the final set are pixel-identical. Across
the twelve final source-material pairs, mean absolute RGB error is 0.02243–0.04360
on a 0–255 scale, and 0.077–0.144% of image pixels differ by more than 8 in any
channel. These are whole-frame statistics with substantial background; they do
not establish a silhouette tolerance or guarantee invisible close-range errors.
The reviewed images show matching poses, materials and shadows at the sampled
views, but continuous motion and distance thresholds remain to be qualified.

## Defects found and retained evidence

- `playback-01` recorded cumulative renderer calls instead of per-frame draws.
  Those counts are invalid for comparison; later captures use `render.drawCalls`.
- The first adapter transformed part tangents but missed the actor transform.
  A strong tangent-space normal diagnostic made the error measurable in
  `playback-05-normal-before`: middle-view mean RGB error was 0.96721/255.
- Adding separate actor-column buffers exceeded WebGPU's eight-vertex-buffer
  limit. `playback-06-normal-after` retains the pipeline validation errors and is
  not accepted evidence. Interleaving actor columns and phase resolved that limit.
- Corrected diagnostic captures are `playback-07-normal-after/webgpu` and
  `playback-08-normal-final/webgl2`. Middle-view mean error fell to 0.02783 and
  0.02796 respectively, with repeat noise zero. Diagnostic materials were changed
  only in memory; originals were preserved.
- Capture runs now return a nonzero process exit for collected browser errors as
  well as navigation/runtime exceptions. All capture-owned Chrome processes were
  closed; the preview server remains available.

## Remaining work and next gate

Compare continuous motion, clip/loop transitions and the ordinary instanced-part
baseline before selecting the formation renderer. Measure bounded warmed 128/480/
1,000-actor workloads, including the combined scene; these three-actor snapshots
are not a performance audit. Add actor movement, stable attachments, bounds and
chunked culling, then requalify new walk/landing/archer clips. Skin/bone/VAT modes
and animated impostors remain candidates, not implemented capabilities.

The vegetation comparison still needs reduced opaque meshes followed by justified
card/multiview candidates. The static scene blockout still needs refinement and
owner review, followed by the complete landing/battle/city slice. Physical mobile
qualification, reusable non-Troy consumer proof, skill integration, site delivery
and Cloudflare publication remain open. Do not mark the production goal complete
on this prototype evidence.
