# Playable heroes checkpoint

4 October 2026. The owner's playable-hero request now has an initial working
arena in the actual local Troy preview. This extends the earlier paired
reference and remains part of the active full completion goal.

Choose **Play as Achilles** or **Play as Hector**. The other hero is a bot.
WASD moves relative to the opponent; J is light attack, K heavy attack, and
held Space blocks. On-screen attack, movement and held-block buttons are also
available. Health/stamina bars, Pause/Resume, Rematch and Leave fight complete
the initial flow. Loss of focus/hidden tab clears held inputs and pauses play.
The camera follows the selected hero. Leave/Reset restores the default face-off;
Watch paired duel restores the seekable reference. Fleet time is independent.

`web/hero-combat.mjs` separates deterministic 120 Hz combat rules from the browser
and rendering. Light/heavy attacks have stamina costs, wind-up, active and
recovery periods. Range and facing decide one hit per attack. Held guard drains
stamina and blocks damage; heavy attacks pressure/break a depleted guard.
Hit interruption, regeneration, exhaustion, victory/draw and rematch have
explicit states. Fixed arena bounds and body separation prevent overlap.
These are tunable initial rules, not accepted combat balance.

The bot observes buffered opponent state at least 240 ms old, thinks at bounded
intervals, approaches attack range, defends against observed wind-ups, chooses
light/heavy attacks and retreats at low stamina. It consumes the same combat
rules and costs as the player. Its deterministic decision/event traces are
available through `troy.stats().combat`. This is a working state-machine
opponent; owner playtests, recovery punishment, lateral tactics, difficulty and
balance still need work before calling it a good final opponent.

`web/hero-combat-rig.mjs` applies feet/arm IK to the two cloned saved GLBs.
Live steps retain world-space stance anchors, align soles to the slope, and
lower the pelvis when required for leg reach. Weapon poses include wind-up,
strike, guard, parry and hit response. Masters and their revisions stay unchanged.
The paired reference remains exactly seekable; stateful live combat is replayed
from inputs rather than rewound by the reference scrubber.

An actual-scene geometry check caught intersecting blades in the first live
heavy parry. A focused regression reproduced it before the fix. Attack paths
now follow their timed targets directly, and defense reaches the blade-face
target by the contact deadline; general response smoothing no longer delays a
committed parry. The failed -03 contact receipt and earlier candidate sources
remain retained. The initial -01 browser harness failure was an empty stylesheet
argument; it is also preserved. -02/-03 blur checks began already paused and do
not independently prove blur pausing; the -04 check explicitly starts unpaused
before dispatching blur.

110 scene tests pass, including both playable choices, stamina/guard rules,
range misses, one-hit/interruption/terminal/reset behavior, arena separation,
delayed bot decisions, matching results at 60/120 input frame partitions,
live foot/headgear checks and active heavy-parry surface separation. Existing
environment, landing, formation and archer tests remain passing.

`evidence/hero-play-04/{webgpu,webgl2}/receipt.json` records 36 actual-scene views
per backend, with both player choices and real keyboard/button actions. Both
retain the 48 packed archers, 720 ordinary/landing actors, two heroes and twelve
ships. Rematch, leave and actual blur-pause checks pass without resetting fleet
time. Current rig matrices are retained alongside each capture. The associated
`contacts/receipt.json` checks those actual transformed meshes: minimum sampled
sole gap 0.3 mm, weapon/headgear-or-torso clearance at least 27.55 mm, and blade
gap 0.3 mm. Repeated paused right/left views retain identical posed matrices.

`evidence/hero-modes-01` verifies transitions from either playable choice into
the paired reference and then face-off on both backends. Reference blade-face
gap remains 0.3 mm. This is functional local RTX 3070 evidence, not isolated hub
performance, physical mobile qualification or owner approval.

Gameplay hits currently use range/facing proxies. Mesh-surface checks at saved
poses do not establish continuous swept-blade collision or contact agreement
for every moving attack. That, interruption/turning/retreat motion, camera feel,
input latency, richer bot tactics, close-up shadow quality and full-scene cost
remain hero priorities. Both current GLBs carry swords and no shields; blocking
uses sword guards/parries. Mathcat was inspected but not installed: its current
documented exports provide math helpers and no dedicated IK solver was found.
See the [playable plan](../plans/2026-10-04-troy-playable-heroes.md).

Other full-goal work remains active: later-crew destinations and city routes,
complete workload/performance/device targets, resource/shadow/culling checks,
other-input derivative workflow proof and reusable skills, asset revisions and
reproducible site delivery/owner acceptance. The earlier WebGL2 exact aerial
return failure remains open. Nothing was committed, pushed or deployed.

Latest playable weapon-contact checkpoint: damage and sword parries now use
actual blade and authored torso/head geometry at the fixed 120 Hz simulation
clock, with bounded relative vertex sweeps. 120 scene tests pass. Both hero
choices retain light/heavy attacks, block, stamina and a delayed opponent.
Source and impact proof: scene/evidence/hero-play-06 and hero-modes-02.
The current full-scene cost still needs quiet-hub measurement; motion, camera,
bot balance/owner playtests and other completion work remain active.
Engine review: docs/reviews/2026-10-04-troy-weapon-contact.md.
