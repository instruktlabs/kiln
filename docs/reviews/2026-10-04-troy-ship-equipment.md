# Troy folding plank and rowing sail checkpoint — 2026-10-04

The same 28 seated crew (14 rows, two per row, one per oar) now have a folding
boarding plank and a furled-sail ship variant in the external Troy preview:

<http://127.0.0.1:4420/?landing=1&arrival=1&equipment=1&view=shipApproach>

This remains one experimental ship. The other 11 ships, saved project pins and
public site have not changed. The original arrival remains available without
`equipment=1`. The rejected standing-on-a-plank arrangement on the older 4421
comparison page is not the current scene direction.

## Behavior and asset

The ship rows and coasts on the existing 60 m approach, settles by 42 s, unfolds
the outer half of the boarding plank while upright during 42–46 s, lowers the
extended plank during 46–52 s, then lets the crew file through the opening and
walk to their individual shore positions. Total scene duration is 335.815 s;
that is animation time, not a performance measurement. Weapons remain attached
at the hips. Replay, reverse seeking and scrubbing preserve actor identity.

The long plank now stows as two 3.2 m panels rather than one upright 6.4 m panel.
Side hinge fittings stay outside the tread. A short braced cradle supports the
stowed arrangement. The sail is a gathered linen bundle secured along the yard,
with retained blue markings. This is a pre-furled rowing/landing variant; no
crew-operated sail-furling or plank-hoisting animation is claimed.

Editable source is retained in the external `troy-expansion/motion` workspace:
`output/galley-equipment-04.kiln.js`, ref `p_8ed0a8801994`.
GLB SHA-256: `57b928194c583b8d1d545d4e99b15f4fee8bc75c72b9d90f4a72dd45506f384b`.
It has 11,344 triangles and 635,648 bytes, versus 9,492 triangles and 575,072 bytes
for the previous long-plank ship. Overall bounds remain
10.004843 × 9.100000 × 17.526832 author units; scene scale remains 1.6.
Material-faithful Kiln images were inspected. No owner-accepted saved child
revision or project repin has been made for this candidate.

## Evidence and limitations

Paths below are relative to the external `troy-expansion` workspace.

- `motion/output/galley-equipment-04-comparison.json`: 115 unchanged comparison
  entries, four changed, ten added and two removed. Intentional changes are
  the plank assembly, cloth and shared timber/blue meshes containing sail details.
- `runtime-lab/evidence/ship-equipment-02/preservation.json`: decoded geometry
  for the hull and all 28 oars is identical. Removed low timber triangles belong
  only to the former sail-sheet cylinders; interior floor/seat timber remains.
  Deployed toe error is 1.78e-15 m; 45 tread raycasts, including both sides of the
  fold, differ from the previous surface by at most 1.67e-9 m.
- `runtime-lab/evidence/ship-equipment-02/clearance.json`: 44 seated/deployment
  samples and 5,208 route poses across all 28 actors, with zero recorded strict
  body intersections against added timber and plank equipment. This excludes
  foot meshes, coplanar contact, self-collision and continuous swept motion.
- Focused tests cover waiting until unfolding/lowering completes, deterministic
  reverse seeking, persistent IDs, grip/foot targets and pose continuity.
- Current final asset: all 60 lab tests and 12 scene tests pass. The full scene
  has 12 successful captures on each of WebGPU and WebGL2, with no page errors,
  all 28 crew ashore at the end, seated waiting during deployment, reverse seeking,
  replay/pause/scrub controls, and inspected rowing/unloading views. At 12 s,
  instance/hierarchy images differ by >10 channel levels in 13 pixels (WebGPU)
  and 12 (WebGL2); >40 in two and zero pixels respectively. These are functional
  and visual checks, not performance acceptance.
- The first tall-cradle candidate failed hand/forearm clearance. Its evidence
  remains in `ship-equipment-01`; staged `landing-v7` is superseded. The shorter
  cradle fixes those sampled contacts; current consumer is `landing-v8`.

The plank underside still enters sand near the grounded toe by up to 0.263 m at
sampled vertices. This is a retained tip/underside geometry problem, not a passing
solid-terrain clearance result; refine the end support/taper while maintaining
usable walking contact. Hinge/body construction has not received structural or
historical validation. Plank/sail/oar handling, latches, hull trim and wave contact
still need visual refinement. The current route also crosses the visual shoreline wash before reaching dry sand;
plank placement and the visible waterline still need alignment. Other ships have
not been converted.

`scene/web/runtime/landing-v8/` contains 28 hash-checked files, 3,119,419 bytes.
Staging checks the original queue/profile dependencies plus the replacement
asset's preservation and clearance evidence. It preserves the original recipes
and explicitly records the derived ship identity instead of relabeling old
qualification as a test of new geometry. Experiments remain outside the engine
and installed skills. No timed performance test was run.

The full Troy goal remains active: fleet rosters/landing/staging, natural motion
and equipment handling, motion baking and measured range/device policies,
archery, Achilles/Hector and optional duel, city/environment, physical mobile and
owner review, then reproducible site delivery.
