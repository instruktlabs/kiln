# Troy continuous shore transfer and crew queue — 2026-10-04

The stationary galley prototype now unloads all 28 seated crew into distinct shore
positions. Each actor keeps its original seat/side ID, releases the oar, stands,
steps into the aisle, turns, follows the mast/exit route, walks the sloped plank
and finishes on the beach. Swords stay sheathed at the hip. This extends the
[rowing and interior checkpoint](2026-10-03-troy-rowing-layout.md); it is not main
scene or public asset acceptance.

## Current preview and immutable inputs

- `http://127.0.0.1:4421/queue.html`: the complete ordered 28-person transfer.
  Play, reset and scrub are available; scrubbing preserves actor/equipment state.
- `unload.html?row=13&side=-1`: one foreground actor with the other crew waiting.
- Ship remains exported prototype `p_d5d087e8564a` / `galley-exit-01.glb`, SHA-256
  `37dc759afd777347836702ce9178a9bcad7ba587ce55a8bf3886257116c17d2f`.
- Crew remains exported prototype `p_b465efcee119` / `greek-crew-02.glb`, SHA-256
  `85451321e884eb8144da37f6882880ce773634bcd40a64cb49b0a56a91dc1aa4`.

No new authored asset revision or project pin was saved. The hull scale is still
1.6. The beach is the existing sloped test fixture, not the actual Troy terrain.
The plank is already deployed at the beginning of this sequence.

## Motion and delivery changes

`src/footstep-plan.mjs` now retains support normals as well as world-space
footprint positions/yaw. A planted foot keeps its position and orientation while
the other lifts. `web/supported-footprints.mjs` qualifies candidate landings using
actual sole vertices against exported upward surfaces. It rejects feet straddling
unsupported edges and searches a bounded nearby landing along the travel direction.
The acceptance tolerance was tightened from 3 mm to .1 mm after the independent
2 mm support check exposed edge placements; the checker was not loosened.

`web/crew-footsteps.mjs` is the Greek-rig adapter, shared by aisle and shore motion.
`web/crew-unload.mjs` joins release/stand, aisle steps and shore walking. Direct
seeking initially retained the seated sword orientation and unparked oar; a failing
regression test led to restoring the completed stand/equipment state before later
motion and retaining the weapon socket in the pose. No competing mixer runs.

`src/crew-queue.mjs` is an offline admission scheduler over supplied root paths.
It preserves all actors and settled positions, checks waiting occupants, and rejects
an unschedulable path instead of dropping or recycling someone. The scene-specific
planner assigns 28 distinct staging positions. `scripts/plan-crew-queue.mjs` builds
and serializes the footprints and schedule; the preview loads them from
`output/crew-queue-02/schedule.json` with source/asset identity checks. It does not
raycast-plan all shore paths every frame or during browser startup.

The current cautious step-together motion takes 330.82 seconds of scene time to
unload the boat. This is motion timing, not a five-minute performance audit. It is
not the final walking cadence, throughput or animation-quality decision.

## Evidence and scope

All paths/evidence below are under the external `runtime-lab` workspace.

- `evidence/queue-02/tests.tap`: all 42 lab tests pass. The new cases cover slope
  normals, unsupported landings, continuous stand/aisle/walk joins, direct-seek
  weapon/oar state, scheduling conflicts, stable IDs and distinct destinations.
- The queue integration test checks actual root curves at 30 Hz, independent of
  the scheduler's 85 ms sampling. Minimum moving/settled centre separation is
  .84926 m; minimum involving a waiting actor is .69200 m. This is horizontal root
  separation, not a complete swept-body collision guarantee.
- `queue-02/poses.json`: all 28 paths, 33,944 samples. Stand samples are 50 ms;
  aisle/walk samples subdivide each step four times. No unreachable limbs; maximum
  solved ankle error is about 5.03e-15 m. All retain IDs and finish ashore.
- `unload-03/clearance.json`: both foreground seats, 298 start/mid/end-step samples,
  zero strict body/garment intersections against ship and waiting crew and zero
  planted sole support failures. `unload-aft-01/clearance.json`: both stern seats,
  1,066 samples, also clear through the longer mast/ship/plank route. These scans
  end just beyond the plank and do not qualify every final staging trajectory.
- `queue-02/{webgpu,webgl2}-row13`: nine exact-time captures per backend, no page
  errors, source/input hashes retained. Intermediate queue and final formation
  views were inspected. Single-actor dual-backend captures are in `unload-03`.

The first queue output (`queue-01`) is explicitly exploratory: source was extended
while that process ran, so its end-of-run hashes do not identify every loaded
module. It is retained with an invalidation note. The regenerated queue-02 hashes
were checked against the actual files before delivery and in the integration test.
Earlier failed captures and geometry checks remain available.

No timed performance run was performed. The reference still poses CPU hierarchies
and uses slow, cautious paired steps. This is not the final army rendering approach.
These are scene-side experimental scripts, not new core toolchain requirements or
promoted authoring-skill workflows.

## Remaining production work

Refine gait/arm/weight transfer and cloth; qualify self-collision, foot-side and
continuous swept clearance, moving-crew bodies and all staging trajectories. Keep
arrival IDs when staging transitions to formations. Secure parked oars and furl or
otherwise handle the sail; implement approach, beach contact, support stability,
plank deployment/handling and departure prerequisites. Integrate on actual Troy
terrain and arbitrary boat transforms rather than the current world-coordinate
fixture.

Then bake/optimize the qualified motion, implement range/device policies and
qualify the combined scene under the owner's quiet-machine/minimized-Codex timing
protocol. The broader Troy goal remains active: armies/archery, hero face-off and
optional duel, city/wall/mountain refinement, water/device controls, vegetation
representations, owner review and reproducible site release. Main preview 4420,
public assets/project pins and Cloudflare deployment are unchanged.
