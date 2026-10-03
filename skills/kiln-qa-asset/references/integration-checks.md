# Integration checks

These library APIs run in the destination project's TypeScript toolchain, not inside generated `.kiln.js` source. Use the project's installed Kiln package; do not copy engine implementation into the asset workspace.

`inspectGlbIntegration(bytes)` from `@kiln/engine/render` reads the actual GLB and returns an integration manifest or `undefined` when no usable scene bounds exist. Check that result before using bounds, axes, ground correction, structural findings, or artifact hash.

Kiln authors metres, +X forward, +Y up, +Z right. Confirm importer conversion in the destination. Ground correction must be applied in the frame it describes, especially under rotated/scaled parents. Bounds alone cannot prove that feet, wheels, or collision geometry make the intended contact.

## What to measure

| Question | Evidence |
|---|---|
| Did the intended file load? | Resolved asset path, parsed GLB, content hash/manifest |
| Does its size and orientation fit? | Scene comparison, importer transform, world-space bounds |
| Are materials correct? | Destination lighting and texture review; material-faithful Kiln view where available |
| Does it move correctly? | Named clip, intermediate poses, transitions, attachments and relevant controls |
| Can it be used in the scene? | Collision, reachability, interactions and contact under real placement |
| What does it cost? | Loading, geometry, draw calls, textures and representative-device measurements |

Source refs name source revisions. They do not identify arbitrary externally modified GLB bytes. Track the exact exported file used for integration.

`composeSceneGLB` defaults to static composition (`keepAnimations: false`). Explicitly keep animations when required. Its material optimization policy can change scene material organization; choose it deliberately, then inspect the result. Warnings can report skipped inputs, so successful export alone does not prove every required asset was included.

Do not invent a universal performance cap. State the destination, tested conditions, and material limits of the evidence.

## Functional fit

For an enterable building or gate, test the intended actor through the exported
opening with collision enabled. Include thresholds, plinths, lintels, trim and
hinge travel. The open leaf and nominal wall dimensions do not prove passage.
Check the closed state blocks where intended, the opening sweep clears its
surroundings, and the open state admits the actor. Repair obstructing asset
geometry at its source rather than disabling the building's collision to pass.

For an operator and machine, inspect the actual seated pose with the controls at
their relevant extremes. A seat socket proves an attachment transform, not body
clearance or reach. Distinguish a demo controller's pose from clips included in the
asset download. Limb joints need intermediate-pose views as well as endpoint
closure; flush rest-pose joins can separate or expose caps during motion.

For a payload transfer, test the actual payload against the full gripper housing,
jaws and carrier, including pin/groove alignment and opening clearance. Matching
attachment transforms or contact at the endpoints does not establish a valid
transfer. Sample the approach and release paths with the destination's actual
interpolation, changing attachment ownership at the intended handoff. Check for
penetration and visible jumps immediately before and after that change. Record the
sample spacing and clearance tolerance; discrete samples alone do not prove a
continuous collision-free sweep. Keep controller logic and scenario dimensions in
the destination workspace, then recheck the exact repaired asset revision.

After batching, compression or other optimization, verify named moving nodes,
attachment transforms, clips and material appearance again. Treat the optimized
file as a derivative with its own hash and keep the editable source and baseline.

## Performance evidence

In builds that provide it, `drawDiagnostics` appears in `kiln_inspect` compact/full
results, `kiln_export`, and CLI export JSON for GLBs/bundles. It is advisory output,
not a QA rule or acceptance result. Read `status` and `reason` first: `input-limit`,
`unreadable-glb` or `analysis-failed` means no assessment. An absent field in an older
installation or a lean response is not a clean result.

Read `scope` and `mergeEstimate.method` with the numbers. These are static single-pass
primitive counts across document scenes with node visibility, without culling,
alternate LOD selections, shadows, reflections, depth or other renderer passes.
The estimate uses current materials and the rigid merge's layouts, boundaries,
locks, byte budget and vertex splits; it excludes palette consolidation and
instancing, so it does not predict complete `full` output or GPU speed. Check
`mergeEstimate.skipped` and rejected buckets. Compare per-anchor `draws` and
`afterRigidMerge` by ID, and report `anchors.omitted` when the listing is truncated.
Measure actual destination draws by anchor, material and pass after export, then
exercise the interactions and attachments those anchors protect.

Read each observation's `evidence` and sampling/omission counts.
`mirroredTangents` identifies static tangent-bearing parts with mirrored transforms;
it does not establish a shading defect. `coplanarParts` samples triangle overlaps
between parts; it neither proves visible z-fighting nor clears unsampled faces.
Skinned, morphed and GPU-instanced uses are unexamined by these observations.
Review candidate surfaces and normal-map lighting in the destination before
changing geometry or material behavior.

Separate cold loading/compilation and first interactions from warmed playback.
Record actual renderer/backend, versions, resolution, quality and representative
instances. Distinguish CPU submission/update time, browser frame intervals and
GPU query time. GPU queries must identify fresh samples; unsupported, stale,
disjoint or failed queries are unavailable, not zero or substituted CPU time.
These measurements do not establish displayed-frame latency. Concurrent work on
the machine makes acceptance data suspect even if a small functional test passes.
