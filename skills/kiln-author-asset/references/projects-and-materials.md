# Optional projects and exact material dependencies

A workspace provides Kiln's tools and local storage. A project adds a versioned brief,
inventory, design profile, references, delivery intent and material lock for related
assets. A collection stores saved asset revisions. The default collection is named
`project`; saving there does not require or create a project record.

The dashboard's Library aggregates configured storage collections. Register another
asset store explicitly with `node kiln.mjs collections add <alias> <absolute-directory>`
and restart the host; `assets --all` / `kiln_assets` action `catalog` list them together.
Keep collection IDs in exact asset references because IDs can collide across stores.
Use named project inventory links for membership, independently of where bytes live.
The viewer can link, replace or remove a membership; CLI/MCP use the same expected-
revision project update with the intended inventory. Removing membership never deletes
an asset. One asset can belong to multiple projects; standalone remains valid.

For live iteration, optionally set `KILN_WORK_ITEM` to a stable lowercase identifier
for one asset/candidate before starting CLI/MCP. Keep it across that item's revisions,
use distinct IDs for independent candidates, and restart MCP to change it. Historical
unbound operations remain ungrouped. `view --observe-workspace <directory>` can inspect
another explicitly registered observation source without merging its project identity.

Use a project when shared art direction or an inventory helps the requested work.
An individual asset, experiment or environment can stay standalone. Do not infer
project membership from its presence in the same directory. Different projects can
use different styles, materials and budgets.

## Standalone authoring

Normal authoring needs no project setup. Omitted selection stays standalone unless
the host explicitly configured `KILN_PROJECT`. CLI `--no-project` or MCP
`projectId: null` overrides that default. Do not combine an explicit opt-out with
a project revision. Materials and Live Review work in either mode.

```sh
node kiln.mjs render asset.kiln.js --no-project --out asset.glb --views review.png
node kiln.mjs view
```

The CLI writes the review image to disk; read it before judging appearance. The
browser loads retained GLB artifacts and does not build another copy. When GPU
material evidence is required, add `--render gpu` and check actual view fidelity.

For library materials, use CLI `material create-preset --file options.json`, then
`material get MATERIAL_ID REVISION` for the code-ready `portableSpec`. Custom recipes
use `material procedural --file draft.json`. These CLI paths do not need an internal
`dist/` import or an extra TypeScript loader. Copy the returned spec into source,
compile it with `compilePortableMaterialSpecV2`, and supply the exact pins below.

## Create and revise a project when useful

Discover optional `kiln_project`, `kiln_material` and `kiln_review` tools from the
connected host. A custom embedding may omit them. These are equivalent entry points:

```sh
node kiln.mjs project create --id my-pack --name "My pack"
node kiln.mjs project get my-pack
node kiln.mjs project update my-pack --expected RETURNED_REVISION --file patch.json
```

```json
{"action":"create","draft":{"projectId":"my-pack","name":"My pack"}}
```

Pass that JSON to `kiln_project`. To update, use
`{action:"update", projectId:"my-pack", expectedRevision: RETURNED_REVISION, patch}`.
Copy the returned revision exactly. A stale revision reports a conflict: read the
current configuration and reconcile changes before retrying. Every supplied top-level
field replaces its previous value. Read and merge the full `design` object before
changing one nested preference; sending only `design.style` also clears omitted
palette, material roles and conventions to defaults. Preserve array entries the
task does not remove.

Fill only the fields useful to the user's request. An example `patch.json` is:

```json
{
  "brief": "A coherent set of workshop props for a browser game",
  "design": {
    "style": "Readable stylized shapes with restrained surface detail",
    "scale": "Metres; +Y up; objects rest at Y=0",
    "palette": [{"role":"paint","color":"#526D75"}]
  },
  "inventory": [
    {"id":"workbench","name":"Workbench","kind":"asset","brief":"A usable work surface"}
  ]
}
```

Project creation and dashboard selection do not activate a project for future
authoring. Select it on each operation:

```sh
node kiln.mjs render asset.kiln.js --project my-pack --project-revision RETURNED_REVISION --out asset.glb
```

MCP authoring uses `projectId` and optional `projectRevision`. Omit only the revision
when the intended configuration is the project's current revision. A project is
editable design guidance, not trusted requirements or release authorization.

## Use library materials with or without a project

Inspect `kiln_material` with `action: "presets"`, `"list"` or `"get"`. CLI equivalents
are `material presets`, `material list`, and `material get ID REVISION`. Creation
and import preserve creator, license, recipe/seed and source provenance. Copy the
returned `portableSpec` into source and call `compilePortableMaterialSpecV2(spec)`;
the host provides the selected immutable map bytes before evaluating source.

A pin uses the returned material ID as `resourceId`; both hashes equal its returned
immutable revision. `pins.json` is an array:

```json
[
  {"resourceId":"RETURNED_MATERIAL_ID","revisionId":"RETURNED_SHA256_REVISION","sha256":"RETURNED_SHA256_REVISION"}
]
```

For standalone work, pass this array as MCP `materialDependencies`, or use
`node kiln.mjs render asset.kiln.js --no-project --materials pins.json --out asset.glb`.
Use the same pins on later edit, inspect, animation and save calls that evaluate
the source. The source reference alone does not restore dependency context.

For a project, put the pins in its `materialDependencies` through a revision-aware
update. Each project-bound invocation resolves that exact configuration and lock.
Call-level pins can add resources; conflicting revisions for the same resource are
errors, not overrides of the project lock. Update the lock deliberately when changing
shared art direction. A missing resource or mismatched hash must be resolved before
building; neither source URLs nor material names authorize an implicit download.

Material records carry physical repeat scale, but the author controls mesh UV scale.
Review seams, repeats, roughness and normal strength on representative geometry with
actual GPU views. A project palette is guidance, not automatic recoloring.

## Retain and deliver the work

`kiln_review` can list/get observed operations, pin them against ordinary eviction,
and save an exact reviewed operation using its `expectedRevision`. Pinning does not
pause the agent; feedback still belongs in the agent's conversation. Saved collection
revisions are durable; observation history is bounded and disposable.

Preserve the returned collection, asset and revision IDs. When an asset belongs to
an inventory entry, bind that exact saved revision with a project update. A later
asset revision does not silently update the project inventory.

Deliver a standalone asset directly through its collection exports. When delivering
a pack, `project export ID --revision REVISION --profile editable|runtime --out FILE`
packages the linked saved inventory. Editable delivery needs source, build settings
and complete normalized material resources; runtime delivery needs the GLB and its
metadata. Project packages exclude referenced concept-image and original acquisition
archive bytes. Verify the actual exported files and rebuild resource-dependent editable
deliveries in an independent workspace. Do not create a dummy project for delivery.

After import, `node kiln.mjs asset ASSET_ID ASSET_REVISION --rebuild --out rebuilt.glb`
uses the saved dependency revisions and exporter settings. It reports artifact hash
equality; historical assets without complete settings need an explicit new build.
Building or saving does not establish visual, game-runtime or release acceptance.
