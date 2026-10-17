# Selected organic helper adoption: provenance and scope

This records source provenance and the integration scope. It is not release or
visual acceptance, and does not override the current engine contracts.

## Original contribution

- Contributor: FaberVi (Vincenzo Fabiano).
- Original PR: https://github.com/instruktlabs/kiln/pull/141
- Original code commit: `e738b29bda2cf7ce6ed7c89b316b7d20474235cf`.
- Original author and committer: `Cursor Agent <cursoragent@cursor.com>`.
- Original trailer: `Co-authored-by: Vincenzo Fabiano <vincenzofabiano92@gmail.com>`.
- Reviewed PR head: `a664d787db4eacb646d54780d5f9e2c09af368a5`.
- Original extraction base: `743965ac` (origin/main when the extraction worktree was created).
- Combined candidate base: `86e369fe` (the local delivery-contract branch, which includes that main revision).

An exact `git show --format=fuller --binary` record of the original code commit
is retained in the local review evidence as `organic-adoption-origin.patch`.
Its SHA-256 is `d6482ef5686c29ff58fd634d466b8bae53cf3c2b4a68c38e322d691518926c67`.
The original immutable commit is the repository source of truth; the local
evidence copy is not a package dependency.

## Retained and adapted work

| Original contribution | Integration treatment |
| --- | --- |
| `metaballSurface`, `sphereInside`, `smoothUnion` | Retained on existing implicit-surface infrastructure. Preserve original blend shape default; align documentation and reject invalid field inputs. |
| `catmullRomPath`, `taperedTube` | Retained on existing sweep infrastructure. Correct sample counts and closed-path endpoint composition. |
| `spiralPath` | Retain the small specialized curl helper; document its fixed shrink, start offset and positive rise; reject nonfinite direction vectors. |
| `smoothOrganic` | Retain subdivision/normal convenience; state geometry cost and default UV/material-group effects. |
| Sandbox/public wiring, Discovery, tests and recipes | Retain selected helper entries; correct executable radii recipes, contract facts and generated API snapshot. |

`smoothUnionSpheres` is retained as the internal implementation shared by
metaballs and SDF tests, without adding another package or sandbox API.

## Deferred work and excluded dependencies

`rockDisplace` and `rockBoulder`, including their aspect/sliver utilities, remain
credited original work but are excluded from this integration. Displacement
needs seam-preservation work; boulder proportions, retry/fallback behavior and
solid-contract integration need separate agreement. Deferral is not rejection
of the contributor or a claim that those helpers have no value.

PR #140's universal topology blocker and facet detector are not dependencies.
PR #142's runner, guards, warning filters, fixtures and benchmark infrastructure
are not included. This subset does not depend on the later local delivery
contract branch's `requireSolid` API. Existing rock-cluster examples cannot run
unchanged without the deferred rock helper.

## Maintainer corrections and verification boundary

The maintainer integration adds focused regressions for open/closed sampling,
closed-tube composition, executable catalog and maintained skill recipes,
retention of the contributed default blend, and invalid field/direction inputs.
Those tests were observed failing against the extracted implementation before
the corresponding fixes. Geometry checks establish structural properties, not
art quality, runtime suitability or owner acceptance.

An intermediate maintainer pass added a fixed aggregate sphere-work ceiling and
borrowed the parametric-sample cap for path output. Those restrictions were not
part of the contributor's implementation and were removed after review: their
thresholds were not calibrated for these helpers. Metaballs now pass existing
implicit-surface defaults and explicit grid/callback ceilings through unchanged.
Paths retain derived safe-integer validation without a new output-count policy.
Regressions verify larger caller ceilings, tighter existing limits, valid paths
above the removed threshold, and unsafe-count rejection before sampling.

Keep the original author/coauthor identity when carrying original commits. If
selected work is recorded in a replacement integration commit, retain the exact
coauthor trailer above and reference PR #141 and the original commit. Maintainer
corrections should be described as adaptations, not as original authorship of
the contributed helpers. No commit, merge, push or release is implied by this
provenance record.

## Contribution demonstration

The [Morrow Fen Regent preview](assets/2026-10-16-morrow-fen-regent.png) shows a
new agent-authored asset made with the adapted helpers. Its blended body and tail
use `metaballSurface`; curved details use the path and tube helpers. FaberVi's
contribution is the helper implementation, not authorship of this demonstration.
The image is an unmodified GPU capture of the saved asset.
