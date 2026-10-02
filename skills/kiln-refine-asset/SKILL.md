---
name: kiln-refine-asset
description: Refine an existing Kiln asset through bounded source reads, exact revision edits, and targeted image feedback. Use for repairs, variants, or proportion changes.
license: MIT
metadata:
  kiln-workflow: workspace
  kiln-shared-references: references/revision-and-views.md
---

# Refine a Kiln asset

Work from the saved program. A GLB alone does not contain editable Kiln JavaScript. Keep the user's requested change distinct from unrelated redesign.

Keep standalone assets standalone unless the user wants to associate them with a project. Creating a project is not a refinement prerequisite. Omission selects no project unless `KILN_PROJECT` is explicitly configured; `projectId: null` / CLI `--no-project` overrides that default. Supply the saved exact material pins through `materialDependencies` / `--materials` when needed, independently of projects.

For a project-backed asset, inspect its recorded project revision and material dependencies. A newer project profile can have different resource pins. Use the intended `projectId` / `projectRevision` explicitly for revisions and ensure its locked material resources are present. Configuration updates use `kiln_project` with the current `expectedRevision`; every supplied top-level field replaces its previous value, including the whole `design` object. Read and merge nested preferences before updating. After importing editable source and resources, `node kiln.mjs asset ASSET_ID REVISION --rebuild --out baseline.glb` uses the saved exporter settings and dependencies. This reports artifact hash equality and does not overwrite the original. Missing historical build settings require an explicit new authoring run.

To recover exact material pins, read the saved `manifest.json` resource, or run `node kiln.mjs asset ASSET_ID REVISION --collection COLLECTION` for the full manifest. Compact get/restore summaries omit dependency details. In `build.dependencies`, each `kind: "kiln.material.v1"` entry contains a material `manifest`: use its `materialId` as `resourceId`, and its `revisionId` for both `revisionId` and `sha256`. Verify those revisions with `kiln_material` or import their complete editable resources; do not replace missing pins with the current project's materials. Pass this pin array to later calls that evaluate a standalone restored source; a call that names the asset's `projectId` and `projectRevision` implies that revision's pins, and a pin the call names replaces the project's for the same `resourceId`.

When given a retained `programRef`, read it with `kiln_source`; the host owns its task/requirements binding. Report delivery separately from QA acceptance. If a bound saved asset needs host authorization to restore its requirements, report the migration diagnostic; do not drop the binding or treat copied metadata as authority.

For a collection asset, first call `kiln_assets` with `action: "restore"`, `collection`, `assetId`, and `revisionId`. This imports its exact source into the current program store and returns a fresh `programRef`. A downloaded ZIP can be imported with `node kiln.mjs import bundle.zip`. A binary-only GLB has no source to restore.

For a collection asset, after reviewing the change, use `kiln_save` to create an immutable child revision with the new `programRef`, the original `assetId`, and `parentRevision` set to the exact revision you started from. Preserve the collection, name, relevant tags, and known model/harness attribution; describe the change. Pass the `backdrop` the accepted sheet used when it was not the default, so the preview matches what you reviewed. Never replace or delete the base: its prior revision remains intact, and concurrent children remain visible as branches. Return the new revision's download resources; copying to a different collection does not make a live link.

For CLI request files and image exports, use [revision commands](references/revision-cli.md).

## Read, change, compare

After saving the reviewed child revision, call `kiln_present` when available with its exact collection, asset ID, and revision ID. This opens an interactive view in supporting chat hosts. If the user wants to see it and the host only returns links, launch `node kiln.mjs view --collection COLLECTION --asset ASSET_ID --revision REVISION_ID` yourself in a persistent or background terminal when process launch is available, substituting the exact saved values. Provide its deep-linked loopback URL and use the harness's browser opener when available. Ask the user to start it only when the host cannot present or launch processes. Return actual download URLs when supplied; do not invent links or assume `kiln://` resources are native chat attachments.

