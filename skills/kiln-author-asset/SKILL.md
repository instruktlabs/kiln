---
name: kiln-author-asset
description: Create a procedural 3D asset with Kiln JavaScript, review useful camera views, refine saved source, and export a GLB.
license: MIT
metadata:
  kiln-workflow: workspace
  kiln-shared-references: references/program-contract.md references/geometry-recipes.md references/camera-recipes.md references/reusable-frame.kiln.js
---

# Author a Kiln asset

Match the user's scope. A standalone asset needs no project, inventory or design profile. Omitted project selection stays standalone unless `KILN_PROJECT` was explicitly configured; use CLI `--no-project` or MCP `projectId: null` to override that default. Projects organize related work through a versioned brief, inventory, design profile and material pins. Creating one is optional and does not select it for later calls.

For project configuration or library materials, including standalone material use, read the [project and material workflow](references/projects-and-materials.md). It covers creation, revision-aware updates, explicit selection and material dependencies that also work for standalone assets. Project preferences do not establish trusted requirements. Use the same exact pins on later render, edit, inspect and save calls; a `programRef` alone does not select a project or reconstruct material context.

Live Review observes standalone and project operations without controlling the agent. If `kiln_review` is available, its `save` action retains the exact completed operation using the displayed `expectedRevision`, without another evaluation. Pinning does not pause execution and review annotations do not constitute QA acceptance. Deliver editable source with its exact material resources when rebuilding is requested, and runtime GLB/metadata for runtime use. Project export packages the saved inventory when a project exists. Consult the tools' current schemas; optional host capabilities must not be assumed present.

Read the [program contract](references/program-contract.md) when writing source. Use `kiln_discover({})` for a compact orientation: current families/tags, starting `createRoot`/`createPart` signatures, and six entry summaries by default. Search in ordinary modeling language, for example `{ query: "curved hollow tube" }`; you do not need to know a helper's name first. Search runs locally without a search model, GPU, or network call.

Search and overview return summaries. Fetch complete contracts and examples with `{ ids: ["loftProfiles", "createPart", "createClip"] }`, up to six distinct exact IDs or executable names. Copy recipe IDs from results. Exact selectors are case-sensitive and never corrected into another helper. Use optional `family`, `kind: "operation" | "assembly" | "recipe"`, or `tags` from the overview to narrow search; follow `nextOffset` with `offset` when needed. Request `{ capabilities: true }` separately for the current runtime, source, export, and camera contract. Avoid fetching signatures already present in context. Recipes are optional construction guidance; neither a recipe nor an asset category is a prerequisite for using the modeling tools.

Discovery contains geometry/UV/material operations, reusable assemblies, and
construction or articulation recipes. Describe an operation and constraint, such
as `profile along a curved path`, `texture tiling`, or `copy articulated hierarchy`;
an asset name alone may be too broad. Results show matched and unmatched terms,
spelling/prefix expansions, and related companions. A match in explanatory text
can concern a limitation. Read the contract before treating a result as support
for your request. Use current tags from the overview to narrow a crowded result;
tags organize the catalog and do not select an asset category. If search is weak,
try the geometric operation or browse a family; custom geometry remains available.

## Make the asset

Establish the subject, scale, style, and destination constraints from the request. Build a recognizable silhouette and meaningful construction details. Name parts by their role. Use metres, +X forward, +Y up, +Z right; ground contact normally sits at Y=0.

