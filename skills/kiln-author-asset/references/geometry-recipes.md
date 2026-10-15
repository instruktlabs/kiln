# Choose geometry by the shape you need

Search `kiln_discover` for the shape or operation you need, then fetch exact `ids` for unfamiliar helpers. An overview supplies current `family` and `tags` labels when a filter is useful; `{ kind: "recipe" }` browses optional construction recipes. Each example below lives in `build()` with a named root and suitable material. Adapt or combine recipes freely, including with custom equations and topology.

Parts use the asset frame: metres, +X forward, +Y up, +Z right. Forward is the direction the object faces; a bench's sitter faces +X. Part `rotation` is in degrees and follows the right-hand rule in this frame: `[0, 90, 0]` turns forward (+X) toward -Z, the object's left; `[0, 0, 90]` tips +X up to +Y; `[90, 0, 0]` rolls +Y toward +Z.

For a gripper or carrier, define the payload's occupied volume as well as its
attachment marker. Check the complete gripper housing, palm and jaws against that
volume; separated fingers do not prove the central body clears it. Size the open
jaw gap for approach and release, then verify the closed contact surfaces. Mating
pins and grooves must agree in count, spacing, orientation, depth and clearance in
one shared frame. A locator proves a pose, not a physical fit. Keep these mating
dimensions in the asset brief and shared source parameters.

For moving attachments, inspect intermediate poses along approach, pickup, travel
and release. Matching endpoints can still produce a path through the payload or
support. Keep joints, contact markers and payload motion in the intended hierarchy;
repair the geometry or path where the swept volumes collide.

Measure a resting or mounting frame against the exported geometry, including
angled feet, supports and small protrusions. A nominal primitive bottom or a
locator called `ground` can differ from the actual lowest surface after rotation.
Preserve intentional hanging origins and provide a separate resting socket when
both placements are useful; do not silently move every asset to its bounds.

For directional repeated surfaces, preserve grain direction and texel scale while
varying the phase between neighboring pieces. Identical knots aligned in columns
can make separate boards read as one repeated stamp. Compare a single module with
an assembled span. Random rotation is inappropriate for directional grain and
must not change named atlas regions or their sampling margins.

For ears, handles or other details attached to a rotated or lofted body, derive
their bases from the carrier's local surface and transform them through the same
frame. A nearby world-space point can leave a visible gap after the body rotates.
Use a small intentional base overlap for a solid join, then inspect the exported
attachment from both sides and an oblique view. Preserve unrelated joints and
animation tracks when repairing an attachment; matching names alone does not prove
their transforms or motion survived the export.

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

Choose sidedness deliberately: an inward-facing tunnel lining can use `FrontSide`
with inward triangle winding; a leaf card viewed from both sides can use
`DoubleSide`. GLB has no back-only material flag, so Kiln rejects a used `BackSide`
material instead of exporting it as front-only. Reversing normals alone does not
reverse winding. Double-sided shading adds neither thickness nor end caps. A
negative node scale mirrors the front-face convention; baking that reflection into
vertex positions is a different operation and requires consistent winding and
normal/tangent data. Inspect both sides after export in the intended consumer.

For a pane or panel fitted into a sloping frame, derive its corners and surface
normal in the frame's coordinates. A bar's long axis and a sheet's plane may use
different local axes, so copying a slope angle does not align them. Check all
four transformed corners against the intended frame plane and opening, then
inspect an oblique view where an out-of-plane pane is visible. Matching centers
or bounding boxes alone cannot establish this fit.

For blocks or panels around a cylinder, separate their radial positions from
their orientation. A `boxGeo(length, height, thickness)` has its long axis along
local X. At `[radius * Math.cos(theta), y, radius * Math.sin(theta)]`, Y rotation
`-thetaDeg` points that axis radially outward; `90 - thetaDeg` makes it tangent
to the ring (`theta` is radians, `thetaDeg` is degrees). Derive the orientation
again when the geometry's long axis or parent frame differs. Check one part at
each quarter turn before repeating it. For a continuous wall, inspect neighboring
edges on both its inside and outside, including staggered courses: correct centers
and tangency alone do not guarantee closure. Preserve intentional openings.

For attached veins, ribs or seams, discover `recipe:surface-detail-v1`. Its strip
shares the carrier mesh's sampled boundary vertices and rises along local normals.
A shared equation followed by a separately interpolated curve does not establish
contact with the actual mesh. Check both attachment and final dimensions after a
shape edit; a normal offset can change height as well as depth. This recipe is an
optional open-surface construction, not a requirement to turn every detail into a strip.

