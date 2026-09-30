# Choose geometry by the shape you need

Search `kiln_discover` for the shape or operation you need, then fetch exact `ids` for unfamiliar helpers. An overview supplies current `family` and `tags` labels when a filter is useful; `{ kind: "recipe" }` browses optional construction recipes. Each example below lives in `build()` with a named root and suitable material. Adapt or combine recipes freely, including with custom equations and topology.

Parts use the asset frame: metres, +X forward, +Y up, +Z right. Forward is the direction the object faces; a bench's sitter faces +X. Part `rotation` is in degrees and follows the right-hand rule in this frame: `[0, 90, 0]` turns forward (+X) toward -Z, the object's left; `[0, 0, 90]` tips +X up to +Y; `[90, 0, 0]` rolls +Y toward +Z.

## Surfaces from equations

An asymmetric canopy or corrugated sheet can be much shorter as a function than as many primitives:

```js
const canopy = parametricSurface(
  (u, v) => [u, 0.35 * Math.sin(u * 2) + 0.12 * v * v, v],
  { u: [-2, 2], v: [-1, 1], uSegments: 48, vSegments: 24 },
);
createPart('Canopy', canopy, metal, { parent: root });
```

Domains and segment counts are explicit. `orientation: 'uv'` follows increasing-U cross increasing-V; `'vu'` reverses winding. `periodicU`/`periodicV` require matching endpoints and retain wrapped UV seams. A sampled surface has no automatic thickness or caps.

Collapsing an entire parameter row or column to one tip leaves degenerate grid triangles and can produce zero normals. Use a non-collapsed parameterization, or construct the intended tip with explicit `meshGeo` fan topology. `geometryDiagnostics` can expose degenerate triangles; changing normals alone cannot repair the topology.

For authored topology, `meshGeo({ positions, indices, normals?, uvs?, tangents? })` uses flat numeric arrays. Triangle winding is counterclockwise. An open sheet is valid geometry; do not label it a watertight solid.

Mirrored vertices alone do not establish a symmetric curved surface. The same
diagonal through warped quads on both sides can produce different surfaces between
vertices. Mirror the topology with corrected winding, or use symmetric patch
tessellation, then compare corresponding surface points between stations. Changing
normals cannot repair a positional asymmetry.

For a hollow shell, distinguish the intended opening from unintended end seams.
Separate inner/outer surfaces and a rim do not automatically join the bow, bottom
or other end boundaries. Inspect those joins from both sides after resizing; a
correct bounding box and accepted structural QA do not prove closure. Leave
surfaces open where the brief calls for them rather than capping every boundary.

For a solid wall, gable or roof, review the outside and intended inside separately.
Matching edge coordinates do not establish a visible join: reversed triangle winding
can cull the connecting surface even when vertex normals point outward. Repair the
winding or missing geometry rather than hiding the defect with double-sided shading;
deliberate thin sheets may need it. Check ceiling and trim extents against the actual sloping roof, including
the eaves, rather than its bounding box.

For attached veins, ribs or seams, discover `recipe:surface-detail-v1`. Its strip
shares the carrier mesh's sampled boundary vertices and rises along local normals.
A shared equation followed by a separately interpolated curve does not establish
contact with the actual mesh. Check both attachment and final dimensions after a
shape edit; a normal offset can change height as well as depth. This recipe is an
optional open-surface construction, not a requirement to turn every detail into a strip.

## Interfaces that must fit or move

Derive mating surfaces from shared dimensions and local frames. Surface contact at
one point does not establish a flush joint along an edge. For a continuous-looking
body, align profiles and transitions at the intended seam; unrelated interpenetrating
primitives may hide a gap in one view while exposing a ledge in another. Separate
rigid pieces, welded surfaces and deforming joints are all valid when they match the
requested style and motion.

For usable doors or passages, establish the actor envelope, finished floor,
threshold, clear width and headroom. Split plinths, caps, trim and braces around the
opening when they would obstruct it. Check the closed position, the hinge sweep and
the open passage against exported geometry. A wide visible door leaf is not evidence
of a traversable opening.

For a seated operator, fit the posed body as well as the seat marker: pelvis/seat,
knees/controls, feet/deck and hands/reach. Check relevant steering or pedal travel
and access for mounting. Keep application-specific poses separate from promised
asset clips, and report which one was tested.

For articulated limbs, place roots and joint transitions within the intended body
silhouette and inspect the moving seam from several sides. Identify the anatomical
joint each pivot represents before reversing its bend direction. Correct exposed
attachment caps, gaps and snapping through the motion, without assuming every
stylized creature needs one rigging or deformation technique.

When reducing draw calls, consolidate compatible geometry within the same rigid
motion parent. Preserve independently moving nodes, attachment markers and names
that the consumer uses. Recheck clip targets and intermediate poses after export;
fewer meshes alone does not establish a successful optimization.

