# Primitives audit (issue #374)

- **Date:** 2026-11-18
- **Kiln version:** 1.8.0 (`package.json`)
- **Commit measured:** `9dfba816` (main). The audit commit adds only this file, `scripts/audit-primitives.ts` and its test.
- **three.js:** 0.187.0 (the pinned dependency)
- **Scope:** the 53 top-level `export function` / `export const` declarations of `src/primitives.ts`, counted on this date (the same count as on 2026-11-12). Builders that `src/primitives.ts` only re-exports from other modules (`solids`, `profile`, `sweep`, `architecture`, `vehicle`, `character` and the rest) are not rows here.

## Method

`bun scripts/audit-primitives.ts` prints the measured table as markdown; `--json` prints every fact. It reads source modules directly and does not need `dist/`. It checks its own list against the exports of `src/primitives.ts` and stops if one is missing or extra.

For each export that makes geometry, the script builds it at its defaults and at two to four other parameter sets, including minimum segment counts, zero radii, zero thickness (rejected or clamped), zero straight length, a tube thicker than its ring, open surfaces and antiparallel axes. No builder in this file exposes an open-ended flag. For every mesh it records:

- `geometryDiagnostics(geometry).solid`: `closed`, `manifold`, `orientation` and `signedVolume`, with the boundary, non-manifold, orientation-conflict and zero-area triangle counts from the same call. The diagnostic welds positions on a grid of one millionth of the extent, so "closed" means closed after welding the UV-seam duplicates that three.js generators emit. This is the same measurement `requireSolid` uses;
- the triangle count;
- the expected volume where it is exact (box, polygonal cylinder, cone and frustum, prism wing), or the smooth-shape volume for comparison (sphere, capsule, torus);
- the UV attribute: present or not, its range, non-finite values;
- stored normals against winding: triangles whose vertex normals point against the triangle's winding, and the largest angle between a vertex normal and its face;
- declared semantic frames, sockets and roles, and the geometry role in `userData`.

Scene builders that return several meshes (`createLadder`, `wallWithOpening`, `room`, `createStairs`) also go through `analyzeFlushFaces`, the function the build uses for its `FLUSH_FACES` warning. Each is run twice: once with one plain `gameMaterial`, and once with one material that has a texture. With one plain material a depth tie draws the same colour either way, so the check counts the pair as `matching` and does not report it. With a texture the two faces have different UVs, so the pair is reported.

Probes then re-check the defects reported in `docs/reviews/2026-09-21-geometry-inventory.md` and test cases that the solid check cannot judge by itself.

A one-off export check (not kept in the script) built a capsule, a wing, stairs, a room and a torus marked with `requireSolid` through `renderGLBInProcess` with `KILN_RENDER=cpu`, and read the GLB back with glTF Transform. Its results are quoted where they matter.

Sources read for defects: the existing tests that cover these builders (`primitive-axis-contracts`, `solid-diagnostics`, `billboard-primitives`) and the `geometryDiagnostics` tests, `skills/kiln-author-asset/references/geometry-recipes.md`, issues #364, #402 and #378, `gh issue list --state all --search primitive`, and the plans and reviews in `docs/plans/` and `docs/reviews/`. Only the 2026-09-21 geometry inventory and roadmap name defects in these builders; the flush-face issues sample composition in authored assets, not these builders.

## Audit table

"Closed" and "winding" are measured. For open surfaces the solid check reads `mixed` because the volume is zero; the winding entry then gives the side the triangles face, measured from the stored normals, which agree with the winding on every open helper (0 opposed). The UV entry names the generator's layout, read from its source, and the measured range. Triangles are at defaults. The per-case measurements are in the appendix.

