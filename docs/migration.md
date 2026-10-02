# Updating an existing Kiln integration

Existing inline-code transport and the legacy capture format remain supported. The
Discovery and authoring-helper changes below require explicit migration; retired
names have no callable compatibility aliases.

## Changes in 0.10.0

The [changelog](../CHANGELOG.md) names every break; these are the ones an existing
integration notices first.

- **Server.** `dist/mcp-server.mjs` answers the handshake and `tools/list` from a
  generated manifest and loads `dist/mcp-engine.mjs` on the first call that needs the
  engine: both bundles stay together. Protocol revision 2026-07-28 is served beside the
  2025 revisions; a request with neither a protocol version nor a preceding
  `initialize` is refused with both ways in. A configuration problem comes back as the
  first tool result instead of killing the server.
- **Tool schemas.** `kiln_project`, `kiln_material` and `kiln_review` are one flat object
  each with an `action` field; their `draft`, `patch` and `payload` records, and the
  `capture`/`shot` records of the review tools other than `kiln_render`, are opaque in
  the schema and described by `kiln_discover({ ids: ['shape:…'] })`. Every input schema
  is within 5,000 bytes. The field names and defaults are unchanged.
- **Results.** Every result is JSON on one line and leads with the verdict (`ok`,
  `acceptance`, `disposition`, `blockers`, `findings` counts, `next`). The compact
  report groups findings by code with counts, lists no `notRequested` rules and shows
  24 part paths; `detail` takes `lean`, `compact` or `full`, and `full` is bounded at
  40,000 characters with `retainedReport.path` naming the complete pretty-printed
  report. `kiln_edit` returns what applied and changed with the compacted render;
  `kiln_inspect listParts` returns paths unless `placement: true`; `kiln_review list`
  pages. A `kiln_render` or `kiln_edit` result is never larger than 40,000 characters
  and at most 20,000 by default. A compact or lean comparison (`preservation.comparison`
  of `kiln_edit`, `comparison` of `kiln_inspect compare`) names each change by path,
  name, status and changed fields without its bounds or the scope prose, and a compact
  or lean per-view receipt (`derivativeReceipts`, `viewFidelity.receipts`) carries its
  label, `cameraFidelity`, `captureCache` and only what differs from `viewFidelity`,
  which states once what every receipt shares; both are whole in `full`. A compact or
  lean result rounds every number to six decimals, states an animation shot shared by
  several frames once (`cameraShots[].frames`, each frame's bounds in `poseBounds`),
  omits `viewEvidence.lastFaithful` when it is the current view and keeps `poseBounds`
  inside the default limit by counting the trailing frames it leaves out
  (`poseBoundsOmitted`, `poseBoundsHint`). A full `kiln_edit` is bounded as a whole: its
  diff shrinks first, then the bounds of each change, then the render. A `kiln_edit` sent
  by `code` no longer echoes the patched source: the result's `programRef` serves it through
  `kiln_source`, and `includeCode: true` asks for it bounded with the rest (`codeOmitted`,
  `codeHint`). CLI `render --json` and `animation --json` carry the compact result unless
  `--detail full`.
- **Errors.** `ok: false` is an MCP error (`isError: true`) naming the cause and the next
  call, with no local path. Invalid input is a sentence, not a zod issue list; a wrong
  camera subject is answered with the shot's fix, not the source's.
- **Revisions by default.** `kiln_assets get` and `restore` without `revisionId` read the
  asset's newest revision; `kiln_material get` without `revisionId` reads the material's
  only revision and names the revisions when there are several, as `kiln_project get`
  reads the latest project revision.

## Changes in 0.9.0

Upgrade the installation and each workspace together: run the new installation's
`kiln-init --check`, then `--upgrade`, and restart the harness/MCP session. The
connected server then lists seventeen tools: the fourteen program tools plus the
optional `kiln_project`, `kiln_material` and `kiln_review`. Projects stay opt-in;
standalone work needs no change. See [projects and Live Review](projects-and-live-review.md).

Changes that alter output an author already has:

- **Review lighting.** GPU views default to the calibrated `review-neutral-v1` rig, so a
  lit matte surface reads back close to its authored colour. Assets whose albedo was
  darkened to suit the old rig look too dark and need individual review; there is no
  automatic conversion. Authoring tools use the default rig; render-port callers and
  composer documents can still select `neutral-studio-v1` through `lightingPresetId`.
  See [rendering](rendering.md).
- **`extrudeProfile`** adds no side rings by default: `divisions` defaults to 0, or 16
  when the extrusion twists, and must be a whole number of at least 0. Untwisted
  extrusions have fewer triangles, so their bytes change.
- **`sweepProfile`** keeps hard corners: `creaseAngle` defaults to 60 degrees, so
  triangles, squares and pentagons show hard edges. Pass `creaseAngle: 180` for the
  old smooth shading. `cap` also accepts `'start'` or `'end'`.
- **Emissive export.** The GLB `emissiveFactor` is now the colour Three.js renders,
  colour times intensity; above 1 it is normalised and carries
  `KHR_materials_emissive_strength`. Emissive assets export different bytes.
- **Animated GLBs** drop the `kilnReviewClipsV1` scene extra unless a track could not
  become a native channel, so their bytes change once. `createClip(name, duration,
  tracks, { loop })` records loop intent as the animation extra `kilnLoopIntent`;
  a declared loop whose end differs from its start warns `LOOP_NOT_CLOSED`.
- **Perspective cameras** given without `near` set it to half the distance to the
  nearest geometry (at least 0.001), so large assets lose false z-fighting and their
  images change.
- **CPU views** draw translucent surfaces after opaque ones, farthest first, so glass
  shows what is behind it.
- **Isolated capture shots** send the GPU only the subject; hidden meshes no longer
  appear in the GPU image.
- **Workspace CLI** (`node kiln.mjs`) re-executes under the Node recorded in
  `.kiln/workspace.json`, so a CLI export equals `kiln_save` bytes for the same
  reference. A workspace whose recorded Node is missing needs `--repair`.
- **Levels of detail.** Sibling groups named with one stem and a `LOD<n>` token
  (`Body_LOD0`, `Body_LOD1`) are a set of tiers, and a set of two or more needs one
  `defineLod(levels, { screenCoverage })` declaration. Without it, with a gap, without
  LOD0, or declared inside another tier, the build fails with `LOD_SET`, which names the
  fix; a lone token stays a label. A program that stacked tiers as plain groups must
  declare them, or keep one tier, before it renders again; its saved revisions keep their
  bytes. A declared set exports as one `MSFT_lod` chain whose lower levels leave the
  scene, so GLB bytes change, headline triangles and bounds count LOD0 and the parts
  outside every set, and default sheets draw LOD0 only. See
  [levels of detail](../skills/kiln-author-asset/references/geometry-recipes.md#levels-of-detail-only-when-the-brief-asks).
- **Viewer LOD selection.** The global selector remains available. Expand **Per-part
  levels** in Library or Live Review to select independent chains, with an updated
  total for the displayed combination. Part selections belong to the loaded GLB;
  loading different artifact bytes resets them to LOD0. Pinned comparisons have
  independent part controls. These are manual review controls, not automatic
  distance switching or proof that another application's importer supports LOD.

Changes to results and messages:

- **Compact results.** MCP `kiln_render` and `kiln_screenshot_animation` return compact
  results by default: every acceptance field, warn and block finding, the first finding
  of each observed code, counts of repeated findings and 24 part paths. Pass
  `detail: "full"` for the complete report. `kiln_view_interior`, `kiln_inspect` and
  `kiln_edit` also return compact results; `kiln_edit` leads with `programRef` and
  `parentRef`, and `kiln_render({ programRef, detail: "full" })` returns the complete
  report for its embedded render. The CLI, retained artifacts and Live Review keep
  complete reports.
- **Sizes.** `kiln_screenshot_animation` and CLI `animation` accept a frame `size` of 128
  to 1024 px (default 256). Versioned capture shots accept up to 2048 px.
- **Identities.** `.kiln/workspace.json` records the bundle as `buildIdentity`; discovery
  reports `execution.buildIdentity` beside the installed `runtimeIdentity`. Existing
  manifests that still say `runtimeIdentity` are read without reporting drift.
- **Rejections.** A build that throws names a closed cause (for example a
  temporal-dead-zone read or a recipe override the recipe does not list) with advice
  and a `Source check:` line. `kiln_validate` reports `TEMPORAL_DEAD_ZONE`,
  `MATERIAL_RECIPE_OVERRIDE` and `MATERIAL_RECIPE_ID`.
- **QA.** Overlap checks skip parts tagged at different `LOD<n>` levels and test the
  likeliest pairs first; `TRUNCATED` separates unmeasurable pairs from pairs not reached,
  and open shells are grouped by reason. Connectivity leaves out LOD1+ parts. Repeated
  helper notes are reported once with a mesh count. The instanceability grade says it is
  informational, and the blend-area budget names its largest materials.
- **Inspection** evaluates with optimisation off, so it reports the materials the program
  authored. Saved previews drawn from the persisted GLB record `exactArtifact: true`.
- **Errors.** Ambiguous or missing subjects list the candidate paths; unknown camera keys
  name the accepted keys (`fovDeg`, not `fov`); `surfacePairs` take exact paths or
  unambiguous node names, and a missing or shared name fails on its own pair with candidates.
- **Paths and hosts.** On Windows, collection roots in Git Bash form (`/c/...`) are
  refused with the setting named; use `C:/...`. The asset viewer accepts `127.0.0.1`,
  `localhost` and `[::1]` on its own port.
- **Discovery.** `ids` take a recipe's bare slug (`material-wood-v1`) as well as the
  `recipe:` form. Reviewed aliases change the ranking for `bench`, `table` and `cast iron`.
- **CLI `--json`.** `render`, `source`, `export`, `discover`, `inspect`, `animation` and
  `service status`/`reprobe` print a receipt; commands that print JSON already accept the
  flag; `generate`, `view`, `collections add` and `service start`/`stop` refuse it.
  `export` and `source --out` never replace a file and name the one that exists.
  `discover --capabilities` reports the collections the MCP server has, and `kiln-init`
  creates `.kiln/programs`.
- **CLI.** `kiln edit` and `kiln source` accept `--json`; `--capture` with
  `output: "separate"` writes `<stem>.shot-01.png` and onward. `kiln service start`
  joins or starts the shared renderer. A `KILN_RENDER_PORT_URL` naming the shared local
  socket takes the local route. The CLI honours `KILN_RENDER` whenever `--render` is
  omitted.
- **Levels of detail.** Render results, the integration manifest and CLI receipts list
  every chain in `levelsOfDetail` with each level's path and triangles; in `kiln_render`
  and `kiln_inspect` results each chain also carries `drawn`, the level every view drew
  (0 is LOD0). A shot whose subject is a lower level's path draws that level; see
  [levels of detail in views](cameras.md#levels-of-detail). Chains, imported or authored,
  survive save, optimisation and export; GPU instancing skips such files and full
  optimisation falls back to palette. Revision comparison compares each lower level at
  the path it takes beside LOD0 and does not compare switch thresholds. Library and Live
  Review show a Level control for a GLB with chains.

### Additional 0.9 author contracts

- **Part inspection.** `listParts` entries now include world `position`, `quaternion`,
  `scale`, `mirrored` and world `bounds`. Paging and compact limits are unchanged.
- **Application metadata.** Plain JSON in node/material `userData` exports as extras
  and imports back. Keep each object below 4 KiB of UTF-8 JSON and the asset below
  64 KiB. Do not write `kiln*` keys. `kiln_validate` checks literal assignments without
  running source; build warnings identify dynamic values that cannot be exported.
  Metadata may reduce optimization: nodes keep their identity, and palette merging
  is skipped when materials carry extras.
- **Visibility.** `visible = false` now changes exported intent using
  `KHR_node_visibility`, including hidden ancestors. Headline metrics and category QA
  count visible geometry; `hiddenNodes` lists excluded triangles. Verify support in
  the intended importer before depending on this extension outside Kiln.
- **Intentional sheets.** Call `markOpenShell(part, 'specific reason')` when an open
  boundary is intentional. The overlap report lists an acknowledgment with that
  reason; it still measures closed geometry and reports unrelated measurement limits.
- **Easing.** Pass `'CUBICSPLINE'`, `'EASE_IN'`, `'EASE_OUT'` or
  `'EASE_IN_OUT'` as the third argument to a track helper. The cubic mode computes monotone tangents per
  component; easing applies per consecutive key pair. GLBs contain standard
  `CUBICSPLINE` data, and review playback uses those same samples. `STEP` and `LINEAR`
  remain supported. A quaternion sign flip alone no longer warns about loop closure.
- **Index buffers.** Source exports default to `indexPolicy: 'indexed'`, adding
  indices to previously unindexed primitives and welding only exactly equal full
  vertices. UV seams, normals, morph data and triangle order are retained. GLB bytes
  can change. Set `indexPolicy: 'asBuilt'` on render calls, or
  `KILN_INDEX_POLICY=asBuilt` in a local host, to preserve helper buffers; combine it
  with optimization off. Saved rebuild settings and cache identities retain the
  policy. `indexBuffers` reports unique vertex/morph/index accessor payload bytes at
  this pass, before later optimizations; it is not a GLB compression measurement.
- **Sweep evidence.** `SWEEP_SELF_INTERSECTION` is an observation of a tight station
  radius or intersecting consecutive filled rings. Limits are 4096 stations, 512
  points per ring and 65536 segment/triangle tests. Budget exhaustion retains an
  unchecked warning and a partial finding. A completed local check does not certify
  distant segments or a manufacturing solid.
- **Hidden capture parts.** Use `version: 'kiln.capture.v2'` and shot-level
  `hide: [EXACT_PATH_OR_UNIQUE_NAME]`, with up to 64 selectors. Names are exact and
  ambiguous names fail before drawing. A hidden group hides its subtree. The hide
  list applies after subject framing and isolation, leaving the same camera for
  comparison; resolved paths are returned in `cameraShots`. CLI `--capture` accepts
  the same JSON. Version 1 remains valid but rejects `hide` explicitly.

## Geometry helper and diagnostic contracts

`curveToMesh` and `pipeAlongPath` now reject missing, zero, negative, nonfinite or
Float32-unrepresentable radii. Both signatures already required a radius; missing
JavaScript values previously reached Three.js and silently selected its unit-radius
default. Supply an explicit positive radius in asset units. Valid radii are unchanged.

Material recipe range errors and profile bevels that erase their cross-section now
retain repair advice through CLI, MCP and native tools. Accepted inputs are unchanged:
numeric `materialRecipe` overrides, including `emissiveIntensity`, use finite 0..1.
`compilePortableMaterialSpecV2` keeps its separate intensity range of 0..64. For a
collapsed `extrudeProfile` or `revolveProfile` bevel, reduce it below half the
narrowest section width, disable it, or widen the section. No geometry is silently repaired.

Manifold solids now check their actual Float32 output for collapsed triangles before
generating normals. Manifold first rebuilds topology from those coordinates; any
remaining exactly zero-area seam faces and their triangle metadata are removed
before final topology validation. Source runs, UVs and material ownership are
retained; the result reports
`SOLID_FLOAT32_CANONICALIZED`. Residual collapse fails with repair advice. Boolean
results restore asset units before this conversion, so positions/normals may differ
at rounding precision from earlier builds. This does not certify arbitrary mesh
repair, intersections or physical fit.

Geometry diagnostics now choose an extent-relative tolerance by default: `1e-6`
times the finite-position bounding-box diagonal. Pass `geometryDiagnostics(geo, 1e-6)`
explicitly when that absolute distance is intentional. Results include the effective
`tolerance`, `toleranceMode` and `positionScale`. `creaseNormals` uses a relative
`1e-8` distance without its old absolute floor. Periodic-surface endpoint matching
uses sampled extent, so tiny or distant open seams previously accepted by the old
world-coordinate threshold now fail. These are diagnostics and shading contracts,
not general solid certification; see [geometry limits](geometry.md).
The diagnostic and crease grids are now anchored to the bounds minimum; seam
counts near old grid-cell boundaries may change even with an explicit tolerance.

CSG results now carry their world origin on the returned mesh's `position`; vertices
are local to the first contributing mesh's world origin. Preserve the mesh transform
when exporting, reusing or inspecting a result. Replace world-bound calculations on
`result.geometry.boundingBox` with `new THREE.Box3().setFromObject(result)`.
Existing code that extracts geometry alone or overwrites a returned mesh position
must deliberately retain or replace that origin. All operands share one computation
frame, preserving their world relationships while avoiding far-origin Float32 collapse.

## Migrate evaluator integrations together

The execution protocol is now `kiln.evaluator.request.v2` and
`kiln.evaluator.result.v2`. The public evaluator port, request, result, transport,
handler and factory names use `V2`. Update the host and worker together. V1
envelopes are rejected; there are no V1 factory aliases or fallback decoders.
This version change does not rename the separate capture or renderer-port contracts.

Source labels are descriptive. To enforce a brief, the host creates an
`AssetRequirementsV1` record, binds it through `createAssetRequirementsStore`,
and passes the returned binding as `requirements` to rendering, inspection or
`KilnToolContext`. A bound tool registry serves one task/asset lineage. Construct
independent contexts for independent asset briefs. Each evaluation snapshots its
binding before asynchronous work. Supplying legacy `category` or `intent` to
execution or tool registry construction produces a migration error.

Validation returns `validationScope: "syntax-and-sandbox"` with the effective
requirements; it does not certify geometry. Render and inspection results carry
the evaluated requirements separately from source metadata and image fidelity.
Current QA reports use schema version 2 and distinguish `accepted`, `incomplete`
and `blocked`. An unevaluated requested obligation cannot produce acceptance.

Requested `navigation` accepts optional positive `minWidth` and `minHeight` in
asset-local metres. A neutral request with `value: {}` imposes no human-sized
minimum. Dimensions are measured on authored corridor prisms; their findings
retain advisory mode. Obstacles are checked regardless of ground/path labels, so
a plinth protruding into the route cannot exempt itself by changing its semantic
role. These are static bounds checks, not a complete traversal or mesh-volume
certificate. A missing or unmeasurable route remains incomplete. Explicit legacy
environment conversion preserves its former 0.8 m width and 1.8 m headroom advice
in the proposed fields; normal execution does not infer them.

An explicitly requested `scope` now runs the shared advisory member/dressing
analysis without selecting a category. The report includes observed member counts
and scope findings; nested replaceable parts count under their enclosing member
root. These signals do not certify semantic scope, modular reusability or pack
membership, so scope acceptance remains incomplete. Inferred scope and descriptive
labels do not enable the check. Missing scene evidence or a disabled rule is not
reported as an evaluated pass. Natural-language required parts and forbidden extras
also remain unqualified; phrases such as "clear entry" are not exact node selectors.

Saved tool revisions retain a requirements receipt and, when bound, a checkpoint
containing the canonical source hash and complete binding history. Importing JSON
does not authorize those requirements. To resume a bound asset in a fresh host,
validate its checkpoint and call the host store's `restore` with explicit restore
authority, then inject the returned binding. The restore tool checks the source
identity and lineage history before retaining source. It reports
`reevaluation-required`. Revisions cannot silently drop the previous binding.
Older assets without a current receipt require explicit migration before restore
or revision; download and inspection of their saved records remain available.

Hosts import the current contract/store from `@kiln/engine/requirements` and the
explicit legacy converter from `@kiln/engine/requirements/migration`. CLI `render`,
`generate`, `save`, and `asset --restore` accept
`--requirements <host-binding.json>`. The file contains a complete current binding
returned by the host store, not source-authored metadata, a bare category or an
unactivated checkpoint. Selecting this file explicitly supplies host policy for
the command; the flag is optional and the ordinary authoring default is neutral.
The file is checked as bounded UTF-8 JSON before evaluator or renderer startup.
`asset --restore` uses the same shared restore implementation as MCP.

The standalone MCP server accepts the same explicit binding at startup:

```sh
node /absolute/path/to/kiln/dist/mcp-server.mjs --requirements /absolute/path/to/host-binding.json
```

In a harness configuration, append `--requirements` and the absolute file path to
the server's `args`. The file is validated before workspace checks or renderer
startup and read once for the session. Editing it later does not change a running
session's policy; start a new session to select a reviewed binding. Each bound
server serves one task/asset lineage. Omit the flag for ordinary neutral authoring.
Tool arguments and source metadata cannot select or replace the host binding.

## Review explicit legacy data conversion

Library callers of `@kiln/engine/qa` now use `collectRequirementsSceneEvidence`
and `runRequirementsSceneQa` with a context from `resolveRequirementsContext`
(`@kiln/engine/requirements`). Pass the collected evidence to the runner and
use `appendRequirementsFinalQa` for exported-artifact checks. Scene-only QA is
not final-GLB acceptance. Reports carry schema version 2 and the policy identity.

The public category aggregator `runDeterministicSceneQa`, its
`DETERMINISTIC_QA_REGISTRY`, and the old `appendFinalGltfQa`, `appendRuntimeCostQa`,
`appendMaterialMetricsQa` and `appendReferenceComparisonQa` wrappers are removed.
There are no callable aliases. Historical implementations remain internal for
comparison fixtures; they are not a supported execution path. Lower-level
measurement helpers and old record types remain available where needed for
explicit inspection and migration. Their availability does not activate old policy.

```sh
kiln migrate intent old-intent.json --out intent-review.json
kiln migrate manifest old-manifest.json --out manifest-review.json
```

These commands produce JSON review records containing the original data, input
byte hash, proposed current requirements, field mapping and unresolved obligations.
Output files are created exclusively; existing inputs and reviews are never
overwritten. Without `--out`, the same report goes to stdout. Exit 3 means review
is required and nothing was activated; exit 1 means invalid input or an I/O failure,
and exit 2 means invalid command arguments. Inputs must be regular UTF-8 JSON files
no larger than 1 MiB. No renderer, model, asset-store write or source execution occurs.

The manifest API is `migrateAssetManifestV1ToRequirements` from
`@kiln/engine/requirements/migration`; the existing intent API is
`migrateAssetIntentV1ToRequirements`. A manifest proposal keeps the old revision and
file hashes, carries non-policy build options as review data, and requires a rebuild.
It is a versioned migration proposal, **not a new saved manifest**. Old QA, preview
and engine claims remain only in the original record. This manifest-only operation
does not inspect artifact files or certify their hashes.

Review output cannot be passed to `--requirements` as a binding. Rule equivalence
is not established by conversion alone. Original GLBs and sources remain readable
throughout; normal execution never invokes the legacy converter.

Each category-rule review names its retained measurements and policy differences.
Scope is reviewed separately, including the old explicit `modularSet` join trigger.
Neutral modular-join coverage remains unavailable; a grid declaration cannot replace
it. Prop review names the historical 8 cm container threshold and scene-dependent
circular advice, and rig review names the changed body-plan trigger. These are
specific review obligations, not automatic compatibility promises. Keep unsupported
requirements visible or deliberately replace policy with a documented host decision.

### Rebuild a legacy revision under reviewed current requirements

```sh
kiln migrate rebuild a_example r_original --requirements host-binding.json --render cpu
```

This is an explicit policy replacement. The host binding must have the legacy asset
ID as its `lineageId`, and its latest history entry must have `source: "migration"`
with an actor and a reason explaining the reviewed policy change. Create it through
`createAssetRequirementsStore().host.bind`, or advance an existing host binding
through `replace`. Review the converter's proposal when selecting the current
requirements. Ordinary authoring does not require this migration workflow.

The command verifies the saved files, evaluates retained source with the current
engine and binding, and saves an immutable child under the same asset ID. It uses
the same evaluation, preview and build-record path as `kiln_save`. The original
revision remains untouched. The new build records the original manifest, canonical
manifest hash, original file hashes, current source hash, field-level policy changes
and explicit replacement of historical category-rule applicability. Old QA remains
provenance; it never becomes current QA. A rebuilt asset can still report
`acceptance: "incomplete"` when current requested checks are unavailable.

Unknown fields, conflicting categories, custom profiles and unsupported or unmatched
build options stop with exit 3 before source execution. Matching supported build
options are retained; selecting a new binding does not silently discard an unknown
option. Build failure exits 1 without a child revision. Exit 0 means a revision was
rebuilt, not that every requested behavior has been certified. The normal restore,
edit and save workflow then uses its current binding and immutable parent history.

Some older manifests never saved a full intent. Supply an explicitly reconstructed
intent only after reviewing the historical brief:

```sh
kiln migrate rebuild a_example r_original --requirements host-binding.json --legacy-intent recovered-intent.json
```

Recovery is recorded as `host-reconstruction`, separately from the untouched original
manifest. It cannot replace an intent already persisted in that manifest. Kiln does
not infer historical authority from source labels or an old QA pass. The pure
manifest converter also accepts `{ legacyIntent }` as its optional second argument.

If a retired helper requires a source repair, pass `--source updated-source.js`.
The new source is explicit, limited to 1 MiB of valid UTF-8, and its hash is recorded;
both source versions remain available in their respective revisions. Invalid input,
failed QA or a manifest exceeding the existing 1 MiB limit cannot create an unreadable
partial revision. This path does not establish automatic equivalence between old
category policies and new requirements; that qualification remains separate.

## Initialize optional model providers asynchronously

`makeKilnModel`, `makeOpenRouterModel`, `modelConsumesSystemPromptCachePoints`,
and `toCachedSystemPrompt` now return promises. Await them before passing a model
or system prompt to Strands. Each factory loads the selected provider adapter;
missing optional providers no longer prevent construction of a different provider.
There is no synchronous fallback factory.

Strands remains optional for CLI/MCP users. Its required peer minimum is now
1.18.0. The OpenRouter adapter is also an optional peer, rather than an ordinary
core dependency. The current offline checks use Strands 1.18.0,
`@openrouter/ai-sdk-provider` 2.10.x and `@ai-sdk/provider` 3.x. Other native
providers require their own SDKs. A missing selected adapter still fails; Kiln
does not substitute another model or provider.

Explicit OpenRouter effort keywords now pass through unchanged. Kiln no longer
lowers high or xhigh to medium based on a generic output-budget heuristic. Set a
suitable output budget for the selected model and inspect actual usage. Native
Anthropic/Bedrock cache-point blocks and OpenRouter's top-level cache directive
remain separate mechanisms.

## Use the native program-reference loop

The public `@kiln/engine/tools` export no longer includes
`createKilnToolRegistry` or `kilnToolRegistry`. Those factories recreated the
retired four-tool workflow. Use `createKilnProgramToolRegistry` for a host-managed
workflow, or `createKilnNativeToolRegistry` with native completion. Both use
`kiln_render` for metrics and images; the standalone `kiln_screenshot` tool is
removed. `kiln_validate` remains the inexpensive syntax-only check. There is no
compatibility alias that recreates the old tool list.

`runKilnAgent` now uses Discovery, source references, edits and review tools from
the same registry as MCP. It calls them directly inside Strands. The native-only
terminal is `kiln_finish({ programRef })`; its definition also lives in the shared
registry. Remove `toolSurface`, `KILN_TOOL_SURFACE`, full embedded API prompt
selection and automatic post-finish grade refinement. Retired selections fail
explicitly. `PIXEL_FORGE_MODEL` is removed; use `KILN_MODEL` or a model argument.

The old `makeKilnTools`, `makeKilnEditTools`, `makeKilnUnifiedTools` and
`makeKilnProgramTools` exports are removed. Embedded hosts use `runKilnAgent`;
custom native harnesses can use `makeKilnNativeTools`. The old grade-refinement
module and thinking A/B runner are retired. Use runtime-cost metrics from the
reviewed artifact and request explicit refinement before selecting its final
revision. Do not re-execute source just to retrieve a post-completion grade.

The category-driven `@kiln/engine/prompt` subpath, `getSystemPrompt`,
`buildUserPrompt` and their full/trimmed/current/unified prompt variants are
removed. They advertised retired tools and injected category-specific generation
rules. There is no fallback or alias. Use `runKilnAgent` for Kiln's native
bootstrap, or build a custom harness over the current registry and Discovery.
`@kiln/engine/prompt-api` remains a pure catalog text formatter; it does not
configure an agent or generate the maintained skills. The old `kiln-glb` skill
drift checks and absent `kiln:gen-skill` command are retired; use `check:skills`
for the maintained `skills/` tree.

The host may supply a `programStore`, requirements binding, evaluator, renderer,
limits and cache context. Refine with either `existingProgramRef` in that retained
store or `existingCode`, which is imported once. The default store lasts for one
invocation. Collection tools are advertised only when the host supplies a library.

The result includes `completion: "finished" | "partial" | "failed"`, the canonical
`programRef` and a retained artifact when evaluation and review succeeded. QA
acceptance stays separate: finishing cannot turn incomplete checks into accepted
requirements. Native completion selects exact evaluated bytes without a final
optimization or source execution. Unknown, unevaluated, evicted or differently
bound references cannot finish. `kiln_finish` must run alone and stops the loop
before another model call, even on the last allowed call.

`signal` and optional `maxDurationMs` cancel the harness and its owned evaluator
and renderer requests. A bounded run can return its last reviewed revision as
partial work with the original failure. It does not promote a later unreviewed
edit. CLI `--max-steps` now supplies the actual shared model-call budget. Partial
CLI runs write `.partial.glb`, source and separately named `.partial` previews,
report the reason, and exit 2. Extensionless or custom GLB output paths receive
an appended `.kiln.js` source path, so source cannot overwrite the GLB.
`generateKilnAsset` returns the same completion and requirements fields. Its
`inLoopViewRenderTimeoutMs` is independent of `viewRenderTimeoutMs`, which applies
to the optional final presentation sheet.

Native runs use Strands' `invoke` limits and cancellation. Optional `limits`
accepts `turns`, `outputTokens`, and `totalTokens`; `stopReason` reports the SDK's
reason separately from Kiln completion. Token limits are checked between turns
and may overshoot by one turn. They are not hard monetary ceilings. Shared
generation call admission remains available for host spending policies. Invalid
explicit model-call budgets now fail instead of silently becoming unlimited.

`knowhow: "skill"` requires a local `skillDir`. Strands' `AgentSkills` plugin
activates instructions on demand; native `kiln_skill_resource` lists and reads
bounded text references snapshotted before model dispatch. No shell or filesystem
tool is needed. Missing, oversized or invalid skills fail at setup. Supplying
`skillDir` with inline mode is an error rather than an ignored configuration.
The programmatic native workflow skill stays outside shared CLI/MCP skills;
workspace setup never installs its finish protocol. One official Google route
has completed generation and both refinements with reviewed artifact and image
evidence. Other live routes and cold installed-package qualification remain
separate. See [native workflow and support limits](runtime.md#optional-native-strands-workflow).

The package version moves with every change that ships, so the version you are moving to
is whatever the [latest release](https://github.com/matthew-kissinger/kiln/releases/latest)
says; see [CHANGELOG.md](../CHANGELOG.md) for what changed between any two.

## Retain the source once

Save the `programRef` returned by a render or source import. Pass that reference to
later read, edit, validation, inspection and animation calls. An edit creates a new
revision; retain its returned reference for subsequent work. There is no global
“current asset.” Existing references remain available after a local server restart.

`kiln_source` reads bounded source; `kiln_edit` applies exact replacements atomically
and normally renders the result. Export source through the CLI instead of asking
the model to transcribe it. [Source storage and limits](programs.md).

## Use the versioned camera format for new integrations

Use `capture.version: "kiln.capture.v1"` for explicit camera positions, part-relative
views, perspective, mixed subjects, separate images and selected animation times.
The legacy preset/angle form keeps its existing defaults. New capture objects
reject unknown fields so a misspelled camera option cannot silently disappear.

CPU and GPU receive the same resolved camera. Read the returned camera and material
fidelity separately: a correct camera does not establish faithful PBR shading.
[Camera fields and examples](cameras.md).

The CLI accepts the same capture object from a JSON file:
`node kiln.mjs render REF --capture cameras.json --views chosen.png`.
Grid output writes that one PNG. With `output: "separate"` it writes one PNG per shot
beside the stem instead, `chosen.shot-01.png`, `chosen.shot-02.png` and so on, and
no sheet; `--json` lists each file with its shot name. This avoids copying image data
from a tool response and reuses the evaluated asset.

The GPU service now preserves HDR values until tone mapping and conversion to
sRGB. Earlier previews could clip highlights despite reporting full-material
rendering. Regenerate comparison images with the updated service; its capture
identity invalidates older cached cells. The legacy beauty-image route also works
again. [Measured display correction](evaluation/results/gpu-display-output.md).

## Replace removed authoring helpers

### Loft winding and warped panels

`loftProfiles` now chooses outward winding from initial section travel relative
to the first section plane. Older descending-section programs may have manually
reversed index triples and normals to compensate for the defect. Review and remove
that specific workaround when rebuilding them; keeping it reverses the corrected
faces again. Preserve the original source and compare regenerated views/CSG output.
Kiln does not guess whether an arbitrary user-authored flip was intentional.

Loft/profile-sweep requests whose corresponding profile edges collapse between
stations now fail with repair advice. Correct the start/order correspondence or
add intermediate stations for an intended twist. Kiln does not guess a new ordering.
This bounded check does not establish global solid validity.

Loft/profile-sweep warped panels now use four triangles around a bilinear midpoint;
planar panels keep two. This corrects diagonal-induced asymmetry on mirrored inputs
and can change surface positions between supplied vertices, normals, triangle
counts, CSG triangulation and asset hashes. Rebuild and review affected sources;
saved GLBs remain readable and unchanged. It does not infer correspondence or prove
that a loft is a valid solid. See the [geometry contract](geometry.md#sweep-a-profile-or-loft-sections).

### Removed names

The sandbox and library exports no longer provide `cloneGeometry`, `cloneMaterial`,
`panelRemapV`, or `validateAsset`. Exact Discovery lookups reject these IDs with
migration guidance. Source validation reports recognized unbound uses as
`REMOVED_HELPER`. Update saved programs and local helper libraries deliberately;
there is no automatic source rewrite or fallback alias.

The render execution gate also rejects these globals before authored statements
run. CLI and MCP return the same closed migration advice; `kiln_validate` gives
the specific name and replacement. Local declarations are resolved by scope, so
a same-named local in an unrelated function cannot hide an obsolete call.
Legitimate local helpers, property names and strings remain allowed. This check
does not establish reachability or temporal-dead-zone correctness.

| Removed call | Explicit replacement |
| --- | --- |
| `cloneGeometry(geo)` | Use `geo` directly to preserve its old sharing behavior. Use `copyGeometry(geo)` when independent vertex buffers are needed. |
| `cloneMaterial(mat)` | Use `mat` directly to preserve sharing. Use `copyMaterial(mat)` before changing material properties; its texture references remain shared. |
| `panelRemapV(geo, vScale, vOffset, uScale, uOffset)` | `remapUV(geo, { scale: [uScale, vScale], offset: [uOffset, vOffset] })`, substituting old omitted defaults explicitly. |
| `validateAsset(root, category)` | Use `countMaterials(root)` for a count, or `materialBudgetAdvisory(root, { maxMaterials })` for an explicit count budget. Use validation and render/QA findings for their respective checks. |

The former clone helpers returned their input unchanged. Replacing every old clone
call with a copy would alter intended sharing and exported deduplication. Review the
use: share a reference when reusing it; make an owned copy before modifying it.

The former UV helper defaulted to `vScale = 0.3`, `vOffset = 0`, `uScale = 1`,
`uOffset = 0`. Therefore `panelRemapV(geo)` becomes
`remapUV(geo, { scale: [1, 0.3], offset: [0, 0] })`. The new helper's own defaults
are identity, `[1, 1]` and `[0, 0]`. It rejects missing UVs instead of silently
returning a clone; unwrap or project first. UV scaling invalidates existing tangents
and reports that loss. [Full mapping and attribute contract](geometry.md#transform-existing-texture-coordinates).

The former advisory always returned `valid: true` and called distinct material
count a draw-call estimate. Neither is an asset validation result. The replacement
returns `{ materialCount, maxMaterials, exceeded, warnings }`; it has no `valid`,
`errors`, or `drawCalls` field. An omitted budget produces `null` for `maxMaterials`
and `exceeded`, with no warning. When preserving a specific old advisory threshold
is intentional, its historical counts were character 8, prop 6, VFX 4, environment
12, architecture 12, vegetation 8, and vehicle 10. Supply that number explicitly;
these historical values are not new defaults or recommended runtime budgets.

## Copy before changing shared geometry

Sandbox primitive geometry is memoized. Use `copyGeometry` or `copyMaterial` before
changing an instance independently.

Subdivision defaults remain compatible. Request `preserveUV: true` when the
subdivided geometry needs its UVs. Boolean property preservation is explicit too;
use the documented option and inspect diagnostics when attributes or provenance
matter. Export now supports material groups and validates supported vertex data.
Unsupported channels produce diagnostics under the default warning policy;
`geometryPolicy: "strict"` rejects them. A strict host policy cannot be weakened by
a request. [Geometry and preservation contracts](geometry.md).

`gearGeo` no longer duplicates tooth-boundary vertices or creates degenerate caps
when the bore is zero. Gear topology and exported bytes consequently change.
Radii keep their absolute defaults: set `boreRadius < rootRadius < tipRadius`
together when making a small gear. The isolated evaluator now returns a bounded
repair hint for this mistake and for undeclared variables.

## Rebuild the local runtime and refresh project setup

Build all runtime entries together with `bun run build:runtime`, or install the
complete new tarball. Do not copy just the MCP bundle: the CLI, evaluator worker,
build manifest, setup script and skills belong to the same installation.

Packaged Node tools now use a terminable subprocess and a bounded disk build cache.
Changing cameras can reuse an evaluated asset; source references and cached builds
have separate lifetimes. Keep exported source before removing `.kiln/programs`.
[Execution, limits and cache controls](runtime.md).

For a new task, generate a fresh external workspace from the new installation. Use
`--repair` for moved installations; it preserves authored files and copied skills
and refuses to overwrite edited configuration. Use `--check` to diagnose stale
runtime/skill copies and `--upgrade` to refresh unchanged managed files together.
Conflicting edits and untracked historical instructions stop the upgrade before
writing; preserve and resolve the named files explicitly. Assets and retained
source remain in place. Restart the harness/MCP session afterward to refresh its
cached schema and context. Antigravity workspaces include `agy.mjs`; use it and the
project's `kiln_workspace` server to avoid selecting an older global plugin.
[Installation and repair](install.md).

## Keep experimental operations explicit

`implicitSurface` is experimental and bounded. General bevel, shell and remeshing
are not stable helpers in this release. Their trials and adoption decisions are
documented in [geometry experiments](experiments/geometry-frontier.md) and the
[additional acceptance cases](experiments/geometry-acceptance.md). Ordinary
JavaScript functions remain the supported way to reuse parameterized parts.

## Assembly roots and physical roof frames

`createLadder` returns `{ root, leftRail, rightRail, rungs }`. The root attaches to
`parent` at the supplied bottom endpoint; rails/rungs are its children with local
placements. Code that traversed the parent's direct children should traverse the
ladder root instead. Existing named rail/rung fields remain. Width is perpendicular
to the endpoint line; use `widthDirection` for an explicit orientation. Parallel
explicit directions fail. Bottom/top semantic frames and sockets support common
assembly discovery and replication.

`createRoofPlanes` now has one constructor across primitive and architecture imports.
The primitive-only half-thickness offset and Euler patch are removed because they
made advertised frames disagree with meshes. Slopes are named `Mesh_<name>_positive`
and `Mesh_<name>_negative`; use `slopes` or semantic roles instead of old A/B names.
Read face frames or quaternions rather than relying on one Euler decomposition.
The outer top eave is Y=0, with thickness inward. `createGableRoof` retains the
separate wall-bearing datum. Re-review existing roof placements after this change.

`createWheelAssembly` returns `geometryChecks` for supplied components. Mismatches
report declared versus measured radius, width and bounds center without resizing
or changing contact metadata. Read these advisories when using custom geometry.
The default torus requires width below diameter; custom tire geometry can represent
wider rollers. These checks establish dimensions, not circularity or physics.

## Explicit UV operations

`boxUnwrap`, `cylinderUnwrap` and `planeUnwrap` are removed. Existing built-in UVs
should normally be retained through direct sharing or `copyGeometry`; the old
box/cylinder wrappers silently kept any UV attribute. For new mappings use
`projectUV` with an explicit projection and frame. `remapUV` transforms existing
coordinates, while `autoUnwrap` generates an atlas. Do not bulk-replace preservation
calls with reprojection: that can change existing texture orientation. Partial
cylindrical arcs need their intended angular range. [Projection contract](geometry.md#generate-uvs-in-an-explicit-frame).

### Roof detail edges

Roof surface layouts now clip staggered shingle boundary tiles and the last row
instead of dropping them or sliding the final row upward. Edge seams/corrugations
stay inside the face. Narrow faces receive actual partial tiles. These corrections
can increase shingle mesh counts; read the returned `cost.meshes` / `cost.triangles`.
Invalid kinds, excessive counts and impossible separate-parent TRS placements now
fail before changing the destination hierarchy.

### Deformation and subdivision shading

Zero-strength deformations now retain authored normals. Smooth UV seams remain
smooth through deformation, while existing hard creases remain split. Tiny
nonzero intervals no longer collapse to zero progress. These correct earlier
shading/scale defects and can change the appearance of affected old source.

Subdivision now uses normalized working coordinates for every path, including the
default position-only weld. Very small meshes no longer collapse under a fixed
world-distance weld. Review extremely close features under the documented relative
resolution. Removed attributes, material groups and morphs have explicit diagnostics.
Apply subdivision before skin binding, and deformation before morph creation;
unsupported requests fail rather than silently damaging animation data.
