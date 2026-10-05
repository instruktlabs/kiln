# Troy seated rowing and shore-plank correction

Follow-up to the independent-clips/deck diagnostic. The owner rejected standing
soldiers with drawn swords on a central plank as the shipboard design. They
explicitly confirmed **one seated rower per oar, two soldiers per row**, hip-secured
swords, and a plank lowered for everyone to file onto shore. Preserve the existing
boat's overall size; rework its floor, seating and oars around the people.

## Direction and sequence

The raised-passage child and its support tests remain diagnostic history, not an
accepted interior. Do not shrink the hull to repair interior fit or scale up people.
The original ship's 1.6 scene scale is retained. The old benches put seats about
0.824 m above the old footboards in world space, which does not fit the current
soldiers' 0.415 m lower legs. Original oars were merged into the timber mesh.

1. Fit one opposing pair: actual seat support, foot floor/brace contact, sheathed
   weapons, hands on their own handles, reachable shoulders/elbows and garment
   clearance throughout the stroke.
2. Apply the fit to all 14 rows, including the narrower ends. Articulate each oar
   about its own mount. Check the blade entering/leaving the water, recovery stroke,
   neighboring oars and the hull. Independent sine motion is not hydrodynamic proof.
3. Row toward shore, slow and beach at a compatible depth. Secure/stow the oars and
   deal with sail/rigging clearance before standing. Keep a stable boat support frame.
4. Deploy a supported hinged plank with its distal end on shore. Resolve the actual
   route around the mast, through the interior and over the gunwale/exit. Do not
   assume a centerline path or teleport soldiers across an obstructing rail.
5. Stand and queue by seat ID, then file onto the plank and shore with spacing and
   real support/clearance. Retain each actor into staging and formation. Only an
   explicit replay resets the sequence. Departure, if added, reverses the physical
   prerequisites: empty route, raised plank and clear oars before moving the ship.

## Initial paired prototype, not accepted delivery

External workspace `review/troy-expansion/motion` now retains these immutable
program drafts and exports, derived from the originals rather than the rejected
raised passage:

- Galley `p_e55987b8ae46`, `output/galley-rowing-02.{glb,kiln.js}`. Hull size and
  scene scale retained; split seats, raised interior footboards, toe braces,
  28 named articulated oars and grip/seat markers. Ship GLB SHA-256
  `b6102f931b6487b4ae51039b3c4fde3ca77acb395d4c30c828400495c25e9bd8`.
- Greek onboard variant `p_30c43e6d0f06`, `output/greek-rowing-01.{glb,kiln.js}`.
  Original sword is retained inside a new hip scabbard; both hands have grips.
  GLB SHA-256 `6b589538b4fd2b0c66fcf44d601f8b79dca563707284fc530c863617e9081196`.

These are not saved accepted asset revisions or new project pins. Original saved
assets remain intact. Material-faithful asset sheets were inspected. A runtime
consumer drives a pair of rowers from the actual oar-handle transforms using
analytic two-bone reach solutions; no competing animation mixer runs over it.
The cloth pose is a provisional seated fold, not qualified garment collision.

The hull/keel, set sail and blue sail bands retain exact exported vertex attributes,
indices and world transforms (`galley-rowing-02-preservation.json`). Interior and
oars intentionally differ; this is not full-assembly acceptance.

The paired contact test was observed failing before implementation. It samples
721 times across a three-second stroke, checking hand socket centers, ankle targets,
seat offset and hip-weapon parenting. These are skeletal contact checks, not
surface contact, finger wrapping, full-body collision or acceptance of the stroke.
The test initially exposed an unreachable arm target; trunk reach was corrected,
not silently clamped or stretched. Whole-ship fit and stow/stand transitions remain
open. All 29 runtime-lab tests pass. `evidence/rowing-03` contains six captures on each
of WebGPU and WebGL2, without page errors and with input/code hashes retained.
Reviewed views still leave seated cloth folds and shoulder/handle height for
refinement. The separate full preview on 4420 is unchanged.

