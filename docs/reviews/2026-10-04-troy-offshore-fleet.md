# Troy offshore fleet integration — 4 October 2026

Four offshore ships now use the repaired vessel and 28 seated rowers each in the
full composition. This replaces their six standing placeholders per ship with
112 persistent crew identities. The previously qualified 28-person landing ship
remains active. Seven older shore ships remain to be replaced and integrated.

Preview: `http://127.0.0.1:4420/?fleet=1&view=fleet`.
All changes are in the external `troy-expansion/scene` and `runtime-lab` workspaces.
The default composition without this query remains available for comparison.

## Behavior and rendering

`scene/web/fleet-plan.mjs` defines 14 pairs per ship, exactly one person per oar,
and deterministic ship-qualified IDs. Ships use staggered starts, accelerate and
decelerate smoothly, and travel from Z −185 to −105. Rowing stops at the recovery
pose. These are offshore approach segments, not four completed landing routes;
they hold outside the active landing lane after their approach.

`scene/web/fleet-rowing.mjs` uses the immutable landing-v10 ship/crew/bank payloads
with hash checks. It constructs no CPU character rigs. The four ships share three
GPU crew material batches and 40 ship-part batches. Their crew atlas is 4,219,488
bytes. The one-ship landing controller currently allocates its own copy of the
same atlas; sharing that allocation is future resource work, not an achieved saving.

Oars and crew use the same ship transform and stroke clock. Swords remain at hips;
planks stay folded/stowed offshore. Ship size is unchanged. All 112 crew keep IDs
through forward playback and reverse seek. The composition contains 590 ordinary
soldiers (398 Greeks and 192 Trojans), two heroes and 12 ships in this mode.

## Qualification and limits

- Scene suite: 14 tests passed, including roster conservation, one actor per oar,
  deterministic IDs, monotone approach, stop phase and timeline continuity.
- `runtime-lab/evidence/offshore-fleet-01/spacing.json`: 38 conservative corridor
  comparisons, no overlapping bounds; smallest separation 30.17 m. Minimum
  conservative terrain clearance 6.09 m. Bounds cover 49 sampled oar poses and
  complete translation corridors, compared with seven static ships and the active
  landing's retained swept box. This is not continuous wave/contact/navigation proof.
- Browser evidence lives in `scene/evidence/offshore-fleet-02/{webgpu,webgl2}`;
  the earlier `offshore-fleet-01` captures retain the initial, too-tight overview.
  Six captures per backend cover start, close rowing, intermediate approach,
  offshore holding, primary unloading completion and reverse seek. Counters assert
  112 distinct offshore crew plus 28 distinct primary crew, and zero character IK
  evaluations in the offshore controller. Visual checks include boat/crew placement.

No timed performance run or physical mobile qualification occurred. Frustum culling
is still disabled for these dynamic batches, and all crew geometry is submitted.
Existing battlefield shadow coverage does not qualify shadows over the entire sea.
Hull trim and interaction with animated waves remain unfinished. No owner acceptance,
project repinning, public deployment or core/installed-skill modification is claimed.

Next: replace the seven shore ships, establish coherent disembarked crew rosters and
landing/staging routes, share fleet resources and implement measured culling/range
policy. Retain the full army, archery, optional duel, environment and release goals.


## Subsequent later-landing trial

The earlier holding-offshore limitation is superseded only in the new opt-in
`lateLandings=1` combined preview. Four outer bays preserve the existing eight
landing frames and the X-invariant terrain support. The additional112crew retain
original scene IDs through approach, GPU/CPU ownership, unfolding/lowering planks,
single-file unloading and shore idle. Landing starts stagger by6seconds and all
later crew finish by595.175seconds. Existing224crew can still regroup; the later112
remain staged rather than gaining unqualified onward routes.

The first version left84rowers on CPU during final approach; a browser assertion
failed in `late-rowing-fail-01`. Row-all playback now reuses the existing bake with
shared texture leases and performs zero CPU rowing-rig evaluations at the handoff.
Focused tests also caught a needless60second hold and sideways approach relative
to hull heading; both are fixed. No asset edit or rebake was needed.

Final `scene/evidence/late-landings-04/{webgpu,webgl2}/` captures pass counts/IDs,
completion, frame continuity and reverse seeks (nineperbackend), with source copies.
All53scene tests pass in `late-landings-03/tests.tap`. Sampled whole-ship AABBs have
zero horizontal overlap in11,362checks across299times; minimum gap7.84m. Actual
coarse terrain X-invariance confirms reuse of the local supported routes.
These are not continuous collision/buoyancy, whole-body motion acceptance, mobile
or combined performance qualification. Earlier receipts retain their scopes.
See the scene's `LATE-LANDINGS.md` for reproduction and remaining limits.
