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
every edit preserves the brief. The v0.8 reference-separation change has scripted SDK coverage; the live trial
above predates that change. Cold native-provider installation remains separate.

Native authoring receives the brief, current tool definitions and explicitly
supplied native skills or selected technical references. The tested clean workspace exposed no repository/gallery
context or shell/filesystem tools. This context boundary is not an OS sandbox.

## CLI render receipts

`kiln render asset.js --out asset.glb --views sheet.png --json` returns one JSON
receipt on stdout. It includes the retained `programRef`, requirements, triangle
count, bounds, QA, exact GLB hash and a `files` list with absolute paths and byte
counts. With `--views`, it also carries the shared MCP render metadata, including
part paths, camera settings and `viewFidelity`. PNG and GLB bytes are not embedded.
Without an image request, it makes no image-fidelity claim. Read the image file
separately; a JSON receipt does not establish visual quality.

Failures return `ok: false`, an error and a nonzero exit code. A retained source
reference remains available after a failed build. `files` lists only completed
writes: if the GLB was exported before a GPU failure, it remains listed while the
failed image destination stays unchanged. The command is not a multi-file transaction.
Human-readable output remains the default. In trusted in-process mode, authored
console diagnostics go to stderr; the default subprocess ignores authored stdout.

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

Advanced geometry callbacks also have operation-specific input limits. Those checks do not replace the process deadline: a callback that never returns cannot check its own evaluation counter. Capture pixels and PNG payloads have independent host limits described in [cameras](cameras.md).

## What a build identity covers

Disk reuse requires a verified packaged Node worker. At host startup Kiln checks the worker bytes against its build manifest, then fingerprints the actual installed dependency code and data, including WASM and native assets. The identity also includes the engine build, Node/platform/architecture, evaluation policy and requested build options. A dependency version range or lockfile alone does not identify an npm installation.

Unknown dependencies, an unverifiable installation or unsupported execution modes fall back to process memory. Hosts must restart after changing an installation while it is running. Programs intended for reuse must be deterministic; source that reads ambient time or external state cannot promise reproducible output. Function-bearing material resolvers bypass generic caching unless encapsulated by a host evaluator with a complete dependency identity.

The cache bypasses known ambient time and random APIs, including `Date`, `performance`, `crypto`, `Math.random` and Three.js random helpers. This conservative source check is not a proof that arbitrary JavaScript is pure. Prefer an explicit seed and ordinary deterministic functions when reproducible revisions matter.

`buildCache.hit` reports a completed build reuse. The CLI prints `build reused` or `build created`. Camera changes reuse the same compatible GLB. Edits, changed build options and changed runtime identities produce different keys. Simultaneous requests without cancellation can share a build; cancellable misses own independent workers.

## Storage lifetime

The local cache defaults to `cache/builds` beside the source-store directory, normally `.kiln/cache/builds`. Its byte budget evicts disposable artifacts; it does not evict `.kiln/programs`. Corrupt cache records become misses. The quota concerns retained artifact records, not all temporary files or total memory used while building.

Source snapshots are append-only. `capabilities:true` reports their count and UTF-8 bytes when the host supports store statistics; counting files is not an integrity scan. Export accepted `.kiln.js` revisions before deleting a source store. See [source revisions](programs.md).

Image cells have a separate bounded memory cache. Their keys cover exact artifact/derivative bytes, resolved cameras, dimensions, presentation settings and renderer identity. CPU and GPU entries stay separate. GPU caching requires verified camera/material/artifact receipts and a current service identity; a restart or renderer update invalidates reuse. [Camera and renderer receipts](cameras.md).