Interactive fit probe: `http://127.0.0.1:4421/rowing.html`.
The old `multiclip.html?deck=1` page is now labeled as a superseded-layout diagnostic.
No timed performance test, main-scene promotion or deployment is implied.

## Full-crew follow-up

The fit probe now displays all **28 rowers** by default; `?pair=1` retains the
isolated pair. All 14 seat pairs keep the original boat size. Current galley draft:
`p_1589da91da7f`, `output/galley-rowing-05.{glb,kiln.js}`, SHA-256
`fcc2fdb5e055942835a666b16c6ce4bf26cced6aefaf279d22f5e775718d9c0c`.
The onboard Greek variant above is unchanged. Runtime inputs are retained in
`runtime-lab/output/rowing-05/`; earlier drafts/evidence remain available.

Full-roster intake exposed unreachable arms in the bow pair. The original bow and
stern platforms also overlapped the crew bays. Floor bays now taper to the actual
inner hull; the end-row floors and seats rise with the sheer. End platforms are
shortened to clear those rows. The central floor is .882 m above scene water, and
seats are .41 m above it; end rows are higher. These dimensions use the unchanged
1.6 scene scale and root Y -1.65.

Oars now rest above the gunwale between paired thole pins, with handle radius
matching the hand grip. They pitch for an immersed drive/clear recovery and
feather about the shaft; wrists follow the same grip frame. Reach checks caught
another overextension when feathering was introduced; trunk reach was adjusted,
without stretching limb lengths or masking unreachable targets. This remains a
kinematic prototype on a flat water plane, not wave-aware hydrodynamics.

The new deck geometry initially inherited degenerate floor UVs from the old panel
helper. A scoped dominant-face projection fixed all 60 large horizontal timber
triangles. The hull/keel, sail and blue sail bands still retain exact exported
geometry, UVs, indices and world transforms (`galley-rowing-05-preservation.json`).

Qualification covers all 28 sets of hands/ankles through 361 phases per actor,
actual exported deck intersections under foot-sole vertices, and each blade's
recovery clearance/power immersion at the corresponding stroke extremes. It does
not prove continuous whole-body/garment/oar collision freedom. Cloth folds, full
mount clearances, mast/rigging passage and transitions remain open. The all-row
source hierarchy is a functional reference; it is not the final mass-crowd runtime.

All 31 runtime-lab tests pass (`evidence/rowing-full-03/tests.tap`). Both WebGPU
and WebGL2 have eight contextual captures without errors, with exact code/input
hashes in their receipts. These are functional captures, not timing evidence.

Next is the stop/stow → stand/queue → supported plank → shore sequence, including
an actual usable hull exit rather than a path through the bow rail. No plank or
shore transfer is implemented by this checkpoint. Main scene 4420, public assets,
project pins and site remain unchanged.

## Population accounting and performance boundary

Fourteen pairs mean 28 rowers per active galley; twelve such ships have 336 distinct
crew members. The original placeholder allocation of six people per approaching
ship does not satisfy the requested layout. A candidate that preserves the earlier
192 Greeks in formation and 48 staging at the opening is **464 Greeks**: 112 aboard
four approaching ships, 112 with four unloading ships, and 240 already ashore
(including the 112 from four previously beached ships). With 192 Trojans this is
656 ordinary actors plus the two heroes. This is a revised composition candidate,
not measured capacity or a promise to run all characters as full CPU hierarchies.

Near-seat fitting uses the original joints; repeated rowing can be baked only once
its contacts are qualified. Each boat then moves one parent frame with synchronized
crew/oar phases. Far ships need cheaper representations, shadow policy and culling.
Qualify the increased roster in a focused combined scene run after correctness;
follow the owner's quiet-machine/minimized-Codex protocol for actual timing.

## Boarding opening and deployed plank

A later structural prototype adds an actual starboard bow-quarter opening, a
turning landing from the aisle and a hinged timber plank. The raised plank blocks
the opening; lowering it exposes a supported exit. This intentionally modifies the
hull/rail near the opening. Do not apply the earlier whole-hull preservation claim
to this new draft. Overall boat scale remains unchanged.

