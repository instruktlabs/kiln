# Troy rowing approach and landing join — 2026-10-04

The one-ship prototype now connects offshore rowing to the existing ordered
landing, using the same 28 crew throughout. This extends the
[alternating gait checkpoint](2026-10-04-troy-travel-gait.md). It is a kinematic
approach over the actual Troy terrain, not accepted buoyancy, equipment handling
or a complete fleet implementation.

## Preview and sequence

`http://127.0.0.1:4420/?landing=1&arrival=1&view=shipApproach`

The **Rowing ship** view covers the approach; **Landing crew** gives the closer
shore view. Existing replay, pause and time controls remain. Omitting `arrival=1`
keeps the previous already-grounded landing comparison.

- The ship moves 60 m toward its existing landing frame over 40 seconds.
- Crew row in synchrony, slowing their last recovery from 12–18 s and ending in
  the exact seated pose used by unloading. It then coasts without further strokes.
- A two-second settle finishes at the qualified landing height before the plank
  lowers from 42–48 s. All 28 remain seated during lowering.
- The existing queue follows, with all 28 ashore by 331.815 s. This is scene
  duration, not a performance audit or a final cadence decision.

Actor IDs, sheathed hip weapons, seats and authored ship size remain unchanged.
The opt-in composition still has 502 ordinary soldiers, two heroes and 12 ships;
the other 11 ships remain earlier placeholders. Default composition, project
revision pins, core runtime and public deployment are unchanged.

## Implementation

`runtime-lab/src/triangle-heightfield.mjs` accelerates queries against original
upward terrain triangles with their world transforms. The baker retains 241
contact samples along the approach, using the 3,871 hull samples from the existing
grounding check. It adds a small interpolation clearance and eases first contact;
the final settle removes that clearance at the established landing position.
It assumes the supplied terrain is a continuous heightfield; it is not a general
overhang or rigid-body solver.

`src/ship-arrival.mjs` owns the deterministic movement/stroke/settle/landing
timeline. `web/arrival-crew.mjs` gives each persistent actor a single pose owner,
switching from the contact-solved rowing rig to the existing unload controller.
The rendering parent moves the boat and seated crew together, while local contact
solving stays in the previously qualified landing frame. Reverse seeking restores
the correct equipment and actor state.

The staged consumer is `scene/web/runtime/landing-v6/`: 26 hash-checked files,
3,055,151 bytes. It uses `runtime-lab/evidence/ship-arrival-01/profile.json` plus
the unchanged `travel-landing-05` queue. No GLB revision was authored for this step.
Experiments remain outside the core toolchain and installed authoring skills.

## Evidence

All paths below are relative to the external `troy-expansion` workspace.

- `runtime-lab/evidence/ship-arrival-01/tests.tap`: all 58 lab tests pass.
  `scene/evidence/ship-arrival-01/scene-tests.tap`: all 12 scene tests pass.
  New tests cover original-triangle height queries, timeline ordering, monotone
  approach, persistent crew identity, pose joins and reverse seeking.
- `runtime-lab/evidence/ship-arrival-01/clearance.json`: 673 times at 16 Hz,
  2,605,183 hull-point and 1,356,768 oar-vertex/terrain samples. No recorded terrain
  penetration beyond numerical tolerance. Minimum oar/terrain separation is
  1.5973 m; this is seabed/ground clearance, not water-surface stroke depth.
  Maximum grip error is 2.59e-15 m and foot-target error 5.56e-16 m. The accelerated
  height query agrees with 101 independent triangle raycasts within 1.78e-15 m.
- `runtime-lab/evidence/ship-arrival-01/fleet-spacing.json`: a conservative union
  of 49 sampled oar-pose bounds over 161 placements does not overlap the actual
  bounds of the other 11 ship assets. Minimum separating-axis gap is 7.8955 m.
  This is sampled-envelope evidence, not a general fleet navigation solution.
- `scene/evidence/ship-arrival-01/{webgpu,webgl2}`: 13 successful captures each,
  no page errors. Rowing, coasting, settling, seated lowering, complete arrival,
  reverse seeking and playback controls pass. At 12 s, instanced/hierarchy images
  differ by more than 10 channel levels in nine pixels per backend and none by
  more than 40. Close rowing/coasting views were inspected.

These checks do not establish continuous full-mesh collision freedom, realistic
buoyancy/pitch, response to the scene's changing wave surface, or performance.
No timed performance run was performed.

## Next work and full-goal status

Close views expose the equipment work clearly: the long upright plank is an
awkward underway stowage solution; it needs a compact, supported storage and
deployment arrangement. The full sail still needs a believable landing state,
and parked oars need securing/handling. Refine hull trim and water contact before
calling the arrival visually finished. Keep the verified route/contact behavior
while changing these assets and poses.

Then qualify fleet placements/rosters, bake the approved motion, select range and
device representations with bounded combined-scene measurements, and finish
armies/archery, Achilles/Hector/optional duel, city/environment, physical mobile
review and owner-approved reproducible site delivery. The original full Troy
goal remains active; this checkpoint does not narrow its scope or establish release
acceptance.
