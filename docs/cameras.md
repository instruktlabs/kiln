# Choose useful views

A render starts with six orthographic views. Change the camera when a joint is hidden, two sides look identical, or a close-up would answer the question faster. Keep passing the same `programRef`; a camera request does not require another copy of the source.

## A smaller sheet

```json
{"programRef":"sha256:<revision>","capture":{"preset":"2x2"}}
```

Available layouts are `1x1`, `1x2`, `2x1`, `3x1`, `2x2`, `3x2`, and `3x3`. For custom orbit angles, use `cells`:

```json
{"programRef":"sha256:<revision>","capture":{"cells":[
  {"azimuthDeg":45,"elevationDeg":25,"name":"Corner"},
  {"azimuthDeg":225,"elevationDeg":-20,"name":"Underside"}
]}}
```

Kiln uses +X forward, +Y up and +Z right. Azimuth 0 looks from the front (+X), 90 from the right (+Z). Positive elevation looks down. Legacy `zoom` is a padding multiplier: larger values show more surrounding space.

`backdrop` names the colour behind every cell: `neutral` grey by default, `dark` when a part that merges with the grey is lighter than it, `light` when it is darker. Choose it from a sheet you have seen, not from the brief. It is one of three fixed entries, never a free colour, so two sheets of one asset differ only where the asset does, and every result echoes the one used as `capture.backdrop`. It applies to both capture shapes, on `kiln_render`, `kiln_edit` and `kiln_view_interior`, and `--backdrop` sets it for a CLI `--views` sheet. `kiln_save` and `kiln save --backdrop` take the same id for the preview they store, and the manifest records it as `preview.backdrop`, so a stored preview matches the sheet that was reviewed.

## Frame a part or place the camera

The versioned capture format supports up to nine `shots`. Use the exact `parts[].path` or a unique `parts[].name` from a render result. These identify evaluated scene nodes, whose names can include generated prefixes. Duplicate names require a path.

Render results preview 24 paths (80 with `detail: "full"`) and report `partsTotal`, `partsTruncated`
and, when needed, `partsNextOffset`. An absent preview entry is not evidence of a
missing exported part. Retrieve the full inventory without generating an image:

```js
kiln_inspect({ programRef: REF, image: false, listParts: { query: "hinge", limit: 80 } });
```

`query` is a case-insensitive substring of the node name or encoded path, not a
regex. Omit it for all nodes, including groups and primitive children. Follow
`partListing.nextOffset` with the same `programRef` and query; `total` counts all
nodes, `matched` counts filtered nodes. The default page has 80 entries; maximum
100. With the CLI, put the same controls (without `programRef`) in a JSON file:
`node kiln.mjs inspect REF --request controls.json --json`. Neither interface
needs a renderer for `image:false` listings. Paths belong to that evaluated revision.

```json
{
  "programRef":"sha256:<revision>",
  "capture":{
    "version":"kiln.capture.v1",
    "cols":2,
    "size":512,
    "shots":[
      {"name":"Overview"},
      {
        "name":"Hinge contact",
        "subject":{"path":"/Asset[0]/Root[0]/Mesh_Hinge[0]"},
        "visibility":"context",
        "camera":{"type":"orbit","relativeTo":"part","azimuthDeg":90,"elevationDeg":15,"padding":1.3}
      }
    ]
  }
}
```

Replace the sample path with one returned for your asset. Paths encode node names and distinguish same-name siblings with occurrence indices. They are scoped to the evaluated revision; a topology-changing edit can change them. The first segment is the glTF scene, which usually repeats the root name (`/Hall[0]/Hall[0]/...`), and each mesh node lists one `<name>:primitive-N` child per material primitive. Those entries are valid selectors but are not exported nodes, so node counts in a listing exceed the GLB's. A versioned capture returns each resolved shot in `cameraShots`, whose `subject.bounds` is that part's world bounds; use it, animation `measureParts` and `measure` instead of parsing the GLB.

`relativeTo` accepts `world`, `asset`, or `part`. Part-local directions follow the selected node's transformed axes. The camera frames its world bounds. `visibility:"context"` retains surrounding geometry; `"isolate"` hides other meshes for that shot. GPU and CPU views both draw only the subject subtree, so an isolated LOD group shows no sibling parts. Inspection does not alter the saved program or exported original asset.