Current exit draft: `p_d5d087e8564a`, external motion workspace
`output/galley-exit-01.{glb,kiln.js}`. GLB: 575,072 bytes, 9,492 triangles, SHA-256
`37dc759afd777347836702ce9178a9bcad7ba587ce55a8bf3886257116c17d2f`.
This is still an exported prototype, not a saved accepted asset/project pin.
The rowing-only page retains galley05; the exit page uses this new branch.

The standalone `src/hinged-plank.mjs` consumer helper solves a fixed-length plank
against a continuous height surface with a bounded allowed slope. It rejects an
unreachable or nonfinite surface and only marks deployment walkable at the final
landed pose. Its two focused tests failed before implementation. The helper does
not prove structural loading, ship stability or full underside clearance.

`http://127.0.0.1:4421/landing.html` shows the 28 crew held at rest, with explicit
Raise/Lower controls. In this fixture the plank is 3.2 m long and about .896 m
wide, descending about 17.28 degrees to a sloping beach. The exported toe exactly
matches the solved contact at `[4.552943401350172, .35152981224303326, 10.8]`.
The shore here is a geometry fixture, not integration with the main Troy terrain.

`runtime-lab/evidence/exit-01/route.json` contains 324 exported-surface route
samples from the fore aisle to the shore, with no missing support. A five-ray
sampled overhead envelope reports minimum clearance 2.1987 m. It does not prove
full swept body/garment collision or walking foot contact. Aperture rays verify
that the old hull blocks the route, the lowered configuration clears it, and the
raised plank blocks it. All 28 rowing/contact checks also pass against the new
ship export; the full lab suite is now 33 passing tests.

`evidence/exit-02` has five exact-time captures per backend without page errors,
plus source hashes and the test transcript. Material-faithful asset and contextual
views were inspected. An earlier capture run had time drift from the freeze/set
ordering; it is retained with an invalidation note, not acceptance evidence.
No timed performance run was performed.

The next boundary remains behavioral: hands release their oars, people stand,
turn/queue and walk along the measured route onto the shore, keeping actor IDs.
The actual landing sequence, ropes/latches/handling of the plank, garment/hand
transitions, full clearance and moving ship/terrain integration remain unfinished.
Main scene 4420 and public deliveries are unchanged.

## Crew release and stand checkpoint

The separate `4421/disembark.html` prototype now uses articulated fingers and
thumbs, clears the oar handles, releases them and stands all 28 stable actor IDs
with planted feet. This is a stationary beached-ship fixture. Simultaneous standing
is a diagnostic; the eventual single-file queue and shore walking are not present.

New crew draft `p_b465efcee119`, external motion workspace
`output/greek-crew-02.{glb,kiln.js}`, GLB SHA-256
`85451321e884eb8144da37f6882880ce773634bcd40a64cb49b0a56a91dc1aa4`.
It replaces the two rigid hand meshes with articulated palms/fingers/thumbs.
Preservation checks retain 37 non-hand meshes' decoded attributes, indices and
world transforms plus inherited animation channels exactly. Buffer interleaving
changed, so this is not a byte-identical buffer-layout claim. It is an exported
prototype, not a saved accepted revision or project pin. The ship is exit-01 above.

Initial release poses intersected benches; lifting the withdrawing arms corrected
that. Standing then exposed own-oar intersections (95 sampled hit groups retained
in `evidence/stand-02/oar-clearance.json`). Before release, the revised motion now
pushes each oar outward by .5 m while the rower leans with it. The sequence is
1.2 s handle parking, .8 s release/withdrawal, then 1.6 s standing. Oars remain
outboard at their mounts; this is not fully stowed or physically latched equipment.
A numerical endpoint overshoot in the quintic easing was also corrected without
relaxing the hand-closure input contract.

