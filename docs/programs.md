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
  `OTHER_VALUES_CHANGED`, `NO_MATERIAL` or `PROBE_FAILED`. The other parameters stay at their
  defaults for this check.
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
- **Not yet.** Presets are not written as `KHR_materials_variants`, and only colour is
  carried: sizes, counts and toggles need a rebuild.

`recolorGlb(bytes, bindings, values)` from `@instruktlabs/kiln/param-bindings` sets carried
colours on a saved GLB. For a carried colour its result is byte-identical to a rebuild at
that colour.

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