For a decal or lamp following a faceted body, ray-projecting the detail's vertices
outside the body does not prove its connecting triangles stay outside. Coarse detail
triangles can cut through the host between those vertices. Where the detail must lie
flush, clip the actual host triangles to the intended footprint and retain their
facet boundaries before applying a small controlled offset. Check the exported
surface head-on and obliquely at every promised detail level; preserve the
footprint and overall dimensions rather than covering the defect with a larger patch.
Check the entire intended footprint, including points where no detail triangles were
emitted: sampling only existing triangles cannot detect clipped-away holes. Use the
first hit on the outward-facing host to distinguish missing coverage from backfaces.
Contrasting body/detail colours can expose gaps; keep that diagnostic tint separate
from the saved material design.

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

Choose the mechanism deliberately: rigid armor plates or robot links can follow
`createJointChain` pivots; a continuous elbow or flexible appendage can use
`createBoneChain` plus `createSkinnedPart` when the installed Discovery exposes
them. Both chains carry the same joint roles and local rest frames. Bones are
opt-in; rigid pivots do not become bones merely because their names say `Joint_`.

For explicit skinning, assemble the bones under the asset root in the rest pose
before binding. Finish topology and UV operations first where practical. Supply
four indices and weights for every final vertex, including duplicated UV seam
vertices; use valid indices even for zero-weight lanes. Weights should sum to one.
`normalizeWeights:true` normalizes a positive sum but cannot infer missing weights
or repair a zero sum. The helper owns cloned geometry and inverse bind matrices;
the caller still owns the bones and shared materials. Changing rest geometry or
reparenting afterward needs deliberate rebinding, not just another animation pose.

If export reports `SKIN_*` integrity findings, repair the named mesh, joint or
vertex range before another render. A missing inverse matrix needs the intended
rest binding restored; an invalid joint index needs the bone order and influence
lanes corrected. Normalizing weights cannot repair either. These source-data
checks also run on review derivatives and in QA warning mode. A valid current-pose
bound does not prove all animation poses, good deformation or collision clearance.

A two-bone ramp is useful for a simple strip or tube, not a general anatomical
weighting rule: for a chosen local transition interval `[startY, endY]`, with
`endY > startY`, use `t = Math.max(0, Math.min(1, (y-startY)/(endY-startY)))`,
indices `[baseIndex, tipIndex, baseIndex, baseIndex]` and weights `[1-t,t,0,0]`.
Keep the interval, joint placement and profile appropriate to the asset. Inspect
rest, intermediate and extreme poses under the actual parent transforms; correct
volume loss, exposed caps and pinching in the geometry/weights. Verify the chosen
converter preserves skinning: the explicit Three exporter supports this path,
while the legacy converter remains the default and does not preserve skins.

Before mirroring a hand, inspect its local frame, palm, thumb web and any tool grip.
Weak anatomical cues can look reversed without a left/right frame error. Refine the
shape while preserving a correct wrist pivot and attachment frame, then check hand
clearance through the relevant motion and against the complete carried tool.

Define the palm normal, finger direction and thumb side in each hand's local frame.
A grip marker reaching a handle does not establish a natural grip orientation.
Solve reach with elbow and torso clearance as well as wrist alignment, distributing
rotation through the forearm when appropriate. Inspect finger wrap and the actual
skinned wrist and shoulder surfaces between keys; a correct joint frame can still
produce a stretched sleeve cap. Neutral palm direction and pose belong to the
asset brief, rather than a universal character default.

For a shield or other broad carried plate, define the intended support pose as
well as its mounting frame: which way the plate faces, where the grip lies, and
how the forearm runs along the inner surface. Solve the elbow within a plausible
reachable pose, keeping it clear of both plate and torso. A clearance fix can
still pull the elbow into the body or turn the plate away from its intended
direction. Inspect rear and side views through carry, guard and recovery, using
the actual arm and plate surfaces rather than only their centres or boxes.
Keep the requested pose and dimensions in the asset brief; preserve unrelated
geometry, materials and clip channels when refining its support or grip.

When reducing draw calls, consolidate compatible geometry within the same rigid
motion parent. Give independently moving groups real, named `Joint_*` pivots and
put their rigid geometry beneath them. Preserve attachment markers and consumer
lookups. In builds with rigid-group `full` optimization, the rigid-merge pass retains
node names, but a named mesh outside a protected boundary can become empty or contain
other parts' geometry. If each named part must keep its geometry, use `off` or
`palette` optimization and disable the separate GPU-instancing pass, which can remove
named instance nodes (`instance: 'off'` in library calls or `KILN_BAKE_INSTANCE=off`
in the host). Recheck what each
lookup controls, clip targets and intermediate poses after export; fewer meshes
alone does not establish a successful optimization.

