# Geometry you can shape

Kiln programs are JavaScript. The helpers cover common modeling operations; equations, loops, and custom `THREE.BufferGeometry` remain available when you need a different shape. Geometry functions belong in the saved program, so a later source edit can change one parameter and keep the rest.

Use meters for dimensions. The asset convention is **+X forward, +Y up, +Z right**. Helper `rotation` values use Euler XYZ **degrees**; direct Three.js rotations use radians.

## Size and orient a gear

`gearGeo` builds a gear in the XZ plane, centered at the origin, with its axle and thickness along Y. To mount its axle along Z, use `rotation: [90, 0, 0]` on the part.

Radii are absolute dimensions, not proportions. Set all three when making a small gear: `boreRadius < rootRadius < tipRadius`. A zero bore makes a solid center. Changing only `tipRadius` can leave it smaller than the default root radius of 0.8 meters.

```js
createPart('ElevationWheel', gearGeo({
  teeth: 28, rootRadius: 0.063, tipRadius: 0.075,
  boreRadius: 0.012, height: 0.024,
}), brass, { rotation: [90, 0, 0], parent: yoke });
```

The helper makes a stylized toothed shape; it does not calculate an involute tooth profile or prove that two gears mesh correctly.

## Own geometry before changing it

Primitive calls with identical arguments can share a cached geometry. Copy before changing its vertices or applying a geometry transform:

```js
const editable = copyGeometry(boxGeo(1, 1, 1));
editable.translate(0, 0.5, 0);
const red = copyMaterial(steel);
red.color.set(0xaa2222);
```

