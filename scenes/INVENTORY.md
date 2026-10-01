# Shapes & Seasons Farm: inventory of the current runtime

Prepared 2026-09-29 for the R3F rewrite. Companion document: `SPEC.md` (same folder). This file is the
evidence base: what exists today, where it lives, what was measured, what is still unverified.
Nothing here is a design; designs are in SPEC.md and reference the system ids (S01...) and risk ids used below.

## 0. How to read this document

Conventions.

- Statements about code are read from the source file at the cited line. `file:N` means line N of that file.
- `[R]` marks a fact taken from a production record that I did not re-measure (the record file is named).
- `[U]` marks an item I could not verify. Section 13 lists them all.
- Everything else was computed or read by me on 2026-09-29 from the sealed r33 archives, the source, npm
  metadata (`npm view`), or byte comparison of installed packages.

Path abbreviations used throughout.

| Abbreviation | Meaning |
|---|---|
| `KC` | `C:/Users/Mattm/X/kiln-commons/` |
| `SHOW` | `KC/farm-pilot/scene/showcase/` (the pilot runtime source, read-only) |
| `PROD` | `KC/farm-pilot/review/production/` (decision and measurement records, read-only) |
| `SEAL` | `KC/site-build/mirror/packs/farm/r33/` (sealed r33 archives and `downloads.json`, read-only) |
| `SITE` | `C:/Users/Mattm/X/kiln-site-workbench/site/` (website worktree, another agent's, read-only) |
| `ENGINE` | `C:/Users/Mattm/X/kiln-oss/` (Kiln engine repository; its `node_modules/three` is 0.186.0) |

Baseline. The parity baseline is the sealed r33 delivery (project revision
`r_0000000033_e782d188f2d265d553cb6881db5298a1b63cd7d7337ae2cce9250b4ad1623a90`). Live files under
`KC/farm-pilot/` were being modified by another agent while r34 was sealed (the live `scene.json` changed at
2026-09-29 02:06 and was 170,379 B against 163,069 B in the sealed r33 archive; the sealed r34 one is 166,651 B), so
this inventory reads the sealed copies. The sealed scene archive contains a `viewer.mjs` of 26,658 B, the same size as the live one.

r34 (another agent's work, sealed 2026-09-29 at 03:09; read-only for me). The owner accepted every asset except the
farmhouse floors, then accepted the farmhouse wood-floor revision `r_01f97f5e943e4c2693b6db8596f3e353` ("Yes, the
farmhouse wood floor revision passes.", `PROD/farmhouse-floor-review.json`, `PROD/consolidated-owner-review.json`). The r34
project revision is `r_0000000034_a1b09b00d04071160c72e6b52723e88e274da032319ca118738b53f73bc796cd`. [R] It differs from
r33 by one added `Mesh_InteriorFloor` (y 0.38 against a foundation top of 0.40) and a re-tessellated `Mesh_ShellStone`;
farmhouse runtime SHA-256 changes from `598d044a5213b87f4bc1aac7d5543c920a53e145ab0f004429e45222489842a9` (r33) to
`1b02596b30e3417e3f8336893694f2614002e28154408803b145154097de8512` (r34).

Checked by me, read-only, at 03:14 on 2026-09-29 in `KC/farm-pilot/delivery/farm-r34-documented-downloads/` (the mirror
copy `KC/site-build/mirror/packs/farm/r34/` did not exist yet):

- Archives: runtime zip 7,680,392 B, scene zip 4,295,548 B, editable zip 22,433,293 B. I recomputed all three SHA-256
  values (runtime `5673740a...`, scene `955aa5a8...`, editable `2e596172...`) and they equal that folder's `downloads.json`,
  which records `fullPackAccepted: true` (23 of 23), `performanceQualified: false`, `publicationAuthorized: false`.
- Only `farmhouse.glb` differs among the 23 runtime GLBs: 521,692 B (r33) against 549,584 B (r34); the 23 GLBs total
  7,098,444 B against 7,070,552 B. Parsed from the GLB JSON: r34 farmhouse has 24 nodes, 16 meshes, 10 materials, 12 textures
  and 4,080 triangles (r33: 23, 15, 10, 12, 3,816). `Mesh_InteriorFloor` has 228 triangles; `Mesh_ShellStone` 348 against 312.
- The extracted r34 scene folder holds the same pilot runtime as r33. A recursive comparison of `scene/scene/` finds only
  `README.md`, `scene.json` (163,069 B in r33, 166,651 B in r34) and the farmhouse GLB in `assets/` (named by its hash) different;
  every module, the vendored three and addons, `layout.json`, `grass.*` and `viewer.mjs` (26,658 B) are byte-identical. At archive
  level `delivery.json`, `licenses/ASSET-LICENSE.txt` and `metadata/*` also differ. So the r33 findings in this inventory hold for
  r34's runtime code, and the section 5 counts (589 placements, 843 trees) hold for r34; in the section 5.1 table only the
  farmhouse row changes (GLB bytes 549,584; nodes 24; meshes 16; triangles 4,080; materials and textures unchanged).
- No browser or device measurement of the r34 scene is recorded (`KC/OVERNIGHT.md`, 03:10 finding 5; secondary source).
  `site-handoff.json` (64,967 B) exists beside the archives; I did not read it.

The rewrite must take `assetBase` as its only asset input and must not hard-code `r33`.

## 1. The scene in one page

A 72 x 72 m farm ("Shapes & Seasons Farm", layout version 2) built from 23 authored Kiln GLB assets, presented
on procedural terrain with a flowing stream, a timber bridge, 14,000 tufts of instanced field grass and 843
boundary trees. The user orbits an overview camera or walks a third-person farmer ("Rowan") who opens doors
and gates and drives a tractor. It is a hand-written ES-module runtime (no framework) on a vendored three.js
0.186.1 `three/webgpu` build: `WebGPURenderer` with automatic WebGL2 fallback, TSL node materials for the stream
and the grass, three-mesh-bvh 0.9.15 collision, and a stack of draw-call and CPU optimisations that must survive
the rewrite. The page around it is a review tool (asset inspector, measurement, profiling) that must not ship.

Verified counts.

| Item | Value | Provenance |
|---|---|---|
| Assets | 23; 7,070,552 B; 98 embedded PNG; no glTF extensions; no skins | computed from the runtime GLBs; all 23 SHA-256 match `scene.json` and the runtime zip |
| Placement entries / placements | 168 entries expand to 589 (confirmed) | computed from `layout.placements` with `repeat.count` |
| Woodland trees | 843 (confirmed), 16 cells of 64 m, 8 packed groups | trees and cells computed with the pilot algorithm; groups `PROD/desktop-qualified-r33.md` [R] |
| Field grass | 14,000 tufts = 16 groups x 875 on a 4 x 4 grid of 18 m cells over -36..36; `grass.bin` 168,000 B (stride 12) | `grass.json`, `grass-recipe.json` |
| Bridge | 34 boxes (22 planks, 8 posts, 4 rails), one mesh | `bridge.mjs:5-6` |
| Terrain triangles | farm 44,352; surrounding 39,690; stream surface 12,976 | computed by re-running the geometry code; `PROD/landscape-stream-r33.md` records 41,472 / 39,670 / 10,943 (stale, see section 12) |
| Triangles submitted before culling | about 1.53 M plus grass (placements 793,802 before omitted parts are removed, of which wheat alone is 549,072; woodland 640,680 = 843 x 760; terrain 84,042; stream 12,976; bridge 408) | computed from GLB accessor counts and the placement table |
| Static-cached placements | 555 (fence-straight 42, fence-corner 12, barrel 3, hay-bale 5, cabbages 80, wheat 369, pumpkin 12, tree 25, rock 7); 4,191 nodes | placements computed; nodes `PROD/static-transform-decision-r33.md` [R] |
| Instance batching | 83 groups, 54 dynamic; 1,967 of 2,000 source meshes instanced | `PROD/desktop-qualified-r33.md`, `PROD/wide-batches-decision-r33.md` [R] |
| Frame graph | 560 hidden source roots initially, 559 after a growth swap | `PROD/frame-graph-decision-r33.md` [R] |
| Doors and gates | 9 (farmhouse door, watermill door, barn doors, 6 paddock gates) | derived from `findDoor` and the placement table |
| Views / route points / destinations | 12 / 5 / 7 | `layout.views`, `layout.route`, `play.mjs:75` |
| Paths / beds | 16 / 4 | `layout.presentation` |

## 2. Source tree and provenance

Pilot runtime folder `SHOW` (module sizes in bytes; line counts in parentheses where I read the file).

| File | Bytes | Role |
|---|---|---|
| `viewer.mjs` | 26,658 (191 lines) | Boot, loading phases, renderer, lights, asset load, placement, frame loop, all review UI wiring |
| `play.mjs` | 14,389 (96) | Walking, driving, doors, interaction prompt, destinations, play camera, key handling |
| `collision.mjs` | 4,454 (38) | Capsule and ray queries on triangle-soup BVHs |
| `interaction-rig.mjs` | 4,163 (45) | Door discovery, farmer seat IK, empty-handed pose |
| `site-layout.mjs` | 2,064 | River, bridge and terrain height maths; grass eligibility |
| `terrain.mjs` / `landscape.mjs` | 1,283 / 4,082 | Farm terrain mesh; surrounding terrain; woodland placement and instancing |
| `presentation.mjs` | 2,415 | Assembles ground, surround, woodland, stream, bridge, grass |
| `stream-geometry.mjs` / `stream-material.mjs` | 2,676 / 2,826 | Clipped water surface; TSL water shader |
| `bridge.mjs` / `meadow-material.mjs` | 1,330 / 2,336 | Bridge mesh; procedural meadow textures |
| `instance-batches.mjs` / `pack-woodland.mjs` | 2,653 / 2,573 | Cell instancing (tangent workaround inside); forest packing |
| `static-transforms.mjs` / `frame-graph.mjs` / `crop-shadows.mjs` | 1,191 / 2,204 / 533 | Matrix caching, matrix-update scheduling, crop shadow policy |
| `texture-pool.mjs` | 3,139 | Identical-texture pooling with embedded-image SHA-256 |
| `view-quality.mjs` / `view-visibility.mjs` | 1,114 / 1,100 | Quality profiles; suspend when hidden |
| `herd-motion.mjs` / `activity.mjs` | 2,822 / 2,050 | Animal routines; benchmark activity previews |
| `fullscreen.mjs` / `touch-review.mjs` | 2,002 / 2,678 | Fullscreen button; touch camera buttons |
| `planting.mjs` / `scene-motion.mjs` | 464 / 191 | Soil part selection; watermill spin direction |
| `measurement.mjs` + `profiling/*` | 10,526 + about 14,000 | Measurement and profiling (review-only) |
| `bvh.mjs` | 172,319 | three-mesh-bvh 0.9.15 bundled with esbuild 0.25.12 |
| `field-grass.mjs` | 31,014 | Field Grass library bundle (commit `2a0d3a3256dc8d8f6d9de68f3dc1636a621559c5`, v0.1.0) |
| `grass-bake-runtime.mjs`, `static-batches.mjs` | 3,917 / 1,561 | Not imported by `viewer.mjs` (unused) |
| `three/three.webgpu.js` etc. | 2,284,850 / 1,458,113 (`three.core.js`) / 662,772 (`three.module.js`) / 36,854 (`three.tsl.js`) | Vendored three 0.186.1, unminified; `vendor-build.json` records file hashes |
| `addons/` | OrbitControls, GLTFLoader, RoomEnvironment, SkeletonUtils, BufferGeometryUtils | Vendored three addons (byte-identical to 0.186.0, section 9) |
| `index.html` / `style.css` | 7,156 / 5,403 | Review page, import map, panels |
| `scene.json`, `layout.json`, `grass.json`, `grass.bin`, `grass-recipe.json`, `meadow-recipe.json` | see section 7 | Data |

Sealed delivery `SEAL` (`downloads.json`, schema 1, `fullPackAccepted: false`).

| Archive | Bytes | SHA-256 | Files |
|---|---|---|---|
| `shapes-and-seasons-farm-runtime.zip` | 7,672,584 | `4d6902406d186631360770b894b217858c51df27964a1ad9b50b064dd3ced61c` | 107: `models/<id>.glb` (23) plus `<id>.json` and `<id>.kiln-metadata.json`, `metadata/*`, `licenses/*`, `previews/*`, `README.md`, `delivery.json` |
| `shapes-and-seasons-farm-editable.zip` | 22,422,357 | `5650bd42da35192f0b93e01164e8479ed22935be1a56d69b9bfef0aa1fa8d02a` | 130 |
| `shapes-and-seasons-farm-scene.zip` | 4,289,186 | `d7b8c0c55c1278573773fec51ddd93b205b3497b260ddb4c77a27f462d67760c` | 117: `scene/` with modules, `scene/assets/<sha>.glb` (23), data, `serve.mjs`, `source/field-grass/`, `build-runtime/package.json`, licences |

Parent delivery manifest hash `sha256:f213b2cb7d862bc7303958b12231e2a66e2cf4762d7b8acc0b6bd21484354d7b`.
Each archive carries a `delivery.json` sealing its members. Cross-checks I ran: the sealed `scene/layout.json`
equals `scene.json.layout` (canonical JSON compare), and all 23 runtime-zip `models/<id>.glb` files match
`scene.json.assets[].runtimeSha256` byte for byte, so the runtime zip and the scene zip carry the same GLBs.
The public URL layout already planned by the website is `packs/farm/r33/models/<id>.glb` under
`https://assets.kilnstudio.tools/` (`SITE/src/data/upload-manifest.json`, 23 entries with bytes and sha256,
"upload only after owner authorization"); the same names appear in the runtime zip, so the staged layout in
SPEC.md keeps `models/<id>.glb`.

## 3. Runtime systems

Home column: K = generic, moves to `scene-kit`; F = Farm-specific, stays in `packages/farm`; P = the page/site owns
it; D = developer tooling only; X = not carried into the rewrite.

### 3.1 System table

| Id | System and source | Inputs | Wiring (startup / per frame) | Home |
|---|---|---|---|---|
| S01 | Boot and loading phases: `viewer.mjs:37-39` (`status`, `loadingStage` yields through one paint), `74-159` (`initialize`) | none | Startup only. Texts: "Reading farm inventory...", "Starting graphics...", "Preparing lighting. First visits can take longer...", "Loading assets: N of M...", "Building the farm, paths and interactions...", "Drawing the first view. Preparing materials and shadows..." | K (progress phases) and P (display) |
| S02 | Manifest fetch and version check: `viewer.mjs:76-79` | `/scene.json` (root-relative) | Startup. Throws if `String(THREE.REVISION) !== manifest.threeVersion.split('.')[1]` (compares only "186") | F (becomes `pack.json`) |
| S03 | Renderer creation and backend detection: `viewer.mjs:81-82, 133-134` | `?backend=webgl2`, `?quality`, `devicePixelRatio` | Startup: `new WebGPURenderer({canvas, antialias:true, alpha:false, forceWebGL})`, `await renderer.init()`, pixel ratio, sRGB output, ACES Filmic, exposure .95, shadows, `info.autoReset=false`; backend from `renderer.backend.isWebGPUBackend`/`isWebGLBackend`, throws "Unknown backend". Per frame: `renderer.render(scene, camera)` (`viewer.mjs:148`) | K |
| S04 | Lighting and environment: `viewer.mjs:84-86` | quality tier (shadow map size) | Startup: `PMREMGenerator.fromScene(RoomEnvironment, .04)` -> `scene.environment`, `environmentIntensity .65` (generator and room disposed); `HemisphereLight(0xffffff, 0x747b67, 1.4)`; sun `DirectionalLight(0xffffff, 2.7)` at (25, 42, 20), shadow camera +-44, near 1, far 115, `normalBias .018`, map size per tier. Nothing per frame | F (values), K (env helper) |
| S05 | Asset fetch, verify, parse: `viewer.mjs:91-97` | `manifest.assets[]` (`file`, `runtimeSha256`) | Startup: 23 fetches in parallel; `crypto.subtle.digest('SHA-256')` must equal `runtimeSha256` or throw "Runtime hash mismatch"; `GLTFLoader.parseAsync(bytes, location.origin + '/')`; image hashes for pooling | K (loader, hash), F (ids) |
| S06 | Texture pooling: `texture-pool.mjs:3` (`embeddedImageHashes`), `22` (`poolIdenticalTextures`); called `viewer.mjs:101` | parsed models | Startup: identical embedded image bytes plus identical sampler state share one texture; unreachable duplicates disposed; stats `uniqueTexturesBefore/After`, `sharedAssignments` | K |
| S07 | Placement instantiation: `viewer.mjs:105-112`, `planting.mjs:1-2` | `layout.placements` | Startup: for each of 589 placements `SkeletonUtils.clone`, remove `omittedPartPaths` (45 of the 168 entries), wrapper `Group` named `<id>-<n>` (repeat offset `step*n`), yaw in degrees, every mesh `castShadow = receiveShadow = true`, soil part hidden when `soilMode === 'terrain'` (40 of the 168 entries), one `AnimationMixer` per instance | F |
| S08 | Clips and mixers: `chooseClip` `viewer.mjs:50`, initial clips `119`, `scene-motion.mjs:2` | clip names | Startup: windmill and watermill "Spin"; cow, sheep, chicken "Graze" else "Idle"; time offset `(index*.37) % duration`; watermill Spin `timeScale -1`; one-shot clips (Open, Close, DoorOpen) LoopOnce clamped. Per frame `viewer.mjs:147`: `mixer.update(min(.1, dt))` only for instances with an action | F |
| S09 | Site layout maths: `site-layout.mjs:1-27` | x, z | Pure functions used by terrain, landscape, stream, bridge, grass eligibility, river gating, driving height | F |
| S10 | Farm terrain: `terrain.mjs:2` (`makeTerrainGeometry`) | `layout.presentation` beds and paths | Startup: 145 columns x 155 rows, 44,352 triangles, 3 material groups, vertex colour and uv; `ground.receiveShadow = true`. Static | F |
| S11 | Surrounding landscape: `landscape.mjs:3, 9`; `presentation.mjs:13` | none | Startup: rings out to 384 m (`outer = [40, 52, 72, 104, 152, 224, 320, 384]`), 0.5 m rows out to 120 m then 2 m; 2 material groups; 39,690 triangles. Static | F |
| S12 | Woodland: `landscape.mjs:23, 30` (`woodlandPlacements`, `addWoodland`); `pack-woodland.mjs:3`; `viewer.mjs:104` | `faceted-tree` model | Startup: 843 deterministic placements in rings 41..122 m, one `InstancedMesh` per 64 m cell per source mesh (16 cells x 4), then packed into 8 whole-forest groups by (geometry, material, caster membership). Static; no per-frame work | F (packing algorithm K) |
| S13 | Stream: `stream-geometry.mjs:5` (`makeStreamGeometry`), `stream-material.mjs:4` (`createStreamMaterial`); `presentation.mjs:14` | both ground geometries | Startup: bed triangles clipped at `STREAM_LEVEL = -.12`, attributes `waterDepth`, `waterFlow`; TSL `MeshStandardNodeMaterial`, transparent, `depthWrite false`, `renderOrder 2`. Per frame: `renderGroup` clock uniform `frame.time % 6` updated inside the render | F |
| S14 | Bridge: `bridge.mjs:4` | watermill `Mesh_Building_Wood` material | Startup: single 34-box mesh shares the timber material; same triangles used for collision. Static | F |
| S15 | Ground materials: `meadow-material.mjs:3, 16`; `presentation.mjs:9-11` | recipe seed 271 | Startup: 256 px procedural colour, roughness and normal `DataTexture`s (repeat 1/3, world repeat 12 m), `MeshStandardMaterial` `normalScale .4`; soil = clone of `cabbage-stage-1` `Mesh_SoilMound` material; path = soil clone, colour `0xe3c6a0`, roughness 1, `vertexColors`, `normalScale .2`. Static | F |
| S16 | Field Grass: `field-grass.mjs` (library), `presentation.mjs:16-18`, `grass.json/bin` | 16 groups | Startup: `decodeTufts`, `createGrassLayer(buffers, {preset: STORYBOOK, name, palette, style})` per group; `frustumCulled = true` after `computeBoundingSphere()` with radius + 1; `setGrassQuality(f)` sets `mesh.count = floor(instanceMatrix.count * f)`. Wind runs inside the shader | F (vendored lib) |
| S17 | Instance batching: `instance-batches.mjs:3-17`; rebuild `viewer.mjs:31` | placements | Startup: groups visible single-material static meshes by geometry, material, cast, receive and a 96 m cell (offset 48 m); excludes farmer, tractor, trailer, farmhouse, barn, watermill, fence-gate; skips skinned, multi-material, transparent, morph and negative-determinant meshes and groups of one; hides source meshes; adds `InstancedMesh` to the scene. Per frame: dynamic groups (any clip, tractor, farmer) rewrite `instanceMatrix` from source `matrixWorld` and recompute bounding spheres (`frame-graph.mjs:30-33`) | K (algorithm), F (policy) |
| S18 | Crop shadow policy: `crop-shadows.mjs:4`; `viewer.mjs:31` | crop ids | Startup: `setCropShadows(instances, false, false)` for cabbage stages, wheat, pumpkin-plant before batching: crops neither cast nor receive shadows | F |
| S19 | Static transform cache: `static-transforms.mjs:3-14` | `fixedAssets` (12 ids) | Startup: for 555 immutable placements set `matrixAutoUpdate = matrixWorldAutoUpdate = false` on every node after one update. Nothing per frame | K (algorithm), F (list) |
| S20 | Frame graph: `frame-graph.mjs:4-37` | scene, instances, batches | Startup: requires an identity scene; sets `scene.matrixWorldAutoUpdate = false`; classifies fixed roots; hides source roots whose meshes are all batched. Per frame `frameGraph.update()`: updates only non-fixed scene children, then rewrites dynamic batch matrices. Falls back to `staticBatches.update()` if disabled | K/F |
| S21 | Quality profiles: `view-quality.mjs:2-10`; `viewer.mjs:26-27, 81-87` | `?quality=` (high, balanced or economy; default high) | Startup only (reload to change): see appendix A.4. Sets pixel-ratio cap, grass fraction, shadow map size, PCF or Basic shadow filter | K (tiers), F (mapping) |
| S22 | View visibility: `view-visibility.mjs:3-12`; `viewer.mjs:141, 143` | `IntersectionObserver` on the canvas, `visibilitychange`, `pagehide`, `pageshow` | Startup: observer created just before the loop. Per frame: `if (!viewVisibility.visible) return` after `last = now` (so no dt accumulates while hidden). Only a non-persisted `pagehide` calls the dispose callback (`view-visibility.mjs:9`); it stops the loop, disconnects the resize observer, fullscreen, touch panel, play controller and controls, but does NOT dispose the renderer, geometries, materials or textures (the pilot is a full page). The suspend callback only aborts a running measurement | K |
| S23 | Orbit camera and views: `viewer.mjs:43-44, 46, 48, 49`; OrbitControls addon | pointer, wheel, touch; `layout.views` | Startup: `PerspectiveCamera(40, 1, .02, 250)`, `OrbitControls` with `enableDamping = false`, `maxDistance = 160`, `maxPolarAngle = .495 pi` (interior views `pi - .02`), default `minDistance 0`, pan enabled. Per frame `controls.update()` unless play is active | K rig, F views |
| S24 | Route playback: `viewer.mjs:144, 188` | `layout.route` (5 points) | 30 s linear interpolation of position and target between route points, driven by wall time (`now - route`), cancelled on controls `start`. Per frame | F (public "tour" optional) |
| S25 | Collision world: `collision.mjs:3-37`; `play.mjs:6, 14-20`; `bvh.mjs` | ground, bridge, instances | Startup: `add(root, {filter, dynamic})` bakes world-space triangle soup (positions only), MeshBVH `targetLeafSize: 10`; `consolidateStatic()` merges all non-dynamic soups into one BVH named "Static farm world"; doors, tractor and trailer stay dynamic with a local BVH transformed by the live matrix. Query API: `intersects`, `resolve` (3 iterations), `rayDistance`, `floor(pos, maxDrop = .35)`, `dispose` | K (world), F (which meshes) |
| S26 | Walking: `play.mjs:45-57` | keys, camera direction | Fixed step 1/120 with accumulator capped at .1 (`play.mjs:89`); details in section 6.2 | K mover, F rules |
| S27 | Doors and gates: `interaction-rig.mjs:32-44`; `play.mjs:15, 39, 90` | player, E key | Startup: `findDoor` per instance (9 doors). Per step: `amount = damp(amount, target, 7, step)`; the door reverts and reports if the player capsule intersects | F |
| S28 | Tractor: `play.mjs:32-39, 58-69`; `interaction-rig.mjs:10-30` | W/S/A/D or `driveInput` | Kinematic drive, section 6.4 | F |
| S29 | Interaction prompt: `play.mjs:39-44` | player position | Per frame: nearest door (centre of pivot bounds, radius 2.6) or tractor (radius 2.5); button text and enabled state | F, K (UI) |
| S30 | Play camera: `play.mjs:12, 27-28, 93-94` | OrbitControls offset | `resetCamera` on start, mount, exit, visit; `updateCamera()` replaces `controls.update()` while active; obstruction ray; player hidden when the camera is closer than 1.25 m | K rig, F parameters |
| S31 | Destinations and reset: `play.mjs:74-77` | selector, button | Teleport with `world.resolve`, yaw table; reset returns the farmer to `home` | F |
| S32 | Farmer poses: `interaction-rig.mjs:2-30`; `play.mjs:91` | joint names | Empty-handed arm pose each walk step; `seatFarmer` two-bone IK each drive step | F |
| S33 | Herd motion: `herd-motion.mjs:3-23`; `viewer.mjs:115, 146` | instances | Deterministic loops (appendix A.6) for 4 cows, 6 sheep, 10 chickens; on by default except with `?profile`; stopped for measurement and activity previews. Per frame `farmLife.update(min(.1, dt/1000))` | F |
| S34 | Fullscreen: `fullscreen.mjs:2-19`; `viewer.mjs:88` | button | Requests fullscreen on `#farm-view`; resizes on change | P |
| S35 | Touch review buttons: `touch-review.mjs:3-30` | `(pointer:coarse)` | DOM buttons Zoom in (x .8), Zoom out (x 1.25), pan four ways, Reset; hides "Walk as Rowan", "Start near" and "Reset farmer" on coarse pointers; help text "Walking and driving use a keyboard on desktop." | K (camera buttons) |
| S36 | Key handling: `play.mjs:70-72` | `document` `keydown`/`keyup` | Handles `KeyW/A/S/D`, arrows, `Space`, `KeyE`, `Escape` (`preventDefault` on all of them, even on focused buttons); ignores INPUT/SELECT/TEXTAREA; clears keys on `blur` and `visibilitychange`. `dispose` (`play.mjs:94`) removes only the `keydown` and `keyup` listeners and the controls `change` listener; the `blur` and `visibilitychange` listeners are never removed | K |
| S37 | First-submission bookkeeping: `viewer.mjs:149` | none | On the first `renderer.render` return: records timings, sets the ready message, enables controls. This is the analogue of `onReady` | K |

### 3.2 Startup sequence, in order

1. Module load, `viewer.mjs:25-47`: quality from `?quality=`, scene (`background 0xc0d6d4`, `Fog(0xc0d6d4, 120, 220)`), camera,
   OrbitControls, UI hooks.
2. `initialize()` phase "Reading farm inventory": fetch `/scene.json`, version check.
3. "Starting graphics": renderer creation and `await renderer.init()`, pixel ratio, colour, tone mapping, shadows,
   pass counter (`viewer.mjs:80-82`).
4. "Preparing lighting": PMREM environment, hemisphere, sun, resize function and `ResizeObserver`, fullscreen
   (`viewer.mjs:83-90`).
5. "Loading assets": parallel fetch, verify, parse of 23 GLBs (`viewer.mjs:91-97`).
6. "Building the farm": texture pool (101), presentation (102-104: ground, surround, woodland, stream, bridge,
   grass, then `setGrassQuality`, then woodland packing), placements (105-112), play, activity and herd (113-118),
   initial clips (119), `rebuildBatches()` (121: crop shadows, batching, static cache, frame graph),
   draw-call instrumentation (122), review UI (123-132), backend label (133-135).
7. "Drawing the first view": all controls disabled (136-138); loop started with `renderer.setAnimationLoop`
   (142); first render submission at `viewer.mjs:149`.

Startup is strictly serial: manifest, renderer, environment, assets. The rewrite may fetch and parse assets while the
renderer initialises (SPEC section 6).

### 3.3 Per-frame order (`viewer.mjs:142-153`)

1. `dt = now - last; last = now`; return if the view is not visible (S22).
2. Route playback (S24) if active.
3. Measurement advance (D).
4. Herd update if enabled and no activity preview or benchmark (S33), else `farmLife.stop()`.
5. `activity.update` (D), mixers for instances with an action (S08), `play.update` (S26-S29, S32).
6. `frameGraph.update()` else `staticBatches.update()` (S20, S17).
7. `play.updateCamera()` if play is active else `controls.update()` (S30, S23).
8. `renderer.info.reset()`, pass counter, `renderer.render`, first-submission bookkeeping (S37).
9. Every 200 ms: stats and label text (D, X).

All simulation `dt` values are clamped to `min(.1, dt/1000)`.


## 4. Rendering

### 4.1 Build, renderer and colour

| Item | Current state | Source |
|---|---|---|
| three build | Vendored three 0.186.1 in `SHOW/three/` (`three.webgpu.js` 2,284,850 B; `three.core.js` 1,458,113 B; `three.module.js` 662,772 B; `three.tsl.js` 36,854 B), unminified, no bundler. An import map in `index.html` resolves the bare `three*` specifiers to the vendored files. Addons (OrbitControls, GLTFLoader, RoomEnvironment, SkeletonUtils, BufferGeometryUtils) are vendored under `SHOW/addons/` | `vendor-build.json`, folder listing |
| Renderer | `THREE.WebGPURenderer` from `three/webgpu`; options `{canvas, antialias: true, alpha: false, forceWebGL: ?backend=webgl2}`; `await renderer.init()` before any other call | `viewer.mjs:6, 81` |
| Backend detection | `renderer.backend.isWebGPUBackend` gives "WebGPU"; `isWebGLBackend` gives "WebGL2 fallback"; anything else throws "Unknown backend" | `viewer.mjs:133` |
| Automatic fallback | V: in the vendored `three.webgpu.js`, a failed WebGPU `init()` makes `WebGPURenderer` create the WebGL2 backend itself (`getFallback`, one console warning). `forceWebGL: true` skips WebGPU | vendored `three.webgpu.js` |
| Adapter identity | Not shown to users. Device evidence records carry `backend.device.adapterInfo` (S24+: vendor `qualcomm`, architecture `adreno-7xx`) | `PROD/phone-s24plus-tiers-r33.json` [R] |
| Pixel ratio | `min(devicePixelRatio, tierCap)`; caps 1.5 / 1 / .75 for high / balanced / economy; the review "1080p" option forces ratio 1 at 1920 x 1080. `setSize(w, h, false)` so CSS controls canvas size | `view-quality.mjs:9`, `viewer.mjs:81, 87` |
| Colour output | `outputColorSpace = SRGBColorSpace`; `toneMapping = ACESFilmicToneMapping`; `toneMappingExposure = .95` | `viewer.mjs:81` |
| Colour management | three default (enabled). GLB colour textures decode as sRGB. Meadow colour `DataTexture` is tagged `SRGBColorSpace`; roughness and normal `DataTexture`s are `NoColorSpace`. Vertex colours are linear multipliers (values .86 to 1) | `meadow-material.mjs:17`, `terrain.mjs:6` |
| Background and fog | `scene.background = Color(0xc0d6d4)`; `scene.fog = Fog(0xc0d6d4, 120, 220)`; camera near .02, far 250. No sky, no skybox | `viewer.mjs:42-43` |
| Environment | `PMREMGenerator.fromScene(new RoomEnvironment(), .04)`; `scene.environment` = result; `scene.environmentIntensity = .65`; generator and room disposed straight after | `viewer.mjs:84` |
| Lights | `HemisphereLight(0xffffff, 0x747b67, 1.4)`; `DirectionalLight(0xffffff, 2.7)` at (25, 42, 20), target default (0, 0, 0), the only shadow caster | `viewer.mjs:85-86` |
| Shadow camera | Orthographic +-44 m on both axes, near 1, far 115, `normalBias .018`, map 2048 / 1024 / 512 by tier | `viewer.mjs:86` |
| Shadow map type | `PCFShadowMap` (high, balanced) or `BasicShadowMap` (economy). `renderer.shadowMap.enabled = true` | `viewer.mjs:82` |
| Shadow flags | Every placement mesh casts and receives, except crops (cabbage stages, wheat, pumpkin-plant) which neither cast nor receive (`setCropShadows(instances, false, false)`, called on every `rebuildBatches`). Ground, surround and stream only receive. Bridge casts and receives. Woodland cell meshes receive; a cell casts only if one of its trees is within 52 m of the origin. Grass shadow flags are set inside the vendored library and were not inspected (unverified) | `viewer.mjs:109`, `crop-shadows.mjs`, `presentation.mjs`, `landscape.mjs:34`, `bridge.mjs:9` |
| Shadow toggle | Review-only checkbox sets `shadowMap.enabled` and `needsUpdate = true` on every material, which rebuilds shaders. Treat shadow settings as start-up only | `viewer.mjs:169` |
| Post-processing | None. No `PostProcessing`, no bloom, no ambient occlusion, no MSAA control beyond `antialias: true` | `viewer.mjs` (whole file) |
| Draw statistics | `renderer.info.autoReset = false`; the pilot resets it once per frame and counts main and shadow pass draws itself (`profiling/pass-counter.mjs`) | `viewer.mjs:82, 148` |

Note on the pixel-ratio value. The website's phone target has devicePixelRatio 2.8125 (S24+); the high tier caps at 1.5, so
the canvas is about 53 percent of native density. That cap is part of why the S24+ holds 60 FPS on High.

### 4.2 Materials and TSL

- GLB materials are `MeshStandardMaterial` (glTF metallic-roughness, no extensions). `WebGPURenderer` maps them to
  node materials internally. 98 embedded PNG textures across 23 GLBs; after pooling the number of unique GPU
  textures is lower (`textureReuse.uniqueTexturesBefore` / `After`, recorded in the renderer label).
- Only two places author node materials. `stream-material.mjs` imports `attribute`, `cameraPosition`,
  `cameraViewMatrix`, `color`, `float`, `mix`, `mx_noise_float`, `normalWorldGeometry`, `positionWorld`, `reflect`,
  `renderGroup`, `smoothstep`, `uniform`, `vec2`, `vec3` from `three/tsl`. The Field Grass library (`field-grass.mjs`)
  builds its own node material for wind and colour.
- Node-material features used that R3F must preserve: `MeshStandardNodeMaterial` from `three/webgpu`; an `attribute()`
  read of custom geometry attributes (`waterDepth`, `waterFlow`); `dFdx`/`dFdy` derivatives; a per-render uniform
  `uniform(0).setGroup(renderGroup).onRenderUpdate(frame => frame.time % 6)` (no React state touches it).
- Backend-specific behaviour found in code: none is hand-written. Both backends run the same node graphs.

### 4.3 Backend differences that are measured

| Item | WebGPU | WebGL2 | Source |
|---|---|---|---|
| Desktop start-up (RTX 3070) | 2.75 to 2.99 s warm; up to 6 to 10 s | 18.82 s first load (R2), up to 45 s in some runs | `PROD/desktop-qualified-r33.md`, `PROD/showcase-research-and-qualification.md` [R] |
| Desktop full-display orbit (1080p D workload) | 125.8 FPS | 90.0 FPS | `PROD/desktop-qualified-r33.md` [R] |
| Cause of slow WebGL2 start | Not applicable | One shader link per instanced mesh and per material; object counts drive start-up. Whole-scene and woodland prewarm were tried and rejected | `PROD/showcase-research-and-qualification.md` [R] |

### 4.4 Draw structure

Draw calls are dominated by instancing. The static world after batching is 83 batch groups (54 dynamic) plus the
unbatched hero assets (farmer, tractor, trailer, farmhouse, barn, watermill, fence gates), 8 packed woodland
groups, 2 terrain meshes (3 and 2 material groups), the stream, the bridge and 16 grass meshes. A shader is built per
instanced mesh, which is why the pilot minimises the object count rather than only the triangle count.

## 5. World content

### 5.1 The 23 authored assets

Counts are read from the runtime GLBs in the sealed scene archive. Triangles are summed from primitive index counts
per mesh (one count per mesh definition). `scene.json` `triangles` reflects the authored revision and can differ.
"Entries" are lines in `layout.placements`; "Placed" is the expanded count (`repeat.count`).

| Asset id | GLB bytes | Nodes | Meshes | Materials | Textures | Triangles | Clips | Entries | Placed |
|---|---|---|---|---|---|---|---|---|---|
| farmhouse | 521,692 | 23 | 15 | 10 | 12 | 3,816 | none | 1 | 1 |
| barn | 618,912 | 35 | 23 | 6 | 18 | 2,674 | Open, Close | 1 | 1 |
| windmill | 454,760 | 6 | 4 | 2 | 6 | 4,328 | Spin | 1 | 1 |
| watermill | 580,264 | 24 | 14 | 5 | 12 | 4,052 | Spin, DoorOpen | 1 | 1 |
| fence-straight | 59,260 | 6 | 2 | 1 | 3 | 260 | none | 42 | 42 |
| fence-corner | 83,084 | 6 | 2 | 1 | 3 | 520 | none | 12 | 12 |
| fence-gate | 162,020 | 10 | 5 | 2 | 6 | 780 | Open, Close | 6 | 6 |
| tractor | 409,684 | 31 | 18 | 5 | 0 | 5,252 | ArticulationProbe, Wheels, Steer | 1 | 1 |
| trailer | 183,252 | 28 | 13 | 5 | 3 | 2,696 | Wheels, Steer | 1 | 1 |
| barrel | 237,868 | 3 | 2 | 2 | 6 | 1,452 | none | 3 | 3 |
| hay-bale | 242,504 | 3 | 2 | 2 | 3 | 916 | none | 5 | 5 |
| farmer | 1,009,436 | 109 | 24 | 12 | 8 | 7,600 | Idle, Walk | 2 | 2 |
| cow | 371,896 | 63 | 26 | 9 | 0 | 2,452 | Walk, Idle, Graze, ArticulationProbe | 4 | 4 |
| sheep | 391,632 | 43 | 15 | 6 | 0 | 3,780 | Idle, Walk, Graze | 6 | 6 |
| chicken | 373,720 | 27 | 10 | 4 | 0 | 3,700 | Idle, Walk, Peck | 10 | 10 |
| cabbage-stage-1 | 164,988 | 5 | 3 | 3 | 3 | 336 | none | 3 | 24 |
| cabbage-stage-2 | 170,768 | 5 | 3 | 3 | 3 | 648 | none | 2 | 16 |
| cabbage-stage-3 | 176,528 | 5 | 3 | 3 | 3 | 960 | none | 3 | 24 |
| cabbage-stage-4 | 187,596 | 6 | 4 | 4 | 3 | 1,524 | none | 2 | 16 |
| wheat | 352,648 | 6 | 4 | 2 | 3 | 1,488 | none | 27 | 369 |
| pumpkin-plant | 155,080 | 7 | 5 | 4 | 0 | 1,566 | none | 3 | 12 |
| faceted-tree | 123,176 | 5 | 4 | 4 | 3 | 760 | none | 25 | 25 |
| rock-cluster | 39,784 | 2 | 1 | 1 | 0 | 400 | none | 7 | 7 |
| Total | 7,070,552 | | | | 98 | | | 168 | 589 |

- No skins, no morph targets, no glTF extensions, no Draco/KTX2/Meshopt; every image is `image/png` embedded in the
  GLB. The runtime GLBs are loaded as-is; nothing is re-exported at run time.
- The woodland uses the `faceted-tree` model's four meshes again, 843 times, on top of the 25 placed trees.
- Names the code looks up in the GLBs (parity depends on these; the staged GLBs must keep them):

| Asset | Names used | By |
|---|---|---|
| farmer | `Joint_Pitchfork`, `Joint_Pelvis`, `Joint_Chest`, `Joint_LeftShoulder`, `Joint_RightShoulder`, `Joint_LeftElbow`, `Joint_RightElbow`, `Joint_{Left,Right}{Hip,Knee,Ankle}` | `play.mjs:8`, `interaction-rig.mjs` |
| tractor | `Joint_SeatAttach`, `Joint_SteeringWheelMount`, `Joint_Steer_FL`, `Joint_Steer_FR`, `Joint_Wheel_FL`, `Joint_Wheel_FR`, `Joint_Wheel_RL`, `Joint_Wheel_RR`; any node ending `Joint_WheelRotor` or `Joint_Rotor` (excluded from collision) | `play.mjs:17, 22, 66`, `interaction-rig.mjs:11` |
| farmhouse | `Joint_FrontDoor` | `interaction-rig.mjs:34` |
| watermill | `DoorPivot`, mesh `Mesh_Building_Wood` (its material is reused for the bridge) | `interaction-rig.mjs:35`, `presentation.mjs:15` |
| barn, fence-gate | clip `Open`; every track target name (`<node>.quaternion`) is a door pivot | `interaction-rig.mjs:37-38` |
| cabbage-stage-1 | mesh `Mesh_SoilMound` (its material is cloned for soil and paths) | `presentation.mjs:9` |
| fence-straight, fence-corner | `FenceStraight/Post_End_NegX`, `Post_End_PosX`, `FenceCorner/Post_End_B` and others removed by `omittedPartPaths` (45 entries) | `viewer.mjs:107` |
| faceted-tree | any mesh whose name matches `crown`, `leaf` or `foliage` is excluded from collision | `play.mjs:18` |

### 5.2 Placements

- `layout.placements` has 168 entries and expands to 589 placed instances. Entry keys: `id`, `asset`, `position`,
  `yaw` (degrees), optional `omittedPartPaths` (45 entries), `soilMode` (40 entries, all `"terrain"`), `repeat`
  (`{count, step: [x, y, z]}`, offset `step * n`).
- Instance ids are `<entry id>-<n>` (`viewer.mjs:108`). Code depends on `farmer-yard-0` being the playable farmer
  (`play.mjs:5`); the second farmer is `farmer-field` at (-14, 0, 24), yaw -50. The playable farmer starts at
  (4.7, 0, -7), yaw 40. The tractor is at (-3, 0, -7), yaw 0.
- Layout: 72 x 72 m ("sizeMeters"), version 2, note "Connected farm showcase; three livestock paddocks, farmyard, grain
  and vegetable fields, tree boundaries and river mill." (`layout.note`). Presentation lists: 16 paths (first:
  width 3.6, depth 66 at (19, 0, 0)), 4 beds (first: `cabbage`, 11 x 9 at (9.5, 0, 26.5)), river
  `{millX: 25, millZ: -26.31, waterY: -0.12}`, grass `{tufts: 14000, seed: 271026, quality: [7000, 14000]}`.
- Every placement is a wrapper `Group` that is a direct child of the scene; the frame graph relies on this (S20).
- The layout data is the single source of truth for placements; it is byte-identical to `scene.json.layout` and to
  the sealed `layout.json`. The rewrite copies it verbatim.

### 5.3 Terrain (S09, S10, S11)

- `terrainHeight(x, z)`: river bed `-.36` with a smoothstep bank (`bankRun 1.1`, shortened to `.12` in the millrace),
  plus an excavated mill court (`-.25`) behind the mill wall. Everything else is 0 (the farm is flat).
- Farm terrain: 145 columns (step .5 m, x from -36 to 36) by 155 rows (145 half-metre rows plus ten refinement rows
  `-26.99, -26.93, -26.88, -26.8, -26.74, -26.6, -26.31, -26.1, -25.88, -25.8` around the mill bank) = 22,475
  vertices, 44,352 triangles. Attributes: position, colour (`.93 + .07 * sin(.19x + .11z) * cos(.25z)`), uv (`x * .25`,
  `z * .25`), computed normals. Groups: 0 meadow, 1 path (cell centre inside a `presentation.paths` rectangle), 2 soil
  (cell centre within `riverWidth / 2 + .9` of the river or inside a bed).
- Surrounding terrain: rings out to 384 m (`[40, 52, 72, 104, 152, 224, 320, 384]`), column step .5 m to 120 m then
  2 m, rows refined along the channel, boundary rows identical to the farm's so the seam is watertight;
  `landscapeHeight = terrainHeight + blend * hills * bank` (`blend = smooth((max(|x|, |z|) - 36) / 45)`); 39,690 triangles;
  groups 0 meadow, 1 soil (river band).
- River: `riverCenter(x) = -26.31 + 1.8 sin((x - 25) / 9) * (1 - millrace(x))`, `riverWidth(x) = .86 + 1.6 * min(1, |x - 25| / 7) *
  (1 - millrace(x))`; `millrace(x) = 1 - smooth((|x - 25| - 3.3) / 2)`. The bridge centre is
  `[19, riverCenter(19)]`, z about -27.42 (computed by hand from the formula).

### 5.4 Woodland (S12)

- Rings `[41, 45, 49, 54, 60, 68, 78, 91, 105, 122]` m, each with `ceil(2 pi r / 4.8)` slots; positions from the hash
  `frac(sin(n * 127.1 + 311.7) * 43758.5453)` (deterministic, no `Math.random`). Slot rejected if `max(|x|, |z|) < 37`, inside
  the river band `+3`, or `|x - 19| < 3`. Scale `1.25 + hash * .95`, random yaw, height `landscapeHeight`.
- Result: 843 trees in 16 cells of 64 m (`floor(x / 64)`, `floor(z / 64)`); one `InstancedMesh` per cell per source
  mesh (4 meshes, so 64 meshes), then `packWoodland` (`pack-woodland.mjs:3`) merges them into 8 groups keyed by geometry,
  material and caster membership. It requires an identity scene (`scene.matrixWorld` identity) because it bakes world matrices.
- Uses the original tangent-bearing geometry with no derivative copy (see section 9.3).
- Trees are not collidable. No level of detail, no billboards.

### 5.5 Stream (S13)

- Geometry from the two ground meshes: every triangle with a vertex below `STREAM_LEVEL = -.12` within `riverWidth / 2 + .85`
  of the centre line is clipped at the waterline; only clip results connected (through shared submerged edges) to a
  seed triangle inside the river are kept. Vertices sit at `STREAM_LEVEL + .002`. Attributes: `waterDepth`
  (`max(0, level - bed)`), `waterFlow` (vec2: `speed`, `speed * riverSlope`, `speed = .42 + .15 / (riverWidth + .2)`).
  12,976 triangles. The mill court is separated from the connected surface by a dry bank at z = -26.93.
- Material `Farm flowing stream v1`: transparent, `depthWrite false`, roughness .25, metalness 0, `renderOrder 2`,
  `receiveShadow`. Two-phase flow advection (6 s period, noise-offset phase), analytic normal perturbation, footprint-based
  detail fade, Beer-Lambert style transmission (`exp(-2.1 * depth / cos(refracted))`, index 1.333), Schlick
  Fresnel (power 5), foam from streak noise and crest term, body colours `#739b88` to `#327e80` by depth, foam `#e0ecdc`,
  sky reflection `#bdd8d7` to `#79aac0` as emissive.

### 5.6 Bridge, meadow, path and soil (S14, S15)

- Bridge: 34 boxes (22 planks 3.4 x .16 x .297 at x = 19, y = .08, z stepping .30; 8 posts .12 x 1.12 x .12 at
  x = 19 +- 1.65; 4 rails .10 x .10 x 6.35 at y = .58 and 1.04), non-indexed `BoxGeometry` merged into one mesh,
  408 triangles, material shared with the watermill timber, name `Demo river crossing`. Collision and rendering use the same triangles.
- Meadow: `meadowPixels(256)` builds colour, roughness and normal images procedurally (noise scales 5, 17, 113;
  earth `[124, 116, 83]` to moss `[113, 131, 88]`; roughness `222 + 25 * patch`; normal from the height gradient at strength .6).
  `DataTexture` RGBA8, repeat wrap, `repeat 1/3` (12 m period with uv = x * .25), trilinear with mipmaps.
  `MeshStandardMaterial({color: 0xffffff, map, roughnessMap, normalMap, roughness: 1, metalness: 0, vertexColors: true})`,
  `normalScale .4`, name `Farm meadow ground v1`. The recipe file `meadow-recipe.json` records seed 271; the recipe and its output are CC0.
- Soil: clone of `cabbage-stage-1` `Mesh_SoilMound` material. Path: clone of soil with colour `0xe3c6a0`, roughness 1,
  `vertexColors`, `normalScale .2`.

### 5.7 Field Grass (S16)

- Library: the owner's MIT Field Grass, commit `2a0d3a3256dc8d8f6d9de68f3dc1636a621559c5`, version 0.1.0, vendored as
  `SHOW/field-grass.mjs` (31,014 B; source in the sealed scene zip under `source/field-grass/`).
- Data: `grass.json` (16 groups of 875 tufts; 4 x 4 grid of 18 m cells across -36 to 36), `grass.bin` (168,000 B =
  14,000 x 12 B, `tuft12` stride 12), `grass-recipe.json` (seed 271026). API used: `decodeTufts`, `createGrassLayer`,
  `STORYBOOK_GRASS_PRESET`.
- Call: `createGrassLayer(buffers, {preset: STORYBOOK_GRASS_PRESET, name: group.id, palette: {dark: '#405f37', light: '#819c58',
  surround: '#768751', wornEarth: '#b99b72', sunGlow: '#c6b96a'}, style: {...preset.style, tipGold: .06, windReach: .18}})`.
  Then `mesh.computeBoundingSphere()`, `boundingSphere.radius += 1`, `frustumCulled = true`, added to the scene.
- Density control: `mesh.count = floor(instanceMatrix.count * fraction)` (1, .5, .25 by tier). Wind is animated in the shader.
- The library's declared `three` peer range excludes 0.186 (section 9.4); the pilot ran it on 0.186.1 without a reported fault.
- `grassAllowed(x, z, layout)` (`site-layout.mjs:19`) encodes where grass may grow (not within 1 m of the river, not on paths
  or beds, not under building footprints); no runtime module I read calls it, so it belongs to the offline generator (unverified).

### 5.8 Animals and moving parts

- Cows (4), sheep (6), chickens (10): clip Graze (cow, sheep) or Idle (chicken has Idle, Walk, Peck, no Graze) starting
  at `(instanceIndex * .37) mod clipDuration`, plus `herd-motion.mjs` routines (appendix A.6).
- Windmill and watermill Spin loop; watermill Spin has `timeScale -1` (`scene-motion.mjs:2`).
- Doors and gates: section 6.3.

### 5.9 Instancing, batching, pooling, culling (must be preserved)

| Mechanism | Effect | Recorded numbers |
|---|---|---|
| `batchInstances` (S17) | Cells 96 m offset 48 m; group key geometry, material, cast, receive, cell | 83 groups, 54 dynamic; 1,967 of 2,000 source meshes instanced |
| `packWoodland` (S12) | 64 woodland cell meshes into 8 groups | 843 trees |
| `poolIdenticalTextures` (S06) | One GPU texture per identical image plus sampler | count printed in the renderer label |
| `cacheStaticPlacements` (S19) | Freeze transforms of immutable placements | 555 placements, 4,191 nodes |
| `createFrameGraph` (S20) | Update only moving roots; hide batched source roots | 560 hidden roots initially, 559 after a growth swap |
| Crop shadow policy (S18) | Crops neither cast nor receive | fewer shadow draws |
| Grass fraction (S21) | Halve or quarter tufts on lower tiers | 14,000 / 7,000 / 3,500 |
| Frustum culling | Three default on all meshes and instanced groups (`computeBoundingSphere` done for batches, woodland, grass) | |
| Level of detail | None. No impostors. No occlusion culling | |
| Streaming | None. All 23 GLBs load before the first frame | |

The recorded effect of these, on the RTX 3070 at 1080p, is about 143 to 144 FPS on a 144 Hz display (`PROD/desktop-qualified-r33.md` [R]).

## 6. Interaction

### 6.1 Controls today

| Mode | Input | Behaviour |
|---|---|---|
| Overview (default) | Mouse drag rotate, right drag or two-finger pan, wheel or pinch dolly; `OrbitControls` defaults except `maxDistance 160`, `maxPolarAngle .495 pi`, `enableDamping false` | `viewer.mjs:44` |
| Overview | 12 named view buttons (`data-view`), "Walk route" 30 s flythrough over 5 points, "Focus" on the selected asset | `viewer.mjs:48, 144, 160` |
| Play ("Walk as Rowan") | W/A/S/D or arrows move relative to the camera; Shift runs; mouse drag orbits the follow camera; E interacts; Escape leaves; "Reset farmer"; "Start near" destinations | `play.mjs:45-77` |
| Play | On-page "Interact" button mirrors E; help text "WASD / arrows to move; drag to look; E to interact." | `play.mjs:43, 93` |
| Touch | Only the review camera buttons (zoom, pan, reset); walking and driving controls are hidden on coarse pointers; help says "Walking and driving use a keyboard on desktop." | `touch-review.mjs` |

### 6.2 Walking (S26)

Fixed simulation step 1/120 s with accumulator capped at .1 s. Capsule radius .30, height 1.90. Pace 1.05 m/s,
1.8 with Shift. Gravity 18 with terminal speed -10. Movement is camera-relative (camera direction flattened onto the
ground, `right = forward x up`). Collision is resolved against the BVH (section 6.6) and then a porch-riser rule lifts the
capsule onto steps up to .22 m high when the resolved motion is under 60 percent of the intended motion (floor probe .25).
World clamp +-34.8 m. River rule: outside the bridge footprint (inset .3), a position within `riverWidth / 2 + .30`
of the river centre is rejected and the status shows "Use the timber bridge to cross the river." The model faces +X
(`rotation.y = atan2(-move.z, move.x)`). Animation: Idle, or Walk at `timeScale = min(3, actualSpeed / .6)` when the
actual speed exceeds .05 m/s. The empty-handed arm pose is re-applied every step (the source right forearm is authored across
the body). The pitchfork is hidden while playing.

### 6.3 Doors and gates (S27)

Nine doors: farmhouse front door, watermill door, barn doors (one `Open` clip driving several pivots) and six paddock gates.

| Door | Mechanism | Label |
|---|---|---|
| farmhouse | `Joint_FrontDoor` `rotation.y` from 0 to `pi * .53` | "farmhouse door" |
| watermill | `DoorPivot` `rotation.y` from 0 to `-95 deg` | "mill door" |
| barn | clip `Open` sampled with `createInterpolant().evaluate(amount * duration)` on each track's pivot quaternion | "barn doors" |
| fence-gate (6) | same as barn | "paddock gate" |

State per door: `amount` and `target` (0 or 1). Each 1/120 s step `amount = damp(amount, target, 7, step)`; the door pose
is applied, and if the player capsule (radius `.30 - .01`) now intersects, the move is undone and the status reads
"Door stopped: Rowan is in its path." Interaction picks the nearest door pivot-bounds centre within 2.6 m (tractor within
2.5 m); button text "Open <label> (E)" or "Close <label> (E)"; when none is near, "Approach a door or tractor". On
entering play every door instance is put at rest pose (the watermill keeps Spin) and doors start closed. Door pivots are
dynamic colliders and excluded from the static collider (section 6.6).

### 6.4 Tractor (S28)

Kinematic, not physical. `gas` from W/S (or arrows, or `driveInput.forward`), `turn` from A/D (positive is left, or
`driveInput.turn`). `speed = damp(speed, gas * (gas > 0 ? 4 : 1.8), gas ? 2.5 : 5, dt)` (top speed 4 m/s forward, 1.8
reverse); `steer = damp(steer, turn * .45, 6, dt)`; `yaw += speed * tan(steer) / 1.75 * dt`; forward vector
`(cos yaw, 0, -sin yaw)`; y from `drivingHeight` (.16 on the bridge deck). The step is rejected (state restored, speed
zero, status "Obstacle ahead. Reverse or steer clear.") if the tractor leaves +-33 m, comes within `riverWidth / 2 + 1.3`
of the river off the bridge (bridge inset .92), or either of two probes at local x = +-.8, y = .23 overlaps the static
world (probe radius .90, height 2.08; the tractor's own collider is ignored). Wheels: front `rotation.z = -travel / .4`, rear
`-travel / .72`; front steer joints `rotation.y = steer`; steering wheel mount `-steer * 1.7` about local Y. The farmer
is seated each step by two-bone IK (`seatFarmer`). Dismount tries three exits in tractor-local space (-.4, 0, 1.5),
(-.4, 0, -1.5), (2.2, 0, 0), first free wins; otherwise "Exit is blocked. Drive into an open area." Mount status:
"Tractor controls: W/S accelerate and reverse; A/D steer. Trailer stays parked." The trailer is never coupled.

### 6.5 Camera in play (S30)

`resetCamera`: target = subject position + (0, 1.9, 0) walking or (0, 1.6, 0) driving; offset
`(-cos(yaw) * 4.8, walking .6 or driving 2.6, sin(yaw) * 4.8)`; fov 58; `maxPolarAngle .54 pi`. Each frame the camera and
target move by the subject's delta; the user's drag changes the stored offset (through OrbitControls `change` events). An
obstruction ray from the target toward the desired camera position shortens the distance to `max(.22, hit - .14)`;
the player mesh is hidden when the resulting distance is under 1.25 m. The initial offset `(-4, 2.7, 5)` applies only before the first reset.

### 6.6 Collision world (S25)

`createCollisionWorld` bakes each collider's triangles into one position-only `BufferGeometry` in world space (dynamic
colliders in the root's local space) and builds `MeshBVH(geometry, {targetLeafSize: 10})`. `consolidateStatic()` merges all static
colliders into one BVH named "Static farm world". Queries:

| Query | Behaviour |
|---|---|
| `intersects(pos, r, h, ignore)` | Capsule (segment from `pos + r` to `pos + h - r`, radius r) against every enabled collider by `shapecast`; dynamic colliders are transformed by the inverse of the root's current `matrixWorld` |
| `resolve(pos, r, h, ignore)` | Three passes of push-out along the closest-point delta (`r - distance + 1e-5`) |
| `rayDistance(from, to, ignore)` | `raycastFirst` with `DoubleSide`, near .02, far current best; returns nearest hit distance or the full length |
| `floor(pos, maxDrop = .35)` | Downward ray from `y + .06`, far `maxDrop + .06`; highest hit y or `-Infinity` |
| `dispose()` | Disposes collider geometries |

What is collidable: the farm ground and the bridge, plus every instance except farmer, cow, sheep, chicken, wheat,
pumpkin-plant and every `cabbage-*`. Door pivots and tractor rotors are filtered out of the static bake. Faceted-tree
crown, leaf and foliage meshes are excluded by name. The tractor and trailer roots are dynamic colliders; door pivots are dynamic
colliders. Woodland, terrain outside the farm, the stream surface and the grass are not collidable.
Static collision triangle count and BVH build time were not recorded (unverified).

### 6.7 Destinations (S31) and reset

Seven destinations (appendix A.1). Selecting one stops driving if needed, restores the rig, places the farmer,
resolves collisions, sets the yaw, starts play if inactive and resets the camera. "Reset farmer" returns to the
placement position (`home`).

### 6.8 Mobile today

The pilot targets desktop for play. Phones and tablets get orbit viewing with the review buttons. Site copy currently
says "Mobile supports orbit viewing only" (website copy; the file was not recorded, the site owner must update it). The
S24+ runs the whole scene at about 59.5 FPS (60 Hz cap) on every tier; the Galaxy Tab S9 FE reaches 34.2 FPS orbit and 44.7 FPS route
on Economy and far less on Balanced and High (section 10.3).

## 7. Loading, errors and serving

| Item | Current behaviour | Source |
|---|---|---|
| Fetches | All root-relative: `/scene.json`, `/<asset.file>` (`assets/<sha>.glb`, 23), `/grass.json`, `/grass.bin`. No range requests, no retry | `viewer.mjs:76, 94`, `presentation.mjs:16` |
| Verification | Each GLB's SHA-256 (`crypto.subtle.digest`) must equal `asset.runtimeSha256` or start-up aborts with "Runtime hash mismatch <id>". `crypto.subtle` only exists in secure contexts (https or localhost); the pilot has no fallback | `viewer.mjs:95` |
| Version gate | `String(THREE.REVISION) !== manifest.threeVersion.split('.')[1]` throws "Three.js version mismatch" (compares only "186") | `viewer.mjs:77` |
| Parsing | `GLTFLoader.parseAsync(bytes, location.origin + '/')`; all 23 fetched and parsed concurrently; `parseMs` and `fetchMs` recorded per asset | `viewer.mjs:96` |
| Loading UI | `#load` text updated by `status()`; six phases (section 3.2); `loadingStage` yields through `requestAnimationFrame` plus `setTimeout` so each text paints before blocking work | `viewer.mjs:37-39` |
| Ready signal | All controls except fullscreen and quality picker disabled until the first `renderer.render` returns, then enabled and `#load` shows the ready message | `viewer.mjs:136-138, 149` |
| Errors | `window` `error` handler and the `initialize()` rejection write "Scene error: ..." or "Scene initialization failed: ..." into `#load` and an `errors` array. No retry, no fallback view, no user-facing recovery | `viewer.mjs:189-190` |
| GLB failure modes | A single failed fetch, hash mismatch or parse error rejects `Promise.all` and aborts the whole load | `viewer.mjs:93-97` |
| WebGPU failure | Absorbed by the renderer's WebGL2 fallback; not an error | vendored three |
| Serving | `serve.mjs` in the sealed scene zip: a loopback-only Node static server that verifies every file it serves against `delivery.json`. No service worker; cache headers not inspected (unverified) | sealed scene zip |
| Payload | GLBs 7,070,552 B + `grass.bin` 168,000 B + `scene.json` about 163 KB (includes authorship and review data the runtime does not need) | computed |

## 8. Review-only, measurement and profiling UI (must not appear in a public build)

Everything in this table belongs to the asset-review page around the scene. The public build shows none of it. In the
rewrite it exists only behind an explicit developer flag (SPEC section 13.3) or not at all.

| Group | Elements and modules | Source |
|---|---|---|
| Asset review panel | `#asset-group`, `#instance`, `#focus`, `#clip`, `#toggle`, `#scrub`, `#phase`, `#play-all`, `#rest-all`, `#soil` and `#soil-control`, `#growth` and `#growth-control`, `#identity`, `#workshop`, `#motion-note`, `#authorship`, `#coverage`, `#missing`, `#inventory-note`, `#footer` (project id and revision text) | `viewer.mjs:52-71, 125-131, 139, 170-187` |
| Quality and display | `#view-quality` (reloads with `?quality=`), `#resolution` (fixed 1920 x 1080), `#shadows`, `#grass-quality`, `#batching` | `viewer.mjs:27, 87, 127, 169`, `rebuildBatches` |
| Live statistics | `#renderer` label (backend, three version, shadow state, canvas size, DPR, texture counts), `#stats` (draw calls, triangles, geometries, textures), `#play-state` coordinates | `viewer.mjs:134, 151` |
| Measurement and profiling | `measurement.mjs` (`createMeasurement`, sampling workloads, `#sample-case`, `#quiet-window`), `profiling/pass-counter.mjs`, `profiling/suite-client.mjs` (`?suite`), `activity.mjs` (`#activity-toggle`, `#activity-kind`; workloads `living-orbit`, `living-route`, `tractor-drive`), `beginDrivePreview` in `play.mjs` | `viewer.mjs:17-19, 114-118, 123, 155-158` |
| URL switches | `?quality`, `?backend=webgl2`, `?profile` (herd off), `?transforms=auto`, `?framegraph=off`, `?asset`, `?view`, `?suite`, `?case` | `viewer.mjs` |
| Herd toggle | `#farm-life` ("Living farm") | `viewer.mjs:115-116` |
| Route toggle | `#route` "Walk route" | `viewer.mjs:188` |
| Keyboard interception | Global capture-phase `keydown` handler while an activity preview runs | `viewer.mjs:162-168` |
| Never shipped | `grass-bake-runtime.mjs` and `static-batches.mjs` (not imported by `viewer.mjs`); `scene.json` authorship, approval and inventory fields | `SHOW/` |

Public-facing pieces that stay (redesigned): loading and error messages; the interact prompt and status line without
coordinates; controls help; play start and exit; camera reset; fullscreen and exit are the page's.


## 9. three 0.186.0 versus 0.186.1

The pilot ships 0.186.1. The scenes monorepo, the Kiln engine, the render service and the website all pin 0.186.0
(a repository invariant in the website, `scripts/check-toolchain.mjs`, requires one `three` version across root,
`render-service/package.json` and `site/package.json`; all three read 0.186.0 today). `npm view three version` reports
0.186.1 as npm "latest"; that mismatch is deliberate and must not be "fixed" by upgrading.

### 9.1 What differs between the two releases

Method: byte comparison of the two npm packages (0.186.0 and 0.186.1). `build/three.core.js`, `build/three.module.js`,
`build/three.tsl.js` and every file under `examples/jsm/` are byte-identical. Only `build/three.webgpu.js` differs, in five
hunks (other build artefacts such as minified or CommonJS files were not compared).

| Hunk in 0.186.1 (`three.webgpu.js`) | What changed | Does Farm rely on it? |
|---|---|---|
| 1. `refreshUniforms` | Handles material wireframe | No. Farm never sets `wireframe` |
| 2. Buffer-size refresh | Refreshes the buffer-size uniform for all materials (not only some) | Not knowingly. Possible effect after a pixel-ratio or resize change on materials that read viewport size. Farm's own nodes do not read viewport size; whether Field Grass does was not inspected (unverified) |
| 3. `Geometries` dispose listener | Now deletes the geometry entry | Indirectly. On 0.186.0 a disposed geometry can leave stale bookkeeping until the renderer is disposed. Effects: `renderer.info.memory.geometries` may not fall after unmount and dispose-then-reuse behaviour differs. Unverified in a browser (M0 must measure) |
| 4. `VelocityNode` | `previousCameraViewMatrix` gets `setGroup` | No. No velocity, motion blur, TRAA or MRT in Farm. Relevant later only if a scene adds them |
| 5. `NodeBuilder.getSharedContext` | Deletes `nodeLoop` and `nodeBlock` | No. Farm's TSL uses no `Loop()`. Relevant if Golden Gate authors `Loop()` water or fog shaders |

Conclusion: the current Farm runtime does not depend on any 0.186.1-only behaviour; every difference is in code paths
Farm does not exercise, apart from the two residual risks (hunks 2 and 3) listed above. Nothing in Farm needs
back-porting.

### 9.2 The r186 instancing tangent defect and the workaround the pilot carries

Quote (`KC/farm-pilot/PROGRESS.md:461`): "WebGPU + instancing reproduced the fault; disabling shadows or matrix caching did
not help, while unbatched rendering did. Installed r186 instancing transforms normals but omits authored tangent
transformation; a temporary tangent-free batch copy fixed the posts with normal maps retained. The normal scene now
shares/disposes nine qualified render-only geometry derivatives." The visible symptom was black fence posts.

- The hunks in section 9.1 do not touch instancing, so the defect is identical in 0.186.0 and 0.186.1 (the workaround is
  required on 0.186.0 exactly as it was on 0.186.1).
- Workaround location: `instance-batches.mjs:6-9`, function `forInstances`. For a batched source mesh whose material has a
  `normalMap` and whose geometry has a `tangent` attribute, the `InstancedMesh` is given a clone of the geometry with the
  `tangent` attribute deleted (one clone per source geometry, shared across cells; disposed by `restore()`). Position,
  normal, uv and index are kept, so the shader falls back to the UV-derivative tangent frame and the normal map still works.
  The GLB files are never modified.
- Counts: recorded nine derivatives. My scan of the runtime GLBs finds an upper bound of 15 candidate geometries
  (normal-mapped primitives that also carry TANGENT, in batch-eligible assets with at least two placements): fence-straight 2,
  fence-corner 2, barrel 2, hay-bale 1, cabbage stages 1 + 1 + 1 + 1, wheat 3, faceted-tree 1. Why the recorded number is
  lower is not explained in the records (unverified; probably groups that never form).
- Assets with normal maps and TANGENT that are NOT batched (rendered as ordinary meshes, so unaffected): farmhouse 9
  primitives, barn 23, watermill 11, fence-gate 5, trailer 1, farmer 11. Tractor, cow, sheep, chicken, pumpkin-plant and
  rock-cluster have no TANGENT attribute.
- Possibly unaddressed case: `addWoodland` (`landscape.mjs:34`) builds the 843-tree `InstancedMesh`es from the original
  `source.geometry`, without `forInstances`. `faceted-tree` has one of its four primitives with a normal map and a TANGENT
  attribute, so that one woodland mesh is instanced with tangents. Whether the fault is visible on distant trees was not
  tested (unverified; needs an A/B render). SPEC section 12.6 makes the rewrite apply the derivative copy to woodland
  too and lists the change as a decision.
- The workaround is also why `packWoodland` and batching are written as they are: they clone geometry per group and
  dispose it on `restore()`.

### 9.3 Anything else that may depend on the 0.186.1 vendor copy

- The label `viewer.mjs:134` prints the hard-coded string "Three.js 0.186.1".
- `viewer.mjs:77` accepts any 0.186.x (it compares the revision number "186" only).
- Sealed `scene.json.threeVersion` is "0.186.1"; pack documentation in the website repository says 0.186.1. Both must be
  corrected by their owners to 0.186.0 when the rewrite ships (the rewrite's `pack.json` records the pinned version itself).
- Field Grass 0.1.0 declares a `three` peer range that excludes 0.186; the pilot ran it against 0.186.1 and the
  rewrite runs it against 0.186.0. No difference is expected (the library uses `three/webgpu` and `three/tsl`, which are
  identical outside the five hunks) but this is a compatibility claim, not a measurement (unverified). M0 and the parity
  screenshots cover it.

## 10. Known defects, owner feedback, open questions

### 10.1 Defects and limits in the pilot

| Id | Item | Evidence |
|---|---|---|
| D1 | Start-up is slow and serial: manifest, renderer, environment, then assets. WebGPU 2.75 to 2.99 s warm (6 to 10 s worst); WebGL2 first load 18.82 s up to 45 s | `PROD/desktop-qualified-r33.md`, `PROD/showcase-research-and-qualification.md` [R] |
| D2 | Shader builds are per instanced mesh, so object counts (not triangles) drive start-up and WebGL2 cost | same [R] |
| D3 | Toggling shadows at run time rebuilds every material, so shadow and shadow-map settings are start-up only | `viewer.mjs:169` |
| D4 | No true teardown. The dispose callback does not release the renderer or GPU resources, and leaves the `blur` and `visibilitychange` listeners in place | `view-visibility.mjs:9`, `play.mjs:94` |
| D5 | Tablet performance: Galaxy Tab S9 FE (Mali-G68) reaches 34.2 FPS orbit and 44.7 FPS route on Economy, p95 33.3 ms, an 83 ms worst gap not explained; Balanced and High are far lower | `PROD/tablet-quality-decision-r33.md` [R] |
| D6 | No touch play. Phones and tablets get orbit viewing only | `touch-review.mjs` |
| D7 | Woodland instanced with tangents (section 9.2) | code reading |
| D8 | Escape and Space are prevented from doing their default action even when a button has focus, and Space does nothing. Keyboard users cannot operate page buttons with Space while play is active | `play.mjs:71` |
| D9 | `crypto.subtle` is unavailable outside secure contexts; the hash check would throw on an insecure origin | `viewer.mjs:95` |
| D10 | The pilot's interior cameras (`house-interior`, `house-porch`, `house-window-out`, `watermill-interior`) are review views; walking inside relies on the r33 floors. The owner asked for a farmhouse floor fix, delivered as the r34 revision | `PROD/farmhouse-floor-review.json` [R] |
| D11 | Frame graph assumes wrappers are direct scene children and `scene.matrixWorldAutoUpdate = false`; it hides 560 roots and breaks if anything else moves a static root | `frame-graph.mjs:4-37` |
| D12 | `pack-woodland.mjs` requires an identity scene | `pack-woodland.mjs:3` |

### 10.2 Owner feedback on record

- All 23 assets have owner approval (the sealed r33 manifest still says 8; section 12). The one open request, a farmhouse
  floor, was answered by the wood-floor revision `r_01f97f5e943e4c2693b6db8596f3e353`, accepted by the owner ("Yes, the
  farmhouse wood floor revision passes.", `PROD/farmhouse-floor-review.json`). Records: `PROD/owner-review-r33.md`,
  `PROD/consolidated-owner-review.json`. `PROD/next-farm-goal.md` exists and was not summarised here (unverified content).
- The owner's stated priorities for the rewrite are in the task brief (SPEC section 1); this inventory adds none.
- Decisions of 2026-09-29 as recorded in the coordinator's checkpoint `KC/OVERNIGHT.md` (a secondary source that may change; read once, not re-verified): the Farm is left alone (r34 stays exactly as sealed, no audit, no
  r35) and the website switches to r34; the site viewer and posters move to accurate lighting (`review-neutral-v1`), which names the site viewer and posters, not the scenes; when the R3F Farm scene reaches parity it is wired into the
  website branch, stays noindex and undeployed, and the old runtime remains the fallback; performance qualification waits for an idle hub and is not timed on the dev PC, which is under load; local commits are allowed on
  work branches; three is 0.186.0 everywhere; the farmhouse floor is accepted; the Golden Gate scene (orbit, guided flyovers, traffic, presets, a drivable car with a chase camera) and Foundry Floor are the next scenes on the same kit.

### 10.3 Device evidence (all recorded, none re-measured here)

| Device | Result | Record |
|---|---|---|
| Desktop, RTX 3070, Chrome 153, 1080p | about 143 to 144 FPS on a 144 Hz display; full-display D orbit 125.8 FPS WebGPU and 90.0 FPS WebGL2 | `PROD/desktop-qualified-r33.md` |
| Tablet, Galaxy Tab S9 FE (Mali-G68) | Economy 34.2 FPS orbit, 44.7 FPS route, p95 33.3 ms, 83 ms worst gap; Balanced and High far lower | `PROD/tablet-quality-decision-r33.md` |
| Phone, Galaxy S24+ (adapterInfo qualcomm, adreno-7xx; DPR 2.8125) | all three tiers about 59.5 FPS (60 Hz cap), GPU about 11 ms, 1.56 to 1.80 million main-pass triangles | `PROD/phone-s24plus-tiers-r33.json` |
| Hub (Ryzen 7 3750H, GTX 1660 Ti Max-Q, Linux) | last recorded status dated 2026-02-08 (`C:/Users/Mattm/.workspace/hub-status-report.md`); not connected to and not re-verified | recorded only |

### 10.4 Open questions (inventory level; decisions are in SPEC section 26)

1. Should the public scene expose all 12 named views, a subset, or none (play plus one overview)?
2. Is the farmer called "Rowan" in public copy?
3. Which release is the parity baseline: r33 (what the pilot runtime and its sealed archives are) or r34? Answered by the 2026-09-29 decision above: the website serves r34, the pilot is r33, so the builder checks both (SPEC 6.3, D-07).
4. Is the Field Grass library vendored as source (`source/field-grass/`) or as the pilot's 31 KB bundle?

## 11. Dependencies and licences

### 11.1 The pilot today

| Component | Version and source | Licence |
|---|---|---|
| three (build and addons) | 0.186.1, vendored in `SHOW/three/` and `SHOW/addons/` (`LICENSE-THREE.txt`) | MIT |
| three-mesh-bvh | 0.9.15, bundled as `bvh.mjs` (172,319 B) with esbuild 0.25.12 (`LICENSE-BVH.txt`) | MIT |
| Field Grass | owner's library, v0.1.0, commit `2a0d3a3256dc8d8f6d9de68f3dc1636a621559c5`, bundled as `field-grass.mjs` (`LICENSE-FIELD-GRASS.txt`) | MIT |
| Viewer and scene code | Copyright 2026 Matthew Kissinger (`LICENSE-VIEWER.txt`) | MIT |
| Assets (23 GLBs) | designated CC0-1.0 by the project owner, to the extent of the owner's rights (`licenses/ASSET-LICENSE.txt` in the runtime zip) | CC0-1.0 (owner designation) |
| Meadow recipe and generated textures | `meadow-recipe.json`, seed 271 | CC0 |
| esbuild | 0.25.12, build-time only | MIT |
| Network at run time | none; no CDN, no fonts, no analytics | |

### 11.2 Candidate dependencies for the rewrite (licences from `npm view <pkg> license`, 2026-09-29)

| Package | Pin (see SPEC section 3) | Licence |
|---|---|---|
| three, @types/three | 0.186.0 | MIT |
| @react-three/fiber | 9.8.1 | MIT |
| react, react-dom | 19.3.0 | MIT |
| three-mesh-bvh | 0.9.15 | MIT |
| vite, @vitejs/plugin-react | see SPEC | MIT |
| fflate | 0.8.3 | MIT |
| puppeteer-core | 25.12.0 | Apache-2.0 |
| typescript | 7.0.2 (site pins 6.0.3) | Apache-2.0 |
| axe-core | 4.13.0 | MPL-2.0 (test-time only, not shipped) |
| @react-three/drei | not used (nests three-mesh-bvh ^0.8.3, would add a second copy) | MIT |
| zustand | pulled in by R3F | MIT |

Everything vendored into the packages must carry its licence file (SPEC section 22).

## 12. Corrections and inconsistencies found

1. Terrain triangle counts: recomputed 44,352 (farm), 39,690 (surrounding), 12,976 (stream) from the geometry code, against
   41,472, 39,670 and 10,943 in `PROD/landscape-stream-r33.md`. The record is stale; use the recomputed values (they are
   the exact output of the pilot's own generators).
2. The scene archive's `scene.json.runtimeArchiveSha256` does not equal the sealed runtime zip's SHA-256
   (`4d6902406d186631360770b894b217858c51df27964a1ad9b50b064dd3ced61c`). The per-GLB `runtimeSha256` values do match
   every GLB (verified). Trust `downloads.json` and `delivery.json`; ignore the archive-level field.
3. The sealed `scene.json` says `ownerApprovedAssetCount: 8`, `fullPackAccepted: false` and stage "final owner and
   performance qualification pending", while the owner has since approved all 23 assets.
4. Two asset display names in the pilot `scene.json` are mojibake (encoding damage). The rewrite must not ship `scene.json`
   names to the public runtime.
5. `scene.json` `triangles` are per authored revision and differ from the runtime GLB accessor counts (section 5.1).
6. Version statements: `scene.json.threeVersion`, `vendor-build.json`, the renderer label and pack documents say
   0.186.1. The rewrite pins 0.186.0 (section 9).
7. Site copy says mobile supports orbit viewing only; it will be wrong once mobile play ships. The site owner must update it.
8. `layout.presentation.grass.quality = [7000, 14000]` exists in the data; the runtime never reads it (it uses
   `quality.grassFraction`). Whether any tooling reads it is unverified.
9. `farm-scene-r3f/` was named in the first brief; it was superseded by the monorepo `scenes/` and was never created.
10. Website version pins: the website pins TypeScript 6.0.3; the owner says 7.0.2. Unresolved (SPEC section 3).

## 13. Unverified items (do not rely on them)

1. R3F 9.8.1 with three 0.186.0 `WebGPURenderer` through the async `gl` factory in a real browser (spike M0).
2. Whether `renderer.info.memory` returns to baseline on WebGPU after unmount, and whether the WebGPU device is destroyed
   by `renderer.dispose()`.
3. The consequence of hunk 2 (buffer-size refresh) on 0.186.0 after a pixel-ratio or resize change.
4. Whether the woodland tangent defect is visible (needs an A/B render).
5. Why nine, not up to fifteen, tangent derivatives were recorded.
6. Tablet adapter strings for the Galaxy Tab S9 FE.
7. CORS and cache headers on `assets.kilnstudio.tools`.
8. Static collision triangle count and BVH build time.
9. TypeScript 7.0.2 compatibility with Vite, Astro and the type packages.
10. Parity-screenshot pixel thresholds (calibrate with an old-versus-old noise floor).
11. Headless Chrome WebGPU flags for the test machine.
12. Bundle size and budget of the self-contained build.
13. r34 farmhouse behaviour on `enteredHouse` and the floor probe.
14. Whether R3F's shallow scene disposal leaves geometry, material and texture disposal to the kit (assumed: yes).
15. Whether the hub is currently available (last status 2026-02-08).
16. Quality-tier heuristics beyond the two measured phones and one tablet.
17. The proposed performance targets in SPEC section 20 (proposals, not measurements).
18. Whether three calls `updateProjectionMatrix()` on shadow cameras itself (SPEC tells the kit to call it).
19. Whether Field Grass sets shadow flags on its meshes and whether it reads viewport size.
20. Whether `grassAllowed` is called anywhere at run time.
21. `next-farm-goal.md` content.

## Appendix A. Constants

### A.1 Destinations (`play.mjs:75-76`)

| Name | Position (x, y, z) | Yaw (radians) |
|---|---|---|
| yard | 4.7, 0, -7 | pi * .22 |
| house | 12.0, .4, -14 | pi |
| barn | -6.435, 0, -11 | pi / 2 |
| mill | 29, -.25, -29 | pi |
| tractor | -3, 0, -5.4 | pi / 2 |
| paddocks | 9.7, 0, 1.1 | -pi / 2 |
| bridge | 19, 0, -22.7 | pi / 2 |

### A.2 Named views (`layout.views`)

| Name | Position | Target | fov | Flags |
|---|---|---|---|---|
| hero (default) | 54, 45, 62 | 0, 0, -2 | 45 | |
| opposite | -54, 38, -58 | 0, 0, -2 | 45 | |
| top | 0, 78, 0.1 | 0, 0, 0 | 54 | |
| eye-height | 19, 1.7, 32 | 13, 2, -15 | 65 | |
| crops | 0, 10, 37 | 0, 0.5, 26 | 60 | |
| fences | -36, 13, 23 | -13, 1, 10 | 56 | |
| props | 2, 6, 1 | -6, 1, -9 | 52 | |
| watermill-wheel | 30, 3, -19 | 25, 1.4, -26.31 | 45 | asset watermill |
| watermill-interior | 24, 1.5, -28.7 | 27.6, 1.6, -27.6 | 70 | interior, asset watermill |
| house-interior | 6.4, 1.9, -16.4 | 10.6, 3.1, -10.4 | 75 | interior, asset farmhouse |
| house-porch | 12.4, 1.5, -16.2 | 11.1, 3.1, -13.4 | 72 | interior, asset farmhouse |
| house-window-out | 8.6, 1.8, -15.3 | 11, 1.8, -16 | 60 | interior, asset farmhouse |

`interior` views set `controls.maxPolarAngle = pi - .02` (otherwise `.495 pi`). `fov` is applied to the camera; a view without
`fov` uses 40. A view with `asset` also selects that asset in the review panel.

### A.3 Route (`layout.route`, 30 s, linear between points)

| Point | Position | Target |
|---|---|---|
| 0 | 19, 1.7, 32 | -5, 1, 26 |
| 1 | 19, 1.7, 20 | -7, 1, 10 |
| 2 | 19, 1.7, 0 | -8, 2, -18 |
| 3 | 19, 1.7, -6 | 8, 2, -14 |
| 4 | 19, 1.7, -23.5 | 25, 2, -28.2 |

### A.4 Quality profiles (`view-quality.mjs:2-10`)

| Profile | Pixel-ratio cap | Grass fraction | Shadow map | Shadow filter |
|---|---|---|---|---|
| high (default) | 1.5 | 1 | 2048 | PCF |
| balanced | 1 | .5 | 1024 | PCF |
| economy | .75 | .25 | 512 | Basic |

### A.5 Colours and lighting

| Item | Value |
|---|---|
| Background and fog | `0xc0d6d4`; fog 120 to 220 m |
| Hemisphere light | sky `0xffffff`, ground `0x747b67`, intensity 1.4 |
| Sun | `0xffffff`, intensity 2.7, at (25, 42, 20) |
| Environment | RoomEnvironment PMREM sigma .04, intensity .65 |
| Tone mapping | ACES Filmic, exposure .95 |
| Grass palette | dark `#405f37`, light `#819c58`, surround `#768751`, wornEarth `#b99b72`, sunGlow `#c6b96a`; `tipGold .06`, `windReach .18` |
| Path colour | `0xe3c6a0` |
| Meadow earth and moss | `[124, 116, 83]` and `[113, 131, 88]` |
| Stream | body `#739b88` to `#327e80`; foam `#e0ecdc`; sky `#bdd8d7` to `#79aac0` |

### A.6 Herd routines (`herd-motion.mjs`)

| Species | period (s) | walk (s) | radius (m) | speed (m/s) |
|---|---|---|---|---|
| cow | 30 | 9 | .85 | .20 |
| sheep | 22 | 11 | .65 | .20 |
| chicken | 8 | 3.5 | .35 | .24 |

The motion shape is defined by the 23-line module `herd-motion.mjs`; the rewrite ports it unchanged (it depends only
on the instance list and a clip chooser). Update uses `min(.1, dt)` seconds.

### A.7 Other constants

| Item | Value |
|---|---|
| Main camera | fov 40 (views override), near .02, far 250; aspect from canvas |
| Orbit | `maxDistance 160`, `maxPolarAngle .495 pi`, damping off |
| Play camera | fov 58, `maxPolarAngle .54 pi`, offset length 4.8, height .6 or 2.6, target height 1.9 or 1.6 |
| Walk | radius .30, height 1.90, pace 1.05 (1.8 with Shift), gravity 18, terminal -10, step 1/120, accumulator cap .1, clamp +-34.8 |
| Tractor | top speed 4 (reverse 1.8), steer max .45, wheelbase 1.75, bounds +-33, river margin 1.3 (bridge inset .92), probes x = +-.8 |
| Doors | damp 7, interaction radius 2.6 (tractor 2.5) |
| Batching | cell 96 m, offset 48 m, excludes 7 asset ids |
| Woodland | 843 trees, cells 64 m, source meshes 4 |
| Grass | 14,000 tufts, 16 groups of 875, cells 18 m, bounding-sphere radius + 1 |
| Collision | BVH `targetLeafSize 10`, resolve 3 passes, floor probe drop .35 (.25 in the porch rule) |
