# Troy CPU attribution and rigid bounds

4 October 2026. Local scene code lives at
`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion\scene`.
These receipts precede the owner's archer anatomy correction. They do not qualify
the corrected animation's performance or final scene acceptance.

V8 sampling on the quiet hub attributes about 91–92% of sampled crowd-update time
to the shore-fleet update. Within that branch, poses account for roughly 69–70%
on WebGPU and 74–75% on WebGL2; recursive bounds account for about 21–22% and
15%, respectively. Packed archer updating accounts for less than 1% of that
sampled crowd branch. These are profiler attribution samples with overhead,
not unprofiled frame-cost measurements. Raw profiles, exact diagnostic sources,
admission receipts and offline analysis are under `evidence/cpu-attribution-01/`.

`web/rigid-object-bounds.mjs` now caches mesh-local bounding boxes for fixed
topology, rigid geometry. It refreshes world matrices once and transforms each
box through its centre and absolute linear extents. It preserves hidden meshes,
nested and negative scale, and rejects unsupported deforming geometry and stale
position buffers. Callers must reconstruct it after topology changes. Shore and
later-landing controllers use it by default; `bounds=reference` retains the old
recursive path. This is independent of pose solving and changes no selections.

The focused regression was observed failing before implementation. Three tests
cover 728 actor/ship comparisons to reference bounds within 1e-9, transformed
hierarchies, stale buffers and removal of recursive scans. The 89-test checkpoint
passes. Fourteen reference/cached view pairs per backend are pixel-identical,
including unloading, regrouping, later landings and reverse seeking, with exactly
equal selection and actor records. Receipts are in `evidence/bounds-check-01/`.

Four unprofiled admitted hub blocks retain 360 warmed samples in three views per
backend/mode, at 1440 × 900 over the first 6.33 scene seconds. They are readback
paced, with one block per mode, and do not establish natural frame pacing.

| Backend/view | CPU update reference → cached, ms | CPU update + submission reference → cached, ms |
| --- | --- | --- |
| WebGPU archer | 12.27 → 10.39 | 21.41 → 19.52 |
| WebGPU wall | 12.09 → 10.77 | 21.18 → 19.92 |
| WebGPU aerial | 12.62 → 10.92 | 22.48 → 20.64 |
| WebGL2 archer | 9.89 → 9.56 | 21.73 → 20.94 |
| WebGL2 wall | 9.98 → 9.59 | 21.62 → 21.06 |
| WebGL2 aerial | 9.89 → 9.60 | 22.06 → 21.65 |

CPU work remains above 16.67 ms. GPU changes cannot be attributed to this CPU
bounds repair; draw selection is unchanged. Raw timings, tails, before/after quiet
checks, summary and exact stage archive are under `evidence/bounds-perf-01/`.
The frozen hub stage is `troy-bounds-perf-01`; original workspaces remain intact.

Continue with the corrected archer candidate's own identity, complete equipment,
shadows, resource/startup and culling review, then remaining action/routes.
Profiled shore pose work is the next measured CPU lead, not permission to trade
away close motion quality. Natural pacing, full late workload and supported-device
targets remain open. No engine runtime or shared skill behavior changed here.
