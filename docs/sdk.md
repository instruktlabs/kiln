# Kiln JavaScript and TypeScript SDK

This describes the v1 package contract under development. Registry publication is
a separate release gate; examples use the selected name `@instruktlabs/kiln`.

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

| Area | Subpaths |
| --- | --- |
| Authoring | `primitives`, `geometry`, `deform`, `sweep`, `architecture`, `assembly`, `character`, `vehicle`, `palette` |
| Materials | `material-library`, `material-library/node`, `material-presets`, `material-recipes`, `material-resources`, `material-recipe-runtime`, `material-recipe-prompt`, `material-metrics`, `texture-resolver` |
| Rendering and inspection | `render`, `views`, `validation`, `metrics`, `inspect`, `qa`, `asset-export`, `kit` |
| Host contracts | `tools`, `evaluator`, `discovery`, `requirements`, `requirements/migration`, `contracts`, `prompt-api`, `profile` |
| Records and storage | `assets`, `projects`, `project-bundle`, `workspace`, `live-review`, `programs`, `cache`, and each corresponding `/node` adapter |
| Composition | `composer`, `world-runtime` |
| Optional agent workflows | `agent`, `arena`, `composer/agent` |
| Experimental modeling | `implicit` |

Read the [architecture reference](architecture.md) for the domains and the
[runtime contract](runtime.md) for hosting boundaries. The export map is the public
entrypoint list. Files inside `lib/`, including declaration dependencies under
`lib/_types/`, are implementation details and are not additional public subpaths.

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

Optional Strands workflows require their documented peer dependencies. Core SDK
imports and consumer types must work without those optional peers. Shared tool
contracts contain host-neutral interfaces; they do not require the Strands SDK to
typecheck an ordinary CLI/MCP host.

Existing experimental features remain explicit: `/implicit` and the selected
community exporter retain their current limitations and opt-in behavior. CPU
geometry previews do not establish texture or PBR material fidelity. Experimental
labels do not waive installation, export-resolution or resource-bound checks.

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
