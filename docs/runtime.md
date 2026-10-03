# Execution and reuse

Kiln stores source revisions separately from evaluated builds and rendered images. A reference saves the model from repeating source. A compatible build cache saves the engine from evaluating it again.

The packaged local host also supplies optional project, material-library and review capabilities through the shared registry. These add `kiln_project`, `kiln_material` and `kiln_review` to the fourteen base MCP tools; custom embeddings only advertise capabilities they inject. Projects are optional: standalone calls can pin material dependencies directly, and omission does not infer project membership from nearby records. [Projects and Live Review](projects-and-live-review.md) describes explicit selection, shared CLI/MCP/dashboard records, exact-save delivery and portable resource closure. These host facilities do not change the native completion protocol.

Compiled CLI/MCP commands share one Node compatibility check with workspace setup:
20.x from 20.15.0, or 22.2.0 and later. Optional Strands generation requires 22.2.0+;
the CLI checks this before loading its SDK or provider. These floors are separate
from the exact maintainer versions in `toolchain.json`. Direct TypeScript library
imports still need a loader or build system. See [installation](install.md) for
recommended Node releases and the distinction between checkout and package evidence.

## Optional native Strands workflow

Connecting your own agent to Kiln's CLI or MCP server does not start Strands or
load its instructions. Workspace setup installs authoring, refinement
and QA skills for external CLI/MCP harnesses. Those skills contain no Strands terminal protocol.

Explicit built-in generation (`kiln generate` or `runKilnAgent`)
uses the optional Strands harness. It registers a programmatic
`kiln-native-workflow` skill through the SDK's `AgentSkills` plugin. Only its
metadata is initially loaded; the model can activate its recovery/delivery
guidance when useful, without an extra mandatory startup call. It covers retained
source revisions, skill-reference access, failed edits, image review and
`kiln_finish`. Shared Discovery still owns all geometry and material contracts.

The native skill lives in `src/agent/native-workflow.ts`, outside `skills/`. It is
not copied by workspace setup, registered as an MCP tool or advertised by CLI/MCP
Discovery. Do not add it to another harness's skill folder or instructions.
The two workflows have separate entrypoints: external workspace skills are never
activated by the native loader. When a host supplies them through `skillDir`,
`metadata.kiln-workflow: workspace` excludes their instructions and
`metadata.kiln-shared-references` explicitly selects transport-neutral technical
files. Only those files appear under `kiln-modeling-references`; CLI setup,
commands and delivery references are unavailable to that reader. The technical
files remain a single maintained copy.

Custom host-selected skills without the workspace marker still activate normally;
the host owns their suitability for its tools. The built-in skill name,
`kiln-modeling-references` and SDK `skills` tool name are reserved within the
native harness. No skill requires the model to infer which harness it is in.

### Qualification of the built-in agent

