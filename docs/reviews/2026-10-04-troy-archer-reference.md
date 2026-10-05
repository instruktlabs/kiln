# Troy equipped archer reference

4 October 2026. Private scene implementation under the active completion goal.
This advances archer intake to one equipped CPU reference. The full scene,
48-archer crowd, reusable workflow and delivery objectives remain incomplete.

## Implemented

`archers=reference&view=archer` places one equipped Trojan in actual Troy, with
the twelve-ship landing trial and existing formations. Default archers remain
off; the reference route still contains 47 sword placeholders. Counts and stable
actor IDs are retained. No saved master revision or engine runtime was changed.

The consumer combines the saved Trojan body/materials, the articulated hand
components already used by landing crew, and saved bow-set revision
`r_356b134d3d5e471fba86cb875c829463`. `web/runtime/archer-v1/inputs.json` records
exact input paths, sizes and hashes. Browser intake verifies all three GLBs.
The bow copy has SHA-256
`861da8a5dad6265aa823c4b86f73142da14accfa48f486372241fba3e51ac366`.
Sword and shield are removed from the consumer clone. Skin material is retained
on the grafted hands; source geometry and generic hand sockets are preserved.

The nine-second, reversible clock retrieves an arrow, nocks it, raises and draws
the bow, aims, releases, follows through and returns. Arm contact uses the existing
two-bone solver; articulated digits close/open and both string halves follow the
draw. Bow limbs deform only their private geometry copies. Held-arrow and
projectile poses seek without accumulated simulation state. Released arrows
follow gravity, point along their velocity and disappear on actual terrain
contact. This is a scripted demonstration, without projectile damage/casualties.

In this reference route only, the 48 guard IDs occupy distributed front-wall gaps.
Front cover faces the field. The original wall's 3x scale produced cover too high
for human actors, so upper cover is transformed about the unchanged 34.8 m
walkway with 1x vertical scale. Wall body, walkway and horizontal dimensions stay
unchanged. This consumer transformation needs whole-wall/route review before
adoption; it is not an accepted wall asset revision.

## Verification and retained failures

Scene suite: 77 pass, zero failures/skips. Actual GLB tests cover exact rest
positions, bounded limb deformation, unchanged source attribute buffers,
repeat/reverse/loop seeking, grip-frame and middle-finger targets, released-arrow
terrain contact and gravity orientation, and actual foot vertices on the walkway.
The bow-hand test measures projected triangle surfaces, including face interiors,
against the 30 mm cylindrical grip. Palm, four fingers and thumb clear that grip
and approach within 1 mm at the sampled phases. This conservative cylinder check
does not certify every ring, string, digit, arrow, torso or strap contact.

The earlier marker-only contact tests passed while visual review found oversized
bow triangles. GLB limb positions are interleaved with a 12-float stride; the
deformer had indexed the backing buffer as packed XYZ. A new test failed on rest
vertex 1 before the fix. The deformer now decodes through `getX/getY/getZ` and
owns a separate position attribute. Bounds and normals refresh after deformation.
The original malformed browser captures remain under `archer-reference-02`.

Surface review also found the generic hand socket let the palm cross the grip
while fingertips floated. A new projected-surface test failed at 18.38 mm palm
radius. A consumer grip frame offset and digit closure now fit the actual graft,
without rewriting source sockets. Earlier before-fit captures remain under
`archer-reference-03` and `-04`. Separate failing tests caught premature projectile
disappearance and fixed launch orientation during descent. The initial `-01`
browser attempts failed before readiness because the capture script referenced
an undefined global; those failed receipts are retained too.

Final functional captures are `scene/evidence/archer-reference-05/`, with source
copies/hashes in each backend receipt. Both backends completed 15 views each:
nine cycle phases, wall/aerial, front/side aim, retrieval and feet, without runtime
errors or warnings and with unchanged capture source hashes. Earlier corrected `-03` captured eleven views on
both hardware backends without runtime errors. These are local functional and
visual evidence, not hub performance or owner acceptance.

## Next work

Finish close equipment/string/hand/torso/strap review and make a reproducible
48-actor derivative, retaining this exact reference. The existing rigid-only
baker cannot silently stand in for this controller: limbs change vertices and
arrows change visibility. Represent deformation and visibility explicitly,
preserve material/tangent/shadow behavior, compare reconstructed surfaces and
contacts against the reference, and verify reset/reverse/phase identities on
both backends. Terrain impact varies with actor placement and must remain
correct per actor. Do not instantiate 48 full CPU references as an unmeasured
default or label the rigid-only bank as preserving the bow motion.

Then obtain isolated hub evidence for the identified crowd candidate and full
integrated workload, including shadows, culling, startup/resources and supported
camera transitions. Hero interaction, later-crew destinations, city routes,
horse contact, broader workflow/skill proof, final revisions/rebuild and site
acceptance remain in the [completion plan](../plans/2026-10-04-kiln-troy-completion-plan.md).