In custom consolidation, a scalar mesh material applies to every geometry group.
Group `materialIndex` selects an entry only when `mesh.material` is an array;
indexing a one-element array for box face groups can silently create default
materials on some faces. Preserve valid material assignments, then inspect the
exported faces rather than relying on a successful merge or export.

Budget materials within each rigid group. Reuse the parent's material for tiny
fixed details when it gives the intended appearance; a separate material adds a
potential draw even when the detail is small. One material does not guarantee
one draw: vertex layouts, protected parts, transparency and vertex-limit splits
also constrain merging. Available `drawDiagnostics` can help locate these costs;
read its scope and skip reasons, then measure in the destination.

Budget skinned mesh count as well as triangles. A small articulated asset can
still submit many draws when each segment is a separate skin, even if the parts
share one texture. Where the authoring/export path supports it, combine
compatible surfaces into a skin with a shared skeleton and material. A skin-aware
consolidation must preserve bind transforms, joint indices and weights, normals,
UVs, morph channels and attachment frames. Keep separate skins when their
materials, skeletons or visibility controls require them. Do not send skins
through a rigid merge by weakening its rejection checks.

Avoid unintentionally overlapping coplanar faces on separate parts. Merging can
change which face wins a depth tie even when geometry and colours are preserved.
Use a shared surface, remove hidden duplicate faces or give a deliberate overlay
the separation it needs. Inspect the actual exported surface from relevant views;
do not offset every touching joint or treat a sampled coplanar flag as a defect.

## Materials and directional UVs

For a leaf-card alpha path, discover `recipe:foliage-cutout-v1`. It binds a real
alpha-bearing approved texture to `foliageMaterial`; MASK alone does not create a
leaf silhouette. Its bundled 4×4 texture is a teaching placeholder. Check current
material capabilities before choosing a delivery resource, then inspect GPU views
and destination filtering/backfaces. Raw `THREE.DataTexture` is not an available
authoring route. Solid leaves and custom surfaces remain valid alternatives.

For original cutouts, `proceduralTexture` V3 authors rectangular RGBA pixels;
`textureAtlas` combines named fixed regions from V3 recipes or exact saved map
revisions. Discover their full contracts before authoring. Atlas regions do not
pack or resize themselves. Reserve nonoverlapping gutters and choose edge copying
or transparent RGB dilation for the actual filtering and alpha policy.

Map unit UVs with
`remapUVToAtlas(geometry, atlas, 'region-name', {inputOrigin:'bottom-left', mode:'texel-center'})`.
Choose `inputOrigin` from the source UV convention and `mode` deliberately:
`texel-center` insets to edge texel centers, while `content-boundary` uses the
content rectangle boundary. Finish topology and then remap the correct region;
do not rotate arbitrary charts over a painted atlas and expect the artwork to
follow. A geometry-wide region binding does not assign separate regions to
material groups. For repeating grass or directional wood, preserve or project
UVs and tile a standalone texture instead of forcing every surface into an atlas.
Neither atlas remapping nor `autoUnwrap` creates painted detail.

For repeated boards or other directional surfaces, align UV length with the
physical grain direction and retain the chosen texel density. Repeating the same
narrow UV band can miss a texture's authored detail even when the map is bound.
Use deliberate deterministic offsets when variation is intended, and inspect a
close perspective view as well as the assembly; a low-contrast surface alone
does not prove missing textures or a rendering defect.

When projecting along a chosen grain axis, use an alternate projection for faces
whose normal is parallel to that axis; otherwise their UV area can collapse to a
line. Check exported nondegenerate faces for usable UV area, including end faces
and caps. A separate visible end-grain cap can be intentional, but does not repair
the underlying face's UVs or justify claiming every chart is valid.

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

Node and material `userData` carries application metadata as glTF extras. Use plain
JSON and stay within 4 KiB per object and 64 KiB per asset; keys beginning `kiln` are
reserved. Build warnings name omitted values. `visible = false` preserves hidden
subtrees in export through `KHR_node_visibility`; their triangles are listed apart
from headline metrics. Verify visibility support in the target application.

Use `markOpenShell(part, 'why the boundary is intentionally open')` for a sheet or
open tube. This records an acknowledgment when solid overlap cannot be measured;
it does not suppress a measured collision or certify topology.

Track helpers accept `STEP`, `LINEAR`, `CUBICSPLINE`, `EASE_IN`, `EASE_OUT` and
`EASE_IN_OUT` interpolation. The eased choices apply between each pair of keys and
export standard cubic sampler tangents. For example,
`rotationTrack('Joint_Lid', [{ time: 0, rotation: [0,0,0] }, { time: 1, rotation: [0,0,90] }], 'EASE_IN_OUT')`
starts and ends a swing at rest. Discover the track helper for its exact key format
before authoring other channels.

