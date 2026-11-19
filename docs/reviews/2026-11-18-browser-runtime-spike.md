# Browser runtime spike: building programs client-side (issue #377)

- **Date:** 2026-11-18. Timing runs 19:06 to 19:10 (UTC−5): Chrome main thread 19:06, worker 19:08, Node 19:09.
- **Commit measured:** `a14bac21` (main). This change adds only the spike under
  `scripts/browser-runtime-spike/` and this file. Nothing in `package.json`, `src/`, the site
  or the gallery changes, and `scripts/browser-runtime-spike/` is not in the package `files`.
- **Kiln version:** 1.8.0. Pinned dependencies that appear below: three 0.187.0, manifold-3d
  3.5.4, sharp 0.35.5 (libvips 8.18.7, zlib-ng 2.3.3), gltf-validator 2.0.0-dev.3.10.
- **Device class:** desktop. AMD Ryzen 7 3700X (8 cores, 16 logical CPUs), 32 GiB RAM,
  Windows 11 Pro 10.0.26200.
- **Browser:** Chrome 158.0.8127.36, headless (`--headless=new`), a fresh process and profile
  for every asset, HTTP caching off, so every first build is cold.
- **Node reference:** Node 24.20.0 (V8 13.6), the machine default, one fresh process per asset.
  The maintainer pin is Node 22.23.4; see [Byte equality](#byte-equality) for what differs.
- **Bundler:** Bun 1.4.2, `--target=browser`, ESM, code splitting, minified. No new
  dependency. No Playwright or Puppeteer: the harness starts Chrome directly and the page
  posts its results back to a local server.
- **Load:** the PC was shared with other sessions. Whole-machine CPU busy share was 32 to 34%
  idle before each pass and 25 to 95% during the timing windows (recorded per asset in the
  table). The perf-quiet window was free for every timing run. Treat absolute times as
  indicative; the Node and browser columns ran back to back at similar load.

## Answer

The build path runs in a browser. On this desktop, small and medium assets rebuild in 17 to
256 ms warm and the gallery's parametric kits in 41 to 256 ms (worker). Chrome is as fast
as Node here. It costs a 1.46 MiB (brotli) download before the first GLB, and its output does
not byte-match the Node build: 9 of 23 builds match. Every mismatch is explained. The pixels
of re-encoded PNGs are identical, and geometry differs only in a few normal components, by at
most 4.7e-10.

- **Gallery sliders: yes, but not by rebuilding in the browser.** The Seed Town kits already
  ship runtime GLBs that carry every option as switchable nodes, every colour as a named
  material and every size as morph targets ([packs/seed-town](../../packs/seed-town/README.md)).
  Sliders on those need no engine, download nothing extra, and show the same GLB a visitor
  downloads. This spike did not compare carried variants with rebuilt ones. An in-browser
  rebuild would add 1.46 MiB and give a GLB that differs from the Node build in 8 of 8 Seed
  Town builds.
- **Module export target: no, not yet.** It works only with three shims and a stubbed
  environment. Its output differs from Node's for two engine-level reasons that a package
  could not hide: implementation-defined `Math` and sharp's PNG encoder. And 741 KiB of its
  1,249 KiB (brotli) initial load is a texture library most programs never read. Revisit it
  after the engine changes listed under [What a module target would need](#what-a-module-target-would-need).
- **Sandbox:** only maintainer sources pinned by SHA-256 may run, only in a dedicated worker,
  never on the page's main thread. Any other source would need an opaque-origin sandboxed
  frame with a restrictive CSP. Details under [Trust boundary](#trust-boundary).

## Assets

Fifteen pack revisions from `packs/`, ordered by GLB size, and eight Seed Town builds at
different parameter values. The Seed Town sources come from the authoring workspace and are
checked against the `sourceSha256` pins in `scenes/packages/seed-town/ASSET-MANIFEST.json`.
Each build replays the revision's saved exporter settings, as `kiln asset --rebuild` does,
with no requirements binding.

Pack revisions that need material-library maps cannot be built here at all. Those maps are
hydrated from the release mirror, not kept in `packs/`, so the Node reference fails on them
too. That is 194 of 625 pack revisions, and their material decode path
(`material-library-node.ts`) was not exercised. The original selection included six of them
(Trojan horse, Trojan soldier, battle scene, farm trailer, stone golem, cabin dining table).
They were swapped for material-free revisions of similar size.

Every asset built in Node and in both browser modes with no error.

## Results

Times are milliseconds. "Cold" is the first build in a fresh process or page, after the
engine has loaded. "Warm" is the median of 5 more builds of the same input (2 when the cold
build exceeded 4 s). "Browser = Node" compares the SHA-256 of the GLB with the Node build of
the same source and parameters, for the main thread and the worker. CPU is the
whole-machine busy share during each asset's window.

| Asset | Params | Source KiB | GLB KiB | Node cold / warm | Chrome main cold / warm | Chrome worker cold / warm | Browser = Node | CPU % (node, main, worker) |
|---|---|--:|--:|--:|--:|--:|:-:|--:|
| oht-rail-straight |  | 11 | 16 | 219 / 39 | 158 / 37 | 147 / 29 | yes / yes | 48, 75, 70 |
| signal-tower |  | 3.8 | 14 | 178 / 32 | 144 / 38 | 215 / 35 | yes / yes | 54, 77, 88 |
| seagrass-clump |  | 8.9 | 16 | 148 / 23 | 155 / 23 | 157 / 22 | no / no | 49, 82, 80 |
| shrub-mound |  | 3.4 | 20 | 148 / 22 | 133 / 17 | 141 / 19 | yes / yes | 45, 77, 83 |
| load-port |  | 9.5 | 32 | 233 / 54 | 263 / 51 | 205 / 54 | yes / yes | 48, 87, 83 |
| pave-field-a |  | 9.1 | 74 | 235 / 50 | 201 / 52 | 201 / 51 | yes / yes | 47, 80, 81 |
| generic-sedan |  | 24 | 115 | 445 / 203 | 493 / 139 | 441 / 185 | yes / yes | 62, 73, 80 |
| humanoid-work-robot |  | 18 | 160 | 406 / 178 | 403 / 140 | 390 / 133 | yes / yes | 57, 79, 67 |
| generic-transit-bus |  | 13 | 189 | 380 / 139 | 417 / 128 | 379 / 121 | yes / yes | 46, 84, 73 |
| bench-park |  | 18 | 230 | 371 / 136 | 348 / 117 | 370 / 137 | yes / yes | 56, 77, 74 |
| low-ember-lamp |  | 14 | 248 | 426 / 240 | 393 / 155 | 418 / 174 | no / no | 48, 65, 80 |
| coconut-palm-lean |  | 26 | 352 | 452 / 193 | 439 / 135 | 422 / 180 | no / no | 58, 88, 83 |
| wool-sofa |  | 29 | 3,833 | 1,381 / 1,151 | 1,301 / 946 | 1,330 / 977 | no / no | 55, 59, 64 |
| golden-gate-bridge |  | 44 | 12,267 | 6,248 / 6,250 | 5,506 / 5,038 | 6,230 / 4,956 | no / no | 55, 54, 65 |
| holodeck-gateway |  | 64 | 14,446 | 4,272 / 4,659 | 3,500 / 4,075 | 3,813 / 3,605 | no / no | 75, 75, 58 |
| street-lamp | defaults | 9.4 | 54 | 186 / 44 | 240 / 44 | 267 / 48 | no / no | 63, 94, 94 |
| street-lamp | arms=twin, height=4.4, lit=true | 9.4 | 54 | 192 / 41 | 208 / 46 | 160 / 41 | no / no | 52, 94, 62 |
| tree | defaults | 24 | 170 | 374 / 149 | 527 / 134 | 302 / 111 | no / no | 62, 95, 73 |
| tree | preset spruce | 24 | 170 | 319 / 117 | 331 / 107 | 284 / 104 | no / no | 49, 85, 68 |
| tree | form=column, height=6, spread=2.5 | 24 | 170 | 323 / 113 | 374 / 111 | 315 / 95 | no / no | 34, 85, 65 |
| facade-bay | defaults | 23 | 151 | 288 / 135 | 440 / 136 | 279 / 128 | no / no | 25, 76, 64 |
| facade-bay | bayWidth=2, window=arched, finish=brick, cornice, shutters, balcony | 23 | 151 | 307 / 138 | 342 / 174 | 329 / 121 | no / no | 24, 75, 68 |
| roof | form=mansard, dormers=two, width=8 | 23 | 196 | 404 / 237 | 517 / 218 | 465 / 256 | no / no | 31, 60, 74 |

Before the first build:

- **Engine load.** Loading the bundle took 81 to 139 ms on the main thread. Starting the worker
  until it reported ready took 118 to 183 ms. Importing the Node bundle took 324 to 445 ms.
- **Memory.** The JS heap after six builds was 17 to 50 MiB for small and medium assets and
  165 to 181 MiB for the three large ones (main thread, `performance.memory`).

Determinism and the saved revisions:

- **Repeat builds.** Every repeated build in every mode gave the same bytes as its first.
- **Main thread and worker.** The two browser modes gave identical bytes for every asset.
- **Node runs.** The two Node reference runs (18:58 and 19:09) agreed byte for byte.
- **Saved revisions.** For the 18 default-parameter builds, the Node build equals the saved
  revision's `asset.glb` in 13 cases. The other 5 are older revisions saved by an earlier
  engine.

## Bundle size

This is the build path only: `renderGLBInProcess` from `src/render.ts`, which includes QA and
the Khronos validator but no views and no QA images.

| | raw KiB | gzip KiB | brotli KiB |
|---|--:|--:|--:|
| Initial load: the entry and its static imports | 3,157 | 1,378 | 1,249 |
| Fetched before the first GLB: initial load plus the validator chunk, `manifold.wasm` and two small chunks | 4,025 | 1,684 | 1,493 |
| Everything emitted, including the lazy views and evaluator chunks never fetched | 4,285 | 1,782 | 1,580 |

Gzip is level 9 and brotli quality 11. The three heaviest pieces:

- **`src/material-texture-library.generated.ts`:** 1,072 KiB raw, 759 KiB gzip and 741 KiB
  brotli. It holds base64 PNGs and is in the initial load because `material-resources.ts`
  imports it statically. Without it the initial load is about 508 KiB brotli. No Seed Town
  kit reads it, because they draw their own textures.
- **The Khronos validator chunk:** 291 KiB raw, 74 KiB brotli. Every build loads it, because
  QA validates the final GLB.
- **`manifold.wasm`:** 529 KiB raw, 155 KiB brotli. The page fetched it once per build, six
  times for six builds, because the engine instantiates Manifold again for each build. An
  HTTP cache would hide the transfer but not the per-build compile.

## Byte equality

Nine of the 23 builds match Node byte for byte. Every mismatch was diffed with
`glb-diff.mjs`: glTF JSON by path, every accessor element (strided included), and every
embedded image by bytes and then by decoded pixels with sharp. Two causes account for all
of them. Neither is a bug in the bundle.

1. **PNG encoding: 12 builds.** Procedural textures are encoded to PNG by sharp, which
   deflates with zlib-ng 2.3.3 at level 9. A browser has no sharp. The spike's encoder writes
   the same chunk layout (IHDR, pHYs, one IDAT, filter type 0, IEND) and deflates with
   `CompressionStream`. The compressed bytes differ, so image lengths, bufferView offsets
   and, on `holodeck-gateway`, the atlas provenance `finalImageSha256` follow.
   - **What is equal:** the decoded pixels of every re-encoded image, and every other JSON
     field.
   - **What passes through:** library textures (`bench-park`, two of `wool-sofa`'s six
     images) are embedded as their original bytes and match.
   - **Node-side dependency:** a Node experiment shows Node's own zlib does not reproduce
     zlib-ng's output either. So textured GLB bytes already depend on the sharp build, not
     only on the platform.
2. **Transcendental `Math`: 5 builds.** In `street-lamp` (both values) and `tree` (all three
   values), 2 to 56 vertex normal components per mesh differ. Most are residues of order
   1e-16 on components that are zero up to rounding; the largest difference is 4.7e-10.
   Positions, UVs and indices are equal. `math-probe.mjs` explains why. It checksums 24 Math
   operations over 80,000 fixed inputs in four engines (equal letters mean equal results):

   | engine | `sin cos tan asin acos atan atan2 exp log cbrt sinh cosh tanh log2 log10 expm1 log1p asinh acosh atanh` | `Math.pow` | `**` | `sqrt` | `hypot` |
   |---|---|---|---|---|---|
   | Node 22.23.4 (V8 12.4) | A | A | A | A | A |
   | Node 24.20.0 (V8 13.6) | A | B | B | A | A |
   | Chrome 158 | C | B | B | A | A |
   | Bun 1.4.2 (JSC) | D (only `tanh` equals Chrome) | B | D | A | D |

   - **Which is correct:** Chrome's `cos(0.1)` and `sin(2.5)` are the correctly rounded
     values (checked to 60 digits); Node's are one ulp off. That fits Chrome having moved to
     correctly rounded maths, but two samples do not prove it.
   - **Why Node matches itself:** Node 22 and 24 agree on trigonometry, which is why the
     maintainer's Node builds are stable today. They already disagree on `pow`.
   - **The general point:** the same program gives different bytes in different JavaScript
     engines whenever a rounding difference survives float32 quantization. Here that was
     5 of 23 builds. The engine profile review (`2026-11-18-engine-profile.md`) reached the
     same conclusion for WebAssembly kernels.

Node-to-browser byte equality is therefore achievable only if the engine owns both
ingredients. It would need a pure-JS PNG encoder used in Node as well, and deterministic
transcendental functions provided to programs and used by the engine's own geometry code,
which includes three.js. Until then, "equal" can only mean equal JSON, equal decoded pixels
and geometry within a small tolerance (4.7e-10 here).

## Node-only edges

The bundler resolved 52 Node-only imports from 26 engine and dependency modules, plus the
spike's own `node:buffer` import. Each was recorded by module and importer (`bundle.mjs`
writes `bundle-report.json`) and then shimmed, given Bun's
browser fallback, or replaced by a stub that throws a named error if called.

**Reached by these builds and replaced:**

| Edge | Importers | Replacement |
|---|---|---|
| `node:crypto` `createHash('sha256')`, sync | `render.ts`, `qa/registry.ts`, `requirements-context.ts`, `requirements-identity.ts`, `material-resources.ts`, `texture-bake.ts` | `crypto-shim.mjs`, a streaming SHA-256, because WebCrypto is async |
| `node:crypto` `createHash('sha1')` | `texture-bake.ts` (texture name hash) | `crypto-shim.mjs` |
| `sharp`, raw pixels to PNG | `texture-bake.ts` `encodePngFromRaw`, for any procedural texture (12 of 23 builds) | `sharp-shim.mjs` encoder; this is the cause of the PNG mismatches |
| `sharp`, PNG to RGBA | `textures.ts` `loadTexture`, for library textures | `sharp-shim.mjs` decoder; pixel-identical to sharp in its test |
| `Buffer` global | `render.ts` and others | Bun's built-in browser fallback for `node:buffer`, installed as the global by `prelude.mjs` |
| `process.env` | `qa/run.ts`, `community-exporter.ts`, `render.ts` (`KILN_BAKE_*`), `kit.ts` | defined as `{}` at bundle time; the Node reference runs with every `KILN_*` variable removed |

**Bundled but never called by these builds, so stubbed:**

- **In the initial load:**
  - `kit.ts`: `child_process`, `fs/promises`, `os`, `path` and `util` (KTX2 encoding through
    an external binary). `util.promisify` runs at module load, so its stub returns a wrapper
    that fails only when called.
  - `requirements-json.ts`: `fs/promises` and `path` (requirements read from a file).
  - `textures.ts`: `fs` and `path` (texture loaded from a file path).
  - `@gltf-transform/core`: `fs` and `path`, for `NodeIO` only; the engine uses `WebIO`.
- **In lazy chunks that were never fetched:**
  - `evaluator/subprocess.ts`, `evaluator/isolation.ts`, `evaluator/protocol.ts`: process
    launch, through `renderGLB`'s dynamic imports.
  - `cli-output.ts` and `atomic-directory.ts`.
  - `views/*`: `views/renderer-id.ts` (`readFileSync` at module load), `views/png.ts`
    (`zlib`) and the capture caches. Only rig or mobility requirements load these.
  - `material-library-node.ts` and `material-map-export-node.ts`: `fs/promises`, `path` and
    `sharp`. These run for material-library payloads, which were not covered.
  - `exporter-node.ts`: `@napi-rs/canvas`. This is the textured path of the `three` exporter,
    not covered: every `three`-exporter pack revision uses library materials. `render.ts`
    always passes `nodeExportPlatform` there, although `community-exporter.ts` has a
    `browserPlatform`.
  - `manifold-3d`: `module` (Node only). In the browser it fetches `manifold.wasm` beside the
    chunk, which `bundle.mjs` copies.
- **Not bundled at all:** `src/uv.ts` imports `xatlasjs/dist/node/*` through a variable
  specifier, which no bundler can follow. A program that unwraps UVs would fail in the
  browser. No asset in the set does.

## Trust boundary

Measured with `source-policy-probe.ts`, which runs the build path's own
`assertGeneratedSourceSafe` on one-line programs without executing them.

| Probe | Engine check |
|---|---|
| `globalThis`, `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator` | refused |
| `Function`, `.constructor`, `eval`, dynamic `import()` | refused |
| `localStorage`, `indexedDB`, `open(...)`, `parent`, `top`, `postMessage` | **accepted** |
| `importScripts`, `new Worker`, `new Image().src = ...`, `crypto`, `setTimeout` | **accepted** |
| `while (true) {}` | accepted |

The denylist was written for Node, where none of the accepted names is a capability. In a page
several are. A program on the main thread could read the gallery origin's storage, open
windows, message the embedding page, or send data out through an image URL. An infinite loop
would freeze the page. Code in this repository already says the check is a safety net, not
isolation; in a browser it is not even a complete denylist.

**Decision:**

- **Who may supply source.**
  - **Allowed:** maintainer-authored gallery revisions only. The page fetches the source and
    refuses to run it unless its SHA-256 equals the pin in the site's data (the
    `sourceSha256` already recorded for Seed Town).
  - **Visitor input:** parameter values only. These are data, validated by
    `validateParamsInput` and the program's declared ranges and choices.
  - **Refused:** source from a URL, a query string, an upload or another site.
- **Where it runs.**
  - **Pinned sources:** a dedicated module worker, never the main thread. The page sends
    source, options and parameter values as data; the GLB comes back as a transferred
    buffer. The page ends the worker after a deadline, the browser counterpart of the
    subprocess evaluator's 60 s limit.
  - **Any source that is not pinned** (out of scope here) also needs an opaque-origin frame.
    The worker is created inside an `<iframe sandbox="allow-scripts">` without
    `allow-same-origin`, served from a separate origin, with a CSP of `default-src 'none'`
    and script, worker and connect sources limited to the engine's origin. That removes
    storage, cookies and network on the gallery origin.
- **What globals it can reach.** The sandbox globals the engine passes in, plus everything
  the denylist does not name on the worker's global scope: `indexedDB`, `caches`,
  `postMessage` to the page, `setTimeout`, `crypto`, and `fetch` reached under another name.
  In a pinned-source worker these are acceptable because the source is reviewed. In the
  isolated frame they are confined to an opaque origin.
- **Compared with Node:**
  - **Library default (in-process):** the same `new Function` and the same denylist, with
    no isolation.
  - **Packaged CLI and MCP (subprocess):** a separate process with a 60 s deadline, a
    512 MiB heap cap and a sanitized environment, documented as not a complete sandbox.
  - **`isolated`:** adds namespaces, no network, a read-only filesystem and a CPU limit.
  - **Browser worker:** like the subprocess for deadline and separation, but browsers offer
    no per-worker memory cap, so a runaway program can crash the tab. Network and storage
    are the origin's unless the opaque-origin frame removes them, as `isolated` does for
    the network.

## What a module target would need

These are the engine changes that would make a `browser` export honest. Each is sized by this
spike.

1. **A pure-JS PNG encoder, used by Node too.** Textured bytes would then match across
   platforms and sharp releases. It removes the largest mismatch class (12 of 23 builds) and
   the `sharp` edge in `texture-bake.ts`.
2. **Deterministic transcendental `Math`.** The functions would be offered to programs and
   used in engine geometry, or byte equality would be redefined as JSON, pixels and float32
   tolerance. This removes the 5 geometry mismatches. It also matters for Node alone,
   because Node 22 and 24 already differ on `pow`.
3. **Load the built-in texture library lazily.** It costs 741 KiB brotli of the 1,249 KiB
   initial load.
4. **Instantiate Manifold once per page, not once per build.** The page fetched
   `manifold.wasm` six times for six builds.
5. **Make platform services injectable.** Synchronous hashing, PNG encode and decode, and the
   exporter platform would be injected instead of imported from `node:crypto`, `sharp` and
   `exporter-node`. Gate `kit.ts`, `requirements-json.ts` and `textures.ts` file paths
   behind them.
6. **Write a browser-aware source policy,** or a policy that is an allowlist.
7. **Give `xatlasjs` a static import,** and a browser decode for material-library maps.

## Not measured

- **Mobile and low-end devices, Firefox and Safari.** Safari's JSC would differ in maths, as
  Bun does.
- **Network transfer time.** The harness served from `127.0.0.1`.
- **Material-library assets** (194 of 625 pack revisions) and the textured `three`-exporter
  path.
- **KTX2, UV unwrapping, rig and mobility diagnostic views.**
- **An unloaded machine.** CPU was 25 to 95% busy from other sessions throughout.
- **Node 22.23.4 build timings.** Node 22 was used only for the `Math` probe.

## Reproduce

From the repository root, after `bun install --frozen-lockfile`. Output goes to
`tmp/browser-runtime-spike/`, which is ignored.

```sh
bun scripts/browser-runtime-spike/bundle.mjs
node scripts/browser-runtime-spike/node-reference.mjs --seed-town /path/to/kiln-seed-street
node scripts/browser-runtime-spike/harness.mjs --seed-town /path/to/kiln-seed-street --mode main
node scripts/browser-runtime-spike/harness.mjs --seed-town /path/to/kiln-seed-street --mode worker
node scripts/browser-runtime-spike/report.mjs
bun scripts/browser-runtime-spike/source-policy-probe.ts
node scripts/browser-runtime-spike/math-probe.mjs   # and open math-probe.html in a browser
bun test scripts/browser-runtime-spike
```

Without `--seed-town`, only the 15 pack revisions run. The harness finds Chrome in its
standard install path, or takes `--chrome <path>`.
