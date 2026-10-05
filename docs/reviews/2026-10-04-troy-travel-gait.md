# Troy alternating shore gait — 2026-10-04

The opt-in landing scene now uses alternating travel steps, continuous forward
body motion, opposing arm swing and a brief arm tuck beside the mast. This replaces
the paired-step travel in the [first integrated landing](2026-10-04-troy-landing-integration.md).
Stand/release, constrained aisle steps, planted-foot turns and stable actor IDs
remain. This is a motion-quality improvement to one stationary landing ship,
not final animation approval or fleet/performance qualification.

## Current preview and sources

- `http://127.0.0.1:4420/?landing=1&view=landing`: current alternating gait.
- Add `&gait=paired` to compare the previous integrated motion.
- `http://127.0.0.1:4421/travel.html?row=7`: close follow-camera study; this uses
  the earlier flat fixture and stationary comparison crew, not the timed Troy queue.

The runtime bundle is `scene/web/runtime/landing-v5/`, 23 hash-checked files,
3,038,725 bytes. Its source recipe is
`runtime-lab/evidence/travel-landing-05/schedule.json`. Authored crew and ship
GLBs are unchanged; no project revision/pin, core runtime or public-site change.
The full opt-in counts remain 502 ordinary soldiers, two heroes and 12 ships;
only one ship has the new landing behavior.

## Changes and defects resolved

`src/travel-footprints.mjs` alternates the leading foot on straight route segments
instead of bringing both feet together at each intermediate waypoint. A monotone
cubic body path maintains forward movement through foot exchanges without
overshooting route extrema. Foot positions and surface normals remain explicit
contacts, qualified against the actual exported geometry.

The Greek-rig adapter adds small opposing arm swing. Tunic panels now respond
radially to the corresponding leg rather than sharing an average forward tilt.
Arm spacing clears the tunic and hip weapon. Beside the mast, forearms briefly
fold while facing along the aisle. The wider walking posture begins only after
the shoulders clear the parked oar handles during standing.

Actual timed queue sampling exposed a leg-reach failure between the original
quarter-step samples (`galley-0-row-11-1`, local time 13.75 s). A focused regression
test failed before the fix. The playback now lowers the pelvis as needed to retain
a small knee bend; it does not clamp or move the planted foot. The largest lowering
in the all-actor sampled check is 0.01006 m.

Walking steps across all 28 paths fall from 8,712 to 4,475. The front actor's full
transfer is 52.68 s versus 95.52 s previously. The whole ordered queue is 283.815 s
versus 348.5 s; including plank lowering, 289.815 s versus 354.5 s. These are authored
scene durations, not performance measurements or final cadence decisions.

## Evidence and limits

Paths are relative to the external `troy-expansion` workspace:

- `runtime-lab/evidence/travel-landing-05/tests.tap`: all 55 lab tests pass.
  `scene/evidence/travel-integration-01/scene-tests.tap`: all 12 scene tests pass.
  Tests include body-velocity continuity, fixed planted contacts, state joins,
  the intermediate-time reach regression, source identity and queue separation.
- `runtime-lab/evidence/travel-landing-05/poses.json`: all 28 actors, 22,820 samples,
  no unreachable limbs, maximum solved ankle error about 3.98e-15 m. Quarter-step
  sampling alone is not continuous proof; the timed traffic check exercises
  additional asynchronous phases and the runtime reach bound remains enforced.
- `runtime-lab/evidence/travel-traffic-{fore,mast,aft}-05/traffic.json`: both sides
  of rows 13, 7 and 0, 2,284 aisle/walk samples with all crew and oars in their actual
  admitted queue states. No strict body/garment intersections or planted-sole
  support failures. Includes sampled moving-crew contacts; excludes other rows
  as selected subjects, continuous sweep, coplanar contact and foot-side collisions.
- `runtime-lab/evidence/travel-self-final-07/self.json`: 893 quarter-step samples
  on the long port-side stern route. No tested thigh/shin/greave versus tunic-panel
  or hand/forearm versus cuirass/tunic/hip-weapon crossings. This is a selected
  pair-family check, not blanket self-collision qualification.
- `runtime-lab/evidence/travel-stand-04/oar-clearance.json`: all 28 crew, 37 phases
  each. Torso/belt/thigh/cloth/weapon clear the own oar; arm/hand checks from 2 s
  onward also clear. Initial intentional grip and other ship/body pairs are excluded.

`scene/evidence/travel-integration-01/{webgpu,webgl2}` contains eight successful
captures per backend with no page errors: seated lowering, complete 28-crew arrival,
reverse seeking and replay/pause/scrub controls. At 51 s, instanced / hierarchy
images differ by more than 10 channel levels in only six pixels per backend and
none by more than 40; these are render-parity checks, not timing evidence.

Earlier failed self/clearance checks are retained. Several conservative route
failures placed every other actor standing permanently in their original bay;
those do not represent the scheduled queue. They were replaced with actual-state
traffic checks, not ignored as passes. Those checks also found genuine mast/arm
and intermediate limb-reach defects, which were fixed before staging this version.
Earlier travel recipes and `landing-v4` are superseded development snapshots.

## Workflow and remaining scope

The generic footprint builder accepts an injected surface finder. Rig dimensions,
arm/cloth behavior and the ship's constrained corridor stay in separate consumer
adapters. `scripts/plan-travel-landing.mjs` can reuse cached contacts only when
footprint inputs are unchanged; it verifies route-start contacts, rebuilds sampled
trajectories and admission timing, and retains the source recipe hash. The staging
script refuses stale inputs and existing destination bundles. No experimental
workflow has been promoted into the core toolchain or installed authoring skills.

The gait still needs owner visual review and further natural weight-transfer,
heel/toe and cloth refinement. Full swept/self-collision, all moving routes,
approach/beaching, ropes/latches/oar securing/sail handling and the other 11 ships
remain. CPU posing and uncullable rigid-part instances are provisional; motion
baking, range/device policies and bounded combined-scene timing remain work.
No timed performance run was performed. The complete Troy goal, including armies,
archery, heroes/duel, city/environment, physical mobile review and site release,
remains active.