Unless exact reconstruction is requested, use reference images to align silhouette,
materials and art direction alongside the written brief, not as a requirement to
copy every detail. Resolve functional dimensions explicitly. For usable openings,
seats and articulated joins, use the interface guidance in
[geometry recipes](references/geometry-recipes.md#interfaces-that-must-fit-or-move).

For Blender, Unity or an FBX handoff, read the [engine handoff guide](references/engine-handoff.md). Prefer direct GLB import. The established exporter remains the default; the guide explains when an explicitly identified experimental comparison is useful. Preserve the baseline output, report the selected backend and destination checks, and do not change global host settings silently.

Write ordinary JavaScript with `meta` and `build()`. Keep dimensions that should change together in named parameters. Use [geometry recipes](references/geometry-recipes.md) for freeform surfaces, deformations, lofts, Boolean materials, or repeated parts. A model can author its own equations and topology; it does not need to assemble everything from boxes.

For connected assemblies, derive mating points from shared dimensions in the same
local frame. Identify the intended neighbor at each end of a support, and separate
those joints from nearby parts that need clearance. `beamBetween` uses the endpoints
you supply; it does not find the frame. Discovery's joined-frame recipe shows this
pattern without requiring a category. A centerline wheel uses `side: 'center'`;
wheel side describes placement identity, not single- or double-sided fork design.

Submit `code` once to `kiln_render` or `kiln_validate`, then retain its `programRef`, including on a failed build. In a generated asset workspace, `node kiln.mjs source asset.kiln.js` imports a file directly. Copy the returned reference exactly for later views and edits. Built-in stores return short handles such as `p_7c94a132b8e0`; full SHA-256 references also work. Do not construct a handle or retransmit the program. A rejected build names its cause when Kiln can tell it, such as a binding read before its declaration runs or a `materialRecipe` override the recipe does not accept, and adds `Source check:` with the codes and lines `kiln_validate` finds (`TEMPORAL_DEAD_ZONE`, `MATERIAL_RECIPE_OVERRIDE`, `UNSAFE_GLOBAL_ACCESS` and others); fix those lines first.

For CLI camera files and PNG export, use [camera commands](references/camera-cli.md).

## Review what matters

For the joints or gaps the brief depends on, use `kiln_inspect` with
`measure: { mode: 'surface', from: { subject: { path: A } }, to: { subject: { path: B } } }`,
substituting exact returned part paths. Check each end of a support against its
intended neighbor, including the fittings that attach it to the body. A fitting
touching a cable or pin does not establish that the fitting itself is mounted.
Check required gaps separately. Read `measurement.status`
and the closest points alongside an in-context view. Zero can mean touching or
intersecting; a whole-assembly minimum may find an unrelated contact. Keep
unmeasured interfaces unverified even when overall structural QA passes.
Batch up to 12 intended pairs with `surfacePairs: [[A, B], [C, D]]` instead of
repeating the same inspection. Read every `surfaceMeasurements.results` entry;
`status: partial` includes failed or unfinished checks. Set `image: false` and
omit camera controls for numeric checks after reviewing a relevant image.

Choose views that answer a question. A broad sheet can establish shape; a part-local view can reveal a seam, underside, or hidden attachment. Use the [camera recipes](references/camera-recipes.md) for image count, exact part framing, explicit cameras, and separate images. Read returned part paths instead of constructing them. The render response previews 24 paths (80 with `detail: "full"`). If `partsTruncated` or a needed part is absent, use `kiln_inspect({ programRef, image: false, listParts: { query: "part name" } })`. This searches nested names and paths; follow `partListing.nextOffset` with the same reference and query. Omit the query to list everything. A missing preview entry does not mean the part failed to export.

Inspect the actual images. Render on the default neutral grey backdrop first. Only when a sheet you have seen shows a part merging with it, add `backdrop` to `capture`: `light` when the merging part is darker than the grey (near-black iron, dark wood), `dark` when it is lighter (near-white, pale grey, emissive). Read the echoed `capture.backdrop`. Check silhouette, proportion, orientation, attachment, and ground contact. If the request calls for a finished asset, repair concrete gaps visible at its intended viewing distance rather than stopping at a blockout. Do not repeat the same render without a new question or change.

Do not darken albedo to compensate for review lighting; preserve the intended material colour and check material-faithful GPU views and the destination renderer.

Base colour is the factor multiplied by the texture; tinting both can darken the colour twice. Keep one neutral, or choose the factor so their product in linear colour space equals the intended albedo.

For specified openings and travel limits, measure usable space including protruding
teeth, fasteners or trim. Nominal plate spacing alone does not establish clearance.
For overall dimensions, use the rendered revision's `bounds.size` in metres,
including projections and attached parts. State separately when a measurement
describes only a body or centerline. Source parameters are not measured extents.

`viewFidelity.materialFaithful: false` means geometry evidence, not verified PBR appearance. Check camera/fallback receipts too. A GPU connection alone is not evidence that the requested view was used. Animation needs intermediate-pose review; interiors may need cutaway views. Use `kiln_screenshot_animation` for clip sampling. In a CLI workspace, use `node kiln.mjs animation RETURNED_REF --clip CLIP_NAME --phases 0,0.017,0.31,0.68,1 --views motion.png --render gpu --json` and read the PNG. Phases are fractions of clip duration; use `--render cpu` for geometry-only review. This samples the exported animation without editing source into posed copies. Check `poseBounds` against requested ground clearance and dimensions at those poses. Include tread and other protrusions; a correct rest pose does not prove clearance during rotation. Choose phases inside a geometric repeat even when regular samples look identical; quarter turns of 16 repeated lugs all show the same alignment. Sampled bounds do not prove continuous contact or collision safety.

## Revise and deliver

CLI saves accept `--model`, `--harness` and `--author` for the same declared
attribution as MCP. Keep requested and confirmed thinking effort distinct in the
description or production record, and identify any later model that refines the asset.
Check the saved manifest's attribution and exact revision, not only the run log.
If a correction requires a new saved child, retain the original record and history.

Report QA `acceptance` separately from delivery, including incomplete checks and unverified material appearance. Never use an unrendered edit or a previous image as evidence for the selected revision.

Read the [export profile guide](references/export-profiles.md) when choosing delivery files. Keep the default editable ZIP for continued authoring; use the opt-in runtime GLB and metadata sidecar for application delivery when its measured size benefit is useful. Converter selection happens during rendering, while the delivery profile applies to a saved revision. MCP `kiln_export` returns resource descriptors to read through the host; to write the files to disk, run `node kiln.mjs export ASSET_ID REVISION_ID --format glb --out asset.glb` (add `--profile runtime` for the runtime pair). Report the actual choices and preserve the canonical source; neither option establishes scene performance.

Read a bounded source region with `kiln_source({ programRef, query: "dimensionOrPart" })`. Copy an exact anchor into `kiln_edit`, batch related replacements, and continue with its new `programRef`. Rendering is on by default; `capture` can keep the relevant framing. An applied edit can still fail to build, so inspect `render.ok` separately. The result opens with the new `programRef` and its `parentRef`; its `render` is compact like `kiln_render`'s, so for every finding call `kiln_render({ programRef, detail: "full" })` on the new ref.

When the collection tools are available, use them for delivery. A finished asset is not delivered until its accepted final reference is saved. The user chooses the destination when they name one. Call `kiln_assets({ action: "collections" })` to resolve available IDs when more than one collection is configured or the request mentions a destination. Use `project` only as the fallback when the user gave no destination; use `library` for an explicitly requested cross-workspace library. Then call `kiln_save({ programRef, name, collection, brief, description, attribution: { model, harness } })`. If the sheet you accepted used a `backdrop` other than the default, pass the same `backdrop` so the saved preview matches what you reviewed. The saved `preview.png` is always the default six-view sheet, drawn on the same route as `kiln_render` (its `preview.fidelity` says which); capture shots are not saved with it, so keep the capture JSON that reproduces them. A Live Review `save` keeps its reviewed capture as the preview instead. Record the actual model and harness when known, and omit unknown attribution rather than guessing. Saving creates the durable asset record and returns the asset ID, revision ID, and download resources for its exact GLB, source, preview, and ZIP bundle. Return those links to the user using the host's resource/download interface; do not transcribe binary data.

After saving, call `kiln_present` when available with the exact collection, asset ID, and revision ID. If the host confirms it rendered the interactive result, the handoff is complete. If the user wants to see the asset, the host only returns portable links, and you have a terminal, launch `node kiln.mjs view --collection COLLECTION --asset ASSET_ID --revision REVISION_ID` yourself in a persistent or background terminal from the asset workspace. Substitute the exact values returned by `kiln_save`, give the user the printed loopback URL, and use the harness's browser-opening capability when one exists. Do not ask the user to start the viewer unless the host gives you neither presentation nor process-launch capability. The deep link opens that exact revision in the same local viewer with orbit, zoom, revision history, animation, and downloads. Use returned download URLs when provided; never invent HTTPS URLs or claim that a host supports native attachments without evidence. A `kiln://` resource may require the host's resource reader or local viewer.

Save at meaningful completion points, not after each draft or camera change. Retain source revisions while working. For direct filesystem exports without collection tools:

```sh
node kiln.mjs source RETURNED_REF --out asset-v1.kiln.js
node kiln.mjs render RETURNED_REF --out asset-v1.glb --views asset-v1.png
```

Replace `RETURNED_REF` with the final reference returned by Kiln. Keep `.kiln/programs`, including its mappings, while using saved references. Pass `--out` whenever you want a GLB: `render` with neither `--out` nor `--views` writes `out.glb` in the current directory.

Add `--json` to CLI `render` for a machine-readable receipt with the source reference,
requirements, output paths and image fidelity. Read the image file separately.
On failure, check `ok` and `files`: a GLB may have been written before a failed image.

To save a chosen camera view, write the `capture` object itself to `cameras.json` and run `node kiln.mjs render RETURNED_REF --capture cameras.json --views hero.png`. This uses the same camera schema and render pipeline as MCP. MCP images arrive inline only; the CLI is the route that writes review PNGs to disk. With `"output": "separate"` it writes `hero.shot-01.png`, `hero.shot-02.png` and so on beside the `--views` path and lists each in `files`; the grid stays the default. Add `--backdrop light` or `--backdrop dark` to any `--views` command when the neutral grey hides the silhouette. Do not copy image base64 into shell commands. The [camera recipes](references/camera-recipes.md) include a complete file example.

Source export refuses to overwrite a file. Report the source and GLB, important design choices, what you reviewed, and any unresolved limitation. Validation does not establish visual quality or destination-runtime performance. There is no default triangle target; measure geometry, draw calls, textures, and loading against the user's actual constraints. In render metrics, `materials` counts material slots (one per mesh, roughly the draw count) and `distinctMaterials` counts the materials themselves.
