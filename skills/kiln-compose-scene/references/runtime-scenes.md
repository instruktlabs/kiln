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
