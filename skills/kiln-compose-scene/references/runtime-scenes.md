# Interactive scenes and runtime qualification

Read this for an environment or proving application, rather than a simple asset
arrangement. These are consumer workflows, not additional Kiln CLI/MCP commands.
The examples describe consumer implementations; the private proving-scene kit is
not installed by the Kiln engine package. Verify the destination's available APIs.

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
Keep the user's orbit and zoom separate from obstacle-induced camera pull-in.
Exercise a continuous drag with rendered frames between touch moves, and check
both heading and distance; a heading-only check misses progressive zoom drift.
Verify two-finger pinch in both directions, gesture changes, obstruction recovery
and release without moving the actor. Touch emulation is functional evidence,
not a substitute for physical-device rendering or timing evidence.

When switching between touch and keyboard controls, release only the movement
owned by the control being removed. Test the first keyboard press after both an
idle and an active joystick, plus delayed touch release, cancellation and unmount;
old cleanup must not erase newer input. Also verify that releasing the current
control stops movement and that disabling input clears every source.

Separate in-place animation from world movement. A representative animated scene
may need both, including changing camera visibility, instead of every actor
walking at its origin. Preview controllers should restore inspection poses and
hand control back cleanly. State limitations such as kinematic driving or lack of
navigation instead of presenting a scripted preview as complete gameplay.

When animation runs every rendered frame but movement uses fixed steps, apply the
final pose and attachment corrections after animation on every rendered frame,
including frames with no simulation step. Check start/stop, tool removal, seating
and return to overview at substep intervals. Hand clearance alone does not prove
that an empty hand has a relaxed gesture or a natural wrist orientation.

For shaders using a moving local origin, compensate every wave phase and texture
lookup in the same signed, rotated and scaled coordinates as its shader stage.
Freeze animation and move the camera a small distance across origin and tile
boundaries on both axes; compare against a repeated capture at the same position.
Review low and aerial camera paths as well as static views for surface snapping.

For an embedded HUD, size panels against the scene's own box, including short
landscape views. The optional proving kit anchors its default help and credits
panels to the HUD independently of toolbar height, and lets nested joystick and
touch buttons receive pointer input. Scene CSS may keep an inline panel or bottom
sheet; preserve its intended stacking above play controls. Check scrolling,
keyboard entry and Escape focus return, then use actual touch events to verify
movement, release and no click-through. Desktop mouse success alone does not
establish the touch contract or physical-device acceptance.

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

Merge compatible material/layout groups inside real animation and interaction
anchors. Preserve every anchor's name, transform, children and own geometry.
For builds with Kiln's rigid-group `full` mode, consult the named-part contract in the QA skill's
`references/engine-handoff.md`: a name alone does not make a boundary, and a
named non-boundary mesh can become empty or absorb its group's geometry.
Check the meshes each runtime lookup controls. Disable separate GPU instancing
when per-node identity or geometry matters (`instance: 'off'` in library calls);
that pass can remove named instance nodes. The rigid-merge pass protects animation,
joint, semantic, visibility and LOD boundaries and composition placement roots;
its locked primitives and vertex splits can leave several draws per material.
The scene-specific merge behind the following measurements separately excluded
transparent, multi-material, skinned and morphed parts. It kept doors, wheels,
limbs, colliders and the frame graph working while a farmhouse went from 16 to
11 draws and a bridge from 148 to 20. Split very long structures into a few
spatial groups so culling still works. Two side effects need checks:
- Keeping the source vertex layout can avoid extra pipelines. It saved 2-3 per
  view in one scene and cost 5-10 in another, so measure it.
- Merging changes the draw order of coplanar and nearly coplanar faces. A curb
  that now won the depth tie against a walkway stippled the kerbs; ordering the
  curbs first inside the merged mesh fixed it at no extra draw. Parts in
  different buckets keep one fixed order for every view, so split a bucket
  where the per-part draw order matters. In an experimental bridge variant,
  splitting tower panels at the ribs' height, one draw per tower, brought a
  193 px tie under a 100 px budget. That prototype was not the adopted bridge
  solution; do not treat its result as acceptance of a shipped scene.

