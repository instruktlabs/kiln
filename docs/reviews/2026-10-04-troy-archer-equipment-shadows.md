# Troy bow deformation, clearance and shadow projection

4 October 2026. This advances the remaining equipment/shadow work after the
[right-arm correction](2026-10-04-troy-archer-anatomy.md). The normal CPU reference
and all 48 packed default archers now use the corrected bow. Saved body, hands
and bow-set GLBs remain byte-identical; these are scene consumer changes.

Two focused tests first reproduced further defects: the upper string intersected
actual helmet triangles near full draw, and each .585 m half-string stretched
to .91855 m while the limbs barely bent. The reference now bends each limb along
a kinematic arc, solving the tip angle to retain the braced string length.
Nock positions and orientations follow that bend. The final equipment plane is
4 cm farther outboard, preserving hand attachment and drawing-arm alignment.
This is a geometric animation model, not an elastic-force simulation.

Across 361 sampled poses, half-string length differs from .585 m by at most
2.95e-13 m. Sampled string centreline/helmet-triangle clearance improves from
intersection to a minimum 35.56 mm. Three tests cover constant length, helmet
clearance and rendered string endpoint/nock connections. Existing arm, hand/grip,
source immutability, foot, projectile and bank reconstruction checks remain.
The previous shallow-bend envelope test was updated for the measured new bend;
rest vertices and master-buffer equality remain exact. Discrete samples do not
prove continuous collision freedom or every draw-finger/equipment contact.

All **95 scene tests pass**. Both WebGPU and WebGL2 complete **24 pose views for
the CPU reference and actual 48-archer default**, without errors/warnings, under
the external scene's `evidence/archer-equipment-02/`. The default full-draw and
intermediate poses were visually inspected. Failures, numeric before/after data
and test receipts are under `evidence/archer-equipment-01/`.

Banks `archer-bank-06` and repeat `-07` reproduce the current payloads exactly:
**566 frames, 95 parts, 236 deforming vertices, 3,427,696 bytes**. Six adaptive
passes finish sampled fitting at 1.491 mm; the independent surface/normal tests
still pass their existing limits. Transform SHA-256 is
`4297b305ed409a6dcb3c251e90437fba9031810dc3d4b2a7297615f0b4ad5da1`;
vertex SHA-256 is
`84221f54463f77eb874ad4f3bb2358558563ee81c2354ac1570708ec1da08bba`.
Source manifests include the new `web/archer-bow.mjs` helper.

## Controlled shadow evidence

`web/qualification/archer-shadow.html` uses the actual CPU controller, packed
shader, inputs and bank. Single and eight-phase rotated/scaled rosters cast onto
an isolated receiving plane, with twelve poses including reset and reverse seek.
The main-pass caster geometry is clipped while its shadow pass remains active,
using [ClippingGroup](https://threejs.org/docs/pages/ClippingGroup.html).
This exercises the separate
[castShadowPositionNode](https://threejs.org/docs/pages/NodeMaterial.html)
contract rather than assuming main-pass animation proves shadow animation.

Each backend completes **56 images**, including 24 reference/packed comparisons,
four broken-transform controls and four disabled-casting controls. Minimum
shadow-mask intersection/union is **99.744%** on both backends, exceeding the
unchanged 98% criterion. Omitting the animated shadow transform gives only
7.3–9.3% overlap and is rejected. Disabling casting is exactly blank for both
CPU and packed rosters; images contain no actor-colour pixels. Receipts under
`evidence/archer-shadow-04/` report no errors/warnings and pin their sources.

Earlier diagnostic attempts remain under `-01` through `-03`. An initially
ignored NodeMaterial constructor configuration left the receiving plane invisible;
a corrected plane then exposed coplanar foot pixels contaminating the CPU image.
The final rig explicitly clips the main-pass casters and tests blank controls for
both representations. Those earlier captures are invalid projection evidence,
not production shadow failures, and are not promoted by the passing final rig.

This qualifies sampled projection equivalence in the controlled rig. Actual
Troy map coverage/resolution, contact and self-shadow appearance, camera and
representation transitions, and complete-workload costs still require review.
The earlier isolated hub costs predate this equipment change.

## Maintained guidance and local packaging

The QA integration reference now distinguishes anatomical limb routing from
attachment closure and calls out moving equipment/headgear clearance. The optional
compose-scene reference explains receiver-only shadow comparisons and controls
that detect contamination or missing animated transforms. Neither introduces
Troy dimensions, controllers or bow physics as standalone asset requirements.

The skill specification/registration check and both skill-creator validators pass.
An offline npm package preserves the exact two reference files. Fresh setup and
managed upgrade through the extracted package runtime, sharing the existing local
dependency tree, verify eight skill and
Codex-registration copies. A customized managed file rejects upgrade without
changing any workspace bytes; after resolving that scratch-fixture conflict,
upgrade succeeds and unrelated owner notes remain unchanged. No existing author
workspace instructions were rewritten. Proof is at
`C:\Users\Mattm\X\kiln-migration\2026-10-04-hub\equipment-skills-02\receipt.json`.
The initial npm-12 JSON parsing failure remains in `equipment-skills-01`.
This is local packaging proof, not a pristine dependency installation, package publication or proof that Troy's
derivative workflow works on another asset family.

## Continuation

Scene sources and evidence are local at
`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion\scene`.
Recovery adds `archer-equipment-checkpoint-01` over the previous anatomy/crowd
checkpoints. The full completion goal remains active. Next: remaining draw-hand,
strap/equipment and actual-scene shadow/culling/resource review, then hero action,
later-crew destinations and city routes. Natural frame pacing, device targets,
unrelated-input workflows, revisions/site delivery and owner acceptance remain
open. The earlier WebGL2 19-pixel aerial return failure stays unresolved.
No engine runtime repair, commit, push, publication, deployment or owner approval
is claimed by this checkpoint.
