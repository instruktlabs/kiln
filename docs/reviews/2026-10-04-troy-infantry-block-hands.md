# Troy shielded infantry and block-hand intake

The default scene now uses the reviewed solid block style on all 336 ordinary
formation infantry, as well as the 48 archers and two heroes. Fleet crews still
use their earlier hand source and require a coordinated rowing, unload, idle and
marching rebuild. This checkpoint advances the full goal without closing it.

Exact new standalone children are Greek soldier
`r_ef912524e95a4afba6ae399ad07c2280` (`p_3338cb2547eb`) and Trojan soldier
`r_48286541b5df4e87b31080d01e199874` (`p_55765f4e66c1`). Their parents are the
previously saved shield-equipped candidates, not the earlier shield-less live
scene assets. Both children preserve exact pinned materials, embedded images and
non-hand geometry. The original parents and the old live inputs remain intact.

Each wrist now has one solid 70 x 95 x 50 mm beveled block without separate
fingers, thumb, heel or grip hole. Sword and shield grips lie inside the block
envelope. The shield handle runs along its back against the bracket; the hand
stays behind the plate. The left socket and shield-frame mounts deliberately
changed. Wrist quaternion channels are intentionally straightened in idle and
attack; all other rest transforms and animation channels are preserved. Source
images and six-phase attack sheets received material-faithful GPU review, then
both children were saved and rebuilt to exactly matching GLB hashes. Relevant
parent tags and attribution were retained. These facts do not imply owner approval.

The new `runtime/infantry-v1/{greek,trojan}` banks each have 27 parts, 91 frames
and 58,968 bytes. They include the three shield parts absent from the old live
bodies. Independent endpoint, offset and reverse probes checked 170 times per
faction, 944,350 Greek vertices and 872,950 Trojan vertices. Maximum decoded
surface error was 1.030 mm against the source pose. Decoded hand triangles retain
the checked 1 mm separation from shields, helmets and cuirasses. Bounds were
checked with a 3 mm allowance. This is sampled evidence, not a continuous guarantee.

Both factions produce identical idle transform bytes. This establishes a
potential shared atlas input, not an adopted GPU allocation saving; part binding,
resource lifetime and a matched workload still need qualification.

Because archers reuse the Trojan body, their current input and bank are now
`runtime/archer-v5` and `output/archer-bank-15`. Bow, hand donor, controller and
ballistics are unchanged. The bank remains 65 parts, 560 frames and 2,988,160 bytes,
with a new exact body pin. Its independent saved-bank surface, wrist and contact
checks pass. Historical archer-v4 receipts retain their original source scope.

All 136 current scene tests and four authored geometry/contact tests pass.
Source idle and attack clips were checked at 81 phases per clip per faction,
including 1 cm blade/shield and shield/torso separation. Six current scene
captures cover Greek ranks, Trojan ranks and archer draw on WebGPU and WebGL2.
At scene time zero, wall-guard-12 has its normal 4.5 s phase offset and is aiming;
these captures use the default distributed archer phases. Both saved children
were also presented and checked through the actual Library revision flow.

The new Greek/Trojan ranks views expose their hands and equipment for inspection.
Console inspection found no warnings or errors. Local Auto water differed between
backends. Bronze shield faces and greaves look very dark under existing scene
lighting and remain an appearance-review item. These screenshots do not qualify
backend pixel parity, animated shadows, performance or owner acceptance.

Exact hashes, current source snapshots, test output, bank checks and captures are
in `troy-expansion/scene/evidence/infantry-block-hands-01/receipt.json`.
`scene/output/infantry-block-intake-01` retains old live sources and inputs;
`troy-character-repair-2026-10-04/ws/work/infantry-block-integrity.json` records
the separate source preservation and exact rebuild. No engine runtime change,
commit, push or deployment is part of this checkpoint. Fleet hand/grip adoption,
resource sharing, full-workload hub/device performance, composition, reusable
workflow/skill qualification and final acceptance remain open.