An explicit camera uses world positions in the asset's units:

```json
{"camera":{"type":"explicit","projection":"perspective","position":[4,2,5],"target":[0,1,0],"fovDeg":50}}
```

Use `projection:"orthographic"` and `halfHeight` instead of `fovDeg` for a measured view. Both projections accept `up`, `near`, and `far`. Perspective is implemented in both CPU and GPU rendering; CPU images remain geometry-flat.

Without `near`, an explicit perspective camera sets its near plane to half the distance to the nearest geometry, at least 0.001. That plane clips nothing, and it keeps depth precision on large assets: a 1 mm plane showed false z-fighting between faces 0.3 m apart at 100 m. A locked animation camera keeps the plane short of every sampled pose. Skinned or morphing geometry keeps 0.001. The resolved `near` is echoed with the camera; pass `near` to set it yourself.

An unknown camera key fails with the accepted keys, for example `fov` names `fovDeg`. `kiln_discover` with `capabilities:true` lists the lens and clip fields under `camera`. A subject name that matches several nodes fails with every matching path. A name that matches none suggests similar names before listing paths.

The versioned format uses `shots`, not legacy `preset/cells`. Unknown or conflicting controls fail instead of being silently ignored. Cell size is an integer from 128 to 2048; the capture pixel budget (24M pixels by default) bounds the whole sheet, so nine 2048 px shots are refused. Set `output:"separate"` to return one image per shot; omit it for a grid. Both deliveries preserve shot order and camera metadata.

`size` is the square pixel size of each shot. There are no capture request fields named `width` or `height`; those names occur only in returned grid/image dimensions. Orbit cameras likewise have no `target` or `distance` fields: they derive both from the selected subject's bounds. Select the subject and use `padding` to pull back or crop in. When an exact position or look target matters, use an explicit camera with `position` and `target`.

## Levels of detail

An asset with declared tiers exports each set as one `MSFT_lod` chain: LOD0 stays in the scene, and the lower levels are off-scene nodes whose transforms are relative to LOD0's parent. Default sheets from `kiln_render`, `kiln_inspect` and the `kiln_save` preview draw LOD0, as a loader without the extension does, and the headline triangles and bounds are LOD0's. `levelsOfDetail` in the result lists every chain with each level's `path` and triangles. A lower level's path is the one it takes in LOD0's place.

To view a lower level, make its `path`, a path inside it, or a name only one level carries a shot's subject. The shot draws that level in LOD0's place and frames it; `visibility:"isolate"` shows it alone:

```json
{"name":"Body LOD2","subject":{"path":"/Car[0]/Car[0]/Body_LOD2[0]"},"visibility":"isolate"}
```

Every chain in `levelsOfDetail` carries `drawn`, one entry per view in view order: 0 when the view drew LOD0, otherwise the level the shot's subject named. Only the chain that holds the subject changes level; every other chain draws LOD0. A name that several lower levels share fails with every matching path. The CPU view and the GPU derivative of a shot draw the same level. The legacy `kiln_inspect` `part` field reaches a level by its exact name. Part listings (a render's `parts`, `listParts`) and measurements (`measure`, `surfacePairs`) read the LOD0 scene: they neither list nor measure a lower level's nodes.

## Inspection, edits, interiors and motion

- `kiln_edit` accepts the same `capture`, so an edit can return matched before/after views.
- `kiln_inspect` accepts a single `shot` at 512px. Use it instead of the legacy `part`, `view`, orbit, `zoom`, and `isolate` fields.
- `kiln_view_interior` accepts versioned `capture` after roof removal. Custom shots retain walls; the default three-view preset also removes near walls for its eye-level cutaway.
- `kiln_screenshot_animation` accepts `shot`, `frames` (2–6), or ordered `frameTimes` (1–9 phase fractions from 0 to 1). Do not combine `frames` and `frameTimes`. `framing:"locked"` is the default; it preserves one camera across the sampled motion. Choose `"follow"` to track a subject with a shot. `perFrame:true` returns separate images.