| # | Export | Closed or open | Winding | UV frame | Frames or sockets | Tris | Known defects |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 1 | `createRoot` | not geometry | - | - | - | - | none |
| 2 | `createPivot` | not geometry | - | - | - | - | none |
| 3 | `createPart` | as the geometry passed in | as the geometry | as the geometry | semantic metadata if passed | - | none. A negative `scale` mirrors the node; glTF and three.js reverse the front face for it, so it still draws outward |
| 4 | `capsuleGeo` | closed, manifold | outward | cylindrical (u around Y, v by arc length) | none | 60 | D5 zero-area pole triangles |
| 5 | `capsuleXGeo` | closed, manifold | outward | cylindrical | none | 60 | D5 |
| 6 | `capsuleZGeo` | closed, manifold | outward | cylindrical | none | 60 | D5 |
| 7 | `cylinderGeo` | closed, manifold (also with one zero radius, 3 segments) | outward | cylindrical side, planar disc caps | none | 32 | none |
| 8 | `cylinderXGeo` | closed, manifold | outward | cylindrical side, planar caps | none | 32 | none |
| 9 | `cylinderZGeo` | closed, manifold | outward | cylindrical side, planar caps | none | 32 | none |
| 10 | `boxGeo` | closed, manifold; zero side rejected | outward | box: each face 0..1 | none | 12 | none |
| 11 | `sphereGeo` | closed, manifold (also at 3 x 2) | outward | equirectangular | none | 80 | none |
| 12 | `coneGeo` | closed, manifold | outward | cylindrical side, planar base | none | 16 | none |
| 13 | `coneXGeo` | closed, manifold | outward | cylindrical side, planar base | none | 16 | none |
| 14 | `coneZGeo` | closed, manifold | outward | cylindrical side, planar base | none | 16 | none |
| 15 | `cylinderYGeo` | alias of `cylinderGeo`: closed | outward | as `cylinderGeo` | none | 32 | none |
| 16 | `capsuleYGeo` | alias of `capsuleGeo`: closed | outward | as `capsuleGeo` | none | 60 | D5 |
| 17 | `coneYGeo` | alias of `coneGeo`: closed | outward | as `coneGeo` | none | 16 | none |
| 18 | `cylinderOnAxis` | closed, manifold (any axis, antiparallel) | outward | cylindrical side, planar caps | none | 32 | none |
| 19 | `taperConeGeo` | closed, manifold | outward | cylindrical side, planar caps | none | 32 | none |
| 20 | `torusGeo` | closed, manifold | outward | toroidal (u around the ring, v around the tube) | none | 192 | D4 self-intersecting when tube >= radius |
| 21 | `planeGeo` | open by design | front +Z | planar 0..1 | none | 2 | none |
| 22 | `decalBox` | closed, manifold; depth clamped to 0.002 | outward | box | none | 12 | none |
| 23 | `foliageCardGeo` | open by design | front +Z, one-sided | planar 0..1 | geometry role `foliageCard` | 2 | D6 comment says double-sided |
| 24 | `crossedQuadsGeo` | open by design (2 or 3 crossing quads) | each quad faces its own normal | planar 0..1 per quad | geometry role `foliageCard` | 4 | none |
| 25 | `octaGridPlane` | open by design | front +Z | planar, one atlas tile (top-left) | none | 2 | none |
| 26 | `wingGeo` | closed, manifold (also with tipChord 0) | outward | none | none | 12 | D3 corner-averaged normals on flat faces |
| 27 | `createWingPair` | two closed meshes | both outward | none | none | 24 | D3 |
| 28 | `beamBetween` | closed, manifold | outward | cylindrical side, planar caps | none | 32 | none |
| 29 | `snapTo` | not geometry (moves a node) | - | - | - | - | none |
| 30 | `createLadder` | each rail and rung closed | outward | cylindrical per beam | frames `bottom`, `top`; sockets `bottom`, `top` (`ladder-end`); roles on rails and rungs | 192 (8 meshes) | none; 0 flush pairs |
| 31 | `wallWithOpening` | each panel closed | outward | box per panel | none | 12 (no opening), 36 (door) | none; 0 flush pairs |
| 32 | `room` | each panel closed | outward | box per panel | none | 84 (7 meshes) | D2 corner overlap and corner notch |
| 33 | `createStairs` | each tread and riser closed | outward | box per tread and riser | none | 192 (16 meshes) | D1 riser faces flush with the tread |
| 34 | `gameMaterial` | not geometry | - | - | - | - | none found |
| 35 | `basicMaterial` | not geometry | - | - | - | - | none found |
| 36 | `glassMaterial` | not geometry | - | - | - | - | none found |
| 37 | `lambertMaterial` | not geometry | - | - | - | - | none found |
| 38 | `rotationTrack` | not geometry | - | - | - | - | none found |
| 39 | `positionTrack` | not geometry | - | - | - | - | none found |
| 40 | `scaleTrack` | not geometry | - | - | - | - | none found |
| 41 | `createClip` | not geometry | - | - | - | - | none found |
| 42 | `idleBreathing` | not geometry | - | - | - | - | none found |
| 43 | `bobbingAnimation` | not geometry | - | - | - | - | none found |
| 44 | `spinAnimation` | not geometry | - | - | - | - | none found |
| 45 | `copyGeometry` | as the source | as the source | as the source | - | - | none |
| 46 | `copyMaterial` | not geometry | - | - | - | - | none found |
| 47 | `createInstance` | as the source mesh | as the source | as the source | none | - | none |
| 48 | `countTriangles` | not geometry | - | - | - | - | counts the D5 zero-area triangles as triangles |
| 49 | `countMaterials` | not geometry | - | - | - | - | none found |
| 50 | `getJointNames` | not geometry | - | - | - | - | none found |
| 51 | `materialBudgetAdvisory` | not geometry | - | - | - | - | none found |
| 52 | `SANDBOX_DECLARATIONS` | not a builder | - | - | - | - | - |
| 53 | `buildSandboxGlobals` | not a builder | - | - | - | - | - |

Summary of the measured facts:

- All 25 exports meant to be closed are closed, manifold and outward in all 69 cases that build: 19 geometry builders (rows 4 to 20, 22, 26) and 6 scene builders (rows 27, 28, 30 to 33), every mesh checked. One case is rejected by design (`boxGeo(1, 0, 1)`). In the 35 cases with an exact polyhedral volume, the signed volume matches it to six decimals.
- The four open helpers (rows 21, 23 to 25) are open by design, one-sided, and their winding agrees with their normals.
- No primitive declares contact faces. Only `createLadder` declares frames and sockets; `foliageCardGeo` and `crossedQuadsGeo` stamp a geometry role.
- `wingGeo` and `createWingPair` have no UVs. Every other geometry builder has finite UVs in 0..1. The exception is the pole vertices of `sphereGeo` and the capsules, which three.js shifts by half a segment in u, so u spans -0.5/n to 1 + 0.5/n.
- Low-segment smooth shapes (3-segment cylinders, cones, spheres, tori) have vertex normals up to 75 degrees from their faces. That is the smoothing those generators intend, not a defect.

## Defects

Each defect below has a failing case or a measurement. None is fixed in this change.

