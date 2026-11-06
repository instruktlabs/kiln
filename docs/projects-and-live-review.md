# Projects and Live Review

The packaged local dashboard adds shared project configuration, a material library and observation history to standalone authoring. The CLI, the stdio MCP tools `kiln_project`, `kiln_material` and `kiln_review`, and the dashboard read and write the same records. Each MCP tool takes one flat object whose `action` names the operation; the server reports the fields that action needs, and `kiln_discover({ ids: ["shape:project-draft"] })` and the other `shape:` entries return the full nested record schemas. The [foundation checkpoint](https://github.com/instruktlabs/kiln/blob/main/docs/plans/2026-09-26-project-foundation.md) records how this was qualified and what production acceptance remains.

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

`pins.json` contains an array of exact `{resourceId, revisionId, sha256}` material dependencies. MCP accepts the same array as `materialDependencies`. These per-call pins work independently of project membership. With a project, additional pins extend its lock and an explicit pin replaces the project pin for the same resource for that invocation. The saved project revision remains unchanged. Copy returned identities rather than constructing them, and preserve the selected dependencies on subsequent calls that evaluate the source.

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

`kiln_review` and the dashboard expose the same review records and exact-save operation. `list` pages short records (`offset`, `limit` up to 100; `total` and `nextOffset` in the result); `get` and `pin` return one operation bounded to 20,000 characters and name `.kiln/review/<operation>/evaluation.json`, the pretty-printed complete report, for anything left out. Saving checks the displayed revision, retained artifact identity and current trusted requirements. It preserves the recorded source, GLB, capture, build settings and material dependencies without evaluating again. It does not convert a comment or QA report into release acceptance. Bind the returned saved collection/asset/revision to an inventory entry when it belongs in the pack.

The default journal retains at most 200 operations and 256 MiB, including pinned operations. It reports overflow or unavailable observation storage without replacing the authoring result. Durable saved assets are separate and are not evicted by the journal. `KILN_LIVE_REVIEW=off` disables automatic observation for local authoring hosts. Feedback still belongs in the agent's existing conversation; launch, cancel, retry, pause and harness proxies are outside this foundation.

## Modules composed together

Modules saved separately can each pass their own QA and still collide once they stand together, because neither one contains both parts. A project declares that arrangement once, on its inventory: an item's optional `placement` says where its pinned revision sits in the project's shared frame.

```json
{ "id": "wall", "name": "Wall", "asset": { "collectionId": "project", "assetId": "wall", "revisionId": "r_..." }, "placement": {} }
```

`placement` holds optional `translation` (metres), `rotation` (Euler XYZ degrees, as Kiln's helpers) and `scale`, applied in the order scale, rotation, translation. Each defaults to identity, so `{}` states "at the shared origin". A missing placement means the item is **not composed**, never identity: most of a pack is unrelated props, and identity would report them all as overlapping at the origin. The field is omitted when absent, so existing project revisions keep their ids. It travels through project bundles, export and import, and the dashboard shows it in the Projects inventory and edits it in the configuration JSON. Linking or unlinking an asset keeps it.

```sh
node kiln.mjs project check pilot --revision REVISION
```

`kiln_project` action `check` is the same operation. It reads the exact pinned GLB of every placed item, composes them, and runs the part-volume and open-surface measurements over cross-module pairs only; overlaps inside one module belong to that module's own QA and spend no budget here. `overlaps` names the module and part on each side with shared volume and fraction, and `openSurfaces` names them with depth in metres. Both follow the same contact tolerances as normal QA, so a cloth resting on a neighbour's surface is silent.

`coverage` says what the result can be read as, and only `complete` means every placed item and pair in scope was measured:

| `coverage` | Meaning |
| --- | --- |
| `complete` | Every placed item loaded and no budget was reached. Open surfaces are still not measured against each other. |
| `partial` | Something was not measured, and is named: a placed item in `unmeasured`, a part in `unmeasuredParts`, or `truncated` for a budget. |
| `nothing-to-compare` | Fewer than two modules were composed. |
| `failed` | The check itself could not run. This says nothing about the geometry. |

An item in `unmeasured` is not certified clear. Its `reason` is `unpinned` (a placement with no linked revision), `unavailable` (the revision or its collection is not configured), `unreadable` (the bytes failed integrity or would not load) or `budget`. One check composes at most 64 modules, 256 MiB of GLBs and 4,096 parts, and the two passes keep their normal budgets. Items are loaded in inventory order until a budget is reached, and lists are capped with the remainder counted.

A positive is a measurement, not a verdict, and the command exits 0 with findings. A fitting socketed into a neighbour's shell is reported exactly as a bolt in a hole is, so review the pairs you did not intend. The check is at rest and over visible static parts: instanced GLB nodes are expanded, but skinned and morph-deformed parts are named as unmeasured, and LOD alternates are left out. It reads saved GLBs, so a part is measured per glTF primitive. Kiln's builder writes one primitive per mesh node (0 of 20,569 nodes across 64 rendered examples had more), but in an imported GLB a closed part split across materials can read as open surfaces, which are not measured against each other.

`kiln_save` and `kiln save` run the same measurement when the invocation's bound project pins this exact collection and asset at a stated placement. The report is returned as `composition` and recorded in the revision's `build.composition`. It measures the revision being saved in place of the item's older pin, marking that module `saved` because its revision id does not exist until the write, and it covers only pairs involving that asset; `project check` covers the rest. The save happens whatever the report says.

These limits are deliberate:

- A draft is not measured against its neighbours until it is saved. A draft has no inventory identity, and `kiln_render` and `kiln_edit` do not read sibling GLBs.
- The first save of a new asset has no report, because no item can pin a revision that does not exist yet. Link it, then `project check` or save a child revision.
- `kiln_review` exact saves and explicit migrations record no report, since they preserve a recorded build without evaluating again. Run `project check` after linking them.
- A standalone asset has no neighbours. Omitting the project, `--no-project` and `projectId: null` produce no report and no warning, and nothing is inferred from other projects, names or the collection named `project`.

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

Local development uses the shared renderer on this machine. Remote rendering is an explicit endpoint selection through `--render-port` where supported, or `KILN_RENDER_PORT_URL`; an explicit endpoint never triggers local service replacement. A URL whose origin is exactly the shared local socket (`http://127.0.0.1:8000` by default) is the local service and takes the local route. CLI/MCP use the host connection resolver. Embedded callers inject a render port. Do not construct an unauthenticated raw transport after merely discovering a local service. See the [GPU integration review](https://github.com/instruktlabs/kiln/blob/main/docs/plans/2026-09-26-gpu-service-integration.md) for the reproduced authentication failure, remaining credential-policy ambiguity and proposed unified connection contract.

Use `--render gpu` for required GPU image qualification. `auto` can use the CPU for untextured nonmetallic scenes or degrade when a GPU view is unavailable, with explicit fidelity metadata; `cpu` is an offline diagnostic mode. The interactive viewport and recorded image are different render paths. GPU output is appearance evidence, not structural QA authority.

The dashboard's Measure control records a bounded browser sample: load to first render submission, frame intervals, draw/geometry/texture counts, viewport, DPR and available adapter identity. Frame intervals are not GPU execution times; texture counts are not memory bytes. The [controlled foundation review](https://github.com/instruktlabs/kiln/blob/main/docs/reviews/2026-09-26-foundation-performance.md) records exact technical fixtures, actual panel dimensions, installed identities and ambient workload separately from earlier busy-machine observations. A future pack's real proving scene needs its own measurements before accepting a game performance budget. Record exact artifacts, browser/backend, adapter/driver, canvas size/DPR, thermal/power conditions, concurrent workload, cold/warm repetitions and any profiler overhead.
