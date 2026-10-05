# Troy shore regrouping reference — 4 October 2026

The eight shore crews can now leave their staging positions and march into eight
reserve formations behind the existing Greeks. This is an opt-in CPU reference,
not a performance-qualified default or a finished army system. It preserves the
same 224 actors across rowing, unloading, shore idle, marching and formation idle.
The four offshore ships still hold at sea.

Preview: `http://127.0.0.1:4420/?shorefleet=1&regroup=reference&fleetCulling=on&view=shoreFleet`.
Use Marching crew near 390 seconds and Reserve formation at End. The complete
shore sequence ends at 454.415 seconds; the displayed endpoint rounds to 455.
Omitting `regroup=reference` retains the previously qualified shore-idle behavior.

## Implementation and route evidence

Work remains in the external `troy-expansion/scene` workspace under
`/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/`. No engine runtime,
installed skill, accepted asset revision or public deployment changed.

Each unit waits until its last actor has unloaded, holds for 12 seconds, blends
out of shore idle over 1.2 seconds, then walks to its reserve position. Actors turn
on lifted feet before and after travel. Units finish together, facing the wall;
their reserve spacing expands to 1.8 m across and 2.1 m between rows. Reserve centres
span X −84 to 84 at Z 120, behind the existing formations at Z 147 and 181.

Footprints use the actual rendered sand triangles, transformed into the landing
frame. The sampled terrain is invariant across X in this region, checked against
2,509 rendered vertices. The sand support finder explicitly permits a 1 mm sole
fit tolerance across triangle creases. It does not relax the existing ship/plank
support checks or authorize stepping over ledges. Changed ship frames, landing
clocks and actor rosters are rejected before applying these stored routes.

`scripts/plan-regroup.mjs` produced 83,998 footsteps across 224 routes.
`output/regroup-02/plans.json` is 15,524,706 bytes, SHA-256
`2907dd116d69508695ee8dc4274b12f24b56fe54bb2e13f67821c71c36407467`.
The runtime uses the existing branch-based CPU pose solver, with explicit pose
ownership and deterministic reverse seeking. Completed units currently idle on
CPU at their new positions. This data size and CPU path are reference costs to
reduce before promotion.

`evidence/regroup-02/gait.json` records 336,216 quarter-step poses:

- Maximum ankle-target error: about 6.1e−14 m.
- Maximum planted sole error and sampled swing penetration: under 1 mm.
- Maximum pelvis lowering: 5.39 mm.
- Maximum phase-join matrix discrepancy: 7.4e−12.

`spacing.json` records 910 half-second samples and 22,728,160 actor-pair checks.
Closest crew centres stay about 0.898 m apart; distance to existing formation
centres stays above 20.69 m. These are sampled centre distances and foot-contact
checks, not continuous whole-body collision proof or a general navigation system.

## Render checks and discovered capture issue

34 scene tests pass, including phase joins, deterministic reverse seeks and
rejection of stale frame/clock/roster inputs. The frame-mismatch investigation is
retained in failed receipts `regroup-scene-01` through `03`: the capture read live
CPU poses before the renderer had submitted the requested time. A fixed 450 ms
sleep was insufficient. The capture now requires two completed render frames at
the requested time, using explicit frame/time diagnostics.

`regroup-scene-04` passed ten captures per backend on WebGPU and WebGL2, verifying
actual instance bindings, backend identity, actor IDs and population totals through
forward and reverse seeks. WebGPU repeated captures at 0, 390 and 455 seconds are
pixel-identical. Ground-level marching, formed crews and aerial route captures
were inspected. Final `regroup-scene-05` checks pass 20 captures per backend.
All 20 culling off/on pairs and all 12 repeated forward/reverse pairs across the
two backends are pixel-identical. Maximum actual instance-matrix error is
7.63e−6, consistent with float32 storage. The checkpoint retains source snapshots,
34 passing tests, capture receipts, parity results and a hash-bound provenance file.

## Remaining work

Measure and reduce the reference's plan storage, CPU posing and final idle cost;
preserve terrain contact and exact actor identity when selecting baked or hybrid
representations. Complete later offshore landings, natural equipment handling,
hull trim/wave contact, army range/device policy, archery and hero choreography.
The retained performance hitch, physical mobile tests, owner motion review,
environment/traversal work and reproducible Cloudflare delivery remain open.
No new performance or mobile acceptance is claimed by these functional captures.
