# Game delivery contract (2026-10-15)

Status: scoped by the owner's game session on 15 October 2026, before any asset work
in the consuming game. This is a dated plan: it never overrides code, `AGENTS.md`
or the changelog, and it is not release acceptance. It lands on a branch as a pull
request candidate; whether it merges, bumps a version or publishes is a separate
owner decision taken after the consuming game has built assets against it.

## Why

The consuming game (a three.js r185 WebGPU/TSL title, `OBJEKT-62`) authors nearly
every object as code from welded primitives, owns its own shader graphs, effects and
hand-rolled collision, and loads GLBs through a one-off import step per asset. For
Kiln to author its monuments, a walkable ship kit, cacti and a Keeper body kit, the
GLB has to carry everything the game's import step needs so that ONE generic step
replaces per-asset wiring. Today it carries shape, UVs, materials and LOD chains. It
does not carry colliders, anchors, kit metadata, the two wear attributes the game's
shaders read, a triangle budget, a solid guarantee, or a qualified three.js runtime
derivative, and the atlas is a hand-laid sheet.

Everything below extends the GLB contract through plain glTF (roles in node extras,
underscore custom attributes, vendor extensions already in use). Nothing teaches Kiln
about three.js materials, effects or physics; those stay in the consumer.

## Non-goals

- No version bump, no changelog release entry, no publish, no merge to main, no push
  without explicit owner approval.
- No three.js node materials, VFX, physics or collision response inside Kiln.
- No crash-damage or destruction helper (a later design, see "Deferred").
- No snap solver for kits; this cycle delivers the contract and diagnostics only.
- No change to MCP tool input schemas. New behaviour is reached through authored
  source helpers and existing CLI flags, so the prompt-cached schemas stay stable.
- No general self-intersection detection beyond the existing sweep analysis.

## Scope, in delivery order

Each item is one or more commits on the branch, with its own tests, so items can be
cherry-picked independently if the owner ships only part of this.

### 1. Semantic roles for delivery (`src/contracts/semantic.ts`, integration manifest)

`KILN_SEMANTIC_ROLES` is documented as part of the GLB contract, so this is a
versioned additive change. Add:

| Role | On | Meaning |
|---|---|---|
| `collider.box.<id>` | a hidden proxy node whose geometry is a unit box under the node transform | yaw-capable oriented box collider |
| `collider.capsule.<id>` | hidden proxy node, unit capsule (radius 0.5, height 1 along +Y) | capsule collider |
| `collider.hull.<id>` | hidden proxy node with its own mesh | convex hull from the proxy vertices |
| `anchor.<kind>.<id>` | an empty node | a named point with transform: doors, vault plates, beacons, hardpoints, lights, spawn points |
| `kit.module` | the root of a modular piece | carries extras `kiln.kit`: `{ footprint: [w, d], height, snapAxis: 'x'|'y'|'z', origin: 'corner'|'center' }` |
| `kit.port.<id>` | an empty node under a `kit.module` | a snap point with transform |
| `lod.impostor` | the last level of a `defineLod` chain | that level is a card or billboard tier |

Authoring helpers, in a new `delivery` subpath exported from the package root map
and advertised in Discovery: `colliderBox(size, { id })`, `colliderCapsule(radius,
height, { id })`, `colliderHull(mesh, { id })`, `anchor(kind, id)`, `defineModule(root,
spec)`, `port(id)`, and `{ impostor: true }` on the last `defineLod` level. Colliders and
anchors are hidden through the existing hidden-node mechanism so every importer that
ignores roles still draws the right thing.

Integration manifest: additive fields on `IntegrationManifestV1` (or a `v2` if the
existing reader rejects unknown fields; choose whichever keeps old sidecars valid):
`colliders[]`, `anchors[]`, `kit?`, `ports[]`, and `impostor: true` on the LOD level
record. Each entry carries role, node path, and the world-space transform relative to
the asset root.

