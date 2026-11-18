---
name: kiln-author-asset
description: Create a procedural 3D asset with Kiln JavaScript, review useful camera views, refine saved source, and export a GLB.
license: MIT
metadata:
  kiln-workflow: workspace
  kiln-shared-references: references/program-contract.md references/geometry-recipes.md references/camera-recipes.md references/reusable-frame.kiln.js
---

# Author a Kiln asset

Match the user's scope. A standalone asset needs no project, inventory or design profile. Omitted project selection stays standalone unless `KILN_PROJECT` was explicitly configured (`kiln_discover` capabilities shows it); CLI `--no-project` or MCP `projectId: null` overrides that default. For project configuration or library materials, including standalone material use, read the [project and material workflow](references/projects-and-materials.md), and use the same exact pins on later render, edit, inspect and save calls: a `programRef` alone selects no project and reconstructs no material context. Project preferences do not establish trusted requirements.

Live Review observes without controlling the agent. When `kiln_review` is available, its `save` action keeps the exact completed operation with the displayed `expectedRevision`; pinning does not pause execution, and annotations are not QA acceptance. Do not assume optional host capabilities.

Read the [program contract](references/program-contract.md) when writing source. `kiln_discover({})` gives a compact orientation: current families (browse one for its tags), the starting `createRoot`/`createPart` signatures and six entry summaries. Search with `kiln_discover({ query })` in ordinary modeling language (`curved hollow tube`, `slats along a line`, `braced legs`, `cast iron`): the catalog indexes operations, assemblies, recipes and materials rather than object classes, so name the parts and materials. Fetch complete contracts and examples with `{ ids: ["loftProfiles", "createPart", "createClip"] }`, up to six exact, case-sensitive IDs or executable names; copy recipe IDs from results (`recipe:material-wood-v1` or `material-wood-v1`), and a material recipe's summary names the `materialRecipe("kiln.material.wood.v1")` call to use. Narrow with `family`, `kind: "operation" | "assembly" | "recipe"` or `tags`, and follow `nextOffset` with `offset`. Request `{ capabilities: true }` separately for the runtime, source, export and camera contract. Read the contract before treating a search match as support; a match in explanatory text can concern a limitation. Recipes are optional guidance.

## Make the asset

Take subject, scale, style and destination constraints from the request, not examples or recipes. Build a recognizable silhouette and meaningful construction details. Name parts by their role. Use metres, +X forward, +Y up, +Z right; ground contact normally sits at Y=0. Forward is the direction the object faces: a bench's sitter faces +X, so its backrest sits toward -X. Part `rotation` is in degrees and follows the right-hand rule in this frame: `[0, 90, 0]` turns forward (+X) toward -Z, the object's left; `[0, 0, 90]` tips +X up to +Y; `[90, 0, 0]` rolls +Y toward +Z.

