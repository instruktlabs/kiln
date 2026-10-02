---
name: kiln-compose-scene
description: Compose existing assets into an exported scene or interactive proving environment, with deliberate placement, terrain, materials, integration checks and runtime qualification.
license: MIT
metadata:
  kiln-workflow: workspace
---

# Compose a scene from existing assets

Use this optional workflow when the task concerns several assets. Keep placement separate from individual source authoring so moving an object does not regenerate its geometry.

A scene or environment can be a standalone deliverable. A Kiln project is optional organization for a shared brief, inventory and design profile; composing several assets does not by itself require one. When composing a project's proving scene, use its selected saved inventory revisions and preserve the individual editable assets.

Read the [composition API notes](references/composition-api.md) when using the library. These are host/project APIs, not tools automatically added to the Kiln MCP surface.

Choose the deliverable before composing. A single scene GLB and an interactive
application have different requirements; exporting a monolithic GLB is optional.
For terrain, animated environments, traversal or measured optimization, read
[runtime scene guidance](references/runtime-scenes.md). Keep those systems in
the consuming scene rather than adding them to every asset-authoring task.
To reduce draw calls, count them per render pass first. Then merge by material
within each animation and interaction anchor, and give shadow and reflection
passes their own stand-ins. Do not flatten an asset into one mesh.

Inspect each GLB with `inspectGlbIntegration(bytes)` and confirm it returned a usable manifest. Use units, axes, bounds, and ground information to place the object deliberately. Give instances stable names and explicit transforms.

Start with the layout's major structures, routes and useful sightlines, then place smaller objects. Use world-space AABB checks to find candidate collisions; inspect reported intersections instead of treating every overlap as an error. Intentional embedding and empty space inside bounds both matter.

When traversal is part of the brief, connect destinations with usable routes and
test access through the placed doors, gates and crossings with the intended actor.
Terrain and paths are scene infrastructure unless included in the asset brief.
Use each asset's intended placement origin; hide an optional presentation base only
through a supported part/variant rather than burying the whole plant or prop.

For a scene GLB, export with `composeSceneGLB(parts, options)`. Select material optimization and animation retention deliberately. Review skipped-part warnings and confirm required inputs survived. For an application, retain the individual inputs and reproducible placement/runtime configuration. Inspect either result in its destination scene, including traversal, collision, contact, and relevant camera paths.

Report input assets, important transforms, intentional intersections, exporter warnings, and interactions actually checked. Do not infer playability from an overlap-free layout alone.