### D1. `createStairs`: each riser overlaps its tread with flush faces

**Case:** `createStairs('S', m, { totalRise: 2, totalRun: 3, width: 1 })` with a textured `m`.

**Measured:** 8 flush pairs, one per step (`Mesh_SStep1 / Mesh_SRiser1` first). The riser spans the full step rise, so its top `treadThickness` lies inside the tread. Per step, the riser's top face, front face and two side faces lie on the tread's faces and face the same way. For `steps: 1, totalRise: 0.2, totalRun: 0.3` the check reports 0.1728 m² shared: a 0.08 × 1 top strip, a 0.08 × 1 front strip and two 0.08 × 0.08 side squares.

With one plain material the same 8 pairs are counted as `matching` and not reported, so a plain build shows no `FLUSH_FACES` line. Descending flights (`totalRise: -2, totalRun: -3`) report 0 pairs: there the riser stands on the tread instead of passing through it. `riser: false` reports 0.

**Decision: fix.** In an ascending flight, stop each riser under its tread: rise minus `treadThickness`. Handle a step rise at or below `treadThickness`. Every source that uses `createStairs` with risers changes bytes, so list it in the fix.

### D2. `room`: wall corners overlap at the inside and leave a notch at the outside

**Case:** `room('R', m)` at defaults (4 × 4, walls 0.15).

**Measured:** all four walls are centred on the footprint edges, and each runs only the footprint length. So at each corner:

- the two walls overlap in a t/2 × t/2 square. Its top faces are flush: 4 pairs of 0.005625 m² each with a textured material (`Mesh_R_WallFront_L / Mesh_R_WallLeft` first). With one plain material they are counted as `matching`;
- the outer t/2 × t/2 square is empty for the full wall height. The probe finds 0 wall meshes covering a point in each outer corner square, and 2 in each inner overlap square. At defaults that is a 7.5 cm square notch, 2.8 m tall, on every outside corner.

**Decision: fix.** Make one pair of walls run past the corners by the wall thickness, for example front and back at `width + wallThickness`, and butt the other pair between them, left and right at `depth - wallThickness`. The interior size is unchanged. Every `room()` source changes bytes. Check side-wall openings near the ends against the shorter walls.

### D3. `wingGeo` and `createWingPair`: flat faces share corner normals

**Case:** `wingGeo()`.

**Measured:** the six flat faces share 8 vertices, so `computeVertexNormals` averages each corner across faces about 90 degrees apart. 8 of 12 triangles (leading edge, trailing edge, root and tip caps) have vertex normals 89.9 to 93.4 degrees from their face. The leading edge faces +X, but its vertex normals are near ±Y, for example (0.088, 0.995, -0.053). In one case (`span 4, sweep 1, dihedral 0.2, thickness 0.08`) a triangle's normals point against its winding. The exported GLB keeps the 8 vertices and these normals.

Kiln's own views hide this when the material has `flatShading: true` (the `gameMaterial` default). glTF has no flat-shading flag, so any other renderer shades the edges and caps as if they faced up or down.

**Decision: fix.** Give each face its own vertices (24 vertices, face normals), as `boxGeo` does. The solid facts do not change, but bytes change for every wing source. Adding UVs is a separate choice, not part of the fix.

### D4. `torusGeo` accepts a tube at least as thick as the ring radius

**Case:** `torusGeo(0.2, 0.5)`.

**Measured:** the tube crosses the ring axis. 39 of 117 vertices lie past the axis from their own ring centre, and 72 of 192 triangles have stored normals against their winding (up to 157 degrees). The solid check still reads closed, manifold and outward (V = 0.8485), and a build that marks the part with `requireSolid` succeeds with no warning. The surface intersects itself, which the check does not detect, as `docs/geometry.md` states.

**Decision: fix.** Reject `tube >= radius` with a message naming both values. Before changing behaviour, count saved sources that call `torusGeo` with such values. If any exist, document the limit and warn instead.

### D5. Capsules carry zero-area triangles

**Case:** `capsuleGeo(0.5, 1)`, and the X, Y and Z variants.

**Measured:** three.js `CapsuleGeometry` emits two zero-area triangles per radial segment at the poles: 12 of 60 triangles at defaults (20%), 6 of 30 at 3 segments, 32 of 160 at 16. With a zero straight length (`capsuleGeo(0.5, 0)`) there are 24 of 60. The GLB keeps them (60 triangles), and `countTriangles` and the build's `tris` count them. `sphereGeo` and `coneGeo` drop their pole triangles and have none. The solid facts are unaffected, because the check leaves collapsed triangles out of the edge counts.

**Decision: fix, low priority.** Drop zero-area triangles from the capsule index after construction. This is a byte change for capsule sources, and it lowers their triangle counts. If the maintainer prefers byte stability, document the count in Discovery instead.

### D6. `foliageCardGeo` comment says "double-sided"

**Case:** `foliageCardGeo()`.

**Measured:** 2 triangles, all normals (0, 0, 1). `gameMaterial` draws the front side only. The source comment calls it a "Double-sided quad"; Discovery correctly says "Single-quad".

**Decision: document.** Correct the source comment: the material decides whether both sides draw.

### Reported on 2026-09-21, now measured as fixed

