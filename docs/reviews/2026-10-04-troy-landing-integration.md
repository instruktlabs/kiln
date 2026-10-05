# Troy landing on the actual scene terrain — 2026-10-04

One galley now has a complete stationary landing prototype inside the Troy scene:
14 pairs of seated crew, sheathed hip swords, a lowering plank, ordered release /
stand / aisle / shore walking, and 28 distinct final positions facing the city.
The hull size remains unchanged. This extends the [fixture checkpoint](2026-10-04-troy-unloading.md),
not acceptance of the whole fleet, animation quality or a public asset release.

## Review entry points

- `http://127.0.0.1:4420/?landing=1&view=landing`: integrated prototype, with pause,
  replay and a time slider. The first six seconds lower the plank with all crew
  still seated. The cautious unloading follows; total scene time is 354.5 seconds.
- `http://127.0.0.1:4421/rowing.html`: the separate full rowing/stroke study.
- `http://127.0.0.1:4421/queue.html`: preserved earlier flat-fixture queue.

The normal 4420 entry still uses the baseline composition. The opt-in replaces
ship `ship-1-2` and its six placeholder soldiers with the new galley and 28 crew:
310 Greeks plus 192 Trojans, 502 ordinary soldiers, two heroes and 12 ships.
The other 11 ships remain older placeholders. No project repinning, public-site
update, commit or deployment is implied.

## Terrain and asset changes

The landing planner crops the original terrain triangles without resampling and
works in a local ship frame at scene position `[54, 0, -8.8]`. A sampled hull /
terrain contact calculation raises the existing scale-1.6 ship by 1.3948 m. This
is kinematic placement, not buoyancy or structural qualification.

The original 3.2 m plank would descend at approximately 57 degrees at this site.
The new plank is 6.4 m long and descends at 24.84 degrees, with its top toe meeting
the terrain. Its underside enters the sand slightly at the toe. The exported
prototype is `p_9d6ec299ab06`, `motion/output/galley-troy-plank-01.glb`, SHA-256
`4bd36f0d7db7efd25f049b1c78c08fc85203552441fe9f027084455cdf7619fa`.
It retains the previous hull, seats, oars and sail; only plank length/supports and
the toe change. Comparison reports 118 unchanged nodes and three expected changes.
Crew remains `p_b465efcee119` / `greek-crew-02.glb`, SHA-256
`85451321e884eb8144da37f6882880ce773634bcd40a64cb49b0a56a91dc1aa4`.
These are exported prototypes, not accepted saved revisions.

## Runtime and evidence

External work lives under
`/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion/`.

- `runtime-lab/evidence/troy-landing-02/schedule.json` retains exact source/input
  hashes and all 28 cached routes. The final formation faces the city and preserves
  actor identity. A floating-point clip-end regression was reproduced and fixed:
  composed timestamps can no longer index beyond the last footstep.
- `runtime-lab/evidence/troy-landing-02/tests-final.tap`: all 48 lab tests pass.
  `scene/evidence/landing-sequence-01/scene-tests.tap`: all 12 scene tests pass.
- `runtime-lab/evidence/troy-landing-02/poses.json`: 39,768 samples across all 28
  actors; no unreachable limbs and maximum solved ankle error about 3.98e-15 m.
  This is pose/contact-target evidence, not full-body collision proof.
- `runtime-lab/evidence/troy-clearance-{fore,aft,mast}-01/clearance.json`: both
  sides of rows 13, 0 and 7, 3,758 start/mid/end-step samples through their final
  staging routes. No strict body/garment intersections against ship, terrain or
  other waiting crew; no planted-sole support failures. Excludes continuous
  sweeps, foot-side contact, coplanar contact, self-collision and moving-crew bodies.
- Staged `scene/web/runtime/landing-v3/` is a hash-checked, 18-file consumer bundle.
  CPU reference posing feeds instanced rigid parts. The lowering phase is separate
  from the cached grounded walk, and reverse seeking restores the correct state.
  Earlier bundles are retained. The old queue uses frozen `unloading-v1` modules.
- `scene/evidence/landing-sequence-01/{webgpu,webgl2}`: eight successful captures
  per backend, no page errors. All crew remain seated during lowering, all 28
  finish ashore, reverse seeking restores the initial state, and replay, pause
  and the time slider work. These are functional checks, not timing runs.
- Earlier integrated WebGPU/WebGL2 comparisons (`landing-integration-02/webgpu`
  and `landing-integration-03/webgl2`) show near-identical instanced / hierarchy
  images at three times. At those views, instancing reduced reported draw calls
  from 3,283–4,105 to 379. This is submission-count evidence, not measured frame
  performance. Early instanced views submit some extra uncullable geometry.

One earlier WebGL browser disconnected before capture; its failed receipt remains
in `landing-integration-02/webgl2`. The subsequent run passed. The disconnect's
cause is unisolated. A preceding connection-refused attempt was resolved after
confirming the local scene server was absent and restarting it.

## Remaining work

Improve the stiff paired-step gait, arm/weight transfer and cloth. Qualify the
lowering plank's continuous sweep and give it believable ropes/latches/handling;
secure parked oars and manage the sail. This scene begins with the ship already
grounded: approach, rowing-to-beaching transition, hull support and departure
logic remain. The shallow water wash covers the first part of the shore route;
surface grounding is checked, but wet-contact presentation still needs polish.

CPU posing, uncullable instances and one-ship coverage are provisional. Bake the
qualified motion, implement range/device policies, then measure the combined scene
under the owner's quiet-machine/minimized-Codex protocol. No timed performance run
was performed for this checkpoint. Complete the fleet/army activity, archery,
heroes/optional duel, city and environment refinement, physical mobile review,
owner visual acceptance and reproducible site release. The full Troy goal remains
active. Experiments remain outside the engine and are not promoted skill defaults.