1. Copy the returned `programRef` exactly, or import a file with `node kiln.mjs source asset.kiln.js`. Built-in stores return short immutable handles such as `p_7c94a132b8e0`; full SHA-256 references also work. Do not shorten a hash yourself. Submit source inline only when introducing a new draft to the store.
2. Obtain a before view when it resolves an uncertainty. Use returned exact part paths for targeted framing; the [revision and view recipes](references/revision-and-views.md) show source paging, custom cameras, and animation phases. Render paths are a bounded preview. Find absent or nested parts with `kiln_inspect({ programRef, image: false, listParts: { query: "part name" } })`; follow `partListing.nextOffset` on the same reference and query.
3. Read relevant text with `kiln_source({ programRef, query: "partOrConstant" })`. Search is literal and offsets count UTF-16 characters. Copy anchors exactly, including whitespace. Each `kiln_edit` call accepts at most 20 replacements; for larger changes, send sequential batches using the new reference returned by each batch.
4. Apply related `{ oldString, newString }` replacements through `kiln_edit`. Keep the returned new reference. Shared constants and shared geometry can affect more than the selected part.
5. Review the diff and returned images against the same question. Check `render.ok` independently of edit success. Repair a failed draft by its new reference rather than recreating the whole source.

For dimension changes, compare the before/after render results' `bounds.size` in
metres, including axes the user asked to preserve. A changed radius, centerline or
scale parameter does not prove the complete asset's dimensions. Report any remaining
deviation instead of quoting the requested numbers as measured results.

Rendered `kiln_edit` results include `preservation`: a comparison against the
original exported revision, or an explicit `not_assessed` reason. Review it before
claiming an edit was localized. Changing one shared parameter can change every
mesh even when most source text is untouched. `comparison.animation` independently
reports changed exported channel targets, interpolation, key times and values;
unchanged static geometry alone says nothing about preserved motion.