`copyGeometry` copies vertex buffers. `copyMaterial` copies material properties while retaining shared texture references. Pass the same geometry or material directly to multiple parts when sharing is intentional. The identity aliases `cloneGeometry` and `cloneMaterial` have been removed; [migration guidance](migration.md#replace-removed-authoring-helpers) distinguishes sharing from copying. Direct `.clone()` is also available.

New shaping helpers return independent geometry. Use `createInstance` when sharing geometry and materials is intentional.

## Transform existing texture coordinates

`remapUV` returns an independent geometry with `uv = uv * scale + offset`, in U/V order:

```js
const tiled = remapUV(cylinderGeo(0.4, 0.4, 1), {
  scale: [4, 2], offset: [0, 0.25],
});
```

Defaults are `scale: [1, 1]` and `offset: [0, 0]`. The helper requires existing UV0 with two finite components per vertex; project or unwrap first when UVs are absent. Negative scale mirrors that texture axis. Interleaved and normalized UV attributes are read as logical values and written as Float32 coordinates. Nonfinite values or mapped Float32 overflow are rejected.

Topology, material groups and other attributes are preserved. Changing scale drops existing tangents and records `UV_REMAP_TANGENTS_DROPPED`; regenerate tangents when normal mapping needs them. Offsets preserve tangents. This transforms a mapping; it does not create an atlas or repair overlapping UV islands. The former `panelRemapV` helper is removed, and its old V default of `0.3` must be requested explicitly during migration.

## Check an explicit material budget

`materialBudgetAdvisory(root, { maxMaterials: 8 })` counts distinct material objects and reports whether that requested count was exceeded. Omit the budget to receive the count with `maxMaterials: null`, `exceeded: null`, and no warnings. The helper does not select a category budget, declare asset validity, or estimate draw calls. Use `countMaterials(root)` when only the count is needed, and the validation and render/QA tools for their specific findings.

## Author a surface with an equation

```js
const canopy = parametricSurface(
  (u, v) => [u, 0.4 * Math.sin(u * 2) + 0.15 * v * v, v],
  { u: [-2, 2], v: [-1, 1], uSegments: 48, vSegments: 24 },
);
```

`u` and `v` are finite parameter domains. Sampling defaults to 24 segments in each direction. The default `orientation: 'uv'` follows the cross product of the increasing U and V directions; use `'vu'` to reverse it. UVs run from 0 to 1.

For a periodic surface, declare the matching seam explicitly:

```js
const torus = parametricSurface(
  (u, v) => [
    (2 + 0.5 * Math.cos(v)) * Math.cos(u),
    0.5 * Math.sin(v),
    (2 + 0.5 * Math.cos(v)) * Math.sin(u),
  ],
  { u: [0, 2 * Math.PI], v: [0, 2 * Math.PI],
    uSegments: 48, vSegments: 24, periodicU: true, periodicV: true },
);
```

Periodic endpoint positions must coincide. Kiln retains distinct 0/1 UVs while matching seam positions and normals. Sampling does not add thickness, cap poles, remove self-intersections, or turn every equation into a solid. Avoid collapsed parameter rows unless you deliberately handle their degenerate triangles.

For hand-authored topology, `meshGeo` takes flat arrays:

```js
const triangle = meshGeo({
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
  uvs: [0, 0, 1, 0, 0, 1],
});
```

Positions contain XYZ triples; each index triple is a counterclockwise triangle. Without indices, every three vertices form one triangle. Optional `normals`, `uvs`, and `tangents` must match the vertex count. Normals are computed when omitted and normalized when supplied. Tangents use unit XYZ plus handedness +1 or -1. Validation rejects nonfinite data and invalid indices. Raw Three.js can carry additional attributes, but check Kiln's export diagnostics before assuming every Three.js feature survives GLB export.

## Bend, twist, taper, and displace

```js
const twisted = twist(column, { angle: 120 });
const narrower = taper(column, { endScale: [0.4, 0.7] });
const arched = bend(rib, { angle: 90 });
const corrugated = displace(sheet, ([x, y, z]) => [0, 0.06 * Math.sin(x * 18), 0]);
```

These operations work along **local +Y**. `bend` turns +Y toward +X; `twist` rotates around +Y. `taper` interpolates positive X/Z scale pairs from `startScale` (default `[1,1]`) to `endScale`. `displace` returns a vector to add, not an absolute replacement position.

A shared options shape controls the frame and affected region:

```js
const shaped = twist(geometry, {
  angle: 75,
  frame: { origin: [0, 1, 0], rotation: [0, 0, 90] },
  interval: [-1, 1],
  falloff: t => Math.sin(Math.PI * t),
});
```

`frame` is a rigid origin and degree-based rotation. `interval` contains local Y distances; it defaults to the mesh's local Y extent. Vertices outside an explicit interval remain unchanged. The optional falloff returns a weight from 0 to 1. Use a weight that reaches zero at the region boundary when a hard transition would tear or fold the surface. A zero-height mesh has normalized interval coordinate 0.

Deformation preserves vertex topology and UVs, recomputes normals and bounds, and invalidates old tangents. Apply `creaseNormals` afterward when you want controlled smooth/sharp boundaries. Enough segments must exist before shaping: bending a single quad does not create a curved surface.

A deterministic displacement can use an authored hash instead of ambient randomness:

```js
function seededHeight(x, z, seed) {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
const rough = displace(surface, ([x, y, z]) => [0, 0.02 * seededHeight(x, z, 7), 0]);
```

## Extrude a footprint in the intended direction

`extrudeProfile` maps a profile point `(u,v)` and depth coordinate `d` to these
geometry-local coordinates:

| Axis | Output `(X,Y,Z)` |
| --- | --- |
| `x` | `(d,v,-u)` |
| `y` (default) | `(u,d,-v)` |
| `z` | `(u,v,d)` |

For a horizontal platform with a desired XZ footprint, pass `[X,-Z]` and
`axis: 'y'`. Positive profile `v` projects toward negative Z. `center: false`
starts extrusion at zero on the selected axis; the default centers its depth.
Check asymmetric footprints against attached railings and supports in exported
world coordinates. A correct width and a shared parent do not prove they face
the same direction.

## Compose open structures from editable parts

Discovery's `recipe:structural-bays-v1` supplies a six-storey facade example with
independent bay placement, real apertures and replaceable recessed glazing. Change
the center width without scaling outer detailing, or replace one opening's infill
under a transformed parent. Storey count is an editable parameter. The ground
entry is intentionally open; later trim, doors or collision meshes need their own
clearance review.

`recipe:open-tiered-seating-v1` supplies separately editable solid seating sectors
around an open arena. It reserves an entrance before generating geometry and puts
placement on each sector root. Rows, rise, radius and angular coverage are editable;
no house layout, roof or asset category is required. These are optional construction
examples, not completed buildings, navigation certificates or finished materials.

## Compose moving assemblies

Discovery's `recipe:joined-frame-v1` derives brace endpoints from the same post
dimensions, so resizing the frame moves both interfaces together. Check each
brace against both intended supports and measure required gaps separately. A
connected-component report or bounding-box snap can miss a detached endpoint;
zero surface distance can also mean intersection. This recipe uses existing
helpers and imposes no asset category or structural-strength claim.

`createWheelAssembly` accepts `side: 'left' | 'right' | 'center'`. Side identifies
the wheel relative to its host; it neither positions it automatically nor chooses
single- or double-sided fork support. Centerline wheels need no fabricated mate.

Discovery offers `recipe:steerable-wheel-v1` and
`recipe:branched-articulation-v1` for moving assemblies. The wheel example parents
its fork and axle beneath steering, separately from spin, and derives clearance
from the wheel dimensions. Its contact marker describes the rest pose; inspect
actual tire vertices over motion rather than treating that marker as rolling
contact. The branched gripper preserves explicit joint offsets and nonzero rest
rotations without a humanoid preset. Its rotation tracks are absolute local
orientations; time zero matches the rest frame. Neither example certifies physics,
collision-free motion or host attachment. Replicate animated assemblies together
with their clips and use the returned remapped targets.

## Sweep a profile or loft sections

```js
const profile = [[-0.12, -0.2], [0.12, -0.2], [0.12, 0.2], [-0.12, 0.2]];
const rail = sweepProfile(profile, [[0, 0, 0], [0, 1, 0], [0.5, 2, 0]], {
  twist: 20,
  scale: [[1, 1], [0.9, 0.9], [0.7, 0.7]],
});
```

Profiles use local `[x,z]` coordinates. Sweep paths are **polyline stations**, not automatically smoothed splines. Sample a curve first for smooth curvature. The initial `up` vector defines profile +Z after projection perpendicular to the path. If omitted, Kiln chooses a stable cardinal direction. Subsequent frames use parallel transport instead of repeatedly projecting a global up vector.

Profile validity and path-station tolerances scale with their respective extents,
so changing units does not introduce a fixed minimum size. `up` is a direction;
its nonzero magnitude does not affect the frame. Very small features relative to
the overall profile or path may still fall below those tolerances. Output geometry
uses Float32 positions: use object placement for distant origins when baking the
translation into vertices would erase detail. These checks do not prove a solid
is free of self-intersections.

`twist` is the total degree rotation along the path. `scale` can be one positive number or one positive `[x,z]` pair per station. Caps default to true. For `closed: true`, omit the repeated endpoint; total twist must be a multiple of 360 degrees. Closed frames receive a seam correction and retain a wrapped UV seam.

For profiles that change shape rather than just scale:

```js
const body = loftProfiles([
  { profile: [[-1,-1],[1,-1],[1,1],[-1,1]] },
  { profile: [[-.5,-1],[.8,-.6],[.6,.5],[-.5,.7]],
    frame: { origin: [0.4, 2, 0], rotation: [0, 15, 0] } },
]);
```

Each loft section lies in its frame's local XZ plane. Initial section travel relative to the first plane determines face winding, so sections may progress in either direction. All profiles need the same vertex count and meaningful index-to-index correspondence. Outline winding is normalized while retaining the first vertex. These helpers accept one simple outline without holes. Supplying `holes` in sweep/loft options or a loft section fails explicitly, including from JavaScript. Use `extrudeProfile` for a holed cross-section with optional twist and taper. Independently varying inner and outer contours need explicit geometry or solid subtraction; there is no automatic contour correspondence. `cap: false` leaves end boundaries open; it does not create inner walls or thickness.

These helpers reject self-crossing 2D outlines, duplicate path stations, and near-reversals. Tight turns get a warning. **Closed boundaries do not prove the resulting 3D surface is free of self-intersections.** Review nearby path segments, large profiles, and crossed loft sections. Kiln does not claim a general CAD-solid guarantee for sweeps or lofts.

Choose each loft's starting vertex deliberately: a cyclic shift can cross connecting
edges while leaving all topology counts green. `extrudeProfile` adds no side-wall
rings unless `divisions` asks for them (default 0, or 16 when it twists). Holed `extrudeProfile` supports
twist/taper, but twist accuracy depends on `divisions`, and its output needs UV
projection or unwrapping before directional textures. See the
[bounded construction comparison](reviews/2026-09-22-loft-alternatives.md) for
measured alternatives and limits.

Lofts and profile sweeps reject corresponding profile edges that collapse between
stations. Match section start vertices and order deliberately; use intermediate
sections or path stations to resolve an intended twist. This linear-time local
check does not detect every crossed panel or global self-intersection.

Lofts and profile sweeps divide warped four-corner side panels into four triangles
around their bilinear midpoint. This avoids choosing a diagonal that changes the
surface differently on mirrored sides. Planar panels retain two triangles. The
midpoint also interpolates UVs; it adds one vertex and two triangles per warped
panel. This is piecewise-linear sampling, not a smooth surface or a remedy for
crossed correspondence. Add meaningful profile/path stations when more shape detail
is needed.

## Preserve seams and control shading

```js
const smooth = subdivide(texturedGeometry, 1, { preserveUV: true });
const shaded = creaseNormals(smooth, { angle: 45 });
const report = geometryDiagnostics(shaded);
```

- `subdivide(..., { preserveUV: true })` keeps per-corner UV charts while smoothing positions. The default position-only weld reports UV loss with `SUBDIVIDE_UV_DROPPED`; losses of other attributes, groups and morphs are also explicit.
- `mergeVertices` normally keeps separate vertices where normals or UVs differ. `{ positionOnly: true }` explicitly drops other attributes to weld geometric topology.
- `creaseNormals` preserves UV corners, averages neighboring face normals within the degree threshold, and invalidates tangents. Its position tolerance defaults to `1e-8` times the bounding-box diagonal, with no world-unit floor. An explicit positive `tolerance` overrides that distance.
- `geometryDiagnostics` reports boundary edges, non-manifold edges, inconsistent edge orientation, degenerate triangles, invalid indices, and nonfinite vertices. Default seam tolerance is `1e-6` times the finite-position bounding-box diagonal. A supplied positive tolerance remains an absolute geometry-local distance. The result exposes `tolerance`, `toleranceMode`, and `positionScale`. Open boundaries are expected for sheets; the counts do not certify a valid solid or detect general self-intersections.
- `collapsedByToleranceTriangles` reports faces whose vertices merge in that diagnostic grid. Those faces are excluded from edge counts so their remaining edges are not counted twice. This is separate from the area-based `degenerateTriangles` count. A nonzero value means topology detail was lost at the chosen tolerance; inspect at a finer deliberate tolerance before interpreting the edge counts. The helper does not weld, remove or repair geometry.

Both operations quantize positions relative to the bounds minimum. This is grid
matching, not an exact radius weld. Explicit tolerances finer than the extent can
resolve with safe integer quantization are rejected. Zero-extent geometry uses exact
position matching; collapsed triangles remain degenerate. Invalid-position triangles
are excluded from diagnostic edge/area counts and their nonfinite vertices remain
reported. Relative defaults can merge fine features within a large combined mesh;
choose an intentional absolute tolerance when inspecting such geometry.

Periodic surface endpoints must agree within `1e-6` of the sampled bounding-box
diagonal. Translation or tiny world units cannot turn a proportionally open seam
into an accepted periodic one. Float32 geometry cannot retain arbitrarily small
detail at a distant origin: author in local coordinates and position the parent.

## Keep Boolean materials and UVs when useful

```js
const carved = await boolDiff('Housing', body, cutter, { preserveAttributes: true });
```

`preserveAttributes: true` carries UV0 through Manifold interpolation and returns material groups. Exposed subtraction surfaces inherit their cutter's material and UVs. Missing UVs on an operand receive zero coordinates and an explicit warning. Normals are regenerated according to `smooth`; tangents are invalidated. This is useful for existing tileable mappings; it does not create a new unified atlas.

`smooth: true` averages normals across sharp rims as well as curved walls. For
angle-controlled boundaries, assign `carved.geometry = creaseNormals(carved.geometry,
{ angle: 60 })` and inspect the result. This changes shading, not surface positions;
it cannot fix gaps, an uneven silhouette or self-intersections. Compare normals
before changing a cutter to address what may only be a lighting artifact.

The preservation option is limited to UV0 and materials. Vertex colors, secondary
UV channels, tangents, skin/custom attributes and inactive morph targets are
removed with explicit diagnostics. Source geometry/attribute diagnostics survive
the operation and appear in export warnings. Rebuild required shading data after
CSG; normal-mapped export regenerates tangents from the final normals and UVs.
Arbitrary source metadata, animation and morph correspondences are not retained.

Operands must be static triangle meshes. Instanced meshes, skinned meshes and
active morph poses are rejected: bake the intended instances or pose into static
meshes first. Reading only their base geometry would silently change the solid.

Legacy calls retain their original first-material/no-UV behavior. Use `autoUnwrap` after a Boolean when you want a fresh atlas. Profile solids also generate their own surfaces without UVs.

CSG metadata now records actual output runs and source face IDs, including the backside flag for subtraction, rather than allocating guessed triangle ranges. Nested preserving operations retain source names and material groups. A hull creates new faces, so it reports unknown provenance and retains only the first material with no UVs even when preservation was requested.

CSG uses one translated, uniformly normalized computation frame for every operand.
The returned unparented mesh preserves world placement in its `position`, anchored
at the first contributing mesh's world origin. Its geometry has world-aligned axes
and local coordinates relative to that origin. Keep the returned mesh transform;
use `new THREE.Box3().setFromObject(result)` for world bounds. Detaching only
`result.geometry` loses that placement. Before parenting under a transformed node,
use world-preserving attachment or explicitly convert to that parent's frame.

This avoids converting large world coordinates to Float32 before the Boolean.
It cannot recover detail already lost in input buffers/transforms or promise
arbitrarily tiny features within a vast combined operand extent.

Solid conversion checks the actual Float32 triangle positions before normals are
generated. Manifold first rebuilds the topology from those consumer coordinates.
Any remaining exactly zero-area seam faces are removed with their triangle
metadata, followed by a final topology rebuild and validation. Both stages retain
source IDs, UVs and material runs. Successful cleanup
reports `SOLID_FLOAT32_CANONICALIZED`; unresolved collapse is an explicit error.
Boolean output restores asset units before materialization, keeping the large
world origin in the node transform. This can change rounding-level positions and
normals from older builds. It is not a general self-intersection or mesh-repair tool.

## Choose the path or revolution contract

`curveToMesh` constructs an open-ended Catmull-Rom tube with generated UVs.
`pipeAlongPath` shares that construction and optionally inserts corner waypoints;
its `bendRadius` is not an exact circular fillet. `closed` joins the path into a
loop; it does not cap two open endpoints. For a selected profile along explicit
polyline stations, use `sweepProfile`, whose end caps default to enabled and whose
transported frames, scale and degree-based twist have a separate contract. `cap` also
takes `'start'` or `'end'` on an open path. `creaseAngle` (degrees, default 60) splits
vertices where side panels meet more sharply, so triangle, square and pentagon profiles
keep hard edges while hexagons and finer profiles stay smooth; 180 smooths everything.
`bezierCurve` returns sampled points; feeding them into a tube interpolates them
again rather than retaining an exact parametric Bézier curve.

`lathe` is the full-Y surface shorthand for `revolveGeo`; both now share one
implementation. `revolveGeo` takes radians and an arbitrary axis vector. Before
axis reorientation its sweep starts at +Z and proceeds toward +X. These surface
operations generate UVs and do not implicitly cap an open meridian.
`revolveProfile` instead constructs a solid from a closed section, takes degrees,
and has explicit X/Y/Z axis selection. Around Y it starts at +X and proceeds
toward -Z; its new surfaces have no inherited UVs. Converting angle units alone
therefore does not make partial surface and solid revolutions interchangeable.

These distinctions are preserved rather than hidden behind a mode-dependent
return contract. The [bounded comparison](reviews/2026-09-23-path-revolution-contracts.md)
records the shared implementations and unchanged geometry/export checks.

## Experiment with implicit fields

```js
const blob = await implicitSurface(
  ([x, y, z]) => 1 - Math.hypot(x, y, z),
  { bounds: { min: [-1.2,-1.2,-1.2], max: [1.2,1.2,1.2] }, edgeLength: 0.15 },
);
```

The field is **positive inside**. Bounds and `edgeLength` are required. Smaller spacing can increase cost sharply and is necessary for thin features. The default limits are one million estimated grid cells and eight million actual callback evaluations; `maxCells` and `maxEvaluations` are explicit overrides. An evaluation counter cannot stop a callback that never returns: use the host's process-bounded evaluator for untrusted source.

Output is experimental, has no UVs, and records resolution and evaluation counts. A finite grid cannot guarantee preservation of every thin feature or exact CAD dimensions. See the [candidate measurements and adoption decisions](experiments/geometry-frontier.md) for implicit surfaces, general beveling, normal-offset shells, and mesh-to-field remeshing.


### Computational bounds

`parametricSurface` checks `(uSegments + 1) * (vSegments + 1)` before calling the sampler and rejects values above 262,144. Domains and their extents must be finite. A callback that never returns still requires the evaluator's process/time boundary.

`subdivide` accepts integer iterations from 0 to 10, then bounds worst-case triangle growth before cloning or welding. The estimate includes the optional presplit stage (up to four faces per input triangle, enabled by default), followed by `4 ** iterations`. It rejects above 1,000,000 estimated triangles or 128 MiB of output attributes, including morph channels. This is a conservative admission bound, not a measurement of peak memory. It never silently reduces iterations.

`arrayLinear` and `arrayRadial` require integer counts from 1 to 10,000, including the existing source; their return value contains `count - 1` new meshes. Count 1 returns no copies. Frames, offsets/centers, and all resulting positions must be finite, with rejection before attaching any copies. Resources remain shared and these helpers do not batch draw calls.

These are per-operation compute limits for every asset. Choose a coarser sampling/subdivision or deliberately split large work; no asset category selects a different budget.

Basic shape factories now reject invalid dimensions and segment counts before
construction. Dimensions must be finite and representable in Float32. Box, sphere,
cone, plane, torus and positive shape radii require positive dimensions. A cylinder
may have one zero end radius for a tip; both cannot be zero. Capsule middle length
may be zero, making its total length twice the radius. A zero-thickness sheet uses
`planeGeo`; a zero-size box is an error. `decalBox` retains its documented 0.002
minimum depth and accepts a nonnegative requested depth.

Basic shape segments are integers up to 4,096, with minima of 3 for circular
segments, 2 for sphere height segments, and 1 for plane segments. Sphere, torus and
plane grids also cap `(firstSegments + 1) * (secondSegments + 1)` at 262,144 before
allocation. Kiln reports the offending argument; it does not round, reduce detail
or change the requested shape. These checks do not replace the evaluator boundary
for raw Three.js or authored custom geometry.

## Joint discovery and resource counts

`describeAssembly(root).joints` finds validated articulated joints, wheel-spin pivots,
and steering pivots by metadata, even after renaming. Entries contain the node,
snapshot `nodeId`, `kinds`, semantic roles and a detached articulated descriptor when
present. Match `nodeId` against the description's frames for wheel axes. Duplicate
names remain separate entries. This uses the common assembly node support described
by Discovery; it is not skeleton validation or inference of undeclared custom roles.
`getJointNames(root)` remains the narrower `Joint_` prefix query.

`countTriangles(root)` counts placed source triangles, including the active count of
an `InstancedMesh` and two triangles per sprite. It does not account for visibility,
culling, draw ranges or material groups. `countMaterials` counts material identities;
sharing a material does not merge meshes into a draw call.

The final render's `instanceability.metrics` distinguishes `meshNodes` (mesh-bearing
node placements), `meshInstances` (including GPU-instanced copies), `uniqueMaterials`,
`triangles` and `drawCalls`. These counts span all document scenes. `drawCalls` is a
single-pass estimate per referenced primitive, with GPU instancing counted as a batch;
it is not a measured renderer frame and excludes shadow/depth passes, culling and
destination batching. `uniqueGeometries` counts distinct referenced glTF primitives,
not GPU buffer allocations. Final GLB metrics account for the exported representation,
which may differ from the source after optimization. The `instanceability` grade is
informational, not a QA verdict: its summary names the metric that set the grade, and
a transparent material lowers only an A or B grade to C.

