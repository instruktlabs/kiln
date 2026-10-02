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

Live Review observes standalone and project operations without controlling the agent. When `kiln_review` is available, its `save` action retains the exact completed operation using the displayed `expectedRevision`, without another evaluation; pinning does not pause execution, and review annotations are not QA acceptance. Consult the tools' current schemas; optional host capabilities must not be assumed present.

Read the [program contract](references/program-contract.md) when writing source. `kiln_discover({})` gives a compact orientation: current families and tags, the starting `createRoot`/`createPart` signatures and six entry summaries. Search with `kiln_discover({ query })` in ordinary modeling language (`curved hollow tube`, `slats along a line`, `braced legs`, `cast iron`): the catalog indexes operations, assemblies, recipes and materials rather than object classes, so name the parts and materials. Fetch complete contracts and examples with `{ ids: ["loftProfiles", "createPart", "createClip"] }`, up to six exact, case-sensitive IDs or executable names; copy recipe IDs from results (`recipe:material-wood-v1` or `material-wood-v1`), and a material recipe's summary names the `materialRecipe("kiln.material.wood.v1")` call to use. Narrow with `family`, `kind: "operation" | "assembly" | "recipe"` or `tags` from the overview, and follow `nextOffset` with `offset`. Request `{ capabilities: true }` separately for the runtime, source, export and camera contract. Read the contract before treating a search match as support; a match in explanatory text can concern a limitation. Recipes are optional guidance, and custom geometry remains available.

## Make the asset

Establish the subject, scale, style, and destination constraints from the request. Build a recognizable silhouette and meaningful construction details. Name parts by their role. Use metres, +X forward, +Y up, +Z right; ground contact normally sits at Y=0. Forward is the direction the object faces: a bench's sitter faces +X, so its backrest sits toward -X. Part `rotation` is in degrees and follows the right-hand rule in this frame: `[0, 90, 0]` turns forward (+X) toward -Z, the object's left; `[0, 0, 90]` tips +X up to +Y; `[90, 0, 0]` rolls +Y toward +Z.

