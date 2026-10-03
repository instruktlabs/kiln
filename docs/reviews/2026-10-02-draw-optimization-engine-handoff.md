# Draw optimization: handoff to the engine and 0.10.0 work

Current disposition (3 October): #129, #131 and #132 are merged. The scene runtime
optimization landed; the separate engine modules and full-mode replacement did not.
#132 fixed UV/transform handling, while the pre-existing shared-image ORM overwrite
remains reproduced on main. The old wiring patch no longer applies cleanly after
#132. The [current alignment plan](../plans/2026-10-02-core-scenes-site-alignment.md)
records six implementation conditions and release scope; the [backlog](../backlog.md)
separates pending work from completed scene work. Patch applicability and readiness
claims below describe the original commit, not current main.

This record is for the agent that owns the engine and the 0.10.0 release (branch `v1-readiness`,
PR #129). It lists what the draw-optimization cycle changed or found that touches the engine,
its skills, assets or projects. That covers what is ready to apply, what is only proposed, and
which decisions are still the owner's.

It was written on 2026-10-02 at about 12:45 -04:00, in the worktree
`C:/Users/Mattm/X/kiln-draw-optimization`. That worktree is on branch `draw-optimization`: 25
local commits on `main` `c734e2a` (this record and the landing plan are the last two), none
pushed. Every claim about `v1-readiness` was rechecked against its tip `966c8d6` at the time of
writing. PR #129 has since merged as `9375d04` (Kiln 0.10.0) on 2 October; the engine PR comes
after it.

Like every dated record, it does not override current code, `AGENTS.md` or the changelog. The
decision IDs (D1 to D34) come from this cycle's decision briefs. They are not the `D-` numbers in
`scenes/DECISIONS.md`. The owner answered the engine decisions at 13:00 and 13:05; the answers are in
the next section.

## Owner answers (2026-10-02, 13:00 and 13:05 -04:00)

The owner took the recommended option on every engine decision:
- **D1 (a):** wire the merge into `optimize: 'full'` after 0.10.0 (PR #129) merges, as one
  engine PR. The engine agent does it from this record.
- **D4 (a):** two PRs. PR 1 is this branch's scene, skill and record work without `e72b610`, and
  comes from the draw-optimization session. PR 2 is the engine work: `e72b610`, the wiring, D2,
  D3, the texts, the CHANGELOG and one `dist/` rebuild.
- **D2 (a):** copy a shared mesh only when it costs at most 4 KB per saved draw.
- **D3 (a):** split a merged bucket at 65,534 vertices to keep 16-bit indices.
- **D23 (b):** output only. The export summary and `kiln_inspect` gain draws per anchor, a draw
  estimate and the two flags. The `kiln_render` compact result and every input schema stay as
  they are.
- **D24 (a):** the compose-scene corrections ride PR 1. The authoring and QA proposals (section
  6.4) go to the engine agent after 0.10.0, with dogfood.
- **D31 (a):** live dogfood before each PR. The owner wants Agy and OpenCode for the dogfood
  runs.
- **D34 (a):** fix the three hazards in the engine PR, with a test for the occlusion UV set.

The owner-only questions at the end of section 5 were not asked in this round. Put them to the
owner before or during the engine PR.

## In short

- **Engine code.** One commit (`e72b610`) adds two modules: `src/rigid-merge.ts` and
  `src/extension-compat.ts`, with tests. They are standalone: nothing imports them, and the
  branch changes no export, `package.json`, `dist/` bundle or changelog.
- **Ready patch.** A patch wires the merge into `optimize: 'full'`. It still applies to
  `966c8d6`. The recommendation is to land it after 0.10.0 merges, in one engine PR with a
  single `dist/` rebuild.
- **Skills.** Only `kiln-compose-scene` changed, in two commits.
- **Unchanged.** Assets, GLBs, sealed packs, `packs/`, Kiln projects, materials, the library,
  `render-service/` and `site/`. Every scene optimization is runtime code under `scenes/`.
- **No overlap.** `v1-readiness` changes 220 files since `c734e2a` and this branch changes 114;
  no file is in both.
- **Engine decisions** D1, D2, D3, D23, D34 and the authoring and QA half of D24 are answered: the
  owner took every recommendation. Sections 4 and 5 give the facts behind them.

## 1. What changed outside `scenes/`

| Commit | Files | Lines | What |
|---|---|---|---|
| `e72b610` | `src/rigid-merge.ts`, `src/extension-compat.ts`, `src/__tests__/rigid-merge.test.ts`, `src/__tests__/extension-compat.test.ts` | +476, +382, +908, +268 | Standalone modules. 28 tests pass (16 and 12; rerun at 12:42 today with `KILN_RENDER=cpu`) |
| `7db7325`, `00c4de8` | `skills/kiln-compose-scene/SKILL.md`, `skills/kiln-compose-scene/references/runtime-scenes.md` | +3, +66 | Draw-call techniques proven in the scenes, with their measured effect |
| `0aa3d28`, `6feac7b` | `docs/plans/2026-10-01-draw-optimization-cycle.md`, `docs/reviews/2026-10-02-draw-optimization.md` | +312, +486 | Plan of record and review |
| this commit | this file | | Handoff |

The other 104 changed files are all under `scenes/`:
- scene-kit: merge by material within anchors, the shadow cache and stand-ins, multisample
  discard, and the count probe;
- the three scenes;
- the scene scripts.

That code runs in the browser at load and rewrites no GLB.

**Build identity.** `dist/` was not rebuilt. `scripts/build-runtime.mjs:52` hashes every file
under `src/`, so `e72b610` alone makes `dist/build.json` stale:
- the `identity` and `sourceHash` of all five entries change;
- the bundles stay byte-identical, because nothing imports the new modules;
- no test catches it, but `scripts/qualify-project-foundation.mjs:247-248` compares the hash and
  would fail.

Whichever PR carries `e72b610` must run `node scripts/build-runtime.mjs all`.

## 2. Against `v1-readiness` (`966c8d6`, PR #129)

- **Files.** No file is in both branches. `v1-readiness` touches the author, QA, refine and
  setup skills; this branch touches only compose-scene.
- **The patches still apply.** `wiring.patch` and `wiring-tests.patch` pass `git apply --check`
  against copies of `966c8d6`'s `src/render.ts` and the four test files (taken with `git show`
  at about 12:40 today). `v1-readiness` changed `src/render.ts` (+26/−4: strict-mode generated code
  and bounded floater warnings) but not the optimize path.
- **Merged-tree gates, earlier, at `6ec32a1`.**
  - A scratch merge of this branch into `v1-readiness` had no conflict. Typecheck, lint (872
    files) and `check:skills` passed.
  - With both patches applied, typecheck and lint passed and 439 of 441 tests passed. The run
    covered the optimize-related test files plus the module, bundle and package tests.
  - The 2 failures were 20 s timeouts in `migration-rebuild.test.ts`. They also failed without
    the patches on that loaded host.
  - These gates were not rerun on `966c8d6`.
- **`dist/`.** A `dist/` built on this branch does not apply onto `v1-readiness`'s `dist/`.
  Regenerate it; never merge bundles by hand.

## 3. The modules

### `src/rigid-merge.ts`

The module header is the specification.

**API**
- `mergeRigidGroups(doc, options?)` (line 332) merges in place and returns a
  `RigidMergeSummary`.
- `rigidMerge(options?, onSummary?)` (line 468) is the gltf-transform `Transform` form.
- `RigidMergeOptions`:
  - `keep`: names to keep as boundaries;
  - `mergeTransparent`;
  - `mergeMirroredTangents`;
  - `expandSharedMeshes`, which defaults to `true`.
- The summary reports:
  - `primitivesBefore` and `primitivesAfter`;
  - `groups` and `merges`;
  - `boundaries`, with reasons;
  - `locked`, with reason and primitive count;
  - `rejected` buckets, with errors;
  - `unmatchedKeep`;
  - `skipped: 'unbounded-animation'`.

**Rigid groups.** A rigid group is a scene or boundary node plus every non-boundary descendant.
Primitives that share a material and vertex layout are baked into the frame of the group's
first contributing node and joined. No node is removed, renamed or reparented.

**Boundaries:**
- animation targets and skin joints;
- `Joint_*` pivots;
- nodes with any extras;
- semantic relationship targets;
- `KHR_node_visibility` and `MSFT_lod` nodes;
- `keep` names.

**Locked, never moved or joined:**
- skinned or GPU-instanced nodes;
- meshes with extras;
- nodes with a singular world matrix;
- morph targets;
- primitives with extensions or extras;
- strip, fan and loop modes;
- primitives without POSITION;
- `KHR_materials_volume`;
- BLEND or transmissive materials, unless `mergeTransparent`.

**Contract.** Every node name and every boundary's geometry survive. A named non-boundary
node's geometry does not: Golden Gate's `Roadway` goes from 164 to 660 triangles, and stays at
164 with `keep: ['Roadway']`.

**Tangents** are baked by the module, not by gltf-transform (section 6.2). By default,
mirrored tangent-bearing parts join only parts of the same world handedness;
`mergeMirroredTangents` lifts that.

**Detached checks.** Each bucket is built and checked detached from the graph. A bucket that
fails leaves its primitives untouched and is reported in `rejected`.

**Measured on the real Farm `farmhouse.glb`:**

| | Draws | Notes |
|---|---|---|
| Merge alone | 16 → 11 | |
| Palette, then merge | 16 → 9 | `Joint_FrontDoor` keeps its 2 primitives |
| Today's `full` | 16 → 16 | Loses the door pivot |

With the merge, nodes stay at 24, triangles at 4,080, and the Khronos validator reports 0
errors and 0 warnings.

### `src/extension-compat.ts`

**Purpose.** It answers one question: does a destination's stock glTF importer load this file?
It is pure and bytes-first: no filesystem, network or renderer. It is a library function only,
with no tool output and no schema change.

**API**
- `readGltfExtensions(input)` (line 285) reads `extensionsUsed` and `extensionsRequired` from
  GLB bytes, a `Document` or the lists themselves. It parses the JSON chunk itself, because
  gltf-transform 4.5.0's reader throws on an unknown required extension.
- `checkExtensionCompat(input, destination, {available?})` (line 344) returns a report:
  - each required extension gets `ok`, `conditional` (it needs a named decoder, add-on or
    plugin; `available` lists the ones the caller has wired) or `blocked`;
  - warnings name optional extensions that an importer ignores although that changes what
    draws.
- `GLTF_DESTINATIONS`:
  - `three`, `godot`, `unity` (profiled as glTFast), `unreal`, `bevy` and `blender`;
  - the ids follow the project delivery targets in `projects.ts`;
  - `roblox`, `sbox`, `usdz` and `custom` have no sourced allowlist and are not profiled;
  - each allowlist cites the importer source it was read from (read on 2026-10-01).

**Scan of the scene site inputs and their staged copies** (203 files, 107 unique):

| Unique GLBs (files) | Extensions | Result |
|---|---|---|
| 44 (65) | none | ok everywhere |
| 42 (96) | `MSFT_lod`, optional only | ok everywhere |
| 20 (40) | Golden Gate terrain tiles: `KHR_mesh_quantization` and `EXT_meshopt_compression` required | blocked in Godot and Bevy; conditional in three, glTFast and Unreal; ok in Blender |
| 1 (2) | Foundry FOUP, `KHR_node_visibility` | warning in three, glTFast, Bevy and Blender |

**Correction to the research report's acceptance line.** That line says the lint should flag
the kit pass for the Godot profile. The kit pass marks `KHR_texture_basisu` as required
(`src/kit.ts:381`). The check finds that pass:
- ok for Godot 4.7.2;
- blocked for Bevy and Blender;
- conditional for glTFast and for three (`KTX2Loader`);
- unverified for Unreal.

## 4. The `optimize: 'full'` wiring: ready, not applied

### Why change it

Today `full` runs `flatten()` + `join()` on static, semantics-free graphs, and degrades to
`palette` otherwise. On the 86 `examples/*.kiln.js`:
- 35 degrade to `palette`;
- the other 51 flatten, and every one of them loses its hierarchy;
- 27 lose `Joint_*` pivots;
- none saves a draw, and 31 grow.

### The patch

`C:/Users/Mattm/X/kiln-draw-optimization/tmp/drawcalls/phase0/wiring.patch` (ignored, local
only) changes `src/render.ts` by +21/−35:
- `full` now degrades only when an animation channel has no target node (a pointer);
- `flatten()` + `join({keepNamed: true})` becomes `rigidMerge()`. The order inside
  `consolidateMaterials` is palette (behind the same material-extras guard), the merge, `weld`,
  then `prune`;
- it drops the unused `flatten` and `join` imports, and the citation of the missing
  `docs/kiln-material-consolidation-cycle.md`;
- `off`, `auto` and `palette` stay byte-identical: 49 of 49 outputs were checked.

The full description is in `tmp/drawcalls/phase0/wiring.md` (ignored, local only).

### Test expectations

`wiring-tests.patch` changes 4 files (+9/−9). Five tests expected `palette` where `full` now
runs:
- `msft-lod`, twice;
- the `optimize` test "auto-degrades to palette when the asset is animated";
- the `qa/architecture` test;
- the `views/architecture` test.

Only the mode expectation and the "degrades" titles change. Every other assertion in those tests
passes under the merge.

### Outputs on the examples

Rendered through `renderGLBInProcess`:

| Output | Draws | Bytes | Nodes with a parent | `Joint_*` nodes |
|---|---|---|---|---|
| `palette` | 26,989 | 46,920,396 | 27,699 | 619 |
| `full` today | 26,989 | 47,077,288 | 10,630 | 368 |
| `full` wired, module default | 1,672 | 69,427,992 | 27,699 | 619 |

- Triangles are unchanged and the validator reports 0 errors.
- The +48% bytes comes from the shared-mesh default; see D2.
- `composeSceneGLB(…, {optimize: 'full', keepAnimations: true})` on seven Farm placements goes
  from 72 to 31 draws, at +17.0% bytes, with all 9 `Joint_*` nodes kept.

### Who reaches `full` today

No tool, CLI or site path does. Line numbers are on `966c8d6`:
- `evaluateGeneratedSource` defaults to `'off'` (`src/tools/registry.ts:417`).
- The CLI render passes `'off'` (`src/cli.ts:318`).
- `KILN_BAKE_OPTIMIZE` only sets a default, and tool calls override it
  (`src/local-runtime.ts:127-131`).

`full` is reached only through `@kiln/engine/render`:
- `renderGLB` and `renderSceneToGLB`, with `optimize` or the env (`src/render.ts:1334`);
- `optimizeGlbBytes({mode})` (`:2008`). Its comment names Kiln Studio's web tier as a caller;
- `composeSceneGLB({optimize})` (`:2288`), which defaults to `palette`.

### What landing it also needs

- **A `dist/` rebuild:** `node scripts/build-runtime.mjs all`. On `v1-readiness`'s layout the
  merge lands in `agent-run`, `cli`, `evaluator-worker` and `mcp-engine`, adding about 12.0 KB
  raw and 3.1 KB gzip each. The thin `mcp-server.mjs` does not change; `build.json` does.
- **Three texts** that still say full optimisation falls back to palette. Line numbers are on
  `966c8d6`:
  - `docs/engine-handoff.md:210`;
  - `docs/migration.md:173`;
  - `skills/kiln-qa-asset/references/engine-handoff.md:211`.

  The author-asset copy is deleted on `v1-readiness`. The QA skill is model-facing.
- **A stale citation.** `src/__tests__/optimize.test.ts:4` also cites the missing doc.
- **A CHANGELOG entry.** Proposed text: "`optimize: 'full'` merges primitives by material inside
  rigid groups instead of `flatten()` + `join()`. `Joint_*` pivots, animation targets,
  metadata-bearing, LOD and visibility nodes keep their own geometry and every node keeps its
  name; the farmhouse drops from 16 to 9 draws with its door pivot intact."
- **The D2 and D3 choices**, so that `full` output changes only once.

### Reproduce

```bash
KILN_RENDER=cpu bun test ./src/__tests__/rigid-merge.test.ts ./src/__tests__/extension-compat.test.ts
KILN_RENDER=cpu bun tmp/drawcalls/phase0/rigid-merge-evidence.ts
bun tmp/drawcalls/phase0/extension-compat-scan.ts
```

The two scripts under `tmp/` are ignored, local only, and need the ignored scene inputs, so run
them from the draw-optimization worktree.
`bun test src scripts` matches any path containing `src`, including copies under `tmp/`. Delete
any scratch copy of `src/` before running the gate.

## 5. Open decisions for the engine work

### Where they come from

A decision sweep found 36 open decisions in all: D1 to D34, plus D7b and D11b. The owner answered
them in ten batches on 2026-10-02 between 12:53 and 13:08. The engine items were in batch 6
(D1, with D4) and batch 8 (D2, D3, D23 and D34). The table keeps the options as they were put;
the chosen option is the recommended one in every row.

| ID | Question | Recommendation | Key numbers |
|---|---|---|---|
| D1 | When does `full` switch to the merge? | (a) After 0.10.0 merges: rebase, wire, apply D2 and D3, fix the texts, add the CHANGELOG entry, rebuild `dist/` once, in one engine PR | (b) Wiring now causes a measured `dist/` conflict at rebase. (c) Putting it into `v1-readiness` voids PR #129's recorded gate and fresh clone |
| D2 | Which shared meshes may `full` copy? | (a) Copy a mesh when it costs at most 4 KB per saved draw | Examples: draws −90%, raw +33.6%. Scene assets: −81%, +2.1%. Golden Gate web: 148 → 33 draws. Expand all (module default): −94%, +48.0%. Lock shared users: −12.5%, −5.7% |
| D3 | Cap merged indices at 16 bits? | (a) Split a merged bucket at 65,534 vertices | Only Golden Gate web triggers it: +1 draw, raw −8%, index bytes −44%, brotli −1.8% to −3.0%, gzip +4% |
| D4 | Landing order | (a) PR 1 now carries the 24 non-engine commits (scene, skill and record). PR 2, after `v1-readiness`, carries `e72b610`, the wiring, D2, D3, the texts, the CHANGELOG and `dist/` | PR 1's tree rebuilds `dist/` byte-identical, `build.json` included |
| D23 | Model-facing additions | (b) Output only: the export summary and `kiln_inspect` gain draws per anchor, a draw estimate and flags; the `kiln_render` compact result stays as is | No input-schema change |
| D24 | Skill proposals | (a) Compose-scene corrections in PR 1, on this branch. Authoring and QA proposals after 0.10.0, with dogfood | See sections 6.4 and 6.5 |
| D34 | Phase 0 hazards | (a) Fix them in the engine PR | See below |
| D31 | Dogfood | (a) One compose-scene run before PR 1, and the usual runs before PR 2 | Two spends |

The D2 measurements cover 96 readable scene assets and all 86 examples. The main table compares
eight policies with the palette baseline. It is
`C:/Users/Mattm/X/kiln-draw-optimization/tmp/drawcalls/decisions/decide-engine/d2-table.md` and
the chart is `d2-policies.png`. The scratch module variant with the per-mesh price rule and the
D3 split is `decide-engine/rigid-merge-variant.ts`, +38/−7 lines against `src/rigid-merge.ts`.
All three files are ignored and local only.

**D34 hazards.** All three are present on `main`, on `966c8d6` and on this branch.
1. **Occlusion UV set.** `src/kit.ts:204`: after `packOcclusionIntoMetallicRoughness` folds
   occlusion into the metallic-roughness image, it points the occlusion texture at the
   metallic-roughness UV set. It never checks that the two sets match. A baked AO map on UV1
   would then be sampled with UV0. The packed R channel is still laid out for the occlusion's
   own UV set.
2. **Missing doc.** `src/render.ts:1103` and `src/__tests__/optimize.test.ts:4` cite
   `docs/kiln-material-consolidation-cycle.md`, which exists on no branch. The wiring patch
   removes the `render.ts` citation.
3. **Undocumented variables.** `KILN_BAKE_OPTIMIZE` and `KILN_BAKE_INSTANCE` are read in
   `src/local-runtime.ts:127-131`, `src/render.ts:1334, 1346` and
   `src/tools/registry.ts:2352-2353`. No doc, README, skill, `AGENTS.md` or CHANGELOG mentions
   them.

**Only the owner can answer** (from the D1 to D4 brief):
- **Outside callers.** Does anything outside this repository call `full`? Kiln Studio's web tier
  calls `optimizeGlbBytes`, and its mode is not visible here.
- **Release line.** Which release line carries the change?
- **Placement wrappers.** `composeSceneGLB(…, 'full')` now merges across placement wrappers,
  which carry no extras. Make them boundaries (one `keep` at that call site), or accept it.
- **Named nodes.** Accept the named-node contract, or plumb `keep` through `RenderSceneOptions`.
  That plumbing is an API change.
- **Caller knob.** A knob for the D2 threshold would touch `RenderSceneOptions`, the evaluator
  protocol (`src/evaluator/protocol.ts`) and the rebuild schema (`src/rebuild-options.ts`).
- **Served encoding.** Whether GLBs are served with brotli or gzip decides whether D3 also saves
  wire bytes.
- **Rebuilt revisions.** A revision saved with `KILN_BAKE_OPTIMIZE=full` rebuilds to different
  bytes, so `matchesSavedArtifact` becomes false. Tool paths record only `off` or `auto`.

## 6. Findings the engine and skills can use

### 6.1 three r186

This is the version both the engine and the scenes install. None of these findings was reported
upstream; the owner's policy is no AI-generated issues or PRs to three.js.

1. **Every instanced mesh binds its own pipeline.**
   - `RenderObject.getMaterialCacheKey()` appends each `InstancedMesh`'s uuid
     (`src/renderers/common/RenderObject.js:846-851`, next to an upstream TODO).
   - Measured: instancing Foundry Floor's campus structures with their exported materials took
     summed main-pass pipelines from 77 to 346.
   - So `EXT_mesh_gpu_instancing` saves draws in three's WebGPU renderer but adds a pipeline per
     instanced group.
   - `skills/kiln-compose-scene/references/runtime-scenes.md:111-114` is wrong on this point. It
     says groups that differ only by a material constant compile one pipeline each. Correcting it
     is D24 (a), in PR 1.
   - The fix that worked in the scenes was one shared material reading per-part data. Campus
     planting went from 21 to 10 pipelines at the overview.
2. **Mirrored tangent frames.** three builds the bitangent as `cross(N, T) * w` with no
   determinant term (`src/renderers/shaders/ShaderChunk/normal_vertex.glsl.js:9-15`;
   `src/nodes/accessors/Bitangent.js:18, 58`). So baking a mirrored normal-mapped part with
   `w *= sign(det)` changes its shading in three. That is why the merge joins only parts of the
   same handedness by default.
3. **Reversed depth** (`reversedDepthBuffer: true`, which gives a depth32float buffer).

   three handles:
   - depth reads (`perspectiveDepthToViewZ`, `src/nodes/display/ViewportDepthNode.js:227-239`);
   - shadow bias and comparison (`src/nodes/lighting/ShadowNode.js:314, 338`);
   - depth functions, the clear value and the frustum.

   three does not handle:
   - `SkyMesh`, which pins clip z to w (`examples/jsm/objects/SkyMesh.js:215`). That is the far
     plane only in a standard buffer.
   - `ReflectorNode`'s oblique near plane, which assumes a standard buffer
     (`src/nodes/utils/ReflectorNode.js:515-537`). Distant geometry drops out of the reflection.
   - Polygon offset, which both backends pass through unchanged
     (`src/renderers/webgpu/utils/WebGPUPipelineUtils.js:238-242`,
     `src/renderers/webgl-fallback/utils/WebGLState.js:997-1007`). Its sign must flip.

   The WebGL2 backend needs `EXT_clip_control`. Without it, three warns and falls back to a
   standard buffer (`src/renderers/webgl-fallback/WebGLBackend.js:276-288`).

   This matters to long-range scenes (Golden Gate's skyline flicker, D15), not to asset review
   captures, whose clip planes fit the asset.
4. **Multisample store.**
   - r186 stores the 4x canvas colour and depth after the resolve. With the store flags false,
     the attachments become transient.
   - Scene-kit discards them per tier (`ced34bb`). On the tablet, GPU busy fell by 3 to 8
     points; the desktop showed no change.
   - The store is required where a mid-pass `viewportDepthTexture` copy restarts the pass with
     Load.
   - No engine change is proposed.

### 6.2 gltf-transform 4.5.0 and the engine's IO

- **Tangents.** `transformPrimitive`'s `applyTangentMatrix` reads x after overwriting it, and
  never flips w. `rigid-merge.ts` bakes tangents itself.
- **Unknown required extensions.** The reader throws on them, so `extension-compat.ts` parses
  the JSON chunk instead.
- **Index width.** `createIndicesEmpty` writes 16-bit indices when the largest index is at most
  65,534, and `weld` rebuilds indices after the merge (D3).
- **Meshopt.** The engine's IO registers no meshopt decoder. It therefore cannot read Golden
  Gate's 20 terrain tiles, which require `EXT_meshopt_compression`.

### 6.3 Merging assets

- **Coplanar faces.** Merging changes the draw order of coplanar faces. On Golden Gate:
  - The bridge merge put the curbs after the coplanar walks in one draw. The curbs then won
    the depth ties and stippled both kerbs, and tile-mean parity missed it. `892d103` puts the
    curbs first in the merged mesh, at no extra draws.
  - Tower ribs against panels changed 193 px by more than 32 levels at golden-hour side-full.
    With reversed depth, that tie is gone (0 px over 8 levels).

  A merge cannot see these ties; authoring guidance and an inspection flag can (D23, D24).
- **Compression.** Baked world-space coordinates compress worse. With no copies at all, gzip
  still grows by 5.1% on scene assets and 7.0% on examples while raw bytes fall.
- **Shared meshes.** They dominate Kiln exports: their users account for 85.5% of example draws
  (3,548 shared meshes in 85 of 86 examples, none instanced). That is why the shared-mesh policy
  (D2) decides both draws and bytes.
- **Passes.** In scenes, shadow and reflection passes draw the asset again:
  - Farm: 270 of 583 draws were in the shadow pass.
  - Golden Gate: the reflection redrew 50 to 180.

  A draw estimate should state which passes it covers (D23).

### 6.4 Authoring and QA proposals (D24, after 0.10.0)

These come from the review's feedback map (`docs/reviews/2026-10-02-draw-optimization.md`,
lines 391-441).
- **`kiln-author-asset` geometry recipes** (`references/geometry-recipes.md`):
  - keep moving parts as named `Joint_*` pivots;
  - budget materials per rigid group, because draws per anchor equal its material count;
  - avoid coplanar faces across separate parts;
  - fold tiny parts that never move (eyes, bolts, hubs) into their parent's material.
- **`kiln-qa-asset`:** in the destination, check draws per anchor and material, and check that
  interaction survives a merge.

### 6.5 Compose-scene corrections planned for PR 1 (D24 (a), this branch)

- The pipeline sentence (section 6.1, item 1).
- Split merge buckets where the per-part draw order matters (the tower tie).
- Read mobile GPU work as busy × clock, not busy alone. Measured that way, the tablet's GPU
  savings were larger than the busy column showed: Farm walk −15% and Foundry campus −24%.
- If D15 is adopted, a note on depth precision over long view distances. With a 0.5 m near
  plane, the depth step grows with distance squared: about 0.12 m at 1 km, 3 m at 5 km and 48 m
  at 20 km. The note would cover reversed depth and the three r186 adaptations above.

These edits touch only `skills/kiln-compose-scene/`, which `v1-readiness` does not change.

## 7. Assets, packs and projects

- **Nothing changed.** No GLB, sealed pack, `packs/` entry, Kiln project, material, library
  collection or Live Review item changed. The scenes optimize their existing GLBs at load in
  scene-kit (merge by material within anchors, shadow and reflection stand-ins, the shadow
  cache), so no asset file grows.
- **The site.** It still serves the old Golden Gate and Foundry Floor builds from sealed packs
  pinned in `site/src/data/scene-packs.json`. Farm is bundled from `scenes/` source, so the next
  site build after a merge ships the optimized Farm. New packs and pins are D29, which belongs
  to the scenes and site work, not the engine.
- **Asset-level optimization** exists only as the unwired `full` merge (section 4) and the
  proposals in section 6.4.
- **Golden Gate's reversed depth (D15)** would be a scene-kit renderer option plus scene code. It
  needs no engine or asset change.

## 8. Known errors in the committed records (D30)

Do not copy these from the review or plan:
1. **"488 of 489"** (review line 229) is too high. Golden side-full also fails at economy and
   balanced (193 px) and on High WebGL2 (200 px).
2. **"Keep the tower ribs unmerged"**, open decision 5's alternative, also fails, at 177 px.
3. **The S6 tablet table understates GPU savings** (section 6.5).
4. **"Foundry Floor economy on the tablet"** (review line 352) has since run.
5. **The Farm pilot parity** (D-53, D-64) is missing from the review. The sweep ran it as D20.
6. **`scenes/packages/foundry-floor/REPORT.md:939`** gives 23-28 programs and 15-18 pipelines.
   The campus now measures 87-92 programs and 78-81 pipelines. That is `main` before this
   branch: with this branch's shared plant material, the campus view measures 27 programs and
   17 pipelines.

The review (lines 9 and 138) and the plan (lines 248 and 292) also carry two private links.
D30 recommends replacing them before any push.

The records commit on `draw-optimization-landing` (PR 1) corrects all six and replaces the
links; the line numbers above are those before it.

## 9. Where the evidence is

The paths are under `C:/Users/Mattm/X/kiln-draw-optimization/`. Everything not marked committed
is ignored and exists only on this machine.

| Path | What |
|---|---|
| `docs/reviews/2026-10-02-draw-optimization.md` (committed) | The review. The feedback map is at lines 391-441 and the gates at 454 onward |
| `docs/plans/2026-10-01-draw-optimization-cycle.md` (committed) | Plan of record, OD-1 to OD-18 and the progress log |
| `scenes/DECISIONS.md` (committed) | D-46 to D-64 |
| `tmp/drawcalls/phase0/` | `wiring.md`, `wiring.patch`, `wiring-tests.patch`, `rigid-merge-evidence.{ts,log}`, `extension-compat-scan.{ts,log}`, `size-probe.{ts,log}`, `wire-*.ab.json` |
| `tmp/drawcalls/decisions/decide-engine.brief.md` and `decide-engine/` | The D1 to D4 brief and its evidence: corpus, policy tables and chart, merged-tree gates, `dist/` sizes, fresh-clone logs |
| `tmp/drawcalls/decisions/decide-sweep.brief.md` | D15 to D34, and the order for asking all 36 |
| `tmp/drawcalls/decisions/summary.txt` | Summary of D1 to D14 |
| `tmp/drawcalls/decisions/decide-gg-depth.brief.md`, `tmp/drawcalls/flicker/README.md` | D15: depth precision and the reversed-depth prototype (`flicker/variants/revz2.diff`) |
| `tmp/drawcalls/decisions/decide-foundry-tablet.brief.md` | The instanced-mesh pipeline measurement (section 6.1) |
| `tmp/drawcalls/research/asset-optimization-frontier.md` | The research report, copied from the main checkout: Phase 0 hazards and model-facing proposals |
| `tmp/drawcalls/gates/final/` | Gate logs on `69f92fe` |
| `scenes/evidence/` | Counts, parity images and timing |

## 10. Suggested order for the engine PR

1. Merge 0.10.0 (PR #129).
2. Bring `e72b610` onto it, then apply `wiring.patch` and `wiring-tests.patch`.
3. Add D2's per-mesh price rule and D3's split to `src/rigid-merge.ts`, tests first. The scratch
   variant shows the shape of both.
4. Fix the D34 hazards, with a test for the occlusion UV set.
5. Update the three texts, the test citation and the CHANGELOG.
6. Run `node scripts/build-runtime.mjs all`, then the full gate including coverage.
7. Add D23's outputs as a separate model-facing change. Then run the D31 dogfood sessions in
   Agy and OpenCode.
8. The authoring and QA skill proposals (section 6.4) follow the same dogfood rule.