Specialized factories also check finite dimensions and bounded counts. Cards accept
pivots outside their panel when the resulting coordinates remain finite. Wings
accept a zero tip chord; stairs accept signed rise/run for descending or reversed
flights. Blade bevels produce one closed cross-section, with partial bevels and a
full diamond at `edgeBevel: 1`. See the [specialized-domain evidence](reviews/2026-09-21-specialized-primitive-domains.md) for limits and changed bevel topology.

## Generate UVs in an explicit frame

Keep valid built-in UVs by sharing the geometry or using `copyGeometry`. Use
`remapUV` to transform existing U/V values and `autoUnwrap` for an xatlas chart atlas.
`projectUV` replaces UV0 with a named planar, box or cylindrical projection:

```js
const mapped = projectUV(rawGeometry, {
  projection: 'cylindrical',
  frame: { origin: [0, 0, 0], rotation: [0, 0, -90] },
  seamDegrees: 180,
});
```

Frames use geometry-local coordinates and Euler XYZ degrees. Planar maps frame XY;
box chooses a plane per triangle; cylindrical wraps frame Y. Partial arcs use
`angularRange: [startDegrees, sweepDegrees]` instead of `seamDegrees`. The range
must cover side vertices; sweep is positive and at most 360 degrees. Cap triangles
parallel to frame XZ use planar UVs by default; `caps: 'side'` opts into side mapping.
Full-wrap seam triangles may use U above 1, requiring repeat texture sampling.
Triangles spanning more than half a revolution fail with a subdivision hint.