Use available `drawDiagnostics` as a bounded inspection aid; the QA skill's
`references/integration-checks.md` explains its scope, skips and observations.
Its per-anchor estimate uses existing materials and eligible rigid groups,
including locks and splits; it is not a full-mode or renderer prediction.
Mirrored-tangent and sampled coplanar candidates direct destination checks,
not automatic repairs or acceptance. Count the actual extra passes separately.

Treat each extra pass as its own budget:
- **Shadow pass.** Use material-free depth stand-ins per anchor and shadow side.
  Cache a static sun map, and keep a separate live map for casters observed to
  move, with a settle period. Render the map once per frame when a second camera,
  such as a planar reflector, would render it again. Stop casters smaller than
  about two shadow texels from casting. Together these took one farm's shadow
  pass from 270 draws a frame to 0 when settled, and to 31-54 with ambient
  animal life. A bridge scene went from two 37-draw shadow passes to one 2-draw
  pass. On a GPU-bound mobile tier, the combined changes raised frames within one
  display refresh from 39% to 61-82%. On a desktop locked to 120 Hz, frame time
  did not move; CPU render time fell from 5.5 ms to 1.6 ms.
- **Reflection pass.** Draw a cheaper representation, such as a far LOD, on a
  layer that only the reflection camera sees. Keep which moving objects appear
  in the reflection as a look decision of its own.

A cached shadow only pays where its frustum stays still. A shadow box that
follows a driven car re-renders every frame, so measure moving workloads before
enabling it.

The current proving kit watches `morphTargetInfluences` on casters registered
under a `movable` node, alongside matrices, visibility, casting and instance
matrix/count changes. Changing morph weights promotes them to the live map until
they settle; watched skins remain live. This does not scan geometry or shader
graphs. Register continuous shader-position animation, custom instance attributes
and other unobserved deformation with the `live` predicate on the first track;
call `invalidate` after discrete unobserved changes to static casters. Verify
that the deformation also reaches the shadow pass. These are consumer cache APIs,
not extra requirements on standalone assets.

In three r186's WebGPU renderer every `InstancedMesh` binds its own pipeline,
because its uuid is part of the material cache key. `EXT_mesh_gpu_instancing`
therefore saves draws but adds a pipeline per instanced group: instancing one
campus's structures raised its main-pass pipelines, summed over its views, from
77 to 346. What worked was one shared material reading per-part data: colour
and roughness as vertex data, instance matrices as attributes of plain meshes.
That took a campus planting from 21 pipelines to 10 at the overview and from
40-49 to 11-13 near the ground, with pixel parity.

Transforms implemented only in a material graph may be bypassed by override
materials in shadow, depth or picking passes. Supply equivalent transforms for
those passes or keep the affected meshes out of them. The planting example has
no such pass and explicitly prevents the shared plant meshes from casting shadows.

For an isolated animated-shadow comparison, use the actual caster geometry and
deformation on a receiver-only image. Verify that disabling casting leaves it
blank for both reference and derivative, and that omitting the animated shadow
transform fails the comparison. Coplanar actor pixels can contaminate a receiver
image even when they are grey; exclude the main-pass actor geometry while keeping
the shadow pass active. Record pose, instance transforms, light/map settings and
image tolerances. This checks projection equivalence; the actual scene still
needs map coverage, contact/self-shadow, camera-transition and cost review.

When a frame's main pass is never split by a mid-pass copy (for example a
depth-texture read for water), its multisampled attachments need not be stored
after the resolve. Discarding them changed nothing measurable on a desktop GPU.
On a mobile GPU, GPU busy at the same frame rate fell by 3-8 points, and frames
within one refresh at a GPU-bound tier rose from 40% to 49%. Fail loudly when
something would reload the attachments.

Read mobile GPU work as busy × clock, not busy alone. The governor changes the
clock with load, so the same busy share at a higher clock is more work. Where a
tablet's busy column read mixed, busy × clock fell by 15% and 24%.

