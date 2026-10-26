# Winter tree bark winding repair

The seven fir/spruce families in the Winter Mountainside Cabin pack shared an
inward-wound custom tube builder. Its ring basis and side/cap index order produced
negative signed volume, so ordinary glTF back-face culling exposed the inside of
trunks and branches. Snow lobes have outward winding; needle cards intentionally
use two-sided alpha-mask materials. The gallery respects these material settings.

Seven immutable child revisions reverse both tube side and cap triangles before
normal generation. Bark remains single-sided. Kiln's exported revision comparison
finds exactly one changed mesh per asset, `Mesh_BarkStructure`, with identical
bounds and no material or transform changes. Binary comparison additionally checks
exact snow/needle attributes and indices, exact embedded texture bytes, identical
bark triangle positions and unchanged triangle counts:

| Family | Triangles |
| --- | ---: |
| Mature fir | 38,054 |
| Mature spruce | 38,482 |
| Grove fir | 4,874 |
| Grove spruce | 4,850 |
| Distant fir | 1,354 |
| Distant spruce | 1,598 |
| Fir sapling | 6,812 |

All seven were reviewed in six full-material GPU views. The source regression
exercises the selected saved programs at three radial resolutions, checking outward
side/cap normals, positive closed-segment volume and consistent shared-edge winding;
it failed on all seven original programs. Maintained geometry guidance now includes
this check for custom tubes.

The Holodeck example uses these exact canonical child GLBs. Every non-asset world
field remains identical, including terrain, scatters, transforms, routes and runtime
settings. The gallery's content-addressed models, editable source, runtime archives,
pack archives and posters are regenerated together. Existing immutable objects and
base revisions remain available.

The pack selection permits a new committed maintenance repair at the same original
source-world revision, while retaining ancestry, shared-asset and rollback guards.
This avoids claiming an authoring-world revision that did not occur. Owner request
on 2026-10-25 authorizes repairing and deploying this scoped change.