Diagnostics (advisory, never QA acceptance): a collider proxy must be hidden and
inside the asset bounds; a box or capsule collider should overlap at least one drawn
triangle; ports must lie within the module footprint; an anchor must be a leaf.

### 2. Baked surface attributes (`_EDGE`, `_CAVITY`)

`bakeSurfaceAttributes(target, { edge?, cavity? })` on a mesh or subtree writes two
float vertex attributes, both in [0, 1]:

- `_EDGE`: convex-rim weight from the dihedral angle of the faces around the vertex,
  with a configurable threshold angle (default 35 degrees) and a one-ring smoothing
  step. Flat faces read 0, chamfers and rims read toward 1.
- `_CAVITY`: exposure, 1 minus a vertex-level occlusion from a fixed hemispherical
  ray set (default 32 directions, radius default 0.5 x bounds diagonal) cast against
  the asset's own triangles. Recess and overhang vertices read toward 0.

Deterministic: fixed direction set, no `Math.random`, no `Date.now`. Bounded by new
entries in `GEOMETRY_ALLOCATION_LIMITS` (vertices, triangles, rays). Both converters
must write the attributes; the export diagnostic lists custom attributes preserved,
and the integration manifest records `vertexAttributes: [{ name, meshes, params }]`.

Tests: a chamfered box bakes edge near 1 on chamfer vertices and near 0 on face
centres; a box inside an open-topped box bakes cavity lower than a free box; both
attributes survive export through `legacy` and `three` converters and are readable
through gltf-transform.

### 3. Triangle and draw budgets in the receipt

`defineBudget({ triangles: number | { LOD0, LOD1, ... }, draws?: number })` in source.
The render receipt (CLI `--json`, `kiln_render` metrics) gains `budget: { declared,
measured, status: 'pass' | 'fail' | 'none' }` per tier. CLI gains `--strict-budget`
(non-zero exit on fail). Advisory by default; it never changes QA acceptance.

### 4. Solid diagnostics

`geometryDiagnostics` gains a `solid` section per mesh: `closed` (zero boundary
edges), `manifold` (zero non-manifold edges), `orientation: 'outward' | 'inward' |
'mixed'` from consistent winding plus the sign of the signed volume, and
`signedVolume`. An opt-in `requireSolid(mesh)` authoring assertion fails the build
with a closed repair message when any of the three is false. Use the existing edge
analysis for the first two; signed volume is a direct sum. `manifold-3d` is not
required for this item.

### 5. Atlas packer

`textureAtlas` accepts regions without a `content` rectangle plus a `pack` option:
`{ edge: 1024 | 2048, gutter, algorithm: 'maxrects' }`. Packed placement is
deterministic (sort by area descending, then name). Explicit rectangles remain and
may be mixed with packed regions. Limits move with a versioned compiler id
(`kiln.texture-atlas.v1.2`): edge 2048, output texels 4,194,304, sources 32, regions
128. Provenance records the resolved placement of every packed region so a saved
record is reproducible without re-packing.

### 6. three.js runtime delivery profile

`export --profile runtime --target three` (and the library equivalent) produces a
derived GLB that is: meshopt-compressed and quantized (`EXT_meshopt_compression`,
`KHR_mesh_quantization`), with `EXT_mesh_gpu_instancing` for repeated identical
mesh-plus-material children marked by a `repeatInstances(parent)` helper, KTX2 when
the encoder is present and reported `skipped` otherwise, and with `_EDGE`/`_CAVITY`,
roles, hidden collider nodes, anchors, kit extras and `MSFT_lod` chains preserved.

The sidecar states the quantization and node-scale facts explicitly (which nodes
carry a metre scale after quantization, so a consumer that re-parents bare geometry
knows it will drop it), the list of custom attributes, and the extension set used.