Over long view distances, a 24-bit depth buffer with a 0.5 m near plane steps
by about 0.12 m at 1 km, 3 m at 5 km and 48 m at 20 km, growing with distance
squared, so distant near-coplanar surfaces flicker as the camera moves.
Reversed depth addresses that loss of precision. In three r186 it needs three adaptations: draw
the sky first without a depth test, rebuild a planar reflector's oblique
projection, and flip the sign of polygon offsets. On WebGL2 it also needs
`EXT_clip_control`, or three falls back to a standard buffer.
This repository's optional scene-kit exposes `reversedDepthBuffer` on
`SceneDefinition` and `RendererFactoryOptions`, defaulting to `false`. A scene
must opt in and implement its own adaptations. After renderer initialization,
use the effective `renderer.reversedDepthBuffer` for projection and offset
changes: a request can become `false` on unsupported WebGL2. Pass the camera's
coordinate system and effective reversed-depth flag to custom frustum tests.
Recheck sky, reflection clipping, offsets and depth-reading materials on both
backends when upgrading three; support in the renderer alone is not scene
qualification. These are consumer runtime APIs, not Kiln CLI/MCP switches.

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

Hiding draws does not necessarily stop CPU animation. Count evaluated rigs and
motion owners as well as visible actors. A projected-error selector may demand
exact poses behind the camera. For a qualified shared clip, the consumer can
avoid that work when its bound, inflated by the admitted source-error budget,
and its shadow sweep both miss the view. Preserve the receiver/light assumptions;
sampled bounds and error evidence do not become continuous guarantees. Missing
clips, uncertain bounds and visible shadows retain the original path. Reevaluate
on camera, depth convention, viewport, light and culling changes, and restore
the source before the first visible frame. Check reverse seeks and camera travel,
not only a frozen hidden group.

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

Inspect the pinned renderer before assuming asynchronous main-pass compilation
also prepares shadow pipelines. If startup uses actual offscreen passes, retain
the production scene/light identity, restore temporary owner and target state,
release the owned target and regenerate shadows after restoration. Include its
completion in readiness cost; identical later images do not justify a long
startup delay by themselves.

Startup admission must recognize the actual draw representation. A plain mesh
with instanced buffer geometry uses the geometry's instance count, rather than
an `InstancedMesh` count. Admit only existing nonempty instance capacity, with
valid initialized transforms, and snapshot shared geometry once. Restore its
count separately from object visibility and culling, including when compilation
or rendering fails. Never invent instances for empty buffers. Verify restored
production images and resource release on each supported backend; an offline
count test alone does not establish rendered compatibility or loading cost.

Distinguish an application's ready marker from its first visible scene frame.
An awaited preparation pass may drain the GPU queue while the reference marker
leaves work outstanding. Record the first rendered/presented scene separately
before treating marker differences as the user's loading-time cost. Keep any
screenshot/readback overhead explicit and use the same observer for each mode.

Compare scoped actual-phase preparation with admission of every hidden variant.
When preparation temporarily samples a future state, restore the original clock,
controller owners, camera, visibility and instance selection before the live loop.
Verify restored actor/ship state and fixed images as well as failure cleanup.
Compiling for one target and drawing another can prepare different pipelines;
measure the complete strategy rather than assuming both steps are necessary.
A warmed phase does not qualify other entry cameras or future representations.

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

Prove reusable derivative commands through a packed, freshly installed consumer,
using another asset family as well as small supported and rejected fixtures.
Inject the consumer's exact dependency installation; do not resolve libraries
from a developer's unrelated checkout. A transform bank must deliver its retained
source GLB or an independently resolvable exact source, alongside payload hashes.
Preserving a developer-machine path in a manifest does not supply that file.
Keep skin/morph rejection and the original fallback explicit; rigid success
does not qualify deformation support. Retain the source's materials and licenses
even when an image-free sampling copy removes materials for evaluation.

Where profiling identifies hierarchy work, private fixed-topology clones may
cache named-node lookup. Preserve preorder first-match behavior for duplicate
names, restore the original lookup before topology/name edits, and never install
the cache on a saved master. Defer redundant world synchronization only when the
caller owns the complete final synchronization. Compare all posed part matrices,
contacts, forward/reverse seeks and restored visible images, then measure actual
frame intervals. Fewer tree visits alone do not establish a device performance gain.

Ship the individual editable assets and rebuilding dependencies distinctly from
runtime assets and scene code. Preserve material/asset licenses separately from
software licenses, and preserve original author/refinement attribution. A scene
shader is not automatically portable through a GLB export. Check the delivered
consumer path and portable resource closure; an older sealed archive does not
contain later development-scene changes. Keep technical qualification separate
from the owner's visual acceptance.
