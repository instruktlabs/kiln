# Troy shore fleet integration — 4 October 2026

The combined prototype now replaces all 12 original ships with the repaired vessel:
four offshore ships carry 112 seated rowers, and eight shore ships have 224 persistent
crew. At scene start, four shore crews have landed, three are unloading at different
stages, and the primary ship is approaching. The remaining shore crews finish their
single-file exits by 337.175 seconds. Offshore crews still hold at sea after approaching;
this does not establish their eventual landing routes.

Preview: `http://127.0.0.1:4420/?shorefleet=1&view=shoreFleet`.
Earlier query modes remain available. Work is external to the engine in
`/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion`.

## Population and identity

The old 48 staging people and 48 aboard/unloading placeholders are removed in this
mode, replaced by actual crew rosters. There are **720 ordinary soldiers**: 528 Greeks
(192 formation soldiers plus 336 ship crew) and 192 Trojans, plus Achilles and Hector.
This is an implemented prototype population, not a measured device capacity promise.

Ship IDs remain stable. Every crew actor retains its ship-qualified identity across
rowing, standing, walking, shore staging and reverse seek. Shore positions are lateral
copies of the qualified dry-shore frame, at 60 m spacing; the primary remains X=66.
This copies the existing beach-specific footprint recipe, not a general navigation
solution. It must not be used on arbitrary terrain without rebuilding the routes.

## Runtime

- `scene/web/shore-plan.mjs` owns eight placements and their starting phases.
- `scene/web/shore-fleet.mjs` loads the retained landing-v10 assets and recipes once,
  verifies hashes, and creates the persistent crews. CPU rigs remain local to each
  ship; placement transforms are applied during draw preparation.
- `scene/web/framed-pose-instances.mjs` and `instance-selection.mjs` compact visible
  CPU actors into 69 part batches across all eight ships. Actor identity is separate
  from the compact draw slot; invalid selection updates leave the mapping intact.
- Eight ships share 40 part batches. The primary rowing crew uses three GPU batches
  until handoff. Its 4.02 MiB atlas is allocated once for the shore runtime; the four
  offshore ships still have their own copy. CPU rigs are constructed for all 224
  shore actors; already-finished poses stop updating. No loading/memory win is claimed.

## Evidence

`runtime-lab/evidence/shore-fleet-02/spacing.json` records:

- 3,281 vertices on the actual 192-segment terrain grid, covering Z −100 through 100,
  have exactly equal height across each X row. The resulting triangles therefore
  preserve the existing route's support under lateral translation in that region.
- 677 half-second samples and 18,956 shore ship-pair checks. Bounds include 49 oar
  phases at both parked offsets and 101 poses per plank deployment phase. Adjacent travel boxes give a minimum ship
  gap of 2.320 m; padded cached crew-route bounds give 10.910 m cross-lane clearance.
- 32 comparisons with retained offshore swept bounds; minimum gap 29.883 m.

These are sampled geometry/route checks, not continuous whole-body collision or
wave-contact proofs. The primary route's earlier within-ship qualifications retain
their original scope; copying it does not broaden those claims.

Scene tests: **16 passed**. Browser evidence under
`scene/evidence/shore-fleet-02/{webgpu,webgl2}` covers start, rowing, handoff,
unloading, intermediate and completed shore staging, then reverse seek.
The prior `shore-fleet-01` captures retain the first visual integration check.
The final captures pass on both backends with zero page errors. They compare actual
instance matrices with the intended actor-plus-ship transforms (maximum entry error
7.63e-6) and verify CPU slot counts of 196 before handoff, 224 afterward and 196
after reverse seek. All 224 shore crew reach staging.

## Remaining work

No timed performance run, physical mobile qualification or owner acceptance occurred.
Dynamic batches still disable culling. Shore crews stop at their staging positions;
regrouping into armies, final idle transitions and the offshore ships' later landings
remain. Equipment handling, hull trim/waves, cloth/gait refinement, archery, heroes
and optional duel, environment polish, shared resources, measured range/device policy,
owner review and Cloudflare release remain in the full goal. Assets/project pins,
engine tools and installed skills were not changed or published by this checkpoint.
