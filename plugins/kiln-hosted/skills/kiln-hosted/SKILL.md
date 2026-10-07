---
name: kiln-hosted
description: Create, inspect, revise and deliver editable 3D assets through Kiln's connected hosted service, or reopen assets saved in that account. Use for hosted Kiln work; keep an existing local Kiln workspace on its local workflow unless the user chooses hosted storage.
license: MIT
---

# Work with hosted Kiln

Use the connected Kiln tools for the requested asset work. Account connection and
sign-in belong to the host and Kiln website; never ask for a password, token or code
in chat. If the connection is unavailable, explain that step without pretending a
local installation can access the hosted account.

Read [the program contract](references/program-contract.md) before authoring new
source. `kiln_discover` retrieves geometry helpers, examples and input shapes;
`kiln_capabilities` reports hosted runtime facts. Use the tool schemas currently
exposed by this connection. Renderer setup and local CLI instructions in general
engine references are not steps for this hosted workflow.

## Create and review

Match the brief's subject, scale, style and destination. Standalone assets need no
project. Use [geometry recipes](references/geometry-recipes.md) for construction,
curved surfaces and joints that must fit or move; search Discovery for unfamiliar
helper contracts. Preserve experimental labels and limitations in the catalog.
The authoring frame is metres, +X forward, +Y up, +Z right.

Submit new source once to `kiln_validate` or `kiln_render`, then copy the returned
`programRef` exactly for later reads, edits and views, including after a failed
build. Use `kiln_source` to obtain exact anchors and `kiln_edit` for revisions;
keep the new reference and inspect build success separately from edit success.

Inspect returned images and structural findings against the brief. Select
[camera views](references/camera-recipes.md) that answer a concrete shape, joint,
interior or motion question. Use exact returned part paths and numeric inspection
for required fit or clearance. Read `viewFidelity`: a CPU fallback can establish
shape, not PBR material appearance. Do not claim material quality or destination
performance from a passing structural check or an unavailable view.

Hosted calls use quotas. Do not repeat an unchanged render without a new review
question. On admission refusal or a quota error, report the limit and preserve
existing references; do not switch accounts or keep retrying to evade it.

## Materials and saved work

For library materials, use `kiln_material_presets`, `kiln_material_list` and
`kiln_material_get` to find exact resources. The separate
`kiln_material_create_preset`, `kiln_material_create_procedural` and
`kiln_material_import` tools retain new resources. Read their current schemas and
Discovery shapes; supply known provenance and licensing rather than inventing it.
Carry the same `materialId`/`revisionId` dependency pins through each render, edit,
inspection and save that needs them. A program reference alone does not supply
material context.

Browse with `kiln_assets_collections`, `kiln_assets_catalog` or `kiln_assets_list`.
`kiln_assets_get` reads a selected revision and its downloads;
`kiln_assets_restore` returns its exact source reference for editing. Preserve the
collection, asset ID and revision ID together. These hosted operations are separate
tools, not an `action` argument on `kiln_assets` or `kiln_material`.

## Deliver the requested result

For a requested saved or downloadable asset, save the reviewed final `programRef`
with `kiln_save`, using the requested collection or the documented default. For a
revision, supply its asset ID and parent revision so earlier work stays intact.
Use the same material dependencies and reviewed backdrop. Do not save every draft
or save a preview-only exploration unless the user requested persistence.

Use `kiln_present` or `kiln_export` on the exact saved revision. Return actual
download links from the result; they require the owning browser account and
expire. Get fresh links by reopening the saved revision when needed. Present an
interactive card only when the host supports it; otherwise use the supplied
links/resources. Never invent public links or claim native attachment support.

Report the result, what was reviewed and any remaining limitation. Unsaved work
expires after seven days. Saved assets remain within quota until deleted; account
and deletion controls are on the Kiln website, not additional hidden MCP tools.
