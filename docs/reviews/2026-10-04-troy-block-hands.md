# Troy block hand replacement

Current scene intake: all 48 packed archers now use the saved single-piece block
hands via runtime/archer-v3, child r_2afc9ff07e944c70be5236f263c3f9bc. Surface-derived
bow/draw mounts replace articulated fingertip/heel dependencies, and the bow arm
extends properly at full draw. 130 scene tests pass; current sampled bank and
both-backend pose evidence are recorded in evidence/archer-block-intake-01.
Read kiln-oss/docs/reviews/2026-10-04-troy-archer-block-hands.md. Fleet, infantry
and hero block-hand adoption, affected banks, current shadows/full workload costs,
devices and owner acceptance remain open. Earlier not-integrated block wording
and selected-mitt descriptions below are historical where superseded.


The owner rejected mitt child `r_56a63955df434655be9a11d0afdb01dd` in the
actual Library view: the wide finger chain projects sideways from the wrist and
the separate thin thumb looks wrong. Its numeric grip passes and archer intake
do not establish visual acceptance. It must not be treated as the selected style.

Replacement child `r_2afc9ff07e944c70be5236f263c3f9bc`, on asset
`a_7da693c39d774fd89e584cb99fd238b6`, uses one solid chamfered block per hand.
There are no visible finger segments, thumb meshes, heel or openings. The hand
follows the wrist's downward axis rather than the old tilted grip frame. Its
outer dimensions are 70 x 95 x 50 mm; the 5 mm bevel keeps a simple silhouette.
The mesh attaches through the existing hand frame with the inverse rest transform,
so historical mount frames and invisible pivots stay intact.

The exact source is `p_590bc5044275`, SHA-256
`590bc5044275c42d1661e886effbf7b8f5ff551bbcf1ff7f4116d6c4b4fd6906`;
the GLB SHA-256 is
`bc27825236545247ffe4fea06029637dc23a6551ebfc603382d75e38484e343c`.
Saved rebuild matches exactly. All 37 non-hand mesh geometries/rest transforms,
63 retained node rest transforms and inherited animation channels are unchanged.
The asset has 39 meshes, including two hand meshes, and 2,080 triangles.

The compact-hand test fails against the rejected seven-mesh-per-hand model and
passes against the new one-mesh-per-hand export. GPU close views show the replacement;
the actual saved Library revision was inspected and zoomed to both hands in context.
`troy-character-repair-2026-10-04/ws/work/crew-block-hands-viewer.jpg` is that
current viewer screenshot. Full evidence and preservation are in
`work/crew-block-hands-integrity.json` and the adjacent render/test/rebuild records.

The new blocks are saved and displayed, but are not the current scene donor.
Role contact/draw anchors, attachment poses and affected banks need a new intake:
the previous visible fingertip meshes no longer exist and finger rotation changes
no longer deform these hands. Previous articulated/mitten grip proofs do not
qualify this geometry. The archer-v2 work is retained as a rejected visual checkpoint
with scoped technical evidence. Fleet, infantry and champions need the same simple
style when adopted. Owner appearance approval and the full goal remain open.