Source export indexes unindexed geometry using exact full-vertex equality. The
`indexBuffers` receipt measures accessor bytes before and after this pass. Host
`KILN_INDEX_POLICY=asBuilt` preserves helper buffers with optimization off; this
choice belongs to export settings, not asset source.

Put repeated assemblies in ordinary functions with JSDoc parameters and named return values. Pass parent/material explicitly; return the assembly root and attachment markers. Change one parameter at the call site for a variant. Give such a function a name prefix or suffix and use it for every part it creates (`Leg_L`, `Leg_R`); calling it twice with the same names makes duplicate node names, which QA reports as `UNIVERSAL_DUPLICATE_NODE_NAME`. The runnable [reusable-frame recipe](reusable-frame.kiln.js) demonstrates this without imports or hidden dependencies.

Include the assembly and element index in repeated child names as well, so each
leaflet, slat or fastener remains addressable during revision comparison. When a
resize must retain those children, keep their count explicit and redistribute
their attachment positions; deriving the count from the new length can silently
delete parts. Check the exported child inventory as well as the changed outline.

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

## Game delivery: colliders, anchors, kits, bakes and budgets

Add these only when the brief asks for a game-ready asset. Each is plain glTF a
loader can read; the manifest lists them and its advisory warnings name problems.

```js
defineModule(root, { footprint: [4, 0.6], height: 3.2, snapAxis: 'x', origin: 'center' });
port('west', { parent: root, position: [-2, 0, 0], rotation: [0, 180, 0] });
port('east', { parent: root, position: [2, 0, 0] });
colliderBox([4, 3.2, 0.6], { id: 'frame', parent: root, position: [0, 1.6, 0] });
anchor('door', 'main', { parent: root, position: [0, 0, 0.3] });
anchor('light', 'lintel', { parent: root, position: [0, 3, 0.35] });
repeatInstances(boltGroup); // identical bolts become one instanced mesh in the three.js export
bakeSurfaceAttributes(root, { edge: { thresholdDegrees: 35 }, cavity: { rays: 32 } });
defineBudget({ triangles: { LOD0: 6000, LOD1: 1500 }, draws: 4 });
definePalette(['#5b6066', '#2e3135', '#8a4b2a']);
requireSolid(frame);
```

- Colliders are hidden proxies; the box size or capsule `[2r, h, 2r]` is the node
  scale. Keep each one inside the drawn bounds and touching what it stands for.
- An anchor is a leaf transform (door, light, spawn); never parent parts under it.
- Place ports inside the module footprint. One module per asset.
- Bake after every occluding part is attached. `_edge` is 1 on rims and chamfers,
  `_cavity` is 1 when exposed; both are 0..1 floats.
- Budgets and palettes are advisory. `requireSolid` fails the build unless the part
  is closed, manifold and outward; build it from solid helpers (`boxGeo`,
  `extrudeProfile`, `revolveProfile`, `roundedBoxGeo`) rather than open sheets.
- For a far tier drawn as a card, pass `impostor: true` to `defineLod`; the last
  level is the impostor.

A cactus (`vegetation.subtype: 'cactus'`): a ribbed trunk from a star outline with
6 to 12 rounded ribs through `extrudeProfile(..., { axis: 'y', taper, divisions })`,
arms swept with `pipeAlongPath` through an elbow (out, then up) and embedded in the
trunk, small spine cards on the rib crests, and explicit tiers: full LOD0, fewer
ribs and no spines at LOD1, and a `crossedQuadsGeo` impostor last.

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

For a packed baked texture, `await autoUnwrap(geometry, options)` returns new
buffers and leaves the source unchanged. It duplicates seam vertices and remaps
vertex colors, skin indices/weights, extra UVs, custom per-vertex attributes
(1..4 components), and position/normal/color morphs. It retains triangle groups,
draw range and JSON metadata. It replaces UV0 and drops stale tangents; recompute
tangents after the final UV layout. Skin bindings and animation remain on the
mesh/skeleton, so verify an exported posed mesh before relying on deformation.

Default unwrapping recomputes normals. Use `useNormals: true` to preserve authored
normals and when normal morphs need their original reference frame. The installed
xatlas adapter supports at most 65,536 vertices both before and after seam
splitting; split larger geometry. Instanced data and unsupported morph semantics
fail explicitly. Read the returned `userData.atlas.width/height`; requested
`resolution` is a target and the packed image can be rectangular. Unwrapping
cannot preserve the appearance of a texture painted for the old UV0: rebake it.
For directional wood grain or a tiled wall, prefer existing primitive UVs or
`projectUV` rather than an arbitrarily rotated atlas.
