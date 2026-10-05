# Troy playable weapon contact checkpoint

The playable Achilles/Hector prototype now resolves damage from the displayed
consumer rigs at every 120 Hz simulation tick. `web/hero-weapon-contacts.mjs`
reads the saved sword blade triangles and the opponent's authored cuirass,
head and helmet triangles. Hilt geometry is excluded. Holding block requires
an actual blade interception; distance/facing alone no longer grants damage
or protection. Rules-only hosts without a contact port cannot invent hits.

Contact remains eligible throughout the active interval and resolves once.
A miss is recorded after that interval, allowing a moving target to enter
the strike later. Equal-tick contacts are gathered before damage so attacks
can trade. The browser renders the same pose sampled for contact and avoids
advancing live foot/arm IK on a separate render clock. Attack reach was adjusted
after the actual meshes showed the previous unblocked strike stopped 55–63 mm
short of the cuirass at 1.2 m separation.

This is a bounded gameplay contact model. Hurt regions cover the torso and
head, with a declared 30 mm skin to keep metal outside visible body geometry.
Parries use a 0.5 mm skin around the deliberately separated blade faces.
Relative linear vertex sweeps detect contact between fixed samples and account
for each rigid hurt mesh's motion. The first active tick clips away the
preceding wind-up segment. This does not qualify exact rotational physics,
all limb hit regions, network combat or every possible moving interaction.

120 scene tests pass with no failures or skips. Focused failures first
demonstrated the old automatic in-range hit, premature miss resolution and
automatic held-block protection. Tests also cover overlapping bounds with
separated triangles, tunneling, relative target movement, clipping of the
inactive sweep, both heroes' light/heavy hit and guard geometry, successful
bot hits, and matching actual-rig combat results at 60/120 input partitions.
Existing environment, landing, archer and paired-reference tests remain green.

Final browser evidence is `evidence/hero-play-06/{webgpu,webgl2}` in the private
scene workspace. It retains source identities, 36 actual-scene views per
backend, both hero choices, real keyboard/button actions, rematch/leave/blur
checks, mesh snapshots and impact matrices. The `contacts` receipts check
saved visible poses; the `hit-events` receipts independently reconstruct
recorded impact transforms against pinned asset geometry. Earlier -04 and -05
evidence remains historical. `hero-modes-02` checks return to the paired
reference and default face-off with the current source.

These are local RTX 3070 functional checks. Current full-scene performance
with fixed-step rig/contact work needs isolated hub measurement. The master
GLBs, saved asset revisions, engine runtime and maintained skills are unchanged.
No commit, push or deployment was performed.

The full completion goal remains active. Hero work still includes motion and
camera/input feel, interruption/turning/retreat coverage, fairer bot tactics,
balance and owner playtests, and complete-scene shadow/resource/device costs.
City routes and later-crew destinations, unrelated-input workflow qualification,
asset revisions, installed skills and reproducible site delivery remain open.
The earlier WebGL2 exact aerial-return discrepancy remains open as recorded.

See the [playable hero plan](../plans/2026-10-04-troy-playable-heroes.md) and
[full completion plan](../plans/2026-10-04-kiln-troy-completion-plan.md).