Animation `measureParts` accepts 1–16 `{name}` or `{path}` selectors and returns
world-space bounds for each selected subtree in every `poseBounds.parts` entry.
Selections do not change camera framing; ambiguous names and duplicate selections
fail explicitly. Each entry also gives `origin`, the node's world position. Empty
geometry returns `bounds:null`, so read a locator from `origin`. Use this to compare moving
contacts or attachments together; scene bounds alone cannot establish support.
CLI accepts the same array in `--measure-parts parts.json`. These are sampled
geometry bounds, not continuous collision, balance or physical-contact evidence.

## Comparing edits

`kiln_inspect` accepts `compare: {programRef: OLD_REF, offset: 0, limit: 50}`
alongside the current source/reference and camera controls. It reports exact
exported static geometry, material, rest-transform and bounds changes with GLB
hashes. Follow `comparison.nextOffset` to read every change. Both revisions use
current host settings; comparison does not certify intent, animation or physical
fit. Unsupported or ambiguous structures fail explicitly. See
[the comparison workflow and limits](../skills/kiln-refine-asset/references/revision-and-views.md#compare-exported-revisions).

## What the receipts establish

`cameraShots` describes the resolved world cameras, subject bounds, and visibility. Derivative receipts also carry the camera and `cameraFidelity`: `engine-resolved` for the CPU projection, or `echo-validated` when a GPU service acknowledges the exact requested parameters and dimensions. An echo is a transport check, not independent proof that an arbitrary remote service rendered honest pixels.

Read `viewFidelity` separately before judging textures or materials. A CPU fallback preserves the requested camera while reporting geometry-flat material evidence. A backend that cannot honor the camera cannot silently substitute another projection. `--render gpu` treats GPU failure as failure instead of returning CPU success.

Use the same revision, camera recipe and lighting when comparing geometry. A source hash identifies source bytes; artifact and image identities are separate. Do not infer camera or material fidelity from a cache hit alone.

### Anchor measurements

CLI exposes the shared inspection tool as `kiln inspect <file.js|ref> --request
controls.json --views close.png --json`. The JSON file contains inspection controls
only (`shot`, `measure`, or part/orbit options); source comes from the positional
argument. Images are optional, written atomically, and cannot replace an input file.

`kiln_inspect` accepts `measure: {from: {subject: {path}, point: [x,y,z]}, to: {subject: {path}, point: [x,y,z]}}` alongside its camera controls. Each point uses its selected node's local coordinates. Omit `point` to measure from the node origin. Use ordinary named child groups or pivots as reusable attachment anchors; their returned exact paths distinguish repeated names.

Set `measure.mode: "surface"` to compare two disjoint mesh subjects instead, omitting
`point`. This returns the minimum triangle-surface distance and closest world points
in the exported rest pose. Select the intended interface: unrelated contact
elsewhere in a broad assembly can hide a local gap. Check `measurement.status`;
an incomplete result reports `distance: null` and lower/upper bounds. Narrow the
selection when its 20,000-triangle-per-subject or 250,000-step search budget is
exceeded. The search groups triangles by bounds and visits nearer groups first;
its work limit includes group expansion and individual triangle-pair checks.
`pairsVisited` counts the individual triangle pairs checked.
Skin/morph deformation and unsupported primitive representations are rejected.
Zero distance can mean touching or intersection; positive distance does not exclude
one solid containing another. Neither result certifies physical attachment, solid
clearance, motion or alpha/displacement appearance. The measurement is independent
of image fidelity and does not change QA acceptance.

The result reports both resolved world points and their straight-line distance in asset units. It does not claim surface clearance, contact, collision, or a real-world unit conversion. Exact `shot` inspection also returns `subjectFrame`: local and world bounds, column-major world transform, origin, and normalized local axes expressed in world coordinates. Empty anchor groups have null bounds.

Capture caching is enabled for CPU cells in each public registry, bounded to 64 MiB. Reordering a sheet or changing its column count can reuse unannotated cells. GPU caching requires a host-declared `captureCacheIdentity` that changes with backend code, assets and hidden rendering settings; a hardware name alone is insufficient. Receipts expose `captureCache.reused` and `total`; a successful cache hit retains the original camera/material fidelity. Disable with `cacheCaptures: false`. SDK advanced captures now use the same shot renderer and camera validation and return per-cell derivative receipts.

### Camera experiments

A local RTX 3070/Dawn test rendered tight and wide orthographic views of the same box plus a perspective view. The colored object occupied 18,432 pixels at padding 1.2 and 1,740 at padding 4; changing the sheet from three columns to one reused all three cells. This checks actual projection behavior, beyond an echoed camera receipt.

An eight-azimuth geometric occlusion trial placed a wall in front of a selected part. Center rays were blocked at 0, 45 and 315 degrees and reached the part at the other five angles. This is useful for proposing another view, but a center ray misses partial occlusion and says nothing about materials or attachment quality. Automatic view selection therefore remains an advisory recipe: inspect a suspected part, try a few alternate azimuths, and let the model choose the next capture. No automatic quality claim or hidden camera change is made.

Explicit cameras default to `relativeTo:"world"`. Set it to `"asset"` for the evaluated root's coordinates, or `"part"` for the selected subject's coordinates. Position and target transform as points; up transforms as a direction. `relativeTo:"local"` requires `frame:{origin:[x,y,z],rotation:[xDeg,yDeg,zDeg]}`: a rigid frame in world coordinates, using Euler XYZ rotation in degrees. Omitted origin/rotation components default to zero. `frame` is valid only for local coordinates. Lens distances (`halfHeight`, `near`, `far`) remain world/asset units.

Set `framing:"bounds"` to fit the selected subject along the direction from `target` to `position`. Omit target to use the subject's world-bounds center. Orthographic fitting derives `halfHeight`; supplying both is an error. Perspective fitting uses the requested/default field of view and a conservative bounding sphere. `padding` defaults to 1.2 and applies only to bounds framing. `targetOffset:[x,y,z]` uses the chosen frame's axes: it shifts the look target for explicit framing, and shifts both eye and target for bounds framing. Positive padding pulls back; offsets can intentionally crop geometry.

Hosts can tighten `captureLimits:{maxTotalPixels,maxOutputBytes}` in `KilnToolContext`. The defaults are 24,000,000 cumulative cell-plus-composite pixels and 32 MiB of encoded PNG bytes per response. Model tool arguments cannot raise these limits. Pixel budgets are checked before source evaluation/rendering; output bytes are checked before delivery, for both grids and separate images. PNG headers from GPU producers are bounded before decompression. The SDK's `captureViewsViaPort` accepts the same limits as its fifth argument; `renderViewGrid` accepts `captureLimits` in its options. The one-to-nine shot and 128–1024 cell-size bounds remain additional controls.

### Local GPU cache admission

The CLI and MCP host now configure GPU cell reuse automatically when the renderer supplies a verifiable identity in `/health`. At boot the service hashes its `src` tree (including shaders and presentation presets), the installed `three`, `webgpu` and `pngjs` package contents, Node version, platform/architecture, backend and adapter/driver description. This is a content fingerprint rather than a package version or URL. Each process also has a fresh instance ID, so even a restart with identical code invalidates that process's cached captures.

The host fetches the current identity before every capture and checks it again before admitting a fresh render. A changed identity cannot populate an older cache entry. Unknown, older or unreachable health responses disable reuse; rendering still follows the selected CPU/auto/required-GPU policy. CPU mode performs no renderer probe or GPU initialization. Hashing installed runtime files happens once at renderer boot; ordinary health calls return the recorded identity without rescanning files. Hosts injecting their own render port can still supply a synchronous or asynchronous `captureCacheIdentity` callback.

A rectangular 1200×900 hero render exposed a readback defect despite valid camera receipts: Three/WebGPU returned 4,864-byte aligned rows, while the PNG path copied them as 4,800-byte rows, producing diagonal stripes. The service now removes row padding before encoding. Regression fixtures cover unaligned widths, packed/aligned arrays and byte offsets; the same station GLB/camera was rerendered at 1200×900 and visually verified after the fix. This is why camera echoes remain transport evidence rather than independent pixel validation.
