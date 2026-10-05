# Troy articulated hands, 4 October 2026

Latest owner correction: the mitt child r_56a63955df434655be9a11d0afdb01dd is
REJECTED visually, including the archer-v2 style. The replacement is child
r_2afc9ff07e944c70be5236f263c3f9bc: one compact solid beveled hand block per wrist,
no sideways finger slab, separate thumb or opening. It is saved, exactly rebuilt,
GPU-reviewed and displayed in Library 4538. Read the newer
kiln-oss/docs/reviews/2026-10-04-troy-block-hands.md. This new geometry is not yet
the live scene donor; role anchors/attachment poses and banks require new intake.
Old hand contact passes do not qualify it. Earlier selected-mitt wording below is
superseded. The full goal remains active and owner appearance approval is pending.


Current checkpoint: owner-directed simple mitts are integrated into all 48 packed
archers via runtime/archer-v2. The exact saved child remains
r_56a63955df434655be9a11d0afdb01dd. Matte body/hand skin now shares a compatible
batch; bow position and normal fitting are qualified by sampled bank checks.
129 scene tests and basic current WebGPU/WebGL2 retrieval/draw/release inspection
pass. Read kiln-oss/docs/reviews/2026-10-04-troy-archer-mitts.md and the scene receipt
at evidence/archer-mitt-intake-01/receipt.json. Fleet, infantry and hero mitt
consistency, affected banks, current shadow/performance/device/owner acceptance
and the wider full goal remain open. Earlier checkpoint claims below are history
where superseded by this intake. The final bank payload reduction is 5.2%; no
rendering cost improvement is claimed.


## Owner correction: use simple mitts

The owner rejected child `r_00edefd5963743359d8c019aefd27184` as creepy and
crab-like. Its detailed-finger evidence below is historical and does not establish
visual acceptance. The next candidate follows the requested simple mitt style:
one broad rounded finger band, a thumb, and open empty-hand rest poses.

The selected candidate is child `r_56a63955df434655be9a11d0afdb01dd` of that
rejected revision, on the same asset `a_7da693c39d774fd89e584cb99fd238b6`.
Program `p_9d5326b18385`; source SHA-256
`9d5326b18385f6a9c61f91d192da84c315df53d59bc9760873d0c5ae569e1350`;
GLB SHA-256 `bb749ef290903b65231a4c3d2e2544c2c28ad379f5be3d1e5587a099921544b4`.
It saves and rebuilds exactly. `work/crew-mitt-integrity.json` verifies all 37
non-hand geometries, joint positions/scales and inherited animation channels.
Eighteen individually visible finger meshes are removed, reducing meshes from 69
to 51. The named draw-contact joint and closure pivots remain. All 28 digit rest
rotations intentionally become the open pose. Closed mitts use `[81,35,50]` and
thumbs `[-75,-35]` in the isolated `mitt-hand-fit.mjs` profile.

`crew-mitts-08.png` and `crew-closed-08-review.png` / `crew-open-08-review.png`
were inspected as material-faithful, nondegraded GPU views. Two mitt tests pass,
including both hands at 101 release amounts, and the isolated archer mitt adapter
passes 361 bow/draw poses. The prior 81.5-degree closure failed the wider mitt
surface test by 0.17 mm; the 81-degree profile clears it. These are sampled surface
and source-preservation checks, not continuous collision or owner acceptance.

The new candidate is still isolated from live 4420 and its motion banks. Promote
the **mitt** profile and archer qualification-copy changes at intake, not the
rejected detailed-finger profile. Carry the owner's simple-mitt style across
heroes and infantry too, while keeping their smaller weapon-grip contracts.
The owner's shared-body/equipment optimization direction is recorded in the
[character-kit plan](../plans/2026-10-04-troy-character-kit.md).

## Earlier detailed-finger checkpoint

The revised articulated crew asset and two consumer adapter candidates are saved
locally. They are **not integrated into live Troy**. Live heroes retain the previous
qualified shield checkpoint; infantry, rowers and archers retain their prior sources.
The full delivery goal remains active.

## Exact candidate

Author workspace:
`C:/Users/Mattm/X/kiln-dogfood/v1-readiness-2026-10/review/troy-character-repair-2026-10-04/ws`.

| Item | Identity |
| --- | --- |
| Asset | `a_7da693c39d774fd89e584cb99fd238b6`, Greek articulated crew |
| Recovered parent | `r_f4a087b9a61745cdadb217617c98ac54` |
| New child | `r_00edefd5963743359d8c019aefd27184` |
| Program | `p_44084145fe3d` |
| Source SHA-256 | `44084145fe3df5266ed3663956e4f8491b144e37b4f11b9891d5ec94f62f8a06` |
| GLB SHA-256 | `f938bac7323df62e957bb92c837b54b587855063d69b9eaeda214cf31587355e` |

