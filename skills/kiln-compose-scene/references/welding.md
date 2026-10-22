# Kiln welding

Use this workflow to assemble Kiln assets into a destination game's structures
and rendering. Keep individual editable revisions and a reproducible assembly;
the merged geometry is a derived runtime artifact. The destination may be an
existing game or a new scene. A Kiln project is optional.

This workflow describes integration code in the consuming workspace. There is
no `kiln_weld` tool. Inspect the installed tool/API contracts before choosing an
export or loader; use the composition API reference for a single scene GLB.

## Establish the assembly contract

Read the game's loader, frame conventions, materials, collision and placement
code before changing its integration. Identify the actual asset revisions and
runtime exports, including metadata, required extensions and decoders. Verify
the decoded result with that loader; a successful editable-GLB review does not
prove that a compressed runtime file loads correctly.

Give each placed instance a stable ID, source identity and explicit transform.
Record the source units, axes, origin, bounds, surface roles, attachments and
moving parts. Use authored sockets or the destination's layout to place parts.
When matching sockets, align their orientations as well as their positions.
Do not infer functional placement from a bounding box alone or stretch a piece
to fit if that would distort openings, thicknesses or mechanisms.

Keep the layout, role table and material bindings in the consuming workspace.
Missing required roles or placement data should produce an actionable error,
not silently select a similar-looking material or discard a part.

## Choose what to combine

Welding means fitting pieces into the scene's rendering and gameplay systems;
it does not always require merging meshes or coincident vertices. Choose among
ordinary placed meshes, instances of repeated geometry, and merged geometry
based on the destination's measured costs and required behavior.

For merging, group compatible geometry by material and shader attributes,
render state, motion owner and useful spatial/culling region. A whole-world
batch can lose culling and increase work. Keep doors, ramps, wheels, turrets,
weapons, animated actors and removable pieces under the pivots or skeletons that
own their motion. Merge within those owners when appropriate. Do not bake a
moving part into a static structure to achieve a lower draw count.

Map authored surface roles to the game's material families deliberately. Read
the asset's actual role encoding; material names, vertex colors and metadata
are not interchangeable universal conventions. Preserve UVs, normals, colors
and custom channels required by the destination shader. A UV channel may carry
procedural surface data rather than texture coordinates. Drop an attribute only
after consuming its meaning and verifying that the destination does not need it.
Check opacity, emission, shadows and material appearance in the game's renderer.

## Bake into the correct frame

Update the loaded hierarchy's world matrices before extracting geometry. Express
each source mesh in its destination batch's local frame: destination-world inverse
times the placed source-world transform. Apply units and axis conversion once,
using the destination's conventions. Transform normals with the corresponding
normal matrix. A negative determinant needs winding/handedness handling after
baking; the renderer can no longer correct it through the old object's matrix.

Decode quantized positions and honor their node transforms before writing new
floating-point geometry. Do not mutate packed normalized attributes in place
as though they already contained world-space metres. Skinned exports may carry
dequantization in inverse bind matrices. Evaluate their bind/rest-pose transforms
through the loader, or retain the skin when animation is needed; a mesh-node
matrix alone is not sufficient. Rigid joint ownership is usable only when the
asset actually has rigid weights. Do not generalize it to blended skinning.

Preserve hard edges, material boundaries and UV seams. Mesh batching is not
topological vertex welding: do not run a global proximity merge merely because
parts touch. If seamless topology is required, treat it as a separate geometry
edit with an appropriate tolerance and inspect the resulting shading and gaps.
Avoid changing shared cached source geometry while baking several instances.

## Preserve gameplay identity

Carry collision shapes, sockets, interaction targets and semantic part IDs
through the same frame conversion as the visible pieces. Keep their stable
records available after render meshes are combined. A rendering batch is not
automatically the right collision mesh or interaction owner. Maintain the
destination's authoritative layout rather than reconstructing gameplay data
from a finished screenshot or a broad AABB.

Check required contacts and required gaps at actual interfaces: both ends of a
support, doorway clearance, a socket's seated component and a moving mechanism's
intermediate poses. Exercise doors, pickups, seats or weapon attachments when
they are part of the task. Keep scene-specific dimensions, controllers and
damage rules in the consuming workspace. See the runtime scene reference for
traversal, camera and animation qualification.

## Prove the destination result

Compare the placed inputs and the derived batches for bounds, expected triangle
coverage, surface-role assignment and preserved moving/interactive parts. Inspect
representative mirrored or scaled placements when used. Run the real camera
and relevant interactions, including repeated use and intermediate motion.

Measure draw calls per pass and frame/startup costs in the actual destination,
including the moving workload when relevant. Distinguish a deliberate art
integration from a demonstrated performance improvement; fewer material groups
or a valid GLB alone proves neither. Keep backend, camera, asset revisions and
scene configuration with the evidence. Use current in-game captures to show the
result and state any untested behavior or unqualified performance claims.
