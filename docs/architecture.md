# Library and architecture

Kiln builds JavaScript programs into GLB assets, validates structure, and renders views for visual review. The optional agent loop uses those results to refine a program.

## Entry points

The npm package `@instruktlabs/kiln` ships compiled ESM and TypeScript
declarations. Node consumers need no source loader. Build the SDK on a fresh source
checkout before using package imports; the installed archive already contains it.
See the [SDK contract](sdk.md) for runtime and experimental-feature boundaries.
See [installation](install.md) for package, source-checkout and plugin setup.

| Subpath | Purpose |
|---|---|
| `@instruktlabs/kiln/tools` | SDK-independent tool definitions and registry factories |
| `@instruktlabs/kiln/agent` | Optional Strands program-reference loop, model factory and exact-revision completion |
| `@instruktlabs/kiln/discovery` | Offline ranked catalog search and exact helper/recipe contracts |
| `@instruktlabs/kiln/requirements` | Host-bound, category-independent asset requirements |
| `@instruktlabs/kiln/render` | Build, serialize, inspect, and compose GLBs |
| `@instruktlabs/kiln/views` | Shared cameras, CPU images, capture limits, GPU port helpers and cell caches |
| `@instruktlabs/kiln/validation` | Syntax and structural checks |
| `@instruktlabs/kiln/primitives` | Geometry and helper catalog |
| `@instruktlabs/kiln/geometry`, `/deform`, `/sweep` | Custom mesh/surface helpers, deformation and profile modeling |
| `@instruktlabs/kiln/implicit` | Experimental bounded field sampling |
| `@instruktlabs/kiln/programs`, `/programs/node` | Immutable memory/file stores and storage statistics |
| `@instruktlabs/kiln/cache`, `/cache/node` | Disposable memory/file build caches |
| `@instruktlabs/kiln/contracts` | Asset and integration manifests |
| `@instruktlabs/kiln/composer` | Layout and overlap helpers |
| `@instruktlabs/kiln/qa` | Deterministic QA gates and corpora |
| `@instruktlabs/kiln/arena` | Pairwise model evaluation |

See [package.json](../package.json) for all exports.

## Tool surfaces

[src/tools/registry.ts](../src/tools/registry.ts) owns the current tool definitions.
`createKilnProgramToolRegistry` supplies fourteen MCP tools; the packaged local host
adds `kiln_project`, `kiln_material` and `kiln_review`, for seventeen over stdio.
`createKilnNativeToolRegistry` reuses those definitions, removes unavailable delivery
services and adds exact-reference completion. The retired mutable-buffer factories
and separate `kiln_screenshot` are not the supported native workflow.

| Interface | Execution and feedback | Completion and host services |
| --- | --- | --- |
| CLI | Node commands call shared engine operations; render/inspection receipts accompany image files that the host agent must read. | The invoking agent controls delivery. CLI/MCP can share the same workspace, stores and requirements binding. |
| MCP | Seventeen registry tools over stdio (fourteen program tools plus project, material and review); unified `kiln_render` returns metrics, QA, part paths and typed images with fidelity. Numeric-only inspection can omit images. | The host owns the agent loop; no terminal submit tool. Host media handling still needs qualification. |
| Native Strands | Direct in-process registry adapters with injected stores, requirements and rendering; no CLI/MCP hop. Same source/reference/edit/inspection semantics. | Ten default tools including `kiln_finish`; five delivery tools when an asset library is injected. A configured skill-resource reader adds one tool. Finish selects a retained reviewed revision; it does not certify QA success. |

Discovery needs no inference service. Recipes are optional guidance; requirements
select checks independently of labels. The Strands SDK and provider adapters are
optional dependencies, loaded only for native generation. See [runtime support](runtime.md)
for the separate core and native-agent Node requirements.

An embedded host can inject a `ProgramStore`. The default registry store is in memory; the stdio server and CLI use a local file store. [Program revisions](programs.md) describes the contract and lifecycle.

The render port abstracts GPU rendering. CPU fallback keeps geometry review available when material-faithful rendering is unavailable; camera and material fidelity are reported separately. Required-GPU requests fail when that route cannot honor the request.

Source revisions, evaluated GLB bytes and captured image cells have separate identities. Public tools reuse compatible builds and cells. Packaged Node CLI/MCP hosts keep verified builds on disk, separate from authoritative source; development hosts use process memory. Cached data is copied between requests, so an inspection cannot mutate a sibling request or the accepted artifact. [Runtime and cache controls](runtime.md) · [Generated tool reference](tools.md) · [Extending Kiln](extending.md).

## Validation and integration

Structural checks run without a model. Visual judgments require looking at the result. `inspectGlbIntegration(bytes)` derives a manifest from an existing GLB without executing its source; visual quality remains `not_assessed` until reviewed in the destination scene.

CPU render paths are deterministic for the same inputs. GPU images can vary by device and driver.

## Development

```bash
node scripts/example-archive.mjs --fetch
bun run typecheck
bun run lint
bun run test
bun run test:coverage
```

Prepare the pinned historical corpus once with the explicit fetch command above.
Subsequent tests stay offline, pin CPU rendering and include those archived programs.
The coverage ratchet lives in [scripts/check-coverage.mjs](https://github.com/instruktlabs/kiln/blob/main/scripts/check-coverage.mjs). Threshold decreases require an explicit measured rationale. Live provider tests require an explicit opt-in.

Core dependencies include Three.js, glTF Transform, Manifold, Acorn, and Zod. The agent SDK is an optional peer. Keep provider adapters compatible with the SDK's declared interface version; a TypeScript cast cannot fix a runtime protocol mismatch.