## Materials and directional UVs

For a leaf-card alpha path, discover `recipe:foliage-cutout-v1`. It binds a real
alpha-bearing approved texture to `foliageMaterial`; MASK alone does not create a
leaf silhouette. Its bundled 4×4 texture is a teaching placeholder. Check current
material capabilities before choosing a delivery resource, then inspect GPU views
and destination filtering/backfaces. Raw `THREE.DataTexture` is not an available
authoring route. Solid leaves and custom surfaces remain valid alternatives.

For lengthwise grain or stripes through bends, discover `recipe:directional-sweep-v1`.
It demonstrates sweep side U around the profile and V along path distance. Preserve
that convention when editing the path; arbitrary atlas rotations suit baked detail
but can disrupt directional tiling. Caps and physical texture scale need separate
decisions. Read the GPU image: CPU geometry feedback cannot establish texture direction.

## Shape an existing mesh

```js
const twisted = twist(column, { angle: 90 });
const narrowed = taper(column, { endScale: [0.4, 0.7] });
const curved = bend(rib, { angle: 60 });
const rippled = displace(sheet, ([x, y, z]) => [0, 0.04 * Math.sin(x * 16), 0]);
```

All return owned geometry. They work along local +Y; bend turns +Y toward +X. Set `frame: { origin, rotation }` for another local frame; rotations are degrees. `interval: [minY,maxY]` selects local Y distances, with outside vertices unchanged. An optional `falloff(t)` returns 0..1. Displacement returns an offset, not a replacement position.

Add enough segments before shaping. UVs remain, normals/bounds are recomputed, and stale tangents are removed. `creaseNormals(geometry, { angle: 45 })` then gives controlled hard/smooth boundaries. `subdivide(geometry, 1, { preserveUV: true })` preserves UV charts; legacy subdivision can discard them. Topology-changing subdivision drops old CSG face provenance rather than guessing.

For ordinary geometry scale or rotation, retain the normals those operations already transform. An extra raw `computeVertexNormals()` can replace smooth analytic normals and leave unused sphere-pole vertices with zero normals that fail GLTF validation. Direct position-buffer edits or deliberate shading changes need an appropriate normal update; that is a different case from an affine transform.

## Vary the cross-section

```js
const profile = [[-.12,-.2],[.12,-.2],[.12,.2],[-.12,.2]];
const rail = sweepProfile(profile, [[0,0,0],[0,1,0],[.5,2,0]], {
  twist: 20, scale: [[1,1],[.9,.9],[.7,.7]],
});
const housing = loftProfiles([
  { profile },
  { profile: [[-.2,-.1],[.3,-.1],[.2,.15],[-.2,.15]],
    frame: { origin: [0,1,0], rotation: [0,15,0] } },
]);
```

Profiles use local `[x,z]`; loft sections lie in local XZ planes. A sweep follows supplied polyline stations using transported frames. Sample a curve first if you need smooth curvature. `up` sets initial profile +Z and must not parallel the path.

Caps default on; `cap: 'start'` or `'end'` caps one end of an open path. `creaseAngle` (default 60 degrees) keeps a rectangular or triangular profile hard-edged; raise it to 180 to smooth everything. `extrudeProfile` adds side-wall rings only when `divisions` asks for them. Closed sweeps omit the repeated path endpoint and require total twist to be a multiple of 360. Loft sections require matching point counts and deliberate index correspondence. These versions accept a simple outline without holes; use `extrudeProfile` for straight sections with holes. Review tight turns and nearby surfaces for self-intersections.

## Preserve useful Boolean surfaces

```js
const housing = await boolDiff('Housing', body, portCutter, { preserveAttributes: true });
```

Preservation mode carries UV0 and material groups; exposed cuts inherit the cutter's UVs/material. Missing input UVs produce a warning. Normals are regenerated; tangents are not retained. Without the option, legacy calls keep the first material and discard UVs. Use `autoUnwrap` afterward for a new atlas. Convex hulls create new faces and cannot promise source UV/material provenance.

`smooth: true` averages normals across sharp boundaries too. If a Boolean rim
looks scalloped in lighting, compare `housing.geometry = creaseNormals(housing.geometry,
{ angle: 60 })` before adding sections or changing the cutter. This changes normals,
not the surface positions. Inspect the silhouette and relevant geometry separately:
normal changes cannot repair a real gap, jagged outline or self-intersection. Choose
the angle for the intended hard/smooth boundary rather than applying it everywhere.

Keep the returned mesh transform. Its position carries the first contributing
mesh's world origin; its vertices are local to that origin. Extracting geometry
alone or overwriting the returned position loses that placement. Read world bounds
with `new THREE.Box3().setFromObject(housing)` and preserve world placement when
attaching beneath a transformed parent.

