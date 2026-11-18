# Engine profile, end to end (issue #372)

- **Date:** 2026-11-18 (timing runs 21:26 to 21:35 UTC, profiles 21:35 to 22:01 UTC)
- **Commit measured:** `b783d9e5` (main). This change adds only the harness, its asset list, its
  profile reader with a test, and this file.
- **Kiln version:** 1.8.0. Pinned dependencies that appear below: three 0.187.0, manifold-3d
  3.5.4, sharp 0.35.5, gltf-validator 2.0.0-dev.3.10.
- **Machine:** an otherwise idle CachyOS laptop (kernel 7.3.0), AMD Ryzen 7 3750H, 8 logical
  CPUs, 15 GiB RAM.
- **Tools:** Bun 1.4.2, Node 22.23.4, npm 12.2.0, matching `toolchain.json`. The harness runs
  on Bun from `src/`; it needs no `dist/`. `KILN_RENDER=cpu`, `KILN_QA_MODE=observe` (every
  rule runs, none throws).
- **Load:** see [Machine state](#machine-state). The 1-minute load rises from 0.18 to about 1.6
  during a run; that is the harness itself.

## Answer

No phase justifies a native kernel today. Each hot spot below has a TypeScript fix first, and
the two that look most like kernels (the raster pixel loop and value noise) use JavaScript
`Math` functions whose results are implementation-defined, so a WebAssembly copy could not
promise the same bytes as the pure-JS path without changing both.

Across the eleven assets, summing the median of each phase:

| phase | ms | share |
|---|---:|---:|
| build (sandbox evaluation and geometry) | 20,441 | 31% |
| QA (all rules, the flush-face check, the Khronos validator, final-GLB checks) | 12,581 | 19% |
| of which the flush-face check | 2,905 | 4% |
| GLB export | 5,903 | 9% |
| CPU raster of the 3x2 review sheet | 21,534 | 33% |
| other (pipeline time not inside a timed phase) | 5,017 | 8% |
| total | 65,475 | 100% |

The two cathedral programs are 80% of that total. Without them: build 41%, QA 21% (flush 4%),
export 15%, raster 17%, other 6% of 12.9 s.

## Asset set

`scripts/profile-engine-assets.json` names eleven saved programs. Each is the latest saved
revision of its asset, or a published site input, and all build without hydrated material maps.

| id | tier | triangles | source |
|---|---|---:|---|
| pumpkin-plant | small | 1,566 | `packs/farm/...` |
| van-delivery | small | 1,820 | `packs/foundry-floor/...` |
| planter-long | small | 2,112 | `packs/holodeck/...` (few triangles, a 65 KB program with procedural textures) |
| tool-front-robot-arm | small | 2,436 | `packs/foundry-floor/...` |
| golden-gate-bridge | medium | 11,480 | `packs/golden-gate-bridge/...` |
| statue-figure | medium | 34,224 | `packs/holodeck/...` |
| plaza-fountain | medium | 57,402 | `packs/holodeck/...` |
| mech-3 | medium | 68,604 | `site/public/text-to-3d/.../mech-3.kiln.js` |
| gateway | large | 132,164 | `packs/holodeck/...`, the largest pack source that builds without maps |
| cathedral-1 | large | 2,913,434 | `site/public/text-to-3d/.../cathedral-1.kiln.js` |
| cathedral-9 | large | 3,979,168 | `site/public/text-to-3d/.../cathedral-9.kiln.js`, the final cathedral and the largest program in the repository |

Choosing the set, a survey built the latest revision of every asset under `packs/*/sources` and
every `.kiln.js` site input (365 programs). 265 built; all 100 that did not stopped on a
portable material whose maps are hydrated on request and are not in the repository (53 Cabin in
the Woods, 17 Farm, 16 Troy, 14 Holodeck). Built pack sources stop at 132,164 triangles; the next sizes are the cathedral
revisions at 2.4 million and more. The Cathedral Square pack keeps no sources in the repository,
so the cathedral here is the text-to-3D page's program.

## How to repeat

```sh
bun install --frozen-lockfile
# Timing: medians of 5 runs (small to large) and 3 runs (the cathedrals), after one warm-up run
KILN_RENDER=cpu bun scripts/profile-engine.ts --runs 5 --json timing-a.json \
  --assets pumpkin-plant,van-delivery,planter-long,tool-front-robot-arm,golden-gate-bridge,statue-figure,plaza-fountain,mech-3,gateway
KILN_RENDER=cpu bun scripts/profile-engine.ts --runs 3 --json timing-b.json --assets cathedral-1,cathedral-9

# Whole-process CPU profile, attributed to phases by wall-clock window
KILN_RENDER=cpu bun --cpu-prof --cpu-prof-dir=prof --cpu-prof-name=gateway.cpuprofile \
  scripts/profile-engine.ts --runs 3 --assets gateway --windows prof/gateway.windows.json
bun scripts/cpuprofile-phases.ts prof/gateway.cpuprofile prof/gateway.windows.json

# Per-phase profiles, for the cathedral (see "Not measured")
KILN_RENDER=cpu bun scripts/profile-engine.ts --runs 1 --assets cathedral-1 \
  --cpu-prof-phases build,flush,penetration,rules,export,khronos,final,raster --cpu-prof-dir prof
bun scripts/cpuprofile-phases.ts prof/cathedral-1.raster.run1.cpuprofile --phase raster
```

The cathedral needs about 4.6 GiB in a plain run. On Linux, run profiles inside a memory
ceiling, for example `systemd-run --user --scope -p MemoryMax=9G -p MemorySwapMax=512M bun ...`.

### What each phase times

The harness calls the engine's own exported functions; nothing in `src/` is instrumented.

| phase | function |
|---|---|
| build | `executeKilnCode`: the program in the sandbox, its primitives, textures and geometry operations |
| flush | `analyzeFlushFaces`, the advisory flush-face check |
| penetration | `collectRequirementsSceneEvidence`: the part self-intersection measurement (manifold booleans) |
| rules | `runRequirementsSceneQa`: the registry rules on the built scene |
| export | `renderReviewDerivativeGlb`: texture bake, glTF document, dedup, GLB write; the bytes `renderSceneToGLB` writes, without its QA |
| khronos | `validateFinalGlbBytes` on the final GLB |
| final | `inspectGlbIntegration` and `appendRequirementsFinalQa` on the final GLB |
| raster | `renderGlbViewGrid`: load the GLB, hash it, rasterize six 384-pixel cells, encode the PNG |
| pipeline | `renderGLBInProcess` end to end, as `kiln render` runs it before views |

QA = flush + penetration + rules + khronos + final. Other = pipeline - build - QA - export:
runtime and material metrics, manifest bookkeeping and measurement noise. Total = pipeline +
raster. The pipeline runs the program a second time, so build and QA are measured on separate
evaluations of the same program.

## Results

Median milliseconds and share of the asset's total. QA includes the flush-face column.

| asset | tier | triangles | build | QA | (flush) | export | raster | other | total |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| pumpkin-plant | small | 1,566 | 9.6 (4%) | 119 (48%) | 3.2 (1%) | 7.1 (3%) | 92.7 (38%) | 17.5 (7%) | 246 |
| van-delivery | small | 1,820 | 4.9 (2%) | 93.2 (41%) | 6.1 (3%) | 7.0 (3%) | 94.0 (42%) | 27.3 (12%) | 226 |
| planter-long | small | 2,112 | 1220 (58%) | 77.3 (4%) | 5.0 (0%) | 541 (26%) | 187 (9%) | 85.6 (4%) | 2110 |
| tool-front-robot-arm | small | 2,436 | 21.9 (7%) | 152 (48%) | 7.4 (2%) | 6.5 (2%) | 134 (42%) | 5.4 (2%) | 320 |
| golden-gate-bridge | medium | 11,480 | 516 (39%) | 311 (24%) | 23.4 (2%) | 359 (27%) | 112 (8%) | 22.0 (2%) | 1320 |
| statue-figure | medium | 34,224 | 661 (50%) | 150 (11%) | 43.2 (3%) | 102 (8%) | 212 (16%) | 203 (15%) | 1329 |
| plaza-fountain | medium | 57,402 | 58.3 (8%) | 366 (48%) | 72.8 (9%) | 8.1 (1%) | 303 (39%) | 32.5 (4%) | 768 |
| mech-3 | medium | 68,604 | 732 (32%) | 861 (38%) | 157 (7%) | 220 (10%) | 406 (18%) | 60.2 (3%) | 2279 |
| gateway | large | 132,164 | 2082 (48%) | 599 (14%) | 155 (4%) | 751 (17%) | 619 (14%) | 290 (7%) | 4340 |
| cathedral-1 | large | 2,913,434 | 2174 (12%) | 4348 (25%) | 1277 (7%) | 1177 (7%) | 8392 (48%) | 1447 (8%) | 17538 |
| cathedral-9 | large | 3,979,168 | 12961 (37%) | 5503 (16%) | 1156 (3%) | 2725 (8%) | 10983 (31%) | 2827 (8%) | 34998 |

Every timed function, median milliseconds:

| asset | build | flush | penetration | rules | export | khronos | final | raster | pipeline |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| pumpkin-plant | 9.6 | 3.2 | 97.6 | 9.8 | 7.1 | 6.4 | 2.4 | 92.7 | 154 |
| van-delivery | 4.9 | 6.1 | 72.6 | 5.5 | 7.0 | 4.8 | 4.1 | 94.0 | 132 |
| planter-long | 1220 | 5.0 | 0.3 | 60.3 | 541 | 8.5 | 3.2 | 187 | 1924 |
| tool-front-robot-arm | 21.9 | 7.4 | 120 | 14.7 | 6.5 | 6.6 | 3.6 | 134 | 186 |
| golden-gate-bridge | 516 | 23.4 | 199 | 62.0 | 359 | 16.7 | 9.8 | 112 | 1208 |
| statue-figure | 661 | 43.2 | 0.7 | 66.5 | 102 | 24.6 | 15.0 | 212 | 1117 |
| plaza-fountain | 58.3 | 72.8 | 68.8 | 147 | 8.1 | 52.2 | 26.2 | 303 | 465 |
| mech-3 | 732 | 157 | 167 | 371 | 220 | 119 | 47.9 | 406 | 1873 |
| gateway | 2082 | 155 | 0.1 | 87.1 | 751 | 255 | 102 | 619 | 3721 |
| cathedral-1 | 2174 | 1277 | 384 | 1481 | 1177 | 194 | 1012 | 8392 | 9146 |
| cathedral-9 | 12961 | 1156 | 523 | 2182 | 2725 | 241 | 1400 | 10983 | 24015 |

Use the medians, not single runs. Of the 54 phase medians of 100 ms or more, 20 had every sample
within 5% of the median. The widest spreads were the `cathedral-1` validator (one 321 ms sample
against a 194 ms median), the `mech-3` flush-face check (227 against 157) and the first recorded
`mech-3` build (1,005 against 732). Differences below about 25% between two assets or two runs
are not evidence.

The flush-face check examined every triangle up to `gateway`. On both cathedrals it stopped at
its 400,000-triangle budget (`truncated: true`), so its 1.2 to 1.3 s there is the cost of the
cap, not of the whole scene.

## Hot spots and decisions

Self time is the leaf frame of each CPU sample, attributed to the phase whose window contains
it. "Module" shares sum self time by file. Frames with no file but a line number belong to the
Kiln program evaluated by `new Function` and are labelled `evaluated`.

The issue's conditions for a kernel are: deterministic (same bytes on every machine), no
network and no install step, and the pure-JS path kept and tested for identical output.

### 1. CPU raster of the review sheet: fix in TypeScript

33% of the summed total, 48% of `cathedral-1`, 38 to 42% of the three small assets without procedural textures.

Two regimes, both in `src/views/raster.ts` and `src/views/triangle-coverage.ts`:

- **Large scenes: per-triangle setup.** `cathedral-1` raster, 9.4 s sampled: `pushTri` 15.5%,
  the built-in `every` 10.7%, `compositingOrder` 9.6%, the `collectTriangles` mesh callback
  6.9%, `hypot` 4.6%, `isFinite` 3.2%, `edge` 2.9%, `colorOf` 2.1%: about 55% before a pixel is
  written. `collectTriangles` runs once per view, six times per sheet, and allocates a
  `Float64Array(9)` and an object per triangle each time; `compositingOrder` copies the list per
  view; `prepareTriangleCoverage` allocates an array for `every(Number.isFinite)` and a closure
  per triangle. `rasterizeView` (projection and the pixel loop) is 28.3% and `sample` 11.3%.
- **Small scenes: the pixel loop.** `pumpkin-plant` raster: `rasterizeView` 56.7% and `sample`
  21.8%. Few large triangles cover many pixels; each pixel calls the coverage closure.

`renderGlbViewGrid` also hashes the same GLB twice (`digest` 6.5% of the `gateway` raster).

Decision: fix in TypeScript. Collect the triangles once per sheet into typed arrays, keep the
order and arithmetic, inline the coverage test without changing its expressions, and hash once.
The existing raster tests then guard identical pixels. Not a kernel: the per-triangle normal
uses `Math.hypot`, whose result the language leaves to the implementation, so a WebAssembly
copy could only match the JS path byte for byte if both changed to one shared formula. Re-profile
after the TypeScript fix; only a pixel loop that still dominates large assets would be worth a
kernel prototype.

### 2. Procedural texture compilation in build: fix in TypeScript

Engine-owned texture code is the largest part of build on every textured asset. Module shares of
build self time (`src/procedural-texture-v2-compiler.ts`, `-v3.ts`, `procedural-texture.ts`):
`planter-long` 68%, `cathedral-1` 65%, `mech-3` 61%, `gateway` 42%, `cathedral-9` 17%.
Hot functions: `valueNoise`, `fbm` and the per-pixel loop of `compileProceduralTextureSpecV2`,
then `covers` and `paint` in v3. The v2 loop walks `layers.entries()` and returns a new
`[r, g, b]` tuple per layer per pixel, and every build compiles every texture again even when its
recipe is unchanged.

Decision: fix in TypeScript. Remove the per-pixel allocations with the same arithmetic in the
same order (same bytes), and consider reusing compiled pixels by recipe hash within a process,
copying them so a program cannot change a cached texture. Not a kernel yet: value noise is
integer hashing and double arithmetic, which a kernel could reproduce exactly, but one v2 layer
uses `Math.sin`/`Math.cos` (implementation-defined), and the allocation cost should be removed
and re-measured first.

### 3. The program's own code in build: leave alone

`cathedral-9` build, 14.1 s sampled: 49% is the program itself (its `bakeLight` 11.8%, an
implicit-surface `polygonize` and its field `F`, `weld`), `simplifyGeometry` 6.2%, manifold
WebAssembly about 5%, procedural textures 17%. `cathedral-1` has neither a light bake nor a
polygonized field, and builds in 2.2 s. The engine cannot speed up an author's loops;
leave alone. A future guidance note could say that baking per-vertex light over millions of
triangles in the program costs seconds per build.

### 4. Texture bake in export: fix in TypeScript

Export is 26% of `planter-long` (541 ms for 2,112 triangles) and 27% of `golden-gate-bridge`.
On textured assets it is texture work, not geometry: PNG encoding at compression level 9 in
sharp (native, part of the `(native)` share), SHA-256 provenance hashes (`update`, `digest`),
and `hasTranslucentPixel` in `src/texture-bake.ts`, a byte-by-byte alpha scan: 36.7% of
`mech-3` export, 11.6% of `cathedral-9`, 8.6% of `gateway`. glTF Transform's
`interleaveAccessors` is 10.7% of `gateway` export.

Decision: fix in TypeScript where it is ours: scan alpha four bytes at a time or carry an
"opaque" fact from compilers that write alpha 255, and avoid hashing the same bytes more than
once. PNG encoding is already native in sharp; leave it. Not a kernel.

### 5. QA rules: fix in TypeScript

1.5 to 2.2 s on the cathedrals and 371 ms on `mech-3`. `cathedral-9` rules, 2.5 s sampled:
`iterableValues` in `src/qa/universal.ts` 20.7% (it copies each typed array into a `number[]`),
`geometryDiagnostics` 14.8% (vertex welding through string keys built by `clone`, `toArray`,
`map`, `join`), `analyzePartConnectivity` 14.0%, `Math.hypot` 13.8%.

Decision: fix in TypeScript: read typed arrays in place and weld by numeric keys. Not a kernel.

### 6. Flush-face check: leave alone

4% of the summed total, 3 to 29% of QA. At most 157 ms up to 132,164 triangles; 1.16 to 1.28 s
on the cathedrals, where it stops at its 400,000-triangle budget. 85 to 90% of its self time is
in `src/qa/flush-faces.ts` (`meet` 23 to 30%, `sharedArea`, `findFlushFaces`, `grow`,
`select`). The issue quoted up to 2.0 s near 300,000 triangles on a loaded workstation before
#418 cut pairs that cannot share area; on this machine the capped worst case is 1.28 s.

Decision: leave alone. It is advisory, capped by budgets, and already reduced; at 4% of the total
it is not where time goes. Not a kernel.

### 7. Part self-intersection: fix one line in TypeScript, leave the booleans

The measurement costs 69 to 199 ms on small and medium assets with candidate pairs, 40% of
`pumpkin-plant`'s total, and 384 to 523 ms on the cathedrals. A profile of six passes over
`pumpkin-plant` (5 parts, 8 pairs) puts 70% of the time under `Manifold.volume()`, which runs
the lazy intersection boolean in manifold's WebAssembly. Separately, `analyzePartPenetration`
calls `(await import('manifold-3d')).default()` on every pass and so instantiates a new
WebAssembly module each time; measured alone that costs a median 8.7 ms per call against
0.0005 ms for the cached `getManifoldModule()` that `src/solids.ts` already provides.

Decision: reuse the cached module (about 9 ms per render; confirm every manifold object is still
deleted so a long session does not grow). Leave the booleans: they are already compiled
WebAssembly and capped by pair budgets. Not a kernel.

### 8. Final-GLB material metrics: fix in TypeScript

`final` is 1.0 to 1.4 s on the cathedrals. `cathedral-9` final: `accessorPoint` 42.6% and
`transformPoint` 12.6% in `src/material-metrics.ts` call `getArray()` and allocate a tuple per
vertex per instance to sum surface area. Decision: fix in TypeScript (read each accessor once,
no per-vertex tuples). Not a kernel.

### 9. Khronos validator: leave alone

194 to 241 ms on the cathedrals (their instanced GLBs are 14 and 16 MB) and 255 ms on `gateway` (15 MB). It is
the third-party validator (`gltf_validator.dart.js`, 95% of its self time). Leave alone.

### Remainder

"Other" is 2 to 15% per asset (203 ms on `statue-figure`). It was not broken down.

## Machine state

| run | start (UTC) | load at start | end (UTC) | load at end |
|---|---|---|---|---|
| timing, nine assets | 21:26:57 | 0.18, 0.33, 0.26 | 21:29:18 | 1.29, 0.80, 0.45 |
| timing, cathedrals | 21:29:18 | 1.43, 0.83, 0.47 | 21:34:52 | 1.66, 1.49, 0.89 |
| profiles (several runs) | 21:35:06 | 1.69, 1.49, 0.90 | 22:01:02 | 1.08, 1.08, 1.06 |

Load averages are 1, 5 and 15 minutes; the timing runs began on an idle machine. The harness uses about 1.6 cores (sharp's thread pool
and the garbage collector); no other heavy job ran. The profile runs were separate from the
timing runs, so profiler overhead is not in any table above.

## Not measured

- **A whole-process profile of either cathedral, and any profile of `cathedral-9`'s raster.**
  The plain `cathedral-9` run peaks at 4.6 GiB. Under Bun's profiler, both whole-process and
  per-phase, the raster step grew past a 9 GiB ceiling, even raster alone from a saved GLB in a
  fresh process. `cathedral-1` (2.9 million triangles, same code path) was profiled per phase
  instead; its raster profile completed at 7.5 GiB.
- **Assets whose materials need hydrated maps**, including Troy's battle scene (208,178
  triangles by its manifest) and the Cabin pack: their maps are not in the repository.
- **Anything between 132,164 and 2.4 million triangles**: no buildable source in the repository
  falls there.
- **Node.** The harness runs the TypeScript sources on Bun; the built `dist/` under Node was not
  timed.
- **The subprocess and isolated evaluators.** The saved manifests were built with the subprocess
  evaluator; this profile uses the in-process one, so process start-up and transport are not in
  the numbers.
- **GPU views.** Out of scope: `KILN_RENDER=cpu` throughout.
- **The "other" remainder** was not broken into its parts.