The recovered source is `troy-expansion/motion/output/greek-crew-02.kiln.js`.
Its rebuild exactly matches the live `scene/web/runtime/landing-v10/crew.glb`,
SHA-256 `85451321e884eb8144da37f6882880ce773634bcd40a64cb49b0a56a91dc1aa4`.
This derivative had no saved crew asset record, so intake preserves it as a separate
immutable parent. It does not replace the standalone Greek soldier or imply its
original authorship.

Rounded palms, wrist bridges, tapered finger segments and thumb pads replace the
box palms and blunt digits. Matte skin replaces linen texture on the body and hands.
The oar grip remains 30 mm in radius; this is separate from the heroes' 14 mm sword
grip. The legacy +Z-forward convention, all joint positions/scales, 37 non-hand
mesh geometries, gear and all exported animation channels remain exact.
Twelve finger/thumb rest rotations intentionally change. Closed fingers use
`[81.5,35,50]` degrees; thumbs use `[-75,-35]`. Open poses remain `[0,8,10]`
and `[15,-15]` respectively. The old live closure angles do not fit the new candidate.

## Evidence and limits

`work/crew-candidate-integrity.json` records exact saved/rebuilt GLB equality and an
unchanged recovered parent. `crew-hands-06-preservation.json` compares decoded
indexed triangle position/normal/UV data, node transforms and animation channels.
The candidate has 69 meshes and three distinct materials, as before; GLB size is
604,064 bytes versus the parent's 604,844. These counts are not performance evidence.

Material-faithful, nondegraded GPU views were inspected in `crew-hands-06.png` and
the closed/open `crew-*-06-review.png` fixtures. Fixture handles are deliberately
absent from the saved source and GLB. The in-loop capture truthfully reports
`exactArtifact: false`; the evaluated build separately matches the saved GLB.

Three focused closure tests pass after observing the old closure's failure:
both hands close within 1 mm of a 30 mm cylinder, 101 sampled release amounts keep
the projected triangle surfaces outside it, and invalid amounts cannot change joints.
Projected surface distances include triangle interiors and conservatively consider
an infinite cylinder. They do not prove continuous motion, general solid collision
or every ship pose. Wrist/palm bridge surface gaps are zero in five sampled amounts;
this is contact evidence, not proof of a welded solid.

An unchanged-archer probe at 361 poses aligned its IK frames but left the new palm
43.546 mm from the bow's axis, about 13.5 mm off the 30 mm grip. No grip penetration
was found in that probe. The old adapter also overwrote donor matte skin with linen.
Both failures were observed in focused tests before preparing an isolated correction.

`work/archer-hand-fit-reference.mjs` is a qualification copy of the current controller,
generated with exact recorded anchors. It uses the unshifted hand socket for the bow,
the candidate closed angles on the left, and donor skin on the graft and body.
Right-hand hook/release angles, contact-tip location and outboard elbow plan remain
unchanged. Two tests pass: real bow palm/finger/thumb surfaces stay outside the grip
and close within their recorded 1–1.5 mm tolerances through 361 poses; the matte
material reaches the body without changing source bindings. This is not a second
production controller. Its recorded changes must be promoted to the maintained
scene controller during intake, then the qualification copy can remain evidence.
Archer GPU pose/appearance, banks, anatomy/contact/shadow qualification and cost are
still open for this candidate.

## Next integration sequence

1. Promote the tested closure and archer fit/material changes with focused scene
   regression tests. Pin the exact new crew child independently of the infantry
   masters. Check rowing, parking, release, exit, draw and recovery against actual
   surfaces, not only IK frames.
2. Generate new rowing, unloading/travel, shore idle, shared walk, formation idle
   and archer banks using the actual new geometry and controllers. Preserve old
   versions. Recompute bounds and source/payload identities; never update an old
   source hash to make its transforms appear rebuilt.
3. Adopt the already saved Greek/Trojan shield and hand children for infantry with
   explicit role policies: rowers use oars and stowed swords; archers use bow/quiver
   hands; infantry carry shields. Rebuild affected base crowd derivatives separately.
4. Qualify actual scene motion, reverse seeks, handoff transitions, culling, shadows
   and resource identities on both backends. Then obtain current full-workload costs
   on the quiet hub and owner review. Feed demonstrated hand/fit lessons into
   maintained skills without imposing Troy's dimensions on standalone assets.

No scene performance claim, owner acceptance, commit, push or deployment is made.
