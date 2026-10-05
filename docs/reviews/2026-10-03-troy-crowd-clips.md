# Troy independent crowd clips and fore-deck probe

3 October 2026. Follow-up to the [saved locomotion prototype](2026-10-03-troy-locomotion.md).
The production goal remains active. These are external consumer experiments;
the main preview on 4420 remains the previously staged idle population.

## Independent animation in one crowd group

The runtime lab now assembles compatible rigid-part bakes into one in-memory
texture atlas and selects a fractional frame independently for each actor. It
rejects mixed source identities, mismatched parts/formats, duplicate clips and
excessive texture budgets before GPU allocation. Pose updates validate a complete
batch before changing it, preserve fixed actor IDs, and clamp or loop within the
selected clip. This does not add general crossfading, skins, VATs or impostors.

`createRigidClipPlayback` shares geometry/material merging, normal/tangent handling,
shadows and transform updates with the existing single-clip adapter. `updateActorPoses`
changes clip/time by ID; the separately validated actor-transform API moves actors.
A consumer `locomotion-sequence.mjs` applies explicit root-displacement polynomials,
checks velocity compatibility at joins, and schedules finite start/walk/stop/idle
sequences. Settled actors do not secretly teleport or recycle. Original phase-zero
start/stop requirements still apply; arbitrary-phase stopping is not implemented.

The Greek prototype's idle/start/walk/stop bakes use 36 parts and 559 atlas rows,
965,952 bytes of RGBA32F data in total. Idle is sampled at 60 Hz and new clips at
120 Hz, with terminal samples retained. The frame-rate labels are requested rates;
manifests record the exact effective intervals.

## Evidence and limits

- Five new focused tests were observed failing against stubs, then passing. All
  26 runtime-lab tests pass. Tests cover atlas boundaries, source/part guards,
  atomic pose updates, persistent identities, root-distance joins and invalid
  speed contracts.
- `evidence/motion-bake-07/numeric.json` compares every exported mesh vertex at
  approximately 240 Hz with shader-equivalent TQS reconstruction. Worst observed
  vertex difference is 0.835 mm on a tunic panel; foot-bound height difference is
  below 0.120 mm. This is sampled parity, not continuous collision proof.
- `evidence/multiclip-01/` covers both backends with original materials and a
  strong normal-map diagnostic: five sequence times, source/baked/repeat-source,
  three staggered actors and shadows. All four runs passed without page errors;
  live playback reached the settled state. Repeat-source pixels are identical.
  Baked whole-frame mean channel error is below 0.00133/255 across those captures;
  the metric is descriptive, not a visual acceptance threshold.
- The isolated comparison reports 218 total source-hierarchy draws versus eight
  baked draws, including its ground/shadow passes. These are counts, not FPS.
  The earlier 1,000-actor timing does not qualify this new per-actor update path.
- `multiclip-single-regression` retains the old single-clip source/baked/CPU
  comparison with moving actors and strong normal maps on both backends, without
  page errors. The currently staged scene runtime was not overwritten.

## Galley passage and deck support

Inspection contradicted the old galley's source comment about a clear central
passage: measured upward support on its fore centreline alternated between
1.05 m footboards and 1.565 m bench tops. A separate child adds a raised removable
fore passage seated on the existing benches, plus two short steps to the bow
platform. The original four meshes retain identical vertex/index data and world
transforms. The new passage is one additional mesh and 36 triangles.

Saved galley child: `r_fb2434699ed34f93aa0a1bc75996c3ad`, parent
`r_89ac2dc4345d47d4b10a99d8e4bf34f7`, asset
`a_582ae189884340d7ac23a1a23bd7bcc8`. It independently rebuilds byte-for-byte,
400,112 bytes / 6,516 triangles, SHA-256
`470249a7582a4ab35ad48a5ea45af61095c737e01e729b0e36012415b2547a62`.
Material-faithful contextual close-ups were reviewed. It remains a landing
prototype, not owner acceptance of the complete ship/shore interaction.

`evidence/deck-motion-01/` shows three persistent actors advancing along the raised
fore passage in both source and baked modes, on both backends. The separate
`deck-motion-numeric-01` check samples each route 1,681 times, raycasting actual
upward ship triangles beneath each foot. No support is missing; maximum measured
stance-foot discrepancy is below 0.088 mm. This test stays on the flat passage.
Bow stairs, hull/rigging/equipment clearance, moving ships, a disembark ramp and
general terrain remain unqualified. Do not treat support rays as full-body collision
evidence.

Interactive probes:

- `http://127.0.0.1:4421/multiclip.html` — independent source/baked clips.
- `http://127.0.0.1:4421/multiclip.html?deck=1` — fore-deck movement.

## Owner correction and next boundary

The owner subsequently rejected the standing, drawn-sword central-plank layout.
The saved passage child is diagnostic history, not an accepted interior.
[The rowing correction](2026-10-03-troy-rowing-layout.md) takes priority: keep the
ship size, fit two seated rowers per row, sheath hip swords, rework floor/seats/oars
and lower a plank for single-file transfer to shore.


Rework and qualify the crew/interior first, then connect a physically supported
shore exit and terrain-aware foot placement for nearby landing actors. Keep one actor roster through aboard,
transfer, staging and formation. Reuse baked playback where its contact assumptions
hold; near transfer motion can require the original hierarchy and support-aware
joint correction. Qualify that boundary before scaling the landing activity or
repinning the main scene. Archery, hero duel, culling/LOD, device qualification,
owner review and scene/site publication remain open. No new timed performance run
was performed; the owner-requested quiet-machine/minimized-Codex protocol still
applies before any later timing.
