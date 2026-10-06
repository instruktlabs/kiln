# Kiln JavaScript and TypeScript SDK

This describes the v1 package contract. Examples use `@instruktlabs/kiln`; install
a published version or a qualified local archive as described in the
[installation guide](install.md). Registry publication is a separate release gate.

## Imports

Kiln ships compiled ESM and TypeScript declarations. The package root is a Node
library entrypoint; importing it does not run the CLI or start a server. Consumers
do not need Bun or a TypeScript runtime loader.

```ts
import { createDiscovery, engineIdentity, renderGLB, validateKilnCode } from '@instruktlabs/kiln';

const code = `function build() {
  return new THREE.Mesh(boxGeo(1, 1, 1), gameMaterial(0x888888));
}`;
const validation = validateKilnCode(code);
const result = await renderGLB(code);
// result.glb is a Buffer containing the GLB. Persist or deliver it in your host.
```

The complete authoring and host APIs remain available through documented subpaths.
The existing 55 export paths are retained. The root exposes rendering, validation,
Discovery and engine identity; it does not re-export every name from every module.
CommonJS is not part of this release's contract.

Custom `AssetLibrary` hosts can import `verifyAssetRecord` and
`resolveSavedAssetMaterials` from `@instruktlabs/kiln/assets/node`. The latter resolves
the exact saved dependency manifests from a record's embedded material payload or
an injected `MaterialLibrary`; it never substitutes a newer material revision.
Use the existing material payload and asset-bundle encoders for portable delivery.

| Area | Subpaths |
| --- | --- |
| Root library | `@instruktlabs/kiln` |
| Authoring | `primitives`, `geometry`, `deform`, `sweep`, `architecture`, `assembly`, `character`, `vehicle`, `palette` |
| Materials | `material-library`, `material-library/node`, `material-presets`, `material-recipes`, `material-resources`, `material-recipe-runtime`, `material-recipe-prompt`, `material-metrics`, `texture-resolver` |
| Rendering and inspection | `render`, `views`, `validation`, `metrics`, `inspect`, `qa`, `asset-export`, `kit` |
| Host contracts | `tools`, `evaluator`, `discovery`, `requirements`, `requirements/migration`, `contracts`, `prompt-api`, `profile` |
| Records and storage | `assets`, `projects`, `project-bundle`, `workspace`, `live-review`, `programs`, `cache`, and each corresponding `/node` adapter |
| Composition | `composer`, `world-runtime` |
| Ranking math | `arena` |
| Optional agent workflows | `agent`, `composer/agent` |
| Experimental modeling | `implicit` |

Read the [architecture reference](architecture.md) for the domains and the
[runtime contract](runtime.md) for hosting boundaries. The export map is the public
entrypoint list. Files inside `lib/`, including declaration dependencies under
`lib/_types/`, are implementation details and are not additional public subpaths.

## Stability in 1.x

The table classifies all 55 public entrypoints. The root and every listed subpath
except `implicit` are stable entrypoints for v1: their declared public signatures,
record shapes and documented behavior receive normal semantic-versioning
compatibility. Optional dependencies do not make the two agent APIs experimental.
The `arena` entry is pure ranking math and needs no model SDK or provider key.
Use the documentation shipped with the installed version; a checkout does not
change an already installed package's contract.

The exception follows the feature across imports: `implicitSurface` remains
experimental when re-exported by `primitives` or used in authoring globals, and
experimental Discovery recipes retain their individual labels. The alternative
Three.js exporter also remains experimental and explicitly selected. Changes to
these experimental features must be identified in release notes and migration
guidance; the rest of an entrypoint does not inherit that exception.

The deprecated `setApprovedTextureResolver` alias remains available from
`material-resources`; new hosts use `setTrustedTextureByteResolver`. Deprecation
does not authorize removal from a compatible 1.x release. Neither setter belongs
in generated code: trusted hosts own the approved resource boundary.

Human-readable prompts, descriptions, diagnostic prose and image pixels are not
byte-stable API outputs. Consume documented structured records and version tags;
ignore unknown additive result fields. Preserve an asset's exact engine identity
and source/revision receipts for reproducible replay. Compatibility of the SDK
does not imply identical generated GLB bytes or renderer output across releases.
Persisted data and rebuild restrictions follow the [migration contract](migration.md).

## Execution and dependencies

The root SDK is Node-oriented. `/node` adapters use filesystem or server services;
the remaining names do not by themselves promise browser compatibility. Portable
record modules retain their existing boundaries. Browser use must follow a
documented, qualified entrypoint rather than importing the entire Node host.

`renderGLB` defaults to trusted in-process execution. A hosted service accepting
untrusted programs must inject or select the qualified isolated evaluator described
in the runtime contract. A subprocess provides a worker boundary; it does not alone
establish filesystem, network or tenant isolation.

The installed isolated evaluator uses compiled JavaScript workers and readiness
probes, without a TypeScript loader. Linux hosts still need the required namespace
and resource-limit tools and must pass the actual readiness probe. An unavailable
boundary fails closed; a successful local worker render is not proof of isolation.

Optional Strands workflows (`agent` and `composer/agent`) require Node **22.2.0+**
and their documented peer dependencies. The core SDK, CLI and MCP retain the
separate Node compatibility contract in the [installation guide](install.md).
Core SDK imports and consumer types must work without those optional peers.
Shared tool contracts contain host-neutral interfaces; they do not require the
Strands SDK to typecheck an ordinary CLI/MCP host.

Existing experimental features remain explicit: `/implicit` keeps its current
availability and limitations, and the community exporter stays explicitly selected. CPU
geometry previews do not establish texture or PBR material fidelity. Experimental
labels do not waive installation, export-resolution or resource-bound checks.

Discovery search and overview text include each entry's `stable`, `experimental`
or `deprecated` label alongside its limitations. The CLI, SDK and MCP use the same
catalog. A recipe's experimental label applies to that recipe; it does not change
the stability of the helpers it uses. Exact details retain the same structured
`stability` field. Implicit modeling remains available without a new opt-in switch;
the community exporter retains its explicit selection.

## Maintainer qualification

`node scripts/build-runtime.mjs all` builds both executable bundles and the ESM SDK.
`bun run build` remains typechecking only. SDK output replaces the generated `lib/`
tree after successful compilation and module resolution, so removed modules cannot
linger in a new package.

On a fresh checkout, run `bun run build:sdk` before typechecking or running tests
that exercise public package imports. Rebuild after source changes; package tests
must exercise the generated code that a consumer will receive. Coverage measures
the source engine and excludes its generated `lib/` copy without changing thresholds.

The package checks import core entrypoints and render through the installed worker.
With maintainer dependencies present, `node scripts/smoke-package.mjs --types` also
typechecks a clean installed consumer without optional peers. CI qualifies this
against the same tarball subsequently passed to the platform consumer jobs.
The core check covers 53 entrypoints, including `arena`. After installing the
optional peers, `node scripts/smoke-sdk-types.mjs INSTALLED_PACKAGE --with-agent-peers`
checks declarations for all 55. Import/type qualification does not establish live
model access or provider behavior.
