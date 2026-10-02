# Interactive scenes and runtime qualification

Read this for an environment or proving application, rather than a simple asset
arrangement. These are consumer workflows, not additional Kiln CLI/MCP commands.

## Layout and environment

Use the requested experience and camera range to choose the layout. Connect
destinations with paths, passages and crossings; inspect both human-scale and
aerial views when relevant. A collection inventory does not by itself make a
convincing environment. Repeated vegetation should follow useful spatial rules
and sightlines, not hide every asset or accumulate around the camera.

Keep the authored ground origin and supported optional bases explicit. Terrain,
planting, environmental effects and controllers can be scene dependencies without
altering saved asset revisions or requiring a Kiln project. Preserve exact input
identities when building a project's proving scene.

Review the ground with vegetation reduced as well as at full density. Select
material scale, color, roughness and normal detail for the intended scene; a crop
soil material is not automatically a suitable meadow. Record original procedural
recipes, deterministic seeds and dependencies separately from downloaded textures
and their licenses. Keep color and non-color texture spaces correct.

For a continuous-looking landscape, carry terrain and planting beyond the normal
view envelope. Large terrain triangles can bridge over narrow streams even when
the height function is correct. Inspect the actual rendered bed and bank geometry,
shared boundaries and waterline. Derive water coverage/depth from that geometry;
flowing shading must follow the channel. Optical approximations need not change
collision heights or become a fluid simulation.

## Interactions and animation

Use the actual actor and asset pivots to test passage, seats and attachments.
Check closed, open and moving door states and safe dismounts. A path over a river
needs a real supporting collision surface. Broad-phase bounds alone do not prove
that a person can pass through an opening.

For a follow camera, run its actual update and controls during passage checks.
A controller-only loop can pass while the rendered camera hides the actor behind
an eave or lintel. Inspect the animated head and accessories, not only a clear
ray toward the torso; keep camera dimensions and fixes in the consuming scene.

Separate in-place animation from world movement. A representative animated scene
may need both, including changing camera visibility, instead of every actor
walking at its origin. Preview controllers should restore inspection poses and
hand control back cleanly. State limitations such as kinematic driving or lack of
navigation instead of presenting a scripted preview as complete gameplay.

## Optimization and measurement

Use instancing for compatible repeated geometry/materials, with useful spatial
bounds. Pool identical resources by verified identity. Preserve named animation,
interaction and attachment contracts when merging or deriving runtime assets.
Changing the source asset to improve one scene is not always necessary.
Measure the number of render groups and initialized shader programs as well as
triangles. Many small instance groups can add startup and submission cost even
when they share materials. Wider spatial groups can reduce that cost while
submitting more off-camera geometry; compare both effects during traversal.

Set shadow policy by the scene's visual needs. Casting and receiving are separate
costs; small ground plants may read well through material shading alone. Keep
moving actors, doors and machinery correct when testing shadow updates. Freezing
a shared shadow map also freezes their shadows. Compare filtering, shadow-map
resolution and caster geometry explicitly rather than assuming a smaller main
render buffer removes shadow cost.

### Draw calls and extra passes

Count before changing anything. Record draws, bound pipelines and triangles per
render pass (main, each shadow map, reflections, output) for every quality tier
and named view or workload, not only the landing camera. Attribute draws to
scene systems. Count-only what-ifs (hide a system, freeze a pass, drop small
casters) give upper bounds for each lever before you build it. In the three.js
proving scenes, one farm view drew 583: 312 main, 270 shadow and 1 output. A
bridge drew 148 of the 180 draws at the lowest tier. Rank levers per scene from
its own numbers; the same lever can matter in one scene and be absent in another.

Merge rigid parts by material inside anchors, and keep every anchor as a real
node with its name, transform and children. Anchors are animation targets,
pivots the application moves, nodes it looks up by name, nodes carrying
semantic data, and visibility or LOD switches. Leave transparent, multi-material,
skinned and morphed parts separate. A per-material merge kept doors, wheels,
limbs, colliders and the frame graph working while a farmhouse went from 16 to
11 draws and a bridge from 148 to 20. Split very long structures into a few
spatial groups so culling still works. Two side effects need checks:
- Keeping the source vertex layout can avoid extra pipelines. It saved 2-3 per
  view in one scene and cost 5-10 in another, so measure it.
- Merging changes the draw order of coplanar faces. A curb that now won the depth
  tie against a walkway stippled the kerbs.

Treat each extra pass as its own budget:
- **Shadow pass.** Use material-free depth stand-ins per anchor and shadow side.
  Cache a static sun map, and keep a separate live map for casters observed to
  move, with a settle period. Render the map once per frame when a second camera,
  such as a planar reflector, would render it again. Stop casters smaller than
  about two shadow texels from casting. Together these took one farm's shadow
  pass from 270 draws a frame to 0 when settled, and to 31-54 with ambient
  animal life. A bridge scene went from two 37-draw shadow passes to one 2-draw
  pass.
