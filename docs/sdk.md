# Kiln JavaScript and TypeScript SDK

This describes the v1 package contract. Examples use `@instruktlabs/kiln`; install
a published version or a qualified local archive as described in the
[installation guide](install.md). Use documentation matching the installed version.

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
The original 55 export paths are retained; version 1.1 added four
host entrypoints below, and the game delivery contract adds `delivery`. The root exposes rendering, validation,
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
| Authoring | `primitives`, `geometry`, `deform`, `sweep`, `architecture`, `assembly`, `character`, `vehicle`, `palette`, `delivery` |
| Materials | `material-library`, `material-library/node`, `material-presets`, `material-recipes`, `material-resources`, `material-recipe-runtime`, `material-recipe-prompt`, `material-metrics`, `texture-resolver` |
| Rendering and inspection | `render`, `views`, `views/port`, `validation`, `metrics`, `inspect`, `qa`, `asset-export`, `kit` |
| Host contracts | `tools`, `tools/input`, `mcp`, `evaluator`, `discovery`, `discovery/portable`, `requirements`, `requirements/migration`, `contracts`, `prompt-api`, `profile` |
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

The table classifies all 60 public entrypoints. The root and every listed subpath
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

## Procedural RGBA surfaces

The `primitives` entrypoint and authored `proceduralTexture` helper accept an
explicit V3 recipe for bounded rectangular RGBA images, shape coverage, alpha
masks, palettes, dithering and seeded stamps. Pure V3 compilation returns pixels,
canonical JSON and a compiler-qualified recipe hash without creating a mesh.
Read the [V3 contract](procedural-surfaces-v3.md) for the exact limits and rounding
rules. V1/V2 remain supported with their existing pixels, hashes and sampler
defaults. The same entrypoint exposes `textureAtlas` and `remapUVToAtlas` for
named regions. Portable V3 materials add explicit per-map sampling; opt-in V2
material records persist recipes, compiled maps and exact dependency pins.
See the [standalone material and atlas workflow](procedural-surfaces-v3.md#standalone-saved-materials-and-atlases).

## Explicit character skinning

The `character` and `primitives` entrypoints expose opt-in `createBoneChain` and
`createSkinnedPart`; both are also sandbox helpers. `createJointChain` continues
to return ordinary rigid `Object3D` pivots. Bone chains use the same versioned
joint descriptors, infer an attached declared parent role and reject ambiguous
roles/names before attaching nodes. They do not choose anatomy or a body plan.

`createSkinnedPart(name, geometry, material, { parent, bones, indices, weights })`
clones unchanged geometry and binds it to the assembled hierarchy's current rest
pose. Supply exactly four indices and weights per vertex, in the explicit bone
array order. Indices must be valid even in zero-weight lanes. By default weights
must be in 0..1 and sum to one within 1e-5; `normalizeWeights: true` explicitly
normalizes positive finite sums. Zero sums are rejected. Optional local position,
Euler rotation (degrees), scale and semantic metadata match `createPart`'s units.

The helper owns geometry, influence arrays and inverse bind matrices; bones and
materials remain shared. Limits are 1024 bones, 262144 vertices and 128 MiB of
cloned attributes plus new influence storage. These are helper limits, not new
restrictions on direct Three.js authoring. Existing skin attributes and singular
bind transforms are rejected. Set up rest transforms before binding; later rest
edits/reparenting need deliberate rebinding. Animated bounds remain a consumer
responsibility. The selected Three exporter is required to preserve skins;
calling these helpers does not change the legacy default or select a converter.

`inspectSkinIntegrity(root)` from `@instruktlabs/kiln/qa` reads source bindings
without updating matrices, normalizing weights or repairing the scene. It returns
bounded findings, checked counts and current posed world bounds (including position
morphs). It is not an animation envelope, deformation-quality score or proof of
collision clearance. Rigid meshes do not acquire skin or body-plan requirements.

Export runs this check before bounds, texture baking or conversion. Invalid source
bindings produce an `AssetQaBlockedError` at the scene stage with mesh/joint or
vertex-range context and repair advice. This is mandatory input integrity, like
invalid geometry buffers; QA warning mode and derivative serialization do not
bypass it. The partial failure report does not claim the remaining QA rules ran.
The independent final glTF validation remains in place. Source Three skeletons
need their inverse-bind arrays populated; this does not change glTF's valid
identity-matrix default when the file omits `inverseBindMatrices`.

## Execution and dependencies

The root SDK is Node-oriented. `/node` adapters use filesystem or server services;
the remaining names do not by themselves promise browser compatibility. Portable
record modules retain their existing boundaries. Browser use must follow a
documented, qualified entrypoint rather than importing the entire Node host.

### Embedding interfaces added in 1.1

- `mcp` exports `createKilnMcpServer`, `createKilnToolHost` and `kilnMcpToolDefs`
  for Node hosts, using the shared tool registry and injected `KilnToolContext`.
  It is an in-process embedding API. The `kiln-mcp` executable keeps its separate
  lazy engine loading; importing `mcp` loads the Node engine.
- `discovery/portable` provides catalog/request validation, lexical indexing,
  `createDiscoveryService` and retired-helper guidance. Supply a catalog generated
  from the matching engine version. This browser-qualified entrypoint does not
  import Node's built-in catalog construction or execute authored programs.
- `tools/input` exposes the shared action requirements and input-error formatting
  helpers without importing the engine registry or Node runtime.
- `views/port` exposes the existing renderer-port helpers and types, including
  `captureViewPngsViaPort`. Reuse their deadline, cancellation and PNG-validation
  policy rather than implementing a second renderer adapter. It does not provide
  a renderer or authorize trusted execution of untrusted source.

These entries require 1.1 or later; 1.0.0 does not expose them.
They contain no cloud-provider, account, tenant or hosted-service policy.

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

## Named operation presentation

In package version 1.2.0 and later, embeddings can select
`createKilnMcpServer(context, { toolPresentation: 'operations' })`, or obtain the
same definitions through `createKilnOperationToolRegistry(context)` from `tools`.
The default MCP and native interfaces retain their existing grouped tools.

With asset and material storage, and without project/review or renderer-control
callbacks, the named presentation exposes 21 tools. Asset browsing becomes
`kiln_assets_search` with an optional collection; material browsing becomes
`kiln_material_search` with `scope: 'all' | 'presets' | 'saved'`. Material creation
uses `kiln_material_create` with a required `definition` discriminated by
`kind: 'preset' | 'procedural'`. Saving, importing, retrieval and source restoration
remain explicit operations. Renderer controls appear only when their callbacks
exist. Connected `tools/list` remains authoritative.

Action requirements and field constraints come from the shared engine registry.
Generation rejects unclassified action/field additions and missing required
fields. Hosts select supported operations and add their actual execution and
persistence policy; do not copy domain schemas or assume a local read hint
describes a quota-admitted cloud job. This API change does not publish a package
or deploy a hosted service. Actual client acceptance is still required.

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