Qualification: a test loads the derived GLB through three's `GLTFLoader` (three is a
dependency) with the meshopt decoder in a Node test, and asserts LOD nodes, roles
in extras, custom attributes, instancing and hidden nodes are all present. If
`GLTFLoader` cannot run under the test runner, record the exact reason in the plan's
execution log, assert the same facts through gltf-transform, and leave a documented
manual viewer check for the owner.

### 7. Small items

- Vegetation recipe `cactus` beside `succulent` in `src/vegetation-prompt.ts`:
  ribbed star-profile loft trunk, swept arms with elbows, spine cards on ribs,
  explicit LOD tiers with an impostor last.
- `definePalette([...hex])` in source: an advisory diagnostic lists every material
  base colour farther than a threshold from the nearest palette entry.
- Authoring guidance: update `skills/kiln-author-asset/references/geometry-recipes.md`
  for colliders, anchors, kits, bakes, budgets and the cactus recipe, then run
  `bun run check:skills`.
- Docs: `docs/geometry.md` (solid, bakes, budgets), `docs/export-profiles.md`
  (three target), `docs/procedural-surfaces-v3.md` (packer), a new
  `docs/delivery-contract.md` that is the single reference for roles, attributes
  and the manifest fields, and regenerated `docs/tools.md` if Discovery entries
  changed (tool schemas must not).

### 8. End-to-end fixture

One committed fixture source under `src/__tests__/fixtures/` or `examples/`: a
bunker door frame as a `kit.module` with two ports, a box collider, three anchors,
a two-tier `defineLod` plus an impostor, baked attributes, a packed atlas with two
procedural regions, a budget and `requireSolid`. The fixture exports through both
converters and the three target and is the subject of the item 6 qualification test.

## Deferred (named so nobody re-scopes them by accident)

- A crash-damage or tearing helper for wreck module sets.
- A kit snap solver and composition validation across modules.
- General self-intersection detection.
- An engine-side palette lock that fails builds (this cycle is advisory only).

## Acceptance for the branch

In the Kiln checkout, all of `AGENTS.md`'s offline gate must pass:
`bun run check:toolchain`, `bun run check:skills`, `bun run build:sdk`,
`bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:render-service`,
`bun run test:coverage` with the ratchet in `bunfig.toml` not lowered, and
`node scripts/build-runtime.mjs all` after runtime changes. Strict TDD per the
guide: focused failing test first, smallest fix, rerun focused then full gates.

The branch must not touch the pre-existing uncommitted changes in the checkout
(`ROADMAP.md`, `docs/backlog.md`, `docs/install.md`, and the untracked
`docs/plans/2026-10-12-scenes-trailer-plan.md`); stage only the paths this plan
creates or edits. Commits are per item with messages that name the item number.
No push.

## Execution log

The implementer appends one dated line per completed item here, plus any deviation
from this scope and why. The owner's game session reads this log to monitor.