- **Reflection pass.** Draw a cheaper representation, such as a far LOD, on a
  layer that only the reflection camera sees. Keep which moving objects appear
  in the reflection as a look decision of its own.

A cached shadow only pays where its frustum stays still. A shadow box that
follows a driven car re-renders every frame, so measure moving workloads before
enabling it.

Many instanced groups that differ only by a material constant compile one
pipeline each. Carrying part colour and roughness as vertex data behind one
shared material took a campus planting from 21 pipelines to 10 at the overview
and from 40-49 to 11-13 near the ground, with pixel parity.

When a frame's main pass is never split by a mid-pass copy (for example a
depth-texture read for water), its multisampled attachments need not be stored
after the resolve. Discarding them changed nothing measurable on a desktop GPU.
On a mobile GPU, GPU busy at the same frame rate fell by 3-8 points, and frames
within one refresh at a GPU-bound tier rose from 40% to 49%. Fail loudly when
something would reload the attachments.

Report cached features in both their settled and their running state. With the
clock running, the farm view that drew 583 drew 314-337, with about ten static
re-renders a minute. Check look parity three ways:
- the same build with each lever switched off;
- the build before the change against the build after;
- a repeat capture of the same build, for the noise floor.

Tile-mean metrics can miss thin-line regressions, so also count the pixels that
differ strongly. Show every intended shadow change, such as small parts that stop
casting, as image pairs for review.

Profile transform updates as well as draw submission. Cache matrices only for
placements the application knows will remain fixed. Keep animated and controlled
hierarchies live, and restore or rebuild the cache before placement or variant
changes. Check exact world transforms, visibility and culling in the consumer.

Treat LODs, mesh simplification, compression and impostors as optional derived
products. Keep editable masters and derivative provenance. For aerial and side
views, an upright billboard alone can collapse from above; compare multiview or
hemispherical impostors with simpler geometry. Validate transitions, silhouettes,
alpha edges, lighting/shadows, texture memory and overdraw in the actual consumer.
Do not claim Kiln generates these products unless that capability is installed
and verified. Their production need not burden ordinary asset authoring.

Freeze the scene, assets, dependency versions and quality settings before a
comparison. Verify the actual renderer/adapter, not only the requested backend.
Qualify every promised backend separately, including cold entry and representative
warm motion where relevant. A useful workload includes camera movement, actors,
interactions and shadows that the destination will actually use.

Exercise the first appearance of distant spatial batches and first controller
actions separately from warmed motion. A shared material does not prove every
render pipeline is ready. Drive the application's real interaction path and mark
the affected frames. Measure initial loading alongside any shader preparation;
moving an interaction hitch into a long startup stall is not a demonstrated
improvement. State which browser, network and driver caches were actually cold.

Check host CPU/GPU and competing processes before and during measurement. Keep
contaminated runs with their rejection reason; do not label loaded-host timings
as a baseline. Stop only task-owned work unless the owner authorizes more.
The agent host and its browser panels can themselves consume CPU/GPU. With owner
authorization, minimize inactive interfaces while preserving the host process,
then recheck load; record and restore any changed window state. GPU residency
does not prove activity, and device-busy and per-engine counters may have different
normalizations. Retain the raw observations and identify each metric's scope.
Require the measured page to be visible before loading and throughout sampling.
An inactive display or occluded page can look like an idle GPU because rendering
has stopped. Retain visibility failures instead of disabling browser throttling
or treating hidden-page samples as fast frames.

Record actual canvas CSS dimensions, drawing-buffer dimensions, pixel density,
browser viewport and display size. A full-size render buffer inside a small
window is different from native full-display operation. Qualify fullscreen and
orientation changes explicitly, especially when they increase mobile pixel
count. Test physical mobile devices; desktop emulation alone is not acceptance.
Define a quality tier as an explicit set of pixel, vegetation and shadow budgets.
Compare individual changes where attribution matters and the combined tier for
the user experience. A short run whose average barely exceeds the target does
not establish sustained pacing or thermal headroom. Review visible quality costs
at the actual device size before making a tier the default.
Measure instrumentation overhead with matched controls. Distinguish in-page
recording from external host observers, and keep outliers and first-load costs.
Record draw/shadow passes without double-counting nested callbacks. Separate CPU
submission, fresh GPU queries and frame intervals, including their measurement
scopes. A successful shader compile or a triangle count is not a performance gate.
Label memory totals by the processes included. Keep browser working sets separate
from the test server and observers; summed process RSS can also count shared
mappings more than once and is not GPU memory or unique physical allocation.

## Delivery

Ship the individual editable assets and rebuilding dependencies distinctly from
runtime assets and scene code. Preserve material/asset licenses separately from
software licenses, and preserve original author/refinement attribution. A scene
shader is not automatically portable through a GLB export. Check the delivered
consumer path and portable resource closure; an older sealed archive does not
contain later development-scene changes. Keep technical qualification separate
from the owner's visual acceptance.
