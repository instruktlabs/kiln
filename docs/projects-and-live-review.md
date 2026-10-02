# Projects and Live Review

The packaged local dashboard adds shared project configuration, a material library and observation history to standalone authoring. The CLI, the stdio MCP tools `kiln_project`, `kiln_material` and `kiln_review`, and the dashboard read and write the same records. Each MCP tool takes one flat object whose `action` names the operation; the server reports the fields that action needs, and `kiln_discover({ ids: ["shape:project-draft"] })` and the other `shape:` entries return the full nested record schemas. The [foundation checkpoint](plans/2026-09-26-project-foundation.md) records how this was qualified and what production acceptance remains.

## One workspace across interfaces

Run commands from the asset workspace created by `kiln-init`, using `node kiln.mjs` below. From the engine checkout, use `node dist/cli.mjs`. Projects are distinct from collections: a project holds the brief, inventory, design profile and exact material dependencies; a collection stores immutable saved assets. Several projects can use the same collection.

Projects are optional. Standalone assets, experiments and environments can use materials, Live Review, saving and export without creating one. The collection named `project` is a save destination; it does not imply membership in a project record. Use a project when a shared brief, inventory or art direction helps the task.

`KILN_WORKSPACE` chooses the workspace root. Its `.kiln` directory holds projects, material records, source snapshots and disposable observation history. When explicitly set, `KILN_PROGRAM_STORE` changes only the source-store directory. Without `KILN_WORKSPACE`, its grandparent remains the workspace root for existing setups. With neither setting, the current directory is the root. Explicitly injected embedding stores keep their own locations.

```sh
node kiln.mjs project create --id pilot --name "Pilot pack"
node kiln.mjs project get pilot
node kiln.mjs view
```

The dashboard's Projects, Materials, Live Review and Library sections read the same records used by CLI and MCP. Project updates create immutable revisions and require the displayed `expectedRevision`; a conflict requires refreshing and reconciling the proposed change. Supplied top-level fields replace their old values. A design profile is an editable preference, not trusted QA policy or permission to release assets.

```sh
node kiln.mjs project update pilot --expected REVISION --file project-patch.json
node kiln.mjs render asset.kiln.js --project pilot --project-revision REVISION --out asset.glb --views review.png --render gpu
```

Authoring commands accept `--project` and `--project-revision`. MCP tools use `projectId` and `projectRevision`. Omission stays standalone regardless of the number of projects, unless `KILN_PROJECT` explicitly configures a default. CLI `--no-project` or MCP `projectId: null` overrides that default; combining an opt-out with a project revision is invalid. Creating or viewing a project does not select it for later calls. Each invocation resolves one immutable configuration and its material closure. Missing or mismatched dependencies fail before source execution. Concurrent invocations do not share mutable project selection.

```sh
node kiln.mjs render asset.kiln.js --no-project --materials pins.json --out asset.glb
```

`pins.json` contains an array of exact `{resourceId, revisionId, sha256}` material dependencies. MCP accepts the same array as `materialDependencies`. These per-call pins work independently of project membership. With a project, additional pins can extend its lock, but conflicting revisions for the same resource are rejected. Copy returned identities rather than constructing them, and preserve the selected dependencies on subsequent calls that evaluate the source.

## Materials and coherent art direction

See [the material library](material-library.md) for map conventions, provenance, offline import/export and deterministic recipes. The package includes five editable procedural starting points. Curated external material records are imported explicitly, not silently fetched by the evaluator. Authored source refers to exact material resources provided by the host. Changing a project's palette or dependency lock does not rewrite earlier saved assets.

```sh
node kiln.mjs material presets
node kiln.mjs material create-preset --file preset-options.json
node kiln.mjs material list
node kiln.mjs material get MATERIAL_ID MATERIAL_REVISION
node kiln.mjs material import --file portable-materials.json
```

`kiln_material` exposes the same library and recipes when the host injects it. The dashboard can create presets and pin exact material revisions to a project. Keep creator, license, original-source identity and derivation information with each record. A tileable recipe is a starting point; inspect the result on representative UVs, at its intended scale, under GPU lighting before accepting it for a pack.

## Observe and retain exact work

CLI and MCP authoring publish bounded observation records containing source, exact evaluated GLB, QA summaries, image fidelity and the captures already produced for the agent. Opening a dashboard does not perform another build or render. The viewport is interactive browser WebGL; a recorded review image separately reports the renderer that produced it. A CPU image is not PBR appearance evidence.

Following latest shows new operations and can retain the previous successful artifact of the same explicitly identified authoring item when a later build fails. Set `KILN_WORK_ITEM=cow` (an ID starting with a lowercase letter, then up to 79 lowercase letters, digits, underscores or hyphens) in the authoring host environment to group one item's CLI/MCP operations across sessions. It is optional and independent of project membership. Separate candidates need separate IDs. Restart MCP after changing it. Historical operations without an ID stay ungrouped; sharing a project is not evidence that two operations concern the same model. A selected run stays isolated. Pinning retains evidence against normal journal eviction; it does not pause an agent. Compare does not assert visual acceptance. Reconnecting reads persisted history rather than inventing missed progress.

Library aggregates every configured storage collection, including standalone assets. The `project` collection is labeled Workspace storage; it is not a named project. Use `kiln collections add <alias> <absolute-directory>` to register another saved collection explicitly, then restart the viewer/MCP host. `kiln assets --all` and `kiln_assets` action `catalog` expose the same collection-qualified inventory. Projects may link exact revisions from any registered collection, with zero or multiple memberships per asset. The asset viewer offers link/replace/remove membership controls backed by the existing conflict-checked project update contract. Project filters show the pinned revision even when a newer revision exists elsewhere.

