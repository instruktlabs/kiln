# Troy character hands, shields and champion identity

4 October 2026, local authoring checkpoint following the owner's hero-view review.
This is a candidate asset checkpoint. Live 4420 Troy still uses the previous
assets and sword-parry controller. These revisions are not integrated or owner
accepted. The full completion goal remains active.

## Confirmed defect and direction

Saved Achilles, Hector, Greek soldier and Trojan soldier sources have no shield.
All four share a box palm with an eight-sided annular fist. The visible hole is
authored geometry, not a renderer defect. Old sword grip radius is 30 mm. The
consumer archer removes swords/shields and replaces fixed hands with the articulated
crew donor; fixing these four masters alone cannot repair all live hands. Rowers
also need a distinct articulated-hand repair.

Both champions and frontline infantry should carry shields. Bow use requires two
free hands; rowing needs an oar grip and equipment stow/release policy. Do not
blindly attach an in-hand shield to every role. Retain faction identity but
distinguish champions by armour silhouette, helmet/crest, cloak and shield shape
rather than colour alone. Completion includes all visible role hands and usable
shield defense. Achilles fighting Hector in new armour with a shield is described
by the [Fitzwilliam Museum](https://data.fitzmuseum.cam.ac.uk/id/object/12198).
These designs are stylized candidates, not archaeological reconstructions.

## Isolated authoring and exact revisions

Fresh Codex workspace:

`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-character-repair-2026-10-04\ws`

Setup discovery confirms the current local engine installation/workspace services.
The previous Claude workspace was checked for managed-skill drift but not upgraded
or overwritten; its QA integration reference differs from the maintained copy.
Saved parents/material resources were copied as explicit provenance. No global
collection or harness configuration changed.

| Asset | Saved parent | New child | Program | Triangles / meshes / materials |
| --- | --- | --- | --- | --- |
| Achilles | r_a108d7a33da5428aa24880ec5393a725 | r_c1c4ecbebd124fed98f7d5160b79af05 | p_5b737cfbf71e | 4,244 / 31 / 3 |
| Hector | r_44e1d7983d16474085678924a0ab0376 | r_ef54c930085b486d9892764a167b308a | p_f4ee6b1d67dc | 3,292 / 30 / 3 |
| Greek soldier | r_647e60b4c8c94640aca8a8266a371b0f | r_b4daab9ccf294d249b4260dad13281ce | p_23baa1391de2 | 2,916 / 27 / 3 |
| Trojan soldier | r_036bd9d29d9747fa8d50899e089c695b | r_ce7e01326e69496cabb4a5c2eb9aafcb | p_90e32a0230ad | 2,776 / 27 / 3 |

Hands have tapered palms, four individually curled fingers, a thumb and a wrist
bridge, merged into existing hand meshes. Matte skin no longer inherits linen
normal/colour texture. Sword grips are 14 mm in radius; blades are unchanged.
These are fixed closed-grip hands, not newly articulated fingers.

Achilles carries a 76 cm round shield with fitted concentric rings and boss,
brighter bronze plates/shoulder guards/lames and his tall blue crest. Hector has
a 66 by 87 cm oval shield with angular crimson horse relief, layered bronze chest
armour and retained crimson cloak/crest. Infantry gets simpler 60 cm shields and
retains faction armour/cloth. Each shield has a wrist-parented frame, grip and mount.

Historical project revision IDs referenced by these parents do not resolve in the
migrated workspace. Available Troy project revisions are migrated 1 and 2. Each
candidate was explicitly built/saved standalone with exact material resource,
revision and hash pins from its saved parent; the latest project profile was not
silently substituted. Descriptions retain this limitation. No canonical Troy
project membership or scene revision pin was advanced.

## Evidence and limits

All proof paths are relative to the new workspace. `work/candidates.json` and
`work/saved-candidates.json` identify sources/children. Each `*-04-render.json`
has material-faithful GPU delivery without degradation. `*-04.png` sheets include
whole-asset, hand and shield views. `achilles-attack-04` and `hector-attack-04`
show seven source attack phases with final references. Earlier -03 attack sheets
predate the contact repair and remain historical. In-loop fidelity correctly
reports `exactArtifact:false`; views do not certify a sealed saved-artifact capture.

`work/candidate-geometry-checks-151.json` checks 151 attack poses per asset. Blade
and shield, and shield and cuirass, remain more than 1 cm apart at every sample.
The separate geometry receipt retains conservative minimum lower bounds of about
4 cm. Shield mount and hand/wrist surface distance is zero. Zero proves contact
or intersection, not welded topology or solid validity. Samples do not establish
continuous collision safety.

The proof compares all 18 existing joint/socket rest transforms exactly and
expanded indexed position/normal/UV triangles for existing non-hand/non-sword
geometry. Only three left-arm attack quaternion channels were intentionally
revised to clear the shield during recovery. All other animation channels,
timings and targets are unchanged. Earlier failed preservation/fit attempts are
retained, including an invalid comparison of interleaved backing buffers.

All four saved children rebuild byte-for-byte to their saved GLB hashes through
`kiln asset ID CHILD --collection project --rebuild --out ...`. The `*-rebuild.json`
receipts report `matchesSavedArtifact:true`. This proves source/material rebuild
integrity, not destination or performance qualification.

Compact QA retains intentional/inherited overlaps and incomplete solid-volume
coverage. Six material images exceed the generic four-image portable budget.
Three materials and low triangle counts do not prove complete-scene cost. Shield
relief's inherited cloth texture, finger/skin appearance at game scale, guard
stance and champion readability need destination review. No engine runtime defect
or engine source change was established here.

Library viewer port 4538 resolves the exact Achilles child and displays geometry,
revision, statistics and standalone membership. CLI GPU checks are local functional
and appearance evidence. No current hub timing, supported-device or owner acceptance
is claimed. Original parents remain intact. No commit, push or deploy was performed.

## Continue in this order

1. Integrate exact champion children through explicit consumer pins. Adapt left-arm
   IK and guard targets to shield grip/frame; resolve block from actual posed shield
   interception and declared contact policy. Keep sword parries only as an explicit
   mechanic. Recheck both player choices, bot guard/stamina/heavy breaks, misses,
   turning/retreat/interruption, paired reference and mode switches.
2. Repair articulated crew donor and derived archers: tapered palms, fingers and
   thumbs while retaining finger-joint/oar, bow, string and arrow contracts. Check
   open/release poses and close hands through retrieve/draw/release and rowing/
   unloading. A sword-sized grip must not replace the larger oar handle.
3. Adopt infantry children and role equipment policy. Rebuild pinned rowing, shore,
   idle/walk and archer derivatives wherever actual source identities changed.
   Recheck deformation/release visibility, bounds/culling, shadows/resources and
   CPU/packed agreement. Do not reuse stale bank evidence.
4. Measure the complete integrated candidate on quiet hub. Preserve old timings
   as history. Review human/aerial silhouettes, motion, hands and champion identity
   with the owner. Advance project links with exact reviewed revisions and a
   reproducible delivery manifest.
5. Feed demonstrated hand-shape/fit lessons into maintained geometry guidance and
   QA/compose references at shared boundaries. Qualify packaged fresh setup and
   managed upgrade while preserving existing authors' customizations.

Remaining environment, later crew destinations/city routes, fair bot playtests,
other-input workflows, engine/skill disposition and site delivery remain in the
[full completion plan](../plans/2026-10-04-kiln-troy-completion-plan.md).
