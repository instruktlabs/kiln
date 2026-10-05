# Troy playable hero shield integration

4 October 2026. Achilles and Hector now use the exact new child masters in the
local 4420 scene. Their revised hands, smaller sword grips, mounted shields and
distinct armour/shield silhouettes are integrated. Infantry and the articulated
crew/archer hand derivatives still use their earlier sources. This checkpoint
does not close the all-hands request or the full completion goal.

## Runtime and provenance

The consumer's `web/inputs.json` pins Achilles
`r_c1c4ecbebd124fed98f7d5160b79af05` and Hector
`r_ef54c930085b486d9892764a167b308a` from the fresh character-repair author workspace.
GLB hashes are respectively
`fec2a0d4c27f7923589f864780ac5b0ff0135c4b928ffa7451111646ffd94b55` and
`3a3d8d9ee6498af6980bd3aceb181d29b8046521a8a92a8a79e58542cdc14719`.
The existing loader verifies these bytes before parsing. Intake retains previous
scene inputs/GLBs and the new source/manifest in `output/hero-equipment-intake-01`.
Standalone saved parents and children remain immutable. Canonical Troy project
links were not advanced; historical project-pin limitations remain as recorded
in the [authoring checkpoint](2026-10-04-troy-character-equipment.md).

`web/hero-shield.mjs` derives the left wrist orientation/position from the actual
authored mounting frame. At rest the shield is carried alongside the body; held
guard raises its face in front of the torso. Raise/lower transitions use the same
fixed-step clock as the displayed rig and contact detector. An unraised shield
does not automatically grant the held-guard gameplay mechanic.

Playable guard contact now compares the attacking blade with the opponent's
posed shield triangles. An overlapping opposing sword cannot block when the
shield misses. Strikes no longer retarget to a sword-parry pose when an opponent
holds guard. Wind-up raises the sword; the swing occurs during the attack's
active interval. A bounded 16-iteration pose-path bisection stops a shield
interception with 0.3 mm visual clearance inside the existing 0.5 mm guard skin,
then the displayed arm recoils. It is a fixed-step gameplay constraint, not a
general rigid-body solver or an exact continuous rotational-collision guarantee.
The stun pose also keeps the sword out of the opponent's carried shield.

Stamina spending, heavy chip damage/guard break, interruption and delayed bot
perception remain the existing combat rules. Damage still uses actual authored
torso/head/helmet geometry and its declared 30 mm hurt skin. The seekable paired
reference intentionally retains its timed sword parries while carrying shields;
that reference is distinct from playable shield blocking.

## Verification

All paths below are relative to the private Troy scene workspace:

`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion\scene`

Focused red tests demonstrated sword-based guard granting protection when the
shield missed, sword penetration after a block, and the stunned defender crossing
the opponent's carried shield. Those failing TAP receipts remain in `evidence/`.
Final `evidence/hero-shield-01/scene-tests-final-124.tap` reports 124 passes, no
failures or skips, including the pre-existing environment, landings, archers,
fixed-step combat and paired-reference checks.

`scripts/check-hero-shields.mjs` produces
`evidence/hero-shield-01/impact-proof.json`: eight actual-mesh flows, both heroes,
light/heavy attacks and defended/undefended targets, 180 fixed ticks each. Each
flow has exactly one appropriate body hit or shield block within the active
window. Impact matrices replay against the pinned geometry. Sampled own-shield/
torso, own-shield/sword and blade/body clearances exceed 1 cm; no opposing-shield
surface intersection is detected in those samples. Separate tests check shield
clearance through 121 paired-reference poses and sampled movement/turning/guard
flows for both player choices. This is headless geometry evidence, not exhaustive
live-input or continuous collision qualification.

`evidence/hero-shield-01/browser-receipt.json` records manual CUA inspection after
final-source reload on both actual hardware backends. Each backend verified both
hero choices, light/heavy attack buttons and pause, rematch with both health and
stamina reset to 100, leave to face-off, and seek to the 8.8-second paired parry.
Six final JPEGs and the corresponding AX snapshots are retained. Final console
inspection reported no errors/warnings. Viewports differ; this does not claim
matched pixel parity or browser impact-matrix replay. Earlier unsuffixed WebGPU
screenshots predate the final stun repair and remain historical.

The current desktop browser renders bronze fairly dark under the destination
lighting. Human-scale champion readability, hand appearance, material/light
direction and shield behavior still need owner review. Current full-scene cost,
input/camera feel, shadow/culling/resource behavior and supported-device evidence
remain open. Old hero-play-06 and hero-modes-02 qualify their older source only.
No engine runtime source, maintained skills, infantry pins or crowd-bank payloads
changed in this integration. No commit, push or deploy was performed.

## Next work

1. Repair the articulated crew/archer donor hands without breaking finger joints,
   oar grips, bow/string/arrow contact or release/unload poses. Save exact revisions
   in the author workspace and inspect the actual destination poses.
2. Adopt reviewed infantry children and role equipment policy. Rebuild affected
   rowing/shore/formation/walk/archer derivatives with exact changed input identities;
   check bounds, deformation, visibility, contacts and CPU/packed agreement.
3. Requalify complete scene motion, camera/input, guard-break/turning/interruption,
   bot fairness/feel, shadows/culling/resources/startup, then measure this identified
   complete workload on quiet hub. Owner and physical-device acceptance remain open.
4. Feed demonstrated shape/contact lessons into maintained shared guidance and
   qualify installed/package copies without overwriting authors. Finish remaining
   environment/city routes and later-crew destinations, unrelated-input workflows,
   asset/project delivery and authorized site acceptance under the full plan.

Read the [playable plan](../plans/2026-10-04-troy-playable-heroes.md) and
[full completion plan](../plans/2026-10-04-kiln-troy-completion-plan.md).