`roundedBoxGeo` rounds a box's twelve edges. Profile beveling rounds profile corners; extrusion cap edges remain sharp. Subdivision is smoothing, not a dimension-preserving general bevel.

## Reuse structure without a new language

Put repeated assemblies in ordinary functions with JSDoc parameters and named return values. Pass parent/material explicitly; return the assembly root and attachment markers. Change one parameter at the call site for a variant. Give such a function a name prefix or suffix and use it for every part it creates (`Leg_L`, `Leg_R`); calling it twice with the same names makes duplicate node names, which QA reports as `UNIVERSAL_DUPLICATE_NODE_NAME`. The runnable [reusable-frame recipe](reusable-frame.kiln.js) demonstrates this without imports or hidden dependencies.

When components must move or be replaced together, parent them under a real root
at the assembly's placement datum. Name suffixes alone leave independent siblings.
`recipe:editable-assembly-v1` demonstrates hierarchy replication and replacing one
bracket beneath its retained connection root. Use `replicateAssembly(...).nodeMap`
to find copied nodes; do not guess their generated names. Shared resources need
copying before independent buffer/material edits. Flat hierarchies are still useful
for independent components.

## Levels of detail only when the brief asks

Build one tier unless the brief asks for level-of-detail tiers. When it does, build
every tier from one routine parameterised by level and emit the tiers as sibling
groups under one parent, named with one stem and a level token: `LOD0`, `LOD1`,
`LOD2`, or `Body_LOD0`, `Body_LOD1`. LOD0 is the full-detail tier. Parts every level
shares, such as wheels, stay outside the set. Then declare the set once, LOD0 first:

```js
// Screen fraction of a bounding sphere of radius r at distance d (50 degree vertical FOV, 16:9).
const coverage = (r, d) => (Math.PI * (r / (2 * d * Math.tan((25 * Math.PI) / 180))) ** 2) / (16 / 9);
const tiers = [0, 1, 2].map((lod) => {
  const group = new THREE.Group();
  group.name = `Body_LOD${lod}`;
  root.add(group);
  buildBody(group, lod); // your routine, less detail as lod rises
  return group;
});
// LOD1 from 60 m, LOD2 from 250 m, culled beyond 1.5 km, for a body of radius 2.5 m.
defineLod(tiers, { screenCoverage: [coverage(2.5, 60), coverage(2.5, 250), coverage(2.5, 1500)] });
```

`screenCoverage[i]` is the smallest fraction of the screen, 0 to 1, at which level
`i` still draws; the values strictly decrease, the set is culled below the last
one, and a last value of 0 never culls. Compute each set's values from the bounding
radius of that set's LOD0 and the brief's switch distances, with the brief's field
of view or the one above when it names none. To make a shared part vanish with the
last body tier, give it its own set with an empty group as its last level, named for
example `Wheel_FL_LOD0` and `Wheel_FL_LOD1`, and declare
`defineLod([wheel, farWheel], { screenCoverage: [coverage(0.35, 250), 0] })`.

Two or more sibling tiers without `defineLod`, a gap in the levels, a missing LOD0
or a set declared inside another tier fail the build with `LOD_SET`, which names
the fix. A lone token is only a label. QA treats tiers as alternates instead of
overlapping or disconnected parts. Every GLB Kiln writes carries each set as one
`MSFT_lod` chain: LOD0 stays in the scene, the lower levels leave it, and LOD0's
`extras.MSFT_screencoverage` holds your thresholds. A loader without the extension
draws LOD0, so reported triangles and bounds are LOD0's and the parts outside every
set; `levelsOfDetail` in the render result lists each level's triangles and path. A
default sheet draws LOD0. To review a lower level, make that level's `path` a shot's
subject, with `visibility: "isolate"` to see it alone; the shot draws the level in
LOD0's place, and each chain's `drawn` says which level every view drew. An imported
GLB's chains are kept through save and export.

## Implicit fields are experimental

```js
const blob = await implicitSurface(([x,y,z]) => 1 - Math.hypot(x,y,z), {
  bounds: { min: [-1.2,-1.2,-1.2], max: [1.2,1.2,1.2] }, edgeLength: 0.15,
});
```

Positive values are inside. Bounds/resolution are required; smaller cells cost more and thin features can disappear. Explicit grid/evaluation limits apply. Output has no UVs. Use this for a deliberate organic/cellular experiment, not an unsupported promise of general shelling, remeshing, or CAD accuracy.


For textures, preserve valid primitive UVs. Use `copyGeometry` before independent
buffer edits, `remapUV` to scale/offset UVs, and `projectUV` for explicit planar,
box or cylindrical mapping in a geometry-local frame. Fetch its exact Discovery
contract for rotated frames, partial angular ranges, caps and seam sampling.
`autoUnwrap` is the separate atlas operation. Removed shape unwrap names do not
select a preservation or projection fallback.