For edits that must preserve other components, call `kiln_inspect` on the new
reference with `compare: { programRef: OLD_REF }`. This compares both exported
revisions under the current host settings and reports geometry, material, rest
transform and bounds changes. For protected components, add `paths: [PART_PATH]`
inside `compare`: each `comparison.subtrees` entry covers that entire subtree
independently of pagination. Review the requested axes; follow
`comparison.nextOffset` for changes outside selected subtrees. Use `image: false`
when only numeric review is needed. Source diffs alone do
not establish preservation. Comparison does not decide whether a change satisfies
the brief; unsupported structures fail explicitly. See
[revision comparison](references/revision-and-views.md#compare-exported-revisions).
Follow `comparison.animation.nextOffset` separately if animation changes are paged.
In the final response, distinguish measured preservation, intentional changes,
unexpected changes and unassessed properties. An unavailable comparison is not a
pass; resolve unexpected changes or disclose them before claiming completion.

An edit renders by default and accepts the same `capture` object as `kiln_render`, including `backdrop` once a sheet on the default neutral grey has shown a part merging with it: `light` when that part is darker than the grey, `dark` when it is lighter. Use `render: false` when no image is needed. A missing or ambiguous anchor changes nothing; expand the anchor or use `replaceAll: true` only when every match should change. Long diffs may set `diffTruncated`; read more source instead of requesting a full-program echo by habit.

For a CLI workflow, read exact source with `node kiln.mjs source RETURNED_REF --json`
(`--query`, `--offset` and `--limit` return the same anchored region as `kiln_source`) and
write a JSON array of those replacement objects to `edits.json`. Run
`node kiln.mjs edit RETURNED_REF --edits edits.json` (`--json` is accepted). This uses the same atomic
editing operation and returns JSON with the new `programRef`, `parentRef`, counts
and diff. CLI editing does not render; review the new reference with `node kiln.mjs
render NEW_REF --out revised.glb --views revised.png --json` and read the image
before saving. A failed edit keeps the original reference. Do not treat edit
success as geometry or QA success.

## Preserve intended structure

Direct mutation needs `copyGeometry`/`.clone()` or `copyMaterial`. Deformation helpers return independent geometry. Use `kiln_discover` with a natural-language `query` to find relevant helpers, then request their exact `ids` for contracts before changing a loft, sweep, UV workflow, or Boolean operation. Search results are suggestions; inspect limitations and ownership before applying them.

For a multipart replacement, preserve its actual parent root and connection frame;
matching name suffixes do not make an assembly. Compare retained world transforms
and geometry, not just part counts. For attached surface detail, check the exported
mesh contact and final dimensions after reshaping; shared equations or control
points alone do not prove attachment. Discovery offers optional editable-assembly
and surface-detail recipes when these patterns fit.

Check the retained parts that connected to the replaced part, including their
other ends and intermediate mounts. Unchanged geometry can become unsupported
after its neighbor moves or disappears. Preserve the requested connection points;
if that conflicts with a protected component, report the conflict rather than
silently changing it or claiming that exact preservation proves a working joint.

For a suspected gap, `kiln_inspect` can measure exported triangle surfaces between
two exact parts with `measure.mode: "surface"`. Select the intended interface and
read the completion status; zero distance alone does not establish sound attachment.
See [surface measurements and CLI inspection](references/revision-and-views.md#named-anchors-and-measurements).

Check both intended ends of each changed brace, bar or support separately. Contact
with a deck at one end does not establish contact with its post at the other.
Derive replacement endpoints from the same local attachment points as their
neighbors, then verify the exported surfaces. Also list nearby pairs that must
remain separate: a supported panel or seat may touch its mount while needing a
visible gap from the surrounding frame. Whole-assembly minimum distance and a
connected-component report cannot distinguish these requirements.

When a brief specifies usable clearance, measure between the nearest functional
surfaces, including teeth, bolt heads and inserts. A nominal plate spacing can
remain unchanged while those details narrow the actual opening. Report nominal
dimensions separately when they differ from the usable space.

Check the part in context before hiding neighbors. Isolation can reveal a surface but cannot prove its attachment. `viewFidelity.materialFaithful: false` leaves PBR appearance unverified. Animation and cutaway inspection should target the motion or occlusion in question, not add a fixed number of routine images. For CLI motion review, use `node kiln.mjs animation RETURNED_REF --clip CLIP_NAME --phases 0,0.017,0.31,0.68,1 --views motion.png --json`; add `--render gpu` when material fidelity matters. Compare `poseBounds` before and after the edit for requested ground clearance and travel, including protrusions. Sampled bounds do not prove continuous contact; include phases inside a geometric repeat, even when regular samples look identical. The [motion reference](references/revision-and-views.md#motion-and-interiors) covers phase units, cameras and separate frames.

Save source and GLB from the same final reference:

```sh
node kiln.mjs source RETURNED_REF --out revised-v1.kiln.js
node kiln.mjs render RETURNED_REF --out revised-v1.glb --views revised-v1.png
```

Replace `RETURNED_REF` with the final reference returned by Kiln. Keep the workspace store and its mappings to retain earlier revisions.

CLI `render --json` returns a receipt with exact output paths and image fidelity,
without embedded image bytes. Check `ok` and `files` before treating the export as
complete; an image failure can follow a completed GLB write.

For matched before/after PNGs, save the `capture` object as `cameras.json`, then use `node kiln.mjs render RETURNED_REF --capture cameras.json --views revised-view.png` for each revision. The file contains only the capture object, uses the same MCP camera schema, and may request grid or separate output; separate writes `revised-view.shot-01.png` and so on. One shot produces a hero image. Export images directly; do not transcribe MCP image base64 into files.

Source export refuses overwrite. References persist in the configured local store; if one is missing elsewhere, import the saved file there. Report the change, the saved artifacts, the views reviewed, and unresolved issues.