| Report | Probe today |
| --- | --- |
| `room` floor top at +thickness | floor spans Y -0.2 to 0 with `floorThickness: 0.2` |
| `room` keeps only the first opening per wall | two doors give 5 front-wall panels, one door gives 3 |
| `createStairs({ steps: 1.5 })` builds two steps | throws `steps must be >= 1 ... safe integer` |
| `octaGridPlane({ tilesX: 0 })` gives NaN UVs | throws `tilesX must be a positive finite safe integer` |
| `wingGeo` dimensions unchecked | `span: NaN` throws |
| `createWingPair` left wing inside out (K01) | both wings outward, signed volume 0.018 each |

## Closed-solid contract

**Recommendation: adopt it for the solid geometry builders, and as a per-mesh contract for the scene builders. The maintainer decides.**

1. **Solid geometry builders** (rows 4 to 20, 22, 26). Every measured case already meets the contract: closed, manifold and outward, with exact volumes where they are known. A guarantee therefore costs no bytes for any source in the valid domain. Two things would have to change first:
   - define the valid domain where the surface could intersect itself, so `torusGeo` rejects `tube >= radius` (D4);
   - state that "closed" means closed after welding seam duplicates, which is what `requireSolid` and a print export (#378) read. The glTF primitive itself stays split at UV seams.

   The test added with this audit (`scripts/audit-primitives.test.ts`) already asserts the contract for every measured case. Adoption would widen it to a parameter sweep per builder.
2. **Scene builders** (`createLadder`, `wallWithOpening`, `room`, `createStairs`, `createWingPair`, `beamBetween`). Guarantee each mesh, not the union. They are sets of overlapping closed shells by design: the wall panels touch, the rungs pass into the rails. The composition contract that matters to users is "no flush faces between parts and no gaps at joins", and D1 and D2 break it today. Fix those two, then add the flush-face check with a textured material to the guarded facts.
3. **Open helpers** (`planeGeo`, `foliageCardGeo`, `crossedQuadsGeo`, `octaGridPlane`). Keep them open and out of the guarantee. `requireSolid` should keep failing them. Declare them as open in one place, so QA does not report them as unexplained gaps. They could carry an open-surface geometry role, as the foliage cards already carry `foliageCard`, which the part-volume observer could read as it reads `markOpenShell`. Discovery should say "open, one-sided" for each.
4. **Declared contact faces.** None of the 53 exports declares contact faces today. The centred solid primitives do not need them: their faces follow from their dimensions and axes, which `primitive-axis-contracts.test.ts` already pins. Contact frames are useful on the scene builders, for example stair bottom and top landings, wall opening rectangles and room door frames, and should be added there as semantic frames, like `createLadder`'s `bottom` and `top`. That is new API and belongs in its own change, not in the guarantee.

**What a guarantee would change:**

- a test per solid builder over a parameter sweep. It is cheap: the whole audit runs in well under a second;
- `torusGeo` refuses `tube >= radius`, so a source that uses it would stop building;
- byte changes only where a defect fix is listed: D1 (`createStairs` with risers), D2 (`room`), D3 (`wingGeo`, `createWingPair`) and D5 (capsules, optional);
- no byte change for box, cylinder, cone, sphere, torus within its domain, plane, decal, card, beam, ladder or wall sources;
- `docs/geometry.md` and Discovery would state the guarantee, its weld tolerance and its limit: self-intersection is checked only through parameter domains, not measured.

## Not measured

- General self-intersection. The diagnostic does not detect it; only the torus case was probed, analytically.
- The re-exported builders (`roundedBoxGeo`, `extrudeProfile`, `revolveProfile`, sweeps, `createGableShell` and others) are outside the 53 rows. `createGableShell` builds walls and floor in the same way as `room` and should get the D1 and D2 probes next.
- How many saved pack sources and examples call the affected builders, so how many would change bytes under each fix.
- GPU views of D1 to D3. The facts are geometric measurements. The flush pairs come from `analyzeFlushFaces` called directly with a textured material, not from a full build with an approved texture.
- The sandbox path. The script calls the module functions. The sandbox memoizes the same functions by argument, so it returns the same geometry.

## Appendix: per-case measurements

Output of `bun scripts/audit-primitives.ts` at the measured commit. `V` is the summed signed volume, `expected` the exact polyhedral volume, `smooth` the smooth-shape volume and `zero-area` the triangles collapsed by the diagnostic's weld grid. Flush pairs are given as candidates with one plain material (with the `matching` count) and with a textured material.

| # | Export | Kind | Design | UV | Case | Measured |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `createRoot` | node | n/a | n/a | - | Named empty Object3D. No geometry. |
| 2 | `createPivot` | node | n/a | n/a | - | Named Joint_ Object3D. No geometry. |
| 3 | `createPart` | scene | pass-through | from the geometry passed in | boxGeo(1,1,1) | closed, manifold, outward, V=1, expected 1, 12 tris |
| | | | | | planeGeo(1,1) | open (4 boundary edges), manifold, mixed, V=0, 2 tris |
| | | | | | boxGeo(1,1,1), pivot:true | closed, manifold, outward, V=1, 12 tris |
| | | | | | boxGeo(1,1,1), scale [-1,1,1] (mirrored node) | closed, manifold, outward, V=1, 12 tris, 1 mirrored node |
| 4 | `capsuleGeo` | geometry | closed | cylindrical (u around Y, v by arc length; three.js CapsuleGeometry) | capsuleGeo(0.5,1) | closed, manifold, outward, V=1.019119, smooth 1.308997, 60 tris, 12 zero-area |
| | | | | | capsuleGeo(0.5,1,3) min segments | closed, manifold, outward, V=0.509559, smooth 1.308997, 30 tris, 6 zero-area, 18 faces with a normal >45 deg off (max 60.7) |
| | | | | | capsuleGeo(0.5,0) zero straight length | closed, manifold, outward, V=0.369599, smooth 0.523599, 60 tris, 24 zero-area |
| | | | | | capsuleGeo(0.01,2,16) thin | closed, manifold, outward, V=0.000616, smooth 0.000633, 160 tris, 32 zero-area, 4 faces with a normal >45 deg off (max 46.3) |
| 5 | `capsuleXGeo` | geometry | closed | cylindrical (rotated capsuleGeo) | capsuleXGeo(0.5,1) | closed, manifold, outward, V=1.019119, smooth 1.308997, 60 tris, 12 zero-area |
| | | | | | capsuleXGeo(0.5,0,3) | closed, manifold, outward, V=0.1848, 30 tris, 12 zero-area, 18 faces with a normal >45 deg off (max 60.7) |
| 6 | `capsuleZGeo` | geometry | closed | cylindrical (rotated capsuleGeo) | capsuleZGeo(0.5,1) | closed, manifold, outward, V=1.019119, smooth 1.308997, 60 tris, 12 zero-area, 1 faces with a normal >45 deg off (max 45) |
| | | | | | capsuleZGeo(0.5,0,3) | closed, manifold, outward, V=0.1848, 30 tris, 12 zero-area, 19 faces with a normal >45 deg off (max 60.7) |
| 7 | `cylinderGeo` | geometry | closed | cylindrical side, planar disc caps (three.js CylinderGeometry) | cylinderGeo(0.5,0.5,1) | closed, manifold, outward, V=0.707107, expected 0.707107, 32 tris |
| | | | | | cylinderGeo(0.5,0.5,1,3) min segments | closed, manifold, outward, V=0.32476, expected 0.32476, 12 tris, 6 faces with a normal >45 deg off (max 60) |
| | | | | | cylinderGeo(0,0.5,1) zero top radius | closed, manifold, outward, V=0.235702, expected 0.235702, 16 tris |
| | | | | | cylinderGeo(0.5,0,1) zero bottom radius | closed, manifold, outward, V=0.235702, expected 0.235702, 16 tris |
| | | | | | cylinderGeo(0.3,0.6,2,32) frustum | closed, manifold, outward, V=1.311007, expected 1.311007, 128 tris |
| 8 | `cylinderXGeo` | geometry | closed | cylindrical side, planar caps (rotated cylinderGeo) | cylinderXGeo(0.5,0.5,1) | closed, manifold, outward, V=0.707107, expected 0.707107, 32 tris |
| | | | | | cylinderXGeo(0,0.5,1,3) | closed, manifold, outward, V=0.108253, expected 0.108253, 6 tris, 3 faces with a normal >45 deg off (max 57.2) |
| 9 | `cylinderZGeo` | geometry | closed | cylindrical side, planar caps (rotated cylinderGeo) | cylinderZGeo(0.5,0.5,1) | closed, manifold, outward, V=0.707107, expected 0.707107, 32 tris |
| | | | | | cylinderZGeo(0,0.5,1,3) | closed, manifold, outward, V=0.108253, expected 0.108253, 6 tris, 3 faces with a normal >45 deg off (max 57.2) |
| 10 | `boxGeo` | geometry | closed | box (each face 0..1; three.js BoxGeometry) | boxGeo(1,1,1) | closed, manifold, outward, V=1, expected 1, 12 tris |
| | | | | | boxGeo(2,0.01,3) thin slab | closed, manifold, outward, V=0.06, expected 0.06, 12 tris |
| | | | | | boxGeo(1000,1,0.001) extreme aspect | closed, manifold, outward, V=1, expected 1, 12 tris |
| | | | | | boxGeo(1,0,1) zero height (rejected) | throws: boxGeo height (use planeGeo for a sheet) must be finite, representable in Float32, and positive. |
| 11 | `sphereGeo` | geometry | closed | spherical (equirectangular; three.js SphereGeometry) | sphereGeo(0.5) | closed, manifold, outward, V=0.439826, smooth 0.523599, 80 tris |
| | | | | | sphereGeo(0.5,3,2) min segments | closed, manifold, outward, V=0.108253, smooth 0.523599, 6 tris, 6 faces with a normal >45 deg off (max 63.4) |
| | | | | | sphereGeo(0.5,32,16) | closed, manifold, outward, V=0.515243, smooth 0.523599, 960 tris |
| 12 | `coneGeo` | geometry | closed | cylindrical side, planar base (three.js ConeGeometry) | coneGeo(0.5,1) | closed, manifold, outward, V=0.235702, expected 0.235702, 16 tris |
| | | | | | coneGeo(0.5,1,3) min segments | closed, manifold, outward, V=0.108253, expected 0.108253, 6 tris, 3 faces with a normal >45 deg off (max 57.2) |
| | | | | | coneGeo(2,0.01,24) flat | closed, manifold, outward, V=0.041411, expected 0.041411, 48 tris |
| 13 | `coneXGeo` | geometry | closed | cylindrical side, planar base (rotated coneGeo) | coneXGeo(0.5,1) | closed, manifold, outward, V=0.235702, expected 0.235702, 16 tris |
| | | | | | coneXGeo(0.5,1,3) | closed, manifold, outward, V=0.108253, expected 0.108253, 6 tris, 3 faces with a normal >45 deg off (max 57.2) |
| 14 | `coneZGeo` | geometry | closed | cylindrical side, planar base (rotated coneGeo) | coneZGeo(0.5,1) | closed, manifold, outward, V=0.235702, expected 0.235702, 16 tris |
| | | | | | coneZGeo(0.5,1,3) | closed, manifold, outward, V=0.108253, expected 0.108253, 6 tris, 3 faces with a normal >45 deg off (max 57.2) |
| 15 | `cylinderYGeo` | geometry | closed | alias of cylinderGeo | cylinderYGeo(0.5,0.5,1) | closed, manifold, outward, V=0.707107, expected 0.707107, 32 tris |
| 16 | `capsuleYGeo` | geometry | closed | alias of capsuleGeo | capsuleYGeo(0.5,1) | closed, manifold, outward, V=1.019119, smooth 1.308997, 60 tris, 12 zero-area |
| 17 | `coneYGeo` | geometry | closed | alias of coneGeo | coneYGeo(0.5,1) | closed, manifold, outward, V=0.235702, expected 0.235702, 16 tris |
| 18 | `cylinderOnAxis` | geometry | closed | cylindrical side, planar caps (rotated cylinderGeo) | cylinderOnAxis([0,0,0],[0,1,0],0.5,1) | closed, manifold, outward, V=0.707107, expected 0.707107, 32 tris |
| | | | | | cylinderOnAxis([1,2,3],[1,1,1],0.5,1) | closed, manifold, outward, V=0.707107, expected 0.707107, 32 tris |
| | | | | | cylinderOnAxis([0,0,0],[0,-1,0],0.5,1,{radiusTop:0,segments:3}) antiparallel | closed, manifold, outward, V=0.108253, expected 0.108253, 6 tris, 3 faces with a normal >45 deg off (max 57.2) |
| 19 | `taperConeGeo` | geometry | closed | cylindrical side, planar caps (cylinderGeo) | taperConeGeo(0.5,0.25,1) | closed, manifold, outward, V=0.412479, expected 0.412479, 32 tris |
| | | | | | taperConeGeo(0.5,0,1,'x',3) | closed, manifold, outward, V=0.108253, expected 0.108253, 6 tris, 3 faces with a normal >45 deg off (max 57.2) |
| | | | | | taperConeGeo(0.5,0.5,1,'z',24) | closed, manifold, outward, V=0.776457, expected 0.776457, 96 tris |
| 20 | `torusGeo` | geometry | closed | toroidal (u around the ring, v around the tube; three.js TorusGeometry) | torusGeo(1,0.3) | closed, manifold, outward, V=1.527351, smooth 1.776529, 192 tris |
| | | | | | torusGeo(1,0.3,3,3) min segments | closed, manifold, outward, V=0.30375, smooth 1.776529, 18 tris, 18 faces with a normal >45 deg off (max 75.5) |
| | | | | | torusGeo(1,0.3,16,48) | closed, manifold, outward, V=1.726279, smooth 1.776529, 1536 tris |
| | | | | | torusGeo(0.2,0.5) tube > radius | closed, manifold, outward, V=0.848528, 192 tris, 72 normals oppose winding, 72 faces with a normal >45 deg off (max 156.8) |
| 21 | `planeGeo` | geometry | open | planar (0..1 over the sheet) | planeGeo(1,1) | open (4 boundary edges), manifold, mixed, V=0, 2 tris |
| | | | | | planeGeo(4,2,4,2) | open (12 boundary edges), manifold, mixed, V=0, 16 tris |
| 22 | `decalBox` | geometry | closed | box (BoxGeometry) | decalBox(0.2,0.2) | closed, manifold, outward, V=0.0004, expected 0.0004, 12 tris |
| | | | | | decalBox(0.2,0.2,0) zero depth | closed, manifold, outward, V=0.00008, expected 0.00008, 12 tris |
| | | | | | decalBox(0.2,0.2,0.05) | closed, manifold, outward, V=0.002, expected 0.002, 12 tris |
| 23 | `foliageCardGeo` | geometry | open | planar (0..1 over the card) | foliageCardGeo() | open (4 boundary edges), manifold, mixed, V=0, 2 tris; role foliageCard |
| | | | | | foliageCardGeo({width:0.5,height:2,yPivot:0.5}) | open (4 boundary edges), manifold, mixed, V=0, 2 tris; role foliageCard |
| 24 | `crossedQuadsGeo` | geometry | open | planar per quad (0..1 each) | crossedQuadsGeo() | open (8 boundary edges), manifold, mixed, V=0, 4 tris; role foliageCard |
| | | | | | crossedQuadsGeo({planes:3}) | open (12 boundary edges), manifold, mixed, V=0, 6 tris; role foliageCard |
| 25 | `octaGridPlane` | geometry | open | planar, scaled to one atlas tile | octaGridPlane({tilesX:8,tilesY:8}) | open (4 boundary edges), manifold, mixed, V=0, 2 tris |
| | | | | | octaGridPlane({tilesX:1,tilesY:1,yPivot:1}) | open (4 boundary edges), manifold, mixed, V=0, 2 tris |
| 26 | `wingGeo` | geometry | closed | none | wingGeo() | closed, manifold, outward, V=0.018, expected 0.018, 12 tris, 8 faces with a normal >45 deg off (max 90) |
| | | | | | wingGeo({tipChord:0}) triangular | closed, manifold, outward, V=0.012, expected 0.012, 8 tris, 6 faces with a normal >45 deg off (max 92.3) |
| | | | | | wingGeo({span:4,sweep:1,dihedral:0.2,thickness:0.08}) | closed, manifold, outward, V=0.144, expected 0.144, 12 tris, 1 normals oppose winding, 8 faces with a normal >45 deg off (max 93.4) |
| | | | | | wingGeo({sweep:-0.5,tipChord:1.2}) | closed, manifold, outward, V=0.036, expected 0.036, 12 tris, 8 faces with a normal >45 deg off (max 89.9) |
| 27 | `createWingPair` | scene | closed | none (wingGeo) | createWingPair defaults, rootZ 0.3 | 2/2 meshes closed, 2/2 manifold, outward, V=0.036, 24 tris, 16 faces with a normal >45 deg off (max 90) |
| | | | | | createWingPair tipChord 0, sweep 0.4 | 2/2 meshes closed, 2/2 manifold, outward, V=0.024, 16 tris, 12 faces with a normal >45 deg off (max 89.2) |
| 28 | `beamBetween` | scene | closed | cylindrical side, planar caps (cylinderGeo) | beamBetween([0,0,0],[0,1,0],0.05) | closed, manifold, outward, V=0.007071, expected 0.007071, 32 tris |
| | | | | | beamBetween([0,0,0],[1,2,3],0.05,{segments:3}) | closed, manifold, outward, V=0.012151, 12 tris, 6 faces with a normal >45 deg off (max 60) |
| | | | | | beamBetween([0,0,0],[0,-1,0],0.05) antiparallel | closed, manifold, outward, V=0.007071, 32 tris |
| 29 | `snapTo` | node | n/a | n/a | - | Moves a node by the AABB gap; makes no geometry. |
| 30 | `createLadder` | scene | closed | cylindrical side, planar caps (cylinderGeo) | createLadder bottom [0,0,0] top [0,3,0] | 8/8 meshes closed, 8/8 manifold, outward, V=0.012358, 192 tris, flush pairs plain 0 (matching 0), textured 0; frames L:bottom L:top; sockets L:bottom(ladder-end) L:top(ladder-end) |
| | | | | | createLadder rungCount 0, segments 3 | 2/2 meshes closed, 2/2 manifold, outward, V=0.004872, 24 tris, 12 faces with a normal >45 deg off (max 60), flush pairs plain 0 (matching 0), textured 0; frames L:bottom L:top; sockets L:bottom(ladder-end) L:top(ladder-end) |
| | | | | | createLadder slanted [0,0,0] to [1,3,0.5] | 8/8 meshes closed, 8/8 manifold, outward, V=0.013014, 192 tris, flush pairs plain 0 (matching 0), textured 0; frames L:bottom L:top; sockets L:bottom(ladder-end) L:top(ladder-end) |
| 31 | `wallWithOpening` | scene | closed | box per panel (boxGeo) | wallWithOpening 4 x 3 x 0.2, no opening | closed, manifold, outward, V=2.4, 12 tris |
| | | | | | wallWithOpening door | 3/3 meshes closed, 3/3 manifold, outward, V=1.938, 36 tris, flush pairs plain 0 (matching 0), textured 0 |
| | | | | | wallWithOpening window, axis 'x' | 4/4 meshes closed, 4/4 manifold, outward, V=2.2, 48 tris, flush pairs plain 0 (matching 0), textured 0 |
| | | | | | wallWithOpening two doors and a stacked window | 9/9 meshes closed, 9/9 manifold, outward, V=3.64, 108 tris, flush pairs plain 0 (matching 0), textured 0 |
| 32 | `room` | scene | closed | box per panel (boxGeo) | room() defaults | 7/7 meshes closed, 7/7 manifold, outward, V=7.9735, 84 tris, flush pairs plain 0 (matching 4), textured 4 (worst Mesh_R_WallFront_L / Mesh_R_WallLeft: 0.005625 m2, normal (0, 1, 0)) |
| | | | | | room({floor:false, openings:[]}) | 4/4 meshes closed, 4/4 manifold, outward, V=6.72, 48 tris, flush pairs plain 0 (matching 4), textured 4 (worst Mesh_R_WallFront / Mesh_R_WallLeft: 0.005625 m2, normal (0, 1, 0)) |
| | | | | | room 6 x 3, thick walls, door + window | 10/10 meshes closed, 10/10 manifold, outward, V=20.636, 120 tris, flush pairs plain 0 (matching 4), textured 4 (worst Mesh_R_WallFront_R / Mesh_R_WallRight: 0.04 m2, normal (0, 1, 0)) |
| 33 | `createStairs` | scene | closed | box per tread and riser (boxGeo) | createStairs rise 2, run 3, width 1 | 16/16 meshes closed, 16/16 manifold, outward, V=0.4, 192 tris, flush pairs plain 0 (matching 8), textured 8 (worst Mesh_SStep1 / Mesh_SRiser1: 0.1728 m2, normal (0, 1, 0)) |
| | | | | | createStairs riser:false | 8/8 meshes closed, 8/8 manifold, outward, V=0.24, 96 tris, flush pairs plain 0 (matching 0), textured 0 |
| | | | | | createStairs descending -2 / -3, axis 'z' | 16/16 meshes closed, 16/16 manifold, outward, V=0.4, 192 tris, flush pairs plain 0 (matching 0), textured 0 |
| | | | | | createStairs steps 1 | 2/2 meshes closed, 2/2 manifold, outward, V=0.04, 24 tris, flush pairs plain 0 (matching 1), textured 1 (worst Mesh_SStep1 / Mesh_SRiser1: 0.1728 m2, normal (-1, 0, 0)) |
| 34 | `gameMaterial` | material | n/a | n/a | - | MeshStandardMaterial factory. No geometry. |
| 35 | `basicMaterial` | material | n/a | n/a | - | MeshBasicMaterial factory. No geometry. |
| 36 | `glassMaterial` | material | n/a | n/a | - | Transparent double-sided MeshStandardMaterial. No geometry. |
| 37 | `lambertMaterial` | material | n/a | n/a | - | MeshLambertMaterial factory. No geometry. |
| 38 | `rotationTrack` | animation | n/a | n/a | - | Keyframe track. No geometry. |
| 39 | `positionTrack` | animation | n/a | n/a | - | Keyframe track. No geometry. |
| 40 | `scaleTrack` | animation | n/a | n/a | - | Keyframe track. No geometry. |
| 41 | `createClip` | animation | n/a | n/a | - | Animation clip. No geometry. |
| 42 | `idleBreathing` | animation | n/a | n/a | - | Animation preset. No geometry. |
| 43 | `bobbingAnimation` | animation | n/a | n/a | - | Animation preset. No geometry. |
| 44 | `spinAnimation` | animation | n/a | n/a | - | Animation preset. No geometry. |
| 45 | `copyGeometry` | utility | n/a | n/a | - | Clones a geometry; facts are those of the source. |
| 46 | `copyMaterial` | utility | n/a | n/a | - | Clones a material. No geometry. |
| 47 | `createInstance` | scene | pass-through | from the source mesh | createInstance of boxGeo part | 2/2 meshes closed, 2/2 manifold, outward, V=2, 24 tris |
| 48 | `countTriangles` | utility | n/a | n/a | - | Counts triangles. No geometry. |
| 49 | `countMaterials` | utility | n/a | n/a | - | Counts materials. No geometry. |
| 50 | `getJointNames` | utility | n/a | n/a | - | Lists Joint_ names. No geometry. |
| 51 | `materialBudgetAdvisory` | utility | n/a | n/a | - | Material count advisory. No geometry. |
| 52 | `SANDBOX_DECLARATIONS` | sandbox | n/a | n/a | - | Symbol key. Not a builder. |
| 53 | `buildSandboxGlobals` | sandbox | n/a | n/a | - | Sandbox surface. Not a builder. |

### Probes

- **room-floor-datum**: room(): is the floor top at local Y=0 (reported at Y=+thickness in 2026-09-21)? `{"floorMinY":-0.2,"floorMaxY":0}`
- **room-corners**: room(): how many wall meshes cover a point in each outer corner square and each inner overlap square (defaults: 4 x 4, wall 0.15)? `{"outerCornerCoverage":[0,0,0,0],"innerOverlapCoverage":[2,2,2,2],"notchSize":[0.075,0.075]}`
- **wing-shared-corners**: wingGeo(): how many vertices carry the six flat faces, and what normal does the leading-edge face get? `{"vertices":8,"leadingEdgeVertexNormals":[[0.088415,0.99467,-0.053049],[0.13175,0.988126,0.07905],[0.25747,-0.965514,0.038621],[0.044385,-0.998659,-0.026631]]}`
- **room-multiple-openings**: room(): does every opening on one wall survive (only the first did in 2026-09-21)? `{"panelsWithTwoDoors":5,"panelsWithOneDoor":3}`
- **stairs-fractional-steps**: createStairs({steps:1.5}): rejected (it built two steps in 2026-09-21)? `{"threw":"createStairs(\"S\"): steps must be >= 1, <= 10000 and a finite safe integer (got 1.5)."}`
- **octagrid-zero-tiles**: octaGridPlane({tilesX:0}): rejected (NaN UVs in 2026-09-21)? `{"threw":"octaGridPlane: tilesX must be a positive finite safe integer."}`
- **wing-unchecked-dimensions**: wingGeo({span:NaN}): rejected (unchecked in 2026-09-21)? `{"threw":"wingGeo span must be finite, representable in Float32, and positive."}`
- **wing-pair-reflection**: createWingPair: are both wings outward (left was reflected inside out, K01)? `{"left":{"orientation":"outward","signedVolume":0.018},"right":{"orientation":"outward","signedVolume":0.018}}`
- **torus-self-intersection**: torusGeo(0.2, 0.5): the tube crosses the ring axis. Count vertices on the far side of the axis from their own ring centre, and what the solid check says. `{"vertices":117,"verticesPastAxis":39,"solid":{"closed":true,"manifold":true,"orientation":"outward","signedVolume":0.848528}}`
- **foliage-card-sides**: foliageCardGeo(): the doc comment says "double-sided quad". How many triangles, which way do they face, and what side does gameMaterial draw? `{"triangles":2,"normals":["0,0,1"],"gameMaterialSide":"front"}`
- **capsule-pole-triangles**: capsuleGeo(r,h,n): how many zero-area triangles at the poles reach the index buffer? `[{"segments":3,"triangles":30,"collapsed":6},{"segments":6,"triangles":60,"collapsed":12},{"segments":16,"triangles":160,"collapsed":32}]`
- **capsule-zero-length-triangles**: capsuleGeo(r, 0): how many zero-area triangles does the empty straight section add? `{"triangles":60,"collapsed":24}`