- 2026-10-15 baseline (branch `feat/game-delivery-contract` from `743965ac`, before any change):
  `bun install --frozen-lockfile` clean; `bun run check:toolchain` and `bun run build:sdk`
  (59 entrypoints) pass; `bun run typecheck` and `bun run lint` (988 files) pass;
  `bun run test` 3674 pass, 2 skip, 20 fail. The 20 failures are environmental or
  pre-existing and are not counted against this branch: 19 in `scripts/` (17
  `prepare-npm-release.test.mjs` and 2 `example-archive.test.mjs`) fail because this
  Git Bash PATH resolves GNU tar 1.35, which reads `C:\...` as a remote host ("Cannot
  connect to C: resolve failed"); 1 `src/__tests__/workspace-setup.test.ts` "ships a CLI
  bundle matching the current source" fails because the committed `dist/cli.mjs` differs
  from a fresh build at HEAD on this machine (Node 24.20.0 on PATH, toolchain pins 22.23.3).
- 2026-10-15 item 1 (delivery roles) done. Files: `src/contracts/semantic.ts` (roles +
  `KILN_SEMANTIC_ROLES_REVISION = 2`), `src/contracts/integration.ts` (additive optional
  `colliders`, `anchors`, `kit`, `ports`, `deliveryDiagnostics`, level `impostor`),
  new `src/delivery.ts` and `src/delivery-inspect.ts`, `src/lod.ts`, `src/lod-export.ts`,
  `src/render.ts`, `src/community-exporter.ts`, `src/primitives.ts`, `src/geometry-budget.ts`
  (`colliderHullVertices`), `src/evaluator/authoring-diagnostic.ts` + `protocol.ts`
  (`DELIVERY_CONTRACT`), Discovery specs/contracts, prompt-api snapshot, `package.json`
  (`./delivery` subpath), `docs/sdk.md` (60 entrypoints). Test: new
  `src/__tests__/delivery-roles.test.ts` (11, observed failing first). Gates: typecheck and
  lint pass; `bun run test` 3684 pass, 2 skip, 21 fail = the 20 baseline failures plus
  `mcp-server bundles > dist/mcp-engine.mjs matches a fresh build`, which is the expected
  stale-bundle check until `node scripts/build-runtime.mjs all` runs at the item 2 gate.
  Deviations: (a) kit extras key is `kilnKit` (`{ schemaVersion: 1, footprint, height,
  snapAxis, origin }`), not a literal `kiln.kit`, to follow the existing engine-owned
  `kiln*` extras convention (`kilnSemantic`, `kilnOpenShell`); (b) `colliderCapsule` height
  is the total end-to-end height (caps included), and the proxy geometry is the true capsule
  normalised into the unit box so the node scale `[2r, h, 2r]` restores it exactly; (c) the
  manifest also gives each collider an explicit `shape` (box size, capsule radius/height,
  hull vertex count) so consumers need not interpret the proxy mesh; (d) a box or capsule
  wholly inside a closed solid touches no triangle and is reported by the advisory overlap
  check, as the contract's wording requires.
- 2026-10-15 item 2 (baked `_EDGE`/`_CAVITY`) done. Files: new `src/surface-bake.ts`
  (`bakeSurfaceAttributes`, fixed Fibonacci cosine-weighted hemisphere, median-split BVH,
  welded topology), `src/geometry-budget.ts` (`surfaceBakeVertices` 262144,
  `surfaceBakeTriangles` 1000000, `surfaceBakeRays` 8388608, `surfaceBakeRayDirections`
  256), `src/geometry-export.ts` (`_edge`/`_cavity` accepted by both converters,
  `CUSTOM_EXPORT_ATTRIBUTES`), `src/render.ts` (legacy bridge writes `_EDGE`/`_CAVITY`;
  bake parameters as mesh extras `kilnSurfaceBakeV1`; manifest `vertexAttributes`),
  `src/delivery-inspect.ts` (`summarizeVertexAttributes`, LOD levels included),
  `src/contracts/integration.ts`, `src/cli.ts` (receipt `vertexAttributes` and a log line per
  attribute: the export diagnostic of preserved custom attributes), Discovery entries,
  prompt-api snapshot, `src/primitives.ts`. Test: new `src/__tests__/surface-bake.test.ts`
  (6). Three-side names are lowercase `_edge`/`_cavity` because three's GLTFLoader lowercases
  custom glTF attributes; glTF names are `_EDGE`/`_CAVITY`. Each baked mesh gets its own
  geometry copy (cavity depends on placement). Gates after `node scripts/build-runtime.mjs
  all` (exit 0; rebuilt tracked `dist/`): `bun run test:coverage` 3692 pass, 2 skip, 19 fail
  (all 19 are the baseline GNU-tar `scripts/` failures; both stale-bundle checks now pass),
  and because the failing tests stop the `&&` chain, `bun scripts/check-coverage.mjs` was run
  on the produced lcov: passed, functions 95.46% (min 94.00%), lines 93.10% (min 92.10%);
  `bun run test:render-service` 0 fail; `bun run check:skills` 6 conform, 2 copies identical;
  typecheck and lint pass.