`evidence/stand-03/tests.tap`: all 34 lab tests pass. Stand checks sample all
28 actors at 120 Hz, retain actor IDs, hold ankles within 1e-6 m, bound hip jumps,
check released hands above benches and require a stable final pose. The separate
triangle check samples all 14 rows on both sides at 37 times: zero strict crossings
between each own oar and torso/belt/thigh/cloth/scabbard. This does not establish
continuous full-body, neighboring-crew, rigging, hull or self-collision clearance.
Closed-hand triangle checks against the nominal .03 m grip shaft are separately
retained under `stand-02/hand-grip.json`; they do not qualify full hand anatomy.

Both WebGPU and WebGL2 have eight exact-time captures without page errors in
`evidence/stand-03`, with source/input hashes. Seated, leaning, releasing and final
standing views were inspected. Seated cloth still flares and needs refinement.
These are functional captures, not performance qualification; the reference CPU
hierarchies are not the final army rendering approach.

Next: secure oars, qualify garment and neighboring clearances, make supported
step-turns from the seat bays into the aisle, queue by seat ID, then walk the actual
plank onto terrain without sliding or teleportation. Integrate the stationary
fixture with approach/beaching and the real Troy terrain afterward. Main scene
4420, public pack/project pins and deployment remain unchanged.

## Seat-to-aisle stepping checkpoint

The separate `4421/aisle.html` probe now moves one selected standing crew member
out of their seat bay and turns them toward the bow. The other 27 wait. Query
`?row=7&side=-1` selects the mast-adjacent bay (zero-based row index 7, eighth pair);
row 9 is the default. The actor keeps its original ID, sheathed sword and articulated
hands. This is not a queue or shore-transfer simulation yet.

New experimental `src/footstep-plan.mjs` samples a caller-provided footprint
sequence with alternating lifted feet and fixed world-space stance position/yaw.
An injected landing validator rejects unsupported targets before playback; its
focused rejection test was observed failing before the implementation. The
scene-specific `web/crew-step.mjs` adapts this to the Greek rig and stationary
exit-01 ship. Ship dimensions, mast routing and rig anatomy stay in the consumer.
No core package or installed authoring skill is changed by this experiment.

The initial straight lateral route passed ankle/deck checks but crossed the mast
in row index 7: 565 body/garment hit groups in the original 700-sample scan. The
first detour also caught a greave brushing a bench and a tunic brushing the mast
when turning. The corrected route approaches at X +/- .62 m, steps .6 m aft,
joins the centre, then steps a further .2 m aft before turning. It does not resize
or hide the soldier, sword, mast or benches. The focused mast-route test was
observed failing, then passing after the correction. Earlier failing receipts
remain in `evidence/aisle-01` through `aisle-05`.

Current evidence:
- All 37 lab tests pass (`evidence/aisle-07/tests.tap`), including all 28 starting
  seat positions sampled at 60 Hz, stable actor IDs, exact solved ankle targets,
  bounded root motion and a final bow-facing pose.
- `aisle-07/clearance.json`: all 28 paths at 25 times each (700 samples), zero
  strict body/garment triangle crossings against the ship and other waiting crew,
  and zero missing/misaligned planted sole-vertex deck contacts.
- `aisle-06/clearance.json`: denser mast-bay check on both sides, four subdivisions
  per step (306 samples), also zero crossings and support failures. Code/input
  hashes are retained with these two receipts.
- Final visual captures cover rows 7 and 9 on WebGPU and WebGL2, eight exact-time
  views each, with source hashes and no page errors under `aisle-07`. Contextual
  views were inspected. No timed performance run was performed.

These checks do not prove continuous swept collision, foot/ship side clearance,
character self-collision or natural weight transfer. Short side steps and turns
are functional reference motion; body balance, arm motion and garment presentation
still need refinement. Simultaneous moving crew have not been qualified. Keep this
CPU hierarchy reference separate from the eventual baked/far crowd representations.

Next: connect standing to this path continuously, schedule aisle admission and
spacing by seat ID, route the queue around the mast to the bow exit, then qualify
sloped plank walking and shore handoff on the actual terrain. Oar securing,
approach/beaching, cloth refinement and the broader armies/scene/rendering work
remain open. Main4420, asset revisions/project pins and deployment are unchanged.
