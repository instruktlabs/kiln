# Troy pack

**In progress; unreviewed by the owner.** Sixteen assets and one reference composition from the
v1 readiness live sessions of 1 and 2 October 2026 (`docs/reviews/2026-10-01-v1-readiness-live-sessions.md`,
sections 7 and 11), refined in an owner-directed material pass. The owner expects to revise
several of them before the pack is official; nothing here is on the site or in its gallery, and
this folder is outside the npm package, the lint scope and the type check. `HANDOFF.md` says how
to continue the work and what the owner wants next.

## What this folder holds

- `assets/<slug>.kiln.js` and `assets/<slug>.manifest.json`: each pick's source and Kiln manifest
  at its newest revision. The sources bind the project's pinned material resources
  (`kiln.library.<sha256>.<map>`), so they run with project `troy` (or those pins), not as
  standalone examples.
- `materials/<id>/<revision>/`: the seven pinned materials with their maps (0.7 MB).
  `troy-limestone` and `troy-mudbrick` are the owner's procedural materials of 2 October.
- `project/`: project `troy`, revisions 1 and 2 (brief, design, inventory, material pins;
  revision 2 pins the two new materials).
- `scene/recompose.mjs`: rebuilds the reference composition from saved revisions, swapping asset
  blocks and keeping the layout byte for byte.
- `inventory.json`: every field below plus parents, dates, tags, descriptions and the R2 URLs;
  `r2-manifest.json`: every object published to R2 with its size and sha256.

Binaries are not in git. Every saved revision's `asset.glb` and `preview.png` (the picks and
their earlier revisions) are on the public bucket at
`https://assets.kilnstudio.tools/troy/assets/<assetId>/<revisionId>/`, the material maps under
`troy/materials/`, and the whole review workspace without its build cache as
`troy/workspace/troy-refine-ws-2026-10-02.zip`.

## Inventory

Metrics are Kiln's at save time (`manifest.build.integration.renderMetrics`). The `warn` on the
masonry is `MATERIAL_IMAGE_COUNT_BUDGET` (the `web.portable.v1/standard` four-image budget);
`GEO_PART_SELF_INTERSECTION` is observe-only throughout.

| Asset | Slug | Revision (parent) | Triangles | Draws | Materials | Textures | QA | Origin |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Wall section | `wall-section` | `r_29dcf948…` (`r_12fa73f2…`) | 168 | 14 | 3 | 7 | accepted/warn | w19, material pass revision 2 |
| Wall section, breached | `wall-breached` | `r_98d0a72a…` (`r_99688a42…`) | 528 | 44 | 3 | 7 | accepted/warn | w25 revision 2 of w19, material pass revision 3 |
| City gate | `city-gate` | `r_932d7b9a…` (`r_bb47b881…`) | 516 | 7 | 4 | 10 | accepted/warn | w34, material pass revision 2; `open` and `close` clips |
| Trojan walk-in house | `house` | `r_de6797d6…` (`r_6a593b8e…`) | 876 | 8 | 3 | 6 | accepted/warn | w31, material pass revision 2 |
| Troy citadel temple hall | `temple-hall` | `r_85c06c03…` (`r_af557a90…`) | 2,024 | 12 | 4 | 7 | accepted/warn | w30, material pass revision 2 |
| Horse | `horse` | `r_f088964e…` (`r_6f5b30d1…`) | 1,324 | 55 | 3 | 4 | accepted/pass | w21, body slimmed as revision 2; `Stand` and `Gallop` clips |
| Late Bronze Age war chariot | `war-chariot` | `r_b277a52b…` (`r_e3bcea17…`) | 4,156 | 16 | 4 | 9 | accepted/warn | f11, refined revision |
| Greek war galley | `war-galley` | `r_89ac2dc4…` | 6,480 | 4 | 4 | 4 | accepted/pass | w28 |
| Bronze Age sword | `sword` | `r_6f63da66…` | 208 | 4 | 2 | 6 | accepted/warn | w15 |
| Round shield | `shield` | `r_b8159cce…` | 1,272 | 10 | 2 | 6 | accepted/warn | w17 |
| Bow, arrows and quiver | `bow-set` | `r_356b134d…` | 1,404 | 34 | 2 | 4 | accepted/pass | w23 |
| Trojan soldier | `trojan-soldier` | `r_036bd9d2…` | 1,860 | 24 | 3 | 6 | accepted/warn | c37; `idle` and `attack` clips |
| Greek soldier | `greek-soldier` | `r_647e60b4…` | 2,000 | 24 | 3 | 6 | accepted/warn | c38, from the Trojan soldier |
| Hector | `hector` | `r_44e1d798…` | 2,224 | 25 | 3 | 6 | accepted/warn | c39 |
| Achilles | `achilles` | `r_a108d7a3…` | 2,424 | 27 | 3 | 6 | accepted/warn | c40 |
| Trojan Horse | `wooden-horse` | `r_7ee4d961…` | 2,060 | 16 | 3 | 6 | accepted/warn | w36; `hatch_open` clip |
| Battle before the gate | `battle-scene-reference` | `r_4573e90a…` (`r_150bbef8…`) | 208,178 | 130 | 28 | 16 | accepted/warn | s50's composition recomposed from the revisions above: a reference for the real scene, not the scene itself |

The sessions named in the origin column (w19, c37, ...) are the live sessions of the report; the
material pass is section 11. Candidates that were not picked (w20, w22, w26, w27, w29, w32, w33,
w35, f09, f13, r47, r48) stay in the private evidence repository's session workspaces.
