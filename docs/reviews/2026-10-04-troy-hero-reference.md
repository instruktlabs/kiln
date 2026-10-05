# Achilles/Hector paired reference checkpoint

4 October 2026. Consumer scene at
`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion\scene`.
Full goal remains active. The owner's subsequent playable-hero request extends
this checkpoint; the reference is not a substitute for player combat.

The actual saved Achilles and Hector GLBs retain their pinned SHA-256 identities
in `web/inputs.json`; both export idle and attack clips and carry swords, with
no shield. `hero-intake-01/receipt.json` records joints, geometry and clips.
No master, source asset or installed authoring workspace was changed.

`web/hero-duel.mjs` clones two detailed rigs, preserves the initial face-off
placements, and supplies an optional 20.16-second paired approach, strike/parry,
counter/parry and retreat. Eleven strides per hero use fixed stance anchors,
slope-oriented sole support and two-bone IK. Anatomical arm targets, torso turn
and modest weight transfer accompany the attacks. Blade cross-sections come
from the actual sword triangles; the parries place blade faces 0.3 mm apart,
avoiding center-line intersection. Both masters remain immutable.

The actual preview replaces the two static hero batches with these rigs. It
adds face-off/close-up views, Start/Pause/Replay duel, a scrubber and Reset
face-off. A separate epoch lets hero playback start, seek or reset without
resetting fleet time. `duel=1` starts the reference automatically; default is
face-off. Reset and terminal retreat return to the declared initial locations.

101 scene tests pass. Six hero tests cover source immutability/facing, actual
blade-face gap, sampled sole support and anchored stance feet, reverse seeking
and reset, actual weapon-surface clearance from headgear/torsos, and small-time
joint/weapon continuity at handoffs. Initial overlong-stride and terminal-time
failures are preserved in `hero-intake-01`. Surface-distance checks do not prove
solid collision physics or exhaustive continuous contacts.

`evidence/hero-duel-02/{webgpu,webgl2}/receipt.json` records 35 actual-scene
captures per backend, with no errors/warnings: default/reset and eleven stages
from both sides and above. Both retain 48 packed archers, 384 ordinary placed
actors plus 336 landing crew, two heroes, and twelve ship runtimes. UI checks
verify start and reset without restarting the scene clock. This is functional
local RTX 3070 evidence, not hub timing, mobile qualification or owner approval.
The older -01 capture records the earlier intersecting center-line candidate.

Shadows are visible in the real scene but the broad 2048 battlefield shadow map
does not qualify close-up self-shadow quality or final cost. Walking/retreat,
weapon response and camera require owner motion review. The new
[playable-hero plan](../plans/2026-10-04-troy-playable-heroes.md) requires both
player choices, light/heavy attacks, blocking/stamina and a tunable fighting bot.
Other full-goal requirements and the earlier WebGL2 aerial-return failure remain
open. No commit, push, publication or deployment is authorized by this checkpoint.