Unless exact reconstruction is requested, use reference images to align silhouette,
materials and art direction alongside the written brief, not as a requirement to
copy every detail. Resolve functional dimensions explicitly. For usable openings,
seats and articulated joins, use the interface guidance in
[geometry recipes](references/geometry-recipes.md#interfaces-that-must-fit-or-move).

For Blender, Unity or an FBX handoff, read the engine handoff guide, `references/engine-handoff.md` in the `kiln-qa-asset` skill. Prefer direct GLB import; the established exporter remains the default, and the guide explains when an explicitly identified experimental comparison is useful. Preserve the baseline output, report the selected backend and destination checks, and do not change global host settings silently.

Write ordinary JavaScript with `meta` and `build()`. Keep dimensions that should change together in named parameters. Use [geometry recipes](references/geometry-recipes.md) for freeform surfaces, deformations, lofts, Boolean materials, or repeated parts. A model can author its own equations and topology; it does not need to assemble everything from boxes. Build one tier unless the brief asks for level-of-detail tiers; when it does, name and declare them as [levels of detail](references/geometry-recipes.md#levels-of-detail-only-when-the-brief-asks) describes.

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

Choose views that answer a question: a broad sheet establishes shape; a part-local view reveals a seam, underside or hidden attachment. Use the [camera recipes](references/camera-recipes.md) for image count, exact part framing, explicit cameras and separate images. Read returned part paths instead of constructing them. The render response lists the first 24 part paths (every path that fits only with `detail: "full"`) and `partsTruncated` when there are more; then use `kiln_inspect({ programRef, image: false, listParts: { query: "part name" } })`, which searches nested names and paths, and follow `partListing.nextOffset` with the same reference and query. Omit the query to list everything; add `placement: true` for world position, rotation, scale and bounds per part. A missing preview entry does not mean the part failed to export.

Inspect the actual images. Render on the default neutral grey backdrop first; only when a sheet you have seen shows a part merging with it, add `backdrop` to `capture`: `light` when the merging part is darker than the grey (near-black iron, dark wood), `dark` when it is lighter (near-white, pale grey, emissive), and read the echoed `capture.backdrop`. Check silhouette, proportion, orientation, attachment, and ground contact. If the request calls for a finished asset, repair concrete gaps visible at its intended viewing distance rather than stopping at a blockout. Do not repeat the same render without a new question or change.

Do not darken albedo to compensate for review lighting; preserve the intended material colour and check material-faithful GPU views and the destination renderer. Base colour is the factor multiplied by the texture; tinting both can darken the colour twice, so keep one neutral or choose the factor so their product in linear colour space equals the intended albedo.

For specified openings and travel limits, measure usable space including protruding
teeth, fasteners or trim; nominal plate spacing alone does not establish clearance.
For overall dimensions, use the rendered revision's `bounds.size` in metres,
including projections and attached parts, and state separately when a measurement
describes only a body or centerline. Source parameters are not measured extents.

`viewFidelity.materialFaithful: false` means geometry evidence, not verified PBR appearance; check the camera and fallback receipts too, and a GPU connection alone is not evidence that the requested view was used. In auto mode the first view that needs PBR shading starts a compatible local render service on demand, so `node kiln.mjs service status` showing no listener before that view is expected. Animation needs intermediate-pose review and interiors may need cutaway views. Use `kiln_screenshot_animation` for clip sampling, or in a CLI workspace `node kiln.mjs animation RETURNED_REF --clip CLIP_NAME --phases 0,0.017,0.31,0.68,1 --views motion.png --render gpu --json` (`--render cpu` for geometry only) and read the PNG; phases are fractions of clip duration and sample the exported animation without editing posed copies into source. Check `poseBounds` against requested ground clearance and dimensions at those poses, including tread and other protrusions; choose phases inside a geometric repeat, since quarter turns of 16 repeated lugs all show the same alignment. Sampled bounds do not prove continuous contact or collision safety.

## Revise and deliver

CLI saves accept `--model`, `--harness` and `--author` for the same declared
attribution as MCP. Keep requested and confirmed thinking effort distinct, identify
any later model that refines the asset, and check the saved manifest's attribution
and exact revision rather than the run log. A correction is a new saved child; the
original record and history stay.

Report QA `acceptance` separately from delivery, including incomplete checks and unverified material appearance. Never use an unrendered edit or a previous image as evidence for the selected revision.

Read the [export profile guide](references/export-profiles.md) when choosing delivery files: the default editable ZIP for continued authoring, or the opt-in runtime GLB and metadata sidecar when its measured size benefit is useful. MCP `kiln_export` returns resource descriptors to read through the host; `node kiln.mjs export ASSET_ID REVISION_ID --format glb --out asset.glb` writes the files (`--profile runtime` for the runtime pair). Report the actual choices and preserve the canonical source; neither option establishes scene performance.

Read a bounded source region with `kiln_source({ programRef, query: "dimensionOrPart" })`. Copy an exact anchor into `kiln_edit`, batch related replacements, and continue with its new `programRef`. Rendering is on by default, and `capture` can keep the relevant framing. An applied edit can still fail to build, so inspect `render.ok` separately. The result opens with the new `programRef` and its `parentRef`, then `ok`, `applied`, what `changed` and `next`; its `render` is compact like `kiln_render`'s and is enough to decide the next edit; ask `detail: "full"` only as a second look when every instance of a grouped finding matters.

When the collection tools are available, use them for delivery. A finished asset is not delivered until its accepted final reference is saved. The user chooses the destination when they name one; `kiln_assets({ action: "collections" })` lists the configured IDs. Use `project` only as the fallback when the user gave no destination; use `library` for an explicitly requested cross-workspace library. Then call `kiln_save({ programRef, name, collection, brief, description, attribution: { model, harness } })`, passing the same `backdrop` as the sheet you accepted. The saved `preview.png` is the default six-view sheet drawn on the same route as `kiln_render` (`preview.fidelity` says which); capture shots are not saved with it, so keep the capture JSON that reproduces them, and a Live Review `save` keeps its reviewed capture instead. Record the actual model and harness when known, and omit unknown attribution rather than guessing. Saving returns the asset ID, revision ID and download resources for the exact GLB, source, preview and ZIP bundle; return those links through the host's resource interface and do not transcribe binary data.

After saving, call `kiln_present` when available with the exact collection, asset ID and revision ID; when the host confirms it rendered the interactive result, the handoff is complete. Otherwise hand over the returned download URLs or `kiln://` resources through the host's resource reader. The local viewer, `node kiln.mjs view --collection COLLECTION --asset ASSET_ID --revision REVISION_ID`, is optional and for a person who is present: offer it, or start it when the user asks and you have a terminal, never as a step of a headless or unattended run, since a viewer process keeps the session open. Never invent HTTPS URLs or claim native attachment support without evidence.

Save at meaningful completion points, not after each draft or camera change. Retain source revisions while working. For direct filesystem exports without collection tools:

```sh
node kiln.mjs source RETURNED_REF --out asset-v1.kiln.js
node kiln.mjs render RETURNED_REF --out asset-v1.glb --views asset-v1.png
```

Replace `RETURNED_REF` with the final reference returned by Kiln. Keep `.kiln/programs`, including its mappings, while using saved references. Pass `--out` whenever you want a GLB: `render` with neither `--out` nor `--views` writes `out.glb` in the current directory.

Add `--json` to CLI `render` for a receipt with the source reference, requirements, output paths, image fidelity and the compact review (`--detail full` only when every instance of a finding matters); read the image file separately. On failure, check `ok` and `files`: a GLB may have been written before a failed image.

To save a chosen camera view, write the `capture` object to `cameras.json` and run `node kiln.mjs render RETURNED_REF --capture cameras.json --views hero.png`, the same camera schema and pipeline as MCP; the CLI is the route that writes review PNGs to disk. With `"output": "separate"` it writes `hero.shot-01.png`, `hero.shot-02.png` and so on and lists each in `files`; add `--backdrop light` or `dark` when the grey hides the silhouette. Do not copy image base64 into shell commands.

Source export refuses to overwrite a file. Report the source and GLB, important design choices, what you reviewed, and any unresolved limitation. Validation does not establish visual quality or destination-runtime performance. There is no default triangle target; measure geometry, draw calls, textures, and loading against the user's actual constraints. In render metrics, `materials` counts material slots (one per mesh, roughly the draw count) and `distinctMaterials` counts the materials themselves.
