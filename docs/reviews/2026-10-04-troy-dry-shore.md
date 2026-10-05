# Troy dry-shore landing checkpoint — 2026-10-04

The landing candidate now reaches dry sand instead of ending in the shoreline
wash. Preview:

<http://127.0.0.1:4420/?landing=1&arrival=1&equipment=1&dryshore=1&view=shipApproach>

The same ship and 28 crew approach on an angle, unfold/lower the plank, and file
onto the beach. Crew identity, hip weapons, ship dimensions, seats and oars remain.
The other 11 ships and default composition are still placeholders/earlier work;
this is not fleet or release acceptance. Existing landing-v8 remains available
without `dryshore=1`.

## Changes

The previous side plank extended along the shoreline because the ship faced
straight inland. The new placement is `[66, 0, 3]`, yaw `-0.65` radians. The local
60 m approach now rotates with that frame rather than following world Z. The
plank's dry endpoint spans roughly z=15.62–16.33 m; the analytic maximum of the
current wash front is z=13 m. The conservative whole-width dry margin is over
2.6 m. This is tied to the current water model and must be rechecked if it changes.

The outer plank panel has a solid beveled tip, with its stringers ending before
the bevel. The external `solvePlankLanding` helper now accepts toe thickness and
width, so it rests the uphill underside corner on the sand rather than burying
the underside beneath a top-surface contact. Both new behaviors were introduced
with failing focused tests, then verified after implementation. The default
zero-thickness/width behavior remains available for existing fixtures.

Current asset in the external `troy-expansion/motion` workspace:

- Source/ref: `output/galley-dry-toe-01.kiln.js`, `p_e290831e9a76`.
- GLB SHA-256: `5681307bf29432b26c82f2625ef6deb0fb1e0dcb3b2866a5043b2e9d9caa39cf`.
- 11,380 triangles, 641,624 bytes. Overall bounds remain
  10.004843 × 9.100000 × 17.526832 author units, scene scale 1.6.
- CLI comparison with equipment-04: 126 unchanged entries; only the outer
  plank mesh changes geometry, with its two ancestor bounds changing. No added
  or removed parts. Material-faithful images and full-scene views were inspected.

All 28 walking paths and the approach contact profile were rebuilt against the
original terrain triangles in the rotated local frame. Shore staging faces world
+Z. Queue duration is 285.175 s, or 337.175 s including approach and equipment
deployment. These are animation durations, not performance measurements.

## Evidence

Paths below are relative to the external `troy-expansion` workspace.

- `runtime-lab/evidence/dry-shore-01/placement.json`: 1,876 deployed equipment
  vertex/edge-midpoint/centroid samples; minimum ground gap about 0.0000235 m.
- `deployment-clearance.json` in the same directory: 101 unfolding/lowering
  configurations and 189,476 equipment/terrain point checks, with the same
  minimum and no sampled penetration. This supersedes the previous 0.263 m
  under-stringer penetration finding for the new asset and placement only.
- `poses.json`: all 28 actors, 23,296 pose samples; maximum solved ankle error
  7.33e-15 m, maximum adaptive pelvis lowering 0.016711 m.
- `runtime-lab/evidence/dry-traffic-{fore,mast,aft}-01/traffic.json`: both sides of
  rows 13, 7 and 0, respectively 580/880/876 samples; no recorded strict body
  intersections or planted-sole support failures. Actual admitted queue states
  are used. Other 22 crew have pose/IK evidence, not this full-mesh route coverage.
- `clearance.json`: 673 approach times, 2,605,183 hull-point and 1,356,768 oar-vertex
  terrain samples. No failures; hull minimum is numerical zero, oar/terrain
  minimum 0.977861 m. That is ground clearance, not wave-surface stroke depth.
- `fleet-spacing.json`: the 49 sampled oar-pose bounds across 161 approach
  placements clear the other 11 ship bounds; minimum separating gap 2.4746 m.
  Adjacent placement bounds form interval envelopes. The initial whole-route
  AABB included empty corners of the diagonal corridor and falsely flagged a
  distant ship; that coarse result is retained as `fleet-broad-union.json`.
- All 63 lab tests pass, including toe thickness/width, persistent actor identity,
  world-facing staging, sequence boundaries and reverse seeking. All 12 scene
  tests also pass.
- `scene/evidence/dry-shore-01/{webgpu,webgl2}`: 12 successful captures each, no
  page errors, all 28 ashore, correct rotated approach offsets and staging beyond
  the wash. Replay/pause/scrub and reverse seeking pass. At 12 s, instance/hierarchy
  images differ by >10 channel levels in 12/14 pixels respectively, and by >40
  in none. These are functional/visual checks, not performance qualification.

The staged consumer is `scene/web/runtime/landing-v9/`: 27 hash-checked files,
3,287,985 bytes. Its stager verifies the new queue/profile, placement, pose,
approach, selected traffic and fleet evidence dependencies. Prior recipes and
bundles are retained. The final deployment sweep evidence is additional to the
bundle's recorded qualification set. No core runtime, installed skills, saved
project revision pins or public deployment changed.

## Remaining work

This remains kinematic arrival, not buoyancy or wave-following hull trim. Sail,
plank and oar handling still need believable crew actions/securing. The other 11
ships need coherent rosters, placements, phases and traffic. Collision evidence
is sampled and scoped; it does not prove continuous whole-mesh freedom, all
self/foot-side/coplanar contacts, structural strength or historical fidelity.

Continue the full Troy objective: approved motion and fleet staging, army and
archer animation, Achilles/Hector/optional duel, city/environment refinement,
character/vegetation range and device selection from bounded measurements,
physical mobile and owner review, then reproducible Cloudflare delivery. No timed
performance run was conducted at this checkpoint.