Planar/box coordinates and cylindrical height normalize each geometry's extents
to 0..1. They do not use metres per texture repeat. A shared frame does not make
separate wall pieces share texel density or continuous brick courses. Preserve
existing physical UVs, or map faces with explicit dimensions; a planar XY face
can use `remapUV` with scales `[width / tileWidth, height / tileHeight]` and an
explicit offset to align its phase. Box faces use different axis pairs, so one
uniform remap does not establish equal density on every face.

Output is owned and non-indexed to separate triangle-corner UVs. Positions, normals,
matching attributes, material groups, draw range and triangle order are preserved;
tangents are removed with a diagnostic. Zero projection extent maps to 0.5.
Inputs must be finite triangle geometry with matching per-vertex attributes;
morph targets require a separate contract. Limits are two million source samples
and output corners plus 128 MiB of expanded attributes. This projection does not
pack an atlas, remove geometric defects, or guarantee a stretch-free texture.

### Roof surface coverage

`createRoofSurfaceLayout` places explicit boxes in a returned roof-face frame for
either ridge axis. Panels fit evenly with 2% width gaps. Shingles stagger alternate
rows, clip partial tiles at both edges, retain 4% gaps within the clipped cells,
overlap rows by up to 8%, and shorten the final row at the eave. Seams and
corrugations clip edge strips within the face. These are visual box approximations,
not folded sheet-metal or interlocking construction guarantees.

