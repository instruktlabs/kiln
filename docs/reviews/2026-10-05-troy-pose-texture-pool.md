# Troy pose texture pool checkpoint, 5 October 2026

The default full scene shares immutable pose DataTextures by exact payload SHA-256
and texture descriptor. Greek and Trojan infantry retain distinct source pins,
geometry, materials and equipment while their identical idle matrices use one
texture. Early and late shore crews share one idle texture. Existing row-runtime
sharing is preserved.

| Full scene | Separate registered banks | Shared registered banks |
|---|---:|---:|
| Live pose DataTextures | 7 | 5 |
| Raw live payload capacity | 15,464,592 bytes | 13,020,696 bytes |
| Consumer leases | 12 | 12 |
| Textures after scene release | 0 | 0 |
| Retained pool payload after release | 0 bytes | 0 bytes |

The raw capacity difference is 2,443,896 bytes, or 15.8%. Physical VRAM, total heap
and frame costs are not qualified. The pool owns a canonical admission copy,
retaining 13,020,696 bytes while open; original loader buffers and backend
allocations have separate lifetimes. This figure is not a total memory saving.

The private adapter is scene/web/pose-texture-pool.mjs; infantry uses the new
runtime/rigid-v3 consumer. Rigid-v2, fleet-v1/v2 and authored sources and pose
banks remain intact. Exact admitted manifest/buffer pairs prevent accidental
lease reuse. Layout, half/float type, byte order and mip policy participate in
identity. Pending admission after close fails. The scene owner closes the pool;
active consumers remain valid until their last lease releases.

Two focused tests failed on the baseline, then eight focused checks and all 155
scene tests passed. Checks cover duplicate and changed payloads, concurrent
admission, incompatible layouts, wrong pairs, descriptor drift, retained budget,
close races, both disposal orders and unchanged numerical geometry, material
batches, phases, shadow hooks and actor updates.

Actual WebGPU and WebGL2 scenes were loaded in both modes. Twenty-four captures
cover Greek ranks, Trojan ranks, rowing, shore idle, marching and formed crews.
Twelve matched pairs have identical source pins, counts, actor positions and
reported shore binding matrices. Four native scene releases leave zero leases,
zero live textures, zero raw capacity and zero retained pool payload. Captured
warning/error logs are empty. These are local functional and appearance checks;
sampled positions and visible snapshots do not establish continuous motion or
shadow acceptance.

Exact evidence and source snapshot are in
scene/evidence/pose-texture-pool-01/receipt.json, browser/, source/, red.tap,
focused-tests.tap and scene-tests.tap. The receipt verifies 312 unchanged prior
fleet checkpoint files. Six previous loader snapshots match the prior hashes.
Saved hero, archer, infantry and fleet revisions, motion data and routes are
preserved.

For a matched allocation control use ?poseTextures=separate; default is shared.
The control retains existing sharing among row consumers of a registered bank.
fleetResources=separate separates GLB resources while pose sharing remains
scene-wide; testing separate atlases additionally requires poseTextures=separate.
Prior performance comparisons retain their original code identity and require
fresh runs before making cost claims about this runtime.

Current full-workload shadows, culling transitions, isolated hub/device costs,
startup/failure cleanup and graphics policy remain open. Terrain/ocean/aerial
stability, city routes, unrelated-asset workflow proof, maintained/package skills,
owner appearance/playfeel acceptance and explicitly approved delivery remain in
the active completion plan. No engine runtime was edited. Nothing was committed,
pushed or published.
