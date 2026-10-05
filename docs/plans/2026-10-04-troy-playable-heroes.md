# Playable Achilles and Hector

The [hero shield integration](../reviews/2026-10-04-troy-hero-shields.md) now puts
the exact new champion children into the live scene, with shield-grip IK, actual
posed-shield guard and bounded strike interception/recoil. 124 tests and recorded
headless/dual-backend basic UI checks pass. This advances the equipment extension
below; articulated crew/archer hands, infantry and affected banks remain next,
followed by broader motion/input/bot/shadow/resource and current hub/owner proof.

Latest owner extension: both champions need shields, all visible hands need
role-appropriate anatomy, and champions must read differently from their armies.
The [character equipment checkpoint](../reviews/2026-10-04-troy-character-equipment.md)
preserves four reviewed/rebuildable child candidates in a fresh author workspace.
They are not yet the live scene. Next: shield-grip IK and posed-shield blocking
for both choices, articulated crew/archer hands, infantry/bank integration,
both-backend motion/contact/shadow review and quiet-hub workload cost. The existing
sword-parry prototype alone no longer closes defense/equipment work.

Owner direction, 4 October 2026, following the paired choreography work. The
owner requested a choice of either hero, blocking, swings, heavy attacks,
stamina, IK and a capable fighting bot. This extends the earlier optional
scripted-duel direction. A scripted sequence alone no longer closes hero work.

Keep the default face-off and retain the paired sequence as a reproducible rig
and contact reference. Add a distinct playable match in the existing arena.
The ordinary armies, landings and archers continue their existing scene work.

The initial implementation uses a third-person camera and opponent lock-on.
Choose Achilles or Hector; the other hero is the opponent. Provide movement,
light attack, heavy attack and held block, plus visible health/stamina and reset.
Attacks require stamina, have readable wind-up, active and recovery phases, and
resolve only in range and facing the target. Heavy attacks cost more, recover
more slowly and threaten a depleted guard. Exhaustion, interruption, victory
and rematch must have explicit behavior. Avoid instantaneous repeated hits or
an invulnerable held block. Both sides must support the same complete input flow.

Separate fixed-step combat simulation, delayed bot perception/decisions, input,
camera and asset-specific pose adapters. Record deterministic seeds and input
receipts. The bot manages spacing, defends after observing a telegraph, spends
stamina, retreats to recover and punishes openings. It must not inspect future
input or react in the same instant as a button press. Difficulty/balance remain
playtest decisions; calling the first state machine a good opponent requires
actual owner playtests and evidence beyond unit tests.

Use IK for feet on the arena slope, held weapon targets and timed parries, with
anatomical elbow/knee bend directions and reach limits. Keep master GLBs and
saved revision identities unchanged. Gameplay poses and controllers belong to
Troy's consumer workspace, not shared engine requirements. Foot anchors must
remain planted through a step; pelvis lowering must not relocate a contact to
hide failed reach. Check headgear, torso, weapon and terrain contacts from both
sides, at attack transitions and during retreat and turning.

Mathcat was inspected at the owner's supplied repository. Its README and source
exports describe vectors/quaternions, geometry, easing, noise and randomness;
no dedicated IK solver was found there. Retain the already-tested analytical
two-bone solver initially. Reconsider a math dependency only for a demonstrated
capability or performance need, with a pinned identity and measured result.
Sources: [repository](https://github.com/isaac-mason/mathcat),
[exports](https://github.com/isaac-mason/mathcat/blob/main/src/index.ts).

Hero completion now requires playable flow for both choices, readable and
responsive attacks/defense, a fair tunable opponent, actual equipment/contact
review, stable camera/input and reset, matched complete-scene performance on the
hub and supported-device/owner acceptance. The scripted reference and early
combat prototype are checkpoints. Other full-goal requirements in the
[completion plan](2026-10-04-kiln-troy-completion-plan.md) remain active.

Latest playable weapon-contact checkpoint: damage and sword parries now use
actual blade and authored torso/head geometry at the fixed 120 Hz simulation
clock, with bounded relative vertex sweeps. 120 scene tests pass. Both hero
choices retain light/heavy attacks, block, stamina and a delayed opponent.
Source and impact proof: scene/evidence/hero-play-06 and hero-modes-02.
The current full-scene cost still needs quiet-hub measurement; motion, camera,
bot balance/owner playtests and other completion work remain active.
Engine review: docs/reviews/2026-10-04-troy-weapon-contact.md.