The returned `cost` reports `meshes` and `triangles` (12 per box), not draw calls or
hardware instancing. A request may generate at most 10000 boxes; excessive growth,
invalid dimensions and singular transforms fail before attaching anything to the
parent. The default parent is the face's roof root, so later roof transforms carry
the detail with it. An explicit different parent captures the face placement at
construction time and must support lossless TRS rebasing; local shear is rejected
with guidance to use the roof root. This avoids a silently distorted export.

### Deformation shading and scale

Deformation keeps authored normals when positions are unchanged. When positions
change, it rebuilds area-weighted normals using the original smooth/hard seam
classes: coincident UV copies with matching authored normals stay smooth, while
cap and other authored hard creases remain distinct. Matching is bounded by a
relative 1e-7 position grid and 1e-6 normal-component grid; it is not exact topology
certification. UVs and material groups remain unchanged. Removed tangents produce
`DEFORM_TANGENTS_DROPPED`; regenerate them for normal maps.

A nonzero interval always has normalized progress, even for tiny geometry. Endpoint
roundoff is capped at one millionth of interval length, and outside positions stay
unchanged. Abrupt interval boundaries can still create a discontinuity: use a
suitable falloff/segmentation and inspect the result. Deform before creating morph
targets; their separate mapping is not supported. Deformation accepts at most two
million vertices / three million corners and preserves input buffers.

Subdivision normalizes its working coordinates before welding and the upstream
adjacency grid, then restores source units. This avoids changing topology merely
because the same shape is authored in millimeters or meters. The upstream grid
still has finite relative resolution, so extremely close features need inspection.
Default position-only welding removes corner attributes and material groups;
`preserveUV: true` retains supported corner/group/morph data. Loss diagnostics stay
with the output. Subdivide before skin binding: averaging discrete joint indices
would produce invalid skinning and is explicitly rejected.

The subdivision preservation path supports continuous vertex attributes with one
to four components, including RGBA alpha; normalized storage is decoded to owned
Float32 values before interpolation. Supported morph attributes have three
components. Temporary scalar channels used for four-component interpolation are
removed before returning the geometry; no internal attributes enter the export.