Unless exact reconstruction is requested, use reference images to align silhouette,
materials and art direction alongside the written brief, not as a requirement to
copy every detail. Resolve functional dimensions explicitly. For usable openings,
seats and articulated joins, use the interface guidance in
[geometry recipes](references/geometry-recipes.md#interfaces-that-must-fit-or-move).

For a Blender, Unity or FBX handoff, read the engine handoff guide, `references/engine-handoff.md` in the `kiln-qa-asset` skill.

Write ordinary JavaScript with `meta` and `build()`. Name shared dimensions; `defineParams` declares ones a host may vary. Use [geometry recipes](references/geometry-recipes.md) for freeform surfaces, deformations, lofts, Boolean materials, or repeated parts. You can author your own equations and topology instead of assembling everything from boxes. Build one tier unless the brief asks for level-of-detail tiers; when it does, name and declare them as [levels of detail](references/geometry-recipes.md#levels-of-detail-only-when-the-brief-asks) describes.

For connected assemblies, derive mating points from shared dimensions in the same
local frame. Identify the intended neighbor at each end of a support, and separate
those joints from nearby parts that need clearance. `beamBetween` uses the endpoints
you supply; it does not find the frame (Discovery's joined-frame recipe shows the
pattern). A centerline wheel uses `side: 'center'`; wheel side describes placement
identity, not single- or double-sided fork design.

Submit `code` once to `kiln_render` or `kiln_validate`, then retain its `programRef`, including on a failed build; in a generated asset workspace, `node kiln.mjs source asset.kiln.js` imports a file directly. Copy the returned reference exactly for later views and edits: built-in stores return short handles such as `p_7c94a132b8e0`, and full SHA-256 references also work. Do not construct a handle or retransmit the program. A rejected build names its cause when Kiln can tell it and adds `Source check:` with the codes and lines `kiln_validate` finds (`TEMPORAL_DEAD_ZONE`, `MATERIAL_RECIPE_OVERRIDE`, `UNSAFE_GLOBAL_ACCESS` and others); fix those lines first.

For CLI camera files and PNG export, use [camera commands](references/camera-cli.md).

## Review what matters

For the joints or gaps the brief depends on, use `kiln_inspect` with
`measure: { mode: 'surface', from: { subject: { path: A } }, to: { subject: { path: B } } }`,
substituting exact returned part paths. Check each end of a support against its
intended neighbor, including the fittings that attach it to the body; a fitting
touching a cable or pin does not establish that the fitting itself is mounted.
Check required gaps separately. Read `measurement.status` and the closest points
alongside an in-context view. Zero can mean touching or intersecting, and a
whole-assembly minimum may find an unrelated contact; keep unmeasured interfaces
unverified even when structural QA passes. Batch up to 12 intended pairs with
`surfacePairs: [[A, B], [C, D]]`. Each entry is an exact `listParts` path such as
`/Park%20Bench[0]/Bench[0]/Mesh_Seat[0]`, or an unambiguous node name as `measure` takes; `createPart("Seat", ...)` names its mesh `Mesh_Seat`. Read every `surfaceMeasurements.results` entry;
`status: partial` includes failed or unfinished checks. Set `image: false` and
omit camera controls for numeric checks after reviewing a relevant image.

Choose views that answer a question: a broad sheet establishes shape; a part-local view reveals a seam, underside or hidden attachment. Use the [camera recipes](references/camera-recipes.md) for image count, exact part framing, explicit cameras and separate images. Read returned part paths instead of constructing them. When `partsTruncated` is set, [list the rest](references/camera-recipes.md#find-part-paths).

Inspect the actual images. Render on the default neutral grey backdrop first; only when a sheet you have seen shows a part merging with it, add `backdrop` to `capture`: `light` when the merging part is darker than the grey (near-black iron, dark wood), `dark` when it is lighter (near-white, pale grey, emissive), and read the echoed `capture.backdrop`. Check silhouette, proportion, orientation, attachment, and ground contact. If the request calls for a finished asset, repair concrete gaps visible at its intended viewing distance rather than stopping at a blockout. Do not repeat the same render without a new question or change. Read build `warnings`: `FLUSH_FACES` measures faces that will flicker; fix each pair ([geometry recipes](references/geometry-recipes.md)).

Do not darken albedo to compensate for review lighting; preserve the intended material colour and check material-faithful GPU views and the destination renderer. Base colour is the factor multiplied by the texture; tinting both can darken the colour twice, so keep one neutral or choose the factor so their product in linear colour space equals the intended albedo.

For specified openings and travel limits, measure usable space including protruding
teeth, fasteners or trim; nominal plate spacing alone does not establish clearance.
For overall dimensions, use the rendered revision's `bounds.size` in metres,
including projections and attached parts, and state separately when a measurement
describes only a body or centerline. Source parameters are not measured extents.

`viewFidelity.materialFaithful: false` means geometry evidence, not verified PBR appearance; check the camera and fallback receipts too, and a GPU connection alone is not evidence that the requested view was used. For animated assets and interiors, follow [animation and interiors](references/camera-recipes.md#animation-and-interiors).

## Revise and deliver

CLI saves accept `--model`, `--harness` and `--author`, as MCP does. Keep requested and confirmed thinking effort distinct, name any later model that refines the asset, and check the saved manifest rather than the run log. A correction is a new saved child; the original stays.

Report QA `acceptance` separately from delivery, including incomplete checks and unverified material appearance. Never use an unrendered edit or a previous image as evidence for the selected revision.

Only when the user asks for delivery files beyond the saved asset, read the [export profile guide](references/export-profiles.md): the default editable ZIP for continued authoring, or the opt-in runtime GLB and metadata sidecar, which also mark the parameters the file carries. MCP `kiln_export` returns descriptors; `kiln_export_to` (if advertised) or `node kiln.mjs export ASSET_ID REVISION_ID --format glb --out asset.glb` writes files (`--profile runtime` for the runtime pair). Report the actual choices and preserve the canonical source; neither option establishes scene performance.

Read a bounded source region with `kiln_source({ programRef, query: "dimensionOrPart" })`. Copy an exact anchor into `kiln_edit`, batch related replacements, and continue with its new `programRef`. Rendering is on by default, and `capture` can keep the relevant framing. An applied edit can still fail to build, so inspect `render.ok` separately. The result opens with the new `programRef` and its `parentRef`, then `ok`, `applied`, what `changed` and `next`; its `render` is compact like `kiln_render`'s and is enough to decide the next edit; ask `detail: "full"` only as a second look when every instance of a grouped finding matters.

When the collection tools are available, use them for delivery. A finished asset is not delivered until its accepted final reference is saved. The user chooses the destination when they name one; `kiln_assets({ action: "collections" })` lists the configured IDs. Use `project` only as the fallback when the user gave no destination; use `library` for an explicitly requested cross-workspace library. Then call `kiln_save({ programRef, name, collection, brief, description, attribution: { model, harness } })`, passing the same `backdrop` as the sheet you accepted. Record the actual model and harness when known, and omit unknown attribution rather than guessing. Saving returns the asset ID, revision ID and download resources for the exact GLB, source, preview and ZIP bundle; return those links through the host's resource interface and do not transcribe binary data.

After saving, call `kiln_present` when available with the exact collection, asset ID and revision ID; when the host confirms it rendered the interactive result, the handoff is complete. Otherwise hand over the returned download URLs or `kiln://` resources through the host's resource reader. The local viewer (`node kiln.mjs view`) is optional and for a person who is present: offer it, never as a step of a headless or unattended run, since it keeps the session open. Never invent HTTPS URLs or claim native attachment support without evidence.

Save at meaningful completion points, not after each draft or camera change. Without collection tools, or to write review PNGs to disk, use the [CLI commands](references/camera-cli.md).

Source export refuses to overwrite a file. Report the source and GLB, important design choices, what you reviewed, and any unresolved limitation; for declared parameters, which ones the sweep says the GLB carries. Validation does not establish visual quality or destination-runtime performance. There is no default triangle target; measure geometry, draw calls, textures, and loading against the user's actual constraints. In render metrics, `materials` counts material slots (one per mesh, roughly the draw count) and `distinctMaterials` counts the materials themselves.