The September 23 checkout trial completed generation and two refinements using
the official Google adapter with Gemini 3.8 Flash and high thinking, in 33, 15
and 18 model calls. Retained source/export identities, GPU images, selected
interfaces and protected components were independently reviewed. Earlier failed
and partial provider attempts remain recorded. See the
[native trace audit](reviews/2026-09-23-native-trace-audit.md#trial13-completed-baseline-and-both-refinements).

That trial qualifies this bounded route, not every provider or asset type. Other
adapters have offline contract evidence; their model access, quotas, tool schemas,
image delivery and cache behavior need qualification on the chosen route. Model
call counts are observations, not recommended universal limits. The native skill
and image-history policy do not replace geometry inspection or guarantee that
every edit preserves the brief. The separate native reference context described below has scripted SDK
coverage; the live trial above predates it. Cold native-provider installation remains separate.

Native authoring receives the brief, current tool definitions and explicitly
supplied native skills or selected technical references. The tested clean workspace exposed no repository/gallery
context or shell/filesystem tools. This context boundary is not an OS sandbox.

## CLI render receipts

`kiln render asset.js --out asset.glb --views sheet.png --json` returns one JSON
receipt on stdout. It includes the retained `programRef`, requirements, triangle
count, bounds, QA, exact GLB hash and a `files` list with absolute paths and byte
counts. With `--views`, it also carries the shared MCP render metadata, including
part paths, camera settings and `viewFidelity`, at the same compact detail as
`kiln_render`; `--detail full` keeps every finding and `--detail lean` keeps the
verdict and metrics (`animation --json` takes the same option). PNG and GLB bytes
are not embedded.
Without an image request, it makes no image-fidelity claim. Read the image file
separately; a JSON receipt does not establish visual quality.

Failures return `ok: false`, an error and a nonzero exit code. A retained source
reference remains available after a failed build. `files` lists only completed
writes: if the GLB was exported before a GPU failure, it remains listed while the
failed image destination stays unchanged. The command is not a multi-file transaction.
Human-readable output remains the default. In trusted in-process mode, authored
console diagnostics go to stderr; the default subprocess ignores authored stdout.

A program that throws in the subprocess or isolated evaluator is reported as
`Generated asset execution was rejected.` No message, stack or identifier from the
program crosses the worker boundary. The worker may add one closed cause, and the host
turns it into engine-written advice. Causes include a binding read before its
declaration ran, a `build()` that is missing or returns no Object3D, a `materialRecipe`
override the recipe does not allow, and a TypeError or RangeError. The host still has
the source it sent. `kiln_render`, `kiln_inspect`, `kiln_view_interior`,
`kiln_screenshot_animation` and the CLI parse that source and append `Source check:`
with up to three codes and lines that `kiln_validate` reports for it. Examples are
`TEMPORAL_DEAD_ZONE`, `MATERIAL_RECIPE_OVERRIDE`, `UNSAFE_GLOBAL_ACCESS` and
`SYNTAX_ERROR`. An unrecognised exception stays generic: the sentence continues with a
fixed engine-owned paragraph that says no message crosses the sandbox, that values are
read with `kiln_inspect` on a rendered program rather than a thrown `Error`, and that
`kiln_validate` names the line (`EXECUTION_REJECTED_ADVICE` in
`src/evaluator/authoring-diagnostic.ts`).

## Animation measurements

CLI `animation --json` and `kiln_screenshot_animation` return `poseBounds` alongside
the images. Each entry records `phase`, `timeSeconds`, and `scene: { min, max }`
in world metres. When a shot selects a subject, `subject` supplies its world bounds
as well. Measurements use the posed drawable geometry before camera isolation;
they are independent of camera framing and CPU/GPU material fidelity. Empty
drawable geometry has zero bounds, following the renderer's existing convention.

Compare the requested ground plane or travel envelope with these measurements.
They cover only the returned phases, not motion between them, and do not certify
contacts, collision freedom or a physically working mechanism. A satisfactory rest
pose can still put tread, feet or another protrusion below the ground during motion.

## Local defaults

The packaged Node CLI and MCP server evaluate programs in a subprocess. Each request has a 60-second deadline, a 512 MiB V8 old-space heap limit, a 16 MiB GLB limit and a 32 MiB evaluator-response limit. The heap cap does not bound native allocations or total process memory. A process is terminable; it is not a complete security sandbox. MCP cancellation reaches the worker, and cancelling one request does not cancel another request's build.

Use `kiln_discover({ capabilities: true })` or `node kiln.mjs discover --capabilities --json` to inspect the actual host. Send capabilities alone; search filters belong to separate Discovery calls. The library's default trusted evaluator runs in process and cannot interrupt synchronous code. Host-injected evaluators can have different limits; absent host metadata is reported as unspecified.

| Environment variable | Supported values |
| --- | --- |
| `KILN_EVALUATOR_MODE` | `subprocess` (local default), `in-process`, or the separately configured `isolated` transport |
| `KILN_EVALUATOR_TIMEOUT_MS` | 1–120,000; default 60,000 |
| `KILN_EVALUATOR_HEAP_MB` | Node subprocess only, 64–4,096; default 512 |
| `KILN_BUILD_CACHE` | `disk` (packaged default), `memory`, or `off` |
| `KILN_BUILD_CACHE_MB` | Disk artifact budget, 0–1,024; default 128 |
| `KILN_BUILD_CACHE_DIR` | Optional disk-cache directory |
| `KILN_GEOMETRY_POLICY` | `warn` (default) or `strict`; strict rejects unsupported export attributes and cannot be weakened by a tool request |
| `KILN_RESULT_DETAIL` | `compact` (default) or `lean`: the result detail of the review tools when a call names none; `full` stays per call. A generated Antigravity workspace sets `lean` in its server entry (`.agents/mcp_config.json`), the one harness where lean won both measures of the readiness cycle; the other harnesses' entries set nothing |

Advanced geometry callbacks also have operation-specific input limits. Those checks do not replace the process deadline: a callback that never returns cannot check its own evaluation counter. Capture pixels and PNG payloads have independent host limits described in [cameras](cameras.md).

### Bake defaults

The rigid-group `full` contract and `rigid-v1` rebuild policy below describe the
unreleased alignment candidate planned for 0.11. They are not implemented by the
downloadable 0.10.0 package; see the [migration notes](migration.md#unreleased-changes-planned-for-011).

`KILN_BAKE_OPTIMIZE` and `KILN_BAKE_INSTANCE` choose the bake passes for a render that does not pass `optimize` or `instance`; a value the call passes always wins.

| Environment variable | Supported values |
| --- | --- |
| `KILN_BAKE_OPTIMIZE` | `off` (default), `auto`, `palette` or `full`; any other value means `off`. `palette` merges flat-colour materials into one palette material and texture; `auto` does so only for an asset with at least four distinct materials. `full` also merges compatible primitives within rigid groups, preserving animation, joint, semantic, visibility and LOD boundaries |
| `KILN_BAKE_INSTANCE` | `auto` (default), `off` or `on`; any other value means `auto`. `on` batches a mesh shared by five or more nodes with `EXT_mesh_gpu_instancing` and `auto` does so only for `role: 'fill'` assets; neither batches an animated or skinned asset, or one with `Joint_` pivots, LOD chains, or nodes that carry extras or visibility |

The MCP and CLI tools pin `optimize: 'off'` for every render, inspection and save, so `KILN_BAKE_OPTIMIZE` does not change a tool's GLB; they leave `instance` to the host, so `KILN_BAKE_INSTANCE` does. Library calls that omit `optimize` take the variable: `renderGLB` in process, `renderSceneToGLB` (including the review copies some tool views are rendered from), `renderCodeViewGrid` and `rasterizeComposedScene`. The library's own subprocess mode does not pass either variable to its worker. `node kiln.mjs asset ASSET_ID REVISION --rebuild --out rebuilt.glb` replays the `optimize` and `instance` the saved manifest recorded, whatever the variables say. Both variables are part of the local build-cache key.

Full mode's rigid-merge pass retains every node name, parent and transform. Geometry on a protected
boundary stays there; other named mesh nodes can become empty or hold their group's
merged geometry. Consumers that require geometry attached to each ordinary named
part should use `optimize: 'off'` or `'palette'` with `instance: 'off'`: the separate
GPU-instancing pass runs first and can remove named instance nodes. A host can
disable that pass with `KILN_BAKE_INSTANCE=off`. Composition placement wrappers are protected
automatically. Transparent, skinned, morphing and other incompatible primitives stay
separate. Shared geometry is copied only within 4 KiB per saved draw, and merged
buckets split at 65,534 vertices. The optimization summary reports locks and rejected
buckets; these are geometry results, not GPU performance or appearance acceptance.

New full-mode builds record `optimizationPipeline: 'rigid-v1'`. An older saved
revision with unversioned `full` options cannot use the new algorithm as an exact
rebuild: use its original pinned engine, or explicitly author and save a new child
revision. Reading and exporting the original saved GLB still work. Other saved modes
retain their replay behavior.

## What a build identity covers

Two hashes identify a local Kiln and they answer different questions. The **build
identity** names the dist bundles built from one engine source (`dist/build.json`);
`.kiln/workspace.json` records it as `buildIdentity` (workspaces created before 0.9
called it `runtimeIdentity`) and discovery reports it as `execution.buildIdentity`.
The **installed runtime identity** also covers the installed dependency closure and the
Node version, platform and architecture that ran it; discovery reports it as
`execution.runtimeIdentity` and saves record it as `build.engine`. Compare
`buildIdentity` with the workspace manifest to confirm the server runs the build the
workspace was set up against, and `build.engine` with `execution.runtimeIdentity` to
tie a saved revision to the host that produced it.

Packaged Node subprocess saves and migration rebuilds record the installed runtime
identity in `build.engine` and `localExecution.runtimeIdentity`, independently of
`KILN_BUILD_CACHE=disk|memory|off` or `cacheEvaluations: false`. Disk reuse checks the
identity at host startup. Memory, off and host-disabled reuse defer that scan until
the first save or migration needs provenance; ordinary reads and disposable renders
do not trigger it. The host context retains one promise/result, including a failure,
so concurrent or repeated saves do not rescan the installation.

Kiln checks the packaged worker bytes against its build manifest, then fingerprints
the actual installed dependency code and data, including WASM and native assets.
That identity includes the engine build and Node/platform/architecture; the cache
key additionally includes evaluation policy and requested build options. A dependency
version range or lockfile alone does not identify an npm installation.

An absent transitive `peerDependencies` entry is fingerprinted as `peer-absent`,
whether required or optional. An absent `optionalDependencies` entry is separately
recorded as `optional-absent`. Present packages contribute their installed bytes,
so installing a previously absent peer changes the identity. Thus `--omit=peer`
installations retain verified provenance when the remaining closure is identifiable.
Missing regular dependencies, malformed installed packages and other unidentified
inputs still prevent verification. The engine's own optional generation peers stay
outside the worker closure.

An unverifiable installation keeps `build.engine: "source-development:unverified"`
and exposes the failure in `localExecution.cacheReason`, including with memory or
off policies. Disk reuse then falls back to process memory; disabled reuse stays
disabled. In-process, isolated, Bun and source-development execution do not claim
the packaged Node worker's identity and retain the unverified label. Hosts must
restart after changing an installation while it is running. Programs intended for
reuse must be deterministic; source that reads ambient time or external state
cannot promise reproducible output. Function-bearing material resolvers bypass
generic caching unless encapsulated by a host evaluator with a complete dependency
identity.

The cache bypasses known ambient time and random APIs, including `Date`, `performance`, `crypto`, `Math.random` and Three.js random helpers. This conservative source check is not a proof that arbitrary JavaScript is pure. Prefer an explicit seed and ordinary deterministic functions when reproducible revisions matter.

`buildCache.hit` reports a completed build reuse. The CLI prints `build reused` or `build created`. Camera changes reuse the same compatible GLB. Edits, changed build options and changed runtime identities produce different keys. Simultaneous requests without cancellation can share a build; cancellable misses own independent workers.

## Storage lifetime

The local cache defaults to `cache/builds` beside the source-store directory, normally `.kiln/cache/builds`. Its byte budget evicts disposable artifacts; it does not evict `.kiln/programs`. Corrupt cache records become misses. The quota concerns retained artifact records, not all temporary files or total memory used while building.

Source snapshots are append-only. `capabilities:true` reports their count and UTF-8 bytes when the host supports store statistics; counting files is not an integrity scan. Export accepted `.kiln.js` revisions before deleting a source store. See [source revisions](programs.md).

Image cells have a separate bounded memory cache. Their keys cover exact artifact/derivative bytes, resolved cameras, dimensions, presentation settings and renderer identity. CPU and GPU entries stay separate. GPU caching requires verified camera/material/artifact receipts and a current service identity; a restart or renderer update invalidates reuse. [Camera and renderer receipts](cameras.md).