A GLB with `MSFT_lod` chains, authored or imported, opens at LOD0 in Library and Live Review. The global Level control sets every chain to the selected index; a shorter chain shows its last level. Expand **Per-part levels** to mix levels independently, such as a tractor's LOD1 body with LOD0 wheels. The global selector then shows **Mixed part levels**, and the triangle total reflects the actual displayed combination, including parts outside the chains and authored visibility.

Live Review gives the current and pinned artifacts separate part controls. Changing the current artifact's global selector also sets the pinned view; changing one part affects only that artifact. Selections retain the camera and ignore automatic switch thresholds. Different artifact bytes reset part selections to LOD0 because node IDs identify chains only within one GLB. Selecting another observation of identical bytes keeps the displayed geometry, part selections and statistics while updating the observation identity. These manual controls do not establish automatic LOD support in an external importer.

Use `kiln view --observe-workspace <directory>` (repeatable, at most 32) to review other explicitly selected workspaces from one dashboard. The Observation source selector keeps their journals separate; no filesystem discovery or historical ownership inference occurs. Save exact artifact saves once, then offers an independent membership step. A membership conflict leaves the saved asset available in Library and never repeats the save. This is observation and curation, not an agent-control proxy.

```sh
node kiln.mjs review list --project pilot
node kiln.mjs review get OPERATION_ID
node kiln.mjs review pin OPERATION_ID --pinned true
node kiln.mjs review save OPERATION_ID --expected OPERATION_REVISION --name "Reviewed asset"
```

`kiln_review` and the dashboard expose the same review records and exact-save operation. Saving checks the displayed revision, retained artifact identity and current trusted requirements. It preserves the recorded source, GLB, capture, build settings and material dependencies without evaluating again. It does not convert a comment or QA report into release acceptance. Bind the returned saved collection/asset/revision to an inventory entry when it belongs in the pack.

The default journal retains at most 200 operations and 256 MiB, including pinned operations. It reports overflow or unavailable observation storage without replacing the authoring result. Durable saved assets are separate and are not evicted by the journal. `KILN_LIVE_REVIEW=off` disables automatic observation for local authoring hosts. Feedback still belongs in the agent's existing conversation; launch, cancel, retry, pause and harness proxies are outside this foundation.

## Editable packages and runtime delivery

```sh
node kiln.mjs project export pilot --revision REVISION --profile editable --out pilot-editable.zip
node kiln.mjs project export pilot --revision REVISION --profile runtime --out pilot-runtime.zip
node kiln.mjs project import pilot-editable.zip --id imported-pilot --collection project
node kiln.mjs asset ASSET_ID ASSET_REVISION --collection project --rebuild --out rebuilt.glb
```

The editable project ZIP contains the selected configuration, saved inventory revisions, source, recorded build settings, normalized material maps and procedural recipes. It includes dependencies of older saved assets even when the current project lock has changed. Referenced concept images and original acquisition archives remain references; their bytes are not embedded. The runtime ZIP contains GLBs and metadata sidecars, with no editable source or material library. Neither profile supplies inventory entries that have not been linked to saved revisions.

Import verifies identities and byte limits before publishing a new explicitly named project. It preserves the original ZIP as provenance, resets working review annotations and refuses runtime packages. Rebuild uses a saved asset's exact recorded resource revisions and exporter settings, not the imported project's current defaults. It reports both hashes and whether the result matches the saved artifact; it never overwrites the original revision or an existing output file. Historical assets without complete build settings require an explicit new authoring run. Bound requirements require current host authorization and are not activated by an imported manifest.

The MCP `kiln_project` export action returns an exact revision resource URI for a supporting resource reader. The dashboard offers separate editable and runtime downloads. Individual editable asset ZIPs carry their exact normalized library maps and recipes in `materials.kiln.json`; CLI, MCP resources and the local library use the same export path. Their canonical saved manifest and asset identity remain unchanged. Import validates the resource closure before publishing revisions, and standalone rebuild needs no project record. Legacy ZIPs may lack resources; missing editable dependencies are reported rather than replaced with a current library revision. Runtime GLBs remain self-contained.

## GPU connection and performance qualification

Local development uses the shared renderer on this machine. Remote rendering is an explicit endpoint selection through `--render-port` where supported, or `KILN_RENDER_PORT_URL`; an explicit endpoint never triggers local service replacement. A URL whose origin is exactly the shared local socket (`http://127.0.0.1:8000` by default) is the local service and takes the local route. CLI/MCP use the host connection resolver. Embedded callers inject a render port. Do not construct an unauthenticated raw transport after merely discovering a local service. See the [GPU integration review](plans/2026-09-26-gpu-service-integration.md) for the reproduced authentication failure, remaining credential-policy ambiguity and proposed unified connection contract.

Use `--render gpu` for required GPU image qualification. `auto` can use the CPU for untextured nonmetallic scenes or degrade when a GPU view is unavailable, with explicit fidelity metadata; `cpu` is an offline diagnostic mode. The interactive viewport and recorded image are different render paths. GPU output is appearance evidence, not structural QA authority.

The dashboard's Measure control records a bounded browser sample: load to first render submission, frame intervals, draw/geometry/texture counts, viewport, DPR and available adapter identity. Frame intervals are not GPU execution times; texture counts are not memory bytes. The [controlled foundation review](reviews/2026-09-26-foundation-performance.md) records exact technical fixtures, actual panel dimensions, installed identities and ambient workload separately from earlier busy-machine observations. A future pack's real proving scene needs its own measurements before accepting a game performance budget. Record exact artifacts, browser/backend, adapter/driver, canvas size/DPR, thermal/power conditions, concurrent workload, cold/warm repetitions and any profiler overhead.
