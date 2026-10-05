# Troy archer block hands

Historical archer-v3 checkpoint. The current grip is archer-v4; see
[the natural block grip review](2026-10-04-troy-natural-block-grips.md).
The owner requested straighter wrists and tasteful equipment overlap.


Current local checkpoint: all 48 packed archers use the single-piece block hand
child `r_2afc9ff07e944c70be5236f263c3f9bc` of crew asset
`a_7da693c39d774fd89e584cb99fd238b6`, through `runtime/archer-v3`.
The rejected articulated fingers and wide mitt remain preserved as history.
The donor GLB is exactly the saved 533,804-byte artifact, SHA-256
`bc27825236545247ffe4fea06029637dc23a6551ebfc603382d75e38484e343c`.
The loaded Trojan soldier body and exact bow set are reused. Fleet and ordinary
infantry sources have not changed in this checkpoint.

## Consumer fit

There is one visible hand mesh per wrist, with no separate thumb, fingers, heel
or grip ring. The controller grafts the saved hand frame and uses the actual
decoded block surfaces to derive bow-support and draw-contact mounts. It no longer
expects the removed heel mesh or rotates invisible digit chains to claim a grip.
Matte body and hand skin still join one compatible material/layout batch.

The bow hand uses a separate wrist orientation, tilted ten degrees relative to the
bow. This keeps the bow arm extended at full draw instead of carrying over the
old 135-degree generic grip tilt and producing an overly bent arm. Its full-draw
shoulder-to-wrist span stays at least 520 mm across the sampled pose range, against
540 mm total limb length. The drawing hand retains its established orientation
and outboard elbow route. The carry/raise bow target moves 40 mm inward in Z; the
extension compensates, preserving the final aimed bow point and ballistic origin.

The first block intake passed contact tests but its actual full-draw picture
exposed the bow-arm bend. A focused failing extension test reproduced it; the
separate bow-hand orientation passes that test and the retained anatomy tests.
`archer-bank-10` is the earlier candidate, `archer-bank-11` is an unsuccessful
unreachable-pose bake directory, and `archer-bank-12` is the installed final bank.

## Evidence and scope

All 130 scene tests pass. Source grip/draw tests cover 361 poses, using actual
triangle surfaces for the solid hand contacts. Existing drawing-arm anatomy,
head/cuirass clearance, helmet/string clearance, string lengths/attachments,
reverse/loop motion and ballistic/sole checks remain passing. The old separate
finger/thumb checks were replaced by block-surface tests rather than retained as
irrelevant acceptance claims. Unused old measurement helpers were removed; eight
affected tests passed again after that cleanup.

The final bank has 65 parts, 559 frames and 2,982,824 binary bytes. Independent
saved-bank validation checks 566 times and 3,493,076 visible vertices: maximum
position error 1.335 mm and maximum deforming normal error 0.003267 radians.
The decoded palm's radial distance to the 30 mm bow handle lies between 30.383
and 30.871 mm. The largest sampled decoded draw-contact/held-nock gap is 0.672 mm.
These are sampled limits; the bank verifier permits 2 mm position/contact error,
and does not certify every continuous time.

`scene/evidence/archer-block-intake-01/receipt.json` pins the bank, source snapshots
and current WebGPU/WebGL2 retrieval/draw/release screenshots. Those are basic
actual-scene appearance and console checks, not pixel-parity, shadow, performance
or owner-acceptance evidence. Input, source and binary hashes stay enforced by the
live scene. Earlier bank and browser receipts qualify only their recorded source
identities.

## Next

Adopt this same simple style for fleet, infantry and champions, preserving actual
oar/sword/shield contacts and rebuilding affected banks/bounds. Qualify current
shadows and complete-workload hub/device performance, startup, resources and
culling after the character intake is coherent. Later routes, gameplay/bot feel,
reusable derivative/skill proofs, site delivery and owner acceptance remain open
under the full active goal. No render-time improvement is claimed from the
smaller bank or fewer parts alone.
