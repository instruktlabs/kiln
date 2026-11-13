# Source revisions

Kiln stores the program so the model does not have to repeat it in every tool call.
This is independent of the conversation or MCP connection.

Pass `code` once to `kiln_validate` or `kiln_render`. Both return a `programRef`, even
when the draft fails. Use it for later rendering, validation, inspection, animation
and interior views. `kiln_source` reads the source; `kiln_edit` changes it. From a
shell, `kiln validate <program.js|ref>` runs the same `kiln_validate` check, prints the
`programRef` and exits 1 when the source is invalid; `--json` prints the tool result.

Copy the returned reference exactly. Built-in stores return compact handles such as
`p_7c94a132b8e0`, so the model need not repeat a full hash. A handle always identifies
one source revision in its store; it never moves to a newer draft. Full
`sha256:<64 lowercase hex characters>` references are still accepted.

```js
kiln_source({ programRef, query: 'shelfHeight', limit: 1200 })
kiln_edit({ programRef, edits: [
  { oldString: 'shelfHeight = 0.2', newString: 'shelfHeight = 0.35' }
] })
```

An edit returns a new `programRef`, `parentRef`, a diff and rendered views. Use the
new reference for the next call. The original remains unchanged. Two edits can branch
from the same base without overwriting each other. Mutable aliases are not implemented.

Reference-based edit replies omit source by default; `includeCode: true` requests it.
Legacy callers may pass `code` and receive full updated source by default. Supply
exactly one of `code` or `programRef`.

## Source reads

`kiln_source` is read-only and returns exact text without line-number prefixes.

| Field | Meaning |
| --- | --- |
| `offset` | Starting UTF-16 character offset; default 0. |
| `limit` | Maximum characters returned; default 8,000, maximum 16,000. |
| `query` | Optional literal search at or after `offset`. |
| `nextOffset` | Start of the next page, or null at the end. |
| `matchOffset` | Query location; add one to find a later occurrence. |

Search returns surrounding source. A missing match returns `found: false` and empty
code. Read enough context to understand dependencies before editing.

## Sandbox globals

A program is a script, not a module. It defines `const meta = { name }`, a
`function build()` (or `async function build()`) that returns the root from
`createRoot`, and optionally `animate(root)`, which returns an array of clips. It runs
in strict mode with these globals and nothing to import:

- Every Kiln helper in the [Discovery](tools.md) catalog, such as `createRoot`,
  `createPart`, `boxGeo`, `gameMaterial` and `defineBudget`. Use `kiln discover` or
  `kiln_discover` for the complete list and each helper's contract.
- `THREE`, the three.js namespace, for direct geometry and maths. `DataTexture`,
  `ShaderMaterial` and `RawShaderMaterial` are refused; use the material and texture
  helpers. The namespace cannot be aliased or read with computed keys.
- `Math`, and `console` for diagnostics, which the host captures.
- Standard JavaScript built-ins such as `Array`, `Object`, `JSON`, `Map`, `Set` and
  `Promise`.

Host capabilities are refused before the program runs: `import`, `export` and dynamic
`import()`, `eval`, `Function` and constructor chains, `globalThis`, `global`,
`process`, `require`, `module`, `Reflect`, `fetch`, `XMLHttpRequest`, `WebSocket`, the
browser globals (`window`, `self`, `document`, `navigator`, `location`), `Bun` and
`Deno`, and `this` outside a method. This is a safety net, not process isolation.
`kiln validate` reports the first refused use with its line.

## Declared parameters

A program may declare the values a host can change without editing source. Call
`defineParams` once, in top-level code, and build from the object it returns:

```js
const P = defineParams({
  length: { type: 'range', default: 1.6, min: 1.0, max: 2.4, step: 0.05, unit: 'm' },
  slats: { type: 'int', default: 5, min: 3, max: 8 },
  arms: { type: 'toggle', default: true },
  wood: { type: 'color', default: '#8a5a33' },
  style: { type: 'choice', default: 'plain', options: ['plain', 'scroll'] },
  seed: { type: 'seed', default: 7 },
}, { presets: { long: { length: 2.4, slats: 8 } } });
```

Values resolve in order: each default, then the preset the host named, then the values
the host passed. With no host values the program builds exactly as it would with its
defaults written as literals, so declaring parameters does not change an asset's bytes.
`step` is a hint for a slider unless `snap: true`, which refuses values off the step.
Every parameter takes an optional `label` and `describe`.

A host passes values through the render library:

```ts
import { renderGLB } from '@instruktlabs/kiln/render';

const result = await renderGLB(code, { params: { preset: 'long', values: { arms: false } } });
result.params; // { version: 'kiln.params.v1', declaration, preset, values }
```

Nothing is clamped. A spec that breaks its own rules, a second call, or a call from
inside `build()` is a `PARAMS_CONTRACT` build error. A host value that names no declared
parameter or preset, has the wrong type, is out of range, is off a snapped step or is not
an option is `PARAMS_VALUE`, as are values for a program that declares no parameters. An
evaluator worker reports only the code; `checkParamValues(declaration, input)` from
`@instruktlabs/kiln/params` names each refused value, so a host that holds the declaration can check
before it builds.

Host values are part of the build-cache key. A GLB does not re-run its program, so another
value is another build, with one exception: [a colour that is one material value](#colours-a-glb-carries).

### Building and checking variants

`kiln_render` and `kiln render` build a variant for review, and `kiln_export` returns a
variant's GLB:

```js
kiln_render({ programRef, params: { preset: 'long', values: { arms: false } } })
kiln_render({ programRef, params: { sweep: true } })
kiln_export({ programRef, params: { values: { slats: 8 } } })
kiln_export({ assetId, revisionId, params: { preset: 'long' } })
```

```sh
node kiln.mjs render bench.kiln.js --preset long --param arms=false --out long.glb
node kiln.mjs render bench.kiln.js --sweep
```

- Results report `params: { preset?, values }` with every value the build used. A refused
  call builds nothing and names each value in `paramIssues` with what its parameter allows.
- **A variant is derived, never saved.** `kiln_save` and `kiln_finish` keep the default build,
  and a reviewed variant reports `exactArtifact: false`. The saved manifest records the
  declaration as `build.params`.
- **Sweep** builds the defaults, then each parameter alone at its minimum and maximum, its
  other toggle state or each other option, then every preset: at most 32 builds. Each point
  reports whether it built, triangles, draws, bounding size, QA acceptance and budget status,
  without images. Colours and seeds are not swept and combinations are not built; `notSwept`
  names what was left out. The CLI exits 1 when a point fails to build.
- `kiln_export` with `params` builds from source and returns a
  `kiln://programs/{program}/{sha256}/asset.glb?params=...` resource pinned to those bytes.
  For a saved revision it builds that revision's source under the current engine, saves
  nothing, and reports `defaultBuildMatchesSaved`: false means this engine builds the source
  to other bytes than the saved GLB. The runtime profile and `kiln_export_to` deliver the
  saved GLB only.

### Colours a GLB carries

glTF multiplies a material's base colour factor into its texture and vertex colours. A `color`
parameter that is exactly that factor can therefore be changed in the file, with no rebuild.

- **How it is decided.** `kiln_save` and the sweep build the program once more per colour
  parameter, at a test colour, and compare with the default build. When nothing differs but
  base colour factors, and each one equals the parameter's colour, the colour is `factor` and
  names its materials. Otherwise it is `rebuild`, with a reason: `DATA_CHANGED` (baked into
  mesh, vertex-colour or texture data), `DERIVED_COLOR` (computed from the parameter),
  `OTHER_VALUES_CHANGED`, `NO_MATERIAL` or `PROBE_FAILED`. A `DATA_CHANGED` detail also names
  the first data that differs, such as the vertex colours of one part, when the two builds line
  up well enough to tell. The other parameters stay at their defaults for this check.
- **Where it is recorded.** The sweep reports `sweep.colors`. A saved manifest records
  `build.paramBindings` (`kiln.param-bindings.v1`). The saved GLB itself is still the plain
  default build, byte for byte.
- **In an exported file.** The runtime profile marks each carrying material with
  `extras.kilnParamV1: { name, type: "color" }` and lists them under `params.colors` in the
  metadata sidecar. In three.js the tag arrives as `material.userData.kilnParamV1`:

  ```js
  gltf.scene.traverse((object) => {
    const material = object.material;
    if (material?.userData.kilnParamV1?.name === 'paint') material.color.set('#2f6fa8');
  });
  ```

  Other engines keep glTF extras as custom properties to different degrees; that support is
  not qualified here. A named material can always be found by its name.
- **To author one.** Give the colour its own named material, pass the parameter to it
  unchanged, and keep surface detail in neutral greys so the colour tints it. A factor tints
  a coloured texture; it cannot replace colours painted into pixels.

`recolorGlb(bytes, bindings, values)` from `@instruktlabs/kiln/param-bindings` sets carried
colours on a saved GLB. For a carried colour its result is byte-identical to a rebuild at
that colour.

### Options and presets a GLB carries

A `toggle` or `choice` that only shows and hides parts can also be changed in the file, as
`KHR_node_visibility` on the nodes it controls
([what destinations do with it](engine-handoff.md#animated-assets-and-visibility-tested-destination-limits)).

- **To author one.** Always build the part and set its `visible` from the parameter:

  ```js
  const arms = createPart('Arms', armGeo, wood, { parent: root });
  arms.visible = P.arms;
  ```

  A part built only when the option is on (`if (P.arms) createPart(...)`) changes the mesh
  data, so that option needs a rebuild. Give each parameter its own node: a node that two
  parameters hide is carried by neither.
- **How it is decided.** `kiln_save` and the sweep build the program once per other value
  (one build for a toggle, one per further option of a choice) and compare with the default
  build. When nothing differs but which nodes are hidden, the parameter is `visibility` and
  lists each node with `visibleWhen`, the values that show it. Otherwise it is `rebuild` with a
  reason: `DATA_CHANGED`, `OTHER_VALUES_CHANGED`, `NO_NODE`, `SHARED_NODE`, `PROBE_FAILED` or
  `NOT_CLASSIFIED`. A `DATA_CHANGED` detail names the first data that differs when the builds
  line up; a part built only when the option is on keeps the general advice. A save spends at
  most 16 extra builds on classifying colours and options and marks the rest
  `NOT_CLASSIFIED`; a sweep classifies all of them.
- **Where it is recorded.** The sweep reports `sweep.switches`; the manifest records them in
  `build.paramBindings.switches`. The saved GLB is still the default build: a part hidden at
  the defaults is in it, hidden.
- **In an exported file.** The runtime profile marks each node with
  `extras.kilnParamV1: { name, type: "toggle" | "choice", visibleWhen: [...] }` and lists
  them under `params.switches` in the sidecar. To set a value, show a tagged node when
  `visibleWhen` includes the value and hide it otherwise. three.js r187's loader does not
  read `KHR_node_visibility` itself, so apply the default from the tags too:

  ```js
  const values = { arms: false, style: 'scroll' };
  gltf.scene.traverse((object) => {
    const tag = object.userData.kilnParamV1;
    if (tag?.visibleWhen) object.visible = tag.visibleWhen.includes(values[tag.name]);
  });
  ```

  A draw reduction (`draws: 'minimal'`) does not batch a file with tagged or hidden nodes, so
  the switches stay usable and the draw count stays as saved. A parameter a derived file
  lost is named in `params.dropped`.
- **Presets.** A preset that only sets carried colours is written by the runtime profile as
  one `KHR_materials_variants` entry named after the preset, and listed under
  `params.presets` with its variant index. Each bound material gets a copy at the preset's
  colour (`paint@blue`), mapped on every primitive that draws with it; the default materials
  are unchanged, so a loader without the extension shows the default build. A preset that
  also changes a size, a count, an option or a rebuild-only colour is not written. A file
  that already has material variants keeps them and gets none from presets.
- **Not carried.** Seeds need a rebuild. Sizes and counts (`range`, `int`) need one unless
  the export is asked to carry them ([sizes](#sizes-a-glb-carries)).

`applyCarriedParams(bytes, bindings, values)` from `@instruktlabs/kiln/param-bindings` sets
carried colours and options on a saved GLB. Its result holds what a rebuild at those values
holds: the same binary data and the same JSON values.

### Sizes a GLB carries

A `range` or `int` that only moves vertices and nodes, each along a straight line, can be
written into a runtime file as morph targets. It is opt-in and happens at export:

```bash
kiln export <id> <revision> --format glb --profile runtime --carry-shapes --out cabinet.glb
```

The library form is `exportAssetGlb(record, { profile: 'runtime', paramBuilds })`, where
`paramBuilds(values)` returns a build of the source at those values. `kiln_export` does not
take the option.

- **How it is decided.** By building, never by reading source. For each `range` and `int`
  the export builds the saved source at the minimum and the maximum, and at one value halfway
  between the default and each end: up to four builds per parameter, the others at their
  defaults. The parameter is carried when the end builds have the default build's parts,
  vertex counts, indices, texture coordinates and materials, differ from it only in
  positions, normals, tangents and node transforms, and each halfway build lies on the
  straight line within 0.5 mm (a thousandth of the asset's size if that is smaller).
  Otherwise `params.shapes.<name>` in the sidecar is `rebuild` with a reason:
  `STRUCTURE_CHANGED` (a count that adds parts, a vertex count that changes), `DATA_CHANGED`
  (its detail names the first data that differs, such as the texture coordinates of one part),
  `HAS_MORPH_TARGETS` (the asset has its own), `NOT_LINEAR` (with the measured distance),
  `NO_CHANGE` or `PROBE_FAILED`.
- **What is written.** The default build stays the base mesh. Each end is one morph target
  named `<name>=<value>` on every mesh it moves, and one animation `kiln.param.<name>` keys
  the target weights and the node translations, rotations and scales. Time 0 is the minimum,
  time 1 the maximum, and `params.shapes.<name>.keys` lists the time of each built value,
  the default included. The saved revision is unchanged.
- **To set a value.** Set the clip to the time for that value and hold it there. In three.js
  clamp the action: a looping action wraps time 1 back to the minimum.

  ```js
  const shape = metadata.params.shapes.width; // keys: [{ time, value }, ...] ascending
  const timeFor = (keys, value) => {
    const i = Math.max(1, keys.findIndex((key) => key.value >= value));
    const [a, b] = [keys[i - 1], keys[i]];
    return a.time + ((value - a.value) / (b.value - a.value)) * (b.time - a.time);
  };
  const action = mixer.clipAction(gltf.animations[shape.animation]);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(timeFor(shape.keys, 1.1));
  ```

- **Limits.** The plain runtime profile only: `--target three` and `--draws minimal` refuse
  it, because a derivation would have to re-derive every target with its mesh. The GLB is
  re-serialized and grows by the targets (the test cabinet below: 11,108 to 19,344 bytes).
  Each parameter is judged with the others at their defaults; two carried sizes moved
  together add their deltas, which is exact only where they do not interact.
- **What the sweep says first.** `kiln_render` with `params: { sweep: true }` (CLI:
  `kiln render <program> --sweep`) reports `sweep.shapes.<name>` for each `range` and `int`:
  `morph` with the measured `gap` in metres when the export would carry it, or `rebuild` with
  the same reasons. It decides the same way from the same builds and writes nothing. The
  sweep already builds each end, so this costs up to two more builds per parameter.
- **Tested importers (2026-11-12).** A cabinet with a carried `width` (0.6 to 1.4 m), a
  `doors` toggle and a `blue` preset was loaded by three.js r187's `GLTFLoader` and imported
  headless into Blender 5.2.0 LTS. Both read the clip, the named targets (shape keys in
  Blender) and the `blue` variant, and both measured 0.6, 0.8, 1.1 and 1.4 m wide with the
  clip set to those values. Blender leaves the clip active at frame 1 after import, so the
  cabinet opens 0.633 m wide, not at its 0.8 m default. Neither importer hides a
  `KHR_node_visibility` node by itself. Unity and Unreal were not tested.

### Parameters in the local viewer

`kiln view` shows a Parameters panel for a saved revision whose manifest records a
declaration: a slider for each `range` and `int`, a checkbox, colour picker, list or number
field for the other types, and a button for each preset.

- Opening a revision loads its saved GLB and runs nothing. The controls stay off until you
  choose **Rebuild at other values** for that asset, because a rebuild runs the revision's
  saved source in the local evaluator. Do that only for source you trust; an imported asset's
  source was written by someone else.
- A colour the GLB carries is always on, for any revision or opened file: the viewer sets it
  on the saved bytes in the browser, runs nothing, and follows the colour picker. Measured
  on the 384-triangle floor module, a change showed in about 0.2 s.
- Any other change rebuilds after you stop moving the control, keeps the camera where it is,
  and labels the view as a variant. **Defaults** shows the saved GLB again. **Download this
  variant** saves the built GLB as a file; nothing is added to the library.
- It is a rebuild, not a live deformation. Measured on this project's host with two small
  assets (108 and 384 triangles), a value not built before took about 0.6 s and a repeated
  value about 20 ms. Larger assets take as long as their build.
- `kiln view --no-variants` starts the viewer without the builder; the panel then lists the
  parameters and cannot change them. A file opened in the browser only, and the public
  gallery, have no builder either.
- On the CLI, `--param name=value` reads `true`, `false` and numbers as such; wrap a text
  value that looks like one in double quotes, such as `--param style='"3"'`.

## Files and persistence

From a generated workspace, import and export without model transcription:

```sh
node kiln.mjs source asset.kiln.js
node kiln.mjs source RETURNED_REF --out revised.kiln.js
node kiln.mjs render RETURNED_REF --out revised.glb --views revised.png
```

Replace `RETURNED_REF` with the reference returned for the revision you want to save.
`source --json` prints the `kiln_source` result for the file's new reference or the
given one: one page, the first 8,000 characters unless `--offset`, `--limit` or `--query`
say otherwise; continue from `nextOffset`. With `--out`, `--json` prints
`{ ok, programRef, files }` naming the written file. Failures print `ok: false` and an error.
Source export refuses to overwrite an existing file. The saved JavaScript is portable;
a reference needs a store containing that source.

The canonical SHA-256 hashes the exact UTF-8 source, including whitespace and line
endings. A short handle maps to that full hash. Handles start with `p_` and 12 lowercase
hex characters; a collision extends a new handle by four characters at a time, up to
64. Existing mappings remain unchanged. Use the returned handle rather than shortening
a hash yourself.

Local CLI and MCP processes default to `.kiln/programs` in their working directory. The setup
command configures the same absolute store path for both; `KILN_PROGRAM_STORE` overrides it.
Keep the whole store, including its reference mappings, to preserve short handles
across CLI calls and server restarts. A handle from another store is not available here;
the error says so and names the next call: send the source again with `kiln_validate` or
`kiln_render` and use the returned reference.

Local storage is append-only, limited to 1 MiB per program. There is no automatic
eviction or total disk quota. Export accepted work before deleting an old workspace's
store; its references then stop resolving. Source is integrity-checked on read. A hash
identifies content and does not authorize access in a hosted service.

One evaluator request carries at most 512 KiB of source, which is lower than the store's
1 MiB on purpose: a stored revision is read, imported and exported without ever being
evaluated, and trusted in-process evaluation builds no request at all. So the two limits
leave a range a program can be saved in but not built in. `kiln_discover` reports both as
`source.maxBytes` and `source.transportEvaluatorMaxBytes`. A host that transports source
reports a program over the transport limit as a warning from `kiln_validate` and from a
`render: false` edit, and refuses the build naming both byte counts — build geometry inside
`build()` from the helpers instead of embedding a literal vertex buffer, round the literals
you must keep, or bind texture bytes as approved material resources.

## Failure handling

A failed replacement leaves the base unchanged. An edit may apply successfully while
its render fails: `ok` describes editing, `render.ok` describes building. The failed
draft has a reference for repair. Reference-mode diffs are limited to 8,000 characters
and set `diffTruncated`; use source reads for the rest.

## Library use

`createKilnProgramToolRegistry(context)` is exported from `@instruktlabs/kiln/tools` and returns the
same twelve definitions used by MCP. Inject `context.programStore`, with asynchronous
`put(code)` and `get(programRef)` methods, to share revisions between instances. Without
it, one registry instance keeps an in-memory store bounded to 64 MiB. Keep that instance
for the run. The legacy registry and internal working-buffer surface remain separate.

`ProgramStore.put` continues to return the canonical SHA-256 reference. Built-in stores
also provide `shortRef`; the tool and CLI layers use it to present a compact `programRef`.
Custom stores can implement this optional method or keep returning canonical references.
Keep source and artifact hashes in provenance records; a compact handle does not replace
those integrity checks.

## Why separate read and edit?

A source read should have no edit or render side effect. Editing includes rendering
because reviewing a change is the common next action. Explicit revisions avoid a
hidden current asset; bounded reads avoid fetching an entire program for one constant.

The current MCP specification recommends explicit handles for application state.
See its [release explanation](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
and [transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
Bounded reads and combined edit/render follow the workflow-oriented approach in
[Anthropic's tool-design guidance](https://www.anthropic.com/engineering/writing-tools-for-agents).
These support the design; they do not prove one interface is best for every model.

Source references avoid sending the program again. Build caching separately avoids
running unchanged source again. The public tool registry reuses successful builds
when the source, evaluator identity and evaluation options match. Source that reads
`Math.random`, `Date` or other ambient inputs is never reused; draw from the
`seededRandom(seed)` sandbox global instead, whose `fork(label)` streams let a variant
replay a parent's draws. Packaged Node CLI/MCP runs can reuse builds on disk when
the runtime bundle and installed dependency files have a verifiable identity. Source-development runs use a process-local cache.

Camera changes can reuse geometry, but each image also depends on its renderer,
camera and capture settings. A source reference alone never identifies a rendered
image. Cache receipts describe reuse; they are not evidence of visual quality.
